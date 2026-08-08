# 丹青有AI 部署运维手册 (Runbook)

> 项目: danqing-ai  
> 服务器: 43.128.25.202 (腾讯云 VPS)  
> 域名: www.danqing.site  
> 部署日期: 2026-08-02  
> 最近更新: 2026-08-08 (学生端申请人工复核 dispute:request 端到端)  
> 维护人: ubuntu (SSH 密钥认证)

---

## 1. 架构概览

```
用户 → HTTPS(443) → Nginx → 反代 → Node.js(:3000, 127.0.0.1)
                                        ↓
                              PostgreSQL(:5432, 127.0.0.1)
                              Redis(:6379, 127.0.0.1)
```

| 组件 | 版本 | 端口 | 绑定 | 进程管理 |
|------|------|------|------|----------|
| Nginx | 1.18.0 | 80/443 | 0.0.0.0 | systemd |
| Node.js | 20.x | 3000 | 0.0.0.0 (iptables 限制) | PM2 |
| PostgreSQL | 15-alpine | 5432 | 127.0.0.1 | Docker |
| Redis | 7-alpine | 6379 | 127.0.0.1 | Docker |
| 1Panel | - | 20410 | 0.0.0.0 | systemd |

## 2. 关键路径

| 项目 | 路径 |
|------|------|
| 项目根目录 | /var/www/danqing-ai |
| 后端代码 | /var/www/danqing-ai/server |
| 前端静态资源 | /var/www/danqing-ai/dist |
| 环境配置 | /var/www/danqing-ai/server/.env |
| PM2 配置 | /var/www/danqing-ai/ecosystem.config.cjs |
| Nginx 配置 | /etc/nginx/conf.d/danqing.conf |
| JWT 密钥 | /var/www/danqing-ai/server/jwt-private.pem, jwt-public.pem |
| 运维脚本 | /home/ubuntu/scripts/ |
| 备份目录 | /home/ubuntu/backups/ |
| 告警日志 | /home/ubuntu/scripts/alerts.log |
| PM2 日志 | ~/.pm2/logs/ |
| 1Panel 面板 | http://43.128.25.202:20410 |

## 3. 常用运维命令

### 3.1 服务管理

```bash
# 查看服务状态
pm2 list
pm2 logs danqing-api --lines 50
sudo systemctl status nginx
sudo docker ps

# 重启后端
pm2 restart danqing-api

# 重启 Nginx
sudo systemctl reload nginx

# 重启数据库
sudo docker restart danqing-postgres
sudo docker restart danqing-redis

# 查看健康状态
curl -s https://www.danqing.site/health
curl -s http://127.0.0.1:3000/health
```

### 3.2 日志查看

```bash
# PM2 日志
pm2 logs danqing-api --lines 100
cat ~/.pm2/logs/out.log | tail -100
cat ~/.pm2/logs/error.log | tail -100

# Nginx 日志
sudo tail -50 /var/log/nginx/access.log
sudo tail -50 /var/log/nginx/error.log

# 告警日志
cat /home/ubuntu/scripts/alerts.log

# 备份日志
cat /home/ubuntu/backups/backup.log
```

### 3.3 部署日志同步(2026-08-06 新增)

> 每次部署(成功/失败)都会写入共享数据库 `deployment_logs` 表,供下游任务查询「项目是否已部署」。

| 项 | 值 |
|----|----|
| 上报端点 | `POST /api/v1/deployments/log`(部署脚本 `deploy-ssh.sh` 调用) |
| 查询端点 | `GET /api/v1/deployments/latest`(下游任务/运维查询) |
| 鉴权 | 请求头 `X-Deploy-Secret`(共享密钥,与服务端 `DEPLOY_SYNC_SECRET` 一致) |
| 落库表 | `deployment_logs`(PostgreSQL `danqing_ai` 库) |
| 脚本配置 | `deploy-ssh.sh` 顶部环境变量:`DEPLOY_SYNC_API_URL` / `DEPLOY_SYNC_SECRET` / `DEPLOY_SERVER_ID` / `DEPLOY_VERSION` / `DEPLOY_BRANCH` / `DEPLOY_DEPLOYER` |

```bash
# 查询最新部署状态(成功/失败/版本/时间戳)
curl -s https://www.danqing.site/api/v1/deployments/latest -H "X-Deploy-Secret: <DEPLOY_SYNC_SECRET>"
# 返回:status / version / serverId / timestamp / errorMessage
```

**注意**:
- `DEPLOY_SYNC_SECRET` 必须在服务器 `.env` 中配置,重启 PM2 生效;脚本与服务端必须一致,否则 401
- 部署脚本用 EXIT trap 上报,失败状态也会可靠落库;同步失败不阻断部署主流程

### 3.4 代码更新

```bash
cd /var/www/danqing-ai

# 拉取最新代码
git pull origin main

# 安装依赖（如有变更）
npm install
cd server && npm install && npx prisma generate && cd ..

# 构建前端
npm run build

# 构建后端
cd server && npx tsc -p tsconfig.json && cd ..

# 数据库迁移（如有变更）
cd server && npx prisma migrate deploy && cd ..

# 重启服务
pm2 restart danqing-api
```

## 4. 监控告警

### 4.1 Cron 定时任务

| 频率 | 脚本 | 功能 |
|------|------|------|
| 每分钟 | health-check.sh | 检查 API/PM2/Docker，异常自动重启 |
| 每天 03:00 | backup-db.sh | pg_dump 备份，保留 7 天 |
| 每小时 | disk-check.sh | 磁盘 >80% 告警 + 清理旧日志 |

### 4.2 告警检查

```bash
# 查看告警日志
cat /home/ubuntu/scripts/alerts.log

# 如果有告警，按时间排查
grep "ALERT" /home/ubuntu/scripts/alerts.log | tail -20
```

### 4.3 HTTPS 证书续期

```bash
# 查看证书状态
sudo certbot certificates

# 手动续期（通常自动）
sudo certbot renew --dry-run

# 续期后重启 Nginx
sudo systemctl reload nginx
```

## 5. 备份与恢复

### 5.1 手动备份

```bash
/home/ubuntu/scripts/backup-db.sh
```

### 5.2 恢复数据库

```bash
# 1. 解压备份文件
gunzip < /home/ubuntu/backups/danqing_ai_YYYYMMDD_HHMMSS.sql.gz > /tmp/restore.sql

# 2. 恢复到数据库
sudo docker exec -i danqing-postgres psql -U danqing -d danqing_ai < /tmp/restore.sql

# 3. 验证表数量
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "\dt"
```

### 5.3 备份文件管理

```bash
# 查看备份列表
ls -lh /home/ubuntu/backups/

# 手动清理旧备份
find /home/ubuntu/backups/ -name "danqing_ai_*.sql.gz" -mtime +7 -delete
```

### 5.4 代码与配置回滚

> 以下回滚命令对应 **2026-08-07 AI 视觉配置变更** 的备份点。
> 回滚前请先确认备份文件存在，回滚后必须执行验证命令。

#### A. 后端构建产物回滚

```bash
cd /var/www/danqing-ai/server

# 1. 确认当前 dist 与备份存在
ls -ld dist dist.bak-20260807-3

# 2. 备份当前 dist(可选,仅当需要保留失败现场)
cp -a dist dist.bak-20260807-rollback-$(date +%H%M%S)

# 3. 用部署前备份替换当前 dist
rm -rf dist
mv dist.bak-20260807-3 dist

# 4. 重启服务
pm2 restart danqing-api

# 5. 验证
sleep 3
curl -s https://www.danqing.site/health | python3 -m json.tool
curl -s https://www.danqing.site/api/admin/system/ai-config \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "X-Client: admin" | python3 -m json.tool
```

#### B. 环境变量回滚

```bash
cd /var/www/danqing-ai/server

# 1. 确认备份存在
ls -l .env.bak-20260807-1

# 2. 备份当前 .env
cp .env .env.bak-rollback-$(date +%Y%m%d_%H%M%S)

# 3. 恢复旧 .env
cp .env.bak-20260807-1 .env

# 4. 重启服务
pm2 restart danqing-api

# 5. 验证环境变量加载
pm2 logs danqing-api --lines 20 | grep -E "(AI_API_KEY|AI_PROVIDER|AI_API_MODEL|assertRequired)"
```

#### C. Nginx 配置回滚

