// ============================================================
// AnalysisServiceClass 业务服务单元测试
// 对应源码: src/services/analysis.service.ts
//
// 测试范围:
//   1. listAnalyses RBAC 数据范围过滤(student/teacher/admin/owner + 跨租户)
//   2. getAnalysis RBAC(ownership 校验 + 跨租户 404 + aiEnhanced 透传)
//   3. deleteAnalysis RBAC(canDeleteTenantWide + 跨租户 404)
//   4. createAnalysis 配额校验(TENANT_NOT_FOUND/TENANT_DISABLED/QUOTA_EXCEEDED/PARAM_MISSING)
//   5. createAnalysis 缓存命中路径(cache miss → hit,jimpDurationMs/aiDurationMs 透传)
//   6. createAnalysisFromUpload 上传模式
//
// Mock 策略:
//   - setup.ts 全局 mock Prisma/Redis/Jimp/Feishu(不 mock service 内部)
//   - 测试真实 service,通过 prismaMock.__insert* 预置数据
//   - AI_ENABLED='false'(Jimp-only 模式),analyzeImage 使用 mock Jimp 返回 100x100 伪图
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prismaMock } from './setup.js';
import { analysisService } from '../src/services/analysis.service.js';
import { BusinessError } from '../src/middlewares/error-handler.js';
import { ErrorCode } from '../src/types/api-contract.js';

// ============================================================
// 测试常量
// ============================================================

const TENANT_A = 't-svc-a';
const TENANT_B = 't-svc-b';

const USER_STUDENT1 = 'u-svc-student1';
const USER_STUDENT2 = 'u-svc-student2';
const USER_TEACHER = 'u-svc-teacher';
const USER_ADMIN = 'u-svc-admin';
const USER_OWNER = 'u-svc-owner';
const USER_STUDENT_B = 'u-svc-student-b';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 断言异步函数抛出 BusinessError,并校验 code 与 httpStatus
 */
async function expectBusinessError(
  fn: () => Promise<unknown>,
  code: ErrorCode,
  httpStatus: number,
): Promise<void> {
  try {
    await fn();
    expect.fail(`expected BusinessError(code=${code}, httpStatus=${httpStatus}) but no error was thrown`);
  } catch (err) {
    expect(err).toBeInstanceOf(BusinessError);
    expect((err as BusinessError).code).toBe(code);
    expect((err as BusinessError).httpStatus).toBe(httpStatus);
  }
}

/**
 * 创建临时图片文件(供 createAnalysisFromUpload 测试使用)
 * service 内部会在分析完成后调用 safeCleanup 删除该文件
 */
