import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Eye, Palette, Sparkles, CheckCircle2, Loader2, ArrowRight, PenTool, Layers, Box, Brush, Download, Share2, Cpu, Cloud, Zap, Type, Gem, Settings, Move, Scan, Brain, FileText, Image as ImageIcon, RefreshCw } from 'lucide-react';
import type { AnalysisResult, PaintingAnalysis, DesignAnalysis, ProductAnalysis, SculptureAnalysis, ProfessionalSuggestion, SuggestionPriority } from '../types';
import { saveAnalysis } from '../services/data-service';
import { createDraft, deleteDraft, updateDraft, getDraft } from '../services/draft-service';
import { useAuth } from '../hooks/useAuth';
import HeatmapCanvas from '../components/HeatmapCanvas';
import SmartImage from '../components/SmartImage';
import { useToast } from '../components/ToastProvider';
import { smartAnalyze, type AnalysisDecision } from '../services/smartAnalysisEngine';
import PresetSelector from '../components/PresetSelector';

type Step = 'upload' | 'analyzing' | 'result';
type ArtTypeLocal = 'painting' | 'design' | 'product' | 'sculpture';

/* AI 分析过程可视化：5 阶段流水线，让用户清晰看到分析进度与当前动作 */
const ANALYSIS_STAGES = [
  { id: 0, name: '图像预处理', desc: '解析画面构成', icon: ImageIcon },
  { id: 1, name: '特征提取', desc: '识别主体与元素', icon: Scan },
  { id: 2, name: '维度分析', desc: '多维度智能诊断', icon: Layers },
  { id: 3, name: '综合评估', desc: '生成评分与建议', icon: Brain },
  { id: 4, name: '报告生成', desc: '整理诊断报告', icon: FileText },
];

/* 实时专业术语描述：按阶段分组，每阶段 4 句专业描述
   阶段 2（维度分析）按艺术类型自适应，呈现绘画/设计/产品/雕塑各自的专业维度 */
const STAGE_DETAILS_GENERIC: string[][] = [
  /* 阶段 0：图像预处理 */
  [
    '解析 EXIF 元数据与分辨率信息',
    '转换 RGB → Lab 色彩空间',
    '建立像素矩阵，去噪与锐化处理',
    '生成画面直方图与亮度分布',
  ],
  /* 阶段 1：特征提取 */
  [
    'Canny 边缘检测识别轮廓形态',
    'HOG 方向梯度直方图提取',
    'SIFT 关键点匹配与定位',
    '主体物识别与背景区域分割',
  ],
  /* 阶段 2 占位（按艺术类型动态选择，见 STAGE_DETAILS_BY_ART_TYPE） */
  [],
  /* 阶段 3：综合评估 */
  [
    '多维度加权评分模型计算',
    '对比风格库匹配相似作品',
    '识别优势项与待改进维度',
    '生成改进建议与参考方向',
  ],
  /* 阶段 4：报告生成 */
  [
    '结构化输出诊断报告',
    '整理可视化热力图数据',
    '生成具体改进建议清单',
    '保存诊断记录到历史档案',
  ],
];

/* 阶段 2 维度分析：按艺术类型给出 4 句专业术语，对应 3 个核心维度 + 综合 */
const STAGE_DETAILS_BY_ART_TYPE: Record<ArtTypeLocal, string[]> = {
  painting: [
    '黄金分割与三分法则构图验证',
    '视觉重心坐标计算与焦点定位',
    '主色调提取与色彩饱和度分析',
    '笔触纹理特征与飞白密度识别',
  ],
  design: [
    '网格系统对齐与视觉层次评估',
    '字体排版节奏与阅读路径分析',
    '色彩对比度与无障碍标准验证',
    '留白比例与信息密度平衡',
  ],
  product: [
    '形态语义与曲面连续性分析',
    '材质表现与反光特性识别',
    '人机工程学与握持比例评估',
    '功能逻辑与操作流程推演',
  ],
  sculpture: [
    '空间构成与体量平衡分析',
    '形体语言与轮廓张力评估',
    '材料肌理与表面处理识别',
    '虚实关系与负空间计算',
  ],
};

/* 根据当前阶段 + 艺术类型获取对应的描述列表 */
function getStageDetails(stage: number, artType: ArtTypeLocal): string[] {
  if (stage === 2) return STAGE_DETAILS_BY_ART_TYPE[artType];
  return STAGE_DETAILS_GENERIC[stage] || ['正在分析...'];
}

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
  if (score >= 85) return 'bg-jade';
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

