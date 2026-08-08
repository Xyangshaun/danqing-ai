# 丹青有AI —— 开发全过程日志

> **文档用途**:系统性记录丹青有AI 项目从立项到当前阶段的完整开发历程,涵盖代码提交记录、问题修复过程、功能实现细节、关键决策点与完整研究过程,供后续开发与复盘追溯。
>
> **生成时间**:2026-08-03
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`
> **仓库**:`Xyangshaun/danqing-ai`(main 分支)
> **生产环境**:https://www.danqing.site (43.128.25.202)
> **当前 HEAD**:`25142d4` fix(P2): traceId 中间件顺序修复(P3 阶段 5 项子任务已完成未提交)

---

## 一、项目起源与需求分析

### 1.1 项目前身

"丹青有AI"前身是**拓界视觉工坊**——已完成省级大学生创新创业训练计划的通用 AI 艺术创作平台(已上线 https://topora.coze.site)。拓界解决了"AI 能不能帮人画画"的问题,但在实际教学使用中发现新痛点:**它只能生成新图,看不懂学生已有的画**。

### 1.2 核心痛点(真实课堂场景)

- 张老师批 42 份作业要花一整天,到第 20 张时评语只剩"再改"
- 学生小王看到评语"再改",不知道改哪里,画了三遍还是不对
- **核心问题不是没有工具,而是没有诊断**

### 1.3 关键转变:从"创作工具"到"教学伴学体"

| 阶段 | 定位 | 核心问题 |
|------|------|----------|
| 拓界视觉工坊 | AI 创作工具 | AI 能不能帮人画画? |
| 丹青有AI | AI 教学伴学体 | AI 能不能看懂学生的画、指出问题、告诉怎么改? |

### 1.4 产品定位与目标用户

**一句话定位**:AI 作业诊断系统——学生上传绘画作业 → AI 从多维度分析 → 返回结构化诊断报告 + 具体改进建议。

| 用户 | 痛点 | 解决方式 |
|------|------|----------|
| 高校艺术教师 | 批 42 份作业一整天,评语只能写"再改" | AI 3 秒出结构化报告,老师看报告再补充指导 |
| 艺术专业学生 | 看到"再改"不知道改哪里 | AI 说"天空占比过大(约60%),建议压缩至40%" |
| 非艺术专业学生 | 有创意但画不出来 | 降低创作门槛,获得专业反馈 |

### 1.5 比赛背景

参加 **TRAE AI 创造力大赛**(个人赛),主赛道"学习工作/造个新解法",附加赛题"非遗创新创意开发"。

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| 报名+初赛 | 06.16-07.15 | 可运行 Demo(核心功能跑通) |
| 复赛 | 07.21-08.09 | 完整产品(全功能路径) |
| 决赛 | 08.21-08.22 | 线下路演 + 现场答辩 |

### 1.6 开发者背景与开发原则

- **身份**:通化师范学院美术学院设计专业学生,**无编程背景**,不写代码
- **开发方式**:全程使用 TRAE Work,用自然语言描述需求,AI 生成代码
- **开发原则**:阶段化开发 → 每轮只提一个核心需求 → 先做流程再做精度 → 迭代优化

---

## 二、技术选型与架构设计

### 2.1 多端架构总览

```
┌─────────────────────────────────────────────────────┐
│                    后端服务(server/)                  │
│   Node.js + Express + Prisma + Redis + PostgreSQL    │
│   16 个路由模块 / 18 个 Controller / 分层架构          │
│   端口 3000,API base /api/v1                         │
└──────┬───────┬───────┬───────┬───────┬───────────────┘
       │       │       │       │       │
   ┌───▼──┐ ┌─▼──┐ ┌──▼───┐ ┌─▼──┐ ┌──▼──────┐
   │ Web  │ │Admin│ │Mobile│ │API │ │Website  │
   │学生端│ │后台 │ │ App  │ │密钥│ │  官网   │
   │ 根目录│ │admin│ │mobile│ │    │ │website/ │
   └──────┘ └────┘ └──────┘ └────┘ └─────────┘
