# 丹青有AI — P2 优化文档

> **生成时间**: 2026-08-03 03:30 (GMT+8)
> **基线**: P1 已上线(commit `a26cec7`, https://www.danqing.site)
> **依据**: 生产端到端只读测试 + 服务器配置审查 + 代码审查
> **约束**: 所有写操作前必须只读诊断 + 用户确认;3 秒 SLA 不破;不破坏现有框架

---

## 一、P2 问题清单(本次发现,需修复)

### P2-1 ⚠️ Nginx 静态资源未启用 gzip 压缩(JS/CSS)

- **现象**:
  - `/assets/index-Dtjdn0ng.js` 原始 316 KB,无 `Content-Encoding: gzip` 头
  - `/assets/index-ByYS69dT.css` 原始 56 KB,无 `Content-Encoding: gzip` 头
  - `/etc/nginx/nginx.conf` 中 `gzip on;` 已启用,但 `gzip_types` 行被注释,默认仅压缩 `text/html`
- **影响**:
  - 首屏 JS 下载量从 ~80 KB(gzip)涨到 316 KB,~4x 流量浪费
  - 移动端 4G 网络下首屏 LCP 退化 ~300-500ms
  - 违反 V2 任务包 D 验收标准("Bundle 主 chunk ≤300KB gzipped")
- **修复**: 编辑 `/etc/nginx/nginx.conf` http 块,取消注释并补全:
  ```nginx
  gzip_vary on;
  gzip_proxied any;
  gzip_comp_level 6;
  gzip_buffers 16 8k;
  gzip_http_version 1.1;
  gzip_min_length 1024;
  gzip_types
      text/plain
      text/css
      text/xml
      text/javascript
      application/javascript
      application/x-javascript
      application/json
      application/xml
      application/xml+rss
      image/svg+xml;
  ```
- **预期收益**: JS 316KB→~80KB(75%↓),CSS 56KB→~12KB(78%↓),首屏 LCP -300ms
- **风险**: 低;`nginx -t && systemctl reload nginx` 平滑重载,不断连接

### P2-2 ⚠️ Nginx 静态资源缺失 Cache-Control 头

- **现象**:
  - `/assets/index-Dtjdn0ng.js` 响应头仅有 `Last-Modified` + `ETag`,无 `Cache-Control`
  - `/index.html` 同样无 `Cache-Control`
  - 生产 Nginx 配置(`/etc/nginx/conf.d/danqing.conf`)未配置 `expires` 或 `add_header Cache-Control`
- **影响**:
  - 浏览器无法长缓存 hashed 静态资源,每次访问都发条件请求(200/304)
  - Vite 已为文件名注入 hash,理论可永久缓存(`immutable`)
  - 移动端反复访问流量浪费明显
- **修复**: 替换 `/etc/nginx/conf.d/danqing.conf` 为仓库内已就绪的 [deploy/nginx.conf](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/deploy/nginx.conf)(已含完整配置),或最小改动版增加:
  ```nginx
  # /assets/* 永久缓存(Vite hash 命名保证内容变更文件名变化)
  location ~* ^/assets/.*\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$ {
      expires 1y;
      add_header Cache-Control "public, immutable";
      access_log off;
  }
  # index.html 不缓存(保证用户拿到最新 hash 引用)
  location = /index.html {
      add_header Cache-Control "no-cache, no-store, must-revalidate";
      expires 0;
  }
  ```
- **预期收益**: 重复访问资源加载 -90%,二级访问 LCP < 500ms

### P2-3 ⚠️ Nginx 静态资源缺失安全响应头

- **现象**:
  - `/`(HTML)和 `/assets/*` 响应仅有 `Server / Date / Content-Type / Last-Modified / ETag`,无 HSTS / X-Frame-Options / CSP / X-Content-Type-Options 等
  - API 路径(`/api/*`)经过 Helmet 中间件,安全头齐全 ✓
  - 根因:`/etc/nginx/conf.d/danqing.conf` 简化版未 `add_header` 任何安全头
- **影响**:
  - SPA HTML 可被嵌入 iframe(点击劫持风险)
  - 浏览器无 HSTS 提示(虽然 API 子路径有,但 HTML 入口没有)
  - MIME 嗅探攻击面扩大
- **修复**: 在 Nginx server 块添加(参考 `deploy/nginx.conf` L34-37):
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Permitted-Cross-Domain-Policies "none" always;
  # 注意:HTML 不需要 CSP(由 Helmet 在 API 层管控),静态资源无脚本注入面
  ```
- **风险**: 低;`always` 确保所有响应码都带这些头

### P2-4 ⚠️ HTTP(80 端口)外网不可达,跳转链路断

- **现象**:
  - 服务器本地 `curl http://localhost/` → 404(配置存在但 host 不匹配)
  - 公网 `curl http://www.danqing.site/` → 连接超时(5s+)
  - `ss -tlnp` 显示 nginx 监听 0.0.0.0:80 ✓
  - iptables 自定义链 `YJ-FIREWALL-INPUT`(腾讯云安全组)处理所有 INPUT
  - UFW 状态 inactive
- **影响**:
  - 用户输入 `http://www.danqing.site` 或浏览器自动补全 `http://` 时,5s 超时无响应
  - 影响首次访问体验,SEO 爬虫 HTTP 抓取失败
- **根因**: 腾讯云安全组未放行 80 端口入站
- **修复**:
  1. **首选**(基础设施层):腾讯云控制台 → 安全组 → 添加入站规则 TCP:80 允许
  2. **备选**(应用层):若不便修改安全组,在 Nginx 80 端口 server 块改 `return 301 https://$host$request_uri;`(当前已配置 `if ($host = www.danqing.site)`,但因 80 不通外网,无法生效)
- **预期收益**: HTTP 用户 5s 超时 → 301ms 跳转 HTTPS

### P2-5 ⚠️ API 响应未启用 gzip 压缩

- **现象**:
  - `/api/v1/health` 响应 136 字节,`Vary: Origin` 有但无 `Content-Encoding`
  - 大响应(通知列表、分析历史、统计接口)未压缩
- **影响**:
  - API 响应 > 1KB 时流量浪费
  - AI 用量统计接口(`overview`/`trend`)返回 JSON 可能 5-20KB,移动端可观
- **修复**: 后端 `server/src/index.ts` 启用 `compression` 中间件,或在 Nginx `location /api/` 块加 `gzip on`(Nginx 反代时压缩响应)
  - **Nginx 方案**(推荐,无需改代码):在 `location /api/` 内添加 `gzip on; gzip_types application/json;`
  - **Express 方案**:`npm i compression && app.use(compression())`(仅对 1.4+KB 响应压缩)
- **预期收益**: API 大响应压缩 60-80%

### P2-6 ⚠️ traceId 在 body 解析错误时为 "unknown"

- **现象**:
  - 发送畸形 JSON(`{not valid json`)→ `{"code":1001,"message":"请求体 JSON 格式错误","data":null,"traceId":"unknown"}` HTTP 400
  - 正常请求 → traceId 为 UUID
- **根因**: trace 中间件挂在 body parser 之后,body parser 失败时 trace 中间件未执行,使用默认值 `"unknown"`
- **影响**:
  - 排查 body 解析错误时无法通过 traceId 关联日志
  - 安全审计链路断裂(畸形 body 可能是攻击,反而丢失追踪)
- **修复**: 调整中间件顺序,trace 中间件移到 body parser 之前,或 body parser 错误处理器中生成 traceId 写入 req
  - 文件:`server/src/index.ts` 中间件链路
  - 方案:`app.use(traceMiddleware)` 移到 `app.use(express.json())` 之前;或在 express.json 错误处理分支中 `req.traceId = randomUUID()`
- **风险**: 低;trace 中间件不依赖 body,顺序提前无副作用

### P2-7 ⚠️ Nginx `server_tokens` 未关闭,版本号泄露

- **现象**: 所有响应头 `Server: nginx/1.18.0 (Ubuntu)`
- **影响**: 攻击者可针对性利用 nginx 1.18.0 已知 CVE
- **修复**: `/etc/nginx/nginx.conf` http 块添加 `server_tokens off;`(当前为注释状态)
- **预期**: `Server: nginx`(版本号隐藏)

---

## 二、P2 待优化项(来自 V2 任务包,部分已完成)

### V2-C 全局交互体验打磨 — 部分完成

| 子项 | 状态 | 说明 |
|------|------|------|
| Toast 进度条 + 统一动画 | ⚠️ 待验证 | 需浏览器实际操作确认 |
| 骨架屏 `PageSkeleton` 统一 | ⚠️ 待验证 | 懒加载页面应已使用 |
| 空状态 `EmptyState` 统一 | ⚠️ 待验证 | 列表页空状态应有插画+操作引导 |
| ErrorBoundary 重试按钮 | ⚠️ 待验证 | 控制台错误上报 |
| 路由切换淡入动画(300ms) | ⚠️ 待验证 | 可能需引入 `framer-motion` 或 `react-transition-group` |
| 按钮加载状态 Spinner + 文字 | ⚠️ 待验证 | 现有 Loading 统一性 |

**建议**: 启动 `frontend-app` agent 在本地浏览器逐页操作验证,补充缺失的 UX 细节

### V2-D 性能优化 — 部分完成

| 子项 | 状态 | 说明 |
|------|------|------|
| Bundle 分析 | ⚠️ 待执行 | `vite build --report` 或 `rollup-plugin-visualizer` |
| 图片懒加载 | ⚠️ 待验证 | `<img loading="lazy">` 应已添加 |
| 虚拟列表(历史 >50 条) | ⚠️ 待验证 | `HistoryPage.tsx` 是否引入虚拟滚动 |
| React.memo 优化 | ⚠️ 待审计 | 纯展示组件应包裹 memo |
| useMemo/useCallback | ⚠️ 待审计 | expensive 计算优化 |
| 侧栏 hover 预加载 | ⚠️ 待验证 | 鼠标 hover 时 prefetch chunk |
| CSS 优化 | ⚠️ 待审计 | 未使用 Tailwind 类清理 |
| **JS Bundle 316KB**(超 300KB 目标) | ❌ 不达标 | gzip 后 ~80KB 达标,但 raw 超标 |

**关键差距**:
- Bundle raw 316KB > 目标 300KB(虽然 gzip 后达标,但首屏解析仍偏大)
- 建议引入 `vite-plugin-visualizer` 分析依赖占比,考虑:
  - `recharts` 按需引入(目前 60+ KB)
  - `lucide-react` tree-shaking 验证
  - 路由级 code splitting 强化(已用 React.lazy 但需验证)

### V2-E 测试覆盖 — 部分完成

| 子项 | 状态 | 说明 |
|------|------|------|
| 组件单测(Header/Sidebar/LogoMark/Toast/ErrorBoundary) | ⚠️ 待审计 | 现有 680+ 用例分布需确认 |
| 页面测试(HomePage/HistoryPage) | ⚠️ 待审计 | 关键交互测试覆盖 |
| 集成测试(命令面板/快捷键/通知) | ⚠️ 待审计 | 端到端交互测试 |
| TypeScript strict 零错误 | ✅ 通过 | `tsc --noEmit` 零错误(已验证) |
| ESLint 零 warning | ⚠️ 待验证 | 需运行 `npm run lint` 确认 |
| 无障碍 `aria-label` | ⚠️ 待审计 | 交互元素键盘可达性 |
| 测试覆盖率 ≥70% | ⚠️ 待验证 | `vitest run --coverage` |

---

## 三、P3 长期优化建议(来自项目日志)

### P3-1 移动端 App(Phase 3 Extension)

- **目标**: React Native iOS/Android App
- **核心场景**: 拍照上传、连拍、批量提交、离线草稿同步
- **复用**: 后端 API 已就绪(`/api/v1/analyses` 等),飞书 SDK 移动端集成
- **建议**: 启动 `mobile-app` agent 进行原型开发

### P3-2 AI 生产化启用

- **现状**: 生产 `AI_ENABLED=false`,AI_API_KEY 为占位符,所有分析走 Jimp fallback(模板规则)
- **目标**: 替换为真实 GLM-4V API Key,启用 `AI_ENABLED=true`
- **依赖**:
  1. 申请 GLM-4V 商用 API Key(智谱开放平台)
  2. 评估免费 10 RPM 配额是否够用,需升级到付费版
  3. 监控 `ai_usage_logs` 表用量,设置成本告警
- **风险**: 3 秒 SLA 在网络抖动时可能被打破,需强化 timeout 与 fallback

### P3-3 多租户管理 UI

- **现状**: 后端 `/api/admin/system/tenants` 已就绪,admin 后端有 16 页面骨架
- **缺失**: 院校级成员邀请、角色管理、配额管理界面
- **建议**: 启动 `admin-dashboard` agent 完善管理后台

### P3-4 性能基准测试

- **缺失**: `server/performance/k6/` 目录未实施
- **目标**:
  - AI 分析接口 p95 < 3s
  - 通知列表 p95 < 200ms
  - 历史记录列表 p95 < 300ms
  - 并发 100 用户无错误
- **建议**: 启动 `performance-expert` agent 编写 k6 脚本

### P3-5 Apex 域名(danqing.site)支持

- **现状**: Nginx `server_name` 仅配置 `www.danqing.site`
- **影响**: `https://danqing.site` 通过默认 server fallback 工作,但 SSL 证书匹配的是 `www.danqing.site`,严格校验的浏览器可能警告
- **修复**:
  - 申请包含 apex 的证书(`danqing.site` + `www.danqing.site` SAN)
  - 或 Nginx 配置 301 跳转 `danqing.site → www.danqing.site`

### P3-6 监控告警体系

- **现状**: 仅 PM2 进程监控 + 每分钟 health check cron
- **缺失**:
  - API 错误率告警(5xx > 1%)
  - AI 分析超时告警(> 3s)
  - 数据库连接池告警
  - 磁盘空间告警(< 20%)
  - Redis 内存告警
- **建议**: 接入 Prometheus + Grafana 或腾讯云云监控

---

## 四、修复优先级与执行计划

| 优先级 | 编号 | 项目 | 影响 | 复杂度 | 建议时机 |
|--------|------|------|------|--------|----------|
| **P2-High** | P2-4 | HTTP 80 外网不可达 | UX 严重 | 低(改安全组) | 立即 |
| **P2-High** | P2-1 | Nginx gzip 未启用 | 性能严重 | 低(改 nginx.conf) | 立即 |
| **P2-High** | P2-2 | 静态资源 Cache-Control | 性能中 | 低(改 nginx.conf) | 立即 |
| **P2-High** | P2-3 | 静态资源安全头 | 安全中 | 低(改 nginx.conf) | 立即 |
| **P2-Med** | P2-5 | API 响应 gzip | 性能中 | 低(Nginx 或 Express) | 短期 |
| **P2-Med** | P2-6 | traceId "unknown" | 可观测性 | 中(改代码) | 短期 |
| **P2-Low** | P2-7 | server_tokens 泄露 | 安全低 | 极低(改 nginx.conf) | 短期 |

### 推荐执行顺序

**第 1 批:服务器配置(无需改代码,无停机)**
1. P2-1 + P2-2 + P2-3 + P2-7:一次性更新 `/etc/nginx/nginx.conf` 和 `/etc/nginx/conf.d/danqing.conf`
2. P2-4:腾讯云安全组放行 80 端口
3. 验证:`curl -I https://www.danqing.site/assets/index-Dtjdn0ng.js` 检查 gzip + cache + 安全头

**第 2 批:后端代码(需重启 PM2,~1s 中断)**
1. P2-6:调整中间件顺序修复 traceId
2. 部署:`pm2 reload danqing-api`(零停机)
3. 验证:发送畸形 JSON,检查 traceId 是否为 UUID

**第 3 批:API gzip(可选)**
1. P2-5:Nginx 反代层 gzip API 响应
2. 验证:`curl -sH 'Accept-Encoding: gzip' -I https://www.danqing.site/api/v1/health` 含 `Content-Encoding: gzip`

---

## 五、验收清单

### 服务器配置层(第 1 批)
- [ ] `curl -sI -H 'Accept-Encoding: gzip' https://www.danqing.site/assets/index-Dtjdn0ng.js` 含 `Content-Encoding: gzip`
- [ ] JS 响应 `Content-Length` 从 316307 降至 ~80000(gzip 后)
- [ ] `/assets/*` 含 `Cache-Control: public, immutable` 与 `expires 1y`
- [ ] `/index.html` 含 `Cache-Control: no-cache`
- [ ] HTML/JS/CSS 含 `Strict-Transport-Security` / `X-Frame-Options: DENY` / `X-Content-Type-Options: nosniff`
- [ ] `Server` 头不含版本号
- [ ] `curl -I http://www.danqing.site/` 返回 `301` + `Location: https://...`

### 后端代码层(第 2 批)
- [ ] 畸形 JSON 请求返回的 traceId 为 UUID 格式
- [ ] 现有 839 后端测试全绿
- [ ] PM2 reload 后 `/health` 200
- [ ] 错误日志无新报错

### 性能指标
- [ ] 首屏 LCP < 1.5s(移动端 4G 模拟)
- [ ] 二级访问 LCP < 500ms(缓存命中)
- [ ] API 响应 p95 < 200ms(健康检查除外)
- [ ] AI 分析 p95 < 3s

---

## 六、回滚方案

| 改动 | 回滚方式 |
|------|----------|
| Nginx 配置 | `sudo cp /etc/nginx/conf.d/danqing.conf.bak /etc/nginx/conf.d/danqing.conf && sudo nginx -t && sudo systemctl reload nginx` |
| Nginx 主配置 | `sudo cp /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf && sudo systemctl reload nginx` |
| 后端 traceId 修复 | `git revert <commit> && cd server && npm run build && pm2 reload danqing-api` |
| 安全组 80 端口 | 腾讯云控制台移除入站规则 |

**回滚铁律**:任何改动前先 `sudo cp <file> <file>.bak.$(date +%Y%m%d_%H%M%S)`,出问题立即还原 + reload

---

**附**:本计划所有诊断证据见同目录 `test-report-20260803.md`
