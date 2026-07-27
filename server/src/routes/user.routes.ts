// ============================================================
// 用户路由
// 对应 API:
//   GET   /users/profile  (需鉴权)
//   PATCH /users/profile  (需鉴权)
// ============================================================

import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { apiRateLimiter } from '../middlewares/rate-limit.js';

export const userRouter: Router = Router();

userRouter.use(authMiddleware);
userRouter.use(tenantMiddleware);
userRouter.use(apiRateLimiter());

userRouter.get('/profile', getProfile);
userRouter.patch('/profile', updateProfile);
