# 丹青有AI - 管理员账号与后端运维交接文档

> 生成时间：2026-08-07
> 适用环境：生产服务器（IP: 43.128.25.202）
> 安全提示：本文档包含敏感信息，请限制访问范围，交接后建议修改密码并更新文档。

---

## 一、管理员账号信息

| 项目 | 值 |
|------|-----|
| 登录地址 | `https://www.danqing.site/admin`（待确认最终 admin 路由） |
| 邮箱 | `admin@dq.edu` |
| 密码 | `Yzy126285` |
| 角色 | `admin`（系统管理员） |
| 姓名 | 系统管理员 |
| 用户ID | `seed-user-admin` |

### 登录测试脚本

```bash
# 单次验证
node scripts/test-admin-login.mjs

# 稳定性验证（默认 5 次）
node scripts/test-admin-login-stable.mjs Yzy126285 5
```

---

## 二、后端服务运维

### 2.1 服务基本信息

| 项目 | 值 |
|------|-----|
| 应用名称 | `danqing-api` |
| 进程管理 | PM2 |
| 监听端口 | `3000` |
| 代码目录 | `/var/www/danqing-ai/server` |
| 部署目录 | `/var/www/danqing-ai/dist` |
| 环境文件 | `/var/www/danqing-ai/server/.env` |

### 2.2 关键环境变量

| 变量 | 当前值 | 说明 |
|------|--------|------|
| `AI_PROVIDER` | `glm` | 诊断 AI 提供商，**禁止写 `aliyun`**，否则服务无法启动 |
| `NODE_ENV` | `production` | 生产环境标识 |
| `COOKIE_SECURE` | `true` | 生产环境必须为 `true` |

### 2.3 常用运维命令

```bash
# 1. 登录服务器
ssh -i "C:\Users\26929\Desktop\丹青有AI\danqing.pem" ubuntu@43.128.25.202

# 2. 查看服务状态
pm2 status

# 3. 查看实时日志
pm2 logs danqing-api --lines 100

# 4. 查看错误日志
pm2 logs danqing-api --err --lines 100

# 5. 健康检查
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/api/v1/health
```

### 2.4 修改环境变量并重启

```bash
# 1. 备份原配置
cp /var/www/danqing-ai/server/.env /var/www/danqing-ai/server/.env.bak.$(date +%Y%m%d-%H%M%S)

# 2. 修改指定配置（示例：AI_PROVIDER）
sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=glm/' /var/www/danqing-ai/server/.env

# 3. 确认修改
grep AI_PROVIDER /var/www/danqing-ai/server/.env

# 4. 使用新环境变量重启 PM2
pm2 restart danqing-api --update-env

# 5. 验证健康检查
curl -s http://127.0.0.1:3000/health
```

### 2.5 完整重新构建并重启

适用于代码有更新、依赖变更或构建产物不一致时：

```bash
cd /var/www/danqing-ai/server

# 1. 备份 .env
cp .env .env.bak.$(date +%Y%m%d-%H%M%S)

# 2. 安装依赖（如有 package.json 变更）
npm ci

# 3. 生成 Prisma Client
npx prisma generate

# 4. 构建
npm run build

# 5. 重启
pm2 restart danqing-api --update-env

# 6. 验证
pm2 status danqing-api
curl -s http://127.0.0.1:3000/health
```

---

## 三、回滚方案

如果修改 `.env` 后服务异常，立即恢复备份并重启：

```bash
# 找到最近的备份
ls -lt /var/www/danqing-ai/server/.env.bak.* | head -5

# 恢复（将 XXXX 替换为实际备份后缀）
cp /var/www/danqing-ai/server/.env.bak.XXXX /var/www/danqing-ai/server/.env
pm2 restart danqing-api --update-env
```

---

## 四、已知问题与注意事项

1. **AI_PROVIDER 配置**：当前代码仅支持 `glm` 或 `trae`。若配置为 `aliyun`，后端启动会立即失败并报错 `AI_PROVIDER must be one of glm|trae, got "aliyun"`。
2. **密码安全**：默认管理员密码 `Yzy126285` 已启用。如需修改，需通过数据库直接更新 `users.password_hash` 字段，或使用临时 Prisma 脚本。
3. **device_id 要求**：登录接口要求请求头携带 `X-Client-Context`，格式为 `{"device_id":"唯一标识","client":"admin"}`。
4. **监控面板**：Uptime Kuma 已部署在 `http://localhost:3001`（服务器本地），可通过 SSH 隧道访问，公网访问需配置 `status.danqing.site` DNS。

---

## 五、联系人

- 管理员邮箱：`admin@dq.edu`
- 告警邮箱：`2692963779@qq.com`
