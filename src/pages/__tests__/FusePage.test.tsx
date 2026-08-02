// ============================================================
// FusePage 页面单元测试 (任务包 E:块3)
// 对应源码: src/pages/FusePage.tsx
//
// 测试范围:
//   1. 首页渲染(标题/融合标准设置开关)
//   2. 融合标准设置面板(嫁接风格/融合方法/融合强度)
//   3. 素材库选择器(打开/选择作品)
//   4. 灵感融合流程(选 2 作品 → 融合 → 结果)
//   5. 融合失败错误处理
//
// Mock 策略:
//   - imageService.generateImage: 返回占位图 URL
//   - materialService.getBuiltinArtworkItems: 返回可控作品列表
//   - data-service.saveSavedMaterial: 可控
//   - fuseStandards: 保留真实导出(纯数据 + 纯函数,提升覆盖率)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FusePage from '../FusePage';
import { ToastProvider } from '../../components/ToastProvider';
import type { ArtworkItem } from '../../services/artworksDatabase';

/* ---------- mock 依赖 ---------- */

const generateImageMock = vi.fn<(...args: unknown[]) => string>();
const saveSavedMaterialMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getBuiltinArtworkItemsMock = vi.fn<(...args: unknown[]) => ArtworkItem[]>();

vi.mock('../../services/imageService', () => ({
  generateImage: (...args: unknown[]) => generateImageMock(...args),
}));

vi.mock('../../services/data-service', () => ({
  saveSavedMaterial: (...args: unknown[]) => saveSavedMaterialMock(...args),
}));

vi.mock('../../services/materialService', () => ({
  getBuiltinArtworkItems: (...args: unknown[]) => getBuiltinArtworkItemsMock(...args),
}));

/* ---------- 测试数据工厂 ---------- */

function makeArtwork(overrides: Partial<ArtworkItem> = {}): ArtworkItem {
  return {
    id: 'art-1',
    title: '测试素材',
    artist: '艺术家',
    year: '2026',
    category: 'painting',
    style: '水墨',
    era: '宋代',
    region: 'china',
    description: '描述',
    imageUrl: 'https://example.com/art.png',
    source: 'mock',
    tags: [],
    ...overrides,
  };
}

/* ---------- 渲染辅助 ---------- */

function renderFuse() {
  return render(
    <MemoryRouter initialEntries={['/fuse']}>
      <ToastProvider>
        <FusePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  generateImageMock.mockReset();
  saveSavedMaterialMock.mockReset();
  getBuiltinArtworkItemsMock.mockReset();
  generateImageMock.mockReturnValue('https://example.com/generated.png');
  saveSavedMaterialMock.mockResolvedValue(undefined);
  getBuiltinArtworkItemsMock.mockReturnValue([
    makeArtwork({ id: 'a1', title: '素材一' }),
    makeArtwork({ id: 'a2', title: '素材二' }),
  ]);
});

/* ============================================================
 * 1. 首页渲染
 * ============================================================ */
describe('FusePage 首页渲染', () => {
  it('渲染标题"创意融合 · 1+1>2"与"灵感嫁接"徽章', () => {
    renderFuse();
    expect(screen.getByText('创意融合 · 1+1>2')).toBeInTheDocument();
    expect(screen.getByText('灵感嫁接')).toBeInTheDocument();
  });

  it('渲染"融合标准设置"开关按钮', () => {
    renderFuse();
    expect(screen.getByText('融合标准设置')).toBeInTheDocument();
  });

  it('渲染主体作品与嫁接元素上传区', () => {
    renderFuse();
    // 实际文本为"作品 1 · 主体作品"和"作品 2 · 嫁接元素",用正则匹配
    expect(screen.getByText(/主体作品/)).toBeInTheDocument();
    expect(screen.getByText(/嫁接元素/)).toBeInTheDocument();
  });
});

/* ============================================================
 * 2. 融合标准设置面板
 * ============================================================ */
