import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { CTASection } from '@/components/ui/CTASection';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { BRAND_ART } from '@/lib/artworks';

export const metadata: Metadata = buildMetadata({
  title: '产品功能 - 三大分析维度与四种创意形式',
  description:
    '丹青有AI 提供构图、色彩、笔触三大分析维度,支持绘画、设计、产品设计、雕塑四种创意形式,含灵感融合系统与成长曲线,3 秒级 SLA 技术架构。',
  path: '/product',
  keywords: ['产品功能', '构图分析', '色彩分析', '笔触分析', '灵感融合', '成长曲线'],
});

const DIMENSIONS = [
  {
    no: '一',
    name: '构图分析',
    desc: '识别画面视觉重心、动势线、平衡关系,判断构图类型(三角/S 形/对角线/对称等),并以可视化标注呈现问题。',
    details: [
      '视觉重心定位:标注重心位置与黄金分割点的偏移关系',
      '动势线提取:半透明叠加显示视线流动路径',
      '视觉重量热力图:呈现画面重量分布是否平衡',
      '构图类型识别:自动判断并对照标准给出评价',
    ],
    accent: 'cinnabar',
  },
  {
    no: '二',
    name: '色彩分析',
    desc: '解析主色调、色彩关系、明暗五调子与冷暖对比,生成色彩分布图谱,指出协调与冲突之处。',
    details: [
      '主色调提取:识别画面主导色相与饱和度',
      '色彩关系图谱:呈现色相之间的呼应与对比',
      '明暗五调子检测:量化高光/中间调/明暗交界/反光/投影',
      '冷暖对比分析:判断色彩情绪与氛围一致性',
    ],
    accent: 'stone',
  },
  {
    no: '三',
    name: '笔触分析',
    desc: '识别笔触轨迹、粗细变化、密度与韵律,判断用笔的骨力与节奏,区分习作与成熟作品的笔法差异。',
    details: [
      '笔触轨迹追踪:还原用笔路径与走向',
      '力度与速度识别:推测用笔的提按顿挫',
      '密度分布分析:判断画面疏密节奏',
      '韵律节奏评估:评估整体用笔的统一性与变化',
    ],
    accent: 'gold',
  },
];

const FORMS = [
  { name: '绘画', desc: '素描、色彩、国画、油画、水彩等平面绘画形式', icon: 'painting' },
  { name: '设计', desc: '平面设计、视觉传达、版式、海报等设计稿件', icon: 'design' },
  { name: '产品设计', desc: '产品手绘、工业设计草图、透视图等三维表达', icon: 'product' },
  { name: '雕塑', desc: '雕塑多角度照片、立体造型、空间装置等', icon: 'sculpture' },
];

const accentText: Record<string, string> = {
  cinnabar: 'text-cinnabar-500',
  stone: 'text-stone-500',
  gold: 'text-gold-600',
};

