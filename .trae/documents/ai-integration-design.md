# 丹青有AI - Phase 2 AI 视觉模型选型与集成设计文档

> **文档定位**:Phase 2 核心交付物 - AI 视觉模型选型决策 + 混合分析管线设计
> **产出角色**:ai-integration-engineer(11 丹青AI集成工程师)
> **版本**:v1.0(2026-07-28)
> **依据文档**:`art-evaluation-standards.md`(美院评分标准)+ `api-contract-v1.md`(API 契约)
> **SLA 约束**:3 秒内完成 AI 诊断(Jimp 客观 + AI 语义混合)
> **技术约束**:Node.js 环境(无 Python)、中国网络可访问、免费部署层(Render.com free tier)、严格 TypeScript 禁止 any

---

## 一、AI 视觉模型 API 调研与选型

### 1.1 候选模型对比矩阵

| 对比维度 | 智谱 GLM-4V(推荐) | 通义千问 VL | 百度 ERNIE-Vision | 腾讯混元视觉 |
|---|---|---|---|---|
| **视觉理解能力** | 优(原生分辨率输入,低幻觉,广告创意评估/教育课件/工业质检场景验证) | 优(图表理解强,OCR 能力突出) | 良(中文场景理解强) | 良(通用视觉问答) |
| **艺术品分析适用性** | 优(支持图像字幕/视觉问答/图像分类/视觉定位/情感分析) | 良(偏 OCR/图表) | 良(偏中文 NLP) | 中(通用) |
| **API 响应时间** | 1-2s(glm-4v-flash 较快,glm-4v-plus 1-2s) | 1-3s | 2-4s | 2-3s |
| **3 秒 SLA 满足度** | 满足(flash 模型快,超时 2.5s 触发 fallback) | 边界(部分场景超 2.5s) | 不满足(常超 3s) | 边界 |
| **价格(免费额度)** | **glm-4v-flash 免费**(glm-4v-plus 4 元/百万 tokens,单图约 1047 tokens ≈ 0.004 元) | qwen-vl-plus 0.008 元/千 tokens | 0.004 元/千 tokens | 0.018 元/千 tokens |
| **Node.js SDK 可用性** | OpenAI 兼容格式,axios 直连,无需 SDK | DashScope SDK,需额外集成 | qianfan SDK,需额外集成 | 腾讯云 SDK,较重 |
| **中国网络可访问性** | 优(open.bigmodel.cn 国内直连,延迟 50-200ms) | 优(dashscope.aliyuncs.com) | 优(aip.baidubce.com) | 优(hunyuan.tencentcloudapi.com) |
| **API 兼容性** | OpenAI Chat Completions 格式(零迁移成本) | 自有格式 | 自有格式 | 自有格式 |
| **多语言支持** | 26 种语言含中文 | 中英 | 中文为主 | 中英 |
| **项目生态契合度** | **高(项目已用 GLM 模型生态,智能体 glm-5.2)** | 低 | 低 | 低 |
| **图片输入方式** | URL + base64 均支持 | URL + base64 | URL + base64 | URL + base64 |
| **错误码规范** | 400/401/429/1301(合规)/1302(过载) | 自有 | 自有 | 自有 |

### 1.2 选型决策:智谱 GLM-4V

**决策结论**:选择 **智谱 GLM-4V** 作为丹青有AI 系统的 AI 视觉分析模型。

**决策理由(七条)**:

1. **免费模型可用,契合免费部署层约束**:`glm-4v-flash` 完全免费,无调用成本,完美匹配 Render.com free tier 部署场景;若需更高精度可平滑升级至 `glm-4v-plus`(4 元/百万 tokens,单图约 0.004 元)。

2. **OpenAI 兼容格式,零迁移成本**:`POST /chat/completions` 端点与 OpenAI 格式完全一致,Node.js 端用现有 axios 直连即可,无需引入额外 SDK,符合"不依赖 Python,优先 API 调用"约束。

3. **项目生态一致性**:项目智能体矩阵已采用 GLM 系列模型(`ai-integration-engineer` 使用 `glm-5.2`),API Key 体系、调用模式、错误处理可复用,降低维护成本。

4. **3 秒 SLA 可保障**:`glm-4v-flash` 响应时间 1-2s,配合 2.5s 超时控制 + Jimp fallback 策略,总耗时 `max(Jimp ~500ms, AI ~2s) ≈ 2-2.5s < 3s`,满足硬约束。

