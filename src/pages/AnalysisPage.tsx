import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Eye, Palette, Sparkles, CheckCircle2, Loader2, ArrowRight, PenTool, Layers, Box, Brush, Download, Share2, Cpu, Cloud, Zap, Type, Gem, Settings, Move } from 'lucide-react';
import type { AnalysisResult, PaintingAnalysis, DesignAnalysis, ProductAnalysis, SculptureAnalysis } from '../types';
import { saveToHistory } from '../services/mockData';
import HeatmapCanvas from '../components/HeatmapCanvas';
import { smartAnalyze, type AnalysisDecision } from '../services/smartAnalysisEngine';

type Step = 'upload' | 'analyzing' | 'result';
type ArtTypeLocal = 'painting' | 'design' | 'product' | 'sculpture';

const artTypes: { id: ArtTypeLocal; name: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: 'painting', name: '绘画', icon: Brush, desc: '油画、水彩、素描、国画等' },
  { id: 'design', name: '设计', icon: PenTool, desc: '视觉传达、平面设计、UI设计等' },
  { id: 'product', name: '产品设计', icon: Box, desc: '工业设计、产品造型、家具设计等' },
  { id: 'sculpture', name: '雕塑', icon: Layers, desc: '雕塑、陶艺、装置艺术等' },
];

const ANALYSIS_CONFIG: Record<ArtTypeLocal, { dimensions: { label: string; icon: React.ComponentType<{ className?: string }>; color: string; barColor: string }[] }> = {
  painting: {
    dimensions: [
      { label: '构图分析', icon: Eye, color: 'text-cinnabar', barColor: 'bg-cinnabar' },
      { label: '色彩诊断', icon: Palette, color: 'text-stone', barColor: 'bg-stone' },
      { label: '笔触技法', icon: PenTool, color: 'text-gold', barColor: 'bg-gold' },
    ],
  },
  design: {
    dimensions: [
      { label: '视觉层次', icon: Eye, color: 'text-cinnabar', barColor: 'bg-cinnabar' },
      { label: '排版诊断', icon: Type, color: 'text-stone', barColor: 'bg-stone' },
      { label: '色彩应用', icon: Palette, color: 'text-gold', barColor: 'bg-gold' },
    ],
  },
  product: {
    dimensions: [
      { label: '形态分析', icon: Box, color: 'text-cinnabar', barColor: 'bg-cinnabar' },
      { label: '材质表现', icon: Gem, color: 'text-stone', barColor: 'bg-stone' },
      { label: '功能表达', icon: Settings, color: 'text-gold', barColor: 'bg-gold' },
    ],
  },
  sculpture: {
    dimensions: [
      { label: '空间构成', icon: Box, color: 'text-cinnabar', barColor: 'bg-cinnabar' },
      { label: '形体语言', icon: Move, color: 'text-stone', barColor: 'bg-stone' },
      { label: '材料语言', icon: Gem, color: 'text-gold', barColor: 'bg-gold' },
    ],
  },
};

function getScoreBg(score: number) {
  if (score >= 85) return 'bg-green-600';
  if (score >= 70) return 'bg-gold';
  return 'bg-cinnabar';
}

// 类型守卫
function isPainting(dims: AnalysisResult['dimensions']): dims is PaintingAnalysis {
  return dims.type === 'painting';
}
function isDesign(dims: AnalysisResult['dimensions']): dims is DesignAnalysis {
  return dims.type === 'design';
}
function isProduct(dims: AnalysisResult['dimensions']): dims is ProductAnalysis {
  return dims.type === 'product';
}
function isSculpture(dims: AnalysisResult['dimensions']): dims is SculptureAnalysis {
  return dims.type === 'sculpture';
}

// 辅助组件
function DimensionHeader({ icon: Icon, title, score, color }: { icon: React.ComponentType<{className?: string}>, title: string, score: number, color: 'cinnabar' | 'stone' | 'gold' }) {
  const bgColor = color === 'cinnabar' ? 'bg-cinnabar/10' : color === 'stone' ? 'bg-stone/10' : 'bg-gold/10';
  const textColor = color === 'cinnabar' ? 'text-cinnabar' : color === 'stone' ? 'text-stone' : 'text-gold';
  const scoreBg = getScoreBg(score);
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
        <h3 className="font-serif text-lg font-bold text-ink-900">{title}</h3>
      </div>
      <div className={`w-12 h-12 ${scoreBg} rounded-full flex items-center justify-center`}>
        <span className="font-serif text-xl font-bold text-white">{score}</span>
      </div>
    </div>
  );
}

