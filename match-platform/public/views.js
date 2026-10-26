// views.js — 页面 HTML（纯渲染；事件与数据由 app.js 处理）

import {
  areaLabel,
  attr,
  budgetText,
  daysAgo,
  daysLabel,
  esc,
  failureText,
  firstPhoto,
  fmtDate,
  fmtDateShort,
  fmtMoney,
  fmtNum,
  fmtPct,
  initials,
  intentLabel,
  listingSpecs,
  listingTitle,
  missingText,
  noteText,
  phoneDigits,
  priceText,
  scoreGrade,
  scoreLabel,
  scoreTone,
  statusLabel,
  tagLabel,
  tagsLabel,
  timeAgo,
  todayISO,
  typeLabel,
  tenureLabel,
  furnishingLabel,
  conditionLabel
} from './format.js';
import {
  actionButtons,
  avatar,
  badge,
  confidenceMeter,
  emptyState,
  icon,
  listingThumb,
  monthGrid,
  reasonChips,
  scoreRing,
  statusBadge
} from './ui.js';

const safe = (v) => (v == null ? '' : esc(v));

function joinMeta(parts, sep = ' · ') {
  return parts.filter((x) => x != null && x !== '').join(sep);
}

function pageHead({eyebrow = '', title, sub = '', actions = ''}) {
  return `<div class="page-head">
    <div class="page-head-copy">
      ${eyebrow ? `<p class="eyebrow">${safe(eyebrow)}</p>` : ''}
      <h1>${safe(title)}</h1>
      ${sub ? `<p class="page-sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

function sectionHead(title, sub = '', actions = '') {
  return `<div class="section-head">
    <div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${actions ? `<div class="section-actions">${actions}</div>` : ''}
  </div>`;
}

function specPills(listing, ctx, limit = 5) {
  const bits = listingSpecs(listing, ctx).slice(0, limit);
  return bits.length
    ? `<div class="spec-pills">${bits.map((b) => `<span>${safe(b)}</span>`).join('')}</div>`
    : '';
}

function tagPills(listing, ctx, limit = 4) {
  const tags = (listing.tags || []).slice(0, limit);
  if (!tags.length) return '';
  return `<div class="tag-pills">${tags
    .map((t) => `<span class="tag-pill">${safe(tagLabel(t, ctx))}</span>`)
    .join('')}${listing.tags.length > limit ? `<span class="tag-pill more">+${listing.tags.length - limit}</span>` : ''}</div>`;
}

function addr(listing, ctx) {
  return joinMeta([areaLabel(listing.area, ctx), listing.address]);
}

export function brandBlock(compact = false, ctx = null) {
  return `<a class="brand" href="#/dashboard" aria-label="PropMatch">
    <span class="brand-mark"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M4 16 16 5l12 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15v11h16V15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M13 26v-6h6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg></span>
    <span class="brand-text"><b>Prop<span>Match</span></b><em>${compact ? 'AI' : ctx ? ctx.t('app.brandTag') : '智能房源配对 · AI Matching'}</em></span>
  </a>`;
}

export function loginView(state, ctx) {
  const demo = state.publicConfig?.demo || state.demo;
  const card = state.publicConfig?.contact || {};
  const cardCompany = card.company || 'THE ROOF REALTY SDN BHD';
  const cardENumber = card.e_number || 'E(1)1605/1';
  const cardName = card.name || 'Andy Lau 刘泌光';
  const cardRen = card.ren || '32839';
  const cardPhone = card.phone || '+60 16-528 0918';
  const cardEmail = card.email || 'andylau.theroof@gmail.com';
  const cardSite = card.website ? card.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'kwongthye.com';
  const mode = state.loginMode || 'login';
  const isLogin = mode === 'login';
  const hero = ctx.t('login.heroTitle');
  const comma = Math.max(hero.indexOf('，'), hero.indexOf(','));
  const heroHtml =
    comma > 0
      ? `${esc(hero.slice(0, comma + 1))}<br>${esc(hero.slice(comma + 1).trim())}`
      : esc(hero);
  return `<div class="login-page">
    <section class="login-hero">
      <div class="login-hero-inner">
        <div class="login-top">
          ${brandBlock(false, ctx)}
          <button type="button" class="lang-pill dark" data-action="toggle-lang">${ctx.lang === 'zh' ? 'EN' : '中文'}</button>
        </div>
        <div class="login-headline">
          <p class="eyebrow gold">${ctx.t('app.name')}</p>
          <h1>${heroHtml}</h1>
          <p class="lead">${ctx.t('login.heroSub')}</p>
        </div>
        <ul class="feature-list">
          <li>${icon('target', 18)}<span>${ctx.t('login.feature1')}</span></li>
          <li>${icon('wallet', 18)}<span>${ctx.t('login.feature2')}</span></li>
          <li>${icon('users', 18)}<span>${ctx.t('login.feature3')}</span></li>
        </ul>
        <div class="login-stats">
          <div><b>19</b><span>${ctx.lang === 'zh' ? '条演示房源' : 'demo listings'}</span></div>
          <div><b>10</b><span>${ctx.lang === 'zh' ? '组客户需求' : 'client briefs'}</span></div>
          <div><b>6</b><span>${ctx.lang === 'zh' ? '个评分维度' : 'scoring dimensions'}</span></div>
        </div>
        <p class="login-foot">${safe(cardCompany)} · ${safe(cardENumber)} · ${safe(cardName)} REN ${safe(cardRen)}<br>${safe(cardPhone)} · ${safe(cardEmail)} · ${safe(cardSite)}</p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <div class="login-form-head">
          <h2>${isLogin ? ctx.t('login.formTitle') : ctx.t('login.registerTitle')}</h2>
          <p>${isLogin ? ctx.t('login.formSub') : ctx.t('login.registerSub')}</p>
        </div>
        <form class="form login-form" data-form="${isLogin ? 'login' : 'register'}" autocomplete="on">
          ${isLogin ? '' : `<label class="field"><span>${ctx.t('login.name')} *</span><input name="name" required autocomplete="name" placeholder="Andy Lau 刘泌光"></label>`}
          <label class="field"><span>${ctx.t('login.email')} *</span><input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
          <label class="field"><span>${ctx.t('login.password')} *</span><input name="password" type="password" required minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="••••••••"></label>
          ${isLogin ? '' : `
            <div class="form-grid">
              <label class="field"><span>${ctx.t('login.company')}</span><input name="company" placeholder="THE ROOF REALTY SDN BHD"></label>
              <label class="field"><span>${ctx.t('login.ren')}</span><input name="ren" placeholder="32839"></label>
            </div>
            <label class="field"><span>${ctx.t('login.phone')}</span><input name="phone" placeholder="+60 16-528 0918"></label>`}
          <p class="form-error" data-error hidden></p>
          <button class="btn primary block" type="submit">${isLogin ? ctx.t('login.signIn') : ctx.t('login.signUp')}</button>
        </form>
        <div class="login-switch">
          <button type="button" class="linkbtn" data-action="switch-login-mode">${isLogin ? ctx.t('login.toRegister') : ctx.t('login.toLogin')}</button>
        </div>
        ${demo ? `<div class="demo-card">
          <div class="demo-card-head">${icon('spark', 18)}<b>${ctx.t('login.demoTitle')}</b></div>
          <p>${ctx.t('login.demoBody')}</p>
          <div class="demo-credentials"><code>${safe(demo.email)}</code><span>/</span><code>${safe(demo.password)}</code></div>
          <button type="button" class="btn gold block" data-action="fill-demo">${ctx.t('login.demoButton')}</button>
          <p class="hint">${ctx.t('login.demoNote')}</p>
        </div>` : ''}
        <p class="login-privacy">${ctx.t('login.privacy')}</p>
      </div>
    </section>
  </div>`;
}

export function appShell({content, active, ctx, user, counts}) {
  const navItems = [
    ['dashboard', 'nav.dashboard', 'dashboard', counts?.pairs || 0],
    ['requirements', 'nav.requirements', 'target', counts?.requirements || 0],
    ['listings', 'nav.listings', 'home', counts?.listings || 0],
    ['matches', 'nav.matches', 'spark', counts?.strong || 0]
  ];
  const nav = navItems
    .map(
      ([key, label, ico, count]) => `<a class="nav-item ${active === key ? 'active' : ''}" href="#/${key}">
        ${icon(ico, 19)}<span>${ctx.t(label)}</span>
        ${count ? `<em class="nav-count">${count}</em>` : ''}
      </a>`
    )
    .join('');
  const bottom = navItems
    .map(
      ([key, label, ico]) => `<a class="tab-item ${active === key ? 'active' : ''}" href="#/${key}">
        ${icon(ico, 21)}<span>${ctx.t(label)}</span>
      </a>`
    )
    .join('');
  return `<div class="app">
    <aside class="sidebar">
      <div class="sidebar-top">${brandBlock(false, ctx)}</div>
      <nav class="nav" aria-label="Main">${nav}</nav>
      <div class="sidebar-bottom">
        <button type="button" class="sidebar-link" data-action="toggle-lang">${icon('globe', 17)}<span>${ctx.lang === 'zh' ? 'English' : '中文'}</span></button>
        <a class="sidebar-link" href="#/settings">${icon('sliders', 17)}<span>${ctx.t('nav.settings')}</span></a>
        <div class="user-mini">
          ${avatar(user?.name || '', 'sm')}
          <div><b>${safe(user?.name || '')}</b><span>${user?.ren ? `REN ${safe(user.ren)}` : safe(user?.email || '')}</span></div>
          <button type="button" class="icon-btn" data-action="logout" title="${ctx.t('common.logout')}">${icon('logout', 17)}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="mobile-brand">${brandBlock(true, ctx)}</div>
        <div class="topbar-spacer"></div>
        <button type="button" class="lang-pill" data-action="toggle-lang">${ctx.lang === 'zh' ? 'EN' : '中文'}</button>
        <div class="topbar-user">${avatar(user?.name || '', 'sm')}<span>${safe(user?.name || '')}</span></div>
      </header>
      <main class="content">${content}</main>
    </div>
    <nav class="tabbar" aria-label="Mobile">${bottom}<a class="tab-item ${active === 'settings' ? 'active' : ''}" href="#/settings">${icon('sliders', 21)}<span>${ctx.t('nav.settings')}</span></a></nav>
  </div>`;
}

function kpiCard({label, value, hint, iconName, href, tone = ''}) {
  const inner = `<div class="kpi-icon ${tone}">${icon(iconName, 19)}</div>
    <div class="kpi-value">${fmtNum(value)}</div>
    <div class="kpi-label">${safe(label)}</div>
    ${hint ? `<div class="kpi-hint">${safe(hint)}</div>` : ''}`;
  return href ? `<a class="kpi-card" href="${attr(href)}">${inner}</a>` : `<div class="kpi-card">${inner}</div>`;
}

function funnelBar(label, value, max, tone) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return `<div class="funnel-row"><div class="funnel-top"><span>${safe(label)}</span><b>${fmtNum(value)}</b></div>
    <div class="funnel-bar"><i class="${tone}" style="width:${Math.max(2, pct)}%"></i></div></div>`;
}

