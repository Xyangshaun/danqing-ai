# 真源文档系统使用说明

> 本文档是面向所有使用者(开发负责人、Agent、项目经理)的完整使用指南。
> 涵盖从入门到进阶的全部使用场景,确保多任务开发过程的有序性和可追溯性。
>
> **适用版本**:v1.0.0
> **最后更新**:2026-08-04

---

## 一、系统定位

真源文档系统(True Source Task System)是丹青有AI项目的「单一信息源」任务管理系统,用于:

- 在多任务并行开发场景下统一管理任务状态、步骤、资源占用与变更历史
- 检测并行任务间的资源冲突,防止代码冲突与部署窗口重叠
- 提供任务进度可视化,实时查看各任务完成情况
- 通过 Git 提交规范 + 任务级 changelog 实现端到端可追溯性

**核心价值**:即使在 5+ 任务并行执行时,任何成员仍可在 30 秒内回答「现在每个任务进展如何」「是否有人正在修改我即将改的文件」「下周有哪些关键时间节点」。

---

## 二、目录结构与文件职责

```
.trae/true-source/
├── README.md                       # 系统总览(1 页纸介绍)
├── usage-guide.md                  # 本文件:完整使用说明
├── templates/                      # 可复用模板(复制即用,不可直接填实际数据)
│   ├── task-template.md            # 单任务标准模板
│   ├── task-registry.md            # 任务总览登记表模板
│   ├── conflict-matrix.md          # 资源冲突矩阵模板
│   └── changelog-template.md       # 变更历史模板
├── registry/                        # 实例文件(可直接维护,项目实际数据)
│   ├── active-tasks.md             # ★ 当前活动任务总览(实时维护)
│   ├── completed-archive.md        # 已完成 / 归档任务
│   └── conflict-matrix.md          # ★ 资源冲突矩阵实例(实时维护)
├── process/                        # 执行流程规范(只读,定义规则)
│   ├── execution-spec.md           # 执行流程规范
│   ├── conflict-detection.md       # 资源冲突检测规则
│   ├── progress-visualization.md   # 进度可视化规范
│   └── version-control.md          # 版本控制规范
└── tasks/                          # 实际任务工作目录(一任务一目录)
    ├── _EXAMPLE/                   # 示例任务(参考用,不参与实际执行)
    └── TASK-XXXX-<slug>/           # 真实任务目录
        ├── README.md               # 任务说明(基于 task-template.md)
        ├── plan.md                 # 执行步骤与进度
        ├── resources.md            # 资源需求与占用声明
        └── changelog.md            # 任务级变更历史
```

### 文件职责矩阵

| 文件 | 角色 | 修改频率 | 修改者 |
|------|------|---------|--------|
| `templates/*` | 模板,不可填实际数据 | 偶尔(规则变更时) | 系统维护者 |
| `registry/active-tasks.md` | 实时活动任务总览 | 每次状态变更 | 任务负责人 |
| `registry/completed-archive.md` | 归档任务统计 | 任务归档时 | 任务负责人 |
| `registry/conflict-matrix.md` | 实时资源占用矩阵 | 任务创建/资源变更时 | 任务负责人 |
| `process/*` | 流程规范,只读 | 极少(规范升级时) | 系统维护者 |
| `tasks/TASK-XXXX-*/` | 单任务工作区 | 任务执行期间 | 任务负责人 |

---

## 三、快速上手(5 分钟入门)

### 场景:为「VPS 部署架构落地」创建一个新任务

#### 步骤 1:分配任务 ID

打开 `registry/active-tasks.md` 与 `registry/completed-archive.md`,查找当前最大 ID,加 1。

例如:当前最大为 `TASK-0001`,新任务分配 `TASK-0002`。

#### 步骤 2:创建任务目录

```powershell
# 在项目根目录执行
$newTaskDir = ".trae/true-source/tasks/TASK-0002-vps-deploy"
New-Item -ItemType Directory -Path $newTaskDir -Force
Copy-Item ".trae/true-source/templates/task-template.md" "$newTaskDir/README.md"
Copy-Item ".trae/true-source/templates/changelog-template.md" "$newTaskDir/changelog.md"
New-Item -ItemType File -Path "$newTaskDir/plan.md"
New-Item -ItemType File -Path "$newTaskDir/resources.md"
```

#### 步骤 3:填写 README.md

参考 [tasks/_EXAMPLE/README.md](tasks/_EXAMPLE/README.md),替换所有 `<>` 占位符:

