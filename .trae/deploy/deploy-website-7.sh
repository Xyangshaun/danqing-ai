#!/bin/bash
set -e
TODAY=$(date +%Y%m%d)
BK="/var/www/danqing-ai/website-backup-$TODAY-7"
echo "=== 备份当前生产版本 ==="
sudo rm -rf "$BK"
sudo cp -r /var/www/danqing-ai/website "$BK"
echo "备份完成: $BK"
echo
echo "=== 解压新版本 ==="
sudo tar -xzf /tmp/website-out-20260808-7.tar.gz -C /var/www/danqing-ai/website
echo "解压完成"
echo
echo "=== 清理临时包 ==="
rm -f /tmp/website-out-20260808-7.tar.gz
echo "完成"