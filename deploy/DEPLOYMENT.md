# 丹青有AI 生产环境部署实施真源文档

**文档版本**：v1.0.0
**编写日期**：2026-08-01
**文档状态**：待审查
**生效日期**：通过审查后生效
**文档密级**：内部机密（仅限项目组成员）

---

## 1. 部署方案概述

### 1.1 部署目标

将"丹青有AI"艺术教育系统完整部署至腾讯云香港轻量应用服务器，实现：

- **核心目标**：搭建稳定、安全、高性能的生产环境，支撑比赛演示及初期试用
- **性能目标**：API响应时间 ≤ 3秒（AI分析SLA），页面加载时间 ≤ 2秒
- **可用性目标**：系统可用性 ≥ 99.5%，故障恢复时间 ≤ 30分钟
- **安全目标**：通过HTTPS加密传输、JWT鉴权、多租户数据隔离、SQL注入防护等基础安全要求

### 1.2 部署范围

本次部署包含以下组件：

| 组件 | 版本 | 部署方式 | 职责 |
|------|------|----------|------|
| Nginx | 1.24+ | 系统包管理器安装 | 反向代理、静态文件服务、HTTPS终止 |
| Node.js | 20 LTS | NVM管理 | 后端API服务运行时 |
| PostgreSQL | 15+ | 系统包管理器安装 | 业务数据持久化 |
| Redis | 7+ | 系统包管理器安装 | 会话缓存、分析结果缓存 |
| PM2 | latest | npm全局安装 | Node.js进程管理、日志管理、自动重启 |
| 前端静态资源 | Vite构建产物 | 文件系统部署 | Web应用静态资源（React SPA） |
| 后端API服务 | 源码编译 | PM2托管 | 业务逻辑、AI分析调度、数据访问 |
| 轻量COS | 已挂载 | 文件系统挂载 | 用户上传图片、素材图片持久化存储 |

**不在本次部署范围**：
- 移动端App（React Native）发布
- 管理后台独立域名部署（与主站共用）
- 数据分析报表系统（后续迭代）
- CI/CD自动化流水线（手动部署为主）

### 1.3 环境要求

#### 1.3.1 服务器配置

| 配置项 | 规格 | 说明 |
|--------|------|------|
| 云服务商 | 腾讯云轻量应用服务器（香港） | 免备案 |
| CPU | 2核 | 满足Node.js + PostgreSQL + Redis并发需求 |
| 内存 | 4GB | Node.js约1GB + PostgreSQL约1GB + Redis约512MB + 系统预留 |
| 系统盘 | 60GB SSD | 操作系统 + 应用程序 + 日志 |
| 数据盘 | 轻量COS 100GB | 已挂载至 `/lhcos-data`，用于图片持久化 |
| 带宽 | 5Mbps | 峰值承载约50并发用户 |
| 操作系统 | Ubuntu 22.04 LTS | 长期支持版本，社区生态成熟 |
| 公网IP | 1个独立IPv4 | 绑定域名 |

#### 1.3.2 软件依赖

```bash
# 系统依赖
sudo apt update
sudo apt install -y nginx postgresql-15 redis-server \
  build-essential libssl-dev libffi-dev python3-dev \
  git curl wget unzip

# Node.js 20 LTS（通过NVM安装）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
npm install -g pm2
```

#### 1.3.3 域名与证书

- **域名**：已备案域名（或临时使用IP访问 + Host绑定测试）
- **SSL证书**：Let's Encrypt免费证书（通过certbot自动续期）
- **DNS解析**：A记录指向服务器公网IP

#### 1.3.4 对象存储（轻量COS）

- **挂载路径**：`/lhcos-data`（已通过腾讯云控制台挂载）
- **子目录规划**：
  - `/lhcos-data/uploads` - 用户上传作品图片
  - `/lhcos-data/artworks` - 素材库图片（可选，后续迁移）
- **访问权限**：公有读私有写（通过Nginx直接提供静态访问）

### 1.4 整体架构设计

#### 1.4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户终端                                │
│         (Web浏览器 / 移动端H5 / 管理后台)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Nginx (443/80)                              │
│  ├─ 静态资源服务: /var/www/danqing-ai/dist                      │
│  ├─ 上传文件服务: /lhcos-data/uploads (alias)                   │
│  ├─ API反向代理: /api → http://127.0.0.1:3000                   │
│  └─ HTTPS终止、gzip压缩、缓存控制、限流                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│              Node.js Backend (PM2 Cluster)                      │
│  ├─ Express.js API服务 (端口3000)                               │
│  ├─ 业务逻辑层: 分析、评审、用户、租户                          │
│  ├─ 数据访问层: Prisma ORM                                      │
│  └─ 中间件: JWT鉴权、RBAC权限、限流、日志、错误处理              │
└──────┬───────────────────────┬──────────────────────────────────┘
       │                       │
       ↓                       ↓
┌──────────────┐      ┌────────────────┐      ┌─────────────────┐
│  PostgreSQL  │      │     Redis      │      │   轻量COS挂载    │
│  (5432)      │      │    (6379)      │      │  /lhcos-data    │
│              │      │                │      │                 │
│ - 用户数据   │      │ - JWT黑名单    │      │ - 用户上传图片  │
│ - 分析记录   │      │ - 分析结果缓存 │      │ - 素材库图片    │
│ - 租户信息   │      │ - 限流计数器   │      │ - 静态资源备份  │
└──────────────┘      └────────────────┘      └─────────────────┘
```

#### 1.4.2 数据流说明

**用户上传作品分析流程**：
1. 用户通过前端上传图片 → Nginx接收请求
2. Nginx代理到Node.js后端 `/api/analyses/upload`
3. 后端校验权限、配额、文件类型（魔数校验）
4. 文件写入 `/lhcos-data/uploads/{timestamp}-{uuid}.jpg`（自动同步到COS）
5. 调用Jimp本地分析 + GLM-4V AI分析（3秒SLA）
6. 分析结果写入PostgreSQL，图片URL（`/uploads/xxx.jpg`）一并保存
7. 清理临时文件策略：绝对路径（COS挂载）→ 保留文件；相对路径 → 删除
8. 返回分析结果给前端

**前端展示图片流程**：
1. 前端请求 `/uploads/xxx.jpg`
2. Nginx直接从 `/lhcos-data/uploads/xxx.jpg` 读取（不经过Node.js）
3. 设置Cache-Control缓存头（7天），减少重复请求

#### 1.4.3 多租户隔离

- **数据层隔离**：PostgreSQL所有表包含 `tenant_id` 字段，Prisma查询自动注入租户过滤
- **权限控制**：基于RBAC模型，JWT中包含 `role` 字段，中间件校验权限
- **文件隔离**：用户上传文件统一存储在 `/uploads/`，通过URL路径无租户隔离（依赖JWT鉴权访问API）

#### 1.4.4 安全设计

| 安全层级 | 措施 |
|----------|------|
| 传输安全 | 全站HTTPS（TLS 1.3），HSTS强制跳转 |
| 身份认证 | 飞书OAuth 2.0 + JWT（RS256非对称加密） |
| 权限控制 | RBAC权限矩阵 + 中间件强制校验 |
| 数据隔离 | 多租户字段过滤 + SQL注入防护（Prisma ORM） |
| 输入校验 | Zod schema验证 + 文件魔数校验 + 文件大小限制 |
| 限流防护 | Redis滑动窗口限流（API/登录/回调分级限流） |
| 敏感信息 | 环境变量管理密钥，禁止硬编码；日志脱敏 |
| 依赖安全 | npm audit定期扫描，Lock文件锁定版本 |

---

## 2. 多轮审查机制

### 2.1 审查流程

本部署文档需经过**三轮审查**后方可执行：

```
文档编写(本文档)
    ↓
