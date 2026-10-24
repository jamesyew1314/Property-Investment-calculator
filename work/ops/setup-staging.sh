#!/bin/bash
# 建立/刷新 staging 预发环境（在服务器上以 root 运行）
#   https://kwongthye.com/staging/        静态站点（Basic Auth 保护）
#   https://kwongthye.com/staging/api/    staging API（127.0.0.1:3001 + 独立数据库）
# 目的：正式上线前先在 staging 完整演练（含账号/API），数据库是正式库的克隆，邮件只写日志不发真信。
set -euo pipefail

ROOT=/srv/fangchan
STG=$ROOT/staging
CRED=/root/.staging-credentials
NGX=/etc/nginx/sites-available/fangchan

mkdir -p "$STG/web" "$STG/api" "$ROOT/logs"

# ---------- 1. API 代码（复用正式依赖） ----------
cp "$ROOT/api/server.js" "$ROOT/api/mail-layout.js" "$ROOT/api/receipt-pdf.js" "$ROOT/api/admin.js" "$STG/api/" 2>/dev/null || true
cp "$ROOT/api/package.json" "$STG/api/" 2>/dev/null || true
if [ ! -e "$STG/api/node_modules" ]; then
  ln -s "$ROOT/api/node_modules" "$STG/api/node_modules"
fi

# ---------- 2. staging 数据库（克隆正式库） ----------
sudo -u postgres psql -tA -c "select 1 from pg_database where datname='fangchan_staging'" | grep -q 1 || \
  sudo -u postgres createdb -O fangchan_app fangchan_staging
sudo -u postgres pg_dump -Fc fangchan > /tmp/.stg.dump
sudo -u postgres psql -q -d fangchan_staging -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO fangchan_app;" >/dev/null
sudo -u postgres pg_restore --no-owner -d fangchan_staging /tmp/.stg.dump >/dev/null 2>&1 || true
sudo -u postgres psql -q -d fangchan_staging -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO fangchan_app; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO fangchan_app;" >/dev/null
rm -f /tmp/.stg.dump

# ---------- 3. staging .env（不发真邮件；cookie 与正式隔离） ----------
DBURL=$(grep '^DATABASE_URL=' "$ROOT/api/.env" | cut -d= -f2- | sed 's#/fangchan$#/fangchan_staging#')
{
  echo "DATABASE_URL=$DBURL"
  echo "PORT=3001"
  echo "APP_VERSION=staging"
  echo "NODE_ENV=staging"
  echo "SESSION_COOKIE_NAME=fc_sid_stg"
  echo "SESSION_COOKIE_PATH=/staging/"
  echo "ADMIN_COOKIE_NAME=fc_admin_stg"
  grep -E '^ADMIN_|^MAIL_FROM=|^MAIL_REPLY_TO=' "$ROOT/api/.env" || true
  echo "# 故意不配 SMTP：staging 的邮件只写 /srv/fangchan/staging/api/mail.log"
} > "$STG/api/.env"
chown fangchan:fangchan "$STG/api/.env" "$STG/api"/*.js 2>/dev/null || true
chmod 600 "$STG/api/.env"

# ---------- 4. systemd ----------
cat > /etc/systemd/system/fangchan-api-staging.service <<'UNIT'
[Unit]
Description=Fangchan staging API (port 3001)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=fangchan
WorkingDirectory=/srv/fangchan/staging/api
EnvironmentFile=/srv/fangchan/staging/api/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/fangchan/staging/api
StandardOutput=append:/srv/fangchan/logs/staging-api.log
StandardError=append:/srv/fangchan/logs/staging-api.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable fangchan-api-staging >/dev/null 2>&1
systemctl restart fangchan-api-staging
sleep 1
systemctl is-active fangchan-api-staging >/dev/null || { echo "staging api failed"; journalctl -u fangchan-api-staging -n 20 --no-pager; exit 1; }

# ---------- 5. Basic Auth ----------
if [ ! -f "$CRED" ]; then
  PW=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)
  echo "staging:$PW" > "$CRED"
  chmod 600 "$CRED"
fi
STG_USER=$(cut -d: -f1 "$CRED")
STG_PASS=$(cut -d: -f2 "$CRED")
printf "%s:%s\n" "$STG_USER" "$(openssl passwd -apr1 "$STG_PASS")" > /etc/nginx/.htpasswd-staging
chown root:www-data /etc/nginx/.htpasswd-staging
chmod 640 /etc/nginx/.htpasswd-staging

# ---------- 6. nginx ----------
if ! grep -q "location ^~ /staging/" "$NGX"; then
python3 - "$NGX" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
block = '''    # ---- staging 预发环境（Basic Auth）----
    location = /staging { return 301 /staging/; }
    location ^~ /staging/api/ {
        auth_basic "KWONG THYE staging";
        auth_basic_user_file /etc/nginx/.htpasswd-staging;
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
    location ^~ /staging/ {
        auth_basic "KWONG THYE staging";
        auth_basic_user_file /etc/nginx/.htpasswd-staging;
        alias /srv/fangchan/staging/web/;
        index index.html;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store" always;
    }

'''
anchor = "    location /api/ {"
assert s.count(anchor) == 1
open(p, "w", encoding="utf-8").write(s.replace(anchor, block + anchor))
print("nginx patched")
PY
else
  echo "nginx already has staging block"
fi
nginx -t && systemctl reload nginx

echo
echo "staging 就绪："
echo "  网址   https://kwongthye.com/staging/"
echo "  账号   $STG_USER"
echo "  密码   $STG_PASS   （存在 $CRED）"
echo "  API    https://kwongthye.com/staging/api/health"
