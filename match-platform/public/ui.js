// ui.js — 图标、评分环、提示、弹窗、确认框（轻量、无依赖）

import {esc, attr, fmtNum, noteText, scoreGrade, scoreTone, statusLabel} from './format.js';

const ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  target:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  home: '<path d="M3.5 10.8 12 3.6l8.5 7.2"/><path d="M5.4 9.7V20.4h13.2V9.7"/><path d="M9.6 20.4v-5.6h4.8v5.6"/>',
  spark:
    '<path d="M12 3.2l1.8 5.1 5.1 1.8-5.1 1.8L12 17l-1.8-5.1L5.1 10l5.1-1.8z"/><path d="M18.5 16.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  star: '<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  send: '<path d="M21 3.5 10.2 14.3"/><path d="M21 3.5 14.6 21l-4.4-6.7L3.5 10z"/>',
  eye: '<path d="M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12s-3.5 6.2-9.5 6.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 20 6.5"/>',
  x: '<path d="M5.5 5.5l13 13"/><path d="M18.5 5.5l-13 13"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.6 15.6 21 21"/>',
  plus: '<path d="M12 4.5v15"/><path d="M4.5 12h15"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-down': '<path d="M5 9l7 7 7-7"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  download: '<path d="M12 3v12"/><path d="M7 10.5 12 15.5 17 10.5"/><path d="M4 20h16"/>',
  logout: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>',
  phone:
    '<path d="M6.5 3.8h3l1.5 4-2 1.4a12 12 0 0 0 5.8 5.8l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 6a2 2 0 0 1 2-2.2z"/>',
  message:
    '<path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.5-.7L3.5 20.5l1.2-4.8a8.5 8.5 0 1 1 15.8-4.2z"/>',
  calendar:
    '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v5"/><path d="M16 3v5"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  sliders:
    '<path d="M4 7h16"/><path d="M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="var(--paper)"/><circle cx="15" cy="17" r="2.2" fill="var(--paper)"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  'map-pin': '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10 21v-3h4v3"/>',
  bed: '<path d="M3 18v-7h18v7"/><path d="M3 18v2M21 18v2"/><path d="M6 11V8h5v3"/><path d="M13 11V8h5v3"/>',
  ruler: '<path d="M3 16 16 3l5 5L8 21z"/><path d="M7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14h2"/>',
  shield: '<path d="M12 3.5 20 6v5.5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  tag: '<path d="M3.5 12.5 12 4h8v8l-8.5 8.5z"/><circle cx="16.5" cy="7.5" r="1.2" fill="currentColor"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
  arrowRight: '<path d="M4 12h16"/><path d="M14.5 6.5 20 12l-5.5 5.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.7-3.4 3.1-5.2 6.2-5.2s5.5 1.8 6.2 5.2"/><path d="M16 5.4a3 3 0 0 1 0 5.9"/><path d="M17.4 14.6c2.2.6 3.6 2.3 4.1 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'
};

