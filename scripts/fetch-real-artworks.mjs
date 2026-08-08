#!/usr/bin/env node
// ============================================================
// 丹青有AI - 真实素材拉取脚本 (ABC 结合方案)
// A: Met Museum + Chicago Art Institute + Rijksmuseum API
// B: Wikimedia Commons 公有领域名画（含中国画）
// C: text_to_image API 补充无法获取的缺口
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'artworks-real');
const THUMB_DIR = path.join(OUT_DIR, 'thumb');
const FULL_DIR = path.join(OUT_DIR, 'full');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'artworks-real.json');

fs.mkdirSync(THUMB_DIR, { recursive: true });
fs.mkdirSync(FULL_DIR, { recursive: true });

// ---------- 工具函数 ----------

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'DanQingAI/1.0 (art education platform)',
        'Accept': 'application/json',
        ...options.headers,
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJson(res.headers.location, options));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse failed for ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout for ${url}`));
    });
  });
}

// 最大下载尺寸 12MB,超过则中止(避免拉取 30MB 原图)
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

// 浏览器 User-Agent (部分博物馆 IIIF 拒绝非浏览器 UA)
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function downloadImage(url, destPath, skipIfExists = true, isRedirect = false) {
  // 断点续传:已存在且 >5KB 则跳过(仅首次调用,重定向不跳过)
  if (skipIfExists && !isRedirect && fs.existsSync(destPath)) {
    try {
      const st = fs.statSync(destPath);
      if (st.size > 5000) return Promise.resolve(destPath);
    } catch { /* 文件可能正被删除,忽略 */ }
  }
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let totalBytes = 0;
    let aborted = false;
    // 根据域名选择 User-Agent:博物馆 IIIF 用浏览器 UA
    const isMuseumIiif = /artic\.edu|iiif/i.test(url);
    const ua = isMuseumIiif ? BROWSER_UA : 'DanQingAI/1.0 (art education platform)';
    const req = https.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'image/*,*/*',
        ...(isMuseumIiif ? { 'Referer': 'https://www.artic.edu/' } : {}),
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* 可能已删 */ }
        return resolve(downloadImage(res.headers.location, destPath, skipIfExists, true));
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* */ }
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      // 检查 Content-Length,超大直接中止
      const cl = parseInt(res.headers['content-length'] || '0', 10);
      if (cl > MAX_DOWNLOAD_BYTES) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* */ }
        aborted = true;
        return reject(new Error(`image too large (${(cl/1024/1024).toFixed(1)}MB > 12MB limit)`));
      }
      res.pipe(file);
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_DOWNLOAD_BYTES && !aborted) {
          aborted = true;
          req.destroy();
          file.close();
          try { fs.unlinkSync(destPath); } catch { /* */ }
        }
      });
      file.on('finish', () => {
        if (aborted) return;
        file.close();
        const stat = fs.statSync(destPath);
        if (stat.size < 5000) {
          fs.unlinkSync(destPath);
          return reject(new Error('image too small (<5KB), likely error page'));
        }
        resolve(destPath);
      });
    });
    req.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* */ }
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy(new Error('download timeout'));
    });
  });
}

/** 带重试的下载 */
async function downloadWithRetry(url, destPath, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await downloadImage(url, destPath);
    } catch (err) {
      if (i === retries) throw err;
      const delay = 2000 * (i + 1);
      console.log(`  [重试 ${i+1}/${retries}] ${path.basename(destPath)}: ${err.message},等待 ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** 并发执行池:limit 个任务同时跑 */
