// ============================================================
// 限流中间件(基于 Redis 计数器,支持多实例)
// 对应文档:auth-design.md §3.3 Rate Limiting
// - /auth/feishu/authorize: 10 次/分钟/IP
// - /auth/feishu/callback: 5 次/分钟/IP
// - /auth/refresh: 20 次/分钟/IP
// - 其他 /api/*: 60 次/分钟/用户
// 命中后返回 429 + ErrorCode.RATE_LIMITED(9005)
// ============================================================

import type { RequestHandler } from 'express';
import { ErrorCode } from '../types/api-contract.js';
import { error } from '../utils/response.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * 客户端 IP 提取(优先 X-Forwarded-For 首段)
 * 注意:生产环境应通过可信代理(trust proxy)配置防止伪造
 */
function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    return xff.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}

/**
 * 创建基于 Redis 的限流中间件
 * @param maxPerMin 每分钟最大请求数
 * @param scope 限流维度,如 'auth' / 'callback' / 'refresh' / 'api'
 */
export function createRateLimiter(maxPerMin: number, scope: string): RequestHandler {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    // 限流 key 形如 rl:auth:1.2.3.4:202607271030
    // 使用分钟级时间窗,自动滚动
    const now = new Date();
    const windowKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const key = `rl:${scope}:${ip}:${windowKey}`;

    try {
      // 原子自增 + TTL 设置
      const count = await redis().incr(key);
      if (count === 1) {
        // 第一次请求,设置 60s 过期
        await redis().expire(key, 60);
      }
      if (count > maxPerMin) {
        logger.warn({ ip, scope, count, max: maxPerMin, traceId: req.traceId }, '[rate-limit] hit');
        res.setHeader('Retry-After', '60');
        return error(res, ErrorCode.RATE_LIMITED, '请求过于频繁,请稍后再试', 429);
      }
      next();
    } catch (err) {
      // Redis 不可达时:Deny by default 拒绝请求(对应 auth-design.md §3.3)
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, scope, ip }, '[rate-limit] redis error');
      return error(res, ErrorCode.CACHE_ERROR, '缓存服务不可用', 503);
    }
  };
}

/**
 * 预设限流器工厂函数(按 auth-design.md §3.3 配置)
 * 通过工厂函数延迟读取 env,确保启动顺序正确
 */
export const authRateLimiter = (): RequestHandler => createRateLimiter(env().rateLimitAuthPerMin, 'auth');

export const callbackRateLimiter = (): RequestHandler => createRateLimiter(env().rateLimitCallbackPerMin, 'callback');

export const refreshRateLimiter = (): RequestHandler => createRateLimiter(env().rateLimitRefreshPerMin, 'refresh');

export const apiRateLimiter = (): RequestHandler => createRateLimiter(env().rateLimitApiPerMin, 'api');
