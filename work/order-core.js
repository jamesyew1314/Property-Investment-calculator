"use strict";
// order-core.js — 建站接单的纯逻辑（校验 / 单号 / 状态 / token 余额）
// 不依赖 express、数据库或环境变量，供 order-api.js 与 work/test-orders.js 共用。

const PACKAGE_CODE = "dedicated";
// 价格口径：setup = 首月总价（含建站 + 首月服务），不是“建站费 + 首月月费”。
// monthly 从第 2 个月起收取；改价时同步改迁移默认值与前端文案。
const PRICES = { monthly: 1500, setup: 2500 };

// 状态机白名单（顺序即后台下拉顺序）
const STATUSES = ["new", "contacted", "paid", "building", "review", "live", "paused", "cancelled"];
const STATUS_SET = new Set(STATUSES);

const TOKEN_KINDS = ["topup", "usage", "adjust"];
const TOKEN_KIND_SET = new Set(TOKEN_KINDS);

// Crockford 风格字母表：去掉 I / O / 0 / 1，避免电话口述时看错
const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ORDER_SPACE = ORDER_ALPHABET.length ** 4; // 1,048,576
const ORDER_NO_RE = /^ORD-\d{6}-[2-9A-HJ-NP-Z]{4}$/;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/;
function validDomain(d) {
  if (!d || d.length > 120 || d.indexOf("..") >= 0) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  var labels = d.split(".");
  if (labels.length < 2) return false;
  return labels.every(function (l) { return l.length >= 1 && l.length <= 63 && !/^-/.test(l) && !/-$/.test(l); });
}
const MAX_AMOUNT = 10000000; // 单笔 token 上限 RM 10,000,000，防手滑

function str(v) {
  if (v == null) return "";
  return String(v).replace(/\u0000/g, "").trim();
}

function squish(v) {
  return str(v).replace(/\s+/g, " ");
}

function money2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// 马来西亚时间（UTC+8）的 YYMMDD，避免服务器 UTC 跨日导致单号日期错一天
function orderDateStamp(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const yy = String(shifted.getUTCFullYear()).slice(-2);
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return yy + mm + dd;
}

// 由确定性序号生成单号（测试与冲突重试都复用这一条路径）
function orderNoFromSeq(date, seq) {
  let n = Math.abs(Math.trunc(Number(seq) || 0)) % ORDER_SPACE;
  let tail = "";
  for (let i = 0; i < 4; i++) {
    tail = ORDER_ALPHABET[n % ORDER_ALPHABET.length] + tail;
    n = Math.floor(n / ORDER_ALPHABET.length);
  }
  return "ORD-" + orderDateStamp(date) + "-" + tail;
}

// randInt(maxExclusive) 由调用方注入（生产用 crypto.randomInt）
function randomOrderNo(date, randInt) {
  const r = typeof randInt === "function" ? randInt : Math.random;
  return orderNoFromSeq(date, Math.floor(r(ORDER_SPACE)));
}

