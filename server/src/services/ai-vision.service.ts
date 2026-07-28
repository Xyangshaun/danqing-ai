// ============================================================
// AI 视觉分析服务(GLM-4V API 客户端 + Prompt 工程 + 超时 + Fallback)
// 对应文档:.trae/documents/ai-integration-design.md §2-§3
//
// 职责:
//   1. 构造系统/用户 Prompt(参考 art-evaluation-standards.md 美院规范)
//   2. 调用智谱 GLM-4V API(OpenAI 兼容格式)
//   3. 超时控制(硬性 2.5s,触发即切断走 fallback)
//   4. 响应解析:JSON 提取 + Zod schema 校验 + delta clamp ±5
//   5. 错误分类:超时/HTTP/解析/Schema/网络,映射为 AIFailureReason
//
// SLA 约束:
//   - 单次 AI 调用 ≤ 2.5s(由 env.AI_API_TIMEOUT 控制)
//   - 不重试(重试会突破 3s SLA)
//   - 失败即返回,由 ai-analysis.service.ts 决定 fallback 策略
//
// 安全:
//   - API Key 通过 env 注入,禁止硬编码
//   - 日志不记录完整图片 base64,仅记录 URL/尺寸/耗时
//   - 用户输入仅 artType(枚举)/title/remark,经 Zod 校验,无自由 prompt
// ============================================================

import axios, { type AxiosError, type AxiosResponse } from 'axios';
import { z } from 'zod';
import type {
  ArtType,
} from '../types/api-contract.js';
import type {
  AIVisionRequest,
  AIVisionResult,
  AIFailureReason,
  ProfessionalSuggestion,
  SuggestionLevel,
  JimpMetricsForPrompt,
} from '../types/ai-analysis.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1. Prompt 工程
// ============================================================

/**
 * 作品类型中文标签(注入 prompt)
 */
const ART_TYPE_LABEL: Record<ArtType, string> = {
  painting: '绘画',
  design: '设计',
  product: '产品设计',
  sculpture: '雕塑',
};

/**
 * 各作品类型的维度上下文(对应 art-evaluation-standards.md 四类作品四维度)
 * 注入用户 prompt,告知 AI 应关注的维度与权重
 */
const DIMENSION_CONTEXT: Record<ArtType, string> = {
  painting:
    '绘画四维度(权重均等 25%):构图与造型 / 色彩表现 / 笔触与技法 / 整体与完整。\n' +
    '术语规范:明度九阶、黄金分割点定位、计白当黑、冷暖对比、条件色、固有色、笔触肌理、干湿画法。',
  design:
    '设计四维度:视觉层次(25%) / 排版与构成(25%) / 色彩应用(20%) / 创意表达(30%)。\n' +
    '术语规范:视觉层级、网格系统、负空间、信息流动、对齐规范、品牌一致性、色彩心理、视觉张力。',
  product:
    '产品设计四维度:形态语义(30%) / 材质表现(25%) / 功能表达(25%) / 人机工程(20%)。\n' +
    '术语规范:比例协调、线条流畅度、曲面质量、人机工学、材质语义、光影表现、结构清晰、功能暗示。',
  sculpture:
    '雕塑四维度:空间构成(30%) / 形体语言(30%) / 材料语言(25%) / 观念表达(15%)。\n' +
    '术语规范:体积感、空间占有、虚实关系、动态感、张力、韵律、材料特性、肌理表现、质感层次。',
};

/**
 * 构造系统提示词(对应 ai-integration-design.md §3.1)
 * 固定不可用户篡改,定义 AI 角色 + 校准总则 + 输出 JSON 结构
 */
