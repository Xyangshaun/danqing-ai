# 丹青有AI - 新功能设计文档

> **模块**:自定义评分预设 + 多评委争议仲裁 + 多租户认证扩展
> **日期**:2026-07-30
> **状态**:待审阅(审阅通过后实施代码)
> **依据**:[art-evaluation-research.md](./art-evaluation-research.md) + [art-evaluation-standards.md](./art-evaluation-standards.md)
> **约束**:TypeScript strict、禁 any、分层架构、Prisma 迁移、Vitest 测试、3 秒 SLA、多租户隔离

---

## 0. 需求澄清结论

| 需求 | 澄清结论 |
|---|---|
| 评分争议机制 | **多评委争议仲裁**:多名评委(教授/讲师/AI)对同一作品评分不一致时触发,按预设权重加权裁定 |
| 认证扩展 | **扩展飞书 + 手机号/邀请码 + 院校管理员账号**:保留飞书 OAuth,新增手机 OTP、邀请码加入租户、院校管理员独立账号(可批量导入学生) |
| 预设载体 | **分层**:内置权威 seed(代码版本管理,不可变)+ 用户/管理预设(入库,可 fork 派生) |
| 预设存储 | **混合**:权威 seed 由 seed 脚本注入并标记 `isBuiltIn=true`,管理后台可创建派生预设覆盖权重,但不修改原始 seed |

---

## 1. 数据模型设计(Prisma Schema 增量)

### 1.1 新增枚举

```prisma
/// 用户认证方式
enum AuthType {
  feishu       // 飞书 OAuth(默认,现有)
  phone        // 手机号 OTP(无飞书用户)
  invitation   // 邀请码加入(院校批量导入)
  password     // 院校管理员(邮箱+密码,独立账号)
}

/// 评分预设风格
enum PresetStyle {
  academic   // 名教授风格(学术严谨)
  artist     // 知名艺术家风格(创意表达)
  academy    // 顶级美院风格(综合均衡,系统默认)
  applied    // 设计取向风格(应用导向)
  custom     // 用户自定义
}

/// 预设适用阶段
enum PresetStage {
  basic       // 基础训练
  foundation  // 专业基础
  advanced    // 专业深化
  creative    // 创作实践
}

/// 评委类型(仲裁权重依据)
enum ReviewerType {
  professor   // 教授(权重 0.5/0.3/0.3)
  lecturer    // 讲师(权重 0.3)
  ai          // AI(权重 0.2/0.1)
}

/// 评审记录状态
enum ReviewRecordStatus {
  draft       // 草稿(评委暂存)
  submitted   // 已提交(纳入仲裁)
  superseded  // 已被仲裁结果取代
}

/// 争议触发级别
enum DisputeLevel {
  consistent   // 一致(无需仲裁)
  general      // 一般争议(单人复核)
  high         // 高争议(委员会复议)
  veto         // 否决触发(必入委员会)
}

/// 争议案件状态
enum DisputeStatus {
  open        // 待处理
  reviewing   // 仲裁中
  resolved     // 已裁定
  closed       // 已归档
}
```

### 1.2 User 表改造(认证扩展)

**变更**:`feishuOpenId` / `feishuUnionId` 由 `required` 改为 `nullable`(非飞书用户为 null),新增 `authType` / `passwordHash` / `phoneVerified` 字段。

```prisma
model User {
  id              String       @id @default(uuid()) @map("id")
  tenantId        String       @map("tenant_id")
  // ---- 认证方式(新增)----
  authType        AuthType     @default(feishu) @map("auth_type")
  // ---- 飞书字段(改为可选)----
  feishuOpenId    String?      @unique @map("feishu_open_id")  // nullable:非飞书用户为 null
  feishuUnionId   String?      @unique @map("feishu_union_id") // nullable
  // ---- 密码认证(院校管理员,新增)----
  passwordHash    String?      @map("password_hash")          // argon2id 哈希
  // ---- 手机认证(新增)----
  phone           String?      @unique @map("phone")
  phoneVerified   Boolean      @default(false) @map("phone_verified")
  // ---- 以下保持不变 ----
  name            String       @map("name")
  avatar          String       @default("") @map("avatar")
  email           String?      @unique @map("email")
  role            UserRole     @default(student) @map("role")
  status          UserStatus   @default(active) @map("status")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")
  lastLoginAt     DateTime?    @map("last_login_at")
  lockedAt        DateTime?    @map("locked_at")
  lockedBy        String?      @map("locked_by")

  tenant          Tenant       @relation(fields: [tenantId], references: [id])
  sessions        Session[]
  memberships     TenantMember[]
  analyses        Analysis[]
  // ---- 新增关系 ----
  presets         EvaluationPreset[]
  reviewRecords   ReviewRecord[]
  invitations     InvitationCode[]        // 关系:创建的邀请码
  phoneVerifications PhoneVerification[]

  @@index([tenantId], map: "users_tenant_id_idx")
  @@index([feishuUnionId], map: "users_feishu_union_id_idx")
  @@index([status], map: "users_status_idx")
  @@index([authType], map: "users_auth_type_idx")      // 新增索引
  @@index([phone], map: "users_phone_idx")              // 新增索引
  @@map("users")
}
```

