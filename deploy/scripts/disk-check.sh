#!/bin/bash
# 丹青有AI - 磁盘空间监控
# 每小时由 cron 执行，超过 80% 写告警 + 清理旧日志
ALERT_LOG="/home/ubuntu/scripts/alerts.log"
USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$USAGE" -gt 80 ]; then
  echo "[$TIMESTAMP] ALERT: Disk usage at ${USAGE}%!" >> $ALERT_LOG
  # 清理旧 PM2 日志
  find ~/.pm2/logs/ -name "*.log" -mtime +7 -delete 2>/dev/null
  echo "[$TIMESTAMP] ACTION: Cleaned old PM2 logs" >> $ALERT_LOG
fi