function normalizeOrder(body) {
  const raw = body && typeof body === "object" ? body : {};
  const out = {
    name: "", phone: "", email: null, company: null, ren_no: null,
    area: null, domain: null, notes: null, contract_accepted: false
  };
  const errors = {};

  const name = squish(raw.name);
  if (!name) errors.name = "required";
  else if (name.length > 80) errors.name = "too_long";
  else out.name = name;

  const phone = squish(raw.phone);
  if (!phone) {
    errors.phone = "required";
  } else {
    const digits = phone.replace(/\D/g, "");
    if (!/^[+()\d\s.-]+$/.test(phone)) errors.phone = "invalid";
    else if (digits.length < 7 || digits.length > 15) errors.phone = "invalid";
    else if (phone.length > 32) errors.phone = "too_long";
    else out.phone = phone;
  }

  const email = squish(raw.email).toLowerCase();
  if (email) {
    if (email.length > 120 || !EMAIL_RE.test(email)) errors.email = "invalid";
    else out.email = email;
  }

  const company = squish(raw.company);
  if (company) {
    if (company.length > 120) errors.company = "too_long";
    else out.company = company;
  }

  const ren = squish(raw.ren_no).toUpperCase();
  if (ren) {
    if (ren.length > 40) errors.ren_no = "too_long";
    else out.ren_no = ren;
  }

  const area = squish(raw.area);
  if (area) {
    if (area.length > 80) errors.area = "too_long";
    else out.area = area;
  }

  let domain = squish(raw.domain).toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (domain) {
    if (domain.length > 120 || !DOMAIN_RE.test(domain) || !validDomain(domain)) errors.domain = "invalid";
    else out.domain = domain;
  }

  // 备注保留换行，只去首尾空白
  const notes = str(raw.notes);
  if (notes) {
    if (notes.length > 1000) errors.notes = "too_long";
    else out.notes = notes;
  }

  if (raw.contract_accepted !== true) errors.contract_accepted = "required";
  else out.contract_accepted = true;

  const fieldOrder = ["name", "phone", "email", "contract_accepted", "domain",
    "company", "ren_no", "area", "notes"];
  const firstField = fieldOrder.find(function (k) { return !!errors[k]; }) || null;
  return { values: out, errors: errors, first_field: firstField,
    first_error: firstField ? errors[firstField] : null };
}

function validateStatus(value) {
  const s = str(value).toLowerCase();
  return STATUS_SET.has(s) ? s : null;
}

function normalizeToken(body) {
  const raw = body && typeof body === "object" ? body : {};
  const values = { kind: "", amount: 0, note: null };
  const errors = {};

  const kind = str(raw.kind).toLowerCase();
  if (!kind) errors.kind = "required";
  else if (!TOKEN_KIND_SET.has(kind)) errors.kind = "invalid";
  else values.kind = kind;

  const amountRaw = typeof raw.amount === "string" ? raw.amount.replace(/,/g, "") : raw.amount;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount === 0) {
    errors.amount = "invalid";
  } else {
    // 用“分”判断 2 位小数，避免大额浮点误差误拒 1234567.89
    const cents = Math.round(amount * 100);
    const rounded = cents / 100;
    if (Math.abs(amount - rounded) > 1e-9) errors.amount = "invalid";
    else if (rounded === 0) errors.amount = "invalid";
    else if (Math.abs(rounded) > MAX_AMOUNT) errors.amount = "too_large";
    else if (values.kind === "usage" && rounded <= 0) errors.amount = "must_be_positive";
    else if (values.kind === "topup" && rounded <= 0) errors.amount = "must_be_positive";
    else if (!["topup", "usage", "adjust"].includes(values.kind)) errors.amount = "invalid";
    else values.amount = rounded;
  }

  const note = str(raw.note);
  if (note) {
    if (note.length > 300) errors.note = "too_long";
    else values.note = note;
  }

  const firstField = ["kind", "amount", "note"].find(function (k) { return !!errors[k]; }) || null;
  return { values: values, errors: errors, first_field: firstField,
    first_error: firstField ? errors[firstField] : null };
}

// 余额 = topup + adjust - usage；接受 pg 返回的 numeric 字符串
function balanceOf(rows) {
  let bal = 0;
  (rows || []).forEach(function (r) {
    const a = Number(r.amount);
    if (!Number.isFinite(a)) return;
    bal += r.kind === "usage" ? -a : a;
  });
  return money2(bal);
}

function canUseTokens(balance, amount) {
  return money2(balance) >= money2(amount);
}

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 9007199254740991 ? n : null;
}

// ---------- 客户门户：阶段 / 付款 / 变更白名单 ----------
const PHASES = ["brief", "design", "build", "review", "launch", "live"];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const CHANGE_STATUSES = ["open", "in_progress", "done", "cancelled"];
const CHANGE_PRIORITIES = ["low", "normal", "high"];

// brief 白名单：顺序即输出顺序（JSON.stringify 稳定），未知 key 一律丢弃。
const BRIEF_KEYS = ["goal", "pages", "listing_count", "listing_source", "domain", "logo_url",
  "brand_color", "reference_url", "asset_links", "target_launch", "notes"];
