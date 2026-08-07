/**
 * 灵感嫁接 · 融合算法库 (P2)
 * ===========================================================
 * 为每种融合方法(FuseMethod)编写独立的 prompt 构建算法。
 * 每个算法按「分层组装」思路输出结构化 prompt:
 *
 *   构图借鉴   → 结构层(A骨架) + 内容层(B元素) + 风格层
 *   色彩迁移   → 结构层(A明暗) + 色彩层(B色板) + 氛围层
 *   元素融合   → 元素层(A+B) + 关联层(视觉呼应) + 统一层
 *   风格转换   → 主题层(A) + 风格层(B语言) + 技法层
 *   场景杂交   → 空间层(左右并置) + 过渡层 + 光影层
 *   意境交融   → 氛围层(情绪加权) + 光影层 + 色彩层
 *   局部置换   → 主体层(A) + 环境层(B) + 边缘融合层
 *   材质嫁接   → 形态层(A) + 材质层(B) + 光照一致层
 *   时空折叠   → 时空层(A/B时代) + 对照层 + 透视统一层
 *
 * 所有算法共享配比 ratio(作品A占比 0-1)与强度 intensity 调节。
 */

import type { ArtworkItem } from './artworksDatabase';
import type { FuseStyle, FuseMethod, FuseIntensity } from './fuseStandards';

export interface FusionContext {
  style: FuseStyle;
  method: FuseMethod;
  intensity: FuseIntensity;
  /** 作品A占比 0-1(0.5 = 均衡) */
  ratio: number;
  artwork1: ArtworkItem | null;
  artwork2: ArtworkItem | null;
}

export type FusionAlgorithm = (ctx: FusionContext) => string;

/* ===========================================================
 * 共享工具
 * =========================================================== */

function describeArtwork(item: ArtworkItem | null, fallback: string): string {
  if (!item) return fallback;
  return `${item.title} by ${item.artist}, ${item.style} style, ${item.era} era, themes: ${item.tags.join(', ')}`;
}

/** 强度 → 英文修饰词 */
function intensityWord(value: number): string {
  if (value <= 0.25) return 'very subtle, gentle, mostly preserving the original character';
  if (value <= 0.5) return 'balanced, harmonious, equal presence of both';
  if (value <= 0.75) return 'strong, deeply integrated, prominently featuring both';
  return 'extreme, radical, complete reimagining';
}

/** 配比 → 主导描述 */
function dominanceWord(ratio: number): string {
  if (ratio >= 0.8) return 'artwork A strongly dominant';
  if (ratio >= 0.6) return 'artwork A leading with artwork B accent';
  if (ratio >= 0.4) return 'equal balance between A and B';
  if (ratio >= 0.2) return 'artwork B leading with artwork A accent';
  return 'artwork B strongly dominant';
}

function qualitySuffix(): string {
  return 'High quality, museum-grade artwork, detailed, professional composition, masterpiece quality.';
}

/* ===========================================================
 * 9 种融合方法 × 9 个独立算法
 * =========================================================== */

/**
 * 构图借鉴:保留 A 构图骨架,B 的内容与风格填入
 * 结构层: A 的构图/视觉重心(ratio 越高越严格)
 * 内容层: B 的元素与色彩
 * 风格层: 目标风格修饰
 */
