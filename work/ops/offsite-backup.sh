#!/bin/bash
# 异地备份：把当日 dump + 校验文件上传到阿里云 OSS（新加坡/吉隆坡区域均可）
# 依赖：ossutil（阿里云官方命令行工具）。未配置时脚本会明确报错并通知，不会静默失败。
# 配置一次即可：
#   1) OSS 控制台建 Bucket（同区域 oss-ap-southeast-5，读写权限「私有」）
#   2) RAM 用户只给该 Bucket 的 PutObject/GetObject 权限，生成 AccessKey
#   3) ossutil config -e oss-ap-southeast-5.aliyuncs.com -i <AK> -k <SK>   （写入 /root/.ossutilconfig）
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
ENDPOINT="${OSS_ENDPOINT:-oss-ap-southeast-5.aliyuncs.com}"

if [ -z "$BUCKET" ]; then
  log "SKIP not configured ($CONF missing OSS_BUCKET)"; exit 0
fi
if [ ! -x "$OSSUTIL" ]; then
  log "FAIL ossutil not found ($OSSUTIL)"; alert "服务器上找不到 ossutil，异地备份未执行。"; exit 1
fi
if [ ! -f "$DUMP" ]; then
  log "FAIL dump missing $DUMP"; alert "找不到今天的备份文件 $DUMP"; exit 1
fi

if ! "$OSSUTIL" -e "$ENDPOINT" cp -f "$DUMP" "oss://$BUCKET/db/$D/" >> "$LOG" 2>&1; then
  log "FAIL upload $DUMP"; alert "上传 $DUMP 到 oss://$BUCKET/db/$D/ 失败，请检查 AccessKey/网络。"; exit 1
fi
[ -f "$DUMP.sha256" ] && "$OSSUTIL" -e "$ENDPOINT" cp -f "$DUMP.sha256" "oss://$BUCKET/db/$D/" >> "$LOG" 2>&1

# 只保留 60 天的远端对象
"$OSSUTIL" -e "$ENDPOINT" rm -r -f "oss://$BUCKET/db/$(date -d '60 days ago' +%F)/" >> "$LOG" 2>&1 || true

SIZE=$(du -h "$DUMP" | cut -f1)
log "OK oss://$BUCKET/db/$D/fangchan-$D.dump size=$SIZE"
echo "$(date +%s)" > /srv/fangchan/logs/.offsite-last
