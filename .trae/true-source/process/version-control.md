# 版本控制规范

> 本规范定义真源文档系统的版本控制机制,包括 Git 提交规范、分支策略、变更追溯与系统版本演进。
> 所有任务文档的变更必须通过 Git 进行版本控制,确保端到端可追溯性。
>
> **适用范围**:`.trae/true-source/` 全部文件 + `tasks/` 任务工作目录

---

## 一、Git 提交规范

### 1.1 提交信息格式

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范,并强制包含任务 ID:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 1.2 type 枚举

| type | 含义 | 适用场景 |
|------|------|---------|
| `feat` | 新功能 | 新增任务、新增模板字段 |
| `fix` | 修复 | 修正任务计划、修复模板错误 |
| `docs` | 文档变更 | 更新进度、更新状态、更新说明 |
| `refactor` | 重构 | 任务步骤调整、资源重新声明 |
| `chore` | 杂务 | 任务归档、任务取消 |
| `revert` | 回退 | 撤销之前的变更 |

### 1.3 scope 枚举

| scope | 含义 |
|-------|------|
| `task` | 任务级变更(单任务) |
| `registry` | 登记表变更 |
| `template` | 模板变更 |
| `process` | 流程规范变更 |
| `system` | 系统级变更(README、usage-guide 等) |

### 1.4 提交信息示例

```
feat(task): 新增 TASK-0002 VPS部署架构落地

- 创建任务目录 tasks/TASK-0002-vps-deploy/
- 完成 README.md / plan.md / resources.md / changelog.md 初始化
- 在 registry/active-tasks.md 登记
- 在 registry/conflict-matrix.md 声明资源占用

Refs: TASK-0002
```

```
docs(task): TASK-0002 进度更新至 60%

- 完成步骤 3:上传 SSL 证书
- 完成步骤 4:部署 nginx 配置
- 进度从 40% 更新至 60%

Refs: TASK-0002
```

```
chore(task): TASK-0002 完成归档

- 验收通过,所有 DoD 满足
- 从 registry/active-tasks.md 移除
- 在 registry/completed-archive.md 追加归档记录

Refs: TASK-0002
```

### 1.5 提交粒度

- **最小粒度**:一次状态或进度变更对应一次提交
- **最大粒度**:不超过一个任务的一次完整阶段(如「创建任务」或「完成阶段一」)
- **禁止**:一次提交包含多个任务的变更(除非是系统级模板升级)

### 1.6 提交时机

| 事件 | 是否必须提交 | 提交信息示例 |
|------|------------|------------|
| 任务创建 | ✓ 必须 | `feat(task): 新增 TASK-XXXX <标题>` |
| 状态变更 | ✓ 必须 | `docs(task): TASK-XXXX 状态变更为 <状态>` |
| 进度更新 | ✓ 必须 | `docs(task): TASK-XXXX 进度更新至 XX%` |
| 资源变更 | ✓ 必须 | `docs(task): TASK-XXXX 资源占用变更` |
| 步骤调整 | ✓ 必须 | `refactor(task): TASK-XXXX 调整执行步骤` |
| 任务阻塞 | ✓ 必须 | `docs(task): TASK-XXXX 阻塞,原因:<简述>` |
| 阻塞解除 | ✓ 必须 | `docs(task): TASK-XXXX 阻塞解除` |
| 提交验收 | ✓ 必须 | `docs(task): TASK-XXXX 提交验收` |
| 任务归档 | ✓ 必须 | `chore(task): TASK-XXXX 完成归档` |
| 任务取消 | ✓ 必须 | `chore(task): TASK-XXXX 取消,原因:<简述>` |
| 模板升级 | ✓ 必须 | `feat(template): <变更说明>` |
| 流程规范升级 | ✓ 必须 | `feat(process): <变更说明>` |

---

## 二、分支策略

### 2.1 默认分支:main

所有任务文档变更默认提交到 `main` 分支。理由:

- 任务文档是「单一信息源」,需要团队所有成员实时可见
- 文档变更不涉及代码逻辑,合并冲突风险低
- 简化流程,降低协作成本

