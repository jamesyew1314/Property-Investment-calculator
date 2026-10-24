#!/bin/bash
# 本地执行：把当前 web/ 发布到 staging（不动正式站点）
# 用法：bash work/ops/deploy-staging.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
KEY=.secrets/fangchan_key.pem
HOST=root@47.254.235.22

echo "→ 上传 web/ 到 staging"
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=no" web/ "$HOST:/srv/fangchan/staging/web/"
# staging 的 API 走 /staging/api/，避免打到正式 API 与正式数据库
ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" '
  cd /srv/fangchan/staging/web
  find . -type f \( -name "*.html" -o -name "*.js" -o -name "*.webmanifest" \) -print0 | \
    xargs -0 sed -i "s#\"/api#\"/staging/api#g; s#'"'"'/api#'"'"'/staging/api#g"
  chmod -R a+rX .
'
echo "→ 检查"
curl -s -o /dev/null -w "  staging 首页  %{http_code}\n" -u "staging:$(cut -d: -f2 <(ssh -i $KEY -o StrictHostKeyChecking=no $HOST 'cat /root/.staging-credentials'))" https://kwongthye.com/staging/
curl -s -u "staging:$(cut -d: -f2 <(ssh -i $KEY -o StrictHostKeyChecking=no $HOST 'cat /root/.staging-credentials'))" https://kwongthye.com/staging/api/health
echo
echo "完成：https://kwongthye.com/staging/"