**迁移说明**:
- PostgreSQL `UNIQUE` 约束允许多个 NULL,改 nullable 不破坏现有飞书用户
- `authType` 默认 `feishu`,现有用户自动归为飞书类型
- `passwordHash` 仅 `authType=password` 时非空
- `phoneVerified` 默认 false,飞书用户绑定手机后置 true

### 1.3 新增表:PhoneVerification(手机验证码)

```prisma
model PhoneVerification {
  id           String    @id @default(uuid()) @map("id")
  phone        String    @map("phone") @db.VarChar(20)
  code         String    @map("code") @db.VarChar(6)       // 6 位数字
  purpose      String    @map("purpose") @db.VarChar(20)    // register|login|bind|reset
  tenantId     String?   @map("tenant_id")                  // bind 场景需关联租户
  expiresAt    DateTime  @map("expires_at")                 // 5 分钟过期
  consumedAt   DateTime? @map("consumed_at")                // 已使用时间
  attempts     Int       @default(0) @map("attempts")       // 验证尝试次数(上限 5)
  ip           String    @map("ip") @db.VarChar(45)
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([phone], map: "phone_verifications_phone_idx")
  @@index([expiresAt], map: "phone_verifications_expires_at_idx")
  @@map("phone_verifications")
}
```

### 1.4 新增表:InvitationCode(邀请码)

```prisma
model InvitationCode {
  id           String    @id @default(uuid()) @map("id")
  code         String    @unique @map("code") @db.VarChar(32)  // URL-safe
  tenantId     String    @map("tenant_id")
  role         UserRole  @default(student) @map("role")
  maxUses      Int       @default(1) @map("max_uses")
  usedCount    Int       @default(0) @map("used_count")
  expiresAt    DateTime  @map("expires_at")
  createdBy     String    @map("created_by")
  createdAt     DateTime  @default(now()) @map("created_at")

  tenant       Tenant     @relation(fields: [tenantId], references: [id])
  creator      User       @relation(fields: [createdBy], references: [id])

  @@index([tenantId], map: "invitation_codes_tenant_id_idx")
  @@index([code], map: "invitation_codes_code_idx")
  @@map("invitation_codes")
}
```

### 1.5 新增表:EvaluationPreset(评分预设,核心)

> **设计要点**:内置 seed 与用户预设共存于同一表,用 `isBuiltIn` 区分;seed 由 `prisma db seed` 注入,`isBuiltIn=true` 的记录禁止 UPDATE/DELETE;用户/管理员预设 `forkedFromId` 指向源预设。

```prisma
model EvaluationPreset {
  id              String       @id @default(uuid()) @map("id")
  name            String       @map("name") @db.VarChar(64)
  description     String?      @map("description") @db.VarChar(500)
  styleType       PresetStyle  @map("style_type")
  artType         ArtType      @map("art_type")
  // 维度权重 JSON:[{key,label,labelEn,weight}],weight 总和=100
  // key 须与 AnalysisResult.dimensions 维度名严格对应
  dimensions      Json         @map("dimensions")
  applicableStage PresetStage  @map("applicable_stage")
  // ---- 分层标识 ----
  isBuiltIn       Boolean      @default(false) @map("is_built_in")  // seed=true,不可改不可删
  isPrivate       Boolean      @default(false) @map("is_private")   // 用户私有 vs 租户共享
  // ---- 派生关系 ----
  forkedFromId    String?      @map("forked_from_id")  // fork 源预设 ID
  forkedFrom      EvaluationPreset? @relation("PresetFork", fields: [forkedFromId], references: [id])
  forks           EvaluationPreset[] @relation("PresetFork")
  // ---- 归属 ----
  creatorId       String?      @map("creator_id")  // null=系统 seed
  tenantId        String?      @map("tenant_id")   // null=全局 seed;非 null=租户私有
  creator         User?        @relation(fields: [creatorId], references: [id])
  tenant          Tenant?      @relation(fields: [tenantId], references: [id])
  // ---- 状态 ----
  enabled         Boolean      @default(true) @map("enabled")
  sortOrder       Int          @default(0) @map("sort_order")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")

  @@index([artType], map: "evaluation_presets_art_type_idx")
  @@index([styleType], map: "evaluation_presets_style_type_idx")
  @@index([isBuiltIn], map: "evaluation_presets_is_built_in_idx")
  @@index([tenantId], map: "evaluation_presets_tenant_id_idx")
  @@index([creatorId], map: "evaluation_presets_creator_id_idx")
  @@index([enabled], map: "evaluation_presets_enabled_idx")
  @@map("evaluation_presets")
}
```

**`dimensions` JSON 结构示例**(与 `ArbitrationConfig` 对应):

```json
[
  {"key":"composition","label":"构图与造型","labelEn":"Composition","weight":25},
  {"key":"color","label":"色彩表现","labelEn":"Color","weight":25},
  {"key":"brushwork","label":"笔触与技法","labelEn":"Brushwork","weight":25},
  {"key":"integrity","label":"整体与完整","labelEn":"Integrity","weight":25}
]
```

### 1.6 新增表:ReviewRecord(评委评分记录)

