# 丹青有AI · 素材库存储与搜索方案

> 适用版本: 阶段 2E(9999 条素材 + 视觉化缩略图)
> 核心目标: 图片加载迅速、零服务器内存占用、9999 条素材可秒级搜索/筛选

---

## 1. 素材存储方案

### 1.1 设计取舍: 为什么不把 9999 张图片存在服务器?

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 服务器预生成 9999 张真实图片 | 视觉最丰富 | 占用磁盘/带宽大;首次部署慢;Wikimedia 在国内不可访问 | 不适用 |
| 服务端实时生成 SVG/Canvas | 可动态调整 | 消耗服务器 CPU 与内存;并发高时成为瓶颈 | 不适用 |
| **前端按 seed 实时生成 SVG data URI(当前方案)** | 零服务器存储/内存;即时渲染;可离线;体积小 | 图案为抽象风格,非真实作品 | **采用** |

### 1.2 数据文件结构

```text
public/data/
├── artworks.json       # 9999 条素材元数据(约 5.5 MB,压缩后约 650 KB)
└── artworks.meta.json  # 维度统计与枚举(约 8 KB)
```

- `artworks.json` 只包含**文本元数据**,不含真实图片文件。
- `imageUrl` 使用私有协议 `__ARTWORK_IMAGE__:seed`,由前端在渲染时解析为 SVG data URI。
- `artworks.meta.json` 供首屏统计与筛选面板快速展示,避免加载全量数据后才出统计。

### 1.3 图片生成策略: 前端 SVG 占位图

核心文件:
- `src/services/artworkImage.ts` —— 按创作形式生成视觉化 SVG
- `src/hooks/useArtworkImage.ts` —— 组件级按需解析,缓存结果

生成规则:
1. **确定性**: 相同 `seed + category + style` 始终生成同一图案,保证重复渲染一致。
2. **按创作形式区分视觉语言**:
   - painting: 水墨晕染 + 山峦笔触 + 朱砂印章
   - design: 几何网格
   - product: 器物轮廓
   - sculpture: 螺旋层叠形体
   - calligraphy: 流动线条
   - architecture: 建筑结构
3. **零网络请求**: SVG 直接内联为 `data:image/svg+xml,…`,无需额外 HTTP 请求。
4. **按需生成**: 9999 条素材在加载时**不**一次性生成全部 SVG,仅在卡片进入视口或弹窗打开时生成。

### 1.4 资源占用估算

| 项目 | 估算 |
|------|------|
| `artworks.json` 原始大小 | 约 5.5 MB |
| Gzip 传输大小 | 约 650 KB |
| 内存中 JS 对象 | 约 15–25 MB |
| 单张 SVG data URI | 1–3 KB |
| 首屏渲染 SVG 数量 | 24 张/页,约 50 KB |
| 服务器磁盘/内存占用 | 0(图片) |

---

## 2. 素材搜索方案

### 2.1 挑战

- 9999 条素材,若每次搜索都线性扫描,单次全字段搜索约需遍历 9999 × 6 个字段。
- 筛选面板需要对每个按钮实时统计数量,原实现为每个按钮单独 `artworks.filter`,渲染成本高。
- 搜索框每输入一个字符都触发过滤,高频计算会导致输入卡顿。

### 2.2 内存倒排索引设计

文件: `src/services/artworksDatabase.ts`

在 `artworks.json` 加载完成后,一次性构建如下索引:

```typescript
interface ArtworkSearchIndex {
  byCategory: Map<string, Set<number>>;  // 分类 -> 作品下标
  byStyle:    Map<string, Set<number>>;  // 风格 -> 作品下标
  byEra:      Map<string, Set<number>>;  // 时代 -> 作品下标
  byRegion:   Map<string, Set<number>>;  // 地区 -> 作品下标
  byTag:      Map<string, Set<number>>;  // 标签 -> 作品下标
  byKeyword:  Map<string, Set<number>>;  // 关键词(中文单字/英文单词) -> 作品下标
}
```

构建时机:
- `loadBuiltinArtworks()` 成功后立即构建。
- 失败或数据为空时索引为 `null`,搜索自动回退到线性扫描。

### 2.3 搜索流程

1. **结构化筛选(分类/风格/时代/地区/标签)**
   - 从索引中取出对应 Set。
   - 多条件取交集,优先遍历最小集合。
   - 任一条件无命中直接返回空数组。

