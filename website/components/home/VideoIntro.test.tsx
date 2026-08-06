// ============================================================
// VideoIntro 淡出逻辑单元测试
// 验证:1) 视频播放到末尾时触发淡出并回调 onComplete
//       2) doneRef 防止重复触发(仅回调一次)
//       3) 未到末尾时不会触发淡出
//       4) 减弱动态偏好时直接跳过并回调
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// 在导入组件前 mock framer-motion,以便控制 useReducedMotion 返回值
const reducedMotionMock = vi.fn<() => boolean>(() => false);
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotionMock(),
  // 简化渲染:AnimatePresence 直接渲染子节点,motion.div 渲染为普通 div
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
}));

import React from 'react';
import { VideoIntro } from './VideoIntro';

/** 从渲染结果中取出 <video> 元素 */
function getVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video');
  if (!video) throw new Error('未找到 <video> 元素');
  return video as HTMLVideoElement;
}

/**
 * 模拟视频播放进度:先写入 video 的 duration/currentTime,
 * 再触发 timeUpdate 事件(handleTimeUpdate 读取的是 e.currentTarget)。
 */
function seekTo(
  video: HTMLVideoElement,
  { duration, currentTime }: { duration: number; currentTime: number }
) {
  act(() => {
    Object.defineProperty(video, 'duration', {
      configurable: true,
      writable: true,
      value: duration,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      writable: true,
      value: currentTime,
    });
    fireEvent.timeUpdate(video);
  });
}

describe('VideoIntro 淡出逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotionMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('视频播放到末尾(duration - 0.3s)时触发淡出并回调 onComplete', () => {
    const onComplete = vi.fn();
    const { container } = render(<VideoIntro onComplete={onComplete} />);

    const video = getVideo(container);
    // 断言初始处于片头播放状态
    expect(video).toHaveAttribute('src', '/videos/opening.mp4');

    // 模拟视频时长 7.2s,当前播放到 7.0s(>= 7.2 - 0.3)
    seekTo(video, { duration: 7.2, currentTime: 7.0 });

    // 淡出尚未完成时不应立即回调(650ms 延时后)
    expect(onComplete).not.toHaveBeenCalled();

    // 推进 650ms 延时
    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('doneRef 防止重复触发:多次 timeUpdate 仅回调一次 onComplete', () => {
    const onComplete = vi.fn();
    const { container } = render(<VideoIntro onComplete={onComplete} />);

    const video = getVideo(container);

    seekTo(video, { duration: 7.2, currentTime: 7.0 });
    // 再次触发(模拟持续播放)
    seekTo(video, { duration: 7.2, currentTime: 7.2 });

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('未到末尾(currentTime < duration - 0.3)时不会触发淡出', () => {
    const onComplete = vi.fn();
    const { container } = render(<VideoIntro onComplete={onComplete} />);

    const video = getVideo(container);

    seekTo(video, { duration: 7.2, currentTime: 3.0 });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('减弱动态偏好(prefers-reduced-motion)时直接回调 onComplete,不播放视频', () => {
    reducedMotionMock.mockReturnValue(true);
    const onComplete = vi.fn();
    render(<VideoIntro onComplete={onComplete} />);

    // useEffect 在渲染后立即调用 onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});