const BRIEF_MAX_TOTAL = 8000;
// 内部规则（SPEC §3 步骤 2/5/7）
const BRIEF_MAX_INPUT_KEYS = 12;   // 未知 key 也计数
const BRIEF_STRING_MAX = 500;
const BRIEF_NOTES_MAX = 1000;
const BRIEF_ARRAY_MAX = 10;
// 只允许 http/https：防 javascript:/data: 进入客户页（存储型 XSS）
const BRIEF_URL_KEYS = new Set(["logo_url", "reference_url", "asset_links"]);

// 归一化客户邮箱：空 / 超长 / 不合法一律 ""（调用方据此返回 invalid_email）
function normalizeEmail(raw) {
  const email = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!email || email.length > 120 || !EMAIL_RE.test(email)) return "";
  return email;
}

function isHttpUrl(value) {
  let u;
  try { u = new URL(String(value)); } catch (e) { return false; }
  return u.protocol === "http:" || u.protocol === "https:";
}

function briefString(v) {
  return String(v).replace(/\u0000/g, "").trim();
}

function briefFail() {
  return { ok: false, value: null, error: "brief" };
}

// 结构化 brief：11 个白名单字段；失败整包拒绝（只有数组 >10 项按前 10 项截断）。
// v1.1 冻结：只有 undefined（未提供）成功；null 是 non-object → 失败（brief:null 必须 400）。
function normalizeBrief(raw) {
  if (raw === undefined) return { ok: true, value: {}, error: null };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return briefFail();
  // 未知 key 也占名额：12 个以内才收，超出即失败
  if (Object.keys(raw).length > BRIEF_MAX_INPUT_KEYS) return briefFail();

  const out = {};
  for (const key of BRIEF_KEYS) { // 固定顺序遍历 → 输出 key 顺序稳定
    const v = raw[key];
    if (v === undefined || v === null) continue; // null/undefined 视为未提供

    if (typeof v === "string") {
      const s = briefString(v);
      if (!s) continue; // 空串等于未提供
      if (s.length > (key === "notes" ? BRIEF_NOTES_MAX : BRIEF_STRING_MAX)) return briefFail();
      if (BRIEF_URL_KEYS.has(key) && !isHttpUrl(s)) return briefFail();
      out[key] = s;
      continue;
    }

    if (typeof v === "number") {
      if (!Number.isFinite(v)) return briefFail(); // NaN / Infinity 拒绝；0 保留
      if (BRIEF_URL_KEYS.has(key)) return briefFail(); // URL 字段必须是 string 或 string[]
      out[key] = v;
      continue;
    }

    if (Array.isArray(v)) {
      if (!v.every(function (item) { return typeof item === "string"; })) return briefFail();
      const items = v.map(briefString).filter(function (s) { return !!s; });
      if (!items.length) continue; // 空数组等于未提供
      // 每个元素都卡 500，再截前 10（截断本身不报错）
      if (items.some(function (s) { return s.length > BRIEF_STRING_MAX; })) return briefFail();
      if (BRIEF_URL_KEYS.has(key) && !items.every(isHttpUrl)) return briefFail();
      out[key] = items.slice(0, BRIEF_ARRAY_MAX).join(", ");
      continue;
    }

    return briefFail(); // boolean / object / 嵌套数组等一律拒绝
  }

  if (JSON.stringify(out).length > BRIEF_MAX_TOTAL) return briefFail();
  return { ok: true, value: out, error: null };
}

module.exports = {
  PACKAGE_CODE, PRICES, STATUSES, TOKEN_KINDS, ORDER_ALPHABET, ORDER_NO_RE,
  orderDateStamp, orderNoFromSeq, randomOrderNo,
  normalizeOrder, validateStatus, normalizeToken,
  balanceOf, canUseTokens, money2, parseId,
  PHASES, PAYMENT_STATUSES, CHANGE_STATUSES, CHANGE_PRIORITIES,
  BRIEF_KEYS, BRIEF_MAX_TOTAL, normalizeEmail, normalizeBrief
};
