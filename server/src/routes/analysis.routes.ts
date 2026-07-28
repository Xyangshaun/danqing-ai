// ============================================================
// 分析路由
// 对应 API:
//   POST   /analyses          (JSON: artType + imageUrl)         (需鉴权 + analysis:create)
//   POST   /analyses/upload   (multipart/form-data: image)      (需鉴权 + analysis:create)
//   GET    /analyses          (分页查询历史)                     (需鉴权 + analysis:read:own|tenant)
//   GET    /analyses/:id      (查询单条详情)                     (需鉴权 + analysis:read:own|tenant)
//   DELETE /analyses/:id      (删除分析记录)                     (需鉴权 + analysis:delete:own|tenant)
//
// 权限矩阵:
//   - 所有角色(student/teacher/admin/owner)拥有 analysis:create + analysis:read:own + analysis:delete:own
//   - teacher/admin/owner 额外拥有 analysis:read:tenant
//   - admin/owner 额外拥有 analysis:delete:tenant
//
// 数据范围过滤(service 层基于 role 实现):
//   - student:仅自己的记录(canReadTenantWide=false)
//   - teacher/admin/owner:租户内全量(canReadTenantWide=true)
//   - teacher/student 删除:仅自己的记录(canDeleteTenantWide=false)
//   - admin/owner 删除:租户内任意(canDeleteTenantWide=true)
//
// multer 配置:
//   - storage:磁盘存储到 server/uploads/(env UPLOAD_DIR 可配置)
//   - fileFilter:仅允许 jpeg/png/webp/bmp
//   - limits:fileSize ≤ 10MB(对应技术约束 ≤10MB)
//   - 分析完成后由 service 层自动清理临时文件
// ============================================================

import { Router } from 'express';
import multer, { MulterError } from 'multer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createAnalysis,
  uploadAnalysis,
  listAnalyses,
  getAnalysis,
  deleteAnalysis,
} from '../controllers/analysis.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { apiRateLimiter } from '../middlewares/rate-limit.js';
import {
  requirePermission,
  requireAnyPermission,
} from '../middlewares/permission.js';
import { env } from '../config/env.js';
import { ErrorCode } from '../types/api-contract.js';
import { error } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const analysisRouter: Router = Router();

// ---------- 全局中间件 ----------
analysisRouter.use(authMiddleware);
analysisRouter.use(tenantMiddleware);
analysisRouter.use(apiRateLimiter());

// ---------- multer 配置(磁盘存储 + 类型/大小限制) ----------

/**
 * 允许的 MIME 类型(对应技术约束:仅图片)
 */
const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
];

/**
 * 上传目录绝对路径(相对于 server/ 根)
 * 启动时确保目录存在(同步创建,失败则记录日志但不阻塞)
 */
function ensureUploadDir(): string {
  const cfg = env();
  // uploadDir 为相对路径(如 "uploads"),解析为 server/ 下的绝对路径
  const baseDir = process.cwd();
  const absDir = resolve(baseDir, cfg.uploadDir);
  try {
    mkdirSync(absDir, { recursive: true });
  } catch (err) {
    // 目录已存在或无权限:已存在忽略,无权限记录日志(后续 multer 写入时会再次失败)
    const msg = err instanceof Error ? err.message : String(err);
    if (!(err instanceof Error && 'code' in err && (err as { code: string }).code === 'EEXIST')) {
      logger.warn({ err: msg, dir: absDir }, '[analysis.routes] mkdir uploads dir failed');
    }
  }
  return absDir;
}

const uploadDir = ensureUploadDir();
const maxFileSize = env().uploadMaxSize;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // 文件名:时间戳 + 随机串 + 原始扩展名,避免冲突
    const ext = (file.originalname.split('.').pop() ?? 'jpg').toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // 文件类型不支持:用自定义 Error(MulterError 不支持自定义 code)
    // handleUploadError 通过 error.message === 'INVALID_FILE_TYPE' 识别
    const err = new Error('INVALID_FILE_TYPE');
    err.name = 'FileTypeError';
    cb(err);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 1,
    parts: 10, // 字段数上限(防止恶意构造大量字段)
  },
});

