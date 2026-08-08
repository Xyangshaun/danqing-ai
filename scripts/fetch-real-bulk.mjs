#!/usr/bin/env node
// ============================================================
// 丹青有AI - 真实藏品批量拉取 (B方案:替换占位图)
//
// 数据源(全部 CC0/公有领域,无版权问题):
//   1. Chicago Art Institute: 分页批量元数据(100条/页,快),IIIF 1280px 图
//   2. Met Museum: search+objects 逐条(慢但质量高),primaryImageSmall 图
//
// 产出:
//   public/images/artworks-real/full/{id}.jpg   高清大图(≤1280px)
//   public/images/artworks-real/thumb/{id}.jpg  保比例缩略图(宽640)
//   public/data/artworks-real-bulk.json         条目元数据(含 thumbW/thumbH)
//
// 断点续跑:图片已存在则跳过下载;JSON 全量重写(幂等)
// 用法: node scripts/fetch-real-bulk.mjs [chicagoCount] [metCount]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'full');
const THUMB_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'thumb');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'artworks-real-bulk.json');

const CHICAGO_TARGET = Number(process.argv[2] || 1200);
const MET_TARGET = Number(process.argv[3] || 800);

fs.mkdirSync(THUMB_DIR, { recursive: true });
fs.mkdirSync(FULL_DIR, { recursive: true });

const UA = 'DanQingAI/1.0 (art education platform)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_BYTES = 12 * 1024 * 1024;

function fetchJson(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJson(res.headers.location, timeout));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function downloadImage(url, destPath, timeout = 40000) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 5000) return Promise.resolve('cached');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let total = 0;
    const isIiif = /artic\.edu|iiif/i.test(url);
    const req = https.get(url, {
      headers: {
        'User-Agent': isIiif ? BROWSER_UA : UA,
        Accept: 'image/*,*/*',
        ...(isIiif ? { Referer: 'https://www.artic.edu/' } : {}),
      },
      timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); try { fs.unlinkSync(destPath); } catch { /* */ }
        // 重定向不读缓存标记,直接跟
        return resolve(downloadImage(res.headers.location, destPath, timeout));
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(destPath); } catch { /* */ }
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const cl = parseInt(res.headers['content-length'] || '0', 10);
      if (cl > MAX_BYTES) {
        file.close(); try { fs.unlinkSync(destPath); } catch { /* */ }
        return reject(new Error(`too large ${(cl / 1048576).toFixed(1)}MB`));
      }
      res.pipe(file);
      res.on('data', (c) => { total += c.length; if (total > MAX_BYTES) { req.destroy(new Error('overflow')); } });
      file.on('finish', () => {
        file.close();
        const st = fs.statSync(destPath);
        if (st.size < 5000) { try { fs.unlinkSync(destPath); } catch { /* */ } return reject(new Error('too small')); }
        resolve('ok');
      });
    });
    req.on('error', (e) => { file.close(); try { fs.unlinkSync(destPath); } catch { /* */ } reject(e); });
    req.on('timeout', () => req.destroy(new Error('dl timeout')));
  });
}

async function pool(items, limit, worker) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      try { await worker(items[cur], cur); } catch { /* worker 内部已记日志 */ }
    }
  });
  await Promise.all(workers);
}

function categorize(medium, classification) {
  const m = (medium || '').toLowerCase();
  const c = (classification || '').toLowerCase();
  if (c.includes('sculpture') || m.includes('sculpture') || m.includes('marble') || m.includes('bronze')) return 'sculpture';
  if (m.includes('oil') || m.includes('painting') || c.includes('painting')) return 'painting';
  if (m.includes('calligraphy') || c.includes('calligraphy')) return 'calligraphy';
  if (c.includes('design') || c.includes('decorative') || c.includes('furniture')) return 'design';
  if (c.includes('architecture')) return 'architecture';
  if (m.includes('print') || c.includes('print') || c.includes('drawing')) return 'painting';
  return 'painting';
}

