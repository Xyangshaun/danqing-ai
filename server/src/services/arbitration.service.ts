// ============================================================
// 仲裁业务服务(Phase 5 核心算法)
// 对应文档:new-features-design.md §3.2, §3.3, §3.4
//          art-evaluation-research.md §3.1, §3.3, §3.5
//
// 职责:
//   1. checkDispute(reviews):判定争议级别 → 创建 DisputeCase
//   2. resolveDispute(disputeId, rule):按规则加权裁定 → 写 finalScore
//   3. applyResultToAnalysis(disputeId):手动回写 Analysis.overallScore
//
// 算法要点:
//   - 触发判定:veto > high > general > consistent
//   - 加权权重:professor 0.5 / lecturer 0.3 / ai 0.2(常规)
//   - 离群折半:与中位数差值 > outlierDiff(25)的评委权重 ×0.5
//   - AI 置信度降级:confidence<0.6 权重降至 0.1
//   - 边界就低:加权分落边界±1 内「就低」定档
// ============================================================

import { disputeRepository } from '../repositories/dispute.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { analysisRepository } from '../repositories/analysis.repository.js';
import { tenantArbitrationService } from './tenant-arbitration.service.js';
import { BusinessError } from '../middlewares/error-handler.js';
import {
  ErrorCode,
  type ReviewRecordSummary,
  type DisputeCheckResponse,
  type DisputeCaseDetail,
  type ResolveDisputeRequest,
  type ApplyDisputeResultResponse,
  type RequestDisputeResponse,
  type UserRole,
} from '../types/api-contract.js';
import {
  type ArbitrationConfig,
  type DisputeLevel,
  type DisputeTriggerReason,
  type DisputeFinalScore,
  type ReviewerType,
  type ReviewScores,
  scoreToGrade,
  applyBoundaryTolerance,
} from '../types/arbitration.js';
import { logger } from '../utils/logger.js';
import type { Prisma, DisputeCase, ReviewRecord } from '@prisma/client';

/**
 * 内部评审记录视图(从 ReviewRecord DB 模型适配)
 */
interface ReviewView {
  id: string;
  reviewerId: string | null;
  reviewerType: ReviewerType;
  scores: ReviewScores;
  confidence: number | null;
}

/**
 * 将 Prisma ReviewRecord 转为 ReviewView
 */
function toReviewView(r: ReviewRecord): ReviewView {
  const scores = r.scores as unknown as ReviewScores;
  return {
    id: r.id,
    reviewerId: r.reviewerId,
    reviewerType: r.reviewerType as ReviewerType,
    scores,
    confidence: r.confidence,
  };
}

class ArbitrationServiceClass {
  // ============================================================
  // 1. checkDispute:判定争议级别 + 创建 DisputeCase
  // ============================================================

