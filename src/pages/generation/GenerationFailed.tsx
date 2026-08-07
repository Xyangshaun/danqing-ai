// ============================================================
// 生成失败组件(M2-T7)
// ------------------------------------------------------------
// status=failed 时展示 failureReason + 重试按钮。
// 重试回到表单态,保留用户上次填写的参数(由页面层维护)。
// ============================================================

import { AlertCircle, RefreshCw } from 'lucide-react';

interface GenerationFailedProps {
  /** 失败原因(后端透出,可为 null) */
  failureReason: string | null;
  /** 重试:回到表单 */
  onRetry: () => void;
}

/**
 * 生成失败态
 * @param props 见 GenerationFailedProps
 */
export default function GenerationFailed({ failureReason, onRetry }: GenerationFailedProps) {
  return (
    <div className="bg-rice-50 border border-ink-900/8 rounded-lg shadow-subtle overflow-hidden">
      <div className="px-6 py-10 flex flex-col items-center text-center">
        <div className="w-16 h-16 mb-5 flex items-center justify-center rounded-full bg-cinnabar/10">
          <AlertCircle className="w-8 h-8 text-cinnabar" />
        </div>

        <h2 className="font-serif text-lg font-bold text-ink-900">生成失败</h2>
        <p className="text-sm text-ink-500 mt-2 max-w-sm break-words">
          {failureReason || 'AI 服务暂时不可用，请稍后重试'}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center justify-center gap-2 h-10 px-5 rounded bg-cinnabar text-white text-sm font-medium hover:bg-cinnabar-dark transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重新生成
        </button>
      </div>
    </div>
  );
}
