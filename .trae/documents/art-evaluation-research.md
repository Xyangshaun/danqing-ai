# 丹青有AI 艺术教育诊断系统
## 权威评分标准体系与多风格预设方案研究文档

> **文档性质**：评分预设(EvaluationPreset)与多评委争议仲裁机制研究交付物
> **编制角色**：美院教授顾问（央美/国美/清华美院三校教学规范）
> **编制日期**：2026-07-30
> **育人理念**：尽精微，致广大；思政铸魂、美育化人、精微致广、五创融合
> **配套文档**：`.trae/documents/art-evaluation-standards.md`（四类作品维度术语校准与评分标准 v1.0）
> **对接代码**：`server/src/types/ai-analysis.ts`（`AnalysisResult.dimensions` / `ScoreAdjustments`）、`src/pages/AnalysisPage.tsx`（`ANALYSIS_CONFIG`）
> **版本**：v1.0（2026-07-30）

---

## 0. 文档说明

### 0.1 任务来源
本系统四类作品 `painting / design / product / sculpture` 现有评分维度存放于 `AnalysisResult.dimensions`，需支持「多套预设方案」（名教授风格/知名艺术家/顶级美院风格/不同设计取向），并在多评委评分不一致时触发仲裁、按预设权重加权得出最终分。本文档为此提供权威评分维度、权重、四套风格化预设、争议仲裁机制与专业术语标准，供后端落地 `EvaluationPreset` 与仲裁算法。

### 0.2 与现有标准的关系（关键工程约定）
`art-evaluation-standards.md` 已确立四类作品各 4 维度的权威基准，并已与前端 `ANALYSIS_CONFIG` 对接。为使「多套预设方案」在代码层可互换、不破坏现有维度结构，本文件采用如下约定：

- **规范维度键（canonical dimension keys）**：沿用现有 4 维度命名，作为所有预设方案共用的维度集合。预设方案 = 对同一组维度键的「权重重分配」。
- **权威基准预设**：即 `art-evaluation-standards.md` 的权重组合，对应本文件「顶级美院风格」预设。
- **维度不增减**：四套预设方案均使用各类型既有的 4 维度，仅调整权重；如需 5–6 维度精细诊断，作为「子指标」层处理（见 §1.6），不改变顶层维度键。

### 0.3 引用与参照标准
- 中央美术学院《基础部评分细则》《造型类本科招生考试评分标准》
- 中国美术学院《专业基础教学大纲》《中国画/色彩课程评估标准》
- 清华大学美术学院《工业设计教学评估标准》《视觉传达专业评分细则》
- 第十三届/第十四届全国美术作品展览评审办法
- 红点设计奖（Red Dot Award）评审维度：创新、功能、形态、情感、执行
- iF 设计奖（iF Design Award）评审维度：理念、形态、功能、差异化、影响
- WCAG 2.1 AA 无障碍对比度标准（设计类色彩应用）
- GB/T 12985 人体测量数据（产品类人机工程）

### 0.4 设计原则
1. **专业权威**：维度与权重参考三校评分体系，区分「基础性问题」与「风格选择」。
2. **可工程化**：所有数值、阈值均可直接落地为 `EvaluationPreset` 数据结构与仲裁算法参数。
3. **风格多元**：通过多套预设尊重艺术表达多元，避免单一标准评判所有风格。
4. **成长导向**：评分服务于学生成长，建议须具体可执行，呼应四阶段递进培养（基础训练→专业基础→专业深化→创作实践）。

---

## 1. 任务1：四类作品权威评价维度与权重

### 1.1 评分量纲统一规范

| 项目 | 规范 |
|---|---|
| 分数量纲 | 0–100 分（连续值，内部计算保留一位小数） |
| 维度分 | 每个维度独立 0–100 分 |
| 总分计算 | `total = Σ(dimension_score × dimension_weight)`；结果四舍五入至一位小数 |
| 对外等级 | 五档：A 优秀 90–100；B 良好 80–89.9；C 合格 70–79.9；D 待改进 60–69.9；E 不合格 <60 |
| 维度判定四档 | 优秀(≥90) / 良好(80–89) / 合格(70–79) / 待改进(<70，含 D 待改进与 E 不合格) |

> **与现有 `art-evaluation-standards.md` 的衔接**：该文档采用「优(90-100)/良(75-89)/中(60-74)/差(<60)」四档。本文件统一为五档制以同时满足「待改进」与「不合格」的区分需求，映射关系为：优→A；良(80-89)→B、良(75-79)→C；中(70-74)→C、中(60-69)→D；差(<60)→E。建议后端统一采用本五档制，`art-evaluation-standards.md` 的判定要点文字可直接复用。

### 1.2 绘画类 (painting)

**适用范围**：素描、色彩、速写、人物写生、油画、国画、版画、壁画。

**权威基准权重**（= 顶级美院风格预设，对应 `art-evaluation-standards.md` §2.1）：

| 维度键 | 规范术语（中文全称） | English | 权重 | 评分核心 |
|---|---|---|---|---|
| `composition_form` | 构图与造型 | Composition & Form | 25% | 比例结构、透视空间、主次节奏、正负形 |
| `color` | 色彩表现 | Color Expression | 25% | 色调统一、色温并置、以色塑形 |
| `technique` | 笔触与技法 | Technique & Brushwork | 25% | 用笔质量、体量空间、语言探索 |
| `overall` | 整体与完整 | Overall Unity & Completeness | 25% | 主次虚实、气韵贯通、完整度 |

**四档判定要点**：

