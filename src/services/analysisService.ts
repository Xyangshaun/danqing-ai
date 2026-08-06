import type {
  AnalysisResult,
  ArtType,
  PaintingAnalysis,
  DesignAnalysis,
  ProductAnalysis,
  SculptureAnalysis,
  SaturationDistribution,
  MostSimilarWork,
  ProfessionalSuggestion,
} from '../types';
import type { ArtworkItem } from './artworksDatabase';

/* ============================================================
   后端 v3.0.0 统一响应类型（传输层类型，非跨端领域类型）
   ============================================================ */

/** 后端 v3.0.0 统一响应外壳：{ code, message, data, traceId } */
interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
}

/** 健康检查响应 data 字段结构 */
interface HealthData {
  status: string;
  service?: string;
  version?: string;
  nodeEnv?: string;
  timestamp?: string;
}

/** 分页查询响应 data 字段结构（ artworks 列表 ） */
export interface PaginatedArtworks {
  data: ArtworkItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** 风格分类单条结构 */
interface StyleCategoryDef {
  name: string;
  styles: string[];
  eras: string[];
  subjects: string[];
}

/** 风格分类响应结构：按 art_type 索引 */
export type StyleCategoriesResponse = Record<string, StyleCategoryDef>;

interface PixelData { r: number; g: number; b: number; a: number; }

/* ============================================================
   通用工具函数
   ============================================================ */

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function getPixelData(canvas: HTMLCanvasElement): PixelData[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels: PixelData[] = [];
  for (let i = 0; i < imageData.data.length; i += 4) {
    pixels.push({
      r: imageData.data[i], g: imageData.data[i + 1],
      b: imageData.data[i + 2], a: imageData.data[i + 3],
    });
  }
  return pixels;
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function getLuminance(p: PixelData) {
  return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
}

function isWarmColor(r: number, _g: number, b: number) {
  return (r - b) / 255 > 0.15;
}

/** 数值保留2位小数 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ============================================================
   Phase A1: 色彩和谐度计算（Canvas版本）
   ============================================================ */

/** 色彩和谐类型 */
type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'monochromatic'
  | 'achromatic'
  | 'mixed';

/**
 * 计算色彩和谐度
 * @param pa 像素分析结果(需含hueHistogram和saturationDistribution)
 * @returns 和谐度分数(0-100)和类型
 */
function calculateColorHarmony(pa: PixelAnalysis): { score: number; type: HarmonyType } {
  try {
    const hist = pa.hueHistogram;
    const avgSat = pa.avgSaturation;

    if (avgSat < 15) {
      return { score: round2(70 + Math.random() * 10), type: 'achromatic' };
    }

    let maxBin = 0;
    let maxVal = 0;
    for (let i = 0; i < 36; i++) {
      if (hist[i] > maxVal) {
        maxVal = hist[i];
        maxBin = i;
      }
    }

    let monoSum = 0;
    for (let d = -2; d <= 2; d++) {
      const idx = (maxBin + d + 36) % 36;
      monoSum += hist[idx];
    }
    if (monoSum > 0.6) {
      return { score: round2(75 + monoSum * 15), type: 'monochromatic' };
    }

    const compStart = (maxBin + 15) % 36;
    const compEnd = (maxBin + 21) % 36;
    let compSum = 0;
    if (compStart <= compEnd) {
      for (let i = compStart; i <= compEnd; i++) compSum += hist[i];
    } else {
      for (let i = compStart; i < 36; i++) compSum += hist[i];
      for (let i = 0; i <= compEnd; i++) compSum += hist[i];
    }
    if (monoSum + compSum > 0.3) {
      const score = round2(80 + (monoSum + compSum) * 25);
      return { score: Math.min(100, score), type: 'complementary' };
    }

    let maxAnalogous = 0;
    for (let start = 0; start < 36; start++) {
      let sum = 0;
      for (let d = 0; d < 4; d++) {
        sum += hist[(start + d) % 36];
      }
      if (sum > maxAnalogous) maxAnalogous = sum;
    }
    if (maxAnalogous > 0.5) {
      return { score: round2(78 + maxAnalogous * 22), type: 'analogous' };
    }

    const sumRange = (start: number, end: number): number => {
      let s = 0;
      if (start <= end) {
        for (let i = start; i <= end; i++) s += hist[i];
      } else {
        for (let i = start; i < 36; i++) s += hist[i];
        for (let i = 0; i <= end; i++) s += hist[i];
      }
      return s;
    };

    const tri1Start = (maxBin + 9) % 36;
    const tri1End = (maxBin + 15) % 36;
    const tri2Start = (maxBin + 21) % 36;
    const tri2End = (maxBin + 27) % 36;
    const tri1Sum = sumRange(tri1Start, tri1End);
    const tri2Sum = sumRange(tri2Start, tri2End);
    if (monoSum > 0.15 && tri1Sum > 0.1 && tri2Sum > 0.1 && monoSum + tri1Sum + tri2Sum > 0.45) {
      return { score: round2(82 + (monoSum + tri1Sum + tri2Sum) * 20), type: 'triadic' };
    }

    const sc1Start = (maxBin + 14) % 36;
    const sc2Start = (maxBin + 20) % 36;
    const sc1Sum = hist[sc1Start] + hist[(sc1Start + 1) % 36] + hist[(sc1Start - 1 + 36) % 36];
    const sc2Sum = hist[sc2Start] + hist[(sc2Start + 1) % 36] + hist[(sc2Start - 1 + 36) % 36];
    if (monoSum > 0.2 && (sc1Sum > 0.08 || sc2Sum > 0.08)) {
      return { score: round2(75 + monoSum * 20), type: 'split-complementary' };
    }

    return { score: round2(55 + Math.random() * 10), type: 'mixed' };
  } catch {
    return { score: 65, type: 'mixed' };
  }
}

/* ============================================================
   Phase A2: 构图评分（黄金分割/三分法/引导线）
   ============================================================ */

/**
 * 黄金分割评分
 */
function calculateGoldenRatioScore(focusPoint: { x: number; y: number }): number {
  const goldenPoints = [
    { x: 0.382, y: 0.382 },
    { x: 0.382, y: 0.618 },
    { x: 0.618, y: 0.382 },
    { x: 0.618, y: 0.618 },
  ];
  let minDist = Infinity;
  for (const gp of goldenPoints) {
    const d = Math.sqrt((focusPoint.x - gp.x) ** 2 + (focusPoint.y - gp.y) ** 2);
    if (d < minDist) minDist = d;
  }
  return round2(Math.max(0, Math.min(100, 100 - minDist * 200)));
}

/**
 * 三分法评分
 */
function calculateRuleOfThirdsScore(focusPoint: { x: number; y: number }): number {
  const thirdPoints = [
    { x: 0.333, y: 0.333 },
    { x: 0.333, y: 0.667 },
    { x: 0.667, y: 0.333 },
    { x: 0.667, y: 0.667 },
  ];
  let minDist = Infinity;
  for (const tp of thirdPoints) {
    const d = Math.sqrt((focusPoint.x - tp.x) ** 2 + (focusPoint.y - tp.y) ** 2);
    if (d < minDist) minDist = d;
  }
  return round2(Math.max(0, Math.min(100, 100 - minDist * 180)));
}

/**
 * 引导线检测（基于Sobel梯度方向统计）
 */
function detectLeadingLines(pa: PixelAnalysis): { direction: number; strength: number } {
  try {
    const W = pa.width;
    const H = pa.height;
    const dirBins = new Array<number>(8).fill(0);
    let totalEdges = 0;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (!pa.edgeMap[idx]) continue;
        const ix = pa.gradientX[idx];
        const iy = pa.gradientY[idx];
        const mag = Math.sqrt(ix * ix + iy * iy);
        if (mag < 10) continue;

        let angle = Math.atan2(iy, ix) * (180 / Math.PI);
        if (angle < 0) angle += 180;
        if (angle >= 180) angle -= 180;
        const binIdx = Math.min(7, Math.floor(angle / 22.5));
        dirBins[binIdx]++;
        totalEdges++;
      }
    }

    if (totalEdges < 10) {
      return { direction: 0, strength: 0 };
    }

    let maxBin = 0;
    let maxCount = 0;
    for (let i = 0; i < 8; i++) {
      if (dirBins[i] > maxCount) {
        maxCount = dirBins[i];
        maxBin = i;
      }
    }

    const direction = round2(maxBin * 22.5 + 11.25);
    const strength = round2(maxCount / totalEdges);

    return { direction, strength };
  } catch {
    return { direction: 0, strength: 0 };
  }
}