```prisma
model ReviewRecord {
  id            String            @id @default(uuid()) @map("id")
  analysisId    String            @map("analysis_id")
  reviewerId    String?           @map("reviewer_id")  // null=AI 评审
  reviewerType  ReviewerType      @map("reviewer_type")
  presetId      String?           @map("preset_id")   // 使用的评分预设
  // 评分快照:{dimensions:{key:score}, overallScore, comment}
  scores        Json              @map("scores")
  // AI 置信度(0-1),仅 reviewerType=ai 时有意义
  confidence    Float?            @map("confidence")
  comment       String?           @map("comment") @db.Text
  status        ReviewRecordStatus @default(draft) @map("status")
  createdAt     DateTime          @default(now()) @map("created_at")
  updatedAt     DateTime          @updatedAt @map("updated_at")

  analysis      Analysis          @relation(fields: [analysisId], references: [id])
  reviewer       User?             @relation(fields: [reviewerId], references: [id])
  preset         EvaluationPreset? @relation(fields: [presetId], references: [id])
  disputeCases   DisputeCase[]     @relation("DisputeReviews")

  @@index([analysisId], map: "review_records_analysis_id_idx")
  @@index([reviewerId], map: "review_records_reviewer_id_idx")
  @@index([status], map: "review_records_status_idx")
  @@map("review_records")
}
```

**`scores` JSON 结构**:

```json
{
  "dimensions": {
    "composition": {"score": 85, "level": "good", "note": "构图严谨,主体落于黄金分割点"},
    "color": {"score": 78, "level": "good", "note": "色调统一但冷暖对比不足"},
    "brushwork": {"score": 82, "level": "good", "note": "笔触生动,体量感尚可"},
    "integrity": {"score": 80, "level": "good", "note": "整体气韵贯通"}
  },
  "overallScore": 81,
  "weightedByPreset": "preset_academic__painting"
}
```

### 1.7 新增表:DisputeCase(争议仲裁案件)

```prisma
model DisputeCase {
  id              String        @id @default(uuid()) @map("id")
  analysisId      String        @map("analysis_id")
  tenantId        String        @map("tenant_id")
  // 触发信息
  triggerLevel    DisputeLevel  @map("trigger_level")
  triggerReason   Json          @map("trigger_reason")
  // {totalRange, dimDiffs:{key:diff}, gradeCrossCount, vetoDetail}
  // 仲裁配置快照(用于可追溯)
  arbitrationConfig Json       @map("arbitration_config")
  // 状态
  status          DisputeStatus @default(open) @map("status")
  // 关联评审记录
  reviews         ReviewRecord[] @relation("DisputeReviews")
  // 仲裁结果
  finalScore      Json?         @map("final_score")
  // {overallScore, dimensions:{key:score}, rule, weightsUsed}
  finalRule       String?       @map("final_rule")  // weighted|majority|unanimous
  resolvedBy      String?       @map("resolved_by")
  resolvedAt      DateTime?     @map("resolved_at")
  resolutionNote  String?       @map("resolution_note") @db.Text
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  analysis        Analysis      @relation(fields: [analysisId], references: [id])
  tenant          Tenant        @relation(fields: [tenantId], references: [id])

  @@index([analysisId], map: "dispute_cases_analysis_id_idx")
  @@index([tenantId, status], map: "dispute_cases_tenant_id_status_idx")
  @@index([status], map: "dispute_cases_status_idx")
  @@map("dispute_cases")
}
```

### 1.8 现有表关系补充

`Analysis` 表新增反向关系:

```prisma
model Analysis {
  // ... 现有字段不变 ...
  reviewRecords   ReviewRecord[]
  disputeCases    DisputeCase[]
}

model Tenant {
  // ... 现有字段不变 ...
  invitations     InvitationCode[]
  presets         EvaluationPreset[]
  disputeCases    DisputeCase[]
}
```

### 1.9 表关系总览(ER)

```
User 1───* EvaluationPreset (creatorId)
User 1───* ReviewRecord (reviewerId)
User 1───* InvitationCode (createdBy)
User 1───* PhoneVerification

Tenant 1───* InvitationCode
Tenant 1───* EvaluationPreset (tenantId, 私有预设)
Tenant 1───* DisputeCase

Analysis 1───* ReviewRecord
Analysis 1───* DisputeCase

EvaluationPreset 1───* EvaluationPreset (fork 关系,自引用)
EvaluationPreset 1───* ReviewRecord (presetId)

DisputeCase *───* ReviewRecord (多对多,通过 relation "DisputeReviews")
```

---

## 2. API 契约设计(新增接口)

### 2.1 认证扩展 API

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|---|---|---|---|---|
| POST | `/auth/phone/otp` | 否 | 3/min/IP | 发送手机验证码(purpose: register/login/bind) |
| POST | `/auth/phone/verify` | 否 | 5/min | 验证码校验 + 登录/注册 |
| POST | `/auth/invitation/redeem` | 否 | 5/min | 邀请码兑换 + 加入租户 |
| POST | `/auth/register/admin` | 否 | 2/min/IP | 院校管理员注册(邮箱+密码,需邀请码) |
| POST | `/auth/login/admin` | 否 | 5/min | 院校管理员登录(邮箱+密码) |
| POST | `/auth/phone/bind` | 是 | 3/min | 已登录用户绑定手机号 |

**类型定义**(追加到 `api-contract.ts` 3.3 节):

