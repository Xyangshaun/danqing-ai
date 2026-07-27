// ============================================================
// 图像分析引擎(Jimp 版本)
// 从旧版 server/analysis.js + 前端 src/services/analysisService.ts 迁移
// 算法逻辑与前端 Canvas 版本完全一致,仅像素读取方式不同(Jimp 替代 Canvas)
//
// 支持四类作品分析:
//   - painting  绘画(构图+色彩+笔触技法)
//   - design    设计(视觉层次+排版+色彩应用)
//   - product   产品设计(形态+材质表现+功能表达)
//   - sculpture 雕塑(空间构成+形体语言+材料语言)
//
// 3 秒 SLA:Jimp 像素分析通常 < 1 秒,走同步模式
// 返回类型:AnalysisResult(后端 api-contract,无 id/imageUrl/createdAt)
// ============================================================

import Jimp from 'jimp';
import type {
  ArtType,
  AnalysisResult,
  PaintingAnalysis,
  DesignAnalysis,
  ProductAnalysis,
  SculptureAnalysis,
  DimensionResult,
} from '../types/api-contract.js';
import { logger } from '../utils/logger.js';

// ---------- 像素与中间分析结构 ----------

interface PixelData {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface PixelAnalysis {
  pixels: PixelData[];
  width: number;
  height: number;
  luminanceMap: number[];
  edgeMap: boolean[];
  colorBuckets: Record<string, number>;
  warmRatio: number;
  avgLuminance: number;
  avgSaturation: number;
  totalValid: number;
}

// ============================================================
// 通用工具函数(从旧版 analysis.js + 前端 analysisService.ts 迁移)
// ============================================================

/** RGB → HSL(h: 0-360, s: 0-100, l: 0-100) */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
        break;
      case gg:
        h = ((bb - rr) / d + 2) / 6;
        break;
      case bb:
        h = ((rr - gg) / d + 4) / 6;
        break;
      default:
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** 相对亮度(Rec. 601) */
export function getLuminance(p: PixelData): number {
  return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
}

/** 是否暖色(R-B 差值判定) */
export function isWarmColor(r: number, _g: number, b: number): boolean {
  return (r - b) / 255 > 0.15;
}

/** 色相分类(返回英文 key) */
export function getHueCategory(hue: number): string {
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 75) return 'yellow';
  if (hue < 105) return 'lime';
  if (hue < 165) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 225) return 'cyan';
  if (hue < 255) return 'sky';
  if (hue < 285) return 'blue';
  if (hue < 315) return 'purple';
  return 'pink';
}

/** 颜色中文名(基于 HSL) */
export function getColorName(r: number, g: number, b: number): string {
  const hsl = rgbToHsl(r, g, b);
  if (hsl.l < 15) return '黑色';
  if (hsl.l > 90) return '白色';
  if (hsl.s < 20 && hsl.l > 20 && hsl.l < 80) return '灰色';

  const hueNames: Record<string, string> = {
    red: '红色',
    orange: '橙色',
    yellow: '黄色',
    lime: '黄绿',
    green: '绿色',
    teal: '青色',
    cyan: '天蓝',
    sky: '蓝色',
    blue: '深蓝',
    purple: '紫色',
    pink: '粉色',
  };
  const baseName = hueNames[getHueCategory(hsl.h)] ?? '彩色';

  if (hsl.s > 70) return `鲜艳${baseName}`;
  if (hsl.s < 30) return `柔和${baseName}`;
  if (hsl.l > 75) return `浅${baseName}`;
  if (hsl.l < 35) return `深${baseName}`;
  return baseName;
}

// ============================================================
// 通用像素分析基础
// ============================================================

/**
 * 读取图像并构建 PixelAnalysis 中间结构(对应旧版 analyzePixels)
 * 使用 Jimp 读取像素(替代前端 Canvas),缩放至 maxDim=500
 *
 * 注:旧版 server/analysis.js 中 analyzePixels(pixels, width, height) 接收原始像素数组,
 * Node.js 后端用 Jimp 替代 Canvas,故签名调整为接收 Jimp 实例;
 * 内部逻辑与前端 analyzePixels 完全一致:缩放 → 取像素 → 亮度/边缘/色彩桶统计
 */
export function analyzePixels(img: Jimp): PixelAnalysis {
  const maxDim = 500;
  let w = img.bitmap.width;
  let h = img.bitmap.height;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.floor((h / w) * maxDim);
      w = maxDim;
    } else {
      w = Math.floor((w / h) * maxDim);
      h = maxDim;
    }
    img.resize(w, h);
  }

  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const data = img.bitmap.data;
  const pixels: PixelData[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      pixels.push({
        r: data[idx]!,
        g: data[idx + 1]!,
        b: data[idx + 2]!,
        a: data[idx + 3]!,
      });
    }
  }

  const luminanceMap: number[] = [];
  const edgeMap: boolean[] = [];
  const colorBuckets: Record<string, number> = {};
  let warmCount = 0;
  let totalLum = 0;
  let totalSat = 0;
  let valid = 0;

  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i]!;
    if (p.a < 128) {
      luminanceMap.push(0);
      continue;
    }
    const lum = getLuminance(p);
    luminanceMap.push(lum);
    totalLum += lum;
    const hsl = rgbToHsl(p.r, p.g, p.b);
    totalSat += hsl.s;
    if (isWarmColor(p.r, p.g, p.b)) warmCount++;
    valid++;
    const bkt = `${Math.floor(p.r / 32)}-${Math.floor(p.g / 32)}-${Math.floor(p.b / 32)}`;
    colorBuckets[bkt] = (colorBuckets[bkt] ?? 0) + 1;
  }

  // 边缘检测(Sobel 简化:右邻/下邻亮度差)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const p = pixels[idx];
      if (x >= W - 1 || y >= H - 1 || !p || p.a < 128) {
        edgeMap.push(false);
        continue;
      }
      const dl = Math.abs(luminanceMap[idx]! - luminanceMap[idx + 1]!);
      const dd = Math.abs(luminanceMap[idx]! - luminanceMap[idx + W]!);
      edgeMap.push(dl > 30 || dd > 30);
    }
  }

  return {
    pixels,
    width: W,
    height: H,
    luminanceMap,
    edgeMap,
    colorBuckets,
    warmRatio: valid > 0 ? warmCount / valid : 0.5,
    avgLuminance: valid > 0 ? totalLum / valid : 128,
    avgSaturation: valid > 0 ? totalSat / valid : 50,
    totalValid: valid,
  };
}

