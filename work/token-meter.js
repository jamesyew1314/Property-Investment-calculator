#!/usr/bin/env node
"use strict";
// token-meter.js — 扫描本机 DSH session 的 tokenUsage，按订单 workspace 推送到生产内部 API。
// 用法：
//   TOKEN_METER_KEY=... node work/token-meter.js --order ORD-... --workspace /path --interval 30
//   TOKEN_METER_KEY=... node work/token-meter.js --config work/token-meter.config.json --once
//   TOKEN_METER_KEY=... node work/token-meter.js --order ORD-... --workspace /path --interval 30
//   TOKEN_METER_KEY=... node work/token-meter.js --config work/token-meter.config.json
// 说明：只读 ~/.dsh/storages/session_projcache/sessions/*.json；不读取对话内容，只读用量/模型/工作目录。

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function parseArgs(argv) {
  const out = { config: "work/token-meter.config.json", once: false, dryRun: false, interval: 30, order: "", workspace: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--once") out.once = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--interval") out.interval = Math.max(5, Number(argv[++i]) || 30);
    else if (a === "--order") out.order = String(argv[++i] || "").trim();
    else if (a === "--workspace") out.workspace = String(argv[++i] || "").trim();
  }
  return out;
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function sessionDir() {
  return path.join(os.homedir(), ".dsh", "storages", "session_projcache", "sessions");
}
function pick(row, key) {
  const v = row && row[key];
  return v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "val") ? v.val : v;
}
function normalizePath(p) {
  if (!p) return "";
  try { return path.resolve(String(p)).replace(/\/+$/, ""); } catch (e) { return ""; }
}
function matchOrder(orders, cwd) {
  const w = normalizePath(cwd);
  if (!w) return null;
  let best = null;
  (orders || []).forEach(function (o) {
    const root = normalizePath(o.workspace);
    if (!root) return;
    if (w === root || w.indexOf(root + path.sep) === 0) {
      if (!best || root.length > normalizePath(best.workspace).length) best = o;
    }
  });
  return best;
}
function scanSessions(dir, orders) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(function (f) { return f.endsWith(".json"); }); } catch (e) { return out; }
  files.forEach(function (file) {
    let j;
    try { j = readJson(path.join(dir, file)); } catch (e) { return; }
    const rows = j && j.record && j.record.rows;
    if (!rows || typeof rows !== "object") return;
    const cwd = pick(rows, "workingDirectory");
    const order = matchOrder(orders, cwd);
    if (!order) return;
    const usage = pick(rows, "tokenUsage");
    const totals = usage && usage.totals;
    if (!totals || typeof totals !== "object") return;
    const input = Number(totals.uncachedInputTokens || 0);
    const cacheRead = Number(totals.cacheReadTokens || 0);
    const cacheWrite = Number(totals.cacheWriteTokens || 0);
    const output = Number(totals.outputTokens || 0);
    if (![input, cacheRead, cacheWrite, output].every(function (n) { return Number.isSafeInteger(n) && n >= 0; })) return;
    if (input + cacheRead + cacheWrite + output <= 0) return;
    const model = (pick(rows, "modelSelection") && pick(rows, "modelSelection").lastUsed &&
      pick(rows, "modelSelection").lastUsed.model) || "deepseek-flash";
    out.push({
      order_no: order.order_no,
      session_id: file.replace(/\.json$/, ""),
      model: String(model),
      uncached_input_tokens: input,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      output_tokens: output,
      working_directory: normalizePath(cwd)
    });
  });
  return out;
}
async function postUsage(apiBase, meterKey, row) {
  const res = await fetch(apiBase.replace(/\/+$/, "") + "/api/internal/token-usage", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-meter-key": meterKey },
    body: JSON.stringify(row)
  });
  const body = await res.json().catch(function () { return {}; });
  if (!res.ok || !body.ok) throw new Error("meter_http_" + res.status + " " + (body.error || ""));
  return body;
}
async function runOnce(opts) {
  const cfg = readJson(opts.config);
  const apiBase = process.env.METER_API_BASE || cfg.api_base || "https://kwongthye.com";
  const meterKey = process.env.TOKEN_METER_KEY || "";
  if (!meterKey && !opts.dryRun) throw new Error("TOKEN_METER_KEY is required");
  const orders = opts.order && opts.workspace
    ? [{ order_no: opts.order, workspace: opts.workspace }]
    : (cfg.orders || []);
  const rows = scanSessions(sessionDir(), orders);
  if (rows.length) console.log(new Date().toISOString() + " sessions matched: " + rows.length);
  for (const row of rows) {
    if (opts.dryRun) { console.log("DRY " + JSON.stringify(row)); continue; }
    try {
      const out = await postUsage(apiBase, meterKey, row);
      console.log("posted " + row.order_no + " " + row.session_id + " tokens=" +
        (row.uncached_input_tokens + row.cache_read_tokens + row.cache_write_tokens + row.output_tokens) +
        " total_cost_myr=" + out.usage.total_cost_myr);
    } catch (e) {
      console.error("post failed " + row.order_no + " " + row.session_id + ": " + e.message);
    }
  }
}
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.once) { await runOnce(opts); return; }
  for (;;) {
    try { await runOnce(opts); } catch (e) { console.error("meter run failed: " + e.message); }
    await new Promise(function (r) { setTimeout(r, opts.interval * 1000); });
  }
}
if (require.main === module) main().catch(function (e) { console.error("token-meter: " + e.message); process.exit(1); });
module.exports = { parseArgs, scanSessions, matchOrder, normalizePath, sessionDir };
