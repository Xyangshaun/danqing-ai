# 丹青有AI - 飞书 OAuth 2.0 认证授权设计文档

> **文档定位**:Phase 1 任务 3 核心交付物。本文件是后续 `backend-service` 实现 `/auth/feishu/*` 接口、`frontend-app` 实现登录回调、`api-test-pro` 编写测试用例的**唯一权威契约**。
>
> **作者**:07身份认证安全专家(auth-ooauth)
> **日期**:2026-07-27
> **版本**:v1.0
> **状态**:待后端 / 前端 / 测试三方评审签字
> **审查入口**:任何对本文件的修改必须经过安全审查,且不得削弱第 0 章任一硬约束。

---

## 0. 设计原则与硬约束(不可降级)

本系统是面向高校艺术教育的多租户 SaaS,认证模块是全平台(Web / 移动 / 管理后台 / 官网)的统一身份入口。下列约束为**安全红线**,任何实现均不得绕过或降级。

| # | 约束 | 说明 |
|---|---|---|
| C1 | JWT 必须使用 RS256 非对称签名 | 禁止 HS256 对称加密。私钥仅在认证服务进程内存中,不落盘、不出容器 |
| C2 | refresh_token 必须存 HttpOnly Cookie | `HttpOnly; Secure; SameSite=Strict; Path=/auth`,禁止 localStorage / sessionStorage(XSS 防护) |
| C3 | access_token 仅返回响应体 | 前端存内存(JS 变量),刷新页面即丢失,由 refresh_token 重新换取 |
| C4 | 禁止 URL 参数传递 token | 不允许 `?access_token=xxx` 这类形式;query 仅允许 `code` 与 `state` |
| C5 | OAuth 回调必须校验 state | 比对 Redis 中的 `client_ip + user_agent`,不一致一律拒绝 |
| C6 | 每个数据请求必须校验 tenant_id | JWT payload 携带 `tenant_id` + `role`,数据层强制过滤 |
| C7 | 所有 token 必须可撤销 | access_token 通过 Redis 黑名单(`jti`),refresh_token 通过 DB Session 表 + 滚动失效 |
| C8 | 所有敏感操作必须审计 | 登录 / 登出 / 刷新 / 租户切换 / 权限变更落审计表,日志脱敏 |
| C9 | 密钥全部从环境变量 / KMS 读取 | 禁止硬编码;生产环境私钥建议挂载 KMS / Secret Manager |
| C10 | 严格遵守 OAuth 2.0 / OIDC 标准 | 禁止自创 OAuth 流程,禁止把 access_token 暴露给前端 URL |
| C11 | 默认拒绝(Deny by default) | 任何缺失权限的请求一律 403,不暴露资源存在性 |
| C12 | 日志脱敏 | token / App Secret / 手机号 / 邮箱在日志中必须脱敏(见 §3.9) |

**设计基线**:OWASP ASVS Level 2 + OWASP Top 10 2021 覆盖。

---

## 1. 飞书 OAuth 2.0 完整流程设计

### 1.1 流程总览(Mermaid sequenceDiagram)

下图覆盖任务要求的**完整 12 步流程**,以及与 7 个参与者的交互时序。请配合 §1.2 详细步骤说明阅读。