/* ============================================================
   Phase A3: 结构张量（笔触/纹理方向分析）
   ============================================================ */

function computeStructureTensor(
  pa: PixelAnalysis,
): { coherence: number; energy: number; dominantDirection: number } {
  try {
    const W = pa.width;
    const H = pa.height;
    let sumIxx = 0;
    let sumIxy = 0;
    let sumIyy = 0;
    let count = 0;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        const p = pa.pixels[idx];
        if (!p || p.a < 128) continue;
        const ix = pa.gradientX[idx];
        const iy = pa.gradientY[idx];
        sumIxx += ix * ix;
        sumIxy += ix * iy;
        sumIyy += iy * iy;
        count++;
      }
    }

    if (count === 0) {
      return { coherence: 0, energy: 0, dominantDirection: 0 };
    }

    const Ixx = sumIxx / count;
    const Ixy = sumIxy / count;
    const Iyy = sumIyy / count;

    const trace = Ixx + Iyy;
    const det = Ixx * Iyy - Ixy * Ixy;
    const discriminant = trace * trace / 4 - det;

    let lambda1: number;
    let lambda2: number;
    if (discriminant < 0) {
      lambda1 = trace / 2;
      lambda2 = trace / 2;
    } else {
      const sqrtDisc = Math.sqrt(discriminant);
      lambda1 = trace / 2 + sqrtDisc;
      lambda2 = Math.max(0, trace / 2 - sqrtDisc);
    }

    const coherence = trace > 0 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;
    const energy = Math.min(1, (lambda1 + lambda2) / 5000);

    let dominantAngle: number;
    if (Math.abs(Ixy) < 0.001 && Math.abs(lambda1 - Ixx) < 0.001) {
      dominantAngle = 0;
    } else {
      dominantAngle = Math.atan2(lambda1 - Ixx, Ixy) * (180 / Math.PI);
    }
    if (dominantAngle < 0) dominantAngle += 180;
    if (dominantAngle >= 180) dominantAngle -= 180;

    return {
      coherence: round2(Math.max(0, Math.min(1, coherence))),
      energy: round2(Math.max(0, Math.min(1, energy))),
      dominantDirection: round2(dominantAngle),
    };
  } catch {
    return { coherence: 0, energy: 0, dominantDirection: 0 };
  }
}

/* ============================================================
   通用像素分析基础（Phase A升级：完整Sobel+色相直方图+饱和度分布）
   ============================================================ */

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
  /** 36色桶色相直方图(每10度一个桶,值为像素占比),Phase A新增 */
  hueHistogram: number[];
  /** 饱和度三级分布,Phase A新增 */
  saturationDistribution: SaturationDistribution;
  /** Sobel x方向梯度(Ix),Phase A新增 */
  gradientX: number[];
  /** Sobel y方向梯度(Iy),Phase A新增 */
  gradientY: number[];
}

function analyzePixels(img: HTMLImageElement): PixelAnalysis {
  const maxDim = 500;
  let w = img.width, h = img.height;
  if (w > maxDim || h > maxDim) {
    if (w > h) { h = (h / w) * maxDim; w = maxDim; }
    else { w = (w / h) * maxDim; h = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(w); canvas.height = Math.floor(h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = getPixelData(canvas);

  const W = canvas.width;
  const H = canvas.height;

  const luminanceMap: number[] = [];
  const colorBuckets: Record<string, number> = {};
  const hueHistogram = new Array<number>(36).fill(0);
  let satLow = 0;
  let satMid = 0;
  let satHigh = 0;
  let warmCount = 0;
  let totalLum = 0;
  let totalSat = 0;
  let valid = 0;

  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    if (p.a < 128) {
      luminanceMap.push(0);
      continue;
    }
    const lum = getLuminance(p);
    luminanceMap.push(lum);
    totalLum += lum;
    const hsl = rgbToHsl(p.r, p.g, p.b);
    totalSat += hsl.s;

    if (hsl.s >= 10) {
      const hueBin = Math.floor(hsl.h / 10) % 36;
      hueHistogram[hueBin]++;
    }

    if (hsl.s < 33) satLow++;
    else if (hsl.s < 66) satMid++;
    else satHigh++;

    if (isWarmColor(p.r, p.g, p.b)) warmCount++;
    valid++;
    const bkt = `${Math.floor(p.r / 32)}-${Math.floor(p.g / 32)}-${Math.floor(p.b / 32)}`;
    colorBuckets[bkt] = (colorBuckets[bkt] || 0) + 1;
  }

  let hueValidCount = 0;
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    if (p.a < 128) continue;
    const hsl = rgbToHsl(p.r, p.g, p.b);
    if (hsl.s >= 10) hueValidCount++;
  }
  for (let i = 0; i < 36; i++) {
    hueHistogram[i] = hueValidCount > 0 ? hueHistogram[i] / hueValidCount : 0;
  }

  const satTotal = satLow + satMid + satHigh;
  const saturationDistribution: SaturationDistribution = {
    low: satTotal > 0 ? round2(satLow / satTotal) : 0.33,
    mid: satTotal > 0 ? round2(satMid / satTotal) : 0.34,
    high: satTotal > 0 ? round2(satHigh / satTotal) : 0.33,
  };

  const gradientX: number[] = new Array(W * H).fill(0);
  const gradientY: number[] = new Array(W * H).fill(0);
  const edgeMap: boolean[] = new Array(W * H).fill(false);
  const edgeThreshold = 30;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const p = pixels[idx];
      if (!p || p.a < 128) {
        gradientX[idx] = 0;
        gradientY[idx] = 0;
        continue;
      }

      const tl = (y - 1) * W + (x - 1);
      const tc = (y - 1) * W + x;
      const tr = (y - 1) * W + (x + 1);
      const ml = y * W + (x - 1);
      const mr = y * W + (x + 1);
      const bl = (y + 1) * W + (x - 1);
      const bc = (y + 1) * W + x;
      const br = (y + 1) * W + (x + 1);

      const getLum = (i: number): number => {
        const pp = pixels[i];
        return pp && pp.a >= 128 ? luminanceMap[i] : 0;
      };

      const ltl = getLum(tl);
      const ltc = getLum(tc);
      const ltr = getLum(tr);
      const lml = getLum(ml);
      const lmr = getLum(mr);
      const lbl = getLum(bl);
      const lbc = getLum(bc);
      const lbr = getLum(br);

      const ix = -ltl + ltr - 2 * lml + 2 * lmr - lbl + lbr;
      const iy = -ltl - 2 * ltc - ltr + lbl + 2 * lbc + lbr;

      gradientX[idx] = ix;
      gradientY[idx] = iy;

      const mag = Math.sqrt(ix * ix + iy * iy);
      edgeMap[idx] = mag > edgeThreshold;
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
    hueHistogram,
    saturationDistribution,
    gradientX,
    gradientY,
  };
}

function generateHeatmap(pa: PixelAnalysis): number[][] {
  const rows = 20, cols = 20;
  const heatmap: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const weight = 255 - pa.luminanceMap[idx];
      const hx = Math.min(cols - 1, Math.floor((x / pa.width) * cols));
      const hy = Math.min(rows - 1, Math.floor((y / pa.height) * rows));
      heatmap[hy][hx] += weight;
    }
  }
  let max = 0;
  for (const row of heatmap) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }
  if (max > 0) {
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        heatmap[i][j] = round2(Math.min(1, heatmap[i][j] / max));
  }
  return heatmap;
}

function calculateFocusPoint(pa: PixelAnalysis): { x: number; y: number } {
  let wx = 0, wy = 0, wt = 0;
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const w = 255 - pa.luminanceMap[idx];
      wx += x * w; wy += y * w; wt += w;
    }
  }
  return wt > 0
    ? { x: round2(wx / wt / pa.width), y: round2(wy / wt / pa.height) }
    : { x: 0.5, y: 0.5 };
}

function calculateSymmetry(pa: PixelAnalysis): number {
  let match = 0, total = 0;
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width / 2; x++) {
      const li = y * pa.width + x;
      const ri = y * pa.width + (pa.width - 1 - x);
      if (pa.pixels[li]?.a >= 128 && pa.pixels[ri]?.a >= 128) {
        if (Math.abs(pa.luminanceMap[li] - pa.luminanceMap[ri]) < 30) match++;
        total++;
      }
    }
  }
  return total > 0 ? match / total : 0.5;
}

