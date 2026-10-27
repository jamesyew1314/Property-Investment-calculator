// app.js — PropMatch 单页应用控制器：状态、路由、登录、CRUD、跟进动作

import {makeT} from './i18n.js';
import {
  areaLabel,
  budgetText,
  esc,
  fmtMoney,
  listingTitle,
  phoneDigits,
  todayISO,
  typeLabel,
  whatsappMessage
} from './format.js';
import {
  appShell,
  dashboardView,
  errorView,
  listingDetailView,
  listingsView,
  loadingView,
  loginView,
  matchesView,
  requirementDetailView,
  requirementsView,
  settingsView
} from './views.js';
import {
  copyText,
  openActionModal,
  openListingForm,
  openMessageModal,
  openPasswordModal,
  openPhotoModal,
  openProfileModal,
  openRequirementForm,
  openScoreModal
} from './forms.js';
import {closeModal, confirmDialog, toast} from './ui.js';

const LANG_KEY = 'kwongthye_lang';
const app = document.getElementById('app');

const state = {
  lang: loadLang(),
  user: null,
  meta: null,
  publicConfig: null,
  demo: null,
  listings: [],
  requirements: [],
  actions: [],
  activities: [],
  summary: {requirements: {}, listings: {}},
  filters: {
    req: {q: '', intent: '', status: ''},
    lst: {q: '', intent: '', status: '', type: ''},
    match: {intent: '', strong: false}
  },
  loginMode: 'login',
  route: null,
  dashboard: null,
  board: null,
  reqDetail: new Map(),
  listingDetail: new Map(),
  pairs: new Map(),
  seq: 0
};

function loadLang() {
  try {
    return localStorage.getItem(LANG_KEY) || 'zh';
  } catch {
    return 'zh';
  }
}