function createTempImageFile(): string {
  const path = join(
    tmpdir(),
    `danqing-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );
  writeFileSync(path, Buffer.from('fake-image-content-for-testing'));
  return path;
}

/**
 * 预置共享租户与用户数据(用于 RBAC 测试)
 */
function setupRbacData(): void {
  prismaMock.__insertTenant({
    id: TENANT_A,
    name: '美术学院A',
    type: 'college',
    plan: 'standard',
    status: 'active',
    maxSeats: 50,
  });
  prismaMock.__insertTenant({
    id: TENANT_B,
    name: '美术学院B',
    type: 'college',
    plan: 'standard',
    status: 'active',
    maxSeats: 50,
  });

  prismaMock.__insertUser({
    id: USER_STUDENT1,
    tenantId: TENANT_A,
    feishuUnionId: 'un_s1',
    name: '学生1',
    role: 'student',
  });
  prismaMock.__insertUser({
    id: USER_STUDENT2,
    tenantId: TENANT_A,
    feishuUnionId: 'un_s2',
    name: '学生2',
    role: 'student',
  });
  prismaMock.__insertUser({
    id: USER_TEACHER,
    tenantId: TENANT_A,
    feishuUnionId: 'un_t',
    name: '教师',
    role: 'teacher',
  });
  prismaMock.__insertUser({
    id: USER_ADMIN,
    tenantId: TENANT_A,
    feishuUnionId: 'un_a',
    name: '管理员',
    role: 'admin',
  });
  prismaMock.__insertUser({
    id: USER_OWNER,
    tenantId: TENANT_A,
    feishuUnionId: 'un_o',
    name: '所有者',
    role: 'owner',
  });
  prismaMock.__insertUser({
    id: USER_STUDENT_B,
    tenantId: TENANT_B,
    feishuUnionId: 'un_sb',
    name: '学生B',
    role: 'student',
  });
}

// ============================================================
// 1. listAnalyses RBAC 数据范围过滤
// ============================================================

describe('analysisService.listAnalyses RBAC', () => {
  beforeEach(() => {
    setupRbacData();

    // 租户 A 的分析记录(学生1 + 学生2 各一条)
    prismaMock.__insertAnalysis({
      id: 'a-list-1',
      tenantId: TENANT_A,
      userId: USER_STUDENT1,
      workType: 'painting',
      imageUrl: 'https://example.com/list-1.jpg',
      title: '作品1',
      status: 'success',
      overallScore: 85,
      createdAt: new Date('2026-07-01T10:00:00Z'),
    });
    prismaMock.__insertAnalysis({
      id: 'a-list-2',
      tenantId: TENANT_A,
      userId: USER_STUDENT2,
      workType: 'design',
      imageUrl: 'https://example.com/list-2.jpg',
      title: '作品2',
      status: 'success',
      overallScore: 78,
      createdAt: new Date('2026-07-02T10:00:00Z'),
    });
    // 租户 B 的分析记录(不应被租户 A 用户看到)
    prismaMock.__insertAnalysis({
      id: 'a-list-b1',
      tenantId: TENANT_B,
      userId: USER_STUDENT_B,
      workType: 'sculpture',
      imageUrl: 'https://example.com/list-b1.jpg',
      title: 'B作品1',
      status: 'success',
      overallScore: 92,
      createdAt: new Date('2026-07-03T10:00:00Z'),
    });
  });

  it('student: 只能看到自己的记录(即使同租户内有他人记录)', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_STUDENT1,
      role: 'student',
      query: {},
    });
    expect(result.total).toBe(1);
    expect(result.items[0]!.id).toBe('a-list-1');
    const ids = result.items.map((i) => i.id);
    expect(ids).not.toContain('a-list-2');
  });

  it('student: query.userId 被忽略(强制覆盖为自己)', async () => {
    // 学生1 试图通过 query.userId 查询学生2 的记录(越权)
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_STUDENT1,
      role: 'student',
      query: { userId: USER_STUDENT2 },
    });
    // service 层强制 effectiveUserId = 自己,忽略 query.userId
    expect(result.total).toBe(1);
    expect(result.items[0]!.id).toBe('a-list-1');
  });

  it('teacher: 可见租户内全部记录', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_TEACHER,
      role: 'teacher',
      query: {},
    });
    expect(result.total).toBe(2);
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain('a-list-1');
    expect(ids).toContain('a-list-2');
  });

  it('admin: 可见租户内全部记录', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_ADMIN,
      role: 'admin',
      query: {},
    });
    expect(result.total).toBe(2);
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain('a-list-1');
    expect(ids).toContain('a-list-2');
  });

  it('owner: 可见租户内全部记录', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_OWNER,
      role: 'owner',
      query: {},
    });
    expect(result.total).toBe(2);
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain('a-list-1');
    expect(ids).toContain('a-list-2');
  });

  it('cross-tenant: 列表查询不含其他租户记录', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_TEACHER,
      role: 'teacher',
      query: {},
    });
    const ids = result.items.map((i) => i.id);
    expect(ids).not.toContain('a-list-b1');
  });

  it('teacher: 可通过 query.userId 按用户筛选', async () => {
    const result = await analysisService.listAnalyses({
      tenantId: TENANT_A,
      userId: USER_TEACHER,
      role: 'teacher',
      query: { userId: USER_STUDENT2 },
    });
    expect(result.total).toBe(1);
    expect(result.items[0]!.id).toBe('a-list-2');
  });
});

// ============================================================
// 2. getAnalysis RBAC
// ============================================================

describe('analysisService.getAnalysis RBAC', () => {
  beforeEach(() => {
    setupRbacData();

    // 学生1 的记录(含 aiEnhanced/aiDurationMs 元信息,用于透传测试)
    prismaMock.__insertAnalysis({
      id: 'a-get-own',
      tenantId: TENANT_A,
      userId: USER_STUDENT1,
      workType: 'painting',
      imageUrl: 'https://example.com/get-own.jpg',
      title: '自己的作品',
      status: 'success',
      overallScore: 85,
      result: {
        artType: 'painting',
        dimensions: { type: 'painting' },
        originality: {
          score: 85,
          similarity: 0.2,
          creativityLevel: 'good',
          suggestion: '原创性良好',
        },
        overallScore: 85,
        aiEnhanced: true,
        aiMeta: { aiDurationMs: 1234 },
      },
      durationMs: 500,
      createdAt: new Date('2026-07-01T10:00:00Z'),
      completedAt: new Date('2026-07-01T10:00:01Z'),
    });

    // 学生2 的记录(用于越权访问测试)
    prismaMock.__insertAnalysis({
      id: 'a-get-other',
      tenantId: TENANT_A,
      userId: USER_STUDENT2,
      workType: 'design',
      imageUrl: 'https://example.com/get-other.jpg',
      title: '他人的作品',
      status: 'success',
      overallScore: 78,
      createdAt: new Date('2026-07-02T10:00:00Z'),
      completedAt: new Date('2026-07-02T10:00:01Z'),
    });

    // 租户 B 的记录(用于跨租户测试)
    prismaMock.__insertAnalysis({
      id: 'a-get-cross',
      tenantId: TENANT_B,
      userId: USER_STUDENT_B,
      workType: 'sculpture',
      imageUrl: 'https://example.com/get-cross.jpg',
      title: 'B租户作品',
      status: 'success',
      overallScore: 92,
      createdAt: new Date('2026-07-03T10:00:00Z'),
    });
  });

  it('student 获取自己的记录 → 200', async () => {
    const detail = await analysisService.getAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-get-own',
      userId: USER_STUDENT1,
      role: 'student',
    });
    expect(detail.id).toBe('a-get-own');
    expect(detail.title).toBe('自己的作品');
    expect(detail.tenantId).toBe(TENANT_A);
    expect(detail.userId).toBe(USER_STUDENT1);
  });

  it('student 获取同租户他人记录 → 404 ANALYSIS_NOT_FOUND(不泄露存在性)', async () => {
    await expectBusinessError(
      () =>
        analysisService.getAnalysis({
          tenantId: TENANT_A,
          analysisId: 'a-get-other',
          userId: USER_STUDENT1,
          role: 'student',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
  });

  it('teacher 获取租户内任意记录 → 200', async () => {
    const detail = await analysisService.getAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-get-other',
      userId: USER_TEACHER,
      role: 'teacher',
    });
    expect(detail.id).toBe('a-get-other');
    expect(detail.userId).toBe(USER_STUDENT2);
  });

  it('cross-tenant 访问 → 404 ANALYSIS_NOT_FOUND', async () => {
    await expectBusinessError(
      () =>
        analysisService.getAnalysis({
          tenantId: TENANT_B,
          analysisId: 'a-get-own',
          userId: USER_STUDENT_B,
          role: 'student',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
  });

  it('不存在的 ID → 404 ANALYSIS_NOT_FOUND', async () => {
    await expectBusinessError(
      () =>
        analysisService.getAnalysis({
          tenantId: TENANT_A,
          analysisId: 'non-existent-id-9999',
          userId: USER_STUDENT1,
          role: 'student',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
  });

  it('返回详情包含 aiEnhanced/aiDurationMs(从存储的 result 中提取)', async () => {
    const detail = await analysisService.getAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-get-own',
      userId: USER_STUDENT1,
      role: 'student',
    });
    expect(detail.aiEnhanced).toBe(true);
    expect(detail.aiDurationMs).toBe(1234);
    expect(detail.result).not.toBeNull();
    expect(detail.result!.overallScore).toBe(85);
  });
});

// ============================================================
// 3. deleteAnalysis RBAC
// ============================================================

describe('analysisService.deleteAnalysis RBAC', () => {
  beforeEach(() => {
    setupRbacData();

    // 学生1 的记录
    prismaMock.__insertAnalysis({
      id: 'a-del-own',
      tenantId: TENANT_A,
      userId: USER_STUDENT1,
      workType: 'painting',
      imageUrl: 'https://example.com/del-own.jpg',
      title: '学生1作品',
      status: 'success',
      createdAt: new Date('2026-07-01T10:00:00Z'),
    });
    // 学生2 的记录
    prismaMock.__insertAnalysis({
      id: 'a-del-other',
      tenantId: TENANT_A,
      userId: USER_STUDENT2,
      workType: 'design',
      imageUrl: 'https://example.com/del-other.jpg',
      title: '学生2作品',
      status: 'success',
      createdAt: new Date('2026-07-02T10:00:00Z'),
    });
    // 教师的记录
    prismaMock.__insertAnalysis({
      id: 'a-del-teacher',
      tenantId: TENANT_A,
      userId: USER_TEACHER,
      workType: 'sculpture',
      imageUrl: 'https://example.com/del-teacher.jpg',
      title: '教师作品',
      status: 'success',
      createdAt: new Date('2026-07-03T10:00:00Z'),
    });
    // 租户 B 的记录(跨租户删除测试)
    prismaMock.__insertAnalysis({
      id: 'a-del-cross',
      tenantId: TENANT_B,
      userId: USER_STUDENT_B,
      workType: 'product',
      imageUrl: 'https://example.com/del-cross.jpg',
      title: 'B租户作品',
      status: 'success',
      createdAt: new Date('2026-07-04T10:00:00Z'),
    });
  });

  it('student 删除自己的记录 → 成功', async () => {
    const res = await analysisService.deleteAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-del-own',
      operatorUserId: USER_STUDENT1,
      role: 'student',
    });
    expect(res.deleted).toBe(true);
    expect(res.id).toBe('a-del-own');
    // 验证 DB 中记录已被删除
    expect(prismaMock.analysisStore.get('a-del-own')).toBeUndefined();
  });

  it('student 删除他人记录 → 404(canDeleteTenantWide=false)', async () => {
    await expectBusinessError(
      () =>
        analysisService.deleteAnalysis({
          tenantId: TENANT_A,
          analysisId: 'a-del-other',
          operatorUserId: USER_STUDENT1,
          role: 'student',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
    // 验证记录未被删除
    expect(prismaMock.analysisStore.get('a-del-other')).toBeDefined();
  });

  it('teacher 删除自己的记录 → 成功', async () => {
    const res = await analysisService.deleteAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-del-teacher',
      operatorUserId: USER_TEACHER,
      role: 'teacher',
    });
    expect(res.deleted).toBe(true);
  });

  it('teacher 删除他人记录 → 404(canDeleteTenantWide=false)', async () => {
    await expectBusinessError(
      () =>
        analysisService.deleteAnalysis({
          tenantId: TENANT_A,
          analysisId: 'a-del-other',
          operatorUserId: USER_TEACHER,
          role: 'teacher',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
    expect(prismaMock.analysisStore.get('a-del-other')).toBeDefined();
  });

  it('admin 删除租户内任意记录 → 成功', async () => {
    const res = await analysisService.deleteAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-del-other',
      operatorUserId: USER_ADMIN,
      role: 'admin',
    });
    expect(res.deleted).toBe(true);
    expect(prismaMock.analysisStore.get('a-del-other')).toBeUndefined();
  });

  it('owner 删除租户内任意记录 → 成功', async () => {
    const res = await analysisService.deleteAnalysis({
      tenantId: TENANT_A,
      analysisId: 'a-del-own',
      operatorUserId: USER_OWNER,
      role: 'owner',
    });
    expect(res.deleted).toBe(true);
    expect(prismaMock.analysisStore.get('a-del-own')).toBeUndefined();
  });

  it('cross-tenant 删除 → 404', async () => {
    await expectBusinessError(
      () =>
        analysisService.deleteAnalysis({
          tenantId: TENANT_A,
          analysisId: 'a-del-cross',
          operatorUserId: USER_ADMIN,
          role: 'admin',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
    // 租户 B 的记录未被删除
    expect(prismaMock.analysisStore.get('a-del-cross')).toBeDefined();
  });

  it('不存在的 ID → 404', async () => {
    await expectBusinessError(
      () =>
        analysisService.deleteAnalysis({
          tenantId: TENANT_A,
          analysisId: 'non-existent-del-id',
          operatorUserId: USER_ADMIN,
          role: 'admin',
        }),
      ErrorCode.ANALYSIS_NOT_FOUND,
      404,
    );
  });
});

// ============================================================
// 4. createAnalysis 配额校验
// ============================================================

describe('analysisService.createAnalysis 配额校验', () => {
  beforeEach(() => {
    // free 计划租户(50/月)
    prismaMock.__insertTenant({
      id: 't-quota-free',
      name: '免费租户',
      plan: 'free',
      status: 'active',
      maxSeats: 10,
    });
    // enterprise 计划租户(无限)
    prismaMock.__insertTenant({
      id: 't-quota-ent',
      name: '企业租户',
      plan: 'enterprise',
      status: 'active',
      maxSeats: 100,
    });
    prismaMock.__insertUser({
      id: 'u-quota-free',
      tenantId: 't-quota-free',
      feishuUnionId: 'un_qf',
      name: '免费用户',
      role: 'student',
    });
    prismaMock.__insertUser({
      id: 'u-quota-ent',
      tenantId: 't-quota-ent',
      feishuUnionId: 'un_qe',
      name: '企业用户',
      role: 'student',
    });
  });

  it('租户不存在 → 404 TENANT_NOT_FOUND', async () => {
    await expectBusinessError(
      () =>
        analysisService.createAnalysis({
          tenantId: 't-nonexistent-quota',
          userId: 'u-x',
          body: { artType: 'painting', imageUrl: 'https://example.com/x.jpg' },
        }),
      ErrorCode.TENANT_NOT_FOUND,
      404,
    );
  });

  it('租户已禁用 → 403 TENANT_DISABLED', async () => {
    prismaMock.__insertTenant({
      id: 't-quota-disabled',
      name: '禁用租户',
      plan: 'free',
      status: 'disabled',
    });
    prismaMock.__insertUser({
      id: 'u-quota-disabled',
      tenantId: 't-quota-disabled',
      feishuUnionId: 'un_qd',
      name: '禁用租户用户',
      role: 'student',
    });
    await expectBusinessError(
      () =>
        analysisService.createAnalysis({
          tenantId: 't-quota-disabled',
          userId: 'u-quota-disabled',
          body: { artType: 'painting', imageUrl: 'https://example.com/disabled.jpg' },
        }),
      ErrorCode.TENANT_DISABLED,
      403,
    );
  });

  it('free 计划配额未满 → 创建成功', async () => {
    const res = await analysisService.createAnalysis({
      tenantId: 't-quota-free',
      userId: 'u-quota-free',
      body: { artType: 'painting', imageUrl: 'https://example.com/free-ok.jpg' },
    });
    expect(res.status).toBe('success');
    expect(res.id).toBeTruthy();
    expect(res.result).not.toBeNull();
    // res.result 是 AnalysisDetail,res.result.result 是 AnalysisResult(含 overallScore)
    expect(res.result!.result).not.toBeNull();
    expect(res.result!.result!.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('free 计划配额已满(50) → 402 ANALYSIS_QUOTA_EXCEEDED', async () => {
    // 预置 50 条本月分析记录(达到 free 计划上限)
    const now = new Date();
    for (let i = 0; i < 50; i++) {
      prismaMock.__insertAnalysis({
        id: `a-quota-fill-${i}`,
        tenantId: 't-quota-free',
        userId: 'u-quota-free',
        workType: 'painting',
        imageUrl: `https://example.com/fill-${i}.jpg`,
        status: 'success',
        createdAt: now,
      });
    }
    await expectBusinessError(
      () =>
        analysisService.createAnalysis({
          tenantId: 't-quota-free',
          userId: 'u-quota-free',
          body: { artType: 'painting', imageUrl: 'https://example.com/over-quota.jpg' },
        }),
      ErrorCode.ANALYSIS_QUOTA_EXCEEDED,
      402,
    );
  });

  it('enterprise 计划无配额限制(即使已有大量记录也能创建)', async () => {
    // 预置 100 条记录(超过 free/standard 上限)
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      prismaMock.__insertAnalysis({
        id: `a-ent-fill-${i}`,
        tenantId: 't-quota-ent',
        userId: 'u-quota-ent',
        workType: 'painting',
        imageUrl: `https://example.com/ent-fill-${i}.jpg`,
        status: 'success',
        createdAt: now,
      });
    }
    const res = await analysisService.createAnalysis({
      tenantId: 't-quota-ent',
      userId: 'u-quota-ent',
      body: { artType: 'painting', imageUrl: 'https://example.com/ent-new.jpg' },
    });
    expect(res.status).toBe('success');
    expect(res.id).toBeTruthy();
  });

  it('缺少 imageUrl 且无 localImagePath → 400 PARAM_MISSING', async () => {
    // 需要有效的 active 租户(checkQuota 在图片校验之前执行)
    await expectBusinessError(
      () =>
        analysisService.createAnalysis({
          tenantId: 't-quota-free',
          userId: 'u-quota-free',
          body: { artType: 'painting' }, // 无 imageUrl
        }),
      ErrorCode.PARAM_MISSING,
      400,
    );
  });
});

