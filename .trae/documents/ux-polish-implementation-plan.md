# 丹青有AI —— 用户体验打磨阶段实施真源文档

> **文档定位**：本文档是"用户体验打磨"大阶段的唯一实施依据（Single Source of Truth）。所有执行Agent必须严格按照本文档分阶段推进，不得超出范围。
>
> **创建时间**：2026-07-29
> **版本**：v1.0
> **适用阶段**：复赛准备期（07.29 - 08.09）
> **前置文档**：
>
> * [project-context.md](./project-context.md)（项目背景）
>
> * [ai-art-research.md](./ai-art-research.md)（AI艺术教育研究报告）
>
> * [api-contract-v1.md](./api-contract-v1.md)（API契约）
>
> * [data-model-v1.md](./data-model-v1.md)（数据模型）

***

## 〇、阶段目标与核心约束

### 0.1 阶段目标

在**不改动任何底层架构**的前提下，完成以下工作：

1. 升级AI分析算法质量（色彩和谐度、黄金分割验证、结构张量笔触、pHash+CLIP原创性检测）
2. 接入TRAE内置AI能力实现MLLM详细教学建议生成（ArtCoT证据锚定）
3. 全局交互体系优化（Toast/骨架屏/ErrorBoundary/快捷键/命令面板/空状态）
4. 核心页面体验深度打磨（智绘镜分析流程为主）

### 0.2 底层架构影响评估（重要！）

| 底层组件                                   | 是否改动  | 评估结论                                              |
| -------------------------------------- | ----- | ------------------------------------------------- |
| 技术栈选型（React/Vite/Express/Prisma/Redis） | ❌ 不改动 | 所有新增代码使用现有依赖，不引入新框架                               |
| 目录结构设计                                 | ❌ 不改动 | 新增文件放在现有目录内，遵循现有分层规范                              |
| 数据库表结构/核心字段                            | ❌ 不改动 | `Analysis.result` 为Json类型，足够存储扩展结果；不新增表、不修改schema |
| 核心权限系统（RBAC/飞书OAuth/JWT）               | ❌ 不改动 | 新接口复用现有auth中间件                                    |
| 支付流程/订阅系统                              | ❌ 不改动 | 本次不涉及                                             |
| 多租户隔离                                  | ❌ 不改动 | 新服务复用现有tenant隔离机制                                 |

**结论**：本次所有工作均为**业务算法增强+UI/交互体验优化+服务层扩展**，不触碰底层架构。

### 0.3 架构稳定性原则

* 算法升级在现有 `analysis-engine.service.ts` 基础上扩展，不重写

* MLLM接入使用现有 `ai-vision.service.ts` 或新增同层级service，复用已有HTTP客户端工具

* 异步建议复用现有 `analysis-queue.service.ts` 队列机制

* 前端改动仅限组件样式/交互逻辑/页面组件，不改动路由结构和全局状态方案

* 所有新增接口遵循现有API契约规范（`{code, message, data, traceId}`）

***

## 一、子阶段总览

| Phase | 名称                 | 端   | 预计工时 | 核心产出                                     | 前置依赖       |
| ----- | ------------------ | --- | ---- | ---------------------------------------- | ---------- |
| **A** | 分析算法质量升级（基础算法增强）   | 后端  | 2-3h | 色彩和谐度+黄金分割+结构张量+pHash算法落地                | 无          |
| **B** | TRAE AI能力接入与智能建议生成 | 后端  | 3-4h | TRAE MLLM接入+ArtCoT证据打包+异步建议+模板降级         | Phase A    |
| **C** | 前后端接口联调与数据对齐       | 前后端 | 1-2h | 前端正确消费新字段+同步/异步双阶段响应                     | Phase B    |
| **D** | 全局交互体系优化           | 前端  | 3-4h | Toast/骨架屏/ErrorBoundary/快捷键/命令面板/空状态统一完善 | 无（可与A/B并行） |
| **E** | 核心页面体验深度打磨         | 前端  | 2-3h | 智绘镜5阶段动画优化+结果展示+热力图交互+成长追踪可视化            | Phase C+D  |

**执行顺序**：A → B → C → D（D可与A/B并行） → E
**阶段汇报机制**：每个Phase完成后以问题清单形式汇报，用户确认后进入下一Phase。

***

## 二、Phase A：分析算法质量升级（基础算法增强）

**目标**：在不引入外部依赖的前提下，升级Jimp像素分析引擎，增加色彩和谐度、黄金分割验证、结构张量笔触、pHash原创性检测四大模块。

**涉及文件**：

* `server/src/services/analysis-engine.service.ts`（核心修改）

* `server/src/types/api-contract.ts`（扩展返回类型，**仅新增字段，不修改现有字段**）

* `src/services/smartAnalysisEngine.ts`（前端同步升级，保持前后端算法一致）

### A1. 色彩分析升级：色彩和谐度与饱和度分布

**工作内容**：

1. 在现有 `analyzePixels()` 基础上，新增色相分布统计（36色桶，每10°一个）
2. 实现 `calculateColorHarmony(pa)` 函数：基于色相轮理论检测和谐模式（互补色/类比色/三分色/分裂互补色/无彩色）
3. 实现 `calculateSaturationDistribution(pa)` 函数：统计高/中/低饱和度像素占比
4. 将和谐度类型和分数、饱和度分布写入color维度返回

