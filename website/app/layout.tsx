import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { InkLoader } from '@/components/ui/InkLoader';
import { InkCursor } from '@/components/ui/InkCursor';
import { JsonLd } from '@/components/seo/JsonLd';
import { SITE } from '@/lib/site';
import { organizationJsonLd } from '@/lib/seo';

// 搜索引擎站长验证(百度/必应):由 deploy-website.sh 在构建后往静态 <head> 直接插入 meta。
// 注意:不能依赖 Next.js 的 metadata 或 <head> JSX——App Router 会把 head 内容 hoist 进
// RSC flight 数据(__next_f),静态 HTML 的 <head> 里没有,必应等不执行 JS 的爬虫读不到。
// 因此验证 meta 由部署脚本 sed 插入到 out/index.html 的静态 <head>。

// 全局元数据:所有页面继承,单页可覆盖
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | ${SITE.slogan}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    '丹青有AI',
    'DanQing AI',
    'AI 艺术教育',
    '艺术作业诊断',
    '高校美术教学',
    'AI 构图分析',
    'AI 色彩分析',
    'AI 笔触分析',
    '绘画 AI 评图',
    '设计 AI 诊断',
    '雕塑 AI 分析',
    '艺术教育数字化',
    '教师减负',
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  publisher: SITE.name,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} | ${SITE.slogan}`,
    description: SITE.description,
    images: [
      {
        url: '/images/og-default.svg',
        width: 1200,
        height: 630,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE.name} | ${SITE.slogan}`,
    description: SITE.description,
    images: ['/images/og-default.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#faf8f3',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 组织结构化数据:全站注入 */}
        <JsonLd data={organizationJsonLd()} />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        {/* 无障碍:跳转到主内容 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-paper-50 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-900 focus:shadow-ink-lg"
        >
          跳转到主内容
        </a>
        <InkLoader />
        <InkCursor />
        <Navbar />
        {/* 主内容区:顶部留白避开固定导航 */}
        <main id="main-content" className="flex-1 pt-16 md:pt-18 scroll-mt-20">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
