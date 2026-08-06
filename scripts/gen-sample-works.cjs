/**
 * 初赛理念示例作品图生成器(纯 Node,无第三方依赖)
 * 用内置 zlib 手写 PNG 编码,程序化生成契合"丹青有AI"初赛理念的中式美学作品图
 * 覆盖四类艺术形态: 绘画(水墨山水) / 设计(朱砂海报) / 产品(青瓷茶具) / 雕塑(青铜流形)
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

const OUT = process.env.OUT_DIR || path.join(process.env.TEMP || '.', 'danqing-works');
fs.mkdirSync(OUT, { recursive: true });
const results = [];

// ========== 1. 绘画: 水墨山水(层叠远山+云雾+落日) ==========
(function () {
  const W = 1024, H = 768, c = new Canvas(W, H, [244, 240, 233, 255]);
  const rand = rng(20260807);
  // 落日
  c.circle(W * 0.72, H * 0.28, 60, 190, 60, 48, 0.85);
  // 远山 4 层(由远及近,墨色渐浓)
  const layers = [[215, 210, 200], [185, 180, 168], [140, 136, 126], [88, 86, 80]];
  layers.forEach((ink, li) => {
    const baseY = H * (0.42 + li * 0.13);
    for (let x = 0; x < W; x++) {
      const peak = Math.sin(x / (160 - li * 20) + li * 3) * (50 + li * 18)
        + Math.sin(x / 47 + li * 7) * 22 + rand() * 6;
      const yTop = baseY - Math.abs(peak);
      for (let y = Math.max(0, yTop | 0); y < H; y++) {
        const depth = Math.min(1, (y - yTop) / 120);
        c.blend(x, y, ink[0], ink[1], ink[2], (0.5 + li * 0.13) * (1 - depth * 0.4));
      }
    }
    // 云雾带
    c.ellipse(W * 0.5, baseY + 30, W * 0.55, 26, 244, 240, 233, 0.55);
  });
  // 前景松树点缀
  for (let i = 0; i < 7; i++) {
    const x = 80 + rand() * (W - 160), y = H * 0.86 + rand() * 40;
    c.ellipse(x, y, 14, 30, 60, 70, 55, 0.8);
  }
  results.push(['painting-ink-mountain.png', c.save(path.join(OUT, 'painting-ink-mountain.png'))]);
})();

// ========== 2. 设计: 朱砂海报(大块朱砂+墨书笔触+留白) ==========
(function () {
  const W = 768, H = 1024, c = new Canvas(W, H, [246, 242, 236, 255]);
  const rand = rng(7);
  // 朱砂主色块(印章感)
  c.rect(W * 0.18, H * 0.16, W * 0.5, H * 0.34, 178, 47, 36, 0.95);
  // 边缘做旧
  for (let i = 0; i < 3000; i++) {
    const x = W * 0.18 + rand() * W * 0.5, y = H * 0.16 + rand() * H * 0.34;
    if (rand() < 0.3) c.blend(x, y, 246, 242, 236, rand() * 0.25);
  }
  // 墨色书法笔触(竖排意向)
  for (let s = 0; s < 5; s++) {
    const bx = W * (0.74 + (s % 2) * 0.05), by = H * (0.2 + s * 0.12);
    for (let t = 0; t < 60; t++) {
      c.circle(bx + Math.sin(t / 6 + s) * 8, by + t * 2.4, 6 - Math.abs(30 - t) / 8, 40, 38, 36, 0.8);
    }
  }
  // 落款小印
  c.rect(W * 0.68, H * 0.78, 54, 54, 178, 47, 36, 0.92);
  // 底部细线
  c.rect(W * 0.18, H * 0.62, W * 0.64, 3, 40, 38, 36, 0.7);
  results.push(['design-poster-cinnabar.png', c.save(path.join(OUT, 'design-poster-cinnabar.png'))]);
})();

// ========== 3. 产品: 青瓷茶具(玉青釉色+圆润器型+柔光) ==========
(function () {
  const W = 900, H = 900, c = new Canvas(W, H, [232, 236, 232, 255]);
  // 桌面
  c.rect(0, H * 0.66, W, H, 200, 206, 198, 1);
  // 柔光背景
  c.ellipse(W * 0.5, H * 0.34, W * 0.42, H * 0.3, 240, 244, 240, 0.7);
  const jade = [168, 200, 186], jadeD = [120, 158, 146], jadeL = [205, 226, 216];
  // 茶壶身
  c.ellipse(W * 0.42, H * 0.52, 150, 128, ...jade, 1);
  c.ellipse(W * 0.38, H * 0.46, 90, 70, ...jadeL, 0.6); // 高光
  c.ellipse(W * 0.42, H * 0.62, 150, 40, ...jadeD, 0.5); // 底部阴影
  // 壶盖
  c.ellipse(W * 0.42, H * 0.40, 78, 34, ...jadeD, 1);
  c.circle(W * 0.42, H * 0.375, 16, ...jadeD, 1);
  // 壶嘴
  c.ellipse(W * 0.62, H * 0.47, 46, 22, ...jade, 1);
  // 壶把
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    c.circle(W * 0.24 + Math.cos(a) * 46, H * 0.5 + Math.sin(a) * 58, 9, ...jadeD, 0.95);
  }
  // 两只茶杯
  [[0.72, 0.62], [0.84, 0.66]].forEach(([px, py]) => {
    c.ellipse(W * px, H * py, 52, 40, ...jade, 1);
    c.ellipse(W * px, H * (py - 0.045), 46, 14, ...jadeL, 1);
    c.ellipse(W * px, H * (py - 0.05), 38, 9, 150, 120, 90, 0.6); // 茶汤
  });
  results.push(['product-tea-set-jade.png', c.save(path.join(OUT, 'product-tea-set-jade.png'))]);
})();

// ========== 4. 雕塑: 青铜流形(螺旋抽象体+台座+戏剧光) ==========
(function () {
  const W = 900, H = 900, c = new Canvas(W, H, [34, 32, 34, 255]);
  // 顶部戏剧光
  for (let y = 0; y < H; y++) {
    const g = Math.max(0, 1 - y / (H * 0.7));
    for (let x = 0; x < W; x++) c.blend(x, y, 90, 84, 70, g * 0.12 * (1 - Math.abs(x - W / 2) / (W / 2)));
  }
  // 台座
  c.rect(W * 0.3, H * 0.78, W * 0.4, H * 0.06, 70, 66, 62, 1);
  c.rect(W * 0.26, H * 0.84, W * 0.48, H * 0.05, 52, 50, 48, 1);
  // 青铜螺旋流形(层层椭圆错位叠加)
  const bronze = [150, 110, 60], bronzeL = [200, 160, 100], bronzeD = [95, 70, 40];
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const cx = W * 0.5 + Math.sin(t * 9) * (90 * (1 - t * 0.5));
    const cy = H * 0.78 - t * H * 0.52;
    const rr = 60 * (1 - t * 0.55) * (0.7 + Math.abs(Math.sin(t * 9)) * 0.5);
    const shade = t;
    c.ellipse(cx, cy, rr, rr * 0.72,
      bronze[0] * (1 - shade) + bronzeD[0] * shade,
      bronze[1] * (1 - shade) + bronzeD[1] * shade,
      bronze[2] * (1 - shade) + bronzeD[2] * shade, 0.95);
    // 高光棱
    c.ellipse(cx - rr * 0.3, cy - rr * 0.2, rr * 0.3, rr * 0.2, ...bronzeL, 0.35 * (1 - shade));
  }
  results.push(['sculpture-bronze.png', c.save(path.join(OUT, 'sculpture-bronze.png'))]);
})();

results.forEach(([n, kb]) => console.log('OK', n, kb + 'KB'));
console.log('OUT_DIR=' + OUT);
