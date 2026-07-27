// ============================================================
// Redis 客户端(ioredis)
// 用途:OAuth state 缓存 / Refresh token 黑名单 / Rate Limiting 计数 / 配额计数
// 对应文档:auth-design.md §1.2 步骤 3, §2.2, §3.3
// ============================================================

import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisInstance: Redis | null = null;

/**
 * 初始化 Redis 单例
 * 在 src/index.ts 启动时调用
 */
export function initRedis(): Redis {
  if (redisInstance) {
    return redisInstance;
  }
  const redisUrl = env().redisUrl;
  redisInstance = new Redis(redisUrl, {
    // 连接失败时打印日志,不重连到死循环
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError(err: Error) {
      logger.warn({ err: err.message }, '[redis] reconnectOnError triggered');
      // 只对 READONLY 错误重连
      return err.message.includes('READONLY');
    },
  });

  redisInstance.on('connect', () => {
    logger.info('[redis] connected');
  });

  redisInstance.on('error', (err: Error) => {
    // 不暴露完整错误(可能含 URL/密码)
    logger.error({ err: err.message }, '[redis] connection error');
  });

  return redisInstance;
}

/**
 * 获取 Redis 单例
 * @throws Error 未初始化时抛错
 */
export function redis(): Redis {
  if (!redisInstance) {
    throw new Error('[redis] not initialized. Call initRedis() at startup first.');
  }
  return redisInstance;
}

/**
 * 优雅关闭 Redis 连接
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('[redis] closed');
  }
}
