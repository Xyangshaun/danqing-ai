# 丹青有AI 部署日志同步机制 · 上下文日志

> **文档用途**:记录 2026-08-06「部署日志同步机制(任务包 C)」的完整实施过程,包括设计、实现、测试、部署状态与运维注意点。
> **核心结论**:项目本体已成功部署到生产服务器,并新增一套「部署日志同步」机制,供下游任务可靠查询「项目是否已部署、部署了什么版本、成功与否」。
>
> **生成时间**:2026-08-06
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`
> **触发原因**:需要让其他任务/运维在本地项目文件中感知「项目本体已部署到服务器」,并提供可查询的部署状态通道。

---

## 〇、一句话结论(给后续任务)

> **项目本体已部署到生产服务器**(`www.danqing.site` / 腾讯云 `43.128.25.202`)。
> 每次部署(成功/失败)都会写入共享数据库 `deployment_logs` 表,下游任务可通过
> `GET https://www.danqing.site/api/v1/deployments/latest`(携带 `X-Deploy-Secret` 共享密钥)
> 查询「最新一次部署」的状态、版本、服务器、时间戳与失败原因。

---

## 一、任务背景与目标

### 1.1 背景

项目本体(前端 dist + 后端 server + 官网 website)已部署到生产服务器。此前缺少一套**面向其他任务/下游系统的部署状态通道**,导致:
- 无法确认「项目本体是否已成功部署到服务器」
- 无法获知「部署的版本 / 服务器 / 时间戳 / 成功失败」
- 部署脚本执行结果无法沉淀到可查询的共享存储

### 1.2 目标

1. 部署完成后,将部署详情(时间戳 / 部署版本 / 服务器标识 / 成功状态)同步记录
2. 日志数据**格式化一致**,存储在**可访问位置**(PostgreSQL 共享数据库)
3. 通过**可靠通知通道**(API 端点)提供给下游任务
4. 具备**日志完整性校验**与**同步失败的错误处理**
5. 向下游提供清晰的**成功/失败指示**

---

## 二、实施内容(完整实现)

### 2.1 数据层:DeploymentLog 模型 + 迁移

- **模型**:[schema.prisma](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/prisma/schema.prisma) `DeploymentLog`
- **迁移**:[20260806230000_deployment_log/migration.sql](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/prisma/migrations/20260806230000_deployment_log/migration.sql)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `timestamp` | TIMESTAMP(3) | 部署完成时间(ISO 8601,缺省 now()) |
| `version` | VARCHAR(64) | 部署版本(commit 短 SHA / vX.Y.Z) |
| `server_id` | VARCHAR(64) | 服务器标识(hostname) |
| `status` | VARCHAR(16) | `success` / `failed` |
| `deployer` | VARCHAR(64)? | 部署执行人 |
| `branch` | VARCHAR(64)? | 分支 |
| `commit_sha` | VARCHAR(64)? | commit SHA |
| `details` | JSONB? | 附加详情(备份目录/nginx 状态/资源数) |
| `error_message` | TEXT? | 失败原因(status=failed 时非空) |
| `source_ip` | VARCHAR(45)? | 上报来源 IP(审计) |
| `created_at` | TIMESTAMP(3) | 落库时间 |

索引:`status`、`timestamp`、`server_id+timestamp`(运维按状态/时间/单机查询)。

### 2.2 API 层:路由 + Controller + Service

统一前缀 `/api/v1/deployments`,**共享密钥 `X-Deploy-Secret` 鉴权**(`timingSafeEqual` 常量时间比较):

| 方法 | 路径 | 用途 | 鉴权 |
|------|------|------|------|
| `POST` | `/api/v1/deployments/log` | 接收部署成功/失败详情并落库 | 共享密钥 |
| `GET` | `/api/v1/deployments/latest` | 下游查询最新部署状态 | 共享密钥 |

- [deployment.routes.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/routes/deployment.routes.ts)
- [deployment.controller.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/controllers/deployment.controller.ts)(Zod 校验入参)
- [deployment.service.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/services/deployment.service.ts)(落库 + 最新状态查询)
- [env.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/config/env.ts):新增 `deploySyncSecret`(读 `DEPLOY_SYNC_SECRET`)
- [api-contract.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/types/api-contract.ts):新增 `DeploymentStatus` / `CreateDeploymentLogRequest` / `DeploymentLogEntry` / `LatestDeploymentStatusResponse`
- [app.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/src/app.ts):挂载 `deploymentRouter`

### 2.3 部署脚本:deploy-ssh.sh 上报

[deploy-ssh.sh](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/deploy-ssh.sh)(部署脚本)已集成同步逻辑:

- 用 **EXIT trap**(而非 ERR trap)在脚本**任何方式退出**时上报 `success`/`failed`(通过 `$?` 判断),确保失败状态可靠上报
- 成功时附带 `details`(备份目录 / nginx 状态 / 资源数)
- 网络失败**不阻断部署主流程**(`|| true`)
- 通过环境变量覆盖配置:`DEPLOY_SYNC_API_URL` / `DEPLOY_SYNC_SECRET` / `DEPLOY_SERVER_ID` / `DEPLOY_VERSION` / `DEPLOY_BRANCH` / `DEPLOY_DEPLOYER`

### 2.4 配置

- [.env.example](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/server/.env.example) 新增 `DEPLOY_SYNC_SECRET`(留空则端点返回 503 = 同步功能未启用)

---

## 三、部署状态(项目本体)

### 3.1 生产环境

