# 实时图片搜索解决方案技术文档

> 项目：丹青有AI（艺术作品智能分析平台）
> 版本：v1.0
> 状态：设计稿（待评审实施）
> 适用端：Web 前端 / 后端 / 静态资源层

---

## 1. 方案概述

### 1.1 目标

在**不影响用户体验**的前提下，为平台的作品图片提供**实时搜索 + 快速加载**能力：

- 输入关键字即时响应，搜索延迟 **≤ 300ms**
- 支持关键词联想与自动补全
- 图片加载 **≤ 500ms**，渐进式 / 懒加载 / 预加载
- 弱网自适应降级
- 主流浏览器（Chrome / Firefox / Safari / Edge 最新两版）及移动设备兼容

### 1.2 现状盘点（与本方案衔接点）

| 现状能力 | 位置 | 本方案演进 |
|---------|------|-----------|
| 前端 React 18.2 + Vite | `src/` | 复用，新增搜索交互层 |
| `SmartImage` 组件（骨架屏/重试/懒加载） | `src/components/SmartImage.tsx` | 复用，扩展渐进式加载 |
| `useLazyImage` Hook（IntersectionObserver） | `src/hooks/useLazyImage.ts` | 复用，扩展预加载 |
| 后端内存知识库（倒排索引） | `server/src/services/knowledge.service.ts` | 借鉴索引思想，改服务端预计算索引 |
| 图片存储 `/lhcos-data/uploads/`（Nginx 公开 `/uploads/`） | 服务器 | 复用，新增 CDN/压缩管道 |
| Nginx 静态服务 + 缓存 + HTTPS | `deploy/nginx-site.conf` | 复用，新增图片缓存 header |

---

## 2. 三种主流方案对比

### 方案 A：客户端全量缓存 + 本地过滤

**原理**：首次加载把元数据（标题/标签/缩略图 URL）全量下发到浏览器，客户端内存过滤，图片按需拉取。

| 维度 | 评估 |
|------|------|
| 优点 | 搜索延迟极低（纯内存，<10ms）；无网络往返；离线可用 |
| 缺点 | 元数据量大时首包大；数据难实时更新；移动端内存受限；多租户/权限在客户端易绕过 |
| 实现复杂度 | ★★☆☆☆ |
| 性能 | 搜索最优，但首屏/冷启动差 |
| 适用 | 数据量小（<2000 条）、全量公开场景 |

**结论**：本项目作品可能含未发布/草稿权限，客户端全量下发有数据泄露风险，**不推荐作为主方案**。

### 方案 B：服务端预计算索引 + 防抖搜索 API（推荐）

**原理**：后端预构建倒排索引/标签索引，前端输入**防抖(debounce)**后调用搜索 API，返回**分页 + 缩略图 URL**，图片由 CDN/静态层加速加载。

| 维度 | 评估 |
|------|------|
| 优点 | 权限校验在服务端（安全）；索引可实时重建；数据量可扩展；与现有 `knowledge.service.ts` 架构一致 |
| 缺点 | 每次搜索有网络往返；需做好防抖与请求取消；服务端有计算开销 |
| 实现复杂度 | ★★★☆☆ |
| 性能 | 搜索 100-300ms（可达成）；配合 CDN 图片加载快 |
| 适用 | 通用、安全敏感、数据量中等以上的场景 |

**结论**：与现有架构、安全模型最契合，**作为核心方案**。

### 方案 C：CDN 加速 + 服务端预计算索引（B 的增强版）

**原理**：在方案 B 基础上，把搜索 API 与缩略图全部前置到 CDN 边缘节点，热点索引在 CDN 缓存，图片从最近节点返回。

| 维度 | 评估 |
|------|------|
| 优点 | 就近访问，弱网体验最佳；静态图 CDN 命中后加载极快；可缓存搜索结果 |
| 缺点 | 需 CDN 服务（成本）；动态搜索需回源；缓存失效策略复杂 |
| 实现复杂度 | ★★★★☆ |
| 性能 | 最优（图片 100-300ms，搜索就近命中 <100ms） |
| 适用 | 生产环境、多地域用户、高并发 |

**结论**：作为**上线增强层**，在方案 B 稳定后叠加。

### 对比汇总

| 指标 | A 客户端缓存 | B 服务端索引（推荐） | C CDN 增强 |
|------|------------|---------------------|-----------|
| 搜索延迟 | <10ms | 100-300ms | <100ms |
| 图片加载 | 中 | 中 | 最优 |
| 数据安全 | 差 | 好 | 好 |
| 实时性 | 差 | 好 | 好 |
| 复杂度 | 低 | 中 | 高 |
| 成本 | 无 | 无 | CDN 费用 |
| 推荐度 | 不推荐 | **主方案** | 上线增强 |

---

## 3. 系统架构图

