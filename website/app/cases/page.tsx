import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { CTASection } from '@/components/ui/CTASection';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildMetadata, breadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '客户案例 - 高校艺术教育应用实践',
  description:
    '丹青有AI 已服务 32+ 高校艺术院系,累计分析 48 万+ 作品。教师每学期节省 65 小时评图时间,学生作业修改率提升至 78%。查看真实教学案例。',
  path: '/cases',
  keywords: ['客户案例', '高校艺术教育', '教师减负', '学生成长', '教学实践'],
});

const CASES = [
  {
    tag: '综合大学 · 艺术学院',
    title: '某综合性大学艺术学院:基础课评图效率提升 62%',
    summary:
      '在素描、色彩两门基础课中部署丹青有AI,教师评图时间从每份 4.2 分钟降至 1.6 分钟,反馈及时性从 3-5 天缩短到即时。',
    metrics: [
      { value: '62%', label: '评图时间下降' },
      { value: '65h', label: '教师学期节省' },
      { value: '3.5天→即时', label: '反馈周期' },
    ],
    quote:
      '以前评到后半程,评语会越来越短。现在 AI 给了基础诊断,我反而能在每张作业上给出更具体的建议。',
    author: '基础课教研组负责人',
  },
  {
    tag: '专业美院 · 设计学院',
    title: '某专业美院设计学院:四形式全覆盖的诊断实践',
    summary:
      '设计学院课程横跨平面设计、产品设计、雕塑多形式,丹青有AI 的多形式模型让一门课程的多元作业都能获得专业诊断。',
    metrics: [
      { value: '4种', label: '创意形式覆盖' },
      { value: '96%', label: '教师满意度' },
      { value: '1.6万', label: '学期分析量' },
    ],
    quote:
      '过去不同形式的作业要不同老师评,现在 AI 先做结构化初筛,我们再各自发挥专业判断,效率与深度都上来了。',
    author: '设计学院副教授',
  },
  {
    tag: '师范院校 · 美术系',
    title: '某师范院校美术系:学生成长曲线让进步可见',
    summary:
      '面向未来将走向讲台的师范生,成长曲线帮助他们既看见自己的进步,也理解"如何用数据反馈引导学生"——这是双重收获。',
    metrics: [
      { value: '78%', label: '作业修改率' },
      { value: '+41%', label: '练习主动性' },
      { value: '4.8/5', label: '学生评分' },
    ],
    quote:
      '我练了一个月素描感觉没进步,看成长曲线才发现"明暗关系"在上升,只是"构图"在平台期——原来不是没进步,是进步藏在另一个维度。',
    author: '美术系大三学生',
  },
];

const OUTCOMES = [
  { value: '32+', label: '服务高校艺术院系', desc: '综合大学与专业美院' },
  { value: '48万+', label: '累计分析作品', desc: '四种创意形式' },
  { value: '96%', label: '教师满意度', desc: '基于试点回访' },
  { value: '78%', label: '学生作业修改率', desc: '即时反馈组' },
];

export default function CasesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: '首页', url: '/' },
          { name: '客户案例', url: '/cases' },
        ])}
      />

      <PageHeader
        breadcrumb={[
          { name: '首页', href: '/' },
          { name: '客户案例', href: '/cases' },
        ]}
        eyebrow="客户案例"
        title={<>一线教学里的真实改变</>}
        description="不是实验室数据,而是来自高校艺术院系一学期部署的真实回访。教师减负、学生成长,看得见。"
      />

      {/* 成效汇总 */}
      <Section spacing="md">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-x-10">
          {OUTCOMES.map((o, i) => (
            <RevealOnScroll key={o.label} delay={i * 0.08} direction="up" className="text-center">
              <div className="stat-number text-ink-900">{o.value}</div>
              <p className="mt-3 text-sm font-medium text-ink-700">{o.label}</p>
              <p className="mt-1 text-xs text-ink-400">{o.desc}</p>
            </RevealOnScroll>
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-ink-300">* 数据来自试点院校一学期部署统计</p>
      </Section>

      {/* 案例详情 */}
      <Section spacing="lg" background="muted">
        <SectionHeader
          eyebrow="应用案例"
          title={<>三个院系,三种改变</>}
          description="从基础课到多元形式,从教师减负到学生成长——不同场景下的真实成效。"
        />
        <div className="mt-16 space-y-10">
          {CASES.map((c, i) => (
            <RevealOnScroll key={c.title} direction="up">
              <article className="overflow-hidden rounded-lg border border-ink-100 bg-paper-50 shadow-ink-sm">
                <div className="grid grid-cols-1 lg:grid-cols-12">
                  <div className="lg:col-span-7 p-8 md:p-10">
                    <span className="inline-block rounded-full bg-paper-200 px-3 py-1 text-xs text-ink-500">
                      {c.tag}
                    </span>
                    <h3 className="mt-4 text-2xl font-semibold leading-snug text-ink-900 md:text-3xl">
                      {c.title}
                    </h3>
                    <p className="mt-5 text-[15px] leading-relaxed text-ink-500">{c.summary}</p>
                    <blockquote className="mt-7 border-l-2 border-gold-400 pl-5">
                      <p className="text-base italic leading-relaxed text-ink-600">"{c.quote}"</p>
                      <footer className="mt-3 text-sm text-ink-400">— {c.author}</footer>
                    </blockquote>
                  </div>
                  <div className="lg:col-span-5 bg-ink-900 p-8 md:p-10">
                    <span className="text-xs tracking-[0.2em] uppercase text-gold-400">关键成效</span>
                    <div className="mt-6 space-y-7">
                      {c.metrics.map((m) => (
                        <div key={m.label}>
                          <div className="font-serif text-3xl font-semibold text-paper-50">{m.value}</div>
                          <div className="mt-1 text-sm text-paper-200/60">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      </Section>

      <CTASection
        title="想成为下一个案例吗?"
        description="联系我们的教育合作团队,定制适合你院系的部署方案。"
        primaryLabel="联系销售"
        secondaryLabel="查看产品功能"
        secondaryHref="/product"
      />
    </>
  );
}
