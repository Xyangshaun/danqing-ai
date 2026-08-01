// ============================================================
// AI 分析 Controller
// 对应 API:
//   POST /analyses          (JSON: artType + imageUrl)
//   POST /analyses/upload   (multipart/form-data: image 文件 + artType)
//   GET  /analyses          (分页查询历史)
//   GET  /analyses/:id      (查询单条详情)
//
// 输入校验:Zod schema,所有外部输入经校验后进入 service
// 响应格式:{code, message, data, traceId}
// ============================================================

import type { RequestHandler } from 'express';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analysisService } from '../services/analysis.service.js';
import { success, error } from '../utils/response.js';
import { ErrorCode, type ArtType, type AnalysisStatus } from '../types/api-contract.js';
import { logger } from '../utils/logger.js';
import { assertSafeImageUrl } from '../middlewares/url-guard.js';
import { env } from '../config/env.js';

/** 合法作品类型(四类) */
const VALID_ART_TYPES: readonly ArtType[] = [
  'painting',
  'design',
  'product',
  'sculpture',
];

/** artType 校验(预检 → 友好错误信息) */
const artTypeSchema = z.enum(
  ['painting', 'design', 'product', 'sculpture'],
  { message: 'artType 必须为 painting/design/product/sculpture 之一' },
);

/** POST /analyses 请求体 schema */
const createAnalysisBodySchema = z.object({
  artType: artTypeSchema,
  imageUrl: z
    .string()
    .trim()
    .url('imageUrl 必须为合法 URL')
    .max(2048, 'imageUrl 长度不能超过 2048')
    .optional(),
  title: z.string().trim().max(64).optional(),
  remark: z.string().trim().max(500).optional(),
}).refine(
  (data) => !!data.imageUrl,
  { message: '缺少必填参数:imageUrl(或改用 POST /analyses/upload 上传文件)', path: ['imageUrl'] },
);

/** POST /analyses/upload 表单字段 schema(multipart/form-data) */
const uploadFormSchema = z.object({
  artType: artTypeSchema,
  title: z.string().trim().max(64).optional(),
  remark: z.string().trim().max(500).optional(),
});

/** GET /analyses 查询参数 schema */
const listAnalysesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  artType: z.enum(['painting', 'design', 'product', 'sculpture']).optional(),
  status: z.enum(['pending', 'processing', 'success', 'failed']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  userId: z.string().min(1).optional(),
});

/** GET /analyses/:id 路径参数 schema */
const analysisIdParamSchema = z.object({
  id: z.string().min(1, '缺少必填参数:id'),
});

/**
 * POST /analyses
 * 提交分析任务(URL 模式,同步返回完整结果)
 */
export const createAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = createAnalysisBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    // SSRF 防护:校验 imageUrl 主机不指向内网/元数据
    // refine 已保证 imageUrl 存在,此处显式收窄类型供 TS 严格模式使用
    const imageUrl = parsed.data.imageUrl;
    if (!imageUrl) {
      return error(res, ErrorCode.PARAM_INVALID, '缺少必填参数:imageUrl', 400);
    }
    assertSafeImageUrl(imageUrl);

    const result = await analysisService.createAnalysis({
      tenantId: req.tenantId,
      userId: req.userId,
      body: parsed.data,
    });

    // Phase 2:AI 增强字段已嵌入 result.result(HybridAnalysisResult)
    // 前端可通过 result.result?.aiEnhanced 判断是否经过 AI 增强
    // 响应结构向后兼容:旧客户端忽略 aiEnhanced/aiVisionResult/aiMeta 字段
    logger.debug(
      {
        analysisId: result.id,
        status: result.status,
        durationMs: result.durationMs,
      },
      '[analysis.controller] createAnalysis response',
    );

    return success(res, result, '分析完成');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /analyses/upload
 * 提交分析任务(文件上传模式,multipart/form-data)
 * multer 中间件已在 routes 层注入,此处从 req.file.buffer 读取
 *
 * G4 安全修复:memoryStorage 下 file.path 不存在,需手动将 buffer 写盘
 * 再传 path 给 service(保持 service 接口不变)
 */
export const uploadAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    // multer 单文件字段名:image(memoryStorage → file.buffer)
    const file = (req as unknown as { file?: Express.Multer.File & { buffer?: Buffer } }).file;
    if (!file || !file.buffer) {
      return error(res, ErrorCode.FILE_EMPTY, '缺少上传文件:image', 400);
    }

    // 表单字段校验(artType 必填,title/remark 可选)
    const parsed = uploadFormSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    // memoryStorage → 写盘生成临时文件路径(routes 层已做魔数校验)
    const uploadDir = resolve(process.cwd(), env().uploadDir);
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const localImagePath = join(uploadDir, uniqueName);
    try {
      // 确保上传目录存在(避免目录不存在导致 writeFileSync 失败)
      mkdirSync(uploadDir, { recursive: true });
      writeFileSync(localImagePath, file.buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, dir: uploadDir }, '[analysis.controller] write uploaded file failed');
      return error(res, ErrorCode.FILE_UPLOAD_FAILED, '文件保存失败', 500);
    }

    const result = await analysisService.createAnalysisFromUpload({
      tenantId: req.tenantId,
      userId: req.userId,
      artType: parsed.data.artType,
      localImagePath,
      originalFileName: file.originalname,
      title: parsed.data.title,
      remark: parsed.data.remark,
    });

    return success(res, result, '分析完成');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /analyses
 * 查询分析历史(分页)
 */
export const listAnalyses: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = listAnalysesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await analysisService.listAnalyses({
      tenantId: req.tenantId,
      userId: req.userId,
      role: req.role,
      query: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        artType: parsed.data.artType as ArtType | undefined,
        status: parsed.data.status as AnalysisStatus | undefined,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        userId: parsed.data.userId,
      },
    });

    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /analyses/:id
 * 查询单条分析详情
 * 数据范围过滤由 service 层基于 role 实现:
 *   - student 仅可查自己创建的(越权返回 404,不泄露存在性)
 *   - teacher / admin / owner 可查租户内任意记录
 */
export const getAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.tenantId || !req.userId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = analysisIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await analysisService.getAnalysis({
      tenantId: req.tenantId,
      analysisId: parsed.data.id,
      userId: req.userId,
      role: req.role,
    });

    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /analyses/:id
 * 删除分析记录
 * 权限校验:requireAnyPermission('analysis:delete:own', 'analysis:delete:tenant')
 * 数据范围:
 *   - admin / owner 可删租户内任意记录
 *   - teacher / student 仅可删自己创建的(越权返回 404,不泄露存在性)
 */
export const deleteAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.tenantId || !req.userId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = analysisIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await analysisService.deleteAnalysis({
      tenantId: req.tenantId,
      analysisId: parsed.data.id,
      operatorUserId: req.userId,
      role: req.role,
    });

    return success(res, result, '已删除');
  } catch (err) {
    return next(err);
  }
};

/**
 * 导出 VALID_ART_TYPES(供 routes 层校验使用)
 */
export { VALID_ART_TYPES };
