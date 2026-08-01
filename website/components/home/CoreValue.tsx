import React from 'react';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';

const VALUES = [
  {
    no: '01',
    title: '3 秒智能分析',
    desc: '从作业上传到诊断报告,全程 3 秒级响应。AI 视觉模型在毫秒间完成构图、色彩、笔触的多维度识别,让学生在创作记忆鲜活时即刻获得反馈。',
    accent: 'cinnabar' as const,
  },
  {
    no: '02',
    title: '多形态支持',
    desc: '不止绘画。系统覆盖绘画、设计、产品设计、雕塑四种创意形式,针对每种形式的视觉语言建立专属分析模型,真正贴合高校艺术教育的多元课程需求。',
    accent: 'stone' as const,
  },
  {
    no: '03',
    title: '专业美院标准',
    desc: '诊断维度对齐专业美院教学规范——构图的黄金分割与视觉重量、色彩的五调子与冷暖关系、笔触的骨法与韵律。让 AI 评图有人文厚度,而非机械打分。',
    accent: 'gold' as const,
  },
];

const accentColor = {
  cinnabar: 'text-cinnabar-500',
  stone: 'text-stone-500',
  gold: 'text-gold-600',
};

const accentBar = {
  cinnabar: 'bg-cinnabar-500',
  stone: 'bg-stone-500',
  gold: 'bg-gold-500',
};

/**
 * 核心价值区块
 * 编辑式三栏,避免 generic 卡片堆砌
 * 大编号 + 左竖线装饰,营造书卷气
 */
export function CoreValue() {
  return (
    <Section spacing="lg" id="core-value">
      <SectionHeader
        eyebrow="核心价值"
        title={<>为什么选择丹青有AI</>}
        description="我们用 AI 视觉理解能力,重新定义艺术作业的诊断效率与专业深度。"
      />

      <div className="mt-16 grid grid-cols-1 gap-px md:grid-cols-3 md:gap-0">
        {VALUES.map((value, i) => (
          <RevealOnScroll key={value.no} delay={i * 0.12} direction="up">
            <div className="group relative h-full pl-8 md:pl-10 md:pr-8 md:first:pl-0">
              {/* 左侧装饰竖线 */}
              <span
                className={`absolute left-0 top-2 h-12 w-0.5 ${accentBar[value.accent]} transition-all duration-500 ease-ink group-hover:h-16`}
                aria-hidden="true"
              />

              <span
                className={`font-serif text-5xl font-semibold ${accentColor[value.accent]} opacity-80 transition-opacity duration-500 group-hover:opacity-100`}
              >
                {value.no}
              </span>

              <h3 className="mt-5 text-2xl font-semibold text-ink-900">
                {value.title}
              </h3>

              <p className="mt-4 text-[15px] leading-[1.8] text-ink-500">
                {value.desc}
              </p>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </Section>
  );
}
