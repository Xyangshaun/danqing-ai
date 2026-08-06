#!/bin/bash
# 配置生产环境 DEPLOY_SYNC_SECRET (.env) + 重启 PM2
set -e

ENV_FILE=/var/www/danqing-ai/server/.env
TS=$(date +%Y%m%d_%H%M%S)

echo "======== [1/4] 备份当前 .env ========"
if [ -f "$ENV_FILE" ]; then
  sudo cp "$ENV_FILE" "$ENV_FILE.bak.$TS"
  echo "已备份: $ENV_FILE.bak.$TS"
else
  echo "错误: $ENV_FILE 不存在"
  exit 1
fi

echo "======== [2/4] 生成强随机密钥 ========"
# 32 字节 hex = 64 字符,足够安全
NEW_SECRET=$(openssl rand -hex 32)
echo "新密钥: $NEW_SECRET"

echo "======== [3/4] 写入 DEPLOY_SYNC_SECRET 到 .env ========"
cd /var/www/danqing-ai/server
if grep -q '^DEPLOY_SYNC_SECRET=' .env; then
  # 已存在,替换
  sudo sed -i "s|^DEPLOY_SYNC_SECRET=.*|DEPLOY_SYNC_SECRET=$NEW_SECRET|" .env
  echo "已更新现有 DEPLOY_SYNC_SECRET"
else
  # 不存在,追加
  echo "DEPLOY_SYNC_SECRET=$NEW_SECRET" | sudo tee -a .env > /dev/null
  echo "已追加 DEPLOY_SYNC_SECRET"
fi

echo "--- 确认写入(不泄露明文,仅显示行首) ---"
grep -E '^DEPLOY_SYNC_SECRET=' .env | sed -E 's/=([0-9a-f]{6}).*/=\1.../' 

echo "======== [4/4] 重启 PM2 并验证 ========"
cd /var/www/danqing-ai
pm2 restart danqing-api 2>&1 | tail -4
sleep 3

echo "--- PM2 状态 ---"
pm2 list --no-color 2>/dev/null | grep danqing-api

echo "--- 健康检查 ---"
curl -s -m 5 http://127.0.0.1:3000/health || echo "HEALTH_FAIL"

echo ""
echo "--- 部署日志端点(应返回 401 而非 503,证明密钥已生效) ---"
curl -s -m 5 -o /dev/null -w "HTTP_CODE=%{http_code}\n" http://127.0.0.1:3000/api/v1/deployments/latest
echo "--- 用正确密钥查询(有记录则 200,无记录则 404) ---"
curl -s -m 5 -o /tmp/deploy-latest.json -w "HTTP_CODE=%{http_code}\n" http://127.0.0.1:3000/api/v1/deployments/latest -H "X-Deploy-Secret: $NEW_SECRET"
cat /tmp/deploy-latest.json 2>/dev/null | head -c 300
echo ""
echo "DEPLOY_SECRET_CONFIGURED"