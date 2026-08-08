#!/usr/bin/env node
// 从 artworks.json 真实藏品生成图片搜索种子 TS 数组(一次性工具)
// 输出: scripts/_seeds.generated.ts (人工审阅后粘贴进 image-search.service.ts)
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('public/data/artworks.json', 'utf8'));
const byId = Object.fromEntries(d.items.map((i) => [i.id, i]));

// [id, 中文名, category(对齐筛选chips), artType, 中文标签]
const picks = [
  ['wm-1a089159a1', '自画像·黑背景', '素描人像', 'painting', ['素描', '人像', '自画像', '肖像', '结构']],
  ['wm-dcad2d1b84', '元太祖成吉思汗像', '素描人像', 'painting', ['人像', '肖像', '元代', '帝王', '工笔']],
  ['wm-130427ba20', '费利克斯·费内翁肖像', '素描人像', 'painting', ['人像', '点彩', '西涅克', '肖像', '色彩']],
  ['wm-bdfa9e96f2', '星月夜·梵高', '色彩理论', 'painting', ['油画', '梵高', '后印象派', '色彩', '星空']],
  ['wm-4f273f9047', '水果静物', '色彩理论', 'painting', ['静物', '水果', '色彩', '油画', '巴洛克']],
  ['wm-f422311a81', '陶罐花卉', '色彩理论', 'painting', ['静物', '花卉', '色彩', '花瓶', '写生']],
  ['wm-0962ed722b', '雾海上的漫游者', '速写风景', 'painting', ['风景', '油画', '浪漫主义', '雾', '山水']],
  ['wm-58788bb401', '布拉布兰教堂冬景', '速写风景', 'painting', ['风景', '冬景', '教堂', '速写', '雪景']],
  ['wm-38d5c57baf', '竹林大士出山图', '速写风景', 'painting', ['山水', '中国画', '竹林', '长卷', '风景']],
  ['wm-0c9d72affe', '清明上河图(清院本)', '构图法则', 'painting', ['构图', '长卷', '风俗', '中国画', '界画']],
  ['wm-141d5e4361', '肉摊与圣家族', '构图法则', 'painting', ['构图', '静物', '人物', '油画', '场景']],
  ['wm-7326bae954', '桧图屏风·狩野永德', '构图法则', 'painting', ['构图', '屏风', '日本画', '松树', '金碧']],
  ['wm-57ab24bf0f', '作画少女', '绘画基础', 'painting', ['素描', '人物', '写生', '基础', '少女']],
  ['wm-030ff41cc4', '采花', '绘画基础', 'painting', ['油画', '人物', '光影', '印象派', '写生']],
  ['wm-73f07c6cce', '孔雀与龙织锦面板', '设计构成', 'design', ['设计', '纹样', '威廉莫里斯', '图案', '装饰']],
  ['wm-23fdfd400c', '丘比特离园·比亚兹莱', '设计构成', 'design', ['设计', '插画', '黑白', '线条', '装饰']],
  ['wm-541648cb77', '歌剧服装效果图', '设计构成', 'design', ['设计', '服装', '效果图', '手绘', '水彩']],
  ['wm-02c552809c', '十竹斋书画谱页', '设计构成', 'design', ['版画', '饾版', '印刷', '中国画', '设计']],
  ['wm-56455993d3', '五彩鱼藻纹盖罐', '设计构成', 'product', ['陶瓷', '五彩', '明代', '器物', '产品']],
  ['wm-c612851da4', '狄安娜喷泉雕塑', '雕塑基础', 'sculpture', ['雕塑', '喷泉', '卢浮宫', '古典', '人体']],
  ['wm-6611394378', '天堂曲喙面具', '雕塑基础', 'sculpture', ['雕塑', '面具', '木雕', '民族', '体量']],
  ['wm-72527a4824', '海鸥少女像', '雕塑基础', 'sculpture', ['雕塑', '铜像', '少女', '纪念碑', '写实']],
];

// 保留演示角色权限过滤语义:1 条 draft + 1 条 archived
const statusOverride = {
  'wm-72527a4824': 'draft',
  'wm-6611394378': 'archived',
};

const rows = [];
for (const [id, cn, cat, art, tags] of picks) {
  const it = byId[id];
  if (!it) {
    console.error('MISSING', id);
    continue;
  }
  const m = (it.dimensions || '').match(/(\d+)\D+(\d+)/);
  const w = m ? +m[1] : 0;
  const h = m ? +m[2] : 0;
  const fp = `public/images/artworks-real/full/${id}.jpg`;
  const size = fs.existsSync(fp) ? fs.statSync(fp).size : 0;
  const enTitle = it.title.replace(/ - Google Art Project/, '').slice(0, 60);
  const enWords = it.title
    .replace(/[^\x20-\x7e]/g, ' ')
    .split(/\s+/)
    .filter((x) => x.length > 2)
    .slice(0, 4);
  rows.push({
    title: `${cn} ${enTitle}`,
    tags: [...tags, ...enWords],
    category: cat,
    artType: art,
    status: statusOverride[id] ?? 'published',
    thumbUrl: `/images/artworks-real/thumb/${id}.jpg`,
    fullUrl: `/images/artworks-real/full/${id}.jpg`,
    meta: { width: w, height: h, size },
  });
}

const ts = `const SEED_IMAGES: SeedImage[] = ${JSON.stringify(rows, null, 2)
  .replace(/"([^"]+)":/g, '$1:')
  .replace(/"/g, "'")};`;
fs.writeFileSync('scripts/_seeds.generated.ts', ts, 'utf8');
console.log('generated rows:', rows.length, '-> scripts/_seeds.generated.ts');
