#!/usr/bin/env node
// ============================================================
// 丹青有AI - 中国非物质文化遗产作品批量拉取
//
// 数据源:Wikimedia Commons 公有领域/自由版权图片
//   - 剪纸、京剧脸谱、皮影、刺绣、陶瓷、木版年画、风筝
//   - 景泰蓝、漆器、泥塑、唐卡、竹编、鼻烟壶、油纸伞、扇艺
//
// 实现:
//   - 所有 HTTP 走 curl.exe 子进程(本机 Node 直连 TLS 不稳定)
//   - 元数据 50 条/批,下载 1280px 缩放图作为 full,sharp 生成 640 保比例缩略图
//   - 断点续跑:图片已存在跳过;JSON 幂等重写
//   - 输出: scripts/heritage-tmp/full/*.jpg + thumb/*.jpg + public/data/heritage-bulk.json
//
// 用法: node scripts/fetch-heritage.mjs [targetCount]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(ROOT, 'scripts', 'heritage-tmp');
const FULL_DIR = path.join(TMP_DIR, 'full');
const THUMB_DIR = path.join(TMP_DIR, 'thumb');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'heritage-bulk.json');

const TARGET = Number(process.argv[2] || 99);
const UA = 'DanQingAI/1.0 (art education platform; https://www.danqing.site)';
const API = 'https://commons.wikimedia.org/w/api.php';

