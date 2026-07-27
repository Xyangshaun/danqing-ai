// ============================================================
// 飞书 OAuth 服务
// 对应文档:auth-design.md §1.2 步骤 4(拼装 authorize URL)
// + §1.2 步骤 6(用 code 换 access_token)
// + §1.2 步骤 7(获取用户信息)
// 安全:App Secret 仅在后端持有,严禁出现在任何日志/响应
// ============================================================

import { env } from '../config/env.js';
import { httpClient } from '../utils/http-client.js';
import { BusinessError } from '../middlewares/error-handler.js';
import { ErrorCode } from '../types/api-contract.js';
import { logger } from '../utils/logger.js';

/**
 * 飞书授权 URL 拼装结果
 */
export interface FeishuAuthorizeUrlResult {
  authorizeUrl: string;
  state: string;
  redirectUri: string;
}

/**
 * 飞书用户信息(对应 auth-design.md §1.2 步骤 7)
 */
export interface FeishuUserInfo {
  openId: string;
  unionId: string;
  name: string;
  avatarUrl: string;
  email: string | null;
  mobile: string | null;
  tenantKey: string | null;
  employeeNo: string | null;
}

class FeishuServiceClass {
  /**
   * 拼装飞书授权 URL
   * @param state 后端生成的 state(由 controller 传入,本服务不负责生成)
   * @param redirectUri 回调 URI(必须与飞书应用白名单严格匹配)
   */
  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const cfg = env();
    const params = new URLSearchParams({
      app_id: cfg.feishuAppId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });
    return `${cfg.feishuAuthzEndpoint}?${params.toString()}`;
  }

  /**
   * 根据客户端类型选择 redirect_uri
   */
  pickRedirectUri(client: 'web' | 'admin' | 'mobile'): string {
    const cfg = env();
    switch (client) {
      case 'admin':
        return cfg.feishuRedirectUriAdmin;
      case 'mobile':
        return cfg.feishuRedirectUriMobile;
      case 'web':
      default:
        return cfg.feishuRedirectUriWeb;
    }
  }

  /**
   * 用 code 换 access_token
   * 对应 auth-design.md §1.2 步骤 6:POST /authen/v1/oidc/access_token
   * @param code 飞书返回的授权码(一次性,5 分钟有效)
   */
  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    openId: string;
    unionId: string;
    expiresIn: number;
  }> {
    const cfg = env();
    const endpoint = cfg.feishuTokenEndpoint;

    try {
      const resp = await httpClient().post(
        endpoint,
        {
          grant_type: 'authorization_code',
          code,
          app_id: cfg.feishuAppId,
          app_secret: cfg.feishuAppSecret,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      // 飞书 OIDC 端点返回结构:{ code, msg, data: { access_token, refresh_token, open_id, union_id, expires_in, refresh_expires_in, token_type } }
      const body = resp.data as {
        code?: number;
        msg?: string;
        data?: {
          access_token?: string;
          refresh_token?: string;
          open_id?: string;
          union_id?: string;
          expires_in?: number;
          refresh_expires_in?: number;
          token_type?: string;
        };
      };

      if (body.code !== 0 || !body.data?.access_token) {
        logger.warn({ feishuCode: body.code, feishuMsg: body.msg }, '[feishu] token exchange failed');
        throw new BusinessError(
          ErrorCode.FEISHU_TOKEN_EXCHANGE_FAILED,
          '飞书 access_token 获取失败',
          502,
        );
      }

      const d = body.data;
      return {
        accessToken: d.access_token!,
        refreshToken: d.refresh_token ?? '',
        openId: d.open_id ?? '',
        unionId: d.union_id ?? '',
        expiresIn: d.expires_in ?? 7200,
      };
    } catch (err) {
      if (err instanceof BusinessError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, '[feishu] token exchange http error');
      throw new BusinessError(
        ErrorCode.FEISHU_TOKEN_EXCHANGE_FAILED,
        '飞书 access_token 获取失败',
        502,
      );
    }
  }

  /**
   * 用 access_token 获取用户信息
   * 对应 auth-design.md §1.2 步骤 7:GET /authen/v1/user_info
   * @param feishuAccessToken 飞书应用维度访问用户资源的 token(非 JWT)
   */
  async getUserInfo(feishuAccessToken: string): Promise<FeishuUserInfo> {
    const cfg = env();
    const endpoint = cfg.feishuUserinfoEndpoint;

    try {
      const resp = await httpClient().get(endpoint, {
        headers: {
          Authorization: `Bearer ${feishuAccessToken}`,
        },
      });

      const body = resp.data as {
        code?: number;
        msg?: string;
        data?: {
          open_id?: string;
          union_id?: string;
          name?: string;
          avatar_url?: string;
          email?: string;
          mobile?: string;
          tenant_key?: string;
          employee_no?: string;
        };
      };

      if (body.code !== 0 || !body.data) {
        logger.warn({ feishuCode: body.code, feishuMsg: body.msg }, '[feishu] user_info failed');
        throw new BusinessError(
          ErrorCode.FEISHU_USER_INFO_FAILED,
          '飞书用户信息获取失败',
          502,
        );
      }

      const d = body.data;
      return {
        openId: d.open_id ?? '',
        unionId: d.union_id ?? '',
        name: d.name ?? '飞书用户',
        avatarUrl: d.avatar_url ?? '',
        email: d.email ?? null,
        mobile: d.mobile ?? null,
        tenantKey: d.tenant_key ?? null,
        employeeNo: d.employee_no ?? null,
      };
    } catch (err) {
      if (err instanceof BusinessError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, '[feishu] user_info http error');
      throw new BusinessError(
        ErrorCode.FEISHU_USER_INFO_FAILED,
        '飞书用户信息获取失败',
        502,
      );
    }
  }
}

export const feishuService = new FeishuServiceClass();