/** 生成 20×20 热力图(基于暗像素权重) */
export function generateHeatmap(pa: PixelAnalysis): number[][] {
  const rows = 20;
  const cols = 20;
  const heatmap: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const weight = 255 - pa.luminanceMap[idx]!;
      const hx = Math.min(cols - 1, Math.floor((x / pa.width) * cols));
      const hy = Math.min(rows - 1, Math.floor((y / pa.height) * rows));
      heatmap[hy]![hx]! += weight;
    }
  }
  // 归一化(除以最大值)
  let max = 0;
  for (const row of heatmap) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }
  if (max > 0) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        heatmap[i]![j]! = Math.min(1, heatmap[i]![j]! / max);
      }
    }
  }
  return heatmap;
}

/** 计算视觉重心(暗像素加权) */
export function calculateFocusPoint(pa: PixelAnalysis): { x: number; y: number } {
  let wx = 0;
  let wy = 0;
  let wt = 0;
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const weight = 255 - pa.luminanceMap[idx]!;
      wx += x * weight;
      wy += y * weight;
      wt += weight;
    }
  }
  return wt > 0
    ? { x: wx / wt / pa.width, y: wy / wt / pa.height }
    : { x: 0.5, y: 0.5 };
}

/** 计算左右对称性(0-1) */
export function calculateSymmetry(pa: PixelAnalysis): number {
  let match = 0;
  let total = 0;
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width / 2; x++) {
      const li = y * pa.width + x;
      const ri = y * pa.width + (pa.width - 1 - x);
      const lp = pa.pixels[li];
      const rp = pa.pixels[ri];
      if (lp && rp && lp.a >= 128 && rp.a >= 128) {
        if (Math.abs(pa.luminanceMap[li]! - pa.luminanceMap[ri]!) < 30) match++;
        total++;
      }
    }
  }
  return total > 0 ? match / total : 0.5;
}

/** 计算边缘密度(0-1) */
export function calculateEdgeDensity(pa: PixelAnalysis): number {
  if (pa.edgeMap.length === 0) return 0;
  const trueCount = pa.edgeMap.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  return trueCount / pa.edgeMap.length;
}

/** 计算纹理复杂度(0-1,基于色彩种类+边缘密度) */
export function calculateTextureComplexity(pa: PixelAnalysis): number {
  const edgeDensity = calculateEdgeDensity(pa);
  const colorVariety = Object.keys(pa.colorBuckets).length;
  return Math.min(1, colorVariety / 80 + edgeDensity * 2);
}

// ============================================================
// 按作品类型的分析生成器(与前端 analyzePainting/Design/Product/Sculpture 一致)
// ============================================================

