#!/usr/bin/env node
// 下载 22 条种子数据对应的 Wikimedia Commons 真实图片(full 1280px + thumb 640px)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'full');
const THUMB_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'thumb');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'artworks.json'), 'utf8'));

const SEED_IDS = [
  'wm-1a089159a1','wm-dcad2d1b84','wm-130427ba20','wm-bdfa9e96f2','wm-4f273f9047',
  'wm-f422311a81','wm-0962ed722b','wm-58788bb401','wm-38d5c57baf','wm-0c9d72affe',
  'wm-141d5e4361','wm-7326bae954','wm-57ab24bf0f','wm-030ff41cc4','wm-73f07c6cce',
  'wm-23fdfd400c','wm-541648cb77','wm-02c552809c','wm-56455993d3','wm-c612851da4',
  'wm-6611394378','wm-72527a4824',
];

const byId = Object.fromEntries(DATA.items.map(i => [i.id, i]));
const UA = 'DanQingAI/1.0 (art education platform; https://www.danqing.site)';

function curl(args, destFile = null, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const finalArgs = ['-s', '-m', String(Math.ceil(timeoutMs / 1000)), '--retry', '3', '--retry-all-errors', '-A', UA, ...args];
    if (destFile) finalArgs.push('-o', destFile);
    execFile('curl.exe', finalArgs, { timeout: timeoutMs + 15000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl: ${err.message} ${stderr?.slice(0, 200) || ''}`));
      resolve(destFile ? destFile : stdout.toString('utf8'));
    });
  });
}

async function getThumbUrl(fileTitle) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&format=json&formatversion=2&titles=${encodeURIComponent(fileTitle)}`;
  const text = await curl([api]);
  const j = JSON.parse(text);
  const page = j.query?.pages?.[0];
  const ii = page?.imageinfo?.[0];
  if (!ii?.thumburl) throw new Error(`No thumburl for ${fileTitle}`);
  return { thumburl: ii.thumburl, width: ii.width, height: ii.height };
}

async function makeThumbWithSharp(fullPath, thumbPath) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(fullPath).metadata();
  const fw = meta.width || 0;
  const fh = meta.height || 0;
  if (!fw || !fh) throw new Error('no dims');
  const tw = Math.min(640, fw);
  const th = Math.round((fh * tw) / fw);
  await sharp(fullPath).resize({ width: tw, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(thumbPath);
  return { w: tw, h: th };
}

async function main() {
  fs.mkdirSync(FULL_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  let ok = 0, fail = 0;
  for (const id of SEED_IDS) {
    const item = byId[id];
    if (!item) { console.log(`MISSING  ${id}  (not in artworks.json)`); fail++; continue; }

    const fullDest = path.join(FULL_DIR, `${id}.jpg`);
    const thumbDest = path.join(THUMB_DIR, `${id}.jpg`);

    // 断点续传:已存在且 >5KB 跳过
    if (fs.existsSync(fullDest) && fs.statSync(fullDest).size > 5000) {
      console.log(`SKIP      ${id}  (already exists)`);
      ok++;
      continue;
    }

    // 从 sourceUrl 提取文件标题
    const sourceUrl = item.sourceUrl || '';
    const fileTitle = sourceUrl.split('/wiki/').pop();
    if (!fileTitle) { console.log(`NO URL    ${id}  (no sourceUrl)`); fail++; continue; }

    try {
      console.log(`FETCHING  ${id}  ${fileTitle}`);
      const { thumburl } = await getThumbUrl(fileTitle);

      // 下载 1280px 缩放图作为 full
      await curl([thumburl], fullDest, 90000);
      if (fs.statSync(fullDest).size < 5000) throw new Error('downloaded file too small');

      // 生成 640px 缩略图
      await makeThumbWithSharp(fullDest, thumbDest);

      console.log(`OK        ${id}  full=${fs.statSync(fullDest).size} thumb=${fs.statSync(thumbDest).size}`);
      ok++;
    } catch (e) {
      console.log(`FAIL      ${id}  ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} ok, ${fail} fail`);
}

main().catch(e => { console.error(e); process.exit(1); });
