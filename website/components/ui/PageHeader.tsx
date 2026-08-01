import React from 'react';
import { Breadcrumb } from './Breadcrumb';
import { InkDecoration } from './InkDecoration';

type PageHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb: { name: string; href: string }[];
};

/**
 * 内页通用页头:面包屑 + 标题 + 描述
 * 顶部留白避开固定导航(由 main 的 pt 提供)
 */
export function PageHeader({ eyebrow, title, description, breadcrumb }: PageHeaderProps) {
  return (
    <section className="relative overflow-hidden bg-paper-100 pb-16 pt-12 md:pb-20 md:pt-16">
      {/* 背景晕染 */}
      <InkDecoration variant="mist" color="stone" opacity={0.1} className="right-0 top-0 h-full w-1/2" />
      <InkDecoration variant="mist" color="gold" opacity={0.08} className="left-0 bottom-0 h-2/3 w-1/3" />

      <div className="container-content relative">
        <Breadcrumb items={breadcrumb} />

        {eyebrow && (
          <span className="section-eyebrow mt-8">{eyebrow}</span>
        )}
        <h1 className="mt-4 max-w-3xl text-display-lg font-semibold leading-tight text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-500 md:text-lg">
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
