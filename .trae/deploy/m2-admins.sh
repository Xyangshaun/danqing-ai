#!/bin/bash
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT id, role, email FROM users WHERE role IN ('admin','super_admin','owner') LIMIT 5;" 2>&1 | head