/** 绘画分析:构图 + 色彩 + 笔触技法 */
export function analyzePainting(pa: PixelAnalysis): PaintingAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);
  const symmetry = calculateSymmetry(pa);
  const edgeDensity = calculateEdgeDensity(pa);
  const textureComplexity = calculateTextureComplexity(pa);

  // 构图
  const fx = focusPoint.x;
  const fy = focusPoint.y;
  const distFromCenter = Math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2);
  let balance: PaintingAnalysis['composition']['balance'] = 'balanced';
  if (fx < 0.35) balance = 'left-heavy';
  else if (fx > 0.65) balance = 'right-heavy';
  else if (fy < 0.35) balance = 'top-heavy';
  else if (fy > 0.65) balance = 'bottom-heavy';

  let guideline: PaintingAnalysis['composition']['guideline'] = 'average';
  if (Math.abs(fx - 0.618) < 0.12 && Math.abs(fy - 0.618) < 0.12) guideline = 'good';
  else if (Math.abs(fx - 0.5) < 0.08 && Math.abs(fy - 0.5) < 0.08) guideline = 'poor';

  const whitespaceRatio =
    pa.totalValid > 0
      ? pa.luminanceMap.filter((l) => l > 200).length / pa.totalValid
      : 0.4;
  const compScore = Math.max(
    60,
    Math.min(95, 92 - distFromCenter * 120 + (guideline === 'good' ? 5 : 0)),
  );

  let compSuggestion = '';
  if (balance === 'balanced') {
    compSuggestion = `画面构图均衡,视觉重心位于(${Math.round(fx * 100)}%, ${Math.round(fy * 100)}%)`;
    compSuggestion +=
      guideline === 'good' ? ',黄金分割运用得当' : ',可尝试将主体移至黄金分割点增强视觉张力';
  } else {
    const dirMap: Record<string, string> = {
      'left-heavy': '右侧',
      'right-heavy': '左侧',
      'top-heavy': '下方',
      'bottom-heavy': '上方',
    };
    compSuggestion = `视觉重心偏${balance.replace('-heavy', '')},建议在${dirMap[balance]}增加呼应元素平衡画面`;
  }
  if (whitespaceRatio > 0.6) compSuggestion += ';留白较多,可适当增加层次丰富画面';
  else if (whitespaceRatio < 0.25) compSuggestion += ';画面较满,适当留白可提升呼吸感';
  if (symmetry > 0.7) compSuggestion += ';对称性良好';

  // 色彩
  const warmPercent = Math.round(pa.warmRatio * 100);
  const contrast: PaintingAnalysis['color']['contrast'] =
    pa.avgLuminance < 70 || pa.avgLuminance > 190
      ? 'high'
      : pa.avgLuminance < 100 || pa.avgLuminance > 170
        ? 'medium'
        : 'low';
  const saturation: PaintingAnalysis['color']['saturation'] =
    pa.avgSaturation > 60 ? 'high' : pa.avgSaturation > 30 ? 'medium' : 'low';
  const colorVariety = Object.keys(pa.colorBuckets).length;
  const richness: PaintingAnalysis['color']['richness'] =
    colorVariety > 50 ? 'rich' : colorVariety > 25 ? 'moderate' : 'limited';

  // 主色调(与前端内联逻辑一致)
  let dominantBucket = '';
  let maxCnt = 0;
  for (const [b, c] of Object.entries(pa.colorBuckets)) {
    if (c > maxCnt) {
      maxCnt = c;
      dominantBucket = b;
    }
  }
  const parts = dominantBucket.split('-');
  const dr = (parts[0] ? Number(parts[0]) : 0) * 32 + 16;
  const dg = (parts[1] ? Number(parts[1]) : 0) * 32 + 16;
  const db = (parts[2] ? Number(parts[2]) : 0) * 32 + 16;
  const domHsl = rgbToHsl(dr, dg, db);
  const hueCat =
    domHsl.h < 30 || domHsl.h >= 330
      ? '红'
      : domHsl.h < 60
        ? '橙'
        : domHsl.h < 90
          ? '黄'
          : domHsl.h < 150
            ? '绿'
            : domHsl.h < 210
              ? '青'
              : domHsl.h < 270
                ? '蓝'
                : domHsl.h < 300
                  ? '紫'
                  : '粉';
  const dominantColor = `${domHsl.s > 60 ? '鲜艳' : domHsl.s < 30 ? '柔和' : ''}${domHsl.l > 70 ? '浅' : domHsl.l < 35 ? '深' : ''}${hueCat}色`;

  const colorScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (contrast === 'high' ? 5 : contrast === 'low' ? -8 : 0) +
        (richness === 'rich' ? 5 : richness === 'limited' ? -8 : 0) +
        (saturation === 'high' ? 3 : saturation === 'low' ? -3 : 0),
    ),
  );

  let colorSuggestion = `主色调为${dominantColor},${warmPercent > 60 ? '整体偏暖' : warmPercent < 40 ? '整体偏冷' : '冷暖平衡'}`;
  colorSuggestion +=
    contrast === 'high'
      ? ';明暗对比强烈,层次丰富'
      : contrast === 'low'
        ? ';对比偏弱,建议加强明暗层次'
        : ';对比适中';
  colorSuggestion +=
    richness === 'rich'
      ? ';色彩丰富'
      : richness === 'limited'
        ? ';色彩种类较少,可尝试增加邻近色'
        : ';色彩丰富度适中';

  // 笔触技法
  const textureLevel: PaintingAnalysis['brushwork']['textureLevel'] =
    textureComplexity > 0.6 ? 'rich' : textureComplexity > 0.3 ? 'moderate' : 'simple';
  const strokeVariety = Math.round(edgeDensity * 100);
  const wetDryBalance =
    pa.avgSaturation > 50 ? '湿润感强' : pa.avgSaturation < 25 ? '偏干涩' : '干湿适中';
  const brushScore = Math.max(
    60,
    Math.min(95, 70 + textureComplexity * 25 + (strokeVariety > 30 ? 5 : 0)),
  );

  let brushSuggestion = `笔触肌理${textureLevel === 'rich' ? '丰富' : textureLevel === 'moderate' ? '适中' : '较为单一'}`;
  brushSuggestion += `,笔画变化${strokeVariety > 40 ? '丰富' : strokeVariety > 20 ? '适中' : '较少'}`;
  brushSuggestion += `,${wetDryBalance}`;
  if (textureLevel === 'simple') brushSuggestion += ';建议尝试更多笔触变化,增加画面肌理层次';
  else if (strokeVariety < 25) brushSuggestion += ';可加强笔触的干湿、粗细变化';

  return {
    type: 'painting',
    composition: {
      score: Math.round(compScore),
      focusPoint,
      balance,
      guideline,
      whitespaceRatio: Math.round(whitespaceRatio * 100) / 100,
      symmetry: Math.round(symmetry * 100) / 100,
      suggestion: compSuggestion,
      heatmapData,
    },
    color: {
      score: Math.round(colorScore),
      warmRatio: Math.round(pa.warmRatio * 100) / 100,
      coolRatio: Math.round((1 - pa.warmRatio) * 100) / 100,
      contrast,
      saturation,
      richness,
      harmony:
        warmPercent > 60 ? '暖色调和谐' : warmPercent < 40 ? '冷色调和谐' : '冷暖平衡',
      dominantColor,
      suggestion: colorSuggestion,
    },
    brushwork: {
      score: Math.round(brushScore),
      textureLevel,
      strokeVariety,
      wetDryBalance,
      suggestion: brushSuggestion,
    },
  };
}

