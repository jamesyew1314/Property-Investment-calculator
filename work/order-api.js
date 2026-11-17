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
         o.status, o.phase, o.progress, o.payment_status, o.paid_at,
         o.contract_accepted, o.created_at, o.updated_at,
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

// 文本字段去掉 NUL：Postgres text 不接受 \u0000，否则非法输入会 500 而不是 400
function cleanNullable(v) {
  const s = cleanText(v);
  if (!s) return null;
  return s.replace(/\u0000/g, "").trim() || null;
}

// PG jsonb 出参已是对象；字符串（如手写假库）兜底解析，默认 {}
function jsonObject(v) {
  if (v === null || v === undefined) return {};
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch (e) { return {}; }
  }
  return v;
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
    // 订单本体优先报错：本体通过后才校验 brief（保持既有 field 优先级）
    const brief = core.normalizeBrief((req.body || {}).brief);
    if (!brief.ok) {
      return res.status(400).json({ ok: false, error: "invalid_input", field: "brief" });
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
                package_code, monthly_price, setup_price, contract_accepted, brief_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
             RETURNING id, order_no, status, monthly_price::float8 AS monthly_price,
                       setup_price::float8 AS setup_price, created_at`,
            [orderNo, v.name, v.phone, v.email, v.company, v.ren_no, v.area, v.domain, v.notes,
              core.PACKAGE_CODE, core.PRICES.monthly, core.PRICES.setup, v.contract_accepted,
              JSON.stringify(brief.value)]
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
      // 同事务内按 lower(email) 绑定客户账号（客户此刻可能还没登录过门户）；
      // 只绑未绑定的单，已有归属的订单绝不被抢。无匹配用户时 0 行，不算错误。
      if (v.email) {
        await client.query(
          "UPDATE site_orders o SET client_user_id = u.id " +
          "FROM client_users u " +
          "WHERE o.id = $1 AND o.client_user_id IS NULL AND lower(u.email) = lower($2)",
          [created.id, v.email]
        );
      }
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

  // ---------- 后台：确认付款（requireAdmin + requireWrite） ----------
  // paid → paid_at=now() + status='paid'；unpaid/refunded → paid_at=NULL 且不改 status（合同字面）。
  // 注意（已知风险 A4）：已 live 的订单被 PATCH paid 会把 status 回退成 paid，phase 不动。
  r.patch("/admin/orders/:id/payment", requireAdmin, requireWrite, wrap(async function (req, res, next) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    // 只接受 string：缺失 / number / boolean 一律 400（旧实现会 500）
    if (typeof body.payment_status !== "string") {
      return res.status(400).json({ ok: false, error: "invalid_payment_status" });
    }
    const paymentStatus = body.payment_status.trim().toLowerCase();
    if (core.PAYMENT_STATUSES.indexOf(paymentStatus) < 0) {
      return res.status(400).json({ ok: false, error: "invalid_payment_status" });
    }

    const actor = (req.admin && req.admin.email) || "admin";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        "SELECT id, status, payment_status FROM site_orders WHERE id = $1 FOR UPDATE", [id]);
      const row = cur.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      if (paymentStatus === "paid") {
        await client.query(
          "UPDATE site_orders SET payment_status=$1, paid_at=now(), status='paid', updated_at=now() WHERE id=$2",
          [paymentStatus, id]);
      } else {
        await client.query(
          "UPDATE site_orders SET payment_status=$1, paid_at=NULL, updated_at=now() WHERE id=$2",
          [paymentStatus, id]);
      }
      const eventNote = "payment: " + row.payment_status + " -> " + paymentStatus;
      await client.query(
        "INSERT INTO site_order_events(order_id,type,note,actor) VALUES($1,$2,$3,$4)",
        [id, "payment", eventNote.slice(0, 800), actor]);
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

  // ---------- 后台：发布进度（requireAdmin + requireWrite） ----------
  // phase + progress 双必填；写 site_orders + order_updates（客户可见）+ site_order_events（审计）。
  // 首次进入 live 时写 launched_at（COALESCE 保证之后不覆盖）。
  r.patch("/admin/orders/:id/progress", requireAdmin, requireWrite, wrap(async function (req, res, next) {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const phase = typeof body.phase === "string" ? body.phase.trim().toLowerCase() : "";
    if (!phase || core.PHASES.indexOf(phase) < 0) {
      return res.status(400).json({ ok: false, error: "invalid_phase" });
    }
    const progress = body.progress;
    if (typeof progress !== "number" || !Number.isInteger(progress) || progress < 0 || progress > 100) {
      return res.status(400).json({ ok: false, error: "invalid_progress" });
    }
    const note = cleanNullable(body.note);
    if (note && note.length > 500) return res.status(400).json({ ok: false, error: "invalid_note" });

    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const actor = (req.admin && req.admin.email) || "admin";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        "SELECT id, phase, progress, launched_at FROM site_orders WHERE id = $1 FOR UPDATE", [id]);
      const row = cur.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      // 三条语句参数各自编号，不复用数组
      await client.query(
        "UPDATE site_orders SET phase=$1, progress=$2, updated_at=now() WHERE id=$3",
        [phase, progress, id]);

      const upd = await client.query(
        "INSERT INTO order_updates(order_id,phase,progress,note,visible,actor) " +
        "VALUES ($1,$2,$3,$4,true,$5) " +
        "RETURNING id,order_id,phase,progress,note,visible,actor,created_at",
        [id, phase, progress, note, actor]);

      let eventNote = "progress: " + row.phase + "/" + row.progress + " -> " + phase + "/" + progress;
      if (note) eventNote += " | " + note;
      await client.query(
        "INSERT INTO site_order_events(order_id,type,note,actor) VALUES($1,$2,$3,$4)",
        [id, "progress", eventNote.slice(0, 800), actor]);

      if (phase === "live") {
        await client.query(
          "UPDATE site_orders SET launched_at = COALESCE(launched_at, now()) WHERE id=$1", [id]);
      }
      await client.query("COMMIT");

      const out = await pool.query(ADMIN_SELECT + " WHERE o.id = $1", [id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, order: out.rows[0], update: upd.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      next(e);
    } finally {
      client.release();
    }
  }));

  // ---------- 后台：订单详情扩展（只挂 requireAdmin，不加 requireWrite / 不限流） ----------
  // 与 /events 同纪律：只读接口，viewer 也必须能看。
  r.get("/admin/orders/:id/detail", requireAdmin, wrap(async function (req, res) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const exists = await pool.query("SELECT id FROM site_orders WHERE id = $1", [id]);
    if (!exists.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const orderOut = await pool.query(ADMIN_SELECT + " WHERE o.id = $1", [id]);
    if (!orderOut.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const briefOut = await pool.query("SELECT brief_json FROM site_orders WHERE id = $1", [id]);
    if (!briefOut.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    // 后台可见 visible=false 的更新，并带 actor/visible（客户接口不带）
    const updates = await pool.query(
      "SELECT id,phase,progress,note,visible,actor,created_at FROM order_updates " +
      "WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100", [id]);
    const changes = await pool.query(
      "SELECT id,title,description,page_url,priority,status,admin_note,created_at,updated_at " +
      "FROM change_requests WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100", [id]);
    const ledger = await pool.query(
      "SELECT id,kind,amount::float8 AS amount,note,created_at FROM token_ledger " +
      "WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100", [id]);

    res.json({
      ok: true,
      order: orderOut.rows[0],
      brief_json: jsonObject(briefOut.rows[0].brief_json),
      updates: updates.rows,
      changes: changes.rows,
      ledger: ledger.rows
    });
  }));

  // ---------- 后台：变更请求推进（requireAdmin + requireWrite） ----------
  r.patch("/admin/changes/:id", requireAdmin, requireWrite, wrap(async function (req, res) {
    const id = core.parseId(req.params.id);
    if (!id) return res.status(404).json({ ok: false, error: "not_found" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    const hasNote = Object.prototype.hasOwnProperty.call(body, "admin_note");
    if (!hasStatus && !hasNote) return res.status(400).json({ ok: false, error: "empty_patch" });

    let status = null;
    if (hasStatus) {
      const s = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
      if (core.CHANGE_STATUSES.indexOf(s) < 0) {
        return res.status(400).json({ ok: false, error: "invalid_status" });
      }
      status = s;
    }
    let note = null;
    if (hasNote) {
      note = cleanNullable(body.admin_note);
      if (note && note.length > 1000) return res.status(400).json({ ok: false, error: "invalid_note" });
    }

    // 单条固定 UPDATE：未提供的字段保持原值（CASE WHEN $2 决定是否覆盖 admin_note）
    const out = await pool.query(
      "UPDATE change_requests " +
      "SET status = COALESCE($1, status), " +
      "    admin_note = CASE WHEN $2 THEN $3 ELSE admin_note END, " +
      "    updated_at = now() " +
      "WHERE id = $4 " +
      "RETURNING id,title,description,page_url,priority,status,admin_note,created_at,updated_at",
      [status, hasNote, note, id]);
    if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    // 不写 site_order_events、不写 order_updates（变更状态不是客户可见进度）
    res.json({ ok: true, change: out.rows[0] });
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
