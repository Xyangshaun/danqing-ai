import type { ArtworkItem } from './artworksDatabase';

export interface FuseStyle {
  id: string;
  name: string;
  description: string;
  color: string;
  characteristics: string[];
  promptModifier: string;
}

export interface FuseMethod {
  id: string;
  name: string;
  description: string;
  icon: string;
  process: string[];
  promptStrategy: string;
}

export interface FuseIntensity {
  id: string;
  name: string;
  description: string;
  value: number;
}

export interface FusePreset {
  id: string;
  name: string;
  description: string;
  styleId: string;
  methodId: string;
  intensityId: string;
  icon: string;
  useCase: string;
}

export interface FusionAnalysis {
  extractedElementsA: string[];
  extractedElementsB: string[];
  fusionHighlights: string[];
  creativeValue: string;
  styleCompatibility: number;
  themeConsistency: number;
  innovationScore: number;
}

export const fuseStyles: FuseStyle[] = [
  {
    id: 'ink',
    name: '水墨写意',
    description: '以中国传统水墨笔法进行融合，追求意境与留白',
    color: '#2d3748',
    characteristics: ['水墨晕染', '留白意境', '浓淡干湿', '写意传神'],
    promptModifier: 'chinese ink wash painting style, sumi-e, ink splashes, rice paper texture, minimalist composition with negative space, masterful brushwork',
  },
  {
    id: 'oil',
    name: '古典油画',
    description: '西方古典油画技法，厚重笔触与丰富层次',
    color: '#8b4513',
    characteristics: ['厚重笔触', '光影层次', '丰富色彩', '写实细腻'],
    promptModifier: 'oil painting style, classical fine art, thick impasto brushstrokes, dramatic chiaroscuro lighting, rich color palette, museum quality',
  },
  {
    id: 'watercolor',
    name: '水彩晕染',
    description: '透明水彩效果，轻盈灵动的色彩流动',
    color: '#4299e1',
    characteristics: ['透明质感', '色彩流动', '轻盈通透', '水痕肌理'],
    promptModifier: 'watercolor painting style, transparent washes, fluid color bleeding, wet-on-wet technique, paper texture visible, delicate brushwork',
  },
  {
    id: 'minimal',
    name: '极简主义',
    description: '去除繁杂，保留核心，极简几何与留白',
    color: '#6b7280',
    characteristics: ['几何简洁', '大量留白', '纯色块面', '克制表达'],
    promptModifier: 'minimalist art style, geometric abstraction, large negative space, flat colors, clean lines, reductive design, modern aesthetic',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '霓虹光影、未来科技感与都市夜色',
    color: '#9f7aea',
    characteristics: ['霓虹灯光', '科技感', '赛博城市', '高对比色'],
    promptModifier: 'cyberpunk style, neon lights, futuristic cityscape, high contrast colors, holographic elements, technological aesthetic, rainy night atmosphere',
  },
  {
    id: 'art-nouveau',
    name: '新艺术运动',
    description: '流畅曲线、自然纹样与装饰美感',
    color: '#48bb78',
    characteristics: ['流动曲线', '自然纹样', '装饰性强', '优雅精致'],
    promptModifier: 'art nouveau style, flowing organic curves, floral motifs, decorative patterns, elegant lines, mucha-inspired, ornate details',
  },
  {
    id: 'japanese-ukiyoe',
    name: '浮世绘',
    description: '日本浮世绘木版画风格，平涂色块与有力线条',
    color: '#e53e3e',
    characteristics: ['平涂色彩', '有力轮廓', '木纹质感', '经典构图'],
    promptModifier: 'ukiyo-e japanese woodblock print style, flat color areas, bold outlines, wood grain texture, traditional japanese composition, edo period aesthetic',
  },
  {
    id: 'surrealism',
    name: '超现实梦境',
    description: '打破现实逻辑，创造梦幻般的视觉世界',
    color: '#9f7aea',
    characteristics: ['梦幻意象', '错位组合', '象征隐喻', '奇异场景'],
    promptModifier: 'surrealist style, dreamlike imagery, surreal juxtaposition, symbolic elements, dali-inspired, subconscious imagery, magical realism',
  },
];

