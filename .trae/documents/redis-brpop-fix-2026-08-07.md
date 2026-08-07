# Redis BRPOP 永久阻塞 & 限流超时容错修复

> **日期**:2026-08-07
> **影响范围**:登录、页面加载、所有经过限流中间件的 API
> **严重级别**:P0(全站 API 响应延迟 3-5 秒)
> **状态**:已修复

---

## 1. 问题现象

- 用户反馈"登录和体验产品加载有点慢"
- `/api/v1/users/profile` 等接口响应时间 3-5 秒
- 服务器日志显示 rate-limit 中间件的 Redis EVALSHA 调用持续超时
- 独立测试 Redis 连接正常(PING 19ms、EVALSHA 6ms),排除 Redis 服务端问题

## 2. 根因分析

### 2.1 直接原因:BRPOP key 0 永久阻塞

`generation.service.ts` 的 `processQueueOnce()` 调用 `dequeue(0)`,
而 `generation-queue.service.ts` 的 `dequeue()` 将 `0` 直接传给 `redis().brpop(QUEUE_KEY, 0)`。

**Redis 语义陷阱**:`BRPOP key 0` 中的 `0` 表示**永久阻塞**,不是"不阻塞"。
代码注释误写为"0 表示不阻塞",实际行为完全相反。

### 2.2 连接阻塞传导链

```
Generation Worker 启动(每 1s tick)
  └─ processQueueOnce()
       └─ dequeue(0)
            └─ redis().brpop(QUEUE_KEY, 0)   ← 永久阻塞,占用唯一 TCP 连接
                 │
                 ▼
ioredis 单连接被 BRPOP 占用,所有后续命令排队:
  └─ rate-limit: EVALSHA          ← 排队等待(表现为超时)
  └─ auth: EXISTS(黑名单校验)     ← 排队等待
  └─ session: SET/GET             ← 排队等待
       │
       ▼
ioredis maxRetriesPerRequest: 3 × 默认 retryStrategy(200ms/400ms/600ms)
  └─ 单请求累积延迟 1.2s × 3 ≈ 3.6s,加上其他等待 ≈ 5s
```

### 2.3 为什么独立测试 Redis 正常

独立 Node 脚本使用**新建的 Redis 连接**,不与服务器共享连接池,
因此 BRPOP 阻塞不影响独立测试。这说明问题在**服务器进程内的连接被占用**,
而非 Redis 服务端故障。

## 3. 修复内容

### 3.1 generation-queue.service.ts — BRPOP → RPOP(核心修复)

**文件**:`server/src/services/generation-queue.service.ts`
**方法**:`dequeue(timeoutSeconds)`

**修复前**:
```typescript
async dequeue(timeoutSeconds: number = 5): Promise<GenerationJob | null> {
  const result = await redis().brpop(QUEUE_KEY, timeoutSeconds);
  // ...
}
```

**修复后**:
```typescript
async dequeue(timeoutSeconds: number = 5): Promise<GenerationJob | null> {
  let serialized: string | null = null;

  if (timeoutSeconds === 0) {
    // 非阻塞:RPOP 立即返回,不占用连接
    serialized = await redis().rpop(QUEUE_KEY);
  } else {
    // 阻塞:BRPOP 带超时(仅在专用 Worker 场景使用)
    const result = await redis().brpop(QUEUE_KEY, timeoutSeconds);
    if (!result) return null;
    serialized = result[1];
  }
  // ...
}
```

**语义对照**:

| 调用方式 | 修复前(Redis 实际行为) | 修复后(符合注释语义) |
|----------|------------------------|----------------------|
| `dequeue(0)` | `BRPOP key 0` = 永久阻塞 | `RPOP key` = 立即返回 |
| `dequeue(5)` | `BRPOP key 5` = 阻塞 5 秒 | `BRPOP key 5` = 阻塞 5 秒(不变) |

### 3.2 rate-limit.ts — Redis 操作硬超时 + fail open(防护加固)

**文件**:`server/src/middlewares/rate-limit.ts`
**方法**:`checkSlidingWindowRateLimit(key)`

**修复前**:
- 无超时保护,EVALSHA 可被 ioredis 重试机制拖到 3.6 秒
- Redis 不可达时返回 503(Deny by default),单点故障拖垮所有 API
- 含诊断用 PING 探活(每请求多一次 Redis 往返)