function activityText(a, ctx) {
  const labelKey = `activity.${a.kind}`;
  const base = ctx.t(labelKey);
  const d = a.detail || {};
  let detail = '';
  if (ctx.lang === 'zh' && d.label) detail = d.label;
  else if (d.requirement && d.listing) detail = `${d.requirement} ↔ ${d.listing}`;
  else if (d.requirement) detail = d.requirement;
  else if (d.listing) detail = d.listing;
  else if (d.client_name) detail = d.client_name;
  else if (d.title) detail = d.title;
  else if (ctx.lang === 'zh' && d.label) detail = d.label;
  return `<div class="activity-row">
    <span class="activity-dot"></span>
    <div class="activity-copy"><b>${safe(base)}</b>${detail ? `<span>${safe(detail)}</span>` : ''}</div>
    <span class="activity-time">${safe(timeAgo(a.created_at, ctx))}</span>
  </div>`;
}

export function dashboardView(data, state, ctx) {
  const hour = new Date().getHours();
  const greetingKey =
    hour < 5
      ? 'dash.greetingNight'
      : hour < 12
        ? 'dash.greeting'
        : hour < 18
          ? 'dash.greetingAfternoon'
          : 'dash.greetingEvening';
  const stats = data.stats || {};
  const pairs = data.topPairs || [];
  const followUps = data.followUps || [];
  const funnel = data.funnel || {};
  const funnelMax = Math.max(1, ...Object.values(funnel));
  const areaDemand = data.areaDemand || [];
  const activity = data.activity || [];
  return `${pageHead({
    eyebrow: ctx.lang === 'zh' ? '工作台' : 'Workspace',
    title: ctx.t(greetingKey, {name: (state.user?.name || '').split(' ')[0]}),
    sub: stats.strongPairs
      ? ctx.t('dash.subtitle', {n: stats.strongPairs})
      : ctx.t('dash.subtitleEmpty'),
    actions: `<button type="button" class="btn gold" data-action="new-requirement">${icon('plus', 17)}${ctx.t('req.new')}</button>
      <button type="button" class="btn outline" data-action="new-listing">${icon('plus', 17)}${ctx.t('lst.new')}</button>`
  })}
  <div class="kpi-grid">
    ${kpiCard({label: ctx.t('dash.kpi.activeReq'), value: stats.activeRequirements, hint: `${stats.newRequirements || 0} ${ctx.lang === 'zh' ? '本周新增' : 'new this week'}`, iconName: 'target', href: '#/requirements'})}
    ${kpiCard({label: ctx.t('dash.kpi.availableListings'), value: stats.availableListings, hint: `${stats.newListings || 0} ${ctx.lang === 'zh' ? '本周新增' : 'new this week'}`, iconName: 'home', href: '#/listings'})}
    ${kpiCard({label: ctx.t('dash.kpi.strongPairs'), value: stats.strongPairs, hint: ctx.t('dash.kpi.strongHint'), iconName: 'spark', href: '#/matches', tone: 'gold'})}
    ${kpiCard({label: ctx.t('dash.kpi.followUps'), value: stats.followUpsDue, hint: ctx.t('dash.kpi.followHint'), iconName: 'calendar', href: '#/requirements', tone: stats.followUpsDue ? 'red' : ''})}
  </div>
  <div class="dash-grid">
    <section class="panel">
      ${sectionHead(
        ctx.t('dash.todayTitle'),
        ctx.t('dash.todayHint'),
        `<a class="linkbtn" href="#/matches">${ctx.t('common.viewAll')} ${icon('chevron-right', 15)}</a>`
      )}
      <div class="pair-list">
        ${pairs.length ? pairs.slice(0, 5).map((p) => pairCard(p, ctx, {compact: true})).join('') : emptyState({
          iconName: 'spark',
          title: ctx.t('dash.noPairs'),
          body: ctx.t('match.emptyBody'),
          cta: `<button class="btn gold" type="button" data-action="new-requirement">${ctx.t('empty.addFirstReq')}</button>`
        })}
      </div>
    </section>
    <aside class="dash-side">
      <section class="panel">
        ${sectionHead(ctx.t('dash.followTitle'), ctx.t('dash.followHint'))}
        <div class="follow-list">
          ${followUps.length ? followUps.map((f) => {
            const overdue = f.days < 0;
            const dueToday = f.days === 0;
            return `<a class="follow-row" href="#/requirements/${f.requirement.id}">
              <div class="follow-top">
                <b>${safe(f.requirement.client_name)}</b>
                <span class="due ${overdue ? 'red' : dueToday ? 'amber' : ''}">${daysLabel(f.days, ctx)}</span>
              </div>
              <div class="follow-sub">${safe(budgetText(f.requirement, ctx))} · ${safe((f.requirement.areas || []).map((a) => areaLabel(a, ctx)).slice(0, 2).join(ctx.lang === 'en' ? ', ' : '、'))}</div>
              ${f.best ? `<div class="follow-best">${icon('spark', 13)} ${safe(listingTitle(f.best.listing, ctx.lang))} · ${f.best.score}</div>` : ''}
            </a>`;
          }).join('') : `<p class="muted small">${ctx.t('dash.noFollow')}</p>`}
        </div>
      </section>
      <section class="panel">
        ${sectionHead(ctx.t('dash.funnelTitle'))}
        <div class="funnel">
          ${funnelBar(ctx.t('dash.funnel.shortlisted'), funnel.shortlisted || 0, funnelMax, 'amber')}
          ${funnelBar(ctx.t('dash.funnel.sent'), funnel.sent || 0, funnelMax, 'blue')}
          ${funnelBar(ctx.t('dash.funnel.viewed'), funnel.viewed || 0, funnelMax, 'blue')}
          ${funnelBar(ctx.t('dash.funnel.offer'), funnel.offer || 0, funnelMax, 'gold')}
          ${funnelBar(ctx.t('dash.funnel.won'), funnel.won || 0, funnelMax, 'green')}
        </div>
      </section>
    </aside>
  </div>
  <div class="dash-grid lower">
    <section class="panel">
      ${sectionHead(ctx.t('dash.activityTitle'))}
      <div class="activity-list">
        ${activity.length ? activity.map((a) => activityText(a, ctx)).join('') : `<p class="muted small">${ctx.t('dash.noActivity')}</p>`}
      </div>
    </section>
    <aside class="dash-side">
      <section class="panel">
        ${sectionHead(ctx.t('dash.demandTitle'))}
        ${areaDemand.length ? `<div class="demand-list">${areaDemand.map((a) => `<div class="demand-row"><span>${safe(a.area)}</span><b>${a.count}</b></div>`).join('')}</div>` : `<p class="muted small">${ctx.t('common.noData')}</p>`}
      </section>
      <section class="panel">
        ${sectionHead(ctx.t('dash.weekTitle'))}
        ${monthGrid(data.activityByDay || [], ctx)}
      </section>
    </aside>
  </div>
  <div class="dash-cta">
    <span>${icon('spark', 18)} ${ctx.t('dash.quickTitle')}</span>
    <button class="btn outline sm" type="button" data-action="new-requirement">${ctx.t('dash.quickReq')}</button>
    <button class="btn outline sm" type="button" data-action="new-listing">${ctx.t('dash.quickListing')}</button>
    <a class="btn outline sm" href="#/matches">${ctx.t('dash.quickMatch')}</a>
  </div>`;
}

