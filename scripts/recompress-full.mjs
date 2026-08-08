#!/usr/bin/env node
// 批量再压缩 artworks-real/full 下 >300KB 的 JPG:q80 mozjpeg,尺寸不变
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'full');

async function main() {
  const sharp = (await import('sharp')).default;
  const files = fs.readdirSync(FULL_DIR).filter((f) => f.endsWith('.jpg'));
  let done = 0, skipped = 0, saved = 0;
  for (const f of files) {
    const p = path.join(FULL_DIR, f);
    const size = fs.statSync(p).size;
    if (size <= 300 * 1024) { skipped++; continue; }
    const tmp = p + '.tmp.jpg';
    try {
      await sharp(p).jpeg({ quality: 80, mozjpeg: true }).toFile(tmp);
      const newSize = fs.statSync(tmp).size;
      if (newSize < size) {
        fs.unlinkSync(p);
        fs.renameSync(tmp, p);
        saved += size - newSize;
      } else {
        fs.unlinkSync(tmp);
      }
      done++;
      if (done % 200 === 0) console.log(`进度: ${done}, 已省 ${(saved / 1048576).toFixed(0)}MB`);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* */ }
      console.log(`失败 ${f}: ${e.message}`);
    }
  }
  console.log(`完成: 压缩 ${done}, 跳过 ${skipped}, 节省 ${(saved / 1048576).toFixed(1)}MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