function calculateEdgeDensity(pa: PixelAnalysis): number {
  if (pa.edgeMap.length === 0) return 0;
  const trueCount = pa.edgeMap.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  return trueCount / pa.edgeMap.length;
}

function calculateTextureComplexity(pa: PixelAnalysis): number {
  const edgeDensity = calculateEdgeDensity(pa);
  const colorVariety = Object.keys(pa.colorBuckets).length;
  return Math.min(1, colorVariety / 80 + edgeDensity * 2);
}

/* ============================================================
   按作品类型的分析生成器（Phase A升级：新增构图/色彩/笔触评分字段）
   ============================================================ */

function analyzePainting(pa: PixelAnalysis): PaintingAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);
  const symmetry = calculateSymmetry(pa);
  const edgeDensity = calculateEdgeDensity(pa);
  const textureComplexity = calculateTextureComplexity(pa);

  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const colorHarmony = calculateColorHarmony(pa);
  const structureTensor = computeStructureTensor(pa);

  const fx = focusPoint.x, fy = focusPoint.y;
  const distFromCenter = Math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2);
  let balance: PaintingAnalysis['composition']['balance'] = 'balanced';
  if (fx < 0.35) balance = 'left-heavy';
  else if (fx > 0.65) balance = 'right-heavy';
  else if (fy < 0.35) balance = 'top-heavy';
  else if (fy > 0.65) balance = 'bottom-heavy';

  let guideline: PaintingAnalysis['composition']['guideline'] = 'average';
  if (Math.abs(fx - 0.618) < 0.12 && Math.abs(fy - 0.618) < 0.12) guideline = 'good';
  else if (Math.abs(fx - 0.5) < 0.08 && Math.abs(fy - 0.5) < 0.08) guideline = 'poor';

  let brightCount = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (p && p.a >= 128 && pa.luminanceMap[i] > 200) brightCount++;
  }
  const whitespaceRatio = pa.totalValid > 0 ? brightCount / pa.totalValid : 0.4;

  const compScore = Math.max(60, Math.min(95, 92 - distFromCenter * 120 + (guideline === 'good' ? 5 : 0)));

  let compSuggestion = '';
  if (balance === 'balanced') {
    compSuggestion = `画面构图均衡，视觉重心位于(${Math.round(fx * 100)}%, ${Math.round(fy * 100)}%)`;
    compSuggestion += guideline === 'good' ? '，黄金分割运用得当' : '，可尝试将主体移至黄金分割点增强视觉张力';
  } else {
    const dirMap: Record<string, string> = { 'left-heavy': '右侧', 'right-heavy': '左侧', 'top-heavy': '下方', 'bottom-heavy': '上方' };
    compSuggestion = `视觉重心偏${balance.replace('-heavy', '')}，建议在${dirMap[balance]}增加呼应元素平衡画面`;
  }
  if (whitespaceRatio > 0.6) compSuggestion += '；留白较多，可适当增加层次丰富画面';
  else if (whitespaceRatio < 0.25) compSuggestion += '；画面较满，适当留白可提升呼吸感';
  if (symmetry > 0.7) compSuggestion += '；对称性良好';
  if (leadingLines.strength > 0.3) {
    compSuggestion += `；引导线方向约${Math.round(leadingLines.direction)}度，引导视觉流动`;
  }

  const warmPercent = Math.round(pa.warmRatio * 100);
  const contrast: PaintingAnalysis['color']['contrast'] =
    pa.avgLuminance < 70 || pa.avgLuminance > 190 ? 'high' :
    pa.avgLuminance < 100 || pa.avgLuminance > 170 ? 'medium' : 'low';
  const saturation: PaintingAnalysis['color']['saturation'] =
    pa.avgSaturation > 60 ? 'high' : pa.avgSaturation > 30 ? 'medium' : 'low';
  const colorVariety = Object.keys(pa.colorBuckets).length;
  const richness: PaintingAnalysis['color']['richness'] =
    colorVariety > 50 ? 'rich' : colorVariety > 25 ? 'moderate' : 'limited';

  let dominantBucket = ''; let maxCnt = 0;
  for (const [b, c] of Object.entries(pa.colorBuckets)) { if (c > maxCnt) { maxCnt = c; dominantBucket = b; } }
  const [dr, dg, db] = dominantBucket.split('-').map(Number);
  const domHsl = rgbToHsl((dr || 0) * 32 + 16, (dg || 0) * 32 + 16, (db || 0) * 32 + 16);
  const hueCat = domHsl.h < 30 || domHsl.h >= 330 ? '红' : domHsl.h < 60 ? '橙' : domHsl.h < 90 ? '黄' :
                 domHsl.h < 150 ? '绿' : domHsl.h < 210 ? '青' : domHsl.h < 270 ? '蓝' :
                 domHsl.h < 300 ? '紫' : '粉';
  const dominantColor = `${domHsl.s > 60 ? '鲜艳' : domHsl.s < 30 ? '柔和' : ''}${domHsl.l > 70 ? '浅' : domHsl.l < 35 ? '深' : ''}${hueCat}色`;

  const colorScore = Math.max(60, Math.min(95,
    80 + (contrast === 'high' ? 5 : contrast === 'low' ? -8 : 0) +
    (richness === 'rich' ? 5 : richness === 'limited' ? -8 : 0) +
    (saturation === 'high' ? 3 : saturation === 'low' ? -3 : 0)
  ));

  let colorSuggestion = `主色调为${dominantColor}，${warmPercent > 60 ? '整体偏暖' : warmPercent < 40 ? '整体偏冷' : '冷暖平衡'}`;
  colorSuggestion += contrast === 'high' ? '；明暗对比强烈，层次丰富' : contrast === 'low' ? '；对比偏弱，建议加强明暗层次' : '；对比适中';
  colorSuggestion += richness === 'rich' ? '；色彩丰富' : richness === 'limited' ? '；色彩种类较少，可尝试增加邻近色' : '；色彩丰富度适中';
  const harmonyTypeDesc: Record<string, string> = {
    complementary: '互补色搭配，视觉张力强',
    analogous: '类比色搭配，色调和谐统一',
    triadic: '三分色搭配，色彩平衡且丰富',
    'split-complementary': '分裂互补搭配，既有对比又不失和谐',
    monochromatic: '单色搭配，色调统一',
    achromatic: '无彩色系，素雅沉静',
    mixed: '色彩搭配较为混合',
  };
  colorSuggestion += `；${harmonyTypeDesc[colorHarmony.type] || '色彩搭配一般'}`;

  const tensor = structureTensor;
  let textureLevel: PaintingAnalysis['brushwork']['textureLevel'];
  if (tensor.coherence > 0.7 || textureComplexity < 0.3) {
    textureLevel = textureComplexity > 0.5 ? 'moderate' : 'simple';
  } else if (tensor.coherence < 0.4 || textureComplexity > 0.6) {
    textureLevel = 'rich';
  } else {
    textureLevel = textureComplexity > 0.45 ? 'rich' : textureComplexity > 0.3 ? 'moderate' : 'simple';
  }

  const strokeVariety = Math.round(Math.min(100, edgeDensity * 100 * (1 - tensor.coherence * 0.3) + tensor.energy * 20));
  const wetDryBalance = pa.avgSaturation > 50 ? '湿润感强' : pa.avgSaturation < 25 ? '偏干涩' : '干湿适中';
  const brushScore = Math.max(60, Math.min(95, 70 + textureComplexity * 25 + (strokeVariety > 30 ? 5 : 0) + tensor.energy * 10));

  let brushSuggestion = `笔触肌理${textureLevel === 'rich' ? '丰富' : textureLevel === 'moderate' ? '适中' : '较为单一'}`;
  brushSuggestion += `，笔画变化${strokeVariety > 40 ? '丰富' : strokeVariety > 20 ? '适中' : '较少'}`;
  brushSuggestion += `，${wetDryBalance}`;
  if (tensor.coherence > 0.7) {
    brushSuggestion += '；笔触方向一致，呈现工笔/精细刻画特征';
  } else if (tensor.coherence < 0.4) {
    brushSuggestion += '；笔触方向多变，呈现写意/奔放特征';
  }
  if (textureLevel === 'simple') brushSuggestion += '；建议尝试更多笔触变化，增加画面肌理层次';
  else if (strokeVariety < 25) brushSuggestion += '；可加强笔触的干湿、粗细变化';

  return {
    type: 'painting',
    composition: {
      score: Math.round(compScore), focusPoint, balance, guideline,
      whitespaceRatio: round2(whitespaceRatio),
      symmetry: round2(symmetry),
      suggestion: compSuggestion, heatmapData,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    color: {
      score: Math.round(colorScore),
      warmRatio: round2(pa.warmRatio),
      coolRatio: round2(1 - pa.warmRatio),
      contrast, saturation, richness,
      harmony: warmPercent > 60 ? '暖色调和谐' : warmPercent < 40 ? '冷色调和谐' : '冷暖平衡',
      dominantColor, suggestion: colorSuggestion,
      harmonyScore: colorHarmony.score,
      harmonyType: colorHarmony.type,
      saturationDistribution: pa.saturationDistribution,
    },
    brushwork: {
      score: Math.round(brushScore), textureLevel, strokeVariety, wetDryBalance, suggestion: brushSuggestion,
      directionCoherence: tensor.coherence,
      strokeEnergy: tensor.energy,
      dominantBrushDirection: tensor.dominantDirection,
    },
  };
}

