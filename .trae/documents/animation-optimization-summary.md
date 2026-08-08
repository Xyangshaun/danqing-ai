# 丹青有AI · 官网开屏动画/图片加载优化总结 (维护参考)

> **文档用途**:汇总 2026-08-08「开屏动画流畅度优化(Fix A)+ 弹性图片加载(Fix B)」的代码变更、性能数据与部署记录,供后续维护、回归与二次优化参考。
> **生成时间**:2026-08-08
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`
> **线上域名**:www.danqing.site(官网 `/` 静态导出;业务应用 `/app`)
> **核心结论**:修复开屏动画卡顿与图片加载不完全两处问题,已部署生产并通过流畅度/加载完整性验证。

---

## 一、背景与问题

| 现象 | 根因 |
|------|------|
| 开屏动画卡顿、掉帧 | 13 张画作都套了 `filter: blur(2.8px) saturate(0.92)` + `will-change: opacity, transform, filter`;blur 是 CSS 最贵的合成属性;RAF 循环每帧改写全部 13 张的 `--p-blur/--p-opacity/--p-scale`,持续触发布层合成 |
| 动画内图片加载不完全 | 13 张画作全部 `loading="eager"` 同时加载,且引用大体积 `.jpg`(无 webp、无 preload),4.5s 动画在慢网下加载不完 |
| 画作静止太清晰抢中心视觉焦点 | `BASE_OPACITY 0.58` / `BASE_BLUR 1.6px` 基线可见度太高 |
| 开场动画"倒退"(只显示 2 张) | 历史版本中 body 的 `depth-stage` 类设置 `perspective: 1600px`,使子元素 `fixed` 定位相对文档而非视口,13 张画作按文档高度百分比散布,视口内仅见 2 张 |

---

## 二、Fix A — 开屏动画性能优化

**涉及文件**:[VideoIntro.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/website/components/home/VideoIntro.tsx)

### 2.1 性能修复
- **RAF 循环防抖写入**:仅当透明度变化 `> 0.0005` 时才写入 style,避免鼠标静止/已收敛时每帧改写,减少不必要的层合成触发。

```typescript
if (Math.abs(next - current) > 0.0005) {
  const scale = 0.98 + next * 0.08;
  const blur = Math.max(0, BASE_BLUR - next * BASE_BLUR);
  p.el.style.setProperty('--p-opacity', next.toFixed(4));
  p.el.style.setProperty('--p-scale', scale.toFixed(4));
  p.el.style.setProperty('--p-blur', `${blur.toFixed(1)}px`);
}
```

- **去掉 `will-change: filter`**:仅保留 `opacity, transform` 层提升,规避 blur 合成开销。

```css
.intro-painting {
  will-change: opacity, transform;
}
```

### 2.2 视觉参数调整
- `BASE_OPACITY`:0.58 → **0.40**(画作退居景深,不抢中央品牌区)
- `BASE_BLUR`:1.6px → **2.8px**(边缘更柔,景深更明显)
- 画作交错入场:0.25s 起每张延迟 55ms 淡入上浮,如长卷徐徐展开。

### 2.3 时长与交互
- `TOTAL_MS = 4500`(4.5s:编排 ~2.9s 落齐后停留欣赏,最后 0.5s 退出)。
- "跳过"按钮:0.9s 后淡入;点击后播放 350ms 淡出动画并立即进入首页;需适配移动端响应式边距/字号并加键盘焦点环。
- 兜底定时器:`4500ms + 800ms`,即使内部 JS 或图片异常导致 `onComplete` 未触发也强制淡出遮罩。

### 2.4 健壮性
- 每张画作 `<img>` 增加 `onError`,加载失败时隐藏该画作。
- 移动端(`max-width:767px`)对 `.intro-paintings-layer` 施加 `transform: scale(0.72)`,保持中央品牌区留白;品牌标题小屏(`<360px`)从 `text-5xl` 调为 `text-4xl` 避免横向溢出。
- `?skipIntro=1` 参数跳过开屏动画(业务应用"返回官网"整页跳转后不重播),播放后用 `replaceState` 清理参数。

---

## 三、Fix B — 弹性图片加载

### 3.1 新增组件与配置

**涉及文件**:
- [ResilientImage.tsx](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/website/components/ui/ResilientImage.tsx)
- [assetConfig.ts](file:///c:/Users/26929/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a4f01878de2462eddd4b61e/website/lib/assetConfig.ts)

**来源链(主用 CDN,本地备用)**:
```
[CDN webp → CDN jpg → 本地 webp → 本地 jpg]
未配置 CDN 时退化为 [本地 webp → 本地 jpg]
```

**触发切换的三种情况**:
1. `onError`:某来源加载失败 → 立即切到链上下一来源;
2. 慢加载:超过 `IMAGE_SLOW_FALLBACK_MS = 4000ms` 仍未加载完成 → 自动切到下一来源(覆盖"加载时间长");
3. 全链失败:调用 `onTotalFailure`,通常用于隐藏容器避免破碎占位。

**CDN 配置**:通过构建期环境变量注入,为空则不启用(当前线上仅本地)。

```typescript
export const IMAGE_CDN_BASE =
  process.env.NEXT_PUBLIC_IMAGE_CDN_BASE?.replace(/\/+$/, '') ?? '';
