// ============================================================
// 实时图片搜索服务(P0 落地实现)
//
// 实现范围:
//   - 关键词全文检索(中文二元分词 + 英文单词分词,复用 knowledge 思路)
//   - 倒排索引(token → imageIds),字段加权评分
//     title×5 / tags×4 / category×2
//   - 关键词联想补全(基于索引 token 集前缀匹配)
//   - 标签(AND)/ 分类 / 作品类型 / 状态 筛选
//   - 多租户数据隔离(每租户独立存储与索引)
//   - CRUD + 角色权限强制(student 仅可见 published)
//   - 种子数据(艺术作品图片样本)
//
// 对应文档:docs/realtime-image-search-solution.md
// 性能目标:搜索延迟 ≤300ms(进程内存索引 + 线性扫描,小数据量场景下足够)
// ============================================================

import { randomUUID } from 'node:crypto';
import type {
  ArtType,
  CreateImageRequest,
  ImageDoc,
  ImageSearchQuery,
  ImageSearchResponse,
  ImageStatus,
  ImageSuggestQuery,
  ImageSuggestResponse,
  UpdateImageRequest,
  UserRole,
} from '../types/api-contract.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1. 分词器(中文二元 + 英文单词)
// ============================================================

/** 中文 Unicode 区间判断 */
function isCJK(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
    (code >= 0xf900 && code <= 0xfaff) // 兼容表意文字
  );
}

/**
 * 文本分词:
 * - 英文/数字:按非字母数字切分,小写化
 * - 中文:连续中文片段切为滑动窗口二元组(bigram),单字保留
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const segments = text.toLowerCase().split(/([一-鿿㐀-䶿豈-﫿]+)/u);
  for (const seg of segments) {
    if (!seg) continue;
    if (isCJK(seg[0] ?? '')) {
      if (seg.length === 1) {
        tokens.push(seg);
      } else {
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.push(seg.slice(i, i + 2));
        }
      }
    } else {
      const words = seg.match(/[a-z0-9]+/g);
      if (words) tokens.push(...words);
    }
  }
  return tokens;
}

// ============================================================
// 2. 租户级存储与倒排索引
// ============================================================

/** 倒排索引:token → Set<imageId> */
type InvertedIndex = Map<string, Set<string>>;

interface TenantStore {
  /** 图片条目:imageId → ImageDoc */
  images: Map<string, ImageDoc>;
  /** 倒排索引:token → imageId 集合 */
  index: InvertedIndex;
  /** 索引构建时间 */
  lastBuildAt: string | null;
  /** 是否已加载种子数据 */
  seeded: boolean;
}

/** 全局存储:tenantId → TenantStore */
const stores = new Map<string, TenantStore>();

/** 索引字段权重(与方案文档第8节一致) */
const FIELD_WEIGHTS = {
  title: 5,
  tags: 4,
  category: 2,
} as const;

/**
 * 将图片条目写入倒排索引
 * 仅索引 title / tags / category 三个字段(图片无正文内容)
 */
function indexImage(store: TenantStore, image: ImageDoc): void {
  const fields: Array<[string, number]> = [
    [image.title, FIELD_WEIGHTS.title],
    [image.tags.join(' '), FIELD_WEIGHTS.tags],
    [image.category, FIELD_WEIGHTS.category],
  ];
  for (const [text] of fields) {
    for (const token of tokenize(text)) {
      let bucket = store.index.get(token);
      if (!bucket) {
        bucket = new Set<string>();
        store.index.set(token, bucket);
      }
      bucket.add(image.id);
    }
  }
}

/** 从倒排索引移除条目(简化:全量重建该租户索引) */
function rebuildTenantIndex(store: TenantStore): void {
  store.index.clear();
  for (const image of store.images.values()) {
    indexImage(store, image);
  }
  store.lastBuildAt = new Date().toISOString();
}

// ============================================================
// 3. 种子数据(艺术作品图片样本)
// ============================================================

/** 种子条目模板(不含租户/审计字段,加载时注入) */
interface SeedImage {
  title: string;
  tags: string[];
  category: string;
  artType: ArtType;
  status: ImageStatus;
  thumbUrl: string;
  fullUrl: string;
  meta: { width: number; height: number; size: number };
}

/**
 * 种子数据:12 条艺术作品图片样本
 * 覆盖绘画/设计/产品/雕塑四类,含 published / draft / archived 三态
 */
