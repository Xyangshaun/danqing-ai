#!/bin/bash
set -e

# ============================================================
# 丹青有AI 官网部署脚本(nginx 静态托管)
#
# 在服务器上运行,一键拉取最新代码、注入搜索引擎验证码、构建静态导出、
# 备份并同步到 nginx webroot、校验线上可访问。
#
# 使用:
#   sudo bash /var/www/danqing-ai/deploy-website.sh
#
# 可配置(环境变量):
#   REPO_DIR         git 仓库根目录(默认 /var/www/danqing-ai)
#   WEBSITE_DIR      官网源码目录(默认 $REPO_DIR/website)
#   WEBROOT          nginx 部署根目录(默认 $REPO_DIR/website)
#                    注:nginx root 指向 WEBROOT;若与源码同目录,
#                    脚本以"增量同步(不删除)"方式部署,避免误删源码。
#   BAIDU_VERIFICATION_CODE  百度站长验证码(优先读环境变量)
#   BING_VERIFICATION_CODE   必应站长验证码(优先读环境变量)
#   NPM_CMD          npm 命令(默认 npm)
#   BUILD_ONLY       设为 1 时仅构建不部署(用于预览/校验)
#
# 验证码持久化:建议写入 /var/www/danqing-ai/.secrets-website(不入 git),
#   内容形如:
#     BAIDU_VERIFICATION_CODE=xxx
#     BING_VERIFICATION_CODE=xxx
#  脚本会自动加载;也可通过环境变量注入。
# ============================================================

REPO_DIR="${REPO_DIR:-/var/www/danqing-ai}"
WEBSITE_DIR="${WEBSITE_DIR:-$REPO_DIR/website}"
WEBROOT="${WEBROOT:-$WEBSITE_DIR}"
NPM_CMD="${NPM_CMD:-npm}"
BUILD_ONLY="${BUILD_ONLY:-0}"

# 加载持久化密钥文件(若存在)
SECRETS_FILE="${SECRETS_FILE:-$REPO_DIR/.secrets-website}"
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
fi

# 校验码缺省检查
if [ -z "$BAIDU_VERIFICATION_CODE" ] || [ -z "$BING_VERIFICATION_CODE" ]; then
  echo "[deploy] WARN: 缺少站长验证码环境变量(BAIDU/BING_VERIFICATION_CODE)。"
  echo "[deploy]       验证码将不会注入 meta 标签;若已配置过可忽略此警告。"
fi

echo "═══════════════════════════════════════════════"
echo "  丹青有AI 官网部署"
echo "═══════════════════════════════════════════════"
echo "  REPO_DIR : $REPO_DIR"
echo "  WEBROOT  : $WEBROOT"
echo "  BUILD_ONLY: $BUILD_ONLY"

# 1. 拉取最新代码
echo ""
echo "[1/6] 拉取最新代码..."
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[deploy] 错误: $REPO_DIR 不是 git 仓库"
  exit 1
fi
git -C "$REPO_DIR" fetch origin
git -C "$REPO_DIR" checkout main
git -C "$REPO_DIR" pull origin main

# 2. 安装依赖
echo ""
echo "[2/6] 安装依赖..."
if [ ! -d "$WEBSITE_DIR/node_modules" ]; then
  "$NPM_CMD" --prefix "$WEBSITE_DIR" ci || "$NPM_CMD" --prefix "$WEBSITE_DIR" install
fi

# 3. 构建静态导出到 out/
echo ""
echo "[3/6] 构建静态导出 (BAIDU=$BAIDU_VERIFICATION_CODE BING=$BING_VERIFICATION_CODE)..."
export BAIDU_VERIFICATION_CODE BING_VERIFICATION_CODE
"$NPM_CMD" --prefix "$WEBSITE_DIR" run build

OUT_DIR="$WEBSITE_DIR/out"
if [ ! -f "$OUT_DIR/index.html" ]; then
  echo "[deploy] 错误: 构建产物缺失 $OUT_DIR/index.html"
  exit 1
fi

# 3.5 验证码 meta 注入(关键)
# Next.js App Router 会把 <head> 内容 hoist 进 RSC flight 数据(__next_f),
# 静态 HTML 的 <head> 里没有 meta,必应等不执行 JS 的爬虫读不到。
# 因此这里用 sed 直接把验证 meta 插入到 out/index.html 的静态 <head> 内。
echo ""
echo "[3.5/6] 注入站长验证 meta 到静态 <head>..."
INJECT_SCRIPT="script_insert_verification_meta.sh"
INJECT_SCRIPT_PATH="$WEBSITE_DIR/$INJECT_SCRIPT"
cat > "$INJECT_SCRIPT_PATH" <<'INJECT_EOF'
#!/bin/bash
# 由 deploy-website.sh 生成并调用:向 out/index.html 的 <head> 注入站长验证 meta。
set -e
HTML="$1"
BAIDU_VERIFICATION_CODE="$2"
BING_VERIFICATION_CODE="$3"
if [ ! -f "$HTML" ]; then
  echo "[inject] 错误: $HTML 不存在"
  exit 1
