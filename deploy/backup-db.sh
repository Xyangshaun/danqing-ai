#!/bin/bash
# ============================================================
# 丹青有AI - PostgreSQL 自动备份脚本
# 部署路径:/opt/danqing-ai/scripts/backup-db.sh
# Crontab:0 3 * * * /opt/danqing-ai/scripts/backup-db.sh
# 保留策略:最近 7 天备份,超过自动删除
# ============================================================

set -euo pipefail

# ---------- 配置 ----------
BACKUP_DIR="/opt/danqing-ai/backups"
DB_NAME="danqing_ai"
DB_USER="danqing"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/danqing_ai_${DATE}.sql.gz"

# ---------- 创建备份目录 ----------
mkdir -p "${BACKUP_DIR}"

# ---------- 执行备份 ----------
echo "[$(date)] Starting database backup..."
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------- 清理过期备份 ----------
DELETED=$(find "${BACKUP_DIR}" -name "danqing_ai_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date)] Cleaned up ${DELETED} expired backup(s)"
fi

# ---------- 列出当前备份 ----------
echo "[$(date)] Current backups:"
ls -lh "${BACKUP_DIR}"/danqing_ai_*.sql.gz 2>/dev/null || echo "  (none)"
