#!/bin/bash
# 丹青有AI - 数据库备份脚本
# 每日由 cron 执行，pg_dump + gzip 压缩 + 保留 7 天
BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/danqing_ai_$TIMESTAMP.sql.gz"

mkdir -p $BACKUP_DIR

# 执行备份
sudo docker exec danqing-postgres pg_dump -U danqing -d danqing_ai 2>/dev/null | gzip > $BACKUP_FILE

if [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] BACKUP OK: $BACKUP_FILE ($SIZE)" >> $BACKUP_DIR/backup.log
  # 清理 7 天前的备份
  find $BACKUP_DIR -name "danqing_ai_*.sql.gz" -mtime +7 -delete
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] BACKUP FAILED: empty file" >> $BACKUP_DIR/backup.log
fi
