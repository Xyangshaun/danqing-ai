# 执行流程规范

> 本规范定义任务从创建到归档的完整生命周期流程，确保多任务并行执行的有序性。

---

## 一、任务生命周期

```
创建 → 注册 → 资源声明 → 冲突检测 → 并行执行 → 进度同步 → 验收 → 归档
  ↓        ↓        ↓          ↓          ↓          ↓        ↓       ↓
模板填充  登记表新增  矩阵登记   检测脚本    状态更新   changelog  DoD    归档表
```

### 状态机

```
⚪ PENDING ──开始──▶ 🔵 IN_PROGRESS ──阻塞──▶ 🟡 BLOCKED
                        │                        │
                        │                      解除
                        │                        │
                        ▼                        ▼
                    🟣 REVIEW ◀──完成────────── IN_PROGRESS
                        │
                      验收通过
                        ▼
                    🟢 DONE ──▶ 归档至 completed-archive.md

任意状态 ──取消──▶ ⚫ CANCELLED
```

## 二、阶段一：任务创建

### 2.1 触发条件

- 新需求提出并评审通过
- 现有问题需要独立任务跟踪
- 里程碑分解产生子任务

### 2.2 操作步骤

1. **分配任务 ID**
   - 格式：`TASK-XXXX`，四位数字递增
   - 查询当前最大 ID：在 `registry/active-tasks.md` 与 `registry/completed-archive.md` 中找最大值 +1

2. **创建任务目录**
   ```
   tasks/TASK-XXXX-<slug>/
   ├── README.md       (复制 templates/task-template.md)
   ├── plan.md         (新建)
   ├── resources.md    (新建)
   └── changelog.md    (复制 templates/changelog-template.md)
   ```
   - `<slug>` 为任务标题的英文短横线连接形式（如 `qa-final-report`）

3. **填写 README.md**
   - 元信息：ID、标题、状态（⚪ PENDING）、优先级、负责人、时间节点
   - 目标描述与验收标准
   - 阶段概览
   - 资源需求摘要

4. **填写 plan.md**
   - 将任务分解为可执行步骤（每步可在 1-4 小时内完成）
   - 每步标注：编号、描述、产出物、预计耗时、状态标记
   - 详见 [tasks/_EXAMPLE/plan.md](../tasks/_EXAMPLE/plan.md)

5. **填写 resources.md**
   - 列出所有将占用的资源（代码模块、文件、API、数据库表、环境变量、运行环境）
   - 标注占用类型（R/W/X）与占用时段

6. **初始化 changelog.md**
   - 添加 v0.1.0 记录：`created`

### 2.3 完成标志

- 任务目录下 4 个文件均已填写完整
- README.md 元信息无 `<>` 占位符
- plan.md 步骤数 ≥ 1
- resources.md 资源声明无遗漏

## 三、阶段二：任务注册

### 3.1 操作步骤

1. **更新活动任务登记表**
   - 在 `registry/active-tasks.md` 的「活动任务总览」表追加一行
   - 在「按状态分组」的「⚪ 待启动」分组追加条目
   - 更新顶部「活动任务数」与「整体进度」

2. **更新资源冲突矩阵**（如已创建实例 `registry/conflict-matrix.md`）
   - 为新任务添加一列
   - 在所有相关资源行填写占用标记（R/W/X）
   - 触发冲突检测

3. **更新并行执行矩阵**
   - 在 `registry/active-tasks.md` 的「并行执行矩阵」中
   - 计算新任务与所有现有活动任务的可并行性
   - 标记 ✓ 或 ✗

### 3.2 完成标志

- `registry/active-tasks.md` 中可见新任务
- 冲突矩阵已声明资源占用
- 并行执行矩阵已标记可并行性

## 四、阶段三：冲突检测

详见 [conflict-detection.md](conflict-detection.md)。

### 4.1 关键检查点

- 同一资源是否存在 ≥2 个 W 或 X 占用
- 同一文件是否被多任务同时修改
- 生产环境部署窗口是否冲突
- 数据库 schema 变更是否影响其他任务

### 4.2 冲突处理优先级

1. **优先串行化**：调整任务执行顺序，让冲突任务排队
2. **次选资源拆分**：将共享文件拆分为多个独立文件
3. **最后协调合并**：必要时合并任务，由同一负责人统一处理

## 五、阶段四：并行执行

### 5.1 启动任务