第一轮:技术评审 (1-2工作日)
    ↓
第二轮:安全评审 (1工作日)
    ↓
第三轮:合规性审查 (1工作日)
    ↓
审查通过 → 执行部署
    ↓
部署验证 → 上线验收
```

### 2.2 第一轮：技术评审

**责任人**：后端架构师 + 前端负责人
**审查目标**：确保技术方案可行性、架构合理性、性能达标

| 审查项 | 审查标准 | 审查结果 |
|--------|----------|----------|
| 架构设计 | 组件职责清晰，无单点故障，扩展性合理 | ☐通过 ☐不通过 |
| 性能预估 | 满足3秒SLA，并发50用户无压力 | ☐通过 ☐不通过 |
| 依赖版本 | 所有依赖版本明确且兼容，无已知漏洞 | ☐通过 ☐不通过 |
| 数据库设计 | 表结构合理，索引覆盖查询场景，迁移脚本可回滚 | ☐通过 ☐不通过 |
| 配置完整性 | 环境变量、Nginx配置、PM2配置完整且经过本地验证 | ☐通过 ☐不通过 |
| 代码质量 | TypeScript编译无错误，核心流程有单元测试覆盖 | ☐通过 ☐不通过 |

**输出物**：《技术评审报告》（签字确认）

### 2.3 第二轮：安全评审

**责任人**：安全工程师（或技术负责人兼任）
**审查目标**：识别安全风险，确保安全措施到位

| 审查项 | 审查标准 | 审查结果 |
|--------|----------|----------|
| 传输加密 | 全站HTTPS，证书有效，TLS版本≥1.2 | ☐通过 ☐不通过 |
| 身份认证 | JWT密钥强度足够（2048位RSA），过期时间合理 | ☐通过 ☐不通过 |
| 权限控制 | 所有API有权限校验，无越权访问风险 | ☐通过 ☐不通过 |
| 输入校验 | 所有用户输入有schema验证，文件上传有魔数校验 | ☐通过 ☐不通过 |
| SQL注入 | 使用Prisma ORM参数化查询，无原生SQL拼接 | ☐通过 ☐不通过 |
| XSS/CSRF | 前端转义输出，Cookie设置SameSite=strict | ☐通过 ☐不通过 |
| 敏感信息 | 密钥、密码通过环境变量管理，代码仓库无泄露 | ☐通过 ☐不通过 |
| 日志安全 | 日志不包含密码、token、身份证号等敏感信息 | ☐通过 ☐不通过 |
| 依赖漏洞 | `npm audit` 无高危漏洞，Lock文件已提交 | ☐通过 ☐不通过 |

**输出物**：《安全评审报告》（签字确认）

### 2.4 第三轮：合规性审查

**责任人**：合规负责人（或项目经理）
**审查目标**：确保符合法律法规、比赛要求、公司制度

| 审查项 | 审查标准 | 审查结果 |
|--------|----------|----------|
| 数据合规 | 用户数据存储位置符合要求（香港服务器），隐私政策已更新 | ☐通过 ☐不通过 |
| 内容合规 | AI分析内容无违规风险，素材库图片来源合法 | ☐通过 ☐不通过 |
| 版权合规 | 素材库名画均已过版权保护期（或已获授权） | ☐通过 ☐不通过 |
| 未成年人保护 | 如有未成年用户，需监护人授权机制（本次暂不涉及） | ☐通过 ☐不适用 |
| 比赛要求 | 部署架构符合比赛技术要求（如有特定要求） | ☐通过 ☐不通过 |
| 备份策略 | 数据库每日备份，保留7天；COS自动持久化 | ☐通过 ☐不通过 |

**输出物**：《合规性审查报告》（签字确认）

### 2.5 审查通过标准

- **三轮审查全部"通过"**：文档生效，可执行部署
- **任何一轮"不通过"**：修改文档后重新提交该轮审查
- **紧急情况**：可由项目经理特批跳过非关键审查项，但需记录风险

---

## 3. 详细实施步骤

### 3.1 阶段划分

```
阶段1: 环境准备 (30分钟)
    ↓
阶段2: 软件安装与配置 (60分钟)
    ↓
阶段3: 代码部署与编译 (30分钟)
    ↓
阶段4: 数据库初始化 (20分钟)
    ↓
阶段5: 环境变量配置 (15分钟)
    ↓
阶段6: 服务启动与验证 (20分钟)
    ↓
阶段7: Nginx配置与HTTPS (20分钟)
    ↓
阶段8: 数据迁移与初始化 (30分钟，可选)
    ↓
阶段9: 全面测试 (60分钟)
    ↓
阶段10: 监控配置与上线 (15分钟)
```

**总耗时**：约4-5小时（不含测试时间）

### 3.2 阶段1：环境准备

**目标**：服务器初始化，确认网络、存储、权限正常

#### 3.2.1 登录服务器

```bash
# 本地终端执行（替换为实际IP和密钥路径）
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_SERVER_IP

# 或使用密码登录（不推荐，仅限临时）
ssh ubuntu@YOUR_SERVER_IP
```

#### 3.2.2 更新系统

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

#### 3.2.3 创建部署用户（可选，推荐）

```bash
# 创建非root用户用于部署
sudo adduser danqing
sudo usermod -aG sudo danqing

# 切换到部署用户
su - danqing
```

#### 3.2.4 验证COS挂载

```bash
# 检查挂载状态
df -h | grep lhcos
# 预期输出: /dev/xxx on /lhcos-data type fuse.cosfs ...

ls -la /lhcos-data
# 预期输出: 空目录或已有文件

# 创建uploads子目录
sudo mkdir -p /lhcos-data/uploads
sudo chown -R www-data:www-data /lhcos-data/uploads
sudo chmod 755 /lhcos-data/uploads
```

**验收标准**：
- [ ] SSH登录成功
- [ ] 系统更新无报错
- [ ] `/lhcos-data` 挂载正常且可写

### 3.3 阶段2：软件安装与配置

**目标**：安装所有必需软件并基础配置

#### 3.3.1 安装Nginx

```bash
sudo apt install -y nginx

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证
curl http://localhost
# 预期输出: Nginx欢迎页面HTML
```

#### 3.3.2 安装PostgreSQL 15

```bash
# 添加PostgreSQL官方源
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# 安装PostgreSQL 15
sudo apt install -y postgresql-15 postgresql-contrib-15