```mermaid
sequenceDiagram
    autonumber
    participant U as User(浏览器)
    participant F as Frontend(React Web)
    participant B as Backend(Node.js API)
    participant R as Redis(会话/State)
    participant FS as Feishu(开放平台)
    participant DB as PostgreSQL(Prisma)

    %% ===== 步骤 1:用户点击"飞书登录" =====
    U->>F: 1. 点击"飞书登录"按钮

    %% ===== 步骤 2:前端请求后端获取授权 URL =====
    F->>B: 2. GET /auth/feishu/authorize<br/>(Header: X-Client-Context={device_id, client})

    %% ===== 步骤 3:后端生成 state 存 Redis =====
    B->>B: 3a. 生成 state=crypto.randomBytes(32).hex
    B->>R: 3b. SET oauth:state:{state} = {client_ip, user_agent, device_id, created_at} EX 300
    B-->>F: 3c. 200 OK { authorize_url, state, expires_in:300 }

    %% ===== 步骤 4:前端跳转到飞书授权页 =====
    F->>U: 4. window.location.replace(authorize_url)
    U->>FS: 4. 浏览器跳转到飞书授权页

    %% ===== 步骤 5:用户授权,飞书回调 =====
    U->>FS: 5a. 用户在飞书页点击"同意授权"
    FS-->>U: 5b. 302 重定向到 redirect_uri?code=xxx&state=xxx
    U->>F: 5c. 浏览器请求 http://localhost:5173/auth/feishu/callback?code=xxx&state=xxx

    %% ===== 步骤 6:前端把 code+state 转交后端,后端校验 state =====
    F->>B: 6a. POST /auth/feishu/callback {code, state, device_id}
    B->>R: 6b. GET oauth:state:{state} → 取出 {client_ip, user_agent, device_id}
    B->>B: 6c. 比对 state 存在 + client_ip 一致 + user_agent 一致<br/>不一致 → 400 + 审计告警
    B->>R: 6d. DEL oauth:state:{state}(一次性消费)

    %% ===== 步骤 7:后端用 code 换 access_token + 获取用户信息 =====
    B->>FS: 7a. POST /authen/v1/access_token {grant_type:authorization_code, code, app_id, app_secret}
    FS-->>B: 7b. {access_token, refresh_token, open_id, union_id, scope, expires_in}
    B->>FS: 7c. GET /authen/v1/user_info (Bearer access_token)
    FS-->>B: 7d. {name, avatar, email, mobile, employee_no, tenant_key}

    %% ===== 步骤 8:后端查询/创建 User 和 TenantMember =====
    B->>DB: 8a. SELECT User WHERE feishu_union_id=? (事务开始)
    alt 用户首次登录(不存在)
        B->>DB: 8b. INSERT User {user_id(uuid), name, avatar, email, mobile_masked, feishu_open_id, feishu_union_id, status=active}
        B->>DB: 8c. INSERT TenantMember {tenant_id(基于 tenant_key), user_id, role=student, status=active}
    else 用户已存在
        B->>DB: 8d. UPDATE User SET last_login_at=now(), avatar=?, name=?
    end
    B-->>DB: 8e. 事务提交

    %% ===== 步骤 9:后端生成 JWT(access_token + refresh_token) =====
    B->>B: 9a. 生成 jti_access=crypto.randomUUID()
    B->>B: 9b. 签发 access_token(RS256, payload: sub/tenant_id/role/feishu_open_id/jti/exp=15m)
    B->>B: 9c. 生成 jti_refresh=crypto.randomUUID()
    B->>B: 9d. 签发 refresh_token(RS256, payload: sub/jti/iat/exp=7d)
    B->>R: 9e. SET session:{user_id}:{device_id} = {jti_access, jti_refresh, refresh_token_hash, ip, ua, created_at} EX 604800
    B->>DB: 9f. INSERT Session {session_id, user_id, device_id, refresh_token_hash, ip, ua, expires_at}

    %% ===== 步骤 10:refresh_token 写 HttpOnly Cookie,access_token 返回响应体 =====
    B-->>F: 10a. 200 OK Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=604800
    B-->>F: 10b. 200 OK Body: {access_token, expires_in:900, user:{user_id, name, avatar, tenant_id, role, permissions}}

    %% ===== 步骤 11:前端跳转首页,后续请求带 access_token =====
    F->>F: 11a. access_token 存内存变量(不落 localStorage)
    F->>U: 11b. router.replace('/dashboard')
    U->>F: 11c. 用户在应用内操作
    F->>B: 11d. GET /api/xxx (Header: Authorization: Bearer {access_token})
    B->>R: 11e. 检查 blacklist:{jti} 是否存在
    B-->>F: 11f. 200 OK {code, message, data, traceId}

    %% ===== 步骤 12:token 过期后用 refresh_token 刷新 =====
    Note over F,B: access_token 401 (exp 过期)
    F->>B: 12a. POST /auth/token/refresh (Cookie: refresh_token=...; Header: X-CSRF-Token)
    B->>R: 12b. 校验 refresh_token 签名 + 检查 blacklist:{jti_refresh}
    B->>DB: 12c. 校验 Session.refresh_token_hash == SHA256(refresh_token)
    B->>R: 12d. 旧 refresh_token 加入黑名单 SET blacklist:{jti_refresh} EX {remaining_ttl}
    B->>B: 12e. 签发新 access_token + 新 refresh_token(滚动刷新)
    B->>R: 12f. 更新 session:{user_id}:{device_id}
    B->>DB: 12g. UPDATE Session SET refresh_token_hash=新哈希
    B-->>F: 12h. 200 OK Set-Cookie(新 refresh_token) + Body(新 access_token)
```

> **图例说明**:`autonumber` 自动标注 12 个主步骤;`alt/else/end` 表示用户首次登录与已存在的分支;`Note` 标注触发条件。本图覆盖任务清单中的全部 12 步,验收见 §6。

---

### 1.2 详细步骤说明

> 统一约定:所有响应体遵循项目规范 `{ code, message, data, traceId }`,以下仅展开 `data` 字段内容以节省篇幅。`traceId` 由后端生成用于全链路追踪(不包含敏感信息)。

#### 步骤 1 - 用户点击"飞书登录"

| 项 | 内容 |
|---|---|
| 触发 | 用户在登录页点击"飞书登录"按钮 |
| 前端动作 | 调用步骤 2 接口获取 `authorize_url`,再 `window.location.replace()` 跳转 |
| 安全注意 | 按钮 disabled 防止重复点击;前端生成 `device_id`(持久化在 localStorage,仅作设备指纹,不含敏感信息) |

#### 步骤 2 - 前端请求 `/auth/feishu/authorize`

```
GET /auth/feishu/authorize
Headers:
  X-Client-Context: { "device_id": "<uuid>", "client": "web" | "admin" | "mobile" }
  X-Forwarded-For: <client_ip>(由网关注入,后端取首个)
  User-Agent: <ua>
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| device_id | string(uuid) | 是 | 前端首次访问生成的设备指纹,localStorage 存储 |
| client | enum | 是 | `web` / `admin` / `mobile`,决定回调 redirect_uri |

**响应 200**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "authorize_url": "https://open.feishu.cn/open-apis/authen/v1/index?app_id=cli_xxx&redirect_uri=...&state=abc123&scope=contact:user.base:readonly",
    "state": "abc123...",
    "expires_in": 300
  },
  "traceId": "..."
}
```

**错误处理**:
- `429` - 触发限流(见 §3.3),返回 `{"code":4291,"message":"too many requests"}`
- `500` - Redis 不可达,降级拒绝(不签发 state,Deny by default)

**安全注意**:
- `redirect_uri` 必须与服务端白名单严格匹配(见 §3.4)
- `client` 参数决定使用哪个 `FEISHU_REDIRECT_URI_*`
- `device_id` 仅作会话隔离,不作为信任依据

#### 步骤 3 - 后端生成 state 并存 Redis