1. 修改 `tasks/TASK-XXXX-<slug>/README.md` 状态为 🔵 IN_PROGRESS
2. 在 `changelog.md` 追加 v0.2.0 `status` 记录
3. 同步 `registry/active-tasks.md` 状态徽章与分组
4. Git 提交：`docs(task): TASK-XXXX 状态变更为进行中`

### 5.2 进度更新（每次完成步骤或每日）

1. 在 `plan.md` 标记完成的步骤为 `[x]`
2. 计算进度百分比 = 已完成步骤数 / 总步骤数
3. 在 `changelog.md` 追加 `progress` 记录
4. 同步 `registry/active-tasks.md` 进度列
5. Git 提交：`docs(task): TASK-XXXX 进度更新至 XX%`

### 5.3 并行执行原则

- **独立资源任务**：可完全并行，无需协调
- **共享只读资源任务**：可并行，无需协调
- **共享写入资源任务**：必须串行，或按冲突处理方案协调
- **跨任务依赖**：下游任务必须等待上游任务完成对应步骤

### 5.4 阻塞处理

1. 修改任务状态为 🟡 BLOCKED
2. 在 `changelog.md` 追加 `blocked` 记录，说明阻塞原因与预计解除时间
3. 在 `registry/active-tasks.md` 更新状态与「已阻塞」分组
4. 阻塞解除后追加 `unblocked` 记录，状态恢复为 🔵 IN_PROGRESS

## 六、阶段五：验收与归档

### 6.1 提交验收

1. 所有 plan.md 步骤标记为 `[x]`
2. 自检验收标准（DoD）全部满足
3. 修改任务状态为 🟣 REVIEW
4. 在 `changelog.md` 追加 `status` 记录
5. 通知验收人（如适用）

### 6.2 验收通过

1. 验收人在 `changelog.md` 追加验收记录（含验收人姓名、验收时间、验收意见）
2. 修改任务状态为 🟢 DONE
3. 填写实际完成时间
4. 追加 v1.0.0 `completed` 记录

### 6.3 归档

1. 从 `registry/active-tasks.md` 移除该任务行
2. 在 `registry/completed-archive.md` 追加归档记录
3. 任务目录 `tasks/TASK-XXXX-<slug>/` 保留，不再修改
4. Git 提交：`chore(task): TASK-XXXX 完成归档`

### 6.4 验收不通过

1. 在 `changelog.md` 追加验收反馈
2. 状态回退为 🔵 IN_PROGRESS
3. 在 `plan.md` 追加返工步骤
4. 重新执行

## 七、并行执行的协调机制

### 7.1 日常同步（建议每日）

- 检查 `registry/active-tasks.md` 整体进度
- 确认阻塞任务的预计解除时间
- 验证冲突矩阵无新增未处理冲突
- 更新「本周关键时间节点」

### 7.2 跨任务协作

- 任务 A 依赖任务 B 的产出时，在 A 的 README「依赖任务」字段填写 B 的 ID
- B 完成对应步骤后，在 B 的 changelog 中标注「通知 TASK-A 可继续」
- A 收到通知后，在 changelog 中标注「依赖 TASK-B 已就绪」

### 7.3 紧急插队

- 新任务优先级为 P0 时，按以下流程插队：
  1. 立即创建任务并注册
  2. 标记为 P0 紧急
  3. 评估对现有进行中任务的影响
  4. 必要时将受影响任务标记为 🟡 BLOCKED，原因「P0 任务插队」
  5. P0 任务完成后，恢复受影响任务

## 八、流程合规性检查清单

任务创建时：

- [ ] 任务 ID 唯一且递增
- [ ] 任务目录包含 4 个必要文件
- [ ] README.md 无占位符
- [ ] 已在 active-tasks.md 登记
- [ ] 已在 conflict-matrix.md 声明资源
- [ ] 已执行冲突检测
- [ ] 已初始化 changelog v0.1.0

任务进行中：

- [ ] 状态徽章与实际一致
- [ ] 进度百分比与已完成步骤数一致
- [ ] 每次变更都有 changelog 记录
- [ ] 每次变更都有 Git 提交

任务归档时：

- [ ] 所有步骤标记 [x]
- [ ] 验收标准全部满足
- [ ] 实际完成时间已填写
- [ ] 已从 active-tasks.md 移除
- [ ] 已在 completed-archive.md 登记
