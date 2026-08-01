import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Heart, Upload, Download, Loader2, Sparkles, X, Plus, Layout, Palette,
  Layers, Wand2, MapPin, Zap, Shuffle, Settings2, ChevronRight, Check,
  Grid3X3, ImageIcon, Info, ArrowRight, Bookmark, TrendingUp, Target,
  Lightbulb, ChevronDown, ChevronUp, RefreshCw, Save
} from 'lucide-react';
import {
  fuseStyles, fuseMethods, fuseIntensities, fusePresets,
  buildFusePrompt, generateFusionAnalysis,
  getStyleById, getMethodById, getIntensityById,
  type FuseStyle, type FuseMethod, type FuseIntensity, type FusionAnalysis,
} from '../services/fuseStandards';
import { generateImage } from '../services/imageService';
import { type ArtworkItem } from '../services/artworksDatabase';
import { getBuiltinArtworkItems } from '../services/materialService';
import { useToast } from '../components/ToastProvider';
import { saveSavedMaterial } from '../services/data-service';
import EmptyState from '../components/EmptyState';

const methodIconMap: Record<string, typeof Layout> = {
  composition: Layout,
  'color-transfer': Palette,
  'element-fusion': Layers,
  'style-transformation': Wand2,
  'hybrid-landscape': MapPin,
  'mood-blending': Heart,
};

interface FuseResult {
  id: string;
  url: string;
  prompt: string;
  analysis: FusionAnalysis;
  style: FuseStyle;
  method: FuseMethod;
  intensity: FuseIntensity;
}