```

> **重要澄清**:产品官网位于主仓库 `website/` 目录(Next.js 14 静态导出),**不是独立仓库**。部署到 GitHub Pages(`Xyangshaun/danqing-ai.git` 的 gh-pages 分支),部署脚本 `deploy-gh-pages.cjs` 在根目录。

### 2.2 各端技术栈选型

| 端 | 技术栈 | 端口/入口 | 选型理由 |
|----|--------|----------|----------|
| **后端** | Node.js 20 + Express 4 + Prisma 5 + PostgreSQL 15 + Redis 7 + Zod + JWT RS256 + pino | 3000 | 单语言全栈、Prisma 类型安全、Redis 缓存保障 3s SLA |
| **Web 学生端** | Vite 5 + React 18 + React Router v6 + TailwindCSS 3 + Recharts + Lucide + Vitest | 5173 | Vite 极速 HMR、Recharts 图表、Vitest 与 Vite 共享配置 |
| **Admin 后台** | Ant Design Pro + UmiJS + ProTable + ECharts + RBAC | 8000 | Pro 开箱即用、ProTable 强大、企业级 RBAC |
| **Mobile** | Expo SDK 51 + expo-router + zustand + axios + expo-secure-store + expo-camera | 8081 | Expo 跨平台、expo-router 文件路由、secure-store 安全存储 |
| **Website 官网** | Next.js 14.2.5 App Router + TS + Tailwind + Framer Motion + next-mdx-remote(静态导出) | 3000/3001 | App Router 现代、MDX 博客、静态导出适配 GitHub Pages |

### 2.3 仓库结构

```
6a4f01878de2462eddd4b61e/
├── ./                     # Web 学生/教师端(Vite + React)
├── admin/                 # Admin 管理后台(Ant Design Pro)
├── mobile/                # Mobile 移动端(Expo SDK 51)
├── server/                # 后端服务(Node.js + Express + Prisma)
├── website/               # 产品官网(Next.js 14,静态导出)
├── prototype/             # 早期 HTML 原型(非产品)
├── deploy/                # 部署脚本 + nginx 配置
├── .trae/
│   ├── agents/            # 13 个专用 agent 配置
│   ├── documents/         # 项目文档(本文件所在)
│   └── specs/             # 规格与任务规划
├── package.json           # Web 端依赖
├── deploy-gh-pages.cjs    # GitHub Pages 部署脚本
└── ecosystem.config.cjs   # PM2 进程配置
```

### 2.4 后端分层架构

```
server/src/
├── controllers/   # 18 个 Controller(请求处理 + Zod 校验)
├── services/      # 28 个 Service(业务逻辑)
├── repositories/  # 15 个 Repository(数据访问)
├── routes/        # 16 个路由模块
├── middlewares/   # auth/csrf/permission/rate-limit/tenant/trace/client-adapt/url-guard
├── config/        # env/prisma/redis/permissions
├── types/         # api-contract.ts(单一真源)+ ai-analysis/arbitration
└── utils/         # logger/crypto/http-client/ip/password/redact
```

中间件链路顺序(硬约束):`auth → tenant → rateLimiter → permission → handler`

### 2.5 13 个专用 Agent 体系

项目配备 13 个专用 subagent(见 `.trae/agents/`),分四类:

| 类别 | Agent | 模型 | 职责 |
|------|-------|------|------|
| 🏛️ 协调与设计 | product-architect / ui-designer / compliance-checker | glm-5.2 | 跨端协调、UI 设计、合规审查 |
| 💻 开发实施 | frontend-app / backend-service / marketing-website / mobile-app / admin-dashboard | Doubao_1_6 | 各端功能开发 |
| 🔐 安全与测试 | auth-oauth / api-test-pro / ai-integration-engineer | glm-5.2 | 认证授权、API 测试、AI 集成 |
| 🚀 运维与优化 | devops-qa / performance-expert | glm-5.2 | CI/CD、性能优化 |

---

## 三、完整代码提交记录(按时间顺序)

> 共 24 次 git commit(从 2026-07-10 到 2026-08-03),P3 阶段 5 项子任务已完成但未提交。

### 3.1 MVP 与部署阶段(2026-07-10 ~ 07-11)

| # | Commit | 日期 | 说明 | 规模 |
|---|--------|------|------|------|
| 1 | `7b00848` | 07-10 23:50 | deploy: 丹青有AI项目部署 | 38 文件,+18424 |
| 2 | `6c08ce6` | 07-11 10:11 | fix: 添加 SPA 路由重写规则,修复子页面 404 | 1 文件 |
| 3 | `1fd7e26` | 07-11 10:13 | fix: 替换风格库封面图为可访问的生成图片 | 1 文件 |
| 4 | `288d607` | 07-11 10:25 | feat: 添加 GitHub Pages 部署配置、README、相对路径支持 | 4 文件,+207 |
| 5 | `8ea2ba2` | 07-11 11:21 | fix: 使用 HashRouter 修复 GitHub Pages 子路由 404 | 1 文件 |

**本阶段产出**:9 个业务页面(首页/AI 诊断/素材库/风格库/灵感嫁接/情绪画布/历史/成长/设置)+ 三栏专业软件布局 + 99 件名作素材库 + LocalStorage 存储 + Vercel/GitHub Pages 双部署。

### 3.2 Phase 1:基础架构 + 飞书登录(2026-07-28)

| # | Commit | 日期 | 说明 | 规模 |
|---|--------|------|------|------|
| 6 | `ea2fc85` | 07-28 06:33 | feat: Phase 1 完成 - 后端分层架构 + 飞书OAuth + 前后端同步修复 | 158 文件,+39602/-2820 |

**本阶段产出**:
- 产品架构:PRD + API 契约(11 接口 + 33 错误码)+ 数据模型(5 表 Prisma)
- 美院标准:4 类作品 × 4 维度 × 17-18 子指标四档评分
- 认证设计:飞书 OAuth 12 步流程 + RS256 JWT + state 三重比对
- 后端重构:`server/src/` 分层架构 + 5 个 P0 接口 + Prisma schema
- 前端登录:FeishuLoginButton + AuthCallback + token 管理 + RequireAuth
- API 测试:260 用例 100% 通过,覆盖率 91.61%
- 性能验证:6 个 k6 脚本 + 基准报告

### 3.3 Phase 2:AI 集成 + 核心业务(2026-07-28 ~ 07-29)

| # | Commit | 日期 | 说明 | 规模 |
|---|--------|------|------|------|
| 7 | `30847b6` | 07-28 16:17 | feat: Phase 2 AI 模型集成 - GLM-4V 视觉分析增强 | 11 文件,+4141 |
| 8 | `d37c101` | 07-28 20:14 | feat: Phase 2 核心业务 - 业务页 API 迁移 + RBAC 权限体系 + 清理备份 | 28 文件,+3942/-179 |
| 9 | `92038e7` | 07-29 00:40 | feat: Phase 2 - 业务页迁移 + RBAC权限 + API前缀修复 + 成长曲线API + 前端权限UI | 32 文件,+9823/-185 |

**本阶段产出**:
- GLM-4V 视觉分析增强(`ai-vision.service.ts` + 混合分析编排器 + AI 默认关闭 + 失败 fallback)
- RBAC 多租户权限体系(4 角色 × 16 权限矩阵 + 70 权限测试)
- 9 页从 LocalStorage 迁移到统一 data-service 层(已登录走 API,未登录走 LocalStorage)
- API 前缀统一挂载到 `/api/v1`(5 测试文件 131 处路径同步)
- 成长曲线 API(28 测试)
- 前端权限 UI(TenantSwitcher + PermissionToast + 403 处理)

### 3.4 Phase 3/4/5:功能扩展 + 生产部署(2026-08-02)

| # | Commit | 日期 | 说明 | 规模 |
|---|--------|------|------|------|
| 10 | `2345358` | 08-02 05:16 | feat: Phase 3/4/5 功能 + 生产部署配置 | 270 文件,+100448/-1081 |
| 11 | `0fc6530` | 08-02 17:21 | feat: 新增职业选择 onboarding 流程 + 本地化外网资源 | 25 文件,+1263/-118 |
| 12 | `68b9025` | 08-02 18:44 | feat: AI 生产化启用 - admin AI 配置查看/测试接口 + 多 Provider | 3 文件,+375 |
| 13 | `8e7f4fb` | 08-02 20:46 | feat: AI 用量统计模块 - 4 个统计接口 + 用量日志记录 + DB 迁移 | 10 文件,+1228 |
| 14 | `f1bda67` | 08-02 20:58 | chore: 回归测试修复 + 更新日志 + 测试辅助工具 | 7 文件,+692 |

**本阶段产出**:
- Phase 3:订阅/发票/支付流程
- Phase 4:管理后台(用户/内容/订阅/系统管理 + 审计日志,16 页面骨架)
- Phase 5:评分预设/多评委争议仲裁/手机 OTP 认证/知识库/模块化/UI 配置(预留接口骨架)
- 素材库扩充至 195 个作品 + 风格分类补全
- 部署配置:nginx / ecosystem / .env.production 模板 / DEPLOYMENT.md
- Onboarding 职业选择流程(首次登录选角色)
- AI 生产化管理(配置查看/连通性测试/多 Provider 支持)
- AI 用量统计模块(AiUsageLog 表 + 4 统计接口 + 成本估算)
- 生产部署上线(https://www.danqing.site)

### 3.5 V2 交互骨架优化 + P0/P1/P2 修复(2026-08-02 ~ 08-03)

| # | Commit | 日期 | 说明 | 规模 |
|---|--------|------|------|------|
| 15 | `af9ccac` | 08-02 22:29 | test: admin 前端新增 92 个单元测试 + 修复 mask 脱敏与 request 错误码 | 23 文件,+2960/-237 |
| 16 | `53ad27e` | 08-03 02:33 | feat: 交互骨架优化 V2 - 草稿系统/通知API/交互打磨/性能优化/测试覆盖 | 68 文件,+14746/-610 |
| 17 | `e6bcd90` | 08-03 02:50 | fix: P0 缺陷修复 - 草稿孤儿回滚 + 通知触发点接线 | 4 文件,+275 |
| 18 | `dea6ab2` | 08-03 03:01 | refactor: P1 优化 - Prisma类型修正/通知语义重构/草稿配额LRU/增量同步 | 6 文件,+387/-38 |
| 19 | `1e1f834` | 08-03 03:04 | fix: 修复配额测试 mock 时序 - seedDraft 移至 mock 应用前 | 1 文件 |
| 20 | `a26cec7` | 08-03 03:16 | fix(prisma): bind $on to prismaInstance to preserve this context | 1 文件,+3/-1 |
| 21 | `25142d4` | 08-03 03:31 | fix(P2): traceId 中间件顺序修复 + errorHandler 兜底 UUID 生成 | 5 文件,+731/-11 |

### 3.6 P3 长期优化阶段(2026-08-03,已完成未提交)

> ⚠️ 以下 5 项子任务已在本对话窗口完成,但**尚未 git commit**。

| 子任务 | 内容 | 影响文件 |
|--------|------|----------|
| P3-3.3 角色权限矩阵 | `admin/src/pages/user/roles.tsx` PERM_GROUPS 补 invitationWrite + presetRead/presetWrite,覆盖全部 22 权限码 | 1 文件 |
| P3-3.4 配额管理 | 新建 `admin/src/pages/system/quota.tsx` + `admin/config/routes.ts` 加 `/system/quota` | 2 文件 |
| P3-1.2 移动端导航+核心屏幕 | 3 Tab + 分析报告页 + token 队列刷新 | 多文件 |
| P3-1.3 拍照上传 | `mobile/app/upload.tsx` + `UploadCameraModal.tsx`(expo-camera 连拍 + 批量串行上传) | 多文件 |
| P3-1.4 飞书登录 | 新建 `mobile/app/login.tsx` + `services/device.ts`;扩展 storage/auth/_layout/profile/api | 8 文件 |

---

## 四、各阶段功能实现详情

### 4.1 MVP 阶段(2026-07-10 ~ 07-11)

#### 4.1.1 核心功能:AI 丹青判官(智绘镜)

学生上传作业图片,系统在 3 秒内完成多维度分析,每个维度给出**分数 + 具体可操作建议**(非空泛"再改",而是"天空占比过大(约60%),建议压缩至40%")。

支持 4 种艺术类型,每种独立分析维度:

| 艺术类型 | 维度1 | 维度2 | 维度3 |
|----------|-------|-------|-------|
| 绘画 | 构图(重心/均衡/引导线) | 色彩(冷暖/对比/丰富度) | 笔触技法(力度/肌理/干湿) |
| 设计 | 视觉层次(主次/信息流) | 排版(对齐/网格/节奏) | 色彩应用(品牌/对比/心理) |
| 产品设计 | 形态(比例/线条/人机) | 材质表现(质感/光影/表面) | 功能表达(结构/暗示/细节) |
| 雕塑 | 空间构成(体积/虚实) | 形体语言(动态/张力/韵律) | 材料语言(特性/肌理/层次) |

所有类型共享第 4 维度:**原创性检测**(与网络图片相似度 + 创意建议)。

5 阶段分析流水线可视化:图像预处理 → 特征提取 → 维度分析 → 综合评估 → 报告生成。

#### 4.1.2 其他 MVP 功能

- 课堂素材生成器:99+ 件中外艺术杰作素材库,支持风格/时代/地区标签筛选
- 中式美学风格库:水墨/青绿山水/冰雪艺术等非遗风格
- 灵感嫁接:两张草图融合,8 种嫁接风格 + 6 种融合方法 + 4 种强度 + 6 种预设
- 情绪画布:情绪关键词 → 色彩方案
- 成长追踪:构图/色彩/原创性能力变化曲线

#### 4.1.3 部署相关问题与修复

见 §五"问题修复过程"。

### 4.2 Phase 1:后端重构 + 飞书登录(2026-07-28)

#### 4.2.1 后端分层架构重构

从单文件 `server/server.js`(83 行)重构为完整分层架构:
- `controllers/` 5 个(auth/user/tenant/analysis/artwork)
- `services/` 10 个(auth/user/tenant/analysis/analysis-engine/jwt/session/feishu/knowledge-base)
- `repositories/` 4 个(user/session/tenant/analysis)
- `middlewares/` 7 个(auth/error-handler/rate-limit/tenant/trace/validate)
- `routes/` 5 个

#### 4.2.2 飞书 OAuth 12 步流程

1. 前端调 `GET /auth/feishu/authorize?device_id=xxx` → 返回 `{ authorizeUrl, state }`
2. 前端用 `window.location.href = authorizeUrl` 跳转飞书授权页
3. 飞书授权后重定向到 `redirect_uri?code=xxx&state=xxx`
4. 前端 AuthCallback 取 code+state,调 `GET /auth/feishu/callback?code=xxx&state=xxx`
5. 后端校验 state 三重比对(内存 + Redis + JWT),换 app_access_token,再换 user_access_token
6. 后端取用户信息,创建/更新用户 + 租户,签发 JWT(access 15m + refresh 7d)
7. refresh_token 写 HttpOnly Cookie,csrf_token 写非 HttpOnly Cookie
8. 响应体返回 `{ accessToken, accessTokenExpiresAt, isFirstLogin, user, tenant }`

**安全策略**:RS256 非对称加密 + state 三重比对 + CSRF 双提交 Cookie + refresh_token 滚动刷新。

#### 4.2.3 前端登录集成

- `FeishuLoginButton.tsx`:登录按钮 + device_id 生成
- `AuthCallbackPage.tsx`:回调处理 + state 校验 + token 存储
- `RequireAuth.tsx`:路由守卫
- `AuthContext.tsx`:全局认证状态
- `token-store.ts`:token 持久化

### 4.3 Phase 2:AI 集成 + RBAC(2026-07-28 ~ 07-29)

#### 4.3.1 GLM-4V 视觉分析增强

- `ai-vision.service.ts`(759 行):GLM-4V API 客户端 + Prompt 工程 + 超时控制
- `ai-analysis.service.ts`(471 行):混合分析编排器(Jimp + AI 顺序编排)
- `ai-analysis.ts`:AI 相关类型定义
- 98 个测试用例

**安全策略**:AI 默认关闭(`AI_ENABLED=false`)→ AI 失败自动 fallback 到 Jimp → 评分校准 delta ±5 clamp → 保障 3s SLA(`AI_API_TIMEOUT=2500`)。

#### 4.3.2 RBAC 多租户权限体系

- `permissions.ts`:4 角色(admin/owner/teacher/student)× 16 权限矩阵
- `permission.ts`:3 个中间件工厂(requirePermission / requireAnyPermission / requireAllPermissions)
- `tenant.service.ts`:switchTenant 完善(校验 + 重签 token + role 同步)
- 成员管理 API:`GET/POST/DELETE /tenants/:id/members`
- `analysis.service.ts`:数据范围过滤(student 只读自己,teacher/admin 读租户全部)
- 70 个权限测试用例

#### 4.3.3 业务页 API 迁移

`data-service.ts` 三层架构(IDataService 接口 + LocalDataService + ApiDataService),9 页从 LocalStorage 迁移到统一数据服务:已登录走 API,未登录走 LocalStorage。

### 4.4 Phase 3/4/5:功能扩展(2026-08-02)

#### 4.4.1 Phase 3:订阅管理

- 三档计划(free/standard/enterprise)+ 配额计数 + 升级/取消 + 发票
- Redis 月度配额计数,支付渠道抽象

#### 4.4.2 Phase 4:管理后台

Ant Design Pro 后台,16 页面骨架:
- 数据看板:overview / realtime / tenant(DAU/MAU / AI 调用量 / 租户下钻 / 实时大屏)
- 用户管理:list / detail / roles(脱敏 / 锁定 / 批量操作 / 角色权限矩阵)
- 内容管理:artworks / templates(作品库审核 / 模板 CRUD)
- 订阅管理:list / detail / invoices / plans
- 系统管理:tenants / audit-logs / api-keys / health

#### 4.4.3 Phase 5:扩展功能

- 评分预设:内置预设 + 用户 fork 派生 + 应用重算 + 加权评分
- 多评委争议仲裁:三级争议触发 + 三种裁定规则(加权/多数决/一致决)
- 手机 OTP 认证
- 预留接口骨架(知识库/模块化/UI配置/工作流,当前返回 501)

#### 4.4.4 AI 生产化与用量统计

- AI 配置查看/连通性测试接口(`GET /api/admin/system/ai-config` + `POST .../test`)
- 多 Provider 支持:GLM / OpenAI / Azure / vLLM / TRAE
- AiUsageLog 表(tenant_id 多租户隔离,4 索引)
- 4 个统计接口(overview/by-provider/by-user/trend),Redis 5 分钟缓存
- 成本估算(多模型定价表)

### 4.5 V2 交互骨架优化(2026-08-03)

5 个任务包并行交付:

| 包 | 内容 |
|----|------|
| A. 草稿系统 | `draft-service.ts` LocalStorage CRUD + 索引 + 跨标签订阅 + 7 天清理;HomePage 继续创作区;AnalysisPage 草稿生命周期 |
| B. 通知系统 | Prisma Notification 模型(双复合索引保 3s SLA)+ 4 个 API(list/unread-count/read-all/mark-read)+ Header 改真实 API + 30s 轮询 |
| C. 交互打磨 | ToastProvider 进度型 toast;PageSkeleton 5 variant;EmptyState 引导式;ErrorBoundary 重试;RouteTransition 路由淡入;Button 统一组件 |
| D. 性能优化 | useVirtualList/useLazyImage/usePrefetch 三个 hook;HistoryPage 虚拟列表;MaterialsPage 懒加载;Sidebar hover 预加载;LogoMark/Header memo 化 |
| E. 测试覆盖 | 680 个测试用例(32 文件)覆盖率 71.84%;ESLint 零 warning;tsc strict 零错误;消除 any 类型 |

### 4.6 P3 移动端 + Admin 完善(2026-08-03,未提交)

#### 4.6.1 移动端导航与核心屏幕(P3-1.2)

- 同步 `server/src/types/api-contract.ts` → `mobile/src/types/api-contract.ts`
- store 改用 `UserProfile` + 加 `refreshToken`/`csrfToken`/`updateAccessToken`
- `api.ts` 响应拦截器实现 ApiResponse 拆包 + token 队列刷新(isRefreshing + pendingQueue)
- 3 Tab(首页/历史/我的)+ 分析报告页 + 历史 FlashList 下拉刷新/无限滚动

#### 4.6.2 拍照上传(P3-1.3)

- `mobile/app/upload.tsx` + `UploadCameraModal.tsx`
- expo-camera SDK 51 CameraView + useCameraPermissions + 连拍不关 Modal
- 批量串行上传 + 单张失败不中断 + 结果汇总
- `analyses.ts` `uploadAnalysis`(FormData 字段 image/artType/title?/remark?,timeout 30000)

#### 4.6.3 飞书登录(P3-1.4)

详见 §六"关键技术决策"的 RN Cookie 方案。

#### 4.6.4 Admin 角色权限矩阵 + 配额管理(P3-3.3/3.4)

- `roles.tsx` PERM_GROUPS 补 invitationWrite + presetRead/presetWrite,覆盖全部 22 权限码
- 新建 `quota.tsx`:ProTable 列出 tenants + 席位使用 Progress + 配额详情抽屉 + 调整配额 Modal

---

## 五、问题修复过程

### 5.1 MVP 部署阶段问题(2026-07-11)

#### 5.1.1 GitHub Pages 子路由 404

- **现象**:部署到 GitHub Pages 后,直接访问子页面(如 `/analyze`)返回 404
- **根因**:GitHub Pages 默认不支持 SPA 路由回退
- **修复过程**:
  1. `6c08ce6`:添加 `vercel.json` SPA 路由重写规则(适配 Vercel)
  2. `288d607`:添加 GitHub Pages 部署配置(`deploy-gh-pages.cjs`)+ README + `vite.config.ts` base './'
  3. `8ea2ba2`:改用 `HashRouter` 彻底解决 GitHub Pages 子路由 404(Hash 路由不依赖服务器回退)
- **最终方案**:HashRouter + Vite base './' + deploy-gh-pages.cjs 脚本

#### 5.1.2 风格库封面图失效

- **现象**:风格库封面图外链失效
- **修复**(`1fd7e26`):替换为可访问的生成图片

### 5.2 P0 缺陷修复(2026-08-03)

> 详见 `.trae/specs/p0-fix-plan/fix-plan.md`。基线版本 `53ad27e`,约束:**不修改现有框架结构**,最小侵入式修复。

#### 5.2.1 P0-1 草稿孤儿风险(数据一致性)

- **位置**:`src/services/draft-service.ts` `createDraft`(L160-189)
- **现象**:`createDraft` 先写草稿本体,再追加索引。索引写入失败时**不回滚草稿本体**,注释声称"listDrafts 自愈",但 `listDrafts` 只遍历索引,孤儿草稿永远不会被列出
- **影响**:LocalStorage 配额临界时反复创建草稿,积累无法访问的孤儿草稿,持续占用配额
- **修复**(`e6bcd90`):
  - `createDraft` 索引写入失败时回滚草稿本体:`if (!writeIndex(ids)) { removeDraftRaw(draft.id); return null; }`
  - 新增 `reconcileIndex()` 扫描补全孤儿(惰性触发一次,模块级 flag 避免重复扫描)

#### 5.2.2 P0-2 通知触发点未接线(功能空转)

- **位置**:`server/src/services/notification.service.ts` `createNotification`
- **现象**:`createNotification` 内部方法已就绪,但**没有任何业务点调用**,通知表永远为空,前端通知面板、未读计数 Badge 永远显示 0
- **修复**(`e6bcd90`):`analysis.service.ts` `runAnalysis` 成功后异步创建 `ANALYSIS_DONE` 通知,失败创建 `ANALYSIS_FAIL` 通知;异步 `catch` 兜底不阻塞主流程(3s SLA 不受影响)

#### 5.2.3 P0-3 评审提交未通知作品所有者

- **位置**:`server/src/services/review.service.ts` `createReview`
- **修复**(`e6bcd90`):`createReview` 成功后异步通知作品所有者(`REVIEW` 类型),AI 评审与人工评审均触发

### 5.3 P1 优化修复(2026-08-03)

> 详见 `dea6ab2` commit。

#### 5.3.1 P1-2.3 Prisma 类型修正 + 生产启动失败

- **现象**:P1 类型修正将 `prismaInstance.$on` 赋值给变量后调用,在 ESM 严格模式下 `this` 变为 undefined,导致 `$on` 内部访问 `this._engineConfig` 时报 'Cannot read properties of undefined'。**生产环境 PM2 进程因此启动失败(exit code 1)**
- **修复**(`a26cec7`):添加 `.bind(prismaInstance)` 保留 this 上下文
- **同时优化**(`dea6ab2`):`prisma.ts` 移除 `'warn' as never` hack,改用 `Prisma.LogLevel` 类型转换 `$on` 签名;`.env.production` 追加 `connection_limit=10&pool_timeout=10` 连接池参数

#### 5.3.2 P1-2.4 通知 wasAlreadyRead 语义重构

- **修复**(`dea6ab2`):`notification.service.ts` `markRead` 先查 `existing.readAt` 直接判断 `wasAlreadyRead`,已读通知跳过 `updateMany` 写操作(幂等优化),替代原时间戳比较推断;同步更新 6 个测试用例

#### 5.3.3 P1-2.1 LocalStorage 配额检测 + LRU

- **修复**(`dea6ab2`):
  - 新增 `estimateDraftsChars`/`evictLRU` 内部工具
  - `writeDraftRaw` 写入前配额检测:超 80% 高水位则 LRU 淘汰至 60% 低水位
  - 写入失败(`QuotaExceededError`)紧急淘汰至 30% 后重试一次
  - 新增 5 个配额/LRU 测试用例

#### 5.3.4 P1-2.2 跨标签增量同步

- **修复**(`dea6ab2`):
  - `subscribeDrafts` 回调签名改为 `(change: DraftChange) => void`
  - 增量通知 `{type, id}` 避免全量 `listDrafts` 重拉
  - 索引 key 事件跳过(与草稿 key 事件冗余,避免重复通知)
  - 更新 7 个 subscribeDrafts 测试用例

#### 5.3.5 配额测试 mock 时序

- **现象**:`draft-service.test.ts` 配额测试 mock 时序错误
- **修复**(`1e1f834`):`seedDraft` 移至 mock 应用前

### 5.4 P2 优化修复(2026-08-03)

> 详见 `.trae/specs/p2-optimization/p2-optimization-plan.md` 与 `test-report-20260803.md`。基于生产端到端只读测试 + 服务器配置审查发现 7 项 P2 问题。

#### 5.4.1 P2-6 traceId "unknown" bug(已代码修复)

- **现象**:发送畸形 JSON → `{"code":1001,"message":"请求体 JSON 格式错误","data":null,"traceId":"unknown"}`,traceId 断链
- **根因**:trace 中间件挂在 body parser 之后,body parser 失败时 trace 中间件未执行
- **修复**(`25142d4`):
  - `server/src/app.ts`:traceMiddleware 移到 `express.json` 之前(原 helmet→cors→json→...→trace,新 helmet→cors→trace→json→...)
  - `error-handler.ts`:errorHandler 与 notFoundHandler 兜底从 'unknown' 改为 `generateUuid()`,defense-in-depth
  - 新增 2 项回归测试 + 更新 2 项现有断言

#### 5.4.2 P2-1/2/3/4/5/7 服务器配置问题(待修复)

| 编号 | 问题 | 修复路径 | 状态 |
|------|------|----------|------|
| P2-1 | Nginx 静态资源未启用 gzip(JS 316KB→~80KB) | `/etc/nginx/nginx.conf` 取消 `gzip_types` 注释 | 待修复 |
| P2-2 | 静态资源 Cache-Control 缺失 | `danqing.conf` 加 `location /assets/` | 待修复 |
| P2-3 | 静态资源安全头缺失(HSTS/X-Frame-Options 等) | 加 `add_header` | 待修复 |
| P2-4 | HTTP 80 端口外网不可达(用户输入 http:// 5s 超时) | 腾讯云安全组放行 80 | 待修复 |
| P2-5 | API 响应未启用 gzip | Nginx `location /api/` 加 gzip | 待修复 |
| P2-7 | Nginx 版本号泄露(`Server: nginx/1.18.0`) | `server_tokens off;` | 待修复 |

### 5.5 admin 前端 Bug 修复(2026-08-02)

> 详见 `af9ccac` commit。

- `mask.ts`:`maskPhone`/`maskEmail` 对纯空白输入未返回 '-' 而返回 '',改为先 trim 再判空;`maskIp` 末尾 return 误用 `ip` 改为 `s`
- `request.ts`:错误码 2003/4004 修正为 2004/9005
- 新增 92 个单元测试覆盖脱敏/格式化/认证/下载/请求

### 5.6 回归测试修复(2026-08-02)

> 详见 `f1bda67` commit。

- `analysis.service.test.ts`:`imageUrl` 期望从 `upload://` 改为 `/uploads/`(Nginx 静态服务)
- `tenant-isolation.test.ts`:`createdAt` 从固定日期改为动态当前月,保障 `countMonthlyUsage` 稳定
- 回归测试:839/839 全部通过(100%)

