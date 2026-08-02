# P0 修复计划文档

> 范围:V2(交互骨架优化)上线后代码审查发现的 P0 缺陷修复
> 基线版本:`53ad27e`(已部署生产)
> 约束:**不修改现有框架结构**(分层架构 / 路由 / 中间件 / 数据模型不变),仅在现有方法内部最小侵入式修复

---

## 一、问题描述

### P0-1 草稿孤儿风险(数据一致性)

- **位置**:`src/services/draft-service.ts` `createDraft`(L160-189)
- **现象**:`createDraft` 先写草稿本体(`writeDraftRaw`),再追加索引(`writeIndex`)。索引写入失败时**不回滚草稿本体**,注释声称"listDrafts 自愈",但 `listDrafts`(L196-227)只遍历索引,索引里没有的草稿**永远不会被列出**。
- **影响**:LocalStorage 配额临界时反复创建草稿,会积累无法访问的孤儿草稿,持续占用配额,最终导致用户无法新建草稿。
- **根因**:索引写入失败缺乏回滚;缺少孤儿扫描机制。

### P0-2 通知触发点未接线(功能空转)

- **位置**:`server/src/services/notification.service.ts` `createNotification`(L290-320)
- **现象**:`createNotification` 内部方法已就绪,`notification.repository.ts` `create` 已就绪,但**没有任何业务点调用**。分析完成/失败、评审提交等场景未触发通知创建。
- **影响**:通知表(`notifications`)永远是空的,前端通知面板、未读计数 Badge 永远显示 0,通知系统形同虚设。
- **根因**:V2 任务包 B 只完成了通知 CRUD 与 API,未接入业务触发点。

### P0-3 评审提交未通知作品所有者

- **位置**:`server/src/services/review.service.ts` `createReview`(L46-80)
- **现象**:评审记录创建后仅记录审计日志,未通知作品所有者(`analysis.userId`)。
- **影响**:学生提交作品后,评委评审完成,学生收不到任何通知,无法及时查看评审结果。

---

## 二、修复目标

| 编号 | 目标 | 验收标准 |
|------|------|----------|
| P0-1 | 消除草稿孤儿风险 | 索引写入失败时回滚草稿本体;新增 `reconcileIndex()` 可扫描补全孤儿;单测覆盖回滚与扫描场景 |
| P0-2 | 分析完成/失败触发通知 | `runAnalysis` 成功→创建 `ANALYSIS_DONE` 通知;失败→创建 `ANALYSIS_FAIL` 通知;通知创建异步、失败不阻塞主流程 |
| P0-3 | 评审提交触发通知 | `createReview` 成功后通知作品所有者(`REVIEW` 类型);AI 评审与人工评审均触发 |
| 通用 | 不破坏现有功能 | tsc 零错误、ESLint 零 warning、现有测试全绿(前端 680+ / 后端 34+) |

---

## 三、实施步骤

### 阶段 0:备份(执行前)

| 备份项 | 方式 | 位置 |
|--------|------|------|
| 代码 | `git stash` + 记录当前 commit `53ad27e` | 本地 git |
| 配置 | 生产 `server/.env` 已有历史备份 `.env.bak.20260802_190717` | 服务器 |
| 数据库 | `docker exec danqing-postgres pg_dump` | 服务器 `/tmp/danqing_backup/` |
| 前端 dist | 已有 `dist.bak.20260802_223200` | 服务器 |

### 阶段 1:P0-1 草稿孤儿修复

**文件**:`src/services/draft-service.ts`

**改动 1**:`createDraft` 索引写入失败时回滚草稿本体
```
现有(L186):writeIndex(ids); // 索引写入失败不回滚草稿
改为:if (!writeIndex(ids)) { removeDraftRaw(draft.id); return null; }
```

**改动 2**:新增 `reconcileIndex()` 导出函数
- 扫描 `localStorage` 所有 `dq_draft_` 前缀的 key
- 对比索引,补全缺失的 id(修复历史孤儿)
- 在 `listDrafts` 首次调用时惰性触发一次(用模块级 flag 避免重复扫描)

**约束**:不改变 `createDraft` / `listDrafts` 等函数签名;`reconcileIndex` 作为新增导出函数,不影响现有调用方。

### 阶段 2:P0-2 分析完成通知接线

**文件**:`server/src/services/analysis.service.ts`

**改动**:在 `runAnalysis` 步骤 6(`updateResult` 成功后,步骤 7 清理文件前)插入异步通知创建
- 成功:`type=ANALYSIS_DONE`,`level=SUCCESS`,`title="作品分析完成"`,`content="《${title}》分析完成,综合评分 ${overallScore}"`,`linkUrl=/analysis/${id}`
- 失败:`type=ANALYSIS_FAIL`,`level=ERROR`,`title="作品分析失败"`,`content="《${title}》分析失败"`,`linkUrl=/analysis/${id}`
- 调用方式:`notificationService.createNotification(...).catch(err => logger.warn(...))` 异步不阻塞
- `metadata`:`{ analysisId, artType, overallScore }`(便于前端跳转与统计)

