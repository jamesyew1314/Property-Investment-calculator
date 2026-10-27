// forms.js — 新增/编辑表单、跟进弹窗、评分明细、WhatsApp 文案、账号设置
const tr = (zh, en) => (document.documentElement.lang === 'en' ? en : zh);
const FALLBACK = {
  checkForm: () => tr('请检查表单', 'Check the form'),
  saving: () => tr('保存中…', 'Saving…'),
  saveFailed: () => tr('保存失败', 'Save failed')
};

import {affordability, rentAffordability} from './lib/finance.js';
import {
  attr,
  esc,
  failureText,
  fmtMoney,
  fmtNum,
  listingTitle,
  missingText,
  noteText,
  todayISO,
  waLink,
  whatsappMessage
} from './format.js';
import {
  closeModal,
  dimensionBars,
  icon,
  openModal,
  reasonChips,
  scoreRing,
  toast
} from './ui.js';

const val = (v) => (v == null ? '' : String(v));
const checked = (a, b) => (String(a) === String(b) ? 'checked' : '');
const selected = (a, b) => (String(a) === String(b) ? 'selected' : '');

function field({
  label,
  name,
  value = '',
  type = 'text',
  required = false,
  placeholder = '',
  hint = '',
  full = false,
  min,
  max,
  step,
  inputmode,
  readonly = false
}) {
  return `<label class="field ${full ? 'full' : ''}" data-field="${attr(name)}">
    <span>${esc(label)}${required ? ' *' : ''}</span>
    <input type="${type}" name="${attr(name)}" value="${attr(val(value))}"
      ${required ? 'required' : ''} ${readonly ? 'readonly' : ''}
      ${placeholder ? `placeholder="${attr(placeholder)}"` : ''}
      ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}
      ${step != null ? `step="${step}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}>
    ${hint ? `<em class="field-hint">${esc(hint)}</em>` : ''}
    <em class="field-error" hidden></em>
  </label>`;
}

function select({
  label,
  name,
  value = '',
  options = [],
  required = false,
  full = false,
  blank = '',
  hint = ''
}) {
  return `<label class="field ${full ? 'full' : ''}" data-field="${attr(name)}">
    <span>${esc(label)}${required ? ' *' : ''}</span>
    <select name="${attr(name)}" ${required ? 'required' : ''}>
      ${blank !== false ? `<option value="">${esc(blank)}</option>` : ''}
      ${options
        .map(
          (o) =>
            `<option value="${attr(o.key)}" ${selected(o.key, value)}>${esc(o.label)}</option>`
        )
        .join('')}
    </select>
    ${hint ? `<em class="field-hint">${esc(hint)}</em>` : ''}
    <em class="field-error" hidden></em>
  </label>`;
}

function textarea({label, name, value = '', rows = 3, full = true, placeholder = '', hint = ''}) {
  return `<label class="field ${full ? 'full' : ''}" data-field="${attr(name)}">
    <span>${esc(label)}</span>
    <textarea name="${attr(name)}" rows="${rows}" ${placeholder ? `placeholder="${attr(placeholder)}"` : ''}>${esc(val(value))}</textarea>
    ${hint ? `<em class="field-hint">${esc(hint)}</em>` : ''}
    <em class="field-error" hidden></em>
  </label>`;
}

function formSection(title, hint, content) {
  return `<section class="form-section">
    <div class="form-section-head"><h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}</div>
    <div class="form-grid">${content}</div>
  </section>`;
}

function optList(list, ctx, {withBlank = false, blank = ''} = {}) {
  const rows = (list || []).map((x) => ({key: x.key, label: x[ctx.lang] || x.zh || x.key}));
  return withBlank ? [{key: '', label: blank}, ...rows] : rows;
}

function tagsGrid(name, selected, ctx, {filter = null} = {}) {
  const selectedSet = new Set(selected || []);
  const tags = (ctx.meta.tags || []).filter((t) => (filter ? filter(t) : true));
  const groups = [...new Set(tags.map((t) => t.group))];
  return `<div class="tag-select">
    ${groups
      .map((g) => {
        const items = tags.filter((t) => t.group === g);
        return `<div class="tag-group">
          <span class="tag-group-label">${esc(ctx.t('taggroup.' + g))}</span>
          <div class="chip-checks compact">
            ${items
              .map(
                (t) => `<label class="check-chip ${t.tone === 'negative' ? 'negative' : ''}">
                  <input type="checkbox" name="${attr(name)}" value="${attr(t.key)}" ${selectedSet.has(t.key) ? 'checked' : ''}>
                  <span>${esc(t[ctx.lang] || t.zh)}</span>
                </label>`
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function areaPicker(selected, ctx) {
  const selectedSet = new Set(selected || []);
  const extra = (selected || []).filter(
    (a) => !(ctx.meta.areas || []).some((x) => x.key === a || x.zh === a || x.en === a)
  );
  return `<div class="area-picker" data-area-picker>
    <div class="searchbox small">${icon('search', 15)}<input type="text" class="area-search" placeholder="${attr(ctx.t('form.f.searchArea'))}" aria-label="${attr(ctx.t('form.f.searchArea'))}"></div>
    <div class="area-options">
      ${extra.map((a) => `<label class="check-chip" data-area-item data-search="${attr(String(a).toLowerCase())}"><input type="checkbox" name="areas" value="${attr(a)}" checked><span>${esc(a)}</span></label>`).join('')}
      ${(ctx.meta.areas || [])
        .map(
          (a) => `<label class="check-chip" data-area-item data-search="${attr((a.zh + ' ' + a.en + ' ' + a.key).toLowerCase())}">
            <input type="checkbox" name="areas" value="${attr(a[ctx.lang] || a.zh)}" ${selectedSet.has(a.zh) || selectedSet.has(a.en) || selectedSet.has(a.key) ? 'checked' : ''}>
            <span>${esc(a[ctx.lang] || a.zh)}</span>
          </label>`
        )
        .join('')}
    </div>
    <p class="hint">${ctx.t('form.f.optionalHint')}</p>
  </div>`;
}

function strictGrid(selected, ctx) {
  const set = new Set(selected || []);
  return `<div class="chip-checks">
    ${(ctx.meta.strict_fields || [])
      .map(
        (s) => `<label class="check-chip">
          <input type="checkbox" name="strict_fields" value="${attr(s.key)}" ${set.has(s.key) ? 'checked' : ''}>
          <span>${esc(s[ctx.lang] || s.zh)}</span>
        </label>`
      )
      .join('')}
  </div>`;
}

function priorityCards(value, ctx) {
  return `<div class="radio-cards" data-field="priority">
    ${(ctx.meta.priorities || [])
      .map(
        (p) => `<label class="radio-card">
          <input type="radio" name="priority" value="${attr(p.key)}" ${checked(p.key, value || 'balanced')}>
          <div><b>${esc(p[ctx.lang] || p.zh)}</b><span>${esc(ctx.t('priority.' + p.key + '.desc'))}</span></div>
        </label>`
      )
      .join('')}
  </div>`;
}

function formError() {
  return `<p class="form-error" data-error hidden></p>`;
}

function formFooter(submitLabel, cancelLabel, formId) {
  return `<button type="button" class="btn ghost" data-close-modal>${esc(cancelLabel)}</button>
    <button type="submit" class="btn primary" form="${attr(formId)}" data-submit>${esc(submitLabel)}</button>`;
}

function fdObject(form) {
  const data = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (v instanceof File) continue;
    if (k in data) {
      if (!Array.isArray(data[k])) data[k] = [data[k]];
      data[k].push(v);
    } else data[k] = v;
  }
  return data;
}

function numOrNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  form.querySelectorAll('.field.invalid').forEach((el) => el.classList.remove('invalid'));
  const box = form.querySelector('[data-error]');
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
}

function showError(form, message, fields) {
  clearErrors(form);
  const box = form.querySelector('[data-error]');
  if (box) {
    box.hidden = false;
    box.textContent = message || '';
  }
  if (fields) {
    for (const [name, msg] of Object.entries(fields)) {
      const wrap = form.querySelector(`[data-field="${name}"]`);
      if (!wrap) continue;
      wrap.classList.add('invalid');
      const err = wrap.querySelector('.field-error');
      if (err) {
        err.hidden = false;
        err.textContent = msg;
      }
    }
    const first = form.querySelector('.field.invalid');
    if (first) first.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
}

async function submitForm(form, build, onSubmit) {
  clearErrors(form);
  const payload = build();
  if (payload.__error) {
    showError(form, payload.__error.message || FALLBACK.checkForm(), payload.__error.fields);
    return;
  }
  const modal = form.closest('.modal');
  const btn = modal?.querySelector('[data-submit]');
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${icon('refresh', 15)} ${form.dataset.saving || FALLBACK.saving()}`;
  }
  try {
    await onSubmit(payload);
  } catch (err) {
    if (err && err.fields) showError(form, err.message, err.fields);
    else showError(form, (err && err.message) || FALLBACK.saveFailed());
    toast((err && err.message) || FALLBACK.saveFailed(), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

function bindClose(close) {
  document.querySelectorAll('.modal [data-close-modal]').forEach((el) => {
    el.addEventListener('click', close);
  });
}

// ---------------- 房源表单 ----------------
export function openListingForm({listing = null, ctx, onSubmit}) {
  const isEdit = !!listing;
  const l = listing || {
    intent: 'sale',
    status: 'available',
    negotiable: false,
    tags: [],
    commission_pct: 2,
    mandate: 'open'
  };
  const formId = 'listing-form';
  const photosValue = (l.photos || []).filter((p) => p !== l.photo).join('\n');
  const body = `<form id="${formId}" class="form form-wide" data-form="listing" novalidate
      data-saving="${attr(ctx.t('common.saving'))}">
    ${formError()}
    ${formSection(
      ctx.t('form.section.basics'),
      '',
      `${select({label: ctx.t('form.f.intent'), name: 'intent', value: l.intent, options: optList(ctx.meta.listing_intents, ctx), required: true, blank: false})}
       ${select({label: ctx.t('form.f.status'), name: 'status', value: l.status || 'available', options: optList(ctx.meta.listing_statuses, ctx), blank: false})}
       ${field({label: ctx.t('form.f.title'), name: 'title', value: l.title, required: true, placeholder: ctx.t('form.ph.title')})}
       ${field({label: ctx.t('form.f.titleEn'), name: 'title_en', value: l.title_en, placeholder: ctx.t('form.ph.titleEn')})}
       ${field({label: ctx.t('form.f.price'), name: 'price', value: l.price, required: true, type: 'number', min: 0, step: 100, inputmode: 'decimal', placeholder: ctx.t('form.f.amountPlaceholder')})}
       ${select({label: ctx.t('form.f.type'), name: 'type', value: l.type, options: optList(ctx.meta.property_types, ctx), required: true, blank: ctx.t('form.f.needType')})}
       <div class="field"><span>${ctx.t('form.f.negotiable')}</span><label class="check-row"><input type="checkbox" name="negotiable" ${l.negotiable ? 'checked' : ''}><span>${ctx.t('lst.negotiable')}</span></label></div>
      `
    )}
    ${formSection(
      ctx.t('form.section.location'),
      '',
      `${field({label: ctx.t('form.f.area'), name: 'area', value: l.area, required: true, placeholder: ctx.t('form.f.areaPlaceholder')})}
       ${field({label: ctx.t('form.f.address'), name: 'address', value: l.address, placeholder: ctx.t('form.ph.address')})}
       ${field({label: ctx.t('form.f.lat'), name: 'lat', value: l.lat, type: 'number', step: 'any'})}
       ${field({label: ctx.t('form.f.lng'), name: 'lng', value: l.lng, type: 'number', step: 'any'})}
      `
    )}
    ${formSection(
      ctx.t('form.section.specs'),
      '',
      `${field({label: ctx.t('form.f.beds'), name: 'beds', value: l.beds, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.baths'), name: 'baths', value: l.baths, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.builtUp'), name: 'built_up', value: l.built_up, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.landArea'), name: 'land_area', value: l.land_area, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.storeys'), name: 'storeys', value: l.storeys, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.carparks'), name: 'carparks', value: l.carparks, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.floor'), name: 'floor_level', value: l.floor_level, placeholder: '12/18'})}
       ${select({label: ctx.t('form.f.tenure'), name: 'tenure', value: l.tenure, options: optList(ctx.meta.tenures, ctx), blank: ctx.t('common.none')})}
       ${field({label: ctx.t('form.f.yearBuilt'), name: 'year_built', value: l.year_built, type: 'number', min: 1900, max: new Date().getFullYear() + 3, step: 1})}
       ${select({label: ctx.t('form.f.furnishing'), name: 'furnishing', value: l.furnishing, options: optList(ctx.meta.furnishings, ctx), blank: ctx.t('common.none')})}
       ${select({label: ctx.t('form.f.condition'), name: 'condition', value: l.condition || 'good', options: optList(ctx.meta.conditions, ctx), blank: false})}
      `
    )}
    ${formSection(ctx.t('form.section.features'), '', `<div class="field full">${tagsGrid('tags', l.tags, ctx)}</div>`)}
    ${formSection(
      ctx.t('form.section.seller'),
      '',
      `${field({label: ctx.t('form.f.seller'), name: 'seller_name', value: l.seller_name})}
       ${field({label: ctx.t('form.f.sellerPhone'), name: 'seller_phone', value: l.seller_phone})}
       ${select({label: ctx.t('form.f.mandate'), name: 'mandate', value: l.mandate || 'open', options: optList(ctx.meta.mandates || [], ctx), blank: false})}
       ${field({label: ctx.t('form.f.commission'), name: 'commission_pct', value: l.commission_pct, type: 'number', min: 0, max: 20, step: '0.1'})}
       ${field({label: ctx.t('form.f.mandateExpiry'), name: 'mandate_expiry', value: l.mandate_expiry, type: 'date'})}
       ${field({label: ctx.t('form.f.availableFrom'), name: 'available_from', value: l.available_from, type: 'date'})}
      `
    )}
    ${formSection(
      ctx.t('form.section.notes'),
      '',
      `${field({label: ctx.t('form.f.photo'), name: 'photo', value: l.photo, full: true, placeholder: 'demo/shoplot-1.jpg', hint: ctx.t('form.f.photoHint')})}
       ${textarea({label: ctx.t('form.f.photos'), name: 'photos', value: photosValue, rows: 3, hint: ctx.t('form.f.photoHint')})}
       ${textarea({label: ctx.t('form.f.notes'), name: 'notes', value: l.notes, rows: 3})}
      `
    )}
  </form>`;
  const close = openModal({
    title: isEdit ? ctx.t('form.editListing') : ctx.t('form.newListing'),
    subtitle: ctx.t('form.f.sectionHint'),
    body,
    footer: formFooter(ctx.t('form.f.saveListing'), ctx.t('common.cancel'), formId),
    wide: true,
    drawer: true
  });
  bindClose(close);
  const form = document.getElementById(formId);
  const priceLabel = form.querySelector('[data-field="price"] > span');
  const priceHint = form.querySelector('[data-field="price"] .field-hint');
  const updatePriceLabel = () => {
    const isRent = form.elements.intent?.value === 'rent';
    if (priceLabel) priceLabel.textContent = `${ctx.t(isRent ? 'form.f.rentPrice' : 'form.f.price')} *`;
    if (priceHint) priceHint.textContent = isRent ? ctx.t('common.perMonth') : '';
  };
  form.elements.intent?.addEventListener('change', updatePriceLabel);
  updatePriceLabel();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(
      form,
      () => {
        const data = fdObject(form);
        const fields = {};
        if (!String(data.title || '').trim()) fields.title = ctx.t('form.f.requiredField');
        if (!data.type) fields.type = ctx.t('form.f.needType');
        if (!String(data.area || '').trim()) fields.area = ctx.t('form.f.needArea');
        if (numOrNull(data.price) == null) fields.price = ctx.t('form.f.invalidNumber');
        if (Object.keys(fields).length) return {__error: {message: ctx.t('form.f.unknownFields'), fields}};
        return {
          intent: data.intent,
          status: data.status,
          title: data.title,
          title_en: data.title_en || null,
          type: data.type,
          price: numOrNull(data.price),
          negotiable: !!form.querySelector('[name="negotiable"]')?.checked,
          area: data.area,
          address: data.address || null,
          city: 'Johor Bahru',
          lat: numOrNull(data.lat),
          lng: numOrNull(data.lng),
          beds: numOrNull(data.beds),
          baths: numOrNull(data.baths),
          built_up: numOrNull(data.built_up),
          land_area: numOrNull(data.land_area),
          storeys: numOrNull(data.storeys),
          carparks: numOrNull(data.carparks),
          floor_level: data.floor_level || null,
          tenure: data.tenure || null,
          year_built: numOrNull(data.year_built),
          furnishing: data.furnishing || null,
          condition: data.condition || null,
          tags: new FormData(form).getAll('tags'),
          photo: data.photo || null,
          photos: String(data.photos || '')
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean),
          seller_name: data.seller_name || null,
          seller_phone: data.seller_phone || null,
          mandate: data.mandate || 'open',
          commission_pct: numOrNull(data.commission_pct),
          mandate_expiry: data.mandate_expiry || null,
          available_from: data.available_from || null,
          notes: data.notes || null
        };
      },
      onSubmit
    );
  });
}

