#!/bin/bash
# KWONG THYE 一键发布（本地或 GitHub Actions 都用这一个脚本）
#   KEY=私钥路径 HOST=47.254.235.22 bash deploy/deploy.sh
# 步骤：跑回归 → 传静态 → 传后端 → 重启 → 健康检查
set -euo pipefail

cd "$(dirname "$0")/.."

KEY="${KEY:-.secrets/fangchan_key.pem}"
HOST="${HOST:-47.254.235.22}"
USER_="${USER_:-root}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP="scp -i $KEY -o StrictHostKeyChecking=no"
RSYNC="rsync -az -e \"ssh -i $KEY -o StrictHostKeyChecking=no\""

echo "▸ 1/5 回归测试"
node web/test.js | tail -1
node work/test-library.js | tail -1

echo "▸ 2/5 上传静态站点"
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  --exclude '.DS_Store' \
  web/ "$USER_@$HOST:/srv/fangchan/web/"

echo "▸ 3/5 上传后端"
$SCP work/api-server.js "$USER_@$HOST:/srv/fangchan/api/server.js"
for f in mail-layout.js receipt-pdf.js report-pdf.js admin.js send-reminders.js send-monthly.js \
         library-api.js library-core.js library-taxonomy.js public-api.js; do
  [ -f "work/$f" ] && $SCP "work/$f" "$USER_@$HOST:/srv/fangchan/api/$f"
done

echo "▸ 4/5 修正权限并重启"
$SSH "$USER_@$HOST" '
  chown -R fangchan:fangchan /srv/fangchan/api/*.js
  chmod 644 /srv/fangchan/api/*.js
  chmod -R a+rX /srv/fangchan/web
  systemctl restart fangchan-api
  sleep 2
'

echo "▸ 5/5 健康检查"
HEALTH=$($SSH "$USER_@$HOST" 'curl -s -m 8 localhost:3000/api/health')
echo "  $HEALTH"
echo "$HEALTH" | grep -q '"ok":true' || { echo "✗ 健康检查失败"; exit 1; }

echo "✓ 发布完成：https://kwongthye.com/"
