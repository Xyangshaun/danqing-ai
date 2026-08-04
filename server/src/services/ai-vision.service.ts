// ============================================================
// AI 视觉分析服务(GLM-4V / TRAE API 客户端 + Prompt 工程 + 超时 + Fallback)
// 对应文档:.trae/documents/ai-integration-design.md §2-§3
//
// 职责:
//   1. 构造系统/用户 Prompt(参考 art-evaluation-standards.md 美院规范)
//   2. 调用 AI Vision API(OpenAI 兼容格式,支持 GLM / TRAE 双 Provider)
//   3. Provider 选择:根据 AI_PROVIDER 配置选择,TRAE 不可用时自动降级到 GLM
//   4. 超时控制(硬性 2.5s,触发即切断走 fallback)
//   5. 响应解析:JSON 提取 + Zod schema 校验 + delta clamp ±5
//   6. 错误分类:超时/HTTP/解析/Schema/网络,映射为 AIFailureReason
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
  SuggestionPriority,
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
    `校准总则(八条底线):`,
    `1. 术语专业:一律使用美院规范术语(如"明度九阶"而非"亮暗层次","黄金分割点定位"而非"主体位置好不好")`,
    `2. 评分有据:每个分数档必须对应可识别的视觉特征,禁止主观印象打分`,
    `3. 建议格式必须严格遵循ArtCoT证据锚定:每条建议必须引用【具体数值证据】,格式为:[维度] 当前值X(数据来源)→ 建议调整到Y → 理由Z(基于艺术原理)`,
    `4. 尊重多元:区分"基础性问题"与"风格选择":基础问题必须纠正,风格问题可讨论`,
    `5. 因类制宜:绘画重"再现与表达",设计重"创意与逻辑",产品重"语义与可行",雕塑重"空间与观念"`,
    `6. 致广大:评分兼顾"尽精微"(子指标量化)与"致广大"(整体气韵)`,
    `7. 数值引用:所有建议必须引用上述提供的客观指标数据(如'黄金分割评分42分'、'留白比例58%'、'暖色占比72%'等),禁止脱离数据空谈`,
    `8. 精确优先:优先指出低分维度(<60分)的问题,高分维度(>80分)给予肯定但不必过度赞扬`,
    ``,
    `建议数量与优先级控制(严格遵守):`,
    `- 总建议数控制在3-5条(不要太多)`,
    `- high优先级建议1-2条(必须改的基础问题,对应低分维度<60分)`,
    `- medium优先级建议1-2条(提升建议,对应中等分数维度60-80分)`,
    `- low优先级建议0-1条(亮点肯定或风格探讨,对应高分维度>80分)`,
    `- 每条建议字数不超过80字,总字数不超过400字`,
    `- 禁止使用"再改改""需要改进""有点问题"等模糊表述`,
    `- 禁止给出"不错""很好"等无实质内容的评价,所有评价必须基于分数`,
    ``,
    `你必须严格输出 JSON 格式(无 markdown 代码块,无解释性文字),结构如下:`,
    `{`,
    `  "semantic_theme": "主题与意境理解(50-100字,描述作品传达的主题、情感、意境)",`,
    `  "style_recognition": "风格识别(如'印象派条件色处理'/'古典写实明暗塑造'/'极简主义网格构成'等)",`,
    `  "professional_suggestions": [`,
    `    {`,
    `      "dimension": "维度名(构图与造型/色彩表现/笔触与技法/整体与完整/视觉层次/排版与构成/色彩应用/创意表达/形态语义/材质表现/功能表达/人机工程/空间构成/形体语言/材料语言/观念表达)",`,
    `      "level": "优|良|中|差",`,
    `      "evidence": "引用具体数值证据,必须包含来自上述指标的具体数字,如'视觉重心(0.72,0.45)偏右,黄金分割评分仅42分'",`,
    `      "operation": "具体操作(含数值/位置/方法,如'将主体从画面(0.72,0.45)向左下偏移至黄金分割点(0.62,0.38)')",`,
    `      "reference": "参考案例(美术史作品,如'塞尚《静物》三角构图')",`,
    `      "practice": "练习路径(1-2个针对性练习,如'对同一组静物做4种构图变体速写')",`,
    `      "priority": "high|medium|low(低分维度<60为high,中等60-80为medium,高分>80为low)"`,
    `    }`,
    `  ],`,
    `  "score_adjustments": {`,
    `    "dimension_adjustments": [`,
    `      { "dimension": "维度名", "delta": -5~+5 的整数, "reason": "校准理由(基于视觉特征+数值证据)" }`,
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
 * 色彩和谐类型英文 → 中文映射(注入 prompt 使用中文术语)
 */
