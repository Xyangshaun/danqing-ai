# 真源文档系统（True Source Task System）

一套面向多任务并行开发场景的「单一信息源」文档系统。所有任务的状态、步骤、资源占用、变更历史均在此处登记与追踪，确保多任务并行执行时的有序性、可追溯性与资源协调性。

---

## 一、设计目标

| 目标 | 实现方式 |
| --- | --- |
| 多任务并行管理 | 每个任务独立目录 + 统一登记表 |
| 状态实时可追踪 | 任务状态徽章 + 进度字段 + 变更日志 |
| 资源冲突可检测 | 资源冲突矩阵 + 检测规则 |
| 文档版本可追溯 | Git 提交规范 + 任务级 changelog |
| 流程规范可复用 | 模板 + 执行流程规范 + 使用说明 |

## 二、目录结构

```
.trae/true-source/
├── README.md                       # 本文件：系统总览与使用说明
├── usage-guide.md                  # 完整使用说明（入门到进阶）
├── templates/                      # 可复用模板（复制即用,不可直接填实际数据）
│   ├── task-template.md            # 单任务标准模板
│   ├── task-registry.md            # 任务总览登记表模板
│   ├── conflict-matrix.md          # 资源冲突矩阵模板
│   └── changelog-template.md       # 变更历史模板
├── registry/                       # 实例文件（可直接维护,项目实际数据）
│   ├── active-tasks.md             # ★ 当前活动任务总览（实时维护）
│   ├── completed-archive.md        # 已完成 / 归档任务（含历史里程碑）
│   └── conflict-matrix.md          # ★ 资源冲突矩阵实例（实时维护）
├── process/                        # 执行流程规范（只读,定义规则）
│   ├── execution-spec.md           # 执行流程规范（创建→注册→执行→归档）
│   ├── conflict-detection.md       # 资源冲突检测规则与提示机制
│   ├── progress-visualization.md   # 进度可视化规范
│   └── version-control.md          # 版本控制规范（Git 提交规范 + 追溯机制）
└── tasks/                          # 实际任务工作目录（一任务一目录）
    ├── _EXAMPLE/                   # 示例任务（参考用,TASK-0001 VPS部署）
    │   ├── README.md               # 任务说明
    │   ├── plan.md                 # 执行步骤与进度
    │   ├── resources.md            # 资源需求与占用声明
    │   └── changelog.md            # 任务级变更历史
    └── TASK-XXXX-<slug>/           # 真实任务目录
        ├── README.md               # 任务说明（基于 task-template.md）
        ├── plan.md                 # 执行步骤与进度
        ├── resources.md            # 资源需求与占用声明
        └── changelog.md            # 任务级变更历史
```

### 文件状态分类

| 类别 | 目录 | 用途 | 修改规则 |
|------|------|------|---------|
| 模板 | `templates/` | 复制即用,不可填实际数据 | 偶尔升级,走版本控制流程 |
| 实例 | `registry/` | 项目实际数据,实时维护 | 每次任务变更同步更新 |
| 规范 | `process/` | 流程规则,只读 | 极少修改,系统级升级时 |
| 任务 | `tasks/TASK-XXXX-*/` | 单任务工作区 | 任务执行期间持续更新 |
| 说明 | `README.md` / `usage-guide.md` | 系统入口与使用指南 | 按需更新 |

## 三、核心概念

- **任务（Task）**：一个独立可执行的开发单元，拥有唯一 ID（`TASK-XXXX`）、明确目标、负责人和时间节点。
- **登记表（Registry）**：所有任务的单一信息源。`registry/active-tasks.md` 是当前活动任务的唯一真实来源。
- **冲突矩阵（Conflict Matrix）**：以「任务 × 资源」二维表形式声明每个任务对资源的占用类型（读 R / 写 W / 独占 X），用于检测并行任务间的资源冲突。
- **变更历史（Changelog）**：每个任务维护独立的 changelog，记录执行过程中所有状态、计划、资源的变更。

## 四、快速开始

> 完整使用说明请参考 [usage-guide.md](usage-guide.md),以下为核心操作摘要。

### 4.1 创建新任务

1. 复制 `templates/task-template.md` 到 `tasks/TASK-XXXX-<slug>/README.md`
2. 复制 `templates/changelog-template.md` 到同目录 `changelog.md`
3. 在任务目录创建 `plan.md`、`resources.md`（参考 [tasks/_EXAMPLE/](tasks/_EXAMPLE/README.md)）
4. 填写任务元信息（ID、标题、负责人、时间节点、目标）
5. 在 `registry/active-tasks.md` 新增一行登记
6. 在 `registry/conflict-matrix.md` 中声明资源占用（R/W/X）
7. 执行冲突检测（参考 [process/conflict-detection.md](process/conflict-detection.md)）
8. Git 提交：`feat(task): 新增 TASK-XXXX <标题>`

