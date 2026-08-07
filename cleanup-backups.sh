#!/bin/bash
# ============================================================
# 丹青有AI 备份清理脚本
# 定量清理历史备份,保留最近 N 个完整可运行版本
#
# 策略:
#   - dist 备份(业务应用):保留最近 DIST_KEEP=5 个"完整"备份(>=100M),
#     删除中间残留小备份(<100M,部署中间产物)
#   - website 备份(官网):保留最近 WEBSITE_KEEP=3 个版本,删除更早的
#   - 根目录遗留的小 website 备份一并清理
#
# 使用:
#   sudo bash cleanup-backups.sh            # 立即执行
#   sudo bash cleanup-backups.sh --dry-run  # 仅预览不删除
# 建议配合 cron 每周执行(见 install_cron 提示)
# ============================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/danqing-ai}"
DIST_KEEP="${DIST_KEEP:-5}"        # dist 完整备份保留数
WEBSITE_KEEP="${WEBSITE_KEEP:-3}"  # website 备份保留数
MIN_COMPLETE_SIZE="${MIN_COMPLETE_SIZE:-104857600}"  # 100M 以下视为中间残留
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
[ "${1:-}" = "--install-cron" ] && install_cron

LOGFILE="${LOGFILE:-/var/log/danqing-backup-cleanup.log}"
TS=$(date '+%Y-%m-%d %H:%M:%S')
SCRIPT_PATH="$(readlink -f "$0")"

# 安装每周定时清理 cron(默认周日 03:30)
install_cron() {
  local cron_line="30 3 * * 0 root bash $SCRIPT_PATH >> /var/log/danqing-backup-cleanup.log 2>&1"
  local cron_file="/etc/cron.d/danqing-backup-cleanup"
  echo "安装每周定时清理到 $cron_file"
  printf '%s\n' "# 丹青有AI 备份定量清理(每周日 03:30)" "$cron_line" | sudo tee "$cron_file" >/dev/null
  sudo chmod 644 "$cron_file"
  echo "已安装: $cron_line"
  echo "下次执行: 下一个周日 03:30(也可随时手动运行 $SCRIPT_PATH)"
  exit 0
}

# 日志辅助
log() { echo "[$TS] $*" | tee -a "$LOGFILE"; }

# 执行或预览删除
rm_safe() {
  local p="$1"
  if [ "$DRY_RUN" = "1" ]; then
    log "  [DRY-RUN] 将删除: $p"
  else
    if sudo rm -rf "$p" 2>/dev/null; then
      log "  已删除: $p"
    else
      log "  [ERROR] 删除失败: $p"
    fi
  fi
}

# 按 mtime 升序排列(最旧在前)的所有匹配路径
sort_by_oldest() { ls -dt "$@" 2>/dev/null | tac; }

log "========== 备份清理开始 (DRY_RUN=$DRY_RUN) =========="

# ------------------------------------------------------------
# 1. 清理 dist 备份
#    规则: 先删除所有"中间残留"(<100M),再从剩余完整备份中保留最近 DIST_KEEP 个
# ------------------------------------------------------------
log "[1] dist 备份清理 (保留完整 $DIST_KEEP 个)..."
DIST_BACKUPS=()
while IFS= read -r d; do
  [ -n "$d" ] && DIST_BACKUPS+=("$d")
done < <(ls -d "$REPO_DIR"/dist.bak* 2>/dev/null || true)

if [ ${#DIST_BACKUPS[@]} -eq 0 ]; then
  log "  无 dist 备份"
else
  # 先删小残留
  for d in "${DIST_BACKUPS[@]}"; do
    sz=$(sudo du -sb "$d" 2>/dev/null | cut -f1 || echo 0)
    if [ "$sz" -lt "$MIN_COMPLETE_SIZE" ]; then
      log "  [中间残留 ${sz} 字节] $d"
      rm_safe "$d"
    fi
  done
  # 再从完整备份中保留最近 DIST_KEEP 个(按时间新→旧)
  COMPLETE=()
  while IFS= read -r d; do
    [ -n "$d" ] && COMPLETE+=("$d")
  done < <(ls -dt "$REPO_DIR"/dist.bak* 2>/dev/null || true)
  # COMPLETE 已按时间新→旧,只保留前 DIST_KEEP 个
  COUNT=0
  for d in "${COMPLETE[@]}"; do
    sz=$(sudo du -sb "$d" 2>/dev/null | cut -f1 || echo 0)
    if [ "$sz" -ge "$MIN_COMPLETE_SIZE" ]; then
      COUNT=$((COUNT+1))
      if [ "$COUNT" -gt "$DIST_KEEP" ]; then
        log "  [超出保留数] $d"
        rm_safe "$d"
      fi
    fi
  done
  log "  dist 完整备份剩余: $COUNT 个"
fi

# ------------------------------------------------------------
# 2. 清理 website 备份(website-backups 目录)
#    规则: 保留最近 WEBSITE_KEEP 个,删除更早的
# ------------------------------------------------------------
log "[2] website 备份清理 (保留 $WEBSITE_KEEP 个)..."
WB_DIR="$REPO_DIR/website-backups"
if [ -d "$WB_DIR" ]; then
  # 按时间新→旧列出所有条目
  mapfile -t WB_ALL < <(ls -dt "$WB_DIR"/* 2>/dev/null || true)
  COUNT=0
  for d in "${WB_ALL[@]}"; do
    COUNT=$((COUNT+1))
    if [ "$COUNT" -gt "$WEBSITE_KEEP" ]; then
      log "  [超出保留数] $d"
      rm_safe "$d"
    fi
  done
  log "  website 备份剩余: $([ "$COUNT" -le "$WEBSITE_KEEP" ] && echo "$COUNT" || echo "$WEBSITE_KEEP") 个"
else
  log "  website-backups 目录不存在"
fi

# ------------------------------------------------------------
# 3. 清理根目录遗留的小 website 备份(website.bak-* / website-backup-*)
# ------------------------------------------------------------
log "[3] 根目录遗留 website 备份清理..."
while IFS= read -r d; do
  [ -n "$d" ] && log "  [遗留备份] $d" && rm_safe "$d"
done < <(ls -d "$REPO_DIR"/website.bak* "$REPO_DIR"/website-backup-* 2>/dev/null || true)

log "========== 备份清理结束 =========="
echo ""
echo "清理完成。如需回滚已删除的备份:它们位于回收站不可恢复,请确认已保留足够版本。"
echo "当前保留策略: dist 完整备份 $DIST_KEEP 个 / website 备份 $WEBSITE_KEEP 个"
echo ""
echo "--- 若要安装每周定时清理(cron),执行: ---"
echo "  sudo bash cleanup-backups.sh --install-cron"
echo ""
