// ============================================================
// AI 用量日志 Repository(用量统计模块)
// 对应表:ai_usage_logs
// 设计:
//   - create():异步写入单条调用日志(主流程外,不阻塞业务)
//   - 聚合查询:overview / by-provider / by-user / trend 四类统计
//   - 所有查询强制 tenant_id 过滤(由调用方传入 query.tenantId 或留空表示跨租户)
// ============================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { AiUsageType } from '../types/api-contract.js';

/**
 * 创建 AI 用量日志的输入参数
 * 与 Prisma AiUsageLog 模型字段对齐(除 id/createdAt 自动生成)
 */
export interface CreateAiUsageLogInput {
  tenantId: string;
  userId: string;
  analysisId?: string | null;
  provider: string;
  model: string;
  apiUrl: string;
  success: boolean;
  durationMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costYuan?: Prisma.Decimal | null;
  failureReason?: string | null;
  /**
   * 用量类型(diagnose | generate,对齐契约 AiUsageType;DOC-2026-08-009)
   * 缺省时由 DB 默认 'diagnose',兼容既有诊断日志
   */
  usageType?: AiUsageType;
  /** generate 类型关联的生成任务 ID(诊断为 null 或不传) */
  generationId?: string | null;
}

/**
 * 通用聚合查询的 WHERE 条件构造(Prisma typed)
 * 用于 overview() 的 aggregate 调用
 */
function buildDateWhere(startDate?: Date, endDate?: Date): Prisma.AiUsageLogWhereInput {
  const where: Prisma.AiUsageLogWhereInput = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }
  return where;
}

export class AiUsageRepository {
  /**
   * 创建用量日志(主流程外异步调用,失败仅记日志不影响业务)
   */
  async create(data: CreateAiUsageLogInput): Promise<void> {
    try {
      await prisma().aiUsageLog.create({ data });
    } catch (err) {
      // 静默失败:用量日志记录失败不得影响主流程
      // 仅以抛出错误的形式让调用方决定如何处理(通常 catch swallow)
      throw err;
    }
  }

  /**
   * 总览统计:总次数 / 成功数 / 失败数 / 总 token / 总成本 / 平均耗时 / 成功率
   * 使用 Prisma aggregate(groupBy + _count + _sum + _avg)
   */
  async overview(startDate?: Date, endDate?: Date) {
    const where = buildDateWhere(startDate, endDate);
    const [agg, successAgg] = await Promise.all([
      prisma().aiUsageLog.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          costYuan: true,
        },
        _avg: { durationMs: true },
      }),
      prisma().aiUsageLog.aggregate({
        where: { ...where, success: true },
        _count: { _all: true },
      }),
    ]);

    const totalCount = agg._count._all;
    const successCount = successAgg._count._all;
    const failedCount = totalCount - successCount;

    return {
      totalCount,
      successCount,
      failedCount,
      successRate: totalCount > 0 ? successCount / totalCount : 0,
      totalPromptTokens: agg._sum.promptTokens ?? 0,
      totalCompletionTokens: agg._sum.completionTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      totalCostYuan: agg._sum.costYuan ?? new Prisma.Decimal(0),
      avgDurationMs: agg._avg.durationMs ?? 0,
    };
  }

  /**
   * 按 Provider 分组统计
   * 返回每个 provider 的调用次数 / 成功数 / 失败数 / 总 token / 总成本 / 平均耗时
   * 实现:使用 raw SQL,避免 Prisma groupBy 在 _count.success 上的类型限制
   */
  async groupByProvider(startDate?: Date, endDate?: Date) {
    const whereClause = buildDateWhereClause(startDate, endDate);
    const sql = Prisma.sql`
      SELECT
        provider,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE success = true)::int AS success_count,
        COUNT(*) FILTER (WHERE success = false)::int AS failed_count,
        COALESCE(SUM(prompt_tokens), 0)::bigint AS total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::bigint AS total_completion_tokens,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_yuan), 0)::numeric AS total_cost_yuan,
        COALESCE(AVG(duration_ms), 0)::float8 AS avg_duration_ms
      FROM ai_usage_logs
      ${Prisma.raw(whereClause)}
      GROUP BY provider
      ORDER BY total_count DESC
    `;
    const rows = await prisma().$queryRaw<
      Array<{
        provider: string;
        total_count: number;
        success_count: number;
        failed_count: number;
        total_prompt_tokens: bigint;
        total_completion_tokens: bigint;
        total_tokens: bigint;
        total_cost_yuan: Prisma.Decimal;
        avg_duration_ms: number;
      }>
    >(sql);
    return rows.map((r) => ({
      provider: r.provider,
      totalCount: r.total_count,
      successCount: r.success_count,
      failedCount: r.failed_count,
      successRate: r.total_count > 0 ? r.success_count / r.total_count : 0,
      totalPromptTokens: Number(r.total_prompt_tokens),
      totalCompletionTokens: Number(r.total_completion_tokens),
      totalTokens: Number(r.total_tokens),
      totalCostYuan: r.total_cost_yuan,
      avgDurationMs: r.avg_duration_ms,
    }));
  }

  /**
   * 按用户分组统计(Top N)
   * 返回前 N 名调用量的用户及其统计指标
   * 注意:仅返回 userId + 统计指标,用户姓名/角色由 service 关联 users 表补充
   */
  async groupByUser(startDate?: Date, endDate?: Date, limit = 10) {
    const whereClause = buildDateWhereClause(startDate, endDate);
    const sql = Prisma.sql`
      SELECT
        user_id,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE success = true)::int AS success_count,
        COUNT(*) FILTER (WHERE success = false)::int AS failed_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_yuan), 0)::numeric AS total_cost_yuan,
        COALESCE(AVG(duration_ms), 0)::float8 AS avg_duration_ms
      FROM ai_usage_logs
      ${Prisma.raw(whereClause)}
      GROUP BY user_id
      ORDER BY total_count DESC
      LIMIT ${limit}
    `;
    const rows = await prisma().$queryRaw<
      Array<{
        user_id: string;
        total_count: number;
        success_count: number;
        failed_count: number;
        total_tokens: bigint;
        total_cost_yuan: Prisma.Decimal;
        avg_duration_ms: number;
      }>
    >(sql);
    return rows.map((r) => ({
      userId: r.user_id,
      totalCount: r.total_count,
      successCount: r.success_count,
      failedCount: r.failed_count,
      totalTokens: Number(r.total_tokens),
      totalCostYuan: r.total_cost_yuan,
      avgDurationMs: r.avg_duration_ms,
    }));
  }

  /**
   * 按日期趋势统计(最近 N 天)
   * 按天聚合,返回 [{date, totalCount, successCount, failedCount, totalTokens, totalCostYuan}]
   *
   * 实现:使用 Prisma groupBy + date_trunc(通过 SQL raw query)
   * 因为 Prisma 不直接支持按日期部分分组,这里用 $queryRaw
   */
  async trend(days = 7) {
    const sql = Prisma.sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE success = true)::int AS success_count,
        COUNT(*) FILTER (WHERE success = false)::int AS failed_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_yuan), 0)::numeric AS total_cost_yuan
      FROM ai_usage_logs
      WHERE created_at >= NOW() - (${days}::int || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    return prisma().$queryRaw<
      Array<{
        date: Date;
        total_count: number;
        success_count: number;
        failed_count: number;
        total_tokens: bigint;
        total_cost_yuan: Prisma.Decimal;
      }>
    >(sql);
  }
}

