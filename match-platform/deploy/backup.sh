#!/usr/bin/env bash
# 每日备份 PropMatch 的 JSON 数据（保留 60 天）
# crontab: 30 3 * * * /srv/propmatch/deploy/backup.sh >> /var/log/propmatch-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/propmatch}"
BACKUP_DIR="${BACKUP_DIR:-/srv/propmatch/backups}"
KEEP_DAYS="${KEEP_DAYS:-60}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DB="$APP_DIR/data/db.json"

if [[ ! -f "$DB" ]]; then
  echo "[$(date -u +%FT%TZ)] ERROR: $DB not found" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/db-$STAMP.json.gz"

# 服务使用原子写入（tmp + rename），直接拷贝是安全的一致快照
gzip -9 -c "$DB" > "$OUT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" > "$OUT.sha256"
else
  shasum -a 256 "$OUT" > "$OUT.sha256"
fi

# 简单的完整性检查：能解压、能解析 JSON
if ! gzip -t "$OUT"; then
  echo "[$(date -u +%FT%TZ)] ERROR: gzip check failed: $OUT" >&2
  exit 1
fi
if ! gzip -dc "$OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('seq'), 'bad shape'"; then
  echo "[$(date -u +%FT%TZ)] ERROR: JSON check failed: $OUT" >&2
  exit 1
fi

# 清理过期备份（只清 db-*.json.gz 与其 sha256）
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.json.gz' -o -name 'db-*.json.gz.sha256' \) \
  -mtime "+$KEEP_DAYS" -delete

# 可选：同步到 OSS / S3（按需启用，凭据不要写进仓库）
# ossutil cp "$OUT" "oss://your-bucket/propmatch/$(date +%F)/" --force
# aws s3 cp "$OUT" "s3://your-bucket/propmatch/$(date +%F)/" --sse AES256

echo "[$(date -u +%FT%TZ)] OK $OUT $(du -h "$OUT" | cut -f1)"
