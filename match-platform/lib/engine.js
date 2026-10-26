// engine.js — 可解释的房源 × 客户需求配对引擎
//
// 三道关：
//   1) 硬门槛（intent / 房源状态 / 房型 / 区域 / 超预算上限 / 客户避雷标签 / 勾选为严格的字段）
//   2) 六维加权评分（预算 25、地段 20、空间 20、条件 15、配套 15、时机 5；可按客户优先级切换档案）
//   3) 资料完整度（confidence）与「近似匹配」——差一点点的房源不会被藏起来，而是带着原因展示
//
// 每个评分维度都返回 notes（原因代码 + 参数），前端用 i18n 翻译成中英文；
// 这样算法可测试、可解释，也不会把文案写死在引擎里。

import {
  CONDITIONS,
  DEFAULT_STRETCH,
  FURNISHINGS,
  TIMELINES,
  TAGS,
  WEIGHTS,
  clamp,
  clusterOf,
  distanceKm,
  findArea,
  norm
} from './taxonomy.js';
import {
  affordability,
  entryCost,
  instalment,
  monthlyInstalmentForPrice,
  pricePerSqft,
  rentAffordability,
  rentUpfront,
  round2
} from './finance.js';

const INTENT_MAP = {buy: 'sale', rent: 'rent'};
const round1 = (x) => Math.round(Number(x) * 10) / 10;
const round3 = (x) => Math.round(Number(x) * 1000) / 1000;
const asNum = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function dateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T00:00:00`);
  const b = Date.parse(`${toDate}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function listingIntentFor(reqIntent) {
  return INTENT_MAP[reqIntent] || reqIntent;
}

export function prepareRequirement(raw = {}) {
  const f = raw.finance || {};
  return {
    ...raw,
    intent: raw.intent === 'rent' ? 'rent' : 'buy',
    budget_min: asNum(raw.budget_min),
    budget_max: asNum(raw.budget_max),
    stretch_pct: raw.stretch_pct == null ? DEFAULT_STRETCH * 100 : Number(raw.stretch_pct),
    areas: Array.isArray(raw.areas) ? raw.areas.filter(Boolean) : [],
    types: Array.isArray(raw.types) ? raw.types.filter(Boolean) : [],
    beds_min: asNum(raw.beds_min),
    baths_min: asNum(raw.baths_min),
    built_up_min: asNum(raw.built_up_min),
    carparks_min: asNum(raw.carparks_min),
    max_age_years: asNum(raw.max_age_years),
    must_tags: Array.isArray(raw.must_tags) ? raw.must_tags : [],
    pref_tags: Array.isArray(raw.pref_tags) ? raw.pref_tags : [],
    avoid_tags: Array.isArray(raw.avoid_tags) ? raw.avoid_tags : [],
    strict_fields: Array.isArray(raw.strict_fields) ? raw.strict_fields : ['tenure'],
    priority: WEIGHTS[raw.priority] ? raw.priority : 'balanced',
    tenure_pref: raw.tenure_pref || 'any',
    furnishing_min: raw.furnishing_min || 'any',
    condition_pref: raw.condition_pref || 'any',
    timeline: TIMELINES.some((t) => t.key === raw.timeline) ? raw.timeline : '1_3m',
    finance: {
      income: asNum(f.income),
      commitments: asNum(f.commitments) ?? 0,
      cash: asNum(f.cash),
      dsr: asNum(f.dsr) ?? 65,
      rate: asNum(f.rate) ?? 4.3,
      years: asNum(f.years) ?? 30,
      margin: asNum(f.margin) ?? 90,
      rent_ratio: asNum(f.rent_ratio) ?? 30
    }
  };
}

export function prepareListing(raw = {}) {
  return {
    ...raw,
    intent: raw.intent === 'rent' ? 'rent' : 'sale',
    price: asNum(raw.price) ?? 0,
    status: raw.status || 'available',
    area: raw.area || '',
    type: raw.type || '',
    beds: asNum(raw.beds),
    baths: asNum(raw.baths),
    built_up: asNum(raw.built_up),
    carparks: asNum(raw.carparks),
    year_built: asNum(raw.year_built),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    negotiable: !!raw.negotiable,
    strict_fields: []
  };
}

function pushNote(dim, code, params = {}, tone = 'neutral') {
  dim.notes.push({code, params, tone});
}

function fail(failures, code, params = {}) {
  failures.push({code, params});
}