5. **视觉理解能力适配艺术作品分析**:GLM-4V 支持图像描述、视觉问答、图像分类、视觉定位、图像情感分析等能力,正好覆盖美院评分标准中的"主题与意境理解""风格识别""语义问题诊断"需求。

6. **中国网络直连**:`open.bigmodel.cn` 国内直连,延迟 50-200ms,无 GFW 阻断风险,不依赖 OpenAI/Anthropic(项目约束)。

7. **多语言中文友好**:26 种语言含中文,对中文艺术术语(如"明度九阶""黄金分割""计白当黑")理解准确,匹配 `art-evaluation-standards.md` 美院规范术语要求。

### 1.3 GLM-4V API 技术规格

| 项 | 值 |
|---|---|
| **Base URL** | `https://open.bigmodel.cn/api/paas/v4` |
| **端点** | `POST /chat/completions` |
| **认证** | `Authorization: Bearer {API_KEY}`(格式 `xxxxxxxxxx.xxxxxxxx`) |
| **推荐模型** | `glm-4v-flash`(免费,默认)/ `glm-4v-plus`(付费,高精度) |
| **上下文窗口** | 8K(flash)/ 16K(plus-0111) |
| **最大输出 Tokens** | 4K |
| **单图消耗** | 约 1047 tokens |
| **图片输入** | URL(`image_url.url`)或 base64(`data:image/jpeg;base64,{b64}`) |
| **速率限制** | glm-4v-flash:免费 10 RPM / 付费 100 RPM |
| **错误码** | 400(参数)/ 401(认证)/ 429(限流)/ 1301(合规拦截)/ 1302(模型过载) |

**请求体示例(OpenAI 兼容)**:

```json
{
  "model": "glm-4v-flash",
  "messages": [
    {
      "role": "system",
      "content": "你是央美/国美/清美教授,按美院评分标准分析作品..."
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "请分析这幅绘画作品的构图、色彩、笔触..." },
        { "type": "image_url", "image_url": { "url": "https://cdn.danqing-ai.com/uploads/xxx.jpg" } }
      ]
    }
  ],
  "temperature": 0.3,
  "max_tokens": 1500,
  "stream": false
}
```

**响应体示例**:

```json
{
  "id": "chatcmpl-xxx",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"semantic_theme\":\"...\",\"style_recognition\":\"...\",...}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 1200, "completion_tokens": 800, "total_tokens": 2000 }
}
```

---

## 二、混合分析管线设计

### 2.1 设计目标

现有 Jimp 像素分析提供客观指标(构图/色彩/笔观数据),但无法理解语义层面(主题/风格/专业建议)。混合管线目标:

- **Jimp 提供**:客观数据(分数、热力图、重心坐标、空白比、主色识别、冷暖比、对称性等)
- **AI 提供**:语义增强(主题与意境理解、风格识别、专业改进建议、参考案例、评分校准)
- **合并策略**:AI 的 `score_adjustments` 可微调 Jimp 分数(幅度 ±5 分,防止偏差)
- **Fallback**:AI 超时/失败时仅返回 Jimp 结果,保证 3 秒 SLA 不违约

### 2.2 管线架构图

```
用户提交图片(POST /analyses)
  │
  ├─ analysis.service.ts (编排器)
  │   ├─ 校验配额 → 写 DB(pending)
  │   ├─ 决策:AI_ENABLED?
  │   │   ├─ false → 仅 Jimp 分析(现有逻辑,~500ms)
  │   │   └─ true  → 混合分析(ai-analysis.service.ts)
  │   │
  │   └─ 更新 DB(success/failed) → 返回结果
  │
  └─ ai-analysis.service.ts (混合编排器)
      │
      ├─ Promise.allSettled([
      │   ├─ Jimp 像素分析(analysis-engine.service.ts) → AnalysisResult
      │   └─ AI 视觉分析(ai-vision.service.ts)        → AIVisionResult
      │ ])
      │
      ├─ 结果合并策略:
      │   ├─ Jimp 成功 + AI 成功 → 合并增强(score_adjustments 微调 ±5)
      │   ├─ Jimp 成功 + AI 失败 → 仅 Jimp(aiEnhanced=false)
      │   ├─ Jimp 失败 + AI 成功 → AI 提供主结果 + Jimp fallback 兜底
      │   └─ Jimp 失败 + AI 失败 → 空回退(理论上不会触发)
      │
      └─ 返回 HybridAnalysisResult
```

