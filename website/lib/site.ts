/**
 * 站点全局常量
 * 注意:官网为纯静态,不包含任何业务 API 端点
 * 所有 CTA 跳转至业务应用前端入口,由业务应用触发飞书 OAuth
 */

export const SITE = {
  name: '丹青有AI',
  nameEn: 'DanQing AI',
  shortName: '丹青',
  slogan: '丹青有AI,让艺术教育更智能',
  description:
    '丹青有AI 是面向高校艺术教育的 AI 作业诊断系统,3 秒智能分析构图、色彩、笔触,支持绘画、设计、产品设计、雕塑四种创意形式,以专业美院标准助力教师减负、学生成长。',
  url: 'https://www.domain',
  // 业务应用入口(由业务应用自身触发飞书 OAuth,官网不接触 OAuth 细节)
  appUrl: 'https://app.domain',
  // 联系方式
  email: 'contact@domain',
  salesEmail: 'sales@domain',
  // 社交(占位)
  wechatOfficial: '丹青有AI',
} as const;

export const NAV_LINKS = [
  { label: '产品功能', href: '/product' },
  { label: '价格方案', href: '/pricing' },
  { label: '客户案例', href: '/cases' },
  { label: '博客资源', href: '/blog' },
  { label: '关于我们', href: '/about' },
] as const;

export const FOOTER_LINKS = {
  product: {
    title: '产品',
    links: [
      { label: '产品功能', href: '/product' },
      { label: '价格方案', href: '/pricing' },
      { label: '客户案例', href: '/cases' },
    ],
  },
  resource: {
    title: '资源',
    links: [
      { label: '博客', href: '/blog' },
      { label: '关于我们', href: '/about' },
    ],
  },
  legal: {
    title: '法律',
    links: [
      { label: '隐私政策', href: '/privacy' },
      { label: '服务条款', href: '/terms' },
    ],
  },
} as const;

/**
 * 业务应用入口链接(触发飞书 OAuth 登录由业务应用处理)
 * 官网仅做跳转,不暴露任何业务 API 端点
 */
export const CTA_LINKS = {
  // 立即体验 / 免费试用 - 跳转业务应用首页(业务应用内部处理登录态)
  trial: 'https://app.domain/',
  // 联系销售(mailto)
  contactSales: 'mailto:sales@domain?subject=%E9%99%A2%E6%A0%A1%E7%89%88%E5%92%A8%E8%AF%A2',
} as const;
