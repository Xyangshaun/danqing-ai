// ============================================================
// 管理后台路由(Phase 4)
// 对应 API:/api/admin/*(5 大模块:用户/内容/订阅/数据看板/系统)
//
// 中间件链路:authMiddleware → tenantMiddleware → apiRateLimiter → permission → handler
//   - authMiddleware:解析 JWT,注入 req.userId / req.tenantId / req.role
//   - tenantMiddleware:校验 req.tenantId 存在(管理员必须归属某租户)
//   - apiRateLimiter:按用户限流(60 次/分钟)
//   - permission:RBAC 权限检查(仅 admin/owner 拥有 admin:* 权限)
//
// 权限矩阵(仅 ADMIN/OWNER 拥有):
//   用户管理  :admin:user:read / admin:user:write / admin:user:export
//   角色管理  :admin:role:read / admin:role:write
//   内容管理  :admin:artwork:read / admin:artwork:write
//   模板管理  :admin:template:read / admin:template:write
//   订阅管理  :admin:subscription:read / admin:subscription:write
//   套餐管理  :admin:plan:read / admin:plan:write
//   数据看板  :admin:stats:read
//   租户管理  :admin:tenant:read / admin:tenant:write
//   审计日志  :admin:audit:read
//   API 密钥  :admin:apikey:read / admin:apikey:write
//   系统健康  :admin:system:health
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { apiRateLimiter } from '../middlewares/rate-limit.js';
import { requirePermission } from '../middlewares/permission.js';

// 用户管理模块
import {
  listUsers,
  getUser,
  updateUser,
  lockUser,
  batchUsers,
  exportUsers,
  listRoles,
  updateRole,
} from '../controllers/admin.controller.js';

