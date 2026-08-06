#!/bin/bash
set -e

cd /var/www/danqing-ai

# 1. 备份当前 dist
TS=$(date +%Y%m%d_%H%M%S)
echo "[1/5] Backing up current dist -> dist.bak.$TS"
sudo cp -r dist "dist.bak.$TS"

# 2. 解压新 dist 到临时目录
echo "[2/5] Unzipping new dist"
sudo rm -rf /tmp/dist.new
mkdir -p /tmp/dist.new
sudo unzip -o /tmp/dist-new.zip -d /tmp/dist.new > /dev/null
sudo chown -R ubuntu:ubuntu /tmp/dist.new

# 3. 校验:确保新 bundle 没有 trae-api-cn 外链
echo "[3/5] Verifying new bundle has no trae-api-cn.mchost.guru URLs"
HITS=$(grep -rE 'trae-api-cn\.mchost\.guru' /tmp/dist.new/assets/*.js | wc -l)
if [ "$HITS" -gt 0 ]; then
  echo "FAIL: new bundle still has $HITS trae-api-cn references"
  grep -rEo 'trae-api-cn\.mchost\.guru[^"'\'']*' /tmp/dist.new/assets/*.js | head -5
  exit 1
fi
echo "OK: 0 trae-api-cn URLs in new bundle"

# 3.25. 校验:确保新 bundle 没有 localhost 硬编码
LOCALHOST_HITS=$(grep -rE 'localhost:3000|localhost:5173|127\.0\.0\.1:3000|127\.0\.0\.1:5173' /tmp/dist.new/assets/*.js | wc -l)
if [ "$LOCALHOST_HITS" -gt 0 ]; then
  echo "FAIL: new bundle still has $LOCALHOST_HITS localhost references"
  grep -rE 'localhost:3000|localhost:5173|127\.0\.0\.1:3000|127\.0\.0\.1:5173' /tmp/dist.new/assets/*.js | head -5
  exit 1
fi
echo "OK: 0 localhost URLs in new bundle"

# 3.5. 校验:index-*.js 中是否包含 /api/v1 与 danqing.site 飞书回调
echo "[3.5/5] Verifying /api/v1 + danqing.site in bundle"
BUNDLE=$(ls /tmp/dist.new/assets/index-*.js | head -1)
if ! grep -q '/api/v1' "$BUNDLE"; then
  echo "FAIL: /api/v1 missing from bundle"
  exit 1
fi
if ! grep -q 'danqing.site/app/auth/feishu/callback' "$BUNDLE"; then
  echo "FAIL: danqing.site feishu callback missing from bundle"
  exit 1
fi
echo "OK: /api/v1 and danqing.site present"

# 4. 替换 dist
echo "[4/5] Swapping dist"
sudo rm -rf dist
sudo mv /tmp/dist.new dist
sudo chown -R www-data:www-data dist
sudo chmod -R a+rX dist

# 5. 验证 nginx 仍可访问
echo "[5/5] Done. nginx status:"
sudo systemctl is-active nginx
echo "---"
echo "Index entry:"
ls -la dist/index.html
echo "---"
echo "Asset count:"
ls dist/assets/ | wc -l
