# 交互骨架优化与品牌升级 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: Logo品牌升级设计与实现
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 设计并实现新的英文/DQ缩写Logo，融入算法艺术/生成美学元素
  - Logo包含图形标识 + 英文品牌名（桌面端完整显示，移动端缩写）
  - 实现悬停微交互动画
  - 更新Header组件中的Logo区域
- **Acceptance Criteria Addressed**: AC-1, AC-8
- **Test Requirements**:
  - `programmatic` TR-1.1: Logo组件在桌面端（≥768px）显示完整英文名 + 图形，移动端显示缩写 + 图形
  - `human-judgement` TR-1.2: Logo设计具有生成艺术/算法美学特征，与整体中式美学风格协调
  - `human-judgement` TR-1.3: 悬停时有精致微动画（如轻微旋转、光晕、渐变流动等），不过度
- **Notes**: 图形标识可考虑使用CSS/SVG生成的算法几何形态，参考"墨滴扩散"或"笔触生成"概念

## [x] Task 2: 顶部栏（Header）交互增强
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 通知图标：点击展开通知列表面板（含模拟通知数据）
  - 用户头像：点击展开快速操作菜单（个人中心/设置/退出）
  - 在线状态指示器：点击显示模式切换菜单（本地/云端/自动）
  - 面包屑导航：增加各层级点击回退能力
  - 搜索框：优化hover/focus视觉反馈
- **Acceptance Criteria Addressed**: AC-2, AC-7, AC-8
- **Test Requirements**:
  - `programmatic` TR-2.1: 点击通知图标展开通知面板，再次点击或点击外部区域关闭
  - `programmatic` TR-2.2: 点击用户头像展开用户菜单，包含至少3个操作项
  - `programmatic` TR-2.3: 点击在线状态显示模式切换菜单
  - `human-judgement` TR-2.4: 所有下拉面板视觉风格一致（圆角、阴影、背景色），与设计系统匹配
  - `human-judgement` TR-2.5: 下拉面板出现/消失有平滑过渡动画
- **Notes**: 使用useRef + useEffect实现点击外部关闭，避免引入新依赖

## [x] Task 3: 侧边栏导航优先级优化
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 重新组织导航分组：创作工具（AI诊断/素材库/风格库/灵感嫁接/情绪画布）、数据洞察（历史记录/成长曲线）、系统（设置）
  - AI诊断入口提升视觉权重（更大点击区域、更醒目颜色）
  - 增加"最近访问"区域（展开时显示最近3个访问页面）
  - 创作类型快速入口增加当前选中态指示
  - 优化折叠/展开状态的过渡动画
- **Acceptance Criteria Addressed**: AC-2, AC-8
- **Test Requirements**:
  - `programmatic` TR-3.1: 导航分为3组（创作工具/数据洞察/系统），每组有标题
  - `programmatic` TR-3.2: AI诊断项有区别于其他项的视觉样式（如背景色、边框、图标大小）
  - `human-judgement` TR-3.3: "最近访问"区域在侧栏展开时可见，显示最近访问的页面
  - `human-judgement` TR-3.4: 整体导航层级清晰，视觉优先级合理
- **Notes**: 最近访问数据可存储在LocalStorage或仅使用内存状态

## [x] Task 4: 工作台（HomePage）信息架构优化
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 顶部增加"快速开始"卡片组（4个核心功能一键进入）
  - 数据概览卡片增加点击跳转能力（点击跳转到历史记录并带筛选参数）
  - 最近作品卡片hover时显示快捷操作（查看详情/再次诊断）
  - 右侧栏优化：合并每日艺语 + 待办提醒，减少视觉噪音
  - 整体布局密度调整，提升信息传达效率
- **Acceptance Criteria Addressed**: AC-3, AC-8
- **Test Requirements**:
  - `programmatic` TR-4.1: 点击"待改进"数据卡片跳转到历史记录页，URL携带筛选参数（如?filter=pending）
  - `programmatic` TR-4.2: 点击"累计诊断"数据卡片跳转到历史记录页
  - `programmatic` TR-4.3: 快速开始卡片组有4个功能入口，点击正常跳转
  - `human-judgement` TR-4.4: 最近作品卡片hover时有操作按钮出现，动效流畅
  - `human-judgement` TR-4.5: 整体信息密度合理，关键数据一目了然
