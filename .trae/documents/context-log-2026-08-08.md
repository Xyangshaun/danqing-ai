# 丹青有AI · 深度上下文总结 (2026-08-08)

> **文档用途**:压缩上下文后继续开发的核心衔接文档。记录当前项目状态、最近修改、待开发功能、最近部署,以及方案 B(COS+CDN)与服务器 COS 挂载最新信息。
> **生成时间**:2026-08-08
> **工作目录**:`c:\Users\26929\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a4f01878de2462eddd4b61e`
> **生产服务器**:43.128.25.202 (腾讯云 VPS, ubuntu@, 密钥 danqing.pem)
> **生产域名**:www.danqing.site (官网 `/` + 业务 `/app`)
> **仓库**:Xyangshaun/danqing-ai

---

## 〇、一句话结论

> **官网开屏动画/首页图片加载优化为主线的多次迭代已完成并部署;当前正在推进"方案 B —— 图片资源迁移到对象存储(COS)+ CDN 加速"作为备用方案。**
> 弹性图片组件 `ResilientImage`(CDN 优先、本地备用、失败/慢加载自动降级)已接入全部官网页面并通过构建;COS 上传脚本已就绪。**服务器已挂载 COS 存储桶 `danqing-1457640808` 到 `/lhcos-data`**,可用于直接放置/回源图片。

---

## 一、当前项目状态(压缩恢复基线)

| 端 | 目录 | 技术栈 | 部署形式 |
|----|------|--------|----------|
| Web 应用 | `src/` | React 18 + Vite 5 | 静态文件(Nginx `/app`) |
| 管理后台 | `admin/` | Ant Design Pro | 生产**未部署**(规划中,需新增 `/admin/` 路由) |
| 移动端 | `mobile/` | React Native | 待补充 |
| 品牌官网 | `website/` | Next.js 14(静态导出到 `out/`) | 静态文件(Nginx `/`) |
| 后端服务 | `server/` | Express 4 + TypeScript | Node 20 LTS(PM2 `danqing-api`) |

服务器关键路径:项目根 `/var/www/danqing-ai`,后端 `/var/www/danqing-ai/server`,前端静态 `/var/www/danqing-ai/dist`,官网 `/var/www/danqing-ai/website`,后端 `.env` `/var/www/danqing-ai/server/.env`,Nginx `/etc/nginx/conf.d/danqing.conf`。

---

## 二、最近修改(方案 B:COS + CDN 弹性图片加载)

> 目标:缓解"访问官网动画加载卡顿、返回官网慢"。当前线上仍走本地资源;启用 CDN 后自动优先 CDN,异常时回退本地,不影响可用性。

### 2.1 已完成的代码(本地,已构建验证通过)

| 文件 | 作用 |
|------|------|
| `website/lib/assetConfig.ts` | 读取 `NEXT_PUBLIC_IMAGE_CDN_BASE`(构建期),空则未启用 CDN;`IMAGE_SLOW_FALLBACK_MS=4000` |
| `website/components/ui/ResilientImage.tsx` | 弹性图片组件。来源链 `[CDN webp → CDN jpg → 本地 webp → 本地 jpg]`;onError 立即切下一来源;超 4s 未加载完自动切下一来源;全失败调 `onTotalFailure`(隐藏容器) |
| `website/scripts/upload-to-cos.mjs` | COS 批量上传脚本。增量上传 `public/images/gallery-*.jpg|webp` 到 `images/` 前缀,自动打 CDN 缓存头 `public, max-age=31536000, immutable`,并发 5,幂等可重跑,支持 `--force` |
| `website/package.json` | 新增 `cdn:upload` / `cdn:upload:force`;prebuild 含 `optimize-paintings.mjs`(JPG→WebP) |
| `website/components/home/VideoIntro.tsx` | 开屏动画 13 张画作改用 `<ResilientImage>`(传 `onTotalFailure` 隐藏破碎画作) |
| `website/components/home/Hero.tsx` | 主视觉改用 `<ResilientImage>` |
| `website/components/home/ArtGallery.tsx` | 画廊 4 幅改用 `<ResilientImage>` |
| `website/components/home/CreativeForms.tsx` | 绘画/设计/产品/雕塑卡改用 `<ResilientImage>`(雕塑卡仍有个遗留 `<img>` §遗留) |
| `website/app/about/page.tsx` `website/app/product/page.tsx` | 品牌配图改用 `<ResilientImage>` |
| `.trae/documents/cos-cdn-setup-guide.md` | COS 密钥获取、建桶、CDN 加速、启用/停用、故障排查完整教程 |

### 2.2 上传脚本用法(待凭据后执行)

```bash
cd website
# 凭据写入 website/.env (不入库):
#   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
npm run cdn:upload        # 增量上传
npm run cdn:upload:force  # 强制全量
```

### 2.3 启用官网 CDN(前端接入)

在 `website/.env` 加 `NEXT_PUBLIC_IMAGE_CDN_BASE=https://cdn.xxx` → 重新 `npm run build` 部署。未配置时 CDN 不启用,仅本地资源(当前线上状态)。

---

## 三、服务器 COS 挂载(最新信息,方案 B 关键)

> 用户提供,2026-08-08:
> - **存储桶**:`danqing-1457640808`(含 APPID 1457640808)
> - **服务器挂载目录**:`/lhcos-data`
> - **存储桶挂载目录**:`/lhcos-data`(COSFS 挂载到服务器本地路径)

