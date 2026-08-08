import { Redis } from 'ioredis';
import fs from 'node:fs';

// Read REDIS_URL from .env
const env = fs.readFileSync('./.env', 'utf8');
const m = env.match(/^REDIS_URL=(.+)$/m);
if (!m) {
  console.error('REDIS_URL not found in .env');
  process.exit(1);
}
const redisUrl = m[1].trim();
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });

const KEY = 'config:feature:generation';
const now = new Date().toISOString();
const flag = {
  featureId: 'generation',
  name: 'AI 图像生成',
  description: 'AI 图像生成功能(异步队列 + 教学闭环)',
  type: 'percentage',
  status: 'enabled',
  value: 100,
  defaultValue: 0,
  targetUserIds: [],
  targetTenantIds: [],
  createdById: 'deploy',
  updatedById: 'deploy',
  createdAt: now,
  updatedAt: now,
};

(async () => {
  try {
    const cur = await redis.get(KEY);
    console.log('current:', cur ?? '<none>');
    await redis.set(KEY, JSON.stringify(flag));
    const v = await redis.get(KEY);
    console.log('set ->', v);
  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
})();