const HARMONY_TYPE_LABEL: Record<string, string> = {
  complementary: '互补色和谐',
  analogous: '邻近色和谐',
  triadic: '三角色和谐',
  'split-complementary': '分裂互补和谐',
  tetradic: '四色和谐',
  monochromatic: '单色和谐',
  achromatic: '无彩色和谐',
  unknown: '未明确',
};

/**
 * 方向角度 → 中文方位描述(0°=水平右,90°=垂直,180°=水平左)
 */
function angleToDirectionLabel(angle: number): string {
  const normalized = ((angle % 180) + 180) % 180;
  if (normalized < 15 || normalized >= 165) return '水平方向';
  if (normalized >= 75 && normalized <= 105) return '垂直方向';
  if (normalized >= 15 && normalized < 45) return '右下斜向';
  if (normalized >= 45 && normalized < 75) return '右上下斜向';
  if (normalized >= 105 && normalized < 135) return '左下斜向';
  return '左上下斜向';
}

/**
 * 构造用户提示词(对应 ai-integration-design.md §3.2)
 * 包含:作品类型 + 维度上下文 + Jimp 客观像素数据(含 Phase A 高级指标,供 AI 校准参考)
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
    // ---------- 基础像素数据 ----------
    lines.push(
      ``,
      `已知客观像素数据(供你校准评分时参考,不要重复罗列):`,
      `- 视觉重心:(${m.focusX.toFixed(2)}, ${m.focusY.toFixed(2)})`,
      `- 留白比例:${(m.whitespaceRatio * 100).toFixed(1)}%`,
      `- 暖冷比:${(m.warmRatio * 100).toFixed(0)}:${(m.coolRatio * 100).toFixed(0)}`,
      `- 主色调:${m.dominantColor}`,
      `- 平均亮度:${m.avgLuminance.toFixed(0)} / 255`,
      `- 平均饱和度:${m.avgSaturation.toFixed(0)} / 100`,
      `- 对比度等级:${m.contrast === 'high' ? '高' : m.contrast === 'low' ? '低' : '中'}`,
      `- 纹理复杂度:${m.textureComplexity.toFixed(2)}`,
      `- 边缘密度:${m.edgeDensity.toFixed(2)}`,
    );

    // ---------- Phase A 高级指标 ----------
    const hasGoldenRatio = m.goldenRatioScore !== undefined;
    const hasHarmony = m.harmonyScore !== undefined;
    const hasDirection = m.directionCoherence !== undefined;
    const hasOriginality = m.pHashSimilarity !== undefined || m.mostSimilarWork !== undefined;

    if (hasGoldenRatio || hasHarmony || hasDirection || hasOriginality) {
      lines.push(``, `高级视觉分析指标(Phase A 量化结果,供评分校准):`);

      // 构图类
      if (hasGoldenRatio) {
        const grs = Math.round(m.goldenRatioScore ?? 65);
        const rots = Math.round(m.ruleOfThirdsScore ?? 65);
        const llDir = Math.round(m.leadingLineDirection ?? 90);
        const llStr = (m.leadingLineStrength ?? 0.5).toFixed(2);
        const dirLabel = angleToDirectionLabel(llDir);
        lines.push(
          `- [构图]黄金分割评分:${grs}/100,三分法评分:${rots}/100,引导线方向:${llDir}°(${dirLabel}),引导线强度:${llStr}`,
        );
      }

      // 色彩类
      if (hasHarmony) {
        const hs = Math.round(m.harmonyScore ?? 65);
        const htKey = m.harmonyType ?? 'unknown';
        const htLabel = HARMONY_TYPE_LABEL[htKey] || htKey;
        let satLine = `- [色彩]色彩和谐度评分:${hs}/100,和谐类型:${htLabel}`;
        if (m.saturationDistribution) {
          const lowPct = (m.saturationDistribution.low * 100).toFixed(0);
          const midPct = (m.saturationDistribution.mid * 100).toFixed(0);
          const highPct = (m.saturationDistribution.high * 100).toFixed(0);
          satLine += `,饱和度分布(低/中/高):${lowPct}%/${midPct}%/${highPct}%`;
        }
        lines.push(satLine);
      }

      // 笔触/方向类
      if (hasDirection) {
        const dc = (m.directionCoherence ?? 0.5).toFixed(2);
        const se = (m.strokeEnergy ?? 0.5).toFixed(2);
        const domDir = Math.round(m.dominantDirection ?? 90);
        const dirLabel = angleToDirectionLabel(domDir);
        const coherenceLabel = (m.directionCoherence ?? 0.5) > 0.6 ? '方向较统一' : (m.directionCoherence ?? 0.5) < 0.4 ? '方向较分散' : '方向中等统一';
        const energyLabel = (m.strokeEnergy ?? 0.5) > 0.6 ? '张力较强' : (m.strokeEnergy ?? 0.5) < 0.4 ? '张力偏弱' : '张力适中';
        lines.push(
          `- [笔触/方向]方向一致性:${dc}(${coherenceLabel}),笔触能量:${se}(${energyLabel}),主方向:${domDir}°(${dirLabel})`,
        );
      }

      // 原创性类
      if (hasOriginality) {
        let origLine = `- [原创性]`;
        const parts: string[] = [];
        if (m.pHashSimilarity !== undefined) {
          const sim = (m.pHashSimilarity * 100).toFixed(0);
          parts.push(`pHash相似度:${sim}%`);
        }
        if (m.mostSimilarWork) {
          parts.push(`最相似名作:${m.mostSimilarWork.artist}《${m.mostSimilarWork.title}》`);
        }
        if (parts.length > 0) {
          origLine += parts.join(',');
          lines.push(origLine);
        }
      }
    }
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
 * 优先级映射表(接受中英文,大小写不敏感)
 */
