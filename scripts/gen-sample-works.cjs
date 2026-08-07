/**
 * 初赛理念示例作品图生成器(纯 Node,无第三方依赖)
 * 用内置 zlib 手写 PNG 编码,程序化生成 12 幅艺术教学范画
 * 覆盖绘画/设计/产品/雕塑四类,每幅独立原画,视觉各不相同
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG 编码器 ----------
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
  // 每行前置 filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 画布 ----------
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

// 简单可复现伪随机
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// ---------- 独立绘图辅助(不修改 Canvas 类) ----------
/** 线段(沿线圆点,可控制粗细) */
function lineSeg(c, x1, y1, x2, y2, r, g, b, a, thick) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    c.circle(x1 + dx * t, y1 + dy * t, thick, r, g, b, a);
  }
}
/** 多边形填充(扫描线) */
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

const OUT = process.env.OUT_DIR || path.join(process.env.TEMP || '.', 'danqing-works');
fs.mkdirSync(OUT, { recursive: true });
const results = [];

// ========== 1. sketch-geom.png — 绘画:素描几何体(球+方+柱,炭笔灰白调) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [248, 246, 240]);
  const rand = rng(101);
  // 背景墙 + 桌面
  c.rect(0, 0, W, H * 0.66, 238, 236, 228, 1);
  c.rect(0, H * 0.66, W, H * 0.34, 224, 220, 210, 1);
  c.rect(0, H * 0.66 - 1, W, 2, 195, 191, 182, 1);
  // ---- 球体(左) ----
  const sx = W * 0.22, sy = H * 0.50, sr = 105;
  c.ellipse(sx + sr * 0.35, sy + sr * 0.95, sr * 1.05, sr * 0.22, 70, 67, 62, 0.40); // 投影
  c.circle(sx, sy, sr, 168, 165, 160, 1); // 基色
  c.ellipse(sx + sr * 0.32, sy + sr * 0.30, sr * 0.95, sr * 0.95, 92, 90, 86, 0.55); // 暗部
  c.ellipse(sx + sr * 0.12, sy + sr * 0.12, sr * 0.95, sr * 0.95, 122, 119, 114, 0.30); // 明暗交界
  c.ellipse(sx - sr * 0.36, sy - sr * 0.36, sr * 0.36, sr * 0.36, 244, 242, 236, 0.85); // 高光
  // ---- 正方体(中,等轴测) ----
  const cx = W * 0.5, cy = H * 0.56, s = 120;
  const A = [cx, cy - s], B = [cx + s * 0.866, cy - s / 2], C = [cx, cy],
    D = [cx - s * 0.866, cy - s / 2], E = [cx + s * 0.866, cy + s / 2],
    F = [cx, cy + s], G = [cx - s * 0.866, cy + s / 2];
  // 投影
  fillPoly(c, [[D[0], F[1] + 6], [F[0] + s * 0.4, F[1] + 14], [F[0] + s * 0.2, F[1] + 22], [D[0] - s * 0.2, F[1] + 14]], 70, 67, 62, 0.30);
  fillPoly(c, [A, B, C, D], 232, 229, 222, 1); // 顶(亮)
  fillPoly(c, [C, B, E, F], 150, 147, 142, 1); // 右(中)
  fillPoly(c, [D, C, F, G], 96, 94, 90, 1);    // 左(暗)
  // 棱线(炭笔加重)
  lineSeg(c, A[0], A[1], B[0], B[1], 50, 48, 45, 0.6, 1.2);
  lineSeg(c, A[0], A[1], D[0], D[1], 50, 48, 45, 0.6, 1.2);
  lineSeg(c, B[0], B[1], C[0], C[1], 50, 48, 45, 0.6, 1.2);
  lineSeg(c, D[0], D[1], C[0], C[1], 50, 48, 45, 0.6, 1.2);
  lineSeg(c, C[0], C[1], F[0], F[1], 50, 48, 45, 0.6, 1.2);
  // ---- 圆柱(右) ----
  const kx = W * 0.78, ky = H * 0.56, kr = 70, kh = 200;
  c.ellipse(kx + kr * 0.3, ky + kh / 2 + kr * 0.4, kr * 1.1, kr * 0.24, 70, 67, 62, 0.35); // 投影
  c.rect(kx - kr, ky, kr * 2, kh, 168, 165, 160, 1); // 身
  c.ellipse(kx, ky + kh, kr, kr * 0.32, 120, 117, 112, 1); // 底
  c.ellipse(kx, ky, kr, kr * 0.32, 235, 232, 224, 1); // 顶(亮)
  c.ellipse(kx, ky, kr, kr * 0.32, 90, 88, 84, 0.5); // 顶内阴影
  // 明暗渐变(右侧暗)
  for (let i = 0; i < kr; i++) {
    const t = i / kr;
    c.rect(kx + i, ky, 1, kh, 70, 68, 64, t * 0.45);
  }
  // 高光(左侧)
  c.rect(kx - kr * 0.55, ky, kr * 0.18, kh, 240, 238, 232, 0.55);
  // 排线(炭笔质感,轻扫)
  for (let i = 0; i < 220; i++) {
    const lx = rand() * W, ly = H * 0.66 + rand() * 8;
    c.blend(lx, ly, 80, 78, 74, rand() * 0.3);
  }
  results.push(['sketch-geom.png', c.save(path.join(OUT, 'sketch-geom.png'))]);
})();