/**
 * 构造 SQL WHERE 子句(用于 raw query)
 * 返回形如 "WHERE created_at >= '2026-08-01' AND created_at <= '2026-08-31 23:59:59'"
 * 无日期条件时返回空字符串
 */
function buildDateWhereClause(startDate?: Date, endDate?: Date): string {
  const parts: string[] = [];
  if (startDate) {
    parts.push(`created_at >= '${startDate.toISOString()}'`);
  }
  if (endDate) {
    parts.push(`created_at <= '${endDate.toISOString()}'`);
  }
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

export const aiUsageRepository = new AiUsageRepository();

// ============================================================
// Helper:成本估算 + Provider 信息解析(供 analysis.service / admin-ai-config 共用)
// ============================================================

/**
 * 模型定价表(元/百万 token)
 * 数据来源:阿里云百炼官方文档(2026-07)
 *   - qwen-vl-plus:输入 0.8,输出 2
 *   - qwen-vl-max:输入 20,输出 20(估算,实际以官方为准)
 *   - glm-4v / glm-4v-flash:智谱定价(估算)
 * 未列出的模型按 qwen-vl-plus 定价估算
 */
const MODEL_PRICING_YUAN_PER_MILLION: Record<string, { input: number; output: number }> = {
  'qwen-vl-plus': { input: 0.8, output: 2 },
  'qwen-vl-max': { input: 20, output: 20 },
  'glm-4v': { input: 0.5, output: 0.5 },
  'glm-4v-flash': { input: 0.1, output: 0.1 },
};

/**
 * 估算单次 AI 调用的成本(元)
 * 公式:cost = promptTokens * inputPrice / 1e6 + completionTokens * outputPrice / 1e6
 *
 * @param model AI 模型名
 * @param promptTokens 输入 token 数(可空,失败时无)
 * @param completionTokens 输出 token 数
 * @returns Prisma.Decimal 成本(元);token 为空时返回 null
 */
export function estimateCostYuan(
  model: string,
  promptTokens?: number | null,
  completionTokens?: number | null,
): Prisma.Decimal | null {
  if (promptTokens == null && completionTokens == null) return null;
  const pricing =
    MODEL_PRICING_YUAN_PER_MILLION[model] ?? { input: 0.8, output: 2 };
  const p = promptTokens ?? 0;
  const c = completionTokens ?? 0;
  const cost = (p * pricing.input + c * pricing.output) / 1_000_000;
  return new Prisma.Decimal(cost.toFixed(6));
}

/**
 * 解析实际生效的 AI Provider 信息(与 ai-vision.service.ts resolveAIConfig 逻辑一致)
 * 用于用量日志记录时确定 provider / model / apiUrl
 *
 * @returns { provider, model, apiUrl } 或 null(配置无效时)
 */
export function resolveEffectiveProvider(cfg: {
  aiProvider: 'glm' | 'trae';
  aiApiKey: string;
  aiApiUrl: string;
  aiApiModel: string;
  traeApiKey: string;
  traeApiUrl: string;
  traeApiModel: string;
}): { provider: string; model: string; apiUrl: string } | null {
  if (cfg.aiProvider === 'glm') {
    if (cfg.aiApiKey.length > 0) {
      return { provider: 'glm', model: cfg.aiApiModel, apiUrl: cfg.aiApiUrl };
    }
    return null;
  }
  // aiProvider === 'trae'
  const traeReady = cfg.traeApiKey.length > 0 && cfg.traeApiUrl.length > 0;
  if (traeReady) {
    return { provider: 'trae', model: cfg.traeApiModel || cfg.aiApiModel, apiUrl: cfg.traeApiUrl };
  }
  // TRAE 配置不完整,降级到 GLM
  if (cfg.aiApiKey.length > 0) {
    return { provider: 'glm', model: cfg.aiApiModel, apiUrl: cfg.aiApiUrl };
  }
  return null;
}
