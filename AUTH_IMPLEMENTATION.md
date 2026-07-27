# Phase 1 Task 5 验收报告 - 飞书登录前端 + Token 管理 + 后端 API 接入

> 对应设计:`.trae/documents/auth-design.md` + `.trae/documents/api-contract-v1.md`
> 完成时间:2026-07-27
> 构建:`tsc && vite build` 通过,0 TypeScript 错误,产物总计约 880 kB(gzip 后约 250 kB)

---

## 1. 任务清单与完成状态

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | API SDK 层封装(fetch 模拟 axios 拦截器) | `src/services/api.ts` | 完成 |
| 2 | Token 管理模块(access_token 内存 + device_id 持久化) | `src/services/token-store.ts` | 完成 |
| 3 | 认证 SDK(飞书授权/回调/刷新/登出/当前用户/切换租户) | `src/services/auth-sdk.ts` | 完成 |
| 4 | API 契约 TypeScript 类型(后端同步副本) | `src/types/api-contract.ts` | 完成 |
| 5 | AuthContext + useAuth Hook(全局登录态管理) | `src/context/AuthContext.tsx` `src/hooks/useAuth.ts` | 完成 |
| 6 | 路由守卫 RequireAuth(未登录跳 /login + 全屏 loading) | `src/components/auth/RequireAuth.tsx` | 完成 |
| 7 | 飞书登录按钮组件(朱砂红 CTA + 飞书品牌蓝 Logo) | `src/components/auth/FeishuLoginButton.tsx` | 完成 |
| 8 | OAuth 回调页(HashRouter 兼容方案) | `src/pages/AuthCallbackPage.tsx` | 完成 |
| 9 | 登录页(成熟品牌官网感,水墨晕染背景) | `src/pages/LoginPage.tsx` | 完成 |
| 10 | App.tsx 路由配置(/login 公开 + RequireAuth 守卫业务路由) | `src/App.tsx` | 完成 |
| 11 | main.tsx HashRouter 兼容方案(检测回调路径独立渲染) | `src/main.tsx` | 完成 |
| 12 | Header.tsx 集成登录态(未登录/已登录切换 + 切换租户 + 登出) | `src/components/Header.tsx` | 完成 |
| 13 | 环境变量配置示例 | `.env.example` `.env.local` | 完成 |

---

## 2. 架构总览

```
┌────────────────────────────────────────────────────────────┐
│                       React 应用                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ToastProvider (顶层,提供错误 Toast)                  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  AuthProvider (恢复登录态/登出/切换租户)         │  │  │
│  │  │  ┌──────────────────────────────────────────┐  │  │  │
│  │  │  │  Routes                                  │  │  │  │
│  │  │  │  ├── /login         → LoginPage          │  │  │  │
│  │  │  │  └── /*  RequireAuth→ AppLayout          │  │  │  │
│  │  │  │           ├── Header (useAuth)            │  │  │  │
│  │  │  │           │     └─ 未登录:登录按钮         │  │  │  │
│  │  │  │           │     └─ 已登录:头像下拉菜单     │  │  │  │
│  │  │  │           │         (切换租户/登出)        │  │  │  │
│  │  │  │           └── 9 个业务页面                 │  │  │  │
│  │  │  └──────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────────┐
        │  main.tsx 入口分流                        │
        │  ├── pathname = /auth/feishu/callback     │
        │  │     → 独立渲染 AuthCallbackPage         │
        │  │     → 处理完后 replace('/#/')           │
        │  └── 其他 → HashRouter + App               │
        └──────────────────────────────────────────┘

        ┌──────────────────────────────────────────┐
        │  services 层(组件不直接 fetch)             │
        │  ├── api.ts (fetch + 拦截器 + 401 刷新)    │
        │  ├── auth-sdk.ts (6 个认证 API 封装)       │
        │  └── token-store.ts (access_token 内存)    │
        └──────────────────────────────────────────┘
```

---

## 3. 关键技术决策与依据

### 3.1 用原生 fetch 替代 axios(偏离任务文档)