### 2.3 SLA 时序分析

| 场景 | Jimp 耗时 | AI 耗时 | 总耗时(并行 max) | 是否满足 3s SLA |
|---|---|---|---|---|
| AI 关闭(AI_ENABLED=false) | ~500ms | N/A | ~500ms | 满足 |
| AI 开启 + 成功 | ~500ms | ~1.5-2s | ~2s | 满足 |
| AI 开启 + 超时(2.5s 触发 fallback) | ~500ms | 2.5s(超时切断) | ~2.5s | 满足(边界) |
| AI 开启 + API 失败(快速返回) | ~500ms | ~200ms(错误返回) | ~500ms | 满足 |

**关键控制点**:
- AI 请求超时硬性设为 `2500ms`(env `AI_API_TIMEOUT=2500`),超时立即切断走 fallback
- Jimp 与 AI 并行执行(`Promise.allSettled`),总耗时为两者最大值
- 不做 AI 重试(重试会突破 3s SLA);失败即 fallback

### 2.4 Fallback 策略(三道防线)

| 防线 | 触发条件 | 行为 |
|---|---|---|
| 第一道 | AI_API_KEY 未配置 / AI_ENABLED=false | 跳过 AI,仅 Jimp 分析(现有逻辑) |
| 第二道 | AI 请求超时(>2.5s)/ HTTP 错误 / 响应格式异常 | 返回 Jimp 结果,`aiEnhanced=false`,`aiFailureReason` 记录原因 |
| 第三道 | Jimp 也失败(图片损坏等) | 返回 `generateFallbackAnalysis`(现有兜底逻辑) |

---

## 三、Prompt 工程设计

### 3.1 系统提示词(System Prompt)

参考 `art-evaluation-standards.md` 美院规范,设计专业系统提示:

```
你是中央美术学院/中国美术学院/清华美术学院的资深教授,拥有 20 年教学经验。
请严格按照《丹青有AI 美院评分标准》对学生的{artType}作业进行专业诊断。

校准总则(六条底线):
1. 术语专业:一律使用美院规范术语(如"明度九阶"而非"亮暗层次","黄金分割点定位"而非"主体位置好不好")
2. 评分有据:每个分数档必须对应可识别的视觉特征,禁止主观印象打分
3. 建议可执行:每条建议须含"具体操作 + 参考案例 + 练习路径"三要素,禁止"加强构图"式空泛反馈
4. 尊重多元:区分"基础性问题"与"风格选择":基础问题必须纠正,风格问题可讨论
5. 因类制宜:绘画重"再现与表达",设计重"创意与逻辑",产品重"语义与可行",雕塑重"空间与观念"
6. 致广大:评分兼顾"尽精微"(子指标量化)与"致广大"(整体气韵)

你必须严格输出 JSON 格式(无 markdown 代码块,无解释性文字),结构如下:
{
  "semantic_theme": "主题与意境理解(50-100字,描述作品传达的主题、情感、意境)",
  "style_recognition": "风格识别(如'印象派条件色处理'/'古典写实明暗塑造'/'极简主义网格构成'等)",
  "professional_suggestions": [
    {
      "dimension": "维度名(构图与造型/色彩表现/笔触与技法/整体与完整/视觉层次/排版与构成/色彩应用/创意表达/形态语义/材质表现/功能表达/人机工程/空间构成/形体语言/材料语言/观念表达)",
      "level": "良|中|差",
      "operation": "具体操作(含数值/位置/方法,如'将主体从画面正中向左下偏移 1/3,使其落于黄金分割点')",
      "reference": "参考案例(美术史作品,如'塞尚《静物》三角构图')",
      "practice": "练习路径(1-2 个针对性练习,如'对同一组静物做 4 种构图变体速写')"
    }
  ],
  "score_adjustments": {
    "dimension_adjustments": [
      { "dimension": "维度名", "delta": -5~+5 的整数, "reason": "校准理由(基于视觉特征)" }
    ],
    "overall_delta": -5~+5 的整数,
    "overall_reason": "整体校准理由"
  },
  "reference_artworks": [
    { "title": "作品名", "artist": "艺术家", "reason": "推荐理由(与本作业的关联)" }
  ]
}
```

### 3.2 用户提示词(User Prompt)

按作品类型(painting/design/product/sculpture)注入对应维度术语:

```
请分析这幅{artTypeLabel}作业。

{dimensionContext}

已知客观像素数据(供你校准评分时参考):
- 视觉重心:({focusX}, {focusY})
- 留白比例:{whitespaceRatio}
- 暖冷比:{warmRatio}:{coolRatio}
- 主色调:{dominantColor}
- 对比度:{contrast}
- 饱和度:{saturation}
- 纹理复杂度:{textureComplexity}
- 边缘密度:{edgeDensity}

请基于以上客观数据 + 你的视觉理解,输出 JSON 诊断结果。
重点:professional_suggestions 必须具体可执行,score_adjustments 的 delta 范围 ±5 防止偏差。
```

其中 `{dimensionContext}` 按作品类型注入:

| 作品类型 | 维度上下文 |
|---|---|
| painting | 绘画四维度:构图与造型(25%)/色彩表现(25%)/笔触与技法(25%)/整体与完整(25%) |
| design | 设计四维度:视觉层次(25%)/排版与构成(25%)/色彩应用(20%)/创意表达(30%) |
| product | 产品四维度:形态语义(30%)/材质表现(25%)/功能表达(25%)/人机工程(20%) |
| sculpture | 雕塑四维度:空间构成(30%)/形体语言(30%)/材料语言(25%)/观念表达(15%) |

### 3.3 输出解析与容错

- **JSON 提取**:AI 返回的 `content` 可能包含 markdown 代码块包裹(```json ... ```),需用正则提取首尾 `{` `}` 之间的内容
- **结构校验**:解析后用 Zod schema 校验字段完整性,缺失字段用默认值填充
- **delta 范围限制**:`score_adjustments.dimension_adjustments[].delta` 与 `overall_delta` 强制 clamp 到 [-5, +5]
- **解析失败处理**:JSON 解析失败 → 视为 AI 失败 → fallback 到 Jimp 结果

---

## 四、文件交付清单

### 4.1 新增文件

| 文件 | 说明 |
|---|---|
| `server/src/types/ai-analysis.ts` | AI 分析类型定义(AIVisionResult / HybridAnalysisResult / ScoreAdjustment / ProfessionalSuggestion) |
| `server/src/services/ai-vision.service.ts` | AI 视觉服务(API client + Prompt 工程 + 超时控制 + 响应解析 + 错误处理) |
| `server/src/services/ai-analysis.service.ts` | 混合分析编排器(并行调用 Jimp+AI / 合并策略 / Fallback) |
| `server/tests/ai-vision.service.test.ts` | AI 服务测试(mock API,覆盖成功/超时/失败/格式异常/合并) |
| `server/tests/mocks/ai-api.mock.ts` | AI API mock(模拟 GLM-4V 响应/超时/错误) |
| `.trae/documents/ai-integration-design.md` | 本文档(选型决策 + 设计) |
| `.trae/documents/ai-integration-report.md` | 验收报告 |

### 4.2 修改文件(条件开关,向后兼容)

| 文件 | 修改内容 |
|---|---|
| `server/src/types/api-contract.ts` | 追加 AI 相关类型(`AIEnhancedAnalysisResult` 等),不修改现有类型 |
| `server/.env.example` | 追加 AI 环境变量(`AI_API_KEY` / `AI_API_URL` / `AI_API_TIMEOUT` / `AI_API_MODEL` / `AI_ENABLED`) |
| `server/src/config/env.ts` | 追加 AI 配置字段(`aiApiKey` / `aiApiUrl` / `aiApiTimeout` / `aiApiModel` / `aiEnabled`)到 EnvConfig |
| `server/src/services/analysis.service.ts` | 添加 AI 增强开关,`AI_ENABLED=true` 时调用 `ai-analysis.service.ts`,否则保持现有逻辑 |
| `server/src/controllers/analysis.controller.ts` | 响应中追加 AI 增强字段(若可用),保持现有结构兼容 |
| `server/tests/setup.ts` | 注入 AI 测试环境变量(`AI_ENABLED=false` 默认关闭,保持现有测试不受影响) |

### 4.3 不修改文件(安全策略)

| 文件 | 原因 |
|---|---|
| `server/src/services/analysis-engine.service.ts` | Jimp 像素分析核心,保持作为 fallback 与客观指标来源 |
| `server/src/types/api-contract.ts` 现有类型 | 向后兼容,仅追加不修改 |

---

## 五、性能基准与成本分析

### 5.1 性能基准预估