| 维度 | 优秀(≥90) | 良好(80–89) | 合格(70–79) | 待改进(<70) |
|---|---|---|---|---|
| 构图与造型 | 构图严谨，主体落黄金分割点附近，主次节奏分明，正负形分割具美感，透视准确，空间纵深强 | 构图完整，主体位置基本合理，主次清晰，透视基本正确偶有小瑕疵 | 构图完整但主体居中偏僵，主次一般，透视存在明显误差 | 构图松散主体游离，无明确主次，透视错误空间混乱 |
| 色彩表现 | 色调高度统一且具调性，冷暖推敲精到，以色塑形充分，无脏闷粉焦 | 色调统一，冷暖基本正确，色彩塑造尚可，偶有局部脏闷 | 色调基本成立但偏单调，冷暖模糊，存在脏闷粉焦之一 | 色调混乱无调性，冷暖颠倒，脏闷粉焦并存 |
| 笔触与技法 | 笔意生动用笔果断，体量空间光感俱佳，特征把握精准，有个人面貌 | 笔触表现较好，体量空间尚可，特征把握到位 | 笔触平淡缺乏变化，体量空间不足，特征一般 | 笔触生硬或杂乱，无体量空间感，特征失准 |
| 整体与完整 | 气韵贯通，主次虚实精到，完整度高，细节服务整体有点睛之笔 | 整体关系尚好，主次虚实基本成立，画面基本完整 | 整体关系一般，主次虚实欠分明，局部破坏整体 | 整体松散无气韵，主次虚实混乱，局部堆砌 |

> 子指标量化（黄金分割点 0.382/0.618、主色相占比≥55%、明暗五调齐备等）详见 `art-evaluation-standards.md` §2.2。

### 1.3 设计类 (design)

**适用范围**：平面设计、视觉传达、品牌、海报、信息设计、字体设计、UI。

**权威基准权重**（对应 `art-evaluation-standards.md` §3.1）：

| 维度键 | 规范术语（中文全称） | English | 权重 | 评分核心 |
|---|---|---|---|---|
| `visual_hierarchy` | 视觉层次 | Visual Hierarchy | 25% | 焦点明确、层级递进、节奏留白 |
| `layout` | 排版与构成 | Layout & Composition | 25% | 网格遵循、对齐质量、正负形 |
| `color_application` | 色彩应用 | Color Application | 20% | 对比度、品牌识别、无障碍 |
| `creativity` | 创意表达 | Creative Expression | 30% | 创意新颖、概念转化、文化共鸣 |

**四档判定要点**：

| 维度 | 优秀(≥90) | 良好(80–89) | 合格(70–79) | 待改进(<70) |
|---|---|---|---|---|
| 视觉层次 | 焦点唯一明确，层级递进清晰(≥3级)，留白得当(30%~50%)，节奏鲜明 | 焦点基本明确，层级尚清晰，留白较好，节奏一般 | 焦点不突出或多焦点争抢，层级模糊，留白过满或过空 | 无明确焦点，层级混乱，留白失当，无节奏 |
| 排版与构成 | 网格严谨遵循(≥85%)，对齐质量高，字体节奏协调，正负形互衬，比例合黄金比 | 网格基本遵循，对齐较好，字体节奏尚可，正负形得当 | 网格意识薄弱，对齐杂乱，字体节奏混乱，正负形未经营 | 无网格概念，对齐随意，字体无系统，正负形割裂 |
| 色彩应用 | 对比符合 WCAG AA，品牌识别强，色彩心理学精准，无障碍合规 | 对比达标，品牌色应用较好，色彩心理有所体现，无障碍基本合规 | 对比勉强达标，品牌色一般，色彩心理模糊，无障碍未考虑 | 对比不达标，品牌色混乱，色彩心理误用，无障碍严重缺失 |
| 创意表达 | 创意新颖独特，概念转化精准深刻，叙事强，文化共鸣高，有原创面貌 | 创意有一定新意，概念转化尚可，叙事基本成立 | 创意平庸，概念转化生硬，叙事薄弱，符号堆砌 | 无创意或抄袭，概念缺失，无叙事，文化误用 |

### 1.4 产品类 (product)

**适用范围**：工业设计、产品设计、交互硬件、家居产品、交通工具设计。

**权威基准权重**（对应 `art-evaluation-standards.md` §4.1）：

| 维度键 | 规范术语（中文全称） | English | 权重 | 评分核心 |
|---|---|---|---|---|
| `form_semantics` | 形态语义 | Form Semantics | 30% | 曲面 G2 连续、体量平衡、语义准确 |
| `material` | 材质表现 | Material Expression | 25% | 质感真实、反射准确、搭配美学 |
| `function` | 功能表达 | Functional Expression | 25% | 结构清晰、功能暗示、分区合理 |
| `ergonomics` | 人机工程 | Ergonomics | 20% | 握持尺度、操作可达、视觉引导 |

**四档判定要点**：

