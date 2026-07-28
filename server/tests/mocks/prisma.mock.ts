// ============================================================
// Prisma Mock(内存实现模拟 PrismaClient)
// 对应源码:src/config/prisma.ts(initPrisma / prisma / closePrisma)
// 对应模型:user / tenant / tenantMember / session / analysis
//
// 设计要点:
//   1. 内存 Map 存储记录,按模型分表
//   2. 支持 findUnique(by id / 唯一字段)/ findFirst / findMany / create / update / updateMany / count
//   3. 支持 $transaction(callback):callback 接收 mock 自身作为 tx
//   4. 支持 Prisma.DbNull / JsonNull 简化处理(analysis.result)
//   5. 不实现 Prisma 完整类型系统,方法签名宽松,运行时保证行为正确
//   6. 通过 prismaState 暴露内部 store 供测试断言(如验证 tenant_id 过滤)
// ============================================================

import { Prisma } from '@prisma/client';

// ============================================================
// Mock 数据模型(对应 prisma/schema.prisma)
// ============================================================

export interface MockUser {
  id: string;
  tenantId: string;
  feishuOpenId: string;
  feishuUnionId: string;
  name: string;
  avatar: string;
  email: string | null;
  phone: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface MockTenant {
  id: string;
  name: string;
  type: string;
  feishuTenantKey: string | null;
  plan: string;
  status: string;
  maxSeats: number;
  parentId: string | null;
  createdAt: Date;
}

export interface MockTenantMember {
  userId: string;
  tenantId: string;
  role: string;
  joinedAt: Date;
}

export interface MockSession {
  id: string;
  userId: string;
  tenantId: string;
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface MockAnalysis {
  id: string;
  tenantId: string;
  userId: string;
  workType: string;
  imageUrl: string;
  title: string | null;
  remark: string | null;
  status: string;
  result: unknown;
  failureReason: string | null;
  overallScore: number | null;
  durationMs: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

// ============================================================
// Where 条件简化匹配
// 支持等值匹配 + 复合唯一键(userId_tenantId)+ 范围(gte/lte/in)
// ============================================================

type WhereValue = string | number | boolean | null | { equals?: unknown; gte?: unknown; lte?: unknown; in?: unknown[] } | Record<string, unknown>;

function matchValue(recordValue: unknown, condition: WhereValue): boolean {
  if (condition === null) {
    return recordValue === null;
  }
  if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
    const cond = condition as { equals?: unknown; gte?: unknown; lte?: unknown; lt?: unknown; gt?: unknown; in?: unknown[] };
    if (cond.equals !== undefined && recordValue !== cond.equals) return false;
    // 统一转换为时间戳进行比较(支持 Date 对象与 number)
    const toMs = (v: unknown): number => {
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'number') return v;
      return NaN;
    };
    const recordMs = toMs(recordValue);
    if (cond.gte !== undefined && (Number.isNaN(recordMs) || recordMs < toMs(cond.gte))) return false;
    if (cond.lte !== undefined && (Number.isNaN(recordMs) || recordMs > toMs(cond.lte))) return false;
    if (cond.gt !== undefined && (Number.isNaN(recordMs) || recordMs <= toMs(cond.gt))) return false;
    if (cond.lt !== undefined && (Number.isNaN(recordMs) || recordMs >= toMs(cond.lt))) return false;
    if (cond.in !== undefined && !Array.isArray(cond.in)) return false;
    if (cond.in !== undefined && Array.isArray(cond.in) && !cond.in.includes(recordValue)) return false;
    return true;
  }
  return recordValue === condition;
}

function matchWhere<T extends Record<string, unknown>>(record: T, where: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(condition)) {
      for (const sub of condition) {
        if (!matchWhere(record, sub as Record<string, unknown>)) return false;
      }
      continue;
    }
    if (key === 'OR' && Array.isArray(condition)) {
      const matched = condition.some((sub) => matchWhere(record, sub as Record<string, unknown>));
      if (!matched) return false;
      continue;
    }
    // 复合唯一键:userId_tenantId = { userId, tenantId }
    if (key === 'userId_tenantId' && typeof condition === 'object' && condition !== null) {
      const cond = condition as { userId?: string; tenantId?: string };
      if (cond.userId !== undefined && record['userId' as keyof T] !== cond.userId) return false;
      if (cond.tenantId !== undefined && record['tenantId' as keyof T] !== cond.tenantId) return false;
      continue;
    }
    const recordValue = record[key as keyof T];
    if (!matchValue(recordValue, condition as WhereValue)) return false;
  }
  return true;
}

