#!/bin/bash
# 官网 WebP 优化发布部署日志同步 (2026-08-08)
set -e
ENV=/var/www/danqing-ai/server/.env
API_URL=$(grep -E '^DEPLOY_SYNC_API_URL=' "$ENV" | cut -d= -f2- | tr -d '"')
SECRET=$(grep -E '^DEPLOY_SYNC_SECRET=' "$ENV" | cut -d= -f2- | tr -d '"')
SERVER_ID=$(grep -E '^DEPLOY_SERVER_ID=' "$ENV" | cut -d= -f2- | tr -d '"')

[ -z "$API_URL" ] && API_URL="https://www.danqing.site/api/v1/deployments/log"
[ -z "$SERVER_ID" ] && SERVER_ID="danqing-vps-43-128-25-202"

curl -s -o /tmp/deploy-log-resp.json -w "HTTP:%{http_code}\n" \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Deploy-Secret: $SECRET" \
  -d "{
    \"version\": \"20260808-6\",
    \"serverId\": \"$SERVER_ID\",
    \"status\": \"success\",
    \"deployer\": \"TRAE 部署助手\",
    \"branch\": \"main\",
    \"commitSha\": \"website-out-20260808-6\",
    \"details\": {
      \"summary\": \"官网 WebP 图片优化发布：13 张名画 JPG 转 WebP(5.2MB→3.6MB),VideoIntro/Hero 用 picture 优先加载 webp,decoding=async;开屏动画减压卡顿\",
      \"changes\": [\"optimize-paintings.mjs 转换 13 张 JPG→WebP\", \"VideoIntro.tsx picture+webp+decoding async\", \"Hero.tsx picture+webp\", \"prebuild 接入 optimize-paintings\"],
      \"chunks\": [\"page-7f4afde0c6c2cd10.js\", \"gallery-hero.webp 157KB\"]
    },
    \"sourceIp\": \"local-deploy\"
  }"
echo "--- response ---"
cat /tmp/deploy-log-resp.json; echo
rm -f /tmp/deploy-log-resp.json