function areaEquals(a, b) {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const fa = findArea(a);
  const fb = findArea(b);
  return !!(fa && fb && fa.key === fb.key);
}

function listingMatchesArea(listing, reqAreas) {
  if (!reqAreas.length) return {exact: true, nearby: null};
  if (reqAreas.some((a) => areaEquals(a, listing.area))) return {exact: true, nearby: null};
  const la = findArea(listing.area);
  const lCluster = la ? la.cluster : clusterOf(listing.area);
  if (!la || lCluster === 'other') return {exact: false, nearby: null};
  let best = null;
  for (const raw of reqAreas) {
    const ra = findArea(raw);
    if (!ra || ra.cluster !== lCluster) continue;
    const km = distanceKm(ra, la);
    if (!best || (km != null && (best.km == null || km < best.km))) best = {area: ra, km};
  }
  return {exact: false, nearby: best};
}

function tenureLabel(key) {
  return key || '';
}
function furnishingRank(key) {
  const f = FURNISHINGS.find((x) => x.key === key);
  return f ? f.rank : null;
}
function conditionRank(key) {
  const c = CONDITIONS.find((x) => x.key === key);
  return c ? c.rank : null;
}
function tagLabel(key) {
  const t = TAGS.find((x) => x.key === key);
  return t ? t : null;
}

export function requirementAffordability(reqRaw) {
  const req = reqRaw && reqRaw.finance ? reqRaw : prepareRequirement(reqRaw);
  const f = req.finance;
  if (!f.income) return null;
  if (req.intent === 'rent') {
    const aff = rentAffordability({income: f.income, ratio: f.rent_ratio});
    return {...aff, kind: 'rent'};
  }
  const aff = affordability({
    income: f.income,
    commitments: f.commitments,
    dsr: f.dsr,
    rate: f.rate,
    years: f.years,
    margin: f.margin,
    cash: f.cash
  });
  if (!aff) return null;
  const monthlyForBudget = monthlyInstalmentForPrice(
    req.budget_max || 0,
    f.margin,
    f.rate,
    f.years
  );
  return {
    ...aff,
    kind: 'buy',
    monthlyForBudget: round2(monthlyForBudget),
    budgetDsrPct: f.income ? round1((monthlyForBudget / f.income) * 100) : null
  };
}

function scoreBudget(req, listing, dim, failures) {
  const p = listing.price;
  const max = req.budget_max;
  const min = req.budget_min;
  if (max == null) {
    dim.score = 0.65;
    pushNote(dim, 'budget.no_limit', {}, 'neutral');
    return;
  }
  if (p <= max) {
    if (min != null && p < min) {
      const ratio = p / min;
      dim.score = clamp(0.55 + 0.45 * ratio, 0.55, 1);
      pushNote(
        dim,
        'budget.below_min',
        {price: p, min, gap: round2(min - p), pct: round1((1 - ratio) * 100)},
        'neutral'
      );
    } else if (max - p <= max * 0.005) {
      dim.score = 1;
      pushNote(dim, 'budget.at_limit', {max}, 'negative');
    } else {
      dim.score = 1;
      pushNote(
        dim,
        'budget.within',
        {price: p, max, headroom: round2(max - p), pct: round1(((max - p) / max) * 100)},
        'positive'
      );
    }
    if (listing.negotiable) {
      dim.score = Math.min(1, dim.score + 0.03);
      pushNote(dim, 'budget.negotiable', {}, 'positive');
    }
  } else {
    const over = (p - max) / max;
    const stretch = Math.max(0.001, req.stretch_pct / 100);
    if (over <= stretch) {
      // 超预算越接近可议价上限，扣分越快（0% → 1；10% → 0.1）
      dim.score = clamp(1 - 0.9 * Math.pow(over / stretch, 0.65), 0.08, 1);
      pushNote(
        dim,
        'budget.stretch',
        {
          price: p,
          max,
          over: round2(p - max),
          pct: round1(over * 100),
          stretch: round1(stretch * 100)
        },
        'negative'
      );
    } else {
      dim.score = 0.02;
      fail(failures, 'gate.budget', {
        price: p,
        max,
        over: round2(p - max),
        pct: round1(over * 100)
      });
      pushNote(
        dim,
        'budget.over_gate',
        {price: p, max, over: round2(p - max), pct: round1(over * 100)},
        'negative'
      );
    }
  }
}