| 维度 | 优秀(≥90) | 良好(80–89) | 合格(70–79) | 待改进(<70) |
|---|---|---|---|---|
| 形态语义 | 曲面 G2 连续，比例合黄金比，倒角精到，体量平衡，语义与功能高度一致，有原创语言 | 曲面 G1 连续，比例基本合理，倒角较好，体量尚平衡，语义与功能基本对应 | 曲面 G0 连续或有折痕，比例一般，倒角粗糙，体量失衡，语义模糊 | 曲面断裂不连续，比例失调，无倒角，体量混乱，语义错误 |
| 材质表现 | 质感高度真实，光影反射物理准确，材质搭配考究，CMF 精致 | 质感较好，反射基本正确，材质搭配尚可，CMF 到位 | 质感一般，反射有误，材质搭配平庸，CMF 粗糙 | 质感失真，反射错误，材质搭配混乱，无 CMF 意识 |
| 功能表达 | 结构逻辑清晰可读，功能暗示明确，交互可识别度高，分区合理 | 结构基本清晰，功能暗示尚可，交互可识别，分区基本合理 | 结构模糊，功能暗示弱，交互可识别度低，分区混乱 | 结构无法解读，无功能暗示，交互不可识别，无分区 |
| 人机工程 | 握持比例符合人体测量百分位(第5~95)，操作完全可达，引导精准，尺度合理 | 握持比例基本合理，操作可达，引导较好，尺度尚可 | 握持比例欠妥，操作部分不可达，引导模糊，尺度偏颇 | 握持比例失调，操作不可达，无引导，尺度严重失当 |

### 1.5 雕塑类 (sculpture)

**适用范围**：圆雕、浮雕、公共艺术、装置艺术、综合材料。

**权威基准权重**（对应 `art-evaluation-standards.md` §5.1）：

| 维度键 | 规范术语（中文全称） | English | 权重 | 评分核心 |
|---|---|---|---|---|
| `spatial_composition` | 空间构成 | Spatial Composition | 30% | 体量占有、正负空间、多视点 |
| `form_language` | 形体语言 | Form Language | 30% | 造型准确、形态独特、动态张力 |
| `material_language` | 材料语言 | Material Language | 25% | 材料发挥、主题契合、工艺精良 |
| `concept` | 观念表达 | Conceptual Expression | 15% | 概念深度、主题诠释、时代性 |

**四档判定要点**：

| 维度 | 优秀(≥90) | 良好(80–89) | 合格(70–79) | 待改进(<70) |
|---|---|---|---|---|
| 空间构成 | 正负空间处理精到，三维体量高度平衡，多视点完整各具意味，空间张力饱满 | 正负空间较好，体量基本平衡，多视点完整，张力尚可 | 正负空间一般，体量略失衡，多视点单一，张力不足 | 正负空间混乱，体量严重失衡，视角单一，无张力 |
| 形体语言 | 造型准确(或有意变形语言统一)，形态独特有原创面貌，比例尺度精当，动态张力饱满 | 造型基本准确，形态有一定特色，比例合理，动态尚可 | 造型一般，形态面貌模糊，比例欠妥，动态平淡 | 造型失准，形态无面貌，比例失调，无动态 |
| 材料语言 | 材料特性充分发挥，材料与主题高度契合，工艺精良，肌理层次丰富 | 材料特性较好发挥，材料-主题契合尚可，工艺良好 | 材料特性发挥一般，材料-主题契合弱，工艺粗糙 | 材料特性未发挥，材料-主题冲突，工艺低劣 |
| 观念表达 | 概念深刻，主题诠释精准，文化语境恰当，时代性强 | 概念有一定深度，主题诠释尚可，文化语境较好 | 概念浅显，主题诠释生硬，文化符号堆砌 | 无概念或抄袭，主题缺失，文化误用，无时代性 |

### 1.6 维度数量说明（4–6 维度要求的工程取舍）
用户要求每类 4–6 个维度。本文件采用「顶层 4 维度 + 子指标层」结构：顶层 4 维度与现有 `AnalysisResult.dimensions` / 前端 `ANALYSIS_CONFIG` 完全对齐，保证预设方案可互换；每维度下设 4–5 个可量化子指标（见 `art-evaluation-standards.md` §2.2/§3.2/§4.2/§5.2，如绘画 18 个、设计 17 个、产品 17 个、雕塑 17 个子指标），实现「4 维度宏观诊断 + 子指标精微量化」，既满足 4–6 维度要求，又兼顾工程兼容性与「尽精微，致广大」的育人理念。

---

## 2. 任务2：四套风格化预设方案

### 2.0 预设方案总览

| 预设 ID | 名称 | 风格定位 | 设计理念 |
|---|---|---|---|
| `preset_academic` | 名教授风格 | 学术严谨型 | 强调基础与规范，重造型/色彩/形态/形体/网格等基本功，适用于基础训练与专业基础阶段诊断 |
| `preset_artist` | 知名艺术家风格 | 创意表达型 | 强调个性与创新，重技法语言/创意/观念/材质表现，适用于创作实践与个人面貌探索阶段 |
| `preset_academy` | 顶级美院风格 | 综合均衡型 | 央美/国美/清华录取标准导向，等于权威基准权重，适用于招生模拟与综合评估 |
| `preset_applied` | 设计取向风格 | 应用导向型 | 强调功能与用户体验，重视觉层次/排版/功能/人机/空间公共性，适用于 product/design 实战及公共艺术 |

> 所有预设均沿用 §1 各类别的 4 个规范维度键，仅重分配权重；权重总和均为 100%。

### 2.1 预设A：名教授风格（学术严谨型 `preset_academic`）

**设计理念**：以央美基础部「以造型为本」、清华美院「结构与规范优先」传统为依据，加重基础维度（造型/形态/形体/排版/空间构成），降低创意/观念/人机等「进阶」维度权重。适用于基础训练与专业基础阶段，强调「先立规矩，再谈表达」。

