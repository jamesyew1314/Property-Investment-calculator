// server.js — PropMatch API + 静态站点（零依赖，Node >= 20）
// 启动：node server.js   （默认 http://127.0.0.1:4100）
// 环境变量：PORT / HOST / DATA_DIR / COOKIE_SECURE=1 / SESSION_SECRET / SEED_DEMO=0 / SHOW_DEMO=0

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {Store, APP_ROOT, refFor} from './lib/store.js';
import {Auth, publicUser} from './lib/auth.js';
import {HttpError, badRequest, forbidden, notFound, unauthorized} from './lib/http-error.js';
import {normalizeActionInput, normalizeListingInput, normalizeRequirementInput} from './lib/validate.js';
import {meta, areaLabel} from './lib/taxonomy.js';
import {
  buildBoard,
  dateOnly,
  daysBetween,
  listingInsight,
  marketStats,
  matchListing,
  matchRequirement,
  requirementAffordability,
  scorePair
} from './lib/engine.js';
import {DEMO_EMAIL, DEMO_PASSWORD, resetDemo, seedDemo} from './lib/seed.js';

const VERSION = '0.1.0';
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const FINAL_ACTIONS = new Set(['won', 'lost', 'rejected']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(body);
}

function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS
  });
  res.end(body);
}

function readJson(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'payload_too_large', '请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(badRequest('bad_json', '请求内容不是有效 JSON'));
      }
    });
    req.on('error', (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
  });
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function slimListing(row) {
  if (!row) return null;
  const {owner_id, ...rest} = row;
  return rest;
}

function slimRequirement(row) {
  if (!row) return null;
  const {owner_id, ...rest} = row;
  return rest;
}

function actionKey(requirementId, listingId) {
  return `${requirementId}:${listingId}`;
}

function ownedRows(store, user, name) {
  return store.list(name).filter((row) => Number(row.owner_id) === Number(user.id));
}

function ownedOr404(store, user, name, id) {
  const row = store.get(name, id);
  if (!row || Number(row.owner_id) !== Number(user.id)) throw notFound();
  return row;
}

function buildSummary(requirements, listings, actions) {
  const reqs = requirements.filter((r) => r.status === 'active');
  const available = listings.filter((l) => l.status === 'available');
  const finalMap = new Map(actions.map((a) => [actionKey(a.requirement_id, a.listing_id), a.status]));
  const reqSummary = new Map(
    reqs.map((r) => [r.id, {eligible: 0, strong: 0, near: 0, best_listing_id: null, best_score: 0}])
  );
  const listSummary = new Map(
    listings.map((l) => [l.id, {eligible: 0, strong: 0, near: 0, best_requirement_id: null, best_score: 0}])
  );
  const affMap = new Map(reqs.map((r) => [r.id, requirementAffordability(r)]));

  for (const req of reqs) {
    for (const listing of available) {
      if (listing.intent !== (req.intent === 'rent' ? 'rent' : 'sale')) continue;
      const result = scorePair(req, listing, {affordability: affMap.get(req.id)});
      const rs = reqSummary.get(req.id);
      const ls = listSummary.get(listing.id);
      if (!result.eligible) {
        rs.near++;
        ls.near++;
        continue;
      }
      const action = finalMap.get(actionKey(req.id, listing.id));
      if (action && FINAL_ACTIONS.has(action)) continue;
      rs.eligible++;
      ls.eligible++;
      if (result.score >= 80) {
        rs.strong++;
        ls.strong++;
      }
      if (result.score > rs.best_score) {
        rs.best_score = result.score;
        rs.best_listing_id = listing.id;
      }
      if (result.score > ls.best_score) {
        ls.best_score = result.score;
        ls.best_requirement_id = req.id;
      }
    }
  }
  return {
    requirements: Object.fromEntries(reqSummary),
    listings: Object.fromEntries(listSummary)
  };
}

