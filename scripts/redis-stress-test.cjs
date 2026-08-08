// ============================================================
// Redis 连接池压测脚本
//
// 目的:
//   模拟高并发场景,测试 Redis 连接池(ioredis 单连接)在压力下的表现,
//   验证 rate-limit 200ms 超时 + fail open 策略是否生效,
//   观察 EVALSHA 耗时分布与连接状态变化。
//
// 用法:
//   node scripts/redis-stress-test.cjs [并发数] [总请求数] [目标URL]
//   默认: 20 并发, 200 请求, http://localhost:3000/api/v1/users/profile
//
// 示例:
//   node scripts/redis-stress-test.cjs              # 默认 20 并发 200 请求
//   node scripts/redis-stress-test.cjs 50 500       # 50 并发 500 请求
//   node scripts/redis-stress-test.cjs 100 1000     # 极限测试
//
// 依赖: 零外部依赖,仅用 Node.js 原生 http 模块
// 对应文档: .trae/documents/redis-brpop-fix-2026-08-07.md §7 后续改进
// ============================================================

const http = require('http');

// ---------- 参数解析 ----------
const CONCURRENCY = parseInt(process.argv[2] || '20', 10);
const TOTAL_REQUESTS = parseInt(process.argv[3] || '200', 10);
const TARGET_URL = process.argv[4] || 'http://localhost:3000/api/v1/users/profile';
const METRICS_URL = 'http://localhost:3000/api/v1/metrics/redis';

const urlObj = new URL(TARGET_URL);

// ---------- 指标收集 ----------
const results = {
  latencies: [],         // 每个请求的耗时(ms)
  statusCodes: {},       // 状态码 → 计数
  errors: [],            // 错误信息(最多保留 10 条)
  startTime: 0,
  endTime: 0,
};

// ---------- HTTP 请求封装 ----------
function makeRequest() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        headers: { 'Connection': 'keep-alive' },
      },
      (res) => {
        // 消费 body(否则 socket 不会释放)
        res.resume();
        res.on('end', () => {
          const elapsedNs = process.hrtime.bigint() - start;
          const elapsedMs = Number(elapsedNs) / 1e6;
          resolve({ status: res.statusCode, ms: elapsedMs, error: null });
        });
      },
    );

    req.on('error', (err) => {
      const elapsedNs = process.hrtime.bigint() - start;
      const elapsedMs = Number(elapsedNs) / 1e6;
      resolve({ status: 0, ms: elapsedMs, error: err.message });
    });

    // 单请求超时(15s,避免 hang 住整个压测)
    req.setTimeout(15000, () => {
      req.destroy(new Error('request timeout'));
    });

    req.end();
  });
}

// ---------- 拉取 Redis metrics ----------
function fetchMetrics() {
  return new Promise((resolve) => {
    const u = new URL(METRICS_URL);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json.data || json);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => req.destroy());
    req.end();
  });
}

// ---------- 并发 worker ----------
async function worker(requestsPerWorker, workerId) {
  for (let i = 0; i < requestsPerWorker; i++) {
    const result = await makeRequest();

    results.latencies.push(result.ms);
    const code = result.status || 'ERR';
    results.statusCodes[code] = (results.statusCodes[code] || 0) + 1;

    if (result.error) {
      if (results.errors.length < 10) {
        results.errors.push({ worker: workerId, ms: result.ms, error: result.error });
      }
    }

    // 进度输出(每 10% 输出一次)
    const total = results.latencies.length;
    const milestone = Math.floor(TOTAL_REQUESTS / 10);
    if (milestone > 0 && total % milestone === 0) {
      const pct = Math.round((total / TOTAL_REQUESTS) * 100);
      process.stdout.write(`  进度: ${pct}% (${total}/${TOTAL_REQUESTS})\r`);
    }
  }
}

// ---------- 统计计算 ----------
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: sorted.length > 0 ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ---------- 格式化输出 ----------
function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n);
}

function printMetricsDiff(before, after, label) {
  console.log(`\n========== Redis Metrics ${label} ==========`);
  if (!before || !after) {
    console.log('  (metrics 不可用)');
    return;
  }

  const conn = after.connection;
  console.log('\n[连接状态]');
  console.log(`  status:          ${conn.status}`);
  console.log(`  totalConnects:   ${conn.totalConnects}`);
  console.log(`  totalErrors:     ${conn.totalErrors}`);
  console.log(`  totalReconnects: ${conn.totalReconnects}`);
  if (conn.lastErrorMessage) {
    console.log(`  lastError:       ${conn.lastErrorMessage} @ ${conn.lastErrorAt}`);
  }

  console.log('\n[命令耗时](压测期间新增)');
  const beforeCmds = before.commands || {};
  const afterCmds = after.commands || {};
  for (const [cmd, s] of Object.entries(afterCmds)) {
    const beforeS = beforeCmds[cmd] || { count: 0, totalMs: 0, maxMs: 0 };
    const deltaCount = s.count - beforeS.count;
    const deltaMs = s.totalMs - beforeS.totalMs;
    const avgMs = deltaCount > 0 ? deltaMs / deltaCount : 0;
    if (deltaCount > 0) {
      console.log(`  ${cmd.padEnd(12)} count=${String(deltaCount).padStart(6)}  avg=${fmt(avgMs)}ms  max=${fmt(s.maxMs)}ms`);
    }
  }

  console.log('\n[队列专项]');
  const bq = after.queue.brpop;
  const rq = after.queue.rpop;
  console.log(`  brpop: count=${bq.count}  totalMs=${fmt(bq.totalMs)}  maxMs=${fmt(bq.maxMs)}  empty=${bq.emptyCount}`);
  console.log(`  rpop:  count=${rq.count}  totalMs=${fmt(rq.totalMs)}  maxMs=${fmt(rq.maxMs)}  empty=${rq.emptyCount}`);

  console.log('\n[限流专项]');
  const rl = after.rateLimit;
  const brl = before.rateLimit || {};
  console.log(`  timeoutCount:    ${rl.timeoutCount}  (Δ${rl.timeoutCount - (brl.timeoutCount || 0)})`);
  console.log(`  failOpenCount:   ${rl.failOpenCount}  (Δ${rl.failOpenCount - (brl.failOpenCount || 0)})`);
  console.log(`  hitCount:        ${rl.hitCount}  (Δ${rl.hitCount - (brl.hitCount || 0)})`);
}

