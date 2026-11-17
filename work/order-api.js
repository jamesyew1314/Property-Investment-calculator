"use strict";
// order-api.js — 建站接单系统 API（挂在 /api 下）
// 公开：POST /orders、GET /orders/:orderNo
// 后台：/admin/orders*，沿用 api-server.js 的 fc_admin 管理员会话（requireAdmin / requireWrite）
// 约定：金额 NUMERIC → 出参转 float；错误一律 JSON，不泄露堆栈。

const express = require("express");
const crypto = require("node:crypto");
const core = require("./order-core");

const ADMIN_SELECT = `
  SELECT o.id, o.order_no, o.name, o.phone, o.email, o.company, o.ren_no, o.area, o.domain, o.notes,
         o.package_code, o.monthly_price::float8 AS monthly_price, o.setup_price::float8 AS setup_price,
         o.status, o.contract_accepted, o.created_at, o.updated_at,
         COALESCE((SELECT SUM(CASE WHEN l.kind = 'usage' THEN -l.amount ELSE l.amount END)
                   FROM token_ledger l WHERE l.order_id = o.id), 0)::float8 AS tokens
  FROM site_orders o`;

function publicOrder(row) {
  return {
    order_no: row.order_no,
    status: row.status,
    created_at: row.created_at
  };
}

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

