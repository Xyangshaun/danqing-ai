#!/bin/bash
# 丹青有AI - 生产部署执行脚本(数据库迁移 + dist 权限修复 + PM2 重启 + 部署日志上报)
# 服务器: 43.128.25.202 | 目录: /var/www/danqing-ai
set -e

echo "======== [1/6] 数据库迁移 (prisma migrate deploy) ========"
cd /var/www/danqing-ai/server
npx prisma migrate deploy 2>&1 | tail -8
echo "MIGRATE_EXIT=$?"

echo "======== [2/6] 备份当前 dist (回滚点) ========"
cd /var/www/danqing-ai
TS=$(date +%Y%m%d_%H%M%S)
if [ -d dist ] && [ ! -d "dist.bak.deploy.$TS" ]; then
  sudo cp -r dist "dist.bak.deploy.$TS"
  echo "已备份: dist.bak.deploy.$TS"
else
  echo "跳过备份(无 dist 或已存在)"
fi

echo "======== [3/6] 修复 dist 权限 (防止 Nginx 403) ========"
# Vite 构建默认创建 assets/ 目录权限 700,Nginx(www-data) 无法访问导致前端白屏
# 修复:目录 755,文件 644,owner 统一为 www-data
cd /var/www/danqing-ai
sudo chown -R www-data:www-data dist/
sudo find dist -type d -exec chmod 755 {} +
sudo find dist -type f -exec chmod 644 {} +
echo "dist 权限已修复:目录 755 / 文件 644 / owner www-data:www-data"
echo "--- 验证 ---"
stat -c '%U:%G %A %n' dist dist/assets dist/index.html 2>/dev/null

echo "======== [4/6] PM2 重启 danqing-api ========"
cd /var/www/danqing-ai
pm2 restart danqing-api 2>&1 | tail -5
sleep 3

echo "======== [5/6] 验证 ========"
echo "--- PM2 状态 ---"
pm2 list --no-color 2>/dev/null | grep danqing-api
echo "--- 健康检查 ---"
curl -s -m 5 http://127.0.0.1:3000/health || echo "HEALTH_FAIL"
echo ""
echo "--- 前端 CSS 可访问性(通过 Nginx HTTPS) ---"
CSS_FILE=$(ls /var/www/danqing-ai/dist/assets/*.css 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "")
if [ -n "$CSS_FILE" ]; then
  # 通过本地 Nginx HTTPS(443)访问,跳过证书验证(localhost 不匹配证书域名)
  css_status=$(curl -skI -m 5 "https://127.0.0.1/app/assets/$CSS_FILE" -H "Host: www.danqing.site" 2>/dev/null | head -1)
  if echo "$css_status" | grep -q "200"; then
    echo "CSS OK: $css_status"
  else
    echo "CSS_CHECK_FAIL: $css_status"
  fi
else
  echo "未找到 CSS 文件(可能 dist 未部署)"
fi
echo "--- 部署日志端点(确认功能在线) ---"
SECRET=$(grep -E '^DEPLOY_SYNC_SECRET=' /var/www/danqing-ai/server/.env | cut -d= -f2)
if [ -n "$SECRET" ]; then
  curl -s -m 5 http://127.0.0.1:3000/api/v1/deployments/latest -H "X-Deploy-Secret: $SECRET" || echo "DEPLOY_EP_FAIL"
else
  echo "DEPLOY_SYNC_SECRET 未配置(端点将返回 503,不影响主服务)"
fi
echo ""

echo "======== [6/6] 上报部署日志到 deployment_logs 表 ========"
# 内联上报逻辑(与 deploy-ssh.sh 同步机制一致,含 .env 回退读取)
DEPLOY_SYNC_API_URL="${DEPLOY_SYNC_API_URL:-http://127.0.0.1:3000/api/v1/deployments/log}"
DEPLOY_SYNC_SECRET="${DEPLOY_SYNC_SECRET:-}"
# 若环境变量未提供,从 server/.env 回退读取(与 deploy-ssh.sh 修复逻辑一致)
if [ -z "$DEPLOY_SYNC_SECRET" ] && [ -f /var/www/danqing-ai/server/.env ]; then
  DEPLOY_SYNC_SECRET=$(grep -E "^DEPLOY_SYNC_SECRET=" /var/www/danqing-ai/server/.env | cut -d= -f2- | tr -d "\"'" || true)
fi
DEPLOY_SERVER_ID="${DEPLOY_SERVER_ID:-$(hostname)}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git -C /var/www/danqing-ai rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')}"
DEPLOY_COMMIT_SHA="${DEPLOY_COMMIT_SHA:-$(git -C /var/www/danqing-ai rev-parse --short HEAD 2>/dev/null || echo '')}"
DEPLOY_VERSION="${DEPLOY_VERSION:-${DEPLOY_COMMIT_SHA:-v$(date +%Y%m%d-%H%M%S)}}"
DEPLOY_DEPLOYER="${DEPLOY_DEPLOYER:-deploy-run.sh}"

if [ -z "$DEPLOY_SYNC_SECRET" ]; then
  echo "[sync] WARN: DEPLOY_SYNC_SECRET 未配置,跳过部署日志同步"
else
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  payload="{\"timestamp\":\"$ts\",\"version\":\"$DEPLOY_VERSION\",\"serverId\":\"$DEPLOY_SERVER_ID\",\"status\":\"success\",\"deployer\":\"$DEPLOY_DEPLOYER\",\"branch\":\"$DEPLOY_BRANCH\",\"commitSha\":\"$DEPLOY_COMMIT_SHA\",\"details\":{}}"
  http_code=$(curl -s -o /tmp/deploy-sync-resp.json -w '%{http_code}' \
    -X POST "$DEPLOY_SYNC_API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Deploy-Secret: $DEPLOY_SYNC_SECRET" \
    -d "$payload")
  if [ "$http_code" = "200" ]; then
    echo "[sync] OK: 部署日志已同步 (version=$DEPLOY_VERSION)"
  else
    echo "[sync] WARN: 部署日志同步失败,HTTP=$http_code(不影响主流程)"
    cat /tmp/deploy-sync-resp.json 2>/dev/null || true
  fi
fi
echo ""
echo "DEPLOY_DONE"
