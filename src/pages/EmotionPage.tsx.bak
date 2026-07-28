import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Sparkles, Loader2, Download, Share2, Sun, Moon, Wind, Droplets, Flame, Waves, Palette, Sliders, Layers, Copy, RefreshCw } from 'lucide-react';
import { generateEmotionCanvas, emotionPresets } from '../services/imageService';
import { useToast } from '../components/ToastProvider';

const emotionData: Record<string, {
  desc: string;
  scene: string;
  color: string;
  colorPalette: string[];
  icon: typeof Heart;
  keywords: string[];
  artForms: string[];
  musicMood: string;
}> = {
  '孤独': {
    desc: '空旷、留白、孤影',
    scene: '雪夜独行、月下孤舟、寒林独立',
    color: '#4a5568',
    colorPalette: ['#1a202c', '#4a5568', '#718096', '#a0aec0', '#cbd5e0', '#e2e8f0'],
    icon: Moon,
    keywords: ['孤寂', '清冷', '悠远', '静谧', '沉思'],
    artForms: ['水墨山水', '极简主义', '寒林图', '月夜'],
    musicMood: '舒缓、悠远、略带忧伤的钢琴与大提琴',
  },
  '希望': {
    desc: '破晓、绽放、温暖',
    scene: '黎明曙光、春天花朵、朝阳初升',
    color: '#d4af37',
    colorPalette: ['#744210', '#c05621', '#d69e2e', '#ecc94b', '#f6e05e', '#faf089'],
    icon: Sun,
    keywords: ['新生', '温暖', '光明', '憧憬', '生机'],
    artForms: ['朝霞图', '花卉静物', '春日田野', '金光山水'],
    musicMood: '温暖的弦乐、渐强的铜管，充满希望',
  },
  '宁静': {
    desc: '平和、清远、悠长',
    scene: '远山烟雨、湖面平镜、古寺禅意',
    color: '#2e5fa1',
    colorPalette: ['#0d4f4f', '#2b6cb0', '#4299e1', '#63b3ed', '#90cdf4', '#bee3f8'],
    icon: Wind,
    keywords: ['禅意', '悠远', '平和', '空灵', '自然'],
    artForms: ['青绿山水', '禅意画', '烟雨图', '平湖'],
    musicMood: '轻柔的竹笛、古筝与自然环境音',
  },
  '喜悦': {
    desc: '热烈、奔放、欢腾',
    scene: '花开时节、节庆场面、孩童嬉戏',
    color: '#c41e3a',
    colorPalette: ['#742a2a', '#c53030', '#e53e3e', '#fc8181', '#feb2b2', '#fed7d7'],
    icon: Flame,
    keywords: ['欢快', '热烈', '饱满', '生机', '欢腾'],
    artForms: ['工笔花鸟', '年画', '喜庆图', '繁花'],
    musicMood: '欢快的民乐合奏、节奏明快的鼓点',
  },
  '忧伤': {
    desc: '沉郁、含蓄、深远',
    scene: '秋日落叶、远山暮霭、雨中孤亭',
    color: '#5a6b8a',
    colorPalette: ['#2d3748', '#4a5568', '#5a6b8a', '#718096', '#a0aec0', '#cbd5e0'],
    icon: Droplets,
    keywords: ['愁绪', '深沉', '含蓄', '秋意', '思念'],
    artForms: ['秋景山水', '墨梅', '雨景图', '暮霭'],
    musicMood: '低沉的二胡、缓慢的古琴旋律',
  },
  '激情': {
    desc: '澎湃、炽烈、动感',
    scene: '烈火燎原、骏马奔腾、惊涛拍岸',
    color: '#e74c3c',
    colorPalette: ['#7f1d1d', '#c53030', '#e53e3e', '#f56565', '#fc8181', '#fed7d7'],
    icon: Waves,
    keywords: ['奔放', '力量', '动感', '炽烈', '磅礴'],
    artForms: ['泼墨山水', '奔马图', '海浪图', '火焰'],
    musicMood: '激昂的交响乐、强烈的节奏与铜管',
  },
};

const intensityLevels = [
  { value: 0.3, label: '淡', desc: '轻柔含蓄' },
  { value: 0.6, label: '中', desc: '平衡适中' },
  { value: 1.0, label: '浓', desc: '浓烈饱满' },
];

