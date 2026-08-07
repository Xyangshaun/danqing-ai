/**
 * 素材库 9999 条数据生成器
 * 输出: public/data/artworks.json
 *
 * 设计目标:
 *   1. 生成 9999 条结构完整的艺术作品元数据
 *   2. 覆盖绘画/设计/产品/雕塑/书法/建筑六大类
 *   3. 标题、艺术家、描述均由模板组合生成,避免重复感
 *   4. 不预生成图片文件,图片 URL 由前端 artworkImage 按 seed 实时生成
 *   5. 生成倒排索引文件 public/data/artworks.index.json,加速前端搜索
 */
const fs = require('fs');
const path = require('path');

const TOTAL = 9999;
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'artworks.json');
const META_FILE = path.join(OUT_DIR, 'artworks.meta.json');

const CATEGORIES = ['painting', 'design', 'product', 'sculpture', 'calligraphy', 'architecture'];

const CONFIG = {
  painting: {
    styles: ['水墨', '工笔', '写意', '青绿', '金碧', '没骨', '泼彩', '油画', '水彩', '素描', '版画', '壁画'],
    eras: ['唐代', '宋代', '元代', '明代', '清代', '近现代', '文艺复兴', '巴洛克', '印象派', '现代主义', '浪漫主义', '后印象派', '超现实主义'],
    subjects: ['山水', '花鸟', '人物', '仕女', '宗教', '历史', '风俗', '静物', '肖像', '抽象', '风景', '神话'],
    mediums: ['绢本设色', '纸本水墨', '纸本设色', '画布油画', '画布蛋彩', '木版画', '湿壁画', '干壁画', '水彩纸本'],
    titleTemplates: [
      '{subject}{suffix}', '{era}{subject}图', '{style}{subject}', '{subject}册页', '{subject}长卷',
      '{subject}小景', '{subject}意趣', '{style}小品·{subject}', '{subject}杂咏', '{subject}清赏'
    ],
    titleSuffixes: ['图', '轴', '卷', '册', '屏', '品', '趣', '韵', '吟', '赋'],
    artists: [
      '王希孟', '黄公望', '范宽', '郭熙', '李唐', '徐渭', '齐白石', '韩滉', '赵佶', '黄筌',
      '周昉', '张择端', '顾闳中', '阎立本', '顾恺之', '沈周', '吴镇', '王蒙', '崔白', '张萱',
      '吴道子', '展子虔', '陈洪绶', '张大千', '傅抱石', '吴冠中', '徐悲鸿', '达·芬奇', '米开朗基罗',
      '拉斐尔', '波提切利', '莫奈', '梵高', '蒙克', '伦勃朗', '维米尔', '委拉斯开兹', '葛饰北斋',
      '歌川广重', '德拉克洛瓦', '籍里柯', '康定斯基', '蒙德里安', '毕加索', '克里姆特', '马奈', '雷诺阿'
    ],
    descTemplates: [
      '一幅{style}{subject}作品,体现了{era}艺术的独特气质。',
      '此作以{style}手法描绘{subject},笔墨精妙,意境深远。',
      '{era}{subject}题材的代表性作品,展现了艺术家对自然与人文的深刻理解。',
      '画面以{subject}为核心,运用{style}技法,呈现出沉静而有力的视觉节奏。',
      '这件{style}作品聚焦{subject},在{era}艺术语境中具有鲜明个性。'
    ]
  },
  design: {
    styles: ['极简主义', '包豪斯', '装饰艺术', '新艺术运动', '后现代', '数字艺术', '波普艺术', '瑞士风格', '解构主义'],
    eras: ['20世纪初', '二战时期', '战后', '当代', '数字时代'],
    subjects: ['海报', '书籍装帧', '字体设计', '品牌标识', '包装设计', 'UI界面', '展览视觉', '唱片封面', '广告招贴'],
    mediums: ['平版印刷', '丝网印刷', '数字输出', '胶印', '综合材料'],
    titleTemplates: [
      '{subject}设计·{style}', '{era}{subject}', '{style}{subject}方案', '{subject}概念稿',
      '{subject}视觉系统', '{style}风格{subject}', '{subject}再设计', '{subject}实验'
    ],
    titleSuffixes: [''],
    artists: [
      '里特维尔德', '密斯·凡·德·罗', '保罗·汉宁森', '赫伯特·拜耶', '哈利·贝克', '安迪·沃霍尔',
      '福田繁雄', '冈特·兰堡', '西摩·查瓦斯特', '保罗·兰德', '马西莫·维涅里', '米尔顿·格拉泽'
    ],
    descTemplates: [
      '一件{style}风格的{subject}作品,体现了{era}的设计思维。',
      '该设计以{subject}为媒介,运用{style}语言,呈现出强烈的视觉识别性。',
      '{era}背景下的{subject}探索,展现了{style}对功能与美学的平衡。',
      '此作品通过{style}手法重新诠释{subject},具有鲜明的时代特征。'
    ]
  },
  product: {
    styles: ['功能主义', '流线型', '有机设计', '北欧风格', '日式设计', '极简主义', '复古未来'],
    eras: ['工业革命', '20世纪', '当代', '战后'],
    subjects: ['家具', '灯具', '电子产品', '陶瓷器', '玻璃器', '金属工艺', '餐具', '文具', '交通工具'],
    mediums: ['木材、油漆', '钢架、皮革', '金属、漆', '胶合板、皮革', '刨花板', '瓷', '玻璃、金属', '铝合金', '陶瓷、釉'],
    titleTemplates: [
      '{style}{subject}', '{subject}设计', '{era}{subject}', '{subject}原型', '{style}·{subject}',
      '{subject}系列', '{subject}概念', '{subject}改良版'
    ],
    titleSuffixes: [''],
    artists: [
      '马塞尔·布劳耶', '查尔斯·伊姆斯', '宜家设计团队', '汉斯·瓦格纳', '阿恩·雅各布森', '野口勇',
      '迪特·拉姆斯', '马克·纽森', '菲利普·斯塔克', '深泽直人', '柳宗理', '雷蒙德·罗维'
    ],
    descTemplates: [
      '一款{style}风格的{subject},兼顾功能与形式美感。',
      '该产品以{subject}为载体,体现了{era}工业设计的典型特征。',
      '{style}理念下的{subject}设计,材料与工艺处理简洁而考究。',
      '此{subject}作品在{era}设计语境中具有重要的参考价值。'
    ]
  },
  sculpture: {
    styles: ['写实', '抽象', '装置', '动态雕塑', '大地艺术', '极简主义', '超现实主义'],
    eras: ['古代', '中世纪', '文艺复兴', '现代', '当代'],
    subjects: ['人物雕塑', '动物雕塑', '宗教雕塑', '纪念碑', '园林雕塑', '抽象形体', '公共艺术'],
    mediums: ['大理石', '青铜', '陶土', '不锈钢', '铜板', '木材', '综合材料', '石膏'],
    titleTemplates: [
      '{subject}', '{style}{subject}', '{era}{subject}', '{subject}·{style}', '{subject}研究',
      '{subject}习作', '{style}形体', '{subject}纪念像'
    ],
    titleSuffixes: [''],
    artists: [
      '米开朗基罗', '罗丹', '亚历山德罗斯', '米隆', '巴托尔迪', '安尼什·卡普尔', '杰夫·昆斯',
      '路易丝·布尔乔亚', '康斯坦丁·布朗库西', '亨利·摩尔', '贾科梅蒂', '蔡国强'
    ],
    descTemplates: [
      '一件{style}{subject}作品,以{medium}为媒介,展现了{era}雕塑语言的独特魅力。',
      '该雕塑聚焦{subject},运用{style}手法,材料为{medium}。',
      '{era}{subject}题材的代表性创作,体现了{style}对形体的理解。',
      '此作品以{medium}塑造{subject},在{style}语境中具有强烈的视觉张力。'
    ]
  },
  calligraphy: {
    styles: ['篆书', '隶书', '楷书', '行书', '草书', '魏碑', '瘦金体'],
    eras: ['秦代', '汉代', '晋代', '唐代', '宋代', '元代', '明代', '清代', '近现代'],
    subjects: ['诗词', '经文', '碑铭', '尺牍', '楹联', '题跋', '手札', '摩崖'],
    mediums: ['纸本墨迹', '绢本墨迹', '碑刻拓本', '竹简', '绢本设色'],
    titleTemplates: [
      '{subject}帖', '{style}{subject}', '{era}{subject}', '{subject}卷', '{style}·{subject}',
      '{subject}残卷', '{subject}临本', '{era}{style}{subject}'
    ],
    titleSuffixes: [''],
    artists: [
      '王羲之', '颜真卿', '苏轼', '欧阳询', '怀素', '张旭', '柳公权', '赵孟頫', '董其昌',
      '文徵明', '王铎', '吴昌硕', '于右任', '林散之', '启功'
    ],
    descTemplates: [
      '一件{style}{subject}作品,笔墨流畅,体现了{era}书法的审美意趣。',
      '此作以{style}书写{subject},线条遒劲,章法自然。',
      '{era}书法家所书的{subject},为{style}风格的典型代表。',
      '该作品属于{subject}范畴,以{style}呈现,具有{era}书法的时代特征。'
    ]
  },
  architecture: {
    styles: ['古典主义', '哥特式', '巴洛克', '现代主义', '后现代', '参数化', '解构主义', '新中式'],
    eras: ['古代', '中世纪', '文艺复兴', '现代', '当代'],
    subjects: ['宫殿', '寺庙', '园林', '住宅', '桥梁', '塔楼', '博物馆', '商业建筑', '公共建筑'],
    mediums: ['木构', '砖石', '钢筋混凝土', '玻璃幕墙', '钢结构', '夯土', '综合材料'],
    titleTemplates: [
      '{style}{subject}', '{era}{subject}', '{subject}设计', '{subject}群', '{style}·{subject}',
      '{subject}遗址', '{subject}复原图', '{subject}方案'
    ],
    titleSuffixes: [''],
    artists: [
      '贝聿铭', '扎哈·哈迪德', '勒·柯布西耶', '弗兰克·劳埃德·赖特', '安藤忠雄', '密斯·凡·德·罗',
      '阿尔瓦·阿尔托', '路易斯·康', '诺曼·福斯特', '雷姆·库哈斯', '隈研吾', '王澍'
    ],
    descTemplates: [
      '一座{style}风格的{subject},体现了{era}建筑对空间与材料的探索。',
      '该建筑以{subject}为功能,运用{style}语言,结构为{medium}。',
      '{era}{subject}的典型代表,展现了{style}建筑的形式特征。',
      '此{subject}方案在{style}框架下,重新诠释了{era}建筑精神。'
    ]
  }
};