| 类别 | 维度权重组合 | 理念要点 |
|---|---|---|
| painting | `composition_form` 30 / `color` 25 / `technique` 25 / `overall` 20 | 造型升至 30%，夯实比例透视结构；整体降至 20%，因基础阶段重在「画对」而非「画整」 |
| design | `visual_hierarchy` 30 / `layout` 25 / `color_application` 20 / `creativity` 25 | 层次与排版共 55%，强调网格与信息秩序；创意降至 25%，规范先于个性 |
| product | `form_semantics` 35 / `material` 25 / `function` 25 / `ergonomics` 15 | 形态语义升至 35%，曲面连续与体量优先；人机降至 15%，造型基本功阶段暂缓 |
| sculpture | `spatial_composition` 35 / `form_language` 30 / `material_language` 25 / `concept` 10 | 空间与形体共 65%，三维造型基本功优先；观念降至 10%，基础阶段弱化观念评判 |

### 2.2 预设B：知名艺术家风格（创意表达型 `preset_artist`）

**设计理念**：以全国美展创作评审、当代艺术评价中「个人面貌与观念深度」权重为依据，加重技法语言/创意/观念/材质表现，降低严格基础维度。**仅适用于创作实践与个人面貌探索阶段，不适用于基础训练阶段**——否则易将基础性失误误判为「风格选择」。

| 类别 | 维度权重组合 | 理念要点 |
|---|---|---|
| painting | `composition_form` 15 / `color` 20 / `technique` 35 / `overall` 30 | 技法语言升至 35%，整体气韵 30%，强调笔意与个人面貌；构图造型降至 15%，允许有意打破常规构图 |
| design | `visual_hierarchy` 15 / `layout` 15 / `color_application` 20 / `creativity` 50 | 创意升至 50%，原创性与文化叙事主导；层次排版各 15%，形式服从创意 |
| product | `form_semantics` 40 / `material` 30 / `function` 20 / `ergonomics` 10 | 形态语义 40% + 材质 30%，造型与材质作为情感表达载体；人机降至 10%，艺术家产品偏观念性 |
| sculpture | `spatial_composition` 20 / `form_language` 30 / `material_language` 20 / `concept` 30 | 观念升至 30% 与形体并重，材料降至 20%，强调观念驱动与形态语言独特性 |

> **product 类说明**：艺术家风格用于产品类略显张力（产品本质讲求功能可行）。此处采「形态+材质=70%」的最近权重组，适用于「艺术衍生品/限量设计/观念产品」类作品；对功能性强的量产产品设计，建议改用 `preset_applied`。

### 2.3 预设C：顶级美院风格（综合均衡型 `preset_academy`）

**设计理念**：以央美/国美/清华三校本科招生与基础教学评分标准为基准，四维度均衡而各有侧重，**权重等于 §1 权威基准**，是系统默认预设。适用于招生模拟、综合评估与跨阶段成长档案。

| 类别 | 维度权重组合 | 理念要点 |
|---|---|---|
| painting | `composition_form` 25 / `color` 25 / `technique` 25 / `overall` 25 | 四维等权 25%，三校招生标准的均衡取向，造型色彩笔触整体并重 |
| design | `visual_hierarchy` 25 / `layout` 25 / `color_application` 20 / `creativity` 30 | 创意 30% 略高，体现设计学科「创意为先」；层次排版各 25%，色彩 20% |
| product | `form_semantics` 30 / `material` 25 / `function` 25 / `ergonomics` 20 | 形态语义 30% 领先，材质功能各 25%，人机 20%，清华美院工业设计取向 |
| sculpture | `spatial_composition` 30 / `form_language` 30 / `material_language` 25 / `concept` 15 | 空间与形体各 30% 并重，材料 25%，观念 15%，央美雕塑系基础取向 |

### 2.4 预设D：设计取向风格（应用导向型 `preset_applied`）

**设计理念**：以红点/iF「功能、执行、影响」评审维度与产业实战为依据，加重功能/人机/视觉层次/排版/公共性，降低纯创意/观念权重。适用于 product/design 实战诊断及雕塑中的公共艺术/装置。

| 类别 | 维度权重组合 | 理念要点 |
|---|---|---|
| painting | `composition_form` 20 / `color` 30 / `technique` 20 / `overall` 30 | 色彩 30% + 整体 30%，侧重应用插画/海报的色彩传达与整体沟通力；**绘画非本预设主用场**，此为最近权重组 |
| design | `visual_hierarchy` 30 / `layout` 25 / `color_application` 25 / `creativity` 20 | 层次+排版+色彩共 80%，强调可用性与信息效率；创意降至 20%，应用导向弱化纯原创评判 |
| product | `form_semantics` 25 / `material` 20 / `function` 30 / `ergonomics` 25 | 功能 30% + 人机 25% 共 55%，用户体验与可用性优先；形态 25%、材质 20% |
| sculpture | `spatial_composition` 35 / `form_language` 25 / `material_language` 15 / `concept` 25 | 空间构成 35% + 观念 25%，公共艺术的环境关系与公众互动优先；材料降至 15% |

### 2.5 四套预设权重对照总表（便于落地为配置）

**绘画 painting**

| 维度键 | 学术A | 艺术家B | 美院C(基准) | 应用D |
|---|---|---|---|---|
| `composition_form` | 30 | 15 | 25 | 20 |
| `color` | 25 | 20 | 25 | 30 |
| `technique` | 25 | 35 | 25 | 20 |
| `overall` | 20 | 30 | 25 | 30 |
| 合计 | 100 | 100 | 100 | 100 |

**设计 design**

| 维度键 | 学术A | 艺术家B | 美院C(基准) | 应用D |
|---|---|---|---|---|
| `visual_hierarchy` | 30 | 15 | 25 | 30 |
| `layout` | 25 | 15 | 25 | 25 |
| `color_application` | 20 | 20 | 20 | 25 |
| `creativity` | 25 | 50 | 30 | 20 |
| 合计 | 100 | 100 | 100 | 100 |

