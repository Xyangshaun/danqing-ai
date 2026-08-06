#!/bin/bash
set -e

cd /var/www/danqing-ai

# ============================================================
# 部署日志同步配置(任务包 C)
# 部署完成后,将部署详情(时间戳/版本/服务器/成功状态)同步到后端共享数据库,
# 供下游任务通过 GET /api/v1/deployments/latest 查询。
#
# 可从环境变量覆盖(生产常用):
#   DEPLOY_SYNC_API_URL   后端部署日志端点(默认直连本机 Node,避免依赖 nginx/DNS)
#   DEPLOY_SYNC_SECRET    共享密钥,必须与服务端 DEPLOY_SYNC_SECRET 一致;留空则跳过同步
#   DEPLOY_SERVER_ID      服务器标识(默认 hostname)
#   DEPLOY_VERSION        部署版本(默认 git commit 短 SHA,无 git 则用时间戳)
#   DEPLOY_BRANCH         分支(可选)
#   DEPLOY_DEPLOYER       部署执行人(可选)
# ============================================================
DEPLOY_SYNC_API_URL="${DEPLOY_SYNC_API_URL:-http://127.0.0.1:3000/api/v1/deployments/log}"
DEPLOY_SYNC_SECRET="${DEPLOY_SYNC_SECRET:-}"
DEPLOY_SERVER_ID="${DEPLOY_SERVER_ID:-$(hostname)}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git -C /var/www/danqing-ai rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')}"
DEPLOY_COMMIT_SHA="${DEPLOY_COMMIT_SHA:-$(git -C /var/www/danqing-ai rev-parse --short HEAD 2>/dev/null || echo '')}"
DEPLOY_VERSION="${DEPLOY_VERSION:-${DEPLOY_COMMIT_SHA:-v$(date +%Y%m%d-%H%M%S)}}"
DEPLOY_DEPLOYER="${DEPLOY_DEPLOYER:-}"

# JSON 字符串转义(防注入,仅用于脚本可控字段)
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# 备份当前部署后的校验详情(供成功同步时写入 details 字段)
DEPLOY_DETAILS="{}"

# 同步部署日志到后端(成功/失败均上报;网络失败不阻断部署主流程)
sync_deploy_log() {
  local status="$1"      # success / failed
  local error_msg="$2"   # 失败原因(仅 failed 时非空)
  if [ -z "$DEPLOY_SYNC_SECRET" ]; then
    echo "[sync] WARN: DEPLOY_SYNC_SECRET 未配置,跳过部署日志同步"
    return 0
  fi
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  local payload
  payload="{"
  payload+="\"timestamp\":\"$ts\","
  payload+="\"version\":\"$(json_escape "$DEPLOY_VERSION")\","
  payload+="\"serverId\":\"$(json_escape "$DEPLOY_SERVER_ID")\","
  payload+="\"status\":\"$status\","
  payload+="\"deployer\":\"$(json_escape "$DEPLOY_DEPLOYER")\","
  payload+="\"branch\":\"$(json_escape "$DEPLOY_BRANCH")\","
  payload+="\"commitSha\":\"$(json_escape "$DEPLOY_COMMIT_SHA")\","
  payload+="\"details\":$DEPLOY_DETAILS"
  if [ -n "$error_msg" ]; then
    payload+=",\"errorMessage\":\"$(json_escape "$error_msg")\""
  fi
  payload+="}"
  echo "[sync] Reporting deployment status=$status to $DEPLOY_SYNC_API_URL"
  local http_code
  http_code=$(curl -s -o /tmp/deploy-sync-response.json -w '%{http_code}' \
    -X POST "$DEPLOY_SYNC_API_URL" \
    -H 'Content-Type: application/json' \
    -H "X-Deploy-Secret: $DEPLOY_SYNC_SECRET" \
    --data-binary "$payload" \
    --max-time 10) || http_code="000"
  if [ "$http_code" = "200" ]; then
    echo "[sync] OK: 部署日志已同步 (status=$status)"
  else
    echo "[sync] WARN: 部署日志同步失败,HTTP=$http_code(不影响部署主流程)"
    cat /tmp/deploy-sync-response.json 2>/dev/null || true
  fi
}

