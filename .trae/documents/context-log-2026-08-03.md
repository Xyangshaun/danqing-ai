# 丹青有AI 项目上下文日志文档

> **文档用途**:供新对话中的 agent 通过一句话提示("请参考上下文日志文档了解前期内容")快速掌握前期所有讨论与实现,实现剩余功能无缝优化与开发。
>
> **生成时间**:2026-08-03
> **最近更新**:2026-08-03(文档同步修正 — 官网位置/部署拓扑/Vercel MCP 废弃)
> **覆盖范围**:P3 长期优化阶段(P3-3.3 / P3-3.4 / P3-1.2 / P3-1.3 / P3-1.4)及项目整体架构
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`

---

## 零、更新日志(2026-08-03 文档同步修正)

### 0.1 本次修正背景

发现 `.trae/agents/` 与 `.trae/documents/` 多个文件中存在与当前生产环境不一致的描述,影响新任务对架构的准确理解。本次同步修正所有差异。

### 0.2 修正范围(共 8 个文件)

| 文件 | 修正类别 | 修正要点 |
|------|---------|---------|
| [04-marketing-website.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/04-marketing-website.md) | 官网位置 | "独立 Next.js 14 项目/部署 Vercel/建议仓库名 danqing-ai-website" → "主仓库 `website/` 目录,静态导出,`deploy-gh-pages.cjs` 推送至 GitHub Pages" |
| [06-admin-dashboard.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/06-admin-dashboard.md) | 部署拓扑 | "独立部署,域名 admin.域名,仅限内网或 VPN 访问" → "与业务 Web 同机部署(腾讯云 VPS),Nginx 子路径/子域名访问" |
| [08-devops-qa.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/08-devops-qa.md) | 部署拓扑 + 文件范围 | 移除"阿里云 ECS/RDS/Tair + 独立 VPS + VPN";文件范围从 `vercel.json/Dockerfile` 改为 `deploy//ecosystem.config.cjs/deploy-gh-pages.cjs` 等实际部署文件 |
| [CONFIG-GUIDE.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/CONFIG-GUIDE.md) | Vercel MCP 废弃 | MCP 清单从 3 个减为 2 个(GitHub + 飞书);删除 Vercel MCP 安装步骤;devops-qa 文件范围更新 |
| [README.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/README.md) | Vercel MCP 废弃 | 删除 "Vercel(可选)" MCP 行与安装步骤 |
| [auth-design.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/auth-design.md) | 域名占位符 | "www.域名/api.域名/admin.域名" → "www.danqing.site";补充实际飞书回调实现说明 |
| [project-context.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/project-context.md) | Vercel 部署计划 | "计划使用 Vercel 部署" → "当前生产部署:腾讯云 VPS + Nginx + PM2 + GitHub Pages";部署上线状态改为 ✅ 已完成 |
| [subagent-config-audit.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/subagent-config-audit.md) | Vercel MCP 废弃 | 04/08 状态从 "⚠️ 缺 Vercel(选装)" → "✅(Vercel MCP 已废弃)";删除 Vercel MCP 安装与 frontmatter 补全步骤 |
| [ux-polish-implementation-plan.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/ux-polish-implementation-plan.md) | 官网位置 | "Marketing 官网...独立项目" → "主仓库 `website/` 目录(Next.js 14 静态导出)" |
| [context-log-2026-08-03.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/context-log-2026-08-03.md) | 官网位置 | §1.2 已修正;§7.3 第 10 项 "Marketing 官网(独立 Next.js 14 项目)" → "Website 官网(主仓库 `website/` 目录)" |

### 0.3 当前生产真实部署架构(权威信息)

```
                    单一腾讯云 VPS(43.128.25.202,1Panel 管理)
┌──────────────────────────────────────────────────────────────────┐
│  Nginx(443/80,HTTPS 强制 301 跳转)                                │
│  ├─→ /              → 业务 Web dist(Nginx 静态服务,21 assets)     │
│  ├─→ /api/v1/       → Node.js(:3000,PM2 fork,仅 127.0.0.1 监听)  │
│  ├─→ /api/admin/    → 同上                                          │
│  ├─→ /admin/        → Ant Design Pro 静态产物(规划中)              │
│  └─→ /health        → Node.js 健康检查                              │
│                                                                   │
│  Node.js 20 LTS(官方 tarball,非 NodeSource)                      │
│  ├─ PM2:danqing-api(fork 模式,--env-file=server/.env)            │
│  └─ 进程内存上限 500M,最大重启 10 次                                │
│                                                                   │
│  Docker(仅数据库,绑定 127.0.0.1,禁止外网监听)                     │
│  ├─ PostgreSQL 15(127.0.0.1:5432)                                │
│  └─ Redis 7(127.0.0.1:6379)                                      │
└──────────────────────────────────────────────────────────────────┘

产品官网(独立于 VPS):
  主仓库 website/ → next build(output: 'export') → deploy-gh-pages.cjs
  → 推送至 Xyangshaun/danqing-ai.git 的 gh-pages 分支 → GitHub Pages 托管
```

