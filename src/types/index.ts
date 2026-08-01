export type ArtType = 'painting' | 'design' | 'product' | 'sculpture';

// ============================================
// 专业建议类型(Phase B4:对齐后端 ai-analysis.ts)
// ============================================

/**
 * 建议优先级(ArtCoT证据锚定)
 * high   - 低分维度(<60分),必须改的基础问题
 * medium - 中等分数维度(60-80分),提升建议
 * low    - 高分维度(>80分),亮点肯定或风格探讨
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * 建议等级(对应美院评分标准)
 */
export type SuggestionLevel = 'excellent' | 'good' | 'average' | 'poor';

/**
 * 专业改进建议(ArtCoT证据锚定格式,Phase B4)
 * 向后兼容:旧数据/Canvas模式可能只有 operation/suggestion 文本,
 * evidence/priority 等字段均为可选,缺失时组件按原有方式渲染。
 */
export interface ProfessionalSuggestion {
  /** 维度名(构图/色彩/笔触技法/视觉层次/排版/色彩应用 等) */
  dimension: string;
  /** 该维度的评级(可选) */
  level?: SuggestionLevel;
  /** 证据字段:引用具体数值证据(如'视觉重心(0.72,0.45)偏右,黄金分割评分仅42分'),可选 */
  evidence?: string;
  /** 具体操作建议(必填,兼容旧suggestion字段) */
  operation: string;
  /** 参考案例(美术史作品,可选) */
  reference?: string;
  /** 练习路径(针对性练习,可选) */
  practice?: string;
  /** 优先级:high必改/medium提升/low亮点,可选(缺失时按medium处理) */
  priority?: SuggestionPriority;
}

// ============================================
// 饱和度分布
// ============================================
export interface SaturationDistribution {
  low: number;
  mid: number;
  high: number;
}

// ============================================
// pHash最相似作品信息
// ============================================
export interface MostSimilarWork {
  title: string;
  artist: string;
  distance: number;
}

// ============================================
// 绘画分析维度
// ============================================
export interface PaintingAnalysis {
  type: 'painting';
  composition: {
    score: number;
    focusPoint: { x: number; y: number };
    balance: 'balanced' | 'left-heavy' | 'right-heavy' | 'top-heavy' | 'bottom-heavy';
    guideline: 'good' | 'average' | 'poor';
    whitespaceRatio: number;
    symmetry: number;
    suggestion: string;
    heatmapData: number[][];
    /** 黄金分割评分(0-100),Phase A新增 */
    goldenRatioScore?: number;
    /** 三分法评分(0-100),Phase A新增 */
    ruleOfThirdsScore?: number;
    /** 引导线方向(0-180度),Phase A新增 */
    leadingLineDirection?: number;
    /** 引导线强度(0-1),Phase A新增 */
    leadingLineStrength?: number;
  };
  color: {
    score: number;
    warmRatio: number;
    coolRatio: number;
    contrast: 'high' | 'medium' | 'low';
    saturation: 'high' | 'medium' | 'low';
    richness: 'rich' | 'moderate' | 'limited';
    harmony: string;
    dominantColor: string;
    suggestion: string;
    /** 色彩和谐度分数(0-100),Phase A新增 */
    harmonyScore?: number;
    /** 色彩和谐类型英文标识,Phase A新增 */
    harmonyType?: string;
    /** 饱和度三级分布,Phase A新增 */
    saturationDistribution?: SaturationDistribution;
  };
  brushwork: {
    score: number;
    textureLevel: 'rich' | 'moderate' | 'simple';
    strokeVariety: number;
    wetDryBalance: string;
    suggestion: string;
    /** 笔触方向一致性(0-1),Phase A新增 */
    directionCoherence?: number;
    /** 笔触能量/张力(0-1),Phase A新增 */
    strokeEnergy?: number;
    /** 主导笔触方向(0-180度),Phase A新增 */
    dominantBrushDirection?: number;
    /** 结构张量聚合指标(Phase F1新增,由 directionCoherence/strokeEnergy/dominantBrushDirection 聚合) */
    structureTensor?: {
      /** 方向一致性(0-1) */
      coherence: number;
      /** 能量/张力(0-1) */
      energy: number;
      /** 主导方向(0-180度) */
      dominantDirection: number;
    };
  };
}

