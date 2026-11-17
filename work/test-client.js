"use strict";
// test-client.js — 客户建站门户 Phase 1（T-005）回归
// 运行：node work/test-client.js
// 真 express + 手写假 pool：不连 Postgres、不发真邮件、不 sleep、不推进真实时钟。
// 覆盖 SPEC §7.1：request-link / verify / session+me / IDOR / changes / logout /
//               admin 扩展（payment/progress/detail/change PATCH）/ 客户页静态 / 横切 no-store。

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
let express = null;
let createClientApi = null;
let createOrderApi = null;
try {
  express = require("express");
  createClientApi = require("./client-api");
  createOrderApi = require("./order-api");
} catch (e) {
  if (!e || e.code !== "MODULE_NOT_FOUND") throw e;
}
const core = require("./order-core");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log("✓ " + label); }
  else { fail++; console.log("✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }
function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }

const SITE_URL = "https://portal.test";
const RAW_RE = /^https?:\/\/[^\s]+\/client\/\?token=([0-9a-f]{64})$/m;
function tokenFromMail(mail) {
  const m = RAW_RE.exec(String((mail && mail.text) || ""));
  return m ? m[1] : "";
}

// ---------- 假 pool：忠实模拟真实 PG 语义 ----------
// 关键语义都按 SQL 文本解析，实现漏写 ORDER BY / visible 过滤 / LIMIT / 归属条件时假库不兜底。
function makePool() {
  const db = {
    users: [], links: [], sessions: [], orders: [],
    updates: [], changes: [], ledger: [], events: [],
    seq: { user: 1, link: 1, session: 1, order: 1, update: 1, change: 1, event: 1 },
    clock: Date.parse("2026-11-17T00:00:00.000Z"),
    mailFail: false,
    failDeleteSessions: false,
    lastUpdatesSql: "", lastChangesSql: "", lastLedgerSql: "",
    lastUpsertSql: "", lastSessionLookupSql: "", lastDeleteSql: "",
    lastPaymentSql: "", lastProgressSql: "", lastOrderUpdateSql: "", lastChangeSql: "",
    lastChangeInsertSql: "", lastBindSql: "", lastMeSql: "", lastAdminSql: "", lastDetailSql: ""
  };
  function tick() { db.clock += 1000; return new Date(db.clock).toISOString(); }
  const nowMs = function () { return Date.now(); };

  function splitTopLevel(text) {
    const out = []; let depth = 0, cur = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  function columnsOf(text) {
    return splitTopLevel(text).map(function (item) {
      const t = item.trim().replace(/::[a-z0-9]+/gi, "");
      const alias = /\s+AS\s+([a-z0-9_]+)\s*$/i.exec(t);
      if (alias) return alias[1];
      return t.replace(/^[a-z]+\./i, "").trim();
    });
  }
  function projectRows(sql, rows) {
    const sel = /^SELECT\s+([\s\S]+?)\s+FROM\s+/i.exec(sql);
    const ret = sel ? null : /\bRETURNING\s+([\s\S]+)$/i.exec(sql);
    const text = sel ? sel[1] : (ret ? ret[1] : null);
    if (!text) throw new Error("fake pool: cannot parse projection: " + sql.slice(0, 80));
    const cols = columnsOf(text);
    return rows.map(function (row) {
      const out = {};
      cols.forEach(function (c) { out[c] = row[c] === undefined ? null : row[c]; });
      return out;
    });
  }
  function orderList(list, sql) {
    let out = list.slice();
    const by = /ORDER BY\s+(?:[a-z]+\.)?created_at\s+(ASC|DESC)/i.exec(sql);
    if (by) {
      const dir = by[1].toUpperCase() === "ASC" ? 1 : -1;
      const idm = /,\s*(?:[a-z]+\.)?id\s+(ASC|DESC)/i.exec(sql);
      const idDir = idm ? (idm[1].toUpperCase() === "ASC" ? 1 : -1) : 0;
      out.sort(function (a, b) {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -dir : dir;
        return idDir ? (Number(a.id) - Number(b.id)) * idDir : 0;
      });
    }
    const lim = /LIMIT\s+(\d+)/i.exec(sql);
    if (lim) out = out.slice(0, Number(lim[1]));
    return out;
  }
  function balance(orderId) {
    let bal = 0;
    db.ledger.filter(function (l) { return String(l.order_id) === String(orderId); }).forEach(function (l) {
      bal += l.kind === "usage" ? -Number(l.amount) : Number(l.amount);
    });
    return Math.round(bal * 100) / 100;
  }
  function orderValue(o, name) {
    if (name === "tokens") return balance(o.id);
    if (name === "monthly_price" || name === "setup_price") return Number(o[name]);
    if (name === "brief_json") return o.brief_json === undefined ? {} : o.brief_json;
    if (name === "phase") return o.phase === undefined ? "brief" : o.phase;
    if (name === "progress") return o.progress === undefined ? 0 : o.progress;
    if (name === "payment_status") return o.payment_status === undefined ? "unpaid" : o.payment_status;
    if (name === "paid_at" || name === "launched_at") return o[name] === undefined ? null : o[name];
    return o[name] === undefined ? null : o[name];
  }
  function projectSiteOrder(sql, o) {
    const m = /^SELECT\s+([\s\S]+?)\s+FROM\s+site_orders\s+o\b/i.exec(sql);
    if (!m) throw new Error("fake pool: cannot parse site_orders projection: " + sql.slice(0, 80));
    const row = {};
    columnsOf(m[1]).forEach(function (name) { row[name] = orderValue(o, name); });
    return row;
  }
  function findOrder(id) {
    return db.orders.find(function (o) { return String(o.id) === String(id); });
  }
  function findUserByEmail(email) {
    return db.users.find(function (u) { return String(u.email).toLowerCase() === String(email).toLowerCase(); });
  }

  async function query(sql, params) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    const p = params || [];
    // ---- 保真助手：按 SQL 里的 $n 与列名取参数，而不是按 JS 位置 ----
    // 把 WHERE id=$3 写成 $2、或把 INSERT 列顺序写反，假库必须像真 PG 一样出错/写错字段。
    function ph(re, fallbackIdx) {
      const m = re.exec(s);
      return m ? p[Number(m[1]) - 1] : p[fallbackIdx];
    }
    function whereId(fallbackIdx) {
      const m = /WHERE id\s*=\s*\$(\d+)/i.exec(s);
      return m ? p[Number(m[1]) - 1] : p[fallbackIdx];
    }
    function insertValues() {
      const m = /INSERT INTO [a-z_]+\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i.exec(s);
      if (!m) throw new Error("fake pool: cannot parse INSERT columns: " + s.slice(0, 100));
      const cols = m[1].split(",").map(function (c) { return c.trim(); });
      const vals = m[2].split(",").map(function (v) { return v.trim(); });
      const out = {};
      cols.forEach(function (col, i) {
        const v = vals[i] === undefined ? "" : vals[i];
        const idx = /^\$(\d+)$/.exec(v);
        if (idx) out[col] = p[Number(idx[1]) - 1];
        else if (/^true$/i.test(v)) out[col] = true;
        else if (/^false$/i.test(v)) out[col] = false;
        else if (/^null$/i.test(v)) out[col] = null;
        else if (/^'([\s\S]*)'$/.test(v)) out[col] = /^'([\s\S]*)'$/.exec(v)[1];
        else out[col] = v;
      });
      return out;
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(s)) return { rows: [] };
    if (s.indexOf("ROLLBACK TO SAVEPOINT") === 0 || s.indexOf("RELEASE SAVEPOINT") === 0 ||
        s.indexOf("SAVEPOINT") === 0) return { rows: [] };

    // ===== 客户账号 / magic link / 会话 =====
    if (s.indexOf("INSERT INTO client_users(email) VALUES ($1)") === 0) {
      db.lastUpsertSql = s;
      const email = String(p[0]);
      if (findUserByEmail(email)) return { rows: [] }; // ON CONFLICT (lower(email)) DO NOTHING
      const row = { id: db.seq.user++, email: email, name: null, phone: null,
        created_at: tick(), last_login_at: null };
      db.users.push(row);
      return { rows: [{ id: row.id, email: row.email, name: row.name, phone: row.phone }] };
    }
    if (s.indexOf("SELECT id, email, name, phone FROM client_users WHERE lower(email) = lower($1)") === 0) {
      const row = findUserByEmail(p[0]);
      return { rows: row ? [{ id: row.id, email: row.email, name: row.name, phone: row.phone }] : [] };
    }
    if (s.indexOf("UPDATE site_orders SET client_user_id = $1") === 0) {
      db.lastBindSql = s;
      // 三个谓词按 SQL 文本决定，缺一个就会抢单 / 绑到 null email 的单
      const onlyUnbound = /client_user_id IS NULL/i.test(s);
      const emailNotNull = /email IS NOT NULL/i.test(s);
      const lowerMatch = /lower\(email\)\s*=\s*lower\(\$(\d+)\)/i.test(s);
      db.orders.forEach(function (o) {
        if (onlyUnbound && o.client_user_id != null) return;
        if (emailNotNull && o.email == null) return;
        if (lowerMatch && String(o.email == null ? "" : o.email).toLowerCase() !== String(p[1]).toLowerCase()) return;
        o.client_user_id = Number(p[0]);
      });
      return { rows: [] };
    }
    if (s.indexOf("INSERT INTO client_magic_links") === 0) {
      db.links.push({ id: db.seq.link++, client_user_id: Number(p[0]), token_hash: p[1],
        expires_at: new Date(p[2]).getTime(), used_at: null, created_at: tick() });
      return { rows: [] };
    }
    if (s.indexOf("WHERE l.token_hash = $1 AND l.used_at IS NULL AND l.expires_at > now()") >= 0) {
      const link = db.links.find(function (l) {
        return l.token_hash === p[0] && l.used_at == null && l.expires_at > nowMs();
      });
      if (!link) return { rows: [] };
      const user = db.users.find(function (u) { return u.id === link.client_user_id; });
      if (!user) return { rows: [] };
      return { rows: [{ id: link.id, client_user_id: link.client_user_id,
        email: user.email, name: user.name, phone: user.phone }] };
    }
    if (s.indexOf("UPDATE client_magic_links SET used_at = now()") === 0) {
      const link = db.links.find(function (l) {
        return String(l.id) === String(p[0]) && l.used_at == null && l.expires_at > nowMs();
      });
      if (!link) return { rows: [] };
      link.used_at = tick();
      return { rows: [{ id: link.id }] };
    }
    if (s.indexOf("INSERT INTO client_sessions") === 0) {
      db.sessions.push({ id: db.seq.session++, client_user_id: Number(p[0]), token_hash: p[1],
        expires_at: new Date(p[2]).getTime(), created_at: tick() });
      return { rows: [] };
    }
    if (s.indexOf("UPDATE client_users SET last_login_at = now()") === 0) {
      const user = db.users.find(function (u) { return String(u.id) === String(p[0]); });
      if (user) user.last_login_at = tick();
      return { rows: [] };
    }
    if (s.indexOf("FROM client_sessions s JOIN client_users u") >= 0) {
      db.lastSessionLookupSql = s;
      const session = db.sessions.find(function (x) {
        return x.token_hash === p[0] && x.expires_at > nowMs();
      });
      if (!session) return { rows: [] };
      const user = db.users.find(function (u) { return u.id === session.client_user_id; });
      if (!user) return { rows: [] };
      return { rows: [{ id: user.id, email: user.email, name: user.name, phone: user.phone }] };
    }
    if (s.indexOf("DELETE FROM client_sessions WHERE token_hash = $1") === 0) {
      db.lastDeleteSql = s;
      if (db.failDeleteSessions) throw new Error("delete failed");
      db.sessions = db.sessions.filter(function (x) { return x.token_hash !== p[0]; });
      return { rows: [] };
    }

    // ===== 客户订单（/me、/orders/:id） =====
    if (s.indexOf("FROM site_orders o") >= 0 && s.indexOf("o.client_user_id = $2") >= 0) {
      db.lastDetailSql = s;
      const row = db.orders.find(function (o) {
        return String(o.id) === String(p[0]) && String(o.client_user_id) === String(p[1]);
      });
      return { rows: row ? [projectSiteOrder(s, row)] : [] };
    }
    if (s.indexOf("FROM site_orders o") >= 0 && s.indexOf("o.client_user_id = $1") >= 0) {
      db.lastMeSql = s;
      const list = db.orders.filter(function (o) { return String(o.client_user_id) === String(p[0]); });
      return { rows: orderList(list, s).map(function (o) { return projectSiteOrder(s, o); }) };
    }
    if (s === "SELECT id FROM site_orders WHERE id = $1 AND client_user_id = $2") {
      const row = db.orders.find(function (o) {
        return String(o.id) === String(p[0]) && String(o.client_user_id) === String(p[1]);
      });
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (s.indexOf("INSERT INTO change_requests") === 0) {
      db.lastChangeInsertSql = s;
      const cols = insertValues();
      const row = { id: db.seq.change++, order_id: Number(cols.order_id), title: cols.title,
        description: cols.description, page_url: cols.page_url, priority: cols.priority,
        status: cols.status, admin_note: null, created_at: tick(), updated_at: null };
      row.updated_at = row.created_at;
      db.changes.push(row);
      return { rows: projectRows(s, [row]) };
    }
    if (s.indexOf("FROM order_updates") >= 0) {
      db.lastUpdatesSql = s;
      let list = db.updates.filter(function (u) { return String(u.order_id) === String(p[0]); });
      if (/\bvisible\s*=\s*true\b/i.test(s)) list = list.filter(function (u) { return u.visible === true; });
      return { rows: projectRows(s, orderList(list, s)) };
    }
    if (s.indexOf("FROM change_requests") >= 0) {
      db.lastChangesSql = s;
      const list = db.changes.filter(function (c) { return String(c.order_id) === String(p[0]); });
      return { rows: projectRows(s, orderList(list, s)) };
    }
    // 详情里的流水：只在主查询不是 site_orders 时命中（ADMIN_SELECT 的 tokens 子查询也含 FROM token_ledger）
    if (s.indexOf("FROM token_ledger") >= 0 && s.indexOf("site_orders") < 0) {
      db.lastLedgerSql = s;
      const list = db.ledger.filter(function (l) { return String(l.order_id) === String(p[0]); });
      return { rows: projectRows(s, orderList(list, s)) };
    }

    // ===== 后台写入 =====
    if (s.indexOf("INSERT INTO site_order_events") === 0) {
      const ev = { id: db.seq.event++, order_id: Number(p[0]), type: p[1], note: p[2], actor: p[3],
        created_at: tick() };
      db.events.push(ev);
      return { rows: [] };
    }
    if (s.indexOf("SELECT id, status, payment_status FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = findOrder(p[0]);
      return { rows: row ? [{ id: row.id, status: row.status,
        payment_status: row.payment_status === undefined ? "unpaid" : row.payment_status }] : [] };
    }
    if (s.indexOf("SELECT id, phase, progress, launched_at FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = findOrder(p[0]);
      return { rows: row ? [{ id: row.id,
        phase: row.phase === undefined ? "brief" : row.phase,
        progress: row.progress === undefined ? 0 : row.progress,
        launched_at: row.launched_at === undefined ? null : row.launched_at }] : [] };
    }
    if (s.indexOf("UPDATE site_orders SET payment_status") === 0) {
      db.lastPaymentSql = s;
      const row = findOrder(whereId(1));
      if (row) {
        const setClause = (/SET\s+([\s\S]+?)\s+WHERE/i.exec(s) || [])[1] || "";
        row.payment_status = ph(/payment_status\s*=\s*\$(\d+)/i, 0);
        if (/paid_at\s*=\s*now\(\)/i.test(setClause)) row.paid_at = tick();
        if (/paid_at\s*=\s*NULL/i.test(setClause)) row.paid_at = null;
        if (/status\s*=\s*'paid'/i.test(setClause)) row.status = "paid"; // 只有 SQL 真写了才改
        row.updated_at = tick();
      }
      return { rows: [] };
    }
    if (s.indexOf("UPDATE site_orders SET phase") === 0) {
      db.lastProgressSql = s;
      const row = findOrder(whereId(2));
      if (row) {
        row.phase = ph(/phase\s*=\s*\$(\d+)/i, 0);
        row.progress = ph(/progress\s*=\s*\$(\d+)/i, 1);
        row.updated_at = tick();
      }
      return { rows: [] };
    }
    if (s.indexOf("INSERT INTO order_updates") === 0) {
      db.lastOrderUpdateSql = s;
      const cols = insertValues(); // 列名 → 参数：列顺序写反就会把 note 写进 progress
      const row = { id: db.seq.update++, order_id: Number(cols.order_id), phase: cols.phase,
        progress: cols.progress, note: cols.note, visible: cols.visible, actor: cols.actor,
        created_at: tick() };
      db.updates.push(row);
      return { rows: projectRows(s, [row]) };
    }
    if (s.indexOf("UPDATE site_orders SET launched_at = COALESCE(launched_at, now())") === 0) {
      const row = findOrder(p[0]);
      if (row && row.launched_at == null) row.launched_at = tick();
      return { rows: [] };
    }
    if (s === "SELECT id FROM site_orders WHERE id = $1") {
      const row = findOrder(p[0]);
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (s.indexOf("SELECT brief_json FROM site_orders WHERE id = $1") === 0) {
      const row = findOrder(p[0]);
      return { rows: row ? [{ brief_json: row.brief_json === undefined ? {} : row.brief_json }] : [] };
    }
    if (s.indexOf("UPDATE change_requests") === 0) {
      db.lastChangeSql = s;
      const row = db.changes.find(function (c) { return String(c.id) === String(whereId(3)); });
      if (!row) return { rows: [] };
      const coalesce = /COALESCE\(\$(\d+), status\)/i.exec(s);
      const caseM = /CASE WHEN \$(\d+) THEN \$(\d+) ELSE admin_note END/i.exec(s);
      const bare = caseM ? null : /admin_note\s*=\s*\$(\d+)/i.exec(s);
      const bareStatus = coalesce ? null : /status\s*=\s*\$(\d+)/i.exec(s);
      if (coalesce) { const v = p[Number(coalesce[1]) - 1]; if (v != null) row.status = v; }
      else if (bareStatus) row.status = p[Number(bareStatus[1]) - 1]; // 无 COALESCE 时照 SQL 写（可能写 null）
      if (caseM) { if (p[Number(caseM[1]) - 1]) row.admin_note = p[Number(caseM[2]) - 1]; }
      else if (bare) row.admin_note = p[Number(bare[1]) - 1];
      row.updated_at = tick();
      return { rows: projectRows(s, [row]) };
    }

    // ===== 后台读 =====
    if (s.indexOf("FROM site_orders o") >= 0 && s.indexOf("WHERE o.id = $1") >= 0) {
      db.lastAdminSql = s;
      const row = findOrder(p[0]);
      return { rows: row ? [projectSiteOrder(s, row)] : [] };
    }
    if (s.indexOf("FROM site_orders o") >= 0) {
      let list = db.orders.slice();
      const statusPos = s.match(/o\.status = \$(\d+)/);
      if (statusPos) {
        const want = p[Number(statusPos[1]) - 1];
        list = list.filter(function (o) { return o.status === want; });
      }
      return { rows: orderList(list, s).map(function (o) { return projectSiteOrder(s, o); }) };
    }

    throw new Error("fake pool: unhandled SQL: " + s.slice(0, 140));
  }

  return {
    _db: db,
    query: query,
    async connect() { return { query: query, release: function () {} }; }
  };
}

// ---------- 假数据 ----------
function seed(db) {
  const t = function (n) { return new Date(Date.parse("2026-11-01T00:00:00.000Z") + n * 60000).toISOString(); };
  db.users.push(
    { id: 1, email: "a@example.com", name: "Alice", phone: "+60 12-345 6789", created_at: t(1), last_login_at: null },
    { id: 2, email: "b@example.com", name: null, phone: null, created_at: t(2), last_login_at: null },
    { id: 3, email: "empty@example.com", name: "Empty", phone: null, created_at: t(3), last_login_at: null }
  );
  db.seq.user = 4;
  const base = {
    name: "Buyer", phone: "0123456789", company: null, ren_no: null, area: null, domain: null,
    notes: null, package_code: "dedicated", contract_accepted: true, status: "new"
  };
  db.orders.push(
    Object.assign({}, base, { id: 101, order_no: "ORD-261117-AAAA", email: "a@example.com",
      client_user_id: 1, phase: "build", progress: 40, payment_status: "unpaid", paid_at: null,
      launched_at: null, monthly_price: 1500, setup_price: 2500, brief_json: { goal: "卖房" },
      created_at: t(10), updated_at: t(10) }),
    Object.assign({}, base, { id: 102, order_no: "ORD-261117-BBBB", email: "a@example.com",
      client_user_id: 1, phase: "live", progress: 100, payment_status: "paid",
      paid_at: t(11), launched_at: t(11), monthly_price: 1500, setup_price: 2500, brief_json: {},
      status: "live", created_at: t(20), updated_at: t(20) }),
    Object.assign({}, base, { id: 103, order_no: "ORD-261117-CCCC", email: "b@example.com",
      client_user_id: 2, phase: "design", progress: 10, payment_status: "unpaid", paid_at: null,
      launched_at: null, monthly_price: 1500, setup_price: 2500, brief_json: { goal: "B 的私密目标" },
      created_at: t(30), updated_at: t(30) }),
    Object.assign({}, base, { id: 104, order_no: "ORD-261117-DDDD", email: "unbound@example.com",
      client_user_id: null, phase: "brief", progress: 0, payment_status: "unpaid", paid_at: null,
      launched_at: null, monthly_price: 1500, setup_price: 2500, brief_json: {},
      created_at: t(40), updated_at: t(40) })
  );
  db.seq.order = 200;
  db.ledger.push(
    { id: 1, order_id: 101, kind: "topup", amount: 100, note: "首充", created_at: t(50) },
    { id: 2, order_id: 101, kind: "usage", amount: 30.5, note: "耗用", created_at: t(51) },
    { id: 3, order_id: 101, kind: "adjust", amount: -10, note: "调整", created_at: t(52) }
  );
  db.updates.push(
    { id: 11, order_id: 101, phase: "design", progress: 20, note: "设计稿", visible: true,
      actor: "owner@example.com", created_at: t(60) },
    { id: 12, order_id: 101, phase: "build", progress: 35, note: "内部备注", visible: false,
      actor: "owner@example.com", created_at: t(61) },
    { id: 13, order_id: 101, phase: "build", progress: 40, note: "开工", visible: true,
      actor: "owner@example.com", created_at: t(62) }
  );
  db.seq.update = 14;
  db.changes.push(
    { id: 21, order_id: 101, title: "换 banner", description: "首页 banner 换图", page_url: "https://a.example.com/",
      priority: "high", status: "open", admin_note: null, created_at: t(70), updated_at: t(70) },
    { id: 22, order_id: 101, title: "改电话", description: "页脚电话改号", page_url: null,
      priority: "normal", status: "in_progress", admin_note: "已排期", created_at: t(71), updated_at: t(71) },
    { id: 23, order_id: 101, title: "改页脚", description: "页脚版权年份", page_url: null,
      priority: "low", status: "open", admin_note: "保留我", created_at: t(72), updated_at: t(72) }
  );
  db.seq.change = 30;
  db.seq.event = 1;
}

// ---------- HTTP 工具 ----------
async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    return await fn(base);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function request(base, method, url, body, headers) {
  const res = await fetch(base + url, {
    method: method,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(function () { return {}; });
  return {
    status: res.status,
    body: json,
    cache: res.headers.get("cache-control"),
    setCookie: res.headers.get("set-cookie")
  };
}

// ---------- 客户页静态检查（§7.1-8） ----------
// 前端并行交付：文件不存在时显式 SKIP，交付后本段自动启用（对缺 key/缺轮询等硬失败）。
function clientPageChecks() {
  const file = path.join("web", "client", "index.html");
  if (!fs.existsSync(file)) {
    console.log("… SKIP 客户页静态检查（web/client/index.html 未交付；交付后自动启用）");
    return;
  }
  const html = fs.readFileSync(file, "utf8");
  const label = "客户页：";
  const langBtns = (html.match(/data-lang="(zh|en|bm)"/g) || []);
  eq(langBtns.length, 3, label + "三个 data-lang 按钮");

  // 解析 I18N 字典
  let dict = null;
  const marker = "var I18N = {";
  const start = html.indexOf(marker);
  if (start >= 0) {
    const from = start + marker.length - 1;
    let depth = 0, quote = null, esc = false;
    for (let i = from; i < html.length; i++) {
      const c = html[i];
      if (quote) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { dict = Function('"use strict";return (' + html.slice(from, i + 1) + ")")(); break; }
      }
    }
  }
  ok(!!dict, label + "可解析 I18N 字典");
  if (!dict) return;
  const keys = Object.keys(dict);
  ok(keys.length >= 45, label + "I18N key ≥ 45（实际 " + keys.length + "）");

  const required = ["login_invalid", "link_sent", "login_email_err", "login_rate", "login_network",
    "dash_title", "logout", "no_orders", "updated", "brief_title", "brief_empty", "updates_title",
    "updates_empty", "ledger_title", "ledger_empty", "changes_title", "changes_empty",
    "err_title", "err_desc", "err_url", "err_rate", "loading",
    "phase_brief", "phase_design", "phase_build", "phase_review", "phase_launch", "phase_live",
    "payment_unpaid", "payment_paid", "payment_refunded",
    "status_open", "status_in_progress", "status_done", "status_cancelled",
    "priority_low", "priority_normal", "priority_high",
    "label_goal", "label_pages", "label_listing_count", "label_listing_source", "label_domain",
    "label_logo_url", "label_brand_color", "label_reference_url", "label_asset_links",
    "label_target_launch", "label_notes"];
  const badKeys = required.filter(function (k) {
    const v = dict[k];
    return !Array.isArray(v) || v.length !== 3 ||
      v.some(function (x) { return typeof x !== "string" || !x.trim(); });
  });
  eq(badKeys, [], label + "必含 key 全部非空三语（" + required.length + " 个）");
  const cjk = [];
  keys.forEach(function (k) {
    const v = dict[k];
    if (!Array.isArray(v)) return;
    if (/[\u4e00-\u9fff]/.test(String(v[1] || ""))) cjk.push(k + ":en");
    if (/[\u4e00-\u9fff]/.test(String(v[2] || ""))) cjk.push(k + ":bm");
  });
  eq(cjk, [], label + "EN/BM 无中文残留");

  const used = new Set();
  let m;
  const re = /data-i18n(?:-ph)?="([^"]+)"/g;
  while ((m = re.exec(html))) used.add(m[1]);
  eq(Array.from(used).filter(function (k) { return !dict[k]; }), [], label + "引用的 key 都在字典里");

  ["/api/client/request-link", "/api/client/verify", "/api/client/me", "/api/client/orders/",
    "/api/client/logout"].forEach(function (p) {
    ok(html.indexOf(p) >= 0, label + "调用 " + p);
  });
  ok(html.indexOf("30000") >= 0 && html.indexOf("setInterval(") >= 0, label + "30 秒轮询（30000 + setInterval）");
  ok(html.indexOf("@media (max-width: 430px)") >= 0, label + "断点 @media (max-width: 430px)");
  ok(html.indexOf('href="/order/"') >= 0, label + "有回下单页链接 /order/");
  ok(html.indexOf("/icon-256.png?v=client1") >= 0, label + "icon 带版本号 ?v=client1");
  ok(html.indexOf('type="file"') < 0, label + "不含文件直传 input");
}

// ---------- 主流程 ----------
async function main() {
  const pool = makePool();
  const db = pool._db;
  seed(db);

  const mails = [];
  const mailState = { fail: false };
  const rateCalls = [];
  async function sendMail(to, subject, text) {
    if (mailState.fail) throw new Error("smtp down");
    mails.push({ to: to, subject: subject, text: text });
    return "sent";
  }
  function rateLimit(max, windowMs) {
    rateCalls.push([max, windowMs]);
    return function (req, res, next) { next(); };
  }
  function requireAdmin(req, res, next) {
    const c = String(req.headers.cookie || "");
    if (c.indexOf("fc_admin=") < 0) return res.status(401).json({ ok: false, error: "admin_required" });
    req.admin = { email: "owner@example.com", role: c.indexOf("fc_admin=viewer") >= 0 ? "viewer" : "owner" };
    next();
  }
  function requireWrite(req, res, next) {
    if (!req.admin) return res.status(401).json({ ok: false, error: "admin_required" });
    if (req.admin.role === "viewer") return res.status(403).json({ ok: false, error: "read_only" });
    next();
  }

  if (!express || !createClientApi || !createOrderApi) {
    console.log("… SKIP HTTP 客户门户测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    console.log("\n== 客户页静态检查 ==");
    clientPageChecks();
    console.log("\nCLIENT " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
    process.exit(fail ? 1 : 0);
  }

  const app = express();
  app.use(express.json());
  app.use("/api/client", createClientApi({
    pool: pool, sendMail: sendMail, rateLimit: rateLimit, siteUrl: SITE_URL
  }));
  app.use("/api", createOrderApi({
    pool: pool, requireAdmin: requireAdmin, requireWrite: requireWrite, rateLimit: rateLimit
  }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const adminCookie = { Cookie: "fc_admin=test-token" };
  const viewerCookie = { Cookie: "fc_admin=viewer" };
  const NO_STORE = "no-store";

  await withServer(app, async function (base) {
    function call(method, url, body, headers) { return request(base, method, url, body, headers); }

    // ================= 1) request-link =================
    console.log("== request-link ==");
    let r = await call("POST", "/api/client/request-link", { email: "nobody@example.com" });
    eq([r.status, JSON.stringify(r.body)], [200, '{"ok":true}'], "未知邮箱 → 200 {ok:true}");
    eq(r.cache, NO_STORE, "request-link 200 带 Cache-Control: no-store");
    eq(db.users.filter(function (u) { return u.email === "nobody@example.com"; }).length, 1, "创建 1 个 client_user");
    eq(db.users[db.users.length - 1].email, "nobody@example.com", "email 小写入库");

    r = await call("POST", "/api/client/request-link", { email: " NOBODY@Example.COM " });
    eq([r.status, JSON.stringify(r.body)], [200, '{"ok":true}'], "已存在邮箱 → 响应体与状态码完全一致（无枚举）");
    eq(db.users.filter(function (u) { return u.email === "nobody@example.com"; }).length, 1, "二次请求复用同一 user");
    const nobodyId = db.users.find(function (u) { return u.email === "nobody@example.com"; }).id;
    eq(db.links.filter(function (l) { return l.client_user_id === nobodyId; }).length, 2,
      "旧 magic link 不失效（两张 link 各自一次性）");

    r = await call("POST", "/api/client/request-link", { email: "not-an-email" });
    eq([r.status, r.body.error, r.cache], [400, "invalid_email", NO_STORE], "非法邮箱 → 400 invalid_email + no-store");
    r = await call("POST", "/api/client/request-link", {});
    eq([r.status, r.body.error], [400, "invalid_email"], "缺 email → 400 invalid_email");

    const mail1 = mails[mails.length - 2]; // 第一次 nobody 的邮件
    ok(/登录/.test(mail1.subject) && /sign in/i.test(mail1.subject),
      "邮件主题同时含「登录」与「sign in」", mail1.subject);
    ok(mail1.text.indexOf(SITE_URL + "/client/?token=") >= 0, "邮件正文含完整 ${siteUrl}/client/?token=");
    ok(mail1.text.indexOf("20 分钟") >= 0 && mail1.text.indexOf("20 minutes") >= 0,
      "邮件正文含「20 分钟 / 20 minutes」");
    eq(mail1.to, "nobody@example.com", "收件人是归一化邮箱");
    const raw1 = tokenFromMail(mail1);
    ok(/^[a-f0-9]{64}$/.test(raw1), "raw token 是 64 位小写 hex");
    const link1 = db.links.filter(function (l) { return l.token_hash === sha256(raw1); })[0];
    ok(!!link1, "DB 里能用 sha256(raw) 找到该 link");
    ok(db.links.every(function (l) { return l.token_hash !== raw1; }), "DB 不存 raw token");
    ok(link1 && Math.round((link1.expires_at - Date.now()) / 60000) === 20, "magic link 有效期 = 20 分钟");

    // 历史订单绑定（大小写不同 / 已被别人绑定的不抢）
    const otherBound = { id: 106, order_no: "ORD-261117-FFFF", email: "buyer@example.com",
      client_user_id: 2, phase: "brief", progress: 0, payment_status: "unpaid", paid_at: null,
      launched_at: null, monthly_price: 1500, setup_price: 2500, brief_json: {}, status: "new",
      created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z" };
    db.orders.push({ id: 105, order_no: "ORD-261117-EEEE", email: "Buyer@Example.COM",
      client_user_id: null, phase: "brief", progress: 0, payment_status: "unpaid", paid_at: null,
      launched_at: null, monthly_price: 1500, setup_price: 2500, brief_json: {}, status: "new",
      created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z" }, otherBound);
    const bindBefore = db.orders.find(function (o) { return o.id === 105; });
    r = await call("POST", "/api/client/request-link", { email: "buyer@example.com" });
    const buyer = db.users.find(function (u) { return u.email === "buyer@example.com"; });
    eq([r.status, !!buyer], [200, true], "新邮箱 buyer@ 建号 → 200");
    eq(db.orders.find(function (o) { return o.id === 105; }).client_user_id, buyer.id,
      "下单邮箱大小写不同也能绑定历史订单");
    eq(db.orders.find(function (o) { return o.id === 105; }).updated_at, bindBefore.updated_at,
      "绑定不改 updated_at（绑定不是订单内容变更）");
    eq(db.orders.find(function (o) { return o.id === 106; }).client_user_id, 2,
      "已绑定别的 user 的订单不被抢");

    // 邮件失败仍 200，且 user/link 已落库
    mailState.fail = true;
    r = await call("POST", "/api/client/request-link", { email: "boom@example.com" });
    eq(r.status, 200, "sendMail 抛错仍 200（不发信也不暴露账号存在性）");
    const boom = db.users.find(function (u) { return u.email === "boom@example.com"; });
    ok(!!boom, "邮件失败时 user 仍已落库");
    ok(boom && db.links.some(function (l) { return l.client_user_id === boom.id; }), "邮件失败时 link 仍已落库");
    mailState.fail = false;

    ok(rateCalls.some(function (c) { return c[0] === 5 && c[1] === 600000; }),
      "request-link 注入 rateLimit(5, 600000)", rateCalls);
    // SQL 形状（A2 冻结）：单一表达式括号，且不是双括号
    ok(/ON CONFLICT \(lower\(email\)\) DO NOTHING/i.test(db.lastUpsertSql) &&
      db.lastUpsertSql.indexOf("((lower(email)))") < 0,
      "用户 upsert 的冲突目标是单一表达式 lower(email)（无双重括号）", db.lastUpsertSql);
    ok(/RETURNING id, email, name, phone/i.test(db.lastUpsertSql),
      "upsert 冲突后仍 RETURNING id,email,name,phone");

    // ================= 2) verify =================
    console.log("\n== verify ==");
    r = await call("POST", "/api/client/verify", {});
    eq([r.status, r.body.error, r.cache], [400, "invalid_token", NO_STORE], "缺 token → 400 invalid_token");
    r = await call("POST", "/api/client/verify", { token: "zzz" });
    eq([r.status, r.body.error], [400, "invalid_token"], "非 64 hex → 400");
    r = await call("POST", "/api/client/verify", { token: "a".repeat(63) });
    eq([r.status, r.body.error], [400, "invalid_token"], "63 hex → 400");
    r = await call("POST", "/api/client/verify", { token: "a".repeat(64) });
    eq([r.status, r.body.error], [401, "invalid_token"], "未知 64 hex → 401");
    r = await call("POST", "/api/client/verify", { token: 12345 });
    eq([r.status, r.body.error], [400, "invalid_token"], "非 string token → 400");

    // 过期 link：直接改内存 expires_at，不推进真实时钟
    const rawExpired = tokenFromMail(mails[mails.length - 2]);
    const expiredLink = db.links.filter(function (l) { return l.token_hash === sha256(rawExpired); })[0];
    expiredLink.expires_at = Date.now() - 1000;
    r = await call("POST", "/api/client/verify", { token: rawExpired });
    eq([r.status, r.body.error], [401, "invalid_token"], "过期 link → 401");

    // 正常兑换（用 nobody 的第一张 link）
    const linkRow = db.links.filter(function (l) { return l.token_hash === sha256(raw1); })[0];
    r = await call("POST", "/api/client/verify", { token: raw1 });
    eq([r.status, r.body.ok, r.body.client.email], [200, true, "nobody@example.com"], "有效 token → 200 + client");
    eq(Object.keys(r.body.client).sort(), ["email", "id", "name", "phone"], "verify client 恰好 4 键");
    eq(r.body.client.name, null, "client.name 为 null 时原样 null（不兜底空串）");
    eq(r.body.client.phone, null, "client.phone 为 null 时原样 null");
    const setCookie = String(r.setCookie || "");
    ok(/^fc_client=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/.test(setCookie),
      "verify Set-Cookie 五 flags 逐字正确", setCookie);
    const rawSession = setCookie.split(";")[0].split("=")[1];
    const sessionRow = db.sessions.filter(function (x) { return x.token_hash === sha256(rawSession); })[0];
    ok(!!sessionRow, "session 只存 sha256(raw cookie)");
    ok(db.sessions.every(function (x) { return x.token_hash !== rawSession; }), "DB 不存 raw session token");
    ok(sessionRow && Math.round((sessionRow.expires_at - Date.now()) / 86400000) === 30, "session 有效期 = 30 天");
    ok(linkRow.used_at != null, "verify 后 link.used_at 非空");
    const nobody = db.users.find(function (u) { return u.id === nobodyId; });
    ok(nobody.last_login_at != null, "verify 后 user.last_login_at 非空");

    r = await call("POST", "/api/client/verify", { token: raw1 });
    eq([r.status, r.body.error], [401, "invalid_token"], "同一 token 重放 → 401（一次性）");
    eq(db.sessions.length, 1, "重放不再建会话");

    // ================= 3) session / me =================
    console.log("\n== session / me ==");
    // 给 Alice 造一个真实会话（request-link → 邮件取 token → verify）
    await call("POST", "/api/client/request-link", { email: "a@example.com" });
    const aRaw = tokenFromMail(mails[mails.length - 1]);
    const aVerify = await call("POST", "/api/client/verify", { token: aRaw });
    eq(aVerify.status, 200, "Alice 通过 magic link 建会话");
    const aCookie = { Cookie: "fc_client=" + String(aVerify.setCookie).split(";")[0].split("=")[1] };

    r = await call("GET", "/api/client/me", undefined, aCookie);
    eq([r.status, r.body.ok, r.body.client.email], [200, true, "a@example.com"], "GET /me → 200 且回自己资料");
    ok(/FROM client_sessions s JOIN client_users u ON u\.id = s\.client_user_id/i.test(db.lastSessionLookupSql) &&
      /s\.expires_at > now\(\)/i.test(db.lastSessionLookupSql),
      "requireClient SQL = 会话 join 用户 + expires_at > now()", db.lastSessionLookupSql);
    eq(Object.keys(r.body.client).sort(), ["email", "id", "name", "phone"], "/me client 恰好 4 键");
    eq(r.body.orders.map(function (o) { return o.id; }), [102, 101], "/me 只回自己的单且 created_at DESC, id DESC");
    eq(r.body.orders.map(function (o) { return Object.keys(o).length; }), [10, 10], "订单行恰好 10 key");
    eq(Object.keys(r.body.orders[0]).sort(), ["created_at", "id", "monthly_price", "order_no", "payment_status",
      "phase", "progress", "setup_price", "tokens", "updated_at"], "订单行 key 白名单（无 phone/email/status）");
    const o101 = r.body.orders.filter(function (o) { return o.id === 101; })[0];
    eq(o101.tokens, 59.5, "tokens = topup + adjust - usage = 59.5（JSON number）");
    eq(typeof o101.tokens, "number", "tokens 是 number 不是字符串");
    eq([o101.monthly_price, o101.setup_price], [1500, 2500], "金额 ::float8 后是 number");
    eq(r.cache, NO_STORE, "/me 带 no-store");
    ok(/CASE WHEN l\.kind = 'usage' THEN -l\.amount ELSE l\.amount END/i.test(db.lastMeSql) &&
      /COALESCE\(\(SELECT SUM\(/i.test(db.lastMeSql) && /\)::float8 AS tokens/i.test(db.lastMeSql),
      "/me tokens = COALESCE(SUM(usage 取负))::float8（036 公式，SPEC §4.5）", db.lastMeSql);
    ok(/o\.monthly_price::float8 AS monthly_price/i.test(db.lastMeSql) &&
      /o\.setup_price::float8 AS setup_price/i.test(db.lastMeSql),
      "/me 金额走 ::float8 投影（JSON number）");

    r = await call("GET", "/api/client/me");
    eq([r.status, r.body.error, r.cache], [401, "auth_required", NO_STORE], "无 cookie → 401 + no-store");
    r = await call("GET", "/api/client/me", undefined, { Cookie: "fc_client=" + "f".repeat(64) });
    eq([r.status, r.body.error], [401, "auth_required"], "伪造 session → 401");
    r = await call("GET", "/api/client/me", undefined, { Cookie: "fc_client=%E0%A4%A" });
    eq([r.status, r.body.error], [401, "auth_required"], "坏 percent-encoding cookie → 401（不 500）");
    r = await call("GET", "/api/client/me", undefined,
      { Cookie: "fc_client=%E0%A4%A; fc_client=" + aCookie.Cookie.split("=")[1] });
    eq([r.status, r.body.ok], [200, true], "坏值只跳过该条，同名好 cookie 仍可用（坏值忽略）");
    const aSessionRow = db.sessions.filter(function (x) { return x.token_hash === sha256(aCookie.Cookie.split("=")[1]); })[0];
    aSessionRow.expires_at = Date.now() - 1000;
    r = await call("GET", "/api/client/me", undefined, aCookie);
    eq([r.status, r.body.error], [401, "auth_required"], "过期 session → 401");
    aSessionRow.expires_at = Date.now() + 86400000; // 复原，后续用例继续用

    // 空订单
    await call("POST", "/api/client/request-link", { email: "empty@example.com" });
    const eRaw = tokenFromMail(mails[mails.length - 1]);
    const eVerify = await call("POST", "/api/client/verify", { token: eRaw });
    const eCookie = { Cookie: "fc_client=" + String(eVerify.setCookie).split(";")[0].split("=")[1] };
    r = await call("GET", "/api/client/me", undefined, eCookie);
    eq([r.status, r.body.orders], [200, []], "无订单 → orders:[]");

    // ================= 4) IDOR / 订单详情 =================
    console.log("\n== IDOR / 订单详情 ==");
    r = await call("GET", "/api/client/orders/103", undefined, aCookie);
    const notFoundBody = JSON.stringify({ ok: false, error: "not_found" });
    eq([r.status, JSON.stringify(r.body), r.cache], [404, notFoundBody, NO_STORE],
      "A 请求 B 的订单 → 404，响应体与「真的不存在」一致");
    r = await call("GET", "/api/client/orders/99999", undefined, aCookie);
    eq([r.status, JSON.stringify(r.body)], [404, notFoundBody], "不存在的订单 → 同一个 404 体（不泄露存在性）");
    for (const bad of ["abc", "0", "-3", "1.5"]) {
      r = await call("GET", "/api/client/orders/" + encodeURIComponent(bad), undefined, aCookie);
      eq([r.status, r.body.error], [404, "not_found"], "非法 id " + bad + " → 404");
    }

    r = await call("GET", "/api/client/orders/101", undefined, aCookie);
    eq([r.status, r.body.ok], [200, true], "A 请求自己的订单 → 200");
    eq(Object.keys(r.body.order).sort(), ["brief_json", "created_at", "id", "launched_at", "monthly_price",
      "order_no", "payment_status", "phase", "progress", "setup_price", "tokens", "updated_at"],
      "order 恰好 12 key");
    eq(r.body.order.tokens, 59.5, "详情 tokens 公式一致");
    eq(r.body.order.brief_json, { goal: "卖房" }, "brief_json 原样返回对象");
    eq(r.body.updates.map(function (u) { return Object.keys(u).sort(); }),
      [["created_at", "id", "note", "phase", "progress"], ["created_at", "id", "note", "phase", "progress"]],
      "updates 每行恰好 5 key（无 actor/visible）");
    eq(r.body.updates.map(function (u) { return u.id; }), [13, 11],
      "updates 只回 visible=true，顺序 created_at DESC, id DESC");
    ok(r.body.updates.every(function (u) { return u.actor === undefined; }), "客户响应不暴露 actor");
    eq(r.body.changes.map(function (c) { return Object.keys(c).length; }),
      db.changes.filter(function (c) { return c.order_id === 101; }).map(function () { return 9; }),
      "changes 每行 9 key");
    eq(r.body.ledger.map(function (l) { return Object.keys(l).sort(); }),
      [["amount", "created_at", "id", "kind", "note"], ["amount", "created_at", "id", "kind", "note"],
        ["amount", "created_at", "id", "kind", "note"]], "ledger 每行 5 key");
    eq(r.body.ledger.map(function (l) { return l.amount; }), [-10, 30.5, 100], "ledger 按 created_at DESC 且 amount 为 number");
    ok(/amount::float8 AS amount/i.test(db.lastLedgerSql), "ledger amount 走 ::float8（JSON number 而非 numeric 字符串）");
    ok(/CASE WHEN l\.kind = 'usage' THEN -l\.amount ELSE l\.amount END/i.test(db.lastDetailSql) &&
      /COALESCE\(\(SELECT SUM\(/i.test(db.lastDetailSql) && /\)::float8 AS tokens/i.test(db.lastDetailSql) &&
      /o\.monthly_price::float8 AS monthly_price/i.test(db.lastDetailSql),
      "客户详情 tokens/金额 SQL 形状（036 公式 + ::float8）", db.lastDetailSql);
    ok(JSON.stringify(r.body).indexOf("B 的私密目标") < 0, "A 的详情不含 B 的 brief 数据");

    r = await call("GET", "/api/client/orders/104", undefined, aCookie);
    eq([r.status, r.body.error], [404, "not_found"], "未绑定客户的订单 → 404");

    // 客户端详情截断/排序（SPEC §4.6：updates LIMIT 50，changes/ledger LIMIT 100）
    db.orders.push({ id: 108, order_no: "ORD-261117-HHHH", email: "a@example.com", client_user_id: 1,
      phase: "build", progress: 50, payment_status: "unpaid", paid_at: null, launched_at: null,
      monthly_price: 1500, setup_price: 2500, brief_json: {}, status: "new",
      created_at: "2026-11-05T00:00:00.000Z", updated_at: "2026-11-05T00:00:00.000Z" });
    for (let i = 1; i <= 60; i++) {
      db.updates.push({ id: 3000 + i, order_id: 108, phase: "build", progress: i % 101, note: "U" + i,
        visible: true, actor: "owner@example.com",
        created_at: new Date(Date.UTC(2026, 10, 21, 0, 0, i)).toISOString() });
    }
    for (let i = 1; i <= 101; i++) {
      db.ledger.push({ id: 4000 + i, order_id: 108, kind: "topup", amount: 1, note: "L" + i,
        created_at: new Date(Date.UTC(2026, 10, 23, 0, 0, i)).toISOString() });
    }
    for (let i = 1; i <= 3; i++) {
      const at = new Date(Date.UTC(2026, 10, 22, 0, 0, i)).toISOString();
      db.changes.push({ id: 3100 + i, order_id: 108, title: "C" + i, description: "d", page_url: null,
        priority: "normal", status: "open", admin_note: null, created_at: at, updated_at: at });
    }
    r = await call("GET", "/api/client/orders/108", undefined, aCookie);
    eq(r.body.updates.length, 50, "客户详情 updates 只回 50 条（LIMIT 50）");
    eq([r.body.updates[0].id, r.body.updates[49].id], [3060, 3011],
      "客户详情 updates 取最新 50 条（created_at DESC, id DESC）");
    eq(r.body.ledger.length, 100, "客户详情 ledger 只回 100 条（LIMIT 100）");
    eq([r.body.ledger[0].id, r.body.ledger[99].id], [4101, 4002],
      "客户详情 ledger 取最新 100 条（created_at DESC, id DESC）");
    eq(r.body.changes.map(function (c) { return c.id; }), [3103, 3102, 3101],
      "客户详情 changes 按 created_at DESC, id DESC");
    ok(/LIMIT 50/i.test(db.lastUpdatesSql) && /LIMIT 100/i.test(db.lastChangesSql) &&
      /LIMIT 100/i.test(db.lastLedgerSql), "客户详情三条读的 LIMIT = 50/100/100", db.lastUpdatesSql);

    // ================= 5) changes =================
    console.log("\n== changes ==");
    const good = { title: "换 banner", description: "首页 banner 换图", page_url: "https://example.com/x", priority: "high" };
    r = await call("POST", "/api/client/orders/101/changes", good);
    eq([r.status, r.body.error, r.cache], [401, "auth_required", NO_STORE], "未登录提交变更 → 401");

    // 归属检查早于 body 校验：用 B 的单 + 非法 body 必须 404 而不是 400
    r = await call("POST", "/api/client/orders/103/changes", { title: "" }, aCookie);
    eq([r.status, r.body.error], [404, "not_found"], "他人订单 404 优先于 body 校验（不能用 400/404 探测）");
    r = await call("POST", "/api/client/orders/99999/changes", good, aCookie);
    eq([r.status, r.body.error], [404, "not_found"], "不存在订单提交变更 → 404");

    const updCountBeforeChanges = db.updates.length;
    const evCountBeforeChanges = db.events.length;
    const badCases = [
      [{ description: "x" }, "title", "缺 title"],
      [{ title: "   ", description: "x" }, "title", "空 title"],
      [{ title: "x".repeat(121), description: "x" }, "title", "title > 120"],
      [{ title: "ok" }, "description", "缺 description"],
      [{ title: "ok", description: "  " }, "description", "空 description"],
      [{ title: "ok", description: "x".repeat(2001) }, "description", "description > 2000"],
      [{ title: "ok", description: "x", page_url: "ftp://example.com/a" }, "page_url", "page_url 非 http/https"],
      [{ title: "ok", description: "x", page_url: "javascript:alert(1)" }, "page_url", "page_url javascript:"],
      [{ title: "ok", description: "x", page_url: "https://u:p@example.com/" }, "page_url", "page_url 带 credentials"],
      [{ title: "ok", description: "x", page_url: "not a url" }, "page_url", "page_url 不可解析"],
      [{ title: "ok", description: "x", page_url: "https://e.com/" + "a".repeat(500) }, "page_url", "page_url > 500"],
      [{ title: "ok", description: "x", priority: "urgent" }, "priority", "priority 非法"]
    ];
    for (const [body, field, label] of badCases) {
      r = await call("POST", "/api/client/orders/101/changes", body, aCookie);
      eq([r.status, r.body.error, r.body.field], [400, "invalid_input", field], label + " → 400 field:" + field);
    }

    r = await call("POST", "/api/client/orders/101/changes",
      { title: " 改标题 ", description: "第一行\n第二行", priority: "", page_url: "   " }, aCookie);
    eq([r.status, r.body.ok], [201, true], "合法变更 → 201");
    eq(Object.keys(r.body.change).sort(), ["admin_note", "created_at", "description", "id", "page_url",
      "priority", "status", "title", "updated_at"], "change 恰好 9 key");
    eq([r.body.change.title, r.body.change.description], ["改标题", "第一行\n第二行"], "title trim、description 保留换行");
    eq([r.body.change.status, r.body.change.admin_note], ["open", null], "status=open / admin_note=null");
    eq([r.body.change.priority, r.body.change.page_url], ["normal", null], "priority:\"\" → normal；空 page_url → null");

    r = await call("POST", "/api/client/orders/101/changes",
      { title: "优先级大写", description: "desc", priority: "HIGH", evil: "ignored" }, aCookie);
    eq([r.status, r.body.change.priority], [201, "high"], "priority 归一化 + 未知字段忽略");

    ok(rateCalls.some(function (c) { return c[0] === 20 && c[1] === 3600000; }),
      "changes 注入 rateLimit(20, 3600000)", rateCalls);
    eq(db.updates.length, updCountBeforeChanges, "客户提交变更不写 order_updates");
    eq(db.events.length, evCountBeforeChanges, "客户提交变更不写 site_order_events");

    // ================= 6) logout =================
    console.log("\n== logout ==");
    const beforeLogout = db.sessions.length;
    r = await call("POST", "/api/client/logout", undefined, eCookie);
    eq([r.status, r.body.ok], [200, true], "带 session 退出 → 200");
    eq(String(r.setCookie || ""), "fc_client=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
      "清除 cookie 五 flags + Max-Age=0 逐字正确");
    eq(db.sessions.length, beforeLogout - 1, "logout 删除 session 行");
    eq(db.lastDeleteSql, "DELETE FROM client_sessions WHERE token_hash = $1",
      "logout 按 token_hash 删除（DB 里没有 raw token 可删）");
    eq(r.cache, NO_STORE, "logout 带 no-store");
    r = await call("POST", "/api/client/logout");
    eq([r.status, r.body.ok], [200, true], "无 cookie logout → 200");
    r = await call("POST", "/api/client/logout", undefined, eCookie);
    eq([r.status, r.body.ok], [200, true], "重复 logout → 200");
    db.failDeleteSessions = true;
    r = await call("POST", "/api/client/logout", undefined, aCookie);
    eq([r.status, r.body.ok], [200, true], "DELETE 失败仍 200（cookie 已清）");
    db.failDeleteSessions = false;

    // ================= 7) admin 扩展 =================
    console.log("\n== admin: payment / progress / detail / change ==");
    for (const [method, url, body] of [
      ["PATCH", "/api/admin/orders/101/payment", { payment_status: "paid" }],
      ["PATCH", "/api/admin/orders/101/progress", { phase: "build", progress: 50 }],
      ["GET", "/api/admin/orders/101/detail", undefined],
      ["PATCH", "/api/admin/changes/21", { status: "done" }]
    ]) {
      r = await call(method, url, body);
      eq([r.status, r.body.error], [401, "admin_required"], "未登录 " + method + " " + url + " → 401");
    }
    for (const [method, url, body] of [
      ["PATCH", "/api/admin/orders/101/payment", { payment_status: "paid" }],
      ["PATCH", "/api/admin/orders/101/progress", { phase: "build", progress: 50 }],
      ["PATCH", "/api/admin/changes/21", { status: "done" }]
    ]) {
      r = await call(method, url, body, viewerCookie);
      eq([r.status, r.body.error], [403, "read_only"], "viewer " + method + " " + url + " → 403");
    }
    r = await call("GET", "/api/admin/orders/101/detail", undefined, viewerCookie);
    eq([r.status, r.body.ok], [200, true], "viewer GET /detail → 200（只挂 requireAdmin）");

    // --- payment ---
    for (const body of [{}, { payment_status: 123 }, { payment_status: true }, { payment_status: "bogus" }]) {
      r = await call("PATCH", "/api/admin/orders/101/payment", body, adminCookie);
      eq([r.status, r.body.error], [400, "invalid_payment_status"],
        "payment 非法入参 " + JSON.stringify(body) + " → 400");
    }
    r = await call("PATCH", "/api/admin/orders/101/payment", { payment_status: "paid" }, adminCookie);
    eq([r.status, r.body.ok], [200, true], "payment paid → 200");
    eq([r.body.order.payment_status, r.body.order.status], ["paid", "paid"], "paid → payment_status=paid 且 status=paid");
    ok(r.body.order.paid_at != null, "paid → paid_at 写入");
    const payEv = db.events.filter(function (e) { return e.type === "payment"; })[0];
    eq([payEv.order_id, payEv.note, payEv.actor], [101, "payment: unpaid -> paid", "owner@example.com"],
      "payment 事件 note/actor 正确");
    r = await call("PATCH", "/api/admin/orders/101/payment", { payment_status: "refunded" }, adminCookie);
    eq([r.body.order.payment_status, r.body.order.paid_at, r.body.order.status], ["refunded", null, "paid"],
      "refunded → paid_at=NULL 且 status 不回退");
    r = await call("PATCH", "/api/admin/orders/101/payment", { payment_status: "unpaid" }, adminCookie);
    eq([r.body.order.payment_status, r.body.order.paid_at, r.body.order.status], ["unpaid", null, "paid"],
      "unpaid → paid_at=NULL 且 status 保持");
    r = await call("PATCH", "/api/admin/orders/9999/payment", { payment_status: "paid" }, adminCookie);
    eq([r.status, r.body.error], [404, "not_found"], "payment 未知订单 → 404");
    r = await call("PATCH", "/api/admin/orders/101/payment", { payment_status: "paid" }, adminCookie);
    ok(r.body.order.paid_at != null, "重复 PATCH paid 刷新 paid_at（合同字面）");

    // --- progress ---
    for (const body of [{}, { phase: "" }, { phase: "bogus" }, { phase: 123 }]) {
      r = await call("PATCH", "/api/admin/orders/101/progress", body, adminCookie);
      eq([r.status, r.body.error], [400, "invalid_phase"],
        "progress 非法 phase " + JSON.stringify(body) + " → 400 invalid_phase");
    }
    for (const progress of [undefined, "50", 50.5, -1, 101, true, null]) {
      r = await call("PATCH", "/api/admin/orders/101/progress", { phase: "build", progress: progress }, adminCookie);
      eq([r.status, r.body.error], [400, "invalid_progress"],
        "progress 非法值 " + JSON.stringify(progress) + " → 400 invalid_progress");
    }
    r = await call("PATCH", "/api/admin/orders/101/progress",
      { phase: "build", progress: 50, note: "x".repeat(501) }, adminCookie);
    eq([r.status, r.body.error], [400, "invalid_note"], "progress note > 500 → 400 invalid_note");
    r = await call("PATCH", "/api/admin/orders/9999/progress", { phase: "build", progress: 50 }, adminCookie);
    eq([r.status, r.body.error], [404, "not_found"], "progress 未知订单 → 404");

    const updBefore = db.updates.length;
    r = await call("PATCH", "/api/admin/orders/101/progress",
      { phase: "build", progress: 60, note: " 开工啦 " }, adminCookie);
    eq([r.status, r.body.ok], [200, true], "progress 成功 → 200");
    eq([r.body.order.phase, r.body.order.progress], ["build", 60], "progress 更新订单 phase/progress");
    eq(db.updates.length, updBefore + 1, "progress 写 order_updates");
    eq(r.body.update.note, "开工啦", "order_updates.note 走 cleanText + trim");
    eq([r.body.update.visible, r.body.update.actor], [true, "owner@example.com"],
      "order_updates visible=true / actor=admin");
    eq(db.lastProgressSql, "UPDATE site_orders SET phase=$1, progress=$2, updated_at=now() WHERE id=$3",
      "progress UPDATE 参数编号 = phase=$1, progress=$2, id=$3");
    ok(db.lastOrderUpdateSql.indexOf(
      "INSERT INTO order_updates(order_id,phase,progress,note,visible,actor) VALUES ($1,$2,$3,$4,true,$5)") === 0,
      "order_updates INSERT 列顺序与占位参数固定", db.lastOrderUpdateSql);
    const progEv = db.events.filter(function (e) { return e.type === "progress"; }).pop();
    eq([progEv.note, progEv.actor], ["progress: build/40 -> build/60 | 开工啦", "owner@example.com"],
      "progress 事件 note 模板 + actor");
    ok(db.orders.find(function (o) { return o.id === 101; }).launched_at == null,
      "phase≠live 不写 launched_at");

    r = await call("PATCH", "/api/admin/orders/101/progress", { phase: "live", progress: 100 }, adminCookie);
    const firstLive = db.orders.find(function (o) { return o.id === 101; }).launched_at;
    ok(firstLive != null, "首次 phase=live 写 launched_at");
    const liveEv = db.events.filter(function (e) { return e.type === "progress"; }).pop();
    eq(liveEv.note, "progress: build/60 -> live/100", "无 note 时事件 note = progress: old/new");
    r = await call("PATCH", "/api/admin/orders/101/progress", { phase: "live", progress: 100 }, adminCookie);
    eq(db.orders.find(function (o) { return o.id === 101; }).launched_at, firstLive,
      "二次 live 不覆盖 launched_at（COALESCE）");
    eq(db.events.filter(function (e) { return e.type === "progress"; }).pop().note,
      "progress: live/100 -> live/100", "重复 live 的事件 note 反映当前值");

    // --- detail ---
    r = await call("GET", "/api/admin/orders/101/detail", undefined, adminCookie);
    eq([r.status, r.body.ok], [200, true], "detail → 200");
    eq(Object.keys(r.body).sort(), ["brief_json", "changes", "ledger", "ok", "order", "updates"],
      "detail 响应恰好 6 键");
    const wantUpdKeys = ["actor", "created_at", "id", "note", "phase", "progress", "visible"];
    const updRows101 = db.updates.filter(function (u) { return u.order_id === 101; });
    eq(r.body.updates.map(function (u) { return Object.keys(u).sort(); }),
      updRows101.map(function () { return wantUpdKeys; }),
      "admin updates 每行 7 key（含 visible/actor），共 " + updRows101.length + " 行");
    ok(r.body.updates.some(function (u) { return u.visible === false; }), "visible=false 的更新后台仍返回");
    const chgRows101 = db.changes.filter(function (c) { return c.order_id === 101; });
    eq(r.body.changes.map(function (c) { return Object.keys(c).length; }),
      chgRows101.map(function () { return 9; }), "admin changes 9 key（" + chgRows101.length + " 行）");
    eq(r.body.ledger.map(function (l) { return Object.keys(l).length; }), [5, 5, 5], "admin ledger 5 key");
    eq(r.body.brief_json, { goal: "卖房" }, "detail brief_json 是对象");
    ok(/LIMIT 100/i.test(db.lastUpdatesSql) && /ORDER BY created_at DESC, id DESC/i.test(db.lastUpdatesSql),
      "admin updates SQL = ORDER BY created_at DESC, id DESC + LIMIT 100", db.lastUpdatesSql);
    ok(/LIMIT 100/i.test(db.lastChangesSql), "admin changes SQL LIMIT 100", db.lastChangesSql);
    ok(/LIMIT 100/i.test(db.lastLedgerSql), "admin ledger SQL LIMIT 100", db.lastLedgerSql);
    ok(r.body.order.phase !== undefined && r.body.order.payment_status !== undefined &&
      r.body.order.progress !== undefined, "detail order 带 phase/progress/payment_status");

    r = await call("GET", "/api/admin/orders/102/detail", undefined, adminCookie);
    eq([r.status, r.body.brief_json, r.body.updates, r.body.changes, r.body.ledger],
      [200, {}, [], [], []], "detail 无 brief 订单 → brief_json:{} 默认 + 三组 []");
    r = await call("GET", "/api/admin/orders/9999/detail", undefined, adminCookie);
    eq([r.status, r.body.error], [404, "not_found"], "detail 未知订单 → 404");
    r = await call("GET", "/api/admin/orders/abc/detail", undefined, adminCookie);
    eq([r.status, r.body.error], [404, "not_found"], "detail 非法 id → 404");
    r = await call("GET", "/api/admin/orders/103/detail", undefined, adminCookie);
    eq([r.status, r.body.updates, r.body.changes, r.body.ledger, r.body.brief_json],
      [200, [], [], [], { goal: "B 的私密目标" }], "detail 空列表为 []、brief_json 有值");

    // LIMIT 100 截断 + 排序
    db.orders.push({ id: 107, order_no: "ORD-261117-GGGG", email: "a@example.com", client_user_id: 1,
      phase: "build", progress: 5, payment_status: "unpaid", paid_at: null, launched_at: null,
      monthly_price: 1500, setup_price: 2500, brief_json: {}, status: "new",
      created_at: "2026-11-02T00:00:00.000Z", updated_at: "2026-11-02T00:00:00.000Z" });
    for (let i = 1; i <= 120; i++) {
      db.updates.push({ id: 1000 + i, order_id: 107, phase: "build", progress: i, note: "批量 " + i,
        visible: true, actor: "owner@example.com",
        created_at: new Date(Date.UTC(2026, 10, 20, 0, 0, i)).toISOString() });
    }
    r = await call("GET", "/api/admin/orders/107/detail", undefined, adminCookie);
    eq(r.body.updates.length, 100, "detail updates 120 条只回 100 条（LIMIT 100）");
    eq([r.body.updates[0].id, r.body.updates[99].id], [1120, 1021], "detail updates 取最新 100 条（created_at DESC）");

    // --- change PATCH ---
    r = await call("PATCH", "/api/admin/changes/21", {}, adminCookie);
    eq([r.status, r.body.error], [400, "empty_patch"], "change 空 patch → 400 empty_patch");
    r = await call("PATCH", "/api/admin/changes/21", { status: "bogus" }, adminCookie);
    eq([r.status, r.body.error], [400, "invalid_status"], "change 非法 status → 400 invalid_status");
    r = await call("PATCH", "/api/admin/changes/21", { admin_note: "x".repeat(1001) }, adminCookie);
    eq([r.status, r.body.error], [400, "invalid_note"], "change admin_note > 1000 → 400 invalid_note");
    r = await call("PATCH", "/api/admin/changes/9999", { status: "done" }, adminCookie);
    eq([r.status, r.body.error], [404, "not_found"], "change 未知 id → 404");

    const changeBefore = db.changes.find(function (c) { return c.id === 21; }).updated_at;
    const updateCount = db.updates.length;
    const eventCount = db.events.length;
    r = await call("PATCH", "/api/admin/changes/21", { status: "DONE", admin_note: " 已处理 " }, adminCookie);
    eq([r.status, r.body.ok], [200, true], "change 成功推进 → 200");
    eq(Object.keys(r.body.change).sort(), ["admin_note", "created_at", "description", "id", "page_url",
      "priority", "status", "title", "updated_at"], "change PATCH 返回 9 key");
    eq([r.body.change.status, r.body.change.admin_note], ["done", "已处理"], "status 归一化 + admin_note trim");
    ok(db.changes.find(function (c) { return c.id === 21; }).updated_at !== changeBefore,
      "change PATCH 刷新 updated_at");
    eq([db.updates.length, db.events.length], [updateCount, eventCount],
      "change PATCH 不写 order_updates / site_order_events");

    r = await call("PATCH", "/api/admin/changes/23", { status: "done" }, adminCookie);
    eq([r.status, r.body.change.status, r.body.change.admin_note], [200, "done", "保留我"],
      "status-only PATCH 保留已有 admin_note（CASE WHEN $2 语义）");
    ok(/CASE WHEN \$2 THEN \$3 ELSE admin_note END/i.test(db.lastChangeSql) &&
      /COALESCE\(\$1, status\)/i.test(db.lastChangeSql),
      "change PATCH SQL = COALESCE(status) + CASE WHEN $2（未提供字段保持原值）", db.lastChangeSql);
    ok(/payment_status=\$1, paid_at=now\(\), status='paid'/i.test(db.lastPaymentSql) ||
      /status='paid'/i.test(db.lastPaymentSql),
      "payment paid SQL 显式写 status='paid'", db.lastPaymentSql);
    r = await call("PATCH", "/api/admin/changes/22", { admin_note: "" }, adminCookie);
    eq([r.body.change.admin_note, r.body.change.status], [null, "in_progress"],
      "只传 admin_note 时 status 保持；空串 → null");

    // ================= 8) 横切：no-store + 恒 429 限流 =================
    console.log("\n== 横切：no-store / 限流 ==");
    const strictApp = express();
    strictApp.use(express.json());
    strictApp.use("/api/client", createClientApi({
      pool: pool, sendMail: sendMail, siteUrl: SITE_URL,
      rateLimit: function () {
        return function (req, res) { return res.status(429).json({ ok: false, error: "rate_limited" }); };
      }
    }));
    strictApp.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });
    await withServer(strictApp, async function (sbase) {
      let sr = await request(sbase, "POST", "/api/client/request-link", { email: "a@example.com" });
      eq([sr.status, JSON.stringify(sr.body), sr.cache], [429, '{"ok":false,"error":"rate_limited"}', NO_STORE],
        "request-link 恒 429 → 统一错误体 + no-store");
      sr = await request(sbase, "POST", "/api/client/orders/101/changes", good, aCookie);
      eq([sr.status, JSON.stringify(sr.body), sr.cache], [429, '{"ok":false,"error":"rate_limited"}', NO_STORE],
        "changes 恒 429 → 统一错误体 + no-store");
      sr = await request(sbase, "GET", "/api/client/me", undefined, aCookie);
      eq([sr.status, sr.cache], [200, NO_STORE], "限流器存在时 /me 仍正常且 no-store");
    });

    // detail 只挂 requireAdmin：requireWrite 恒 403、rateLimit 恒 429 下仍 200
    const strictAdmin = express();
    strictAdmin.use(express.json());
    strictAdmin.use("/api", createOrderApi({
      pool: pool,
      requireAdmin: requireAdmin,
      requireWrite: function (req, res) { return res.status(403).json({ ok: false, error: "read_only" }); },
      rateLimit: function () {
        return function (req, res) { return res.status(429).json({ ok: false, error: "rate_limited" }); };
      }
    }));
    strictAdmin.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });
    await withServer(strictAdmin, async function (sbase) {
      const sr = await request(sbase, "GET", "/api/admin/orders/101/detail", undefined, adminCookie);
      const wantCount = db.updates.filter(function (u) { return u.order_id === 101; }).length;
      eq([sr.status, sr.body.ok, sr.body.updates.length], [200, true, wantCount],
        "detail 只挂 requireAdmin（requireWrite 恒 403 / 限流恒 429 仍 200 且 " + wantCount + " 条 updates）");
    });
  });

  // ================= 9) 客户页静态检查 =================
  console.log("\n== 客户页静态检查 ==");
  clientPageChecks();

  console.log("\nCLIENT " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error("test-client crashed:", (e && e.stack) || e);
  process.exit(1);
});
