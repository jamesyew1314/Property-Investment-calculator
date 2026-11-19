"use strict";
// ab-test.js — 主页标题 A/B 测试（匿名事件，不存 PII）
// 公开：POST /api/ab/event {event, variant, path}
// 后台：GET /api/ab/summary（requireAdmin）
let express = null;
try { express = require("express"); } catch (e) { /* pure tests */ }

const EVENTS = new Set(["view", "whatsapp_click", "plans_click", "form_submit"]);
const VARIANTS = new Set(["A", "B"]);

function createAbApi(opts) {
  if (!express) throw new Error("ab-test: express is not installed");
  const pool = opts && opts.pool;
  if (!pool) throw new Error("ab-test: pool required");
  const requireAdmin = opts.requireAdmin;
  const rateLimit = opts.rateLimit || function () { return function (req, res, next) { next(); }; };

  const r = express.Router();
  r.use(function (req, res, next) { res.setHeader("Cache-Control", "no-store"); next(); });

  r.post("/event", rateLimit(120, 60 * 1000), async function (req, res, next) {
    try {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const event = String(b.event || "");
      const variant = String(b.variant || "");
      const path = String(b.path || "").slice(0, 200);
      if (!EVENTS.has(event) || !VARIANTS.has(variant)) {
        return res.status(400).json({ ok: false, error: "invalid_event" });
      }
      await pool.query("INSERT INTO order_ab_events(event, variant, path) VALUES ($1,$2,$3)",
        [event, variant, path]);
      // 204 保持轻量，避免页面等待
      return res.status(204).end();
    } catch (e) { next(e); }
  });

  r.get("/summary", requireAdmin, async function (req, res, next) {
    try {
      const out = await pool.query(
        "SELECT variant, event, count(*)::int AS n FROM order_ab_events GROUP BY variant, event");
      const variants = { A: { views: 0, whatsapp_clicks: 0, plans_clicks: 0, form_submits: 0, conversions: 0, ctr: 0 },
        B: { views: 0, whatsapp_clicks: 0, plans_clicks: 0, form_submits: 0, conversions: 0, ctr: 0 } };
      out.rows.forEach(function (row) {
        const v = variants[row.variant]; if (!v) return;
        if (row.event === "view") v.views = row.n;
        else if (row.event === "whatsapp_click") v.whatsapp_clicks = row.n;
        else if (row.event === "plans_click") v.plans_clicks = row.n;
        else if (row.event === "form_submit") v.form_submits = row.n;
      });
      ["A", "B"].forEach(function (k) {
        const v = variants[k];
        v.conversions = v.whatsapp_clicks + v.form_submits;
        v.ctr = v.views > 0 ? Math.round((v.conversions / v.views) * 10000) / 100 : 0;
      });
      res.json({ ok: true, variants: variants });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = { createAbApi, EVENTS, VARIANTS };