**涉及算法**：

* 色相分类已存在（`getHueCategory`），需扩展为36区间细分

* 和谐模式检测：互补色（180°±30°）、类比色（30°±15°）、三分色（120°±20°）

* 饱和度三级：低(0-33)/中(33-66)/高(66-100)

**预期完成程度**：

* `color.harmonyScore: number` (0-100)

* `color.harmonyType: string` ('complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'monochromatic' | 'achromatic' | 'mixed')

* `color.saturationDistribution: {low: number, mid: number, high: number}` (比例0-1)

* 现有 `warmRatio/coolRatio/contrast/saturation/richness/dominantColor` 字段保持不变

**验收标准**：

* [ ] 对同一张图，色彩和谐度分数在多次调用中波动<2分

* [ ] 已知的互补色作品（如红绿对比强的作品）harmonyType='complementary'

* [ ] 黑白作品harmonyType='achromatic'

* [ ] TypeScript编译无错误，现有单元测试通过

**验证方式**：

1. 启动后端 `cd server && npm run dev`
2. 用PowerShell调用分析接口，检查返回的color维度新增字段
3. 对比前端Canvas分析结果，差异<5%

### A2. 构图分析升级：黄金分割验证与引导线检测

**工作内容**：

1. 实现 `validateGoldenRatio(pa)` 函数：计算视觉重心与四个黄金分割点（0.382/0.618组合）的最小距离，转化为分数
2. 实现 `validateRuleOfThirds(pa)` 函数：检测视觉重心是否落在三分线交点附近
3. 实现 `detectLeadingLines(edgeMap, width, height)` 函数：基于Hough变换思想检测画面中的主引导线方向（简化版：统计边缘方向直方图）
4. 实现 `calculateWhitespaceRatio(pa)` 函数：精确计算留白比例（基于亮度阈值）
5. 将以上指标写入composition维度返回

**涉及算法**：

* 黄金分割点距离公式：`distance = min(sqrt((fx - x)^2 + (fy - y)^2))`，分数=100 - distance\*200

* 三分法则：将画面分3×3网格，检测焦点是否在四个内交点±10%范围内

* 引导线检测：统计边缘像素的梯度方向，找主峰方向

* 留白比例：亮度>200的像素占比（可根据作品类型微调阈值）

**预期完成程度**：

* `composition.goldenRatioScore: number` (0-100)

* `composition.ruleOfThirdsScore: number` (0-100)

* `composition.leadingLineDirection: number` (0-180°，主要引导线角度)

* `composition.leadingLineStrength: number` (0-1，引导线强度)

* `composition.whitespaceRatio: number` (0-1，精确留白比)

* 现有 `focusPoint/balance/guideline/symmetry/heatmapData` 字段保持不变（注意：guideline字段已存在，新的leadingLineDirection不冲突）

**验收标准**：

* [ ] 中心构图作品goldenRatioScore>70

* [ ] 边角构图（如马远"一角"）goldenRatioScore较低但ruleOfThirdsScore可能较高

* [ ] 有明显透视线的作品leadingLineStrength>0.5

* [ ] 留白计算与视觉感知大致一致

**验证方式**：上传多种构图类型的测试图片（中心/三分/对角/满构图/留白），检查指标是否符合预期。

### A3. 笔触/纹理分析升级：结构张量

**工作内容**：

1. 实现 `computeGradients(pixels, width, height)` 函数：Sobel算子计算Ix和Iy
2. 实现 `computeStructureTensor(gradients)` 函数：对梯度乘积进行高斯加权平滑，得到2×2结构张量
3. 实现 `eigenDecompose2x2(J)` 函数：解析解求2×2矩阵特征值和特征向量
4. 基于特征值计算：笔触主方向（dominantDirection）、方向一致性（coherence）、笔触能量（energy）
5. 将笔触分析结果对应到各类型维度：

   * painting → brushwork.textureLevel/strokeVariety 基于 coherence/energy 重新校准

   * design → typography 维度可利用方向一致性检测对齐程度

   * sculpture → bodyLanguage 维度利用方向方差检测形体张力

**涉及算法**：

* Sobel算子：

  * Ix = \[\[-1,0,1],\[-2,0,2],\[-1,0,1]] 卷积

  * Iy = \[\[-1,-2,-1],\[0,0,0],\[1,2,1]] 卷积

* 结构张量：J = \[\[Ixx, Ixy], \[Ixy, Iyy]]，其中 Ixx = G*Ix², Ixy = G*IxIy, Iyy = G\*Iy²（G为高斯平滑）

* 特征值解析解：λ = (Ixx+Iyy)/2 ± sqrt(((Ixx-Iyy)/2)² + Ixy²)

* coherence = (λ1-λ2)/(λ1+λ2)，energy = λ1+λ2

**预期完成程度**：

* 各类型笔触/纹理维度增加：

  * `directionCoherence: number` (0-1)

  * `strokeEnergy: number` (0-1)

  * `dominantDirection: number` (0-180°)

* 现有纹理/笔触相关分数基于新特征重新校准，更准确

**验收标准**：

* [ ] 工笔画（线条一致）coherence>0.7

* [ ] 写意画（笔触多变）coherence<0.4

* [ ] 油画厚涂energy>0.6

* [ ] 素描淡彩energy<0.3

**验证方式**：上传不同笔触风格的作品（工笔/写意/油画/水彩/素描），验证笔触指标区分度。

### A4. 原创性检测：pHash感知哈希（第一阶段，无API依赖）

**工作内容**：

1. 实现 `computePHash(image)` 函数：DCT-based感知哈希

   * 缩小到32×32

   * 转灰度

   * 计算DCT

   * 取左上角8×8 DCT系数

   * 计算中值

   * 大于中值为1，否则为0 → 生成64位哈希
2. 预计算99件名作的pHash指纹（启动时加载或首次请求时懒加载缓存）
3. 实现 `hammingDistance(hash1, hash2)` 函数：计算汉明距离
4. 在 `analyzeOriginality(pa)` 中：

   * 计算上传图片的pHash

   * 与99件名作比对，找最小汉明距离

   * 汉明距离<5判定为高度相似，<10为部分相似

   * 将pHash相似度映射为原创性分数
5. 为CLIP阶段预留接口（similarity字段暂用pHash距离映射，后续CLIP接入时替换）

**涉及算法**：

* DCT（离散余弦变换）：可用简化实现或Jimp内置的像素处理手动计算

* pHash标准流程：32×32灰度→DCT→8×8低频→中值二值化→64bit

* 汉明距离：XOR后统计1的位数

**数据来源**：

* 名作库：`server/data/artworks.json`（99件）

* 启动时为每件名作计算pHash并缓存到内存（Map\<filename, hash>）

**预期完成程度**：

* `originality.pHashSimilarity: number` (0-1，汉明距离映射)

* `originality.mostSimilarWork: {title: string, artist: string, distance: number}` (最相似作品)

* `originality.score` 基于pHash重新计算（替代原来的模拟分数）

* 保持现有 `similarity/creativityLevel/suggestion` 字段

**验收标准**：

* [ ] 完全相同的图片汉明距离=0，similarity=1.0

* [ ] 轻微压缩/缩放的同一张图汉明距离<5

* [ ] 不同风格/内容的作品汉明距离>20

* [ ] 99件名作pHash在服务启动后100ms内完成缓存

* [ ] 单次pHash计算<10ms

**验证方式**：

1. 上传artworks.json中的某件名作（如千里江山图），验证mostSimilarWork正确识别且distance<5
2. 上传完全无关的图片，验证distance>15，原创性分数>80
3. 上传名作的截图/裁剪版，验证距离在中间范围

### A5. 前端分析引擎同步升级

**工作内容**：

1. 将A1-A4的算法同步到 `src/services/smartAnalysisEngine.ts`（前端Canvas版本）
2. 确保前后端算法逻辑一致，相同图片分析结果分数差异<5%
3. 更新 `src/types/index.ts` 中的类型定义，与后端api-contract.ts对齐

**注意**：前端pHash计算使用Canvas API读取像素，算法逻辑与后端完全一致。

**验收标准**：

* [ ] 前端localStorage模式下分析结果包含所有新增字段

* [ ] 同一图片前端/后端analysis分数差异<5%

* [ ] TypeScript编译无错误

**验证方式**：关闭后端模式，在前端上传图片，验证返回数据结构完整。

***

## 三、Phase B：TRAE AI能力接入与智能建议生成

**目标**：接入TRAE内置AI能力，实现基于ArtCoT证据锚定的教学建议生成。同步层返回分数+指标，异步层返回MLLM生成的详细建议。

**涉及文件**：

* `server/src/services/ai-vision.service.ts`（核心：TRAE AI调用封装，新建或扩展）

* `server/src/services/ai-analysis.service.ts`（证据打包+建议生成Pipeline）

* `server/src/services/analysis-queue.service.ts`（异步队列，复用现有）

* `server/src/controllers/analysis.controller.ts`（新增异步任务查询接口）

* `server/src/routes/analysis.routes.ts`（注册新路由）

**前置依赖**：Phase A完成（CNN指标产出是证据打包的输入）

### B1. TRAE AI能力接入封装

**工作内容**：

1. 调研TRAE IDE/平台提供的AI调用方式（内置API endpoint、环境变量配置等）
2. 在 `server/src/config/env.ts` 中新增TRAE AI相关配置项（如TRAE\_API\_KEY、TRAE\_API\_BASE\_URL）
3. 封装 `ai-vision.service.ts`：

   * `analyzeArtwork(evidence: ArtEvidence, artType: ArtType): Promise<AISuggestion[]>`

   * 使用现有 `http-client.ts` 工具发起HTTP请求

   * 支持超时设置（5s超时降级）

   * 错误处理和日志记录
4. 使用TRAE内置模型（非外部GPT-4o/豆包），符合用户"先接入trae"的要求

**预期完成程度**：

* 统一的AI调用接口，输入结构化证据JSON，输出结构化建议JSON

* 5s超时自动降级

* 完善的错误日志（通过winston）

**验收标准**：

* [ ] TRAE AI服务可正常调用并返回结果

* [ ] 超时5s后返回超时错误，不阻塞主流程

* [ ] 错误情况有明确日志记录

* [ ] API Key通过环境变量配置，不硬编码

**验证方式**：编写单元测试mock HTTP客户端，验证正常/超时/错误三种场景。

### B2. ArtCoT证据打包模块

**工作内容**：

1. 定义 `ArtEvidence` 接口，将A1-A4产出的所有指标打包为结构化证据
2. 实现 `packageEvidence(pixelAnalysis, typeDimensions, originality)` 函数
3. 根据作品类型（painting/design/product/sculpture）选择性打包相关维度证据
4. 证据格式包含：

   * 作品类型

   * 构图类证据（重心、对称性、留白、黄金分割分数、引导线方向）

   * 色彩类证据（暖冷比、对比度、饱和度、主色调、和谐度类型/分数）

   * 笔触/纹理类证据（纹理复杂度、方向一致性、能量、主方向）

   * 原创性证据（pHash最相似作品、相似度分数）

**预期完成程度**：

```typescript
interface ArtEvidence {
  artType: ArtType;
  composition: {
    focusPoint: {x: number, y: number};
    symmetry: number;
    whitespaceRatio: number;
    goldenRatioScore: number;
    ruleOfThirdsScore: number;
    leadingLineDirection: number;
    leadingLineStrength: number;
  };
  color: {
    warmRatio: number;
    coolRatio: number;
    contrast: number;
    avgSaturation: number;
    dominantColor: string;
    harmonyType: string;
    harmonyScore: number;
    saturationDistribution: {low: number, mid: number, high: number};
  };
  brushwork: {
    textureComplexity: number;
    edgeDensity: number;
    directionCoherence: number;
    strokeEnergy: number;
    dominantDirection: number;
  };
  originality: {
    score: number;
    pHashSimilarity: number;
    mostSimilarWork: {title: string, artist: string} | null;
  };
}
```

**验收标准**：

* [ ] 证据对象包含所有Phase A新增字段

* [ ] 四种作品类型都能正确打包对应维度证据

* [ ] 数值精度保留2位小数

**验证方式**：单元测试验证打包函数输出结构正确。

### B3. ArtCoT Prompt设计与建议生成

**工作内容**：

1. 设计结构化Prompt，遵循ArtCoT证据锚定原则：

   * 角色设定：专业艺术教育导师

   * 输入：作品类型 + 视觉特征数据（CNN证据）

   * 要求：每条建议必须引用具体数据、格式为"\[维度] 当前值X → 建议值Y → 理由Z"、禁止模糊表述、每维度1-2条高优先级建议、总字数<300字

   * 输出：严格JSON格式
2. 实现 `generateSuggestions(evidence)` 函数
3. 解析MLLM返回的JSON，验证格式正确性
4. 对建议进行质量校验：

   * 检查是否引用了具体数值

   * 检查是否包含"建议"/"应"/"可以"等行动词

   * 检查是否避免了"再改改""需要改进"等模糊词

   * 不通过则使用模板建议兜底

**MLLM Prompt核心模板**：

```
你是一位专业的{作品类型}教育导师，请基于以下视觉特征数据，生成具体可操作的改进建议。

【视觉特征数据】（客观测量结果）
{结构化证据JSON}

【要求】
1. 每条建议必须引用上述具体数据作为证据
2. 建议格式：[维度] 当前值X → 建议值Y → 理由Z
3. 禁止使用"再改改""需要改进"等模糊表述
4. 每个维度给出1-2条最高优先级建议
5. 总建议数不超过5条，总字数控制在300字以内

【输出JSON格式】
{{"suggestions": [{{"dimension":"...","evidence":"引用具体数据","suggestion":"具体操作建议","priority":"high/medium/low"}}]}}
```

**预期完成程度**：

* 每条建议包含dimension/evidence/suggestion/priority四字段

* evidence字段必须包含来自ArtEvidence的具体数值

* 解析失败/校验不通过时自动降级到模板建议

**验收标准**：

* [ ] MLLM返回的JSON可正确解析

* [ ] 每条建议都包含具体数值引用

* [ ] 建议内容针对当前作品类型（绘画不提"排版"，设计不提"笔触"）

* [ ] MLLM返回异常时系统不崩溃，降级到模板

**验证方式**：用测试证据数据调用，检查返回建议质量；mock MLLM返回异常格式，验证降级。

### B4. 异步任务队列接入与接口改造

**工作内容**：

1. 改造 `POST /api/v1/analyses` 接口（或现有分析接口）：

   * 同步部分：图像预处理→像素分析→CNN快速评分→热力图生成（<500ms）

   * 返回同步结果 + taskId + asyncStatus: 'processing'

   * 同步触发异步任务：证据打包→MLLM调用→建议生成→结果存储
2. 新增 `GET /api/v1/analyses/:id/suggestions` 接口：查询异步建议状态

   * 返回：{status: 'processing'|'completed'|'failed', suggestions: \[...]}
3. 复用现有 `analysis-queue.service.ts`，新增建议生成任务类型
4. 异步任务结果存入Analysis记录的result Json字段（新增suggestions子字段）
5. **不改动Prisma schema**，利用result Json字段的灵活性存储扩展数据

**API响应结构**：

同步响应（<500ms）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "uuid",
    "status": "processing",
    "overallScore": 82,
    "dimensions": { ... },
    "originality": { ... },
    "heatmapData": [...],
    "suggestions": [],
    "suggestionsStatus": "processing"
  },
  "traceId": "..."
}
```

异步轮询响应（GET /analyses/:id/suggestions）：

```json
{
  "code": 0,
  "message": "success", 
  "data": {
    "status": "completed",
    "suggestions": [
      {"dimension":"composition","evidence":"天空区域占比60.3%，视觉重心(0.52,0.31)偏上","suggestion":"天空占比过大，建议压缩至40%，将重心下移至黄金分割点附近","priority":"high"}
    ]
  },
  "traceId": "..."
}
```

**验收标准**：

* [ ] POST /analyses 在500ms内返回同步结果

* [ ] 异步任务在2-10s内完成（取决于TRAE AI响应时间）

* [ ] GET接口正确反映processing/completed/failed三种状态

* [ ] 异步失败不影响同步结果展示

* [ ] 建议结果持久化到Analysis.result中

**验证方式**：

1. 上传图片，立即检查同步响应包含分数和热力图
2. 轮询suggestions接口，2-10s后获取到AI建议
3. 断开网络/TRAE不可用时，suggestions状态为failed但主流程正常

### B5. 模板降级方案（离线可用）

**工作内容**：

1. 实现基于指标阈值的离线模板建议库
2. 每个维度3-5条模板规则，覆盖常见问题：

   * 构图：留白过高/过低、重心偏移、对称性差

   * 色彩：暖色过多、冷色过多、对比不足、饱和度过高/过低、色彩单调

   * 笔触：方向混乱、能量不足、纹理单一

   * 原创性：相似度过高
3. MLLM不可用/超时/返回格式错误时，自动使用模板建议
4. 模板建议也必须包含具体数值（evidence字段）

**模板示例**：

```javascript
const TEMPLATES = {
  composition: [
    {
      id: 'high-whitespace',
      condition: (e) => e.composition.whitespaceRatio > 0.4,
      evidence: (e) => `留白比例${(e.composition.whitespaceRatio*100).toFixed(1)}%`,
      suggestion: '留白比例偏高，建议在空白区域增加辅助元素或调整主体占比至20%-30%',
      priority: 'medium'
    }
  ],
  color: [
    {
      id: 'warm-dominant', 
      condition: (e) => e.color.warmRatio > 0.7,
      evidence: (e) => `暖色占比${(e.color.warmRatio*100).toFixed(1)}%`,
      suggestion: '暖色占比过高，画面可能缺乏层次，建议增加冷色（蓝/绿）平衡至60:40',
      priority: 'medium'
    }
  ]
  // ...更多模板
};
```

**验收标准**：

* [ ] 每个维度至少3条模板规则

* [ ] 模板建议包含evidence字段（引用具体数值）

* [ ] MLLM超时时5s内自动返回模板建议

* [ ] 模板建议总条数3-5条，优先级标注正确

**验证方式**：mock TRAE AI超时，验证返回模板建议且格式正确。

***

## 四、Phase C：前后端接口联调与数据对齐

**目标**：前端正确消费Phase A/B的新字段，实现同步/异步双阶段建议加载。

**涉及文件**：

* `src/services/analysisService.ts`（更新API调用和数据解析）

* `src/services/api.ts`（如需要，新增suggestions轮询接口）

* `src/pages/AnalysisPage.tsx`（适配新数据结构+异步轮询逻辑）

* `src/types/index.ts`（与后端类型完全对齐）

### C1. 前端API服务更新

**工作内容**：

1. 更新 `analyzeImageWithFallback()` 适配新的响应结构（含suggestionsStatus）
2. 新增 `fetchSuggestions(analysisId: string)` 轮询函数
3. 确保前端Canvas分析引擎（smartAnalysisEngine.ts）在后端不可用时也能产出新字段
4. 统一错误处理：后端异常时优雅降级到前端分析

**验收标准**：

* [ ] 后端开启时调用后端，后端关闭时自动降级前端

* [ ] API调用错误时Toast提示但不崩溃

* [ ] 新字段在前后端模式下都可用

### C2. 分析页面异步建议加载

**工作内容**：

1. AnalysisPage状态机增加：syncDone → pollingSuggestions → suggestionsReady
2. 同步结果到达后立即渲染分数+热力图
3. 启动setInterval轮询（500ms间隔，最多轮询20次/10s超时）
4. 建议区域显示加载状态（骨架屏/loading动画）
5. 建议到达后平滑渲染（淡入动画）
6. 轮询超时/失败时显示模板建议

**验收标准**：

* [ ] 分数和热力图在上传后3秒内展示（满足SLA）

* [ ] AI建议在3-10秒内追加显示

* [ ] 建议加载中有明确的loading状态

* [ ] 超时后显示模板建议，不出现空白

**验证方式**：浏览器实际上传测试，观察同步/异步两阶段加载流程。

***

## 五、Phase D：全局交互体系优化

**目标**：统一并完善全局交互体验组件，包括Toast通知、骨架屏、ErrorBoundary、快捷键、命令面板、空状态设计。此阶段可与Phase A/B并行。

**涉及文件**：

* `src/components/ToastProvider.tsx`

* `src/components/ErrorBoundary.tsx`

* `src/components/PageSkeleton.tsx`

* `src/components/Header.tsx`

* `src/components/Sidebar.tsx`

* `src/App.tsx`（快捷键绑定）

* 各页面组件（空状态补充）

### D1. Toast通知统一与优化

**工作内容**：

1. 审查所有alert()调用，全部替换为Toast
2. Toast类型统一：success（朱砂红成功）/ error（墨黑错误）/ info（石青提示）/ warning（金色警告）
3. Toast位置统一（顶部居中，不遮挡Header）
4. Toast时长：info 2s，success 2s，warning 3s，error 4s（可手动关闭）
5. 操作反馈Toast：分析开始/完成、保存成功、切换成功等
6. 错误Toast必须包含错误原因的简短说明，不只是"操作失败"

**验收标准**：

* [ ] 项目中无alert()/confirm()/prompt()调用

* [ ] 所有用户操作（上传/分析/保存/切换）都有对应Toast反馈

* [ ] 错误信息清晰可读（如"图片超过10MB限制"而非"上传失败"）

* [ ] Toast不遮挡顶部导航和主要操作区

### D2. 骨架屏与加载状态完善

**工作内容**：

1. 审查所有页面加载状态，统一使用PageSkeleton
2. 列表页（History/Materials）数据加载时显示卡片骨架
3. 分析结果区域（分数/热力图/建议）分别有对应骨架
4. 图片上传区域有上传进度/压缩/分析中的状态提示
5. 骨架屏使用水墨风格的shimmer动画（与品牌色调一致）

**验收标准**：

* [ ] 所有异步数据加载都有骨架屏，不出现空白

* [ ] 骨架屏布局与实际内容一致（减少布局跳动）

* [ ] 加载状态文字明确（如"AI正在分析您的作品..."而非单纯"加载中"）

### D3. ErrorBoundary体验优化

**工作内容**：

1. 审查现有ErrorBoundary，确保路由级隔离正常工作
2. 错误UI优化：友好的中文提示（而非堆栈信息）、"返回首页"和"重试"按钮
3. 错误发生时记录错误信息到console（开发模式显示详细错误，生产模式只显示友好提示）
4. 路由切换时自动重置ErrorBoundary状态（使用key={location.pathname}，验证已实现）
5. 图片加载失败、API超时等常见错误有专门的错误提示UI

**验收标准**：

* [ ] 单个页面崩溃不影响整个应用

* [ ] 错误UI有品牌风格（水墨配色），不是浏览器默认红色错误

* [ ] 用户可从错误页面恢复（重试/返回首页）

* [ ] 路由切换后错误状态清除

### D4. 快捷键系统完善

**工作内容**：

1. 审查现有快捷键实现（1-7跳转、0设置、N新建、B折叠、/命令面板）
2. 修复快捷键冲突（如输入框中按N不应触发新建）
3. 快捷键提示优化：

   * 第一次使用时显示快捷键引导提示（可关闭）

   * 侧边栏菜单项hover时显示快捷键提示

   * 命令面板中标注每个命令的快捷键
4. 新增有用快捷键：

   * `Esc` 关闭弹窗/Toast/命令面板

   * `Ctrl/Cmd + Z` 在分析页面撤销到上传前（清空结果重新上传）

   * `R` 在分析页面重新分析当前图片
5. 快捷键只在非输入状态下触发（检测event.target是否为input/textarea/contenteditable）

**验收标准**：

* [ ] 所有快捷键在输入框中不触发

* [ ] 快捷键有明确的提示方式（hover显示或命令面板标注）

* [ ] 新增快捷键工作正常且不与现有快捷键冲突

* [ ] 快捷键在Mac（Cmd）和Windows（Ctrl）都可用

### D5. 命令面板（Command Palette）增强

**工作内容**：

1. 审查命令面板现有功能
2. 新增命令：

   * "切换后端模式"（开关后端/前端分析模式）

   * "导出分析结果"（将当前分析结果导出为JSON/图片）

   * "查看分析历史"（直接跳转到最近一次分析）

   * "打开素材库" / "打开灵感嫁接"等页面跳转

   * "切换作品类型"（绘画/设计/产品/雕塑）
3. 命令分组：导航、操作、设置、帮助
4. 命令搜索支持拼音首字母
5. 最近使用命令排序（常用命令排前面）

**验收标准**：

* [ ] 按 `/` 或 `Ctrl/Cmd+K` 打开命令面板

* [ ] 命令按分组展示，搜索即时过滤

* [ ] 执行命令后面板自动关闭

* [ ] 支持键盘上下选择+Enter执行

### D6. 空状态设计统一

**工作内容**：

1. 审查所有空数据场景，补充空状态UI：

   * HistoryPage：无分析历史时

   * GrowthPage：数据不足无法生成曲线时

   * MaterialsPage：搜索无结果时

   * FusePage：未选择图片时

   * EmotionPage：未输入情绪词时

   * SettingsPage：后端未配置时
2. 空状态设计规范：

   * 水墨风格简约图标（Lucide图标+朱砂红点）

   * 一句话引导文案（友好、不冰冷）

   * 明确的行动召唤按钮（如"立即上传作品""开始第一次分析"）

   * 不放可爱卡通/二次元插画（符合品牌调性）

**验收标准**：

* [ ] 每个空数据场景都有对应的空状态UI

* [ ] 空状态文案友好鼓励性，不说"暂无数据"

* [ ] 空状态有行动召唤按钮，引导用户使用功能

* [ ] 空状态风格与品牌水墨美学一致

***

## 六、Phase E：核心页面体验深度打磨

**目标**：重点打磨智绘镜（AI丹青判官）核心分析流程，确保演示级体验。其他页面修复明显问题即可。

**前置依赖**：Phase C（接口联调）+ Phase D（全局交互优化）

**涉及文件**：

* `src/pages/AnalysisPage.tsx`（核心打磨）

* `src/components/HeatmapCanvas.tsx`（热力图交互）

* `src/pages/GrowthPage.tsx`（成长曲线优化）

* `src/pages/HistoryPage.tsx`（历史记录体验优化）

* `src/pages/SettingsPage.tsx`（后端配置UI——这是后端日志中的P0待办）

### E1. 智绘镜分析流程优化

**工作内容**：

1. **上传区域优化**：

   * 拖拽上传视觉反馈（边框高亮+宣纸纹理背景变化）

   * 支持粘贴图片（Ctrl+V直接粘贴剪贴板图片）

   * 上传前图片预览+裁剪/旋转功能（简单版：确认后再分析）

   * 文件类型/大小实时验证，错误即时提示
2. **5阶段分析动画优化**：

   * 每个阶段的专业术语展示（已实现StageDetails，验证并优化）

   * 进度条改为水墨扩散效果（与品牌动效一致）

   * 阶段切换时有平滑过渡

   * 分析耗时显示（"耗时2.3s"）
3. **结果展示优化**：

   * 分数圆环动画（从0到实际分数的数字滚动）

   * 各维度分数卡片水墨风格（朱砂红高分/墨黑低分/金色分数）

   * 建议卡片按优先级排序（high在前，标注优先级色块）

   * 每条建议对应维度有小图标
4. **AI建议追加展示**：

   * "AI导师正在深度分析..."loading状态

   * 建议到达时淡入+高亮动画

   * 模板建议和MLLM建议视觉上有区分吗？不需要，对用户透明（都是AI建议）
5. **重新分析功能**：

   * 支持不重新上传，切换作品类型重新分析

   * 支持重新上传替换图片

**验收标准**：

* [ ] 拖拽/点击/粘贴三种上传方式都可用

* [ ] 5阶段分析动画流畅，专业术语清晰可读

* [ ] 分数动画自然，不突兀

* [ ] 建议按优先级排列，高优先级建议视觉突出

* [ ] 整个上传→分析→查看结果流程无卡顿/无报错

### E2. 热力图交互优化

**工作内容**：

1. 热力图叠加在原图上，支持透明度调节（滑块0-100%）
2. 鼠标hover热力图区域时显示该区域的"视觉权重值"tooltip
3. 视觉重心点标注（金色圆点+动画脉动效果）
4. 黄金分割线/三分线可切换叠加显示
5. 热力图采用水墨晕染效果（黑→红→金渐变，已确认）

**验收标准**：

* [ ] 热力图透明度可调节

* [ ] hover显示权重信息

* [ ] 重心点清晰标注且美观

* [ ] 网格线可切换

### E3. 成长追踪可视化优化

**工作内容**：

1. 成长曲线使用Recharts，增加面积填充（水墨渐变）
2. 各维度（构图/色彩/笔触/原创性）曲线可单独切换显示/隐藏
3. 数据点hover显示具体日期、分数、作品缩略图
4. "最佳作品"卡片更突出（金色边框+印章效果）
5. 数据不足时显示友好的空状态（Phase D6已覆盖，这里确保实现）

**验收标准**：

* [ ] 曲线图清晰美观，符合水墨配色

* [ ] 维度切换流畅

* [ ] hover信息丰富

* [ ] 最佳作品视觉突出

### E4. SettingsPage后端配置UI（后端日志P0待办）

**工作内容**：

1. 后端开关（localStorage: danqing\_backend\_enabled）：Toggle开关，默认关闭
2. 后端地址配置（localStorage: danqing\_backend\_url）：输入框，默认<http://localhost:3000>
3. 健康检查按钮：点击调用checkBackendHealth()，显示连接状态（✓已连接/✗连接失败）
4. TRAE AI状态显示：显示TRAE AI是否可用（如已配置）
5. 设置项分组：后端设置、外观设置、关于

**验收标准**：

* [ ] 开关可以切换后端模式

* [ ] 后端地址可修改

* [ ] 健康检查有明确反馈

* [ ] 设置自动保存到localStorage，刷新不丢失

### E5. 其他页面快速走查修复

**工作内容**：

1. HomePage：快速入口卡片hover效果优化、"古今艺语"轮播或切换效果
2. MaterialsPage：搜索框交互优化、作品卡片hover放大、标签筛选流畅
3. StylesPage：风格预览图加载状态、风格应用按钮反馈
4. FusePage：双图上传区视觉优化、融合参数滑块手感、结果生成loading
5. EmotionPage：情绪关键词点击反馈、色彩方案展示动画
6. HistoryPage：列表虚拟滚动（如数据量大）、删除确认、筛选功能
7. 全局：响应式断点检查，确保1280px/1024px/768px宽度下可用

**验收标准**：

* [ ] 所有页面无明显UI错位/遮挡

* [ ] 所有按钮/链接可点击，有hover反馈

* [ ] 所有图片有加载失败兜底

* [ ] 主流分辨率下布局正常

***

## 七、暂不执行的工作内容（明确排除）

以下内容**明确不在本次实施范围内**，各Agent不得执行：

| 类别          | 排除内容                              | 原因                                        |
| ----------- | --------------------------------- | ----------------------------------------- |
| 数据库         | 新增表、修改schema、新增字段、数据迁移            | Analysis.result为Json类型足够，不改动Prisma schema |
| 权限系统        | 新增角色、修改RBAC策略、修改飞书OAuth流程         | 现有权限系统满足需求                                |
| 支付/订阅       | 接入Stripe/支付宝/微信支付、订阅流程开发          | Phase 3内容，复赛阶段free计划够用                    |
| 技术栈         | 引入新框架（如Next.js用于前端/后端Python/Vue等） | 保持现有React+Express技术栈                      |
| 目录重构        | 重组目录结构、移动文件位置                     | 架构稳定优先                                    |
| Admin后台     | 管理后台功能开发/优化                       | 复赛演示以学生端为主，admin暂不打磨                      |
| Marketing官网 | 官网页面开发/部署                         | 独立项目，本次不涉及                                |
| 移动端         | React Native App开发                | Phase 2内容                                 |
| CLIP训练      | 本地训练/部署CLIP模型                     | 成本过高，通过TRAE API调用即可                       |
| 真实MLLM部署    | 本地部署LLaVA/LLaMA等开源模型              | 资源消耗大，使用TRAE内置能力                          |
| 飞书功能扩展      | 新增飞书机器人/消息推送/审批流                  | 核心诊断流程优先                                  |
| 多语言         | i18n国际化                           | 复赛仅需中文                                    |
| PWA/离线      | Service Worker/离线可用               | 非核心功能                                     |

***

## 八、阶段汇报与验收机制

### 8.1 阶段执行规则

1. **每个Phase开工前**：明确告知执行Agent"仅实施当前Phase内容，不得超出范围"
2. **每个Phase执行中**：如遇到架构冲突（发现必须改动底层才能实现），立即暂停，汇报影响评估
3. **每个Phase完成后**：以"问题清单形式"汇报执行情况，包括：

   * 完成了哪些步骤

   * 每个步骤的验收标准是否通过

   * 遇到了什么问题

   * 是否有偏离真源文档的地方

   * 截图/录屏/GIF演示（如UI相关）

### 8.2 阶段汇报模板

```
## Phase X 完成汇报