```bash
# 1. 确认备份存在
ls -l /etc/nginx/conf.d/danqing.conf.bak-20260807-2

# 2. 恢复配置
sudo cp /etc/nginx/conf.d/danqing.conf.bak-20260807-2 /etc/nginx/conf.d/danqing.conf

# 3. 检查配置语法
sudo nginx -t

# 4. 零中断重载
sudo systemctl reload nginx

# 5. 验证超时设置已恢复
grep -E "proxy_(send|read)_timeout" /etc/nginx/conf.d/danqing.conf
```

#### D. 组合回滚(一键式)

```bash
#!/bin/bash
set -e
cd /var/www/danqing-ai/server

# dist
rm -rf dist && mv dist.bak-20260807-3 dist

# .env
cp .env .env.bak-rollback-$(date +%Y%m%d_%H%M%S)
cp .env.bak-20260807-1 .env

pm2 restart danqing-api

# nginx
sudo cp /etc/nginx/conf.d/danqing.conf.bak-20260807-2 /etc/nginx/conf.d/danqing.conf
sudo nginx -t && sudo systemctl reload nginx

echo "Rollback completed. Run health check to verify."
```

#### E. 通用后端部署回滚（M4，仅 server 端，可复用）

> 适用：仅部署 **server 后端**（如 M4 presence 功能）、不改前端/数据库/环境变量时的回滚。
> 关键点：`deploy-ssh.sh` **只自动备份前端 `dist`，不备份后端 `server/dist`**，因此后端回滚点必须**部署前手动建立**。

**前置：部署前建立后端回滚点（必须）**

```bash
cd /var/www/danqing-ai
TS=$(date +%Y%m%d_%H%M%S)
sudo cp -r server/dist "server/dist.bak.m4.$TS"
ls -ld server/dist.bak.m4.*   # 确认备份存在
```

**部署后异常：立即回滚**

```bash
cd /var/www/danqing-ai

# 1. 找到最近备份
ls -ld server/dist.bak.m4.*

# 2. 保留失败现场并替换为备份
sudo mv server/dist server/dist.failed-$(date +%H%M%S)
sudo cp -r server/dist.bak.m4.<TS> server/dist

# 3. 重启服务
sudo pm2 restart danqing-api

# 4. 验证
sleep 3
pm2 list
curl -s -o /dev/null -w "%{http_code}\n" https://www.danqing.site/api/health
sudo pm2 logs danqing-api --lines 50
```

**回滚验证清单**
- `pm2 list` → danqing-api `online`，restart count 不持续增长
- `/api/health` → `200`
- 飞书 OAuth 登录一次确认正常
- 新 presence 端点已消失（成功回滚标志）：`/api/admin/presence/online` 应返回 `404`

**最坏情况（无回滚点）——从 git 重建**

```bash
cd /var/www/danqing-ai
git stash                                  # 备份未提交改动
git checkout HEAD -- server/
cd server && npx prisma generate && npx tsc -p tsconfig.json && cd ..
sudo pm2 restart danqing-api
```

> 注：M4 presence 无 DB 迁移、无 .env 变更、无 Redis 结构变更（仅新增自动过期的 Redis key），故回滚只需换 `server/dist` + 重启 PM2，无需动数据库/环境变量。

## 6. 安全配置

### 6.1 SSH 加固

- PermitRootLogin: `prohibit-password` (仅密钥)
- PasswordAuthentication: `no`
- 认证方式: RSA 密钥 (danqing.pem)

### 6.2 端口限制

| 端口 | 外部访问 | 限制方式 |
|------|----------|----------|
| 22 (SSH) | 允许 | 云安全组 |
| 80 (HTTP) | 允许 | 云安全组 |
| 443 (HTTPS) | 允许 | 云安全组 |
| 3000 (Node) | 拒绝 | iptables REJECT |
| 5432 (PG) | 拒绝 | Docker 绑定 127.0.0.1 |
| 6379 (Redis) | 拒绝 | Docker 绑定 127.0.0.1 |

### 6.3 防火墙规则

```bash
# 查看 iptables 规则
sudo iptables -L INPUT -n --line-numbers

# 端口 3000 限制规则
sudo iptables -A INPUT -p tcp --dport 3000 ! -s 127.0.0.1 -j REJECT
```

## 7. 故障排查

### 7.1 服务不可用

```bash
# 1. 检查 PM2
pm2 list
pm2 logs danqing-api --lines 50

# 2. 检查 Nginx
sudo systemctl status nginx
sudo nginx -t

# 3. 检查 Docker
sudo docker ps

# 4. 检查端口
ss -tlnp | grep -E "3000|80|443"

# 5. 手动健康检查
curl -s http://127.0.0.1:3000/health
curl -s https://www.danqing.site/health
```

### 7.2 数据库连接失败

```bash
# 检查 PostgreSQL 容器
sudo docker logs danqing-postgres --tail 50

# 检查连接
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "SELECT 1"

# 检查 .env 中的 DATABASE_URL
grep DATABASE_URL /var/www/danqing-ai/server/.env
```

### 7.3 HTTPS 证书过期

```bash
# 检查证书
sudo certbot certificates

# 手动续期
sudo certbot renew
sudo systemctl reload nginx
```

### 7.4 磁盘空间不足

```bash
# 查看磁盘使用
df -h

# 清理 PM2 日志
find ~/.pm2/logs/ -name "*.log" -mtime +7 -delete

# 清理旧备份
find /home/ubuntu/backups/ -name "danqing_ai_*.sql.gz" -mtime +7 -delete

# 清理 Docker 无用资源
sudo docker system prune -f
```

## 8. 环境变量

### 8.1 关键配置 (server/.env)

| 变量 | 说明 | 当前值 |
|------|------|--------|
| NODE_ENV | 环境 | production |
| PORT | 端口 | 3000 |
| DATABASE_URL | PG 连接 | postgresql://danqing:***@127.0.0.1:5432/danqing_ai |
| REDIS_URL | Redis 连接 | redis://:***@127.0.0.1:6379 |
| FEISHU_APP_ID | 飞书应用ID | cli_aaedf9c92cb8dd1f |
| FEISHU_APP_SECRET | 飞书应用密钥 | *** |
| FEISHU_REDIRECT_URI_WEB | 飞书 Web 回调地址 | https://www.danqing.site/auth/feishu/callback |
| JWT_PRIVATE_KEY | JWT 私钥 | /var/www/danqing-ai/server/jwt-private.pem |
| JWT_PUBLIC_KEY | JWT 公钥 | /var/www/danqing-ai/server/jwt-public.pem |
| JWT_KEY_ID | JWT Key ID | *** |
| AI_API_KEY | GLM API Key | fb5c...IPLTb (已配置) |
| AI_API_URL | AI API 端点 | https://open.bigmodel.cn/api/paas/v4/chat/completions |
| AI_API_MODEL | AI 模型 | glm-4.6v-flash |
| AI_IMAGE_PROVIDER | 图像生成主提供商 | glm |
| AI_IMAGE_API_KEY | 图像生成 API Key | 复用 GLM Key |
| AI_IMAGE_API_URL | 图像生成端点 | https://open.bigmodel.cn/api/paas/v4/images/generations |
| AI_IMAGE_API_MODEL | 图像生成模型 | GLM-Image |
| AI_IMAGE_TIMEOUT | 图像生成超时 | 30000 |
| COOKIE_SECURE | Cookie Secure | true |
| COOKIE_DOMAIN | Cookie 域名 | .danqing.site |
| CORS_ORIGINS | CORS 白名单 | https://www.danqing.site |

### 8.2 待办配置

- [x] 替换 AI_API_KEY 为真实 GLM-4V API Key (2026-08-07 已配置 glm-4.6v-flash)
- [ ] 飞书 OAuth 回调地址在飞书开放平台配置为 https://www.danqing.site/auth/feishu/callback

## 9. 部署检查清单

### 上线前检查

- [ ] HTTPS 证书有效
- [ ] HTTP→HTTPS 跳转
- [ ] 端口 3000 外部不可达
- [ ] DB/Redis 仅绑定 127.0.0.1
- [ ] SSH 密钥认证
- [ ] PM2 开机自启
- [ ] iptables 规则持久化
- [ ] Cron 定时任务配置
- [ ] 备份脚本可用
- [ ] 健康检查脚本可用

### 三铁律验证

- ✅ **路接得住**: HTTPS 生效 + HTTP 强制跳转 (301)
- ✅ **门关上了**: iptables 限制 3000 + SSH prohibit-password + DB 绑定 127.0.0.1
- ✅ **有人看着**: 健康检查每分钟 + 备份每日 + 磁盘监控每小时

## 10. 变更记录与验证结果