```typescript
/** POST /auth/phone/otp 请求体 */
export interface PhoneOtpRequest {
  phone: string;          // 中国手机号正则 /^1[3-9]\d{9}$/
  purpose: 'register' | 'login' | 'bind' | 'reset';
  tenantId?: string;      // bind 场景必传
}

/** POST /auth/phone/otp 响应 */
export interface PhoneOtpResponse {
  sent: boolean;
  /** 重发冷却秒数 */
  resendAfter: number;
  /** 验证码过期时间(ISO 8601) */
  expiresAt: ISODateString;
}

/** POST /auth/phone/verify 请求体 */
export interface PhoneVerifyRequest {
  phone: string;
  code: string;           // 6 位数字
  purpose: 'register' | 'login' | 'bind' | 'reset';
  invitationCode?: string; // register 场景可带邀请码直接加入租户
  name?: string;           // register 场景设置用户名
}

/** POST /auth/phone/verify 响应(复用飞书回调结构) */
export type PhoneVerifyResponse = FeishuCallbackResponse;

/** POST /auth/invitation/redeem 请求体 */
export interface InvitationRedeemRequest {
  code: string;
  name?: string;
}

/** POST /auth/invitation/redeem 响应 */
export type InvitationRedeemResponse = FeishuCallbackResponse;

/** POST /auth/register/admin 请求体 */
export interface AdminRegisterRequest {
  email: string;
  password: string;       // ≥8 位,含大小写+数字
  name: string;
  invitationCode: string; // 院校管理员邀请码
  tenantName?: string;     // 新建租户名称(若邀请码允许建租户)
}

/** POST /auth/login/admin 请求体 */
export interface AdminLoginRequest {
  email: string;
  password: string;
}

/** POST /auth/login/admin 响应 */
export type AdminLoginResponse = FeishuCallbackResponse;

/** POST /auth/phone/bind 请求体 */
export interface PhoneBindRequest {
  phone: string;
  code: string;
}
```

### 2.2 评分预设 API

| 方法 | 路径 | 鉴权 | 角色要求 | 说明 |
|---|---|---|---|---|
| GET | `/api/v1/presets` | 是 | 任意 | 列出可用预设(built-in + 租户共享 + 本人私有) |
| GET | `/api/v1/presets/:id` | 是 | 任意 | 预设详情 |
| POST | `/api/v1/presets` | 是 | teacher/admin | 创建用户预设 |
| POST | `/api/v1/presets/:id/fork` | 是 | teacher/admin | fork 派生预设 |
| PATCH | `/api/v1/presets/:id` | 是 | teacher/admin | 更新(仅本人,非 built-in) |
| DELETE | `/api/v1/presets/:id` | 是 | teacher/admin | 删除(仅本人,非 built-in) |
| POST | `/api/v1/presets/apply` | 是 | 任意 | 应用预设到分析结果(重算加权分) |

**类型定义**(追加到 `api-contract.ts` 3.11 预留节):

```typescript
/** 预设维度项 */
export interface PresetDimension {
  /** 维度键,须与 AnalysisResult.dimensions 维度名对应 */
  key: string;
  label: string;
  labelEn: string;
  /** 权重 0-100,同预设内总和=100 */
  weight: number;
}

/** GET /presets 响应项 */
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

/** POST /presets 请求体 */
export interface CreatePresetRequest {
  name: string;
  description?: string;
  styleType: PresetStyle;
  artType: ArtType;
  dimensions: PresetDimension[];
  applicableStage: PresetStage;
  isPrivate?: boolean;
}

/** POST /presets/:id/fork 请求体 */
export interface ForkPresetRequest {
  name: string;
  description?: string;
  /** 覆盖的权重(可选,不传则完全复制源预设) */
  dimensions?: PresetDimension[];
  isPrivate?: boolean;
}

/** POST /presets/apply 请求体 */
export interface ApplyPresetRequest {
  /** 已有分析结果 ID */
  analysisId: string;
  /** 要应用的预设 ID */
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
```

### 2.3 评委评审 API

| 方法 | 路径 | 鉴权 | 角色要求 | 说明 |
|---|---|---|---|---|
| POST | `/api/v1/analyses/:id/reviews` | 是 | teacher/admin | 提交评审 |
| GET | `/api/v1/analyses/:id/reviews` | 是 | 任意(租户内) | 列出该作业的所有评审 |
| GET | `/api/v1/analyses/:id/reviews/:rid` | 是 | 任意(租户内) | 评审详情 |
| POST | `/api/v1/analyses/:id/disputes/check` | 是 | teacher/admin | 检查并触发争议仲裁 |

```typescript
/** POST /analyses/:id/reviews 请求体 */
export interface CreateReviewRequest {
  reviewerType: ReviewerType;
  presetId?: string;
  scores: {
    dimensions: Record<string, {
      score: number;        // 0-100
      level: SuggestionLevel;
      note?: string;
    }>;
    overallScore: number;   // 0-100
  };
  confidence?: number;      // AI 评审时必传 0-1
  comment?: string;
  status?: 'draft' | 'submitted';  // 默认 submitted
}

/** GET /analyses/:id/reviews 响应项 */
export interface ReviewRecordSummary {
  id: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewerType: ReviewerType;
  presetId: string | null;
  scores: CreateReviewRequest['scores'];
  confidence: number | null;
  comment: string | null;
  status: ReviewRecordStatus;
  createdAt: ISODateString;
}

/** POST /analyses/:id/disputes/check 响应 */
export interface DisputeCheckResponse {
  /** 是否触发争议 */
  triggered: boolean;
  /** 触发级别 */
  level: DisputeLevel | null;
  /** 触发原因 */
  reason: {
    totalRange: number;
    dimDiffs: Record<string, number>;
    gradeCrossCount: number;
  } | null;
  /** 已创建的争议案件 ID(触发时非空) */
  disputeCaseId: string | null;
  /** 当前评审数量 */
  reviewCount: number;
}
```

