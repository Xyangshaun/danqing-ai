import type { AnalysisResult, ArtType, PaintingAnalysis, DesignAnalysis, ProductAnalysis, SculptureAnalysis } from '../types';
import { analyzeImage } from './analysisService';

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
 * 检查后端服务是否可用
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('http://localhost:3001/api/health', {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 将后端返回的旧版分析结果转换为新版差异化维度结构
 */
function convertBackendResult(data: any, artType: ArtType): AnalysisResult {
  const composition = data.composition || {};
  const color = data.color || {};
  const originality = data.originality || {};

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
    id: data.id || `analysis-${Date.now()}`,
    imageUrl: data.imageUrl || '',
    createdAt: data.createdAt || new Date().toISOString(),
    artType: data.artType || artType,
    dimensions,
    originality: {
      score: originality.score || 80,
      similarity: originality.similarity ?? 0.15,
      suggestion: originality.suggestion || '原创性良好，继续保持个人风格。',
      creativityLevel: originality.similarity < 0.15 ? 'excellent' : originality.similarity < 0.25 ? 'good' : 'average',
    },
    overallScore: data.overallScore || 75,
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

    const response = await fetch('http://localhost:3001/api/analyze', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data.success && data.data) {
      return convertBackendResult(data.data, artType);
    }
    throw new Error(data.message || '服务器分析失败');
  }

  return analyzeImage(imageUrl, artType);
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
    simple: 'text-green-600',
    normal: 'text-gold',
    complex: 'text-cinnabar',
  };
  return colors[level] || 'text-ink-500';
}

export type { AnalysisDecision };
