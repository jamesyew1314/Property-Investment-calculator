"use strict";
// test-ab.js — 主页 A/B 事件与后台汇总回归
const ab = require("./ab-test");

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; console.log("✓ " + label); }
  else { fail++; console.log("✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

ok(ab.EVENTS.has("view") && ab.EVENTS.has("whatsapp_click") && ab.EVENTS.has("plans_click") && ab.EVENTS.has("form_submit"), "事件白名单齐全");
ok(ab.VARIANTS.has("A") && ab.VARIANTS.has("B"), "变体白名单 A/B");

let express = null;
try { express = require("express"); } catch (e) { express = null; }

async function httpTests() {
  if (!express) {
    console.log("… SKIP HTTP A/B 测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    return;
  }
  const db = { rows: [] };
  async function q(sql, params) {
    const p = params || [];
    if (/INSERT INTO order_ab_events/.test(sql)) {
      db.rows.push({ event: p[0], variant: p[1], path: p[2] });
      return { rows: [] };
    }
    if (/GROUP BY variant, event/.test(sql)) {
      const agg = {};
      db.rows.forEach(function (r) { const k = r.variant + "|" + r.event; agg[k] = (agg[k] || 0) + 1; });
      return { rows: Object.keys(agg).map(function (k) {
        const parts = k.split("|"); return { variant: parts[0], event: parts[1], n: agg[k] };
      }) };
    }
    throw new Error("unhandled sql: " + sql.slice(0, 60));
  }
  const pool = { query: q };
  function requireAdmin(req, res, next) {
    if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) return res.status(401).json({ ok: false, error: "admin_required" });
    req.admin = { email: "owner@example.com", role: "owner" };
    next();
  }
  const app = express();
  app.use(express.json());
  app.use("/api/ab", ab.createAbApi({ pool: pool, requireAdmin: requireAdmin }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  async function post(body, headers) {
    const res = await fetch(base + "/api/ab/event", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: JSON.stringify(body)
    });
    return res.status;
  }
  async function getSummary(headers) {
    const res = await fetch(base + "/api/ab/summary", { headers: headers });
    const j = await res.json().catch(function () { return {}; });
    return { status: res.status, body: j };
  }

  console.log("\n== ab /event ==");
  eq(await post({ event: "bad", variant: "A", path: "/order/" }), 400, "非法事件 → 400");
  eq(await post({ event: "view", variant: "C", path: "/order/" }), 400, "非法变体 → 400");
  eq(await post({ event: "view", variant: "A", path: "/order/" }), 204, "view A → 204");
  eq(await post({ event: "whatsapp_click", variant: "A", path: "/order/" }), 204, "whatsapp A → 204");
  eq(await post({ event: "view", variant: "B", path: "/order/" }), 204, "view B → 204");

  let r = await getSummary(undefined);
  eq(r.status, 401, "无后台 cookie → 401");
  r = await getSummary({ Cookie: "fc_admin=owner" });
  eq([r.status, r.body.ok], [200, true], "后台汇总 → 200");
  eq(r.body.variants.A.views, 1, "A 浏览 1");
  eq(r.body.variants.A.conversions, 1, "A 转化 1（WhatsApp）");
  eq(r.body.variants.A.ctr, 100, "A CTR 100%");
  eq([r.body.variants.B.views, r.body.variants.B.ctr], [1, 0], "B 浏览 1 / CTR 0");

  server.close();
}

httpTests().then(function () {
  console.log("\nAB " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error("test-ab crashed:", (e && e.stack) || e);
  process.exit(1);
});