**含义与用途**:
- 服务器已通过 COSFS 把 COS 存储桶 `danqing-1457640808` 挂载到本地 `/lhcos-data`。
- 这意味着:把官网图片放到服务器 `/lhcos-data/images/`,即等同于写入 COS 存储桶;Nginx 可直接从该目录回源图片,或作为对象存储源站。
- 与方案 B 的两种衔接方式:
  1. **直接回源**:Nginx 加 location 把 `/images/*` 指向 `/lhcos-data/images/`,图片落盘到挂载目录即完成迁移(无需 upload 脚本)。
  2. **CDN 源站**:CDN 回源地址指到挂载路径或 COS 默认域名,前端 `NEXT_PUBLIC_IMAGE_CDN_BASE` 指向 CDN 域名。
- ⚠️ 需确认:挂载是否已生效(`df -h` / `ls /lhcos-data`)、读写权限、是否在 `/etc/fstab` 持久化。

---

## 四、待开发 / 待完成任务

### 4.1 方案 B 收尾(当前主线)
- [ ] 确认服务器 `/lhcos-data` 挂载状态与读写权限
- [ ] 决定衔接方式:① 图片直接落盘到 `/lhcos-data/images/` + Nginx 回源;② 用 upload 脚本传 COS + CDN;③ 两者结合
- [ ] 若走 CDN:填 `NEXT_PUBLIC_IMAGE_CDN_BASE` → 构建 → 部署 → 验证 CDN 生效
- [ ] 验证 `ResilientImage` 降级机制(CDN 挂时自动回退本地)
- [ ] 清理 `CreativeForms.tsx` 雕塑卡遗留的 `<img>`(第 167 行,未换 ResilientImage)

### 4.2 其他规划中
- [ ] admin(Ant Design Pro)生产部署:需新增 `/admin/` Nginx 路由 + admin/dist 静态目录(核心基建变更,单独评估)
- [ ] 官网 `out/` 部署前必须重新 `npm run build`(dev server 会污染 `out/`);打包用 Windows bsdtar(`tar -czf`),禁用 `Compress-Archive`(反斜杠路径坑)
- [ ] 服务器 `dist/assets/` 旧 hash chunk 持续累积,可清理无引用旧 chunk
- [ ] 生产 `.env` 建议把硬编码 GLM key 改 KMS/Secret Manager 注入(遗留风险)
- [ ] `ALERT_*` 告警环境变量生产未显式配置(alertEnabled 默认 false)

---

## 五、最近部署(详见 deploy-runbook 对应章节)

| 章节 | 日期 | 内容 | 包/备份 | 部署日志 id |
|------|------|------|---------|------------|
| §16 | 08-08 | App P0-P4(情绪画布/灵感嫁接/结果工作台)+ /app base 修复 | `app-dist-20260808-4.tar.gz` | `fe666073` |
| §17 | 08-08 | Server dist 重建(openDisputes + 仲裁可观测性) | `server-dist-20260808-5.tar.gz` | `85a4260c` |
| §18 | 08-08 | 登录页返回官网 + 跳过开屏动画(双端静态) | `app-dist-20260808-5` / `website-out-20260808-4.tar.gz` | `bf36dba0` |
| §19 | 08-08 | 开屏动画手机端适配 + 加载健壮性 | `website-out-20260808-5.tar.gz` | `844640ec` |
| §20 | 08-08 | WebP 图片优化(13 张转 webp 省~30%) | `website-out-20260808-6.tar.gz` | `f78df49f` |

各部署回滚:官网 `rm -rf /var/www/danqing-ai/website && mv website-backup-YYYYMMDD-N website`;app `cp -r dist-backup-YYYYMMDD-N/* dist/`;server `cd server && rm -rf dist && mv dist.bak-* dist && pm2 restart danqing-api`。

---

## 六、关键教训 / 硬约束(压缩后必须遵守)

1. **部署包命名必须带日期轮次后缀**(如 `website-out-20260808-6.tar.gz`),通用名包用完即删,上传前 `tar -tzf` 核对关键 chunk。
2. **官网打包用 Windows 自带 bsdtar**:`tar -czf website-out.tar.gz -C website/out .`;**严禁 `Compress-Archive`**(PowerShell 反斜杠路径 → Linux 扁平化错文件名 → ChunkLoadError)。
3. **`out/` 会被 `next dev` 污染**:静态部署前必须重新 `npm run build`,以 `out/index.html` 存在为准;打包前校验 `out/cache`/`out/server`/`out/videos` 不存在。
4. **PowerShell 内联 ssh 多行命令易转义报错**:用本地写 bash 脚本 → `scp` → `ssh bash` 执行。
5. **双端构建串行执行**,以"chunk 含目标字符串"为准,不以 hash 为准。
6. **功能修改前必须备份 3-5 轮**(git tag `backup-YYYYMMDD-N` 或 server/dist.bak-*),删除旧文件仅在新文件可完整运行之后。
7. **生产部署遵守五阶段 S1-S5 + 三铁律**,写操作前先只读诊断、逐项确认(意图/后果/回滚/命令)。
8. **涉及核心基建**(技术栈/目录结构/DB 表结构/权限体系/支付)的改动需先暂停并出影响评估报告。

---

## 七、联系方式

| 项 | 值 |
|----|-----|
| 服务器 | 腾讯云 43.128.25.202 |
| SSH | ubuntu@43.128.25.202(danqing.pem) |
| 1Panel | http://43.128.25.202:20410 |
| GitHub | https://github.com/Xyangshaun/danqing-ai |
| COS 存储桶 | `danqing-1457640808`(挂 `/lhcos-data`) |

---

## 八、下一步(建议)

1. 先诊断服务器挂载:`ssh` 后 `df -h`、`ls -la /lhcos-data`、确认 COSFS 是否 `fstab` 持久化。
2. 由用户决策方案 B 衔接方式(直接回源 / CDN / 结合),再据此执行图片迁移与前端 CDN 变量配置。
3. 迁移后验证 `ResilientImage` 降级与线上加载速度。