function SuggestionBox({ color, suggestion, evidence, priority }: {
  color: 'cinnabar' | 'stone' | 'gold';
  suggestion: string;
  evidence?: string;
  priority?: SuggestionPriority;
}) {
  const bg = color === 'cinnabar' ? 'bg-cinnabar/5' : color === 'stone' ? 'bg-stone/5' : 'bg-gold/5';
  const border = color === 'cinnabar' ? 'border-cinnabar/20' : color === 'stone' ? 'border-stone/20' : 'border-gold/20';
  const text = color === 'cinnabar' ? 'text-cinnabar' : color === 'stone' ? 'text-stone' : 'text-gold';

  /* priority 颜色标识: high=朱砂红/警告, medium=石青/信息, low=墨灰/普通 */
  const priorityStyles: Record<SuggestionPriority, { label: string; badge: string }> = {
    high: { label: '优先改进', badge: 'bg-cinnabar text-white' },
    medium: { label: '建议提升', badge: 'bg-[#5a8a7a] text-white' },
    low: { label: '亮点保持', badge: 'bg-ink-500 text-white' },
  };

  return (
    <div className={`${bg} rounded-xl p-4 border ${border}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-sm font-medium ${text}`}>改进建议</p>
        {priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityStyles[priority].badge}`}>
            {priorityStyles[priority].label}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-600">{suggestion}</p>
      {evidence && (
        <p className="text-xs text-ink-400 mt-2 pl-3 border-l-2 border-ink-200 italic">
          数据依据: {evidence}
        </p>
      )}
    </div>
  );
}

/**
 * 专业建议卡片(用于AI增强模式下的professionalSuggestions列表)
 * 按priority排序显示,支持evidence引用、reference参考案例、practice练习路径
 */
function ProfessionalSuggestionCard({ sug, index }: { sug: ProfessionalSuggestion; index: number }) {
  const priority: SuggestionPriority = sug.priority || 'medium';

  const priorityConfig: Record<SuggestionPriority, {
    label: string;
    borderColor: string;
    badgeBg: string;
    dotColor: string;
    headerBg: string;
  }> = {
    high: {
      label: '优先改进',
      borderColor: 'border-cinnabar/30',
      badgeBg: 'bg-cinnabar text-white',
      dotColor: 'bg-cinnabar',
      headerBg: 'bg-cinnabar/5',
    },
    medium: {
      label: '建议提升',
      borderColor: 'border-[#5a8a7a]/30',
      badgeBg: 'bg-[#5a8a7a] text-white',
      dotColor: 'bg-[#5a8a7a]',
      headerBg: 'bg-[#5a8a7a]/5',
    },
    low: {
      label: '亮点保持',
      borderColor: 'border-ink-300/30',
      badgeBg: 'bg-ink-500 text-white',
      dotColor: 'bg-ink-400',
      headerBg: 'bg-ink-100/50',
    },
  };

  const cfg = priorityConfig[priority];

  return (
    <div className={`bg-rice-50 rounded-xl border ${cfg.borderColor} overflow-hidden`}>
      <div className={`px-4 py-2.5 ${cfg.headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
          <span className="text-xs font-medium text-ink-700">{index + 1}.</span>
          <span className="text-sm font-semibold text-ink-900 font-serif">{sug.dimension}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeBg}`}>
          {cfg.label}
        </span>
      </div>
      <div className="p-4 space-y-2">
        {/* 操作建议 */}
        <p className="text-sm text-ink-700 leading-relaxed">{sug.operation}</p>

        {/* 证据字段:小字、灰色、引用样式 */}
        {sug.evidence && (
          <p className="text-xs text-ink-400 pl-3 border-l-2 border-ink-200 italic leading-relaxed">
            数据依据: {sug.evidence}
          </p>
        )}

        {/* 参考案例 */}
        {sug.reference && (
          <p className="text-xs text-ink-500">
            <span className="font-medium text-ink-600">参考:</span> {sug.reference}
          </p>
        )}

        {/* 练习路径 */}
        {sug.practice && (
          <p className="text-xs text-ink-500">
            <span className="font-medium text-ink-600">练习:</span> {sug.practice}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 按优先级排序专业建议: high > medium > low; 同级保持原顺序
 */
function sortSuggestionsByPriority(suggestions: ProfessionalSuggestion[]): ProfessionalSuggestion[] {
  const order: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2 };
  return [...suggestions].sort((a, b) => {
    const pa = order[a.priority || 'medium'];
    const pb = order[b.priority || 'medium'];
    return pa - pb;
  });
}

function HeatmapSection({ data, focusPoint, title = '视觉焦点热力图', harmonyData }: { data: number[][], focusPoint?: {x:number, y:number}, title?: string, harmonyData?: { harmonyScore?: number; harmonyType?: string; dominantColor?: string } }) {
  return (
    <div className="bg-rice-100 rounded-xl p-4 mb-4">
      <p className="text-sm font-medium text-ink-700 mb-3">{title}</p>
      <div className="flex justify-center">
        <HeatmapCanvas heatmapData={data} focusPoint={focusPoint} harmonyData={harmonyData} />
      </div>
      <p className="text-xs text-ink-500 text-center mt-2">{harmonyData ? '可切换查看色彩和谐度环形图' : '红色区域为视觉焦点'}</p>
    </div>
  );
}

/**
 * 分数圆环动画组件：从 0 滚动到 targetScore，SVG stroke-dashoffset 同步动画
 * 颜色按分数档位区分：>=85 jade 玉绿、70-84 gold 金、<70 cinnabar 朱砂红
 * 使用 easeOutQuart 缓动让数字滚动有减速感，持续 1.2s
 */
function AnimatedScore({ score, size = 120 }: { score: number; size?: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;
  /* 使用项目 ink 色板的精确色值，保证设计一致性 */
  const color = score >= 85 ? '#5b8c5a' : score >= 70 ? '#d4af37' : '#c41e3a';

  useEffect(() => {
    let raf: number;
    const start = Date.now();
    const duration = 1200;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      /* easeOutQuart 缓动：前期快速推进，后期减速 */
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayScore(Math.round(score * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(15,15,15,0.06)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-3xl font-bold" style={{ color }}>{displayScore}</span>
        <span className="text-xs text-ink-400">总分</span>
      </div>
    </div>
  );
}

/* ============================================================
 * 创作草稿辅助 (任务包A)
 * - compressImageToThumbnail: 用 canvas 压缩为最大 maxSize 的 JPEG dataURL
 *   (避免把原图 MB 级 dataURL 写入 LocalStorage 导致超配额)
 * - getDraftIdFromUrl / setDraftIdInUrl: HashRouter 兼容的 draftId 读写
 *   (hash 形如 #/analyze?draftId=xxx,用 history.replaceState 不刷新页面)
 * ============================================================ */

/** 将 dataURL 图片压缩为最大 maxSize 的 JPEG 缩略图 dataURL;失败回退原图 */
function compressImageToThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          // 等比缩放,最长边不超过 maxSize,不放大原图
          const ratio = Math.min(maxSize / width, maxSize / height, 1);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG 0.7 质量:缩略图足够清晰且体积小
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

/** 从 URL hash 中读取 draftId (HashRouter 兼容) */
function getDraftIdFromUrl(): string | null {
  try {
    const hash = window.location.hash; // e.g. "#/analyze?draftId=xxx"
    const queryStr = hash.split('?')[1];
    if (!queryStr) return null;
    return new URLSearchParams(queryStr).get('draftId');
  } catch {
    return null;
  }
}

/** 在 URL hash 中写入/清除 draftId (history.replaceState 不刷新页面) */
function setDraftIdInUrl(id: string | null): void {
  try {
    const hash = window.location.hash;
    const [path, query] = hash.replace(/^#/, '').split('?');
    const params = new URLSearchParams(query || '');
    if (id) params.set('draftId', id);
    else params.delete('draftId');
    const qs = params.toString();
    const newHash = qs ? `${path}?${qs}` : path;
    window.history.replaceState(null, '', `#${newHash}`);
  } catch (err) {
    console.warn('更新 URL draftId 失败:', err);
  }
}

