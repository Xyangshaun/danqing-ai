// ============================================================
// 环境变量加载与启动自检
// 对应文档:auth-design.md §4 + §4.7
// 任何缺失/非法的 env 一律抛错拒绝启动(Deny by default)
// ============================================================

import crypto from 'node:crypto';

/**
 * 环境变量类型(只读)
 * 所有字段在启动时已校验非空(必填字段),代码中可安全使用
 */
export interface EnvConfig {
  // 飞书
  feishuAppId: string;
  feishuAppSecret: string;
  feishuRedirectUriWeb: string;
  feishuRedirectUriAdmin: string;
  feishuRedirectUriMobile: string;
  feishuAuthzEndpoint: string;
  feishuTokenEndpoint: string;
  feishuUserinfoEndpoint: string;

  // JWT
  jwtPrivateKey: string;
  jwtPublicKey: string;
  jwtKeyId: string;
  jwtIssuer: string;
  jwtAudienceWeb: string;
  jwtAudienceAdmin: string;
  jwtAudienceMobile: string;
  jwtAccessExpires: string; // 形如 "15m"
  jwtRefreshExpires: string; // 形如 "7d"

  // Cookie
  cookieSecure: boolean;
  cookieDomain: string;
  cookieSameSite: 'strict' | 'lax' | 'none';
  cookiePath: string;
  cookieMaxAge: number; // 秒

  // 基础设施
  databaseUrl: string;
  redisUrl: string;

  // CORS
  corsOrigins: string[];

  // 限流
  rateLimitAuthPerMin: number;
  rateLimitCallbackPerMin: number;
  rateLimitRefreshPerMin: number;
  rateLimitApiPerMin: number;

  // 租户
  tenantDefaultPlan: 'free' | 'standard' | 'enterprise';
  tenantDefaultType: 'school' | 'college' | 'class' | 'individual';

  // 安全
  enableHsts: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  nodeEnv: 'development' | 'production' | 'test';
  port: number;

  // 文件上传(multer 磁盘存储)
  uploadDir: string;
  uploadMaxSize: number;

  // AI 视觉分析(Phase 2 追加,全部可选带默认值,保证向后兼容)
  /** AI 功能总开关(默认 false,生产环境手动开启) */
  aiEnabled: boolean;
  /** 智谱 API Key(留空时 AI_ENABLED=true 也会自动 fallback) */
  aiApiKey: string;
  /** 智谱 GLM-4V API 端点(OpenAI 兼容格式) */
  aiApiUrl: string;
  /** AI 请求超时(毫秒,硬性 2500ms 保障 3 秒 SLA) */
  aiApiTimeout: number;
  /** AI 模型名(glm-4v-flash 免费 / glm-4v-plus 付费高精度) */
  aiApiModel: string;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`env parse failed: expected integer, got "${value}"`);
  }
  return parsed;
}

function parseSameSite(value: string | undefined): 'strict' | 'lax' | 'none' {
  const v = (value ?? 'strict').toLowerCase();
  if (v !== 'strict' && v !== 'lax' && v !== 'none') {
    throw new Error(`COOKIE_SAMESITE must be one of strict|lax|none, got "${value}"`);
  }
  return v;
}

function parseLogLevel(value: string | undefined): 'error' | 'warn' | 'info' | 'debug' {
  const v = (value ?? 'info').toLowerCase();
  if (v !== 'error' && v !== 'warn' && v !== 'info' && v !== 'debug') {
    throw new Error(`LOG_LEVEL must be one of error|warn|info|debug, got "${value}"`);
  }
  return v as 'error' | 'warn' | 'info' | 'debug';
}

function parseNodeEnv(value: string | undefined): 'development' | 'production' | 'test' {
  const v = (value ?? 'development').toLowerCase();
  if (v !== 'development' && v !== 'production' && v !== 'test') {
    throw new Error(`NODE_ENV must be one of development|production|test, got "${value}"`);
  }
  return v as 'development' | 'production' | 'test';
}