// ========== 2. sketch-head.png — 绘画:素描头像(头骨结构+明暗交界,竖构图) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [240, 237, 230]);
  const rand = rng(202);
  const cx = W * 0.5, cy = H * 0.42;
  // 头型(蛋形,上宽下窄)
  const headW = 150, headH = 200;
  // 头发暗区(顶)
  c.ellipse(cx, cy - headH * 0.55, headW * 0.85, headH * 0.35, 70, 67, 62, 0.6);
  // 脸部基色
  c.ellipse(cx, cy, headW, headH, 178, 173, 165, 1);
  // 暗面(右下,明暗交界)
  c.ellipse(cx + headW * 0.45, cy + headH * 0.15, headW * 0.85, headH * 0.85, 95, 92, 87, 0.55);
  c.ellipse(cx + headW * 0.25, cy + headH * 0.05, headW * 0.9, headH * 0.9, 120, 117, 112, 0.3);
  // 亮面(左上)
  c.ellipse(cx - headW * 0.4, cy - headH * 0.3, headW * 0.5, headH * 0.5, 232, 228, 220, 0.6);
  // 颈部
  c.rect(cx - 36, cy + headH * 0.85, 72, 90, 150, 146, 140, 1);
  c.rect(cx + 10, cy + headH * 0.85, 26, 90, 90, 87, 83, 0.5); // 颈暗面
  // 胸座
  c.ellipse(cx, cy + headH * 1.5, 180, 70, 200, 196, 188, 1);
  // 结构线(头骨比例:三庭五眼)
  const ink = [55, 52, 48];
  lineSeg(c, cx - headW, cy - headH * 0.35, cx + headW, cy - headH * 0.35, ...ink, 0.5, 1); // 发际线
  lineSeg(c, cx - headW, cy, cx + headW, cy, ...ink, 0.55, 1);             // 眉弓线
  lineSeg(c, cx - headW, cy + headH * 0.4, cx + headW, cy + headH * 0.4, ...ink, 0.5, 1); // 鼻底
  lineSeg(c, cx - headW, cy + headH * 0.8, cx + headW, cy + headH * 0.8, ...ink, 0.45, 1); // 下颌
  lineSeg(c, cx, cy - headH, cx, cy + headH, ...ink, 0.35, 1); // 中轴线
  // 眼睛(两个小椭圆)
  c.ellipse(cx - headW * 0.38, cy, 16, 7, 40, 38, 35, 0.85);
  c.ellipse(cx + headW * 0.38, cy, 16, 7, 40, 38, 35, 0.85);
  // 鼻梁
  lineSeg(c, cx, cy + 5, cx - 8, cy + headH * 0.3, ...ink, 0.6, 1.2);
  lineSeg(c, cx - 8, cy + headH * 0.3, cx, cy + headH * 0.4, ...ink, 0.6, 1.2);
  // 嘴
  c.ellipse(cx, cy + headH * 0.6, 28, 6, 80, 55, 50, 0.5);
  // 骨点标记(额结节/颧骨/下颌角)
  [[-0.5, -0.6], [0.5, -0.6], [-0.6, 0.1], [0.6, 0.1], [-0.5, 0.8], [0.5, 0.8]].forEach(([dx, dy]) => {
    c.circle(cx + headW * dx, cy + headH * dy, 3, 180, 60, 50, 0.7);
  });
  // 排线阴影(右下颌到颈)
  for (let i = 0; i < 600; i++) {
    const ang = rand() * Math.PI * 0.5;
    const r = rand() * headW * 0.9;
    const px = cx + Math.cos(ang) * r * 0.6 + headW * 0.2;
    const py = cy + Math.sin(ang) * r + headH * 0.2;
    c.blend(px, py, 70, 67, 62, rand() * 0.35);
  }
  results.push(['sketch-head.png', c.save(path.join(OUT, 'sketch-head.png'))]);
})();

// ========== 3. color-still.png — 绘画:色彩静物(陶罐+苹果+衬布,暖色水粉) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [228, 206, 178]);
  const rand = rng(303);
  // 衬布(暖米黄,带波浪褶皱)
  c.rect(0, H * 0.6, W, H * 0.4, 218, 190, 152, 1);
  for (let x = 0; x < W; x += 4) {
    const y = H * 0.6 + Math.sin(x / 80) * 18 + Math.sin(x / 31) * 7;
    c.rect(x, y, 4, H - y, 200, 168, 128, 0.5);
  }
  // 背景墙渐变
  for (let y = 0; y < H * 0.6; y++) {
    const t = y / (H * 0.6);
    c.rect(0, y, W, 1, 232 - t * 10, 214 - t * 14, 188 - t * 18, 1);
  }
  // ---- 陶罐(中) ----
  const px = W * 0.5, py = H * 0.62;
  // 罐身
  c.ellipse(px, py, 110, 130, 150, 78, 48, 1);
  c.ellipse(px - 28, py - 30, 38, 60, 200, 120, 80, 0.5); // 高光
  c.ellipse(px + 35, py + 20, 50, 90, 90, 45, 28, 0.5);   // 暗部
  // 罐颈
  c.rect(px - 32, py - 160, 64, 50, 130, 68, 42, 1);
  c.ellipse(px, py - 160, 32, 14, 170, 92, 58, 1); // 颈口
  c.ellipse(px, py - 168, 32, 12, 70, 35, 22, 1);  // 口内
  // 罐耳(两侧)
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    c.circle(px - 90 + Math.cos(a) * 16, py - 70 + Math.sin(a) * 26, 5, 110, 58, 36, 0.9);
    c.circle(px + 90 + Math.cos(a) * 16, py - 70 + Math.sin(a) * 26, 5, 110, 58, 36, 0.9);
  }
  // 投影
  c.ellipse(px + 50, py + 125, 130, 22, 70, 40, 25, 0.4);
  // ---- 苹果(左前) ----
  const ax = W * 0.24, ay = H * 0.78;
  c.ellipse(ax + 20, ay + 38, 55, 12, 70, 40, 25, 0.4); // 投影
  c.circle(ax, ay, 42, 200, 60, 55, 1);
  c.ellipse(ax + 10, ay + 10, 38, 38, 150, 40, 40, 0.5); // 暗红
  c.ellipse(ax - 14, ay - 14, 16, 16, 240, 200, 120, 0.7); // 黄绿高光
  // 苹果柄
  lineSeg(c, ax, ay - 42, ax + 4, ay - 60, 70, 45, 30, 1, 2);
  // 叶
  c.ellipse(ax + 14, ay - 56, 14, 6, 80, 120, 50, 0.9);
  // ---- 梨(右前) ----
  const bx = W * 0.8, by = H * 0.82;
  c.ellipse(bx + 15, by + 32, 45, 10, 70, 40, 25, 0.4);
  c.ellipse(bx, by, 32, 48, 210, 190, 80, 1);
  c.ellipse(bx - 8, by - 10, 12, 12, 240, 220, 140, 0.7);
  lineSeg(c, bx, by - 48, bx + 2, by - 62, 80, 60, 30, 1, 2);
  // 笔触感(散点)
  for (let i = 0; i < 400; i++) {
    c.blend(rand() * W, H * 0.6 + rand() * H * 0.4, 180, 140, 90, rand() * 0.25);
  }
  results.push(['color-still.png', c.save(path.join(OUT, 'color-still.png'))]);
})();