function analyzeDesign(pa: PixelAnalysis): DesignAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);

  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

  const fx = focusPoint.x, fy = focusPoint.y;
  const distFromCenter = Math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2);
  const primarySecondaryClarity: DesignAnalysis['visualHierarchy']['primarySecondaryClarity'] =
    distFromCenter > 0.15 && distFromCenter < 0.35 ? 'clear' :
    distFromCenter < 0.45 ? 'moderate' : 'unclear';

  let horizontalEdges = 0, verticalEdges = 0;
  for (let y = 1; y < pa.height - 1; y++) {
    for (let x = 1; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      if (!pa.edgeMap[idx]) continue;
      const ix = pa.gradientX[idx];
      const iy = pa.gradientY[idx];
      const mag = Math.sqrt(ix * ix + iy * iy);
      if (mag < 10) continue;
      if (Math.abs(ix) > Math.abs(iy)) verticalEdges++;
      else horizontalEdges++;
    }
  }
  const totalDir = horizontalEdges + verticalEdges;
  const hRatio = totalDir > 0 ? horizontalEdges / totalDir : 0.5;
  const informationFlow: DesignAnalysis['visualHierarchy']['informationFlow'] =
    hRatio > 0.4 && hRatio < 0.6 ? 'good' : hRatio > 0.3 && hRatio < 0.7 ? 'average' : 'poor';

  const hierarchyScore = Math.max(60, Math.min(95,
    85 + (primarySecondaryClarity === 'clear' ? 8 : primarySecondaryClarity === 'unclear' ? -8 : 0) +
    (informationFlow === 'good' ? 5 : informationFlow === 'poor' ? -5 : 0)
  ));

  let hierarchySuggestion = `视觉焦点位于(${Math.round(fx * 100)}%, ${Math.round(fy * 100)}%)`;
  hierarchySuggestion += primarySecondaryClarity === 'clear' ? '，主次关系清晰' : primarySecondaryClarity === 'unclear' ? '，主次关系不够突出，建议强化视觉焦点' : '，主次关系尚可';
  hierarchySuggestion += informationFlow === 'good' ? '；视觉流动顺畅' : informationFlow === 'poor' ? '；视觉流动受阻，建议优化阅读路径' : '；视觉流动一般';
  if (leadingLines.strength > 0.25) {
    hierarchySuggestion += `；存在约${Math.round(leadingLines.direction)}度方向的引导线`;
  }

  const alignmentQuality: DesignAnalysis['typography']['alignmentQuality'] =
    hRatio > 0.55 ? 'good' : hRatio > 0.4 ? 'average' : 'poor';
  const rhythmConsistency: DesignAnalysis['typography']['rhythmConsistency'] =
    pa.avgSaturation < 40 ? 'good' : pa.avgSaturation < 60 ? 'average' : 'poor';
  let brightCount = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (p && p.a >= 128 && pa.luminanceMap[i] > 220) brightCount++;
  }
  const highLumRatio = pa.totalValid > 0 ? brightCount / pa.totalValid : 0;
  const negativeSpaceUsage: DesignAnalysis['typography']['negativeSpaceUsage'] =
    highLumRatio > 0.3 ? 'good' : highLumRatio > 0.15 ? 'average' : 'poor';
  const gridAdherence = Math.round(Math.max(0, 1 - Math.abs(hRatio - 0.5) * 2) * 100);

  const typeScore = Math.max(60, Math.min(95,
    80 + (alignmentQuality === 'good' ? 5 : alignmentQuality === 'poor' ? -8 : 0) +
    (negativeSpaceUsage === 'good' ? 5 : negativeSpaceUsage === 'poor' ? -5 : 0) +
    (gridAdherence > 70 ? 5 : gridAdherence < 40 ? -5 : 0) +
    (structureTensor.coherence > 0.5 ? 5 : structureTensor.coherence < 0.3 ? -3 : 0)
  ));

  let typeSuggestion = alignmentQuality === 'good' ? '对齐规范，网格感强' : alignmentQuality === 'poor' ? '对齐不够统一，建议建立清晰的网格系统' : '对齐基本规范';
  if (structureTensor.coherence > 0.5) {
    typeSuggestion += '；元素方向一致，排版整齐';
  } else if (structureTensor.coherence < 0.3) {
    typeSuggestion += '；元素方向不够统一，建议加强对齐';
  }
  typeSuggestion += rhythmConsistency === 'good' ? '；节奏感一致' : rhythmConsistency === 'poor' ? '；元素间距节奏不够统一' : '；节奏感尚可';
  typeSuggestion += negativeSpaceUsage === 'good' ? '；负空间运用得当' : negativeSpaceUsage === 'poor' ? '；负空间不足，适当增加留白' : '；负空间运用一般';

  const contrast: DesignAnalysis['colorApplication']['contrast'] =
    pa.avgLuminance < 70 || pa.avgLuminance > 190 ? 'high' :
    pa.avgLuminance < 105 || pa.avgLuminance > 165 ? 'medium' : 'low';
  const colorVarietyD = Object.keys(pa.colorBuckets).length;
  const brandConsistency: DesignAnalysis['colorApplication']['brandConsistency'] =
    colorVarietyD < 20 ? 'strong' : colorVarietyD < 45 ? 'moderate' : 'weak';
  const colorPsychology = pa.warmRatio > 0.6 ? '暖色调传递活力与热情' :
                          pa.warmRatio < 0.35 ? '冷色调传递理性与专业' : '中性色调传递平衡与稳重';
  const paletteHarmony = colorVarietyD > 50 ? '色彩丰富但需注意统一' :
                         colorVarietyD > 25 ? '色彩和谐适中' : '色彩简洁统一';

  const colorAppScore = Math.max(60, Math.min(95,
    82 + (contrast === 'high' ? 5 : contrast === 'low' ? -8 : 0) +
    (brandConsistency === 'strong' ? 5 : brandConsistency === 'weak' ? -5 : 0)
  ));

  let colorAppSuggestion = `色彩对比${contrast === 'high' ? '强烈，视觉张力足' : contrast === 'low' ? '偏弱，建议增强重点色对比' : '适中'}`;
  colorAppSuggestion += brandConsistency === 'strong' ? '；品牌色运用一致' : brandConsistency === 'weak' ? '；色彩过多，建议精简至3-4种主色' : '；品牌色运用尚可';
  colorAppSuggestion += `；${colorPsychology}`;

  return {
    type: 'design',
    visualHierarchy: {
      score: Math.round(hierarchyScore), focusPoint, primarySecondaryClarity, informationFlow,
      heatmapData, suggestion: hierarchySuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    typography: {
      score: Math.round(typeScore), alignmentQuality, rhythmConsistency, negativeSpaceUsage,
      gridAdherence, suggestion: typeSuggestion,
      directionCoherence: round2(structureTensor.coherence),
    },
    colorApplication: {
      score: Math.round(colorAppScore), contrast, brandConsistency, colorPsychology, paletteHarmony,
      suggestion: colorAppSuggestion,
    },
  };
}