**修复后**:
```typescript
const RATE_LIMIT_REDIS_TIMEOUT_MS = 200;

export async function checkSlidingWindowRateLimit(key: string): Promise<number> {
  const exec = async (): Promise<number> => {
    try {
      const result = await redis().evalsha(getScriptSha(), 1, key, ...args);
      return Number(result);
    } catch (err) {
      if (!isNoScriptError(err)) throw err;
      const result = await redis().eval(RATE_LIMIT_SCRIPT, 1, key, ...args);
      return Number(result);
    }
  };

  // 硬超时保护:超过 200ms 返回 -1 触发 fail open
  const timeout = new Promise<number>((resolve) => {
    setTimeout(() => resolve(-1), RATE_LIMIT_REDIS_TIMEOUT_MS);
  });

  return Promise.race([exec(), timeout]);
}
```

中间件层处理:
```typescript
const count = await checkSlidingWindowRateLimit(key);
if (count === -1) {
  // Redis 超时:fail open,放行请求
  logger.warn({ scope, ip }, '[rate-limit] redis timeout, fail open');
  return next();
}
// ... 正常限流判断
```

**容错策略变更**:

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| Redis 超时(>200ms) | 无限等待直至 ioredis 重试耗尽 | 200ms 后 fail open 放行 |
| Redis 不可达 | 返回 503 拒绝请求 | fail open 放行 + 告警 |
| 正常请求 | 额外 PING 探活(多一次 RTT) | 直接 EVALSHA(无额外开销) |

> **设计决策**:限流层选择 fail open(可用性优先)而非 fail closed(安全性优先)。
> 理由:限流是防御性机制,短时失效不会导致数据损坏;而 fail closed 会让 Redis
> 抖动直接拖垮全站 API,代价远超限流失效的风险。生产环境应配合监控告警及时发现。

## 4. 验证结果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| `/users/profile` 首次请求 | ~4001ms | 202ms |
| `/users/profile` 后续请求 | ~4000ms | 4-6ms |
| rate-limit Redis 超时告警 | 每请求触发 | 无 |
| TypeScript 编译 | — | 零错误 |

## 5. 涉及文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `server/src/services/generation-queue.service.ts` | 核心修复 | `dequeue(0)` 改用 RPOP 非阻塞 |
| `server/src/middlewares/rate-limit.ts` | 防护加固 | 200ms 硬超时 + fail open + 移除诊断 PING |

## 6. 经验教训

### 6.1 Redis 阻塞命令与单连接模型

> ioredis 默认使用单 TCP 连接复用所有命令。任何阻塞命令(BRPOP/BLPOP/SUBSCRIBE)
> 会锁死连接,导致所有后续命令排队等待。使用阻塞命令前必须确认:
> 1. 是否有非阻塞替代方案(RPOP/LPOP/SUBSCRIBE 改轮询)
> 2. 阻塞超时是否为有限值(严禁 `timeout=0` 在共享连接上使用)
> 3. 是否需要专用连接(`new Redis()` 独立实例)

### 6.2 timeout=0 的语义陷阱

> 在 Redis 阻塞命令中,`timeout 0` = **永久阻塞**,而非"不阻塞"。
> 这与许多 API 设计中 `0 = 禁用超时 = 立即返回` 的惯例相反。
> 代码注释必须明确标注此语义差异,避免后续维护者踩坑。

### 6.3 限流层的容错策略

> 限流是防御性机制,其失效的代价(短时放过少量请求)远低于其阻塞的代价
> (全站 API 不可用)。限流中间件应始终采用 fail open 策略,并配合:
> - 操作超时(建议 100-200ms)
> - 异常告警(超时/不可达时记录 warn 日志)
> - 监控大盘(限流超时率指标)

### 6.4 排查方法论

> 当 Redis 命令在应用内卡顿但独立测试正常时,优先排查:
> 1. 是否有后台 Worker 使用阻塞命令占用共享连接
> 2. ioredis `maxRetriesPerRequest` 配置是否导致重试累积
> 3. 是否存在 SUBSCRIBE/BRPOP 等独占连接的命令
> 4. 连接池是否被长事务/慢查询耗尽

## 7. 后续改进建议

- [ ] 为 `analysis-queue.service.ts` 的 `dequeue()` 应用相同的 RPOP 修复(预防性)
- [ ] 考虑为 Worker 队列操作使用独立 Redis 连接,与 HTTP 请求链路隔离
- [ ] 在监控大盘增加 `rate_limit_redis_timeout_total` 指标
- [ ] 清理 `auth.service.ts` refresh 方法中的临时性能埋点日志(已定位问题)
- [ ] 全局搜索 `brpop|blpop` 确认无其他 `timeout=0` 调用

---

**相关文档**:
- [认证设计](./auth-design.md) §3.3 Rate Limiting
- [技术架构](./tech_arch.md)
- [部署运维手册](../deploy-runbook-danqing.md)
