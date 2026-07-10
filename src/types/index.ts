export type ArtType = 'painting' | 'design' | 'product' | 'sculpture';

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
  };
  brushwork: {
    score: number;
    textureLevel: 'rich' | 'moderate' | 'simple';
    strokeVariety: number;
    wetDryBalance: string;
    suggestion: string;
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
  };
  typography: {
    score: number;
    alignmentQuality: 'good' | 'average' | 'poor';
    rhythmConsistency: 'good' | 'average' | 'poor';
    negativeSpaceUsage: 'good' | 'average' | 'poor';
    gridAdherence: number;
    suggestion: string;
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
  };
  bodyLanguage: {
    score: number;
    dynamicSense: 'strong' | 'moderate' | 'static';
    tensionExpression: 'high' | 'medium' | 'low';
    rhythmFlow: 'fluent' | 'moderate' | 'stiff';
    suggestion: string;
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
  };
  overallScore: number;
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