### 0.4 关键约束(新任务必读)

1. **官网 = 主仓库 `website/` 目录**(非独立仓库,非 `danqing-ai-website` 仓库)
2. **生产 = 腾讯云 VPS**(非 Vercel,非阿里云,非独立 VPS + VPN)
3. **后端 = Node.js + PM2**(非 Docker 容器化);仅 PG/Redis 用 Docker
4. **MCP = GitHub + 飞书**(Vercel MCP 已废弃,无需安装)
5. **域名 = www.danqing.site**(admin 共用同域名,通过子路径访问)
6. **环境加载 = `--env-file=server/.env`**(Node 20 原生,不使用 dotenv)

### 0.5 保留未修改的历史记录

以下文档保留 Vercel 引用作为**历史决策记录**(非错误,反映当时的演进过程):
- [development-log.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/development-log.md) — Git 提交历史(从 Vercel → GitHub Pages 的演进)
- [context-log-2026-07-27.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/context-log-2026-07-27.md) — 2026-07-27 时间点快照
- [new-features-design.md:1067](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/new-features-design.md#L1067) — "短信网关(阿里云/腾讯云?)"为待决策项

---

## 一、未解决问题与官网(优先关注)

### 1.1 未解决问题清单

#### 1.1.1 移动端登录方式覆盖不全(高优先级)

**现状**:P3-1.4 仅实现了飞书 OAuth 登录(最主流方式)。后端 API 契约已完整定义其他登录方式,但移动端未实现。

| 登录方式 | 后端 API | 后端状态 | 移动端状态 | 阻塞点 |
|---------|---------|---------|-----------|--------|
| 飞书 OAuth | `GET /auth/feishu/authorize` + `GET /auth/feishu/callback` | ✅ 已支持 mobile 分支 | ✅ 已实现 | 无 |
| 手机验证码 | `POST /auth/phone/otp` + `POST /auth/phone/verify` | ✅ 已就绪 | ⏳ 待实现 | **后端 phoneVerify 未对 mobile 分支返回 refreshToken/csrfToken**(仅 feishuCallback 改造了) |
| 邀请码兑换 | `POST /auth/invitation/redeem` | ✅ 已就绪 | ⏳ 待实现 | 同上,`invitationRedeem` 未对 mobile 返回 token |
| 院校管理员邮箱密码 | `POST /auth/login/admin` | ✅ 已就绪 | ⏳ 待实现 | 同上,`adminLogin` 未对 mobile 返回 token |

**待解决方案**:若需在移动端支持上述登录方式,需同步改造后端 `phoneVerify` / `invitationRedeem` / `adminLogin` 三个 controller,对 `client=mobile` 在响应体追加 `refreshToken` + `csrfToken`(参考 `feishuCallback` 的改造模式,见 [server/src/controllers/auth.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/auth.controller.ts#L194-L223))。

#### 1.1.2 移动端功能占位待实现

| 功能 | 位置 | 现状 | 后端支持 |
|------|------|------|---------|
| 「我的」Tab 菜单项(账号设置/消息通知/关于我们) | [mobile/app/(tabs)/profile.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/(tabs)/profile.tsx) L63-65 | Alert 占位 | - |
| 站内通知列表 | 待新建 | 未实现 | ✅ `/notifications` API 已就绪 |
| 新手引导(首次登录职业选择) | 待新建 | 未实现 | ✅ `PATCH /users/role` 已就绪 |
| 租户切换 | 待新建 | 未实现 | ✅ `POST /tenants/switch` 已就绪 |
| 成长曲线页面 | 待新建 | 未实现 | ✅ `GET /growth` 已就绪 |
| 个人资料编辑 | 待新建 | 未实现 | ✅ `PATCH /users/profile` 已就绪 |

#### 1.1.3 后端预留接口未实现(Phase 5 骨架)

4 类预留接口当前返回 `501 NOT_IMPLEMENTED`:
- 知识库实时检索(`/api/v1/knowledge`)
- 模块化功能扩展(`/api/v1/modules`)
- UI 配置与组件数据(`/api/v1/ui`)
- 功能参数与流程控制(`/api/v1/config`)

类型定义已完整(见 [api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts#L1839-L2603) §3.11),v2 版本实现具体业务逻辑。

#### 1.1.4 其他待办

- **P3 后续任务**:P3-3.3/3.4/1.2/1.3/1.4 已完成,需确认 P3 阶段是否还有其他子任务(参考 `.trae/specs/p2-optimization/` 的任务规划模式)
- **Mobile app.config.js intentFilters**:Android 深链接 `danqing://` 的 intentFilters 未显式配置(当前依赖 expo-router `scheme:'danqing'` 自动处理,显式配置更稳妥)
- **Mobile accessTokenExpiresAt 水合**:当前从 secure-store 读取,但未做本地过期预判(依赖后端 TOKEN_EXPIRED 触发刷新,可接受)

### 1.2 产品官网状态

#### 1.2.1 项目定位
- **Next.js 14 项目,位于主仓库 `website/` 目录**(非独立仓库),由 `marketing-website` agent 负责开发(见 `.trae/agents/04-marketing-website.md`)
- **技术栈**:Next.js 14.2.5 App Router + TypeScript + Tailwind + Framer Motion + next-mdx-remote,静态导出(`output: 'export'`)
- **部署方式**:GitHub Pages(主仓库根目录 `deploy-gh-pages.cjs` 脚本,推送至 `Xyangshaun/danqing-ai.git` 的 gh-pages 分支)
- **当前状态**:开发阶段,`website/out/` 已有静态导出产物,尚未公开部署上线

#### 1.2.2 官网文件结构
- `app/`:page.tsx(首页)、product/、pricing/、cases/、blog/(+ [slug])、about/、privacy/、terms/、layout.tsx、not-found.tsx、sitemap.ts、robots.ts
- `components/`:home/(Hero, CoreValue, FeatureShowcase, Scenarios, DataEndorsement)、layout/(Navbar, Footer, Logo)、ui/(CTASection, InkDecoration, RevealOnScroll, Breadcrumb, PageHeader, LegalPage, Section)、seo/(JsonLd)
- `content/blog/`:5 篇 MDX(ai-art-education, composition-analysis, ink-wash-aesthetics, student-growth, teacher-workload)
- `lib/`:site.ts(SITE.url 占位、appUrl 占位)、seo.ts、blog.ts
- `public/images/`:SVG 图片资源

#### 1.2.3 访问方式
- **本地开发**:`cd website && npm run dev`,默认 `http://localhost:3000`(与后端冲突时调 3001)
- **生产部署**:GitHub Pages(gh-pages 分支),域名待产品正式发布后公布

#### 1.2.4 官网板块规划

| 板块 | 内容介绍 | 目标 |
|------|---------|------|
| 首页(Hero) | 产品价值主张 + 主视觉 + CTA"立即体验" | 转化:引导注册 |
| 产品功能 | AI 诊断 / 多维度分析 / 成长曲线 / 多租户管理 | 功能传达 |
| 应用场景 | 院校教学 / 课外培训 / 个人创作 | 场景匹配 |
| 价格方案 | free / standard / enterprise 三档对比 | 转化:引导付费 |
| 关于我们 | 团队介绍 / 使命愿景 / 联系方式 | 品牌信任 |
| 帮助中心 | 使用文档 / FAQ / 视频教程(规划) | 用户支持 |
| 隐私政策 | PIPL/COPPA 合规声明(compliance-checker agent 维护) | 合规保障 |
| 服务条款 | 用户协议 / 知识产权声明 | 法律保障 |

#### 1.2.5 用户反馈渠道

| 渠道 | 状态 | 说明 |
|------|------|------|
| Web 端命令面板 | ✅ | Cmd+K 唤起,含反馈入口 |
| Web 端通知面板 | ✅ | 站内通知系统 |
| Mobile「我的」Tab | ⏳ 规划 | 当前为占位 |
| Mobile 站内通知 | ⏳ 规划 | 后端 API 已就绪,移动端待接入 |
| GitHub Issues | 待公开 | Bug 报告 / 功能请求 |
| 飞书群组 | 邀请制 | 院校用户即时反馈 |
| 邮件 | 待公布 | 正式合作 / 投诉 |

---

## 二、项目整体架构

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

### 2.2 仓库结构

```
6a4f01878de2462eddd4b61e/
├── ./                     # Web 学生/教师端(Vite + React)
├── admin/                 # Admin 管理后台(Ant Design Pro)
├── mobile/                # Mobile 移动端(Expo SDK 51)
├── server/                # 后端服务(Node.js + Express)
├── website/               # 产品官网(Next.js 14,静态导出,GitHub Pages)
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

### 2.3 各端技术栈

| 端 | 技术栈 | 端口/入口 |
|----|--------|----------|
| **后端** | Node.js + Express + Prisma + PostgreSQL + Redis + Zod + JWT + pino | 3000 |
| **Web 学生端** | Vite + React 18 + React Router v6 + TailwindCSS + Recharts + Lucide + Vitest | 5173(Vite 默认) |
| **Admin 后台** | Ant Design Pro + UmiJS + ProTable + ECharts + RBAC | 8000(Umi 默认) |
| **Mobile** | Expo SDK 51 + expo-router + zustand + axios + expo-secure-store + expo-web-browser + expo-camera + expo-crypto + @shopify/flash-list | 8081(Expo 默认) |
| **Website 官网** | Next.js 14.2.5 App Router + TS + Tailwind + Framer Motion + next-mdx-remote(静态导出) | 3000/3001(website/) |

---

## 三、P3 阶段已完成功能详情

### 3.1 P3-3.3 角色权限矩阵 ✅

**文件**:[admin/src/pages/user/roles.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/user/roles.tsx)

**完成内容**:
- `PERM_GROUPS` 补充 `invitationWrite`(系统管理组)+ `presetRead`/`presetWrite`(内容管理组)
- 矩阵现覆盖**全部 22 个权限码**
- 矩阵 Switch 编辑 + 动态加载 + PATCH 更新均完整

**22 个权限码清单**(对应后端 `server/src/config/permissions.ts`):
- 数据看板:canStatsRead
- 用户管理:canUserRead / canUserWrite / canRoleRead / canRoleWrite
- 内容管理:canArtworkRead / canArtworkReview / canTemplateRead / canTemplateWrite / canPresetRead / canPresetWrite
- 订阅管理:canSubscriptionRead / canSubscriptionWrite / canPlanRead / canPlanWrite
- 系统管理:canTenantRead / canTenantWrite / canAuditRead / canApiKeyRead / canApiKeyWrite / canInvitationWrite / canSystemHealth
- 系统访问:canSystemAccess

### 3.2 P3-3.4 配额管理界面 ✅

**文件**:
- [admin/src/pages/system/quota.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/system/quota.tsx)(新建)
- [admin/config/routes.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/config/routes.ts) 加 `/system/quota` 路由(access: canTenantRead)

**功能**:
- ProTable 列出 tenants + 席位使用 Progress
- 行操作"配额详情"抽屉:懒加载 `getTenantStats` 显示 monthlyQuota/quotaUsageRate/monthlyAiCalls/avgScore
- "调整配额"Modal:`updateTenant` 改 plan/maxSeats + `listPlans` 参考表

### 3.3 P3-1.2 移动端导航 + 核心屏幕 ✅

**完成内容**:
- 同步 `server/src/types/api-contract.ts` → [mobile/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/types/api-contract.ts)
- store 改用 `UserProfile` + 加 `refreshToken`/`csrfToken`/`updateAccessToken`
- [api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts) 响应拦截器实现 ApiResponse 拆包 + token 队列刷新(isRefreshing + pendingQueue,performRefresh 从 store 取 refreshToken/csrfToken 放 Cookie header + X-CSRF-Token)
- 3 Tab(首页/历史/我的)+ 分析报告页 [app/analysis/[id].tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/analysis/[id].tsx) + 历史 FlashList 下拉刷新/无限滚动

### 3.4 P3-1.3 拍照上传 ✅

**文件**:
- [mobile/app/upload.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/upload.tsx)(新建)
- [mobile/src/components/UploadCameraModal.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/components/UploadCameraModal.tsx)(新建)
- [mobile/src/services/analyses.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/analyses.ts) `uploadAnalysis`(FormData 字段 image/artType/title?/remark?,timeout 30000)

**功能**:
- expo-camera SDK 51 CameraView + useCameraPermissions + 连拍不关 Modal
- 批量串行上传 + 单张失败不中断 + 结果汇总
- app.config.js 加相机/相册权限
- 首页按钮接 `router.push('/upload')`

### 3.5 P3-1.4 飞书登录集成 ✅

**关键架构决策:RN Cookie 方案(方案 B)**

**问题**:后端 `feishuCallback` 把 refresh_token 写 HttpOnly Cookie,csrf_token 写非 HttpOnly Cookie,响应体只返回 `{ accessToken, accessTokenExpiresAt, isFirstLogin, user, tenant }`(不含 refreshToken/csrfToken)。但移动端 `api.ts` performRefresh 预期从 store 取 refreshToken/csrfToken 放 Cookie header 回传 `/auth/refresh`。RN 的 axios(XMLHttpRequest)在 iOS/Android 上无法可靠读取 Set-Cookie 头。

**决策过程**:
- 方案 A(优先尝试):mobile 端从 axios response headers 读 set-cookie,解析 refresh_token + csrf_token 存进 store + expo-secure-store。若 RN 可读 Set-Cookie,此方案零后端改动。
- 方案 B(若 A 不可行):改后端 feishuCallback,当 client=mobile 时在响应体额外返回 refreshToken + csrfToken。
- **最终采用方案 B**:RN axios 读 Set-Cookie 不可靠(平台差异、iOS ATS),移动端用 Token 模式是业界标准做法,改动最小且明确可控。

**后端改动**:
- [server/src/controllers/auth.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/auth.controller.ts#L194-L223) `feishuCallback`:
  - 捕获 `setCsrfTokenCookie(res)` 返回的 token 值(csrf.ts L60 `return token;`)
  - `client === 'mobile'` 时,响应体追加 `refreshToken` + `csrfToken`
  - web/admin 继续走 Cookie 模式,响应体不含这两个字段(向后兼容)
- [server/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts#L245-L269) `FeishuCallbackResponse` 增加可选 `refreshToken?: string` / `csrfToken?: string`

**移动端改动(8 文件,mobile-app subagent 完成)**:

新增(2):
- [mobile/app/login.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/login.tsx) — 飞书登录页(水墨色系 + openAuthSessionAsync OAuth 完整流程)
- [mobile/src/services/device.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/device.ts) — `getOrCreateDeviceId`(expo-crypto.randomUUID 持久化)

修改(6):
- [mobile/src/utils/storage.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/utils/storage.ts) — authStorage 加 csrfToken/expiresAt;新增 deviceStorage
- [mobile/src/services/auth.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/auth.ts) — 新增 `feishuAuthorize` / `feishuCallback`(带 `X-Client-Context` 头)
- [mobile/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/types/api-contract.ts#L245-L269) — 同步 FeishuCallbackResponse
- [mobile/app/_layout.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/_layout.tsx) — 启动水合(5 项凭据)+ 路由守卫 + login Screen
- [mobile/app/(tabs)/profile.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/(tabs)/profile.tsx) — `onLoginPress` 改 `router.push('/login')`
- [mobile/src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts) — 新增 `redirectToLogin()` 替换 3 处 TODO 清态点

新增依赖:`expo-web-browser@~13.0.2` + `expo-crypto@~13.0.2`

**飞书 OAuth 完整流程**:
1. mobile 调 `GET /auth/feishu/authorize?device_id=xxx&redirect_uri=danqing://auth/feishu/callback&client=mobile` → 返回 `{ authorizeUrl, state, redirectUri }`
2. mobile 用 `expo-web-browser` 的 `openAuthSessionAsync(authorizeUrl, redirectUri)` 打开飞书授权页
3. 飞书授权后重定向到 `danqing://auth/feishu/callback?code=xxx&state=xxx`(深链接被 app 捕获)
4. mobile 取 code+state,调 `GET /auth/feishu/callback?code=xxx&state=xxx` **必须带 `X-Client-Context: {"device_id":"xxx","client":"mobile"}` 头**
5. 后端返回 `{ accessToken, accessTokenExpiresAt, isFirstLogin, user, tenant, refreshToken, csrfToken }`(mobile 分支)
6. mobile 存 accessToken/refreshToken/csrfToken/user 到 store + expo-secure-store,跳首页
7. app.config.js 已有 `scheme:'danqing'` + `extra.feishuRedirectUriMobile:'danqing://auth/feishu/callback'`

**device_id 生成**:
- 优先用 `expo-crypto.randomUUID()` 生成,存 secure-store(key `device.id`)
- 跨登录持久化(用户登出再登录仍是同一设备,后端会话绑定 + 风控需要稳定设备标识)
- 注:expo-constants 在 SDK 51 已无 `installationId`/`deviceId`(仅跨启动变化的 `sessionId`),故直接采用随机 UUID 持久化方案

**验证结果**:
- `server npx tsc --noEmit` exit 0
- `mobile npx tsc --noEmit` exit 0

---

## 四、已开发功能产品汇总

### 4.1 后端服务(server/)

| 模块 | 核心功能 | 状态 | 技术要点 |
|------|---------|------|---------|
| 认证服务 | 飞书 OAuth / 手机 OTP / 邀请码 / 管理员邮箱密码 / JWT / Session / CSRF 双提交 | ✅ | JWT + Redis Session 滚动刷新,多端 Cookie/Token 双模式 |
| 用户管理 | 用户资料 / 角色切换 / 租户切换 / 成员邀请 | ✅ | 多租户 RBAC,owner/admin/teacher/student 四角色 |
| AI 分析服务 | 四类作品诊断(绘画/设计/产品/雕塑)/ Jimp 本地算法 + AI 增强 / 3 秒 SLA | ✅ | Jimp 图像分析 + 视觉模型集成,pHash 感知哈希,ArtCoT 证据锚定建议 |
| 成长曲线 | 学生成长趋势 / 四维度 / 多时间范围 | ✅ | Redis 计数器 + 时序聚合 |
| 订阅管理 | 三档计划 / 配额计数 / 升级/取消 / 发票 | ✅ | Redis 月度配额计数,支付渠道抽象 |
| 通知系统 | 通知列表 / 未读计数 / 标记已读 / 全部已读 | ✅ | 游标分页,(tenantId,userId,readAt) 索引 |
| 评分预设(Phase 5) | 内置预设 / 用户 fork 派生 / 应用重算 / 加权评分 | ✅ | 预设模板 + 维度权重配置 |
| 多评委争议仲裁(Phase 5) | 评审记录 / 争议触发 / 加权裁定 / 多数决 / 一致决 | ✅ | 三级争议触发,三种裁定规则 |
| 预留扩展接口(Phase 5) | 知识库 / 模块化 / UI 配置 / 工作流 | ⏳ 骨架 | 4 类预留接口,当前返回 501 |
| 管理后台 API | 用户/内容/订阅/数据看板/系统管理 / 审计日志 / RBAC | ✅ | 22 个权限码,菜单级+API级双控 |
| 多租户隔离 | 租户数据隔离 / 租户切换 / 席位管理 | ✅ | tenantId 强制过滤中间件 |

**后端路由文件清单**(16 个,位于 `server/src/routes/`):
auth, user, tenant, analysis, artwork, growth, subscription, notification, preset, review, dispute, knowledge, modules, ui-config, config, admin

### 4.2 Web 学生/教师端(根目录 ./)

| 页面 | 核心功能 | 状态 |
|------|---------|------|
| 登录页 | 飞书 OAuth 登录 | ✅ |
| 首页 | 快捷入口 / 最近作品 / 配额展示 | ✅ |
| 分析页 | 作品上传 / AI 诊断结果 / 热力图 / 维度评分 | ✅ |
| 历史页 | 作品列表 / 筛选 / 虚拟滚动 | ✅ |
| 成长页 | 成长曲线 / 趋势分析 | ✅ |
| 素材库 | 艺术品参考 / 风格分类 | ✅ |
| 风格页 | 风格识别 / 风格匹配 | ✅ |
| 情感页 | 情感笔刷 / 意境表达 | ✅ |
| 融合页 | 跨维度融合分析 | ✅ |
| 新手引导 | 首次登录职业选择 | ✅ |
| 设置页 | 个人资料 / 租户切换 | ✅ |
| 命令面板 | 快捷操作(Cmd+K) | ✅ |
| 通知面板 | 站内通知 | ✅ |

### 4.3 Admin 管理后台(admin/)

| 模块 | 子页面 | 核心功能 | 权限码 |
|------|--------|---------|--------|
| 数据看板 | overview / realtime / tenant | DAU/MAU / AI 调用量 / 租户下钻 / 实时大屏 | canStatsRead |
| 用户管理 | list / detail / roles | 用户列表(脱敏)/ 详情 / 锁定 / 批量操作 / 角色权限矩阵 | canUserRead / canRoleRead |
| 内容管理 | artworks / templates | 作品库审核 / 模板 CRUD | canArtworkRead / canTemplateRead |
| 订阅管理 | list / detail / invoices / plans | 订阅列表 / 退款 / 发票 / 套餐管理 | canSubscriptionRead / canPlanRead |
| 系统管理 | tenants / audit-logs / api-keys / quota / health | 租户管理 / 审计日志 / API 密钥 / 配额管理 / 系统健康 | canTenantRead / canAuditRead / canApiKeyRead / canSystemHealth |

### 4.4 Mobile 移动端(mobile/)

| 页面 | 核心功能 | 状态 | 完成任务 |
|------|---------|------|---------|
| 登录页 | 飞书 OAuth 登录 | ✅ | P3-1.4 |
| 首页 Tab | 快捷入口 / 最近作品 | ✅ | P3-1.2 |
| 历史 Tab | 作品列表 / 下拉刷新 / 无限滚动 | ✅ | P3-1.2 |
| 我的 Tab | 用户信息 / 登录入口 / 登出 | ✅ | P3-1.2 |
| 拍照上传 | 相机连拍 / 相册选择 / 批量上传 | ✅ | P3-1.3 |
| 分析报告 | 诊断结果详情 / 维度评分 | ✅ | P3-1.2 |
| Token 自动刷新 | 无感续期 / 并发合并 | ✅ | P3-1.4 |
| 路由守卫 | 未登录跳登录 / 水合恢复 | ✅ | P3-1.4 |
| 设备 ID 持久化 | 跨登录稳定设备标识 | ✅ | P3-1.4 |

---

## 五、关键技术决策记录

### 5.1 RN Cookie 方案决策(方案 B)

**背景**:见 §3.5 P3-1.4。RN 无法可靠读取 Set-Cookie 头。

**决策**:后端 `feishuCallback` 对 `client=mobile` 在响应体返回 refreshToken + csrfToken;web/admin 继续走 Cookie 模式。

**影响范围**:
- 后端 `feishuCallback` / `FeishuCallbackResponse` 类型
- 移动端 `auth.ts` feishuCallback 调用
- 移动端 `store.setAuth` / `authStorage` 持久化

**待扩展点**:若移动端需支持其他登录方式(手机验证码/邀请码/管理员邮箱密码),需同步改造后端 `phoneVerify` / `invitationRedeem` / `adminLogin` 三个 controller(参考 feishuCallback 改造模式)。

### 5.2 跨端类型同步机制

**单一真源**:`server/src/types/api-contract.ts`
**同步目标**:`mobile/src/types/api-contract.ts` / `admin/src/types/api.ts` / `src/types/api-contract.ts`(Web)
**同步方式**:手动同步(无自动化脚本,改动时需同步到各端)

### 5.3 移动端 Token 刷新机制

**位置**:[mobile/src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts#L94-L149) `performRefresh`

**机制**:
- 从 store 取 refreshToken + csrfToken
- 以 `Cookie: refresh_token=...; csrf_token=...` + `X-CSRF-Token` 头回传 `/auth/refresh`
- `isRefreshing` + `pendingQueue` 合并并发刷新
- 刷新成功:更新 store + 重放原请求(仅一次,`_retry` 标志防循环)
- 刷新失败:清态 + `authStorage.clearAll()` + `router.replace('/login')`

### 5.4 移动端路由守卫与水合

**位置**:[mobile/app/_layout.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/_layout.tsx)

**机制**:
- 启动 `useEffect` 并行读 5 项凭据(accessToken/accessTokenExpiresAt/refreshToken/csrfToken/user)
- 四要素齐全则 `setAuth` 水合
- `isHydrated` 为 false 时返回纯色 View,避免路由守卫在水合前误跳
- 路由守卫:未登录且不在 `/login` → `replace('/login')`;已登录且在 `/login` → `replace('/')`

### 5.5 多租户 RBAC 权限体系

**22 个权限码**:覆盖数据看板 / 用户管理 / 内容管理 / 订阅管理 / 系统管理 5 大模块
**双控机制**:菜单级(access 字段)+ API 级(permission 中间件)
**权限矩阵**:[admin/src/pages/user/roles.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/user/roles.tsx) PERM_GROUPS

---

## 六、开发约束与环境

### 6.1 开发环境
- **操作系统**:Windows(PowerShell,无 head/grep,用 dedicated tools)
- **包管理**:npm(不用 yarn)
- **Node.js**:后端要求 Node.js 18+
- **TypeScript**:严格模式,禁止 any(必要时用 unknown + 类型守卫)

### 6.2 关键约束
- **3 秒 SLA 不可破**:AI 分析同步模式 3 秒响应
- **后端端口 3000,API base `/api/v1`**
- **跨端类型来自 api-contract.ts,不独立定义**
- **不创建非必要文档**(本日志文档为用户明确请求)
- **不重写已有文件,只增量修改**
- **mobile/admin/server tsc --noEmit 必须 exit 0**

### 6.3 Agent 体系
项目配备 13 个专用 agent(见 `.trae/agents/`):
1. product-architect — 产品架构师
2. frontend-app — Web 学生端开发
3. backend-service — 后端开发
4. marketing-website — 官网开发
5. mobile-app — 移动端开发
6. admin-dashboard — 管理后台开发
7. auth-oauth — 认证授权专家
8. devops-qa — DevOps 与质量保障
9. ui-designer — UI/UX 设计师
10. api-test-pro — API 测试工程师
11. ai-integration-engineer — AI 集成工程师
12. performance-expert — 性能优化专家
13. compliance-checker — 合规审查员
14. art-professor — 美术教育教授(评价标准)

### 6.4 关键配置文件
- 后端环境:`server/.env.example`
- Mobile 配置:`mobile/app.config.js`(scheme:'danqing',extra.feishuRedirectUriMobile)
- Admin 路由:`admin/config/routes.ts`(RBAC 权限码映射)
- 后端权限:`server/src/config/permissions.ts`(22 权限码定义)
- Prisma Schema:`server/prisma/schema.prisma`

---

## 七、后续任务建议(优先级排序)

### 7.1 高优先级(用户体验关键)

1. **移动端其他登录方式实现**(需先改造后端 phoneVerify/invitationRedeem/adminLogin 对 mobile 返回 token)
2. **移动端站内通知接入**(后端 `/notifications` 已就绪,移动端待接入)
3. **移动端新手引导**(首次登录职业选择,`PATCH /users/role`)
4. **移动端成长曲线页面**(`GET /growth`)

### 7.2 中优先级(功能完善)

5. **移动端租户切换**(`POST /tenants/switch`)
6. **移动端个人资料编辑**(`PATCH /users/profile`)
7. **Mobile「我的」Tab 菜单项实现**(账号设置/消息通知/关于我们)
8. **Mobile app.config.js Android intentFilters 显式配置**

### 7.3 低优先级(长期规划)

9. **后端预留接口实现**(知识库/模块化/UI配置/工作流,v2 版本)
10. **Website 官网开发与部署**(主仓库 `website/` 目录,Next.js 14 静态导出,由 marketing-website agent 负责)
11. **性能基准测试与优化**(k6 脚本已就绪,定期跑基准)

---

## 八、关键文件索引

### 8.1 后端关键文件
- 认证 Controller:[server/src/controllers/auth.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/auth.controller.ts)
- 认证 Service:[server/src/services/auth.service.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/services/auth.service.ts)
- CSRF 中间件:[server/src/middlewares/csrf.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/middlewares/csrf.ts)
- API 契约(单一真源):[server/src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts)
- 权限配置:[server/src/config/permissions.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/config/permissions.ts)
- 认证路由:[server/src/routes/auth.routes.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/routes/auth.routes.ts)

### 8.2 移动端关键文件
- 根布局(水合+路由守卫):[mobile/app/_layout.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/_layout.tsx)
- 登录页:[mobile/app/login.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/login.tsx)
- 网络封装(token 刷新):[mobile/src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/api.ts)
- 认证服务:[mobile/src/services/auth.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/auth.ts)
- 设备 ID:[mobile/src/services/device.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/services/device.ts)
- 全局状态:[mobile/src/store/index.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/store/index.ts)
- 安全存储:[mobile/src/utils/storage.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/utils/storage.ts)
- 拍照上传:[mobile/app/upload.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app/upload.tsx) + [mobile/src/components/UploadCameraModal.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/src/components/UploadCameraModal.tsx)
- 配置:[mobile/app.config.js](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/mobile/app.config.js)

### 8.3 Admin 后台关键文件
- 路由配置(含 RBAC):[admin/config/routes.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/config/routes.ts)
- 角色权限矩阵:[admin/src/pages/user/roles.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/user/roles.tsx)
- 配额管理:[admin/src/pages/system/quota.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/admin/src/pages/system/quota.tsx)

### 8.4 项目文档
- PRD:[.trae/documents/prd.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/prd.md)
- API 契约文档:[.trae/documents/api-contract-v1.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/api-contract-v1.md)
- 认证设计:[.trae/documents/auth-design.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/auth-design.md)
- 技术架构:[.trae/documents/tech_arch.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/tech_arch.md)
- 数据模型:[.trae/documents/data-model-v1.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/documents/data-model-v1.md)
- 部署手册:[.trae/deploy-runbook-danqing.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/deploy-runbook-danqing.md)

---

## 九、新对话使用指南

### 9.1 一句话提示

在新对话中启动新任务时,使用以下提示让 agent 快速掌握前期内容:

> **"请参考上下文日志文档 `.trae/documents/context-log-2026-08-03.md` 了解前期内容,然后[具体任务描述]"**

### 9.2 Agent 选择建议

| 任务类型 | 推荐 agent |
|---------|-----------|
| 移动端功能开发 | mobile-app |
| 后端 API 开发/改造 | backend-service |
| 管理后台开发 | admin-dashboard |
| Web 学生端开发 | frontend-app |
| 官网开发 | marketing-website |
| 认证/权限/安全 | auth-oauth |
| 跨端架构协调 | product-architect |
| 性能优化 | performance-expert |
| API 测试 | api-test-pro |
| 部署/CI/CD | devops-qa |
| 合规审查 | compliance-checker |
| UI/UX 设计 | ui-designer |
| AI 模型集成 | ai-integration-engineer |
| 美术评价标准 | art-professor |

### 9.3 验证清单(任何改动后执行)

- [ ] `cd server && npx tsc --noEmit` exit 0
- [ ] `cd mobile && npx tsc --noEmit` exit 0
- [ ] `cd admin && npx tsc --noEmit` exit 0
- [ ] Web 端 `npm run lint` 无错误
- [ ] 跨端 api-contract.ts 同步(若后端类型变更)

---

**文档结束**。本文档完整记录了丹青有AI 项目 P3 阶段的全部讨论与实现,新对话中的 agent 可据此快速进入工作状态。
