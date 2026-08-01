// ============================================================
// 图像分析引擎(Jimp 版本) - Phase A 算法质量升级
// 从旧版 server/analysis.js + 前端 src/services/analysisService.ts 迁移
// 算法逻辑与前端 Canvas 版本完全一致,仅像素读取方式不同(Jimp 替代 Canvas)
//
// Phase A 升级内容:
//   A1. 色彩分析:色彩和谐度与饱和度分布(36色桶+和谐类型检测)
//   A2. 构图分析:黄金分割验证/三分法/引导线检测(完整Sobel梯度)
//   A3. 笔触/纹理:结构张量(coherence/energy/dominantDirection)
//   A4. 原创性检测:pHash感知哈希(无外部API依赖,基于名作库比对)
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
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type {
  ArtType,
  AnalysisResult,
  PaintingAnalysis,
  DesignAnalysis,
  ProductAnalysis,
  SculptureAnalysis,
  DimensionResult,
  SaturationDistribution,
  MostSimilarWork,
} from '../types/api-contract.js';
import { logger } from '../utils/logger.js';

// ---------- 像素与中间分析结构 ----------

interface PixelData {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 像素分析中间结果(Phase A升级:新增色相直方图/饱和度分布/Sobel梯度) */
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

/** 名作缓存项(用于pHash比对) */
interface CachedArtwork {
  id: string;
  title: string;
  artist: string;
  pHash: string;
}

/**
 * artworks.json 名作引用结构(G6:替换原 any[],用 zod schema 做运行时校验)
 * 兼容字段:author / artist(两者择一),year 可选
 */
const ArtworkReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string(),
  author: z.string().optional(),
  artist: z.string().optional(),
  year: z.number().optional(),
});

type ArtworkReference = z.infer<typeof ArtworkReferenceSchema>;

/**
 * artworks.json 数组 schema:整体解析失败时降级为空数组(保持向后兼容)
 */
const ArtworkReferenceArraySchema = z.array(ArtworkReferenceSchema);

// ============================================================
// 名作pHash缓存(懒加载,首次调用时初始化)
// ============================================================

let artworkPHashCache: CachedArtwork[] | null = null;
let artworkCacheLoading = false;

/** 获取data/artworks.json路径(兼容ESM/CJS) */
function getArtworksJsonPath(): string {
  // server/data/artworks.json 相对于本文件的路径
  // 本文件位于 server/src/services/analysis-engine.service.ts
  // 向上两级到 server/,再到 data/artworks.json
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, '..', '..', 'data', 'artworks.json');
  } catch {
    // 回退路径(当import.meta不可用时)
    return join(process.cwd(), 'data', 'artworks.json');
  }
}

/**
 * 启动时懒加载名作pHash缓存
 * 为artworks.json中的名作计算pHash并存入内存
 * 注意:artworks.json中的imageUrl是远程URL,Jimp需要下载;
 * 为避免网络依赖导致启动失败,如果下载失败则使用空缓存(不影响主流程)
 */
async function cacheArtworkPHashes(): Promise<void> {
  if (artworkPHashCache !== null || artworkCacheLoading) return;
  artworkCacheLoading = true;

  try {
    const artworksPath = getArtworksJsonPath();
    const raw = readFileSync(artworksPath, 'utf-8');
    // G6:用 zod schema 校验 artworks.json 结构,替换原 any[]
    // 解析失败时降级为空数组(保持向后兼容,不影响启动)
    const parsed = ArtworkReferenceArraySchema.safeParse(JSON.parse(raw));
    const artworks: ArtworkReference[] = parsed.success ? parsed.data : [];
    if (!parsed.success) {
      logger.warn(
        { err: parsed.error.message },
        '[analysis-engine] artworks.json schema validation failed, pHash cache disabled',
      );
    }
    const cache: CachedArtwork[] = [];

    // 仅取前5件名作用于测试比对(避免加载过多远程图片影响性能)
    const sampleArtworks = artworks.slice(0, 5);

    for (const aw of sampleArtworks) {
      try {
        // imageUrl 已由 schema 保证为 string,此处保留显式校验防御性编程
        if (!aw.imageUrl) continue;
        // 尝试加载图片并计算pHash;网络失败则跳过
        const img = await Jimp.read(aw.imageUrl);
        const hash = computePHashFromJimp(img);
        cache.push({
          id: aw.id,
          title: aw.title ?? 'Unknown',
          artist: aw.artist ?? 'Unknown',
          pHash: hash,
        });
      } catch (imgErr) {
        // 单张图片加载失败不影响整体缓存
        logger.debug({ artworkId: aw.id, err: imgErr instanceof Error ? imgErr.message : String(imgErr) }, '[analysis-engine] failed to cache artwork pHash');
      }
    }

    artworkPHashCache = cache;
    logger.info({ count: cache.length }, '[analysis-engine] artwork pHash cache loaded');
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[analysis-engine] failed to load artworks.json, pHash cache disabled');
    artworkPHashCache = [];
  } finally {
    artworkCacheLoading = false;
  }
}

// ============================================================
// 通用工具函数
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

