// ============================================================
// 丹青有AI - Express 应用入口
// 对应文档:
//   - api-contract-v1.md §1(统一响应规范)
//   - auth-design.md §3(安全防护)+ §0 C10(OIDC 合规)
//   - context-log-2026-07-27.md(技术约束)
//
// 职责:
//   1. 注册全局中间件(helmet/cors/cookie/json/trace)
//   2. 挂载业务路由(/auth /users /tenants /analyses)
//   3. 注册 404 与统一错误处理中间件
//   4. 暴露 /health 健康检查(无需鉴权,供 LB/K8s 探针)
//
// 设计原则:
//   - app.ts 仅组装中间件与路由,不启动 HTTP server(由 index.ts 负责)
//   - 便于 Vitest supertest 直接 import app 做集成测试
//   - 所有错误统一走 errorHandler,禁止裸 res.json
// ============================================================

import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { traceMiddleware } from './middlewares/trace.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { tenantRouter } from './routes/tenant.routes.js';
import { analysisRouter } from './routes/analysis.routes.js';
import { artworkRouter } from './routes/artwork.routes.js';
import { growthRouter } from './routes/growth.routes.js';
import { ErrorCode } from './types/api-contract.js';

/**
 * 创建并配置 Express 应用
 * 抽成工厂函数便于测试时重建实例
 */
export function createApp(): Express {
  const app = express();
  const cfg = env();

  // 信任第一跳代理(X-Forwarded-For / X-Forwarded-Proto)
  // 生产部署在 LB/Nginx 后,需启用以正确获取客户端 IP
  app.set('trust proxy', 1);
  // 关闭 x-powered-by(避免暴露技术栈)
  app.disable('x-powered-by');

  // ---------- 安全中间件 ----------
  app.use(
    helmet({
      contentSecurityPolicy: {
        // API 服务默认不返回 HTML,CSP 收紧(对 preflight 与 JSON 友好)
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // HSTS 仅在显式开启时启用(开发环境 HTTPS 不必强开)
      hsts: cfg.enableHsts
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      // 禁用 MIME 嗅探
      noSniff: true,
      // 防点击劫持
      frameguard: { action: 'deny' },
      // 隐藏 Server 头
      hidePoweredBy: true,
    }),
  );

  // ---------- CORS(白名单,禁止 *)----------
  // 对应 auth-design.md §0 C10 + context-log 安全约束
  const corsOriginChecker = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void => {
    // 允许同源请求(无 Origin 头,如 curl/Postman)
    if (!origin) return callback(null, true);
    if (cfg.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn({ origin }, '[cors] rejected');
    // 不暴露资源存在性,统一返回 false
    return callback(null, false);
  };
  app.use(
    cors({
      origin: corsOriginChecker,
      credentials: true, // 允许携带 Cookie(refresh_token)
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Trace-Id',
        'X-Client-Context',
        'X-Device-Id',
        'X-Client',
        'X-CSRF-Token',
      ],
      exposedHeaders: ['X-Trace-Id'],
      maxAge: 600, // preflight 缓存 10 分钟
    }),
  );

  // ---------- 请求体解析 ----------
  // 文件上传上限 10MB(对应技术约束:file upload limit ≤10MB)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  // Cookie 解析(refresh_token HttpOnly)
  app.use(cookieParser());

  // ---------- traceId 注入(必须在路由前)----------
  app.use(traceMiddleware);

  // ---------- 健康检查(无需鉴权,供探针)----------
  // 返回轻量结构,不查 DB/Redis(避免雪崩);如需深度检查走 /health/ready
  // /health 供 LB/K8s 探针(render.yaml),/api/v1/health 供 API 契约一致性检查
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.status(200).json({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        status: 'up',
        service: 'danqing-ai-server',
        version: '3.0.0',
        nodeEnv: cfg.nodeEnv,
        timestamp: new Date().toISOString(),
      },
      traceId: res.req.traceId,
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // ---------- 业务路由(统一挂载在 /api/v1 下,与 API 契约一致)----------
  const apiV1 = Router();
  apiV1.use('/auth', authRouter);
  apiV1.use('/users', userRouter);
  apiV1.use('/tenants', tenantRouter);
  apiV1.use('/analyses', analysisRouter);
  apiV1.use('/artworks', artworkRouter);
  apiV1.use('/growth', growthRouter);
  app.use('/api/v1', apiV1);

  // ---------- 404 兜底 ----------
  app.use(notFoundHandler);

  // ---------- 统一错误处理(必须最后注册,4 参数)----------
  app.use(errorHandler);

  return app;
}

/**
 * 默认导出已构建的 app 实例
 * 生产入口 src/index.ts 直接 import;测试可调用 createApp() 重建
 */
const app = createApp();
export default app;
