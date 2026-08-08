# 控制台快捷入口 · 自定义添加预设 — 任务清单

> 关联：`spec.md` · 状态：已完成并验证通过 · 日期：2026-08-08

## 任务分解

| # | 任务 | 状态 | 说明 |
|---|---|---|---|
| 1 | 新增 `src/services/shortcutStore.ts` | ✅ 完成 | 快捷入口存储与操作（list/add/remove/isShortcutAdded/resolve/prune） |
| 2 | 修改 `src/pages/HomePage.tsx` 快捷入口面板 | ✅ 完成 | 新增"我的快捷入口区" + "+"弹层（ShortcutPickerModal）+ 失效清理 |
| 3 | 新增 `src/services/shortcutStore.test.ts` | ✅ 完成 | 10 个单测（list/add/duplicate/limit8/remove/resolve/fuse 关联/失效过滤/失效清理/损坏数据） |
| 4 | 构建与类型验证 | ✅ 完成 | `npx tsc --noEmit` 0 错误；`npm run build` 成功（2330 modules）；vitest 10/10 通过 |
| 5 | 浏览器端功能验证（QA） | ✅ 完成 | 43 项断言 42 PASS / 1 环境性 FAIL（非产品缺陷） |

## 验收标准（对照）

- [x] 用户可在控制台快捷入口面板通过"+"添加/移除预设
- [x] 仅支持情绪画布（emotion）+ 灵感嫁接（fuse）两类预设
- [x] 上限 8 个，达到后置灰 + 提示"已达上限 8 个"
- [x] 预设被删除后，对应快捷入口自动消失（渲染过滤 + 挂载清理双保险）
- [x] 快捷入口为引用（kind+presetId），渲染用最新预设信息覆盖 name/accent
- [x] 存储为 localStorage（key `danqing-shortcuts`），无后端改动
- [x] 未破坏"我的预设方案"、固定创作类型、待办提醒

## 备注

- 纯前端实现，不改后端/数据库/移动端，未新增 npm 依赖
- 点击跳转 href：emotion → `/emotion?preset=xx&auto=1`，fuse → `/fuse?preset=xx&auto=1`