function setLang(lang) {
  state.lang = lang === 'en' ? 'en' : 'zh';
  try {
    localStorage.setItem(LANG_KEY, state.lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hans' : 'en';
}

const BASE_PATH = new URL('.', document.baseURI).pathname.replace(/\/$/, '');

function getCtx() {
  return {t: makeT(state.lang), lang: state.lang, meta: state.meta};
}

class ApiError extends Error {
  constructor(message, {status, code, fields} = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function api(path, {method = 'GET', body} = {}) {
  const res = await fetch(`${BASE_PATH}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Accept-Language': state.lang === 'en' ? 'en' : 'zh',
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(err.message || `HTTP ${res.status}`, {
      status: res.status,
      code: err.code,
      fields: err.fields
    });
  }
  return data;
}

function applyBootstrap(data) {
  state.user = data.user;
  state.meta = data.meta;
  state.listings = data.listings || [];
  state.requirements = data.requirements || [];
  state.actions = data.actions || [];
  state.activities = data.activities || [];
  state.summary = data.summary || {requirements: {}, listings: {}};
  state.demo = data.demo || null;
}

async function refreshBootstrap() {
  const data = await api('/api/bootstrap');
  applyBootstrap(data);
}

async function loadPublicConfig() {
  try {
    state.publicConfig = await api('/api/public-config');
  } catch {
    state.publicConfig = null;
  }
}

async function boot({first = false} = {}) {
  setLang(state.lang);
  await loadPublicConfig();
  if (await maybeAutoDemo()) {
    // 已通过演示链接登录
  } else {
    try {
      await refreshBootstrap();
    } catch (err) {
      if (err.status !== 401) console.warn('[propmatch] bootstrap failed', err);
    }
  }
  if (first) {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onFilterChange);
    window.addEventListener('hashchange', () => route());
    window.addEventListener('unhandledrejection', (e) => {
      console.error(e.reason);
    });
  }
  await route();
}

async function maybeAutoDemo() {
  if (state.user) return false;
  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1') return false;
  const demo = state.publicConfig?.demo;
  if (!demo) return false;
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: {email: demo.email, password: demo.password}
    });
    await refreshBootstrap();
    history.replaceState(null, '', location.pathname + location.hash);
    return true;
  } catch (err) {
    console.warn('[propmatch] demo login failed', err);
    return false;
  }
}

// ---------------- 路由 ----------------
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return {name: 'dashboard'};
  const [head, id] = parts;
  if (head === 'requirements' && id) return {name: 'requirement', id: Number(id)};
  if (head === 'listings' && id) return {name: 'listing', id: Number(id)};
  if (['dashboard', 'requirements', 'listings', 'matches', 'settings'].includes(head)) {
    return {name: head};
  }
  return {name: 'dashboard'};
}

function activeNavFor(name) {
  if (name === 'requirement') return 'requirements';
  if (name === 'listing') return 'listings';
  return name;
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const r = parseHash();
  const prev = state.route;
  state.route = r;
  if (!state.user) {
    render();
    return;
  }
  const ctx = getCtx();
  const active = activeNavFor(r.name);
  const seq = ++state.seq;

  const cached =
    (r.name === 'dashboard' && state.dashboard) ||
    (r.name === 'matches' && state.board) ||
    (r.name === 'requirement' && state.reqDetail.has(Number(r.id))) ||
    (r.name === 'listing' && state.listingDetail.has(Number(r.id)));
  if (!cached && ['dashboard', 'matches', 'requirement', 'listing'].includes(r.name)) {
    renderLoading(active);
  }

  try {
    if (r.name === 'dashboard') {
      const data = await api('/api/dashboard');
      if (seq !== state.seq) return;
      state.dashboard = data;
      indexPairs(data.topPairs);
    } else if (r.name === 'matches') {
      const data = await api('/api/board');
      if (seq !== state.seq) return;
      state.board = data;
      indexPairs(data.pairs);
    } else if (r.name === 'requirement') {
      const data = await api(`/api/requirements/${r.id}`);
      if (seq !== state.seq) return;
      state.reqDetail.set(Number(r.id), data);
      indexPairs([...(data.matches || []), ...(data.near_misses || [])]);
    } else if (r.name === 'listing') {
      const data = await api(`/api/listings/${r.id}`);
      if (seq !== state.seq) return;
      state.listingDetail.set(Number(r.id), data);
      indexPairs([...(data.matches || []), ...(data.near_misses || [])]);
    }
  } catch (err) {
    if (seq !== state.seq) return;
    if (handleUnauthorized(err)) return;
    if (err.status === 404) {
      toast(err.message || ctx.t('common.noData'), 'error');
      go(r.name === 'requirement' ? '#/requirements' : '#/listings');
      return;
    }
    renderError(active, err.message);
    return;
  }
  if (seq !== state.seq) return;
  render();
  if (prev && (prev.name !== r.name || prev.id !== r.id)) {
    window.scrollTo({top: 0, behavior: 'auto'});
  }
}

function renderLoading(active) {
  const ctx = getCtx();
  if (!state.user) {
    render();
    return;
  }
  app.innerHTML = appShell({
    content: loadingView(ctx),
    active,
    ctx,
    user: state.user,
    counts: navCounts()
  });
}

function renderError(active, message) {
  const ctx = getCtx();
  app.innerHTML = appShell({
    content: errorView(message, ctx),
    active,
    ctx,
    user: state.user,
    counts: navCounts()
  });
}

function navCounts() {
  return {
    requirements: state.requirements.filter((r) => r.status === 'active').length,
    listings: state.listings.filter((l) => l.status === 'available').length,
    strong:
      state.board?.strong ||
      state.dashboard?.stats?.strongPairs ||
      Object.values(state.summary.requirements || {}).reduce((sum, x) => sum + (x.strong || 0), 0),
    pairs: 0
  };
}

function render() {
  const ctx = getCtx();
  if (!state.user) {
    document.body.className = 'login-body';
    app.innerHTML = loginView(state, ctx);
    document.title =
      state.lang === 'en'
        ? 'PropMatch · KWONG THYE · Smart Matching'
        : 'PropMatch · KWONG THYE 光泰 智能配对';
    return;
  }
  document.body.className = 'app-body';
  const r = state.route || {name: 'dashboard'};
  const active = activeNavFor(r.name);
  const content = contentFor(r, ctx);
  app.innerHTML = appShell({
    content,
    active,
    ctx,
    user: state.user,
    counts: navCounts()
  });
  const titles = {
    dashboard: ctx.t('nav.dashboard'),
    requirements: ctx.t('nav.requirements'),
    requirement: ctx.t('nav.requirements'),
    listings: ctx.t('nav.listings'),
    listing: ctx.t('nav.listings'),
    matches: ctx.t('nav.matches'),
    settings: ctx.t('nav.settings')
  };
  const brand =
    state.lang === 'en'
      ? 'PropMatch · KWONG THYE · Smart Matching'
      : 'PropMatch · KWONG THYE 光泰 智能配对';
  document.title = `${titles[r.name] || 'PropMatch'} · ${brand}`;
}

function contentFor(r, ctx) {
  if (r.name === 'dashboard') {
    return state.dashboard ? dashboardView(state.dashboard, state, ctx) : loadingView(ctx);
  }
  if (r.name === 'requirements') return requirementsView(state, ctx);
  if (r.name === 'requirement') {
    const data = state.reqDetail.get(Number(r.id));
    return data ? requirementDetailView(data, state, ctx) : loadingView(ctx);
  }
  if (r.name === 'listings') return listingsView(state, ctx);
  if (r.name === 'listing') {
    const data = state.listingDetail.get(Number(r.id));
    return data ? listingDetailView(data, state, ctx) : loadingView(ctx);
  }
  if (r.name === 'matches') {
    return state.board ? matchesView(filteredBoard(), state, ctx) : loadingView(ctx);
  }
  if (r.name === 'settings') return settingsView(state, ctx);
  return state.dashboard ? dashboardView(state.dashboard, state, ctx) : loadingView(ctx);
}

function filteredBoard() {
  const board = state.board || {pairs: [], strong: 0, eligible: 0};
  const f = state.filters.match;
  const pairs = (board.pairs || []).filter(
    (p) => (!f.intent || p.requirement?.intent === f.intent) && (!f.strong || p.score >= 80)
  );
  return {...board, pairs};
}

// ---------------- 配对索引 ----------------
function indexPairs(list) {
  for (const p of list || []) {
    if (p && p.requirement?.id && p.listing?.id) {
      state.pairs.set(`${p.requirement.id}:${p.listing.id}`, p);
    }
  }
}

function findPair(reqId, listingId) {
  const key = `${Number(reqId)}:${Number(listingId)}`;
  if (state.pairs.has(key)) return state.pairs.get(key);
  for (const data of [...state.reqDetail.values(), ...state.listingDetail.values()]) {
    const found = [...(data.matches || []), ...(data.near_misses || [])].find(
      (m) => Number(m.requirement_id) === Number(reqId) && Number(m.listing_id) === Number(listingId)
    );
    if (found) {
      state.pairs.set(key, found);
      return found;
    }
  }
  return null;
}

function findRequirement(id) {
  const n = Number(id);
  return (
    state.requirements.find((r) => Number(r.id) === n) ||
    state.reqDetail.get(n)?.requirement ||
    null
  );
}

function findListing(id) {
  const n = Number(id);
  return (
    state.listings.find((l) => Number(l.id) === n) ||
    state.listingDetail.get(n)?.listing ||
    null
  );
}

function handleUnauthorized(err) {
  if (err?.status !== 401) return false;
  state.user = null;
  state.meta = null;
  state.pairs.clear();
  render();
  toast(getCtx().t('common.sessionExpired'), 'error');
  return true;
}

// ---------------- 事件 ----------------
const deferredActions = new Set([
  'toggle-lang',
  'logout',
  'switch-login-mode',
  'fill-demo',
  'new-requirement',
  'edit-requirement',
  'delete-requirement',
  'new-listing',
  'edit-listing',
  'delete-listing',
  'open-action',
  'quick-action',
  'send-message',
  'view-score',
  'open-photo',
  'export-data',
  'reset-demo',
  'edit-profile',
  'change-password',
  'send-brief',
  'reload'
]);

function onClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl && deferredActions.has(actionEl.dataset.action)) {
    e.preventDefault();
    runAction(actionEl.dataset.action, actionEl);
    return;
  }
  const filterEl = e.target.closest('[data-filter-intent]');
  if (filterEl) {
    e.preventDefault();
    const group = filterEl.dataset.filterIntent;
    if (state.filters[group]) {
      state.filters[group].intent = filterEl.dataset.value || '';
      render();
    }
  }
}

async function runAction(action, el) {
  const ctx = getCtx();
  try {
    switch (action) {
      case 'toggle-lang':
        setLang(state.lang === 'zh' ? 'en' : 'zh');
        render();
        return;
      case 'switch-login-mode':
        state.loginMode = state.loginMode === 'login' ? 'register' : 'login';
        render();
        return;
      case 'fill-demo': {
        const demo = state.publicConfig?.demo;
        if (!demo) return;
        if (state.loginMode !== 'login') {
          state.loginMode = 'login';
          render();
        }
        const form = document.querySelector('.login-form');
        if (!form) return;
        form.elements.email.value = demo.email;
        form.elements.password.value = demo.password;
        toast(ctx.t('toast.demoFilled'));
        return;
      }
      case 'logout':
        await doLogout(ctx);
        return;
      case 'new-requirement':
        openRequirementForm({
          ctx,
          onSubmit: async (payload) => {
            const res = await api('/api/requirements', {method: 'POST', body: payload});
            await afterMutation({
              message: ctx.t('toast.created'),
              hash: `#/requirements/${res.requirement.id}`
            });
          }
        });
        return;
      case 'edit-requirement': {
        const req = findRequirement(el.dataset.id);
        if (!req) return toast(ctx.t('common.noData'), 'error');
        openRequirementForm({
          requirement: req,
          ctx,
          onSubmit: async (payload) => {
            await api(`/api/requirements/${req.id}`, {method: 'PATCH', body: payload});
            await afterMutation({message: ctx.t('toast.saved')});
          }
        });
        return;
      }
      case 'delete-requirement': {
        const req = findRequirement(el.dataset.id);
        if (!req) return;
        const ok = await confirmDialog({
          title: ctx.t('confirm.deleteRequirement'),
          body: ctx.t('req.deleteConfirm'),
          confirmText: ctx.t('common.delete'),
          cancelText: ctx.t('common.cancel')
        });
        if (!ok) return;
        await api(`/api/requirements/${req.id}`, {method: 'DELETE'});
        await afterMutation({message: ctx.t('toast.deleted'), hash: '#/requirements'});
        return;
      }
      case 'new-listing':
        openListingForm({
          ctx,
          onSubmit: async (payload) => {
            const res = await api('/api/listings', {method: 'POST', body: payload});
            await afterMutation({message: ctx.t('toast.created'), hash: `#/listings/${res.listing.id}`});
          }
        });
        return;
      case 'edit-listing': {
        const listing = findListing(el.dataset.id);
        if (!listing) return toast(ctx.t('common.noData'), 'error');
        openListingForm({
          listing,
          ctx,
          onSubmit: async (payload) => {
            await api(`/api/listings/${listing.id}`, {method: 'PATCH', body: payload});
            await afterMutation({message: ctx.t('toast.saved')});
          }
        });
        return;
      }
      case 'delete-listing': {
        const listing = findListing(el.dataset.id);
        if (!listing) return;
        const ok = await confirmDialog({
          title: ctx.t('confirm.deleteListing'),
          body: ctx.t('lst.deleteConfirm'),
          confirmText: ctx.t('common.delete'),
          cancelText: ctx.t('common.cancel')
        });
        if (!ok) return;
        await api(`/api/listings/${listing.id}`, {method: 'DELETE'});
        await afterMutation({message: ctx.t('toast.deleted'), hash: '#/listings'});
        return;
      }
      case 'open-action': {
        const pair = findPair(el.dataset.req, el.dataset.listing);
        if (!pair) return toast(ctx.t('common.noData'), 'error');
        closeModal();
        openActionModal({
          match: pair,
          ctx,
          onSubmit: async (status, note) => {
            await api('/api/actions', {
              method: 'POST',
              body: {
                requirement_id: pair.requirement.id,
                listing_id: pair.listing.id,
                status,
                note
              }
            });
            await afterMutation({message: ctx.t('match.actionSaved')});
          },
          onRemove: async () => {
            if (pair.action) await api(`/api/actions/${pair.action.id}`, {method: 'DELETE'});
            await afterMutation({message: ctx.t('toast.deleted')});
          }
        });
        return;
      }
      case 'quick-action': {
        const pair = findPair(el.dataset.req, el.dataset.listing);
        if (!pair) return;
        const status = el.dataset.status || 'shortlisted';
        if (pair.action && pair.action.status === status) {
          await api(`/api/actions/${pair.action.id}`, {method: 'DELETE'});
        } else {
          await api('/api/actions', {
            method: 'POST',
            body: {
              requirement_id: pair.requirement.id,
              listing_id: pair.listing.id,
              status,
              note: pair.action?.note || ''
            }
          });
        }
        toast(ctx.t('match.statusUpdated', {status: ctx.meta.action_statuses.find((s) => s.key === status)?.[ctx.lang] || status}));
        await refreshCurrent();
        return;
      }
      case 'send-message': {
        const pair = findPair(el.dataset.req, el.dataset.listing);
        if (!pair) return toast(ctx.t('common.noData'), 'error');
        closeModal();
        openMessageModal({match: pair, ctx, user: state.user});
        return;
      }
      case 'view-score': {
        const pair = findPair(el.dataset.req, el.dataset.listing);
        if (!pair) return toast(ctx.t('common.noData'), 'error');
        openScoreModal({match: pair, ctx});
        return;
      }
      case 'open-photo':
        openPhotoModal(el.dataset.src, ctx);
        return;
      case 'send-brief': {
        const req = findRequirement(el.dataset.id);
        if (!req) return;
        const text = briefText(req, ctx);
        await copyText(text);
        toast(ctx.t('toast.copied'));
        return;
      }
      case 'export-data': {
        const a = document.createElement('a');
        a.href = '/api/export';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(ctx.t('toast.exported'));
        return;
      }
      case 'reset-demo': {
        const ok = await confirmDialog({
          title: ctx.t('settings.resetDemo'),
          body: ctx.t('settings.resetConfirm'),
          confirmText: ctx.t('common.confirm'),
          cancelText: ctx.t('common.cancel')
        });
        if (!ok) return;
        await api('/api/demo/reset', {method: 'POST', body: {}});
        await afterMutation({message: ctx.t('toast.reset'), hash: '#/dashboard'});
        return;
      }
      case 'edit-profile': {
        openProfileModal({
          user: state.user,
          ctx,
          onSubmit: async (payload) => {
            const res = await api('/api/me', {method: 'PATCH', body: payload});
            state.user = res.user;
            closeModal();
            toast(ctx.t('toast.profileSaved'));
            render();
          }
        });
        return;
      }
      case 'change-password': {
        openPasswordModal({
          ctx,
          onSubmit: async (payload) => {
            await api('/api/me/password', {method: 'POST', body: payload});
            closeModal();
            toast(ctx.t('settings.passwordChanged'));
            state.user = null;
            state.meta = null;
            state.dashboard = null;
            state.board = null;
            state.reqDetail.clear();
            state.listingDetail.clear();
            state.pairs.clear();
            render();
          }
        });
        return;
      }
      case 'reload':
        await boot();
        return;
      default:
        return;
    }
  } catch (err) {
    if (handleUnauthorized(err)) return;
    toast(err.message || ctx.t('toast.error', {message: err.message || ''}), 'error');
  }
}

