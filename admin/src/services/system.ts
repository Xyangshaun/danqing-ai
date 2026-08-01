// ============================================================
// 系统管理 API
// 对应后端:/api/admin/system/*
// ============================================================

import { get, post, patch, del } from './request';
import type {
  ListAdminTenantsQuery,
  ListAdminTenantsResponse,
  CreateAdminTenantRequest,
  CreateAdminTenantResponse,
  UpdateAdminTenantRequest,
  UpdateAdminTenantResponse,
  ListAuditLogsQuery,
  ListAuditLogsResponse,
  ListApiKeysQuery,
  ListApiKeysResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  RevokeApiKeyResponse,
  AdminSystemHealth,
} from './types';

/** 租户列表 */
export function listTenants(params: ListAdminTenantsQuery): Promise<ListAdminTenantsResponse> {
  return get<ListAdminTenantsResponse>('/api/admin/system/tenants', params);
}

/** 创建租户 */
export function createTenant(data: CreateAdminTenantRequest): Promise<CreateAdminTenantResponse> {
  return post<CreateAdminTenantResponse>('/api/admin/system/tenants', data);
}

/** 更新租户 */
export function updateTenant(
  id: string,
  data: UpdateAdminTenantRequest,
): Promise<UpdateAdminTenantResponse> {
  return patch<UpdateAdminTenantResponse>(`/api/admin/system/tenants/${id}`, data);
}

/** 审计日志列表 */
export function listAuditLogs(params: ListAuditLogsQuery): Promise<ListAuditLogsResponse> {
  return get<ListAuditLogsResponse>('/api/admin/system/audit-logs', params);
}

/** API 密钥列表 */
export function listApiKeys(params: ListApiKeysQuery): Promise<ListApiKeysResponse> {
  return get<ListApiKeysResponse>('/api/admin/system/api-keys', params);
}

/** 创建 API 密钥(完整密钥仅返回一次) */
export function createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return post<CreateApiKeyResponse>('/api/admin/system/api-keys', data);
}

/** 吊销 API 密钥 */
export function revokeApiKey(id: string): Promise<RevokeApiKeyResponse> {
  return del<RevokeApiKeyResponse>(`/api/admin/system/api-keys/${id}`);
}

/** 系统健康检查 */
export function getSystemHealth(): Promise<AdminSystemHealth> {
  return get<AdminSystemHealth>('/api/admin/system/health');
}
