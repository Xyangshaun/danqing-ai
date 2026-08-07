# 丹青有AI 部署运维手册 (Runbook)

> 项目: danqing-ai  
> 服务器: 43.128.25.202 (腾讯云 VPS)  
> 域名: www.danqing.site  
> 部署日期: 2026-08-02  
> 最近更新: 2026-08-07 (v5 动画改版)  
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
| AI_IMAGE_API_MODEL | 图像生成模型 | cogview-3 |
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
7. `server/.env` 新增 AI 图像生成配置:`AI_IMAGE_PROVIDER=glm`、`AI_IMAGE_API_KEY` 复用 GLM Key、`AI_IMAGE_API_URL=https://open.bigmodel.cn/api/paas/v4/images/generations`、`AI_IMAGE_API_MODEL=cogview-3`、`AI_IMAGE_TIMEOUT=30000`。

**验证结果**:
- 本地直接调用 `image-generation.service.ts` 生成水墨山水画,成功返回图片 URL,模型 `cogview-3`,耗时约 6.7s。
- 前后端类型检查通过;相关单元测试(config-feature.service、generation.service、ai-vision.service、imageService)全部通过。
- 生产部署后通过前端「灵感嫁接」页面点击「开始灵感嫁接」,成功返回真实 AI 生成图(待部署后验证)。

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

