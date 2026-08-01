// ============================================================
// 丹青有AI - API HTTP 客户端(fetch 封装,功能等价 axios 拦截器)
// 对应设计:auth-design.md §1.2 步骤 11/12 + api-contract-v1.md §1.2/§2.3
// ============================================================

import type {
  ApiResponse,
  ClientType,
} from '../types/api-contract';
import { ErrorCode } from '../types/api-contract';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getDeviceId,
  hasAccessToken,
} from './token-store';

/* ============================================================
 * 设计说明(偏离 axios 的决策)
 * ------------------------------------------------------------
 * 任务文档要求"axios 实例 + 拦截器",但项目约束禁止修改 package.json
 * 添加 axios 依赖。本文件用原生 fetch 封装,功能等价:
 *   - 请求拦截器:injectAuthHeaders / injectClientHeaders
 *   - 响应拦截器:handleResponse(统一解包 + 业务错误处理)
 *   - 401 自动刷新:handleTokenExpired(静默调 /auth/refresh + 重试)
 *   - 并发刷新防护:refreshPromise 单例,多个 401 共享一次刷新
 *   - traceId 透传:响应头/体的 traceId 用于排查,前端不处理
 * ============================================================ */

/** Base URL,优先 env,降级到本地后端 */
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

/** 默认客户端标识 */
const DEFAULT_CLIENT: ClientType = 'web';

/* ============================================================
 * 错误类型
 * ============================================================ */

/**
 * 业务错误(api-contract-v1.md §2 错误码表)
 * code !== 0 时抛出,前端 catch 后可读取 code 做差异化处理
 */
export class ApiError extends Error {
  /** 业务错误码(对应 ErrorCode 枚举) */
  readonly code: number;
  /** 链路追踪 ID,排查必备 */
  readonly traceId: string | undefined;
  /** HTTP 状态码 */
  readonly httpStatus: number;

  constructor(code: number, message: string, traceId?: string, httpStatus?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.traceId = traceId;
    this.httpStatus = httpStatus ?? 0;
  }
}

/* ============================================================
 * 外部回调注入(解耦 React)
 * ------------------------------------------------------------
 * api.ts 不在 React 树内,不能直接 useToast / useNavigate。
 * 通过 setToastHandler / setAuthFailedHandler 由 React 层注入。
 * ============================================================ */

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastHandler = (type: ToastType, title: string, desc?: string) => void;
type AuthFailedHandler = () => void;
/** 权限不足回调(用户仍登录,仅无权限访问某资源) */
type PermissionDeniedCallback = (message: string) => void;

let toastHandler: ToastHandler | null = null;
let authFailedHandler: AuthFailedHandler | null = null;
let permissionDeniedHandler: PermissionDeniedCallback | null = null;

/** 注入 Toast 回调(由 AuthProvider 在 mount 时调用) */
export function setToastHandler(fn: ToastHandler | null): void {
  toastHandler = fn;
}

/** 注入登录失效回调(由 AuthProvider 注入,内部执行 clearToken + navigate('/login')) */
export function setAuthFailedHandler(fn: AuthFailedHandler | null): void {
  authFailedHandler = fn;
}

/**
 * 注入权限不足回调(由 PermissionToast 组件订阅)
 *
 * 与 authFailedHandler 的区别:
 *   - authFailedHandler:登录态失效(401),清 token + 跳登录页
 *   - permissionDeniedHandler:权限不足(403/FORBIDDEN),用户仍登录,
 *     仅提示无权限,不跳转,不破坏当前页面状态
 */
export function setPermissionDeniedHandler(fn: PermissionDeniedCallback | null): void {
  permissionDeniedHandler = fn;
}

function notifyError(title: string, desc?: string): void {
  toastHandler?.('error', title, desc);
}

function triggerAuthFailed(): void {
  clearAccessToken();
  authFailedHandler?.();
}

/** 触发权限不足提示(由 PermissionToast 接收,若未注册则降级到普通 Toast) */
function notifyPermissionDenied(message: string): void {
  if (permissionDeniedHandler) {
    permissionDeniedHandler(message);
  } else {
    // 降级:未注册权限 Toast 时,走普通错误 Toast
    notifyError('权限不足', message);
  }
}

/* ============================================================
 * 请求配置
 * ============================================================ */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  /** 请求体(自动 JSON.stringify) */
  body?: unknown;
  /** URL query 参数(自动拼接) */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 是否跳过 Authorization 头(如 /auth/feishu/authorize 公开接口) */
  skipAuth?: boolean;
  /**
   * 是否跳过 401 自动刷新(避免循环:/auth/refresh 自身 401 不再触发刷新)
   * 默认 false
   */
  skipRefresh?: boolean;
  /** 是否静默(不触发全局 Toast),默认 false */
  silent?: boolean;
  /** 客户端标识,默认 'web' */
  client?: ClientType;
}