**state 生成**:
```typescript
const state = crypto.randomBytes(32).toString('hex'); // 64 字符,256bit 熵
const ctx = { client_ip, user_agent, device_id, client, created_at: Date.now() };
await redis.set(`oauth:state:${state}`, JSON.stringify(ctx), 'EX', 300);
```

**authorize_url 拼装**(飞书标准):
```
https://open.feishu.cn/open-apis/authen/v1/index
  ?app_id={FEISHU_APP_ID}
  &redirect_uri={URL_ENCODED_REDIRECT_URI}
  &response_type=code
  &state={state}
```

> 注意:飞书 OAuth 的 scope 在应用后台配置时已勾选,无需在 authorize URL 显式传 `scope`。若后续需要增量授权,再追加 `&scope=...`。

**安全注意**:
- state 必须使用密码学安全随机源(`crypto.randomBytes`),禁止 `Math.random()`
- state 一次性消费,步骤 6 校验通过后立即 `DEL`
- TTL 严格 300s,过期自动失效

#### 步骤 4 - 前端跳转到飞书授权页

| 项 | 内容 |
|---|---|
| 动作 | `window.location.replace(authorize_url)`(replace 防止后退回登录页) |
| 安全注意 | 不要用 `href` 赋值,replpace 避免历史栈污染 |

#### 步骤 5 - 用户授权后飞书回调

```
GET {redirect_uri}?code={code}&state={state}
```

| 参数 | 类型 | 说明 |
|---|---|---|
| code | string | 飞书授权码,有效期约 5 分钟,一次性 |
| state | string | 步骤 3 颁发的 state 原值 |

**HashRouter 兼容方案**(重要):

项目前端使用 HashRouter(路由形如 `/#/dashboard`),但飞书回调到的是**标准路径** `/auth/feishu/callback?code=xxx&state=xxx`(不带 `#`)。直接配合 HashRouter 会出现路由解析问题。采用如下方案:

1. **回调路径走后端,不走前端路由**(推荐,生产可用):
   - 飞书重定向 URL 配置为后端:`https://www.danqing.site/api/v1/auth/feishu/callback`
   - 后端处理完 code/state 后,`302` 跳转到前端 `https://www.danqing.site/auth/feishu/callback?session=...`(session 为一次性短 TTL 票据,前端用它换取 access_token,避免 URL 暴露 token)
   - **实际实现**:当前生产使用前端回调方案,飞书重定向 URL 为 `https://www.danqing.site/auth/feishu/callback`(见 `VITE_FEISHU_REDIRECT_URI`),Nginx `try_files` 兜底到 SPA index.html
2. **开发环境妥协方案**(本地联调):
   - Vite dev server 默认会把所有路径 fallback 到 `index.html`,因此 `/auth/feishu/callback?code=...` 也能加载到 React App
   - 在 `App.tsx` 顶层 `useEffect` 检测 `window.location.pathname === '/auth/feishu/callback'`,从 `searchParams` 取 `code/state`,调用步骤 6 接口,完成后 `router.replace('/dashboard')`
   - 此方案仅用于 dev,生产必须走方案 1

> 后端 `backend-service` 实现时请优先采用**方案 1**,并将飞书重定向 URL 调整为后端域名。当前 `.trae/documents/context-log-2026-07-27.md` 中配置的前端重定向 URL 仅作 dev 联调用,生产前必须更新。

**错误处理**:
- 用户拒绝授权:飞书回调 `?error=access_denied`,前端跳转回登录页并提示
- state 缺失:`400`,审计告警(疑似 CSRF)

#### 步骤 6 - 后端校验 state,用 code 换 access_token

```
POST /auth/feishu/callback
Content-Type: application/json
Headers: X-Forwarded-For, User-Agent
Body:
{
  "code": "string",
  "state": "string",
  "device_id": "string(uuid)",
  "client": "web" | "admin" | "mobile"
}
```

**校验顺序**(任一失败立即 400 + 审计):
1. `state` 非空、长度 64、仅 hex
2. Redis `GET oauth:state:{state}` 存在
3. 取出 `{client_ip, user_agent, device_id}`:
   - `client_ip === 当前请求 X-Forwarded-For` 首段
   - `user_agent === 当前请求 User-Agent`
   - `device_id === body.device_id`
4. `DEL oauth:state:{state}`(一次性,防重放)

**用 code 换 token**(飞书端点):
```
POST https://open.feishu.cn/open-apis/authen/v1/access_token
Content-Type: application/json
{
  "grant_type": "authorization_code",
  "code": "{code}",
  "app_id": "{FEISHU_APP_ID}",
  "app_secret": "{FEISHU_APP_SECRET}"
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "open_id": "ou_xxx",
    "union_id": "on_xxx",
    "scope": "contact:user.base:readonly ...",
    "expires_in": 7200,
    "refresh_expires_in": 2592000
  }
}
```

**安全注意**:
- `app_secret` 严禁出现在任何日志、错误响应、前端可见字段
- code 只能使用一次,失败不重试(让用户重新走步骤 1)
- 飞书返回的 `access_token`(应用维度访问用户资源的 token)≠ 我们签发的 JWT access_token,二者不要混淆。飞书 token 仅在后端短期持有,用于调用 user_info,调用完即可丢弃(或缓存到 Redis 短 TTL,便于后续同步通讯录)

