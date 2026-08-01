// ============================================================
// 丹青有AI - Prisma Seed 脚本(Phase 5)
// 注入 16 套内置评分预设(SEED_PRESETS)
//   - isBuiltIn=true, creatorId=null, tenantId=null(全局可见)
//   - 使用 upsert 按固定 id 幂等注入(可重复执行)
//   - 调用 validateSeedPresets() 预校验权重总和
//
// 配置:package.json "prisma": { "seed": "tsx prisma/seed.ts" }
// 执行:`npx prisma db seed`
// ============================================================

import { PrismaClient, type ArtType, type PresetStyle, type PresetStage } from '@prisma/client';
import { SEED_PRESETS, validateSeedPresets } from '../src/seed/presets-data.js';

const prisma = new PrismaClient();

/**
 * 将 SeedPreset 转换为 Prisma upsert 入参
 * 注意:dimensions 为 JSON 字段,直接传数组
 */
function toPresetCreateData(preset: (typeof SEED_PRESETS)[number]) {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    styleType: preset.styleType as PresetStyle,
    artType: preset.artType as ArtType,
    dimensions: preset.dimensions,
    applicableStage: preset.applicableStage as PresetStage,
    isBuiltIn: true,
    isPrivate: false,
    forkedFromId: null,
    creatorId: null,
    tenantId: null,
    enabled: true,
    sortOrder: preset.sortOrder,
  };
}

async function main(): Promise<void> {
  // 1. 预校验:权重总和=100,维度数≥4
  const validation = validateSeedPresets();
  if (!validation.valid) {
    console.error('[seed] SEED_PRESETS 校验失败:');
    for (const e of validation.errors) {
      console.error('  -', e);
    }
    process.exit(1);
  }
  console.log(`[seed] 校验通过,共 ${SEED_PRESETS.length} 套预设待注入`);

  // 2. 幂等 upsert 注入(按固定 id)
  let inserted = 0;
  let updated = 0;
  for (const preset of SEED_PRESETS) {
    const result = await prisma.evaluationPreset.upsert({
      where: { id: preset.id },
      update: {
        // 仅更新可变字段(保留 isBuiltIn/creatorId/tenantId 不变)
        name: preset.name,
        description: preset.description,
        styleType: preset.styleType as PresetStyle,
        artType: preset.artType as ArtType,
        dimensions: preset.dimensions,
        applicableStage: preset.applicableStage as PresetStage,
        sortOrder: preset.sortOrder,
        enabled: true,
      },
      create: toPresetCreateData(preset),
    });
    // 区分新增 vs 更新:createdAt === updatedAt 视为新增(简化判断)
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      inserted += 1;
    } else {
      updated += 1;
    }
  }

  console.log(`[seed] 注入完成:新增 ${inserted} 套,更新 ${updated} 套,总计 ${SEED_PRESETS.length} 套内置预设`);
}

/**
 * 注入 DEV_SKIP_AUTH 开发模式 fixture(幂等 upsert)
 * 对应 auth.ts:DEV_USER_ID='dev-user' / DEV_TENANT_ID='dev-tenant' / DEV_ROLE='teacher'
 * 背景:全新数据库执行 seed 后,DEV_SKIP_AUTH 注入的 dev-user 在 User 表不存在,
 *       导致 /users/profile、/subscriptions/current 等端点 401/404。
 * 仅在开发/测试环境需要;生产环境 seed 无影响(记录幂等,内容固定)。
 */
async function seedDevFixtures(): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. 开发测试租户(standard 计划,给足配额便于联调)
  await prisma.tenant.upsert({
    where: { id: 'dev-tenant' },
    update: {},
    create: {
      id: 'dev-tenant',
      name: '开发测试租户',
      type: 'individual',
      plan: 'standard',
      status: 'active',
      maxSeats: 5,
    },
  });

  // 2. 开发测试用户(与 auth.ts DEV_USER_ID/DEV_ROLE 一致)
  await prisma.user.upsert({
    where: { id: 'dev-user' },
    update: {},
    create: {
      id: 'dev-user',
      tenantId: 'dev-tenant',
      authType: 'feishu',
      feishuOpenId: 'dev-open-id',
      name: '开发测试用户',
      avatar: '',
      role: 'teacher',
      status: 'active',
    },
  });

  // 3. 租户成员关系(与 User.role 一致)
  await prisma.tenantMember.upsert({
    where: { userId_tenantId: { userId: 'dev-user', tenantId: 'dev-tenant' } },
    update: {},
    create: { userId: 'dev-user', tenantId: 'dev-tenant', role: 'teacher' },
  });

  // 4. 有效订阅(standard,保障 /subscriptions/current 与配额校验可用)
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId: 'dev-tenant', status: 'active' },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        tenantId: 'dev-tenant',
        plan: 'standard',
        status: 'active',
        periodStart: now,
        periodEnd,
        seats: 5,
      },
    });
  }

  console.log('[seed] dev fixtures 注入完成(dev-tenant / dev-user / teacher / standard 订阅)');
}

main()
  .then(async () => {
    await seedDevFixtures();
    console.log('[seed] done');
  })
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
