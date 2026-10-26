// validate.js — 输入清洗与校验（API 与测试共用）
// 原则：只接收白名单字段；字符串截断、数值范围、枚举校验；错误带字段级提示。

import {badRequest} from './http-error.js';
import {
  ACTION_STATUSES,
  AREAS,
  CONDITION_PREFS,
  CONDITIONS,
  FURNISHINGS,
  FURNISHING_PREFS,
  LISTING_INTENTS,
  LISTING_STATUSES,
  PRIORITIES,
  PROPERTY_TYPES,
  REQUIREMENT_STATUSES,
  SOURCES,
  STRICT_FIELD_OPTIONS,
  TAGS,
  TENURE_PREFS,
  TENURES,
  TIMELINES,
  clamp
} from './taxonomy.js';

const keys = (arr) => arr.map((x) => x.key);
const TYPE_KEYS = keys(PROPERTY_TYPES);
const TAG_KEYS = keys(TAGS);
const AREA_KEYS = keys(AREAS);
const STRICT_KEYS = keys(STRICT_FIELD_OPTIONS);

export const DEFAULT_FINANCE = {dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30};

function str(v, max = 500) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,\s]/g, '').replace(/^RM/i, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function num(v, {min = -Infinity, max = Infinity, integer = false, field, fields, label} = {}) {
  if (v == null || v === '') return null;
  const n = toNum(v);
  if (n == null || (integer && !Number.isInteger(n)) || n < min || n > max) {
    if (fields && field) fields[field] = label || '数值不正确';
    return null;
  }
  return integer ? Math.round(n) : n;
}

function bool(v, fallback = false) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function enumVal(v, allowed, fallback = null) {
  const s = str(v, 40);
  return s && allowed.includes(s) ? s : fallback;
}

function listOf(v, allowed, {field, fields, label, max = 12} = {}) {
  if (v == null) return [];
  const raw = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const item of raw) {
    const s = str(item, 60);
    if (!s) continue;
    if (allowed && !allowed.includes(s)) {
      if (fields && field) fields[field] = label || '选项无效';
      continue;
    }
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, max);
}

function dateStr(v, {field, fields, label} = {}) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    if (fields && field) fields[field] = label || '日期格式应为 YYYY-MM-DD';
    return null;
  }
  return s;
}

function photoUrl(v) {
  const s = str(v, 500);
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || /^\/[A-Za-z0-9._\-\/]*$/.test(s)) return s;
  return null;
}

function photoList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    const url = photoUrl(item);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= 8) break;
  }
  return out;
}

function money(v, {min = 0, max = 1e9, field, fields, label} = {}) {
  const n = num(v, {min, max, field, fields, label});
  return n == null ? null : Math.round(n * 100) / 100;
}

export function normalizeListingInput(body = {}) {
  const fields = {};
  const intent = enumVal(body.intent, keys(LISTING_INTENTS));
  if (!intent) fields.intent = '请选择出售或出租';
  const title = str(body.title, 120);
  if (!title) fields.title = '请填写房源名称';
  const type = enumVal(body.type, TYPE_KEYS);
  if (!type) fields.type = '请选择房型';
  const area = str(body.area, 80);
  if (!area) fields.area = '请填写区域';

  const status = enumVal(body.status, keys(LISTING_STATUSES), 'available');
  const price = money(body.price, {
    min: intent === 'rent' ? 100 : 10000,
    max: intent === 'rent' ? 1000000 : 500000000,
    field: 'price',
    fields,
    label: intent === 'rent' ? '月租需在 RM100–1,000,000' : '售价需在 RM10,000–500,000,000'
  });
  if (price == null && !fields.price) fields.price = '请填写价格';

  const lat = num(body.lat, {min: -90, max: 90, field: 'lat', fields});
  const lng = num(body.lng, {min: -180, max: 180, field: 'lng', fields});
  const yearNow = new Date().getFullYear();

  const value = {
    intent,
    title,
    title_en: str(body.title_en, 120),
    type,
    status,
    price,
    negotiable: bool(body.negotiable),
    area,
    address: str(body.address, 240),
    city: str(body.city, 80) || 'Johor Bahru',
    lat,
    lng,
    beds: num(body.beds, {min: 0, max: 30, integer: true, field: 'beds', fields}),
    baths: num(body.baths, {min: 0, max: 30, integer: true, field: 'baths', fields}),
    built_up: num(body.built_up, {min: 0, max: 200000, integer: true, field: 'built_up', fields}),
    land_area: num(body.land_area, {min: 0, max: 2000000, integer: true, field: 'land_area', fields}),
    storeys: num(body.storeys, {min: 0, max: 60, integer: true, field: 'storeys', fields}),
    tenure: enumVal(body.tenure, keys(TENURES)),
    year_built: num(body.year_built, {
      min: 1900,
      max: yearNow + 3,
      integer: true,
      field: 'year_built',
      fields
    }),
    furnishing: enumVal(body.furnishing, keys(FURNISHINGS)),
    condition: enumVal(body.condition, keys(CONDITIONS), 'good'),
    carparks: num(body.carparks, {min: 0, max: 30, integer: true, field: 'carparks', fields}),
    floor_level: str(body.floor_level, 30),
    tags: listOf(body.tags, TAG_KEYS, {field: 'tags', fields}),
    photo: photoUrl(body.photo),
    photos: photoList(body.photos),
    seller_name: str(body.seller_name, 80),
    seller_phone: str(body.seller_phone, 40),
    mandate: enumVal(body.mandate, ['exclusive', 'open', 'cobroke'], 'open'),
    mandate_expiry: dateStr(body.mandate_expiry, {field: 'mandate_expiry', fields}),
    commission_pct: num(body.commission_pct, {min: 0, max: 20, field: 'commission_pct', fields}),
    available_from: dateStr(body.available_from, {field: 'available_from', fields}),
    notes: str(body.notes, 2000)
  };

  if (Object.keys(fields).length) throw badRequest('validation', '请检查房源资料', fields);
  return value;
}

