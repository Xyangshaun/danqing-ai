'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import openingVideo from '@/assets/videos/opening.mp4';

/**
 * 首页开场视频 — 墨滴落水 · 三层涟漪 · 作品谱系 · 品牌浮现
 *
 * 使用本地 Remotion 生成的 MP4 开场素材(1920×1080, 7.2s, H.264)。
 * 播放结束后淡出并回调 onComplete,随后展示真正的 Hero 内容区。
 *
 * 防白屏兜底逻辑:
 *  1. 加载中显示墨滴 Loading 占位动画(而非纯白屏)
 *  2. 视频 3 秒内未就绪 → 超时直接进入首页
 *  3. 视频加载/解码失败 → 立即进入首页
 *  4. 尊减弱动态偏好时直接跳过,避免不必要的媒体播放
 */

const EASE = [0.22, 1, 0.36, 1] as const;
// 视频未就绪的最大等待时间;超过则跳过开场,避免用户长时间白屏
const READY_TIMEOUT_MS = 3000;

export function VideoIntro({ onComplete }: { onComplete: () => void }) {
  const prefersReduced = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const doneRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 兜底:一旦进入首页,标记完成并清理定时器
  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    // 视频末尾 0.3s 内触发淡出,以衔接 Hero 进入
    if (!doneRef.current && v.duration > 0 && v.currentTime >= v.duration - 0.3) {
      doneRef.current = true;
      setExiting(true);
      setTimeout(onComplete, 650);
    }
  };

  // 加载失败/未就绪时的兜底
  const handleError = React.useCallback(() => {
    // 立即进入首页,不阻塞页面
    finish();
  }, [finish]);

  useEffect(() => {
    if (prefersReduced) {
      finish();
      return;
    }

    // 超时兜底:视频 3s 未开始播放则跳过开场
    const timeout = setTimeout(() => {
      const v = videoRef.current;
      // 已加载到足够数据(有元数据)则继续等播放;否则视为加载卡住,直接进入首页
      if (v && v.readyState >= 1) {
        // 已有元数据,应能正常播放,再给一段时间
        const secondChance = setTimeout(finish, READY_TIMEOUT_MS);
        return () => clearTimeout(secondChance);
      }
      finish();
    }, READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [prefersReduced, finish]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-[90] overflow-hidden bg-paper-100"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.65, ease: EASE }}
          aria-hidden="true"
        >
          {/* 背景:水墨宣纸基调,避免纯白 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 22% 28%, rgba(201,169,97,0.14) 0%, transparent 45%), radial-gradient(circle at 78% 70%, rgba(46,92,110,0.10) 0%, transparent 45%), radial-gradient(circle at 66% 18%, rgba(200,57,46,0.05) 0%, transparent 38%)',
            }}
          />

          <video
            ref={videoRef}
            className="relative h-full w-full object-cover"
            src={openingVideo}
            autoPlay
            muted
            playsInline
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onError={handleError}
            // 视频自带完整开场动画,无需额外交互
          />

          {/* 墨滴 Loading 占位:视频加载期间显示,避免白屏 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <motion.div
                className="h-16 w-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 34% 26%, #555 0%, #1a1a1a 52%, #0a0a0a 100%)',
                  boxShadow: '0 0 30px rgba(26,26,26,0.4)',
                }}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-900/30"
                animate={{ scale: [0.4, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}