# 启动并设置开机自启
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 验证
sudo -u postgres psql -c "SELECT version();"
```

#### 3.3.3 创建数据库和用户

```bash
sudo -u postgres psql <<EOF
-- 创建数据库用户（替换为强密码）
CREATE USER danqing WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- 创建数据库
CREATE DATABASE danqing_ai OWNER danqing;

-- 授权
GRANT ALL PRIVILEGES ON DATABASE danqing_ai TO danqing;

-- 退出
\q
EOF

# 测试连接
psql -h 127.0.0.1 -U danqing -d danqing_ai -c "SELECT 1;"
# 输入密码后应返回 1
```

#### 3.3.4 安装Redis

```bash
sudo apt install -y redis-server

# 配置Redis（设置密码）
sudo nano /etc/redis/redis.conf
# 找到并修改以下行:
# requirepass YOUR_REDIS_PASSWORD_HERE
# bind 127.0.0.1 ::1  (仅监听本地)

# 重启Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# 验证（替换密码）
redis-cli -a YOUR_REDIS_PASSWORD_HERE ping
# 预期输出: PONG
```

#### 3.3.5 安装Node.js 20 LTS

```bash
# 安装NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安装Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node -v
# 预期输出: v20.x.x

# 安装PM2
npm install -g pm2

# 设置PM2开机自启
pm2 startup systemd
# 按提示执行输出的命令（通常是sudo env PATH=... pm2 startup systemd -u danqing --hp /home/danqing）
```

**验收标准**：
- [ ] Nginx运行正常，`curl localhost` 有响应
- [ ] PostgreSQL运行正常，数据库 `danqing_ai` 创建成功
- [ ] Redis运行正常，`ping` 返回 `PONG`
- [ ] Node.js 20安装成功，`node -v` 显示v20.x.x
- [ ] PM2安装成功，开机自启配置完成

### 3.4 阶段3：代码部署与编译

**目标**：将代码部署到服务器并编译

#### 3.4.1 克隆代码仓库

```bash
# 创建项目目录
sudo mkdir -p /var/www/danqing-ai
sudo chown -R danqing:danqing /var/www/danqing-ai
cd /var/www/danqing-ai

# 克隆代码（替换为实际仓库地址）
git clone https://github.com/your-org/danqing-ai.git .

# 或使用SSH
git clone git@github.com:your-org/danqing-ai.git .

# 切换到生产分支
git checkout main
```

#### 3.4.2 安装依赖

```bash
# 安装后端依赖
cd /var/www/danqing-ai/server
npm ci --production=false

# 安装前端依赖
cd /var/www/danqing-ai/client
npm ci
```

#### 3.4.3 编译前端

```bash
cd /var/www/danqing-ai/client
npm run build

# 验证构建产物
ls -la dist/
# 预期输出: index.html, assets/ 等
```

#### 3.4.4 编译后端

```bash
cd /var/www/danqing-ai/server
npm run build

# 验证编译产物
ls -la dist/
# 预期输出: index.js, routes/, services/ 等
```

**验收标准**：
- [ ] 代码克隆成功，无冲突
- [ ] 依赖安装成功，无错误
- [ ] 前端构建成功，生成 `dist/` 目录
- [ ] 后端编译成功，生成 `dist/` 目录

### 3.5 阶段4：数据库初始化

**目标**：执行数据库迁移，创建表结构

```bash
cd /var/www/danqing-ai/server

# 配置临时环境变量（仅为运行迁移）
export DATABASE_URL="postgresql://danqing:YOUR_STRONG_PASSWORD_HERE@127.0.0.1:5432/danqing_ai?schema=public"

# 执行Prisma迁移
npx prisma migrate deploy

# 生成Prisma Client
npx prisma generate

# （可选）执行种子数据
npm run seed
```

**验收标准**：
- [ ] 迁移执行成功，无报错
- [ ] 数据库中创建所有表（`\dt` 查看）
- [ ] Prisma Client生成成功

### 3.6 阶段5：环境变量配置

**目标**：配置生产环境变量

#### 3.6.1 生成JWT密钥对

```bash
cd /var/www/danqing-ai/server

# 生成RSA密钥对
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# 查看密钥（复制到.env文件）
cat private.pem
cat public.pem
```

#### 3.6.2 配置.env文件

```bash
cd /var/www/danqing-ai/server
cp .env.production .env
nano .env
```

**必须修改的配置项**（替换为实际值）：

```bash
# 飞书OAuth
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
FEISHU_REDIRECT_URI_WEB=https://your-domain.com/auth/feishu/callback

# JWT密钥（将上面的private.pem和public.pem内容复制，注意转义换行符为\n）
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----"
JWT_KEY_ID=danqing-ai-prod-2026

# 数据库
DATABASE_URL=postgresql://danqing:YOUR_STRONG_PASSWORD_HERE@127.0.0.1:5432/danqing_ai?schema=public

# Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD_HERE@127.0.0.1:6379

# CORS（替换为实际域名）
CORS_ORIGINS=https://your-domain.com

# Cookie域名（替换为实际域名）
COOKIE_DOMAIN=.your-domain.com

# 文件上传（已配置，确认即可）
UPLOAD_DIR=/lhcos-data/uploads

# AI配置（替换为实际API Key）
AI_API_KEY=your_glm_api_key_here
```

**设置文件权限**：
```bash
chmod 600 .env
```

**验收标准**：
- [ ] `.env` 文件创建成功
- [ ] 所有必填项已填写
- [ ] 文件权限为600（仅所有者可读写）

### 3.7 阶段6：服务启动与验证

**目标**：启动后端服务并验证

#### 3.7.1 使用PM2启动后端

```bash
cd /var/www/danqing-ai/server

# 启动服务
pm2 start dist/index.js --name danqing-ai-api -i 2

# 查看状态
pm2 status

# 查看日志
pm2 logs danqing-ai-api --lines 50
```

#### 3.7.2 验证服务

```bash
# 健康检查
curl http://127.0.0.1:3000/health
# 预期输出: {"status":"ok"}

# API测试（替换为实际token）
curl -X GET http://127.0.0.1:3000/api/analyses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
# 预期输出: 401 或正常响应
```

**验收标准**：
- [ ] PM2显示服务在线
- [ ] `/health` 返回200
- [ ] 日志无严重错误

### 3.8 阶段7：Nginx配置与HTTPS

**目标**：配置Nginx反向代理和HTTPS

#### 3.8.1 配置Nginx

```bash
# 复制配置文件
sudo cp /var/www/danqing-ai/deploy/nginx.conf /etc/nginx/sites-available/danqing-ai

# 创建软链接
sudo ln -s /etc/nginx/sites-available/danqing-ai /etc/nginx/sites-enabled/

# 编辑配置文件，替换域名
sudo nano /etc/nginx/sites-available/danqing-ai
# 替换 server_name your-domain.com; 为实际域名
# 确认 root /var/www/danqing-ai/client/dist; 路径正确

# 测试配置
sudo nginx -t

