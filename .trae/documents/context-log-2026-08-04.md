# 丹青有AI 项目方向校准上下文日志

> **文档用途**:记录 2026-08-04 项目方向校准全过程,包括偏差分析、调整措施、执行结果和一致性验证,供后续新任务衔接使用。
>
> **生成时间**:2026-08-04
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`
> **触发原因**:前期开发优化工作偏离项目既定方向(官网独立部署,未与主应用挂载)

---

## 一、偏差分析完整报告

### 1.1 偏差点清单与严重程度

| # | 偏差点 | 严重程度 | 影响范围 |
|---|--------|---------|---------|
| 1 | 官网独立部署到 GitHub Pages,未与主应用挂载 | 🔴 致命 | 用户访问 www.danqing.site 看不到官网 |
| 2 | P2 服务端配置修复完全未实施(gzip/HTTPS/安全头等) | 🔴 致命 | 生产性能与安全不达标 |
| 3 | deploy-gh-pages.cjs 错误推送 dist/(主应用)而非官网 | 🔴 致命 | 部署逻辑错误 |
| 4 | QA 工作覆盖 prototype/(非产品代码),未覆盖生产代码 | 🟡 中等 | QA 资源浪费 |
| 5 | P3 任务分散在 mobile/admin,与核心目标脱节 | 🟡 中等 | 优先级偏差 |
| 6 | nginx-site.conf 过度简化(27行,无生产配置) | 🔴 致命 | 无 HTTPS/缓存/安全头 |

### 1.2 功能差异分析

**已开发但偏离核心方向的功能**:
- prototype/ HTML 原型修复(非产品代码,无生产价值)
- Mobile 拍照上传/飞书登录(P3-1.3/1.4,非比赛复赛核心)
- Admin 配额管理/角色权限(P3-3.3/3.4,非比赛评审重点)

**需求中要求但缺失的功能**:
- 官网与主应用一体化挂载(用户核心诉求,完全缺失)
- HTTPS 安全访问(生产基本要求,无 443 配置)
- gzip 压缩(P2-1 计划,未实施)
- 静态资源缓存(P2-2 计划,未实施)
- 安全响应头(P2-3 计划,未实施)
- HTTP→HTTPS 跳转(P2-4 计划,80 端口不通)

### 1.3 进度偏差评估

| 任务项 | 计划状态 | 实际状态 | 偏差 |
|--------|---------|---------|------|
| 官网一体化挂载 | 应已完成 | ❌ 未开始 | 🔴 滞后致命 |
| P2 服务端配置 | 08-03 完成 | ❌ 7项全未做 | 🔴 滞后致命 |
| HTTPS 部署 | 生产基本要求 | ❌ 无 443 | 🔴 滞后致命 |
| QA 最终报告 | 06-verify 已完成 | ⏳ 待创建 | 🟡 滞后 |
| P3 代码提交 | 应已提交 | ⏳ 5项未提交 | 🟡 有丢失风险 |

### 1.4 偏差原因

1. **需求理解偏差(主因)**:`.trae/agents/04-marketing-website.md` 将官网定义为"独立部署 GitHub Pages",与用户真实诉求"官网+使用入口一体化"根本冲突
2. **技术决策失误**:`deploy-gh-pages.cjs` 错误推送主应用而非官网;`nginx-site.conf` 过度简化
3. **资源分配问题**:QA 精力投入 prototype/ 修复;P3 优先开发 mobile/admin 扩展,忽视生产部署优化
4. **沟通协调不足**:agent 配置文档与用户诉求长期不一致,未及时校准

---

## 二、调整措施实施步骤与执行结果

### 2.1 用户确认的调整方案

| 决策项 | 选择 |
|--------|------|
| 官网部署架构 | 官网在根路径 /,业务应用移至 /app |
| prototype/ QA | 终止,转向生产代码验证 |
| P3 代码 | 立即提交 |
| 执行优先级 | 立即执行部署架构调整+P2配置 |

### 2.2 执行步骤与结果

#### 步骤 1:P3 代码提交 ✅
- **操作**:`git add` admin/mobile/server 相关文件 + `git commit`
- **结果**:commit `5905b93`,64 文件,25595 insertions
- **包含**:P3-3.3 权限矩阵/P3-3.4 配额管理/P3-1.2 移动端导航/P3-1.3 拍照上传/P3-1.4 飞书登录

#### 步骤 2:nginx 配置重构 ✅
- **文件**:[deploy/nginx-site.conf](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/deploy/nginx-site.conf)
- **变更**:27 行 → 177 行,完整重构
- **新增**:
  - HTTP 80 → HTTPS 301 跳转
  - HTTPS 443 SSL 配置(TLSv1.2/1.3)
  - 官网挂载 `/` → `/var/www/danqing-ai/website/`
  - 业务应用挂载 `/app` → `/var/www/danqing-ai/dist/`
  - API 反代 `/api/` → `127.0.0.1:3000`
  - gzip 压缩(P2-1 修复)
  - 静态资源 Cache-Control(P2-2 修复)
  - 安全响应头 HSTS/X-Frame-Options 等(P2-3 修复)
  - API gzip 压缩(P2-5 修复)
  - server_tokens off(P2-7 修复)

#### 步骤 3:Vite 配置调整 ✅
- **文件**:[vite.config.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/vite.config.ts)
- **变更**:`base: '/'` → `base: '/app/'`
- **原因**:业务应用移至 /app 路径,静态资源路径需适配

#### 步骤 4:官网 CTA 路径修正 ✅
- **文件**:[website/lib/site.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/website/lib/site.ts)
- **变更**:
  - `appUrl`: `https://www.danqing.site` → `https://www.danqing.site/app`
  - `CTA_LINKS.trial`: `https://www.danqing.site/` → `https://www.danqing.site/app/`

