import { FileSearch, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * 通用空状态组件 —— 水墨风格简约设计
 *
 * 设计规范：
 * - 主标题 text-base font-medium text-ink-700
 * - 描述文案 text-sm text-ink-400
 * - 行动召唤按钮：朱砂红色调，hover 加深（cinnabar → cinnabar-dark）
 * - 整体居中、垂直排列
 * - 图标采用 Lucide，辅以朱砂红点装饰，避免可爱卡通/二次元插画
 *
 * 使用方式：
 *   <EmptyState icon={History} title="还没有分析记录" desc="..." actionLabel="立即上传" to="/analyze" />
 *   <EmptyState icon={Search} title="没有找到匹配的作品" desc="..." />
 */
export interface EmptyStateProps {
  /** 主图标，默认 FileSearch */
  icon?: LucideIcon;
  /** 主标题（如"还没有分析记录"） */
  title: string;
  /** 描述文案（如"上传第一件作品，开始AI智能诊断"） */
  desc?: string;
  /** 行动召唤按钮文案（如"立即上传"） */
  actionLabel?: string;
  /** 按钮点击回调（与 to 互斥，优先于 to） */
  onAction?: () => void;
  /** 路由跳转地址（与 onAction 互斥） */
  to?: string;
}

export default function EmptyState({
  icon: Icon = FileSearch,
  title,
  desc,
  actionLabel,
  onAction,
  to,
}: EmptyStateProps) {
  /* 行动按钮：优先 onAction，其次 to 路由跳转 */
  const showAction = Boolean(actionLabel && (onAction || to));
  const actionClasses =
    'inline-flex items-center justify-center gap-2 px-5 h-10 bg-cinnabar text-white rounded text-sm font-medium hover:bg-cinnabar-dark transition-colors';

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      {/* 水墨风格图标 + 朱砂红点装饰 */}
      <div className="relative mb-6">
        <div className="w-20 h-20 bg-ink-900/5 rounded-full flex items-center justify-center">
          <Icon className="w-10 h-10 text-ink-400" strokeWidth={1.5} />
        </div>
        {/* 朱砂红点装饰：置于右上角，ring 与背景同色形成镂空效果 */}
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 bg-cinnabar rounded-full ring-2 ring-rice-50"
          aria-hidden="true"
        />
      </div>

      {/* 主标题 */}
      <h3 className="text-base font-medium text-ink-700 mb-2">
        {title}
      </h3>

      {/* 描述文案 */}
      {desc && (
        <p className="text-sm text-ink-400 max-w-md mb-6 leading-relaxed">
          {desc}
        </p>
      )}

      {/* 行动召唤按钮 */}
      {showAction && (
        to && !onAction ? (
          <Link to={to} className={actionClasses}>
            {actionLabel}
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={actionClasses}>
            {actionLabel}
          </button>
        )
      )}
    </div>
  );
}
