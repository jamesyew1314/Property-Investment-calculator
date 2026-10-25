#!/bin/bash
# 把计算器搬到 https://calc.kwongthye.com （在服务器上以 root 运行）
# 前提：DNS 已把 calc.kwongthye.com 指向 47.254.235.22（阿里云 DNS 加一条 A 记录）
# 用法：bash /srv/fangchan/ops/setup-calc-subdomain.sh
set -euo pipefail

DOMAIN=calc.kwongthye.com
CONF=/etc/nginx/sites-available/calc-subdomain
IP=47.254.235.22

echo "→ 检查 DNS"
GOT=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
if [ "$GOT" != "$IP" ]; then
  echo "✗ $DOMAIN 当前解析：'${GOT:-无}'，需要先加 A 记录指向 $IP"
  echo "  阿里云控制台 → 云解析 DNS → kwongthye.com → 添加记录：主机记录 calc，类型 A，记录值 $IP"
  exit 2
fi
echo "  DNS OK：$DOMAIN → $GOT"

if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  echo "→ 申请证书"
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email || {
      echo "✗ 证书申请失败（确认 80 端口可达、DNS 已生效）"; exit 3; }
fi

echo "→ 写 nginx 站点"
cat > "$CONF" <<CONFEOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
    server_tokens off;
    charset utf-8;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    root /srv/fangchan/web/calc;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json application/manifest+json;
    gzip_min_length 1024;

    # 与主站共用同一个后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }
    # 法律页 / 企业站仍在主域
    location = /privacy { return 301 https://kwongthye.com/privacy/; }
    location ^~ /privacy/ { return 301 https://kwongthye.com/privacy/; }
    location = /terms { return 301 https://kwongthye.com/terms/; }
    location ^~ /terms/ { return 301 https://kwongthye.com/terms/; }
    location = /pricing { return 301 https://kwongthye.com/pricing/; }
    location ^~ /pricing/ { return 301 https://kwongthye.com/pricing/; }
    # 主域共用的静态资源（PWA 图标、Cookie 脚本、404 页）
    location ~ ^/(icon-256\.png|icon-512\.png|og-image\.png|cookie-consent\.js|404\.html)$ {
        root /srv/fangchan/web;
    }
    error_page 404 /404.html;
    location / { try_files \$uri \$uri/ =404; }

    access_log /srv/fangchan/logs/calc-access.log;
    error_log  /srv/fangchan/logs/calc-error.log;
}
CONFEOF

ln -sf "$CONF" /etc/nginx/sites-enabled/calc-subdomain
nginx -t && systemctl reload nginx
echo "→ 验证"
curl -s -o /dev/null -w "  https://$DOMAIN/       %{http_code}\n" "https://$DOMAIN/"
curl -s -o /dev/null -w "  https://$DOMAIN/api/health  %{http_code}\n" "https://$DOMAIN/api/health"
echo "完成。主站 /calc/ 仍然可用（旧链接与分享链接不会失效）。"
