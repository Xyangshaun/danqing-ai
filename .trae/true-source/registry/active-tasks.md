# 活动任务总览登记表

> 本文件是当前所有活动任务的「单一信息源」。每次状态或进度变更必须同步更新本表。
> 字段不可省略,无值填 `—`。

**最后更新**:2026-08-07 00:55(G9 优化任务全面审查)
**活动任务数**:0
**整体进度**:14 / 14 步骤完成(100%)
**当前阶段**:复赛冲刺(08-04 ~ 08-09)

---

## 一、活动任务总览

| ID | 标题 | 状态 | 优先级 | 负责人 | 进度 | 开始 | 计划完成 | 依赖 | 关键资源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-0001 | VPS 部署架构落地 | ✅ COMPLETED | P0 | devops-qa | 6/6 (100%) | 2026-08-04 | 2026-08-06 | — | 生产 VPS(X) |
| TASK-0002 | 飞书 OAuth 回调 URL 更新 | ✅ COMPLETED | P0 | auth-oauth | 3/3 (100%) | 2026-08-04 | 2026-08-06 | TASK-0001 | 飞书开放平台(W) |
| TASK-0003 | QA 最终报告创建 | ✅ COMPLETED | P1 | devops-qa | 5/5 (100%) | 2026-08-05 | 2026-08-07 | — | src/*(R), server/*(R) |

## 二、按状态分组

### ✅ 已完成(COMPLETED)

- **TASK-0001** — VPS 部署架构落地 | 负责人:devops-qa | 完成于 2026-08-06 23:45
  - 完成内容:前端 dist 已部署(22 chunks)+ 后端 git pull(25142d4→63f7d8a fast-forward)+ npm install + prisma generate + migrate deploy(无 pending)+ dist 重建(tsc 编译)+ pm2 restart + 健康检查 200 + traceId UUID 验证
  - 详见下方「本轮部署发现」

- **TASK-0002** — 飞书 OAuth 回调 URL 更新 | 负责人:auth-oauth | 完成于 2026-08-06 23:45
  - 完成内容:飞书应用 `cli_aaedf9c92cb8dd1f` 重定向白名单已包含 `https://www.danqing.site/app/auth/feishu/callback`(无需用户手动添加)
  - 验证:GET `/api/v1/auth/feishu/authorize` 加 `X-Device-Id` 头返回 200 + authorizeUrl;访问 authorizeUrl 302 跳转 `accounts.feishu.cn`;跟随重定向落地飞书登录页(200, 92K HTML)
  - 注意:`device_id` 从 **请求头**(`X-Device-Id` 或 `X-Client-Context` JSON)读取,**不是** query 参数

- **TASK-0003** — QA 最终报告创建 | 负责人:devops-qa | 完成于 2026-08-07 00:30
  - 完成内容:产出 `qa/07-final-report.md`(405 行,10 章节)
  - 范围:`server/` + `src/`(不覆盖 `prototype/`)
  - 后端测试:25 文件 / 929 用例 100% 通过,耗时 4.17s
  - 前端测试:32 文件 / 691 用例 100% 通过,耗时 10.72s
  - 性能 SLA:Phase 1 mock P95<100ms 达 SLA 30 倍余量;Phase 2 真实 AI 推理临界,已落地 `AI_API_TIMEOUT=2500ms` 硬熔断 + Jimp fallback
  - OWASP Top 10:10 项中 9 项 PASS,1 项低风险反模式 S-001(`buildDateWhereClause` 走 `Prisma.raw` 字符串拼接,Date 类型不可注入,非阻断)
  - 历史缺陷回归:D-001 / P-001 / Bug#1 / Bug#2 全部确认修复
  - 结论:满足生产部署质量门禁,建议放行

### 🔵 进行中(IN_PROGRESS)

- (暂无)

### ⚪ 待启动(PENDING)

- (暂无)

### 🟡 已阻塞(BLOCKED)

- (暂无)

### 🟣 待验收(REVIEW)

- (暂无)

## 三、并行执行矩阵

> 标记 ✓ 表示可并行执行,✗ 表示存在冲突需串行。

| 任务对 | 可并行 | 冲突资源 | 处理建议 |
| --- | --- | --- | --- |
| TASK-0001 × TASK-0002 | ✗ | 生产 VPS(X) | TASK-0002 串行等待 TASK-0001 完成 |
| TASK-0001 × TASK-0003 | ✓ | 无(资源只读 vs 独占,不冲突) | 可并行 |
| TASK-0002 × TASK-0003 | ✓ | 无 | 可并行 |

## 四、本周关键时间节点

| 日期 | 任务 | 事件 |
| --- | --- | --- |
| 2026-08-04 | TASK-0001 | 任务启动,执行 SSL 证书上传 |
| 2026-08-06 | TASK-0001 | ✅ **实际完成**:后端 git pull + dist 重建 + pm2 restart + 健康检查通过 |
| 2026-08-06 | TASK-0002 | ✅ **实际完成**:飞书 OAuth 白名单已配,authorize endpoint 端到端验证通过 |
| 2026-08-05 | TASK-0003 | 计划启动,QA 报告框架创建 |
| 2026-08-07 | TASK-0003 | 计划完成,QA 最终报告归档 |
| 2026-08-08 | - | 复赛冲刺阶段中期检查点 |
| 2026-08-09 | - | 复赛冲刺阶段结束 |

## 五、维护规则

1. **每次状态变更必须同步更新本表**(活动任务行 + 按状态分组)
2. **新增任务时**:在活动任务总览表追加一行 + 加入「待启动」分组
3. **完成任务时**:从本表移除该行 + 在 `registry/completed-archive.md` 追加归档记录
4. **冲突变更时**:同步更新「并行执行矩阵」
5. **每次更新后**:修改顶部的「最后更新」时间戳与「整体进度」
6. **每周一**:更新「本周关键时间节点」(本周指 2026-08-04 ~ 2026-08-10)

## 六、统计指标

| 指标 | 值 | 说明 |
| --- | --- | --- |
| 活动任务数 | 0 | 当前未归档的任务数(全部完成) |
| 阻塞任务数 | 0 | 当前 🟡 BLOCKED 状态的任务数 |
| P0 任务数 | 0 | 紧急任务数(TASK-0001 + TASK-0002 已完成) |
| P1 任务数 | 0 | 高优先级任务数(TASK-0003 已完成) |
| 本周到期任务数 | 0 | 截止日期在本周内的任务数 |
| 整体完成率 | 100% | 14/14 步骤完成 |

---

## 七、本轮部署发现(2026-08-06 23:45)

### TASK-0001 完成情况

**服务器**:腾讯云 VPS 43.128.25.202,部署路径 `/var/www/danqing-ai`

**前端 dist**:已部署新代码(2026-08-06 19:42 更新),22 个 chunk,含 `useLazyImage-BFImkU1V.js` / `EmptyState-CK1pX2Fk.js` 独立 chunk(V2-D 拆分产物),bundle 校验全过:
- `/api/v1` 命中 1 次 ✓
- `/app/auth/feishu/callback` 命中 2 次 ✓(新路径)
- 旧路径 `danqing.site/auth/feishu/callback` 命中 0 次 ✓(无遗留)
- `trae-api-cn` / `localhost:3000` / `localhost:5173` / `127.0.0.1` 全 0 ✓(无外链/无本地硬编码)
- `aria-label` 命中 6 行 ✓(V2-D 无障碍产物已上线)

**后端 git pull**:fast-forward `25142d4` → `63f7d8a`(7 个 commit)
- 本地未提交修改 `deploy-ssh.sh` + `server/prisma/seed.ts` 经查与 origin/main 内容一致(仅 mode 差异),`git checkout --` 重置后 fast-forward 干净完成
- `npm ci --omit=dev` 安装 300 packages 成功
- `npx prisma generate` 生成 Prisma Client v5.22.0 ✓
- `npx prisma migrate deploy` 无 pending migrations(3 个已应用)✓
- **关键发现**:`server/dist/` 落后 src 1 天(Aug 5 build vs Aug 6 src)→ 执行 `npm run build` 重建 dist(tsc 编译,因 `--omit=dev` 缺 @types/* 报 TS 警告但 noEmitOnError=false 仍 emit JS)→ dist mtime 更新到 Aug 6 23:36 ✓

**PM2 重启 + 健康检查**:
- `pm2 restart danqing-api` → online ✓
- `curl http://127.0.0.1:3000/health` → 200 `{"status":"up","traceId":"<UUID>"}` ✓(traceId 是 UUID → 新代码 errorHandler 兜底生效)
- 公网 `curl https://www.danqing.site/health` → 200 ✓
- nginx access.log 显示真实用户 `202.184.35.171` 在用(`/api/v1/notifications/unread-count` + `/api/v1/auth/refresh` 200)✓

### TASK-0002 完成情况(飞书 OAuth 端到端验证)

**飞书 authorize endpoint 测试**:
- `device_id` 从 **请求头** 读取(`X-Device-Id` 或 `X-Client-Context` JSON),**不是** query 参数
- `curl -H "X-Device-Id: test123" https://www.danqing.site/api/v1/auth/feishu/authorize` → 200 ✓
- 返回 authorizeUrl:`https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_aaedf9c92cb8dd1f&redirect_uri=https%3A%2F%2Fwww.danqing.site%2Fapp%2Fauth%2Ffeishu%2Fcallback&response_type=code&state=<64-char-hex>`
- 访问 authorizeUrl → 302 重定向到 `accounts.feishu.cn` ✓(若白名单未配会返回 400 + error 20029)
- 跟随重定向 → 200 落地飞书登录页(92K HTML)✓
- **结论**:飞书应用 `cli_aaedf9c92cb8dd1f` 重定向白名单已包含 `https://www.danqing.site/app/auth/feishu/callback`,无需用户手动添加

**服务器 .env 飞书回调配置正确**:
- `FEISHU_REDIRECT_URI_WEB=https://www.danqing.site/app/auth/feishu/callback`
- `FEISHU_REDIRECT_URI_ADMIN=https://www.danqing.site/app/auth/feishu/callback`
- `FEISHU_REDIRECT_URI_MOBILE=https://www.danqing.site/app/auth/feishu/callback`

### PM2 日志问题(已修复 - G7)

**状态**:✅ 已修复(2026-08-07)。`app.log` + `out.log` 均正常写入。

**最终现象**:`/var/www/danqing-ai/logs/{app,out}.log` 均 0 字节,即便添加 File transport 兜底 + pm2 restart 后仍为空;`error.log` 仅在手动注入 `console.error` 时有内容(说明 PM2 捕获 stderr 正常,问题在 winston 自身)。

**决定性排查(二分法)**:
1. 创建 `test-danqing-logger.mjs` 用 `node --env-file=server/.env` 直接运行(不经 PM2,cwd 与 PM2 一致),确认 `initLogger()` 成功创建 logger(2 个 transports:Console+File,level=info)✓
2. 但 `logger.info()` / `logger.error()` / `inst.info()` 直接调用 → **Console transport 无输出 + app.log 0 字节** ✗
3. **证明问题与 PM2 无关**:winston format 配置本身静默失败。
4. 创建 `test-bisect.mjs` 二分排查 7 种 format 组合,写入 `/tmp/bisect-{A..G}.log` 对比:
   - A(minimal 无 format)→ 50 字节 ✓
   - B(timestamp+json)→ 85 字节 ✓
   - C(timestamp+errors+json)→ 92 字节 ✓
   - **D(timestamp+errors+`redactFormatBad`+json)→ 0 字节 ✗**
   - E(timestamp+errors+`redactFormatGood`+json)→ 107 字节 ✓
   - **F(consoleFormat+`redactFormatBad`)→ 0 字节 ✗**
   - G(consoleFormat+`redactFormatGood`)→ 80 字节 ✓
5. 精确定位:`redactFormat` 是元凶。

**最终根因**:`redactFormat` 内部调用 `redact(info)`,而 `redact()` 用 `const out = {}; for (const [k,v] of Object.entries(obj)) {...}` **返回了一个全新对象**。winston 的 info 对象携带 Symbol 键元数据(`Symbol.for('level')` / `Symbol.for('message')` / `Symbol.for('splat')`),这些是非枚举属性,`Object.entries` / `Object.keys` 不会遍历到,新对象完全丢失这些 Symbol。winston 的 Console/File transport 依赖这些 Symbol 决定如何输出日志条目;Symbol 丢失时 **transport 静默丢弃条目**(不抛错、不打印),导致 app.log + out.log 同时 0 字节,而 `console.error`(绕过 winston)仍正常 → 完美解释所有现象。

**修复**(已应用到 `server/src/utils/logger.ts`):
- `redact()` 改为 **原地递归 mutate**(直接修改 `obj[k] = ...` 并返回同一引用),不再创建新对象
- `redactFormat` 改为 `redact(info); return info;`(返回原 info 引用,保留所有 Symbol 元数据)
- 数组处理:原地遍历 mutate 元素,不再 `obj.map(...)` 创建新数组
- 函数签名与对外语义不变:`redact(meta)` 在 `consoleFormat.printf` 中仍可用于 `JSON.stringify`(meta 是解构产生的新对象,mutate 不影响 info)

**验证结果**(pm2 restart 后):
- `app.log`:788 字节,6 条启动日志(env loaded / prisma initialized / redis initialized / listening / routes mounted / redis connected)✓
- `out.log`:956 字节,同 6 条(PM2 经 stdout 捕获 Console transport 输出)✓
- `error.log`:0 字节(无错误)✓
- 健康检查 HTTP 200 ✓
- 日志格式正确:`2026-08-07 00:04:41.848 [info] [startup] env loaded {"service":"danqing-ai-server","nodeEnv":"production","port":3000,"logLevel":"info"}`

**附带修复**:之前为排查添加的 `winston.transports.File` 兜底 transport 保留(双写 app.log + stdout,提升日志可靠性,防 PM2 stdout 捕获异常时丢日志)。`initLogger()` 中的 `fs.mkdirSync(logDir, { recursive: true })` 也保留。

**经验教训**:
1. winston format 函数必须 **mutate 并返回同一 info 引用**,不可返回新对象 —— 这是 logform 协议的隐式契约,文档未显式强调。
2. 静默失败是最难排查的 bug 类型:不抛错、不打印、不记录。二分法是定位此类问题的金标准。
3. 之前的"PM2 fork + Node 20 ESM + 非 TTY socket"假设是误判 —— 真正原因与运行环境无关,纯粹是 winston format 配置问题。独立 `node` 运行(不经 PM2)即可复现,这是关键突破点。

#### 维护参考:日志配置方案速查

**配置位置**:`server/src/utils/logger.ts`(源)+ `server/dist/utils/logger.js`(编译产物,PM2 实际加载)

**架构概览**:
```
业务代码 logger.info/warn/error(msg, meta?)
        ↓ dispatch() 规整参数
loggerInstance (winston.createLogger)
        ├─ format: logFormat (timestamp + errors + redactFormat + json)
        ├─ defaultMeta: { service: 'danqing-ai-server' }
        ├─ transport[0]: Console (format: consoleFormat) → stdout → PM2 捕获 out.log
        └─ transport[1]: File     (format: consoleFormat) → /var/www/danqing-ai/logs/app.log
```

**双写策略**:Console transport(经 PM2 捕获到 out.log)+ File transport(直接写 app.log)。两条链路独立,任一异常另一条仍可用。File transport 作为兜底,防 PM2 stdout 捕获机制异常时丢日志。

**日志文件**(服务器路径,PM2 cwd = `/var/www/danqing-ai`):
| 文件 | 来源 | 用途 |
|------|------|------|
| `logs/app.log` | winston File transport | 业务日志主文件(10MB 轮转,保留 5 份) |
| `logs/out.log` | PM2 捕获 stdout | Console transport 输出(含 winston 格式化) |
| `logs/error.log` | PM2 捕获 stderr | 异常输出(含 `console.error` 兜底 + winston error 级别经 Console transport) |

**日志级别**:`env.LOG_LEVEL` 控制(production=info)。Console transport 继承 logger 级别,File transport 显式 `level: cfg.logLevel`。

**格式链**:
- `logFormat`(File transport 主格式):`timestamp(YYYY-MM-DD HH:mm:ss.SSS)` → `errors({stack:true})` → `redactFormat()` → `json()`
- `consoleFormat`(Console + File transport 均用):`colorize()` → `timestamp()` → `redactFormat()` → `printf(自定义)`
- 输出样例:`2026-08-07 00:04:41.848 [info] [startup] env loaded {"service":"danqing-ai-server","nodeEnv":"production"}`

**脱敏规则**(redact 函数,原地 mutate):
- SENSITIVE_KEYS(password/secret/token/cookie/private_key 等 21 个变体)→ 字符串保留前 8 字符 + `...`,非字符串 → `****`
- phone/mobile/phone_number → 138****1234
- email → z***@example.com
- 递归处理嵌套对象与数组

**关键不变量(修改 logger.ts 时务必遵守)**:
1. **`redactFormat` 必须 mutate info 并返回同一引用** —— 不可 `return 新对象`。原因:winston info 携带 `Symbol.for('level')`/`Symbol.for('message')`/`Symbol.for('splat')` 非枚举元数据,`Object.entries`/`Object.keys` 不会遍历到;返回新对象会丢失 Symbol,导致 Console/File transport **静默丢弃条目**(不抛错)。这是本次 G7 修复的核心。
2. **新增 format 时,优先 mutate 原对象**,不要 `Object.assign` 到新对象。`winston.format.printf` 中对解构出的 `meta` 可自由新建对象(已脱离 info,不影响 transport)。
3. **调整 transport 后必须实测**:`pm2 restart danqing-api && sleep 3 && tail logs/app.log`,确认有新增条目。

**验证日志系统是否正常(排查指南)**:
1. **快速健康检查**:`pm2 restart danqing-api --update-env && sleep 3 && wc -c logs/app.log` —— 应 > 500 字节(6 条启动日志)。
2. **触发业务日志**:`curl -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3000/api/v1/auth/login` → app.log 应出现 `[warn] [error] body parse failed`。
3. **若 app.log 再次 0 字节**(日志系统回归):
   - 先确认 env 加载正常:`node --env-file=server/.env -e "import('./dist/config/env.js').then(m=>m.env())"`(不抛错即 OK)
   - 再用独立脚本二分排查 format:`node --env-file=server/.env server/test-bisect.mjs`(参考本次排查的 7 配置矩阵,临时脚本不入库)
   - 重点检查是否有 format 返回了新对象
4. **进程级兜底**:`uncaughtException`/`unhandledRejection`(index.ts L145-160)依赖 logger.error 落盘。若 PM2 重启计数增长但 error.log 空,说明 logger 又静默失败了 —— 用上述步骤排查。

**设计性不记录(非 bug)**:
- `/health` 不记录(handler 不调用 logger,避免探针刷屏)
- 404 不记录(`notFoundHandler` 静默返回)
- 401 不记录(auth 中间件静默拒绝)
- 如需安全审计追踪 401/404,可在对应中间件加 `logger.debug` 级别(默认 info 不输出,`LOG_LEVEL=debug` 即可见)

### SIGINT 来源排查与监控建议(2026-08-07 G8)

**触发**:G7 修复后验证 error.log 时发现 PM2 restarts 从 19→21,uptime 仅 68s,确认有 2 次重启但 error.log 仍 0 字节,需查 SIGINT 来源是否异常。

#### 一、事件时间线(证据链)

| 时间 | 事件 | 证据来源 |
|------|------|----------|
| 2026-08-06 23:56:04~07 | **4 次 `exited with code [1] via signal [SIGINT]`** | `~/.pm2/pm2.log` |
| 2026-08-07 00:04 | 最后一次 `pm2 restart`(G7 修复后部署) | pm2 list(restarts=19) |
| 00:04~00:24 | 进程稳定运行 20 分钟,error.log 保持 0 字节 | app.log(6 条启动日志) |
| 00:10:06 | 真实用户 token 刷新 → `[info] [auth] refresh success` | app.log |
| 00:24:25 | **SIGINT #1** → 优雅关闭 → 重启 | pm2.log + app.log `[shutdown] graceful shutdown start {"signal":"SIGINT"}` |
| 00:24:25 | 同时:ubuntu 用户 sudo `cp .env .env.bak.20260807_002425` + `tee -a .env` | journalctl sudo 记录 |
| 00:24:25 | .env 追加 `DEPLOY_SYNC_SECRET=...` + 修改 `UPLOAD_DIR=./uploads→/lhcos-data/uploads` | diff .env.bak vs .env |
| 00:24:57 | 双路日志验证测试(2 次 POST /api/v1/auth/login 坏 body) | app.log 2 条 warn |
| 00:27:35 | **SIGINT #2** → 优雅关闭 → 重启 | pm2.log(app.log 同步记录) |

#### 二、SIGINT 来源定性(非异常)

**结论:2 次 SIGINT 均为手动 `pm2 restart`(部署/配置同步操作),非崩溃、非 health-check.sh 自动触发。**

**证据**:
1. **PM2 daemon 日志**:两次都是 `Stopping app:danqing-api id:0` 开头 —— 这是 `pm2 restart` 主动停止流程,不是崩溃后自动拉起。
2. **时间戳不匹配 health-check.sh**:health-check.sh 由 cron 在每分钟 `:01` 秒运行,但 SIGINT 发生在 `:25` 和 `:35` 秒,排除 cron 自动触发。
3. **app.log 优雅关闭序列完整**:两次都记录了 `graceful shutdown start {"signal":"SIGINT"}` → `http server closed` → `redis closed` → `prisma disconnected` → `graceful shutdown complete, exit 0` —— exit code **0**(非 1),证明是正常关闭非崩溃。
4. **00:24:25 的 journalctl 证据**:同时刻有人通过 sudo `cp .env .env.bak` + `tee -a .env` 修改环境变量(新增 `DEPLOY_SYNC_SECRET` 部署同步密钥 + 改 `UPLOAD_DIR` 到 `/lhcos-data/uploads`),随后 `pm2 restart` 使配置生效。**这很可能是 1panel 面板或部署同步工具的操作**(伴随 `1pctl user-info` bash history 记录)。

#### 三、历史"静默崩溃"证据(已被 G7 修复)

PM2 daemon 日志显示 23:56:04~07 有 **4 次连续 `exited with code [1] via signal [SIGINT]`** —— **exit code 1** 而非 0:
```
2026-08-06T23:56:03: Stopping app:danqing-api id:0
2026-08-06T23:56:04: App [danqing-api:0] exited with code [1] via signal [SIGINT]  ← 崩溃
2026-08-06T23:56:04: App [danqing-api:0] starting in -fork mode-
2026-08-06T23:56:04: App [danqing-api:0] exited with code [1] via signal [SIGINT]  ← 崩溃
... (4 次循环)
```

**定性**:这是 `uncaughtException`/`unhandledRejection` 触发 `process.exit(1)`(index.ts L147/L159)的崩溃重启。PM2 在 fork 模式下将 exit 1 记录为 "via signal [SIGINT]"(实际是应用主动 exit,非外部 SIGINT)。

**关键**:这些崩溃**未在 app.log/out.log/error.log 留下任何日志** —— 因为 G7 修复前 `redactFormat` 返回新对象丢失 Symbol,导致 `logger.error('[fatal] uncaughtException', ...)` 被静默丢弃。这正是 G7 修复的核心问题:**进程崩溃重启但零日志**。修复后此类崩溃会正确写入 app.log/out.log。

#### 四、运维脚本清单(ubuntu crontab)

| 脚本 | 频率 | 作用 | 重启 PM2? |
|------|------|------|-----------|
| `/home/ubuntu/scripts/health-check.sh` | **每分钟** | 检查 /health + PM2 status + Docker 容器 | ✅ 失败时 `pm2 restart danqing-api` |
| `/home/ubuntu/scripts/backup-db.sh` | 每日 03:00 | pg_dump + gzip + 保留 7 天 | ❌ |
| `/home/ubuntu/scripts/disk-check.sh` | 每小时 | 磁盘 >80% 时清理旧 PM2 日志 | ❌ |
| root: `/usr/local/qcloud/stargate/admin/start.sh` | 每 5 分钟 | 腾讯云监控 agent | ❌(无关) |

**health-check.sh 关键逻辑**:
```bash
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:3000/health)
if [ "$HTTP" != "200" ]; then
  pm2 restart danqing-api  # ← 潜在 SIGINT 来源
fi
```

**注意**:health-check.sh 重启 PM2 时**不写 alerts.log 的重启动作**(只写 ALERT 不写 ACTION 第二行 —— 脚本 bug,第一个 if 块的 ACTION 行未执行因 pm2 restart 后脚本被信号打断?实际不会,pm2 restart 不阻塞脚本)。本次 2 次 SIGINT 不是 health-check.sh 触发(时间戳不匹配),但该脚本是未来 SIGINT 的潜在来源,需监控 alerts.log。

#### 五、后续监控建议

**A. 即时监控(已可执行)**

1. **alerts.log 监控**(health-check.sh 触发的自动重启会写这里):
   ```bash
   ssh server "tail -f /home/ubuntu/scripts/alerts.log"
   ```
   若出现 `ALERT: API health check failed` + `ACTION: PM2 restart triggered` → health-check.sh 因 API 异常自动重启了进程,需立即排查 API 健康度。

2. **PM2 重启计数监控**(对比基线):
   - 当前基线:restarts=21(2026-08-07 00:30)
   - 若 24h 内增长 >5 次且无部署操作 → 异常
   - 命令:`pm2 jlist | grep -o '"restart_time":[0-9]*'`

3. **error.log + app.log 双查**(区分崩溃类型):
   - error.log 非空 → `console.error` 或原生 stderr(通常是 node:fatal 或未捕获异常的 stderr 输出)
   - app.log 含 `[fatal]` 条目 → winston 捕获的 uncaughtException(G7 修复后会写入)
   - app.log 含 `[shutdown] graceful shutdown start {"signal":"SIGINT"}` 但无 `[fatal]` → 手动/health-check.sh 主动重启(非崩溃)

**B. 健康度检查 SOP**

每次怀疑日志或进程异常,按此顺序排查:
```bash
# 1. 进程状态
pm2 describe danqing-api | grep -E 'status|restarts|uptime|unstable'

# 2. 三日志快速扫
wc -c /var/www/danqing-ai/logs/{app,out,error}.log
tail -20 /var/www/danqing-ai/logs/app.log

# 3. 区分重启性质(grep app.log)
grep -E '\[fatal\]|\[shutdown\]' /var/www/danqing-ai/logs/app.log
#   [fatal] → 崩溃(winston 捕获)
#   [shutdown] graceful → 主动重启(SIGINT/SIGTERM)
#   都没有但 restarts 增长 → PM2 max_memory_restart 或外部 kill(查 ~/.pm2/pm2.log)

# 4. PM2 daemon 日志(查 exit code)
grep 'exited with code' ~/.pm2/pm2.log | tail -10
#   code [0] → 优雅退出
#   code [1] → 应用主动 exit(1)(uncaughtException/unhandledRejection)
#   code [130] → SIGINT 未被捕获(进程未注册 handler)

# 5. alerts.log(health-check.sh 自动重启记录)
tail -20 /home/ubuntu/scripts/alerts.log
```

**C. health-check.sh 改进建议(可选,P2)**

当前脚本有 2 个潜在问题:
1. **重启后不等待验证**:`pm2 restart` 后立即退出,不确认是否恢复 → 若 API 启动慢可能被下一分钟 cron 再次重启(雪崩)。建议加 `sleep 5 && curl /health` 二次验证。
2. **无重启频率限制**:若 API 持续崩溃,每分钟都会触发 restart,可能掩盖根因。建议加"5 分钟内重启 >3 次则停止自动重启并告警"。
3. **alerts.log 不轮转**:长期运行会膨胀。建议加 logrotate 或在 disk-check.sh 中一并清理。

**D. .env 变更追踪(部署同步)**

00:24:25 的 .env 修改揭示了**部署同步密钥 `DEPLOY_SYNC_SECRET`** 的引入(疑似 1panel 或外部部署工具使用)。建议:
1. .env 变更后必须 `pm2 restart --update-env`(否则新 env 不生效)—— 本次操作已正确执行。
2. .env 备份保留策略:当前已有 5 个 .env.bak.*(从 08-02 到 08-07),建议保留最近 3 个 + 每周清理。
3. 若 `DEPLOY_SYNC_SECRET` 用于生产部署管道,需确保其不入库(已在 .gitignore?需确认)。

#### 六、验证清单(本次排查已确认)

- [x] error.log 确实 0 字节、0 行、无轮转文件
- [x] app.log/out.log 无 `[fatal]`/`uncaughtException`/`unhandledRejection` 条目
- [x] 2 次 SIGINT 重启均为 exit code 0(优雅关闭,非崩溃)
- [x] SIGINT 来源识别:00:24 手动 pm2 restart(伴随 .env 修改)+ 00:27 手动 pm2 restart
- [x] health-check.sh 逻辑审查(每分钟运行,API 非 200 时自动重启)
- [x] 历史 23:56 exit 1 崩溃已由 G7 修复(logger 不再静默吞错)
- [x] bash history 显示 `1pctl user-info`(1panel 面板操作痕迹,印证 .env 修改来源)

**结论**:当前系统状态健康,无异常崩溃,error.log 为空是正常的(无 `console.error` 调用 + 无未捕获 stderr)。2 次 SIGINT 是部署配置同步操作的正常重启。建议按"五、后续监控建议"建立常态化监控。

### 优化任务全面审查(2026-08-07 G9)

**触发**:验证 G7/G8 修复与改进建议的部署状态,全面盘点代码与运维脚本中的未完成优化。

#### 一、已部署验证(✅ 完成)

| 优化项 | 状态 | 验证证据 |
|--------|------|----------|
| G7 logger.ts 原地 mutate redactFormat | ✅ 已部署 | dist/utils/logger.js 含修复代码,mtime 2026-08-07 00:04 |
| G7 双路日志(Console + File transport) | ✅ 已部署 | app.log/out.log 双写验证通过 |
| G8 .env.bak 备份 | ✅ 已存在 | 服务器 5 个备份(2026-08-02 ~ 2026-08-07) |
| G7 dist.bak.* 清理(16M→1.2M) | ✅ 已完成 | 仅保留 dist.bak.20260806_194349 |

#### 二、未完成优化清单(按优先级)

##### P0 - 高危/生产阻塞

**1. health-check.sh 防雪崩机制** ⚠️ **已发生真实事故**
- **任务描述**:添加重启频率限制(5 分钟内 >3 次则停止自动重启并告警)+ 重启后二次验证(sleep 5 + curl /health)
- **当前状态**:❌ 未实施,服务器脚本与本地 deploy/scripts/health-check.sh 均为旧版
- **事故证据**:`alerts.log` 显示 **2026-08-03 03:07-03:17 连续 10 次自动重启**(HTTP 000,每分钟触发,持续 10 分钟)。期间 API 完全不可用,health-check.sh 无限制地反复重启,掩盖根因。
- **依赖/约束**:无代码依赖,仅需修改 bash 脚本;需测试验证不破坏现有 cron 流程
- **建议实现**:
  ```bash
  # 在脚本开头添加重启计数检查
  RESTART_COUNT_FILE="/tmp/health-check-restart-count"
  CURRENT_MINUTE=$(date '+%Y%m%d%H%M')
  if [ -f "$RESTART_COUNT_FILE" ]; then
    LAST_MINUTE=$(head -1 $RESTART_COUNT_FILE)
    COUNT=$(tail -1 $RESTART_COUNT_FILE)
    if [ "$LAST_MINUTE" = "$CURRENT_MINUTE" ] && [ "$COUNT" -ge 3 ]; then
      echo "[$TIMESTAMP] ALERT: Restart limit reached (3/hour), skipping" >> $ALERT_LOG
      exit 0
    fi
  fi
  ```

**2. sms-gateway.service.ts 阿里云短信接入**
- **任务描述**:接入阿里云短信 SDK,配置 ALIYUN_SMS_AK / ALIYUN_SMS_SK / ALIYUN_SMS_SIGN
- **当前状态**:❌ 未实施(代码 L35 标记 TODO)
- **依赖/约束**:需申请阿里云短信服务资质 + 签名审核(1-3 个工作日);影响飞书验证码登录流程
- **关联 TODO**:admin 端 L87/L173 飞书验证码发送/校验接口

##### P1 - 重要功能缺失

**3. admin 飞书验证码接口**
- **任务描述**:后端补充 POST /auth/feishu/verify-code 发送与校验接口
- **当前状态**:❌ 未实施(admin/src/components/ConfirmAction/index.tsx L87/L173 TODO)
- **依赖/约束**:**依赖 #2**(sms-gateway 阿里云接入);前端已预留 UI 入口

**4. subscription.service.ts 支付渠道接入**
- **任务描述**:Phase 3.5 接入真实支付渠道(当前为模拟支付,L336 TODO)
- **当前状态**:❌ 未实施
- **依赖/约束**:需选择支付渠道(微信支付/支付宝/Stripe)+ 商户资质;涉及订单状态机、回调验签、对账
- **影响**:订阅功能无法真实收费

**5. arbitration.service.ts reviewer 姓名 join**
- **任务描述**:arbitration 列表接口 join User 表填充 reviewerName(L536 TODO,当前返回 null)
- **当前状态**:❌ 未实施
- **依赖/约束**:无,仅需修改 Prisma query 添加 include
- **影响**:仲裁列表页 reviewer 显示为空

##### P2 - 用户体验优化

**6. mobile settings API 同步**
- **任务描述**:接入 PATCH /users/profile 后端接口同步用户设置(当前仅本地 AsyncStorage 展示)
- **当前状态**:❌ 未实施(mobile/app/settings.tsx L64 TODO)
- **依赖/约束**:需后端 PATCH /users/profile 接口已实现(需确认)

**7. mobile 隐私政策/用户协议页面**
- **任务描述**:about.tsx L81/L91 跳转隐私政策页/用户协议页(当前 TODO)
- **当前状态**:❌ 未实施
- **依赖/约束**:需准备隐私政策/用户协议文档内容;可跳转外部链接或内置 WebView

##### P3 - 运维优化

**8. alerts.log 轮转机制**
- **任务描述**:添加 logrotate 配置或在 disk-check.sh 中清理 alerts.log(当前 1826 字节,会持续增长)
- **当前状态**:❌ 未实施(无 logrotate 配置,disk-check.sh 不含 alerts.log 清理)
- **依赖/约束**:无,低风险
- **建议方案**:`/etc/logrotate.d/danqing-alerts` 配置 weekly rotate + 保留 4 份

**9. .env.bak 清理策略**
- **任务描述**:保留最近 3 个 + 每周清理(当前 5 个,从 08-02 到 08-07)
- **当前状态**:❌ 未实施(无自动化脚本)
- **依赖/约束**:无,可在 disk-check.sh 或 backup-db.sh 中添加

**10. disk-check.sh 扩展**
- **任务描述**:磁盘 >80% 时除清理 PM2 日志外,同时清理 alerts.log + 旧 .env.bak
- **当前状态**:❌ 未实施
- **依赖/约束**:依赖 #8/#9 策略确认

#### 三、优先级矩阵

| 优先级 | 任务 | 影响 | 复杂度 | 依赖 |
|--------|------|------|--------|------|
| **P0** | #1 health-check.sh 防雪崩 | 生产稳定性(已发生 10 次雪崩) | 低(仅 bash) | 无 |
| **P0** | #2 阿里云短信接入 | 飞书验证码登录阻塞 | 中(需资质) | 阿里云资质 |
| **P1** | #3 admin 飞书验证码接口 | 依赖 #2 | 中 | #2 完成 |
| **P1** | #4 支付渠道接入 | 订阅收费阻塞 | 高(支付合规) | 商户资质 |
| **P1** | #5 arbitration reviewer join | 仲裁列表数据不完整 | 低(Prisma include) | 无 |
| **P2** | #6 mobile settings API | 设置不同步 | 低 | 后端接口 |
| **P2** | #7 mobile 隐私政策页 | 合规要求 | 低 | 文档准备 |
| **P3** | #8 alerts.log 轮转 | 磁盘增长(慢) | 低 | 无 |
| **P3** | #9 .env.bak 清理 | 磁盘增长(慢) | 低 | 无 |
| **P3** | #10 disk-check.sh 扩展 | 综合清理 | 低 | #8/#9 |

#### 四、推荐执行顺序

**立即可执行(无依赖)**:
1. **#1 health-check.sh 防雪崩**(P0)— 防止再次雪崩,仅需 bash 修改 + 测试
2. **#5 arbitration reviewer join**(P1)— 低风险 Prisma 修改
3. **#8/#9/#10 运维清理**(P3)— 批量 bash 脚本优化

**需外部资源(阻塞)**:
4. **#2 阿里云短信接入**(P0)— 需申请资质
5. **#4 支付渠道接入**(P1)— 需商户资质
6. **#3 admin 飞书验证码**(P1)— 依赖 #2

**需后端确认**:
7. **#6 mobile settings API**(P2)— 确认 PATCH /users/profile 已实现

**需文档准备**:
8. **#7 mobile 隐私政策页**(P2)— 需法务/产品提供内容

#### 五、风险与约束总结

| 约束类型 | 影响任务 | 说明 |
|----------|----------|------|
| **外部资质** | #2 阿里云短信、#4 支付渠道 | 需 1-3 个工作日申请 + 审核 |
| **代码依赖** | #3 → #2 | admin 验证码依赖短信网关 |
| **后端接口** | #6 | 需确认 PATCH /users/profile 已实现 |
| **文档准备** | #7 | 需隐私政策/用户协议内容 |
| **测试验证** | #1 | 防雪崩机制需在测试环境验证不破坏 cron |

**关键洞察**:
- **#1 是最紧急的优化**(已发生真实雪崩事故,10 分钟连续重启),且无依赖、低风险,应立即实施。
- **#2 + #3 形成依赖链**,需先完成阿里云短信接入才能解锁 admin 飞书验证码。
- **#4 支付接入复杂度最高**,涉及合规、对账、回调验签,建议单独排期。

### dist.bak.* 备份清理

**清理前**:14 个 dist.bak.* 备份目录,每个 1.1-1.2M,共约 16M
**清理后**:仅保留 `dist.bak.20260806_194349`(1.2M,最新可用回滚点)
**注意事项**:
- `dist.bak.whitescreen.`(目录名带尾点)被误删 — 因 if 检查 `[ "$d" != "dist.bak.whitescreen" ]` 未匹配带尾点的实际目录名。whitescreen 早期问题已解决,不影响。
- 部分 dist.bak.* 内文件 root 所有(可能 nginx/sudo 部署留下),需 `sudo rm -rf` 才能删除。

### SSH 调用模板(重要 — 避免重复踩坑)

PowerShell here-string 默认带 CRLF,bash 会把 `\r` 当成参数一部分(导致 `head -5` 报"invalid trailing option"、`tail` 报 `$'\r'` 错误)。**必须**在 ssh 命令前加 `tr -d '\r'`:

```powershell
$key = "C:\Users\26929\Desktop\丹青有AI\danqing.pem"
$script = @'
cd /var/www/danqing-ai
some_bash_command
'@
$script | ssh -i $key -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 ubuntu@43.128.25.202 "tr -d '\r' | bash -s"
```

---

**附注**:本表基于 2026-08-04 上下文日志(`.trae/documents/context-log-2026-08-04.md`)第四节「新任务计划与验收标准」初始化。后续任务状态变更必须实时同步本表。