export default function ProductPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: '首页', url: '/' },
          { name: '产品功能', url: '/product' },
        ])}
      />

      <PageHeader
        breadcrumb={[
          { name: '首页', href: '/' },
          { name: '产品功能', href: '/product' },
        ]}
        eyebrow="产品功能"
        title={<>深度理解每一张作业的专业 AI 诊断</>}
        description="三大分析维度、四种创意形式、灵感融合与成长曲线——以 3 秒级 SLA 技术架构,服务高校艺术教育全场景。"
      />

      {/* 三大分析维度详解 */}
      <Section spacing="lg">
        <SectionHeader
          eyebrow="三大分析维度"
          title={<>构图、色彩、笔触,逐一拆解</>}
          description="每一张作业都从骨架、血肉、肌理三个层面被理解。诊断不是打分,而是结构化的专业对话。"
        />
        <div className="mt-16 space-y-16">
          {DIMENSIONS.map((dim, i) => (
            <RevealOnScroll key={dim.name} direction="up">
              <div className="grid grid-cols-1 gap-8 border-t border-ink-100 pt-10 md:grid-cols-12 md:gap-12">
                <div className="md:col-span-4">
                  <div className="flex items-baseline gap-3">
                    <span className={`font-serif text-5xl font-semibold ${accentText[dim.accent]} opacity-70`}>
                      {dim.no}
                    </span>
                    <h3 className="text-2xl font-semibold text-ink-900">{dim.name}</h3>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-500">{dim.desc}</p>
                </div>
                <div className="md:col-span-8">
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {dim.details.map((d) => (
                      <li key={d} className="flex items-start gap-3 rounded-ink bg-paper-200/40 p-4">
                        <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${accentText[dim.accent].replace('text', 'bg')}`} />
                        <span className="text-sm leading-relaxed text-ink-600">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </Section>

      {/* 四种创意形式 */}
      <Section spacing="lg" background="muted">
        <SectionHeader
          eyebrow="四种创意形式"
          title={<>不止绘画,覆盖艺术教育多元课程</>}
          description="针对每种创意形式的视觉语言,建立专属分析模型,真正贴合高校艺术教学实际。"
        />
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FORMS.map((form, i) => (
            <RevealOnScroll key={form.name} delay={i * 0.08} direction="up">
              <div className="group h-full rounded-lg border border-ink-100 bg-paper-50 p-7 transition-all duration-500 ease-ink hover:border-gold-300 hover:shadow-ink">
                <div className="flex h-12 w-12 items-center justify-center rounded-ink bg-ink-900 text-paper-50 transition-colors duration-500 group-hover:bg-cinnabar-500">
                  <FormIcon name={form.icon} />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-ink-900">{form.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{form.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </Section>

      {/* 灵感融合 + 成长曲线 */}
      <Section spacing="lg">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
          <RevealOnScroll direction="up">
            <span className="section-eyebrow">灵感融合</span>
            <h3 className="mt-4 text-display-md font-semibold leading-tight text-ink-900">
              从临摹到创作的桥梁
            </h3>
            <p className="mt-5 text-base leading-relaxed text-ink-500">
              灵感融合系统不是"AI 替你生成作品",而是"AI 帮你看见灵感的可能性"。系统分析学生近期作业的风格倾向,从艺术史数据库检索对话关系作品,生成融合建议——构图、色调、题材的组合方向。
            </p>
            <ul className="mt-6 space-y-3">
              {['风格倾向识别', '艺术史案例检索', '融合方向建议', '启发而非替代'].map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm text-ink-600">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
                  {p}
                </li>
              ))}
            </ul>
            {/* 品牌画作配图 */}
            <div className="relative mt-8 overflow-hidden rounded-lg border border-ink-100/40 shadow-ink-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BRAND_ART}
                alt="灵感融合 · 丹青水墨意象"
                loading="lazy"
                className="aspect-[16/9] w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-2 border border-paper-50/40" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-ink-900/40 to-transparent" />
            </div>
          </RevealOnScroll>

          <RevealOnScroll direction="up" delay={0.1}>
            <span className="section-eyebrow">成长曲线</span>
            <h3 className="mt-4 text-display-md font-semibold leading-tight text-ink-900">
              让进步可见,让瓶颈可识
            </h3>
            <p className="mt-5 text-base leading-relaxed text-ink-500">
              系统对每位学生的历次作业持续追踪,在构图、色彩、笔触三个维度分别记录分数与趋势,形成可视化的成长曲线。上升趋势给正反馈,平台期给新方向,波动期识别"有意义的尝试"。
            </p>
            <div className="mt-6 rounded-lg border border-ink-100 bg-paper-200/40 p-6">
              <GrowthCurveVisual />
            </div>
          </RevealOnScroll>
        </div>
      </Section>

      {/* 技术架构优势 */}
      <Section spacing="lg" background="ink" contained={false}>
        <div className="container-content relative">
          <div className="max-w-2xl">
            <span className="section-eyebrow text-gold-400">
              <span style={{ background: 'currentColor' }} className="inline-block h-px w-8" />
              技术架构
            </span>
            <h2 className="mt-4 text-display-md font-semibold leading-tight text-paper-50">
              3 秒级 SLA,为课堂而生的响应速度
            </h2>
            <p className="mt-5 text-base leading-relaxed text-paper-200/70 md:text-lg">
              从作业上传到诊断报告生成,全程 3 秒内完成。这意味着教师可以在课堂上实时投影评图,学生可以在提交后即刻获得反馈——这是 AI 评图真正进入教学现场的前提。
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { num: '3s', label: '端到端响应 SLA', desc: '上传到报告生成' },
              { num: '99.9%', label: '服务可用性', desc: '课堂时段优先保障' },
              { num: '多租户', label: '院校数据隔离', desc: 'RBAC 权限模型' },
            ].map((item, i) => (
              <RevealOnScroll key={item.label} delay={i * 0.1} direction="up">
                <div className="rounded-lg border border-paper-200/10 bg-ink-800/60 p-7">
                  <div className="font-serif text-4xl font-semibold text-gold-400">{item.num}</div>
                  <div className="mt-3 text-base font-medium text-paper-50">{item.label}</div>
                  <div className="mt-1 text-sm text-paper-200/50">{item.desc}</div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </Section>

      <CTASection
        title="想看完整的诊断报告长什么样?"
        description="立即体验,上传一张作业,3 秒获得专业诊断。"
      />
    </>
  );
}

function FormIcon({ name }: { name: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'painting')
    return <svg {...common}><path d="M14 4l6 6-9 9H5v-6l9-9z" /><path d="M14 4l6 6" /></svg>;
  if (name === 'design')
    return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9h16M9 4v16" /></svg>;
  if (name === 'product')
    return <svg {...common}><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v8l9 5 9-5V8" /></svg>;
  return <svg {...common}><circle cx="12" cy="9" r="4" /><path d="M5 21c0-4 3-6 7-6s7 2 7 6" /></svg>;
}

function GrowthCurveVisual() {
  return (
    <svg viewBox="0 0 400 160" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9a961" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#c9a961" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#e8e1cf" strokeWidth="1">
        <line x1="40" y1="40" x2="380" y2="40" />
        <line x1="40" y1="80" x2="380" y2="80" />
        <line x1="40" y1="120" x2="380" y2="120" />
      </g>
      <path d="M 50 120 L 110 110 L 170 95 L 230 70 L 290 55 L 360 40 L 360 140 L 50 140 Z" fill="url(#gc-grad)" />
      <polyline points="50,120 110,110 170,95 230,70 290,55 360,40" fill="none" stroke="#c9a961" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="50,125 110,118 170,120 230,108 290,95 360,88" fill="none" stroke="#2e5c6e" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
      {[[50,120],[110,110],[170,95],[230,70],[290,55],[360,40]].map(([x,y],i)=>(<circle key={i} cx={x} cy={y} r="3.5" fill="#c8392e" />))}
      <text x="40" y="155" fontSize="9" fill="#6b6b6b" fontFamily="sans-serif">第1周</text>
      <text x="345" y="155" fontSize="9" fill="#6b6b6b" fontFamily="sans-serif">第16周</text>
      <text x="355" y="35" fontSize="9" fill="#a8854a" fontFamily="sans-serif">构图</text>
      <text x="355" y="83" fontSize="9" fill="#2e5c6e" fontFamily="sans-serif">色彩</text>
    </svg>
  );
}