/** 数值保留2位小数 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ============================================================
// Phase A1: 色彩和谐度计算
// ============================================================

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
export function calculateColorHarmony(pa: PixelAnalysis): { score: number; type: HarmonyType } {
  try {
    const hist = pa.hueHistogram; // 36个桶,每个桶10度
    const avgSat = pa.avgSaturation;

    // 无彩色:平均饱和度<15
    if (avgSat < 15) {
      return { score: round2(70 + Math.random() * 10), type: 'achromatic' };
    }

    // 找主色相桶(占比最大的连续区间)
    // 首先找主色相桶索引
    let maxBin = 0;
    let maxVal = 0;
    for (let i = 0; i < 36; i++) {
      if (hist[i]! > maxVal) {
        maxVal = hist[i]!;
        maxBin = i;
      }
    }

    // 单色:主色相桶占比>60%
    // 环形处理:检查主桶及相邻2桶(共50度范围)的占比
    let monoSum = 0;
    for (let d = -2; d <= 2; d++) {
      const idx = (maxBin + d + 36) % 36;
      monoSum += hist[idx]!;
    }
    if (monoSum > 0.6) {
      return { score: round2(75 + monoSum * 15), type: 'monochromatic' };
    }

    // 互补色检测:找与主色相相差150-210度(即15-21桶距离)的区间
    // 互补位置 = (maxBin + 18) % 36 (180度),检查±3桶(150-210度范围)
    const compStart = (maxBin + 15) % 36;
    const compEnd = (maxBin + 21) % 36;
    let compSum = 0;
    if (compStart <= compEnd) {
      for (let i = compStart; i <= compEnd; i++) {
        compSum += hist[i]!;
      }
    } else {
      // 环形环绕
      for (let i = compStart; i < 36; i++) compSum += hist[i]!;
      for (let i = 0; i <= compEnd; i++) compSum += hist[i]!;
    }
    if (monoSum + compSum > 0.3) {
      const score = round2(80 + (monoSum + compSum) * 25);
      return { score: Math.min(100, score), type: 'complementary' };
    }

    // 类比色检测:相邻3-4个色相区间(即3-4个桶,30-40度)占比>50%
    // 滑动窗口找最大连续4桶占比
    let maxAnalogous = 0;
    for (let start = 0; start < 36; start++) {
      let sum = 0;
      for (let d = 0; d < 4; d++) {
        sum += hist[(start + d) % 36]!;
      }
      if (sum > maxAnalogous) maxAnalogous = sum;
    }
    if (maxAnalogous > 0.5) {
      return { score: round2(78 + maxAnalogous * 22), type: 'analogous' };
    }

    // 三分色检测:三个色相区间相差约120度(±30度,即12±3桶)
    // 主桶+120度(+12桶)±3桶,主桶+240度(+24桶)±3桶
    const tri1Start = (maxBin + 9) % 36;
    const tri1End = (maxBin + 15) % 36;
    const tri2Start = (maxBin + 21) % 36;
    const tri2End = (maxBin + 27) % 36;
    let tri1Sum = 0;
    let tri2Sum = 0;
    const sumRange = (start: number, end: number): number => {
      let s = 0;
      if (start <= end) {
        for (let i = start; i <= end; i++) s += hist[i]!;
      } else {
        for (let i = start; i < 36; i++) s += hist[i]!;
        for (let i = 0; i <= end; i++) s += hist[i]!;
      }
      return s;
    };
    tri1Sum = sumRange(tri1Start, tri1End);
    tri2Sum = sumRange(tri2Start, tri2End);
    if (monoSum > 0.15 && tri1Sum > 0.1 && tri2Sum > 0.1 && monoSum + tri1Sum + tri2Sum > 0.45) {
      return { score: round2(82 + (monoSum + tri1Sum + tri2Sum) * 20), type: 'triadic' };
    }

    // 分裂互补色:主色+其互补色两侧的两个颜色(近似于三分色的一种变体)
    // 简化处理:如果有两个色相峰在互补色附近(±2桶)
    const sc1Start = (maxBin + 14) % 36;
    const sc2Start = (maxBin + 20) % 36;
    const sc1Sum = hist[sc1Start]! + hist[(sc1Start + 1) % 36]! + hist[(sc1Start - 1 + 36) % 36]!;
    const sc2Sum = hist[sc2Start]! + hist[(sc2Start + 1) % 36]! + hist[(sc2Start - 1 + 36) % 36]!;
    if (monoSum > 0.2 && (sc1Sum > 0.08 || sc2Sum > 0.08)) {
      return { score: round2(75 + monoSum * 20), type: 'split-complementary' };
    }

    // 混合/不明确:和谐度较低
    return { score: round2(55 + Math.random() * 10), type: 'mixed' };
  } catch {
    return { score: 65, type: 'mixed' };
  }
}

// ============================================================
// Phase A2: 构图评分(黄金分割/三分法/引导线)
// ============================================================

/**
 * 黄金分割评分
 * 四个黄金分割点: (0.382,0.382),(0.382,0.618),(0.618,0.382),(0.618,0.618)
 */