function scoreLocation(req, listing, dim, failures) {
  if (!req.areas.length) {
    dim.score = 0.7;
    pushNote(dim, 'location.no_pref', {}, 'neutral');
    return;
  }
  const check = listingMatchesArea(listing, req.areas);
  if (check.exact) {
    dim.score = 1;
    pushNote(dim, 'location.exact', {area: listing.area}, 'positive');
    return;
  }
  if (check.nearby) {
    dim.score = 0.65;
    const km = check.nearby.km == null ? null : round1(check.nearby.km);
    pushNote(
      dim,
      km == null ? 'location.nearby_no_km' : 'location.nearby',
      {
        area: listing.area,
        target: check.nearby.area.zh,
        target_en: check.nearby.area.en,
        km
      },
      'neutral'
    );
    return;
  }
  dim.score = 0.02;
  fail(failures, 'gate.area', {area: listing.area, areas: req.areas});
  pushNote(dim, 'location.off', {area: listing.area, areas: req.areas}, 'negative');
}

function scoreSpace(req, listing, dim, failures) {
  const parts = [];
  const add = (key, value, min, weight) => {
    if (value == null) {
      pushNote(dim, 'space.unknown', {field: key}, 'neutral');
      dim.missing.push(`listing.${key}`);
      parts.push({weight, score: 0.55});
      return;
    }
    const ok = value >= min;
    const score = ok ? 1 : Math.max(0.2, 0.9 * (value / min));
    if (!ok && req.strict_fields.includes(key)) {
      fail(failures, `gate.${key}`, {value, min});
    }
    pushNote(dim, ok ? `space.${key}` : `space.${key}_short`, {value, min, diff: ok ? value - min : min - value}, ok ? 'positive' : 'negative');
    parts.push({weight, score});
  };

  if (req.beds_min != null) add('beds', listing.beds, req.beds_min, 0.45);
  if (req.baths_min != null) add('baths', listing.baths, req.baths_min, 0.3);
  if (req.built_up_min != null) add('built_up', listing.built_up, req.built_up_min, 0.25);

  if (!parts.length) {
    dim.score = 0.7;
    pushNote(dim, 'space.no_pref', {}, 'neutral');
    return;
  }
  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  dim.score = clamp(parts.reduce((s, p) => s + p.weight * p.score, 0) / totalW, 0, 1);
}

function scoreFit(req, listing, dim, failures) {
  const parts = [];
  const add = (score, noteCode, params, tone) => {
    parts.push(score);
    if (noteCode) pushNote(dim, noteCode, params, tone);
  };

  if (req.tenure_pref !== 'any') {
    if (!listing.tenure) {
      dim.missing.push('listing.tenure');
      add(0.55, 'fit.tenure_unknown', {pref: req.tenure_pref}, 'neutral');
    } else if (listing.tenure === req.tenure_pref) {
      add(1, 'fit.tenure_match', {tenure: tenureLabel(listing.tenure)}, 'positive');
    } else {
      add(0.1, 'fit.tenure_miss', {tenure: listing.tenure, pref: req.tenure_pref}, 'negative');
      if (req.strict_fields.includes('tenure')) {
        fail(failures, 'gate.tenure', {tenure: listing.tenure, pref: req.tenure_pref});
      }
    }
  } else if (listing.tenure === 'freehold') {
    pushNote(dim, 'fit.freehold', {}, 'positive');
  }

  if (req.furnishing_min !== 'any') {
    const rv = furnishingRank(listing.furnishing);
    const rm = furnishingRank(req.furnishing_min);
    if (rv == null) {
      dim.missing.push('listing.furnishing');
      add(0.55, 'fit.furnishing_unknown', {pref: req.furnishing_min}, 'neutral');
    } else if (rv >= rm) {
      add(1, 'fit.furnishing', {level: listing.furnishing}, 'positive');
    } else {
      add(Math.max(0.2, (0.6 * rv) / Math.max(1, rm)), 'fit.furnishing_short', {level: listing.furnishing, min: req.furnishing_min}, 'negative');
      if (req.strict_fields.includes('furnishing')) {
        fail(failures, 'gate.furnishing', {level: listing.furnishing, min: req.furnishing_min});
      }
    }
  }

  if (req.condition_pref !== 'any') {
    const cv = conditionRank(listing.condition);
    const cp = conditionRank(req.condition_pref);
    if (cv == null) {
      dim.missing.push('listing.condition');
      add(0.55, 'fit.condition_unknown', {pref: req.condition_pref}, 'neutral');
    } else if (cv >= cp) {
      add(1, 'fit.condition', {condition: listing.condition}, 'positive');
    } else {
      add(0.45, 'fit.condition_short', {condition: listing.condition, pref: req.condition_pref}, 'negative');
    }
  }

  if (req.carparks_min != null) {
    if (listing.carparks == null) {
      dim.missing.push('listing.carparks');
      add(0.55, 'fit.carparks_unknown', {min: req.carparks_min}, 'neutral');
    } else if (listing.carparks >= req.carparks_min) {
      add(1, 'fit.carparks', {value: listing.carparks, min: req.carparks_min}, 'positive');
    } else {
      add(0.4, 'fit.carparks_short', {value: listing.carparks, min: req.carparks_min}, 'negative');
    }
  }

  if (req.max_age_years != null) {
    const yearNow = new Date().getFullYear();
    if (!listing.year_built) {
      dim.missing.push('listing.year_built');
      add(0.55, 'fit.age_unknown', {max: req.max_age_years}, 'neutral');
    } else {
      const age = Math.max(0, yearNow - listing.year_built);
      if (age <= req.max_age_years) {
        add(1, 'fit.age', {age, max: req.max_age_years}, 'positive');
      } else {
        add(0.45, 'fit.age_short', {age, max: req.max_age_years}, 'negative');
      }
    }
  }

  if (!parts.length) {
    dim.score = 0.75;
    pushNote(dim, 'fit.none', {}, 'neutral');
    return;
  }
  dim.score = clamp(parts.reduce((a, b) => a + b, 0) / parts.length, 0, 1);
}

