import { useState, useEffect } from 'react';
import { ArrowRight, X, ExternalLink, Heart, Globe, BookMarked, Brush, PenTool, Box, Layers, Loader2, ImageOff } from 'lucide-react';
import { loadBuiltinArtworks, styleCategories, resolveArtworkThumbUrl, withAppBase, type ArtworkItem } from '../services/artworksDatabase';
import { artworkImage } from '../services/artworkImage';
import { SkeletonBox, SkeletonStyle } from '../components/PageSkeleton';
import { useToast } from '../components/ToastProvider';

/* 四大创作形式封面:真实公有领域藏品(Wikimedia Commons / Google Art Project),
 * 加载失败时回退到本地生成的 SVG 占位图,保证永不错裂。
 *   绘画   — 梵高《罗纳河上的星夜》(Google Art Project)
 *   设计   — William Morris 孔雀织锦面板
 *   产品   — 明嘉靖五彩鱼藻纹盖罐
 *   雕塑   — 卢浮宫《狄安娜与鹿》喷泉雕塑
 */
const styleConfigs = {
  painting: {
    name: '绘画',
    icon: Brush,
    description: '中国画与西方绘画的经典流派',
    coverImage: withAppBase('/images/artworks-real/full/wm-bdfa9e96f2.jpg'),
    coverFallback: artworkImage('painting-styles-cover', { size: 'landscape_4_3', category: 'painting', title: '绘画' }),
  },
  design: {
    name: '设计',
    icon: PenTool,
    description: '视觉传达与平面设计流派',
    coverImage: withAppBase('/images/artworks-real/full/wm-73f07c6cce.jpg'),
    coverFallback: artworkImage('design-styles-cover', { size: 'landscape_4_3', category: 'design', title: '设计' }),
  },
  product: {
    name: '产品设计',
    icon: Box,
    description: '工业设计与家具设计经典',
    coverImage: withAppBase('/images/artworks-real/full/wm-56455993d3.jpg'),
    coverFallback: artworkImage('product-styles-cover', { size: 'landscape_4_3', category: 'product', title: '产品设计' }),
  },
  sculpture: {
    name: '雕塑',
    icon: Layers,
    description: '古今中外的雕塑艺术杰作',
    coverImage: withAppBase('/images/artworks-real/full/wm-c612851da4.jpg'),
    coverFallback: artworkImage('sculpture-styles-cover', { size: 'landscape_4_3', category: 'sculpture', title: '雕塑' }),
  },
};