export function normalizeRequirementInput(body = {}) {
  const fields = {};
  const clientName = str(body.client_name, 80);
  if (!clientName) fields.client_name = '请填写客户称呼';
  const intent = enumVal(body.intent, ['buy', 'rent']);
  if (!intent) fields.intent = '请选择买或租';

  const budgetMax = money(body.budget_max, {min: 1, max: 500000000, field: 'budget_max', fields, label: '请填写预算上限'});
  if (budgetMax == null && !fields.budget_max) fields.budget_max = '请填写预算上限';
  let budgetMin = money(body.budget_min, {min: 0, max: 500000000, field: 'budget_min', fields});
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
    fields.budget_min = '预算下限不能高于上限';
  }

  const areas = Array.isArray(body.areas) ? body.areas : [];
  const areaList = [];
  for (const raw of areas) {
    const s = str(raw, 80);
    if (!s) continue;
    if (!areaList.includes(s)) areaList.push(s);
  }
  if (areaList.length > 8) areaList.length = 8;

  const types = listOf(body.types, TYPE_KEYS, {field: 'types', fields});
  const financeRaw = body.finance && typeof body.finance === 'object' ? body.finance : {};
  const finance = {
    income: money(financeRaw.income, {min: 0, max: 10000000, field: 'finance.income', fields}),
    commitments: money(financeRaw.commitments, {min: 0, max: 10000000, field: 'finance.commitments', fields}),
    cash: money(financeRaw.cash, {min: 0, max: 100000000, field: 'finance.cash', fields}),
    dsr: num(financeRaw.dsr, {min: 1, max: 100, field: 'finance.dsr', fields}) ?? DEFAULT_FINANCE.dsr,
    rate: num(financeRaw.rate, {min: 0, max: 30, field: 'finance.rate', fields}) ?? DEFAULT_FINANCE.rate,
    years: num(financeRaw.years, {min: 1, max: 50, integer: true, field: 'finance.years', fields}) ?? DEFAULT_FINANCE.years,
    margin: num(financeRaw.margin, {min: 1, max: 100, field: 'finance.margin', fields}) ?? DEFAULT_FINANCE.margin,
    rent_ratio: num(financeRaw.rent_ratio, {min: 1, max: 100, field: 'finance.rent_ratio', fields}) ?? DEFAULT_FINANCE.rent_ratio
  };

  const value = {
    client_name: clientName,
    phone: str(body.phone, 40),
    whatsapp: str(body.whatsapp, 40),
    email: str(body.email, 160),
    intent,
    purpose: enumVal(body.purpose, ['own', 'invest'], 'own'),
    budget_min: budgetMin,
    budget_max: budgetMax,
    stretch_pct: clamp(num(body.stretch_pct, {min: 0, max: 30, field: 'stretch_pct', fields}) ?? 10, 0, 30),
    areas: areaList,
    types,
    beds_min: num(body.beds_min, {min: 0, max: 30, integer: true, field: 'beds_min', fields}),
    baths_min: num(body.baths_min, {min: 0, max: 30, integer: true, field: 'baths_min', fields}),
    built_up_min: num(body.built_up_min, {min: 0, max: 200000, integer: true, field: 'built_up_min', fields}),
    tenure_pref: enumVal(body.tenure_pref, keys(TENURE_PREFS), 'any'),
    furnishing_min: enumVal(body.furnishing_min, keys(FURNISHING_PREFS), 'any'),
    condition_pref: enumVal(body.condition_pref, keys(CONDITION_PREFS), 'any'),
    carparks_min: num(body.carparks_min, {min: 0, max: 30, integer: true, field: 'carparks_min', fields}),
    max_age_years: num(body.max_age_years, {min: 0, max: 120, integer: true, field: 'max_age_years', fields}),
    must_tags: listOf(body.must_tags, TAG_KEYS, {field: 'must_tags', fields}),
    pref_tags: listOf(body.pref_tags, TAG_KEYS, {field: 'pref_tags', fields}),
    avoid_tags: listOf(body.avoid_tags, TAG_KEYS, {field: 'avoid_tags', fields}),
    strict_fields: listOf(body.strict_fields, STRICT_KEYS, {field: 'strict_fields', fields, max: 10}),
    timeline: enumVal(body.timeline, keys(TIMELINES), '1_3m'),
    priority: enumVal(body.priority, keys(PRIORITIES), 'balanced'),
    source: enumVal(body.source, keys(SOURCES), 'whatsapp'),
    status: enumVal(body.status, keys(REQUIREMENT_STATUSES), 'active'),
    notes: str(body.notes, 2000),
    follow_up: dateStr(body.follow_up, {field: 'follow_up', fields}),
    finance
  };
  if (!value.strict_fields.includes('tenure') && body.strict_fields == null) {
    value.strict_fields = ['tenure'];
  }
  // 邮箱若填写则校验
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) {
    fields.email = '邮箱格式不正确';
  }
  if (Object.keys(fields).length) throw badRequest('validation', '请检查客户需求', fields);
  return value;
}

export function normalizeActionInput(body = {}) {
  const status = enumVal(body.status, keys(ACTION_STATUSES));
  if (!status) throw badRequest('validation', '请选择跟进状态', {status: '状态无效'});
  return {
    status,
    note: str(body.note, 1000)
  };
}

export {str, toNum, dateStr};