### 4.2 更新任务进度

1. 修改 `tasks/TASK-XXXX-<slug>/plan.md` 中步骤状态
2. 同步更新 `registry/active-tasks.md` 的「进度」与「状态」字段
3. 在 `tasks/TASK-XXXX-<slug>/changelog.md` 记录变更
4. Git 提交：`docs(task): TASK-XXXX 进度更新至 <百分比>`

### 4.3 完成任务

1. 在 `plan.md` 标记所有步骤为 `[x]`
2. 在 `changelog.md` 添加「任务完成」记录
3. 将 `registry/active-tasks.md` 中对应行移动到 `registry/completed-archive.md`
4. Git 提交：`chore(task): TASK-XXXX 完成归档`

### 4.4 查看当前状态

- **当前活动任务**：[registry/active-tasks.md](registry/active-tasks.md)
- **资源冲突情况**：[registry/conflict-matrix.md](registry/conflict-matrix.md)
- **历史完成情况**：[registry/completed-archive.md](registry/completed-archive.md)
- **示例参考**：[tasks/_EXAMPLE/](tasks/_EXAMPLE/README.md)

## 五、状态徽章约定

| 状态 | 徽章 | 含义 |
| --- | --- | --- |
| 待启动 | ⚪ `PENDING` | 已创建未开始 |
| 进行中 | 🔵 `IN_PROGRESS` | 正在执行 |
| 已阻塞 | 🟡 `BLOCKED` | 等待依赖或资源 |
| 待验收 | 🟣 `REVIEW` | 执行完成等待验收 |
| 已完成 | 🟢 `DONE` | 验收通过并归档 |
| 已取消 | ⚫ `CANCELLED` | 终止执行 |

## 六、优先级约定

| 优先级 | 标记 | 处理原则 |
| --- | --- | --- |
| 紧急 | P0 | 阻断其他任务，立即处理 |
| 高 | P1 | 当前迭代必须完成 |
| 中 | P2 | 计划内任务，按节奏推进 |
| 低 | P3 | 可延后，有空闲时处理 |

## 七、版本控制

- 所有任务文档通过 Git 进行版本控制（参考 `process/version-control.md`）
- 每次状态或内容变更必须产生一次 Git 提交
- 提交信息遵循 Conventional Commits 规范，并包含任务 ID
- 任务级 changelog 记录细粒度变更，Git log 记录提交级变更

## 八、相关文档

### 流程规范(process/)

- 执行流程规范：[process/execution-spec.md](process/execution-spec.md)
- 冲突检测规则：[process/conflict-detection.md](process/conflict-detection.md)
- 进度可视化规范：[process/progress-visualization.md](process/progress-visualization.md)
- 版本控制规范：[process/version-control.md](process/version-control.md)

### 实例文件(registry/)

- 活动任务总览：[registry/active-tasks.md](registry/active-tasks.md)
- 已完成任务归档：[registry/completed-archive.md](registry/completed-archive.md)
- 资源冲突矩阵：[registry/conflict-matrix.md](registry/conflict-matrix.md)

### 模板(templates/)

- 单任务模板：[templates/task-template.md](templates/task-template.md)
- 任务登记表模板：[templates/task-registry.md](templates/task-registry.md)
- 冲突矩阵模板：[templates/conflict-matrix.md](templates/conflict-matrix.md)
- 变更历史模板：[templates/changelog-template.md](templates/changelog-template.md)

### 参考资源

- 完整使用说明：[usage-guide.md](usage-guide.md)
- 示例任务：[tasks/_EXAMPLE/](tasks/_EXAMPLE/README.md)
- 来源上下文(2026-08-04)：[../documents/context-log-2026-08-04.md](../documents/context-log-2026-08-04.md)

---

## 九、当前实例状态(2026-08-04 初始化)

> 基于项目 2026-08-04 上下文日志初始化,反映复赛冲刺阶段(08-04 ~ 08-09)的任务状态。

| 指标 | 值 |
|------|-----|
| 活动任务数 | 3 |
| 活动任务 IDs | TASK-0001 / TASK-0002 / TASK-0003 |
| 当前冲突数 | 0(1 对串行依赖,非冲突) |
| 当前阶段 | 复赛冲刺(08-04 ~ 08-09) |
| 系统版本 | v1.0.0 |

**当前任务概览**:

| ID | 标题 | 优先级 | 状态 |
|----|------|--------|------|
| TASK-0001 | VPS 部署架构落地 | P0 | 🔵 IN_PROGRESS |
| TASK-0002 | 飞书 OAuth 回调 URL 更新 | P0 | ⚪ PENDING |
| TASK-0003 | QA 最终报告创建 | P1 | ⚪ PENDING |

详细状态见 [registry/active-tasks.md](registry/active-tasks.md)。
