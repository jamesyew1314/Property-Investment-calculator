"use strict";
// library-core.js — 资料库的纯函数层（无数据库、无网络），便于单测与复用。
// 输入一律先清洗：去控制字符、限长、数字解析（支持 "RM 1,200,000"）、日期归一。

const { keysOf, isValid, stateOfArea } = require("./library-taxonomy");

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function str(v, max = 500) {
  if (v == null) return null;
  const s = String(v).replace(CONTROL, "").trim();
  return s ? s.slice(0, max) : null;
}

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,\s]/g, "").replace(/^(RM|MYR)/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function money(v, max = 1e12) {
  const n = toNum(v);
  if (n == null || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

function whole(v, { min = 0, max = 100000 } = {}) {
  const n = toNum(v);
  if (n == null || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function decimal(v, { min = 0, max = 1e9 } = {}) {
  const n = toNum(v);
  if (n == null || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

function boolOf(v, fallback = false) {
  if (v == null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  return ["1", "true", "yes", "on", "y"].indexOf(String(v).toLowerCase()) >= 0;
}

// 2026-10-27 / 27-10-2026 / 27/10/2026 / 2026/10/27 → 2026-10-27
function dateOf(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().slice(0, 10);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

function pad(n) { return String(n).padStart(2, "0"); }

function timeOf(v) {
  const s = str(v, 5);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

function enumOf(name, v) {
  const s = str(v, 40);
  return s && isValid(name, s) ? s : null;
}

function listOfEnums(name, v, max = 12) {
  if (v == null) return [];
  const raw = Array.isArray(v) ? v : String(v).split(/[,;|]/);
  const allowed = keysOf(name);
  const out = [];
  for (const item of raw) {
    const s = str(item, 40);
    if (!s || allowed.indexOf(s) < 0 || out.indexOf(s) >= 0) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// 通用字段写入器：partial=true 时只处理 req.body 里出现的键
function builder(input, partial) {
  const errors = {};
  const values = {};
  const has = (k) => !partial || Object.prototype.hasOwnProperty.call(input, k);

  function put(k, v) { if (has(k)) values[k] = v; }
  function text(k, max, { required = false } = {}) {
    if (!has(k)) return;
    const v = str(input[k], max);
    if (!v && required) { errors[k] = "required"; return; }
    values[k] = v;
  }
  function choice(k, name) {
    if (!has(k)) return;
    const v = enumOf(name, input[k]);
    if (v == null && str(input[k])) { errors[k] = "invalid_choice"; return; }
    values[k] = v;
  }
  function numField(k, fn, opts) {
    if (!has(k)) return;
    const raw = input[k];
    if (raw === "" || raw == null) { values[k] = null; return; }
    const v = fn(raw, opts);
    if (v == null) { errors[k] = "invalid_number"; return; }
    values[k] = v;
  }

  return { errors, values, has, put, text, choice, numField };
}

function finish(errors, values, extra = {}) {
  return { errors, values: { ...values, ...extra } };
}

// ---------- 实体归一化 ----------
function normalizeProject(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.text("name", 120, { required: !partial });
  b.text("name_zh", 120);
  b.text("developer", 120);
  b.choice("area_code", "areas");
  b.choice("state", "states");
  b.text("address", 300);
  b.choice("tenure", "tenures");
  b.choice("property_type", "property_types");
  b.numField("total_units", whole, { min: 0, max: 100000 });
  b.numField("blocks", whole, { min: 0, max: 500 });
  b.numField("completion_year", whole, { min: 1900, max: 2100 });
  b.text("facilities", 1000);
  b.numField("lat", decimal, { min: -90, max: 90 });
  b.numField("lng", decimal, { min: -180, max: 180 });
  b.text("remarks", 2000);
  if (b.has("archived")) b.put("archived", boolOf(input.archived));
  const out = finish(b.errors, b.values);
  if (out.values.area_code) {
    const st = stateOfArea(out.values.area_code);
    if (st) out.values.state = st;
  }
  return out;
}

function normalizeOwner(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.text("name", 100, { required: !partial });
  b.text("phone", 40);
  b.text("phone2", 40);
  b.text("email", 120);
  b.text("id_last4", 4);
  b.text("address", 300);
  b.choice("source", "sources");
  b.text("remarks", 1000);
  return finish(b.errors, b.values);
}

function normalizeClient(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.text("name", 100, { required: !partial });
  b.text("phone", 40);
  b.text("email", 120);
  b.choice("intent", "client_intents");
  b.numField("budget_min", money);
  b.numField("budget_max", money);
  if (b.has("area_codes")) b.put("area_codes", listOfEnums("areas", input.area_codes));
  if (b.has("property_types")) b.put("property_types", listOfEnums("property_types", input.property_types));
  b.numField("bedrooms_min", whole, { min: 0, max: 20 });
  b.choice("timeline", "timelines");
  b.choice("source", "sources");
  b.choice("status", "client_statuses");
  b.text("agent", 80);
  b.text("remarks", 2000);
  const out = finish(b.errors, b.values);
  const min = out.values.budget_min, max = out.values.budget_max;
  if (min != null && max != null && min > max) out.errors.budget_max = "range_order";
  return out;
}

function normalizeProperty(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.text("project_name", 160);
  b.choice("area_code", "areas");
  b.choice("state", "states");
  b.choice("property_type", "property_types");
  b.choice("tenure", "tenures");
  b.text("address", 300);
  b.text("block", 30);
  b.text("unit_no", 30);
  b.numField("floor", whole, { min: -5, max: 200 });
  b.numField("built_up", decimal, { min: 0, max: 1000000 });
  b.numField("land_area", decimal, { min: 0, max: 1000000 });
  b.numField("bedrooms", whole, { min: 0, max: 50 });
  b.numField("bathrooms", whole, { min: 0, max: 50 });
  b.numField("carparks", whole, { min: 0, max: 50 });
  b.text("facing", 40);
  b.choice("furnishing", "furnishings");
  b.choice("condition", "conditions");
  b.choice("intent", "listing_intents");
  b.numField("asking_price", money);
  b.numField("rent_price", money);
  b.numField("maintenance_fee", money, { max: 100000 });
  b.choice("status", "listing_statuses");
  b.text("agent", 80);
  b.choice("title_type", "title_types");
  b.text("remarks", 3000);
  b.numField("project_id", whole, { min: 1, max: 1e9 });
  b.numField("owner_id", whole, { min: 1, max: 1e9 });
  if (b.has("exclusive")) b.put("exclusive", boolOf(input.exclusive));
  if (b.has("listed_on")) b.put("listed_on", dateOf(input.listed_on));
  if (b.has("tags")) b.put("tags", listOfEnums("tags", input.tags, 24));

  const out = finish(b.errors, b.values);
  if (out.values.area_code) {
    const st = stateOfArea(out.values.area_code);
    if (st) out.values.state = st;
  }
  if (out.values.built_up != null && out.values.land_area != null &&
      out.values.land_area > out.values.built_up * 20) {
    out.errors.land_area = "range_order";
  }
  return out;
}

function normalizeViewing(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.numField("property_id", whole, { min: 1, max: 1e9 });
  b.numField("client_id", whole, { min: 1, max: 1e9 });
  b.text("agent", 80);
  if (b.has("scheduled_on")) b.put("scheduled_on", dateOf(input.scheduled_on));
  if (b.has("scheduled_time")) b.put("scheduled_time", timeOf(input.scheduled_time));
  b.choice("status", "viewing_statuses");
  b.text("feedback", 2000);
  const out = finish(b.errors, b.values);
  if (!partial && out.values.property_id == null && !out.errors.property_id) out.errors.property_id = "required";
  return out;
}

function normalizeDeal(input, { partial = false } = {}) {
  const b = builder(input || {}, partial);
  b.numField("property_id", whole, { min: 1, max: 1e9 });
  b.numField("client_id", whole, { min: 1, max: 1e9 });
  b.choice("kind", "deal_kinds");
  b.numField("price", money);
  if (b.has("deal_on")) b.put("deal_on", dateOf(input.deal_on));
  b.numField("commission_rate", decimal, { min: 0, max: 20 });
  b.numField("commission_amount", money);
  b.choice("status", "deal_statuses");
  b.text("agent", 80);
  b.text("remarks", 2000);
  const out = finish(b.errors, b.values);
  // 未填佣金金额时按成交价 × 佣金率推算
  if (out.values.commission_amount == null && out.values.price != null && out.values.commission_rate != null) {
    out.values.commission_amount = commission(out.values.price, out.values.commission_rate);
  }
  return out;
}

function commission(price, rate) {
  const p = toNum(price), r = toNum(rate);
  if (p == null || r == null || p < 0 || r < 0) return null;
  return Math.round(p * (r / 100) * 100) / 100;
}

// 重复房源：同一楼盘 + 座 + 单位号
function dupeKey({ project_id, block, unit_no }) {
  const u = str(unit_no, 30);
  if (!u) return null;
  return `${Number(project_id) || 0}|${(str(block, 30) || "").toLowerCase()}|${u.toLowerCase()}`;
}

// ---------- CSV ----------
function parseCsv(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  const body = clean.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]).trim(); });
    return o;
  });
  return { headers, rows: body };
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const head = headers.map(csvCell).join(",");
  const body = rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")).join("\r\n");
  return "\uFEFF" + head + "\r\n" + body + "\r\n";
}

const CSV_COLUMNS = {
  properties: [
    "code", "project", "area_code", "property_type", "tenure", "address", "block", "unit_no", "floor",
    "built_up", "land_area", "bedrooms", "bathrooms", "carparks", "facing", "furnishing", "condition",
    "intent", "asking_price", "rent_price", "maintenance_fee", "status", "agent", "exclusive",
    "listed_on", "title_type", "owner_name", "owner_phone", "remarks"
  ],
  projects: ["name", "name_zh", "developer", "area_code", "address", "tenure", "property_type",
    "total_units", "blocks", "completion_year", "facilities", "remarks"],
  owners: ["name", "phone", "phone2", "email", "id_last4", "address", "source", "remarks"],
  clients: ["name", "phone", "email", "intent", "budget_min", "budget_max", "area_codes",
    "property_types", "bedrooms_min", "timeline", "source", "status", "agent", "remarks"],
  deals: ["property_code", "client_name", "kind", "price", "deal_on", "commission_rate",
    "commission_amount", "agent", "status", "remarks"],
  viewings: ["property_code", "client_name", "agent", "scheduled_on", "scheduled_time", "status", "feedback"]
};

// ---------- 查询辅助 ----------
function paging(q = {}) {
  const page = Math.max(1, Math.min(10000, Number(q.page) || 1));
  const pageSize = Math.max(1, Math.min(200, Number(q.pageSize) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function sortOf(q, allowed, fallback) {
  const col = String(q.sort || "");
  const dir = String(q.dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  return allowed[col] ? `${allowed[col]} ${dir}` : fallback;
}

function likeOf(q) {
  const s = str(q, 120);
  return s ? `%${s.replace(/[%_\\]/g, (m) => "\\" + m)}%` : null;
}

module.exports = {
  str, toNum, money, whole, decimal, boolOf, dateOf, timeOf, enumOf, listOfEnums,
  normalizeProject, normalizeOwner, normalizeClient, normalizeProperty, normalizeViewing, normalizeDeal,
  commission, dupeKey, parseCsv, toCsv, csvCell, CSV_COLUMNS, paging, sortOf, likeOf
};