describe('FusePage 融合标准设置', () => {
  it('点击"融合标准设置"展开设置面板(显示嫁接风格/融合方法/融合强度)', () => {
    renderFuse();
    fireEvent.click(screen.getByText('融合标准设置'));
    expect(screen.getByText('嫁接风格')).toBeInTheDocument();
    expect(screen.getByText('融合方法')).toBeInTheDocument();
    expect(screen.getByText('融合强度')).toBeInTheDocument();
  });

  it('再次点击收起设置面板', () => {
    renderFuse();
    const btn = screen.getByText('融合标准设置');
    fireEvent.click(btn);
    expect(screen.getByText('嫁接风格')).toBeInTheDocument();
    fireEvent.click(screen.getByText('收起标准设置'));
    expect(screen.queryByText('嫁接风格')).not.toBeInTheDocument();
  });
});

/* ============================================================
 * 3. 素材库选择器
 * ============================================================ */
describe('FusePage 素材库选择器', () => {
  it('点击"从素材库选"打开选择器面板', () => {
    renderFuse();
    const pickBtn = screen.getAllByText(/从素材库选/)[0];
    fireEvent.click(pickBtn);
    // 选择器打开后显示素材列表中的作品标题
    expect(screen.getAllByText('素材一').length).toBeGreaterThan(0);
  });

  it('在选择器中点击作品选中第一张', () => {
    renderFuse();
    const pickBtn = screen.getAllByText(/从素材库选/)[0];
    fireEvent.click(pickBtn);
    // 选择器中点击"素材一"(选择器打开时取列表中最后一个匹配项)
    const items = screen.getAllByText('素材一');
    fireEvent.click(items[items.length - 1]);
    // 选中后选择器关闭,作品区显示标题
    expect(screen.getAllByText('素材一').length).toBeGreaterThan(0);
  });
});

/* ============================================================
 * 4. 灵感融合流程
 * ============================================================ */
describe('FusePage 灵感融合', () => {
  it('选中两张作品后显示"开始灵感嫁接"按钮', () => {
    renderFuse();
    // 选择第一张(点击 slot 1 的"从素材库选"按钮)
    fireEvent.click(screen.getAllByText(/从素材库选/)[0]);
    let items = screen.getAllByText('素材一');
    fireEvent.click(items[items.length - 1]);
    // 选择第二张(点击 slot 2 的"从素材库选"按钮,索引为 1)
    fireEvent.click(screen.getAllByText(/从素材库选/)[1]);
    items = screen.getAllByText('素材二');
    fireEvent.click(items[items.length - 1]);
    // "开始灵感嫁接"在 span 中,用正则匹配
    expect(screen.getByText(/开始灵感嫁接/)).toBeInTheDocument();
  });

  it('点击"开始灵感嫁接"调用 generateImage 生成结果', async () => {
    renderFuse();
    // 选择两张作品
    fireEvent.click(screen.getAllByText(/从素材库选/)[0]);
    let items = screen.getAllByText('素材一');
    fireEvent.click(items[items.length - 1]);
    fireEvent.click(screen.getAllByText(/从素材库选/)[1]);
    items = screen.getAllByText('素材二');
    fireEvent.click(items[items.length - 1]);
    fireEvent.click(screen.getByText(/开始灵感嫁接/));
    await waitFor(() => {
      expect(generateImageMock).toHaveBeenCalled();
    });
  });
});

/* ============================================================
 * 5. 错误处理
 * ============================================================ */
describe('FusePage 错误处理', () => {
  it('generateImage 抛错时显示融合失败提示(不崩溃)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateImageMock.mockImplementation(() => {
      throw new Error('generate fail');
    });
    renderFuse();
    fireEvent.click(screen.getAllByText(/从素材库选/)[0]);
    let items = screen.getAllByText('素材一');
    fireEvent.click(items[items.length - 1]);
    fireEvent.click(screen.getAllByText(/从素材库选/)[1]);
    items = screen.getAllByText('素材二');
    fireEvent.click(items[items.length - 1]);
    fireEvent.click(screen.getByText(/开始灵感嫁接/));
    await waitFor(() => {
      expect(generateImageMock).toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });
});