export const fuseMethods: FuseMethod[] = [
  {
    id: 'composition',
    name: '构图借鉴',
    description: '保留A的构图结构，替换为B的内容与风格',
    icon: 'layout',
    process: [
      '提取作品A的构图骨架与视觉重心',
      '分析作品B的核心元素与风格特征',
      '将B的元素按照A的构图重新组织',
      '调整比例与平衡，确保画面和谐',
    ],
    promptStrategy: 'Use the composition and visual structure of the first artwork, but render it completely in the style of the second artwork with all its characteristic elements and color palette. Maintain the original compositional balance while fully adopting the stylistic language.',
  },
  {
    id: 'color-transfer',
    name: '色彩迁移',
    description: '将B的色彩调色板应用到A的画面上',
    icon: 'palette',
    process: [
      '提取作品B的主色调与配色方案',
      '分析作品A的明暗结构与层次',
      '用B的色彩重新绘制A的画面',
      '保持A的结构但赋予B的情感氛围',
    ],
    promptStrategy: 'Keep the composition and subject matter exactly as in the first artwork, but completely change the color palette to match the second artwork. Apply the mood and color harmonies while preserving original shapes and structural integrity.',
  },
  {
    id: 'element-fusion',
    name: '元素融合',
    description: '提取两件作品的核心元素，有机结合成新画面',
    icon: 'layers',
    process: [
      '提取作品A的标志性元素',
      '提取作品B的标志性元素',
      '寻找元素间的视觉关联点',
      '以自然的方式融合两类元素',
    ],
    promptStrategy: 'Combine the most iconic elements from both artworks into a single harmonious composition. Merge them in a natural, organic way where elements from both are clearly visible and complement each other to create something new.',
  },
  {
    id: 'style-transformation',
    name: '风格转换',
    description: '将A的内容完全以B的艺术风格重新诠释',
    icon: 'sparkles',
    process: [
      '保留作品A的主题与内容',
      '深入分析作品B的艺术语言特征',
      '用B的笔触、色彩、构图法则重绘A',
      '确保风格纯粹且可识别',
    ],
    promptStrategy: 'Transform the first artwork completely into the artistic style of the second artwork. Keep the subject matter but change everything else - brushwork, colors, composition principles, texture - to match the style of the second piece authentically.',
  },
  {
    id: 'hybrid-landscape',
    name: '场景杂交',
    description: '将两个不同场景在空间中并置与过渡',
    icon: 'map',
    process: [
      '分析两件作品的空间场景特征',
      '设计场景过渡与衔接的方式',
      '左侧呈现A的场景，右侧呈现B的场景',
      '中间区域自然融合过渡',
    ],
    promptStrategy: 'Create a split composition where the left side shows the scene from the first artwork and the right side shows the scene from the second, with a beautiful, natural transition zone in the middle where the two worlds merge seamlessly.',
  },
  {
    id: 'mood-blending',
    name: '意境交融',
    description: '提取两件作品的情绪氛围，融合成新的情感表达',
    icon: 'heart',
    process: [
      '分析作品A的情感基调与意境',
      '分析作品B的情感基调与意境',
      '找到两种情绪的交汇点',
      '创造兼具两者特征的新意境',
    ],
    promptStrategy: 'Blend the mood, atmosphere, and emotional qualities of both artworks into a new piece that captures the feeling of both. Focus on the emotional resonance and atmospheric quality rather than literal depiction of elements.',
  },
];

export const fuseIntensities: FuseIntensity[] = [
  {
    id: 'subtle',
    name: '轻度融合',
    description: '保持原作特征，仅加入微妙的对方元素',
    value: 0.25,
  },
  {
    id: 'balanced',
    name: '平衡融合',
    description: '两者特征均等呈现，达到和谐平衡',
    value: 0.5,
  },
  {
    id: 'deep',
    name: '深度融合',
    description: '深度渗透，创造全新的视觉体验',
    value: 0.75,
  },
  {
    id: 'extreme',
    name: '极致融合',
    description: '完全重组，颠覆性的创意碰撞',
    value: 1.0,
  },
];

export const fusePresets: FusePreset[] = [
  {
    id: 'east-west',
    name: '东西对话',
    description: '水墨意境与西方油画的碰撞',
    styleId: 'ink',
    methodId: 'style-transformation',
    intensityId: 'balanced',
    icon: '🌏',
    useCase: '跨文化艺术融合',
  },
  {
    id: 'classic-modern',
    name: '古今交融',
    description: '经典作品以现代风格重获新生',
    styleId: 'minimal',
    methodId: 'style-transformation',
    intensityId: 'deep',
    icon: '⏳',
    useCase: '经典现代表达',
  },
  {
    id: 'dreamscape',
    name: '梦境重构',
    description: '现实场景的超现实演绎',
    styleId: 'surrealism',
    methodId: 'mood-blending',
    intensityId: 'deep',
    icon: '🌙',
    useCase: '创意概念探索',
  },
  {
    id: 'neon-tradition',
    name: '霓虹传统',
    description: '传统艺术遇见赛博未来',
    styleId: 'cyberpunk',
    methodId: 'color-transfer',
    intensityId: 'balanced',
    icon: '🌃',
    useCase: '传统创新表达',
  },
  {
    id: 'floral-elegance',
    name: '花卉雅韵',
    description: '新艺术运动的自然装饰之美',
    styleId: 'art-nouveau',
    methodId: 'element-fusion',
    intensityId: 'balanced',
    icon: '🌸',
    useCase: '装饰艺术创作',
  },
  {
    id: 'zen-minimal',
    name: '禅意极简',
    description: '东方禅意与极简主义的共鸣',
    styleId: 'minimal',
    methodId: 'composition',
    intensityId: 'subtle',
    icon: '🍃',
    useCase: '宁静美学表达',
  },
];