/**
 * multer 错误处理包装中间件
 * 将 MulterError / FileTypeError 转换为统一错误码,避免暴露内部堆栈
 */
function handleUploadError(err: unknown): { code: ErrorCode; message: string; httpStatus: number } | null {
  // 1. 自定义文件类型错误(fileFilter 抛出)
  if (err instanceof Error && err.name === 'FileTypeError' && err.message === 'INVALID_FILE_TYPE') {
    return {
      code: ErrorCode.FILE_TYPE_UNSUPPORTED,
      message: `文件类型不支持,仅允许:${ALLOWED_MIME_TYPES.join('/')}`,
      httpStatus: 400,
    };
  }
  // 2. MulterError(大小/数量/字段限制)
  if (err instanceof MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return {
          code: ErrorCode.FILE_TOO_LARGE,
          message: `文件大小超过上限(${Math.floor(maxFileSize / 1024 / 1024)}MB)`,
          httpStatus: 413,
        };
      case 'LIMIT_FILE_COUNT':
        return {
          code: ErrorCode.FILE_UPLOAD_FAILED,
          message: '上传文件数量超过上限(1 个)',
          httpStatus: 400,
        };
      case 'LIMIT_UNEXPECTED_FILE':
        return {
          code: ErrorCode.FILE_UPLOAD_FAILED,
          message: '上传字段名错误,应为 image',
          httpStatus: 400,
        };
      default:
        return {
          code: ErrorCode.FILE_UPLOAD_FAILED,
          message: `文件上传失败:${err.code}`,
          httpStatus: 400,
        };
    }
  }
  return null;
}

/**
 * 包装 multer single('image') 中间件,统一错误处理
 */
const uploadImage = upload.single('image');
const uploadMiddleware: Router = Router();

uploadMiddleware.use((req, res, next) => {
  uploadImage(req, res, (err) => {
    if (err) {
      const mapped = handleUploadError(err);
      if (mapped) {
        return error(res, mapped.code, mapped.message, mapped.httpStatus);
      }
      // 非 MulterError,走统一错误处理
      return next(err);
    }
    next();
  });
});

// ---------- 业务路由 ----------
// 权限校验顺序:authMiddleware → tenantMiddleware → apiRateLimiter → requirePermission → handler
// 数据范围过滤由 service 层基于 req.role 实现(见 analysis.service.ts)

// POST /analyses - JSON 模式(imageUrl),需 analysis:create 权限(所有角色拥有)
analysisRouter.post('/', requirePermission('analysis:create'), createAnalysis);

// POST /analyses/upload - multipart/form-data 文件上传,需 analysis:create 权限
// 必须在 GET /:id 之前注册(避免 /upload 被解析为 :id)
analysisRouter.post('/upload', uploadMiddleware, requirePermission('analysis:create'), uploadAnalysis);

// GET /analyses - 分页查询历史,需 analysis:read:own 或 analysis:read:tenant 权限
// student 仅拥有 analysis:read:own,teacher/admin/owner 拥有两者
analysisRouter.get('/', requireAnyPermission('analysis:read:own', 'analysis:read:tenant'), listAnalyses);

// GET /analyses/:id - 查询单条详情,需 analysis:read:own 或 analysis:read:tenant 权限
analysisRouter.get('/:id', requireAnyPermission('analysis:read:own', 'analysis:read:tenant'), getAnalysis);

// DELETE /analyses/:id - 删除分析记录,需 analysis:delete:own 或 analysis:delete:tenant 权限
// student/teacher 拥有 analysis:delete:own(仅删自己),admin/owner 拥有两者(删任意)
analysisRouter.delete('/:id', requireAnyPermission('analysis:delete:own', 'analysis:delete:tenant'), deleteAnalysis);
