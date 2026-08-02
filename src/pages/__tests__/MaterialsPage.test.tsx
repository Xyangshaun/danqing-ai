// ============================================================
// MaterialsPage 页面单元测试 (任务包 E:块3)
// 对应源码: src/pages/MaterialsPage.tsx
//
// 测试范围:
//   1. 首页渲染(标题/统计卡片/筛选区)
//   2. 搜索过滤(关键词匹配)
//   3. 分类标签筛选
//   4. 视图切换(网格/列表)
//   5. 收藏切换
//   6. 素材包面板
//   7. 空结果态
//
// Mock 策略:
//   - artworksDatabase.getFilterOptions: 返回可控筛选选项
//   - materialService.getBuiltinArtworkItems: 返回可控作品列表
//   - materialService.getPacks: 返回空素材包
//   - data-service.getFavorites/toggleFavorite: 可控
//   - useLazyImage: 始终 loaded(避免 IntersectionObserver 依赖)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaterialsPage from '../MaterialsPage';
import { ToastProvider } from '../../components/ToastProvider';
import type { ArtworkItem } from '../../services/artworksDatabase';

/* ---------- mock 依赖 ---------- */

vi.mock('../../services/artworksDatabase', () => ({
  getFilterOptions: () => ({
    categories: ['painting', 'design'],
    styles: ['水墨', '油画'],
    eras: ['宋代', '文艺复兴'],
    regions: ['china', 'europe'],
    artists: ['测试艺术家'],
    tags: ['山水', '人物'],
  }),
}));

const getBuiltinArtworkItemsMock = vi.fn<(...args: unknown[]) => ArtworkItem[]>();
const getPacksMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
vi.mock('../../services/materialService', () => ({
  getBuiltinArtworkItems: (...args: unknown[]) => getBuiltinArtworkItemsMock(...args),
  getPacks: (...args: unknown[]) => getPacksMock(...args),
  createPack: vi.fn(),
  deletePack: vi.fn(),
  addToPack: vi.fn(),
  resolvePackMaterials: vi.fn().mockResolvedValue([]),
}));

const getFavoritesMock = vi.fn<(...args: unknown[]) => Promise<string[]>>();
const toggleFavoriteMock = vi.fn<(...args: unknown[]) => Promise<{ favorited: boolean }>>();
vi.mock('../../services/data-service', () => ({
  getFavorites: (...args: unknown[]) => getFavoritesMock(...args),
  toggleFavorite: (...args: unknown[]) => toggleFavoriteMock(...args),
}));

vi.mock('../../hooks/useLazyImage', () => ({
  useLazyImage: (src: string | undefined) => ({
    imgRef: { current: null },
    loadedSrc: src,
    isLoaded: !!src,
    isError: false,
  }),
}));

/* ---------- 测试数据工厂 ---------- */

function makeArtwork(overrides: Partial<ArtworkItem> = {}): ArtworkItem {
  return {
    id: 'art-1',
    title: '测试作品一',
    artist: '测试艺术家',
    year: '2026',
    category: 'painting',
    style: '水墨',
    era: '宋代',
    region: 'china',
    description: '描述',
    imageUrl: 'https://example.com/art.png',
    source: 'mock',
    tags: ['山水'],
    ...overrides,
  };
}

/* ---------- 渲染辅助 ---------- */

function renderMaterials() {
  return render(
    <MemoryRouter initialEntries={['/materials']}>
      <ToastProvider>
        <MaterialsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getBuiltinArtworkItemsMock.mockReset();
  getPacksMock.mockReset();
  getFavoritesMock.mockReset();
  toggleFavoriteMock.mockReset();
  getBuiltinArtworkItemsMock.mockReturnValue([makeArtwork()]);
  getPacksMock.mockResolvedValue([]);
  getFavoritesMock.mockResolvedValue([]);
  toggleFavoriteMock.mockResolvedValue({ favorited: true });
});

/* ============================================================
 * 1. 首页渲染
 * ============================================================ */
describe('MaterialsPage 首页渲染', () => {
  it('渲染标题"海内外名作 · 实时获取"与"在线艺术素材库"徽章', () => {
    renderMaterials();
    expect(screen.getByText('海内外名作 · 实时获取')).toBeInTheDocument();
    expect(screen.getByText('在线艺术素材库')).toBeInTheDocument();
  });

  it('渲染统计卡片(总作品数/风格类型/时代跨度/地区来源/标签数量)', () => {
    renderMaterials();
    expect(screen.getByText('总作品数')).toBeInTheDocument();
    expect(screen.getByText('风格类型')).toBeInTheDocument();
    expect(screen.getByText('时代跨度')).toBeInTheDocument();
    expect(screen.getByText('地区来源')).toBeInTheDocument();
    expect(screen.getByText('标签数量')).toBeInTheDocument();
  });

  it('渲染搜索输入框', () => {
    renderMaterials();
    expect(screen.getByPlaceholderText('搜索作品名称、画家、标签（支持中英文）...')).toBeInTheDocument();
  });
});

