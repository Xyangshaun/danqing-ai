import { useState } from 'react';
import { Palette, History, TrendingUp, Home, BookOpen, Wand2, Heart } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/analyze', label: 'AI诊断', icon: Palette },
    { path: '/materials', label: '素材库', icon: BookOpen },
    { path: '/styles', label: '风格库', icon: Wand2 },
    { path: '/fuse', label: '灵感嫁接', icon: Heart },
    { path: '/emotion', label: '情绪画布', icon: Heart },
    { path: '/history', label: '历史记录', icon: History },
    { path: '/growth', label: '成长曲线', icon: TrendingUp },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-rice-200/95 backdrop-blur-sm border-b border-ink-900/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cinnabar to-stone flex items-center justify-center">
              <Palette className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold text-ink-900 group-hover:text-cinnabar transition-colors">
                丹青有AI
              </h1>
              <p className="text-xs text-ink-500">AI创作诊断系统</p>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-ink-900 text-rice-100'
                      : 'text-ink-700 hover:bg-ink-900/5 hover:text-ink-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-ink-900/5"
            >
              <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-ink-900/10">
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-ink-900 text-rice-100'
                        : 'text-ink-700 hover:bg-ink-900/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
