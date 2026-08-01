import React from 'react';
import Link from 'next/link';
import { SITE } from '@/lib/site';

type LogoProps = {
  /** 是否显示完整文字(默认显示) */
  showText?: boolean;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 文字颜色(用于深色背景) */
  variant?: 'default' | 'light';
  className?: string;
};

/**
 * 丹青有AI 品牌标识
 * - 朱砂印章 "DQ" 取自 DanQing
 * - 印章采用传统篆刻方章形态,朱砂红底白字
 */
export function LogoMark({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dimensions = {
    sm: { box: 28, font: 13 },
    md: { box: 36, font: 16 },
    lg: { box: 52, font: 22 },
  }[size];

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: dimensions.box, height: dimensions.box }}
      aria-hidden="true"
    >
      <svg
        width={dimensions.box}
        height={dimensions.box}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        {/* 印章主体:朱砂红方章,边缘略带不规则(模拟篆刻) */}
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="2"
          fill="#c8392e"
        />
        {/* 印章磨损边缘:用 mask 模拟篆刻的不均匀 */}
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="2"
          fill="none"
          stroke="#a82a20"
          strokeWidth="0.5"
          opacity="0.6"
        />
        {/* DQ 字样:篆刻阴文(白字) */}
        <text
          x="24"
          y="31"
          textAnchor="middle"
          fontFamily="Songti SC, SimSun, serif"
          fontSize="20"
          fontWeight="700"
          fill="#faf8f3"
          letterSpacing="-1"
        >
          DQ
        </text>
      </svg>
    </span>
  );
}

/**
 * 完整 Logo:印章 + 中英文品牌名
 */
export function Logo({ showText = true, size = 'md', variant = 'default', className = '' }: LogoProps) {
  const textSize = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  }[size];

  const textColor = variant === 'light' ? 'text-paper-50' : 'text-ink-900';
  const subColor = variant === 'light' ? 'text-paper-200/70' : 'text-ink-400';

  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 group ${className}`}
      aria-label={`${SITE.name} 首页`}
    >
      <LogoMark size={size} className="transition-transform duration-500 ease-ink group-hover:rotate-[-4deg]" />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className={`font-serif font-semibold ${textSize} ${textColor} tracking-tight`}>
            {SITE.name}
          </span>
          <span className={`text-[10px] tracking-[0.18em] ${subColor} mt-0.5`}>
            {SITE.nameEn.toUpperCase()}
          </span>
        </span>
      )}
    </Link>
  );
}