function parseTenantPlan(value: string | undefined): 'free' | 'standard' | 'enterprise' {
  const v = (value ?? 'free').toLowerCase();
  if (v !== 'free' && v !== 'standard' && v !== 'enterprise') {
    throw new Error(`TENANT_DEFAULT_PLAN must be one of free|standard|enterprise, got "${value}"`);
  }
  return v;
}

function parseTenantType(value: string | undefined): 'school' | 'college' | 'class' | 'individual' {
  const v = (value ?? 'individual').toLowerCase();
  if (v !== 'school' && v !== 'college' && v !== 'class' && v !== 'individual') {
    throw new Error(`TENANT_DEFAULT_TYPE must be one of school|college|class|individual, got "${value}"`);
  }
  return v;
}

/**
 * 校验必填环境变量非空
 * @throws Error 缺失必填项时抛错(启动自检失败)
 */
function assertRequired(record: Record<string, string | undefined>, keys: readonly string[]): void {
  const missing: string[] = [];
  for (const k of keys) {
    const v = record[k];
    if (v === undefined || v === '') {
      missing.push(k);
    }
  }
  if (missing.length > 0) {
    throw new Error(`[env] missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * 校验 JWT 私钥为 RSA 类型(对应 auth-design.md §4.7)
 * @throws Error 私钥不可解析或非 RSA 类型时抛错
 */
function assertRsaPrivateKey(pem: string): void {
  try {
    const keyObj = crypto.createPrivateKey(pem);
    if (keyObj.asymmetricKeyType !== 'rsa') {
      throw new Error(`expected RSA key, got "${keyObj.asymmetricKeyType}"`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[env] JWT_PRIVATE_KEY invalid: ${msg}`);
  }
}

/**
 * 校验 JWT 公钥为 RSA 类型
 */
