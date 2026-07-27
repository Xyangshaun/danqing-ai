// ============================================================
// 租户路由
// 对应 API:
//   GET  /tenants/current  (需鉴权)
//   POST /tenants/switch   (需鉴权)
// ============================================================

import { Router } from 'express';
import { getCurrentTenant, switchTenant } from '../controllers/tenant.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { apiRateLimiter } from '../middlewares/rate-limit.js';

export const tenantRouter: Router = Router();

tenantRouter.use(authMiddleware);
tenantRouter.use(tenantMiddleware);
tenantRouter.use(apiRateLimiter());

tenantRouter.get('/current', getCurrentTenant);
tenantRouter.post('/switch', switchTenant);