# 重载Nginx
sudo systemctl reload nginx
```

#### 3.8.2 配置HTTPS（Let's Encrypt）

```bash
# 安装certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（替换为实际域名和邮箱）
sudo certbot --nginx -d your-domain.com --email your-email@example.com --agree-tos --no-eff-email

# 自动续期测试
sudo certbot renew --dry-run
```

**验收标准**：
- [ ] `nginx -t` 测试通过
- [ ] HTTPS访问正常，`https://your-domain.com` 可访问
- [ ] HTTP自动跳转HTTPS
- [ ] 证书自动续期配置成功

### 3.9 阶段8：数据迁移与初始化（可选）

**目标**：导入素材库数据

如果有现成的素材库数据（artworks.json），执行导入脚本：

```bash
cd /var/www/danqing-ai/server

# 检查素材库数据文件
ls -la data/artworks.json

# 执行导入（假设有导入脚本）
npm run import:artworks
```

**验收标准**：
- [ ] 素材库数据导入成功
- [ ] 数据库中可查询到素材记录

### 3.10 阶段9：全面测试

**目标**：验证所有功能正常（详见第5章测试验证计划）

### 3.11 阶段10：监控配置与上线

**目标**：配置监控，正式上线

```bash
# 配置PM2监控
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# 保存PM2进程列表（开机自启）
pm2 save

# 配置数据库定时备份（详见第7章）
```

---

## 4. 预设解决方案

### 4.1 网络故障

#### 4.1.1 无法SSH连接服务器

**症状**：`ssh: connect to host xxx port 22: Connection refused`

**预设解决方案**：
1. 检查本地网络：`ping 8.8.8.8`
2. 检查服务器状态：腾讯云控制台查看实例是否运行中
3. 检查安全组：确认22端口开放（来源IP限制）
4. 重启服务器：控制台执行软重启
5. 使用VNC登录：腾讯云控制台VNC登录检查SSH服务状态
   ```bash
   sudo systemctl status sshd
   sudo systemctl restart sshd
   ```

**应急联系人**：运维负责人

#### 4.1.2 域名解析失败

**症状**：`nslookup your-domain.com` 返回NXDOMAIN

**预设解决方案**：
1. 检查DNS配置：登录域名服务商控制台确认A记录
2. 等待DNS生效：新解析需5-30分钟生效
3. 使用IP临时访问：修改本地hosts文件测试
   ```bash
   # Windows: C:\Windows\System32\drivers\etc\hosts
   # Linux/Mac: /etc/hosts
   YOUR_SERVER_IP your-domain.com
   ```

### 4.2 服务启动失败

#### 4.2.1 PM2启动Node.js失败

**症状**：`pm2 status` 显示 `errored`

**预设解决方案**：
1. 查看错误日志：
   ```bash
   pm2 logs danqing-ai-api --err --lines 100
   ```
2. 常见错误及解决：
   - **端口被占用**：`sudo lsof -i :3000` → `sudo kill -9 PID`
   - **环境变量缺失**：检查 `.env` 文件是否存在且配置正确
   - **数据库连接失败**：确认 `DATABASE_URL` 正确，PostgreSQL运行中
   - **模块找不到**：删除 `node_modules` 重新 `npm ci`
   - **TypeScript编译错误**：本地执行 `npm run build` 检查

3. 手动测试启动：
   ```bash
   cd /var/www/danqing-ai/server
   node dist/index.js
   # 观察输出错误信息
   ```

#### 4.2.2 Nginx启动失败

**症状**：`sudo nginx -t` 报错

**预设解决方案**：
1. 检查配置文件语法：根据错误提示行号修改
2. 常见错误：
   - **端口被占用**：`sudo lsof -i :80` 或 `sudo lsof -i :443`
   - **配置路径错误**：检查 `root`、`alias` 路径是否存在
   - **权限不足**：确保Nginx用户（www-data）有读取权限
3. 回退配置：恢复备份配置文件
   ```bash
   sudo cp /etc/nginx/sites-available/danqing-ai.bak /etc/nginx/sites-available/danqing-ai
   sudo systemctl reload nginx
   ```

#### 4.2.3 PostgreSQL启动失败

**症状**：`sudo systemctl status postgresql` 显示failed

**预设解决方案**：
1. 查看日志：
   ```bash
   sudo tail -f /var/log/postgresql/postgresql-15-main.log
   ```
2. 常见错误：
   - **磁盘空间不足**：`df -h` 检查，清理日志文件
   - **配置文件错误**：检查 `/etc/postgresql/15/main/postgresql.conf`
   - **数据损坏**：从备份恢复（详见第6章回滚机制）

### 4.3 配置冲突

#### 4.3.1 CORS跨域错误

**症状**：浏览器控制台报错 `CORS policy blocked`

**预设解决方案**：
1. 检查后端 `.env` 中 `CORS_ORIGINS` 是否包含前端域名
2. 检查Nginx是否正确传递 `Origin` 头：
   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
3. 临时测试（关闭CORS验证，仅限调试）：
   ```bash
   # .env
   CORS_ORIGINS=*
   ```
   ```bash
   pm2 restart danqing-ai-api
   ```

#### 4.3.2 Cookie无法写入

**症状**：登录后Cookie未保存

**预设解决方案**：
1. 检查 `COOKIE_DOMAIN` 是否匹配实际域名（注意前导点）
2. 检查 `COOKIE_SECURE` 是否为 `true`（HTTPS必须）
3. 检查 `COOKIE_SAMESITE` 设置，跨域场景需 `none` + `secure`
4. 浏览器开发者工具查看Set-Cookie响应头是否被拦截

### 4.4 文件上传失败

#### 4.4.1 上传文件大小超限

**症状**：`413 Payload Too Large`

**预设解决方案**：
1. 检查Nginx配置：
   ```nginx
   client_max_body_size 20M;
   ```
2. 检查后端 `.env`：
   ```
   UPLOAD_MAX_SIZE=10485760  # 10MB
   ```
3. 重启服务：
   ```bash
   sudo systemctl reload nginx
   pm2 restart danqing-ai-api
   ```

#### 4.4.2 COS挂载目录不可写

**症状**：`EACCES: permission denied, open '/lhcos-data/uploads/xxx.jpg'`

**预设解决方案**：
1. 检查挂载状态：
   ```bash
   df -h | grep lhcos
   mount | grep lhcos
   ```
2. 重新挂载（腾讯云控制台操作或命令行）：
   ```bash
   sudo umount /lhcos-data
   sudo cosfs your-bucket /lhcos-data -ourl=xxx -oallow_other
   ```
3. 修改目录权限：
   ```bash
   sudo chown -R www-data:www-data /lhcos-data/uploads
   sudo chmod 755 /lhcos-data/uploads
   ```

### 4.5 数据库连接失败

**症状**：`Can't reach database server at 127.0.0.1:5432`

**预设解决方案**：
1. 检查PostgreSQL运行状态：
   ```bash
   sudo systemctl status postgresql
   ```
2. 检查监听地址：
   ```bash
   sudo netstat -plntu | grep 5432
   ```
