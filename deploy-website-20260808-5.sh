#!/bin/bash
# 官网部署脚本 - 2026-08-08 第 5 轮(BackToTop + VideoIntro 布局 + PageHeader 印鉴)
set -e

NEW_PKG="/tmp/website-out-20260808-5.tar.gz"
WEB_DIR="/var/www/danqing-ai/website"
BACKUP_DIR="/var/www/danqing-ai/website-backup-20260808-1"
TMP_VERIFY="/tmp/deploy-verify-$$.html"

echo "=========================================="
echo "S1 · 部署前检查"
echo "=========================================="

# 1. 新包存在 + 大小
if [ ! -f "$NEW_PKG" ]; then
  echo "[ERROR] 新包不存在: $NEW_PKG"
  exit 1
fi
echo "[OK] 新包存在: $(ls -lh $NEW_PKG | awk '{print $5}')"

# 2. 当前 web 目录状态
if [ -d "$WEB_DIR" ]; then
  echo "[OK] 当前 web 目录: $WEB_DIR ($(du -sh $WEB_DIR | awk '{print $1}'))"
  # 抽样现有 index.html 大小作为基线
  if [ -f "$WEB_DIR/index.html" ]; then
    echo "[INFO] 现有 index.html: $(wc -c < $WEB_DIR/index.html) bytes"
  fi
else
  echo "[WARN] 当前 web 目录不存在,跳过备份"
fi

echo ""
echo "=========================================="
echo "S2 · 备份当前线上版本"
echo "=========================================="

if [ -d "$WEB_DIR" ]; then
  # 删除旧备份(若存在)
  if [ -d "$BACKUP_DIR" ]; then
    echo "[INFO] 删除旧备份: $BACKUP_DIR"
    sudo rm -rf "$BACKUP_DIR"
  fi
  # 创建新备份
  echo "[INFO] 备份到: $BACKUP_DIR"
  sudo cp -r "$WEB_DIR" "$BACKUP_DIR"
  echo "[OK] 备份完成: $(du -sh $BACKUP_DIR | awk '{print $1}')"
fi

echo ""
echo "=========================================="
echo "S3 · 解压新包"
echo "=========================================="

cd "$WEB_DIR" || { echo "[ERROR] 无法进入 $WEB_DIR"; exit 1; }
echo "[INFO] 当前目录: $(pwd)"

# 清理旧内容(保留目录)
sudo find . -mindepth 1 -delete

# 解压
echo "[INFO] 解压 $NEW_PKG ..."
sudo tar -xzf "$NEW_PKG"

# 清理临时包
sudo rm -f "$NEW_PKG"
echo "[OK] 临时包已清理"

echo ""
echo "=========================================="
echo "S4 · 部署后验证"
echo "=========================================="

# 1. index.html 存在 + 大小
if [ -f "$WEB_DIR/index.html" ]; then
  INDEX_SIZE=$(wc -c < "$WEB_DIR/index.html")
  echo "[OK] index.html 存在: $INDEX_SIZE bytes"
else
  echo "[ERROR] index.html 缺失!"
  exit 1
fi

# 2. 检查关键内容片段
echo "[INFO] 检查关键改动是否落地..."

# 2.1 BackToTop 组件:查找 layout chunk
if sudo grep -rl "返回顶部" "$WEB_DIR/_next" > /dev/null 2>&1; then
  echo "[OK] BackToTop 组件已部署(找到「返回顶部」标识)"
else
  echo "[WARN] 未在 _next 中找到「返回顶部」字样"
fi

# 2.2 VideoIntro 画作布局:13 张 gallery 引用
GALLERY_COUNT=$(sudo grep -oh "gallery-[a-z]*\.\(jpg\|webp\)" "$WEB_DIR/_next"/*.js 2>/dev/null | sort -u | wc -l)
echo "[INFO] VideoIntro 引用的画作种类: $GALLERY_COUNT"

# 2.3 PageHeader 印鉴文案
if sudo grep -rl "丹青有AI" "$WEB_DIR/_next" > /dev/null 2>&1; then
  echo "[OK] PageHeader 印鉴文案已部署(找到「丹青有AI」)"
fi

# 2.4 13 张画作 jpg/webp 文件
JPG_COUNT=$(ls "$WEB_DIR/images/"gallery-*.jpg 2>/dev/null | wc -l)
WEBP_COUNT=$(ls "$WEB_DIR/images/"gallery-*.webp 2>/dev/null | wc -l)
echo "[INFO] 画作文件: jpg=$JPG_COUNT, webp=$WEBP_COUNT"

# 3. 抽检 HTTP 状态
echo "[INFO] 通过 curl 验证 HTTP 响应..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}, Size: %{size_download} bytes, Time: %{time_total}s\n" "https://www.danqing.site/" || echo "[WARN] curl 验证失败"

echo ""
echo "=========================================="
echo "S5 · 部署完成"
echo "=========================================="
echo "新版本: $WEB_DIR"
echo "旧版本备份: $BACKUP_DIR"
echo "回滚命令: sudo rm -rf $WEB_DIR && sudo mv $BACKUP_DIR $WEB_DIR"
