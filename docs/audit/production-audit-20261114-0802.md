# 生产审计 2026-11-14 08:02 UTC

```
## 基本信息
iZ8psjelbiuyck5t1w2yncZ
Sat Nov 14 04:02:34 PM +08 2026
 16:02:34 up 33 min,  2 users,  load average: 0.01, 0.02, 0.00

## 磁盘
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda3        40G   11G   27G  29% /

## 内存
               total        used        free      shared  buff/cache   available
Mem:            3627         817        1958          19        1098        2809
Swap:           4095           0        4095

## 服务状态
nginx            active
postgresql       active
fangchan-api     active

## 最新备份
total 4.7M
-rw-r--r-- 1 root root   91 Nov 14 04:30 fangchan-2026-11-14.dump.sha256
-rw-r--r-- 1 root root 281K Nov 14 04:30 fangchan-2026-11-14.dump
-rw-r--r-- 1 root root   91 Nov 13 04:30 fangchan-2026-11-13.dump.sha256
-rw-r--r-- 1 root root 281K Nov 13 04:30 fangchan-2026-11-13.dump
-rw-r--r-- 1 root root   91 Nov 12 04:30 fangchan-2026-11-12.dump.sha256
-rw-r--r-- 1 root root 281K Nov 12 04:30 fangchan-2026-11-12.dump
-rw-r--r-- 1 root root   91 Nov 11 04:30 fangchan-2026-11-11.dump.sha256

## 备份相关 cron
30 3 * * * /usr/local/bin/yekeep-backup.sh

## 数据库大小
11 MB

## Nginx 配置检查
2026/11/14 16:02:34 [warn] 4781#4781: protocol options redefined for [::]:443 in /etc/nginx/sites-enabled/propmatch-subdomain:17
2026/11/14 16:02:34 [warn] 4781#4781: conflicting server name "www.yekeep.com" on 0.0.0.0:80, ignored
2026/11/14 16:02:34 [warn] 4781#4781: conflicting server name "www.yekeep.com" on [::]:80, ignored
2026/11/14 16:02:34 [warn] 4781#4781: conflicting server name "www.yekeep.com" on 0.0.0.0:443, ignored
2026/11/14 16:02:34 [warn] 4781#4781: conflicting server name "www.yekeep.com" on [::]:443, ignored
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful

## 本机 API 健康
{"ok":true,"db":true,"time":"2026-11-14T08:02:34.508Z","version":"0.64.0"}```
