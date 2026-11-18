"use strict";
// payments.js — Billplz 在线收款（Phase A）
// 后台：POST /api/internal/payments/bills → 生成收款链接（首月 setup_price）
// 网关回调：POST /api/internal/payments/billplz/callback → 验签后把订单标记为已付款
// 环境变量（服务端 .env，绝不出现在代码/日志）：
//   BILLPLZ_API_KEY        Billplz Secret Key（Basic Auth：key 作为用户名，密码留空）
//   BILLPLZ_COLLECTION_ID  收款 Collection ID
//   BILLPLZ_MODE           sandbox（默认）| production
//   BILLPLZ_WEBHOOK_KEY    回调验签密钥（HMAC-SHA256(raw body)）；未配置则回调不验签（仅沙箱用）

let express = null;
try { express = require("express"); } catch (e) { /* 纯函数测试无需 express */ }
const crypto = require("node:crypto");
const core = require("./order-core");

const PROD_BASE = "https://www.billplz.com";
const SANDBOX_BASE = "https://www.billplz-sandbox.com";

function billplzBase(mode) {
  return mode === "production" ? PROD_BASE : SANDBOX_BASE;
}
function amountToCents(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
function signPayload(raw, key) {
  return crypto.createHmac("sha256", String(key)).update(String(raw)).digest("hex");
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function envConfigured() {
  return !!(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID);
}

function createPaymentsApi(opts) {
  if (!express) throw new Error("payments: express is not installed");
  const pool = opts && opts.pool;
  if (!pool) throw new Error("payments: pool required");
  const requireAdmin = opts.requireAdmin;
  const requireWrite = opts.requireWrite;
  const rateLimit = opts.rateLimit || function () { return function (req, res, next) { next(); }; };
  const siteUrl = opts.siteUrl || "https://kwongthye.com";
  const httpFetch = opts.httpFetch || (typeof fetch === "function" ? fetch : null);

  const r = express.Router();
  r.use(function (req, res, next) { res.setHeader("Cache-Control", "no-store"); next(); });

  // 原始 body 捕获（验签需要未解析字节）
  function rawCapture(req, res, next) {
    const chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
  }

  // 管理员生成收款链接（只收首月 setup_price；已付款/已有链接直接返回现有值）
  r.post("/bills", requireAdmin, requireWrite, rateLimit(10, 60 * 60 * 1000), async function (req, res, next) {
    try {
      if (!envConfigured()) return res.status(503).json({ ok: false, error: "gateway_not_configured" });
      if (!httpFetch) return res.status(503).json({ ok: false, error: "gateway_not_configured" });
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const id = core.parseId(body.id);
      if (!id) return res.status(404).json({ ok: false, error: "not_found" });
      const out = await pool.query(
        "SELECT order_no, name, phone, email, setup_price::float8 AS setup_price, payment_status, bill_url " +
        "FROM site_orders WHERE id = $1", [id]);
      const order = out.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: "not_found" });
      if (order.payment_status === "paid") return res.status(409).json({ ok: false, error: "already_paid" });
      if (order.bill_url) return res.json({ ok: true, bill_url: order.bill_url, bill_id: null });

      const amountCents = amountToCents(order.setup_price);
      if (!amountCents) return res.status(400).json({ ok: false, error: "invalid_amount" });
      const params = new URLSearchParams();
      params.set("collection_id", process.env.BILLPLZ_COLLECTION_ID);
      params.set("email", order.email || "");
      params.set("mobile", String(order.phone || "").replace(/[^\d+]/g, ""));
      params.set("name", String(order.name || "").slice(0, 255));
      params.set("amount", String(amountCents));
      params.set("description", "Website setup + first month — " + order.order_no);
      params.set("callback_url", siteUrl + "/api/internal/payments/billplz/callback");
      params.set("redirect_url", siteUrl + "/client/");
      params.set("reference_1", order.order_no);
      params.set("reference_2", String(order.email || order.name || "").slice(0, 120));

      const mode = process.env.BILLPLZ_MODE === "production" ? "production" : "sandbox";
      const auth = "Basic " + Buffer.from(process.env.BILLPLZ_API_KEY + ":").toString("base64");
      const res2 = await httpFetch(billplzBase(mode) + "/api/v3/bills", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": auth },
        body: params.toString()
      });
      const j = await res2.json().catch(function () { return {}; });
      if (!res2.ok || !j.id || !j.url) {
        console.error("billplz create failed", order.order_no, res2.status, j && j.error ? JSON.stringify(j.error) : "");
        return res.status(502).json({ ok: false, error: "gateway_error" });
      }
      await pool.query(
        "UPDATE site_orders SET gateway='billplz', gateway_ref=$2, bill_url=$3, updated_at=now() WHERE id=$1",
        [id, j.id, j.url]);
      return res.json({ ok: true, bill_url: j.url, bill_id: j.id });
    } catch (e) { next(e); }
  });

  // 管理员读取配置状态（后台按钮提示用）
  r.get("/config", requireAdmin, async function (req, res, next) {
    try {
      res.json({ ok: true, configured: envConfigured(), mode: process.env.BILLPLZ_MODE === "production" ? "production" : "sandbox" });
    } catch (e) { next(e); }
  });

  // Billplz 回调：先捕获原始 body，验签后按 reference_1 找订单
  r.post("/billplz/callback", rawCapture, async function (req, res, next) {
    try {
      if (!envConfigured()) return res.status(503).json({ ok: false, error: "gateway_not_configured" });
      const webhookKey = process.env.BILLPLZ_WEBHOOK_KEY || "";
      const raw = String(req.rawBody || "");
      if (webhookKey) {
        const got = String(req.get("x-signature") || "");
        if (!safeEqual(got, signPayload(raw, webhookKey))) {
          return res.status(401).json({ ok: false, error: "bad_signature" });
        }
      }
      const p = new URLSearchParams(raw);
      const orderNo = String(p.get("reference_1") || "").trim().toUpperCase();
      const paid = String(p.get("paid") || "") === "true";
      const amount = p.get("amount");
      if (!core.ORDER_NO_RE.test(orderNo)) return res.status(400).json({ ok: false, error: "invalid_order_no" });
      if (!paid) return res.json({ ok: true, ignored: "not_paid" });

      const out = await pool.query(
        "SELECT id, setup_price::float8 AS setup_price, payment_status FROM site_orders WHERE upper(order_no)=upper($1)",
        [orderNo]);
      const order = out.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: "not_found" });
      if (Number(amount) !== amountToCents(order.setup_price)) {
        return res.status(400).json({ ok: false, error: "amount_mismatch" });
      }
      if (order.payment_status === "paid") return res.json({ ok: true, already: true });

      await pool.query("BEGIN");
      try {
        await pool.query(
          "UPDATE site_orders SET payment_status='paid', paid_at=now(), status='paid', updated_at=now() WHERE id=$1",
          [order.id]);
        await pool.query(
          "INSERT INTO site_order_events(order_id, type, note, actor) VALUES ($1,'payment',$2,'billplz')",
          [order.id, "billplz:" + String(p.get("id") || "")]);
        await pool.query("COMMIT");
      } catch (e) {
        try { await pool.query("ROLLBACK"); } catch (e2) { /* ignore */ }
        throw e;
      }
      return res.json({ ok: true, paid: true });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = { createPaymentsApi, billplzBase, amountToCents, signPayload, safeEqual, envConfigured };
