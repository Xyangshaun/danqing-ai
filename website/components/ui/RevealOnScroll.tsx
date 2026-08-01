'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type RevealOnScrollProps = {
  children: React.ReactNode;
  /** 延迟(秒),用于错落入场 */
  delay?: number;
  /** 入场方向 */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  /** 位移距离 */
  distance?: number;
  className?: string;
  /** 是否只触发一次(默认是) */
  once?: boolean;
};

/**
 * 滚动进入视口时揭示动画
 * 克制使用:仅淡入 + 轻位移,避免过度动效
 */
export function RevealOnScroll({
  children,
  delay = 0,
  direction = 'up',
  distance = 24,
  className = '',
  once = true,
}: RevealOnScrollProps) {
  const prefersReduced = useReducedMotion();

  const offset = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    none: {},
  }[direction];

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, margin: '-80px 0px -80px 0px' }}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
