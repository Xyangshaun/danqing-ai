#!/usr/bin/env node
// ============================================================
// 丹青有AI - 缩略图生成器
// 使用 sharp 将 artworks-real/full/ 下的图片生成 640x360 缩略图
// 同时将全图压缩为 1920x1080 (保持比例,不裁剪)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'full');
const THUMB_DIR = path.join(ROOT, 'public', 'images', 'artworks-real', 'thumb');

fs.mkdirSync(THUMB_DIR, { recursive: true });

async function main() {
  const sharp = (await import('sharp')).default;

  const files = fs.readdirSync(FULL_DIR).filter((f) =>
    /\.(jpg|jpeg|png|webp)$/i.test(f)
  );

  console.log(`========================================`);
  console.log(`缩略图生成: ${files.length} 个文件`);
  console.log(`========================================`);

  let okFull = 0, okThumb = 0, fail = 0;

  for (const file of files) {
    const src = path.join(FULL_DIR, file);
    const thumbDest = path.join(THUMB_DIR, file.replace(/\.(png|webp)$/i, '.jpg'));
    const fullCompressed = path.join(FULL_DIR, file.replace(/\.(png|webp)$/i, '.jpg'));

    try {
      const meta = await sharp(src).metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      console.log(`处理: ${file} (${w}x${h})`);

      // 全图:超过 1920 宽度则压缩为 1920,否则保持(转为 JPEG quality 82)
      if (w > 1920) {
        const tmp = src + '.tmp.jpg';
        await sharp(src)
          .resize({ width: 1920, withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(tmp);
        // 若原文件不是 jpg,替换之;否则覆盖
        fs.unlinkSync(src);
        fs.renameSync(tmp, fullCompressed === src ? src : fullCompressed);
        okFull++;
      } else if (!file.match(/\.(jpg|jpeg)$/i)) {
        // 非 JPEG 且无需缩小,转为 JPEG
        await sharp(src)
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(fullCompressed);
        fs.unlinkSync(src);
        okFull++;
      } else {
        // 已是合适尺寸的 JPEG,重压缩
        const tmp = src + '.tmp.jpg';
        await sharp(src)
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(tmp);
        fs.unlinkSync(src);
        fs.renameSync(tmp, src);
        okFull++;
      }

      // 缩略图:640x360 cover 居中裁剪
      await sharp(fullCompressed.match(/\.(jpg|jpeg)$/i) ? fullCompressed : src)
        .resize(640, 360, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 75, mozjpeg: true })
        .toFile(thumbDest);
      okThumb++;
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n========================================`);
  console.log(`✓ 完成!`);
  console.log(`  全图处理: ${okFull}`);
  console.log(`  缩略图生成: ${okThumb}`);
  console.log(`  失败: ${fail}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
