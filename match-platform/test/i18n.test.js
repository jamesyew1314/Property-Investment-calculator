import test from 'node:test';
import assert from 'node:assert/strict';

import {I18N, makeT} from '../public/i18n.js';
import {
  budgetText,
  failureText,
  fmtMoney,
  initials,
  noteText,
  phoneDigits,
  waLink,
  whatsappMessage
} from '../public/format.js';
import {FAILURE_CODES, MISSING_CODES, NOTE_CODES} from '../lib/engine.js';

const meta = {
  areas: [
    {key: 'mount_austin', zh: 'Mount Austin 茂奥斯汀', en: 'Mount Austin'},
    {key: 'austin_heights', zh: 'Austin Heights 奥斯汀高原', en: 'Austin Heights'}
  ],
  tags: [
    {key: 'near_school', zh: '近学校', en: 'Near school'},
    {key: 'gated', zh: '围篱社区', en: 'Gated'},
    {key: 'flood_risk', zh: '水患风险', en: 'Flood risk'}
  ],
  property_types: [{key: 'terrace', zh: '排屋', en: 'Terrace'}],
  tenures: [{key: 'freehold', zh: '永久产权', en: 'Freehold'}],
  furnishings: [{key: 'partial', zh: '部分装修', en: 'Partially furnished'}],
  conditions: [{key: 'good', zh: '状况良好', en: 'Good'}],
  listing_statuses: [{key: 'sold', zh: '已售', en: 'Sold'}],
  action_statuses: [{key: 'sent', zh: '已推荐', en: 'Sent'}],
  requirement_statuses: [{key: 'active', zh: '跟进中', en: 'Active'}]
};

const ctxZh = {t: makeT('zh'), lang: 'zh', meta};
const ctxEn = {t: makeT('en'), lang: 'en', meta};

test('中英文字典键完全一致且没有空值', () => {
  const zh = Object.keys(I18N.zh);
  const en = Object.keys(I18N.en);
  assert.equal(zh.length, en.length);
  for (const key of zh) {
    assert.ok(key in I18N.en, `missing en: ${key}`);
    assert.ok(String(I18N.zh[key]).length > 0, `empty zh: ${key}`);
    assert.ok(String(I18N.en[key]).length > 0, `empty en: ${key}`);
  }
});

test('引擎的每个原因/失败/缺失代码都有中英文案', () => {
  for (const code of NOTE_CODES) {
    assert.ok(`note.${code}` in I18N.zh, `note zh ${code}`);
    assert.ok(`note.${code}` in I18N.en, `note en ${code}`);
  }
  for (const code of FAILURE_CODES) {
    assert.ok(`failure.${code}` in I18N.zh, `failure zh ${code}`);
    assert.ok(`failure.${code}` in I18N.en, `failure en ${code}`);
  }
  for (const code of MISSING_CODES) {
    assert.ok(`missing.${code}` in I18N.zh, `missing zh ${code}`);
    assert.ok(`missing.${code}` in I18N.en, `missing en ${code}`);
  }
});

test('原因文案：金额 / 百分比 / 标签正确本地化，不会双百分号', () => {
  const note = {
    code: 'budget.stretch',
    params: {price: 830000, max: 800000, over: 30000, pct: 3.75, stretch: 10}
  };
  const zh = noteText(note, ctxZh);
  assert.ok(zh.includes('RM 30,000'));
  assert.ok(zh.includes('3.8%'));
  assert.ok(!zh.includes('%%'));
  const en = noteText(note, ctxEn);
  assert.ok(en.includes('RM 30,000'));
});

test('失败文案：避雷标签与房型', () => {
  const avoid = failureText({code: 'gate.avoid', params: {tags: ['flood_risk']}}, ctxZh);
  assert.ok(avoid.includes('水患风险'));
  const type = failureText({code: 'gate.type', params: {type: 'terrace', types: ['condo']}}, ctxEn);
  assert.ok(type.includes('Terrace'));
});

test('金额与预算格式', () => {
  assert.equal(fmtMoney(850000, 'zh'), 'RM 850,000');
  assert.equal(fmtMoney(1234.5, 'en', 2), 'RM 1,234.50');
  assert.equal(
    budgetText({intent: 'rent', budget_min: 1500, budget_max: 2200}, ctxZh),
    'RM 1,500 – RM 2,200/月'
  );
  assert.equal(
    budgetText({intent: 'buy', budget_min: null, budget_max: 500000}, ctxZh),
    'RM 500,000 以内'
  );
});

test('头像缩写：中文姓氏优先，英文取两字母', () => {
  assert.equal(initials('Mr Tan · 陈先生'), '陈');
  assert.equal(initials('Ms Lim · 林小姐'), '林');
  assert.equal(initials('Andy Lau'), 'AL');
  assert.equal(initials('Mr Tan (rental)'), 'T');
});

test('电话号码与 WhatsApp 链接', () => {
  assert.equal(phoneDigits('+60 12-345 6789'), '60123456789');
  assert.equal(phoneDigits('012-345 6789'), '60123456789');
  assert.equal(phoneDigits('+65 8123 4567'), '6581234567');
  assert.ok(waLink('+60 12-345 6789', 'hello').startsWith('https://wa.me/60123456789?text='));
});

test('WhatsApp 文案包含匹配点、地址与免责声明', () => {
  const pair = {
    user: {name: 'Andy Lau', company: 'THE ROOF REALTY SDN BHD', ren: '32839', phone: '+60 12-345 6789'},
    requirement: {client_name: 'Mr Tan', whatsapp: '+60 12-345 6789'},
    listing: {
      id: 1,
      title: 'Austin Heights 双层排屋',
      title_en: 'Austin Heights Terrace',
      intent: 'sale',
      type: 'terrace',
      area: 'Austin Heights',
      price: 850000,
      beds: 4,
      baths: 3,
      built_up: 1650,
      tenure: 'freehold',
      address: 'Jalan Austin Heights 8/5'
    },
    match: {
      highlights: [
        {code: 'budget.within', params: {price: 850000, max: 850000, headroom: 0, pct: 0}},
        {code: 'location.exact', params: {area: 'Austin Heights'}}
      ],
      concerns: []
    }
  };
  const msg = whatsappMessage(pair, ctxZh);
  assert.ok(msg.includes('Mr Tan'));
  assert.ok(msg.includes('Austin Heights 双层排屋'));
  assert.ok(msg.includes('RM 850,000'));
  assert.ok(msg.includes('匹配点'));
  assert.ok(msg.includes('REN 32839'));
  assert.ok(msg.includes('资料仅供参考'));
});
