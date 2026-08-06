#!/bin/bash
# 部署前检查脚本 - 确认服务器当前状态
echo "======== 1. Git 状态 ========"
cd /var/www/danqing-ai
git rev-parse --short HEAD
git status -sb | head -8

echo "======== 2. PM2 当前进程 ========"
pm2 jlist > /tmp/pm2.json 2>/dev/null
node -e "const d=require('/tmp/pm2.json');d.forEach(p=>console.log('exec:',p.pm2_env.pm_exec_path));d.forEach(p=>console.log('status:',p.pm2_env.status,'restarts:',p.pm2_env.restart_time,'uptime:',p.pm2_env.pm_uptime?Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)+'s':'n/a','node_args:',p.pm2_env.node_args))"

echo "======== 3. dist 编译产物 ========"
ls -la /var/www/danqing-ai/server/dist/index.js 2>/dev/null
echo "--- dist 是否含部署模块 ---"
grep -rl "deployments/latest" /var/www/danqing-ai/server/dist 2>/dev/null | head

echo "======== 4. 数据库迁移 ========"
cd /var/www/danqing-ai/server
npx prisma migrate status 2>&1 | tail -6

echo "======== 5. tsc 编译检查 ========"
npx tsc -p tsconfig.json --noEmit > /tmp/tsc.log 2>&1
echo "TSC_EXIT=$?"
head -5 /tmp/tsc.log
echo "TOTAL_ERRORS=$(grep -c 'error TS' /tmp/tsc.log)"

echo "======== 6. 健康检查 ========"
curl -s -m 5 http://127.0.0.1:3000/health || echo "HEALTH_FAIL"