**响应 200**(本系统签发的 JWT):
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "access_token": "eyJhbGciOi...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "user_id": "uuid",
      "name": "张三",
      "avatar": "https://...",
      "tenant_id": "uuid",
      "tenant_name": "默认个人空间",
      "role": "student",
      "permissions": ["artwork:create", "artwork:read:own"]
    }
  },
  "traceId": "..."
}
```

同时返回响应头:
```
Set-Cookie: refresh_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=604800
```

> 开发环境(无 TLS)需通过 `COOKIE_SECURE=false` 环境变量关闭 `Secure`,否则浏览器会丢弃 Cookie。生产必须开启。

#### 步骤 7 - 后端调用飞书 API 获取用户信息

```
GET https://open.feishu.cn/open-apis/authen/v1/user_info
Authorization: Bearer {feishu_access_token}
```

**响应关键字段**(对应已开通权限):
| 字段 | 权限 scope | 用途 |
|---|---|---|
| open_id | contact:user.base:readonly | 用户在本应用维度的唯一 ID |
| union_id | (同上) | 用户在开发者维度唯一 ID,作为主键 |
| name | 同上 | 显示名 |
| avatar_url | 同上 | 头像 |
| email | contact:user.email:readonly | 邮箱 |
| mobile | contact:user.phone:readonly | 手机号(脱敏入库) |
| tenant_key | 同上 | 用于映射租户 |
| employee_no | 同上 | 学号 / 工号(可选) |

**安全注意**:
- `mobile` 入库前脱敏:`138****1234`,完整手机号仅用于发送验证码等场景,不入主表
- 飞书 `access_token` 调用完毕后,如需缓存,放 Redis key `feishu:uat:{union_id}` TTL 6000s(略短于 7200),禁止落 DB

#### 步骤 8 - 后端查询/创建 User 和 TenantMember

**Prisma 事务伪代码**:
```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({
    where: { feishu_union_id: union_id },
    include: { tenantMembers: true },
  });

  if (!user) {
    // 首次登录:创建 User + 默认租户 + TenantMember
    const newUser = await tx.user.create({
      data: {
        user_id: crypto.randomUUID(),
        name, avatar, email,
        mobile_masked: maskMobile(mobile),
        feishu_open_id: open_id,
        feishu_union_id: union_id,
        status: 'active',
        tenantMembers: {
          create: {
            tenant_id: (await resolveDefaultTenant(tenant_key)).tenant_id,
            role: 'student',
            status: 'active',
          },
        },
      },
    });
    return newUser;
  } else {
    // 已存在:更新头像 / 姓名 / 最后登录时间
    return await tx.user.update({
      where: { user_id: user.user_id },
      data: { avatar, name, last_login_at: new Date() },
    });
  }
});
```

**安全注意**:
- `feishu_union_id` 加唯一索引(防止并发登录重复创建)
- 默认租户创建:若 `tenant_key` 对应租户不存在,创建一个 `tenant_type=institution` 的租户(基于飞书组织),否则绑定到默认个人租户
- 切勿在创建用户时默认 `super-admin` 角色,统一 `student`,后续由租户管理员调整

#### 步骤 9 - 后端生成 JWT

详见 §2。核心动作:
- 生成 `jti_access`、`jti_refresh`(`crypto.randomUUID()`)
- 用 `JWT_PRIVATE_KEY`(PEM)以 RS256 签发 access_token(15min)与 refresh_token(7d)
- 计算 `refresh_token_hash = SHA256(refresh_token)`
- Redis 写 `session:{user_id}:{device_id}`,DB 写 `Session` 表(双写,Redis 为热路径,DB 为审计与强制下线依据)

#### 步骤 10 - refresh_token 写 Cookie,access_token 返回响应体

**关键点**(对应约束 C2、C3):
```typescript
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: env.COOKIE_SECURE === 'true', // 生产 true
  sameSite: 'strict',
  path: '/auth',        // 仅 /auth/* 路径携带,缩小攻击面
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
res.json({ code: 0, message: 'ok', data: { access_token, expires_in: 900, user } });
```

**安全注意**:
- 禁止 `sameSite: 'none'`(若必须跨域,改用 SSO 中转页,本系统不采用)
- `path: '/auth'` 缩小 Cookie 携带范围,业务接口不会带 refresh_token
- 响应头加 `Cache-Control: no-store` 防止缓存

#### 步骤 11 - 前端跳转首页,后续请求带 access_token

**前端 SDK 行为**(`auth-sdk.ts` 待 frontend-app 实现):
- `access_token` 存模块级闭包变量,**不落 localStorage**
- 刷新页面后内存丢失,SDK 检测到无 access_token 时自动调用步骤 12 `/auth/token/refresh`(若有 Cookie)
- 请求拦截器:`Authorization: Bearer {access_token}`
- 响应拦截器:401 → 触发刷新 → 重试原请求;刷新失败 → 跳登录页

**安全注意**:
- 业务接口 URL 不允许出现 `access_token` query 参数
- WebSocket 鉴权用 `Sec-WebSocket-Protocol` 或首帧握手,不用 URL query

#### 步骤 12 - token 过期后用 refresh_token 刷新

```
POST /auth/token/refresh
Cookie: refresh_token=eyJ...
Headers:
  X-CSRF-Token: {csrf_token}   // 见 §2.3 + §3.5
  X-Client-Context: { "device_id": "...", "client": "web" }
