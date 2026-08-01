// ============================================================
// AI 视觉分析类型定义
// 对应文档:.trae/documents/ai-integration-design.md §3 Prompt 工程设计
//
// 设计要点:
//   1. 严格 TypeScript,禁止 any;所有字段显式类型
//   2. AI 返回 JSON 经 Zod schema 校验,缺失字段用默认值填充
//   3. score_adjustments.delta 强制 clamp [-5, +5],防止恶意高分/低分
//   4. HybridAnalysisResult 扩展现有 AnalysisResult,保持向后兼容
//
// 类型层次:
//   AIVisionResult           - AI 视觉分析原始结果(语义层)
//   ScoreAdjustment          - 评分校准(维度级 + 整体级)
//   ProfessionalSuggestion   - (已移至 api-contract.ts,共享类型)
//   ReferenceArtwork         - (已移至 api-contract.ts,共享类型)
//   HybridAnalysisResult     - 混合分析结果(Jimp 客观 + AI 语义)
//   AIFailureReason          - (已移至 api-contract.ts,共享类型)
// ============================================================

import type {
  AnalysisResult,
  ArtType,
  ProfessionalSuggestion,
  ReferenceArtwork,
  AIFailureReason,
  AIInvocationMeta,
} from './api-contract.js';

// 重新导出共享类型(方便其他服务从 ai-analysis.ts 一站式导入)
export type {
  ProfessionalSuggestion,
  ReferenceArtwork,
  AIFailureReason,
  AIInvocationMeta,
} from './api-contract.js';
export type { SuggestionLevel, SuggestionPriority } from './api-contract.js';

// ============ 评分校准类型 ============

/**
 * 维度级评分校准
 * delta 强制 clamp 到 [-5, +5],防止 AI 偏差过大
 */
export interface DimensionAdjustment {
  /** 维度名(需与 AnalysisResult.dimensions 中的维度对应) */
  dimension: string;
  /** 评分调整值,整数,范围 [-5, +5] */
  delta: number;
  /** 校准理由(基于视觉特征) */
  reason: string;
}

/**
 * 整体评分校准
 * 包含维度级 + 整体级调整
 */
export interface ScoreAdjustments {
  /** 维度级校准列表 */
  dimensionAdjustments: DimensionAdjustment[];
  /** 整体评分调整值,整数,范围 [-5, +5] */
  overallDelta: number;
  /** 整体校准理由 */
  overallReason: string;
}

// ============ 专业改进建议类型 ============
// SuggestionLevel / SuggestionPriority / ProfessionalSuggestion
// 已移至 api-contract.ts 作为 API 契约共享类型,此处不再重复定义

// ============ 参考案例类型 ============
// ReferenceArtwork 已移至 api-contract.ts 作为 API 契约共享类型

// ============ AI 视觉分析结果(语义层) ============

/**
 * AI 视觉分析结果
 * 由 GLM-4V 模型返回,经 Zod schema 校验后的结构化结果
 *
 * 字段说明:
 *   - semanticTheme       主题与意境理解(50-100字)
 *   - styleRecognition    风格识别(如"印象派条件色处理")
 *   - professionalSuggestions  专业改进建议(数组,每条含操作+案例+练习)
 *   - scoreAdjustments    评分校准(维度级 + 整体级,delta ±5)
 *   - referenceArtworks   参考案例推荐
 */
export interface AIVisionResult {
  /** 主题与意境理解(50-100字,描述作品传达的主题、情感、意境) */
  semanticTheme: string;
  /** 风格识别(如"印象派条件色处理"/"古典写实明暗塑造"/"极简主义网格构成"等) */
  styleRecognition: string;
  /** 专业改进建议(数组,每条含操作+案例+练习三要素) */
  professionalSuggestions: ProfessionalSuggestion[];
  /** 评分校准(维度级 + 整体级,delta 强制 clamp ±5) */
  scoreAdjustments: ScoreAdjustments;
  /** 参考案例推荐(美术史作品) */
  referenceArtworks: ReferenceArtwork[];
}

// ============ AI 调用元信息 ============
// AIInvocationMeta 已移至 api-contract.ts 作为 API 契约共享类型

// ============ 混合分析结果 ============

/**
 * 混合分析结果
 * 扩展现有 AnalysisResult,追加 AI 语义增强字段
 *
 * 合并策略(对应 ai-integration-design.md §2.2):
 *   - Jimp 成功 + AI 成功 → 合并增强(score_adjustments 微调 ±5)
 *   - Jimp 成功 + AI 失败 → 仅 Jimp(aiEnhanced=false, aiFailureReason 记录原因)
 *   - Jimp 失败 + AI 成功 → AI 提供主结果 + Jimp fallback 兜底
 *   - Jimp 失败 + AI 失败 → 空回退(理论上不会触发)
 *
 * 向后兼容:现有 AnalysisResult 字段全部保留,新增字段为可选
 */
