#!/bin/bash
# 异地备份：把当日 dump + 校验文件上传到阿里云 OSS（新加坡/吉隆坡区域均可）
# 依赖：ossutil（阿里云官方命令行工具）。未配置时脚本会明确报错并通知，不会静默失败。
# 配置一次即可：
#   1) OSS 控制台建 Bucket（同区域「马来西亚（吉隆坡）」oss-ap-southeast-3，读写权限「私有」）
#   2) RAM 用户只给该 Bucket 的 PutObject/GetObject 权限，生成 AccessKey
#   3) ossutil config -e oss-ap-southeast-3.aliyuncs.com -i <AK> -k <SK>   （写入 /root/.ossutilconfig）
#   4) 把桶名写进 /etc/fangchan-offsite.conf：  OSS_BUCKET=kwongthye-backup
set -uo pipefail

CONF=/etc/fangchan-offsite.conf
DIR=/srv/fangchan/backups
LOG=/srv/fangchan/logs/offsite.log
D=$(date +%F)
DUMP="$DIR/fangchan-$D.dump"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
alert() { node /srv/fangchan/ops/notify.js "[KWONG THYE] 异地备份失败" "$1" >> "$LOG" 2>&1 || true; }

[ -f "$CONF" ] && . "$CONF"
BUCKET="${OSS_BUCKET:-}"
OSSUTIL="${OSSUTIL_BIN:-$(command -v ossutil || echo /usr/local/bin/ossutil)}"
ENDPOINT="${OSS_ENDPOINT:-oss-ap-southeast-3.aliyuncs.com}"   # 吉隆坡，与 ECS 同区

if [ -z "$BUCKET" ]; then
  log "SKIP not configured ($CONF missing OSS_BUCKET)"; exit 0
fi
if [ ! -x "$OSSUTIL" ]; then
  log "FAIL ossutil not found ($OSSUTIL)"; alert "服务器上找不到 ossutil，异地备份未执行。"; exit 1
fi
if [ ! -f "$DUMP" ]; then
  log "FAIL dump missing $DUMP"; alert "找不到今天的备份文件 $DUMP"; exit 1
fi

# 加密后再上传（密钥在 /root/.backup-key，绝不上传；丢了就没法解密，务必另存一份离线）
KEY=/root/.backup-key
UP="$DUMP"
if [ -f "$KEY" ]; then
  UP="/tmp/$(basename "$DUMP").enc"
  if ! openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$DUMP" -out "$UP" -pass "file:$KEY" 2>>"$LOG"; then
    log "FAIL encrypt $DUMP"; alert "备份加密失败，异地备份已中止。"; rm -f "$UP"; exit 1
  fi
  sha256sum "$UP" | awk '{print $1}' > "$UP.sha256"
  log "encrypted $(du -h "$UP" | cut -f1)"
fi

if ! "$OSSUTIL" -e "$ENDPOINT" cp -f "$UP" "oss://$BUCKET/db/$D/" >> "$LOG" 2>&1; then
  log "FAIL upload $UP"; alert "上传 $(basename "$UP") 到 oss://$BUCKET/db/$D/ 失败，请检查 AccessKey/网络。"; exit 1
fi
[ -f "$UP.sha256" ] && "$OSSUTIL" -e "$ENDPOINT" cp -f "$UP.sha256" "oss://$BUCKET/db/$D/" >> "$LOG" 2>&1
[ "$UP" != "$DUMP" ] && rm -f "$UP" "$UP.sha256"

# 只保留 60 天的远端对象
"$OSSUTIL" -e "$ENDPOINT" rm -r -f "oss://$BUCKET/db/$(date -d '60 days ago' +%F)/" >> "$LOG" 2>&1 || true

SIZE=$(du -h "$DUMP" | cut -f1)
log "OK oss://$BUCKET/db/$D/$(basename "$UP") size=$SIZE $([ -f "$KEY" ] && echo encrypted || echo plain)"
echo "$(date +%s)" > /srv/fangchan/logs/.offsite-last
