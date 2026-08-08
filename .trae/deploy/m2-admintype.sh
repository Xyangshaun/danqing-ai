#!/bin/bash
sudo docker exec danqing-postgres psql -U danqing -d danqing_ai -t -c "SELECT id, email, role, auth_type, status FROM users WHERE email IN ('admin@dq.edu','imgdebug2026@gmail.com');" 2>&1 | head
