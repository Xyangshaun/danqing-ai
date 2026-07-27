# 丹青有AI - Subagent 配置审查报告与执行清单

> **生成时间**:2026-07-27
> **审查范围**:`.trae/agents/` 目录下 13 个 Subagent 文件 + `CONFIG-GUIDE.md` + `README.md`
> **审查依据**:TRAE 官方 [Subagent 规范](https://docs.trae.cn/ide_subagents) + 项目 `project_memory.md` 多 Agent 分工策略

---

## 一、审查总结

### 1.1 总体结论

| 项目 | 状态 |
|---|---|
| 13 个 Subagent 文件全部存在 | ✅ 通过 |
| frontmatter 格式合规 | ✅ 通过 |
| `name` 字段合法性 | ✅ 通过 |
| `description` 字段完整性 | ✅ 通过 |
| 模型分配策略 | ✅ 通过 |
| 工具权限分配 | ✅ 通过 |
| MCP 服务器绑定 | ⚠️ 部分缺失(详见差异清单) |
| CONFIG-GUIDE.md 完整性 | ✅ 通过(用户消息截断仅是粘贴问题) |

### 1.2 关键发现

1. **配置指南实际已完整**:`.trae/agents/CONFIG-GUIDE.md` 已包含全部 13 个 Subagent 速查表(行 299-396),用户消息中"被截断的 backend-service 部分"实为复制粘贴时截断,文件本身无缺失。
2. **2 处 MCP 绑定差异**:与 `project_memory.md` 中"MCP 分配清单"不完全一致,需补全。

---

## 二、13 个 Subagent 审查明细

### 2.1 frontmatter 审查

| # | name | model | tools | disallowedTools | mcpServers | 状态 |
|---|---|---|---|---|---|---|
| 01 | product-architect | glm-5.2 | Read/Write/Edit/Glob/Grep/TodoWrite/WebSearch/WebFetch/Skill | Bash | GitHub | ✅ |
| 02 | frontend-app | Doubao_1_6 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/Skill/LSP | (空) | GitHub | ✅ |
| 03 | backend-service | Doubao_1_6 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill/LSP | (空) | GitHub | ⚠️ 缺 lark-cli |
| 04 | marketing-website | Doubao_1_6 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ⚠️ 缺 Vercel(选装) |
| 05 | mobile-app | Doubao_1_6 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ⚠️ 缺 lark-cli |
| 06 | admin-dashboard | Doubao_1_6 | Read/Write/Edit/Glob/Grep/Bash/WebFetch/Skill | (空) | GitHub | ⚠️ 缺 lark-cli |
| 07 | auth-oauth | glm-5.2 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ⚠️ 缺 lark-cli |
| 08 | devops-qa | glm-5.2 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ⚠️ 缺 Vercel(选装) |
| 09 | ui-designer | glm-5.2 | Read/Write/Edit/Glob/Grep/TodoWrite/WebSearch/WebFetch/Skill | Bash | GitHub | ✅ |
| 10 | api-test-pro | glm-5.2 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebFetch/Skill | (空) | GitHub | ✅ |
| 11 | ai-integration-engineer | glm-5.2 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ✅ |
| 12 | performance-expert | glm-5.2 | Read/Write/Edit/Glob/Grep/Bash/TodoWrite/WebSearch/WebFetch/Skill | (空) | GitHub | ✅ |
| 13 | compliance-checker | glm-5.2 | Read/Write/Edit/Glob/Grep/TodoWrite/WebSearch/WebFetch/Skill | Bash | GitHub | ✅ |

### 2.2 模型分配策略验证

| 角色 | 模型 | 验证结果 |
|---|---|---|
| 协调/设计/合规(01/09/13) | glm-5.2 | ✅ 通用模型,符合"通用协调"定位 |
| 开发实施(02-06) | Doubao_1_6 | ✅ 代码模型,符合"代码生成"定位 |
| 安全/测试/AI/运维/性能(07/08/10/11/12) | glm-5.2 | ✅ 通用模型,符合"分析决策"定位 |

### 2.3 工具权限策略验证

| Agent 类别 | 是否禁用 Bash | 验证结果 |
|---|---|---|
| 协调/设计类(01/09/13) | ✅ 禁用 | 合理:避免架构师/UI设计师直接执行命令 |
| 开发实施类(02-06) | ❌ 允许 | 合理:需要构建/测试 |
| 安全/测试类(07/10/11) | ❌ 允许 | 合理:需要运行测试命令 |
| 运维/性能类(08/12) | ❌ 允许 | 合理:需要部署与性能分析 |

---

## 三、差异清单与修复建议

### 3.1 差异 1:lark-cli MCP 绑定缺失

**问题描述**:`project_memory.md` 明确指出"飞书 MCP(lark-cli)启用 Agent 为 03/05/06/07/08",但当前这 5 个 Subagent 的 frontmatter `mcpServers` 仅声明了 `GitHub`,未声明 `lark-cli`。

**影响**:若 IDE 严格按 frontmatter `mcpServers` 白名单加载,这 5 个 Agent 将无法调用飞书 MCP 工具。

**修复方案**(二选一):

**方案 A(推荐)**:补全 frontmatter 声明

```yaml
# 03-backend-service.md / 05-mobile-app.md / 06-admin-dashboard.md
# / 07-auth-oauth.md / 08-devops-qa.md
mcpServers:
  - GitHub
  - lark-cli
```

**方案 B**:删除 frontmatter 中的 `mcpServers` 字段,让 Subagent 加载 IDE 中所有已启用 MCP(默认行为)

### 3.2 差异 2:Vercel MCP 绑定缺失(选装)

**问题描述**:`project_memory.md` 指出"Vercel MCP 启用 Agent 为 04/08",但当前 04/08 frontmatter 仅声明 `GitHub`。

**影响**:Phase 2 部署阶段(04 marketing-website / 08 devops-qa)将无法通过 MCP 调用 Vercel API。

**修复方案**:Phase 2 启动前补全

```yaml
# 04-marketing-website.md / 08-devops-qa.md
mcpServers:
  - GitHub
  - Vercel
```

### 3.3 MCP Server 名称一致性

**注意**:`mcpServers` 中的名称必须与 TRAE IDE 中实际安装的 MCP Server 名称**完全一致**(区分大小写)。请在 IDE 安装时记录确切名称,如:
- `GitHub` vs `github` vs `mcp_GitHub`
- `lark-cli` vs `lark` vs `feishu`

**验证方法**:安装后查看 IDE 的 MCP 管理界面,复制服务器的精确名称,与 frontmatter 比对。

---

## 四、配置执行清单(用户在 TRAE IDE 中逐步完成)

### 第一阶段:启用 Subagent 功能(5 分钟)

- [ ] 1.1 打开 TRAE IDE → 设置 → Beta
- [ ] 1.2 找到"启用 Subagents 目录"开关,打开
- [ ] 1.3 关闭 TRAE IDE 并重新启动
- [ ] 1.4 验证:在对话输入框输入 `@`,应看到 13 个 Subagent

### 第二阶段:安装 MCP Server(30 分钟)

#### 2.1 GitHub MCP(必装,全部 13 个 Agent 使用)

- [ ] 2.1.1 登录 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
- [ ] 2.1.2 Token 配置:
  - Token name:`danqing-ai-mcp`
  - Expiration:`90 days`
  - Repository access:All repositories 或指定仓库
- [ ] 2.1.3 权限勾选:
  - Contents: Read and write
  - Issues: Read and write
  - Pull requests: Read and write
  - Actions: Read-only
  - Commit statuses: Read-only
- [ ] 2.1.4 复制 token(格式 `github_pat_xxx`),保存到密码管理器
- [ ] 2.1.5 TRAE IDE → AI 面板 → 齿轮 → MCP → 添加 → 市场搜索 "GitHub"
- [ ] 2.1.6 安装两个互补包:
  - `mcp_plugin_GitHub_github`(全流程:Issue/Actions/Release)
  - `mcp_GitHub`(代码协作:Review/分支)
- [ ] 2.1.7 在弹窗中填入 GitHub PAT
- [ ] 2.1.8 验证:对话中测试 `@Agent 使用 GitHub MCP 列出我的仓库`

#### 2.2 飞书 MCP(必装,Agent 03/05/06/07/08 使用)

- [ ] 2.2.1 访问 [飞书开放平台](https://open.feishu.cn/app) → 登录飞书账号
- [ ] 2.2.2 创建企业自建应用:
  - 应用名称:`丹青有AI`
  - 应用描述:`高校艺术教育AI作业诊断系统`
- [ ] 2.2.3 保存凭证:
  - App ID(格式 `cli_xxxxxxxxxxxx`)
  - App Secret(格式 `xxxxxxxxxxxxxxxxxxxxxxxxxx`,只显示一次)
- [ ] 2.2.4 进入应用 → 权限管理 → 开通权限:
  - `contact:user.base:readonly`(获取用户基本信息)
  - `contact:user.email:readonly`(获取用户邮箱)
  - `contact:user.phone:readonly`(获取用户手机号)
  - `contact:department:readonly`(获取通讯录部门信息)
  - `im:message:send_as_bot`(以应用身份发消息)
  - `im:chat:readonly`(获取群组信息)
  - `im:message:readonly`(读取用户发出的消息)
- [ ] 2.2.5 进入应用 → 安全设置 → 添加重定向 URL:
  ```
  Web 端回调:
  http://localhost:5173/auth/feishu/callback
  https://你的域名/auth/feishu/callback

  管理后台回调:
  http://localhost:3001/auth/feishu/callback
  https://admin.你的域名/auth/feishu/callback
  ```
- [ ] 2.2.6 TRAE IDE → MCP → 添加 → 市场搜索 "飞书" 或 "lark"
- [ ] 2.2.7 安装飞书 MCP
- [ ] 2.2.8 填入 App ID + App Secret → 保存
- [ ] 2.2.9 验证:对话中测试 `@Agent 使用飞书 MCP 查询当前认证状态`
- [ ] 2.2.10 **记录 MCP Server 精确名称**,用于 frontmatter 校对

#### 2.3 Vercel MCP(选装,Phase 2 再装)

- [ ] 2.3.1 登录 Vercel → 头像 → Settings → Tokens → Create
- [ ] 2.3.2 Token Name:`danqing-ai-deploy`,Scope:Full Access,Expiration:90 days
- [ ] 2.3.3 复制 token,保存到密码管理器
- [ ] 2.3.4 TRAE IDE → MCP → 市场搜索 "Vercel" → 安装 → 填入 token → 保存

### 第三阶段:补全 frontmatter MCP 绑定(可选,推荐)

> 仅在第二阶段完成且 MCP 名称确认后执行。如果 IDE 默认加载所有已启用 MCP,可跳过本阶段。

- [ ] 3.1 编辑 `.trae/agents/03-backend-service.md`,将 `mcpServers` 改为:
  ```yaml
  mcpServers:
    - GitHub
    - lark-cli   # 替换为实际 MCP 名称
  ```
- [ ] 3.2 编辑 `.trae/agents/05-mobile-app.md`,同上
- [ ] 3.3 编辑 `.trae/agents/06-admin-dashboard.md`,同上
- [ ] 3.4 编辑 `.trae/agents/07-auth-oauth.md`,同上
- [ ] 3.5 编辑 `.trae/agents/08-devops-qa.md`,改为:
  ```yaml
  mcpServers:
    - GitHub
    - lark-cli       # 替换为实际名称
    - Vercel         # 替换为实际名称(若已装)
  ```
- [ ] 3.6 编辑 `.trae/agents/04-marketing-website.md`,添加 Vercel(若已装)
- [ ] 3.7 重启 TRAE IDE 使配置生效

### 第四阶段:验证 13 个 Subagent 加载(5 分钟)

- [ ] 4.1 重启 TRAE IDE
- [ ] 4.2 在对话输入框输入 `@`,确认显示 13 个 Subagent

#### 🏛️ 协调与设计类(3 个)
- [ ] 4.3 `@product-architect` 显示
- [ ] 4.4 `@ui-designer` 显示
- [ ] 4.5 `@compliance-checker` 显示

#### 💻 开发实施类(5 个)
- [ ] 4.6 `@frontend-app` 显示
- [ ] 4.7 `@backend-service` 显示
- [ ] 4.8 `@marketing-website` 显示
- [ ] 4.9 `@mobile-app` 显示
- [ ] 4.10 `@admin-dashboard` 显示

#### 🔐 安全与测试类(3 个)
- [ ] 4.11 `@auth-oauth` 显示
- [ ] 4.12 `@api-test-pro` 显示
- [ ] 4.13 `@ai-integration-engineer` 显示

#### 🚀 运维与优化类(2 个)
- [ ] 4.14 `@devops-qa` 显示
- [ ] 4.15 `@performance-expert` 显示

### 第五阶段:测试调用 + 启动 Phase 1(10 分钟)

#### 5.1 单个 Subagent 测试

- [ ] 5.1.1 `@product-architect 输出项目架构评估报告`
- [ ] 5.1.2 `@ui-designer 评估现有 UI 的水墨色系一致性`
- [ ] 5.1.3 `@api-test-pro 为现有 API 生成测试用例`
- [ ] 5.1.4 `@performance-expert 分析当前项目的性能瓶颈`
- [ ] 5.1.5 `@auth-oauth 输出飞书OAuth 2.0完整流程图(Mermaid sequenceDiagram)`

#### 5.2 MCP 调用测试

- [ ] 5.2.1 GitHub MCP:`@Agent 使用 GitHub MCP 列出我的仓库`
- [ ] 5.2.2 飞书 MCP:`@Agent 使用飞书 MCP 查询当前认证状态`

#### 5.3 自动调度测试(Phase 1 启动指令)

执行以下指令测试 Agent 自动协调能力:

```
@Agent 启动丹青有AI Phase 1,按以下顺序执行:
1. product-architect 完善 PRD 与 API 契约
2. auth-oauth 设计飞书 OAuth 流程
3. backend-service 重构后端 + 实现 OAuth
4. frontend-app 实现飞书登录前端
5. api-test-pro 生成测试
6. performance-expert 性能验证

要求:
- 每完成一个任务,输出验收报告
- 跨 Subagent 协作时,先确认接口契约
- 严格遵循水墨色系与 3 秒 SLA 约束
```

预期行为:
- [ ] 5.3.1 Agent 调用 `product-architect` 设计 API 契约
- [ ] 5.3.2 Agent 调用 `auth-oauth` 设计 OAuth 流程
- [ ] 5.3.3 Agent 调用 `backend-service` 实现后端
- [ ] 5.3.4 Agent 调用 `frontend-app` 实现前端
- [ ] 5.3.5 Agent 调用 `api-test-pro` 生成测试

---

## 五、令牌安全规范

### ✅ 必须做
- [ ] GitHub PAT 保存到密码管理器(1Password/Bitwarden)
- [ ] 飞书 App Secret 保存到密码管理器
- [ ] 代码中通过 `process.env.GITHUB_TOKEN` / `process.env.FEISHU_APP_SECRET` 读取
- [ ] `.env` 文件已被 `.gitignore` 忽略
- [ ] CI/CD 中用 GitHub Secrets 存储敏感信息
- [ ] 90 天到期前重新生成令牌

### ❌ 禁止做
- 把令牌写入代码或提交到 Git
- 在聊天/日志中输出令牌
- 使用 Classic token + 全权限
- 在公网传输 HTTP(必须 HTTPS)
- 多个项目共用一个令牌

---

## 六、常见问题排查

### Q1:Subagent 没有被调用?

1. 检查 设置 → Beta → Subagents 开关已打开
2. 检查 文件路径:`.trae/agents/{name}.md` 在项目根目录下
3. 检查 `name` 字段:字母开头,含字母/数字/连字符,≤50字符
4. 检查 `description` 字段存在且具体
5. 检查 frontmatter 格式:标准 YAML,以 `---` 开头和结束,无 BOM
6. **重启 TRAE IDE**

### Q2:Subagent 调用了但行为不符合预期?

1. `tools` 字段工具是否过多或不足(遵循最小权限)
2. Prompt 是否有歧义(任务边界、输出格式、禁止事项)
3. 是否存在同名 Subagent(项目级覆盖用户级)
4. 是否需要补充项目背景、技术栈、代码风格
5. MCP 调用时,`mcpServers` 名称是否与 IDE 配置一致(区分大小写)

### Q3:MCP 调用失败?

1. MCP Server 已在 IDE 中配置并启用
2. 令牌未过期(90天有效期)
3. 令牌权限足够(GitHub:Contents/Issues/PR read+write)
4. 网络连接正常
5. 飞书应用权限已开通且审核通过

### Q4:飞书 OAuth 回调失败?

1. 重定向 URL 已在飞书应用安全设置中配置
2. URL 必须完全匹配(包括 http/https、端口、路径)
3. 飞书应用处于"开发中"状态时,只能添加测试用户
4. 正式使用需提交审核(1-3天)

---

## 七、参考文档

- 配置完整指南:[`../agents/CONFIG-GUIDE.md`](../agents/CONFIG-GUIDE.md)
- Subagent 索引:[`../agents/README.md`](../agents/README.md)
- 项目 PRD:[`./prd.md`](./prd.md)
- 技术架构:[`./tech_arch.md`](./tech_arch.md)
- TRAE 官方 Subagent 文档:https://docs.trae.cn/ide_subagents
- TRAE 官方 MCP 文档:https://docs.trae.cn/ide/model-context-protocol
