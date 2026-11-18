"use strict";
// test-orders.js — 建站接单回归（不需要真实 Postgres）
// 运行：node work/test-orders.js
// 纯逻辑（校验/单号/token/状态）+ 假 pool 的 HTTP 路由测试 + 页面三语静态检查。

const fs = require("node:fs");
const path = require("node:path");
const core = require("./order-core");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log("✓ " + label); }
  else { fail++; console.log("✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

// ---------- 公开下单校验 ----------
{
  const r = core.normalizeOrder({ phone: "0123456789", contract_accepted: true });
  eq(r.errors.name, "required", "缺 name → required");
}
{
  const r = core.normalizeOrder({ name: "Andy", contract_accepted: true });
  eq(r.errors.phone, "required", "缺 phone → required");
}
{
  const r = core.normalizeOrder({ name: "Andy", phone: "123", contract_accepted: true });
  eq(r.errors.phone, "invalid", "phone 数字太少 → invalid");
}
{
  const r = core.normalizeOrder({ name: "Andy", phone: "012-345 6789", email: "not-an-email", contract_accepted: true });
  eq(r.errors.email, "invalid", "email 格式错误 → invalid");
}
{
  const r = core.normalizeOrder({ name: "Andy", phone: "012-345 6789", contract_accepted: false });
  eq(r.errors.contract_accepted, "required", "未同意条款 → required");
}
{
  const r = core.normalizeOrder({ name: " Andy ", phone: " 012-345 6789 ", email: " A@B.COM ", contract_accepted: true });
  eq(r.errors, {}, "合法下单无错误");
  eq(r.values.name, "Andy", "name 去空格");
  eq(r.values.phone, "012-345 6789", "phone 去首尾空格");
  eq(r.values.email, "a@b.com", "email 小写");
  eq(r.values.contract_accepted, true, "contract_accepted 保留 true");
}
{
  const r = core.normalizeOrder({ name: "A", phone: "0123456789", domain: "https://MySite.COM/", contract_accepted: true });
  eq(r.values.domain, "mysite.com", "domain 去协议/斜杠并小写");
  const bad = core.normalizeOrder({ name: "A", phone: "0123456789", domain: "bad domain!", contract_accepted: true });
  eq(bad.errors.domain, "invalid", "domain 非法 → invalid");
}
{
  const r = core.normalizeOrder({ name: "x".repeat(81), phone: "0123456789", contract_accepted: true });
  eq(r.errors.name, "too_long", "name 超长 → too_long");
}

// ---------- 单号 ----------
eq(core.orderDateStamp(new Date("2026-11-17T12:00:00+08:00")), "261117", "单号日期按马来西亚时区");
eq(core.orderDateStamp(new Date("2026-11-16T16:30:00Z")), "261117", "UTC 16:30 已是大马次日");
eq(core.orderDateStamp(new Date("2026-11-16T15:30:00Z")), "261116", "UTC 15:30 仍是大马当日");
{
  const a = core.orderNoFromSeq(new Date("2026-11-17T12:00:00+08:00"), 0);
  const b = core.orderNoFromSeq(new Date("2026-11-17T12:00:00+08:00"), 1);
  eq(a, "ORD-261117-2222", "序号 0 → 2222");
  eq(b, "ORD-261117-2223", "序号 1 → 2223");
  ok(core.ORDER_NO_RE.test(a), "单号匹配 ORD-YYMMDD-XXXX", a);
}
{
  const seen = new Set();
  const day = new Date("2026-11-17T12:00:00+08:00");
  for (let i = 0; i < 2000; i++) seen.add(core.orderNoFromSeq(day, i));
  eq(seen.size, 2000, "2000 个序号无重复");
  ok(Array.from(seen).every(function (n) { return core.ORDER_NO_RE.test(n); }), "2000 个单号格式全部合法");
}
{
  let calls = 0;
  const no = core.randomOrderNo(new Date("2026-11-17T12:00:00+08:00"), function (max) { calls++; ok(max === 1048576, "randomInt 上界 = 32^4"); return 42; });
  eq(no, core.orderNoFromSeq(new Date("2026-11-17T12:00:00+08:00"), 42), "randomOrderNo 走同一生成路径");
  eq(calls, 1, "randomOrderNo 只取一次随机数");
}

// ---------- 状态白名单 ----------
core.STATUSES.forEach(function (s) { eq(core.validateStatus(s), s, "状态合法: " + s); });
eq(core.validateStatus("LIVE"), "live", "状态大写可归一");
eq(core.validateStatus("archived"), null, "未知状态 → null");
eq(core.validateStatus(""), null, "空状态 → null");

// ---------- token 记账 ----------
{
  const t = core.normalizeToken({ kind: "topup", amount: "1,500.50", note: "九月充值" });
  eq(t.errors, {}, "topup 合法");
  eq(t.values.amount, 1500.5, "topup 金额解析千分位");
}
{
  const u = core.normalizeToken({ kind: "usage", amount: 300 });
  eq(u.errors, {}, "usage 合法");
  const neg = core.normalizeToken({ kind: "usage", amount: -300 });
  eq(neg.errors.amount, "must_be_positive", "usage 负数 → must_be_positive");
  const zero = core.normalizeToken({ kind: "adjust", amount: 0 });
  eq(zero.errors.amount, "invalid", "adjust 0 → invalid");
  const adj = core.normalizeToken({ kind: "adjust", amount: -50.25 });
  eq(adj.errors, {}, "adjust 可为负");
  eq(adj.values.amount, -50.25, "adjust 保留负号");
  const badKind = core.normalizeToken({ kind: "refund", amount: 10 });
  eq(badKind.errors.kind, "invalid", "kind 非法 → invalid");
}
eq(core.balanceOf([]), 0, "空流水余额 0");
eq(core.balanceOf([
  { kind: "topup", amount: "100.00" },
  { kind: "usage", amount: "30.50" },
  { kind: "adjust", amount: "-10.00" }
]), 59.5, "余额 = topup - usage + adjust（numeric 字符串）");
eq(core.canUseTokens(50, 50), true, "余额刚好够用");
eq(core.canUseTokens(49.99, 50), false, "余额不足");

// ---------- 客户门户纯函数（037 / SPEC §3） ----------
eq(core.PHASES, ["brief", "design", "build", "review", "launch", "live"], "PHASES 六阶段白名单");
eq(core.PAYMENT_STATUSES, ["unpaid", "paid", "refunded"], "PAYMENT_STATUSES 三值");
eq(core.CHANGE_STATUSES, ["open", "in_progress", "done", "cancelled"], "CHANGE_STATUSES 四值");
eq(core.CHANGE_PRIORITIES, ["low", "normal", "high"], "CHANGE_PRIORITIES 三值");
eq(core.BRIEF_KEYS, ["goal", "pages", "listing_count", "listing_source", "domain", "logo_url",
  "brand_color", "reference_url", "asset_links", "target_launch", "notes"], "BRIEF_KEYS 11 个白名单字段（顺序固定）");
eq(core.BRIEF_MAX_TOTAL, 8000, "BRIEF_MAX_TOTAL = 8000");

eq(core.normalizeEmail("  A@B.COM "), "a@b.com", "normalizeEmail 去空格 + 小写");
eq(core.normalizeEmail(""), "", "normalizeEmail 空 → \"\"");
eq(core.normalizeEmail(null), "", "normalizeEmail null → \"\"");
eq(core.normalizeEmail("not-an-email"), "", "normalizeEmail 非法 → \"\"");
eq(core.normalizeEmail("a@b..com"), "", "normalizeEmail 连续点 → \"\"");
eq(core.normalizeEmail("x".repeat(115) + "@a.com"), "", "normalizeEmail > 120 → \"\"");

{
  const r = core.normalizeBrief(undefined);
  eq([r.ok, r.value, r.error], [true, {}, null], "normalizeBrief(undefined) → ok + 空对象");
  eq(core.normalizeBrief(null), { ok: false, value: null, error: "brief" },
    "normalizeBrief(null) → 失败（SPEC v1.1：brief:null 是 non-object，必须 400）");
  eq(core.normalizeBrief("x").ok, false, "normalizeBrief 字符串 → 失败");
  eq(core.normalizeBrief([]).ok, false, "normalizeBrief 数组 → 失败");
  eq(core.normalizeBrief({ goal: "x" }).value, { goal: "x" }, "normalizeBrief 单字段");
}
{
  const raw = {};
  for (let i = 1; i <= 13; i++) raw["k" + i] = "v";
  eq(core.normalizeBrief(raw).ok, false, "13 个 key（含未知）→ 失败");
  const raw12 = {};
  for (let i = 1; i <= 12; i++) raw12["k" + i] = "v";
  const r12 = core.normalizeBrief(raw12);
  eq([r12.ok, r12.value], [true, {}], "12 个未知 key → 通过但全部丢弃");
  eq(core.normalizeBrief({ goal: "a", unknown_key: "zzz" }).value, { goal: "a" }, "未知 key 丢弃且不影响已知 key");
}
{
  const r = core.normalizeBrief({
    notes: "n", goal: "g", pages: "p", listing_count: 0, plain: "x",
    listing_source: "s", domain: "d.com", logo_url: "https://a.com/l.png", brand_color: "#fff",
    reference_url: "http://b.com", asset_links: ["https://c.com/1"], target_launch: "2026-12-01"
  });
  eq(r.ok, true, "11 字段全量通过");
  eq(Object.keys(r.value), core.BRIEF_KEYS, "输出 key 顺序 = BRIEF_KEYS 固定顺序（JSON.stringify 稳定）");
  eq(r.value.listing_count, 0, "number 0 保留");
  eq(r.value.asset_links, "https://c.com/1", "数组 join 成单字符串");
}
eq(core.normalizeBrief({ goal: null, pages: undefined }).value, {}, "null/undefined 值视为未提供");
eq(core.normalizeBrief({ goal: null }).ok, true, "null 值不让整包失败");
eq(core.normalizeBrief({ goal: "  " }).value, {}, "空串等于未提供");
eq(core.normalizeBrief({ goal: [] }).value, {}, "空数组等于未提供");
eq(core.normalizeBrief({ goal: " a\u0000b " }).value, { goal: "ab" }, "字符串删除 NUL 后再 trim");
eq(core.normalizeBrief({ goal: true }).ok, false, "boolean 值 → 失败");
eq(core.normalizeBrief({ goal: { a: 1 } }).ok, false, "object 值 → 失败");
eq(core.normalizeBrief({ asset_links: [["x"]] }).ok, false, "嵌套数组 → 失败");
eq(core.normalizeBrief({ asset_links: ["https://a.com", 5] }).ok, false, "数组含非 string → 失败");
eq(core.normalizeBrief({ goal: NaN }).ok, false, "NaN → 失败");
eq(core.normalizeBrief({ goal: Infinity }).ok, false, "Infinity → 失败");
eq(core.normalizeBrief({ goal: "x".repeat(500) }).ok, true, "普通字段 500 边界通过");
eq(core.normalizeBrief({ goal: "x".repeat(501) }).ok, false, "普通字段 501 → 失败");
eq(core.normalizeBrief({ notes: "x".repeat(1000) }).ok, true, "notes 1000 边界通过");
eq(core.normalizeBrief({ notes: "x".repeat(1001) }).ok, false, "notes 1001 → 失败");
{
  const twelve = [];
  for (let i = 0; i < 12; i++) twelve.push("https://e.com/" + i);
  const r = core.normalizeBrief({ asset_links: twelve });
  eq([r.ok, r.value.asset_links.split(", ").length], [true, 10], "数组 > 10 项截前 10（不报错）");
  eq(core.normalizeBrief({ asset_links: ["https://a.com/" + "x".repeat(490)] }).ok, false,
    "数组任一元素 > 500 → 失败");
}
eq(core.normalizeBrief({ logo_url: "javascript:alert(1)" }).ok, false, "logo_url javascript: → 失败");
eq(core.normalizeBrief({ logo_url: "ftp://a.com/x.png" }).ok, false, "logo_url ftp: → 失败");
eq(core.normalizeBrief({ logo_url: "https://a.com/x.png" }).ok, true, "logo_url https 通过");
eq(core.normalizeBrief({ reference_url: "http://a.com" }).ok, true, "reference_url http 通过");
eq(core.normalizeBrief({ reference_url: "data:text/html,x" }).ok, false, "reference_url data: → 失败");
eq(core.normalizeBrief({ asset_links: ["https://a.com", "javascript:alert(1)"] }).ok, false,
  "asset_links 数组元素非 http/https → 失败");
eq(core.normalizeBrief({ asset_links: "javascript:alert(1)" }).ok, false,
  "asset_links 字符串形式非 http/https → 失败");
eq(core.normalizeBrief({ asset_links: "https://a.com/x" }).ok, true, "asset_links 字符串形式 http 通过");
{
  const big = {
    goal: "g".repeat(500), pages: "p".repeat(500), listing_source: "s".repeat(500),
    domain: "d".repeat(500), logo_url: "https://e.com/" + "l".repeat(486),
    brand_color: "b".repeat(500), reference_url: "https://e.com/" + "r".repeat(486),
    target_launch: "t".repeat(500), notes: "n".repeat(1000),
    asset_links: (function () {
      const arr = [];
      for (let i = 0; i < 10; i++) arr.push("https://e.com/" + "a".repeat(486));
      return arr;
    })()
  };
  ok(JSON.stringify(core.normalizeBrief(big).value || {}).length <= 8000 ||
    core.normalizeBrief(big).ok === false, "总 JSON > 8000 → 失败（不静默截断）");
  eq(core.normalizeBrief(big).ok, false, "10×500 + notes1000 超 8000 → 整包失败");
}

// ---------- 假 pool（够跑通 order-api 的 SQL 形状） ----------
function makeFakePool() {
  const db = { orders: [], events: [], ledger: [], seq: 1, aborted: false,
    forceCollisionOnce: false, savepointRollbacks: 0,
    lastPaymentSql: "", lastProgressSql: "", lastOrderUpdateSql: "", lastChangeSql: "",
    // 客户门户（037）新增：账号 / 客户可见进度 / 变更请求，以及确定性时钟
    clientUsers: [], updates: [], changes: [],
    userSeq: 1, updateSeq: 1, changeSeq: 1,
    clock: Date.parse("2026-11-17T00:00:00.000Z") };
  function tick() { db.clock += 1000; return new Date(db.clock).toISOString(); }
  function adminRow(o) {
    let bal = 0;
    db.ledger.filter(function (l) { return l.order_id === o.id; }).forEach(function (l) {
      bal += l.kind === "usage" ? -Number(l.amount) : Number(l.amount);
    });
    return {
      id: o.id, order_no: o.order_no, name: o.name, phone: o.phone, email: o.email,
      company: o.company, ren_no: o.ren_no, area: o.area, domain: o.domain, notes: o.notes,
      package_code: o.package_code, monthly_price: Number(o.monthly_price), setup_price: Number(o.setup_price),
      status: o.status, contract_accepted: o.contract_accepted,
      // 纯新增四列：旧订单（手工 push 的 {}）缺字段时给默认值
      phase: o.phase === undefined ? "brief" : o.phase,
      progress: o.progress === undefined ? 0 : o.progress,
      payment_status: o.payment_status === undefined ? "unpaid" : o.payment_status,
      paid_at: o.paid_at === undefined ? null : o.paid_at,
      created_at: o.created_at, updated_at: o.updated_at,
      tokens: Math.round(bal * 100) / 100
    };
  }
  // SELECT 列表按括号深度切分（order 详情里有 COALESCE(SUM(...)) 子查询）
  function splitTopLevel(text) {
    const out = [];
    let depth = 0, cur = "";
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
  // 按实现真实 SELECT 的列投影客户订单行：实现漏选/多选列时键数与顺序都会变，断言才不假绿
  function siteOrderValue(o, name) {
    if (name === "tokens") {
      let bal = 0;
      db.ledger.filter(function (l) { return String(l.order_id) === String(o.id); }).forEach(function (l) {
        bal += l.kind === "usage" ? -Number(l.amount) : Number(l.amount);
      });
      return Math.round(bal * 100) / 100;
    }
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
    splitTopLevel(m[1]).forEach(function (rawItem) {
      const item = rawItem.trim();
      const alias = /\s+AS\s+([a-z0-9_]+)\s*$/i.exec(item);
      let name = alias ? alias[1] : item.replace(/::[a-z0-9]+/gi, "").replace(/^[a-z]+\./i, "").trim();
      row[name] = siteOrderValue(o, name);
    });
    return row;
  }
  // 列表查询：ORDER BY / LIMIT 全部从 SQL 文本解析（实现漏写就红，假库不兜底）
  function orderList(list, sql) {
    let out = list.slice();
    const by = /ORDER BY\s+created_at\s+(ASC|DESC)/i.exec(sql);
    if (by) {
      const dir = by[1].toUpperCase() === "ASC" ? 1 : -1;
      const idm = /,\s*id\s+(ASC|DESC)/i.exec(sql);
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
  // 三组读接口按实现真实 SELECT 的列投影（id,phase,progress,...）；
  // INSERT/UPDATE ... RETURNING 的话术走 RETURNING 列表
  function projectRows(sql, rows) {
    const m = /^SELECT\s+([\s\S]+?)\s+FROM\s+/i.exec(sql);
    const ret = m ? null : /\bRETURNING\s+([\s\S]+)$/i.exec(sql);
    const text = m ? m[1] : (ret ? ret[1] : null);
    if (!text) throw new Error("fake pool: cannot parse projection: " + sql.slice(0, 80));
    const cols = splitTopLevel(text).map(function (item) {
      const t = item.trim().replace(/::[a-z0-9]+/gi, "");
      const alias = /\s+AS\s+([a-z0-9_]+)\s*$/i.exec(t);
      return alias ? alias[1] : t;
    });
    return rows.map(function (r) {
      const out = {};
      cols.forEach(function (c) { out[c] = r[c] === undefined ? null : r[c]; });
      return out;
    });
  }
  async function query(sql, params) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    const p = params || [];
    // 保真助手：$n 与 INSERT 列名按 SQL 文本解析（写错参数编号/列顺序，假库必须像真 PG 一样出错）
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
    if (s.indexOf("ROLLBACK TO SAVEPOINT") === 0) {
      db.aborted = false;
      db.savepointRollbacks++;
      return { rows: [] };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(s)) { db.aborted = false; return { rows: [] }; }
    if (db.aborted) {
      const e = new Error("current transaction is aborted"); e.code = "25P02"; throw e;
    }
    if (s.indexOf("SAVEPOINT") === 0 || s.indexOf("RELEASE SAVEPOINT") === 0) return { rows: [] };

    if (s.indexOf("INSERT INTO site_orders") === 0) {
      db.lastInsertSql = s;
      const orderNo = p[0];
      if (db.forceCollisionOnce) {
        db.forceCollisionOnce = false;
        db.aborted = true; // 模拟 PostgreSQL：23505 后事务进入 aborted
        const e = new Error("duplicate key"); e.code = "23505";
        e.constraint = "site_orders_order_no_key"; throw e;
      }
      if (db.orders.some(function (o) { return o.order_no === orderNo; })) {
        db.aborted = true;
        const e = new Error("duplicate key"); e.code = "23505"; throw e;
      }
      const now = new Date().toISOString();
      // 就地扩展：$15 是 brief JSON 字符串，入库存成对象（与 node-pg 的 jsonb 返回形态一致）
      let briefJson = {};
      if (p[14] !== undefined && p[14] !== null) {
        try { briefJson = JSON.parse(p[14]); } catch (e) { briefJson = {}; }
      }
      const row = {
        id: db.seq++, order_no: orderNo, name: p[1], phone: p[2], email: p[3], company: p[4],
        ren_no: p[5], area: p[6], domain: p[7], notes: p[8], package_code: p[9],
        monthly_price: p[10], setup_price: p[11], status: "new", contract_accepted: p[12],
        care_plan: p[13],
        phase: "brief", progress: 0, payment_status: "unpaid", paid_at: null,
        launched_at: null, brief_json: briefJson, client_user_id: null,
        created_at: now, updated_at: now
      };
      db.orders.push(row);
      return { rows: [{ id: row.id, order_no: row.order_no, status: row.status, care_plan: row.care_plan,
        monthly_price: Number(row.monthly_price), setup_price: Number(row.setup_price), created_at: now }] };
    }

    if (s.indexOf("INSERT INTO site_order_events") === 0) {
      if (s.indexOf("'created'") >= 0) db.events.push({ order_id: p[0], type: "created", note: p[1], actor: "public" });
      else db.events.push({ order_id: p[0], type: p[1], note: p[2], actor: p[3] });
      // 纯新增：给刚 push 的那条补 id / created_at。created_at 是确定性时间串（不用 new Date()，否则不可测）；
      // 相邻两条（id 1&2、3&4…）故意共用同一秒，方便构造「同 created_at 不同 id」的排序场景。
      const ev = db.events[db.events.length - 1];
      ev.id = (db.eventSeq = (db.eventSeq || 0) + 1);
      ev.created_at = "2026-11-17T00:00:" + String(Math.floor((ev.id - 1) / 2) % 60).padStart(2, "0") + ".000Z";
      return { rows: [] };
    }
    if (s.indexOf("INSERT INTO token_ledger") === 0) {
      db.ledger.push({ order_id: p[0], kind: p[1], amount: Number(p[2]), note: p[3] });
      return { rows: [] };
    }

    if (s.indexOf("FROM site_orders WHERE upper(order_no)") >= 0) {
      const row = db.orders.find(function (o) { return o.order_no.toUpperCase() === String(p[0]).toUpperCase(); });
      return { rows: row ? [{ order_no: row.order_no, status: row.status, created_at: row.created_at }] : [] };
    }
    if (s.indexOf("SELECT id, status FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = db.orders.find(function (o) { return o.id === Number(p[0]); });
      return { rows: row ? [{ id: row.id, status: row.status }] : [] };
    }
    if (s.indexOf("SELECT id FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = db.orders.find(function (o) { return o.id === Number(p[0]); });
      return { rows: row ? [{ id: row.id }] : [] };
    }
    // 纯新增：事件时间线的存在性查询。必须全等匹配：前缀写法会吃掉上面 token 记账的 "... FOR UPDATE"
    if (s === "SELECT id FROM site_orders WHERE id = $1") {
      const row = db.orders.find(function (o) { return o.id === Number(p[0]); });
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (s.indexOf("SELECT kind, amount FROM token_ledger WHERE order_id = $1") === 0) {
      return { rows: db.ledger.filter(function (l) { return l.order_id === Number(p[0]); }) };
    }
    // 客户/后台订单详情里的流水投影：沿用上面同一份 db.ledger，只按实现真实列投影。
    // 必须排除主查询是 site_orders 的 SQL（ADMIN_SELECT 的 tokens 子查询里也有 FROM token_ledger）。
    if (s.indexOf("FROM token_ledger") >= 0 && s.indexOf("site_orders") < 0) {
      db.lastLedgerSql = s;
      const list = db.ledger.filter(function (l) { return String(l.order_id) === String(p[0]); });
      return { rows: projectRows(s, orderList(list, s)) };
    }
    if (s.indexOf("UPDATE site_orders SET status = $1, updated_at = now() WHERE id = $2") === 0) {
      const row = db.orders.find(function (o) { return o.id === Number(p[1]); });
      if (row) { row.status = p[0]; row.updated_at = new Date().toISOString(); }
      return { rows: [] };
    }

    // ---- 037 客户门户新增分支（纯新增；既有分支语义一行未改）----
    // 1) 客户账号改名/绑定历史订单（client-api request-link）
    if (s.indexOf("UPDATE site_orders SET client_user_id = $1") === 0) {
      db.orders.forEach(function (o) {
        if (o.client_user_id != null) return;
        if (o.email == null) return;
        if (String(o.email).toLowerCase() !== String(p[1]).toLowerCase()) return;
        o.client_user_id = Number(p[0]);
      });
      return { rows: [] };
    }
    // 2) 下单事务内按 lower(email) 绑定（order-api POST /orders）
    if (s.indexOf("UPDATE site_orders o SET client_user_id = u.id") === 0) {
      db.lastBindSql = s;
      const order = db.orders.find(function (o) { return String(o.id) === String(p[0]); });
      const user = db.clientUsers.find(function (u) {
        return String(u.email).toLowerCase() === String(p[1]).toLowerCase();
      });
      if (!order || !user || order.client_user_id != null) return { rows: [] };
      order.client_user_id = user.id;
      return { rows: [{ id: order.id }] };
    }
    // 3) 两条 FOR UPDATE 存在性查询（payment / progress 分支用）
    if (s.indexOf("SELECT id, status, payment_status FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = db.orders.find(function (o) { return String(o.id) === String(p[0]); });
      return { rows: row ? [{ id: row.id, status: row.status,
        payment_status: row.payment_status === undefined ? "unpaid" : row.payment_status }] : [] };
    }
    if (s.indexOf("SELECT id, phase, progress, launched_at FROM site_orders WHERE id = $1 FOR UPDATE") === 0) {
      const row = db.orders.find(function (o) { return String(o.id) === String(p[0]); });
      return { rows: row ? [{ id: row.id,
        phase: row.phase === undefined ? "brief" : row.phase,
        progress: row.progress === undefined ? 0 : row.progress,
        launched_at: row.launched_at === undefined ? null : row.launched_at }] : [] };
    }
    // 4) 后台详情：brief_json 读取
    if (s.indexOf("SELECT brief_json FROM site_orders WHERE id = $1") === 0) {
      const row = db.orders.find(function (o) { return String(o.id) === String(p[0]); });
      return { rows: row ? [{ brief_json: row.brief_json === undefined ? {} : row.brief_json }] : [] };
    }
    // 5) payment / progress / launched_at 三条写
    if (s.indexOf("UPDATE site_orders SET payment_status") === 0) {
      db.lastPaymentSql = s;
      const row = db.orders.find(function (o) { return String(o.id) === String(whereId(1)); });
      if (row) {
        const setClause = (/SET\s+([\s\S]+?)\s+WHERE/i.exec(s) || [])[1] || "";
        row.payment_status = ph(/payment_status\s*=\s*\$(\d+)/i, 0);
        if (/paid_at\s*=\s*now\(\)/i.test(setClause)) row.paid_at = tick();
        if (/paid_at\s*=\s*NULL/i.test(setClause)) row.paid_at = null; // unpaid/refunded 不回退 status
        if (/status\s*=\s*'paid'/i.test(setClause)) row.status = "paid"; // SQL 没写就不改
        row.updated_at = tick();
      }
      return { rows: [] };
    }
    if (s.indexOf("UPDATE site_orders SET phase") === 0) {
      db.lastProgressSql = s;
      const row = db.orders.find(function (o) { return String(o.id) === String(whereId(2)); });
      if (row) {
        row.phase = ph(/phase\s*=\s*\$(\d+)/i, 0);
        row.progress = ph(/progress\s*=\s*\$(\d+)/i, 1);
        row.updated_at = tick();
      }
      return { rows: [] };
    }
    if (s.indexOf("UPDATE site_orders SET launched_at = COALESCE(launched_at, now())") === 0) {
      const row = db.orders.find(function (o) { return String(o.id) === String(p[0]); });
      if (row && row.launched_at == null) row.launched_at = tick();
      return { rows: [] };
    }
    // 6) 客户可见进度写入 + 读取（LIMIT/ORDER BY 从 SQL 解析）
    if (s.indexOf("INSERT INTO order_updates") === 0) {
      db.lastOrderUpdateSql = s;
      const cols = insertValues(); // 列名 → 参数：列顺序写反会把 note 写进 progress
      const row = {
        id: db.updateSeq++, order_id: Number(cols.order_id), phase: cols.phase,
        progress: cols.progress, note: cols.note, visible: cols.visible, actor: cols.actor,
        created_at: tick()
      };
      db.updates.push(row);
      return { rows: [{ id: row.id, order_id: row.order_id, phase: row.phase,
        progress: row.progress, note: row.note, visible: row.visible, actor: row.actor,
        created_at: row.created_at }] };
    }
    if (s.indexOf("FROM order_updates") >= 0) {
      db.lastUpdatesSql = s;
      let list = db.updates.filter(function (u) { return String(u.order_id) === String(p[0]); });
      if (/\bvisible\s*=\s*true\b/i.test(s)) {
        list = list.filter(function (u) { return u.visible === true; });
      }
      return { rows: projectRows(s, orderList(list, s)) };
    }
    // 7) 变更请求：后台推进 + 读
    if (s.indexOf("UPDATE change_requests") === 0) {
      db.lastChangeSql = s;
      const row = db.changes.find(function (c) { return String(c.id) === String(whereId(3)); });
      if (!row) return { rows: [] };
      const coalesce = /COALESCE\(\$(\d+), status\)/i.exec(s);
      const caseM = /CASE WHEN \$(\d+) THEN \$(\d+) ELSE admin_note END/i.exec(s);
      const bareNote = caseM ? null : /admin_note\s*=\s*\$(\d+)/i.exec(s);
      const bareStatus = coalesce ? null : /status\s*=\s*\$(\d+)/i.exec(s);
      if (coalesce) { const v = p[Number(coalesce[1]) - 1]; if (v != null) row.status = v; }
      else if (bareStatus) row.status = p[Number(bareStatus[1]) - 1];
      if (caseM) { if (p[Number(caseM[1]) - 1]) row.admin_note = p[Number(caseM[2]) - 1]; }
      else if (bareNote) row.admin_note = p[Number(bareNote[1]) - 1];
      row.updated_at = tick();
      return { rows: projectRows(s, [row]) };
    }
    if (s.indexOf("FROM change_requests") >= 0) {
      db.lastChangesSql = s;
      const list = db.changes.filter(function (c) { return String(c.order_id) === String(p[0]); });
      return { rows: projectRows(s, orderList(list, s)) };
    }
    // 8) 客户侧按 client_user_id 归属读（放在通用 admin 分支之前，避免被 o.id=$1 抢先吃掉）
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

    if (s.indexOf("FROM site_orders o") >= 0 && s.indexOf("WHERE o.id = $1") >= 0) {
      const row = db.orders.find(function (o) { return o.id === Number(p[0]); });
      return { rows: row ? [adminRow(row)] : [] };
    }
    if (s.indexOf("FROM site_orders o") >= 0) {
      let list = db.orders.slice();
      const statusPos = s.match(/o\.status = \$(\d+)/);
      if (statusPos) {
        const want = p[Number(statusPos[1]) - 1];
        list = list.filter(function (o) { return o.status === want; });
      }
      const qPos = s.match(/o\.order_no ILIKE \$(\d+)/);
      if (qPos) {
        const needle = String(p[Number(qPos[1]) - 1]).replace(/%/g, "").toLowerCase();
        list = list.filter(function (o) {
          return [o.order_no, o.name, o.phone, o.company, o.email].some(function (v) {
            return String(v || "").toLowerCase().indexOf(needle) >= 0;
          });
        });
      }
      list.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
      return { rows: list.slice(0, 200).map(adminRow) };
    }
    // 纯新增：事件时间线的只读查询。排序方向、第二排序键、截断条数全部从 SQL 文本解析；
    // 实现漏写 ORDER BY / id DESC / LIMIT 时假库不替它兜底（否则行为断言会假绿）。
    if (s.indexOf("FROM site_order_events") >= 0) {
      db.lastEventsSql = s;
      let list = db.events.filter(function (e) { return e.order_id === Number(p[0]); });
      const orderBy = /ORDER BY\s+created_at\s+(ASC|DESC)/i.exec(s);
      if (orderBy) {
        const byCreated = orderBy[1].toUpperCase() === "ASC" ? 1 : -1;
        const idKey = /,\s*id\s+(ASC|DESC)/i.exec(s);
        const byId = idKey ? (idKey[1].toUpperCase() === "ASC" ? 1 : -1) : 0;
        list = list.slice().sort(function (a, b) {
          if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -byCreated : byCreated;
          return byId ? (a.id - b.id) * byId : 0;
        });
      }
      const lim = /LIMIT\s+(\d+)/i.exec(s);
      // 没有 LIMIT 就不截断：实现漏写 LIMIT 100 时 120 条会全回，截断断言自然变红。
      list = lim ? list.slice(0, Number(lim[1])) : list;
      // 显式投影 5 列：db.events 的行里带 order_id，原样返回会让「5 键」断言假红
      return { rows: list.map(function (e) {
        return { id: e.id, type: e.type, note: e.note, actor: e.actor, created_at: e.created_at };
      }) };
    }
    throw new Error("fake pool: unhandled SQL: " + s.slice(0, 120));
  }
  return {
    _db: db,
    query: query,
    async connect() { return { query: query, release: function () {} }; }
  };
}

// ---------- HTTP 路由 ----------
async function httpTests() {
  let express;
  try { express = require("express"); }
  catch (e) {
    console.log("… SKIP HTTP 路由测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    return null;
  }
  const createOrderApi = require("./order-api");
  const fake = makeFakePool();

  function requireAdmin(req, res, next) {
    if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) {
      return res.status(401).json({ ok: false, error: "admin_required" });
    }
    req.admin = { email: "owner@example.com", role: "owner" };
    next();
  }
  function requireWrite(req, res, next) {
    if (!req.admin) return res.status(401).json({ ok: false, error: "admin_required" });
    if (req.admin.role === "viewer") return res.status(403).json({ ok: false, error: "read_only" });
    next();
  }

  const app = express();
  app.use(express.json());
  app.use("/api", createOrderApi({
    pool: fake, requireAdmin: requireAdmin, requireWrite: requireWrite,
    rateLimit: function () { return function (req, res, next) { next(); }; }
  }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  const cookie = { "Cookie": "fc_admin=test-token" };

  async function call(method, url, body, headers) {
    const res = await fetch(base + url, {
      method: method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await res.json().catch(function () { return {}; });
    return { status: res.status, body: json };
  }

  try {
    let r = await call("POST", "/api/orders", { phone: "0123456789", contract_accepted: true });
    eq([r.status, r.body.field], [400, "name"], "HTTP 缺 name → 400/name");
    r = await call("POST", "/api/orders", { name: "Andy", contract_accepted: true });
    eq([r.status, r.body.field], [400, "phone"], "HTTP 缺 phone → 400/phone");
    r = await call("POST", "/api/orders", { name: "Andy", phone: "0123456789", email: "bad", contract_accepted: true });
    eq([r.status, r.body.field], [400, "email"], "HTTP email 错 → 400/email");
    r = await call("POST", "/api/orders", { name: "Andy", phone: "0123456789", contract_accepted: false });
    eq([r.status, r.body.field], [400, "contract_accepted"], "HTTP 未同意条款 → 400/contract_accepted");

    r = await call("POST", "/api/orders", {
      name: "Andy Lau", phone: "012-345 6789", email: "andy@example.com",
      company: "ABC Realty", ren_no: "REN 12345", area: "Skudai",
      domain: "https://andylau.com/", notes: "12 套房源", contract_accepted: true
    });
    eq(r.status, 201, "HTTP 合法下单 → 201");
    ok(r.body.ok === true && core.ORDER_NO_RE.test(r.body.order.order_no), "HTTP 返回合法单号", r.body);
    eq(r.body.order.status, "new", "HTTP 新单状态 new");
    eq([r.body.order.monthly_price, r.body.order.setup_price], [299, 2500], "HTTP 返回价格 299/2500");
    eq(r.body.order.care_plan, "care299", "未选方案 → 默认 care299");
    const orderNo = r.body.order.order_no;
    ok(fake._db.events.some(function (e) { return e.type === "created"; }), "HTTP 下单写入 created 事件");
    ok(fake._db.orders[0].domain === "andylau.com", "HTTP domain 归一化后入库");

    // 方案选择：独立假库 + 独立 server，避免污染主库后续计数断言
    {
      const fake2 = makeFakePool();
      const app2 = express();
      app2.use(express.json());
      app2.use("/api", createOrderApi({
        pool: fake2, requireAdmin: requireAdmin, requireWrite: requireWrite,
        rateLimit: function () { return function (req, res, next) { next(); }; }
      }));
      app2.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });
      const server2 = app2.listen(0, "127.0.0.1");
      await new Promise(function (resolve) { server2.once("listening", resolve); });
      const base2 = "http://127.0.0.1:" + server2.address().port;
      async function post2(body) {
        const res = await fetch(base2 + "/api/orders", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        const json = await res.json().catch(function () { return {}; });
        return { status: res.status, body: json };
      }
      let r2 = await post2({ name: "Growth", phone: "012-345 6789", contract_accepted: true, care_plan: "growth499" });
      eq([r2.status, r2.body.order.monthly_price, r2.body.order.care_plan], [201, 499, "growth499"],
        "选 growth499 → 月费 499");
      r2 = await post2({ name: "Growth", phone: "012-345 6789", contract_accepted: true, care_plan: "care199" });
      eq([r2.status, r2.body.order.monthly_price, r2.body.order.care_plan], [201, 199, "care199"],
        "选 care199 → 月费 199");
      r2 = await post2({ name: "Bad", phone: "012-345 6789", contract_accepted: true, care_plan: "platinum" });
      eq([r2.status, r2.body.field], [400, "care_plan"], "非法方案 → 400/care_plan");
      server2.close();
    }

    r = await call("GET", "/api/orders/" + orderNo);
    eq(r.status, 200, "公开查单 → 200");
    eq(Object.keys(r.body.order).sort(), ["created_at", "order_no", "status"], "公开查单只返回三列（不泄露电话/邮箱/备注）");

    r = await call("GET", "/api/orders/ORD-000000-XXXX");
    eq([r.status, r.body.error], [404, "not_found"], "公开查无此单 → 404");

    r = await call("GET", "/api/admin/orders");
    eq([r.status, r.body.error], [401, "admin_required"], "未登录 GET 后台订单 → 401");
    r = await call("PATCH", "/api/admin/orders/1", { status: "live" });
    eq([r.status, r.body.error], [401, "admin_required"], "未登录 PATCH 订单 → 401");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "topup", amount: 100 });
    eq([r.status, r.body.error], [401, "admin_required"], "未登录 token 记账 → 401");

    r = await call("GET", "/api/admin/orders", undefined, cookie);
    eq(r.status, 200, "登录后 GET 后台订单 → 200");
    eq(r.body.rows.length, 1, "后台列表 1 条");
    eq(r.body.rows[0].tokens, 0, "新单 token 余额 0");

    r = await call("PATCH", "/api/admin/orders/1", { status: "live", note: "已上线" }, cookie);
    eq([r.status, r.body.order.status], [200, "live"], "PATCH 状态 → live");
    eq(r.body.order.status, "live", "PATCH 返回新状态");
    ok(fake._db.events.some(function (e) { return e.type === "status" && e.note === "已上线"; }), "PATCH 写入事件与备注");

    r = await call("PATCH", "/api/admin/orders/1", { status: "archived" }, cookie);
    eq([r.status, r.body.error], [400, "invalid_status"], "PATCH 非法状态 → 400");

    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "topup", amount: 100, note: "首充" }, cookie);
    eq([r.status, r.body.balance], [201, 100], "topup 100 → 余额 100");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "usage", amount: 30 }, cookie);
    eq([r.status, r.body.balance], [201, 70], "usage 30 → 余额 70");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "adjust", amount: -20 }, cookie);
    eq([r.status, r.body.balance], [201, 50], "adjust -20 → 余额 50");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "usage", amount: 500 }, cookie);
    eq([r.status, r.body.error], [400, "insufficient_tokens"], "余额不足不可扣减 → 400");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "usage", amount: -5 }, cookie);
    eq([r.status, r.body.error], [400, "invalid_token"], "usage 负数 → 400 invalid_token");

    r = await call("GET", "/api/admin/orders?status=live&q=Andy", undefined, cookie);
    eq([r.status, r.body.rows.length], [200, 1], "后台 status+q 过滤命中 1 条");
    r = await call("GET", "/api/admin/orders?status=bogus", undefined, cookie);
    eq([r.status, r.body.error], [400, "invalid_status"], "后台非法 status 过滤 → 400");

    // 事务内唯一键冲突：必须 ROLLBACK TO SAVEPOINT 后重试，而不是直接 continue
    fake._db.forceCollisionOnce = true;
    r = await call("POST", "/api/orders", {
      name: "Retry Test", phone: "019-888 7777", email: "retry@example.com",
      notes: "collision retry", contract_accepted: true
    });
    eq(r.status, 201, "单号冲突后自动重试 → 201");
    ok(fake._db.savepointRollbacks >= 1, "冲突后执行了 ROLLBACK TO SAVEPOINT", fake._db.savepointRollbacks);
    eq(fake._db.orders.length, 2, "冲突未留下脏数据，最终 2 单");

    // 回归：D2 金额四舍五入为 0 必须 400，而不是 DB CHECK 500
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "adjust", amount: 0.001 }, cookie);
    eq([r.status, r.body.error], [400, "invalid_token"], "adjust 0.001 → 400 invalid_token");

    // 回归：D6 联系方式/域名/邮箱宽松校验
    r = await call("POST", "/api/orders", { name: "Bad Phone", phone: "abc1234567", contract_accepted: true });
    eq([r.status, r.body.field], [400, "phone"], "phone 含字母 → 400/phone");
    r = await call("POST", "/api/orders", { name: "Bad Email", phone: "0123456789", email: "a@b..com", contract_accepted: true });
    eq([r.status, r.body.field], [400, "email"], "email 连续点 → 400/email");
    r = await call("POST", "/api/orders", { name: "Bad Domain", phone: "0123456789", domain: "a-.com", contract_accepted: true });
    eq([r.status, r.body.field], [400, "domain"], "domain label 以 - 结尾 → 400/domain");

    // 回归：D9 合法大额 2 位小数不能被浮点误差误拒
    // 余额此前为 50；只验证大额 2dp 被接受，不假设从 0 开始
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "topup", amount: 1234567.89 }, cookie);
    eq([r.status, r.body.balance], [201, 1234617.89], "topup 1234567.89 → 201");
    r = await call("POST", "/api/admin/orders/1/tokens", { kind: "adjust", amount: -1234567.89 }, cookie);
    eq([r.status, r.body.balance], [201, 50], "adjust -1234567.89 → 201");

    // 回归：D1 公开查单必须按 IP 固定桶限流，不能按 orderNo 分桶
    let saw429 = false;
    for (let i = 0; i < 65; i++) {
      r = await call("GET", "/api/orders/" + core.orderNoFromSeq(new Date(), i));
      if (r.status === 429) { saw429 = true; break; }
    }
    ok(saw429, "65 个不同单号查询必须触发 429（按 IP 固定桶）");
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
  return fake._db;
}