const SEED_IMAGES: SeedImage[] = [
  {
    title: '素描几何体组合',
    tags: ['素描', '几何体', '明暗', '基础'],
    category: '绘画基础',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/sketch-geom.png',
    fullUrl: '/uploads/seed/sketch-geom.png',
    meta: { width: 1024, height: 768, size: 37119 },
  },
  {
    title: '素描头像示范',
    tags: ['素描', '头像', '结构', '骨点'],
    category: '绘画基础',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/sketch-head.png',
    fullUrl: '/uploads/seed/sketch-head.png',
    meta: { width: 768, height: 1024, size: 69774 },
  },
  {
    title: '色彩静物写生',
    tags: ['色彩', '静物', '水粉', '写生'],
    category: '色彩理论',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/color-still.png',
    fullUrl: '/uploads/seed/color-still.png',
    meta: { width: 1024, height: 768, size: 50617 },
  },
  {
    title: '色彩冷暖关系练习',
    tags: ['色彩', '冷暖', '色调', '练习'],
    category: '色彩理论',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/color-warm.png',
    fullUrl: '/uploads/seed/color-warm.png',
    meta: { width: 1024, height: 768, size: 34128 },
  },
  {
    title: '一点透视街道场景',
    tags: ['透视', '一点透视', '场景', '素描'],
    category: '绘画基础',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/perspective-street.png',
    fullUrl: '/uploads/seed/perspective-street.png',
    meta: { width: 1024, height: 768, size: 13204 },
  },
  {
    title: '人物速写动态线',
    tags: ['速写', '人物', '动态', '比例'],
    category: '绘画基础',
    artType: 'painting',
    status: 'published',
    thumbUrl: '/uploads/seed/sketch-figure.png',
    fullUrl: '/uploads/seed/sketch-figure.png',
    meta: { width: 768, height: 1024, size: 17787 },
  },
  {
    title: '平面设计版式网格',
    tags: ['版式', '网格', '平面设计', '排版'],
    category: '设计理论',
    artType: 'design',
    status: 'published',
    thumbUrl: '/uploads/seed/design-grid.png',
    fullUrl: '/uploads/seed/design-grid.png',
    meta: { width: 768, height: 1024, size: 12826 },
  },
  {
    title: '海报构图对角线',
    tags: ['海报', '构图', '对角线', '设计'],
    category: '设计理论',
    artType: 'design',
    status: 'published',
    thumbUrl: '/uploads/seed/poster-diag.png',
    fullUrl: '/uploads/seed/poster-diag.png',
    meta: { width: 768, height: 1024, size: 9773 },
  },
  {
    title: '产品手绘效果图',
    tags: ['马克笔', '产品手绘', '效果图', '材质'],
    category: '产品设计',
    artType: 'product',
    status: 'published',
    thumbUrl: '/uploads/seed/product-render.png',
    fullUrl: '/uploads/seed/product-render.png',
    meta: { width: 900, height: 900, size: 25893 },
  },
  {
    title: '雕塑泥塑头像',
    tags: ['雕塑', '泥塑', '头像', '体量'],
    category: '雕塑基础',
    artType: 'sculpture',
    status: 'published',
    thumbUrl: '/uploads/seed/sculpt-head.png',
    fullUrl: '/uploads/seed/sculpt-head.png',
    meta: { width: 900, height: 900, size: 97401 },
  },
  {
    title: '校考创意速写草稿',
    tags: ['速写', '创意', '校考', '草稿'],
    category: '应试指导',
    artType: 'design',
    status: 'draft',
    thumbUrl: '/uploads/seed/creative-draft.png',
    fullUrl: '/uploads/seed/creative-draft.png',
    meta: { width: 768, height: 1024, size: 92536 },
  },
  {
    title: '油画静物材料练习',
    tags: ['油画', '材料', '媒介剂', '静物'],
    category: '材料技法',
    artType: 'painting',
    status: 'archived',
    thumbUrl: '/uploads/seed/oil-still.png',
    fullUrl: '/uploads/seed/oil-still.png',
    meta: { width: 1024, height: 768, size: 128163 },
  },
];

/**
 * 获取租户存储(首次访问时注入种子数据并建索引)
 * 种子数据为基线作品库,每个租户独立副本,互不影响
 */