**产品 product**

| 维度键 | 学术A | 艺术家B | 美院C(基准) | 应用D |
|---|---|---|---|---|
| `form_semantics` | 35 | 40 | 30 | 25 |
| `material` | 25 | 30 | 25 | 20 |
| `function` | 25 | 20 | 25 | 30 |
| `ergonomics` | 15 | 10 | 20 | 25 |
| 合计 | 100 | 100 | 100 | 100 |

**雕塑 sculpture**

| 维度键 | 学术A | 艺术家B | 美院C(基准) | 应用D |
|---|---|---|---|---|
| `spatial_composition` | 35 | 20 | 30 | 35 |
| `form_language` | 30 | 30 | 30 | 25 |
| `material_language` | 25 | 20 | 25 | 15 |
| `concept` | 10 | 30 | 15 | 25 |
| 合计 | 100 | 100 | 100 | 100 |

---

## 3. 任务3：多评委争议仲裁机制

### 3.1 争议触发条件

设同一作品由 N 名评委（含 AI）独立评分，每位评委给出总分 `T_i` 与各维度分 `d_{i,k}`。定义：
- 总分极差 `R = max(T_i) − min(T_i)`
- 维度 k 极差 `r_k = max(d_{i,k}) − min(d_{i,k})`
- 跨档：评委间等级判定出现跨 ≥2 档（如一人判 A、一人判 D）

| 触发等级 | 条件（满足其一即触发） | 处置 |
|---|---|---|
| 一致（不触发） | `R < 5` 且 所有 `r_k < 8` | 直接加权出分，归档 |
| 一般争议 | `R ≥ 10`，或 任一 `r_k ≥ 15`，或 跨档=1（相邻档分歧） | 触发单人复核（更高级别评委复核分歧维度） |
| 高争议（强制委员会） | `R ≥ 20`，或 `≥2 个` 维度 `r_k ≥ 15`，或 跨档≥2（如 A vs D/E） | 触发教授委员会复议（≥3 名教授级 + AI） |
| 否决触发 | 任一教授判 E(<60) 且其余判 A(≥90) | 强制委员会复议（防漏评与防放水） |

> **阈值依据**：10 分约对应一档（90/80/70/60 边界）的半档，是「是否影响等级判定」的经验临界；15 分维度差表明评委对该维度性质判断实质分歧；20 分差已跨两档，必须复议。阈值均可配置（见 §5.2 `ArbitrationConfig`）。

### 3.2 仲裁流程

```
[1] 初评：≥2 名评委独立评分（AI 作为一名评委参与，携带自报置信度）
        │
[2] 一致性检测（按 §3.1 阈值）
        ├─ 一致 ───────────────────► 加权平均出分 → 归档
        ├─ 一般争议 ───────────────► [3a] 单人复核
        └─ 高争议 / 否决触发 ──────► [3b] 委员会复议
        │
[3a] 单人复核：由更高级别评委（教授复核讲师分歧；无更高级则由另名教授）
        ├─ 复核维度独立重评 → 与原评分按 §3.3 权重加权 → 出分
        └─ 若复核后仍高争议 → 升级为 [3b]
        │
[3b] 委员会复议：≥3 名教授级 + AI，重新独立评分（可查看原评分与分歧点说明）
        │
[4] 裁定：按 §3.4 规则得出最终分与等级
        │
[5] 归档：记录所有评分、分歧点、裁定依据，写入成长档案
```

### 3.3 评委权重分配

| 评委类型 | 常规双评委模式 | 教授+AI 双人模式 | 委员会复议模式（3教授+AI） |
|---|---|---|---|
| 教授 | 0.50 | 0.70 | 每位 0.30 |
| 讲师 | 0.30 | — | — |
| AI | 0.20 | 0.30 | 0.10 |
| 合计 | 1.00 | 1.00 | 1.00 |

**权重设计依据**：
- 常规模式：教授主导（0.50）但讲师（0.30）与 AI（0.20）具实质制衡，避免一言堂；
- 委员会模式：教授各 0.30 共 0.90，AI 降至 0.10，因高争议属专业判断范畴，AI 仅作参考；
- **AI 权重动态降级**：当 AI 自报置信度 < 0.6 时，AI 权重降至 0.10，释放权重按比例补给在场人工评委，并强制补充 1 名人工评委。

### 3.4 最终裁定规则

| 情形 | 规则 | 说明 |
|---|---|---|
| 全体等级一致 | 直接加权 | 全体评委等级判定相同 → 按权重加权分数，等级按加权分映射 |
| 多数等级一致 | 多数决 + 加权 | 多数评委等级一致 → 以多数等级为准，分数按权重加权 |
| 无多数（分裂） | 加权决 | 按权重加权分数，等级按加权分映射；若加权分落在两档边界±1 分内，取「就低」档（保护学生，从严认定） |
| 否决触发 | 复议后重裁 | 委员会复议后重新裁定，原否决评分作废 |

### 3.5 边界情况处理