3. 检查 `pg_hba.conf` 配置：
   ```bash
   sudo nano /etc/postgresql/15/main/pg_hba.conf
   # 确保有以下行:
   # host    all             all             127.0.0.1/32            md5
   ```
4. 重启PostgreSQL：
   ```bash
   sudo systemctl restart postgresql
   ```
5. 测试连接：
   ```bash
   psql -h 127.0.0.1 -U danqing -d danqing_ai -c "SELECT 1;"
   ```

### 4.6 应急处理流程

**严重故障（服务完全不可用）**：

1. **立即响应**（5分钟内）：
   - 通知项目负责人
   - 启动回滚流程（详见第6章）
   - 记录故障时间点

2. **故障定位**（15分钟内）：
   - 查看Nginx错误日志：`sudo tail -f /var/log/nginx/error.log`
   - 查看后端日志：`pm2 logs danqing-ai-api --err`
   - 查看系统日志：`sudo journalctl -xe`

3. **临时恢复**（30分钟内）：
   - 如是代码问题：回滚到上一版本
   - 如是配置问题：恢复备份配置
   - 如是资源不足：重启服务释放内存

4. **事后复盘**（24小时内）：
   - 编写故障报告
   - 分析根本原因
   - 制定预防措施

---

## 5. 测试验证计划

### 5.1 功能测试

#### 5.1.1 用户认证测试

| 测试用例 | 操作步骤 | 预期结果 | 通过标准 |
|----------|----------|----------|----------|
| 飞书登录 | 1. 访问登录页<br>2. 点击飞书登录<br>3. 扫码授权 | 成功跳转回调页，写入Cookie，返回用户信息 | HTTP 200，Cookie包含JWT |
| JWT刷新 | 1. 等待access_token过期<br>2. 调用刷新接口 | 返回新的access_token | HTTP 200，新token可用 |
| 登出 | 点击登出按钮 | 清除Cookie，跳转登录页 | Cookie已删除 |
| 未授权访问 | 直接访问需鉴权API | 返回401 | HTTP 401 |

#### 5.1.2 作品上传与分析测试

| 测试用例 | 操作步骤 | 预期结果 | 通过标准 |
|----------|----------|----------|----------|
| 上传图片分析 | 1. 选择作品类型<br>2. 上传JPG图片（<10MB）<br>3. 提交分析 | 3秒内返回分析结果，包含维度评分和建议 | HTTP 200，响应时间<3s |
| 上传超大文件 | 上传>10MB图片 | 返回413错误 | HTTP 413 |
| 上传非图片文件 | 上传PDF文件 | 返回400错误 | HTTP 400 |
| 上传伪造图片 | 修改文件扩展名为jpg的文本文件 | 魔数校验失败，返回400 | HTTP 400 |
| 图片持久化 | 上传后访问返回的imageUrl | 图片可正常访问 | HTTP 200，图片显示正常 |

#### 5.1.3 历史记录查询测试

| 测试用例 | 操作步骤 | 预期结果 | 通过标准 |
|----------|----------|----------|----------|
| 查询自己的记录 | 学生账号查询历史 | 仅返回自己的记录 | 记录数正确 |
| 查询租户记录 | 教师账号查询历史 | 返回租户内所有记录 | 记录数正确 |
| 分页查询 | 查询第2页，每页10条 | 返回第11-20条记录 | 分页参数正确 |
| 越权访问 | 学生查询他人记录 | 返回404 | HTTP 404 |

#### 5.1.4 多租户隔离测试

| 测试用例 | 操作步骤 | 预期结果 | 通过标准 |
|----------|----------|----------|----------|
| 跨租户访问 | 租户A用户访问租户B数据 | 返回404或空结果 | 无法获取数据 |
| 租户数据隔离 | 查询数据库确认tenant_id过滤 | 所有查询包含tenant_id条件 | SQL日志验证 |

### 5.2 性能测试

#### 5.2.1 API响应时间测试

**测试工具**：Apache Bench (ab) / wrk

```bash
# 安装wrk
sudo apt install -y wrk

# 测试健康检查接口
wrk -t4 -c100 -d30s http://127.0.0.1:3000/health

# 测试分析接口（需替换token）
wrk -t4 -c50 -d60s -s post_analysis.lua http://127.0.0.1:3000/api/analyses
```

**通过标准**：
- 平均响应时间 < 500ms（健康检查）
- 95%响应时间 < 3s（AI分析）
- QPS ≥ 50（健康检查）
- 错误率 < 0.1%

#### 5.2.2 页面加载性能测试

**测试工具**：Lighthouse (Chrome DevTools)

**测试步骤**：
1. Chrome浏览器访问 `https://your-domain.com`
2. F12打开开发者工具 → Lighthouse
3. 选择Performance → Generate report

**通过标准**：
- First Contentful Paint (FCP) < 1.5s
- Largest Contentful Paint (LCP) < 2.5s
- Time to Interactive (TTI) < 3.5s
- Performance Score > 80

#### 5.2.3 并发压力测试

**测试工具**：JMeter / k6

**测试场景**：
- 50并发用户同时上传图片分析
- 100并发用户浏览页面

**通过标准**：
- 无服务崩溃
- 错误率 < 1%
- CPU使用率 < 80%
- 内存使用率 < 85%

### 5.3 安全测试

#### 5.3.1 SQL注入测试

**测试工具**：sqlmap

```bash
# 安装sqlmap
sudo apt install -y sqlmap

# 测试GET参数注入
sqlmap -u "https://your-domain.com/api/analyses?id=1" --cookie="access_token=xxx"

# 测试POST参数注入
sqlmap -u "https://your-domain.com/api/analyses" \
  --data="artType=painting&imageUrl=http://test.com/1.jpg" \
  --cookie="access_token=xxx"
```

**通过标准**：无可注入漏洞

#### 5.3.2 XSS跨站脚本测试

**测试方法**：
1. 在所有输入框输入：`<script>alert('XSS')</script>`
2. 提交后检查页面是否执行脚本

**通过标准**：所有输入均被转义，无脚本执行

#### 5.3.3 CSRF跨站请求伪造测试

**测试方法**：
1. 构造恶意HTML页面，包含自动提交的表单
2. 诱导已登录用户访问

**通过标准**：请求被拒绝（SameSite Cookie保护）

#### 5.3.4 越权访问测试

**测试用例**：
1. 学生A登录后，尝试访问学生B的分析记录
2. 修改URL中的ID参数

**通过标准**：返回404或403，无法访问他人数据

### 5.4 兼容性测试

| 浏览器 | 版本 | 测试结果 |
|--------|------|----------|
| Chrome | 最新版 | ☐通过 ☐不通过 |
| Firefox | 最新版 | ☐通过 ☐不通过 |
| Safari | 最新版 | ☐通过 ☐不通过 |
| Edge | 最新版 | ☐通过 ☐不通过 |
| 移动端Safari | iOS 15+ | ☐通过 ☐不通过 |
| 移动端Chrome | Android 10+ | ☐通过 ☐不通过 |

### 5.5 回归测试

部署后执行完整回归测试，确保新功能不影响现有功能。

**测试范围**：
- 所有API接口
- 前端所有页面
- 关键用户流程（登录→上传→分析→查看历史）

