# 丹青有AI 管理后台 · API 接口定义文档(前端对接版)

> 版本: v1.0
> 日期: 2026-08-08
> 范围: 实时监控大屏 + 用户管理 + 租户管理(管理员端 `/app/admin` 全量对接接口)
> 数据源: 以 `server/src/routes/admin.routes.ts`、`server/src/types/api-contract.ts` 冻结契约为唯一权威
> 状态: 待用户评审 → 评审通过后进入实现计划(writing-plans)

---

## 0. 通用约定(所有接口必读)

| 项 | 值 | 说明 |
|----|----|------|
| 命名空间 | `/api/admin` | 独立命名空间(**非** `/api/v1`),nginx `location /api/` 已反代至 Node `127.0.0.1:3000` |
| 后端入口 | `server/src/app.ts` L227 `app.use('/api/admin', adminRouter)` | |
| 鉴权 | `Authorization: Bearer <access_token>` | access_token 存内存(token-store),401 自动 `/auth/refresh` |
| 客户端头 | `X-Client: web` + `X-Client-Context` | 由 `src/services/api.ts` 自动注入 |
| 全局中间件 | auth → tenant → rateLimiter(60/min) → permission | 见 admin.routes.ts L126-128 |
| 响应包 | `{ code, message, data, traceId }` | `code=0` 成功;非 0 抛 `ApiError` |
| CSRF | 仅写操作(POST/PATCH/DELETE)需 `X-CSRF-Token` | api.ts 自动从 `csrf_token` Cookie 注入 |
| 高危操作 | 需 `confirmPassword` + `Idempotency-Key` 头 | 见 §5.4 |
| 多租户隔离 | 平台 `owner` 可查全局/任意租户;租户 `admin` 仅本租户 | 越权返回 403 |

**错误码(前端处理)**

| code | 含义 | HTTP | 前端行为 |
|------|------|------|----------|
| 2001 UNAUTHORIZED | 未登录 | 401 | 清 token + 跳登录 |
| 2002 TOKEN_EXPIRED | token 过期 | 401 | 静默 refresh + 重试 |
| 2004 FORBIDDEN | 无 admin 权限 / 越权 / metrics 开关未开 | 403 | PermissionToast 提示,不跳转 |
| 9005 RATE_LIMITED | 限流 | 429 | Toast「操作过于频繁」 |

**前端对接落地**
- 类型镜像: `src/types/admin.ts`(已建,需按本文档补全用户/租户/批量类型)
- 接口封装: `src/services/admin-api.ts`(待建),复用 `api.ts` 的 `get/post/patch/del`,但 baseURL 为 `/api/admin`
- 路由挂载: `App.tsx` 新增 `/admin/*` 子路由,角色守卫 `role ∈ {admin, owner}`

---

## 1. 模块一:实时监控大屏 `/app/admin`(只读,最高优先)

> 数据分三档刷新:高频轮询(10-15s)、指标(30-60s)、低频缓存(5min)。

### 1.1 实时心跳(高频,不缓存)

#### `GET /api/admin/stats/realtime`
- **权限**: `admin:stats:read` | **缓存**: 无
- **Query**: 无
- **响应 `AdminStatsRealtime`**:

| 字段 | 类型 | 说明 |
|------|------|------|
| onlineUsers | number | 在线用户数(5 分钟内活跃) |
| todayAiCalls | number | 当日累计 AI 调用 |
| pendingTasks | number | 处理中任务数 |
| systemLoad | number | 系统负载 0-1 |
| recentRequests | number | 最近 5 分钟请求量 |
| timestamp | ISODateString | 统计时间戳 |

#### `GET /api/admin/system/health`
- **权限**: `admin:system:health` | **缓存**: 无
- **响应 `AdminSystemHealth`**:

| 字段 | 类型 | 说明 |
|------|------|------|
| status | 'up'\|'degraded'\|'down' | 总体状态 |
| services.database | 'up'\|'down' | PostgreSQL |
| services.redis | 'up'\|'down' | Redis |
| services.aiService | 'up'\|'down'\|'disabled' | AI 服务 |
| uptime | number | 进程运行秒数 |
| memoryUsageMb | number | 内存使用(MB) |
| nodeVersion | string | Node 版本 |
| timestamp | ISODateString | |

### 1.2 M3 可观测性指标(30-60s;⚠️ 依赖 `metrics` 开关)

> **前置**: 两个接口均要求 `metrics` 功能开关开启,否则返回 `403 FORBIDDEN(可观测性指标功能暂未开放)`。已确认实现时经用户批准在生产开启该开关。

#### `GET /api/admin/metrics/sla`
- **权限**: `admin:stats:read`
- **Query**: `days`(1-90,默认 7)、`tenantId`(可选;owner 传 `all`/`global`=全局;非 owner 传他人→403)
- **响应 `SlaMetricsResponse`**:

| 字段 | 类型 | 说明 |
|------|------|------|
| days | number | 时间范围天数 |
| dailySla | array | 逐日 `{ date, complianceRate(0-1), total }` |
| avgComplianceRate | number | 平均 SLA 达标率 |

#### `GET /api/admin/metrics/ai`
- **权限**: `admin:stats:read`
- **Query**: `startDate`(YYYY-MM-DD)、`endDate`(可选,非法忽略由 service 补全)
- **响应 `AiMetricsResponse`**:

| 字段 | 类型 | 说明 |
|------|------|------|
| slaComplianceRate | number | SLA 达标率(≤3s 占比,0-1) |
| aiFallbackRate | number | AI 降级率(0-1) |
| providerAvailability.glm | object | `{ successRate, switchCount }` |
| providerAvailability.trae | object | `{ successRate, switchCount }` |
| analysis | object | `{ total, successRate, avgDurationMs }` |
| costByDay | array | `[{ date, costYuan }]` 按天成本 |
| timestamp | ISODateString | |

### 1.3 业务总览 + AI 用量(低频 5min 缓存)

#### `GET /api/admin/stats/overview`
- **权限**: `admin:stats:read` | **缓存**: Redis 1min
- **响应 `AdminStatsOverview`**: `dau / mau / totalArtworks / todayAiCalls / totalTenants / totalUsers / todayNewUsers / todayNewArtworks / timestamp`

#### AI 用量 4 接口(权限 `admin:stats:read`,Redis 5min)
- **公共 Query**: `startDate` / `endDate`(YYYY-MM-DD)、`days`、`limit`

| 接口 | 响应关键字段 |
|------|--------------|
| `GET /stats/ai-usage/overview` | `totalCount, successCount, failedCount, successRate, totalPromptTokens, totalCompletionTokens, totalTokens, totalCostYuan, avgDurationMs` |
| `GET /stats/ai-usage/by-provider` | `stats[]{ provider, totalCount, successRate, totalTokens, totalCostYuan, avgDurationMs }, totalCostYuan` |
| `GET /stats/ai-usage/by-user` | `stats[]{ userId, userName, userEmail, userRole, tenantId, tenantName, totalCount, successRate, totalTokens, totalCostYuan }, limit, totalCostYuan` |
| `GET /stats/ai-usage/trend` | `days, dataPoints[]{ date, totalCount, successCount, successRate, totalTokens, totalCostYuan }, totalCostYuan` |

---

## 2. 模块二:用户管理 `/app/admin/users`

### 2.1 查询(只读)

#### `GET /api/admin/users`
- **权限**: `admin:user:read`
- **Query**: `page`(默认1)、`pageSize`(默认20,≤100)、`search`(name/email 模糊)、`tenantId`、`role`、`status`、`startDate`、`endDate`、`sortBy`(createdAt/lastLoginAt/name)、`sortOrder`(asc/desc)
- **响应 `PaginatedData<AdminUserListItem>`** = `{ items[], total, page, pageSize, hasMore }`

`AdminUserListItem`(脱敏):

| 字段 | 类型 | 说明 |
|------|------|------|
| id / tenantId / name / avatar | string | 基本信息 |
| email / phone | string\|null | **已脱敏**(z***@x.com / 138****1234) |
| role | 'admin'\|'teacher'\|'student'\|'owner' | |
| status | 'active'\|'locked'\|'deleted' | |
| createdAt / lastLoginAt / lockedAt | ISODateString\|null | |

#### `GET /api/admin/users/:id`
- **权限**: `admin:user:read`
- **响应 `AdminUserDetail`** = ListItem + `feishuOpenId, updatedAt, lockedBy`

#### `GET /api/admin/users/export`
- **权限**: `admin:user:export` | **返回**: CSV(非 JSON)
- **Query**: `fields`(逗号分隔)、`search/tenantId/role/status`(无分页)
- ⚠️ 前端需用 `fetch` 直接下载(blob),不走 `api.ts` JSON 解包

### 2.2 写操作

#### `PATCH /api/admin/users/:id`
- **权限**: `admin:user:write` | **需 CSRF**
- **Body**: `{ role?, status?, name? }` → 响应 `AdminUserDetail`

#### `POST /api/admin/users/:id/lock`(🔴 高危)
- **权限**: `admin:user:write` | **CSRF + confirmPassword + Idempotency-Key**
- **Body**: `{ locked: boolean, reason?, confirmPassword? }`
- **响应**: `{ id, status, lockedAt }`