### 2.4 争议仲裁 API

| 方法 | 路径 | 鉴权 | 角色要求 | 说明 |
|---|---|---|---|---|
| GET | `/api/v1/disputes` | 是 | teacher/admin | 分页列出争议(支持状态筛选) |
| GET | `/api/v1/disputes/:id` | 是 | 任意(租户内) | 争议详情(含评审记录) |
| POST | `/api/v1/disputes/:id/resolve` | 是 | admin/professor | 裁定争议(执行加权/多数决) |
| GET | `/api/v1/disputes/:id/result` | 是 | 任意(租户内) | 获取最终裁定结果 |

```typescript
/** GET /disputes 查询参数 */
export interface DisputeListQuery extends PaginationQuery {
  status?: DisputeStatus;
  level?: DisputeLevel;
  analysisId?: string;
}

/** GET /disputes/:id 响应 */
export interface DisputeCaseDetail {
  id: string;
  analysisId: string;
  triggerLevel: DisputeLevel;
  triggerReason: {
    totalRange: number;
    dimDiffs: Record<string, number>;
    gradeCrossCount: number;
    vetoDetail?: { lowGrade: number; highGrade: number };
  };
  status: DisputeStatus;
  reviews: ReviewRecordSummary[];
  arbitrationConfig: ArbitrationConfig;
  finalScore: {
    overallScore: number;
    dimensions: Record<string, number>;
    rule: 'weighted' | 'majority' | 'unanimous';
    weightsUsed: Record<string, number>;
  } | null;
  resolvedBy: string | null;
  resolvedAt: ISODateString | null;
  createdAt: ISODateString;
}

/** POST /disputes/:id/resolve 请求体 */
export interface ResolveDisputeRequest {
  /** 裁定规则:weighted=加权 / majority=多数决 / unanimous=一致 */
  rule: 'weighted' | 'majority' | 'unanimous';
  /** 是否手动覆盖最终分(可选) */
  overrideScore?: {
    overallScore: number;
    dimensions: Record<string, number>;
    note: string;
  };
}

/** POST /disputes/:id/resolve 响应 */
export type ResolveDisputeResponse = DisputeCaseDetail;
```

### 2.5 院校管理 API(管理后台追加)

| 方法 | 路径 | 鉴权 | 角色要求 | 说明 |
|---|---|---|---|---|
| POST | `/api/admin/tenants/:id/invitations` | 是 | admin | 创建邀请码 |
| GET | `/api/admin/tenants/:id/invitations` | 是 | admin | 列出邀请码 |
| POST | `/api/admin/tenants/:id/students/batch` | 是 | admin | 批量导入学生(CSV/JSON) |
| GET | `/api/admin/presets` | 是 | admin | 列出所有预设(含全局+租户) |
| POST | `/api/admin/presets/:id/override` | 是 | admin | 从 built-in 派生覆盖预设 |

```typescript
/** POST /admin/tenants/:id/invitations 请求体 */
export interface CreateInvitationRequest {
  role: UserRole;
  maxUses: number;        // 1-100
  expiresHours: number;   // 有效时长(小时)
}

/** POST /admin/tenants/:id/students/batch 请求体 */
export interface BatchImportStudentsRequest {
  students: {
    name: string;
    phone?: string;
    email?: string;
  }[];
  role?: UserRole;        // 默认 student
}

/** POST /admin/tenants/:id/students/batch 响应 */
export interface BatchImportStudentsResponse {
  imported: number;
  failed: { name: string; reason: string }[];
  invitationCodes: { name: string; code: string }[];  // 每个学生一个邀请码
}

/** POST /admin/presets/:id/override 请求体 */
export interface OverridePresetRequest {
  name: string;
  description?: string;
  dimensions: PresetDimension[];  // 覆盖后的权重
  isPrivate?: boolean;
}
```

---

## 3. 数据流设计

### 3.1 预设应用流程(评分重算)

```
用户选择预设 + 已有 Analysis
        │
        ▼
[POST /api/v1/presets/apply]
        │
        ▼
presetService.applyPreset(analysisId, presetId)
        │
        ├─ 1. 查 Analysis.result.dimensions(原始维度分)
        ├─ 2. 查 EvaluationPreset.dimensions(权重)
        ├─ 3. 校验维度 key 匹配(preset.dimensions[].key ⊆ analysis.dimensions keys)
        ├─ 4. 加权重算:
        │      weightedScore = Σ(dimScore × weight/100)
        ├─ 5. 返回 ApplyPresetResponse(不落库,按需计算)
        │
        ▼
返回加权明细
```

**注意**:预设应用是**无副作用**的纯计算(不修改 Analysis 表),仅在 ReviewRecord 提交或 DisputeCase 裁定时持久化快照。

### 3.2 多评委争议仲裁流程

