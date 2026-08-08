// ============================================================
// 生产环境烟雾测试:验证 5 用户登录 + 核心 API
// 目标:https://www.danqing.site
// ============================================================

const PROD_BASE = 'https://www.danqing.site/api/v1';
const DEVICE_ID = 'prod-smoke-test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USERS = {
  student1: { email: 'test1@dq.edu', password: 'Dq@Test2026', label: '学生1' },
  student2: { email: 'test2@dq.edu', password: 'Dq@Test2026', label: '学生2' },
  teacher: { email: 'teacher@dq.edu', password: 'Dq@Teacher2026', label: '教师' },
  admin: { email: 'admin@dq.edu', password: 'Dq@Admin2026', label: '管理员' },
  enterprise: { email: 'enterprise@dq.edu', password: 'Dq@Enterprise2026', label: '企业学校' },
};

let pass = 0;
let fail = 0;

function log(ok, step, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass += 1;
  else fail += 1;
  console.log(`[${tag}] ${step}${detail ? ' — ' + detail : ''}`);
}

async function api(method, url, { token, body, headers = {} } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function login(key) {
  const { email, password } = USERS[key];
  return api('POST', PROD_BASE + '/auth/login', {
    body: { email, password },
    headers: { 'X-Device-Id': DEVICE_ID },
  });
}

async function main() {
  console.log('=== 生产环境烟雾测试 ===');
  console.log(`目标: ${PROD_BASE}\n`);

  // 0. 健康检查 (通过 API 路径)
  try {
    const { status, json } = await api('GET', PROD_BASE + '/health');
    log(status === 200 && json?.data?.status === 'up', '0. 健康检查', `HTTP ${status} status=${json?.data?.status}`);
  } catch (e) {
    log(false, '0. 健康检查', e.message);
  }

  await sleep(2000);

  // 1. 五用户登录 (每次间隔 4s 避免限流)
  const sessions = {};
  for (const key of ['student1', 'student2', 'teacher', 'admin', 'enterprise']) {
    try {
      const { status, json } = await login(key);
      if (status === 200 && json?.code === 0) {
        sessions[key] = {
          token: json.data.accessToken,
          userId: json.data.user?.id,
          role: json.data.user?.role,
          tenantId: json.data.tenant?.id,
        };
        log(true, `1.${key} ${USERS[key].label}登录`, `role=${sessions[key].role} tenant=${sessions[key].tenantId}`);
      } else {
        log(false, `1.${key} ${USERS[key].label}登录`, `HTTP ${status} code=${json?.code} msg=${json?.message}`);
      }
    } catch (e) {
      log(false, `1.${key} ${USERS[key].label}登录`, e.message);
    }
    await sleep(4000); // 避免登录限流
  }

  // 2. 通知 API (每个登录用户,间隔 1s)
  for (const key of Object.keys(sessions)) {
    try {
      const { status, json } = await api('GET', PROD_BASE + '/notifications?limit=5', { token: sessions[key].token });
      log(status === 200 && json?.code === 0, `2.${key} 通知列表`, `items=${json?.data?.items?.length ?? 0}`);
    } catch (e) {
      log(false, `2.${key} 通知列表`, e.message);
    }
    await sleep(1000);
  }

  // 3. 管理员列出用户
  if (sessions.admin) {
    await sleep(2000);
    try {
      const { status, json } = await api('GET', 'https://www.danqing.site/api/admin/users?page=1&pageSize=50', { token: sessions.admin.token });
      log(status === 200 && json?.code === 0, '3. 管理员列出用户', `users=${json?.data?.items?.length ?? 0}`);
    } catch (e) {
      log(false, '3. 管理员列出用户', e.message);
    }
  }

  // 4. 企业学校列出用户(租户隔离)
  if (sessions.enterprise) {
    await sleep(2000);
    try {
      const { status, json } = await api('GET', 'https://www.danqing.site/api/admin/users?page=1&pageSize=50', { token: sessions.enterprise.token });
      log(status === 200 && json?.code === 0, '4. 企业学校列出用户', `users=${json?.data?.items?.length ?? 0} (租户隔离)`);
    } catch (e) {
      log(false, '4. 企业学校列出用户', e.message);
    }
  }

  // 5. 教师列出争议
  if (sessions.teacher) {
    await sleep(2000);
    try {
      const { status, json } = await api('GET', PROD_BASE + '/disputes?page=1&pageSize=20', { token: sessions.teacher.token });
      log(status === 200 && json?.code === 0, '5. 教师列出争议', `disputes=${json?.data?.items?.length ?? 0}`);
    } catch (e) {
      log(false, '5. 教师列出争议', e.message);
    }
  }

  // 汇总
  console.log(`\n=== 烟雾测试结果: PASS ${pass} / FAIL ${fail} / 总计 ${pass + fail} ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(2);
});