#### 步骤 5:OAuth 回调路径适配 ✅
- **文件**:[src/main.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/src/main.tsx)
- **变更**:
  - 回调路径检测增加 `/app/auth/feishu/callback`(兼容旧路径)
  - 跳转首页路径 `'/#/'` → `'/app/#/'`

#### 步骤 6:Agent 配置文档修正 ✅
- **文件**:[.trae/agents/04-marketing-website.md](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/.trae/agents/04-marketing-website.md)
- **变更**:官网定位从"独立 GitHub Pages 部署"改为"VPS 一体化部署,根路径 /,业务应用 /app"

#### 步骤 7:部署脚本废弃 ✅
- **文件**:[deploy-gh-pages.cjs](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/deploy-gh-pages.cjs)
- **变更**:标记为废弃,添加 VPS 部署流程说明

#### 步骤 8:提交部署架构调整 ✅
- **操作**:`git commit`
- **结果**:commit `3292e6d`,6 文件,214 insertions

### 2.3 调整后部署架构

```
                    腾讯云 VPS(43.128.25.202,1Panel 管理)
┌──────────────────────────────────────────────────────────────────┐
│  Nginx(443/HTTPS,80→301跳转)                                    │
│  ├─→ /              → 官网静态文件(/var/www/danqing-ai/website/)  │
│  ├─→ /app           → 业务 Web 应用(/var/www/danqing-ai/dist/)    │
│  ├─→ /api/v1/       → Node.js(:3000,PM2 fork)                    │
│  ├─→ /api/admin/    → 同上                                        │
│  ├─→ /uploads/      → COS 挂载目录                                │
│  └─→ /health        → Node.js 健康检查                            │
│                                                                   │
│  P2 配置已实施:                                                   │
│  ✅ gzip 压缩(JS/CSS/JSON/SVG)                                  │
│  ✅ Cache-Control(静态资源 immutable 1y,HTML no-cache)          │
│  ✅ 安全头(HSTS/X-Frame-Options/nosniff/Referrer-Policy)        │
│  ✅ server_tokens off                                            │
│  ✅ API gzip 压缩                                                │
│  ✅ HTTP→HTTPS 301 跳转                                          │
│                                                                   │
│  Node.js 20 LTS(PM2:danqing-api)                                │
│  Docker(PostgreSQL 15 + Redis 7,绑定 127.0.0.1)                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、同步后一致性验证结果

### 3.1 项目目标对齐验证

| 项目目标 | 调整前状态 | 调整后状态 | 一致性 |
|---------|-----------|-----------|--------|
| 官网+使用入口一体化 | ❌ 官网独立 GitHub Pages | ✅ 官网在 /,业务应用在 /app | ✅ 一致 |
| 生产 HTTPS 访问 | ❌ 仅 80 端口 | ✅ 443 SSL + 80→301 | ✅ 一致 |
| P2 性能配置 | ❌ 7项全未做 | ✅ 6项已配置(80端口放行待VPS操作) | ✅ 基本一致 |
| P2 安全配置 | ❌ 无安全头 | ✅ HSTS/X-Frame-Options 等 | ✅ 一致 |
| 部署脚本正确性 | ❌ 错误推送 dist/ | ✅ 废弃,改 VPS 部署 | ✅ 一致 |
| Agent 文档准确性 | ❌ 官网定位错误 | ✅ 修正为 VPS 一体化 | ✅ 一致 |

### 3.2 待 VPS 操作项(本地无法完成)

以下操作需要在腾讯云 VPS(43.128.25.202)上执行:

1. **上传 SSL 证书**:`/etc/nginx/ssl/danqing-ai.crt` 和 `.key`
2. **创建官网目录**:`mkdir -p /var/www/danqing-ai/website`
3. **上传官网产物**:`scp -r website/out/* root@VPS:/var/www/danqing-ai/website/`
4. **上传业务应用产物**:`scp -r dist/* root@VPS:/var/www/danqing-ai/dist/`
5. **部署 nginx 配置**:`cp deploy/nginx-site.conf /etc/nginx/conf.d/danqing.conf`
6. **放行 80 端口**:腾讯云安全组添加 TCP:80 入站规则
7. **测试并重载**:`nginx -t && systemctl reload nginx`
8. **飞书 OAuth 回调 URL 更新**:飞书开放平台改为 `https://www.danqing.site/app/auth/feishu/callback`

### 3.3 代码提交记录

| Commit | 说明 | 文件数 |
|--------|------|--------|
| `5905b93` | feat(P3): 提交P3阶段5项子任务代码 | 64 |
| `3292e6d` | refactor(部署): 官网与业务应用一体化部署架构调整 | 6 |

---

## 四、新任务计划与验收标准

### 4.1 复赛冲刺任务(08-04 ~ 08-09)

| 优先级 | 任务 | 验收标准 | 预估 |
|--------|------|---------|------|
| P0 | VPS 部署架构落地 | nginx 配置上传+SSL 证书+官网/业务应用产物上传 | Day 1 |
| P0 | 飞书 OAuth 回调更新 | 飞书开放平台回调 URL 改为 /app/auth/feishu/callback | Day 1 |
| P0 | 全链路验证 | 官网访问→CTA→/app→登录→AI 诊断 流程跑通 | Day 2 |
| P1 | QA 最终报告 | qa/07-final-report.md 创建,覆盖生产代码 | Day 3 |
| P1 | React Router basename 验证 | 确认 HashRouter 在 /app 路径下正常工作 | Day 2 |
| P2 | 官网内容完善 | 官网所有 CTA 跳转 /app,无死链 | Day 3 |
| P2 | 性能验证 | Lighthouse 评分≥90,LCP<2s | Day 4 |

### 4.2 验收标准

**部署验收**:
- [ ] `curl -I https://www.danqing.site/` 返回 200 + 官网 HTML
- [ ] `curl -I https://www.danqing.site/app/` 返回 200 + 业务应用 HTML
- [ ] `curl -I http://www.danqing.site/` 返回 301 + Location: https://...
- [ ] `curl -sI -H 'Accept-Encoding: gzip' https://www.danqing.site/app/assets/*.js` 含 `Content-Encoding: gzip`
- [ ] 响应头含 `Strict-Transport-Security` / `X-Frame-Options: DENY`
- [ ] `Server` 头不含版本号

**功能验收**:
- [ ] 官网首页正常显示,CTA"立即体验"跳转 /app
- [ ] /app 业务应用正常加载,HashRouter 路由正常
- [ ] 飞书 OAuth 登录流程跑通(回调到 /app/auth/feishu/callback)
- [ ] AI 诊断功能正常(3 秒 SLA)
- [ ] API 接口正常(/api/v1/health 返回 200)

### 4.3 后续规划(复赛后)

| 任务 | 说明 |
|------|------|
| Mobile「我的」Tab 菜单项 | 账号设置/通知/关于(Alert 占位待实现) |
| Mobile Android intentFilters | 显式配置 danqing:// 深链接 |
| Admin 管理后台部署 | /admin/ 路径挂载到 nginx |
| 监控告警体系 | Prometheus + Grafana 或腾讯云云监控 |
| AI 生产化启用 | 真实 GLM-4V API Key + AI_ENABLED=true |

---

## 五、关键约束(新任务必读)

1. **官网 = 根路径 /**,业务应用 = /app(非独立 GitHub Pages)
2. **生产 = 腾讯云 VPS**(43.128.25.202),Nginx + PM2
3. **HTTPS 强制**,80 端口 301 跳转 443
4. **HashRouter + base: '/app/'**,OAuth 回调兼容 /app/auth/feishu/callback 和 /auth/feishu/callback
5. **P2 配置已写入 nginx-site.conf**,需 VPS 部署落地
6. **prototype/ 不再维护**,QA 转向生产代码(src/ + server/)
7. **P3 代码已提交**,无丢失风险

---

**文档结束**:如需开启新任务,请参考本日志第四节的"新任务计划与验收标准"。
