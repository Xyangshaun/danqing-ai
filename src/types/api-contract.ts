// ============================================================
// 丹青有AI - API 契约 TypeScript 类型(前端同步副本)
// 真相源:server/src/types/api-contract.ts(由后端维护)
// 对应文档:.trae/documents/api-contract-v1.md 第 3 节
// 严格 TypeScript,禁止 any;所有字段显式类型
// 同步规则:前端只读,禁止本地修改;如需新增字段提 issue 至 product-architect 仲裁
// ============================================================

// ============ 3.1 通用类型 ============

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

/** 错误响应(data 为 null) */
export interface ApiError extends ApiResponse<null> {
  data: null;
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
  page?: number;      // 默认 1
  pageSize?: number;  // 默认 20,最大 100
}

/** 预设风格 */
export type PresetStyle = 'academic' | 'artist' | 'academy' | 'applied' | 'custom';

/** 预设适用阶段 */
export type PresetStage = 'basic' | 'foundation' | 'advanced' | 'creative';

/** 评分维度项(预设内一项) */
export interface PresetDimension {
  key: string;
  label: string;
  labelEn: string;
  weight: number;
}

/** 客户端标识 */
export type ClientType = 'web' | 'admin' | 'mobile' | 'marketing';

/** ISO 8601 时间字符串 */
export type ISODateString = string;

// ============ 3.2 错误码枚举 ============

/** 业务错误码枚举(与错误码表保持一致) */
export enum ErrorCode {
  SUCCESS = 0,
  PARAM_INVALID = 1001,
  PARAM_MISSING = 1002,
  RESOURCE_NOT_FOUND = 1003,
  PARAM_TYPE_MISMATCH = 1004,
  DUPLICATE_RESOURCE = 1005,
  UNAUTHORIZED = 2001,
  TOKEN_EXPIRED = 2002,
  REFRESH_TOKEN_INVALID = 2003,
  FORBIDDEN = 2004,
  TOKEN_SIGNATURE_INVALID = 2005,
  TENANT_NOT_FOUND = 3001,
  TENANT_DISABLED = 3002,
  TENANT_SEATS_FULL = 3003,
  TENANT_MISMATCH = 3004,
  FEISHU_AUTH_FAILED = 4001,
  FEISHU_TOKEN_EXCHANGE_FAILED = 4002,
  FEISHU_USER_INFO_FAILED = 4003,
  FEISHU_APP_CONFIG_ERROR = 4004,
  FILE_UPLOAD_FAILED = 5001,
  FILE_TYPE_UNSUPPORTED = 5002,
  FILE_TOO_LARGE = 5003,
  FILE_EMPTY = 5004,
  ANALYSIS_QUOTA_EXCEEDED = 6001,
  ANALYSIS_TIMEOUT = 6002,
  ANALYSIS_RESULT_FAILED = 6003,
  ANALYSIS_NOT_FOUND = 6004,
  ANALYSIS_IMAGE_INVALID = 6005,
  // 实时图片搜索(详见 docs/realtime-image-search-solution.md)
  IMAGE_NOT_FOUND = 8104,
  INTERNAL_ERROR = 9001,
  DATABASE_ERROR = 9002,
  CACHE_ERROR = 9003,
  UPSTREAM_UNAVAILABLE = 9004,
  RATE_LIMITED = 9005,
}

// ============ 3.3 认证相关类型 ============

/** GET /auth/feishu/authorize 响应 */
export interface FeishuAuthorizeResponse {
  /** 飞书授权页完整 URL,前端直接 location.href 跳转 */
  authorizeUrl: string;
  /** 后端生成的 state,用于 callback 时校验 CSRF */
  state: string;
  /** 客户端传入的 redirect_uri,原样回显 */
  redirectUri: string;
}

/** GET /auth/feishu/callback 请求参数 */
export interface FeishuCallbackQuery {
  /** 飞书返回的授权码 */
  code: string;
  /** 后端在 authorize 阶段生成的 state */
  state: string;
}

/** GET /auth/feishu/callback 响应 */
export interface FeishuCallbackResponse {
  /** JWT access_token,前端存内存(不存 localStorage) */
  accessToken: string;
  /** access_token 过期时间(ISO 8601) */
  accessTokenExpiresAt: ISODateString;
  /** 是否为首次登录(用于前端引导新手流程) */
  isFirstLogin: boolean;
  /** 当前用户信息 */
  user: UserProfile;
  /** 当前激活租户信息 */
  tenant: TenantInfo;
}

/** POST /auth/refresh 响应 */
export interface AuthRefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: ISODateString;
}