const REGIONS = ['china', 'east-asia', 'europe', 'america', 'other'];
const REGION_WEIGHTS = [0.35, 0.15, 0.30, 0.12, 0.08];

/** 可复现伪随机 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(rand, items, weights) {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function replaceTemplate(template, map) {
  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? '');
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function generateYear(era, rand) {
  const eraYears = {
    '唐代': () => 618 + Math.floor(rand() * 290),
    '宋代': () => 960 + Math.floor(rand() * 319),
    '元代': () => 1271 + Math.floor(rand() * 97),
    '明代': () => 1368 + Math.floor(rand() * 276),
    '清代': () => 1644 + Math.floor(rand() * 267),
    '近现代': () => 1900 + Math.floor(rand() * 124),
    '晋代': () => 265 + Math.floor(rand() * 155),
    '隋代': () => 581 + Math.floor(rand() * 37),
    '五代': () => 907 + Math.floor(rand() * 53),
    '南北朝': () => 420 + Math.floor(rand() * 169),
    '汉代': () => -202 + Math.floor(rand() * 422),
    '秦代': () => -221 + Math.floor(rand() * 15),
    '古希腊': () => -500 + Math.floor(rand() * 400),
    '文艺复兴': () => 1400 + Math.floor(rand() * 130),
    '巴洛克': () => 1600 + Math.floor(rand() * 150),
    '印象派': () => 1860 + Math.floor(rand() * 50),
    '后印象派': () => 1880 + Math.floor(rand() * 40),
    '表现主义': () => 1905 + Math.floor(rand() * 40),
    '现代主义': () => 1900 + Math.floor(rand() * 100),
    '浪漫主义': () => 1800 + Math.floor(rand() * 80),
    '超现实主义': () => 1920 + Math.floor(rand() * 80),
    '新艺术运动': () => 1890 + Math.floor(rand() * 30),
    '波普艺术': () => 1950 + Math.floor(rand() * 30),
    '20世纪初': () => 1900 + Math.floor(rand() * 40),
    '二战时期': () => 1939 + Math.floor(rand() * 6),
    '战后': () => 1945 + Math.floor(rand() * 35),
    '当代': () => 1980 + Math.floor(rand() * 45),
    '数字时代': () => 2000 + Math.floor(rand() * 25),
    '工业革命': () => 1760 + Math.floor(rand() * 90),
    '20世纪': () => 1900 + Math.floor(rand() * 100),
    '古代': () => -1000 + Math.floor(rand() * 2000),
    '中世纪': () => 500 + Math.floor(rand() * 900),
    '现代': () => 1900 + Math.floor(rand() * 80),
    '江户时代': () => 1603 + Math.floor(rand() * 265),
  };
  if (eraYears[era]) {
    const y = eraYears[era]();
    return y < 0 ? `前${Math.abs(y)}` : String(y);
  }
  return String(1500 + Math.floor(rand() * 500));
}

function generateTags(category, style, era, region, subject, rand) {
  const tags = [style, era, subject];
  if (region === 'china') tags.push('中国艺术');
  else if (region === 'east-asia') tags.push('东亚艺术');
  else if (region === 'europe') tags.push('欧洲艺术');
  else if (region === 'america') tags.push('美洲艺术');
  else tags.push('其他');

  const extraPool = ['参考', '素材', '灵感', '经典', '名作', '传世', '研究', '教学', '临摹', '构图', '色彩', '线条', '形式'];
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const t = pick(rand, extraPool);
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

function generateItem(index) {
  const rand = rng(index + 1);
  const category = pickWeighted(rand, CATEGORIES, [0.35, 0.12, 0.15, 0.15, 0.13, 0.10]);
  const cfg = CONFIG[category];
  const style = pick(rand, cfg.styles);
  const era = pick(rand, cfg.eras);
  const region = pickWeighted(rand, REGIONS, REGION_WEIGHTS);
  const subject = pick(rand, cfg.subjects);
  const medium = pick(rand, cfg.mediums);
  const artist = pick(rand, cfg.artists);

  const titleMap = {
    subject,
    style,
    era,
    suffix: pick(rand, cfg.titleSuffixes)
  };
  const title = replaceTemplate(pick(rand, cfg.titleTemplates), titleMap);
  const titleEn = `${style} ${subject} (${era})`;
  const artistEn = artist;
  const year = generateYear(era, rand);
  const description = replaceTemplate(pick(rand, cfg.descTemplates), { style, subject, era, medium });

  // 缩略图 seed:使用 title + artist + index 确保唯一且稳定
  const seed = `${title}|${artist}|${index}`;

  return {
    id: `artwork-${String(index + 1).padStart(5, '0')}`,
    title,
    titleEn,
    artist,
    artistEn,
    year,
    category,
    style,
    era,
    region,
    description,
    imageUrl: `__ARTWORK_IMAGE__:${seed}`,
    source: '丹青素材库',
    tags: generateTags(category, style, era, region, subject, rand),
    medium,
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const items = [];
  for (let i = 0; i < TOTAL; i++) {
    items.push(generateItem(i));
  }

  // 简单校验 id 唯一性
  const idSet = new Set(items.map((i) => i.id));
  if (idSet.size !== TOTAL) {
    throw new Error(`ID 冲突: ${TOTAL - idSet.size}`);
  }

  // 元数据:用于首屏统计与筛选面板,体积小
  const categories = new Set();
  const styles = new Set();
  const eras = new Set();
  const regions = new Set();
  const allTags = new Set();
  items.forEach((item) => {
    categories.add(item.category);
    styles.add(item.style);
    eras.add(item.era);
    regions.add(item.region);
    item.tags.forEach((t) => allTags.add(t));
  });

  const meta = {
    total: TOTAL,
    categories: Array.from(categories),
    styles: Array.from(styles),
    eras: Array.from(eras),
    regions: Array.from(regions),
    tags: Array.from(allTags).sort(),
    categoryCounts: CATEGORIES.map((c) => ({ category: c, count: items.filter((i) => i.category === c).length })),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify({ total: TOTAL, items }));
  console.log(`已生成 ${TOTAL} 条素材: ${OUT_FILE}`);

  fs.writeFileSync(META_FILE, JSON.stringify(meta));
  console.log(`已生成素材元数据: ${META_FILE}`);
}

main();