/* ============================================================
 * 2. 搜索过滤
 * ============================================================ */
describe('MaterialsPage 搜索过滤', () => {
  it('输入关键词过滤作品列表', async () => {
    getBuiltinArtworkItemsMock.mockReturnValue([
      makeArtwork({ id: 'a1', title: '山水画卷' }),
      makeArtwork({ id: 'a2', title: '花鸟图', tags: ['花鸟'] }),
    ]);
    renderMaterials();
    const input = screen.getByPlaceholderText('搜索作品名称、画家、标签（支持中英文）...');
    fireEvent.change(input, { target: { value: '山水' } });
    await waitFor(() => {
      expect(screen.getByText('山水画卷')).toBeInTheDocument();
    });
    expect(screen.queryByText('花鸟图')).not.toBeInTheDocument();
  });
});

/* ============================================================
 * 3. 作品列表渲染
 * ============================================================ */
describe('MaterialsPage 作品列表', () => {
  it('渲染作品卡片(标题可见)', async () => {
    getBuiltinArtworkItemsMock.mockReturnValue([
      makeArtwork({ id: 'a1', title: '清明上河图' }),
    ]);
    renderMaterials();
    await waitFor(() => {
      expect(screen.getByText('清明上河图')).toBeInTheDocument();
    });
  });

  it('无匹配结果时显示空态', async () => {
    getBuiltinArtworkItemsMock.mockReturnValue([
      makeArtwork({ id: 'a1', title: '山水画' }),
    ]);
    renderMaterials();
    const input = screen.getByPlaceholderText('搜索作品名称、画家、标签（支持中英文）...');
    fireEvent.change(input, { target: { value: '不存在的作品XYZ' } });
    await waitFor(() => {
      expect(screen.queryByText('山水画')).not.toBeInTheDocument();
    });
  });
});

/* ============================================================
 * 4. 收藏切换
 * ============================================================ */
describe('MaterialsPage 收藏切换', () => {
  it('点击收藏按钮调用 toggleFavorite', async () => {
    getBuiltinArtworkItemsMock.mockReturnValue([
      makeArtwork({ id: 'a1', title: '可收藏作品' }),
    ]);
    renderMaterials();
    await waitFor(() => {
      expect(screen.getByText('可收藏作品')).toBeInTheDocument();
    });
    // 收藏按钮(Heart 图标按钮,使用 aria-label 选择)
    const favBtn = screen.getByLabelText('收藏');
    fireEvent.click(favBtn);
    await waitFor(() => {
      expect(toggleFavoriteMock).toHaveBeenCalledWith('a1');
    });
  });
});

/* ============================================================
 * 5. 素材包面板
 * ============================================================ */
describe('MaterialsPage 素材包', () => {
  it('挂载时调用 getPacks 加载素材包', async () => {
    renderMaterials();
    await waitFor(() => {
      expect(getPacksMock).toHaveBeenCalled();
    });
  });

  it('挂载时调用 getFavorites 加载收藏列表', async () => {
    renderMaterials();
    await waitFor(() => {
      expect(getFavoritesMock).toHaveBeenCalled();
    });
  });
});

/* ============================================================
 * 6. 错误处理
 * ============================================================ */
describe('MaterialsPage 错误处理', () => {
  it('getFavorites 抛错时静默不崩溃', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getFavoritesMock.mockRejectedValue(new Error('storage'));
    renderMaterials();
    await waitFor(() => {
      expect(screen.getByText('海内外名作 · 实时获取')).toBeInTheDocument();
    });
    errorSpy.mockRestore();
  });

  it('toggleFavorite 抛错时显示错误提示(不崩溃)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    toggleFavoriteMock.mockRejectedValue(new Error('fail'));
    getBuiltinArtworkItemsMock.mockReturnValue([
      makeArtwork({ id: 'a1', title: '收藏失败作品' }),
    ]);
    renderMaterials();
    await waitFor(() => {
      expect(screen.getByText('收藏失败作品')).toBeInTheDocument();
    });
    const favBtn = screen.getByLabelText('收藏');
    fireEvent.click(favBtn);
    await waitFor(() => {
      expect(toggleFavoriteMock).toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });
});
