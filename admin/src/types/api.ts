// ============================================================
// 丹青有AI 管理后台 - API 类型定义
// 镜像后端 server/src/types/api-contract.ts 的管理后台相关契约
// 严格 TypeScript,所有字段显式类型,禁止 any
// ============================================================

/** ISO 8601 时间字符串 */
export type ISODateString = string;

/** 统一 API 响应包装 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  traceId: string;
}

/** 成功响应(data 非空) */
export interface ApiSuccess<T> extends ApiResponse<T> {
  code: 0;
  data: T;
}

/** 分页响应数据 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 分页查询参数 */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

// ============ 枚举/字面量类型 ============

export type UserRole = 'admin' | 'teacher' | 'student' | 'owner';
export type UserStatus = 'active' | 'locked' | 'deleted';
export type TenantType = 'school' | 'college' | 'class' | 'individual';
export type TenantPlan = 'free' | 'standard' | 'enterprise';
export type TenantStatus = 'active' | 'disabled';
export type ArtType = 'painting' | 'design' | 'product' | 'sculpture';
export type AnalysisStatus = 'pending' | 'processing' | 'success' | 'failed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';
export type ReviewAction = 'approve' | 'reject' | 'flag';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';
export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentProvider = 'stripe' | 'alipay' | 'wechat' | 'manual';
export type ApiKeyStatus = 'active' | 'revoked';
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'lock'
  | 'batch'
  | 'review'
  | 'cancel'
  | 'refund'
  | 'revoke'
  | 'login'
  | 'logout';

// ============ 认证 ============

export interface UserProfile {
  id: string;
  tenantId: string;
  feishuOpenId: string;
  feishuUnionId: string;
  name: string;
  avatar: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastLoginAt: ISODateString | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  type: TenantType;
  feishuTenantKey: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  maxSeats: number;
  parentId: string | null;
  createdAt: ISODateString;
  usedQuota?: number;
  maxQuota?: number;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  role: UserRole;
  joinedAt: ISODateString;
}

export interface AuthMeResponse {
  user: UserProfile;
  tenant: TenantInfo;
  memberships: TenantMembership[];
}

export interface FeishuAuthorizeResponse {
  authorizeUrl: string;
  state: string;
  redirectUri: string;
}

export interface FeishuCallbackQuery {
  code: string;
  state: string;
}

export interface FeishuCallbackResponse {
  accessToken: string;
  accessTokenExpiresAt: ISODateString;
  isFirstLogin: boolean;
  user: UserProfile;
  tenant: TenantInfo;
}

export interface AuthRefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: ISODateString;
}

export interface AuthLogoutResponse {
  revokedSessions: number;
}

// ============ 角色权限矩阵 ============

export interface AdminRoleInfo {
  role: UserRole;
  roleName: string;
  description: string;
  permissions: string[];
}

export type ListAdminRolesResponse = AdminRoleInfo[];

// ============ 用户管理 ============

export interface AdminUserListItem {
  id: string;
  tenantId: string;
  name: string;
  avatar: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: ISODateString;
  lastLoginAt: ISODateString | null;
  lockedAt: ISODateString | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  feishuOpenId: string;
  updatedAt: ISODateString;
  lockedBy: string | null;
}

export interface ListAdminUsersQuery extends PaginationQuery {
  search?: string;
  tenantId?: string;
  role?: UserRole;
  status?: UserStatus;
  startDate?: ISODateString;
  endDate?: ISODateString;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export type ListAdminUsersResponse = PaginatedData<AdminUserListItem>;

export interface UpdateAdminUserRequest {
  role?: UserRole;
  status?: UserStatus;
  name?: string;
}

export type UpdateAdminUserResponse = AdminUserDetail;

export interface LockAdminUserRequest {
  locked: boolean;
  reason?: string;
}

export interface LockAdminUserResponse {
  id: string;
  status: UserStatus;
  lockedAt: ISODateString | null;
}

export interface BatchAdminUsersRequest {
  userIds: string[];
  action: 'updateRole' | 'delete';
  role?: UserRole;
}

export interface BatchAdminUserResult {
  userId: string;
  success: boolean;
  error?: string;
}

export interface BatchAdminUsersResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchAdminUserResult[];
}

export interface UpdateAdminRoleRequest {
  permissions: string[];
}

export interface UpdateAdminRoleResponse {
  role: UserRole;
  permissions: string[];
}

// ============ 内容管理 ============

export interface AdminArtworkListItem {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  workType: ArtType;
  imageUrl: string;
  title: string | null;
  status: AnalysisStatus;
  reviewStatus: ReviewStatus;
  overallScore: number | null;
  createdAt: ISODateString;
  reviewedAt: ISODateString | null;
}

export interface ListAdminArtworksQuery extends PaginationQuery {
  tenantId?: string;
  userId?: string;
  workType?: ArtType;
  status?: AnalysisStatus;
  reviewStatus?: ReviewStatus;
  startDate?: ISODateString;
  endDate?: ISODateString;
  search?: string;
}

export type ListAdminArtworksResponse = PaginatedData<AdminArtworkListItem>;

