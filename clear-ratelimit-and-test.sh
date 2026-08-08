#!/bin/bash
# 清除 Redis 限流计数器 + 运行烟雾测试
cd /var/www/danqing-ai/server

# 从 .env 提取 Redis 密码
REDIS_URL=$(grep '^REDIS_URL=' .env | head -1 | cut -d= -f2-)
# 格式: redis://:password@host:port
RP=$(echo "$REDIS_URL" | sed 's|redis://:*\([^@]*\)@.*|\1|')
echo "redis password length: ${#RP}"

echo "--- clearing rl:auth:* keys ---"
KEYS=$(sudo docker exec danqing-redis redis-cli -a "$RP" --scan --pattern 'rl:auth:*' 2>/dev/null)
if [ -n "$KEYS" ]; then
  echo "found keys: $KEYS"
  for key in $KEYS; do
    sudo docker exec danqing-redis redis-cli -a "$RP" DEL "$key" 2>/dev/null
  done
else
  echo "no rl:auth:* keys found"
fi

# 也清除所有 rl:* 限流 key(包括 api/callback/refresh)
echo "--- clearing all rl:* keys ---"
ALL_KEYS=$(sudo docker exec danqing-redis redis-cli -a "$RP" --scan --pattern 'rl:*' 2>/dev/null)
if [ -n "$ALL_KEYS" ]; then
  echo "clearing $(echo $ALL_KEYS | wc -w) keys"
  for key in $ALL_KEYS; do
    sudo docker exec danqing-redis redis-cli -a "$RP" DEL "$key" 2>/dev/null
  done
else
  echo "no rl:* keys found"
fi

echo "--- cleared, running smoke test ---"
sleep 1
bash /tmp/smoke-prod-server.sh
