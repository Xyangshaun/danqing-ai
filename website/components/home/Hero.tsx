import React from 'react';
import Link from 'next/link';
import { CTA_LINKS, SITE } from '@/lib/site';

/**
 * 首页 Hero 区(LCP 关键)
 * - 服务端组件,文字直出,不依赖 JS 渲染
 * - CSS 动画入场,避免 framer-motion 阻塞首屏
 * - 水墨主视觉用 SVG,无外部图片请求
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-paper-100">
      {/* 背景水墨晕染层 */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 75% 30%, rgba(26, 26, 26, 0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 15% 80%, rgba(201, 169, 97, 0.1) 0%, transparent 55%), radial-gradient(ellipse 40% 50% at 90% 90%, rgba(200, 57, 46, 0.06) 0%, transparent 60%)',
        }}
      />

      {/* 右侧水墨主视觉 SVG */}
      <HeroInkVisual />

      <div className="container-content relative z-10 flex min-h-[88vh] flex-col justify-center pt-12 pb-20 md:min-h-[92vh]">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div
            className="section-eyebrow opacity-0"
            style={{ animation: 'ink-fade-in 0.8s 0.1s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            面向高校艺术教育的 AI 作业诊断系统
          </div>

          {/* 主标题:丹青有AI */}
          <h1
            className="mt-6 text-display-xl font-semibold leading-[1.05] text-ink-900 opacity-0"
            style={{ animation: 'ink-fade-in 0.9s 0.25s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            丹青有AI
            <span className="block mt-2 text-ink-700">
              让艺术教育<span className="text-cinnabar-500">更智能</span>
            </span>
          </h1>

          {/* Slogan 描述 */}
          <p
            className="mt-7 max-w-xl text-lg leading-relaxed text-ink-500 opacity-0 md:text-xl"
            style={{ animation: 'ink-fade-in 0.9s 0.4s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            以专业美院标准,3 秒智能分析绘画、设计、产品设计、雕塑四种创意形式的
            <span className="text-ink-800 font-medium">构图、色彩、笔触</span>。
            为教师减负,让学生成长可见。
          </p>

          {/* CTA 双按钮 */}
          <div
            className="mt-10 flex flex-col items-start gap-4 opacity-0 sm:flex-row sm:items-center"
            style={{ animation: 'ink-fade-in 0.9s 0.55s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            <a
              href={CTA_LINKS.trial}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary group"
              data-track="hero-cta-trial"
            >
              立即体验
              <span className="transition-transform duration-300 ease-ink group-hover:translate-x-1" aria-hidden="true">
                →
              </span>
            </a>
            <Link href="/product" className="btn-secondary" data-track="hero-cta-learn">
              了解产品
            </Link>
          </div>

          {/* 信任信号 */}
          <div
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-400 opacity-0"
            style={{ animation: 'ink-fade-in 0.9s 0.7s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
              3 秒级响应 SLA
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cinnabar-400" />
              专业美院标准
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400" />
              四种创意形式
            </span>
          </div>
        </div>
      </div>

      {/* 底部滚动提示 */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-ink-300 md:flex">
        <span className="text-[10px] tracking-[0.3em] uppercase">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-ink-300 to-transparent" />
      </div>
    </section>
  );
}

/**
 * Hero 水墨主视觉(纯 SVG)
 * - 大墨团晕染 + 飞白笔触 + 朱砂印章
 * - 右侧定位,移动端隐藏避免遮挡文字
 */
function HeroInkVisual() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 opacity-0"
      style={{ animation: 'ink-spread 1.8s 0.3s cubic-bezier(0.22,1,0.36,1) forwards' }}
      aria-hidden="true"
    >
      <svg
        className="absolute right-0 top-1/2 h-[90%] w-[55%] -translate-y-1/2 md:w-[50%]"
        viewBox="0 0 600 700"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* 墨团晕染滤镜 */}
          <filter id="hero-ink" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="9" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="60" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="hero-ink-2" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.02" numOctaves="2" seed="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="30" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <radialGradient id="ink-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#1a1a1a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="stone-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2e5c6e" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2e5c6e" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 主墨团 */}
        <g filter="url(#hero-ink)">
          <ellipse cx="380" cy="320" rx="220" ry="200" fill="url(#ink-grad)" />
        </g>

        {/* 石青淡墨辅团 */}
        <g filter="url(#hero-ink-2)" opacity="0.7">
          <ellipse cx="480" cy="180" rx="120" ry="100" fill="url(#stone-grad)" />
        </g>

        {/* 飞白笔触 */}
        <g filter="url(#hero-ink-2)" opacity="0.5">
          <path
            d="M 120 500 Q 280 460, 460 490 T 580 480"
            stroke="#1a1a1a"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 180 560 Q 320 540, 440 555"
            stroke="#1a1a1a"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />
        </g>

        {/* 飞溅小墨点 */}
        <g filter="url(#hero-ink-2)">
          <circle cx="180" cy="200" r="8" fill="#1a1a1a" opacity="0.4" />
          <circle cx="520" cy="420" r="5" fill="#1a1a1a" opacity="0.5" />
          <circle cx="240" cy="380" r="4" fill="#c9a961" opacity="0.6" />
          <circle cx="450" cy="560" r="3" fill="#1a1a1a" opacity="0.4" />
        </g>

        {/* 朱砂印章 */}
        <g transform="translate(440, 80) rotate(-6)">
          <rect x="0" y="0" width="72" height="72" rx="2" fill="#c8392e" opacity="0.92" filter="url(#hero-ink-2)" />
          <text
            x="36"
            y="48"
            textAnchor="middle"
            fontFamily="Songti SC, SimSun, serif"
            fontSize="32"
            fontWeight="700"
            fill="#faf8f3"
            letterSpacing="-1"
          >
            DQ
          </text>
        </g>

        {/* 金色题款(竖排) */}
        <text
          x="560"
          y="280"
          fontFamily="Songti SC, SimSun, serif"
          fontSize="18"
          fill="#c9a961"
          opacity="0.7"
          writingMode="tb"
          letterSpacing="4"
        >
          丹青不渝
        </text>
      </svg>
    </div>
  );
}