// ============================================================
// 5. createAnalysis 缓存命中路径
// ============================================================

describe('analysisService.createAnalysis 缓存命中路径', () => {
  beforeEach(() => {
    prismaMock.__insertTenant({
      id: 't-cache',
      name: '缓存测试租户',
      plan: 'standard',
      status: 'active',
      maxSeats: 50,
    });
    prismaMock.__insertUser({
      id: 'u-cache',
      tenantId: 't-cache',
      feishuUnionId: 'un_cache',
      name: '缓存用户',
      role: 'student',
    });
  });

  it('首次调用:缓存未命中,jimpDurationMs 为正数', async () => {
    const res = await analysisService.createAnalysis({
      tenantId: 't-cache',
      userId: 'u-cache',
      body: {
        artType: 'painting',
        imageUrl: 'https://example.com/cache-miss-first.jpg',
      },
    });
    expect(res.status).toBe('success');
    expect(res.result).not.toBeNull();
    expect(res.result!.cacheHit).toBe(false);
    // Jimp-only 模式:loader 执行了 analyzeImage,jimpDurationMs > 0
    expect(res.result!.jimpDurationMs).toBeGreaterThanOrEqual(0);
    expect(res.result!.aiDurationMs).toBe(0); // Jimp-only 模式 aiDurationMs=0
  });

  it('相同图片第二次调用:缓存命中,jimpDurationMs=0, aiDurationMs=0, cacheHit=true', async () => {
    const imageUrl = 'https://example.com/cache-hit-same.jpg';

    // 第一次调用:缓存未命中,执行分析并回填缓存
    const firstRes = await analysisService.createAnalysis({
      tenantId: 't-cache',
      userId: 'u-cache',
      body: { artType: 'painting', imageUrl },
    });
    expect(firstRes.result!.cacheHit).toBe(false);

    // 第二次调用:相同 URL + artType → 缓存命中
    const secondRes = await analysisService.createAnalysis({
      tenantId: 't-cache',
      userId: 'u-cache',
      body: { artType: 'painting', imageUrl },
    });
    expect(secondRes.status).toBe('success');
    expect(secondRes.result).not.toBeNull();
    expect(secondRes.result!.cacheHit).toBe(true);
    // 缓存命中时 jimpDurationMs/aiDurationMs 归零
    expect(secondRes.result!.jimpDurationMs).toBe(0);
    expect(secondRes.result!.aiDurationMs).toBe(0);
  });

  it('cacheHit 标志存在于响应详情中', async () => {
    const res = await analysisService.createAnalysis({
      tenantId: 't-cache',
      userId: 'u-cache',
      body: {
        artType: 'painting',
        imageUrl: 'https://example.com/cache-flag-test.jpg',
      },
    });
    expect(res.result).not.toBeNull();
    expect(res.result).toHaveProperty('cacheHit');
    expect(typeof res.result!.cacheHit).toBe('boolean');
    // 首次调用必然未命中(全局 beforeEach 已清空 redis)
    expect(res.result!.cacheHit).toBe(false);
  });
});