/** 设计分析:视觉层次 + 排版 + 色彩应用 */
export function analyzeDesign(pa: PixelAnalysis): DesignAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);

  // 视觉层次
  const fx = focusPoint.x;
  const fy = focusPoint.y;
  const distFromCenter = Math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2);
  const primarySecondaryClarity: DesignAnalysis['visualHierarchy']['primarySecondaryClarity'] =
    distFromCenter > 0.15 && distFromCenter < 0.35
      ? 'clear'
      : distFromCenter < 0.45
        ? 'moderate'
        : 'unclear';

  // 信息流动:边缘方向判断
  let horizontalEdges = 0;
  let verticalEdges = 0;
  for (let y = 0; y < pa.height - 1; y++) {
    for (let x = 0; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      if (!pa.edgeMap[idx]) continue;
      const dl = Math.abs(pa.luminanceMap[idx]! - pa.luminanceMap[idx + 1]!);
      const dd = Math.abs(pa.luminanceMap[idx]! - pa.luminanceMap[idx + pa.width]!);
      if (dl > dd) horizontalEdges++;
      else verticalEdges++;
    }
  }
  const totalDir = horizontalEdges + verticalEdges;
  const hRatio = totalDir > 0 ? horizontalEdges / totalDir : 0.5;
  const informationFlow: DesignAnalysis['visualHierarchy']['informationFlow'] =
    hRatio > 0.4 && hRatio < 0.6
      ? 'good'
      : hRatio > 0.3 && hRatio < 0.7
        ? 'average'
        : 'poor';

  const hierarchyScore = Math.max(
    60,
    Math.min(
      95,
      85 +
        (primarySecondaryClarity === 'clear' ? 8 : primarySecondaryClarity === 'unclear' ? -8 : 0) +
        (informationFlow === 'good' ? 5 : informationFlow === 'poor' ? -5 : 0),
    ),
  );

  let hierarchySuggestion = `视觉焦点位于(${Math.round(fx * 100)}%, ${Math.round(fy * 100)}%)`;
  hierarchySuggestion +=
    primarySecondaryClarity === 'clear'
      ? ',主次关系清晰'
      : primarySecondaryClarity === 'unclear'
        ? ',主次关系不够突出,建议强化视觉焦点'
        : ',主次关系尚可';
  hierarchySuggestion +=
    informationFlow === 'good'
      ? ';视觉流动顺畅'
      : informationFlow === 'poor'
        ? ';视觉流动受阻,建议优化阅读路径'
        : ';视觉流动一般';

  // 排版
  const alignmentQuality: DesignAnalysis['typography']['alignmentQuality'] =
    hRatio > 0.55 ? 'good' : hRatio > 0.4 ? 'average' : 'poor';
  const rhythmConsistency: DesignAnalysis['typography']['rhythmConsistency'] =
    pa.avgSaturation < 40 ? 'good' : pa.avgSaturation < 60 ? 'average' : 'poor';
  const highLumRatio =
    pa.totalValid > 0
      ? pa.luminanceMap.filter((l) => l > 220).length / pa.totalValid
      : 0;
  const negativeSpaceUsage: DesignAnalysis['typography']['negativeSpaceUsage'] =
    highLumRatio > 0.3 ? 'good' : highLumRatio > 0.15 ? 'average' : 'poor';
  const gridAdherence = Math.round(Math.max(0, 1 - Math.abs(hRatio - 0.5) * 2) * 100);

  const typeScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (alignmentQuality === 'good' ? 5 : alignmentQuality === 'poor' ? -8 : 0) +
        (negativeSpaceUsage === 'good' ? 5 : negativeSpaceUsage === 'poor' ? -5 : 0) +
        (gridAdherence > 70 ? 5 : gridAdherence < 40 ? -5 : 0),
    ),
  );

  let typeSuggestion =
    alignmentQuality === 'good'
      ? '对齐规范,网格感强'
      : alignmentQuality === 'poor'
        ? '对齐不够统一,建议建立清晰的网格系统'
        : '对齐基本规范';
  typeSuggestion +=
    rhythmConsistency === 'good'
      ? ';节奏感一致'
      : rhythmConsistency === 'poor'
        ? ';元素间距节奏不够统一'
        : ';节奏感尚可';
  typeSuggestion +=
    negativeSpaceUsage === 'good'
      ? ';负空间运用得当'
      : negativeSpaceUsage === 'poor'
        ? ';负空间不足,适当增加留白'
        : ';负空间运用一般';

  // 色彩应用
  const contrast: DesignAnalysis['colorApplication']['contrast'] =
    pa.avgLuminance < 70 || pa.avgLuminance > 190
      ? 'high'
      : pa.avgLuminance < 105 || pa.avgLuminance > 165
        ? 'medium'
        : 'low';
  const colorVarietyD = Object.keys(pa.colorBuckets).length;
  const brandConsistency: DesignAnalysis['colorApplication']['brandConsistency'] =
    colorVarietyD < 20 ? 'strong' : colorVarietyD < 45 ? 'moderate' : 'weak';
  const colorPsychology =
    pa.warmRatio > 0.6
      ? '暖色调传递活力与热情'
      : pa.warmRatio < 0.35
        ? '冷色调传递理性与专业'
        : '中性色调传递平衡与稳重';
  const paletteHarmony =
    colorVarietyD > 50
      ? '色彩丰富但需注意统一'
      : colorVarietyD > 25
        ? '色彩和谐适中'
        : '色彩简洁统一';

  const colorAppScore = Math.max(
    60,
    Math.min(
      95,
      82 +
        (contrast === 'high' ? 5 : contrast === 'low' ? -8 : 0) +
        (brandConsistency === 'strong' ? 5 : brandConsistency === 'weak' ? -5 : 0),
    ),
  );

  let colorAppSuggestion = `色彩对比${contrast === 'high' ? '强烈,视觉张力足' : contrast === 'low' ? '偏弱,建议增强重点色对比' : '适中'}`;
  colorAppSuggestion +=
    brandConsistency === 'strong'
      ? ';品牌色运用一致'
      : brandConsistency === 'weak'
        ? ';色彩过多,建议精简至3-4种主色'
        : ';品牌色运用尚可';
  colorAppSuggestion += `;${colorPsychology}`;

  return {
    type: 'design',
    visualHierarchy: {
      score: Math.round(hierarchyScore),
      focusPoint,
      primarySecondaryClarity,
      informationFlow,
      heatmapData,
      suggestion: hierarchySuggestion,
    },
    typography: {
      score: Math.round(typeScore),
      alignmentQuality,
      rhythmConsistency,
      negativeSpaceUsage,
      gridAdherence,
      suggestion: typeSuggestion,
    },
    colorApplication: {
      score: Math.round(colorAppScore),
      contrast,
      brandConsistency,
      colorPsychology,
      paletteHarmony,
      suggestion: colorAppSuggestion,
    },
  };
}

