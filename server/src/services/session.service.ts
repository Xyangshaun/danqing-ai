// ============================================================
// 会话管理服务
// 对应文档:auth-design.md §2.2 refresh_token 设计
// - refresh_token 哈希存储(SHA-256,不存明文)
// - 滚动刷新:旧 refresh_token jti 加入 Redis 黑名单 TTL=剩余时间
// - 撤销:Session.revokedAt 置位 + Redis 黑名单
// ============================================================

import { sessionRepository } from '../repositories/session.repository.js';
import { redis } from '../config/redis.js';
import { sha256 } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { Session } from '@prisma/client';

class SessionServiceClass {
  /**
   * 创建会话(登录成功后调用)
   * 同时写入 DB(Session 表)与 Redis(快速校验路径)
   */
  async createSession(params: {
    userId: string;
    tenantId: string;
    refreshToken: string; // 明文,仅此处持有,不落库
    userAgent: string;
    ip: string;
    expiresAt: Date;
    refreshJti: string;
  }): Promise<Session> {
    const refreshTokenHash = sha256(params.refreshToken);

    // 写入 DB(refresh_token_hash)
    const session = await sessionRepository.create({
      user: { connect: { id: params.userId } },
      tenant: { connect: { id: params.tenantId } },
      refreshTokenHash,
      userAgent: params.userAgent,
      ip: params.ip,
      expiresAt: params.expiresAt,
    });

    // 写入 Redis(快速校验,不存明文 token)
    const redisKey = `session:${params.userId}:${params.refreshJti}`;
    const redisValue = JSON.stringify({
      sessionId: session.id,
      tenantId: params.tenantId,
      refreshTokenHash,
      ip: params.ip,
      userAgent: params.userAgent,
      createdAt: session.createdAt.toISOString(),
    });
    const ttlSec = Math.max(1, Math.floor((params.expiresAt.getTime() - Date.now()) / 1000));
    await redis().set(redisKey, redisValue, 'EX', ttlSec);

    logger.debug({ sessionId: session.id, userId: params.userId }, '[session] created');
    return session;
  }

  /**
   * 校验 refresh_token(滚动刷新前置校验)
   * 1. JWT 签名 + 过期(由 jwtService.verifyRefreshToken 完成)
   * 2. jti 不在 Redis 黑名单
   * 3. Session 表存在且未撤销且未过期
   * 4. refresh_token_hash 一致
   * @returns { session, jti } 校验通过返回 session 与 jti
   */
  async validateRefreshToken(refreshToken: string): Promise<{ session: Session; jti: string }> {
    // 注:JWT 签名校验在调用方完成,这里只做 Session/黑名单校验
    const { jwtService } = await import('./jwt.service.js');
    const payload = jwtService.verifyRefreshToken(refreshToken);
    const jti = payload.jti;
    const userId = payload.sub;

    // 1. Redis 黑名单校验
    const blacklisted = await redis().exists(`blacklist:refresh:${jti}`);
    if (blacklisted === 1) {
      logger.warn({ userId, jti }, '[session] refresh token in blacklist');
      throw new Error('refresh_token in blacklist');
    }

    // 2. DB Session 校验
    const refreshTokenHash = sha256(refreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(refreshTokenHash);
    if (!session) {
      logger.warn({ userId, jti }, '[session] refresh token hash not found');
      throw new Error('refresh_token not found');
    }
    if (session.revokedAt !== null) {
      logger.warn({ userId, jti, sessionId: session.id }, '[session] session revoked');
      throw new Error('session revoked');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      logger.warn({ userId, jti, sessionId: session.id }, '[session] session expired');
      throw new Error('session expired');
    }
    if (session.userId !== userId) {
      logger.warn({ userId, jti, sessionId: session.id }, '[session] user mismatch');
      throw new Error('user mismatch');
    }

    return { session, jti };
  }

  /**
   * 滚动刷新:旧 refresh_token jti 加入黑名单,签发新 token
   * 同时更新 Session.refreshTokenHash
   */
  async rotateRefreshToken(params: {
    oldRefreshToken: string;
    oldJti: string;
    newRefreshToken: string;
    newJti: string;
    sessionId: string;
    tenantId: string;
    expiresAt: Date;
  }): Promise<void> {
    // 1. 旧 jti 加入黑名单,TTL = 剩余自然过期时间(避免黑名单无限增长)
    const oldPayload = (await import('./jwt.service.js')).jwtService.verifyRefreshToken(params.oldRefreshToken);
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl = (oldPayload.exp ?? nowSec) - nowSec;
    if (remainingTtl > 0) {
      await redis().set(`blacklist:refresh:${params.oldJti}`, '1', 'EX', remainingTtl);
    }

    // 2. 更新 DB Session.refreshTokenHash
    const newHash = sha256(params.newRefreshToken);
    const updated = await sessionRepository.updateRefreshTokenHash(
      params.tenantId,
      params.sessionId,
      newHash,
    );
    if (!updated) {
      throw new Error('failed to update session refresh token hash');
    }

    // 3. 删除旧 Redis session,写入新 Redis session
    const userId = oldPayload.sub;
    await redis().del(`session:${userId}:${params.oldJti}`);
    const redisKey = `session:${userId}:${params.newJti}`;
    const redisValue = JSON.stringify({
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      refreshTokenHash: newHash,
      createdAt: new Date().toISOString(),
    });
    const ttlSec = Math.max(1, Math.floor((params.expiresAt.getTime() - Date.now()) / 1000));
    await redis().set(redisKey, redisValue, 'EX', ttlSec);

    logger.debug({ sessionId: params.sessionId, userId }, '[session] rotated');
  }

  /**
   * 撤销会话(登出)
   * @returns 是否撤销成功
   */
  async revokeByRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const payload = (await import('./jwt.service.js')).jwtService.verifyRefreshToken(refreshToken);
      // 加入黑名单
      const nowSec = Math.floor(Date.now() / 1000);
      const remainingTtl = (payload.exp ?? nowSec) - nowSec;
      if (remainingTtl > 0) {
        await redis().set(`blacklist:refresh:${payload.jti}`, '1', 'EX', remainingTtl);
      }
      // 删除 Redis session
      await redis().del(`session:${payload.sub}:${payload.jti}`);
    } catch {
      // token 已过期或非法,继续走 DB 撤销流程
    }

    const hash = sha256(refreshToken);
    return sessionRepository.revokeByRefreshTokenHash(hash);
  }

  /**
   * 撤销某用户所有有效会话(全端登出)
   * @returns 撤销的会话数
   */
  async revokeAllByUser(userId: string, tenantId?: string): Promise<number> {
    const count = await sessionRepository.revokeAllByUser(userId, tenantId);
    logger.info({ userId, tenantId, count }, '[session] revoked all');
    return count;
  }

  /**
   * 撤销 access_token(登出时同时将 access_token jti 加入黑名单)
   */
  async revokeAccessTokenJti(jti: string, expSec: number): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl = expSec - nowSec;
    if (remainingTtl > 0) {
      await redis().set(`blacklist:access:${jti}`, '1', 'EX', remainingTtl);
    }
  }
}

export const sessionService = new SessionServiceClass();
