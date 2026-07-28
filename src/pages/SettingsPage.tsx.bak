import { useState } from 'react';
import {
  Settings, User, Bell, Palette, Database, Cloud, Shield, Keyboard,
  Check, type LucideIcon,
} from 'lucide-react';

type Section = {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
};

const sections: Section[] = [
  { id: 'account', label: '账户', icon: User, desc: '个人信息与身份' },
  { id: 'appearance', label: '外观', icon: Palette, desc: '主题、字号、界面密度' },
  { id: 'notifications', label: '通知', icon: Bell, desc: '提醒方式与频率' },
  { id: 'storage', label: '存储', icon: Database, desc: '本地缓存与历史记录' },
  { id: 'cloud', label: '云端同步', icon: Cloud, desc: '云端分析与数据同步' },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard, desc: '查看与自定义快捷键' },
  { id: 'privacy', label: '隐私', icon: Shield, desc: '数据权限与安全' },
];

export default function SettingsPage() {
  const [active, setActive] = useState('account');
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [theme, setTheme] = useState<'rice' | 'ink' | 'auto'>('rice');
  const [notifications, setNotifications] = useState({
    analysis: true,
    growth: true,
    system: false,
  });

  return (
    <div className="h-full flex">
      {/* 左：设置项导航 */}
      <aside className="w-60 flex-shrink-0 border-r border-ink-900/8 bg-rice-100/50 overflow-y-auto scrollbar-thin">
        <div className="p-4 border-b border-ink-900/8">
          <h2 className="font-serif text-lg font-bold text-ink-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-cinnabar" />
            设置
          </h2>
          <p className="text-2xs text-ink-400 mt-1">系统偏好与配置</p>
        </div>
        <nav className="p-2">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors text-left ${
                  isActive
                    ? 'bg-ink-900 text-rice-100 shadow-subtle'
                    : 'text-ink-600 hover:bg-ink-900/5 hover:text-ink-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cinnabar-light' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-none">{s.label}</p>
                  <p className={`text-2xs mt-0.5 truncate ${isActive ? 'text-rice-300' : 'text-ink-400'}`}>
                    {s.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 右：设置详情 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 md:p-8">
        <div className="max-w-2xl mx-auto">
          {active === 'account' && (
            <SectionBlock title="账户" desc="管理你的个人信息与身份">
              <Field label="用户名">
                <input
                  defaultValue="教师"
                  className="w-full h-9 px-3 bg-rice-50 border border-ink-900/10 rounded-md text-sm focus:border-cinnabar focus-ring transition-all"
                />
              </Field>
              <Field label="邮箱">
                <input
                  defaultValue="2692963779@qq.com"
                  className="w-full h-9 px-3 bg-rice-50 border border-ink-900/10 rounded-md text-sm focus:border-cinnabar focus-ring transition-all"
                />
              </Field>
              <Field label="身份角色">
                <div className="flex gap-2">
                  {['教师', '学生', '创作者'].map((r) => (
                    <button
                      key={r}
                      className={`px-3 h-9 rounded-md text-sm transition-colors ${
                        r === '教师'
                          ? 'bg-ink-900 text-rice-100'
                          : 'bg-rice-100 text-ink-600 hover:bg-rice-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
            </SectionBlock>
          )}

          {active === 'appearance' && (
            <SectionBlock title="外观" desc="调整界面视觉效果">
              <Field label="主题">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'rice', label: '米白', desc: '默认' },
                    { id: 'ink', label: '墨黑', desc: '暗色' },
                    { id: 'auto', label: '跟随系统', desc: '自动' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as typeof theme)}
                      className={`p-3 rounded-md border text-left transition-all ${
                        theme === t.id
                          ? 'border-cinnabar bg-cinnabar/5'
                          : 'border-ink-900/10 hover:border-ink-900/20'
                      }`}
                    >
                      <p className="text-sm font-medium text-ink-900">{t.label}</p>
                      <p className="text-2xs text-ink-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="界面密度">
                <div className="grid grid-cols-3 gap-2">
                  {(['compact', 'comfortable', 'spacious'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDensity(d)}
                      className={`p-3 rounded-md border text-left transition-all ${
                        density === d
                          ? 'border-cinnabar bg-cinnabar/5'
                          : 'border-ink-900/10 hover:border-ink-900/20'
                      }`}
                    >
                      <p className="text-sm font-medium text-ink-900">
                        {d === 'compact' ? '紧凑' : d === 'comfortable' ? '舒适' : '宽松'}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>
            </SectionBlock>
          )}

          {active === 'notifications' && (
            <SectionBlock title="通知" desc="控制何时接收提醒">
              <Toggle
                label="诊断完成"
                desc="AI 分析完成后通知"
                value={notifications.analysis}
                onChange={(v) => setNotifications((n) => ({ ...n, analysis: v }))}
              />
              <Toggle
                label="成长周报"
                desc="每周汇总能力变化"
                value={notifications.growth}
                onChange={(v) => setNotifications((n) => ({ ...n, growth: v }))}
              />
              <Toggle
                label="系统更新"
                desc="新版本发布时提醒"
                value={notifications.system}
                onChange={(v) => setNotifications((n) => ({ ...n, system: v }))}
              />
            </SectionBlock>
          )}

          {active === 'storage' && (
            <SectionBlock title="存储" desc="本地缓存与历史记录">
              <Field label="本地缓存">
                <div className="flex items-center justify-between p-3 bg-rice-100 rounded-md">
                  <div>
                    <p className="text-sm font-medium text-ink-900">已使用 24.5 MB</p>
                    <p className="text-2xs text-ink-400 mt-0.5">历史记录、缩略图、设置</p>
                  </div>
                  <button className="px-3 h-8 text-xs bg-rice-50 border border-ink-900/10 hover:bg-rice-200 text-ink-700 rounded-md transition-colors">
                    清理缓存
                  </button>
                </div>
              </Field>
              <Field label="历史记录">
                <div className="flex items-center justify-between p-3 bg-rice-100 rounded-md">
                  <div>
                    <p className="text-sm font-medium text-ink-900">共 42 条记录</p>
                    <p className="text-2xs text-ink-400 mt-0.5">最早：2026-03-15</p>
                  </div>
                  <button className="px-3 h-8 text-xs bg-rice-50 border border-cinnabar/30 text-cinnabar hover:bg-cinnabar/5 rounded-md transition-colors">
                    清空历史
                  </button>
                </div>
              </Field>
            </SectionBlock>
          )}

          {active === 'cloud' && (
            <SectionBlock title="云端同步" desc="启用云端 AI 增强分析">
              <Toggle label="云端分析" desc="启用更强大的云端 AI 模型" value={true} onChange={() => {}} />
              <Toggle label="自动同步" desc="诊断结果自动上传云端" value={true} onChange={() => {}} />
              <Toggle label="多端同步" desc="在多个设备间同步数据" value={false} onChange={() => {}} />
            </SectionBlock>
          )}

          {active === 'shortcuts' && (
            <SectionBlock title="快捷键" desc="提升操作效率，快速触达所有功能">
              <ShortcutGroup
                title="导航类"
                items={[
                  { desc: '跳转 AI 诊断', keys: ['1'] },
                  { desc: '跳转素材库', keys: ['2'] },
                  { desc: '跳转风格库', keys: ['3'] },
                  { desc: '跳转灵感嫁接', keys: ['4'] },
                  { desc: '跳转情绪画布', keys: ['5'] },
                  { desc: '跳转历史记录', keys: ['6'] },
                  { desc: '跳转成长曲线', keys: ['7'] },
                  { desc: '跳转设置', keys: ['0'] },
                  { desc: '新建诊断', keys: ['N'] },
                  { desc: '折叠 / 展开侧栏', keys: ['B'] },
                ]}
              />
              <ShortcutGroup
                title="搜索类"
                items={[
                  { desc: '打开命令面板', keys: ['⌘', 'K'] },
                  { desc: '打开命令面板（备选）', keys: ['Ctrl', 'K'] },
                  { desc: '聚焦搜索框（打开命令面板）', keys: ['/'] },
                  { desc: '关闭命令面板', keys: ['Esc'] },
                ]}
              />
              <ShortcutGroup
                title="命令面板内"
                items={[
                  { desc: '上下选择', keys: ['↑', '↓'] },
                  { desc: '确认执行', keys: ['Enter'] },
                ]}
              />
            </SectionBlock>
          )}

          {active === 'privacy' && (
            <SectionBlock title="隐私" desc="数据权限与安全">
              <Toggle label="匿名分析" desc="使用匿名数据改进 AI" value={true} onChange={() => {}} />
              <Toggle label="本地优先" desc="敏感作品仅在本地分析" value={true} onChange={() => {}} />
              <Toggle label="双因子认证" desc="登录时需要二次验证" value={false} onChange={() => {}} />
            </SectionBlock>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h3 className="font-serif text-2xl font-bold text-ink-900">{title}</h3>
        <p className="text-sm text-ink-500 mt-1">{desc}</p>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700 mb-2">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-rice-100 rounded-md">
      <div>
        <p className="text-sm font-medium text-ink-900">{label}</p>
        <p className="text-2xs text-ink-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          value ? 'bg-cinnabar' : 'bg-ink-900/15'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-subtle transition-all ${
            value ? 'left-[18px]' : 'left-0.5'
          }`}
        >
          {value && <Check className="w-3 h-3 text-cinnabar absolute top-1 left-1" />}
        </span>
      </button>
    </div>
  );
}

/* 快捷键分组：标题 + 多条快捷键项 */
function ShortcutGroup({ title, items }: { title: string; items: { desc: string; keys: string[] }[] }) {
  return (
    <div>
      <h4 className="font-serif text-sm font-bold text-ink-900 mb-3">{title}</h4>
      <div>
        {items.map((s) => (
          <div
            key={s.desc}
            className="flex justify-between items-center py-2 border-b border-ink-900/6"
          >
            <span className="text-sm text-ink-700">{s.desc}</span>
            <div className="flex gap-1">
              {s.keys.map((k, i) => (
                <kbd
                  key={i}
                  className="px-1.5 py-0.5 bg-rice-200 border border-ink-900/10 rounded text-xs font-mono text-ink-700"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
