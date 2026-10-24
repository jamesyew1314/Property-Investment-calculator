#!/bin/bash
# KWONG THYE 备份恢复演练（每月 1 号）
# 把最新 dump 真正恢复到 scratch 库，比对每张表行数，然后删除 scratch 库并邮件汇报
set -uo pipefail

DB=fangchan
TESTDB=fangchan_restore_drill
DIR=/srv/fangchan/backups
LOG=/srv/fangchan/logs/restore-drill.log

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

DUMP=$(ls -t "$DIR"/$DB-*.dump 2>/dev/null | head -1)
if [ -z "${DUMP:-}" ]; then log "FAIL no dump found"; exit 1; fi

# 完整性：有 sha256 就校验
if [ -f "$DUMP.sha256" ]; then
  ( cd "$DIR" && sha256sum -c "$(basename "$DUMP").sha256" > /dev/null 2>&1 ) \
    && log "checksum OK" || { log "FAIL checksum $(basename "$DUMP")"; exit 1; }
fi

sudo -u postgres dropdb --if-exists "$TESTDB" >/dev/null 2>&1
sudo -u postgres createdb "$TESTDB" || { log "FAIL createdb"; exit 1; }

START=$(date +%s)
if ! sudo -u postgres pg_restore --no-owner -d "$TESTDB" "$DUMP" > /tmp/.drill-restore.log 2>&1; then
  ERRS=$(grep -ci error /tmp/.drill-restore.log || true)
  log "WARN pg_restore reported errors ($ERRS) — comparing anyway"
fi
SECS=$(( $(date +%s) - START ))

BAD=0
REPORT=""
for t in $(sudo -u postgres psql -tA -d "$DB" -c "select tablename from pg_tables where schemaname='public' order by 1"); do
  P=$(sudo -u postgres psql -tA -d "$DB" -c "select count(*) from \"$t\"" 2>/dev/null || echo "ERR")
  R=$(sudo -u postgres psql -tA -d "$TESTDB" -c "select count(*) from \"$t\"" 2>/dev/null || echo "ERR")
  if [ "$P" = "$R" ]; then MARK="ok"; else MARK="DIFF"; BAD=$((BAD+1)); fi
  REPORT="${REPORT}${t}: live=${P} restored=${R} ${MARK}\n"
done

sudo -u postgres dropdb --if-exists "$TESTDB" >/dev/null 2>&1

STATUS="PASS"
[ "$BAD" -gt 0 ] && STATUS="FAIL"
log "$STATUS $DUMP restore=${SECS}s mismatches=$BAD"

BODY="恢复演练结果 / Restore drill: $STATUS
文件 / File: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))
耗时 / Duration: ${SECS}s
不一致表 / Mismatched tables: $BAD

$(printf "$REPORT")

— kwongthye.com 自动恢复演练"

node /srv/fangchan/ops/notify.js "[KWONG THYE] 恢复演练 $STATUS / Restore drill" "$BODY" >> "$LOG" 2>&1 || log "mail skipped"
[ "$STATUS" = "PASS" ] || exit 1
