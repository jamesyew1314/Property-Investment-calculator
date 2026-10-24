#!/bin/bash
# KWONG THYE 数据库备份（每日）
# 校验：dump 可读 + 表数量正确 + sha256 记录；保留 30 天
set -uo pipefail

DB=fangchan
DIR=/srv/fangchan/backups
LOG=/srv/fangchan/logs/backup.log
D=$(date +%F)
OUT="$DIR/$DB-$D.dump"
TMP="$DIR/.tmp-$DB-$D.dump"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

mkdir -p "$DIR"
rm -f "$TMP"

if ! sudo -u postgres pg_dump -Fc "$DB" > "$TMP"; then
  log "FAIL pg_dump $DB"
  rm -f "$TMP"
  exit 1
fi

# 1) dump 目录可读
if ! sudo -u postgres pg_restore -l "$TMP" > /tmp/.bk-toc 2>/dev/null; then
  log "FAIL dump unreadable"
  rm -f "$TMP"; exit 1
fi

# 2) 表数量必须与线上一致（避免备份到旧库/半成品）
LIVE=$(sudo -u postgres psql -tA -d "$DB" -c "select count(*) from pg_tables where schemaname='public'" | tr -d ' ')
DUMPED=$(grep -c "TABLE DATA" /tmp/.bk-toc)
if [ "$LIVE" != "$DUMPED" ]; then
  log "FAIL table mismatch live=$LIVE dumped=$DUMPED"
  rm -f "$TMP"; exit 1
fi

mv "$TMP" "$OUT"
SHA=$(sha256sum "$OUT" | cut -d' ' -f1)
SIZE=$(du -h "$OUT" | cut -f1)
echo "$SHA  $DB-$D.dump" > "$OUT.sha256"

find "$DIR" -name "$DB-*.dump" -mtime +30 -delete
find "$DIR" -name "$DB-*.dump.sha256" -mtime +30 -delete
find "$DIR" -name ".tmp-*" -mtime +1 -delete

log "OK $DB-$D.dump size=$SIZE tables=$DUMPED sha256=${SHA:0:16}…"