// ---------------- 需求表单 ----------------
export function openRequirementForm({requirement = null, ctx, onSubmit}) {
  const isEdit = !!requirement;
  const r = requirement || {
    intent: 'buy',
    purpose: 'own',
    status: 'active',
    source: 'whatsapp',
    priority: 'balanced',
    timeline: '1_3m',
    stretch_pct: 10,
    strict_fields: ['tenure'],
    areas: [],
    types: [],
    must_tags: [],
    pref_tags: [],
    avoid_tags: [],
    finance: {dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30}
  };
  const f = r.finance || {};
  const formId = 'requirement-form';
  const body = `<form id="${formId}" class="form form-wide" data-form="requirement" novalidate
      data-saving="${attr(ctx.t('common.saving'))}">
    ${formError()}
    ${formSection(
      ctx.t('form.section.client'),
      '',
      `${field({label: ctx.t('form.f.clientName'), name: 'client_name', value: r.client_name, required: true, placeholder: ctx.t('form.ph.client')})}
       ${select({label: ctx.t('form.f.requirementIntent'), name: 'intent', value: r.intent, options: optList(ctx.meta.intents, ctx), required: true, blank: false})}
       ${select({label: ctx.t('form.f.purpose'), name: 'purpose', value: r.purpose, options: [{key: 'own', label: ctx.t('req.purpose.own')}, {key: 'invest', label: ctx.t('req.purpose.invest')}], blank: false})}
       ${select({label: ctx.t('form.f.status'), name: 'status', value: r.status, options: optList(ctx.meta.requirement_statuses, ctx), blank: false})}
       ${field({label: ctx.t('form.f.phone'), name: 'phone', value: r.phone, placeholder: ctx.t('form.ph.phone')})}
       ${field({label: ctx.t('form.f.whatsapp'), name: 'whatsapp', value: r.whatsapp, placeholder: ctx.t('form.ph.phone')})}
       ${field({label: ctx.t('form.f.email'), name: 'email', value: r.email, type: 'email'})}
       ${select({label: ctx.t('form.f.source'), name: 'source', value: r.source, options: optList(ctx.meta.sources, ctx), blank: false})}
      `
    )}
    ${formSection(
      ctx.t('form.section.budget'),
      '',
      `${field({label: ctx.t('form.f.budgetMin'), name: 'budget_min', value: r.budget_min, type: 'number', min: 0, step: 100, placeholder: ctx.t('form.f.amountPlaceholder')})}
       ${field({label: ctx.t('form.f.budgetMax'), name: 'budget_max', value: r.budget_max, type: 'number', min: 0, step: 100, placeholder: ctx.t('form.f.amountPlaceholder')})}
       ${select({label: ctx.t('form.f.stretch'), name: 'stretch_pct', value: r.stretch_pct == null ? 10 : r.stretch_pct, options: [0, 5, 10, 15, 20].map((n) => ({key: n, label: `${n}%`})), blank: false})}
       ${select({label: ctx.t('form.f.timeline'), name: 'timeline', value: r.timeline, options: optList(ctx.meta.timelines, ctx), blank: false})}
       <div class="field full"><span>${ctx.t('form.f.priority')}</span>${priorityCards(r.priority, ctx)}</div>
      `
    )}
    ${formSection(
      ctx.t('form.section.property'),
      '',
      `<div class="field full"><span>${ctx.t('form.f.areas')}</span>${areaPicker(r.areas, ctx)}</div>
       <div class="field full"><span>${ctx.t('form.f.types')}</span>
         <div class="chip-checks">${(ctx.meta.property_types || []).map((t) => `<label class="check-chip"><input type="checkbox" name="types" value="${attr(t.key)}" ${(r.types || []).includes(t.key) ? 'checked' : ''}><span>${esc(t[ctx.lang] || t.zh)}</span></label>`).join('')}</div>
       </div>
       ${field({label: ctx.t('form.f.bedsMin'), name: 'beds_min', value: r.beds_min, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.bathsMin'), name: 'baths_min', value: r.baths_min, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.builtUpMin'), name: 'built_up_min', value: r.built_up_min, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.carparksMin'), name: 'carparks_min', value: r.carparks_min, type: 'number', min: 0, step: 1})}
       ${field({label: ctx.t('form.f.maxAge'), name: 'max_age_years', value: r.max_age_years, type: 'number', min: 0, step: 1})}
      `
    )}
    ${formSection(
      ctx.t('form.section.preferences'),
      '',
      `${select({label: ctx.t('form.f.tenurePref'), name: 'tenure_pref', value: r.tenure_pref, options: optList(ctx.meta.tenure_prefs, ctx), blank: false})}
       ${select({label: ctx.t('form.f.furnishingPref'), name: 'furnishing_min', value: r.furnishing_min, options: optList(ctx.meta.furnishing_prefs, ctx), blank: false})}
       ${select({label: ctx.t('form.f.conditionPref'), name: 'condition_pref', value: r.condition_pref, options: optList(ctx.meta.condition_prefs, ctx), blank: false})}
       <div class="field full"><span>${ctx.t('form.f.strict')}</span>${strictGrid(r.strict_fields, ctx)}<p class="field-hint">${ctx.t('form.f.strictHint')}</p></div>
       <div class="field full"><span>${ctx.t('form.f.mustTags')}</span>${tagsGrid('must_tags', r.must_tags, ctx, {filter: (t) => t.tone !== 'negative'})}</div>
       <div class="field full"><span>${ctx.t('form.f.prefTags')}</span>${tagsGrid('pref_tags', r.pref_tags, ctx, {filter: (t) => t.tone !== 'negative'})}</div>
       <div class="field full"><span>${ctx.t('form.f.avoidTags')}</span>${tagsGrid('avoid_tags', r.avoid_tags, ctx)}</div>
      `
    )}
    ${formSection(
      ctx.t('form.section.notes'),
      '',
      `${field({label: ctx.t('form.f.followUp'), name: 'follow_up', value: r.follow_up, type: 'date'})}
       ${textarea({label: ctx.t('form.f.notes'), name: 'notes', value: r.notes, rows: 3})}
      `
    )}
    ${formSection(
      ctx.t('form.section.finance'),
      ctx.t('form.f.financeHint'),
      `${field({label: ctx.t('form.f.income'), name: 'finance.income', value: f.income, type: 'number', min: 0, step: 100})}
       ${field({label: ctx.t('form.f.commitments'), name: 'finance.commitments', value: f.commitments, type: 'number', min: 0, step: 100})}
       ${field({label: ctx.t('form.f.cash'), name: 'finance.cash', value: f.cash, type: 'number', min: 0, step: 1000})}
       ${field({label: ctx.t('form.f.dsr'), name: 'finance.dsr', value: f.dsr ?? 65, type: 'number', min: 1, max: 100, step: 1})}
       ${field({label: ctx.t('form.f.rate'), name: 'finance.rate', value: f.rate ?? 4.3, type: 'number', min: 0, max: 30, step: '0.1'})}
       ${field({label: ctx.t('form.f.loanYears'), name: 'finance.years', value: f.years ?? 30, type: 'number', min: 1, max: 50, step: 1})}
       ${field({label: ctx.t('form.f.margin'), name: 'finance.margin', value: f.margin ?? 90, type: 'number', min: 1, max: 100, step: 1})}
       ${field({label: ctx.t('form.f.rentRatio'), name: 'finance.rent_ratio', value: f.rent_ratio ?? 30, type: 'number', min: 1, max: 100, step: 1})}
       <div class="field full"><p class="afford-preview" id="afford-preview">${ctx.t('form.f.optionalHint')}</p></div>
      `
    )}
  </form>`;
  const close = openModal({
    title: isEdit ? ctx.t('form.editRequirement') : ctx.t('form.newRequirement'),
    subtitle: ctx.t('form.f.sectionHint'),
    body,
    footer: formFooter(ctx.t('form.f.saveRequirement'), ctx.t('common.cancel'), formId),
    wide: true,
    drawer: true
  });
  bindClose(close);
  const form = document.getElementById(formId);

  const areaSearch = form.querySelector('.area-search');
  if (areaSearch) {
    areaSearch.addEventListener('input', () => {
      const q = areaSearch.value.trim().toLowerCase();
      form.querySelectorAll('[data-area-item]').forEach((el) => {
        const hay = el.dataset.search || el.textContent.toLowerCase();
        el.style.display = !q || hay.includes(q) ? '' : 'none';
      });
    });
  }

  const preview = form.querySelector('#afford-preview');
  const updatePreview = () => {
    const data = fdObject(form);
    const income = numOrNull(data['finance.income']);
    if (!income) {
      preview.textContent = ctx.t('form.f.optionalHint');
      return;
    }
    const defaults = {dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30};
    if (data.intent === 'rent') {
      const aff = rentAffordability({income, ratio: numOrNull(data['finance.rent_ratio']) ?? defaults.rent_ratio});
      preview.textContent = aff
        ? `${ctx.t('req.affordabilityRent')} · ${fmtMoney(aff.maxRent, ctx.lang)}${ctx.t('common.perMonth')}`
        : '';
      return;
    }
    const aff = affordability({
      income,
      commitments: numOrNull(data['finance.commitments']) ?? 0,
      cash: numOrNull(data['finance.cash']) ?? 0,
      dsr: numOrNull(data['finance.dsr']) ?? defaults.dsr,
      rate: numOrNull(data['finance.rate']) ?? defaults.rate,
      years: numOrNull(data['finance.years']) ?? defaults.years,
      margin: numOrNull(data['finance.margin']) ?? defaults.margin
    });
    preview.textContent = aff
      ? ctx.t('form.f.affordPreview', {amount: fmtMoney(aff.maxPrice, ctx.lang)})
      : ctx.t('form.f.financeHint');
  };
  form.addEventListener('input', (e) => {
    if ((e.target.name || '').startsWith('finance.') || e.target.name === 'intent') updatePreview();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'intent') updatePreview();
  });
  updatePreview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(
      form,
      () => {
        const data = fdObject(form);
        const fields = {};
        if (!String(data.client_name || '').trim()) fields.client_name = ctx.t('form.f.needClient');
        if (numOrNull(data.budget_max) == null) fields.budget_max = ctx.t('form.f.requiredField');
        if (
          numOrNull(data.budget_min) != null &&
          numOrNull(data.budget_max) != null &&
          numOrNull(data.budget_min) > numOrNull(data.budget_max)
        ) {
          fields.budget_min = ctx.t('form.f.budgetOrder');
        }
        if (Object.keys(fields).length) return {__error: {message: ctx.t('form.f.unknownFields'), fields}};
        return {
          client_name: data.client_name,
          phone: data.phone || null,
          whatsapp: data.whatsapp || null,
          email: data.email || null,
          intent: data.intent,
          purpose: data.purpose,
          status: data.status,
          source: data.source,
          budget_min: numOrNull(data.budget_min),
          budget_max: numOrNull(data.budget_max),
          stretch_pct: numOrNull(data.stretch_pct) ?? 10,
          areas: new FormData(form).getAll('areas'),
          types: new FormData(form).getAll('types'),
          beds_min: numOrNull(data.beds_min),
          baths_min: numOrNull(data.baths_min),
          built_up_min: numOrNull(data.built_up_min),
          carparks_min: numOrNull(data.carparks_min),
          max_age_years: numOrNull(data.max_age_years),
          tenure_pref: data.tenure_pref,
          furnishing_min: data.furnishing_min,
          condition_pref: data.condition_pref,
          must_tags: new FormData(form).getAll('must_tags'),
          pref_tags: new FormData(form).getAll('pref_tags'),
          avoid_tags: new FormData(form).getAll('avoid_tags'),
          strict_fields: new FormData(form).getAll('strict_fields'),
          timeline: data.timeline,
          priority: data.priority,
          notes: data.notes || null,
          follow_up: data.follow_up || null,
          finance: {
            income: numOrNull(data['finance.income']),
            commitments: numOrNull(data['finance.commitments']),
            cash: numOrNull(data['finance.cash']),
            dsr: numOrNull(data['finance.dsr']),
            rate: numOrNull(data['finance.rate']),
            years: numOrNull(data['finance.years']),
            margin: numOrNull(data['finance.margin']),
            rent_ratio: numOrNull(data['finance.rent_ratio'])
          }
        };
      },
      onSubmit
    );
  });
}