function MetricItem({ label, value, className = '' }: { label: string, value: React.ReactNode, className?: string }) {
  return (
    <div className="bg-rice-50 rounded-lg p-3">
      <div className="text-xs text-ink-500 mb-1">{label}</div>
      <div className={`text-sm font-medium text-ink-700 ${className}`}>{value}</div>
    </div>
  );
}

function SuggestionBox({ color, suggestion }: { color: 'cinnabar' | 'stone' | 'gold', suggestion: string }) {
  const bg = color === 'cinnabar' ? 'bg-cinnabar/5' : color === 'stone' ? 'bg-stone/5' : 'bg-gold/5';
  const border = color === 'cinnabar' ? 'border-cinnabar/20' : color === 'stone' ? 'border-stone/20' : 'border-gold/20';
  const text = color === 'cinnabar' ? 'text-cinnabar' : color === 'stone' ? 'text-stone' : 'text-gold';
  return (
    <div className={`${bg} rounded-xl p-4 border ${border}`}>
      <p className={`text-sm font-medium ${text} mb-1`}>改进建议</p>
      <p className="text-sm text-ink-600">{suggestion}</p>
    </div>
  );
}

function HeatmapSection({ data, focusPoint, title = '视觉焦点热力图' }: { data: number[][], focusPoint: {x:number, y:number}, title?: string }) {
  return (
    <div className="bg-rice-100 rounded-xl p-4 mb-4">
      <p className="text-sm font-medium text-ink-700 mb-3">{title}</p>
      <div className="flex justify-center">
        <HeatmapCanvas heatmapData={data} focusPoint={focusPoint} />
      </div>
      <p className="text-xs text-ink-500 text-center mt-2">红色区域为视觉焦点</p>
    </div>
  );
}