export function pairCard(p, ctx, opts = {}) {
  const r = p.requirement || {};
  const l = p.listing || {};
  const compact = !!opts.compact;
  return `<article class="pair-card ${compact ? 'compact' : ''}">
    <div class="pair-upper">
      <div class="pair-req">
        <div class="pair-req-head">
          ${avatar(r.client_name || '', compact ? 'sm' : 'md')}
          <div class="pair-req-copy">
            <a class="pair-name" href="#/requirements/${r.id}">${safe(r.client_name || '')}</a>
            <p class="pair-budget">${safe(budgetText(r, ctx))}</p>
          </div>
          ${statusBadge(r.status || 'active', ctx, 'requirement')}
        </div>
        <div class="pair-meta">
          <span class="mini-chip outline">${intentLabel(r.intent, ctx)}</span>
          ${(r.areas || []).slice(0, 3).map((a) => `<span class="mini-chip">${safe(areaLabel(a, ctx))}</span>`).join('')}
          ${r.timeline ? `<span class="mini-chip outline">${safe((ctx.meta.timelines.find((x) => x.key === r.timeline) || {})[ctx.lang] || '')}</span>` : ''}
        </div>
      </div>
      <div class="pair-connector">${icon('arrowRight', 18)}</div>
      <div class="pair-listing">
        ${listingThumb(l, ctx, 'sm')}
        <div class="pair-listing-copy">
          <a class="pair-name" href="#/listings/${l.id}">${safe(listingTitle(l, ctx.lang))}</a>
          <p>${safe(priceText(l, ctx))} · ${safe(listingSpecs(l, ctx).slice(0, 3).join(' · '))}</p>
        </div>
      </div>
      <button type="button" class="score-btn" data-action="view-score" data-req="${r.id}" data-listing="${l.id}" aria-label="${ctx.t('match.viewScore')}">
        ${scoreRing(p.score, {size: compact ? 'sm' : 'md'})}
      </button>
    </div>
    ${reasonChips(p, ctx, compact ? 2 : 3)}
    <div class="pair-foot">
      <div class="pair-foot-meta">
        ${confidenceMeter(p.confidence, ctx, compact)}
        ${p.penalties?.length ? `<span class="mini-flag">${ctx.t('match.penalty')} ${p.penalties.reduce((s, x) => s + x.points, 0)}</span>` : ''}
      </div>
      ${actionButtons(p, ctx, {hideView: compact})}
    </div>
  </article>`;
}

function requirementCard(r, summary, ctx) {
  const s = summary || {eligible: 0, strong: 0};
  const overdue = r.follow_up && r.follow_up < todayISO();
  return `<article class="entity-card req-card" data-entity="requirement" data-id="${r.id}">
    <div class="entity-head">
      ${avatar(r.client_name, 'md')}
      <div class="entity-title">
        <a href="#/requirements/${r.id}" class="entity-name">${safe(r.client_name)}</a>
        <p>${intentLabel(r.intent, ctx)} · ${r.purpose === 'invest' ? ctx.t('req.purpose.invest') : ctx.t('req.purpose.own')} · ${safe(r.ref || '')}</p>
      </div>
      <div class="entity-badges">
        ${statusBadge(r.status || 'active', ctx, 'requirement')}
        ${overdue ? badge(ctx.t('days.overdue', {n: Math.abs(Math.round((Date.parse(todayISO()) - Date.parse(r.follow_up)) / 86400000))}), 'red') : ''}
      </div>
    </div>
    <div class="budget-line">${safe(budgetText(r, ctx))}</div>
    <div class="entity-chips">
      ${(r.areas || []).slice(0, 3).map((a) => `<span class="chip cream">${safe(areaLabel(a, ctx))}</span>`).join('')}
      ${(r.areas || []).length > 3 ? `<span class="chip cream">+${r.areas.length - 3}</span>` : ''}
      ${(r.types || []).slice(0, 2).map((t) => `<span class="chip outline">${safe(typeLabel(t, ctx))}</span>`).join('')}
    </div>
    <p class="entity-spec">
      ${[r.beds_min ? `${r.beds_min}+ ${ctx.lang === 'zh' ? '房' : 'beds'}` : '', r.built_up_min ? `${fmtNum(r.built_up_min)}+ sqft` : '', r.tenure_pref !== 'any' ? tenureLabel(r.tenure_pref, ctx) : ''].filter(Boolean).join(' · ') || ctx.t('common.noData')}
    </p>
    <div class="entity-foot">
      <span class="match-pill ${s.eligible ? 'has' : ''}">${icon('spark', 13)} ${s.eligible ? ctx.t('req.matchCount', {n: s.eligible}) : ctx.t('req.noMatchShort')}${s.strong ? ` · ${s.strong} ★` : ''}</span>
      <div class="entity-actions">
        <button type="button" class="icon-btn" data-action="edit-requirement" data-id="${r.id}" title="${ctx.t('common.edit')}">${icon('edit', 16)}</button>
        <a class="textlink" href="#/requirements/${r.id}">${ctx.t('common.view')} ${icon('chevron-right', 14)}</a>
      </div>
    </div>
  </article>`;
}

export function requirementsView(state, ctx) {
  const list = filteredRequirements(state);
  const activeCount = state.requirements.filter((r) => r.status === 'active').length;
  return `${pageHead({
    eyebrow: ctx.lang === 'zh' ? '需求库' : 'Briefs',
    title: ctx.t('req.title'),
    sub: ctx.t('req.subtitle'),
    actions: `<button type="button" class="btn gold" data-action="new-requirement">${icon('plus', 17)}${ctx.t('req.new')}</button>`
  })}
  <div class="toolbar">
    <div class="searchbox">${icon('search', 17)}<input id="req-search" data-filter="req-q" placeholder="${ctx.t('req.searchPlaceholder')}" value="${safe(state.filters.req.q)}"></div>
    <div class="segmented" role="tablist">
      ${['', 'buy', 'rent'].map((v) => `<button type="button" class="${state.filters.req.intent === v ? 'on' : ''}" data-filter-intent="req" data-value="${v}">${v === '' ? ctx.t('common.all') : v === 'buy' ? ctx.t('req.buy') : ctx.t('req.rent')}</button>`).join('')}
    </div>
    <select data-filter="req-status" class="select slim">
      <option value="">${ctx.t('common.all')}</option>
      ${(ctx.meta.requirement_statuses || []).map((s) => `<option value="${s.key}" ${state.filters.req.status === s.key ? 'selected' : ''}>${safe(s[ctx.lang] || s.zh)}</option>`).join('')}
    </select>
    <span class="toolbar-count">${ctx.t('req.found', {n: list.length})}${activeCount ? ` · ${activeCount} ${ctx.lang === 'zh' ? '跟进中' : 'active'}` : ''}</span>
  </div>
  <div id="req-list" class="entity-grid">
    ${list.length ? list.map((r) => requirementCard(r, state.summary.requirements?.[r.id], ctx)).join('') : emptyState({
      iconName: 'target',
      title: state.requirements.length ? ctx.t('common.noData') : ctx.t('req.emptyTitle'),
      body: state.requirements.length ? ctx.t('req.detailNoMatchBody', {pct: 10}) : ctx.t('req.emptyBody'),
      cta: `<button class="btn gold" type="button" data-action="new-requirement">${ctx.t('empty.addFirstReq')}</button>`
    })}
  </div>`;
}