// ---------------- 跟进动作 ----------------
export function openActionModal({match, ctx, onSubmit, onRemove}) {
  const r = match.requirement || {};
  const l = match.listing || {};
  const current = match.action || null;
  const statuses = ctx.meta.action_statuses || [];
  const body = `<div class="action-summary">
      <div><span class="muted small">${ctx.t('nav.requirements')}</span><b>${esc(r.client_name || '')}</b></div>
      <div class="action-arrow">${icon('arrowRight', 18)}</div>
      <div><span class="muted small">${ctx.t('nav.listings')}</span><b>${esc(listingTitle(l, ctx.lang))}</b></div>
    </div>
    <form class="form" data-form="action">
      <div class="field full"><span>${ctx.t('match.action')}</span>
        <div class="status-grid">
          ${statuses
            .map(
              (s) => `<label class="status-option tone-${s.tone || 'grey'}">
                <input type="radio" name="status" value="${attr(s.key)}" ${current ? checked(s.key, current.status) : s.key === 'sent' ? 'checked' : ''}>
                <span class="status-icon">${icon(statusIcon(s.key), 17)}</span>
                <span>${esc(s[ctx.lang] || s.zh)}</span>
              </label>`
            )
            .join('')}
        </div>
      </div>
      <label class="field full"><span>${ctx.t('match.actionNote')}</span>
        <textarea name="note" rows="3">${esc(current?.note || '')}</textarea>
      </label>
      <p class="form-error" data-error hidden></p>
    </form>`;
  const footer = `<div class="foot-left">${current ? `<button type="button" class="btn ghost danger-text" data-remove>${icon('trash', 15)}${ctx.t('match.removeAction')}</button>` : ''}</div>
    <div class="foot-right"><button type="button" class="btn ghost" data-cancel>${ctx.t('common.cancel')}</button>
    <button type="button" class="btn primary" data-save>${ctx.t('common.save')}</button></div>`;
  const close = openModal({
    title: ctx.t('match.actionTitle'),
    subtitle: ctx.t('match.actionHint'),
    body,
    footer
  });
  const modal = document.querySelector('.modal');
  const form = modal.querySelector('form');
  const saveBtn = modal.querySelector('[data-save]');
  modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.querySelector('[data-remove]')?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await onRemove();
      close();
    } catch (err) {
      toast(err.message || 'Failed', 'error');
      saveBtn.disabled = false;
    }
  });
  saveBtn.addEventListener('click', async () => {
    const data = new FormData(form);
    const status = data.get('status');
    if (!status) {
      showError(form, ctx.t('form.f.unknownFields'));
      return;
    }
    saveBtn.disabled = true;
    try {
      await onSubmit(status, data.get('note') || '');
      close();
    } catch (err) {
      showError(form, err.message || 'Failed', err.fields);
      saveBtn.disabled = false;
    }
  });
}