function assertRsaPublicKey(pem: string): void {
  try {
    const keyObj = crypto.createPublicKey(pem);
    if (keyObj.asymmetricKeyType !== 'rsa') {
      throw new Error(`expected RSA key, got "${keyObj.asymmetricKeyType}"`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[env] JWT_PUBLIC_KEY invalid: ${msg}`);
  }
}

/**
 * 加载并校验环境变量,返回强类型配置对象
 * 在 src/index.ts 启动入口调用,任何错误都会让进程退出
 */
export function loadEnv(): EnvConfig {
  const env = process.env;

  // 必填项校验(对应 auth-design.md §4.7 自检清单)
  const requiredKeys = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_REDIRECT_URI_WEB',
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'JWT_KEY_ID',
    'DATABASE_URL',
    'REDIS_URL',
    'CORS_ORIGINS',
  ] as const;
  assertRequired(env, requiredKeys);

  const jwtPrivateKey = env.JWT_PRIVATE_KEY as string;
  const jwtPublicKey = env.JWT_PUBLIC_KEY as string;
  // 启动自检:私钥/公钥必须为 RSA 类型
  assertRsaPrivateKey(jwtPrivateKey);
  assertRsaPublicKey(jwtPublicKey);

  const corsRaw = env.CORS_ORIGINS as string;
  const corsOrigins = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (corsOrigins.length === 0) {
    throw new Error('[env] CORS_ORIGINS must contain at least one origin');
  }
  if (corsOrigins.includes('*')) {
    throw new Error('[env] CORS_ORIGINS must not contain "*" (security constraint)');
  }

  return {
    feishuAppId: env.FEISHU_APP_ID as string,
    feishuAppSecret: env.FEISHU_APP_SECRET as string,
    feishuRedirectUriWeb: env.FEISHU_REDIRECT_URI_WEB as string,
    feishuRedirectUriAdmin: env.FEISHU_REDIRECT_URI_ADMIN ?? env.FEISHU_REDIRECT_URI_WEB as string,
    feishuRedirectUriMobile: env.FEISHU_REDIRECT_URI_MOBILE ?? env.FEISHU_REDIRECT_URI_WEB as string,
    feishuAuthzEndpoint: env.FEISHU_AUTHZ_ENDPOINT ?? 'https://open.feishu.cn/open-apis/authen/v1/authorize',
    feishuTokenEndpoint: env.FEISHU_TOKEN_ENDPOINT ?? 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    feishuUserinfoEndpoint: env.FEISHU_USERINFO_ENDPOINT ?? 'https://open.feishu.cn/open-apis/authen/v1/user_info',

    jwtPrivateKey,
    jwtPublicKey,
    jwtKeyId: env.JWT_KEY_ID as string,
    jwtIssuer: env.JWT_ISSUER ?? 'danqing-ai-auth',
    jwtAudienceWeb: env.JWT_AUDIENCE_WEB ?? 'danqing-ai-web',
    jwtAudienceAdmin: env.JWT_AUDIENCE_ADMIN ?? 'danqing-ai-admin',
    jwtAudienceMobile: env.JWT_AUDIENCE_MOBILE ?? 'danqing-ai-mobile',
    jwtAccessExpires: env.JWT_ACCESS_EXPIRES ?? '15m',
    jwtRefreshExpires: env.JWT_REFRESH_EXPIRES ?? '7d',

    cookieSecure: parseBoolean(env.COOKIE_SECURE, false),
    cookieDomain: env.COOKIE_DOMAIN ?? '',
    cookieSameSite: parseSameSite(env.COOKIE_SAMESITE),
    cookiePath: env.COOKIE_PATH ?? '/auth',
    cookieMaxAge: parseInteger(env.COOKIE_MAX_AGE, 604800),

    databaseUrl: env.DATABASE_URL as string,
    redisUrl: env.REDIS_URL as string,

    corsOrigins,

    rateLimitAuthPerMin: parseInteger(env.RATE_LIMIT_AUTH_PER_MIN, 10),
    rateLimitCallbackPerMin: parseInteger(env.RATE_LIMIT_CALLBACK_PER_MIN, 5),
    rateLimitRefreshPerMin: parseInteger(env.RATE_LIMIT_REFRESH_PER_MIN, 20),
    rateLimitApiPerMin: parseInteger(env.RATE_LIMIT_API_PER_MIN, 60),

    tenantDefaultPlan: parseTenantPlan(env.TENANT_DEFAULT_PLAN),
    tenantDefaultType: parseTenantType(env.TENANT_DEFAULT_TYPE),

    enableHsts: parseBoolean(env.ENABLE_HSTS, false),
    logLevel: parseLogLevel(env.LOG_LEVEL),
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    port: parseInteger(env.PORT, 3000),

    uploadDir: env.UPLOAD_DIR ?? 'uploads',
    uploadMaxSize: parseInteger(env.UPLOAD_MAX_SIZE, 10 * 1024 * 1024),

    // AI 视觉分析(Phase 2,全部带默认值,缺失不报错)
    aiEnabled: parseBoolean(env.AI_ENABLED, false),
    aiApiKey: env.AI_API_KEY ?? '',
    aiApiUrl: env.AI_API_URL ?? 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    aiApiTimeout: parseInteger(env.AI_API_TIMEOUT, 2500),
    aiApiModel: env.AI_API_MODEL ?? 'glm-4v-flash',
  };
}

/**
 * 全局单例 env,在 src/index.ts 启动时通过 initEnv() 初始化
 * 其余模块通过 import { env } from '../config/env.js' 读取
 */
let envInstance: EnvConfig | null = null;

export function initEnv(): EnvConfig {
  if (envInstance) {
    return envInstance;
  }
  envInstance = loadEnv();
  return envInstance;
}

/**
 * 获取 env 单例
 * @throws Error 未初始化时抛错(防止误用)
 */
export function env(): EnvConfig {
  if (!envInstance) {
    throw new Error('[env] not initialized. Call initEnv() at startup first.');
  }
  return envInstance;
}