export function icon(name, size = 18, cls = '') {
  const body = ICONS[name] || ICONS.target;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function avatar(name, size = 'md') {
  return `<span class="avatar ${size}">${esc(initialsLocal(name))}</span>`;
}

function initialsLocal(name) {
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

export function badge(text, tone = 'grey') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function statusBadge(key, ctx, kind = 'listing') {
  const list =
    kind === 'requirement'
      ? ctx.meta?.requirement_statuses
      : kind === 'action'
        ? ctx.meta?.action_statuses
        : ctx.meta?.listing_statuses;
  const row = (list || []).find((x) => x.key === key);
  const tone = row?.tone || 'grey';
  return badge(statusLabel(key, ctx, kind), tone);
}

export function scoreRing(score, opts = {}) {
  const size = opts.size || 'md';
  const tone = scoreTone(score);
  const grade = scoreGrade(score);
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return `<div class="score-ring ${size} ${tone}" title="${attr(scoreGrade(score))}">
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="track" cx="22" cy="22" r="18" pathLength="100"/>
      <circle class="bar" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${value} 100"/>
    </svg>
    <span class="score-text"><b>${Math.round(value)}</b><em>${esc(grade)}</em></span>
    <span class="sr-only">${Math.round(value)} / 100</span>
  </div>`;
}

export function confidenceMeter(pct, ctx, compact = false) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  if (compact) {
    return `<span class="conf-badge" title="${attr(ctx.t('req.confidence'))}">${ctx.t('req.confidenceShort', {pct: value})}</span>`;
  }
  return `<span class="confidence" title="${attr(ctx.t('req.confidence'))}">
    <span class="confidence-bar"><i style="width:${value}%"></i></span>
    <span class="confidence-text">${ctx.t('req.confidence')} ${value}%</span>
  </span>`;
}

export function chips(items, cls = '') {
  return `<div class="chips ${cls}">${items.join('')}</div>`;
}

export function chip(text, tone = 'cream', extra = '') {
  return `<span class="chip ${tone} ${extra}">${esc(text)}</span>`;
}

export function reasonChips(match, ctx, limit = 3) {
  if (!match) return '';
  const positives = (match.highlights || []).slice(0, Math.max(1, limit - 1));
  const negatives = (match.concerns || []).slice(0, 1);
  const notes = [...positives, ...negatives];
  if (!notes.length) return '';
  return `<div class="reasons">${notes
    .map((n) => {
      const text = noteText(n, ctx);
      return `<span class="reason ${n.tone || 'neutral'}" title="${attr(text)}">${esc(text)}</span>`;
    })
    .join('')}</div>`;
}

export function listingThumb(listing, ctx, cls = '') {
  const photo = (listing.photos && listing.photos[0]) || listing.photo;
  if (photo) {
    return `<div class="thumb ${cls}"><img loading="lazy" src="${attr(photo)}" alt="${attr(listing.title || '')}"></div>`;
  }
  const type = (ctx.meta?.property_types || []).find((t) => t.key === listing.type);
  return `<div class="thumb placeholder ${cls}"><span>${type?.icon || '🏠'}</span></div>`;
}

export function emptyState({iconName = 'spark', title, body, cta = '', className = ''}) {
  return `<div class="empty ${className}">
    <div class="empty-icon">${icon(iconName, 28)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
    ${cta}
  </div>`;
}

export function skeletonBlock(lines = 3) {
  return `<div class="skeleton-card">${Array.from({length: lines})
    .map(() => '<span class="skeleton-line"></span>')
    .join('')}</div>`;
}

// ---------------- toast ----------------
let toastHost = null;
export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = `<span class="toast-dot"></span><span>${esc(message)}</span>`;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

// ---------------- modal ----------------
let activeModal = null;

export function openModal({title, subtitle = '', body, footer = '', wide = false, drawer = false, onMount, onClose} = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}" role="dialog" aria-modal="true" aria-label="${attr(title)}">
    <header class="modal-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      <button type="button" class="icon-btn modal-close" aria-label="${attr('Close')}">${icon('x', 20)}</button>
    </header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  const close = () => closeModal();
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  wrap.querySelector('.modal-close').addEventListener('click', close);
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  activeModal = {wrap, onKey, onClose};
  requestAnimationFrame(() => {
    wrap.classList.add('show');
    const focusable = wrap.querySelector('input:not([type=hidden]), select, textarea, button:not(.modal-close)');
    if (focusable) focusable.focus({preventScroll: true});
  });
  if (onMount) onMount(wrap.querySelector('.modal'));
  return close;
}

export function closeModal() {
  if (!activeModal) return;
  const {wrap, onKey, onClose} = activeModal;
  activeModal = null;
  document.removeEventListener('keydown', onKey);
  wrap.classList.remove('show');
  document.body.classList.remove('modal-open');
  setTimeout(() => wrap.remove(), 200);
  if (typeof onClose === 'function') onClose();
}

