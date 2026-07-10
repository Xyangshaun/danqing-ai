import { useState, useEffect } from 'react';
import { History, Calendar, Eye, ArrowRight, X, Brush, PenTool, Box, Layers, Palette, Sparkles, Type, Gem, Settings, Move } from 'lucide-react';
import { getHistory, getAnalysisResult } from '../services/mockData';
import type { HistoryRecord, AnalysisResult, PaintingAnalysis, DesignAnalysis, ProductAnalysis, SculptureAnalysis } from '../types';
import HeatmapCanvas from '../components/HeatmapCanvas';

const artTypeConfig: Record<string, { name: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  painting: { name: '绘画', icon: Brush, color: 'bg-cinnabar' },
  design: { name: '设计', icon: PenTool, color: 'bg-stone' },
  product: { name: '产品设计', icon: Box, color: 'bg-gold' },
  sculpture: { name: '雕塑', icon: Layers, color: 'bg-purple-500' },
};

function getScoreBg(score: number) {
  if (score >= 85) return 'bg-green-600';
  if (score >= 70) return 'bg-gold';
  return 'bg-cinnabar';
}

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

function ScoreCard({ icon: Icon, label, score, color }: { icon: React.ComponentType<{className?: string}>, label: string, score: number, color: 'cinnabar' | 'stone' | 'gold' }) {
  const textColor = color === 'cinnabar' ? 'text-cinnabar' : color === 'stone' ? 'text-stone' : 'text-gold';
  const bgColor = color === 'cinnabar' ? 'bg-cinnabar/10' : color === 'stone' ? 'bg-stone/10' : 'bg-gold/10';
  return (
    <div className="bg-white rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${textColor}`} />
        <span className="font-medium text-ink-700">{label}</span>
      </div>
      <div className={`w-12 h-12 ${bgColor} rounded-lg flex items-center justify-center`}>
        <span className={`font-serif text-xl font-bold ${textColor}`}>{score}</span>
      </div>
    </div>
  );
}