---

## 六、关键技术决策记录

### 6.1 RN Cookie 方案决策(方案 B)— P3-1.4

**背景**:后端 `feishuCallback` 把 refresh_token 写 HttpOnly Cookie,csrf_token 写非 HttpOnly Cookie,响应体只返回 `{ accessToken, accessTokenExpiresAt, isFirstLogin, user, tenant }`(不含 refreshToken/csrfToken)。但移动端 `api.ts` `performRefresh` 预期从 store 取 refreshToken/csrfToken 放 Cookie header 回传 `/auth/refresh`。RN 的 axios(XMLHttpRequest)在 iOS/Android 上**无法可靠读取 Set-Cookie 头**。

**决策过程**:
- 方案 A(优先尝试):mobile 端从 axios response headers 读 set-cookie,解析 refresh_token + csrf_token 存进 store。若 RN 可读 Set-Cookie,此方案零后端改动。
- 方案 B(若 A 不可行):改后端 `feishuCallback`,当 client=mobile 时在响应体额外返回 refreshToken + csrfToken。
- **最终采用方案 B**:RN axios 读 Set-Cookie 不可靠(平台差异、iOS ATS),移动端用 Token 模式是业界标准做法,改动最小且明确可控。

**后端改动**:[server/src/controllers/auth.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/auth.controller.ts#L194-L223):
- 捕获 `setCsrfTokenCookie(res)` 返回的 token 值(csrf.ts L60 `return token;`)
- `client === 'mobile'` 时,响应体追加 `refreshToken` + `csrfToken`
- web/admin 继续走 Cookie 模式(向后兼容)

**影响范围**:后端 `feishuCallback` / `FeishuCallbackResponse` 类型;移动端 `auth.ts` / store / authStorage 持久化。

**待扩展点**:若移动端需支持其他登录方式(手机验证码/邀请码/管理员邮箱密码),需同步改造后端 `phoneVerify` / `invitationRedeem` / `adminLogin` 三个 controller。

### 6.2 跨端类型同步机制

- **单一真源**:`server/src/types/api-contract.ts`
- **同步目标**:`mobile/src/types/api-contract.ts` / `admin/src/types/api.ts` / `src/types/api-contract.ts`(Web)
- **同步方式**:手动同步(无自动化脚本,改动时需同步到各端)
- **命名约定**:camelCase

### 6.3 移动端 Token 刷新机制

**位置**:[mobile/src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts#L94-L149) `performRefresh`

**机制**:
- 从 store 取 refreshToken + csrfToken
- 以 `Cookie: refresh_token=...; csrf_token=...` + `X-CSRF-Token` 头回传 `/auth/refresh`
- `isRefreshing` + `pendingQueue` 合并并发刷新
- 刷新成功:更新 store + 重放原请求(仅一次,`_retry` 标志防循环)
- 刷新失败:清态 + `authStorage.clearAll()` + `router.replace('/login')`

### 6.4 移动端路由守卫与水合

**位置**:[mobile/app/_layout.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/_layout.tsx)

**机制**:
- 启动 `useEffect` 并行读 5 项凭据(accessToken/accessTokenExpiresAt/refreshToken/csrfToken/user)
- 四要素齐全则 `setAuth` 水合
- `isHydrated` 为 false 时返回纯色 View,避免路由守卫在水合前误跳
- 路由守卫:未登录且不在 `/login` → `replace('/login')`;已登录且在 `/login` → `replace('/')`

### 6.5 多租户 RBAC 权限体系

- **22 个权限码**:覆盖数据看板/用户管理/内容管理/订阅管理/系统管理 5 大模块
- **双控机制**:菜单级(access 字段)+ API 级(permission 中间件)
- **权限矩阵**:[admin/src/pages/user/roles.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/user/roles.tsx) PERM_GROUPS

### 6.6 AI 分析安全策略

- AI 默认关闭(`AI_ENABLED=false`)
- AI 失败自动 fallback 到 Jimp(55 条模板规则)
- 评分校准 delta ±5 clamp
- AI 建议含 `evidence` + `priority`(high ≤ 2, med ≤ 2, low ≤ 1, 总 ≤ 5)
- 超时控制 `AI_API_TIMEOUT=2500` 保障 3s SLA

### 6.7 早期关键决策(MVP 阶段)

| 决策 | 选择 | 理由 |
|------|------|------|
| 分析维度从 3 个扩展到 4 种类型 × 3 维度 | 支持绘画/设计/产品/雕塑 | 覆盖美术学院全部专业方向 |
| MVP 阶段使用模拟数据 | 先跑通流程 | 初赛只需要可运行 Demo |
| 原创性检测替代"创意维度" | 降低实现难度 | 从"AI 评价创意"改为"相似度检测 + 建议" |
| 非遗 LoRA 训练改为通用中式美学风格 | 降低实现难度 | LoRA 训练需大量数据和算力,初赛用风格预设替代 |
| 实时多人协作改为两图融合 | 降低实现难度 | 从"多人实时协作"简化为"两张草图融合" |
| 部署方式选择 Vercel + GitHub Pages | 自动部署 | push 后自动上线 |

### 6.8 device_id 生成方案(P3-1.4)

- 优先用 `expo-crypto.randomUUID()` 生成,存 secure-store(key `device.id`)
- 跨登录持久化(用户登出再登录仍是同一设备,后端会话绑定 + 风控需要稳定设备标识)
- 注:expo-constants 在 SDK 51 已无 `installationId`/`deviceId`(仅跨启动变化的 `sessionId`),故直接采用随机 UUID 持久化方案

---

## 七、测试验证体系

### 7.1 测试规模演进

| 阶段 | 时间 | 后端测试 | 前端测试 | Admin 测试 |
|------|------|----------|----------|------------|
| Phase 1 | 07-28 | 260(100%,覆盖率 91.61%) | - | - |
| Phase 2 AI | 07-28 | 358(260 原有 + 98 新增) | - | - |
| Phase 2 RBAC | 07-28 | 428(358 + 70 权限) | - | - |
| Phase 3/4/5 | 08-02 | 456(2.53s) | - | - |
| AI 用量统计 | 08-02 | 79 专项(839 总) | - | - |
| V2 交互骨架 | 08-03 | 873 | 680(32 文件,覆盖率 71.84%) | 92(5 文件) |
| P0/P1/P2 修复后 | 08-03 | **875/875** | 680+ | 92 |

### 7.2 测试类型覆盖

- **单元测试**:服务层/工具函数/中间件
- **集成测试**:控制器 + 服务 + 仓库联动
- **权限测试**:4 角色 × 16 权限矩阵(70 用例)+ 多租户隔离
- **性能测试**:6 个 k6 脚本(auth-login/auth-me/analysis-submit/analysis-list/mixed-workload/smoke-test)
- **边界测试**:配额/LRU/脱敏/格式化
- **一致性测试**:API 响应 envelope、错误码、traceId
- **前端测试**:组件单测(Header/Sidebar/LogoMark/Toast/ErrorBoundary/Button/RouteTransition)+ 页面测试 + 集成测试(命令面板/快捷键/通知)

### 7.3 生产端到端测试(2026-08-03)

> 详见 `.trae/specs/p2-optimization/test-report-20260803.md`。只读黑盒测试 + SSH 服务器配置审查。

| 类别 | 项数 | 通过 | 警告 | 失败 |
|------|------|------|------|------|
| 公开端点可访问性 | 10 | 10 | 0 | 0 |
| 受保护端点鉴权 | 8 | 8 | 0 | 0 |
| 安全响应头(API) | 9 | 9 | 0 | 0 |
| 安全响应头(静态) | 9 | 0 | 9 | 0 |
| Gzip 压缩 | 4 | 0 | 4 | 0 |
| Cache-Control | 4 | 0 | 4 | 0 |
| CORS 预检 | 2 | 2 | 0 | 0 |
| CSRF 行为 | 2 | 2 | 0 | 0 |
| 输入验证 | 4 | 4 | 0 | 0 |
| Body 大小限制 | 2 | 2 | 0 | 0 |
| **合计** | **58** | **41** | **17** | **0** |

**结论**:系统功能完整可用,无致命问题。0 失败,17 待优化(均为 P2 服务器配置项)。

### 7.4 验证清单(任何改动后执行)

- `cd server && npx tsc --noEmit` exit 0
- `cd mobile && npx tsc --noEmit` exit 0
- `cd admin && npx tsc --noEmit` exit 0
- Web 端 `npm run lint` 无错误
- 跨端 api-contract.ts 同步(若后端类型变更)

---

## 八、挑战与解决方案

### 8.1 挑战一:GitHub Pages SPA 路由 404

**挑战**:无编程背景开发者首次部署 SPA 到 GitHub Pages,子页面直接访问 404。

**解决过程**:经历三次迭代——先加 Vercel SPA 重写规则(只适配 Vercel)→ 再加 GitHub Pages 部署配置 → 最终改用 HashRouter 彻底解决。体现"先做流程,再迭代优化"原则。

### 8.2 挑战二:生产环境 PM2 启动失败

**挑战**:P1 Prisma 类型修正引入了 ESM 严格模式下 `this` 丢失 bug,生产环境 PM2 进程启动失败(exit code 1)。

**解决**:`a26cec7` 添加 `.bind(prismaInstance)`。**教训**:类型修正不能破坏运行时语义,ESM 严格模式下 `this` 绑定需特别注意;生产部署前应在相似环境验证。

### 8.3 挑战三:React Native 无法可靠读取 Set-Cookie

**挑战**:移动端飞书登录需要 refresh_token,但后端通过 HttpOnly Cookie 下发,RN axios 无法可靠读取。

**解决**:方案 B——后端对 `client=mobile` 在响应体返回 token。**权衡**:牺牲少量一致性换取移动端可靠性,web/admin 不受影响(向后兼容)。

### 8.4 挑战四:通知系统"功能空转"

**挑战**:V2 任务包 B 完成了通知 CRUD 与 API,但未接入业务触发点,通知表永远为空。

**解决**:P0-2/P0-3 在 `runAnalysis` 和 `createReview` 后异步创建通知,`catch` 兜底不阻塞主流程。**教训**:功能交付需包含"接线"验证,不能只交付"能力"而忘记"调用"。

### 8.5 挑战五:草稿孤儿导致 LocalStorage 配额耗尽

**挑战**:草稿索引写入失败不回滚本体,积累孤儿草稿持续占用配额,最终用户无法新建草稿。

**解决**:P0-1 索引失败回滚 + `reconcileIndex` 扫描补全;P1-2.1 配额检测 + LRU 淘汰(高水位 80% 淘汰至 60%,紧急淘汰至 30%)。

### 8.6 挑战六:3 秒 SLA 保障

**挑战**:AI 视觉分析网络抖动可能突破 3s SLA 硬约束。

**解决**:多层级保障——`AI_API_TIMEOUT=2500` 预留 500ms 余量 → AI 失败自动 fallback 到 Jimp 本地算法 → 评分校准 delta ±5 clamp → AI 默认关闭可灰度启用 → 通知系统双复合索引保障查询性能。

### 8.7 挑战七:traceId 断链

**挑战**:畸形 JSON body 触发 express.json 错误时,trace 中间件尚未执行,traceId 为 'unknown',安全审计链路断裂。

**解决**:P2-6 调整中间件顺序(trace 移到 body parser 之前)+ errorHandler 兜底 `generateUuid()`(defense-in-depth)。

### 8.8 挑战八:无编程背景的全栈开发

**挑战**:开发者无编程背景,全程用自然语言描述需求由 AI 生成代码。

**解决**:13 个专用 subagent 分工协作 + 阶段化开发(Phase 1→2→3)+ 每轮聚焦一个核心需求 + 严格的测试验证清单(tsc/lint/vitest 全绿才推进)。

---

## 九、项目当前状态

### 9.1 已开发功能产品汇总

#### 后端服务(server/)

| 模块 | 核心功能 | 状态 |
|------|---------|------|
| 认证服务 | 飞书 OAuth / 手机 OTP / 邀请码 / 管理员邮箱密码 / JWT / Session / CSRF 双提交 | ✅ |
| 用户管理 | 用户资料 / 角色切换 / 租户切换 / 成员邀请 | ✅ |
| AI 分析服务 | 四类作品诊断 / Jimp 本地算法 + AI 增强 / 3 秒 SLA | ✅ |
| 成长曲线 | 学生成长趋势 / 四维度 / 多时间范围 | ✅ |
| 订阅管理 | 三档计划 / 配额计数 / 升级/取消 / 发票 | ✅ |
| 通知系统 | 通知列表 / 未读计数 / 标记已读 / 全部已读 | ✅ |
| 评分预设(Phase 5) | 内置预设 / 用户 fork 派生 / 应用重算 / 加权评分 | ✅ |
| 多评委争议仲裁(Phase 5) | 评审记录 / 争议触发 / 加权裁定 / 多数决 / 一致决 | ✅ |
| AI 用量统计 | 4 统计接口 + 成本估算 + Redis 缓存 | ✅ |
| 预留扩展接口(Phase 5) | 知识库 / 模块化 / UI 配置 / 工作流 | ⏳ 骨架(501) |
| 管理后台 API | 用户/内容/订阅/数据看板/系统管理 / 审计日志 / RBAC | ✅ |
| 多租户隔离 | 租户数据隔离 / 租户切换 / 席位管理 | ✅ |

**后端路由文件清单**(16 个):auth, user, tenant, analysis, artwork, growth, subscription, notification, preset, review, dispute, knowledge, modules, ui-config, config, admin

#### Web 学生/教师端(根目录 ./)

登录页 / 首页 / 分析页 / 历史页 / 成长页 / 素材库 / 风格页 / 情感页 / 融合页 / 新手引导 / 设置页 / 命令面板 / 通知面板 — 全部 ✅

#### Admin 管理后台(admin/)

数据看板(overview/realtime/tenant)/ 用户管理(list/detail/roles)/ 内容管理(artworks/templates)/ 订阅管理(list/detail/invoices/plans)/ 系统管理(tenants/audit-logs/api-keys/quota/health)— 全部 ✅

#### Mobile 移动端(mobile/)

登录页 / 首页 Tab / 历史 Tab / 我的 Tab / 拍照上传 / 分析报告 / Token 自动刷新 / 路由守卫 / 设备 ID 持久化 — 全部 ✅

#### Website 官网(website/)

首页 / 产品功能 / 应用场景 / 价格方案 / 案例博客(5 篇 MDX)/ 关于我们 / 隐私政策 / 服务条款 — 全部 ✅(静态导出,部署 GitHub Pages)

### 9.2 生产部署状态

| 组件 | 状态 |
|------|------|
| PM2 `danqing-api` | online, fork, Node v20.20.2 |
| Nginx | active, HTTPS(443) + HTTP→HTTPS 跳转 |
| PostgreSQL 15 | Docker, 127.0.0.1:5432 |
| Redis 7 | Docker, 127.0.0.1:6379 |
| 前端 dist | www-data 所有, 21 assets, 0 外链 |
| 公网 `/health` | HTTP 200 (60ms) |
| Git HEAD(生产) | `a26cec7`(P1 已上线) |

**架构拓扑**:`用户 → HTTPS(443) → Nginx → Node.js(:3000, iptables 限制) → PG/Redis(127.0.0.1)`

### 9.3 未解决问题与后续任务

#### 高优先级
1. **移动端其他登录方式实现**(需先改造后端 phoneVerify/invitationRedeem/adminLogin 对 mobile 返回 token)
2. **移动端站内通知接入**(后端 `/notifications` 已就绪)
3. **移动端新手引导 + 成长曲线 + 租户切换 + 个人资料编辑**
4. **P3 阶段 5 项子任务 git commit**

#### 中优先级
5. P2 服务器配置修复(gzip/Cache-Control/安全头/80 端口)
6. Mobile app.config.js Android intentFilters 显式配置
7. Mobile「我的」Tab 菜单项实现

#### 低优先级
8. 后端预留接口实现(知识库/模块化/UI配置/工作流,v2 版本)
9. 性能基准测试与优化(k6 脚本已就绪)
10. 监控告警体系(Prometheus + Grafana)

---

## 十、配套文档索引

### 10.1 设计与研究文档

| 文档 | 内容 |
|------|------|
| [prd.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/prd.md) | 产品需求文档 |
| [tech_arch.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/tech_arch.md) | 技术架构 |
| [api-contract-v1.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/api-contract-v1.md) | API 契约(11 接口 + 33 错误码) |
| [data-model-v1.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/data-model-v1.md) | 数据模型(Prisma) |
| [auth-design.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/auth-design.md) | 认证设计(飞书 OAuth 12 步) |
| [art-evaluation-standards.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/art-evaluation-standards.md) | 美院评分标准 |
| [ai-integration-design.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/ai-integration-design.md) | AI 集成设计 |
| [ai-integration-report.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/ai-integration-report.md) | AI 集成验收报告 |
| [new-features-design.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/new-features-design.md) | Phase 5 新功能设计 |
| [ux-polish-implementation-plan.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/ux-polish-implementation-plan.md) | UX 打磨实施计划 |

### 10.2 Specs 规格文档

| 文档 | 内容 |
|------|------|
| [interaction-skeleton-optimization/spec.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/specs/interaction-skeleton-optimization/spec.md) | 交互骨架优化 PRD |
| [p0-fix-plan/fix-plan.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/specs/p0-fix-plan/fix-plan.md) | P0 缺陷修复计划 |
| [p2-optimization/p2-optimization-plan.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/specs/p2-optimization/p2-optimization-plan.md) | P2 优化计划(7 项) |
| [p2-optimization/test-report-20260803.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/specs/p2-optimization/test-report-20260803.md) | 上线后端到端测试报告 |

### 10.3 上下文日志

| 文档 | 内容 |
|------|------|
| [project-context.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/project-context.md) | 项目上下文(创意历程) |
| [context-log-2026-07-27.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/context-log-2026-07-27.md) | Phase 1 启动交接日志 |
| [project-context-log-2026-08-02.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/project-context-log-2026-08-02.md) | 生产部署 + AI 用量统计日志 |
| [context-log-2026-08-03.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/context-log-2026-08-03.md) | P3 阶段完成日志 |
| [deploy-runbook-danqing.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/deploy-runbook-danqing.md) | 部署运维手册 |

### 10.4 关键文件索引

**后端**:
- API 契约(单一真源):[server/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts)
- 认证 Controller:[server/src/controllers/auth.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/auth.controller.ts)
- 权限配置:[server/src/config/permissions.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/config/permissions.ts)
- Prisma Schema:[server/prisma/schema.prisma](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/prisma/schema.prisma)

**移动端**:
- 根布局(水合+路由守卫):[mobile/app/_layout.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/_layout.tsx)
- 网络封装(token 刷新):[mobile/src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts)
- 登录页:[mobile/app/login.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/login.tsx)

**Admin**:
- 路由配置(含 RBAC):[admin/config/routes.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/config/routes.ts)
- 角色权限矩阵:[admin/src/pages/user/roles.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/user/roles.tsx)

---

## 十一、开发约束与环境

### 11.1 开发环境

- **操作系统**:Windows(PowerShell,无 head/grep,用 dedicated tools)
- **包管理**:npm(不用 yarn)
- **Node.js**:后端要求 Node.js 18+(生产 Node 20 LTS)
- **TypeScript**:严格模式,禁止 any(必要时用 unknown + 类型守卫)

### 11.2 硬性约束

| # | 约束 |
|---|------|
| 1 | AI 分析 3 秒内完成(`AI_API_TIMEOUT=2500`) |
| 2 | 支持四类创意:painting/design/product/sculpture |
| 3 | 多租户隔离:业务表强制 `tenant_id` |
| 4 | 中间件顺序:`auth → tenant → rateLimiter → permission → handler` |
| 5 | API 前缀:`/api/v1` |
| 6 | Cookie 路径:`/api/v1/auth` |
| 7 | CSRF:POST/PATCH/PUT/DELETE 需 `X-CSRF-Token` 头 |
| 8 | 飞书 token 交换:`Authorization: Bearer app_access_token` 头 |
| 9 | AI 建议含 `evidence` + `priority`(high ≤ 2, med ≤ 2, low ≤ 1, 总 ≤ 5) |
| 10 | AI 失败 fallback:55 条模板规则 |
| 11 | DB/Redis 绑定 127.0.0.1 |
| 12 | 部署五阶段(S1-S5)+ 三铁律 |
| 13 | 写操作前只读诊断 + 确认格式 |
| 14 | 前后端 `api-contract.ts` 同步(camelCase) |

### 11.3 设计规范

- **水墨色系**:墨黑 `#1a1a1a` / 宣纸白 `#f5f1e8` / 朱砂红 `#c41e3a` / 青绿 `#5a8a7a` / 金色 `#d4af37`
- **字体**:标题思源宋体(书法感)/ 正文思源黑体
- **设计禁忌**:禁止通用 AI 模板色系(蓝紫渐变)/ 禁止过度阴影圆角 / 禁止 alert/prompt/confirm(用 Toast)

---

**文档结束**。本文档完整记录了丹青有AI 项目从立项到 P3 阶段的开发全过程,涵盖代码提交、问题修复、功能实现、关键决策与研究过程,可供后续开发与复盘追溯。

---

## 十二、2026-08-07 追加 · 官网开场视频 v3 → v4 重制与生产部署

> 完整任务日志:[context-log-2026-08-07.md](context-log-2026-08-07.md)

**核心改动**
- 官网 8s 开场视频由 v3(脚本重制版)升级到 v4(参考视频重制版,对照桌面《黄宾虹风格水墨动画》)
- 视频文件: `website/assets/videos/opening.mp4` · 2,147,659 字节 · 1920×1080 · H.264
- 视频 hash: `_next/static/media/opening.24d55bf457a9fdd7.mp4`
- Remotion 源: `dq-video/src/Composition.tsx`(历史 `Composition.tsx.bak4/5`)

**生产部署**(`43.128.25.202:/var/www/danqing-ai/website/`)
- S1-S5 五阶段全通过,HTTPS 200/视频可独立播放
- 备份链: `backup-20260807-video/`(原 v3 mp4 + RUNBOOK.md)
- 回滚命令: 30 秒内可恢复 v3
- 6 条关键记忆已写入 project_memory.md(部署命令链 / 视频 hash 替换 / Next.js 哈希重命名 / PEM 收权 / 远程命令链)

---

## 十三、2026-08-08 追加 · 控制台快捷入口自定义添加预设 + M4 presence 实时在线状态

> 完整规格:[specs/shortcut-presets/spec.md](../specs/shortcut-presets/spec.md) / [tasks.md](../specs/shortcut-presets/tasks.md) / [checklist.md](../specs/shortcut-presets/checklist.md)

### A. 控制台快捷入口自定义添加预设(前端新功能)

**需求背景**:用户希望在控制台首页"快捷入口"面板中把自己保存的预设(情绪画布/灵感嫁接)固定为快捷入口,一键直达。查证发现原"快捷入口"面板始终为固定内容(创作类型+待办),从未支持自定义添加。

**实现**(纯前端,localStorage,无后端改动):
- 新增 `src/services/shortcutStore.ts`:快捷入口存储(key `danqing-shortcuts`,上限 8),接口 list/add/remove/isShortcutAdded/resolve/prune;快捷入口为**引用**(存 kind+presetId),渲染用最新预设信息覆盖 name/accent
- 修改 `src/pages/HomePage.tsx`:快捷入口面板顶部新增"我的快捷入口区"(横向 pill,n/8 计数)+ 右上角"+"弹层(`ShortcutPickerModal`,情绪/灵感双 Tab 复选框)+ 挂载失效清理(`pruneInvalidShortcuts`)
- 新增 `src/services/shortcutStore.test.ts`:10 个单测

**验证**:
- `npx tsc --noEmit` 0 错误;`npm run build` 成功(2330 modules);vitest 10/10 通过
- 浏览器端(QA,Playwright + `?demo=1` + localStorage 注入):43 项断言 42 PASS / 1 环境性 FAIL(点击跳转在 demo 模式下被鉴权拦截,经 href 校验确认跳转逻辑正确,非产品缺陷)

**关键决策**(用户确认):面板"+"按钮入口 / 仅预设范围 / localStorage 存储 / 上限 8 / 引用式关联。

### B. M4 presence 实时在线状态(飞书登录同步到后台)

**需求**:用户飞书登录后,信息同步到管理员与开发者后台,查看实时状态。

**实现**:
- 后端:新增 `server/src/services/presence.service.ts`(三态判定:online/idle/offline)+ `presence.controller.ts` + 2 路由(`/api/admin/presence/users`、`/api/admin/presence/online`)+ auth 埋点(登录 markOnline/登出 markOffline/中间件被动 touch 60s 节流)
- 管理后台:用户列表三态列 + 30s 轮询;dev/accounts 三态列 + 实时汇总 + 兼容回退
- 无 DB 迁移、无 .env 变更、无 Redis 结构变更(仅新增自动过期 key)

**验证**:presence 全套 32/32 测试通过(10 service + 17 controller + 5 场景);Redis 写放大 60s 节流达标。`permission.test.ts` 70/70 全通过,此前报告的"student 权限 17 vs 18"失败已随 `a0a092f`(dispute:request)提交消除,与 M4 无关。

### C. 部署回滚方案(已写入 runbook)

`deploy-runbook-danqing.md` §5.4-E 新增"通用后端部署回滚(仅 server 端)"。关键点:`deploy-ssh.sh` 只自动备份前端 dist,不备份后端 `server/dist`,故后端回滚点须部署前手动建立(`server/dist.bak.m4.<TS>`)。M4 无 DB/.env/Redis 变更,回滚只需换 dist + `pm2 restart`。