export const compositionAlgorithm: FusionAlgorithm = (ctx) => {
  const structureFidelity = ctx.ratio >= 0.6
    ? 'Strictly preserve the compositional skeleton, visual weight distribution and focal points of artwork A'
    : 'Loosely reference the compositional structure of artwork A, allowing creative reinterpretation';
  return [
    ctx.style.promptModifier,
    `STRUCTURE LAYER: ${structureFidelity} — ${describeArtwork(ctx.artwork1, 'artwork A')}.`,
    `CONTENT LAYER: Fill this structure with the subject matter, elements and color language of artwork B — ${describeArtwork(ctx.artwork2, 'artwork B')}.`,
    `STYLE LAYER: Render in ${ctx.style.name} manner with ${ctx.style.characteristics.join(', ')}.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 色彩迁移:A 的明暗结构 + B 的色彩体系
 * 结构层: A 的形体与明暗完全保留
 * 色彩层: B 的色相/饱和度(ratio 控制 A 原色保留度)
 * 氛围层: B 的情绪氛围
 */
export const colorTransferAlgorithm: FusionAlgorithm = (ctx) => {
  const originalColorKeep = Math.round((1 - ctx.ratio) * 100);
  return [
    ctx.style.promptModifier,
    `STRUCTURE LAYER: Keep the exact forms, shapes, light-and-shadow structure of artwork A — ${describeArtwork(ctx.artwork1, 'artwork A')} — do not alter any contours.`,
    `COLOR LAYER: Re-paint the entire scene using the color palette, hue harmony and saturation rhythm of artwork B — ${describeArtwork(ctx.artwork2, 'artwork B')} — while retaining ${originalColorKeep}% of A's original tonal identity.`,
    `ATMOSPHERE LAYER: The emotional atmosphere should follow B's mood, filtered through ${ctx.style.name} sensibility (${ctx.style.characteristics.slice(0, 2).join(', ')}).`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 元素融合:A/B 标志性元素有机组合
 * 元素层: 双方各取标志性元素(ratio 决定谁主导)
 * 关联层: 形状/方向/质感的视觉呼应
 * 统一层: 目标风格统一
 */
export const elementFusionAlgorithm: FusionAlgorithm = (ctx) => {
  const lead = ctx.ratio >= 0.5 ? 'A' : 'B';
  const [leadDesc, supportDesc] = lead === 'A'
    ? [describeArtwork(ctx.artwork1, 'artwork A'), describeArtwork(ctx.artwork2, 'artwork B')]
    : [describeArtwork(ctx.artwork2, 'artwork B'), describeArtwork(ctx.artwork1, 'artwork A')];
  return [
    ctx.style.promptModifier,
    `ELEMENT LAYER: Extract the most iconic visual elements from both artworks — leading elements from ${lead} (${leadDesc}), supporting elements from the other (${supportDesc}).`,
    `RELATION LAYER: Weave the two element families together through visual rhymes — echoing shapes, continuing directional flow, complementary textures — so they feel born from one world, not pasted together.`,
    `UNITY LAYER: Unify everything under ${ctx.style.name} style with ${ctx.style.characteristics.join(', ')}.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 风格转换:A 的内容以 B 的艺术语言重新诠释
 * 主题层: A 的主题/内容完整保留
 * 风格层: B 的笔触/色彩/构图法则(ratio 控制转换纯度)
 * 技法层: 目标风格特征
 */
export const styleTransformationAlgorithm: FusionAlgorithm = (ctx) => {
  const purity = ctx.ratio >= 0.6
    ? 'apply B\'s stylistic language thoroughly and authentically'
    : 'blend B\'s stylistic language with traces of A\'s original manner';
  return [
    ctx.style.promptModifier,
    `SUBJECT LAYER: Preserve the complete subject matter and narrative of artwork A — ${describeArtwork(ctx.artwork1, 'artwork A')}.`,
    `STYLE LAYER: Re-interpret it entirely through the artistic language of artwork B — ${describeArtwork(ctx.artwork2, 'artwork B')} — ${purity}: its brushwork logic, color system, compositional principles.`,
    `TECHNIQUE LAYER: Final rendering in ${ctx.style.name} style, emphasizing ${ctx.style.characteristics.join(', ')}.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 场景杂交:两个场景空间并置 + 过渡带
 * 空间层: 左右/上下分景(ratio 控制分割位置)
 * 过渡层: 中间融合带
 * 光影层: 统一光照与空气感
 */
export const hybridLandscapeAlgorithm: FusionAlgorithm = (ctx) => {
  const splitPct = Math.round(ctx.ratio * 100);
  return [
    ctx.style.promptModifier,
    `SPACE LAYER: Compose a split world — the left ${splitPct}% of the canvas shows the scene of artwork A (${describeArtwork(ctx.artwork1, 'artwork A')}), the right ${100 - splitPct}% shows the scene of artwork B (${describeArtwork(ctx.artwork2, 'artwork B')}).`,
    `TRANSITION LAYER: Between the two worlds, design a gradual, poetic transition zone where forms, colors and atmospheres of both sides interpenetrate and dissolve into each other.`,
    `LIGHT LAYER: Unify the whole canvas with consistent light direction and atmospheric perspective, in ${ctx.style.name} style (${ctx.style.characteristics.slice(0, 2).join(', ')}).`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 意境交融:情绪氛围加权混合
 * 氛围层: A 情绪与 B 情绪按 ratio 加权
 * 光影层: 服务氛围的光影设计
 * 色彩层: 情绪引导的色彩倾向
 */
export const moodBlendingAlgorithm: FusionAlgorithm = (ctx) => {
  const aPct = Math.round(ctx.ratio * 100);
  return [
    ctx.style.promptModifier,
    `ATMOSPHERE LAYER: Blend the emotional essence of both artworks — ${aPct}% of artwork A's mood (${describeArtwork(ctx.artwork1, 'artwork A')}) interwoven with ${100 - aPct}% of artwork B's feeling (${describeArtwork(ctx.artwork2, 'artwork B')}). Prioritize emotional resonance over literal depiction.`,
    `LIGHT LAYER: Design lighting that carries this blended emotion — direction, softness, temperature all serving the atmosphere.`,
    `COLOR LAYER: Let the blended emotion guide a coherent color temperature and tonal range, expressed through ${ctx.style.name} style with ${ctx.style.characteristics.join(', ')}.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 局部置换:A 主体 + B 环境
 * 主体层: A 的主体完整突出
 * 环境层: B 的背景/氛围替换 A 的背景(ratio 控制置换范围)
 * 边缘层: 主体与环境的融合处理
 */
export const regionSwapAlgorithm: FusionAlgorithm = (ctx) => {
  const envCoverage = Math.round((1 - ctx.ratio) * 100);
  return [
    ctx.style.promptModifier,
    `SUBJECT LAYER: The main subject of artwork A (${describeArtwork(ctx.artwork1, 'artwork A')}) stays intact, sharp and visually dominant.`,
    `ENVIRONMENT LAYER: Replace A's background and secondary regions (about ${envCoverage}% of the canvas) with the environment, spatial depth and ambient world of artwork B (${describeArtwork(ctx.artwork2, 'artwork B')}).`,
    `EDGE LAYER: Blend the subject into its new environment with natural edge transitions — reflected ambient light on the subject, atmospheric haze at the boundary — rendered in ${ctx.style.name} style.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 材质嫁接:A 形态 + B 材质肌理
 * 形态层: A 的轮廓与结构
 * 材质层: B 的表面肌理(ratio 控制覆盖度)
 * 光照层: 统一光照保持体积
 */
export const materialGraftAlgorithm: FusionAlgorithm = (ctx) => {
  const coverage = Math.round(ctx.ratio * 100);
  return [
    ctx.style.promptModifier,
    `FORM LAYER: Preserve the silhouettes, structural contours and spatial arrangement of artwork A — ${describeArtwork(ctx.artwork1, 'artwork A')}.`,
    `MATERIAL LAYER: Re-skin these forms with the material texture and tactile surface quality of artwork B — ${describeArtwork(ctx.artwork2, 'artwork B')} — covering about ${coverage}% of all surfaces (glaze, grain, weave, patina... as B dictates).`,
    `LIGHT LAYER: Keep a single consistent light source so the new materials read with believable volume and sheen, finished in ${ctx.style.name} style (${ctx.style.characteristics.slice(0, 2).join(', ')}).`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/**
 * 时空折叠:同一画面中并置两个时代
 * 时空层: A 的时代符号 + B 的时代符号
 * 对照层: 同空间的古今对话(ratio 控制古今比例)
 * 透视层: 统一空间透视
 */
export const timeFoldAlgorithm: FusionAlgorithm = (ctx) => {
  const aEraPct = Math.round(ctx.ratio * 100);
  return [
    ctx.style.promptModifier,
    `TIME LAYER: One continuous scene where two eras coexist — ${aEraPct}% drawn from artwork A's time (${describeArtwork(ctx.artwork1, 'artwork A')}), ${100 - aEraPct}% from artwork B's era (${describeArtwork(ctx.artwork2, 'artwork B')}).`,
    `DIALOGUE LAYER: Create a poetic conversation between the two times — an ancient path continuing into a modern city, a traditional figure lit by contemporary neon — the seam between eras should feel intentional and meaningful.`,
    `PERSPECTIVE LAYER: Both timelines share one unified perspective and spatial logic, rendered in ${ctx.style.name} style with ${ctx.style.characteristics.join(', ')}.`,
    `Fusion balance: ${dominanceWord(ctx.ratio)}; intensity: ${intensityWord(ctx.intensity.value)}.`,
    qualitySuffix(),
  ].join(' ');
};

/* ===========================================================
 * 算法注册表 + 统一入口
 * =========================================================== */

export const FUSION_ALGORITHMS: Record<string, FusionAlgorithm> = {
  composition: compositionAlgorithm,
  'color-transfer': colorTransferAlgorithm,
  'element-fusion': elementFusionAlgorithm,
  'style-transformation': styleTransformationAlgorithm,
  'hybrid-landscape': hybridLandscapeAlgorithm,
  'mood-blending': moodBlendingAlgorithm,
  'region-swap': regionSwapAlgorithm,
  'material-graft': materialGraftAlgorithm,
  'time-fold': timeFoldAlgorithm,
};

/**
 * 统一构建入口:按方法 id 调度对应算法
 * 未知方法回退到元素融合算法
 */
export function buildFusionPrompt(ctx: FusionContext): string {
  const algorithm = FUSION_ALGORITHMS[ctx.method.id] ?? elementFusionAlgorithm;
  return algorithm(ctx);
}