async function doLogout(ctx) {
  const ok = await confirmDialog({
    title: ctx.t('confirm.logout'),
    body: ctx.t('settings.logoutConfirm'),
    confirmText: ctx.t('common.logout'),
    cancelText: ctx.t('common.cancel')
  });
  if (!ok) return;
  try {
    await api('/api/auth/logout', {method: 'POST', body: {}});
  } catch {
    /* ignore */
  }
  state.user = null;
  state.meta = null;
  state.dashboard = null;
  state.board = null;
  state.reqDetail.clear();
  state.listingDetail.clear();
  state.pairs.clear();
  state.listings = [];
  state.requirements = [];
  state.actions = [];
  state.activities = [];
  state.summary = {requirements: {}, listings: {}};
  render();
}

async function refreshCurrent() {
  state.dashboard = null;
  state.board = null;
  state.reqDetail.clear();
  state.listingDetail.clear();
  state.pairs.clear();
  await refreshBootstrap();
  await route();
}

async function afterMutation({message, hash} = {}) {
  closeModal();
  if (message) toast(message);
  state.dashboard = null;
  state.board = null;
  state.reqDetail.clear();
  state.listingDetail.clear();
  state.pairs.clear();
  await refreshBootstrap();
  if (hash && location.hash !== hash) {
    location.hash = hash;
  } else {
    await route();
  }
}

