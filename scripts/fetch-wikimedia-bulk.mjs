#!/usr/bin/env node
// ============================================================
// 丹青有AI - Wikimedia Commons 真实藏品批量拉取 (B方案·修订)
//
// 背景:Met/Chicago API 被 Incapsula/Cloudflare 按 IP 封禁,
//       Wikimedia Commons API + upload.wikimedia.org 直连可达。
//
// 数据源(全部自由版权/公有领域,Featured=人工精选高质量):
//   - Category:Featured pictures of paintings 的各国子分类
//   - Category:Featured pictures of sculptures / drawings / prints
//
// 实现要点:
//   - 所有 HTTP 走 curl.exe 子进程(本机 Node 直连 TLS 不稳定)
//   - 元数据 50 条/批(imageinfo + iiurlwidth=1280 直接给缩放图 URL)
//   - 下载 1280px 缩放图作为 full,sharp 生成宽 640 保比例缩略图
//   - 断点续跑:图片已存在跳过;JSON 幂等重写
//
// 用法: node scripts/fetch-wikimedia-bulk.mjs [targetCount]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'full');
const THUMB_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'thumb');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'artworks-real-bulk.json');

const TARGET = Number(process.argv[2] || 2000);
const UA = 'DanQingAI/1.0 (art education platform; https://www.danqing.site)';
const API = 'https://commons.wikimedia.org/w/api.php';

fs.mkdirSync(THUMB_DIR, { recursive: true });
fs.mkdirSync(FULL_DIR, { recursive: true });