```
┌─────────────────────────────── 浏览器（Web 前端）───────────────────────────────┐
│                                                                                  │
│  输入框 ──防抖 200ms──▶ useDebouncedSearch ──▶ 请求取消(AbortController)          │
│     │                        │                                                   │
│ 关键词联想 ◀── 补全下拉 ◀─── search/suggest API                                  │
│     │                        │                                                   │
│  结果网格 ── SmartImage 渐进加载 ── useLazyImage 懒加载 + 预加载(next frames)     │
│     │                                                                             │
└─────┼────────────────────────────────────────────────────────────────────────────┘
      │ HTTPS /api/v1/images/search
      ▼
┌────────────────────────── Nginx（反向代理 + 静态/图片缓存）──────────────────────┐
│  /uploads/*  → 图片静态服务（Cache-Control: immutable + ETag）                    │
│  /api/*      → 代理到后端（限流）                                                 │
└─────┼────────────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────── 后端 Node.js/Express ─────────────────────────────────┐
│  routes/images/search     → controller（鉴权+租户+校验）                           │
│  services/image-search    → 预计算索引（倒排+标签+分类）                           │
│  services/image-suggest   → 联想补全（Trie 前缀）                                  │
│  缓存层：Redis（搜索结果 TTL 60s）                                                 │
│  图片管道：上传 → 压缩 → 多尺寸缩略图 → 落盘 /uploads/                            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**数据流**：
1. 用户输入 → 前端防抖 200ms → 发搜索请求（带 AbortController）
2. 后端鉴权/租户隔离 → 查 Redis 缓存 → 未命中查索引 → 返回分页结果 + 缩略图 URL
3. 前端渲染结果网格 → 图片经 CDN/Nginx 缓存加载 → 懒加载 + 渐进式显示
4. 输入变化 → 取消旧请求 → 发起新请求（避免竞态）

---

## 4. 关键技术实现细节

### 4.1 实时搜索（≤300ms）

**前端防抖 + 请求取消**：

```ts
// hooks/useDebouncedSearch.ts
export function useDebouncedSearch<T>(fetcher: (q: string) => Promise<T>, deps = [], delay = 200) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const run = (q: string) => {
    clearTimeout(timerRef.current!);
    controllerRef.current?.abort();          // 取消上一次在途请求
    const controller = new AbortController();
    controllerRef.current = controller;
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetcher(q);         // 自行绑定 signal
        setData(res);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(e as Error);
      } finally {
        setLoading(false);
      }
    }, delay);
  };
  return { data, loading, error, run };
}
```

- **防抖 200ms** 保证输入连续时不发冗余请求，最终请求延迟 < 300ms 达标。
- **AbortController** 取消旧请求，避免竞态（后发先至覆盖新结果）。
- **loading 态** 驱动骨架屏 / 加载动画，主线程不被阻塞（由 React 异步调度处理）。

**后端搜索索引**（借鉴 `knowledge.service.ts`）：

```ts
// services/image-search.service.ts（示意）
interface ImageDoc {
  id: string; title: string; tags: string[]; category: string;
  status: 'published' | 'draft' | 'archived';
  thumbUrl: string; fullUrl: string; meta: { width: number; height: number; size: number };
}
// 倒排索引：token -> Set<imageId>；字段加权 title×5 / tags×4 / category×2
// 预计算：启动时构建 + 上传/更新时增量维护
```

### 4.2 关键词联想与自动补全

- 服务端维护 **Trie（前缀树）** 或复用倒排索引的 token 集，`GET /api/v1/images/suggest?q=素` 返回前缀匹配词（如「素描」「素材」）。
- 前端输入 `≥2` 字符时触发，下拉展示，**防抖 150ms**，独立于搜索的取消逻辑。
- 结果限制 8 条，避免渲染压力。

### 4.3 图片加载性能（≤500ms）

#### 渐进式加载
- 服务端图片管道生成**多尺寸**：`thumb`(320px) / `medium`(800px) / `full`(原图)。
- 搜索结果网格先加载 `thumb`（极小、快），点击后按需加载 `full`。
- `SmartImage` 组件扩展：先显示模糊占位（`blur` 的小图），再平滑过渡到 `medium`。

#### 懒加载
- 复用 `useLazyImage`（IntersectionObserver），仅视口内图片发起请求，`rootMargin` 预加载 200px。

#### 预加载
- 首屏结果数限制（如 20 条 = 4 行），滚动前预取「下一屏」的 `thumb` 到浏览器缓存（`<link rel="preload">` 或 `new Image().src`）。

#### 自适应（弱网）
- 通过 `Network Information API`（`navigator.connection.effectiveType`）判断网速：
  - `4g`：加载 `medium`
  - `3g`：加载 `thumb`
  - `2g/slow-2g`：仅加载 `thumb` + 关闭自动播放动效
- 降级方案：弱网下显示「轻量模式」开关，强制只加载缩略图。

### 4.4 图片管道（上传→压缩→落盘）

```
上传 → 校验(类型/大小) → sharp 压缩 → 生成 thumb/medium/full
     → 提取元信息(宽高) → 写入元数据索引 → 落盘 /uploads/<id>/