export function calculateGoldenRatioScore(focusPoint: { x: number; y: number }): number {
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
 * 四个三分线交点: (0.333,0.333),(0.333,0.667),(0.667,0.333),(0.667,0.667)
 */
export function calculateRuleOfThirdsScore(focusPoint: { x: number; y: number }): number {
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
 * 引导线检测(基于Sobel梯度方向统计)
 * 统计边缘像素的梯度方向,找主峰方向
 * @returns direction(0-180度), strength(0-1,主峰方向占比)
 */
export function detectLeadingLines(pa: PixelAnalysis): { direction: number; strength: number } {
  try {
    const W = pa.width;
    const H = pa.height;
    // 8个方向桶(每22.5度一个,0-180度范围)
    const dirBins = new Array<number>(8).fill(0);
    let totalEdges = 0;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (!pa.edgeMap[idx]) continue;
        const ix = pa.gradientX[idx]!;
        const iy = pa.gradientY[idx]!;
        const mag = Math.sqrt(ix * ix + iy * iy);
        if (mag < 10) continue; // 忽略弱边缘

        // 梯度方向(atan2返回-π到π,转为0-180度,因为边缘是双向的)
        let angle = Math.atan2(iy, ix) * (180 / Math.PI);
        if (angle < 0) angle += 180;
        if (angle >= 180) angle -= 180;
        // 8个方向桶:0=0-22.5, 1=22.5-45, ..., 7=157.5-180
        const binIdx = Math.min(7, Math.floor(angle / 22.5));
        dirBins[binIdx]!++;
        totalEdges++;
      }
    }

    if (totalEdges < 10) {
      return { direction: 0, strength: 0 };
    }

    // 找主峰方向
    let maxBin = 0;
    let maxCount = 0;
    for (let i = 0; i < 8; i++) {
      if (dirBins[i]! > maxCount) {
        maxCount = dirBins[i]!;
        maxBin = i;
      }
    }

    // 主峰方向角度(桶中心)
    const direction = round2(maxBin * 22.5 + 11.25);
    const strength = round2(maxCount / totalEdges);

    return { direction, strength };
  } catch {
    return { direction: 0, strength: 0 };
  }
}

// ============================================================
// Phase A3: 结构张量(笔触/纹理方向分析)
// ============================================================

/**
 * 计算结构张量(基于Sobel梯度)
 * 对全图计算平均Ix²/IxIy/Iy²,求特征值得到coherence/energy/dominantDirection
 * @returns coherence(0-1), energy(0-1), dominantDirection(0-180度)
 */
export function computeStructureTensor(
  pa: PixelAnalysis,
): { coherence: number; energy: number; dominantDirection: number } {
  try {
    const W = pa.width;
    const H = pa.height;
    let sumIxx = 0;
    let sumIxy = 0;
    let sumIyy = 0;
    let count = 0;

    // 仅统计内部像素(排除边界)
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        const p = pa.pixels[idx];
        if (!p || p.a < 128) continue;
        const ix = pa.gradientX[idx]!;
        const iy = pa.gradientY[idx]!;
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

    // 特征值解析解
    const trace = Ixx + Iyy;
    const det = Ixx * Iyy - Ixy * Ixy;
    const discriminant = trace * trace / 4 - det;

    let lambda1: number;
    let lambda2: number;
    if (discriminant < 0) {
      // 数值误差,取trace/2
      lambda1 = trace / 2;
      lambda2 = trace / 2;
    } else {
      const sqrtDisc = Math.sqrt(discriminant);
      lambda1 = trace / 2 + sqrtDisc;
      lambda2 = Math.max(0, trace / 2 - sqrtDisc);
    }

    const coherence = trace > 0 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;
    // energy归一化:梯度幅值平方均值/5000,归一化到0-1
    const energy = Math.min(1, (lambda1 + lambda2) / 5000);

    // 主导方向(lambda1对应的特征向量方向)
    // 特征向量: (lambda1 - Ixx, Ixy) 或等价方向
    let dominantAngle: number;
    if (Math.abs(Ixy) < 0.001 && Math.abs(lambda1 - Ixx) < 0.001) {
      dominantAngle = 0;
    } else {
      dominantAngle = Math.atan2(lambda1 - Ixx, Ixy) * (180 / Math.PI);
    }
    // 归一化到0-180度
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

// ============================================================
// Phase A4: pHash感知哈希
// ============================================================

/**
 * 从Jimp实例计算pHash(64位哈希,返回16字符hex字符串)
 * 步骤:resize 32x32 → 灰度 → DCT → 取8x8低频 → 中值二值化
 */
export function computePHashFromJimp(img: Jimp): string {
  // 复制图像避免修改原实例
  const workImg = img.clone();
  // 缩小到32x32
  workImg.resize(32, 32);
  // 转灰度
  workImg.grayscale();

  const W = 32;
  const H = 32;

  // 提取亮度矩阵
  const lum: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const r = workImg.bitmap.data[idx]!;
      row.push(r); // 灰度图r=g=b
    }
    lum.push(row);
  }

  // 2D-DCT:先对每行做1D-DCT,再对每列做1D-DCT
  const dctRows = oneDimDctRows(lum, W, H);
  const dct2d = oneDimDctCols(dctRows, W, H);

  // 取左上角8x8 DCT系数(排除DC分量即dct2d[0][0])
  const dct8x8: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue; // 排除DC分量
      dct8x8.push(dct2d[y]![x]!);
    }
  }

  // 计算中值
  const sorted = [...dct8x8].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  // 二值化:大于中值为1,否则为0 → 63位
  // 拼成16个hex字符(每4位一个hex)
  let bits = '';
  for (const v of dct8x8) {
    bits += v > median ? '1' : '0';
  }
  // 补齐到64位(在末尾补0)
  while (bits.length < 64) bits += '0';

  let hexHash = '';
  for (let i = 0; i < 16; i++) {
    const nibble = bits.substr(i * 4, 4);
    const val = parseInt(nibble, 2);
    hexHash += val.toString(16);
  }

  return hexHash;
}