function filteredRequirements(state) {
  const f = state.filters.req;
  const q = (f.q || '').trim().toLowerCase();
  return state.requirements
    .filter((r) => (f.intent ? r.intent === f.intent : true))
    .filter((r) => (f.status ? r.status === f.status : true))
    .filter((r) =>
      q
        ? [r.client_name, r.notes, r.ref, ...(r.areas || [])].filter(Boolean).join(' ').toLowerCase().includes(q)
        : true
    )
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function listingCard(l, summary, ctx) {
  const s = summary || {eligible: 0, strong: 0};
  return `<article class="entity-card listing-card">
    <a class="listing-cover" href="#/listings/${l.id}">
      ${listingThumb(l, ctx, 'card')}
      ${statusBadge(l.status, ctx)}
    </a>
    <div class="listing-body">
      <div class="entity-head">
        <div class="entity-title">
          <a href="#/listings/${l.id}" class="entity-name">${safe(listingTitle(l, ctx.lang))}</a>
          <p>${safe(addr(l, ctx))} · ${safe(l.ref || '')}</p>
        </div>
      </div>
      <div class="budget-line">${safe(priceText(l, ctx))} ${l.negotiable ? `<span class="tiny">${ctx.t('lst.negotiable')}</span>` : ''}</div>
      ${specPills(l, ctx, 4)}
      ${tagPills(l, ctx, 3)}
      <div class="entity-foot">
        <span class="match-pill ${s.eligible ? 'has' : ''}">${icon('users', 13)} ${s.eligible ? ctx.t('lst.matchCount', {n: s.eligible}) : ctx.t('lst.noMatchShort')}${s.strong ? ` · ${s.strong} ★` : ''}</span>
        <div class="entity-actions">
          <button type="button" class="icon-btn" data-action="edit-listing" data-id="${l.id}" title="${ctx.t('common.edit')}">${icon('edit', 16)}</button>
          <a class="textlink" href="#/listings/${l.id}">${ctx.t('common.view')} ${icon('chevron-right', 14)}</a>
        </div>
      </div>
    </div>
  </article>`;
}

export function listingsView(state, ctx) {
  const list = filteredListings(state);
  return `${pageHead({
    eyebrow: ctx.lang === 'zh' ? '房源库' : 'Inventory',
    title: ctx.t('lst.title'),
    sub: ctx.t('lst.subtitle'),
    actions: `<button type="button" class="btn gold" data-action="new-listing">${icon('plus', 17)}${ctx.t('lst.new')}</button>`
  })}
  <div class="toolbar">
    <div class="searchbox">${icon('search', 17)}<input id="lst-search" data-filter="lst-q" placeholder="${ctx.t('lst.searchPlaceholder')}" value="${safe(state.filters.lst.q)}"></div>
    <div class="segmented" role="tablist">
      ${['', 'sale', 'rent'].map((v) => `<button type="button" class="${state.filters.lst.intent === v ? 'on' : ''}" data-filter-intent="lst" data-value="${v}">${v === '' ? ctx.t('common.all') : v === 'sale' ? ctx.t('lst.buy') : ctx.t('lst.rent')}</button>`).join('')}
    </div>
    <select data-filter="lst-status" class="select slim">
      <option value="">${ctx.t('common.all')}</option>
      ${(ctx.meta.listing_statuses || []).map((s) => `<option value="${s.key}" ${state.filters.lst.status === s.key ? 'selected' : ''}>${safe(s[ctx.lang] || s.zh)}</option>`).join('')}
    </select>
    <select data-filter="lst-type" class="select slim">
      <option value="">${ctx.lang === 'zh' ? '全部房型' : 'All types'}</option>
      ${(ctx.meta.property_types || []).map((t) => `<option value="${t.key}" ${state.filters.lst.type === t.key ? 'selected' : ''}>${safe(t[ctx.lang] || t.zh)}</option>`).join('')}
    </select>
    <span class="toolbar-count">${ctx.t('lst.found', {n: list.length})}</span>
  </div>
  <div id="lst-list" class="listing-grid">
    ${list.length ? list.map((l) => listingCard(l, state.summary.listings?.[l.id], ctx)).join('') : emptyState({
      iconName: 'home',
      title: state.listings.length ? ctx.t('common.noData') : ctx.t('lst.emptyTitle'),
      body: ctx.t('lst.emptyBody'),
      cta: `<button class="btn gold" type="button" data-action="new-listing">${ctx.t('empty.addFirstListing')}</button>`
    })}
  </div>`;
}

function filteredListings(state) {
  const f = state.filters.lst;
  const q = (f.q || '').trim().toLowerCase();
  return state.listings
    .filter((l) => (f.intent ? l.intent === f.intent : true))
    .filter((l) => (f.status ? l.status === f.status : true))
    .filter((l) => (f.type ? l.type === f.type : true))
    .filter((l) =>
      q
        ? [l.title, l.title_en, l.area, l.address, l.ref].filter(Boolean).join(' ').toLowerCase().includes(q)
        : true
    )
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function requirementDetailView(data, state, ctx) {
  const r = data.requirement;
  const aff = data.affordability;
  const matches = (data.matches || []).filter(Boolean);
  const near = (data.near_misses || []).filter(Boolean);
  const counts = data.counts || {eligible: matches.length, strong: 0, near: near.length};
  const contacted = matches.filter((m) => m.action);
  return `<div class="detail-head">
    <a class="backlink" href="#/requirements">${icon('chevron-left', 16)} ${ctx.t('nav.requirements')}</a>
    <div class="detail-title-row">
      <div class="detail-title-left">
        ${avatar(r.client_name, 'lg')}
        <div>
          <p class="eyebrow">${safe(r.ref || '')} · ${intentLabel(r.intent, ctx)}</p>
          <h1>${safe(r.client_name)}</h1>
          <div class="detail-badges">
            ${statusBadge(r.status || 'active', ctx, 'requirement')}
            ${badge(r.purpose === 'invest' ? ctx.t('req.purpose.invest') : ctx.t('req.purpose.own'), 'cream')}
            ${badge((ctx.meta.timelines.find((t) => t.key === r.timeline) || {})[ctx.lang] || '', 'outline')}
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn ghost" data-action="edit-requirement" data-id="${r.id}">${icon('edit', 16)}${ctx.t('common.edit')}</button>
        <button type="button" class="icon-btn danger" data-action="delete-requirement" data-id="${r.id}" title="${ctx.t('common.delete')}">${icon('trash', 17)}</button>
        <button type="button" class="btn primary" data-action="new-requirement">${icon('plus', 16)}${ctx.t('req.new')}</button>
      </div>
    </div>
  </div>
  <div class="detail-grid">
    <div class="detail-main">
      <section class="panel brief-panel">
        ${sectionHead(ctx.t('req.detailOverview'), '', `<span class="panel-kicker">${safe(budgetText(r, ctx))}</span>`)}
        <div class="fact-grid">
          <div class="fact"><span>${ctx.t('req.budget')}</span><b>${safe(budgetText(r, ctx))}</b></div>
          <div class="fact"><span>${ctx.t('req.timeline')}</span><b>${safe((ctx.meta.timelines.find((t) => t.key === r.timeline) || {})[ctx.lang] || '—')}</b></div>
          <div class="fact"><span>${ctx.t('req.priority')}</span><b>${safe((ctx.meta.priorities.find((p) => p.key === r.priority) || {})[ctx.lang] || '—')}</b></div>
          <div class="fact"><span>${ctx.t('req.source')}</span><b>${safe((ctx.meta.sources.find((s) => s.key === r.source) || {})[ctx.lang] || '—')}</b></div>
        </div>
        <div class="brief-block"><h4>${ctx.t('req.locationType')}</h4>
          <div class="entity-chips">${(r.areas || []).map((a) => `<span class="chip cream">${safe(areaLabel(a, ctx))}</span>`).join('') || `<span class="muted small">${ctx.lang === 'zh' ? '区域不限' : 'Any area'}</span>`}</div>
          <div class="entity-chips">${(r.types || []).map((t) => `<span class="chip outline">${safe(typeLabel(t, ctx))}</span>`).join('')}</div>
          <p class="entity-spec">${[
            r.beds_min ? `${r.beds_min}+ ${ctx.lang === 'zh' ? '房' : 'beds'}` : '',
            r.baths_min ? `${r.baths_min}+ ${ctx.lang === 'zh' ? '浴' : 'baths'}` : '',
            r.built_up_min ? `${fmtNum(r.built_up_min)}+ sqft` : '',
            r.carparks_min ? `${r.carparks_min}+ ${ctx.lang === 'zh' ? '车位' : 'carparks'}` : '',
            r.max_age_years ? `≤ ${r.max_age_years} ${ctx.lang === 'zh' ? '年楼龄' : 'yrs old'}` : '',
            r.tenure_pref !== 'any' ? tenureLabel(r.tenure_pref, ctx) : '',
            r.furnishing_min !== 'any' ? furnishingLabel(r.furnishing_min, ctx) : '',
            r.condition_pref !== 'any' ? conditionLabel(r.condition_pref, ctx) : ''
          ].filter(Boolean).join(' · ') || ctx.t('req.noSpecs')}</p>
        </div>
        ${(r.must_tags?.length || r.pref_tags?.length || r.avoid_tags?.length) ? `<div class="brief-block"><h4>${ctx.t('form.section.preferences')}</h4>
          <div class="pref-lines">
            ${r.must_tags?.length ? `<div><span class="pref-label">${ctx.t('form.f.mustTags')}</span>${r.must_tags.map((t) => `<span class="chip green">${safe(tagLabel(t, ctx))}</span>`).join('')}</div>` : ''}
            ${r.pref_tags?.length ? `<div><span class="pref-label">${ctx.t('form.f.prefTags')}</span>${r.pref_tags.map((t) => `<span class="chip cream">${safe(tagLabel(t, ctx))}</span>`).join('')}</div>` : ''}
            ${r.avoid_tags?.length ? `<div><span class="pref-label">${ctx.t('form.f.avoidTags')}</span>${r.avoid_tags.map((t) => `<span class="chip red">${safe(tagLabel(t, ctx))}</span>`).join('')}</div>` : ''}
          </div>
        </div>` : ''}
        ${r.notes ? `<div class="brief-block"><h4>${ctx.t('req.notes')}</h4><p class="notes">${safe(r.notes)}</p></div>` : ''}
      </section>
      <section class="panel matches-panel">
        ${sectionHead(
          `${ctx.t('req.detailMatches')} <span class="count-pill">${counts.eligible}</span>`,
          ctx.lang === 'zh' ? `${counts.strong} 个强匹配 · 按匹配分排序` : `${counts.strong} strong · ranked by score`,
          `<button type="button" class="linkbtn" data-action="send-brief" data-id="${r.id}">${icon('copy', 14)} ${ctx.t('req.sendBrief')}</button>`
        )}
        <div class="match-list">
          ${matches.length ? matches.map((m) => matchRow(m, ctx, 'listing')).join('') : emptyState({
            iconName: 'target',
            title: ctx.t('req.detailNoMatch'),
            body: ctx.t('req.detailNoMatchBody', {pct: r.stretch_pct || 10}),
            cta: `<button class="btn outline" type="button" data-action="edit-requirement" data-id="${r.id}">${ctx.t('common.edit')}</button>`
          })}
        </div>
      </section>
      <section class="panel near-panel">
        ${sectionHead(ctx.t('req.detailNear'), ctx.t('req.detailNearHint'))}
        ${near.length ? `<div class="near-list">${near.map((m) => nearRow(m, ctx, 'listing')).join('')}</div>` : `<p class="muted small">${ctx.t('req.detailNoNear')}</p>`}
      </section>
    </div>
    <aside class="detail-side">
      ${affordabilityCard(r, aff, ctx)}
      ${contactCard(r, ctx)}
      <section class="panel side-panel">
        <h3>${icon('calendar', 17)} ${ctx.t('req.followUp')}</h3>
        ${r.follow_up ? `<div class="side-big">${safe(fmtDate(r.follow_up, ctx.lang))}</div><p class="muted small">${safe(daysLabel(Math.round((Date.parse(r.follow_up) - Date.parse(todayISO())) / 86400000), ctx))}</p>` : `<p class="muted small">${ctx.t('common.none')}</p>`}
        <button type="button" class="btn outline sm block" data-action="edit-requirement" data-id="${r.id}">${icon('calendar', 15)} ${ctx.t('req.followUp')}</button>
      </section>
      <section class="panel side-panel">
        <h3>${icon('chart', 17)} ${ctx.t('req.matchSummary')}</h3>
        <div class="mini-stats">
          <div><b>${counts.eligible}</b><span>${ctx.t('match.eligible')}</span></div>
          <div><b>${counts.strong}</b><span>${ctx.t('match.strong')}</span></div>
          <div><b>${counts.near}</b><span>${ctx.t('match.near')}</span></div>
        </div>
        ${contacted.length ? `<p class="muted small">${ctx.lang === 'zh' ? '已跟进 ' + contacted.length + ' 个房源' : contacted.length + ' contacted'}</p>` : ''}
      </section>
    </aside>
  </div>`;
}

function affordabilityCard(req, aff, ctx) {
  if (!aff) {
    return `<section class="panel side-panel">
      <h3>${icon('wallet', 17)} ${ctx.t('req.affordability')}</h3>
      <p class="muted small">${ctx.t('form.f.financeHint')}</p>
      <button type="button" class="btn outline sm block" data-action="edit-requirement" data-id="${req.id}">${icon('plus', 15)} ${ctx.t('form.section.finance')}</button>
    </section>`;
  }
  const isRent = aff.kind === 'rent';
  const max = isRent ? aff.maxRent : aff.maxPrice;
  const budget = req.budget_max || 0;
  let note = '';
  let tone = 'green';
  if (isRent) {
    note = budget > aff.maxRent * 1.05
      ? ctx.t('req.budgetAbove', {amount: fmtMoney(budget - aff.maxRent, ctx.lang)})
      : ctx.t('req.budgetAligned');
    tone = budget > aff.maxRent * 1.05 ? 'amber' : 'green';
  } else if (aff.cash == null) {
    note = ctx.t('req.cashUnknownHint');
    tone = 'blue';
  } else if (max <= 0) {
    note = ctx.t('req.cashTooLow');
    tone = 'amber';
  } else if (budget > max * 1.05) {
    note = ctx.t('req.budgetAbove', {amount: fmtMoney(budget - max, ctx.lang)});
    tone = 'amber';
  } else if (budget < max * 0.8) {
    note = ctx.t('req.budgetConservative', {amount: fmtMoney(max - budget, ctx.lang)});
    tone = 'blue';
  } else {
    note = ctx.t('req.budgetAligned');
  }
  return `<section class="panel side-panel afford-panel">
    <h3>${icon('wallet', 17)} ${ctx.t('req.affordability')}</h3>
    <p class="eyebrow small">${isRent ? ctx.t('req.affordabilityRent') : ctx.t('req.affordabilityMax')}</p>
    <div class="side-big">${isRent ? safe(fmtMoney(max, ctx.lang) + ctx.t('common.perMonth')) : safe(fmtMoney(max, ctx.lang))}</div>
    <div class="side-rows">
      ${isRent
        ? `<div class="side-row"><span>${ctx.t('req.income')}</span><b>${safe(fmtMoney(aff.income, ctx.lang))}</b></div>
           <div class="side-row"><span>${ctx.t('form.f.rentRatio')}</span><b>${fmtPct(aff.ratio)}</b></div>`
        : `<div class="side-row"><span>${ctx.t('req.maxLoan')}</span><b>${safe(fmtMoney(aff.maxLoan, ctx.lang))}</b></div>
           <div class="side-row"><span>${ctx.t('req.monthlyAtBudget')}</span><b>${safe(fmtMoney(aff.monthlyForBudget, ctx.lang))}</b></div>
           ${aff.maxPriceByCash != null ? `<div class="side-row"><span>${ctx.t('req.cashLimitedPrice')}</span><b>${safe(fmtMoney(Math.min(aff.maxPriceByCash, aff.maxPriceByLoan), ctx.lang))}</b></div>` : ''}
           <div class="side-row"><span>${ctx.t('req.income')} / ${ctx.t('req.commitments')}</span><b>${safe(fmtMoney(aff.income, ctx.lang))} / ${safe(fmtMoney(aff.commitments, ctx.lang))}</b></div>`}
      ${!isRent ? `<div class="side-row"><span>${ctx.t('form.f.cash')}</span><b>${aff.cash == null ? safe(ctx.t('common.none')) : safe(fmtMoney(aff.cash, ctx.lang))}</b></div>` : ''}
    </div>
    <p class="alert ${tone}">${safe(note)}</p>
    <p class="hint">${ctx.t('req.affordHint', {rate: aff.rate, years: aff.years, margin: aff.margin})}</p>
  </section>`;
}

function contactCard(req, ctx) {
  const phone = req.whatsapp || req.phone;
  return `<section class="panel side-panel">
    <h3>${icon('user', 17)} ${ctx.t('req.contact')}</h3>
    <div class="contact-rows">
      ${phone ? `<a class="contact-row" href="tel:${safe(phone)}">${icon('phone', 16)}<span>${safe(phone)}</span></a>` : ''}
      ${phone ? `<a class="contact-row" href="https://wa.me/${safe(phoneDigits(phone))}" target="_blank" rel="noopener">${icon('message', 16)}<span>${ctx.t('common.whatsapp')}</span></a>` : ''}
      ${req.email ? `<a class="contact-row" href="mailto:${safe(req.email)}">${icon('send', 16)}<span>${safe(req.email)}</span></a>` : ''}
      ${!phone && !req.email ? `<p class="muted small">${ctx.t('common.none')}</p>` : ''}
    </div>
  </section>`;
}

export function listingDetailView(data, state, ctx) {
  const l = data.listing;
  const insight = data.insight;
  const market = data.market;
  const matches = data.matches || [];
  const near = data.near_misses || [];
  const photos = (l.photos && l.photos.length ? l.photos : l.photo ? [l.photo] : []).filter(Boolean);
  const galleryItems = photos.slice(0, 3);
  const galleryClass = !photos.length
    ? 'empty'
    : photos.length === 1
      ? 'single'
      : photos.length === 2
        ? 'two'
        : '';
  return `<div class="detail-head">
    <a class="backlink" href="#/listings">${icon('chevron-left', 16)} ${ctx.t('nav.listings')}</a>
    <div class="detail-title-row">
      <div class="detail-title-left">
        <div>
          <p class="eyebrow">${safe(l.ref || '')} · ${l.intent === 'rent' ? ctx.t('lst.rent') : ctx.t('lst.buy')} · ${safe(typeLabel(l.type, ctx))}</p>
          <h1>${safe(listingTitle(l, ctx.lang))}</h1>
          <div class="detail-badges">
            ${statusBadge(l.status, ctx)}
            ${l.negotiable ? badge(ctx.t('lst.negotiable'), 'cream') : ''}
            ${l.mandate ? badge(ctx.t('lst.mandate.' + l.mandate), 'outline') : ''}
            ${l.ref ? badge(safe(l.ref), 'outline') : ''}
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn ghost" data-action="edit-listing" data-id="${l.id}">${icon('edit', 16)}${ctx.t('common.edit')}</button>
        <button type="button" class="icon-btn danger" data-action="delete-listing" data-id="${l.id}" title="${ctx.t('common.delete')}">${icon('trash', 17)}</button>
        <button type="button" class="btn primary" data-action="new-listing">${icon('plus', 16)}${ctx.t('lst.new')}</button>
      </div>
    </div>
  </div>
  <div class="gallery ${galleryClass}">
    ${photos.length
      ? galleryItems.map((p, i) => `<button type="button" class="gallery-item ${i === 0 ? 'main' : ''}" data-action="open-photo" data-src="${attr(p)}"><img loading="lazy" src="${attr(p)}" alt="${attr(l.title || '')}">${i === 2 && photos.length > 3 ? `<span class="gallery-more">+${photos.length - 3}</span>` : ''}</button>`).join('')
      : `<div class="gallery-empty"><span class="gallery-empty-icon">${icon('home', 24)}</span><span>${ctx.t('lst.noPhoto')}</span></div>`}
  </div>
  <div class="detail-grid">
    <div class="detail-main">
      <section class="panel">
        <div class="listing-hero-line">
          <div class="price-big">${safe(priceText(l, ctx))}</div>
          ${l.negotiable ? `<span class="chip cream">${ctx.t('lst.negotiable')}</span>` : ''}
          <span class="muted">${safe(addr(l, ctx))}</span>
        </div>
        <div class="fact-grid four">
          ${l.beds != null ? `<div class="fact"><span>${ctx.t('form.f.beds')}</span><b>${fmtNum(l.beds)}</b></div>` : ''}
          ${l.baths != null ? `<div class="fact"><span>${ctx.t('form.f.baths')}</span><b>${fmtNum(l.baths)}</b></div>` : ''}
          ${l.built_up != null ? `<div class="fact"><span>${ctx.t('form.f.builtUp')}</span><b>${fmtNum(l.built_up)}</b></div>` : ''}
          ${l.land_area != null ? `<div class="fact"><span>${ctx.t('form.f.landArea')}</span><b>${fmtNum(l.land_area)}</b></div>` : ''}
          ${l.storeys != null ? `<div class="fact"><span>${ctx.t('form.f.storeys')}</span><b>${fmtNum(l.storeys)}</b></div>` : ''}
          ${l.carparks != null ? `<div class="fact"><span>${ctx.t('form.f.carparks')}</span><b>${fmtNum(l.carparks)}</b></div>` : ''}
          ${l.tenure ? `<div class="fact"><span>${ctx.t('form.f.tenure')}</span><b>${safe(tenureLabel(l.tenure, ctx))}</b></div>` : ''}
          ${l.furnishing ? `<div class="fact"><span>${ctx.t('form.f.furnishing')}</span><b>${safe(furnishingLabel(l.furnishing, ctx))}</b></div>` : ''}
          ${l.condition ? `<div class="fact"><span>${ctx.t('form.f.condition')}</span><b>${safe(conditionLabel(l.condition, ctx))}</b></div>` : ''}
          ${l.year_built ? `<div class="fact"><span>${ctx.t('form.f.yearBuilt')}</span><b>${fmtNum(l.year_built)}</b></div>` : ''}
        </div>
        ${l.tags?.length ? `<div class="tag-pills large">${l.tags.map((t) => `<span class="tag-pill">${safe(tagLabel(t, ctx))}</span>`).join('')}</div>` : ''}
        ${l.notes ? `<div class="brief-block"><h4>${ctx.t('lst.detailNotes')}</h4><p class="notes">${safe(l.notes)}</p></div>` : ''}
      </section>
      <section class="panel matches-panel">
        ${sectionHead(
          `${ctx.t('lst.detailFit')} <span class="count-pill">${matches.length}</span>`,
          ctx.t('lst.detailFitHint')
        )}
        <div class="match-list">
          ${matches.length ? matches.map((m) => matchRow(m, ctx, 'requirement')).join('') : emptyState({
            iconName: 'users',
            title: ctx.t('lst.detailNoFit'),
            body: ctx.t('lst.detailNoFitBody')
          })}
        </div>
      </section>
      <section class="panel near-panel">
        ${sectionHead(ctx.t('lst.detailNear'), ctx.t('req.detailNearHint'))}
        ${near.length ? `<div class="near-list">${near.map((m) => nearRow(m, ctx, 'requirement')).join('')}</div>` : `<p class="muted small">${ctx.t('lst.noNearClients')}</p>`}
      </section>
    </div>
    <aside class="detail-side">
      ${insightCard(l, insight, ctx)}
      ${marketCard(market, ctx)}
      ${sellerCard(l, ctx)}
    </aside>
  </div>`;
}

function insightCard(l, insight, ctx) {
  if (!insight) return '';
  if (insight.kind === 'rent') {
    const up = insight.upfront;
    return `<section class="panel side-panel">
      <h3>${icon('wallet', 17)} ${ctx.t('lst.detailRentUpfront')}</h3>
      <div class="side-big">${safe(fmtMoney(up.total, ctx.lang))}</div>
      <div class="side-rows">
        <div class="side-row"><span>${ctx.t('lst.rentDeposit')}</span><b>${safe(fmtMoney(up.deposit, ctx.lang))}</b></div>
        <div class="side-row"><span>${ctx.t('lst.rentAdvance')}</span><b>${safe(fmtMoney(up.advance, ctx.lang))}</b></div>
        <div class="side-row"><span>${ctx.t('lst.rentUtility')}</span><b>${safe(fmtMoney(up.utility, ctx.lang))}</b></div>
        <div class="side-row"><span>${ctx.t('lst.rentStamp')}</span><b>${safe(fmtMoney(up.stamp, ctx.lang))}</b></div>
      </div>
      <p class="hint">${ctx.t('app.disclaimer')}</p>
    </section>`;
  }
  const e = insight.entry;
  return `<section class="panel side-panel">
    <h3>${icon('wallet', 17)} ${ctx.t('lst.detailInsight')}</h3>
    <p class="eyebrow small">${ctx.t('lst.detailMonthly')} · ${insight.assumptions.rate}% / ${insight.assumptions.years}y / ${insight.assumptions.margin}%</p>
    <div class="side-big">${safe(fmtMoney(insight.monthly, ctx.lang))}${safe(ctx.t('common.perMonth'))}</div>
    <div class="side-rows">
      <div class="side-row"><span>${ctx.t('lst.detailDown', {downPct: 100 - insight.assumptions.margin})}</span><b>${safe(fmtMoney(insight.downPayment, ctx.lang))}</b></div>
      <div class="side-row"><span>${ctx.t('lst.detailEntry')}</span><b>${safe(fmtMoney(e.total, ctx.lang))}</b></div>
      <div class="side-row highlight"><span>${ctx.t('lst.detailCash')}</span><b>${safe(fmtMoney(insight.cashRequired, ctx.lang))}</b></div>
      ${insight.psf ? `<div class="side-row"><span>${ctx.t('lst.psfLabel')}</span><b>${safe(fmtMoney(insight.psf, ctx.lang, 2))} / sqft</b></div>` : ''}
    </div>
    <details class="breakdown">
      <summary>${ctx.t('lst.detailEntryBreakdown')}</summary>
      <div class="breakdown-body">
        <div class="side-row"><span>SPA ${ctx.lang === 'zh' ? '律师费' : 'legal'}</span><b>${safe(fmtMoney(e.spa.legal, ctx.lang))}</b></div>
        <div class="side-row"><span>SPA ${ctx.lang === 'zh' ? '印花税' : 'stamp duty'}</span><b>${safe(fmtMoney(e.spa.duty, ctx.lang))}</b></div>
        <div class="side-row"><span>SPA ${ctx.lang === 'zh' ? '杂费' : 'misc'}</span><b>${safe(fmtMoney(e.spa.misc, ctx.lang))}</b></div>
        <div class="side-row"><span>SST (8%)</span><b>${safe(fmtMoney(e.spa.sst, ctx.lang))}</b></div>
        <div class="side-row"><span>${ctx.lang === 'zh' ? '估价费' : 'valuation'}</span><b>${safe(fmtMoney(e.valuation, ctx.lang))}</b></div>
        <div class="side-row"><span>LA ${ctx.lang === 'zh' ? '律师费' : 'legal'}</span><b>${safe(fmtMoney(e.loan.legal, ctx.lang))}</b></div>
        <div class="side-row"><span>LA ${ctx.lang === 'zh' ? '印花税' : 'stamp duty'}</span><b>${safe(fmtMoney(e.loan.duty, ctx.lang))}</b></div>
        <div class="side-row"><span>LA ${ctx.lang === 'zh' ? '杂费' : 'misc'}</span><b>${safe(fmtMoney(e.loan.misc, ctx.lang))}</b></div>
        <div class="side-row"><span>LA SST (8%)</span><b>${safe(fmtMoney(e.loan.sst, ctx.lang))}</b></div>
      </div>
    </details>
    <p class="hint">${ctx.t('app.disclaimer')}</p>
  </section>`;
}

function marketCard(market, ctx) {
  return `<section class="panel side-panel">
    <h3>${icon('chart', 17)} ${ctx.t('lst.detailMarket')}</h3>
    ${market ? `<div class="side-rows">
      ${market.count >= 2 ? `
      <div class="side-row"><span>${ctx.t('lst.marketMedian')}</span><b>${safe(fmtMoney(market.median, ctx.lang))}</b></div>
      <div class="side-row"><span>${ctx.t('lst.marketRange')}</span><b>${safe(fmtMoney(market.p25, ctx.lang))} – ${safe(fmtMoney(market.p75, ctx.lang))}</b></div>
      <div class="side-row"><span>${ctx.t('lst.marketPsf')}</span><b>${market.medianPsf ? safe(fmtMoney(market.medianPsf, ctx.lang, 2)) : '—'}</b></div>` : ''}
      <div class="side-row"><span>${ctx.t('lst.marketCount', {n: market.count})}</span><b>${safe(ctx.t('lst.marketScope.' + market.scope))}</b></div>
    </div>
    ${market.count < 2 ? `<p class="hint">${ctx.t('lst.marketInsufficient', {n: market.count})}</p>` : market.count < 3 ? `<p class="hint">${ctx.t('lst.marketSmallSample')}</p>` : ''}
    <p class="hint">${ctx.t('lst.detailMarketHint')}</p>` : `<p class="muted small">${ctx.t('lst.marketNoData')}</p>`}
  </section>`;
}

function sellerCard(l, ctx) {
  return `<section class="panel side-panel">
    <h3>${icon('user', 17)} ${ctx.t('lst.detailSeller')}</h3>
    <div class="side-rows">
      <div class="side-row"><span>${ctx.t('lst.seller')}</span><b>${safe(l.seller_name || '—')}</b></div>
      ${l.seller_phone ? `<div class="side-row"><span>${ctx.t('common.phone')}</span><b><a href="tel:${safe(l.seller_phone)}">${safe(l.seller_phone)}</a></b></div>` : ''}
      <div class="side-row"><span>${ctx.t('lst.mandate')}</span><b>${safe(ctx.t('lst.mandate.' + (l.mandate || 'open')))}</b></div>
      ${l.commission_pct != null ? `<div class="side-row"><span>${ctx.t('lst.commission')}</span><b>${fmtPct(l.commission_pct)}</b></div>` : ''}
      ${l.mandate_expiry ? `<div class="side-row"><span>${ctx.t('lst.mandateExpiry')}</span><b>${safe(fmtDate(l.mandate_expiry, ctx.lang))}</b></div>` : ''}
      <div class="side-row"><span>${ctx.t('lst.availableFrom')}</span><b>${l.available_from ? safe(fmtDate(l.available_from, ctx.lang)) : safe(ctx.t('common.today'))}</b></div>
    </div>
  </section>`;
}

export function matchRow(m, ctx, focus = 'listing') {
  const l = m.listing || {};
  const r = m.requirement || {};
  const isListing = focus === 'listing';
  const title = isListing ? listingTitle(l, ctx.lang) : r.client_name;
  const href = isListing ? `#/listings/${l.id}` : `#/requirements/${r.id}`;
  const sub = isListing
    ? `${priceText(l, ctx)} · ${listingSpecs(l, ctx).slice(0, 3).join(' · ')}`
    : `${intentLabel(r.intent, ctx)} · ${budgetText(r, ctx)} · ${(r.areas || []).map((a) => areaLabel(a, ctx)).slice(0, 2).join(ctx.lang === 'en' ? ', ' : '、')}`;
  return `<article class="match-row">
    <div class="match-row-main">
      ${isListing ? listingThumb(l, ctx, 'row') : avatar(r.client_name, 'md')}
      <div class="match-row-copy">
        <div class="match-row-title">
          <a href="${href}">${safe(title)}</a>
        </div>
        <p class="match-row-sub">${safe(sub)}</p>
        ${reasonChips(m, ctx, 2)}
      </div>
    </div>
    <div class="match-row-side">
      <button type="button" class="score-btn" data-action="view-score" data-req="${r.id}" data-listing="${l.id}" aria-label="${ctx.t('match.viewScore')}">
        ${scoreRing(m.score, {size: 'sm'})}
      </button>
      <div class="match-side-meta">
        ${confidenceMeter(m.confidence, ctx, true)}
        ${m.penalties?.length ? `<span class="mini-flag">${ctx.t('match.penalty')} ${m.penalties.reduce((s, x) => s + x.points, 0)}</span>` : ''}
      </div>
      <div class="match-row-actions">
        <button type="button" class="icon-btn star ${m.action?.status === 'shortlisted' ? 'on' : ''}" data-action="quick-action" data-status="shortlisted" data-req="${r.id}" data-listing="${l.id}" title="${ctx.t('match.shortlisted')}">${icon('star', 16)}</button>
        <button type="button" class="btn sm outline" data-action="open-action" data-req="${r.id}" data-listing="${l.id}">${icon('sliders', 14)}<span>${m.action ? statusLabel(m.action.status, ctx, 'action') : ctx.t('match.action')}</span></button>
        <button type="button" class="btn sm whatsapp" data-action="send-message" data-req="${r.id}" data-listing="${l.id}">${icon('send', 14)}<span>${ctx.t('match.send')}</span></button>
      </div>
    </div>
  </article>`;
}

export function nearRow(m, ctx, focus = 'listing') {
  const l = m.listing || {};
  const r = m.requirement || {};
  const isListing = focus === 'listing';
  const title = isListing ? listingTitle(l, ctx.lang) : r.client_name;
  const href = isListing ? `#/listings/${l.id}` : `#/requirements/${r.id}`;
  return `<div class="near-row">
    <div class="near-copy">
      <a href="${href}">${safe(title)}</a>
      <p>${isListing ? safe(priceText(l, ctx)) : safe(budgetText(r, ctx))} · ${safe(isListing ? areaLabel(l.area, ctx) : (r.areas || []).map((a) => areaLabel(a, ctx)).slice(0, 2).join(ctx.lang === 'en' ? ', ' : '、'))}</p>
      <div class="failures">${(m.failures || []).map((f) => `<span class="failure-chip">${safe(failureText(f, ctx))}</span>`).join('')}</div>
    </div>
    <div class="near-score">
      ${scoreRing(m.score, {size: 'xs' })}
      <span class="muted tiny">${ctx.t('match.near')}</span>
    </div>
  </div>`;
}

export function matchesView(data, state, ctx) {
  const pairs = (data.pairs || []);
  return `${pageHead({
    eyebrow: ctx.lang === 'zh' ? '配对中心' : 'Matching',
    title: ctx.t('match.title'),
    sub: ctx.t('match.subtitle'),
    actions: `<button type="button" class="btn gold" data-action="new-requirement">${icon('plus', 17)}${ctx.t('req.new')}</button>`
  })}
  <div class="toolbar">
    <div class="segmented">
      ${['', 'buy', 'rent'].map((v) => `<button type="button" class="${state.filters.match.intent === v ? 'on' : ''}" data-filter-intent="match" data-value="${v}">${v === '' ? ctx.t('match.intentAll') : v === 'buy' ? ctx.t('req.buy') : ctx.t('req.rent')}</button>`).join('')}
    </div>
    <label class="toggle"><input type="checkbox" data-filter="match-strong" ${state.filters.match.strong ? 'checked' : ''}><span>${ctx.t('match.strongOnly')}</span></label>
    <span class="toolbar-count">${pairs.length} ${ctx.lang === 'zh' ? '个配对' : 'pairs'} · ${data.strong || 0} ${ctx.t('match.strong').toLowerCase()} · ${data.eligible || 0} ${ctx.t('match.eligible').toLowerCase()}</span>
  </div>
  <div id="match-list" class="pair-list wide">
    ${pairs.length ? pairs.map((p) => pairCard(p, ctx)).join('') : emptyState({
      iconName: 'spark',
      title: ctx.t('match.emptyTitle'),
      body: ctx.t('match.emptyBody'),
      cta: `<button class="btn gold" type="button" data-action="new-requirement">${ctx.t('empty.addFirstReq')}</button>`
    })}
  </div>`;
}

export function settingsView(state, ctx) {
  const u = state.user || {};
  const isDemo = state.demo || (state.publicConfig?.demo && state.publicConfig.demo.email === u.email);
  const cardEmail = u.contact_email || u.email;
  const titleText = ctx.lang === 'zh' ? u.title : u.title_en || u.title;
  const siteLabel = u.website
    ? u.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : '';
  return `${pageHead({
    eyebrow: ctx.lang === 'zh' ? '设置' : 'Settings',
    title: ctx.t('settings.title'),
    sub: ctx.t('app.version'),
    actions: `<button type="button" class="btn ghost" data-action="toggle-lang">${icon('globe', 16)}${ctx.lang === 'zh' ? 'English' : '中文'}</button>`
  })}
  <div class="settings-grid">
    <section class="panel">
      ${sectionHead(ctx.t('settings.account'))}
      <div class="profile-row">${avatar(u.name || '', 'lg')}<div><h3>${safe(u.name || '')}</h3><p>${u.name_en ? `${safe(u.name_en)} · ` : ''}${titleText ? safe(titleText) : '—'}</p><p>${safe(u.company || '')}${u.e_number ? ` · ${safe(u.e_number)}` : ''}${u.ren ? ` · REN ${safe(u.ren)}` : ''}</p><p class="muted small">${safe(cardEmail || '')}${u.phone ? ` · ${safe(u.phone)}` : ''}</p></div></div>
      <div class="profile-facts">
        ${u.office_address ? `<div><span>${ctx.t('settings.officeAddress')}</span><b>${safe(u.office_address)}</b></div>` : ''}
        ${u.website ? `<div><span>${ctx.t('settings.website')}</span><b><a href="${attr(u.website)}" target="_blank" rel="noopener">${safe(siteLabel)}</a></b></div>` : ''}
        <div><span>${ctx.t('settings.loginEmail')}</span><b>${safe(u.email || '')}</b></div>
      </div>
      <div class="settings-actions">
        <button type="button" class="btn outline" data-action="edit-profile">${icon('edit', 16)}${ctx.t('settings.editProfile')}</button>
        <button type="button" class="btn ghost" data-action="change-password">${icon('shield', 16)}${ctx.t('settings.password')}</button>
      </div>
    </section>
    <section class="panel">
      ${sectionHead(ctx.t('settings.data'))}
      <div class="settings-actions column">
        <button type="button" class="btn outline" data-action="export-data">${icon('download', 16)}${ctx.t('settings.export')}</button>
        <p class="hint">${ctx.t('settings.exportHint')}</p>
        ${isDemo ? `<button type="button" class="btn ghost" data-action="reset-demo">${icon('refresh', 16)}${ctx.t('settings.resetDemo')}</button>
        <p class="hint">${ctx.t('settings.resetHint')}</p>` : ''}
      </div>
    </section>
    <section class="panel wide-panel">
      ${sectionHead(ctx.t('settings.helpTitle'))}
      <div class="help-grid">
        <div class="help-item"><h4>${ctx.t('settings.helpScoringTitle')}</h4><p>${ctx.t('settings.helpBody')}</p></div>
        <div class="help-item"><h4>${ctx.lang === 'zh' ? '资料完整度' : 'Confidence'}</h4><p>${ctx.t('settings.helpConfidence')}</p></div>
        <div class="help-item"><h4>${ctx.t('req.affordability')}</h4><p>${ctx.t('settings.helpAfford')}</p></div>
        <div class="help-item"><h4>${ctx.lang === 'zh' ? '隐私与合规' : 'Privacy & compliance'}</h4><p>${ctx.t('settings.helpPrivacy')}</p><p>${ctx.t('settings.helpCompliance')}</p></div>
      </div>
      <p class="disclaimer">${ctx.t('app.disclaimer')}</p>
    </section>
    <section class="panel wide-panel">
      ${sectionHead(ctx.t('settings.about'))}
      <p class="muted">${ctx.t('settings.aboutBody')}</p>
      <p class="muted small" style="margin-top:12px">${safe(u.company || 'THE ROOF REALTY SDN BHD')} · ${safe(u.e_number || 'E(1)1605/1')} · ${safe(u.name || 'Andy Lau 刘泌光')} REN ${safe(u.ren || '32839')}</p>
      ${u.office_address ? `<p class="muted small">${safe(u.office_address)}</p>` : ''}
      ${u.website ? `<p class="muted small"><a href="${attr(u.website)}" target="_blank" rel="noopener">${safe(siteLabel)}</a></p>` : ''}
      <button type="button" class="btn ghost block" style="margin-top:16px" data-action="logout">${icon('logout', 16)}${ctx.t('common.logout')}</button>
    </section>
  </div>`;
}

export function loadingView(ctx) {
  return `<div class="loading-page"><div class="spinner"></div><p>${ctx.t('common.loading')}</p></div>`;
}

export function errorView(message, ctx) {
  return emptyState({
    iconName: 'x',
    title: ctx.t('common.networkError'),
    body: message || '',
    cta: `<button class="btn outline" type="button" data-action="reload">${ctx.t('common.retry') || 'Retry'}</button>`
  });
}