### 2.2 何时使用独立分支

仅以下场景使用独立分支:

| 场景 | 分支命名 | 合并方式 |
|------|---------|---------|
| 系统级模板重构 | `refactor/true-source-vX.Y` | PR 评审后合并 |
| 流程规范大版本升级 | `feat/process-vX.Y` | PR 评审后合并 |
| 试验性新模板 | `exp/template-<name>` | 评估后决定合并或废弃 |

### 2.3 分支保护规则

- `main` 分支:禁止 force push,禁止删除
- 实验性分支:可随时删除,不影响 main
- 合并到 main 前必须执行冲突检测(若涉及 registry/ 或 tasks/)

---

## 三、变更追溯机制

### 3.1 三层追溯

```
Git log ──────── 提交级追溯(谁在何时改了什么)
   ↓
任务 changelog ── 任务级追溯(任务执行过程的所有变更)
   ↓
registry ──────── 全局级追溯(所有任务的整体状态演进)
```

### 3.2 Git log 追溯

通过 Git log 可查询:

```powershell
# 查看某任务的所有提交
git log --grep="TASK-0002"

# 查看某天的所有任务变更
git log --since="2026-08-04 00:00" --until="2026-08-04 23:59" --grep="task"

# 查看某 type 的所有提交
git log --grep="^feat(task)"

# 查看某负责人的提交(需配合 git config user.name)
git log --author="devops-qa" --grep="task"
```

### 3.3 任务 changelog 追溯

每个任务的 `changelog.md` 记录细粒度变更:

- 变更类型(created/status/progress/scope/resource/blocked/unblocked/completed/cancelled)
- 变更人与变更时间
- 变更内容详情
- 状态变更前后
- 关联 Git commit SHA

### 3.4 registry 追溯

`registry/active-tasks.md` 与 `registry/completed-archive.md` 提供全局视图:

- active-tasks.md:当前所有活动任务的状态与进度
- completed-archive.md:所有已完成/取消任务的归档记录与统计

### 3.5 冲突追溯

`registry/conflict-matrix.md` 的「冲突清单」记录:

- 冲突 ID(C-XXX)
- 涉及任务
- 冲突类型(W×W、X×任意等)
- 严重度
- 处理方案
- 状态(待解除/已解除)

---

## 四、系统版本演进日志

### 4.1 系统版本号

真源文档系统自身遵循语义化版本:

| 版本号 | 含义 | 触发条件 |
|--------|------|---------|
| 主版本 X.0.0 | 不兼容变更 | 模板结构、流程规范的根本性调整 |
| 次版本 X.Y.0 | 兼容性新增 | 新增模板字段、新增流程步骤、新增文件 |
| 修订号 X.Y.Z | 文档优化 | 优化说明、修正笔误、补充示例 |

### 4.2 版本演进记录

#### v1.0.0 — 2026-08-04

**变更类型**:initial release(初始版本)

**包含内容**:
- 系统总览:README.md
- 模板(4 个):task-template.md / task-registry.md / conflict-matrix.md / changelog-template.md
- 实例文件(3 个):registry/active-tasks.md / registry/completed-archive.md / registry/conflict-matrix.md
- 流程规范(4 个):execution-spec.md / conflict-detection.md / progress-visualization.md / version-control.md
- 使用说明:usage-guide.md
- 示例任务:tasks/_EXAMPLE/(README.md / plan.md / resources.md / changelog.md)

**初始能力**:
- 多任务并行管理(每任务独立目录 + 统一登记表)
- 资源冲突检测(R/W/X 占用矩阵 + 自动检测规则)
- 进度可视化(状态徽章 + 进度条 + 多视图)
- 变更追溯(Git 提交规范 + 任务级 changelog + 全局 registry)
- 流程规范(创建 → 注册 → 检测 → 执行 → 验收 → 归档)

---

## 五、模板升级流程

当需要修改 `templates/` 下的模板文件时:

### 5.1 评估影响

- 哪些已存在的任务实例会受影响?
- 是否需要数据迁移(如新增必填字段)?
- 是否兼容历史 changelog 记录?

