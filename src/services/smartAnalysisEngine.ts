import type { AnalysisResult, ArtType, DimensionResult, ProfessionalSuggestion, PaintingAnalysis, DesignAnalysis, ProductAnalysis, SculptureAnalysis } from '../types';
import { analyzeImage, getBackendUrl } from './analysisService';

/* ============================================================
 * 后端分析响应类型定义
 *
 * convertBackendResult 需兼容多种后端格式:
 *   - AnalysisRecord 包装格式(data.result 包含实际分析数据)
 *   - 新版结构化格式(data.dimensions.type 存在)
 *   - 旧版平铺格式(data.composition / data.color 直接平铺)
 * 以下接口用可选字段 + 局部类型叠加覆盖所有访问路径,
 * 替代原先的 `any`,在保留运行时行为的同时获得类型安全。
 * ============================================================ */

/** painting 类型 brushwork 可能携带的聚合字段及其来源字段 */
interface BackendBrushwork {
  structureTensor?: { coherence: number; energy: number; dominantDirection: number };
  directionCoherence?: number;
  strokeEnergy?: number;
  dominantBrushDirection?: number;
}

/** 后端 dimensions:在前端联合类型基础上叠加 brushwork 可选扩展 */
type BackendDimensions = DimensionResult & { brushwork?: BackendBrushwork };

/** 旧版平铺构图字段 */
interface BackendLegacyComposition {
  score?: number;
  focusPoint?: { x: number; y: number };
  balance?: string;
  guideline?: string;
  whitespaceRatio?: number;
  symmetry?: number;
  suggestion?: string;
  heatmapData?: number[][];
}

/** 旧版平铺色彩字段 */
interface BackendLegacyColor {
  score?: number;
  warmRatio?: number;
  coolRatio?: number;
  contrast?: string;
  saturation?: string;
  richness?: string;
  harmony?: string;
  dominantColor?: string;
  suggestion?: string;
}

/**
 * 后端分析响应(递归,兼容 AnalysisRecord 包装与平铺旧版格式)。
 * 所有字段可选,因不同版本后端返回结构差异较大。
 */
interface BackendAnalysisData {
  id?: string;
  result?: BackendAnalysisData;
  dimensions?: BackendDimensions;
  overallScore?: number;
  imageUrl?: string;
  createdAt?: string;
  artType?: ArtType;
  workType?: ArtType;
  originality?: Partial<AnalysisResult['originality']>;
  professionalSuggestions?: ProfessionalSuggestion[];
  aiVisionResult?: { professionalSuggestions?: ProfessionalSuggestion[] };
  aiEnhanced?: boolean;
  cacheHit?: boolean;
  jimpDurationMs?: number;
  aiDurationMs?: number;
  composition?: BackendLegacyComposition;
  color?: BackendLegacyColor;
}

/**
 * 图片复杂度评估接口
 */
interface ImageComplexity {
  level: 'simple' | 'normal' | 'complex';
  score: number;
  factors: {
    fileSizeMB: number;
    pixelCount: number;
    estimatedColors: number;
    estimatedElements: number;
  };
}

/**
 * 分析模式决策接口
 */
interface AnalysisDecision {
  mode: 'client' | 'server';
  reason: string;
  estimatedTime: number;
  complexity: ImageComplexity;
}

/**
 * 评估图片复杂度
 * 基于文件大小、像素数量、预估色彩丰富度等
 */
