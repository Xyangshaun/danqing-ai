// ============================================================
// AI 图像生成业务编排服务(M2-T4)
// 对应文档:.trae/documents/m2-generation-plan-2026-08-07.md
//   - §3.5 任务生命周期(pending→processing→success/failed)
//   - §5 配额与计费规则(独立生成配额 + 限流 + 失败不扣配额 + 用量日志)
//   - §6 内容审核(GeneratedImage.reviewStatus)
//   - §7 教学闭环(生成图一键诊断,预留 M2-T6 接线)
// 对应契约:api-contract.ts §3.17(已冻结,禁止修改)
//
// 职责(把 M2-T2/T3 串起来):
//   1. checkGenerationQuota:独立生成配额校验(§5.2)
//   2. checkRateLimit:单用户 Redis 计数限流(§5.3)
//   3. createGeneration:提交生成(配额→限流→校验输入→落库→入队/同步降级)
//   4. getGeneration:查询任务(RBAC 数据范围过滤 + Redis 最新状态补充)
//   5. processQueueOnce / processGenerationJob:Worker 处理(生命周期 + 审核 + 用量)
//   6. handleReview:内容审核(简单黑名单 flagged 标记,M2-T8 完善)
//   7. recordUsage:用量日志(仅 generateImage 实际调用时记录)
//   8. submitForAnalysis:教学闭环占位(依赖 analysis 模块,M2-T6 接线)
//
// 安全:
//   - 多租户强制 tenantId(repository 已保证,service 透传)
//   - 跨租户/越权统一返回 GENERATION_TASK_NOT_FOUND(不泄露存在性)
//   - 失败不扣配额(配额统计排除 failed,repository 已实现)
//   - 日志不记录完整图片 base64 / 密钥,仅记录 URL/数量/耗时
// ============================================================

import { generationRepository } from '../repositories/generation.repository.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { aiUsageRepository } from '../repositories/ai-usage.repository.js';
import { generationQueueService, type GenerationJob } from './generation-queue.service.js';
import { generateImage, resolveImageAIConfig, type ImageGenerationResult } from './image-generation.service.js';
import { configFeatureService } from './config-feature.service.js';
import { analysisService } from './analysis.service.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { BusinessError } from '../middlewares/error-handler.js';
import { canReadTenantWide } from '../config/permissions.js';
import {
  ErrorCode,
  type ArtType,
  type CreateGenerationRequest,
  type CreateGenerationResponse,
  type GetGenerationResponse,
  type GeneratedImage,
  type GenerationStatus,
  type UserRole,
} from '../types/api-contract.js';
import type { Tenant } from '@prisma/client';

/**
 * 独立生成配额(区别于诊断 PLAN_QUOTA,对应计划 §5.2 方案 B)
 * 生成单次成本更高,采用独立配额护栏,防止挤占诊断配额
 */
const GENERATION_PLAN_QUOTA: Record<Tenant['plan'], number> = {
  free: 10,
  standard: 200,
  enterprise: -1, // 无限
};

/**
 * 单用户生成限流窗口(秒)
 * 对应计划 §5.3(5 次/分钟)与契约 GENERATION_RATE_LIMITED
 */
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * 内容审核黑名单(简单占位实现,对应计划 §6.2;M2-T8 将接入 review.service 完善)
 * 命中黑名单关键词的生成内容标记为 flagged(存疑),不进入一键诊断
 */
const CONTENT_BLACKLIST: readonly string[] = [
  '血腥',
  '暴力',
  '色情',
  '裸露',
  '恐怖主义',
  '违禁品',
];