// ========== 4. color-warm.png — 绘画:色彩冷暖(冷蓝 vs 暖橙对比) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [240, 238, 234]);
  const rand = rng(404);
  // 左半:冷蓝调,右半:暖橙调,中间渐变过渡
  for (let x = 0; x < W; x++) {
    const t = x / W; // 0 左 → 1 右
    const cold = [60, 110, 170], warm = [220, 110, 50];
    // 上下分两块,模拟静物台面与背景
    for (let y = 0; y < H; y++) {
      const vy = y / H;
      let r, g, b;
      if (t < 0.5) {
        const k = t * 2;
        r = cold[0] * (1 - k) + 130 * k;
        g = cold[1] * (1 - k) + 150 * k;
        b = cold[2] * (1 - k) + 180 * k;
      } else {
        const k = (t - 0.5) * 2;
        r = 130 * (1 - k) + warm[0] * k;
        g = 150 * (1 - k) + warm[1] * k;
        b = 180 * (1 - k) + warm[2] * k;
      }
      // 上半稍亮(背景),下半稍暗(台面)
      const dim = vy < 0.55 ? 1 : 0.82;
      c.blend(x, y, r * dim, g * dim, b * dim, 1);
    }
  }
  // 中线(分隔标识)
  c.rect(W * 0.5 - 1, 0, 2, H, 250, 248, 244, 0.6);
  // 左侧冷色球(青蓝)
  const lx = W * 0.25, ly = H * 0.6;
  c.ellipse(lx + 20, ly + 55, 55, 12, 30, 60, 100, 0.5);
  c.circle(lx, ly, 48, 80, 150, 200, 1);
  c.ellipse(lx + 14, ly + 10, 40, 40, 30, 80, 130, 0.6);
  c.ellipse(lx - 16, ly - 16, 16, 16, 220, 240, 250, 0.8);
  // 右侧暖色球(朱橙)
  const rx = W * 0.75, ry = H * 0.6;
  c.ellipse(rx + 20, ry + 55, 55, 12, 110, 50, 25, 0.5);
  c.circle(rx, ry, 48, 230, 110, 50, 1);
  c.ellipse(rx + 14, ry + 10, 40, 40, 170, 70, 30, 0.6);
  c.ellipse(rx - 16, ry - 16, 16, 16, 250, 220, 150, 0.8);
  // 标签色块(左上冷蓝小方块,右上暖橙小方块)
  c.rect(W * 0.08, H * 0.12, 80, 50, 50, 100, 160, 1);
  c.rect(W * 0.84, H * 0.12, 80, 50, 220, 100, 40, 1);
  // 标签文字意向(短横线)
  for (let i = 0; i < 6; i++) c.rect(W * 0.08 + 4, H * 0.12 + 56 + i * 4, 50 - i * 6, 2, 40, 80, 130, 0.8);
  for (let i = 0; i < 6; i++) c.rect(W * 0.84 + 4, H * 0.12 + 56 + i * 4, 50 - i * 6, 2, 160, 70, 30, 0.8);
  results.push(['color-warm.png', c.save(path.join(OUT, 'color-warm.png'))]);
})();