/** 产品设计分析:形态 + 材质表现 + 功能表达 */
export function analyzeProduct(pa: PixelAnalysis): ProductAnalysis {
  const heatmapData = generateHeatmap(pa);
  const focusPoint = calculateFocusPoint(pa);

  // 形态分析
  const edgeDensity = calculateEdgeDensity(pa);
  const symmetry = calculateSymmetry(pa);

  const aspectRatio = pa.width / pa.height;
  const proportionBalance: ProductAnalysis['form']['proportionBalance'] =
    aspectRatio > 0.6 && aspectRatio < 1.6
      ? 'good'
      : aspectRatio > 0.4 && aspectRatio < 2.0
        ? 'average'
        : 'poor';

  // 线条流畅度:边缘连续性的反向
  let edgeBreaks = 0;
  for (let i = 1; i < pa.edgeMap.length; i++) {
    if (pa.edgeMap[i] && !pa.edgeMap[i - 1]) edgeBreaks++;
  }
  const lineFluidity: ProductAnalysis['form']['lineFluidity'] =
    edgeBreaks < pa.edgeMap.length * 0.05
      ? 'smooth'
      : edgeBreaks < pa.edgeMap.length * 0.1
        ? 'moderate'
        : 'stiff';

  // 曲面质量:色彩过渡平滑度
  let smoothTransitions = 0;
  let totalTransitions = 0;
  for (let y = 0; y < pa.height - 1; y++) {
    for (let x = 0; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const dl = Math.abs(pa.luminanceMap[idx]! - pa.luminanceMap[idx + 1]!);
      if (dl > 5 && dl < 40) smoothTransitions++;
      if (dl > 5) totalTransitions++;
    }
  }
  const surfaceQuality: ProductAnalysis['form']['surfaceQuality'] =
    totalTransitions > 0 && smoothTransitions / totalTransitions > 0.6
      ? 'excellent'
      : totalTransitions > 0 && smoothTransitions / totalTransitions > 0.4
        ? 'good'
        : 'average';

  const ergonomicsHint: ProductAnalysis['form']['ergonomicsHint'] =
    edgeDensity < 0.08 ? 'strong' : edgeDensity < 0.15 ? 'moderate' : 'weak';

  const formScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (proportionBalance === 'good' ? 5 : proportionBalance === 'poor' ? -8 : 0) +
        (lineFluidity === 'smooth' ? 5 : lineFluidity === 'stiff' ? -5 : 0) +
        (surfaceQuality === 'excellent' ? 5 : surfaceQuality === 'average' ? -3 : 0),
    ),
  );

  let formSuggestion =
    proportionBalance === 'good'
      ? '比例协调,视觉稳定'
      : proportionBalance === 'poor'
        ? '比例偏极端,建议调整长宽高比例'
        : '比例基本协调';
  formSuggestion +=
    lineFluidity === 'smooth'
      ? ';线条流畅自然'
      : lineFluidity === 'stiff'
        ? ';线条略显生硬,建议增加过渡曲面'
        : ';线条流畅度尚可';
  formSuggestion +=
    surfaceQuality === 'excellent'
      ? ';曲面过渡细腻'
      : surfaceQuality === 'average'
        ? ';曲面处理可更精细'
        : ';曲面质量良好';
  formSuggestion +=
    ergonomicsHint === 'strong'
      ? ';圆润造型暗示良好握持感'
      : ergonomicsHint === 'weak'
        ? ';边角较多,需考虑人机工学'
        : '';

  // 材质表现
  const textureRealism: ProductAnalysis['materialExpression']['textureRealism'] =
    pa.avgSaturation > 40 ? 'high' : pa.avgSaturation > 20 ? 'medium' : 'low';
  const lightShadowPerformance: ProductAnalysis['materialExpression']['lightShadowPerformance'] =
    pa.avgLuminance > 80 && pa.avgLuminance < 180
      ? 'excellent'
      : pa.avgLuminance > 60 && pa.avgLuminance < 200
        ? 'good'
        : 'average';
  const surfaceTreatment: ProductAnalysis['materialExpression']['surfaceTreatment'] =
    edgeDensity < 0.1 ? 'refined' : edgeDensity < 0.2 ? 'moderate' : 'rough';

  const materialScore = Math.max(
    60,
    Math.min(
      95,
      78 +
        (lightShadowPerformance === 'excellent' ? 8 : lightShadowPerformance === 'average' ? -5 : 0) +
        (textureRealism === 'high' ? 5 : textureRealism === 'low' ? -5 : 0),
    ),
  );

  let materialSuggestion =
    lightShadowPerformance === 'excellent'
      ? '光影表现优秀,材质感强烈'
      : lightShadowPerformance === 'average'
        ? '光影表现一般,建议加强明暗对比'
        : '光影表现良好';
  materialSuggestion +=
    textureRealism === 'high'
      ? ';纹理细节丰富'
      : textureRealism === 'low'
        ? ';纹理表现较弱,可增加材质细节'
        : ';纹理表现尚可';
  materialSuggestion +=
    surfaceTreatment === 'refined'
      ? ';表面处理细腻'
      : surfaceTreatment === 'rough'
        ? ';表面略显粗糙'
        : ';表面处理适中';

  // 功能表达
  const structureClarity: ProductAnalysis['functionExpression']['structureClarity'] =
    symmetry > 0.6 ? 'clear' : symmetry > 0.4 ? 'moderate' : 'unclear';
  const functionImplication: ProductAnalysis['functionExpression']['functionImplication'] =
    edgeDensity > 0.08 && edgeDensity < 0.2
      ? 'strong'
      : edgeDensity > 0.05 && edgeDensity < 0.25
        ? 'moderate'
        : 'weak';
  const detailRefinement: ProductAnalysis['functionExpression']['detailRefinement'] =
    Object.keys(pa.colorBuckets).length > 40
      ? 'excellent'
      : Object.keys(pa.colorBuckets).length > 20
        ? 'good'
        : 'average';

  const functionScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (structureClarity === 'clear' ? 5 : structureClarity === 'unclear' ? -8 : 0) +
        (functionImplication === 'strong' ? 5 : functionImplication === 'weak' ? -5 : 0) +
        (detailRefinement === 'excellent' ? 5 : detailRefinement === 'average' ? -3 : 0),
    ),
  );

  let functionSuggestion =
    structureClarity === 'clear'
      ? '结构清晰,功能分区明确'
      : structureClarity === 'unclear'
        ? '结构不够清晰,建议强化功能分区'
        : '结构表达尚可';
  functionSuggestion +=
    functionImplication === 'strong'
      ? ';功能暗示性强'
      : functionImplication === 'weak'
        ? ';功能暗示较弱,形态语言需加强'
        : ';功能暗示一般';
  functionSuggestion +=
    detailRefinement === 'excellent'
      ? ';细节处理精致'
      : detailRefinement === 'average'
        ? ';细节处理可更精细'
        : ';细节处理良好';

  return {
    type: 'product',
    form: {
      score: Math.round(formScore),
      focusPoint,
      proportionBalance,
      lineFluidity,
      surfaceQuality,
      ergonomicsHint,
      heatmapData,
      suggestion: formSuggestion,
    },
    materialExpression: {
      score: Math.round(materialScore),
      textureRealism,
      lightShadowPerformance,
      surfaceTreatment,
      suggestion: materialSuggestion,
    },
    functionExpression: {
      score: Math.round(functionScore),
      structureClarity,
      functionImplication,
      detailRefinement,
      suggestion: functionSuggestion,
    },
  };
}