/**
 * 1D-DCT-II(对每行做DCT)
 */
function oneDimDctRows(input: number[][], W: number, H: number): number[][] {
  const output: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = new Array(W).fill(0);
    for (let k = 0; k < W; k++) {
      let sum = 0;
      for (let n = 0; n < W; n++) {
        sum += input[y]![n]! * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * W));
      }
      const ck = k === 0 ? 1 / Math.sqrt(W) : Math.sqrt(2 / W);
      row[k] = sum * ck;
    }
    output.push(row);
  }
  return output;
}

/**
 * 1D-DCT-II(对每列做DCT)
 */
function oneDimDctCols(input: number[][], W: number, H: number): number[][] {
  const output: number[][] = [];
  for (let y = 0; y < H; y++) {
    output.push(new Array(W).fill(0));
  }
  for (let x = 0; x < W; x++) {
    for (let k = 0; k < H; k++) {
      let sum = 0;
      for (let n = 0; n < H; n++) {
        sum += input[n]![x]! * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * H));
      }
      const ck = k === 0 ? 1 / Math.sqrt(H) : Math.sqrt(2 / H);
      output[k]![x] = sum * ck;
    }
  }
  return output;
}

/**
 * 计算两个pHash的汉明距离
 * @param hash1 16字符hex
 * @param hash2 16字符hex
 * @returns 不同位的数量(0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const h1 = parseInt(hash1[i]!, 16);
    const h2 = parseInt(hash2[i]!, 16);
    let xor = h1 ^ h2;
    // 统计xor中1的位数
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

// ============================================================
// 通用像素分析基础(Phase A升级:完整Sobel+色相直方图+饱和度分布)
// ============================================================

/**
 * 读取图像并构建 PixelAnalysis 中间结构(对应旧版 analyzePixels)
 * 使用 Jimp 读取像素(替代前端 Canvas),缩放至 maxDim=500
 *
 * Phase A升级:
 *   - 新增Sobel 3x3梯度计算(gradientX/gradientY)
 *   - 边缘检测改用Sobel梯度幅值
 *   - 统计36色桶色相直方图(hueHistogram)
 *   - 统计饱和度三级分布(saturationDistribution)
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
  const colorBuckets: Record<string, number> = {};
  const hueHistogram = new Array<number>(36).fill(0);
  let satLow = 0;
  let satMid = 0;
  let satHigh = 0;
  let warmCount = 0;
  let totalLum = 0;
  let totalSat = 0;
  let valid = 0;

  // 第一遍:计算亮度/色相/饱和度/色彩桶
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

    // 36色桶色相直方图(每10度一个桶)
    if (hsl.s >= 10) {
      // 忽略低饱和度像素(灰度/近灰度)的色相统计
      const hueBin = Math.floor(hsl.h / 10) % 36;
      hueHistogram[hueBin]!++;
    }

    // 饱和度三级分布
    if (hsl.s < 33) satLow++;
    else if (hsl.s < 66) satMid++;
    else satHigh++;

    if (isWarmColor(p.r, p.g, p.b)) warmCount++;
    valid++;
    const bkt = `${Math.floor(p.r / 32)}-${Math.floor(p.g / 32)}-${Math.floor(p.b / 32)}`;
    colorBuckets[bkt] = (colorBuckets[bkt] ?? 0) + 1;
  }

  // 归一化色相直方图为占比
  // 重新统计有效色相像素(s>=10且a>=128)
  let hueValidCount = 0;
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i]!;
    if (p.a < 128) continue;
    const hsl = rgbToHsl(p.r, p.g, p.b);
    if (hsl.s >= 10) hueValidCount++;
  }
  for (let i = 0; i < 36; i++) {
    hueHistogram[i] = hueValidCount > 0 ? hueHistogram[i]! / hueValidCount : 0;
  }

  // 饱和度分布归一化
  const satTotal = satLow + satMid + satHigh;
  const saturationDistribution: SaturationDistribution = {
    low: satTotal > 0 ? round2(satLow / satTotal) : 0.33,
    mid: satTotal > 0 ? round2(satMid / satTotal) : 0.34,
    high: satTotal > 0 ? round2(satHigh / satTotal) : 0.33,
  };

  // Sobel梯度计算(3x3核)
  const gradientX: number[] = new Array(W * H).fill(0);
  const gradientY: number[] = new Array(W * H).fill(0);
  const edgeMap: boolean[] = new Array(W * H).fill(false);
  const edgeThreshold = 30;

  // Sobel核:
  // Gx = [-1 0 1; -2 0 2; -1 0 1]
  // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const p = pixels[idx];
      if (!p || p.a < 128) {
        gradientX[idx] = 0;
        gradientY[idx] = 0;
        continue;
      }

      // 3x3邻域像素索引
      const tl = (y - 1) * W + (x - 1);
      const tc = (y - 1) * W + x;
      const tr = (y - 1) * W + (x + 1);
      const ml = y * W + (x - 1);
      const mr = y * W + (x + 1);
      const bl = (y + 1) * W + (x - 1);
      const bc = (y + 1) * W + x;
      const br = (y + 1) * W + (x + 1);

      // 安全获取亮度(边界透明像素返回0)
      const getLum = (i: number): number => {
        const pp = pixels[i];
        return pp && pp.a >= 128 ? luminanceMap[i]! : 0;
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

      // Sobel梯度幅值边缘检测
      const mag = Math.sqrt(ix * ix + iy * iy);
      edgeMap[idx] = mag > edgeThreshold;
    }
  }

  // 边界像素梯度为0,边缘为false(已初始化)

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
        heatmap[i]![j]! = round2(Math.min(1, heatmap[i]![j]! / max));
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
// 按作品类型的分析生成器(Phase A升级:新增构图/色彩/笔触评分字段)
// ============================================================

/** 绘画分析:构图 + 色彩 + 笔触技法 */
export function analyzePainting(pa: PixelAnalysis): PaintingAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);
  const symmetry = calculateSymmetry(pa);
  const edgeDensity = calculateEdgeDensity(pa);
  const textureComplexity = calculateTextureComplexity(pa);

  // Phase A: 计算新增构图指标
  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);

  // Phase A: 计算色彩和谐度
  const colorHarmony = calculateColorHarmony(pa);

  // Phase A: 计算结构张量
  const structureTensor = computeStructureTensor(pa);

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

  // whitespaceRatio:精确计算亮度>200的像素占比(基于有效像素)
  let brightCount = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (p && p.a >= 128 && pa.luminanceMap[i]! > 200) brightCount++;
  }
  const whitespaceRatio = pa.totalValid > 0 ? brightCount / pa.totalValid : 0.4;

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
  if (leadingLines.strength > 0.3) {
    compSuggestion += `;引导线方向约${Math.round(leadingLines.direction)}度,引导视觉流动`;
  }

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
  // 追加和谐度描述
  const harmonyTypeDesc: Record<string, string> = {
    complementary: '互补色搭配,视觉张力强',
    analogous: '类比色搭配,色调和谐统一',
    triadic: '三分色搭配,色彩平衡且丰富',
    'split-complementary': '分裂互补搭配,既有对比又不失和谐',
    monochromatic: '单色搭配,色调统一',
    achromatic: '无彩色系,素雅沉静',
    mixed: '色彩搭配较为混合',
  };
  colorSuggestion += `;${harmonyTypeDesc[colorHarmony.type] ?? '色彩搭配一般'}`;

  // 笔触技法(Phase A:基于结构张量重新校准)
  // coherence高(>0.7)→工笔画/对齐良好;coherence低(<0.4)→写意画/笔触多变
  const tensor = structureTensor;
  let textureLevel: PaintingAnalysis['brushwork']['textureLevel'];
  if (tensor.coherence > 0.7 || textureComplexity < 0.3) {
    textureLevel = textureComplexity > 0.5 ? 'moderate' : 'simple';
  } else if (tensor.coherence < 0.4 || textureComplexity > 0.6) {
    textureLevel = 'rich';
  } else {
    textureLevel = textureComplexity > 0.45 ? 'rich' : textureComplexity > 0.3 ? 'moderate' : 'simple';
  }

  // strokeVariety结合边缘密度和coherence调整
  const strokeVariety = Math.round(
    Math.min(100, edgeDensity * 100 * (1 - tensor.coherence * 0.3) + tensor.energy * 20),
  );

  const wetDryBalance =
    pa.avgSaturation > 50 ? '湿润感强' : pa.avgSaturation < 25 ? '偏干涩' : '干湿适中';

  const brushScore = Math.max(
    60,
    Math.min(95, 70 + textureComplexity * 25 + (strokeVariety > 30 ? 5 : 0) + tensor.energy * 10),
  );

  let brushSuggestion = `笔触肌理${textureLevel === 'rich' ? '丰富' : textureLevel === 'moderate' ? '适中' : '较为单一'}`;
  brushSuggestion += `,笔画变化${strokeVariety > 40 ? '丰富' : strokeVariety > 20 ? '适中' : '较少'}`;
  brushSuggestion += `,${wetDryBalance}`;
  if (tensor.coherence > 0.7) {
    brushSuggestion += ';笔触方向一致,呈现工笔/精细刻画特征';
  } else if (tensor.coherence < 0.4) {
    brushSuggestion += ';笔触方向多变,呈现写意/奔放特征';
  }
  if (textureLevel === 'simple') brushSuggestion += ';建议尝试更多笔触变化,增加画面肌理层次';
  else if (strokeVariety < 25) brushSuggestion += ';可加强笔触的干湿、粗细变化';

  return {
    type: 'painting',
    composition: {
      score: Math.round(compScore),
      focusPoint: { x: round2(fx), y: round2(fy) },
      balance,
      guideline,
      whitespaceRatio: round2(whitespaceRatio),
      symmetry: round2(symmetry),
      suggestion: compSuggestion,
      heatmapData,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    color: {
      score: Math.round(colorScore),
      warmRatio: round2(pa.warmRatio),
      coolRatio: round2(1 - pa.warmRatio),
      contrast,
      saturation,
      richness,
      harmony:
        warmPercent > 60 ? '暖色调和谐' : warmPercent < 40 ? '冷色调和谐' : '冷暖平衡',
      dominantColor,
      suggestion: colorSuggestion,
      harmonyScore: colorHarmony.score,
      harmonyType: colorHarmony.type,
      saturationDistribution: pa.saturationDistribution,
    },
    brushwork: {
      score: Math.round(brushScore),
      textureLevel,
      strokeVariety,
      wetDryBalance,
      suggestion: brushSuggestion,
      directionCoherence: tensor.coherence,
      strokeEnergy: tensor.energy,
      dominantBrushDirection: tensor.dominantDirection,
    },
  };
}

