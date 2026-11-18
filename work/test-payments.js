"use strict";
// test-payments.js — Billplz Phase A 回归
// 纯函数（无 express 也跑）+ HTTP 段（无 express 自动 SKIP，staging/服务器跑全量）

const crypto = require("node:crypto");
const pay = require("./payments");

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; console.log("✓ " + label); }
  else { fail++; console.log("✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }
function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }

// ---------- 纯函数 ----------
eq(pay.amountToCents(2500), 250000, "RM2,500 → 250000 sen");
eq(pay.amountToCents(299), 29900, "RM299 → 29900 sen");
eq(pay.amountToCents(0), 0, "0 → 0");
eq(pay.billplzBase("production"), "https://www.billplz.com", "production 域名");
eq(pay.billplzBase("sandbox"), "https://www.billplz-sandbox.com", "sandbox 域名");
eq(pay.signPayload("a=b&paid=true", "k"), crypto.createHmac("sha256", "k").update("a=b&paid=true").digest("hex"), "HMAC-SHA256 与 Node 一致");
eq(pay.safeEqual("abc", "abc"), true, "safeEqual 相同");
eq(pay.safeEqual("abc", "abd"), false, "safeEqual 不同");

// ---------- HTTP ----------
let express = null;
try { express = require("express"); } catch (e) { express = null; }

async function httpTests() {
  if (!express) {
    console.log("… SKIP HTTP 支付测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    return;
  }
  const createClientApi = require("./client-api");

  const db = {
    orders: [{
      id: 1, order_no: "ORD-261118-AAAA", name: "Alice", phone: "0123456789",
      email: "alice@example.com", setup_price: 2500, payment_status: "unpaid",
      bill_url: null, gateway: null, gateway_ref: null, status: "new", client_user_id: 1
    }],
    events: [],
    sessionHash: sha256("sess-token"),
    sessionUser: { id: 1, email: "alice@example.com", name: "Alice", phone: "0123456789" },
    fetchCalls: []
  };
  async function q(sql, params) {
    const p = params || [];
    if (/client_sessions s JOIN client_users/.test(sql)) {
      return { rows: p[0] === db.sessionHash ? [db.sessionUser] : [] };
    }
    if (/FROM site_orders WHERE id=\$1 AND client_user_id=\$2/.test(sql)) {
      const o = db.orders.find(function (x) { return x.id === Number(p[0]); });
      return { rows: o && Number(o.client_user_id) === Number(p[1]) ? [o] : [] };
    }
    if (/SELECT order_no, name, phone, email, setup_price::float8 AS setup_price, payment_status, bill_url\s+FROM site_orders WHERE id = \$1/.test(sql)) {
      const o = db.orders.find(function (x) { return x.id === Number(p[0]); });
      return { rows: o ? [o] : [] };
    }
    if (/SELECT id, setup_price::float8 AS setup_price, payment_status FROM site_orders WHERE upper\(order_no\)=upper\(\$1\)/.test(sql)) {
      const o = db.orders.find(function (x) { return x.order_no === String(p[0]).toUpperCase(); });
      return { rows: o ? [o] : [] };
    }
    if (/UPDATE site_orders SET gateway='billplz'/.test(sql)) {
      const o = db.orders.find(function (x) { return x.id === Number(p[0]); });
      if (o) { o.gateway = "billplz"; o.gateway_ref = p[1]; o.bill_url = p[2]; }
      return { rows: [] };
    }
    if (/UPDATE site_orders SET payment_status='paid'/.test(sql)) {
      const o = db.orders.find(function (x) { return x.id === Number(p[0]); });
      if (o) { o.payment_status = "paid"; o.status = "paid"; o.paid_at = "2026-11-18T00:00:00.000Z"; }
      return { rows: [] };
    }
    if (/INSERT INTO site_order_events/.test(sql)) {
      db.events.push({ order_id: Number(p[0]), type: "payment", note: p[1], actor: "billplz" });
      return { rows: [] };
    }
    if (/^BEGIN$|^COMMIT$|^ROLLBACK$/.test(sql.trim())) return { rows: [] };
    throw new Error("unhandled sql: " + sql.slice(0, 80));
  }
  const pool = { query: q };

  const reqs = [];
  const httpFetch = async function (url, opts) {
    db.fetchCalls.push({ url: url, headers: opts.headers || {}, body: opts.body || "" });
    return {
      ok: true, status: 200,
      json: async function () { return { id: "b_1", url: "https://www.billplz-sandbox.com/b_1" }; }
    };
  };
  function requireAdmin(req, res, next) {
    if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) return res.status(401).json({ ok: false, error: "admin_required" });
    req.admin = { email: "owner@example.com", role: "owner" };
    next();
  }
  function requireWrite(req, res, next) { req.admin ? next() : res.status(401).json({ ok: false, error: "admin_required" }); }
  function rateLimit() { return function (req, res, next) { next(); }; }
  async function sendMail() { return "sent"; }

  const app = express();
  app.use(express.json());
  app.use("/api/internal/payments", pay.createPaymentsApi({
    pool: pool, requireAdmin: requireAdmin, requireWrite: requireWrite,
    rateLimit: rateLimit, siteUrl: "https://kwongthye.com", httpFetch: httpFetch
  }));
  app.use("/api/client", createClientApi({ pool: pool, sendMail: sendMail, rateLimit: rateLimit, siteUrl: "https://kwongthye.com" }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  async function jsonPost(path, body, headers) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(function () { return {}; });
    return { status: res.status, body: json };
  }
  async function call(method, path, body, headers, rawBody) {
    const res = await fetch(base + path, {
      method: method,
      headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, headers || {}),
      body: rawBody !== undefined ? rawBody : (body !== undefined ? new URLSearchParams(body).toString() : undefined)
    });
    const json = await res.json().catch(function () { return {}; });
    return { status: res.status, body: json };
  }

  const admin = { Cookie: "fc_admin=owner" };
  const noEnv = { BILLPLZ_API_KEY: undefined, BILLPLZ_COLLECTION_ID: undefined, BILLPLZ_MODE: undefined, BILLPLZ_WEBHOOK_KEY: undefined };
  function setEnv(on) {
    if (on) {
      process.env.BILLPLZ_API_KEY = "sk_test_x";
      process.env.BILLPLZ_COLLECTION_ID = "col_1";
      process.env.BILLPLZ_MODE = "sandbox";
      process.env.BILLPLZ_WEBHOOK_KEY = "";
    } else {
      delete process.env.BILLPLZ_API_KEY;
      delete process.env.BILLPLZ_COLLECTION_ID;
      delete process.env.BILLPLZ_MODE;
      delete process.env.BILLPLZ_WEBHOOK_KEY;
    }
  }

  console.log("\n== payments /bills ==");
  setEnv(false);
  let r = await jsonPost("/api/internal/payments/bills", { id: 1 }, admin);
  eq([r.status, r.body.error], [503, "gateway_not_configured"], "未配置网关 → 503");
  r = await jsonPost("/api/internal/payments/bills", { id: 1 }, undefined);
  eq(r.status, 401, "无后台 cookie → 401");

  setEnv(true);
  r = await jsonPost("/api/internal/payments/bills", { id: 1 }, admin);
  eq([r.status, r.body.ok, r.body.bill_url], [200, true, "https://www.billplz-sandbox.com/b_1"], "生成收款链接 → 200");
  const c1 = db.fetchCalls[0];
  ok(c1.url.indexOf("/api/v3/bills") > 0, "调用 Billplz v3 bills", c1.url);
  ok(c1.headers.Authorization === "Basic " + Buffer.from("sk_test_x:").toString("base64"), "Basic Auth = key 作为用户名");
  ok(c1.body.indexOf("collection_id=col_1") >= 0 && c1.body.indexOf("amount=250000") >= 0 &&
    c1.body.indexOf("reference_1=ORD-261118-AAAA") >= 0 && c1.body.indexOf("callback_url=") >= 0, "表单含 collection/amount/reference_1/callback");
  eq(db.orders[0].gateway_ref, "b_1", "订单记录 gateway_ref");
  const callsBefore = db.fetchCalls.length;
  r = await jsonPost("/api/internal/payments/bills", { id: 1 }, admin);
  eq([r.status, r.body.bill_url], [200, "https://www.billplz-sandbox.com/b_1"], "已有链接直接返回");
  eq(db.fetchCalls.length, callsBefore, "不重复调用网关");
  db.orders[0].payment_status = "paid";
  r = await jsonPost("/api/internal/payments/bills", { id: 1 }, admin);
  eq([r.status, r.body.error], [409, "already_paid"], "已付款 → 409");
  db.orders[0].payment_status = "unpaid";

  console.log("\n== payments callback ==");
  const rawStr = "id=b_1&collection_id=col_1&paid=true&amount=250000&reference_1=ORD-261118-AAAA&reference_2=alice%40example.com";
  process.env.BILLPLZ_WEBHOOK_KEY = "wh_secret";
  const sig = pay.signPayload(rawStr, "wh_secret");
  r = await call("POST", "/api/internal/payments/billplz/callback", undefined, { "x-signature": sig }, rawStr);
  eq([r.status, r.body.paid], [200, true], "验签回调 → 200 paid");
  eq([db.orders[0].payment_status, db.orders[0].status], ["paid", "paid"], "订单标记已付款");
  eq(db.events.length, 1, "写入 1 条 payment 事件");
  eq(db.events[0].type, "payment", "事件类型 payment");
  const evBefore = db.events.length;
  r = await call("POST", "/api/internal/payments/billplz/callback", undefined, { "x-signature": sig }, rawStr);
  eq([r.status, r.body.already], [200, true], "重复回调幂等");
  eq(db.events.length, evBefore, "不重复写事件");
  r = await call("POST", "/api/internal/payments/billplz/callback", undefined, { "x-signature": "bad" }, rawStr);
  eq([r.status, r.body.error], [401, "bad_signature"], "错误签名 → 401");
  db.orders[0].payment_status = "unpaid";
  r = await call("POST", "/api/internal/payments/billplz/callback", undefined, { "x-signature": pay.signPayload("id=b_1&paid=true&amount=1&reference_1=ORD-261118-AAAA", "wh_secret") }, "id=b_1&paid=true&amount=1&reference_1=ORD-261118-AAAA");
  eq([r.status, r.body.error], [400, "amount_mismatch"], "金额不符 → 400");
  r = await call("POST", "/api/internal/payments/billplz/callback", undefined, { "x-signature": pay.signPayload("id=b_1&paid=true&amount=250000&reference_1=ORD-000000-AAAA", "wh_secret") }, "id=b_1&paid=true&amount=250000&reference_1=ORD-000000-AAAA");
  eq([r.status, r.body.error], [404, "not_found"], "未知订单 → 404");

  console.log("\n== client bill endpoint ==");
  db.orders[0].payment_status = "unpaid";
  db.orders[0].bill_url = "https://www.billplz-sandbox.com/b_1";
  const cookie = { Cookie: "fc_client=sess-token" };
  r = await fetch(base + "/api/client/orders/1/bill", { headers: cookie });
  const j = await r.json();
  eq([r.status, j.ok, j.bill_url, j.payment_status], [200, true, "https://www.billplz-sandbox.com/b_1", "unpaid"], "客户读取付款链接");
  r = await fetch(base + "/api/client/orders/1/bill");
  eq(r.status, 401, "无会话 → 401");
  r = await fetch(base + "/api/client/orders/2/bill", { headers: cookie });
  eq(r.status, 404, "他人订单 → 404");

  delete process.env.BILLPLZ_WEBHOOK_KEY;
  server.close();
}

httpTests().then(function () {
  console.log("\nPAYMENTS " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error("test-payments crashed:", (e && e.stack) || e);
  process.exit(1);
});
