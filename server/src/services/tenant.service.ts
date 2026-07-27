// ============================================================
// 租户业务服务
// 对应 API:GET /tenants/current + POST /tenants/switch
// ============================================================

import { tenantRepository } from '../repositories/tenant.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { jwtService } from './jwt.service.js';
import { BusinessError } from '../middlewares/error-handler.js';
import {
  ErrorCode,
  type TenantInfo,
  type SwitchTenantResponse,
  type UserRole,
} from '../types/api-contract.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import type { Tenant } from '@prisma/client';

/**
 * 订阅计划对应配额上限(对应 data-model-v1.md §3 TenantPlan)
 */
const PLAN_QUOTA: Record<Tenant['plan'], number> = {
  free: 50,
  standard: 2000,
  enterprise: -1, // 无限
};

class TenantServiceClass {
  /**
   * 获取当前租户信息(含当月配额使用情况)
   */
  async getCurrentTenant(tenantId: string): Promise<TenantInfo> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    if (tenant.status === 'disabled') {
      throw new BusinessError(ErrorCode.TENANT_DISABLED, '租户已被禁用', 403);
    }

    // 当月已用分析次数(从 Redis 计数器读取;若无则查 DB)
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const monthKey = `${year}${String(month).padStart(2, '0')}`;
    const redisKey = `tenant:${tenantId}:quota:${monthKey}`;
    let usedQuota: number;
    try {
      const cached = await redis().get(redisKey);
      usedQuota = cached ? parseInt(cached, 10) : 0;
    } catch {
      // Redis 不可达时,降级到 DB 查询
      const { analysisRepository } = await import('../repositories/analysis.repository.js');
      usedQuota = await analysisRepository.countMonthlyUsage(tenantId, year, month);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type as TenantInfo['type'],
      feishuTenantKey: tenant.feishuTenantKey,
      plan: tenant.plan as TenantInfo['plan'],
      status: tenant.status as TenantInfo['status'],
      maxSeats: tenant.maxSeats,
      parentId: tenant.parentId,
      createdAt: tenant.createdAt.toISOString(),
      usedQuota,
      maxQuota: PLAN_QUOTA[tenant.plan],
    };
  }

  /**
   * 切换租户
   * - 校验:user_id 确实属于该 tenant_id 且租户 active
   * - 重新签发 access_token(新 tenant_id / role)
   * - refresh_token 不变(对应 auth-design.md §2.4)
   */
  async switchTenant(params: {
    userId: string;
    targetTenantId: string;
    feishuOpenId: string;
    client: 'web' | 'admin' | 'mobile';
  }): Promise<SwitchTenantResponse> {
    // 1. 校验目标租户存在且 active
    const tenant = await tenantRepository.findById(params.targetTenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    if (tenant.status === 'disabled') {
      throw new BusinessError(ErrorCode.TENANT_DISABLED, '租户已被禁用', 403);
    }

    // 2. 校验用户属于该租户
    const membership = await tenantRepository.findMembership(params.userId, params.targetTenantId);
    if (!membership) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '您不属于该租户', 403);
    }

    // 3. 更新 User.tenantId + role(冗余字段同步)
    await userRepository.switchTenant(params.userId, params.targetTenantId, membership.role as UserRole);

    // 4. 签发新 access_token(refresh_token 不变)
    const accessResult = jwtService.issueAccessToken({
      userId: params.userId,
      tenantId: tenant.id,
      role: membership.role as UserRole,
      feishuOpenId: params.feishuOpenId,
      client: params.client,
    });

    logger.info({ userId: params.userId, from: 'old', to: tenant.id }, '[tenant] switched');

    return {
      accessToken: accessResult.token,
      accessTokenExpiresAt: accessResult.expiresAt.toISOString(),
      tenant: this.toTenantInfo(tenant),
    };
  }

  private toTenantInfo(tenant: Tenant): TenantInfo {
    return {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type as TenantInfo['type'],
      feishuTenantKey: tenant.feishuTenantKey,
      plan: tenant.plan as TenantInfo['plan'],
      status: tenant.status as TenantInfo['status'],
      maxSeats: tenant.maxSeats,
      parentId: tenant.parentId,
      createdAt: tenant.createdAt.toISOString(),
    };
  }
}

export const tenantService = new TenantServiceClass();
