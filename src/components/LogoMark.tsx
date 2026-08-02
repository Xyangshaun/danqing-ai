import { memo, useState } from 'react';

/**
 * DQ AI LogoMark — "朱印·凝眸"
 *
 * ── 设计理念（参考 Pinterest 品牌 Logo / 印章设计原则）──
 *
 * 【文化锚点】朱砂红(#c41e3a)圆角方印，如国画名家落款闲章，呼应"丹青"内核。
 *   1px 呼吸边距，6px 圆角，方中寓圆——"不依规矩不成方圆"。
 *
 * 【白文印式】白色(#fdfcf9)填充字母，如印章"白文"（阴刻）效果：
 *   文字留红（朱）底，笔画饱满有力，这是中国印章最经典的样式。
 *
 * 【D 形构筑】竖笔（3px 宽）+ 饱满贝塞尔弧：
 *   - 竖笔如立锋，稳健厚重
 *   - 弧如运笔成形，从顶端向右下流畅弯到底端
 *   - 弧最右点 x=15，与 Q 保持 2px 呼吸间距
 *
 * 【Q 形构筑】双层圆构成：
 *   - 外圆白色填充（r=5），构成 Q 的 O 主体
 *   - 内圆镂空（朱砂色，r=2.8），形成圆环/字怀效果
 *   - 白色斜尾(45°)从外圆右下缘飞白而出，是 Q 的辨识锚点
 *   - 这种"外实内空"的处理让 Q 在小尺寸下依然清晰
 *
 * 【AI 凝眸】Q 内镂空中心一颗赤金点(#d4af37, r=1.2)：
 *   - 如 AI 的瞳孔，洞察每一件作品
 *   - 金色在朱砂镂空处熠熠生辉，成为视觉焦点与记忆点
 *   - 也是整个 Logo 的"气眼"，呼应中国美学中的"留白透气"
 *
 * 【色彩克制】三色：朱砂底 / 米白字 / 赤金睛
 *   无渐变、无阴影、无特效——极简即高级
 *
 * 【小尺寸保真】D 竖笔 ≥ 3px，Q 圆环壁厚 ≥ 2.2px，金点 2.4px
 *   在 16px favicon 尺寸下 DQ 仍可辨识
 *
 * ── 32×32 viewBox 精确几何 ──
 * 朱印底:  rect(1,1,30,30) rx=6
 * D:       M 6 6 L 9 6 C 14 6 15 11 15 16 C 15 21 14 26 9 26 L 6 26 Z
 * Q外圆:  circle(22,16) r=5
 * Q内圆（镂空）: circle(22,16) r=2.8 fill=#c41e3a
 * Q尾:    rect(24.8,19.8,4.5,2.6) 旋转45°，圆头
 *         或 line(25.5,19.5)-(28.5,22.5) stroke-width=2.6 round
 * 金睛:   circle(22,16) r=1.2 fill=#d4af37
 */
function LogoMark() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2.5 group flex-shrink-0 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="DQ AI 丹青智能创作"
      translate="no"
    >
      <div className="relative w-8 h-8" aria-hidden="true">
        {/* 悬停光晕 */}
        <div
          className={`absolute inset-0 rounded-lg bg-cinnabar/25 blur-md transition-opacity duration-300 ease-out ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <svg
          viewBox="0 0 32 32"
          className="relative w-8 h-8 transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: isHovered ? 'scale(1.08)' : 'scale(1)' }}
          aria-hidden="true"
          focusable="false"
        >
          {/* ① 朱印底 */}
          <rect x="1" y="1" width="30" height="30" rx="6" fill="#c41e3a" />

          {/* ② D 字母 — 白色填充 */}
          <path
            d="M 6 6
               L 9 6
               C 14.5 6, 15.5 11, 15.5 16
               C 15.5 21, 14.5 26, 9 26
               L 6 26
               Z"
            fill="#fdfcf9"
          />

          {/* ③ Q 外圆 — 白色填充 */}
          <circle cx="22" cy="16" r="5" fill="#fdfcf9" />

          {/* ④ Q 内圆 — 镂空（朱砂色，露出底） */}
          <circle cx="22" cy="16" r="2.8" fill="#c41e3a" />

          {/* ⑤ Q 尾笔 — 白色斜出笔触 */}
          <line
            x1="25.5"
            y1="19.5"
            x2="28.5"
            y2="22.5"
            stroke="#fdfcf9"
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          {/* ⑥ AI 金睛 */}
          <circle cx="22" cy="16" r="1.2" fill="#d4af37" />
        </svg>
      </div>

      {/* === 文字标识 === */}
      <div className="hidden md:block min-w-0">
        <div
          className="font-serif text-base font-bold leading-none tracking-wide flex items-baseline"
          style={{
            transition: 'transform 0.2s ease-out',
            transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
          }}
        >
          <span className="text-ink-900">DQ</span>
          <span className="text-cinnabar ml-0.5 font-sans font-semibold text-sm">AI</span>
        </div>
        <p className="text-2xs text-ink-400 mt-0.5 leading-none tracking-widest">
          丹青智能创作
        </p>
      </div>
    </div>
  );
}

/**
 * React.memo 包裹:LogoMark 无 props,父组件(如 Header)重渲染时跳过。
 * 内部 hover 状态变化仍正常触发自身重渲染。
 */
export default memo(LogoMark);