export default function FusePage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [artwork1, setArtwork1] = useState<ArtworkItem | null>(null);
  const [artwork2, setArtwork2] = useState<ArtworkItem | null>(null);
  const [customImage1, setCustomImage1] = useState<string>('');
  const [customImage2, setCustomImage2] = useState<string>('');
  const [fusing, setFusing] = useState(false);
  const [results, setResults] = useState<FuseResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [showArtworkPicker, setShowArtworkPicker] = useState<1 | 2 | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState<string>('all');
  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  const [selectedStyle, setSelectedStyle] = useState<FuseStyle>(fuseStyles[0]);
  const [selectedMethod, setSelectedMethod] = useState<FuseMethod>(fuseMethods[2]);
  const [selectedIntensity, setSelectedIntensity] = useState<FuseIntensity>(fuseIntensities[1]);
  const [showSettings, setShowSettings] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [resultVariations, setResultVariations] = useState(3);

  const image1 = artwork1?.imageUrl || customImage1;
  const image2 = artwork2?.imageUrl || customImage2;

  // 接收来自素材库的 URL 参数：?src=material&imageUrl=xxx
  useEffect(() => {
    const src = searchParams.get('src');
    const imageUrl = searchParams.get('imageUrl');
    if (src === 'material' && imageUrl) {
      setCustomImage1(imageUrl);
      setArtwork1(null);
      setResults([]);
      toast.info('已从素材库载入作品1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存当前嫁接结果到素材库（通过 data-service 异步落库）
  const handleSaveToMaterials = async () => {
    const result = results[selectedResultIndex];
    if (!result) return;
    try {
      await saveSavedMaterial({
        imageUrl: result.url,
        title: `嫁接作品-${new Date().toLocaleDateString('zh-CN')}`,
        source: 'fuse',
      });
      toast.success('已保存到素材库');
    } catch (err) {
      console.error('保存到素材库失败:', err);
      toast.error('保存失败', '请稍后重试');
    }
  };

  const handleFileSelect = useCallback((file: File, slot: 1 | 2) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (slot === 1) {
        setCustomImage1(url);
        setArtwork1(null);
      } else {
        setCustomImage2(url);
        setArtwork2(null);
      }
      setResults([]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file, slot);
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>, slot: 1 | 2) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file, slot);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleArtworkSelect = (artwork: ArtworkItem, slot: 1 | 2) => {
    if (slot === 1) {
      setArtwork1(artwork);
      setCustomImage1('');
    } else {
      setArtwork2(artwork);
      setCustomImage2('');
    }
    setShowArtworkPicker(null);
    setResults([]);
  };

  const applyPreset = (presetId: string) => {
    const preset = fusePresets.find((p) => p.id === presetId);
    if (!preset) return;
    const style = getStyleById(preset.styleId);
    const method = getMethodById(preset.methodId);
    const intensity = getIntensityById(preset.intensityId);
    if (style) setSelectedStyle(style);
    if (method) setSelectedMethod(method);
    if (intensity) setSelectedIntensity(intensity);
  };

  const handleFuse = async () => {
    if (!image1 || !image2) {
      toast.warning('请选择两张作品', '需要两张作品才能进行灵感嫁接');
      return;
    }
    setFusing(true);
    setResults([]);
    setSelectedResultIndex(0);

    try {
      const prompt = buildFusePrompt(
        selectedStyle,
        selectedMethod,
        selectedIntensity,
        artwork1,
        artwork2
      );

      const analysis = generateFusionAnalysis(
        selectedStyle,
        selectedMethod,
        selectedIntensity,
        artwork1,
        artwork2
      );

      const sizes = ['landscape_4_3', 'portrait_4_3', 'square'];
      const newResults: FuseResult[] = [];

      for (let i = 0; i < resultVariations; i++) {
        const variationPrompt = `${prompt} variation ${i + 1}, ${['dramatic lighting', 'soft ambient light', 'golden hour glow'][i % 3]}`;
        const url = generateImage(variationPrompt, sizes[i % sizes.length]);
        newResults.push({
          id: `result-${Date.now()}-${i}`,
          url,
          prompt: variationPrompt,
          analysis,
          style: selectedStyle,
          method: selectedMethod,
          intensity: selectedIntensity,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      setResults(newResults);
      toast.success('灵感融合完成', `生成 ${newResults.length} 张融合作品`);
    } catch (error) {
      console.error('灵感融合失败:', error);
      toast.error('灵感融合失败', '请检查网络或重试');
    } finally {
      setFusing(false);
    }
  };

  const handleDownload = () => {
    const result = results[selectedResultIndex];
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `fused-${result.style.id}-${Date.now()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClear = (slot: 1 | 2) => {
    if (slot === 1) {
      setArtwork1(null);
      setCustomImage1('');
    } else {
      setArtwork2(null);
      setCustomImage2('');
    }
    setResults([]);
  };

  const filteredArtworks = useMemo(() => {
    let results = getBuiltinArtworkItems();
    if (pickerCategory !== 'all') {
      results = results.filter((a) => a.category === pickerCategory);
    }
    if (pickerSearch) {
      const kw = pickerSearch.toLowerCase();
      results = results.filter(
        (a) =>
          a.title.includes(pickerSearch) ||
          a.titleEn?.toLowerCase().includes(kw) ||
          a.artist.includes(pickerSearch) ||
          a.artistEn?.toLowerCase().includes(kw) ||
          a.tags.some((t) => t.includes(pickerSearch))
      );
    }
    return results.slice(0, 50);
  }, [pickerSearch, pickerCategory]);

  const renderUploadBox = (slot: 1 | 2, artwork: ArtworkItem | null, customImg: string, label: string) => {
    const inputRef = slot === 1 ? fileInput1Ref : fileInput2Ref;
    const img = artwork?.imageUrl || customImg;
    return (
      <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold text-ink-900">
            作品 {slot} · {label}
          </h3>
          <button
            onClick={() => setShowArtworkPicker(slot)}
            className="flex items-center gap-1 text-sm text-cinnabar hover:underline"
          >
            <Grid3X3 className="w-4 h-4" />
            从素材库选
          </button>
        </div>
        {!img ? (
          <div
            className="border-2 border-dashed border-ink-300 rounded-xl p-8 text-center cursor-pointer hover:border-cinnabar hover:bg-cinnabar/5 transition-all aspect-[4/3] flex flex-col items-center justify-center group"
            onDrop={(e) => handleDrop(e, slot)}
            onDragOver={handleDragOver}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(e, slot)}
              className="hidden"
            />
            <div className="w-16 h-16 bg-ink-900/5 rounded-full flex items-center justify-center mb-3 group-hover:bg-cinnabar/10 transition-all">
              <Upload className="w-8 h-8 text-ink-500 group-hover:text-cinnabar transition-all" />
            </div>
            <p className="font-medium text-ink-700 mb-1">点击或拖拽上传</p>
            <p className="text-sm text-ink-500">支持 JPG、PNG 格式</p>
            <p className="text-xs text-ink-400 mt-2">或点击上方「从素材库选」</p>
          </div>
        ) : (
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-ink-100 group">
            <img
              src={img}
              alt={`作品 ${slot}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute top-3 left-3">
              <span className="px-2 py-1 bg-cinnabar/90 text-white text-xs rounded-full backdrop-blur-sm">
                作品 {slot}
              </span>
            </div>
            {artwork && (
              <div className="absolute bottom-3 left-3 right-3 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="font-medium text-sm truncate">{artwork.title}</p>
                <p className="text-xs text-white/80 truncate">{artwork.artist} · {artwork.era}</p>
              </div>
            )}
            <button
              onClick={() => handleClear(slot)}
              className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm text-ink-700 rounded-full hover:bg-cinnabar hover:text-white transition-all opacity-0 group-hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSettingsPanel = () => (
    <div className="bg-rice-50 rounded-2xl p-6 shadow-card mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-serif text-lg font-bold text-ink-900 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-cinnabar" />
          融合标准设置
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="text-sm text-ink-500 hover:text-cinnabar"
        >
          收起
        </button>
      </div>

      {/* Presets */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-cinnabar" />
            <p className="font-medium text-ink-700">创意预设</p>
            <span className="text-xs text-ink-400">一键应用专业融合方案</span>
          </div>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="text-xs text-cinnabar hover:underline"
          >
            {showPresets ? '收起' : '展开'}
          </button>
        </div>
        {showPresets && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {fusePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className="p-3 rounded-xl bg-rice-50 hover:bg-rice-100 border-2 border-transparent hover:border-cinnabar/30 transition-all text-left group"
              >
                <div className="text-2xl mb-2">{preset.icon}</div>
                <p className="font-medium text-sm text-ink-900 group-hover:text-cinnabar transition-colors">
                  {preset.name}
                </p>
                <p className="text-xs text-ink-500 line-clamp-1">{preset.description}</p>
                <p className="text-xs text-cinnabar/70 mt-1">{preset.useCase}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Style */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-ink-500" />
          <p className="font-medium text-ink-700">嫁接风格</p>
          <span className="text-xs text-ink-400">选择融合后的艺术风格</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {fuseStyles.map((style) => (
            <button
              key={style.id}
              onClick={() => setSelectedStyle(style)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedStyle.id === style.id
                  ? 'border-cinnabar bg-cinnabar/5'
                  : 'border-transparent bg-rice-50 hover:bg-rice-100'
              }`}
            >
              <div
                className="w-full h-10 rounded-lg mb-2 shadow-sm"
                style={{ backgroundColor: style.color }}
              />
              <p className="font-medium text-sm text-ink-900">{style.name}</p>
              <p className="text-xs text-ink-500 line-clamp-1">{style.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Method */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shuffle className="w-4 h-4 text-ink-500" />
          <p className="font-medium text-ink-700">融合方法</p>
          <span className="text-xs text-ink-400">选择两种作品如何结合</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fuseMethods.map((method) => {
            const Icon = methodIconMap[method.id] || Layers;
            const isSelected = selectedMethod.id === method.id;
            return (
              <button
                key={method.id}
                onClick={() => setSelectedMethod(method)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-cinnabar bg-cinnabar/5'
                    : 'border-transparent bg-rice-50 hover:bg-rice-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-cinnabar text-white' : 'bg-ink-900/10 text-ink-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="font-medium text-sm text-ink-900">{method.name}</p>
                </div>
                <p className="text-xs text-ink-500 line-clamp-2">{method.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Intensity */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-ink-500" />
          <p className="font-medium text-ink-700">融合强度</p>
          <span className="text-xs text-ink-400">控制两种风格的混合程度</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {fuseIntensities.map((intensity) => {
            const isSelected = selectedIntensity.id === intensity.id;
            return (
              <button
                key={intensity.id}
                onClick={() => setSelectedIntensity(intensity)}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  isSelected
                    ? 'border-cinnabar bg-cinnabar/5'
                    : 'border-transparent bg-rice-50 hover:bg-rice-100'
                }`}
              >
                <div className="flex justify-center gap-0.5 mb-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`w-2 h-6 rounded-full transition-all ${
                        i <= Math.round(intensity.value * 4)
                          ? isSelected ? 'bg-cinnabar' : 'bg-ink-500'
                          : 'bg-ink-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="font-medium text-sm text-ink-900">{intensity.name}</p>
                <p className="text-xs text-ink-500">{intensity.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Variations */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-ink-500" />
          <p className="font-medium text-ink-700">生成数量</p>
          <span className="text-xs text-ink-400">每次融合生成的方案数</span>
        </div>
        <div className="flex gap-2">
          {[1, 3, 5].map((num) => (
            <button
              key={num}
              onClick={() => setResultVariations(num)}
              className={`px-4 py-2 rounded-lg border-2 transition-all ${
                resultVariations === num
                  ? 'border-cinnabar bg-cinnabar/5 text-cinnabar'
                  : 'border-transparent bg-rice-50 text-ink-600 hover:bg-rice-100'
              }`}
            >
              {num} 张
            </button>
          ))}
        </div>
      </div>

      {/* Method Process Detail */}
      <div className="p-4 bg-rice-50 rounded-xl">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-cinnabar flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-ink-700 text-sm mb-2">
              {selectedMethod.name} · 融合流程
            </p>
            <ol className="space-y-1">
              {selectedMethod.process.map((step, i) => (
                <li key={i} className="text-xs text-ink-600 flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-cinnabar/20 text-cinnabar flex-shrink-0 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalysisPanel = (result: FuseResult) => (
    <div className="bg-rice-50 rounded-2xl p-6 shadow-card mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg font-bold text-ink-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-cinnabar" />
          融合分析报告
        </h3>
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="text-sm text-ink-500 hover:text-cinnabar flex items-center gap-1"
        >
          {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showAnalysis ? '收起' : '展开'}
        </button>
      </div>

      {showAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Extracted Elements */}
          <div className="space-y-4">
            <div className="p-4 bg-rice-50 rounded-xl">
              <p className="font-medium text-ink-700 text-sm mb-3 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-cinnabar" />
                提取元素 · 作品A
              </p>
              <ul className="space-y-2">
                {result.analysis.extractedElementsA.map((el, i) => (
                  <li key={i} className="text-xs text-ink-600 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cinnabar/40 mt-1.5 flex-shrink-0" />
                    {el}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-rice-50 rounded-xl">
              <p className="font-medium text-ink-700 text-sm mb-3 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-cinnabar" />
                提取元素 · 作品B
              </p>
              <ul className="space-y-2">
                {result.analysis.extractedElementsB.map((el, i) => (
                  <li key={i} className="text-xs text-ink-600 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cinnabar/40 mt-1.5 flex-shrink-0" />
                    {el}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Fusion Highlights */}
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-cinnabar/5 to-transparent rounded-xl">
              <p className="font-medium text-ink-700 text-sm mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cinnabar" />
                融合亮点
              </p>
              <ul className="space-y-2">
                {result.analysis.fusionHighlights.map((h, i) => (
                  <li key={i} className="text-xs text-ink-600 flex items-start gap-2">
                    <Check className="w-4 h-4 text-cinnabar flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-rice-50 rounded-xl">
              <p className="font-medium text-ink-700 text-sm mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-cinnabar" />
                创意价值
              </p>
              <p className="text-xs text-ink-600 leading-relaxed">
                {result.analysis.creativeValue}
              </p>
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-4">
            {[
              { label: '风格兼容性', value: result.analysis.styleCompatibility, icon: Palette },
              { label: '主题一致性', value: result.analysis.themeConsistency, icon: Target },
              { label: '创新指数', value: result.analysis.innovationScore, icon: TrendingUp },
            ].map((metric) => (
              <div key={metric.label} className="p-4 bg-rice-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-ink-700 flex items-center gap-2">
                    <metric.icon className="w-4 h-4 text-cinnabar" />
                    {metric.label}
                  </p>
                  <span className="font-bold text-cinnabar">{metric.value}%</span>
                </div>
                <div className="w-full h-2 bg-ink-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${metric.value}%`,
                      background: `linear-gradient(90deg, ${result.style.color}, #c41e3a)`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-4">
            <Heart className="w-4 h-4 text-cinnabar" />
            <span className="text-sm text-ink-600">灵感嫁接</span>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-ink-900 mb-4">
            创意融合 · 1+1&gt;2
          </h1>
          <p className="text-ink-600 max-w-2xl mx-auto text-lg">
            选择两件作品，设定融合标准，AI 将提取各自创意元素进行嫁接
            <br />
            <span className="text-sm text-ink-500">
              8种嫁接风格 · 6种融合方法 · 4级融合强度 · 240种创意组合
            </span>
          </p>
        </div>

        {/* Settings Toggle */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-full shadow-card hover:shadow-card-hover transition-all"
          >
            <Settings2 className="w-4 h-4 text-cinnabar" />
            <span className="font-medium text-ink-700">
              {showSettings ? '收起标准设置' : '融合标准设置'}
            </span>
            <span className="px-2 py-0.5 bg-cinnabar/10 text-cinnabar text-xs rounded-full">
              {selectedStyle.name} + {selectedMethod.name}
            </span>
            <ChevronRight className={`w-4 h-4 text-ink-400 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && renderSettingsPanel()}

        {/* Upload Two Sketches */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {renderUploadBox(1, artwork1, customImage1, '主体作品')}
          {renderUploadBox(2, artwork2, customImage2, '嫁接元素')}
        </div>

        {/* Fusion Formula */}
        <div className="bg-rice-50 rounded-2xl p-6 shadow-card mb-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 bg-rice-100 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                {image1 ? (
                  <img
                    src={image1}
                    alt="作品1"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-ink-300" />
                )}
              </div>
              <div>
                <span className="text-ink-400 text-sm">作品A</span>
                {artwork1 && (
                  <p className="text-xs text-ink-500 truncate max-w-[100px]">{artwork1.title}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-cinnabar/10 rounded-full flex items-center justify-center">
                <Plus className="w-4 h-4 text-cinnabar" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-16 h-16 bg-rice-100 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                {image2 ? (
                  <img
                    src={image2}
                    alt="作品2"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-ink-300" />
                )}
              </div>
              <div>
                <span className="text-ink-400 text-sm">作品B</span>
                {artwork2 && (
                  <p className="text-xs text-ink-500 truncate max-w-[100px]">{artwork2.title}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ArrowRight className="w-6 h-6 text-cinnabar" />
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: selectedStyle.color }}
              >
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-medium text-ink-700 text-sm">{selectedStyle.name}</p>
                <p className="text-xs text-ink-400">{selectedMethod.name} · {selectedIntensity.name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fuse Button */}
        {image1 && image2 && results.length === 0 && !fusing && (
          <div className="text-center mb-8">
            <button
              onClick={handleFuse}
              disabled={fusing}
              className="inline-flex items-center gap-3 px-12 py-4 bg-gradient-to-r from-cinnabar to-stone text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-50 transform hover:scale-105 shadow-card"
            >
              <Sparkles className="w-6 h-6" />
              <span className="font-serif text-lg">开始灵感嫁接</span>
            </button>
          </div>
        )}

        {/* Process Animation */}
        {fusing && (
          <div className="bg-rice-50 rounded-2xl p-12 shadow-card text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
              <div className="w-20 h-20 rounded-xl overflow-hidden shadow">
                <img
                  src={image1}
                  alt="作品1"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <Plus className="w-8 h-8 text-cinnabar" />
              <div className="w-20 h-20 rounded-xl overflow-hidden shadow">
                <img
                  src={image2}
                  alt="作品2"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="font-serif text-2xl text-cinnabar">=</div>
              <div className="w-20 h-20 border-2 border-dashed border-cinnabar rounded-xl flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-cinnabar animate-spin" />
              </div>
            </div>
            <h3 className="font-serif text-xl font-semibold text-ink-700 mb-2">
              AI 正在嫁接创意
            </h3>
            <p className="text-ink-500 mb-4">
              以「{selectedStyle.name}」风格，通过「{selectedMethod.name}」方法进行融合...
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {selectedStyle.characteristics.map((c, i) => (
                <span
                  key={c}
                  className="px-3 py-1 text-xs rounded-full animate-pulse"
                  style={{
                    backgroundColor: `${selectedStyle.color}15`,
                    color: selectedStyle.color,
                    animationDelay: `${i * 0.15}s`,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <h2 className="font-serif text-xl font-bold text-ink-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cinnabar" />
                嫁接成果
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-3 py-1 text-xs rounded-full text-white"
                  style={{ backgroundColor: results[selectedResultIndex].style.color }}
                >
                  {results[selectedResultIndex].style.name}
                </span>
                <span className="px-3 py-1 text-xs rounded-full bg-rice-100 text-ink-600">
                  {results[selectedResultIndex].method.name}
                </span>
                <span className="px-3 py-1 text-xs rounded-full bg-rice-100 text-ink-600">
                  {results[selectedResultIndex].intensity.name}
                </span>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-ink-900 text-rice-100 rounded-lg hover:bg-cinnabar transition-all ml-2"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-sm font-medium">下载</span>
                </button>
                <button
                  onClick={handleSaveToMaterials}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-cinnabar/40 text-cinnabar rounded-lg hover:bg-cinnabar hover:text-white transition-all"
                  title="保存到素材库"
                >
                  <Bookmark className="w-4 h-4" />
                  <span className="text-sm font-medium">保存到素材库</span>
                </button>
                <button
                  onClick={handleFuse}
                  disabled={fusing}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-ink-200 text-ink-700 rounded-lg hover:border-cinnabar hover:text-cinnabar transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${fusing ? 'animate-spin' : ''}`} />
                  <span className="text-sm font-medium">重新生成</span>
                </button>
              </div>
            </div>

            {/* Main Result */}
            <div className="bg-ink-900 rounded-xl overflow-hidden flex items-center justify-center min-h-[400px]">
              <img
                src={results[selectedResultIndex].url}
                alt="融合结果"
                className="w-full max-h-[600px] object-contain"
              />
            </div>

            {/* Variations Thumbnails */}
            {results.length > 1 && (
              <div className="mt-4">
                <p className="text-sm text-ink-500 mb-2">其他方案</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {results.map((result, i) => (
                    <button
                      key={result.id}
                      onClick={() => setSelectedResultIndex(i)}
                      className={`flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedResultIndex === i
                          ? 'border-cinnabar ring-2 ring-cinnabar/30'
                          : 'border-transparent hover:border-ink-300'
                      }`}
                    >
                      <img
                        src={result.url}
                        alt={`方案 ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Panel */}
            {renderAnalysisPanel(results[selectedResultIndex])}

            <div className="mt-6 flex justify-center gap-4 flex-wrap">
              <button
                onClick={handleFuse}
                disabled={fusing}
                className="inline-flex items-center gap-2 px-6 py-2.5 border-2 border-ink-200 text-ink-700 rounded-lg hover:border-cinnabar hover:text-cinnabar transition-all"
              >
                <Shuffle className="w-4 h-4" />
                <span className="text-sm font-medium">换一批</span>
              </button>
              <button
                onClick={() => setResults([])}
                className="inline-flex items-center gap-2 px-6 py-2.5 border-2 border-ink-200 text-ink-700 rounded-lg hover:border-cinnabar hover:text-cinnabar transition-all"
              >
                <Save className="w-4 h-4" />
                <span className="text-sm font-medium">保存到收藏</span>
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!image1 && !image2 && results.length === 0 && !fusing && (
          <div className="bg-rice-50 rounded-2xl shadow-card">
            <EmptyState
              icon={Sparkles}
              title="选择两张作品开始融合"
              desc="从素材库或历史记录中选择图片"
            />
          </div>
        )}

        {/* Artwork Picker Modal */}
        {showArtworkPicker && (
          <div
            className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowArtworkPicker(null)}
          >
            <div
              className="bg-rice-50 rounded-2xl overflow-hidden max-w-5xl w-full max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold text-ink-900">
                  从素材库选择作品 {showArtworkPicker}
                </h3>
                <button
                  onClick={() => setShowArtworkPicker(null)}
                  className="p-2 hover:bg-rice-100 rounded-full transition-all"
                >
                  <X className="w-5 h-5 text-ink-700" />
                </button>
              </div>
              <div className="p-4 border-b border-ink-100 space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="搜索作品名称、画家、标签..."
                    className="w-full px-4 py-2 pl-10 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cinnabar/30 focus:border-cinnabar"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'painting', 'design', 'product', 'sculpture'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setPickerCategory(cat)}
                      className={`px-3 py-1 text-sm rounded-full transition-all ${
                        pickerCategory === cat
                          ? 'bg-cinnabar text-white'
                          : 'bg-rice-100 text-ink-600 hover:bg-rice-200'
                      }`}
                    >
                      {cat === 'all' ? '全部' : cat === 'painting' ? '绘画' : cat === 'design' ? '设计' : cat === 'product' ? '产品' : '雕塑'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredArtworks.map((artwork) => (
                    <button
                      key={artwork.id}
                      onClick={() => handleArtworkSelect(artwork, showArtworkPicker)}
                      className="bg-rice-50 rounded-lg overflow-hidden hover:ring-2 hover:ring-cinnabar transition-all text-left group"
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-ink-100">
                        <img
                          src={artwork.imageUrl}
                          alt={artwork.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-sm font-medium text-ink-900 truncate">{artwork.title}</p>
                        <p className="text-xs text-ink-500 truncate">{artwork.artist}</p>
                        <p className="text-xs text-cinnabar/70 truncate">{artwork.style} · {artwork.era}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