export function buildSystemPrompt(artType: ArtType): string {
  const label = ART_TYPE_LABEL[artType];
  return [
    `你是中央美术学院/中国美术学院/清华美术学院的资深教授,拥有 20 年教学经验。`,
    `请严格按照《丹青有AI 美院评分标准》对学生的${label}作业进行专业诊断。`,
    ``,
    `校准总则(六条底线):`,
    `1. 术语专业:一律使用美院规范术语(如"明度九阶"而非"亮暗层次","黄金分割点定位"而非"主体位置好不好")`,
    `2. 评分有据:每个分数档必须对应可识别的视觉特征,禁止主观印象打分`,
    `3. 建议可执行:每条建议须含"具体操作 + 参考案例 + 练习路径"三要素,禁止"加强构图"式空泛反馈`,
    `4. 尊重多元:区分"基础性问题"与"风格选择":基础问题必须纠正,风格问题可讨论`,
    `5. 因类制宜:绘画重"再现与表达",设计重"创意与逻辑",产品重"语义与可行",雕塑重"空间与观念"`,
    `6. 致广大:评分兼顾"尽精微"(子指标量化)与"致广大"(整体气韵)`,
    ``,
    `你必须严格输出 JSON 格式(无 markdown 代码块,无解释性文字),结构如下:`,
    `{`,
    `  "semantic_theme": "主题与意境理解(50-100字,描述作品传达的主题、情感、意境)",`,
    `  "style_recognition": "风格识别(如'印象派条件色处理'/'古典写实明暗塑造'/'极简主义网格构成'等)",`,
    `  "professional_suggestions": [`,
    `    {`,
    `      "dimension": "维度名(构图与造型/色彩表现/笔触与技法/整体与完整/视觉层次/排版与构成/色彩应用/创意表达/形态语义/材质表现/功能表达/人机工程/空间构成/形体语言/材料语言/观念表达)",`,
    `      "level": "优|良|中|差",`,
    `      "operation": "具体操作(含数值/位置/方法,如'将主体从画面正中向左下偏移 1/3,使其落于黄金分割点')",`,
    `      "reference": "参考案例(美术史作品,如'塞尚《静物》三角构图')",`,
    `      "practice": "练习路径(1-2 个针对性练习,如'对同一组静物做 4 种构图变体速写')"`,
    `    }`,
    `  ],`,
    `  "score_adjustments": {`,
    `    "dimension_adjustments": [`,
    `      { "dimension": "维度名", "delta": -5~+5 的整数, "reason": "校准理由(基于视觉特征)" }`,
    `    ],`,
    `    "overall_delta": -5~+5 的整数,`,
    `    "overall_reason": "整体校准理由"`,
    `  },`,
    `  "reference_artworks": [`,
    `    { "title": "作品名", "artist": "艺术家", "reason": "推荐理由(与本作业的关联)" }`,
    `  ]`,
    `}`,
  ].join('\n');
}

/**
 * 构造用户提示词(对应 ai-integration-design.md §3.2)
 * 包含:作品类型 + 维度上下文 + Jimp 客观像素数据(供 AI 校准参考)
 */
export function buildUserPrompt(req: AIVisionRequest): string {
  const label = ART_TYPE_LABEL[req.artType];
  const dimensionContext = DIMENSION_CONTEXT[req.artType];
  const m = req.jimpMetrics;

  const lines: string[] = [
    `请分析这幅${label}作业。`,
    ``,
    dimensionContext,
  ];

  if (req.title) {
    lines.push(``, `作品标题:${req.title}`);
  }
  if (req.remark) {
    lines.push(`作业要求(教师备注):${req.remark}`);
  }

  if (m) {
    lines.push(
      ``,
      `已知客观像素数据(供你校准评分时参考,不要重复罗列):`,
      `- 视觉重心:(${m.focusX.toFixed(2)}, ${m.focusY.toFixed(2)})`,
      `- 留白比例:${(m.whitespaceRatio * 100).toFixed(1)}%`,
      `- 暖冷比:${(m.warmRatio * 100).toFixed(0)}:${(m.coolRatio * 100).toFixed(0)}`,
      `- 主色调:${m.dominantColor}`,
      `- 平均亮度:${m.avgLuminance.toFixed(0)} / 255`,
      `- 平均饱和度:${m.avgSaturation.toFixed(0)} / 100`,
      `- 对比度等级:${m.contrast}`,
      `- 纹理复杂度:${m.textureComplexity.toFixed(2)}`,
      `- 边缘密度:${m.edgeDensity.toFixed(2)}`,
    );
  }

  lines.push(
    ``,
    `请基于以上客观数据 + 你的视觉理解,输出 JSON 诊断结果。`,
    `重点:professional_suggestions 必须具体可执行,score_adjustments 的 delta 范围 ±5 防止偏差。`,
  );

  return lines.join('\n');
}

// ============================================================
// 2. Zod Schema 校验 + delta clamp
// ============================================================

