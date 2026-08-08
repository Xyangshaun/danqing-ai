#!/bin/bash
echo "=== admin login attempt ==="
RESP=$(curl -s -m 20 -X POST http://127.0.0.1:3000/api/v1/auth/login/admin \
  -H "Content-Type: application/json" \
  -H "X-Client: admin" \
  -H "X-Device-Id: deploy-m2-console" \
  -d '{"email":"admin@dq.edu","password":"Dq@Admin2026"}')
echo "$RESP" | head -c 2500
echo
