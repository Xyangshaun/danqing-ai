// ============================================================
// useLazyImage - 图片懒加载 Hook (任务包D:性能优化)
//
// 设计目标:
//   1. 用 IntersectionObserver 提前预加载(rootMargin 默认 200px)
//   2. SSR 安全:typeof IntersectionObserver !== 'undefined' 检查
//   3. once=true 时触发后停止观察,避免重复触发
//   4. 卸载时 disconnect observer,避免内存泄漏
//   5. 提供灰底 1x1 PNG 占位,避免布局抖动(CLS)
//   6. 支持 src 切换:src 变化时重新观察并重置 loadedSrc
//   7. 内部通过 addEventListener 监听 img load/error,自动维护 isLoaded/isError
//
// 使用约定:
//   const { imgRef, loadedSrc, isLoaded, isError } = useLazyImage(src);
//   <img ref={imgRef} src={loadedSrc} loading="lazy" />
//   注:hook 内部已绑定 load/error 事件,调用方无需再绑定 onLoad/onError
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LazyImageOptions {
  /** rootMargin,默认 '200px'(提前 200px 加载) */
  rootMargin?: string;
  /** threshold,默认 0 */
  threshold?: number;
  /** 占位 src(默认 1x1 浅灰 PNG data URI) */
  placeholder?: string;
  /** 触发一次后停止观察,默认 true */
  once?: boolean;
}

export interface LazyImageResult {
  imgRef: React.RefObject<HTMLImageElement>;
  loadedSrc: string | undefined;
  isLoaded: boolean;
  isError: boolean;
}

/** 1x1 浅灰 PNG(透明底,避免布局抖动) */
const DEFAULT_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN8/C8AAcsGAR7vHxkAAAAASUVORK5CYII=';

/**
 * 图片懒加载 Hook
 *
 * @param src 目标图片地址(undefined 时 loadedSrc 返回 undefined)
 * @param options 配置项
 */
export function useLazyImage(
  src: string | undefined,
  options: LazyImageOptions = {},
): LazyImageResult {
  const {
    rootMargin = '200px',
    threshold = 0,
    placeholder = DEFAULT_PLACEHOLDER,
    once = true,
  } = options;

  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // 缓存当前已加载的 src,用于 load/error 事件比较(避免 placeholder 触发 isLoaded)
  const activeSrcRef = useRef<string | undefined>(undefined);

  // 当前应展示的 src:未触发前用 placeholder,触发后用真实 src
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(
    src ? placeholder : undefined,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  // 清理 observer
  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  // src 变化时:重置状态并重新观察
  useEffect(() => {
    // 无 src 时直接清空
    if (!src) {
      activeSrcRef.current = undefined;
      setLoadedSrc(undefined);
      setIsLoaded(false);
      setIsError(false);
      disconnect();
      return;
    }

    // 重置状态
    activeSrcRef.current = src;
    setIsLoaded(false);
    setIsError(false);
    setLoadedSrc(placeholder);

    // SSR 安全检查:不支持 IntersectionObserver 时直接加载真实 src
    if (typeof IntersectionObserver === 'undefined') {
      setLoadedSrc(src);
      return;
    }

    const el = imgRef.current;
    if (!el) return;

    // 创建 observer
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setLoadedSrc(src);
            if (once) {
              disconnect();
            }
          }
        }
      },
      { rootMargin, threshold },
    );
    observerRef.current = observer;
    observer.observe(el);

    return () => {
      disconnect();
    };
  }, [src, rootMargin, threshold, placeholder, once, disconnect]);

  // 卸载时清理 observer
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // 监听 img 的 load/error 事件,自动维护 isLoaded/isError
  // 仅当 loadedSrc 是真实 src(非 placeholder)时才标记状态
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    // 当前 loadedSrc 不是真实 src(是 placeholder 或 undefined),无需监听
    if (!loadedSrc || loadedSrc === placeholder) return;

    const handleLoad = () => {
      // 仅当 img.src 与当前 activeSrc 一致时才标记(避免 src 切换竞态)
      if (activeSrcRef.current && el.src.includes(activeSrcRef.current)) {
        setIsLoaded(true);
        setIsError(false);
      }
    };
    const handleError = () => {
      if (activeSrcRef.current && el.src.includes(activeSrcRef.current)) {
        setIsError(true);
        setIsLoaded(false);
      }
    };
    el.addEventListener('load', handleLoad);
    el.addEventListener('error', handleError);
    // 若图片已加载完成(浏览器缓存),complete=true 且 naturalWidth>0
    if (el.complete && el.naturalWidth > 0) {
      handleLoad();
    }
    return () => {
      el.removeEventListener('load', handleLoad);
      el.removeEventListener('error', handleError);
    };
  }, [loadedSrc, placeholder]);

  return {
    imgRef,
    loadedSrc,
    isLoaded,
    isError,
  };
}

export default useLazyImage;
