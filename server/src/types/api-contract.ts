// ============================================================
// 丹青有AI - API 契约 TypeScript 类型(跨端共享主副本)
// 对应文档:.trae/documents/api-contract-v1.md 第 3 节
// 严格 TypeScript,禁止 any;所有字段显式类型
// 跨端同步:Web/Mobile/Admin 通过 sync 脚本同步本文件
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
  INTERNAL_ERROR = 9001,
  DATABASE_ERROR = 9002,
  CACHE_ERROR = 9003,
  UPSTREAM_UNAVAILABLE = 9004,
  RATE_LIMITED = 9005,
}

/**
 * 错误码 → HTTP 状态码映射
 * 后端 utils/response.ts 中 error() 函数据此选择默认 HTTP 状态
 */
export const ERROR_HTTP_STATUS: Readonly<Record<number, number>> = Object.freeze({
  [ErrorCode.SUCCESS]: 200,
  [ErrorCode.PARAM_INVALID]: 400,
  [ErrorCode.PARAM_MISSING]: 400,
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,
  [ErrorCode.PARAM_TYPE_MISMATCH]: 400,
  [ErrorCode.DUPLICATE_RESOURCE]: 409,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.REFRESH_TOKEN_INVALID]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_SIGNATURE_INVALID]: 401,
  [ErrorCode.TENANT_NOT_FOUND]: 404,
  [ErrorCode.TENANT_DISABLED]: 403,
  [ErrorCode.TENANT_SEATS_FULL]: 403,
  [ErrorCode.TENANT_MISMATCH]: 403,
  [ErrorCode.FEISHU_AUTH_FAILED]: 400,
  [ErrorCode.FEISHU_TOKEN_EXCHANGE_FAILED]: 502,
  [ErrorCode.FEISHU_USER_INFO_FAILED]: 502,
  [ErrorCode.FEISHU_APP_CONFIG_ERROR]: 500,
  [ErrorCode.FILE_UPLOAD_FAILED]: 400,
  [ErrorCode.FILE_TYPE_UNSUPPORTED]: 400,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.FILE_EMPTY]: 400,
  [ErrorCode.ANALYSIS_QUOTA_EXCEEDED]: 402,
  [ErrorCode.ANALYSIS_TIMEOUT]: 408,
  [ErrorCode.ANALYSIS_RESULT_FAILED]: 500,
  [ErrorCode.ANALYSIS_NOT_FOUND]: 404,
  [ErrorCode.ANALYSIS_IMAGE_INVALID]: 400,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.CACHE_ERROR]: 503,
  [ErrorCode.UPSTREAM_UNAVAILABLE]: 502,
  [ErrorCode.RATE_LIMITED]: 429,
});

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

// ============ 3.7 艺术品知识库相关类型 ============

/** 艺术品分类(比 ArtType 多 calligraphy/architecture 两类,用于知识库检索) */
export type ArtworkCategory =
  | 'painting'
  | 'design'
  | 'product'
  | 'sculpture'
  | 'calligraphy'
  | 'architecture';

/** 艺术品地域 */
export type ArtworkRegion = 'china' | 'east-asia' | 'europe' | 'america' | 'other';

/** 艺术品条目(对齐前端 src/services/artworksDatabase.ts 的 ArtworkItem) */
export interface ArtworkItem {
  id: string;
  title: string;
  titleEn?: string;
  artist: string;
  artistEn?: string;
  year: string;
  category: ArtworkCategory;
  style: string;
  era: string;
  region: ArtworkRegion;
  description: string;
  imageUrl: string;
  thumbUrl?: string;
  source: string;
  sourceUrl?: string;
  tags: string[];
  dimensions?: string;
  medium?: string;
}

/** 单个分类的风格/时代/题材配置 */
export interface StyleCategoryEntry {
  name: string;
  styles: string[];
  eras: string[];
  subjects: string[];
}

/** 风格分类配置(键为 ArtType 四类,值为对应分类配置) */
export type StyleCategories = Record<ArtType, StyleCategoryEntry>;

/** 艺术品分页查询响应 */
export type PaginatedArtworks = PaginatedData<ArtworkItem>;
