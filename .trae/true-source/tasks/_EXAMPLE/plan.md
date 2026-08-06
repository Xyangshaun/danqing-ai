# 执行步骤 — TASK-0001 VPS 部署架构落地

> 本文件记录任务的详细执行步骤与进度。每次步骤完成必须更新状态标记与完成时间。

**任务 ID**:TASK-0001
**总步骤数**:6
**已完成步骤数**:1
**当前进度**:1/6 (17%)

---

## 一、执行步骤

| # | 步骤描述 | 产出物 | 预计耗时 | 状态 | 完成时间 |
| --- | --- | --- | --- | --- | --- |
| 1 | 准备部署资源(SSL 证书、构建产物) | SSL 证书文件 + website/out + dist/ | 1h | [x] | 2026-08-04 14:30 |
| 2 | 上传 SSL 证书到 VPS | /etc/nginx/ssl/danqing-ai.crt + .key | 0.5h | [~] | — |
| 3 | 创建官网目录并上传产物 | /var/www/danqing-ai/website/ | 0.5h | [ ] | — |
| 4 | 上传业务应用产物 | /var/www/danqing-ai/dist/ | 0.5h | [ ] | — |
| 5 | 部署 nginx 配置并验证 | /etc/nginx/conf.d/danqing.conf | 0.5h | [ ] | — |
| 6 | 全链路验收测试 | 验收测试报告 | 1h | [ ] | — |

**当前进度**:1/6 (17%)
**预计剩余**:3h

---

## 二、步骤详情

### 步骤 1:准备部署资源 ✅

**执行内容**:
- 构建 website 静态产物:`cd website && npm run build`(output: 'export')
- 构建 Web 应用产物:`npm run build`(vite build)
- 准备 SSL 证书文件(已有)

**产出物**:
- `website/out/`(官网静态产物)
- `dist/`(业务应用产物,21 assets)
- SSL 证书文件 `danqing-ai.crt` + `danqing-ai.key`

**实际耗时**:1h
**完成时间**:2026-08-04 14:30

---

### 步骤 2:上传 SSL 证书到 VPS 🔄

**执行内容**:
- 通过 SCP 上传 SSL 证书到 VPS
- 命令:`scp danqing-ai.crt danqing-ai.key root@43.128.25.202:/etc/nginx/ssl/`
- 验证:在 VPS 上 `ls -la /etc/nginx/ssl/`

**前置条件**:VPS SSH 可达 + `/etc/nginx/ssl/` 目录存在(若不存在需 `mkdir -p`)

**预计耗时**:0.5h
**当前状态**:进行中

---

### 步骤 3:创建官网目录并上传产物

**执行内容**:
- 在 VPS 创建官网目录:`ssh root@VPS 'mkdir -p /var/www/danqing-ai/website'`
- 上传官网产物:`scp -r website/out/* root@VPS:/var/www/danqing-ai/website/`
- 验证:`ssh root@VPS 'ls /var/www/danqing-ai/website/index.html'`

**预计耗时**:0.5h

---

### 步骤 4:上传业务应用产物

**执行内容**:
- 上传业务应用产物:`scp -r dist/* root@VPS:/var/www/danqing-ai/dist/`
- 验证:`ssh root@VPS 'ls /var/www/danqing-ai/dist/index.html'`
- 设置权限:`ssh root@VPS 'chown -R www-data:www-data /var/www/danqing-ai/'`

**预计耗时**:0.5h

---

### 步骤 5:部署 nginx 配置并验证

**执行内容**:
- 上传 nginx 配置:`scp deploy/nginx-site.conf root@VPS:/etc/nginx/conf.d/danqing.conf`
- 腾讯云安全组放行 80 端口(手动操作)
- 在 VPS 验证配置语法:`ssh root@VPS 'nginx -t'`
- 重载 nginx:`ssh root@VPS 'systemctl reload nginx'`

**预计耗时**:0.5h

---

### 步骤 6:全链路验收测试

**执行内容**:
- HTTPS 访问测试:`curl -I https://www.danqing.site/`(期望 200)
- 业务应用访问测试:`curl -I https://www.danqing.site/app/`(期望 200)
- HTTP 跳转测试:`curl -I http://www.danqing.site/`(期望 301)
- gzip 压缩测试:`curl -sI -H 'Accept-Encoding: gzip' https://www.danqing.site/app/assets/*.js`(期望 Content-Encoding: gzip)
- 安全头测试:验证 HSTS / X-Frame-Options / nosniff / Referrer-Policy
- 隐藏版本号:验证 Server 头不含版本号

**预计耗时**:1h

---

## 三、阻塞点与待决问题

| # | 阻塞点 | 影响步骤 | 预计解除 | 解决方案 |
| --- | --- | --- | --- | --- |
| 1 | 需 SSH 到腾讯云 VPS 执行,本地无法完成 | 步骤 2-6 | 待 SSH 连接 | 通过 PowerShell ssh/scp 远程执行 |

---

## 四、进度变更历史

| 时间 | 步骤 | 变更 | 操作人 |
| --- | --- | --- | --- | --- |
| 2026-08-04 14:00 | - | 任务启动,状态从 PENDING → IN_PROGRESS | devops-qa |
| 2026-08-04 14:30 | 1 | 步骤 1 完成 | devops-qa |
| 2026-08-04 14:45 | 2 | 步骤 2 开始执行 | devops-qa |
