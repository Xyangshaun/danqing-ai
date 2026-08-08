#!/bin/bash
cd /var/www/danqing-ai/server
echo "=== config routes files ==="
ls src/routes/ | grep -i config
echo "=== config feature route ==="
grep -rn "features" src/routes/*config* 2>/dev/null | head
echo "=== config controller ==="
ls src/controllers/ | grep -i config
echo "=== admin users ==="
docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT id, role, email FROM users WHERE role IN ('admin','super_admin') LIMIT 5;" 2>&1 | head