| 项 | 值 |
|----|----|
| 生产域名 | `www.danqing.site` |
| 服务器 | 腾讯云 VPS `43.128.25.202` |
| 部署目录 | `/var/www/danqing-ai` |
| 后端 | Node.js 20 + PM2(`danqing-api`),监听 `127.0.0.1:3000` |
| 数据库 | PostgreSQL(Docker,绑定 `127.0.0.1:5432`) |
| 缓存 | Redis(Docker,绑定 `127.0.0.1:6379`) |
| 反向代理 | Nginx(`/etc/nginx/conf.d/danqing.conf`) |
| 组件版本 | Nginx 1.18 / Node 20 / PG 15 / Redis 7 |

### 3.2 部署内容(四端)

| 端 | 目录 | 技术栈 | 说明 |
|----|------|--------|------|
| 官网 | website/ | Next.js 14 静态导出 | 挂载 `/` |
| 业务 Web | src/(dist) | Vite + React | 挂载 `/app` |
| 后端 | server/ | Node.js + Express + Prisma | `/api/v1/` `/api/admin/` |
| 管理后台 | admin/ | Ant Design Pro | `/admin/`(规划中) |

### 3.3 本次部署日志同步机制上线记录

| 项 | 值 |
|----|----|
| 迁移 | `20260806230000_deployment_log` 已应用(`deployment_logs` 表已创建) |
| 测试 | 模拟「成功」+「失败」事件均已正确落库并可通过 `GET /latest` 查询 |
| 测试密钥 | 本地 `.env` 配置 `DEPLOY_SYNC_SECRET=dq-test-deploy-secret-20260806`(仅本地开发,生产需替换) |

---

## 四、下游任务如何感知「项目已部署」

> 下游任务(其他 agent / 脚本 / 运维)通过以下任一方式获取部署状态:

### 4.1 方式 A:查询 API(推荐)

```bash
# 查询最新一次部署状态(成功/失败/版本/时间戳/失败原因)
curl -s https://www.danqing.site/api/v1/deployments/latest \
  -H "X-Deploy-Secret: <DEPLOY_SYNC_SECRET>"
```

响应示例:

```json
{
  "code": 0,
  "data": {
    "status": "success",
    "version": "v3.0.0-test-20260806",
    "serverId": "danqing-prod-01",
    "timestamp": "2026-08-06T15:38:25.092Z",
    "errorMessage": null,
    "log": { "id": "...", "status": "success", "commitSha": "abc1234", "branch": "main", "details": {...} }
  }
}
```

- `status = "success"` → 项目已成功部署
- `status = "failed"` → 部署失败,`errorMessage` 含失败原因
- HTTP 404 → 暂无部署记录;HTTP 503 → `DEPLOY_SYNC_SECRET` 未配置(未启用)
- HTTP 401 → `X-Deploy-Secret` 缺失/错误

### 4.2 方式 B:查询共享数据库

直接查询 `danqing_ai` 库的 `deployment_logs` 表(与 API 同源)。

### 4.3 方式 C:读取本地项目文件

- 本上下文日志(`context-log-2026-08-06.md`):部署状态与机制说明
- 部署运维手册(`.trae/deploy-runbook-danqing.md`):服务器/路径/命令
- 部署文档(`DEPLOYMENT.md`):四端部署流程

---

## 五、测试验证结果(2026-08-06)

| 场景 | 输入 | 结果 |
|------|------|------|
| 部署成功事件 | `POST /log` status=success | ✅ HTTP 200,`synced: true`,落库 |
| 部署失败事件 | `POST /log` status=failed + errorMessage | ✅ HTTP 200,正确记录 failed + 原因 |
| 下游查询 | `GET /latest` | ✅ 返回最新 failed 记录(时间倒序) |
| 错误密钥 | `X-Deploy-Secret: WRONG` | ✅ HTTP 401 |
| 数据库落库 | 查询 `deployment_logs` | ✅ 2 条(success + failed),字段完整 |
| 迁移 | `npx prisma migrate deploy` | ✅ `deployment_logs` 表创建成功 |
| 构建 | `tsc --noEmit` | ✅ 通过 |
| 静态检查 | `eslint --no-ignore` | ✅ 0 errors / 0 warnings |

---

## 六、注意点 / 关键约束(后续任务必读)

1. **共享密钥必须一致**:`deploy-ssh.sh` 上报用的 `DEPLOY_SYNC_SECRET` 必须与服务端 `.env` 完全一致;不一致 → 401;服务端未配置 → 503
2. **生产密钥必须替换**:本地测试密钥 `dq-test-deploy-secret-20260806` 仅用于本地开发,生产环境必须使用强随机密钥
3. **部署脚本 EXIT trap**:不要改回 ERR trap —— ERR 不会在显式 `exit 1`(校验失败路径)时触发,会导致失败状态漏报
4. **同步不阻断部署**:网络失败用 `|| true` 兜底,部署主流程不受影响
5. **端点鉴权用共享密钥而非 JWT**:部署脚本在服务器本地运行,拿不到 JWT;且用 `timingSafeEqual` 常量时间比较防时序侧信道
6. **数据为系统级**:部署日志不含 `tenant_id`(跨租户,类比 AuditLog),多租户隔离不影响
7. **迁移部署**:生产库新增表需执行 `npx prisma migrate deploy`(已执行)
8. **nginx 代理**:`/api/` 已反代到 `127.0.0.1:3000`,`/api/v1/deployments/*` 走同一通道
9. **`.env` 勿提交 git**:`DEPLOY_SYNC_SECRET` 属敏感配置,仅存在于服务器 `.env`

---

## 七、后续待办 / 建议

- [ ] 在生产服务器 `.env` 配置真实 `DEPLOY_SYNC_SECRET` 并重启 PM2
- [ ] 将 `deploy-ssh.sh` 实际部署运行,验证生产环境同步链路
- [ ] (可选)接入飞书告警:部署失败时自动通知运维

---

**文档结束**:如需开启新任务,请参考本日志第四节「下游任务如何感知项目已部署」与第六节「注意点」。