```
评委提交评审(POST /analyses/:id/reviews)
        │
        ▼
reviewService.createReview(analysisId, body)
        │
        ├─ 1. 写入 ReviewRecord(status=submitted)
        ├─ 2. 查该 analysis 所有 submitted 评审
        ├─ 3. 若评审数 ≥2 → 调用 arbitrationService.checkDispute()
        │
        ▼
arbitrationService.checkDispute(reviews, analysisId)
        │
        ├─ Step 1: 计算总分极差 R = max(score) - min(score)
        ├─ Step 2: 计算各维度差 r_k = max(dim_k) - min(dim_k)
        ├─ Step 3: 判定触发级别(见 §3.3)
        ├─ Step 4: 若触发 → 创建 DisputeCase(status=open)
        │           ├─ general → status=open,等待单人复核
        │           ├─ high → status=open,通知委员会
        │           └─ veto → status=open,强制委员会复议
        └─ Step 5: 返回 DisputeCheckResponse
        │
        ▼(若触发)
管理员调用 [POST /disputes/:id/resolve]
        │
        ▼
arbitrationService.resolveDispute(disputeId, rule)
        │
        ├─ Step 1: 取该案所有 ReviewRecord
        ├─ Step 2: 按 rule 计算最终分
        │      ├─ weighted: Σ(score × judgeWeight),judgeWeight 来自 ArbitrationConfig
        │      ├─ majority: 多数评委分的中位数
        │      └─ unanimous: 一致同意(否则失败)
        ├─ Step 3: 写入 DisputeCase.finalScore + finalRule
        ├─ Step 4: 关联 ReviewRecord 标记 status=superseded
        ├─ Step 5: DisputeCase.status=resolved
        └─ Step 6: (可选)回写 Analysis.result.overallScore(需教师确认)
        │
        ▼
返回 DisputeCaseDetail
```

### 3.3 争议触发判定逻辑(对应 ArbitrationConfig.triggers)

```typescript
function determineLevel(reviews: ReviewRecord[]): DisputeLevel {
  const scores = reviews.map(r => r.scores.overallScore);
  const totalRange = Math.max(...scores) - Math.min(...scores);

  // 维度级差
  const dimKeys = Object.keys(reviews[0].scores.dimensions);
  const dimDiffs: Record<string, number> = {};
  for (const key of dimKeys) {
    const dimScores = reviews.map(r => r.scores.dimensions[key].score);
    dimDiffs[key] = Math.max(...dimScores) - Math.min(...dimScores);
  }
  const maxDimDiff = Math.max(...Object.values(dimDiffs));
  const highDiffDimCount = Object.values(dimDiffs).filter(d => d >= cfg.highDisputeDimDiff).length;

  // 跨档判定(档:A≥90 / B 80-89 / C 70-79 / D 60-69 / E<60)
  const grades = scores.map(s => scoreToGrade(s));
  const gradeSet = new Set(grades);
  const gradeCrossCount = gradeSet.size - 1;

  // 否决触发:任一评委判 E 且其余判 A
  const hasVeto = grades.includes('E') && grades.includes('A');

  // 判定(优先级从高到低)
  if (hasVeto) return 'veto';
  if (totalRange >= cfg.highDisputeTotalRange || highDiffDimCount >= cfg.highDisputeDimCount || gradeCrossCount >= cfg.gradeCrossTierHigh) {
    return 'high';
  }
  if (totalRange >= cfg.generalDisputeTotalRange || maxDimDiff >= cfg.generalDisputeDimDiff) {
    return 'general';
  }
  if (totalRange <= cfg.consistentTotalRange && maxDimDiff <= cfg.consistentDimDiff) {
    return 'consistent';
  }
  return 'general'; // 中间地带按一般争议处理
}
```

### 3.4 加权裁定规则

```typescript
function weightedResolve(reviews: ReviewRecord[], cfg: ArbitrationConfig): FinalScore {
  // 按评委类型取权重
  const weights = reviews.map(r => {
    if (r.reviewerType === 'professor') {
      return cfg.judgeWeights.committee.professorEach;  // 0.3
    }
    if (r.reviewerType === 'lecturer') {
      return cfg.judgeWeights.regular.lecturer;  // 0.3
    }
    // AI:置信度低则降级
    if (r.confidence && r.confidence < cfg.edgeCases.aiLowConfidence) {
      return cfg.edgeCases.aiLowConfidenceWeight;  // 0.1
    }
    return cfg.judgeWeights.regular.ai;  // 0.2
  });

  // 归一化权重(评委缺席时)
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);

  // 离群分折半(差值 > outlierDiff 的评委权重 ×0.5)
  const median = getMedian(reviews.map(r => r.scores.overallScore));
  const finalWeights = reviews.map((r, i) => {
    if (Math.abs(r.scores.overallScore - median) > cfg.edgeCases.outlierDiff) {
      return normalizedWeights[i] * cfg.edgeCases.outlierWeightFactor;
    }
    return normalizedWeights[i];
  }).map(w => w / finalWeights.reduce((a, b) => a + b, 0)); // 再次归一化

  // 加权计算
  const weightedOverall = reviews.reduce((sum, r, i) => sum + r.scores.overallScore * finalWeights[i], 0);
  // 维度级同理...
  const weightedDims = {};

  // 边界就低定档(±1 内)
  const finalScore = applyBoundaryTolerance(weightedOverall, cfg.rules.boundaryTolerance);

  return { overallScore: finalScore, dimensions: weightedDims, rule: 'weighted', weightsUsed: toWeightMap(finalWeights) };
}
```

### 3.5 认证扩展流程

#### 3.5.1 手机号注册/登录流程

