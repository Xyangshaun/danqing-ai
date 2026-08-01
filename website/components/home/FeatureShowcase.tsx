import React from 'react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';

type Feature = {
  no: string;
  title: string;
  subtitle: string;
  desc: string;
  points: string[];
  accent: 'cinnabar' | 'stone' | 'gold';
  visual: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    no: '一',
    title: '构图分析',
    subtitle: '画面的骨架',
    desc: '从黄金分割到视觉重量,AI 识别画面的视觉重心、动势线与平衡关系,判断构图类型并标注问题所在。',
    points: ['视觉重心定位', '动势线提取', '平衡度量化评估', '构图类型识别'],
    accent: 'cinnabar',
    visual: <CompositionVisual />,
  },
  {
    no: '二',
    title: '色彩分析',
    subtitle: '画面的血肉',
    desc: '解析主色调、色彩关系、明暗五调子与冷暖对比,生成色彩分布热力图,指出协调与冲突之处。',
    points: ['主色调提取', '色彩关系图谱', '明暗五调子检测', '冷暖对比分析'],
    accent: 'stone',
    visual: <ColorVisual />,
  },
  {
    no: '三',
    title: '笔触分析',
    subtitle: '画面的肌理',
    desc: '识别笔触轨迹、粗细变化、密度与韵律,判断用笔的骨力与节奏,区分习作与成熟作品的笔法差异。',
    points: ['笔触轨迹追踪', '力度与速度识别', '密度分布分析', '韵律节奏评估'],
    accent: 'gold',
    visual: <BrushVisual />,
  },
];

const accentText = {
  cinnabar: 'text-cinnabar-500',
  stone: 'text-stone-500',
  gold: 'text-gold-600',
};

/**
 * 功能展示:三大分析维度
 * 左右交错布局,每维度配 SVG 视觉示意
 */
export function FeatureShowcase() {
  return (
    <Section spacing="lg" background="muted" id="features">
      <SectionHeader
        eyebrow="功能展示"
        title={<>三大分析维度,深度理解每一张作业</>}
        description="构图、色彩、笔触——画面的骨架、血肉与肌理。丹青有AI 以专业美院教学标准,逐一拆解。"
      />

      <div className="mt-20 space-y-24 md:space-y-32">
        {FEATURES.map((feature, i) => {
          const reversed = i % 2 === 1;
          return (
            <RevealOnScroll key={feature.title} direction="up">
              <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
                {/* 文字 */}
                <div className={reversed ? 'md:order-2' : ''}>
                  <div className="flex items-baseline gap-4">
                    <span className={`font-serif text-6xl font-semibold ${accentText[feature.accent]} opacity-70`}>
                      {feature.no}
                    </span>
                    <div>
                      <span className="block text-xs tracking-[0.2em] uppercase text-ink-400">
                        {feature.subtitle}
                      </span>
                      <h3 className="mt-1 text-3xl font-semibold text-ink-900">{feature.title}</h3>
                    </div>
                  </div>
                  <p className="mt-6 text-base leading-relaxed text-ink-500 md:text-lg">
                    {feature.desc}
                  </p>
                  <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {feature.points.map((point) => (
                      <li key={point} className="flex items-center gap-2 text-sm text-ink-600">
                        <span className={`inline-block h-1 w-1 rounded-full bg-current ${accentText[feature.accent]}`} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* 视觉 */}
                <div className={reversed ? 'md:order-1' : ''}>
                  <div className="ink-card aspect-[4/3] p-6">
                    {feature.visual}
                  </div>
                </div>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>

      <div className="mt-20 text-center">
        <Link href="/product" className="btn-secondary" data-track="home-feature-learn-more">
          查看完整功能详情 →
        </Link>
      </div>
    </Section>
  );
}

/* ---------- 三维度 SVG 示意 ---------- */

function CompositionVisual() {
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#faf8f3" />
      {/* 三分线 */}
      <g stroke="#c8392e" strokeWidth="0.8" opacity="0.4" strokeDasharray="4 3">
        <line x1="133" y1="20" x2="133" y2="280" />
        <line x1="267" y1="20" x2="267" y2="280" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="20" y1="200" x2="380" y2="200" />
      </g>
      {/* 视觉重心十字 */}
      <g stroke="#c8392e" strokeWidth="1.5">
        <line x1="267" y1="92" x2="267" y2="108" />
        <line x1="259" y1="100" x2="275" y2="100" />
      </g>
      <circle cx="267" cy="100" r="14" fill="none" stroke="#c8392e" strokeWidth="1" opacity="0.5" />
      {/* 动势线 */}
      <path d="M 60 250 Q 200 180, 267 100" stroke="#1a1a1a" strokeWidth="1.2" fill="none" opacity="0.5" />
      <path d="M 340 240 Q 300 180, 267 100" stroke="#1a1a1a" strokeWidth="1" fill="none" opacity="0.3" />
      {/* 主体示意 */}
      <ellipse cx="200" cy="160" rx="50" ry="40" fill="#1a1a1a" opacity="0.12" />
      <text x="20" y="285" fontSize="10" fill="#6b6b6b" fontFamily="sans-serif">视觉重心 / 动势线 / 三分法</text>
    </svg>
  );
}

function ColorVisual() {
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#faf8f3" />
      {/* 色彩环 */}
      <g transform="translate(200, 140)">
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const x = Math.cos(angle) * 70;
          const y = Math.sin(angle) * 70;
          const hue = i * 30;
          return <circle key={i} cx={x} cy={y} r="14" fill={`hsl(${hue}, 45%, 55%)`} opacity="0.85" />;
        })}
        <circle r="22" fill="#1a1a1a" opacity="0.1" />
      </g>
      {/* 明暗条 */}
      <g transform="translate(40, 240)">
        {['#0d0d0d', '#4a4a4a', '#6b6b6b', '#a8a8a8', '#d4d4d4', '#f7f7f7'].map((c, i) => (
          <rect key={c} x={i * 50} y="0" width="48" height="14" fill={c} />
        ))}
      </g>
      <text x="40" y="275" fontSize="10" fill="#6b6b6b" fontFamily="sans-serif">色相环 / 明暗五调子</text>
      <text x="290" y="275" fontSize="10" fill="#2e5c6e" fontFamily="sans-serif">冷暖对比</text>
    </svg>
  );
}

function BrushVisual() {
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#faf8f3" />
      {/* 笔触轨迹 */}
      <defs>
        <filter id="b-blur"><feGaussianBlur stdDeviation="0.6" /></filter>
      </defs>
      <g filter="url(#b-blur)">
        <path d="M 40 80 Q 120 40, 200 90 T 360 70" stroke="#1a1a1a" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.7" />
        <path d="M 40 140 Q 130 110, 220 150 T 360 130" stroke="#1a1a1a" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M 40 200 Q 140 180, 240 210 T 360 195" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
        <path d="M 60 250 Q 150 240, 250 255" stroke="#c9a961" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>
      {/* 力度点 */}
      <circle cx="200" cy="90" r="4" fill="#c8392e" opacity="0.8" />
      <circle cx="220" cy="150" r="3" fill="#c8392e" opacity="0.6" />
      <text x="40" y="285" fontSize="10" fill="#6b6b6b" fontFamily="sans-serif">笔触轨迹 / 力度 / 韵律</text>
    </svg>
  );
}
