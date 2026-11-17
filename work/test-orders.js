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

// ---------- 假 pool（够跑通 order-api 的 SQL 形状） ----------
function makeFakePool() {
  const db = { orders: [], events: [], ledger: [], seq: 1, aborted: false,
    forceCollisionOnce: false, savepointRollbacks: 0 };
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
      created_at: o.created_at, updated_at: o.updated_at,
      tokens: Math.round(bal * 100) / 100
    };
  }
  async function query(sql, params) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    const p = params || [];
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
      const row = {
        id: db.seq++, order_no: orderNo, name: p[1], phone: p[2], email: p[3], company: p[4],
        ren_no: p[5], area: p[6], domain: p[7], notes: p[8], package_code: p[9],
        monthly_price: p[10], setup_price: p[11], status: "new", contract_accepted: p[12],
        created_at: now, updated_at: now
      };
      db.orders.push(row);
      return { rows: [{ id: row.id, order_no: row.order_no, status: row.status,
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
    if (s.indexOf("UPDATE site_orders SET status = $1, updated_at = now() WHERE id = $2") === 0) {
      const row = db.orders.find(function (o) { return o.id === Number(p[1]); });
      if (row) { row.status = p[0]; row.updated_at = new Date().toISOString(); }
      return { rows: [] };
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
    eq([r.body.order.monthly_price, r.body.order.setup_price], [1500, 2500], "HTTP 返回价格 1500/2500");
    const orderNo = r.body.order.order_no;
    ok(fake._db.events.some(function (e) { return e.type === "created"; }), "HTTP 下单写入 created 事件");
    ok(fake._db.orders[0].domain === "andylau.com", "HTTP domain 归一化后入库");

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
    ok(html.indexOf('href="/admin/"') > 0, "后台页 401 时引导到 /admin/ 登录");
    ok(/res\.status === 401/.test(html), "后台页显式处理 401");
  }

  console.log("\n== HTTP 路由（假 pool） ==");
  const db = await httpTests();
  await eventsTests();
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
