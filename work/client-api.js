"use strict";
// client-api.js — 客户建站门户 API（挂在 /api/client）
// 登录：邮箱 magic link（20 分钟、一次性、只存 sha256）→ 30 天会话 cookie fc_client
// 安全纪律：客户只能看自己的订单；他人/不存在订单统一 404（不泄露存在性）；
//          库里只存 token 的 sha256；任何日志都不得出现 raw token / 含 token 的 URL / token hash；
//          所有响应（含 401/404/429）都带 Cache-Control: no-store。
// 依赖：只用 express + node:crypto（自己解析 cookie，不引入 cookie-parser）。

const express = require("express");
const crypto = require("node:crypto");
const core = require("./order-core");

const COOKIE_NAME = "fc_client";
const DEFAULT_SITE_URL = "https://kwongthye.com";
// 20 分钟 magic link / 30 天会话（与 Set-Cookie 的 Max-Age=2592000 对齐）
const MAGIC_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE = 2592000; // 30 天，秒
const SET_COOKIE = COOKIE_NAME + "=%s; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + COOKIE_MAX_AGE;
const CLEAR_COOKIE = COOKIE_NAME + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

const MAGIC_TOKEN_RE = /^[a-f0-9]{64}$/;

const ORDER_SELECT = `
  SELECT o.id, o.order_no, o.phase, o.progress, o.payment_status,
         o.monthly_price::float8 AS monthly_price, o.setup_price::float8 AS setup_price,
         o.created_at, o.updated_at, o.launched_at, o.brief_json,
         COALESCE((SELECT SUM(CASE WHEN l.kind = 'usage' THEN -l.amount ELSE l.amount END)
                   FROM token_ledger l WHERE l.order_id = o.id), 0)::float8 AS tokens
  FROM site_orders o`;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function newToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 位小写 hex
}

function parseCookie(req, name) {
  const raw = String((req && req.headers && req.headers.cookie) || "");
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    // 坏 percent-encoding 只跳过这一条，继续找同名 cookie（可能有不同 Path 的同名 cookie）
    try { return decodeURIComponent(value); } catch (e) { continue; }
  }
  return "";
}

// 客户响应 order 恰好 10 键（不带 name/phone/email/status/client_user_id）
function clientOrderRow(row) {
  return {
    id: row.id,
    order_no: row.order_no,
    phase: row.phase,
    progress: row.progress,
    payment_status: row.payment_status,
    monthly_price: row.monthly_price,
    setup_price: row.setup_price,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tokens: row.tokens
  };
}

// 客户响应 order 详情恰好 12 键；brief_json 原样返回对象（PG jsonb 已是对象，字符串兜底解析）
function clientOrderDetail(row) {
  return {
    id: row.id,
    order_no: row.order_no,
    phase: row.phase,
    progress: row.progress,
    payment_status: row.payment_status,
    monthly_price: row.monthly_price,
    setup_price: row.setup_price,
    tokens: row.tokens,
    created_at: row.created_at,
    updated_at: row.updated_at,
    launched_at: row.launched_at,
    brief_json: briefJson(row.brief_json)
  };
}

function briefJson(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (e) { return {}; }
  }
  return value;
}

// 变更请求入参：字段顺序即报错优先级（未知字段忽略）。
// 文本里的 NUL 一律删除：Postgres text 不接受 \u0000，否则会 500 而不是 400。
function normalizeChange(body) {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  const title = typeof raw.title === "string" ? raw.title.replace(/\u0000/g, "").trim() : "";
  if (!title || title.length > 120) return { field: "title" };

  const description = typeof raw.description === "string"
    ? raw.description.replace(/\u0000/g, "").trim() : "";
  if (!description || description.length > 2000) return { field: "description" };

  let pageUrl = null;
  if (raw.page_url !== undefined && raw.page_url !== null) {
    if (typeof raw.page_url !== "string") return { field: "page_url" };
    const s = raw.page_url.replace(/\u0000/g, "").trim();
    if (s) {
      if (s.length > 500) return { field: "page_url" };
      let u;
      try { u = new URL(s); } catch (e) { return { field: "page_url" }; }
      if (u.protocol !== "http:" && u.protocol !== "https:") return { field: "page_url" };
      if (u.username || u.password) return { field: "page_url" };
      pageUrl = s;
    }
  }

  let priority = "normal"; // 空/缺省 → normal
  if (raw.priority !== undefined && raw.priority !== null) {
    if (typeof raw.priority !== "string") return { field: "priority" };
    const p = raw.priority.trim().toLowerCase();
    if (p) {
      if (core.CHANGE_PRIORITIES.indexOf(p) < 0) return { field: "priority" };
      priority = p;
    }
  }

  return { field: null, values: { title: title, description: description, page_url: pageUrl, priority: priority } };
}

