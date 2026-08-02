// ============================================================
// AI 分析业务服务
// 对应 API:POST /analyses + POST /analyses/upload + GET /analyses + GET /analyses/:id + DELETE /analyses/:id
//
// 实现策略(3 秒 SLA):
//   - Jimp 像素分析通常 < 1 秒,走同步模式:直接返回 status=success + 完整 result
//   - Jimp 读取/分析失败时:返回 fallback 结果(仍为 success,保证接口可用)
//   - 配额耗尽:抛 6001 ANALYSIS_QUOTA_EXCEEDED
//   - 图片无效:抛 6005 ANALYSIS_IMAGE_INVALID
//
// 数据落库:
//   - 创建时 status=pending(短暂状态)
//   - 分析完成后 update 为 status=success,写入 result/overallScore/durationMs/completedAt
//   - 失败时 update 为 status=failed,写入 failureReason
//
// RBAC 数据范围过滤(对应 server/src/config/permissions.ts):
//   - listAnalyses:student 强制 WHERE user_id=自己;teacher/admin/owner 租户全量
//   - getAnalysis:student 越权访问他人记录 → 404(不泄露存在性)
//   - deleteAnalysis:teacher/student 仅删自己;admin/owner 删任意
// ============================================================

import { existsSync, promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { analysisRepository } from '../repositories/analysis.repository.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { BusinessError } from '../middlewares/error-handler.js';
import {
  ErrorCode,
  type CreateAnalysisRequest,
  type CreateAnalysisResponse,
  type AnalysisDetail,
  type ListAnalysesQuery,
  type ListAnalysesResponse,
  type ArtType,
  type AnalysisResult,
  type DeleteAnalysisResponse,
  type UserRole,
} from '../types/api-contract.js';
import { canReadTenantWide, canDeleteTenantWide } from '../config/permissions.js';
import { analyzeImage } from './analysis-engine.service.js';
import { runHybridAnalysis } from './ai-analysis.service.js';
import { isAIEnabled } from './ai-vision.service.js';
import { analysisCacheService } from './analysis-cache.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  aiUsageRepository,
  estimateCostYuan,
  resolveEffectiveProvider,
} from '../repositories/ai-usage.repository.js';
import type { Analysis, Tenant } from '@prisma/client';
import type { HybridAnalysisResult } from '../types/ai-analysis.js';

/**
 * 订阅计划对应配额上限
 */
const PLAN_QUOTA: Record<Tenant['plan'], number> = {
  free: 50,
  standard: 2000,
  enterprise: -1, // 无限
};

/**
 * 输入参数:创建分析任务
 * - imageUrl:用户提供的外部图片 URL(与 localImagePath 二选一)
 * - localImagePath:multer 上传到本地的临时文件绝对路径(分析后自动清理)
 * - title / remark:可选元数据
 */
export interface CreateAnalysisInput {
  tenantId: string;
  userId: string;
  body: CreateAnalysisRequest;
  /** 本地上传文件绝对路径(multer 提供);与 body.imageUrl 二选一 */
  localImagePath?: string;
  /** 原始文件名(用于日志审计,可选) */
  originalFileName?: string;
}

class AnalysisServiceClass {
  /**
   * 提交分析任务(URL 模式)
   * 流程:校验配额 → 写 DB(pending) → 调用 Jimp 分析 → 更新 DB(success) → 返回完整结果
   */
  async createAnalysis(params: {
    tenantId: string;
    userId: string;
    body: CreateAnalysisRequest;
  }): Promise<CreateAnalysisResponse> {
    return this.runAnalysis(params);
  }