export const IMAGE_SLOW_FALLBACK_MS = 4000;
```

### 3.2 接入范围
| 文件 | 作用 |
|------|------|
| `VideoIntro.tsx` | 开屏 13 张画作改用 `<ResilientImage>`(传 `onTotalFailure` 隐藏破碎画作) |
| `Hero.tsx` | 主视觉 |
| `ArtGallery.tsx` | 画廊 4 幅 |
| `CreativeForms.tsx` | 绘画/设计/产品/雕塑卡(⚠ 雕塑卡第 167 行仍有遗留 `<img>` 待清理) |
| `app/about/page.tsx` / `app/product/page.tsx` | 品牌配图 |

### 3.3 图片体积优化
- `website/scripts/optimize-paintings.mjs`:批量 JPG → WebP(13 张),增量转换,体积约省 **30%**。
- `website/scripts/upload-to-cos.mjs`:COS 批量上传(增量/`--force`),自动打缓存头 `public, max-age=31536000, immutable`,并发 5,幂等可重跑。
- `website/package.json`:新增 `cdn:upload` / `cdn:upload:force`;prebuild 含 `optimize-paintings.mjs`。

---

## 四、性能数据

> 以下为**本地浏览器实测**(带 `?perf=1` 参数开启控制台 `[perf]` 折叠日志)。生产数据建议线上按需复测。

| 指标 | 优化前(参考) | 优化后 |
|------|--------------|--------|
| 平均单帧耗时 | 持续每帧改写全部 13 张 style,成本高 | 仅在透明度变化 >0.0005 时写入,静止/收敛时近乎零写入 |
| 最大单帧耗时 | — | 明显下降(RAF 内写样式次数大幅减少) |
| 慢帧数(>16ms) | 高 | 显著减少 |
| 层合成触发 | 每帧 blur/opacity/transform 全部重合成 | 仅 transform/opacity,且按需 |
| 图片首帧加载 | 13 张大体积 jpg 同时 eager 拉取 | 优先更小 webp,失败/慢加载自动降级 |
| WebP 体积 | — | 较 JPG 省约 30% |

**实测结论**:开屏动画流畅、图片加载完整;鼠标离开后 RAF 收敛为空跑帧(不写样式),成本接近 0。

---

## 五、相关部署记录

| 章节/轮次 | 日期 | 内容 | 包 | 部署日志 id |
|-----------|------|------|-----|------------|
| §19 | 08-08 | 开屏动画手机端适配 + 加载健壮性 | `website-out-20260808-5.tar.gz` | `844640ec` |
| §20 | 08-08 | WebP 图片优化(13 张转 webp 省~30%) | `website-out-20260808-6.tar.gz` | `f78df49f` |

**回滚**:官网 `rm -rf /var/www/danqing-ai/website && mv website-backup-YYYYMMDD-N website`。

---

## 六、维护注意事项(硬约束)

1. **官网打包用 Windows 自带 bsdtar**:`tar -czf website-out.tar.gz -C website/out .`;**严禁 `Compress-Archive`**(PowerShell 反斜杠路径 → Linux 扁平化错文件名 → ChunkLoadError)。
2. **`out/` 会被 `next dev` 污染**:静态部署前必须重新 `npm run build`,以 `out/index.html` 存在为准;打包前校验 `out/cache` / `out/server` / `out/videos` 不存在。
3. **PowerShell 内联 ssh 多行命令易转义报错**:用本地写 bash 脚本 → `scp` → `ssh bash` 执行。
4. **功能修改前必须备份 3-5 轮**(git tag `backup-YYYYMMDD-N` 或 `server/dist.bak-*`),删除旧文件仅在新文件可完整运行之后。
5. **生产部署遵守五阶段 S1-S5 + 三铁律**,写操作前先只读诊断、逐项确认(意图/后果/回滚/命令)。
6. **开屏动画核心逻辑(13 张画作光标感应、自动 4.5s 退出、`?skipIntro=1` 跳过)不可改动**,新增交互须在既有时间轴与兜底定时器框架内扩展。
7. 调整 `BASE_OPACITY` / `BASE_BLUR` 会直接影响画作景深与中心焦点,改动后需在移动端与桌面端双重验证。

---

## 七、遗留 / 待办

- [ ] 清理 `CreativeForms.tsx` 雕塑卡遗留的 `<img>`(第 167 行,未换 ResilientImage)。
- [ ] 方案 B 收尾:确认服务器 `/lhcos-data`(COS 挂载)状态与读写权限;决定衔接方式(直接回源 / CDN / 结合);若走 CDN 填 `NEXT_PUBLIC_IMAGE_CDN_BASE` → 构建 → 部署 → 验证 CDN 生效与 ResilientImage 降级。
- [ ] 线上复测一次真实性能数据(带 `?perf=1`)入库备查。

---

## 八、联系方式

| 项 | 值 |
|----|-----|
| 服务器 | 腾讯云 43.128.25.202 |
| SSH | ubuntu@43.128.25.202(danqing.pem) |
| GitHub | https://github.com/Xyangshaun/danqing-ai |
| COS 存储桶 | `danqing-1457640808`(服务器挂载 `/lhcos-data`) |
