/**
 * 素材库全量图片生成器
 * ----------------------------
 * 读取 public/data/artworks.json 全部条目，按 category/style/era 生成确定性 PNG。
 * 输出两层结构：
 *   - public/images/artworks/thumb/640x360  列表/预加载用
 *   - public/images/artworks/full/1920x1080 详情页用
 * 纯 Node，无第三方依赖，内置 zlib 手写 PNG 编码。
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ============================================================
// PNG 编码器（与 gen-sample-works.cjs 一致）
// ============================================================
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ============================================================
// 画布
// ============================================================
class Canvas {
  constructor(w, h, bg = [250, 248, 244, 255]) {
    this.w = w; this.h = h;
    this.px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0]; this.px[i * 4 + 1] = bg[1];
      this.px[i * 4 + 2] = bg[2]; this.px[i * 4 + 3] = bg[3];
    }
  }
  blend(x, y, r, g, b, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const ia = 1 - a;
    this.px[i] = Math.round(r * a + this.px[i] * ia);
    this.px[i + 1] = Math.round(g * a + this.px[i + 1] * ia);
    this.px[i + 2] = Math.round(b * a + this.px[i + 2] * ia);
    this.px[i + 3] = 255;
  }
  rect(x0, y0, w, h, r, g, b, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.blend(x, y, r, g, b, a);
  }
  circle(cx, cy, rad, r, g, b, a = 1) {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= rad) this.blend(x, y, r, g, b, a * Math.min(1, rad - d));
    }
  }
  ellipse(cx, cy, rx, ry, r, g, b, a = 1) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) this.blend(x, y, r, g, b, a * Math.min(1, (1 - d) * 4));
    }
  }
  save(file) {
    fs.writeFileSync(file, encodePNG(this.w, this.h, this.px));
    return Math.round(fs.statSync(file).size / 1024);
  }
}

// ============================================================
// 工具函数
// ============================================================
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function lineSeg(c, x1, y1, x2, y2, r, g, b, a, thick) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    c.circle(x1 + dx * t, y1 + dy * t, thick, r, g, b, a);
  }
}

function fillPoly(c, pts, r, g, b, a) {
  const ys = pts.map((p) => p[1]);
  const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(x1 + (x2 - x1) * t);
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) c.blend(x, y, r, g, b, a);
    }
  }
}

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function seededChoice(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

// 带 alpha 的二次贝塞尔曲线
function quadBezier(c, x0, y0, x1, y1, x2, y2, r, g, b, a, thick) {
  const steps = Math.max(20, Math.ceil(Math.hypot(x2 - x0, y2 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    c.circle(x, y, thick, r, g, b, a);
  }
}

// 模拟宣纸/画布纹理
function paperTexture(c, rand, strength = 0.04) {
  const W = c.w, H = c.h;
  for (let i = 0; i < W * H * strength; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * H);
    const v = rand() * 255;
    c.blend(x, y, v, v, v, 0.03 + rand() * 0.04);
  }
}

// 边缘暗角
function vignette(c, r, g, b, strength = 0.25) {
  const W = c.w, H = c.h;
  const cx = W / 2, cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const a = Math.pow(d, 2.5) * strength;
      c.blend(x, y, r, g, b, a);
      c.blend(x + 1, y, r, g, b, a);
      c.blend(x, y + 1, r, g, b, a);
      c.blend(x + 1, y + 1, r, g, b, a);
    }
  }
}

// 方向性笔触（油画/水彩）
function brushStroke(c, x, y, len, angle, width, col, alpha, rand) {
  const dx = Math.cos(angle) * len;
  const dy = Math.sin(angle) * len;
  const steps = Math.max(10, Math.floor(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = width * (1 - t * 0.3 + rand() * 0.2);
    c.circle(x + dx * t + (rand() - 0.5) * width * 0.3, y + dy * t + (rand() - 0.5) * width * 0.3, w, ...col, alpha);
  }
}

// ============================================================
// 配色板（按 category + style 微调）
// ============================================================
const BASE_PALETTES = {
  painting: {
    default: ['#f5f2eb', '#1a1a1a', '#c41e3a', '#2e5fa1', '#5b8c5a', '#d4af37'],
    水墨: ['#f2f0e9', '#1f1f1f', '#8b0000', '#4a4a4a', '#7d7d7d', '#c0b090'],
    写意: ['#f4f1ea', '#2b2b2b', '#b22222', '#4a6741', '#8c7b70', '#d4af37'],
    工笔: ['#f9f6f0', '#1a1a1a', '#c41e3a', '#2e5fa1', '#e8d5c4', '#d4af37'],
    青绿: ['#f0f4f0', '#1a3c2b', '#4a7c59', '#8fb9a8', '#d4af37', '#2e5fa1'],
    金碧: ['#f7f3e8', '#1a1a1a', '#d4af37', '#8b4513', '#c41e3a', '#2e5fa1'],
    油画: ['#3d2b24', '#f5e6d3', '#c45c26', '#8b3a3a', '#d4a574', '#2e5fa1'],
    水彩: ['#f7fbff', '#8ecae6', '#219ebc', '#023047', '#ffb703', '#fb8500'],
    素描: ['#f8f6f0', '#1a1a1a', '#5a5a5a', '#8a8a8a', '#4a4a4a', '#2e2e2e'],
    版画: ['#f4f1ea', '#0f0f0f', '#8b0000', '#d4af37', '#1a1a1a', '#5a5a5a'],
    壁画: ['#e8dcc8', '#6b4423', '#a0522d', '#d4af37', '#8b4513', '#2e5fa1'],
    泼彩: ['#f5f2eb', '#c41e3a', '#2e5fa1', '#5b8c5a', '#d4af37', '#8a2be2'],
    没骨: ['#fdfcf9', '#c41e3a', '#e8b4b8', '#5b8c5a', '#d4af37', '#2e5fa1'],
  },
  design: {
    default: ['#f9f6f0', '#0f0f0f', '#c41e3a', '#2e5fa1', '#f5f2eb'],
    极简主义: ['#ffffff', '#0f0f0f', '#e5e5e5', '#999999', '#f5f2eb'],
    包豪斯: ['#f5f2eb', '#0f0f0f', '#c41e3a', '#2e5fa1', '#f0c000'],
    装饰艺术: ['#f7e7ce', '#1a1a1a', '#d4af37', '#c41e3a', '#2e5fa1'],
    新艺术运动: ['#f4f0e6', '#2d5a4a', '#c45c26', '#d4af37', '#8fb9a8'],
    后现代: ['#f5f2eb', '#ff00ff', '#00ffff', '#ffff00', '#0f0f0f'],
    数字艺术: ['#0a0a0a', '#00ff9f', '#00d2ff', '#ff0055', '#7000ff'],
    波普艺术: ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00'],
    瑞士风格: ['#ffffff', '#0f0f0f', '#c41e3a', '#2e5fa1', '#e5e5e5'],
  },
  product: {
    default: ['#f5f2eb', '#595959', '#8b5a2b', '#2e5fa1', '#5b8c5a'],
    功能主义: ['#f5f2eb', '#595959', '#8b5a2b', '#2e5fa1', '#5b8c5a'],
    流线型: ['#e8e8e8', '#4a4a4a', '#c0c0c0', '#8b0000', '#2e5fa1'],
    有机设计: ['#f4f1ea', '#5b4a3c', '#8b5a2b', '#5b8c5a', '#d4af37'],
    北欧风格: ['#f9f7f2', '#4a5568', '#a0aec0', '#e2e8f0', '#2e5fa1'],
    日式设计: ['#f7f5f0', '#2d2d2d', '#c41e3a', '#d4af37', '#8b7355'],
  },
  sculpture: {
    default: ['#e5e5e5', '#404040', '#8b5a2b', '#1a1a1a', '#a8862a'],
    写实: ['#e8e4dc', '#5a4a3c', '#8b7355', '#3d2b1f', '#d4af37'],
    抽象: ['#f0f0f0', '#2d2d2d', '#c41e3a', '#2e5fa1', '#d4af37'],
    装置: ['#1a1a1a', '#f5f2eb', '#c41e3a', '#00ff9f', '#2e5fa1'],
    动态雕塑: ['#f5f2eb', '#c0c0c0', '#2e5fa1', '#d4af37', '#8b0000'],
    大地艺术: ['#d4c4a8', '#8b7355', '#5b4a3c', '#a0522d', '#6b8e23'],
  },
  calligraphy: {
    default: ['#fdfcf9', '#0f0f0f', '#c41e3a', '#2d2d2d'],
    楷书: ['#fdfcf9', '#1a1a1a', '#8b0000', '#d4af37'],
    行书: ['#f7f3e8', '#1a1a1a', '#8b0000', '#d4af37'],
    草书: ['#f5f2eb', '#1a1a1a', '#c41e3a', '#2e5fa1'],
    隶书: ['#f4f1ea', '#1a1a1a', '#8b4513', '#d4af37'],
    篆书: ['#efece4', '#3d3d3d', '#8b4513', '#d4af37'],
    魏碑: ['#f5f2eb', '#1a1a1a', '#5a4a3c', '#8b0000'],
    瘦金体: ['#fdfcf9', '#1a1a1a', '#2e5fa1', '#d4af37'],
  },
  architecture: {
    default: ['#f5f2eb', '#404040', '#2e5fa1', '#d4af37', '#1a1a1a'],
    参数化: ['#ffffff', '#1a1a1a', '#c0c0c0', '#2e5fa1', '#f5f2eb'],
    新中式: ['#f7f3e8', '#5a3a3a', '#8b4513', '#d4af37', '#2d5a4a'],
    古典主义: ['#f5f2eb', '#d4af37', '#8b7355', '#ffffff', '#2e5fa1'],
    哥特式: ['#e8e4dc', '#2d2d2d', '#8b4513', '#d4af37', '#5a4a3c'],
    巴洛克: ['#f7e7ce', '#8b4513', '#d4af37', '#c41e3a', '#2e5fa1'],
    现代主义: ['#f5f2eb', '#4a4a4a', '#c0c0c0', '#2e5fa1', '#1a1a1a'],
  },
};

function paletteFor(item) {
  const cat = BASE_PALETTES[item.category] || BASE_PALETTES.painting;
  const pal = cat[item.style] || cat.default;
  const colors = pal.map(rgb);
  // 统一补齐到 6 色，避免部分分类配色不足时解构出 undefined
  while (colors.length < 6) {
    colors.push(colors[colors.length - 1]);
  }
  return colors;
}

// ============================================================
// 分类图案生成器
// ============================================================
function drawPainting(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, accent, stone, jade, gold] = colors;
  const style = item.style;
  const W = c.w, H = c.h;

  // 背景：柔和渐变 + 纸张纹理
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const col = mix(bg, stone, t * 0.12 + Math.sin(t * Math.PI) * 0.05);
    c.rect(0, y, W, 1, ...col, 1);
  }
  paperTexture(c, rand, 0.015);

  if (['水墨', '写意', '青绿', '金碧', '没骨', '泼彩'].includes(style)) {
    // 远山水墨层（多层、多峰、平滑）
    for (let i = 0; i < 6; i++) {
      const yBase = H * (0.32 + i * 0.09);
      let pts = [[0, yBase]];
      const peaks = 2 + Math.floor(rand() * 3);
      for (let p = 0; p <= peaks; p++) {
        const x = (W / peaks) * p;
        const peakH = (30 + rand() * 60) * (1 - i * 0.12);
        pts.push([x, yBase - peakH]);
        if (p < peaks) pts.push([x + W / peaks * 0.5, yBase - peakH * 0.3 - rand() * 20]);
      }
      pts.push([W, H], [0, H]);
      fillPoly(c, pts, ...ink, 0.05 + i * 0.035);
    }
    // 主峰
    const peakX = W * (0.35 + rand() * 0.3);
    const peakH = H * (0.28 + rand() * 0.15);
    fillPoly(c, [
      [peakX - W * 0.28, H * 0.74],
      [peakX - W * 0.08, H * 0.74 - peakH * 0.6],
      [peakX, H * 0.74 - peakH],
      [peakX + W * 0.12, H * 0.74 - peakH * 0.65],
      [peakX + W * 0.26, H * 0.74],
    ], ...(['青绿', '金碧'].includes(style) ? jade : ink), 0.4);
    // 山体阴影/皴擦
    for (let i = 0; i < 8; i++) {
      const sx = peakX + (rand() - 0.5) * W * 0.25;
      const sy = H * 0.55 + rand() * H * 0.18;
      quadBezier(c, sx, sy, sx + (rand() - 0.5) * W * 0.1, sy - H * 0.05, sx + (rand() - 0.5) * W * 0.15, sy + H * 0.03,
        ...ink, 0.25, 1.5 + rand());
    }
    // 金色/朱砂点缀
    if (style === '金碧') {
      for (let i = 0; i < 12; i++) {
        c.circle(W * rand(), H * (0.35 + rand() * 0.45), 1.5 + rand() * 3, ...gold, 0.55);
      }
    }
    // 泼彩/没骨色块（边缘更柔和、数量更少）
    if (style === '泼彩' || style === '没骨') {
      for (let i = 0; i < 18; i++) {
        const col = seededChoice(rand, [accent, stone, jade, gold]);
        const x = W * rand();
        const y = H * (0.25 + rand() * 0.5);
        const rx = 40 + rand() * 90;
        const ry = 25 + rand() * 55;
        c.ellipse(x, y, rx, ry, ...col, 0.18);
        c.ellipse(x + 10, y + 5, rx * 0.5, ry * 0.5, ...col, 0.12);
      }
    }
    // 装裱边框
    const pad = Math.min(W, H) * 0.025;
    c.rect(0, 0, W, pad, ...mix(bg, ink, 0.25), 1);
    c.rect(0, H - pad, W, pad, ...mix(bg, ink, 0.25), 1);
    c.rect(0, 0, pad, H, ...mix(bg, ink, 0.25), 1);
    c.rect(W - pad, 0, pad, H, ...mix(bg, ink, 0.25), 1);
    // 印章
    const sealR = Math.min(W, H) * 0.032;
    c.circle(W - sealR * 2.8, H - sealR * 2.8, sealR, ...accent, 0.85);
    // 暗角
    vignette(c, 20, 18, 15, 0.18);
  } else if (style === '油画' || style === '水彩') {
    // 让墙面/背景稍亮，突出主体
    c.rect(0, 0, W, H * 0.64, ...mix(bg, [255, 255, 255], 0.25), 0.4);
    // 静物台面
    c.rect(0, H * 0.64, W, H * 0.36, ...mix(bg, ink, 0.18), 1);
    lineSeg(c, 0, H * 0.64, W, H * 0.64, ...ink, 0.25, 2);

    // 主体器物（花瓶）——放在画面偏左或偏右，留出背景
    const px = W * (0.38 + rand() * 0.24), py = H * 0.55;
    const jarW = W * 0.1, jarH = H * 0.24;
    const jarPts = [
      [px - jarW * 0.35, py + jarH],
      [px - jarW * 0.9, py + jarH * 0.45],
      [px - jarW * 0.75, py - jarH * 0.5],
      [px - jarW * 0.35, py - jarH],
      [px + jarW * 0.35, py - jarH],
      [px + jarW * 0.75, py - jarH * 0.5],
      [px + jarW * 0.9, py + jarH * 0.45],
      [px + jarW * 0.35, py + jarH],
    ];
    fillPoly(c, jarPts, ...accent, 0.96);
    // 瓶口
    c.ellipse(px, py - jarH, jarW * 0.38, jarH * 0.07, ...mix(bg, ink, 0.25), 0.9);
    // 瓶身高光
    c.ellipse(px - jarW * 0.35, py - jarH * 0.25, jarW * 0.08, jarH * 0.3, ...mix(accent, [255, 255, 255], 0.55), 0.45);
    // 台面阴影
    c.ellipse(px + jarW * 0.25, H * 0.64, jarW * 0.9, H * 0.022, ...ink, 0.28);

    // 方向性笔触肌理：数量更少、更透明，避免遮盖主体
    const strokeCount = style === '油画' ? 55 : 80;
    for (let i = 0; i < strokeCount; i++) {
      const col = seededChoice(rand, colors.slice(1));
      const onJar = rand() > 0.6;
      const x = onJar ? px + (rand() - 0.5) * jarW * 1.1 : W * rand();
      const y = onJar ? py + (rand() - 0.5) * jarH * 0.85 : H * rand();
      const len = onJar ? 16 + rand() * 35 : 30 + rand() * 70;
      const angle = onJar ? -Math.PI / 2 + (rand() - 0.5) * 0.4 : (rand() - 0.5) * Math.PI * 0.4;
      const width = onJar ? 2 + rand() * 5 : 4 + rand() * 8;
      const alpha = style === '油画' ? (onJar ? 0.22 : 0.16) : (onJar ? 0.14 : 0.1);
      brushStroke(c, x, y, len, angle, width, col, alpha, rand);
    }
    // 水彩：少量边缘水渍
    if (style === '水彩') {
      for (let i = 0; i < 5; i++) {
        const x = W * rand(); const y = H * rand();
        const col = seededChoice(rand, [accent, stone, jade]);
        c.ellipse(x, y, 16 + rand() * 26, 10 + rand() * 18, ...col, 0.08);
      }
    }
    vignette(c, 20, 18, 15, 0.1);
  } else if (style === '素描') {
    // 几何体场景
    c.rect(0, 0, W, H * 0.65, ...mix(bg, ink, 0.06), 1);
    c.rect(0, H * 0.65, W, H * 0.35, ...mix(bg, ink, 0.12), 1);
    // 球
    const sx = W * 0.28, sy = H * 0.48;
    c.circle(sx, sy, H * 0.16, ...mix(bg, ink, 0.45), 1);
    c.ellipse(sx + H * 0.06, sy + H * 0.13, H * 0.16, H * 0.04, ...ink, 0.3);
    // 立方体
    const cx = W * 0.54, cy = H * 0.55, s = H * 0.2;
    fillPoly(c, [[cx, cy - s], [cx + s * 0.866, cy - s / 2], [cx, cy]], ...mix(bg, ink, 0.22), 1);
    fillPoly(c, [[cx, cy], [cx + s * 0.866, cy - s / 2], [cx + s * 0.866, cy + s / 2], [cx, cy + s]], ...mix(bg, ink, 0.42), 1);
    fillPoly(c, [[cx - s * 0.866, cy - s / 2], [cx, cy - s], [cx, cy + s], [cx - s * 0.866, cy + s / 2]], ...mix(bg, ink, 0.62), 1);
    // 圆柱
    const kx = W * 0.78, ky = H * 0.52, kr = H * 0.13;
    c.rect(kx - kr, ky, kr * 2, H * 0.3, ...mix(bg, ink, 0.35), 1);
    c.ellipse(kx, ky, kr, kr * 0.3, ...mix(bg, ink, 0.15), 1);
    c.ellipse(kx, ky + H * 0.3, kr, kr * 0.3, ...ink, 0.45);
    // 排线阴影
    for (let i = 0; i < 30; i++) {
      const x = W * rand();
      lineSeg(c, x, H * 0.65, x + (rand() - 0.5) * 40, H, ...ink, 0.12, 1);
    }
    paperTexture(c, rand, 0.02);
  } else if (style === '版画') {
    c.rect(0, 0, W, H, ...bg, 1);
    // 木刻式粗线（带纹理）
    for (let i = 0; i < 16; i++) {
      const y = H * (0.12 + i * 0.055);
      const amp = 20 + rand() * 30;
      for (let x = 0; x < W; x += 6) {
        const yy = y + Math.sin((x + seed) / 80) * amp;
        c.circle(x, yy, 3 + rand() * 3, ...ink, 0.8);
      }
    }
    // 主题块
    fillPoly(c, [[W * 0.28, H * 0.28], [W * 0.72, H * 0.23], [W * 0.68, H * 0.72], [W * 0.32, H * 0.77]], ...accent, 0.85);
    // 刻痕细节
    for (let i = 0; i < 20; i++) {
      lineSeg(c, W * rand(), H * rand(), W * rand(), H * rand(), ...bg, 0.6, 2);
    }
    vignette(c, 20, 18, 15, 0.2);
  } else if (style === '壁画') {
    // 仿壁画分层
    c.rect(0, 0, W, H, ...mix(bg, ink, 0.12), 1);
    // 风化斑驳
    for (let i = 0; i < 300; i++) {
      const x = W * rand(), y = H * rand();
      c.circle(x, y, 2 + rand() * 6, ...mix(bg, [255, 255, 255], 0.5), 0.15);
    }
    // 边框
    const bw = W * 0.06, bh = H * 0.08;
    c.rect(bw, bh, W - bw * 2, H - bh * 2, ...mix(bg, ink, 0.2), 1);
    // 中心人物
    c.ellipse(W * 0.5, H * 0.46, W * 0.13, H * 0.26, ...accent, 0.65);
    c.circle(W * 0.5, H * 0.3, H * 0.09, ...gold, 0.75);
    // 躯干衣饰
    fillPoly(c, [[W * 0.42, H * 0.55], [W * 0.58, H * 0.55], [W * 0.55, H * 0.78], [W * 0.45, H * 0.78]], ...stone, 0.7);
    // 装饰纹样
    for (let i = 0; i < 8; i++) {
      c.circle(W * (0.12 + i * 0.11), H * 0.84, H * 0.035, ...gold, 0.6);
    }
    vignette(c, 60, 45, 30, 0.22);
  } else {
    // 通用山水
    for (let i = 0; i < 6; i++) {
      const yBase = H * (0.32 + i * 0.09);
      let pts = [[0, yBase]];
      const peaks = 2 + Math.floor(rand() * 3);
      for (let p = 0; p <= peaks; p++) {
        const x = (W / peaks) * p;
        const peakH = (30 + rand() * 60) * (1 - i * 0.12);
        pts.push([x, yBase - peakH]);
        if (p < peaks) pts.push([x + W / peaks * 0.5, yBase - peakH * 0.3 - rand() * 20]);
      }
      pts.push([W, H], [0, H]);
      fillPoly(c, pts, ...ink, 0.05 + i * 0.035);
    }
    const peakX = W * (0.35 + rand() * 0.3);
    const peakH = H * (0.28 + rand() * 0.15);
    fillPoly(c, [[peakX - W * 0.28, H * 0.74], [peakX, H * 0.74 - peakH], [peakX + W * 0.26, H * 0.74]], ...jade, 0.4);
    const sealR = Math.min(W, H) * 0.032;
    c.circle(W - sealR * 2.8, H - sealR * 2.8, sealR, ...accent, 0.85);
    vignette(c, 20, 18, 15, 0.18);
  }
}

function drawDesign(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, accent, stone, gold] = colors;
  const W = c.w, H = c.h;
  const style = item.style;

  c.rect(0, 0, W, H, ...bg, 1);

  if (style === '极简主义' || style === '瑞士风格') {
    // 网格
    const cols = 4 + Math.floor(rand() * 4);
    const cell = W / cols;
    for (let i = 0; i <= cols; i++) {
      lineSeg(c, i * cell, 0, i * cell, H, ...ink, 0.15, 1);
    }
    // 色块
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rand() * cols) * cell;
      const y = H * rand() * 0.6;
      c.rect(x + 4, y + 4, cell * (1 + Math.floor(rand() * 2)) - 8, H * 0.18, ...seededChoice(rand, [accent, stone, ink]), 0.8);
    }
  } else if (style === '包豪斯') {
    // 几何构成
    c.circle(W * 0.3, H * 0.4, H * 0.18, ...accent, 0.9);
    c.rect(W * 0.55, H * 0.25, W * 0.25, H * 0.45, ...stone, 0.85);
    lineSeg(c, 0, H * 0.78, W, H * 0.78, ...ink, 0.8, 6);
    c.rect(W * 0.15, H * 0.12, W * 0.2, H * 0.08, ...gold, 0.9);
  } else if (style === '装饰艺术') {
    // Art Deco 放射线
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI;
      lineSeg(c, W * 0.5, H * 0.55, W * 0.5 + Math.cos(ang) * W * 0.5, H * 0.55 + Math.sin(ang) * H * 0.5, ...gold, 0.6, 3);
    }
    c.ellipse(W * 0.5, H * 0.55, W * 0.12, H * 0.18, ...accent, 0.85);
  } else if (style === '新艺术运动') {
    // 有机曲线
    for (let i = 0; i < 6; i++) {
      let x = W * 0.1, y = H * (0.2 + i * 0.12);
      let pts = [[x, y]];
      for (let k = 1; k <= 10; k++) {
        x += W * 0.08;
        y += Math.sin(k + seed) * 30;
        pts.push([x, y]);
      }
      for (let k = 0; k < pts.length - 1; k++) {
        lineSeg(c, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ...seededChoice(rand, [accent, stone, ink]), 0.7, 4);
      }
    }
  } else if (style === '后现代' || style === '波普艺术') {
    // 点阵/拼贴
    const cols = 8;
    const cell = W / cols;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 5; j++) {
        if (rand() > 0.4) {
          c.circle(i * cell + cell / 2, j * (H / 5) + H / 10, Math.min(cell, H / 5) * 0.35, ...seededChoice(rand, colors.slice(1)), 0.85);
        }
      }
    }
  } else if (style === '数字艺术') {
    //  glitch 块
    for (let i = 0; i < 40; i++) {
      const y = H * rand();
      const h = 4 + rand() * 30;
      c.rect(W * rand(), y, W * (0.1 + rand() * 0.4), h, ...seededChoice(rand, [accent, stone, gold]), 0.7);
    }
  } else {
    // 通用几何
    for (let i = 0; i < 20; i++) {
      c.rect(W * rand(), H * rand(), W * 0.1, H * 0.1, ...seededChoice(rand, colors.slice(1)), 0.6);
    }
  }
}

function drawProduct(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, accent, stone, jade, gold] = colors;
  const W = c.w, H = c.h;

  // 背景柔光
  c.rect(0, 0, W, H, ...bg, 1);
  c.ellipse(W * 0.5, H * 0.42, W * 0.4, H * 0.3, ...mix(bg, ink, 0.08), 0.6);

  // 阴影
  c.ellipse(W * 0.5, H * 0.78, W * 0.22, H * 0.04, ...ink, 0.25);

  const style = item.style;
  const bx = W * 0.5, by = H * 0.55;

  if (style === '流线型') {
    // 流线型器物
    fillPoly(c, [[bx - W * 0.2, by - H * 0.1], [bx + W * 0.22, by - H * 0.15], [bx + W * 0.18, by + H * 0.18], [bx - W * 0.18, by + H * 0.2]], ...jade, 1);
    c.ellipse(bx - W * 0.08, by - H * 0.05, W * 0.06, H * 0.04, ...gold, 0.4);
  } else {
    // 通用器物：壶/椅/灯抽象
    const shapeType = Math.floor(rand() * 3);
    if (shapeType === 0) {
      // 水壶
      fillPoly(c, [[bx - W * 0.12, by - H * 0.18], [bx + W * 0.12, by - H * 0.18], [bx + W * 0.16, by + H * 0.16], [bx - W * 0.16, by + H * 0.16]], ...jade, 1);
      c.ellipse(bx, by - H * 0.18, W * 0.12, H * 0.04, ...mix(bg, ink, 0.15), 1);
      // 把手
      for (let a = Math.PI * 0.3; a < Math.PI * 1.7; a += 0.05) {
        c.circle(bx - W * 0.18 + Math.cos(a) * W * 0.06, by + Math.sin(a) * H * 0.12, 4, ...ink, 0.8);
      }
    } else if (shapeType === 1) {
      // 椅子
      c.rect(bx - W * 0.14, by - H * 0.1, W * 0.28, H * 0.05, ...accent, 1);
      c.rect(bx - W * 0.14, by - H * 0.1, W * 0.03, H * 0.3, ...ink, 0.8);
      c.rect(bx + W * 0.11, by - H * 0.1, W * 0.03, H * 0.3, ...ink, 0.8);
      c.rect(bx - W * 0.13, by + H * 0.18, W * 0.26, H * 0.04, ...ink, 0.8);
    } else {
      // 灯具
      c.rect(bx - W * 0.04, by - H * 0.25, W * 0.08, H * 0.25, ...ink, 0.8);
      c.ellipse(bx, by + H * 0.05, W * 0.18, H * 0.12, ...jade, 0.9);
      c.ellipse(bx, by + H * 0.02, W * 0.06, H * 0.04, ...gold, 0.6);
    }
  }
}

function drawSculpture(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, accent, , gold] = colors;
  const W = c.w, H = c.h;

  // 暗背景 + 侧光（用 15x15 渐变条带近似，避免逐像素 200 万次 blend）
  c.rect(0, 0, W, H, ...bg, 1);
  const darkBg = mix([40, 35, 30], bg, 0.5);
  const rows = 15;
  const cols = 15;
  for (let ry = 0; ry < rows; ry++) {
    const y0 = Math.round((H * ry) / rows);
    const y1 = Math.round((H * (ry + 1)) / rows);
    const g = Math.max(0, 1 - ((y0 + y1) / 2) / (H * 0.7));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.round((W * cx) / cols);
      const x1 = Math.round((W * (cx + 1)) / cols);
      const h = Math.max(0, 1 - ((x0 + x1) / 2) / (W * 0.7));
      const a = g * 0.08 * h;
      if (a > 0) {
        c.rect(x0, y0, x1 - x0, y1 - y0, ...darkBg, a);
      }
    }
  }

  // 台座
  c.rect(W * 0.28, H * 0.78, W * 0.44, H * 0.06, ...ink, 0.7);

  const style = item.style;
  const hx = W * 0.5, hy = H * 0.42, hw = W * 0.12, hh = H * 0.28;
  const clay = [180, 140, 95];
  const clayL = [220, 185, 140];
  const clayD = [110, 80, 55];

  if (style === '抽象' || style === '装置' || style === '动态雕塑') {
    // 螺旋层叠
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const cx = hx + Math.sin(t * 8 + seed) * W * 0.08 * (1 - t);
      const cy = H * 0.78 - t * H * 0.45;
      const rx = W * 0.08 * (1 - t * 0.5);
      const ry = H * 0.04 * (1 - t * 0.5);
      const col = i % 3 === 0 ? clayL : ink;
      c.ellipse(cx, cy, rx, ry, ...col, 0.5 + rand() * 0.3);
    }
  } else {
    // 头像体量
    for (let i = 10; i >= 0; i--) {
      const off = i * 2;
      c.ellipse(hx + off * 0.3, hy + off * 0.2, hw - off, hh - off,
        clay[0] - i * 5, clay[1] - i * 4, clay[2] - i * 3, 1);
    }
    c.ellipse(hx - hw * 0.4, hy - hh * 0.2, hw * 0.5, hh * 0.7, ...clayL, 0.5);
    c.ellipse(hx + hw * 0.5, hy + hh * 0.1, hw * 0.7, hh * 0.85, ...clayD, 0.55);
  }

  // 肌理颗粒
  for (let i = 0; i < 2000; i++) {
    const ang = rand() * Math.PI * 2;
    const r = rand() * hw * 1.2;
    const px = hx + Math.cos(ang) * r * 0.7;
    const py = hy + Math.sin(ang) * r * 0.9;
    const tone = rand();
    c.blend(px, py,
      clayL[0] * tone + clayD[0] * (1 - tone),
      clayL[1] * tone + clayD[1] * (1 - tone),
      clayL[2] * tone + clayD[2] * (1 - tone),
      rand() * 0.3);
  }
}

function drawCalligraphy(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, accent, gold] = colors;
  const W = c.w, H = c.h;

  c.rect(0, 0, W, H, ...bg, 1);

  // 格线
  for (let i = 1; i <= 4; i++) {
    lineSeg(c, W * 0.1, H * i * 0.2, W * 0.9, H * i * 0.2, ...ink, 0.08, 1);
  }

  const style = item.style;
  const strokes = 5 + Math.floor(rand() * 4);

  for (let i = 0; i < strokes; i++) {
    let x = W * 0.12;
    let y = H * (0.2 + i * 0.15);
    const col = i === 1 ? accent : ink;
    const thick = style === '楷书' ? 8 : style === '草书' ? 3 + rand() * 3 : 4 + rand() * 4;
    const segs = 8;
    for (let k = 0; k < segs; k++) {
      const nx = x + W * 0.08 + (rand() - 0.5) * W * 0.04;
      const ny = y + (rand() - 0.5) * H * 0.08;
      lineSeg(c, x, y, nx, ny, ...col, 0.85, thick);
      x = nx; y = ny;
    }
    // 飞白/顿挫
    for (let k = 0; k < 5; k++) {
      c.circle(x - k * 6, y + (rand() - 0.5) * 10, thick * 0.4, ...col, 0.5);
    }
  }

  // 印章
  c.circle(W * 0.88, H * 0.88, H * 0.05, ...accent, 0.85);
}

function drawArchitecture(c, item, seed, colors) {
  const rand = rng(seed);
  const [bg, ink, stone, gold] = colors;
  const W = c.w, H = c.h;

  c.rect(0, 0, W, H, ...bg, 1);
  // 天空
  c.rect(0, 0, W, H * 0.45, ...mix(bg, stone, 0.15), 0.3);

  const style = item.style;
  const bw = W * (0.2 + rand() * 0.15);
  const bh = H * (0.35 + rand() * 0.2);
  const bx = (W - bw) / 2;
  const by = H - bh;

  if (style === '新中式' || style === '古典主义') {
    // 屋顶
    fillPoly(c, [[bx - bw * 0.1, by], [bx + bw / 2, by - H * 0.15], [bx + bw * 1.1, by]], ...ink, 0.85);
    c.rect(bx, by, bw, bh, ...mix(bg, ink, 0.25), 0.9);
    // 柱子
    for (let i = 1; i <= 3; i++) {
      c.rect(bx + bw * i / 4 - W * 0.01, by, W * 0.02, bh, ...ink, 0.7);
    }
  } else if (style === '哥特式') {
    // 尖拱
    fillPoly(c, [[bx, by + bh], [bx + bw / 2, by - H * 0.25], [bx + bw, by + bh]], ...ink, 0.85);
    // 玫瑰窗意向
    c.circle(bx + bw / 2, by + bh * 0.35, Math.min(bw, bh) * 0.18, ...stone, 0.8);
  } else if (style === '巴洛克') {
    c.ellipse(bx + bw / 2, by + bh * 0.6, bw * 0.55, bh * 0.55, ...mix(bg, ink, 0.2), 0.9);
    c.rect(bx + bw * 0.35, by + bh * 0.3, bw * 0.3, bh * 0.4, ...gold, 0.7);
  } else {
    // 现代/参数化
    c.rect(bx, by, bw, bh, ...ink, 0.8);
    const rows = 3 + Math.floor(rand() * 3);
    const cols = 2 + Math.floor(rand() * 2);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const wx = bx + bw * (k + 0.5) / (cols + 1) - bw * 0.04;
        const wy = by + bh * (r + 0.5) / (rows + 1) - bh * 0.04;
        c.rect(wx, wy, bw * 0.08, bh * 0.08, ...gold, 0.7);
      }
    }
  }
}

const DRAWERS = {
  painting: drawPainting,
  design: drawDesign,
  product: drawProduct,
  sculpture: drawSculpture,
  calligraphy: drawCalligraphy,
  architecture: drawArchitecture,
};

// ============================================================
// 文本叠加（标题 + 艺术家）
// ============================================================
function drawTextOverlay(c, item) {
  // 底部暗条
  c.rect(0, c.h - Math.floor(c.h * 0.12), c.w, Math.floor(c.h * 0.12), 15, 15, 15, 0.5);
  // 用简单几何点阵“画”出标题首字（不依赖字体）
  const title = item.title || '';
  const first = title[0] || '丹';
  // 在右下角印章位置放一个小色块标识
  const r = Math.min(c.w, c.h) * 0.035;
  c.circle(c.w - r * 2, c.h - r * 2, r, 196, 30, 30, 0.85);
}

// ============================================================
// 主流程
// ============================================================
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'public', 'data', 'artworks.json');
const OUT_THUMB = path.join(ROOT, 'public', 'images', 'artworks', 'thumb');
const OUT_FULL = path.join(ROOT, 'public', 'images', 'artworks', 'full');
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const items = data.items || [];
console.log(`读取 ${items.length} / ${data.total || 0} 条素材`);

fs.mkdirSync(OUT_THUMB, { recursive: true });
fs.mkdirSync(OUT_FULL, { recursive: true });

const results = [];
let totalThumbKB = 0;
let totalFullKB = 0;
let totalThumbMs = 0;
let totalFullMs = 0;
let completed = 0;
let skipped = 0;

for (const item of items) {
  const thumbPath = path.join(OUT_THUMB, `${item.id}.png`);
  const fullPath = path.join(OUT_FULL, `${item.id}.png`);

  // 断点续跑：若两层文件均已存在，直接复用尺寸统计并跳过生成
  if (fs.existsSync(thumbPath) && fs.existsSync(fullPath)) {
    const thumbKB = Math.round(fs.statSync(thumbPath).size / 1024);
    const fullKB = Math.round(fs.statSync(fullPath).size / 1024);
    totalThumbKB += thumbKB;
    totalFullKB += fullKB;
    skipped += 1;
    if (skipped % 100 === 0) {
      console.log(`[跳过 ${skipped}] 已存在 ${thumbPath} 与 ${fullPath}`);
    }
    continue;
  }

  const seed = hash(`${item.id}|${item.title}|${item.style}|${item.era}`);
  const colors = paletteFor(item);
  const drawer = DRAWERS[item.category] || DRAWERS.painting;

  // 缩略图 640x360
  const tThumb0 = Date.now();
  const cThumb = new Canvas(640, 360, [...colors[0], 255]);
  drawer(cThumb, item, seed, colors);
  drawTextOverlay(cThumb, item);
  const thumbKB = cThumb.save(thumbPath);
  const thumbMs = Date.now() - tThumb0;
  totalThumbKB += thumbKB;
  totalThumbMs += thumbMs;

  // 全图 1920x1080
  const tFull0 = Date.now();
  const cFull = new Canvas(1920, 1080, [...colors[0], 255]);
  drawer(cFull, item, seed + 1, colors);
  drawTextOverlay(cFull, item);
  const fullKB = cFull.save(fullPath);
  const fullMs = Date.now() - tFull0;
  totalFullKB += fullKB;
  totalFullMs += fullMs;

  results.push({ id: item.id, title: item.title, category: item.category, style: item.style, thumbKB, thumbMs, fullKB, fullMs });
  completed += 1;

  if ((completed + skipped) % 100 === 0) {
    const processed = completed + skipped;
    const batchThumbMs = totalThumbMs / completed;
    const batchFullMs = totalFullMs / completed;
    const remain = items.length - processed;
    const etaSec = completed > 0 ? Math.round(((batchThumbMs + batchFullMs) * remain) / 1000) : 0;
    console.log(`[进度 ${processed}/${items.length}] ${item.category}/${item.style}  ${item.title}  thumb=${thumbKB}KB full=${fullKB}KB  已生成 ${completed}  已跳过 ${skipped}  预计剩余 ${etaSec}s`);
  }
}

const avgThumb = Math.round(totalThumbKB / items.length);
const avgFull = Math.round(totalFullKB / items.length);
const avgThumbMs = Math.round(totalThumbMs / items.length);
const avgFullMs = Math.round(totalFullMs / items.length);
const totalMs = totalThumbMs + totalFullMs;
const totalMB = Math.round((totalThumbKB + totalFullKB) / 1024 * 10) / 10;
const totalMin = Math.round(totalMs / 1000 / 60 * 10) / 10;

console.log('\n===== 全量统计 =====');
console.log(`素材总数: ${items.length} 条`);
console.log(`本次生成: ${completed} 张缩略图 + ${completed} 张全图`);
console.log(`断点跳过: ${skipped} 张缩略图 + ${skipped} 张全图`);
console.log(`缩略图: ${totalThumbKB} KB, 平均 ${avgThumb} KB/张, 平均 ${avgThumbMs} ms/张`);
console.log(`全图: ${totalFullKB} KB, 平均 ${avgFull} KB/张, 平均 ${avgFullMs} ms/张`);
console.log(`全量合计: ${totalMB} MB, 总耗时 ${totalMs} ms (${totalMin} 分钟)`);
console.log(`输出目录: ${path.join(ROOT, 'public', 'images', 'artworks')}`);