// ---------- curl 封装 ----------
function curl(args, destFile = null, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const finalArgs = ['-s', '-m', String(Math.ceil(timeoutMs / 1000)), '--retry', '3', '--retry-all-errors', '-A', UA, ...args];
    if (destFile) finalArgs.push('-o', destFile);
    execFile('curl.exe', finalArgs, { timeout: timeoutMs + 15000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl: ${err.message} ${stderr?.slice(0, 120) || ''}`));
      resolve(destFile ? destFile : stdout.toString('utf8'));
    });
  });
}

async function apiJson(params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const text = await curl([`${API}?${qs}&format=json&formatversion=2`]);
  return JSON.parse(text);
}

async function pool(items, limit, worker) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      try { await worker(items[cur], cur); } catch { /* worker 内已记日志 */ }
    }
  });
  await Promise.all(workers);
}

// ---------- 元数据清洗 ----------
function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function categorizeFromText(text, sourceCat) {
  const t = (text || '').toLowerCase();
  const c = (sourceCat || '').toLowerCase();
  if (c.includes('sculpture') || t.includes('sculpture') || t.includes('marble') || t.includes('bronze') || t.includes('statue')) return 'sculpture';
  if (t.includes('calligraphy')) return 'calligraphy';
  if (t.includes('poster') || t.includes('design') || t.includes('decorative')) return 'design';
  return 'painting';
}

function regionFromCat(cat, extraText) {
  const c = (cat || '').toLowerCase();
  const t = (extraText || '').toLowerCase();
  if (c.includes('china') || c.includes('tibet') || c.includes('taiwan') || t.includes('chinese')) return 'china';
  if (c.includes('japan') || c.includes('korea') || t.includes('japanese')) return 'east-asia';
  if (/europe|france|italy|germany|netherlands|spain|britain|kingdom|austria|belgium|denmark|sweden|norway|finland|poland|russia|greece|hungary|czech|slovak|slovenia|croatia|serbia|romania|bulgaria|portugal|switzerland|vatican|estonia|latvia|lithuania|paris|london|madrid/.test(c)) return 'europe';
  if (c.includes('united states') || c.includes('america') || c.includes('canada') || c.includes('mexico') || c.includes('brazil') || c.includes('ecuador') || c.includes('suriname') || c.includes('venezuela') || c.includes('new york') || c.includes('los angeles') || c.includes('washington') || c.includes('chicago')) return 'america';
  return 'other';
}

function extractYear(dateStr, creditStr) {
  const s = `${dateStr || ''} ${creditStr || ''}`;
  const m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? m[1] : '';
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

// ---------- 1. 收集分类(返回 {title, cap}) ----------
async function collectCategories() {
  const cats = [];
  // 绘画精选:各国子分类(每类文件少,全取)
  const sub = await apiJson({
    action: 'query', list: 'categorymembers',
    cmtitle: 'Category:Featured pictures of paintings',
    cmlimit: '500', cmtype: 'subcat',
  });
  for (const m of sub.query?.categorymembers || []) cats.push({ title: m.title, cap: 500 });
  // 其他艺术形式精选(直接取文件)
  for (const extra of [
    'Category:Featured pictures of sculptures',
    'Category:Featured pictures of drawings',
    'Category:Featured pictures of prints',
  ]) {
    try {
      const j = await apiJson({ action: 'query', list: 'categorymembers', cmtitle: extra, cmlimit: '5' });
      if (j.query) cats.push({ title: extra, cap: 500 });
    } catch { /* 分类不存在则跳过 */ }
  }
  // Google Art Project:按博物馆子分类扩充量级(407 个馆,取前 100 馆,每馆 30 件)
  try {
    const gap = await apiJson({
      action: 'query', list: 'categorymembers',
      cmtitle: 'Category:Google Art Project works by collection',
      cmlimit: '500', cmtype: 'subcat',
    });
    for (const m of (gap.query?.categorymembers || []).slice(0, 100)) {
      cats.push({ title: m.title, cap: 30 });
    }
  } catch (e) {
    console.log(`  GAP 分类获取失败: ${e.message}`);
  }
  return cats;
}

// ---------- 2. 收集文件标题(带续页) ----------
async function collectFiles(cat, cap) {
  const files = [];
  let cont = null;
  do {
    const params = {
      action: 'query', list: 'categorymembers', cmtitle: cat,
      cmlimit: '500', cmtype: 'file',
    };
    if (cont) params.cmcontinue = cont;
    const j = await apiJson(params);
    for (const m of j.query?.categorymembers || []) files.push(m.title);
    cont = j.continue?.cmcontinue || null;
  } while (cont && files.length < cap);
  return files.slice(0, cap);
}

// ---------- 3. 批量元数据 ----------
async function batchImageInfo(titles) {
  const j = await apiJson({
    action: 'query', prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    titles: titles.join('|'),
  });
  return j.query?.pages || [];
}

async function main() {
  const sharp = (await import('sharp')).default;
  console.log(`\n=== Wikimedia Commons: 目标 ${TARGET} 件 ===`);

  console.log('收集分类...');
  const cats = await collectCategories();
  console.log(`  ${cats.length} 个分类`);

  console.log('收集文件清单...');
  const allFiles = [];
  for (const { title: cat, cap } of cats) {
    try {
      const files = await collectFiles(cat, cap);
      for (const f of files) allFiles.push({ title: f, cat });
    } catch (e) {
      console.log(`  ${cat} 失败: ${e.message}`);
    }
  }
  // 按 title 去重
  const seen = new Set();
  const queue = allFiles.filter((f) => (seen.has(f.title) ? false : (seen.add(f.title), true)));
  console.log(`  候选文件: ${queue.length} 个`);

  // 4. 批量取元数据 + 下载 + 缩略图
  const items = [];
  const stats = { meta: 0, skip: 0, dlFail: 0, thumbFail: 0, done: 0 };
  // 已有文件断点续传映射:hash(title)->文件名
  const idOf = (title) => `wm-${crypto.createHash('sha1').update(title).digest('hex').slice(0, 10)}`;

  // 分批(50/批)取元数据,逐批处理下载
  const BATCH = 50;
  for (let off = 0; off < queue.length && items.length < TARGET; off += BATCH) {
    const batch = queue.slice(off, off + BATCH);
    let pages;
    try {
      pages = await batchImageInfo(batch.map((b) => b.title));
    } catch (e) {
      console.log(`  元数据批 ${off / BATCH + 1} 失败: ${e.message}`);
      continue;
    }
    const catOf = new Map(batch.map((b) => [b.title, b.cat]));

    // 过滤有效条目
    const valid = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !ii.thumburl) { stats.skip++; continue; }
      if (!['image/jpeg', 'image/png'].includes(ii.mime)) { stats.skip++; continue; }
      if ((ii.width || 0) < 600) { stats.skip++; continue; } // 太小不要
      valid.push({ p, ii, cat: catOf.get(p.title) || '' });
    }
    stats.meta += valid.length;

    // 并发下载(6)
    await pool(valid, 6, async ({ p, ii, cat }) => {
      if (items.length >= TARGET) return;
      const id = idOf(p.title);
      const fullDest = path.join(FULL_DIR, `${id}.jpg`);
      const thumbDest = path.join(THUMB_DIR, `${id}.jpg`);
      try {
        if (!(fs.existsSync(fullDest) && fs.statSync(fullDest).size > 5000)) {
          await curl([ii.thumburl], fullDest, 60000);
          if (fs.statSync(fullDest).size < 5000) {
            try { fs.unlinkSync(fullDest); } catch { /* */ }
            stats.dlFail++;
            return;
          }
        }
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

      const em = ii.extmetadata || {};
      const rawTitle = p.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      // 描述清洗:去掉 Wikidata QS 结构化噪声(如 ` title QS:P1476,it:"..." label QS:...`)
      const descRaw = stripHtml(em.ImageDescription?.value);
      const desc = descRaw.split(/\s(?:title|label)\s+QS:/)[0].trim().slice(0, 300);
      const artist = stripHtml(em.Artist?.value) || 'Unknown';
      const year = extractYear(em.DateTimeOriginal?.value, em.Credit?.value);
      const credit = stripHtml(em.Credit?.value).slice(0, 120);
      const license = stripHtml(em.LicenseShortName?.value);

      items.push({
        id,
        source: 'wikimedia-commons',
        title: rawTitle.slice(0, 80),
        titleEn: rawTitle.slice(0, 120),
        artist: artist.slice(0, 60),
        artistEn: artist.slice(0, 60),
        year,
        category: categorizeFromText(`${rawTitle} ${desc}`, cat),
        style: 'Featured picture',
        era: year,
        region: regionFromCat(cat, `${rawTitle} ${desc}`),
        description: desc || `${rawTitle}${credit ? `，${credit}` : ''}`,
        medium: '',
        dimensions: `${ii.width}×${ii.height}`,
        imageUrl: `/images/artworks-real/full/${id}.jpg`,
        thumbUrl: `/images/artworks-real/thumb/${id}.jpg`,
        thumbW: dims.w,
        thumbH: dims.h,
        tags: [license, credit].filter(Boolean).slice(0, 3),
        publicDomain: /public domain/i.test(license),
        sourceUrl: ii.descriptionurl || '',
      });
      stats.done++;
      if (stats.done % 100 === 0) console.log(`  进度: ${stats.done}/${TARGET} (跳过 ${stats.skip}, 下载失败 ${stats.dlFail})`);
    });
    if (items.length >= TARGET) break;
  }

  // 5. 写出 JSON
  const output = {
    total: items.length,
    generatedAt: new Date().toISOString(),
    sources: { wikimediaCommons: items.length },
    items,
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(output), 'utf8');

  console.log(`\n========================================`);
  console.log(`完成! 共 ${items.length} 件真实藏品`);
  console.log(`失败: 下载 ${stats.dlFail}, 缩略图 ${stats.thumbFail}, 过滤 ${stats.skip}`);
  console.log(`数据: ${DATA_PATH}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