module.exports = function createClientApi(opts) {
  const pool = opts && opts.pool;
  if (!pool) throw new Error("client-api: pool is required");
  const sendMail = opts && opts.sendMail;
  if (typeof sendMail !== "function") throw new Error("client-api: sendMail is required");
  const rateLimit = opts && typeof opts.rateLimit === "function" ? opts.rateLimit : null;
  const siteUrl = String((opts && opts.siteUrl) || DEFAULT_SITE_URL).replace(/\/+$/, "");

  function limit(max, windowMs) {
    return rateLimit ? rateLimit(max, windowMs) : function (req, res, next) { next(); };
  }

  function wrap(fn) {
    return function (req, res, next) {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // 任何响应（含 401/404/429）都不缓存：客户页 30 秒轮询必须拿实时数据
  const r = express.Router();
  r.use(function (req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  async function requireClient(req, res, next) {
    try {
      const raw = parseCookie(req, COOKIE_NAME);
      if (!raw) return res.status(401).json({ ok: false, error: "auth_required" });
      const out = await pool.query(
        "SELECT u.id, u.email, u.name, u.phone " +
        "FROM client_sessions s JOIN client_users u ON u.id = s.client_user_id " +
        "WHERE s.token_hash = $1 AND s.expires_at > now()",
        [sha256(raw)]
      );
      const row = out.rows[0];
      if (!row) return res.status(401).json({ ok: false, error: "auth_required" });
      // id 不 cast：node-pg 的 int8 → JSON string，前端只当不透明 ID
      req.client = { id: row.id, email: row.email, name: row.name, phone: row.phone };
      next();
    } catch (e) {
      next(e);
    }
  }

  // ---------- 1) 申请登录链接 ----------
  // 无论账号原本是否存在，响应体/状态码完全一致（防枚举）。
  // 限流在 handler 之前，所以非法邮箱也占配额。
  r.post("/request-link", limit(5, 10 * 60 * 1000), wrap(async function (req, res) {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const email = core.normalizeEmail(body.email);
    if (!email) return res.status(400).json({ ok: false, error: "invalid_email" });

    const rawToken = newToken();
    const magicExpires = new Date(Date.now() + MAGIC_TTL_MS);

    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      // 冲突目标是单一表达式 lower(email)（唯一索引口径）
      const ins = await conn.query(
        "INSERT INTO client_users(email) VALUES ($1) ON CONFLICT (lower(email)) DO NOTHING " +
        "RETURNING id, email, name, phone",
        [email]
      );
      let user = ins.rows[0] || null;
      if (!user) {
        const found = await conn.query(
          "SELECT id, email, name, phone FROM client_users WHERE lower(email) = lower($1)",
          [email]
        );
        user = found.rows[0] || null;
      }
      if (!user) throw new Error("client_user_upsert_failed");
      // 绑定历史订单：绑定不是订单内容变更，不动 updated_at
      await conn.query(
        "UPDATE site_orders SET client_user_id = $1 " +
        "WHERE client_user_id IS NULL AND lower(email) = lower($2) AND email IS NOT NULL",
        [user.id, email]
      );
      await conn.query(
        "INSERT INTO client_magic_links(client_user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
        [user.id, sha256(rawToken), magicExpires]
      );
      await conn.query("COMMIT");
    } catch (e) {
      try { await conn.query("ROLLBACK"); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      // 先归还连接：SMTP 是外部 I/O，不能占着 pool（生产 max 5），发信慢会拖垮整个 API
      conn.release();
    }

    // COMMIT 之后才发信（SMTP 不占事务锁，也不占连接）；发信失败也 200（不能变成枚举面）
    const link = siteUrl + "/client/?token=" + rawToken;
    const subject = "客户门户登录 / Client portal sign in — KWONG THYE";
    const text = [
      "您好，",
      "",
      "请点击下面的链接登录 KWONG THYE 客户门户（20 分钟内有效，仅可使用一次）：",
      link,
      "",
      "链接有效期：20 分钟 / 20 minutes",
      "",
      "如果这不是您本人的操作，请忽略此邮件。",
      "",
      "Hello,",
      "",
      "Tap the link below to sign in to your KWONG THYE client portal (valid for 20 minutes, single use):",
      link,
      "",
      "If you did not request this email, please ignore it.",
      "",
      "KWONG THYE 光泰",
      "https://kwongthye.com"
    ].join("\n");
    try {
      await sendMail(email, subject, text);
    } catch (e) {
      // 日志纪律：只允许这一条，且不得带 raw token / token hash / 含 token 的 URL
      console.error("client magic mail failed", email, e.message);
    }
    return res.json({ ok: true });
  }));

  // ---------- 2) 兑换 magic link → 建会话 ----------
  r.post("/verify", wrap(async function (req, res) {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!MAGIC_TOKEN_RE.test(token)) return res.status(400).json({ ok: false, error: "invalid_token" });

    const tokenHash = sha256(token);
    const sessionRaw = newToken();
    const sessionExpires = new Date(Date.now() + SESSION_TTL_MS);

    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      const found = await conn.query(
        "SELECT l.id, l.client_user_id, u.email, u.name, u.phone " +
        "FROM client_magic_links l JOIN client_users u ON u.id = l.client_user_id " +
        "WHERE l.token_hash = $1 AND l.used_at IS NULL AND l.expires_at > now()",
        [tokenHash]
      );
      const link = found.rows[0];
      if (!link) {
        await conn.query("ROLLBACK");
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
      // 原子消费：并发下只有一个 UPDATE 拿到行
      const consumed = await conn.query(
        "UPDATE client_magic_links SET used_at = now() " +
        "WHERE id = $1 AND used_at IS NULL AND expires_at > now() RETURNING id",
        [link.id]
      );
      if (!consumed.rows[0]) {
        await conn.query("ROLLBACK");
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
      await conn.query(
        "INSERT INTO client_sessions(client_user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
        [link.client_user_id, sha256(sessionRaw), sessionExpires]
      );
      await conn.query("UPDATE client_users SET last_login_at = now() WHERE id = $1", [link.client_user_id]);
      await conn.query("COMMIT");

      res.setHeader("Set-Cookie", SET_COOKIE.replace("%s", sessionRaw));
      // name / phone 可以是 null，不得兜底成空串
      return res.json({
        ok: true,
        client: { id: link.client_user_id, email: link.email, name: link.name, phone: link.phone }
      });
    } catch (e) {
      try { await conn.query("ROLLBACK"); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }));

  // ---------- 3) 退出（不挂 requireClient） ----------
  // 先清 cookie，再尽力删会话；DELETE 失败也 200（客户端已无 cookie）。
  r.post("/logout", wrap(async function (req, res) {
    res.setHeader("Set-Cookie", CLEAR_COOKIE);
    try {
      const raw = parseCookie(req, COOKIE_NAME);
      if (raw) await pool.query("DELETE FROM client_sessions WHERE token_hash = $1", [sha256(raw)]);
    } catch (e) {
      console.error("client logout failed", e.message);
    }
    return res.json({ ok: true });
  }));

  // ---------- 4) 我的资料 + 我的订单列表 ----------
  r.get("/me", requireClient, wrap(async function (req, res) {
    const out = await pool.query(
      "SELECT o.id, o.order_no, o.phase, o.progress, o.payment_status,\n" +
      "       o.monthly_price::float8 AS monthly_price, o.setup_price::float8 AS setup_price,\n" +
      "       o.created_at, o.updated_at,\n" +
      "       COALESCE((SELECT SUM(CASE WHEN l.kind = 'usage' THEN -l.amount ELSE l.amount END)\n" +
      "                 FROM token_ledger l WHERE l.order_id = o.id), 0)::float8 AS tokens\n" +
      "FROM site_orders o\n" +
      "WHERE o.client_user_id = $1\n" +
      "ORDER BY o.created_at DESC, o.id DESC",
      [req.client.id]
    );
    res.json({ ok: true, client: req.client, orders: out.rows.map(clientOrderRow) });
  }));

  // ---------- 5) 订单详情（归属闸门在前：不存在与他人订单一律 404） ----------
  r.get("/orders/:id", requireClient, wrap(async function (req, res) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const gate = await pool.query(ORDER_SELECT + " WHERE o.id = $1 AND o.client_user_id = $2",
      [id, req.client.id]);
    const row = gate.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });

    // updates 只回 visible=true，且不暴露 actor/visible
    const updates = await pool.query(
      "SELECT id, phase, progress, note, created_at FROM order_updates " +
      "WHERE order_id = $1 AND visible = true ORDER BY created_at DESC, id DESC LIMIT 50",
      [id]
    );
    const changes = await pool.query(
      "SELECT id, title, description, page_url, priority, status, admin_note, created_at, updated_at " +
      "FROM change_requests WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
      [id]
    );
    const ledger = await pool.query(
      "SELECT id, kind, amount::float8 AS amount, note, created_at FROM token_ledger " +
      "WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
      [id]
    );

    res.json({
      ok: true,
      order: clientOrderDetail(row),
      updates: updates.rows,
      changes: changes.rows,
      ledger: ledger.rows
    });
  }));

  // ---------- 6) 自动 token 费用（来自 token_usage，不是人工 ledger） ----------
  // 汇总所有自己的订单，给 dashboard 卡片用；按 order_id 分组。
  r.get("/token-usage", requireClient, wrap(async function (req, res) {
    const out = await pool.query(
      "SELECT u.order_id, COALESCE(SUM(u.cost_myr),0)::float8 AS cost_myr, " +
      "       COALESCE(SUM(u.cost_usd),0)::float8 AS cost_usd, " +
      "       COALESCE(SUM(u.uncached_input_tokens + u.cache_read_tokens + u.cache_write_tokens + u.output_tokens),0)::bigint AS tokens, " +
      "       MAX(u.updated_at) AS last_at " +
      "FROM token_usage u JOIN site_orders o ON o.id=u.order_id " +
      "WHERE o.client_user_id=$1 GROUP BY u.order_id", [req.client.id]
    );
    res.json({ ok: true, rows: out.rows.map(function (x) {
      return { order_id: x.order_id, cost_myr: x.cost_myr, cost_usd: x.cost_usd,
        tokens: Number(x.tokens), last_at: x.last_at };
    }) });
  }));

  // 单个订单：摘要 + 最近 100 条；仍以订单归属为第一道闸门。
  r.get("/orders/:id/token-usage", requireClient, wrap(async function (req, res) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });
    const owned = await pool.query("SELECT id FROM site_orders WHERE id=$1 AND client_user_id=$2", [id, req.client.id]);
    if (!owned.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const summary = await pool.query(
      "SELECT COALESCE(SUM(cost_myr),0)::float8 AS total_cost_myr, " +
      "       COALESCE(SUM(cost_usd),0)::float8 AS total_cost_usd, " +
      "       COALESCE(SUM(uncached_input_tokens + cache_read_tokens + cache_write_tokens + output_tokens),0)::bigint AS total_tokens, " +
      "       COALESCE(SUM(CASE WHEN observed_at >= date_trunc('month', now()) THEN cost_myr ELSE 0 END),0)::float8 AS month_cost_myr, " +
      "       MAX(updated_at) AS last_at FROM token_usage WHERE order_id=$1", [id]
    );
    const rows = await pool.query(
      "SELECT id, model, uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, " +
      "       rate_period, cost_myr, observed_at, updated_at FROM token_usage " +
      "WHERE order_id=$1 ORDER BY observed_at DESC, id DESC LIMIT 100", [id]
    );
    const s = summary.rows[0] || {};
    res.json({ ok: true, summary: {
      total_cost_myr: s.total_cost_myr || 0, total_cost_usd: s.total_cost_usd || 0,
      total_tokens: Number(s.total_tokens || 0), month_cost_myr: s.month_cost_myr || 0, last_at: s.last_at || null
    }, rows: rows.rows });
  }));

  // ---------- 7) 提交变更请求 ----------
  // 顺序固定：鉴权 → 限流 → parseId → 归属 → body 校验（避免 400/404 差异探测他人订单）
  r.post("/orders/:id/changes", requireClient, limit(20, 60 * 60 * 1000), wrap(async function (req, res) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const owned = await pool.query(
      "SELECT id FROM site_orders WHERE id = $1 AND client_user_id = $2", [id, req.client.id]);
    if (!owned.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const check = normalizeChange(req.body);
    if (check.field) return res.status(400).json({ ok: false, error: "invalid_input", field: check.field });

    const v = check.values;
    const out = await pool.query(
      "INSERT INTO change_requests(order_id,title,description,page_url,priority,status) " +
      "VALUES ($1,$2,$3,$4,$5,'open') " +
      "RETURNING id,title,description,page_url,priority,status,admin_note,created_at,updated_at",
      [id, v.title, v.description, v.page_url, v.priority]
    );
    // 不写 site_order_events、不写 order_updates（变更由后台 PATCH 推进）
    res.status(201).json({ ok: true, change: out.rows[0] });
  }));

  return r;
};