// 内容管理模块
import {
  listArtworks,
  getArtwork,
  reviewArtwork,
  deleteArtwork,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../controllers/admin.controller.js';

// 订阅管理模块
import {
  listSubscriptions,
  getSubscription,
  cancelSubscription,
  refundSubscription,
  listInvoices,
  getInvoice,
  listPlans,
  createPlan,
  updatePlan,
} from '../controllers/admin.controller.js';

// 数据看板模块
import {
  getStatsOverview,
  getStatsGrowth,
  getStatsRetention,
  getStatsAiCost,
  getStatsRealtime,
  getTenantStats,
} from '../controllers/admin.controller.js';

// 系统管理模块
import {
  listTenants,
  getTenant,
  createTenant,
  updateTenant,
  listAuditLogs,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getSystemHealth,
} from '../controllers/admin.controller.js';

// Phase 5 院校管理扩展模块(邀请码 / 批量导入 / 预设覆盖)
import {
  createInvitation,
  listInvitations,
  batchImportStudents,
  listAdminPresets,
  overridePreset,
} from '../controllers/admin-phase5.controller.js';

// AI 生产化:AI 配置管理(查看 / 测试)
import { getAiConfig, testAiConfig } from '../controllers/admin-ai-config.controller.js';

export const adminRouter: Router = Router();

// ---------- 全局中间件(所有 /api/admin/* 路由必须经过鉴权 + 租户校验 + 限流)----------
adminRouter.use(authMiddleware);
adminRouter.use(tenantMiddleware);
adminRouter.use(apiRateLimiter());

// ============================================================
// 3.10.1 用户管理模块
// ============================================================

// GET /api/admin/users - 分页查询用户列表(响应脱敏)
adminRouter.get('/users', requirePermission('admin:user:read'), listUsers);

// GET /api/admin/users/export - 导出用户 CSV(脱敏后输出)
// 注意:此路由必须在 /users/:id 之前注册,避免 'export' 被当作 :id 参数
adminRouter.get('/users/export', requirePermission('admin:user:export'), exportUsers);

// GET /api/admin/users/:id - 查询用户详情(响应脱敏)
adminRouter.get('/users/:id', requirePermission('admin:user:read'), getUser);

// PATCH /api/admin/users/:id - 更新用户(角色/状态/资料)
adminRouter.patch('/users/:id', requirePermission('admin:user:write'), updateUser);

// POST /api/admin/users/:id/lock - 锁定/解锁用户
adminRouter.post('/users/:id/lock', requirePermission('admin:user:write'), lockUser);

// POST /api/admin/users/batch - 批量操作用户(更新角色/删除)
adminRouter.post('/users/batch', requirePermission('admin:user:write'), batchUsers);

// GET /api/admin/roles - 查询角色权限矩阵
adminRouter.get('/roles', requirePermission('admin:role:read'), listRoles);

// PATCH /api/admin/roles/:role - 更新角色权限
adminRouter.patch('/roles/:role', requirePermission('admin:role:write'), updateRole);

// ============================================================
// 3.10.2 内容管理模块
// ============================================================

// GET /api/admin/artworks - 分页查询作品列表
adminRouter.get('/artworks', requirePermission('admin:artwork:read'), listArtworks);

// GET /api/admin/artworks/:id - 查询作品详情
adminRouter.get('/artworks/:id', requirePermission('admin:artwork:read'), getArtwork);

// POST /api/admin/artworks/:id/review - 审核作品
adminRouter.post('/artworks/:id/review', requirePermission('admin:artwork:write'), reviewArtwork);

// DELETE /api/admin/artworks/:id - 删除作品
adminRouter.delete('/artworks/:id', requirePermission('admin:artwork:write'), deleteArtwork);

// GET /api/admin/templates - 分页查询创意模板
adminRouter.get('/templates', requirePermission('admin:template:read'), listTemplates);

// GET /api/admin/templates/:id - 查询模板详情
adminRouter.get('/templates/:id', requirePermission('admin:template:read'), getTemplate);

// POST /api/admin/templates - 创建模板
adminRouter.post('/templates', requirePermission('admin:template:write'), createTemplate);

// PATCH /api/admin/templates/:id - 更新模板
adminRouter.patch('/templates/:id', requirePermission('admin:template:write'), updateTemplate);

// DELETE /api/admin/templates/:id - 删除模板
adminRouter.delete('/templates/:id', requirePermission('admin:template:write'), deleteTemplate);

// ============================================================
// 3.10.3 订阅管理模块
// ============================================================

// GET /api/admin/subscriptions - 分页查询订阅列表
adminRouter.get('/subscriptions', requirePermission('admin:subscription:read'), listSubscriptions);

// GET /api/admin/subscriptions/:id - 查询订阅详情
adminRouter.get('/subscriptions/:id', requirePermission('admin:subscription:read'), getSubscription);

// POST /api/admin/subscriptions/:id/cancel - 管理员取消订阅
adminRouter.post('/subscriptions/:id/cancel', requirePermission('admin:subscription:write'), cancelSubscription);

// POST /api/admin/subscriptions/:id/refund - 退款处理
adminRouter.post('/subscriptions/:id/refund', requirePermission('admin:subscription:write'), refundSubscription);

// GET /api/admin/invoices - 分页查询发票列表
adminRouter.get('/invoices', requirePermission('admin:subscription:read'), listInvoices);

// GET /api/admin/invoices/:id - 查询发票详情
adminRouter.get('/invoices/:id', requirePermission('admin:subscription:read'), getInvoice);

// GET /api/admin/plans - 查询套餐列表
adminRouter.get('/plans', requirePermission('admin:plan:read'), listPlans);

// POST /api/admin/plans - 创建套餐
adminRouter.post('/plans', requirePermission('admin:plan:write'), createPlan);

// PATCH /api/admin/plans/:id - 更新套餐
adminRouter.patch('/plans/:id', requirePermission('admin:plan:write'), updatePlan);

// ============================================================
// 3.10.4 数据看板模块
// ============================================================

// GET /api/admin/stats/overview - 总览统计(Redis 缓存 1 分钟)
adminRouter.get('/stats/overview', requirePermission('admin:stats:read'), getStatsOverview);

// GET /api/admin/stats/growth - 成长趋势(Redis 缓存 5 分钟)
adminRouter.get('/stats/growth', requirePermission('admin:stats:read'), getStatsGrowth);

// GET /api/admin/stats/retention - 留存分析(Redis 缓存 5 分钟)
adminRouter.get('/stats/retention', requirePermission('admin:stats:read'), getStatsRetention);

// GET /api/admin/stats/ai-cost - AI 成本统计(Redis 缓存 5 分钟)
adminRouter.get('/stats/ai-cost', requirePermission('admin:stats:read'), getStatsAiCost);

// GET /api/admin/stats/realtime - 实时监控(不缓存)
adminRouter.get('/stats/realtime', requirePermission('admin:stats:read'), getStatsRealtime);

// GET /api/admin/stats/tenant/:id - 单租户统计
adminRouter.get('/stats/tenant/:id', requirePermission('admin:stats:read'), getTenantStats);

// ============================================================
// 3.10.5 系统管理模块
// ============================================================

// GET /api/admin/system/tenants - 分页查询租户列表
adminRouter.get('/system/tenants', requirePermission('admin:tenant:read'), listTenants);

// GET /api/admin/system/tenants/:id - 查询租户详情
adminRouter.get('/system/tenants/:id', requirePermission('admin:tenant:read'), getTenant);

// POST /api/admin/system/tenants - 创建租户
adminRouter.post('/system/tenants', requirePermission('admin:tenant:write'), createTenant);

// PATCH /api/admin/system/tenants/:id - 更新租户
adminRouter.patch('/system/tenants/:id', requirePermission('admin:tenant:write'), updateTenant);

// GET /api/admin/system/audit-logs - 分页查询审计日志
adminRouter.get('/system/audit-logs', requirePermission('admin:audit:read'), listAuditLogs);

// GET /api/admin/system/api-keys - 分页查询 API 密钥列表
adminRouter.get('/system/api-keys', requirePermission('admin:apikey:read'), listApiKeys);

// POST /api/admin/system/api-keys - 创建 API 密钥(完整密钥仅返回一次)
adminRouter.post('/system/api-keys', requirePermission('admin:apikey:write'), createApiKey);

// DELETE /api/admin/system/api-keys/:id - 吊销 API 密钥
adminRouter.delete('/system/api-keys/:id', requirePermission('admin:apikey:write'), revokeApiKey);

// GET /api/admin/system/health - 系统健康检查
adminRouter.get('/system/health', requirePermission('admin:system:health'), getSystemHealth);

// ============================================================
// AI 生产化:AI 配置管理模块(查看 / 测试)
// ============================================================
// 权限:admin:system:health(与系统健康检查共用,仅 ADMIN/OWNER)
//
// 设计说明:
//   - GET  /system/ai-config      查看当前 AI 配置状态(Key 脱敏,不返回完整凭据)
//   - POST /system/ai-config/test 测试 AI 连通性(发送 1x1 测试图片,验证配置可用)
//
// 配置更新流程:
//   1. 管理员 SSH 到服务器,编辑 /var/www/danqing-ai/server/.env
//   2. 修改 AI_API_KEY / AI_API_URL / AI_API_MODEL / AI_ENABLED / AI_PROVIDER
//   3. 执行 `pm2 restart danqing-api`
//   4. 调用 GET /system/ai-config 验证配置已生效
//   5. 调用 POST /system/ai-config/test 验证 AI 可正常调用
//
// 支持的 AI Provider(任意 OpenAI 兼容端点):
//   - 智谱 GLM-4V     AI_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
//   - TRAE 内置 AI    AI_PROVIDER=trae + TRAE_API_KEY + TRAE_API_URL
//   - OpenAI          AI_API_URL=https://api.openai.com/v1/chat/completions
//   - Azure OpenAI    AI_API_URL=https://{resource}.openai.azure.com/openai/deployments/{deploy}/chat/completions?api-version=...
//   - 自部署 vLLM     AI_API_URL=http://your-host:8000/v1/chat/completions

// GET /api/admin/system/ai-config - 查看 AI 配置状态(Key 脱敏)
adminRouter.get('/system/ai-config', requirePermission('admin:system:health'), getAiConfig);

// POST /api/admin/system/ai-config/test - 测试 AI 连通性(发送最小化请求)
adminRouter.post('/system/ai-config/test', requirePermission('admin:system:health'), testAiConfig);

// ============================================================
// 3.10.6 Phase 5 院校管理扩展模块(邀请码 / 批量导入 / 预设覆盖)
// ============================================================
// 权限矩阵:
//   admin:invitation:write - 创建邀请码 / 批量导入学生(ADMIN/OWNER)
//   admin:preset:read      - 查看所有预设(ADMIN/OWNER)
//   admin:preset:write     - 派生覆盖预设(ADMIN/OWNER)
//
// 路由顺序说明:
//   - /tenants/:id/invitations 与 /tenants/:id/students/batch 路径段独立,无冲突
//   - /presets 与 /presets/:id/override 必须按顺序注册(避免 'presets' 被当作已有路由)
//   - 注意:/presets 不与 /system/* 冲突(顶级路径段不同)

// POST /api/admin/tenants/:id/invitations - 创建邀请码(ADMIN/OWNER)
adminRouter.post(
  '/tenants/:id/invitations',
  requirePermission('admin:invitation:write'),
  createInvitation,
);

// GET /api/admin/tenants/:id/invitations - 列出租户邀请码(ADMIN/OWNER)
adminRouter.get(
  '/tenants/:id/invitations',
  requirePermission('admin:invitation:write'),
  listInvitations,
);

// POST /api/admin/tenants/:id/students/batch - 批量导入学生(ADMIN/OWNER)
adminRouter.post(
  '/tenants/:id/students/batch',
  requirePermission('admin:invitation:write'),
  batchImportStudents,
);

// GET /api/admin/presets - 列出所有预设(含 built-in + 用户预设,ADMIN/OWNER)
adminRouter.get('/presets', requirePermission('admin:preset:read'), listAdminPresets);

// POST /api/admin/presets/:id/override - 从 built-in 派生覆盖预设(ADMIN/OWNER)
adminRouter.post(
  '/presets/:id/override',
  requirePermission('admin:preset:write'),
  overridePreset,
);
