// ============================================================
// AI 图像生成 Controller(M2-T5)
// 对应 API(冻结契约 api-contract.ts §3.17):
//   POST /generation    (创建生成任务,返回 201 + CreateGenerationResponse)
//   GET  /generation/:id(查询生成任务,返回 GetGenerationResponse)
//
// 对应文档:.trae/documents/m2-generation-plan-2026-08-07.md §4
//
// 职责(与 analysis.controller 同源风格):
//   - controller 不写业务逻辑,仅做参数透传 + 响应序列化
//   - 所有外部输入经 Zod 校验(结构校验失败 → PARAM_INVALID 1001/400)
//   - 条件校验(text 需 prompt / sketch 需 sketchImageUrl)由
//     generation.service.validateInput 完成 → GENERATION_IMAGE_INVALID(6105)
//   - 多租户强制:tenantId/userId/role 由 auth 中间件注入,禁止从请求体读取
//   - 错误统一经 BusinessError/next(err) → errorHandler 处理,不暴露堆栈
// ============================================================

import type { RequestHandler } from 'express';
import { z } from 'zod';
import { generationService } from '../services/generation.service.js';
import { success, created, error } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/** artType 校验(四类艺术形式,预检 → 友好错误信息) */
const artTypeSchema = z.enum(
  ['painting', 'design', 'product', 'sculpture'],
  { message: 'artType 必须为 painting/design/product/sculpture 之一' },
);

/** inputType 校验(text / sketch) */
const inputTypeSchema = z.enum(
  ['text', 'sketch'],
  { message: 'inputType 必须为 text/sketch 之一' },
);

/**
 * POST /generation 请求体 schema
 * 对应冻结契约 CreateGenerationRequest
 *   - inputType 必填
 *   - text 需 prompt / sketch 需 sketchImageUrl(条件校验在 service 层,6105)
 *   - count 上限受 env().generationMaxCount 约束(默认 4,对应契约 count 上限)
 */
const createGenerationBodySchema = z
  .object({
    inputType: inputTypeSchema,
    prompt: z
      .string()
      .trim()
      .min(1, 'prompt 不能为空')
      .max(2000, 'prompt 长度不能超过 2000')
      .optional(),
    sketchImageUrl: z
      .string()
      .trim()
      .url('sketchImageUrl 必须为合法 URL')
      .max(2048, 'sketchImageUrl 长度不能超过 2048')
      .optional(),
    artType: artTypeSchema.optional(),
    aspect: z
      .enum(['portrait', 'landscape', 'square'], { message: 'aspect 必须为 portrait/landscape/square 之一' })
      .optional(),
    count: z
      .coerce
      .number()
      .int('count 必须为整数')
      .min(1, 'count 至少为 1')
      .max(env().generationMaxCount, `count 不能超过 ${env().generationMaxCount}`)
      .optional(),
    /** 同步模式:为 true 时直接同步生成并返回最终结果,不走异步队列(前端快速体验用) */
    sync: z.boolean().optional(),
  })
  .refine(
    (data) => data.inputType === 'text' ? !!data.prompt?.trim() : true,
    { message: '文字模式必须提供 prompt 提示词', path: ['prompt'] },
  )
  .refine(
    (data) => data.inputType === 'sketch' ? !!data.sketchImageUrl?.trim() : true,
    { message: '草图模式必须提供 sketchImageUrl 草稿图地址', path: ['sketchImageUrl'] },
  );

/** GET /generation/:id 路径参数 schema */
const generationIdParamSchema = z.object({
  id: z.string().min(1, '缺少必填参数:id'),
});

/**
 * POST /generation
 * 创建 AI 图像生成任务(异步,返回 201 + pending 状态,前端轮询 GET)
 *
 * 3 秒 SLA:生成走异步队列,不阻塞诊断主链路;本接口同步返回任务创建结果
 * (pending 或降级同步模式下的最终状态,由 service 决策)
 */
export const createGeneration: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.tenantId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = createGenerationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await generationService.createGeneration({
      tenantId: req.tenantId,
      userId: req.userId,
      body: parsed.data,
      traceId: req.traceId,
    });

    logger.debug(
      {
        taskId: result.taskId,
        status: result.status,
        tenantId: req.tenantId,
      },
      '[generation.controller] createGeneration response',
    );

    return created(res, result, '生成任务已创建');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /generation/:id
 * 查询生成任务详情
 * 数据范围过滤由 service 层基于 role 实现:
 *   - 跨租户 → 404(不泄露存在性)
 *   - student 查询他人记录 → 404(强制 ownership)
 *   - teacher/admin/owner 可查租户内任意
 */
export const getGeneration: RequestHandler = async (req, res, next) => {
  try {
    if (!req.tenantId || !req.userId || !req.role) {
      return error(res, ErrorCode.UNAUTHORIZED, '未授权,请先登录', 401);
    }

    const parsed = generationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = `参数错误:${first?.path.join('.') ?? 'unknown'} ${first?.message ?? 'invalid'}`;
      return error(res, ErrorCode.PARAM_INVALID, msg, 400);
    }

    const result = await generationService.getGeneration({
      tenantId: req.tenantId,
      generationId: parsed.data.id,
      userId: req.userId,
      role: req.role,
    });

    return success(res, result, 'success');
  } catch (err) {
    return next(err);
  }
};