function detectRegion(country, culture) {
  const c = (country || culture || '').toLowerCase();
  if (c.includes('china') || c.includes('chinese')) return 'china';
  if (c.includes('japan') || c.includes('korea')) return 'east-asia';
  if (c.includes('europe') || c.includes('french') || c.includes('ital') || c.includes('dutch') || c.includes('spanish') || c.includes('german') || c.includes('british') || c.includes('netherland') || c.includes('flanders') || c.includes('flemish')) return 'europe';
  if (c.includes('america') || c.includes('united states')) return 'america';
  return 'other';
}

/** 保比例缩略图:宽 640(更小则不放大),返回 {w,h} */
async function makeThumb(sharp, fullPath, thumbPath) {
  const meta = await sharp(fullPath).metadata();
  const fw = meta.width || 0;
  const fh = meta.height || 0;
  if (!fw || !fh) throw new Error('no dims');
  const tw = Math.min(640, fw);
  const th = Math.round((fh * tw) / fw);
  await sharp(fullPath).resize({ width: tw, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(thumbPath);
  return { w: tw, h: th, fw, fh };
}

async function main() {
  const sharp = (await import('sharp')).default;
  const items = [];
  const seenIds = new Set();
  const stats = { chicago: 0, met: 0, thumbFail: 0, dlFail: 0 };

  // ---------- 1. Chicago Art Institute(分页批量,快) ----------
  console.log(`\n=== Chicago: 目标 ${CHICAGO_TARGET} 件 ===`);
  const pages = Math.ceil((CHICAGO_TARGET * 1.3) / 100); // 多取 30% 防失败
  const chicagoArts = [];
  for (let p = 1; p <= pages; p++) {
    try {
      const url = `https://api.artic.edu/api/v1/artworks/search?limit=100&page=${p}&fields=id,title,artist_title,date_display,medium_display,classification_title,department_title,image_id,place_of_origin&query[term][is_public_domain]=true`;
      const j = await fetchJson(url);
      chicagoArts.push(...(j.data || []).filter((a) => a.image_id));
      if (p % 5 === 0) console.log(`  元数据进度: ${chicagoArts.length} 条 (page ${p}/${pages})`);
    } catch (e) {
      console.log(`  页 ${p} 失败: ${e.message}`);
    }
  }
  console.log(`  元数据合计: ${chicagoArts.length} 条`);

  let chiDone = 0;
  await pool(chicagoArts, 6, async (art) => {
    if (chiDone >= CHICAGO_TARGET) return;
    const idStr = `chi-${String(art.id).padStart(6, '0')}`;
    if (seenIds.has(idStr)) return;
    const fullDest = path.join(FULL_DIR, `${idStr}.jpg`);
    const thumbDest = path.join(THUMB_DIR, `${idStr}.jpg`);
    try {
      await downloadImage(`https://www.artic.edu/iiif/2/${art.image_id}/full/1280,/0/default.jpg`, fullDest);
    } catch (e) {
      stats.dlFail++;
      return;
    }
    let dims;
    try {
      dims = await makeThumb(sharp, fullDest, thumbDest);
    } catch {
      stats.thumbFail++;
      try { fs.unlinkSync(fullDest); } catch { /* */ }
      return;
    }
    seenIds.add(idStr);
    chiDone++;
    stats.chicago++;
    const category = categorize(art.medium_display, art.classification_title);
    items.push({
      id: idStr,
      source: 'chicago-art',
      title: art.title || 'Untitled',
      titleEn: art.title || '',
      artist: art.artist_title || 'Unknown',
      artistEn: art.artist_title || '',
      year: art.date_display || '',
      category,
      style: art.classification_title || 'Painting',
      era: art.date_display || '',
      region: detectRegion(art.place_of_origin, art.department_title),
      description: art.medium_display || art.classification_title || '',
      medium: art.medium_display || '',
      dimensions: '',
      imageUrl: `/images/artworks-real/full/${idStr}.jpg`,
      thumbUrl: `/images/artworks-real/thumb/${idStr}.jpg`,
      thumbW: dims.w,
      thumbH: dims.h,
      tags: [art.classification_title, art.department_title, art.place_of_origin].filter(Boolean),
      publicDomain: true,
    });
    if (chiDone % 100 === 0) console.log(`  下载进度: ${chiDone}/${CHICAGO_TARGET}`);
  });

  // ---------- 2. Met Museum(逐条元数据,较慢) ----------
  console.log(`\n=== Met: 目标 ${MET_TARGET} 件 ===`);
  const queries = ['painting&medium=Paintings', 'landscape', 'portrait', 'sculpture&medium=Sculpture'];
  const metIds = [];
  for (const q of queries) {
    try {
      const j = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${q}`);
      metIds.push(...(j.objectIDs || []).slice(0, MET_TARGET));
    } catch (e) {
      console.log(`  搜索 ${q} 失败: ${e.message}`);
    }
  }
  // 去重并保持顺序
  const uniqMetIds = [...new Set(metIds)];
  console.log(`  候选 ID: ${uniqMetIds.length} 个`);

  let metDone = 0;
  await pool(uniqMetIds, 4, async (id) => {
    if (metDone >= MET_TARGET) return;
    const idStr = `met-${String(id).padStart(6, '0')}`;
    if (seenIds.has(idStr)) return;
    let obj;
    try {
      obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, 15000);
    } catch { return; }
    if (!obj || !obj.isPublicDomain || !(obj.primaryImageSmall || obj.primaryImage)) return;
    const fullDest = path.join(FULL_DIR, `${idStr}.jpg`);
    const thumbDest = path.join(THUMB_DIR, `${idStr}.jpg`);
    try {
      await downloadImage(obj.primaryImageSmall || obj.primaryImage, fullDest);
    } catch {
      stats.dlFail++;
      return;
    }
    let dims;
    try {
      dims = await makeThumb(sharp, fullDest, thumbDest);
    } catch {
      stats.thumbFail++;
      try { fs.unlinkSync(fullDest); } catch { /* */ }
      return;
    }
    seenIds.add(idStr);
    metDone++;
    stats.met++;
    items.push({
      id: idStr,
      source: 'met-museum',
      title: obj.title || 'Untitled',
      titleEn: obj.title || '',
      artist: obj.artistDisplayName || 'Unknown',
      artistEn: obj.artistDisplayName || '',
      year: obj.objectDate || '',
      category: categorize(obj.medium, obj.classification),
      style: obj.classification || 'Painting',
      era: obj.period || obj.objectDate || '',
      region: detectRegion(obj.country, obj.culture),
      description: obj.objectName ? `${obj.objectName}，${obj.medium || ''}` : (obj.medium || ''),
      medium: obj.medium || '',
      dimensions: obj.dimensions || '',
      imageUrl: `/images/artworks-real/full/${idStr}.jpg`,
      thumbUrl: `/images/artworks-real/thumb/${idStr}.jpg`,
      thumbW: dims.w,
      thumbH: dims.h,
      tags: [obj.classification, obj.culture, obj.department].filter(Boolean),
      publicDomain: true,
      metUrl: obj.objectURL || '',
    });
    if (metDone % 100 === 0) console.log(`  下载进度: ${metDone}/${MET_TARGET}`);
  });

  // ---------- 3. 写出 JSON ----------
  const output = {
    total: items.length,
    generatedAt: new Date().toISOString(),
    sources: { chicagoArt: stats.chicago, metMuseum: stats.met },
    items,
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(output), 'utf8');

  console.log(`\n========================================`);
  console.log(`完成! 共 ${items.length} 件 (Chicago ${stats.chicago} + Met ${stats.met})`);
  console.log(`失败: 下载 ${stats.dlFail}, 缩略图 ${stats.thumbFail}`);
  console.log(`数据: ${DATA_PATH}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