/**
 * 中文等级 → 英文枚举映射
 * AI 可能返回"优/良/中/差"或"excellent/good/average/poor",统一归一化
 */
const LEVEL_MAP: Record<string, SuggestionLevel> = {
  优: 'excellent',
  良: 'good',
  中: 'average',
  差: 'poor',
  excellent: 'excellent',
  good: 'good',
  average: 'average',
  poor: 'poor',
};

/**
 * 将 AI 返回的 level 字段归一化为 SuggestionLevel
 * 接受中英文,未知值降级为 'average'
 */
function normalizeLevel(raw: unknown): SuggestionLevel {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (LEVEL_MAP[trimmed]) return LEVEL_MAP[trimmed]!;
    // 大小写容错
    const lower = trimmed.toLowerCase();
    if (LEVEL_MAP[lower]) return LEVEL_MAP[lower]!;
  }
  return 'average';
}

/**
 * delta 强制 clamp 到 [-5, +5] 并取整
 * 防止 AI 输出异常值导致评分大幅偏差
 */
function clampDelta(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.max(-5, Math.min(5, rounded));
}

/**
 * Zod schema:维度级评分校准
 * 宽松校验(字段可任意类型)→ preprocess 归一化 → 严格输出
 */
const dimensionAdjustmentSchema = z
  .object({
    dimension: z.unknown(),
    delta: z.unknown(),
    reason: z.unknown(),
  })
  .transform((d) => ({
    dimension: typeof d.dimension === 'string' ? d.dimension : '未知维度',
    delta: clampDelta(d.delta),
    reason: typeof d.reason === 'string' ? d.reason : '',
  }));

/**
 * Zod schema:专业改进建议
 */
const professionalSuggestionSchema = z
  .object({
    dimension: z.unknown(),
    level: z.unknown(),
    operation: z.unknown(),
    reference: z.unknown(),
    practice: z.unknown(),
  })
  .transform((s) => ({
    dimension: typeof s.dimension === 'string' ? s.dimension : '未知维度',
    level: normalizeLevel(s.level),
    operation: typeof s.operation === 'string' ? s.operation : '',
    reference: typeof s.reference === 'string' ? s.reference : '',
    practice: typeof s.practice === 'string' ? s.practice : '',
  }));

/**
 * Zod schema:参考案例
 */
const referenceArtworkSchema = z
  .object({
    title: z.unknown(),
    artist: z.unknown(),
    reason: z.unknown(),
  })
  .transform((r) => ({
    title: typeof r.title === 'string' ? r.title : '',
    artist: typeof r.artist === 'string' ? r.artist : '',
    reason: typeof r.reason === 'string' ? r.reason : '',
  }));

/**
 * Zod schema:完整 AI 响应
 * 字段缺失时用默认值填充,保证结构完整
 */
