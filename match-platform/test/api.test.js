import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {makeApp} from '../server.js';
import {DEMO_EMAIL, DEMO_PASSWORD} from '../lib/seed.js';

let server;
let base;
let tmp;
let demoCookie = '';

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.()[0] || res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function call(pathname, {method = 'GET', body, cookie, headers = {}} = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
      ...(cookie ? {Cookie: cookie} : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return {res, data, cookie: cookieFrom(res)};
}

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'propmatch-api-'));
  const app = makeApp({dataDir: tmp, seed: true});
  server = app.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, {recursive: true, force: true});
});

test('健康检查与演示登录', async () => {
  const health = await call('/api/health');
  assert.equal(health.res.status, 200);
  assert.equal(health.data.ok, true);

  const config = await call('/api/public-config');
  assert.equal(config.res.status, 200);
  assert.equal(config.data.contact.phone, '+60 16-528 0918');
  assert.equal(config.data.contact.email, 'andylau.theroof@gmail.com');

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: {email: DEMO_EMAIL, password: DEMO_PASSWORD}
  });
  assert.equal(login.res.status, 200);
  assert.equal(login.data.user.email, DEMO_EMAIL);
  assert.ok(login.cookie.startsWith('pm_session='));
  demoCookie = login.cookie;

  const bad = await call('/api/auth/login', {
    method: 'POST',
    body: {email: DEMO_EMAIL, password: 'wrong-password'},
    headers: {'Accept-Language': 'en'}
  });
  assert.equal(bad.res.status, 401);
  assert.match(bad.data.error.message, /Incorrect email or password/);
});

test('未登录返回 401', async () => {
  const res = await call('/api/bootstrap');
  assert.equal(res.res.status, 401);
});

test('bootstrap 返回演示数据与配对摘要', async () => {
  const {res, data} = await call('/api/bootstrap', {cookie: demoCookie});
  assert.equal(res.status, 200);
  assert.equal(data.user.email, DEMO_EMAIL);
  assert.equal(data.user.name, 'Andy Lau 刘泌光');
  assert.equal(data.user.phone, '+60 16-528 0918');
  assert.equal(data.listings.length, 19);
  assert.equal(data.requirements.length, 10);
  assert.ok(Object.keys(data.summary.requirements).length >= 9);
});

test('需求详情：匹配排序、可解释维度与可负担性', async () => {
  const {res, data} = await call('/api/requirements/1', {cookie: demoCookie});
  assert.equal(res.status, 200);
  assert.ok(data.matches.length >= 2);
  assert.ok(data.matches[0].score >= data.matches[1].score);
  assert.ok(data.matches[0].dimensions.length === 6);
  assert.ok(data.matches[0].highlights.length > 0);
  assert.ok(data.affordability.maxPrice > 0);
  assert.equal(data.affordability.kind, 'buy');
});

test('房源详情：反向匹配、买入成本与同区参考', async () => {
  const {res, data} = await call('/api/listings/2', {cookie: demoCookie});
  assert.equal(res.status, 200);
  assert.ok(data.matches.length >= 1);
  assert.ok(data.insight.entry.total > 0);
  assert.ok(data.insight.monthly > 0);
  assert.ok(data.market === null || data.market.count >= 1);

  const rent = await call('/api/listings/13', {cookie: demoCookie});
  assert.equal(rent.res.status, 200);
  assert.equal(rent.data.insight.kind, 'rent');
  assert.equal(rent.data.insight.upfront.deposit, 3000);
  assert.equal(rent.data.insight.upfront.total, 5332);
});

test('看板与工作台', async () => {
  const board = await call('/api/board', {cookie: demoCookie});
  assert.equal(board.res.status, 200);
  assert.ok(board.data.pairs.length > 0);
  assert.ok(board.data.pairs[0].priority >= board.data.pairs[1].priority);
  const dash = await call('/api/dashboard', {cookie: demoCookie});
  assert.equal(dash.res.status, 200);
  assert.ok(dash.data.stats.activeRequirements > 0);
  assert.ok(Array.isArray(dash.data.topPairs));
});

test('校验失败返回字段级错误', async () => {
  const {res, data} = await call('/api/listings', {
    method: 'POST',
    cookie: demoCookie,
    body: {intent: 'sale', type: 'terrace', area: 'Kulai', price: 300000}
  });
  assert.equal(res.status, 400);
  assert.equal(data.error.code, 'validation');
  assert.ok(data.error.fields.title);

  const en = await call('/api/listings', {
    method: 'POST',
    cookie: demoCookie,
    headers: {'Accept-Language': 'en'},
    body: {intent: 'sale', type: 'terrace', area: 'Kulai', price: 300000}
  });
  assert.equal(en.res.status, 400);
  assert.match(en.data.error.message, /Check the listing details/);
  assert.match(en.data.error.fields.title, /listing title/);
});

