import React from 'react';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { CountUp } from '@/components/ui/CountUp';

const STATS = [
  { value: 32, suffix: '+', label: '服务高校艺术院系', sub: '覆盖综合大学与专业美院' },
  { value: 48, suffix: '万+', label: '累计分析作品', sub: '绘画/设计/产品/雕塑' },
  { value: 96, suffix: '%', label: '教师满意度', sub: '基于试点院校回访' },
  { value: 65, suffix: '小时', label: '教师每学期节省', sub: '相当于一周半工作时间' },
];

/**
 * 数据背书区块
 * 玻璃卡片化 + 渐变描边数字 + 数字滚动动画(进入视口时递增)
 * 大字号数字 + 标签,克制装饰,用数据本身说话
 */
export function DataEndorsement() {
  return (
    <Section spacing="lg" id="stats">
      <SectionHeader
        eyebrow="数据背书"
        subtitleEn="Proven Results"
        title={<>被一线教学验证的成效</>}
        description="以下数据来自试点院校一学期的真实部署,而非实验室假设。"
        align="center"
      />

      <div className="mt-16 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6">
        {STATS.map((stat, i) => (
          <RevealOnScroll key={stat.label} delay={i * 0.1} direction="up">
            <div className="glass-card group h-full p-7 text-center">
              {/* 顶部装饰:渐变金线 */}
              <div className="mx-auto mb-4 h-px w-8 divider-gradient opacity-60 transition-all duration-500 ease-ink group-hover:w-12 group-hover:opacity-100" />

              {/* 数字滚动 */}
              <div className="flex items-baseline justify-center">
                <CountUp
                  value={stat.value}
                  suffix={stat.suffix}
                  className="stat-number"
                />
              </div>

              {/* 标签 */}
              <p className="mt-3 text-sm font-medium text-ink-700 md:text-base">{stat.label}</p>
              <p className="mt-1 text-xs text-ink-400">{stat.sub}</p>

              {/* 底部装饰:悬浮时显现的小圆点 */}
              <div className="mt-4 flex justify-center">
                <span className="h-1 w-1 rounded-full bg-gold-400 opacity-0 transition-opacity duration-500 ease-ink group-hover:opacity-100" />
              </div>
            </div>
          </RevealOnScroll>
        ))}
      </div>

      <p className="mt-12 text-center text-xs text-ink-300">
        * 数据为试点阶段统计,持续更新中
      </p>
    </Section>
  );
}