export default function AnalysisPage() {
  const toast = useToast();
  /* 用 ref 持有最新 toast 上下文,供分析 useEffect 内部调用。
   * 原因:ToastProvider 的 context value 对象每次渲染都会重建,
   * 若把 `toast` 直接放入分析 effect 依赖,会在 toast 出现/消失时
   * 重复触发 smartAnalyze(造成重复分析)。ref 方式既拿到最新方法,
   * 又不进入依赖数组,行为与原先一致。 */
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { user, tenant } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [detailIndex, setDetailIndex] = useState(0);
  const [selectedArtType, setSelectedArtType] = useState<ArtTypeLocal>('painting');
  const [analysisDecision, setAnalysisDecision] = useState<AnalysisDecision | null>(null);
  const [analysisDuration, setAnalysisDuration] = useState<number | null>(null);
  const [showTypeSwitcher, setShowTypeSwitcher] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const startTimeRef = useRef<number | null>(null);

  /* ====== 创作草稿 (任务包A) ======
   * draftIdRef: 草稿 ID (ref,供分析 effect 内清理使用,避免依赖闭包陈旧值)
   * draftId:    草稿 ID (state,驱动 UI 显示"已恢复草稿"提示)
   * restoredPreview: 恢复草稿时的缩略图 (用于上传区预览) */
  const draftIdRef = useRef<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [restoredPreview, setRestoredPreview] = useState<string | undefined>(undefined);

  /* 进入页面:检查 URL ?draftId=xxx,命中则恢复草稿状态 (预填表单/缩略图,不重新分析) */
  useEffect(() => {
    try {
      const id = getDraftIdFromUrl();
      if (!id) return;
      const draft = getDraft(id);
      if (!draft) {
        // 草稿已不存在 (已清理),移除 URL 残留 query
        setDraftIdInUrl(null);
        return;
      }
      // 恢复:预填类型 + 缩略图 + draftId (不触发分析)
      if (draft.artworkType === 'painting' || draft.artworkType === 'design'
        || draft.artworkType === 'product' || draft.artworkType === 'sculpture') {
        setSelectedArtType(draft.artworkType);
      }
      draftIdRef.current = draft.id;
      setDraftId(draft.id);
      setRestoredPreview(draft.imagePreview);
      toast.info('已恢复未完成的草稿', '可重新上传图片继续诊断');
    } catch (err) {
      console.warn('恢复草稿失败:', err);
    }
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 图片加载完成后:创建草稿 + 进入分析
   * - 压缩为 200x200 缩略图存入草稿 (避免 LocalStorage 撑爆)
   * - 若存在旧草稿 (恢复后重新上传),先删除旧草稿
   * - 创建后更新 URL ?draftId=xxx,分析完成时清除
   * 全程 try/catch,失败只 console.warn 不阻塞分析主流程
   */
  const beginAnalysisWithImage = useCallback(async (_file: File, dataUrl: string) => {
    setImageUrl(dataUrl);
    setRestoredPreview(undefined);
    try {
      if (user && tenant) {
        const thumb = await compressImageToThumbnail(dataUrl, 200);
        const draft = createDraft({
          tenantId: tenant.id,
          userId: user.id,
          title: `未命名作品_${Date.now()}`,
          artworkType: selectedArtType,
          imagePreview: thumb,
        });
        if (draft) {
          // 恢复场景重新上传:清理旧草稿
          if (draftIdRef.current && draftIdRef.current !== draft.id) {
            try { deleteDraft(draftIdRef.current); } catch (e) { console.warn('清理旧草稿失败:', e); }
          }
          draftIdRef.current = draft.id;
          setDraftId(draft.id);
          setDraftIdInUrl(draft.id);
          try { updateDraft(draft.id, { status: 'analyzing' }); } catch (e) { console.warn('更新草稿状态失败:', e); }
        }
      }
    } catch (err) {
      console.warn('创建草稿失败:', err);
    }
    setStep('analyzing');
    setProgress(0);
    setDetailIndex(0);
  }, [user, tenant, selectedArtType]);

  /* 根据 progress 计算当前阶段（0-4），每 20% 切换一个阶段 */
  const currentStage = Math.min(4, Math.floor(progress / 20));

  /* 阶段切换时重置 detailIndex，让新阶段从第一句描述开始 */
  useEffect(() => {
    setDetailIndex(0);
  }, [currentStage]);

  /* 文件校验：仅允许 JPG/PNG，最大 10MB；失败时通过 Toast 提示并返回 false */
  const validateFile = useCallback((file: File): boolean => {
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('图片格式不支持', '仅支持 JPG / PNG 格式');
      return false;
    }
    const maxSize = 10 * 1024 * 1024; /* 10MB */
    if (file.size > maxSize) {
      toast.error('图片超过 10MB 限制', `当前 ${(file.size / 1024 / 1024).toFixed(1)}MB，请压缩后重试`);
      return false;
    }
    return true;
  }, [toast]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && validateFile(file)) {
      fileRef.current = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        /* 委托给 beginAnalysisWithImage:压缩缩略图 + 创建草稿 + 进入分析 */
        void beginAnalysisWithImage(file, dataUrl);
      };
      reader.readAsDataURL(file);
    }
    /* 重置 input value，允许再次选择同一文件（校验失败后可重选） */
    event.target.value = '';
  }, [validateFile, beginAnalysisWithImage]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      fileRef.current = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        void beginAnalysisWithImage(file, dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }, [validateFile, beginAnalysisWithImage]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  /* 粘贴图片支持（Ctrl+V）：仅在 upload 步骤生效，自动校验后进入分析 */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== 'upload') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (!validateFile(file)) return;
            e.preventDefault();
            fileRef.current = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              void beginAnalysisWithImage(file, dataUrl);
            };
            reader.readAsDataURL(file);
            toast.info('已粘贴图片', '正在准备分析...');
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [step, toast, validateFile, beginAnalysisWithImage]);

  useEffect(() => {
    if (step === 'analyzing') {
      let completed = false;
      /* 记录分析开始时间，用于结果页展示总耗时 */
      startTimeRef.current = Date.now();
      setAnalysisDuration(null);

      /* 进度推进定时器：每 60ms 推进 1%，到 95% 后等待真实分析完成再冲到 100%
         总时长约 5.7s（95% × 60ms），与 smartAnalyze 的实际耗时大致匹配 */
      const progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return prev;            /* 等待真实分析完成 */
          return Math.min(95, prev + 1);
        });
      }, 60);

      /* 详情文字轮播：每 600ms 切换一句，在当前阶段的专业描述组内循环
         从 progress 实时计算 stage，避免 ref 同步 */
      const detailTimer = setInterval(() => {
        setProgress((prevProgress) => {
          const stage = Math.min(4, Math.floor(prevProgress / 20));
          const list = getStageDetails(stage, selectedArtType);
          setDetailIndex((prev) => (prev + 1) % (list.length || 1));
          return prevProgress;  /* 不修改 progress，只用于读取最新值 */
        });
      }, 600);

      const processResult = async (analysisResult: AnalysisResult) => {
        if (completed) return;
        completed = true;
        clearInterval(progressTimer);
        clearInterval(detailTimer);
        /* 真实分析完成，进度冲到 100% */
        setProgress(100);
        /* 计算并保存分析总耗时（毫秒），结果页显示为秒 */
        setAnalysisDuration(Date.now() - (startTimeRef.current ?? Date.now()));
        /* 异步保存到 data-service(API 优先,失败回退 LocalStorage),不阻塞 UI 切换 */
        try {
          await saveAnalysis(analysisResult);
        } catch (err) {
          console.error('保存分析结果失败:', err);
          toastRef.current.warning('诊断结果已生成,但保存到历史记录失败', '可在本地继续查看,刷新页面后可能丢失');
        }
        /* 分析成功:清理草稿 + 清除 URL query (任务包A) */
        if (draftIdRef.current) {
          try { deleteDraft(draftIdRef.current); } catch (e) { console.warn('清理草稿失败:', e); }
          draftIdRef.current = null;
          setDraftId(null);
          setDraftIdInUrl(null);
        }
        /* 短暂展示 100% 完成态，再切换到结果页 */
        setTimeout(() => {
          setResult(analysisResult);
          setStep('result');
          toastRef.current.success('分析完成', '诊断报告已生成并保存到历史记录');
        }, 400);
      };

      const handleError = (error: unknown) => {
        console.error('分析失败:', error);
        if (!completed) {
          completed = true;
          clearInterval(progressTimer);
          clearInterval(detailTimer);
          toastRef.current.error('图像分析失败', '请检查图片或网络后重试');
          /* 分析失败:保留草稿 (任务包A),状态回退为 draft 以便工作台显示"继续创作" */
          if (draftIdRef.current) {
            try { updateDraft(draftIdRef.current, { status: 'draft' }); } catch (e) { console.warn('更新草稿状态失败:', e); }
          }
          setStep('upload');
          setImageUrl('');
          setAnalysisDecision(null);
          setAnalysisDuration(null);
          startTimeRef.current = null;
        }
      };

      smartAnalyze(fileRef.current, imageUrl, selectedArtType, (decision) => {
        setAnalysisDecision(decision);
      })
        .then(processResult)
        .catch(handleError);

      return () => {
        completed = true;
        clearInterval(progressTimer);
        clearInterval(detailTimer);
      };
    }
  }, [step, imageUrl, selectedArtType]);

  const handleRetry = () => {
    /* 重置:清理草稿 + 清除 URL + 清除恢复预览 (任务包A) */
    if (draftIdRef.current) {
      try { deleteDraft(draftIdRef.current); } catch (e) { console.warn('清理草稿失败:', e); }
      draftIdRef.current = null;
      setDraftId(null);
      setDraftIdInUrl(null);
    }
    setRestoredPreview(undefined);
    setStep('upload');
    setImageUrl('');
    setResult(null);
    setAnalysisDecision(null);
    setAnalysisDuration(null);
    setShowTypeSwitcher(false);
    startTimeRef.current = null;
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
                      aria-label={art.name}
                      className={`p-4 rounded-xl text-center transition-all ${
                        isSelected
                          ? 'bg-cinnabar text-white shadow-card'
                          : 'bg-white text-ink-700 shadow-card hover:shadow-card-hover'
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
              <div className="bg-rice-50 rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="w-5 h-5 text-cinnabar" />
                  <h3 className="font-serif text-base font-bold text-ink-900">智能分析引擎</h3>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-rice-50 rounded-lg p-3">
                    <Cpu className="w-5 h-5 text-ink-600 mx-auto mb-1" />
                    <p className="text-xs text-ink-500">简单作品</p>
                    <p className="text-xs font-medium text-jade">本地分析</p>
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

            {/* 已恢复草稿提示 (任务包A):显示缩略图 + 类型,可放弃草稿重新开始 */}
            {draftId && restoredPreview && (
              <div className="mb-4 flex items-center gap-3 p-3 bg-cinnabar/5 border border-cinnabar/20 rounded-xl">
                {restoredPreview ? (
                  <img
                    src={restoredPreview}
                    alt="草稿缩略图"
                    loading="lazy"
                    className="w-14 h-14 rounded-md object-cover border border-ink-900/10 flex-shrink-0"
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900">已恢复未完成的草稿</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    类型:{artTypes.find((a) => a.id === selectedArtType)?.name} · 可重新上传继续诊断
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry();
                  }}
                  className="text-xs text-ink-500 hover:text-cinnabar transition-colors flex-shrink-0 px-2 py-1"
                >
                  放弃草稿
                </button>
              </div>
            )}

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
              <p className="text-ink-500 mb-4">支持 JPG、PNG 格式 · 可拖拽或 Ctrl+V 粘贴</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-rice-100 rounded-lg">
                <span className="font-medium">选择文件</span>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="max-w-3xl mx-auto">
            {/* === 顶部：作品 + 扫描线 + 中央进度环 === */}
            <div className="bg-rice-50 rounded-2xl overflow-hidden shadow-card">
              <div className="relative">
                <img
                  src={imageUrl}
                  alt="上传的作品"
                  loading="lazy"
                  className="w-full max-h-96 object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.img-fallback')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'img-fallback w-full h-48 bg-ink-100 flex items-center justify-center text-ink-400 text-sm';
                      fallback.textContent = '图片加载失败';
                      parent.insertBefore(fallback, target);
                    }
                  }}
                />
                {/* 半透明遮罩 + 扫描线（仅分析进行中显示，100% 时隐藏） */}
                {progress < 100 && (
                  <>
                    <div className="absolute inset-0 bg-ink-900/40" />
                    {/* AI 扫描线：从上到下循环移动 */}
                    <div className="absolute inset-x-0 scan-line-animation pointer-events-none">
                      <div className="h-0.5 bg-gradient-to-r from-transparent via-cinnabar to-transparent shadow-[0_0_12px_rgba(196,30,58,0.8)]" />
                      <div className="h-8 bg-gradient-to-b from-cinnabar/20 to-transparent" />
                    </div>
                  </>
                )}

                {/* 中央：大号进度百分比 + 当前阶段名 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-serif text-6xl font-bold text-white tabular-nums tracking-tight drop-shadow-lg">
                    {progress}<span className="text-3xl">%</span>
                  </p>
                  <p className="font-serif text-xl text-rice-100 mt-2 drop-shadow">
                    {ANALYSIS_STAGES[currentStage].name}
                  </p>
                  {analysisDecision && (
                    <div className="mt-3 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 inline-flex items-center gap-1.5">
                      {analysisDecision.mode === 'server' ? (
                        <Cloud className="w-3 h-3 text-rice-100" />
                      ) : (
                        <Cpu className="w-3 h-3 text-rice-100" />
                      )}
                      <span className="text-xs text-rice-100">
                        {analysisDecision.mode === 'server' ? '后端深度学习分析' : '本地智能分析'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 完成态标记 */}
                {progress === 100 && (
                  <div className="absolute top-4 right-4 bg-jade/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span className="text-xs text-white font-medium">分析完成</span>
                  </div>
                )}
              </div>

              {/* === 进度条（带流光高光） === */}
              <div className="px-6 py-4 border-t border-ink-900/6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-500">
                    {progress < 100 ? '正在分析' : '分析完成'}
                  </span>
                  <span className="text-xs font-mono text-ink-500 tabular-nums">{progress}/100</span>
                </div>
                <div className="relative h-2 bg-ink-900/8 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-cinnabar to-cinnabar-dark rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${progress}%` }}
                  >
                    {/* 进度条流光 */}
                    {progress < 100 && (
                      <div className="absolute inset-0 overflow-hidden rounded-full">
                        <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent progress-shine-animation" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* === 5 阶段流水线卡片 === */}
            <div className="mt-6 grid grid-cols-5 gap-2">
              {ANALYSIS_STAGES.map((stage, i) => {
                const Icon = stage.icon;
                const isDone = i < currentStage || progress === 100;
                const isActive = i === currentStage && progress < 100;
                const isPending = i > currentStage;
                return (
                  <div
                    key={stage.id}
                    className={[
                      'relative rounded-xl p-3 text-center border transition-all duration-300',
                      isDone
                        ? 'bg-jade/8 border-jade/30'
                        : isActive
                        ? 'bg-cinnabar/10 border-cinnabar/40 stage-pulse-animation'
                        : 'bg-rice-50 border-ink-900/6 opacity-60',
                    ].join(' ')}
                  >
                    <div className="flex justify-center mb-2">
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-jade" />
                      ) : isActive ? (
                        <Loader2 className={`w-5 h-5 text-cinnabar animate-spin`} />
                      ) : (
                        <Icon className={`w-5 h-5 ${isPending ? 'text-ink-400' : 'text-ink-500'}`} />
                      )}
                    </div>
                    <p className={`text-xs font-medium ${isDone ? 'text-jade' : isActive ? 'text-cinnabar' : 'text-ink-500'}`}>
                      {stage.name}
                    </p>
                    <p className="text-2xs text-ink-400 mt-0.5 hidden sm:block">{stage.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* === 实时专业术语描述（按阶段 + 艺术类型自适应，轮播淡入） === */}
            {(() => {
              const stageDetails = getStageDetails(currentStage, selectedArtType);
              const currentDetail = stageDetails[detailIndex % (stageDetails.length || 1)] || '';
              const StageIcon = ANALYSIS_STAGES[currentStage].icon;
              return (
                <div className="mt-4 bg-rice-50 border border-ink-900/6 rounded-xl overflow-hidden">
                  {/* 阶段标题栏 */}
                  <div className="px-4 py-2 bg-ink-900/[0.03] border-b border-ink-900/6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StageIcon className="w-3.5 h-3.5 text-cinnabar" />
                      <span className="text-xs font-medium text-ink-700">
                        阶段 {currentStage + 1}/5 · {ANALYSIS_STAGES[currentStage].name}
                      </span>
                    </div>
                    <span className="text-2xs font-mono text-ink-400">
                      {String((detailIndex % (stageDetails.length || 1)) + 1).padStart(2, '0')}/{String(stageDetails.length).padStart(2, '0')}
                    </span>
                  </div>
                  {/* 当前专业描述文字（轮播淡入） */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-cinnabar opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cinnabar" />
                    </span>
                    <p
                      key={`${currentStage}-${detailIndex}`}
                      className="text-sm text-ink-700 detail-fade-animation flex-1 truncate font-medium"
                    >
                      {currentDetail}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* === 三个维度的小预览（保持原有信息架构） === */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {ANALYSIS_CONFIG[selectedArtType].dimensions.map((dim, i) => {
                const Icon = dim.icon;
                return (
                  <div key={i} className="bg-rice-50 rounded-xl p-3 text-center border border-ink-900/6">
                    <Icon className={`w-5 h-5 ${dim.color} mx-auto mb-1.5`} />
                    <p className="text-xs text-ink-500">{dim.label}</p>
                    <div className="mt-2 h-1 bg-ink-900/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${dim.barColor} rounded-full transition-all duration-500 ease-out`}
                        style={{ width: `${Math.min(100, progress + i * 5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-8">
            {/* 结果页标题 + 分析耗时 */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-serif text-2xl font-bold text-ink-900">诊断报告</h2>
              <div className="flex flex-wrap items-center gap-2">
                {analysisDuration !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cinnabar/5 border border-cinnabar/20 rounded-full">
                    <Zap className="w-3 h-3 text-cinnabar" />
                    <span className="text-xs font-medium text-cinnabar">
                      分析耗时 <span className="font-mono tabular-nums">{(analysisDuration / 1000).toFixed(1)}s</span>
                    </span>
                  </div>
                )}
                {/* Phase F1:可观测性元信息徽章 */}
                {result.aiEnhanced === true && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#5a8a7a]/10 border border-[#5a8a7a]/30 rounded-full" title="本次分析经过 AI 视觉模型增强">
                    <Brain className="w-3 h-3 text-[#5a8a7a]" />
                    <span className="text-xs font-medium text-[#5a8a7a]">AI 增强</span>
                  </div>
                )}
                {result.cacheHit === true && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gold/10 border border-gold/30 rounded-full" title="相同图片命中缓存,跳过重复计算">
                    <Cpu className="w-3 h-3 text-gold" />
                    <span className="text-xs font-medium text-gold">缓存命中</span>
                  </div>
                )}
                {typeof result.jimpDurationMs === 'number' && typeof result.aiDurationMs === 'number' && (result.jimpDurationMs > 0 || result.aiDurationMs > 0) && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-ink-900/5 border border-ink-900/15 rounded-full" title="Jimp 本地算法 vs AI 视觉模型耗时分解">
                    <Cloud className="w-3 h-3 text-ink-600" />
                    <span className="text-xs font-medium text-ink-600">
                      Jimp <span className="font-mono tabular-nums">{result.jimpDurationMs}ms</span>
                      {' / '}
                      AI <span className="font-mono tabular-nums">{result.aiDurationMs}ms</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-rice-50 rounded-2xl overflow-hidden shadow-card">
              <div className="relative">
                <SmartImage
                  src={result.imageUrl}
                  alt="分析的作品"
                  className="w-full max-h-96 min-h-[200px]"
                  imgClassName="object-contain transition-opacity duration-300"
                  fallbackText="图片加载失败"
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-jade" />
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
              <div className="inline-flex items-center gap-4">
                <AnimatedScore score={result.overallScore} size={120} />
                <div className="text-left">
                  <p className="font-serif text-lg font-semibold text-ink-900">
                    {result.overallScore >= 85 ? '优秀' : result.overallScore >= 70 ? '良好' : '需改进'}
                  </p>
                  <p className="text-sm text-ink-500">继续加油，你的创作会越来越好！</p>
                </div>
              </div>
            </div>

            {/* 评分预设:选择标准+调节权重 */}
            {(() => {
              const dims = result.dimensions;
              const dimScores: Record<string, number> = {};
              if (isPainting(dims)) {
                dimScores.composition_form = dims.composition.score;
                dimScores.color = dims.color.score;
                dimScores.technique = dims.brushwork.score;
                dimScores.overall = result.overallScore;
              } else if (isDesign(dims)) {
                dimScores.visual_hierarchy = dims.visualHierarchy.score;
                dimScores.layout = dims.typography.score;
                dimScores.color_application = dims.colorApplication.score;
                dimScores.creativity = result.originality.score;
              } else if (isProduct(dims)) {
                dimScores.form_semantics = dims.form.score;
                dimScores.material = dims.materialExpression.score;
                dimScores.function = dims.functionExpression.score;
                dimScores.ergonomics = result.overallScore;
              } else if (isSculpture(dims)) {
                dimScores.spatial_composition = dims.spatialComposition.score;
                dimScores.form_language = dims.bodyLanguage.score;
                dimScores.material_language = dims.materialLanguage.score;
                dimScores.concept = result.originality.score;
              }
              return (
                <PresetSelector
                  analysisId={result.id}
                  artType={result.artType}
                  dimensionScores={dimScores}
                  currentScore={result.overallScore}
                />
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {isPainting(result.dimensions) && (
                <>
                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
                    <DimensionHeader icon={Palette} title="色彩诊断" score={result.dimensions.color.score} color="stone" />
                    {/* Phase F1:色彩和谐度环形可视化(有 harmonyType/harmonyScore 时展示) */}
                    {(result.dimensions.color.harmonyType || typeof result.dimensions.color.harmonyScore === 'number') && (
                      <HeatmapSection
                        data={[]}
                        title="色彩和谐度"
                        harmonyData={{
                          harmonyScore: result.dimensions.color.harmonyScore,
                          harmonyType: result.dimensions.color.harmonyType,
                          dominantColor: result.dimensions.color.dominantColor,
                        }}
                      />
                    )}
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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
                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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
                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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
                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

                  <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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

            {/* 专业改进建议(AI增强模式/Phase B4): 按priority排序显示,旧数据无此字段时不渲染 */}
            {result.professionalSuggestions && result.professionalSuggestions.length > 0 && (
              <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-cinnabar/10 rounded-lg flex items-center justify-center">
                    <Brain className="w-5 h-5 text-cinnabar" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-ink-900">AI专业诊断建议</h3>
                    <p className="text-xs text-ink-500">基于视觉特征数据锚定,按优先级排序</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortSuggestionsByPriority(result.professionalSuggestions).map((sug, idx) => (
                    <ProfessionalSuggestionCard key={idx} sug={sug} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* 原创性检测 - 全宽卡片 */}
            <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
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
                    result.originality.similarity < 0.15 ? 'text-jade' :
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
                      result.originality.similarity < 0.15 ? 'bg-jade' :
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

            {/* Phase F1:算法指标卡片 - 展示 Phase A 新增的客观算法指标 */}
            {(() => {
              const dims = result.dimensions;
              const metrics: Array<{ label: string; value: string; hint?: string }> = [];

              // 构图类指标(painting/design/product/sculpture 共享 composition 系列字段)
              const comp = isPainting(dims) ? dims.composition :
                           isDesign(dims) ? dims.visualHierarchy :
                           isProduct(dims) ? dims.form :
                           dims.spatialComposition;
              if (typeof comp.goldenRatioScore === 'number') {
                metrics.push({ label: '黄金分割评分', value: `${comp.goldenRatioScore.toFixed(1)}`, hint: '0-100,越高越接近黄金分割' });
              }
              if (typeof comp.ruleOfThirdsScore === 'number') {
                metrics.push({ label: '三分法评分', value: `${comp.ruleOfThirdsScore.toFixed(1)}`, hint: '0-100,焦点落在三分线交点' });
              }
              if (typeof comp.leadingLineDirection === 'number' && typeof comp.leadingLineStrength === 'number') {
                metrics.push({
                  label: '引导线',
                  value: `${comp.leadingLineStrength.toFixed(2)} @ ${Math.round(comp.leadingLineDirection)}°`,
                  hint: '强度(0-1)与方向(0-180°)',
                });
              }

              // 色彩类指标(仅 painting 有 color 维度)
              if (isPainting(dims)) {
                const color = dims.color;
                if (typeof color.harmonyScore === 'number') {
                  metrics.push({ label: '色彩和谐度', value: `${color.harmonyScore.toFixed(1)}`, hint: '0-100,越高色彩越和谐' });
                }
                if (color.harmonyType) {
                  metrics.push({ label: '和谐类型', value: color.harmonyType, hint: '色彩和谐方案' });
                }
                if (color.saturationDistribution) {
                  const sd = color.saturationDistribution;
                  metrics.push({
                    label: '饱和度分布',
                    value: `低${Math.round(sd.low * 100)}% / 中${Math.round(sd.mid * 100)}% / 高${Math.round(sd.high * 100)}%`,
                    hint: '三级饱和度像素占比',
                  });
                }
              }

              // 笔触结构张量(仅 painting)
              if (isPainting(dims) && dims.brushwork.structureTensor) {
                const st = dims.brushwork.structureTensor;
                metrics.push({
                  label: '结构张量',
                  value: `一致${st.coherence.toFixed(2)} / 能量${st.energy.toFixed(2)} / ${Math.round(st.dominantDirection)}°`,
                  hint: '笔触方向一致性、能量与主导方向',
                });
              }

              if (metrics.length === 0) return null;
              return (
                <div className="bg-rice-50 rounded-2xl p-6 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Cpu className="w-5 h-5 text-ink-700" />
                    <h3 className="font-serif text-lg font-semibold text-ink-900">算法指标</h3>
                    <span className="text-xs text-ink-500 ml-1">客观像素级计算结果</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {metrics.map((m) => (
                      <div key={m.label} className="bg-white/60 rounded-lg p-3 border border-ink-100">
                        <div className="text-xs text-ink-500 mb-1">{m.label}</div>
                        <div className="text-sm font-mono tabular-nums font-medium text-ink-800">{m.value}</div>
                        {m.hint && <div className="text-[10px] text-ink-400 mt-1">{m.hint}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={handleRetry}
                aria-label="重新上传"
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-ink-900 text-ink-900 rounded-lg hover:bg-ink-900 hover:text-rice-100 transition-all duration-300"
              >
                <Upload className="w-5 h-5" />
                <span className="font-medium">重新上传</span>
              </button>
              <button
                onClick={() => setShowTypeSwitcher((v) => !v)}
                aria-label="切换类型重测"
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-[#5a8a7a] text-[#5a8a7a] rounded-lg hover:bg-[#5a8a7a] hover:text-rice-100 transition-all duration-300"
              >
                <RefreshCw className="w-5 h-5" />
                <span className="font-medium">切换类型重测</span>
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
                aria-label="导出报告"
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
                    toast.success('链接已复制', '可直接粘贴分享诊断结果');
                  }
                }}
                aria-label="分享报告"
                className="inline-flex items-center gap-2 px-6 py-3 bg-cinnabar text-rice-100 rounded-lg hover:bg-stone transition-all duration-300"
              >
                <Share2 className="w-5 h-5" />
                <span className="font-medium">分享报告</span>
              </button>
              <button
                onClick={() => {
                  document.querySelector('footer')?.scrollIntoView({ behavior: 'smooth' });
                }}
                aria-label="查看历史记录"
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-cinnabar text-cinnabar rounded-lg hover:bg-cinnabar hover:text-rice-100 transition-all duration-300"
              >
                <span className="font-medium">查看历史记录</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* 切换类型重新分析：不重新上传图片，直接用新类型重新触发分析 */}
            {showTypeSwitcher && (
              <div className="flex flex-wrap justify-center items-center gap-2">
                <span className="text-sm text-ink-500 mr-2">选择新类型：</span>
                {artTypes.map((art) => {
                  const Icon = art.icon;
                  const isCurrent = selectedArtType === art.id;
                  return (
                    <button
                      key={art.id}
                      onClick={() => {
                        setSelectedArtType(art.id);
                        setShowTypeSwitcher(false);
                        setResult(null);
                        setAnalysisDuration(null);
                        setProgress(0);
                        setDetailIndex(0);
                        setStep('analyzing');
                      }}
                      disabled={isCurrent}
                      aria-label={art.name}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                        isCurrent
                          ? 'bg-ink-900/10 text-ink-400 cursor-not-allowed'
                          : 'bg-rice-50 border border-ink-200 text-ink-700 hover:bg-[#5a8a7a] hover:text-rice-100 hover:border-[#5a8a7a]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{art.name}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowTypeSwitcher(false)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-ink-500 hover:text-ink-700 transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
