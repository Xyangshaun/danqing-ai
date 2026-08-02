# 丹青有AI 项目上下文日志

> **生成时间**: 2026-08-02 17:50 (GMT+8)
> **更新时间**: 2026-08-02 20:57 (GMT+8)
> **用途**: 任务交接快照,供后续任务直接消费
> **仓库**: `Xyangshaun/danqing-ai` (main)
> **生产**: https://www.danqing.site (43.128.25.202)
> **当前 HEAD**: `8e7f4fb feat: AI 用量统计模块 - 4 个统计接口 + 用量日志记录 + DB 迁移`

---

## 零、更新日志(2026-08-02 20:57)

### 本次上线内容(3 个提交)

| Commit | 说明 | 变更 |
|--------|------|------|
| `0fc6530` | Onboarding 职业选择 + 外网资源本地化 | 25 文件 |
| `68b9025` | AI 生产化启用 - admin AI 配置查看/测试接口 + 多 Provider | 3 文件 |
| `8e7f4fb` | AI 用量统计模块 - 4 个统计接口 + 用量日志记录 + DB 迁移 | 10 文件 |

### 功能变更点

#### 1. Onboarding 职业选择流程
- 飞书首次登录 → `/onboarding` 页面 → 选角色 → `PATCH /api/v1/users/role`
- 仅 `role='student'` 可自选一次,已选返回 403
- 事务同时更新 `User.role` + `TenantMember.role`

#### 2. AI 生产化管理
- `GET /api/admin/system/ai-config` — 查看当前 AI 配置(Key 脱敏)
- `POST /api/admin/system/ai-config/test` — 测试 AI 连通性(1x1 测试图片)
- 多 Provider 支持:GLM / OpenAI / Azure / vLLM / TRAE
- 设计原则:运行时只读 + .env 编辑 + PM2 restart

#### 3. AI 用量统计模块(核心新增)
- **数据模型**: `AiUsageLog` 表(tenant_id 多租户隔离, 4 索引)
- **4 个统计接口**(admin:stats:read 权限, Redis 5分钟缓存):
  - `GET /api/admin/stats/ai-usage/overview` — 总览(次数/成功率/token/成本/耗时)
  - `GET /api/admin/stats/ai-usage/by-provider` — 按 Provider 分组
  - `GET /api/admin/stats/ai-usage/by-user` — 按用户 Top N(关联 users 表)
  - `GET /api/admin/stats/ai-usage/trend` — 按日期趋势(最近 N 天)
- **用量日志记录**: AI 分析服务和连通性测试均异步记录用量(非阻塞)
- **成本估算**: 多模型定价表(qwen-vl-plus/max, glm-4v-flash, doubao-vision)
- **参数钳制**: limit 1-100, days 1-90, 非法日期优雅降级
- **专项测试**: 79/79 通过(鉴权+集成+边界+性能+单元+一致性)

### 回归测试

| 项 | 结果 |
|----|------|
| 后端类型检查 | tsc --noEmit 零错误 |
| 后端测试 | **839/839 通过** (100%) |
| 前端类型检查 | tsc --noEmit 零错误 |
| 前端构建 | vite build 成功 (3.77s) |
| 生产健康 | HTTPS 200 OK |

### 测试修复
- `analysis.service.test.ts:858` — 修复 imageUrl 期望: `upload://` → `/uploads/`(Nginx 静态服务)
- `tenant-isolation.test.ts:147-172` — 修复 createdAt 固定日期为动态当前月,保障 countMonthlyUsage 测试稳定

### 部署状态
- PM2 `danqing-api`: online (ubuntu 用户, pid 803164)
- PM2 进程列表已保存 (`pm2 save`)
- 健康检查 cron(每分钟)运行正常
- 公网 `/health`: HTTP 200

---

## 一、部署状态(✅ 生产已上线)

**部署时间**: 2026-08-02 17:31:07 → 17:31:21

| 组件 | 状态 |
|------|------|
| PM2 `danqing-api` | online, fork, pid 743131, ~109MB |
| Nginx | active, HTTPS(443) + HTTP→HTTPS 跳转 |
| PostgreSQL 15 | Docker, 127.0.0.1:5432 |
| Redis 7 | Docker, 127.0.0.1:6379 |
| 前端 dist | www-data 所有, 21 assets, 0 外链 |
| 本地 `/health` | HTTP 200 (11ms) |
| 公网 `/health` | HTTP 200 (60ms) |
| `PATCH /api/v1/users/role` | 返回 401(路由存在,未认证) |

**备份(可回滚)**:
- 前端: `/var/www/danqing-ai/dist.bak.20260802_173107`
- 后端源码: `/var/www/danqing-ai/server/src.bak.20260802_173107`

**架构拓扑**:
```
用户 → HTTPS(443) → Nginx → Node.js(:3000, iptables 限制) → PG/Redis(127.0.0.1)
```

---

## 二、技术栈版本(精确)

### 前端(根 `package.json`)

