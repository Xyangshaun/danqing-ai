#!/bin/bash
# Login as admin to get a token (mobile/login path with email+password)
echo "=== login attempt ==="
RESP=$(curl -s -m 20 -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client: admin" \
  -d '{"email":"admin@dq.edu","password":"Dq@Admin2026"}')
echo "$RESP" | head -c 1200
echo