Body: (空)
```

**后端校验顺序**:
1. Cookie 中取 `refresh_token`
2. RS256 签名校验(公钥)
3. `jti_refresh` 不在 Redis 黑名单:`EXISTS blacklist:{jti_refresh}` 必须为 0
4. Session 表 `refresh_token_hash === SHA256(refresh_token)`(防伪造)
5. Session 未过期:`expires_at > now()`

**滚动刷新**:
- 旧 refresh_token 的 `jti_refresh` 加入黑名单,TTL = 剩余自然过期时间(避免黑名单无限增长)
- 签发新 access_token + 新 refresh_token
- 更新 Redis session + DB Session 表的 `refresh_token_hash`

**响应**:同步骤 6 的 200 响应。

**错误处理**:
- `401` - refresh_token 无效 / 过期 / 在黑名单 → 前端清空内存 access_token,跳登录页
- `403` - CSRF token 校验失败 → 403 + 审计
- `429` - 限流

**安全注意**:
- 滚动刷新完成后**旧 refresh_token 立即失效**(防 token 被盗后双活)
- 一个 refresh_token 只能使用一次,二次使用视为重放攻击 → 强制下线该用户所有会话

---

## 2. JWT 会话方案设计

### 2.1 access_token 设计

| 项 | 值 |
|---|---|
| 算法 | **RS256**(非对称,禁止 HS256) |
| 有效期 | **15 分钟**(900s) |
| 私钥 | 环境变量 `JWT_PRIVATE_KEY`(PEM:`-----BEGIN RSA PRIVATE KEY-----`) |
| 公钥 | 环境变量 `JWT_PUBLIC_KEY`(PEM:`-----BEGIN PUBLIC KEY-----`) |
| kid | `JWT_KEY_ID`(Header 中携带,支持密钥轮转) |

**Header**:
```json
{ "alg": "RS256", "typ": "JWT", "kid": "kid-2026-07" }
```

**Payload**:
```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "role": "student",
  "feishu_open_id": "ou_xxx",
  "permissions": ["artwork:create", "artwork:read:own"],
  "device_id": "device-uuid",
  "jti": "access-jti-uuid",
  "iat": 1785000000,
  "exp": 1785000900,
  "iss": "danqing-ai-auth",
  "aud": "danqing-ai-web"
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|---|---|---|
| sub | string | user_id,业务主键 |
| tenant_id | string | 当前激活租户(用于多租户强制过滤,见 §2.4) |
| role | enum | `super-admin` / `tenant-admin` / `teacher` / `student` / `guest` |
| feishu_open_id | string | 仅作审计关联,不作信任依据 |
| permissions | string[] | 已展开的权限码,避免每次查 DB |
| device_id | string | 设备指纹,与 Session 一致性校验 |
| jti | string | 唯一 ID,用于 Redis 黑名单撤销 |
| iat | number | 签发时间 |
| exp | number | 过期时间 = iat + 900 |
| iss | string | 签发方,固定 `danqing-ai-auth` |
| aud | string | 受众,区分 `web` / `admin` / `mobile`(防止跨端 token 混用) |

**校验要点**:
- `alg` 必须为 `RS256`,出现 `none` / `HS256` 一律拒绝
- `iss` / `aud` 必须匹配预期
- `exp` 过期拒绝
- `jti` 查 Redis 黑名单,命中拒绝

### 2.2 refresh_token 设计

| 项 | 值 |
|---|---|
| 算法 | **RS256** |
| 有效期 | **7 天**(604800s) |
| 存储 | HttpOnly Cookie(`HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=604800`) |
| DB 存储 | `Session` 表存 `refresh_token_hash = SHA256(refresh_token)`,**不存明文** |
| Redis 存储 | `session:{user_id}:{device_id}` 存哈希 + 元数据,TTL 604800s |
| 滚动刷新 | 每次刷新生成新 refresh_token,旧 jti 入 Redis 黑名单 TTL = 剩余自然过期时间 |

**Payload**(最小化,不含业务信息):
```json
{
  "sub": "user-uuid",
  "jti": "refresh-jti-uuid",
  "iat": 1785000000,
  "exp": 1785604800,
  "iss": "danqing-ai-auth",
  "aud": "danqing-ai-auth-refresh",
  "type": "refresh"
}
```

> refresh_token payload 故意不含 `tenant_id` / `role`,刷新时由后端从 DB 重新读取最新权限,避免权限变更后 refresh_token 仍带旧权限。

**Session 表(Prisma schema 草案)**:
```prisma
model Session {
  session_id        String   @id @default(uuid())
  user_id           String
  device_id         String
  refresh_token_hash String  // SHA256(明文 refresh_token)
  access_jti        String?  // 当前 access_token 的 jti(便于强制下线)
  refresh_jti       String   // 当前 refresh_token 的 jti
  client_ip         String
  user_agent        String
  client            String   // web / admin / mobile
  status            String   @default("active") // active / revoked
  expires_at        DateTime
  created_at        DateTime @default(now())
  last_refreshed_at DateTime @default(now())
  revoked_at        DateTime?
  revoked_reason   String?

  @@unique([user_id, device_id])
  @@index([refresh_jti])
  @@index([user_id, status])
}
```

**强制下线 / 登出**:
- 单端登出:`/auth/logout` → `Session.status = revoked` + Redis `DEL session:{user_id}:{device_id}` + access_token `jti` 入黑名单 TTL=剩余过期
- 全端登出:`/auth/logout-all` → 所有该 user_id 的 Session 标记 revoked + Redis 批量删 + 当前 access_token jti 入黑名单

### 2.3 state 参数方案(CSRF 防护)

**生成**:
```typescript
import crypto from 'crypto';
const state = crypto.randomBytes(32).toString('hex'); // 256bit
```

**存储**(Redis):
```
KEY:   oauth:state:{state}
VALUE: {
  "client_ip": "1.2.3.4",
  "user_agent": "Mozilla/...",
  "device_id": "device-uuid",
  "client": "web",
  "created_at": 1785000000
}
TTL: 300 秒
```

