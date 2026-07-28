import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Image as ImageIcon, X, ExternalLink, Heart, Download, Grid3X3, List, Globe, RefreshCw, Tag, ChevronDown, Check, Loader2, ImageOff, ChevronUp, Sparkles } from 'lucide-react';
import { artworksDatabase, getFilterOptions, type ArtworkItem } from '../services/artworksDatabase';
import { useToast } from '../components/ToastProvider';

const categoryNames: Record<string, string> = {
  painting: '绘画',
  design: '设计',
  product: '产品设计',
  sculpture: '雕塑',
  calligraphy: '书法',
  architecture: '建筑',
};

const regionNames: Record<string, string> = {
  china: '中国',
  'east-asia': '东亚',
  europe: '欧洲',
  america: '美洲',
  other: '其他',
};

export default function MaterialsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [selectedEras, setSelectedEras] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [showAllTags, setShowAllTags] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<'none' | 'style' | 'era' | 'region'>('none');

  // 跳转到灵感嫁接页面，携带素材信息
  const handleSendToFuse = (artwork: ArtworkItem) => {
    toast.info('已选择素材，前往嫁接页面');
    navigate(
      `/fuse?src=material&imageUrl=${encodeURIComponent(artwork.imageUrl)}&title=${encodeURIComponent(artwork.title)}`
    );
  };

  const filterOptions = useMemo(() => getFilterOptions(), []);

  // 统计每个标签的作品数量
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    artworksDatabase.forEach((a) => {
      a.tags.forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return counts;
  }, []);

  // 按作品数量排序标签
  const sortedTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [tagCounts]);

  // 显示的标签（折叠时只显示前12个）
  const displayedTags = showAllTags ? sortedTags : sortedTags.slice(0, 12);

  // 过滤作品
  const filteredArtworks = useMemo(() => {
    let results = [...artworksDatabase];

    if (searchQuery) {
      const kw = searchQuery.toLowerCase();
      results = results.filter(
        (a) =>
          a.title.includes(searchQuery) ||
          a.titleEn?.toLowerCase().includes(kw) ||
          a.artist.includes(searchQuery) ||
          a.artistEn?.toLowerCase().includes(kw) ||
          a.description.includes(searchQuery) ||
          a.tags.some((t) => t.includes(searchQuery))
      );
    }

    if (selectedCategories.size > 0) {
      results = results.filter((a) => selectedCategories.has(a.category));
    }

    if (selectedStyles.size > 0) {
      results = results.filter((a) => selectedStyles.has(a.style));
    }

    if (selectedEras.size > 0) {
      results = results.filter((a) => selectedEras.has(a.era));
    }

    if (selectedRegions.size > 0) {
      results = results.filter((a) => selectedRegions.has(a.region));
    }

    if (selectedTags.size > 0) {
      results = results.filter((a) => a.tags.some((t) => selectedTags.has(t)));
    }

    return results;
  }, [searchQuery, selectedCategories, selectedStyles, selectedEras, selectedRegions, selectedTags]);

  const handleImageError = (id: string) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: 'error' }));
  };

  const handleImageLoad = (id: string) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: 'loaded' }));
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSet = (
    value: string,
    setter: (fn: (prev: Set<string>) => Set<string>) => void
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const groupedArtworks = useMemo(() => {
    if (groupBy === 'none') return { all: filteredArtworks };
    const groups: Record<string, ArtworkItem[]> = {};
    filteredArtworks.forEach((artwork) => {
      const key = groupBy === 'style' ? artwork.style :
                  groupBy === 'era' ? artwork.era :
                  regionNames[artwork.region] || artwork.region;
      if (!groups[key]) groups[key] = [];
      groups[key].push(artwork);
    });
    return groups;
  }, [filteredArtworks, groupBy]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategories(new Set());
    setSelectedStyles(new Set());
    setSelectedEras(new Set());
    setSelectedRegions(new Set());
    setSelectedTags(new Set());
  };

  const activeFilterCount =
    selectedCategories.size +
    selectedStyles.size +
    selectedEras.size +
    selectedRegions.size +
    selectedTags.size;

  useEffect(() => {
    const saved = localStorage.getItem('artwork-favorites');
    if (saved) {
      try { setFavorites(new Set(JSON.parse(saved))); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('artwork-favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  // 标签按钮组件
  const TagButton = ({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm transition-all whitespace-nowrap ${
        active
          ? 'bg-cinnabar text-white border border-cinnabar'
          : 'bg-rice-100 text-ink-700 border border-transparent hover:bg-rice-200 hover:border-ink-200'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1 text-xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{count}</span>
      )}
      {active && <Check className="w-3 h-3 inline ml-1" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-4">
            <Globe className="w-4 h-4 text-cinnabar" />
            <span className="text-sm text-ink-600">在线艺术素材库</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
            海内外名作 · 实时获取
          </h1>
          <p className="text-ink-600 max-w-2xl mx-auto">
            整合Wikimedia Commons等公开数据源，收录{artworksDatabase.length}+件中外艺术杰作
            <br />
            <span className="text-sm text-ink-500">涵盖绘画、设计、雕塑、书法等多种创作形式</span>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-rice-50 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink-900">{artworksDatabase.length}</p>
            <p className="text-sm text-ink-500">总作品数</p>
          </div>
          <div className="bg-rice-50 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink-900">{filterOptions.styles.length}</p>
            <p className="text-sm text-ink-500">风格类型</p>
          </div>
          <div className="bg-rice-50 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink-900">{filterOptions.eras.length}</p>
            <p className="text-sm text-ink-500">时代跨度</p>
          </div>
          <div className="bg-rice-50 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink-900">{filterOptions.regions.length}</p>
            <p className="text-sm text-ink-500">地区来源</p>
          </div>
          <div className="bg-rice-50 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink-900">{sortedTags.length}</p>
            <p className="text-sm text-ink-500">标签数量</p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-rice-50 rounded-2xl p-4 shadow-card mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索作品名称、画家、标签（支持中英文）..."
              className="w-full pl-12 pr-4 py-3 border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cinnabar/30 focus:border-cinnabar"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-ink-100 rounded-full">
                <X className="w-4 h-4 text-ink-400" />
              </button>
            )}
          </div>
        </div>

        {/* 标签筛选面板 */}
        <div className="bg-rice-50 rounded-2xl p-4 shadow-card mb-4">
          {/* 类型标签 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">创作类型</span>
              <span className="text-xs text-ink-400">（可多选）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categoryNames).map(([key, name]) => {
                const count = artworksDatabase.filter(a => a.category === key).length;
                if (count === 0) return null;
                return (
                  <TagButton
                    key={key}
                    label={name}
                    count={count}
                    active={selectedCategories.has(key)}
                    onClick={() => toggleSet(key, setSelectedCategories)}
                  />
                );
              })}
            </div>
          </div>

          {/* 地区标签 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">地区</span>
              <span className="text-xs text-ink-400">（可多选）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(regionNames).map(([key, name]) => {
                const count = artworksDatabase.filter(a => a.region === key).length;
                if (count === 0) return null;
                return (
                  <TagButton
                    key={key}
                    label={name}
                    count={count}
                    active={selectedRegions.has(key)}
                    onClick={() => toggleSet(key, setSelectedRegions)}
                  />
                );
              })}
            </div>
          </div>

          {/* 风格标签 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">风格流派</span>
              <span className="text-xs text-ink-400">（可多选）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterOptions.styles.map((style) => {
                const count = artworksDatabase.filter(a => a.style === style).length;
                if (count === 0) return null;
                return (
                  <TagButton
                    key={style}
                    label={style}
                    count={count}
                    active={selectedStyles.has(style)}
                    onClick={() => toggleSet(style, setSelectedStyles)}
                  />
                );
              })}
            </div>
          </div>

          {/* 时代标签 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">时代</span>
              <span className="text-xs text-ink-400">（可多选）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterOptions.eras.map((era) => {
                const count = artworksDatabase.filter(a => a.era === era).length;
                if (count === 0) return null;
                return (
                  <TagButton
                    key={era}
                    label={era}
                    count={count}
                    active={selectedEras.has(era)}
                    onClick={() => toggleSet(era, setSelectedEras)}
                  />
                );
              })}
            </div>
          </div>

          {/* 作品标签云 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">作品标签</span>
              <span className="text-xs text-ink-400">（可多选）</span>
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="ml-auto text-xs text-cinnabar hover:underline flex items-center gap-1"
              >
                {showAllTags ? '收起' : `展开全部 (${sortedTags.length})`}
                <ChevronDown className={`w-3 h-3 transition-transform ${showAllTags ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {displayedTags.map(({ tag, count }) => (
                <TagButton
                  key={tag}
                  label={tag}
                  count={count}
                  active={selectedTags.has(tag)}
                  onClick={() => toggleSet(tag, setSelectedTags)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-ink-500">
              共 <span className="font-medium text-ink-900">{filteredArtworks.length}</span> 件作品
              {favorites.size > 0 && <span className="ml-2">· 已收藏 {favorites.size} 件</span>}
            </p>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-cinnabar/10 text-cinnabar text-xs rounded-full">
                {activeFilterCount} 个筛选条件
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-ink-600 hover:text-cinnabar transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                清除筛选
              </button>
            )}
            <div className="flex items-center gap-1 bg-white rounded-lg p-1">
              <span className="text-xs text-ink-400 px-2">分组:</span>
              {[
                { key: 'none', label: '无' },
                { key: 'style', label: '风格' },
                { key: 'era', label: '时代' },
                { key: 'region', label: '地区' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setGroupBy(opt.key as typeof groupBy); setCollapsedGroups(new Set()); }}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    groupBy === opt.key
                      ? 'bg-cinnabar text-white'
                      : 'text-ink-600 hover:bg-rice-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-rice-100'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-rice-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Artworks */}
        {filteredArtworks.length === 0 ? (
          <div className="bg-rice-50 rounded-2xl p-12 text-center shadow-card">
            <ImageIcon className="w-16 h-16 text-ink-300 mx-auto mb-4" />
            <h3 className="font-serif text-xl font-semibold text-ink-700 mb-2">未找到匹配作品</h3>
            <p className="text-ink-500 mb-4">尝试调整筛选条件或搜索关键词</p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="px-4 py-2 bg-cinnabar text-white rounded-lg hover:bg-stone transition-all">
                清除所有筛选
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedArtworks).map(([groupKey, artworks]) => {
              const isCollapsed = collapsedGroups.has(groupKey);
              return (
                <div key={groupKey}>
                  {groupBy !== 'none' && (
                    <button
                      onClick={() => toggleGroupCollapse(groupKey)}
                      className="w-full flex items-center justify-between mb-4 px-4 py-3 bg-rice-50 rounded-xl shadow-card hover:shadow-card-hover transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <Tag className="w-4 h-4 text-cinnabar" />
                        <span className="font-serif text-lg font-bold text-ink-900">{groupKey}</span>
                        <span className="text-sm text-ink-500">{artworks.length} 件作品</span>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="w-5 h-5 text-ink-400 group-hover:text-cinnabar transition-all" />
                      ) : (
                        <ChevronUp className="w-5 h-5 text-ink-400 group-hover:text-cinnabar transition-all" />
                      )}
                    </button>
                  )}
                  {!isCollapsed && (
                    <>
                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {artworks.map((artwork) => (
                            <div
                              key={artwork.id}
                              className="bg-rice-50 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all group cursor-pointer"
                              onClick={() => setSelectedArtwork(artwork)}
                            >
                              <div className="aspect-[4/3] overflow-hidden relative bg-ink-100">
                                {imageLoadStates[artwork.id] === 'loading' && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-ink-100 z-10">
                                    <Loader2 className="w-8 h-8 text-ink-300 animate-spin" />
                                  </div>
                                )}
                                {imageLoadStates[artwork.id] === 'error' ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-rice-100">
                                    <ImageOff className="w-10 h-10 text-ink-300 mb-2" />
                                    <p className="text-xs text-ink-400">加载失败</p>
                                  </div>
                                ) : (
                                  <img
                                    src={artwork.imageUrl}
                                    alt={artwork.title}
                                    className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${
                                      imageLoadStates[artwork.id] === 'loaded' ? 'opacity-100' : 'opacity-0'
                                    }`}
                                    loading="lazy"
                                    onLoad={() => handleImageLoad(artwork.id)}
                                    onError={() => handleImageError(artwork.id)}
                                  />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute top-3 left-3 flex gap-2">
                                  <span className="px-2 py-0.5 bg-cinnabar/90 text-white text-xs rounded-full">
                                    {categoryNames[artwork.category] || artwork.category}
                                  </span>
                                  <span className="px-2 py-0.5 bg-ink-900/70 text-white text-xs rounded-full">
                                    {regionNames[artwork.region] || artwork.region}
                                  </span>
                                </div>
                                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex gap-1 flex-wrap">
                                    {artwork.tags.slice(0, 3).map((tag) => (
                                      <span key={tag} className="px-2 py-0.5 bg-white/80 backdrop-blur-sm text-xs rounded-full text-ink-700">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h3 className="font-serif text-lg font-bold text-ink-900">{artwork.title}</h3>
                                    <p className="text-sm text-ink-500">{artwork.artist} · {artwork.era}</p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSendToFuse(artwork); }}
                                      className="p-1.5 rounded-full hover:bg-cinnabar/10 hover:text-cinnabar text-ink-400 transition-all"
                                      title="用于嫁接"
                                    >
                                      <Sparkles className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleFavorite(artwork.id); }}
                                      className="p-1.5 rounded-full hover:bg-rice-100 transition-all"
                                    >
                                      <Heart className={`w-4 h-4 ${favorites.has(artwork.id) ? 'text-cinnabar fill-cinnabar' : 'text-ink-400'}`} />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-ink-600 line-clamp-2">{artwork.description}</p>
                                <div className="flex gap-2 mt-3 flex-wrap">
                                  <span className="px-2 py-0.5 bg-rice-100 text-xs rounded-full text-ink-600">{artwork.style}</span>
                                  {artwork.medium && <span className="px-2 py-0.5 bg-rice-100 text-xs rounded-full text-ink-600">{artwork.medium}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {artworks.map((artwork) => (
                            <div
                              key={artwork.id}
                              className="bg-rice-50 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all cursor-pointer flex"
                              onClick={() => setSelectedArtwork(artwork)}
                            >
                              <div className="w-48 h-36 flex-shrink-0 overflow-hidden bg-ink-100 relative">
                                {imageLoadStates[artwork.id] === 'loading' && (
                                  <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <Loader2 className="w-6 h-6 text-ink-300 animate-spin" />
                                  </div>
                                )}
                                {imageLoadStates[artwork.id] === 'error' ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center">
                                    <ImageOff className="w-6 h-6 text-ink-300 mb-1" />
                                    <p className="text-xs text-ink-400">加载失败</p>
                                  </div>
                                ) : (
                                  <img
                                    src={artwork.imageUrl}
                                    alt={artwork.title}
                                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                                      imageLoadStates[artwork.id] === 'loaded' ? 'opacity-100' : 'opacity-0'
                                    }`}
                                    loading="lazy"
                                    onLoad={() => handleImageLoad(artwork.id)}
                                    onError={() => handleImageError(artwork.id)}
                                  />
                                )}
                              </div>
                              <div className="p-4 flex-1">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h3 className="font-serif text-lg font-bold text-ink-900">{artwork.title}</h3>
                                    <p className="text-sm text-ink-500">{artwork.artist} · {artwork.era} · {artwork.style}</p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSendToFuse(artwork); }}
                                      className="p-1.5 rounded-full hover:bg-cinnabar/10 hover:text-cinnabar text-ink-400 transition-all"
                                      title="用于嫁接"
                                    >
                                      <Sparkles className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleFavorite(artwork.id); }}
                                      className="p-1.5 rounded-full hover:bg-rice-100 transition-all"
                                    >
                                      <Heart className={`w-4 h-4 ${favorites.has(artwork.id) ? 'text-cinnabar fill-cinnabar' : 'text-ink-400'}`} />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-ink-600 mt-2 line-clamp-2">{artwork.description}</p>
                                <div className="flex gap-2 mt-3 flex-wrap">
                                  {artwork.tags.slice(0, 5).map((tag) => (
                                    <span key={tag} className="px-2 py-0.5 bg-rice-100 text-xs rounded-full text-ink-600">{tag}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        {selectedArtwork && (
          <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedArtwork(null)}>
            <div className="bg-rice-50 rounded-2xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
              <div className="md:w-3/5 relative bg-ink-900 flex items-center justify-center min-h-[300px]">
                {imageLoadStates[selectedArtwork.id] === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Loader2 className="w-10 h-10 text-ink-500 animate-spin" />
                  </div>
                )}
                {imageLoadStates[selectedArtwork.id] === 'error' ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <ImageOff className="w-12 h-12 text-ink-600 mb-3" />
                    <p className="text-sm text-ink-400">图片加载失败</p>
                  </div>
                ) : (
                  <img
                    src={selectedArtwork.imageUrl}
                    alt={selectedArtwork.title}
                    className={`w-full h-full object-contain max-h-[60vh] md:max-h-[80vh] transition-opacity duration-500 ${
                      imageLoadStates[selectedArtwork.id] === 'loaded' ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => handleImageLoad(selectedArtwork.id)}
                    onError={() => handleImageError(selectedArtwork.id)}
                  />
                )}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="px-2 py-1 bg-cinnabar text-white text-sm rounded-full">{categoryNames[selectedArtwork.category] || selectedArtwork.category}</span>
                  <span className="px-2 py-1 bg-ink-900/80 text-white text-sm rounded-full">{regionNames[selectedArtwork.region] || selectedArtwork.region}</span>
                </div>
              </div>
              <div className="md:w-2/5 p-6 overflow-y-auto max-h-[40vh] md:max-h-[80vh]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-ink-900">{selectedArtwork.title}</h2>
                    {selectedArtwork.titleEn && <p className="text-sm text-ink-400 italic">{selectedArtwork.titleEn}</p>}
                  </div>
                  <button onClick={() => setSelectedArtwork(null)} className="p-2 hover:bg-rice-100 rounded-full transition-all"><X className="w-5 h-5 text-ink-700" /></button>
                </div>
                <div className="mb-4">
                  <p className="text-ink-500">
                    <span className="font-medium text-ink-700">{selectedArtwork.artist}</span>
                    {selectedArtwork.artistEn && <span className="text-sm text-ink-400 ml-1">({selectedArtwork.artistEn})</span>}
                    <span className="mx-2">·</span>{selectedArtwork.year}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-rice-50 rounded-lg p-3"><p className="text-xs text-ink-500">风格</p><p className="text-sm font-medium text-ink-700">{selectedArtwork.style}</p></div>
                  <div className="bg-rice-50 rounded-lg p-3"><p className="text-xs text-ink-500">时代</p><p className="text-sm font-medium text-ink-700">{selectedArtwork.era}</p></div>
                  {selectedArtwork.dimensions && <div className="bg-rice-50 rounded-lg p-3"><p className="text-xs text-ink-500">尺寸</p><p className="text-sm font-medium text-ink-700">{selectedArtwork.dimensions}</p></div>}
                  {selectedArtwork.medium && <div className="bg-rice-50 rounded-lg p-3"><p className="text-xs text-ink-500">材质</p><p className="text-sm font-medium text-ink-700">{selectedArtwork.medium}</p></div>}
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">作品介绍</p>
                  <p className="text-sm text-ink-600 leading-relaxed">{selectedArtwork.description}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">标签</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedArtwork.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => { toggleSet(tag, setSelectedTags); setSelectedArtwork(null); }}
                        className="px-3 py-1 bg-ink-900/5 text-ink-700 text-sm rounded-full hover:bg-cinnabar hover:text-white transition-all"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4 p-3 bg-rice-50 rounded-lg">
                  <p className="text-xs text-ink-500 mb-1">图片来源</p>
                  <p className="text-sm text-ink-700 flex items-center gap-1"><Globe className="w-3 h-3" />{selectedArtwork.source}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => toggleFavorite(selectedArtwork.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all ${favorites.has(selectedArtwork.id) ? 'bg-cinnabar text-white' : 'border-2 border-ink-200 text-ink-700 hover:border-cinnabar hover:text-cinnabar'}`}
                  >
                    <Heart className={`w-4 h-4 ${favorites.has(selectedArtwork.id) ? 'fill-white' : ''}`} />
                    <span className="text-sm font-medium">{favorites.has(selectedArtwork.id) ? '已收藏' : '收藏'}</span>
                  </button>
                  {selectedArtwork.sourceUrl && (
                    <a href={selectedArtwork.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-ink-200 text-ink-700 rounded-lg hover:border-ink-900 transition-all">
                      <ExternalLink className="w-4 h-4" /><span className="text-sm font-medium">查看原图</span>
                    </a>
                  )}
                  <button
                    onClick={() => { const link = document.createElement('a'); link.href = selectedArtwork.imageUrl; link.download = `${selectedArtwork.title}.jpg`; link.target = '_blank'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-lg hover:bg-cinnabar transition-all"
                  >
                    <Download className="w-4 h-4" /><span className="text-sm font-medium">下载参考</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