function analyzeProduct(pa: PixelAnalysis): ProductAnalysis {
  const heatmapData = generateHeatmap(pa);
  const focusPoint = calculateFocusPoint(pa);

  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

  const edgeDensity = calculateEdgeDensity(pa);
  const symmetry = calculateSymmetry(pa);

  const aspectRatio = pa.width / pa.height;
  const proportionBalance: ProductAnalysis['form']['proportionBalance'] =
    aspectRatio > 0.6 && aspectRatio < 1.6 ? 'good' :
    aspectRatio > 0.4 && aspectRatio < 2.0 ? 'average' : 'poor';

  let edgeBreaks = 0;
  for (let i = 1; i < pa.edgeMap.length; i++) {
    if (pa.edgeMap[i] && !pa.edgeMap[i - 1]) edgeBreaks++;
  }
  const breakRatio = edgeBreaks / pa.edgeMap.length;
  let lineFluidity: ProductAnalysis['form']['lineFluidity'];
  if (breakRatio < 0.03 || (breakRatio < 0.05 && structureTensor.coherence > 0.5)) {
    lineFluidity = 'smooth';
  } else if (breakRatio < 0.08 || structureTensor.coherence > 0.35) {
    lineFluidity = 'moderate';
  } else {
    lineFluidity = 'stiff';
  }

  let smoothTransitions = 0, totalTransitions = 0;
  for (let y = 0; y < pa.height - 1; y++) {
    for (let x = 0; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      const p = pa.pixels[idx];
      if (!p || p.a < 128) continue;
      const dl = Math.abs(pa.luminanceMap[idx] - pa.luminanceMap[idx + 1]);
      if (dl > 5 && dl < 40) smoothTransitions++;
      if (dl > 5) totalTransitions++;
    }
  }
  const surfaceQuality: ProductAnalysis['form']['surfaceQuality'] =
    totalTransitions > 0 && smoothTransitions / totalTransitions > 0.6 ? 'excellent' :
    totalTransitions > 0 && smoothTransitions / totalTransitions > 0.4 ? 'good' : 'average';

  const ergonomicsHint: ProductAnalysis['form']['ergonomicsHint'] =
    edgeDensity < 0.08 ? 'strong' : edgeDensity < 0.15 ? 'moderate' : 'weak';

  const formScore = Math.max(60, Math.min(95,
    80 + (proportionBalance === 'good' ? 5 : proportionBalance === 'poor' ? -8 : 0) +
    (lineFluidity === 'smooth' ? 5 : lineFluidity === 'stiff' ? -5 : 0) +
    (surfaceQuality === 'excellent' ? 5 : surfaceQuality === 'average' ? -3 : 0) +
    (structureTensor.coherence > 0.4 ? 3 : 0)
  ));

  let formSuggestion = proportionBalance === 'good' ? '比例协调，视觉稳定' : proportionBalance === 'poor' ? '比例偏极端，建议调整长宽高比例' : '比例基本协调';
  formSuggestion += lineFluidity === 'smooth' ? '；线条流畅自然' : lineFluidity === 'stiff' ? '；线条略显生硬，建议增加过渡曲面' : '；线条流畅度尚可';
  if (structureTensor.coherence > 0.5) {
    formSuggestion += '；曲面线条方向一致，造型流畅';
  }
  formSuggestion += surfaceQuality === 'excellent' ? '；曲面过渡细腻' : surfaceQuality === 'average' ? '；曲面处理可更精细' : '；曲面质量良好';
  formSuggestion += ergonomicsHint === 'strong' ? '；圆润造型暗示良好握持感' : ergonomicsHint === 'weak' ? '；边角较多，需考虑人机工学' : '';

  const textureRealism: ProductAnalysis['materialExpression']['textureRealism'] =
    pa.avgSaturation > 40 ? 'high' : pa.avgSaturation > 20 ? 'medium' : 'low';
  const lightShadowPerformance: ProductAnalysis['materialExpression']['lightShadowPerformance'] =
    pa.avgLuminance > 80 && pa.avgLuminance < 180 ? 'excellent' :
    pa.avgLuminance > 60 && pa.avgLuminance < 200 ? 'good' : 'average';
  const surfaceTreatment: ProductAnalysis['materialExpression']['surfaceTreatment'] =
    edgeDensity < 0.1 ? 'refined' : edgeDensity < 0.2 ? 'moderate' : 'rough';

  const materialScore = Math.max(60, Math.min(95,
    78 + (lightShadowPerformance === 'excellent' ? 8 : lightShadowPerformance === 'average' ? -5 : 0) +
    (textureRealism === 'high' ? 5 : textureRealism === 'low' ? -5 : 0)
  ));

  let materialSuggestion = lightShadowPerformance === 'excellent' ? '光影表现优秀，材质感强烈' : lightShadowPerformance === 'average' ? '光影表现一般，建议加强明暗对比' : '光影表现良好';
  materialSuggestion += textureRealism === 'high' ? '；纹理细节丰富' : textureRealism === 'low' ? '；纹理表现较弱，可增加材质细节' : '；纹理表现尚可';
  materialSuggestion += surfaceTreatment === 'refined' ? '；表面处理细腻' : surfaceTreatment === 'rough' ? '；表面略显粗糙' : '；表面处理适中';

  const structureClarity: ProductAnalysis['functionExpression']['structureClarity'] =
    symmetry > 0.6 ? 'clear' : symmetry > 0.4 ? 'moderate' : 'unclear';
  const functionImplication: ProductAnalysis['functionExpression']['functionImplication'] =
    edgeDensity > 0.08 && edgeDensity < 0.2 ? 'strong' :
    edgeDensity > 0.05 && edgeDensity < 0.25 ? 'moderate' : 'weak';
  const detailRefinement: ProductAnalysis['functionExpression']['detailRefinement'] =
    Object.keys(pa.colorBuckets).length > 40 ? 'excellent' :
    Object.keys(pa.colorBuckets).length > 20 ? 'good' : 'average';

  const functionScore = Math.max(60, Math.min(95,
    80 + (structureClarity === 'clear' ? 5 : structureClarity === 'unclear' ? -8 : 0) +
    (functionImplication === 'strong' ? 5 : functionImplication === 'weak' ? -5 : 0) +
    (detailRefinement === 'excellent' ? 5 : detailRefinement === 'average' ? -3 : 0)
  ));

  let functionSuggestion = structureClarity === 'clear' ? '结构清晰，功能分区明确' : structureClarity === 'unclear' ? '结构不够清晰，建议强化功能分区' : '结构表达尚可';
  functionSuggestion += functionImplication === 'strong' ? '；功能暗示性强' : functionImplication === 'weak' ? '；功能暗示较弱，形态语言需加强' : '；功能暗示一般';
  functionSuggestion += detailRefinement === 'excellent' ? '；细节处理精致' : detailRefinement === 'average' ? '；细节处理可更精细' : '；细节处理良好';

  return {
    type: 'product',
    form: {
      score: Math.round(formScore), focusPoint, proportionBalance, lineFluidity, surfaceQuality, ergonomicsHint,
      heatmapData, suggestion: formSuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
      directionCoherence: round2(structureTensor.coherence),
    },
    materialExpression: {
      score: Math.round(materialScore), textureRealism, lightShadowPerformance, surfaceTreatment,
      suggestion: materialSuggestion,
    },
    functionExpression: {
      score: Math.round(functionScore), structureClarity, functionImplication, detailRefinement,
      suggestion: functionSuggestion,
    },
  };
}