```

- 使用 `sharp`（libvips）做格式转换与压缩，吞吐高、内存占用低。
- 输出 **AVIF / WebP**（现代浏览器），`<picture>` 标签按浏览器能力回退 JPEG。

---

## 5. 性能优化策略

| 策略 | 措施 | 收益 |
|------|------|------|
| 图片压缩 | sharp 压缩到 origin 质量 80%；色度子采样 4:2:0 | 体积降 50-70% |
| 格式优化 | 输出 WebP + AVIF，`<picture>` 回退 | 体积再降 30-50% |
| 资源缓存 | `Cache-Control: immutable` + ETag + 长 hash 文件名 | 二次访问零网络 |
| 请求合并 | 搜索结果分页（20/页）+ `suggest` 独立合并 | 减少请求数 |
| 分页加载 | 滚动无限加载（IntersectionObserver + hasMore） | 首屏快 |
| CDN | 边缘缓存缩略图 + 搜索结果 JSON | 就近、快速 |
| React 调度 | `useTransition` 标记非紧急更新，避免 UI 卡顿 | 不阻塞主线程 |

### 请求合并示例
- 滚动加载使用 `page` 参数，单次请求返回 20 条；`suggest` 与 `search` 分离，各自防抖。
- 小尺寸缩略图可走 **HTTP/2 多路复用**（Nginx 已启用则天然收益）。

---

## 6. 兼容性处理方案

| 目标 | 处理方式 |
|------|---------|
| Chrome/Firefox/Safari/Edge 最新两版 | 全量支持；`IntersectionObserver`、`AbortController`、`useTransition` 均已原生支持 |
| 旧浏览器（可选回退） | 提供 polyfill：`intersection-observer`、`abort-controller`；`<picture>` 回退 JPEG |
| WebP/AVIF 检测 | `canvas.toDataURL('image/webp')` 探测；不支持则走 JPEG |
| 移动端 | 触屏友好：点击卡片进入详情；`effectiveType` 弱网降级；`300px` 定位手势友好 |
| 低内存移动端 | 缩略图不超过 320px；首屏仅渲染可见项（虚拟列表） |
| 无障碍 | 图片 `alt`；键盘可导航；`aria-live` 提示搜索状态 |

---

## 7. 测试指标与验证方法

### 7.1 核心 Web 指标（Web Vitals）

| 指标 | 目标 | 验证工具 |
|------|------|---------|
| FCP（首次内容绘制） | ≤ 1.8s | Lighthouse / WebPageTest |
| LCP（最大内容绘制） | ≤ 2.5s | Lighthouse / CrUX |
| CLS（累积布局偏移） | ≤ 0.1 | Lighthouse（图片预留宽高比） |
| INP（交互到绘制） | ≤ 200ms | Web Vitals JS |

### 7.2 搜索专项指标

| 指标 | 目标 | 方法 |
|------|------|------|
| 搜索端到端延迟 | ≤ 300ms | 前端打点 `performance.mark` |
| 联想补全延迟 | ≤ 150ms | 同上 |
| 图片首图加载 | ≤ 500ms | 记录 `img.onload` vs 请求发起 |
| 请求竞态 | 0 次错误结果 | 快速连续输入断言 |

### 7.3 性能压测（后端）

- **工具**：k6 / autocannon
- **场景**：50 并发 × 5s 搜索；1000 词表随机查询
- **指标**：P95 响应时间 < 300ms；错误率 < 1%；Redis 命中率 > 80%

### 7.4 用户体验评估

- 搜索加载动画可见性：loading 态出现频率与时长
- 弱网（3G 模拟）下首屏可用性
- 主观问卷：SUS 评分 + 搜索流畅度评分

---

## 8. 实施路线

| 阶段 | 内容 | 验收 |
|------|------|------|
| P0 后端索引 | `image-search.service` + `suggest` + 搜索 API + 权限 | 接口测试通过，P95 < 300ms |
| P1 前端搜索 | `useDebouncedSearch` + 结果网格 + 防抖取消 | 联调通过，无竞态 |
| P2 图片管道 | sharp 压缩 + thumb/medium/full + WebP/AVIF | 体积降 50%+，多浏览器正常 |
| P3 加载策略 | 懒加载 + 预加载 + 弱网降级 | Web Vitals 达标 |
| P4 CDN 增强 | 上线 CDN 缓存缩略图与搜索 JSON | 图片加载 < 300ms |

---

## 9. 风险与应对

| 风险 | 应对 |
|------|------|
| 索引数据量大导致内存膨胀 | 可扩展为 Redis 索引 / 仅索引元数据不索引正文 |
| 弱网下图片仍慢 | 强降级：轻量模式 + 缩略图 |
| 搜索 API 被刷 | 复用现有限流中间件 + CDN 缓存热点词 |
| 权限绕过 | 服务端强制租户 + 状态过滤（沿用已知库同款加固） |
| 兼容性回退 | polyfill + `<picture>` 回退 + 监控降级 |

---

*本文档为 v1.0 设计稿，待评审后按 P0-P4 分阶段实施。*