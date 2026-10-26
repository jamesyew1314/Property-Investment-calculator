// format.js — 数字/日期/标签/原因文案的本地化（浏览器与测试共用，无 DOM 依赖）

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const attr = esc;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function fmtMoney(value, lang = 'zh', decimals = 0) {
  if (!isNum(Number(value)) || value == null || value === '') return '—';
  const n = Number(value);
  const body = Math.abs(n).toLocaleString('en-MY', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${n < 0 ? '−' : ''}RM ${body}`;
}

export function fmtNum(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-MY');
}

export function fmtPct(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(digits).replace(/\.0$/, '')}%`;
}

export function fmtDate(value, lang = 'zh') {
  if (!value) return '—';
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, day] = String(value).split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return String(value);
  if (lang === 'en') {
    return d.toLocaleDateString('en-MY', {day: '2-digit', month: 'short', year: 'numeric'});
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtDateShort(value, lang = 'zh') {
  if (!value) return '—';
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, day] = String(value).split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return String(value);
  return lang === 'en'
    ? d.toLocaleDateString('en-MY', {day: '2-digit', month: 'short'})
    : `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function daysAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

export function timeAgo(iso, ctx) {
  const d = daysAgo(iso);
  if (d == null) return '';
  if (d === 0) return ctx.t('days.justNow');
  return ctx.t('days.ago', {n: d});
}

export function daysLabel(days, ctx) {
  if (days == null) return '';
  if (days < 0) return ctx.t('days.overdue', {n: Math.abs(days)});
  if (days === 0) return ctx.t('days.today');
  return ctx.t('days.future', {n: days});
}

export function initials(name) {
  const raw = String(name || '?')
    .replace(/\b(Mr|Ms|Mrs|Mdm|Dr|Dato'?|Datin|Encik|Puan|Hj|Hjh)\.?\b/gi, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  const cjk = raw.match(/[\u4e00-\u9fa5]/);
  if (cjk) return cjk[0];
  const parts = raw.split(/[\s·•,]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length > 1) return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
}

function norm(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[\s,._\-\/]+/g, '');
}

export function labelOf(list, key, lang = 'zh') {
  const row = (list || []).find((x) => x && x.key === key);
  return row ? row[lang] || row.zh || key : key || '';
}

export function areaLabel(value, ctx) {
  if (!value) return '—';
  const areas = ctx.meta?.areas || [];
  const n = norm(value);
  const found = areas.find(
    (a) => norm(a.key) === n || norm(a.zh) === n || norm(a.en) === n || norm(a.zh).includes(n) || norm(a.en).includes(n)
  );
  return found ? found[ctx.lang] || found.zh : String(value);
}

export function typeLabel(key, ctx) {
  return labelOf(ctx.meta?.property_types, key, ctx.lang) || key || '—';
}

export function tenureLabel(key, ctx) {
  return labelOf(ctx.meta?.tenures, key, ctx.lang) || key || '—';
}

export function furnishingLabel(key, ctx) {
  return labelOf(ctx.meta?.furnishings, key, ctx.lang) || key || '—';
}

export function conditionLabel(key, ctx) {
  return labelOf(ctx.meta?.conditions, key, ctx.lang) || key || '—';
}

export function statusLabel(key, ctx, kind = 'listing') {
  const list =
    kind === 'requirement'
      ? ctx.meta?.requirement_statuses
      : kind === 'action'
        ? ctx.meta?.action_statuses
        : ctx.meta?.listing_statuses;
  return labelOf(list, key, ctx.lang) || key || '—';
}

export function tagLabel(key, ctx) {
  return labelOf(ctx.meta?.tags, key, ctx.lang) || key || '';
}

export function tagsLabel(keys, ctx) {
  return (keys || []).map((k) => tagLabel(k, ctx)).filter(Boolean).join(ctx.lang === 'en' ? ', ' : '、');
}

export function intentLabel(intent, ctx) {
  if (intent === 'buy') return ctx.t('req.buy');
  if (intent === 'rent') return ctx.t('req.rent');
  if (intent === 'sale') return ctx.t('lst.buy');
  return intent || '';
}

export function fieldLabel(field, ctx) {
  const map = {
    beds: 'form.f.beds',
    baths: 'form.f.baths',
    built_up: 'form.f.builtUp',
    tenure: 'form.f.tenure',
    furnishing: 'form.f.furnishing',
    condition: 'form.f.condition',
    carparks: 'form.f.carparks',
    year_built: 'form.f.yearBuilt'
  };
  return map[field] ? ctx.t(map[field]) : field;
}

function fmtParam(key, value, code, ctx) {
  if (value == null) return '—';
  const lang = ctx.lang;
  if (Array.isArray(value)) {
    if (key === 'tags' || key === 'missing') return tagsLabel(value, ctx);
    if (key === 'areas') return value.map((v) => areaLabel(v, ctx)).join(lang === 'en' ? ', ' : '、');
    if (key === 'types') return value.map((v) => typeLabel(v, ctx)).join(lang === 'en' ? ', ' : '、');
    return value.map((v) => fmtParam(key, v, code, ctx)).join(lang === 'en' ? ', ' : '、');
  }
  if (key === 'pct' || key === 'stretch') return fmtNum(Math.round(Number(value) * 10) / 10);
  if (key === 'km') return fmtNum(value);
  if (key === 'date') return fmtDate(value, lang);
  if (key === 'days') return fmtNum(value);
  if (key === 'field') return fieldLabel(value, ctx);
  if (key === 'area') return areaLabel(value, ctx);
  if (key === 'target' || key === 'target_en') return areaLabel(value, ctx);
  if (key === 'status') return statusLabel(value, ctx);
  if (key === 'type') return typeLabel(value, ctx);
  if (key === 'types') return typeLabel(value, ctx);
  if (key === 'tenure') return tenureLabel(value, ctx);
  if (key === 'pref' && code.includes('tenure')) return tenureLabel(value, ctx);
  if (key === 'pref' && code.includes('furnishing')) return furnishingLabel(value, ctx);
  if (key === 'pref' && code.includes('condition')) return conditionLabel(value, ctx);
  if (key === 'level' || (key === 'min' && code.includes('furnishing'))) return furnishingLabel(value, ctx);
  if (key === 'condition') return conditionLabel(value, ctx);
  if (key === 'listing' || key === 'req') return intentLabel(value, ctx);
  if (key === 'tags' || key === 'missing') return tagsLabel(value, ctx);
  if (['price', 'max', 'over', 'gap', 'headroom', 'amount'].includes(key) && isNum(Number(value))) {
    return fmtMoney(value, lang);
  }
  if (isNum(Number(value))) return fmtNum(value);
  return String(value);
}

export function localizeParams(code, params = {}, ctx) {
  const raw = {...(params || {})};
  if (raw.target_en && ctx.lang === 'en') raw.target = raw.target_en;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'target_en') continue;
    out[key] = fmtParam(key, value, code, ctx);
  }
  return out;
}

export function noteText(note, ctx) {
  if (!note) return '';
  return ctx.t(`note.${note.code}`, localizeParams(note.code, note.params, ctx));
}

export function failureText(failure, ctx) {
  if (!failure) return '';
  return ctx.t(`failure.${failure.code}`, localizeParams(failure.code, failure.params, ctx));
}

export function penaltyText(penalty, ctx) {
  if (!penalty) return '';
  return ctx.t(`note.${penalty.code}`, {});
}

export function missingText(code, ctx) {
  return ctx.t(`missing.${code}`);
}

export function priceText(listing, ctx) {
  if (!listing) return '—';
  const money = fmtMoney(listing.price, ctx.lang);
  return listing.intent === 'rent' ? `${money}${ctx.t('common.perMonth')}` : money;
}

export function budgetText(req, ctx) {
  if (!req) return '—';
  const max = req.budget_max != null ? fmtMoney(req.budget_max, ctx.lang) : '—';
  const min = req.budget_min != null ? fmtMoney(req.budget_min, ctx.lang) : null;
  const suffix = req.intent === 'rent' ? ctx.t('common.perMonth') : '';
  if (min) return ctx.t('req.budgetRange', {min, max}) + suffix;
  return ctx.t('req.budgetFrom', {max}) + suffix;
}

export function listingTitle(listing, lang) {
  if (!listing) return '';
  if (lang === 'en' && listing.title_en) return listing.title_en;
  return listing.title || listing.title_en || '';
}

export function listingSpecs(listing, ctx) {
  const bits = [];
  if (listing.type) bits.push(typeLabel(listing.type, ctx));
  if (listing.beds != null) bits.push(ctx.t('lst.beds', {n: listing.beds}));
  if (listing.baths != null) bits.push(ctx.t('lst.baths', {n: listing.baths}));
  if (listing.built_up != null) bits.push(ctx.t('lst.builtUp', {n: fmtNum(listing.built_up)}));
  if (listing.tenure) bits.push(tenureLabel(listing.tenure, ctx));
  if (listing.furnishing) bits.push(furnishingLabel(listing.furnishing, ctx));
  return bits;
}

export function scoreTone(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'poor';
}

export function scoreLabel(score, ctx) {
  return ctx.t(`score.${scoreTone(score)}`);
}

export function scoreGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export function phoneDigits(phone) {
  let d = String(phone || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `6${d}`;
  return d;
}

export function waLink(phone, text) {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function whatsappMessage(pair, ctx) {
  const {requirement: req, listing, match, user} = pair;
  const lang = ctx.lang;
  const colon = lang === 'en' ? ': ' : '：';
  const sep = lang === 'en' ? '; ' : '；';
  const title = listingTitle(listing, lang);
  const specs = [];
  if (listing.type) specs.push(typeLabel(listing.type, ctx));
  if (listing.beds != null) specs.push(ctx.t('lst.beds', {n: listing.beds}));
  if (listing.baths != null) specs.push(ctx.t('lst.baths', {n: listing.baths}));
  if (listing.built_up != null) specs.push(ctx.t('lst.builtUp', {n: fmtNum(listing.built_up)}));
  if (listing.tenure) specs.push(tenureLabel(listing.tenure, ctx));
  const reasons = (match?.highlights || []).slice(0, 3).map((n) => noteText(n, ctx)).filter(Boolean);
  const concerns = (match?.concerns || []).slice(0, 2).map((n) => noteText(n, ctx)).filter(Boolean);
  const lines = [
    ctx.t('msg.greeting', {name: req.client_name, agent: user.name || ''}),
    ctx.t('msg.intro'),
    `🏠 ${title}`,
    `💰 ${priceText(listing, ctx)}`,
    `📍 ${areaLabel(listing.area, ctx)}${specs.length ? ' · ' + specs.join(' · ') : ''}`
  ];
  if (reasons.length) lines.push(`✅ ${ctx.t('msg.reasons')}${colon}${reasons.join(sep)}`);
  if (concerns.length) lines.push(`⚠️ ${ctx.t('msg.concerns')}${colon}${concerns.join(sep)}`);
  if (listing.address) lines.push(`🗺️ ${listing.address}`);
  lines.push(ctx.t('msg.cta'));
  const sig = [user.company, user.ren ? `REN ${user.ren}` : null, user.phone]
    .filter(Boolean)
    .join(' · ');
  if (sig) lines.push(sig);
  lines.push(ctx.t('msg.disclaimer'));
  return lines.join('\n');
}

export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDaysISO(days) {
  const d = new Date(Date.now() + days * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function firstPhoto(listing) {
  if (!listing) return null;
  if (Array.isArray(listing.photos) && listing.photos.length) return listing.photos[0];
  return listing.photo || null;
}