export default function EmotionPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [selectedEmotion, setSelectedEmotion] = useState('宁静');
  const [intensity, setIntensity] = useState(0.6);
  const [secondaryEmotion, setSecondaryEmotion] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const currentEmotion = emotionData[selectedEmotion];
  const secondaryEmotionData = secondaryEmotion ? emotionData[secondaryEmotion] : null;

  // 将当前情绪色板保存到 localStorage 并跳转到风格库
  const handleApplyToStyles = () => {
    const palette = {
      emotion: selectedEmotion,
      colorPalette: currentEmotion.colorPalette,
      intensity,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem('danqing-ai-emotion-palette', JSON.stringify(palette));
      toast.success('色板已保存，可在风格库查看');
      navigate('/styles?from=emotion');
    } catch (err) {
      console.error('保存色板失败:', err);
      toast.error('保存失败', '请稍后重试');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResults([]);
    try {
      const images = await generateEmotionCanvas(selectedEmotion + (secondaryEmotion ? `+${secondaryEmotion}` : ''));
      setResults(images);
      toast.success('情绪画布已生成', `共 ${images.length} 张参考图`);
    } catch (error) {
      console.error('生成失败:', error);
      toast.error('生成失败', '请检查网络后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `emotion-${selectedEmotion}-${index + 1}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 渐变色
  const getGradient = (colors: string[], intensity: number) => {
    const alpha = Math.floor(intensity * 255).toString(16).padStart(2, '0');
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[2]} 35%, ${colors[4]} 70%, ${colors[5]}${alpha} 100%)`;
  };

  // 混合色
  const intensityLabel = intensityLevels.find((l) => Math.abs(l.value - intensity) < 0.15)?.label || '中';

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-4">
            <Heart className="w-4 h-4 text-cinnabar" />
            <span className="text-sm text-ink-600">情绪画布</span>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-ink-900 mb-4">
            情感可视化 · 色彩语言
          </h1>
          <p className="text-ink-600 max-w-2xl mx-auto text-lg">
            把抽象情感转化为视觉语言，让内心感受化作可触可感的画面
            <br />
            <span className="text-sm text-ink-500">选择情绪 · 调节浓淡 · 组合心境 · 生成灵感</span>
          </p>
        </div>

        {/* Emotion Selection */}
        <div className="mb-8">
          <h2 className="font-serif text-xl font-bold text-ink-900 mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5 text-cinnabar" />
            选择主情绪
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {emotionPresets.map((emotion) => {
              const isSelected = selectedEmotion === emotion.name;
              const data = emotionData[emotion.name];
              const Icon = data?.icon || Heart;
              return (
                <button
                  key={emotion.id}
                  onClick={() => setSelectedEmotion(emotion.name)}
                  className={`group relative bg-rice-50 rounded-2xl p-6 shadow-card transition-all overflow-hidden ${
                    isSelected
                      ? 'ring-2 ring-cinnabar shadow-card-hover transform -translate-y-1'
                      : 'hover:shadow-card-hover hover:-translate-y-0.5'
                  }`}
                >
                  {isSelected && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ background: getGradient(data.colorPalette, 1) }}
                    />
                  )}
                  <div
                    className="w-full h-24 rounded-xl mb-4 flex items-center justify-center transition-all group-hover:scale-105 shadow-inner"
                    style={{ background: getGradient(data.colorPalette, 0.7) }}
                  >
                    <Icon className="w-10 h-10 text-white drop-shadow-lg" />
                  </div>
                  <p className="font-serif text-xl font-bold text-ink-900 mb-1">{emotion.name}</p>
                  <p className="text-xs text-ink-500 line-clamp-1">{data?.desc || ''}</p>
                  <div className="flex gap-0.5 mt-2">
                    {data?.colorPalette.slice(0, 5).map((c, i) => (
                      <div
                        key={i}
                        className="h-2 flex-1 rounded-full first:rounded-l-full last:rounded-r-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Intensity + Secondary Emotion */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Intensity Control */}
          <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
            <h3 className="font-serif text-lg font-bold text-ink-900 mb-4 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-cinnabar" />
              情绪浓度
            </h3>
            <div className="mb-6">
              <div className="flex justify-between mb-3">
                {intensityLevels.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setIntensity(level.value)}
                    className={`text-sm font-medium transition-all ${
                      Math.abs(intensity - level.value) < 0.15
                        ? 'text-cinnabar'
                        : 'text-ink-400 hover:text-ink-600'
                    }`}
                  >
                    {level.label} · {level.desc}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={intensity}
                onChange={(e) => setIntensity(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${currentEmotion.colorPalette[5]} 0%, ${currentEmotion.colorPalette[2]} 50%, ${currentEmotion.colorPalette[0]} 100%)`,
                }}
              />
              <p className="text-center text-sm text-ink-500 mt-2">
                当前浓度：{Math.round(intensity * 100)}%
              </p>
            </div>
            <div
              className="h-24 rounded-xl flex items-center justify-center transition-all"
              style={{ background: getGradient(currentEmotion.colorPalette, intensity) }}
            >
              <p className="text-white font-serif text-2xl font-bold drop-shadow-lg">
                {selectedEmotion} · {intensityLabel}
              </p>
            </div>
          </div>

          {/* Secondary Emotion (Mix) */}
          <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
            <h3 className="font-serif text-lg font-bold text-ink-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-cinnabar" />
              情绪叠加
              <span className="text-xs font-normal text-ink-400 ml-1">(可选)</span>
            </h3>
            <p className="text-sm text-ink-500 mb-4">
              选择第二种情绪进行叠加混合，创造更复杂的情感表达
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {emotionPresets.map((emotion) => {
                if (emotion.name === selectedEmotion) return null;
                const isSelected = secondaryEmotion === emotion.name;
                const data = emotionData[emotion.name];
                return (
                  <button
                    key={emotion.id}
                    onClick={() => setSecondaryEmotion(isSelected ? null : emotion.name)}
                    className={`p-3 rounded-xl border-2 transition-all text-center ${
                      isSelected
                        ? 'border-cinnabar bg-cinnabar/5'
                        : 'border-transparent bg-rice-100 hover:bg-rice-200'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full mx-auto mb-1 shadow"
                      style={{ backgroundColor: data?.color || emotion.color }}
                    />
                    <p className="text-sm font-medium text-ink-700">{emotion.name}</p>
                  </button>
                );
              })}
            </div>
            {secondaryEmotion && secondaryEmotionData && (
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 h-16 rounded-l-xl flex items-center justify-center"
                    style={{ background: getGradient(currentEmotion.colorPalette, 0.8) }}
                  >
                    <span className="text-white font-bold drop-shadow">{selectedEmotion}</span>
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 z-10">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-cinnabar font-bold text-sm">+</span>
                    </div>
                  </div>
                  <div
                    className="flex-1 h-16 rounded-r-xl flex items-center justify-center"
                    style={{ background: getGradient(secondaryEmotionData.colorPalette, 0.8) }}
                  >
                    <span className="text-white font-bold drop-shadow">{secondaryEmotion}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSecondaryEmotion(null)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow flex items-center justify-center hover:bg-cinnabar hover:text-white transition-all"
                >
                  <span className="text-xs">×</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Emotion Details */}
        <div className="bg-rice-50 rounded-2xl p-6 md:p-8 shadow-card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="md:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ background: getGradient(currentEmotion.colorPalette, 1) }}
                >
                  {(() => {
                    const Icon = currentEmotion.icon || Heart;
                    return <Icon className="w-7 h-7 text-white" />;
                  })()}
                </div>
                <div>
                  <h3 className="font-serif text-3xl font-bold text-ink-900">
                    {selectedEmotion}
                    {secondaryEmotion && (
                      <span className="text-ink-300 mx-2">×</span>
                    )}
                    {secondaryEmotion && (
                      <span className="text-ink-700">{secondaryEmotion}</span>
                    )}
                  </h3>
                  <p className="text-ink-500">{currentEmotion.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-rice-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">代表场景</p>
                  <p className="text-sm text-ink-600">{currentEmotion.scene}</p>
                </div>
                <div className="bg-rice-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-ink-700 mb-2">音乐意境</p>
                  <p className="text-sm text-ink-600">{currentEmotion.musicMood}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-ink-700 mb-2">关键词联想</p>
                <div className="flex flex-wrap gap-2">
                  {currentEmotion.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-3 py-1 text-sm rounded-full"
                      style={{
                        backgroundColor: `${currentEmotion.color}15`,
                        color: currentEmotion.color,
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-ink-700 mb-2">艺术表现形式</p>
                <div className="flex flex-wrap gap-2">
                  {currentEmotion.artForms.map((form) => (
                    <span
                      key={form}
                      className="px-3 py-1 text-sm bg-ink-900/5 text-ink-600 rounded-full"
                    >
                      {form}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col items-center justify-center">
              <div
                className="w-48 h-48 rounded-full shadow-2xl mb-4"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${currentEmotion.colorPalette[3]} 0%, ${currentEmotion.colorPalette[1]} 50%, ${currentEmotion.colorPalette[0]} 100%)`,
                  opacity: 0.3 + intensity * 0.7,
                }}
              />
              <div className="w-full max-w-xs">
                <p className="text-sm font-medium text-ink-700 mb-2 text-center">色板</p>
                <div className="flex gap-1">
                  {currentEmotion.colorPalette.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1 h-10 first:rounded-l-lg last:rounded-r-lg shadow-sm cursor-pointer hover:scale-110 transition-transform group relative"
                      style={{ backgroundColor: c }}
                      onClick={() => navigator.clipboard?.writeText(c)}
                      title={`${c} 点击复制`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Copy className="w-3 h-3 text-white/70" />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-ink-400 text-center mt-2">点击色块复制色值</p>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="text-center mb-8">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-3 px-12 py-4 rounded-xl transition-all disabled:opacity-50 transform hover:scale-105 shadow-card text-white font-serif text-lg"
            style={{ background: getGradient(currentEmotion.colorPalette, 1) }}
          >
            {generating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>AI 创作中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-6 h-6" />
                <span>生成「{selectedEmotion}{secondaryEmotion ? `·${secondaryEmotion}` : ''}」画面</span>
              </>
            )}
          </button>
          <p className="text-sm text-ink-400 mt-3">
            生成 4 张参考画面 · 约 3-5 秒
          </p>
        </div>

        {/* Loading State */}
        {generating && (
          <div className="bg-rice-50 rounded-2xl p-12 shadow-card text-center mb-8">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div
                className="absolute inset-0 rounded-full animate-pulse"
                style={{ background: getGradient(currentEmotion.colorPalette, 0.3) }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-cinnabar animate-spin" />
              </div>
            </div>
            <h3 className="font-serif text-xl font-semibold text-ink-700 mb-2">
              AI 正在描绘「{selectedEmotion}」
            </h3>
            <p className="text-ink-500 mb-4">将抽象情感转化为视觉语言...</p>
            <div className="flex justify-center gap-1">
              {currentEmotion.keywords.map((kw, i) => (
                <span
                  key={kw}
                  className="px-2 py-1 text-xs rounded-full animate-pulse"
                  style={{
                    backgroundColor: `${currentEmotion.color}20`,
                    color: currentEmotion.color,
                    animationDelay: `${i * 0.2}s`,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-xl font-bold text-ink-900 flex items-center gap-2">
                <Heart className="w-5 h-5 text-cinnabar" />
                「{selectedEmotion}」的视觉表达
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApplyToStyles}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border-2 rounded-lg transition-all hover:bg-cinnabar hover:text-white hover:border-cinnabar"
                  style={{ borderColor: `${currentEmotion.color}40`, color: currentEmotion.color }}
                  title="应用到风格调色板"
                >
                  <Palette className="w-4 h-4" />
                  应用到风格调色板
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 text-sm text-ink-500 hover:text-cinnabar transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  换一批
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {results.map((url, index) => (
                <div
                  key={index}
                  className="bg-rice-50 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all group"
                >
                  <div className="aspect-square overflow-hidden relative">
                    <img
                      src={url}
                      alt={`${selectedEmotion}画面 ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div
                      className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs text-white"
                      style={{ backgroundColor: currentEmotion.color }}
                    >
                      {selectedEmotion} · {index + 1}
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink-700 text-sm">AI 情绪参考画面</p>
                      <p className="text-xs text-ink-500">第 {index + 1} 版</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(url, index)}
                        className="p-2 bg-ink-900/5 text-ink-700 rounded-lg hover:bg-cinnabar hover:text-white transition-all"
                        title="下载"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 bg-ink-900/5 text-ink-700 rounded-lg hover:bg-ink-900 hover:text-rice-100 transition-all"
                        title="分享"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {results.length === 0 && !generating && (
          <div className="bg-rice-50 rounded-2xl p-12 shadow-card text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: getGradient(currentEmotion.colorPalette, 0.2) }}
            >
              <Palette className="w-10 h-10" style={{ color: currentEmotion.color }} />
            </div>
            <h3 className="font-serif text-xl font-semibold text-ink-700 mb-2">
              调整情绪，开始创作
            </h3>
            <p className="text-ink-500 max-w-md mx-auto">
              选择你的主情绪，调节浓度，甚至可以叠加第二种情绪
              <br />
              让 AI 为你生成独一无二的情感视觉表达
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