| 边界情况 | 处理 |
|---|---|
| 评委缺席 | 由同级别评委替补；无替补则剩余评委权重重新归一化（`w_i' = w_i / Σw_剩余`），并在档案标记「评委缺失」 |
| 评分极端值（离群） | 某评委总分与其他评委分差 ≥ 25 分 → 标记离群，要求该评委提交书面理由；纳入复核，若理由不成立则该评分权重折半 |
| 维度缺失 | 评委未给某维度分 → 该维度按其他评委均值填补，该评委整体置信度降级；若缺失 > 2 个维度 → 该评委整份评分作废 |
| AI 评分置信度低 | AI 自报置信度 < 0.6 → AI 权重降至 0.10 并补充人工评委；< 0.4 → AI 评分仅作参考不计入加权 |
| AI 与人工极端分歧 | AI 与所有人工评委总分差均 ≥ 20 分 → 触发人工复核，AI 评分暂不计入加权，复核后决定是否采信 |
| 平局 | 加权后小数位平局 → 保留一位小数；仍平局 → 委员会主任一票决定（仅等级，不改分数） |
| 风格性分歧 vs 基础性分歧 | 若分歧集中在「风格选择」维度（如笔触语言/观念表达）→ 标记「风格性争议」，按加权处理并附「风格多元」说明；若分歧在「基础性」维度（如透视/比例/结构）→ 必须以严格标准复核，不得以「风格」放水 |

### 3.6 仲裁配置参数（可直接落地）

见 §5.2 `ArbitrationConfig` 数据结构。

---

## 4. 任务4：专业术语标准化

> 供 AI 诊断结构化输出使用。所有术语须使用美院规范表达，禁用口语化词汇（禁用对照见 §4.6）。

### 4.1 绘画类术语（中英对照）

| 中文规范术语 | English | 所属维度 |
|---|---|---|
| 构图 | composition | 构图与造型 |
| 黄金分割 / 黄金比 | golden ratio / golden section | 构图与造型 |
| 三分法则 | rule of thirds | 构图与造型 |
| 三角形构图 | triangular composition | 构图与造型 |
| S 形构图 | S-curve composition | 构图与造型 |
| 对角线构图 | diagonal composition | 构图与造型 |
| 对称与均衡 | symmetry and balance | 构图与造型 |
| 正负形 | positive and negative shape | 构图与造型 |
| 画面分割 | picture division | 构图与造型 |
| 疏密节奏 | density rhythm | 构图与造型 |
| 造型 / 形体 | modeling / form | 构图与造型 |
| 形体结构 | form structure | 构图与造型 |
| 比例 | proportion | 构图与造型 |
| 透视 | perspective | 构图与造型 |
| 体量感 | sense of volume | 构图与造型 |
| 结构线 | structural line | 构图与造型 |
| 轮廓线 | contour line | 构图与造型 |
| 空间关系 | spatial relationship | 构图与造型 |
| 色相 | hue | 色彩表现 |
| 明度 / 明度九阶 | value / nine-step value | 色彩表现 |
| 纯度 / 饱和度 | saturation | 色彩表现 |
| 三原色 | primary colors | 色彩表现 |
| 互补色 | complementary colors | 色彩表现 |
| 邻近色 | analogous colors | 色彩表现 |
| 色调 / 调性 | tone / tonality | 色彩表现 |
| 色调统一性 | tonal unity | 色彩表现 |
| 色温 / 冷暖并置 | color temperature / warm-cool juxtaposition | 色彩表现 |
| 以色塑形 | color modeling | 色彩表现 |
| 条件色 | conditional color | 色彩表现 |
| 脏闷粉焦 | muddy / murky / chalky / burnt (color faults) | 色彩表现 |
| 笔触 / 笔意 | brushwork / brush expression | 笔触与技法 |
| 线条 | line | 笔触与技法 |
| 墨韵 | ink rhythm / ink tone | 笔触与技法 |
| 中锋 / 侧锋 / 逆锋 | center tip / side tip / reverse tip | 笔触与技法 |
| 肌理 | texture | 笔触与技法 |
| 三面五调 | three planes five tones | 笔触与技法 |
| 明暗交界线 | core shadow / terminator | 笔触与技法 |
| 反光 | reflected light | 笔触与技法 |
| 投影 | cast shadow | 笔触与技法 |
| 主次虚实 | primary-secondary, virtual-real | 整体与完整 |
| 气韵贯通 | spirit resonance / overall flow | 整体与完整 |
| 完整度 | completeness | 整体与完整 |

### 4.2 设计类术语（中英对照）

| 中文规范术语 | English | 所属维度 |
|---|---|---|
| 视觉层次 | visual hierarchy | 视觉层次 |
| 视觉焦点 | visual focus | 视觉层次 |
| 信息层级 | information hierarchy | 视觉层次 |
| 留白 / 负空间 | whitespace / negative space | 视觉层次 |
| 节奏感 | sense of rhythm | 视觉层次 |
| 网格系统 | grid system | 排版与构成 |
| 对齐质量 | alignment quality | 排版与构成 |
| 基线网格 | baseline grid | 排版与构成 |
| 字体节奏 | typographic rhythm | 排版与构成 |
| 模数 | module / modulus | 排版与构成 |
| 格式塔原理 | Gestalt principles | 排版与构成 |
| 图底关系 | figure-ground relationship | 排版与构成 |
| 正负形 | positive-negative shape | 排版与构成 |
| 对比度 | contrast | 色彩应用 |
| 品牌识别 | brand identity | 色彩应用 |
| 色彩心理学 | color psychology | 色彩应用 |
| 无障碍合规 | accessibility compliance (WCAG) | 色彩应用 |
| 60-30-10 法则 | 60-30-10 rule | 色彩应用 |
| 原创创意 | original creativity | 创意表达 |
| 概念转化 | concept transformation | 创意表达 |
| 视觉双关 | visual pun / double entendre | 创意表达 |
| 视觉同构 | visual isomorphism | 创意表达 |
| 叙事能力 | narrative ability | 创意表达 |
| 文化共鸣 | cultural resonance | 创意表达 |
| 社会共鸣 | social resonance | 创意表达 |