| 指标 | AI 关闭 | AI 开启(成功) | AI 开启(超时) |
|---|---|---|---|
| 响应时间 P50 | ~500ms | ~2s | ~2.5s |
| 响应时间 P95 | ~800ms | ~2.3s | ~2.5s |
| 吞吐量(RPS) | ~100 | ~20 | ~20 |
| 3 秒 SLA 违约率 | 0% | 0% | 0%(边界) |

### 5.2 成本分析(glm-4v-flash 免费)

| 模型 | 单次调用成本 | 月度成本(1000 次分析) | 备注 |
|---|---|---|---|
| glm-4v-flash | **0 元(免费)** | 0 元 | 推荐默认,满足免费部署层 |
| glm-4v-plus | ~0.004 元(1047 tokens × 4 元/百万) | ~4 元 | 高精度场景可选 |

### 5.3 资源占用

- **内存**:AI 服务层无状态,单次请求峰值内存增量 < 5MB(图片 base64 编码 + prompt 字符串)
- **CPU**:JSON 解析 + 字符串处理,无密集计算
- **网络**:单次 AI 请求约 2KB(prompt) + 1.5KB(响应),可忽略

---

## 六、安全与可观测性

### 6.1 安全策略

| 项 | 实现 |
|---|---|
| API Key 保护 | 通过 env `AI_API_KEY` 注入,禁止硬编码;logger 脱敏规则已覆盖 `apiKey`/`aiApiKey` |
| 图片数据安全 | 优先传 URL(已上传 CDN),避免 base64 大字段;base64 模式仅在本地文件时使用 |
| Prompt 注入防护 | 系统提示固定不可用户篡改;用户输入仅 artType/title/remark,经 Zod 校验 |
| 响应可信 | AI 返回 JSON 经 Zod schema 校验,delta 强制 clamp ±5,防止恶意高分/低分 |
| 日志脱敏 | AI 请求/响应日志不记录完整图片 base64,仅记录 URL/尺寸/耗时 |

### 6.2 可观测性

| 指标 | 日志字段 | 用途 |
|---|---|---|
| AI 调用成功率 | `aiSuccess: boolean` | 监控 AI 服务健康度 |
| AI 耗时 | `aiDurationMs: number` | SLA 监控,P95 > 2.5s 告警 |
| AI 失败原因 | `aiFailureReason: string` | 分类统计(超时/HTTP 错误/解析失败) |
| Fallback 触发率 | `aiEnhanced: boolean` | 监控 AI 不可用比例 |
| 评分校准幅度 | `scoreAdjustments` | 监控 AI 与 Jimp 分数偏差,防止系统性偏差 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| GLM-4V 服务不可用 | AI 增强失效 | Fallback 到 Jimp,保证基础分析可用 |
| GLM-4V 响应超 2.5s | 触发超时切断 | 硬超时 2.5s,并行 Jimp 保证总耗时 < 3s |
| GLM-4V 返回非 JSON | 解析失败 | 正则提取 + Zod 校验 + 失败 fallback |
| GLM-4V 评分偏差大 | 误导学生 | delta 强制 clamp ±5,且仅作"校准建议"非覆盖 Jimp 分数 |
| 免费额度限流(10 RPM) | 高并发时 429 | Render free tier 流量有限,初期足够;后续升级付费或加 Redis 缓存 |
| Prompt 注入攻击 | AI 输出异常 | 用户输入仅 artType(枚举)/title/remark(Zod 校验长度),无自由 prompt |

---

## 八、验收标准

- [ ] AI API 选型决策文档完成(本文档)
- [ ] `ai-vision.service.ts` 实现(API client + prompt + 超时 + fallback)
- [ ] `ai-analysis.service.ts` 实现(混合编排 + 合并策略)
- [ ] `ai-analysis.ts` 类型定义
- [ ] `.env.example` 环境变量
- [ ] `analysis.service.ts` 集成(条件开关,fallback 安全)
- [ ] AI 测试用例(mock API,覆盖成功/超时/失败/格式异常/合并)
- [ ] `npm run build` 通过
- [ ] `npm test` 全部通过(现有 260 + 新增 AI 测试)
- [ ] 3 秒 SLA 验证(总耗时 < 3s,AI 超时 fallback < 3s)

---

**文档结束。本设计已基于美院评分标准与 API 契约校准,可作为 Phase 2 AI 集成实现的权威依据。**
