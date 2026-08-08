#!/bin/bash
set -e
echo "=== 1. Kill residual manual foreground node serving :3000 ==="
# The manual foreground process started for debugging
for pid in 2849995 2849997; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null && echo "killed $pid" || echo "kill $pid failed"
  fi
done
# Also kill any other node running server/dist/index.js outside pm2
pkill -f "node --env-file=server/.env server/dist/index.js" 2>/dev/null && echo "pkill foreground index.js" || echo "no foreground index.js"
# Kill leftover tmp test processes
pkill -f ".tmp-test-generation-service.cjs" 2>/dev/null && echo "killed tmp test gen service" || echo "no tmp gen service"
pkill -f ".tmp-test-generation.cjs" 2>/dev/null && echo "killed tmp test gen" || echo "no tmp gen"
sleep 2
echo "=== 2. Verify :3000 freed ==="
if ss -tlnp 2>/dev/null | grep -q ':3000'; then
  echo "WARNING: port 3000 still occupied:"
  ss -tlnp 2>/dev/null | grep ':3000'
else
  echo "port 3000 free"
fi
echo "=== 3. Stop pm2 app if any (to avoid port conflict) ==="
pm2 stop danqing-api 2>/dev/null || true
