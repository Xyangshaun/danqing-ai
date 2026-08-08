# 控制台快捷入口 · 自定义添加预设

> 版本：v1 · 状态：已实现并验证通过 · 日期：2026-08-08
> 功能模块：控制台（React Web 前端）
> 实现与验证记录：见同目录 `tasks.md` / `checklist.md`

## 1. 需求

用户在控制台首页（HomePage）的"快捷入口"面板中，可以把自己保存的预设（情绪画布 / 灵感嫁接）添加为快捷入口，点击直达对应创作页。

### 1.1 用户故事

- 作为学生用户，我在"情绪画布"保存了一个喜欢的配色预设，希望在控制台首页一键直达它，而不用每次进入情绪画布再选择。
- 作为学生用户，我点击快捷入口面板的"+"，勾选要固定的预设，即可将其加入面板顶部。
- 我可以在同一弹层里取消勾选来移除，无需进入创作页。

### 1.2 非目标（本期不做）

- 不做后端存储与跨设备同步（沿用现有 localStorage 预设体系）。
- 不做"固定系统页面"（历史/成长/设置）为快捷入口 —— 本期仅预设。
- 不做拖拽排序（仅按添加时间排序，后续可扩展）。
- 不改后端、不改数据库、不改移动端。

## 2. 设计决策（已与用户确认）

| 决策项 | 选择 | 理由 |
|---|---|---|
| 添加入口 | 面板"+"按钮 | 集中管理，一次看到全部可选项 |
| 快捷范围 | 仅预设（emotion + fuse） | 满足核心诉求，范围最小 |
| 存储方案 | localStorage | 与现有预设一致，无后端改动 |
| 推进方式 | 先出设计文档 | 确认后再实现 |

## 3. 现状梳理

已有两套 localStorage 预设体系（上限各 20 条）：

- `src/services/emotionPresetStore.ts` — 情绪画布预设
  - key：`danqing-emotion-presets`
  - 接口：`listEmotionPresets()` / `saveEmotionPreset()` / 删除等
  - 类型：`EmotionPreset`（含 `primaryId/secondaryId/ratio/intensity/customPalette`）
- `src/services/fusePresetStore.ts` — 灵感嫁接预设
  - key：`danqing-fuse-presets`
  - 接口：`listFuseUserPresets()` / `saveFuseUserPreset()` 等
  - 类型：`FuseUserPreset`（含 `styleId/methodId/intensityId/ratio/variations`）

`src/pages/HomePage.tsx` 的"快捷入口"面板（L694-716）当前为固定内容：
- 上半：固定 4 类创作入口（`artTypeIcons`：绘画/设计/产品设计/雕塑），写死，点击跳 `/analyze?type=xx`
- 下半：固定待办提醒（待改进作品、本周成长）

HomePage 另有"我的预设方案"区块（L377+），直接列出全部 emotion/fuse 预设，可"管理预设"跳转 `/emotion`。

> 快捷入口与"我的预设方案"的区别：
> - "我的预设方案"：自动列出全部预设，用户不可挑选，全部展示
> - "快捷入口"：用户**主动挑选固定**的少量入口（引用，不拷贝）

## 4. 数据模型

### 4.1 快捷入口存储（新增 `src/services/shortcutStore.ts`）

```ts
export type ShortcutKind = 'emotion' | 'fuse';

export interface Shortcut {
  id: string;            // 快捷入口唯一 id
  kind: ShortcutKind;    // 指向哪类预设
  presetId: string;      // 指向 emotion/fuse 预设 id
  name: string;          // 冗余显示名（预设改名时，渲染用最新预设名覆盖）
  accent: string;        // 颜色（从关联预设取）
  createdAt: number;
}

// localStorage key
const STORAGE_KEY = 'danqing-shortcuts';
const MAX_SHORTCUTS = 8;   // 上限，超出提示
```

关键点：快捷入口是**引用**（存 `kind + presetId`），不是拷贝。预设改名/改参数，快捷入口渲染时用最新预设信息，避免数据不同步。

### 4.2 接口设计

```ts
listShortcuts(): Shortcut[]
addShortcut(kind, presetId): Shortcut | { error: 'limit' }   // 返回结果，超限给出标记
removeShortcut(id): void
isShortcutAdded(kind, presetId): boolean
// 渲染辅助：读取快捷入口并关联最新预设信息
resolveShortcuts(): ResolvedShortcut[]   // 过滤已失效预设 + 用最新 name/accent 覆盖
```

## 5. UI 交互设计

### 5.1 面板结构（改 `src/pages/HomePage.tsx`）

"快捷入口"面板改为三部分，从上到下：
1. **我的快捷入口区（新增）**：横向展示用户固定的快捷入口（图标+名称），点击跳转
   - 右上角"+"按钮 → 打开添加弹层
   - 为空时隐藏此区（或显示一行轻提示"点击 + 固定常用预设"）
2. **创作类型区（保留现有）**：固定 4 类创作入口，不变
3. **待办提醒区（保留现有）**：不变

### 5.2 添加快捷入口弹层

- 打开方式：快捷入口区右上角"+"按钮
- 内容：Tab 或分组展示两类预设（情绪画布 / 灵感嫁接）
  - 每项：名称 + 摘要 + 复选框（勾选=固定，取消=移除）
  - 已固定的预设默认勾选
  - 空态：无可用预设时提示"先去创作页保存一个预设"
- 提交：点击"完成"统一应用（或即时应用）
- 达到上限 8 个时，其余预设置灰 + 提示"已达上限"

### 5.3 点击行为

- emotion 快捷入口 → `/emotion?preset=<presetId>&auto=1`
- fuse 快捷入口 → `/fuse?preset=<presetId>&auto=1`

（与 HomePage "我的预设方案"区块现有跳转一致）

## 6. 状态管理与生命周期

- 渲染时：`listShortcuts()` + `listEmotionPresets()`/`listFuseUserPresets()` 关联
- **失效处理**：预设被删除后，`resolveShortcuts()` 过滤掉 `presetId` 不在 store 中的快捷入口，并在 HomePage 挂载时静默清理（`removeShortcut`）
- 纯前端，无 loading 状态（localStorage 同步读取）

## 7. 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/services/shortcutStore.ts` | 新增 | 快捷入口存储与操作 |
| `src/pages/HomePage.tsx` | 修改 | 面板改造 + "+"弹层 + 跳转 |
| `src/components/ShortcutPicker.tsx` | 新增（可选） | 添加弹层组件（可内联到 HomePage） |
| 后端/数据库/移动端 | 无 | — |

## 8. 边界与约束

- 纯 localStorage，与现有预设体系一致，无后端、无 DB、无跨设备同步
- 上限 8 个，超出提示
- 渲染时用最新预设信息覆盖冗余的 name/accent
- 预设失效自动清理
- 不硬编码 localhost，不使用外部图片（快捷入口图标用现有 lucide 图标）

## 9. 验证

- `npm run build`（tsc + vite）通过
- 手动：
  1. 保存一个情绪画布预设 + 一个灵感嫁接预设
  2. 控制台面板"+"勾选 → 出现在快捷入口区 → 点击跳转正确
  3. 取消勾选 → 移除
  4. 删除预设 → 快捷入口自动消失
  5. 添加 9 个 → 提示已达上限
- 回归：固定创作入口、待办提醒、我的预设方案区块不受影响

## 10. 开放问题

- [ ] 快捷入口是否需要在"设置页"提供整体管理入口？（本期仅面板内管理）
- [ ] 是否需要对快捷入口支持排序？（本期按添加时间倒序）