const PRIORITY_MAP: Record<string, SuggestionPriority> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  高: 'high',
  中: 'medium',
  低: 'low',
};

/**
 * 将 AI 返回的 priority 字段归一化为 SuggestionPriority
 * 接受中英文(high/medium/low 或 高/中/低),未知值降级为 'medium'
 * 向后兼容:旧格式缺少 priority 字段时默认 'medium'
 */
function normalizePriority(raw: unknown): SuggestionPriority {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (PRIORITY_MAP[trimmed]) return PRIORITY_MAP[trimmed]!;
    const lower = trimmed.toLowerCase();
    if (PRIORITY_MAP[lower]) return PRIORITY_MAP[lower]!;
  }
  return 'medium';
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
 * Zod schema:专业改进建议(ArtCoT 证据锚定格式,Phase B3)
 * 向后兼容:旧格式缺少 evidence/priority 字段时自动填充默认值
 *   - evidence 缺失 → 空字符串(兜底)
 *   - priority 缺失 → 'medium'(默认中等优先级)
 */
const professionalSuggestionSchema = z
  .object({
    dimension: z.unknown(),
    level: z.unknown(),
    evidence: z.unknown().optional(),
    operation: z.unknown(),
    reference: z.unknown(),
    practice: z.unknown(),
    priority: z.unknown().optional(),
  })
  .transform((s) => ({
    dimension: typeof s.dimension === 'string' ? s.dimension : '未知维度',
    level: normalizeLevel(s.level),
    evidence: typeof s.evidence === 'string' ? s.evidence : '',
    operation: typeof s.operation === 'string' ? s.operation : '',
    reference: typeof s.reference === 'string' ? s.reference : '',
    practice: typeof s.practice === 'string' ? s.practice : '',
    priority: normalizePriority(s.priority),
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
 *
 * 超时识别覆盖三类信号(任一命中即判超时):
 *   1. axios connection timeout:`code = ECONNABORTED` / `ETIMEDOUT`
 *   2. AbortController 主动取消(2.5s wall-clock deadline):`code = ERR_CANCELED` 或 `name = CanceledError`
 *   3. 兼容旧版 axios 取消信号:`message` 含 'canceled'
 */
function classifyAxiosError(err: AxiosError): AIFailureReason {
  // 超时:axios connection timeout 或 AbortController wall-clock deadline 触发
  if (
    err.code === 'ECONNABORTED' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ERR_CANCELED' ||
    err.name === 'CanceledError' ||
    err.message?.includes('canceled')
  ) {
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
// 7. AI Vision API 请求体构造(OpenAI 兼容格式,GLM/TRAE 通用)
// ============================================================

/**
 * AI Vision API 请求消息体(OpenAI 兼容格式,GLM 和 TRAE 均使用此结构)
 */
interface VisionChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

interface VisionRequestBody {
  model: string;
  messages: VisionChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

/**
 * 构造 AI Vision API 请求体(OpenAI 兼容格式,GLM/TRAE 通用)
 * - system 消息:固定 prompt
 * - user 消息:文本 + 图片(URL 或 base64)
 */
function buildRequestBody(req: AIVisionRequest, model: string): VisionRequestBody {
  const systemPrompt = buildSystemPrompt(req.artType);
  const userPrompt = buildUserPrompt(req);

  // 图片输入:URL 直传,本地文件转 base64(由调用方预处理)
  // 这里 imageSource 已由 analyzeWithAI 预处理为 URL 或 data URL
  const imageUrl = req.imageSource;

  const body: VisionRequestBody = {
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
// 7.5 双 Provider 配置解析与降级
// ============================================================

/**
 * 解析后的有效 AI Provider 配置
 */
interface ResolvedAIConfig {
  /** 实际使用的 provider */
  provider: 'glm' | 'trae';
  /** API Key */
  apiKey: string;
  /** API 端点 URL(OpenAI 兼容格式) */
  apiUrl: string;
  /** 模型名 */
  model: string;
  /** 是否发生了降级(trae -> glm) */
  fallback: boolean;
}

/**
 * 根据 env 配置解析实际使用的 AI Provider
 *
 * 降级规则:
 *   1. aiProvider='glm' → 使用 GLM 配置,key 为空则返回 null
 *   2. aiProvider='trae' 且 traeApiKey+traeApiUrl 均非空 → 使用 TRAE 配置
 *   3. aiProvider='trae' 但 traeApiKey 为空(或 URL 为空) → 自动降级到 GLM(GLM key 可用时)
 *   4. 所有 key 均为空 → 返回 null(调用方返回 AI_KEY_MISSING)
 */
function resolveAIConfig(): ResolvedAIConfig | null {
  const cfg = env();

  if (cfg.aiProvider === 'glm') {
    if (!cfg.aiApiKey) return null;
    return {
      provider: 'glm',
      apiKey: cfg.aiApiKey,
      apiUrl: cfg.aiApiUrl,
      model: cfg.aiApiModel,
      fallback: false,
    };
  }

  // aiProvider === 'trae'
  const traeReady = cfg.traeApiKey.length > 0 && cfg.traeApiUrl.length > 0;
  if (traeReady) {
    return {
      provider: 'trae',
      apiKey: cfg.traeApiKey,
      apiUrl: cfg.traeApiUrl,
      model: cfg.traeApiModel || cfg.aiApiModel,
      fallback: false,
    };
  }

  // TRAE 配置不完整,尝试降级到 GLM
  if (cfg.aiApiKey.length > 0) {
    logger.warn(
      { traeKeyEmpty: !cfg.traeApiKey, traeUrlEmpty: !cfg.traeApiUrl },
      '[ai-vision] TRAE provider not fully configured, falling back to GLM',
    );
    return {
      provider: 'glm',
      apiKey: cfg.aiApiKey,
      apiUrl: cfg.aiApiUrl,
      model: cfg.aiApiModel,
      fallback: true,
    };
  }

  // GLM key 也不可用
  return null;
}

// ============================================================
// 8. 主入口:analyzeWithAI
// ============================================================

/**
 * 调用 AI Vision API 进行视觉分析(支持 GLM / TRAE 双 Provider,自动降级)
 *
 * @param req AI 视觉分析请求(图片源 + 作品类型 + Jimp 指标)
 * @returns AIVisionCallResult 含成功/失败信息 + 耗时 + token 用量
 *
 * SLA 双层超时保障(P3-2.2 强化):
 *   1. axios `timeout`(env.AI_API_TIMEOUT,默认 2500ms):连接/响应超时
 *   2. AbortController wall-clock deadline:2.5s 硬切断,兜底慢速 body 流场景
 *   二者互补,任一触发都返回 AI_TIMEOUT,由 ai-analysis.service.ts 降级到 Jimp fallback
 *   重试策略:不重试(重试会突破 3s SLA)
 *
 * Provider 选择:根据 AI_PROVIDER 配置,TRAE 不可用时自动降级到 GLM
 */
export async function analyzeWithAI(req: AIVisionRequest): Promise<AIVisionCallResult> {
  const cfg = env();
  const startMs = Date.now();

  // 前置检查:解析有效 Provider 配置(含自动降级逻辑)
  const resolved = resolveAIConfig();
  if (!resolved) {
    return {
      success: false,
      result: null,
      failureReason: 'AI_KEY_MISSING',
      durationMs: Date.now() - startMs,
    };
  }

  const { apiKey, apiUrl, model, provider: usedProvider, fallback } = resolved;

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

  // P3-2.2 双层超时保障:
  //   1. axios `timeout`(连接/响应超时,但可能不覆盖慢速 body 流)
  //   2. AbortController wall-clock deadline(2.5s 硬切断,兜底任何慢速场景)
  // 二者互补,任一触发都会让请求失败并降级到 Jimp fallback,保障 3s SLA 不可破
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), cfg.aiApiTimeout);

  try {
    const response: AxiosResponse = await axios.post(apiUrl, requestBody, {
      timeout: cfg.aiApiTimeout,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
        { durationMs, hasChoices: !!data?.choices, usedProvider, fallback },
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
        { durationMs, contentPreview: content.slice(0, 200), usedProvider, fallback },
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
        { durationMs, zodError: parsed.error.issues.slice(0, 3), usedProvider, fallback },
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
        usedProvider,
        fallback,
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
        usedProvider,
        fallback,
      },
      '[ai-vision] analysis failed',
    );
    return {
      success: false,
      result: null,
      failureReason: reason,
      durationMs,
    };
  } finally {
    // 清理 AbortController 定时器,防止内存泄漏
    // (即使 abort 已触发,clearTimeout 也是安全无副作用的)
    clearTimeout(abortTimer);
  }
}

// ============================================================
// 9. 工具函数导出(供测试使用)
// ============================================================

/**
 * 判断 AI 功能是否启用
 * 满足以下任一条件即可:
 *   - env.AI_ENABLED=true 且 GLM API Key 非空
 *   - env.AI_ENABLED=true 且 TRAE API Key + URL 均非空
 */
export function isAIEnabled(): boolean {
  const cfg = env();
  if (!cfg.aiEnabled) return false;
  // GLM 可用
  if (cfg.aiApiKey.length > 0) return true;
  // TRAE 可用(key + URL 均配置)
  if (cfg.traeApiKey.length > 0 && cfg.traeApiUrl.length > 0) return true;
  return false;
}

/**
 * Phase A 默认值:构图指标
 */
const DEFAULT_COMPOSITION_METRICS: {
  goldenRatioScore: number;
  ruleOfThirdsScore: number;
  leadingLineDirection: number;
  leadingLineStrength: number;
} = {
  goldenRatioScore: 65,
  ruleOfThirdsScore: 65,
  leadingLineDirection: 90,
  leadingLineStrength: 0.5,
};

/**
 * Phase A 默认值:色彩指标
 */
const DEFAULT_COLOR_METRICS: {
  harmonyScore: number;
  harmonyType: string;
  saturationDistribution: { low: number; mid: number; high: number };
} = {
  harmonyScore: 65,
  harmonyType: 'analogous',
  saturationDistribution: { low: 0.33, mid: 0.34, high: 0.33 },
};

/**
 * Phase A 默认值:笔触/方向指标
 */
const DEFAULT_BRUSHWORK_METRICS: {
  directionCoherence: number;
  strokeEnergy: number;
  dominantDirection: number;
} = {
  directionCoherence: 0.5,
  strokeEnergy: 0.5,
  dominantDirection: 90,
};

/**
 * 饱和度等级字符串 → 数值估算(0-100)
 */
function saturationLevelToValue(level: 'high' | 'medium' | 'low' | string | undefined): number {
  if (level === 'high') return 70;
  if (level === 'low') return 20;
  return 45;
}

/**
 * 纹理等级 → 复杂度估算(0-1)
 */
function textureLevelToComplexity(level: string | undefined): number {
  if (level === 'rich') return 0.7;
  if (level === 'simple') return 0.2;
  return 0.45;
}

/**
 * 安全获取比例字段(0-1),自动 clamp 到 [0,1]
 */
function safeRatio(val: unknown, defaultVal: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.min(1, val));
  }
  return defaultVal;
}

/**
 * 安全获取角度字段(0-180度),自动 clamp 到 [0,180]
 */
function safeAngle(val: unknown, defaultVal: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.min(180, val));
  }
  return defaultVal;
}

/**
 * 安全获取评分字段(0-100),自动 clamp 到 [0,100]
 */
function safeScore(val: unknown, defaultVal: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.min(100, val));
  }
  return defaultVal;
}

