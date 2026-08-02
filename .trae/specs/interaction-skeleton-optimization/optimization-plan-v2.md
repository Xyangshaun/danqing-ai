# 交互骨架优化 V2 - 深度优化执行计划

> **生成时间**: 2026-08-02 23:15 (GMT+8)
> **前置状态**: V1 交互骨架优化 8 项任务已实现(Logo/Header/Sidebar/Workbench/History/CommandPalette/Shortcuts/Linkage)
> **本轮目标**: 在 V1 基础上进行深度优化、填补空白、提升性能与代码质量
> **执行模式**: 先审阅计划 → 多子agent并行执行

---

## 一、V1 实现审计结果

### 已完成(代码验证通过)
| 模块 | 文件 | 状态 |
|------|------|------|
| Logo 品牌升级 | `src/components/LogoMark.tsx` | ✅ DQ AI 朱印·凝眸设计 |
| Header 交互增强 | `src/components/Header.tsx` | ✅ 通知面板/用户菜单/状态切换/面包屑 |
| 侧边栏优化 | `src/components/Sidebar.tsx` | ✅ 3组导航/AI诊断突出/最近访问 |
| 工作台信息架构 | `src/pages/HomePage.tsx` | ✅ 快速开始/数据卡片跳转/hover操作 |
| 历史记录增强 | `src/pages/HistoryPage.tsx` | ✅ 筛选/URL参数/重新诊断 |
| 命令面板增强 | `src/components/Header.tsx` | ✅ 分类搜索/历史作品/快速操作 |
| 快捷键体系 | `src/App.tsx` | ✅ N/B//1-7/0/Esc/Ctrl+Z/R |
| 功能联动 | 多页面 | ✅ 素材→嫁接/嫁接→素材/情绪→风格/成长→历史 |

### V1 遗留的 Open Questions(spec 未解决)
1. ❓ 工作台"创作草稿/未完成任务"概念 — 未实现
2. ❓ 通知系统真实数据接入 — 当前为 mock 数据
3. ❓ 快捷键自定义功能 — 未实现

---

## 二、V2 优化任务分解(5 个任务包)

### 任务包 A: 工作台"创作草稿"与未完成任务(前端)
- **优先级**: high
- **依赖**: 无
- **目标**: 实现工作台"继续创作"区域,显示未完成的诊断任务
- **具体需求**:
  - 新增 `src/services/draft-service.ts` — 草稿 CRUD(LocalStorage)
  - `HomePage.tsx` 增加"继续创作"卡片区域(显示草稿列表)
  - `AnalysisPage.tsx` 在上传图片后自动创建草稿(分析完成或取消后删除)
  - 草稿卡片支持"继续"/"删除"操作
  - 草稿数据结构: `{ id, artType, imageUrl, createdAt, step }`
- **验收标准**:
  - 上传图片后刷新页面,草稿仍存在
  - 分析完成后草稿自动清除
  - 工作台显示"继续创作"区域(有草稿时)
- **预估**: 中等

### 任务包 B: 通知系统真实数据接入(前后端)
- **优先级**: medium
- **依赖**: 无
- **目标**: 将 Header 通知面板从 mock 数据改为真实 API
- **具体需求**:
  - 后端新增 `GET /api/v1/notifications` 接口(读取用户通知)
  - 后端新增 `PATCH /api/v1/notifications/:id/read` 标记已读
  - Prisma schema 新增 `Notification` 模型(如不存在)
  - 前端 `Header.tsx` 通知面板改为 API 调用
  - 通知触发点:分析完成、成长报告生成、订阅到期提醒
  - 未读数量角标实时显示
- **验收标准**:
  - 通知面板显示真实通知数据
  - 点击通知可标记已读
  - 未读数量角标正确
- **预估**: 较大(涉及数据库迁移)

### 任务包 C: 全局交互体验打磨(前端)
- **优先级**: high
- **依赖**: 无
- **目标**: 统一完善 Toast/骨架屏/空状态/错误边界体验
- **具体需求**:
  - **Toast 系统**: 统一 Toast 动画(入场/退场),增加进度条(自动关闭倒计时)
  - **骨架屏**: 所有懒加载页面统一使用 `PageSkeleton`,增加内容骨架(不只是 Loading)
  - **空状态**: 统一 `EmptyState` 组件使用,所有列表页空状态有插画+操作引导
  - **错误边界**: `ErrorBoundary` 增加重试按钮+错误上报(控制台)
  - **页面切换过渡**: 路由切换增加淡入动画(300ms ease-out)
  - **加载状态统一**: 所有按钮加载状态使用 Spinner + 文字