function enrichPair(pair, reqMap, listingMap, actionsByKey) {
  const requirement = reqMap.get(pair.requirement_id) || pair.requirement || null;
  const listing = listingMap.get(pair.listing_id) || pair.listing || null;
  const action =
    pair.action ||
    actionsByKey?.get(actionKey(pair.requirement_id, pair.listing_id)) ||
    null;
  const insight = listing
    ? listingInsight(listing, {
        margin: requirement?.finance?.margin ?? 90,
        rate: requirement?.finance?.rate ?? 4.3,
        years: requirement?.finance?.years ?? 30
      })
    : null;
  const {requirement: _r, listing: _l, ...rest} = pair;
  return {
    ...rest,
    requirement: slimRequirement(requirement),
    listing: slimListing(listing),
    insight,
    action
  };
}

function makeApp({dataDir, secureCookies = false, seed = true} = {}) {
  const store = new Store({dataDir});
  const auth = new Auth(store, {secure: secureCookies});
  let seeded = {created: false};
  if (seed && process.env.SEED_DEMO !== '0') seeded = seedDemo(store);

  const demoEnabled = process.env.SHOW_DEMO !== '0';

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const method = req.method || 'GET';

    // 同源校验（有 Origin 时必须与 Host 一致；curl/CLI 无 Origin 不受影响）
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const origin = req.headers.origin;
      if (origin) {
        let host;
        try {
          host = new URL(origin).host;
        } catch {
          throw forbidden('来源不合法');
        }
        if (host !== req.headers.host) throw forbidden('来源与站点不一致');
      }
    }

    // ---------- 静态资源 ----------
    if (!pathname.startsWith('/api/')) {
      if (method !== 'GET' && method !== 'HEAD') throw notFound();
      return serveStatic(req, res, pathname);
    }

    // ---------- 公开 API ----------
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {ok: true, version: VERSION, time: new Date().toISOString()});
    }
    if (method === 'GET' && pathname === '/api/meta') {
      return sendJson(res, 200, {meta: meta(), version: VERSION});
    }
    if (method === 'GET' && pathname === '/api/public-config') {
      return sendJson(res, 200, {
        version: VERSION,
        demo: demoEnabled ? {email: DEMO_EMAIL, password: DEMO_PASSWORD} : null,
        seeded: !!seeded.created
      });
    }
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = (await readJson(req)) || {};
      const user = auth.register(body);
      store.logActivity(user.id, 'auth.register', {detail: {email: user.email}});
      return sendJson(res, 201, {user}, {'Set-Cookie': auth.cookieFor(user.id)});
    }
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = (await readJson(req)) || {};
      const user = auth.login({email: body.email, password: body.password, ip: clientIp(req)});
      return sendJson(res, 200, {user}, {'Set-Cookie': auth.cookieFor(user.id)});
    }
    if (method === 'POST' && pathname === '/api/auth/logout') {
      return sendJson(res, 200, {ok: true}, {'Set-Cookie': auth.cookieHeader(0, {clear: true})});
    }

    // ---------- 以下需要登录 ----------
    const user = auth.userFromRequest(req);
    if (!user) throw unauthorized();

    if (method === 'GET' && pathname === '/api/me') {
      return sendJson(res, 200, {user: publicUser(user)});
    }
    if (method === 'PATCH' && pathname === '/api/me') {
      const body = (await readJson(req)) || {};
      return sendJson(res, 200, {user: auth.updateProfile(user.id, body)});
    }
    if (method === 'POST' && pathname === '/api/me/password') {
      const body = (await readJson(req)) || {};
      auth.changePassword(user.id, body.current, body.password);
      return sendJson(res, 200, {ok: true}, {'Set-Cookie': auth.cookieHeader(0, {clear: true})});
    }
    if (method === 'GET' && pathname === '/api/bootstrap') {
      const listings = ownedRows(store, user, 'listings').sort((a, b) =>
        String(b.updated_at).localeCompare(String(a.updated_at))
      );
      const requirements = ownedRows(store, user, 'requirements').sort((a, b) =>
        String(b.updated_at).localeCompare(String(a.updated_at))
      );
      const actions = ownedRows(store, user, 'actions');
      return sendJson(res, 200, {
        user: publicUser(user),
        meta: meta(),
        listings: listings.map(slimListing),
        requirements: requirements.map(slimRequirement),
        actions,
        activities: store.activitiesFor(user.id, 12),
        summary: buildSummary(requirements, listings, actions),
        demo: demoEnabled && user.email === DEMO_EMAIL ? {email: DEMO_EMAIL, password: DEMO_PASSWORD} : null
      });
    }

    // ---------- 房源 ----------
    if (method === 'GET' && pathname === '/api/listings') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const intent = url.searchParams.get('intent');
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const listings = ownedRows(store, user, 'listings');
      const requirements = ownedRows(store, user, 'requirements');
      const summary = buildSummary(requirements, listings, ownedRows(store, user, 'actions')).listings;
      const rows = listings
        .filter((l) => (intent ? l.intent === intent : true))
        .filter((l) => (status ? l.status === status : true))
        .filter((l) => (type ? l.type === type : true))
        .filter((l) =>
          q
            ? [l.title, l.title_en, l.area, l.address, l.ref].filter(Boolean).join(' ').toLowerCase().includes(q)
            : true
        )
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return sendJson(res, 200, {
        listings: rows.map((l) => ({...slimListing(l), summary: summary[l.id] || null}))
      });
    }

    if (method === 'POST' && pathname === '/api/listings') {
      const value = normalizeListingInput((await readJson(req)) || {});
      const row = store.insert('listings', {...value, owner_id: user.id});
      const updated = store.update('listings', row.id, {ref: refFor('L', row.id)});
      store.logActivity(user.id, 'listing.created', {
        entity: 'listing',
        entity_id: row.id,
        detail: {title: value.title, price: value.price, area: value.area}
      });
      return sendJson(res, 201, {listing: slimListing(updated)});
    }

    let m = pathname.match(/^\/api\/listings\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const existing = ownedOr404(store, user, 'listings', id);
      if (method === 'GET') {
        const requirements = ownedRows(store, user, 'requirements');
        const actions = ownedRows(store, user, 'actions');
        const reqMap = new Map(requirements.map((r) => [r.id, r]));
        const listingMap = new Map([[existing.id, existing]]);
        const match = matchListing(existing, requirements, {actions, limit: 12, nearLimit: 6});
        const actionsByKey = new Map(actions.map((a) => [actionKey(a.requirement_id, a.listing_id), a]));
        return sendJson(res, 200, {
          listing: slimListing(existing),
          insight: listingInsight(existing),
          market: marketStats(
            ownedRows(store, user, 'listings').filter((l) => Number(l.id) !== Number(existing.id)),
            {
              area: existing.area,
              type: existing.type,
              intent: existing.intent
            }
          ),
          matches: match.matches.map((x) => enrichPair(x, reqMap, listingMap, actionsByKey)),
          near_misses: match.near_misses.map((x) => enrichPair(x, reqMap, listingMap, actionsByKey)),
          counts: match.counts
        });
      }
      if (method === 'PATCH') {
        const body = (await readJson(req)) || {};
        const value = normalizeListingInput({...existing, ...body});
        const updated = store.update('listings', id, value);
        store.logActivity(user.id, 'listing.updated', {
          entity: 'listing',
          entity_id: id,
          detail: {title: value.title}
        });
        return sendJson(res, 200, {listing: slimListing(updated)});
      }
      if (method === 'DELETE') {
        for (const action of ownedRows(store, user, 'actions')) {
          if (Number(action.listing_id) === id) store.remove('actions', action.id);
        }
        store.remove('listings', id);
        store.logActivity(user.id, 'listing.deleted', {
          entity: 'listing',
          entity_id: id,
          detail: {title: existing.title}
        });
        return sendJson(res, 200, {ok: true});
      }
    }

    // ---------- 客户需求 ----------
    if (method === 'GET' && pathname === '/api/requirements') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const intent = url.searchParams.get('intent');
      const status = url.searchParams.get('status');
      const requirements = ownedRows(store, user, 'requirements');
      const listings = ownedRows(store, user, 'listings');
      const summary = buildSummary(requirements, listings, ownedRows(store, user, 'actions')).requirements;
      const rows = requirements
        .filter((r) => (intent ? r.intent === intent : true))
        .filter((r) => (status ? r.status === status : true))
        .filter((r) =>
          q
            ? [r.client_name, r.notes, r.ref, ...(r.areas || [])].filter(Boolean).join(' ').toLowerCase().includes(q)
            : true
        )
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return sendJson(res, 200, {
        requirements: rows.map((r) => ({...slimRequirement(r), summary: summary[r.id] || null}))
      });
    }

    if (method === 'POST' && pathname === '/api/requirements') {
      const value = normalizeRequirementInput((await readJson(req)) || {});
      const row = store.insert('requirements', {...value, owner_id: user.id});
      const updated = store.update('requirements', row.id, {ref: refFor('R', row.id)});
      store.logActivity(user.id, 'requirement.created', {
        entity: 'requirement',
        entity_id: row.id,
        detail: {client_name: value.client_name, intent: value.intent, budget_max: value.budget_max}
      });
      return sendJson(res, 201, {requirement: slimRequirement(updated)});
    }

    m = pathname.match(/^\/api\/requirements\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const existing = ownedOr404(store, user, 'requirements', id);
      if (method === 'GET') {
        const listings = ownedRows(store, user, 'listings');
        const actions = ownedRows(store, user, 'actions');
        const reqMap = new Map([[existing.id, existing]]);
        const listingMap = new Map(listings.map((l) => [l.id, l]));
        const result = matchRequirement(existing, listings, {actions, limit: 20, nearLimit: 6});
        const actionsByKey = new Map(actions.map((a) => [actionKey(a.requirement_id, a.listing_id), a]));
        return sendJson(res, 200, {
          requirement: slimRequirement(existing),
          affordability: result.affordability,
          matches: result.matches.map((x) => enrichPair(x, reqMap, listingMap, actionsByKey)),
          near_misses: result.near_misses.map((x) => enrichPair(x, reqMap, listingMap, actionsByKey)),
          counts: result.counts
        });
      }
      if (method === 'PATCH') {
        const body = (await readJson(req)) || {};
        const value = normalizeRequirementInput({...existing, ...body});
        const updated = store.update('requirements', id, value);
        store.logActivity(user.id, 'requirement.updated', {
          entity: 'requirement',
          entity_id: id,
          detail: {client_name: value.client_name}
        });
        return sendJson(res, 200, {requirement: slimRequirement(updated)});
      }
      if (method === 'DELETE') {
        for (const action of ownedRows(store, user, 'actions')) {
          if (Number(action.requirement_id) === id) store.remove('actions', action.id);
        }
        store.remove('requirements', id);
        store.logActivity(user.id, 'requirement.deleted', {
          entity: 'requirement',
          entity_id: id,
          detail: {client_name: existing.client_name}
        });
        return sendJson(res, 200, {ok: true});
      }
    }

    // ---------- 配对 ----------
    if (method === 'GET' && pathname === '/api/board') {
      const intent = url.searchParams.get('intent');
      const minScore = Number(url.searchParams.get('minScore') || 0);
      const requirements = ownedRows(store, user, 'requirements').filter(
        (r) => !intent || r.intent === intent
      );
      const listings = ownedRows(store, user, 'listings');
      const actions = ownedRows(store, user, 'actions');
      const reqMap = new Map(requirements.map((r) => [r.id, r]));
      const listingMap = new Map(listings.map((l) => [l.id, l]));
      const actionsByKey = new Map(actions.map((a) => [actionKey(a.requirement_id, a.listing_id), a]));
      const board = buildBoard(requirements, listings, {actions, limit: 40, perRequirement: 2});
      const pairs = board.pairs
        .filter((p) => p.score >= minScore)
        .map((p) => enrichPair(p, reqMap, listingMap, actionsByKey));
      return sendJson(res, 200, {
        pairs,
        total: pairs.length,
        eligible: board.eligible,
        strong: board.strong
      });
    }

    if (method === 'GET' && pathname === '/api/dashboard') {
      const requirements = ownedRows(store, user, 'requirements');
      const listings = ownedRows(store, user, 'listings');
      const actions = ownedRows(store, user, 'actions');
      const today = dateOnly(Date.now());
      const reqMap = new Map(requirements.map((r) => [r.id, r]));
      const listingMap = new Map(listings.map((l) => [l.id, l]));
      const actionsByKey = new Map(actions.map((a) => [actionKey(a.requirement_id, a.listing_id), a]));
      const board = buildBoard(requirements, listings, {actions, limit: 6, perRequirement: 2});
      const active = requirements.filter((r) => r.status === 'active');

      const followUps = active
        .filter((r) => r.follow_up)
        .sort((a, b) => String(a.follow_up).localeCompare(String(b.follow_up)))
        .slice(0, 6)
        .map((r) => {
          const best = matchRequirement(r, listings, {actions, limit: 1, nearLimit: 0});
          return {
            requirement: slimRequirement(r),
            days: daysBetween(today, r.follow_up),
            best: best.matches[0] ? enrichPair(best.matches[0], reqMap, listingMap, actionsByKey) : null
          };
        });

      const weekAgo = Date.now() - 7 * 86400000;
      const isNew = (row) => Date.parse(row.created_at) >= weekAgo;
      const byStatus = (status) => actions.filter((a) => a.status === status).length;
      const activityByDay = [];
      for (let i = 6; i >= 0; i--) {
        const day = dateOnly(Date.now() - i * 86400000);
        activityByDay.push({
          day,
          count: actions.filter((a) => String(a.updated_at || a.created_at).slice(0, 10) === day).length
        });
      }
      const areaDemand = {};
      for (const r of active) {
        for (const area of r.areas || []) {
          const label = areaLabel(area, 'zh');
          areaDemand[label] = (areaDemand[label] || 0) + 1;
        }
      }

      return sendJson(res, 200, {
        today,
        stats: {
          activeRequirements: active.length,
          availableListings: listings.filter((l) => l.status === 'available').length,
          strongPairs: board.strong,
          eligiblePairs: board.eligible,
          followUpsDue: active.filter((r) => r.follow_up && r.follow_up <= today).length,
          newRequirements: requirements.filter(isNew).length,
          newListings: listings.filter(isNew).length,
          actionsSent: byStatus('sent'),
          viewings: byStatus('viewed'),
          offers: byStatus('offer'),
          won: byStatus('won')
        },
        topPairs: board.pairs.map((p) => enrichPair(p, reqMap, listingMap, actionsByKey)),
        followUps,
        funnel: {
          shortlisted: byStatus('shortlisted'),
          sent: byStatus('sent'),
          viewed: byStatus('viewed'),
          offer: byStatus('offer'),
          won: byStatus('won'),
          lost: byStatus('lost'),
          rejected: byStatus('rejected')
        },
        activity: store.activitiesFor(user.id, 10),
        activityByDay,
        areaDemand: Object.entries(areaDemand)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([area, count]) => ({area, count}))
      });
    }

    if (method === 'GET' && pathname === '/api/market') {
      const area = url.searchParams.get('area');
      const type = url.searchParams.get('type');
      const intent = url.searchParams.get('intent');
      if (!area || !type || !intent) throw badRequest('validation', '缺少 area/type/intent');
      return sendJson(res, 200, {
        market: marketStats(ownedRows(store, user, 'listings'), {area, type, intent})
      });
    }

    // ---------- 跟进动作 ----------
    if (method === 'POST' && pathname === '/api/actions') {
      const body = (await readJson(req)) || {};
      const requirement = ownedOr404(store, user, 'requirements', body.requirement_id);
      const listing = ownedOr404(store, user, 'listings', body.listing_id);
      const value = normalizeActionInput(body);
      const existing = ownedRows(store, user, 'actions').find(
        (a) =>
          Number(a.requirement_id) === Number(requirement.id) &&
          Number(a.listing_id) === Number(listing.id)
      );
      let action;
      if (existing) {
        action = store.update('actions', existing.id, {...value});
      } else {
        action = store.insert('actions', {
          owner_id: user.id,
          requirement_id: requirement.id,
          listing_id: listing.id,
          ...value
        });
      }
      store.logActivity(user.id, `action.${value.status}`, {
        entity: 'action',
        entity_id: action.id,
        detail: {
          requirement: requirement.client_name,
          listing: listing.title,
          note: value.note || null
        }
      });
      return sendJson(res, 200, {action});
    }

    m = pathname.match(/^\/api\/actions\/(\d+)$/);
    if (m && method === 'DELETE') {
      const action = ownedOr404(store, user, 'actions', Number(m[1]));
      store.remove('actions', action.id);
      store.logActivity(user.id, 'action.removed', {
        entity: 'action',
        entity_id: action.id,
        detail: {status: action.status}
      });
      return sendJson(res, 200, {ok: true});
    }

    if (method === 'GET' && pathname === '/api/activities') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
      return sendJson(res, 200, {activities: store.activitiesFor(user.id, limit)});
    }

    if (method === 'GET' && pathname === '/api/export') {
      const payload = {
        schema: 'propmatch-export',
        version: 1,
        exported_at: new Date().toISOString(),
        user: publicUser(user),
        listings: ownedRows(store, user, 'listings'),
        requirements: ownedRows(store, user, 'requirements'),
        actions: ownedRows(store, user, 'actions'),
        activities: store.activitiesFor(user.id, 500)
      };
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return sendJson(res, 200, payload, {
        'Content-Disposition': `attachment; filename="propmatch-export-${stamp}.json"`
      });
    }

    if (method === 'POST' && pathname === '/api/demo/reset') {
      if (user.email !== DEMO_EMAIL && process.env.ALLOW_DEMO_RESET !== '1') {
        throw forbidden('只有演示账号可以重置演示数据');
      }
      const result = resetDemo(store, user.id);
      store.logActivity(user.id, 'demo.reset', {detail: result});
      return sendJson(res, 200, {ok: true, ...result});
    }

    throw notFound('接口不存在');
  }

  function serveStatic(req, res, pathname) {
    // 前端表单复用后端财务公式（只暴露纯函数文件）
    const shared = pathname === '/lib/finance.js' ? path.join(APP_ROOT, 'lib', 'finance.js') : null;
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (rel.endsWith('/')) rel += 'index.html';
    const file = shared || path.resolve(PUBLIC_DIR, `.${rel}`);
    if (!shared && !file.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 403, 'Forbidden');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return sendText(res, 404, 'Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isAsset = ['.jpg', '.jpeg', '.png', '.svg', '.ico'].includes(ext);
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
      ...SECURITY_HEADERS
    });
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof HttpError) {
        return sendJson(res, err.status, {
          error: {code: err.code, message: err.message, fields: err.fields || undefined}
        });
      }
      console.error('[propmatch] 未处理错误:', err);
      sendJson(res, 500, {error: {code: 'internal', message: '服务器内部错误'}});
    });
  });

  return {server, store, auth, seeded};
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 4100);
  const host = process.env.HOST || '0.0.0.0';
  const {server, seeded} = makeApp({
    dataDir: process.env.DATA_DIR,
    secureCookies: process.env.COOKIE_SECURE === '1',
    seed: true
  });
  server.listen(port, host, () => {
    console.log(`\n  PropMatch · 智能房源配对  v${VERSION}`);
    console.log(`  http://127.0.0.1:${port}`);
    if (seeded.created) console.log(`  演示账号：${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
  });
  const shutdown = () => {
    console.log('\n  Shutting down…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export {makeApp};