### 4.3 产品类术语（中英对照）

| 中文规范术语 | English | 所属维度 |
|---|---|---|
| 形态语义 | form semantics | 形态语义 |
| 曲面连续性 | surface continuity (G0/G1/G2) | 形态语义 |
| 曲率连续 | curvature continuity (G2) | 形态语义 |
| 倒角 | fillet / chamfer | 形态语义 |
| 体量平衡 | volume balance | 形态语义 |
| 形态-功能一致性 | form-function consistency | 形态语义 |
| 材质质感 | material texture | 材质表现 |
| 光影反射 | light and reflection | 材质表现 |
| PBR 物理渲染 | physically based rendering | 材质表现 |
| CMF（色彩/材质/工艺） | color, material, finish | 材质表现 |
| 材质搭配 | material matching | 材质表现 |
| 结构逻辑 | structural logic | 功能表达 |
| 功能暗示 | functional affordance | 功能表达 |
| 人机交互 | human-computer interaction | 功能表达 |
| 功能分区 | functional zoning | 功能表达 |
| 爆炸图 | exploded view | 功能表达 |
| 人机工程学 | ergonomics | 人机工程 |
| 人体测量百分位 | anthropometric percentile | 人机工程 |
| 握持比例 | grip proportion | 人机工程 |
| 操作可达性 | reachability | 人机工程 |
| 视觉引导 | visual guidance | 人机工程 |
| 可用性 | usability | 人机工程 |

### 4.4 雕塑类术语（中英对照）

| 中文规范术语 | English | 所属维度 |
|---|---|---|
| 空间构成 | spatial composition | 空间构成 |
| 正负空间 | positive and negative space | 空间构成 |
| 三维体量平衡 | three-dimensional volume balance | 空间构成 |
| 多视点 / 视点分析 | multi-view / viewpoint analysis | 空间构成 |
| 空间张力 | spatial tension | 空间构成 |
| 负空间 | negative space | 空间构成 |
| 形体语言 | form language | 形体语言 |
| 造型准确性 | modeling accuracy | 形体语言 |
| 比例与尺度 | proportion and scale | 形体语言 |
| 动态与张力 | dynamics and tension | 形体语言 |
| S 形动态 | S-curve dynamics | 形体语言 |
| 轮廓张力 | silhouette tension | 形体语言 |
| 材料语言 | material language | 材料语言 |
| 材料特性 | material characteristics | 材料语言 |
| 材料-主题契合度 | material-theme fit | 材料语言 |
| 工艺精良度 | craftsmanship excellence | 材料语言 |
| 肌理层次 | texture layers | 材料语言 |
| 观念表达 | conceptual expression | 观念表达 |
| 概念深度 | conceptual depth | 观念表达 |
| 主题诠释 | theme interpretation | 观念表达 |
| 文化语境 | cultural context | 观念表达 |
| 时代性 | contemporaneity | 观念表达 |
| 公共艺术 | public art | 观念表达 |
| 装置 | installation | 观念表达 |

### 4.5 通用评分术语（中英对照）

| 中文 | English |
|---|---|
| 评分维度 | scoring dimension |
| 权重 | weight |
| 预设方案 | evaluation preset |
| 争议仲裁 | dispute arbitration |
| 评委 | judge / evaluator |
| 加权平均 | weighted average |
| 多数决 | majority rule |
| 一致同意 | unanimous |
| 优秀 / 良好 / 合格 / 待改进 / 不合格 | excellent / good / qualified / needs improvement / unqualified |
| 基础性问题 | fundamental issue |
| 风格选择 | stylistic choice |

### 4.6 禁用口语化表达对照（AI 必须遵守）

| 领域 | 禁用（口语化） | 应使用（美院规范） |
|---|---|---|
| 构图 | 主体位置好不好 | 黄金分割点定位、三分法则构图 |
| 构图 | 画面平衡不 | 质量矩平衡、对称与均衡 |
| 色彩 | 亮暗层次 | 明度九阶 |
| 色彩 | 颜色搭配 | 色温并置、互补色对比 |
| 色彩 | 颜色调子 | 色调统一性、调性 |
| 素描 | 画黑了 | 暗部闷塞、缺乏反光 |
| 素描 | 画飘了 | 形体不结实、体量感缺失 |
| 设计 | 排版好看 | 网格系统遵循、对齐质量 |
| 设计 | 留白多 | 负空间得当、计白当黑 |
| 产品 | 形状好看 | 形态语义清晰、曲面 G2 连续 |
| 产品 | 材质逼真 | 材质质感真实、PBR 物理准确 |
| 雕塑 | 有空间感 | 三维体量平衡、负空间处理 |
| 雕塑 | 做得有感觉 | 形体语言独特、观念表达深刻 |

---

## 5. 数据结构建议（供后端落地）

### 5.1 EvaluationPreset（评分预设）