- **验收标准**:
  - 所有页面切换有平滑过渡
  - 空状态有引导操作
  - Toast 有进度条与统一动画
  - 错误边界有重试功能
- **预估**: 中等

### 任务包 D: 性能优化(前端)
- **优先级**: high
- **依赖**: 无
- **目标**: 首屏加载 ≤1.5s,路由切换 ≤300ms
- **具体需求**:
  - **Bundle 分析**: `vite build --report` 分析各 chunk 大小
  - **图片懒加载**: 所有 `<img>` 使用 `loading="lazy"`,素材库/历史记录列表图片懒加载
  - **虚拟列表**: 历史记录列表(>50条)使用虚拟滚动
  - **React.memo 优化**: 纯展示组件包裹 `React.memo` 减少重渲染
  - **useMemo/useCallback**: expensive 计算与回调优化
  - **预加载策略**: 鼠标 hover 侧栏导航时预加载对应 chunk
  - **CSS 优化**: 检查未使用的 Tailwind 类,提取关键 CSS 内联
- **验收标准**:
  - 首屏 LCP ≤1.5s
  - 路由切换 FCP ≤300ms
  - Bundle 主 chunk ≤300KB(gzipped)
  - Lighthouse Performance ≥85
- **预估**: 中等

### 任务包 E: 前端测试覆盖与代码质量(前端)
- **优先级**: medium
- **依赖**: 任务包 C 完成
- **目标**: 核心组件测试覆盖 ≥70%,TypeScript strict 零错误
- **具体需求**:
  - **组件测试**: Header/Sidebar/LogoMark/ToastProvider/ErrorBoundary 单元测试
  - **页面测试**: HomePage/HistoryPage 关键交互测试(跳转/筛选/草稿)
  - **集成测试**: 命令面板搜索/快捷键触发/通知面板开关
  - **TypeScript 修复**: 消除所有 `any` 类型,strict 模式零错误
  - **无障碍检查**: 所有交互元素有 `aria-label`,键盘可达
  - **ESLint 修复**: 消除所有 warning
- **验收标准**:
  - `vitest run` 全部通过
  - 测试覆盖率 ≥70%
  - `tsc --noEmit` 零错误
  - ESLint 零 warning
- **预估**: 中等

---

## 三、执行计划与时间节点

### 阶段 1: 计划审阅(当前)
- 输出本计划文档供用户审阅
- 用户确认后进入阶段 2

### 阶段 2: 并行执行(多子agent)

| 子agent | 任务包 | 可并行 | 预估复杂度 |
|---------|--------|--------|-----------|
| frontend-app #1 | 任务包 A(草稿系统) | ✅ | 中等 |
| frontend-app #2 | 任务包 C(交互打磨) | ✅ | 中等 |
| frontend-app #3 | 任务包 D(性能优化) | ✅ | 中等 |
| backend-service | 任务包 B(通知API) | ✅ | 较大 |
| — | 任务包 E(测试覆盖) | ❌ 依赖 C | 中等 |

**并行策略**: A/B/C/D 四个任务包并行执行,E 在 C 完成后启动

### 阶段 3: 集成测试与修复
- 合并所有子agent产出
- 运行全量测试(前端 vitest + 后端 vitest)
- 修复集成问题
- 浏览器 E2E 验证

### 阶段 4: 部署准备
- 代码提交 GitHub
- 生产部署(经用户确认)
- 部署后验证

---

## 四、技术约束

1. **不改变底层架构**: 技术栈/目录结构/数据库核心表不变
2. **前后端类型同步**: `api-contract.ts` 保持一致
3. **3秒SLA**: AI 分析相关不影响
4. **多租户隔离**: 通知系统必须 tenant_id 隔离
5. **无新第三方依赖**: 使用现有依赖实现
6. **Vite base: '/'**: 保持绝对路径
7. **LocalStorage 方案**: 草稿系统使用 LocalStorage(不新增表)
8. **通知系统除外**: 任务包 B 需要新增 Notification 表(经评估为非核心架构变更)

---

## 五、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 通知系统DB迁移失败 | 中 | 先备份,迁移可回滚 |
| 性能优化引入回归 | 低 | 逐步优化,每步测试 |
| 草稿系统LocalStorage冲突 | 低 | 使用独立 key 前缀 `dq_draft_` |
| 多agent并行冲突 | 中 | 明确文件边界,避免同时修改同一文件 |

---

## 六、回滚方案

- **前端**: `git reset --hard af9ccac`(当前生产版本)
- **后端**: `git reset --hard af9ccac` + `npx prisma migrate reset`(如通知表迁移失败)
- **数据库**: 部署前 `pg_dump` 备份

---

**等待用户审阅确认后启动执行。**
