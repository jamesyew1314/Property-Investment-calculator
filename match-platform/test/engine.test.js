import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoard,
  listingInsight,
  marketStats,
  matchListing,
  matchRequirement,
  requirementAffordability,
  scorePair
} from '../lib/engine.js';

const NOW = Date.parse('2026-10-26T10:00:00+08:00');
const TODAY = '2026-10-26';

const baseReq = {
  id: 1,
  owner_id: 1,
  client_name: 'Mr Tan',
  intent: 'buy',
  budget_min: 600000,
  budget_max: 800000,
  stretch_pct: 10,
  areas: ['Mount Austin'],
  types: ['terrace'],
  beds_min: 3,
  baths_min: 2,
  built_up_min: 1400,
  tenure_pref: 'freehold',
  furnishing_min: 'partial',
  condition_pref: 'good',
  carparks_min: 1,
  must_tags: ['near_school'],
  pref_tags: ['gated'],
  avoid_tags: ['flood_risk'],
  strict_fields: ['tenure'],
  timeline: 'urgent',
  priority: 'balanced',
  status: 'active',
  phone: '+60 12-345 6789',
  finance: {
    income: 9000,
    commitments: 1000,
    cash: 150000,
    dsr: 65,
    rate: 4.3,
    years: 30,
    margin: 90,
    rent_ratio: 30
  },
  follow_up: null
};

const baseListing = {
  id: 10,
  owner_id: 1,
  intent: 'sale',
  title: 'Mount Austin 双层排屋',
  type: 'terrace',
  area: 'Mount Austin',
  price: 760000,
  beds: 4,
  baths: 3,
  built_up: 1650,
  tenure: 'freehold',
  furnishing: 'partial',
  condition: 'good',
  year_built: 2016,
  carparks: 2,
  tags: ['near_school', 'gated', 'renovated'],
  status: 'available',
  negotiable: true,
  lat: 1.5486,
  lng: 103.7795,
  available_from: null,
  updated_at: '2026-10-20T00:00:00.000Z'
};

const mkReq = (over = {}) => ({...baseReq, ...over, finance: {...baseReq.finance, ...(over.finance || {})}});
const mkList = (over = {}) => ({...baseListing, ...over});

function codes(result) {
  return [
    ...result.highlights.map((n) => n.code),
    ...result.concerns.map((n) => n.code),
    ...result.dimensions.flatMap((d) => d.notes.map((n) => n.code))
  ];
}