export function buildFusePrompt(
  style: FuseStyle,
  method: FuseMethod,
  intensity: FuseIntensity,
  artwork1: ArtworkItem | null,
  artwork2: ArtworkItem | null,
  customDescription1: string = '',
  customDescription2: string = ''
): string {
  const intensityModifier = {
    0.25: 'very subtle hints of, gently inspired by, mostly preserving the original',
    0.5: 'balanced combination of, equal parts, harmonious integration of both',
    0.75: 'strong fusion of, deeply integrated with, prominently featuring both',
    1.0: 'extreme transformation, complete reimagining of, radical synthesis of',
  }[intensity.value] || 'balanced combination of';

  const artwork1Desc = artwork1
    ? `${artwork1.title} by ${artwork1.artist}, ${artwork1.style} style, ${artwork1.era} era, themes: ${artwork1.tags.join(', ')}, ${artwork1.description.substring(0, 100)}`
    : customDescription1 || 'artwork A';

  const artwork2Desc = artwork2
    ? `${artwork2.title} by ${artwork2.artist}, ${artwork2.style} style, ${artwork2.era} era, themes: ${artwork2.tags.join(', ')}, ${artwork2.description.substring(0, 100)}`
    : customDescription2 || 'artwork B';

  return [
    style.promptModifier,
    method.promptStrategy,
    `Fusion intensity: ${intensity.name} (${intensityModifier})`,
    `Primary artwork (A): ${artwork1Desc}`,
    `Secondary artwork (B): ${artwork2Desc}`,
    `Create a masterful ${style.name} style fusion painting that combines these two artworks using the ${method.name} method.`,
    `Key stylistic characteristics to incorporate: ${style.characteristics.join(', ')}`,
    `Artistic process: ${method.process.join(' → ')}`,
    'High quality, museum-grade artwork, detailed, professional art composition, masterpiece quality.',
  ].join(' ');
}

export function generateFusionAnalysis(
  style: FuseStyle,
  method: FuseMethod,
  intensity: FuseIntensity,
  artwork1: ArtworkItem | null,
  artwork2: ArtworkItem | null
): FusionAnalysis {
  const extractedElementsA = artwork1
    ? [
        `${artwork1.style}风格笔触`,
        artwork1.tags.slice(0, 2).join('、') + '主题',
        artwork1.era + '时代特征',
      ]
    : ['主体作品视觉元素', '原作构图结构', '原作色彩体系'];

  const extractedElementsB = artwork2
    ? [
        `${artwork2.style}风格笔触`,
        artwork2.tags.slice(0, 2).join('、') + '主题',
        artwork2.era + '时代特征',
      ]
    : ['嫁接作品核心元素', '嫁接作品风格特征', '嫁接作品色彩方案'];

  const fusionHighlights = [
    `以「${method.name}」为核心融合策略`,
    `${style.characteristics[0]}与${style.characteristics[1]}的视觉表达`,
    `${intensity.name}带来${intensity.description}`,
  ];

  const creativeValue = intensity.value > 0.7
    ? '突破性创意组合，开拓全新视觉语言'
    : intensity.value > 0.4
    ? '有机融合双方特色，创造和谐新表达'
    : '在保留原作基础上注入新意，微妙而有效';

  const styleCompatibility = artwork1 && artwork2
    ? Math.floor(60 + Math.random() * 35)
    : 75;

  const themeConsistency = artwork1 && artwork2
    ? Math.floor(55 + Math.random() * 40)
    : 70;

  const innovationScore = Math.floor(50 + intensity.value * 50);

  return {
    extractedElementsA,
    extractedElementsB,
    fusionHighlights,
    creativeValue,
    styleCompatibility,
    themeConsistency,
    innovationScore,
  };
}

export function getStyleById(id: string): FuseStyle | undefined {
  return fuseStyles.find((s) => s.id === id);
}

export function getMethodById(id: string): FuseMethod | undefined {
  return fuseMethods.find((m) => m.id === id);
}

export function getIntensityById(id: string): FuseIntensity | undefined {
  return fuseIntensities.find((i) => i.id === id);
}
