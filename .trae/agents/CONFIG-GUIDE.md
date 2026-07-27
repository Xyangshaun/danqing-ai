# 丹青有AI - TRAE IDE 配置完整指南

> **用途**:本文件是上下文日志,供你在 TRAE IDE 中按步骤完成 Agent/MCP 配置时参考。
>
> **生成时间**:2026-07-26
> **项目路径**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`

---

## 📋 项目背景速览

**项目名称**:丹青有AI - 高校艺术教育AI作业诊断系统

**业务领域**:支持绘画/设计/产品设计/雕塑多形态分析,3秒内完成AI诊断

**现有技术栈**:
- 前端:React 18.2 + TypeScript 5.3 + Vite 5.1 + Tailwind CSS
- 后端:Express.js(单文件,待重构)
- 已完成:9个业务页面 + 三栏专业软件布局

**扩展目标**:多端产品矩阵
- Web 应用(学生/教师端)
- 产品官网(Next.js)
- 移动端 App(React Native)
- 管理后台(Ant Design Pro)
- 飞书账号登录

**设计规范**:水墨色系
- 墨黑 `#1a1a1a`
- 宣纸白 `#f5f1e8`
- 朱砂红 `#c8392c`
- 青绿 `#5a8a7a`

---

## 🎯 配置总览(4 大步骤)

```
步骤1:启用 Subagent 功能          (5分钟)
步骤2:安装 MCP Server + 填令牌    (30分钟)
步骤3:验证 13 个 Subagent 加载    (5分钟)
步骤4:测试调用 + 启动 Phase 1     (10分钟)
```

---

## ✅ 步骤1:启用 Subagent 功能

### 操作路径
```
TRAE IDE → 设置 → Beta → Subagents → 启用 Subagents 目录
```

### 验证
- 开关变为"已启用"
- 重启 TRAE IDE 后生效

### Subagent 文件位置
项目级 Subagent 已就绪,路径:
```
.trae/agents/
├── README.md                          # 索引文档
├── 01-product-architect.md            # 产品架构师
├── 02-frontend-app.md                 # 前端应用
├── 03-backend-service.md              # 后端服务
├── 04-marketing-website.md            # 产品官网
├── 05-mobile-app.md                   # 移动端
├── 06-admin-dashboard.md              # 管理后台
├── 07-auth-oauth.md                   # 认证授权
├── 08-devops-qa.md                    # DevOps
├── 09-ui-designer.md                  # UI设计师
├── 10-api-test-pro.md                 # API测试
├── 11-ai-integration-engineer.md      # AI集成
├── 12-performance-expert.md           # 性能优化
└── 13-compliance-checker.md           # 合规审查
```

### 文件格式说明(已按官方规范编写)
```markdown
---
name: agent-identifier
description: 描述何时调用此 Subagent
model: glm-5.2
tools: Read, Write, Edit, Glob, Grep
disallowedTools: Bash
mcpServers:
  - GitHub
---

系统提示词(纯文本)
```

---

## 🔧 步骤2:安装 MCP Server

### MCP 清单(共3个)

| MCP Server | 必要性 | 用途 | 启用 Agent |
|---|---|---|---|
| GitHub | ✅ 必装 | PR/Issue/Actions | 全部 13 个 |
| 飞书(lark-cli) | ✅ 必装 | OAuth/消息/通讯录 | 03/05/06/07/08 |
| Vercel | ⚠️ 选装 | 部署 | 04/08 |

---

### 2.1 安装 GitHub MCP

#### 第一步:获取 GitHub Token