export interface AdminArtworkDetail extends AdminArtworkListItem {
  remark: string | null;
  failureReason: string | null;
  durationMs: number | null;
  completedAt: ISODateString | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

export interface ReviewArtworkRequest {
  action: ReviewAction;
  note?: string;
}

export interface ReviewArtworkResponse {
  id: string;
  reviewStatus: ReviewStatus;
  reviewedAt: ISODateString;
  reviewedBy: string;
}

export interface DeleteAdminArtworkResponse {
  id: string;
  deleted: boolean;
}

export interface CreativeTemplateInfo {
  id: string;
  name: string;
  description: string | null;
  artType: ArtType;
  content: Record<string, unknown>;
  tags: string[];
  thumbnailUrl: string | null;
  enabled: boolean;
  sortOrder: number;
  createdById: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ListAdminTemplatesQuery extends PaginationQuery {
  artType?: ArtType;
  enabled?: boolean;
  search?: string;
}

export type ListAdminTemplatesResponse = PaginatedData<CreativeTemplateInfo>;

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  artType: ArtType;
  content: Record<string, unknown>;
  tags?: string[];
  thumbnailUrl?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export type CreateTemplateResponse = CreativeTemplateInfo;

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  content?: Record<string, unknown>;
  tags?: string[];
  thumbnailUrl?: string | null;
  enabled?: boolean;
  sortOrder?: number;
}

export type UpdateTemplateResponse = CreativeTemplateInfo;

export interface DeleteTemplateResponse {
  id: string;
  deleted: boolean;
}

// ============ 订阅管理 ============

export interface AdminSubscriptionListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  plan: TenantPlan;
  status: SubscriptionStatus;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  cancelAtPeriodEnd: boolean;
  amount: number;
  currency: string;
  seats: number;
  createdAt: ISODateString;
}

export interface ListAdminSubscriptionsQuery extends PaginationQuery {
  tenantId?: string;
  plan?: TenantPlan;
  status?: SubscriptionStatus;
  startDate?: ISODateString;
  endDate?: ISODateString;
}

export type ListAdminSubscriptionsResponse = PaginatedData<AdminSubscriptionListItem>;

export interface AdminSubscriptionDetail extends AdminSubscriptionListItem {
  paymentProvider: PaymentProvider | null;
  externalSubId: string | null;
  updatedAt: ISODateString;
}

export interface AdminCancelSubscriptionResponse {
  id: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  periodEnd: ISODateString;
}

export interface AdminRefundRequest {
  amount: number;
  reason: string;
  externalRefundId?: string;
}

export interface AdminRefundResponse {
  subscriptionId: string;
  invoiceId: string;
  refundedAmount: number;
  status: SubscriptionStatus;
}

export interface AdminInvoiceListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  paidAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface ListAdminInvoicesQuery extends PaginationQuery {
  tenantId?: string;
  status?: InvoiceStatus;
  startDate?: ISODateString;
  endDate?: ISODateString;
}

export type ListAdminInvoicesResponse = PaginatedData<AdminInvoiceListItem>;

export interface AdminInvoiceDetail extends AdminInvoiceListItem {
  paymentProvider: PaymentProvider | null;
  externalInvoiceId: string | null;
  description: string | null;
}

export interface AdminPlanInfo {
  plan: TenantPlan;
  name: string;
  maxQuota: number;
  maxSeats: number;
  price: number;
  currency: string;
  features: string[];
  recommended?: boolean;
  enabled: boolean;
}

export type ListAdminPlansResponse = AdminPlanInfo[];

export interface CreateAdminPlanRequest {
  plan: TenantPlan;
  name: string;
  maxQuota: number;
  maxSeats: number;
  price: number;
  currency?: string;
  features: string[];
  recommended?: boolean;
  enabled?: boolean;
}

export type CreateAdminPlanResponse = AdminPlanInfo;

export interface UpdateAdminPlanRequest {
  name?: string;
  maxQuota?: number;
  maxSeats?: number;
  price?: number;
  features?: string[];
  recommended?: boolean;
  enabled?: boolean;
}

export type UpdateAdminPlanResponse = AdminPlanInfo;

// ============ 数据看板 ============

export interface AdminStatsOverview {
  dau: number;
  mau: number;
  totalArtworks: number;
  todayAiCalls: number;
  totalTenants: number;
  totalUsers: number;
  todayNewUsers: number;
  todayNewArtworks: number;
  timestamp: ISODateString;
}

export interface AdminStatsGrowthQuery {
  granularity: 'day' | 'week' | 'month';
  startDate: ISODateString;
  endDate: ISODateString;
  metric?: 'users' | 'artworks' | 'aiCalls' | 'revenue';
}

export interface AdminGrowthDataPoint {
  date: ISODateString;
  count: number;
  cumulative: number;
}

export interface AdminStatsGrowthResponse {
  granularity: string;
  metric: string;
  dataPoints: AdminGrowthDataPoint[];
}

export interface AdminStatsRetentionQuery {
  startDate: ISODateString;
  endDate: ISODateString;
  period?: '7d' | '14d' | '30d';
}

