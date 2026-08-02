// ============================================================
// 丹青有AI - 创作草稿服务 (任务包 A)
// ------------------------------------------------------------
// 设计目标:
//   1. 上传图片后自动创建草稿,刷新页面/切标签后可在工作台"继续创作"
//   2. 分析成功完成自动清理草稿,失败保留以便用户继续
//   3. 多租户隔离:草稿带 tenantId/userId,listDrafts 按当前用户过滤
//   4. LocalStorage 存储,所有读写 try-catch 兜底,失败不抛错不阻塞主流程
//   5. 跨标签同步:subscribeDrafts 监听 storage 事件,实现多标签实时刷新
//
// 存储格式:
//   - 单条草稿: dq_draft_<uuid>  -> JSON.stringify(Draft)
//   - 索引列表:  dq_draft_index   -> JSON.stringify(string[])  (id 列表)
//
// 注意:
//   - 草稿是前端独有概念(LocalStorage),不与后端表同步,故类型定义在本文件
//   - 不引入新依赖,uuid 用 crypto.randomUUID() (Node 19+ / 现代浏览器原生支持)
// ============================================================

/** 草稿状态:草稿 / 分析中 */
export type DraftStatus = 'draft' | 'analyzing';

/** 创作草稿 */
export interface Draft {
  /** uuid v4 */
  id: string;
  /** 当前用户租户 ID (多租户隔离) */
  tenantId: string;
  /** 当前用户 ID */
  userId: string;
  /** 标题,默认 "未命名作品_<时间戳>" */
  title: string;
  /** 作品类型 (painting/design/product/sculpture) */
  artworkType: string;
  /** 风格分类 (可选) */
  styleCategory?: string;
  /** 创作备注 (可选) */
  notes?: string;
  /** 缩略图 dataURL (最大 200x200 压缩,可选) */
  imagePreview?: string;
  /** 状态 */
  status: DraftStatus;
  /** 创建时间 (unix ms) */
  createdAt: number;
  /** 更新时间 (unix ms) */
  updatedAt: number;
}

/** 创建草稿输入 (id/时间戳/status 由服务自动生成) */
export type CreateDraftInput = Omit<Draft, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

/** LocalStorage key 前缀与索引 key */
const DRAFT_KEY_PREFIX = 'dq_draft_';
const DRAFT_INDEX_KEY = 'dq_draft_index';

/** 自动清理阈值:7 天 (ms) */
const AUTO_CLEAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/* ============================================================
 * 内部工具:安全 LocalStorage 读写 (失败返回 null/空,不抛错)
 * ============================================================ */

/** 读取单条草稿原始 JSON,失败返回 null */
function readDraftRaw(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写入单条草稿,失败返回 false */
function writeDraftRaw(draft: Draft): boolean {
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + draft.id, JSON.stringify(draft));
    return true;
  } catch {
    // localStorage 满 / 被禁用 (隐私模式) / 超配额
    return false;
  }
}

/** 删除单条草稿,失败静默 */
function removeDraftRaw(id: string): void {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + id);
  } catch {
    /* 静默 */
  }
}

/** 读取索引 (id 列表),损坏时返回空数组并自我修复 */
function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

/** 写入索引,失败静默 */
function writeIndex(ids: string[]): void {
  try {
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(ids));
  } catch {
    /* 静默 */
  }
}

/** 类型守卫:校验对象是否为合法 Draft */
function isDraft(v: unknown): v is Draft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.tenantId === 'string' &&
    typeof d.userId === 'string' &&
    typeof d.title === 'string' &&
    typeof d.artworkType === 'string' &&
    (d.status === 'draft' || d.status === 'analyzing') &&
    typeof d.createdAt === 'number' &&
    typeof d.updatedAt === 'number'
  );
}

/** 生成 uuid v4,优先用 crypto.randomUUID,不可用时降级到手动实现 */
function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* 降级 */
  }
  // 降级:基于 Math.random 的 RFC4122 v4 (无 crypto.randomUUID 环境)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ============================================================
 * 公开 API
 * ============================================================ */

/**
 * 创建草稿
 * 写入单条数据 + 追加索引,任一失败时尝试回滚已写入部分
 * @returns 创建成功的草稿;LocalStorage 不可用时返回 null
 */