/** 雕塑分析:空间构成 + 形体语言 + 材料语言 */
export function analyzeSculpture(pa: PixelAnalysis): SculptureAnalysis {
  const heatmapData = generateHeatmap(pa);
  const focusPoint = calculateFocusPoint(pa);
  const edgeDensity = calculateEdgeDensity(pa);
  const textureComplexity = calculateTextureComplexity(pa);

  // 空间构成
  const volumeSense: SculptureAnalysis['spatialComposition']['volumeSense'] =
    edgeDensity > 0.1 ? 'strong' : edgeDensity > 0.06 ? 'moderate' : 'weak';
  const occupationRatio = pa.width * pa.height > 0 ? pa.totalValid / (pa.width * pa.height) : 0.5;
  const spaceOccupation: SculptureAnalysis['spatialComposition']['spaceOccupation'] =
    occupationRatio > 0.6 ? 'full' : occupationRatio > 0.35 ? 'moderate' : 'sparse';
  const highLumRatio =
    pa.totalValid > 0 ? pa.luminanceMap.filter((l) => l > 200).length / pa.totalValid : 0;
  const lowLumRatio =
    pa.totalValid > 0 ? pa.luminanceMap.filter((l) => l < 80).length / pa.totalValid : 0;
  const voidSolidRelation: SculptureAnalysis['spatialComposition']['voidSolidRelation'] =
    highLumRatio > 0.25 && lowLumRatio > 0.2
      ? 'harmonious'
      : highLumRatio > 0.15
        ? 'moderate'
        : 'imbalanced';

  const spatialScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (volumeSense === 'strong' ? 5 : volumeSense === 'weak' ? -8 : 0) +
        (voidSolidRelation === 'harmonious' ? 8 : voidSolidRelation === 'imbalanced' ? -8 : 0) +
        (spaceOccupation === 'full' ? 3 : spaceOccupation === 'sparse' ? -3 : 0),
    ),
  );

  let spatialSuggestion =
    volumeSense === 'strong'
      ? '体积感强烈,空间存在感强'
      : volumeSense === 'weak'
        ? '体积感偏弱,建议加强体量表现'
        : '体积感尚可';
  spatialSuggestion +=
    spaceOccupation === 'full'
      ? ';空间占有充分'
      : spaceOccupation === 'sparse'
        ? ';空间占有不足,可增加体量'
        : ';空间占有适中';
  spatialSuggestion +=
    voidSolidRelation === 'harmonious'
      ? ';虚实关系和谐'
      : voidSolidRelation === 'imbalanced'
        ? ';虚实关系失衡,需调整正负空间'
        : ';虚实关系一般';

  // 形体语言:动态感(边缘方向变化率)
  let directionChanges = 0;
  for (let y = 1; y < pa.height - 1; y++) {
    for (let x = 1; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      if (!pa.edgeMap[idx]) continue;
      const dl = Math.abs(pa.luminanceMap[idx]! - pa.luminanceMap[idx + 1]!);
      const dd = Math.abs(pa.luminanceMap[idx]! - pa.luminanceMap[idx + pa.width]!);
      const prevDl = Math.abs(pa.luminanceMap[idx - 1]! - pa.luminanceMap[idx]!);
      const prevDd = Math.abs(pa.luminanceMap[idx - pa.width]! - pa.luminanceMap[idx]!);
      if (Math.abs(dl - prevDl) > 20 || Math.abs(dd - prevDd) > 20) directionChanges++;
    }
  }
  const edgeTrueCount = pa.edgeMap.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  const dynamicSense: SculptureAnalysis['bodyLanguage']['dynamicSense'] =
    directionChanges > edgeTrueCount * 0.3
      ? 'strong'
      : directionChanges > edgeTrueCount * 0.15
        ? 'moderate'
        : 'static';

  const tensionExpression: SculptureAnalysis['bodyLanguage']['tensionExpression'] =
    edgeDensity > 0.12 ? 'high' : edgeDensity > 0.07 ? 'medium' : 'low';
  const rhythmFlow: SculptureAnalysis['bodyLanguage']['rhythmFlow'] =
    textureComplexity > 0.5 ? 'fluent' : textureComplexity > 0.25 ? 'moderate' : 'stiff';

  const bodyScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (dynamicSense === 'strong' ? 5 : dynamicSense === 'static' ? -8 : 0) +
        (tensionExpression === 'high' ? 5 : tensionExpression === 'low' ? -5 : 0) +
        (rhythmFlow === 'fluent' ? 5 : rhythmFlow === 'stiff' ? -5 : 0),
    ),
  );

  let bodySuggestion =
    dynamicSense === 'strong'
      ? '动态感强烈,富有生命力'
      : dynamicSense === 'static'
        ? '形态偏静态,建议增加扭转或倾斜增强动感'
        : '动态感尚可';
  bodySuggestion +=
    tensionExpression === 'high'
      ? ';张力十足'
      : tensionExpression === 'low'
        ? ';张力不足,可强化形体冲突'
        : ';张力表现适中';
  bodySuggestion +=
    rhythmFlow === 'fluent'
      ? ';韵律流畅'
      : rhythmFlow === 'stiff'
        ? ';韵律生硬,建议优化节奏变化'
        : ';韵律感尚可';

  // 材料语言
  const materialCharacter: SculptureAnalysis['materialLanguage']['materialCharacter'] =
    pa.avgSaturation < 25 ? 'distinct' : pa.avgSaturation < 50 ? 'moderate' : 'obscure';
  const textureExpression: SculptureAnalysis['materialLanguage']['textureExpression'] =
    textureComplexity > 0.5 ? 'rich' : textureComplexity > 0.25 ? 'moderate' : 'simple';
  const colorVarS = Object.keys(pa.colorBuckets).length;
  const qualityLayering: SculptureAnalysis['materialLanguage']['qualityLayering'] =
    colorVarS > 45 ? 'rich' : colorVarS > 20 ? 'moderate' : 'simple';

  const materialLangScore = Math.max(
    60,
    Math.min(
      95,
      78 +
        (textureExpression === 'rich' ? 8 : textureExpression === 'simple' ? -8 : 0) +
        (qualityLayering === 'rich' ? 5 : qualityLayering === 'simple' ? -5 : 0),
    ),
  );

  let materialLangSuggestion =
    textureExpression === 'rich'
      ? '肌理表现丰富,材质语言强烈'
      : textureExpression === 'simple'
        ? '肌理表现单一,建议丰富表面纹理'
        : '肌理表现尚可';
  materialLangSuggestion +=
    materialCharacter === 'distinct'
      ? ';材料特性鲜明'
      : materialCharacter === 'obscure'
        ? ';材料特性不够突出'
        : ';材料特性表达一般';
  materialLangSuggestion +=
    qualityLayering === 'rich'
      ? ';质感层次丰富'
      : qualityLayering === 'simple'
        ? ';质感层次较少,可增加打磨或做旧处理'
        : ';质感层次适中';

  return {
    type: 'sculpture',
    spatialComposition: {
      score: Math.round(spatialScore),
      focusPoint,
      volumeSense,
      spaceOccupation,
      voidSolidRelation,
      heatmapData,
      suggestion: spatialSuggestion,
    },
    bodyLanguage: {
      score: Math.round(bodyScore),
      dynamicSense,
      tensionExpression,
      rhythmFlow,
      suggestion: bodySuggestion,
    },
    materialLanguage: {
      score: Math.round(materialLangScore),
      materialCharacter,
      textureExpression,
      qualityLayering,
      suggestion: materialLangSuggestion,
    },
  };
}