// ========== 5. perspective-street.png — 绘画:一点透视街道(汇聚中心灭点) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [222, 226, 232]);
  const rand = rng(505);
  const vx = W * 0.5, vy = H * 0.42; // 灭点
  // 天空(上)
  for (let y = 0; y < H * 0.55; y++) {
    const t = y / (H * 0.55);
    c.rect(0, y, W, 1, 210 + t * 20, 220 + t * 10, 230, 1);
  }
  // 地面(下)
  c.rect(0, H * 0.55, W, H * 0.45, 200, 196, 190, 1);
  // 灭点标记
  c.circle(vx, vy, 4, 200, 60, 50, 0.8);
  // 街道边线(从四角汇聚到灭点附近)
  const ink = [60, 58, 56];
  lineSeg(c, 0, H, vx - 80, vy + 30, ...ink, 0.8, 1.5);   // 左路边
  lineSeg(c, W, H, vx + 80, vy + 30, ...ink, 0.8, 1.5);   // 右路边
  lineSeg(c, 0, H * 0.55, vx - 60, vy + 20, ...ink, 0.5, 1); // 左地平
  lineSeg(c, W, H * 0.55, vx + 60, vy + 20, ...ink, 0.5, 1); // 右地平
  // 建筑轮廓(左侧,从远到近,矩形递增)
  for (let i = 0; i < 6; i++) {
    const t = i / 5; // 0 远 → 1 近
    const near = 1 - t;
    const xTop = vx - 60 - t * 0; // 顶部接近灭点
    // 左侧建筑外缘
    const xIn = vx - 70 - near * 40;
    const xOut = vx - 70 - near * 200 - t * 30;
    const yTop = vy + 24 - near * 0;
    const yBot = H * 0.55 + near * (H * 0.45);
    const bH = 60 + near * 180;
    fillPoly(c, [[xOut, yBot - bH], [xIn, yTop - bH * 0.3], [xIn, yTop + 20], [xOut, yBot]], 180 - i * 8, 178 - i * 8, 172 - i * 8, 1);
    // 窗户
    for (let w = 0; w < 3; w++) {
      c.rect(xOut + 14 + w * 22, yBot - bH + 16, 12, 16, 90, 110, 130, 0.8);
    }
  }
  // 右侧建筑(镜像)
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const near = 1 - t;
    const xIn = vx + 70 + near * 40;
    const xOut = vx + 70 + near * 200 + t * 30;
    const yTop = vy + 24;
    const yBot = H * 0.55 + near * (H * 0.45);
    const bH = 60 + near * 180;
    fillPoly(c, [[xOut, yBot - bH], [xIn, yTop - bH * 0.3], [xIn, yTop + 20], [xOut, yBot]], 190 - i * 8, 184 - i * 8, 174 - i * 8, 1);
    for (let w = 0; w < 3; w++) {
      c.rect(xOut - 26 - w * 22, yBot - bH + 16, 12, 16, 90, 110, 130, 0.8);
    }
  }
  // 路面横线(透视收缩)
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const y = vy + 30 + Math.pow(t, 1.6) * (H - vy - 30);
    lineSeg(c, vx - 80 - t * (vx - 80), y, vx + 80 + t * (W - vx - 80), y, 90, 88, 84, 0.5, 1);
  }
  // 远山轮廓
  for (let x = 0; x < W; x++) {
    const peak = Math.sin(x / 120) * 18 + Math.sin(x / 50) * 8;
    c.rect(x, vy - 30 - Math.abs(peak), 1, 30 + Math.abs(peak), 170, 175, 182, 0.5);
  }
  results.push(['perspective-street.png', c.save(path.join(OUT, 'perspective-street.png'))]);
})();

// ========== 6. sketch-figure.png — 绘画:人物速写动态线(竖构图) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [245, 240, 230]);
  const rand = rng(606);
  const cx = W * 0.5;
  const ink = [50, 45, 40];
  // 动态中轴线(S 形)
  const spine = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = H * 0.18 + t * H * 0.55;
    const x = cx + Math.sin(t * Math.PI * 1.2) * 36;
    spine.push([x, y]);
  }
  // 画动态轴(虚线感)
  for (let i = 0; i < spine.length - 1; i++) {
    lineSeg(c, spine[i][0], spine[i][1], spine[i + 1][0], spine[i + 1][1], 150, 60, 50, 0.4, 1);
  }
  // 头部
  const hx = spine[0][0], hy = spine[0][1] - 30;
  c.circle(hx, hy, 34, 80, 70, 60, 0.35); // 头影
  c.ellipse(hx, hy, 28, 36, 70, 60, 52, 1);
  // 发
  c.ellipse(hx, hy - 18, 26, 16, 40, 35, 30, 0.8);
  // 颈
  lineSeg(c, hx, hy + 34, spine[0][0], spine[0][1], ...ink, 0.9, 3);
  // 肩(斜肩,动态)
  const shL = [cx - 90, H * 0.24], shR = [cx + 70, H * 0.27];
  lineSeg(c, shL[0], shL[1], shR[0], shR[1], ...ink, 0.9, 4);
  // 躯干(胸廓到腰)
  const waist = spine[10];
  fillPoly(c, [shL, shR, [waist[0] + 40, waist[1]], [waist[0] - 40, waist[1]]], 90, 80, 70, 0.5);
  // 衣纹(躯干)
  for (let i = 0; i < 8; i++) {
    const y = H * 0.26 + i * 22;
    lineSeg(c, cx - 60 + Math.sin(i) * 10, y, cx + 50 + Math.cos(i) * 10, y + 6, ...ink, 0.5, 1.5);
  }
  // 手臂(左臂下垂,右臂抬起——动态)
  const elL = [cx - 130, H * 0.42], wrL = [cx - 150, H * 0.58];
  const elR = [cx + 120, H * 0.35], wrR = [cx + 180, H * 0.22];
  lineSeg(c, shL[0], shL[1], elL[0], elL[1], ...ink, 0.9, 5);
  lineSeg(c, elL[0], elL[1], wrL[0], wrL[1], ...ink, 0.9, 4);
  lineSeg(c, shR[0], shR[1], elR[0], elR[1], ...ink, 0.9, 5);
  lineSeg(c, elR[0], elR[1], wrR[0], wrR[1], ...ink, 0.9, 4);
  // 衣纹(肘关节)
  c.circle(elL[0], elL[1], 8, 60, 50, 42, 0.5);
  c.circle(elR[0], elR[1], 8, 60, 50, 42, 0.5);
  // 腿(一前一后,步态)
  const hip = spine[spine.length - 1];
  const knL = [cx - 40, H * 0.82], anL = [cx - 50, H * 0.97];
  const knR = [cx + 50, H * 0.80], anR = [cx + 80, H * 0.95];
  lineSeg(c, hip[0], hip[1], knL[0], knL[1], ...ink, 0.9, 6);
  lineSeg(c, knL[0], knL[1], anL[0], anL[1], ...ink, 0.9, 5);
  lineSeg(c, hip[0], hip[1], knR[0], knR[1], ...ink, 0.9, 6);
  lineSeg(c, knR[0], knR[1], anR[0], anR[1], ...ink, 0.9, 5);
  // 膝盖
  c.circle(knL[0], knL[1], 9, 60, 50, 42, 0.5);
  c.circle(knR[0], knR[1], 9, 60, 50, 42, 0.5);
  // 衣纹(裤腿)
  for (let i = 0; i < 6; i++) {
    const y = H * 0.78 + i * 16;
    lineSeg(c, cx - 50, y, cx - 30, y + 8, ...ink, 0.4, 1.5);
    lineSeg(c, cx + 40, y, cx + 60, y + 8, ...ink, 0.4, 1.5);
  }
  // 关节点标记(红,动态比例)
  [[hx, hy], shL, shR, elL, elR, wrL, wrR, hip, knL, knR, anL, anR].forEach(([x, y]) => {
    c.circle(x, y, 3, 200, 60, 50, 0.85);
  });
  // 比例刻度(左侧 7 头身)
  for (let i = 0; i <= 7; i++) {
    const y = hy + i * 70;
    lineSeg(c, 40, y, 70, y, 150, 60, 50, 0.5, 1);
  }
  results.push(['sketch-figure.png', c.save(path.join(OUT, 'sketch-figure.png'))]);
})();

