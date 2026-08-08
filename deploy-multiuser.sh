#!/bin/bash
set -e
cd /var/www/danqing-ai/server

echo "=== [1] Backup current dist (skip if already backed up) ==="
if [ ! -d dist.bak-20260808-multiuser ]; then
  sudo cp -a dist dist.bak-20260808-multiuser
  echo "backup created: dist.bak-20260808-multiuser"
else
  echo "backup already exists, skipping"
fi

echo "=== [2] Remove old dist + extract new ==="
sudo rm -rf dist
sudo tar -xzf /tmp/deploy-multiuser.tar.gz
sudo chown -R ubuntu:ubuntu dist
echo "extract done"

echo "=== [3] Prisma generate ==="
npx prisma generate 2>&1 | tail -3

echo "=== [4] Run seed (sync enterprise user + all seed data) ==="
npx prisma db seed 2>&1 | tail -30

echo "=== [5] Restart PM2 ==="
pm2 restart danqing-api 2>&1 | tail -3
sleep 3

echo "=== [6] Health check ==="
curl -s http://127.0.0.1:3000/health
echo ""

echo "=== [7] Verify enterprise user in DB ==="
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "SELECT id, email, role, tenant_id FROM users WHERE email='enterprise@dq.edu'"

echo "=== [8] Verify all seed users ==="
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -c "SELECT email, role, tenant_id FROM users WHERE email LIKE '%@dq.edu' ORDER BY email"

echo "=== [9] PM2 status ==="
pm2 list --no-color 2>/dev/null | grep danqing-api

echo "=== DEPLOY_DONE ==="