/**
 * 安全提取饱和度分布,缺失时返回均匀分布
 */
function safeSaturationDistribution(
  val: unknown,
): { low: number; mid: number; high: number } {
  if (
    val &&
    typeof val === 'object' &&
    'low' in val &&
    'mid' in val &&
    'high' in val
  ) {
    const dist = val as { low: unknown; mid: unknown; high: unknown };
    const low = safeRatio(dist.low, 0.33);
    const mid = safeRatio(dist.mid, 0.34);
    const high = safeRatio(dist.high, 0.33);
    // 归一化保证总和为1
    const sum = low + mid + high;
    if (sum > 0) {
      return { low: low / sum, mid: mid / sum, high: high / sum };
    }
  }
  return { ...DEFAULT_COLOR_METRICS.saturationDistribution };
}

/**
 * 安全提取最相似作品信息
 */
function safeMostSimilarWork(
  val: unknown,
): { title: string; artist: string } | null {
  if (val && typeof val === 'object' && 'title' in val && 'artist' in val) {
    const work = val as { title: unknown; artist: unknown };
    const title = typeof work.title === 'string' && work.title.length > 0 ? work.title : '';
    const artist = typeof work.artist === 'string' && work.artist.length > 0 ? work.artist : '';
    if (title || artist) {
      return { title: title || '未知作品', artist: artist || '未知艺术家' };
    }
  }
  return null;
}

