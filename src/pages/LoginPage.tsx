// ============================================================
// 丹青有AI - 登录页
// 设计语言:成熟品牌官网感,水墨晕染背景,朱砂红 CTA
// ============================================================

import { Link } from 'react-router-dom';
import { Shield, Zap, BookOpen } from 'lucide-react';
import LogoMark from '../components/LogoMark';
import FeishuLoginButton from '../components/auth/FeishuLoginButton';

/** 价值主张小图标列表 */
const valueProps: { icon: typeof Shield; title: string; desc: string }[] = [
  { icon: Zap, title: '3 秒诊断', desc: 'AI 即时分析构图、色彩、技法' },
  { icon: BookOpen, title: '专业维度', desc: '美院规范术语,非空泛反馈' },
  { icon: Shield, title: '多形态支持', desc: '绘画、设计、产品、雕塑四类' },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rice-200 ink-texture px-4 py-8 relative overflow-hidden">
      {/* 装饰:水墨晕染圆(左上 + 右下) */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cinnabar/5 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-stone/5 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* 主体卡片 */}
      <div className="relative w-full max-w-md">
        <div className="bg-rice-50/95 backdrop-blur-md border border-ink-900/8 rounded-xl shadow-modal p-8 sm:p-10">
          {/* 顶部:Logo + 标题 */}
          <div className="flex flex-col items-center gap-4 mb-8">
            {/* 放大版 LogoMark(用 div 包裹,放大 1.5 倍) */}
            <div className="scale-150 mb-2">
              <LogoMark />
            </div>
            <div className="text-center mt-4">
              <h1 className="font-serif text-3xl font-bold text-ink-900 tracking-wide">
                丹青有AI
              </h1>
              <p className="text-sm text-ink-500 mt-1.5 tracking-wider">
                高校艺术教育 AI 作业诊断系统
              </p>
            </div>
          </div>

          {/* 价值主张 */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {valueProps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-md bg-rice-100 border border-ink-900/4 text-center"
                >
                  <Icon className="w-5 h-5 text-cinnabar" />
                  <p className="text-2xs font-medium text-ink-800">{item.title}</p>
                  <p className="text-2xs text-ink-400 leading-tight">{item.desc}</p>
                </div>
              );
            })}
          </div>

          {/* 登录按钮 */}
          <div className="flex flex-col gap-3">
            <FeishuLoginButton size="lg" block />
            <p className="text-center text-2xs text-ink-400 mt-1">
              登录即代表同意服务协议与隐私政策
            </p>
          </div>

          {/* 底部:返回首页(已登录用户可直接进入) */}
          <div className="mt-6 pt-6 border-t border-ink-900/8 text-center">
            <Link
              to="/"
              className="text-xs text-ink-500 hover:text-cinnabar transition-colors"
              title="返回首页"
            >
              返回首页
            </Link>
          </div>
        </div>

        {/* 版权信息 */}
        <p className="text-center text-2xs text-ink-400 mt-6">
          © 2026 丹青有AI · 通化师范学院美术学院
        </p>
      </div>
    </div>
  );
}
