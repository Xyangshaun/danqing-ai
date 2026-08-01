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
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { jwtService } from '../services/jwt.service.js';
import { env } from '../config/env.js';
import { success, error } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';
import { setCsrfTokenCookie, clearCsrfTokenCookie } from '../middlewares/csrf.js';
import { getClientIp } from '../utils/ip.js';

// ============================================================
// Phase 5:Zod 校验 Schemas(手机 OTP / 邀请码 / 管理员认证)
// ============================================================

const phoneOtpPurposeSchema = z.enum(['register', 'login', 'bind', 'reset']);

const phoneOtpSchema = z.object({
  phone: z.string().min(1).max(20),
  purpose: phoneOtpPurposeSchema,
  tenantId: z.string().min(1).optional(),
});

const phoneVerifySchema = z.object({
  phone: z.string().min(1).max(20),
  code: z.string().length(6),
  purpose: phoneOtpPurposeSchema,
  invitationCode: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(64).optional(),
});

const invitationRedeemSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64).optional(),
});

const adminRegisterSchema = z.object({
  email: z.string().email().max(128),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(64),
  invitationCode: z.string().min(1).max(32),
  tenantName: z.string().min(1).max(128).optional(),
});

const adminLoginSchema = z.object({
  email: z.string().email().max(128),
  password: z.string().min(1).max(128),
});

const phoneBindSchema = z.object({
  phone: z.string().min(1).max(20),
  code: z.string().length(6),
});

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
  // G9:统一使用 utils/ip.ts 的 getClientIp(原内联 xff 实现已删除)
  const clientIp = getClientIp(req);

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
    // csrf_token 写非 HttpOnly Cookie(双提交 Cookie 模式,前端读后以 X-CSRF-Token 头回传)
    setCsrfTokenCookie(res);

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
 * client 从 X-Client 头解析(默认 web)
 */
export const authRefresh: RequestHandler = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      return error(res, ErrorCode.REFRESH_TOKEN_INVALID, 'refresh_token 无效,请重新登录', 401);
    }

    // 从 X-Client 头解析客户端类型(与 extractClientContext 一致)
    const xClient = req.header('X-Client');
    const client: 'web' | 'admin' | 'mobile' =
      xClient === 'web' || xClient === 'admin' || xClient === 'mobile' ? xClient : 'web';

    const result = await authService.refresh(refreshToken, client);
    return success(res, result, 'success');
  } catch (err) {
    // 刷新失败:清 Cookie 强制重新登录
    clearRefreshTokenCookie(res);
    clearCsrfTokenCookie(res);
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
    clearCsrfTokenCookie(res);
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

// ============================================================
// Phase 5:手机 OTP / 邀请码 / 院校管理员认证
// ============================================================

/**
 * POST /auth/phone/otp
 * 发送手机验证码(无需鉴权,限流 3/min/IP)
 */
export const phoneOtp: RequestHandler = async (req, res, next) => {
  try {
    const parseResult = phoneOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp } = extractClientContext(req);
    const result = await authService.sendPhoneOtp({
      phone: parseResult.data.phone,
      purpose: parseResult.data.purpose,
      clientIp,
      tenantId: parseResult.data.tenantId,
      // bind 场景需要 userId(已登录用户),由路由层鉴权注入
      userId: req.userId,
    });
    return success(res, result, '验证码已发送');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/phone/verify
 * 验证码校验 + 登录/注册(无需鉴权,限流 5/min)
 */
export const phoneVerify: RequestHandler = async (req, res, next) => {
  try {
    const parseResult = phoneVerifySchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }
    const result = await authService.verifyPhoneOtp({
      phone: parseResult.data.phone,
      code: parseResult.data.code,
      purpose: parseResult.data.purpose,
      invitationCode: parseResult.data.invitationCode,
      name: parseResult.data.name,
      clientIp,
      userAgent,
      deviceId,
      client,
      userId: req.userId,
      tenantId: req.tenantId,
    });
    // 登录类场景:refresh_token 写 Cookie + csrf_token 写 Cookie
    if ('accessToken' in result && result.accessToken) {
      // verifyPhoneOtp 返回 PhoneVerifyResponse(复用 FeishuCallbackResponse)
      // 此处不直接持有 refreshToken,由 service 内部已落 Session
      // refresh_token Cookie 需要后续扩展 service 返回;当前简化:仅返回 access_token
      setCsrfTokenCookie(res);
    }
    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/invitation/redeem
 * 邀请码兑换 + 加入租户(无需鉴权,限流 5/min)
 */
export const invitationRedeem: RequestHandler = async (req, res, next) => {
  try {
    const parseResult = invitationRedeemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }
    const result = await authService.redeemInvitation({
      code: parseResult.data.code,
      name: parseResult.data.name,
      clientIp,
      userAgent,
      deviceId,
      client,
      existingUserId: req.userId,
    });
    setCsrfTokenCookie(res);
    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/register/admin
 * 院校管理员注册(邮箱+密码,需邀请码,限流 2/min/IP)
 */
export const adminRegister: RequestHandler = async (req, res, next) => {
  try {
    const parseResult = adminRegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }
    const result = await authService.registerAdmin({
      email: parseResult.data.email,
      password: parseResult.data.password,
      name: parseResult.data.name,
      invitationCode: parseResult.data.invitationCode,
      tenantName: parseResult.data.tenantName,
      clientIp,
      userAgent,
      deviceId,
      client,
    });
    setCsrfTokenCookie(res);
    return success(res, result, '注册成功');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/login/admin
 * 院校管理员登录(邮箱+密码,限流 5/min)
 */
export const adminLogin: RequestHandler = async (req, res, next) => {
  try {
    const parseResult = adminLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    if (!deviceId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:device_id', 400);
    }
    const result = await authService.loginAdmin({
      email: parseResult.data.email,
      password: parseResult.data.password,
      clientIp,
      userAgent,
      deviceId,
      client,
    });
    setCsrfTokenCookie(res);
    return success(res, result, '登录成功');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /auth/phone/bind
 * 已登录用户绑定手机号(需鉴权,限流 3/min)
 */
export const phoneBind: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const parseResult = phoneBindSchema.safeParse(req.body);
    if (!parseResult.success) {
      return error(res, ErrorCode.PARAM_INVALID, parseResult.error.issues[0]?.message ?? '参数错误', 400);
    }
    const { clientIp, userAgent, deviceId, client } = extractClientContext(req);
    const result = await authService.bindPhone({
      userId: req.userId,
      tenantId: req.tenantId,
      phone: parseResult.data.phone,
      code: parseResult.data.code,
      clientIp,
      userAgent,
      deviceId,
      client,
    });
    return success(res, result, '手机号已绑定');
  } catch (err) {
    return next(err);
  }
};