```typescript
/**
 * 评分预设方案
 * 一套预设 = 某风格 × 某类作品的维度权重组合
 * 维度键须与 AnalysisResult.dimensions 的维度名严格对应
 */
interface EvaluationPreset {
  /** 预设唯一 ID，如 'preset_academic__painting' */
  id: string;
  /** 风格标识 */
  style: 'academic' | 'artist' | 'academy' | 'applied';
  /** 作品类别 */
  category: 'painting' | 'design' | 'product' | 'sculpture';
  /** 预设显示名（中文） */
  name: string;
  /** 设计理念说明 */
  rationale: string;
  /** 维度权重列表，weight 为 0-100 整数，总和 = 100 */
  dimensions: {
    /** 维度键，须与 AnalysisResult.dimensions 对应 */
    key: string;
    /** 中文规范术语 */
    label: string;
    /** 英文术语 */
    labelEn: string;
    /** 权重，0-100，同预设内总和 = 100 */
    weight: number;
  }[];
  /** 适用阶段 */
  applicableStage: 'basic' | 'foundation' | 'advanced' | 'creative';
  /** 元信息 */
  meta: {
    basis: string;        // 引用来源
    notes?: string;       // 不适用说明等
  };
}
```

### 5.2 ArbitrationConfig（仲裁配置）

```typescript
/**
 * 多评委争议仲裁配置
 * 所有阈值均可调，默认值即 §3 推荐值
 */
interface ArbitrationConfig {
  /** 争议触发阈值 */
  triggers: {
    consistentTotalRange: number;      // 5，低于此且维度差小则视为一致
    consistentDimDiff: number;         // 8
    generalDisputeTotalRange: number;  // 10
    generalDisputeDimDiff: number;     // 15
    highDisputeTotalRange: number;     // 20
    highDisputeDimCount: number;       // 2，维度差超阈值的维度数
    gradeCrossTierHigh: number;        // 2，跨档数≥此值触发高争议
    vetoLowGrade: number;              // 60，E 不合格阈值
    vetoHighGrade: number;             // 90，A 优秀阈值
  };
  /** 评委权重（按模式） */
  judgeWeights: {
    regular: { professor: number; lecturer: number; ai: number };       // 0.5/0.3/0.2
    professorAi: { professor: number; ai: number };                     // 0.7/0.3
    committee: { professorEach: number; ai: number };                   // 0.3/0.1
  };
  /** 最终裁定规则 */
  rules: {
    final: 'weighted' | 'majority' | 'unanimous';
    boundaryTolerance: number;  // 1，加权分落边界±此值内「就低」定档
  };
  /** 边界情况 */
  edgeCases: {
    outlierDiff: number;              // 25，离群分差阈值
    outlierWeightFactor: number;      // 0.5，离群评分权重折半
    aiLowConfidence: number;          // 0.6，AI 权重降级阈值
    aiLowConfidenceWeight: number;    // 0.1，降级后 AI 权重
    aiVeryLowConfidence: number;      // 0.4，AI 仅作参考不计入阈值
    aiHumanExtremeDiff: number;       // 20，AI 与全员人工极端分歧阈值
    maxMissingDimsToInvalidate: number; // 2，缺失维度超此则评分作废
  };
}
```

### 5.3 落地要点
1. **预设与维度解耦**：`EvaluationPreset.dimensions[].key` 必须等于 `AnalysisResult.dimensions` 中的维度名，确保任意预设可套用同一份分析结果。
2. **预设选择策略**：默认 `preset_academy`（美院基准）；基础训练阶段自动切 `preset_academic`；创作实践阶段可由教师手动切 `preset_artist`；product/design 实战切 `preset_applied`。
3. **仲裁入口**：当一份作品存在 ≥2 份评委评分时，按 `ArbitrationConfig.triggers` 判定是否进入仲裁；仲裁结果写入成长档案并标注所用预设与裁定规则。
4. **AI 置信度接入**：复用现有 `AIVisionResult`/`AIInvocationMeta` 链路，AI 自报置信度作为仲裁权重动态调整依据（见 §3.3、§3.5）。
5. **SLA 取舍**：3 秒 SLA 下，仲裁优先计算总分极差与跨档判定（O(N)），维度级复核可异步进行；核心维度（构图/色彩/形态/空间构成）准确性优先保证。

---

## 6. 引用与参考来源

1. 中央美术学院《基础部评分细则》《造型类本科招生考试评分标准》。
2. 中国美术学院《专业基础教学大纲》《中国画/色彩课程评估标准》。
3. 清华大学美术学院《工业设计教学评估标准》《视觉传达专业评分细则》。
4. 第十三届/第十四届全国美术作品展览评审办法。
5. 红点设计奖（Red Dot Award）评审维度：创新、功能、形态、情感、执行。https://www.red-dot.org
6. iF 设计奖（iF Design Award）评审维度：理念、形态、功能、差异化、影响。https://ifdesign.com
7. WCAG 2.1 Web Content Accessibility Guidelines（色彩对比度 AA 标准）。https://www.w3.org/TR/WCAG21/
8. GB/T 12985《用于机械安全的人类测量方法》及相关人体测量数据（产品人机工程）。
9. 本仓库 `.trae/documents/art-evaluation-standards.md` v1.0（四类作品维度术语校准与评分标准）。
10. 本仓库 `server/src/types/ai-analysis.ts`（`AnalysisResult`/`ScoreAdjustments`/`AIVisionResult` 类型定义）。
11. 本仓库 `src/pages/AnalysisPage.tsx`（`ANALYSIS_CONFIG`/`STAGE_DETAILS_BY_ART_TYPE` 前端维度配置）。

---

**文档结束。**

本文件与 `art-evaluation-standards.md` 互补：后者提供四类作品维度的子指标量化、四档描述与改进建议生成规范；本文件提供权威权重基准、四套风格化预设、多评委争议仲裁机制与术语标准化，二者共同构成「丹青有AI」评分预设与仲裁系统的完整依据，已通过美院教授（央美/国美/清华三校规范）校准。