- 任务 ID:`TASK-0002`
- 标题:VPS 部署架构落地
- 状态:⚪ PENDING
- 优先级:P0
- 负责人:devops-qa
- 计划开始:2026-08-04
- 计划完成:2026-08-05
- 目标描述:在腾讯云 VPS 上完成 nginx 配置部署、SSL 证书上传、官网与业务应用产物上传,实现 HTTPS 访问
- 验收标准:`curl -I https://www.danqing.site/` 返回 200 + 官网 HTML 等

#### 步骤 4:填写 plan.md

参考 [tasks/_EXAMPLE/plan.md](tasks/_EXAMPLE/plan.md),分解为可执行步骤(每步 1-4 小时)。

#### 步骤 5:填写 resources.md

参考 [tasks/_EXAMPLE/resources.md](tasks/_EXAMPLE/resources.md),声明资源占用:

```markdown
| 资源类型 | 资源 | 占用类型 | 占用时段 | 备注 |
| --- | --- | --- | --- | --- |
| 运行环境 | 生产 VPS | X | 2026-08-04 14:00-18:00 | 部署窗口,独占 |
| 配置文件 | deploy/nginx-site.conf | R | 全程 | 仅读取已写入的配置 |
| 静态资源 | /var/www/danqing-ai/website/ | W | 2026-08-04 15:00-16:00 | 上传官网产物 |
```

#### 步骤 6:初始化 changelog.md

替换 `changelog.md` 中的占位符:

```markdown
### v0.1.0 — 2026-08-04

- **变更类型**:created(任务创建)
- **变更人**:devops-qa
- **变更内容**:
  - 初始创建任务,定义目标、步骤、资源需求
- **状态变更**:— → ⚪ PENDING
- **关联提交**:`<待提交>` `feat(task): 新增 TASK-0002 VPS部署架构落地`
```

#### 步骤 7:登记到 active-tasks.md

在 `registry/active-tasks.md` 的「活动任务总览」表追加一行,并在「按状态分组」的「⚪ 待启动」分组追加条目。

#### 步骤 8:声明资源占用

在 `registry/conflict-matrix.md` 中为新任务添加一列,填写资源占用标记(R/W/X)。

#### 步骤 9:执行冲突检测

参考 [process/conflict-detection.md](process/conflict-detection.md),按检测清单逐项检查。若发现冲突,记录到「冲突清单」并按处理策略协调。

#### 步骤 10:Git 提交

```powershell
git add .trae/true-source/tasks/TASK-0002-vps-deploy/
git add .trae/true-source/registry/
git commit -m "feat(task): 新增 TASK-0002 VPS部署架构落地"
```

---

## 四、日常使用场景

### 场景 1:开始执行任务

1. 修改 `tasks/TASK-XXXX-<slug>/README.md` 状态:⚪ PENDING → 🔵 IN_PROGRESS
2. 在 `changelog.md` 追加 v0.2.0 `status` 记录
3. 同步 `registry/active-tasks.md` 状态徽章与「按状态分组」
4. Git 提交:`docs(task): TASK-XXXX 状态变更为进行中`

### 场景 2:完成一个步骤

1. 在 `plan.md` 标记步骤为 `[x]`,填写完成时间
2. 计算进度百分比 = 已完成步骤数 / 总步骤数
3. 在 `changelog.md` 追加 `progress` 记录
4. 同步 `registry/active-tasks.md` 进度列
5. Git 提交:`docs(task): TASK-XXXX 进度更新至 XX%`

### 场景 3:任务被阻塞

1. 修改任务状态:🔵 IN_PROGRESS → 🟡 BLOCKED
2. 在 `changelog.md` 追加 `blocked` 记录,说明阻塞原因与预计解除时间
3. 在 `registry/active-tasks.md` 更新状态与「已阻塞」分组
4. Git 提交:`docs(task): TASK-XXXX 阻塞,原因:<简述>`

### 场景 4:阻塞解除

1. 修改任务状态:🟡 BLOCKED → 🔵 IN_PROGRESS
2. 在 `changelog.md` 追加 `unblocked` 记录
3. 在 `registry/active-tasks.md` 更新状态与「进行中」分组
4. Git 提交:`docs(task): TASK-XXXX 阻塞解除,恢复执行`

### 场景 5:任务提交验收

1. 所有 plan.md 步骤标记 `[x]`
2. 自检验收标准(DoD)全部满足
3. 修改任务状态:🔵 IN_PROGRESS → 🟣 REVIEW
4. 在 `changelog.md` 追加 `status` 记录
5. Git 提交:`docs(task): TASK-XXXX 提交验收`

### 场景 6:验收通过并归档

1. 验收人在 `changelog.md` 追加验收记录
2. 修改任务状态:🟣 REVIEW → 🟢 DONE
3. 填写实际完成时间
4. 追加 v1.0.0 `completed` 记录
5. 从 `registry/active-tasks.md` 移除该任务行
6. 在 `registry/completed-archive.md` 追加归档记录
7. Git 提交:`chore(task): TASK-XXXX 完成归档`