// ========== 7. design-grid.png — 设计:版式网格(模块化+留白,极简) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [250, 250, 248]);
  const rand = rng(707);
  const margin = 64;
  const cols = 6, gap = 12;
  const gridW = W - margin * 2;
  const colW = (gridW - gap * (cols - 1)) / cols;
  // 网格基线(浅灰)
  for (let i = 0; i <= cols; i++) {
    const x = margin + i * (colW + gap) - gap / 2;
    c.rect(x, margin, 1, H - margin * 2, 220, 220, 218, 0.8);
  }
  // 顶部页眉线
  c.rect(margin, margin, gridW, 1, 40, 40, 40, 1);
  c.rect(margin, margin + 40, gridW, 1, 180, 180, 178, 1);
  // 页眉小字(横线模拟)
  for (let i = 0; i < 10; i++) c.rect(margin + i * 14, margin + 14, 10, 2, 40, 40, 40, 0.9);
  // 主标题块(占 4 列,大)
  c.rect(margin, margin + 70, colW * 4 + gap * 3, 120, 30, 30, 30, 1);
  // 副标题(2 列,留白)
  for (let i = 0; i < 8; i++) c.rect(margin + colW * 4 + gap * 4, margin + 70 + i * 8, colW * 2, 2, 120, 120, 120, 0.8);
  // 正文区(左 4 列文字行)
  let ty = margin + 220;
  for (let row = 0; row < 14; row++) {
    const lineW = (rand() * 0.4 + 0.55) * (colW * 4 + gap * 3);
    c.rect(margin, ty, lineW, 3, 60, 60, 60, 0.85);
    ty += 10;
  }
  // 右侧栏(2 列)浅灰块
  c.rect(margin + colW * 4 + gap * 4, margin + 220, colW * 2 + gap, 220, 232, 232, 230, 1);
  // 强调色块(1 列,朱砂)
  c.rect(margin + colW * 4 + gap * 4, margin + 460, colW * 2 + gap, 60, 178, 47, 36, 1);
  // 中部分隔
  c.rect(margin, margin + 520, gridW, 1, 200, 200, 200, 1);
  // 三栏图块
  for (let i = 0; i < 3; i++) {
    const bx = margin + i * (colW * 2 + gap * 2);
    c.rect(bx, margin + 540, colW * 2 + gap, 180, 215, 215, 213, 1);
    // 图块中的小图形
    c.circle(bx + (colW * 2 + gap) / 2, margin + 630, 40, 90, 90, 90, 0.5);
  }
  // 底部页码区
  c.rect(margin, H - margin - 40, gridW, 1, 40, 40, 40, 1);
  for (let i = 0; i < 6; i++) c.rect(margin + i * 18, H - margin - 24, 12, 2, 40, 40, 40, 0.9);
  // 右下页码强调
  c.rect(W - margin - 30, H - margin - 26, 26, 14, 30, 30, 30, 1);
  results.push(['design-grid.png', c.save(path.join(OUT, 'design-grid.png'))]);
})();