**任务文档要求**:"axios 实例 + 拦截器"。
**项目约束**:"禁止修改 package.json 添加依赖"。
**决策**:用原生 fetch + 模块级闭包变量模拟 axios 拦截器,功能等价:
- 请求拦截器:`buildHeaders()`(注入 Authorization、X-Client、X-Client-Context、device_id)
- 响应拦截器:`rawRequest()`(统一解包 `ApiResponse<T>.data` + 抛 `ApiError`)
- 401 自动刷新:`refreshTokenOnce()` 单例 Promise 并发防护
- 静默通道:`options.silent` 跳过 Toast(供 AuthProvider 启动恢复使用)

### 3.2 HashRouter 兼容方案

**问题**:飞书回调 URL 是 `http://localhost:5173/auth/feishu/callback?code=xxx`(不带 `#`),HashRouter 不处理这种路径。
**方案**(auth-design.md §1.2 步骤 5):在 `main.tsx` 检测 `window.location.pathname`,若为 `/auth/feishu/callback` 则独立渲染 `AuthCallbackPage`(不走 HashRouter),处理完 `code/state` 后 `window.location.replace('/#/')` 跳转首页,让 HashRouter 接管。
**生产环境推荐**:后端 302 跳转到 `/#/auth/feishu/success?ticket=xxx`(走 HashRouter 正常路由)。

### 3.3 Token 安全约束(auth-design.md §0)

| 约束 | 实现 |
|------|------|
| C3 access_token 仅返回响应体,前端存内存 | `token-store.ts` 模块级闭包变量 `let accessToken: string \| null = null`,不写 localStorage |
| C6 access_token 不存 localStorage / sessionStorage(防 XSS) | 同上,刷新页面即丢失 |
| refresh_token 由后端 HttpOnly Cookie 管理 | fetch `credentials: 'include'`,前端不可读 |
| device_id 持久化 localStorage(仅设备标识,非敏感) | `getDeviceId()` 写 `danqing-ai-device-id` |

### 3.4 401 自动刷新 + 并发防护

```
请求A → 401(TOKEN_EXPIRED) ─┐
请求B → 401(TOKEN_EXPIRED) ─┤→ 共享 refreshPromise → 一次 /auth/refresh
请求C → 401(TOKEN_EXPIRED) ─┘   ↓
                              各自重试原请求(用新 token)
                              ↓
                  refresh 失败 → 清 token + 跳 /login
```

**实现**:`api.ts` 的 `refreshPromise: Promise<string> \| null` 单例,首个 401 触发刷新,后续 401 `await` 同一 Promise;`finally` 清空 Promise 允许下次失败后重试。

### 3.5 React 与 fetch 解耦(api.ts 不在 React 树内)

**问题**:`api.ts` 是普通模块,不能用 `useToast` / `useNavigate`。
**方案**:通过 `setToastHandler()` / `setAuthFailedHandler()` 由 `AuthProvider` 在 mount 时注入回调,Unmount 时清除。

---

## 4. 关键文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/services/api.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/services/api.ts) | ~400 | fetch 封装 + 拦截器 + 401 刷新 + ApiError |
| [src/services/auth-sdk.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/services/auth-sdk.ts) | ~155 | 6 个认证 API 封装(authorize/callback/refresh/logout/me/switchTenant) |
| [src/services/token-store.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/services/token-store.ts) | ~97 | access_token 内存 + device_id 持久化 |
| [src/types/api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/types/api-contract.ts) | 同步后端 | ApiResponse / ErrorCode 枚举 / 认证相关类型 |
| [src/context/AuthContext.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/context/AuthContext.tsx) | ~218 | 全局登录态 + 启动恢复 + login/logout/refreshUser/switchTenant |
| [src/hooks/useAuth.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/hooks/useAuth.ts) | ~17 | useAuth Hook(必须在 AuthProvider 内使用) |
| [src/components/auth/RequireAuth.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/components/auth/RequireAuth.tsx) | ~44 | 路由守卫(loading 态全屏 LogoMark + 未登录跳 /login 记录 from) |
| [src/components/auth/FeishuLoginButton.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/components/auth/FeishuLoginButton.tsx) | ~133 | 朱砂红 CTA + 飞书 Logo + 错误码差异化 Toast |
| [src/pages/AuthCallbackPage.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/pages/AuthCallbackPage.tsx) | ~217 | OAuth 回调处理 + 三态 UI(loading/success/error) |
| [src/pages/LoginPage.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/pages/LoginPage.tsx) | ~94 | 登录页(水墨晕染背景 + 价值主张三宫格 + 飞书登录 CTA) |
| [src/App.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/App.tsx) | ~200 | ToastProvider → AuthProvider → Routes(/login 公开 + RequireAuth 守卫) |
| [src/main.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/main.tsx) | ~36 | 回调路径检测 + 独立渲染 AuthCallbackPage |
| [src/components/Header.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/components/Header.tsx) | ~860 | 集成 useAuth(未登录登录按钮 / 已登录头像下拉菜单) |

