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
//   ProfessionalSuggestion   - 专业改进建议(含操作+案例+练习)
//   ReferenceArtwork         - 参考案例(美术史作品)
//   HybridAnalysisResult     - 混合分析结果(Jimp 客观 + AI 语义)
//   AIFailureReason          - AI 失败原因枚举
// ============================================================

import type { AnalysisResult, ArtType } from './api-contract.js';

// ============ AI 失败原因枚举 ============

/**
 * AI 调用失败原因分类
 * 用于 aiFailureReason 字段,便于监控分类统计
 */
export type AIFailureReason =
  | 'AI_DISABLED'           // AI 功能未开启(env.AI_ENABLED=false)
  | 'AI_KEY_MISSING'        // AI_API_KEY 未配置
  | 'AI_TIMEOUT'            // 请求超时(>2.5s)
  | 'AI_HTTP_ERROR'         // HTTP 状态码非 2xx
  | 'AI_PARSE_ERROR'        // 响应 JSON 解析失败
  | 'AI_SCHEMA_ERROR'       // 响应结构不符合 Zod schema
  | 'AI_NETWORK_ERROR'      // 网络异常(ECONNREFUSED / ENOTFOUND 等)
  | 'AI_UNKNOWN_ERROR';     // 未知异常

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

/**
 * 建议等级(对应美院评分标准的四档:优/良/中/差,AI 仅输出良/中/差)
 */
export type SuggestionLevel = 'excellent' | 'good' | 'average' | 'poor';

/**
 * 专业改进建议
 * 每条建议必须包含"具体操作 + 参考案例 + 练习路径"三要素
 * 禁止"加强构图"式空泛反馈(对应 art-evaluation-standards.md 规范)
 */
export interface ProfessionalSuggestion {
  /** 维度名(构图与造型/色彩表现/笔触与技法/视觉层次/排版与构成/形态语义 等) */
  dimension: string;
  /** 该维度的评级 */
  level: SuggestionLevel;
  /** 具体操作(含数值/位置/方法,如"将主体从画面正中向左下偏移 1/3") */
  operation: string;
  /** 参考案例(美术史作品,如"塞尚《静物》三角构图") */
  reference: string;
  /** 练习路径(1-2 个针对性练习,如"对同一组静物做 4 种构图变体速写") */
  practice: string;
}

// ============ 参考案例类型 ============

/**
 * 美术史参考作品推荐
 */
export interface ReferenceArtwork {
  /** 作品名 */
  title: string;
  /** 艺术家 */
  artist: string;
  /** 推荐理由(与本作业的关联) */
  reason: string;
}

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

/**
 * AI 调用元信息
 * 用于可观测性:成功率、耗时、失败原因、模型版本等
 */
export interface AIInvocationMeta {
  /** AI 是否成功调用并返回有效结果 */
  aiSuccess: boolean;
  /** AI 调用耗时(毫秒);失败时为已耗时 */
  aiDurationMs: number;
  /** AI 失败原因(aiSuccess=false 时非空) */
  aiFailureReason: AIFailureReason | null;
  /** 使用的 AI 模型名(如 glm-4v-flash) */
  aiModel: string;
  /** AI 调用时间戳(ISO 8601) */
  aiInvokedAt: string;
  /** AI 响应的 token 用量(可选,成功时填入) */
  aiTokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

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
 * Jimp 客观像素数据(注入 AI prompt 供校准参考)
 * 这些字段已由 analysis-engine.service.ts 计算得出
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