### 场景 7:紧急插队(P0 任务)

1. 立即创建 P0 任务并注册
2. 评估对现有进行中任务的影响
3. 必要时将受影响任务标记为 🟡 BLOCKED,原因「P0 任务插队」
4. P0 任务完成后,恢复受影响任务
5. Git 提交:`feat(task): 紧急新增 TASK-XXXX <标题>`

### 场景 8:取消任务

1. 修改任务状态:任意 → ⚫ CANCELLED
2. 在 `changelog.md` 追加 `cancelled` 记录,说明取消原因
3. 从 `registry/active-tasks.md` 移除该任务行
4. 在 `registry/completed-archive.md` 追加取消记录
5. Git 提交:`chore(task): TASK-XXXX 取消,原因:<简述>`

---

## 五、查看视图速查表

| 想看什么 | 看哪里 |
|---------|--------|
| 当前有哪些任务在进行 | `registry/active-tasks.md` 按状态分组 |
| 整体进度如何 | `registry/active-tasks.md` 顶部「整体进度」字段 |
| 某任务详细步骤 | `tasks/TASK-XXXX-<slug>/plan.md` |
| 某任务变更历史 | `tasks/TASK-XXXX-<slug>/changelog.md` |
| 哪些任务有冲突 | `registry/active-tasks.md` 并行执行矩阵 |
| 冲突详情 | `registry/conflict-matrix.md` 冲突清单 |
| 历史完成情况 | `registry/completed-archive.md` |
| 本周关键时间节点 | `registry/active-tasks.md` 第四节 |
| 流程规范 | `process/execution-spec.md` |
| 冲突检测规则 | `process/conflict-detection.md` |
| 进度可视化方式 | `process/progress-visualization.md` |
| Git 提交规范 | `process/version-control.md` |

---

## 六、常见问题(FAQ)

### Q1:任务步骤执行中发现 plan.md 需要调整,怎么办?

A:在 `changelog.md` 追加 `scope` 记录(版本号次版本 +1),说明调整原因与影响,然后修改 `plan.md`。Git 提交信息:`docs(task): TASK-XXXX 调整执行步骤,原因:<简述>`。

### Q2:资源占用临时变更(如新增一个文件修改),怎么办?

A:在 `changelog.md` 追加 `resource` 记录(版本号修订号 +1),同步更新 `registry/conflict-matrix.md` 中本任务的资源占用列,执行冲突检测。Git 提交信息:`docs(task): TASK-XXXX 资源占用变更`。

### Q3:两个任务都需要修改同一文件,如何处理?

A:参考 [process/conflict-detection.md](process/conflict-detection.md) 第五节「冲突处理策略」,按以下优先级选择:
1. **串行化**(首选):调整任务执行顺序,低优先级任务标记为 🟡 BLOCKED,依赖高优先级任务
2. **资源拆分**(次选):将共享文件按职责拆分为多个独立文件
3. **分支隔离**:每个任务在独立 Git 分支开发,按 PR 顺序合并
4. **任务合并**(最后手段):高度耦合的任务合并为一个

### Q4:任务依赖另一个未完成任务,怎么办?

A:在被依赖任务的 README「依赖任务」字段填写上游任务 ID,在被依赖任务完成后,在 changelog 中标注「通知 TASK-XXXX 可继续」。本任务在 changelog 中标注「依赖 TASK-YYYY 已就绪」。

### Q5:模板文件能否直接修改?

A:**不能**。`templates/` 目录下的文件是模板,不可填入实际数据。如需创建实例,复制模板到 `tasks/TASK-XXXX-<slug>/` 或 `registry/` 目录后修改实例文件。模板变更需走规范升级流程(参考 [process/version-control.md](process/version-control.md) 第二节)。

### Q6:如何让多 Agent 协作时不冲突?

A:每个 Agent 在领取任务时,必须在 `registry/conflict-matrix.md` 声明资源占用。系统会自动检测冲突并提示。建议每个 Agent 启动前先读取 `registry/active-tasks.md` 了解全局状态。

### Q7:已归档任务能否修改?

A:**不能**。归档后任务目录 `tasks/TASK-XXXX-<slug>/` 保留但不再修改。如需返工,创建新任务并在「依赖任务」字段填写原任务 ID,引用原任务作为参考。

### Q8:如何统计某段时间内的任务完成情况?

A:查看 `registry/completed-archive.md` 的「统计摘要」与「已完成任务列表」,可按时间范围、优先级、负责人筛选。

---

## 七、与项目其他系统的集成

### 7.1 与 .trae/agents/ 的集成