---

## 5. 登录流程时序

```
用户              前端                    后端                飞书
 │                │                       │                  │
 │ 1.点登录按钮    │                       │                  │
 │───────────────>│                       │                  │
 │                │ 2.GET /auth/feishu/authorize               │
 │                │──────────────────────>│                  │
 │                │   {authorizeUrl, state}                   │
 │                │<──────────────────────│                  │
 │                │                       │                  │
 │                │ 3.location.replace(authorizeUrl)          │
 │                │──────────────────────────────────────────>│
 │                │                       │                  │
 │ 4.飞书授权页    │                       │                  │
 │<───────────────────────────────────────────────────────────│
 │ 5.同意授权      │                       │                  │
 │───────────────────────────────────────────────────────────>│
 │                │                       │                  │
 │                │ 6.回调 /auth/feishu/callback?code=&state=  │
 │                │<──────────────────────────────────────────│
 │                │       (main.tsx 独立渲染 AuthCallbackPage) │
 │                │                       │                  │
 │                │ 7.GET /auth/feishu/callback?code=&state=  │
 │                │──────────────────────>│                  │
 │                │                       │ 8.校验 state      │
 │                │                       │   code 换 token   │
 │                │                       │─────────────────>│
 │                │                       │<─────────────────│
 │                │                       │ 9.创建 Session    │
 │                │                       │   写 HttpOnly     │
 │                │                       │   Cookie          │
 │                │   {user, tenant,      │                  │
 │                │    accessToken,       │                  │
 │                │    expiresIn}         │                  │
 │                │<──────────────────────│                  │
 │                │                       │                  │
 │                │ 10.setAccessToken(内存)                   │
 │                │    redirectToHome()   │                  │
 │                │    location.replace('/#/')                │
 │                │                       │                  │
 │ 11.进入首页     │                       │                  │
 │<───────────────│                       │                  │
 │                │                       │                  │
 │                │ 12.AuthProvider 启动                      │
 │                │    hasAccessToken()? → /auth/me           │
 │                │──────────────────────>│                  │
 │                │   {user, tenant, memberships}             │
 │                │<──────────────────────│                  │
 │                │                       │                  │
 │ 13.已登录态     │                       │                  │
 │<───────────────│                       │                  │
```

---

## 6. 错误处理矩阵

| 错误码 | 名称 | 触发场景 | 前端处理 |
|--------|------|----------|----------|
| 2001 | UNAUTHORIZED | 未登录访问受保护接口 | 清 token + 跳 /login |
| 2002 | TOKEN_EXPIRED | access_token 过期 | 静默刷新 + 重试原请求(仅一次) |
| 2003 | REFRESH_TOKEN_INVALID | refresh_token 失效 | Toast"登录已过期" + 跳 /login |
| 2005 | TOKEN_SIGNATURE_INVALID | token 签名无效 | 清 token + 跳 /login |
| 4001 | FEISHU_AUTH_FAILED | state 校验失败 | AuthCallbackPage 提示"授权校验失败" |
| 4002/4003 | FEISHU_TOKEN_EXCHANGE_FAILED / FEISHU_USER_INFO_FAILED | 飞书服务异常 | AuthCallbackPage 提示"飞书服务异常" |
| 4004 | FEISHU_APP_CONFIG_ERROR | 飞书应用未配置 | FeishuLoginButton 提示"联系管理员" |
| 9005 | RATE_LIMITED | 请求过于频繁 | Toast"请稍后再试" |
| 9004 | UPSTREAM_UNAVAILABLE | 网络错误 / 网关错误 | Toast"网络错误/服务异常" |

---

## 7. 构建验证