test('创建需求 + 房源 → 自动配对 → 跟进动作 → 删除动作', async () => {
  const req = await call('/api/requirements', {
    method: 'POST',
    cookie: demoCookie,
    body: {
      client_name: 'API Buyer',
      intent: 'buy',
      budget_min: 350000,
      budget_max: 500000,
      areas: ['Kulai'],
      types: ['terrace'],
      beds_min: 3,
      timeline: 'urgent',
      priority: 'value',
      finance: {income: 7000, commitments: 500, cash: 80000, dsr: 65, rate: 4.3, years: 30, margin: 90}
    }
  });
  assert.equal(req.res.status, 201);
  const requirementId = req.data.requirement.id;

  const listing = await call('/api/listings', {
    method: 'POST',
    cookie: demoCookie,
    body: {
      intent: 'sale',
      title: 'API Test Terrace',
      type: 'terrace',
      area: 'Kulai',
      price: 420000,
      beds: 4,
      baths: 3,
      built_up: 1300,
      tenure: 'freehold',
      status: 'available',
      tags: ['near_school']
    }
  });
  assert.equal(listing.res.status, 201);
  const listingId = listing.data.listing.id;

  const detail = await call(`/api/requirements/${requirementId}`, {cookie: demoCookie});
  assert.equal(detail.res.status, 200);
  const match = detail.data.matches.find((m) => m.listing.id === listingId);
  assert.ok(match, 'new listing should match');
  assert.ok(match.score >= 60);

  const action = await call('/api/actions', {
    method: 'POST',
    cookie: demoCookie,
    body: {requirement_id: requirementId, listing_id: listingId, status: 'sent', note: 'API test'}
  });
  assert.equal(action.res.status, 200);
  const actionId = action.data.action.id;

  const detail2 = await call(`/api/requirements/${requirementId}`, {cookie: demoCookie});
  const match2 = detail2.data.matches.find((m) => m.listing.id === listingId);
  assert.equal(match2.action.status, 'sent');

  const removed = await call(`/api/actions/${actionId}`, {method: 'DELETE', cookie: demoCookie});
  assert.equal(removed.res.status, 200);
});

test('账号隔离：第二个用户看不到第一个用户的数据', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: {name: 'Second Agent', email: `second-${Date.now()}@example.com`, password: 'password123'}
  });
  assert.equal(reg.res.status, 201);
  const secondCookie = reg.cookie;
  const boot = await call('/api/bootstrap', {cookie: secondCookie});
  assert.equal(boot.res.status, 200);
  assert.equal(boot.data.listings.length, 0);
  assert.equal(boot.data.requirements.length, 0);
  const denied = await call('/api/requirements/1', {cookie: secondCookie});
  assert.equal(denied.res.status, 404);
});

test('资料更新与改密：旧 Cookie 立即失效，新密码可登录', async () => {
  const email = `pw-${Date.now()}@example.com`;
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: {name: 'Password Test', email, password: 'password123', role: 'owner'}
  });
  assert.equal(reg.res.status, 201);
  assert.equal(reg.data.user.role, 'agent');
  const oldCookie = reg.cookie;

  const patched = await call('/api/me', {
    method: 'PATCH',
    cookie: oldCookie,
    body: {
      name: 'Password Test 2',
      name_en: 'Test Agent',
      title: 'Senior Agent',
      title_en: 'Senior Agent',
      phone: '+60 12-999 0000',
      company: 'Test Agency',
      e_number: 'E(1)0000/0',
      contact_email: 'test.agent@example.com',
      website: 'kwongthye.com/test',
      office_address: '1 Test Road, Johor'
    }
  });
  assert.equal(patched.res.status, 200);
  assert.equal(patched.data.user.name, 'Password Test 2');
  assert.equal(patched.data.user.contact_email, 'test.agent@example.com');
  assert.equal(patched.data.user.website, 'https://kwongthye.com/test');

  const changed = await call('/api/me/password', {
    method: 'POST',
    cookie: oldCookie,
    body: {current: 'password123', password: 'newpassword123'}
  });
  assert.equal(changed.res.status, 200);

  const stale = await call('/api/me', {cookie: oldCookie});
  assert.equal(stale.res.status, 401);

  const relogin = await call('/api/auth/login', {
    method: 'POST',
    body: {email, password: 'newpassword123'}
  });
  assert.equal(relogin.res.status, 200);
  const fresh = await call('/api/me', {cookie: relogin.cookie});
  assert.equal(fresh.res.status, 200);
  assert.equal(fresh.data.user.name, 'Password Test 2');
});

test('演示账号可重置演示数据', async () => {
  const reset = await call('/api/demo/reset', {method: 'POST', cookie: demoCookie, body: {}});
  assert.equal(reset.res.status, 200);
  assert.equal(reset.data.listings, 19);
  const boot = await call('/api/bootstrap', {cookie: demoCookie});
  assert.equal(boot.data.listings.length, 19);
  assert.equal(boot.data.requirements.length, 10);
});

test('导出包含 schema 与本人数据', async () => {
  const exp = await call('/api/export', {cookie: demoCookie});
  assert.equal(exp.res.status, 200);
  assert.equal(exp.data.schema, 'propmatch-export');
  assert.ok(exp.data.listings.length >= 19);
  assert.ok(!exp.data.user.password_hash);
});