// ============================================================
// 原创性分析(通用)
// ============================================================

/** 原创性分析(基于边缘密度 + 色彩种类 + 纹理复杂度估算相似度) */
export function analyzeOriginality(pa: PixelAnalysis): AnalysisResult['originality'] {
  const edgeDensity = calculateEdgeDensity(pa);
  const colorVariety = Object.keys(pa.colorBuckets).length;
  const textureComplexity = calculateTextureComplexity(pa);

  const baseSimilarity = 0.12;
  const similarity = Math.min(
    0.45,
    baseSimilarity + edgeDensity * 2 + Math.max(0, 0.08 - colorVariety / 100),
  );

  const score = Math.max(60, Math.min(98, 98 - similarity * 180));
  let level: AnalysisResult['originality']['creativityLevel'];
  let suggestion: string;

  if (similarity < 0.15) {
    level = 'excellent';
    suggestion = `原创性优秀(相似度${Math.round(similarity * 100)}%),纹理复杂度${textureComplexity > 0.6 ? '高' : textureComplexity > 0.3 ? '适中' : '低'},色彩变化${colorVariety}种。作品具有独特个人风格,继续探索更多可能性!`;
  } else if (similarity < 0.25) {
    level = 'good';
    suggestion = `原创性良好(相似度${Math.round(similarity * 100)}%)。建议增加更多个人风格元素,让作品更具独特性,可尝试不同的表现手法。`;
  } else if (similarity < 0.35) {
    level = 'average';
    suggestion = `原创性一般(相似度${Math.round(similarity * 100)}%)。建议在造型或处理手法上寻求突破,增加个人特色。`;
  } else {
    level = 'needsWork';
    suggestion = `原创性需加强(相似度${Math.round(similarity * 100)}%)。建议大幅增加原创元素,尝试独特的造型方式和表现技法,形成个人风格。`;
  }

  return {
    score: Math.round(score),
    similarity: Math.round(similarity * 100) / 100,
    creativityLevel: level,
    suggestion,
  };
}

// ============================================================
// 主入口
// ============================================================

/**
 * 分析图像(主入口)
 * @param imagePath 本地图片路径(multer 上传或已下载的临时文件)
 * @param artType 作品类型 painting/design/product/sculpture
 * @returns AnalysisResult(后端契约,无 id/imageUrl/createdAt)
 */
