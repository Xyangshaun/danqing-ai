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
import { analysisService } from '../services/analysis.service.js';
import { success, error } from '../utils/response.js';
import { ErrorCode, type ArtType, type AnalysisStatus } from '../types/api-contract.js';

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

    const result = await analysisService.createAnalysis({
      tenantId: req.tenantId,
      userId: req.userId,
      body: parsed.data,
    });

    return success(res, result, '分析完成');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /analyses/upload
 * 提交分析任务(文件上传模式,multipart/form-data)
 * multer 中间件已在 routes 层注入,此处从 req.file 读取
 */
export const uploadAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    // multer 单文件字段名:image
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      return error(res, ErrorCode.FILE_EMPTY, '缺少上传文件:image', 400);
    }

    // 表单字段校验(artType 必填,title/remark 可选)
    const parsed = uploadFormSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await analysisService.createAnalysisFromUpload({
      tenantId: req.tenantId,
      userId: req.userId,
      artType: parsed.data.artType,
      localImagePath: file.path,
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
 */
export const getAnalysis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.tenantId) {
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
    });

    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};

/**
 * 导出 VALID_ART_TYPES(供 routes 层校验使用)
 */
export { VALID_ART_TYPES };