**通过标准**：所有测试用例100%通过

---

## 6. 回滚机制

### 6.1 回滚触发条件

满足以下任一条件时，立即执行回滚：

- **严重故障**：服务完全不可用，且30分钟内无法定位原因
- **数据损坏**：数据库数据错误或丢失
- **安全漏洞**：发现严重安全漏洞（如SQL注入、越权访问）
- **性能严重下降**：响应时间超过10秒，且无法快速优化
- **核心功能失效**：用户无法登录或无法上传分析

### 6.2 回滚决策人

- **主要决策人**：项目经理
- **技术决策人**：后端架构师
- **执行人**：运维工程师

### 6.3 回滚方案

#### 6.3.1 代码回滚

**前提**：使用Git管理代码，每次部署前打Tag

**回滚步骤**：

```bash
# 1. 查看最近的Tag
cd /var/www/danqing-ai
git tag -l

# 2. 回滚到上一个稳定版本（例如v1.0.0）
git checkout v1.0.0

# 3. 重新安装依赖（如有变化）
cd server
npm ci --production=false

cd ../client
npm ci

# 4. 重新编译
cd ../server
npm run build

cd ../client
npm run build

# 5. 重启服务
pm2 restart danqing-ai-api

# 6. 验证服务
curl http://127.0.0.1:3000/health
```

**预计耗时**：10分钟

#### 6.3.2 数据库回滚

**前提**：每日自动备份数据库

**回滚步骤**：

```bash
# 1. 停止后端服务（防止写入新数据）
pm2 stop danqing-ai-api

# 2. 备份当前数据库（以防需要恢复）
sudo -u postgres pg_dump danqing_ai > /backup/danqing_ai_before_rollback_$(date +%Y%m%d_%H%M%S).sql

# 3. 恢复到最近的备份（例如昨天的备份）
sudo -u postgres psql danqing_ai < /backup/danqing_ai_20260731_020000.sql

# 4. 重启服务
pm2 restart danqing-ai-api

# 5. 验证数据
psql -h 127.0.0.1 -U danqing -d danqing_ai -c "SELECT COUNT(*) FROM analyses;"
```

**预计耗时**：15分钟

**注意**：数据库回滚将丢失备份时间点之后的所有数据，需谨慎操作！

#### 6.3.3 Nginx配置回滚

**前提**：每次修改配置前备份

**回滚步骤**：

```bash
# 1. 恢复备份配置
sudo cp /etc/nginx/sites-available/danqing-ai.bak /etc/nginx/sites-available/danqing-ai

# 2. 测试配置
sudo nginx -t

# 3. 重载Nginx
sudo systemctl reload nginx
```

**预计耗时**：2分钟

#### 6.3.4 环境变量回滚

**前提**：保留历史版本的.env文件

**回滚步骤**：

```bash
# 1. 恢复备份的环境变量
cd /var/www/danqing-ai/server
cp .env.backup .env

# 2. 重启服务
pm2 restart danqing-ai-api
```

**预计耗时**：2分钟

### 6.4 完整回滚流程

**场景**：新版本部署后出现严重问题，需完整回滚

```bash
#!/bin/bash
# 回滚脚本 rollback.sh

echo "========== 开始回滚 =========="

# 1. 停止服务
echo "[1/6] 停止后端服务..."
pm2 stop danqing-ai-api

# 2. 回滚代码
echo "[2/6] 回滚代码到上一版本..."
cd /var/www/danqing-ai
git checkout v1.0.0  # 替换为实际的稳定版本Tag

# 3. 重新编译
echo "[3/6] 重新编译前后端..."
cd server && npm ci && npm run build
cd ../client && npm ci && npm run build

# 4. 回滚数据库（可选，谨慎操作）
read -p "是否需要回滚数据库？(y/n): " rollback_db
if [ "$rollback_db" = "y" ]; then
    echo "[4/6] 回滚数据库..."
    sudo -u postgres psql danqing_ai < /backup/danqing_ai_latest_stable.sql
else
    echo "[4/6] 跳过数据库回滚"
fi

# 5. 恢复Nginx配置（如有修改）
echo "[5/6] 检查Nginx配置..."
sudo nginx -t
if [ $? -ne 0 ]; then
    echo "Nginx配置错误，恢复备份..."
    sudo cp /etc/nginx/sites-available/danqing-ai.bak /etc/nginx/sites-available/danqing-ai
    sudo systemctl reload nginx
fi

# 6. 启动服务
echo "[6/6] 启动服务..."
pm2 restart danqing-ai-api

# 7. 验证服务
sleep 5
echo "验证服务状态..."
curl -f http://127.0.0.1:3000/health
if [ $? -eq 0 ]; then
    echo "========== 回滚成功 =========="
else
    echo "========== 回滚失败，请手动检查 =========="
    exit 1
fi
```

### 6.5 回滚验证

回滚完成后，执行以下验证：

- [ ] 服务正常启动，`/health` 返回200
- [ ] 核心功能正常（登录、上传、分析）
- [ ] 数据库数据完整（记录数一致）
- [ ] 无错误日志

### 6.6 回滚后处理

1. **记录回滚原因**：编写故障报告，记录回滚原因和影响范围
2. **通知相关人员**：告知项目组成员和用户（如有影响）
3. **分析根本原因**：定位问题，修复后重新部署
4. **更新文档**：将问题及解决方案补充到第4章预设解决方案

---

## 7. 运维监控方案

### 7.1 监控目标

- **可用性**：系统7×24小时可用，故障及时发现
- **性能**：响应时间、吞吐量满足SLA
- **资源**：CPU、内存、磁盘、网络使用率可控
- **安全**：异常访问、攻击行为及时发现

### 7.2 关键指标监控

#### 7.2.1 系统级监控

| 监控项 | 采集方式 | 告警阈值 | 告警级别 |
|--------|----------|----------|----------|
| CPU使用率 | Node Exporter | > 80% 持续5分钟 | 警告 |
| 内存使用率 | Node Exporter | > 85% | 警告 |
| 磁盘使用率 | Node Exporter | > 90% | 严重 |
| 网络流量 | Node Exporter | 带宽>90% | 警告 |
| 系统负载 | Node Exporter | load5 > 4 | 警告 |

#### 7.2.2 应用级监控

| 监控项 | 采集方式 | 告警阈值 | 告警级别 |
|--------|----------|----------|----------|
| API响应时间 | Prometheus + Grafana | P95 > 3s | 警告 |
| API错误率 | Prometheus | > 1% | 严重 |
| QPS | Prometheus | 突增>200% | 警告 |
| PM2进程状态 | PM2 Monitor | 进程宕机 | 严重 |
| Node.js内存 | PM2 Monitor | > 1.5GB | 警告 |

#### 7.2.3 数据库监控

| 监控项 | 采集方式 | 告警阈值 | 告警级别 |
|--------|----------|----------|----------|
| PostgreSQL连接数 | postgres_exporter | > 80 | 警告 |
| 慢查询 | pg_stat_statements | > 1s | 警告 |
| 数据库大小 | postgres_exporter | > 50GB | 警告 |
| Redis内存使用 | redis_exporter | > 400MB | 警告 |
| Redis命中率 | redis_exporter | < 80% | 警告 |

