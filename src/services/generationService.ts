// ============================================================
// 丹青有AI - AI 图像生成 API 客户端(M2-T7 前端生成入口)
// ------------------------------------------------------------
// 对应冻结契约:server/src/types/api-contract.ts §3.17(AI 图像生成)
// 对应文档:.trae/documents/m2-generation-plan-2026-08-07.md §4
//
// 设计要点:
//   1. 复用 api.ts 的 post/get 封装:自动注入 CSRF 头(读 csrf_token Cookie)、
//      Authorization(Bearer access_token)、统一 ApiResponse 解包与错误码抛错
//   2. 不硬编码 localhost:api.ts 内部用 VITE_API_BASE_URL 或相对路径 /api/v1,
//      生产环境同源解析到 www.danqing.site/api/v1
//   3. 前端只读副本 src/types/api-contract.ts §3.17 缺少 CreateGenerationRequest /
//      GetGenerationResponse 两个类型(仅含 GeneratedImage/CreateGenerationResponse 等),
//      此处按冻结契约原文定义本地镜像类型(与 api.ts 批删类型的同源做法一致),
//      不修改只读副本。
//
// 接口:
//   POST /generation        创建生成任务(异步,返回 taskId + 初始状态)
//   GET  /generation/:id    查询生成任务(供轮询 pending→success/failed)
// ------------------------------------------------------------
// 教学闭环(一键诊断)说明:
//   M2-T6 声称接线了 submitForAnalysis,但 server/src/routes/generation.routes.ts
//   仅暴露 POST /generation 与 GET /generation/:id,**未暴露 submitForAnalysis 的
//   HTTP 端点**。按任务指令"若路由未暴露,则前端先只做生成+展示,一键诊断按钮标注占位",
//   故 submitForAnalysis 此处为占位实现(抛错),由页面层将"一键诊断"按钮渲染为占位态,
//   待后端 M2 教学闭环接入真实端点后再补足。
// ============================================================

import { post, get } from './api';
import type {
  ArtType,
  CreateGenerationResponse,
  GeneratedImage,
  GenerationInputType,
  GenerationStatus,
  ReviewStatus,
} from '../types/api-contract';

/* ============================================================
 * 本地镜像类型(镜像冻结契约 §3.17,前端只读副本缺失,见文件头注释)
 * ============================================================ */

/** POST /api/v1/generation 请求体(镜像冻结契约 §3.17) */
export interface CreateGenerationRequest {
  /** 生成输入类型(text 文字 / sketch 草稿图) */
  inputType: GenerationInputType;
  /** 文字提示词(text 模式必填) */
  prompt?: string;
  /** 草稿图 URL(sketch 模式必填,基于已有上传图) */
  sketchImageUrl?: string;
  /** 目标作品类型(用于生成后一键进入诊断,默认 painting) */
  artType?: ArtType;
  /** 生成尺寸提示(可选:portrait/landscape/square) */
  aspect?: 'portrait' | 'landscape' | 'square';
  /** 生成数量(默认 1,上限 4) */
  count?: number;
  /** 同步模式:true 时直接同步生成并返回结果,不走异步队列 */
  sync?: boolean;
}

/** GET /api/v1/generation/:id 响应(镜像冻结契约 §3.17) */
export interface GetGenerationResponse {
  taskId: string;
  tenantId: string;
  status: GenerationStatus;
  /** 生成结果(status=success 时非空) */
  images: GeneratedImage[] | null;
  /** 失败原因(status=failed 时非空) */
  failureReason: string | null;
  /** 是否经过降级(主提供商失败自动降级备用服务) */
  usedFallback: boolean;
  createdAt: string;
  completedAt: string | null;
}

/* ============================================================
 * 业务错误码常量(镜像冻结契约 DOC-2026-08-008,前端 ErrorCode 枚举缺失生成码)
 * 用于配额超限 / 限流等差异化友好提示
 * ============================================================ */

/** 生成配额已用完(HTTP 402) */
export const GENERATION_QUOTA_EXCEEDED = 6101;
/** 生成接口被限流(HTTP 429,5 次/分钟/用户) */
export const GENERATION_RATE_LIMITED = 6106;

/* ============================================================
 * API 方法
 * ============================================================ */

/**
 * 创建 AI 生成任务
 * @param payload 生成请求体(见 CreateGenerationRequest)
 * @returns 任务摘要(taskId + 初始状态;异步模式 images=null,需轮询 getGeneration)
 */
export function createGeneration(payload: CreateGenerationRequest): Promise<CreateGenerationResponse> {
  return post<CreateGenerationResponse>('/generation', payload);
}

/**
 * 查询生成任务详情(轮询用)
 * @param id 生成任务 ID
 * @returns 任务详情(含 status / images / failureReason / usedFallback)
 */
export function getGeneration(id: string): Promise<GetGenerationResponse> {
  return get<GetGenerationResponse>(`/generation/${id}`);
}

/**
 * 教学闭环:把生成图提交为诊断(一键诊断)
 *
 * ⚠️ 占位实现:后端 generation.routes 未暴露 submitForAnalysis 端点。
 * 按 M2-T7 任务指令,此函数暂不发起真实请求,仅抛错提示;
 * 页面层将"一键诊断"按钮渲染为占位态(toast 提示功能即将上线)。
 * 待后端 M2 教学闭环接入真实端点后,在此改为实际 POST 调用并返回分析任务 ID。
 *
 * @param generationId 生成任务 ID
 */
export async function submitForAnalysis(_generationId: string): Promise<never> {
  throw new Error(
    '教学闭环接口尚未开放(后端未暴露 submitForAnalysis 端点),一键诊断功能即将上线'
  );
}

/* ============================================================
 * 类型再导出(供页面层使用,避免从只读副本逐项 import 的遗漏)
 * ============================================================ */

export type {
  GeneratedImage,
  GenerationStatus,
  GenerationInputType,
  ReviewStatus,
  ArtType,
  CreateGenerationResponse,
};
