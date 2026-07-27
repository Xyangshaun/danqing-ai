// ============================================================
// 认证业务服务
// 对应文档:auth-design.md §1.2 完整 12 步流程
// 业务编排:state 生成 → 飞书 OAuth → User/Tenant 创建/更新 → JWT 签发 → Session 落库
// ============================================================

import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { feishuService } from './feishu.service.js';
import { jwtService } from './jwt.service.js';
import { sessionService } from './session.service.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { generateState, isValidStateFormat } from '../utils/crypto.js';
import { BusinessError } from '../middlewares/error-handler.js';
import { ErrorCode, type UserProfile, type TenantInfo, type TenantMembership, type FeishuAuthorizeResponse, type AuthRefreshResponse, type AuthLogoutResponse, type AuthMeResponse, type UserRole } from '../types/api-contract.js';
import { logger } from '../utils/logger.js';
import type { Tenant, User } from '@prisma/client';

/**
 * state 上下文(存 Redis)
 */
interface StateContext {
  clientIp: string;
  userAgent: string;
  deviceId: string;
  client: 'web' | 'admin' | 'mobile';
  createdAt: number;
}

/**
 * 飞书回调结果(用于 controller 转换为响应)
 */
export interface AuthLoginResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  isFirstLogin: boolean;
  user: UserProfile;
  tenant: TenantInfo;
  refreshToken: string; // 明文,由 controller 写入 Cookie,不返回响应体
}

class AuthServiceClass {
  /**
   * 步骤 2-3:生成 authorize URL + state,存 Redis(TTL 300s)
   * 对应 auth-design.md §1.2 步骤 2-3
   */
  async authorize(params: {
    redirectUri?: string; // 客户端可覆盖,但必须在白名单内(Phase 1 简化:信任 env 默认)
    client: 'web' | 'admin' | 'mobile';
    clientIp: string;
    userAgent: string;
    deviceId: string;
  }): Promise<FeishuAuthorizeResponse> {
    const redirectUri = params.redirectUri ?? feishuService.pickRedirectUri(params.client);
    const state = generateState();
    const ctx: StateContext = {
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      deviceId: params.deviceId,
      client: params.client,
      createdAt: Date.now(),
    };
    // Redis 存储,TTL 300s
    await redis().set(`oauth:state:${state}`, JSON.stringify(ctx), 'EX', 300);

    const authorizeUrl = feishuService.buildAuthorizeUrl(state, redirectUri);
    logger.debug({ state: state.slice(0, 8) + '...', client: params.client }, '[auth] state issued');

    return {
      authorizeUrl,
      state,
      redirectUri,
    };
  }

  /**
   * 步骤 6-10:OAuth 回调处理
   * 校验 state → 换 token → 获取用户 → 创建/更新 User+TenantMember → 签发 JWT → 落 Session
   * 对应 auth-design.md §1.2 步骤 6-10
   */
  async handleCallback(params: {
    code: string;
    state: string;
    clientIp: string;
    userAgent: string;
    deviceId: string;
    client: 'web' | 'admin' | 'mobile';
  }): Promise<AuthLoginResult> {
    // ===== 步骤 6:校验 state(三重比对 + 一次性消费) =====
    await this.validateAndConsumeState({
      state: params.state,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      deviceId: params.deviceId,
    });

    // ===== 步骤 7:用 code 换 token =====
    const tokenResult = await feishuService.exchangeCodeForToken(params.code);

    // ===== 步骤 7d:获取用户信息 =====
    const feishuUser = await feishuService.getUserInfo(tokenResult.accessToken);
    if (!feishuUser.unionId) {
      throw new BusinessError(ErrorCode.FEISHU_USER_INFO_FAILED, '飞书用户信息获取失败:union_id 缺失', 502);
    }

    // ===== 步骤 8:查询/创建 User + TenantMember(事务) =====
    const { user, tenant, isFirstLogin } = await this.upsertUserAndTenant({
      feishuUser,
    });

    // ===== 步骤 9:签发 JWT(access_token + refresh_token) =====
    const accessResult = jwtService.issueAccessToken({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      feishuOpenId: user.feishuOpenId,
      client: params.client,
    });
    const refreshResult = jwtService.issueRefreshToken({
      userId: user.id,
      client: params.client,
    });

    // ===== 步骤 9f:落 Session(DB + Redis 双写) =====
    await sessionService.createSession({
      userId: user.id,
      tenantId: tenant.id,
      refreshToken: refreshResult.token,
      userAgent: params.userAgent,
      ip: params.clientIp,
      expiresAt: refreshResult.expiresAt,
      refreshJti: refreshResult.jti,
    });

    logger.info({ userId: user.id, tenantId: tenant.id, isFirstLogin }, '[auth] login success');

    return {
      accessToken: accessResult.token,
      accessTokenExpiresAt: accessResult.expiresAt.toISOString(),
      isFirstLogin,
      user: this.toUserProfile(user),
      tenant: this.toTenantInfo(tenant),
      refreshToken: refreshResult.token,
    };
  }

