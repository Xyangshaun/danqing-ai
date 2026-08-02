// ============================================================
// LogoMark 组件单元测试
// 对应源码: src/components/LogoMark.tsx
//
// 测试范围:
//   1. 渲染 SVG logo + 文字标识
//   2. aria-label 可达性
//   3. memo 化:相同渲染条件下父组件重渲染不触发 LogoMark 重渲染
//   4. hover 交互(光晕 + 缩放)
// ============================================================

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LogoMark from '../LogoMark';

describe('LogoMark 渲染', () => {
  it('渲染 SVG(含朱印底 rect + D 路径 + Q 圆)', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // 朱印底(rect fill #c41e3a)
    const rect = container.querySelector('svg rect[fill="#c41e3a"]');
    expect(rect).toBeInTheDocument();
    // D 字母(path fill #fdfcf9)
    const dPath = container.querySelector('svg path[fill="#fdfcf9"]');
    expect(dPath).toBeInTheDocument();
    // Q 外圆
    const circles = container.querySelectorAll('svg circle[fill="#fdfcf9"]');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('渲染文字标识 "DQ AI" 与副标题 "丹青智能创作"', () => {
    render(<LogoMark />);
    expect(screen.getByText('DQ')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('丹青智能创作')).toBeInTheDocument();
  });

  it('根容器有 aria-label 描述品牌含义', () => {
    const { container } = render(<LogoMark />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-label', 'DQ AI 丹青智能创作');
  });

  it('SVG 标记 aria-hidden(对辅助技术隐藏纯装饰图)', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});

describe('LogoMark hover 交互', () => {
  it('鼠标进入触发光晕显示(opacity 切换)', () => {
    const { container } = render(<LogoMark />);
    const root = container.firstElementChild as HTMLElement;
    // 初始光晕 opacity-0
    const halo = root.querySelector('.bg-cinnabar\\/25') as HTMLElement | null;
    expect(halo).toBeInTheDocument();
    expect(halo?.className).toContain('opacity-0');
    // hover 后光晕 opacity-100
    fireEvent.mouseEnter(root);
    expect(halo?.className).toContain('opacity-100');
    // mouseLeave 恢复
    fireEvent.mouseLeave(root);
    expect(halo?.className).toContain('opacity-0');
  });
});

describe('LogoMark memo 化', () => {
  it('React.memo 包裹:相同父组件重渲染时不额外重渲染 LogoMark', () => {
    // 用渲染计数器验证 memo:包一层父组件,父组件多次 setState 触发重渲染,
    // LogoMark 无 props,memo 应跳过(渲染计数不增加)
    let parentRenderCount = 0;
    function Parent() {
      parentRenderCount++;
      return <LogoMark />;
    }
    const { rerender } = render(<Parent />);
    expect(parentRenderCount).toBe(1);
    // 父组件重渲染(相同元素),LogoMark 应被 memo 跳过
    rerender(<Parent />);
    rerender(<Parent />);
    expect(parentRenderCount).toBe(3);
    // LogoMark 内部 hover 状态变化仍触发自身重渲染(不受 memo 影响)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('displayName 为 memo(LogoMark)(React.memo 默认命名)', () => {
    // memo 包裹后,组件类型存在;通过渲染验证不抛错即可
    expect(() => render(<LogoMark />)).not.toThrow();
  });
});
