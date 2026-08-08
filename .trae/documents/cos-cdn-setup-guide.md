# 方案 B · 腾讯云 COS + CDN 图片加速配置教程

> 目的:把官网开屏动画、Hero、画廊等图片资源迁移到腾讯云对象存储(COS),并接入 CDN 加速分发,
> 缓解"访问网站动画加载卡顿、返回官网慢"的问题。当前线上仍走本地资源(未启用 CDN),
> 本教程用于准备凭据并启用 CDN。启用后 `ResilientImage` 会自动优先从 CDN 加载,CDN 异常时
> 自动回退到本地资源,不会影响线上可用性。

---

## 一、你需要准备的东西(共 4 项)

| 项目 | 说明 | 示例 |
|------|------|------|
| `COS_SECRET_ID` | 腾讯云 API 密钥 · 访问密钥 ID | `AKIDxxxxxxxxxxxxxxxx` |
| `COS_SECRET_KEY` | 腾讯云 API 密钥 · 访问密钥 Key | `wJalrXUtnFEMIxxx` |
| `COS_BUCKET` | 存储桶名称(含 APPID) | `danqing-ai-1250000000` |
| `COS_REGION` | 存储桶所在地域 | `ap-guangzhou` |

> 另需一个 CDN 加速域名(可选,推荐),用于给图片做边缘缓存加速,如 `cdn.danqing.site`。

---

## 二、获取 API 密钥(SecretId / SecretKey)

1. 登录[腾讯云控制台](https://console.cloud.tencent.com/)。
2. 右上角头像 → **访问管理 CAM**。
3. 左侧菜单 **访问密钥 → API 密钥管理**。
4. 点击 **新建密钥**,系统会生成一对 `SecretId` 和 `SecretKey`。
   - `SecretId`:以 `AKID` 开头的一串字符。
   - `SecretKey`:较长的一串字符。
5. ⚠️ **安全提醒**:
   - `SecretKey` 仅创建时完整显示一次,请立即复制保存。
   - 切勿把密钥提交到 Git / 仓库 / 前端代码。本项目只在本地 `.env` 使用,不随构建产物分发。

---

## 三、创建存储桶(Bucket)

1. 进入[对象存储 COS 控制台](https://console.cloud.tencent.com/cos)。
2. 点击 **创建存储桶**。
3. 填写:
   - **名称**:如 `danqing-ai`(系统会自动追加你的 APPID,形成 `danqing-ai-1250000000`)。
   - **地域**:选择离你用户最近的,如 `ap-guangzhou`(广州)。
   - **访问权限**:建议 **公有读私有写**(`public-read`)——图片需被公开访问,写入走密钥。
     - 若担心被刷,也可选**私有读写**,再通过 CDN 私有鉴权或防盗链保护(推荐进阶方案)。
4. 创建完成后,在存储桶列表里记录 **存储桶名称** 和 **所属地域**。

---

## 四、配置 CDN 加速域名(推荐)

COS 自带默认访问域名 `xxx.cos.ap-guangzhou.myqcloud.com`,但走外网直连源站、无边缘缓存。
接 CDN 后图片会在全国边缘节点缓存,大幅降低首屏/动画卡顿。

1. 在 COS 存储桶详情 → **域名管理 → 自定义 CDN 加速域名 → 添加域名**。
2. 填写加速域名,如 `cdn.danqing.site`。
   - 需要该域名已在腾讯云完成 ICP 备案。
3. 回源配置:源站类型选 **COS**,源站地址自动指向本存储桶。
4. 缓存配置:对 `images/*` 建议缓存时长设长(如 30 天)并开启**强制缓存**,因为图片文件名恒定不变。
5. 添加完成后,去域名服务商(腾讯云 DNSPod 等)为该域名加一条 **CNAME** 记录,指向 CDN 提供的 CNAME 地址(形如 `cdn.danqing.site.cdn.dnsv1.com`)。
6. 等待 CNAME 生效(几分钟~几小时),用 `ping` 或 `nslookup` 验证已解析到腾讯 CDN 节点。

---

## 五、把凭据填入本地 `.env`(website 目录)

在 `website/.env` 添加(若不存在则新建;**切勿提交到 Git**):

```dotenv
# COS(方案 B · 对象存储 + CDN)
COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
COS_BUCKET=danqing-ai-1250000000
COS_REGION=ap-guangzhou
```

> 注意:`.env` 不应入库。检查 `.gitignore` 是否已忽略 `.env`,若没有请加上。

---

## 六、上传图片到 COS

在 `website/` 目录执行(自动读取上一步的 `.env`):

```bash
npm run cdn:upload
```

脚本会把 `public/images/gallery-*.jpg|webp` 增量上传到存储桶的 `images/` 前缀下,
并自动带 CDN 缓存头(`public, max-age=31536000, immutable`)。

- 重复运行安全:已存在且大小一致的对象会跳过。
- 强制全量重传(例如改图后):`npm run cdn:upload:force`

上传完成后,可在 COS 控制台 → 存储桶 → `images/` 目录看到上传的图片。
用浏览器访问 CDN 域名验证,如 `https://cdn.danqing.site/images/gallery-hero.webp`。

---

## 七、启用官网 CDN(前端接入)

官网(Next.js 静态导出)通过构建期环境变量注入 CDN 地址,在 `website/.env` 添加:

```dotenv
NEXT_PUBLIC_IMAGE_CDN_BASE=https://cdn.danqing.site
```

重新构建并部署后,所有 `ResilientImage` 会优先从 `https://cdn.danqing.site` 加载 webp 图片,
加载失败或超过 4 秒未完成时自动回退到本地服务器资源(`/images/...`)。

> 该变量以 `NEXT_PUBLIC_` 前缀在构建期被内联进产物。**未配置时 CDN 不启用,仅用本地资源**——这也是当前线上状态,保证不配凭据也能正常运行。

---

## 八、验证与切换

### 验证 CDN 生效
```bash
# 看响应头是否来自 CDN 缓存、Cache-Control 是否为 long
curl -sI https://cdn.danqing.site/images/gallery-hero.webp
```

### 启用 / 停用备用方案
- **启用**:填好 `NEXT_PUBLIC_IMAGE_CDN_BASE` → 构建部署 → 前端自动优先 CDN。
- **停用(回退本地)**:删除或清空 `NEXT_PUBLIC_IMAGE_CDN_BASE` → 重新构建部署,所有图片走本地服务器。
- **紧急止血**:即使 CDN 域名挂了,`ResilientImage` 也会在出错/超时后自动用本地资源,无需人工干预。

---

## 九、常见问题

| 问题 | 处理 |
|------|------|
| 上传报错 `AccessDenied` | 检查 `COS_SECRET_ID/KEY` 是否正确、存储桶名是否含 APPID |
| 上传报错 `NoSuchBucket` | 存储桶名或地域填错,核对 COS 控制台 |
| 域名无法访问 | CNAME 未生效 / 未备案 / 未配置回源,检查 CDN 域名解析 |
| 图片没走 CDN | `NEXT_PUBLIC_IMAGE_CDN_BASE` 未在构建期设置,需重新构建部署 |
| 担心 COS 被刷流量 | 升级为私有读写 + CDN 鉴权,或在 CDN 配置防盗链/流量封顶 |