/**
 * 从 AnalysisResult 中提取 Jimp 指标(含 Phase A 高级指标),用于注入 AI prompt
 * 避免重复计算,直接从已有结果中读取
 *
 * 提取策略:
 *   - painting: composition/color/brushwork/originality 均有完整 Phase A 字段
 *   - design:   构图字段从 visualHierarchy 提取,色彩字段无(默认),方向从 typography.directionCoherence 提取
 *   - product:  构图字段从 form 提取,色彩字段无(默认),方向从 form.directionCoherence 提取
 *   - sculpture:构图字段从 spatialComposition 提取,色彩字段无(默认),笔触/方向从 bodyLanguage 提取
 *   - 原创性字段统一从 result.originality 提取(四类共享)
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

  // Phase A 高级指标(初始化为默认值)
  let goldenRatioScore = DEFAULT_COMPOSITION_METRICS.goldenRatioScore;
  let ruleOfThirdsScore = DEFAULT_COMPOSITION_METRICS.ruleOfThirdsScore;
  let leadingLineDirection = DEFAULT_COMPOSITION_METRICS.leadingLineDirection;
  let leadingLineStrength = DEFAULT_COMPOSITION_METRICS.leadingLineStrength;
  let harmonyScore = DEFAULT_COLOR_METRICS.harmonyScore;
  let harmonyType = DEFAULT_COLOR_METRICS.harmonyType;
  let saturationDistribution = { ...DEFAULT_COLOR_METRICS.saturationDistribution };
  let directionCoherence = DEFAULT_BRUSHWORK_METRICS.directionCoherence;
  let strokeEnergy = DEFAULT_BRUSHWORK_METRICS.strokeEnergy;
  let dominantDirection = DEFAULT_BRUSHWORK_METRICS.dominantDirection;

  if (dims.type === 'painting') {
    // ---------- 基础指标 ----------
    focusX = dims.composition.focusPoint.x;
    focusY = dims.composition.focusPoint.y;
    whitespaceRatio = dims.composition.whitespaceRatio;
    warmRatio = dims.color.warmRatio;
    coolRatio = dims.color.coolRatio;
    dominantColor = dims.color.dominantColor;
    contrast = dims.color.contrast;
    avgSaturation = saturationLevelToValue(dims.color.saturation);
    textureComplexity = textureLevelToComplexity(dims.brushwork.textureLevel);
    edgeDensity = dims.brushwork.strokeVariety / 100;

    // ---------- Phase A 构图指标 ----------
    goldenRatioScore = safeScore(dims.composition.goldenRatioScore, DEFAULT_COMPOSITION_METRICS.goldenRatioScore);
    ruleOfThirdsScore = safeScore(dims.composition.ruleOfThirdsScore, DEFAULT_COMPOSITION_METRICS.ruleOfThirdsScore);
    leadingLineDirection = safeAngle(dims.composition.leadingLineDirection, DEFAULT_COMPOSITION_METRICS.leadingLineDirection);
    leadingLineStrength = safeRatio(dims.composition.leadingLineStrength, DEFAULT_COMPOSITION_METRICS.leadingLineStrength);

    // ---------- Phase A 色彩指标 ----------
    harmonyScore = safeScore(dims.color.harmonyScore, DEFAULT_COLOR_METRICS.harmonyScore);
    harmonyType = typeof dims.color.harmonyType === 'string' && dims.color.harmonyType.length > 0
      ? dims.color.harmonyType
      : DEFAULT_COLOR_METRICS.harmonyType;
    saturationDistribution = safeSaturationDistribution(dims.color.saturationDistribution);

    // ---------- Phase A 笔触指标 ----------
    directionCoherence = safeRatio(dims.brushwork.directionCoherence, DEFAULT_BRUSHWORK_METRICS.directionCoherence);
    strokeEnergy = safeRatio(dims.brushwork.strokeEnergy, DEFAULT_BRUSHWORK_METRICS.strokeEnergy);
    dominantDirection = safeAngle(dims.brushwork.dominantBrushDirection, DEFAULT_BRUSHWORK_METRICS.dominantDirection);
  } else if (dims.type === 'design') {
    // ---------- 基础指标 ----------
    focusX = dims.visualHierarchy.focusPoint.x;
    focusY = dims.visualHierarchy.focusPoint.y;
    contrast = dims.colorApplication.contrast;
    whitespaceRatio = dims.typography.negativeSpaceUsage === 'good' ? 0.4 : dims.typography.negativeSpaceUsage === 'poor' ? 0.15 : 0.25;
    warmRatio = 0.5;
    coolRatio = 0.5;
    dominantColor = '设计配色';
    avgSaturation = dims.typography.rhythmConsistency === 'good' ? 30 : 55;
    textureComplexity = 0.4;
    edgeDensity = dims.typography.gridAdherence / 100;

    // ---------- Phase A 构图指标(从 visualHierarchy 提取) ----------
    goldenRatioScore = safeScore(dims.visualHierarchy.goldenRatioScore, DEFAULT_COMPOSITION_METRICS.goldenRatioScore);
    ruleOfThirdsScore = safeScore(dims.visualHierarchy.ruleOfThirdsScore, DEFAULT_COMPOSITION_METRICS.ruleOfThirdsScore);
    leadingLineDirection = safeAngle(dims.visualHierarchy.leadingLineDirection, DEFAULT_COMPOSITION_METRICS.leadingLineDirection);
    leadingLineStrength = safeRatio(dims.visualHierarchy.leadingLineStrength, DEFAULT_COMPOSITION_METRICS.leadingLineStrength);

    // ---------- Phase A 色彩指标(设计类 colorApplication 暂无独立字段,使用默认值) ----------
    // harmonyScore / harmonyType / saturationDistribution 保持默认

    // ---------- Phase A 方向指标(从 typography.directionCoherence 提取,笔触能量/主方向使用默认) ----------
    directionCoherence = safeRatio(dims.typography.directionCoherence, DEFAULT_BRUSHWORK_METRICS.directionCoherence);
    // strokeEnergy / dominantDirection 保持默认
  } else if (dims.type === 'product') {
    // ---------- 基础指标 ----------
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

    // ---------- Phase A 构图指标(从 form 提取) ----------
    goldenRatioScore = safeScore(dims.form.goldenRatioScore, DEFAULT_COMPOSITION_METRICS.goldenRatioScore);
    ruleOfThirdsScore = safeScore(dims.form.ruleOfThirdsScore, DEFAULT_COMPOSITION_METRICS.ruleOfThirdsScore);
    leadingLineDirection = safeAngle(dims.form.leadingLineDirection, DEFAULT_COMPOSITION_METRICS.leadingLineDirection);
    leadingLineStrength = safeRatio(dims.form.leadingLineStrength, DEFAULT_COMPOSITION_METRICS.leadingLineStrength);

    // ---------- Phase A 色彩指标(产品类暂无独立色彩和谐字段,使用默认值) ----------

    // ---------- Phase A 方向指标(从 form.directionCoherence 提取,笔触能量/主方向使用默认) ----------
    directionCoherence = safeRatio(dims.form.directionCoherence, DEFAULT_BRUSHWORK_METRICS.directionCoherence);
    // strokeEnergy / dominantDirection 保持默认
  } else {
    // sculpture
    // ---------- 基础指标 ----------
    focusX = dims.spatialComposition.focusPoint.x;
    focusY = dims.spatialComposition.focusPoint.y;
    contrast = 'medium';
    whitespaceRatio = dims.spatialComposition.spaceOccupation === 'full' ? 0.2 : dims.spatialComposition.spaceOccupation === 'sparse' ? 0.5 : 0.35;
    warmRatio = 0.5;
    coolRatio = 0.5;
    dominantColor = '雕塑材料色';
    avgSaturation = dims.materialLanguage.materialCharacter === 'distinct' ? 20 : 45;
    textureComplexity = textureLevelToComplexity(dims.materialLanguage.textureExpression);
    edgeDensity = dims.bodyLanguage.tensionExpression === 'high' ? 0.15 : 0.08;

    // ---------- Phase A 构图指标(从 spatialComposition 提取) ----------
    goldenRatioScore = safeScore(dims.spatialComposition.goldenRatioScore, DEFAULT_COMPOSITION_METRICS.goldenRatioScore);
    ruleOfThirdsScore = safeScore(dims.spatialComposition.ruleOfThirdsScore, DEFAULT_COMPOSITION_METRICS.ruleOfThirdsScore);
    leadingLineDirection = safeAngle(dims.spatialComposition.leadingLineDirection, DEFAULT_COMPOSITION_METRICS.leadingLineDirection);
    leadingLineStrength = safeRatio(dims.spatialComposition.leadingLineStrength, DEFAULT_COMPOSITION_METRICS.leadingLineStrength);

    // ---------- Phase A 色彩指标(雕塑类暂无独立色彩和谐字段,使用默认值) ----------

    // ---------- Phase A 形体/方向指标(从 bodyLanguage 提取) ----------
    directionCoherence = safeRatio(dims.bodyLanguage.directionCoherence, DEFAULT_BRUSHWORK_METRICS.directionCoherence);
    strokeEnergy = safeRatio(dims.bodyLanguage.strokeEnergy, DEFAULT_BRUSHWORK_METRICS.strokeEnergy);
    // dominantDirection 雕塑暂无独立主导方向字段,保持默认
  }

  // ---------- Phase A 原创性指标(四类作品统一从 result.originality 提取) ----------
  const pHashSimilarity = safeRatio(result.originality.pHashSimilarity, 0);
  const mostSimilarWork = safeMostSimilarWork(result.originality.mostSimilarWork);

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
    // Phase A 新增
    goldenRatioScore,
    ruleOfThirdsScore,
    leadingLineDirection,
    leadingLineStrength,
    harmonyScore,
    harmonyType,
    saturationDistribution,
    directionCoherence,
    strokeEnergy,
    dominantDirection,
    pHashSimilarity,
    mostSimilarWork,
  };
}