fs.mkdirSync(FULL_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

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

// ---------- 非遗分类映射 ----------
// 每个分类对应一种非遗工艺类型(Wikimedia Commons 分类名 -> 中文风格名)
const HERITAGE_CATEGORIES = [
  { cat: 'Category:Chinese paper cutting', style: '剪纸', cap: 12 },
  { cat: 'Category:Peking Opera', style: '京剧脸谱', cap: 12 },
  { cat: 'Category:Shadow puppets', style: '皮影', cap: 12 },
  { cat: 'Category:Chinese embroidery', style: '刺绣', cap: 10 },
  { cat: 'Category:Blue and white porcelain of China', style: '陶瓷', cap: 12 },
  { cat: 'Category:Nianhua', style: '木版年画', cap: 10 },
  { cat: 'Category:Cloisonné', style: '景泰蓝', cap: 8 },
  { cat: 'Category:Carved lacquer from China', style: '漆器', cap: 8 },
  { cat: 'Category:Huishan Clay Figurines', style: '泥塑', cap: 6 },
  { cat: 'Category:Thangka', style: '唐卡', cap: 10 },
  { cat: 'Category:Snuff bottles', style: '鼻烟壶', cap: 8 },
  { cat: 'Category:Oil-paper umbrellas', style: '油纸伞', cap: 6 },
  { cat: 'Category:Chinese fans', style: '扇艺', cap: 8 },
  { cat: 'Category:Chinese knots', style: '中国结', cap: 6 },
  { cat: 'Category:Weifang World Kite Museum', style: '风筝', cap: 6 },
];

// ---------- 非遗作品中文介绍模板 ----------
const HERITAGE_DESCRIPTIONS = {
  '剪纸': '中国剪纸是用剪刀或刻刀在纸上剪刻花纹的传统装饰艺术，用于节庆装点与民俗仪式，距今已有一千五百余年历史。',
  '京剧脸谱': '京剧脸谱是中国戏曲中独特的面部化妆艺术，以夸张的色彩与图案表现人物性格与忠奸善恶，是京剧视觉符号的核心。',
  '皮影': '皮影戏是一种以兽皮或纸板剪刻人物、借灯光投影于幕布表演的民间戏剧形式，被誉为"电影的祖先"，流传已近两千年。',
  '刺绣': '中国刺绣是以针引线在织物上绣制图案的装饰工艺，四大名绣（苏绣、湘绣、粤绣、蜀绣）各具特色，是传统女红的最高体现。',
  '陶瓷': '中国陶瓷以青花瓷为代表，钴料绘制于坯体施釉高温烧成，蓝白相映、纹饰精美，是中华文明最具代表性的器物艺术之一。',
  '木版年画': '木版年画是春节期间张贴的民间版画，以木版套色印刷，题材含门神、灶王、戏曲故事与吉祥图案，色彩浓艳、线条粗犷。',
  '风筝': '中国风筝源自春秋时期，以竹篾为骨、纸绢为面，扎糊绘放四艺兼备，潍坊与北京风筝最为知名，兼具玩具与工艺品之妙。',
  '景泰蓝': '景泰蓝学名铜胎掐丝珐琅，以铜为胎、掐铜丝为纹、填珐琅釉烧制打磨而成，因明代景泰年间盛行且釉色多蓝而得名。',
  '漆器': '中国漆器是以天然生漆涂覆器物表面的传统工艺，兼具防腐与装饰功能，雕漆、螺钿、戗金等技法造就了深厚的漆文化传统。',
  '泥塑': '泥塑是以黏土捏塑成型、彩绘装饰的民间雕塑艺术，天津泥人张、无锡惠山泥人最为著名，题材多取戏曲人物与民俗生活。',
  '唐卡': '唐卡是藏族宗教卷轴画，以彩缎装裱、矿物颜料绘制，题材为佛尊、坛城与高僧传记，是藏传佛教最重要的视觉修行媒介。',
  '鼻烟壶': '鼻烟壶是盛放鼻烟的便携小壶，以玻璃、玉、瓷、玛瑙等材质制作，内画壶以弯笔反向作画于壶内壁，堪称方寸之间的微缩艺术。',
  '油纸伞': '油纸伞以竹为骨、皮纸为面、涂桐油防水，是江南水乡与客家婚俗中的标志性器物，伞面彩绘花鸟山水，兼具实用与审美。',
  '扇艺': '中国扇文化源远流长，折扇与团扇并称双绝，扇骨以竹木牙角精雕，扇面以书画点染，集雕刻、绘画、书法于一体的文房雅器。',
  '竹编': '竹编是将竹材劈成篾丝后编织器物的传统手工艺，东阳竹编与瓷胎竹编最为精绝，器物细密如绸、造型灵动，体现竹文化精髓。',
};

function extractYear(dateStr, creditStr) {
  const s = `${dateStr || ''} ${creditStr || ''}`;
  const m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? m[1] : '';
}

/** 根据年份推断时代 */
function eraFromYear(year) {
  const y = parseInt(year, 10);
  if (!y) return '清代';
  if (y < 1644) return '明代';
  if (y < 1912) return '清代';
  if (y < 1949) return '民国';
  if (y < 2000) return '近现代';
  return '当代';
}

// ---------- 收集文件标题 ----------
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

// ---------- 批量元数据 ----------
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
  console.log(`\n=== 非遗作品拉取: 目标 ${TARGET} 件 ===`);

  console.log('收集分类文件清单...');
  const allFiles = [];
  for (const { cat, style, cap } of HERITAGE_CATEGORIES) {
    try {
      const files = await collectFiles(cat, cap);
      for (const f of files) allFiles.push({ title: f, cat, style });
      console.log(`  ${style} (${cat}): ${files.length} 个文件`);
    } catch (e) {
      console.log(`  ${cat} 失败: ${e.message}`);
    }
  }
  // 按 title 去重
  const seen = new Set();
  const queue = allFiles.filter((f) => (seen.has(f.title) ? false : (seen.add(f.title), true)));
  console.log(`  候选文件(去重后): ${queue.length} 个`);

  const items = [];
  const stats = { meta: 0, skip: 0, dlFail: 0, thumbFail: 0, done: 0 };
  const idOf = (title) => `hr-${crypto.createHash('sha1').update(title).digest('hex').slice(0, 10)}`;

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
    const styleOf = new Map(batch.map((b) => [b.title, b.style]));

    // 过滤有效条目
    const valid = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !ii.thumburl) { stats.skip++; continue; }
      if (!['image/jpeg', 'image/png'].includes(ii.mime)) { stats.skip++; continue; }
      if ((ii.width || 0) < 500) { stats.skip++; continue; }
      valid.push({ p, ii, style: styleOf.get(p.title) || '民间艺术' });
    }
    stats.meta += valid.length;

    // 并发下载(6)
    await pool(valid, 6, async ({ p, ii, style }) => {
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
      const descRaw = stripHtml(em.ImageDescription?.value);
      const desc = descRaw.split(/\s(?:title|label)\s+QS:/)[0].trim().slice(0, 300);
      const artist = stripHtml(em.Artist?.value) || '佚名';
      const year = extractYear(em.DateTimeOriginal?.value, em.Credit?.value);
      const credit = stripHtml(em.Credit?.value).slice(0, 120);
      const license = stripHtml(em.LicenseShortName?.value);

      const description = HERITAGE_DESCRIPTIONS[style] || '中国非物质文化遗产传统工艺作品，凝聚了世代匠人的智慧与技艺。';

      items.push({
        id,
        source: 'wikimedia-commons',
        title: rawTitle.slice(0, 80),
        titleEn: rawTitle.slice(0, 120),
        artist: artist.slice(0, 60),
        artistEn: artist.slice(0, 60),
        year: year || '传统',
        category: 'heritage',
        style,
        era: eraFromYear(year),
        region: 'china',
        description,
        medium: '',
        dimensions: `${ii.width}×${ii.height}`,
        imageUrl: `/uploads/heritage/full/${id}.jpg`,
        thumbUrl: `/uploads/heritage/thumb/${id}.jpg`,
        thumbW: dims.w,
        thumbH: dims.h,
        tags: [style, '非物质文化遗产', license || 'Public domain', '中国传统工艺'].filter(Boolean).slice(0, 4),
        publicDomain: /public domain|cc|gfdl/i.test(license),
        sourceUrl: ii.descriptionurl || '',
      });
      stats.done++;
      if (stats.done % 20 === 0) console.log(`  进度: ${stats.done}/${TARGET} (跳过 ${stats.skip}, 下载失败 ${stats.dlFail})`);
    });
    if (items.length >= TARGET) break;
  }

  // 选取第一张高质量图片作为封面(hr-cover.jpg)
  if (items.length > 0) {
    const coverSrc = path.join(FULL_DIR, `${items[0].id}.jpg`);
    const coverThumbSrc = path.join(THUMB_DIR, `${items[0].id}.jpg`);
    const coverDest = path.join(FULL_DIR, 'hr-cover.jpg');
    const coverThumbDest = path.join(THUMB_DIR, 'hr-cover.jpg');
    if (fs.existsSync(coverSrc)) {
      fs.copyFileSync(coverSrc, coverDest);
      fs.copyFileSync(coverThumbSrc, coverThumbDest);
      console.log(`  封面图: hr-cover.jpg (源自 ${items[0].id})`);
    }
  }

  // 写出 JSON
  const output = {
    total: items.length,
    generatedAt: new Date().toISOString(),
    source: 'wikimedia-commons',
    items,
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n========================================`);
  console.log(`完成! 共 ${items.length} 件非遗作品`);
  console.log(`失败: 下载 ${stats.dlFail}, 缩略图 ${stats.thumbFail}, 过滤 ${stats.skip}`);
  console.log(`图片: ${FULL_DIR}`);
  console.log(`数据: ${DATA_PATH}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
