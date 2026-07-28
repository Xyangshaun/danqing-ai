// ============================================================
// 混合分析编排器(Jimp 客观 + AI 语义)
// 对应文档:.trae/documents/ai-integration-design.md §2 混合分析管线设计
//
// 职责:
//   1. 编排 Jimp 像素分析 + AI 视觉分析
//   2. 合并结果:Jimp 提供客观数据,AI 提供语义增强
//   3. 应用 score_adjustments(delta clamp ±5)
//   4. Fallback 策略:AI 失败时仅返回 Jimp 结果
//   5. 返回 HybridAnalysisResult(扩展 AnalysisResult,向后兼容)
//
// 编排策略(决策说明):
//   设计文档 §2.2 原方案为 Promise.allSettled 并行,但 §3.2 Prompt 需要 Jimp 客观指标注入。
//   经权衡,采用"顺序编排":先 Jimp(~500ms)→ 提取指标 → 再 AI(~2s)。
//   理由:
//     1. Prompt 工程设计明确要求注入 Jimp 客观数据(视觉重心/留白比/主色调等)
//     2. AI 在有客观数据校准参考时,评分更准确、建议更具体
//     3. 总耗时 ~2.5s(Jimp 500ms + AI 2000ms)< 3s SLA,满足硬约束
//     4. AI 超时 2.5s 切断,最坏情况总耗时 ~3s(Jimp 500ms + 超时 2500ms),边界可接受
//
// 合并策略(对应设计文档 §2.2):
//   - Jimp 成功 + AI 成功 → 合并增强(应用 score_adjustments,delta ±5)
//   - Jimp 成功 + AI 失败 → 仅 Jimp(aiEnhanced=false)
//   - Jimp 失败 + AI 成功 → Jimp fallback 兜底 + AI 语义增强(不应用 score_adjustments)
//   - Jimp 失败 + AI 失败 → Jimp fallback 兜底(aiEnhanced=false)
// ============================================================

import type { ArtType, AnalysisResult } from '../types/api-contract.js';
import type {
  HybridAnalysisResult,
  AIVisionResult,
  AIVisionRequest,
  AIInvocationMeta,
  AIFailureReason,
} from '../types/ai-analysis.js';
import { createDisabledAIMeta } from '../types/ai-analysis.js';
import { analyzeImage, generateFallbackAnalysis } from './analysis-engine.service.js';
import {
  analyzeWithAI,
  isAIEnabled,
  extractJimpMetricsFromResult,
  type AIVisionCallResult,
} from './ai-vision.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1. 主入口:runHybridAnalysis
// ============================================================

/**
 * 混合分析请求参数
 */
export interface HybridAnalysisRequest {
  /** 图片源:本地文件路径或 URL */
  imageSource: string;
  /** 作品类型 */
  artType: ArtType;
  /** 作品标题(可选,注入 AI prompt) */
  title?: string;
  /** 备注(可选,如教师布置的作业要求) */
  remark?: string;
}

/**
 * 执行混合分析(Jimp + AI)
 *
 * 编排顺序:
 *   1. AI 功能检查:未启用 → 仅 Jimp
 *   2. Jimp 像素分析(~500ms)
 *   3. 提取 Jimp 指标,构造 AI 请求
 *   4. AI 视觉分析(~2s,超时 2.5s 切断)
 *   5. 合并结果(应用 score_adjustments)
 *   6. 返回 HybridAnalysisResult
 *
 * @returns HybridAnalysisResult 始终非空(最坏情况返回 Jimp fallback)
 */
