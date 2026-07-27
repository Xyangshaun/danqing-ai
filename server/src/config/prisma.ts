// ============================================================
// Prisma 客户端单例
// 多租户强制过滤不在 Prisma 扩展层做,而是由 Repository 层显式传 tenantId
// (对应 data-model-v1.md §7.2:Repository 层强制过滤)
// 理由:Prisma $extends 全局注入会让管理后台聚合查询难以绕过,显式更安全
// ============================================================

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let prismaInstance: PrismaClient | null = null;

/**
 * 初始化 Prisma 单例
 * 在 src/index.ts 启动时调用
 */
export function initPrisma(): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }
  prismaInstance = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // 日志输出(脱敏:Prisma 默认 query 日志可能含参数,生产环境关闭)
  // 使用类型断言绕过 Prisma 严格泛型($on 的 'never' 类型推断与 emit:'event' 不匹配)
  type PrismaEventEmitter = {
    on(event: 'warn', listener: (e: { target?: string; message?: string }) => void): void;
    on(event: 'error', listener: (e: { target?: string; message?: string }) => void): void;
  };
  const eventEmitter = prismaInstance as unknown as PrismaEventEmitter;
  eventEmitter.on('warn', (e) => {
    logger.warn({ target: e.target, message: e.message }, '[prisma] warn');
  });
  eventEmitter.on('error', (e) => {
    logger.error({ target: e.target, message: e.message }, '[prisma] error');
  });

  return prismaInstance;
}

/**
 * 获取 Prisma 单例
 * @throws Error 未初始化时抛错
 */
export function prisma(): PrismaClient {
  if (!prismaInstance) {
    throw new Error('[prisma] not initialized. Call initPrisma() at startup first.');
  }
  return prismaInstance;
}

/**
 * 优雅关闭 Prisma 连接
 */
export async function closePrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('[prisma] disconnected');
  }
}