// ============================================
// 设计分析维度
// ============================================
export interface DesignAnalysis {
  type: 'design';
  visualHierarchy: {
    score: number;
    focusPoint: { x: number; y: number };
    primarySecondaryClarity: 'clear' | 'moderate' | 'unclear';
    informationFlow: 'good' | 'average' | 'poor';
    heatmapData: number[][];
    suggestion: string;
    /** 黄金分割评分(0-100),Phase A新增 */
    goldenRatioScore?: number;
    /** 三分法评分(0-100),Phase A新增 */
    ruleOfThirdsScore?: number;
    /** 引导线方向(0-180度),Phase A新增 */
    leadingLineDirection?: number;
    /** 引导线强度(0-1),Phase A新增 */
    leadingLineStrength?: number;
  };
  typography: {
    score: number;
    alignmentQuality: 'good' | 'average' | 'poor';
    rhythmConsistency: 'good' | 'average' | 'poor';
    negativeSpaceUsage: 'good' | 'average' | 'poor';
    gridAdherence: number;
    suggestion: string;
    /** 排版方向对齐一致性(0-1),coherence>0.5表示对齐良好,Phase A新增 */
    directionCoherence?: number;
  };
  colorApplication: {
    score: number;
    contrast: 'high' | 'medium' | 'low';
    brandConsistency: 'strong' | 'moderate' | 'weak';
    colorPsychology: string;
    paletteHarmony: string;
    suggestion: string;
  };
}

// ============================================
// 产品设计分析维度
// ============================================
export interface ProductAnalysis {
  type: 'product';
  form: {
    score: number;
    focusPoint: { x: number; y: number };
    proportionBalance: 'good' | 'average' | 'poor';
    lineFluidity: 'smooth' | 'moderate' | 'stiff';
    surfaceQuality: 'excellent' | 'good' | 'average';
    ergonomicsHint: 'strong' | 'moderate' | 'weak';
    heatmapData: number[][];
    suggestion: string;
    /** 黄金分割评分(0-100),Phase A新增 */
    goldenRatioScore?: number;
    /** 三分法评分(0-100),Phase A新增 */
    ruleOfThirdsScore?: number;
    /** 引导线方向(0-180度),Phase A新增 */
    leadingLineDirection?: number;
    /** 引导线强度(0-1),Phase A新增 */
    leadingLineStrength?: number;
    /** 曲面/线条方向流畅度(0-1),Phase A新增 */
    directionCoherence?: number;
  };
  materialExpression: {
    score: number;
    textureRealism: 'high' | 'medium' | 'low';
    lightShadowPerformance: 'excellent' | 'good' | 'average';
    surfaceTreatment: 'refined' | 'moderate' | 'rough';
    suggestion: string;
  };
  functionExpression: {
    score: number;
    structureClarity: 'clear' | 'moderate' | 'unclear';
    functionImplication: 'strong' | 'moderate' | 'weak';
    detailRefinement: 'excellent' | 'good' | 'average';
    suggestion: string;
  };
}

// ============================================
// 雕塑分析维度
// ============================================
export interface SculptureAnalysis {
  type: 'sculpture';
  spatialComposition: {
    score: number;
    focusPoint: { x: number; y: number };
    volumeSense: 'strong' | 'moderate' | 'weak';
    spaceOccupation: 'full' | 'moderate' | 'sparse';
    voidSolidRelation: 'harmonious' | 'moderate' | 'imbalanced';
    heatmapData: number[][];
    suggestion: string;
    /** 黄金分割评分(0-100),Phase A新增 */
    goldenRatioScore?: number;
    /** 三分法评分(0-100),Phase A新增 */
    ruleOfThirdsScore?: number;
    /** 引导线方向(0-180度),Phase A新增 */
    leadingLineDirection?: number;
    /** 引导线强度(0-1),Phase A新增 */
    leadingLineStrength?: number;
  };
  bodyLanguage: {
    score: number;
    dynamicSense: 'strong' | 'moderate' | 'static';
    tensionExpression: 'high' | 'medium' | 'low';
    rhythmFlow: 'fluent' | 'moderate' | 'stiff';
    suggestion: string;
    /** 形体方向一致性(0-1),形体张力辅助,Phase A新增 */
    directionCoherence?: number;
    /** 形体能量/张力(0-1),Phase A新增 */
    strokeEnergy?: number;
  };
  materialLanguage: {
    score: number;
    materialCharacter: 'distinct' | 'moderate' | 'obscure';
    textureExpression: 'rich' | 'moderate' | 'simple';
    qualityLayering: 'rich' | 'moderate' | 'simple';
    suggestion: string;
  };
}