### 5.2 创建升级分支

```powershell
git checkout -b feat/template-vX.Y
```

### 5.3 修改模板

- 在模板顶部更新「模板版本」字段
- 在变更说明区记录本次升级内容

### 5.4 升级实例文件

- 更新 `registry/active-tasks.md` 与 `registry/completed-archive.md` 的结构
- 更新受影响任务实例(`tasks/TASK-XXXX-*/README.md`)以匹配新模板

### 5.5 提交 PR

```powershell
git commit -m "feat(template): 升级至 vX.Y,变更说明:<简述>"
git push origin feat/template-vX.Y
```

### 5.6 合并并升级系统版本号

合并后,在 [process/version-control.md](version-control.md) 第四节追加版本演进记录。

---

## 六、回滚机制

### 6.1 文档回滚

```powershell
# 查看某文件的历史版本
git log --oneline -- .trae/true-source/registry/active-tasks.md

# 回滚到某次提交(保留历史)
git revert <commit-sha>

# 回滚到某次提交(覆盖,慎用)
git reset --hard <commit-sha>
```

### 6.2 任务回滚

若任务状态被错误变更:

1. 在 `changelog.md` 追加 `revert` 记录(次版本 +1)
2. 说明回滚原因与回滚到的版本
3. 修改状态为回滚前的状态
4. Git 提交:`revert(task): TASK-XXXX 回滚至 v0.X.0,原因:<简述>`

### 6.3 系统级回滚

若系统升级导致问题:

1. 在 `process/version-control.md` 追加回滚记录
2. 系统版本号回退至上一稳定版本
3. 通知所有任务负责人
4. 评估受影响任务并调整

---

## 七、与其他规范的集成

### 7.1 与 deploy-vibe-coding-project skill 的集成

部署任务的五阶段流程对应 Git 提交节点:

| deploy-vibe 阶段 | Git 提交类型 | 提交信息示例 |
|------------------|------------|------------|
| S1 准备 | feat | `feat(task): 新增 TASK-XXXX <标题>` |
| S2 开发 | docs | `docs(task): TASK-XXXX 进度更新至 XX%` |
| S3 测试 | docs | `docs(task): TASK-XXXX 测试完成,提交验收` |
| S4 部署 | chore | `chore(task): TASK-XXXX 部署至 <环境>` |
| S5 验证 | chore | `chore(task): TASK-XXXX 完成归档` |

### 7.2 与 Conventional Commits 的集成

本规范的提交信息格式完全兼容 Conventional Commits,可被:

- `standard-version` / `semantic-release` 等工具自动生成 CHANGELOG
- GitHub Releases 自动发布
- 任何支持 Conventional Commits 的 CI/CD 工具识别

### 7.3 与项目 .trae/agents/ 的集成

每个 Agent 配置文件可在 frontmatter 中声明:

```yaml
task_system:
  enabled: true
  default_scope: task  # task / registry / template / process / system
```

Agent 承接任务时,按本规范执行 Git 提交。

---

## 八、合规性检查清单

### 8.1 提交前自检

- [ ] 提交信息符合 Conventional Commits 格式
- [ ] 提交信息包含任务 ID(如适用)
- [ ] 提交粒度合理(一次提交对应一次状态或进度变更)
- [ ] 提交不包含多个任务的变更(除非是系统级升级)

### 8.2 任务归档前自检

- [ ] 所有 changelog 记录已关联 Git commit SHA
- [ ] 所有状态变更都有对应的 Git 提交
- [ ] changelog 版本号连贯(v0.1.0 → v0.2.0 → ... → v1.0.0)
- [ ] 实际完成时间已填写
- [ ] 已从 active-tasks.md 移除
- [ ] 已在 completed-archive.md 登记

### 8.3 系统升级前自检

- [ ] 已评估对现有任务实例的影响
- [ ] 已创建独立分支
- [ ] 已升级实例文件以匹配新模板
- [ ] 已更新 process/version-control.md 的版本演进记录
- [ ] 已通知所有任务负责人

---

**文档结束**。本规范确保真源文档系统的所有变更可追溯、可回滚、可审计。