2. **关键词搜索**
   - 将查询词拆分为中文单字和英文单词。
   - 通过 `byKeyword` 索引快速粗筛候选作品。
   - 对候选作品再做 substring 精排,保证与旧行为一致(支持中英文混合、部分匹配)。

3. **artist 字段精排**
   - 支持中文艺术家名与英文艺术家名同时匹配。

4. **结果映射**
   - 通过下标从 `cachedArtworks` 映射回 `ArtworkItem[]`。

### 2.4 筛选统计优化

新增 `getFilterCounts()`:
- 直接读取索引中各维度 Set 的 `size`。
- 时间复杂度 O(维度数量),替代原实现的 O(n × 按钮数量)。

`MaterialsPage.tsx` 中通过 `useMemo(() => getFilterCounts(), [artworks])` 缓存,仅在素材数据变化时重新计算。

### 2.5 其他性能手段

| 手段 | 实现 | 效果 |
|------|------|------|
| 防抖搜索 | `useDebounce(rawSearchQuery, 300)` | 输入停止 300ms 后才触发过滤,避免高频重算 |
| 分页 | `PAGE_SIZE = 24` | 首屏只渲染 24 个 DOM 节点 |
| 图片懒加载 | `useLazyImage` + `loading="lazy"` | 仅视口内及附近 200px 的图片才生成/加载 |
| memo 卡片 | `React.memo(ArtworkCard/ArtworkRow)` | 筛选/收藏切换时只重渲染变化项 |
| 索引缓存 | 一次构建,全局复用 | 搜索与统计均为 O(候选集) 级别 |

---

## 3. 关键代码位置

| 文件 | 职责 |
|------|------|
| `src/services/artworksDatabase.ts` | 异步加载、内存索引、搜索、筛选统计 |
| `src/services/artworkImage.ts` | SVG 缩略图生成 |
| `src/hooks/useArtworkImage.ts` | 组件级 SVG 解析缓存 |
| `src/hooks/useLazyImage.ts` | 图片懒加载 |
| `src/hooks/useDebounce.ts` | 搜索输入防抖 |
| `src/pages/MaterialsPage.tsx` | 素材库 UI、分页、筛选面板 |
| `scripts/generate-artworks.cjs` | 9999 条数据与元数据生成 |
| `public/data/artworks.json` | 素材元数据 |
| `public/data/artworks.meta.json` | 维度统计 |

---

## 4. 部署与运维注意事项

1. **Nginx 静态资源缓存**
   - `public/data/artworks.json` 与 `artworks.meta.json` 属于静态资源,建议配置长期缓存(如 `Cache-Control: public, max-age=86400`),因为数据更新频率低。
   - 重新生成数据后需刷新 CDN/浏览器缓存,可通过文件名加 hash 或版本号实现。

2. **首次加载体验**
   - 素材库约 650 KB(gzip),在 4G 网络下约 1–2 秒可完成。
   - 后续从浏览器缓存读取,几乎瞬时。

3. **内存占用**
   - 9999 条素材 + 索引约占用 20–30 MB 浏览器内存,现代设备可接受。
   - 若未来扩展到 10 万条,建议改为后端分页/搜索 API。

4. **不要删除 artworks.meta.json**
   - 该文件虽小,但为后续服务端统计、管理后台等提供维度快照。

---

## 5. 后续可扩展方向

| 方向 | 说明 |
|------|------|
| 服务端搜索 API | 当素材量超过 5–10 万条时,将索引迁移到后端(如 Meilisearch/PostgreSQL full-text search) |
| 真实图片接入 | 与可稳定访问的图库合作,替换 `__ARTWORK_IMAGE__` 协议为真实 CDN URL,保留现有架构 |
| 多维统计增强 | 增加「按关键词的动态筛选计数」,即选中部分条件后实时显示剩余条件的可用数量 |
| 预加载下一页 | 用户翻到第 N 页时,预解析第 N+1 页的图片 seed,进一步减少翻页等待 |
| 离线化 | 使用 Service Worker 缓存 `artworks.json`,实现完全离线浏览素材库 |

---

## 6. 方案总结

- **存储**: 9999 条素材以纯 JSON 元数据存放,图片由前端按 seed 实时生成 SVG,服务器零图片存储、零图片生成开销。
- **搜索**: 加载后构建内存倒排索引,结构化筛选走 Set 交集,关键词搜索走索引粗筛 + substring 精排,统计通过索引直接读取。
- **体验**: 防抖 + 分页 + 懒加载 + memo,保证 9999 条素材在普通设备上流畅浏览与搜索。