const aiVisionResultSchema = z
  .object({
    semantic_theme: z.unknown(),
    style_recognition: z.unknown(),
    professional_suggestions: z.unknown(),
    score_adjustments: z.unknown(),
    reference_artworks: z.unknown(),
  })
  .transform((raw) => {
    // professional_suggestions:必须是数组,否则空数组
    const suggestionsRaw = Array.isArray(raw.professional_suggestions)
      ? raw.professional_suggestions
      : [];
    const professionalSuggestions = suggestionsRaw
      .map((s) => {
        const parsed = professionalSuggestionSchema.safeParse(s);
        return parsed.success ? parsed.data : null;
      })
      .filter((s): s is ProfessionalSuggestion => s !== null);

    // score_adjustments:对象或缺失,缺失用默认
    const sa = (raw.score_adjustments ?? {}) as Record<string, unknown>;
    const dimAdjRaw = Array.isArray(sa.dimension_adjustments)
      ? sa.dimension_adjustments
      : [];
    const dimensionAdjustments = dimAdjRaw
      .map((d) => {
        const parsed = dimensionAdjustmentSchema.safeParse(d);
        return parsed.success ? parsed.data : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    // reference_artworks:数组或缺失
    const refRaw = Array.isArray(raw.reference_artworks) ? raw.reference_artworks : [];
    const referenceArtworks = refRaw
      .map((r) => {
        const parsed = referenceArtworkSchema.safeParse(r);
        return parsed.success ? parsed.data : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const result: AIVisionResult = {
      semanticTheme:
        typeof raw.semantic_theme === 'string' ? raw.semantic_theme : '',
      styleRecognition:
        typeof raw.style_recognition === 'string' ? raw.style_recognition : '',
      professionalSuggestions,
      scoreAdjustments: {
        dimensionAdjustments,
        overallDelta: clampDelta(sa.overall_delta),
        overallReason:
          typeof sa.overall_reason === 'string' ? sa.overall_reason : '',
      },
      referenceArtworks,
    };
    return result;
  });

// ============================================================
// 3. JSON 提取工具(容错 AI 返回非纯 JSON)
// ============================================================

/**
 * 从 AI 响应 content 中提取 JSON 对象
 * 处理场景:
 *   1. 纯 JSON:`{"semantic_theme":"..."}`
 *   2. markdown 代码块:` ```json\n{...}\n``` `
 *   3. 含前后解释文字:`好的,以下是分析结果:{...}`
 *
 * @returns 解析后的对象;失败返回 null
 */
export function extractJsonFromContent(content: string): unknown | null {
  if (!content || typeof content !== 'string') return null;

  // 场景 1:去除 markdown 代码块包裹
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1]! : content;

  // 场景 2:提取首尾 {} 之间内容
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  const jsonStr = candidate.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ============================================================
// 4. 错误分类(axios error → AIFailureReason)
// ============================================================

/**
 * 将 axios 异常映射为 AIFailureReason
 * 用于可观测性分类统计
 */
function classifyAxiosError(err: AxiosError): AIFailureReason {
  // 超时:axios code = ECONNABORTED 或 ETIMEDOUT
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return 'AI_TIMEOUT';
  }
  // 网络层错误(DNS 解析失败 / 连接拒绝 / 连接重置)
  if (
    err.code === 'ENOTFOUND' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNRESET' ||
    err.code === 'EAI_AGAIN' ||
    err.message?.includes('network')
  ) {
    return 'AI_NETWORK_ERROR';
  }
  // HTTP 状态码非 2xx
  if (err.response && (err.response.status < 200 || err.response.status >= 300)) {
    return 'AI_HTTP_ERROR';
  }
  return 'AI_UNKNOWN_ERROR';
}

// ============================================================
// 5. AI 调用结果类型
// ============================================================

/**
 * AI 视觉分析调用结果
 * success=true 时 result 非空;success=false 时 failureReason 非空
 */
export interface AIVisionCallResult {
  success: boolean;
  result: AIVisionResult | null;
  failureReason: AIFailureReason | null;
  durationMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================
// 6. 图片源转 base64(本地文件场景)
// ============================================================

/**
 * 判断 imageSource 是否为 URL(http/https)
 */
function isUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

/**
 * 读取本地文件并转为 base64 data URL
 * 用于上传模式(imageSource 为本地 multer 文件路径)
 *
 * @throws Error 文件读取失败
 */
async function readFileAsDataUrl(filePath: string): Promise<string> {
  const { promises: fs } = await import('node:fs');
  const { extname } = await import('node:path');
  const buf = await fs.readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ============================================================
// 7. GLM-4V API 请求体构造
// ============================================================

/**
 * GLM-4V API 请求消息体(OpenAI 兼容格式)
 */
interface GlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

interface GlmRequestBody {
  model: string;
  messages: GlmChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

/**
 * 构造 GLM-4V 请求体
 * - system 消息:固定 prompt
 * - user 消息:文本 + 图片(URL 或 base64)
 */
function buildRequestBody(req: AIVisionRequest, model: string): GlmRequestBody {
  const systemPrompt = buildSystemPrompt(req.artType);
  const userPrompt = buildUserPrompt(req);

  // 图片输入:URL 直传,本地文件转 base64(由调用方预处理)
  // 这里 imageSource 已由 analyzeWithAI 预处理为 URL 或 data URL
  const imageUrl = req.imageSource;

  const body: GlmRequestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0.3, // 低温度保证输出稳定
    max_tokens: 1500, // 限制输出长度,加速响应
    stream: false,
  };
  return body;
}

// ============================================================
// 8. 主入口:analyzeWithAI
// ============================================================

/**
 * 调用 GLM-4V 进行视觉分析
 *
 * @param req AI 视觉分析请求(图片源 + 作品类型 + Jimp 指标)
 * @returns AIVisionCallResult 含成功/失败信息 + 耗时 + token 用量
 *
 * SLA:超时硬性 2.5s(env.AI_API_TIMEOUT),超时即切断,不重试
 */
export async function analyzeWithAI(req: AIVisionRequest): Promise<AIVisionCallResult> {
  const cfg = env();
  const startMs = Date.now();
  const model = cfg.aiApiModel;

  // 前置检查:API Key 必须配置
  if (!cfg.aiApiKey) {
    return {
      success: false,
      result: null,
      failureReason: 'AI_KEY_MISSING',
      durationMs: Date.now() - startMs,
    };
  }

  // 预处理图片源:本地文件转 base64 data URL
  let imageSourceForApi = req.imageSource;
  if (!isUrl(req.imageSource)) {
    try {
      imageSourceForApi = await readFileAsDataUrl(req.imageSource);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: msg, artType: req.artType },
        '[ai-vision] read local image as base64 failed',
      );
      return {
        success: false,
        result: null,
        failureReason: 'AI_UNKNOWN_ERROR',
        durationMs: Date.now() - startMs,
      };
    }
  }

  // 构造请求体(用预处理后的 imageSource)
  const bodyReq: AIVisionRequest = {
    ...req,
    imageSource: imageSourceForApi,
  };
  const requestBody = buildRequestBody(bodyReq, model);

  try {
    const response: AxiosResponse = await axios.post(cfg.aiApiUrl, requestBody, {
      timeout: cfg.aiApiTimeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.aiApiKey}`,
      },
      // 不让 axios 抛 4xx/5xx,统一在响应拦截处理
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const durationMs = Date.now() - startMs;

    // 解析响应:提取 choices[0].message.content
    const data = response.data as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      logger.warn(
        { durationMs, hasChoices: !!data?.choices },
        '[ai-vision] response missing content',
      );
      return {
        success: false,
        result: null,
        failureReason: 'AI_PARSE_ERROR',
        durationMs,
      };
    }

    // 提取 JSON
    const jsonRaw = extractJsonFromContent(content);
    if (jsonRaw === null) {
      logger.warn(
        { durationMs, contentPreview: content.slice(0, 200) },
        '[ai-vision] extract JSON from content failed',
      );
      return {
        success: false,
        result: null,
        failureReason: 'AI_PARSE_ERROR',
        durationMs,
      };
    }

    // Zod schema 校验 + 默认值填充
    const parsed = aiVisionResultSchema.safeParse(jsonRaw);
    if (!parsed.success) {
      logger.warn(
        { durationMs, zodError: parsed.error.issues.slice(0, 3) },
        '[ai-vision] schema validation failed',
      );
      return {
        success: false,
        result: null,
        failureReason: 'AI_SCHEMA_ERROR',
        durationMs,
      };
    }

    const tokenUsage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined;

    logger.info(
      {
        durationMs,
        artType: req.artType,
        model,
        suggestionsCount: parsed.data.professionalSuggestions.length,
        overallDelta: parsed.data.scoreAdjustments.overallDelta,
        tokenUsage,
      },
      '[ai-vision] analysis success',
    );

    return {
      success: true,
      result: parsed.data,
      failureReason: null,
      durationMs,
      tokenUsage,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const axiosErr = err as AxiosError;
    const reason = classifyAxiosError(axiosErr);
    const status = axiosErr.response?.status;
    logger.warn(
      {
        durationMs,
        reason,
        status,
        errCode: axiosErr.code,
        errMessage: axiosErr.message?.slice(0, 200),
        model,
      },
      '[ai-vision] analysis failed',
    );
    return {
      success: false,
      result: null,
      failureReason: reason,
      durationMs,
    };
  }
}

// ============================================================
// 9. 工具函数导出(供测试使用)
// ============================================================

/**
 * 判断 AI 功能是否启用
 * 同时满足:env.AI_ENABLED=true 且 AI_API_KEY 非空
 */
export function isAIEnabled(): boolean {
  const cfg = env();
  return cfg.aiEnabled && cfg.aiApiKey.length > 0;
}

/**
 * 从 AnalysisResult 中提取 Jimp 指标,用于注入 AI prompt
 * 避免重复计算,直接从已有结果中读取
 */
export function extractJimpMetricsFromResult(
  result: import('../types/api-contract.js').AnalysisResult,
): JimpMetricsForPrompt {
  const dims = result.dimensions;
  // 不同作品类型,客观指标字段位置不同,统一提取
  let focusX = 0.5;
  let focusY = 0.5;
  let whitespaceRatio = 0.4;
  let warmRatio = 0.5;
  let coolRatio = 0.5;
  let dominantColor = '中性色';
  let avgLuminance = 128;
  let avgSaturation = 50;
  let contrast: 'high' | 'medium' | 'low' = 'medium';
  let textureComplexity = 0.4;
  let edgeDensity = 0.1;

  if (dims.type === 'painting') {
    focusX = dims.composition.focusPoint.x;
    focusY = dims.composition.focusPoint.y;
    whitespaceRatio = dims.composition.whitespaceRatio;
    warmRatio = dims.color.warmRatio;
    coolRatio = dims.color.coolRatio;
    dominantColor = dims.color.dominantColor;
    contrast = dims.color.contrast;
    // 估算平均饱和度(从 saturation 等级反推数值区间)
    avgSaturation = dims.color.saturation === 'high' ? 70 : dims.color.saturation === 'low' ? 20 : 45;
    // 估算纹理复杂度
    textureComplexity = dims.brushwork.textureLevel === 'rich' ? 0.7 : dims.brushwork.textureLevel === 'simple' ? 0.2 : 0.45;
    edgeDensity = dims.brushwork.strokeVariety / 100;
  } else if (dims.type === 'design') {
    focusX = dims.visualHierarchy.focusPoint.x;
    focusY = dims.visualHierarchy.focusPoint.y;
    contrast = dims.colorApplication.contrast;
    // design 没有 whitespaceRatio 字段,用 negativeSpaceUsage 估算
    whitespaceRatio = dims.typography.negativeSpaceUsage === 'good' ? 0.4 : dims.typography.negativeSpaceUsage === 'poor' ? 0.15 : 0.25;
    warmRatio = 0.5;
    coolRatio = 0.5;
    dominantColor = '设计配色';
    avgSaturation = dims.typography.rhythmConsistency === 'good' ? 30 : 55;
    textureComplexity = 0.4;
    edgeDensity = dims.typography.gridAdherence / 100;
  } else if (dims.type === 'product') {
    focusX = dims.form.focusPoint.x;
    focusY = dims.form.focusPoint.y;
    contrast = 'medium';
    whitespaceRatio = 0.3;
    warmRatio = 0.5;
    coolRatio = 0.5;
    dominantColor = '产品材质色';
    avgSaturation = dims.materialExpression.textureRealism === 'high' ? 55 : dims.materialExpression.textureRealism === 'low' ? 20 : 35;
    textureComplexity = dims.form.surfaceQuality === 'excellent' ? 0.6 : 0.4;
    edgeDensity = dims.form.ergonomicsHint === 'strong' ? 0.05 : dims.form.ergonomicsHint === 'weak' ? 0.2 : 0.12;
  } else {
    // sculpture
    focusX = dims.spatialComposition.focusPoint.x;
    focusY = dims.spatialComposition.focusPoint.y;
    contrast = 'medium';
    whitespaceRatio = dims.spatialComposition.spaceOccupation === 'full' ? 0.2 : dims.spatialComposition.spaceOccupation === 'sparse' ? 0.5 : 0.35;
    warmRatio = 0.5;
    coolRatio = 0.5;
    dominantColor = '雕塑材料色';
    avgSaturation = dims.materialLanguage.materialCharacter === 'distinct' ? 20 : 45;
    textureComplexity = dims.materialLanguage.textureExpression === 'rich' ? 0.7 : dims.materialLanguage.textureExpression === 'simple' ? 0.2 : 0.45;
    edgeDensity = dims.bodyLanguage.tensionExpression === 'high' ? 0.15 : 0.08;
  }

  return {
    focusX,
    focusY,
    whitespaceRatio,
    warmRatio,
    coolRatio,
    dominantColor,
    avgLuminance,
    avgSaturation,
    contrast,
    textureComplexity,
    edgeDensity,
  };
}
