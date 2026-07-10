import { Palette, Eye, Sparkles, ArrowRight, BookOpen, Heart, Wand2, Award, Zap, Users, Brush, PenTool, Box, Layers, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';

// 艺术名言与文化短语
const artQuotes = [
  { text: '外师造化，中得心源', author: '张璾' },
  { text: '搜尽奇峰打草稿', author: '石涛' },
  { text: '意在笔先，画尽意在', author: '王维' },
  { text: '远观其势，近取其质', author: '郭熙' },
  { text: '笔墨当随时代', author: '石涛' },
  { text: '以形写神，形神兼备', author: '顾恺之' },
];

const artPhrases = [
  '一笔一墨皆是心象',
  '丹青不知老将至，富贵于我如浮云',
  '论画以形似，见与儿童邻',
  '诗中有画，画中有诗',
  '画不师古，如夜行无烛',
  '气韵生动，骨法用笔',
];

export default function HomePage() {
  const features = [
    {
      icon: Eye,
      title: '智绘镜',
      description: '智能感知作品复杂度，自动选择最优分析方案，3秒内完成三维度诊断',
      color: 'from-cinnabar to-red-600',
      link: '/analyze',
      tag: 'P0 核心'
    },
    {
      icon: BookOpen,
      title: '课堂素材生成器',
      description: '输入课程主题关键词，自动生成多组教学参考素材，备课从2小时到20分钟',
      color: 'from-stone to-blue-600',
      link: '/materials',
      tag: 'P1 推荐'
    },
    {
      icon: Wand2,
      title: '中式美学风格库',
      description: '内置水墨、青绿山水等非遗风格，一键转换草图为非遗风格',
      color: 'from-gold to-yellow-600',
      link: '/styles',
      tag: 'P1 推荐'
    },
  ];

  const extendedFeatures = [
    {
      icon: Heart,
      title: '灵感嫁接',
      description: '上传两张草图，AI提取元素融合，生成1+1>2的新作品',
      link: '/fuse',
      color: 'bg-pink-50 text-pink-600'
    },
    {
      icon: Heart,
      title: '情绪画布',
      description: '输入情绪关键词，AI生成对应色调的参考画面',
      link: '/emotion',
      color: 'bg-purple-50 text-purple-600'
    },
    {
      icon: TrendingUpIcon,
      title: '成长追踪',
      description: '记录每次诊断数据，生成能力变化曲线和最佳作品',
      link: '/growth',
      color: 'bg-green-50 text-green-600'
    },
  ];

  const stats = [
    { value: '3秒', label: '快速分析' },
    { value: '6+', label: '核心功能' },
    { value: '98%', label: '用户好评' },
  ];

  return (
    <div className="min-h-screen bg-rice-200 ink-texture">
      <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-rice-100/50 to-transparent" />
        <div className="absolute top-20 left-10 w-64 h-64 bg-cinnabar/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-stone/5 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900/5 rounded-full mb-6">
                <span className="w-2 h-2 bg-cinnabar rounded-full animate-pulse" />
                <span className="text-sm text-ink-600">AI创作诊断系统</span>
              </div>
              
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-ink-900 leading-tight mb-6">
                丹青有AI
                <br />
                <span className="text-cinnabar">让每一份创作都被看见</span>
              </h1>
              
              <p className="text-lg md:text-xl text-ink-600 mb-8 leading-relaxed">
                专为高校艺术教育设计的AI助教，支持绘画、设计、产品设计、雕塑等多种创作形式，
                3秒内完成构图、色彩、原创性三维度分析，给出具体的、可操作的改进建议。
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  to="/analyze"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-ink-900 text-rice-100 rounded-lg hover:bg-cinnabar transition-all duration-300 transform hover:scale-105 card-shadow"
                >
                  <Palette className="w-5 h-5" />
                  <span className="font-medium">开始诊断</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                
                <Link
                  to="/growth"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-ink-900 text-ink-900 rounded-lg hover:bg-ink-900 hover:text-rice-100 transition-all duration-300"
                >
                  <BookOpen className="w-5 h-5" />
                  <span className="font-medium">查看成长</span>
                </Link>
              </div>
            </div>
            
            <div className="relative">
              <div className="relative aspect-square max-w-lg mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-cinnabar/10 to-stone/10 rounded-3xl transform rotate-6" />
                <div className="absolute inset-0 bg-gradient-to-tl from-gold/10 to-cinnabar/5 rounded-3xl transform -rotate-3" />
                <div className="relative bg-rice-100 rounded-3xl p-6 card-shadow overflow-hidden">
                  <img
                    src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20chinese%20ink%20landscape%20painting%20with%20mountains%20and%20river&image_size=square"
                    alt="示例画作"
                    className="w-full h-full object-cover rounded-2xl"
                  />
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1">
                    <Zap className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium text-ink-700">AI分析完成</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl p-4 card-shadow animate-float">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-cinnabar/10 rounded-full flex items-center justify-center">
                    <Eye className="w-6 h-6 text-cinnabar" />
                  </div>
                  <div>
                    <p className="font-bold text-ink-900">构图热力图</p>
                    <p className="text-xs text-ink-500">精准定位视觉焦点</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label} className="group">
                <div className="font-serif text-4xl md:text-5xl font-bold text-ink-900 mb-2 group-hover:text-cinnabar transition-colors">
                  {stat.value}
                </div>
                <div className="text-ink-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 艺术名言横幅 */}
      <section className="py-16 bg-gradient-to-r from-ink-900 to-ink-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-cinnabar rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-stone rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            <Quote className="w-10 h-10 text-cinnabar/60 mx-auto mb-4" />
            <p className="font-serif text-2xl md:text-3xl text-rice-100 leading-relaxed mb-3">
              {artQuotes[0].text}
            </p>
            <p className="text-sm text-rice-400">—— {artQuotes[0].author}</p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
              支持多种创作形式
            </h2>
            <p className="text-ink-600 max-w-2xl mx-auto">
              无论是绘画、设计、产品设计还是雕塑，智绘镜都能智能感知作品复杂度，自动选择最优分析方案
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-rice-100 rounded-xl p-6 text-center hover:bg-cinnabar/5 transition-all group">
              <div className="w-16 h-16 bg-cinnabar/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Brush className="w-8 h-8 text-cinnabar" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-2">绘画</h3>
              <p className="text-sm text-ink-500">油画、水彩、素描、国画等</p>
            </div>
            <div className="bg-rice-100 rounded-xl p-6 text-center hover:bg-stone/5 transition-all group">
              <div className="w-16 h-16 bg-stone/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <PenTool className="w-8 h-8 text-stone" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-2">设计</h3>
              <p className="text-sm text-ink-500">视觉传达、平面设计、UI设计等</p>
            </div>
            <div className="bg-rice-100 rounded-xl p-6 text-center hover:bg-gold/5 transition-all group">
              <div className="w-16 h-16 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Box className="w-8 h-8 text-gold" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-2">产品设计</h3>
              <p className="text-sm text-ink-500">工业设计、产品造型、家具设计等</p>
            </div>
            <div className="bg-rice-100 rounded-xl p-6 text-center hover:bg-purple-50 transition-all group">
              <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Layers className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="font-serif text-lg font-bold text-ink-900 mb-2">雕塑</h3>
              <p className="text-sm text-ink-500">雕塑、陶艺、装置艺术等</p>
            </div>
          </div>
        </div>
      </section>

      {/* 艺术短语飘带 */}
      <section className="py-8 bg-rice-100 border-y border-ink-900/5 overflow-hidden">
        <div className="flex items-center gap-12 whitespace-nowrap">
          {artPhrases.map((phrase, i) => (
            <span key={i} className="font-serif text-lg text-ink-400 flex items-center gap-12">
              {phrase}
              <span className="w-1.5 h-1.5 rounded-full bg-cinnabar/30" />
            </span>
          ))}
        </div>
      </section>

      <section className="py-20 bg-rice-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
              核心功能
            </h2>
            <p className="text-ink-600 max-w-2xl mx-auto">
              从诊断到创作，从传承到表达，丹青有AI为艺术教育全流程赋能
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.title}
                  to={feature.link}
                  className="group bg-white rounded-2xl p-8 card-shadow hover:card-shadow-hover transition-all duration-500 transform hover:-translate-y-2"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <span className="text-xs font-medium text-ink-500 bg-ink-900/5 px-2 py-1 rounded">
                      {feature.tag}
                    </span>
                  </div>
                  <h3 className="font-serif text-xl font-bold text-ink-900 mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-ink-600 leading-relaxed mb-6">
                    {feature.description}
                  </p>
                  <div className="flex items-center text-cinnabar opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-sm font-medium">立即体验</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </div>
                </Link>
              );
            })}
          </div>

          <h3 className="text-center font-serif text-xl font-bold text-ink-700 mb-6">扩展功能</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {extendedFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.title}
                  to={feature.link}
                  className="group bg-white rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all"
                >
                  <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h4 className="font-serif text-lg font-bold text-ink-900 mb-2">
                    {feature.title}
                  </h4>
                  <p className="text-sm text-ink-600">
                    {feature.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 bg-ink-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-rice-100 mb-6">
                解决真实的教学痛点
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-cinnabar/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-cinnabar" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-rice-100 mb-1">减轻批改负担</h3>
                    <p className="text-rice-300 text-sm">
                      老师批42份作业要花一整天，AI 3秒出一份结构化报告
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-stone/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-stone" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-rice-100 mb-1">具体改进建议</h3>
                    <p className="text-rice-300 text-sm">
                      告别"再改改"的模糊评语，AI告诉学生具体怎么改
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-gold/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="w-6 h-6 text-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-rice-100 mb-1">跟踪成长轨迹</h3>
                    <p className="text-rice-300 text-sm">
                      系统记录每次分析数据，期末生成个人能力成长曲线
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-rice-100 mb-1">传承非遗文化</h3>
                    <p className="text-rice-300 text-sm">
                      内置中式美学风格库，让创作中自然接触传统文化
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="bg-rice-200 rounded-2xl p-6 card-shadow">
                <img
                  src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=art%20classroom%20with%20students%20painting%20and%20teacher%20reviewing%20work%20warm%20atmosphere&image_size=landscape_4_3"
                  alt="课堂场景"
                  className="w-full rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 艺术名言卡片 */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
              古今艺语
            </h2>
            <p className="text-ink-600 max-w-2xl mx-auto">
              千年画论，历久弥新——先贤的笔墨智慧，至今仍是创作的不二法门
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artQuotes.slice(1).map((quote, i) => (
              <div
                key={i}
                className="bg-rice-50 rounded-2xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 group border-2 border-transparent hover:border-cinnabar/10"
              >
                <Quote className="w-6 h-6 text-cinnabar/30 mb-3 group-hover:text-cinnabar/60 transition-colors" />
                <p className="font-serif text-lg text-ink-800 leading-relaxed mb-3">
                  {quote.text}
                </p>
                <p className="text-sm text-ink-500">—— {quote.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-rice-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-4">
              开始你的创作之旅
            </h2>
            <p className="text-ink-600">
              上传你的作品，智绘镜将智能分析并为你提供专业的诊断报告
            </p>
          </div>
          <div className="flex justify-center">
            <Link
              to="/analyze"
              className="group inline-flex items-center justify-center gap-3 px-10 py-5 bg-gradient-to-r from-cinnabar to-stone text-white rounded-xl hover:from-stone hover:to-cinnabar transition-all duration-500 transform hover:scale-105 card-shadow"
            >
              <Palette className="w-6 h-6" />
              <span className="font-serif text-xl font-bold">上传作品</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrendingUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