fi
# 幂等:若已含则跳过,避免重复注入
if grep -q 'baidu-site-verification' "$HTML" && grep -q 'msvalidate' "$HTML"; then
  echo "[inject] 验证 meta 已存在,跳过"
  exit 0
fi
META=""
if [ -n "$BAIDU_VERIFICATION_CODE" ] && ! grep -q 'baidu-site-verification' "$HTML"; then
  META="${META}<meta name=\"baidu-site-verification\" content=\"${BAIDU_VERIFICATION_CODE}\" />"
fi
if [ -n "$BING_VERIFICATION_CODE" ] && ! grep -q 'msvalidate' "$HTML"; then
  META="${META}<meta name=\"msvalidate.01\" content=\"${BING_VERIFICATION_CODE}\" />"
fi
if [ -n "$META" ]; then
  # 在 <head> 标签结束前插入(替换第一个 </head>;静态 HTML 中 </head> 仅出现一次)
  sed -i "s|</head>|${META}</head>|" "$HTML"
  echo "[inject] 已注入验证 meta"
  # 校验
  if grep -q "baidu-site-verification" "$HTML"; then echo "[inject]   [OK] baidu-site-verification"; fi
  if grep -q "msvalidate" "$HTML"; then echo "[inject]   [OK] msvalidate"; fi
else
  echo "[inject] 无验证码可注入"
fi
INJECT_EOF
chmod +x "$INJECT_SCRIPT_PATH"
bash "$INJECT_SCRIPT_PATH" "$OUT_DIR/index.html" "$BAIDU_VERIFICATION_CODE" "$BING_VERIFICATION_CODE"
rm -f "$INJECT_SCRIPT_PATH"

# 4. 校验 meta 标签已注入
echo ""
echo "[4/6] 校验 meta 标签..."
if grep -q 'baidu-site-verification' "$OUT_DIR/index.html"; then
  echo "  [OK] baidu-site-verification 已注入"
else
  echo "  [WARN] 未检测到 baidu-site-verification(可能未配置验证码)"
fi
if grep -q 'msvalidate' "$OUT_DIR/index.html"; then
  echo "  [OK] msvalidate 已注入"
else
  echo "  [WARN] 未检测到 msvalidate(可能未配置验证码)"
fi

if [ "$BUILD_ONLY" = "1" ]; then
  echo ""
  echo "[deploy] BUILD_ONLY=1,跳过部署。产物位于 $OUT_DIR"
  exit 0
fi

# 5. 备份当前 webroot + 增量同步产物
echo ""
echo "[5/6] 备份并同步到 webroot ($WEBROOT)..."
if [ ! -d "$WEBROOT" ]; then
  echo "[deploy] 错误: webroot 不存在 $WEBROOT"
  exit 1
fi
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$REPO_DIR/website-backups"
mkdir -p "$BACKUP_DIR"
echo "  备份 -> $BACKUP_DIR/website.bak.$TS"
rsync -a "$WEBROOT/" "$BACKUP_DIR/website.bak.$TS/"

echo "  同步 out/ -> $WEBROOT (增量,不删除)"
# 增量同步产物到 webroot。注意:不使用 --delete,避免误删与源码共存的文件。
rsync -a --checksum "$OUT_DIR/" "$WEBROOT/"
# 修正权限(nginx 通常以 www-data 运行)
if command -v sudo >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "$WEBROOT" 2>/dev/null || true
  sudo chmod -R a+rX "$WEBROOT" 2>/dev/null || true
fi

# 6. 校验线上可访问
echo ""
echo "[6/6] 校验 nginx 可访问..."
if command -v sudo >/dev/null 2>&1 && sudo systemctl is-active nginx >/dev/null 2>&1; then
  echo "  nginx 状态: $(sudo systemctl is-active nginx)"
  sudo systemctl reload nginx 2>/dev/null || true
fi
if command -v curl >/dev/null 2>&1; then
  code=$(curl -s -o /tmp/dq-website-check.html -w '%{http_code}' "https://www.danqing.site/" --max-time 15) || code="000"
  echo "  https://www.danqing.site/ -> HTTP $code"
  if [ "$code" = "200" ]; then
    echo "  线上校验: index.html bytes=$(wc -c < /tmp/dq-website-check.html)"
  else
    echo "  [WARN] 线上校验非 200(可能未部署或 DNS/证书未生效)"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✓ 官网部署完成"
echo "═══════════════════════════════════════════════"
echo "  备份保留于: $BACKUP_DIR/website.bak.$TS"
echo "  如需回滚: sudo rsync -a --delete $BACKUP_DIR/website.bak.$TS/ $WEBROOT/"