function getTenantStore(tenantId: string): TenantStore {
  let store = stores.get(tenantId);
  if (store) return store;

  store = {
    images: new Map<string, ImageDoc>(),
    index: new Map<string, Set<string>>(),
    lastBuildAt: null,
    seeded: true,
  };
  const now = new Date().toISOString();
  for (const seed of SEED_IMAGES) {
    const image: ImageDoc = {
      id: `img-${randomUUID()}`,
      tenantId,
      title: seed.title,
      tags: seed.tags,
      category: seed.category,
      status: seed.status,
      thumbUrl: seed.thumbUrl,
      fullUrl: seed.fullUrl,
      meta: seed.meta,
      createdById: 'system',
      updatedById: 'system',
      createdAt: now,
      updatedAt: now,
    };
    store.images.set(image.id, image);
  }
  rebuildTenantIndex(store);
  stores.set(tenantId, store);
  logger.info({ tenantId, docs: store.images.size }, '[image-search] tenant seeded');
  return store;
}

// ============================================================
// 4. 搜索评分
// ============================================================

/** 可检索非 published(草稿/归档)内容的角色 */
const ELEVATED_ROLES: readonly UserRole[] = ['teacher', 'admin', 'owner'];

/** 默认检索状态 */
const DEFAULT_STATUS: ImageStatus = 'published';

/**
 * 计算条目与查询词的相关性分数(字段加权 + 短语加成)
 * @returns 原始分数(未归一化)
 */
function scoreImage(image: ImageDoc, queryTokens: string[], rawQuery: string): number {
  let score = 0;

  const fieldBags: Array<[string[], number]> = [
    [tokenize(image.title), FIELD_WEIGHTS.title],
    [image.tags.flatMap((t) => tokenize(t)), FIELD_WEIGHTS.tags],
    [tokenize(image.category), FIELD_WEIGHTS.category],
  ];

  for (const token of queryTokens) {
    for (const [bag, weight] of fieldBags) {
      const hits = bag.filter((t) => t === token || t.includes(token) || token.includes(t)).length;
      if (hits > 0) score += hits * weight;
    }
  }

  // 短语精确加成:原始查询完整出现在标题/标签中
  const phrase = rawQuery.trim().toLowerCase();
  if (phrase.length >= 2) {
    if (image.title.toLowerCase().includes(phrase)) score += 20;
    if (image.tags.some((t) => t.toLowerCase() === phrase)) score += 15;
  }

  return score;
}

// ============================================================
// 5. 对外服务接口
// ============================================================

/**
 * 图片搜索
 * - 关键词:倒排索引召回 + 字段加权评分 + 归一化
 * - 筛选:tags(AND)/ category / artType / status
 * - 分页:page / pageSize
 * - 安全:服务端强制角色策略,非 elevated 角色忽略其 status 入参,强制 published
 *   (防止客户端传 status=draft 越权查看未发布内容)
 */