// ========== 8. poster-diag.png — 设计:海报对角线构图(对角色块+大字意向) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [246, 242, 236]);
  const rand = rng(808);
  // 对角分割(左下三角朱砂,右上三角墨色)
  fillPoly(c, [[0, H], [0, H * 0.35], [W, H * 0.92]], 178, 47, 36, 0.95); // 朱砂
  fillPoly(c, [[0, 0], [W, 0], [W, H * 0.4]], 38, 36, 34, 0.92);          // 墨色
  fillPoly(c, [[0, H * 0.35], [0, 0], [W, 0], [W, H * 0.4]], 0, 0, 0, 0); // (noop 占位)
  // 对角线粗带(强调)
  lineSeg(c, 0, H * 0.35, W, H * 0.4, 246, 242, 236, 1, 6);
  // 大字标题意向(右上墨底反白竖排粗块)
  for (let s = 0; s < 4; s++) {
    const bx = W * (0.66 - s * 0.02), by = H * 0.10 + s * 70;
    // 反白"字"块(粗矩形)
    c.rect(bx, by, 50 - s * 2, 46, 246, 242, 236, 0.95);
    // 字内墨点
    c.rect(bx + 10, by + 10, 30 - s * 2, 6, 38, 36, 34, 0.9);
    c.rect(bx + 10, by + 26, 20, 6, 38, 36, 34, 0.9);
  }
  // 朱砂区大字(左下,墨色横粗块)
  for (let s = 0; s < 3; s++) {
    const bx = W * 0.08, by = H * 0.62 + s * 60;
    c.rect(bx, by, 120 + s * 20, 30, 38, 36, 34, 0.95);
  }
  // 落款印(右下角朱砂小方)
  c.rect(W * 0.82, H * 0.86, 48, 48, 178, 47, 36, 1);
  c.rect(W * 0.82 + 8, H * 0.86 + 8, 32, 32, 246, 242, 236, 0.9);
  // 散点做旧(朱砂区)
  for (let i = 0; i < 800; i++) {
    const x = rand() * W, y = H * 0.4 + rand() * H * 0.6;
    if (rand() < 0.5) c.blend(x, y, 246, 242, 236, rand() * 0.2);
  }
  // 细对角辅助线
  lineSeg(c, 0, 0, W, H, 246, 242, 236, 0.3, 1);
  results.push(['poster-diag.png', c.save(path.join(OUT, 'poster-diag.png'))]);
})();

// ========== 9. product-render.png — 产品:手绘效果图(马克笔水壶,质感) ==========
(function () {
  const W = 900, H = 900, c = new Canvas(W, H, [244, 242, 238]);
  const rand = rng(909);
  // 背景柔光
  c.ellipse(W * 0.5, H * 0.4, W * 0.45, H * 0.32, 250, 248, 244, 0.8);
  // 地平阴影
  c.ellipse(W * 0.5, H * 0.82, 220, 28, 90, 88, 84, 0.4);
  // ---- 水壶主体 ----
  const bx = W * 0.5, by = H * 0.55;
  // 壶身(梯形+圆角)
  fillPoly(c, [[bx - 110, by - 140], [bx + 110, by - 140], [bx + 140, by + 120], [bx - 140, by + 120]], 220, 220, 222, 1);
  // 壶身圆角(顶)
  c.ellipse(bx, by - 140, 110, 24, 230, 230, 232, 1);
  c.ellipse(bx, by + 120, 140, 28, 200, 200, 202, 1);
  // 马克笔明暗(右侧暗)
  fillPoly(c, [[bx + 40, by - 140], [bx + 110, by - 140], [bx + 140, by + 120], [bx + 70, by + 120]], 160, 160, 165, 0.6);
  // 高光(左侧)
  c.rect(bx - 95, by - 120, 22, 220, 250, 250, 252, 0.7);
  // 反光(底部)
  c.ellipse(bx, by + 110, 120, 14, 180, 180, 185, 0.6);
  // 壶盖
  c.rect(bx - 50, by - 180, 100, 44, 90, 90, 95, 1);
  c.ellipse(bx, by - 180, 50, 14, 70, 70, 75, 1);
  c.rect(bx - 14, by - 200, 28, 24, 70, 70, 75, 1); // 盖钮
  // 壶嘴(右侧)
  fillPoly(c, [[bx + 100, by - 110], [bx + 170, by - 130], [bx + 170, by - 100], [bx + 100, by - 80]], 200, 200, 202, 1);
  c.ellipse(bx + 170, by - 115, 8, 18, 80, 80, 85, 1);
  // 壶把(左侧,C 形)
  for (let a = Math.PI * 0.3; a < Math.PI * 1.7; a += 0.04) {
    c.circle(bx - 150 + Math.cos(a) * 50, by - 30 + Math.sin(a) * 120, 8, 90, 90, 95, 0.95);
  }
  // 把手内阴影
  for (let a = Math.PI * 0.3; a < Math.PI * 1.7; a += 0.04) {
    c.circle(bx - 150 + Math.cos(a) * 50, by - 30 + Math.sin(a) * 120 + 4, 4, 50, 50, 55, 0.5);
  }
  // 马克笔排线(壶身阴影方向线)
  for (let i = 0; i < 40; i++) {
    const y = by - 100 + i * 5;
    if (y > by + 100) break;
    lineSeg(c, bx + 50, y, bx + 110, y + 2, 120, 120, 125, 0.3, 1.5);
  }
  // 标签贴纸(壶身中段)
  c.rect(bx - 60, by - 20, 120, 40, 250, 248, 244, 1);
  for (let i = 0; i < 6; i++) c.rect(bx - 50, by - 12 + i * 6, 80 - i * 8, 2, 80, 80, 85, 0.8);
  // 构图辅助线(地平线轻描)
  lineSeg(c, W * 0.2, H * 0.82, W * 0.8, H * 0.82, 150, 148, 145, 0.4, 1);
  // 角落标题意向(马克笔字)
  c.rect(W * 0.08, H * 0.1, 60, 8, 60, 60, 65, 0.9);
  c.rect(W * 0.08, H * 0.1 + 14, 40, 8, 60, 60, 65, 0.9);
  results.push(['product-render.png', c.save(path.join(OUT, 'product-render.png'))]);
})();

