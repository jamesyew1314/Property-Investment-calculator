#!/usr/bin/env node
"use strict";
/*
 * 每日心跳邮件（08:00）
 * 作用：① 证明服务器还活着（服务器整台挂掉时这封信会消失，你一看就知道）
 *       ② 每天一封运营小报：用户/收据/流量/留言/备份/证书
 * 真正的「外部」探测请另配 UptimeRobot（见 docs/服务器信息.md 第 16.5 节）——那才是服务器挂了也能叫的。
 */
const fs = require("fs");
const { execSync } = require("child_process");

function sh(cmd) {
  try { return String(execSync(cmd, { timeout: 15000, stdio: ["ignore", "pipe", "pipe"] })).trim(); }
  catch (e) { return ""; }
}

function loadEnv() {
  try {
    fs.readFileSync("/srv/fangchan/api/.env", "utf8").split("\n").forEach(function (l) {
      const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  } catch (e) {}
}

async function main() {
  loadEnv();
  const { Pool } = require("/srv/fangchan/api/node_modules/pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  const q = async function (sql, params) {
    try { const r = await pool.query(sql, params || []); return r.rows[0] ? r.rows[0].n : 0; }
    catch (e) { return "?"; }
  };

  const users = await q("SELECT count(*)::int n FROM users");
  const pro = await q("SELECT count(*)::int n FROM users WHERE plan='pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())");
  const newUsers = await q("SELECT count(*)::int n FROM users WHERE created_at > now() - interval '1 day'");
  const plans = await q("SELECT count(*)::int n FROM plans");
  const receipts = await q("SELECT count(*)::int n FROM payments");
  const paid24 = await q("SELECT coalesce(sum(amount),0)::text n FROM payments WHERE created_at > now() - interval '1 day'");
  const msgs24 = await q("SELECT count(*)::int n FROM contact_messages WHERE created_at > now() - interval '1 day'");
  const views24 = await q("SELECT count(*)::int n FROM pageviews WHERE created_at > now() - interval '1 day'");
  const pend = await q("SELECT count(*)::int n FROM users WHERE plan_expires_at IS NOT NULL AND plan_expires_at > now() AND plan_expires_at < now() + interval '7 days'");
  await pool.end();

  const up = sh("uptime -p").replace(/^up /, "") || "?";
  const load = sh("cat /proc/loadavg | cut -d' ' -f1-3");
  const disk = sh("df -P / | tail -1 | awk '{print $5\" used, \"$4\" free\"}'");
  const mem = sh("free -m | awk '/Mem:/{print $3\" / \"$2\" MB used\"}'");
  const certEnd = sh("echo | openssl s_client -connect kwongthye.com:443 -servername kwongthye.com 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2");
  const certDays = certEnd ? Math.floor((new Date(certEnd).getTime() - Date.now()) / 86400000) : NaN;

  const dump = sh("ls -t /srv/fangchan/backups/fangchan-*.dump 2>/dev/null | head -1");
  let backupLine = "没有备份文件";
  if (dump) {
    const sizeMb = (parseInt(sh("stat -c %s " + dump), 10) / 1048576).toFixed(2);
    const hours = Math.floor((Date.now() - new Date(sh("stat -c %Y " + dump) * 1000).getTime()) / 3600000);
    const hasSha = fs.existsSync(dump + ".sha256") ? "有校验文件" : "缺校验文件";
    backupLine = require("path").basename(dump) + " · " + sizeMb + " MB · " + hours + " 小时前 · " + hasSha;
  }

  let failing = "全部正常";
  try {
    const st = JSON.parse(fs.readFileSync("/srv/fangchan/logs/monitor-state.json", "utf8"));
    const bad = Object.keys(st.checks || {}).filter(function (k) { return !st.checks[k].ok; });
    if (bad.length) failing = bad.join(", ");
  } catch (e) {}

  const staging = sh("systemctl is-active fangchan-api-staging");
  const apiVer = sh("curl -s -m 5 localhost:3000/api/health");

  const today = new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" });
  const body = [
    "kwongthye.com 每日心跳 · " + today,
    "",
    "【服务器】",
    "运行时间：" + up,
    "负载：" + load,
    "磁盘：" + disk,
    "内存：" + mem,
    "SSL 证书：" + (isNaN(certDays) ? "读取失败" : "剩余 " + certDays + " 天"),
    "staging：" + (staging || "?"),
    "API：" + (apiVer || "无响应"),
    "",
    "【今天的数据】",
    "新用户：" + newUsers + "（累计 " + users + "，其中 Pro " + pro + "）",
    "7 天内到期：" + pend,
    "收据：" + (paid24 === "?" ? "?" : "RM " + Number(paid24).toFixed(2)) + " 今日 · 累计 " + receipts + " 张",
    "浏览量（24h）：" + views24,
    "留言（24h）：" + msgs24,
    "方案总数：" + plans,
    "",
    "【备份】",
    backupLine,
    "",
    "【监控】",
    "未通过项：" + failing,
    "",
    "— 服务器自动发送；若连续几天没收到这封邮件，说明服务器有问题。"
  ].join("\n");

  try { fs.writeFileSync("/srv/fangchan/logs/heartbeat-last.txt", body); } catch (e) {}
  const subject = "☀️ 每日心跳 " + today + (failing === "全部正常" ? "" : " ⚠️ " + failing);
  const { spawnSync } = require("child_process");
  const r = spawnSync("node", ["/srv/fangchan/ops/notify.js", subject, body], { encoding: "utf8", timeout: 30000 });
  console.log((r.stdout || "").trim(), (r.stderr || "").trim());
}

main().catch(function (e) { console.error("heartbeat failed:", e.message); process.exit(1); });
