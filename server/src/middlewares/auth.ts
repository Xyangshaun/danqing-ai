// ============================================================
// JWT 认证中间件
// 对应文档:auth-design.md §2.1 + api-contract-v1.md §1.3
// 从 Authorization: Bearer {access_token} 解析 JWT(RS256 校验)
// 失败返回:2001(未授权)/ 2002(过期)/ 2005(签名无效)
// ============================================================

import type { RequestHandler } from 'express';
import type { JwtPayload } from 'jsonwebtoken';
import type { ClientType, UserRole } from '../types/api-contract.js';
import { ErrorCode } from '../types/api-contract.js';
import { error } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { jwtService } from '../services/jwt.service.js';
import { redis } from '../config/redis.js';

/**
 * 已认证的 Request 类型守卫
 * 在 controller 中使用 req.userId / req.tenantId 等(经 authMiddleware 注入)
 */
export interface AuthedRequest {
  userId: string;
  tenantId: string;
  role: UserRole;
  feishuOpenId: string;
  jti: string;
  client?: ClientType;
  deviceId?: string;
}

/**
 * JWT 认证中间件
 * 校验顺序:
 * 1. Authorization 头存在,且为 Bearer schema
 * 2. JWT 签名有效(RS256 公钥校验)
 * 3. JWT 未过期(exp)
 * 4. JWT iss / aud 匹配
 * 5. jti 不在 Redis 黑名单
 */
export const authMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    // JWT 校验(RS256 公钥)
    let payload: JwtPayload;
    try {
      payload = jwtService.verifyAccessToken(token);
    } catch (err) {
      const errName = (err as Error).name;
      if (errName === 'TokenExpiredError') {
        return error(res, ErrorCode.TOKEN_EXPIRED, 'access_token 已过期,请刷新令牌', 401);
      }
      if (errName === 'JsonWebTokenError') {
        return error(res, ErrorCode.TOKEN_SIGNATURE_INVALID, 'token 签名无效', 401);
      }
      logger.warn({ err: (err as Error).message }, '[auth] verify failed');
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    // jti 黑名单校验(对应 auth-design.md §0 C7)
    if (payload.jti) {
      const blacklisted = await redis().exists(`blacklist:access:${payload.jti}`);
      if (blacklisted === 1) {
        logger.warn({ sub: payload.sub, jti: payload.jti }, '[auth] token revoked');
        return error(res, ErrorCode.UNAUTHORIZED, 'token 已被撤销,请重新登录', 401);
      }
    }

    // 注入到 req(由 express.d.ts 类型扩展支持)
    req.userId = payload.sub;
    req.tenantId = (payload as JwtPayload & { tenant_id?: string }).tenant_id;
    req.role = (payload as JwtPayload & { role?: UserRole }).role;
    req.feishuOpenId = (payload as JwtPayload & { feishu_open_id?: string }).feishu_open_id;
    req.jti = payload.jti;

    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, '[auth] unexpected error');
    return error(res, ErrorCode.INTERNAL_ERROR, '服务器内部错误', 500);
  }
};
