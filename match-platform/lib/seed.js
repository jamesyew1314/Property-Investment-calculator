// seed.js — 演示数据（柔佛新山；一位中介 + 18 条房源 + 10 组需求 + 跟进记录）
// 首次启动自动写入；演示账号见 DEMO_EMAIL / DEMO_PASSWORD。

import {hashPassword} from './auth.js';
import {refFor} from './store.js';
import {findArea} from './taxonomy.js';

export const DEMO_EMAIL = 'demo@propmatch.my';
export const DEMO_PASSWORD = 'demo1234';

const DAY = 86400000;

function isoDaysAgo(days, hour = 10) {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateFromNow(days) {
  const d = new Date(Date.now() + days * DAY);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function coords(areaName, dLat = 0.004, dLng = 0.004) {
  const a = findArea(areaName);
  if (!a) return {lat: null, lng: null};
  return {lat: Number((a.lat + dLat).toFixed(4)), lng: Number((a.lng + dLng).toFixed(4))};
}

const L = (o = {}) => ({
  intent: 'sale',
  status: 'available',
  city: 'Johor Bahru',
  negotiable: true,
  beds: null,
  baths: null,
  built_up: null,
  land_area: null,
  storeys: null,
  tenure: 'freehold',
  year_built: null,
  furnishing: 'partial',
  condition: 'good',
  carparks: null,
  floor_level: null,
  tags: [],
  photo: null,
  seller_name: null,
  seller_phone: null,
  mandate: 'open',
  mandate_expiry: dateFromNow(120),
  commission_pct: 2,
  available_from: null,
  notes: null,
  _updatedDaysAgo: 7,
  _createdDaysAgo: 45,
  ...o
});

const listingSeeds = [
  L({
    key: 'austinc_crest_shoplot',
    title: 'Austin Crest 三层转角店屋',
    title_en: 'Austin Crest 3-Storey Corner Shoplot',
    type: 'shoplot',
    area: 'Tebrau',
    address: 'Persiaran Jaya Putra, Tebrau, Johor Bahru',
    price: 3600000,
    built_up: 4950,
    land_area: 1650,
    storeys: 3,
    year_built: 2019,
    furnishing: 'unfurnished',
    carparks: 4,
    tags: ['near_mall', 'corner', 'busy_area', 'near_highway'],
    photo: '/demo/shoplot-1.jpg',
    photos: ['/demo/shoplot-1.jpg', '/demo/shoplot-2.jpg', '/demo/shoplot-3.jpg', '/demo/shoplot-4.jpg'],
    seller_name: "Dato' Tan",
    seller_phone: '+60 12-770 8899',
    mandate: 'exclusive',
    commission_pct: 2.5,
    notes: '正对大路、转角单位；适合餐饮/展厅/品牌门面。业主可谈分期付款。',
    _updatedDaysAgo: 2
  }),
  L({
    key: 'austin_terrace',
    title: 'Austin Heights 双层排屋',
    title_en: 'Austin Heights 2-Storey Terrace',
    type: 'terrace',
    area: 'Austin Heights',
    address: 'Jalan Austin Heights 8/5, Taman Austin Heights',
    price: 850000,
    beds: 4,
    baths: 3,
    built_up: 1650,
    land_area: 1540,
    storeys: 2,
    year_built: 2015,
    furnishing: 'partial',
    carparks: 2,
    tags: ['near_school', 'gated', 'renovated', 'quiet'],
    seller_name: 'Mr Lim',
    seller_phone: '+60 16-555 2233',
    mandate: 'open',
    commission_pct: 2,
    notes: '屋况好，厨房已扩展；步行 5 分钟到 Austin Heights 国际学校。',
    _updatedDaysAgo: 3
  }),
  L({
    key: 'mount_austin_condo',
    title: 'Mount Austin 三房公寓',
    title_en: 'Mount Austin 3-Bedroom Condo',
    type: 'condo',
    area: 'Mount Austin',
    address: 'Jalan Mutiara Emas 9/1, Taman Mount Austin',
    price: 520000,
    beds: 3,
    baths: 2,
    built_up: 1050,
    storeys: 1,
    year_built: 2018,
    tenure: 'leasehold',
    furnishing: 'full',
    carparks: 2,
    floor_level: '12/18',
    tags: ['pool', 'gym', 'security', 'near_mall', 'high_floor'],
    seller_name: 'Ms Wong',
    seller_phone: '+60 12-331 7788',
    mandate: 'cobroke',
    commission_pct: 2,
    notes: '全装修、可拎包入住；步行到 AEON Mount Austin。适合投资出租。',
    _updatedDaysAgo: 5
  }),
  L({
    key: 'tropika_semid',
    title: 'Setia Tropika 半独立式',
    title_en: 'Setia Tropika Semi-D',
    type: 'semi_d',
    area: 'Setia Tropika',
    address: 'Jalan Setia Tropika 1/12, Setia Tropika',
    price: 1280000,
    beds: 5,
    baths: 4,
    built_up: 3200,
    land_area: 4000,
    storeys: 2,
    year_built: 2012,
    furnishing: 'partial',
    condition: 'renovated',
    carparks: 4,
    tags: ['gated', 'security', 'corner', 'quiet', 'renovated'],
    seller_name: 'Mr Ng',
    seller_phone: '+60 19-777 1122',
    mandate: 'exclusive',
    commission_pct: 2.5,
    notes: '围篱社区、转角 40×100；已做干湿厨房与二楼家庭厅。',
    _updatedDaysAgo: 8
  }),
  L({
    key: 'bukit_indah_terrace',
    title: 'Bukit Indah 双层排屋',
    title_en: 'Bukit Indah 2-Storey Terrace',
    type: 'terrace',
    area: 'Bukit Indah',
    address: 'Jalan Indah 22/3, Taman Bukit Indah',
    price: 780000,
    beds: 4,
    baths: 3,
    built_up: 1540,
    land_area: 1540,
    storeys: 2,
    year_built: 2010,
    furnishing: 'unfurnished',
    carparks: 2,
    tags: ['near_school', 'near_mall', 'quiet'],
    seller_name: 'Ms Koh',
    seller_phone: '+60 12-886 4455',
    mandate: 'open',
    commission_pct: 2,
    notes: '原始屋况、可自己装修；靠近 Bukit Indah 学校与商场。',
    _updatedDaysAgo: 14
  }),
  L({
    key: 'molek_shoplot',
    title: 'Taman Molek 三层店屋',
    title_en: 'Taman Molek 3-Storey Shoplot',
    type: 'shoplot',
    area: 'Taman Molek',
    address: 'Jalan Molek 1/9, Taman Molek',
    price: 1450000,
    built_up: 3200,
    land_area: 1540,
    storeys: 3,
    year_built: 2008,
    furnishing: 'partial',
    carparks: 3,
    tags: ['near_mall', 'tenanted', 'busy_area'],
    seller_name: 'Mr Teo',
    seller_phone: '+60 16-888 9900',
    mandate: 'open',
    commission_pct: 2,
    notes: '底楼已租给连锁餐饮，租金 RM 8,500/月；现有租约到 2027 年。',
    _updatedDaysAgo: 20
  }),
  L({
    key: 'danga_condo',
    title: 'Danga Bay 海景公寓',
    title_en: 'Danga Bay Sea View Condo',
    type: 'condo',
    area: 'Danga Bay',
    address: 'Jalan Skudai, Danga Bay',
    price: 950000,
    beds: 3,
    baths: 3,
    built_up: 1300,
    storeys: 1,
    year_built: 2016,
    furnishing: 'full',
    carparks: 2,
    floor_level: '21/30',
    tags: ['sea_view', 'pool', 'gym', 'security', 'near_mall', 'high_floor'],
    seller_name: 'Ms Tan',
    seller_phone: '+60 12-222 3131',
    mandate: 'exclusive',
    commission_pct: 2.5,
    notes: '永久海景、全装修；业主换房急售，价格可谈。',
    _updatedDaysAgo: 1
  }),
  L({
    key: 'permas_terrace',
    title: 'Permas Jaya 双层排屋',
    title_en: 'Permas Jaya 2-Storey Terrace',
    type: 'terrace',
    area: 'Permas Jaya',
    address: 'Jalan Permas 10/5, Bandar Baru Permas Jaya',
    price: 620000,
    beds: 3,
    baths: 2,
    built_up: 1300,
    land_area: 1300,
    storeys: 2,
    year_built: 2005,
    tenure: 'leasehold',
    furnishing: 'unfurnished',
    condition: 'needs_work',
    carparks: 1,
    tags: ['near_school', 'flood_risk'],
    seller_name: 'Mr Ismail',
    seller_phone: '+60 13-400 7788',
    mandate: 'open',
    commission_pct: 2,
    notes: '需要整修；屋主已移居外州，价格有空间。雨季门口偶有积水。',
    _updatedDaysAgo: 32
  }),
  L({
    key: 'kulai_terrace',
    title: 'Kulai 单层排屋',
    title_en: 'Kulai Single-Storey Terrace',
    type: 'terrace',
    area: 'Kulai',
    address: 'Jalan Kenanga 3, Taman Kulai Baru',
    price: 380000,
    beds: 3,
    baths: 2,
    built_up: 1100,
    land_area: 1200,
    storeys: 1,
    year_built: 2000,
    furnishing: 'unfurnished',
    carparks: 1,
    tags: ['near_school', 'quiet'],
    seller_name: 'Mr Goh',
    seller_phone: '+60 12-909 6677',
    mandate: 'open',
    commission_pct: 2,
    notes: '首购族友好；靠近 Kulai 老街与学校，屋况可接受。',
    _updatedDaysAgo: 11
  }),
  L({
    key: 'gelang_terrace',
    title: 'Gelang Patah 双层排屋',
    title_en: 'Gelang Patah 2-Storey Terrace',
    type: 'terrace',
    area: 'Gelang Patah',
    address: 'Jalan Laman Setia 2/3, Gelang Patah',
    price: 680000,
    beds: 4,
    baths: 3,
    built_up: 1600,
    land_area: 1400,
    storeys: 2,
    year_built: 2019,
    furnishing: 'partial',
    carparks: 2,
    tags: ['gated', 'near_school', 'quiet'],
    seller_name: 'Mr Heng',
    seller_phone: '+60 16-222 8899',
    mandate: 'open',
    commission_pct: 2,
    notes: '靠近教育城与第二通道；适合在新加坡工作的家庭。',
    _updatedDaysAgo: 6
  }),
  L({
    key: 'skudai_condo_rent',
    title: 'Skudai 三房公寓（出租）',
    title_en: 'Skudai 3-Bedroom Condo (Rent)',
    type: 'condo',
    area: 'Skudai',
    address: 'Jalan Hang Tuah 12, Skudai',
    price: 1800,
    intent: 'rent',
    beds: 3,
    baths: 2,
    built_up: 950,
    storeys: 1,
    year_built: 2019,
    tenure: 'leasehold',
    furnishing: 'partial',
    carparks: 1,
    floor_level: '6/12',
    tags: ['security', 'gym', 'near_mall', 'walk_to_amenities'],
    seller_name: 'Ms Yap',
    seller_phone: '+60 12-567 1122',
    mandate: 'open',
    commission_pct: 1,
    available_from: dateFromNow(7),
    notes: '现有租客 11 月底搬走；可预约 11 月起看房。',
    _updatedDaysAgo: 4
  }),
  L({
    key: 'austin_terrace_rent',
    title: 'Austin Heights 排屋（出租）',
    title_en: 'Austin Heights Terrace (Rent)',
    type: 'terrace',
    area: 'Austin Heights',
    address: 'Jalan Austin Heights 7/2, Taman Austin Heights',
    price: 2600,
    intent: 'rent',
    beds: 4,
    baths: 3,
    built_up: 1650,
    land_area: 1540,
    storeys: 2,
    year_built: 2015,
    furnishing: 'partial',
    carparks: 2,
    tags: ['gated', 'near_school', 'quiet'],
    seller_name: 'Mr Lim',
    seller_phone: '+60 16-555 2233',
    mandate: 'open',
    commission_pct: 1,
    notes: '适合家庭长租；有基本家具与冷气。',
    _updatedDaysAgo: 9
  }),
  L({
    key: 'austin_condo_rent',
    title: 'Mount Austin 公寓（出租）',
    title_en: 'Mount Austin Condo (Rent)',
    type: 'condo',
    area: 'Mount Austin',
    address: 'Jalan Mutiara Emas 9/1, Taman Mount Austin',
    price: 1500,
    intent: 'rent',
    beds: 2,
    baths: 2,
    built_up: 800,
    storeys: 1,
    year_built: 2020,
    tenure: 'leasehold',
    furnishing: 'full',
    carparks: 1,
    floor_level: '9/18',
    tags: ['pool', 'gym', 'near_mall', 'high_floor', 'security'],
    seller_name: 'Ms Wong',
    seller_phone: '+60 12-331 7788',
    mandate: 'cobroke',
    commission_pct: 1,
    notes: '全装修、可立即入住；适合单身或小家庭。',
    _updatedDaysAgo: 2
  }),
  L({
    key: 'nusa_shoplot_rent',
    title: 'Nusa Bestari 双层店屋（出租）',
    title_en: 'Nusa Bestari 2-Storey Shoplot (Rent)',
    type: 'shoplot',
    area: 'Nusa Bestari',
    address: 'Jalan Bestari 1/2, Taman Nusa Bestari',
    price: 6500,
    intent: 'rent',
    built_up: 2400,
    land_area: 1400,
    storeys: 2,
    year_built: 2012,
    furnishing: 'partial',
    carparks: 3,
    tags: ['near_mall', 'busy_area', 'tenanted'],
    seller_name: 'Mr Chua',
    seller_phone: '+60 12-777 0909',
    mandate: 'open',
    commission_pct: 1,
    notes: '现有餐饮租约到 2028 年，接手即可收租。',
    _updatedDaysAgo: 18
  }),
  L({
    key: 'setia_indah_terrace',
    title: 'Setia Indah 双层排屋',
    title_en: 'Setia Indah 2-Storey Terrace',
    type: 'terrace',
    area: 'Setia Indah',
    address: 'Jalan Setia Indah 12/3, Setia Indah',
    price: 760000,
    beds: 4,
    baths: 3,
    built_up: 1600,
    land_area: 1500,
    storeys: 2,
    year_built: 2017,
    furnishing: 'partial',
    carparks: 2,
    tags: ['gated', 'near_school', 'quiet'],
    seller_name: 'Mr Wee',
    seller_phone: '+60 19-888 1234',
    mandate: 'open',
    commission_pct: 2,
    notes: '屋主自住、保养好；围篱社区内有游乐场。',
    _updatedDaysAgo: 5
  }),
  L({
    key: 'mount_austin_condo2',
    title: 'Mount Austin 公寓（翻新单位）',
    title_en: 'Mount Austin Condo (Renovated)',
    type: 'condo',
    area: 'Mount Austin',
    address: 'Jalan Mutiara Emas 10/2, Taman Mount Austin',
    price: 690000,
    beds: 3,
    baths: 2,
    built_up: 1150,
    storeys: 1,
    year_built: 2021,
    tenure: 'leasehold',
    furnishing: 'full',
    condition: 'renovated',
    carparks: 2,
    floor_level: '15/22',
    tags: ['pool', 'gym', 'security', 'near_mall', 'high_floor', 'renovated'],
    seller_name: 'Ms Lau',
    seller_phone: '+60 12-444 8899',
    mandate: 'open',
    commission_pct: 2,
    notes: '2024 年翻新，全套家具；业主可接受议价。',
    _updatedDaysAgo: 3
  }),
  L({
    key: 'sold_condo',
    title: 'Austin Heights 公寓（已售）',
    title_en: 'Austin Heights Condo (Sold)',
    type: 'condo',
    area: 'Austin Heights',
    address: 'Jalan Austin Heights 3/1, Taman Austin Heights',
    price: 480000,
    status: 'sold',
    beds: 3,
    baths: 2,
    built_up: 980,
    storeys: 1,
    year_built: 2017,
    tenure: 'leasehold',
    furnishing: 'full',
    carparks: 1,
    floor_level: '8/15',
    tags: ['pool', 'gym', 'security', 'near_mall'],
    seller_name: 'Ms Ng',
    seller_phone: '+60 12-101 2020',
    mandate: 'open',
    commission_pct: 2,
    notes: '成交参考：2026 年 9 月以 RM 480,000 成交。',
    _updatedDaysAgo: 30
  }),
  L({
    key: 'reserved_terrace',
    title: 'Bukit Indah 双层排屋（已订）',
    title_en: 'Bukit Indah 2-Storey Terrace (Reserved)',
    type: 'terrace',
    area: 'Bukit Indah',
    address: 'Jalan Indah 16/7, Taman Bukit Indah',
    price: 720000,
    status: 'reserved',
    beds: 4,
    baths: 3,
    built_up: 1560,
    land_area: 1540,
    storeys: 2,
    year_built: 2013,
    furnishing: 'partial',
    carparks: 2,
    tags: ['near_school', 'near_mall', 'gated'],
    seller_name: 'Mr Foo',
    seller_phone: '+60 16-333 4455',
    mandate: 'open',
    commission_pct: 2,
    notes: '已收订金 3%，若贷款不批可回到市场。',
    _updatedDaysAgo: 25
  }),
  L({
    key: 'incomplete_terrace',
    title: 'Austin Heights 双层排屋（资料待补）',
    title_en: 'Austin Heights 2-Storey Terrace (Info Pending)',
    type: 'terrace',
    area: 'Austin Heights',
    price: 820000,
    beds: null,
    baths: null,
    built_up: null,
    tenure: null,
    furnishing: null,
    year_built: null,
    tags: [],
    seller_name: 'New owner',
    seller_phone: '+60 12-000 1111',
    mandate: 'open',
    commission_pct: 2,
    notes: '业主刚委托，房型/面积/产权待补；先按价格与地区匹配。',
    _updatedDaysAgo: 1
  })
];

const R = (o = {}) => ({
  purpose: 'own',
  phone: null,
  whatsapp: null,
  email: null,
  budget_min: null,
  budget_max: null,
  stretch_pct: 10,
  areas: [],
  types: [],
  beds_min: null,
  baths_min: null,
  built_up_min: null,
  tenure_pref: 'any',
  furnishing_min: 'any',
  condition_pref: 'any',
  carparks_min: null,
  max_age_years: null,
  must_tags: [],
  pref_tags: [],
  avoid_tags: [],
  strict_fields: ['tenure'],
  timeline: '1_3m',
  priority: 'balanced',
  source: 'whatsapp',
  status: 'active',
  notes: null,
  follow_up: null,
  finance: {
    income: null,
    commitments: 0,
    cash: 0,
    dsr: 65,
    rate: 4.3,
    years: 30,
    margin: 90,
    rent_ratio: 30
  },
  _updatedDaysAgo: 4,
  _createdDaysAgo: 30,
  ...o
});

const requirementSeeds = [
  R({
    key: 'tan_family',
    client_name: 'Mr Tan · 陈先生',
    phone: '+60 12-345 6789',
    whatsapp: '+60 12-345 6789',
    email: 'tan.family@example.com',
    intent: 'buy',
    budget_min: 700000,
    budget_max: 850000,
    areas: ['Mount Austin', 'Austin Heights', 'Setia Indah'],
    types: ['terrace', 'semi_d'],
    beds_min: 4,
    baths_min: 3,
    built_up_min: 1500,
    tenure_pref: 'freehold',
    furnishing_min: 'partial',
    condition_pref: 'good',
    carparks_min: 2,
    must_tags: ['near_school'],
    pref_tags: ['gated', 'quiet'],
    avoid_tags: ['flood_risk'],
    strict_fields: ['tenure'],
    timeline: 'urgent',
    priority: 'space',
    notes: '两个孩子读 Austin Heights 国际学校，希望 12 月前搬入；首购，贷款约 90%。',
    follow_up: dateFromNow(2),
    finance: {income: 12000, commitments: 1200, cash: 180000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 1
  }),
  R({
    key: 'lim_investor',
    client_name: 'Ms Lim · 林小姐',
    phone: '+60 16-889 2211',
    whatsapp: '+60 16-889 2211',
    intent: 'buy',
    purpose: 'invest',
    budget_min: 450000,
    budget_max: 550000,
    areas: ['Mount Austin', 'Bukit Indah'],
    types: ['condo', 'apartment'],
    beds_min: 2,
    built_up_min: 800,
    furnishing_min: 'full',
    must_tags: ['near_mall'],
    pref_tags: ['pool', 'gym', 'security'],
    avoid_tags: ['flood_risk'],
    strict_fields: [],
    timeline: '1_3m',
    priority: 'value',
    source: 'referral',
    notes: '买来收租，要求全装修、可立即出租；可接受租赁产权。',
    follow_up: dateFromNow(1),
    finance: {income: 9000, commitments: 2000, cash: 80000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 3
  }),
  R({
    key: 'wong_upgrade',
    client_name: "Dato' Wong",
    phone: '+60 12-900 1188',
    whatsapp: '+60 12-900 1188',
    intent: 'buy',
    purpose: 'own',
    budget_min: 1200000,
    budget_max: 1500000,
    areas: ['Setia Tropika', 'Bukit Indah', 'Nusajaya'],
    types: ['semi_d', 'bungalow'],
    beds_min: 5,
    baths_min: 4,
    built_up_min: 3000,
    tenure_pref: 'freehold',
    furnishing_min: 'partial',
    condition_pref: 'good',
    carparks_min: 3,
    must_tags: ['gated', 'security'],
    pref_tags: ['corner', 'quiet'],
    strict_fields: ['tenure'],
    timeline: '3_6m',
    priority: 'location',
    source: 'walk_in',
    notes: '换大屋，重视社区安全与隐私；现金充足，可全款后贷款。',
    follow_up: dateFromNow(5),
    finance: {income: 30000, commitments: 5000, cash: 500000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 6
  }),
  R({
    key: 'ng_expat',
    client_name: 'Ms Ng · 黄小姐',
    phone: '+65 8123 4567',
    whatsapp: '+65 8123 4567',
    intent: 'rent',
    budget_min: 1500,
    budget_max: 2200,
    areas: ['Mount Austin', 'Austin Heights', 'Skudai'],
    types: ['condo', 'apartment'],
    beds_min: 2,
    built_up_min: 800,
    furnishing_min: 'full',
    must_tags: ['pool', 'gym', 'security'],
    avoid_tags: ['ground_floor', 'busy_area'],
    strict_fields: ['furnishing'],
    timeline: 'urgent',
    priority: 'balanced',
    source: 'portal',
    notes: '新加坡工作、每天往返；要求有泳池健身房，11 月入住。',
    follow_up: dateFromNow(0),
    finance: {income: 8000, commitments: 500, cash: 30000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 2
  }),
  R({
    key: 'raj_first',
    client_name: 'Mr Raj',
    phone: '+60 13-222 7788',
    whatsapp: '+60 13-222 7788',
    intent: 'buy',
    purpose: 'own',
    budget_min: 380000,
    budget_max: 480000,
    areas: ['Kulai', 'Senai', 'Skudai'],
    types: ['terrace'],
    beds_min: 3,
    built_up_min: 1000,
    tenure_pref: 'freehold',
    furnishing_min: 'any',
    must_tags: ['near_school'],
    pref_tags: ['quiet'],
    strict_fields: ['tenure'],
    timeline: '1_3m',
    priority: 'value',
    source: 'whatsapp',
    notes: '首购、预算紧；需要 3 房，靠近学校；已做贷款预审。',
    follow_up: dateFromNow(-1),
    finance: {income: 6500, commitments: 800, cash: 60000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 5
  }),
  R({
    key: 'chen_shoplot',
    client_name: 'Ms Chen · 陈太',
    phone: '+60 12-666 3322',
    whatsapp: '+60 12-666 3322',
    intent: 'buy',
    purpose: 'invest',
    budget_min: 1300000,
    budget_max: 1600000,
    areas: ['Taman Molek', 'Johor Jaya', 'Tebrau'],
    types: ['shoplot'],
    built_up_min: 2000,
    tenure_pref: 'freehold',
    must_tags: ['tenanted'],
    pref_tags: ['near_mall', 'busy_area'],
    strict_fields: ['tenure'],
    timeline: '1_3m',
    priority: 'value',
    source: 'referral',
    notes: '只考虑带租约的店屋，要有稳定租金；可接受 2–3 层。',
    follow_up: dateFromNow(3),
    finance: {income: 25000, commitments: 6000, cash: 400000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 8
  }),
  R({
    key: 'hafiz_family',
    client_name: 'Mr Hafiz',
    phone: '+60 19-333 8899',
    whatsapp: '+60 19-333 8899',
    intent: 'rent',
    budget_min: 2000,
    budget_max: 3000,
    areas: ['Austin Heights', 'Setia Indah'],
    types: ['terrace'],
    beds_min: 4,
    built_up_min: 1400,
    must_tags: ['gated', 'near_school'],
    pref_tags: ['quiet'],
    strict_fields: [],
    timeline: '1_3m',
    priority: 'space',
    source: 'whatsapp',
    notes: '一家五口长租，最好有围篱；孩子读附近华小。',
    follow_up: dateFromNow(10),
    finance: {income: 9500, commitments: 1500, cash: 40000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 4
  }),
  R({
    key: 'koh_downgrade',
    client_name: 'Mrs Koh · 许太',
    phone: '+60 12-777 5566',
    whatsapp: '+60 12-777 5566',
    intent: 'buy',
    purpose: 'own',
    budget_min: 600000,
    budget_max: 750000,
    areas: ['Bukit Indah', 'Nusa Bestari', 'Skudai'],
    types: ['terrace', 'condo'],
    beds_min: 3,
    baths_min: 2,
    built_up_min: 1000,
    furnishing_min: 'any',
    must_tags: ['near_mall'],
    pref_tags: ['quiet', 'security'],
    strict_fields: [],
    timeline: '3_6m',
    priority: 'balanced',
    source: 'walk_in',
    notes: '孩子搬出去后想换小一点；不急着卖旧屋，可等好价。',
    follow_up: dateFromNow(7),
    finance: {income: 11000, commitments: 2500, cash: 220000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 9
  }),
  R({
    key: 'goh_browsing',
    client_name: 'Mr Goh',
    phone: '+60 16-111 2233',
    whatsapp: '+60 16-111 2233',
    intent: 'buy',
    purpose: 'own',
    budget_min: 800000,
    budget_max: 1000000,
    areas: ['Danga Bay', 'JB City'],
    types: ['condo'],
    beds_min: 3,
    built_up_min: 1200,
    must_tags: ['sea_view'],
    pref_tags: ['high_floor', 'security'],
    strict_fields: [],
    timeline: 'browsing',
    priority: 'location',
    status: 'paused',
    source: 'social',
    notes: '先看看海景盘，等 RTS 通车后再决定；预算与贷款资料未提供。',
    follow_up: dateFromNow(14),
    _updatedDaysAgo: 12
  }),
  R({
    key: 'tan_rental',
    client_name: 'Mr Tan (rental)',
    phone: '+60 12-345 6789',
    whatsapp: '+60 12-345 6789',
    intent: 'rent',
    budget_min: 3000,
    budget_max: 4000,
    areas: ['Austin Heights'],
    types: ['terrace', 'semi_d'],
    beds_min: 4,
    baths_min: 3,
    built_up_min: 1500,
    must_tags: ['gated'],
    pref_tags: ['near_school', 'quiet'],
    strict_fields: [],
    timeline: '1_3m',
    priority: 'space',
    source: 'whatsapp',
    notes: '暂租一年等新房交房；需要 4 房、有围篱。',
    follow_up: dateFromNow(4),
    finance: {income: 15000, commitments: 2000, cash: 60000, dsr: 65, rate: 4.3, years: 30, margin: 90, rent_ratio: 30},
    _updatedDaysAgo: 3
  })
];

const actionSeeds = [
  {req: 'tan_family', listing: 'austin_terrace', status: 'sent', daysAgo: 1, note: '已发 WhatsApp，安排周六看房。'},
  {req: 'lim_investor', listing: 'mount_austin_condo', status: 'viewed', daysAgo: 3, note: '已看房，喜欢装修；在比较租金回报。'},
  {req: 'ng_expat', listing: 'austin_condo_rent', status: 'shortlisted', daysAgo: 1, note: '预算内、全装修，等她确认 11 月入住。'},
  {req: 'wong_upgrade', listing: 'tropika_semid', status: 'shortlisted', daysAgo: 2, note: '屋主接受 1.25M 左右，待 Dato 回看。'},
  {req: 'raj_first', listing: 'kulai_terrace', status: 'offer', daysAgo: 4, note: '已出价 RM 365,000，等屋主回复。'},
  {req: 'chen_shoplot', listing: 'molek_shoplot', status: 'sent', daysAgo: 2, note: '租约与租金明细已发；约下周看店面。'},
  {req: 'koh_downgrade', listing: 'bukit_indah_terrace', status: 'sent', daysAgo: 5, note: '发了两间 Bukit Indah 的比较表。'},
  {req: 'hafiz_family', listing: 'austin_terrace_rent', status: 'viewed', daysAgo: 6, note: '看房后觉得租金略高，正在谈 2,400。'}
];

function populateDemo(store, user) {
  const now = Date.now();
  const listingIds = new Map();
  for (const seed of listingSeeds) {
    const {key, _updatedDaysAgo, _createdDaysAgo, ...data} = seed;
    const c = coords(data.area);
    const row = store.insert('listings', {
      ...data,
      lat: data.lat ?? c.lat,
      lng: data.lng ?? c.lng,
      owner_id: user.id
    });
    store.update('listings', row.id, {ref: refFor('L', row.id)});
    listingIds.set(key, row.id);
  }

  const reqIds = new Map();
  for (const seed of requirementSeeds) {
    const {key, _updatedDaysAgo, _createdDaysAgo, ...data} = seed;
    const row = store.insert('requirements', {...data, owner_id: user.id});
    store.update('requirements', row.id, {ref: refFor('R', row.id)});
    reqIds.set(key, row.id);
  }

  // 时间线：让「最近更新/跟进到期」看起来真实
  const freshListings = {
    danga_condo: 3,
    austin_terrace: 5,
    setia_indah_terrace: 6,
    incomplete_terrace: 2,
    mount_austin_condo: 4
  };
  const freshRequirements = {tan_family: 3, lim_investor: 5, ng_expat: 2, koh_downgrade: 6};
  for (const seed of listingSeeds) {
    const row = store.get('listings', listingIds.get(seed.key));
    row.created_at = new Date(
      now - (freshListings[seed.key] ?? seed._createdDaysAgo ?? 45) * DAY
    ).toISOString();
    row.updated_at = new Date(now - (seed._updatedDaysAgo ?? 7) * DAY).toISOString();
  }
  for (const seed of requirementSeeds) {
    const row = store.get('requirements', reqIds.get(seed.key));
    row.created_at = new Date(
      now - (freshRequirements[seed.key] ?? seed._createdDaysAgo ?? 30) * DAY
    ).toISOString();
    row.updated_at = new Date(now - (seed._updatedDaysAgo ?? 4) * DAY).toISOString();
  }

  for (const seed of actionSeeds) {
    const action = store.insert('actions', {
      owner_id: user.id,
      requirement_id: reqIds.get(seed.req),
      listing_id: listingIds.get(seed.listing),
      status: seed.status,
      note: seed.note
    });
    action.created_at = new Date(now - seed.daysAgo * DAY).toISOString();
    action.updated_at = action.created_at;
  }

  const activities = [
    {kind: 'action.offer', daysAgo: 4, detail: {label: 'Mr Raj 出价 RM 365,000', listing: 'Kulai 单层排屋'}},
    {kind: 'action.viewed', daysAgo: 3, detail: {label: 'Ms Lim 已看 Mount Austin 公寓', listing: 'Mount Austin 三房公寓'}},
    {kind: 'listing.created', daysAgo: 1, detail: {label: '新增资料待补房源', listing: 'Austin Heights 双层排屋（资料待补）'}},
    {kind: 'requirement.updated', daysAgo: 1, detail: {label: 'Mr Tan 需求更新：12 月前搬入', listing: null}},
    {kind: 'action.sent', daysAgo: 1, detail: {label: '向 Mr Tan 发送 Austin Heights 排屋', listing: 'Austin Heights 双层排屋'}},
    {kind: 'action.shortlisted', daysAgo: 2, detail: {label: "Dato' Wong 收藏 Setia Tropika 半独立", listing: 'Setia Tropika 半独立式'}},
    {kind: 'listing.updated', daysAgo: 2, detail: {label: 'Danga Bay 海景公寓降价 5 万', listing: 'Danga Bay 海景公寓'}},
    {kind: 'requirement.created', daysAgo: 3, detail: {label: '新增租客需求：Ms Ng', listing: null}}
  ];
  for (const a of activities) {
    const row = store.insert('activities', {
      owner_id: user.id,
      kind: a.kind,
      entity: a.listing ? 'listing' : 'requirement',
      entity_id: null,
      detail: a.detail
    });
    row.created_at = new Date(now - a.daysAgo * DAY).toISOString();
  }

  store.save();
  return {user_id: user.id, listings: listingSeeds.length, requirements: requirementSeeds.length};
}

export function seedDemo(store) {
  if (store.count('users') > 0) return {created: false};
  const user = store.insert('users', {
    name: 'Andy Lau',
    email: DEMO_EMAIL,
    phone: '+60 12-345 6789',
    company: 'THE ROOF REALTY SDN BHD',
    ren: '32839',
    role: 'owner',
    password_hash: hashPassword(DEMO_PASSWORD)
  });
  const res = populateDemo(store, user);
  return {created: true, ...res};
}

export function resetDemo(store, userId) {
  const user = store.get('users', userId);
  if (!user) return null;
  store.data.listings = store.data.listings.filter((row) => row.owner_id !== user.id);
  store.data.requirements = store.data.requirements.filter((row) => row.owner_id !== user.id);
  store.data.actions = store.data.actions.filter((row) => row.owner_id !== user.id);
  store.data.activities = store.data.activities.filter((row) => row.owner_id !== user.id);
  store.save();
  return populateDemo(store, user);
}

export {listingSeeds, requirementSeeds};
