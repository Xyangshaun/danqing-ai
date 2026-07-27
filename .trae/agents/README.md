# 丹青有AI - TRAE 智能体体系文档

> 本文档严格遵循 [TRAE 官方 Agent 规范](https://docs.trae.cn/ide_agent) 与 [子智能体(Subagent)规范](https://docs.trae.cn/ide_subagents)。
>
> 最后更新:2026-07-26 · 基于官方文档实测校准

---

## 📐 TRAE 官方智能体体系

```
内置智能体(TRAE IDE 自带)
├── Chat                      # 普通对话,快速咨询
└── Agent                     # 主智能体,可调用子智能体
    └── Search (内置子智能体)  # 检索文件

自定义智能体(IDE 界面创建)
├── 可独立 @调用
└── 可被 Agent 调用(开启"可被其他智能体调用"开关)

子智能体 Subagent(.md 文件定义)
├── 用户级: ~/.trae-cn/agents/{name}.md
└── 项目级: {project}/.trae/agents/{name}.md  ← 本目录
```

### 调用机制

1. 用户向 **Agent** 发送消息
2. Agent 将意图与所有 Subagent 的 `description` 字段匹配
3. 匹配成功则委派任务给 Subagent
4. Subagent 在独立上下文中执行,返回结果给 Agent
5. Agent 汇总并呈现给用户

---

## 🎯 丹青有AI 项目智能体清单

### 项目级 Subagent(本目录 .md 文件,直接生效)

共 **13 个** Subagent,分为四类:

#### 🏛️ 协调与设计类(3 个)

| 文件 | name | 用途 | 模型 |
|---|---|---|---|
| [01-product-architect.md](./01-product-architect.md) | `product-architect` | 产品架构师,跨端 API 契约维护 | glm-5.2 |
| [09-ui-designer.md](./09-ui-designer.md) | `ui-designer` | UI/UX 设计师,水墨色系与组件设计 | glm-5.2 |
| [13-compliance-checker.md](./13-compliance-checker.md) | `compliance-checker` | 合规审查员,学生数据隐私保护 | glm-5.2 |

#### 💻 开发实施类(5 个)

| 文件 | name | 用途 | 模型 |
|---|---|---|---|
| [02-frontend-app.md](./02-frontend-app.md) | `frontend-app` | React Web 应用开发 | Doubao-Seed-Code |
| [03-backend-service.md](./03-backend-service.md) | `backend-service` | Node.js 后端 + 数据库 | Doubao-Seed-Code |
| [04-marketing-website.md](./04-marketing-website.md) | `marketing-website` | Next.js 品牌官网 | Doubao-Seed-Code |
| [05-mobile-app.md](./05-mobile-app.md) | `mobile-app` | React Native 移动端 | Doubao-Seed-Code |
| [06-admin-dashboard.md](./06-admin-dashboard.md) | `admin-dashboard` | Ant Design Pro 管理后台 | Doubao-Seed-Code |

#### 🔐 安全与测试类(3 个)

| 文件 | name | 用途 | 模型 |
|---|---|---|---|
| [07-auth-oauth.md](./07-auth-oauth.md) | `auth-oauth` | 飞书 OAuth + 多租户权限 | glm-5.2 |
| [10-api-test-pro.md](./10-api-test-pro.md) | `api-test-pro` | API 测试工程师 | glm-5.2 |
| [11-ai-integration-engineer.md](./11-ai-integration-engineer.md) | `ai-integration-engineer` | AI 集成工程师(作业诊断) | glm-5.2 |

#### 🚀 运维与优化类(2 个)

| 文件 | name | 用途 | 模型 |
|---|---|---|---|
| [08-devops-qa.md](./08-devops-qa.md) | `devops-qa` | DevOps + CI/CD + 部署 | glm-5.2 |
| [12-performance-expert.md](./12-performance-expert.md) | `performance-expert` | 性能优化专家(3秒SLA) | glm-5.2 |

---

## 📝 Subagent 文件格式规范(官方)

每个 `.md` 文件必须遵循以下格式:

```markdown
---
name: agent-identifier
description: 描述 Agent 应在什么场景下调用此 Subagent,越具体越准确
model: glm-5.2
tools: Read, Glob, Grep, Write, Edit, Bash
disallowedTools: 
mcpServers:
  - GitHub
---

系统提示词内容(纯文本,定义角色、工作流程、行为边界、输出格式)
```

### frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 唯一标识,字母开头,含字母/数字/连字符,≤50 字符 |
| `description` | string | ✅ | 描述何时调用,越具体调度越准确 |
| `model` | string | ❌ | 指定模型,不填则用当前对话模型 |
| `tools` | string | ❌ | 允许的工具,逗号分隔;不填则加载全部 |
| `disallowedTools` | string | ❌ | 禁止的工具,优先级高于 `tools` |
| `mcpServers` | list | ❌ | 允许调用的 MCP Server 名称 |

### 可用模型

| 模型 | model 字段值 | 适用场景 |
|---|---|---|
| Doubao-Seed-2.1-Pro | `Doubao-Seed-2.1-Pro` | 复杂推理 |
| Doubao-Seed-2.1-Turbo | `Doubao-Seed-2.1-Turbo` | 快速响应 |
| Doubao-Seed-Code | `Doubao_1_6` | 代码生成(开发类 Agent) |
| GLM-5.2 | `glm-5.2` | 通用(协调/安全类 Agent) |
| DeepSeek-V4-Pro | `DeepSeek-V4-Pro` | 数学/逻辑 |
| Kimi-K2.7-Code | `kimi-k2.7-code` | 长上下文代码 |
| Qwen3.7-Plus | `qwen-3.7-plus` | 通用 |

### 可用工具(官方 11 个)

| 工具 | 功能 | 类别 |
|---|---|---|
| `Read` | 读取文件或目录 | 阅读 |
| `Glob` | 按文件名模式搜索 | 阅读 |
| `Grep` | 按内容正则搜索 | 阅读 |
| `Write` | 创建或覆写文件 | 文件系统 |
| `Edit` | 编辑或删除文件 | 文件系统 |
| `Bash` | 运行终端命令 | 终端 |
| `WebSearch` | 网络搜索 | 联网搜索 |
| `WebFetch` | 抓取网页内容 | 联网搜索 |
| `Skill` | 调用 Skill | 能力扩展 |
| `TodoWrite` | 管理任务清单 | 任务管理 |
| `LSP` | 通过 Language Server 检查语法 | 诊断 |
| `mcp__<server>__<tool>` | 限定调用 MCP 指定工具 | MCP |

---

## 🔧 MCP Server 配置清单

需在 TRAE IDE → MCP 管理中预先安装:

| MCP Server | 用途 | 启用 Agent |
|---|---|---|
| `GitHub` | GitHub PR/Issue/Actions | 全部 |
| 飞书(lark-cli) | 飞书 OAuth/消息/通讯录 | 03/05/06/07/08 |
| Vercel(可选) | Vercel 部署 | 04/08 |

---

## 🚀 使用方式

### 方式 1:直接 @调用 Subagent

```
@product-architect 请设计用户登录的 API 契约
@backend-service 实现飞书 OAuth 回调接口
@ui-designer 设计登录页面,遵循水墨色系
```

### 方式 2:让 Agent 自动调度

```
@Agent 我需要实现飞书登录功能,从前端到后端到数据库
(Agent 会自动调用 frontend-app + backend-service + auth-oauth)
```

### 方式 3:在 Prompt 中指定

```
@Agent 使用 security-best-practices Skill 审查本次改动的安全风险
@Agent 使用 api-test-pro 为 /auth/feishu/callback 接口生成测试用例
```

---

## ⚠️ 重要说明

### Subagent 与自定义智能体的区别

| 类型 | 创建方式 | 调用方 | 配置位置 |
|---|---|---|---|
| **Subagent** | `.md` 文件定义 | 仅 Agent 可调用 | `.trae/agents/` 目录 |
| **自定义智能体** | IDE 界面创建 | 用户直接 @调用 | IDE 智能体管理界面 |

本目录下的 `.md` 文件均为 **Subagent**,由内置 Agent 自动调度。

### 启用 Subagent 功能

1. 设置 → Beta
2. 打开"启用 Subagents 目录"开关
3. 重启 TRAE IDE

### 文件覆盖规则

- 项目级 Subagent 覆盖同名的用户级 Subagent
- 同类型同名文件,只有最先加载的生效

---

## 📋 配置检查清单

### 第一步:启用 Subagent 功能
- [ ] 设置 → Beta → 启用 Subagents 目录

### 第二步:安装 MCP Server
- [ ] 安装 GitHub MCP(填入 GitHub PAT)
- [ ] 安装飞书 MCP(填入 App ID + App Secret)
- [ ] (可选)安装 Vercel MCP

### 第三步:验证 Subagent 加载
- [ ] 重启 TRAE IDE
- [ ] 在对话中输入 `@`,确认能看到 13 个 Subagent

### 第四步:测试调用
- [ ] `@product-architect 输出项目架构评估报告`
- [ ] `@ui-designer 评估现有 UI 的水墨色系一致性`
- [ ] `@api-test-pro 为现有 API 生成测试用例`

---

## 🔗 官方文档参考

- [TRAE 智能体概述](https://docs.trae.cn/ide_agent-overview)
- [创建并管理自定义智能体](https://docs.trae.cn/ide_agent)
- [内置智能体:Agent](https://docs.trae.cn/ide_built-in-agent)
- [子智能体 Subagent](https://docs.trae.cn/ide_subagents)
- [支持一键导入的自定义智能体](https://docs.trae.cn/ide/custom-agents-ready-for-one-click-import)
- [模型上下文协议 MCP](https://docs.trae.cn/ide/model-context-protocol)
