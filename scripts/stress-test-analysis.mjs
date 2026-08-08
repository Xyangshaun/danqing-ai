// 方案A 两阶段响应压测脚本
// 用法(从项目根目录运行):
//   node scripts/stress-test-analysis.mjs probe        # 单请求探测(验证链路)
//   node scripts/stress-test-analysis.mjs phase1 20    # 阶段1 并发上传,验证 3s SLA
//   node scripts/stress-test-analysis.mjs phase2 2     # 阶段2 并发 ai-enhance(真实 GLM API)
// 环境变量:
//   BACKEND_URL  后端 analyses 基址(默认 http://localhost:3002/api/v1/analyses)
// 注意:DEV_SKIP_AUTH=true 时无需 Authorization 头;阶段2 会真实调用 GLM-4v API(~11s/次)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BACKEND_URL || 'http://localhost:3002/api/v1/analyses';
// 脚本位于 scripts/,种子图片位于 server/public/uploads/seed/
const IMG_PATH = join(__dirname, '..', 'server', 'public', 'uploads', 'seed', 'oil-still.png');
const SLA_MS = 3000;

function pct(arr, p) {
  const idx = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}

async function uploadOnce(imageBuf) {
  const form = new FormData();
  form.append('artType', 'painting');
  form.append('image', new Blob([imageBuf], { type: 'image/png' }), 'oil-still.png');
  const t0 = performance.now();
  const res = await fetch(BASE + '/upload', { method: 'POST', body: form });
  const dt = performance.now() - t0;
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, dt, body };
}

async function aiEnhance(id) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/${id}/ai-enhance`, { method: 'POST' });
  const dt = performance.now() - t0;
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, dt, body };
}

function report(label, results) {
  const dts = results.map(r => r.dt).sort((a, b) => a - b);
  const ok = results.filter(r => r.status === 200).length;
  const p50 = pct(dts, 50), p95 = pct(dts, 95), p99 = pct(dts, 99), mx = dts[dts.length - 1];
  const failStatuses = results.filter(r => r.status !== 200).map(r => r.status);
  console.log(`\n[${label}] 成功 ${ok}/${results.length}`);
  if (failStatuses.length) console.log(`  失败状态码: ${[...new Set(failStatuses)].join(',')}`);
  console.log(`  耗时 p50=${p50.toFixed(0)}ms  p95=${p95.toFixed(0)}ms  p99=${p99.toFixed(0)}ms  max=${mx.toFixed(0)}ms`);
  if (label.startsWith('phase1')) {
    console.log(`  3s SLA: ${p95 < SLA_MS ? '✓ 达标(p95<3000ms)' : '✗ 未达标(p95>=3000ms)'}`);
  }
  return { ok, p50, p95, p99, mx };
}

async function main() {
  const mode = process.argv[2] || 'probe';
  const concurrency = parseInt(process.argv[3] || '1', 10);
  const imageBuf = await readFile(IMG_PATH);
  console.log(`后端: ${BASE}`);
  console.log(`图片: ${IMG_PATH} (${imageBuf.length} bytes)`);

  if (mode === 'probe') {
    const r = await uploadOnce(imageBuf);
    console.log(`status=${r.status} dt=${r.dt.toFixed(0)}ms`);
    console.log('body:', JSON.stringify(r.body).slice(0, 400));
    if (r.status === 200 && r.body?.data?.id) {
      console.log('analysisId=', r.body.data.id, 'aiEnhanced=', r.body.data.result?.aiEnhanced);
    }
    return;
  }

  if (mode === 'phase1') {
    console.log(`阶段1 并发上传 (concurrency=${concurrency})`);
    const promises = Array.from({ length: concurrency }, () => uploadOnce(imageBuf));
    const results = await Promise.all(promises);
    report('phase1', results);
    const okRes = results.find(r => r.status === 200);
    if (okRes) console.log('sample analysisId=', okRes.body?.data?.id);
    return;
  }

  if (mode === 'phase2') {
    const n = Math.max(1, concurrency);
    console.log(`阶段2 ai-enhance 并发 ${n}(真实 GLM API,预期 ~11s/次)`);
    // 先上传 n 个,拿到不同 id
    const ids = [];
    for (let i = 0; i < n; i++) {
      const up = await uploadOnce(imageBuf);
      if (up.status === 200 && up.body?.data?.id) ids.push(up.body.data.id);
      else console.log(`  上传 #${i} 失败 status=${up.status}`);
    }
    if (!ids.length) { console.log('无可用 id,退出'); return; }
    console.log(`已准备 ${ids.length} 个 analysisId,开始并发 ai-enhance...`);
    const promises = ids.map(id => aiEnhance(id));
    const results = await Promise.all(promises);
    report('phase2', results);
    results.forEach((r, i) => {
      const aiEnhanced = r.body?.data?.aiEnhanced;
      const aiDurationMs = r.body?.data?.aiDurationMs;
      console.log(`  #${i}: status=${r.status} aiEnhanced=${aiEnhanced} aiDurationMs=${aiDurationMs} dt=${r.dt.toFixed(0)}ms`);
      if (r.status !== 200) console.log(`      body: ${JSON.stringify(r.body).slice(0, 400)}`);
    });
    return;
  }

  console.log('未知模式:', mode, '(可用: probe | phase1 N | phase2 N)');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