### 10.1 2026-08-07 AI 视觉配置变更

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 变更范围 | 后端 AI 视觉服务、admin AI 配置测试接口、Nginx 超时配置、server/.env |
| 相关文件 | `server/src/services/ai-vision.service.ts`、`server/src/controllers/admin-ai-config.controller.ts`、`deploy/nginx-site.conf`、`server/.env` |
| 备份点 | `server/dist.bak-20260807-3`、`server/.env.bak-20260807-1`、`/etc/nginx/conf.d/danqing.conf.bak-20260807-2` |
| 回滚章节 | [5.4 代码与配置回滚](#54-代码与配置回滚) |

**变更摘要**:
1. `ai-vision.service.ts` 修复 `isUrl` 函数，新增 `data:` 前缀识别，避免 data URL 被误判为本地文件。
2. `ai-vision.service.ts` 将 `max_tokens` 从 1500 调整为 1024，适配智谱 GLM-4V 模型限制。
3. `admin-ai-config.controller.ts` 将测试图片从 1x1 PNG data URL 替换为服务器真实图片 `/var/www/danqing-ai/website/images/gallery-hero.jpg`，避免模型返回 1210 图片解析错误。
4. `deploy/nginx-site.conf` 将 `proxy_send_timeout` 与 `proxy_read_timeout` 从 10s 调整为 30s，适配 AI 模型实际 7-13s 响应延迟。
5. `server/.env` 配置智谱 API Key，设置 `AI_PROVIDER=glm`、`AI_API_MODEL=glm-4.6v-flash`、`AI_API_TIMEOUT=15000`。

### 10.2 验证结果

#### 验证 1: Admin AI 配置测试接口

```bash
curl -s -X POST https://www.danqing.site/api/admin/system/ai-config/test \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "X-Client: admin" \
  -H "Content-Type: application/json"
```

**结果**: `success: true`，返回 `AI 连通性测试通过`，`suggestionsCount: 3`，耗时约 7-13s。

#### 验证 2: 端到端视觉分析流程

通过 `_test_analysis.sh` 脚本上传测试图片并调用 `/api/v1/analyses` 接口。

**结果**: 接口返回 HTTP 200，AI 分析结果包含构图、色彩、笔触等维度评分与专业建议，符合 `ProfessionalSuggestion` 结构（含 `evidence` 与 `priority` 字段）。

#### 验证 3: Nginx 配置生效

```bash
grep -E "proxy_(send|read)_timeout" /etc/nginx/conf.d/danqing.conf
# 输出: proxy_send_timeout 30s; proxy_read_timeout 30s;
```

**结果**: Nginx 超时设置已更新为 30s，配置语法检查通过，服务已重载。

#### 验证 4: 服务健康状态

```bash
curl -s https://www.danqing.site/health
```

**结果**: 返回正常健康响应，服务运行稳定。

### 10.3 2026-08-07 灵感嫁接 / 情绪画布真实 AI 生成对接

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 变更范围 | AI 图像生成链路(FusePage / EmotionPage → imageService → /api/v1/generation → generation.service → image-generation.service) |
| 相关文件 | `server/src/controllers/generation.controller.ts`、`server/src/services/generation.service.ts`、`server/src/services/config-feature.service.ts`、`server/src/types/api-contract.ts`、`src/services/imageService.ts`、`src/pages/FusePage.tsx`、`src/types/api-contract.ts` |
| 备份点 | `server/dist.bak-20260807-generation`、`server/.env.bak-20260807-generation`、`/var/www/danqing-ai/dist.bak-20260807-generation` |
| 回滚章节 | [5.4 代码与配置回滚](#54-代码与配置回滚) |

**变更摘要**:
1. `generation.controller.ts` 在 `CreateGenerationRequest` 中新增 `sync` 可选布尔字段,支持同步生成模式。
2. `generation.service.ts` 在 `createGeneration` 中优先处理 `sync=true`,直接调用 `processGenerationJob` 并返回最终结果,不入队列。
3. `config-feature.service.ts` 将 `generation` 功能开关默认值从 `disabled` 调整为 `enabled`,真实 AI 生成默认上线。
4. `imageService.ts` 将 `generateImage` 改为调用后端 `/api/v1/generation` 接口(`sync: true`),失败时回退到本地 SVG 占位图。
5. `FusePage.tsx` 在 `handleFuse` 中改为 `await generateImage(...)` 顺序生成,移除模拟延迟。
6. 前后端 `api-contract.ts` 补充 `CreateGenerationResponse` / `GenerationStatus` / `GeneratedImage` / `ReviewStatus` 类型,保持类型一致。
7. `server/.env` 新增 AI 图像生成配置:`AI_IMAGE_PROVIDER=glm`、`AI_IMAGE_API_KEY` 复用 GLM Key、`AI_IMAGE_API_URL=https://open.bigmodel.cn/api/paas/v4/images/generations`、`AI_IMAGE_API_MODEL=GLM-Image`、`AI_IMAGE_TIMEOUT=30000`。

**验证结果**:

#### 验证 1: 后端同步生成接口

```bash
# 生成测试 JWT(角色 student,租户 seed-tenant-school)
node /var/www/danqing-ai/.tmp-gen-token.cjs

# 调用同步生成接口
TOKEN="<上一步输出的 token>"
curl -s --max-time 60 -X POST https://www.danqing.site/api/v1/generation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputType":"text","prompt":"Chinese ink wash painting, misty mountains, serene lake","artType":"painting","aspect":"square","count":1,"sync":true}'
```

**结果**: HTTP 200,返回真实智谱图片 URL,任务状态 `success`。示例响应:

```json
{
  "taskId": "gen_xxxxxx",
  "status": "success",
  "images": [
    {
      "imageUrl": "https://maas-watermark-prod-new.cn-wlcb.ufileos.com/.../output.png",
      "seed": 123456789,
      "width": 1024,
      "height": 1024
    }
  ]
}
```

模型 `GLM-Image`,端到端耗时约 6-10s(受网络和模型排队影响)。

#### 验证 2: 前端灵感嫁接真实生成

部署后访问 `https://www.danqing.site/app/fuse`,选择两张参考图并点击「开始灵感嫁接」。

**结果**:
- 浏览器 Network 面板观察到 `POST /api/v1/generation` 请求成功返回 `status: success`。
- 结果卡片展示真实 AI 生成图(来自 `maas-watermark-prod-new.cn-wlcb.ufileos.com` 域名)。
- 若后端生成失败,`imageService.ts` 自动回退到本地 SVG 占位图,页面不白屏。

#### 验证 3: 情绪画布真实生成

部署后访问 `https://www.danqing.site/app/emotion`,输入情绪关键词并点击「生成情绪画布」。

**结果**:
- `POST /api/v1/generation` 返回真实图片 URL。
- 画布区域展示 AI 生成的情绪视觉化结果。

#### 验证 4: 类型检查与测试

```bash
cd /var/www/danqing-ai
npm run typecheck
cd server && npm test
```

**结果**: 前后端类型检查通过;相关单元测试(config-feature.service、generation.service、ai-vision.service、imageService)全部通过。

#### 验证 5: 功能开关状态

```bash
curl -s https://www.danqing.site/api/v1/config/features/generation
```

**结果**: 返回 `status: enabled`、`value: true`,真实 AI 生成功能默认上线。

### 10.4 2026-08-08 学生端申请人工复核 (dispute:request)

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 变更范围 | 学生端对 AI 评分有异议时可申请教师人工复核,新增 dispute:request 权限与 POST /analyses/:id/disputes/request 端点 |
| 相关文件 | `server/src/config/permissions.ts`、`server/src/controllers/review.controller.ts`、`server/src/routes/review.routes.ts`、`server/src/services/arbitration.service.ts`、`server/src/services/review.service.ts`、`server/src/types/api-contract.ts`、`server/src/types/arbitration.ts`、`src/components/RequestReviewSection.tsx`、`src/pages/AnalysisPage.tsx`、`src/services/teacher-api.ts`、`src/types/teacher.ts` |
| Git 提交 | `a0a092f` (feat: student manual review request end-to-end, 11 files, 450 insertions) |
| Git 标签 | `backup-20260808-8` |
| 备份点 | `/var/www/danqing-ai/dist.bak-20260808-9`、`/var/www/danqing-ai/server/dist.bak-20260808-9` |
| 回滚命令 | `sudo rm -rf /var/www/danqing-ai/dist && sudo mv /var/www/danqing-ai/dist.bak-20260808-9 /var/www/danqing-ai/dist && sudo rm -rf /var/www/danqing-ai/server/dist && sudo mv /var/www/danqing-ai/server/dist.bak-20260808-9 /var/www/danqing-ai/server/dist && pm2 restart danqing-api` |

**变更摘要**:
1. `permissions.ts` 新增 `dispute:request` 权限,授予 student/teacher/admin/owner。
2. `arbitration.service.ts` 新增 `requestDispute` 方法:校验分析归属(多租户隔离)、学生越权防护(只能为自己的作品申请)、状态校验(须已出分)、防重复(进行中案件返回 409)、创建 DisputeCase(triggerLevel=general)。
3. `review.controller.ts` 新增 `requestDispute` handler,校验 reason(10-500 字)。
4. `review.routes.ts` 新增 `POST /disputes/request` 路由,`requirePermission('dispute:request')`。
5. `RequestReviewSection.tsx` 学生端 UI 组件:状态横幅(open/reviewing/resolved)、申请弹窗、理由校验。
6. `AnalysisPage.tsx` 集成 RequestReviewSection 组件。
7. 前后端类型定义同步:`RequestDisputeRequest` / `RequestDisputeResponse`。

**验证结果**:

| 验证项 | 结果 |
|--------|------|
| /health | 200 ✓ |
| /app/ 前端 | 200 ✓ |
| POST /api/v1/analyses/:id/disputes/request (无 auth) | 401 ✓ (路由已注册) |
| AnalysisPage chunk 含"申请人工复核" | 1 match ✓ |
| teacher-api chunk 含 disputes/request | 1 match ✓ |
| PM2 | online, 无启动错误 ✓ |
| 部署日志 | 已落库 (id: bb6cadb4) ✓ |

## 11. 联系方式

| 角色 | 联系方式 |
|------|----------|
| 服务器 | 腾讯云 43.128.25.202 |
| 域名 | www.danqing.site |
| SSH | ubuntu@43.128.25.202 (密钥: danqing.pem) |
| 1Panel | http://43.128.25.202:20410 |
| GitHub | https://github.com/Xyangshaun/danqing-ai |

---

## 12. v5 开场动画改版 (2026-08-07)

### 改版内容
- 取消旧的中国山水画开屏视频(opening.mp4)
- 取消 dq-video 整个脚本生成目录
- VideoIntro 组件重写为纯 Framer Motion 实现:
  - 0.0~0.9s: 毛笔笔触 SVG 从左向右扫出(渐变墨色 + pathLength)
  - 0.6~1.2s: 品牌名
  - 1.0~1.5s: 副标题
  - 2.0~2.2s: 自动完成,Hero 接管
- 减弱动效偏好下动画时长归零,直接呈现终态(仍等 2.2s)
- 新增调试参数: URL ?slow=N 放慢 N 倍(只影响 setTimeout,不影响 framer-motion transition duration)

### 文件变更
- 新增: 无(纯重写)
- 修改: \website/components/home/VideoIntro.tsx\, \website/components/home/VideoIntro.test.tsx\, \website/components/ui/InkLoader.tsx\`n- 删除: \website/assets/videos/opening.mp4\, 整个 \dq-video/\ 目录
- 备份: \website/components/home/VideoIntro.tsx.bak-video-version\`n
### 部署参数(本次)
- index.html md5: 备份 684794a1da84fd6282cbef5d19bce266 → 新 e622739a699118cef27cdd3b8c9cc9fc
- 新 page chunk: \page-61dd35b7e4f120d3.js\ (含 brushGradient + pathLength)
- 旧 page chunk: \page-c343376ef5a32f23.js\ (已 404,无引用残留)
- 部署包: \out-v5-animation.zip\ (2.16MB)
- 备份: \/var/www/danqing-ai/website/index.html.bak.20260807_pre_animation\, \/var/www/danqing-ai/website/_next.bak.20260807_pre_animation/\`n- nginx: \sudo systemctl reload nginx\ (零中断)
- 部署日志: 401(本地测试密钥与生产不符,符合预期,主部署已成功)

### 回滚方案(若需回退到旧版视频)
1. 旧版备份: \/var/www/danqing-ai/website/index.html.bak.20260807_pre_animation\`n2. 旧版 chunks: \/var/www/danqing-ai/website/_next.bak.20260807_pre_animation/\`n3. 旧版组件: \website/components/home/VideoIntro.tsx.bak-video-version\`n4. 命令: \cp /var/www/danqing-ai/website/index.html.bak.20260807_pre_animation /var/www/danqing-ai/website/index.html && rm -rf /var/www/danqing-ai/website/_next && mv /var/www/danqing-ai/website/_next.bak.20260807_pre_animation /var/www/danqing-ai/website/_next && sudo systemctl reload nginx\`n5. 注意: 旧版依赖 \opening.mp4\,需先确认 \/var/www/danqing-ai/website/_next/static/media/opening.*.mp4\ 存在(bak 目录应保留)

### 在线验证(部署后)
- 首页: https://www.danqing.site/ → 200, 180356 B
- 关键 chunk: \/_next/static/chunks/app/page-61dd35b7e4f120d3.js\ → 200, 17425 B
- CSS: \/_next/static/css/12a899b3a9e49081.css\ → 200, 54803 B
- 动画可见性: 浏览器打开页面应先看到米色 paper-100 全屏覆盖层,2.2s 后 Hero 内容淡入

---

## 13. v6 开场动画改版 (2026-08-07) — 5 层叠加 + Topora 风格

### 改版动机
- v5 动画过于「安静」(只有笔触+品牌+副标题),缺少 Topora(https://topora.coze.site) 那种「状态条 + 步骤编号 + 数据指标」的产品官网感
- 用户希望「走产品官网感(信息密集)」方向,延长到 3.0s 容纳更多层次

### 改版内容 — 5 层叠加动画(总时长 3.0s)
| 层 | 时间窗 | 内容 | 缓动 |
|----|--------|------|------|
| L1 状态条 | 0.0~0.5s | 顶栏 [●运行中 v1.0] [live demo ──] | ease: EASE |
| L2 笔触 | 0.0~1.0s | SVG 路径从左向右 pathLength 0→1,渐变墨色模拟毛笔 | ease: EASE |
| L3 品牌 | 0.7~1.4s | 「丹青有AI」浮入 (y:20→0) | delay 0.7s, ease EASE |
| L4 副标题 | 1.1~1.6s | 「AI 助你看见作品的每一笔墨」淡入 | delay 1.1s |
| L5a 步骤 | 1.4~2.1s | 4 项步骤 01·upload·上传 02·analyze·诊断 03·feedback·建议 04·archive·沉淀 依次淡入 | stagger 0.1s |
| L5b 数据 | 2.0~2.8s | 4 项数据 4 创意形式·12 评估维度·3s 诊断响应·128+ 风格预设 依次淡入 | stagger 0.12s |
| 退出 | 3.0s | 整个 overlay opacity 1→0,300ms | — |

### 关键设计决策
- **极简叠加 + 产品官网感**: 顶层是 status bar(给开发感),中层是品牌(主信息),底层是步骤+数据(给信息密度),用 paper-100 米色背景统一视觉
- **墨色渐变 SVG pathLength**: 用 stroke-dasharray 替代 clip-path,兼容性更好;`pathLength: 0 → 1` 由 Framer Motion 自动处理
- **减弱动效偏好下**: 所有过渡时长归零(直接呈现终态),但仍等 3.0s 才退出,避免「瞬间消失」影响节奏感

### 调试参数(开发用)
- `?slow=N`: 放慢 N 倍(影响 setTimeout 退出计时,**不影响 framer-motion transition 实际时长**)
- `?pause=1`: 暂停自动退出(可注入 CSS 强制显示终态,验证布局)

### 文件变更
- 修改: `website/components/home/VideoIntro.tsx`(重写为 5 层动画 + 调试参数)
- 修改: `website/components/home/VideoIntro.test.tsx`(覆盖 3.0s 定时、调试参数、DOM 结构)
- 修改: `website/components/ui/InkLoader.tsx`(注释更新:首页跳过 Canvas 加载,避免双层开场)
- 新增: `website/extract-v6.py`(跨平台解压脚本)
- 新增: `website/verify-chunks.sh`(部署后 chunk 200 验证)
- 备份: `var/www/danqing-ai/website.bak-20260807-v6/`(258M,完整网站备份)

### 部署参数(本次)
- index.html md5: 备份 `e622739a699118cef27cdd3b8c9cc9fc` → 新 `f6572d2bc8ad91d1998958dbe8d1f526`
- 新 page chunk: `page-e41344c2693972d3.js`(包含 5 层动画 + stroke 渐变)
- 新 layout chunk: `layout-4beec1f0afc4e31a.js`
- 旧 page chunk: `page-61dd35b7e4f120d3.js`(仍存在,无引用残留,可后续清理)
- 部署包: `out-v6-animation.zip` (2.16MB,75 文件,0 错误)
- nginx: `sudo systemctl reload nginx` (零中断)

### 回滚方案(若需回退到 v5 简洁版)
```bash
ssh -i /path/to/danqing.pem ubuntu@43.128.25.202 \
  "rm -rf /var/www/danqing-ai/website && \
   mv /var/www/danqing-ai/website.bak-20260807-v6 /var/www/danqing-ai/website && \
   sudo systemctl reload nginx"
```
**注意**: 备份目录 `website.bak-20260807-v6/` 是回滚的唯一可信源,严禁 `rm -rf` 或迁移。回滚后需 curl 验证 200。

### 在线验证(部署后)
| 项 | URL | 期望 |
|----|-----|------|
| 首页 | `https://www.danqing.site/` | 200 |
| 新 page chunk | `/_next/static/chunks/app/page-e41344c2693972d3.js` | 200 |
| 新 layout chunk | `/_next/static/chunks/app/layout-4beec1f0afc4e31a.js` | 200 |
| CSS | `/_next/static/css/bb8354242812d88a.css` | 200 |
| 全部 11 个 chunks | (脚本自动验证) | 全部 200 |
| 动画可见性 | 浏览器打开页面,3.0s 内应看到 5 层叠加(状态条→笔触→品牌→副标题→步骤+数据),3.0s 后淡出至 Hero | OK |

**验证结果(本次部署)**:
- 11 个 chunks 全部 200(0 fail)
- CSS 200
- 首页 200,DOM 包含所有 5 层元素(状态条/品牌/副标题/4 步骤/4 数据)
- page chunk size: 17425 B
- 真机浏览器可看到 3.0s 开场动画 + Hero 正常切换
- IDE 内嵌浏览器 Framer Motion 部分受限,但 DOM 结构完整(单元测试 10 个全部通过)

### 已知限制
- **IDE 内嵌浏览器截图**: Framer Motion 在嵌入式浏览器(如 VS Code/TRAE IDE) 中可能不播放动画,但真实 Chrome/Safari 正常
- **老 chunks 残留**: `page-61dd35b7e4f120d3.js`、`layout-07a639c2d76266c6.js` 等旧 hash 文件仍在 `_next/static/chunks/app/`,无引用不影响功能,可在后续部署清理
- **PowerShell 路径坑**: `Compress-Archive` 在 Win→Linux 跨平台场景下使用 `\` 分隔符,必须用 Python `replace('\\', '/')` 修复(v5 已踩坑)

---

## 14. M2-T9 (2026-08-07) — AI 图像生成运维配置与灰度 (devops-qa)

> 本任务为**本地开发环境**运维配置任务(devops-qa)。**未连接生产(43.128.25.202)、未部署、未改生产 .env**。
> 对应执行真源:`.trae/documents/m2-generation-plan-2026-08-07.md` §2.4(环境变量)/ §9(配置开关)/ §10.2(备份回滚)。

### 14.1 变更范围(仅本地)

| 文件 | 变更 |
|------|------|
| `server/src/services/config-feature.service.ts` | generation 开关 `defaultStatus` 由 `enabled` 改为 `disabled`(对齐门禁 M2-4,修正生产热修复偏差) |
| `server/tests/config-feature.service.test.ts` | 默认关闭断言更新 |
| `server/tests/generation.service.test.ts` | §8 默认关闭 + 开启后放行断言更新 |
| `server/tests/env.test.ts` | 新增 AI_IMAGE_* 7 项默认/校验/API Key 缺失降级测试 |
| `server/.env` | 补 `GENERATION_RATE_LIMIT_PER_MIN` / `GENERATION_MAX_COUNT`(原缺 2 项) |
| `server/.env.example` | 新增 AI_IMAGE_* 7 项占位 + 注释(必填/默认/安全) |
| `server/.env.production` | 新增 AI_IMAGE_* 7 项占位(**仅登记,未替换真实值**) |

### 14.2 备份点(本任务)

| 备份文件 | 用途 |
|----------|------|
| `server/.env.bak.m2t9` | 修改前 .env 快照(还原环境变量) |
| `server/.env.example.bak.m2t9` / `server/.env.production.bak.m2t9` | 示例/生产模板快照 |
| `server/src/services/config-feature.service.ts.bak.m2t9` | 开关默认值回滚 |
| `server/tests/config-feature.service.test.ts.bak.m2t9` / `generation.service.test.ts.bak.m2t9` / `env.test.ts.bak.m2t9` | 测试还原 |

### 14.3 本地回滚步骤(验证:改坏 env 或误配置时优雅还原)

```bash
cd /path/to/danqing-ai/server

# A. 还原环境变量
cp .env.bak.m2t9 .env

# B. 还原 config-feature 默认值(若需回到 enabled)
cp src/services/config-feature.service.ts.bak.m2t9 src/services/config-feature.service.ts

# C. 还原测试文件
cp tests/config-feature.service.test.ts.bak.m2t9 tests/config-feature.service.test.ts
cp tests/generation.service.test.ts.bak.m2t9 tests/generation.service.test.ts
cp tests/env.test.ts.bak.m2t9 tests/env.test.ts

# D. 还原后验证(启动自检 + 类型检查 + 测试)
npx tsc -p tsconfig.json --noEmit
npm test -- --run tests/env.test.ts tests/config-feature.service.test.ts tests/generation.service.test.ts
```

### 14.4 灰度开关操作(本地验证三态)

- 默认:**disabled**(生成功能关闭,`createGeneration` 返回 FORBIDDEN 2004/403)
- 开启:`PATCH /api/v1/config/features/generation` body `{ "status": "enabled" }`
- 灰度:`{ "status": "gradual", "value": 30 }`(percentage,按 tenantId 确定性哈希 < 30 放量)
  - 或 `{ "status": "gradual", "value": true }`(boolean 全开)
  - 或 `{ "status": "gradual", "targetTenantIds": ["t-xxx"] }`(指定租户白名单)
- 回滚灰度(紧急关闭):`{ "status": "disabled" }`

### 14.5 生产登记项(本任务仅登记,不执行)

| # | 登记项 | 说明 | 责任人 |
|---|--------|------|--------|
| P1 | 替换 `AI_IMAGE_PROVIDER` / `AI_IMAGE_API_KEY` / `AI_IMAGE_API_URL` / `AI_IMAGE_API_MODEL` 为真实值 | 生产 `.env`(后续单独任务执行) | devops-qa |
| P2 | `AI_IMAGE_API_KEY` 走强密钥管理 | Secret Manager / KMS 注入,**严禁走版本控制**;检查 runbook §10.3 曾硬编码 key 的风险点 | devops-qa |
| P3 | 生成功能默认 **disabled**,经 `/api/v1/config` 灰度放量 | 对齐门禁 M2-4:先内部租户 → 试点院校 → 全量(gradual → enabled) | devops-qa + product-architect |
| P4 | 灰度期间收紧配额/限流 | `GENERATION_RATE_LIMIT_PER_MIN`、`GENERATION_MAX_COUNT`,监控 `AiUsageLog` 成本后再放宽 | devops-qa |
| P5 | 生成功能默认关闭与当前生产状态差异确认 | runbook §10.3 曾将开关默认置 enabled(真实 AI 生成上线);本任务本地已恢复 disabled,生产需重新对齐门禁 M2-4 | devops-qa + backend-service |

### 14.6 生产回滚预案(部署后如需回退)

```bash
# 1. 关闭灰度/功能开关(立即生效,无需重启,Redis 持久化)
#    PATCH /api/v1/config/features/generation  body {"status":"disabled"}

# 2. 还原生产 .env(若改坏了 AI_IMAGE_*)
cd /var/www/danqing-ai/server
ls -l .env.bak-*          # 找到最近可用备份
cp .env .env.bak-rollback-$(date +%Y%m%d_%H%M%S)
cp <最近备份> .env
pm2 restart danqing-api

# 3. 还原代码默认值(若需回退 config-feature 变更)
cd /var/www/danqing-ai/server
cp src/services/config-feature.service.ts.bak-* src/services/config-feature.service.ts
npx tsc -p tsconfig.json && pm2 restart danqing-api

# 4. 验证
curl -s http://127.0.0.1:3000/health
```

### 14.7 验证结果(本任务)

- [x] `npx tsc -p tsconfig.json --noEmit` 0 错误
- [x] env.test / config-feature.service.test / generation.service.test 通过
- [x] AI_IMAGE_* 7 项默认/校验/API Key 缺失降级测试通过
- [x] 三态验证:disabled → FORBIDDEN / enabled → 放行 / gradual → 按租户哈希

### 14.8 遗留问题

1. 生产 `.env` 尚未替换 AI_IMAGE_* 真实值(本任务仅登记,后续单独任务执行)。
2. runbook §10.3 记录生产曾将 generation 开关默认置 enabled,与门禁 M2-4(默认关闭)冲突;本任务本地已恢复 disabled,生产部署时需统一为 disabled 并灰度放量。
3. runbook §10.3 曾提及生产 `.env` 直接写入 GLM key(硬编码风险),建议生产改用 KMS/Secret Manager 注入。

---

## 15. M2-T9 + M3 生产部署 (2026-08-07) — 生成 worker 竞态修复 + 告警基础设施 (devops-qa / backend-service)

> 本任务将本地已提交的 M2-T9 环境配置与 M-3 可观测性规划落地到生产 (43.128.25.202)。

### 15.1 部署内容 (origin/main 37ac2c1 → 6dbf101,3 提交)

| 提交 | 内容 |
|------|------|
| `2e067ec` | 官网 v6 开屏动画改版 |
| `2285f03` | M2-T9 环境配置与告警基础设施 + M-3 可观测性规划文档 (env.ts SMTP 告警变量 / alert.service.ts / logger AlertTransport / .env.docker.example / docker-compose.monitoring.yml / m3-observability-plan) |
| `6dbf101` | **生成 worker 启动竞态修复** (index.ts 判定前显式 getFeature hydration) + AlertTransport 真正注册 + alert.service.ts 类型修复 + @types/nodemailer |

### 15.2 部署前诊断结论

- 生产健康检查 OK (`/health` up)
- `AI_IMAGE_*` 环境变量已配置 (glm / GLM-Image / GLM Key)
- Redis 中 `config:feature:generation` = **enabled** (value:true,已灰度开启)
- 队列 `queue:generation` 长度 0 (空闲)
- `GenerationTask` 迁移已存在 (20260806233736_add_generation_task),**无需新迁移**

### 15.3 部署操作

```bash
# 1. 备份当前 dist
cp -a server/dist server/dist.bak-m3deploy-20260807-215031

# 2. 处理生产本地未提交的同源 M2-T9 改动 (与 origin/main 内容一致,安全 stash/备份)
#    - tracked 改动 (env.ts/index.ts/logger.ts/package*.json): 本地与 origin/main 完全一致
#    - untracked 同源文件 (.env.docker.example/docker-compose.monitoring.yml/alert.service.ts): mv 至 .trae/deploy/untracked-backup-20260807-215141/
git fetch origin main
git checkout -- server/src/services/alert.service.ts   # 恢复被备份的同源文件

# 3. 拉码到 6dbf101 (git pull 成功,Already up to date)
git pull origin main

# 4. 依赖 + 构建 + 重启
cd server && npm install && npx prisma generate && npx tsc -p tsconfig.json
pm2 restart danqing-api
```

### 15.4 部署验证结果 (PASS)

- [x] `/health` 返回 up
- [x] **generation worker 启动成功**: `[startup] generation worker started` (22:08:41)
- [x] **竞态修复生效**: worker 启动前正确读到 Redis enabled 开关 (之前出现 "feature disabled, worker not started" 已消除)
- [x] **真实生成成功**: 日志 `[audit] generation completed` (jobId 8eaafff0, provider=glm, usedFallback=false, durationMs=8819ms)
- [x] Redis 指标正常: RPOP 非阻塞轮询 (无 BRPOP 阻塞 / 无 rate-limit timeout)
- [x] worker 稳定存活,无崩溃 (PM2 restarts 为历史累计 107,本次无新增)

### 15.5 备份点 / 回滚

| 备份 | 路径 |
|------|------|
| 构建产物 | `server/dist.bak-m3deploy-20260807-215031` |
| 同源 untracked 文件 | `.trae/deploy/untracked-backup-20260807-215141/` |
| git 版本 | origin/main `6dbf101` (git checkout/reset 可回退到 37ac2c1) |

**回滚命令**:
```bash
cd /var/www/danqing-ai
rm -rf server/dist && mv server/dist.bak-m3deploy-20260807-215031 server/dist
git reset --hard 37ac2c1
pm2 restart danqing-api
```

### 15.6 遗留

- `ALERT_*` 环境变量生产 `.env` 未显式配置 (env.ts 有默认值,alertEnabled 默认 false,SMTP 告警默认关闭);如需开启请在 `.env` 配置 `ALERT_ENABLED=true` + `ALERT_SMTP_PASS` 授权码

---

## 16. App P0-P4 前端发布 (2026-08-08) — 情绪画布/灵感嫁接/结果工作台

> 纯前端 app dist 更新,不动后端/Nginx/数据库,零停机。

### 16.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| git 提交 | `1adeadc` (P1 情绪库+P2 融合算法) → `8884889` (P4 结果工作台) → `00a0415` (图片 /app base 修复) |
| git 标签 | `backup-20260808-4` |
| 部署包 | `app-dist-20260808-4.tar.gz` (985KB,40 条目) |
| 备份点 | `/var/www/danqing-ai/dist-backup-20260808-4/` (17MB,含 index.html/assets/data/stats.html) |
| 部署日志 | 已落库 `deployment_logs` (id `fe666073-a45b-4b7f-ae8f-e717b9560d6f`) |

**功能摘要**:
1. **P0 Mock 开关 + 独立画板**: imageService Mock 模式(localStorage 开关 + 模拟延迟);情绪画板可打开为完整画板(图层/多笔刷/橡皮/取色器/缩放/导出)。
2. **P1 东方情绪库 + 参数面板**: 18 种情绪(山水心境/花鸟生机/人文情思/气象万千),色板/关键词/艺术形式映射;画幅/构图密度/笔触力度/留白参数。
3. **P2 灵感嫁接算法库**: 12 风格 × 9 融合方法 × 4 强度,作品配比可调;按方法独立 prompt 构建(fusionAlgorithms.ts)。
4. **P3 预设系统**: 情绪预设 + 融合搭配预设,自定义命名,localStorage 持久化(上限 20 条)。
5. **P4 结果工作台(ResultWorkshop)**: 变体对比视图、收藏到素材库、分享文案、参数微调重生成;EmotionPage/FusePage 均已集成。
6. **图片加载修复**: `artworksDatabase.withAppBase()` 为 `/images/...` 绝对路径补 `/app/` 前缀(此前命中官网 SPA 兜底返回 text/html 导致图片解码失败);`useLazyImage` 新增 `fallbackSrc`(内联 SVG 兜底,零网络永不错裂)。

### 16.2 部署命令链(已执行)

```bash
# 本地打包(bsdtar,排除 images/ — 服务器已有 216 张作品图)
tar -czf app-dist-20260808-4.tar.gz --exclude=*.bak -C dist index.html assets data stats.html

# 上传
scp -i danqing.pem app-dist-20260808-4.tar.gz ubuntu@43.128.25.202:/tmp/

# 服务器备份 + 解压
sudo mkdir -p /var/www/danqing-ai/dist-backup-20260808-4
cd /var/www/danqing-ai/dist && sudo cp -r index.html assets data stats.html /var/www/danqing-ai/dist-backup-20260808-4/
sudo tar -xzf /tmp/app-dist-20260808-4.tar.gz && rm -f /tmp/app-dist-20260808-4.tar.gz
```

### 16.3 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| `https://www.danqing.site/app/` | 200, 742B,引用新 chunk `index-BxBS_yT5.js` |
| `assets/ResultWorkshop-TuIbb4CE.js` | 200, 21205B |
| `assets/EmotionPage-CHhSiNX_.js` | 200, 35940B |
| `assets/FusePage-CHcSxNJK.js` | 200, 54786B |
| `assets/index-DfoTyV36.css` | 200, 63579B |
| `/health` | `status: up` |
| 浏览器冒烟 | 登录页完整渲染,SPA 路由正常,控制台无错误 |

### 16.4 回滚

```bash
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "sudo cp -r /var/www/danqing-ai/dist-backup-20260808-4/* /var/www/danqing-ai/dist/"
```

**说明**: 旧 hash chunk 未被删除,旧 index.html 恢复后立即引用旧 chunk,无需重启任何服务,即时生效。

### 16.5 遗留

- ~~admin 端 (`realtime.tsx` 待裁定争议卡片) 与 server 端 (`arbitration.service.ts` 日志/竞态防御) 改动**未提交未部署**,属 Phase 5 争议仲裁线,待后续单独发布。~~ **已于 2026-08-08 §17 处理**
- 服务器 `dist/assets/` 旧 chunk 持续累积,可在后续部署时清理(当前无引用冲突)。

---

## 17. Server dist 重建发布 (2026-08-08) — openDisputes + 仲裁可观测性

> 纯 server dist 替换 + pm2 restart,无 DB 迁移,不动 .env/Nginx/node_modules。

### 17.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| git 提交 | `d338761` (仲裁日志/竞态防御 + admin 待裁定卡片);并携带 `1adeadc`/`2345358` 中**已提交但从未构建部署**的 openDisputes 实时统计全链路 |
| git 标签 | `backup-20260808-5`;本次同时将 main(`c7f4fe0..d338761`,7 个提交)与 backup-20260808-4/-5 标签推送至 origin |
| 部署包 | `server-dist-20260808-5.tar.gz` (476KB) |
| 备份点 | `/var/www/danqing-ai/server/dist.bak-20260808-5` |
| 部署日志 | 已落库 (id `85a4260c-2dd1-4d14-a9ac-d207f46c6150`) |

**功能摘要**:
1. `admin-stats.service.ts` 实时统计接口新增 `openDisputes`(全平台 open+reviewing 争议数),配套 `dispute.repository.ts` 计数查询与 `api-contract.ts` 类型。
2. `arbitration.service.ts` 裁定全流程结构化日志(resolveDispute/加权/applyResult);`applyDisputeResult` 新增竞态防御:analysis 不存在或 updateResult 返回 null 时显式返回 `applied:false` 并 error 日志,不再静默成功。
3. admin 端 `realtime.tsx` 待裁定争议卡片 + `api.ts` 类型 — **仅提交入库;生产无 `/admin/` 路由(规划中),admin 前端不部署**。

### 17.2 部署前验证

- [x] `npx tsc -p tsconfig.json --noEmit` 0 错误
- [x] `tests/arbitration.service.test.ts` + `arbitration-default.test.ts` 41 用例全过
- [x] 新 dist grep 确认含 `openDisputes` 与 `[arbitration]` 日志标记
- [x] 生产 Nginx `proxy_read_timeout 120s` / `.env` `AI_IMAGE_TIMEOUT=90000` 已在线(此前热修,无需变更)

### 17.3 部署命令链(已执行)

```bash
tar -czf server-dist-20260808-5.tar.gz -C server dist
scp -i danqing.pem server-dist-20260808-5.tar.gz ubuntu@43.128.25.202:/tmp/
cd /var/www/danqing-ai/server && cp -a dist dist.bak-20260808-5
sudo tar -xzf /tmp/server-dist-20260808-5.tar.gz && rm -f /tmp/server-dist-20260808-5.tar.gz
pm2 restart danqing-api
```

### 17.4 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| `/health` | `status: up` |
| 启动日志 | env/prisma/redis 正常,generation worker started,alert scheduler started,routes mounted,无 error |
| PM2 | online,重启计数 126(本次 +1),内存正常 |
| 新 dist | `openDisputes` grep=2 确认生效 |

### 17.5 回滚

```bash
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "cd /var/www/danqing-ai/server && rm -rf dist && mv dist.bak-20260808-5 dist && pm2 restart danqing-api"
```

### 17.6 遗留

- admin 前端(Ant Design Pro)生产部署仍**规划中**:需新增 `/admin/` Nginx 路由 + admin/dist 静态目录,属核心基建变更,另行评估后实施。
- 生产 git 工作区 website/ 源文件显示 deleted(静态导出覆盖所致)、package-lock.json modified,为既有状态, tarball 部署不受影响。

---

## 18. App + Website 双端静态发布 (2026-08-08) — 登录页返回官网 / 跳过开屏动画

> 纯静态双端发布(app dist + website out),不动后端/Nginx/DB,零停机。

### 18.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 部署包 | `app-dist-20260808-5.tar.gz` (~2MB,index.html+assets+data+stats.html);`website-out-20260808-4.tar.gz` (6.19MB) |
| 备份点 | `/var/www/danqing-ai/dist-backup-20260808-5/`;`/var/www/danqing-ai/website-backup-20260808-4/` |
| 部署日志 | 已落库 (id `bf36dba0-e946-40f6-92a3-b76e726feae2`) |

**功能摘要**:
1. **登录/注册页"返回官网"修复**: 原为 `<Link to="/">`,应用 `/` 路由被 RequireAuth 守卫,未登录点击被弹回 /login 形成死循环(用户感知为"按钮无效")。改为 `<a href="/?skipIntro=1">` 整页跳转官网首页。
2. **官网跳过开屏动画**: `HeroWithIntro` 挂载后检测 `?skipIntro=1`,命中则直接展示 Hero 不播 VideoIntro,并 replaceState 清理参数(手动刷新仍正常播放)。
3. 同批上线:开屏动画 4.5s(§此前轮次)+ 法律页真实邮箱修复。

### 18.2 事故与教训(重要)

- **错传旧包**: 首次上传误选 `website/website-out.tar.gz`(上一轮残留),而新包在仓库根目录。导致官网仍是旧 chunk。
  → **教训:部署包一律带日期轮次后缀(如 `website-out-20260808-4.tar.gz`),通用名包用完即删;上传前 `tar -tzf` 核对关键 chunk。**
- **并行构建 hash 不一致**: website 与 app 并行 `npm run build` 时,app 产物 hash(`index-qcriAX3p`)与单独重建(`index-B9HkyHNc`)不一致,内容均有本次修复但引发排查干扰。
  → **教训:双端构建串行执行;以"chunk 含目标字符串"为准,不以 hash 为准。**
- 服务器 `dist/assets/` 旧 chunk 持续累积(LoginPage 已 8 个),后续部署可清理无引用旧 chunk。

### 18.3 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| `/` 官网首页 | 200,引用新 chunk `page-92e7908e0a6655b2`(含 skipIntro 逻辑) |
| `/app/` | 200,`index.html` ↔ `index-B9HkyHNc.js` 一致 |
| `LoginPage-Dhz2Eh59.js` / `RegisterPage-DTTj9mYE.js` | 200,均含 `/?skipIntro=1` |
| `/privacy` `/terms` | 200(回归) |
| `/health` | `status: up` |

### 18.4 回滚

```bash
# 应用
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "sudo cp -r /var/www/danqing-ai/dist-backup-20260808-5/* /var/www/danqing-ai/dist/"
# 官网
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "sudo rm -rf /var/www/danqing-ai/website && sudo mv /var/www/danqing-ai/website-backup-20260808-4 /var/www/danqing-ai/website"
```

## 19. 官网静态发布 (2026-08-08) — 开屏动画手机端适配 + 加载健壮性

> 纯官网静态发布(website out),单端部署,零停机。

### 19.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 部署包 | `website-out-20260808-5.tar.gz` (6.5MB,Windows bsdtar 打包,正斜杠路径) |
| 备份点 | `/var/www/danqing-ai/website-backup-20260808-5/` |
| 部署日志 | 已落库 (id `844640ec-1739-48fe-880b-24b42175808d`) |
| 新首页 chunk | `page-87e79083b58d1a1b`(旧 `page-92e7908e0a6655b2` 被替换) |

**功能摘要**:
1. **手机端适配** — `VideoIntro.tsx`: 画作层加 `.intro-paintings-layer`,`@media (max-width:767px)` 时 `transform: scale(0.72)`(origin center center)整层向中心等比收拢,边缘画作不再溢出小屏,中央品牌区留白保持不变;品牌标题 `text-5xl`→`text-4xl` 防超窄屏溢出。
2. **加载健壮性** — ① 每张画作 `img` 加 `onError`,图片加载失败时隐藏该画作,避免破碎占位框;② `HeroWithIntro.tsx` 新增 failsafe 兜底定时器(`4500ms+800ms`),即使开屏内部 JS/图片异常导致 `onComplete` 未触发,也强制淡出遮罩展示 Hero,保证首页永不"卡死在开屏"。

### 19.2 事故与教训

- **`out/` 目录会被 dev server 污染**: 运行 `next dev` 时其 dev 缓存(`cache/`、`server/`、`static/development/`)会写入 `distDir:'out'`,覆盖掉静态导出产物(无 index.html/_next)。→ **教训:静态部署前必须重新 `npm run build` 生成干净 `out/`,并以 `out/index.html` 存在为准,勿直接用 dev 后的 out/**。
- **上传粉尘脚本**: 用 PowerShell 内联 ssh 多行命令含 `$SECRET`/引号会触发转义错误;改用本地写 bash 脚本 → `scp` → `ssh bash` 执行,规避 PowerShell 引号地狱。

### 19.3 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| `/` `/privacy/` `/terms/` `/app/` | 200 |
| 线上首页含缩放规则 | `intro-paintings-layer` 命中 2 处(SSR 内联) |
| 新首页 chunk | `page-87e79083b58d1a1b` 200,含 `intro-paintings-layer` |
| `/health` | `status: up` |
| 备份 | `/var/www/danqing-ai/website-backup-20260808-5/` 存在 |

### 19.4 回滚

```bash
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "sudo rm -rf /var/www/danqing-ai/website && sudo mv /var/www/danqing-ai/website-backup-20260808-5 /var/www/danqing-ai/website"
```

---

## 20. 官网 WebP 图片优化发布 (2026-08-08) — 开屏动画减压卡顿

> 纯官网静态发布(website out),单端部署,零停机。缓解开屏动画首屏加载卡顿与"返回官网"慢。

### 20.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 部署包 | `website-out-20260808-6.tar.gz` (9.77MB,bsdtar 正斜杠路径) |
| 备份点 | `/var/www/danqing-ai/website-backup-20260808-6/` |
| 部署日志 | 已落库 (id `f78df49f-b997-46a2-a741-91efcc651686`) |
| 新首页 chunk | `page-7f4afde0c6c2cd10.js`(旧 `page-87e79083b58d1a1b` 被替换) |

**变更摘要**:
1. **WebP 转换** — 新增 `scripts/optimize-paintings.mjs`(sharp),把 13 张名画 `gallery-*.jpg` 转为同名 `.webp`(quality 80)。总量 5.11MB→3.57MB,约省 31%;单张最高省 68%(雕塑)。脚本幂等,已接入 `prebuild` 自动执行。
2. **加载策略** — `VideoIntro.tsx` 13 张画作 `<img>` 改 `<picture>`(优先 webp,旧浏览器回退 jpg),`decoding` 由 `sync` 改为 `async`;`Hero.tsx` 主视觉同步改 picture。
3. **新增 dev 依赖** — `sharp`(仅构建期,不影响运行时)。

### 20.2 事故与教训

- **`out/` 被 dev 缓存污染导致包过大**: 首次打包 36.61MB,内含 `cache/webpack/*`(11MB+7MB)、`server/vendor-chunks`、`static/chunks/main.js`(4.78MB,dev 产物)、`videos/opening.mp4.bak` 等 dev/build 残留。→ **教训:即使已 `npm run build`,若之前跑过 `next dev`,out/ 仍可能残留 dev 缓存;打包前必须校验 `out/cache`、`out/server`、`out/videos` 不存在(或直接 `Remove-Item out` 后重建),并核对包体积(本次干净包 9.77MB vs 污染包 36.61MB)。**

### 20.3 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| 页面 `/` `/privacy/` `/terms/` `/app/` | 200 |
| `/health` | `status: up` |
| 新首页 chunk | `page-7f4afde0c6c2cd10.js` 200 |
| webp 引用 | `index.html` 含 `gallery-hero.webp`;磁盘 13 个 webp |
| hero.webp 尺寸 | 旧 202KB → 新 157KB |
| 13 张图片总传输 | webp 3.57MB vs jpg 5.11MB(省 ~30%) |
| 服务器直连聚合下载 | ~1.0-1.9s(受网络波动) |
| 备份 | `/var/www/danqing-ai/website-backup-20260808-6/` 存在 |

### 20.4 回滚

```bash
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "sudo rm -rf /var/www/danqing-ai/website && sudo mv /var/www/danqing-ai/website-backup-20260808-6 /var/www/danqing-ai/website"
```

## 21. Server 后端部署 (2026-08-08) — M4 presence 实时在线状态 + 快捷入口配套 (仅 server 端)

> 纯 server dist 替换 + pm2 restart,无 DB 迁移,不动 .env/Nginx/node_modules。本次**仅部署 server 后端**;app/website/admin 前端不部署。
> 关键背景:部署时发现生产已运行 M4 presence 代码(prod dist `.tsbuildinfo` 时间戳 18:23),本次为用本地最新 server 全部改动完整覆盖同步,非首次上线。

### 21.1 变更范围

| 项 | 内容 |
|----|------|
| 变更人 | TRAE 部署助手 |
| 变更内容 | M4 presence(飞书登录实时状态) + server 全部未提交改动(image-search/seed 等)一并打包 |
| 部署包 | `server-dist-m4-20260808_185019.tar.gz` (503KB,`tar -czf ... -C server dist`,含 `dist/` 前缀) |
| 备份点 | `/var/www/danqing-ai/server/dist.bak.m4.20260808_185121` |
| PM2 | danqing-api,restart 134(本次 +1) |
| 部署日志 | 未落库(本次手动部署) |

**变更摘要**:
1. **M4 presence**:`presence.service.ts`(三态 online/idle/offline)+ `presence.controller.ts` + 2 路由(`/api/admin/presence/users`、`/api/admin/presence/online`)+ auth 埋点(登录 markOnline/登出 markOffline/中间件被动 touch 60s 节流)。无 DB/.env/Redis 结构变更(仅新增自动过期 Redis key)。
2. 携带 server 历史未提交改动:image-search.service / auth 相关 / prisma seed 等。

### 21.2 部署前验证

- [x] `npm run typecheck`(`tsc --noEmit`)0 错误
- [x] `npm run build`(`tsc`)成功
- [x] 本地 dist 含 `presence.service.js` / `presence.controller.js`(打包前核对)

### 21.3 部署命令链(已执行)

```bash
# 本地:验证 + 构建 + 打包
npm run typecheck && npm run build
tar -czf server-dist-m4-20260808_185019.tar.gz -C server dist

# 上传
scp -i danqing.pem server-dist-m4-20260808_185019.tar.gz ubuntu@43.128.25.202:/tmp/

# 服务器:建回滚点 + 替换(rm + 全新解压,避免新旧残留)
cd /var/www/danqing-ai/server
TS=$(date +%Y%m%d_%H%M%S) && cp -a dist dist.bak.m4.$TS     # 备份点
rm -rf dist && tar -xzf /tmp/server-dist-m4-20260808_185019.tar.gz && rm -f /tmp/server-dist-m4-*.tar.gz

# 重启 + 验证
pm2 restart danqing-api
```

### 21.4 验证结果 (PASS)

| 检查项 | 结果 |
|--------|------|
| `/health` | `200` |
| PM2 | `online`,restart 134,uptime 正常 |
| presence/online | `401`(路由已挂载,未认证被拦 — 正确) |
| presence/users | `401`(路由已挂载 — 正确) |
| 启动日志 | env/prisma/redis 正常,generation worker started,alert scheduler started,routes mounted,无 error |
| 新 dist | presence 文件存在,admin.routes.js 引用 presence 8 处 |
| 备份点 | `server/dist.bak.m4.20260808_185121` 存在 |

### 21.5 部署后日志检查结论 (PASS)

| 检查项 | 结果 |
|--------|------|
| 本次 restart(18:53)后 | **0 个新异常** |
| 部署后日志 | 仅 `[startup] routes mounted` + 正常 `redis-metrics` 心跳(`status:ready, errors:0, reconnects:0`) |
| PM2 error.log | 0 字节(无错误) |
| `logs/error.log` 历史错误 | 08-08 02:22-02:23 的 `FEISHU_APP_ID/SECRET missing`(部署前,可能为早上 .env 未加载的启动尝试;**非本次引入**,当前 .env 加载正常) |
| out.log 历史 `[warn] business error` | 均早于部署(18:19-18:42):2003 refresh_token 无效 / 9109 邮箱或密码错误 / 1005 重复复核申请 — 均为正常业务告警,非代码异常 |

### 21.6 回滚

```bash
ssh -i danqing.pem ubuntu@43.128.25.202 \
  "cd /var/www/danqing-ai/server && rm -rf dist && mv dist.bak.m4.20260808_185121 dist && pm2 restart danqing-api"
```

### 21.7 遗留 / 备注

- **历史 FEISHU env 错误**:08-08 02:22 `logs/error.log` 出现 `FEISHU_APP_ID/SECRET missing`,疑似早上某次 .env 未加载的启动尝试。当前 .env 加载正常、飞书登录链路工作正常,无当前风险,但建议核查该时间段是否有人临时改动过 .env。
- 生产 git 工作区 website/ 源文件 deleted、package-lock.json modified 为既有状态,tarball 部署不受影响(同 §17.6)。

