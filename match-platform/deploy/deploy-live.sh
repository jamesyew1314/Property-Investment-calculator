#!/usr/bin/env bash
# Deploy the live PropMatch instance at https://kwongthye.com/match/
# Usage: KEY=/path/to/key.pem bash deploy/deploy-live.sh
# Default key: <repo>/.secrets/fangchan_key.pem
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"
KEY="${KEY:-$REPO_ROOT/.secrets/fangchan_key.pem}"
HOST="${HOST:-47.254.235.22}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/srv/propmatch}"
if [[ ! -f "$KEY" ]]; then
  echo "SSH key not found: $KEY" >&2
  exit 1
fi

# rsync/ssh -e needs a path without spaces; link/copy to /tmp if necessary.
SSH_KEY="$KEY"
CLEANUP_KEY=""
if [[ "$KEY" == *" "* ]]; then
  CLEANUP_KEY="$(mktemp /tmp/propmatch-key.XXXXXX)"
  cp "$KEY" "$CLEANUP_KEY"
  chmod 600 "$CLEANUP_KEY"
  SSH_KEY="$CLEANUP_KEY"
  trap 'rm -f "$CLEANUP_KEY"' EXIT
fi
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15)

if [[ ! -f "$APP_DIR/server.js" ]]; then
  echo "server.js not found under $APP_DIR" >&2
  exit 1
fi

echo "▸ 1/5 tests"
cd "$APP_DIR"
npm test

echo "▸ 2/5 upload code (data/.env/backups preserved)"
rsync -az --delete \
  --exclude '.DS_Store' --exclude 'data/' --exclude '.env' \
  --exclude 'backups/' --exclude 'node_modules/' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$APP_DIR/" "$REMOTE_USER@$HOST:$REMOTE_DIR/"

echo "▸ 3/5 permissions"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "
  set -e
  chown -R propmatch:propmatch '$REMOTE_DIR'
  find '$REMOTE_DIR' -type d -exec chmod 755 {} \;
  find '$REMOTE_DIR' -type f ! -name '.env' -exec chmod 644 {} \;
  chmod 600 '$REMOTE_DIR/.env'
  chmod 750 '$REMOTE_DIR/data' '$REMOTE_DIR/backups'
  chmod 755 '$REMOTE_DIR/scripts/reset-demo.js' '$REMOTE_DIR/deploy/backup.sh' '$REMOTE_DIR/deploy/deploy-live.sh'
"

echo "▸ 4/5 restart"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "
  set -e
  systemctl restart propmatch
  sleep 2
  systemctl is-active propmatch
  curl -fsS -m 5 http://127.0.0.1:4100/api/health
"

echo
echo "▸ 5/5 public checks"
curl -fsS -m 10 https://kwongthye.com/match/api/health
echo
curl -fsS -o /dev/null -w "  https://kwongthye.com/match/  %{http_code}\n" https://kwongthye.com/match/
echo "✓ live: https://kwongthye.com/match/?demo=1"