/** 构建完整 URL(Base URL + path + query) */
function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.append(k, String(v));
    }
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** 构建请求头(请求拦截器) */
function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client': options.client ?? DEFAULT_CLIENT,
    'X-Client-Context': JSON.stringify({
      device_id: getDeviceId(),
      client: options.client ?? DEFAULT_CLIENT,
    }),
    ...options.headers,
  };

  // 注入 Authorization(对应 auth-design.md §1.2 步骤 11d)
  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  // POST/PATCH/PUT 默认 JSON Content-Type(有 body 时)
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/* ============================================================
 * 并发刷新防护
 * ------------------------------------------------------------
 * 多个请求同时收到 401(code=2002)时,只发一次 /auth/refresh,
 * 其他请求 await 同一个 Promise,刷新成功后各自重试原请求。
 * 刷新失败则清空 token 并触发跳转登录页。
 * ============================================================ */

let refreshPromise: Promise<string> | null = null;

/**
 * 触发 access_token 刷新(并发安全)
 * @returns 新的 access_token
 * @throws ApiError(2003) 刷新失败
 */
async function refreshTokenOnce(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = (async () => {
    try {
      const resp = await rawRequest<import('../types/api-contract').AuthRefreshResponse>(
        '/auth/refresh',
        {
          method: 'POST',
          skipAuth: true, // refresh 不校验 access_token
          skipRefresh: true, // 避免循环
          silent: true, // 静默,失败由调用方处理
        }
      );
      setAccessToken(resp.accessToken, resp.accessTokenExpiresAt);
      return resp.accessToken;
    } finally {
      // 清除进行中的 Promise,允许下次失败后再次尝试
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/* ============================================================
 * 核心 fetch 封装
 * ============================================================ */

/**
 * 原始请求(不做 401 自动刷新,只做响应解包 + 业务错误抛出)
 * 内部使用,供 refreshTokenOnce 和 request 调用
 */
async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const url = buildUrl(path, options.query);
  const headers = buildHeaders(options);
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined && options.body !== null;
  const body = hasBody ? JSON.stringify(options.body) : undefined;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include', // 携带 Cookie(refresh_token 在 HttpOnly Cookie 中)
    });
  } catch (err) {
    // 网络错误(后端不可达 / CORS 拦截 / 断网)
    const msg = err instanceof Error ? err.message : '网络请求失败';
    if (!options.silent) {
      notifyError('网络错误', `请检查网络连接后重试(${msg})`);
    }
    throw new ApiError(ErrorCode.UPSTREAM_UNAVAILABLE, msg, undefined, 0);
  }

  // 尝试解析 JSON(后端统一返回 JSON;若非 JSON 如 502 网关 HTML,降级处理)
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await resp.json()) as ApiResponse<T>;
  } catch {
    // 非 JSON 响应(可能是网关错误页)
    const msg = `服务异常(HTTP ${resp.status})`;
    if (!options.silent) {
      notifyError('服务异常', msg);
    }
    throw new ApiError(ErrorCode.UPSTREAM_UNAVAILABLE, msg, undefined, resp.status);
  }

  // 业务错误处理(code !== 0)
  if (!payload || payload.code !== ErrorCode.SUCCESS) {
    const code = payload?.code ?? ErrorCode.UPSTREAM_UNAVAILABLE;
    const message = payload?.message ?? '未知错误';
    const traceId = payload?.traceId;
    throw new ApiError(code, message, traceId, resp.status);
  }

  // 成功:返回 data(此处 data 一定非 null,因为 code === 0)
  return payload.data as T;
}