```
[POST /auth/phone/otp] {phone, purpose:register}
        │ 短信网关发送 6 位验证码,5 分钟过期,5 次尝试上限
        ▼
[POST /auth/phone/verify] {phone, code, purpose, name?, invitationCode?}
        │
        ├─ register: 校验码 → 查/建 User(authType=phone) → 若带 invitationCode 则加入租户
        ├─ login:    校验码 → 查 User(authType=phone) → 签发 JWT
        ├─ bind:     校验码 → 更新现有 User.phone + phoneVerified=true
        └─ reset:    校验码 → 返回临时 resetToken(后续改密)
        │
        ▼
返回 FeishuCallbackResponse 结构(复用,accessToken + user + tenant)
```

#### 3.5.2 邀请码流程

```
院校管理员(admin) → [POST /admin/tenants/:id/invitations] → 生成邀请码
        │
        ▼
用户 → [POST /auth/invitation/redeem] {code, name?}
        │
        ├─ 校验码有效性(未过期/未用尽)
        ├─ 查/建 User(authType=invitation)
        ├─ 加入 TenantMember(role 来自邀请码)
        ├─ usedCount++
        └─ 签发 JWT
        │
        ▼
返回 FeishuCallbackResponse 结构
```

#### 3.5.3 院校批量导入学生流程

```
admin → [POST /admin/tenants/:id/students/batch] {students: [{name, phone?, email?}]}
        │
        ├─ 逐条处理:
        │   ├─ 有手机号 → 直接建 User(authType=phone) + 加入租户
        │   └─ 无手机号 → 生成邀请码,返回给学生自行注册
        ├─ 事务提交(失败回滚)
        └─ 返回 BatchImportStudentsResponse(含成功数/失败明细/邀请码列表)
```

---

## 4. 内置 Seed 预设方案(权威基准)

> 来源:[art-evaluation-research.md](./art-evaluation-research.md) §1-2
> 注入方式:`prisma db seed` 脚本,`isBuiltIn=true`,`creatorId=null`,`tenantId=null`

### 4.1 Seed 预设清单(16 套 = 4 风格 × 4 类作品)

| styleType | artType | 预设名 | 维度权重(简) |
|---|---|---|---|
| academy(美院基准) | painting | 美院基准·绘画 | 构图25/色彩25/笔触25/整体25 |
| academy | design | 美院基准·设计 | 层次25/排版25/色彩20/创意30 |
| academy | product | 美院基准·产品 | 形态30/材质25/功能25/人机20 |
| academy | sculpture | 美院基准·雕塑 | 空间30/形体30/材料25/观念15 |
| academic(名教授) | painting | 名教授·绘画 | 构图30/色彩25/笔触25/整体20 |
| academic | design | 名教授·设计 | 层次25/排版30/色彩20/创意25 |
| academic | product | 名教授·产品 | 形态35/材质25/功能25/人机15 |
| academic | sculpture | 名教授·雕塑 | 空间35/形体30/材料25/观念10 |
| artist(艺术家) | painting | 艺术家·绘画 | 构图20/色彩25/笔触35/整体20 |
| artist | design | 艺术家·设计 | 层次20/排版20/色彩20/创意40 |
| artist | product | 艺术家·产品 | 形态25/材质25/功能20/人机15/观念15* |
| artist | sculpture | 艺术家·雕塑 | 空间20/形体25/材料25/观念30 |
| applied(设计取向) | painting | 设计取向·绘画 | 构图25/色彩30/笔触20/整体25 |
| applied | design | 设计取向·设计 | 层次30/排版25/色彩25/创意20 |
| applied | product | 设计取向·产品 | 形态25/材质25/功能30/人机20 |
| applied | sculpture | 设计取向·雕塑 | 空间25/形体30/材料30/观念15 |

*注:艺术家风格产品类额外增加「观念」维度(权重15),属维度扩展,需在 `dimensions` JSON 中声明完整 5 维度。

### 4.2 Seed 数据结构示例(TypeScript)

```typescript
// server/src/seed/presets-data.ts
export const SEED_PRESETS: SeedPreset[] = [
  {
    id: 'preset_academy__painting',  // 固定 ID,便于 fork 引用
    name: '美院基准·绘画',
    description: '央美/国美/清华三校综合均衡基准,系统默认预设',
    styleType: 'academy',
    artType: 'painting',
    applicableStage: 'foundation',
    dimensions: [
      { key: 'composition', label: '构图与造型', labelEn: 'Composition', weight: 25 },
      { key: 'color', label: '色彩表现', labelEn: 'Color', weight: 25 },
      { key: 'brushwork', label: '笔触与技法', labelEn: 'Brushwork', weight: 25 },
      { key: 'integrity', label: '整体与完整', labelEn: 'Integrity', weight: 25 },
    ],
    rationale: '四维度均衡,适合基础与专业基础阶段综合评估',
  },
  // ... 其余 15 套
];
```

### 4.3 仲裁配置(系统级,可按租户覆盖)