  /**
   * 提交分析任务(文件上传模式)
   * 流程与 createAnalysis 一致,文件存储策略由 UPLOAD_DIR 配置决定:
   *   - 绝对路径(如 /lhcos-data/uploads,COS挂载):文件持久化保留,URL为 /uploads/xxx
   *   - 相对路径(如 uploads,本地目录):分析完成后自动清理临时文件
   */
  async createAnalysisFromUpload(params: {
    tenantId: string;
    userId: string;
    artType: ArtType;
    localImagePath: string;
    originalFileName?: string;
    title?: string;
    remark?: string;
  }): Promise<CreateAnalysisResponse> {
    const { tenantId, userId, artType, localImagePath, originalFileName, title, remark } = params;
    // 生成可通过 Nginx 访问的 URL 路径(/uploads/文件名),持久化保存到 DB
    const publicUrl = `/uploads/${basename(localImagePath)}`;
    return this.runAnalysis({
      tenantId,
      userId,
      body: {
        artType,
        // 上传到COS挂载目录的文件持久化存储,使用公开访问URL
        imageUrl: publicUrl,
        title,
        remark,
      },
      localImagePath,
      originalFileName,
    });
  }

  /**
   * 查询分析历史(分页)
   * 数据范围过滤(基于 RBAC 权限矩阵):
   *   - student:强制 WHERE user_id = ?(只能看自己的,忽略 query.userId 越权)
   *   - teacher / admin / owner:租户内全量可见(canReadTenantWide=true),
   *     可通过 query.userId 按用户筛选
   *
   * 安全策略:
   *   - tenantId 强制从 JWT 注入(防跨租户)
   *   - 越权 query.userId(student 试图查询他人)被 service 层强制覆盖
   */
  async listAnalyses(params: {
    tenantId: string;
    userId: string;
    role: UserRole;
    query: ListAnalysesQuery;
  }): Promise<ListAnalysesResponse> {
    const { tenantId, userId, role, query } = params;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    // 数据范围过滤:非"租户全量可见"角色强制只能看自己
    // canReadTenantWide(role) === true → teacher/admin/owner
    // canReadTenantWide(role) === false → student,强制 userId=自己,忽略 query.userId
    const effectiveUserId = canReadTenantWide(role) ? query.userId : userId;

    const result = await analysisRepository.list({
      tenantId,
      userId: effectiveUserId,
      artType: query.artType as ArtType | undefined,
      status: query.status as Analysis['status'] | undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      pageSize,
    });

    const items = result.items.map((a) => ({
      id: a.id,
      workType: a.workType as ArtType,
      imageUrl: a.imageUrl,
      title: a.title,
      status: a.status as ListAnalysesResponse['items'][number]['status'],
      overallScore: a.overallScore,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      items,
      total: result.total,
      page,
      pageSize,
      hasMore: page * pageSize < result.total,
    };
  }

  /**
   * 查询单条分析详情
   * 数据范围过滤(基于 RBAC 权限矩阵):
   *   - 跨租户访问 → 404(由 repository findFirst 过滤实现,不泄露存在性)
   *   - student 查询他人记录 → 404(强制 ownership 校验,不泄露存在性)
   *   - teacher / admin / owner 可查询租户内任意记录
   *
   * 安全策略:
   *   - 不返回 403 FORBIDDEN 以免泄露资源存在性
   *   - 越权访问统一返回 404 ANALYSIS_NOT_FOUND
   */
  async getAnalysis(params: {
    tenantId: string;
    analysisId: string;
    userId: string;
    role: UserRole;
  }): Promise<AnalysisDetail> {
    const { tenantId, analysisId, userId, role } = params;
    const analysis = await analysisRepository.findById(tenantId, analysisId);
    if (!analysis) {
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析记录不存在', 404);
    }

    // 数据范围过滤:非"租户全量可见"角色仅可查看自己创建的记录
    // canReadTenantWide(role) === false → student,必须 ownership
    if (!canReadTenantWide(role) && analysis.userId !== userId) {
      // 出于安全,不暴露 403(避免泄露存在性),统一返回 404
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析记录不存在', 404);
    }

    // Phase F1:从持久化的 HybridAnalysisResult 中提取可观测性元信息
    // 注:cacheHit/jimpDurationMs 未持久化,历史记录不返回;aiEnhanced/aiDurationMs 从 result 中提取
    const storedResult = analysis.result as
      | (AnalysisDetail['result'] & { aiEnhanced?: boolean; aiMeta?: { aiDurationMs?: number } })
      | null;
    const storedAiEnhanced = storedResult?.aiEnhanced;
    const storedAiDurationMs = storedResult?.aiMeta?.aiDurationMs;

    return {
      id: analysis.id,
      tenantId: analysis.tenantId,
      userId: analysis.userId,
      workType: analysis.workType as ArtType,
      imageUrl: analysis.imageUrl,
      title: analysis.title,
      remark: analysis.remark,
      status: analysis.status as AnalysisDetail['status'],
      result: analysis.result as AnalysisDetail['result'],
      failureReason: analysis.failureReason,
      durationMs: analysis.durationMs,
      createdAt: analysis.createdAt.toISOString(),
      completedAt: analysis.completedAt?.toISOString() ?? null,
      aiEnhanced: storedAiEnhanced,
      aiDurationMs: storedAiDurationMs,
    };
  }

  /**
   * 删除分析记录
   * 数据范围过滤(基于 RBAC 权限矩阵):
   *   - admin / owner(canDeleteTenantWide=true):可删除租户内任意记录
   *   - teacher / student:仅可删除自己创建的记录(ownership 校验)
   *
   * 路由层权限:requireAnyPermission('analysis:delete:own', 'analysis:delete:tenant')
   *   - teacher 拥有 analysis:delete:own,无 analysis:delete:tenant
   *   - student 拥有 analysis:delete:own,无 analysis:delete:tenant
   *   - admin / owner 拥有两者
   *
   * 安全策略:
   *   - tenantId 强制从 JWT 注入(防跨租户删除)
   *   - 越权删除(teacher/student 删他人记录)统一返回 404(不泄露存在性)
   *   - 审计日志:记录删除操作(operatorUserId / analysisId / ownerId / role)
   */
  async deleteAnalysis(params: {
    tenantId: string;
    analysisId: string;
    operatorUserId: string;
    role: UserRole;
  }): Promise<DeleteAnalysisResponse> {
    const { tenantId, analysisId, operatorUserId, role } = params;

    // 1. 查询记录(强制 tenant_id 过滤,跨租户返回 null)
    const analysis = await analysisRepository.findById(tenantId, analysisId);
    if (!analysis) {
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析记录不存在', 404);
    }

    // 2. 数据范围过滤:非"租户全量删除"角色仅可删除自己的记录
    // canDeleteTenantWide(role) === false → teacher/student,必须 ownership
    if (!canDeleteTenantWide(role) && analysis.userId !== operatorUserId) {
      // 越权删除:统一返回 404(不泄露存在性)
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析记录不存在', 404);
    }

    // 3. 执行删除(repository 内部再次校验 tenant_id)
    const deleted = await analysisRepository.delete(tenantId, analysisId);
    if (!deleted) {
      // 极端情况:并发删除导致记录已被清除
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析记录不存在', 404);
    }

    // 4. 审计日志(对应技术约束:所有写操作必须审计)
    // 不记录敏感信息(imageUrl/title 等),仅记录删除操作的元数据
    logger.info(
      {
        action: 'analysis.delete',
        tenantId,
        analysisId,
        operatorUserId,
        operatorRole: role,
        ownerId: analysis.userId,
        workType: analysis.workType,
      },
      '[audit] analysis deleted',
    );

    return {
      id: analysisId,
      deleted: true,
    };
  }

  // ============================================================
  // 内部:实际执行分析(同步模式)
  // ============================================================

  /**
   * 执行分析的核心逻辑
   * 1. 校验配额
   * 2. 校验图片输入(imageUrl 或 localImagePath 至少一个)
   * 3. 写 DB(pending)
   * 4. 调用 Jimp 分析(同步,< 1s)
   * 5. 更新 DB(success + result + overallScore + durationMs)
   * 6. 清理临时文件(若为上传模式)
   * 7. 返回 CreateAnalysisResponse(包含完整 result)
   */
  private async runAnalysis(params: CreateAnalysisInput): Promise<CreateAnalysisResponse> {
    const { tenantId, userId, body, localImagePath } = params;

    // 1. 校验租户配额(抛 6001 / 3001 / 3002)
    await this.checkQuota(tenantId);

    // 2. 校验图片输入:localImagePath(上传)优先,其次 body.imageUrl
    const hasLocal = !!localImagePath && existsSync(localImagePath);
    const hasUrl = !!body.imageUrl && body.imageUrl.length > 0;
    if (!hasLocal && !hasUrl) {
      throw new BusinessError(
        ErrorCode.PARAM_MISSING,
        '缺少必填参数:imageUrl 或上传图片文件',
        400,
      );
    }
    if (hasLocal && localImagePath) {
      // 校验文件可读
      try {
        await fs.access(localImagePath, fs.constants.R_OK);
      } catch {
        throw new BusinessError(
          ErrorCode.ANALYSIS_IMAGE_INVALID,
          '上传文件不可读',
          400,
        );
      }
    }

    // 3. 决定分析输入源:本地文件路径优先,否则用 imageUrl
    const analysisSource = hasLocal && localImagePath ? localImagePath : body.imageUrl!;
    // body.imageUrl 已由调用方处理:
    //   - JSON模式:直接使用用户提供的外部URL
    //   - 上传模式:createAnalysisFromUpload 已生成 /uploads/xxx 公开访问路径
    const imageUrlForDb = body.imageUrl!;

    // 4. 写 DB(pending)
    const analysis = await analysisRepository.create({
      tenantId,
      userId,
      workType: body.artType as Analysis['workType'],
      imageUrl: imageUrlForDb,
      title: body.title ?? null,
      remark: body.remark ?? null,
    });

    // 5. 调用分析引擎(同步模式,3 秒 SLA)
    // AI_ENABLED=true 时走混合分析(Jimp + AI),否则走 Jimp-only(现有逻辑)
    // Phase 3 优化:优先检查 Redis 缓存(相同图片+类型 → 缓存命中 < 50ms)
    // Phase F1:捕获 jimpDurationMs/aiDurationMs 用于可观测性透传
    const startMs = Date.now();
    let result: AnalysisResult;
    let analysisStatus: 'success' | 'failed' = 'success';
    let failureReason: string | null = null;
    let aiEnhanced = false;
    let cacheHit = false;
    let jimpDurationMs: number | undefined;
    let aiDurationMs: number | undefined;

    try {
      // 缓存优化:通过图片 hash 查找缓存结果
      // 缓存命中时跳过 Jimp+AI 分析,直接返回历史结果(节省配额与时间)
      const isLocal = hasLocal && !!localImagePath;
      const cacheResult = await analysisCacheService.getOrAnalyze(
        analysisSource,
        body.artType,
        isLocal,
        async () => {
          if (env().aiEnabled) {
            // 混合分析:Jimp(~500ms)+ AI(~2s),总耗时 ~2.5s < 3s SLA
            // AI 未配置/失败时 runHybridAnalysis 内部自动 fallback 到 Jimp+模板建议,保证 professionalSuggestions 始终存在
            const hybridStartMs = Date.now();
            const hybridResult = await runHybridAnalysis({
              imageSource: analysisSource,
              artType: body.artType,
              title: body.title,
              remark: body.remark,
            });
            // 从 HybridAnalysisResult.aiMeta 提取 AI 耗时
            // jimpDurationMs 近似为 (混合分析总耗时 - AI 耗时),包含 Jimp + 合并开销
            aiDurationMs = hybridResult.aiMeta.aiDurationMs;
            jimpDurationMs = Math.max(0, (Date.now() - hybridStartMs) - aiDurationMs);

            // 异步记录 AI 用量日志(成功/失败均记录),不阻塞主流程
            // 仅当 AI 实际被调用时记录(aiDurationMs > 0 表示发起了 AI 请求)
            if (aiDurationMs > 0) {
              const providerInfo = resolveEffectiveProvider(env());
              if (providerInfo) {
                const aiMeta = hybridResult.aiMeta;
                const tokenUsage = aiMeta.aiTokenUsage;
                aiUsageRepository
                  .create({
                    tenantId,
                    userId,
                    analysisId: analysis.id,
                    provider: providerInfo.provider,
                    model: providerInfo.model,
                    apiUrl: providerInfo.apiUrl,
                    success: aiMeta.aiSuccess,
                    durationMs: aiMeta.aiDurationMs,
                    promptTokens: tokenUsage?.promptTokens ?? null,
                    completionTokens: tokenUsage?.completionTokens ?? null,
                    totalTokens: tokenUsage?.totalTokens ?? null,
                    costYuan: aiMeta.aiSuccess
                      ? estimateCostYuan(
                          providerInfo.model,
                          tokenUsage?.promptTokens,
                          tokenUsage?.completionTokens,
                        )
                      : null,
                    failureReason: aiMeta.aiFailureReason,
                  })
                  .catch((err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.warn(
                      { err: msg, analysisId: analysis.id },
                      '[analysis] record AI usage log failed (non-blocking)',
                    );
                  });
              }
            }

            return {
              result: hybridResult,
              aiEnhanced: hybridResult.aiEnhanced,
            };
          }
          // Jimp-only 模式(现有逻辑,~500ms)
          const jimpStartMs = Date.now();
          const jimpResult = await analyzeImage(analysisSource, body.artType);
          jimpDurationMs = Date.now() - jimpStartMs;
          aiDurationMs = 0;
          return { result: jimpResult, aiEnhanced: false };
        },
      );

      result = cacheResult.result;
      aiEnhanced = cacheResult.aiEnhanced;
      cacheHit = cacheResult.cacheHit;

      // 缓存命中时无实际计算,耗时归零(可观测性标识)
      if (cacheHit) {
        jimpDurationMs = 0;
        aiDurationMs = 0;
      }

      if (cacheHit) {
        logger.info(
          { analysisId: analysis.id, artType: body.artType, aiEnhanced },
          '[analysis] cache HIT, skipped analysis',
        );
      } else if (isAIEnabled() && aiEnhanced === false) {
        // AI 启用但未增强(AI 失败 fallback 到 Jimp),记录警告
        // 注意:cacheResult.result 此时为 HybridAnalysisResult,需安全访问 aiMeta
        const hybrid = cacheResult.result as HybridAnalysisResult;
        if (hybrid.aiMeta?.aiFailureReason) {
          logger.warn(
            {
              analysisId: analysis.id,
              aiFailureReason: hybrid.aiMeta.aiFailureReason,
              aiDurationMs: hybrid.aiMeta.aiDurationMs,
            },
            '[analysis] AI enhancement failed, fallback to Jimp-only',
          );
        }
      }
    } catch (err) {
      // 兜底:runHybridAnalysis/analyzeImage 内部已捕获异常并返回 fallback,
      // 这里仅作终极兜底(理论上不会进入)
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: msg, analysisId: analysis.id, tenantId, userId, artType: body.artType },
        '[analysis] analyzeImage threw unexpectedly',
      );
      result = this.generateEmptyFallback(body.artType);
      analysisStatus = 'failed';
      failureReason = `分析失败:${msg}`;
    }
    const durationMs = Date.now() - startMs;

    // 6. 更新 DB(success / failed)
    try {
      const updated = await analysisRepository.updateResult(tenantId, analysis.id, {
        status: analysisStatus,
        // AnalysisResult 接口缺少 index signature,Prisma JsonValue 不直接接受,
        // repository 内部已 `as Prisma.InputJsonValue`,这里通过 unknown 中转保证类型安全
        result: result as unknown as Analysis['result'],
        overallScore: result.overallScore,
        durationMs,
        completedAt: new Date(),
        failureReason,
      });
      if (!updated) {
        // 极端情况:并发删除导致更新失败,记录日志但不影响响应
        logger.warn(
          { analysisId: analysis.id, tenantId },
          '[analysis] updateResult returned null (record missing?)',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: msg, analysisId: analysis.id, tenantId },
        '[analysis] failed to persist analysis result',
      );
      // 不抛错:结果已计算,返回给前端;DB 状态留 pending,后台任务可补偿
    }

    // 7. 清理临时文件(仅当上传目录为非持久化本地目录时删除)
    // COS 挂载路径(如 /lhcos-data/uploads)是持久化存储,文件需要保留供前端访问
    // 判断依据:uploadDir 为绝对路径(以 / 开头) → 持久化存储,不删除
    if (hasLocal && localImagePath) {
      const uploadDirConfig = env().uploadDir;
      const isPersistentStorage = uploadDirConfig.startsWith('/');
      if (!isPersistentStorage) {
        this.safeCleanup(localImagePath).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ err: msg, path: localImagePath }, '[analysis] cleanup temp file failed');
        });
      } else {
        logger.debug({ path: localImagePath }, '[analysis] file in persistent storage (COS mounted), kept');
      }
    }

    logger.info(
      {
        analysisId: analysis.id,
        tenantId,
        userId,
        artType: body.artType,
        status: analysisStatus,
        durationMs,
        overallScore: result.overallScore,
        aiEnabled: isAIEnabled(),
        aiEnhanced,
      },
      '[analysis] completed (synchronous)',
    );

    // 8. 返回完整结果(同步模式)
    // 注:CreateAnalysisResponse.result 类型为 AnalysisDetail | null,
    // 但同步模式下我们返回完整 AnalysisDetail 以便前端立即渲染
    // Phase F1:透传 aiEnhanced/cacheHit/jimpDurationMs/aiDurationMs 可观测性元信息
    const detail: AnalysisDetail = {
      id: analysis.id,
      tenantId: analysis.tenantId,
      userId: analysis.userId,
      workType: analysis.workType as ArtType,
      imageUrl: analysis.imageUrl,
      title: analysis.title,
      remark: analysis.remark,
      status: analysisStatus,
      result,
      failureReason,
      durationMs,
      createdAt: analysis.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
      aiEnhanced,
      cacheHit,
      jimpDurationMs,
      aiDurationMs,
    };

    return {
      id: analysis.id,
      status: analysisStatus,
      result: detail,
      durationMs,
    };
  }

  /**
   * 空回退(analyzeImage 异常时的兜底,理论上不会触发)
   */
  private generateEmptyFallback(artType: ArtType): AnalysisResult {
    return {
      artType,
      dimensions: {
        type: artType,
        // 最小结构,具体字段在 controller 序列化时由类型守卫保证
      } as AnalysisResult['dimensions'],
      originality: {
        score: 70,
        similarity: 0.2,
        creativityLevel: 'good',
        suggestion: '分析失败,使用默认评分',
      },
      overallScore: 70,
    };
  }

  /**
   * 安全清理临时文件(不抛错)
   */
  private async safeCleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // 文件可能已被清理或不存在,忽略错误
    }
  }

  /**
   * 配额校验(对应错误码 6001)
   */
  private async checkQuota(tenantId: string): Promise<void> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    if (tenant.status === 'disabled') {
      throw new BusinessError(ErrorCode.TENANT_DISABLED, '租户已被禁用', 403);
    }

    const maxQuota = PLAN_QUOTA[tenant.plan];
    if (maxQuota === -1) return; // enterprise 无限

    const now = new Date();
    const usedQuota = await analysisRepository.countMonthlyUsage(
      tenantId,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );

    if (usedQuota >= maxQuota) {
      throw new BusinessError(
        ErrorCode.ANALYSIS_QUOTA_EXCEEDED,
        `本月分析配额已用完(${usedQuota}/${maxQuota}),请升级订阅`,
        402,
      );
    }
  }
}

export const analysisService = new AnalysisServiceClass();