/**
 * 发起 API 请求(带 401 自动刷新 + 并发防护)
 *
 * 响应拦截器逻辑(api-contract-v1.md §2.3):
 * - code === 0:返回 data
 * - code === 2002(token 过期):静默刷新 + 重试原请求
 * - code === 2001 / 2003:清 token + 跳登录页
 * - 其他错误:抛 ApiError(调用方 catch 处理)
 *
 * @throws ApiError 业务错误
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }

    // 跳过刷新的场景:刷新接口自身失败、显式 skipRefresh、跳过鉴权的公开接口
    if (options.skipRefresh || options.skipAuth) {
      handleBusinessError(err, options.silent);
      throw err;
    }

    // token 过期:静默刷新 + 重试原请求(仅一次)
    if (err.code === ErrorCode.TOKEN_EXPIRED) {
      try {
        await refreshTokenOnce();
        // 刷新成功,重试原请求(用最新 token)
        return await rawRequest<T>(path, options);
      } catch (refreshErr) {
        // 刷新失败:清 token + 跳登录页
        if (!options.silent) {
          const msg =
            refreshErr instanceof ApiError && refreshErr.code === ErrorCode.REFRESH_TOKEN_INVALID
              ? '登录已过期,请重新登录'
              : '会话刷新失败,请重新登录';
          notifyError('登录失效', msg);
        }
        triggerAuthFailed();
        throw refreshErr;
      }
    }

    // refresh_token 无效 / 未授权:清 token + 跳登录页
    if (
      err.code === ErrorCode.REFRESH_TOKEN_INVALID ||
      err.code === ErrorCode.UNAUTHORIZED ||
      err.code === ErrorCode.TOKEN_SIGNATURE_INVALID
    ) {
      if (!options.silent) {
        notifyError('登录失效', err.message);
      }
      triggerAuthFailed();
      throw err;
    }

    // 其他业务错误:按错误码做差异化 Toast
    handleBusinessError(err, options.silent);
    throw err;
  }
}

/**
 * 业务错误 Toast 处理(api-contract-v1.md §2.3 前端错误处理约定)
 */
function handleBusinessError(err: ApiError, silent?: boolean): void {
  if (silent) return;

  // 按错误码差异化提示
  switch (err.code) {
    case ErrorCode.RATE_LIMITED:
      notifyError('操作过于频繁', '请稍后再试');
      break;
    case ErrorCode.ANALYSIS_QUOTA_EXCEEDED:
      notifyError('配额已用完', '本月分析次数已达上限,请升级订阅');
      break;
    case ErrorCode.ANALYSIS_TIMEOUT:
      notifyError('分析超时', 'AI 分析超过 3 秒,请重试');
      break;
    case ErrorCode.FORBIDDEN:
      // 权限不足:不跳登录页(用户仍登录),触发 PermissionToast 专属提示
      // 返回 rejected promise 让调用方可差异化处理(如隐藏按钮/跳转)
      notifyPermissionDenied(err.message);
      break;
    case ErrorCode.TENANT_DISABLED:
      notifyError('租户已禁用', '请联系管理员');
      break;
    case ErrorCode.FILE_TOO_LARGE:
      notifyError('文件过大', '最大支持 10MB');
      break;
    case ErrorCode.FILE_TYPE_UNSUPPORTED:
      notifyError('文件类型不支持', '仅支持 JPEG/PNG/WebP/BMP');
      break;
    // 其他业务错误统一 Toast message
    default:
      notifyError('操作失败', err.message);
      break;
  }
}

/* ============================================================
 * 便捷方法
 * ============================================================ */

export function get<T>(
  path: string,
  query?: RequestOptions['query'],
  options?: Omit<RequestOptions, 'method' | 'query'>
): Promise<T> {
  return request<T>(path, { ...options, method: 'GET', query });
}

export function post<T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<T> {
  return request<T>(path, { ...options, method: 'POST', body });
}

export function patch<T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<T> {
  return request<T>(path, { ...options, method: 'PATCH', body });
}

export function del<T>(
  path: string,
  options?: Omit<RequestOptions, 'method'>
): Promise<T> {
  return request<T>(path, { ...options, method: 'DELETE' });
}

/* ============================================================
 * 工具方法(供 AuthProvider 判断初始登录态)
 * ============================================================ */

/** 当前是否持有 access_token(从内存读取) */
export function isAuthenticated(): boolean {
  return hasAccessToken();
}

/* ============================================================
 * Preset API(Phase 5 评分预设)
 * ============================================================ */

import type {
  EvaluationPresetSummary,
  EvaluationPresetDetail,
  ApplyPresetRequest,
  ApplyPresetResponse,
} from '../types/api-contract';

/** GET /presets - 列出当前用户可见的评分预设 */
export function getPresets(): Promise<EvaluationPresetSummary[]> {
  return get<EvaluationPresetSummary[]>('/presets');
}

/** GET /presets/:id - 获取预设详情(含维度权重) */
export function getPreset(id: string): Promise<EvaluationPresetDetail> {
  return get<EvaluationPresetDetail>(`/presets/${id}`);
}

/** POST /presets/apply - 对已有分析结果应用预设权重重新计算 */
export function applyPreset(body: ApplyPresetRequest): Promise<ApplyPresetResponse> {
  return post<ApplyPresetResponse>('/presets/apply', body);
}
