#!/bin/bash
# 生产环境烟雾测试(服务器本地)
BASE="http://127.0.0.1:3000/api/v1"
ADMIN_BASE="http://127.0.0.1:3000/api/admin"
DEVICE="prod-smoke-local"
PASS=0
FAIL=0

ok() { PASS=$((PASS+1)); echo "[PASS] $1 — $2"; }
no() { FAIL=$((FAIL+1)); echo "[FAIL] $1 — $2"; }

echo "=== 生产烟雾测试(服务器本地) ==="

# 0. 健康检查
H=$(curl -s -m 5 "$BASE/health")
if echo "$H" | grep -q '"status":"up"'; then ok "0. 健康检查" "status=up"; else no "0. 健康检查" "$H"; fi

# 辅助:登录并保存 token 到文件
do_login() {
  local email="$1" pw="$2" label="$3" tokfile="$4"
  sleep 2
  local resp=$(curl -s -m 10 -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" -H "X-Device-Id: $DEVICE" \
    -d "{\"email\":\"$email\",\"password\":\"$pw\"}")
  local code=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('code','?'))" 2>/dev/null)
  if [ "$code" = "0" ]; then
    echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null > "$tokfile"
    local role=$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['user']['role'])" 2>/dev/null)
    local tenant=$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['tenant']['id'])" 2>/dev/null)
    ok "1. $label 登录" "role=$role tenant=$tenant"
  else
    no "1. $label 登录" "code=$code $(echo $resp | head -c 100)"
    echo "" > "$tokfile"
  fi
}

echo ""
echo "--- 1. 用户登录 ---"
do_login "test1@dq.edu" "Dq@Test2026" "学生1" /tmp/tok_s1
do_login "test2@dq.edu" "Dq@Test2026" "学生2" /tmp/tok_s2
do_login "teacher@dq.edu" "Dq@Teacher2026" "教师" /tmp/tok_t
do_login "admin@dq.edu" "Dq@Admin2026" "管理员" /tmp/tok_a
do_login "enterprise@dq.edu" "Dq@Enterprise2026" "企业学校" /tmp/tok_e

# 辅助:检查 API
check_api() {
  local tokfile="$1" url="$2" label="$3"
  local tok=$(cat "$tokfile" 2>/dev/null)
  if [ -z "$tok" ]; then no "$label" "无token"; return; fi
  sleep 1
  local resp=$(curl -s -m 10 "$url" -H "Authorization: Bearer $tok")
  local code=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('code','?'))" 2>/dev/null)
  if [ "$code" = "0" ]; then
    local count=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',{});print(len(d.get('items',d.get('list',[]))))" 2>/dev/null)
    ok "$label" "items=$count"
  else
    no "$label" "code=$code"
  fi
}

echo ""
echo "--- 2. 通知 API ---"
check_api /tmp/tok_s1 "$BASE/notifications?limit=5" "2. 学生1 通知列表"
check_api /tmp/tok_t "$BASE/notifications?limit=5" "2. 教师 通知列表"
check_api /tmp/tok_a "$BASE/notifications?limit=5" "2. 管理员 通知列表"
check_api /tmp/tok_e "$BASE/notifications?limit=5" "2. 企业学校 通知列表"

echo ""
echo "--- 3. 管理用户 ---"
check_api /tmp/tok_a "$ADMIN_BASE/users?page=1&pageSize=50" "3. 管理员列出用户"
check_api /tmp/tok_e "$ADMIN_BASE/users?page=1&pageSize=50" "4. 企业学校列出用户(租户隔离)"

echo ""
echo "--- 5. 复核流程 ---"
check_api /tmp/tok_t "$BASE/disputes?page=1&pageSize=20" "5. 教师列出争议"

echo ""
echo "=== 烟雾测试结果: PASS $PASS / FAIL $FAIL / 总计 $((PASS+FAIL)) ==="

# 清理
rm -f /tmp/tok_s1 /tmp/tok_s2 /tmp/tok_t /tmp/tok_a /tmp/tok_e
