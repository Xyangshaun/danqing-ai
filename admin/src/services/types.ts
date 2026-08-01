// ============================================================
// services 类型聚合(从 @/types/api 重导出,便于 service 层引用)
// ============================================================

export type {
  // 用户
  ListAdminUsersQuery,
  ListAdminUsersResponse,
  AdminUserListItem,
  AdminUserDetail,
  UpdateAdminUserRequest,
  UpdateAdminUserResponse,
  LockAdminUserRequest,
  LockAdminUserResponse,
  BatchAdminUsersRequest,
  BatchAdminUsersResponse,
  ListAdminRolesResponse,
  AdminRoleInfo,
  UpdateAdminRoleRequest,
  UpdateAdminRoleResponse,
  // 内容
  ListAdminArtworksQuery,
  ListAdminArtworksResponse,
  AdminArtworkListItem,
  AdminArtworkDetail,
  ReviewArtworkRequest,
  ReviewArtworkResponse,
  DeleteAdminArtworkResponse,
  ListAdminTemplatesQuery,
  ListAdminTemplatesResponse,
  CreativeTemplateInfo,
  CreateTemplateRequest,
  CreateTemplateResponse,
  UpdateTemplateRequest,
  UpdateTemplateResponse,
  DeleteTemplateResponse,
  // 订阅
  ListAdminSubscriptionsQuery,
  ListAdminSubscriptionsResponse,
  AdminSubscriptionListItem,
  AdminSubscriptionDetail,
  AdminCancelSubscriptionResponse,
  AdminRefundRequest,
  AdminRefundResponse,
  ListAdminInvoicesQuery,
  ListAdminInvoicesResponse,
  AdminInvoiceListItem,
  AdminInvoiceDetail,
  ListAdminPlansResponse,
  AdminPlanInfo,
  CreateAdminPlanRequest,
  CreateAdminPlanResponse,
  UpdateAdminPlanRequest,
  UpdateAdminPlanResponse,
  // 看板
  AdminStatsOverview,
  AdminStatsGrowthQuery,
  AdminStatsGrowthResponse,
  AdminStatsRetentionQuery,
  AdminStatsRetentionResponse,
  AdminStatsAiCostQuery,
  AdminStatsAiCostResponse,
  AdminStatsRealtime,
  AdminTenantStats,
  // 系统
  ListAdminTenantsQuery,
  ListAdminTenantsResponse,
  AdminTenantListItem,
  CreateAdminTenantRequest,
  CreateAdminTenantResponse,
  UpdateAdminTenantRequest,
  UpdateAdminTenantResponse,
  ListAuditLogsQuery,
  ListAuditLogsResponse,
  AuditLogInfo,
  ListApiKeysQuery,
  ListApiKeysResponse,
  ApiKeyInfo,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  RevokeApiKeyResponse,
  AdminSystemHealth,
} from '@/types/api';

/** GET /api/admin/users/export 查询参数(无分页) */
export interface ExportAdminUsersQueryLike {
  fields?: string;
  search?: string;
  tenantId?: string;
  role?: 'admin' | 'teacher' | 'student' | 'owner';
  status?: 'active' | 'locked' | 'deleted';
}
