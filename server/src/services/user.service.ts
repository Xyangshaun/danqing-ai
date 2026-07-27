// ============================================================
// 用户业务服务
// 对应 API:GET /users/profile + PATCH /users/profile
// ============================================================

import { userRepository } from '../repositories/user.repository.js';
import { BusinessError } from '../middlewares/error-handler.js';
import { ErrorCode, type UserProfile, type UpdateProfileRequest } from '../types/api-contract.js';
import type { User } from '@prisma/client';

class UserServiceClass {
  /**
   * 获取用户资料(等同于 /auth/me 的 user 字段)
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    return this.toUserProfile(user);
  }

  /**
   * 更新用户资料
   * 可更新:name / avatar / email / phone
   * 不可更新:feishuOpenId / feishuUnionId / role / tenantId
   */
  async updateProfile(userId: string, tenantId: string, data: UpdateProfileRequest): Promise<UserProfile> {
    const user = await userRepository.findByIdAndTenant(userId, tenantId);
    if (!user) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const updateData: Partial<Pick<User, 'name' | 'avatar' | 'email' | 'phone'>> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;

    const updated = await userRepository.update(tenantId, userId, updateData);
    return this.toUserProfile(updated);
  }

  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      tenantId: user.tenantId,
      feishuOpenId: user.feishuOpenId,
      feishuUnionId: user.feishuUnionId,
      name: user.name,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      role: user.role as UserProfile['role'],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}

export const userService = new UserServiceClass();