function scoreAmenities(req, listing, dim, failures) {
  const tags = new Set(listing.tags || []);
  const must = req.must_tags || [];
  const pref = req.pref_tags || [];
  const avoid = req.avoid_tags || [];
  const hitMust = must.filter((t) => tags.has(t));
  const missingMust = must.filter((t) => !tags.has(t));
  const hitPref = pref.filter((t) => tags.has(t));
  const avoidHit = avoid.filter((t) => tags.has(t));

  if (avoidHit.length) {
    dim.score = 0.02;
    fail(failures, 'gate.avoid', {tags: avoidHit});
    pushNote(dim, 'amenities.avoid_hit', {tags: avoidHit}, 'negative');
    return;
  }
  if (!must.length && !pref.length) {
    dim.score = 0.7;
    pushNote(dim, 'amenities.none', {}, 'neutral');
    return;
  }

  const mustScore = must.length ? hitMust.length / must.length : null;
  const prefScore = pref.length ? hitPref.length / pref.length : null;
  if (mustScore != null && prefScore != null) dim.score = 0.75 * mustScore + 0.25 * prefScore;
  else dim.score = mustScore != null ? mustScore : prefScore;

  if (must.length) {
    pushNote(
      dim,
      'amenities.must',
      {hit: hitMust.length, total: must.length, tags: hitMust},
      hitMust.length === must.length ? 'positive' : 'neutral'
    );
  }
  if (missingMust.length) {
    pushNote(dim, 'amenities.must_missing', {missing: missingMust}, 'negative');
    dim.missing.push('listing.must_tags');
    if (req.strict_fields.includes('tags')) {
      fail(failures, 'gate.tags', {missing: missingMust});
    }
  }
  if (pref.length && hitPref.length) {
    pushNote(dim, 'amenities.pref', {hit: hitPref.length, total: pref.length, tags: hitPref}, 'positive');
  }
}