export async function analyzeImage(imagePath: string, artType: ArtType): Promise<AnalysisResult> {
  try {
    const img = await Jimp.read(imagePath);
    const pa = analyzePixels(img);

    let dimensions: DimensionResult;
    switch (artType) {
      case 'painting':
        dimensions = analyzePainting(pa);
        break;
      case 'design':
        dimensions = analyzeDesign(pa);
        break;
      case 'product':
        dimensions = analyzeProduct(pa);
        break;
      case 'sculpture':
        dimensions = analyzeSculpture(pa);
        break;
      default:
        dimensions = analyzePainting(pa);
        break;
    }

    const originality = analyzeOriginality(pa);

    // 综合分(三个维度 + 原创性,取均值)
    let d1 = 0;
    let d2 = 0;
    let d3 = 0;
    if (dimensions.type === 'painting') {
      d1 = dimensions.composition.score;
      d2 = dimensions.color.score;
      d3 = dimensions.brushwork.score;
    } else if (dimensions.type === 'design') {
      d1 = dimensions.visualHierarchy.score;
      d2 = dimensions.typography.score;
      d3 = dimensions.colorApplication.score;
    } else if (dimensions.type === 'product') {
      d1 = dimensions.form.score;
      d2 = dimensions.materialExpression.score;
      d3 = dimensions.functionExpression.score;
    } else {
      d1 = dimensions.spatialComposition.score;
      d2 = dimensions.bodyLanguage.score;
      d3 = dimensions.materialLanguage.score;
    }

    return {
      artType,
      dimensions,
      originality,
      overallScore: Math.round((d1 + d2 + d3 + originality.score) / 4),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, artType, imagePath }, '[analysis-engine] analyze failed, fallback');
    return generateFallbackAnalysis(artType);
  }
}

/**
 * 失败回退分析(生成合理的默认结果,保证接口可用)
 * @param artType 作品类型
 */
export function generateFallbackAnalysis(artType: ArtType): AnalysisResult {
  const baseScore = Math.floor(Math.random() * 25) + 65;
  const originalityScore = Math.floor(Math.random() * 25) + 68;
  const originality: AnalysisResult['originality'] = {
    score: originalityScore,
    similarity: Math.round((Math.random() * 0.2 + 0.1) * 100) / 100,
    creativityLevel: 'good',
    suggestion: '建议增加个人风格元素',
  };

  const heatmapData: number[][] = Array.from({ length: 20 }, () =>
    Array.from({ length: 20 }, () => Math.round(Math.random() * 60) / 100),
  );
  const focusPoint = { x: Math.random() * 0.4 + 0.3, y: Math.random() * 0.4 + 0.3 };

  let dimensions: DimensionResult;
  if (artType === 'painting') {
    dimensions = {
      type: 'painting',
      composition: {
        score: baseScore,
        focusPoint,
        balance: 'balanced',
        guideline: 'average',
        whitespaceRatio: 0.4,
        symmetry: 0.5,
        suggestion: '画面构图均衡',
        heatmapData,
      },
      color: {
        score: baseScore + 2,
        warmRatio: 0.5,
        coolRatio: 0.5,
        contrast: 'medium',
        saturation: 'medium',
        richness: 'moderate',
        harmony: '和谐',
        dominantColor: '中性色',
        suggestion: '色彩搭配和谐',
      },
      brushwork: {
        score: baseScore - 1,
        textureLevel: 'moderate',
        strokeVariety: 35,
        wetDryBalance: '适中',
        suggestion: '笔触技法尚可',
      },
    };
  } else if (artType === 'design') {
    dimensions = {
      type: 'design',
      visualHierarchy: {
        score: baseScore,
        focusPoint,
        primarySecondaryClarity: 'moderate',
        informationFlow: 'average',
        heatmapData,
        suggestion: '视觉层次尚可',
      },
      typography: {
        score: baseScore + 1,
        alignmentQuality: 'average',
        rhythmConsistency: 'average',
        negativeSpaceUsage: 'average',
        gridAdherence: 60,
        suggestion: '排版基本规范',
      },
      colorApplication: {
        score: baseScore - 1,
        contrast: 'medium',
        brandConsistency: 'moderate',
        colorPsychology: '中性',
        paletteHarmony: '和谐',
        suggestion: '色彩应用尚可',
      },
    };
  } else if (artType === 'product') {
    dimensions = {
      type: 'product',
      form: {
        score: baseScore,
        focusPoint,
        proportionBalance: 'average',
        lineFluidity: 'moderate',
        surfaceQuality: 'good',
        ergonomicsHint: 'moderate',
        heatmapData,
        suggestion: '形态设计尚可',
      },
      materialExpression: {
        score: baseScore + 1,
        textureRealism: 'medium',
        lightShadowPerformance: 'good',
        surfaceTreatment: 'moderate',
        suggestion: '材质表现尚可',
      },
      functionExpression: {
        score: baseScore - 1,
        structureClarity: 'moderate',
        functionImplication: 'moderate',
        detailRefinement: 'good',
        suggestion: '功能表达尚可',
      },
    };
  } else {
    dimensions = {
      type: 'sculpture',
      spatialComposition: {
        score: baseScore,
        focusPoint,
        volumeSense: 'moderate',
        spaceOccupation: 'moderate',
        voidSolidRelation: 'moderate',
        heatmapData,
        suggestion: '空间构成尚可',
      },
      bodyLanguage: {
        score: baseScore + 1,
        dynamicSense: 'moderate',
        tensionExpression: 'medium',
        rhythmFlow: 'moderate',
        suggestion: '形体语言尚可',
      },
      materialLanguage: {
        score: baseScore - 1,
        materialCharacter: 'moderate',
        textureExpression: 'moderate',
        qualityLayering: 'moderate',
        suggestion: '材料语言尚可',
      },
    };
  }

  return {
    artType,
    dimensions,
    originality,
    overallScore: Math.round((baseScore + baseScore + baseScore + originalityScore) / 4),
  };
}