module.exports = function createOrderApi(opts) {
  const pool = opts && opts.pool;
  if (!pool) throw new Error("order-api: pool is required");

  const rateLimit = opts && typeof opts.rateLimit === "function" ? opts.rateLimit : null;
  const requireAdmin = opts && typeof opts.requireAdmin === "function"
    ? opts.requireAdmin
    : function (req, res) { return res.status(503).json({ ok: false, error: "admin_disabled" }); };
  const requireWrite = opts && typeof opts.requireWrite === "function"
    ? opts.requireWrite
    : function (req, res) { return res.status(503).json({ ok: false, error: "admin_disabled" }); };

  function limit(max, windowMs) {
    return rateLimit ? rateLimit(max, windowMs) : function (req, res, next) { next(); };
  }

  function wrap(fn) {
    return function (req, res, next) {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // 公开查单按 IP + 固定桶限流。不能复用全局 rateLimit：它按 req.path 分桶，
  // /orders/<单号> 每个单号都是新 key，等于没有限流，且 Map 会无限增长。
  const readHits = new Map();
  function readLimit(max, windowMs) {
    return function (req, res, next) {
      const now = Date.now();
      const key = (req.ip || "") + "|orders-read";
      if (readHits.size > 5000) {
        for (const k of readHits.keys()) {
          const v = readHits.get(k);
          if (!v || now > v.reset) readHits.delete(k);
        }
      }
      let rec = readHits.get(key);
      if (!rec || now > rec.reset) { rec = { n: 0, reset: now + windowMs }; readHits.set(key, rec); }
      rec.n++;
      if (rec.n > max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((rec.reset - now) / 1000))));
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }
      next();
    };
  }

  const r = express.Router();
  r.use(function (req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // ---------- 公开：提交订单 ----------
  r.post("/orders", limit(5, 10 * 60 * 1000), wrap(async function (req, res, next) {
    const check = core.normalizeOrder(req.body);
    if (check.first_error) {
      return res.status(400).json({ ok: false, error: "invalid_input", field: check.first_field });
    }
    const v = check.values;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 单号冲突会在事务内触发 23505；必须先设 savepoint，回滚到它再重试，
      // 否则整个事务进入 aborted 状态，下一次 INSERT 只会得到 25P02。
      await client.query("SAVEPOINT order_try");
      let created = null;
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const orderNo = core.randomOrderNo(new Date(), crypto.randomInt);
        try {
          const out = await client.query(
            `INSERT INTO site_orders
               (order_no, name, phone, email, company, ren_no, area, domain, notes,
                package_code, monthly_price, setup_price, contract_accepted)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id, order_no, status, monthly_price::float8 AS monthly_price,
                       setup_price::float8 AS setup_price, created_at`,
            [orderNo, v.name, v.phone, v.email, v.company, v.ren_no, v.area, v.domain, v.notes,
              core.PACKAGE_CODE, core.PRICES.monthly, core.PRICES.setup, v.contract_accepted]
          );
          created = out.rows[0];
          await client.query("RELEASE SAVEPOINT order_try");
        } catch (e) {
          // 单号撞车：回滚到 savepoint 清除 aborted 状态，换一个再试；其他错误照常抛
          if (e && e.code === "23505") {
            await client.query("ROLLBACK TO SAVEPOINT order_try");
            continue;
          }
          throw e;
        }
      }
      if (!created) throw new Error("order_no_collision");
      await client.query(
        "INSERT INTO site_order_events(order_id, type, note, actor) VALUES ($1,'created',$2,'public')",
        [created.id, "public order form"]
      );
      await client.query("COMMIT");
      res.status(201).json({
        ok: true,
        order: {
          order_no: created.order_no,
          status: created.status,
          monthly_price: created.monthly_price,
          setup_price: created.setup_price
        }
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      next(e);
    } finally {
      client.release();
    }
  }));

  // ---------- 公开：按单号查进度（只回三列，不泄露联系方式） ----------
  r.get("/orders/:orderNo", readLimit(60, 10 * 60 * 1000), wrap(async function (req, res, next) {
    const no = String(req.params.orderNo || "").trim().toUpperCase();
    if (!core.ORDER_NO_RE.test(no)) return res.status(404).json({ ok: false, error: "not_found" });
    const out = await pool.query(
      "SELECT order_no, status, created_at FROM site_orders WHERE upper(order_no) = upper($1)",
      [no]
    );
    if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, order: publicOrder(out.rows[0]) });
  }));

  // ---------- 后台：订单列表 ----------
  r.get("/admin/orders", requireAdmin, limit(120, 60 * 1000), wrap(async function (req, res, next) {
    const where = [];
    const params = [];
    const rawStatus = String(req.query.status || "").trim();
    if (rawStatus) {
      const status = core.validateStatus(rawStatus);
      if (!status) return res.status(400).json({ ok: false, error: "invalid_status" });
      params.push(status);
      where.push("o.status = $" + params.length);
    }
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q) {
      params.push("%" + q + "%");
      const p = "$" + params.length;
      where.push("(o.order_no ILIKE " + p + " OR o.name ILIKE " + p +
        " OR o.phone ILIKE " + p + " OR o.company ILIKE " + p + " OR o.email ILIKE " + p + ")");
    }
    const sql = ADMIN_SELECT +
      (where.length ? " WHERE " + where.join(" AND ") : "") +
      " ORDER BY o.created_at DESC, o.id DESC LIMIT 200";
    const out = await pool.query(sql, params);
    res.json({ ok: true, rows: out.rows });
  }));

  // ---------- 后台：改状态 / 写事件 ----------
  r.patch("/admin/orders/:id", requireAdmin, requireWrite, wrap(async function (req, res, next) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    const hasNote = Object.prototype.hasOwnProperty.call(body, "note");
    if (!hasStatus && !hasNote) return res.status(400).json({ ok: false, error: "empty_patch" });

    let status = null;
    if (hasStatus) {
      status = core.validateStatus(body.status);
      if (!status) return res.status(400).json({ ok: false, error: "invalid_status" });
    }
    const note = cleanText(body.note);
    if (note && note.length > 500) return res.status(400).json({ ok: false, error: "invalid_note" });

    const actor = (req.admin && req.admin.email) || "admin";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query("SELECT id, status FROM site_orders WHERE id = $1 FOR UPDATE", [id]);
      const row = cur.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      const nextStatus = status || row.status;
      const moved = status && status !== row.status;
      if (status) {
        await client.query(
          "UPDATE site_orders SET status = $1, updated_at = now() WHERE id = $2",
          [status, id]
        );
      }
      const transition = moved ? row.status + " -> " + nextStatus : "";
      const eventNote = note || (transition ? "status: " + transition : "status unchanged");
      await client.query(
        "INSERT INTO site_order_events(order_id, type, note, actor) VALUES ($1,$2,$3,$4)",
        [id, status ? "status" : "note", eventNote.slice(0, 800), actor]
      );
      await client.query("COMMIT");

      const out = await pool.query(ADMIN_SELECT + " WHERE o.id = $1", [id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, order: out.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      next(e);
    } finally {
      client.release();
    }
  }));

  // ---------- 后台：订单事件时间线（只读） ----------
  // 只读接口：只挂 requireAdmin（不要 requireWrite），也不加限流。
  // 排序与截断全部由 SQL 完成（created_at DESC, id DESC + LIMIT 100），JS 不再 sort/slice。
  // 存在性必须先查一次：否则「订单不存在」会退化成 200 rows:[]，与「404 not_found」合同冲突。
  // 行原样透出（note/actor 为 null 就是 null，不兜底成 ""），且不加 id 的 cast（与列表接口出参形态一致）。
  r.get("/admin/orders/:id/events", requireAdmin, wrap(async function (req, res, next) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });
    const exists = await pool.query("SELECT id FROM site_orders WHERE id = $1", [id]);
    if (!exists.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const out = await pool.query(
      "SELECT id, type, note, actor, created_at FROM site_order_events" +
      " WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
      [id]
    );
    res.json({ ok: true, rows: out.rows });
  }));

  // ---------- 后台：token 充值 / 扣减 ----------
  r.post("/admin/orders/:id/tokens", requireAdmin, requireWrite, wrap(async function (req, res, next) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const check = core.normalizeToken(req.body);
    if (check.first_error) {
      return res.status(400).json({ ok: false, error: "invalid_token", field: check.first_field });
    }
    const v = check.values;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query("SELECT id FROM site_orders WHERE id = $1 FOR UPDATE", [id]);
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      const rows = await client.query("SELECT kind, amount FROM token_ledger WHERE order_id = $1", [id]);
      const balance = core.balanceOf(rows.rows);
      if (v.kind === "usage" && !core.canUseTokens(balance, v.amount)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "insufficient_tokens", balance: balance });
      }
      await client.query(
        "INSERT INTO token_ledger(order_id, kind, amount, note) VALUES ($1,$2,$3,$4)",
        [id, v.kind, v.amount, v.note]
      );
      await client.query("COMMIT");
      const next = v.kind === "usage" ? balance - v.amount : balance + v.amount;
      res.status(201).json({ ok: true, balance: core.money2(next) });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      next(e);
    } finally {
      client.release();
    }
  }));

  return r;
};