**约束**:不改变 `runAnalysis` 返回值与签名;通知创建失败仅记录日志,不影响分析结果返回(3 秒 SLA 不受影响)。

### 阶段 3:P0-3 评审提交通知接线

**文件**:`server/src/services/review.service.ts`

**改动**:在 `createReview` 写入评审记录成功后(L77 审计日志后)插入异步通知
- `type=REVIEW`,`level=INFO`,`title="作品收到新评审"`,`content="您的作品《${analysis.title}》收到${reviewerType}评审"`
- `userId=analysis.userId`(通知作品所有者,非评审人)
- `linkUrl=/analysis/${analysisId}`
- `metadata`:`{ reviewId, analysisId, reviewerType }`

**约束**:不改变 `createReview` 返回值与签名;AI 评审(`reviewerType=ai`)与人工评审均触发;通知失败不阻塞评审提交。

### 阶段 4:验证与回归

1. `npm run typecheck`(根目录 + server)
2. `npm run lint`(根目录)
3. `npm run test`(根目录,前端 680+ 用例)
4. `cd server && npm test`(后端 34+ 用例)
5. 新增用例:草稿回滚、reconcileIndex、通知触发(analysis/review)

### 阶段 5:部署

1. 本地 commit
2. push origin main
3. SSH 生产:`git pull` → `npm ci`(前端如有依赖变更)→ `cd server && npm run build` → `npm run build`(前端)→ `pm2 restart danqing-api`
4. 验证:`/health` 200、`/api/v1/notifications` 带 token 200、创建分析后通知表有记录

---

## 四、影响分析与替代方案

### 影响面评估

| 改动 | 影响范围 | 风险等级 | 说明 |
|------|----------|----------|------|
| draft-service createDraft 回滚 | 前端草稿创建 | 低 | 仅在索引写失败时多一步 removeDraftRaw,正常路径无变化 |
| reconcileIndex 新增 | 前端 listDrafts | 低 | 惰性触发一次,扫描 localStorage,耗时 < 10ms |
| analysis 通知接线 | 后端分析接口 | 低 | 异步调用,catch 兜底,不影响 3 秒 SLA |
| review 通知接线 | 后端评审接口 | 低 | 异步调用,catch 兜底,不影响评审提交 |

### 替代方案与应急预案

**方案 A(首选)**:按上述计划最小侵入式修复
- 优点:改动小、风险低、不破坏框架
- 适用:正常情况

**方案 B(降级)**:若 `reconcileIndex` 扫描在生产环境引发性能问题
- 降级:移除 `listDrafts` 中的惰性触发,改为仅在 `createDraft` 索引失败时主动调用
- 触发条件:用户反馈草稿列表加载变慢

**方案 C(回滚)**:若修复引入新问题
- 代码回滚:`git reset --hard 53ad27e` + 重新构建部署
- 数据库回滚:`notifications` 表为新增表,回滚不影响现有数据;若需彻底回滚,执行 `DROP TABLE notifications`(但会丢失已生成的通知)
- 草稿数据:LocalStorage 为客户端数据,修复不涉及数据迁移,无需回滚

### 监控点

- 部署后 1 小时内观察 PM2 日志:`pm2 logs danqing-api --lines 50`
- 关注 `[notification]` 日志条目是否出现
- 关注 `[analysis]` 日志无新增错误
- 前端控制台无 localStorage 相关报错

---

## 五、责任分工

| 阶段 | 责任模块 | 执行方式 |
|------|----------|----------|
| P0-1 草稿修复 | 前端(draft-service) | 直接编辑 |
| P0-2 通知接线 | 后端(analysis.service) | 直接编辑 |
| P0-3 评审通知 | 后端(review.service) | 直接编辑 |
| 验证 | 前后端测试 | 本地 vitest |
| 部署 | DevOps | SSH + PM2 |

---

## 六、验收清单

- [ ] `createDraft` 索引失败时草稿本体被回滚(单测验证)
- [ ] `reconcileIndex` 能补全孤儿草稿(单测验证)
- [ ] 分析成功后 `notifications` 表新增 `ANALYSIS_DONE` 记录(单测验证)
- [ ] 分析失败后 `notifications` 表新增 `ANALYSIS_FAIL` 记录
- [ ] 评审提交后作品所有者收到 `REVIEW` 通知
- [ ] 通知创建失败不阻塞主流程(catch 兜底)
- [ ] tsc / ESLint / vitest 全绿
- [ ] 生产部署后 `/api/v1/notifications` 带 token 返回 200
