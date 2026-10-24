#!/usr/bin/env node
"use strict";
/*
 * kwongthye.com 监控告警（每 10 分钟）
 * 检查：站点 / API / 数据库 / 磁盘 / 证书 / 服务 / 备份新鲜度
 * 只在「状态变化」时发邮件（恢复也发一封），避免刷屏；持续故障每 6 小时再提醒一次。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const STATE = "/srv/fangchan/logs/monitor-state.json";
const LOG = "/srv/fangchan/logs/monitor.log";
const REPEAT_MS = 6 * 3600 * 1000;

function log(msg) {
  const line = new Date().toISOString() + " " + msg;
  try { fs.appendFileSync(LOG, line + "\n"); } catch (e) {}
  console.log(line);
}

function sh(cmd, timeout) {
  try {
    return String(execSync(cmd, { timeout: timeout || 15000, stdio: ["ignore", "pipe", "pipe"] })).trim();
  } catch (e) {
    return "__ERR__" + (e.stdout ? String(e.stdout) : "") + (e.message || "");
  }
}

async function http(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms || 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.text();
    return { status: r.status, body: body };
  } catch (e) {
    return { status: 0, body: "", error: e.message };
  } finally { clearTimeout(t); }
}

async function checks() {
  const out = [];

  // 1) 网站首页
  const home = await http("https://kwongthye.com/");
  out.push({
    id: "site", ok: home.status === 200 && home.body.indexOf("KWONG THYE") >= 0,
    title: "网站首页", detail: "HTTP " + home.status + (home.error ? " " + home.error : "")
  });

  // 2) API 健康
  const api = await http("https://kwongthye.com/api/health");
  let apiOk = false, apiDetail = "HTTP " + api.status;
  try {
    const j = JSON.parse(api.body);
    apiOk = api.status === 200 && j.ok === true && j.db === true;
    apiDetail += " db=" + j.db + " v=" + j.version;
  } catch (e) { apiDetail += " 非 JSON"; }
  out.push({ id: "api", ok: apiOk, title: "API / 数据库连接", detail: apiDetail });

  // 3) 磁盘
  const df = sh("df -P / | tail -1");
  const parts = df.split(/\s+/);
  const pct = parts.length >= 5 ? parseInt(parts[4].replace("%", ""), 10) : NaN;
  out.push({
    id: "disk", ok: pct < 85, title: "磁盘使用率",
    detail: (isNaN(pct) ? "无法读取" : pct + "%") + "（阈值 85%）"
  });

  // 4) 内存
  const mem = sh("free -m | awk '/Mem:/{print $7}'");
  const availMb = parseInt(mem, 10);
  out.push({
    id: "mem", ok: isNaN(availMb) ? true : availMb > 200, title: "可用内存",
    detail: isNaN(availMb) ? "无法读取" : availMb + " MB（阈值 200MB）"
  });

  // 5) 证书剩余天数
  const cert = sh("echo | openssl s_client -connect kwongthye.com:443 -servername kwongthye.com 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null");
  let days = NaN;
  const m = cert.match(/notAfter=(.+)/);
  if (m) days = Math.floor((new Date(m[1]).getTime() - Date.now()) / 86400000);
  out.push({
    id: "cert", ok: isNaN(days) ? false : days > 14, title: "SSL 证书",
    detail: isNaN(days) ? "无法读取" : "剩余 " + days + " 天"
  });

  // 6) 服务
  ["fangchan-api", "nginx", "postgresql"].forEach(function (svc) {
    const st = sh("systemctl is-active " + svc);
    out.push({ id: "svc:" + svc, ok: st === "active", title: "服务 " + svc, detail: st });
  });

  // 7) 备份新鲜度
  const bk = sh("ls -t /srv/fangchan/backups/fangchan-*.dump 2>/dev/null | head -1");
  let bkDetail = "没有备份文件", bkOk = false;
  if (bk && bk.indexOf("__ERR__") < 0) {
    const ageH = Math.floor((Date.now() - new Date(sh("stat -c %Y " + bk) * 1000).getTime()) / 3600000);
    const sizeKb = parseInt(sh("stat -c %s " + bk), 10) / 1024;
    bkOk = ageH < 26 && sizeKb > 5;
    bkDetail = path.basename(bk) + " · " + ageH + " 小时前 · " + Math.round(sizeKb) + " KB";
  }
  out.push({ id: "backup", ok: bkOk, title: "数据库备份", detail: bkDetail });

  // 8) 异地备份（只有配置了 OSS 才检查）
  if (fs.existsSync("/etc/fangchan-offsite.conf")) {
    let offDetail = "未上传", offOk = false;
    try {
      const last = parseInt(fs.readFileSync("/srv/fangchan/logs/.offsite-last", "utf8").trim(), 10);
      const h = Math.floor((Date.now() - last * 1000) / 3600000);
      offOk = h < 26;
      offDetail = "上次上传 " + h + " 小时前";
    } catch (e) { offDetail = "还没有成功上传记录"; }
    out.push({ id: "offsite", ok: offOk, title: "异地备份 (OSS)", detail: offDetail });
  }

  // 9) 磁盘剩余可发给报告的补充信息
  const ver = sh("node -v");
  out.push({ id: "runtime", ok: ver.indexOf("v2") === 0, title: "Node 运行时", detail: ver, silent: true });

  return out;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return { checks: {} }; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch (e) {}
}

(async function () {
  const results = await checks();
  const prev = loadState();
  const now = Date.now();
  const alerts = [], recovers = [];

  results.forEach(function (r) {
    const p = prev.checks[r.id] || { ok: true, since: now, notified: 0 };
    if (!r.ok) {
      if (p.ok) { alerts.push(r); p.since = now; p.notified = now; }
      else if (!p.notified || now - p.notified > REPEAT_MS) { alerts.push(r); p.notified = now; }
    } else if (!p.ok) {
      recovers.push({ id: r.id, title: r.title, detail: r.detail, downSince: p.since });
    }
    prev.checks[r.id] = { ok: r.ok, since: p.ok === r.ok ? p.since : now, notified: r.ok ? 0 : (p.notified || 0) };
  });
  saveState(prev);

  const bad = results.filter(function (r) { return !r.ok; });
  log("checks=" + results.length + " failing=" + bad.length + (bad.length ? " [" + bad.map(function (b) { return b.id; }).join(",") + "]" : ""));

  if (!alerts.length && !recovers.length) return;

  const lines = [];
  if (alerts.length) {
    lines.push("【故障 / ALERT】");
    alerts.forEach(function (a) { lines.push("• " + a.title + "：" + a.detail); });
  }
  if (recovers.length) {
    if (lines.length) lines.push("");
    lines.push("【已恢复 / RECOVERED】");
    recovers.forEach(function (r) {
      const mins = Math.max(1, Math.round((now - r.downSince) / 60000));
      lines.push("• " + r.title + "：" + r.detail + "（故障约 " + mins + " 分钟）");
    });
  }
  lines.push("");
  lines.push("服务器：47.254.235.22 · " + new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }));
  lines.push("全部检查：" + results.map(function (r) { return r.title + (r.ok ? " ✓" : " ✗"); }).join(" · "));

  const subject = (alerts.length ? "⚠️ 故障 " + alerts.length + " 项" : "✅ 已恢复") + " — kwongthye.com";
  const body = lines.join("\n");

  try {
    const { spawnSync } = require("child_process");
    const r = spawnSync("node", ["/srv/fangchan/ops/notify.js", subject, body], { encoding: "utf8", timeout: 30000 });
    if (r.stdout) log("notify: " + r.stdout.trim());
    if (r.stderr) log("notify err: " + r.stderr.trim());
  } catch (e) { log("notify failed: " + e.message); }
})().catch(function (e) { log("monitor crashed: " + e.message); process.exit(1); });