/** POST /auth/logout 请求体(可选) */
export interface AuthLogoutRequest {
  revokeAll?: boolean;
}

/** POST /auth/logout 响应 */
export interface AuthLogoutResponse {
  /** 撤销的会话数 */
  revokedSessions: number;
}

/** GET /auth/me 响应 */
export interface AuthMeResponse {
  user: UserProfile;
  tenant: TenantInfo;
  /** 当前用户在所有租户中的成员关系(用于切换租户) */
  memberships: TenantMembership[];
}

// ============ 3.4 用户与租户类型 ============

/** 用户角色(租户内角色) */
export type UserRole = 'admin' | 'teacher' | 'student' | 'owner';

/** 用户资料(完整) */
export interface UserProfile {
  id: string;
  /** 当前激活租户 ID */
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

/** PATCH /users/profile 请求 */
export interface UpdateProfileRequest {
  name?: string;
  avatar?: string;
  email?: string | null;
  phone?: string | null;
}

/** GET /users/profile 响应(等同 UserProfile) */
export type GetProfileResponse = UserProfile;

/** PATCH /users/profile 响应(返回更新后的完整资料) */
export type UpdateProfileResponse = UserProfile;

/**
 * PATCH /users/role 请求
 * 用于首次登录后的新手引导(onboarding)选择职业身份。
 * 业务规则(后端强制):
 *   - 仅允许当前 role='student'(首次登录默认角色)的用户自选一次
 *   - 已选过(已切换到 teacher/admin)的账户无法再次自选,需管理员介入
 *   - 不允许选 'owner'(owner 由系统在创建个人租户时隐式赋值)
 */
export interface UpdateRoleRequest {
  role: 'admin' | 'teacher' | 'student';
}

/** PATCH /users/role 响应(返回更新后的完整资料) */
export type UpdateRoleResponse = UserProfile;

/** 租户类型 */
export type TenantType = 'school' | 'college' | 'class' | 'individual';

/** 订阅计划 */
export type TenantPlan = 'free' | 'standard' | 'enterprise';

/** 租户状态 */
export type TenantStatus = 'active' | 'disabled';

/** 租户信息 */
export interface TenantInfo {
  id: string;
  name: string;
  type: TenantType;
  feishuTenantKey: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  maxSeats: number;
  /** 父租户 ID(层级关系,class→college→school) */
  parentId: string | null;
  createdAt: ISODateString;
  /** 当月已用分析次数(仅 current 接口返回) */
  usedQuota?: number;
  /** 当月分析配额上限(仅 current 接口返回,-1 表示无限) */
  maxQuota?: number;
}

/** GET /tenants/current 响应 */
export type GetCurrentTenantResponse = TenantInfo;

/** POST /tenants/switch 请求 */
export interface SwitchTenantRequest {
  tenantId: string;
}

/** POST /tenants/switch 响应(返回新 access_token) */
export interface SwitchTenantResponse {
  accessToken: string;
  accessTokenExpiresAt: ISODateString;
  tenant: TenantInfo;
}

/** 用户在某租户中的成员关系 */
export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  role: UserRole;
  joinedAt: ISODateString;
}

// ============ 3.5 AI 分析相关类型 ============

/** 艺术作品类型(四类) */
export type ArtType = 'painting' | 'design' | 'product' | 'sculpture';

/** 分析任务状态 */
export type AnalysisStatus = 'pending' | 'processing' | 'success' | 'failed';

/** 提交分析任务请求 */
export interface CreateAnalysisRequest {
  /** 作品类型 */
  artType: ArtType;
  /** 图片 URL(若已上传)与 imageFile 二选一 */
  imageUrl?: string;
  /** 作品标题(可选) */
  title?: string;
  /** 备注(可选,如教师布置的作业要求) */
  remark?: string;
}

/** 提交分析任务响应(同步模式返回完整结果,异步模式仅返回 id+status) */
export interface CreateAnalysisResponse {
  id: string;
  status: AnalysisStatus;
  /** 同步模式且成功时返回完整结果;异步模式为 null */
  result: AnalysisDetail | null;
  /** 分析耗时(毫秒),异步模式为 null */
  durationMs: number | null;
}

/** 分析详情(完整结果) */
export interface AnalysisDetail {
  id: string;
  tenantId: string;
  userId: string;
  workType: ArtType;
  imageUrl: string;
  title: string | null;
  remark: string | null;
  status: AnalysisStatus;
  /** 分析结果 JSON(成功时非空),结构与 workType 对应 */
  result: AnalysisResult | null;
  /** 失败原因(status=failed 时非空) */
  failureReason: string | null;
  durationMs: number | null;
  createdAt: ISODateString;
  completedAt: ISODateString | null;
}

