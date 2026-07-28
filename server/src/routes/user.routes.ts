// ============================================================
// 用户路由
// 对应 API:
//   GET   /users/profile  (需鉴权;查看自己的资料,所有角色可访问)
//   PATCH /users/profile  (需鉴权 + user:update:own)
//
// 注:GET /users/profile 是自助接口(查看自己的资料),
//     不需要 user:read 权限(该权限用于查看租户内其他成员)。
//     若加 user:read 会导致 STUDENT 角色无法查看自己的资料(破坏现有测试)。
// ============================================================

import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { apiRateLimiter } from '../middlewares/rate-limit.js';
import { requirePermission } from '../middlewares/permission.js';

export const userRouter: Router = Router();

// ---------- 全局中间件 ----------
userRouter.use(authMiddleware);
userRouter.use(tenantMiddleware);
userRouter.use(apiRateLimiter());

// ---------- 业务路由 ----------

// GET /users/profile - 查看自己的资料(所有已认证用户可访问)
userRouter.get('/profile', getProfile);

// PATCH /users/profile - 更新自己的资料(需 user:update:own,所有角色均拥有此权限)
userRouter.patch('/profile', requirePermission('user:update:own'), updateProfile);