### 完成情况
- [x] 步骤1：xxx —— 通过/部分通过（说明原因）
- [x] 步骤2：xxx —— 通过
- [x] 步骤3：xxx —— 通过

### 验证结果
- 单元测试：通过/失败（x个通过，y个失败）
- TypeScript编译：无错误/x个错误
- 手动验证：截图/GIF见附件

### 遇到的问题
1. 问题1：...
2. 问题2：...

### 偏离说明
（如有与真源文档不一致的地方，说明原因和替代方案）

### 待确认事项
1. ...

请确认是否可以进入下一Phase。
```

### 8.3 整体验收标准

全部Phase完成后，需满足：

* [ ] `npm run build`（前端）构建成功无错误

* [ ] `cd server && npm run build`（后端）编译成功无错误

* [ ] `npm run lint` 无error

* [ ] `cd server && npm test` 所有测试通过

* [ ] 浏览器中完整走通"上传→分析→查看分数→查看AI建议→查看历史→查看成长"全流程

* [ ] 3秒SLA满足（上传到看到分数<3秒）

* [ ] 后端关闭时前端Canvas模式正常工作

* [ ] TRAE AI不可用时模板建议正常兜底

* [ ] 所有页面无控制台error

* [ ] 所有页面无白屏/崩溃

***

## 九、风险与应对

| 风险             | 概率 | 影响 | 应对策略                                    |
| -------------- | -- | -- | --------------------------------------- |
| TRAE AI接入方式不明确 | 中  | 高  | B1阶段首先调研TRAE文档，如不可用则先用模板建议作为最终方案（B5已覆盖） |
| pHash的DCT实现复杂  | 低  | 中  | 使用简化的DCT实现或基于像素均值的aHash/dHash作为降级       |
| CLIP API不可用    | 中  | 中  | 原创性检测先用pHash，CLIP作为增强项，不影响核心流程          |
| 前后端算法一致性差      | 中  | 中  | 共享算法逻辑通过类型定义约束，差异通过单元测试校准               |
| 异步建议超时频繁       | 中  | 低  | 模板降级方案已覆盖（B5），用户仍能看到有用建议                |
| 时间不足           | 中  | 高  | Phase E中E5（其他页面走查）可裁剪，优先保证E1-E4核心体验     |

***

> **文档结束**
>
> 本文档经用户审阅确认后生效，各Phase严格按此执行。如有调整需更新本文档并经用户确认。

