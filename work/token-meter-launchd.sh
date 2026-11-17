#!/bin/bash
# launchd wrapper: absolute paths, key from .secrets, config reloaded by token-meter every loop.
set -u
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ" || exit 1
KEY_FILE="$PROJ/.secrets/token_meter_key"
[ -r "$KEY_FILE" ] || { echo "missing $KEY_FILE"; exit 1; }
export TOKEN_METER_KEY="$(cat "$KEY_FILE")"
exec /usr/local/bin/node "$PROJ/work/token-meter.js" \
  --config "$PROJ/work/token-meter.config.json" \
  --interval 30