function analyzeSculpture(pa: PixelAnalysis): SculptureAnalysis {
  const heatmapData = generateHeatmap(pa);
  const focusPoint = calculateFocusPoint(pa);
  const edgeDensity = calculateEdgeDensity(pa);
  const textureComplexity = calculateTextureComplexity(pa);

  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

  const volumeSense: SculptureAnalysis['spatialComposition']['volumeSense'] =
    edgeDensity > 0.1 ? 'strong' : edgeDensity > 0.06 ? 'moderate' : 'weak';
  const occupationRatio = pa.width * pa.height > 0 ? pa.totalValid / (pa.width * pa.height) : 0.5;
  const spaceOccupation: SculptureAnalysis['spatialComposition']['spaceOccupation'] =
    occupationRatio > 0.6 ? 'full' : occupationRatio > 0.35 ? 'moderate' : 'sparse';
  let brightCountS = 0, darkCountS = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (!p || p.a < 128) continue;
    if (pa.luminanceMap[i] > 200) brightCountS++;
    if (pa.luminanceMap[i] < 80) darkCountS++;
  }
  const highLumRatio = pa.totalValid > 0 ? brightCountS / pa.totalValid : 0;
  const lowLumRatio = pa.totalValid > 0 ? darkCountS / pa.totalValid : 0;
  const voidSolidRelation: SculptureAnalysis['spatialComposition']['voidSolidRelation'] =
    highLumRatio > 0.25 && lowLumRatio > 0.2 ? 'harmonious' :
    highLumRatio > 0.15 ? 'moderate' : 'imbalanced';

  const spatialScore = Math.max(60, Math.min(95,
    80 + (volumeSense === 'strong' ? 5 : volumeSense === 'weak' ? -8 : 0) +
    (voidSolidRelation === 'harmonious' ? 8 : voidSolidRelation === 'imbalanced' ? -8 : 0) +
    (spaceOccupation === 'full' ? 3 : spaceOccupation === 'sparse' ? -3 : 0)
  ));

  let spatialSuggestion = volumeSense === 'strong' ? '体积感强烈，空间存在感强' : volumeSense === 'weak' ? '体积感偏弱，建议加强体量表现' : '体积感尚可';
  spatialSuggestion += spaceOccupation === 'full' ? '；空间占有充分' : spaceOccupation === 'sparse' ? '；空间占有不足，可增加体量' : '；空间占有适中';
  spatialSuggestion += voidSolidRelation === 'harmonious' ? '；虚实关系和谐' : voidSolidRelation === 'imbalanced' ? '；虚实关系失衡，需调整正负空间' : '；虚实关系一般';
  if (leadingLines.strength > 0.25) {
    spatialSuggestion += `；形体引导线约${Math.round(leadingLines.direction)}度方向`;
  }

  let directionChanges = 0;
  for (let y = 1; y < pa.height - 1; y++) {
    for (let x = 1; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      if (!pa.edgeMap[idx]) continue;
      const dl = Math.abs(pa.luminanceMap[idx] - pa.luminanceMap[idx + 1]);
      const dd = Math.abs(pa.luminanceMap[idx] - pa.luminanceMap[idx + pa.width]);
      const prevDl = Math.abs(pa.luminanceMap[idx - 1] - pa.luminanceMap[idx]);
      const prevDd = Math.abs(pa.luminanceMap[idx - pa.width] - pa.luminanceMap[idx]);
      if (Math.abs(dl - prevDl) > 20 || Math.abs(dd - prevDd) > 20) directionChanges++;
    }
  }
  const edgeTrueCount = pa.edgeMap.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  const dynamicSense: SculptureAnalysis['bodyLanguage']['dynamicSense'] =
    directionChanges > edgeTrueCount * 0.3 || structureTensor.energy > 0.3 ? 'strong' :
    directionChanges > edgeTrueCount * 0.15 || structureTensor.energy > 0.15 ? 'moderate' : 'static';

  let tensionExpression: SculptureAnalysis['bodyLanguage']['tensionExpression'];
  if (edgeDensity > 0.12 || structureTensor.energy > 0.25) tensionExpression = 'high';
  else if (edgeDensity > 0.07 || structureTensor.energy > 0.12) tensionExpression = 'medium';
  else tensionExpression = 'low';

  const rhythmFlow: SculptureAnalysis['bodyLanguage']['rhythmFlow'] =
    textureComplexity > 0.5 ? 'fluent' : textureComplexity > 0.25 ? 'moderate' : 'stiff';

  const bodyScore = Math.max(60, Math.min(95,
    80 + (dynamicSense === 'strong' ? 5 : dynamicSense === 'static' ? -8 : 0) +
    (tensionExpression === 'high' ? 5 : tensionExpression === 'low' ? -5 : 0) +
    (rhythmFlow === 'fluent' ? 5 : rhythmFlow === 'stiff' ? -5 : 0) +
    structureTensor.energy * 10
  ));

  let bodySuggestion = dynamicSense === 'strong' ? '动态感强烈，富有生命力' : dynamicSense === 'static' ? '形态偏静态，建议增加扭转或倾斜增强动感' : '动态感尚可';
  bodySuggestion += tensionExpression === 'high' ? '；张力十足' : tensionExpression === 'low' ? '；张力不足，可强化形体冲突' : '；张力表现适中';
  if (structureTensor.coherence > 0.6) {
    bodySuggestion += '；形体线条方向一致，整体感强';
  } else if (structureTensor.coherence < 0.3) {
    bodySuggestion += '；形体方向多变，富有表现力';
  }
  bodySuggestion += rhythmFlow === 'fluent' ? '；韵律流畅' : rhythmFlow === 'stiff' ? '；韵律生硬，建议优化节奏变化' : '；韵律感尚可';

  const materialCharacter: SculptureAnalysis['materialLanguage']['materialCharacter'] =
    pa.avgSaturation < 25 ? 'distinct' : pa.avgSaturation < 50 ? 'moderate' : 'obscure';
  const textureExpression: SculptureAnalysis['materialLanguage']['textureExpression'] =
    textureComplexity > 0.5 ? 'rich' : textureComplexity > 0.25 ? 'moderate' : 'simple';
  const colorVarS = Object.keys(pa.colorBuckets).length;
  const qualityLayering: SculptureAnalysis['materialLanguage']['qualityLayering'] =
    colorVarS > 45 ? 'rich' : colorVarS > 20 ? 'moderate' : 'simple';

  const materialLangScore = Math.max(60, Math.min(95,
    78 + (textureExpression === 'rich' ? 8 : textureExpression === 'simple' ? -8 : 0) +
    (qualityLayering === 'rich' ? 5 : qualityLayering === 'simple' ? -5 : 0)
  ));

  let materialLangSuggestion = textureExpression === 'rich' ? '肌理表现丰富，材质语言强烈' : textureExpression === 'simple' ? '肌理表现单一，建议丰富表面纹理' : '肌理表现尚可';
  materialLangSuggestion += materialCharacter === 'distinct' ? '；材料特性鲜明' : materialCharacter === 'obscure' ? '；材料特性不够突出' : '；材料特性表达一般';
  materialLangSuggestion += qualityLayering === 'rich' ? '；质感层次丰富' : qualityLayering === 'simple' ? '；质感层次较少，可增加打磨或做旧处理' : '；质感层次适中';

  return {
    type: 'sculpture',
    spatialComposition: {
      score: Math.round(spatialScore), focusPoint, volumeSense, spaceOccupation, voidSolidRelation,
      heatmapData, suggestion: spatialSuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    bodyLanguage: {
      score: Math.round(bodyScore), dynamicSense, tensionExpression, rhythmFlow,
      suggestion: bodySuggestion,
      directionCoherence: round2(structureTensor.coherence),
      strokeEnergy: round2(structureTensor.energy),
    },
    materialLanguage: {
      score: Math.round(materialLangScore), materialCharacter, textureExpression, qualityLayering,
      suggestion: materialLangSuggestion,
    },
  };
}

/* ============================================================
   原创性分析（前端简化版：不加载名作库，使用增强版启发式算法）
   ============================================================ */

function analyzeOriginality(pa: PixelAnalysis) {
  const edgeDensity = calculateEdgeDensity(pa);
  const colorVariety = Object.keys(pa.colorBuckets).length;
  const textureComplexity = calculateTextureComplexity(pa);
  const structureTensor = computeStructureTensor(pa);

  const baseSimilarity = 0.12;
  const similarity = Math.min(
    0.45,
    baseSimilarity + edgeDensity * 2 + Math.max(0, 0.08 - colorVariety / 100) - structureTensor.coherence * 0.05,
  );

  const score = Math.max(60, Math.min(98, 98 - similarity * 180));
  let level: AnalysisResult['originality']['creativityLevel'];
  let suggestion: string;

  if (similarity < 0.15) {
    level = 'excellent';
    suggestion = `原创性优秀（相似度${Math.round(similarity * 100)}%），纹理复杂度${textureComplexity > 0.6 ? '高' : textureComplexity > 0.3 ? '适中' : '低'}，色彩变化${colorVariety}种。作品具有独特个人风格，继续探索更多可能性！`;
  } else if (similarity < 0.25) {
    level = 'good';
    suggestion = `原创性良好（相似度${Math.round(similarity * 100)}%）。建议增加更多个人风格元素，让作品更具独特性，可尝试不同的表现手法。`;
  } else if (similarity < 0.35) {
    level = 'average';
    suggestion = `原创性一般（相似度${Math.round(similarity * 100)}%）。建议在造型或处理手法上寻求突破，增加个人特色。`;
  } else {
    level = 'needsWork';
    suggestion = `原创性需加强（相似度${Math.round(similarity * 100)}%）。建议大幅增加原创元素，尝试独特的造型方式和表现技法，形成个人风格。`;
  }

  return {
    score: Math.round(score),
    similarity: round2(similarity),
    creativityLevel: level,
    suggestion,
    pHashSimilarity: round2(1 - similarity),
    mostSimilarWork: null as MostSimilarWork | null,
  };
}

