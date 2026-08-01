import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionHeader } from '@/components/ui/Section';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { CTASection } from '@/components/ui/CTASection';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { SITE, CTA_LINKS } from '@/lib/site';

export const metadata: Metadata = buildMetadata({
  title: '关于我们 - 品牌故事与团队',
  description:
    '丹青有AI 取自中国传统绘画代称"丹青",寓意传统艺术与智能科技的融合。我们致力于用 AI 视觉理解能力,服务高校艺术教育。',
  path: '/about',
  keywords: ['关于我们', '品牌故事', '团队', '丹青有AI'],
});

const TEAM = [
  { name: '产品团队', role: '产品与设计', desc: '来自一线艺术教育与互联网产品背景,懂教学也懂体验。' },
  { name: '算法团队', role: 'AI 视觉研究', desc: '计算机视觉与艺术理论交叉背景,让模型读懂构图与笔触。' },
  { name: '教育顾问', role: '教学顾问', desc: '高校艺术院系资深教师组成顾问团,确保标准专业对齐。' },
];

const VALUES = [
  { title: '技术服务于人', desc: 'AI 是助手而非替代。我们始终坚持让教师回归教育本质。' },
  { title: '专业对齐美院', desc: '诊断标准对齐专业美院教学规范,有人文厚度,非机械打分。' },
  { title: '数据尊重隐私', desc: '学生作品与教学数据严格保护,院校版支持私有化部署。' },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: '首页', url: '/' },
          { name: '关于我们', url: '/about' },
        ])}
      />

      <PageHeader
        breadcrumb={[
          { name: '首页', href: '/' },
          { name: '关于我们', href: '/about' },
        ]}
        eyebrow="关于我们"
        title={<>丹青不渝,以 AI 守护艺术教育</>}
        description="丹青,中国传统绘画的代称——丹即朱砂,青即石青。我们以此命名,是承诺用最先进的 AI,服务最古老的艺术教育。"
      />

      {/* 品牌故事 */}
      <Section spacing="lg">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-16">
          <div className="md:col-span-5">
            <span className="section-eyebrow">品牌故事</span>
            <h2 className="mt-4 text-display-md font-semibold leading-tight text-ink-900">
              为什么叫"丹青有AI"
            </h2>
          </div>
          <div className="md:col-span-7">
            <div className="space-y-5 text-base leading-[1.85] text-ink-500">
              <p>
                团队在创立之初反复讨论一个问题:一个面向艺术教育的 AI 产品,应该叫什么名字?太科技,显得冷漠;太文艺,又似乎不够专业。直到有人提议"丹青"——中国传统绘画的代称,一切豁然开朗。
              </p>
              <p>
                <span className="font-medium text-ink-800">丹青</span>,丹即朱砂,青即石青,是古代绘画最经典的两种矿物颜料。它既是绘画本身的代称,也象征着"丹青不渝"的恒久承诺。我们以此命名,是希望表达两层意思:其一,我们的 AI 根植于对传统艺术的理解;其二,我们对艺术教育的承诺,如丹青般不渝。
              </p>
              <p>
                而"有AI"三字,既是"有 AI(拥有智能)"的直白陈述,也暗合"丹青有(了)AI"的语法——传统的丹青,有了 AI 的助力。这种传统与现代的张力,正是我们希望产品所承载的气质。
              </p>
              <p className="border-l-2 border-gold-400 pl-5 italic text-ink-600">
                "如果一个 AI 系统连水墨画的留白都看不懂,它就不配谈艺术教育。"
              </p>
              <p>这句话成为团队训练视觉模型的座右铭,也定义了我们的产品哲学。</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 价值观 */}
      <Section spacing="lg" background="muted">
        <SectionHeader
          eyebrow="我们相信"
          title={<>三个不会动摇的原则</>}
        />
        <div className="mt-14 grid grid-cols-1 gap-px md:grid-cols-3">
          {VALUES.map((v, i) => (
            <RevealOnScroll key={v.title} delay={i * 0.1} direction="up">
              <div className="h-full bg-paper-50 p-8">
                <span className="font-serif text-4xl font-semibold text-gold-500 opacity-70">
                  0{i + 1}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-ink-900">{v.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">{v.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </Section>

      {/* 团队 */}
      <Section spacing="lg">
        <SectionHeader
          eyebrow="团队"
          title={<>交叉背景,才有真正懂艺术的 AI</>}
          description="艺术教育与 AI 技术的交叉地带,需要懂两边的人。"
        />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TEAM.map((t, i) => (
            <RevealOnScroll key={t.name} delay={i * 0.1} direction="up">
              <div className="h-full rounded-lg border border-ink-100 bg-paper-50 p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink-900 font-serif text-2xl font-semibold text-paper-50">
                  {t.name[0]}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink-900">{t.name}</h3>
                <p className="mt-1 text-xs tracking-wider text-cinnabar-500">{t.role}</p>
                <p className="mt-4 text-sm leading-relaxed text-ink-500">{t.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-ink-400">
          团队具体成员信息将在正式发布时公布
        </p>
      </Section>

      {/* 联系方式 */}
      <Section spacing="lg" background="ink" contained={false}>
        <div className="container-content relative">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-eyebrow justify-center text-gold-400">
              <span style={{ background: 'currentColor' }} className="inline-block h-px w-8" />
              联系我们
            </span>
            <h2 className="mt-4 text-display-md font-semibold leading-tight text-paper-50">
              与我们对话
            </h2>
            <p className="mt-5 text-base leading-relaxed text-paper-200/70">
              无论是产品咨询、教育合作还是媒体联系,我们都期待你的来信。
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { label: '产品咨询', value: SITE.email, href: `mailto:${SITE.email}` },
              { label: '院校合作', value: SITE.salesEmail, href: CTA_LINKS.contactSales },
              { label: '微信公众号', value: SITE.wechatOfficial, href: undefined },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-paper-200/10 bg-ink-800/60 p-6 text-center">
                <div className="text-xs tracking-wider text-gold-400">{c.label}</div>
                {c.href ? (
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-sm text-paper-100 transition-colors hover:text-gold-300"
                  >
                    {c.value}
                  </a>
                ) : (
                  <div className="mt-3 text-sm text-paper-100">{c.value}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CTASection
        title="和我们一起,重新定义艺术教育"
        description="无论你是教师、学生还是院校管理者,丹青有AI 都为你准备好了入口。"
      />
    </>
  );
}
