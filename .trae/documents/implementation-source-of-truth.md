# 丹青有AI · 实施真源文档（Source of Truth）

> **版本**：v1.0.0
> **生成时间**：2026-08-06
> **文档状态**：已对齐代码库实际状态
> **维护人**：backend-service / DevOps
> **项目仓库**：`Xyangshaun/danqing-ai`
> **生产域名**：`www.danqing.site` / `www.danqing-ai.com`

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构设计](#2-系统架构设计)
3. [技术栈清单](#3-技术栈清单)
4. [目录结构](#4-目录结构)
5. [环境变量配置](#5-环境变量配置)
6. [API接口规范](#6-api接口规范)
7. [数据模型](#7-数据模型)
8. [认证授权体系](#8-认证授权体系)
9. [AI分析服务架构](#9-ai分析服务架构)
10. [数据流向](#10-数据流向)
11. [部署流程](#11-部署流程)
12. [版本控制](#12-版本控制)
13. [监控与运维](#13-监控与运维)
14. [已知约束与待优化项](#14-已知约束与待优化项)
15. [版本历史](#15-版本历史)

---

## 1. 项目概述

### 1.1 产品定位

丹青有AI 是一款面向高校艺术教育的 AI 作业诊断平台，支持四种创意形式的作品分析：

| 创意形式 | 英文标识 | 说明 |
|---------|---------|------|
| 绘画 | `painting` | 构图、色彩、笔触三维度分析 |
| 设计 | `design` | 视觉层次、排版、色彩应用三维度分析 |
| 产品设计 | `product` | 形态、材质表现、功能表达三维度分析 |
| 雕塑 | `sculpture` | 空间构图、形体语言、材质语言三维度分析 |

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| AI 视觉诊断 | Jimp 像素分析 + AI 视觉分析混合模式，3 秒 SLA |
| 多租户隔离 | 学校→学院→班级→个人层级租户，所有业务表强制 `tenant_id` |
| RBAC 权限 | admin/owner/teacher/student 四角色细粒度权限矩阵 |
| 飞书 OAuth | 飞书授权码模式登录，JWT + Redis 会话管理 |
| 成长曲线 | 个人/租户维度评分趋势可视化 |
| 订阅计费 | free/standard/enterprise 三档套餐，月度配额管理 |
| 评分预设 | 内置 seed + 用户 fork 派生 + 加权重算 |
| 多评委仲裁 | 教授/讲师/AI 三方评分，争议自动触发加权裁定 |
| 通知系统 | 分析完成/失败、评审、订阅、邀请等事件通知 |

### 1.3 多端形态

| 端 | 目录 | 技术栈 | 部署形式 |
|----|------|--------|---------|
| Web 应用 | `src/` | React 18 + Vite 5 | 静态文件（Nginx） |
| 管理后台 | `admin/` | Ant Design Pro | 静态文件（Nginx + IP 白名单） |
| 移动端 | `mobile/` | React Native | 待补充 |
| 品牌官网 | `website/` | Next.js 14（静态导出） | 静态文件（Nginx / GitHub Pages） |
| 后端服务 | `server/` | Express 4 + TypeScript | Node.js 20 LTS（PM2 托管） |

---

## 2. 系统架构设计

### 2.1 整体架构

```
                        ┌──────────────────────────────┐
                        │         互联网用户            │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                ┌──────────────────────────────────────────┐
                │            CDN / DDoS 防护               │
                │   (Cloudflare / 阿里云盾 / 腾讯云 TCB)   │
                └──────────────────────┬───────────────────┘
                                       │ 443/HTTPS
                                       ▼
                ┌──────────────────────────────────────────┐
                │              Nginx 反向代理              │
                │   (单机多 server,SSL 终止 + gzip + 限流) │
                └──────┬──────────┬──────────┬─────────────┘
                       │          │          │
            www.danqing-ai.com    │          │
                       │          │          │
                       ▼          │          │
              ┌──────────────┐    │          │
              │  website/    │    │          │
              │ (Next.js)    │    │          │
              └──────────────┘    │          │
                                  │          │
            app.danqing-ai.com    │          │
                       │          │          │
                       ▼          │          │
              ┌──────────────┐    │          │
              │   src/       │    │          │
              │ (Vite+React) │    │          │
              └──────────────┘    │          │
                                  │          │
           admin.danqing-ai.com   │          │
                                  │          ▼
                                  │   ┌──────────────────┐
                                  │   │   admin/         │
                                  │   │ (Ant Design Pro) │
                                  │   │ +IP 白名单       │
                                  │   └──────────────────┘
                                  │
              api.danqing-ai.com  │
                       │          │
                       ▼          ▼
              ┌─────────────────────────────┐
              │   server/ (Node.js + PM2)   │
              │   端口:127.0.0.1:3000       │
              │   /api/v1/*   业务接口      │
              │   /api/admin/* 管理接口     │
              │   /health     健康检查      │
              └──────┬──────────────┬───────┘
                     │              │
                     ▼              ▼
            ┌──────────────┐  ┌──────────────┐
            │ PostgreSQL   │  │   Redis      │
            │  15          │  │   7          │
            │  数据持久化  │  │  会话/限流   │
            │  WAL 归档    │  │  AOF+RDB     │
            └──────────────┘  └──────────────┘
```

### 2.2 后端分层架构

后端采用经典的 Controller → Service → Repository 三层分层架构：

| 层级 | 职责 | 示例文件 |
|------|------|---------|
| Routes（路由层） | 路由定义、中间件编排、参数提取 | `server/src/routes/*.routes.ts` |
| Controller（控制器层） | 请求/响应转换、Zod 校验、错误处理 | `server/src/controllers/*.controller.ts` |
| Service（业务层） | 核心业务逻辑、事务编排、跨服务调用 | `server/src/services/*.service.ts` |
| Repository（数据层） | Prisma 数据访问、多租户过滤 | `server/src/repositories/*.repository.ts` |

### 2.3 中间件链路

Express 应用中间件注册顺序（`server/src/app.ts`）：

```
helmet（安全头）
  → cors（白名单校验，禁止 *）
    → traceMiddleware（traceId UUID 注入，在 body parser 之前）
      → express.json（1MB 上限）
        → express.urlencoded（1MB 上限）
          → cookieParser（refresh_token HttpOnly）
            → clientIdentification（多端适配：web/admin/mobile/marketing）
              → responseOptimizer（按客户端类型优化响应）
                → 业务路由（/api/v1/*）
                  → 管理路由（/api/admin/*）
                    → notFoundHandler（404 兜底）
                      → errorHandler（统一错误处理，4 参数）
```

### 2.4 健康检查

- 路径：`GET /health` 与 `GET /api/v1/health`
- 返回轻量结构（不查 DB/Redis，避免雪崩）
- 仅返回 `{ status: 'up', timestamp }`，不暴露 service/version/nodeEnv（G8 安全修复）

### 2.5 关键设计决策

| 决策 | 原因 |
|------|------|
| app.ts 不启动 HTTP server | 由 `index.ts` 负责，便于 Vitest supertest 直接 import app 做集成测试 |
| 信任第一跳代理 | `app.set('trust proxy', 1)`，生产部署在 Nginx 后需启用以正确获取客户端 IP |
| 关闭 x-powered-by | 避免暴露技术栈 |
| traceMiddleware 在 body parser 之前 | body parser 解析失败时需先有 traceId 才能返回带 UUID 的错误响应 |

---

## 3. 技术栈清单

### 3.1 前端（Web 应用 `src/`）

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | ^18.2.0 | UI 框架 |
| react-dom | ^18.2.0 | React DOM 渲染 |
| react-router-dom | ^6.22.0 | 客户端路由 |
| recharts | ^2.10.0 | 图表库（成长曲线等） |
| lucide-react | ^0.314.0 | 图标库 |
| vite | ^5.1.0 | 构建工具 |
| typescript | ^5.3.3 | 类型安全 |
| tailwindcss | ^3.4.1 | 原子化 CSS |
| vitest | ^1.6.1 | 单元测试 |
| @testing-library/react | ^14.3.1 | React 测试工具 |

### 3.2 后端（`server/`）

| 依赖 | 版本 | 用途 |
|------|------|------|
| express | ^4.21.2 | Web 框架 |
| @prisma/client | ^5.22.0 | ORM |
| prisma | ^5.22.0 | 数据库迁移与 schema 管理 |
| ioredis | ^5.4.2 | Redis 客户端（会话/限流/缓存） |
| jimp | ^0.22.12 | 像素级图像分析（Jimp 引擎） |
| axios | ^1.7.9 | HTTP 客户端（AI API 调用） |
| jsonwebtoken | ^9.0.2 | JWT 签发与验证（RS256） |
| zod | ^3.24.1 | Schema 校验 |
| multer | ^1.4.5-lts.1 | 文件上传（磁盘存储） |
| helmet | ^8.0.0 | 安全响应头 |
| cors | ^2.8.5 | 跨域控制 |
| cookie-parser | ^1.4.7 | Cookie 解析 |
| express-rate-limit | ^7.5.0 | 限流 |
| bcrypt | ^5.1.1 | 密码哈希 |
| uuid | ^11.0.4 | UUID 生成 |
| winston | ^3.17.0 | 日志 |
| typescript | ^5.7.2 | 类型安全 |
| vitest | ^2.1.8 | 单元/集成测试 |
| supertest | ^7.0.0 | HTTP 集成测试 |
| tsx | ^4.19.2 | 开发模式 TS 执行 |

### 3.3 基础设施

| 组件 | 版本 | 用途 |
|------|------|------|
| Node.js | 20 LTS | 运行时（通过官方 tarball 安装，禁止 curl\|bash） |
| PostgreSQL | 15 | 主数据库（强制，禁止 SQLite） |
| Redis | 7 | 会话/缓存/限流（AOF+RDB 持久化） |
| Nginx | 1.18+ | 反向代理 + SSL 终止 + 静态托管 |
| PM2 | latest | 进程管理（fork 模式，单实例） |
| Docker | - | PostgreSQL + Redis 容器化（1Panel 管理） |
| 1Panel | - | 服务器管理面板 |

### 3.4 品牌官网（`website/`）

| 依赖 | 版本 | 用途 |
|------|------|------|
| next | 14.2.5 | App Router 静态导出 |
| tailwindcss | 3.4.7 | 样式 |
| framer-motion | 11.3.19 | 动画 |
| next-mdx-remote | 5.0.0 | MDX 博客渲染 |

---

## 4. 目录结构

### 4.1 项目根目录

```
danqing-ai/
├── src/                    # Web 应用（React + Vite）
├── admin/                  # 管理后台（Ant Design Pro）
├── mobile/                 # 移动端（React Native）
├── website/                # 品牌官网（Next.js 14 静态导出）
│   ├── app/                # Next.js App Router 页面
│   ├── components/         # UI 组件
│   ├── content/blog/       # MDX 博客内容
│   └── lib/                # 工具函数（含 site.ts CTA_LINKS 配置）
├── server/                 # 后端服务（Express + TypeScript）
├── deploy/                 # 部署配置（nginx.conf 等）
├── .trae/documents/        # 项目文档
├── package.json            # 前端依赖
├── ecosystem.config.cjs    # PM2 配置
├── DEPLOYMENT.md           # 部署文档
└── .env.example            # 前端环境变量模板
```

### 4.2 后端目录结构

```
server/
├── src/
│   ├── config/             # 配置
│   │   ├── env.ts          # 环境变量加载与启动自检
│   │   └── permissions.ts  # RBAC 权限矩阵
│   ├── routes/             # 路由层（16 个路由文件）
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── tenant.routes.ts
│   │   ├── analysis.routes.ts
│   │   ├── artwork.routes.ts
│   │   ├── growth.routes.ts
│   │   ├── subscription.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── preset.routes.ts
│   │   ├── review.routes.ts
│   │   ├── dispute.routes.ts
│   │   ├── notification.routes.ts
│   │   ├── knowledge.routes.ts      # Phase 5 预留（501）
│   │   ├── modules.routes.ts        # Phase 5 预留（501）
│   │   ├── ui-config.routes.ts      # Phase 5 预留（501）
│   │   └── config.routes.ts         # Phase 5 预留（501）
│   ├── controllers/        # 控制器层
│   ├── services/           # 业务服务层
│   │   ├── analysis.service.ts          # 分析业务编排
│   │   ├── ai-analysis.service.ts       # AI 混合分析
│   │   ├── analysis-engine.service.ts   # Jimp 分析引擎
│   │   ├── template-suggestions.service.ts # 模板降级建议（55 规则）
│   │   ├── analysis-cache.service.ts    # Redis 缓存
│   │   ├── feishu.service.ts            # 飞书 OAuth
│   │   └── ...
│   ├── repositories/       # 数据访问层
│   ├── middlewares/        # 中间件
│   │   ├── auth.ts         # JWT 认证
│   │   ├── tenant.ts       # 多租户校验
│   │   ├── trace.ts        # traceId 注入
│   │   ├── error-handler.ts # 统一错误处理
│   │   ├── client-adapt.ts # 多端适配
│   │   └── ...
│   ├── types/              # 类型定义
│   │   ├── api-contract.ts # API 契约主副本（跨端共享）
│   │   └── arbitration.ts  # 仲裁枚举类型
│   ├── utils/              # 工具函数
│   │   ├── response.ts     # 统一响应封装
│   │   └── logger.ts       # Winston 日志
│   ├── app.ts              # Express 应用工厂
│   └── index.ts            # HTTP server 启动入口
├── prisma/
│   ├── schema.prisma       # 数据模型（18 个模型）
│   ├── seed.ts             # 种子数据
│   └── migrations/         # 迁移文件
├── uploads/                # 上传文件目录（multer 磁盘存储）
├── package.json
├── tsconfig.json
└── .env.production         # 生产环境变量模板
```

---

## 5. 环境变量配置

### 5.1 环境变量校验机制

环境变量由 `server/src/config/env.ts` 的 `loadEnv()` 在启动时强制校验：

- **必填项缺失**：`assertRequired()` 抛错，进程 `process.exit(1)` 拒绝启动
- **JWT 密钥校验**：`assertRsaPrivateKey()` / `assertRsaPublicKey()` 校验为 RSA 类型
- **CORS 禁止 `*`**：`CORS_ORIGINS` 必须包含至少一个 origin，且不能包含 `*`
- **生产环境强制 COOKIE_SECURE=true**：防止 refresh_token 在 HTTP 下传输
- **开发模式宽松**：`NODE_ENV=development` 时飞书配置/JWT 密钥可缺失，自动填充占位值或生成临时 RSA 密钥对

### 5.2 后端环境变量清单

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `NODE_ENV` | 否 | `development` | 运行环境 |
| `PORT` | 否 | `3000` | 服务端口 |
| `LOG_LEVEL` | 否 | `info` | 日志级别 |
| `ENABLE_HSTS` | 否 | `false` | HSTS 开关 |
| `FEISHU_APP_ID` | 生产必填 | - | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 生产必填 | - | 飞书应用密钥 |
| `FEISHU_REDIRECT_URI_WEB` | 必填 | - | Web 端飞书回调 |
| `FEISHU_REDIRECT_URI_ADMIN` | 否 | 同 WEB | 管理后台回调 |
| `FEISHU_REDIRECT_URI_MOBILE` | 否 | 同 WEB | 移动端回调 |
| `FEISHU_AUTHZ_ENDPOINT` | 否 | 飞书授权端点 | OAuth 授权页 |
| `FEISHU_TOKEN_ENDPOINT` | 否 | OIDC 端点 | Token 交换端点 |
| `FEISHU_USERINFO_ENDPOINT` | 否 | 用户信息端点 | 用户信息获取 |
| `JWT_PRIVATE_KEY` | 生产必填 | - | RSA 私钥（\n 转义，双引号包裹） |
| `JWT_PUBLIC_KEY` | 生产必填 | - | RSA 公钥 |
| `JWT_KEY_ID` | 生产必填 | - | 密钥 ID |
| `JWT_ISSUER` | 否 | `danqing-ai-auth` | 签发者 |
| `JWT_AUDIENCE_WEB` | 否 | `danqing-ai-web` | Web 受众 |
| `JWT_AUDIENCE_ADMIN` | 否 | `danqing-ai-admin` | Admin 受众 |
| `JWT_AUDIENCE_MOBILE` | 否 | `danqing-ai-mobile` | Mobile 受众 |
| `JWT_ACCESS_EXPIRES` | 否 | `15m` | access_token 过期 |
| `JWT_REFRESH_EXPIRES` | 否 | `7d` | refresh_token 过期 |
| `COOKIE_SECURE` | 生产必填 true | `false` | Cookie Secure 标志 |
| `COOKIE_DOMAIN` | 否 | `` | Cookie 域名 |
| `COOKIE_SAMESITE` | 否 | `strict` | SameSite 策略 |
| `COOKIE_PATH` | 否 | `/auth` | Cookie 路径（生产 `/api/v1/auth`） |
| `COOKIE_MAX_AGE` | 否 | `604800` | Cookie 最大年龄（秒） |
| `DATABASE_URL` | 必填 | - | PostgreSQL 连接串 |
| `REDIS_URL` | 必填 | - | Redis 连接串 |
| `CORS_ORIGINS` | 必填 | - | CORS 白名单（逗号分隔，禁止 *） |
| `RATE_LIMIT_AUTH_PER_MIN` | 否 | `10` | 认证限流 |
| `RATE_LIMIT_CALLBACK_PER_MIN` | 否 | `5` | 回调限流 |
| `RATE_LIMIT_REFRESH_PER_MIN` | 否 | `20` | 刷新限流 |
| `RATE_LIMIT_API_PER_MIN` | 否 | `60` | API 限流 |
| `TENANT_DEFAULT_PLAN` | 否 | `free` | 默认订阅计划 |
| `TENANT_DEFAULT_TYPE` | 否 | `individual` | 默认租户类型 |
| `UPLOAD_DIR` | 否 | `uploads` | 上传目录（生产 `/lhcos-data/uploads`） |
| `UPLOAD_MAX_SIZE` | 否 | `10485760` | 上传大小上限（10MB） |
| `AI_ENABLED` | 否 | `false` | AI 功能总开关 |
| `AI_PROVIDER` | 否 | `glm` | AI 提供商（glm/trae） |
| `AI_API_KEY` | 否 | `` | AI API Key（留空自动 fallback） |
| `AI_API_URL` | 否 | GLM 端点 | AI API URL（OpenAI 兼容） |
| `AI_API_TIMEOUT` | 否 | `2500` | AI 超时（硬性 2500ms 保障 3s SLA） |
| `AI_API_MODEL` | 否 | `glm-4v-flash` | AI 模型名 |
| `TRAE_API_KEY` | 否 | `` | TRAE API Key |
| `TRAE_API_URL` | 否 | `` | TRAE API URL |
| `TRAE_API_MODEL` | 否 | `` | TRAE 模型名 |
| `DEV_SKIP_AUTH` | 否 | `false` | 开发模式跳过认证（仅 dev 生效） |
| `SMS_PROVIDER` | 否 | `mock` | 短信服务商（mock/aliyun/tencent） |
| `PHONE_REGEX` | 否 | `^1[3-9]\d{9}$` | 手机号正则 |
| `COS_SECRET_ID` | 否 | - | 腾讯云 COS ID |
| `COS_SECRET_KEY` | 否 | - | 腾讯云 COS Key |
| `COS_BUCKET` | 否 | - | COS 桶名 |
| `COS_REGION` | 否 | - | COS 区域 |
| `COS_BASE_URL` | 否 | - | COS 基础 URL |

### 5.3 前端环境变量

| 变量名 | 说明 |
|--------|------|
| `VITE_API_BASE_URL` | 后端 API 基础路径（生产 `/api/v1`，相对路径） |
| `VITE_FEISHU_REDIRECT_URI` | 飞书回调 URI（生产 `https://www.danqing.site/app/auth/feishu/callback`） |

### 5.4 生产 .env 关键配置示例

```dotenv
# AI 配置（OpenAI 兼容协议，支持 GLM/TRAE/OpenAI/Azure/vLLM）
AI_ENABLED=true
AI_PROVIDER=glm
AI_API_KEY=your_glm_api_key_here
AI_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
AI_API_TIMEOUT=2500
AI_API_MODEL=glm-4v-flash

# JWT（换行必须 \n 转义，双引号包裹）
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...\n-----END PUBLIC KEY-----"

# Cookie（生产强制 Secure）
COOKIE_SECURE=true
COOKIE_DOMAIN=.danqing.site
COOKIE_SAMESITE=lax
COOKIE_PATH=/api/v1/auth

# 基础设施（仅绑定 127.0.0.1）
DATABASE_URL=postgresql://danqing:STRONG_PASSWORD@127.0.0.1:5432/danqing_ai?schema=public&connection_limit=10&pool_timeout=10
REDIS_URL=redis://:REDIS_PASSWORD@127.0.0.1:6379
```

---

## 6. API接口规范

### 6.1 统一响应格式

```typescript
interface ApiResponse<T> {
  code: number;        // 0=成功，非 0=错误码
  message: string;
  data: T | null;
  traceId: string;     // UUID，贯穿请求全链路
}
```

### 6.2 错误码枚举

错误码定义于 `server/src/types/api-contract.ts` 的 `ErrorCode` 枚举：

| 错误码段 | 类别 | 示例 |
|---------|------|------|
| 0 | 成功 | `SUCCESS = 0` |
| 1xxx | 参数错误 | `PARAM_INVALID = 1001`, `PARAM_MISSING = 1002`, `RESOURCE_NOT_FOUND = 1003` |
| 2xxx | 认证授权 | `UNAUTHORIZED = 2001`, `TOKEN_EXPIRED = 2002`, `FORBIDDEN = 2004` |
| 3xxx | 租户 | `TENANT_NOT_FOUND = 3001`, `TENANT_DISABLED = 3002`, `TENANT_SEATS_FULL = 3003` |
| 4xxx | 飞书 | `FEISHU_AUTH_FAILED = 4001`, `FEISHU_TOKEN_EXCHANGE_FAILED = 4002` |
| 5xxx | 文件 | `FILE_UPLOAD_FAILED = 5001`, `FILE_TOO_LARGE = 5003` |
| 6xxx | 分析 | `ANALYSIS_QUOTA_EXCEEDED = 6001`, `ANALYSIS_TIMEOUT = 6002`, `ANALYSIS_IMAGE_INVALID = 6005` |
| 7xxx | 订阅 | `SUBSCRIPTION_NOT_FOUND = 7001`, `SUBSCRIPTION_PAYMENT_FAILED = 7003` |
| 8xxx | 管理后台 | `ADMIN_USER_NOT_FOUND = 8001`, `ADMIN_PERMISSION_INSUFFICIENT = 8013` |
| 8101-8404 | Phase 5 预留 | `KNOWLEDGE_NOT_FOUND = 8101`, `MODULE_NOT_FOUND = 8201` |
| 9001-9005 | 系统错误 | `INTERNAL_ERROR = 9001`, `DATABASE_ERROR = 9002`, `RATE_LIMITED = 9005` |
| 91xx | Phase 5 新增 | `PHASE5_PRESET_NOT_FOUND = 9101`, `PHASE5_DISPUTE_NOT_FOUND = 9105` |
| 9901 | 预留未实现 | `NOT_IMPLEMENTED = 9901` |

### 6.3 业务 API 路由清单（`/api/v1`）

#### 认证路由（`/api/v1/auth`）

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|------|------|------|------|------|
| GET | `/auth/feishu/authorize` | 否 | 10/min | 飞书 OAuth 授权 URL |
| GET | `/auth/feishu/callback` | 否 | 5/min | 飞书 OAuth 回调 |
| POST | `/auth/refresh` | Cookie | 20/min | 刷新 access_token（CSRF 双提交） |
| POST | `/auth/logout` | 是 | - | 登出（CSRF 校验） |
| GET | `/auth/me` | 是 | - | 获取当前用户信息 |
| POST | `/auth/phone/otp` | 否 | 3/min | 发送手机验证码 |
| POST | `/auth/phone/verify` | 否 | 5/min | 手机验证码登录/注册 |
| POST | `/auth/phone/bind` | 是 | 3/min | 绑定手机号 |
| POST | `/auth/invitation/redeem` | 否 | 5/min | 邀请码兑换 |
| POST | `/auth/register/admin` | 否 | 2/min | 院校管理员注册 |
| POST | `/auth/login/admin` | 否 | 5/min | 院校管理员登录 |
| POST | `/auth/register` | 否 | 3/min | 通用账号注册 |
| POST | `/auth/login` | 否 | 5/min | 通用账号登录 |
| POST | `/auth/feishu/qrcode` | 否 | 5/min | 创建飞书扫码二维码 |
| POST | `/auth/feishu/qrcode/status` | 否 | 30/min | 查询扫码状态 |

#### 用户路由（`/api/v1/users`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/users/profile` | 已登录 | 获取个人资料 |
| PATCH | `/users/profile` | `user:update:own` | 更新个人资料 |
| PATCH | `/users/role` | `user:update:own` | 职业选择（onboarding） |

#### 租户路由（`/api/v1/tenants`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/tenants/current` | `tenant:read` | 当前租户信息 |
| POST | `/tenants/switch` | `tenant:switch` | 切换租户 |
| GET | `/tenants` | `tenant:read` | 用户所有租户 |
| GET | `/tenants/:id/members` | `user:read` | 租户成员列表 |
| POST | `/tenants/:id/members` | `user:invite` | 邀请成员 |
| DELETE | `/tenants/:id/members/:userId` | `user:remove` | 移除成员 |

#### 分析路由（`/api/v1/analyses`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/analyses` | `analysis:create` | 提交分析（JSON） |
| POST | `/analyses/upload` | `analysis:create` | 提交分析（文件上传） |
| GET | `/analyses` | `analysis:read:own`/`:tenant` | 分析列表 |
| GET | `/analyses/:id` | `analysis:read:own`/`:tenant` | 分析详情 |
| DELETE | `/analyses/:id` | `analysis:delete:own`/`:tenant` | 删除分析 |

#### 评审路由（挂载在 `/api/v1/analyses/:id` 下）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/analyses/:id/reviews` | `review:write` | 提交评审 |
| GET | `/analyses/:id/reviews` | `review:read` | 评审列表 |
| GET | `/analyses/:id/reviews/:rid` | `review:read` | 评审详情 |
| POST | `/analyses/:id/disputes/check` | `review:write` | 检查争议触发 |

#### 争议路由（`/api/v1/disputes`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/disputes` | `dispute:read` | 争议列表 |
| GET | `/disputes/:id` | `dispute:read` | 争议详情 |
| GET | `/disputes/:id/result` | `dispute:read` | 争议结果 |
| POST | `/disputes/:id/resolve` | `dispute:resolve` | 裁定争议 |
| POST | `/disputes/:id/apply-result` | `dispute:resolve` | 应用裁定结果 |

#### 预设路由（`/api/v1/presets`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/presets` | `preset:read` | 预设列表 |
| POST | `/presets/apply` | `preset:read` | 应用预设重算 |
| POST | `/presets` | `preset:write` | 创建预设 |
| GET | `/presets/:id` | `preset:read` | 预设详情 |
| POST | `/presets/:id/fork` | `preset:write` | fork 预设 |
| PATCH | `/presets/:id` | `preset:write` | 更新预设 |
| DELETE | `/presets/:id` | `preset:write` | 删除预设 |

#### 其他业务路由

| 路由前缀 | 说明 |
|---------|------|
| `/api/v1/artworks` | 艺术品知识库（search/style-categories/category/:category/:id） |
| `/api/v1/growth` | 成长曲线 |
| `/api/v1/subscriptions` | 订阅管理（current/plans/usage/invoices/upgrade/cancel） |
| `/api/v1/notifications` | 通知系统（列表/未读计数/标记已读/全部已读） |

#### Phase 5 预留路由（返回 501）

| 路由前缀 | 说明 |
|---------|------|
| `/api/v1/knowledge` | 知识库实时检索（预留） |
| `/api/v1/modules` | 模块化功能扩展（预留） |
| `/api/v1/ui` | UI 配置与组件数据（预留） |
| `/api/v1/config` | 功能参数与流程控制（预留） |

### 6.4 管理后台 API 路由清单（`/api/admin`）

| 模块 | 路径 | 说明 |
|------|------|------|
| 用户管理 | `/users`, `/users/:id`, `/users/:id/lock`, `/users/batch`, `/users/export` | CRUD + 锁定 + 批量 + 导出 |
| 角色管理 | `/roles`, `/roles/:role` | 角色权限矩阵 |
| 作品审核 | `/artworks`, `/artworks/:id`, `/artworks/:id/review` | 列表 + 详情 + 审核 |
| 模板管理 | `/templates` | 创意模板 CRUD |
| 订阅管理 | `/subscriptions`, `/invoices`, `/plans` | 订阅 + 发票 + 套餐 |
| 数据看板 | `/stats/overview`, `/stats/growth`, `/stats/retention`, `/stats/ai-cost`, `/stats/realtime`, `/stats/tenant/:id`, `/stats/ai-usage/*` | 统计分析 |
| 系统管理 | `/system/tenants`, `/system/audit-logs`, `/system/api-keys`, `/system/health`, `/system/ai-config` | 租户 + 审计 + 密钥 + 健康 + AI 配置 |
| 预设管理 | `/presets` | 管理后台预设列表 |

---

## 7. 数据模型

### 7.1 数据库概览

- **数据库**：PostgreSQL 15（生产强制，禁止 SQLite）
- **主键策略**：UUID v4
- **多租户**：所有业务表强制 `tenant_id`（除 Tenant 表本身）
- **命名规范**：Prisma 字段 camelCase，数据库列 snake_case（通过 `@map`），表名复数蛇形（通过 `@@map`）
- **Schema 文件**：`server/prisma/schema.prisma`

### 7.2 枚举定义

| 枚举 | 值 | 说明 |
|------|-----|------|
| `UserRole` | admin/teacher/student/owner | 用户角色 |
| `TenantType` | school/college/class/individual | 租户类型 |
| `TenantPlan` | free/standard/enterprise | 订阅计划 |
| `TenantStatus` | active/disabled | 租户状态 |
| `ArtType` | painting/design/product/sculpture | 作品类型 |
| `AnalysisStatus` | pending/processing/success/failed | 分析状态 |
| `SubscriptionStatus` | active/past_due/canceled/expired | 订阅状态 |
| `InvoiceStatus` | pending/paid/failed/refunded | 发票状态 |
| `UserStatus` | active/locked/deleted | 用户状态 |
| `ReviewStatus` | pending/approved/rejected/flagged | 审核状态 |
| `ApiKeyStatus` | active/revoked | 密钥状态 |
| `AuditAction` | create/update/delete/lock/batch/review/cancel/refund/revoke/login/logout | 审计动作 |
| `AuthType` | feishu/phone/invitation/password | 认证方式（Phase 5） |
| `PresetStyle` | academic/artist/academy/applied/custom | 预设风格 |
| `PresetStage` | basic/foundation/advanced/creative | 预设阶段 |
| `ReviewerType` | professor/lecturer/ai | 评委类型 |
| `ReviewRecordStatus` | draft/submitted/superseded | 评审状态 |
| `DisputeLevel` | consistent/general/high/veto | 争议级别 |
| `DisputeStatus` | open/reviewing/resolved/closed | 争议状态 |
| `NotificationType` | SYSTEM/ANALYSIS_DONE/ANALYSIS_FAIL/REVIEW/SUBSCRIPTION/INVITATION | 通知类型 |
| `NotificationLevel` | INFO/SUCCESS/WARN/ERROR | 通知级别 |

### 7.3 数据模型清单

| 模型 | 表名 | 说明 | 多租户 |
|------|------|------|--------|
| `Tenant` | `tenants` | 租户（层级自引用） | - |
| `User` | `users` | 用户（多认证方式） | 是 |
| `Session` | `sessions` | 会话（refresh_token SHA-256 哈希） | 是 |
| `TenantMember` | `tenant_members` | 租户成员关系（多对多） | 是 |
| `Analysis` | `analyses` | AI 分析任务 | 是 |
| `Subscription` | `subscriptions` | 订阅 | 是 |
| `Invoice` | `invoices` | 发票 | 是 |
| `AuditLog` | `audit_logs` | 审计日志（系统级，无 tenant_id） | 否 |
| `ApiKey` | `api_keys` | API 密钥 | 可选 |
| `CreativeTemplate` | `creative_templates` | 创意模板 | 否 |
| `PhoneVerification` | `phone_verifications` | 手机验证码 | 可选 |
| `InvitationCode` | `invitation_codes` | 邀请码 | 是 |
| `EvaluationPreset` | `evaluation_presets` | 评分预设 | 可选 |
| `ReviewRecord` | `review_records` | 评委评分记录 | 否（通过 analysis 关联） |
| `DisputeCase` | `dispute_cases` | 争议仲裁案件 | 是 |
| `AiUsageLog` | `ai_usage_logs` | AI 用量日志 | 是 |
| `Notification` | `notifications` | 通知 | 是 |

### 7.4 核心模型字段

#### Tenant（租户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| name | String | 租户名称 |
| type | TenantType | 租户类型 |
| feishuTenantKey | String? | 飞书租户标识（唯一） |
| plan | TenantPlan | 订阅计划（默认 free） |
| status | TenantStatus | 状态（默认 active） |
| maxSeats | Int | 席位上限（默认 1） |
| parentId | String? | 父租户 ID（层级关系） |

#### User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| tenantId | String | 当前激活租户 |
| authType | AuthType | 认证方式（默认 feishu） |
| feishuOpenId | String? | 飞书 open_id（Phase 5 起可空） |
| feishuUnionId | String? | 飞书 union_id |
| passwordHash | String? | 密码哈希（院校管理员） |
| phone | String? | 手机号 |
| name | String | 用户名 |
| role | UserRole | 角色（默认 student） |
| status | UserStatus | 用户状态（默认 active） |

#### Analysis（分析任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| tenantId | String | 租户隔离 |
| userId | String | 提交者 |
| workType | ArtType | 作品类型 |
| imageUrl | String | 图片 URL |
| status | AnalysisStatus | 分析状态 |
| result | Json? | 分析结果（AnalysisResult 结构） |
| overallScore | Int? | 综合评分（冗余，便于排序） |
| durationMs | Int? | 分析耗时（SLA 监控） |
| reviewStatus | ReviewStatus | 内容审核状态 |

#### EvaluationPreset（评分预设）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| styleType | PresetStyle | 风格类型 |
| artType | ArtType | 适用作品类型 |
| dimensions | Json | 维度权重 `[{key,label,weight}]` |
| isBuiltIn | Boolean | 是否内置 seed（不可改不可删） |
| isPrivate | Boolean | 是否私有 |
| forkedFromId | String? | fork 源预设 |
| tenantId | String? | null=全局 seed，非 null=租户私有 |

### 7.5 关键索引

| 模型 | 索引 | 用途 |
|------|------|------|
| Analysis | `(tenantId, createdAt)` | 租户内按时间倒序 |
| Analysis | `(tenantId, userId)` | 教师查看指定学生 |
| Analysis | `(tenantId, status)` | 按状态筛选 |
| Analysis | `(overallScore)` | 评分排序 |
| Notification | `(tenantId, userId, readAt)` | 未读计数与过滤 |
| Notification | `(tenantId, userId, createdAt)` | 游标分页 |
| AiUsageLog | `(tenantId, createdAt)` | 租户用量统计 |
| Session | `(expiresAt)` | 过期会话清理 |
| Session | `(revokedAt)` | 活跃会话查询 |

---

## 8. 认证授权体系

### 8.1 认证流程

#### 飞书 OAuth 2.0 流程

```
前端 → GET /auth/feishu/authorize
  ↓ 后端生成 state（CSRF），返回 authorizeUrl
前端跳转飞书授权页
  ↓ 用户授权
飞书回调 GET /auth/feishu/callback?code=xxx&state=xxx
  ↓ 后端校验 state
  ↓ exchangeCodeForToken（OIDC：app_access_token → user access_token）
  ↓ getUserInfo（获取用户信息）
  ↓ upsert User + Tenant
  ↓ 签发 JWT access_token + refresh_token
  ↓ refresh_token 写入 HttpOnly Cookie（web/admin）
  ↓ 返回 accessToken + user + tenant
```

飞书 OAuth 关键实现（`server/src/services/feishu.service.ts`）：

- **授权 URL 构建**：`buildAuthorizeUrl(state, redirectUri)` → `open.feishu.cn/open-apis/authen/v1/authorize`
- **App Access Token**：`getAppAccessToken()` → POST `auth/v3/app_access_token/internal`
- **Token 交换**：使用 `Authorization: Bearer ${appToken}` 头调用 OIDC 端点（非 body 传 app_id/app_secret）
- **用户信息**：用 user access_token 调用 `authen/v1/user_info`

#### 多端认证差异

| 客户端 | refresh_token 传递 | CSRF |
|--------|-------------------|------|
| web/admin | HttpOnly Cookie | X-CSRF-Token 头（双提交 Cookie） |
| mobile | 响应体返回（expo-secure-store 存储） | X-CSRF-Token 头 |

### 8.2 JWT 体系

| 项 | 说明 |
|----|------|
| 算法 | RS256（非对称） |
| 密钥 | RSA 2048，openssl 生成 |
| access_token | 15m 过期，前端存内存（不存 localStorage） |
| refresh_token | 7d 过期，SHA-256 哈希存 Session 表 |
| payload | userId, tenantId, role, aud（web/admin/mobile） |
| 校验 | issuer + audience + expiry |

### 8.3 RBAC 权限矩阵

权限定义于 `server/src/config/permissions.ts`，命名规范 `资源:动作[:范围]`（`:own` 自己的，`:tenant` 租户内）。

#### 角色权限概览

| 权限 | ADMIN | OWNER | TEACHER | STUDENT |
|------|:-----:|:-----:|:-------:|:-------:|
| analysis:create | Y | Y | Y | Y |
| analysis:read:own | Y | Y | Y | Y |
| analysis:read:tenant | Y | Y | Y | N |
| analysis:delete:own | Y | Y | Y | Y |
| analysis:delete:tenant | Y | Y | N | N |
| user:read | Y | Y | Y | N |
| user:invite | Y | Y | Y | N |
| user:remove | Y | Y | N | N |
| tenant:update | Y | Y | N | N |
| stats:read:tenant | Y | Y | Y | N |
| subscription:update | Y | Y | N | N |
| preset:write | Y | Y | Y | N |
| review:write | Y | Y | Y | N |
| dispute:resolve | Y | Y | Y | N |
| admin:*（全部管理权限） | Y | Y | N | N |

#### 数据范围过滤

- **student**：强制 `WHERE user_id = ?`（仅自己的资源）
- **teacher/admin/owner**：不加 user_id 过滤（可见租户全量）
- 工具函数：`canReadTenantWide(role)` / `canDeleteTenantWide(role)` / `isAdminRole(role)`

### 8.4 多租户中间件

`server/src/middlewares/tenant.ts`：

- 必须在 `authMiddleware` 之后注册
- 从 JWT payload（经 auth 中间件注入 `req.tenantId`）提取 tenant_id
- Repository 从 `req.tenantId` 取值，**禁止从请求体/查询参数读取 tenant_id**

### 8.5 CSRF 防护

- **双提交 Cookie 模式**：POST/PATCH/PUT/DELETE 请求需携带 `X-CSRF-Token` 头
- 头值必须匹配 `csrf_token` Cookie 值
- Cookie path 为 `/api/v1/auth`（匹配 API 路由）

### 8.6 会话管理

- refresh_token 仅存 SHA-256 哈希（Session 表 `refreshTokenHash`），禁止存明文
- 登出时 `revokedAt` 标记撤销
- 支持撤销所有会话（`revokeAll`）

---

## 9. AI分析服务架构

### 9.1 混合分析架构

丹青有AI 采用 **Jimp 像素分析 + AI 视觉分析** 混合模式，保障 3 秒 SLA：

```
用户上传作品
  ↓
analysis.service.runAnalysis()
  ↓ 1. 校验租户配额（抛 6001/3001/3002）
  ↓ 2. 校验图片输入（imageUrl 或 localImagePath）
  ↓ 3. 写 DB（pending）
  ↓ 4. 调用分析引擎
    ↓
    analysisCacheService.getOrAnalyze()
      ↓ 计算 hash（本地 SHA-256 / URL hash）
      ↓ 查 Redis 缓存
      ↓ 命中 → 直接返回（cacheHit=true）
      ↓ 未命中 → 调用 analyzer
        ↓
        env().aiEnabled?
          ↓ 是 → runHybridAnalysis()
          ↓       ↓ Jimp 像素分析（~500ms，始终执行）
          ↓       ↓ AI 视觉分析（超时 2.5s 切断）
          ↓       ↓   成功 → mergeResults()（应用 score_adjustments）
          ↓       ↓   失败 → createFallbackAIVisionResult()（模板建议）
          ↓       ↓ 返回 HybridAnalysisResult
          ↓ 否 → Jimp-only 模式（~500ms）
        ↓ 仅缓存成功结果
  ↓ 5. 更新 DB（success/failed + durationMs）
  ↓ 6. 异步创建通知（ANALYSIS_DONE/ANALYSIS_FAIL）
  ↓ 返回 { id, status, result, durationMs }
```

### 9.2 双提供商降级策略

```
AI_PROVIDER=trae?
  ↓ 是 → TRAE 凭证完整?
  ↓       是 → 使用 TRAE
  ↓       否 → 自动降级到 GLM
  ↓ 否 → 使用 GLM
```

AI 模块采用 OpenAI 兼容协议，可接入任意兼容端点（GLM/TRAE/OpenAI/Azure/vLLM）。

### 9.3 三道降级防线

| 防线 | 触发条件 | 行为 |
|------|---------|------|
| 第一道 | AI 功能未启用（`aiEnabled=false`） | Jimp + 模板降级建议 |
| 第二道 | AI 调用失败（超时/HTTP 错误/解析错误） | Jimp + 模板降级建议 |
| 第三道 | AI API Key 缺失 | 自动 fallback 到模板规则 |

### 9.4 模板降级建议（55 条规则）

`server/src/services/template-suggestions.service.ts` 定义了覆盖四种创意形式的 55 条规则：

| 创意形式 | 规则数 | 维度 |
|---------|--------|------|
| 绘画（PAINTING_RULES） | ~15 | 构图、色彩、笔触 |
| 设计（DESIGN_RULES） | ~13 | 视觉层次、排版、色彩应用 |
| 产品设计（PRODUCT_RULES） | ~13 | 形态、材质、功能 |
| 雕塑（SCULPTURE_RULES） | ~14 | 空间构图、形体、材质 |

每条规则结构：

```typescript
{
  id: 'painting-comp-whitespace-high',
  dimension: '构图',
  condition: (m) => m.whitespaceRatio > 0.5,
  evidence: (m) => `留白比例${pct(m.whitespaceRatio)}超过50%阈值`,
  operation: '适当增加主体元素面积,或通过色彩对比强化视觉焦点',
  reference: '参考达芬奇《蒙娜丽莎》的黄金分割构图',
  practice: '练习"三分法构图":将主体置于交叉点位置,控制留白在30-40%',
  priority: 'high',
}
```

建议优先级限制：high ≤ 2, medium ≤ 2, low ≤ 1, 总计 ≤ 5。

### 9.5 分析缓存

`server/src/services/analysis-cache.service.ts` 基于 Redis 的图片 hash 缓存：

| 项 | 说明 |
|----|------|
| hash 计算 | 本地文件 SHA-256，URL 直接 hash |
| 缓存 key | `${hash}:${artType}` |
| TTL | AI 增强：较长；Jimp-only：较短 |
| 缓存条件 | 仅缓存成功结果（`isSuccessResult`） |

### 9.6 AI 调用超时保障

- **axios timeout**：2500ms
- **AbortController wall-clock deadline**：双层超时保障，任一触发即走 Jimp fallback
- **总 SLA**：上传→看到分数 < 3 秒

### 9.7 分析结果结构

```typescript
interface AnalysisResult {
  artType: ArtType;
  dimensions: DimensionResult;  // 四类联合类型
  originality: OriginalityDimension;
  overallScore: number;         // 0-100
  // AI 增强字段（可选）
  professionalSuggestions?: ProfessionalSuggestion[];
  semanticTheme?: string;
  styleRecognition?: string;
  referenceArtworks?: ReferenceArtwork[];
}
```

`ProfessionalSuggestion` 必须包含 `evidence`（证据）和 `priority`（high/medium/low）字段。

---

## 10. 数据流向

### 10.1 分析提交数据流

```
[学生/教师] 前端上传图片
  ↓ POST /api/v1/analyses/upload（multipart/form-data）
  ↓ multer 磁盘存储 → /lhcos-data/uploads/
  ↓ analysisController.uploadAnalysis
  ↓ analysisService.runAnalysis({ localImagePath, body, tenantId, userId })
  ↓ 校验配额 → checkQuota（Redis 计数器）
  ↓ 写 DB（Analysis, status=pending）
  ↓ 缓存检查 → analysisCacheService.getOrAnalyze
  ↓ Jimp 分析 → analyzeImage（像素级指标）
  ↓ AI 分析 → analyzeWithAI（GLM-4V 视觉理解）
  ↓ mergeResults（合并 + score_adjustments）
  ↓ 更新 DB（status=success, result, overallScore, durationMs）
  ↓ 异步通知 → notificationService.createNotification
  ↓ 返回 CreateAnalysisResponse
```

### 10.2 认证数据流

```
[用户] 点击飞书登录
  ↓ GET /api/v1/auth/feishu/authorize?client=web
  ↓ authController.feishuAuthorize
  ↓ feishuService.buildAuthorizeUrl(state, redirectUri)
  ↓ Redis 存 state（5min TTL，CSRF）
  ↓ 返回 { authorizeUrl, state }
  ↓ 前端跳转飞书授权页
  ↓ 用户授权
  ↓ 飞书回调 GET /api/v1/auth/feishu/callback?code&state
  ↓ 校验 state（Redis）
  ↓ feishuService.getUserInfo(code)
  ↓   getAppAccessToken() → Authorization: Bearer
  ↓   OIDC token exchange → user access_token
  ↓   获取用户信息
  ↓ upsertUser + upsertTenant + upsertTenantMember
  ↓ 签发 JWT（access_token 15m + refresh_token 7d）
  ↓ Session 表存 refresh_token SHA-256 哈希
  ↓ refresh_token 写 HttpOnly Cookie（web/admin）
  ↓ 返回 { accessToken, user, tenant, isFirstLogin }
  ↓ 首次登录 → 前端跳转 /onboarding（职业选择）
```

### 10.3 评审仲裁数据流

```
[评委] 提交评审
  ↓ POST /api/v1/analyses/:id/reviews
  ↓ reviewController.createReview
  ↓ reviewService.createReview
  ↓ 写 ReviewRecord（status=submitted）
  ↓ 检查争议触发 → checkDispute
  ↓   计算评分极差（totalRange）
  ↓   计算维度差异（dimDiffs）
  ↓   计算等级交叉数（gradeCrossCount）
  ↓ 触发争议？→ 创建 DisputeCase（status=open）
  ↓ 返回 ReviewRecordSummary
```

### 10.4 通知数据流

```
[分析完成] analysisService
  ↓ notificationService.createNotification（异步，不阻塞主流程）
  ↓ 写 Notification 表（tenantId, userId, type, level）
  ↓ [用户] GET /api/v1/notifications（游标分页）
  ↓ [用户] GET /api/v1/notifications/unread-count
  ↓ [用户] PATCH /api/v1/notifications/:id/read
```

---

## 11. 部署流程

### 11.1 部署架构

| 组件 | 部署方式 |
|------|---------|
| 后端服务 | PM2 fork 模式，单实例，端口 127.0.0.1:3000 |
| Web 应用 | 静态文件，Nginx 托管 |
| 管理后台 | 静态文件，Nginx 托管 + IP 白名单 |
| 品牌官网 | 静态文件，Nginx 托管（路径 `/`） |
| PostgreSQL | Docker 容器，1Panel 管理，仅绑定 127.0.0.1 |
| Redis | Docker 容器，1Panel 管理，仅绑定 127.0.0.1 |
| Nginx | 反向代理 + SSL 终止 + 静态托管 + 限流 |

### 11.2 域名规划

| 域名 | 端 | 部署路径 | 访问控制 |
|------|----|---------|---------|
| `www.danqing-ai.com` | website/ | `/var/www/danqing-ai/website/` | 公网 |
| `app.danqing-ai.com` | src/ | `/var/www/danqing-ai/dist/` | 公网 |
| `admin.danqing-ai.com` | admin/ | `/var/www/danqing-ai/admin/` | IP 白名单 |
| `api.danqing-ai.com` | server/ | PM2 进程 | 公网（CORS 白名单） |

> 生产实际域名：`www.danqing.site`，官网挂载在 `/`，业务应用挂载在 `/app`。

### 11.3 Nginx 配置要点

**生产配置文件**：`deploy/nginx-site.conf` → 部署至 `/etc/nginx/conf.d/danqing.conf`

> ⚠️ `deploy/nginx.conf` 为旧版 sites-available 模板(2026-08-04 架构重构前),已加 DEPRECATED 标注并同步 P2 配置,生产部署请使用 `nginx-site.conf`。

```nginx
# 关闭版本号泄露(P2-5)
server_tokens off;

# Gzip 压缩(P2-1):JS/CSS/JSON/XML/SVG 等
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript
           application/javascript application/json
           application/xml application/xml+rss image/svg+xml;

# HTTP → HTTPS 强制跳转
server {
    listen 80;
    server_name www.danqing.site danqing.site;
    return 301 https://$host$request_uri;
}

# HTTPS 主站(官网 + 业务应用一体化)
server {
    listen 443 ssl http2;
    server_name www.danqing.site danqing.site;
    ssl_certificate     /etc/nginx/ssl/danqing-ai.crt;
    ssl_certificate_key /etc/nginx/ssl/danqing-ai.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # 安全响应头(P2-3):5 项齐全
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;

    client_max_body_size 15m;

    # 1. 官网(/) - Next.js 静态导出
    root /var/www/danqing-ai/website;
    location / { try_files $uri $uri/ /index.html; }
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }
    location ~* ^/_next/static/.*\.(js|css|woff2?|svg|png|jpg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 2. 业务应用(/app) - Vite + React
    location /app/ {
        alias /var/www/danqing-ai/dist/;
        try_files $uri $uri/ /app/index.html;
    }
    location = /app/index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    # 3. API 反向代理(/api/) - Node.js 后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Trace-Id $request_id;
        gzip on;
        gzip_types application/json;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }

    # 4. 健康检查 + 5. 上传文件 + 6. 禁隐藏文件
    location /health { proxy_pass http://127.0.0.1:3000; access_log off; }
    location /uploads/ { alias /lhcos-data/uploads/; expires 7d; }
    location ~ /\. { deny all; access_log off; log_not_found off; }
}
```

### 11.4 PM2 配置

配置文件：`ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'danqing-api',
    script: 'server/dist/index.js',
    cwd: __dirname,
    node_args: '--env-file=server/.env',  // Node 20 原生 --env-file
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
    kill_timeout: 5000,
    watch: false,
  }],
};
```

### 11.5 部署五阶段流程

遵循五阶段、四门禁、三铁律：

| 阶段 | 内容 | 门禁 |
|------|------|------|
| S1 | 选型确认 | 技术栈/配置确认 |
| S2 | 服务器接入 | SSH/防火墙/环境就绪 |
| S3 | 外部暴露 | HTTPS/CNAME/端口 |
| S4 | 上线监控 | 告警/备份/预算 |
| S5 | Runbook 文档 | 运维手册完成 |

三铁律：

1. **HTTPS 强制**：启用 HTTPS 并 HTTP 强制跳转
2. **安全加固**：防火墙默认拒绝 + SSH 加固 + DB 绑定 127.0.0.1
3. **监控备份**：真实告警 + 备份 + 恢复演练 + 预算告警

### 11.6 后端构建步骤

```bash
cd /var/www/danqing-ai/server
npm ci
npm run build            # tsc -p tsconfig.json → dist/
npx prisma generate
npx prisma migrate deploy
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd
```

### 11.7 前端构建步骤

```bash
cd /var/www/danqing-ai
npm ci
npm run build            # tsc && vite build → dist/
```

---

## 12. 版本控制

### 12.1 仓库信息

| 项 | 说明 |
|----|------|
| 仓库 | `Xyangshaun/danqing-ai` |
| 主分支 | main |
| 部署目录 | `/var/www/danqing-ai` |

### 12.2 版本规范

| 端 | 版本 | 说明 |
|----|------|------|
| server | v3.0.0 | 后端服务 |
| admin | v1.0.0 | 管理后台 |
| website | v1.0.0 | 品牌官网 |
| web | v0.0.0 | Web 应用 |

### 12.3 .env 文件管理

- 含真实密钥的 `.env` 严禁提交 git
- `server/.env.production` 为占位模板，可提交
- 前端 `.env.example` 为占位模板

### 12.4 编译规范

- 后端：`tsc -p tsconfig.json` 生成 `dist/` 目录
- 前端：`tsc && vite build` 生成 `dist/` 目录
- 前端 base：`/`（或 `/app/` 用于业务应用子路径）

---

## 13. 监控与运维

### 13.1 健康检查

```bash
# 本地
curl http://127.0.0.1:3000/health
# 期望:{"code":"SUCCESS","message":"ok","data":{"status":"up","timestamp":"..."}}

# 通过 Nginx
curl https://api.danqing-ai.com/health
```

### 13.2 日志管理

| 日志类型 | 路径 | 说明 |
|---------|------|------|
| PM2 stdout | `./logs/out.log` | 标准输出 |
| PM2 stderr | `./logs/error.log` | 错误输出 |
| 应用日志 | Winston（按 LOG_LEVEL） | 结构化日志 |

logrotate 配置（`/etc/logrotate.d/danqing-ai`）：

```text
/var/log/danqing-ai/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        pm2 reloadLogs >/dev/null 2>&1 || true
    endscript
}
```

### 13.3 PM2 运维命令

```bash
pm2 logs danqing-api --lines 200    # 实时日志
pm2 restart danqing-api             # 重启
pm2 reload danqing-api              # 零停机重载
pm2 status                          # 状态
pm2 monit                           # 监控面板
```

### 13.4 安全加固

| 项 | 配置 |
|----|------|
| 防火墙 | UFW 默认拒绝，仅开放 22/80/443 |
| SSH | 禁止 root 登录，仅密钥认证 |
| fail2ban | SSH 防爆破（5 次失败封 1 小时） |
| PostgreSQL | 仅绑定 127.0.0.1 |
| Redis | 仅绑定 127.0.0.1 |
| Nginx | 隐藏版本号，安全响应头 |

### 13.5 数据库备份

- PostgreSQL WAL 归档
- 定期备份（推荐每日全量 + WAL 连续归档）
- 恢复演练（铁律要求）

---

## 14. 已知约束与待优化项

### 14.1 硬约束

| 约束 | 说明 |
|------|------|
| 多创意形式 | 必须支持绘画、设计、产品设计、雕塑四种 |
| 3 秒 SLA | 所有分析必须在 3 秒内完成 |
| 具体建议 | 提供具体可执行的改进建议，而非模糊反馈 |
| AI 双提供商 | 支持 GLM/TRAE，TRAE 缺失时自动降级 |
| AI 建议格式 | 必须包含 evidence + priority（high≤2, medium≤2, low≤1, 总≤5） |
| 模板降级 | AI 失败时使用 55 条规则生成模板建议 |
| 多租户隔离 | 所有业务表强制 tenant_id |
| DB/Redis 绑定 | 仅 127.0.0.1，禁止外网访问 |
| 禁止命令 | rm -rf /, DROP DATABASE, curl\|bash 等 |

### 14.2 Phase 5 预留接口（返回 501）

| 接口 | 文件 | 说明 |
|------|------|------|
| 知识库检索 | `knowledge.controller.ts`, `knowledge.routes.ts` | 实时检索（ES/向量） |
| 模块化扩展 | `modules.routes.ts` | 插件式模块加载 |
| UI 配置 | `ui-config.routes.ts` | 主题/布局/组件配置 |
| 功能参数 | `config.routes.ts` | Feature flag + 工作流 |

### 14.3 代码 TODO

| 位置 | 说明 |
|------|------|
| `data-service.ts:415` | 前端批量删除依赖本地缓存 |
| `arbitration-default.ts:66` | 租户级仲裁配置覆盖 |
| `profile.tsx:64` | 移动端个人页占位 |
| `ConfirmAction/index.tsx:4` | 管理后台二次验证 |

### 14.4 P2 运维优化项

> **状态**: ✅ 全部已实施(2026-08-06 审计确认)
> **实施 commit**: `3292e6d`(nginx-site.conf P2 全量配置) + `25142d4`(traceId 中间件顺序修复 + errorHandler 兜底 UUID)
> **测试覆盖**: `server/tests/error-handler.test.ts` 22 项含 P2-6 traceId 回归测试,889/889 通过

| 项 | 说明 | 实施位置 | 状态 |
|----|------|---------|------|
| gzip 压缩 | JS/CSS + API 响应 | `nginx-site.conf` L21-38(全局) + L137-138(API 块) | ✅ |
| Cache-Control | 静态资源(public, immutable),index.html(no-cache) | `nginx-site.conf` L89-99(官网) + L109-121(业务应用) | ✅ |
| 安全头 | HSTS, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy, X-Permitted-Cross-Domain-Policies | `nginx-site.conf` L69-73(5 项齐全) | ✅ |
| traceId | 错误响应中必须是有效 UUID,不可为 'unknown' | `server/src/middlewares/trace.ts` + `error-handler.ts` L40-43 + `notFoundHandler` L95-97(三层兜底) | ✅ |
| server_tokens | 隐藏 Nginx 版本号 | `nginx-site.conf` L18 | ✅ |

> **Gap 修复(2026-08-06)**: 旧版 `deploy/nginx.conf`(DEPRECATED)已同步补齐上述 5 项 P2 配置,防止误部署导致配置缺失;真源文档 §11.3 引用已更正为 `nginx-site.conf`。

### 14.5 V2 任务包

| 任务 | 说明 |
|------|------|
| V2-C | 全局交互体验（Toast、骨架屏、错误边界） |
| V2-D | 性能优化（bundle 分析、懒加载、memoization） |
| V2-E | 测试覆盖 |

### 14.6 P3 长期优化

| 项 | 说明 |
|----|------|
| 移动端完善 | mobile/ 功能补全 |
| AI 图像生成 | 集成图像生成 API |
| 租户仲裁 | 租户级仲裁配置覆盖 |
| 管理后台二次验证 | ConfirmAction 组件完善 |

### 14.7 测试状态

- 测试套件：889/889 通过（21 个测试文件，0 失败）
- TypeScript 构建：0 错误
- 已修复：feishu-api.mock.ts 与 feishu.service.ts 同步问题（OIDC 流程 mock 修正）

---

## 15. 版本历史

### 15.1 Phase 演进

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 飞书 OAuth + JWT + 多租户 RBAC + 基础分析 | ✅ 完成 |
| Phase 2 | AI 视觉分析（GLM-4V）+ 成长曲线 + 订阅计费 | ✅ 完成 |
| Phase 3 | 订阅管理 + 多端适配 | ✅ 完成 |
| Phase 4 | 管理后台（用户/作品/订阅/统计/审计/API 密钥） | ✅ 完成 |
| Phase 5 | 评分预设 + 多评委仲裁 + 认证扩展 + 预留接口 | ✅ 完成 |
| 任务包 B | 通知系统真实数据接入 | ✅ 完成 |
| 用量统计 | AI 用量日志 + 管理后台统计 | ✅ 完成 |
| Phase F1 | AI 分析可观测性元信息透传 | ✅ 完成 |

### 15.2 关键里程碑

| 时间 | 事件 |
|------|------|
| 2026-07-27 | 技术约束确立（context-log-2026-07-27） |
| 2026-07-29 | 四端部署文档完成（DEPLOYMENT.md v3.0.0） |
| 2026-08-03 | 生产部署架构确立 + 文档同步修正 |
| 2026-08-04 | 上下文日志更新 |
| 2026-08-06 | 飞书登录 + 分析上传生产验证通过 |
| 2026-08-06 | 代码审查 3 轮 + 用户模拟测试 5 轮（761→889 测试通过） |
| 2026-08-06 | 实施真源文档生成（本文档） |

### 15.3 关键技术决策记录

| 决策 | 原因 |
|------|------|
| 弃用 koa-connect | 导致 ctx.state 数据丢失，原生 Koa 重写 |
| 弃用 Wikimedia 图片 | 国内不可访问，改用 TRAE 内置图像生成 |
| 弃用 Vercel | 国内访问问题，改用 GitHub Pages / Nginx |
| 弃用 NodeSource | curl\|bash 禁止，改用官方 tarball |
| JWT 密钥 \n 转义 | 多行 PEM 解析失败，单行 + \n + 双引号 |
| Vite base '/' | base './' 导致深路由资源问题 |
| 飞书 QR 404 | passport QR API 404，改用授权页重定向 |
| HTTP 500 替代 502 | Nginx 拦截 502，改用 500 让客户端处理 |
| Cookie path /api/v1/auth | 匹配 API 路由，确保 refresh_token 发送 |

---

## 附录：关键文件索引

| 文件 | 说明 |
|------|------|
| `server/src/config/env.ts` | 环境变量加载与启动自检 |
| `server/src/app.ts` | Express 应用工厂与中间件链路 |
| `server/src/config/permissions.ts` | RBAC 权限矩阵 |
| `server/src/types/api-contract.ts` | API 契约主副本（跨端共享） |
| `server/prisma/schema.prisma` | Prisma 数据模型（18 个模型） |
| `server/src/services/analysis.service.ts` | 分析业务编排 |
| `server/src/services/ai-analysis.service.ts` | AI 混合分析 |
| `server/src/services/analysis-engine.service.ts` | Jimp 分析引擎 |
| `server/src/services/template-suggestions.service.ts` | 模板降级建议（55 规则） |
| `server/src/services/analysis-cache.service.ts` | Redis 缓存 |
| `server/src/services/feishu.service.ts` | 飞书 OAuth 服务 |
| `server/src/middlewares/auth.ts` | JWT 认证中间件 |
| `server/src/middlewares/tenant.ts` | 多租户中间件 |
| `server/src/middlewares/trace.ts` | traceId 注入 |
| `server/src/middlewares/error-handler.ts` | 统一错误处理 |
| `ecosystem.config.cjs` | PM2 配置 |
| `deploy/nginx-site.conf` | Nginx 生产配置(官网+业务应用一体化,部署至 `/etc/nginx/conf.d/danqing.conf`) |
| `deploy/nginx.conf` | Nginx 旧版 sites-available 模板(DEPRECATED,已同步 P2 配置,备用) |
| `server/.env.production` | 生产环境变量模板 |
| `DEPLOYMENT.md` | 部署文档 |
| `.trae/documents/prd.md` | 产品需求文档 |
| `.trae/documents/tech_arch.md` | 技术架构文档 |
| `.trae/documents/auth-design.md` | 认证设计文档 |
| `.trae/documents/data-model-v1.md` | 数据模型设计文档 |
| `.trae/documents/api-contract-v1.md` | API 契约文档 |
| `.trae/documents/new-features-design.md` | Phase 5 新功能设计 |
| `.trae/documents/context-log-2026-08-03.md` | 上下文日志 |

---

> **文档结束**。本文档基于代码库实际状态生成，所有技术细节均来源于项目源文件。如需更新，请同步修改对应源文件并重新生成本文档。
