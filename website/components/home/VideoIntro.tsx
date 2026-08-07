'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;
const TOTAL_MS = 2200; // 开场动画总时长(2.2s)

/**
 * 首页开场动画 — 笔触划出 + 品牌浮现
 *
 * 纯 Framer Motion 实现,无视频文件、无外部资源:
 *  - 0.0 ~ 0.9s 毛笔笔触从左向右扫出(SVG pathLength + 渐变墨色)
 *  - 0.6 ~ 1.2s 品牌名 "丹青有AI" 上浮淡入
 *  - 1.0 ~ 1.5s 副标题 "AI 助你看见作品的每一笔墨" 浮现
 *  - 2.0 ~ 2.2s 自动完成,Hero 接管
 *
 * 设计原则:
 *  - 极简:无音频、无视频、无 2.5D 视差、无多层山石——纯一屏 CSS/SVG 动画
 *  - 健壮:无外部资源,无 404 风险,无解码等待,所有用户都能看到品牌
 *  - 减弱动效:动画时长归零,直接显示终态(仍等待 2.2s,确保体验一致)
 */
export function VideoIntro({ onComplete }: { onComplete: () => void }) {
  const prefersReduced = useReducedMotion();
  const doneRef = useRef(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // 调试:URL ?slow=N 放慢 N 倍,便于逐帧观察动画
    const slowParam =
      typeof window !== 'undefined'
        ? parseFloat(new URLSearchParams(window.location.search).get('slow') || '1')
        : 1;
    const slow = Number.isFinite(slowParam) && slowParam > 0 ? slowParam : 1;
    const timeout = window.setTimeout(finish, TOTAL_MS * slow);
    return () => window.clearTimeout(timeout);
  }, [finish]);

  // 减弱动效偏好:所有动画时长归零,直接呈现终态
  const strokeTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.9, ease: EASE };
  const brandTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.6, delay: 0.6, ease: EASE };
  const subTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.5, delay: 1.0 };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] overflow-hidden bg-paper-100"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        aria-hidden="true"
      >
        {/* 背景:水墨宣纸基调,避免纯白 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 22% 28%, rgba(201,169,97,0.14) 0%, transparent 45%), radial-gradient(circle at 78% 70%, rgba(46,92,110,0.10) 0%, transparent 45%)',
          }}
        />

        {/* 笔触 + 品牌 — 整体居中 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          {/* 毛笔笔触 SVG 划出 — 横扫,渐变墨色模拟笔锋 */}
          <div className="relative w-[70vw] max-w-[800px]">
            <svg
              viewBox="0 0 800 40"
              className="w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                {/* 墨色渐变:两端淡出,中间浓郁,模拟毛笔起收笔 */}
                <linearGradient id="brushGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0" />
                  <stop offset="6%" stopColor="#1a1a1a" stopOpacity="0.5" />
                  <stop offset="20%" stopColor="#1a1a1a" stopOpacity="0.95" />
                  <stop offset="80%" stopColor="#1a1a1a" stopOpacity="0.95" />
                  <stop offset="94%" stopColor="#1a1a1a" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d="M 0 20 C 100 12, 200 26, 300 18 S 500 14, 600 22 S 750 18, 800 20"
                stroke="url(#brushGradient)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={strokeTransition}
              />
            </svg>
          </div>

          {/* 品牌名 — 浮入 */}
          <motion.h1
            className="mt-6 text-5xl sm:text-6xl md:text-7xl font-bold tracking-[0.3em] sm:tracking-[0.4em] text-ink-900"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={brandTransition}
          >
            丹青有AI
          </motion.h1>

          {/* 副标题 — 浮现 */}
          <motion.p
            className="mt-4 text-sm sm:text-base tracking-[0.2em] text-ink-700/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={subTransition}
          >
            AI 助你看见作品的每一笔墨
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
