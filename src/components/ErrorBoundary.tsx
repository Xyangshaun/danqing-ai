/// <reference types="vite/client" />
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  /** 自定义降级 UI，不传则用默认 */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界：捕获子组件渲染/生命周期异常，避免整页白屏。
 * 用法：<ErrorBoundary><Page/></ErrorBoundary>
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* 上报到控制台/可扩展为远程监控 */
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    const { hasError, error } = this.state;
    if (!hasError || !error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return <DefaultFallback error={error} reset={this.reset} />;
  }
}

/* 默认降级 UI：与生态软件风格一致 */
function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const isDev = import.meta.env.DEV;
  return (
    <div className="h-full flex items-center justify-center p-6 bg-rice-200">
      <div className="max-w-md w-full bg-rice-50 border border-cinnabar/20 rounded-lg shadow-overlay overflow-hidden animate-slide-up">
        {/* 顶部色带 */}
        <div className="h-1.5 bg-gradient-to-r from-cinnabar to-cinnabar-dark" />

        <div className="p-6">
          {/* 图标 */}
          <div className="w-12 h-12 bg-cinnabar/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-cinnabar" />
          </div>

          {/* 标题 */}
          <h2 className="font-serif text-lg font-bold text-ink-900 mb-2">
            页面出现了问题
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            这个模块暂时无法正常显示，可以尝试重新加载，或返回首页继续操作。
          </p>

          {/* 错误详情（仅开发态） */}
          {isDev && (
            <details className="mb-4 bg-rice-100 border border-ink-900/8 rounded-md p-3 group">
              <summary className="cursor-pointer flex items-center gap-2 text-xs font-medium text-ink-600">
                <Bug className="w-3.5 h-3.5" />
                开发者信息
              </summary>
              <pre className="mt-2 text-2xs font-mono text-cinnabar whitespace-pre-wrap break-all">
                {error.name}: {error.message}
                {error.stack && '\n\n' + error.stack}
              </pre>
            </details>
          )}

          {/* 操作 */}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 bg-cinnabar hover:bg-cinnabar-dark text-white rounded-md text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重试
            </button>
            <Link
              to="/"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 bg-rice-100 hover:bg-rice-200 text-ink-700 border border-ink-900/10 rounded-md text-sm font-medium transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
