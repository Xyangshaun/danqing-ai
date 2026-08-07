/**
 * 修复 server/data/artworks.json 中指向 IDE 内部图片 API 的 imageUrl,
 * 将其替换为项目本地生成的 SVG data URI,确保生产环境(无 IDE 沙箱)也能加载。
 *
 * 执行: node scripts/fix-artworks-json.cjs
 * 回滚: cp server/data/artworks.json.bak server/data/artworks.json
 */
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.resolve(__dirname, '..', 'server', 'data', 'artworks.json');
const BAK_PATH = `${JSON_PATH}.bak`;

const PALETTE = [
  { bg: '#f5f2eb', ink: '#1a1a1a', accent: '#c41e3a' },
  { bg: '#ede8db', ink: '#1a1a1a', accent: '#2e5fa1' },
  { bg: '#f0ebe0', ink: '#1a1a1a', accent: '#5b8c5a' },
  { bg: '#ede4d3', ink: '#1a1a1a', accent: '#d4af37' },
  { bg: '#f2e8e8', ink: '#1a1a1a', accent: '#6b3fa0' },
  { bg: '#efe9e0', ink: '#1a1a1a', accent: '#8b5a2b' },
];

function hashSeed(seed) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

function truncateTitle(title, maxLen) {
  const trimmed = title.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1) + '…';
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function placeholderImage(seed, opts = {}) {
  const size = opts.size ?? 'landscape_4_3';
  const dimensions = {
    square: [400, 400],
    square_hd: [400, 400],
    portrait_4_3: [400, 533],
    portrait_16_9: [360, 640],
    landscape_4_3: [533, 400],
    landscape_16_9: [640, 360],
  };
  const [w, h] = dimensions[size] ?? [533, 400];
  const hash = hashSeed(seed || 'default');
  const palette = PALETTE[hash % PALETTE.length];
  const accent = palette.accent;
  const bg = palette.bg;

  const dotR = 12 + (hash % 24);
  const dotX = w - dotR - 18;
  const dotY = dotR + 18;
  const blob1X = ((hash % 100) / 100) * w;
  const blob1Y = ((hash % 73) / 73) * h;
  const blob2X = (((hash >> 8) % 100) / 100) * w;
  const blob2Y = (((hash >> 8) % 71) / 71) * h;

  const title = escapeXml(truncateTitle(opts.title ?? seed, 14));
  const subtitle = opts.subtitle ? escapeXml(truncateTitle(opts.subtitle, 24)) : '';

  const titleFontSize = Math.min(28, Math.max(18, Math.floor(w / 18)));
  const subFontSize = Math.max(11, Math.floor(titleFontSize * 0.55));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="blob1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blob2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a1a1a" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#1a1a1a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${blob1X}" cy="${blob1Y}" r="${Math.floor(Math.max(w, h) * 0.4)}" fill="url(#blob1)"/>
  <circle cx="${blob2X}" cy="${blob2Y}" r="${Math.floor(Math.max(w, h) * 0.35)}" fill="url(#blob2)"/>
  <g opacity="0.95">
    <circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="${accent}" opacity="0.92"/>
    <text x="${dotX}" y="${dotY + 1}" font-family="Songti SC,SimSun,serif" font-size="${Math.floor(dotR * 0.95)}" fill="${bg}" text-anchor="middle" dominant-baseline="middle" font-weight="600">丹</text>
  </g>
  <text x="${w / 2}" y="${h / 2}" font-family="Songti SC,SimSun,STSong,serif" font-size="${titleFontSize}" fill="#1a1a1a" text-anchor="middle" dominant-baseline="middle" font-weight="500">${title}</text>
  ${subtitle ? `<text x="${w / 2}" y="${h / 2 + titleFontSize * 0.95}" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif" font-size="${subFontSize}" fill="#1a1a1a" opacity="0.55" text-anchor="middle" dominant-baseline="middle">${subtitle}</text>` : ''}
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#1a1a1a" stroke-opacity="0.06" stroke-width="1"/>
</svg>`;

  const encoded = svg
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/&/g, '%26');
  return `data:image/svg+xml,${encoded}`;
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`[fix-artworks-json] 未找到文件: ${JSON_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  let artworks;
  try {
    artworks = JSON.parse(raw);
  } catch (e) {
    console.error('[fix-artworks-json] JSON 解析失败:', e.message);
    process.exit(1);
  }

  if (!Array.isArray(artworks)) {
    console.error('[fix-artworks-json] artworks.json 期望为数组');
    process.exit(1);
  }

  // 备份原文件
  fs.copyFileSync(JSON_PATH, BAK_PATH);
  console.log(`[fix-artworks-json] 已备份到 ${BAK_PATH}`);

  let replaced = 0;
  let skipped = 0;
  const badPrefix = 'https://trae-api-cn.mchost.guru';

  for (const item of artworks) {
    const url = item.imageUrl;
    if (typeof url !== 'string') {
      skipped++;
      continue;
    }
    if (url.startsWith(badPrefix)) {
      const seed = `${item.id}-${item.titleEn || item.title || 'untitled'}`;
      item.imageUrl = placeholderImage(seed, {
        size: 'landscape_4_3',
        title: item.title || item.titleEn || '',
        subtitle: item.artist || item.artistEn || '',
      });
      replaced++;
    } else {
      skipped++;
    }
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(artworks, null, 2) + '\n', 'utf-8');
  console.log(`[fix-artworks-json] 共 ${artworks.length} 条,替换 ${replaced} 条,跳过 ${skipped} 条`);
  console.log(`[fix-artworks-json] 已更新 ${JSON_PATH}`);
}

main();
