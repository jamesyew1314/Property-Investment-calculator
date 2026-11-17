"use strict";
// token-usage.js — 自动 token 计量
// 开发侧 work/token-meter.js 扫描 DSH session 的 tokenUsage 总量，POST 到 /api/internal/token-usage。
// 金额按 DeepSeek 官方 USD/1M 价格估算；USD→MYR 用 USD_MYR（默认 4.4），可在 .env 调整。
// 峰值：UTC 周一至周五 01:00–04:00、06:00–10:00；节假日未做日历，按工作日估算。

let express = null;
try { express = require("express"); } catch (e) { /* pure function tests can run without express */ }
const crypto = require("node:crypto");

const DEFAULT_RATES = {
  "deepseek-flash": {
    off_peak: { miss: 0.15, hit: 0.003, output: 0.60 },
    peak: { miss: 0.30, hit: 0.006, output: 1.20 }
  }
};
const MAX_TOKENS = 1000000000000;
const ORDER_NO_RE = /^ORD-\d{6}-[2-9A-HJ-NP-Z]{4}$/;
const SESSION_RE = /^[A-Za-z0-9._:-]{1,200}$/;

function n(v) { return Number(v); }
function int(v) {
  const x = Number(v);
  return Number.isSafeInteger(x) && x >= 0 && x <= MAX_TOKENS ? x : null;
}
function money(v, digits) {
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round((x + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);
}
function isPeak(at) {
  const d = at instanceof Date ? at : new Date(at);
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}
function ratesFor(model) {
  return DEFAULT_RATES[String(model || "").toLowerCase()] || DEFAULT_RATES["deepseek-flash"];
}
function calculateCost(input) {
  const b = input || {};
  const model = String(b.model || "deepseek-flash").toLowerCase();
  const at = b.observed_at ? new Date(b.observed_at) : new Date();
  const safeAt = Number.isFinite(at.getTime()) ? at : new Date();
  const period = isPeak(safeAt) ? "peak" : "off_peak";
  const r = ratesFor(model)[period];
  const uncached = int(b.uncached_input_tokens);
  const cacheRead = int(b.cache_read_tokens);
  const cacheWrite = int(b.cache_write_tokens);
  const output = int(b.output_tokens);
  if (uncached === null || cacheRead === null || cacheWrite === null || output === null) {
    return { ok: false, error: "invalid_tokens" };
  }
  const usdPerM = (uncached * r.miss + cacheRead * r.hit + cacheWrite * r.miss + output * r.output) / 1000000;
  const usdMyr = Number(process.env.USD_MYR || 4.4);
  const fx = Number.isFinite(usdMyr) && usdMyr > 0 ? usdMyr : 4.4;
  return {
    ok: true, model: model, rate_period: period,
    input_tokens: uncached, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite,
    output_tokens: output, total_tokens: uncached + cacheRead + cacheWrite + output,
    cost_usd: money(usdPerM, 6), cost_myr: money(usdPerM * fx, 2),
    rates: r, usd_myr: fx
  };
}
function summaryQuery() {
  return "SELECT COALESCE(SUM(cost_myr),0)::float8 AS total_cost_myr, " +
    "COALESCE(SUM(cost_usd),0)::float8 AS total_cost_usd, " +
    "COALESCE(SUM(uncached_input_tokens + cache_read_tokens + cache_write_tokens + output_tokens),0)::bigint AS total_tokens, " +
    "COALESCE(SUM(CASE WHEN observed_at >= date_trunc('month', now()) THEN cost_myr ELSE 0 END),0)::float8 AS month_cost_myr, " +
    "MAX(updated_at) AS last_at FROM token_usage WHERE order_id=$1";
}
function createTokenUsageApi(opts) {
  if (!express) throw new Error("token-usage: express is not installed");
  const pool = opts && opts.pool;
  if (!pool) throw new Error("token-usage: pool required");
  const meterKey = String((opts && opts.meterKey) || process.env.TOKEN_METER_KEY || "");
  const r = express.Router();
  r.use(function (req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  r.post("/token-usage", function (req, res, next) {
    Promise.resolve().then(async function () {
      // 内部服务鉴权；未配置 key 时拒绝，避免裸奔。
      if (!meterKey) return res.status(503).json({ ok: false, error: "meter_disabled" });
      const got = String(req.get("x-meter-key") || "");
      const a = Buffer.from(got), b = Buffer.from(meterKey);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ ok: false, error: "meter_unauthorized" });
      }
      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const orderNo = String(body.order_no || "").trim().toUpperCase();
      const sessionId = String(body.session_id || "").trim();
      if (!ORDER_NO_RE.test(orderNo)) return res.status(400).json({ ok: false, error: "invalid_order_no" });
      if (!SESSION_RE.test(sessionId)) return res.status(400).json({ ok: false, error: "invalid_session_id" });
      const cost = calculateCost(body);
      if (!cost.ok) return res.status(400).json({ ok: false, error: cost.error });
      const order = await pool.query("SELECT id FROM site_orders WHERE upper(order_no)=upper($1)", [orderNo]);
      if (!order.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      const orderId = order.rows[0].id;
      const up = await pool.query(
        "INSERT INTO token_usage(order_id,session_id,model,uncached_input_tokens,cache_read_tokens," +
        "cache_write_tokens,output_tokens,rate_period,cost_usd,cost_myr,observed_at) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) " +
        "ON CONFLICT(session_id) DO UPDATE SET order_id=EXCLUDED.order_id, model=EXCLUDED.model, " +
        "uncached_input_tokens=EXCLUDED.uncached_input_tokens, cache_read_tokens=EXCLUDED.cache_read_tokens, " +
        "cache_write_tokens=EXCLUDED.cache_write_tokens, output_tokens=EXCLUDED.output_tokens, " +
        "rate_period=EXCLUDED.rate_period, cost_usd=EXCLUDED.cost_usd, cost_myr=EXCLUDED.cost_myr, " +
        "observed_at=EXCLUDED.observed_at, updated_at=now() " +
        "WHERE token_usage.order_id=EXCLUDED.order_id RETURNING id",
        [orderId, sessionId, cost.model, cost.input_tokens, cost.cache_read_tokens,
          cost.cache_write_tokens, cost.output_tokens, cost.rate_period, cost.cost_usd, cost.cost_myr,
          body.observed_at ? new Date(body.observed_at) : new Date()]
      );
      if (!up.rows[0]) return res.status(409).json({ ok: false, error: "session_order_conflict" });
      const summary = await pool.query(summaryQuery(), [orderId]);
      res.json({ ok: true, order_no: orderNo, usage: {
        tokens: cost.total_tokens, cost_myr: cost.cost_myr, rate_period: cost.rate_period,
        total_cost_myr: summary.rows[0].total_cost_myr, total_tokens: Number(summary.rows[0].total_tokens),
        month_cost_myr: summary.rows[0].month_cost_myr
      }});
    }).catch(next);
  });
  return r;
}
module.exports = { createTokenUsageApi, calculateCost, isPeak, ratesFor, summaryQuery, DEFAULT_RATES };