// ========== 10. sculpt-head.png — 雕塑:泥塑头像(体量+台座,侧光) ==========
(function () {
  const W = 900, H = 900, c = new Canvas(W, H, [44, 40, 38]);
  const rand = rng(1010);
  // 顶部侧光(从左上)
  for (let y = 0; y < H; y++) {
    const g = Math.max(0, 1 - y / (H * 0.65));
    for (let x = 0; x < W; x++) {
      c.blend(x, y, 140, 120, 90, g * 0.18 * Math.max(0, 1 - x / (W * 0.7)));
    }
  }
  // 台座
  c.rect(W * 0.28, H * 0.80, W * 0.44, H * 0.06, 80, 74, 66, 1);
  c.rect(W * 0.24, H * 0.86, W * 0.52, H * 0.05, 60, 56, 50, 1);
  // ---- 泥塑头像(侧光,左亮右暗) ----
  const hx = W * 0.5, hy = H * 0.42, hw = 150, hh = 200;
  const clay = [180, 140, 95], clayD = [110, 80, 55], clayL = [220, 185, 140];
  // 颈胸
  c.rect(hx - 40, hy + hh * 0.8, 80, 100, ...clayD, 1);
  c.ellipse(hx, hy + hh * 1.5, 170, 60, 150, 115, 75, 1);
  // 头部体量(多层椭圆叠加,泥塑粗粝感)
  for (let i = 8; i >= 0; i--) {
    const off = i * 3;
    c.ellipse(hx + off * 0.3, hy + off * 0.2, hw - off, hh - off, 
      clay[0] - i * 6, clay[1] - i * 5, clay[2] - i * 4, 1);
  }
  // 亮面(左侧,侧光)
  c.ellipse(hx - hw * 0.4, hy - hh * 0.2, hw * 0.55, hh * 0.7, ...clayL, 0.55);
  c.ellipse(hx - hw * 0.3, hy - hh * 0.3, hw * 0.3, hh * 0.3, 240, 215, 175, 0.5);
  // 暗面(右侧)
  c.ellipse(hx + hw * 0.5, hy + hh * 0.1, hw * 0.7, hh * 0.85, ...clayD, 0.6);
  // 明暗交界线
  c.ellipse(hx + hw * 0.05, hy, hw * 0.95, hh * 0.95, 70, 50, 35, 0.25);
  // 五官凹陷(眼窝)
  c.ellipse(hx - hw * 0.25, hy - hh * 0.05, 22, 14, 60, 42, 28, 0.7);
  c.ellipse(hx + hw * 0.2, hy - hh * 0.05, 22, 14, 50, 35, 24, 0.8);
  // 鼻梁(隆起,亮)
  c.ellipse(hx, hy + hh * 0.05, 14, 40, ...clayL, 0.6);
  // 嘴
  c.ellipse(hx, hy + hh * 0.4, 30, 8, 80, 55, 38, 0.6);
  // 头发体块
  c.ellipse(hx, hy - hh * 0.55, hw * 0.9, hh * 0.4, 130, 95, 65, 0.9);
  c.ellipse(hx - hw * 0.3, hy - hh * 0.6, hw * 0.45, hh * 0.25, ...clayL, 0.4);
  // 泥塑肌理(粗粝颗粒)
  for (let i = 0; i < 3000; i++) {
    const ang = rand() * Math.PI * 2;
    const r = rand() * hw * 1.1;
    const px = hx + Math.cos(ang) * r * 0.7;
    const py = hy + Math.sin(ang) * r * 0.9;
    const tone = rand();
    c.blend(px, py, 
      clayL[0] * tone + clayD[0] * (1 - tone),
      clayL[1] * tone + clayD[1] * (1 - tone),
      clayL[2] * tone + clayD[2] * (1 - tone),
      rand() * 0.35);
  }
  // 颈部投影到台座
  c.ellipse(hx, H * 0.80, 100, 12, 20, 18, 14, 0.7);
  results.push(['sculpt-head.png', c.save(path.join(OUT, 'sculpt-head.png'))]);
})();

// ========== 11. creative-draft.png — 设计:创意速写草稿(自由线条+抽象,偏暗) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [38, 36, 42]);
  const rand = rng(1111);
  // 暗背景肌理(颗粒)
  for (let i = 0; i < 6000; i++) {
    c.blend(rand() * W, rand() * H, 60 + rand() * 30, 56 + rand() * 30, 66 + rand() * 30, rand() * 0.4);
  }
  // 抽象大形(粉紫荧光,草稿意向)
  const neon = [200, 120, 220], cyan = [90, 200, 220], amber = [230, 170, 80];
  // 大椭圆轮廓(头部意向)
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    c.ellipse(W * (0.42 + t * 0.06), H * (0.4 + t * 0.04), 180 - i * 20, 240 - i * 20, ...neon, 0.18);
  }
  // 自由曲线(思维流动)
  for (let s = 0; s < 14; s++) {
    let x = rand() * W, y = rand() * H;
    for (let t = 0; t < 80; t++) {
      x += (rand() - 0.5) * 24;
      y += (rand() - 0.5) * 24 + 1.5;
      const col = s % 3 === 0 ? neon : s % 3 === 1 ? cyan : amber;
      c.circle(x, y, 1.5, col[0], col[1], col[2], 0.6);
    }
  }
  // 几何抽象(三角/圆/方,草稿感)
  fillPoly(c, [[W * 0.12, H * 0.7], [W * 0.28, H * 0.62], [W * 0.24, H * 0.82]], ...cyan, 0.35);
  c.circle(W * 0.72, H * 0.78, 60, ...amber, 0.4);
  c.rect(W * 0.55, H * 0.18, 90, 90, ...neon, 0.3);
  // 速写线条(人形意向,白)
  const white = [240, 236, 230];
  lineSeg(c, W * 0.42, H * 0.2, W * 0.5, H * 0.5, ...white, 0.6, 1.5); // 脊柱
  lineSeg(c, W * 0.35, H * 0.3, W * 0.55, H * 0.32, ...white, 0.5, 1.5); // 肩
  lineSeg(c, W * 0.5, H * 0.5, W * 0.4, H * 0.75, ...white, 0.5, 1.5); // 腿
  lineSeg(c, W * 0.5, H * 0.5, W * 0.62, H * 0.74, ...white, 0.5, 1.5);
  c.circle(W * 0.42, H * 0.18, 18, ...white, 0.5);
  // 草稿标注(箭头+短线)
  for (let i = 0; i < 10; i++) {
    const x = rand() * W, y = rand() * H;
    lineSeg(c, x, y, x + 30, y + 14, ...amber, 0.7, 1);
    // 箭头
    lineSeg(c, x + 30, y + 14, x + 22, y + 8, ...amber, 0.7, 1);
    lineSeg(c, x + 30, y + 14, x + 24, y + 20, ...amber, 0.7, 1);
  }
  // 文字涂鸦(横线模拟)
  for (let s = 0; s < 5; s++) {
    const y = H * 0.88 + s * 12;
    for (let i = 0; i < 20; i++) c.rect(W * 0.1 + i * 22, y, 14 + rand() * 8, 3, ...white, 0.5);
  }
  // 边角暗角
  for (let i = 0; i < 4; i++) {
    c.circle(i % 2 === 0 ? 0 : W, i < 2 ? 0 : H, 220, 0, 0, 0, 0.18);
  }
  results.push(['creative-draft.png', c.save(path.join(OUT, 'creative-draft.png'))]);
})();