| 依赖 | 版本 |
|------|------|
| react / react-dom | ^18.2.0 |
| react-router-dom | ^6.22.0 |
| vite | ^5.1.0 |
| typescript | ^5.3.3 |
| tailwindcss | ^3.4.1 |
| vitest | ^1.6.1 |
| @testing-library/react | ^14.3.1 |
| recharts | ^2.10.0 |
| lucide-react | ^0.314.0 |

**构建**: `vite.config.ts` — `base: '/'`, 开发代理 `/api → http://localhost:3000`

### 后端(`server/package.json`, v3.0.0)

| 依赖 | 版本 |
|------|------|
| Node.js | >=18.0.0 (生产 Node 20 LTS) |
| express | ^4.21.2 |
| @prisma/client / prisma | ^5.22.0 |
| typescript | ^5.7.2 |
| ioredis | ^5.4.2 |
| jsonwebtoken | ^9.0.2 |
| bcrypt | ^5.1.1 |
| zod | ^3.24.1 |
| multer | ^1.4.5-lts.1 |
| helmet | ^8.0.0 |
| cors / cookie-parser | ^2.8.5 / ^1.4.7 |
| express-rate-limit | ^7.5.0 |
| axios | ^1.7.9 |
| jimp | ^0.22.12 |
| winston | ^3.17.0 |
| vitest | ^2.1.8 |
| supertest | ^7.0.0 |

**环境加载**: `--env-file=server/.env` (Node 20 原生)

---

## 三、最近 3 次提交

| Commit | 日期 | 说明 | 规模 |
|--------|------|------|------|
| `0fc6530` | 2026-08-02 | onboarding 职业选择 + 外网资源本地化 | 25 文件, +1263/-118 |
| `2345358` | 2026-08-02 | Phase 3/4/5 功能 + 生产部署配置 | 270 文件, +100448/-1081 |
| `fcee4e5` | 2026-07-29 | 框架审计修复 - render.yaml+vite代理+残留清理 | 4 文件, +80/-658 |

---

## 四、最新功能实现(onboarding 流程)

### 流程
飞书登录 → `AuthCallbackPage` 检查 `isFirstLogin` → 首次跳转 `/onboarding` → 选角色 → `PATCH /api/v1/users/role` → 跳转首页

### API 契约
- **路由**: `PATCH /api/v1/users/role`
- **权限**: `requirePermission('user:update:own')`
- **请求体**: `{ role: 'admin' | 'teacher' | 'student' }` (Zod 校验)
- **响应**: `UserProfile`
- **业务规则**:
  - 仅 `role='student'`(默认)可自选一次
  - 已选过返回 `403 FORBIDDEN`
  - 禁止选 `owner`(系统赋值)
- **事务**: 同时更新 `User.role`(冗余) + `TenantMember.role`(权威)

### 变更文件
**后端**:
- `server/src/types/api-contract.ts` — 新增 `UpdateRoleRequest/Response`
- `server/src/repositories/user.repository.ts` — `setRole` 方法(事务)
- `server/src/services/user.service.ts` — `setRole` 业务规则
- `server/src/controllers/user.controller.ts` — `updateRole` + Zod
- `server/src/routes/user.routes.ts` — 注册路由

**前端**:
- `src/pages/OnboardingPage.tsx` (新建, 258 行)
- `src/pages/AuthCallbackPage.tsx` — 首次登录跳转
- `src/App.tsx` — `/onboarding` 路由
- `src/services/auth-sdk.ts` — `setUserRole` SDK
- `src/services/placeholderImage.ts` (新建, 144 行) — 内联 SVG 占位图

---

## 五、项目结构

```
6a4f01878de2462eddd4b61e/
├── src/                  # 前端 Web App (React)
├── server/               # Node.js 后端 (分层)
│   └── src/
│       ├── controllers/  # 16 个
│       ├── services/     # 28 个
│       ├── repositories/ # 15 个
│       ├── routes/       # 15 个
│       ├── middlewares/  # auth/csrf/permission/rate-limit/tenant/trace
│       └── types/        # api-contract.ts (主副本)
├── admin/                # 管理后台 (Ant Design Pro)
├── website/              # 品牌官网 (Next.js 14)
├── prototype/           # UI 原型
├── deploy/              # 部署脚本 + nginx
├── .trae/               # 架构文档 + 14 subagent
├── ecosystem.config.cjs # PM2
└── vite.config.ts       # 前端构建
```

---

## 六、数据模型核心(Prisma)

**数据库**: PostgreSQL 15, 多租户(所有业务表强制 `tenant_id`)

| 枚举 | 值 |
|------|-----|
| `UserRole` | admin / teacher / student / owner |
| `TenantType` | school / college / class / individual |
| `TenantPlan` | free / standard / enterprise |
| `ArtType` | painting / design / product / sculpture |
| `AnalysisStatus` | pending / processing / success / failed |
| `SubscriptionStatus` | active / past_due / canceled / expired |
| `InvoiceStatus` | pending / paid / failed / refunded |
| `UserStatus` | active / locked / deleted |
| `ReviewStatus` | pending / approved / rejected / flagged |

**首次登录默认角色**: `student`

---

## 七、环境配置