/* ============================================================
   Phase B4: 构建专业建议列表(含evidence证据字段与priority优先级)
   ============================================================ */

/**
 * 根据分数确定建议优先级
 * <60 high(必改), 60-80 medium(提升), >80 low(亮点)
 */
function getPriorityFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score < 60) return 'high';
  if (score <= 80) return 'medium';
  return 'low';
}

/**
 * 根据维度分析结果构建专业建议列表(Canvas模式)
 * 每条建议包含: dimension/operation/evidence/priority
 * evidence 引用具体数值,priority 按分数分级
 */
function buildProfessionalSuggestions(
  dimensions: AnalysisResult['dimensions'],
  originality: AnalysisResult['originality'],
): ProfessionalSuggestion[] {
  const suggestions: ProfessionalSuggestion[] = [];

  if (dimensions.type === 'painting') {
    const { composition, color, brushwork } = dimensions;

    suggestions.push({
      dimension: '构图',
      operation: composition.suggestion,
      evidence: `视觉重心(${Math.round(composition.focusPoint.x * 100)}%,${Math.round(composition.focusPoint.y * 100)}%);黄金分割评分${composition.goldenRatioScore ?? '-'}分;留白比例${Math.round(composition.whitespaceRatio * 100)}%;均衡度=${composition.balance};引导线=${composition.guideline}`,
      priority: getPriorityFromScore(composition.score),
    });

    suggestions.push({
      dimension: '色彩',
      operation: color.suggestion,
      evidence: `冷暖比${color.warmRatio.toFixed(2)}:${color.coolRatio.toFixed(2)};对比度=${color.contrast};饱和度=${color.saturation};丰富度=${color.richness};和谐度评分${color.harmonyScore ?? '-'}分`,
      priority: getPriorityFromScore(color.score),
    });

    suggestions.push({
      dimension: '笔触技法',
      operation: brushwork.suggestion,
      evidence: `肌理层次=${brushwork.textureLevel};笔触变化${brushwork.strokeVariety}%;方向一致性${Math.round((brushwork.directionCoherence ?? 0.5) * 100)}%;笔触能量${Math.round((brushwork.strokeEnergy ?? 0.3) * 100)}%`,
      priority: getPriorityFromScore(brushwork.score),
    });

  } else if (dimensions.type === 'design') {
    const { visualHierarchy, typography, colorApplication } = dimensions;

    suggestions.push({
      dimension: '视觉层次',
      operation: visualHierarchy.suggestion,
      evidence: `焦点(${Math.round(visualHierarchy.focusPoint.x * 100)}%,${Math.round(visualHierarchy.focusPoint.y * 100)}%);主次清晰度=${visualHierarchy.primarySecondaryClarity};信息流动=${visualHierarchy.informationFlow};黄金分割评分${visualHierarchy.goldenRatioScore ?? '-'}分`,
      priority: getPriorityFromScore(visualHierarchy.score),
    });

    suggestions.push({
      dimension: '排版',
      operation: typography.suggestion,
      evidence: `对齐质量=${typography.alignmentQuality};节奏一致性=${typography.rhythmConsistency};负空间运用=${typography.negativeSpaceUsage};网格遵循度${typography.gridAdherence}%;方向一致性${Math.round((typography.directionCoherence ?? 0.5) * 100)}%`,
      priority: getPriorityFromScore(typography.score),
    });

    suggestions.push({
      dimension: '色彩应用',
      operation: colorApplication.suggestion,
      evidence: `对比度=${colorApplication.contrast};品牌一致性=${colorApplication.brandConsistency};色彩心理学=${colorApplication.colorPsychology}`,
      priority: getPriorityFromScore(colorApplication.score),
    });

  } else if (dimensions.type === 'product') {
    const { form, materialExpression, functionExpression } = dimensions;

    suggestions.push({
      dimension: '形态',
      operation: form.suggestion,
      evidence: `焦点(${Math.round(form.focusPoint.x * 100)}%,${Math.round(form.focusPoint.y * 100)}%);比例平衡=${form.proportionBalance};线条流畅度=${form.lineFluidity};曲面质量=${form.surfaceQuality};人机工学=${form.ergonomicsHint}`,
      priority: getPriorityFromScore(form.score),
    });

    suggestions.push({
      dimension: '材质表现',
      operation: materialExpression.suggestion,
      evidence: `质感真实度=${materialExpression.textureRealism};光影表现=${materialExpression.lightShadowPerformance};表面处理=${materialExpression.surfaceTreatment}`,
      priority: getPriorityFromScore(materialExpression.score),
    });

    suggestions.push({
      dimension: '功能表达',
      operation: functionExpression.suggestion,
      evidence: `结构清晰度=${functionExpression.structureClarity};功能暗示=${functionExpression.functionImplication};细节精致度=${functionExpression.detailRefinement}`,
      priority: getPriorityFromScore(functionExpression.score),
    });

  } else {
    const { spatialComposition, bodyLanguage, materialLanguage } = dimensions;

    suggestions.push({
      dimension: '空间构成',
      operation: spatialComposition.suggestion,
      evidence: `焦点(${Math.round(spatialComposition.focusPoint.x * 100)}%,${Math.round(spatialComposition.focusPoint.y * 100)}%);体积感=${spatialComposition.volumeSense};空间占有=${spatialComposition.spaceOccupation};虚实关系=${spatialComposition.voidSolidRelation}`,
      priority: getPriorityFromScore(spatialComposition.score),
    });

    suggestions.push({
      dimension: '形体语言',
      operation: bodyLanguage.suggestion,
      evidence: `动态感=${bodyLanguage.dynamicSense};张力表达=${bodyLanguage.tensionExpression};韵律流动=${bodyLanguage.rhythmFlow};形体能量${Math.round((bodyLanguage.strokeEnergy ?? 0.3) * 100)}%`,
      priority: getPriorityFromScore(bodyLanguage.score),
    });

    suggestions.push({
      dimension: '材料语言',
      operation: materialLanguage.suggestion,
      evidence: `材料特性=${materialLanguage.materialCharacter};肌理表现=${materialLanguage.textureExpression};质感层次=${materialLanguage.qualityLayering}`,
      priority: getPriorityFromScore(materialLanguage.score),
    });
  }

  /* 原创性建议 */
  suggestions.push({
    dimension: '原创性',
    operation: originality.suggestion,
    evidence: `相似度${Math.round(originality.similarity * 100)}%;创造力等级=${originality.creativityLevel};原创性评分${originality.score}分`,
    priority: getPriorityFromScore(originality.score),
  });

  return suggestions;
}

/* ============================================================
   主入口
   ============================================================ */