function statusIcon(key) {
  const map = {
    shortlisted: 'star',
    sent: 'send',
    viewed: 'eye',
    offer: 'edit',
    won: 'check',
    lost: 'x',
    rejected: 'x'
  };
  return map[key] || 'target';
}

// ---------------- 评分明细 ----------------
export function openScoreModal({match, ctx}) {
  const r = match.requirement || {};
  const l = match.listing || {};
  const missing = match.confidence_missing || [];
  const body = `<div class="score-modal-head">
      <div class="score-modal-title">
        <a href="#/requirements/${r.id}">${esc(r.client_name || '')}</a>
        <span class="muted">${icon('arrowRight', 14)}</span>
        <a href="#/listings/${l.id}">${esc(listingTitle(l, ctx.lang))}</a>
      </div>
      ${reasonChips(match, ctx, 2)}
    </div>
    <div class="score-verdict">
      ${scoreRing(match.score, {size: 'lg'})}
      <div>
        <h3>${esc(ctx.t('match.overallScore'))}</h3>
        <p>${esc(ctx.t('match.breakdownHint'))}</p>
        <div class="verdict-chips">
          <span class="chip outline">${ctx.t('req.confidence')} ${match.confidence}%</span>
          ${match.penalties?.length ? `<span class="chip red">${ctx.t('match.penalty')} ${match.penalties.reduce((s, x) => s + x.points, 0)}</span>` : ''}
          <span class="chip ${match.eligible ? 'green' : 'red'}">${match.eligible ? ctx.t('match.noFailures') : ctx.t('match.failures')}</span>
        </div>
      </div>
    </div>
    ${dimensionBars(match, ctx)}
    <div class="score-columns">
      <div>
        <h4>${ctx.t('req.why')}</h4>
        <ul class="reason-list positive">${(match.highlights || []).map((n) => `<li>${icon('check', 14)}<span>${esc(noteText(n, ctx))}</span></li>`).join('') || `<li class="muted">${ctx.t('common.noData')}</li>`}</ul>
      </div>
      <div>
        <h4>${ctx.t('req.concerns')}</h4>
        <ul class="reason-list negative">${(match.concerns || []).map((n) => `<li>${icon('x', 14)}<span>${esc(noteText(n, ctx))}</span></li>`).join('') || `<li class="muted">${ctx.t('match.noConcerns')}</li>`}</ul>
      </div>
    </div>
    ${match.failures?.length ? `<div class="score-block"><h4>${ctx.t('match.failures')}</h4><div class="failures">${match.failures.map((f) => `<span class="failure-chip">${esc(failureText(f, ctx))}</span>`).join('')}</div></div>` : ''}
    ${missing.length ? `<div class="score-block"><h4>${ctx.t('req.missing')}</h4><div class="chips">${missing.map((m) => `<span class="chip outline">${esc(missingText(m, ctx))}</span>`).join('')}</div></div>` : ''}
    ${match.affordability ? `<div class="score-block"><h4>${ctx.t('req.affordability')}</h4><p class="muted small">${match.affordability.kind === 'rent' ? `${ctx.t('req.affordabilityRent')}: ${esc(fmtMoney(match.affordability.maxRent, ctx.lang))}` : `${ctx.t('req.affordabilityMax')}: ${esc(fmtMoney(match.affordability.maxPrice, ctx.lang))} · ${ctx.t('req.monthlyAtBudget')}: ${esc(fmtMoney(match.affordability.monthlyForBudget, ctx.lang))}`}</p></div>` : ''}
    <p class="disclaimer">${ctx.t('app.disclaimer')}</p>`;
  const footer = `<button type="button" class="btn ghost" data-close-modal>${ctx.t('common.close')}</button>
    <button type="button" class="btn primary" data-action="open-action" data-req="${r.id}" data-listing="${l.id}">${ctx.t('match.action')}</button>`;
  const close = openModal({title: ctx.t('match.viewScore'), body, wide: true, footer});
  bindClose(close);
}

