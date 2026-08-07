// ============================================================
// AI 图像生成服务(双提供商降级 + 生成调用 + 超时 + URL 提取)
// 对应文档:.trae/documents/m2-generation-plan-2026-08-07.md §2.2 / §2.4
//
// 职责:
//   1. 双提供商降级:主(trae)配置缺失/失败时自动降级到备(glm)
//      (复用 ai-vision.service.ts 的 resolveAIConfig 同源思路,但用独立 AI_IMAGE_* 配置)
//   2. 调用图像生成 API(OpenAI 兼容格式,参照 ai-vision 的 buildRequestBody 风格)
//   3. 超时控制(aiImageTimeout,默认 30s,独立于诊断 2.5s)
//   4. 图片 URL 提取:兼容 data[].url 与 data[].b64_json 两种返回
//   5. 错误分类:超时/网络/HTTP/未知,映射为 AIFailureReason 风格
//
// 范围铁律(M2-T2):
//   - 本层只做"图像生成调用 + 双提供商降级",不实现队列/repository/controller/路由/编排
//     (那是 M2-T3~T5 任务)
//   - 严格遵循冻结契约 api-contract.ts §3.17(GeneratedImage 等),不改契约
//   - 禁止修改 api-contract.ts
//
// 安全:
//   - API Key 经 env 注入,严禁硬编码
//   - 日志不记录完整图片 base64,仅记录 URL/数量/耗时
//   - 不做重试(生成走独立异步队列,由上层编排决定降级/失败策略)
// ============================================================

import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { ArtType, AIFailureReason } from '../types/api-contract.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1. 类型定义
// ============================================================

/**
 * 解析后的有效图像生成 Provider 配置
 */
export interface ResolvedImageAIConfig {
  /** 实际使用的 provider(trae / glm) */
  provider: 'trae' | 'glm';
  /** API Key */
  apiKey: string;
  /** API 端点 URL(OpenAI 兼容格式) */
  apiUrl: string;
  /** 生成模型名 */
  model: string;
  /** 是否发生了降级(trae -> glm) */
  fallback: boolean;
}

/**
 * 图像生成请求(本层入参)
 * 由上层 generation.service 依据冻结契约 CreateGenerationRequest 组装后传入
 */
export interface ImageGenerationRequest {
  /** 生成输入来源(text=文字提示词 / sketch=草稿图) */
  inputType: 'text' | 'sketch';
  /** 文字提示词(text 模式必填) */
  prompt?: string;
  /** 草稿图 URL(sketch 模式必填) */
  sketchImageUrl?: string;
  /** 目标作品类型(透传,供生成后一键诊断) */
  artType: ArtType;
  /** 生成尺寸提示(portrait/landscape/square,默认 square) */
  aspect?: 'portrait' | 'landscape' | 'square';
  /** 生成数量(1-4) */
  count: number;
}

/**
 * 图像生成结果
 * success=true 时 imageUrls 非空;success=false 时 failureReason 非空
 */
export interface ImageGenerationResult {
  success: boolean;
  /** 生成图 URL 列表(失败为 null) */
  imageUrls: string[] | null;
  /** 实际生效提供商(失败/不可用为 null) */
  provider: 'glm' | 'trae' | null;
  /** 实际生效模型(失败/不可用为 null) */
  model: string | null;
  /** 是否经降级(主提供商不可用自动降级) */
  usedFallback: boolean;
  /** 失败原因(success=false 时非空) */
  failureReason: AIFailureReason | null;
  /** 生成耗时(毫秒) */
  durationMs: number;
}

// ============================================================
// 2. 双提供商降级(resolveImageAIConfig)
// ============================================================

/**
 * 根据 env 配置解析实际使用的图像生成 Provider
 *
 * 降级规则(对应 m2-generation-plan §2.2,复用 ai-vision resolveAIConfig 思路,
 * 但使用独立的 AI_IMAGE_* 配置):
 *   1. 主=glm 且 aiImageApiKey 存在 → 使用 glm(正常路径,fallback=false)
 *   2. 主=trae 且 aiImageApiKey + aiImageApiUrl 均非空 → 使用 trae(正常路径,fallback=false)
 *   3. 主=trae 但 aiImageApiKey(或 URL)为空 → 自动降级到 glm
 *      (复用诊断链路 GLM 凭据 aiApiKey 作为备用图像提供商,fallback=true,warning 日志)
 *   4. 双提供商均不可用 → 返回 null(上层标记 GENERATION_PROVIDER_UNAVAILABLE)
 *
 * 说明:env 仅提供一组 AI_IMAGE_*(主提供商配置)。当主=trae 且其配置残缺时,
 * 降级目标复用诊断链路已配置的 GLM 凭据(aiApiKey/aiApiUrl/aiApiModel),
 * 保证"至少一个提供商可用"这一降级目标。
 */