// ============================================================
// 各模型委托实现
// ============================================================

interface DelegateArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: unknown;
  include?: unknown;
  orderBy?: unknown;
  skip?: number;
  take?: number;
}

function pickId(args: DelegateArgs): string | undefined {
  const where = args.where;
  if (!where) return undefined;
  if (typeof where.id === 'string') return where.id;
  return undefined;
}

/**
 * include 关系解析器:为记录附加关联模型数据
 * 用于支持 tenantMember.findMany({ include: { user/tenant } }) 等场景
 */
type IncludeResolver<T> = (record: T, include: Record<string, unknown>) => T;

function createModelDelegate<T extends Record<string, unknown> & { id: string }>(
  store: Map<string, T>,
  uniqueFields: string[] = [],
  includeResolver?: IncludeResolver<T>,
) {
  function applyInclude(record: T, include: unknown): T {
    if (!include || typeof include !== 'object' || !includeResolver) return record;
    return includeResolver(record, include as Record<string, unknown>);
  }

  return {
    async findUnique(args: DelegateArgs): Promise<T | null> {
      const where = args.where ?? {};
      let result: T | null = null;
      // 按 id 查找
      if (typeof where.id === 'string') {
        result = store.get(where.id) ?? null;
      } else {
        // 按唯一字段查找
        for (const field of uniqueFields) {
          if (typeof where[field] === 'string') {
            for (const record of store.values()) {
              if (record[field as keyof T] === where[field]) {
                result = record;
                break;
              }
            }
            break;
          }
          // 复合唯一键
          if (field === 'userId_tenantId' && where.userId_tenantId && typeof where.userId_tenantId === 'object') {
            const cond = where.userId_tenantId as { userId?: string; tenantId?: string };
            for (const record of store.values()) {
              if (record['userId' as keyof T] === cond.userId && record['tenantId' as keyof T] === cond.tenantId) {
                result = record;
                break;
              }
            }
            break;
          }
        }
      }
      if (result === null) return null;
      return applyInclude(result, args.include);
    },

    async findFirst(args: DelegateArgs): Promise<T | null> {
      const where = args.where ?? {};
      for (const record of store.values()) {
        if (matchWhere(record, where)) {
          return applyInclude(record, args.include);
        }
      }
      return null;
    },

    async findMany(args: DelegateArgs): Promise<T[]> {
      const where = args.where ?? {};
      let items = Array.from(store.values()).filter((r) => matchWhere(r, where));
      // orderBy:支持 { createdAt: 'desc' } / { createdAt: 'asc' }
      if (args.orderBy && typeof args.orderBy === 'object') {
        const ob = args.orderBy as Record<string, 'asc' | 'desc'>;
        for (const [field, dir] of Object.entries(ob)) {
          items.sort((a, b) => {
            const av = a[field as keyof T];
            const bv = b[field as keyof T];
            if (av === bv) return 0;
            if (av === null || av === undefined) return 1;
            if (bv === null || bv === undefined) return -1;
            if (av < bv) return dir === 'asc' ? -1 : 1;
            return dir === 'asc' ? 1 : -1;
          });
        }
      }
      // 分页
      if (args.skip !== undefined) items = items.slice(args.skip);
      if (args.take !== undefined) items = items.slice(0, args.take);
      // include 解析
      if (args.include && includeResolver) {
        items = items.map((r) => applyInclude(r, args.include));
      }
      return items;
    },

    async create(args: DelegateArgs): Promise<T> {
      const data = (args.data ?? {}) as Record<string, unknown>;
      const id = (data['id'] as string) ?? generateId();
      // 处理嵌套 connect:{ id } 关系
      const flatData: Record<string, unknown> = { ...data };
      for (const [key, value] of Object.entries(flatData)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && 'connect' in (value as Record<string, unknown>)) {
          const connect = (value as { connect: Record<string, unknown> }).connect;
          for (const [connectField, connectValue] of Object.entries(connect)) {
            flatData[connectField] = connectValue;
          }
          delete flatData[key];
        }
      }
      const now = new Date();
      const record = {
        id,
        createdAt: now,
        updatedAt: now,
        ...flatData,
        // 覆盖:若 data 显式提供了 createdAt/updatedAt 则保留
        ...(data['createdAt'] !== undefined ? { createdAt: data['createdAt'] } : {}),
        ...(data['updatedAt'] !== undefined ? { updatedAt: data['updatedAt'] } : {}),
      } as T;
      store.set(id, record);
      return record;
    },

    async update(args: DelegateArgs): Promise<T> {
      const id = pickId(args);
      if (!id) throw new Error('mock update: missing where.id');
      const existing = store.get(id);
      if (!existing) throw new Error(`mock update: record ${id} not found`);
      const data = (args.data ?? {}) as Record<string, unknown>;
      const updated = { ...existing, ...data, updatedAt: new Date() } as T;
      store.set(id, updated);
      return updated;
    },

    async updateMany(args: DelegateArgs): Promise<{ count: number }> {
      const where = args.where ?? {};
      const data = (args.data ?? {}) as Record<string, unknown>;
      let count = 0;
      for (const [key, record] of Array.from(store.entries())) {
        if (matchWhere(record, where)) {
          const updated = { ...record, ...data } as T;
          store.set(key, updated);
          count += 1;
        }
      }
      return { count };
    },

    async count(args: DelegateArgs): Promise<number> {
      const where = args.where ?? {};
      let n = 0;
      for (const record of store.values()) {
        if (matchWhere(record, where)) n += 1;
      }
      return n;
    },

    async delete(args: DelegateArgs): Promise<T> {
      const where = args.where ?? {};
      // 按 id 删除
      if (typeof where.id === 'string') {
        const existing = store.get(where.id);
        if (!existing) {
          const err = new Error('mock delete: record not found');
          err.name = 'PrismaClientKnownRequestError';
          throw err;
        }
        store.delete(where.id);
        return existing;
      }
      // 按复合唯一键删除(userId_tenantId)
      if (where.userId_tenantId && typeof where.userId_tenantId === 'object') {
        const cond = where.userId_tenantId as { userId?: string; tenantId?: string };
        for (const [key, record] of Array.from(store.entries())) {
          if (record['userId' as keyof T] === cond.userId && record['tenantId' as keyof T] === cond.tenantId) {
            store.delete(key);
            return record;
          }
        }
        const err = new Error('mock delete: record not found');
        err.name = 'PrismaClientKnownRequestError';
        throw err;
      }
      // 按唯一字段删除
      for (const field of uniqueFields) {
        if (typeof where[field] === 'string') {
          for (const [key, record] of Array.from(store.entries())) {
            if (record[field as keyof T] === where[field]) {
              store.delete(key);
              return record;
            }
          }
        }
      }
      // findFirst 风格:按 where 条件删除首条匹配
      for (const [key, record] of Array.from(store.entries())) {
        if (matchWhere(record, where)) {
          store.delete(key);
          return record;
        }
      }
      const err = new Error('mock delete: record not found');
      err.name = 'PrismaClientKnownRequestError';
      throw err;
    },

    async deleteMany(args: DelegateArgs): Promise<{ count: number }> {
      const where = args.where ?? {};
      let count = 0;
      for (const [key, record] of Array.from(store.entries())) {
        if (matchWhere(record, where)) {
          store.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };
}

function generateId(): string {
  return `mock-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// ============================================================
// Prisma Mock 主体
// ============================================================

class PrismaMock {
  readonly userStore = new Map<string, MockUser>();
  readonly tenantStore = new Map<string, MockTenant>();
  readonly tenantMemberStore = new Map<string, MockTenantMember>();
  readonly sessionStore = new Map<string, MockSession>();
  readonly analysisStore = new Map<string, MockAnalysis>();

  // 各模型委托(唯一字段对应 schema.prisma 中的 @unique)
  // tenantMember 委托:支持 include user / include tenant 关系解析
  readonly tenantMember = createModelDelegate<MockTenantMember>(
    this.tenantMemberStore,
    ['userId_tenantId'],
    (record, include) => {
      const enriched = { ...record } as MockTenantMember & {
        user?: Partial<MockUser>;
        tenant?: Partial<MockTenant>;
      };
      if ('user' in include) {
        const userSelect = (include as { user?: { select?: Record<string, boolean> } }).user?.select;
        const fullUser = this.userStore.get(record.userId);
        if (fullUser) {
          if (userSelect) {
            // 仅返回 select 指定字段
            const picked: Partial<MockUser> = {};
            for (const [field, enabled] of Object.entries(userSelect)) {
              if (enabled && field in fullUser) {
                (picked as Record<string, unknown>)[field] = (fullUser as Record<string, unknown>)[field];
              }
            }
            enriched.user = picked;
          } else {
            enriched.user = fullUser;
          }
        }
      }
      if ('tenant' in include) {
        const tenantSelect = (include as { tenant?: { select?: Record<string, boolean> } }).tenant?.select;
        const fullTenant = this.tenantStore.get(record.tenantId);
        if (fullTenant) {
          if (tenantSelect) {
            const picked: Partial<MockTenant> = {};
            for (const [field, enabled] of Object.entries(tenantSelect)) {
              if (enabled && field in fullTenant) {
                (picked as Record<string, unknown>)[field] = (fullTenant as Record<string, unknown>)[field];
              }
            }
            enriched.tenant = picked;
          } else {
            enriched.tenant = fullTenant;
          }
        }
      }
      return enriched as unknown as MockTenantMember;
    },
  );

  // user 委托:支持 include memberships 关系解析(用于 /auth/me)
  readonly user = createModelDelegate<MockUser>(
    this.userStore,
    ['feishuUnionId', 'feishuOpenId'],
    (record, include) => {
      const enriched = { ...record } as MockUser & {
        memberships?: Array<MockTenantMember & { tenant?: Partial<MockTenant> }>;
      };
      if ('memberships' in include) {
        const nestedInclude = (include as { memberships?: { include?: Record<string, unknown> } }).memberships?.include;
        const memberships: Array<MockTenantMember & { tenant?: Partial<MockTenant> }> = [];
        for (const m of this.tenantMemberStore.values()) {
          if (m.userId === record.id) {
            const mWithTenant = { ...m } as MockTenantMember & { tenant?: Partial<MockTenant> };
            if (nestedInclude && 'tenant' in nestedInclude) {
              const tenantSelect = (nestedInclude as { tenant?: { select?: Record<string, boolean> } }).tenant?.select;
              const fullTenant = this.tenantStore.get(m.tenantId);
              if (fullTenant) {
                if (tenantSelect) {
                  const picked: Partial<MockTenant> = {};
                  for (const [field, enabled] of Object.entries(tenantSelect)) {
                    if (enabled && field in fullTenant) {
                      (picked as Record<string, unknown>)[field] = (fullTenant as Record<string, unknown>)[field];
                    }
                  }
                  mWithTenant.tenant = picked;
                } else {
                  mWithTenant.tenant = fullTenant;
                }
              }
            }
            memberships.push(mWithTenant);
          }
        }
        enriched.memberships = memberships;
      }
      return enriched as unknown as MockUser;
    },
  );

  readonly tenant = createModelDelegate<MockTenant>(this.tenantStore, ['feishuTenantKey']);
  readonly session = createModelDelegate<MockSession>(this.sessionStore, ['refreshTokenHash']);
  readonly analysis = createModelDelegate<MockAnalysis>(this.analysisStore, []);

  /**
   * 事务:直接在 mock 自身上执行回调(无真实隔离,但保证顺序)
   */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $disconnect(): Promise<void> {
    // no-op
  }

  // ============================================================
  // 测试辅助方法
  // ============================================================

  /** 清空所有 store(每个测试 beforeEach 调用) */
  __clear(): void {
    this.userStore.clear();
    this.tenantStore.clear();
    this.tenantMemberStore.clear();
    this.sessionStore.clear();
    this.analysisStore.clear();
  }

  /**
   * 直接插入用户(跳过 create 逻辑,用于预置测试数据)
   */
  __insertUser(user: Partial<MockUser> & { id: string; tenantId: string; feishuUnionId: string }): MockUser {
    const now = new Date();
    const full: MockUser = {
      feishuOpenId: `ou_${user.id}`,
      name: 'test-user',
      avatar: '',
      email: null,
      phone: null,
      role: 'student',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      ...user,
    };
    this.userStore.set(full.id, full);
    return full;
  }

  __insertTenant(tenant: Partial<MockTenant> & { id: string; name: string }): MockTenant {
    const now = new Date();
    const full: MockTenant = {
      type: 'individual',
      feishuTenantKey: null,
      plan: 'free',
      status: 'active',
      maxSeats: 1,
      parentId: null,
      createdAt: now,
      ...tenant,
    };
    this.tenantStore.set(full.id, full);
    return full;
  }

  __insertSession(session: Partial<MockSession> & { id: string; userId: string; tenantId: string; refreshTokenHash: string }): MockSession {
    const now = new Date();
    const full: MockSession = {
      userAgent: 'test-ua',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      revokedAt: null,
      ...session,
    };
    this.sessionStore.set(full.id, full);
    return full;
  }

  __insertAnalysis(analysis: Partial<MockAnalysis> & { id: string; tenantId: string; userId: string }): MockAnalysis {
    const now = new Date();
    const full: MockAnalysis = {
      workType: 'painting',
      imageUrl: 'https://example.com/test.jpg',
      title: null,
      remark: null,
      status: 'success',
      result: null,
      failureReason: null,
      overallScore: null,
      durationMs: null,
      createdAt: now,
      completedAt: null,
      ...analysis,
    };
    this.analysisStore.set(full.id, full);
    return full;
  }
}

/**
 * 全局 Prisma Mock 单例
 */
export const prismaMock: PrismaMock = new PrismaMock();

/**
 * 兼容别名
 */
export const prismaState: PrismaMock = prismaMock;

/**
 * 暴露 Prisma 特殊值(analysis.repository 使用 Prisma.DbNull)
 */
export const prismaDbNull = Prisma.DbNull;
export const prismaJsonNull = Prisma.JsonNull;

/**
 * 创建匹配 src/config/prisma.ts 导出的模块对象
 * 注意:返回的 prisma() 类型为 unknown,运行时由 vi.mock 替换
 */
export function createPrismaModule(): {
  initPrisma: () => PrismaMock;
  prisma: () => PrismaMock;
  closePrisma: () => Promise<void>;
} {
  return {
    initPrisma: () => prismaMock,
    prisma: () => prismaMock,
    closePrisma: async () => {
      prismaMock.__clear();
    },
  };
}
