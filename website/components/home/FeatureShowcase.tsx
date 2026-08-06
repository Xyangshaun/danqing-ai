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

const accentTextGradient = {
  cinnabar: 'text-gradient-cinnabar',
  stone: 'text-stone-500',
  gold: 'text-gradient-gold',
};

const accentBgSoft = {
  cinnabar: 'bg-cinnabar-50/50',
  stone: 'bg-stone-50/50',
  gold: 'bg-gold-50/50',
};

/**
 * 功能展示:三大分析维度
 * 左右交错布局,每维度配 SVG 视觉示意
 * 视觉卡片:玻璃材质 + 渐变边框光 + 内高光
 */
export function FeatureShowcase() {
  return (
    <Section spacing="lg" background="muted" id="features">
      <SectionHeader
        eyebrow="功能展示"
        subtitleEn="AI Diagnosis"
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
                    <span className={`font-serif text-6xl font-semibold ${accentTextGradient[feature.accent]} opacity-80`}>
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
                {/* 视觉:玻璃卡片 + 渐变边框光 + AI 数据叠加层 */}
                <div className={reversed ? 'md:order-1' : ''}>
                  <div className="group relative aspect-[4/3]">
                    {/* 外发光层 */}
                    <div
                      className={`absolute -inset-1 rounded-lg ${accentBgSoft[feature.accent]} opacity-0 blur-xl transition-opacity duration-700 ease-ink group-hover:opacity-100`}
                      aria-hidden="true"
                    />
                    {/* 主卡片 */}
                    <div className="ink-card relative h-full overflow-hidden p-6">
                      {feature.visual}
                      {/* AI 数据叠加层:悬停时浮现,展示 AI 分析数据(借鉴 TTT ise 分屏"代码 vs 效果"对比) */}
                      <AIDataOverlay accent={feature.accent} featureKey={feature.title} />
                    </div>
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

/* ---------- AI 数据叠加层(借鉴 TTT ise 分屏"代码 vs 效果"对比叙事) ---------- */

const AI_DATA: Record<string, { score: number; items: { label: string; value: string }[] }> = {
  构图分析: {
    score: 87,
    items: [
      { label: '视觉重心', value: '右上 1/3' },
      { label: '平衡度', value: '92%' },
      { label: '构图类型', value: '三分法' },
    ],
  },
  色彩分析: {
    score: 84,
    items: [
      { label: '主色调', value: '暖赭石' },
      { label: '色相关系', value: '邻近色' },
      { label: '明暗对比', value: '中强' },
    ],
  },
  笔触分析: {
    score: 91,
    items: [
      { label: '平均速度', value: '中速偏快' },
      { label: '力度分布', value: '重轻重' },
      { label: '韵律评分', value: 'A' },
    ],
  },
};

const accentAIColor = {
  cinnabar: { dot: 'bg-cinnabar-400', bar: 'bg-cinnabar-400', score: 'text-cinnabar-300' },
  stone: { dot: 'bg-stone-400', bar: 'bg-stone-400', score: 'text-stone-300' },
  gold: { dot: 'bg-gold-400', bar: 'bg-gold-400', score: 'text-gold-300' },
};

function AIDataOverlay({ accent, featureKey }: { accent: 'cinnabar' | 'stone' | 'gold'; featureKey: string }) {
  const data = AI_DATA[featureKey];
  if (!data) return null;
  const c = accentAIColor[accent];

  return (
    <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-4 opacity-0 transition-opacity duration-500 ease-ink group-hover:opacity-100">
      <div className="glass-panel-dark w-44 rounded-md p-3.5 text-xs text-paper-100 backdrop-blur-xl">
        {/* 顶部:AI 标识 + 评分 */}
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold-400">
            <span className="relative inline-block h-1.5 w-1.5">
              <span className={`absolute inset-0 rounded-full ${c.dot}`} />
              <span className={`absolute inset-0 animate-ping rounded-full ${c.dot} opacity-60`} />
            </span>
            AI VISION
          </span>
          <span className={`font-serif text-lg font-semibold ${c.score}`}>
            {data.score}
            <span className="ml-0.5 text-[10px] text-paper-200/50">/100</span>
          </span>
        </div>
        {/* 进度条 */}
        <div className="mb-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${c.bar} rounded-full transition-all duration-700 ease-out`}
            style={{ width: `${data.score}%` }}
          />
        </div>
        {/* 数据项 */}
        <div className="space-y-1.5">
          {data.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-[11px]">
              <span className="text-paper-200/60">{item.label}</span>
              <span className="font-medium text-paper-100">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