#### 7.2.4 日志监控

| 日志类型 | 监控内容 | 告警条件 |
|----------|----------|----------|
| Nginx错误日志 | 5xx错误、超时 | 每分钟>10条 |
| 后端错误日志 | ERROR级别日志 | 每分钟>5条 |
| 数据库慢查询日志 | 查询时间>1s | 每小时>10条 |
| 安全日志 | 401/403错误 | 每分钟>20条（疑似攻击） |

### 7.3 监控工具部署

#### 7.3.1 使用PM2内置监控（轻量级，推荐）

```bash
# 安装PM2监控模块
pm2 install pm2-server-monit

# 查看监控面板
pm2 monit
```

**监控内容**：
- CPU使用率
- 内存使用率
- 进程状态
- 日志滚动

#### 7.3.2 使用Netdata（实时监控，推荐）

```bash
# 安装Netdata
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# 访问监控面板
# http://YOUR_SERVER_IP:19999
```

**监控内容**：
- 系统资源（CPU、内存、磁盘、网络）
- 应用性能（Nginx、Node.js、PostgreSQL、Redis）
- 实时图表

#### 7.3.3 使用Prometheus + Grafana（专业级，可选）

**部署步骤**：

```bash
# 1. 安装Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*
./prometheus --config.file=prometheus.yml &

# 2. 安装Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
tar xvfz node_exporter-*.tar.gz
cd node_exporter-*
./node_exporter &

# 3. 安装Grafana
sudo apt install -y grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# 4. 访问Grafana
# http://YOUR_SERVER_IP:3000 (默认账号admin/admin)
```

**配置监控面板**：导入预设Dashboard模板

### 7.4 告警机制

#### 7.4.1 告警渠道

| 渠道 | 配置方式 | 适用场景 |
|------|----------|----------|
| 邮件 | SMTP配置 | 非紧急告警 |
| 飞书机器人 | Webhook | 实时告警（推荐） |
| 短信 | 腾讯云短信 | 严重告警 |
| 电话 | 腾讯云电话告警 | 紧急故障 |

#### 7.4.2 飞书机器人告警配置

```bash
# 创建飞书群机器人，获取Webhook URL
# 在飞书群设置 → 群机器人 → 添加机器人 → 自定义机器人

# 编写告警脚本
cat > /home/danqing/alert.sh <<'EOF'
#!/bin/bash
WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_TOKEN"
MESSAGE="$1"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"msg_type\": \"text\",
    \"content\": {
      \"text\": \"$MESSAGE\"
    }
  }"
EOF

chmod +x /home/danqing/alert.sh

# 测试告警
/home/danqing/alert.sh "测试告警消息"
```

#### 7.4.3 告警规则配置示例

**使用PM2触发告警**：

```bash
# 监控PM2进程状态，宕机时发送告警
pm2 start danqing-ai-api --name danqing-ai-api --watch --max-memory-restart 1G

# 配置PM2事件监听（需自定义脚本）
cat > /home/danqing/pm2_alert.js <<'EOF'
const pm2 = require('pm2');
const { exec } = require('child_process');

pm2.launchBus((err, bus) => {
  bus.on('process:event', (data) => {
    if (data.event === 'exit' || data.event === 'error') {
      const message = `【告警】PM2进程异常: ${data.process.name} - ${data.event}`;
      exec(`/home/danqing/alert.sh "${message}"`);
    }
  });
});
EOF

pm2 start /home/danqing/pm2_alert.js --name pm2-alert
```

### 7.5 日常维护流程

#### 7.5.1 每日巡检

**执行时间**：每天上午9:00

**巡检内容**：

```bash
#!/bin/bash
# 每日巡检脚本 daily_check.sh

echo "========== 丹青有AI 每日巡检 =========="
echo "巡检时间: $(date)"

# 1. 检查服务状态
echo "\n[1/6] 检查服务状态..."
pm2 status
sudo systemctl status nginx postgresql redis-server --no-pager | grep "Active:"

# 2. 检查磁盘空间
echo "\n[2/6] 检查磁盘空间..."
df -h | grep -E "/$|/lhcos-data"

# 3. 检查内存使用
echo "\n[3/6] 检查内存使用..."
free -h

# 4. 检查错误日志
echo "\n[4/6] 检查错误日志(最近50条)..."
pm2 logs danqing-ai-api --err --lines 50 --nostream

# 5. 检查数据库连接
echo "\n[5/6] 检查数据库连接..."
psql -h 127.0.0.1 -U danqing -d danqing_ai -c "SELECT COUNT(*) FROM analyses;" -t

# 6. 检查HTTPS证书有效期
echo "\n[6/6] 检查HTTPS证书有效期..."
echo | openssl s_client -connect your-domain.com:443 -servername your-domain.com 2>/dev/null | openssl x509 -noout -dates

echo "\n========== 巡检完成 =========="
```

**输出示例**：
```
========== 丹青有AI 每日巡检 ==========
巡检时间: Mon Aug 1 09:00:00 UTC 2026

[1/6] 检查服务状态...
● nginx.service - Active: active (running)
● postgresql.service - Active: active (running)
● redis-server.service - Active: active (running)

[2/6] 检查磁盘空间...
/dev/vda1        60G   25G   33G  43% /
cosfs           100G  5.2G   95G   6% /lhcos-data

[3/6] 检查内存使用...
              total        used        free      shared  buff/cache   available
Mem:          3.8Gi       2.1Gi       512Mi        89Mi       1.2Gi       1.4Gi

========== 巡检完成 ==========
```

#### 7.5.2 每周维护

**执行时间**：每周一凌晨2:00（低峰期）

**维护内容**：

```bash
#!/bin/bash
# 每周维护脚本 weekly_maintenance.sh

echo "========== 每周维护任务 =========="

# 1. 清理PM2日志
echo "[1/5] 清理PM2日志..."
pm2 flush

# 2. 清理Nginx日志(保留7天)
echo "[2/5] 清理Nginx日志..."
find /var/log/nginx/ -name "*.log" -mtime +7 -delete
sudo systemctl reload nginx  # 重新打开日志文件

# 3. 清理系统日志
echo "[3/5] 清理系统日志..."
sudo journalctl --vacuum-time=7d

# 4. 数据库VACUUM(回收空间)
echo "[4/5] 数据库VACUUM..."
sudo -u postgres psql danqing_ai -c "VACUUM ANALYZE;"

# 5. 更新系统安全补丁(需人工确认)
echo "[5/5] 检查系统更新..."
sudo apt update
apt list --upgradable

echo "========== 维护完成 =========="
```

#### 7.5.3 每月维护

**执行时间**：每月1号凌晨3:00

**维护内容**：

1. **数据库完整备份**：
   ```bash
   sudo -u postgres pg_dump danqing_ai | gzip > /backup/danqing_ai_full_$(date +%Y%m).sql.gz
   ```

