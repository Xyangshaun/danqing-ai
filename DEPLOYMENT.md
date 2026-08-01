# 丹青有AI · 四端部署文档

> 本文档覆盖 server / src / admin / website 四端的完整部署流程,所有配置可直接复制使用。
> 适用版本:server v3.0.0 / admin v1.0.0 / website v1.0.0 / web v0.0.0
> 维护人:DevOps。最后更新:2026-07-29

---

## 目录

1. [部署架构概览](#1-部署架构概览)
2. [服务器环境准备](#2-服务器环境准备)
3. [后端服务部署(server/)](#3-后端服务部署server)
4. [Web 应用部署(src/)](#4-web-应用部署src)
5. [管理后台部署(admin/)](#5-管理后台部署admin)
6. [品牌官网部署(website/)](#6-品牌官网部署website)
7. [数据库部署](#7-数据库部署)
8. [Redis 部署](#8-redis-部署)
9. [nginx 完整配置](#9-nginx-完整配置)
10. [PM2 配置](#10-pm2-配置)
11. [CI/CD 流程(可选)](#11-cicd-流程可选)
12. [监控与告警](#12-监控与告警)
13. [故障排查](#13-故障排查)
14. [部署检查清单](#14-部署检查清单)

---

## 1. 部署架构概览

### 1.1 架构图

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
                │              nginx 反向代理              │
                │   (单机多 server,SSL 终止 + gzip + 限流) │
                └──────┬──────────┬──────────┬─────────────┘
                       │          │          │
            www.danqing-ai.com    │          │
                       │          │          │
                       ▼          │          │
              ┌──────────────┐    │          │
              │  website/    │    │          │
              │  静态文件    │    │          │
              │ (Next.js)    │    │          │
              └──────────────┘    │          │
                                  │          │
            app.danqing-ai.com    │          │
                       │          │          │
                       ▼          │          │
              ┌──────────────┐    │          │
              │   src/       │    │          │
              │  静态文件    │    │          │
              │ (Vite+React) │    │          │
              └──────────────┘    │          │
                                  │          │
           admin.danqing-ai.com   │          │
                                  │          ▼
                                  │   ┌──────────────────┐
                                  │   │   admin/         │
                                  │   │  静态文件        │
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
            │  数据持久化  │  │  state/限流  │
            │  WAL 归档    │  │  AOF+RDB     │
            └──────────────┘  └──────────────┘
```

### 1.2 域名规划

| 域名 | 端 | 部署形式 | 访问控制 |
|------|----|----|------|
| `api.danqing-ai.com` | server/ | Node.js 进程(PM2 托管) | 公网,通过 CORS 白名单限制来源 |
| `app.danqing-ai.com` | src/ | 静态文件(nginx) | 公网 |
| `admin.danqing-ai.com` | admin/ | 静态文件(nginx) | **仅 IP 白名单 + Basic Auth + 飞书二次验证** |
| `www.danqing-ai.com` | website/ | 静态文件(nginx / Vercel) | 公网 |
| `danqing-ai.com` | - | 301 跳转到 `www.danqing-ai.com` | 公网 |

### 1.3 服务器要求

| 资源 | 最低配置 | 推荐配置 | 说明 |
|------|---------|---------|------|
| CPU | 2 核 | 4 核 | server 主瓶颈为 AI 调用与图像处理 |
| 内存 | 4 GB | 8 GB | PostgreSQL + Redis + Node 共用一台时偏低 |
| 磁盘 | 40 GB SSD | 100 GB SSD | 含 PostgreSQL 数据 + WAL 归档 + 日志 |
| 带宽 | 5 Mbps | 10 Mbps | 上传图片为主,需上行带宽 |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | 全部命令以 Ubuntu 为准 |

> 生产环境推荐拆分:1 台应用服务器(server + nginx + 静态) + 1 台数据库服务器(PostgreSQL + Redis)。

---

## 2. 服务器环境准备

### 2.1 系统更新

```bash
# 以 root 登录后执行
apt update && apt upgrade -y
apt install -y curl wget git vim ufw fail2ban ca-certificates gnupg lsb-release build-essential

# 时区
timedatectl set-timezone Asia/Shanghai
```

### 2.2 安装 Node.js 18 LTS

```bash
# 使用 NodeSource 官方源(稳定可靠)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证
node -v   # v18.x.x
npm -v    # 9.x.x

# 切换 npm 镜像(国内服务器)
npm config set registry https://registry.npmmirror.com

# 安装 PM2(全局)
npm install -g pm2@latest
pm2 --version
```

### 2.3 安装 nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
nginx -v   # nginx version: nginx/1.18.x
```

### 2.4 安装 PostgreSQL 15

```bash
# 添加官方 PostgreSQL 源
sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt update
apt install -y postgresql-15

systemctl enable postgresql
systemctl start postgresql
psql --version
```

### 2.5 安装 Redis 7

```bash
curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list
apt update
apt install -y redis
systemctl enable redis-server
systemctl start redis-server
redis-server --version
```

### 2.6 安装 Certbot(Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --version
```

### 2.7 防火墙配置(UFW)

```bash
# 默认拒绝入站
ufw default deny incoming
ufw default allow outgoing

# 开放 SSH(建议改为非默认端口 + 密钥登录)
ufw allow 22/tcp

# 仅开放 80/443,Node 3000 / PG 5432 / Redis 6379 一律不对外
ufw allow 80/tcp
ufw allow 443/tcp

# 启用
ufw enable
ufw status verbose
```

### 2.8 SSH 加固

编辑 `/etc/ssh/sshd_config`:

```sshd_config
# 禁止 root 直接登录
PermitRootLogin no

# 禁用密码登录,仅密钥
PasswordAuthentication no
PubkeyAuthentication yes

# 修改默认端口(可选,与 ufw 规则同步修改)
# Port 22022

# 限制登录用户
AllowUsers ubuntu

# 空闲超时
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
systemctl restart sshd
```

### 2.9 fail2ban 防爆破

```bash
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = 22
maxretry = 5
findtime = 600
bantime = 3600
EOF

systemctl restart fail2ban
systemctl enable fail2ban
fail2ban-client status sshd
```

---

## 3. 后端服务部署(server/)

### 3.1 目录规划

```bash
# 应用代码目录
mkdir -p /opt/danqing-ai
chown -R ubuntu:ubuntu /opt/danqing-ai

# 日志目录(PM2 写入)
mkdir -p /var/log/danqing-ai
chown -R ubuntu:ubuntu /var/log/danqing-ai

# 上传目录(server 运行时 multer 磁盘存储)
mkdir -p /opt/danqing-ai/server/uploads
chown -R ubuntu:ubuntu /opt/danqing-ai/server/uploads
```

### 3.2 拉取代码

```bash
sudo -u ubuntu bash
cd /opt/danqing-ai
git clone <your-git-repo-url> .
# 如果仓库含子目录,本目录即项目根
```

### 3.3 安装依赖与构建

```bash
cd /opt/danqing-ai/server
cp .env.example .env
# 编辑 .env(见 3.4)
npm ci
npm run build            # tsc -p tsconfig.json,输出到 dist/
npx prisma generate      # 生成 Prisma Client
npx prisma migrate deploy # 应用迁移(见第 7 节)
```

### 3.4 .env 完整配置

`/opt/danqing-ai/server/.env`:

```dotenv
# ============================================================
# 丹青有AI 后端 - 生产环境 .env
# 严禁提交真实 .env 到 git,生产环境建议通过 Secret Manager 注入
# ============================================================

# ---------- 运行环境 ----------
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
ENABLE_HSTS=true

# ---------- 飞书 OAuth ----------
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx
# Web 端回调(对应 app.danqing-ai.com)
FEISHU_REDIRECT_URI_WEB=https://app.danqing-ai.com/auth/feishu/callback
# 管理后台回调(对应 admin.danqing-ai.com)
FEISHU_REDIRECT_URI_ADMIN=https://admin.danqing-ai.com/auth/feishu/callback
# 移动端回调(Phase 4)
FEISHU_REDIRECT_URI_MOBILE=https://m.danqing-ai.com/auth/feishu/callback
FEISHU_AUTHZ_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_TOKEN_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
FEISHU_USERINFO_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/user_info

# ---------- JWT(RS256,使用 openssl 生成) ----------
# 生成命令:
#   openssl genrsa -out private.pem 2048
#   openssl rsa -in private.pem -pubout -out public.pem
# 注意:换行必须保留为 \n,否则 Node 解析失败
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...\n-----END PUBLIC KEY-----"
JWT_KEY_ID=danqing-ai-prod-2026-07
JWT_ISSUER=danqing-ai-auth
JWT_AUDIENCE_WEB=danqing-ai-web
JWT_AUDIENCE_ADMIN=danqing-ai-admin
JWT_AUDIENCE_MOBILE=danqing-ai-mobile
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ---------- Cookie / CSRF(生产) ----------
COOKIE_SECURE=true
COOKIE_DOMAIN=.danqing-ai.com
COOKIE_SAMESITE=lax
COOKIE_PATH=/api/v1/auth
COOKIE_MAX_AGE=604800

# ---------- 基础设施 ----------
# 同机部署用 127.0.0.1,跨机部署用内网 IP
DATABASE_URL=postgresql://danqing:DANQING_STRONG_PASSWORD@127.0.0.1:5432/danqing?schema=public&connection_limit=20
REDIS_URL=redis://:REDIS_STRONG_PASSWORD@127.0.0.1:6379/0

# ---------- CORS 白名单(逗号分隔,禁止 *) ----------
CORS_ORIGINS=https://app.danqing-ai.com,https://admin.danqing-ai.com,https://www.danqing-ai.com,https://danqing-ai.com

# ---------- 限流(次/分钟) ----------
RATE_LIMIT_AUTH_PER_MIN=10
RATE_LIMIT_CALLBACK_PER_MIN=5
RATE_LIMIT_REFRESH_PER_MIN=20
RATE_LIMIT_API_PER_MIN=60

# ---------- 租户默认值 ----------
TENANT_DEFAULT_PLAN=free
TENANT_DEFAULT_TYPE=individual

# ---------- 文件上传 ----------
UPLOAD_DIR=uploads
UPLOAD_MAX_SIZE=10485760

# ---------- AI 视觉分析(Phase 2) ----------
# 总开关,生产环境手动开启
AI_ENABLED=false
# 智谱 API Key,获取地址:https://open.bigmodel.cn/usermanage/apikey
AI_API_KEY=
AI_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
# 硬性 2500ms 保障 3 秒 SLA
AI_API_TIMEOUT=2500
AI_API_MODEL=glm-4v-flash
```

> 环境变量校验由 `server/src/config/env.ts` 的 `initEnv()` 在启动时强制执行,缺失任一必填项将立即 `process.exit(1)`。

### 3.5 启动(PM2)

```bash
# 在 server/ 目录下创建 ecosystem.config.cjs
cd /opt/danqing-ai/server
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd
# 按提示执行返回的命令,设置开机自启
```

PM2 配置文件见 [第 10 节](#10-pm2-配置)。

### 3.6 健康检查

```bash
# 本地
curl http://127.0.0.1:3000/health
# 期望返回:
# {"code":"SUCCESS","message":"ok","data":{"status":"up","service":"danqing-ai-server","version":"3.0.0",...}}

# 通过 nginx
curl https://api.danqing-ai.com/health
```

### 3.7 日志

```bash
# 实时日志
pm2 logs danqing-ai-server --lines 200

# 错误日志
tail -f /var/log/danqing-ai/server-error.log

# 配置 logrotate(见 3.8)
```

### 3.8 logrotate 配置

`/etc/logrotate.d/danqing-ai`:

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

```bash
# 测试
logrotate -d /etc/logrotate.d/danqing-ai
# 手动触发
logrotate -f /etc/logrotate.d/danqing-ai
```

---

## 4. Web 应用部署(src/)

学生/教师端 Web 应用,React + Vite,`vite.config.ts` 中 `base: './'`,构建产物为完全静态文件,可部署到任意静态托管。

### 4.1 构建步骤

```bash
cd /opt/danqing-ai   # 项目根目录
cp .env.example .env.local

# 编辑 .env.local(见 4.2)
vim .env.local

npm ci
npm run build         # tsc && vite build,输出到 dist/
ls dist/              # index.html assets/ ...
```

### 4.2 .env.local 配置

`/opt/danqing-ai/.env.local`:

```dotenv
# 后端 API Base URL(对应 api-contract-v1.md §1.1)
VITE_API_BASE_URL=https://api.danqing-ai.com/api/v1

# 飞书 OAuth 重定向 URI(必须与 server 的 FEISHU_REDIRECT_URI_WEB 一致)
VITE_FEISHU_REDIRECT_URI=https://app.danqing-ai.com/auth/feishu/callback
```

### 4.3 nginx 配置

```nginx
# /etc/nginx/conf.d/app.danqing-ai.com.conf
server {
    listen 80;
    server_name app.danqing-ai.com;
    # SSL 配置由 certbot 自动注入,见第 9 节
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.danqing-ai.com;

    # SSL(由 certbot --nginx 自动填写实际路径)
    ssl_certificate     /etc/letsencrypt/live/app.danqing-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.danqing-ai.com/privkey.pem;

    root /opt/danqing-ai/dist;
    index index.html;

    # 静态资源长缓存(vite 输出 /assets/*.[hash].js)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # index.html 禁止缓存(SPA 入口)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # SPA 路由 fallback:所有未匹配路径返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 飞书回调路径必须走 SPA(由 React Router 处理)
    location /auth/ {
        try_files $uri /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    access_log /var/log/nginx/app.danqing-ai.com.access.log main;
    error_log  /var/log/nginx/app.danqing-ai.com.error.log warn;
}
```

```bash
nginx -t && systemctl reload nginx
```

### 4.4 部署到 Vercel(替代方案)

项目根已包含 `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

操作步骤:

1. GitHub 仓库导入 Vercel
2. Settings → Environment Variables 添加 `VITE_API_BASE_URL` 与 `VITE_FEISHU_REDIRECT_URI`
3. Deploy
4. 绑定自定义域名 `app.danqing-ai.com`,在 Vercel 自动签发 SSL

### 4.5 GitHub Pages(仅演示用,不推荐生产)

```bash
# 项目根已有 deploy-gh-pages.cjs
node deploy-gh-pages.cjs
```

> GitHub Pages 不支持自定义 https 顶域 + SPA 路由的完美兼容,仅作 demo。

---

## 5. 管理后台部署(admin/)

Ant Design Pro + UmiJS(`@umijs/max`),`hash: true` 哈希路由,构建产物为静态文件。

### 5.1 构建步骤

```bash
cd /opt/danqing-ai/admin
cp .env.example .env
vim .env   # 见 5.2

npm ci
npm run build         # max build,输出到 dist/
ls dist/              # index.html static/ *.js *.css
```

### 5.2 .env 配置

`/opt/danqing-ai/admin/.env`:

```dotenv
# 后端业务应用地址(开发环境代理目标,生产环境不使用代理)
ADMIN_API_TARGET=http://localhost:3000

# 飞书 OAuth 回调地址(需在飞书应用后台注册)
# 此地址必须与 server 的 FEISHU_REDIRECT_URI_ADMIN 一致
FEISHU_REDIRECT_URI=https://admin.danqing-ai.com/auth/feishu/callback
```

> 生产环境构建产物为纯静态,通过 nginx 反向代理 `/api/*` 到后端,无需 `ADMIN_API_TARGET`。

### 5.3 nginx 配置(IP 白名单 + SPA + 反向代理)

```nginx
# /etc/nginx/conf.d/admin.danqing-ai.com.conf
# 定义允许访问管理后台的 IP 白名单
geo $admin_allowed {
    default 0;
    # 公司办公网出口
    1.2.3.0/24 1;
    # 运维人员家庭宽带
    5.6.7.8/32 1;
    # 跳板机内网
    10.0.0.0/8 1;
}

server {
    listen 80;
    server_name admin.danqing-ai.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.danqing-ai.com;

    ssl_certificate     /etc/letsencrypt/live/admin.danqing-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.danqing-ai.com/privkey.pem;

    # ---------- IP 白名单 ----------
    if ($admin_allowed = 0) {
        return 403;
    }

    # ---------- Basic Auth(二次防护) ----------
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd-admin;

    root /opt/danqing-ai/admin/dist;
    index index.html;

    # 静态资源长缓存
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # SPA 路由 fallback(哈希路由不需要 try_files,但仍需兜底)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 飞书回调路径
    location /auth/ {
        try_files $uri /index.html;
    }

    # ---------- 反向代理到后端(管理后台 API) ----------
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Trace-Id        $request_id;

        # 上传上限(与管理后台一致)
        client_max_body_size 10m;

        # 限流(突发 10,平均 30 r/m)
        limit_req zone=admin burst=10 nodelay;
    }

    # 安全头
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.danqing-ai.com; frame-ancestors 'none';" always;

    access_log /var/log/nginx/admin.danqing-ai.com.access.log main;
    error_log  /var/log/nginx/admin.danqing-ai.com.error.log warn;
}
```

### 5.4 生成 Basic Auth 密码文件

```bash
# 安装 apache2-utils(提供 htpasswd)
apt install -y apache2-utils

# 创建密码文件(-c 创建,后续添加用户不要带 -c)
htpasswd -c /etc/nginx/.htpasswd-admin admin
# 输入两次密码

# 添加第二个用户
htpasswd /etc/nginx/.htpasswd-admin ops

# 权限
chmod 640 /etc/nginx/.htpasswd-admin
chown root:www-data /etc/nginx/.htpasswd-admin
```

### 5.5 安全加固清单

| 层级 | 措施 | 配置位置 |
|------|------|---------|
| 网络 | 仅 IP 白名单 | nginx `geo` 指令 |
| HTTP | Basic Auth | nginx `.htpasswd-admin` |
| 应用 | 飞书 OAuth 登录 | 后端 `/api/admin/auth` |
| 应用 | 空闲自动登出(15 分钟) | `admin/src/hooks/useIdleTimer.ts` |
| 应用 | 权限矩阵(角色 → 权限码) | 后端 `/api/admin/roles` |
| 应用 | 操作审计日志 | 后端 `admin-audit.service.ts` |
| HTTPS | 强制 HSTS | nginx + server `ENABLE_HSTS=true` |

---

## 6. 品牌官网部署(website/)

Next.js 14,`next.config.js` 中 `output: 'export'` 静态导出,`trailingSlash: true`,可部署到任意静态托管。

### 6.1 构建步骤

```bash
cd /opt/danqing-ai/website
npm ci
npm run build
# 产物目录:.next/  (distDir 配置在 next.config.js)
ls .next/
# index.html  404.html  about/  blog/  cases/  pricing/  ...
```

### 6.2 方案 A:部署到 Vercel(推荐)

官网推荐 Vercel 托管,自动 CDN + SSL + 自动构建。

1. 在 Vercel 导入 GitHub 仓库
2. 配置:
   - **Root Directory**: `website`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Framework Preset**: Next.js
3. 绑定自定义域名 `www.danqing-ai.com`,Vercel 自动签发 SSL
4. 在 DNS 配置 CNAME:
   ```
   www  CNAME  cname.vercel-dns.com
   ```

### 6.3 方案 B:部署到 nginx

```nginx
# /etc/nginx/conf.d/www.danqing-ai.com.conf
server {
    listen 80;
    server_name www.danqing-ai.com danqing-ai.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name danqing-ai.com;
    ssl_certificate     /etc/letsencrypt/live/www.danqing-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.danqing-ai.com/privkey.pem;
    return 301 https://www.danqing-ai.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.danqing-ai.com;

    ssl_certificate     /etc/letsencrypt/live/www.danqing-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.danqing-ai.com/privkey.pem;

    root /opt/danqing-ai/website/.next;
    index index.html;

    # 静态资源缓存
    location ~* \.(?:js|css|woff2?|ttf|svg|png|jpg|jpeg|gif|webp|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # trailingSlash: true,目录式 URL,每个路径都有 /index.html
    location / {
        try_files $uri $uri/ $uri.html /404.html;
    }

    # 自定义 404
    error_page 404 /404.html;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    access_log /var/log/nginx/www.danqing-ai.com.access.log main;
    error_log  /var/log/nginx/www.danqing-ai.com.error.log warn;
}
```

### 6.4 CDN 配置

国内可使用阿里云 CDN / 腾讯云 CDN / Cloudflare:

| 配置项 | 值 |
|--------|-----|
| 加速域名 | `www.danqing-ai.com` |
| 源站地址 | 服务器公网 IP |
| 回源端口 | 443 |
| 回源协议 | HTTPS |
| 缓存策略 | `*.js` `*.css` `*.svg` 等 30 天,`index.html` 不缓存 |
| HTTPS | 启用,上传证书或使用平台免费证书 |
| HTTP/2 | 启用 |
| 强制 HTTPS | 启用 |

---

## 7. 数据库部署

### 7.1 创建数据库与用户

```bash
sudo -u postgres psql <<'EOF'
-- 创建专用用户(强密码)
CREATE USER danqing WITH PASSWORD 'DANQING_STRONG_PASSWORD';

-- 创建数据库(Owner = danqing)
CREATE DATABASE danqing OWNER danqing ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;

-- 限制 danqing 仅能访问自己的库
REVOKE ALL ON DATABASE postgres FROM danqing;
GRANT CONNECT ON DATABASE danqing TO danqing;

\q
EOF
```

### 7.2 PostgreSQL 安全配置

`/etc/postgresql/15/main/postgresql.conf`:

```conf
# 监听地址(仅本机,跨机部署改为内网 IP)
listen_addresses = '127.0.0.1'
port = 5432

# 连接数(server 进程 + 管理后台 + 运维)
max_connections = 100

# 内存(4G 服务器参考值)
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB

# WAL
wal_level = replica
max_wal_size = 1GB
min_wal_size = 256MB
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'

# 慢查询日志
log_min_duration_statement = 500
log_checkpoints = on
log_connections = off
log_disconnections = off
```

`/etc/postgresql/15/main/pg_hba.conf`:

```conf
# TYPE  DATABASE   USER      ADDRESS          METHOD
local   all        postgres                   peer
local   all        all                        md5
host    danqing    danqing   127.0.0.1/32     md5
host    danqing    danqing   ::1/128          md5
# 跨机部署时:
# host    danqing  danqing   10.0.0.0/8       md5
```

```bash
mkdir -p /var/lib/postgresql/wal_archive
chown postgres:postgres /var/lib/postgresql/wal_archive
chmod 700 /var/lib/postgresql/wal_archive

systemctl restart postgresql
```

### 7.3 初始迁移

```bash
cd /opt/danqing-ai/server

# 应用所有迁移(生产环境必须用 deploy,不会创建新迁移文件)
npx prisma migrate deploy

# 验证
npx prisma migrate status
```

> 项目首次部署时,`prisma/migrations/` 目录可能为空。此时需要先在开发环境执行 `prisma migrate dev --name init` 生成迁移文件,提交后再到生产执行 `migrate deploy`。**严禁在生产直接执行 `prisma db push`**。

### 7.4 种子数据

项目暂未配置 `prisma db seed` 脚本,如需灌入测试数据:

```bash
# 压测数据(创建 1 租户 + 100 用户 + 10000 分析记录)
node performance/scripts/seed-database.js

# 为这些用户签发 token
node performance/scripts/generate-tokens.js
```

> **生产环境严禁执行 seed 脚本**,仅用于压测与功能验证。

### 7.5 备份策略

#### 7.5.1 每日全量备份

`/opt/scripts/backup-postgres.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/var/backups/postgres
DATE=$(date +%Y%m%d-%H%M%S)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# 全量逻辑备份
PGPASSWORD='DANQING_STRONG_PASSWORD' \
  pg_dump -h 127.0.0.1 -U danqing -d danqing \
  --format=custom --compress=9 \
  --file="$BACKUP_DIR/danqing-$DATE.dump"

# 同步到对象存储(可选,推荐 OSS/COS/S3)
# aws s3 cp "$BACKUP_DIR/danqing-$DATE.dump" s3://your-bucket/postgres/

# 清理过期备份
find "$BACKUP_DIR" -name "danqing-*.dump" -mtime +$KEEP_DAYS -delete

echo "[$DATE] backup done: danqing-$DATE.dump"
```

```bash
chmod +x /opt/scripts/backup-postgres.sh

# crontab
sudo -u postgres crontab -e
# 每日凌晨 3 点备份
0 3 * * * /opt/scripts/backup-postgres.sh >> /var/log/postgres-backup.log 2>&1
```

#### 7.5.2 WAL 归档(已配置见 7.2)

WAL 文件实时归档到 `/var/lib/postgresql/wal_archive/`,可用于 PITR(Point-in-Time Recovery)。

#### 7.5.3 恢复流程

```bash
# 1. 关闭 server
pm2 stop danqing-ai-server

# 2. 删除损坏的数据库(或新建一个空库)
sudo -u postgres dropdb danqing
sudo -u postgres createdb -O danqing danqing

# 3. 从备份恢复
sudo -u postgres pg_restore \
  -d danqing \
  --clean --if-exists --jobs=4 \
  /var/backups/postgres/danqing-20260728-030000.dump

# 4. 重启 server
pm2 start danqing-ai-server
```

---

## 8. Redis 部署

### 8.1 配置文件

`/etc/redis/redis.conf` 关键项:

```conf
# 监听地址(仅本机)
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# 密码(强随机)
requirepass REDIS_STRONG_PASSWORD

# 内存上限(与服务器规格匹配)
maxmemory 256mb
maxmemory-policy allkeys-lru

# 持久化:AOF + RDB 双保险
# AOF
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB(快照)
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
dir /var/lib/redis

# 超时
timeout 300
tcp-keepalive 60

# 日志
loglevel notice
logfile /var/log/redis/redis-server.log

# 客户端输出缓冲区限制(防止慢客户端拖垮)
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
```

```bash
systemctl restart redis-server
systemctl enable redis-server
```

### 8.2 验证

```bash
redis-cli -a 'REDIS_STRONG_PASSWORD' ping
# 期望: PONG

# 查看内存使用
redis-cli -a 'REDIS_STRONG_PASSWORD' info memory | grep used_memory_human

# 查看 AOF 状态
redis-cli -a 'REDIS_STRONG_PASSWORD' info persistence | grep aof_enabled
```

### 8.3 备份

```bash
# 手动触发 RDB 快照
redis-cli -a 'REDIS_STRONG_PASSWORD' BGSAVE

# 复制 dump.rdb 到备份目录
cp /var/lib/redis/dump.rdb /var/backups/redis/dump-$(date +%Y%m%d).rdb

# 加入 crontab
echo '0 4 * * * redis-cli -a "REDIS_STRONG_PASSWORD" BGSAVE && cp /var/lib/redis/dump.rdb /var/backups/redis/dump-$(date +\%Y\%m\%d).rdb' | crontab -
```

---

## 9. nginx 完整配置

### 9.1 主配置 nginx.conf

`/etc/nginx/nginx.conf`:

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

# worker_connections 与 ulimit 对齐
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    # ---------- 基础 ----------
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;
    client_max_body_size 10m;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ---------- 日志格式 ----------
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct=$upstream_connect_time '
                    'urt=$upstream_response_time trace_id=$request_id';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    # ---------- gzip ----------
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
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
        application/atom+xml
        image/svg+xml
        font/woff
        font/woff2;

    # ---------- SSL 通用优化 ----------
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ---------- OCSP Stapling ----------
    ssl_stapling on;
    ssl_stapling_verify on;

    # ---------- 限流 zone ----------
    # 全局 API 限流(对应 server 的 RATE_LIMIT_API_PER_MIN=60)
    limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;
    # 管理后台限流(更严)
    limit_req_zone $binary_remote_addr zone=admin:10m rate=30r/m;
    # 登录限流(对应 RATE_LIMIT_AUTH_PER_MIN=10)
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

    # ---------- WebSocket 升级映射 ----------
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # ---------- 加载各 server 配置 ----------
    include /etc/nginx/conf.d/*.conf;
}
```

### 9.2 后端 API server 配置

`/etc/nginx/conf.d/api.danqing-ai.com.conf`:

```nginx
server {
    listen 80;
    server_name api.danqing-ai.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.danqing-ai.com;

    ssl_certificate     /etc/letsencrypt/live/api.danqing-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.danqing-ai.com/privkey.pem;

    # 健康检查不限流
    location = /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }

    # 登录回调严格限流
    location ~ ^/api/v1/auth/(feishu/.*|login|refresh)$ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Trace-Id        $request_id;
        client_max_body_size 1m;
    }

    # 业务 API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket 支持(Phase 2 实时推送预留)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Trace-Id        $request_id;

        # 上传上限(对应 UPLOAD_MAX_SIZE=10485760)
        client_max_body_size 10m;

        # 超时
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    # 安全头
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    access_log /var/log/nginx/api.danqing-ai.com.access.log main;
    error_log  /var/log/nginx/api.danqing-ai.com.error.log warn;
}
```

### 9.3 SSL 证书申请

```bash
# 一次性为所有域名申请
certbot --nginx \
  -d api.danqing-ai.com \
  -d app.danqing-ai.com \
  -d admin.danqing-ai.com \
  -d www.danqing-ai.com \
  -d danqing-ai.com \
  --redirect \
  --agree-tos \
  --no-eff-email \
  --email admin@danqing-ai.com

# 自动续期(certbot 已自动添加 systemd timer)
systemctl list-timers | grep certbot
# 手动测试续期
certbot renew --dry-run
```

### 9.4 验证与重载

```bash
nginx -t
systemctl reload nginx
```

---

## 10. PM2 配置

### 10.1 ecosystem.config.cjs

`/opt/danqing-ai/server/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'danqing-ai-server',
      script: 'dist/index.js',
      cwd: '/opt/danqing-ai/server',
      instances: 2,              // cluster 模式实例数(<= CPU 核数)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // ---------- 启动与优雅关闭 ----------
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 优雅关闭:SIGTERM 后等待 10s 再 SIGKILL
      kill_timeout: 10000,
      listen_timeout: 10000,
      shutdown_with_message: false,

      // ---------- 日志 ----------
      out_file: '/var/log/danqing-ai/server-out.log',
      error_file: '/var/log/danqing-ai/server-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type: 'json',

      // ---------- 重启策略 ----------
      min_uptime: '10s',         // 启动 10s 内挂掉算异常重启
      max_restarts: 10,          // 1 分钟内最多重启 10 次
      restart_delay: 5000,       // 异常重启间隔 5s

      // ---------- 进程级 ----------
      uid: 'ubuntu',
      gid: 'ubuntu',
      node_args: '--enable-source-maps --unhandled-rejections=strict',
    },
  ],
};
```

### 10.2 常用命令

```bash
cd /opt/danqing-ai/server

# 启动
pm2 start ecosystem.config.cjs --env production

# 状态
pm2 status
pm2 describe danqing-ai-server

# 重启
pm2 restart danqing-ai-server
pm2 reload danqing-ai-server       # 零停机重启(cluster 模式)

# 停止 / 删除
pm2 stop danqing-ai-server
pm2 delete danqing-ai-server

# 日志
pm2 logs danqing-ai-server --lines 200
pm2 logs danqing-ai-server --err --lines 100

# 实时监控
pm2 monit

# 保存进程列表(开机自启)
pm2 save
pm2 startup systemd
```

### 10.3 自动重启策略

- **正常重启**:`pm2 reload` 零停机滚动重启,用于代码更新后部署。
- **异常重启**:进程 crash 后 5 秒重启,1 分钟内超过 10 次则停止(防止死循环)。
- **内存重启**:单实例超过 512MB 自动重启(防内存泄漏)。
- **开机自启**:`pm2 startup systemd` + `pm2 save` 注册 systemd unit。

### 10.4 监控

```bash
# 实时仪表盘(CPU/内存/事件循环延迟)
pm2 monit

# 历史数据
pm2 introspect danqing-ai-server

# 事件
pm2 events
```

---

## 11. CI/CD 流程(可选)

### 11.1 GitHub Actions 工作流

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  NODE_VERSION: '18'
  SERVER_HOST: ${{ secrets.SERVER_HOST }}
  SERVER_USER: ${{ secrets.SERVER_USER }}
  SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}

jobs:
  # ---------- 后端 ----------
  deploy-server:
    name: Deploy server
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install, build, test
        working-directory: server
        run: |
          npm ci
          npx prisma generate
          npm run build
          npm test

      - name: Upload to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ env.SERVER_HOST }}
          username: ${{ env.SERVER_USER }}
          key: ${{ env.SSH_PRIVATE_KEY }}
          source: 'server/dist,server/package.json,server/package-lock.json,server/prisma'
          target: '/opt/danqing-ai-release/${{ github.sha }}'

      - name: Apply migration & restart
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ env.SERVER_HOST }}
          username: ${{ env.SERVER_USER }}
          key: ${{ env.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/danqing-ai-release/${{ github.sha }}/server
            npm ci --omit=dev
            npx prisma migrate deploy
            # 原子切换
            ln -sfn /opt/danqing-ai-release/${{ github.sha }}/server /opt/danqing-ai/server-active
            pm2 reload danqing-ai-server --env production
            # 健康检查
            sleep 3
            curl -f http://127.0.0.1:3000/health || (echo "health check failed" && exit 1)

  # ---------- 前端 Web ----------
  deploy-web:
    name: Deploy web (src/)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Build
        run: |
          npm ci
          npm run build
        env:
          VITE_API_BASE_URL: https://api.danqing-ai.com/api/v1
          VITE_FEISHU_REDIRECT_URI: https://app.danqing-ai.com/auth/feishu/callback

      - name: Upload to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ env.SERVER_HOST }}
          username: ${{ env.SERVER_USER }}
          key: ${{ env.SSH_PRIVATE_KEY }}
          source: 'dist/*'
          target: '/opt/danqing-ai-release/web-${{ github.sha }}/'
          strip_components: 1

      - name: Switch
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ env.SERVER_HOST }}
          username: ${{ env.SERVER_USER }}
          key: ${{ env.SSH_PRIVATE_KEY }}
          script: |
            ln -sfn /opt/danqing-ai-release/web-${{ github.sha }} /opt/danqing-ai/dist-active
            nginx -t && systemctl reload nginx

  # ---------- admin 与 website 同理,略 ----------
```

### 11.2 GitHub Secrets 配置

在仓库 `Settings → Secrets and variables → Actions` 添加:

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器公网 IP |
| `SERVER_USER` | SSH 用户(推荐 `ubuntu`) |
| `SSH_PRIVATE_KEY` | 私钥(对应已加入 `~/.ssh/authorized_keys` 的公钥) |

### 11.3 环境变量管理

- **构建时变量**(Vite `VITE_*`、`FEISHU_REDIRECT_URI`):在 GitHub Actions 的 `env` 中注入。
- **运行时变量**(server `.env`):通过服务器上的 `.env` 文件管理,不进 CI;或接入 Secret Manager(阿里云 KMS / AWS Secrets Manager)。
- **机密**(数据库密码、JWT 私钥、AI API Key):仅存在于服务器 `.env` 与 Secret Manager。

### 11.4 回滚方案

```bash
# 查看历史版本
ls -lt /opt/danqing-ai-release/ | head -20

# 切回上一个版本
ln -sfn /opt/danqing-ai-release/<旧 sha>/server /opt/danqing-ai/server-active
pm2 reload danqing-ai-server --env production

# 前端
ln -sfn /opt/danqing-ai-release/web-<旧 sha> /opt/danqing-ai/dist-active
systemctl reload nginx
```

数据库回滚见 [7.5.3 恢复流程](#753-恢复流程)。

---

## 12. 监控与告警

### 12.1 PM2 监控

```bash
# 实时
pm2 monit

# 历史
pm2 introspect danqing-ai-server

# 进程事件流
pm2 events
```

可集成 [PM2 Plus](https://pm2.io/)(付费,免费版有限):

```bash
pm2 plus
# 按提示绑定账号
```

### 12.2 nginx 日志分析

#### 12.2.1 goaccess(实时分析)

```bash
apt install -y goaccess

# 实时终端
goaccess /var/log/nginx/api.danqing-ai.com.access.log \
  --log-format=COMBINED \
  --real-time-html \
  -o /var/www/goaccess-report.html
```

#### 12.2.2 关键指标

```bash
# 状态码分布
awk '{print $9}' /var/log/nginx/api.danqing-ai.com.access.log | sort | uniq -c | sort -rn

# Top 10 IP
awk '{print $1}' /var/log/nginx/api.danqing-ai.com.access.log | sort | uniq -c | sort -rn | head -10

# 慢请求(>1s)
awk '$NF > 1' /var/log/nginx/api.danqing-ai.com.access.log | head -20

# 4xx/5xx 错误
awk '$9 ~ /^(4|5)/' /var/log/nginx/api.danqing-ai.com.access.log | head -20
```

### 12.3 健康检查脚本

`/opt/scripts/health-check.sh`:

```bash
#!/bin/bash
# 健康检查:并发探测所有端点,任一失败则告警

set -uo pipefail

ENDPOINTS=(
  "API|https://api.danqing-ai.com/health"
  "Web|https://app.danqing-ai.com/"
  "Admin|https://admin.danqing-ai.com/"     # 注意 IP 白名单
  "Website|https://www.danqing-ai.com/"
)

FAIL=0
REPORT=""

for entry in "${ENDPOINTS[@]}"; do
  name="${entry%%|*}"
  url="${entry##*|}"
  code=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if [ "$code" = "200" ]; then
    REPORT+="✅ ${name}: OK (${code})\n"
  else
    REPORT+="❌ ${name}: FAIL (${code})\n"
    FAIL=1
  fi
done

# 输出到日志
echo -e "[$(date '+%F %T')] Health Check:\n$REPORT" >> /var/log/danqing-ai/health-check.log

# 失败时告警
if [ "$FAIL" = "1" ]; then
  /opt/scripts/notify-feishu.sh "🚨 丹青有AI 健康检查失败:\n$REPORT"
  exit 1
fi

exit 0
```

```bash
chmod +x /opt/scripts/health-check.sh

# crontab,每 5 分钟检查
*/5 * * * * /opt/scripts/health-check.sh
```

### 12.4 告警(飞书机器人)

`/opt/scripts/notify-feishu.sh`:

```bash
#!/bin/bash
# 飞书自定义机器人 Webhook
WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx"
MESSAGE="$1"

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"msg_type\": \"text\",
    \"content\": {
      \"text\": \"$(date '+%F %T') $MESSAGE\"
    }
  }"
```

```bash
chmod +x /opt/scripts/notify-feishu.sh
```

#### 触发场景

| 场景 | 触发方式 |
|------|---------|
| 健康检查失败 | `health-check.sh` 返回非 0 |
| 磁盘使用 > 90% | `df -h` + cron |
| 内存使用 > 90% | `free -m` + cron |
| PM2 进程异常停止 | `pm2 events` + 脚本 |
| PostgreSQL 连接失败 | `pg_isready` + cron |
| Redis 连接失败 | `redis-cli ping` + cron |
| SSL 证书即将过期(< 14 天) | `certbot certificates` + cron |

---

## 13. 故障排查

### 13.1 常见问题

#### 13.1.1 server 启动失败:`[env] missing required environment variables`

**原因**:必填环境变量缺失(`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_REDIRECT_URI_WEB`、`JWT_PRIVATE_KEY`、`JWT_PUBLIC_KEY`、`JWT_KEY_ID`、`DATABASE_URL`、`REDIS_URL`、`CORS_ORIGINS`)。

**解决**:

```bash
cd /opt/danqing-ai/server
# 检查 .env 是否存在并完整
cat .env | grep -E 'FEISHU_APP_ID|JWT_PRIVATE_KEY|DATABASE_URL|REDIS_URL|CORS_ORIGINS'
# 重启
pm2 restart danqing-ai-server
```

#### 13.1.2 server 启动失败:`JWT_PRIVATE_KEY invalid`

**原因**:PEM 格式错误,通常是 `\n` 没有正确转义或换行被吞掉。

**解决**:在 `.env` 中,JWT 私钥的换行必须用字面 `\n` 表示,并用双引号包裹:

```dotenv
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
```

验证:

```bash
node -e "require('fs').readFileSync('.env','utf8').match(/JWT_PRIVATE_KEY=\"(.*)\"/)[1].split('\\n').length"
```

#### 13.1.3 server 启动失败:`[redis] connection error`

**原因**:Redis 密码错误、Redis 未启动、连接地址错误。

**解决**:

```bash
systemctl status redis-server
redis-cli -a 'REDIS_STRONG_PASSWORD' ping
# 检查 .env 中 REDIS_URL
grep REDIS_URL /opt/danqing-ai/server/.env
```

#### 13.1.4 server 启动失败:`[prisma] init failed`

**原因**:数据库连接失败、迁移未应用。

**解决**:

```bash
# 测试连接
PGPASSWORD='DANQING_STRONG_PASSWORD' psql -h 127.0.0.1 -U danqing -d danqing -c '\dt'

# 应用迁移
cd /opt/danqing-ai/server
npx prisma migrate deploy
npx prisma migrate status
```

#### 13.1.5 502 Bad Gateway

**原因**:server 进程未运行或端口不对。

**解决**:

```bash
pm2 status
pm2 logs danqing-ai-server --lines 50
curl http://127.0.0.1:3000/health
ss -tlnp | grep 3000
```

#### 13.1.6 504 Gateway Timeout

**原因**:后端响应过慢,通常是 AI 调用超时或数据库慢查询。

**解决**:

```bash
# 查看慢查询
grep "slow" /var/log/postgresql/postgresql-15-main.log | tail -20

# 查看 AI 调用日志
pm2 logs danqing-ai-server --lines 200 | grep -i "ai"

# 临时关闭 AI,降级到 Jimp
# 编辑 .env:Ai_ENABLED=false,然后 pm2 reload
```

#### 13.1.7 飞书登录回调失败:`redirect_uri_mismatch`

**原因**:飞书应用后台注册的回调地址与 `FEISHU_REDIRECT_URI_*` 不一致。

**解决**:在飞书开放平台 → 应用 → 安全设置 → 重定向 URL,确保以下全部添加:

- `https://app.danqing-ai.com/auth/feishu/callback`
- `https://admin.danqing-ai.com/auth/feishu/callback`
- `https://m.danqing-ai.com/auth/feishu/callback`(移动端,Phase 4)

#### 13.1.8 CORS 错误:`blocked by CORS policy`

**原因**:前端域名未加入 `CORS_ORIGINS`。

**解决**:编辑 `.env`:

```dotenv
CORS_ORIGINS=https://app.danqing-ai.com,https://admin.danqing-ai.com,https://www.danqing-ai.com
```

```bash
pm2 reload danqing-ai-server
```

#### 13.1.9 管理后台 403 Forbidden

**原因**:IP 不在白名单,或 Basic Auth 认证失败。

**解决**:在 nginx 配置 `geo $admin_allowed` 中添加访问者 IP,然后 `nginx -s reload`。

#### 13.1.10 SPA 路由刷新 404

**原因**:nginx 未配置 `try_files ... /index.html` fallback。

**解决**:参考第 4.3 / 5.3 节的 `location /` 配置。

### 13.2 日志位置

| 组件 | 日志路径 |
|------|---------|
| server 应用 | `/var/log/danqing-ai/server-out.log` 与 `server-error.log` |
| server PM2 | `~/.pm2/logs/danqing-ai-server-*.log` |
| nginx 访问 | `/var/log/nginx/<domain>.access.log` |
| nginx 错误 | `/var/log/nginx/<domain>.error.log` |
| PostgreSQL | `/var/log/postgresql/postgresql-15-main.log` |
| Redis | `/var/log/redis/redis-server.log` |
| 健康检查 | `/var/log/danqing-ai/health-check.log` |
| 系统 | `journalctl -u nginx / -u postgresql / -u redis-server` |
| PM2 | `journalctl -u pm2-ubuntu` |

### 13.3 紧急联系

| 角色 | 负责人 | 联系方式 |
|------|--------|---------|
| 运维负责人 | (待填) | 电话 / 飞书 |
| 后端开发 | (待填) | 飞书 |
| 前端开发 | (待填) | 飞书 |
| DBA | (待填) | 飞书 |
| 安全负责人 | (待填) | 飞书 |
| 飞书开放平台支持 | - | https://open.feishu.cn/ |

---

## 14. 部署检查清单

### 14.1 部署前检查

- [ ] 服务器满足最低配置(2 核 4G / 40G SSD)
- [ ] Ubuntu 22.04 LTS 已安装最新更新
- [ ] Node.js 18 LTS 已安装,`node -v` / `npm -v` 正常
- [ ] nginx 已安装并启用开机自启
- [ ] PostgreSQL 15 已安装,`psql --version` 正常
- [ ] Redis 7 已安装,`redis-server --version` 正常
- [ ] PM2 已全局安装
- [ ] Certbot 已安装
- [ ] UFW 已启用,仅开放 22 / 80 / 443
- [ ] SSH 已禁用密码登录,仅密钥
- [ ] fail2ban 已启用
- [ ] DNS 解析已配置(api / app / admin / www → 服务器 IP)
- [ ] 飞书应用后台已配置回调 URL
- [ ] JWT RSA 密钥对已生成(`openssl genrsa` / `openssl rsa -pubout`)
- [ ] 数据库用户与库已创建,密码为强随机串
- [ ] Redis 密码已设置为强随机串
- [ ] 代码已拉取到 `/opt/danqing-ai`
- [ ] 所有 `.env` 已填写并校验

### 14.2 部署后验证

#### 14.2.1 后端

- [ ] `pm2 status` 中 `danqing-ai-server` 状态为 `online`
- [ ] `curl http://127.0.0.1:3000/health` 返回 `{"status":"up",...}`
- [ ] `curl https://api.danqing-ai.com/health` 返回 200
- [ ] `pm2 logs danqing-ai-server --lines 50` 无 ERROR
- [ ] `npx prisma migrate status` 显示所有迁移已应用
- [ ] 飞书登录流程走通(从 app 端发起 → 回调 → 拿到 token)
- [ ] CORS 校验:从非白名单域名发起请求被拒
- [ ] 限流生效:超过 60 r/m 返回 429

#### 14.2.2 Web 应用

- [ ] `https://app.danqing-ai.com` 可访问
- [ ] 静态资源 200(/assets/*.js)
- [ ] SPA 路由刷新不 404(如 `/history` 直接访问)
- [ ] 飞书登录按钮可点击,跳转飞书
- [ ] 登录后 token 写入 localStorage
- [ ] API 调用成功(从浏览器 DevTools Network 看)

#### 14.2.3 管理后台

- [ ] `https://admin.danqing-ai.com` 从白名单 IP 可访问
- [ ] 从非白名单 IP 访问返回 403
- [ ] Basic Auth 弹窗出现,密码正确可进入
- [ ] 飞书登录走通
- [ ] 空闲 15 分钟自动登出
- [ ] 权限矩阵生效:无权限菜单不显示
- [ ] 操作审计日志记录(查数据库 audit_log 表)

#### 14.2.4 品牌官网

- [ ] `https://www.danqing-ai.com` 可访问
- [ ] `https://danqing-ai.com` 301 跳转到 www
- [ ] 各页面路由正常(/about /product /pricing /blog /cases /privacy /terms)
- [ ] 404 页面正常显示
- [ ] sitemap.xml 可访问
- [ ] robots.txt 可访问
- [ ] Lighthouse Performance ≥ 90

#### 14.2.5 数据库与缓存

- [ ] PostgreSQL 备份脚本已加入 crontab,手动执行成功
- [ ] WAL 归档目录有文件产生
- [ ] Redis `BGSAVE` 后 `dump.rdb` 文件存在
- [ ] Redis 内存使用 < 256mb(`info memory`)

#### 14.2.6 nginx 与 SSL

- [ ] `nginx -t` 通过
- [ ] HTTP 全部 301 跳转到 HTTPS
- [ ] SSL Labs 评级 A 以上(https://www.ssllabs.com/ssltest/)
- [ ] HSTS 头存在(api 域名)
- [ ] gzip 生效(`curl -H 'Accept-Encoding: gzip' -I https://app.danqing-ai.com/assets/*.js`)
- [ ] 限流生效(并发请求测试)

#### 14.2.7 监控

- [ ] 健康检查脚本已加入 crontab,执行无报错
- [ ] 飞书告警机器人测试通过
- [ ] logrotate 已配置,手动触发成功
- [ ] PM2 已 `pm2 save` + `pm2 startup`,重启服务器后自动拉起

### 14.3 回滚检查项

- [ ] 旧版本代码目录保留(`/opt/danqing-ai-release/<旧 sha>/`)
- [ ] 数据库备份保留(`/var/backups/postgres/danqing-*.dump`)
- [ ] 切换软链后 `pm2 reload` / `nginx -s reload` 成功
- [ ] 回滚后健康检查通过
- [ ] 回滚操作记录到运维日志

---

## 附录:端口与目录速查

### 端口

| 端口 | 服务 | 监听地址 | 对外 |
|------|------|---------|------|
| 22 | SSH | 0.0.0.0 | ✅ |
| 80 | nginx HTTP | 0.0.0.0 | ✅(仅 301 → HTTPS) |
| 443 | nginx HTTPS | 0.0.0.0 | ✅ |
| 3000 | Node.js server | 127.0.0.1 | ❌ |
| 5432 | PostgreSQL | 127.0.0.1 | ❌ |
| 6379 | Redis | 127.0.0.1 | ❌ |

### 目录

| 路径 | 说明 |
|------|------|
| `/opt/danqing-ai/` | 项目根(代码) |
| `/opt/danqing-ai/server/` | 后端代码 |
| `/opt/danqing-ai/server/dist/` | 后端构建产物 |
| `/opt/danqing-ai/server/.env` | 后端环境变量 |
| `/opt/danqing-ai/server/uploads/` | multer 临时上传目录 |
| `/opt/danqing-ai/dist/` | Web 应用构建产物 |
| `/opt/danqing-ai/admin/dist/` | 管理后台构建产物 |
| `/opt/danqing-ai/website/.next/` | 官网构建产物 |
| `/opt/danqing-ai-release/` | CI/CD 发布目录(多版本) |
| `/var/log/danqing-ai/` | 应用日志 |
| `/var/log/nginx/` | nginx 日志 |
| `/var/backups/postgres/` | 数据库备份 |
| `/var/backups/redis/` | Redis 备份 |
| `/var/lib/postgresql/wal_archive/` | WAL 归档 |
| `/etc/nginx/conf.d/` | nginx server 配置 |
| `/etc/nginx/.htpasswd-admin` | 管理后台 Basic Auth 密码文件 |
| `/opt/scripts/` | 运维脚本 |

### 关键文件

| 文件 | 说明 |
|------|------|
| `/opt/danqing-ai/server/.env` | 后端环境变量(必填项见 3.4) |
| `/opt/danqing-ai/.env.local` | Web 应用环境变量 |
| `/opt/danqing-ai/admin/.env` | 管理后台环境变量 |
| `/opt/danqing-ai/server/ecosystem.config.cjs` | PM2 配置 |
| `/etc/nginx/nginx.conf` | nginx 主配置 |
| `/etc/nginx/conf.d/*.conf` | 各 server 配置 |
| `/etc/postgresql/15/main/postgresql.conf` | PostgreSQL 主配置 |
| `/etc/postgresql/15/main/pg_hba.conf` | PostgreSQL 认证配置 |
| `/etc/redis/redis.conf` | Redis 配置 |
| `/etc/logrotate.d/danqing-ai` | 日志轮转 |
| `/opt/scripts/backup-postgres.sh` | 数据库备份脚本 |
| `/opt/scripts/health-check.sh` | 健康检查脚本 |
| `/opt/scripts/notify-feishu.sh` | 飞书告警脚本 |

---

**文档结束**。如有疑问,联系运维负责人。
