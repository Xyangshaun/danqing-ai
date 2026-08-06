#!/bin/bash
# 丹青有AI - 生产部署执行脚本(数据库迁移 + PM2 重启)
# 服务器: 43.128.25.202 | 目录: /var/www/danqing-ai
set -e

echo "======== [1/4] 数据库迁移 (prisma migrate deploy) ========"
cd /var/www/danqing-ai/server
npx prisma migrate deploy 2>&1 | tail -8
echo "MIGRATE_EXIT=$?"

echo "======== [2/4] 备份当前 dist (回滚点) ========"
cd /var/www/danqing-ai
TS=$(date +%Y%m%d_%H%M%S)
if [ -d dist ] && [ ! -d "dist.bak.deploy.$TS" ]; then
  sudo cp -r dist "dist.bak.deploy.$TS"
  echo "已备份: dist.bak.deploy.$TS"
else
  echo "跳过备份(无 dist 或已存在)"
fi

echo "======== [3/4] PM2 重启 danqing-api ========"
cd /var/www/danqing-ai
pm2 restart danqing-api 2>&1 | tail -5
sleep 3

echo "======== [4/4] 验证 ========"
echo "--- PM2 状态 ---"
pm2 list --no-color 2>/dev/null | grep danqing-api
echo "--- 健康检查 ---"
curl -s -m 5 http://127.0.0.1:3000/health || echo "HEALTH_FAIL"
echo ""
echo "--- 部署日志端点(确认功能在线) ---"
SECRET=$(grep -E '^DEPLOY_SYNC_SECRET=' /var/www/danqing-ai/server/.env | cut -d= -f2)
if [ -n "$SECRET" ]; then
  curl -s -m 5 http://127.0.0.1:3000/api/v1/deployments/latest -H "X-Deploy-Secret: $SECRET" || echo "DEPLOY_EP_FAIL"
else
  echo "DEPLOY_SYNC_SECRET 未配置(端点将返回 503,不影响主服务)"
fi
echo ""
echo "DEPLOY_DONE"