export interface AdminRetentionDataPoint {
  date: ISODateString;
  registered: number;
  retained: number;
  retentionRate: number;
}

export interface AdminStatsRetentionResponse {
  period: string;
  dataPoints: AdminRetentionDataPoint[];
}

export interface AdminStatsAiCostQuery {
  startDate: ISODateString;
  endDate: ISODateString;
  groupBy?: 'day' | 'tenant' | 'model';
}

export interface AdminAiCostStat {
  dimension: string;
  callCount: number;
  successCount: number;
  failedCount: number;
  avgDurationMs: number;
  estimatedCost: number;
}

export interface AdminStatsAiCostResponse {
  groupBy: string;
  stats: AdminAiCostStat[];
  totalCost: number;
}

export interface AdminStatsRealtime {
  onlineUsers: number;
  todayAiCalls: number;
  pendingTasks: number;
  systemLoad: number;
  recentRequests: number;
  timestamp: ISODateString;
}

export interface AdminTenantStats {
  tenantId: string;
  tenantName: string;
  userCount: number;
  artworkCount: number;
  monthlyAiCalls: number;
  monthlyQuota: number;
  quotaUsageRate: number;
  usedSeats: number;
  maxSeats: number;
  plan: TenantPlan;
  last7dArtworks: number;
  avgScore: number;
}

// ============ 系统管理 ============

export interface AdminTenantListItem {
  id: string;
  name: string;
  type: TenantType;
  feishuTenantKey: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  maxSeats: number;
  parentId: string | null;
  createdAt: ISODateString;
  memberCount: number;
}

export interface ListAdminTenantsQuery extends PaginationQuery {
  search?: string;
  type?: TenantType;
  plan?: TenantPlan;
  status?: TenantStatus;
}

export type ListAdminTenantsResponse = PaginatedData<AdminTenantListItem>;

export interface CreateAdminTenantRequest {
  name: string;
  type: TenantType;
  plan?: TenantPlan;
  maxSeats?: number;
  parentId?: string;
  feishuTenantKey?: string;
}

export interface CreateAdminTenantResponse {
  id: string;
  name: string;
  type: TenantType;
  plan: TenantPlan;
  status: TenantStatus;
  maxSeats: number;
  createdAt: ISODateString;
}

export interface UpdateAdminTenantRequest {
  name?: string;
  plan?: TenantPlan;
  status?: TenantStatus;
  maxSeats?: number;
}

export type UpdateAdminTenantResponse = CreateAdminTenantResponse;

export interface AuditLogInfo {
  id: string;
  operatorId: string;
  operatorRole: string;
  operatorTenantId: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  targetTenantId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ip: string;
  userAgent: string;
  traceId: string | null;
  note: string | null;
  createdAt: ISODateString;
}

export interface ListAuditLogsQuery extends PaginationQuery {
  operatorId?: string;
  action?: AuditAction;
  resource?: string;
  resourceId?: string;
  targetTenantId?: string;
  startDate?: ISODateString;
  endDate?: ISODateString;
}

export type ListAuditLogsResponse = PaginatedData<AuditLogInfo>;

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  tenantId: string | null;
  scopes: string[];
  status: ApiKeyStatus;
  createdById: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  expiresAt: ISODateString | null;
  revokedAt: ISODateString | null;
  lastUsedAt: ISODateString | null;
}

export interface ListApiKeysQuery extends PaginationQuery {
  status?: ApiKeyStatus;
  tenantId?: string;
}

export type ListApiKeysResponse = PaginatedData<ApiKeyInfo>;

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  tenantId?: string;
  expiresAfterDays?: number | null;
}

export interface CreateApiKeyResponse extends ApiKeyInfo {
  plainKey: string;
}

export interface RevokeApiKeyResponse {
  id: string;
  status: ApiKeyStatus;
  revokedAt: ISODateString;
}

export interface AdminSystemHealth {
  status: 'up' | 'degraded' | 'down';
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    aiService: 'up' | 'down' | 'disabled';
  };
  uptime: number;
  memoryUsageMb: number;
  nodeVersion: string;
  timestamp: ISODateString;
}

// ============ 邀请码 / 批量导入(Phase 5)============

/** 邀请码信息 */
export interface AdminInvitationInfo {
  id: string;
  code: string;
  tenantId: string;
  role: UserRole;
  maxUses: number;
  usedCount: number;
  expiresAt: ISODateString;
  createdBy: string;
  createdAt: ISODateString;
}

export interface CreateAdminInvitationRequest {
  role: UserRole;
  maxUses: number;
  expiresHours: number;
}

export type CreateAdminInvitationResponse = AdminInvitationInfo;

export type ListAdminInvitationsResponse = AdminInvitationInfo[];

/** 批量导入学生单条数据 */
export interface BatchImportStudentItem {
  name: string;
  phone?: string;
  email?: string;
}

export interface BatchImportStudentsRequest {
  students: BatchImportStudentItem[];
  role?: UserRole;
}

export interface BatchImportStudentsResponse {
  imported: number;
  failed: { name: string; reason: string }[];
  invitationCodes: { name: string; code: string }[];
}