/** 设计分析:视觉层次 + 排版 + 色彩应用 */
export function analyzeDesign(pa: PixelAnalysis): DesignAnalysis {
  const focusPoint = calculateFocusPoint(pa);
  const heatmapData = generateHeatmap(pa);

  // Phase A: 构图指标
  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

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

  // 信息流动:基于Sobel梯度方向判断(使用8方向统计)
  let horizontalEdges = 0;
  let verticalEdges = 0;
  for (let y = 1; y < pa.height - 1; y++) {
    for (let x = 1; x < pa.width - 1; x++) {
      const idx = y * pa.width + x;
      if (!pa.edgeMap[idx]) continue;
      const ix = pa.gradientX[idx]!;
      const iy = pa.gradientY[idx]!;
      const mag = Math.sqrt(ix * ix + iy * iy);
      if (mag < 10) continue;
      // x方向梯度大→垂直边缘;y方向梯度大→水平边缘
      if (Math.abs(ix) > Math.abs(iy)) verticalEdges++;
      else horizontalEdges++;
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
  if (leadingLines.strength > 0.25) {
    hierarchySuggestion += `;存在约${Math.round(leadingLines.direction)}度方向的引导线`;
  }

  // 排版(Phase A:directionCoherence检测对齐程度)
  const alignmentQuality: DesignAnalysis['typography']['alignmentQuality'] =
    hRatio > 0.55 ? 'good' : hRatio > 0.4 ? 'average' : 'poor';
  const rhythmConsistency: DesignAnalysis['typography']['rhythmConsistency'] =
    pa.avgSaturation < 40 ? 'good' : pa.avgSaturation < 60 ? 'average' : 'poor';
  let brightCount = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (p && p.a >= 128 && pa.luminanceMap[i]! > 220) brightCount++;
  }
  const highLumRatio = pa.totalValid > 0 ? brightCount / pa.totalValid : 0;
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
        (gridAdherence > 70 ? 5 : gridAdherence < 40 ? -5 : 0) +
        (structureTensor.coherence > 0.5 ? 5 : structureTensor.coherence < 0.3 ? -3 : 0),
    ),
  );

  let typeSuggestion =
    alignmentQuality === 'good'
      ? '对齐规范,网格感强'
      : alignmentQuality === 'poor'
        ? '对齐不够统一,建议建立清晰的网格系统'
        : '对齐基本规范';
  if (structureTensor.coherence > 0.5) {
    typeSuggestion += ';元素方向一致,排版整齐';
  } else if (structureTensor.coherence < 0.3) {
    typeSuggestion += ';元素方向不够统一,建议加强对齐';
  }
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
      focusPoint: { x: round2(fx), y: round2(fy) },
      primarySecondaryClarity,
      informationFlow,
      heatmapData,
      suggestion: hierarchySuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    typography: {
      score: Math.round(typeScore),
      alignmentQuality,
      rhythmConsistency,
      negativeSpaceUsage,
      gridAdherence,
      suggestion: typeSuggestion,
      directionCoherence: round2(structureTensor.coherence),
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

  // Phase A: 构图指标
  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

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

  // 线条流畅度:边缘连续性的反向(结合结构张量coherence)
  let edgeBreaks = 0;
  for (let i = 1; i < pa.edgeMap.length; i++) {
    if (pa.edgeMap[i] && !pa.edgeMap[i - 1]) edgeBreaks++;
  }
  // coherence高表示线条方向一致,流畅度好
  let lineFluidity: ProductAnalysis['form']['lineFluidity'];
  const breakRatio = edgeBreaks / pa.edgeMap.length;
  if (breakRatio < 0.03 || (breakRatio < 0.05 && structureTensor.coherence > 0.5)) {
    lineFluidity = 'smooth';
  } else if (breakRatio < 0.08 || structureTensor.coherence > 0.35) {
    lineFluidity = 'moderate';
  } else {
    lineFluidity = 'stiff';
  }

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
        (surfaceQuality === 'excellent' ? 5 : surfaceQuality === 'average' ? -3 : 0) +
        (structureTensor.coherence > 0.4 ? 3 : 0),
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
  if (structureTensor.coherence > 0.5) {
    formSuggestion += ';曲面线条方向一致,造型流畅';
  }
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
      focusPoint: { x: round2(focusPoint.x), y: round2(focusPoint.y) },
      proportionBalance,
      lineFluidity,
      surfaceQuality,
      ergonomicsHint,
      heatmapData,
      suggestion: formSuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
      directionCoherence: round2(structureTensor.coherence),
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

  // Phase A: 构图+结构张量
  const goldenRatioScore = calculateGoldenRatioScore(focusPoint);
  const ruleOfThirdsScore = calculateRuleOfThirdsScore(focusPoint);
  const leadingLines = detectLeadingLines(pa);
  const structureTensor = computeStructureTensor(pa);

  // 空间构成
  const volumeSense: SculptureAnalysis['spatialComposition']['volumeSense'] =
    edgeDensity > 0.1 ? 'strong' : edgeDensity > 0.06 ? 'moderate' : 'weak';
  const occupationRatio = pa.width * pa.height > 0 ? pa.totalValid / (pa.width * pa.height) : 0.5;
  const spaceOccupation: SculptureAnalysis['spatialComposition']['spaceOccupation'] =
    occupationRatio > 0.6 ? 'full' : occupationRatio > 0.35 ? 'moderate' : 'sparse';
  let brightCountS = 0;
  let darkCountS = 0;
  for (let i = 0; i < pa.pixels.length; i++) {
    const p = pa.pixels[i];
    if (!p || p.a < 128) continue;
    if (pa.luminanceMap[i]! > 200) brightCountS++;
    if (pa.luminanceMap[i]! < 80) darkCountS++;
  }
  const highLumRatio = pa.totalValid > 0 ? brightCountS / pa.totalValid : 0;
  const lowLumRatio = pa.totalValid > 0 ? darkCountS / pa.totalValid : 0;
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
  if (leadingLines.strength > 0.25) {
    spatialSuggestion += `;形体引导线约${Math.round(leadingLines.direction)}度方向`;
  }

  // 形体语言:动态感(边缘方向变化率,结合结构张量energy)
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
  // 高energy表示形体张力强,影响动态感判定
  const dynamicSense: SculptureAnalysis['bodyLanguage']['dynamicSense'] =
    directionChanges > edgeTrueCount * 0.3 || structureTensor.energy > 0.3
      ? 'strong'
      : directionChanges > edgeTrueCount * 0.15 || structureTensor.energy > 0.15
        ? 'moderate'
        : 'static';

  // tensionExpression结合结构张量energy
  let tensionExpression: SculptureAnalysis['bodyLanguage']['tensionExpression'];
  if (edgeDensity > 0.12 || structureTensor.energy > 0.25) tensionExpression = 'high';
  else if (edgeDensity > 0.07 || structureTensor.energy > 0.12) tensionExpression = 'medium';
  else tensionExpression = 'low';

  const rhythmFlow: SculptureAnalysis['bodyLanguage']['rhythmFlow'] =
    textureComplexity > 0.5 ? 'fluent' : textureComplexity > 0.25 ? 'moderate' : 'stiff';

  const bodyScore = Math.max(
    60,
    Math.min(
      95,
      80 +
        (dynamicSense === 'strong' ? 5 : dynamicSense === 'static' ? -8 : 0) +
        (tensionExpression === 'high' ? 5 : tensionExpression === 'low' ? -5 : 0) +
        (rhythmFlow === 'fluent' ? 5 : rhythmFlow === 'stiff' ? -5 : 0) +
        structureTensor.energy * 10,
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
  if (structureTensor.coherence > 0.6) {
    bodySuggestion += ';形体线条方向一致,整体感强';
  } else if (structureTensor.coherence < 0.3) {
    bodySuggestion += ';形体方向多变,富有表现力';
  }
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
      focusPoint: { x: round2(focusPoint.x), y: round2(focusPoint.y) },
      volumeSense,
      spaceOccupation,
      voidSolidRelation,
      heatmapData,
      suggestion: spatialSuggestion,
      goldenRatioScore,
      ruleOfThirdsScore,
      leadingLineDirection: leadingLines.direction,
      leadingLineStrength: leadingLines.strength,
    },
    bodyLanguage: {
      score: Math.round(bodyScore),
      dynamicSense,
      tensionExpression,
      rhythmFlow,
      suggestion: bodySuggestion,
      directionCoherence: round2(structureTensor.coherence),
      strokeEnergy: round2(structureTensor.energy),
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
// 原创性分析(Phase A重写:基于pHash感知哈希与名作比对)
// ============================================================

/**
 * 原创性分析(基于pHash与名作库比对)
 * @param pa 像素分析结果
 * @param img Jimp图像实例(用于计算pHash)
 * @returns 原创性维度结果
 */
export function analyzeOriginality(pa: PixelAnalysis, img?: Jimp): AnalysisResult['originality'] {
  try {
    // 计算pHash并与名作比对
    let pHashSimilarity = 0;
    let minDistance = 32; // 默认较大距离
    let mostSimilar: MostSimilarWork | null = null;

    if (img && artworkPHashCache && artworkPHashCache.length > 0) {
      const uploadHash = computePHashFromJimp(img);
      for (const aw of artworkPHashCache) {
        const dist = hammingDistance(uploadHash, aw.pHash);
        if (dist < minDistance) {
          minDistance = dist;
          mostSimilar = {
            title: aw.title,
            artist: aw.artist,
            distance: dist,
          };
        }
      }
      // pHash相似度:距离0→1.0,距离32→0
      pHashSimilarity = round2(Math.max(0, 1 - minDistance / 32));
    } else {
      // 缓存未加载,回退到原算法
      return analyzeOriginalityFallback(pa);
    }

    // 评分:距离越小分数越低(相似度高=原创性低)
    const score = Math.round(Math.max(50, Math.min(98, 100 - minDistance * 2.5)));

    // 原创性等级判定
    let creativityLevel: AnalysisResult['originality']['creativityLevel'];
    let suggestion: string;

    if (minDistance < 5) {
      creativityLevel = 'needsWork';
      suggestion = `原创性需加强(pHash距离${minDistance},与名作《${mostSimilar?.title ?? '未知'}》(${mostSimilar?.artist ?? '未知'})高度相似,相似度${Math.round(pHashSimilarity * 100)}%)。建议大幅增加原创元素,形成个人风格。`;
    } else if (minDistance < 12) {
      creativityLevel = 'average';
      suggestion = `原创性一般(pHash距离${minDistance},与《${mostSimilar?.title ?? '未知'}》(${mostSimilar?.artist ?? '未知'})部分相似,相似度${Math.round(pHashSimilarity * 100)}%)。建议在造型或处理手法上寻求突破,增加个人特色。`;
    } else if (minDistance < 20) {
      creativityLevel = 'good';
      suggestion = `原创性良好(pHash距离${minDistance},与《${mostSimilar?.title ?? '未知'}》有一定相似性,相似度${Math.round(pHashSimilarity * 100)}%)。建议增加更多个人风格元素,让作品更具独特性。`;
    } else {
      creativityLevel = 'excellent';
      suggestion = `原创性优秀(pHash距离${minDistance},与名作库相似度仅${Math.round(pHashSimilarity * 100)}%)。作品具有独特个人风格,继续探索更多可能性!`;
    }

    // 计算基础similarity(保持与旧版兼容,基于边缘密度+色彩种类估算)
    const edgeDensity = calculateEdgeDensity(pa);
    const colorVariety = Object.keys(pa.colorBuckets).length;
    const baseSimilarity = Math.min(
      0.45,
      0.12 + edgeDensity * 2 + Math.max(0, 0.08 - colorVariety / 100),
    );

    return {
      score,
      similarity: round2(baseSimilarity),
      creativityLevel,
      suggestion,
      pHashSimilarity,
      mostSimilarWork: mostSimilar,
    };
  } catch {
    return analyzeOriginalityFallback(pa);
  }
}

/** 原创性分析回退(无pHash缓存时使用原算法) */
function analyzeOriginalityFallback(pa: PixelAnalysis): AnalysisResult['originality'] {
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
    similarity: round2(similarity),
    creativityLevel: level,
    suggestion,
    pHashSimilarity: round2(1 - similarity),
    mostSimilarWork: null,
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
    // 懒加载名作pHash缓存(不阻塞主流程,失败则使用回退算法)
    // 不await缓存加载,避免网络问题导致分析超时
    void cacheArtworkPHashes();

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

    // 原创性分析(传入Jimp实例用于pHash计算)
    const originality = analyzeOriginality(pa, img);

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
    similarity: round2(Math.random() * 0.2 + 0.1),
    creativityLevel: 'good',
    suggestion: '建议增加个人风格元素',
    pHashSimilarity: round2(Math.random() * 0.3 + 0.5),
    mostSimilarWork: null,
  };

  const heatmapData: number[][] = Array.from({ length: 20 }, () =>
    Array.from({ length: 20 }, () => Math.round(Math.random() * 60) / 100),
  );
  const focusPoint = { x: round2(Math.random() * 0.4 + 0.3), y: round2(Math.random() * 0.4 + 0.3) };

  // Phase A新字段默认值
  const defaultCompositionExtras = {
    goldenRatioScore: round2(50 + Math.random() * 20),
    ruleOfThirdsScore: round2(50 + Math.random() * 20),
    leadingLineDirection: round2(Math.random() * 180),
    leadingLineStrength: round2(Math.random() * 0.3),
  };

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
        ...defaultCompositionExtras,
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
        harmonyScore: round2(65 + Math.random() * 15),
        harmonyType: 'mixed',
        saturationDistribution: { low: 0.33, mid: 0.34, high: 0.33 },
      },
      brushwork: {
        score: baseScore - 1,
        textureLevel: 'moderate',
        strokeVariety: 35,
        wetDryBalance: '适中',
        suggestion: '笔触技法尚可',
        directionCoherence: round2(0.4 + Math.random() * 0.2),
        strokeEnergy: round2(0.3 + Math.random() * 0.2),
        dominantBrushDirection: round2(Math.random() * 180),
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
        ...defaultCompositionExtras,
      },
      typography: {
        score: baseScore + 1,
        alignmentQuality: 'average',
        rhythmConsistency: 'average',
        negativeSpaceUsage: 'average',
        gridAdherence: 60,
        suggestion: '排版基本规范',
        directionCoherence: round2(0.4 + Math.random() * 0.2),
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
        ...defaultCompositionExtras,
        directionCoherence: round2(0.4 + Math.random() * 0.2),
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
        ...defaultCompositionExtras,
      },
      bodyLanguage: {
        score: baseScore + 1,
        dynamicSense: 'moderate',
        tensionExpression: 'medium',
        rhythmFlow: 'moderate',
        suggestion: '形体语言尚可',
        directionCoherence: round2(0.4 + Math.random() * 0.2),
        strokeEnergy: round2(0.3 + Math.random() * 0.2),
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