export async function runHybridAnalysis(
  req: HybridAnalysisRequest,
): Promise<HybridAnalysisResult> {
  const cfg = env();
  const model = cfg.aiApiModel;

  // 第一道防线:AI 功能未启用 → 仅 Jimp 分析
  if (!isAIEnabled()) {
    logger.debug(
      { aiEnabled: cfg.aiEnabled, hasKey: cfg.aiApiKey.length > 0 },
      '[ai-analysis] AI disabled, running Jimp-only',
    );
    const jimpResult = await safeJimpAnalyze(req.imageSource, req.artType);
    return wrapAsHybridResult(jimpResult, createDisabledAIMeta(model));
  }

  // 第二步:Jimp 像素分析(始终执行,作为客观指标来源 + fallback 兜底)
  const jimpStartMs = Date.now();
  const jimpResult = await safeJimpAnalyze(req.imageSource, req.artType);
  const jimpDurationMs = Date.now() - jimpStartMs;

  // 第三步:构造 AI 请求(注入 Jimp 客观指标)
  const jimpMetrics = extractJimpMetricsFromResult(jimpResult);
  const aiReq: AIVisionRequest = {
    imageSource: req.imageSource,
    artType: req.artType,
    jimpMetrics,
    title: req.title,
    remark: req.remark,
  };

  // 第四步:AI 视觉分析(超时 2.5s 切断)
  const aiCallResult = await analyzeWithAI(aiReq);

  // 第五步:合并结果
  const merged = mergeResults(jimpResult, aiCallResult, req.artType, model, jimpDurationMs);

  logger.info(
    {
      artType: req.artType,
      aiEnhanced: merged.aiEnhanced,
      jimpDurationMs,
      aiDurationMs: merged.aiMeta.aiDurationMs,
      totalDurationMs: jimpDurationMs + merged.aiMeta.aiDurationMs,
      overallScore: merged.overallScore,
      aiFailureReason: merged.aiMeta.aiFailureReason,
    },
    '[ai-analysis] hybrid analysis completed',
  );

  return merged;
}

// ============================================================
// 2. Jimp 安全调用(异常时返回 fallback)
// ============================================================

/**
 * 安全执行 Jimp 分析
 * - 成功:返回 AnalysisResult
 * - 失败:返回 generateFallbackAnalysis(保证接口可用)
 *
 * 注:analyzeImage 内部已捕获异常并返回 fallback,
 *   此处再包一层 try-catch 作为终极兜底(理论上不会进入)
 */
async function safeJimpAnalyze(
  imageSource: string,
  artType: ArtType,
): Promise<AnalysisResult> {
  try {
    return await analyzeImage(imageSource, artType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: msg, artType, imageSource },
      '[ai-analysis] Jimp analyze threw unexpectedly, using fallback',
    );
    return generateFallbackAnalysis(artType);
  }
}

// ============================================================
// 3. 结果合并策略
// ============================================================

/**
 * 合并 Jimp 与 AI 结果
 *
 * 策略矩阵:
 *   Jimp 成功 + AI 成功 → 合并增强(应用 score_adjustments)
 *   Jimp 成功 + AI 失败 → 仅 Jimp(aiEnhanced=false)
 *   Jimp 失败 + AI 成功 → Jimp fallback 兜底 + AI 语义增强(不应用 score_adjustments)
 *   Jimp 失败 + AI 失败 → Jimp fallback 兜底(aiEnhanced=false)
 *
 * @param jimpResult Jimp 分析结果(可能为 fallback)
 * @param aiCallResult AI 调用结果
 * @param artType 作品类型
 * @param model AI 模型名
 * @param jimpDurationMs Jimp 耗时(用于日志)
 */
function mergeResults(
  jimpResult: AnalysisResult,
  aiCallResult: AIVisionCallResult,
  artType: ArtType,
  model: string,
  jimpDurationMs: number,
): HybridAnalysisResult {
  // 构造 AI 元信息
  const aiMeta: AIInvocationMeta = {
    aiSuccess: aiCallResult.success,
    aiDurationMs: aiCallResult.durationMs,
    aiFailureReason: aiCallResult.failureReason,
    aiModel: model,
    aiInvokedAt: new Date().toISOString(),
    aiTokenUsage: aiCallResult.tokenUsage,
  };

  // 情况 1:AI 失败 → 仅 Jimp,不合并
  if (!aiCallResult.success || !aiCallResult.result) {
    return wrapAsHybridResult(jimpResult, aiMeta);
  }

  // 情况 2:AI 成功 → 合并增强,应用 score_adjustments
  const aiVision = aiCallResult.result;
  const mergedResult = applyScoreAdjustments(jimpResult, aiVision);

  logger.debug(
    {
      artType,
      jimpDurationMs,
      aiDurationMs: aiCallResult.durationMs,
      overallDelta: aiVision.scoreAdjustments.overallDelta,
      originalOverallScore: jimpResult.overallScore,
      adjustedOverallScore: mergedResult.overallScore,
      dimensionAdjustments: aiVision.scoreAdjustments.dimensionAdjustments.length,
    },
    '[ai-analysis] merged with AI enhancements',
  );

  return {
    ...mergedResult,
    aiEnhanced: true,
    aiVisionResult: aiVision,
    aiMeta,
  };
}

