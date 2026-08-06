# TASK-0001 — VPS 部署架构落地

> 本文件是示例任务,用于演示真源文档系统的标准用法。
> 实际任务请基于 [templates/task-template.md](../../templates/task-template.md) 创建。

---

## 一、任务元信息

| 字段 | 值 |
| --- | --- |
| 任务 ID | TASK-0001 |
| 标题 | VPS 部署架构落地 |
| 状态 | 🔵 IN_PROGRESS |
| 优先级 | P0 |
| 负责人 | devops-qa |
| 协作人 | auth-oauth |
| 创建时间 | 2026-08-04 |
| 计划开始 | 2026-08-04 |
| 计划完成 | 2026-08-05 |
| 实际完成 | — |
| 依赖任务 | 无 |
| 关联里程碑 | 复赛冲刺 P0 |

## 二、任务目标

在腾讯云 VPS(43.128.25.202)上完成 nginx 配置部署、SSL 证书上传、官网与业务应用产物上传,实现 HTTPS 访问与官网/业务应用一体化挂载。

**验收标准(DoD)**:

- [ ] `curl -I https://www.danqing.site/` 返回 200 + 官网 HTML
- [ ] `curl -I https://www.danqing.site/app/` 返回 200 + 业务应用 HTML
- [ ] `curl -I http://www.danqing.site/` 返回 301 + Location: https://...
- [ ] `curl -sI -H 'Accept-Encoding: gzip' https://www.danqing.site/app/assets/*.js` 含 `Content-Encoding: gzip`
- [ ] 响应头含 `Strict-Transport-Security` / `X-Frame-Options: DENY`
- [ ] `Server` 头不含版本号

## 三、执行步骤

> 详细步骤见 [plan.md](plan.md)。此处仅列阶段概览。

- [x] 1. 阶段一:准备部署资源(SSL 证书、产物构建)
- [~] 2. 阶段二:VPS 上传与配置部署
- [ ] 3. 阶段三:nginx 配置验证与重载
- [ ] 4. 阶段四:全链路验收测试

## 四、资源需求

> 详细资源声明见 [resources.md](resources.md)。

| 资源类型 | 资源 | 占用类型 | 备注 |
| --- | --- | --- | --- |
| 运行环境 | 生产 VPS(43.128.25.202) | X | 部署窗口,独占 |
| 配置文件 | deploy/nginx-site.conf | R | 仅读取已写入的配置 |
| 静态资源 | /var/www/danqing-ai/website/ | W | 上传官网产物 |
| 静态资源 | /var/www/danqing-ai/dist/ | W | 上传业务应用产物 |
| 静态资源 | /etc/nginx/ssl/danqing-ai.crt | W | 上传 SSL 证书 |
| 第三方服务 | 腾讯云 VPS(SSH) | X | 部署操作 |

## 五、风险与注意事项

- **风险 1**:SSL 证书文件路径不正确 → 缓解措施:上传前确认 `/etc/nginx/ssl/` 目录存在,证书文件名与 nginx 配置一致
- **风险 2**:nginx 配置语法错误导致服务中断 → 缓解措施:执行 `nginx -t` 验证后再 `systemctl reload nginx`,而非 `restart`
- **风险 3**:80 端口未放行导致 HTTP→HTTPS 跳转失败 → 缓解措施:腾讯云安全组添加 TCP:80 入站规则
- **风险 4**:官网产物路径与业务应用产物混淆 → 缓解措施:严格区分 `website/` 与 `dist/`,部署前双重确认

## 六、变更历史

> 完整变更记录见 [changelog.md](changelog.md)。

| 版本 | 时间 | 变更摘要 | 变更人 |
| --- | --- | --- | --- |
| v0.1.0 | 2026-08-04 | 任务创建 | product-architect |
| v0.2.0 | 2026-08-04 | 状态变更为进行中 | devops-qa |
| v0.2.1 | 2026-08-04 | 完成步骤 1:准备部署资源 | devops-qa |

## 七、相关链接

- 执行步骤详情:[plan.md](plan.md)
- 资源需求详情:[resources.md](resources.md)
- 变更历史:[changelog.md](changelog.md)
- 任务总览登记:[../registry/active-tasks.md](../registry/active-tasks.md)
- 冲突矩阵:[../registry/conflict-matrix.md](../registry/conflict-matrix.md)
- 来源上下文:[../../documents/context-log-2026-08-04.md](../../documents/context-log-2026-08-04.md)