// ============================================
// 通用分析结果
// ============================================
export type DimensionResult = PaintingAnalysis | DesignAnalysis | ProductAnalysis | SculptureAnalysis;

export interface AnalysisResult {
  id: string;
  imageUrl: string;
  createdAt: string;
  artType: ArtType;
  dimensions: DimensionResult;
  originality: {
    score: number;
    similarity: number;
    creativityLevel: 'excellent' | 'good' | 'average' | 'needsWork';
    suggestion: string;
    /** pHash感知哈希相似度(0-1),Phase A新增 */
    pHashSimilarity?: number;
    /** 最相似的名作信息(Phase A新增) */
    mostSimilarWork?: MostSimilarWork | null;
  };
  overallScore: number;
  /** 专业改进建议列表(AI增强模式/Phase B4新增,可选;旧数据/Canvas模式可能无此字段) */
  professionalSuggestions?: ProfessionalSuggestion[];
  // ---- Phase F1 可观测性元信息(可选,由后端 AnalysisDetail 透传) ----
  /** 是否经过 AI 增强 */
  aiEnhanced?: boolean;
  /** 是否命中分析缓存 */
  cacheHit?: boolean;
  /** Jimp 本地算法耗时(毫秒) */
  jimpDurationMs?: number;
  /** AI 调用耗时(毫秒) */
  aiDurationMs?: number;
}

export interface HistoryRecord {
  id: string;
  imageUrl: string;
  createdAt: string;
  artType: ArtType;
  overallScore: number;
  dimension1Score: number;
  dimension2Score: number;
  dimension3Score: number;
}

export interface GrowthData {
  date: string;
  dimension1: number;
  dimension2: number;
  dimension3: number;
  overall: number;
}

// ============================================
// 分析维度配置（前端展示用）
// ============================================
export const ART_TYPE_CONFIG: Record<ArtType, {
  label: string;
  icon: string;
  dimensions: {
    key: string;
    label: string;
    icon: string;
    color: string;
    description: string;
  }[];
}> = {
  painting: {
    label: '绘画',
    icon: 'Brush',
    dimensions: [
      { key: 'composition', label: '构图', icon: 'Eye', color: '#c41e3a', description: '视觉重心、画面均衡、引导线、留白' },
      { key: 'color', label: '色彩', icon: 'Palette', color: '#2e5fa1', description: '冷暖对比、饱和度、色彩和谐度' },
      { key: 'brushwork', label: '笔触技法', icon: 'PenTool', color: '#d4af37', description: '笔触力度、肌理感、干湿变化' },
    ],
  },
  design: {
    label: '设计',
    icon: 'Layers',
    dimensions: [
      { key: 'visualHierarchy', label: '视觉层次', icon: 'Eye', color: '#c41e3a', description: '信息层级、主次关系、视觉引导' },
      { key: 'typography', label: '排版', icon: 'Type', color: '#2e5fa1', description: '对齐精度、网格运用、节奏感' },
      { key: 'colorApplication', label: '色彩应用', icon: 'Palette', color: '#d4af37', description: '品牌一致性、对比度、色彩心理学' },
    ],
  },
  product: {
    label: '产品设计',
    icon: 'Box',
    dimensions: [
      { key: 'form', label: '形态', icon: 'Box', color: '#c41e3a', description: '比例协调、线条流畅、人机工学' },
      { key: 'materialExpression', label: '材质表现', icon: 'Gem', color: '#2e5fa1', description: '质感还原、光影表现、表面处理' },
      { key: 'functionExpression', label: '功能表达', icon: 'Settings', color: '#d4af37', description: '结构清晰度、功能暗示、细节处理' },
    ],
  },
  sculpture: {
    label: '雕塑',
    icon: 'Box',
    dimensions: [
      { key: 'spatialComposition', label: '空间构成', icon: 'Box', color: '#c41e3a', description: '体积感、空间占有、虚实关系' },
      { key: 'bodyLanguage', label: '形体语言', icon: 'Move', color: '#2e5fa1', description: '动态感、张力、节奏韵律' },
      { key: 'materialLanguage', label: '材料语言', icon: 'Gem', color: '#d4af37', description: '材质特性、肌理表现、质感层次' },
    ],
  },
};