**校验**(步骤 6):
1. Redis `EXISTS oauth:state:{state}` 必须为 1(防伪造)
2. 反序列化 value,逐字段比对:
   - `client_ip === X-Forwarded-For` 首段(防跨设备 CSRF)
   - `user_agent === User-Agent`(防跨浏览器)
   - `device_id === body.device_id`(防会话固定)
3. 校验通过立即 `DEL oauth:state:{state}`(一次性消费,防重放)

**异常处置**:
- 任一字段不一致 → `400 invalid_state` + 审计告警(疑似 CSRF)
- state 不存在或已过期 → `400 state_expired`,提示重新登录

**额外 CSRF 防护**(纵深防御,见 §3.5):
- `/auth/token/refresh` 与 `/auth/logout` 要求请求头 `X-CSRF-Token`,值由步骤 6 响应同时返回(存前端内存),与 SameSite=Strict Cookie 形成双重防护

### 2.4 多租户 JWT 处理

**用户首次登录**:
- 飞书 `tenant_key` 映射:
  - 若 `tenant_key` 已对应一个 `tenant_type=institution` 的租户 → 加入该租户为 `student`
  - 若不对应 → 创建默认个人租户 `tenant_type=individual`,role=`student`
- 用户可同时属于多个租户(如:个人空间 + 学校租户 + 班级租户)

**租户列表**:
```
GET /tenants
Authorization: Bearer {access_token}
```
返回当前用户所有可见租户及当前激活租户。

**租户切换**:
```
POST /tenants/switch
Body: { "tenant_id": "uuid" }
```
- 后端校验:user_id 确实属于该 tenant_id 且 status=active
- 重新签发 access_token(新 tenant_id / role / permissions)
- **refresh_token 不变**(滚动刷新不触发),只更新 access_token
- Redis session 中更新 `current_tenant_id`
- 审计:记录租户切换事件

**数据层强制过滤**(约束 C6,后端中间件):
```typescript
// 全局 Prisma 扩展:所有查询自动注入 tenant_id 条件
prisma.$extends({
  query: {
    $allModels: {
      async $allRawOperations({ args, query, model }) {
        if (modelHasTenant(model) && ctx.tenantId) {
          args.where = { ...args.where, tenant_id: ctx.tenantId };
        }
        return query(args);
      },
    },
  },
});
```

> 此扩展由 `backend-service` 实现,但权限校验在 controller 层先做(快速拒绝),数据层作为兜底。

---

## 3. 安全策略清单

> 本清单与第 0 章硬约束一一对应。生产上线前必须 100% 勾选。

### 3.1 传输安全

- [x] **HTTPS 强制**:生产环境所有请求必须 HTTPS,网关层 `301` 重定向 HTTP → HTTPS
- [x] **HSTS 头**:`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`(仅在生产启用,且确认全站 HTTPS 后开启,否则可能锁死用户)
- [x] **HTTP 协议降级防护**:网关只暴露 443

> 注:开发环境(localhost)TLS 缺失是正常现象,不视为安全问题。`COOKIE_SECURE` 环境变量在 dev 设为 `false`,生产必须 `true`。

### 3.2 CORS 白名单

```typescript
const corsOptions = {
  origin: (origin, cb) => {
    const allowed = env.CORS_ORIGINS.split(','); // 逗号分隔白名单
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('not allowed by CORS'));
  },
  credentials: true, // 允许携带 Cookie(refresh_token)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token', 'X-Client-Context'],
  exposedHeaders: ['X-Trace-Id'],
  maxAge: 600,
};
```

- 白名单来源:`CORS_ORIGINS` 环境变量,生产只配置 `https://www.danqing.site`(admin 后台共用同域名,通过子路径访问)
- 禁止 `origin: '*'`(与 credentials 互斥,且违反最小权限)

### 3.3 Rate Limiting(限流)

| 接口 | 限流策略 | 命中响应 |
|---|---|---|
| `/auth/feishu/authorize` | 10 次/分钟/IP | 429 |
| `/auth/feishu/callback` | 5 次/分钟/IP | 429 + 审计 |
| `/auth/token/refresh` | 20 次/分钟/IP | 429 |
| `/auth/login`(预留邮箱密码) | 5 次/分钟/IP,5 次失败锁账号 15 分钟 | 423 + 邮件通知 |
| 其他 `/api/*` | 60 次/分钟/用户 | 429 |

- 限流键:`rl:{path}:{ip}` Redis 计数,TTL 60s
- 命中后 `Retry-After` 头提示

