import { useState, useEffect, useRef } from 'react';
import {
  Search, Bell, Settings, HelpCircle, Cloud, CloudOff,
  ChevronRight, ChevronDown, Home, Command, X, ArrowRight,
  User, Image as ImageIcon, LogOut, Check, Sparkles,
  CheckCircle2, TrendingUp, RefreshCw, Trash2, Clock,
  Brush, PenTool, Box, Layers, Building2, type LucideIcon,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LogoMark from './LogoMark';
import { useToast } from './ToastProvider';
import { useAuth } from '../hooks/useAuth';
import { getAnalysisHistory, clearAnalysisHistory } from '../services/data-service';
import type { HistoryRecord, ArtType } from '../types';

/* 路由 → 页面标题映射 */
const routeMeta: Record<string, { title: string; subtitle: string; category: string }> = {
  '/': { title: '工作台', subtitle: '我的创作仪表盘', category: '首页' },
  '/analyze': { title: 'AI 诊断', subtitle: '智能分析作品构图、色彩、技法', category: '核心工具' },
  '/materials': { title: '素材库', subtitle: '中外艺术作品参考', category: '核心工具' },
  '/styles': { title: '风格库', subtitle: '中式美学风格转换', category: '核心工具' },
  '/fuse': { title: '灵感嫁接', subtitle: '元素融合生成新作品', category: '核心工具' },
  '/emotion': { title: '情绪画布', subtitle: '情绪转色调参考', category: '核心工具' },
  '/history': { title: '历史记录', subtitle: '查看所有诊断记录', category: '数据追踪' },
  '/growth': { title: '成长曲线', subtitle: '能力变化趋势分析', category: '数据追踪' },
  '/settings': { title: '设置', subtitle: '系统偏好与配置', category: '系统' },
};

/* 分类 → 首条路由（用于面包屑回退） */
const categoryRoute: Record<string, string> = {
  '首页': '/',
  '核心工具': '/analyze',
  '数据追踪': '/history',
  '系统': '/settings',
};

/* 命令面板搜索项 */
const searchItems: { path: string; title: string; desc: string; icon: LucideIcon; keywords: string }[] = [
  { path: '/analyze', title: '新建 AI 诊断', desc: '上传作品进行智能分析', icon: Search, keywords: '诊断 分析 上传 AI' },
  { path: '/materials', title: '浏览素材库', desc: '中外艺术作品参考', icon: Search, keywords: '素材 作品 参考 灵感' },
  { path: '/styles', title: '风格库', desc: '中式美学风格转换', icon: Search, keywords: '风格 水墨 青绿 非遗' },
  { path: '/fuse', title: '灵感嫁接', desc: '融合两张草图生成新作品', icon: Search, keywords: '嫁接 融合 灵感 元素' },
  { path: '/emotion', title: '情绪画布', desc: '情绪关键词转色调', icon: Search, keywords: '情绪 画布 色调 心情' },
  { path: '/history', title: '历史记录', desc: '查看所有诊断记录', icon: Search, keywords: '历史 记录 之前' },
  { path: '/growth', title: '成长曲线', desc: '能力变化趋势', icon: Search, keywords: '成长 曲线 趋势 数据' },
  { path: '/settings', title: '设置', desc: '系统偏好与配置', icon: Search, keywords: '设置 偏好 配置' },
];

/* 模拟通知数据 */
type NotificationItem = {
  id: number;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  desc: string;
  time: string;
};

const mockNotifications: NotificationItem[] = [
  {
    id: 1,
    icon: CheckCircle2,
    iconClass: 'text-jade bg-jade/10',
    title: '作品分析完成',
    desc: '《山水图》智能分析报告已生成，可查看',
    time: '2 分钟前',
  },
  {
    id: 2,
    icon: TrendingUp,
    iconClass: 'text-stone bg-stone/10',
    title: '成长报告已生成',
    desc: '本月能力提升 12%，新增 8 件作品记录',
    time: '1 小时前',
  },
  {
    id: 3,
    icon: RefreshCw,
    iconClass: 'text-cinnabar bg-cinnabar/10',
    title: '系统更新提示',
    desc: '新版本 v1.2.0 已就绪，建议立即更新',
    time: '昨天',
  },
];

/* 运行模式选项 */
type OnlineMode = 'local' | 'cloud' | 'auto';

const onlineModes: { id: OnlineMode; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'local', label: '本地模式', icon: CloudOff, desc: '离线运行，数据不上传' },
  { id: 'cloud', label: '云端模式', icon: Cloud, desc: '连接云端，全功能可用' },
  { id: 'auto', label: '自动选择', icon: Sparkles, desc: '根据网络智能切换' },
];