#### `POST /api/admin/users/batch`(🔴 delete 高危)
- **权限**: `admin:user:write` | **CSRF;action=delete 需 confirmPassword + Idempotency-Key**
- **Body**: `{ userIds: string[](≤100), action: 'updateRole'|'delete', role?(updateRole 必填), confirmPassword? }`
- **响应**: `{ total, succeeded, failed, results[]{ userId, success, error? } }`

### 2.3 角色矩阵(可选,第二迭代)

| 接口 | 说明 |
|------|------|
| `GET /api/admin/roles` | `admin:role:read`,响应 `AdminRoleInfo[]{ role, roleName, description, permissions[] }` |
| `PATCH /api/admin/roles/:role` | `admin:role:write`,Body `{ permissions[](全量替换) }` |

---

## 3. 模块三:租户管理 `/app/admin/tenants`

### 3.1 查询(只读)

#### `GET /api/admin/system/tenants`
- **权限**: `admin:tenant:read`
- **Query**: `page/pageSize/search/type(school|college|class|individual)/plan(free|standard|enterprise)/status(active|disabled)`
- **响应 `PaginatedData<AdminTenantListItem>`**

`AdminTenantListItem`:

| 字段 | 类型 | 说明 |
|------|------|------|
| id / name | string | |
| type | 'school'\|'college'\|'class'\|'individual' | |
| plan | 'free'\|'standard'\|'enterprise' | |
| status | 'active'\|'disabled' | |
| maxSeats | number | 席位上限 |
| memberCount | number | 成员数(冗余) |
| feishuTenantKey / parentId | string\|null | |
| createdAt | ISODateString | |

#### `GET /api/admin/stats/tenant/:id`
- **权限**: `admin:stats:read` | **响应 `AdminTenantStats`**:
  `tenantId, tenantName, userCount, artworkCount, monthlyAiCalls, monthlyQuota, quotaUsageRate(0-1), usedSeats, maxSeats, plan, last7dArtworks, avgScore`

### 3.2 写操作

#### `POST /api/admin/system/tenants`
- **权限**: `admin:tenant:write` | **CSRF**
- **Body**: `{ name, type, plan?, maxSeats?, parentId?, feishuTenantKey? }` → `{ id, name, type, plan, status, maxSeats, createdAt }`

#### `PATCH /api/admin/system/tenants/:id`
- **权限**: `admin:tenant:write` | **CSRF**
- **Body**: `{ name?, plan?, status?, maxSeats? }` → 更新后租户

---

## 4. 大屏数据流(前端组装建议)

```
┌─ 顶部状态条 ──────────────── system/health (15s 轮询)
├─ KPI 卡片区 ──────────────── stats/realtime (10s 轮询) + stats/overview (加载/手动)
├─ SLA / 降级率趋势 ────────── metrics/sla + metrics/ai (60s,需 metrics 开关)
├─ Provider 可用性 ─────────── metrics/ai.providerAvailability
├─ AI 用量趋势/成本 ────────── stats/ai-usage/trend + by-provider (手动/5min)
└─ Top 用户用量 ────────────── stats/ai-usage/by-user (手动/5min)
```

**轮询策略**: 用 `setInterval` + 页面可见性(`document.visibilitychange`)暂停;组件卸载清理 timer;错误静默(不弹全局 Toast,`silent: true`)。

---

## 5. 假设与决策

1. **命名空间**: 前端 `admin-api.ts` 独立 `ADMIN_BASE = '/api/admin'`,复用 api.ts 的鉴权/刷新/CSRF 逻辑(通过参数或薄封装),不重复造轮子。
2. **metrics 开关**: 实现阶段经用户确认后,在生产通过 admin API 开启 `metrics` 开关;前端对 403 做「未开启」降级占位,不白屏。
3. **脱敏**: 用户列表 email/phone 已由后端脱敏,前端原样展示,不再二次处理。
4. **导出 CSV**: 绕过 JSON 解包,用 `fetch` blob + `URL.createObjectURL` 触发下载。
5. **高危操作**: 前端做二次确认弹窗(输入密码),密码入 Body `confirmPassword`;自动生成 `Idempotency-Key`(uuid)。
6. **不在本次范围**: 内容审核、订阅/发票、审计日志、API 密钥、Phase5 邀请码/批量导入界面 —— 接口已列但本次不做前端。

## 6. 验证方式

- 类型层面: `src/types/admin.ts` 与冻结契约逐字段对齐,`tsc --noEmit` 0 错误。
- 联调: 以 admin 账号登录,逐个接口在 DevTools Network 核对响应结构与本文档一致。
- 开关降级: metrics 关闭时,大屏指标区显示「未开启」而非报错。

---

> 下一步: 本文档评审通过后,调用 writing-plans 生成实现计划(路由 + 守卫 + 3 页面 + admin-api 封装 + 类型补全)。