export interface HybridAnalysisResult extends AnalysisResult {
  /** 是否经过 AI 增强(true 表示 AI 成功合并) */
  aiEnhanced: boolean;
  /** AI 视觉分析结果(aiEnhanced=true 时非空) */
  aiVisionResult: AIVisionResult | null;
  /** AI 调用元信息(始终非空,记录调用情况) */
  aiMeta: AIInvocationMeta;
}

// ============ AI 视觉分析请求参数 ============

/**
 * AI 视觉分析请求参数
 */
export interface AIVisionRequest {
  /** 图片 URL(已上传 CDN)或本地文件路径 */
  imageSource: string;
  /** 作品类型 */
  artType: ArtType;
  /** Jimp 客观像素数据(注入 prompt 供 AI 校准参考) */
  jimpMetrics?: JimpMetricsForPrompt;
  /** 作品标题(可选,注入 prompt 上下文) */
  title?: string;
  /** 备注(可选,如教师布置的作业要求) */
  remark?: string;
}

/**
 * 饱和度三级分布(低/中/高比例)
 */
export interface SaturationDistributionForPrompt {
  /** 低饱和比例(0-1) */
  low: number;
  /** 中饱和比例(0-1) */
  mid: number;
  /** 高饱和比例(0-1) */
  high: number;
}

/**
 * 最相似作品信息(pHash 比对结果)
 */
export interface MostSimilarWorkForPrompt {
  /** 作品名称 */
  title: string;
  /** 艺术家 */
  artist: string;
}

/**
 * Jimp 客观像素数据(注入 AI prompt 供校准参考)
 * 这些字段已由 analysis-engine.service.ts 计算得出
 *
 * Phase A 新增字段:构图/色彩/笔触/原创性高级指标,均为可选字段,缺失时有合理默认值
 */
export interface JimpMetricsForPrompt {
  /** 视觉重心坐标(0-1) */
  focusX: number;
  focusY: number;
  /** 留白比例(0-1) */
  whitespaceRatio: number;
  /** 暖色比例(0-1) */
  warmRatio: number;
  /** 冷色比例(0-1) */
  coolRatio: number;
  /** 主色调(中文名,如"鲜艳红色") */
  dominantColor: string;
  /** 平均亮度(0-255) */
  avgLuminance: number;
  /** 平均饱和度(0-100) */
  avgSaturation: number;
  /** 对比度等级 */
  contrast: 'high' | 'medium' | 'low';
  /** 纹理复杂度(0-1) */
  textureComplexity: number;
  /** 边缘密度(0-1) */
  edgeDensity: number;

  // ============ Phase A 新增字段(构图类) ============

  /** 黄金分割评分(0-100),Phase A 新增 */
  goldenRatioScore?: number;
  /** 三分法评分(0-100),Phase A 新增 */
  ruleOfThirdsScore?: number;
  /** 引导线方向(0-180度),Phase A 新增 */
  leadingLineDirection?: number;
  /** 引导线强度(0-1),Phase A 新增 */
  leadingLineStrength?: number;

  // ============ Phase A 新增字段(色彩类) ============

  /** 色彩和谐度评分(0-100),Phase A 新增 */
  harmonyScore?: number;
  /** 色彩和谐类型(如'complementary'互补/'analogous'邻近/'triadic'三色等),Phase A 新增 */
  harmonyType?: string;
  /** 饱和度三级分布(低/中/高比例),Phase A 新增 */
  saturationDistribution?: SaturationDistributionForPrompt;

  // ============ Phase A 新增字段(笔触/纹理/方向类) ============

  /** 方向一致性(0-1),笔触/排版/形体/线条方向的统一程度,Phase A 新增 */
  directionCoherence?: number;
  /** 笔触能量/张力(0-1),Phase A 新增 */
  strokeEnergy?: number;
  /** 主导方向(0-180度),Phase A 新增 */
  dominantDirection?: number;

  // ============ Phase A 新增字段(原创性类) ============

  /** pHash感知哈希相似度(0-1),Phase A 新增 */
  pHashSimilarity?: number;
  /** 最相似的名作信息(pHash比对结果),无可比作品时为 null,Phase A 新增 */
  mostSimilarWork?: MostSimilarWorkForPrompt | null;
}

// ============ 默认值工厂 ============

/**
 * 构造 AI 失败时的默认元信息
 * 用于 fallback 路径,保证 HybridAnalysisResult 结构完整
 */
export function createFailureAIMeta(
  reason: AIFailureReason,
  durationMs: number,
  model: string,
): AIInvocationMeta {
  return {
    aiSuccess: false,
    aiDurationMs: durationMs,
    aiFailureReason: reason,
    aiModel: model,
    aiInvokedAt: new Date().toISOString(),
  };
}

/**
 * 构造 AI 禁用时的默认元信息
 * 用于 AI_ENABLED=false 场景
 */
export function createDisabledAIMeta(model: string): AIInvocationMeta {
  return {
    aiSuccess: false,
    aiDurationMs: 0,
    aiFailureReason: 'AI_DISABLED',
    aiModel: model,
    aiInvokedAt: new Date().toISOString(),
  };
}
