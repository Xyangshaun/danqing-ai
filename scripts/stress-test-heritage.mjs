#!/usr/bin/env node
// ============================================================
// 丹青有AI - 非遗图片压力测试
//
// 测试99件非遗作品的198个图片URL(full+thumb)在高并发下的表现
// 逐级提升并发数: 10 → 20 → 50 → 100
// 记录: 成功率、平均响应时间、P95/P99、失败数
//
// 用法: node scripts/stress-test-heritage.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'artworks.json'), 'utf8'));
const HERITAGE = DATA.items.filter((i) => i.category === 'heritage');

const BASE = 'https://www.danqing.site';
const CONCURRENCY_LEVELS = [10, 20, 50, 100];
const ROUNDS_PER_LEVEL = 3; // 每个并发级别跑3轮取平均

// 构建URL列表
const urls = [];
for (const item of HERITAGE) {
  urls.push({ id: item.id, type: 'full', url: BASE + item.imageUrl });
  urls.push({ id: item.id, type: 'thumb', url: BASE + item.thumbUrl });
}
console.log(`\n=== 非遗图片压力测试 ===`);
console.log(`目标: ${HERITAGE.length} 件作品, ${urls.length} 个URL\n`);

// 用curl.exe发HEAD请求(不下载body),返回 {status, time_ms}
function check(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    execFile(
      'curl.exe',
      ['-sI', '-m', '15', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', url],
      { timeout: 20000, maxBuffer: 1024 },
      (err, stdout) => {
        const elapsed = Date.now() - start;
        if (err) return resolve({ status: 0, time_ms: elapsed, error: err.message.slice(0, 60) });
        const parts = stdout.trim().split(/\s+/);
        resolve({ status: parseInt(parts[0], 10), time_ms: elapsed, time_total: parseFloat(parts[1] || '0') * 1000 });
      }
    );
  });
}

// 并发池: 从urls中取N个同时发,全部完成后再取下一批
async function runConcurrent(urls, concurrency) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (idx < urls.length) {
      const cur = idx++;
      const r = await check(urls[cur].url);
      results.push({ ...urls[cur], ...r });
    }
  });
  await Promise.all(workers);
  return results;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runLevel(concurrency) {
  console.log(`\n--- 并发数: ${concurrency} ---`);
  const levelResults = [];

  for (let round = 1; round <= ROUNDS_PER_LEVEL; round++) {
    const start = Date.now();
    const results = await runConcurrent(urls, concurrency);
    const duration = Date.now() - start;

    const ok = results.filter((r) => r.status === 200).length;
    const fail = results.length - ok;
    const times = results.filter((r) => r.status === 200).map((r) => r.time_total || r.time_ms);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const p95 = percentile(times, 95);
    const p99 = percentile(times, 99);
    const rps = results.length / (duration / 1000);

    console.log(
      `  轮${round}: ${ok}/${results.length} OK, 失败 ${fail}, ` +
      `平均 ${avg.toFixed(0)}ms, P95 ${p95.toFixed(0)}ms, P99 ${p99.toFixed(0)}ms, ` +
      `${rps.toFixed(1)} req/s, 总耗时 ${duration}ms`
    );

    if (fail > 0) {
      const failed = results.filter((r) => r.status !== 200);
      failed.slice(0, 5).forEach((f) => console.log(`    FAIL: ${f.id} ${f.type} status=${f.status} ${f.error || ''}`));
    }

    levelResults.push({ ok, fail, avg, p95, p99, rps, duration, total: results.length });
  }

  // 汇总
  const avgOk = levelResults.reduce((a, b) => a + b.ok, 0) / ROUNDS_PER_LEVEL;
  const avgFail = levelResults.reduce((a, b) => a + b.fail, 0) / ROUNDS_PER_LEVEL;
  const avgRps = levelResults.reduce((a, b) => a + b.rps, 0) / ROUNDS_PER_LEVEL;
  const avgP95 = levelResults.reduce((a, b) => a + b.p95, 0) / ROUNDS_PER_LEVEL;
  console.log(
    `  汇总: 平均成功 ${avgOk.toFixed(0)}/${levelResults[0].total}, ` +
    `平均失败 ${avgFail.toFixed(1)}, ${avgRps.toFixed(1)} req/s, P95 ${avgP95.toFixed(0)}ms`
  );

  return { concurrency, avgOk, avgFail, avgRps, avgP95 };
}

async function main() {
  const summary = [];
  for (const c of CONCURRENCY_LEVELS) {
    const r = await runLevel(c);
    summary.push(r);
  }

  console.log(`\n========================`);
  console.log(`压力测试总结`);
  console.log(`========================`);
  console.log(`并发数 | 成功率 | 平均失败 | 吞吐量 | P95延迟`);
  console.log(`-------|--------|---------|--------|--------`);
  for (const s of summary) {
    const total = s.avgOk + s.avgFail;
    const successRate = ((s.avgOk / total) * 100).toFixed(1);
    console.log(
      `${String(s.concurrency).padStart(6)} | ${successRate.padStart(5)}% | ${s.avgFail.toFixed(0).padStart(7)} | ${s.avgRps.toFixed(1).padStart(6)} req/s | ${s.avgP95.toFixed(0).padStart(6)}ms`
    );
  }
  const totalFail = summary.reduce((a, b) => a + b.avgFail, 0);
  if (totalFail === 0) {
    console.log(`\n✅ 全部通过! 198个图片URL在所有并发级别下均无失败`);
  } else {
    console.log(`\n⚠️ 共有 ${totalFail.toFixed(0)} 次失败,需排查`);
  }
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