export function confirmDialog({title, body, confirmText, cancelText, tone = 'danger'}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };
    openModal({
      title,
      body: `<p class="confirm-text">${esc(body)}</p>`,
      footer: `<button type="button" class="btn ghost" data-confirm="no">${esc(cancelText || 'Cancel')}</button>
        <button type="button" class="btn ${tone}" data-confirm="yes">${esc(confirmText || 'OK')}</button>`,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
      onMount(el) {
        el.querySelector('[data-confirm="yes"]').addEventListener('click', () => finish(true));
        el.querySelector('[data-confirm="no"]').addEventListener('click', () => finish(false));
      }
    });
  });
}

export function dimensionBars(match, ctx) {
  const dims = match.dimensions || [];
  const labelMap = Object.fromEntries((ctx.meta?.dimensions || []).map((d) => [d.key, d]));
  const rows = dims
    .map((d) => {
      const label = labelMap[d.key]?.[ctx.lang] || labelMap[d.key]?.zh || d.key;
      const pct = Math.round((d.score || 0) * 100);
      return `<div class="dim-row">
        <div class="dim-top"><span>${esc(label)}</span><span class="dim-points">${fmtNum(d.points)}<em>/${d.weight}</em></span></div>
        <div class="dim-bar"><i class="tone-${scoreTone(pct)}" style="width:${pct}%"></i></div>
        <div class="dim-bottom"><span>${pct}%</span><span>${esc(
          (d.notes || [])
            .filter((n) => n.tone !== 'neutral')
            .slice(0, 1)
            .map((n) => noteText(n, ctx))
            .join('')
        )}</span></div>
      </div>`;
    })
    .join('');
  const penalties = (match.penalties || [])
    .map(
      (p) => `<div class="penalty-row"><span>${esc(ctx.t('match.penalty'))}</span><span>${esc(
        noteText({code: p.code, params: {}}, ctx)
      )} <b>${p.points}</b></span></div>`
    )
    .join('');
  return `<div class="dim-bars">${rows}</div>${penalties}`;
}

export function monthGrid(activityByDay, ctx) {
  if (!activityByDay || !activityByDay.length) return '';
  const max = Math.max(1, ...activityByDay.map((d) => d.count));
  return `<div class="spark">${activityByDay
    .map(
      (d) => `<div class="spark-col" title="${attr(d.day)} · ${d.count}">
        <div class="spark-bar"><i style="height:${Math.max(4, Math.round((d.count / max) * 100))}%"></i></div>
        <span>${esc(fmtDay(d.day, ctx.lang))}</span>
      </div>`
    )
    .join('')}</div>`;
}

function fmtDay(iso, lang) {
  const d = new Date(`${iso}T00:00:00`);
  const names = lang === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['日', '一', '二', '三', '四', '五', '六'];
  return names[d.getDay()] || '';
}

export function actionButtons(match, ctx, opts = {}) {
  const action = match?.action;
  const hasPhone = !!(match?.requirement?.whatsapp || match?.requirement?.phone);
  return `<div class="pair-actions">
    <button type="button" class="icon-btn star ${action?.status === 'shortlisted' ? 'on' : ''}" data-action="quick-action" data-status="shortlisted" data-req="${match?.requirement_id}" data-listing="${match?.listing_id}" aria-label="${attr(ctx.t('match.shortlisted'))}" title="${attr(ctx.t('match.shortlisted'))}">${icon('star', 17)}</button>
    <button type="button" class="btn sm ${hasPhone ? 'whatsapp' : 'ghost'}" data-action="send-message" data-req="${match?.requirement_id}" data-listing="${match?.listing_id}">${icon('send', 15)}<span>${esc(ctx.t('match.send'))}</span></button>
    <button type="button" class="btn sm outline" data-action="open-action" data-req="${match?.requirement_id}" data-listing="${match?.listing_id}">${icon('sliders', 15)}<span>${esc(action ? statusLabel(action.status, ctx, 'action') : ctx.t('match.action'))}</span></button>
    ${opts.hideView ? '' : `<a class="btn sm ghost" href="#/requirements/${match?.requirement_id}">${esc(ctx.t('common.view'))}</a>`}
  </div>`;
}