/** 分析历史列表项(精简) */
export interface AnalysisListItem {
  id: string;
  workType: ArtType;
  imageUrl: string;
  title: string | null;
  status: AnalysisStatus;
  overallScore: number | null;
  createdAt: ISODateString;
}

/** GET /analyses 查询参数 */
export interface ListAnalysesQuery extends PaginationQuery {
  /** 按作品类型筛选 */
  artType?: ArtType;
  /** 按状态筛选 */
  status?: AnalysisStatus;
  /** 起始时间(ISO 8601) */
  startDate?: ISODateString;
  /** 结束时间(ISO 8601) */
  endDate?: ISODateString;
  /** 按用户筛选(教师查看班级学生时使用) */
  userId?: string;
}

/** GET /analyses 响应 */
export type ListAnalysesResponse = PaginatedData<AnalysisListItem>;

/** GET /analyses/:id 响应 */
export type GetAnalysisResponse = AnalysisDetail;

// ============ 3.6 分析结果类型(对齐现有 src/types/index.ts) ============

/** 焦点坐标 */
export interface FocusPoint {
  x: number;
  y: number;
}

/** 原创性维度(所有作品类型共享) */
export interface OriginalityDimension {
  score: number;
  /** 与网络图片相似度(0-1) */
  similarity: number;
  creativityLevel: 'excellent' | 'good' | 'average' | 'needsWork';
  suggestion: string;
}

/** 绘画类分析维度 */
export interface PaintingAnalysis {
  type: 'painting';
  composition: {
    score: number;
    focusPoint: FocusPoint;
    balance: 'balanced' | 'left-heavy' | 'right-heavy' | 'top-heavy' | 'bottom-heavy';
    guideline: 'good' | 'average' | 'poor';
    whitespaceRatio: number;
    symmetry: number;
    suggestion: string;
    heatmapData: number[][];
  };
  color: {
    score: number;
    warmRatio: number;
    coolRatio: number;
    contrast: 'high' | 'medium' | 'low';
    saturation: 'high' | 'medium' | 'low';
    richness: 'rich' | 'moderate' | 'limited';
    harmony: string;
    dominantColor: string;
    suggestion: string;
  };
  brushwork: {
    score: number;
    textureLevel: 'rich' | 'moderate' | 'simple';
    strokeVariety: number;
    wetDryBalance: string;
    suggestion: string;
  };
}

/** 设计类分析维度 */
export interface DesignAnalysis {
  type: 'design';
  visualHierarchy: {
    score: number;
    focusPoint: FocusPoint;
    primarySecondaryClarity: 'clear' | 'moderate' | 'unclear';
    informationFlow: 'good' | 'average' | 'poor';
    heatmapData: number[][];
    suggestion: string;
  };
  typography: {
    score: number;
    alignmentQuality: 'good' | 'average' | 'poor';
    rhythmConsistency: 'good' | 'average' | 'poor';
    negativeSpaceUsage: 'good' | 'average' | 'poor';
    gridAdherence: number;
    suggestion: string;
  };
  colorApplication: {
    score: number;
    contrast: 'high' | 'medium' | 'low';
    brandConsistency: 'strong' | 'moderate' | 'weak';
    colorPsychology: string;
    paletteHarmony: string;
    suggestion: string;
  };
}

/** 产品设计类分析维度 */
export interface ProductAnalysis {
  type: 'product';
  form: {
    score: number;
    focusPoint: FocusPoint;
    proportionBalance: 'good' | 'average' | 'poor';
    lineFluidity: 'smooth' | 'moderate' | 'stiff';
    surfaceQuality: 'excellent' | 'good' | 'average';
    ergonomicsHint: 'strong' | 'moderate' | 'weak';
    heatmapData: number[][];
    suggestion: string;
  };
  materialExpression: {
    score: number;
    textureRealism: 'high' | 'medium' | 'low';
    lightShadowPerformance: 'excellent' | 'good' | 'average';
    surfaceTreatment: 'refined' | 'moderate' | 'rough';
    suggestion: string;
  };
  functionExpression: {
    score: number;
    structureClarity: 'clear' | 'moderate' | 'unclear';
    functionImplication: 'strong' | 'moderate' | 'weak';
    detailRefinement: 'excellent' | 'good' | 'average';
    suggestion: string;
  };
}