function assessComplexity(file: File | null, imageUrl: string): ImageComplexity {
  const fileSizeMB = file ? file.size / (1024 * 1024) : 0;
  
  let pixelCount = 0;
  try {
    const img = new Image();
    img.src = imageUrl;
    pixelCount = img.width * img.height;
  } catch {
    pixelCount = 0;
  }
  
  const estimatedColors = Math.min(256, Math.max(16, Math.floor(pixelCount / 5000)));
  const estimatedElements = Math.min(50, Math.max(3, Math.floor(pixelCount / 20000)));
  
  let complexityScore = 0;
  
  complexityScore += Math.min(30, fileSizeMB * 6);
  
  const mp = pixelCount / 1000000;
  complexityScore += Math.min(25, mp * 8);
  
  complexityScore += Math.min(20, estimatedColors / 12);
  
  complexityScore += Math.min(15, estimatedElements / 3);
  
  if (fileSizeMB > 5) complexityScore += 10;
  if (pixelCount > 4000000) complexityScore += 10;
  
  let level: ImageComplexity['level'];
  if (complexityScore < 40) {
    level = 'simple';
  } else if (complexityScore < 75) {
    level = 'normal';
  } else {
    level = 'complex';
  }
  
  return {
    level,
    score: Math.round(complexityScore),
    factors: {
      fileSizeMB: Math.round(fileSizeMB * 100) / 100,
      pixelCount,
      estimatedColors,
      estimatedElements,
    },
  };
}

/**
 * 智能分析决策引擎
 * 根据图片复杂度、艺术类型、网络状态等自动选择分析模式
 */
export function decideAnalysisMode(
  file: File | null,
  imageUrl: string,
  artType: ArtType,
  serverAvailable: boolean = true
): AnalysisDecision {
  const complexity = assessComplexity(file, imageUrl);
  
  let mode: 'client' | 'server';
  let reason: string;
  let estimatedTime: number;
  
  const artTypeWeight: Record<ArtType, number> = {
    painting: 1.0,
    design: 1.2,
    product: 1.3,
    sculpture: 1.4,
  };
  
  const weightedScore = complexity.score * artTypeWeight[artType];
  
  if (!serverAvailable) {
    mode = 'client';
    reason = '后端服务不可用，自动切换为本地分析';
    estimatedTime = weightedScore > 60 ? 5 : 3;
  } else if (complexity.level === 'simple') {
    mode = 'client';
    reason = `作品复杂度较低(${complexity.score}分)，本地快速分析即可满足需求`;
    estimatedTime = 2;
  } else if (complexity.level === 'normal') {
    if (artType === 'painting' || artType === 'design') {
      mode = 'client';
      reason = `作品复杂度适中(${complexity.score}分)，${artType === 'painting' ? '绘画' : '设计'}类作品本地分析效果良好`;
      estimatedTime = 3;
    } else {
      mode = 'server';
      reason = `作品复杂度适中(${complexity.score}分)，${artType === 'product' ? '产品' : '雕塑'}类作品需要更精确的后端分析`;
      estimatedTime = 4;
    }
  } else {
    mode = 'server';
    reason = `作品复杂度高(${complexity.score}分)，包含大量细节元素，启用后端深度学习分析以获得更精准结果`;
    estimatedTime = 5;
  }
  
  if (file && file.size > 8 * 1024 * 1024 && mode === 'client') {
    mode = 'server';
    reason = `文件较大(${(file.size / (1024 * 1024)).toFixed(1)}MB)，后端处理更高效`;
    estimatedTime = 5;
  }
  
  return {
    mode,
    reason,
    estimatedTime,
    complexity,
  };
}

/**
 * 检查后端服务是否可用（v3.0.0：GET /health → {code, message, data: {status, ...}, traceId}）
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${getBackendUrl()}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return false;
    const data = await response.json();
    return data.code === 0 && data.data?.status === 'up';
  } catch {
    return false;
  }
}

/**
 * 将后端返回的分析结果转换为前端AnalysisResult格式
 * 支持多种后端格式:
 *   - 最新版(API v1): data 为 AnalysisRecord { id, status, result: HybridAnalysisResult },实际数据在 data.result 中
 *   - 新版(Phase B+): data.dimensions 为结构化对象,可能包含 professionalSuggestions/aiVisionResult
 *   - 旧版(Legacy): data.composition/data.color 平铺结构
 */
