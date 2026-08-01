// ============================================================
// 知识库实时检索 Controller(Phase 5 预留接口)
//
// 对应 API:
//   GET    /knowledge/search           知识库搜索(关键词/标签/分类)
//   GET    /knowledge/:id              知识条目详情
//   POST   /knowledge                  创建知识条目(管理员)
//   PATCH  /knowledge/:id              更新知识条目
//   DELETE /knowledge/:id              删除知识条目
//   POST   /knowledge/index/rebuild    重建索引(管理员)
//   GET    /knowledge/index/status     索引状态查询
//   POST   /knowledge/search/validate  搜索权限验证
//
// 当前状态:预留实现,统一返回 501 Not Implemented
// 未来方向:支持 ES/向量检索,提供艺术知识库智能问答
//
// 预留接口规范:
//   - 路由已挂载,鉴权 + 权限校验完整
//   - 类型定义见 api-contract.ts §3.11.1
//   - v2.0 将实现完整业务逻辑
// ============================================================

import type { RequestHandler } from 'express';
import { error } from '../utils/response.js';
import { ErrorCode } from '../types/api-contract.js';

/**
 * 预留接口统一响应:返回 501 Not Implemented
 * 不实现具体业务逻辑,仅声明接口存在性
 */
const notImplemented: RequestHandler = (_req, res) => {
  return error(
    res,
    ErrorCode.NOT_IMPLEMENTED,
    '该接口为预留接口,尚未实现。请参考API文档了解未来扩展方向。',
    501,
  );
};

/**
 * GET /knowledge/search
 * 知识库搜索(关键词/标签/分类)
 * - 权限:knowledge:read(所有角色)
 * - 未来:支持 ES 全文检索 + 向量语义检索
 */
export const searchKnowledge: RequestHandler = notImplemented;

/**
 * GET /knowledge/:id
 * 知识条目详情
 * - 权限:knowledge:read
 * - 路由顺序:必须在 /search /index/* 之后注册
 */
export const getKnowledgeById: RequestHandler = notImplemented;

/**
 * POST /knowledge
 * 创建知识条目
 * - 权限:knowledge:write(仅 ADMIN/OWNER)
 * - 审计:写操作需记录 audit log
 */
export const createKnowledge: RequestHandler = notImplemented;

/**
 * PATCH /knowledge/:id
 * 更新知识条目
 * - 权限:knowledge:write(仅 ADMIN/OWNER)
 */
export const updateKnowledge: RequestHandler = notImplemented;

/**
 * DELETE /knowledge/:id
 * 删除知识条目
 * - 权限:knowledge:write(仅 ADMIN/OWNER)
 */
export const deleteKnowledge: RequestHandler = notImplemented;

/**
 * POST /knowledge/index/rebuild
 * 重建索引
 * - 权限:knowledge:index:manage(仅 ADMIN)
 * - 异步:返回任务 ID,通过 WebSocket 推送进度
 */
export const rebuildKnowledgeIndex: RequestHandler = notImplemented;

/**
 * GET /knowledge/index/status
 * 索引状态查询
 * - 权限:knowledge:read
 */
export const getKnowledgeIndexStatus: RequestHandler = notImplemented;

/**
 * POST /knowledge/search/validate
 * 搜索权限验证
 * - 权限:knowledge:read
 * - 用途:前端在执行搜索前预校验权限与查询条件
 */
export const validateKnowledgeSearch: RequestHandler = notImplemented;
