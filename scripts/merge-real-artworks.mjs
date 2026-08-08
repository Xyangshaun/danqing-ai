#!/usr/bin/env node
// ============================================================
// 丹青有AI - 合并真实藏品到主素材库 (B2)
//
// 1. artworks-real-bulk.json(真实藏品,含 thumbW/thumbH)排到最前
// 2. 既有条目按 id 去重,校验图片文件存在(缺失则丢弃)
// 3. 回填 thumbW/thumbH:
//    - artwork-* 占位图: 实测全部 640x360,直接写入
//    - met-*/ai-* 等: 用 sharp 读缩略图实测
// 4. 原文件备份到 public/data/artworks.json.bak-YYYYMMDD-HHmm
//
// 用法: node scripts/merge-real-artworks.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN_JSON = path.join(ROOT, 'public', 'data', 'artworks.json');
const BULK_JSON = path.join(ROOT, 'public', 'data', 'artworks-real-bulk.json');

function fileExists(urlPath) {
  if (!urlPath || !urlPath.startsWith('/images/')) return false;
  return fs.existsSync(path.join(ROOT, 'public', urlPath));
}

async function main() {
  const sharp = (await import('sharp')).default;

  const main = JSON.parse(fs.readFileSync(MAIN_JSON, 'utf8'));
  const mainItems = main.items || main;
  const bulk = fs.existsSync(BULK_JSON)
    ? JSON.parse(fs.readFileSync(BULK_JSON, 'utf8'))
    : { items: [] };

  console.log(`主库: ${mainItems.length} 条, 增量真实藏品: ${bulk.items.length} 条`);

  // 1. 合并去重:真实藏品在前
  const seen = new Set();
  const merged = [];
  for (const it of [...bulk.items, ...mainItems]) {
    if (!it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    merged.push(it);
  }
  console.log(`合并去重后: ${merged.length} 条`);

  // 2. 校验图片文件存在(缺失整条丢弃,避免线上裂图)
  const before = merged.length;
  const kept = merged.filter((it) => {
    // 占位图协议(__ARTWORK_IMAGE__)无实体文件,保留
    const fullOk = !it.imageUrl || !it.imageUrl.startsWith('/images/') || fileExists(it.imageUrl);
    const thumbOk = !it.thumbUrl || !it.thumbUrl.startsWith('/images/') || fileExists(it.thumbUrl);
    return fullOk && thumbOk;
  });
  const dropped = before - kept.length;
  if (dropped > 0) console.log(`丢弃图片缺失条目: ${dropped} 条`);

  // 3. 回填 thumbW/thumbH
  let backfilled = 0;
  let sharpReads = 0;
  for (const it of kept) {
    if (it.thumbW && it.thumbH) continue;
    if (it.thumbUrl && it.thumbUrl.startsWith('/images/artworks/thumb/artwork-')) {
      // 占位图缩略图实测全部 640x360(生成器固定输出)
      it.thumbW = 640;
      it.thumbH = 360;
      backfilled++;
    } else if (it.thumbUrl && it.thumbUrl.startsWith('/images/') && fileExists(it.thumbUrl)) {
      try {
        const meta = await sharp(path.join(ROOT, 'public', it.thumbUrl)).metadata();
        if (meta.width && meta.height) {
          it.thumbW = meta.width;
          it.thumbH = meta.height;
          backfilled++;
          sharpReads++;
        }
      } catch { /* 跳过,前端回退 16:9 */ }
    }
  }
  console.log(`回填尺寸: ${backfilled} 条 (sharp 实测 ${sharpReads}, 占位图直写 ${backfilled - sharpReads})`);

  // 4. 备份并写出
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const backup = MAIN_JSON + `.bak-${stamp}`;
  fs.copyFileSync(MAIN_JSON, backup);
  console.log(`备份: ${path.basename(backup)}`);

  const total = kept.length;
  const realCount = kept.filter((i) => i.source === 'met-museum' || i.source === 'chicago-art' || i.source === 'wikimedia-commons').length;
  fs.writeFileSync(MAIN_JSON, JSON.stringify({ total, generatedAt: new Date().toISOString(), items: kept }), 'utf8');
  console.log(`\n完成! 共 ${total} 条 (真实藏品 ${realCount} 条排最前)`);
  console.log(`文件: ${MAIN_JSON} (${(fs.statSync(MAIN_JSON).size / 1048576).toFixed(1)}MB)`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