function convertBackendResult(data: BackendAnalysisData, artType: ArtType): AnalysisResult {
  /* 记录顶层id，用于兼容AnalysisRecord格式 */
  const recordId = data.id;

  /* 检测是否为 AnalysisRecord 包装格式: data.result 存在且包含分析结果字段 */
  const isRecordFormat = data.result && (data.result.dimensions || typeof data.result.overallScore === 'number');

  /* 解包:如果是AnalysisRecord格式,从result中提取实际分析数据。
   * isRecordFormat 为真时 data.result 必然存在,此处用 as 断言去除 undefined。 */
  const actualData = (isRecordFormat ? data.result : data) as BackendAnalysisData;

  /* 提取 professionalSuggestions: 优先取result层,其次顶层,再从aiVisionResult中取 */
  const professionalSuggestions =
    actualData.professionalSuggestions ||
    data.professionalSuggestions ||
    (actualData.aiVisionResult && actualData.aiVisionResult.professionalSuggestions) ||
    (data.aiVisionResult && data.aiVisionResult.professionalSuggestions) ||
    undefined;

  /* 检测是否为新版结构化格式(dimensions.type 存在) */
  const isNewFormat = actualData.dimensions && actualData.dimensions.type;

  /* Phase F1:提取可观测性元信息(可能在 AnalysisDetail 顶层或 result 层) */
  const metaInfo = {
    aiEnhanced: data.aiEnhanced ?? actualData.aiEnhanced,
    cacheHit: data.cacheHit ?? actualData.cacheHit,
    jimpDurationMs: data.jimpDurationMs ?? actualData.jimpDurationMs,
    aiDurationMs: data.aiDurationMs ?? actualData.aiDurationMs,
  };

  if (isNewFormat) {
    /* 新版格式:直接透传 dimensions/originality,附加 professionalSuggestions */
    /* Phase F1:对 painting 类型,从已有 3 字段聚合 structureTensor */
    /* isNewFormat 为真保证 dimensions 存在,用 ! 断言去除 undefined */
    const dims = actualData.dimensions!;
    if (
      dims.type === 'painting' &&
      dims.brushwork &&
      !dims.brushwork.structureTensor
    ) {
      const bw = dims.brushwork;
      if (
        typeof bw.directionCoherence === 'number' ||
        typeof bw.strokeEnergy === 'number' ||
        typeof bw.dominantBrushDirection === 'number'
      ) {
        bw.structureTensor = {
          coherence: bw.directionCoherence ?? 0,
          energy: bw.strokeEnergy ?? 0,
          dominantDirection: bw.dominantBrushDirection ?? 0,
        };
      }
    }
    return {
      id: recordId || actualData.id || `analysis-${Date.now()}`,
      imageUrl: actualData.imageUrl || data.imageUrl || '',
      createdAt: actualData.createdAt || data.createdAt || new Date().toISOString(),
      artType: actualData.artType || data.artType || actualData.workType || data.workType || artType,
      dimensions: dims,
      /* 后端 originality 字段以 Partial 形式声明(各版本字段差异),
       * 透传时保留原 any 行为:truthy 即原样透传,falsy 用默认完整对象。
       * 用 as 断言为完整类型,与原先 any 透传语义一致。 */
      originality: (actualData.originality || {
        score: 80,
        similarity: 0.15,
        creativityLevel: 'good',
        suggestion: '原创性良好，继续保持个人风格。',
      }) as AnalysisResult['originality'],
      overallScore: actualData.overallScore ?? 75,
      professionalSuggestions,
      ...metaInfo,
    };
  }

  /* 旧版格式:转换平铺字段为结构化 dimensions */
  const composition = actualData.composition || data.composition || {};
  const color = actualData.color || data.color || {};
  const originality = actualData.originality || data.originality || {};

  const baseComposition = {
    score: composition.score || 75,
    focusPoint: composition.focusPoint || { x: 0.5, y: 0.5 },
    balance: composition.balance || 'balanced',
    guideline: composition.guideline || 'average',
    whitespaceRatio: composition.whitespaceRatio ?? 0.5,
    symmetry: composition.symmetry ?? 0.5,
    suggestion: composition.suggestion || '构图建议',
    heatmapData: composition.heatmapData || [],
  };

  const baseColor = {
    score: color.score || 75,
    warmRatio: color.warmRatio ?? 0.5,
    coolRatio: color.coolRatio ?? 0.5,
    contrast: color.contrast || 'medium',
    saturation: color.saturation || 'medium',
    richness: color.richness || 'moderate',
    harmony: color.harmony || 'neutral',
    dominantColor: color.dominantColor || '未知',
    suggestion: color.suggestion || '色彩建议',
  };

  let dimensions: AnalysisResult['dimensions'];

  if (artType === 'painting') {
    const brushScore = Math.round((baseComposition.score + baseColor.score) / 2);
    dimensions = {
      type: 'painting',
      composition: baseComposition,
      color: baseColor,
      brushwork: {
        score: brushScore,
        textureLevel: 'moderate',
        strokeVariety: 50,
        wetDryBalance: '平衡',
        suggestion: '笔触表现自然，建议尝试更多肌理变化以丰富画面层次。',
      },
    } as PaintingAnalysis;
  } else if (artType === 'design') {
    dimensions = {
      type: 'design',
      visualHierarchy: {
        score: baseComposition.score,
        focusPoint: baseComposition.focusPoint,
        primarySecondaryClarity: baseComposition.balance === 'balanced' ? 'clear' : 'moderate',
        informationFlow: baseComposition.guideline === 'good' ? 'good' : 'average',
        heatmapData: baseComposition.heatmapData,
        suggestion: baseComposition.suggestion,
      },
      typography: {
        score: Math.round(baseComposition.score * 0.9),
        alignmentQuality: 'average',
        rhythmConsistency: 'average',
        negativeSpaceUsage: baseComposition.whitespaceRatio > 0.3 && baseComposition.whitespaceRatio < 0.7 ? 'good' : 'average',
        gridAdherence: 60,
        suggestion: '排版结构基本合理，建议加强网格系统的一致性。',
      },
      colorApplication: {
        score: baseColor.score,
        contrast: baseColor.contrast,
        brandConsistency: 'moderate',
        colorPsychology: '中性',
        paletteHarmony: baseColor.harmony,
        suggestion: baseColor.suggestion,
      },
    } as DesignAnalysis;
  } else if (artType === 'product') {
    dimensions = {
      type: 'product',
      form: {
        score: baseComposition.score,
        proportionBalance: baseComposition.balance === 'balanced' ? 'good' : 'average',
        lineFluidity: 'moderate',
        surfaceQuality: 'good',
        ergonomicsHint: 'moderate',
        heatmapData: baseComposition.heatmapData,
        suggestion: baseComposition.suggestion,
      },
      materialExpression: {
        score: baseColor.score,
        textureRealism: 'medium',
        lightShadowPerformance: baseColor.contrast === 'high' ? 'excellent' : 'good',
        surfaceTreatment: 'moderate',
        suggestion: baseColor.suggestion,
      },
      functionExpression: {
        score: Math.round((baseComposition.score + baseColor.score) / 2),
        structureClarity: 'moderate',
        functionImplication: 'moderate',
        detailRefinement: 'good',
        suggestion: '功能表达清晰，建议增加更多细节以提升产品质感。',
      },
    } as ProductAnalysis;
  } else {
    dimensions = {
      type: 'sculpture',
      spatialComposition: {
        score: baseComposition.score,
        volumeSense: 'moderate',
        spaceOccupation: 'moderate',
        voidSolidRelation: baseComposition.balance === 'balanced' ? 'harmonious' : 'moderate',
        heatmapData: baseComposition.heatmapData,
        suggestion: baseComposition.suggestion,
      },
      bodyLanguage: {
        score: Math.round(baseComposition.score * 0.9),
        dynamicSense: 'moderate',
        tensionExpression: 'medium',
        rhythmFlow: 'moderate',
        suggestion: '形体语言表现平稳，建议增强动态感和韵律流动。',
      },
      materialLanguage: {
        score: baseColor.score,
        materialCharacter: 'moderate',
        textureExpression: 'moderate',
        qualityLayering: 'moderate',
        suggestion: baseColor.suggestion,
      },
    } as SculptureAnalysis;
  }

  return {
    id: recordId || actualData.id || data.id || `analysis-${Date.now()}`,
    imageUrl: actualData.imageUrl || data.imageUrl || '',
    createdAt: actualData.createdAt || data.createdAt || new Date().toISOString(),
    artType: actualData.artType || data.artType || artType,
    dimensions,
    originality: {
      score: originality.score || 80,
      similarity: originality.similarity ?? 0.15,
      suggestion: originality.suggestion || '原创性良好，继续保持个人风格。',
      /* originality.similarity 可能为 undefined(旧版后端未返回该字段);
       * 原先 `any` 下 `undefined < 0.15` 即 false → 'average',此处用显式
       * undefined 判断保留相同行为,同时满足 strictNullChecks。 */
      creativityLevel: originality.similarity === undefined
        ? 'average'
        : originality.similarity < 0.15
          ? 'excellent'
          : originality.similarity < 0.25
            ? 'good'
            : 'average',
    },
    overallScore: actualData.overallScore ?? data.overallScore ?? 75,
    professionalSuggestions,
    ...metaInfo,
  };
}