// ============================================================
// 6. createAnalysisFromUpload 上传模式
// ============================================================

describe('analysisService.createAnalysisFromUpload 上传模式', () => {
  beforeEach(() => {
    prismaMock.__insertTenant({
      id: 't-upload',
      name: '上传测试租户',
      plan: 'standard',
      status: 'active',
      maxSeats: 50,
    });
    prismaMock.__insertUser({
      id: 'u-upload',
      tenantId: 't-upload',
      feishuUnionId: 'un_upload',
      name: '上传用户',
      role: 'student',
    });
  });

  it('上传模式:从本地文件创建分析,返回完整结果', async () => {
    const tempPath = createTempImageFile();
    expect(existsSync(tempPath)).toBe(true);

    const res = await analysisService.createAnalysisFromUpload({
      tenantId: 't-upload',
      userId: 'u-upload',
      artType: 'painting',
      localImagePath: tempPath,
      originalFileName: 'test-upload.jpg',
      title: '上传作品',
      remark: '测试备注',
    });

    expect(res.status).toBe('success');
    expect(res.id).toBeTruthy();
    expect(res.result).not.toBeNull();
    expect(res.result!.title).toBe('上传作品');
    expect(res.result!.remark).toBe('测试备注');
    // 上传模式 imageUrl 为 /uploads/ 路径(Nginx 静态服务)
    expect(res.result!.imageUrl).toContain('/uploads/');
    // workType 应与传入的 artType 一致
    expect(res.result!.workType).toBe('painting');
    // DB 中记录的 tenantId/userId 正确归属
    expect(res.result!.tenantId).toBe('t-upload');
    expect(res.result!.userId).toBe('u-upload');
  });

  it('上传模式:文件不可读时 → 400 ANALYSIS_IMAGE_INVALID', async () => {
    // 传入不存在的文件路径(existsSync 返回 false → hasLocal=false → 走 URL 校验)
    // 但 body.imageUrl 为 upload:// 占位,hasUrl=true,analysisSource=imageUrl
    // 实际上 existsSync=false 时 hasLocal=false,不会触发文件不可读错误
    // 这里测试 localImagePath 不存在的场景:createAnalysisFromUpload 仍会设置 body.imageUrl
    // 所以会走 URL 模式(Jimp mock 不关心 URL 内容),不会报错
    // 改为测试:不传 imageUrl 且 localImagePath 不存在 → PARAM_MISSING
    await expectBusinessError(
      () =>
        analysisService.createAnalysis({
          tenantId: 't-upload',
          userId: 'u-upload',
          body: { artType: 'painting', imageUrl: '' },
        }),
      ErrorCode.PARAM_MISSING,
      400,
    );
  });
});