  /**
   * 检查争议并创建案件(若触发)
   * @param analysisId 分析任务 ID
   * @param tenantId 租户 ID(强制隔离)
   * @returns DisputeCheckResponse
   */
  async checkDispute(analysisId: string, tenantId: string): Promise<DisputeCheckResponse> {
    // 1. 查询已提交评审
    const records = await reviewRepository.listSubmittedByAnalysis(analysisId);
    const reviews = records.map(toReviewView);

    if (reviews.length < 2) {
      return {
        triggered: false,
        level: null,
        reason: null,
        disputeCaseId: null,
        reviewCount: reviews.length,
      };
    }

    // 2. 判定级别(读取租户生效仲裁配置:DB 持久化优先,memory 二级缓存,解决 R-1)
    const cfg = await tenantArbitrationService.getEffectiveConfig(tenantId);
    const { level, reason } = this.determineLevel(reviews, cfg);

    // 3. 一致(consistent):不触发争议
    if (level === 'consistent') {
      return {
        triggered: false,
        level,
        reason: {
          totalRange: reason.totalRange,
          dimDiffs: reason.dimDiffs,
          gradeCrossCount: reason.gradeCrossCount,
        },
        disputeCaseId: null,
        reviewCount: reviews.length,
      };
    }

    // 4. 检查是否已存在案件(避免重复创建)
    const existing = await disputeRepository.findByAnalysis(tenantId, analysisId);
    if (existing) {
      logger.info({ disputeId: existing.id, analysisId }, '[arbitration] dispute already exists');
      return {
        triggered: true,
        level: existing.triggerLevel as DisputeLevel,
        reason: existing.triggerReason as unknown as {
          totalRange: number;
          dimDiffs: Record<string, number>;
          gradeCrossCount: number;
        },
        disputeCaseId: existing.id,
        reviewCount: reviews.length,
      };
    }

    // 5. 创建 DisputeCase
    const dispute = await disputeRepository.create({
      analysisId,
      tenantId,
      triggerLevel: level,
      triggerReason: reason as unknown as Prisma.InputJsonValue,
      arbitrationConfig: cfg as unknown as Prisma.InputJsonValue,
      status: 'open',
    });

    // 6. 关联评审记录
    await disputeRepository.attachReviews(dispute.id, reviews.map((r) => r.id));

    logger.info(
      { disputeId: dispute.id, analysisId, level, reviewCount: reviews.length },
      '[arbitration] dispute case created',
    );

    return {
      triggered: true,
      level,
      reason: {
        totalRange: reason.totalRange,
        dimDiffs: reason.dimDiffs,
        gradeCrossCount: reason.gradeCrossCount,
      },
      disputeCaseId: dispute.id,
      reviewCount: reviews.length,
    };
  }

  // ============================================================
  // 1.5 requestDispute:学生申请人工复核
  // ============================================================

  /**
   * 学生申请人工复核(作品所有者主动发起)
   *
   * 与 checkDispute 的区别:
   *   - checkDispute 依赖 ≥2 条已提交评审做自动触发判定(教师侧调用)
   *   - requestDispute 由学生主动发起,直接创建 general 级 open 案件,
   *     等待教师在争议中心接手评审与裁定(复用现有仲裁闭环)
   *
   * 安全约束:
   *   - student 角色强制校验作品归属(analysis.userId === requesterId)
   *   - teacher/admin/owner 可为租户内任意分析发起(代申请场景)
   *   - 分析须已完成(status=completed)才可申请
   *   - 同一分析存在进行中(open/reviewing)案件时拒绝重复申请(409)
   *
   * @param analysisId 分析任务 ID
   * @param tenantId 租户 ID(强制隔离)
   * @param requesterId 申请人 ID(从 JWT)
   * @param role 申请人角色(从 JWT)
   * @param reason 申请理由(10-500 字,controller 已校验)
   */
  async requestDispute(
    analysisId: string,
    tenantId: string,
    requesterId: string,
    role: UserRole,
    reason: string,
  ): Promise<RequestDisputeResponse> {
    // 1. 校验分析归属租户(多租户隔离)
    const analysis = await analysisRepository.findById(tenantId, analysisId);
    if (!analysis) {
      throw new BusinessError(ErrorCode.ANALYSIS_NOT_FOUND, '分析任务不存在', 404);
    }

    // 2. 学生只能为自己的作品申请(越权防护)
    if (role === 'student' && analysis.userId !== requesterId) {
      logger.warn(
        { analysisId, requesterId, ownerId: analysis.userId },
        '[arbitration] requestDispute rejected: not owner',
      );
      throw new BusinessError(ErrorCode.FORBIDDEN, '只能为自己的作品申请复核', 403);
    }

    // 3. 分析须已成功出分(评分已出,才有复核对象)
    if (analysis.status !== 'success') {
      throw new BusinessError(ErrorCode.PARAM_INVALID, '分析尚未完成,暂不能申请复核', 400);
    }

    // 4. 防重复:已存在进行中(open/reviewing)案件 → 409
    const existing = await disputeRepository.findByAnalysis(tenantId, analysisId);
    if (existing && (existing.status === 'open' || existing.status === 'reviewing')) {
      logger.info(
        { disputeId: existing.id, analysisId, status: existing.status },
        '[arbitration] requestDispute rejected: active dispute exists',
      );
      throw new BusinessError(ErrorCode.DUPLICATE_RESOURCE, '该作品已在复核流程中,请勿重复申请', 409);
    }

    // 5. 创建 DisputeCase(triggerReason 扩展字段记录申请人信息,免改表结构)
    const cfg = await tenantArbitrationService.getEffectiveConfig(tenantId);
    const triggerReason: DisputeTriggerReason = {
      totalRange: 0,
      dimDiffs: {},
      gradeCrossCount: 0,
      requestType: 'manual_review',
      requesterId,
      requestReason: reason,
    };
    const dispute = await disputeRepository.create({
      analysisId,
      tenantId,
      triggerLevel: 'general',
      triggerReason: triggerReason as unknown as Prisma.InputJsonValue,
      arbitrationConfig: cfg as unknown as Prisma.InputJsonValue,
      status: 'open',
    });

    // 6. 关联已有评审(如 AI 评审已存在,一并纳入案件,便于教师对比裁定)
    const records = await reviewRepository.listSubmittedByAnalysis(analysisId);
    if (records.length > 0) {
      await disputeRepository.attachReviews(
        dispute.id,
        records.map((r) => r.id),
      );
    }

    logger.info(
      { disputeId: dispute.id, analysisId, requesterId, role, attachedReviews: records.length },
      '[arbitration] manual review requested',
    );

    return {
      disputeCaseId: dispute.id,
      analysisId,
      status: dispute.status,
      triggerLevel: dispute.triggerLevel as DisputeLevel,
      createdAt: dispute.createdAt.toISOString(),
    };
  }

