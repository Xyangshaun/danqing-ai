# 控制台快捷入口 · 自定义添加预设 — 检查清单

> 关联：`spec.md` / `tasks.md` · 日期：2026-08-08

## 需求符合性

- [x] 快捷入口面板顶部新增"我的快捷入口区"（横向 pill，显示 n/8 计数）
- [x] 面板右上角"+"按钮打开添加弹层
- [x] 弹层分"情绪画布 / 灵感嫁接"两 Tab，复选框勾选=添加、取消=移除
- [x] 已固定的预设默认勾选
- [x] 上限 8：达到后其余置灰 + 提示"已达上限 8 个"，不出现第 9 项
- [x] 移除 1 个后可再添加
- [x] 预设删除后对应快捷入口自动消失
- [x] 挂载时 `pruneInvalidShortcuts` 同步清理 localStorage 失效条目
- [x] 添加成功 toast 反馈（无 alert/confirm）

## 技术符合性

- [x] localStorage 存储（`danqing-shortcuts`），上限 `MAX_SHORTCUTS=8` 导出供 UI 使用
- [x] 快捷入口为引用（kind+presetId），非拷贝
- [x] 渲染用最新预设 name/accent 覆盖
- [x] 图标用 lucide-react，未新增 npm 依赖
- [x] 未硬编码 localhost
- [x] 未改后端/数据库/移动端
- [x] 未破坏"我的预设方案"、固定创作类型、待办提醒

## 验证记录

- [x] `npx tsc --noEmit`：0 错误
- [x] `npm run build`：成功（2330 modules）
- [x] vitest `shortcutStore.test.ts`：10/10 通过
- [x] 浏览器端（Playwright，`?demo=1` + localStorage 注入）：43 项断言 42 PASS / 1 环境性 FAIL（点击跳转 demo 模式限制，href 校验正确，非产品缺陷）