1. 登录 [GitHub](https://github.com/) → Settings → Developer settings
2. Personal access tokens → **Fine-grained tokens** → Generate new token
3. 填写配置:
   - Token name:`danqing-ai-mcp`
   - Expiration:`90 days`
   - Resource owner:你的用户名
   - Repository access:All repositories 或指定仓库
4. **权限勾选**(关键):
   - Contents: Read and write
   - Issues: Read and write
   - Pull requests: Read and write
   - Metadata: Read-only(自动勾)
   - Actions: Read-only
   - Commit statuses: Read-only
5. Generate token
6. **立即复制** token(格式如 `github_pat_xxxxxxxxxxxx`)

#### 第二步:在 TRAE IDE 安装

1. TRAE IDE → AI 面板 → 齿轮图标 → **MCP**
2. 点击"添加 MCP Servers"
3. 进入市场搜索 "GitHub"
4. 安装以下两个(功能互补):
   - `mcp_plugin_GitHub_github`(全流程:Issue/Actions/Release)
   - `mcp_GitHub`(代码协作:Review/分支)
5. 弹出配置框,填入 GitHub PAT
6. 保存

#### 验证
```bash
# 在对话中测试
@Agent 使用 GitHub MCP 列出我的仓库
```

---

### 2.2 安装飞书 MCP

#### 第一步:注册飞书自建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 登录飞书账号(个人也可)
3. 点击"创建企业自建应用"
   - 应用名称:`丹青有AI`
   - 应用描述:`高校艺术教育AI作业诊断系统`
4. 创建完成后获取凭证:
   - **App ID**:格式如 `cli_xxxxxxxxxxxx`
   - **App Secret**:格式如 `xxxxxxxxxxxxxxxxxxxxxxxxxx`(点击显示)
5. **立即保存两个凭证**(App Secret 只显示一次)

#### 第二步:配置应用权限

进入应用 → 权限管理 → 开通以下权限:

| 权限名称 | 权限标识 | 用途 |
|---|---|---|
| 获取用户基本信息 | `contact:user.base:readonly` | 登录后获取用户信息 |
| 获取用户邮箱 | `contact:user.email:readonly` | 注册账号 |
| 获取用户手机号 | `contact:user.phone:readonly` | 注册账号 |
| 获取通讯录部门信息 | `contact:department:readonly` | 组织架构同步 |
| 以应用身份发消息 | `im:message:send_as_bot` | 推送通知 |
| 获取群组信息 | `im:chat:readonly` | 群管理 |
| 读取用户发出的消息 | `im:message:readonly` | 消息记录 |

#### 第三步:配置 OAuth 重定向地址

进入应用 → 安全设置 → 添加重定向 URL:

```
Web 端回调:
http://localhost:5173/auth/feishu/callback
https://你的域名/auth/feishu/callback

管理后台回调:
http://localhost:3001/auth/feishu/callback
https://admin.你的域名/auth/feishu/callback
```

#### 第四步:在 TRAE IDE 安装

1. TRAE IDE → MCP → 添加 → 市场搜索 "飞书" 或 "lark"
2. 安装飞书 MCP
3. 填入 App ID + App Secret
4. 保存

#### 验证
```bash
# 在对话中测试
@Agent 使用飞书 MCP 查询当前认证状态
```

---

### 2.3 安装 Vercel MCP(选装,Phase 2 再装)

#### 获取 Vercel Token
1. 登录 [Vercel](https://vercel.com/) → 头像 → Settings
2. 左侧 Tokens → Create
3. Token Name:`danqing-ai-deploy`
4. Scope:Full Access 或指定团队
5. Expiration:90 days
6. Create → 立即复制 token

#### 在 TRAE IDE 安装
1. MCP → 市场搜索 "Vercel"
2. 安装 → 填入 Vercel Token
3. 保存

---

## 📊 步骤3:验证 13 个 Subagent 加载

### 重启 TRAE IDE
关闭并重新打开 TRAE IDE,确保 Subagent 配置被重新加载。

### 验证 Subagent 列表

在对话输入框中输入 `@`,应该看到以下 13 个 Subagent:

#### 🏛️ 协调与设计类(3 个)
- [ ] `@product-architect` - 产品架构师
- [ ] `@ui-designer` - UI/UX 设计师
- [ ] `@compliance-checker` - 合规审查员

#### 💻 开发实施类(5 个)
- [ ] `@frontend-app` - React Web 应用
- [ ] `@backend-service` - Node.js 后端
- [ ] `@marketing-website` - Next.js 官网
- [ ] `@mobile-app` - React Native 移动端
- [ ] `@admin-dashboard` - Ant Design Pro 后台

#### 🔐 安全与测试类(3 个)
- [ ] `@auth-oauth` - 飞书 OAuth + 权限
- [ ] `@api-test-pro` - API 测试
- [ ] `@ai-integration-engineer` - AI 集成

#### 🚀 运维与优化类(2 个)
- [ ] `@devops-qa` - DevOps + CI/CD
- [ ] `@performance-expert` - 性能优化

### 排查清单(如果 Subagent 未加载)

| 检查项 | 排查方法 |
|---|---|
| 功能开关 | 设置 → Beta → Subagents 开关已打开 |
| 文件路径 | 确认 `.trae/agents/` 目录在项目根目录下 |
| name 合法性 | 必须字母开头,只含字母/数字/连字符,≤50字符 |
| description 存在 | 缺少 description 的文件不会被解析 |
| frontmatter 格式 | 必须以 `---` 开头和结束,无 BOM |
| MCP 名称一致 | `mcpServers` 中的名称必须与 IDE 中配置的 MCP 一致 |

---

## 🚀 步骤4:测试调用 + 启动 Phase 1

### 4.1 单个 Subagent 测试

依次测试各 Subagent 是否正常工作:

```
@product-architect 输出项目架构评估报告

@ui-designer 评估现有 UI 的水墨色系一致性

@api-test-pro 为现有 API 生成测试用例

@performance-expert 分析当前项目的性能瓶颈

@auth-oauth 输出飞书OAuth 2.0完整流程图(Mermaid sequenceDiagram)
```

### 4.2 让 Agent 自动调度(推荐)

测试 Agent 自动调用多个 Subagent 的能力:

```
@Agent 我需要实现飞书登录功能,从前端到后端到数据库,请协调各 Subagent 完成
```

预期行为:
1. Agent 调用 `product-architect` 设计 API 契约
2. Agent 调用 `auth-oauth` 设计 OAuth 流程
3. Agent 调用 `backend-service` 实现后端
4. Agent 调用 `frontend-app` 实现前端
5. Agent 调用 `api-test-pro` 生成测试

---

## 📋 13 个 Subagent 完整配置速查

### 协调与设计类

#### 1. product-architect(产品架构师)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, TodoWrite, WebSearch, WebFetch, Skill
- **禁用**:Bash
- **MCP**:GitHub
- **文件范围**:`.trae/documents/`
- **调用场景**:需求拆解、跨端协议设计、架构文档维护、API契约定义

#### 9. ui-designer(UI设计师)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, TodoWrite, WebSearch, WebFetch, Skill
- **禁用**:Bash
- **MCP**:GitHub
- **调用场景**:UI界面设计、组件库设计、视觉层级优化、水墨色系规范

#### 13. compliance-checker(合规审查员)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, TodoWrite, WebSearch, WebFetch, Skill
- **禁用**:Bash
- **MCP**:GitHub
- **调用场景**:隐私政策审查、学生数据合规、GDPR/PIPL评估

### 开发实施类

#### 2. frontend-app(前端应用)
- **模型**:Doubao_1_6
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, Skill, LSP
- **MCP**:GitHub
- **文件范围**:`src/`(`src/types/index.ts` 只读)
- **调用场景**:Web应用功能开发、API接入、UI优化、飞书登录前端

#### 3. backend-service(后端服务)
- **模型**:Doubao_1_6
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill, LSP
- **MCP**:GitHub
- **文件范围**:`server/`, `prisma/`
- **调用场景**:后端API开发、数据库设计、飞书OAuth后端、AI任务调度

#### 4. marketing-website(产品官网)
- **模型**:Doubao_1_6
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **文件范围**:独立 Next.js 项目
- **调用场景**:品牌官网建设、SEO优化、转化漏斗设计

#### 5. mobile-app(移动端)
- **模型**:Doubao_1_6
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **文件范围**:`packages/mobile/`, `packages/shared/`(只读)
- **调用场景**:移动端App开发、飞书移动SDK集成、性能优化

#### 6. admin-dashboard(管理后台)
- **模型**:Doubao_1_6
- **工具**:Read, Write, Edit, Glob, Grep, Bash, WebFetch, Skill
- **MCP**:GitHub
- **文件范围**:独立 admin 项目
- **调用场景**:运营后台开发、用户管理、数据看板、权限管理

### 安全与测试类

#### 7. auth-oauth(认证授权)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **文件范围**:`server/auth/`, `.trae/documents/security.md`
- **调用场景**:飞书OAuth、SSO、多租户权限、JWT/Redis会话、安全策略

#### 10. api-test-pro(API测试)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch, Skill
- **MCP**:GitHub
- **调用场景**:API测试用例、功能验证、性能SLA测试、契约检查

#### 11. ai-integration-engineer(AI集成)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **调用场景**:AI模型接入、作业诊断算法、推荐系统、模型部署

### 运维与优化类

#### 8. devops-qa(DevOps)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **文件范围**:`.github/workflows/`, `Dockerfile`, `docker-compose.yml`, `vercel.json`
- **调用场景**:CI/CD流水线、多端部署、监控告警、自动化测试

#### 12. performance-expert(性能优化)
- **模型**:glm-5.2
- **工具**:Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebSearch, WebFetch, Skill
- **MCP**:GitHub
- **调用场景**:性能问题排查、3秒SLA保障、性能基准测试、系统优化

---

## 🎯 Phase 1 启动指引

### Phase 1 目标
完成"丹青有AI"多端产品矩阵的架构设计与飞书登录闭环。

### Phase 1 任务清单

| 任务 ID | 任务 | 负责 Subagent | 验收标准 |
|---|---|---|---|
| P1-01 | 完善 PRD 与技术架构文档 | product-architect | 文档更新到 .trae/documents/ |
| P1-02 | 定义跨端 API 契约 | product-architect | OpenAPI 3.0 + TypeScript interface |
| P1-03 | 设计统一数据模型 | product-architect | Prisma schema |
| P1-04 | 设计飞书 OAuth 完整流程 | auth-oauth | Mermaid 流程图 + .trae/documents/security.md |
| P1-05 | 重构后端为分层架构 | backend-service | server/src/{controllers,services,...} |
| P1-06 | 设计 Prisma schema | backend-service | prisma/schema.prisma |
| P1-07 | 实现飞书 OAuth 后端 | backend-service + auth-oauth | /auth/feishu/* 三个端点 |
| P1-08 | 实现飞书登录前端 | frontend-app | 登录页 + 路由守卫 + token管理 |
| P1-09 | 为 OAuth 接口生成测试 | api-test-pro | Vitest + Supertest 测试用例 |
| P1-10 | 性能基准测试 | performance-expert | 3秒SLA验证报告 |

### 启动命令

在 TRAE IDE 中执行以下命令启动 Phase 1:

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

---

## 🔑 令牌安全规范

### ✅ 必须做
- [ ] GitHub PAT 保存到密码管理器(1Password/Bitwarden)
- [ ] 飞书 App Secret 保存到密码管理器
- [ ] 代码中通过 `process.env.GITHUB_TOKEN` 读取
- [ ] `.env` 文件已被 `.gitignore` 忽略
- [ ] CI/CD 中用 GitHub Secrets 存储敏感信息
- [ ] 90 天到期前重新生成令牌

### ❌ 禁止做
- [ ] 把令牌写入代码或提交到 Git
- [ ] 在聊天/日志中输出令牌
- [ ] 使用 Classic token + 全权限
- [ ] 在公网传输 HTTP(必须 HTTPS)
- [ ] 多个项目共用一个令牌

---

## 📞 常见问题排查

### Q1:Subagent 没有被调用?
**A**:检查以下项:
1. 设置 → Beta → Subagents 开关已打开
2. 文件路径正确:`.trae/agents/{name}.md`
3. `name` 字段合法:字母开头,含字母/数字/连字符,≤50字符
4. `description` 字段存在且具体
5. frontmatter 格式正确:标准 YAML,以 `---` 开头和结束,无 BOM

### Q2:Subagent 调用了但行为不符合预期?
**A**:检查以下项:
1. `tools` 字段工具是否过多或不足(遵循最小权限)
2. Prompt 是否有歧义(任务边界、输出格式、禁止事项)
3. 是否存在同名 Subagent(项目级覆盖用户级)
4. 是否需要补充项目背景、技术栈、代码风格
5. MCP 调用时,`mcpServers` 名称是否与 IDE 配置一致

### Q3:MCP 调用失败?
**A**:检查以下项:
1. MCP Server 已在 IDE 中配置并启用
2. 令牌未过期(90天有效期)
3. 令牌权限足够(GitHub:Contents/Issues/PR read+write)
4. 网络连接正常
5. 飞书应用权限已开通且审核通过

### Q4:飞书 OAuth 回调失败?
**A**:检查以下项:
1. 重定向 URL 已在飞书应用安全设置中配置
2. URL 必须完全匹配(包括 http/https、端口、路径)
3. 飞书应用处于"开发中"状态时,只能添加测试用户
4. 正式使用需提交审核(1-3天)

---

## 🎉 配置完成检查清单

### 第一步:启用 Subagent
- [ ] 设置 → Beta → 启用 Subagents 目录
- [ ] 重启 TRAE IDE

### 第二步:安装 MCP
- [ ] 安装 GitHub MCP(填入 Fine-grained PAT)
- [ ] 安装飞书 MCP(填入 App ID + App Secret)
- [ ] (可选)安装 Vercel MCP

### 第三步:验证 Subagent
- [ ] 对话中输入 `@`,看到 13 个 Subagent
- [ ] 测试 `@product-architect` 响应正常
- [ ] 测试 `@ui-designer` 响应正常
- [ ] 测试 `@api-test-pro` 响应正常

### 第四步:测试 MCP
- [ ] GitHub MCP 能列出仓库
- [ ] 飞书 MCP 能查询认证状态

### 第五步:启动 Phase 1
- [ ] 执行"启动命令"中的 Phase 1 指令
- [ ] 各 Subagent 协同工作正常
- [ ] 输出验收报告

---

## 📚 官方文档参考

- [TRAE 智能体概述](https://docs.trae.cn/ide_agent-overview)
- [创建并管理自定义智能体](https://docs.trae.cn/ide_agent)
- [内置智能体:Agent](https://docs.trae.cn/ide_built-in-agent)
- [子智能体 Subagent](https://docs.trae.cn/ide_subagents)
- [支持一键导入的自定义智能体](https://docs.trae.cn/ide/custom-agents-ready-for-one-click-import)
- [模型上下文协议 MCP](https://docs.trae.cn/ide/model-context-protocol)

---

## 📝 备注

- 本文档基于 TRAE 官方文档 2026-07-26 版本编写
- 13 个 Subagent 文件已就绪,路径:`.trae/agents/`
- 如需调整任何 Subagent 配置,直接编辑对应 `.md` 文件,重启 IDE 生效
- 项目级 Subagent 优先级高于用户级,可覆盖同名 Subagent

**祝你配置顺利!**
