# 丹青有AI 部署运维手册 (Runbook)

> 项目: danqing-ai  
> 服务器: 43.128.25.202 (腾讯云 VPS)  
> 域名: www.danqing.site  
> 部署日期: 2026-08-02  
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
| AI_API_KEY | GLM API Key | ⚠️ 占位符 (需替换) |
| COOKIE_DOMAIN | Cookie 域名 | .danqing.site |
| CORS_ORIGINS | CORS 白名单 | https://www.danqing.site |

### 8.2 待办配置

- [ ] 替换 AI_API_KEY 为真实 GLM-4V API Key
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

## 10. 联系方式

| 角色 | 联系方式 |
|------|----------|
| 服务器 | 腾讯云 43.128.25.202 |
| 域名 | www.danqing.site |
| SSH | ubuntu@43.128.25.202 (密钥: danqing.pem) |
| 1Panel | http://43.128.25.202:20410 |
| GitHub | https://github.com/Xyangshaun/danqing-ai |