// ---------- 主流程 ----------
async function main() {
  console.log('============================================================');
  console.log('  Redis 连接池压测脚本');
  console.log('============================================================');
  console.log(`  目标:     ${TARGET_URL}`);
  console.log(`  并发数:   ${CONCURRENCY}`);
  console.log(`  总请求:   ${TOTAL_REQUESTS}`);
  console.log(`  开始时间: ${new Date().toISOString()}`);
  console.log('');

  // 1. 压测前拉取 metrics
  console.log('[1/4] 拉取压测前 Redis metrics...');
  const beforeMetrics = await fetchMetrics();
  console.log(beforeMetrics ? '  ok' : '  (不可用,继续)');

  // 2. 并发压测
  console.log(`\n[2/4] 启动 ${CONCURRENCY} 个并发 worker,发送 ${TOTAL_REQUESTS} 个请求...`);
  const requestsPerWorker = Math.floor(TOTAL_REQUESTS / CONCURRENCY);
  const remainder = TOTAL_REQUESTS - requestsPerWorker * CONCURRENCY;

  results.startTime = Date.now();

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const count = requestsPerWorker + (i < remainder ? 1 : 0);
    if (count > 0) workers.push(worker(count, i));
  }
  await Promise.all(workers);

  results.endTime = Date.now();
  process.stdout.write('  进度: 100% '.padEnd(40) + '\n');

  // 3. 统计输出
  const wallTimeMs = results.endTime - results.startTime;
  const wallTimeSec = wallTimeMs / 1000;
  const qps = TOTAL_REQUESTS / wallTimeSec;
  const s = stats(results.latencies);

  console.log(`\n[3/4] 压测结果`);
  console.log('  ----------------------------------------------------------');
  console.log(`  总请求:       ${TOTAL_REQUESTS}`);
  console.log(`  耗时:         ${fmt(wallTimeSec)}s`);
  console.log(`  QPS:          ${fmt(qps)}`);
  console.log(`  错误数:       ${results.errors.length}`);
  console.log('');
  console.log(`  延迟分布(ms):`);
  console.log(`    min:  ${fmt(s.min)}`);
  console.log(`    avg:  ${fmt(s.avg)}`);
  console.log(`    p50:  ${fmt(s.p50)}`);
  console.log(`    p90:  ${fmt(s.p90)}`);
  console.log(`    p95:  ${fmt(s.p95)}`);
  console.log(`    p99:  ${fmt(s.p99)}`);
  console.log(`    max:  ${fmt(s.max)}`);
  console.log('');
  console.log(`  状态码分布:`);
  for (const [code, count] of Object.entries(results.statusCodes).sort()) {
    const pct = ((count / TOTAL_REQUESTS) * 100).toFixed(1);
    console.log(`    ${code.padEnd(6)} ${String(count).padStart(6)}  (${pct}%)`);
  }

  if (results.errors.length > 0) {
    console.log('\n  错误样本(最多 10 条):');
    for (const e of results.errors) {
      console.log(`    [worker ${e.worker}] ${e.error} (${fmt(e.ms)}ms)`);
    }
  }

  // 4. 压测后 metrics 对比
  console.log(`\n[4/4] 拉取压测后 Redis metrics...`);
  // 等 500ms 让最后的 Redis 操作落定
  await new Promise((r) => setTimeout(r, 500));
  const afterMetrics = await fetchMetrics();
  printMetricsDiff(beforeMetrics, afterMetrics, '对比(压测前 → 压测后)');

  // 健康判定
  console.log('\n========== 健康判定 ==========');
  const rlDelta = afterMetrics
    ? afterMetrics.rateLimit.timeoutCount - (beforeMetrics?.rateLimit?.timeoutCount || 0)
    : 0;
  const errorRate = results.errors.length / TOTAL_REQUESTS;

  if (rlDelta > 0) {
    console.log(`  ⚠ rate-limit 超时 ${rlDelta} 次 — Redis 在高压下出现卡顿`);
  } else {
    console.log(`  ✓ rate-limit 无超时 — Redis 连接池在 ${CONCURRENCY} 并发下稳定`);
  }

  if (s.p99 > 500) {
    console.log(`  ⚠ P99 延迟 ${fmt(s.p99)}ms > 500ms — 响应时间偏高`);
  } else {
    console.log(`  ✓ P99 延迟 ${fmt(s.p99)}ms — 响应时间正常`);
  }

  if (errorRate > 0.01) {
    console.log(`  ⚠ 错误率 ${(errorRate * 100).toFixed(1)}% > 1% — 需排查`);
  } else {
    console.log(`  ✓ 错误率 ${(errorRate * 100).toFixed(1)}% — 正常`);
  }

  console.log('\n============================================================');
  console.log('  压测完成');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\n压测脚本异常:', err.message);
  process.exit(1);
});
