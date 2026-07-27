// ============================================================
// 租户 Controller
// 对应 API:
//   GET  /tenants/current
//   POST /tenants/switch
// ============================================================

import type { RequestHandler } from 'express';
import { tenantService } from '../services/tenant.service.js';
import { success, error } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';

/**
 * GET /tenants/current
 */
export const getCurrentTenant: RequestHandler = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const tenant = await tenantService.getCurrentTenant(req.tenantId);
    return success(res, tenant, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /tenants/switch
 */
export const switchTenant: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.feishuOpenId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const targetTenantId = req.body?.tenantId as string | undefined;
    if (!targetTenantId) {
      return error(res, ErrorCode.PARAM_MISSING, '缺少必填参数:tenantId', 400);
    }

    // client 收窄:'marketing' 不支持签发 token,默认 fallback 'web'
    const client: 'web' | 'admin' | 'mobile' =
      req.client === 'admin' || req.client === 'mobile' ? req.client : 'web';

    const result = await tenantService.switchTenant({
      userId: req.userId,
      targetTenantId,
      feishuOpenId: req.feishuOpenId,
      client,
    });

    return success(res, result, '租户切换成功');
  } catch (err) {
    return next(err);
  }
};
