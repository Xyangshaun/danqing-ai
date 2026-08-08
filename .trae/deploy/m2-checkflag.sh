#!/bin/bash
cd /var/www/danqing-ai/server
echo "=== REDIS_PREFIX ==="
grep -n "REDIS_PREFIX" src/services/config-feature.service.ts | head -3
echo "=== feature defs ==="
grep -n "featureId:\|'generation'\|'analysis'\|'metrics'\|'alerting'" src/services/config-feature.service.ts | head -20
echo "=== redis keys scan ==="
RURL=$(grep -E '^REDIS_URL=' .env | cut -d= -f2-)
echo "REDIS_URL set: ${RURL:+yes}"
redis-cli -u "$RURL" --scan --pattern '*feature*' 2>/dev/null | head -20
echo "=== generation flag ==="
redis-cli -u "$RURL" GET 'config:feature:generation' 2>/dev/null
echo
redis-cli -u "$RURL" GET 'feature:generation' 2>/dev/null
echo
