#!/usr/bin/env node
// ============================================================
// 丹青有AI - 合并非遗作品到主素材库
//
// 1. 读取 public/data/heritage-bulk.json (非遗作品)
// 2. 取前 99 条,合并到 public/data/artworks.json 的 items 数组末尾
// 3. 更新 total 计数
// 4. 备份原文件
//
// 用法: node scripts/merge-heritage.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN_JSON = path.join(ROOT, 'public', 'data', 'artworks.json');
const HERITAGE_JSON = path.join(ROOT, 'public', 'data', 'heritage-bulk.json');
const TARGET_HERITAGE = 99;

function main() {
  const main = JSON.parse(fs.readFileSync(MAIN_JSON, 'utf8'));
  const mainItems = main.items || main;
  const heritage = JSON.parse(fs.readFileSync(HERITAGE_JSON, 'utf8'));

  console.log(`主库: ${mainItems.length} 条, 非遗: ${heritage.items.length} 条`);

  // 取前 99 条非遗作品
  const heritageItems = heritage.items.slice(0, TARGET_HERITAGE);
  console.log(`取非遗前 ${heritageItems.length} 条`);

  // 去重:过滤掉主库中已存在的 id
  const existingIds = new Set(mainItems.map((i) => i.id));
  const newHeritage = heritageItems.filter((i) => !existingIds.has(i.id));
  console.log(`去重后新增: ${newHeritage.length} 条`);

  // 合并:非遗作品追加到末尾
  const merged = [...mainItems, ...newHeritage];

  // 备份原文件
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const backup = MAIN_JSON + `.bak-${stamp}`;
  fs.copyFileSync(MAIN_JSON, backup);
  console.log(`备份: ${path.basename(backup)}`);

  // 写出
  const total = merged.length;
  fs.writeFileSync(
    MAIN_JSON,
    JSON.stringify({ total, generatedAt: new Date().toISOString(), items: merged }),
    'utf8'
  );

  const heritageCount = merged.filter((i) => i.category === 'heritage').length;
  console.log(`\n完成! 共 ${total} 条 (非遗 ${heritageCount} 条)`);
  console.log(`文件: ${MAIN_JSON} (${(fs.statSync(MAIN_JSON).size / 1048576).toFixed(1)}MB)`);
}

main();