export default function StylesPage() {
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof styleCategories | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  /* 分类封面图加载状态：独立管理，避免与作品图状态冲突 */
  const [coverLoadStates, setCoverLoadStates] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});

  /* 素材数据状态 */
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadBuiltinArtworks()
      .then((data) => {
        if (!cancelled) {
          setArtworks(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('加载风格库失败:', err);
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleImageLoad = (id: string) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: 'loaded' }));
  };

  const handleImageError = (id: string) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: 'error' }));
  };

  const handleCoverLoad = (key: string) => {
    setCoverLoadStates((prev) => ({ ...prev, [key]: 'loaded' }));
  };
  const handleCoverError = (key: string) => {
    setCoverLoadStates((prev) => ({ ...prev, [key]: 'error' }));
  };

  // 根据风格获取作品
  const getArtworksByStyle = (style: string): ArtworkItem[] => {
    return artworks.filter((a) => a.style === style);
  };

  /* 收藏切换：补全操作反馈，避免"无响应"体验 */
  const toggleFavorite = (id: string, title?: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast.info('已取消收藏', title ?? '');
      } else {
        next.add(id);
        toast.success('已收藏', title ?? '作品已加入收藏夹');
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      {isLoading && (
        <div className="fixed inset-0 bg-rice-200/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-cinnabar animate-spin mb-3" />
            <p className="text-ink-700 font-medium">正在加载风格库...</p>
          </div>
        </div>
      )}
      <SkeletonStyle />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-4">
            <BookMarked className="w-4 h-4 text-cinnabar" />
            <span className="text-sm text-ink-600">在线风格库</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
            艺术风格 · 分类索引
          </h1>
          <p className="text-ink-600 max-w-2xl mx-auto">
            收录{artworks.length}+件海内外艺术作品，覆盖四大创作类型、{Object.values(styleCategories).flatMap(c => c.styles).length}+种风格流派
          </p>
        </div>

        {!selectedCategory ? (
          <>
            {/* Category Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {Object.entries(styleConfigs).map(([key, config]) => {
                const Icon = config.icon;
                const count = artworks.filter(a => a.category === key).length;
                const styleCount = styleCategories[key as keyof typeof styleCategories].styles.length;
                
                return (
                  <div
                    key={key}
                    className="bg-rice-50 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all group cursor-pointer"
                    onClick={() => setSelectedCategory(key as keyof typeof styleCategories)}
                  >
                    <div className="aspect-[16/9] relative overflow-hidden bg-ink-100">
                      {/* 封面图加载骨架：避免大图加载时空白闪动 */}
                      {coverLoadStates[key] !== 'loaded' && coverLoadStates[key] !== 'error' && (
                        <SkeletonBox className="absolute inset-0 z-10" />
                      )}
                      {coverLoadStates[key] === 'error' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rice-100">
                          <ImageOff className="w-8 h-8 text-ink-300 mb-1" />
                          <p className="text-xs text-ink-400">封面加载失败</p>
                        </div>
                      ) : (
                        <img
                          src={config.coverImage}
                          alt={config.name}
                          loading="eager"
                          className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${
                            coverLoadStates[key] === 'loaded' ? 'opacity-100' : 'opacity-0'
                          }`}
                          onLoad={() => handleCoverLoad(key)}
                          onError={(e) => {
                            // 真实封面失败时回退到内联 SVG 占位(零网络),仍失败才置错误态
                            const img = e.currentTarget;
                            if (img.src !== config.coverFallback) {
                              img.src = config.coverFallback;
                              return;
                            }
                            handleCoverError(key);
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-ink-900/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-cinnabar rounded-lg flex items-center justify-center">
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-serif text-xl font-bold text-white">{config.name}</h3>
                            <p className="text-sm text-white/70">{config.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-ink-500">
                        <span>{count} 件作品</span>
                        <span>·</span>
                        <span>{styleCount} 种风格</span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-ink-400 group-hover:text-cinnabar group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Stats */}
            <div className="bg-rice-50 rounded-2xl p-6 shadow-card mb-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(styleCategories).map(([key, cat]) => {
                  const config = styleConfigs[key as keyof typeof styleConfigs];
                  const Icon = config.icon;
                  const count = artworks.filter(a => a.category === key).length;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-rice-100 cursor-pointer transition-all"
                      onClick={() => setSelectedCategory(key as keyof typeof styleCategories)}
                    >
                      <div className="w-10 h-10 bg-ink-900/5 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-ink-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink-700">{cat.name}</p>
                        <p className="text-xs text-ink-500">{count} 件</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Popular Styles */}
            <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-4">热门风格</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(styleCategories).flatMap(([key, cat]) =>
                  cat.styles.map((style) => {
                    const count = artworks.filter(a => a.style === style).length;
                    return (
                      <button
                        key={`${key}-${style}`}
                        onClick={() => {
                          setSelectedCategory(key as keyof typeof styleCategories);
                          setSelectedStyle(style);
                        }}
                        className="px-4 py-2 bg-rice-100 text-ink-700 rounded-full text-sm hover:bg-cinnabar hover:text-white transition-all"
                      >
                        {style}
                        <span className="ml-2 text-xs opacity-60">({count})</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Category Detail */}
            <div className="mb-6">
              <button
              onClick={() => {
                setSelectedCategory(null);
                setSelectedStyle(null);
              }}
              aria-label="返回分类"
              className="flex items-center gap-2 text-ink-500 hover:text-ink-700 mb-4"
            >
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span>返回分类</span>
              </button>
              
              <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-cinnabar rounded-lg flex items-center justify-center">
                    {(() => {
                      const Icon = styleConfigs[selectedCategory].icon;
                      return <Icon className="w-6 h-6 text-white" />;
                    })()}
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-ink-900">
                      {styleCategories[selectedCategory].name}
                    </h2>
                    <p className="text-ink-500">{styleConfigs[selectedCategory].description}</p>
                  </div>
                </div>

                {/* Style Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setSelectedStyle(null)}
                    className={`px-4 py-2 rounded-full text-sm transition-all ${
                      !selectedStyle
                        ? 'bg-cinnabar text-white'
                        : 'bg-rice-100 text-ink-700 hover:bg-rice-200'
                    }`}
                  >
                    全部
                  </button>
                  {styleCategories[selectedCategory].styles.map((style) => {
                    const count = artworks.filter(a => a.category === selectedCategory && a.style === style).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={style}
                        onClick={() => setSelectedStyle(style)}
                        className={`px-4 py-2 rounded-full text-sm transition-all ${
                          selectedStyle === style
                            ? 'bg-cinnabar text-white'
                            : 'bg-rice-100 text-ink-700 hover:bg-rice-200'
                        }`}
                      >
                        {style}
                        <span className="ml-1 text-xs opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 text-center mb-6">
                  <div className="bg-rice-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-ink-900">
                      {selectedStyle
                        ? artworks.filter(a => a.style === selectedStyle).length
                        : artworks.filter(a => a.category === selectedCategory).length}
                    </p>
                    <p className="text-xs text-ink-500">件作品</p>
                  </div>
                  <div className="bg-rice-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-ink-900">
                      {styleCategories[selectedCategory].styles.length}
                    </p>
                    <p className="text-xs text-ink-500">种风格</p>
                  </div>
                  <div className="bg-rice-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-ink-900">
                      {styleCategories[selectedCategory].eras.length}
                    </p>
                    <p className="text-xs text-ink-500">个时代</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Artworks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(selectedStyle
                ? getArtworksByStyle(selectedStyle)
                : artworks.filter(a => a.category === selectedCategory)
              ).map((artwork) => (
                <div
                  key={artwork.id}
                  className="bg-rice-50 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all group cursor-pointer"
                  onClick={() => setSelectedArtwork(artwork)}
                >
                  <div className="aspect-[4/3] overflow-hidden relative bg-ink-100">
                    {imageLoadStates[artwork.id] === 'loading' && (
                      <SkeletonBox className="absolute inset-0 z-10" />
                    )}
                    {imageLoadStates[artwork.id] === 'error' ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-rice-100">
                        <ImageOff className="w-10 h-10 text-ink-300 mb-2" />
                        <p className="text-xs text-ink-400">图片加载失败</p>
                      </div>
                    ) : (
                      <img
                        src={resolveArtworkThumbUrl(artwork)}
                        alt={artwork.title}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${
                          imageLoadStates[artwork.id] === 'loaded' ? 'opacity-100' : 'opacity-0'
                        }`}
                        loading="lazy"
                        onLoad={() => handleImageLoad(artwork.id)}
                        onError={() => handleImageError(artwork.id)}
                      />
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className="px-2 py-0.5 bg-cinnabar/90 text-white text-xs rounded-full">
                        {artwork.style}
                      </span>
                      <span className="px-2 py-0.5 bg-ink-900/70 text-white text-xs rounded-full">
                        {artwork.era}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-serif text-lg font-bold text-ink-900">{artwork.title}</h3>
                        <p className="text-sm text-ink-500">{artwork.artist}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(artwork.id, artwork.title);
                        }}
                        aria-label={favorites.has(artwork.id) ? '取消收藏' : '收藏'}
                        className="p-1.5 rounded-full hover:bg-rice-100 transition-all"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            favorites.has(artwork.id) ? 'text-cinnabar fill-cinnabar' : 'text-ink-400'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-sm text-ink-600 line-clamp-2">{artwork.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Artwork Detail Modal */}
        {selectedArtwork && (
          <div
            className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedArtwork(null)}
          >
            <div
              className="bg-rice-50 rounded-2xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
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
                    loading="lazy"
                    className={`w-full h-full object-contain max-h-[60vh] md:max-h-[80vh] transition-opacity duration-500 ${
                      imageLoadStates[selectedArtwork.id] === 'loaded' ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => handleImageLoad(selectedArtwork.id)}
                    onError={() => handleImageError(selectedArtwork.id)}
                  />
                )}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="px-2 py-1 bg-cinnabar text-white text-sm rounded-full">
                    {selectedArtwork.style}
                  </span>
                  <span className="px-2 py-1 bg-ink-900/80 text-white text-sm rounded-full">
                    {selectedArtwork.era}
                  </span>
                </div>
              </div>
              <div className="md:w-2/5 p-6 overflow-y-auto max-h-[40vh] md:max-h-[80vh]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-ink-900">{selectedArtwork.title}</h2>
                    {selectedArtwork.titleEn && (
                      <p className="text-sm text-ink-400 italic">{selectedArtwork.titleEn}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedArtwork(null)}
                    aria-label="关闭"
                    className="p-2 hover:bg-rice-100 rounded-full transition-all"
                  >
                    <X className="w-5 h-5 text-ink-700" />
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-ink-500">
                    <span className="font-medium text-ink-700">{selectedArtwork.artist}</span>
                    {selectedArtwork.artistEn && <span className="text-sm text-ink-400 ml-1">({selectedArtwork.artistEn})</span>}
                    <span className="mx-2">·</span>
                    {selectedArtwork.year}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-rice-50 rounded-lg p-3">
                    <p className="text-xs text-ink-500">风格</p>
                    <p className="text-sm font-medium text-ink-700">{selectedArtwork.style}</p>
                  </div>
                  <div className="bg-rice-50 rounded-lg p-3">
                    <p className="text-xs text-ink-500">时代</p>
                    <p className="text-sm font-medium text-ink-700">{selectedArtwork.era}</p>
                  </div>
                  {selectedArtwork.dimensions && (
                    <div className="bg-rice-50 rounded-lg p-3">
                      <p className="text-xs text-ink-500">尺寸</p>
                      <p className="text-sm font-medium text-ink-700">{selectedArtwork.dimensions}</p>
                    </div>
                  )}
                  {selectedArtwork.medium && (
                    <div className="bg-rice-50 rounded-lg p-3">
                      <p className="text-xs text-ink-500">材质</p>
                      <p className="text-sm font-medium text-ink-700">{selectedArtwork.medium}</p>
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">作品介绍</p>
                  <p className="text-sm text-ink-600 leading-relaxed">{selectedArtwork.description}</p>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">标签</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedArtwork.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 bg-ink-900/5 text-ink-700 text-sm rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-4 p-3 bg-rice-50 rounded-lg">
                  <p className="text-xs text-ink-500 mb-1">图片来源</p>
                  <p className="text-sm text-ink-700 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {selectedArtwork.source}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => toggleFavorite(selectedArtwork.id, selectedArtwork.title)}
                    aria-label={favorites.has(selectedArtwork.id) ? '取消收藏' : '收藏'}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all ${
                      favorites.has(selectedArtwork.id)
                        ? 'bg-cinnabar text-white'
                        : 'border-2 border-ink-200 text-ink-700 hover:border-cinnabar hover:text-cinnabar'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${favorites.has(selectedArtwork.id) ? 'fill-white' : ''}`} />
                    <span className="text-sm font-medium">
                      {favorites.has(selectedArtwork.id) ? '已收藏' : '收藏'}
                    </span>
                  </button>
                  {selectedArtwork.sourceUrl && (
                    <a
                      href={selectedArtwork.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-ink-200 text-ink-700 rounded-lg hover:border-ink-900 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm font-medium">查看原图</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}