// ========== 12. oil-still.png — 绘画:油画静物(厚涂笔触,浓郁色彩) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [60, 45, 38]);
  const rand = rng(1212);
  // 暗背景(暖棕,厚涂)
  for (let i = 0; i < 8000; i++) {
    const x = rand() * W, y = rand() * H;
    const tone = rand();
    c.blend(x, y, 70 + tone * 30, 50 + tone * 25, 40 + tone * 20, rand() * 0.5);
  }
  // 桌面(暖褐,笔触)
  for (let x = 0; x < W; x += 8) {
    for (let y = H * 0.6; y < H; y += 8) {
      c.rect(x, y, 8, 8, 95 + rand() * 20, 65 + rand() * 18, 45 + rand() * 12, 0.8);
    }
  }
  // ---- 主体:陶壶(中,借鉴茶具器型但改色) ----
  const px = W * 0.5, py = H * 0.55;
  // 厚涂壶身(多层椭圆笔触)
  const oilA = [180, 70, 45], oilAd = [110, 35, 25], oilAl = [230, 130, 80];
  for (let i = 0; i < 120; i++) {
    const ang = rand() * Math.PI * 2;
    const r = rand() * 100;
    const x = px + Math.cos(ang) * r * 0.9;
    const y = py + Math.sin(ang) * r * 1.1;
    const tone = rand();
    c.ellipse(x, y, 24 + rand() * 10, 18 + rand() * 8,
      oilA[0] * tone + oilAd[0] * (1 - tone),
      oilA[1] * tone + oilAd[1] * (1 - tone),
      oilA[2] * tone + oilAd[2] * (1 - tone), 0.7);
  }
  // 壶身高光(厚涂亮笔)
  for (let i = 0; i < 40; i++) {
    c.ellipse(px - 30 + rand() * 20, py - 40 + rand() * 40, 12, 8, ...oilAl, 0.6);
  }
  // 壶颈
  for (let i = 0; i < 30; i++) {
    c.ellipse(px - 20 + rand() * 40, py - 130 + rand() * 30, 18, 12, 130 + rand() * 30, 50 + rand() * 20, 35 + rand() * 15, 0.8);
  }
  c.ellipse(px, py - 140, 32, 14, 60, 30, 20, 1);
  // 壶嘴
  for (let i = 0; i < 20; i++) {
    c.ellipse(px + 90 + rand() * 20, py - 80 + rand() * 30, 14, 10, 150 + rand() * 30, 55 + rand() * 20, 35 + rand() * 15, 0.8);
  }
  // ---- 水果(左前,黄绿柠檬 + 红苹果) ----
  const fx = W * 0.22, fy = H * 0.78;
  // 苹果
  for (let i = 0; i < 60; i++) {
    c.ellipse(fx + (rand() - 0.5) * 60, fy + (rand() - 0.5) * 50, 18, 14, 200 + rand() * 30, 60 + rand() * 30, 50 + rand() * 20, 0.7);
  }
  for (let i = 0; i < 15; i++) c.ellipse(fx - 14, fy - 14, 8, 6, 240, 200, 120, 0.6);
  // 柠檬
  const lx = W * 0.8, ly = H * 0.82;
  for (let i = 0; i < 50; i++) {
    c.ellipse(lx + (rand() - 0.5) * 50, ly + (rand() - 0.5) * 40, 14, 10, 210 + rand() * 30, 180 + rand() * 30, 60 + rand() * 30, 0.7);
  }
  // ---- 衬布(暖白,笔触褶皱) ----
  for (let x = 0; x < W; x += 10) {
    const y = H * 0.66 + Math.sin(x / 90) * 14;
    for (let i = 0; i < 8; i++) {
      c.rect(x + rand() * 6, y + rand() * 10, 10, 4, 200 + rand() * 30, 180 + rand() * 25, 150 + rand() * 20, 0.6);
    }
  }
  // 投影
  c.ellipse(px + 40, py + 110, 140, 22, 30, 20, 15, 0.6);
  c.ellipse(fx + 10, fy + 30, 50, 10, 30, 20, 15, 0.5);
  // 签名笔触(右下)
  for (let i = 0; i < 5; i++) c.rect(W * 0.86 + i * 10, H * 0.94, 8, 4, 230, 200, 140, 0.8);
  results.push(['oil-still.png', c.save(path.join(OUT, 'oil-still.png'))]);
})();

results.forEach(([n, kb]) => console.log('OK', n, kb + 'KB'));
console.log('OUT_DIR=' + OUT);
