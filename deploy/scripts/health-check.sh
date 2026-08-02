#!/bin/bash
# 丹青有AI - 健康检查脚本
# 每分钟由 cron 执行，检查 API + PM2 + Docker 容器状态
ALERT_LOG="/home/ubuntu/scripts/alerts.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 1. 检查 API 健康
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:3000/health 2>/dev/null)
if [ "$HTTP" != "200" ]; then
  echo "[$TIMESTAMP] ALERT: API health check failed (HTTP $HTTP)" >> $ALERT_LOG
  pm2 restart danqing-api 2>/dev/null
  echo "[$TIMESTAMP] ACTION: PM2 restart triggered" >> $ALERT_LOG
fi

# 2. 检查 PM2 进程
PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)
if echo "$PM2_STATUS" | grep -qv online; then
  echo "[$TIMESTAMP] ALERT: PM2 process not online ($PM2_STATUS)" >> $ALERT_LOG
  pm2 restart danqing-api 2>/dev/null
fi

# 3. 检查 Docker 容器
PG=$(sudo docker ps --filter name=danqing-postgres --format '{{.Status}}' 2>/dev/null)
RD=$(sudo docker ps --filter name=danqing-redis --format '{{.Status}}' 2>/dev/null)
if [ -z "$PG" ]; then
  echo "[$TIMESTAMP] ALERT: PostgreSQL container down!" >> $ALERT_LOG
  sudo docker start danqing-postgres 2>/dev/null
fi
if [ -z "$RD" ]; then
  echo "[$TIMESTAMP] ALERT: Redis container down!" >> $ALERT_LOG
  sudo docker start danqing-redis 2>/dev/null
fi
