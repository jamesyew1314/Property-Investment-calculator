#!/bin/bash
# 每日把正式库克隆到 staging（预发环境用真实数据，但不影响正式库）
# cron: 30 4 * * * root /srv/fangchan/ops/staging-refresh.sh
set -uo pipefail

SRC=fangchan
DST=fangchan_staging
LOG=/srv/fangchan/logs/staging-refresh.log
TMP=/tmp/.staging-refresh.dump

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# 1) 备份正式库（已验证过的脚本，失败即中止，避免把坏数据灌进 staging）
if ! /srv/fangchan/backups/backup.sh >> "$LOG" 2>&1; then
  log "FAIL production backup — staging refresh aborted"
  exit 1
fi

# 2) dump 正式库
if ! sudo -u postgres pg_dump -Fc "$SRC" > "$TMP"; then
  log "FAIL pg_dump $SRC"; rm -f "$TMP"; exit 1
fi

# 3) 重建 staging schema 并恢复
sudo -u postgres dropdb --if-exists "$DST" >/dev/null 2>&1
if ! sudo -u postgres createdb -O fangchan_app "$DST"; then
  log "FAIL createdb $DST"; rm -f "$TMP"; exit 1
fi
sudo -u postgres pg_restore --no-owner -d "$DST" "$TMP" > /tmp/.staging-restore.log 2>&1
ERRS=$(grep -ci "error" /tmp/.staging-restore.log || true)
sudo -u postgres psql -q -d "$DST" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO fangchan_app; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO fangchan_app;" >/dev/null
rm -f "$TMP"

TABLES=$(sudo -u postgres psql -tA -d "$DST" -c "select count(*) from pg_tables where schemaname='public'" | tr -d ' ')
LIVE=$(sudo -u postgres psql -tA -d "$SRC" -c "select count(*) from pg_tables where schemaname='public'" | tr -d ' ')
if [ "$TABLES" != "$LIVE" ]; then
  log "FAIL restored tables=$TABLES live=$LIVE"
  exit 1
fi

# 4) 重启 staging API（连接会失效）
systemctl restart fangchan-api-staging
sleep 1
if systemctl is-active --quiet fangchan-api-staging; then
  log "OK staging refreshed ($TABLES tables, restore warnings=$ERRS)"
else
  log "FAIL staging api not active after restart"; exit 1
fi