/** 雕塑类分析维度 */
export interface SculptureAnalysis {
  type: 'sculpture';
  spatialComposition: {
    score: number;
    focusPoint: FocusPoint;
    volumeSense: 'strong' | 'moderate' | 'weak';
    spaceOccupation: 'full' | 'moderate' | 'sparse';
    voidSolidRelation: 'harmonious' | 'moderate' | 'imbalanced';
    heatmapData: number[][];
    suggestion: string;
  };
  bodyLanguage: {
    score: number;
    dynamicSense: 'strong' | 'moderate' | 'static';
    tensionExpression: 'high' | 'medium' | 'low';
    rhythmFlow: 'fluent' | 'moderate' | 'stiff';
    suggestion: string;
  };
  materialLanguage: {
    score: number;
    materialCharacter: 'distinct' | 'moderate' | 'obscure';
    textureExpression: 'rich' | 'moderate' | 'simple';
    qualityLayering: 'rich' | 'moderate' | 'simple';
    suggestion: string;
  };
}

/** 分析结果联合类型(workType 决定具体分支) */
export type DimensionResult =
  | PaintingAnalysis
  | DesignAnalysis
  | ProductAnalysis
  | SculptureAnalysis;

/** 完整分析结果(对应 AnalysisDetail.result) */
export interface AnalysisResult {
  /** 作品类型(与 DimensionResult.type 一致,便于前端 narrowing) */
  artType: ArtType;
  dimensions: DimensionResult;
  originality: OriginalityDimension;
  /** 综合评分(0-100) */
  overallScore: number;
}

// ============ 3.7 评分预设相关类型(Phase 5, 从后端同步) ============

/** GET /presets 响应项(精简) */
export interface EvaluationPresetSummary {
  id: string;
  name: string;
  description: string | null;
  styleType: PresetStyle;
  artType: ArtType;
  applicableStage: PresetStage;
  isBuiltIn: boolean;
  isPrivate: boolean;
  forkedFromId: string | null;
  creatorId: string | null;
  enabled: boolean;
  sortOrder: number;
}

