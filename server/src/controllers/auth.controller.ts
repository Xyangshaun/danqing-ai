// ============================================================
// 认证 Controller
// 对应 API:
//   GET  /auth/feishu/authorize
//   GET  /auth/feishu/callback
//   POST /auth/refresh
//   POST /auth/logout
//   GET  /auth/me
// ============================================================

import type { RequestHandler, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { jwtService } from '../services/jwt.service.js';
import { env } from '../config/env.js';
import { success, error } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';

/**
 * 从请求中提取客户端上下文(IP + UA + device_id + client)
 * device_id 来自 X-Client-Context 头(JSON 格式)或 X-Device-Id 头
 */
function extractClientContext(req: Request): {
  clientIp: string;
  userAgent: string;
  deviceId: string;
  client: 'web' | 'admin' | 'mobile';
} {
  const xff = req.headers['x-forwarded-for'];
  const clientIp =
    (typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined) ?? req.ip ?? 'unknown';

  const userAgent = req.headers['user-agent'] ?? 'unknown';

  let deviceId = '';
  let client: 'web' | 'admin' | 'mobile' = 'web';
  const clientContextRaw = req.headers['x-client-context'];
  if (typeof clientContextRaw === 'string') {
    try {
      const parsed = JSON.parse(clientContextRaw) as { device_id?: string; client?: string };
      deviceId = parsed.device_id ?? '';
      if (parsed.client === 'web' || parsed.client === 'admin' || parsed.client === 'mobile') {
        client = parsed.client;
      }
    } catch {
      // 解析失败:device_id 留空,后续 state 校验会失败
    }
  }
  // X-Device-Id 备选
  if (!deviceId) {
    const xDeviceId = req.headers['x-device-id'];
    if (typeof xDeviceId === 'string') {
      deviceId = xDeviceId;
    }
  }
  // X-Client 备选
  const xClient = req.headers['x-client'];
  if (typeof xClient === 'string' && (xClient === 'web' || xClient === 'admin' || xClient === 'mobile')) {
    client = xClient;
  }

  return { clientIp, userAgent, deviceId, client };
}

/**
 * 设置 refresh_token Cookie(HttpOnly; Secure; SameSite=Strict; Path=/auth)
 */
function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const cfg = env();
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    domain: cfg.cookieDomain || undefined,
    path: cfg.cookiePath,
    maxAge: cfg.cookieMaxAge * 1000,
  });
}

/**
 * 清除 refresh_token Cookie
 */
function clearRefreshTokenCookie(res: Response): void {
  const cfg = env();
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    domain: cfg.cookieDomain || undefined,
    path: cfg.cookiePath,
  });
}

/**
 * GET /auth/feishu/authorize
 * 获取飞书 OAuth 授权 URL
 */
export const feishuAuthorize: RequestHandler = async (req, res, next) => {
  try {
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }

    // redirect_uri 可由客户端覆盖(Phase 1 简化:使用 env 默认)
    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;

    const result = await authService.authorize({
      redirectUri,
      client,
      clientIp,
      userAgent,
      deviceId,
    });

    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /auth/feishu/callback
 * 飞书 OAuth 回调处理
 * 对应 auth-design.md §1.2 步骤 5-10
 */
export const feishuCallback: RequestHandler = async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !state) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:code 或 state', 400);
    }

    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }

    const result = await authService.handleCallback({
      code,
      state,
      clientIp,
      userAgent,
      deviceId,
      client,
    });

    // refresh_token 写 HttpOnly Cookie
    setRefreshTokenCookie(res, result.refreshToken);

    // 响应体返回 access_token(不返回 refresh_token)
    return success(
      res,
      {
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt,
        isFirstLogin: result.isFirstLogin,
        user: result.user,
        tenant: result.tenant,
      },
      '登录成功',
    );
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/refresh
 * 刷新 access_token(从 Cookie 读 refresh_token)
 */
export const authRefresh: RequestHandler = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      return error(res, ErrorCode.REFRESH_TOKEN_INVALID, 'refresh_token 无效,请重新登录', 401);
    }

    const result = await authService.refresh(refreshToken);
    return success(res, result, 'success');
  } catch (err) {
    // 刷新失败:清 Cookie 强制重新登录
    clearRefreshTokenCookie(res);
    return next(err);
  }
};

/**
 * POST /auth/logout
 * 登出并撤销会话
 * 需鉴权(authMiddleware 已注入 req.userId / req.jti)
 */
export const authLogout: RequestHandler = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    const revokeAll = req.body?.revokeAll === true;

    // 从 access_token 提取 exp(用于黑名单 TTL)
    let accessJti: string | undefined;
    let accessExpSec: number | undefined;
    if (req.jti) {
      accessJti = req.jti;
      // 从 JWT 解析 exp(简化:用 jwtService.verifyAccessToken)
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const payload = jwtService.verifyAccessToken(authHeader.slice('Bearer '.length));
          accessExpSec = payload.exp;
        } catch {
          // token 已过期/无效,跳过黑名单(不影响登出)
        }
      }
    }

    const result = await authService.logout({
      refreshToken,
      accessJti,
      accessExpSec,
      userId: req.userId,
      tenantId: req.tenantId,
      revokeAll,
    });

    clearRefreshTokenCookie(res);
    return success(res, result, '已登出');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /auth/me
 * 获取当前用户信息(含 memberships)
 */
export const authMe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const result = await authService.getCurrentUserInfo(req.userId);
    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};
