#!/usr/bin/env node
// ============================================================
// 丹青有AI - 管理员登录稳定性测试脚本
// 用途: 用新密码连续多次登录,验证服务稳定性
// 用法: node scripts/test-admin-login-stable.mjs [密码] [次数]
// 默认密码: Yzy126285, 默认次数: 5
// ============================================================

const API_BASE = process.env.API_BASE || 'https://www.danqing.site/api/v1';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@dq.edu';
const PASSWORD = process.argv[2] || process.env.ADMIN_PASSWORD || 'Yzy126285';
const ROUNDS = Math.max(1, parseInt(process.argv[3] || process.env.ROUNDS || '5', 10));
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000', 10);

const CLIENT_CONTEXT = JSON.stringify({
  device_id: `stable-test-${Date.now()}`,
  client: 'admin',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginOnce(round) {
  const url = `${API_BASE}/auth/login/admin`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Context': CLIENT_CONTEXT,
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    const data = await res.json().catch(() => ({}));
    const elapsed = Date.now() - start;

    if (res.ok && data.code === 0) {
      const user = data.data?.user;
      console.log(`[round ${round}/${ROUNDS}] ok  ${elapsed}ms  ${user?.name || user?.email}`);
      return { ok: true, elapsed };
    }

    console.error(`[round ${round}/${ROUNDS}] fail ${elapsed}ms  code=${data.code} msg=${data.message || data.msg}`);
    return { ok: false, elapsed };
  } catch (err) {
    console.error(`[round ${round}/${ROUNDS}] error ${err.message}`);
    return { ok: false, elapsed: Date.now() - start };
  }
}

async function main() {
  console.log(`[stable-test] 目标: ${API_BASE}`);
  console.log(`[stable-test] 账号: ${EMAIL}`);
  console.log(`[stable-test] 密码: ${'*'.repeat(PASSWORD.length)}`);
  console.log(`[stable-test] 轮次: ${ROUNDS}, 间隔: ${DELAY_MS}ms`);
  console.log('');

  const results = [];
  for (let i = 1; i <= ROUNDS; i++) {
    results.push(await loginOnce(i));
    if (i < ROUNDS) await sleep(DELAY_MS);
  }

  const success = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const latencies = success.map((r) => r.elapsed);
  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0) : 'N/A';
  const maxLatency = latencies.length ? Math.max(...latencies) : 'N/A';
  const minLatency = latencies.length ? Math.min(...latencies) : 'N/A';

  console.log('');
  console.log('=== 测试结果 ===');
  console.log(`总次数: ${ROUNDS}`);
  console.log(`成功: ${success.length}`);
  console.log(`失败: ${failed.length}`);
  console.log(`成功率: ${((success.length / ROUNDS) * 100).toFixed(1)}%`);
  console.log(`平均延迟: ${avgLatency}ms`);
  console.log(`最小延迟: ${minLatency}ms`);
  console.log(`最大延迟: ${maxLatency}ms`);

  if (failed.length > 0) {
    console.error('[stable-test] 存在失败请求,登录功能不稳定');
    process.exit(1);
  }

  console.log('[stable-test] 全部通过,登录功能稳定');
}

main().catch((err) => {
  console.error('[stable-test] 异常:', err);
  process.exit(1);
});
