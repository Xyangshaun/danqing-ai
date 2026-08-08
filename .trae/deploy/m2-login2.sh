#!/bin/bash
echo "=== login attempt with device_id ==="
RESP=$(curl -s -m 20 -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client: admin" \
  -d '{"email":"admin@dq.edu","password":"Dq@Admin2026","device_id":"deploy-m2-console"}')
echo "$RESP" | head -c 2000
echo
