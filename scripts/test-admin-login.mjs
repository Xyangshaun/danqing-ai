#!/usr/bin/env node
// ============================================================
// 丹青有AI - 管理员登录测试脚本
// 用途: 验证 admin@dq.edu 邮箱+密码登录是否成功
// 用法: node scripts/test-admin-login.mjs [密码]
// 默认密码: Yzy126285
// ============================================================

const API_BASE = process.env.API_BASE || 'https://www.danqing.site/api/v1';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@dq.edu';
const PASSWORD = process.argv[2] || process.env.ADMIN_PASSWORD || 'Yzy126285';
const DEVICE_ID = process.env.DEVICE_ID || 'test-admin-login-' + Date.now();

const CLIENT_CONTEXT = JSON.stringify({ device_id: DEVICE_ID, client: 'admin' });

async function tryLogin(endpoint, label) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`[test] 尝试 ${label}: ${url}`);

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

    if (res.ok && data.code === 0) {
      const user = data.data?.user;
      console.log(`[ok] ${label} 成功`);
      console.log(`     用户ID: ${user?.id || 'unknown'}`);
      console.log(`     邮箱: ${user?.email || 'unknown'}`);
      console.log(`     姓名: ${user?.name || 'unknown'}`);
      console.log(`     角色: ${user?.role || 'unknown'}`);
      return true;
    }

    console.error(`[fail] ${label} 失败`);
    console.error(`       HTTP ${res.status}, code=${data.code}, msg=${data.message || data.msg || '无消息'}`);
    return false;
  } catch (err) {
    console.error(`[fail] ${label} 请求异常: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`[test] 目标: ${API_BASE}`);
  console.log(`[test] 账号: ${EMAIL}`);
  console.log(`[test] 密码: ${'*'.repeat(PASSWORD.length)}`);
  console.log('');

  // 优先尝试院校管理员登录接口
  if (await tryLogin('/auth/login/admin', '院校管理员登录')) return;

  // 失败则回退通用账号登录
  console.log('');
  if (await tryLogin('/auth/login', '通用账号登录')) return;

  console.log('');
  console.error('[test] 两种登录方式均失败,请检查密码或账号状态');
  process.exit(1);
}

main();
