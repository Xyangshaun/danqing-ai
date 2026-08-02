// ============================================================
// 请求层(axios 实例 + 拦截器)
// - 请求拦截:自动注入 Authorization + X-Client: admin
// - 响应拦截:解包 { code, data, message } → 返回 data
// - 错误处理:401 跳登录 / 403 提示无权限 / 429 提示限流
// - 401 单次刷新(走 /api/v1/auth/refresh,refresh_token 在 HttpOnly Cookie)
// ============================================================

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { message as antdMessage } from 'antd';
import type { ApiResponse } from '@/types/api';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  isTokenExpired,
} from '@/utils/auth';

/** 客户端标识头(管理后台) */
const X_CLIENT = 'admin';

/** axios 实例 */
const instance: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30_000,
  headers: {
    'X-Client': X_CLIENT,
    'Content-Type': 'application/json',
  },
});

/** 是否正在刷新 token(防并发刷新) */
let isRefreshing = false;
/** 等待刷新完成的请求队列 */
let pendingQueue: Array<() => void> = [];

/** 触发 token 刷新(单飞) */
async function triggerRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // 已有刷新在进行,等待
    await new Promise<void>((resolve) => {
      pendingQueue.push(resolve);
    });
    return !isTokenExpired();
  }
  isRefreshing = true;
  try {
    const res = await axios.post<ApiResponse<{ accessToken: string; accessTokenExpiresAt: string }>>(
      '/api/v1/auth/refresh',
      undefined,
      { headers: { 'X-Client': X_CLIENT }, timeout: 10_000 },
    );
    if (res.data?.code === 0 && res.data.data) {
      setAccessToken(res.data.data.accessToken, res.data.data.accessTokenExpiresAt);
      // 唤醒队列
      pendingQueue.forEach((fn) => fn());
      pendingQueue = [];
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

/** 跳转登录(清 token + 跳转) */
function redirectToLogin(): void {
  clearAccessToken();
  // 避免在登录页循环跳转
  const pathname = window.location.pathname;
  if (pathname !== '/login' && pathname !== '/auth/feishu/callback') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }
}

// ============ 请求拦截 ============
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    // 确保客户端标识存在
    if (!config.headers.get('X-Client')) {
      config.headers.set('X-Client', X_CLIENT);
    }
    return config;
  },
  (err) => Promise.reject(err),
);

// ============ 响应拦截 ============
instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const body = response.data;
    // 非 JSON / 文件流:直接返回原始响应(导出 CSV 场景)
    if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
      return response;
    }
    // 业务成功
    if (body.code === 0) {
      return response;
    }
    // 业务错误(非 2xx 业务码):转交错误处理
    return Promise.reject(new BizError(body.code, body.message, body.traceId));
  },
  async (error) => {
    if (!axios.isCancel(error) && error.response) {
      const { status, data } = error.response;
      const bizCode = data?.code;
      const bizMsg = data?.message;

      // 401:尝试刷新 token,失败则跳登录
      if (status === 401 || bizCode === 2001) {
        const ok = await triggerRefresh();
        if (ok) {
          // 重放原请求
          const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
          if (!original._retried) {
            original._retried = true;
            const token = getAccessToken();
            if (token) {
              original.headers.set('Authorization', `Bearer ${token}`);
            }
            return instance(original);
          }
        }
        redirectToLogin();
        return Promise.reject(new BizError(2001, bizMsg ?? '未授权,请重新登录', data?.traceId));
      }

      // 403:无权限(对应 ErrorCode.FORBIDDEN = 2004)
      if (status === 403 || bizCode === 2004) {
        antdMessage.error(bizMsg ?? '无权限执行此操作');
        return Promise.reject(new BizError(2004, bizMsg ?? '无权限', data?.traceId));
      }

      // 429:限流(对应 ErrorCode.RATE_LIMITED = 9005)
      if (status === 429 || bizCode === 9005) {
        antdMessage.warning(bizMsg ?? '请求过于频繁,请稍后再试');
        return Promise.reject(new BizError(9005, bizMsg ?? '限流', data?.traceId));
      }

      // 其他业务错误
      if (bizCode !== undefined) {
        antdMessage.error(bizMsg ?? '请求失败');
        return Promise.reject(new BizError(bizCode, bizMsg ?? '请求失败', data?.traceId));
      }
      // HTTP 错误无业务体
      antdMessage.error(`网络错误(${status})`);
    } else if (error.request) {
      antdMessage.error('网络连接失败,请检查网络');
    }
    return Promise.reject(error);
  },
);

/** 业务错误类 */
export class BizError extends Error {
  code: number;
  traceId?: string;
  constructor(code: number, message: string, traceId?: string) {
    super(message);
    this.name = 'BizError';
    this.code = code;
    this.traceId = traceId;
  }
}

/** 通用请求方法:返回解包后的 data */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await instance.request<ApiResponse<T>>(config);
  // 文件流场景(无 code):返回原始数据
  const body = res.data as ApiResponse<T>;
  if (typeof body?.code !== 'number') {
    return body as unknown as T;
  }
  return body.data as T;
}

/** GET */
export function get<T>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ method: 'GET', url, params, ...config });
}

/** POST */
export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ method: 'POST', url, data, ...config });
}

/** PATCH */
export function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ method: 'PATCH', url, data, ...config });
}

/** DELETE */
export function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ method: 'DELETE', url, ...config });
}

/** 原始请求(用于流式下载,返回 AxiosResponse) */
export function rawRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
  return instance.request(config);
}

export default instance;