/* 用户菜单项 */
const userMenuItems: { id: string; label: string; icon: LucideIcon; path: string }[] = [
  { id: 'profile', label: '个人中心', icon: User, path: '/settings' },
  { id: 'works', label: '我的作品', icon: ImageIcon, path: '/history' },
  { id: 'settings', label: '设置', icon: Settings, path: '/settings' },
];

/* ====== 命令面板：分类搜索增强 ====== */
type CommandCategory = 'function' | 'recent' | 'work' | 'action';
type CategoryFilter = 'all' | CommandCategory;

interface CommandItem {
  id: string;
  category: CommandCategory;
  title: string;
  desc: string;
  icon: LucideIcon;
  iconClass: string;
  action: () => void;
}

const commandCategories: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'function', label: '功能' },
  { id: 'recent', label: '最近' },
  { id: 'work', label: '作品' },
  { id: 'action', label: '操作' },
];

const categorySectionTitles: Record<CommandCategory, string> = {
  function: '功能',
  recent: '最近访问',
  work: '历史作品',
  action: '操作',
};

const artTypeMeta: Record<ArtType, { label: string; icon: LucideIcon }> = {
  painting: { label: '绘画', icon: Brush },
  design: { label: '设计', icon: PenTool },
  product: { label: '产品设计', icon: Box },
  sculpture: { label: '雕塑', icon: Layers },
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenant, memberships, isAuthenticated, logout, switchTenant } = useAuth();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [online, setOnline] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [recentVisits, setRecentVisits] = useState<string[]>([]);
  const [historyWorks, setHistoryWorks] = useState<HistoryRecord[]>([]);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  /* 新增：各下拉面板的展开状态 */
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [onlineMode, setOnlineMode] = useState<OnlineMode>('auto');
  const [unreadCount, setUnreadCount] = useState(3);

  /* 各面板外层容器 ref，用于点击外部关闭 */
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);

  const meta = routeMeta[location.pathname] || routeMeta['/'];

  /* 全局快捷键：⌘K / Ctrl+K 打开命令面板；Esc 关闭；监听 / 键触发的 open-command-palette 事件 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === 'Escape' && cmdOpen) setCmdOpen(false);
    };
    const openPalette = () => setCmdOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-command-palette', openPalette as EventListener);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-command-palette', openPalette as EventListener);
    };
  }, [cmdOpen]);

  /* 命令面板打开时聚焦输入框、重置状态、异步读取历史作品 */
  useEffect(() => {
    if (!cmdOpen) return;
    setTimeout(() => cmdInputRef.current?.focus(), 50);
    setQuery('');
    setSelectedIndex(0);
    setActiveCategory('all');
    let cancelled = false;
    (async () => {
      try {
        const records = await getAnalysisHistory();
        if (!cancelled) setHistoryWorks(records);
      } catch (err) {
        console.error('命令面板加载历史失败:', err);
        if (!cancelled) setHistoryWorks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [cmdOpen]);

  /* 记录最近访问页面（最多5个，去重） */
  useEffect(() => {
    const path = location.pathname;
    setRecentVisits((prev) => [path, ...prev.filter((p) => p !== path)].slice(0, 5));
  }, [location.pathname]);

  /* 选中索引在搜索词/分类变化时重置为 0 */
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  /* 在线状态检测 */
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  /* 点击外部关闭各下拉面板 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
      if (modeRef.current && !modeRef.current.contains(target)) setModeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* 构建各分类命令项 */
  const functionItems: CommandItem[] = searchItems.map((it) => ({
    id: `fn-${it.path}`,
    category: 'function',
    title: it.title,
    desc: it.desc,
    icon: it.icon,
    iconClass: 'bg-cinnabar/10 text-cinnabar',
    action: () => { navigate(it.path); setCmdOpen(false); },
  }));

  const recentItems: CommandItem[] = recentVisits.flatMap((path) => {
    const found = searchItems.find((it) => it.path === path);
    if (!found) return [];
    return [{
      id: `rc-${found.path}`,
      category: 'recent' as const,
      title: found.title,
      desc: found.desc,
      icon: Clock,
      iconClass: 'bg-stone/10 text-stone',
      action: () => { navigate(found.path); setCmdOpen(false); },
    }];
  });

  const workItems: CommandItem[] = historyWorks.map((rec) => {
    const meta = artTypeMeta[rec.artType] || artTypeMeta.painting;
    const dateStr = new Date(rec.createdAt).toLocaleDateString('zh-CN');
    return {
      id: `wk-${rec.id}`,
      category: 'work' as const,
      title: `${meta.label}作品 · ${rec.overallScore}分`,
      desc: dateStr,
      icon: meta.icon,
      iconClass: 'bg-gold/10 text-gold-dark',
      action: () => { navigate('/history'); setCmdOpen(false); },
    };
  });

  const actionItems: CommandItem[] = [
    {
      id: 'ac-clear',
      category: 'action',
      title: '清除缓存',
      desc: '清除本地历史记录',
      icon: Trash2,
      iconClass: 'bg-cinnabar/10 text-cinnabar',
      action: () => {
        /* 异步清空历史：通过 data-service 清空本地缓存(API 模式下也清本地兜底) */
        (async () => {
          try {
            await clearAnalysisHistory();
            setHistoryWorks([]);
            toast.success('缓存已清除', '历史记录已清空');
          } catch {
            toast.error('清除失败', '请稍后重试');
          }
          setCmdOpen(false);
        })();
      },
    },
    {
      id: 'ac-local',
      category: 'action',
      title: '切换到本地模式',
      desc: '离线运行，数据不上传',
      icon: CloudOff,
      iconClass: 'bg-rice-200 text-ink-500',
      action: () => {
        localStorage.setItem('danqing-ai-use-api', JSON.stringify(false));
        toast.success('已切换到本地模式');
        setCmdOpen(false);
      },
    },
    {
      id: 'ac-cloud',
      category: 'action',
      title: '切换到云端模式',
      desc: '连接云端，全功能可用',
      icon: Cloud,
      iconClass: 'bg-jade/10 text-jade',
      action: () => {
        localStorage.setItem('danqing-ai-use-api', JSON.stringify(true));
        toast.success('已切换到云端模式');
        setCmdOpen(false);
      },
    },
    {
      id: 'ac-settings',
      category: 'action',
      title: '跳转到设置',
      desc: '系统偏好与配置',
      icon: Settings,
      iconClass: 'bg-rice-200 text-ink-500',
      action: () => { navigate('/settings'); setCmdOpen(false); },
    },
  ];

  /* 按分类与关键词过滤，构建分段结果（每类最多 3 条） */
  const q = query.trim().toLowerCase();
  const allSections: { category: CommandCategory; items: CommandItem[] }[] = [
    { category: 'function', items: functionItems },
    { category: 'recent', items: recentItems },
    { category: 'work', items: workItems },
    { category: 'action', items: actionItems },
  ];
  const filteredSections = allSections
    .filter((sec) => activeCategory === 'all' || sec.category === activeCategory)
    .map((sec) => ({
      category: sec.category,
      items: sec.items
        .filter((it) => !q || it.title.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q))
        .slice(0, 3),
    }))
    .filter((sec) => sec.items.length > 0);
  const flatItems = filteredSections.flatMap((sec) => sec.items);

  const handleCmdKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
      flatItems[selectedIndex].action();
    }
  };

  /* 切换下拉面板：同时只允许一个打开 */
  const toggleNotif = () => {
    setNotifOpen((o) => !o);
    setUserOpen(false);
    setModeOpen(false);
  };
  const toggleUser = () => {
    setUserOpen((o) => !o);
    setNotifOpen(false);
    setModeOpen(false);
  };
  const toggleMode = () => {
    setModeOpen((o) => !o);
    setNotifOpen(false);
    setUserOpen(false);
  };

  /* 标记全部已读 */
  const markAllRead = () => setUnreadCount(0);

  /* 选择运行模式 */
  const selectMode = (m: OnlineMode) => {
    setOnlineMode(m);
    setModeOpen(false);
  };

  /* 触发器显示：根据当前模式 + 网络状态推导 */
  const modeDisplay =
    onlineMode === 'auto'
      ? online
        ? { icon: Cloud, label: '自动·云', color: 'text-jade' }
        : { icon: CloudOff, label: '自动·本地', color: 'text-cinnabar' }
      : onlineMode === 'cloud'
      ? { icon: Cloud, label: '云端', color: 'text-jade' }
      : { icon: CloudOff, label: '本地', color: 'text-cinnabar' };
  const ModeIcon = modeDisplay.icon;

  /* 退出登录:调用后端登出 + 清状态 + 跳登录页(useAuth.logout 已处理 Toast 与导航) */
  const handleLogout = async () => {
    setUserOpen(false);
    await logout();
  };

  return (
    <>
      <header className="h-14 flex-shrink-0 bg-rice-50/95 backdrop-blur-md border-b border-ink-900/8 flex items-center px-4 gap-4 z-40">
        {/* 左：Logo + 面包屑 */}
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex-shrink-0">
            <LogoMark />
          </Link>

          {/* 面包屑（增强：可点击 + hover 反馈） */}
          <nav className="hidden md:flex items-center gap-0.5 text-xs text-ink-400 ml-2 pl-3 border-l border-ink-900/10">
            <Link
              to="/"
              title="返回工作台"
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-ink-500 hover:text-cinnabar hover:bg-cinnabar/5 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
            </Link>
            <ChevronRight className="w-3 h-3 text-ink-300 mx-0.5" />
            <Link
              to={categoryRoute[meta.category] || '/'}
              title={`返回${meta.category}`}
              className="px-1.5 py-1 rounded-md text-ink-500 hover:text-cinnabar hover:bg-cinnabar/5 transition-colors"
            >
              {meta.category}
            </Link>
            <ChevronRight className="w-3 h-3 text-ink-300 mx-0.5" />
            <span className="px-1.5 py-1 text-ink-800 font-medium">{meta.title}</span>
          </nav>
        </div>

        {/* 中：全局搜索框（点击展开命令面板，hover 边框朱砂色） */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex-1 max-w-md mx-auto flex items-center gap-2 h-9 px-3 bg-rice-200 hover:bg-rice-300 border border-ink-900/8 hover:border-cinnabar/40 rounded-md text-sm text-ink-400 transition-colors group"
        >
          <Search className="w-4 h-4 group-hover:text-cinnabar transition-colors" />
          <span className="flex-1 text-left">搜索功能、作品、风格…</span>
          <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 bg-rice-50 border border-ink-900/10 rounded text-2xs font-mono text-ink-500">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>

        {/* 右：工具栏 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* 在线状态下拉（增强：可切换模式） */}
          <div ref={modeRef} className="relative hidden sm:block">
            <button
              onClick={toggleMode}
              className="flex items-center gap-1.5 px-2 h-8 rounded-md text-2xs hover:bg-ink-900/5 transition-colors"
              title="切换运行模式"
            >
              <ModeIcon className={`w-3.5 h-3.5 ${modeDisplay.color}`} />
              <span className={modeDisplay.color}>{modeDisplay.label}</span>
              <ChevronDown
                className={`w-3 h-3 text-ink-400 transition-transform ${modeOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {modeOpen && (
              <div className="absolute top-full right-0 mt-1 w-60 bg-rice-50 rounded-md shadow-overlay border border-ink-900/8 z-50 animate-slide-down overflow-hidden">
                <p className="px-3 pt-2.5 pb-1 text-2xs font-semibold text-ink-400 uppercase tracking-wider">
                  运行模式
                </p>
                <div className="p-1">
                  {onlineModes.map((m) => {
                    const Icon = m.icon;
                    const active = onlineMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => selectMode(m.id)}
                        className={`w-full flex items-center gap-2.5 h-10 px-2 rounded-md text-left transition-colors ${
                          active ? 'bg-cinnabar/5' : 'hover:bg-ink-900/5'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 ${
                            active ? 'bg-cinnabar/10 text-cinnabar' : 'bg-rice-200 text-ink-500'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${active ? 'text-cinnabar' : 'text-ink-800'}`}>
                            {m.label}
                          </p>
                          <p className="text-2xs text-ink-400 truncate">{m.desc}</p>
                        </div>
                        {active && <Check className="w-4 h-4 text-cinnabar flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-ink-900/10 mx-1 hidden sm:block" />

          {/* 通知（增强：可展开通知面板） */}
          <div ref={notifRef} className="relative">
            <button
              onClick={toggleNotif}
              className={`relative w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                notifOpen ? 'bg-ink-900/5 text-ink-900' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-900/5'
              }`}
              title="通知"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-cinnabar text-white text-2xs font-bold rounded-full ring-2 ring-rice-50">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-rice-50 rounded-md shadow-overlay border border-ink-900/8 z-50 animate-slide-down overflow-hidden">
                {/* 面板头部 */}
                <div className="flex items-center justify-between px-3 h-10 border-b border-ink-900/8">
                  <p className="text-sm font-medium text-ink-900">
                    通知<span className="ml-1 text-2xs text-ink-400 font-normal">({mockNotifications.length})</span>
                  </p>
                  <button
                    onClick={markAllRead}
                    className="text-2xs text-ink-400 hover:text-cinnabar transition-colors"
                  >
                    全部已读
                  </button>
                </div>

                {/* 通知列表 */}
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {mockNotifications.map((n) => {
                    const Icon = n.icon;
                    return (
                      <button
                        key={n.id}
                        onClick={() => setUnreadCount(0)}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-ink-900/3 transition-colors border-b border-ink-900/4 last:border-b-0"
                      >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-md flex-shrink-0 ${n.iconClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-ink-900 truncate">{n.title}</p>
                            <span className="text-2xs text-ink-400 flex-shrink-0">{n.time}</span>
                          </div>
                          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{n.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 面板底部：查看全部 */}
                <Link
                  to="/history"
                  onClick={() => setNotifOpen(false)}
                  className="flex items-center justify-center gap-1 h-10 border-t border-ink-900/8 text-xs font-medium text-ink-600 hover:text-cinnabar hover:bg-cinnabar/5 transition-colors"
                >
                  查看全部
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* 帮助 */}
          <button
            className="w-8 h-8 flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 rounded-md transition-colors"
            title="帮助"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* 设置 */}
          <Link
            to="/settings"
            className="w-8 h-8 flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 rounded-md transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </Link>

          <div className="w-px h-5 bg-ink-900/10 mx-1" />

          {/* 用户区域:未登录显示登录按钮,已登录显示头像+下拉菜单(含切换租户/登出) */}
          {!isAuthenticated ? (
            <Link
              to="/login"
              className="h-8 px-3 flex items-center gap-1.5 rounded-md text-xs font-medium text-rice-50 bg-cinnabar hover:bg-cinnabar-dark transition-colors"
              title="登录丹青有AI"
            >
              <User className="w-3.5 h-3.5" />
              <span>登录</span>
            </Link>
          ) : (
            <div ref={userRef} className="relative">
              <button
                onClick={toggleUser}
                className={`flex items-center gap-2 h-8 pl-1 pr-2 rounded-md transition-colors ${
                  userOpen ? 'bg-ink-900/5' : 'hover:bg-ink-900/5'
                }`}
                title="用户中心"
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-6 h-6 rounded-full object-cover border border-ink-900/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-stone to-stone-dark flex items-center justify-center text-2xs font-bold text-white">
                    {user?.name?.charAt(0) ?? 'U'}
                  </div>
                )}
                <span className="hidden md:block text-xs font-medium text-ink-700">
                  {user?.name ?? '用户'}
                </span>
                <ChevronDown
                  className={`hidden md:block w-3 h-3 text-ink-400 transition-transform ${userOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {userOpen && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-rice-50 rounded-md shadow-overlay border border-ink-900/8 z-50 animate-slide-down overflow-hidden">
                  {/* 用户信息头部 */}
                  <div className="px-3 py-2.5 border-b border-ink-900/8 bg-rice-100">
                    <div className="flex items-center gap-2.5">
                      {user?.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover border border-ink-900/10"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stone to-stone-dark flex items-center justify-center text-xs font-bold text-white">
                          {user?.name?.charAt(0) ?? 'U'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-900 truncate">
                          {user?.name ?? '用户'}
                        </p>
                        <p className="text-2xs text-ink-400 truncate">
                          {user?.email ?? user?.phone ?? '—'}
                        </p>
                        {tenant && (
                          <p className="text-2xs text-cinnabar truncate mt-0.5">
                            {tenant.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 菜单项(个人中心 / 我的作品 / 设置) */}
                  <div className="p-1">
                    {userMenuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.id}
                          to={item.path}
                          onClick={() => setUserOpen(false)}
                          className="w-full flex items-center gap-2.5 h-10 px-2 rounded-md text-sm text-ink-700 hover:bg-ink-900/5 hover:text-ink-900 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-ink-500" />
                          <span className="font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* 切换租户(仅当用户属于多个租户时显示) */}
                  {memberships.length > 1 && (
                    <>
                      <div className="border-t border-ink-900/8" />
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">
                          切换租户
                        </p>
                      </div>
                      <div className="p-1 max-h-40 overflow-y-auto scrollbar-thin">
                        {memberships.map((m) => {
                          const active = m.tenantId === tenant?.id;
                          return (
                            <button
                              key={m.tenantId}
                              onClick={() => {
                                void switchTenant(m.tenantId);
                                setUserOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 h-10 px-2 rounded-md text-sm transition-colors ${
                                active
                                  ? 'bg-cinnabar/5 text-cinnabar font-medium'
                                  : 'text-ink-700 hover:bg-ink-900/5'
                              }`}
                            >
                              <Building2 className="w-4 h-4 text-ink-500 flex-shrink-0" />
                              <span className="truncate flex-1 text-left">{m.tenantName}</span>
                              {active && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* 分隔线 */}
                  <div className="border-t border-ink-900/8" />

                  {/* 退出登录 */}
                  <div className="p-1">
                    <button
                      onClick={() => void handleLogout()}
                      className="w-full flex items-center gap-2.5 h-10 px-2 rounded-md text-sm text-cinnabar hover:bg-cinnabar/5 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="font-medium">退出登录</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 命令面板 */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 cmd-overlay flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-rice-50 rounded-xl shadow-modal overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索框（focus 时显示提示文字） */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-ink-900/8">
              <Search className="w-4 h-4 text-ink-400 flex-shrink-0" />
              <input
                ref={cmdInputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleCmdKey}
                placeholder="输入关键词搜索功能..."
                className="flex-1 bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-300"
              />
              <kbd className="px-1.5 py-0.5 bg-rice-200 border border-ink-900/10 rounded text-2xs font-mono text-ink-400">
                ESC
              </kbd>
              <button
                onClick={() => setCmdOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-900/5 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 分类标签栏 */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-900/8 overflow-x-auto scrollbar-thin">
              {commandCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`h-7 px-2.5 text-xs rounded-md whitespace-nowrap transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-cinnabar text-white'
                      : 'bg-rice-200 text-ink-600 hover:bg-rice-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* 搜索结果（按分类分段） */}
            <div className="max-h-80 overflow-y-auto py-2 scrollbar-thin">
              {flatItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-400">
                  没有找到匹配的结果
                </div>
              ) : (
                flatItems.map((item, i) => {
                  const Icon = item.icon;
                  const selected = i === selectedIndex;
                  const showHeader = i === 0 || flatItems[i - 1].category !== item.category;
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <p className="text-2xs font-semibold text-ink-400 uppercase tracking-wider px-4 py-2">
                          {categorySectionTitles[item.category]}
                        </p>
                      )}
                      <button
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          selected ? 'bg-cinnabar/5' : 'hover:bg-ink-900/3'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 flex items-center justify-center rounded-md ${
                            selected ? 'bg-cinnabar/10 text-cinnabar' : item.iconClass
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900">{item.title}</p>
                          <p className="text-xs text-ink-400 truncate">{item.desc}</p>
                        </div>
                        {selected && (
                          <ArrowRight className="w-4 h-4 text-cinnabar flex-shrink-0" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部提示 */}
            <div className="px-4 py-2 border-t border-ink-900/8 bg-rice-100 flex items-center justify-between text-2xs text-ink-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-rice-200 rounded font-mono">↑↓</kbd>
                  选择
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-rice-200 rounded font-mono">↵</kbd>
                  确认
                </span>
              </div>
              <span className="font-mono">DQ AI · 命令面板</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