class GenerationServiceClass {
  /**
   * 提交生成任务
   * 流程:配额校验 → 限流 → 校验输入 → 创建 GenerationTask(pending) → 入队
   *
   * 3 秒 SLA 策略:
   *   - Redis 队列可用:异步入队,立即返回 pending(前端轮询 GET /generation/:id)
   *   - Redis 队列不可用:降级同步模式,直接调用 generateImage 并更新任务为
   *     success/failed(复用 analysis.service 同步/异步降级思路,不阻塞主链路)
   *
   * @returns CreateGenerationResponse(冻结契约)
   */
  async createGeneration(params: {
    tenantId: string;
    userId: string;
    body: CreateGenerationRequest;
  }): Promise<CreateGenerationResponse> {
    const { tenantId, userId, body } = params;

    // 0. 生成功能开关校验(M2-T6,对应计划 §9/门禁 M2-4)
    // 生成功能默认关闭,经 /api/v1/config/features/:featureId 灰度开启
    // 关闭时返回 FORBIDDEN(2004,403),不泄露开关内部逻辑
    if (!configFeatureService.isGenerationEnabled(tenantId)) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'AI 图像生成功能暂未开放,请稍后再试',
        403,
      );
    }

    // 1. 独立生成配额校验(§5)
    await this.checkGenerationQuota(tenantId);

    // 2. 单用户限流(§5.3;Redis 异常时 fail-open,不阻断)
    await this.checkRateLimit(tenantId, userId);

    // 3. 校验输入(text 需 prompt / sketch 需 sketchImageUrl)
    this.validateInput(body);

    // 4. 组装落库字段(count 截断到 GENERATION_MAX_COUNT,artType 默认 painting)
    const artType = body.artType ?? 'painting';
    const count = Math.max(1, Math.min(body.count ?? 1, env().generationMaxCount));

    // 5. 创建 GenerationTask(pending,异步状态机起点)
    const task = await generationRepository.create(tenantId, userId, {
      inputType: body.inputType,
      prompt: body.prompt?.trim() || null,
      sketchImageUrl: body.sketchImageUrl?.trim() || null,
      artType,
      aspect: body.aspect ?? null,
      count,
    });

    // 组装 Worker 消费的任务载荷
    const job: GenerationJob = {
      id: task.id,
      tenantId,
      userId,
      inputType: body.inputType,
      prompt: body.prompt?.trim() || undefined,
      sketchImageUrl: body.sketchImageUrl?.trim() || undefined,
      artType,
      aspect: body.aspect ?? 'square',
      count,
      enqueuedAt: new Date().toISOString(),
    };

    // 6. 同步模式优先(前端快速体验):直接处理并返回最终状态,不入队
    if (body.sync) {
      logger.info(
        { action: 'generation.sync', taskId: task.id, tenantId, userId, artType },
        '[audit] generation task sync mode',
      );
      await this.processGenerationJob(job);
      const processed = await generationRepository.findById(tenantId, task.id);
      return {
        taskId: task.id,
        status: (processed?.status ?? 'failed') as GenerationStatus,
        images: (processed?.images as GeneratedImage[] | null) ?? null,
      };
    }

    // 7. 队列可用性探测:可用走异步,不可用降级同步
    const queueAvailable = await generationQueueService.isAvailable();
    if (queueAvailable) {
      await generationQueueService.enqueue(job);
      logger.info(
        { action: 'generation.enqueue', taskId: task.id, tenantId, userId, artType },
        '[audit] generation task enqueued',
      );
      // 异步模式:立即返回 pending,前端轮询 GET
      return { taskId: task.id, status: 'pending', images: null };
    }

    // 降级同步模式:直接处理并返回最终状态
    logger.warn(
      { taskId: task.id, tenantId },
      '[generation] Redis queue unavailable, fallback to synchronous mode',
    );
    await this.processGenerationJob(job);
    const processed = await generationRepository.findById(tenantId, task.id);
    return {
      taskId: task.id,
      status: (processed?.status ?? 'failed') as GenerationStatus,
      images: (processed?.images as GeneratedImage[] | null) ?? null,
    };
  }

  /**
   * 查询生成任务
   * 数据范围过滤(基于 RBAC,复用 analysis.service.getAnalysis 模式):
   *   - 跨租户 → 404(不泄露存在性)
   *   - student 查询他人记录 → 404(强制 ownership)
   *   - teacher/admin/owner 可查租户内任意
   *
   * Redis 补充:DB 为 pending/processing 时,若 Redis 有最新状态可补充
   * (跨进程轮询加速;Redis 缺失则以 DB 为准)
   */
  async getGeneration(params: {
    tenantId: string;
    generationId: string;
    userId: string;
    role: UserRole;
  }): Promise<GetGenerationResponse> {
    const { tenantId, generationId, userId, role } = params;

    // 强制 tenant_id 过滤,跨租户返回 null → 404
    const task = await generationRepository.findById(tenantId, generationId);
    if (!task) {
      throw new BusinessError(ErrorCode.GENERATION_TASK_NOT_FOUND, '生成任务不存在', 404);
    }
    // student 越权访问他人记录 → 404(不泄露存在性)
    if (!canReadTenantWide(role) && task.userId !== userId) {
      throw new BusinessError(ErrorCode.GENERATION_TASK_NOT_FOUND, '生成任务不存在', 404);
    }

    // DB 为最终真源;pending/processing 时尝试以 Redis 最新状态补充
    let status = task.status as GenerationStatus;
    let images = (task.images as GeneratedImage[] | null) ?? null;
    if (status === 'pending' || status === 'processing') {
      const redisStatus = await generationQueueService.getJobStatus(generationId);
      if (redisStatus?.status === 'success') {
        const redisResult = await generationQueueService.getJobResult(generationId);
        status = 'success';
        images = (redisResult as GeneratedImage[] | null) ?? images;
      } else if (redisStatus?.status === 'failed') {
        status = 'failed';
      }
    }

    return {
      taskId: task.id,
      tenantId: task.tenantId,
      status,
      images,
      failureReason: task.failureReason,
      usedFallback: task.usedFallback,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Worker 轮询入口:处理 1 个任务
   * 供后台 worker(M2-T5/T6 挂定时器)调用
   * @returns 处理的任务数(0 表示队列为空)
   */
  async processQueueOnce(): Promise<number> {
    const job = await generationQueueService.dequeue(0);
    if (!job) return 0;
    await this.processGenerationJob(job);
    return 1;
  }

  /**
   * 处理单个生成任务(Worker 核心)
   * 生命周期:pending→processing(由 dequeue 完成)→success/failed
   *
   * 流程:调用 generateImage(双提供商降级)→ 记录用量日志 → 结果审核 →
   *      Redis markSuccess/markFailed → DB 落库
   *
   * 失败策略:
   *   - generateImage 未成功返回图(双提供商不可用/超时/解析失败) → 标记 failed
   *   - 失败不扣配额(配额统计排除 failed)
   *   - 用量日志仅在 generateImage 实际调用时记录
   */
  async processGenerationJob(job: GenerationJob): Promise<void> {
    const startMs = Date.now();

    // 1. 调用图像生成(双提供商降级,独立 AI_IMAGE_TIMEOUT,不受诊断 2.5s 限制)
    const genResult = await generateImage({
      inputType: job.inputType,
      prompt: job.prompt,
      sketchImageUrl: job.sketchImageUrl,
      artType: job.artType,
      aspect: job.aspect,
      count: job.count ?? 1,
    });

    // 2. 用量日志(仅 generateImage 实际调用时记录,成功/调用失败均记录)
    await this.recordUsage(job, genResult);

    // 3. 失败分支:未成功返回图
    if (!genResult.success || !genResult.imageUrls || genResult.imageUrls.length === 0) {
      const reason = genResult.failureReason ?? 'GENERATION_FAILED';
      await this.markFailed(job, reason);
      return;
    }

    // 4. 内容审核:命中黑名单 → flagged,否则 pending(§6)
    const images = this.handleReview(genResult.imageUrls, job.prompt);

    // 5. Redis 标记成功(供轮询加速;失败静默,不阻断 DB 落库)
    await generationQueueService.markSuccess(job.id, images);

    // 6. DB 持久化(跨进程 GET 以 DB 为准)
    await generationRepository.updateStatus(job.tenantId, job.id, {
      status: 'success',
      images,
      usedFallback: genResult.usedFallback,
      provider: genResult.provider,
      model: genResult.model,
      completedAt: new Date(),
    });

    logger.info(
      {
        action: 'generation.success',
        jobId: job.id,
        tenantId: job.tenantId,
        userId: job.userId,
        imageCount: images.length,
        provider: genResult.provider,
        usedFallback: genResult.usedFallback,
        durationMs: Date.now() - startMs,
      },
      '[audit] generation completed',
    );
  }

  /**
   * 教学闭环(M2-T6 接线,对应计划 §7)
   * 把已审核通过的生成图提交为一次诊断,复用 analysis.service.createAnalysis(URL 模式)。
   *
   * 校验(对应任务要求):
   *   - 生成任务归属:tenantId + userId(多租户 + ownership),否则 6102(不泄露存在性)
   *   - status=success:仅成功任务可一键诊断,否则 6104
   *   - 非 flagged/rejected:审核未通过的图不进入一键诊断,返回 403
   *
   * 接线方式:生成图是 URL(GenerationTask.images[].imageUrl),直接以 imageUrl 调
   *   analysis.service.createAnalysis({ tenantId, userId, body: { artType, imageUrl, title } }),
   *   诊断配额/图片校验/落库/通知均由 analysis 模块内部完成(同步 ≤3s)。
   *
   * @returns 新创建的诊断 { analysisId, status },供前端跳转诊断报告页
   */
  async submitForAnalysis(params: {
    tenantId: string;
    generationId: string;
    userId: string;
    imageUrl: string;
  }): Promise<{ analysisId: string; status: 'pending' | 'success' | 'failed' }> {
    const { tenantId, generationId, userId, imageUrl } = params;

    // 1. 校验生成任务归属(多租户 + ownership,跨租户/越权 → 404 不泄露存在性)
    const task = await generationRepository.findById(tenantId, generationId);
    if (!task || task.userId !== userId) {
      throw new BusinessError(ErrorCode.GENERATION_TASK_NOT_FOUND, '生成任务不存在', 404);
    }

    // 2. 仅成功任务可提交诊断
    if (task.status !== 'success') {
      throw new BusinessError(
        ErrorCode.GENERATION_FAILED,
        '生成任务未成功完成,暂不可提交诊断',
        400,
      );
    }

    // 3. 定位目标生成图并校验审核状态(仅非 flagged/rejected 可一键诊断,§6)
    const images = (task.images as GeneratedImage[] | null) ?? [];
    const target = images.find((img) => img.imageUrl === imageUrl);
    if (!target) {
      throw new BusinessError(
        ErrorCode.GENERATION_FAILED,
        '该生成图不存在于本任务结果中',
        400,
      );
    }
    if (target.reviewStatus === 'flagged' || target.reviewStatus === 'rejected') {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        '该生成图内容审核未通过,不可提交诊断',
        403,
      );
    }

    // 4. 接线 analysis.service:生成图 URL 作为 imageUrl 创建一次诊断(同步 ≤3s)
    const analysis = await analysisService.createAnalysis({
      tenantId,
      userId,
      body: {
        artType: task.artType as ArtType,
        imageUrl,
        title: '生成图一键诊断',
      },
    });

    logger.info(
      {
        action: 'generation.submitForAnalysis',
        generationId,
        analysisId: analysis.id,
        tenantId,
        userId,
        artType: task.artType,
      },
      '[audit] generation submitted to analysis (teaching loop)',
    );

    return { analysisId: analysis.id, status: analysis.status as 'pending' | 'success' | 'failed' };
  }

  // ============================================================
  // 私有实现:配额 / 限流 / 审核 / 用量 / 失败
  // ============================================================

  /**
   * 独立生成配额校验(对应错误码 6101 GENERATION_QUOTA_EXCEEDED)
   * 复用 analysis.service.checkQuota 模式:
   *   - tenant 不存在 → TENANT_NOT_FOUND
   *   - tenant.status=disabled → TENANT_DISABLED
   *   - enterprise 无限(-1)
   *   - 用 generationRepository.countMonthlyGenerateUsage 统计当月 generate 用量
   *     (该统计排除 failed,天然实现"失败不扣配额")
   */
  private async checkGenerationQuota(tenantId: string): Promise<void> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    if (tenant.status === 'disabled') {
      throw new BusinessError(ErrorCode.TENANT_DISABLED, '租户已被禁用', 403);
    }

    const maxQuota = GENERATION_PLAN_QUOTA[tenant.plan];
    if (maxQuota === -1) return; // enterprise 无限

    const now = new Date();
    const usedQuota = await generationRepository.countMonthlyGenerateUsage(
      tenantId,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );

    if (usedQuota >= maxQuota) {
      throw new BusinessError(
        ErrorCode.GENERATION_QUOTA_EXCEEDED,
        `本月生成配额已用完(${usedQuota}/${maxQuota}),请升级订阅`,
        402,
      );
    }
  }

  /**
   * 单用户生成限流(对应错误码 6106 GENERATION_RATE_LIMITED)
   * 用 Redis INCR + EXPIRE 实现固定窗口计数器:
   *   - key: rl:gen:{tenantId}:{userId}
   *   - 窗口 60s,首次 INCR 后设置 EXPIRE
   *   - 超限抛 GENERATION_RATE_LIMITED
   *
   * Redis 异常时 fail-open(无法限流则放行,记录日志),不阻断生成主流程
   */
  private async checkRateLimit(tenantId: string, userId: string): Promise<void> {
    const key = `rl:gen:${tenantId}:${userId}`;
    const limit = env().generationRateLimitPerMin;
    try {
      const current = await redis().incr(key);
      // 首次请求设置窗口过期时间(固定窗口)
      if (current === 1) {
        await redis().expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      if (current > limit) {
        throw new BusinessError(
          ErrorCode.GENERATION_RATE_LIMITED,
          `生成请求过于频繁,请稍后再试(每分钟限 ${limit} 次)`,
          429,
        );
      }
    } catch (err) {
      if (err instanceof BusinessError) throw err;
      // Redis 异常:fail-open(允许通过),仅记录日志
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: msg, tenantId, userId },
        '[generation] rate limit check failed, fail-open',
      );
    }
  }

  /**
   * 校验生成输入(对应错误码 6105 GENERATION_IMAGE_INVALID)
   *   - inputType=text:必须携带 prompt
   *   - inputType=sketch:必须携带 sketchImageUrl
   */
  private validateInput(body: CreateGenerationRequest): void {
    if (body.inputType === 'text' && !body.prompt?.trim()) {
      throw new BusinessError(
        ErrorCode.GENERATION_IMAGE_INVALID,
        '文字模式必须提供 prompt 提示词',
        400,
      );
    }
    if (body.inputType === 'sketch' && !body.sketchImageUrl?.trim()) {
      throw new BusinessError(
        ErrorCode.GENERATION_IMAGE_INVALID,
        '草图模式必须提供 sketchImageUrl 草稿图地址',
        400,
      );
    }
  }

  /**
   * 内容审核(对应计划 §6)
   * review.service 仅承载评审记录,无内容审核函数,此处先实现简单审核:
   *   - 命中黑名单关键词 → reviewStatus=flagged(存疑,不进入一键诊断)
   *   - 未命中 → reviewStatus=pending(由 M2-T8 接入 review.service 完善人工复核)
   * @param imageUrls 生成图 URL 列表
   * @param prompt 生成提示词(用于黑名单过滤)
   * @returns 标记审核状态的 GeneratedImage[]
   */
  private handleReview(imageUrls: string[], prompt?: string): GeneratedImage[] {
    const flagged = this.isFlaggedContent(prompt);
    return imageUrls.map((imageUrl) => ({
      imageUrl,
      reviewStatus: (flagged ? 'flagged' : 'pending') as GeneratedImage['reviewStatus'],
    }));
  }

  /**
   * 黑名单关键词匹配(简单占位实现,M2-T8 完善)
   */
  private isFlaggedContent(text?: string): boolean {
    if (!text) return false;
    return CONTENT_BLACKLIST.some((word) => text.includes(word));
  }

  /**
   * 用量日志(对应计划 §5.3)
   * 仅当 generateImage 实际调用(provider 非空)时记录;未调用(双提供商不可用)不记录。
   * 成功与"调用失败"都记录(便于成本审计),失败不扣配额。
   * 日志记录失败不阻断主流程(非阻塞)。
   */
  private async recordUsage(job: GenerationJob, genResult: ImageGenerationResult): Promise<void> {
    // 双提供商均不可用 → provider 为 null,未实际调用,不记录
    if (!genResult.provider) return;

    // 解析实际生效配置,取 apiUrl 供审计/排查用
    const resolved = resolveImageAIConfig();
    const apiUrl = resolved?.apiUrl ?? '';

    try {
      await aiUsageRepository.create({
        tenantId: job.tenantId,
        userId: job.userId,
        usageType: 'generate',
        generationId: job.id,
        provider: genResult.provider,
        model: genResult.model ?? '',
        apiUrl,
        success: genResult.success,
        durationMs: genResult.durationMs,
        // 图像生成无 token 定价模型,成本估算为 null(后续 M2-T10 可细化)
        costYuan: null,
        failureReason: genResult.failureReason,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: msg, jobId: job.id },
        '[generation] record usage log failed (non-blocking)',
      );
    }
  }

  /**
   * 标记任务失败(Redis markFailed + DB 落库)
   */
  private async markFailed(job: GenerationJob, failureReason: string): Promise<void> {
    await generationQueueService.markFailed(job.id, failureReason);
    await generationRepository.updateStatus(job.tenantId, job.id, {
      status: 'failed',
      failureReason,
      completedAt: new Date(),
    });
    logger.warn(
      {
        action: 'generation.failed',
        jobId: job.id,
        tenantId: job.tenantId,
        userId: job.userId,
        failureReason,
      },
      '[audit] generation failed',
    );
  }
}

export const generationService = new GenerationServiceClass();