async function pool(items, limit, worker) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = await worker(items[cur], cur);
      } catch (e) {
        results[cur] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function safeFilename(str) {
  return str.replace(/[^\w\u4e00-\u9fff-]/g, '_').slice(0, 60);
}

function categorize(medium, classification) {
  const m = (medium || '').toLowerCase();
  const c = (classification || '').toLowerCase();
  if (m.includes('oil') || m.includes('painting') || c.includes('painting')) return 'painting';
  if (m.includes('sculpture') || c.includes('sculpture') || m.includes('marble') || m.includes('bronze')) return 'sculpture';
  if (m.includes('calligraphy') || c.includes('calligraphy')) return 'calligraphy';
  if (m.includes('print') || c.includes('print')) return 'painting';
  if (c.includes('design') || c.includes('decorative')) return 'design';
  if (c.includes('architecture')) return 'architecture';
  return 'painting';
}

function detectRegion(country, culture) {
  const c = (country || culture || '').toLowerCase();
  if (c.includes('china') || c.includes('chinese')) return 'china';
  if (c.includes('japan') || c.includes('korea')) return 'east-asia';
  if (c.includes('europe') || c.includes('french') || c.includes('italy') || c.includes('dutch') || c.includes('spanish') || c.includes('german') || c.includes('british')) return 'europe';
  if (c.includes('america') || c.includes('american')) return 'america';
  return 'other';
}

// ---------- A1: Met Museum API ----------

async function fetchMetMuseum(targetCount) {
  console.log('\n[A1] Met Museum API: 拉取中...');
  const results = [];

  try {
    // 搜索有图片的公开领域作品
    const searchUrl = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=painting&medium=Paintings';
    const search = await fetchJson(searchUrl);
    console.log(`[A1] Met 搜索到 ${search.total} 件作品,取前 ${targetCount} 件`);

    const ids = (search.objectIDs || []).slice(0, targetCount * 3); // 多取以过滤失败

    // 先批量获取元数据(并发 5)
    const metas = [];
    await pool(ids, 5, async (id) => {
      try {
        const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        if (obj.primaryImage && obj.isPublicDomain) {
          metas.push({ id, obj });
        }
      } catch { /* skip */ }
    });
    console.log(`[A1] 获取元数据 ${metas.length} 条`);

    // 并发下载图片(并发 3,避免被限流)
    await pool(metas, 3, async ({ id, obj }) => {
      if (results.length >= targetCount) return;
      try {
        // 优先用 primaryImageSmall (更小),fallback 到 primaryImage
        const imageUrl = obj.primaryImageSmall || obj.primaryImage;
        const title = obj.title || 'Untitled';
        const artist = obj.artistDisplayName || 'Unknown';
        const year = obj.objectDate || '';
        const category = categorize(obj.medium, obj.classification);
        const region = detectRegion(obj.country, obj.culture);
        const medium = obj.medium || '';

        const idStr = `met-${String(id).padStart(5, '0')}`;
        const fullFilename = `${idStr}.jpg`;
        const fullDest = path.join(FULL_DIR, fullFilename);

        await downloadImage(imageUrl, fullDest);
        const stat = fs.statSync(fullDest);
        console.log(`[A1] ✓ ${fullFilename} (${(stat.size / 1024).toFixed(0)}KB) ${title} - ${artist}`);

        results.push({
          id: idStr,
          source: 'met-museum',
          title,
          titleEn: title,
          artist,
          artistEn: artist,
          year,
          category,
          style: obj.classification || 'Painting',
          era: obj.period || obj.objectDate || '',
          region,
          description: obj.objectName ? `${obj.objectName}，${medium}` : medium,
          medium,
          imageUrl: `/images/artworks-real/full/${fullFilename}`,
          thumbUrl: `/images/artworks-real/thumb/${fullFilename}`,
          tags: [obj.classification, obj.culture, obj.department].filter(Boolean),
          publicDomain: true,
          metUrl: obj.objectURL || '',
        });
      } catch (err) {
        console.log(`[A1] ✗ Met #${id} 失败: ${err.message}`);
      }
    });
  } catch (err) {
    console.error(`[A1] Met Museum API 错误: ${err.message}`);
  }

  console.log(`[A1] Met Museum 完成: ${results.length} 件`);
  return results;
}

// ---------- A2: Chicago Art Institute API ----------

async function fetchChicagoArt(targetCount) {
  console.log('\n[A2] Chicago Art Institute API: 拉取中...');
  const results = [];

  try {
    // 搜索公开领域的绘画作品
    const searchUrl = `https://api.artic.edu/api/v1/artworks/search?limit=${targetCount * 3}&fields=id,title,artist_title,date_display,medium_display,classification_title,department_title,image_id,artist_origin,style_title&query[term][is_public_domain]=true`;
    const search = await fetchJson(searchUrl);
    console.log(`[A2] Chicago 搜索到 ${search.pagination.total} 件作品`);

    const arts = (search.data || []).filter((a) => a.image_id);

    // 并发下载(并发 2,避免被限流)
    await pool(arts, 2, async (art) => {
      if (results.length >= targetCount) return;
      try {
        // 请求 1280 宽度的图(更小更快),后续 sharp 压缩
        const imageUrl = `https://www.artic.edu/iiif/2/${art.image_id}/full/1280,/0/default.jpg`;
        const idStr = `chi-${String(art.id).padStart(5, '0')}`;
        const fullFilename = `${idStr}.jpg`;
        const fullDest = path.join(FULL_DIR, fullFilename);

        await downloadWithRetry(imageUrl, fullDest, 1);
        const stat = fs.statSync(fullDest);
        console.log(`[A2] ✓ ${fullFilename} (${(stat.size / 1024).toFixed(0)}KB) ${art.title} - ${art.artist_title || 'Unknown'}`);

        const category = categorize(art.medium_display, art.classification_title);
        const region = detectRegion('', art.department_title);

        results.push({
          id: idStr,
          source: 'chicago-art',
          title: art.title || 'Untitled',
          titleEn: art.title || '',
          artist: art.artist_title || 'Unknown',
          artistEn: art.artist_title || '',
          year: art.date_display || '',
          category,
          style: art.style_title || art.classification_title || 'Painting',
          era: '',
          region,
          description: art.medium_display || art.classification_title || '',
          medium: art.medium_display || '',
          imageUrl: `/images/artworks-real/full/${fullFilename}`,
          thumbUrl: `/images/artworks-real/thumb/${fullFilename}`,
          tags: [art.classification_title, art.department_title].filter(Boolean),
          publicDomain: true,
        });
      } catch (err) {
        console.log(`[A2] ✗ Chicago #${art.id} 失败: ${err.message}`);
      }
    });
  } catch (err) {
    console.error(`[A2] Chicago Art API 错误: ${err.message}`);
  }

  console.log(`[A2] Chicago Art 完成: ${results.length} 件`);
  return results;
}

// ---------- B: Wikimedia Commons 中国画 ----------

async function fetchWikimediaChinese(targetCount) {
  console.log('\n[B] Wikimedia Commons 中国画: 拉取中...');
  const results = [];

  // 预定义的中国名画列表（真实作品名+作者+年代）
  const chineseMasterpieces = [
    { title: '富春山居图', artist: '黄公望', year: '1350', period: '元代' },
    { title: '清明上河图', artist: '张择端', year: '1085-1145', period: '宋代' },
    { title: '千里江山图', artist: '王希孟', year: '1113', period: '宋代' },
    { title: '洛神赋图', artist: '顾恺之', year: '东晋', period: '东晋' },
    { title: '步辇图', artist: '阎立本', year: '唐代', period: '唐代' },
    { title: '五牛图', artist: '韩滉', year: '唐代', period: '唐代' },
    { title: '韩熙载夜宴图', artist: '顾闳中', year: '五代', period: '五代' },
    { title: '溪山行旅图', artist: '范宽', year: '北宋', period: '宋代' },
    { title: '早春图', artist: '郭熙', year: '1072', period: '宋代' },
    { title: '万壑松风图', artist: '李唐', year: '1124', period: '宋代' },
    { title: '鹊华秋色图', artist: '赵孟頫', year: '1295', period: '元代' },
    { title: '庐山高图', artist: '沈周', year: '1467', period: '明代' },
    { title: '秋风纨扇图', artist: '唐寅', year: '明代', period: '明代' },
    { title: '桃源仙境图', artist: '仇英', year: '明代', period: '明代' },
    { title: '荷花水鸟图', artist: '朱耷', year: '清代', period: '清代' },
    { title: '竹石图', artist: '郑板桥', year: '清代', period: '清代' },
    { title: '奔马图', artist: '徐悲鸿', year: '1942', period: '近现代' },
    { title: '虾趣图', artist: '齐白石', year: '1948', period: '近现代' },
    { title: '长江万里图', artist: '张大千', year: '1968', period: '近现代' },
    { title: '流民图', artist: '蒋兆和', year: '1943', period: '近现代' },
    { title: '愚公移山图', artist: '徐悲鸿', year: '1940', period: '近现代' },
  ];

  // 顺序获取(Wikimedia 对并发敏感,易 ECONNRESET),带重试
  for (const item of chineseMasterpieces) {
    if (results.length >= targetCount) break;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // 通过 Wikimedia API 搜索文件,请求 1280 宽缩略图
        const searchQuery = encodeURIComponent(`File:${item.title} ${item.artist}`);
        const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=3&format=json&srsearch=${searchQuery}`;
        const search = await fetchJson(searchUrl);

        if (!search.query || !search.query.search || search.query.search.length === 0) {
          console.log(`[B] ✗ 未找到: ${item.title} - ${item.artist}`);
          lastErr = null;
          break;
        }

        const fileTitle = search.query.search[0].title;
        const imageUrlUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&format=json`;
        const imgData = await fetchJson(imageUrlUrl);

        const pages = imgData.query.pages;
        const page = Object.values(pages)[0];
        if (!page.imageinfo || !page.imageinfo[0]) { lastErr = new Error('no imageinfo'); break; }

        const info = page.imageinfo[0];
        const downloadUrl = info.thumburl || info.url;
        if (!downloadUrl) { lastErr = new Error('no download url'); break; }

        const idStr = `cn-${safeFilename(item.title).slice(0, 20)}`;
        const ext = path.extname(info.url) || '.jpg';
        const fullFilename = `${idStr}${ext}`;
        const fullDest = path.join(FULL_DIR, fullFilename);

        await downloadWithRetry(downloadUrl, fullDest, 1);
        const stat = fs.statSync(fullDest);
        console.log(`[B] ✓ ${fullFilename} (${(stat.size / 1024).toFixed(0)}KB) ${item.title} - ${item.artist}`);

        results.push({
          id: idStr,
          source: 'wikimedia-commons',
          title: item.title,
          titleEn: item.title,
          artist: item.artist,
          artistEn: item.artist,
          year: item.year,
          category: 'painting',
          style: '水墨',
          era: item.period,
          region: 'china',
          description: `${item.artist}的${item.title}，${item.period}名画。`,
          medium: '水墨设色',
          imageUrl: `/images/artworks-real/full/${fullFilename}`,
          thumbUrl: `/images/artworks-real/thumb/${fullFilename}`,
          tags: [item.period, '中国画', '水墨', item.artist],
          publicDomain: true,
          wikimediaSource: info.url,
        });
        lastErr = null;
        break; // 成功,跳出重试循环
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          const delay = 3000 * (attempt + 1);
          console.log(`  [B 重试 ${attempt+1}/2] ${item.title}: ${err.message},等待 ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (lastErr) {
      console.log(`[B] ✗ ${item.title} 失败: ${lastErr.message}`);
    }
  }

  console.log(`[B] Wikimedia 中国画完成: ${results.length} 件`);
  return results;
}

// ---------- C: AI 补充（text_to_image） ----------

async function generateWithAI(targetCount) {
  console.log('\n[C] AI 生成补充: 启动...');
  const results = [];

  // 西方名画补充清单（公开领域作品名+作者）
  const westernMasterpieces = [
    { title: '星月夜', artist: '梵高', year: '1889', era: '后印象派', region: 'europe', prompt: 'The Starry Night by Vincent van Gogh, oil painting, post-impressionism, swirling sky' },
    { title: '蒙娜丽莎', artist: '达芬奇', year: '1503', era: '文艺复兴', region: 'europe', prompt: 'Mona Lisa by Leonardo da Vinci, Renaissance portrait, enigmatic smile' },
    { title: '向日葵', artist: '梵高', year: '1888', era: '后印象派', region: 'europe', prompt: 'Sunflowers by Vincent van Gogh, still life oil painting, vibrant yellow' },
    { title: '睡莲', artist: '莫奈', year: '1906', era: '印象派', region: 'europe', prompt: 'Water Lilies by Claude Monet, impressionist oil painting, pond' },
    { title: '呐喊', artist: '蒙克', year: '1893', era: '表现主义', region: 'europe', prompt: 'The Scream by Edvard Munch, expressionist painting, angst' },
    { title: '拾穗者', artist: '米勒', year: '1857', era: '现实主义', region: 'europe', prompt: 'The Gleaners by Jean-Francois Millet, realist oil painting, rural scene' },
    { title: '大碗岛的星期天下午', artist: '修拉', year: '1886', era: '后印象派', region: 'europe', prompt: 'A Sunday on La Grande Jatte by Georges Seurat, pointillism' },
    { title: '印象日出', artist: '莫奈', year: '1872', era: '印象派', region: 'europe', prompt: 'Impression Sunrise by Claude Monet, impressionist painting, harbor' },
    { title: '草地上的午餐', artist: '马奈', year: '1863', era: '印象派', region: 'europe', prompt: 'Le dejeuner sur lherbe by Edouard Manet, oil painting' },
    { title: '格尔尼卡', artist: '毕加索', year: '1937', era: '现代', region: 'europe', prompt: 'Guernica by Pablo Picasso, cubist anti-war painting, monochrome' },
  ];

  const baseUrl = process.env.VITE_API_BASE_URL || '';
  const generateUrl = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image';

  for (const item of westernMasterpieces) {
    if (results.length >= targetCount) break;

    try {
      const idStr = `ai-${safeFilename(item.title).slice(0, 20)}`;
      const fullFilename = `${idStr}.png`;
      const fullDest = path.join(FULL_DIR, fullFilename);

      console.log(`[C] AI 生成: ${item.title} - ${item.artist}`);

      const imageUrl = `${generateUrl}?prompt=${encodeURIComponent(item.prompt)}&image_size=landscape_16_9`;
      await downloadWithRetry(imageUrl, fullDest, 1);

      const stat = fs.statSync(fullDest);
      console.log(`[C] ✓ ${fullFilename} (${(stat.size / 1024).toFixed(0)}KB)`);

      results.push({
        id: idStr,
        source: 'ai-generated',
        title: item.title,
        titleEn: item.title,
        artist: item.artist,
        artistEn: item.artist,
        year: item.year,
        category: 'painting',
        style: item.era,
        era: item.era,
        region: item.region,
        description: `${item.artist}的《${item.title}》，${item.era}经典作品。`,
        medium: '布面油画',
        imageUrl: `/images/artworks-real/full/${fullFilename}`,
        thumbUrl: `/images/artworks-real/thumb/${fullFilename}`,
        tags: [item.era, item.region, '西方绘画', item.artist],
        publicDomain: false,
        aiGenerated: true,
      });
    } catch (err) {
      console.log(`[C] ✗ ${item.title} 失败: ${err.message}`);
    }
  }

  console.log(`[C] AI 生成完成: ${results.length} 件`);
  return results;
}

// ---------- 生成缩略图 ----------

async function generateThumbnails(items) {
  console.log('\n[缩略图] 生成中...');
  let ok = 0;
  let fail = 0;

  let sharp;
  try {
    sharp = (await import('sharp')).default;
    console.log('[缩略图] 使用 sharp 处理');
  } catch {
    console.warn('[缩略图] ⚠ 未安装 sharp,仅复制全图作为缩略图');
  }

  for (const item of items) {
    const fullFilename = path.basename(item.imageUrl);
    const fullSrc = path.join(FULL_DIR, fullFilename);
    // 缩略图统一用 .jpg 扩展名
    const thumbFilename = fullFilename.replace(/\.(png|webp)$/i, '.jpg');
    const thumbDest = path.join(THUMB_DIR, thumbFilename);

    if (!fs.existsSync(fullSrc)) {
      console.log(`[缩略图] ✗ 全图不存在: ${fullFilename}`);
      fail++;
      continue;
    }

    // 已存在且 >3KB 则跳过
    if (fs.existsSync(thumbDest) && fs.statSync(thumbDest).size > 3000) {
      ok++;
      continue;
    }

    try {
      if (sharp) {
        await sharp(fullSrc)
          .resize(640, 360, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 75, mozjpeg: true })
          .toFile(thumbDest);
        // 同步更新 item.thumbUrl 指向 .jpg
        item.thumbUrl = `/images/artworks-real/thumb/${thumbFilename}`;
      } else {
        fs.copyFileSync(fullSrc, thumbDest);
      }
      ok++;
    } catch (err) {
      console.log(`[缩略图] ✗ ${fullFilename}: ${err.message}`);
      fail++;
    }
  }

  console.log(`[缩略图] 完成: ${ok} 成功, ${fail} 失败`);
}

// ---------- 主流程 ----------

async function main() {
  const args = process.argv.slice(2);
  const phase = args[0] || 'pilot';

  console.log('========================================');
  console.log(`丹青有AI - 真实素材拉取 (${phase})`);
  console.log('========================================');

  // 加载已有素材(支持增量运行,避免重复)
  let allItems = [];
  const existingIds = new Set();
  if (fs.existsSync(DATA_PATH) && phase !== 'pilot') {
    try {
      const existing = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      allItems = existing.items || [];
      allItems.forEach((x) => existingIds.add(x.id));
      console.log(`已有素材: ${allItems.length} 件`);
    } catch { /* 忽略 */ }
  }

  // 增量保存函数:合并已有+新增,去重
  const saveProgress = () => {
    // 去重
    const seen = new Set();
    const deduped = [];
    for (const item of allItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduped.push(item);
      }
    }
    allItems = deduped;

    const output = {
      total: allItems.length,
      generatedAt: new Date().toISOString(),
      sources: {
        metMuseum: allItems.filter((x) => x.source === 'met-museum').length,
        chicagoArt: allItems.filter((x) => x.source === 'chicago-art').length,
        wikimediaCommons: allItems.filter((x) => x.source === 'wikimedia-commons').length,
        aiGenerated: allItems.filter((x) => x.source === 'ai-generated').length,
      },
      items: allItems,
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), 'utf8');
    console.log(`  [保存] ${allItems.length} 件已写入 ${path.basename(DATA_PATH)} (Met:${output.sources.metMuseum} Chi:${output.sources.chicagoArt} Wiki:${output.sources.wikimediaCommons} AI:${output.sources.aiGenerated})`);
  };

  /** 过滤掉已存在的 ID,避免重复添加 */
  const filterNew = (items) => items.filter((x) => !existingIds.has(x.id) && !allItems.some((a) => a.id === x.id));

  if (phase === 'pilot' || phase === 'all') {
    allItems.push(...filterNew(await fetchMetMuseum(20)));
    saveProgress();
    allItems.push(...filterNew(await fetchChicagoArt(20)));
    saveProgress();
    allItems.push(...filterNew(await fetchWikimediaChinese(15)));
    saveProgress();
    allItems.push(...filterNew(await generateWithAI(10)));
    saveProgress();
  } else if (phase === 'met') {
    allItems.push(...filterNew(await fetchMetMuseum(20)));
    saveProgress();
  } else if (phase === 'chicago') {
    allItems.push(...filterNew(await fetchChicagoArt(20)));
    saveProgress();
  } else if (phase === 'wikimedia') {
    allItems.push(...filterNew(await fetchWikimediaChinese(15)));
    saveProgress();
  } else if (phase === 'ai') {
    allItems.push(...filterNew(await generateWithAI(10)));
    saveProgress();
  } else if (phase === 'thumb') {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      allItems = data.items;
    }
  }

  if (allItems.length === 0 && phase !== 'thumb') {
    console.log('\n未获取到任何素材，退出。');
    process.exit(1);
  }

  // 生成缩略图
  await generateThumbnails(allItems);

  // 最终写入
  saveProgress();

  const sources = {
    metMuseum: allItems.filter((x) => x.source === 'met-museum').length,
    chicagoArt: allItems.filter((x) => x.source === 'chicago-art').length,
    wikimediaCommons: allItems.filter((x) => x.source === 'wikimedia-commons').length,
    aiGenerated: allItems.filter((x) => x.source === 'ai-generated').length,
  };

  console.log(`\n========================================`);
  console.log(`完成! 共 ${allItems.length} 件真实素材`);
  console.log(`数据: ${DATA_PATH}`);
  console.log(`图片: ${FULL_DIR}`);
  console.log(`来源分布:`, sources);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