function briefText(req, ctx) {
  const lines = [
    `${req.client_name} · ${req.ref || ''}`,
    `${ctx.t('req.budget')}: ${budgetText(req, ctx)}`,
    `${ctx.t('form.f.areas')}: ${(req.areas || []).map((a) => areaLabel(a, ctx)).join(' / ') || '—'}`,
    `${ctx.t('form.f.types')}: ${(req.types || []).map((t) => typeLabel(t, ctx)).join(' / ') || '—'}`,
    `${ctx.t('form.f.timeline')}: ${(ctx.meta.timelines.find((t) => t.key === req.timeline) || {})[ctx.lang] || '—'}`,
    `${ctx.t('form.f.notes')}: ${req.notes || '—'}`
  ];
  return lines.join('\n');
}

// ---------------- 表单提交（登录/注册） ----------------
async function onSubmit(e) {
  const form = e.target.closest('[data-form="login"], [data-form="register"]');
  if (!form) return;
  e.preventDefault();
  const ctx = getCtx();
  const mode = form.dataset.form;
  const box = form.querySelector('[data-error]');
  const button = form.querySelector('button[type="submit"]');
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
  if (button) {
    button.disabled = true;
    button.dataset.label = button.textContent;
    button.textContent = ctx.t('common.loading');
  }
  const data = new FormData(form);
  const body =
    mode === 'login'
      ? {email: data.get('email'), password: data.get('password')}
      : {
          name: data.get('name'),
          email: data.get('email'),
          password: data.get('password'),
          company: data.get('company'),
          ren: data.get('ren'),
          phone: data.get('phone')
        };
  try {
    await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {method: 'POST', body});
    state.loginMode = 'login';
    await refreshBootstrap();
    const target = location.hash && location.hash !== '#/login' ? location.hash : '#/dashboard';
    if (location.hash !== target) location.hash = target;
    else await route();
  } catch (err) {
    if (box) {
      box.hidden = false;
      const fieldMsg = err.fields ? Object.values(err.fields)[0] : '';
      box.textContent = [err.message, fieldMsg].filter(Boolean).join(' · ');
    }
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.label || (mode === 'login' ? ctx.t('login.signIn') : ctx.t('login.signUp'));
    }
  }
}

// ---------------- 筛选 ----------------
function onInput(e) {
  const el = e.target.closest('[data-filter]');
  if (!el || el.type !== 'text') return;
  const key = el.dataset.filter;
  if (key === 'req-q') state.filters.req.q = el.value;
  else if (key === 'lst-q') state.filters.lst.q = el.value;
  else return;
  const id = el.id;
  const pos = el.selectionStart;
  render();
  const next = id ? document.getElementById(id) : null;
  if (next) {
    next.focus({preventScroll: true});
    try {
      next.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
  }
}

function onFilterChange(e) {
  const el = e.target.closest('[data-filter]');
  if (!el) {
    if (e.target.matches('[data-filter-intent]')) return;
    return;
  }
  const key = el.dataset.filter;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  switch (key) {
    case 'req-status':
      state.filters.req.status = value;
      break;
    case 'lst-status':
      state.filters.lst.status = value;
      break;
    case 'lst-type':
      state.filters.lst.type = value;
      break;
    case 'match-strong':
      state.filters.match.strong = !!value;
      break;
    default:
      return;
  }
  render();
}

// ---------------- 启动 ----------------
boot({first: true}).catch((err) => {
  console.error('[propmatch] boot failed', err);
  render();
});
