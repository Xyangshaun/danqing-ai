// ============================================================
// Redis Mock(内存 Map 模拟 ioredis)
// 对应源码:src/config/redis.ts(initRedis / redis / closeRedis)
// 对应文档:auth-design.md §1.2 步骤 3(state 缓存)+ §2.2(黑名单)+ §3.3(限流)
//
// 支持方法:get / set(EX 选项) / del / expire / exists / incr / quit
// 支持 TTL 过期语义(惰性删除)
// 提供 __clear / __dump / __rawSet 供测试控制
// ============================================================

interface RedisEntry {
  value: string;
  expiresAt: number | null; // 绝对时间戳(ms),null 表示永不过期
}

/**
 * Redis Mock 单例(共享状态)
 * 测试中通过 redisState 访问内部 store 进行断言或控制
 */
class RedisMock {
  private readonly store = new Map<string, RedisEntry>();

  /**
   * 惰性过期检查:访问时删除已过期 key
   */
  private refresh(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.refresh(key);
    const entry = this.store.get(key);
    return entry?.value ?? null;
  }

  /**
   * SET key value [EX seconds]
   * 支持 ioredis 的 set(key, value, 'EX', ttl) 调用形式
   */
  async set(
    key: string,
    value: string,
    modeOrExpiry?: string | number,
    ttl?: number,
  ): Promise<'OK'> {
    let expiresAt: number | null = null;
    // 形式:set(key, value, 'EX', seconds)
    if (modeOrExpiry === 'EX' && typeof ttl === 'number') {
      expiresAt = Date.now() + ttl * 1000;
    }
    // 形式:set(key, value, seconds)(部分调用)
    if (typeof modeOrExpiry === 'number') {
      expiresAt = Date.now() + modeOrExpiry * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      this.refresh(key);
      if (this.store.has(key)) count += 1;
    }
    return count;
  }

  /**
   * INCR:key 不存在时初始化为 0 再 +1
   * 用于限流计数(auth-design.md §3.3)
   */
  async incr(key: string): Promise<number> {
    this.refresh(key);
    const entry = this.store.get(key);
    const next = entry ? parseInt(entry.value, 10) + 1 : 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? null,
    });
    return next;
  }

  async quit(): Promise<void> {
    // no-op
  }

  // ============================================================
  // 测试辅助方法(仅供测试调用,不对应 Redis 真实命令)
  // ============================================================

  /** 清空所有 key(每个测试 beforeEach 调用) */
  __clear(): void {
    this.store.clear();
  }

  /**
   * 直接读取 key 的原始 entry(含 TTL 信息),不做过期删除
   * 用于断言 state payload 内容与 TTL
   */
  __peek(key: string): RedisEntry | undefined {
    return this.store.get(key);
  }

  /** 返回当前所有 key(用于断言黑名单写入) */
  __keys(): string[] {
    return Array.from(this.store.keys());
  }

  /** 直接设置 key(带可选 TTL),用于预置测试数据 */
  __rawSet(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }
}

/**
 * 全局 Redis Mock 单例
 * setup.ts 中 vi.mock 工厂返回的 redis() 即返回此实例
 * 测试文件可直接 import { redisMock, redisState } 进行控制与断言
 */
export const redisMock: RedisMock = new RedisMock();

/**
 * 兼容别名:部分测试通过 redisState 访问
 */
export const redisState: RedisMock = redisMock;

/**
 * 创建匹配 src/config/redis.ts 导出的模块对象
 * setup.ts 的 vi.mock 工厂调用此函数
 */
export function createRedisModule(): {
  initRedis: () => RedisMock;
  redis: () => RedisMock;
  closeRedis: () => Promise<void>;
} {
  return {
    initRedis: () => redisMock,
    redis: () => redisMock,
    closeRedis: async () => {
      redisMock.__clear();
    },
  };
}
