#!/bin/bash
cd /var/www/danqing-ai/server
RURL=$(grep -E '^REDIS_URL=' .env | cut -d= -f2-)
KEY='config:feature:generation'
echo "=== current value ==="
CUR=$(redis-cli -u "$RURL" GET "$KEY" 2>/dev/null)
echo "${CUR:-<none>}"
# Backup current (empty or existing)
echo "$CUR" > /tmp/gen-flag-backup.json 2>/dev/null
echo "=== set enabled flag ==="
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
FLAG='{"featureId":"generation","name":"AI 图像生成","description":"AI 图像生成功能(异步队列 + 教学闭环)","type":"percentage","status":"enabled","value":100,"defaultValue":0,"targetUserIds":[],"targetTenantIds":[],"createdById":"deploy","updatedById":"deploy","createdAt":"'$NOW'","updatedAt":"'$NOW'"}'
redis-cli -u "$RURL" SET "$KEY" "$FLAG" 2>&1
echo "=== verify ==="
redis-cli -u "$RURL" GET "$KEY" 2>/dev/null
echo