function DetailModal({ result, onClose }: { result: AnalysisResult; onClose: () => void }) {
  const dims = result.dimensions;

  const renderPaintingDetail = (d: PaintingAnalysis) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard icon={Eye} label="构图" score={d.composition.score} color="cinnabar" />
        <ScoreCard icon={Palette} label="色彩" score={d.color.score} color="stone" />
        <ScoreCard icon={PenTool} label="笔触" score={d.brushwork.score} color="gold" />
      </div>
      <div className="bg-white rounded-xl p-4">
        <p className="font-medium text-ink-700 mb-3">视觉焦点热力图</p>
        <div className="flex justify-center">
          <HeatmapCanvas heatmapData={d.composition.heatmapData} focusPoint={d.composition.focusPoint} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-cinnabar/5 rounded-xl p-4 border border-cinnabar/20">
          <p className="text-sm font-medium text-cinnabar mb-1">构图建议</p>
          <p className="text-sm text-ink-600">{d.composition.suggestion}</p>
        </div>
        <div className="bg-stone/5 rounded-xl p-4 border border-stone/20">
          <p className="text-sm font-medium text-stone mb-1">色彩建议</p>
          <p className="text-sm text-ink-600">{d.color.suggestion}</p>
        </div>
        <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
          <p className="text-sm font-medium text-gold mb-1">笔触建议</p>
          <p className="text-sm text-ink-600">{d.brushwork.suggestion}</p>
        </div>
      </div>
    </>
  );

  const renderDesignDetail = (d: DesignAnalysis) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard icon={Eye} label="视觉层次" score={d.visualHierarchy.score} color="cinnabar" />
        <ScoreCard icon={Type} label="排版" score={d.typography.score} color="stone" />
        <ScoreCard icon={Palette} label="色彩应用" score={d.colorApplication.score} color="gold" />
      </div>
      <div className="bg-white rounded-xl p-4">
        <p className="font-medium text-ink-700 mb-3">视觉层次热力图</p>
        <div className="flex justify-center">
          <HeatmapCanvas heatmapData={d.visualHierarchy.heatmapData} focusPoint={d.visualHierarchy.focusPoint} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-cinnabar/5 rounded-xl p-4 border border-cinnabar/20">
          <p className="text-sm font-medium text-cinnabar mb-1">视觉层次建议</p>
          <p className="text-sm text-ink-600">{d.visualHierarchy.suggestion}</p>
        </div>
        <div className="bg-stone/5 rounded-xl p-4 border border-stone/20">
          <p className="text-sm font-medium text-stone mb-1">排版建议</p>
          <p className="text-sm text-ink-600">{d.typography.suggestion}</p>
        </div>
        <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
          <p className="text-sm font-medium text-gold mb-1">色彩应用建议</p>
          <p className="text-sm text-ink-600">{d.colorApplication.suggestion}</p>
        </div>
      </div>
    </>
  );

  const renderProductDetail = (d: ProductAnalysis) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard icon={Box} label="形态" score={d.form.score} color="cinnabar" />
        <ScoreCard icon={Gem} label="材质表现" score={d.materialExpression.score} color="stone" />
        <ScoreCard icon={Settings} label="功能表达" score={d.functionExpression.score} color="gold" />
      </div>
      <div className="bg-white rounded-xl p-4">
        <p className="font-medium text-ink-700 mb-3">形态焦点热力图</p>
        <div className="flex justify-center">
          <HeatmapCanvas heatmapData={d.form.heatmapData} focusPoint={d.form.focusPoint} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-cinnabar/5 rounded-xl p-4 border border-cinnabar/20">
          <p className="text-sm font-medium text-cinnabar mb-1">形态建议</p>
          <p className="text-sm text-ink-600">{d.form.suggestion}</p>
        </div>
        <div className="bg-stone/5 rounded-xl p-4 border border-stone/20">
          <p className="text-sm font-medium text-stone mb-1">材质表现建议</p>
          <p className="text-sm text-ink-600">{d.materialExpression.suggestion}</p>
        </div>
        <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
          <p className="text-sm font-medium text-gold mb-1">功能表达建议</p>
          <p className="text-sm text-ink-600">{d.functionExpression.suggestion}</p>
        </div>
      </div>
    </>
  );

  const renderSculptureDetail = (d: SculptureAnalysis) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard icon={Box} label="空间构成" score={d.spatialComposition.score} color="cinnabar" />
        <ScoreCard icon={Move} label="形体语言" score={d.bodyLanguage.score} color="stone" />
        <ScoreCard icon={Gem} label="材料语言" score={d.materialLanguage.score} color="gold" />
      </div>
      <div className="bg-white rounded-xl p-4">
        <p className="font-medium text-ink-700 mb-3">空间焦点热力图</p>
        <div className="flex justify-center">
          <HeatmapCanvas heatmapData={d.spatialComposition.heatmapData} focusPoint={d.spatialComposition.focusPoint} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-cinnabar/5 rounded-xl p-4 border border-cinnabar/20">
          <p className="text-sm font-medium text-cinnabar mb-1">空间构成建议</p>
          <p className="text-sm text-ink-600">{d.spatialComposition.suggestion}</p>
        </div>
        <div className="bg-stone/5 rounded-xl p-4 border border-stone/20">
          <p className="text-sm font-medium text-stone mb-1">形体语言建议</p>
          <p className="text-sm text-ink-600">{d.bodyLanguage.suggestion}</p>
        </div>
        <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
          <p className="text-sm font-medium text-gold mb-1">材料语言建议</p>
          <p className="text-sm text-ink-600">{d.materialLanguage.suggestion}</p>
        </div>
      </div>
    </>
  );

  return (
    <div 
      className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-rice-100 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-rice-100 border-b border-ink-200 p-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold text-ink-900">分析报告详情</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-ink-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-ink-600" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-white rounded-xl overflow-hidden">
            <img
              src={result.imageUrl}
              alt="分析的作品"
              className="w-full max-h-64 object-contain"
            />
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className={`w-16 h-16 ${getScoreBg(result.overallScore)} rounded-full flex items-center justify-center`}>
              <span className="font-serif text-3xl font-bold text-white">
                {result.overallScore}
              </span>
            </div>
            <div>
              <p className="font-serif text-lg font-semibold text-ink-900">
                {result.overallScore >= 85 ? '优秀' : result.overallScore >= 70 ? '良好' : '需改进'}
              </p>
              <p className="text-sm text-ink-500">创作类型：{artTypeConfig[result.artType]?.name}</p>
            </div>
          </div>

          {isPainting(dims) && renderPaintingDetail(dims)}
          {isDesign(dims) && renderDesignDetail(dims)}
          {isProduct(dims) && renderProductDetail(dims)}
          {isSculpture(dims) && renderSculptureDetail(dims)}

          <div className="bg-white rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-gold" />
              <span className="font-medium text-ink-700">原创性</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 bg-gold/10 rounded-lg flex items-center justify-center">
                <span className="font-serif text-xl font-bold text-gold">{result.originality.score}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-500">相似度</p>
                <p className="text-sm font-medium text-ink-700">{(result.originality.similarity * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-gold/5 rounded-xl p-4 border border-gold/20">
            <p className="text-sm font-medium text-gold mb-1">原创性建议</p>
            <p className="text-sm text-ink-600">{result.originality.suggestion}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${minutes}`;
  };

  const handleViewDetail = (record: HistoryRecord) => {
    const result = getAnalysisResult(record.id);
    if (result) {
      setSelectedRecord(result);
    }
  };

  const handleCloseModal = () => {
    setSelectedRecord(null);
  };

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
            历史记录
          </h1>
          <p className="text-ink-600">查看过往的分析报告，追踪你的进步轨迹</p>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-ink-900/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <History className="w-10 h-10 text-ink-400" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-ink-700 mb-2">
              暂无分析记录
            </h3>
            <p className="text-ink-500">上传你的第一幅作品，开始AI诊断之旅</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-ink-200" />
              
              <div className="space-y-6">
                {history.map((record, index) => {
                  const artConfig = artTypeConfig[record.artType] || artTypeConfig.painting;
                  const Icon = artConfig.icon;
                  return (
                    <div
                      key={record.id}
                      className="relative pl-16 group"
                    >
                      <div className={`absolute left-4 top-6 w-5 h-5 ${getScoreBg(record.overallScore)} rounded-full border-4 border-rice-200 z-10`} />
                      
                      <div className="bg-white rounded-2xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 transform hover:-translate-y-1">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <div className="flex-shrink-0">
                            <img
                              src={record.imageUrl}
                              alt={`分析记录 ${index + 1}`}
                              className="w-32 h-32 object-cover rounded-xl"
                            />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Calendar className="w-4 h-4 text-ink-400" />
                              <span className="text-sm text-ink-500">
                                {formatDate(record.createdAt)}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 ${artConfig.color}/10 text-ink-700 text-xs rounded-full`}>
                                <Icon className="w-3 h-3" />
                                {artConfig.name}
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-4 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-ink-500">综合</span>
                                <div className={`w-10 h-10 ${getScoreBg(record.overallScore)} rounded-full flex items-center justify-center`}>
                                  <span className="font-serif text-lg font-bold text-white">
                                    {record.overallScore}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-ink-500">维度一</span>
                                <span className="font-medium text-ink-700">
                                  {record.dimension1Score}分
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-ink-500">维度二</span>
                                <span className="font-medium text-ink-700">
                                  {record.dimension2Score}分
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-ink-500">维度三</span>
                                <span className="font-medium text-ink-700">
                                  {record.dimension3Score}分
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => handleViewDetail(record)}
                            className="flex items-center gap-2 px-4 py-2 bg-ink-900/5 text-ink-700 rounded-lg hover:bg-ink-900 hover:text-rice-100 transition-all duration-300"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="text-sm font-medium">查看详情</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedRecord && (
        <DetailModal result={selectedRecord} onClose={handleCloseModal} />
      )}
    </div>
  );
}