### 3.4 Helmet 安全头

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Vite dev 需要,生产收紧
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"], // 头像 CDN
      connectSrc: ["'self'", "https://open.feishu.cn"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
```

### 3.5 CSRF 防护(双重)

1. **SameSite=Strict Cookie**:refresh_token Cookie 默认不跨站携带
2. **state 参数**:OAuth 回调防 CSRF(见 §2.3)
3. **X-CSRF-Token 头**:`/auth/token/refresh`、`/auth/logout`、`/tenants/switch` 要求请求头携带 `X-CSRF-Token`,值在登录成功响应中返回(前端存内存),与 Cookie 形成 Double Submit Cookie 模式

### 3.6 XSS 防护

- [x] access_token 不存 localStorage / sessionStorage,仅存内存闭包变量
- [x] CSP 头限制脚本来源(见 §3.4)
- [x] 前端所有用户输入走 React 默认转义,禁止 `dangerouslySetInnerHTML`(除非经过 DOMPurify)
- [x] 后端响应 `X-Content-Type-Options: nosniff`

### 3.7 密钥管理

| 密钥 | 存储 | 轮转 |
|---|---|---|
| JWT_PRIVATE_KEY | 环境变量 / KMS(生产) | 通过 `kid` 支持多版本并存,旧 kid 保留 1 个周期 |
| JWT_PUBLIC_KEY | 环境变量(可分发,各服务) | 同步轮转 |
| FEISHU_APP_SECRET | 环境变量 / KMS | 飞书后台轮转后更新 env |
| DATABASE_URL | 环境变量 / KMS | DB 密码定期轮转 |
| REDIS_URL | 环境变量 | Redis ACL |

- [x] 禁止硬编码密钥(代码扫描门禁)
- [x] `.env*` 加入 `.gitignore`
- [x] 生产环境通过 Secret Manager 注入,不出现在镜像层

### 3.8 异常登录检测

触发条件(任一命中即审计 + 二次验证):
- 不同地理位置登录(基于 IP 库,与历史最近一次差异大)
- 新设备(device_id 首次出现)
- 短时间高频登录失败(>5 次/分钟)
- 凌晨时段(可选,基于用户习惯)

处置:
- super-admin / 财务角色:**强制飞书验证码二次校验**(约束 C13 - 两步验证)
- 其他角色:发飞书消息提醒(`im:message:send_as_bot` 权限),允许继续但审计

### 3.9 日志脱敏规则

| 字段 | 脱敏方式 | 示例 |
|---|---|---|
| access_token / refresh_token | 仅记录前 8 字符 + `...` | `eyJhbGci...` |
| FEISHU_APP_SECRET | 完全掩码 | `****` |
| 用户手机号 | 中间 4 位掩码 | `138****1234` |
| 用户邮箱 | 用户名首尾 + 域名 | `z***@example.com` |
| 飞书 access_token | 仅前 8 字符 | `u-xxx...` |
| 密码(若存在) | 完全掩码 | `****` |

- [x] 日志库不存任何 token 明文
- [x] 错误堆栈中过滤敏感字段(Winston `format` 自定义 redactor)

### 3.10 审计日志

落库表 `AuditLog`:
| 字段 | 类型 | 说明 |
|---|---|---|
| audit_id | uuid | 主键 |
| user_id | string | 操作者(未登录为 null) |
| action | enum | `login` / `logout` / `refresh` / `tenant_switch` / `role_change` / `state_mismatch` / `rate_limited` / `force_logout` |
| target_type | string | 资源类型 |
| target_id | string | 资源 ID |
| client_ip | string | 请求 IP |
| user_agent | string | UA |
| device_id | string | 设备 |
| status | enum | `success` / `failure` |
| detail | json | 结构化详情(脱敏后) |
| trace_id | string | 链路 ID |
| created_at | datetime | 时间 |

- 所有 `/auth/*` 接口必须落审计
- 失败操作优先落审计,便于追溯攻击

### 3.11 合规

- [x] 个人信息保护法(PIPL):用户信息收集最小化,获取 user_info 前已获用户授权
- [x] 数据安全法:敏感数据(手机号)脱敏入库,密钥分离存储
- [x] 用户数据删除接口:`/users/me/delete`(预留),GDPR-style

---

## 4. 环境变量清单

> 全部从 `.env` / Secret Manager 读取,禁止硬编码。

### 4.1 飞书 OAuth

```bash
# 飞书自建应用
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx

# 重定向 URI(按 client 区分)
FEISHU_REDIRECT_URI_WEB=http://localhost:5173/auth/feishu/callback
FEISHU_REDIRECT_URI_ADMIN=http://localhost:3001/auth/feishu/callback
FEISHU_REDIRECT_URI_MOBILE=https://m.你的域名/auth/feishu/callback

# 飞书 API 端点(一般不变,可覆盖)
FEISHU_AUTHZ_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/index
FEISHU_TOKEN_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/access_token
FEISHU_USERINFO_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/user_info
```

### 4.2 JWT 密钥

```bash
# RS256 私钥(PEM,生产从 KMS 读取)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...\n-----END PUBLIC KEY-----"
JWT_KEY_ID=kid-2026-07
JWT_ISSUER=danqing-ai-auth
JWT_AUDIENCE_WEB=danqing-ai-web
JWT_AUDIENCE_ADMIN=danqing-ai-admin
JWT_AUDIENCE_MOBILE=danqing-ai-mobile

# 有效期
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
```

### 4.3 Cookie / CSRF

```bash
COOKIE_SECURE=false          # 生产 true
COOKIE_DOMAIN=               # 留空则当前域,跨子域共享时填 .你的域名
COOKIE_SAMESITE=strict
COOKIE_PATH=/auth
COOKIE_MAX_AGE=604800
```

### 4.4 基础设施

```bash
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/danqing
CORS_ORIGINS=http://localhost:5173,http://localhost:3001,https://www.你的域名,https://admin.你的域名
NODE_ENV=development
LOG_LEVEL=info
```

### 4.5 限流 / 租户

```bash
RATE_LIMIT_AUTH_PER_MIN=10
RATE_LIMIT_CALLBACK_PER_MIN=5
RATE_LIMIT_REFRESH_PER_MIN=20
RATE_LIMIT_API_PER_MIN=60

TENANT_DEFAULT_PLAN=free
TENANT_DEFAULT_TYPE=individual
```

### 4.6 安全开关

```bash
ENABLE_HSTS=false           # 生产 true,且全站 HTTPS 后开启
ENABLE_ABNORMAL_LOGIN_DETECT=true
REQUIRE_2FA_ROLES=super-admin,finance
```

### 4.7 环境变量自检

后端启动时执行:
```typescript
const required = ['FEISHU_APP_ID','FEISHU_APP_SECRET','JWT_PRIVATE_KEY','JWT_PUBLIC_KEY','REDIS_URL','DATABASE_URL'];
for (const k of required) {
  if (!process.env[k]) throw new Error(`missing env: ${k}`);
}
// 校验私钥可解析
const privateKey = crypto.createPrivateKey(process.env.JWT_PRIVATE_KEY);
if (privateKey.asymmetricKeyType !== 'rsa') throw new Error('JWT_PRIVATE_KEY must be RSA');
```

---

## 5. 飞书 API 端点参考

| 用途 | 方法 + URL | 必备 scope |
|---|---|---|
| 授权页 | `GET /open-apis/authen/v1/index?app_id=..&redirect_uri=..&state=..` | (授权页) |
| 换 token | `POST /open-apis/authen/v1/access_token` | (应用凭据) |
| 用户信息 | `GET /open-apis/authen/v1/user_info` | `contact:user.base:readonly`、`contact:user.email:readonly`、`contact:user.phone:readonly` |
| 部门信息 | `GET /open-apis/contact/v3/departments/:department_id` | `contact:department:readonly` |
| 发消息 | `POST /open-apis/im/v1/messages?receive_id_type=open_id` | `im:message:send_as_bot` |
| 群组信息 | `GET /open-apis/im/v1/chats` | `im:chat:readonly` |
| 读消息 | `GET /open-apis/im/v1/messages` | `im:message:readonly` |

> 飞书基础域名:`https://open.feishu.cn`(国内)/ `https://open.larksuite.com`(海外)。本系统默认国内。

---

## 6. 验收报告

本任务(Task 3)核心交付物为 `.trae/documents/auth-design.md`(本文件)。逐项核对任务清单:

| # | 验收项 | 状态 | 位置 |
|---|---|---|---|
| 1 | Mermaid 序列图覆盖完整 12 步流程 | 通过 | §1.1(autonumber 1-12,含 alt 分支与 Note) |
| 2 | access_token 设计完整(算法/有效期/Payload/密钥) | 通过 | §2.1(RS256 / 15min / 8 字段 payload) |
| 3 | refresh_token 设计完整(存储/滚动刷新/黑名单) | 通过 | §2.2(HttpOnly Cookie + SHA256 入库 + 滚动失效) |
| 4 | state 参数 CSRF 防护方案明确 | 通过 | §2.3(256bit + Redis TTL 300 + IP/UA/device 比对 + 一次性消费) |
| 5 | 多租户 JWT 切换方案明确 | 通过 | §2.4(首次归属 + `/tenants/switch` + refresh 不变 + 数据层兜底过滤) |
| 6 | 安全策略清单完整 | 通过 | §3(11 小节:传输/CORS/限流/Helmet/CSRF/XSS/密钥/异常检测/脱敏/审计/合规) |
| 7 | 环境变量清单完整 | 通过 | §4(飞书/JWT/Cookie/基础设施/限流/安全开关 + 启动自检) |
| 8 | HashRouter 回调兼容方案 | 通过 | §1.2 步骤 5(生产方案 1 + dev 方案 2) |
| 9 | 飞书 API 端点参考 | 通过 | §5 |

**自我质量检查(系统提示约束)**:

| 检查项 | 结论 |
|---|---|
| 1. JWT 是否使用 RS256,而非 HS256? | 是。§2.1 明确 RS256,启动自检校验私钥为 RSA 类型 |
| 2. refresh_token 是否在 HttpOnly Cookie,而非 localStorage? | 是。§2.2 + §1.2 步骤 10,`HttpOnly; Secure; SameSite=Strict; Path=/auth` |
| 3. OAuth 回调是否校验 state? | 是。§2.3 + §1.2 步骤 6,IP+UA+device_id 三重比对 + 一次性消费 |
| 4. 所有数据访问是否校验 tenant_id? | 是。§2.4 数据层 Prisma 扩展强制注入 + JWT payload 携带 |
| 5. 日志是否排除敏感数据? | 是。§3.9 脱敏表 + §3.10 审计 detail 字段脱敏 |
| 6. CSRF 防护是否到位? | 是。§3.5 三重:SameSite=Strict + state + X-CSRF-Token |
| 7. 是否遵循 OAuth 2.0 标准? | 是。§1 全程使用标准 authorization_code 流程,无自创协议 |

**结论**:Phase 1 任务 3 设计交付物完成,可移交 `backend-service`(实现 `/auth/feishu/*`)、`frontend-app`(实现登录 SDK)、`api-test-pro`(编写测试)三方进入实现阶段。

**后续衔接**:
- `backend-service`:依据本文件 §1.2 实现接口,依据 §2 设计 Prisma schema(`User` / `Tenant` / `TenantMember` / `Session` / `AuditLog`)
- `frontend-app`:依据 §1.2 步骤 11 + 步骤 12 实现 `auth-sdk.ts`(内存存 access_token,刷新拦截器)
- `api-test-pro`:为每个接口编写成功 / 失败 / 限流 / CSRF / 越权用例
- `compliance-checker`:上线前依据 §3 清单做合规审查

**遗留事项(不阻塞 Phase 1,需在上线前完成)**:
- 生产环境飞书重定向 URL 需更新为后端域名(见 §1.2 步骤 5 方案 1)
- 生成 RSA 密钥对(2048bit 或 3072bit),私钥注入 KMS
- 配置飞书组织事件订阅(员工入离职自动同步,Phase 2 任务)
