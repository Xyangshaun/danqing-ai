// ============================================================
// 用户 Controller
// 对应 API:
//   GET   /users/profile
//   PATCH /users/profile
// ============================================================

import type { RequestHandler } from 'express';
import { userService } from '../services/user.service.js';
import { success } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';
import { error } from '../utils/response.js';

/**
 * GET /users/profile
 */
export const getProfile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const profile = await userService.getProfile(req.userId);
    return success(res, profile, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /users/profile
 */
export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const profile = await userService.updateProfile(req.userId, req.tenantId, req.body);
    return success(res, profile, '资料已更新');
  } catch (err) {
    return next(err);
  }
};
