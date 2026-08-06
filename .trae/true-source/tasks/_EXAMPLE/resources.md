# 资源需求 — TASK-0001 VPS 部署架构落地

> 本文件详细声明任务对资源的占用情况。所有占用必须同步到 [registry/conflict-matrix.md](../../registry/conflict-matrix.md)。

**任务 ID**:TASK-0001
**最后更新**:2026-08-04 14:30

---

## 一、资源占用清单

### 1.1 代码模块 / 文件

| 资源路径 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- |
| deploy/nginx-site.conf | R | 全程 | 仅读取已写入的配置(08-04 已重构 27 → 177 行) |
| vite.config.ts | R | 全程 | 仅读取 base: '/app/' 配置 |
| website/lib/site.ts | R | 全程 | 仅读取 appUrl / CTA_LINKS 配置 |
| src/main.tsx | R | 全程 | 仅读取 OAuth 回调路径配置 |
| .trae/agents/04-marketing-website.md | R | 全程 | 仅读取官网定位文档 |

### 1.2 API 接口

| 接口路径 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- |
| GET /api/v1/health | R | 步骤 6 | 验收时调用健康检查 |
| GET /api/v1/auth/feishu/authorize | R | 步骤 6 | 验收时验证 OAuth 入口可达 |

### 1.3 数据库表

> 本任务不涉及数据库表变更。

### 1.4 环境变量

> 本任务不涉及环境变量变更。

### 1.5 运行环境

| 环境 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- |
| 生产 VPS(43.128.25.202) | X | 2026-08-04 14:00 ~ 2026-08-05 18:00 | 部署窗口,独占,期间不允许其他任务部署 |

### 1.6 第三方服务

| 服务 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- |
| 腾讯云 VPS(SSH) | X | 同生产 VPS | 部署操作通过 SSH 执行 |
| SSL 证书服务 | W | 步骤 2 | 上传证书文件 |
| 腾讯云安全组 | W | 步骤 5 | 添加 TCP:80 入站规则 |

### 1.7 静态资源

| 资源路径 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- |
| /var/www/danqing-ai/website/ | W | 步骤 3 | 上传官网产物(website/out/*) |
| /var/www/danqing-ai/dist/ | W | 步骤 4 | 上传业务应用产物(dist/*) |
| /etc/nginx/ssl/danqing-ai.crt | W | 步骤 2 | 上传 SSL 证书 |
| /etc/nginx/ssl/danqing-ai.key | W | 步骤 2 | 上传 SSL 私钥 |
| /etc/nginx/conf.d/danqing.conf | W | 步骤 5 | 部署 nginx 配置 |

---

## 二、资源协调说明

### 2.1 与其他任务的资源关系

| 任务 | 关系 | 说明 |
| --- | --- | --- |
| TASK-0002(飞书 OAuth 回调更新) | 串行依赖 | TASK-0002 需等待 TASK-0001 完成后,飞书回调才能访问 |
| TASK-0003(QA 最终报告) | 可并行 | TASK-0003 只读 src/ 和 server/,不涉及生产 VPS,可与本任务并行 |

### 2.2 资源占用时段冲突预防

- **生产 VPS 部署窗口**:2026-08-04 14:00 ~ 2026-08-05 18:00,此期间其他任务禁止部署到生产环境
- **nginx 重载窗口**:步骤 5 执行 `systemctl reload nginx` 期间(预计 1 分钟),所有请求短暂中断
- **回滚预案**:若部署失败,回滚至 `/var/www/danqing-ai/dist.bak.20260802_173107`(08-02 备份)

---

## 三、资源变更记录

| 时间 | 变更内容 | 操作人 |
| --- | --- | --- |
| 2026-08-04 14:00 | 初始资源声明 | product-architect |