export default function AnalysisPage() {
  const [step, setStep] = useState<Step>('upload');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [selectedArtType, setSelectedArtType] = useState<ArtTypeLocal>('painting');
  const [analysisDecision, setAnalysisDecision] = useState<AnalysisDecision | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      fileRef.current = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageUrl(e.target?.result as string);
        setStep('analyzing');
        setCountdown(3);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      fileRef.current = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageUrl(e.target?.result as string);
        setStep('analyzing');
        setCountdown(3);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    if (step === 'analyzing') {
      let completed = false;
      
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      const processResult = (analysisResult: AnalysisResult) => {
        if (!completed) {
          completed = true;
          clearInterval(timer);
          setResult(analysisResult);
          saveToHistory(analysisResult);
          setStep('result');
        }
      };
      
      const handleError = (error: unknown) => {
        console.error('分析失败:', error);
        if (!completed) {
          completed = true;
          clearInterval(timer);
          alert('图像分析失败，请重试');
          setStep('upload');
          setImageUrl('');
          setAnalysisDecision(null);
        }
      };
      
      smartAnalyze(fileRef.current, imageUrl, selectedArtType, (decision) => {
        setAnalysisDecision(decision);
        setCountdown(decision.estimatedTime);
      })
        .then(processResult)
        .catch(handleError);
      
      return () => {
        completed = true;
        clearInterval(timer);
      };
    }
  }, [step, imageUrl, selectedArtType]);

  const handleRetry = () => {
    setStep('upload');
    setImageUrl('');
    setResult(null);
    setAnalysisDecision(null);
  };

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
            智绘镜
          </h1>
          <p className="text-ink-600">智能感知作品复杂度，自动选择最优分析方案</p>
        </div>

        {step === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-3 text-center">
                选择创作类型
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {artTypes.map((art) => {
                  const Icon = art.icon;
                  const isSelected = selectedArtType === art.id;
                  return (
                    <button
                      key={art.id}
                      onClick={() => setSelectedArtType(art.id)}
                      className={`p-4 rounded-xl text-center transition-all ${
                        isSelected
                          ? 'bg-cinnabar text-white card-shadow'
                          : 'bg-white text-ink-700 card-shadow hover:card-shadow-hover'
                      }`}
                    >
                      <Icon className="w-6 h-6 mx-auto mb-2" />
                      <p className="font-medium text-sm">{art.name}</p>
                      <p className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-ink-500'}`}>
                        {art.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-white rounded-xl p-4 card-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="w-5 h-5 text-cinnabar" />
                  <h3 className="font-serif text-base font-bold text-ink-900">智能分析引擎</h3>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-rice-50 rounded-lg p-3">
                    <Cpu className="w-5 h-5 text-ink-600 mx-auto mb-1" />
                    <p className="text-xs text-ink-500">简单作品</p>
                    <p className="text-xs font-medium text-green-600">本地分析</p>
                  </div>
                  <div className="bg-rice-50 rounded-lg p-3">
                    <Zap className="w-5 h-5 text-gold mx-auto mb-1" />
                    <p className="text-xs text-ink-500">中等复杂度</p>
                    <p className="text-xs font-medium text-gold">智能选择</p>
                  </div>
                  <div className="bg-rice-50 rounded-lg p-3">
                    <Cloud className="w-5 h-5 text-cinnabar mx-auto mb-1" />
                    <p className="text-xs text-ink-500">复杂作品</p>
                    <p className="text-xs font-medium text-cinnabar">后端分析</p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="border-2 border-dashed border-ink-300 rounded-2xl p-12 text-center cursor-pointer hover:border-cinnabar hover:bg-cinnabar/5 transition-all duration-300"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="w-20 h-20 bg-ink-900/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-ink-500" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-ink-900 mb-2">
                点击或拖拽上传{artTypes.find(a => a.id === selectedArtType)?.name}作品
              </h3>
              <p className="text-ink-500 mb-4">支持 JPG、PNG 格式</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-rice-100 rounded-lg">
                <span className="font-medium">选择文件</span>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl overflow-hidden card-shadow">
              <div className="relative">
                <img
                  src={imageUrl}
                  alt="上传的作品"
                  className="w-full max-h-96 object-contain"
                />
                <div className="absolute inset-0 bg-ink-900/30 flex items-center justify-center">
                  <div className="text-center">
                    <div className="relative w-24 h-24 mx-auto mb-4">
                      <div className="absolute inset-0 bg-cinnabar/20 rounded-full" />
                      <div className="absolute inset-2 bg-cinnabar/30 rounded-full ink-drop-animation" />
                      <div className="absolute inset-4 bg-cinnabar/40 rounded-full ink-drop-animation" style={{ animationDelay: '0.5s' }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-cinnabar animate-spin" />
                      </div>
                    </div>
                    <p className="font-serif text-2xl font-bold text-white mb-2">
                      智绘分析中
                    </p>
                    <p className="text-rice-200">
                      预计 {countdown} 秒完成
                    </p>
                    {analysisDecision && (
                      <div className="mt-3 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 inline-block">
                        <p className="text-xs text-rice-100">
                          {analysisDecision.mode === 'server' ? (
                            <span className="flex items-center gap-1">
                              <Cloud className="w-3 h-3" /> 后端深度学习分析
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" /> 本地智能分析
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 grid grid-cols-3 gap-4">
              {ANALYSIS_CONFIG[selectedArtType].dimensions.map((dim, i) => {
                const Icon = dim.icon;
                return (
                  <div key={i} className="bg-white rounded-xl p-4 text-center card-shadow">
                    <Icon className={`w-6 h-6 ${dim.color} mx-auto mb-2`} />
                    <p className="text-sm text-ink-500">{dim.label}</p>
                    <div className="mt-2 h-1 bg-ink-100 rounded-full overflow-hidden">
                      <div className={`h-full ${dim.barColor} rounded-full brush-stroke-animation`} style={{ animationDelay: `${i * 0.5}s` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl overflow-hidden card-shadow">
              <div className="relative">
                <img
                  src={result.imageUrl}
                  alt="分析的作品"
                  className="w-full max-h-96 object-contain"
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-bold text-ink-900">分析完成</span>
                </div>
                <div className="absolute top-4 left-4 bg-ink-900/80 backdrop-blur-sm px-3 py-1 rounded-lg">
                  <span className="text-rice-100 text-sm font-medium">
                    {artTypes.find(a => a.id === selectedArtType)?.name}
                  </span>
                </div>
                {(() => {
                  const dims = result.dimensions;
                  const fp = isPainting(dims) ? dims.composition.focusPoint :
                             isDesign(dims) ? dims.visualHierarchy.focusPoint :
                             isProduct(dims) ? dims.form.focusPoint :
                             dims.spatialComposition.focusPoint;
                  return (
                    <div 
                      className="absolute inset-0 pointer-events-none opacity-60"
                      style={{
                        background: `radial-gradient(circle at ${fp.x * 100}% ${fp.y * 100}%, 
                          rgba(196, 30, 58, 0.4) 0%, 
                          rgba(196, 30, 58, 0.15) 30%, 
                          transparent 60%)`
                      }}
                    />
                  );
                })()}
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-ink-500 mb-2">综合评分</p>
              <div className="inline-flex items-center gap-3">
                <div className={`w-24 h-24 ${getScoreBg(result.overallScore)} rounded-full flex items-center justify-center`}>
                  <span className="font-serif text-4xl font-bold text-white">
                    {result.overallScore}
                  </span>
                </div>
                <div className="text-left">
                  <p className="font-serif text-lg font-semibold text-ink-900">
                    {result.overallScore >= 85 ? '优秀' : result.overallScore >= 70 ? '良好' : '需改进'}
                  </p>
                  <p className="text-sm text-ink-500">继续加油，你的创作会越来越好！</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {isPainting(result.dimensions) && (
                <>
                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Eye} title="构图分析" score={result.dimensions.composition.score} color="cinnabar" />
                    <HeatmapSection data={result.dimensions.composition.heatmapData} focusPoint={result.dimensions.composition.focusPoint} />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="均衡度" value={
                        result.dimensions.composition.balance === 'balanced' ? '均衡' :
                        result.dimensions.composition.balance === 'left-heavy' ? '偏左' :
                        result.dimensions.composition.balance === 'right-heavy' ? '偏右' :
                        result.dimensions.composition.balance === 'top-heavy' ? '偏上' : '偏下'
                      } />
                      <MetricItem label="引导线" value={
                        result.dimensions.composition.guideline === 'good' ? '合理' :
                        result.dimensions.composition.guideline === 'average' ? '一般' : '需优化'
                      } />
                    </div>
                    <MetricItem label="留白比例" value={`${(result.dimensions.composition.whitespaceRatio * 100).toFixed(0)}%`} />
                    <div className="mt-3">
                      <SuggestionBox color="cinnabar" suggestion={result.dimensions.composition.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Palette} title="色彩诊断" score={result.dimensions.color.score} color="stone" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="冷暖比" value={`${result.dimensions.color.warmRatio.toFixed(1)} : ${(1 - result.dimensions.color.warmRatio).toFixed(1)}`} />
                      <MetricItem label="对比度" value={
                        result.dimensions.color.contrast === 'high' ? '高' :
                        result.dimensions.color.contrast === 'medium' ? '适中' : '低'
                      } />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="饱和度" value={
                        result.dimensions.color.saturation === 'high' ? '高' :
                        result.dimensions.color.saturation === 'medium' ? '适中' : '低'
                      } />
                      <MetricItem label="丰富度" value={
                        result.dimensions.color.richness === 'rich' ? '丰富' :
                        result.dimensions.color.richness === 'moderate' ? '适中' : '有限'
                      } />
                    </div>
                    <MetricItem label="主色调" value={result.dimensions.color.dominantColor} />
                    <div className="mt-3">
                      <SuggestionBox color="stone" suggestion={result.dimensions.color.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={PenTool} title="笔触技法" score={result.dimensions.brushwork.score} color="gold" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="肌理层次" value={
                        result.dimensions.brushwork.textureLevel === 'rich' ? '丰富' :
                        result.dimensions.brushwork.textureLevel === 'moderate' ? '适中' : '简单'
                      } />
                      <MetricItem label="笔触变化" value={`${result.dimensions.brushwork.strokeVariety}%`} />
                    </div>
                    <MetricItem label="干湿平衡" value={result.dimensions.brushwork.wetDryBalance} />
                    <div className="mt-3">
                      <SuggestionBox color="gold" suggestion={result.dimensions.brushwork.suggestion} />
                    </div>
                  </div>
                </>
              )}

              {isDesign(result.dimensions) && (
                <>
                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Eye} title="视觉层次" score={result.dimensions.visualHierarchy.score} color="cinnabar" />
                    <HeatmapSection data={result.dimensions.visualHierarchy.heatmapData} focusPoint={result.dimensions.visualHierarchy.focusPoint} />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="主次清晰度" value={
                        result.dimensions.visualHierarchy.primarySecondaryClarity === 'clear' ? '清晰' :
                        result.dimensions.visualHierarchy.primarySecondaryClarity === 'moderate' ? '一般' : '模糊'
                      } />
                      <MetricItem label="信息流动" value={
                        result.dimensions.visualHierarchy.informationFlow === 'good' ? '顺畅' :
                        result.dimensions.visualHierarchy.informationFlow === 'average' ? '一般' : '阻塞'
                      } />
                    </div>
                    <div className="mt-3">
                      <SuggestionBox color="cinnabar" suggestion={result.dimensions.visualHierarchy.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Type} title="排版" score={result.dimensions.typography.score} color="stone" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="对齐质量" value={
                        result.dimensions.typography.alignmentQuality === 'good' ? '优秀' :
                        result.dimensions.typography.alignmentQuality === 'average' ? '一般' : '需优化'
                      } />
                      <MetricItem label="节奏一致性" value={
                        result.dimensions.typography.rhythmConsistency === 'good' ? '一致' :
                        result.dimensions.typography.rhythmConsistency === 'average' ? '一般' : '混乱'
                      } />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="负空间运用" value={
                        result.dimensions.typography.negativeSpaceUsage === 'good' ? '得当' :
                        result.dimensions.typography.negativeSpaceUsage === 'average' ? '一般' : '拥挤'
                      } />
                      <MetricItem label="网格遵循度" value={`${result.dimensions.typography.gridAdherence}%`} />
                    </div>
                    <div className="mt-3">
                      <SuggestionBox color="stone" suggestion={result.dimensions.typography.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Palette} title="色彩应用" score={result.dimensions.colorApplication.score} color="gold" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="对比度" value={
                        result.dimensions.colorApplication.contrast === 'high' ? '高' :
                        result.dimensions.colorApplication.contrast === 'medium' ? '适中' : '低'
                      } />
                      <MetricItem label="品牌一致性" value={
                        result.dimensions.colorApplication.brandConsistency === 'strong' ? '强' :
                        result.dimensions.colorApplication.brandConsistency === 'moderate' ? '一般' : '弱'
                      } />
                    </div>
                    <MetricItem label="色彩心理学" value={result.dimensions.colorApplication.colorPsychology} />
                    <div className="mt-3">
                      <SuggestionBox color="gold" suggestion={result.dimensions.colorApplication.suggestion} />
                    </div>
                  </div>
                </>
              )}

              {isProduct(result.dimensions) && (
                <>
                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Box} title="形态" score={result.dimensions.form.score} color="cinnabar" />
                    <HeatmapSection data={result.dimensions.form.heatmapData} focusPoint={result.dimensions.form.focusPoint} title="形态焦点热力图" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="比例平衡" value={
                        result.dimensions.form.proportionBalance === 'good' ? '协调' :
                        result.dimensions.form.proportionBalance === 'average' ? '一般' : '失衡'
                      } />
                      <MetricItem label="线条流畅度" value={
                        result.dimensions.form.lineFluidity === 'smooth' ? '流畅' :
                        result.dimensions.form.lineFluidity === 'moderate' ? '一般' : '生硬'
                      } />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="曲面质量" value={
                        result.dimensions.form.surfaceQuality === 'excellent' ? '优秀' :
                        result.dimensions.form.surfaceQuality === 'good' ? '良好' : '一般'
                      } />
                      <MetricItem label="人机工学暗示" value={
                        result.dimensions.form.ergonomicsHint === 'strong' ? '强' :
                        result.dimensions.form.ergonomicsHint === 'moderate' ? '一般' : '弱'
                      } />
                    </div>
                    <div className="mt-3">
                      <SuggestionBox color="cinnabar" suggestion={result.dimensions.form.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Gem} title="材质表现" score={result.dimensions.materialExpression.score} color="stone" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="质感真实度" value={
                        result.dimensions.materialExpression.textureRealism === 'high' ? '高' :
                        result.dimensions.materialExpression.textureRealism === 'medium' ? '中' : '低'
                      } />
                      <MetricItem label="光影表现" value={
                        result.dimensions.materialExpression.lightShadowPerformance === 'excellent' ? '优秀' :
                        result.dimensions.materialExpression.lightShadowPerformance === 'good' ? '良好' : '一般'
                      } />
                    </div>
                    <MetricItem label="表面处理" value={
                      result.dimensions.materialExpression.surfaceTreatment === 'refined' ? '精致' :
                      result.dimensions.materialExpression.surfaceTreatment === 'moderate' ? '一般' : '粗糙'
                    } />
                    <div className="mt-3">
                      <SuggestionBox color="stone" suggestion={result.dimensions.materialExpression.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Settings} title="功能表达" score={result.dimensions.functionExpression.score} color="gold" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="结构清晰度" value={
                        result.dimensions.functionExpression.structureClarity === 'clear' ? '清晰' :
                        result.dimensions.functionExpression.structureClarity === 'moderate' ? '一般' : '模糊'
                      } />
                      <MetricItem label="功能暗示" value={
                        result.dimensions.functionExpression.functionImplication === 'strong' ? '强' :
                        result.dimensions.functionExpression.functionImplication === 'moderate' ? '一般' : '弱'
                      } />
                    </div>
                    <MetricItem label="细节精致度" value={
                      result.dimensions.functionExpression.detailRefinement === 'excellent' ? '优秀' :
                      result.dimensions.functionExpression.detailRefinement === 'good' ? '良好' : '一般'
                    } />
                    <div className="mt-3">
                      <SuggestionBox color="gold" suggestion={result.dimensions.functionExpression.suggestion} />
                    </div>
                  </div>
                </>
              )}

              {isSculpture(result.dimensions) && (
                <>
                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Box} title="空间构成" score={result.dimensions.spatialComposition.score} color="cinnabar" />
                    <HeatmapSection data={result.dimensions.spatialComposition.heatmapData} focusPoint={result.dimensions.spatialComposition.focusPoint} title="空间焦点热力图" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="体积感" value={
                        result.dimensions.spatialComposition.volumeSense === 'strong' ? '强烈' :
                        result.dimensions.spatialComposition.volumeSense === 'moderate' ? '一般' : '薄弱'
                      } />
                      <MetricItem label="空间占有" value={
                        result.dimensions.spatialComposition.spaceOccupation === 'full' ? '饱满' :
                        result.dimensions.spatialComposition.spaceOccupation === 'moderate' ? '适中' : '稀疏'
                      } />
                    </div>
                    <MetricItem label="虚实关系" value={
                      result.dimensions.spatialComposition.voidSolidRelation === 'harmonious' ? '和谐' :
                      result.dimensions.spatialComposition.voidSolidRelation === 'moderate' ? '一般' : '失衡'
                    } />
                    <div className="mt-3">
                      <SuggestionBox color="cinnabar" suggestion={result.dimensions.spatialComposition.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Move} title="形体语言" score={result.dimensions.bodyLanguage.score} color="stone" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="动态感" value={
                        result.dimensions.bodyLanguage.dynamicSense === 'strong' ? '强烈' :
                        result.dimensions.bodyLanguage.dynamicSense === 'moderate' ? '一般' : '静态'
                      } />
                      <MetricItem label="张力表达" value={
                        result.dimensions.bodyLanguage.tensionExpression === 'high' ? '高' :
                        result.dimensions.bodyLanguage.tensionExpression === 'medium' ? '中' : '低'
                      } />
                    </div>
                    <MetricItem label="韵律流动" value={
                      result.dimensions.bodyLanguage.rhythmFlow === 'fluent' ? '流畅' :
                      result.dimensions.bodyLanguage.rhythmFlow === 'moderate' ? '一般' : '生硬'
                    } />
                    <div className="mt-3">
                      <SuggestionBox color="stone" suggestion={result.dimensions.bodyLanguage.suggestion} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 card-shadow">
                    <DimensionHeader icon={Gem} title="材料语言" score={result.dimensions.materialLanguage.score} color="gold" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricItem label="材料特性" value={
                        result.dimensions.materialLanguage.materialCharacter === 'distinct' ? '鲜明' :
                        result.dimensions.materialLanguage.materialCharacter === 'moderate' ? '一般' : '模糊'
                      } />
                      <MetricItem label="肌理表现" value={
                        result.dimensions.materialLanguage.textureExpression === 'rich' ? '丰富' :
                        result.dimensions.materialLanguage.textureExpression === 'moderate' ? '一般' : '简单'
                      } />
                    </div>
                    <MetricItem label="质感层次" value={
                      result.dimensions.materialLanguage.qualityLayering === 'rich' ? '丰富' :
                      result.dimensions.materialLanguage.qualityLayering === 'moderate' ? '一般' : '简单'
                    } />
                    <div className="mt-3">
                      <SuggestionBox color="gold" suggestion={result.dimensions.materialLanguage.suggestion} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 原创性检测 - 全宽卡片 */}
            <div className="bg-white rounded-2xl p-6 card-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gold/10 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-gold" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-ink-900">原创性检测</h3>
                </div>
                <div className={`w-12 h-12 ${getScoreBg(result.originality.score)} rounded-full flex items-center justify-center`}>
                  <span className="font-serif text-xl font-bold text-white">{result.originality.score}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricItem label="相似度" value={`${(result.originality.similarity * 100).toFixed(0)}%`} />
                <MetricItem label="评级" value={
                  <span className={
                    result.originality.similarity < 0.15 ? 'text-green-600' :
                    result.originality.similarity < 0.25 ? 'text-gold' : 'text-cinnabar'
                  }>
                    {result.originality.similarity < 0.15 ? '优秀' :
                     result.originality.similarity < 0.25 ? '良好' : '需注意'}
                  </span>
                } />
                <MetricItem label="创造力等级" value={
                  result.originality.creativityLevel === 'excellent' ? '卓越' :
                  result.originality.creativityLevel === 'good' ? '良好' :
                  result.originality.creativityLevel === 'average' ? '一般' : '需努力'
                } />
              </div>
              <div className="bg-rice-100 rounded-xl p-4 mt-4 mb-4">
                <p className="text-xs text-ink-500 mb-2">原创性进度</p>
                <div className="w-full h-2 bg-ink-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      result.originality.similarity < 0.15 ? 'bg-green-600' :
                      result.originality.similarity < 0.25 ? 'bg-gold' : 'bg-cinnabar'
                    }`}
                    style={{ width: `${(1 - result.originality.similarity) * 100}%` }}
                  />
                </div>
              </div>
              <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
                <p className="text-sm font-medium text-gold mb-1">改进建议</p>
                <p className="text-sm text-ink-600">{result.originality.suggestion}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-ink-900 text-ink-900 rounded-lg hover:bg-ink-900 hover:text-rice-100 transition-all duration-300"
              >
                <Upload className="w-5 h-5" />
                <span className="font-medium">重新上传</span>
              </button>
              <button
                onClick={() => {
                  const report = {
                    id: result.id,
                    createdAt: result.createdAt,
                    artType: artTypes.find(a => a.id === result.artType)?.name,
                    overallScore: result.overallScore,
                    dimensions: result.dimensions,
                    originality: result.originality,
                  };
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `analysis-report-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-ink-900 text-rice-100 rounded-lg hover:bg-cinnabar transition-all duration-300"
              >
                <Download className="w-5 h-5" />
                <span className="font-medium">导出报告</span>
              </button>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: '丹青有AI - 创作分析报告',
                      text: `我的${artTypes.find(a => a.id === result.artType)?.name}作品获得了${result.overallScore}分！`,
                      url: window.location.href,
                    });
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    alert('链接已复制到剪贴板');
                  }
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-cinnabar text-rice-100 rounded-lg hover:bg-stone transition-all duration-300"
              >
                <Share2 className="w-5 h-5" />
                <span className="font-medium">分享报告</span>
              </button>
              <button
                onClick={() => {
                  document.querySelector('footer')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-cinnabar text-cinnabar rounded-lg hover:bg-cinnabar hover:text-rice-100 transition-all duration-300"
              >
                <span className="font-medium">查看历史记录</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