  /**
   * 判定争议级别(纯函数,可单测)
   * 对应 new-features-design.md §3.3
   */
  determineLevel(
    reviews: ReviewView[],
    cfg: ArbitrationConfig,
  ): { level: DisputeLevel; reason: DisputeTriggerReason } {
    const scores = reviews.map((r) => r.scores.overallScore);
    const totalRange = Math.max(...scores) - Math.min(...scores);

    // 维度级差
    const dimKeys = Object.keys(reviews[0]!.scores.dimensions);
    const dimDiffs: Record<string, number> = {};
    for (const key of dimKeys) {
      const dimScores = reviews.map((r) => r.scores.dimensions[key]?.score ?? 0);
      dimDiffs[key] = Math.max(...dimScores) - Math.min(...dimScores);
    }
    const maxDimDiff = Math.max(...Object.values(dimDiffs));
    const highDiffDimCount = Object.values(dimDiffs).filter(
      (d) => d >= cfg.triggers.generalDisputeDimDiff,
    ).length;

    // 跨档判定
    const grades = scores.map((s) => scoreToGrade(s));
    const gradeSet = new Set(grades);
    const gradeCrossCount = gradeSet.size - 1;

    // 否决触发:任一评委判 E(<60)且其余判 A(≥90)
    const hasVeto = grades.includes('E') && grades.includes('A');
    const vetoDetail = hasVeto
      ? {
          lowGrade: Math.min(...scores),
          highGrade: Math.max(...scores),
        }
      : undefined;

    const reason: DisputeTriggerReason = {
      totalRange,
      dimDiffs,
      gradeCrossCount,
      vetoDetail,
    };

    // 判定(优先级从高到低)
    if (hasVeto) return { level: 'veto', reason };
    if (
      totalRange >= cfg.triggers.highDisputeTotalRange ||
      highDiffDimCount >= cfg.triggers.highDisputeDimCount ||
      gradeCrossCount >= cfg.triggers.gradeCrossTierHigh
    ) {
      return { level: 'high', reason };
    }
    if (
      totalRange >= cfg.triggers.generalDisputeTotalRange ||
      maxDimDiff >= cfg.triggers.generalDisputeDimDiff
    ) {
      return { level: 'general', reason };
    }
    if (
      totalRange <= cfg.triggers.consistentTotalRange &&
      maxDimDiff <= cfg.triggers.consistentDimDiff
    ) {
      return { level: 'consistent', reason };
    }
    // 中间地带按一般争议处理
    return { level: 'general', reason };
  }