export async function analyzeImage(imageUrl: string, artType: ArtType): Promise<AnalysisResult> {
  try {
    const img = await createImage(imageUrl);
    const pa = analyzePixels(img);

    let dimensions: AnalysisResult['dimensions'];
    switch (artType) {
      case 'painting': dimensions = analyzePainting(pa); break;
      case 'design': dimensions = analyzeDesign(pa); break;
      case 'product': dimensions = analyzeProduct(pa); break;
      case 'sculpture': dimensions = analyzeSculpture(pa); break;
      default: dimensions = analyzePainting(pa);
    }

    const originality = analyzeOriginality(pa);

    let d1 = 0, d2 = 0, d3 = 0;
    if (dimensions.type === 'painting') {
      d1 = dimensions.composition.score; d2 = dimensions.color.score; d3 = dimensions.brushwork.score;
    } else if (dimensions.type === 'design') {
      d1 = dimensions.visualHierarchy.score; d2 = dimensions.typography.score; d3 = dimensions.colorApplication.score;
    } else if (dimensions.type === 'product') {
      d1 = dimensions.form.score; d2 = dimensions.materialExpression.score; d3 = dimensions.functionExpression.score;
    } else {
      d1 = dimensions.spatialComposition.score; d2 = dimensions.bodyLanguage.score; d3 = dimensions.materialLanguage.score;
    }

    const overallScore = Math.round((d1 + d2 + d3 + originality.score) / 4);
    const professionalSuggestions = buildProfessionalSuggestions(dimensions, originality);

    return {
      id: `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      imageUrl, createdAt: new Date().toISOString(), artType,
      dimensions, originality,
      overallScore,
      professionalSuggestions,
    };
  } catch (error) {
    console.error('分析失败:', error);
    return generateFallbackAnalysis(imageUrl, artType);
  }
}

function generateFallbackAnalysis(imageUrl: string, artType: ArtType): AnalysisResult {
  const baseScore = Math.floor(Math.random() * 25) + 65;
  const originality = {
    score: Math.floor(Math.random() * 25) + 68,
    similarity: round2(Math.random() * 0.2 + 0.1),
    creativityLevel: 'good' as const,
    suggestion: '建议增加个人风格元素',
    pHashSimilarity: round2(Math.random() * 0.3 + 0.5),
    mostSimilarWork: null as MostSimilarWork | null,
  };

  const heatmapData = Array.from({ length: 20 }, () =>
    Array.from({ length: 20 }, () => Math.round(Math.random() * 60) / 100)
  );

  const focusPoint = { x: round2(Math.random() * 0.4 + 0.3), y: round2(Math.random() * 0.4 + 0.3) };

  const defaultCompositionExtras = {
    goldenRatioScore: round2(50 + Math.random() * 20),
    ruleOfThirdsScore: round2(50 + Math.random() * 20),
    leadingLineDirection: round2(Math.random() * 180),
    leadingLineStrength: round2(Math.random() * 0.3),
  };

  let dimensions: AnalysisResult['dimensions'];
  if (artType === 'painting') {
    dimensions = {
      type: 'painting',
      composition: { score: baseScore, focusPoint, balance: 'balanced', guideline: 'average', whitespaceRatio: 0.4, symmetry: 0.5, suggestion: '画面构图均衡', heatmapData, ...defaultCompositionExtras },
      color: { score: baseScore + 2, warmRatio: 0.5, coolRatio: 0.5, contrast: 'medium', saturation: 'medium', richness: 'moderate', harmony: '和谐', dominantColor: '中性色', suggestion: '色彩搭配和谐', harmonyScore: round2(65 + Math.random() * 15), harmonyType: 'mixed', saturationDistribution: { low: 0.33, mid: 0.34, high: 0.33 } },
      brushwork: { score: baseScore - 1, textureLevel: 'moderate', strokeVariety: 35, wetDryBalance: '适中', suggestion: '笔触技法尚可', directionCoherence: round2(0.4 + Math.random() * 0.2), strokeEnergy: round2(0.3 + Math.random() * 0.2), dominantBrushDirection: round2(Math.random() * 180) },
    };
  } else if (artType === 'design') {
    dimensions = {
      type: 'design',
      visualHierarchy: { score: baseScore, focusPoint, primarySecondaryClarity: 'moderate', informationFlow: 'average', heatmapData, suggestion: '视觉层次尚可', ...defaultCompositionExtras },
      typography: { score: baseScore + 1, alignmentQuality: 'average', rhythmConsistency: 'average', negativeSpaceUsage: 'average', gridAdherence: 60, suggestion: '排版基本规范', directionCoherence: round2(0.4 + Math.random() * 0.2) },
      colorApplication: { score: baseScore - 1, contrast: 'medium', brandConsistency: 'moderate', colorPsychology: '中性', paletteHarmony: '和谐', suggestion: '色彩应用尚可' },
    };
  } else if (artType === 'product') {
    dimensions = {
      type: 'product',
      form: { score: baseScore, focusPoint, proportionBalance: 'average', lineFluidity: 'moderate', surfaceQuality: 'good', ergonomicsHint: 'moderate', heatmapData, suggestion: '形态设计尚可', ...defaultCompositionExtras, directionCoherence: round2(0.4 + Math.random() * 0.2) },
      materialExpression: { score: baseScore + 1, textureRealism: 'medium', lightShadowPerformance: 'good', surfaceTreatment: 'moderate', suggestion: '材质表现尚可' },
      functionExpression: { score: baseScore - 1, structureClarity: 'moderate', functionImplication: 'moderate', detailRefinement: 'good', suggestion: '功能表达尚可' },
    };
  } else {
    dimensions = {
      type: 'sculpture',
      spatialComposition: { score: baseScore, focusPoint, volumeSense: 'moderate', spaceOccupation: 'moderate', voidSolidRelation: 'moderate', heatmapData, suggestion: '空间构成尚可', ...defaultCompositionExtras },
      bodyLanguage: { score: baseScore + 1, dynamicSense: 'moderate', tensionExpression: 'medium', rhythmFlow: 'moderate', suggestion: '形体语言尚可', directionCoherence: round2(0.4 + Math.random() * 0.2), strokeEnergy: round2(0.3 + Math.random() * 0.2) },
      materialLanguage: { score: baseScore - 1, materialCharacter: 'moderate', textureExpression: 'moderate', qualityLayering: 'moderate', suggestion: '材料语言尚可' },
    };
  }

  const overallScore = Math.round((baseScore + baseScore + baseScore + originality.score) / 4);
  const professionalSuggestions = buildProfessionalSuggestions(dimensions, originality);

  return {
    id: `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    imageUrl, createdAt: new Date().toISOString(), artType,
    dimensions, originality,
    overallScore,
    professionalSuggestions,
  };
}

/* ============================================================
   后端API调用（可选启用）
   ============================================================ */

export function getBackendUrl(): string {
  return localStorage.getItem('danqing_backend_url') || '/api/v1';
}

export function isBackendEnabled(): boolean {
  return localStorage.getItem('danqing_backend_enabled') === 'true';
}

export function setBackendEnabled(enabled: boolean): void {
  localStorage.setItem('danqing_backend_enabled', enabled ? 'true' : 'false');
}

export function setBackendUrl(url: string): void {
  localStorage.setItem('danqing_backend_url', url);
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getBackendUrl()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data: ApiEnvelope<HealthData> = await res.json();
    return data.code === 0 && data.data?.status === 'up';
  } catch {
    return false;
  }
}

export async function analyzeImageBackend(imageUrl: string, artType: ArtType): Promise<AnalysisResult> {
  const res = await fetch(`${getBackendUrl()}/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ art_type: artType, image_url: imageUrl }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`后端响应错误: ${res.status}`);
  }

  const data: ApiEnvelope<AnalysisResult> = await res.json();
  if (data.code !== 0) {
    throw new Error(data.message || '后端分析失败');
  }

  return data.data;
}

export async function analyzeImageUpload(file: File, artType: ArtType): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('art_type', artType);

  const res = await fetch(`${getBackendUrl()}/analyses/upload`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`后端响应错误: ${res.status}`);
  }

  const data: ApiEnvelope<AnalysisResult> = await res.json();
  if (data.code !== 0) {
    throw new Error(data.message || '后端分析失败');
  }

  return data.data;
}

export async function analyzeImageWithFallback(imageUrl: string, artType: ArtType): Promise<AnalysisResult> {
  if (isBackendEnabled()) {
    try {
      return await analyzeImageBackend(imageUrl, artType);
    } catch (error) {
      console.warn('后端分析失败，回退到前端分析:', error);
    }
  }
  return analyzeImage(imageUrl, artType);
}

/* ============================================================
   知识库API调用
   ============================================================ */

export async function searchArtworksAPI(
  query: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedArtworks> {
  const res = await fetch(
    `${getBackendUrl()}/artworks/search?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}`
  );
  if (!res.ok) throw new Error(`后端响应错误: ${res.status}`);
  const json: ApiEnvelope<PaginatedArtworks> = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

export async function getArtworksByCategoryAPI(
  category: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedArtworks> {
  const res = await fetch(
    `${getBackendUrl()}/artworks/category/${encodeURIComponent(category)}?page=${page}&page_size=${pageSize}`
  );
  if (!res.ok) throw new Error(`后端响应错误: ${res.status}`);
  const json: ApiEnvelope<PaginatedArtworks> = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

export async function getArtworkByIdAPI(id: string): Promise<ArtworkItem> {
  const res = await fetch(`${getBackendUrl()}/artworks/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`后端响应错误: ${res.status}`);
  const json: ApiEnvelope<ArtworkItem> = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

export async function getStyleCategoriesAPI(): Promise<StyleCategoriesResponse> {
  const res = await fetch(`${getBackendUrl()}/artworks/style-categories`);
  if (!res.ok) throw new Error(`后端响应错误: ${res.status}`);
  const json: ApiEnvelope<StyleCategoriesResponse> = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}