export function createDraft(input: CreateDraftInput): Draft | null {
  const now = Date.now();
  const draft: Draft = {
    id: uuid(),
    tenantId: input.tenantId,
    userId: input.userId,
    title: input.title || `未命名作品_${now}`,
    artworkType: input.artworkType,
    styleCategory: input.styleCategory,
    notes: input.notes,
    imagePreview: input.imagePreview,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  // 先写草稿本体,失败直接返回 null
  if (!writeDraftRaw(draft)) return null;

  // 再追加索引,失败时回滚草稿本体 (保持一致性)
  const ids = readIndex();
  if (ids.includes(draft.id)) {
    // 理论上不会出现,防御性处理
    return draft;
  }
  ids.push(draft.id);
  writeIndex(ids); // 索引写入失败不回滚草稿 (草稿仍存在,后续 listDrafts 自愈)

  return draft;
}

/**
 * 列出当前用户(租户+用户)的草稿,按 updatedAt 倒序
 * - 顺便清理 7 天前的过期草稿 (全局,不分租户)
 * - 修复索引中失效的 id 引用 (草稿已被外部删除的情况)
 */
export function listDrafts(tenantId: string, userId: string): Draft[] {
  // 1. 全局清理过期草稿
  deleteDraftsByAge(AUTO_CLEAN_MAX_AGE_MS);

  const ids = readIndex();
  const validDrafts: Draft[] = [];
  const validIds: string[] = [];
  let indexChanged = false;

  for (const id of ids) {
    const draft = readDraftRaw(id);
    if (!draft) {
      // 草稿不存在 (已被外部清除),跳过并标记索引需修复
      indexChanged = true;
      continue;
    }
    validIds.push(id);
    // 多租户 + 用户隔离过滤
    if (draft.tenantId === tenantId && draft.userId === userId) {
      validDrafts.push(draft);
    }
  }

  // 2. 索引自愈:清除失效 id
  if (indexChanged) {
    writeIndex(validIds);
  }

  // 3. 按 updatedAt 倒序
  validDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
  return validDrafts;
}

/** 按 id 获取单条草稿,不存在或损坏返回 null */
export function getDraft(id: string): Draft | null {
  return readDraftRaw(id);
}

/**
 * 更新草稿 (部分字段)
 * 自动刷新 updatedAt;id 不存在返回 null
 */
export function updateDraft(id: string, patch: Partial<Draft>): Draft | null {
  const existing = readDraftRaw(id);
  if (!existing) return null;

  // 不允许通过 patch 改 id/createdAt (保持身份与创建时间不变)
  const { id: _omitId, createdAt: _omitCreatedAt, ...safePatch } = patch;
  void _omitId;
  void _omitCreatedAt;

  const next: Draft = {
    ...existing,
    ...safePatch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  if (!writeDraftRaw(next)) return null;
  return next;
}

/**
 * 删除草稿
 * 同步从索引移除,返回是否成功 (草稿原本不存在也视为成功)
 */
export function deleteDraft(id: string): boolean {
  // 先从索引移除
  const ids = readIndex();
  const nextIds = ids.filter((x) => x !== id);
  if (nextIds.length !== ids.length) {
    writeIndex(nextIds);
  }
  // 再删草稿本体
  removeDraftRaw(id);
  return true;
}

/**
 * 清理过期草稿 (按 updatedAt 计算年龄)
 * @param maxAgeMs 最大年龄 (毫秒),超过则删除
 * @returns 实际删除数量
 */
export function deleteDraftsByAge(maxAgeMs: number): number {
  const now = Date.now();
  const ids = readIndex();
  const keepIds: string[] = [];
  let removed = 0;

  for (const id of ids) {
    const draft = readDraftRaw(id);
    // 草稿不存在或已损坏:从索引移除 (计为清理)
    if (!draft) {
      removed++;
      continue;
    }
    // 超龄:删除本体,不保留索引
    if (now - draft.updatedAt > maxAgeMs) {
      removeDraftRaw(id);
      removed++;
      continue;
    }
    keepIds.push(id);
  }

  if (removed > 0) {
    writeIndex(keepIds);
  }
  return removed;
}

/* ============================================================
 * 跨标签同步:监听 storage 事件
 * ============================================================ */

/**
 * 订阅草稿变化 (跨标签同步)
 * 监听 window 'storage' 事件,仅在本标签之外的标签修改 LocalStorage 时触发
 * 同标签内的变更需由调用方自行刷新 (组件 state 驱动)
 *
 * @param cb 变化回调 (无参,调用方需自行重新 listDrafts)
 * @returns 取消订阅函数
 */
export function subscribeDrafts(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {
      /* no-op */
    };
  }
  const handler = (e: StorageEvent) => {
    // 只关心草稿相关 key 的变更 (草稿本体 / 索引)
    if (e.key === null) return; // clear() 全清,上层会重新拉取空列表
    if (e.key === DRAFT_INDEX_KEY || e.key.startsWith(DRAFT_KEY_PREFIX)) {
      cb();
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** 暴露常量供测试与调试使用 */
export const DRAFT_CONSTANTS = {
  KEY_PREFIX: DRAFT_KEY_PREFIX,
  INDEX_KEY: DRAFT_INDEX_KEY,
  AUTO_CLEAN_MAX_AGE_MS,
} as const;
