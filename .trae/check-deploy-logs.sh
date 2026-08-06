#!/bin/bash
# 检查 deployment_logs 表内容
echo "======== deployment_logs 表记录数 ========"
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT COUNT(*) FROM deployment_logs;"

echo "======== deployment_logs 表全部记录 ========"
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "SELECT id, timestamp, version, server_id, status, branch, commit_sha, error_message, source_ip FROM deployment_logs ORDER BY timestamp DESC;"

echo "======== 表结构确认 ========"
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "\d deployment_logs" 2>&1 | head -25