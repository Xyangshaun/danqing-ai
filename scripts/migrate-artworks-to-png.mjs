/**
 * 一次性迁移脚本(2026-08-08):artworks.json 图片字段指向已生成的 PNG
 * ----------------------------------------------------------------
 * 背景:
 *   9999 条素材的 imageUrl 原为 __ARTWORK_IMAGE__:seed 协议,前端运行时
 *   生成 SVG data URI。但 public/images/artworks/{full,thumb}/ 下已有
 *   对应 PNG(脚本事先生成,full 1920x1080 / thumb 640x360),且服务器
 *   已部署全套文件。迁移后浏览器直接加载 PNG,享受 HTTP 缓存。
 *
 * 迁移规则:
 *   imageUrl: __ARTWORK_IMAGE__:seed -> /images/artworks/full/{id}.png
 *   thumbUrl: (不存在)              -> /images/artworks/thumb/{id}.png
 *   真实作品(31 条 /images/ 路径)保持不变。
 *
 * 安全:
 *   - 迁移前自动备份原文件到 backup/artworks-json/
 *   - 每条迁移前验证本地 PNG 文件存在,缺失即报错中止
 *
 * 用法: node scripts/migrate-artworks-to-png.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'public', 'data', 'artworks.json');
const backupDir = path.join(root, 'backup', 'artworks-json');

const PROTOCOL_PREFIX = '__ARTWORK_IMAGE__:';

function main() {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const items = data.items;
  if (!Array.isArray(items)) throw new Error('artworks.json 缺少 items 数组');

  // 先全量校验,再写入,避免半成品
  const toMigrate = items.filter((it) => String(it.imageUrl || '').startsWith(PROTOCOL_PREFIX));
  console.log(`总条目 ${items.length},待迁移 ${toMigrate.length}`);

  const missing = [];
  for (const it of toMigrate) {
    const full = path.join(root, 'public', 'images', 'artworks', 'full', `${it.id}.png`);
    const thumb = path.join(root, 'public', 'images', 'artworks', 'thumb', `${it.id}.png`);
    if (!fs.existsSync(full)) missing.push(`full/${it.id}.png`);
    if (!fs.existsSync(thumb)) missing.push(`thumb/${it.id}.png`);
  }
  if (missing.length > 0) {
    console.error(`校验失败:${missing.length} 个 PNG 缺失,前 10 个:`);
    missing.slice(0, 10).forEach((m) => console.error(`  ${m}`));
    process.exit(1);
  }

  // 备份
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `artworks.json.bak-${ts}`);
  fs.copyFileSync(jsonPath, backupPath);
  console.log(`已备份: ${path.relative(root, backupPath)}`);

  // 迁移
  for (const it of toMigrate) {
    it.imageUrl = `/images/artworks/full/${it.id}.png`;
    it.thumbUrl = `/images/artworks/thumb/${it.id}.png`;
  }

  const out = JSON.stringify(data);
  fs.writeFileSync(jsonPath, out, 'utf8');
  console.log(`迁移完成:${toMigrate.length} 条已改写,新文件 ${(out.length / 1024 / 1024).toFixed(2)}MB`);
}

main();
