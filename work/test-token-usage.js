"use strict";
// test-token-usage.js — 自动 token 计价与 meter 扫描回归
process.env.USD_MYR = "4.4";
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const usage = require("./token-usage");
const meter = require("./token-meter");

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; console.log("✓ " + label); }
  else { fail++; console.log("✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

// 2026-11-17 Tuesday
const peakAt = new Date("2026-11-17T02:00:00Z");
const offAt = new Date("2026-11-17T05:00:00Z");
const weekendAt = new Date("2026-11-21T02:00:00Z");
eq(usage.isPeak(peakAt), true, "周二 02:00 UTC 是 peak");
eq(usage.isPeak(offAt), false, "周二 05:00 UTC 是 off_peak");
eq(usage.isPeak(weekendAt), false, "周六 02:00 UTC 是 off_peak");

const off = usage.calculateCost({
  model: "deepseek-flash", observed_at: offAt,
  uncached_input_tokens: 1000000, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 1000000
});
eq(off.ok, true, "offpeak 计算成功");
eq([off.cost_usd, off.cost_myr, off.total_tokens, off.rate_period], [0.75, 3.3, 2000000, "off_peak"],
  "offpeak 1M input + 1M output = $0.75 / RM3.30");

const peak = usage.calculateCost({
  model: "deepseek-flash", observed_at: peakAt,
  uncached_input_tokens: 1000000, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 1000000
});
eq([peak.cost_usd, peak.cost_myr, peak.rate_period], [1.5, 6.6, "peak"],
  "peak 1M input + 1M output = $1.50 / RM6.60");

const cached = usage.calculateCost({
  model: "deepseek-flash", observed_at: offAt,
  uncached_input_tokens: 0, cache_read_tokens: 1000000, cache_write_tokens: 0, output_tokens: 0
});
eq([cached.cost_usd, cached.cost_myr], [0.003, 0.01], "cache hit 1M = $0.003 / RM0.01");

ok(usage.calculateCost({ uncached_input_tokens: -1 }).ok === false, "负数 token 拒绝");
ok(usage.calculateCost({ uncached_input_tokens: "x" }).ok === false, "非数字 token 拒绝");

// fake DSH session
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meter-test-"));
const record = { record: { rows: {
  workingDirectory: { val: "/work/client-a" },
  modelSelection: { val: { lastUsed: { model: "deepseek-flash" } } },
  tokenUsage: { val: { totals: { uncachedInputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 0, outputTokens: 300 } } }
} } };
fs.writeFileSync(path.join(dir, "sess-1.json"), JSON.stringify(record));
fs.writeFileSync(path.join(dir, "sess-other.json"), JSON.stringify({ record: { rows: {
  workingDirectory: { val: "/work/other" },
  tokenUsage: { val: { totals: { uncachedInputTokens: 1, outputTokens: 1 } } }
} } }));
const matched = meter.scanSessions(dir, [{ order_no: "ORD-261117-AAAA", workspace: "/work/client-a" }]);
eq(matched.length, 1, "只匹配配置的 workspace");
eq([matched[0].order_no, matched[0].session_id, matched[0].uncached_input_tokens,
  matched[0].cache_read_tokens, matched[0].output_tokens],
  ["ORD-261117-AAAA", "sess-1", 100, 200, 300], "扫描出 session 用量");
fs.rmSync(dir, { recursive: true, force: true });

console.log("\nTOKEN USAGE " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
process.exit(fail ? 1 : 0);