function scoreReadiness(req, listing, dim, today, now) {
  let availScore = 1;
  if (listing.available_from && listing.available_from > today) {
    const days = daysBetween(today, listing.available_from);
    if (days <= 30) availScore = 0.7;
    else if (days <= 60) availScore = 0.45;
    else availScore = 0.25;
    pushNote(dim, 'readiness.future', {date: listing.available_from, days}, 'negative');
  } else {
    pushNote(dim, 'readiness.available', {}, 'positive');
  }

  let freshScore = 0.5;
  if (listing.updated_at) {
    const days = Math.max(0, Math.round((now - Date.parse(listing.updated_at)) / 86400000));
    if (days <= 14) freshScore = 1;
    else if (days <= 45) freshScore = 0.8;
    else if (days <= 120) freshScore = 0.6;
    else freshScore = 0.4;
    pushNote(dim, days <= 14 ? 'readiness.fresh' : 'readiness.stale', {days}, days <= 14 ? 'positive' : 'neutral');
  }

  const tl = TIMELINES.find((t) => t.key === req.timeline) || TIMELINES[1];
  let timelineScore = 0.8;
  if (tl.key === 'urgent') timelineScore = availScore === 1 ? 1 : 0.5;
  else if (tl.key === '1_3m') timelineScore = 0.9;
  else if (tl.key === '3_6m') timelineScore = 0.8;
  else timelineScore = 0.65;

  let score = 0.5 * availScore + 0.3 * freshScore + 0.2 * timelineScore;
  if (listing.mandate_expiry && listing.mandate_expiry < today) {
    score = Math.max(0, score - 0.1);
    pushNote(dim, 'readiness.mandate_expired', {date: listing.mandate_expiry}, 'negative');
  }
  dim.score = clamp(score, 0, 1);
}

function emptyDimension(key, weight) {
  return {key, weight, score: 0, points: 0, notes: [], missing: []};
}

export function confidenceOf(req, listing) {
  const reqFields = [
    ['req.budget', req.budget_max != null],
    ['req.areas', req.areas.length > 0],
    ['req.types', req.types.length > 0],
    ['req.beds', req.beds_min != null],
    ['req.built_up', req.built_up_min != null],
    ['req.tags', req.must_tags.length > 0 || req.pref_tags.length > 0],
    ['req.income', req.finance.income != null],
    ['req.contact', !!(req.whatsapp || req.phone)]
  ];
  const listingFields = [
    ['listing.price', listing.price > 0],
    ['listing.area', !!listing.area],
    ['listing.type', !!listing.type],
    ['listing.beds', listing.beds != null],
    ['listing.baths', listing.baths != null],
    ['listing.built_up', listing.built_up != null],
    ['listing.tenure', !!listing.tenure],
    ['listing.furnishing', !!listing.furnishing],
    ['listing.tags', listing.tags.length > 0],
    ['listing.year_built', listing.year_built != null],
    ['listing.coords', listing.lat != null && listing.lng != null]
  ];
  const reqMissing = reqFields.filter(([, ok]) => !ok).map(([k]) => k);
  const listMissing = listingFields.filter(([, ok]) => !ok).map(([k]) => k);
  const reqRatio = (reqFields.length - reqMissing.length) / reqFields.length;
  const listRatio = (listingFields.length - listMissing.length) / listingFields.length;
  return {
    score: Math.round((reqRatio * 0.45 + listRatio * 0.55) * 100),
    missing: [...listMissing, ...reqMissing].slice(0, 8)
  };
}

/**
 * 对一对「需求 × 房源」打分。不修改入参。
 * opts: {now, today, affordability, weights}
 */