- **Notes**: 历史记录页的筛选功能需配合Task 5一起实现

## [x] Task 5: 历史记录页增强与参数复用
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - 历史记录列表页增加筛选功能（按艺术类型、分数区间、日期范围）
  - 支持从URL参数读取筛选条件并自动应用
  - 详情弹窗增加"用相同参数重新诊断"按钮
  - 点击该按钮跳转到AI诊断页并预填艺术类型
  - 列表项增加快捷操作菜单
- **Acceptance Criteria Addressed**: AC-4, AC-8
- **Test Requirements**:
  - `programmatic` TR-5.1: URL携带?filter=pending时自动筛选出分数<70的记录
  - `programmatic` TR-5.2: URL携带?type=painting时自动筛选绘画类作品
  - `programmatic` TR-5.3: 详情页"重新诊断"按钮跳转到/analyze并预填artType
  - `human-judgement` TR-5.4: 筛选交互清晰易用，结果更新及时
- **Notes**: 图片预填因涉及文件上传限制，本期仅预填艺术类型

## [x] Task 6: 命令面板（Command Palette）增强
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 增加搜索结果分类：功能 / 最近访问 / 历史作品 / 操作
  - 支持搜索历史记录中的作品（标题、类型、日期）
  - 支持快速操作：清除缓存、切换分析模式、切换主题
  - 增加分类标签切换（全部/功能/作品/操作）
  - 优化搜索结果展示样式
- **Acceptance Criteria Addressed**: AC-5, AC-8
- **Test Requirements**:
  - `programmatic` TR-6.1: 搜索结果按类别分组显示，每组有类别标题
  - `programmatic` TR-6.2: 输入作品相关关键词可搜索到历史记录
  - `programmatic` TR-6.3: 分类标签可点击切换，筛选对应类型结果
  - `human-judgement` TR-6.4: 命令面板视觉层次清晰，操作流畅
- **Notes**: 历史作品搜索读取LocalStorage中的历史记录数据

## [x] Task 7: 快捷键体系完善
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 新增N键：跳转到AI诊断页面
  - 新增B键：切换侧栏折叠/展开
  - 新增/键：聚焦顶部搜索框（打开命令面板）
  - 设置页快捷键列表完善（展示所有快捷键）
  - App.tsx中统一管理快捷键逻辑
- **Acceptance Criteria Addressed**: AC-2, AC-6, AC-8
- **Test Requirements**:
  - `programmatic` TR-7.1: 非输入框聚焦状态下按N键跳转到/analyze
  - `programmatic` TR-7.2: 按B键切换侧栏折叠状态
  - `programmatic` TR-7.3: 按/键打开命令面板并聚焦搜索框
  - `human-judgement` TR-7.4: 设置页快捷键列表完整、清晰、易查阅
- **Notes**: 所有快捷键需排除input/textarea/contenteditable聚焦状态

## [x] Task 8: 功能间联动（素材/风格/嫁接/情绪）
- **Priority**: low
- **Depends On**: None
- **Description**:
  - 素材库作品卡片增加"用于灵感嫁接"快捷操作（点击跳转到嫁接页并预填作品1）
  - 风格库增加"用于灵感嫁接"快捷入口
  - 灵感嫁接结果页增加"保存到素材库"入口（保存到LocalStorage）
  - 情绪画布结果增加"应用到风格调色板"选项
  - 成长曲线数据点点击跳转到历史记录（按日期筛选）
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `programmatic` TR-8.1: 素材库点击"用于嫁接"跳转到/fuse并携带作品信息参数
  - `human-judgement` TR-8.2: 各页面之间的联动入口位置合理，不干扰主要操作
  - `human-judgement` TR-8.3: 联动操作有明确的状态反馈（Toast通知）
- **Notes**: 联动参数通过URL query传递，目标页面读取后自动填充