# 部署结束(成功或失败)时统一上报部署日志
# 用 EXIT trap 而非 ERR trap:ERR 不会在显式 `exit 1`(校验失败路径)时触发,
# 而 EXIT trap 在脚本任何方式退出(正常结束 / exit / set -e 触发)时都会执行,
# 通过 $? 判断成功/失败,确保失败状态可靠上报到共享存储。
report_on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    sync_deploy_log "failed" "deploy-ssh.sh exited with code $rc" || true
  else
    sync_deploy_log "success" "" || true
  fi
  return 0
}
trap report_on_exit EXIT

# 1. 备份当前 dist
TS=$(date +%Y%m%d_%H%M%S)
echo "[1/5] Backing up current dist -> dist.bak.$TS"
sudo cp -r dist "dist.bak.$TS"

# 2. 解压新 dist 到临时目录
echo "[2/5] Unzipping new dist"
sudo rm -rf /tmp/dist.new
mkdir -p /tmp/dist.new
sudo unzip -o /tmp/dist-new.zip -d /tmp/dist.new > /dev/null
sudo chown -R ubuntu:ubuntu /tmp/dist.new

# 3. 校验:确保新 bundle 没有 trae-api-cn 外链
echo "[3/5] Verifying new bundle has no trae-api-cn.mchost.guru URLs"
HITS=$(grep -rE 'trae-api-cn\.mchost\.guru' /tmp/dist.new/assets/*.js | wc -l)
if [ "$HITS" -gt 0 ]; then
  echo "FAIL: new bundle still has $HITS trae-api-cn references"
  grep -rEo 'trae-api-cn\.mchost\.guru[^"'\'']*' /tmp/dist.new/assets/*.js | head -5
  exit 1
fi
echo "OK: 0 trae-api-cn URLs in new bundle"

# 3.25. 校验:确保新 bundle 没有 localhost 硬编码
LOCALHOST_HITS=$(grep -rE 'localhost:3000|localhost:5173|127\.0\.0\.1:3000|127\.0\.0\.1:5173' /tmp/dist.new/assets/*.js | wc -l)
if [ "$LOCALHOST_HITS" -gt 0 ]; then
  echo "FAIL: new bundle still has $LOCALHOST_HITS localhost references"
  grep -rE 'localhost:3000|localhost:5173|127\.0\.0\.1:3000|127\.0\.0\.1:5173' /tmp/dist.new/assets/*.js | head -5
  exit 1
fi
echo "OK: 0 localhost URLs in new bundle"

# 3.5. 校验:index-*.js 中是否包含 /api/v1 与 danqing.site 飞书回调
echo "[3.5/5] Verifying /api/v1 + danqing.site in bundle"
BUNDLE=$(ls /tmp/dist.new/assets/index-*.js | head -1)
if ! grep -q '/api/v1' "$BUNDLE"; then
  echo "FAIL: /api/v1 missing from bundle"
  exit 1
fi
if ! grep -q 'danqing.site/app/auth/feishu/callback' "$BUNDLE"; then
  echo "FAIL: danqing.site feishu callback missing from bundle"
  exit 1
fi
echo "OK: /api/v1 and danqing.site present"

# 4. 替换 dist
echo "[4/5] Swapping dist"
sudo rm -rf dist
sudo mv /tmp/dist.new dist
sudo chown -R www-data:www-data dist
sudo chmod -R a+rX dist

# 5. 验证 nginx 仍可访问
echo "[5/5] Done. nginx status:"
NX_STATUS=$(sudo systemctl is-active nginx)
echo "$NX_STATUS"
echo "---"
echo "Index entry:"
ls -la dist/index.html
echo "---"
echo "Asset count:"
ASSET_COUNT=$(ls dist/assets/ | wc -l)
echo "$ASSET_COUNT"

# ============================================================
# 部署成功 → 收集校验详情(备份目录/nginx状态/资源数)
# 由 EXIT trap 的 report_on_exit 统一上报成功状态(含此 details)
# ============================================================
DEPLOY_DETAILS="{\"backupDir\":\"dist.bak.$TS\",\"nginxStatus\":\"$(json_escape "$NX_STATUS")\",\"assetCount\":${ASSET_COUNT:-0}}"
