import { Loader2 } from 'lucide-react';

/* 页面级加载骨架屏：路由懒加载 fallback */
export default function PageSkeleton() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-rice-200">
      <div className="flex flex-col items-center gap-4">
        {/* 旋转图标 */}
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-ink-900/10" />
          <Loader2 className="w-12 h-12 text-cinnabar animate-spin absolute inset-0" />
        </div>

        {/* 文案 */}
        <div className="text-center">
          <p className="text-sm font-medium text-ink-700">加载中</p>
          <p className="text-2xs text-ink-400 mt-1 font-mono">Loading workspace...</p>
        </div>

        {/* 进度条动画 */}
        <div className="w-40 h-0.5 bg-ink-900/8 rounded-full overflow-hidden">
          <div className="h-full bg-cinnabar rounded-full animate-shimmer bg-[length:200%_100%]" />
        </div>
      </div>
    </div>
  );
}