每个 Agent 配置文件(`.trae/agents/XX-*.md`)在承接任务时:

1. 读取 `registry/active-tasks.md` 了解全局任务状态
2. 在 `tasks/TASK-XXXX-<slug>/README.md` 的「负责人」字段填写 Agent 名称
3. 执行任务前在 `registry/conflict-matrix.md` 声明资源占用
4. 任务完成后在 `changelog.md` 记录执行结果

### 7.2 与 .trae/documents/context-log-*.md 的集成

上下文日志(`.trae/documents/context-log-YYYY-MM-DD.md`)在生成时:

- 引用 `registry/active-tasks.md` 作为任务状态权威来源
- 引用 `registry/completed-archive.md` 作为已完成任务统计来源
- 偏差分析章节引用 `registry/conflict-matrix.md` 的冲突清单

### 7.3 与 deploy-vibe-coding-project skill 的集成

部署任务的五阶段流程(S1-S5)与本系统的任务生命周期对应:

| deploy-vibe 阶段 | 本系统任务状态 | 产出 |
|------------------|---------------|------|
| S1 准备 | ⚪ PENDING → 🔵 IN_PROGRESS | 任务 README + plan.md |
| S2 开发 | 🔵 IN_PROGRESS | plan.md 步骤推进 |
| S3 测试 | 🔵 IN_PROGRESS → 🟣 REVIEW | plan.md 测试步骤完成 |
| S4 部署 | 🟣 REVIEW | 部署验证记录 |
| S5 验证 | 🟣 REVIEW → 🟢 DONE | changelog 验收记录 |

### 7.4 与 .trae/specs/ 的集成

规格文档(`.trae/specs/<feature>/`)在创建时:

- 在 `spec.md` 引用对应任务 ID
- 在 `tasks.md` 的任务条目链接到 `tasks/TASK-XXXX-<slug>/README.md`
- 在 `checklist.md` 的检查项对应 `plan.md` 步骤

---

## 八、最佳实践

### 8.1 任务粒度

- **理想粒度**:1-3 天可完成,5-15 个步骤
- **过大信号**:步骤 > 20 或预计 > 5 天 → 拆分为多个子任务
- **过小信号**:步骤 < 3 或预计 < 4 小时 → 合并到相关任务

### 8.2 资源声明

- **保守原则**:宁可多声明,不可漏声明
- **细化到文件**:不要只声明 `server/src/*(W)`,要细化到 `server/src/controllers/auth.ts(W)`
- **包含间接依赖**:不仅声明代码文件,还要声明 API、数据库表、环境变量

### 8.3 Changelog 记录

- **小步快走**:每次状态或进度变化都记录,不要积攒
- **关联提交**:必须填写对应的 Git commit SHA
- **只追加不修改**:已发布的记录不可改,如有错误新增修订记录说明

### 8.4 冲突预防

- **启动前检测**:任务启动前必须执行冲突检测
- **每日同步**:每日检查 `registry/conflict-matrix.md` 是否有新增未处理冲突
- **生产部署窗口**:生产环境部署必须声明 X 占用,避免窗口重叠

### 8.5 进度可视化

- **实时更新**:状态或进度变化后立即同步 `registry/active-tasks.md`
- **使用徽章**:严格使用约定的状态徽章(⚪🔵🟡🟣🟢⚫)
- **进度百分比**:按已完成步骤数 / 总步骤数计算,四舍五入至整数

---

## 九、版本演进

本系统遵循语义化版本:

| 版本 | 含义 | 触发条件 |
|------|------|---------|
| 主版本 +1 | 不兼容变更 | 模板结构、流程规范的根本性调整 |
| 次版本 +1 | 兼容性新增 | 新增模板字段、新增流程步骤 |
| 修订号 +1 | 文档优化 | 优化说明、修正笔误、补充示例 |

**当前版本**:v1.0.0

**版本演进记录**:见 [process/version-control.md](process/version-control.md) 第三节「系统版本演进日志」。

---

## 十、获取帮助

- **流程疑问**:查阅 [process/execution-spec.md](process/execution-spec.md)
- **冲突疑问**:查阅 [process/conflict-detection.md](process/conflict-detection.md)
- **可视化疑问**:查阅 [process/progress-visualization.md](process/progress-visualization.md)
- **Git 提交疑问**:查阅 [process/version-control.md](process/version-control.md)
- **示例参考**:查阅 [tasks/_EXAMPLE/](tasks/_EXAMPLE/README.md)
- **系统总览**:查阅 [README.md](README.md)

---

**文档结束**。本使用说明覆盖了从入门到进阶的全部场景,如有未覆盖的场景请补充至本文件第九节「版本演进」。
