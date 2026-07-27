// ============================================================
// 认证路由
// 对应 API:
//   GET  /auth/feishu/authorize  (无需鉴权,限流 10/min)
//   GET  /auth/feishu/callback   (无需鉴权,限流 5/min)
//   POST /auth/refresh           (无需鉴权,限流 20/min)
//   POST /auth/logout            (需鉴权)
//   GET  /auth/me                (需鉴权)
// ============================================================

import { Router } from 'express';
import { feishuAuthorize, feishuCallback, authRefresh, authLogout, authMe } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { authRateLimiter, callbackRateLimiter, refreshRateLimiter } from '../middlewares/rate-limit.js';

export const authRouter: Router = Router();

// 飞书 OAuth 授权 URL
authRouter.get(
  '/feishu/authorize',
  authRateLimiter(),
  feishuAuthorize,
);

// 飞书 OAuth 回调
authRouter.get(
  '/feishu/callback',
  callbackRateLimiter(),
  feishuCallback,
);

// 刷新 access_token(从 Cookie 读 refresh_token)
authRouter.post(
  '/refresh',
  refreshRateLimiter(),
  authRefresh,
);

// 登出(需鉴权)
authRouter.post(
  '/logout',
  authMiddleware,
  authLogout,
);

// 获取当前用户信息(需鉴权)
authRouter.get(
  '/me',
  authMiddleware,
  authMe,
);