/**
 * 智能分析入口
 * 自动判断分析模式并执行分析
 */
export async function smartAnalyze(
  file: File | null,
  imageUrl: string,
  artType: ArtType,
  onDecision?: (decision: AnalysisDecision) => void
): Promise<AnalysisResult> {
  const serverAvailable = await checkServerHealth();
  const decision = decideAnalysisMode(file, imageUrl, artType, serverAvailable);

  if (onDecision) {
    onDecision(decision);
  }

  if (decision.mode === 'server' && file) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('artType', artType);

    let response: Response;
    try {
      response = await fetch(`${getBackendUrl()}/analyses/upload`, {
        method: 'POST',
        body: formData, // 不设置 Content-Type，让浏览器自动设置 boundary
      });
    } catch (networkError) {
      throw new Error('网络连接失败，请检查网络后重试');
    }

    /* 先检查HTTP状态码 */
    if (!response.ok) {
      let errorMessage = `服务器返回错误 (HTTP ${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        /* 解析错误响应失败时，使用默认错误消息 */
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.code === 0 && data.data) {
      return convertBackendResult(data.data, artType);
    }
    throw new Error(data.message || '服务器分析失败，请稍后重试');
  }

  return analyzeImage(imageUrl, artType);
}

/**
 * AI 深度增强分析(阶段 2)
 *
 * 对已存在的分析记录调用后端 AI 视觉模型增强,返回带 aiEnhanced=true 的新结果。
 * 后端幂等:若记录已 aiEnhanced=true,直接返回当前结果不重复计费。
 *
 * 鉴权同 GET /analyses/:id(analysis:read:own/tenant),沿用本文件 smartAnalyze 的
 * 裸 fetch 模式(同源请求携带 Cookie,与 /analyses/upload 一致)。
 *
 * @param analysisId 阶段 1 返回的 AnalysisResult.id
 * @param artType    当前艺术类型(convertBackendResult fallback 用,后端响应含 artType 时以响应为准)
 * @throws Error 网络/HTTP/业务错误(message 可直接 toast)
 */
export async function aiEnhanceAnalysis(
  analysisId: string,
  artType: ArtType
): Promise<AnalysisResult> {
  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}/analyses/${analysisId}/ai-enhance`, {
      method: 'POST',
    });
  } catch (networkError) {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  /* 先检查 HTTP 状态码,提取后端业务 message */
  if (!response.ok) {
    let errorMessage = `服务器返回错误 (HTTP ${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      /* 解析错误响应失败时,使用默认错误消息 */
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (data.code === 0 && data.data) {
    return convertBackendResult(data.data, artType);
  }
  throw new Error(data.message || 'AI 深度分析失败，请稍后重试');
}

/**
 * 获取复杂度标签文本
 */
export function getComplexityLabel(level: ImageComplexity['level']): string {
  const labels: Record<string, string> = {
    simple: '简单',
    normal: '中等',
    complex: '复杂',
  };
  return labels[level] || level;
}

/**
 * 获取复杂度颜色
 */
export function getComplexityColor(level: ImageComplexity['level']): string {
  const colors: Record<string, string> = {
    simple: 'text-jade',
    normal: 'text-gold',
    complex: 'text-cinnabar',
  };
  return colors[level] || 'text-ink-500';
}

export type { AnalysisDecision };