export function resolveImageAIConfig(): ResolvedImageAIConfig | null {
  const cfg = env();

  // 主=glm:要求图像生成 GLM key 可用
  if (cfg.aiImageProvider === 'glm') {
    if (cfg.aiImageApiKey.length === 0) return null;
    return {
      provider: 'glm',
      apiKey: cfg.aiImageApiKey,
      apiUrl: cfg.aiImageApiUrl,
      model: cfg.aiImageApiModel,
      fallback: false,
    };
  }

  // 主=trae:要求 trae 图像配置完整(key + url 均非空)
  const traeReady = cfg.aiImageApiKey.length > 0 && cfg.aiImageApiUrl.length > 0;
  if (traeReady) {
    return {
      provider: 'trae',
      apiKey: cfg.aiImageApiKey,
      apiUrl: cfg.aiImageApiUrl,
      model: cfg.aiImageApiModel,
      fallback: false,
    };
  }

  // TRAE 图像配置缺失 → 降级到 glm(复用诊断 GLM 凭据作为备用)
  if (cfg.aiApiKey.length > 0) {
    logger.warn(
      {
        traeImageKeyEmpty: cfg.aiImageApiKey.length === 0,
        traeImageUrlEmpty: cfg.aiImageApiUrl.length === 0,
      },
      '[image-generation] TRAE image provider not fully configured, falling back to GLM',
    );
    return {
      provider: 'glm',
      apiKey: cfg.aiApiKey,
      apiUrl: cfg.aiApiUrl,
      model: cfg.aiApiModel,
      fallback: true,
    };
  }

  // 双提供商均不可用
  return null;
}

/**
 * 判断图像生成功能是否启用
 * 只要解析出任一可用提供商(主或降级备)即返回 true
 */
export function isImageGenerationEnabled(): boolean {
  return resolveImageAIConfig() !== null;
}

// ============================================================
// 3. 请求体构造(OpenAI 兼容格式)
// ============================================================

/**
 * 生成尺寸映射(portrait/landscape/square → 宽x高)
 * OpenAI 图像生成 API 的 size 参数约定
 */
const ASPECT_SIZE: Record<'portrait' | 'landscape' | 'square', string> = {
  portrait: '768x1024',
  landscape: '1024x768',
  square: '1024x1024',
};

/**
 * 构造图像生成请求体(OpenAI 兼容格式,GLM/TRAE 通用)
 * - text 模式:prompt 直接作为生成提示词
 * - sketch 模式:将草稿图 URL 引用注入 prompt(参考草稿图再生成)
 */
function buildImageRequestBody(req: ImageGenerationRequest, model: string): Record<string, unknown> {
  const size = ASPECT_SIZE[req.aspect ?? 'square'];
  const count = Math.max(1, Math.min(req.count, env().generationMaxCount));

  let prompt: string;
  if (req.inputType === 'sketch') {
    const base = req.prompt?.trim() ? req.prompt.trim() : '基于参考草稿图扩展完成的艺术作品生成';
    prompt = `请参考以下草稿图 ${req.sketchImageUrl ?? ''} 创作高质量艺术作品。生成要求:${base}`;
  } else {
    prompt = req.prompt?.trim() ?? '';
  }

  return {
    model,
    prompt,
    n: count,
    size,
    // 请求 URL 形式返回,便于前端直接引用(由调用方决定是否落库)
    response_format: 'url',
  };
}

// ============================================================
// 4. 图片 URL 提取(兼容 data[].url / data[].b64_json)
// ============================================================

/**
 * 从图像生成 API 响应中提取图片 URL 列表
 * 兼容两种常见返回:
 *   - data[].url:直接返回图片 URL
 *   - data[].b64_json:返回 base64 编码的图像数据,转为 data URL
 *
 * 安全:返回内容仅用于结果,不在此处记录 base64 日志;取到 count 张即停止
 *
 * @param responseData 响应体(axios response.data)
 * @param count 期望提取的张数
 * @returns 提取到的图片 URL 列表(可能为空数组)
 */
export function extractImageUrls(responseData: unknown, count: number): string[] {
  if (!responseData || typeof responseData !== 'object') return [];
  const data = (responseData as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const urls: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { url?: unknown; b64_json?: unknown };
    const url = obj.url;
    const b64 = obj.b64_json;
    if (typeof url === 'string' && url.length > 0) {
      urls.push(url);
    } else if (typeof b64 === 'string' && b64.length > 0) {
      // base64 转 data URL(不落日志,仅作为结果返回)
      urls.push(`data:image/png;base64,${b64}`);
    }
    if (urls.length >= count) break;
  }
  return urls;
}

