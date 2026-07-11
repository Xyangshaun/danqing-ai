# 丹青有AI - AI作业诊断系统

> 专为高校艺术教育场景设计的AI创作诊断系统，支持绘画、设计、产品设计、雕塑等多种创作形式，让每一份创作都得到专业的点评与指导。

## 项目简介

「丹青有AI」是一个面向高校艺术教育的AI助教系统，核心功能涵盖作品智能诊断、课堂素材生成、中式美学风格库、灵感嫁接和情绪画布等。系统通过AI技术为学生的绘画、设计、产品设计、雕塑作品提供构图分析、色彩诊断、原创性检测等三维度专业点评，并给出具体的、可操作的改进建议。

### 核心功能

| 功能 | 说明 |
|------|------|
| **智绘镜** | 智能感知作品复杂度，3秒内完成构图、色彩、原创性三维度诊断 |
| **课堂素材生成器** | 输入课程主题，自动生成多组教学参考素材 |
| **中式美学风格库** | 内置水墨、青绿山水等非遗风格，一键转换草图风格 |
| **灵感嫁接** | 上传两张作品，AI提取元素融合，8种风格×6种方法×4级强度 |
| **情绪画布** | 输入情绪关键词，AI生成对应色调的参考画面 |
| **成长追踪** | 记录每次诊断数据，生成能力变化曲线和最佳作品 |

### 技术栈

- **前端框架**：React 18 + TypeScript
- **构建工具**：Vite 5
- **样式方案**：Tailwind CSS 3
- **路由管理**：React Router v6
- **图标库**：Lucide React
- **图表库**：Recharts

## 在线访问

- **Vercel 部署**：https://6a4f01878de2462eddd4b61e.vercel.app
- **GitHub 仓库**：https://github.com/Xyangshaun/danqing-ai

## 本地开发

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

开发服务器默认运行在 `http://localhost:5173`。

## 部署指南

### 方式一：Vercel 部署（推荐）

1. 将代码推送到 GitHub 仓库
2. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
3. 点击 "Add New..." → "Project"
4. 导入 GitHub 仓库，Vercel 自动识别 Vite 框架
5. 点击 "Deploy"，等待构建完成
6. 部署成功后获得公开访问链接

**命令行部署**：
```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录并部署
vercel --prod --yes
```

### 方式二：GitHub Pages 部署

#### 步骤 1：修改 vite.config.ts（已完成）

确保 `vite.config.ts` 中配置了相对路径：
```typescript
export default defineConfig({
  plugins: [react()],
  base: './',
})
```

#### 步骤 2：构建项目

```bash
npm run build
```

构建产物在 `dist/` 目录，包含：
- `index.html` — 入口 HTML
- `assets/index-*.css` — 样式文件
- `assets/index-*.js` — JavaScript 脚本
- `404.html` — SPA 路由回退页面（复制自 index.html）

#### 步骤 3：添加 404.html（SPA 路由支持）

```bash
# 复制 index.html 为 404.html，确保子路由不会 404
cp dist/index.html dist/404.html
```

#### 步骤 4：推送 dist 到 gh-pages 分支

```bash
# 进入 dist 目录
cd dist

# 初始化 git 并推送到 gh-pages 分支
git init
git add -A
git commit -m "deploy: GitHub Pages 部署"
git push -f https://github.com/<你的用户名>/danqing-ai.git main:gh-pages

# 返回项目根目录
cd ..
```

#### 步骤 5：启用 GitHub Pages

1. 打开 GitHub 仓库 → **Settings** → **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `gh-pages`，文件夹选 `/ (root)`
4. 点击 **Save**
5. 等待 1-2 分钟，访问 `https://<你的用户名>.github.io/danqing-ai/`

> **注意**：GitHub Pages 生效需要 1-2 分钟，首次部署可能需要等待 DNS 缓存刷新。

#### 一键部署脚本

项目根目录已包含 `deploy-gh-pages.cjs` 脚本，可一键完成步骤 2-4：

```bash
# 修改脚本中的用户名为你的 GitHub 用户名，然后执行
node deploy-gh-pages.cjs
```

### 方式三：直接提交构建产物

```bash
npm run build
```

将 `dist/` 目录打包为 ZIP 文件提交即可，评委可直接打开 `index.html` 体验。

## 项目结构

```
danqing-ai/
├── src/
│   ├── components/          # 公共组件
│   │   ├── Header.tsx       # 顶部导航栏
│   │   ├── Footer.tsx       # 底部信息栏
│   │   └── HeatmapCanvas.tsx # 热力图画布组件
│   ├── pages/               # 页面组件
│   │   ├── HomePage.tsx     # 首页
│   │   ├── AnalysisPage.tsx # AI诊断页
│   │   ├── MaterialsPage.tsx# 素材库页
│   │   ├── StylesPage.tsx   # 风格库页
│   │   ├── FusePage.tsx     # 灵感嫁接页
│   │   ├── EmotionPage.tsx  # 情绪画布页
│   │   ├── HistoryPage.tsx  # 历史记录页
│   │   └── GrowthPage.tsx   # 成长曲线页
│   ├── services/            # 业务逻辑层
│   │   ├── analysisService.ts    # 分析服务
│   │   ├── artworksDatabase.ts  # 艺术作品数据库（99件）
│   │   ├── fuseStandards.ts     # 灵感嫁接标准系统
│   │   ├── imageService.ts      # 图片生成服务
│   │   ├── mockData.ts          # 模拟数据
│   │   └── smartAnalysisEngine.ts # 智能分析引擎
│   ├── types/               # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.tsx              # 根组件（路由配置）
│   ├── main.tsx             # 应用入口
│   └── index.css            # 全局样式
├── index.html               # HTML 入口
├── vite.config.ts           # Vite 配置
├── tailwind.config.js       # Tailwind CSS 配置
├── tsconfig.json            # TypeScript 配置
├── vercel.json              # Vercel 部署配置
└── package.json             # 项目依赖
```

## 联系方式

- **邮箱**：2692963779@qq.com
- **地址**：吉林省通化市

## 版权

© 2026 丹青有AI - AI作业诊断系统