export function scorePair(reqRaw, listingRaw, opts = {}) {
  const req = prepareRequirement(reqRaw);
  const listing = prepareListing(listingRaw);
  const now = opts.now ?? Date.now();
  const today = opts.today ?? dateOnly(now);
  const failures = [];
  const weights = opts.weights || WEIGHTS[req.priority] || WEIGHTS.balanced;

  // ---- 硬门槛：意向、状态、房型、避雷标签（区域/预算在维度里判定） ----
  if (listing.intent !== listingIntentFor(req.intent)) {
    fail(failures, 'gate.intent', {listing: listing.intent, req: req.intent});
  }
  if (listing.status !== 'available') {
    fail(failures, 'gate.status', {status: listing.status});
  }
  if (req.types.length && !req.types.includes(listing.type)) {
    fail(failures, 'gate.type', {type: listing.type, types: req.types});
  }

  const budgetDim = emptyDimension('budget', weights.budget);
  const locationDim = emptyDimension('location', weights.location);
  const spaceDim = emptyDimension('space', weights.space);
  const fitDim = emptyDimension('fit', weights.fit);
  const amenitiesDim = emptyDimension('amenities', weights.amenities);
  const readinessDim = emptyDimension('readiness', weights.readiness);

  scoreBudget(req, listing, budgetDim, failures);
  scoreLocation(req, listing, locationDim, failures);
  scoreSpace(req, listing, spaceDim, failures);
  scoreFit(req, listing, fitDim, failures);
  scoreAmenities(req, listing, amenitiesDim, failures);
  scoreReadiness(req, listing, readinessDim, today, now);

  const dimensions = [budgetDim, locationDim, spaceDim, fitDim, amenitiesDim, readinessDim];
  for (const dim of dimensions) {
    dim.score = round3(dim.score);
    dim.points = round1(dim.weight * dim.score);
    dim.missing = [...new Set(dim.missing)];
  }

  // 关键偏好「硬伤」：产权是二元的、不能靠装修弥补，即使客户放宽为「不强制」也额外扣分。
  const penalties = [];
  if (
    req.tenure_pref !== 'any' &&
    listing.tenure &&
    listing.tenure !== req.tenure_pref
  ) {
    penalties.push({code: 'penalty.tenure', points: -10});
  }

  const dimensionPoints = dimensions.reduce((sum, d) => sum + d.points, 0);
  const penaltyPoints = penalties.reduce((sum, p) => sum + p.points, 0);
  const score = clamp(round1(dimensionPoints + penaltyPoints), 0, 100);
  const confidence = confidenceOf(req, listing);

  const notes = [];
  for (const dim of dimensions) {
    for (const note of dim.notes) notes.push({...note, dimension: dim.key, weight: dim.weight});
  }
  const highlights = notes
    .filter((n) => n.tone === 'positive')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const concerns = notes
    .filter((n) => n.tone === 'negative')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  const priceGap = req.budget_max != null ? round2(listing.price - req.budget_max) : null;
  const priceGapPct =
    req.budget_max != null && req.budget_max > 0
      ? round1(((listing.price - req.budget_max) / req.budget_max) * 100)
      : null;

  const aff = opts.affordability === undefined ? requirementAffordability(req) : opts.affordability;
  const rentRatio =
    req.intent === 'rent' && req.finance.income ? round1((listing.price / req.finance.income) * 100) : null;

  return {
    requirement_id: req.id ?? null,
    listing_id: listing.id ?? null,
    score,
    grade: gradeOf(score),
    eligible: failures.length === 0,
    failures,
    nearness: round1(Math.max(0, score - 12 * failures.length)),
    confidence: confidence.score,
    confidence_missing: confidence.missing,
    dimensions,
    penalties,
    highlights,
    concerns,
    priceGap,
    priceGapPct,
    affordability: aff,
    rentRatio,
    weights,
    listing_snapshot: {
      id: listing.id ?? null,
      price: listing.price,
      area: listing.area,
      type: listing.type,
      beds: listing.beds,
      baths: listing.baths,
      built_up: listing.built_up,
      status: listing.status,
      updated_at: listing.updated_at || null
    }
  };
}