function search(
  tenantId: string,
  role: UserRole,
  query: ImageSearchQuery,
): ImageSearchResponse {
  const store = getTenantStore(tenantId);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  // 角色策略强制:student 等非 elevated 角色忽略 status 入参,强制 published
  const requestedStatus = query.status ?? DEFAULT_STATUS;
  const status = ELEVATED_ROLES.includes(role) ? requestedStatus : DEFAULT_STATUS;
  const tagsFilter = (query.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const rawQuery = (query.q ?? '').trim();
  const queryTokens = tokenize(rawQuery);

  // ---------- 召回与筛选 ----------
  const candidates: Array<{ image: ImageDoc; rawScore: number }> = [];
  for (const image of store.images.values()) {
    if (image.status !== status) continue;
    if (query.category && image.category !== query.category) continue;
    // 注:ImageDoc 未单独存储 artType 字段(P0 简化),artType 筛选暂不生效,
    // v2.0 扩展 ImageDoc 增加 artType 后启用;此处保留 query.artType 以兼容契约
    if (tagsFilter.length > 0 && !tagsFilter.every((t) => image.tags.includes(t))) continue;

    const rawScore = queryTokens.length > 0 ? scoreImage(image, queryTokens, rawQuery) : 1;
    if (queryTokens.length > 0 && rawScore <= 0) continue;
    candidates.push({ image, rawScore });
  }

  // ---------- 排序 ----------
  const maxScore = Math.max(...candidates.map((c) => c.rawScore), 1);
  if (queryTokens.length > 0) {
    candidates.sort(
      (a, b) => b.rawScore - a.rawScore || b.image.updatedAt.localeCompare(a.image.updatedAt),
    );
  } else {
    candidates.sort((a, b) => b.image.updatedAt.localeCompare(a.image.updatedAt));
  }

  // ---------- 分页 ----------
  const total = candidates.length;
  const start = (page - 1) * pageSize;
  const items = candidates.slice(start, start + pageSize).map(({ image, rawScore }) => ({
    ...image,
    score: queryTokens.length > 0 ? Math.round((rawScore / maxScore) * 100) / 100 : undefined,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
}

/**
 * 关键词联想补全
 * - 基于倒排索引 token 集做前缀匹配
 * - 前缀 ≥1 字符触发,默认返回 8 条
 * - 仅从 published 图片的索引中召回(学生视角)
 */
function suggest(
  tenantId: string,
  role: UserRole,
  query: ImageSuggestQuery,
): ImageSuggestResponse {
  const store = getTenantStore(tenantId);
  const prefix = (query.q ?? '').trim().toLowerCase();
  if (!prefix) return { suggestions: [] };
  const limit = Math.min(20, Math.max(1, query.limit ?? 8));

  // 候选来源:倒排索引的 token 集合
  const candidates = new Set<string>();
  for (const token of store.index.keys()) {
    if (token.startsWith(prefix)) {
      candidates.add(token);
    }
  }

  // 角色过滤:非 elevated 角色排除来自 draft/archived 图片的 token
  // (倒排索引未区分状态,需回查图片状态)
  if (!ELEVATED_ROLES.includes(role)) {
    const filtered = new Set<string>();
    for (const token of candidates) {
      const ids = store.index.get(token);
      if (!ids) continue;
      // 只要存在任一 published 图片命中该 token,即保留
      let keep = false;
      for (const id of ids) {
        const img = store.images.get(id);
        if (img && img.status === 'published') {
          keep = true;
          break;
        }
      }
      if (keep) filtered.add(token);
    }
    return { suggestions: Array.from(filtered).sort().slice(0, limit) };
  }

  return { suggestions: Array.from(candidates).sort().slice(0, limit) };
}

/**
 * 获取图片条目详情(含租户隔离 + 角色权限强制)
 */
function getById(tenantId: string, role: UserRole, id: string): ImageDoc | null {
  const store = getTenantStore(tenantId);
  const image = store.images.get(id);
  if (!image) return null;
  // 非 elevated 角色不可见 draft/archived
  if (!ELEVATED_ROLES.includes(role) && image.status !== DEFAULT_STATUS) {
    return null;
  }
  return image;
}

/**
 * 创建图片条目
 */
function create(
  tenantId: string,
  userId: string,
  input: CreateImageRequest,
): ImageDoc {
  const store = getTenantStore(tenantId);
  const now = new Date().toISOString();
  const image: ImageDoc = {
    id: `img-${randomUUID()}`,
    tenantId,
    title: input.title,
    tags: input.tags ?? [],
    category: input.category,
    status: input.status ?? 'draft',
    thumbUrl: input.thumbUrl,
    fullUrl: input.fullUrl,
    meta: input.meta ?? { width: 0, height: 0, size: 0 },
    createdById: userId,
    updatedById: userId,
    createdAt: now,
    updatedAt: now,
  };
  store.images.set(image.id, image);
  indexImage(store, image);
  store.lastBuildAt = now;
  logger.info({ tenantId, id: image.id, title: image.title }, '[image-search] image created');
  return image;
}

/**
 * 更新图片条目(部分更新)
 */
function update(
  tenantId: string,
  id: string,
  userId: string,
  input: UpdateImageRequest,
): ImageDoc | null {
  const store = getTenantStore(tenantId);
  const existing = store.images.get(id);
  if (!existing) return null;

  const updated: ImageDoc = {
    ...existing,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.thumbUrl !== undefined && { thumbUrl: input.thumbUrl }),
    ...(input.fullUrl !== undefined && { fullUrl: input.fullUrl }),
    ...(input.meta !== undefined && { meta: input.meta }),
    updatedById: userId,
    updatedAt: new Date().toISOString(),
  };
  store.images.set(id, updated);
  rebuildTenantIndex(store);
  logger.info({ tenantId, id }, '[image-search] image updated');
  return updated;
}

/**
 * 删除图片条目
 */
function remove(tenantId: string, id: string): boolean {
  const store = getTenantStore(tenantId);
  if (!store.images.delete(id)) return false;
  rebuildTenantIndex(store);
  logger.info({ tenantId, id }, '[image-search] image deleted');
  return true;
}

/**
 * 测试辅助:清空全部租户存储(测试隔离用)
 */
function __clearForTest(): void {
  stores.clear();
}

// ============================================================
// 导出
// ============================================================

export const imageSearchService = {
  search,
  suggest,
  getById,
  create,
  update,
  remove,
  tokenize,
  __clearForTest,
};
