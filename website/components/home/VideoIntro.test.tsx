// ============================================================
// VideoIntro 开场动画单元测试
// 验证:1) 2.2s 后自动回调 onComplete
//       2) doneRef 防止重复触发(仅回调一次)
//       3) 减弱动态偏好不影响定时器触发
//       4) 渲染包含笔触 SVG、品牌名、副标题
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// 在导入组件前 mock framer-motion,以便控制 useReducedMotion 返回值
const reducedMotionMock = vi.fn<() => boolean>(() => false);
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotionMock(),
  // 简化渲染:AnimatePresence 直接渲染子节点,motion.* 渲染为普通元素
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    }
  ),
}));

import React from 'react';
import { VideoIntro } from './VideoIntro';

describe('VideoIntro 开场动画', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotionMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('2.2s 后自动回调 onComplete', () => {
    const onComplete = vi.fn();
    render(<VideoIntro onComplete={onComplete} />);

    // 渲染完成时尚未到 2.2s,不应回调
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // 推进到 2.2s 触发完成
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('doneRef 防止重复触发:多次推进定时器仅回调一次', () => {
    const onComplete = vi.fn();
    render(<VideoIntro onComplete={onComplete} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('减弱动态偏好时仍正常完成 onComplete(不立即 finish)', () => {
    reducedMotionMock.mockReturnValue(true);
    const onComplete = vi.fn();
    render(<VideoIntro onComplete={onComplete} />);

    // 1.5s 时不应完成
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // 2.2s 后完成
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('渲染包含品牌名与副标题', () => {
    const onComplete = vi.fn();
    const { container } = render(<VideoIntro onComplete={onComplete} />);

    expect(container.textContent).toContain('丹青有AI');
    expect(container.textContent).toContain('AI 助你看见作品的每一笔墨');
  });

  it('渲染包含笔触 SVG', () => {
    const onComplete = vi.fn();
    const { container } = render(<VideoIntro onComplete={onComplete} />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    // 路径必须含 M (起点),即笔触 path 存在
    expect(path?.getAttribute('d') || '').toMatch(/^M\s/);
  });
});