// ============================================================
// 4. 评分校准应用(delta clamp ±5)
// ============================================================

/**
 * 应用 AI 评分校准到 Jimp 结果
 * - 维度级:匹配 dimension name,应用 delta(每维度 score clamp [0, 100])
 * - 整体级:overallDelta 应用到 overallScore(clamp [0, 100])
 *
 * @returns 新的 AnalysisResult(不修改原对象)
 */
export function applyScoreAdjustments(
  jimpResult: AnalysisResult,
  aiVision: AIVisionResult,
): AnalysisResult {
  const { dimensionAdjustments, overallDelta } = aiVision.scoreAdjustments;

  // 浅克隆 + 调整 dimensions(深克隆以修改 score)
  const adjustedDims = applyDimensionAdjustments(jimpResult.dimensions, dimensionAdjustments);

  // 调整 overallScore(应用 overallDelta,clamp [0, 100])
  const adjustedOverall = clampScore(jimpResult.overallScore + overallDelta);

  return {
    ...jimpResult,
    dimensions: adjustedDims,
    originality: jimpResult.originality, // 原创性不调整(AI 不评估原创性)
    overallScore: adjustedOverall,
  };
}

/**
 * 应用维度级评分校准
 * 遍历 dimensionAdjustments,匹配维度名(模糊匹配),应用 delta
 */
function applyDimensionAdjustments(
  dims: AnalysisResult['dimensions'],
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
): AnalysisResult['dimensions'] {
  if (adjustments.length === 0) return dims;

  switch (dims.type) {
    case 'painting':
      return applyPaintingAdjustments(dims, adjustments);
    case 'design':
      return applyDesignAdjustments(dims, adjustments);
    case 'product':
      return applyProductAdjustments(dims, adjustments);
    case 'sculpture':
      return applySculptureAdjustments(dims, adjustments);
    default:
      return dims;
  }
}

/**
 * 模糊匹配维度名(中文/英文均支持)
 * @returns 匹配到的 delta,未匹配返回 0
 */
function matchDimensionDelta(
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
  keywords: string[],
): number {
  let totalDelta = 0;
  for (const adj of adjustments) {
    const dim = adj.dimension.toLowerCase();
    if (keywords.some((kw) => dim.includes(kw.toLowerCase()))) {
      totalDelta += adj.delta;
    }
  }
  // 多个匹配累加后仍 clamp ±5
  return clampDelta5(totalDelta);
}

/** delta clamp 到 [-5, +5] */
function clampDelta5(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-5, Math.min(5, Math.round(n)));
}

/** score clamp 到 [0, 100] */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ============================================================
// 5. 各作品类型的维度调整
// ============================================================

function applyPaintingAdjustments(
  dims: Extract<AnalysisResult['dimensions'], { type: 'painting' }>,
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
): AnalysisResult['dimensions'] {
  const compDelta = matchDimensionDelta(adjustments, ['构图', 'composition', '造型']);
  const colorDelta = matchDimensionDelta(adjustments, ['色彩', 'color', '颜色']);
  const brushDelta = matchDimensionDelta(adjustments, ['笔触', 'brushwork', '技法', '笔法']);
  // 注:第 4 维度"整体与完整"无独立 score 字段,其 delta 已由 scoreAdjustments.overallDelta 统一处理

  return {
    ...dims,
    composition: {
      ...dims.composition,
      score: clampScore(dims.composition.score + compDelta),
    },
    color: {
      ...dims.color,
      score: clampScore(dims.color.score + colorDelta),
    },
    brushwork: {
      ...dims.brushwork,
      score: clampScore(dims.brushwork.score + brushDelta),
    },
  };
}

