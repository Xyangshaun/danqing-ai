import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, BarChart3, Award, Sparkles, Lightbulb, Target, Layers } from 'lucide-react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { generateGrowthDataFromHistory, calculateGrowthInsights, getHistory } from '../services/mockData';
import type { GrowthData } from '../types';

export default function GrowthPage() {
  const [growthData, setGrowthData] = useState<GrowthData[]>([]);

  useEffect(() => {
    const data = generateGrowthDataFromHistory();
    setGrowthData(data);
  }, []);

  const insights = useMemo(() => {
    return calculateGrowthInsights(growthData);
  }, [growthData]);

  const calculateTrend = (data: GrowthData[], key: keyof GrowthData) => {
    if (data.length < 2) return 'stable';
    const first = data[0][key] as number;
    const last = data[data.length - 1][key] as number;
    if (last > first + 5) return 'up';
    if (last < first - 5) return 'down';
    return 'stable';
  };

  const dimension1Trend = calculateTrend(growthData, 'dimension1');
  const dimension2Trend = calculateTrend(growthData, 'dimension2');
  const dimension3Trend = calculateTrend(growthData, 'dimension3');
  const overallTrend = calculateTrend(growthData, 'overall');

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-cinnabar" />;
    return <span className="w-4 h-4" />;
  };

  const getTrendText = (trend: string) => {
    if (trend === 'up') return '上升趋势';
    if (trend === 'down') return '下降趋势';
    return '平稳';
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-cinnabar';
    return 'text-ink-500';
  };

  const avgScore = growthData.length > 0
    ? Math.round(growthData.reduce((sum, d) => sum + d.overall, 0) / growthData.length)
    : 0;

  const maxScore = growthData.length > 0
    ? Math.max(...growthData.map(d => d.overall))
    : 0;

  const historyCount = getHistory().length;

  return (
    <div className="min-h-screen bg-rice-200 ink-texture pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-4">
            <BarChart3 className="w-4 h-4 text-cinnabar" />
            <span className="text-sm text-ink-600">个人成长追踪</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
            成长曲线
          </h1>
          <p className="text-ink-600">基于真实分析数据，追踪你的创作能力成长轨迹</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-3">
              <Award className="w-6 h-6 text-gold" />
              <span className="text-sm text-ink-500">平均评分</span>
            </div>
            <div className="font-serif text-3xl font-bold text-ink-900">{avgScore}</div>
          </div>
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-3">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <span className="text-sm text-ink-500">最高评分</span>
            </div>
            <div className="font-serif text-3xl font-bold text-ink-900">{maxScore}</div>
          </div>
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-6 h-6 text-cinnabar" />
              <span className="text-sm text-ink-500">分析次数</span>
            </div>
            <div className="font-serif text-3xl font-bold text-ink-900">{historyCount}</div>
          </div>
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-3">
              <Layers className="w-6 h-6 text-stone" />
              <span className="text-sm text-ink-500">当前趋势</span>
            </div>
            <div className={`font-serif text-xl font-bold flex items-center gap-2 ${getTrendColor(overallTrend)}`}>
              {getTrendIcon(overallTrend)}
              {getTrendText(overallTrend)}
            </div>
          </div>
        </div>

        {/* Smart Insights */}
        {insights && (
          <div className="bg-white rounded-2xl p-6 card-shadow mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-cinnabar/10 rounded-lg flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-cinnabar" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-ink-900">智能成长洞察</h3>
                <p className="text-sm text-ink-500">基于 {growthData.length} 天的分析数据</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-rice-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-cinnabar" />
                  <span className="text-sm font-medium text-ink-700">整体变化</span>
                </div>
                <p className={`text-2xl font-bold font-serif ${insights.overallChange >= 0 ? 'text-green-600' : 'text-cinnabar'}`}>
                  {insights.overallChange >= 0 ? '+' : ''}{insights.overallChange} 分
                </p>
              </div>
              <div className="bg-rice-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-ink-700">最强维度</span>
                </div>
                <p className="text-2xl font-bold font-serif text-ink-900">
                  {insights.strongest}
                </p>
                <p className="text-sm text-ink-500">
                  +{Math.max(insights.d1Change, insights.d2Change, insights.d3Change)} 分
                </p>
              </div>
              <div className="bg-rice-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-cinnabar" />
                  <span className="text-sm font-medium text-ink-700">波动指数</span>
                </div>
                <p className="text-2xl font-bold font-serif text-ink-900">
                  {insights.volatility}
                </p>
                <p className="text-sm text-ink-500">
                  {insights.volatility < 3 ? '稳定' : insights.volatility < 6 ? '中等' : '波动较大'}
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-cinnabar/5 to-gold/5 rounded-xl p-4 border border-cinnabar/10">
              <p className="text-sm text-ink-700 leading-relaxed">
                {insights.suggestion}
              </p>
            </div>
          </div>
        )}

        {/* Area Chart */}
        <div className="bg-white rounded-2xl p-6 md:p-8 card-shadow mb-8">
          <h2 className="font-serif text-xl font-bold text-ink-900 mb-6">能力成长趋势</h2>
          <div className="h-80 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorDim1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c41e3a" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#c41e3a" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDim2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2e5fa1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2e5fa1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDim3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d4af37" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede8df" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: '#595959', fontSize: 12 }}
                  axisLine={{ stroke: '#ede8df' }}
                  tickLine={{ stroke: '#ede8df' }}
                />
                <YAxis 
                  domain={[60, 100]} 
                  tick={{ fill: '#595959', fontSize: 12 }}
                  axisLine={{ stroke: '#ede8df' }}
                  tickLine={{ stroke: '#ede8df' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fdfcf9', 
                    border: '1px solid #ede8df',
                    borderRadius: '8px',
                    padding: '12px'
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '16px' }}
                  iconType="circle"
                />
                <Area 
                  type="monotone" 
                  dataKey="dimension1" 
                  name="维度一" 
                  stroke="#c41e3a" 
                  fill="url(#colorDim1)"
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="dimension2" 
                  name="维度二" 
                  stroke="#2e5fa1" 
                  fill="url(#colorDim2)"
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="dimension3" 
                  name="维度三" 
                  stroke="#d4af37" 
                  fill="url(#colorDim3)"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="overall" 
                  name="综合" 
                  stroke="#1a1a1a" 
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#1a1a1a', strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: '#1a1a1a', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dimension Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-cinnabar/10 rounded-lg flex items-center justify-center">
                <Layers className="w-5 h-5 text-cinnabar" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900">维度一</h3>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-ink-500">当前趋势</span>
              <div className={`flex items-center gap-1 ${getTrendColor(dimension1Trend)}`}>
                {getTrendIcon(dimension1Trend)}
                <span className="text-sm font-medium">{getTrendText(dimension1Trend)}</span>
              </div>
            </div>
            {insights && (
              <div className="mb-4 p-3 bg-rice-50 rounded-lg">
                <p className="text-xs text-ink-500">变化幅度</p>
                <p className={`text-lg font-bold font-serif ${insights.d1Change >= 0 ? 'text-green-600' : 'text-cinnabar'}`}>
                  {insights.d1Change >= 0 ? '+' : ''}{insights.d1Change} 分
                </p>
              </div>
            )}
            <div className="space-y-3">
              {growthData.slice(-5).reverse().map((data) => (
                <div key={data.date} className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">{data.date}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cinnabar rounded-full"
                        style={{ width: `${data.dimension1}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-ink-700 w-8">{data.dimension1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-stone/10 rounded-lg flex items-center justify-center">
                <Layers className="w-5 h-5 text-stone" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900">维度二</h3>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-ink-500">当前趋势</span>
              <div className={`flex items-center gap-1 ${getTrendColor(dimension2Trend)}`}>
                {getTrendIcon(dimension2Trend)}
                <span className="text-sm font-medium">{getTrendText(dimension2Trend)}</span>
              </div>
            </div>
            {insights && (
              <div className="mb-4 p-3 bg-rice-50 rounded-lg">
                <p className="text-xs text-ink-500">变化幅度</p>
                <p className={`text-lg font-bold font-serif ${insights.d2Change >= 0 ? 'text-green-600' : 'text-cinnabar'}`}>
                  {insights.d2Change >= 0 ? '+' : ''}{insights.d2Change} 分
                </p>
              </div>
            )}
            <div className="space-y-3">
              {growthData.slice(-5).reverse().map((data) => (
                <div key={data.date} className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">{data.date}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-stone rounded-full"
                        style={{ width: `${data.dimension2}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-ink-700 w-8">{data.dimension2}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 card-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gold/10 rounded-lg flex items-center justify-center">
                <Layers className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900">维度三</h3>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-ink-500">当前趋势</span>
              <div className={`flex items-center gap-1 ${getTrendColor(dimension3Trend)}`}>
                {getTrendIcon(dimension3Trend)}
                <span className="text-sm font-medium">{getTrendText(dimension3Trend)}</span>
              </div>
            </div>
            {insights && (
              <div className="mb-4 p-3 bg-rice-50 rounded-lg">
                <p className="text-xs text-ink-500">变化幅度</p>
                <p className={`text-lg font-bold font-serif ${insights.d3Change >= 0 ? 'text-green-600' : 'text-cinnabar'}`}>
                  {insights.d3Change >= 0 ? '+' : ''}{insights.d3Change} 分
                </p>
              </div>
            )}
            <div className="space-y-3">
              {growthData.slice(-5).reverse().map((data) => (
                <div key={data.date} className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">{data.date}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gold rounded-full"
                        style={{ width: `${data.dimension3}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-ink-700 w-8">{data.dimension3}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
