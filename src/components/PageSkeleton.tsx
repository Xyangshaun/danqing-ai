import { Loader2 } from 'lucide-react';

/* ============================================================
 * 水墨风格骨架屏系统
 *
 * 设计规范：
 * - 背景色 bg-rice-200（与页面一致）
 * - 骨架块底色：ink-900/5（rgba(15,15,15,0.05)）
 * - shimmer 扫光：透明 → ink-900/5 → 透明（横向 -100% → 100% 扫过）
 * - 圆角统一 rounded-md（0.375rem），契合 8px 网格
 * - 主色调朱砂红，保持品牌一致性
 *
 * 通过 <style> 标签定义 dqShimmer keyframe，命名加前缀避免与
 * tailwind 既有 shimmer keyframe（backgroundPosition 语义）冲突。
 * ============================================================ */

const SKELETON_STYLE = `
@keyframes dqShimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.dq-skeleton {
  position: relative;
  overflow: hidden;
  background-color: rgba(15, 15, 15, 0.05);   /* ink-900/5 */
  border-radius: 0.375rem;                     /* rounded-md */
}
.dq-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(15, 15, 15, 0.05) 50%,
    transparent 100%
  );
  animation: dqShimmer 1.6s ease-in-out infinite;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .dq-skeleton::after { animation: none; }
}
`;

/** 注入 shimmer 动画样式：渲染一个 <style> 标签定义 keyframe 与工具类 */
export function SkeletonStyle() {
  return <style dangerouslySetInnerHTML={{ __html: SKELETON_STYLE }} />;
}

/** 基础骨架块：所有高级骨架的构建单元，也可单独使用 */
export function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`dq-skeleton ${className}`} aria-hidden="true" />;
}

/* -------------------- 页面级骨架（路由懒加载 fallback） -------------------- */

/**
 * 页面级加载骨架屏：用于路由懒加载 Suspense fallback。
 * 朱砂印章式旋转图标 + 有意义的加载文案 + 水墨风格 shimmer 进度条。
 */
export default function PageSkeleton() {
  return (
    <>
      <SkeletonStyle />
      <div
        className="h-full flex flex-col items-center justify-center bg-rice-200"
        role="status"
        aria-live="polite"
        aria-label="正在加载页面"
      >
        <div className="flex flex-col items-center gap-5">
          {/* 朱砂印章式旋转图标 */}
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-2 border-ink-900/8" />
            <Loader2 className="w-14 h-14 text-cinnabar animate-spin absolute inset-0" />
          </div>

          {/* 文案：更有意义的加载描述 */}
          <div className="text-center">
            <p className="text-sm font-medium text-ink-700">正在准备工作台...</p>
            <p className="text-2xs text-ink-400 mt-1 font-mono">Preparing workspace…</p>
          </div>

          {/* 水墨风格 shimmer 进度条（朱砂主色，复用全局 progressShine 动画） */}
          <div className="w-48 h-1 bg-ink-900/5 rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-cinnabar rounded-full progress-shine-animation" />
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------- 列表页骨架 -------------------- */

export interface ListSkeletonProps {
  /** 占位卡片数量，限制在 3-5 之间，默认 4 */
  count?: number;
  /** 容器额外类名 */
  className?: string;
}

/**
 * 列表页骨架：每条占位 = 图标圆 + 两行文字。
 * 适用于历史记录、消息列表等纵向条目场景。
 */
export function ListSkeleton({ count = 4, className = '' }: ListSkeletonProps) {
  const safeCount = Math.min(Math.max(count, 3), 5);
  const items = Array.from({ length: safeCount }, (_, i) => i);
  return (
    <>
      <SkeletonStyle />
      <div
        className={`space-y-3 ${className}`}
        role="status"
        aria-live="polite"
        aria-label="列表加载中"
      >
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-rice-50 border border-ink-900/6 rounded-md p-4"
          >
            {/* 图标圆 */}
            <SkeletonBox className="w-10 h-10 rounded-full flex-shrink-0" />
            {/* 两行文字 */}
            <div className="flex-1 space-y-2">
              <SkeletonBox className="h-3 w-1/3" />
              <SkeletonBox className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* -------------------- 分析结果骨架 -------------------- */

export interface AnalysisSkeletonProps {
  /** 容器额外类名 */
  className?: string;
}

/**
 * 分析结果骨架：左大图占位 + 右分数圆环占位 + 下方 3 个维度卡片占位。
 * 适用于 AnalysisPage 结果态加载、详情面板加载等场景。
 */
export function AnalysisSkeleton({ className = '' }: AnalysisSkeletonProps) {
  return (
    <>
      <SkeletonStyle />
      <div
        className={`space-y-6 ${className}`}
        role="status"
        aria-live="polite"
        aria-label="分析结果加载中"
      >
        {/* 上：左大图 + 右分数圆环 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonBox className="md:col-span-2 aspect-[4/3] w-full" />
          <div className="flex flex-col items-center justify-center gap-4 bg-rice-50 border border-ink-900/6 rounded-md p-6">
            <SkeletonBox className="w-28 h-28 rounded-full" />
            <SkeletonBox className="h-3 w-20" />
          </div>
        </div>

        {/* 下：3 个维度卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-rice-50 border border-ink-900/6 rounded-md p-5 space-y-3"
            >
              <SkeletonBox className="h-8 w-8 rounded-full" />
              <SkeletonBox className="h-3 w-1/2" />
              <SkeletonBox className="h-6 w-2/3" />
              <SkeletonBox className="h-2 w-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* -------------------- 通用卡片骨架 -------------------- */

export interface CardSkeletonProps {
  /** 卡片数量，默认 4 */
  count?: number;
  /**
   * 容器布局类名，默认为 4 列响应式网格。
   * 需要单列时传 "grid grid-cols-1 gap-4 max-w-2xl" 等。
   */
  className?: string;
}

/**
 * 通用卡片骨架：用于 HistoryPage、MaterialsPage、GrowthPage 等。
 * 每张卡片含图标块 + 标题 + 数值 + 进度条占位。
 */
export function CardSkeleton({
  count = 4,
  className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
}: CardSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      <SkeletonStyle />
      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-label="内容加载中"
      >
        {items.map((i) => (
          <div
            key={i}
            className="bg-rice-50 border border-ink-900/6 rounded-md p-5 space-y-3"
          >
            <SkeletonBox className="h-8 w-8 rounded-full" />
            <SkeletonBox className="h-3 w-1/2" />
            <SkeletonBox className="h-6 w-2/3" />
            <SkeletonBox className="h-2 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