  /**
   * 步骤 12:刷新 access_token(滚动刷新)
   * 对应 auth-design.md §1.2 步骤 12
   */
  async refresh(refreshToken: string): Promise<AuthRefreshResponse> {
    // 1+2+3. JWT 校验 + 黑名单 + Session 表校验
    let validateResult;
    try {
      validateResult = await sessionService.validateRefreshToken(refreshToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, '[auth] refresh validation failed');
      throw new BusinessError(ErrorCode.REFRESH_TOKEN_INVALID, 'refresh_token 无效,请重新登录', 401);
    }
    const { session, jti: oldJti } = validateResult;

    // 4. 读取用户最新信息(从 DB 重新读取权限,对应 auth-design.md §2.2)
    const user = await userRepository.findById(session.userId);
    if (!user) {
      throw new BusinessError(ErrorCode.REFRESH_TOKEN_INVALID, 'refresh_token 无效,请重新登录', 401);
    }
    const tenant = await tenantRepository.findById(user.tenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    if (tenant.status === 'disabled') {
      throw new BusinessError(ErrorCode.TENANT_DISABLED, '租户已被禁用', 403);
    }

    // 5. 签发新 access_token + 新 refresh_token(滚动)
    const accessResult = jwtService.issueAccessToken({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      feishuOpenId: user.feishuOpenId,
      client: 'web', // 刷新时不区分 client(Phase 1 简化)
    });
    const refreshResult = jwtService.issueRefreshToken({
      userId: user.id,
      client: 'web',
    });

    // 6. 滚动:旧 jti 入黑名单 + 更新 Session.refreshTokenHash + 更新 Redis
    await sessionService.rotateRefreshToken({
      oldRefreshToken: refreshToken,
      oldJti,
      newRefreshToken: refreshResult.token,
      newJti: refreshResult.jti,
      sessionId: session.id,
      tenantId: session.tenantId,
      expiresAt: refreshResult.expiresAt,
    });

    logger.info({ userId: user.id }, '[auth] refresh success');

    return {
      accessToken: accessResult.token,
      accessTokenExpiresAt: accessResult.expiresAt.toISOString(),
    };
  }

  /**
   * 登出:撤销 Session + 加入 access_token 黑名单 + 清 Cookie
   */
  async logout(params: {
    refreshToken: string | undefined;
    accessJti?: string;
    accessExpSec?: number;
    userId?: string;
    tenantId?: string;
    revokeAll?: boolean;
  }): Promise<AuthLogoutResponse> {
    let revokedSessions = 0;

    // 1. 撤销当前 refresh_token 对应的 Session
    if (params.refreshToken) {
      await sessionService.revokeByRefreshToken(params.refreshToken);
      revokedSessions += 1;
    }

    // 2. 撤销全部会话(可选)
    if (params.revokeAll && params.userId) {
      revokedSessions = await sessionService.revokeAllByUser(params.userId, params.tenantId);
    }

    // 3. 当前 access_token 加入黑名单(可选,加速失效)
    if (params.accessJti && params.accessExpSec) {
      await sessionService.revokeAccessTokenJti(params.accessJti, params.accessExpSec);
    }

    logger.info({ userId: params.userId, revokedSessions }, '[auth] logout');

    return { revokedSessions };
  }

  /**
   * GET /auth/me:获取当前用户信息(含 memberships)
   */
  async getCurrentUserInfo(userId: string): Promise<AuthMeResponse> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }
    const tenant = await tenantRepository.findById(user.tenantId);
    if (!tenant) {
      throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
    }
    const membershipsRaw = await userRepository.findMemberships(userId);
    const memberships: TenantMembership[] = membershipsRaw.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      tenantType: m.tenant.type as TenantMembership['tenantType'],
      role: m.role as UserRole,
      joinedAt: m.joinedAt.toISOString(),
    }));

    return {
      user: this.toUserProfile(user),
      tenant: this.toTenantInfo(tenant),
      memberships,
    };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 步骤 6:校验 state(IP+UA+device_id 三重比对 + 一次性消费)
   * 对应 auth-design.md §1.2 步骤 6 + §2.3
   */
  private async validateAndConsumeState(params: {
    state: string;
    clientIp: string;
    userAgent: string;
    deviceId: string;
  }): Promise<void> {
    // 1. state 格式校验
    if (!isValidStateFormat(params.state)) {
      logger.warn({ state: params.state.slice(0, 8) + '...' }, '[auth] state format invalid');
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:state 校验不通过', 400);
    }

    // 2. 从 Redis 取出
    const raw = await redis().get(`oauth:state:${params.state}`);
    if (!raw) {
      logger.warn({ state: params.state.slice(0, 8) + '...' }, '[auth] state not found in redis');
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:state 已过期或不存在', 400);
    }

    let ctx: StateContext;
    try {
      ctx = JSON.parse(raw) as StateContext;
    } catch {
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:state 解析失败', 400);
    }

    // 3. 三重比对(IP + UA + device_id)
    if (ctx.clientIp !== params.clientIp) {
      logger.warn(
        { expected: ctx.clientIp, actual: params.clientIp },
        '[auth] state client_ip mismatch',
      );
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:IP 不一致', 400);
    }
    if (ctx.userAgent !== params.userAgent) {
      logger.warn('[auth] state user_agent mismatch');
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:User-Agent 不一致', 400);
    }
    if (ctx.deviceId !== params.deviceId) {
      logger.warn('[auth] state device_id mismatch');
      throw new BusinessError(ErrorCode.FEISHU_AUTH_FAILED, '飞书授权失败:device_id 不一致', 400);
    }

    // 4. 一次性消费:立即 DEL(防重放)
    await redis().del(`oauth:state:${params.state}`);
  }

  /**
   * 步骤 8:upsert User + TenantMember(事务)
   * 对应 auth-design.md §1.2 步骤 8
   * - 首次登录:创建 Tenant(基于 feishu tenant_key) + User + TenantMember
   * - 已存在:更新 name/avatar/lastLoginAt
   */
  private async upsertUserAndTenant(params: {
    feishuUser: {
      openId: string;
      unionId: string;
      name: string;
      avatarUrl: string;
      email: string | null;
      mobile: string | null;
      tenantKey: string | null;
    };
  }): Promise<{ user: User; tenant: Tenant; isFirstLogin: boolean }> {
    const cfg = env();

    // 查找已有用户
    const existing = await userRepository.findByFeishuUnionId(params.feishuUser.unionId);

    if (existing) {
      // 已存在:更新头像/姓名/最后登录时间
      await userRepository.updateLastLoginAt(existing.id, new Date());
      // 更新 name/avatar(可选)
      const updated = await userRepository.update(existing.tenantId, existing.id, {
        name: params.feishuUser.name,
        avatar: params.feishuUser.avatarUrl,
        email: params.feishuUser.email ?? null,
      });
      const tenant = await tenantRepository.findById(updated.tenantId);
      if (!tenant) {
        throw new BusinessError(ErrorCode.TENANT_NOT_FOUND, '租户不存在', 404);
      }
      return { user: updated, tenant, isFirstLogin: false };
    }

    // 首次登录:创建 Tenant(基于 feishu tenant_key,若不存在则创建个人租户)
    let tenant: Tenant | null = null;
    if (params.feishuUser.tenantKey) {
      tenant = await tenantRepository.findByFeishuTenantKey(params.feishuUser.tenantKey);
    }
    if (!tenant) {
      // 创建个人租户(默认)
      tenant = await tenantRepository.create({
        name: `${params.feishuUser.name}的个人空间`,
        type: cfg.tenantDefaultType,
        plan: cfg.tenantDefaultPlan,
        status: 'active',
        maxSeats: 1,
      });
    }

    // 创建 User + TenantMember(事务)
    const newUser = await tenantRepository.withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: tenant!.id,
          feishuOpenId: params.feishuUser.openId,
          feishuUnionId: params.feishuUser.unionId,
          name: params.feishuUser.name,
          avatar: params.feishuUser.avatarUrl,
          email: params.feishuUser.email,
          phone: params.feishuUser.mobile,
          role: 'student',
          lastLoginAt: new Date(),
        },
      });
      await tx.tenantMember.create({
        data: {
          userId: user.id,
          tenantId: tenant!.id,
          role: 'student',
        },
      });
      return user;
    });

    return { user: newUser, tenant, isFirstLogin: true };
  }

  /**
   * User DB 模型 → UserProfile(API 契约)
   */
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
      role: user.role as UserRole,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  /**
   * Tenant DB 模型 → TenantInfo(API 契约)
   */
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

export const authService = new AuthServiceClass();