function applyDesignAdjustments(
  dims: Extract<AnalysisResult['dimensions'], { type: 'design' }>,
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
): AnalysisResult['dimensions'] {
  const hierarchyDelta = matchDimensionDelta(adjustments, ['视觉层次', 'hierarchy', '层次']);
  const typoDelta = matchDimensionDelta(adjustments, ['排版', 'typography', '构成', '网格']);
  const colorDelta = matchDimensionDelta(adjustments, ['色彩', 'color', '颜色']);
  // 注:第 4 维度"创意表达"无独立 score 字段,其 delta 已由 scoreAdjustments.overallDelta 统一处理

  return {
    ...dims,
    visualHierarchy: {
      ...dims.visualHierarchy,
      score: clampScore(dims.visualHierarchy.score + hierarchyDelta),
    },
    typography: {
      ...dims.typography,
      score: clampScore(dims.typography.score + typoDelta),
    },
    colorApplication: {
      ...dims.colorApplication,
      score: clampScore(dims.colorApplication.score + colorDelta),
    },
  };
}

function applyProductAdjustments(
  dims: Extract<AnalysisResult['dimensions'], { type: 'product' }>,
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
): AnalysisResult['dimensions'] {
  const formDelta = matchDimensionDelta(adjustments, ['形态', 'form', '造型', '语义']);
  const materialDelta = matchDimensionDelta(adjustments, ['材质', 'material', '材料']);
  const functionDelta = matchDimensionDelta(adjustments, ['功能', 'function', '结构']);
  // 注:第 4 维度"人机工程"无独立 score 字段,其 delta 已由 scoreAdjustments.overallDelta 统一处理

  return {
    ...dims,
    form: {
      ...dims.form,
      score: clampScore(dims.form.score + formDelta),
    },
    materialExpression: {
      ...dims.materialExpression,
      score: clampScore(dims.materialExpression.score + materialDelta),
    },
    functionExpression: {
      ...dims.functionExpression,
      score: clampScore(dims.functionExpression.score + functionDelta),
    },
  };
}

function applySculptureAdjustments(
  dims: Extract<AnalysisResult['dimensions'], { type: 'sculpture' }>,
  adjustments: Array<{ dimension: string; delta: number; reason: string }>,
): AnalysisResult['dimensions'] {
  const spatialDelta = matchDimensionDelta(adjustments, ['空间', 'spatial', '构成']);
  const bodyDelta = matchDimensionDelta(adjustments, ['形体', 'body', '动态', '张力']);
  const materialDelta = matchDimensionDelta(adjustments, ['材料', 'material', '肌理']);
  // 注:第 4 维度"观念表达"无独立 score 字段,其 delta 已由 scoreAdjustments.overallDelta 统一处理

  return {
    ...dims,
    spatialComposition: {
      ...dims.spatialComposition,
      score: clampScore(dims.spatialComposition.score + spatialDelta),
    },
    bodyLanguage: {
      ...dims.bodyLanguage,
      score: clampScore(dims.bodyLanguage.score + bodyDelta),
    },
    materialLanguage: {
      ...dims.materialLanguage,
      score: clampScore(dims.materialLanguage.score + materialDelta),
    },
  };
}

// ============================================================
// 6. 工具:包装为 HybridAnalysisResult(AI 失败/禁用场景)
// ============================================================

/**
 * 将 AnalysisResult 包装为 HybridAnalysisResult
 * 用于 AI 失败/禁用场景,aiEnhanced=false,aiVisionResult=null
 */
function wrapAsHybridResult(
  result: AnalysisResult,
  aiMeta: AIInvocationMeta,
): HybridAnalysisResult {
  return {
    ...result,
    aiEnhanced: false,
    aiVisionResult: null,
    aiMeta,
  };
}

// ============================================================
// 7. 工具:从 HybridAnalysisResult 中提取 aiEnhanced 标识(供 controller 使用)
// ============================================================

/**
 * 判断 AnalysisResult 是否为 HybridAnalysisResult 且经过 AI 增强
 * 用于 controller 响应中追加 aiEnhanced 字段
 */
export function isAIEnhancedResult(result: unknown): result is HybridAnalysisResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'aiEnhanced' in result &&
    'aiMeta' in result &&
    (result as HybridAnalysisResult).aiEnhanced === true
  );
}

/**
 * 安全获取 AI 失败原因(供 controller 日志/响应)
 * 非 HybridAnalysisResult 或 AI 成功时返回 null
 */
export function getAIFailureReason(result: unknown): AIFailureReason | null {
  if (
    typeof result === 'object' &&
    result !== null &&
    'aiMeta' in result
  ) {
    const meta = (result as HybridAnalysisResult).aiMeta;
    return meta.aiSuccess ? null : meta.aiFailureReason;
  }
  return null;
}