```typescript
// server/src/config/arbitration-default.ts
export const DEFAULT_ARBITRATION_CONFIG: ArbitrationConfig = {
  triggers: {
    consistentTotalRange: 5,
    consistentDimDiff: 8,
    generalDisputeTotalRange: 10,
    generalDisputeDimDiff: 15,
    highDisputeTotalRange: 20,
    highDisputeDimCount: 2,
    gradeCrossTierHigh: 2,
    vetoLowGrade: 60,
    vetoHighGrade: 90,
  },
  judgeWeights: {
    regular: { professor: 0.5, lecturer: 0.3, ai: 0.2 },
    professorAi: { professor: 0.7, ai: 0.3 },
    committee: { professorEach: 0.3, ai: 0.1 },
  },
  rules: { final: 'weighted', boundaryTolerance: 1 },
  edgeCases: {
    outlierDiff: 25, outlierWeightFactor: 0.5,
    aiLowConfidence: 0.6, aiLowConfidenceWeight: 0.1,
    aiVeryLowConfidence: 0.4, aiHumanExtremeDiff: 20,
    maxMissingDimsToInvalidate: 2,
  },
};
```

---

## 5. 实施计划

### 5.1 文件结构(新增)

```
server/
├── prisma/
│   ├── schema.prisma                    # [修改] 增 5 表 + 改 User
│   └── migrations/                      # [新增] 迁移脚本
├── src/
│   ├── config/
│   │   └── arbitration-default.ts       # [新增] 仲裁配置默认值
│   ├── seed/
│   │   ├── presets-data.ts              # [新增] 16 套 seed 预设数据
│   │   └── seed.ts                       # [修改] 注入 seed 预设
│   ├── controllers/
│   │   ├── auth.controller.ts           # [修改] 增手机/邀请码/管理员
│   │   ├── preset.controller.ts         # [新增]
│   │   ├── review.controller.ts         # [新增]
│   │   └── dispute.controller.ts        # [新增]
│   ├── services/
│   │   ├── auth.service.ts              # [修改] 增手机/邀请码/密码认证
│   │   ├── preset.service.ts            # [新增]
│   │   ├── review.service.ts            # [新增]
│   │   └── arbitration.service.ts       # [新增] 仲裁核心逻辑
│   ├── repositories/
│   │   ├── preset.repository.ts         # [新增]
│   │   ├── review.repository.ts         # [新增]
│   │   ├── dispute.repository.ts        # [新增]
│   │   ├── invitation.repository.ts    # [新增]
│   │   └── phone-verification.repository.ts # [新增]
│   ├── routes/
│   │   ├── auth.routes.ts               # [修改] 增新路由
│   │   ├── preset.routes.ts             # [新增]
│   │   ├── review.routes.ts             # [新增]
│   │   └── dispute.routes.ts            # [新增]
│   ├── middlewares/
│   │   └── auth.ts                      # [修改] 兼容多 authType
│   └── types/
│       ├── api-contract.ts              # [修改] 追加类型(3.3/3.11 节)
│       └── arbitration.ts              # [新增] ArbitrationConfig 类型
└── test/
    ├── preset.service.test.ts
    ├── arbitration.service.test.ts
    ├── review.service.test.ts
    └── auth-phone.service.test.ts
```

### 5.2 实施顺序(避免循环依赖)

1. **Prisma schema + 迁移**(5 新表 + User 改造)
2. **类型定义**(`api-contract.ts` 追加 + `arbitration.ts` 新建)
3. **仲裁配置**(`arbitration-default.ts`)
4. **Seed 数据**(`presets-data.ts` 16 套 + seed 脚本)
5. **Repositories 层**(5 个 repo)
6. **Services 层**(auth 扩展 + preset + review + arbitration)
7. **Controllers 层**(4 个 controller)
8. **Routes 层**(4 个 router)
9. **中间件兼容**(`auth.ts` 支持多 authType)
10. **Vitest 测试**(5 测试文件)

### 5.3 安全要点

- 手机验证码:argon2id 哈希存储、5 分钟过期、5 次尝试上限、IP 限流 3/min
- 邀请码:URL-safe 32 位、过期校验、用尽校验、租户隔离
- 院校管理员密码:argon2id(参数与现有 JWT 一致)、≥8 位含大小写+数字
- 预设 fork:`isBuiltIn=true` 的记录在 service 层强制禁止 UPDATE/DELETE
- 仲裁配置:租户级覆盖存 `Tenant.config`(Json),未覆盖则用系统默认
- 多租户:所有新表查询强制 `tenantId` 过滤(repository 层注入)

### 5.4 兼容性

- **向后兼容**:现有飞书用户不受影响(`authType` 默认 feishu,`feishuOpenId` 非空)
- **API 契约**:仅追加类型,不修改现有类型(遵循 §3.11 设计原则)
- **Analysis 表**:不改结构,评审/争议通过 ReviewRecord/DisputeCase 关联
- **前端**:新 API 可渐进接入,不影响现有飞书登录流程

---

## 6. 待确认事项

1. **短信网关**:手机 OTP 需接入短信服务商(阿里云/腾讯云?),影响 `auth.service.ts` 的 `sendOtp` 实现
2. **仲裁配置覆盖**:是否需要 `Tenant.config` 字段存储租户级仲裁配置覆盖?(当前设计为系统全局)
3. **AI 评审触发**:AI 评审是否在 Analysis 完成时自动生成 ReviewRecord?还是手动触发?
4. **争议结果回写**:DisputeCase 裁定后是否自动回写 `Analysis.overallScore`?还是需教师确认?
5. **Seed 预设 ID 固定**:seed 预设使用固定 UUID(如 `preset_academy__painting`)便于 fork 引用,但 UUID 字段类型为 String,需确认是否接受非标准 UUID 字符串

---

**文档结束。请审阅以上设计,确认后我将按 §5 实施顺序编写代码。**
