// ============================================================
// 租户 Repository
// 对应文档:data-model-v1.md §7.2(强制 tenant_id 过滤)
// Tenant 表本身不含 tenant_id(自身即租户),但所有查询仍需校验
// ============================================================

import type { Prisma, Tenant } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export class TenantRepository {
  /**
   * 按 ID 查询租户
   */
  async findById(tenantId: string): Promise<Tenant | null> {
    return prisma().tenant.findUnique({
      where: { id: tenantId },
    });
  }

  /**
   * 按飞书 tenant_key 查询租户(首次登录自动归属)
   */
  async findByFeishuTenantKey(feishuTenantKey: string): Promise<Tenant | null> {
    return prisma().tenant.findUnique({
      where: { feishuTenantKey },
    });
  }

  /**
   * 创建租户
   */
  async create(data: Prisma.TenantCreateInput): Promise<Tenant> {
    return prisma().tenant.create({ data });
  }

  /**
   * 更新租户(显式校验 tenant_id 即主键)
   */
  async update(tenantId: string, data: Prisma.TenantUpdateInput): Promise<Tenant> {
    return prisma().tenant.update({
      where: { id: tenantId },
      data,
    });
  }

  /**
   * 查询租户成员数(用于校验 max_seats)
   */
  async countMembers(tenantId: string): Promise<number> {
    return prisma().tenantMember.count({
      where: { tenantId },
    });
  }

  /**
   * 查询某用户在某租户的成员关系
   */
  async findMembership(userId: string, tenantId: string) {
    return prisma().tenantMember.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
  }

  /**
   * 创建租户成员关系(用户加入租户)
   */
  async createMembership(data: { userId: string; tenantId: string; role: TenantMemberRole }): Promise<void> {
    await prisma().tenantMember.create({ data });
  }

  /**
   * 事务包装(用于跨表操作,如首次登录创建 User+TenantMember)
   */
  async withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma().$transaction(fn);
  }
}

/**
 * 角色类型(从 Prisma 生成)
 */
type TenantMemberRole = 'admin' | 'teacher' | 'student' | 'owner';

export const tenantRepository = new TenantRepository();