// ---------- 订单事件时间线（独立假库：不污染 main() 末尾三条库级断言） ----------
async function eventsTests() {
  let express;
  try { express = require("express"); }
  catch (e) {
    console.log("… SKIP 订单事件时间线测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    return null;
  }
  const createOrderApi = require("./order-api");
  const fake = makeFakePool();
  const db = fake._db;

  // 独立库手工造数据：501=排序（含同 created_at）、502=无事件、503=120 条截断、504=note/actor 为 null
  db.orders.push({ id: 501 }, { id: 502 }, { id: 503 }, { id: 504 });
  [
    { id: 11, order_id: 501, type: "created", note: null, actor: "public",
      created_at: "2026-11-17T00:00:01.000Z" },
    { id: 12, order_id: 501, type: "status", note: "先写入同秒的一条", actor: "owner@example.com",
      created_at: "2026-11-17T00:00:03.000Z" },
    { id: 13, order_id: 501, type: "note", note: "同秒后写入、id 更大", actor: "owner@example.com",
      created_at: "2026-11-17T00:00:03.000Z" },
    { id: 14, order_id: 501, type: "status", note: "中间时刻", actor: null,
      created_at: "2026-11-17T00:00:02.000Z" }
  ].forEach(function (e) { db.events.push(e); });
  for (let i = 1; i <= 120; i++) {
    db.events.push({ id: 1000 + i, order_id: 503, type: "status", note: "批量事件 " + i,
      actor: "owner@example.com", created_at: new Date(Date.UTC(2026, 10, 18, 0, 0, i)).toISOString() });
  }
  db.events.push({ id: 21, order_id: 504, type: "note", note: null, actor: null,
    created_at: "2026-11-19T00:00:00.000Z" });

  function requireAdmin(req, res, next) {
    if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) {
      return res.status(401).json({ ok: false, error: "admin_required" });
    }
    req.admin = { email: "owner@example.com", role: "owner" };
    next();
  }
  function requireWrite(req, res, next) {
    if (!req.admin) return res.status(401).json({ ok: false, error: "admin_required" });
    if (req.admin.role === "viewer") return res.status(403).json({ ok: false, error: "read_only" });
    next();
  }

  const app = express();
  app.use(express.json());
  app.use("/api", createOrderApi({
    pool: fake, requireAdmin: requireAdmin, requireWrite: requireWrite,
    rateLimit: function () { return function (req, res, next) { next(); }; }
  }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  const cookie = { "Cookie": "fc_admin=test-token" };

  async function call(method, url, headers) {
    const res = await fetch(base + url, {
      method: method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
    });
    const json = await res.json().catch(function () { return {}; });
    return { status: res.status, body: json };
  }

  try {
    console.log("\n== 订单事件时间线 ==");

    let r = await call("GET", "/api/admin/orders/501/events");
    eq([r.status, r.body.ok], [401, false], "事件时间线：未登录 → 401 且 ok:false");

    const badIds = [];
    for (const raw of ["0", "-3", "abc", "1.5"]) {
      const resp = await call("GET", "/api/admin/orders/" + raw + "/events", cookie);
      if (!((resp.status === 400 || resp.status === 404) && resp.body.ok === false)) {
        badIds.push({ id: raw, status: resp.status, body: resp.body });
      }
    }
    eq(badIds, [], "事件时间线：非法 id（0/-3/abc/1.5）→ 400 或 404 且 ok:false");

    r = await call("GET", "/api/admin/orders/999999/events", cookie);
    eq([r.status, r.body.error], [404, "not_found"], "事件时间线：合法 id 但订单不存在 → 404 not_found");

    const before = { events: db.events.length, orders: JSON.stringify(db.orders) };
    r = await call("GET", "/api/admin/orders/501/events", cookie);
    const rows = Array.isArray(r.body.rows) ? r.body.rows : [];
    eq([r.status, r.body.ok, Array.isArray(r.body.rows)], [200, true, true],
      "事件时间线：正常订单 → 200 且 rows 是数组");

    const wantKeys = ["actor", "created_at", "id", "note", "type"];
    eq(rows.map(function (row) { return Object.keys(row).sort(); }),
      [wantKeys, wantKeys, wantKeys, wantKeys],
      "事件时间线：每行恰好 5 键 id,type,note,actor,created_at（不多不少）");

    eq(rows.map(function (row) { return Number(row.id); }), [13, 12, 14, 11],
      "事件时间线：created_at DESC, id DESC（同一 created_at 下 id 大在前）");

    eq([db.events.length, JSON.stringify(db.orders)], [before.events, before.orders],
      "事件时间线：GET 只读（events 条数 / orders 内容都不变）");

    r = await call("GET", "/api/admin/orders/502/events", cookie);
    eq([r.status, r.body.ok, Array.isArray(r.body.rows) ? r.body.rows.length : -1],
      [200, true, 0], "事件时间线：订单存在但无事件 → 200 rows:[]");

    r = await call("GET", "/api/admin/orders/503/events", cookie);
    const big = Array.isArray(r.body.rows) ? r.body.rows : [];
    eq(big.length, 100, "事件时间线：120 条只回 100 条（SQL LIMIT 100）");
    eq(big.length ? [Number(big[0].id), Number(big[big.length - 1].id)] : [],
      [1120, 1021], "事件时间线：截断取最新 100 条（首条最新、尾条第 100 新）");

    const sql = String(db.lastEventsSql || "");
    ok(/site_order_events/.test(sql) && /ORDER BY\s+created_at\s+DESC,\s*id\s+DESC/i.test(sql) &&
      /LIMIT\s+100\b/i.test(sql),
      "事件时间线：事件 SQL = site_order_events + ORDER BY created_at DESC, id DESC + LIMIT 100", sql);
    const cols = (/SELECT\s+(.+?)\s+FROM\s+site_order_events/i.exec(sql) || [])[1];
    eq(cols ? cols.split(",").map(function (c) { return c.trim(); }).sort() : [],
      ["actor", "created_at", "id", "note", "type"],
      "事件时间线：事件 SQL 只投影 5 列（不带 order_id）");
    ok(/^\s*SELECT\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE)\b/i.test(sql),
      "事件时间线：事件 SQL 是只读 SELECT（无 INSERT/UPDATE/DELETE）", sql);

    r = await call("GET", "/api/admin/orders/504/events", cookie);
    const nullRows = Array.isArray(r.body.rows) ? r.body.rows : [];
    eq(nullRows.length ? [nullRows[0].note, nullRows[0].actor, nullRows[0].type] : "no-row",
      [null, null, "note"], "事件时间线：note/actor 为 null 时原样透出（不变成空串）");

    // 合同硬要求（TASKS §2）：只读接口只挂 requireAdmin —— 不得误挂 requireWrite、不得加限流。
    // 上方实例注入的是「正常」requireWrite 与 no-op rateLimit，误用它们不会红；
    // 这里再挂一个「严格」实例：requireWrite 恒 403、rateLimit 恒 429。误用任一，下面两条必红。
    const strictApp = express();
    strictApp.use("/api", createOrderApi({
      pool: fake,
      requireAdmin: requireAdmin,
      requireWrite: function (req, res) { return res.status(403).json({ ok: false, error: "read_only" }); },
      rateLimit: function () {
        return function (req, res) { return res.status(429).json({ ok: false, error: "rate_limited" }); };
      }
    }));
    strictApp.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

    const strictServer = strictApp.listen(0, "127.0.0.1");
    await new Promise(function (resolve) { strictServer.once("listening", resolve); });
    const strictBase = "http://127.0.0.1:" + strictServer.address().port;
    try {
      const sres = await fetch(strictBase + "/api/admin/orders/501/events", { headers: cookie });
      const sbody = await sres.json().catch(function () { return {}; });
      eq(sres.status, 200, "事件时间线：只挂 requireAdmin（requireWrite 恒 403、rateLimit 恒 429 下仍 200）");
      eq(Array.isArray(sbody.rows) ? sbody.rows.length : -1, 4,
        "事件时间线：严格实例仍返回完整 4 行（未被 requireWrite / 限流拦截）");
    } finally {
      await new Promise(function (resolve) { strictServer.close(resolve); });
    }
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
  return db;
}

// ---------- 客户门户：brief / 绑定 / 后台付款·进度·详情·变更（独立假库，不污染 main 末尾三条断言） ----------
async function portalTests() {
  let express;
  try { express = require("express"); }
  catch (e) {
    console.log("… SKIP 客户门户后台测试（本机未安装 express；服务器 /srv/fangchan/api 有）");
    return null;
  }
  const createOrderApi = require("./order-api");
  const fake = makeFakePool();
  const db = fake._db;
  // 预置客户账号：下单邮箱大小写不同也要能绑定
  db.clientUsers.push({ id: 7, email: "b2b@example.com", name: "B2B", phone: null });
  db.orders.push({ id: 90, order_no: "ORD-261117-ZZZZ", name: "Old", phone: "0123456789",
    email: "old@example.com", client_user_id: null, phase: "design", progress: 30,
    payment_status: "paid", paid_at: "2026-11-01T00:00:00.000Z", launched_at: null,
    monthly_price: 1500, setup_price: 2500, brief_json: { goal: "旧单" }, status: "building",
    contract_accepted: true, created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z" });
  db.seq = 91; // 下一张单从 91 开始，避开手工预置的 90
  // 记录 ADMIN_SELECT 文本（后续断言四列真的进了 SQL，而不是只在假库里）
  const origQuery = fake.query;
  fake.query = function (sql, params) {
    const s = String(sql);
    if (s.indexOf("FROM site_orders o") >= 0 && s.indexOf("token_ledger") >= 0) {
      db.lastAdminSql = s.replace(/\s+/g, " ");
    }
    return origQuery(sql, params);
  };

  function requireAdmin(req, res, next) {
    if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) {
      return res.status(401).json({ ok: false, error: "admin_required" });
    }
    req.admin = { email: "owner@example.com", role: "owner" };
    next();
  }
  function requireWrite(req, res, next) {
    if (!req.admin) return res.status(401).json({ ok: false, error: "admin_required" });
    if (req.admin.role === "viewer") return res.status(403).json({ ok: false, error: "read_only" });
    next();
  }

  const app = express();
  app.use(express.json());
  app.use("/api", createOrderApi({
    pool: fake, requireAdmin: requireAdmin, requireWrite: requireWrite,
    rateLimit: function () { return function (req, res, next) { next(); }; }
  }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (resolve) { server.once("listening", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  const cookie = { "Cookie": "fc_admin=test-token" };

  async function call(method, url, body, headers) {
    const res = await fetch(base + url, {
      method: method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await res.json().catch(function () { return {}; });
    return { status: res.status, body: json };
  }

  try {
    console.log("\n== 订单 brief（POST /orders） ==");
    let r = await call("POST", "/api/orders", {
      name: "Brief Buyer", phone: "0123456789", email: "B2B@Example.com", contract_accepted: true,
      brief: { goal: "卖房", pages: "首页", listing_count: 12,
        asset_links: ["https://a.com/x", "https://b.com/y"], notes: " 加急 " }
    });
    eq([r.status, r.body.ok], [201, true], "带 brief 下单 → 201");
    eq(Object.keys(r.body.order).sort(), ["care_plan", "monthly_price", "order_no", "setup_price", "status"],
      "带 brief 下单响应恰好 5 键（含 care_plan）");
    const created = db.orders[db.orders.length - 1];
    eq(created.brief_json, { goal: "卖房", pages: "首页", listing_count: 12,
      asset_links: "https://a.com/x, https://b.com/y", notes: "加急" },
      "brief_json 归一化后以对象入库（数组 join、trim）");
    ok(typeof created.brief_json === "object" && !Array.isArray(created.brief_json),
      "brief_json 是 object 而不是 JSON 字符串");
    eq(created.client_user_id, 7, "同邮箱下单在同一事务内自动绑定 client_user_id（lower(email)）");
    ok(/care_plan,\s*brief_json\s*\)/i.test(db.lastInsertSql) && /\$15::jsonb/i.test(db.lastInsertSql) &&
      /\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15/.test(db.lastInsertSql),
      "POST /orders INSERT = 15 列且 brief_json 走 $15::jsonb", db.lastInsertSql);
    ok(/o\.client_user_id IS NULL/i.test(db.lastBindSql) && /lower\(u\.email\) = lower\(\$2\)/i.test(db.lastBindSql),
      "绑定 SQL 只绑未绑定订单且按 lower(email) 匹配", db.lastBindSql);

    r = await call("POST", "/api/orders", { name: "No Brief", phone: "0123456789", contract_accepted: true });
    eq([r.status, db.orders[db.orders.length - 1].brief_json], [201, {}], "未提供 brief → brief_json 默认 {}");
    r = await call("POST", "/api/orders", { name: "No Match", phone: "0123456789",
      email: "nomatch@example.com", contract_accepted: true });
    eq([r.status, db.orders[db.orders.length - 1].client_user_id], [201, null],
      "无匹配 client_user 时绑定 0 行不算错误");

    for (const [brief, label] of [
      [{ logo_url: "javascript:alert(1)" }, "brief URL 非 http/https"],
      [{ notes: "x".repeat(1001) }, "brief notes 超长"],
      [{ goal: true }, "brief 值类型非法"],
      [null, "brief 为 null（non-object）"],
      ["nope", "brief 非对象"]
    ]) {
      r = await call("POST", "/api/orders", { name: "Bad Brief", phone: "0123456789",
        contract_accepted: true, brief: brief });
      eq([r.status, r.body.error, r.body.field], [400, "invalid_input", "brief"],
        label + " → 400 field:brief");
    }
    r = await call("POST", "/api/orders", { name: "Nul Brief", phone: "0123456789",
      contract_accepted: true, brief: { goal: "a\u0000b" } });
    eq([r.status, db.orders[db.orders.length - 1].brief_json.goal], [201, "ab"],
      "brief 字符串删除 NUL（否则 jsonb 会 500）");
    r = await call("POST", "/api/orders", { phone: "1", brief: { logo_url: "javascript:x" } });
    eq([r.status, r.body.field], [400, "name"], "订单本体与 brief 同时非法 → 先报订单本体 field");

    console.log("\n== 后台：列表四列 / 付款 / 进度 / 详情 / 变更 ==");
    r = await call("GET", "/api/admin/orders", undefined, cookie);
    eq([r.status, r.body.rows.length > 0], [200, true], "后台列表 200");
    ok(["phase", "progress", "payment_status", "paid_at"].every(function (k) {
      return r.body.rows[0] && Object.prototype.hasOwnProperty.call(r.body.rows[0], k);
    }), "后台列表行带 phase/progress/payment_status/paid_at");
    ok(["o.phase", "o.progress", "o.payment_status", "o.paid_at"].every(function (c) {
      return String(db.lastAdminSql || "").indexOf(c) >= 0;
    }), "ADMIN_SELECT 列清单含四列", String(db.lastAdminSql || "").slice(0, 200));

    const payId = created.id;
    for (const body of [{}, { payment_status: 5 }, { payment_status: false }, { payment_status: "bogus" }]) {
      r = await call("PATCH", "/api/admin/orders/" + payId + "/payment", body, cookie);
      eq([r.status, r.body.error], [400, "invalid_payment_status"], "payment 非法值 → 400");
    }
    r = await call("PATCH", "/api/admin/orders/9999/payment", { payment_status: "paid" }, cookie);
    eq([r.status, r.body.error], [404, "not_found"], "payment 未知订单 → 404");
    r = await call("PATCH", "/api/admin/orders/" + payId + "/payment", { payment_status: "paid" }, cookie);
    eq([r.status, r.body.order.payment_status, r.body.order.status], [200, "paid", "paid"],
      "paid → payment_status/status 都是 paid");
    ok(r.body.order.paid_at != null, "paid → paid_at 写入");
    ok(/paid_at=now\(\), status='paid', updated_at=now\(\)/i.test(db.lastPaymentSql),
      "paid 分支 SQL = paid_at=now() + status='paid' + updated_at", db.lastPaymentSql);
    const payEv = db.events.filter(function (e) { return e.type === "payment"; }).pop();
    eq([payEv.order_id, payEv.note, payEv.actor], [payId, "payment: unpaid -> paid", "owner@example.com"],
      "payment 事件 note/actor 正确");
    r = await call("PATCH", "/api/admin/orders/" + payId + "/payment", { payment_status: "refunded" }, cookie);
    eq([r.body.order.payment_status, r.body.order.paid_at, r.body.order.status], ["refunded", null, "paid"],
      "refunded → paid_at=NULL 且 status 不回退（合同字面）");
    ok(/paid_at=NULL/i.test(db.lastPaymentSql) && !/status\s*=\s*'paid'/i.test(db.lastPaymentSql),
      "unpaid/refunded 分支 SQL 只清 paid_at，不写 status", db.lastPaymentSql);

    const progId = created.id;
    for (const body of [{ progress: 50 }, { phase: "" }, { phase: "bogus" }, { phase: 123 }]) {
      r = await call("PATCH", "/api/admin/orders/" + progId + "/progress", body, cookie);
      eq([r.status, r.body.error], [400, "invalid_phase"], "progress 非法 phase → 400 invalid_phase");
    }
    for (const p of [undefined, "50", 50.5, -1, 101]) {
      r = await call("PATCH", "/api/admin/orders/" + progId + "/progress", { phase: "build", progress: p }, cookie);
      eq([r.status, r.body.error], [400, "invalid_progress"], "progress 非法值 → 400 invalid_progress");
    }
    r = await call("PATCH", "/api/admin/orders/" + progId + "/progress",
      { phase: "build", progress: 50, note: "x".repeat(501) }, cookie);
    eq([r.status, r.body.error], [400, "invalid_note"], "progress note > 500 → 400 invalid_note");
    r = await call("PATCH", "/api/admin/orders/9999/progress", { phase: "live", progress: 100 }, cookie);
    eq([r.status, r.body.error], [404, "not_found"], "progress 未知订单 → 404");

    const updBefore = db.updates.length;
    r = await call("PATCH", "/api/admin/orders/" + progId + "/progress",
      { phase: "build", progress: 50, note: " 开工 " }, cookie);
    eq([r.status, r.body.ok], [200, true], "progress 成功 → 200");
    eq([r.body.order.phase, r.body.order.progress], ["build", 50], "订单 phase/progress 已更新");
    eq(db.updates.length, updBefore + 1, "progress 写 order_updates");
    eq([r.body.update.visible, r.body.update.actor, r.body.update.note],
      [true, "owner@example.com", "开工"], "order_updates visible=true / actor / note trim");
    const progEv = db.events.filter(function (e) { return e.type === "progress"; }).pop();
    eq(progEv.note, "progress: brief/0 -> build/50 | 开工", "progress 事件 note 模板 + note 后缀");
    eq(db.lastProgressSql, "UPDATE site_orders SET phase=$1, progress=$2, updated_at=now() WHERE id=$3",
      "progress UPDATE 参数编号 = phase=$1, progress=$2, id=$3");
    ok(db.lastOrderUpdateSql.indexOf(
      "INSERT INTO order_updates(order_id,phase,progress,note,visible,actor) VALUES ($1,$2,$3,$4,true,$5)") === 0,
      "order_updates INSERT 列顺序与占位参数固定", db.lastOrderUpdateSql);
    ok(db.orders.find(function (o) { return o.id === progId; }).launched_at == null,
      "phase≠live 不写 launched_at");

    r = await call("PATCH", "/api/admin/orders/" + progId + "/progress", { phase: "live", progress: 100 }, cookie);
    const firstLive = db.orders.find(function (o) { return o.id === progId; }).launched_at;
    ok(firstLive != null, "首次 phase=live 写 launched_at");
    r = await call("PATCH", "/api/admin/orders/" + progId + "/progress", { phase: "live", progress: 100 }, cookie);
    eq(db.orders.find(function (o) { return o.id === progId; }).launched_at, firstLive,
      "二次 live 不覆盖 launched_at（COALESCE）");

    // 详情：visible=false 也返回 / 7 键 / LIMIT 100 / brief_json 对象
    db.updates.push({ id: 999, order_id: progId, phase: "build", progress: 55, note: "内部备注",
      visible: false, actor: "owner@example.com", created_at: "2026-11-19T00:00:00.000Z" });
    for (let i = 1; i <= 120; i++) {
      db.updates.push({ id: 2000 + i, order_id: progId, phase: "build", progress: i % 101,
        note: "批量 " + i, visible: true, actor: "owner@example.com",
        created_at: new Date(Date.UTC(2026, 10, 18, 0, 0, i)).toISOString() });
    }
    r = await call("GET", "/api/admin/orders/" + progId + "/detail", undefined, cookie);
    eq([r.status, r.body.ok], [200, true], "admin detail → 200");
    eq(Object.keys(r.body).sort(), ["brief_json", "changes", "ledger", "ok", "order", "updates"],
      "detail 响应恰好 6 键");
    eq(r.body.updates.length, 100, "detail updates LIMIT 100");
    ok(r.body.updates.every(function (u) { return Object.keys(u).length === 7; }),
      "admin updates 每行恰好 7 键（含 visible/actor）");
    ok(r.body.updates.some(function (u) { return u.visible === false; }), "visible=false 的更新仍返回");
    eq(r.body.brief_json, created.brief_json, "detail brief_json 是该订单的 brief 对象");
    eq(r.body.changes, [], "无变更请求 → changes:[]");
    r = await call("GET", "/api/admin/orders/9999/detail", undefined, cookie);
    eq([r.status, r.body.error], [404, "not_found"], "detail 未知订单 → 404");

    db.changes.push({ id: 501, order_id: progId, title: "换图", description: "首页换图",
      page_url: null, priority: "normal", status: "open", admin_note: null,
      created_at: "2026-11-17T00:00:00.000Z", updated_at: "2026-11-17T00:00:00.000Z" });
    r = await call("PATCH", "/api/admin/changes/501", {}, cookie);
    eq([r.status, r.body.error], [400, "empty_patch"], "change 空 patch → 400 empty_patch");
    r = await call("PATCH", "/api/admin/changes/501", { status: "bogus" }, cookie);
    eq([r.status, r.body.error], [400, "invalid_status"], "change 非法 status → 400");
    r = await call("PATCH", "/api/admin/changes/501", { admin_note: "x".repeat(1001) }, cookie);
    eq([r.status, r.body.error], [400, "invalid_note"], "change admin_note > 1000 → 400");
    r = await call("PATCH", "/api/admin/changes/9999", { status: "done" }, cookie);
    eq([r.status, r.body.error], [404, "not_found"], "change 未知 id → 404");
    r = await call("PATCH", "/api/admin/changes/501", { status: "DONE", admin_note: " 已处理 " }, cookie);
    eq([r.status, r.body.change.status, r.body.change.admin_note], [200, "done", "已处理"],
      "change 推进成功（status 归一化 + note trim）");
    ok(db.changes.find(function (c) { return c.id === 501; }).updated_at !== "2026-11-17T00:00:00.000Z",
      "change PATCH 刷新 updated_at");
    ok(/COALESCE\(\$1, status\)/i.test(db.lastChangeSql) &&
      /CASE WHEN \$2 THEN \$3 ELSE admin_note END/i.test(db.lastChangeSql) &&
      /WHERE id = \$4/i.test(db.lastChangeSql),
      "change PATCH SQL = COALESCE + CASE WHEN + WHERE id=$4", db.lastChangeSql);
    r = await call("PATCH", "/api/admin/changes/501", { status: "open" }, cookie);
    eq([r.status, r.body.change.status, r.body.change.admin_note], [200, "open", "已处理"],
      "status-only PATCH 保留原 admin_note（未提供字段保持原值）");
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
  return db;
}

// ---------- api-server 集成静态检查（SPEC §5.7：挂载顺序 + mail token 脱敏） ----------
function apiServerStaticChecks() {
  const file = path.join("work", "api-server.js");
  if (!fs.existsSync(file)) { console.log("… SKIP api-server 静态检查（文件不存在）"); return; }
  const src = fs.readFileSync(file, "utf8");
  const prefix = "api-server：";
  ok(src.indexOf('const createClientApi = require("./client-api");') >= 0,
    prefix + "顶部 require ./client-api");
  const iMount = src.indexOf('app.use("/api/client", createClientApi(');
  const iFallback = src.indexOf('app.use("/api", function (req, res) { res.status(404)');
  ok(iMount >= 0 && iFallback > iMount,
    prefix + "/api/client 挂载在 /api 404 fallback 之前", { iMount: iMount, iFallback: iFallback });
  ok(src.indexOf('pool: pool, sendMail: sendMail, rateLimit: rateLimit, siteUrl: "https://kwongthye.com"') >= 0,
    prefix + "挂载参数 pool/sendMail/rateLimit/siteUrl 齐全");
  ok(src.indexOf('/token=[0-9a-f]{64}/g, "token=[redacted]"') >= 0,
    prefix + "mail.log 写盘前把 token=<64hex> 脱敏（应用日志不落 raw token）");
  ok(src.indexOf('fsp.appendFile(pathMod.join(__dirname, "mail.log")') >= 0,
    prefix + "仍写 mail.log（脱敏后）");
}

// ---------- 前台/后台页面新增内容静态检查（SPEC §7.2 / AC-P13 / AC-P15 / AC-P19） ----------
function requireTrio(dict, keys, label) {
  const bad = keys.filter(function (k) {
    const v = dict && dict[k];
    return !Array.isArray(v) || v.length !== 3 ||
      v.some(function (x) { return typeof x !== "string" || !x.trim(); });
  });
  eq(bad, [], label + "：" + keys.length + " 个 key 都是非空三语");
}

function portalPageChecks() {
  const orderFile = path.join("web", "order", "index.html");
  if (fs.existsSync(orderFile)) {
    const html = fs.readFileSync(orderFile, "utf8");
    const dict = extractI18N(html) || {};
    const prefix = "下单页 brief：";
    const ids = ["b_goal", "b_pages", "b_listing_count", "b_listing_source", "b_logo_url",
      "b_brand_color", "b_reference_url", "b_asset_links", "b_target_launch"];
    eq(ids.filter(function (id) { return html.indexOf('id="' + id + '"') < 0; }), [],
      prefix + "9 个 brief 控件齐全");
    requireTrio(dict, ["brief_title", "brief_sub", "label_goal", "label_pages", "label_listing_count",
      "label_listing_source", "label_logo_url", "label_brand_color", "label_reference_url",
      "label_asset_links", "label_target_launch", "ph_asset_links", "err_brief"], prefix + "新 I18N");
    ok(/data-i18n-ph="ph_asset_links"/.test(html), prefix + "asset_links 用 data-i18n-ph 三语 placeholder");
    ok(/maxlength="500"/.test(html), prefix + "brief 文本控件带 maxlength 500");
    ok(/\.brief\s*=/.test(html) || /brief\s*:\s*brief/.test(html), prefix + "提交对象里带 brief");
    ok(/putText\(\s*brief,\s*"domain"|brief\.domain/.test(html),
      prefix + "A1：brief.domain 复用顶层 domain 输入");
    ok(/putText\(\s*brief,\s*"notes"|brief\.notes/.test(html),
      prefix + "A1：brief.notes 复用顶层 notes 输入");
    ok(/asset_links\s*=\s*assets|brief\.asset_links/.test(html), prefix + "asset_links 以数组提交");
    ok(/field\s*===\s*"brief"/.test(html) && /err_brief/.test(html), prefix + "field:brief → err_brief 映射");
  } else {
    console.log("… SKIP 下单页 brief 检查（web/order/index.html 不存在）");
  }

  const adminFile = path.join("web", "admin", "orders", "index.html");
  if (fs.existsSync(adminFile)) {
    const html = fs.readFileSync(adminFile, "utf8");
    const dict = extractI18N(html) || {};
    const prefix = "后台门户区块：";
    const ids = ["brief-sect", "pay-sect", "progress-sect", "updates-sect", "changes-sect"];
    eq(ids.filter(function (id) { return html.indexOf('id="' + id + '"') < 0; }), [],
      prefix + "5 个新区块齐全（brief/pay/progress/updates/changes）");
    requireTrio(dict, ["brief_section", "brief_empty", "detail_not_found", "pay_section",
      "payment_status", "pay_save", "progress_section", "phase_label", "progress_save",
      "updates_section", "changes_section", "timeline_type_payment", "timeline_type_progress",
      "phase_brief", "phase_design", "phase_build", "phase_review", "phase_launch", "phase_live",
      "priority_low", "priority_normal", "priority_high"], prefix + "新 I18N");
    ok(html.indexOf('id="dphase"') >= 0 && html.indexOf('id="dprogress"') >= 0 &&
      html.indexOf('id="dpnote"') >= 0, prefix + "进度控件 dphase/dprogress/dpnote 齐全");
    ok(html.indexOf('id="dpayment"') >= 0 && html.indexOf('id="paybtn"') >= 0,
      prefix + "付款控件 dpayment/paybtn 齐全");
    ok(html.indexOf('id="dbrief"') >= 0 && html.indexOf('id="dbrief-empty"') >= 0,
      prefix + "brief 展示节点 dbrief/dbrief-empty 齐全");
    ok(html.indexOf("/payment") >= 0 && html.indexOf("/progress") >= 0 &&
      html.indexOf("/detail") >= 0 && html.indexOf("/api/admin/changes/") >= 0,
      prefix + "四条新请求路径齐全（/payment /progress /detail /api/admin/changes/）");
    ok(/(payment:\s*"timeline_type_payment"|TYPE_KEY\.payment\s*=)/.test(html) &&
      /(progress:\s*"timeline_type_progress"|TYPE_KEY\.progress\s*=)/.test(html),
      prefix + "时间线 TYPE_KEY 接入 payment/progress");
    ok(/loadDetailExtras\(/.test(html), prefix + "openDetail/apply 触发 loadDetailExtras");
  } else {
    console.log("… SKIP 后台区块检查（web/admin/orders/index.html 不存在）");
  }
}

// ---------- 页面静态检查 ----------
function extractI18N(html) {
  const marker = "var I18N = {";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const from = start + marker.length - 1; // 指向 '{'
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
      if (depth === 0) return Function('"use strict";return (' + html.slice(from, i + 1) + ")")();
    }
  }
  return null;
}

function pageChecks(file, opts) {
  const html = fs.readFileSync(file, "utf8");
  const label = path.basename(path.dirname(file)) + "/" + path.basename(file);
  ok(/<meta name="viewport"/.test(html), label + " 有 viewport");
  ok(html.indexOf("data-lang=\"zh\"") > 0 && html.indexOf("data-lang=\"en\"") > 0 && html.indexOf("data-lang=\"bm\"") > 0,
    label + " 三语切换按钮齐全");
  ok(/@media\s*\(max-width/.test(html), label + " 有手机端 media query");
  ok(/(?:src|href)="[^"]+\?v=[^"]+"/.test(html), label + " 静态资源带版本号");

  const dict = extractI18N(html);
  ok(!!dict, label + " 可解析 I18N 字典");
  if (!dict) return;
  const keys = Object.keys(dict);
  ok(keys.length >= 30, label + " 文案 key 数量 ≥ 30（实际 " + keys.length + "）");
  let badLen = [], badText = [], cjk = [];
  keys.forEach(function (k) {
    const v = dict[k];
    if (!Array.isArray(v) || v.length !== 3 || v.some(function (x) { return typeof x !== "string" || !x.trim(); })) {
      badLen.push(k);
    }
    if (Array.isArray(v)) {
      if (/[\u4e00-\u9fff]/.test(String(v[1] || ""))) cjk.push(k + ":en");
      if (/[\u4e00-\u9fff]/.test(String(v[2] || ""))) cjk.push(k + ":bm");
    }
  });
  eq(badLen, [], label + " 每个 key 都是非空 [zh,en,bm] 三语");
  eq(cjk, [], label + " EN/BM 无中文残留");

  const used = new Set();
  let m;
  const re = /data-i18n(?:-ph)?="([^"]+)"/g;
  while ((m = re.exec(html))) used.add(m[1]);
  const missing = Array.from(used).filter(function (k) { return !dict[k]; });
  eq(missing, [], label + " 页面引用的 key 全部存在于字典");

  (opts.requiredKeys || []).forEach(function (k) {
    ok(!!dict[k], label + " 必备 key: " + k);
  });
  if (opts.priceGuard) {
    ok(!/4,000/.test(html), label + " 页面不出现 RM4,000 叠加口径");
    const pt = dict.price_total || [];
    ok(pt.length === 3 && pt.every(function (v) { return v.indexOf("2,500") >= 0; }),
      label + " 三语价格文案都写首月 RM2,500", pt);
    ok(pt.every(function (v) { return v.indexOf("4,000") < 0; }), label + " 三语价格文案都无 RM4,000");
    ok((dict.chip_setup || []).every(function (v) { return /首月|first month|bulan pertama/i.test(v); }),
      label + " 价格 chip 标注为「首月」");
  }
  ok(html.indexOf(opts.apiPath) >= 0, label + " 调用 " + opts.apiPath);
}

// ---------- 后台时间线 UI 结构检查 ----------
// 只断言「某字符串存在」会假绿（整块被删、只删一个 key、前缀匹配命中），
// 这里一律按位置 / 数量 / 窗口 / 逐个 key 判定。
function timelineUiChecks() {
  const html = fs.readFileSync(path.join("web", "admin", "orders", "index.html"), "utf8");
  const prefix = "后台时间线 UI：";

  // a) 区块位置：位于详情弹窗（#modal）之后、告警框（#dalert）之前
  const iModal = html.indexOf('id="modal"');
  const iSect = html.indexOf('id="timeline-sect"');
  const iAlert = html.indexOf('id="dalert"');
  ok(iModal >= 0 && iSect > iModal && iAlert > iSect,
    prefix + 'id="timeline-sect" 位于 id="modal" 之后且 id="dalert" 之前（整块被删即红）',
    { iModal: iModal, iSect: iSect, iAlert: iAlert });

  // b) 状态节点与列表节点都在 timeline-sect 之后（不是散落在弹窗别处）
  const iTl = html.indexOf('id="dtimeline"');
  const iTlStatus = html.indexOf('id="dtimeline-status"');
  ok(iSect >= 0 && iTl > iSect && iTlStatus > iSect,
    prefix + 'id="dtimeline" 与 id="dtimeline-status" 都存在且位于 id="timeline-sect" 之后',
    { iSect: iSect, iTl: iTl, iTlStatus: iTlStatus });

  // c) 请求路径精确为 /events（不做前缀匹配，改后缀即红），且 orderId 走 encodeURIComponent
  ok(html.indexOf('"/events"') >= 0 && html.indexOf("encodeURIComponent(orderId)") >= 0,
    prefix + '事件请求含 "/events"（非前缀匹配）且对 orderId 做 encodeURIComponent');

  // d) 9 个时间线文案 key 逐个存在且为非空三语（原来只遍历「已存在」的 key，删 key 不会红）
  const dict = extractI18N(html);
  const tlKeys = ["timeline_section", "timeline_loading", "timeline_empty", "timeline_err",
    "timeline_err_not_found", "timeline_actor", "timeline_type_created",
    "timeline_type_status", "timeline_type_note"];
  const badKeys = tlKeys.filter(function (k) {
    const v = dict && dict[k];
    return !Array.isArray(v) || v.length !== 3 ||
      v.some(function (x) { return typeof x !== "string" || !x.trim(); });
  });
  eq(badKeys, [], prefix + "9 个时间线 key 均为非空 [zh,en,bm]（" + tlKeys.join("/") + "）");

  // e) 调用点数量 + savebtn / tokenbtn 处理函数各自的 1200 字符窗口内都要刷新时间线
  const calls = (html.match(/loadTimeline\(/g) || []).length;
  ok(calls >= 5,
    prefix + "loadTimeline( 调用点 ≥ 5（定义 + 打开详情 + 切语言 + 保存 + 记账）", calls);
  function clickWindow(id) {
    const i = html.indexOf('$("' + id + '")');
    return i < 0 ? "" : html.slice(i, i + 1200);
  }
  ok(clickWindow("savebtn").indexOf("loadTimeline(") >= 0,
    prefix + '$("savebtn") 之后 1200 字符窗口内调用 loadTimeline(');
  ok(clickWindow("tokenbtn").indexOf("loadTimeline(") >= 0,
    prefix + '$("tokenbtn") 之后 1200 字符窗口内调用 loadTimeline(');

  // e2) 打开详情即加载：锚点必须存在（否则 indexOf=-1 会静默通过，这里显式 fail-closed），
  //     且锚点后 1500 字符窗口内必须调用 loadTimeline(（删掉该行即红）
  function anchorWindow(anchor) {
    const i = anchor < 0 ? -1 : html.indexOf(anchor);
    return { at: i, win: i < 0 ? "" : html.slice(i, i + 1500) };
  }
  const wOpen = anchorWindow("function openDetail(");
  ok(wOpen.at >= 0 && wOpen.win.indexOf("loadTimeline(") >= 0,
    prefix + "function openDetail( 之后 1500 字符窗口内调用 loadTimeline(（打开详情即加载）",
    { anchor: wOpen.at, hit: wOpen.win.indexOf("loadTimeline(") });
  const wApply = anchorWindow("function apply()");
  ok(wApply.at >= 0 && wApply.win.indexOf("loadTimeline(") >= 0,
    prefix + "function apply() 之后 1500 字符窗口内调用 loadTimeline(（切语言即刷新）",
    { anchor: wApply.at, hit: wApply.win.indexOf("loadTimeline(") });

  // f) loadTimeline 函数体内 401 仍被静默吞掉：code === "auth" 必须存在且早于 timelineError(
  const fnStart = html.indexOf("function loadTimeline");
  const fnEnd = fnStart < 0 ? -1 : html.indexOf("\n  }", fnStart);
  const body = fnStart >= 0 && fnEnd > fnStart ? html.slice(fnStart, fnEnd) : "";
  const iAuth = body.indexOf('code === "auth"');
  const iErr = body.indexOf("timelineError(");
  ok(body.length > 0 && iAuth >= 0 && iErr > iAuth,
    prefix + 'loadTimeline 内 code === "auth" 存在且早于 timelineError(（401 未被吞）',
    { bodyLen: body.length, iAuth: iAuth, iErr: iErr });
}

async function main() {
  console.log("== 公开下单页 ==");
  pageChecks(path.join("web", "order", "index.html"), {
    apiPath: "/api/orders",
    priceGuard: true,
    requiredKeys: ["form_title", "label_name", "label_phone", "consent_link", "price_total", "fair_body", "success_title"]
  });

  console.log("\n== 后台订单页 ==");
  pageChecks(path.join("web", "admin", "orders", "index.html"), {
    apiPath: "/api/admin/orders",
    requiredKeys: ["gate_title", "gate_btn", "th_tokens", "token_section", "save_status", "status_live", "insufficient"]
  });
  timelineUiChecks();
  {
    const html = fs.readFileSync(path.join("web", "admin", "orders", "index.html"), "utf8");
    const dict = extractI18N(html) || {};
    ["new", "contacted", "paid", "building", "review", "live", "paused", "cancelled"].forEach(function (s) {
      ok(!!dict["status_" + s], "后台状态文案存在: " + s);
    });
    ok(html.indexOf('href="/admin/?next=') > 0, "后台页 401 时引导到 /admin/ 登录并返回订单后台");
    ok(/res\.status === 401/.test(html), "后台页显式处理 401");
  }

  console.log("\n== 页面新增内容 / api-server 集成 ==");
  portalPageChecks();
  apiServerStaticChecks();

  console.log("\n== HTTP 路由（假 pool） ==");
  const db = await httpTests();
  await eventsTests();
  await portalTests();
  if (db) {
    eq(db.orders.length, 2, "假库最终 2 条订单（含冲突重试）");
    eq(db.ledger.length, 5, "假库 5 条 token 流水（成功记账）");
    eq(db.events.length, 3, "假库 3 条事件（2 created + 1 status）");
  }

  console.log("\nORDERS " + (fail ? "FAIL " + fail : "PASS") + " / " + (pass + fail) + " checks");
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error("test-orders crashed:", e && e.stack || e);
  process.exit(1);
});