// ---------------- WhatsApp 文案 ----------------
export function openMessageModal({match, ctx, user}) {
  const text = whatsappMessage(
    {requirement: match.requirement, listing: match.listing, match, user},
    ctx
  );
  const phone = match.requirement?.whatsapp || match.requirement?.phone;
  const link = waLink(phone, text);
  const body = `<p class="muted small">${ctx.t('match.messageHint')}</p>
    <textarea class="message-box" readonly rows="12">${esc(text)}</textarea>
    ${!phone ? `<p class="hint">${ctx.t('match.noPhone')}</p>` : ''}`;
  const footer = `<button type="button" class="btn ghost" data-copy>${icon('copy', 16)}${ctx.t('common.copy')}</button>
    ${link ? `<a class="btn whatsapp" href="${attr(link)}" target="_blank" rel="noopener" data-wa>${icon('send', 16)}${ctx.t('match.openWhatsApp')}</a>` : ''}
    <button type="button" class="btn primary" data-close-modal>${ctx.t('common.close')}</button>`;
  const close = openModal({title: ctx.t('match.messageTitle'), body, footer, wide: true});
  bindClose(close);
  const modal = document.querySelector('.modal');
  const box = modal.querySelector('.message-box');
  modal.querySelector('[data-copy]')?.addEventListener('click', async () => {
    await copyText(box.value);
    toast(ctx.t('toast.copied'));
  });
  modal.querySelector('[data-wa]')?.addEventListener('click', () => close());
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ---------------- 账号 ----------------
export function openProfileModal({user, ctx, onSubmit}) {
  const formId = 'profile-form';
  const body = `<form id="${formId}" class="form" data-form="profile">
    ${formError()}
    <div class="form-grid">
      ${field({label: ctx.t('login.name'), name: 'name', value: user.name, required: true})}
      ${field({label: ctx.t('settings.nameEn'), name: 'name_en', value: user.name_en})}
      ${field({label: ctx.t('settings.role'), name: 'title', value: user.title})}
      ${field({label: ctx.t('settings.roleEn'), name: 'title_en', value: user.title_en})}
      ${field({label: ctx.t('login.company'), name: 'company', value: user.company})}
      ${field({label: ctx.t('settings.eNumber'), name: 'e_number', value: user.e_number})}
      ${field({label: ctx.t('login.ren'), name: 'ren', value: user.ren})}
      ${field({label: ctx.t('login.phone'), name: 'phone', value: user.phone})}
      ${field({label: ctx.t('settings.contactEmail'), name: 'contact_email', value: user.contact_email, type: 'email'})}
      ${field({label: ctx.t('settings.website'), name: 'website', value: user.website, placeholder: 'https://kwongthye.com'})}
      ${field({label: ctx.t('settings.officeAddress'), name: 'office_address', value: user.office_address, full: true})}
      ${field({label: ctx.t('settings.loginEmail'), name: 'email', value: user.email, readonly: true, full: true})}
    </div>
  </form>`;
  const close = openModal({
    title: ctx.t('settings.account'),
    body,
    footer: formFooter(ctx.t('common.save'), ctx.t('common.cancel'), formId)
  });
  bindClose(close);
  const form = document.getElementById(formId);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(
      form,
      () => {
        const data = fdObject(form);
        return {
          name: data.name,
          name_en: data.name_en || null,
          title: data.title || null,
          title_en: data.title_en || null,
          company: data.company || null,
          e_number: data.e_number || null,
          ren: data.ren || null,
          phone: data.phone || null,
          contact_email: data.contact_email || null,
          website: data.website || null,
          office_address: data.office_address || null
        };
      },
      onSubmit
    );
  });
}

export function openPasswordModal({ctx, onSubmit}) {
  const formId = 'password-form';
  const body = `<form id="${formId}" class="form">
    ${formError()}
    ${field({label: ctx.t('settings.currentPassword'), name: 'current', type: 'password', required: true, full: true})}
    ${field({label: ctx.t('settings.newPassword'), name: 'password', type: 'password', required: true, full: true})}
  </form>`;
  const close = openModal({
    title: ctx.t('settings.password'),
    body,
    footer: formFooter(ctx.t('common.save'), ctx.t('common.cancel'), formId)
  });
  bindClose(close);
  const form = document.getElementById(formId);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(
      form,
      () => {
        const data = fdObject(form);
        return {current: data.current, password: data.password};
      },
      onSubmit
    );
  });
}

// ---------------- 图片预览 ----------------
export function openPhotoModal(src, ctx) {
  const close = openModal({
    title: ctx.t('lst.gallery', {n: 1}),
    body: `<div class="photo-modal"><img src="${attr(src)}" alt=""></div>`,
    wide: true,
    footer: `<button type="button" class="btn primary" data-close-modal>${ctx.t('common.close')}</button>`
  });
  bindClose(close);
}