test('完全匹配：地段、预算、房型全中，分数进入 A 区', () => {
  const r = scorePair(baseReq, baseListing, {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A+');
  assert.ok(codes(r).includes('location.exact'));
  assert.ok(codes(r).includes('budget.within'));
  assert.ok(codes(r).includes('space.beds'));
  assert.equal(r.confidence, 100);
});

test('邻近区域：同区群给部分分，仍可推荐', () => {
  const near = mkList({id: 11, area: 'Austin Heights'});
  const r = scorePair(baseReq, near, {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.ok(codes(r).includes('location.nearby'));
  const exact = scorePair(baseReq, baseListing, {now: NOW, today: TODAY});
  assert.ok(exact.score > r.score);
});

test('刚好等于预算上限：提示议价空间小', () => {
  const r = scorePair(baseReq, mkList({price: 800000}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.ok(codes(r).includes('budget.at_limit'));
  assert.ok(!codes(r).includes('budget.within'));
});

test('预算上浮 10% 内：可推荐但扣分，并提示超预算', () => {
  const r = scorePair(baseReq, mkList({price: 830000}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.ok(codes(r).includes('budget.stretch'));
  const exact = scorePair(baseReq, baseListing, {now: NOW, today: TODAY});
  assert.ok(r.score < exact.score - 10, `stretch=${r.score} exact=${exact.score}`);
});

test('超预算超过 10%：进入近似匹配，原因 gate.budget', () => {
  const r = scorePair(baseReq, mkList({price: 920000}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, false);
  assert.equal(r.failures[0].code, 'gate.budget');
  assert.ok(r.nearness < r.score);
});

test('房型不符：硬门槛', () => {
  const r = scorePair(baseReq, mkList({type: 'condo'}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, false);
  assert.ok(r.failures.some((f) => f.code === 'gate.type'));
});

test('避雷标签：命中即淘汰，房源详情仍保留原因', () => {
  const r = scorePair(baseReq, mkList({tags: ['near_school', 'flood_risk']}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, false);
  assert.ok(r.failures.some((f) => f.code === 'gate.avoid'));
  assert.ok(codes(r).includes('amenities.avoid_hit'));
});

test('已售房源：不参与推荐，但作为近似匹配出现', () => {
  const r = scorePair(baseReq, mkList({status: 'sold'}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, false);
  assert.ok(r.failures.some((f) => f.code === 'gate.status'));
});

test('严格产权：租赁产权被淘汰；放宽后保留但扣分', () => {
  const lease = mkList({tenure: 'leasehold'});
  const strict = scorePair(baseReq, lease, {now: NOW, today: TODAY});
  assert.equal(strict.eligible, false);
  assert.ok(strict.failures.some((f) => f.code === 'gate.tenure'));
  const soft = scorePair(mkReq({strict_fields: []}), lease, {now: NOW, today: TODAY});
  assert.equal(soft.eligible, true);
  assert.ok(soft.score < 90, `soft=${soft.score}`);
  assert.ok(soft.penalties.some((p) => p.code === 'penalty.tenure'));
});

test('严格房间数：2 房被淘汰；放宽后按比例扣分', () => {
  const small = mkList({beds: 2, baths: 2, built_up: 1100});
  const strict = scorePair(mkReq({strict_fields: ['tenure', 'beds', 'built_up']}), small, {
    now: NOW,
    today: TODAY
  });
  assert.equal(strict.eligible, false);
  assert.ok(strict.failures.some((f) => f.code === 'gate.beds'));
  const soft = scorePair(baseReq, small, {now: NOW, today: TODAY});
  assert.equal(soft.eligible, true);
  assert.ok(codes(soft).includes('space.beds_short'));
});

test('低于预算下限：提示可能规格不符，但不淘汰', () => {
  const r = scorePair(baseReq, mkList({price: 520000}), {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.ok(codes(r).includes('budget.below_min'));
});

test('优先级档案改变排序：空间优先时 4 房优势更大', () => {
  const four = scorePair(mkReq({priority: 'space'}), mkList({id: 20, beds: 4}), {now: NOW, today: TODAY});
  const two = scorePair(mkReq({priority: 'space'}), mkList({id: 21, beds: 2, baths: 2}), {now: NOW, today: TODAY});
  const fourB = scorePair(mkReq({priority: 'balanced'}), mkList({id: 20, beds: 4}), {now: NOW, today: TODAY});
  const twoB = scorePair(mkReq({priority: 'balanced'}), mkList({id: 21, beds: 2, baths: 2}), {now: NOW, today: TODAY});
  assert.ok(four.score - two.score > fourB.score - twoB.score);
});

test('资料完整度：缺装修、产权、坐标等会降低 confidence 或列入待确认', () => {
  const sparse = mkList({
    furnishing: null,
    year_built: null,
    lat: null,
    lng: null,
    available_from: null,
    tags: []
  });
  const r = scorePair(baseReq, sparse, {now: NOW, today: TODAY});
  assert.ok(r.confidence < 100);
  assert.ok(r.confidence_missing.includes('listing.furnishing'));
});

test('可负担性：随需求附带，且预算高于可负担时仍照常评分（由前端提示）', () => {
  const aff = requirementAffordability(baseReq);
  assert.ok(aff.maxPrice > 0);
  const r = scorePair(baseReq, baseListing, {now: NOW, today: TODAY});
  assert.equal(r.affordability.maxPrice, aff.maxPrice);
  assert.ok(r.affordability.monthlyForBudget > 0);
});

test('租房：按月租比较预算，押金一次性支出可算', () => {
  const req = mkReq({
    id: 2,
    intent: 'rent',
    budget_min: 1500,
    budget_max: 2200,
    types: ['condo'],
    beds_min: 2,
    built_up_min: null,
    tenure_pref: 'any',
    furnishing_min: 'full',
    strict_fields: [],
    must_tags: ['pool'],
    pref_tags: [],
    avoid_tags: []
  });
  const l = mkList({
    id: 30,
    intent: 'rent',
    type: 'condo',
    price: 2000,
    furnishing: 'full',
    tags: ['pool', 'gym', 'security'],
    tenure: 'leasehold'
  });
  const r = scorePair(req, l, {now: NOW, today: TODAY});
  assert.equal(r.eligible, true);
  assert.ok(codes(r).includes('budget.within'));
  const insight = listingInsight(l);
  assert.equal(insight.kind, 'rent');
  assert.ok(insight.upfront.total > 0);
});

test('需求 → 房源：排序、近似匹配、动作状态注入', () => {
  const listings = [
    baseListing,
    mkList({id: 11, area: 'Austin Heights', price: 810000}),
    mkList({id: 12, area: 'Bukit Indah'}),
    mkList({id: 13, status: 'sold'}),
    mkList({id: 14, type: 'condo'})
  ];
  const result = matchRequirement(baseReq, listings, {
    now: NOW,
    today: TODAY,
    actions: [{requirement_id: 1, listing_id: 11, status: 'sent'}]
  });
  assert.ok(result.matches.length >= 2);
  assert.equal(result.matches[0].listing_id, 10);
  assert.equal(result.counts.near, 3);
  assert.equal(result.near_misses.length, 3);
  assert.equal(result.matches.find((m) => m.listing_id === 11).action.status, 'sent');
});

test('房源 → 客户：反向配对把最合适的客户排第一', () => {
  const requirements = [
    baseReq,
    mkReq({id: 2, client_name: 'Ms Lim', budget_max: 650000, priority: 'value'}),
    mkReq({id: 3, client_name: 'Mr Raj', intent: 'rent', budget_min: 1500, budget_max: 2000})
  ];
  const result = matchListing(baseListing, requirements, {now: NOW, today: TODAY});
  assert.equal(result.matches[0].requirement_id, 1);
  assert.ok(result.matches.every((m) => m.requirement.intent === 'buy'));
});

test('今日优先：排序、每个需求最多两条、已成交不再出现', () => {
  const listings = [
    baseListing,
    mkList({id: 11, area: 'Austin Heights', price: 810000}),
    mkList({id: 12, area: 'Mount Austin', price: 790000}),
    mkList({id: 13, area: 'Mount Austin', price: 700000, beds: 3, baths: 2, built_up: 1450})
  ];
  const reqs = [baseReq, mkReq({id: 2, client_name: 'Ms Lim', budget_max: 780000, priority: 'value'})];
  const board = buildBoard(reqs, listings, {
    now: NOW,
    today: TODAY,
    actions: [{requirement_id: 1, listing_id: 10, status: 'won'}]
  });
  assert.ok(board.pairs.length > 0);
  assert.ok(!board.pairs.some((p) => p.requirement_id === 1 && p.listing_id === 10));
  const byReq = new Map();
  for (const p of board.pairs) byReq.set(p.requirement_id, (byReq.get(p.requirement_id) || 0) + 1);
  for (const n of byReq.values()) assert.ok(n <= 2);
});

test('行情：同区中位数与每平方尺价', () => {
  const listings = [
    baseListing,
    mkList({id: 11, price: 800000, built_up: 1600}),
    mkList({id: 12, price: 900000, built_up: 1800})
  ];
  const stats = marketStats(listings, {area: 'Mount Austin', type: 'terrace', intent: 'sale'});
  assert.equal(stats.count, 3);
  assert.equal(stats.median, 800000);
  assert.ok(stats.medianPsf > 480 && stats.medianPsf < 510);
});

test('房源洞察：出租显示押金/预付，而不是房贷', () => {
  const insight = listingInsight(mkList({intent: 'rent', price: 1500, type: 'condo'}));
  assert.equal(insight.kind, 'rent');
  assert.equal(insight.upfront.deposit, 3000);
  assert.equal(insight.upfront.advance, 1500);
  assert.equal(insight.upfront.utility, 750);
  assert.equal(insight.upfront.total, 5332);
  assert.equal(insight.monthly, undefined);
});

test('房源洞察：买入成本 + 月供 + 所需现金', () => {
  const insight = listingInsight(baseListing);
  assert.equal(insight.kind, 'sale');
  assert.equal(insight.loan, 684000);
  assert.ok(insight.monthly > 3300 && insight.monthly < 3500, `monthly=${insight.monthly}`);
  assert.ok(insight.entry.total > 40000);
  assert.equal(insight.cashRequired, 76000 + insight.entry.total);
});