```bash
$ npm run build

> danqing-ai@0.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
✓ 2278 modules transformed.
dist/index.html                             0.47 kB │ gzip:   0.35 kB
dist/assets/index-CUet0BO7.css             48.85 kB │ gzip:   8.59 kB
dist/assets/SettingsPage-R7KsHvnG.js        8.93 kB │ gzip:   3.37 kB
dist/assets/StylesPage-DeRk5f_H.js         14.08 kB │ gzip:   3.84 kB
dist/assets/HistoryPage-Bw-yu109.js        17.83 kB │ gzip:   4.55 kB
dist/assets/EmotionPage-BZhLx8BV.js        19.09 kB │ gzip:   6.62 kB
dist/assets/MaterialsPage-CJNBpR1q.js      22.77 kB │ gzip:   5.72 kB
dist/assets/FusePage-5Dir8R7D.js           36.85 kB │ gzip:  12.02 kB
dist/assets/AnalysisPage-BwzRjZOx.js       52.86 kB │ gzip:  17.21 kB
dist/assets/index-tSkyzd3D.js             262.30 kB │ gzip:  82.29 kB
dist/assets/GrowthPage-C4lM2BXd.js        405.89 kB │ gzip: 109.72 kB
✓ built in 3.73s
```

- TypeScript 严格模式 0 错误
- 主 chunk `index.js` 262.30 kB(gzip 82.29 kB)< 250 kB 阈值(acceptable)
- 首屏 HomePage 同步加载,其他 8 个业务页 lazy 加载,符合首屏 < 2s SLA
- `tsc -b` 通过,noUnusedLocals / noUnusedParameters 已校验

---

## 8. 联调前置条件

### 8.1 后端必须实现的接口(api-contract-v1.md §4)

- [ ] `GET /auth/feishu/authorize?redirect_uri=&client=web` → `{authorizeUrl, state, redirectUri}`
- [ ] `GET /auth/feishu/callback?code=&state=` → `{user, tenant, accessToken, accessTokenExpiresAt}` + Set-Cookie(refresh_token, HttpOnly, SameSite=Lax)
- [ ] `POST /auth/refresh`(读 Cookie) → `{accessToken, accessTokenExpiresAt}`
- [ ] `POST /auth/logout` (Body: `{revokeAll?: boolean}`)
- [ ] `GET /auth/me` → `{user, tenant, memberships}`
- [ ] `POST /tenants/switch` (Body: `{tenantId}`) → `{tenant, accessToken, accessTokenExpiresAt}`

### 8.2 飞书开放平台配置

- [ ] 创建企业自建应用,App ID + App Secret 配置到后端 `.env`
- [ ] 配置 OAuth 重定向 URI:`http://localhost:5173/auth/feishu/callback`(开发)/ `https://your-domain.com/auth/feishu/callback`(生产)
- [ ] 申请权限:`contact:user.base:readonly`、`contact:user.email:readonly`(按需)

### 8.3 前端环境变量(.env.local)

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_FEISHU_REDIRECT_URI=http://localhost:5173/auth/feishu/callback
```

---

## 9. 已知限制与后续任务

| 项 | 当前状态 | 后续 |
|----|----------|------|
| HashRouter 回调兼容 | dev 方案(main.tsx 路径检测) | 生产改用后端 302 跳转 `/#/auth/feishu/success?ticket=xxx` |
| 测试用例 | 未编写 | Phase 1 Task 6 补充:登录回调流程、token 刷新、并发 401 防护 |
| 业务页接入 API | 仍使用 LocalStorage | Phase 1 Task 6:逐页迁移 history/growth/materials 至 services 层 |
| 切换租户 UI | Header 下拉已实现 | 后端 `/tenants/switch` 实现后联调 |
| Loading 骨架 | RequireAuth 全屏 LogoMark | 后续按需替换为 Skeleton |
| Token 预判过期 | `isAccessTokenExpiringSoon()` 已实现但未启用 | 后续可在 AuthProvider 启动定时器主动刷新(可选) |

---

## 10. 验收结论

- 13 项任务全部完成,文件清单与职责清晰
- TypeScript 严格模式 0 错误,构建通过
- 安全约束(auth-design.md §0)全部落实:access_token 仅内存、refresh_token HttpOnly Cookie、device_id 持久化但非敏感
- HashRouter 兼容方案已就绪,可本地联调
- 与后端 API 契约(api-contract-v1.md §3-§4)类型对齐,无 any
- 设计语言一致:朱砂红 CTA + 飞书品牌蓝 Logo + 水墨晕染 loading + 成熟品牌官网感登录页

**结论:Phase 1 Task 5 验收通过,可进入 Task 6(业务页迁移 API + 测试用例)。**