### PM2([ecosystem.config.cjs](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/ecosystem.config.cjs))
```javascript
{
  name: 'danqing-api',
  script: 'server/dist/index.js',
  node_args: '--env-file=server/.env',
  exec_mode: 'fork', instances: 1,
  max_memory_restart: '500M', max_restarts: 10
}
```

### 关键环境变量(生产)

| 类别 | 变量 | 生产值 |
|------|------|--------|
| 飞书 | `FEISHU_APP_ID` | `cli_aaedf9c92cb8dd1f` |
| | `FEISHU_REDIRECT_URI_WEB` | `https://www.danqing.site/auth/feishu/callback` |
| JWT | `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | PEM, `\n` 转义, 双引号 |
| | `JWT_ACCESS_EXPIRES` | `15m` |
| | `JWT_REFRESH_EXPIRES` | `7d` |
| Cookie | `COOKIE_DOMAIN` | `.danqing.site` |
| | `COOKIE_PATH` | `/api/v1/auth` |
| 基础 | `DATABASE_URL` | `postgresql://danqing:***@127.0.0.1:5432/danqing_ai` |
| | `REDIS_URL` | `redis://:***@127.0.0.1:6379` |
| | `CORS_ORIGINS` | `https://www.danqing.site` |
| AI | `AI_ENABLED` | `false` (待替换 AI_API_KEY) |
| | `AI_API_URL` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| | `AI_API_MODEL` | `glm-4v-flash` (免费 10 RPM) |
| | `AI_API_TIMEOUT` | `2500` (保障 3s SLA) |
| 限流 | `RATE_LIMIT_AUTH_PER_MIN` | `10` |
| | `RATE_LIMIT_API_PER_MIN` | `60` |

---

## 八、测试与质量

| 项 | 结果 |
|----|------|
| 前端构建 | vite exit 0 (4.06s) |
| 后端测试 | 456/456 通过 (2.53s) |
| 类型检查 | 前后端 `tsc --noEmit` exit 0 |
| 生产健康 | HTTP 200 (本地 11ms / 公网 60ms) |
| 新路由验证 | `PATCH /users/role` → 401(路由存在) |

---

## 九、硬性约束(开发必须遵守)

| # | 约束 |
|---|------|
| 1 | AI 分析 3 秒内完成 (`AI_API_TIMEOUT=2500`) |
| 2 | 支持四类创意: painting/design/product/sculpture |
| 3 | 多租户隔离: 业务表强制 `tenant_id` |
| 4 | 中间件顺序: `auth → tenant → rateLimiter → permission → handler` |
| 5 | API 前缀: `/api/v1` |
| 6 | Cookie 路径: `/api/v1/auth` |
| 7 | CSRF: POST/PATCH/PUT/DELETE 需 `X-CSRF-Token` 头 |
| 8 | 飞书 token 交换: `Authorization: Bearer app_access_token` 头 |
| 9 | AI 建议含 `evidence` + `priority`(high≤2, med≤2, low≤1, 总≤5) |
| 10 | AI 失败 fallback: 55 条模板规则 |
| 11 | DB/Redis 绑定 127.0.0.1 |
| 12 | 部署五阶段(S1-S5)+ 三铁律 |
| 13 | 写操作前只读诊断 + 确认格式 |
| 14 | 前后端 `api-contract.ts` 同步(camelCase) |

---

## 十、Git 代理配置

```ini
# ~/.gitconfig (已配置)
http.proxy = http://127.0.0.1:7897    # 本地 Clash Verge, 可达
https.proxy = http://127.0.0.1:7897
```

- 已移除不可达的 `socks5://127.0.0.1:10809`(含 URL 特定覆盖)
- 验证: `git ls-remote origin HEAD` → `0fc653028fcbc666e5502074691c682e709d693b` ✓

---

## 十一、后续任务建议

1. **移动端 App**(Phase 3 Extension)— React Native, 拍照上传
2. **AI 生产化** — 替换 `AI_API_KEY`, 开启 `AI_ENABLED=true`
3. **多租户管理 UI** — 院校级成员邀请/角色管理
4. **性能优化** — k6 基准测试(`server/performance/k6/`)
5. **管理后台增强** — admin/ 已有 16 页面骨架

---

## 十二、关键文件路径速查

| 用途 | 路径 |
|------|------|
| API 契约主副本 | [server/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts) |
| 前端类型同步 | [src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/types/api-contract.ts) |
| Prisma Schema | [server/prisma/schema.prisma](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/prisma/schema.prisma) |
| PM2 配置 | [ecosystem.config.cjs](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/ecosystem.config.cjs) |
| 环境变量模板 | [server/.env.example](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/.env.example) |
| 部署 Runbook | [.trae/deploy-runbook-danqing.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/deploy-runbook-danqing.md) |
| Onboarding 页 | [src/pages/OnboardingPage.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/pages/OnboardingPage.tsx) |
| SVG 占位图 | [src/services/placeholderImage.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/services/placeholderImage.ts) |

---

**日志结束**。本文件为自包含文档,所有路径绝对,版本号来自 `package.json`,部署状态经生产验证。