// ============================================================
// 5. 错误分类(axios error → AIFailureReason)
// ============================================================

/**
 * 将图像生成调用异常映射为 AIFailureReason
 * 超时识别覆盖三类信号(与 ai-vision classifyAxiosError 一致):
 *   1. axios connection timeout:code = ECONNABORTED / ETIMEDOUT
 *   2. AbortController 主动取消:code = ERR_CANCELED 或 name = CanceledError
 *   3. 兼容旧版 axios 取消信号:message 含 'canceled'
 */
function classifyImageAxiosError(err: AxiosError): AIFailureReason {
  if (
    err.code === 'ECONNABORTED' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ERR_CANCELED' ||
    err.name === 'CanceledError' ||
    err.message?.includes('canceled')
  ) {
    return 'AI_TIMEOUT';
  }
  if (
    err.code === 'ENOTFOUND' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNRESET' ||
    err.code === 'EAI_AGAIN' ||
    err.message?.includes('network')
  ) {
    return 'AI_NETWORK_ERROR';
  }
  if (err.response && (err.response.status < 200 || err.response.status >= 300)) {
    return 'AI_HTTP_ERROR';
  }
  return 'AI_UNKNOWN_ERROR';
}

// ============================================================
// 6. 主入口:generateImage
// ============================================================

/**
 * 调用图像生成 API(支持 GLM / TRAE 双 Provider,自动降级)
 *
 * @param req 图像生成请求(text/sketch + artType + aspect + count)
 * @returns ImageGenerationResult 含成功/失败 + 耗时 + 生效提供商/模型
 *
 * SLA/超时:
 *   - 生成超时独立配置(env.aiImageTimeout,默认 30s),不受诊断 2.5s 限制
 *   - 双层超时保障:axios timeout + AbortController wall-clock deadline
 *   - 不重试(失败交上层异步任务标记 failed,由编排层决定是否降级/重试)
 *
 * Provider 选择:根据 AI_IMAGE_PROVIDER 配置,主提供商不可用时自动降级
 */
export async function generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const cfg = env();
  const startMs = Date.now();

  // 前置检查:解析有效 Provider 配置(含自动降级逻辑)
  const resolved = resolveImageAIConfig();
  if (!resolved) {
    return {
      success: false,
      imageUrls: null,
      provider: null,
      model: null,
      usedFallback: false,
      failureReason: 'AI_KEY_MISSING',
      durationMs: Date.now() - startMs,
    };
  }

  const { apiKey, apiUrl, model, provider: usedProvider, fallback } = resolved;

  // 构造请求体(OpenAI 兼容格式)
  const requestBody = buildImageRequestBody(req, model);

  // 双层超时保障:axios timeout + AbortController wall-clock deadline(独立 aiImageTimeout)
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), cfg.aiImageTimeout);

  try {
    const response: AxiosResponse = await axios.post(apiUrl, requestBody, {
      timeout: cfg.aiImageTimeout,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // 不让 axios 抛 4xx/5xx,统一在错误分类处理
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const durationMs = Date.now() - startMs;

    // 提取图片 URL(兼容 data[].url / data[].b64_json)
    const imageUrls = extractImageUrls(response.data, req.count);
    if (imageUrls.length === 0) {
      logger.warn(
        { durationMs, usedProvider, fallback, model },
        '[image-generation] response returned no image urls',
      );
      return {
        success: false,
        imageUrls: null,
        provider: usedProvider,
        model,
        usedFallback: fallback,
        failureReason: 'AI_PARSE_ERROR',
        durationMs,
      };
    }

    // 日志仅记录数量/耗时/提供商,不记录 base64
    logger.info(
      {
        durationMs,
        imageCount: imageUrls.length,
        usedProvider,
        fallback,
        model,
      },
      '[image-generation] generation success',
    );

    return {
      success: true,
      imageUrls,
      provider: usedProvider,
      model,
      usedFallback: fallback,
      failureReason: null,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const axiosErr = err as AxiosError;
    const reason = classifyImageAxiosError(axiosErr);
    logger.warn(
      {
        durationMs,
        reason,
        status: axiosErr.response?.status,
        errCode: axiosErr.code,
        model,
        usedProvider,
        fallback,
      },
      '[image-generation] generation failed',
    );
    return {
      success: false,
      imageUrls: null,
      provider: usedProvider,
      model,
      usedFallback: fallback,
      failureReason: reason,
      durationMs,
    };
  } finally {
    // 清理 AbortController 定时器,防止内存泄漏
    clearTimeout(abortTimer);
  }
}