/** GET /presets/:id 响应(完整) */
export interface EvaluationPresetDetail extends EvaluationPresetSummary {
  dimensions: PresetDimension[];
  rationale: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** POST /presets/apply 请求体 */
export interface ApplyPresetRequest {
  analysisId: string;
  presetId: string;
}

/** POST /presets/apply 响应 */
export interface ApplyPresetResponse {
  /** 按预设权重重算后的加权总分 */
  weightedScore: number;
  /** 各维度加权明细 */
  weightedDimensions: {
    key: string;
    label: string;
    originalScore: number;
    weight: number;
    weightedContribution: number;
  }[];
  /** 使用的预设信息 */
  appliedPreset: EvaluationPresetSummary;
}

// ============ 3.13 通知系统类型(任务包 B:从后端同步) ============
//
// 对应 API:
//   GET    /notifications                通知列表(游标分页)
//   GET    /notifications/unread-count   未读计数
//   PATCH  /notifications/:id/read       单条标记已读
//   POST   /notifications/read-all       全部标记已读
//
// 多租户强制:每条通知归属 (tenantId, userId),查询必带两者过滤

/** 通知类型 */
export type NotificationType =
  | 'SYSTEM'
  | 'ANALYSIS_DONE'
  | 'ANALYSIS_FAIL'
  | 'REVIEW'
  | 'SUBSCRIPTION'
  | 'INVITATION';

/** 通知级别 */
export type NotificationLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';

/** 通知条目 */
export interface Notification {
  id: string;
  /** 租户 ID(多租户隔离) */
  tenantId: string;
  /** 接收者用户 ID */
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  level: NotificationLevel;
  /** 点击跳转的相对路径(可选) */
  linkUrl?: string | null;
  /** 附加数据(如关联 analysisId / presetId 等) */
  metadata?: Record<string, unknown> | null;
  /** 已读时间(ISO 8601),null 表示未读 */
  readAt: ISODateString | null;
  /** 创建时间(ISO 8601) */
  createdAt: ISODateString;
}

/** GET /notifications 查询参数 */
export interface ListNotificationsQuery {
  /** 每页数量,默认 20,最大 50 */
  limit?: number;
  /** 游标(上一页最后一项的 createdAt+id 编码) */
  cursor?: string;
  /** 仅未读 */
  onlyUnread?: boolean;
}

/** GET /notifications 响应(游标分页) */
export interface NotificationListResponse {
  items: Notification[];
  /** 下一页游标,null 表示无更多数据 */
  nextCursor: string | null;
}

/** GET /notifications/unread-count 响应 */
export interface UnreadCountResponse {
  count: number;
}

/** PATCH /notifications/:id/read 响应(返回更新后的通知) */
export type MarkNotificationReadResponse = Notification;

/** POST /notifications/read-all 响应 */
export interface MarkAllNotificationsReadResponse {
  /** 本次标记已读的条数 */
  count: number;
}

// ============ 3.14 实时图片搜索类型(从后端同步) ============
//
// 对应 API:
//   GET    /images/search      图片搜索(全文检索 + 字段加权 + 多租户隔离)
//   GET    /images/suggest     关键词联想补全
//   GET    /images/:id         图片详情
//   POST   /images             创建图片条目(仅 ADMIN/OWNER)
//   PATCH  /images/:id         更新图片条目(仅 ADMIN/OWNER)
//   DELETE /images/:id         删除图片条目(仅 ADMIN/OWNER)
//
// 设计要点:
//   - 内存倒排索引(中文二元分词 + 字段加权 title×5 / tags×4 / category×2)
//   - 多租户隔离 + 角色权限强制(student 仅可见 published)
//   - 搜索延迟 ≤300ms,前端防抖 200ms + AbortController 取消竞态

/** 图片条目状态 */
export type ImageStatus = 'published' | 'draft' | 'archived';

/** 图片文档(元数据 + 缩略图/原图 URL) */
export interface ImageDoc {
  id: string;
  tenantId: string;
  /** 标题 */
  title: string;
  /** 标签列表 */
  tags: string[];
  /** 分类(如 绘画基础 / 色彩理论) */
  category: string;
  /** 状态 */
  status: ImageStatus;
  /** 缩略图 URL(搜索结果网格使用) */
  thumbUrl: string;
  /** 原图 URL(详情页使用) */
  fullUrl: string;
  /** 元信息(宽高/体积) */
  meta: {
    width: number;
    height: number;
    size: number;
  };
  /** 创建人 ID */
  createdById: string;
  /** 最后更新人 ID */
  updatedById: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** 全文检索相关性分数(仅搜索接口返回,0-1) */
  score?: number;
}

/** GET /images/search 查询参数 */
export interface ImageSearchQuery extends PaginationQuery {
  /** 关键词(全文检索) */
  q?: string;
  /** 标签筛选(逗号分隔,AND 语义) */
  tags?: string;
  /** 分类筛选 */
  category?: string;
  /** 作品类型筛选 */
  artType?: ArtType;
  /** 状态筛选(默认 published) */
  status?: ImageStatus;
}

/** GET /images/search 响应(分页) */
export type ImageSearchResponse = PaginatedData<ImageDoc>;

/** GET /images/suggest 查询参数 */
export interface ImageSuggestQuery {
  /** 前缀关键词(≥1 字符触发) */
  q: string;
  /** 返回条数上限,默认 8,最大 20 */
  limit?: number;
}

/** GET /images/suggest 响应 */
export interface ImageSuggestResponse {
  /** 联想补全候选词列表 */
  suggestions: string[];
}

/** GET /images/:id 响应 */
export type GetImageResponse = ImageDoc;

/** POST /images 请求体(创建图片条目) */
export interface CreateImageRequest {
  title: string;
  tags?: string[];
  category: string;
  artType?: ArtType | null;
  status?: ImageStatus;
  thumbUrl: string;
  fullUrl: string;
  meta?: {
    width: number;
    height: number;
    size: number;
  };
}

/** POST /images 响应 */
export type CreateImageResponse = ImageDoc;

/** PATCH /images/:id 请求体(部分更新) */
export interface UpdateImageRequest {
  title?: string;
  tags?: string[];
  category?: string;
  artType?: ArtType | null;
  status?: ImageStatus;
  thumbUrl?: string;
  fullUrl?: string;
  meta?: {
    width: number;
    height: number;
    size: number;
  };
}

/** PATCH /images/:id 响应 */
export type UpdateImageResponse = ImageDoc;

/** DELETE /images/:id 响应 */
export interface DeleteImageResponse {
  id: string;
  deleted: boolean;
}

// ============ 3.17 AI 图像生成(灵感嫁接 / 情绪画布真实生成) ============

export type GenerationStatus = 'pending' | 'processing' | 'success' | 'failed';
export type GenerationInputType = 'text' | 'sketch';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

/** 单张生成结果 */
export interface GeneratedImage {
  imageUrl: string;
  reviewStatus: ReviewStatus;
}

/** POST /api/v1/generation 响应 */
export interface CreateGenerationResponse {
  taskId: string;
  status: GenerationStatus;
  images: GeneratedImage[] | null;
}