export function gradeOf(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

function sortMatches(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  const gapA = Math.abs(a.priceGap ?? 0);
  const gapB = Math.abs(b.priceGap ?? 0);
  if (gapA !== gapB) return gapA - gapB;
  return String(b.listing_snapshot?.updated_at || '').localeCompare(
    String(a.listing_snapshot?.updated_at || '')
  );
}

/**
 * 给一个需求找房源。返回 {requirement, affordability, matches, near_misses, counts}
 * 只比较相同意向（买→售、租→租）的房源；已售/已租的进入「近似匹配」并说明原因。
 */
export function matchRequirement(requirement, listings, options = {}) {
  const req = prepareRequirement(requirement);
  const targetIntent = listingIntentFor(req.intent);
  const now = options.now ?? Date.now();
  const today = options.today ?? dateOnly(now);
  const aff = options.affordability === undefined ? requirementAffordability(req) : options.affordability;
  const limit = options.limit ?? 12;
  const nearLimit = options.nearLimit ?? 5;

  const pool = (listings || [])
    .map((l) => prepareListing(l))
    .filter((l) => l.intent === targetIntent)
    .filter((l) => !options.owner_id || l.owner_id === options.owner_id);

  const scored = pool.map((l) => ({
    ...scorePair(req, l, {now, today, affordability: aff}),
    listing: l
  }));
  const matches = scored.filter((m) => m.eligible).sort(sortMatches).slice(0, limit);
  const minNearness = options.minNearness ?? 60;
  const near = scored
    .filter((m) => !m.eligible && m.nearness >= minNearness)
    .sort((a, b) => b.nearness - a.nearness || b.score - a.score)
    .slice(0, nearLimit);

  const actions = options.actions || [];
  const actionMap = new Map(
    actions.map((a) => [`${a.requirement_id}:${a.listing_id}`, a])
  );
  for (const m of [...matches, ...near]) {
    m.action = actionMap.get(`${req.id}:${m.listing_id}`) || null;
    m.rank = m.eligible ? matches.indexOf(m) + 1 : null;
  }

  return {
    requirement: req,
    affordability: aff,
    matches,
    near_misses: near,
    counts: {
      eligible: scored.filter((m) => m.eligible).length,
      near: near.length,
      strong: matches.filter((m) => m.score >= 80).length
    }
  };
}

/** 给一个房源倒推最合适的客户（卖家视角 / 反向配对） */
export function matchListing(listing, requirements, options = {}) {
  const l = prepareListing(listing);
  const now = options.now ?? Date.now();
  const today = options.today ?? dateOnly(now);
  const limit = options.limit ?? 12;
  const nearLimit = options.nearLimit ?? 5;
  const pool = (requirements || [])
    .map((r) => prepareRequirement(r))
    .filter((r) => r.status === 'active')
    .filter((r) => listingIntentFor(r.intent) === l.intent)
    .filter((r) => !options.owner_id || r.owner_id === options.owner_id);

  const scored = pool.map((r) => ({
    ...scorePair(r, l, {now, today}),
    requirement: r,
    affordability: requirementAffordability(r)
  }));
  const matches = scored.filter((m) => m.eligible).sort(sortMatches).slice(0, limit);
  const minNearness = options.minNearness ?? 60;
  const near = scored
    .filter((m) => !m.eligible && m.nearness >= minNearness)
    .sort((a, b) => b.nearness - a.nearness || b.score - a.score)
    .slice(0, nearLimit);
  const actions = options.actions || [];
  const actionMap = new Map(actions.map((a) => [`${a.requirement_id}:${a.listing_id}`, a]));
  for (const m of [...matches, ...near]) {
    m.action = actionMap.get(`${m.requirement_id}:${l.id}`) || null;
    m.rank = m.eligible ? matches.indexOf(m) + 1 : null;
  }
  return {
    listing: l,
    matches,
    near_misses: near,
    counts: {
      eligible: scored.filter((m) => m.eligible).length,
      near: near.length,
      strong: matches.filter((m) => m.score >= 80).length
    }
  };
}

/**
 * 工作台「今日优先配对」：所有活跃需求 × 在售房源的合格组合，
 * 按 分数 + 紧迫度 + 跟进到期 排序；每个需求最多取 topPerRequirement 条，避免刷屏。
 */
export function buildBoard(requirements, listings, options = {}) {
  const now = options.now ?? Date.now();
  const today = options.today ?? dateOnly(now);
  const limit = options.limit ?? 30;
  const perReq = options.perRequirement ?? 2;
  const actions = options.actions || [];
  const actionMap = new Map(actions.map((a) => [`${a.requirement_id}:${a.listing_id}`, a]));
  const finalStatuses = new Set(['won', 'lost', 'rejected']);
  const activeReqs = (requirements || [])
    .map((r) => prepareRequirement(r))
    .filter((r) => r.status === 'active');
  const available = (listings || [])
    .map((l) => prepareListing(l))
    .filter((l) => l.status === 'available');

  const pairs = [];
  let eligibleTotal = 0;
  let strongTotal = 0;
  for (const req of activeReqs) {
    const tl = TIMELINES.find((t) => t.key === req.timeline);
    const dueBoost = req.follow_up && req.follow_up <= today ? 1.5 : 0;
    const aff = requirementAffordability(req);
    const sorted = available
      .filter((l) => l.intent === listingIntentFor(req.intent))
      .map((l) => ({...scorePair(req, l, {now, today, affordability: aff}), requirement: req, listing: l}))
      .filter((m) => m.eligible)
      .filter((m) => {
        const action = actionMap.get(`${req.id}:${m.listing_id}`);
        return !action || !finalStatuses.has(action.status);
      })
      .sort(sortMatches);
    for (const m of sorted) {
      eligibleTotal++;
      if (m.score >= 80) strongTotal++;
    }
    for (const m of sorted.slice(0, perReq)) {
      m.action = actionMap.get(`${req.id}:${m.listing_id}`) || null;
      m.priority = round1(m.score + (tl?.boost || 0) + dueBoost);
      pairs.push(m);
    }
  }
  pairs.sort((a, b) => b.priority - a.priority || b.score - a.score);
  return {pairs: pairs.slice(0, limit), total: pairs.length, eligible: eligibleTotal, strong: strongTotal};
}

/** 同区 / 同类型 / 同意向的行情（用于房源详情与对话参考） */
export function marketStats(listings, {area, type, intent} = {}) {
  const all = (listings || []).map((l) => prepareListing(l)).filter((l) => l.status !== 'needs_data');
  const base = all.filter((l) => l.intent === intent && l.type === type && l.price > 0);
  let scope = 'area';
  let rows = base.filter((l) => areaEquals(l.area, area));
  if (!rows.length) {
    const cluster = clusterOf(area);
    rows = base.filter((l) => clusterOf(l.area) === cluster);
    scope = 'cluster';
  }
  if (!rows.length) {
    rows = base;
    scope = 'city';
  }
  if (!rows.length) return null;
  const prices = rows.map((l) => l.price).sort((a, b) => a - b);
  const q = (p) => {
    const pos = (prices.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return round2(prices[lo] + (prices[hi] - prices[lo]) * (pos - lo));
  };
  const psfs = rows
    .map((l) => pricePerSqft(l.price, l.built_up))
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  const medianPsf = psfs.length ? psfs[Math.floor(psfs.length / 2)] : null;
  return {
    scope,
    count: rows.length,
    min: prices[0],
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: prices[prices.length - 1],
    medianPsf,
    area,
    type,
    intent
  };
}

/** 房源详情里的买入成本 / 月供 / 租金一次性支出 */
export function listingInsight(listing, {margin = 90, rate = 4.3, years = 30} = {}) {
  const l = prepareListing(listing);
  if (l.intent === 'rent') {
    return {
      kind: 'rent',
      price: l.price,
      upfront: rentUpfront(l.price),
      psf: pricePerSqft(l.price, l.built_up)
    };
  }
  const loan = (l.price * margin) / 100;
  const entry = entryCost(l.price, loan);
  const monthly = instalment(loan, rate, years);
  return {
    kind: 'sale',
    price: l.price,
    loan,
    downPayment: round2(l.price - loan),
    monthly,
    entry,
    cashRequired: round2(l.price - loan + entry.total),
    psf: pricePerSqft(l.price, l.built_up),
    assumptions: {margin, rate, years}
  };
}

export {dateOnly, daysBetween};

// 供前端字典与测试核对：引擎会输出的原因代码
export const NOTE_CODES = [
  'budget.no_limit', 'budget.below_min', 'budget.within', 'budget.at_limit', 'budget.negotiable', 'budget.stretch', 'budget.over_gate',
  'location.no_pref', 'location.exact', 'location.nearby', 'location.nearby_no_km', 'location.off',
  'space.unknown', 'space.beds', 'space.beds_short', 'space.baths', 'space.baths_short',
  'space.built_up', 'space.built_up_short', 'space.no_pref',
  'fit.tenure_unknown', 'fit.tenure_match', 'fit.tenure_miss', 'fit.freehold',
  'fit.furnishing_unknown', 'fit.furnishing', 'fit.furnishing_short',
  'fit.condition_unknown', 'fit.condition', 'fit.condition_short',
  'fit.carparks_unknown', 'fit.carparks', 'fit.carparks_short',
  'fit.age_unknown', 'fit.age', 'fit.age_short', 'fit.none',
  'amenities.avoid_hit', 'amenities.none', 'amenities.must', 'amenities.must_missing', 'amenities.pref',
  'readiness.available', 'readiness.future', 'readiness.fresh', 'readiness.stale', 'readiness.mandate_expired',
  'penalty.tenure'
];

export const FAILURE_CODES = [
  'gate.intent', 'gate.status', 'gate.type', 'gate.budget', 'gate.area', 'gate.tenure',
  'gate.beds', 'gate.baths', 'gate.built_up', 'gate.tags', 'gate.furnishing', 'gate.avoid'
];

export const MISSING_CODES = [
  'req.budget', 'req.areas', 'req.types', 'req.beds', 'req.built_up', 'req.tags', 'req.income', 'req.contact',
  'listing.price', 'listing.area', 'listing.type', 'listing.beds', 'listing.baths', 'listing.built_up',
  'listing.tenure', 'listing.furnishing', 'listing.condition', 'listing.carparks', 'listing.year_built',
  'listing.tags', 'listing.must_tags', 'listing.coords'
];
