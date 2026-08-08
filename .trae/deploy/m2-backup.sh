#!/bin/bash
set -e
cd /var/www/danqing-ai
TS=$(date +%Y%m%d-%H%M%S)
echo "=== backup dist ==="
if [ -d server/dist ]; then
  cp -a server/dist "server/dist.bak-m2deploy-${TS}"
  echo "backed up dist -> server/dist.bak-m2deploy-${TS}"
fi
echo "=== backup .env ==="
if [ -f server/.env ]; then
  cp server/.env "server/.env.bak-m2deploy-${TS}"
  echo "backed up .env -> server/.env.bak-m2deploy-${TS}"
fi
ls -d server/dist.bak-m2deploy-* server/.env.bak-m2deploy-* 2>/dev/null | tail -5