  // ============================================================
  // 2. resolveDispute:加权裁定
  // ============================================================

  /**
   * 裁定争议(按规则计算最终分)
   * @param disputeId 争议案件 ID
   * @param tenantId 租户 ID(强制隔离)
   * @param resolverId 裁定人 ID(从 JWT)
   * @param params 请求参数(rule + 可选 overrideScore)
   */
  async resolveDispute(
    disputeId: string,
    tenantId: string,
    resolverId: string,
    params: ResolveDisputeRequest,
  ): Promise<DisputeCaseDetail> {
    logger.info(
      {
        disputeId,
        tenantId,
        resolverId,
        rule: params.rule,
        hasOverride: Boolean(params.overrideScore),
      },
      '[arbitration] resolveDispute start',
    );

    // 1. 查询案件(强制 tenantId 过滤)
    const dispute = await disputeRepository.findById(tenantId, disputeId);
    if (!dispute) {
      logger.warn({ disputeId, tenantId }, '[arbitration] resolve rejected: dispute not found');
      throw new BusinessError(ErrorCode.PHASE5_DISPUTE_NOT_FOUND, '争议案件不存在', 404);
    }
    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      logger.warn(
        {
          disputeId,
          status: dispute.status,
          resolvedBy: dispute.resolvedBy,
          resolvedAt: dispute.resolvedAt,
        },
        '[arbitration] resolve rejected: already resolved',
      );
      throw new BusinessError(ErrorCode.PHASE5_DISPUTE_ALREADY_RESOLVED, '争议案件已裁定', 409);
    }

    logger.info(
      {
        disputeId,
        status: dispute.status,
        triggerLevel: dispute.triggerLevel,
        reviewCount: dispute.reviews.length,
        reviewerTypes: dispute.reviews.map((r) => r.reviewerType),
      },
      '[arbitration] dispute loaded, resolving',
    );

    // 2. 手动覆盖优先
    let finalScore: DisputeFinalScore;
    if (params.overrideScore) {
      finalScore = {
        overallScore: params.overrideScore.overallScore,
        dimensions: params.overrideScore.dimensions,
        rule: params.rule,
        weightsUsed: {},
      };
      logger.info(
        { disputeId, overrideScore: finalScore.overallScore, note: params.overrideScore.note },
        '[arbitration] using manual override score',
      );
    } else {
      // 3. 按规则计算
      const reviews = dispute.reviews.map(toReviewView);
      const cfg = dispute.arbitrationConfig as unknown as ArbitrationConfig;
      finalScore = this.computeFinalScore(reviews, params.rule, cfg);
      logger.info(
        {
          disputeId,
          rule: params.rule,
          computedOverall: finalScore.overallScore,
          dimensions: finalScore.dimensions,
          weightsUsed: finalScore.weightsUsed,
        },
        '[arbitration] final score computed',
      );
    }

    // 4. 写入 finalScore + 标记评审 superseded
    await disputeRepository.updateFinalScore(tenantId, disputeId, {
      finalScore: finalScore as unknown as Prisma.InputJsonValue,
      finalRule: params.rule,
      resolvedBy: resolverId,
      resolvedAt: new Date(),
      resolutionNote: params.overrideScore?.note ?? null,
      status: 'resolved',
    });

    // 5. 关联评审标记 superseded
    for (const review of dispute.reviews) {
      await reviewRepository.updateStatus(review.id, 'superseded');
    }

    logger.info(
      {
        disputeId,
        rule: params.rule,
        finalScore: finalScore.overallScore,
        supersededReviews: dispute.reviews.length,
      },
      '[arbitration] dispute resolved',
    );