2. **依赖安全扫描**：
   ```bash
   cd /var/www/danqing-ai/server
   npm audit
   cd ../client
   npm audit
   ```

3. **性能分析**：
   - 导出Prometheus/Grafana监控数据
   - 分析慢查询日志
   - 优化数据库索引

4. **SSL证书检查**：
   ```bash
   sudo certbot renew --dry-run
   ```

### 7.6 备份策略

#### 7.6.1 数据库备份

**备份频率**：
- **每日增量备份**：每天凌晨2:00
- **每周完整备份**：每周一凌晨3:00
- **每月归档备份**：每月1号凌晨4:00（保留3个月）

**备份脚本**：

```bash
#!/bin/bash
# 数据库备份脚本 backup_db.sh

BACKUP_DIR="/backup/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/danqing_ai_$DATE.sql"
RETENTION_DAYS=7

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
sudo -u postgres pg_dump danqing_ai > $BACKUP_FILE

# 压缩备份文件
gzip $BACKUP_FILE

# 删除过期备份
find $BACKUP_DIR -name "danqing_ai_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "备份完成: $BACKUP_FILE.gz"

# 发送告警（可选）
/home/danqing/alert.sh "数据库备份完成: danqing_ai_$DATE.sql.gz"
```

**配置定时任务**：

```bash
# 编辑crontab
crontab -e

# 添加以下行:
# 每天凌晨2:00执行数据库备份
0 2 * * * /home/danqing/backup_db.sh >> /var/log/backup_db.log 2>&1

# 每周一凌晨3:00执行完整备份
0 3 * * 1 /home/danqing/backup_db_full.sh >> /var/log/backup_db_full.log 2>&1
```

#### 7.6.2 文件备份

**备份内容**：
- 代码仓库（Git自动备份到GitHub）
- 环境变量配置文件（.env）
- Nginx配置文件

**备份脚本**：

```bash
#!/bin/bash
# 配置文件备份脚本 backup_config.sh

BACKUP_DIR="/backup/config"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# 备份环境变量
cp /var/www/danqing-ai/server/.env $BACKUP_DIR/env_$DATE.backup

# 备份Nginx配置
cp /etc/nginx/sites-available/danqing-ai $BACKUP_DIR/nginx_$DATE.conf

echo "配置备份完成: $DATE"
```

#### 7.6.3 COS数据备份

轻量COS已实现数据持久化，无需额外备份。但建议：

- **定期检查COS挂载状态**：`df -h | grep lhcos`
- **监控COS存储容量**：腾讯云控制台设置容量告警
- **异地容灾**（可选）：定期同步COS数据到另一存储桶

### 7.7 故障恢复流程

#### 7.7.1 服务宕机恢复

**场景**：PM2进程崩溃或服务器重启

**恢复步骤**：

```bash
# 1. 检查PM2进程状态
pm2 status

# 2. 如进程停止，重启服务
pm2 restart danqing-ai-api

# 3. 如PM2未启动，先启动PM2
pm2 resurrect  # 恢复上次保存的进程列表

# 4. 如服务器重启后PM2未自启，检查自启配置
sudo systemctl status pm2-danqing

# 5. 验证服务
curl http://127.0.0.1:3000/health
```

#### 7.7.2 数据库故障恢复

**场景**：数据库数据损坏或误删除

**恢复步骤**：

```bash
# 1. 停止后端服务
pm2 stop danqing-ai-api

# 2. 恢复到最近的备份
sudo -u postgres psql danqing_ai < /backup/postgresql/danqing_ai_20260731_020000.sql

# 3. 重启服务
pm2 restart danqing-ai-api

# 4. 验证数据
psql -h 127.0.0.1 -U danqing -d danqing_ai -c "SELECT COUNT(*) FROM analyses;"
```

#### 7.7.3 磁盘空间不足恢复

**场景**：磁盘使用率超过90%

**恢复步骤**：

```bash
# 1. 查找大文件
sudo du -h --max-depth=1 / | sort -hr | head -20

# 2. 清理日志文件
sudo find /var/log -name "*.log" -mtime +7 -delete
sudo journalctl --vacuum-time=7d
pm2 flush

# 3. 清理npm缓存
npm cache clean --force

# 4. 清理apt缓存
sudo apt clean
sudo apt autoremove -y

# 5. 重启服务
sudo systemctl restart nginx
pm2 restart all
```

### 7.8 性能优化建议

#### 7.8.1 短期优化（本次部署）

- ✅ 启用Nginx gzip压缩
- ✅ 配置静态资源缓存（30天）
- ✅ 使用Redis缓存分析结果
- ✅ PM2 Cluster模式（2实例）
- ✅ PostgreSQL连接池配置

#### 7.8.2 长期优化（后续迭代）

- ⏳ CDN加速静态资源（腾讯云CDN）
- ⏳ 图片懒加载和WebP格式转换
- ⏳ 数据库读写分离（主从复制）
- ⏳ Redis集群（高可用）
- ⏳ API网关（限流、熔断、降级）
- ⏳ 容器化部署（Docker + Kubernetes）

---

## 8. 附录

### 8.1 联系信息

| 角色 | 姓名 | 联系方式 | 职责 |
|------|------|----------|------|
| 项目经理 | [待填写] | [待填写] | 整体协调、决策 |
| 后端架构师 | [待填写] | [待填写] | 技术方案、代码审查 |
| 前端负责人 | [待填写] | [待填写] | 前端部署、兼容性测试 |
| 运维工程师 | [待填写] | [待填写] | 服务器运维、监控、故障处理 |
| 安全工程师 | [待填写] | [待填写] | 安全评审、漏洞扫描 |

### 8.2 参考文档

- [服务器配置文档](./server-config.md)
- [数据库设计文档](../server/prisma/schema.prisma)
- [API接口文档](../server/docs/api-contract.md)
- [Nginx配置文件](../deploy/nginx.conf)
- [环境变量模板](../server/.env.production)
- [腾讯云轻量应用服务器文档](https://cloud.tencent.com/document/product/1207)
- [腾讯云COS文档](https://cloud.tencent.com/document/product/436)

### 8.3 变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| v1.0.0 | 2026-08-01 | 初始版本，完整部署实施文档 | AI助手 |

### 8.4 术语表

| 术语 | 说明 |
|------|------|
| SLA | Service Level Agreement，服务等级协议 |
| RBAC | Role-Based Access Control，基于角色的访问控制 |
| JWT | JSON Web Token，JSON网络令牌 |
| COS | Cloud Object Storage，云对象存储 |
| PM2 | Process Manager 2，Node.js进程管理工具 |
| ORM | Object-Relational Mapping，对象关系映射 |
| HSTS | HTTP Strict Transport Security，HTTP严格传输安全 |
| CSRF | Cross-Site Request Forgery，跨站请求伪造 |
| XSS | Cross-Site Scripting，跨站脚本攻击 |

---

**文档审批签字**：

- 技术评审：________________ 日期：________
- 安全评审：________________ 日期：________
- 合规性审查：______________ 日期：________
- 项目经理批准：____________ 日期：________

---

**文档结束**
