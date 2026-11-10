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
node work/test-import.js
node work/test-library.js | tail -1
node work/test-brand.js | tail -1
node work/test-static.js
node work/test-i18n.js

echo "▸ 2/5 上传静态站点"
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  --exclude '.DS_Store' \
  web/ "$USER_@$HOST:/srv/fangchan/web/"

echo "▸ 3/5 上传后端"
$SCP work/api-server.js "$USER_@$HOST:/srv/fangchan/api/server.js"
for f in mail-layout.js receipt-pdf.js report-pdf.js admin.js send-reminders.js send-monthly.js \
         library-api.js library-core.js library-taxonomy.js public-api.js agent-api.js agent-core.js agent-page.js public-page.js ai-copy.js digest.js news.js listing-code.js match.js billplz.js import-core.js import-ai.js oss.js migrate-oss.js; do
  [ -f "work/$f" ] && $SCP "work/$f" "$USER_@$HOST:/srv/fangchan/api/$f"
done

echo "▸ 3.5/5 应用数据库迁移"
$SCP work/migrations/030_brand.sql "$USER_@$HOST:/tmp/030_brand.sql"
$SCP work/migrations/031_listing_fields.sql "$USER_@$HOST:/tmp/031_listing_fields.sql"
$SCP work/migrations/032_form_v3.sql "$USER_@$HOST:/tmp/032_form_v3.sql"
$SCP work/migrations/033_pool_integrity.sql "$USER_@$HOST:/tmp/033_pool_integrity.sql"
$SCP work/migrations/034_cobroke.sql "$USER_@$HOST:/tmp/034_cobroke.sql"
$SCP work/migrations/035_client_prefs.sql "$USER_@$HOST:/tmp/035_client_prefs.sql"
$SSH "$USER_@$HOST" 'sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/030_brand.sql >/dev/null && sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/031_listing_fields.sql >/dev/null && sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/032_form_v3.sql >/dev/null && sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/033_pool_integrity.sql >/dev/null && sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/034_cobroke.sql >/dev/null && sudo -u postgres psql -d fangchan -v ON_ERROR_STOP=1 -f /tmp/035_client_prefs.sql >/dev/null && echo "  migrations ok"'

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

echo "▸ 线上烟雾测试"
node work/test-smoke.js

echo "✓ 发布完成：https://kwongthye.com/"
