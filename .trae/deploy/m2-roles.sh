#!/bin/bash
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT enum_range(NULL::\"UserRole\");" 2>&1 | head
echo "=== admin users ==="
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT id, role, email FROM users WHERE role='admin' OR role='owner' LIMIT 5;" 2>&1 | head
