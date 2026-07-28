// ============================================================
// AI 分析 Repository
// 对应文档:data-model-v1.md §7.2(强制 tenant_id 过滤)
// 所有查询必须带 WHERE tenant_id = ?(由本层显式传入)
// ============================================================

import { Prisma, type Analysis, type ArtType, type AnalysisStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface ListAnalysesFilter {
  tenantId: string;
  userId?: string;
  artType?: ArtType;
  status?: AnalysisStatus;
  startDate?: Date;
  endDate?: Date;
  page: number;
  pageSize: number;
}

export class AnalysisRepository {
  /**
   * 创建分析任务(强制带 tenantId + userId)
   */
  async create(
    data: Pick<Analysis, 'tenantId' | 'userId' | 'workType' | 'imageUrl' | 'title' | 'remark'>,
  ): Promise<Analysis> {
    return prisma().analysis.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        workType: data.workType,
        imageUrl: data.imageUrl,
        title: data.title,
        remark: data.remark,
        status: 'pending',
      },
    });
  }

  /**
   * 按 ID 查询分析任务(强制 tenant_id 校验,防跨租户)
   */
  async findById(tenantId: string, id: string): Promise<Analysis | null> {
    return prisma().analysis.findFirst({
      where: { id, tenantId },
    });
  }

  /**
   * 更新分析任务结果(强制 tenant_id 校验)
   * 注:result 为 Json 类型,Prisma 要求 null 显式包装为 DbNull / JsonNull
   */
  async updateResult(
    tenantId: string,
    id: string,
    data: Pick<Partial<Analysis>, 'status' | 'result' | 'failureReason' | 'overallScore' | 'durationMs' | 'completedAt'>,
  ): Promise<Analysis | null> {
    const existing = await prisma().analysis.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return null;
    // Prisma JSON 字段:null 需通过 DbNull 显式表达(否则 TS 类型不允许)
    const updateData: Prisma.AnalysisUpdateInput = {
      status: data.status,
      failureReason: data.failureReason,
      overallScore: data.overallScore,
      durationMs: data.durationMs,
      completedAt: data.completedAt,
    };
    if (data.result === null) {
      updateData.result = Prisma.DbNull;
    } else if (data.result !== undefined) {
      updateData.result = data.result as Prisma.InputJsonValue;
    }
    return prisma().analysis.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 分页查询分析历史(强制 tenant_id 过滤)
   * 利用复合索引 (tenant_id, created_at) 加速
   */
  async list(filter: ListAnalysesFilter): Promise<{ items: Analysis[]; total: number }> {
    const where: Prisma.AnalysisWhereInput = {
      tenantId: filter.tenantId,
    };
    if (filter.userId) where.userId = filter.userId;
    if (filter.artType) where.workType = filter.artType;
    if (filter.status) where.status = filter.status;
    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = filter.startDate;
      if (filter.endDate) where.createdAt.lte = filter.endDate;
    }

    const [items, total] = await Promise.all([
      prisma().analysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma().analysis.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * 当月分析次数(用于配额校验)
   */
  async countMonthlyUsage(tenantId: string, year: number, month: number): Promise<number> {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    return prisma().analysis.count({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
        status: { in: ['success', 'processing', 'pending'] },
      },
    });
  }

  /**
   * 删除分析任务(强制 tenant_id 校验,防跨租户删除)
   * @param tenantId 租户 ID
   * @param id 分析任务 ID
   * @returns true 删除成功;false 记录不存在或不属于该租户
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma().analysis.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return false;
    await prisma().analysis.delete({
      where: { id },
    });
    return true;
  }
}

export const analysisRepository = new AnalysisRepository();