    // 6. 返回最新案件详情
    return this.toDisputeCaseDetail(await disputeRepository.findById(tenantId, disputeId) as DisputeCase);
  }

  /**
   * 计算最终裁定分数(纯函数,可单测)
   * 对应 new-features-design.md §3.4
   */
  computeFinalScore(
    reviews: ReviewView[],
    rule: 'weighted' | 'majority' | 'unanimous',
    cfg: ArbitrationConfig,
  ): DisputeFinalScore {
    if (reviews.length === 0) {
      throw new Error('[arbitration] computeFinalScore 至少需要 1 条评审记录');
    }
    if (rule === 'unanimous') {
      // 一致同意:若所有评审一致则取该分,否则取中位数(降级处理)
      const scores = reviews.map((r) => r.scores.overallScore);
      const firstScore = scores[0]!;
      const allSame = scores.every((s) => s === firstScore);
      const overall = allSame ? firstScore : this.getMedian(scores);
      const dimKeys = Object.keys(reviews[0]!.scores.dimensions);
      const dimensions: Record<string, number> = {};
      for (const key of dimKeys) {
        const dimScores = reviews.map((r) => r.scores.dimensions[key]?.score ?? 0);
        dimensions[key] = allSame ? dimScores[0]! : this.getMedian(dimScores);
      }
      return {
        overallScore: applyBoundaryTolerance(overall, cfg.rules.boundaryTolerance),
        dimensions,
        rule: 'unanimous',
        weightsUsed: {},
      };
    }

    if (rule === 'majority') {
      // 多数决:取中位数
      const scores = reviews.map((r) => r.scores.overallScore);
      const overall = this.getMedian(scores);
      const dimKeys = Object.keys(reviews[0]!.scores.dimensions);
      const dimensions: Record<string, number> = {};
      for (const key of dimKeys) {
        const dimScores = reviews.map((r) => r.scores.dimensions[key]?.score ?? 0);
        dimensions[key] = this.getMedian(dimScores);
      }
      const weightsUsed: Record<string, number> = {};
      for (const r of reviews) weightsUsed[r.id] = 1 / reviews.length;
      return {
        overallScore: applyBoundaryTolerance(overall, cfg.rules.boundaryTolerance),
        dimensions,
        rule: 'majority',
        weightsUsed,
      };
    }

    // weighted:加权裁定
    return this.weightedResolve(reviews, cfg);
  }

  /**
   * 加权裁定核心算法(纯函数)
   * 对应 new-features-design.md §3.4
   */
  private weightedResolve(
    reviews: ReviewView[],
    cfg: ArbitrationConfig,
  ): DisputeFinalScore {
    if (reviews.length === 0) {
      throw new Error('[arbitration] weightedResolve 至少需要 1 条评审记录');
    }
    // 1. 按评委类型取权重(并处理 AI 置信度降级)
    const rawWeights = reviews.map((r) => {
      if (r.reviewerType === 'professor') {
        return cfg.judgeWeights.regular.professor;
      }
      if (r.reviewerType === 'lecturer') {
        return cfg.judgeWeights.regular.lecturer;
      }
      // AI:置信度低则降级
      if (r.confidence !== null && r.confidence < cfg.edgeCases.aiLowConfidence) {
        return cfg.edgeCases.aiLowConfidenceWeight;
      }
      return cfg.judgeWeights.regular.ai;
    });
    logger.debug(
      {
        reviewers: reviews.map((r, i) => ({
          id: r.id,
          type: r.reviewerType,
          score: r.scores.overallScore,
          confidence: r.confidence,
          rawWeight: rawWeights[i],
        })),
      },
      '[arbitration] weighted: raw weights assigned',
    );

    // 2. 归一化权重(评委缺席时总和可能<1)
    const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
    const normalizedWeights = rawWeights.map((w) => w / totalWeight);

    // 3. 离群分折半(差值 > outlierDiff 的评委权重 ×0.5)
    const scores = reviews.map((r) => r.scores.overallScore);
    const median = this.getMedian(scores);
    const outlierAdjusted = normalizedWeights.map((w, i) => {
      if (Math.abs(reviews[i]!.scores.overallScore - median) > cfg.edgeCases.outlierDiff) {
        return w * cfg.edgeCases.outlierWeightFactor;
      }
      return w;
    });
    const halvedReviewIds = reviews
      .filter((_, i) => outlierAdjusted[i] !== normalizedWeights[i])
      .map((r) => r.id);
    if (halvedReviewIds.length > 0) {
      logger.debug(
        { median, outlierDiff: cfg.edgeCases.outlierDiff, halvedReviewIds },
        '[arbitration] weighted: outlier weights halved',
      );
    }
    // 再次归一化
    const sumAfterOutlier = outlierAdjusted.reduce((a, b) => a + b, 0);
    const finalWeights = outlierAdjusted.map((w) => w / sumAfterOutlier);

    // 4. 加权计算总分
    const weightedOverall = reviews.reduce(
      (sum, r, i) => sum + r.scores.overallScore * finalWeights[i]!,
      0,
    );
    logger.debug(
      {
        finalWeights: finalWeights.map((w) => Math.round(w * 1000) / 1000),
        weightedOverallRaw: Math.round(weightedOverall * 100) / 100,
        boundaryTolerance: cfg.rules.boundaryTolerance,
      },
      '[arbitration] weighted: aggregation done',
    );

    // 5. 维度级加权
    const dimKeys = Object.keys(reviews[0]!.scores.dimensions);
    const weightedDims: Record<string, number> = {};
    for (const key of dimKeys) {
      const weighted = reviews.reduce(
        (sum, r, i) => sum + (r.scores.dimensions[key]?.score ?? 0) * finalWeights[i]!,
        0,
      );
      weightedDims[key] = applyBoundaryTolerance(weighted, cfg.rules.boundaryTolerance);
    }

    // 6. 权重映射(reviewerId → weight)
    const weightsUsed: Record<string, number> = {};
    for (let i = 0; i < reviews.length; i++) {
      const review = reviews[i]!;
      const key = review.reviewerId ?? `ai_${review.id}`;
      weightsUsed[key] = Math.round(finalWeights[i]! * 1000) / 1000;
    }

    return {
      overallScore: applyBoundaryTolerance(weightedOverall, cfg.rules.boundaryTolerance),
      dimensions: weightedDims,
      rule: 'weighted',
      weightsUsed,
    };
  }

  /**
   * 计算中位数
   */
  private getMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1]! + sorted[mid]!) / 2;
    }
    return sorted[mid]!;
  }

  // ============================================================
  // 3. applyResultToAnalysis:手动回写 Analysis.overallScore
  // ============================================================

  /**
   * 将争议裁定结果手动回写到 Analysis.overallScore
   * 设计决策 4:不自动回写,需教师确认后调用此端点
   */
  async applyResultToAnalysis(
    disputeId: string,
    tenantId: string,
  ): Promise<ApplyDisputeResultResponse> {
    logger.info({ disputeId, tenantId }, '[arbitration] applyResult start');

    const dispute = await disputeRepository.findById(tenantId, disputeId);
    if (!dispute) {
      logger.warn({ disputeId, tenantId }, '[arbitration] apply rejected: dispute not found');
      throw new BusinessError(ErrorCode.PHASE5_DISPUTE_NOT_FOUND, '争议案件不存在', 404);
    }
    if (!dispute.finalScore) {
      logger.warn(
        { disputeId, status: dispute.status },
        '[arbitration] apply rejected: no finalScore (not resolved yet)',
      );
      throw new BusinessError(ErrorCode.PHASE5_DISPUTE_ALREADY_RESOLVED, '争议案件尚未裁定', 409);
    }

    const finalScore = dispute.finalScore as unknown as DisputeFinalScore;

    // 回写前读取旧值(便于日志对比 + 存在性校验)
    const analysis = await analysisRepository.findById(tenantId, dispute.analysisId);
    if (!analysis) {
      // 防御:理论上 dispute.analysisId 必然存在,但跨租户/误删场景必须显式暴露而非静默成功
      logger.error(
        { disputeId, analysisId: dispute.analysisId, tenantId },
        '[arbitration] apply failed: analysis not found or cross-tenant',
      );
      return {
        disputeId,
        analysisId: dispute.analysisId,
        appliedScore: finalScore.overallScore,
        applied: false,
      };
    }
    const previousScore = analysis.overallScore;

    // 回写 Analysis.overallScore(强制 tenantId 过滤)
    const updated = await analysisRepository.updateResult(tenantId, dispute.analysisId, {
      overallScore: finalScore.overallScore,
    });
    if (!updated) {
      // updateResult 返回 null = 记录不存在/跨租户(竞态:刚被查出来又被删)
      logger.error(
        { disputeId, analysisId: dispute.analysisId, tenantId },
        '[arbitration] apply failed: updateResult returned null (race delete?)',
      );
      return {
        disputeId,
        analysisId: dispute.analysisId,
        appliedScore: finalScore.overallScore,
        applied: false,
      };
    }

    logger.info(
      {
        disputeId,
        analysisId: dispute.analysisId,
        previousScore,
        appliedScore: finalScore.overallScore,
        rule: finalScore.rule,
        resolvedBy: dispute.resolvedBy,
      },
      '[arbitration] result applied to analysis',
    );

    return {
      disputeId,
      analysisId: dispute.analysisId,
      appliedScore: finalScore.overallScore,
      applied: true,
    };
  }

  // ============================================================
  // 4. 查询辅助
  // ============================================================

  /**
   * 获取争议详情(强制 tenantId 过滤)
   */
  async getDispute(tenantId: string, disputeId: string): Promise<DisputeCaseDetail> {
    const dispute = await disputeRepository.findById(tenantId, disputeId);
    if (!dispute) {
      throw new BusinessError(ErrorCode.PHASE5_DISPUTE_NOT_FOUND, '争议案件不存在', 404);
    }
    return this.toDisputeCaseDetail(dispute);
  }

  /**
   * 列出争议(强制 tenantId 过滤)
   */
  async listDisputes(
    tenantId: string,
    query: {
      status?: DisputeCase['status'];
      level?: DisputeLevel;
      analysisId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: DisputeCaseDetail[]; total: number; page: number; pageSize: number }> {
    const result = await disputeRepository.listByTenant({
      tenantId,
      status: query.status,
      level: query.level,
      analysisId: query.analysisId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map((d) => this.toDisputeCaseDetail(d)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ============================================================
  // 私有:DB 模型 → API 契约
  // ============================================================

  private toDisputeCaseDetail(dispute: DisputeCase & { reviews?: ReviewRecord[] }): DisputeCaseDetail {
    const reviews: ReviewRecordSummary[] = (dispute.reviews ?? []).map((r) => {
      const scores = r.scores as unknown as ReviewScores;
      return {
        id: r.id,
        reviewerId: r.reviewerId,
        reviewerName: null, // TODO: join User 表填充姓名
        reviewerType: r.reviewerType as ReviewerType,
        presetId: r.presetId,
        scores: {
          dimensions: scores.dimensions,
          overallScore: scores.overallScore,
        },
        confidence: r.confidence,
        comment: r.comment,
        status: r.status as ReviewRecordSummary['status'],
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      id: dispute.id,
      analysisId: dispute.analysisId,
      triggerLevel: dispute.triggerLevel as DisputeLevel,
      triggerReason: dispute.triggerReason as unknown as DisputeTriggerReason,
      status: dispute.status as DisputeCaseDetail['status'],
      reviews,
      arbitrationConfig: dispute.arbitrationConfig as unknown as ArbitrationConfig,
      finalScore: (dispute.finalScore as unknown as DisputeFinalScore | null) ?? null,
      resolvedBy: dispute.resolvedBy,
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      createdAt: dispute.createdAt.toISOString(),
    };
  }
}

export const arbitrationService = new ArbitrationServiceClass();
