// taxonomy.js — 配对字典（区域、房型、产权、装修、配套标签、权重档案）
// 所有中文/英文显示名都集中在这里；前端通过 GET /api/meta 取得，避免两套字典漂移。

export const PROPERTY_TYPES = [
  {key: 'terrace', zh: '排屋', en: 'Terrace', icon: '🏠'},
  {key: 'semi_d', zh: '半独立式', en: 'Semi-D', icon: '🏡'},
  {key: 'bungalow', zh: '独立式洋房', en: 'Bungalow', icon: '🏘️'},
  {key: 'townhouse', zh: 'Townhouse', en: 'Townhouse', icon: '🏘️'},
  {key: 'condo', zh: '公寓 / 共管公寓', en: 'Condominium', icon: '🏢'},
  {key: 'apartment', zh: 'Apartment', en: 'Apartment', icon: '🏬'},
  {key: 'shoplot', zh: '店屋 / 商铺', en: 'Shoplot', icon: '🏪'},
  {key: 'office', zh: '办公室', en: 'Office', icon: '🏢'},
  {key: 'land', zh: '土地', en: 'Land', icon: '🌳'}
];

export const INTENTS = [
  {key: 'buy', zh: '买', en: 'Buy'},
  {key: 'rent', zh: '租', en: 'Rent'}
];

// Listing 侧：sale 对应 requirement 的 buy
export const LISTING_INTENTS = [
  {key: 'sale', zh: '出售', en: 'For Sale'},
  {key: 'rent', zh: '出租', en: 'For Rent'}
];

export const TENURES = [
  {key: 'freehold', zh: '永久产权', en: 'Freehold'},
  {key: 'leasehold', zh: '租赁产权', en: 'Leasehold'}
];

export const TENURE_PREFS = [
  {key: 'any', zh: '不限', en: 'Any'},
  {key: 'freehold', zh: '必须永久产权', en: 'Freehold only'},
  {key: 'leasehold', zh: '必须租赁产权', en: 'Leasehold only'}
];

export const FURNISHINGS = [
  {key: 'unfurnished', rank: 0, zh: '无装修 / 空屋', en: 'Unfurnished'},
  {key: 'partial', rank: 1, zh: '部分装修', en: 'Partially furnished'},
  {key: 'full', rank: 2, zh: '全装修', en: 'Fully furnished'}
];

export const FURNISHING_PREFS = [
  {key: 'any', zh: '不限', en: 'Any'},
  {key: 'unfurnished', zh: '空屋即可', en: 'Unfurnished OK'},
  {key: 'partial', zh: '至少部分装修', en: 'At least partial'},
  {key: 'full', zh: '必须全装修', en: 'Fully furnished'}
];

export const CONDITIONS = [
  {key: 'new', rank: 4, zh: '全新', en: 'New'},
  {key: 'renovated', rank: 3, zh: '已翻新', en: 'Renovated'},
  {key: 'good', rank: 2, zh: '状况良好', en: 'Good'},
  {key: 'fair', rank: 1, zh: '一般', en: 'Fair'},
  {key: 'needs_work', rank: 0, zh: '需整修', en: 'Needs work'}
];

export const CONDITION_PREFS = [
  {key: 'any', zh: '不限', en: 'Any'},
  {key: 'good', zh: '至少状况良好', en: 'At least good'},
  {key: 'renovated', zh: '已翻新', en: 'Renovated'},
  {key: 'new', zh: '全新', en: 'New'}
];

// 配套 / 卖点标签。group 用于表单分组，tone 用于匹配里的正负提示。
export const TAGS = [
  {key: 'near_school', group: 'lifestyle', tone: 'positive', zh: '近学校', en: 'Near school'},
  {key: 'near_mall', group: 'lifestyle', tone: 'positive', zh: '近商场', en: 'Near mall'},
  {key: 'pool', group: 'lifestyle', tone: 'positive', zh: '泳池', en: 'Swimming pool'},
  {key: 'gym', group: 'lifestyle', tone: 'positive', zh: '健身房', en: 'Gym'},
  {key: 'near_transit', group: 'lifestyle', tone: 'positive', zh: '近公交 / RTS', en: 'Near transport'},
  {key: 'walk_to_amenities', group: 'lifestyle', tone: 'positive', zh: '步行生活圈', en: 'Walk to amenities'},
  {key: 'quiet', group: 'lifestyle', tone: 'positive', zh: '安静', en: 'Quiet'},
  {key: 'park_view', group: 'lifestyle', tone: 'positive', zh: '公园景观', en: 'Park view'},
  {key: 'sea_view', group: 'lifestyle', tone: 'positive', zh: '海景', en: 'Sea view'},
  {key: 'city_view', group: 'lifestyle', tone: 'positive', zh: '城市景观', en: 'City view'},
  {key: 'gated', group: 'community', tone: 'positive', zh: '围篱社区', en: 'Gated'},
  {key: 'security', group: 'community', tone: 'positive', zh: '24 小时保安', en: '24h security'},
  {key: 'corner', group: 'community', tone: 'positive', zh: '转角单位', en: 'Corner lot'},
  {key: 'pet_friendly', group: 'community', tone: 'positive', zh: '可养宠物', en: 'Pet friendly'},
  {key: 'renovated', group: 'unit', tone: 'positive', zh: '已装修', en: 'Renovated'},
  {key: 'high_floor', group: 'unit', tone: 'positive', zh: '高层', en: 'High floor'},
  {key: 'ground_floor', group: 'unit', tone: 'neutral', zh: '底层', en: 'Ground floor'},
  {key: 'tenanted', group: 'investment', tone: 'positive', zh: '带租约', en: 'Tenanted'},
  {key: 'below_market', group: 'investment', tone: 'positive', zh: '低于市价', en: 'Below market'},
  {key: 'rental_demand', group: 'investment', tone: 'positive', zh: '租赁需求强', en: 'Strong rental demand'},
  {key: 'near_highway', group: 'risk', tone: 'neutral', zh: '近高速', en: 'Near highway'},
  {key: 'busy_area', group: 'risk', tone: 'negative', zh: '繁忙嘈杂', en: 'Busy / noisy'},
  {key: 'flood_risk', group: 'risk', tone: 'negative', zh: '水患风险', en: 'Flood risk'},
  {key: 'leasehold_short', group: 'risk', tone: 'negative', zh: '租约剩余短', en: 'Short lease'}
];

// 柔佛新山常见区域。同一 cluster 视为「邻近区域」，匹配时给部分分数而不是直接淘汰。
export const AREAS = [
  {key: 'austin_heights', zh: 'Austin Heights 奥斯汀高原', en: 'Austin Heights', lat: 1.5564, lng: 103.7718, cluster: 'austin'},
  {key: 'mount_austin', zh: 'Mount Austin 茂奥斯汀', en: 'Mount Austin', lat: 1.5486, lng: 103.7795, cluster: 'austin'},
  {key: 'setia_indah', zh: 'Setia Indah', en: 'Setia Indah', lat: 1.5688, lng: 103.7497, cluster: 'austin'},
  {key: 'taman_molek', zh: 'Taman Molek 百合花园', en: 'Taman Molek', lat: 1.5248, lng: 103.7804, cluster: 'molek'},
  {key: 'johor_jaya', zh: 'Johor Jaya 柔佛再也', en: 'Johor Jaya', lat: 1.5333, lng: 103.788, cluster: 'molek'},
  {key: 'tebrau', zh: 'Tebrau 地不佬', en: 'Tebrau', lat: 1.512, lng: 103.762, cluster: 'molek'},
  {key: 'skudai', zh: 'Skudai 士古来', en: 'Skudai', lat: 1.537, lng: 103.657, cluster: 'skudai'},
  {key: 'sutera_utama', zh: 'Taman Sutera Utama 五福城', en: 'Taman Sutera Utama', lat: 1.5147, lng: 103.641, cluster: 'skudai'},
  {key: 'taman_universiti', zh: 'Taman Universiti', en: 'Taman Universiti', lat: 1.538, lng: 103.626, cluster: 'skudai'},
  {key: 'bukit_indah', zh: 'Bukit Indah 武吉英达', en: 'Bukit Indah', lat: 1.4818, lng: 103.657, cluster: 'bukit_indah'},
  {key: 'nusa_bestari', zh: 'Nusa Bestari 顺利花园', en: 'Nusa Bestari', lat: 1.477, lng: 103.67, cluster: 'bukit_indah'},
  {key: 'gelang_patah', zh: 'Gelang Patah 振林山', en: 'Gelang Patah', lat: 1.441, lng: 103.598, cluster: 'gelang'},
  {key: 'nusajaya', zh: 'Nusajaya / Iskandar Puteri', en: 'Nusajaya', lat: 1.436, lng: 103.62, cluster: 'gelang'},
  {key: 'permas_jaya', zh: 'Permas Jaya 百万镇', en: 'Permas Jaya', lat: 1.497, lng: 103.815, cluster: 'permas'},
  {key: 'pasir_gudang', zh: 'Pasir Gudang 巴西古当', en: 'Pasir Gudang', lat: 1.47, lng: 103.89, cluster: 'permas'},
  {key: 'masai', zh: 'Masai 马西', en: 'Masai', lat: 1.49, lng: 103.88, cluster: 'permas'},
  {key: 'danga_bay', zh: 'Danga Bay 金海湾', en: 'Danga Bay', lat: 1.477, lng: 103.766, cluster: 'city'},
  {key: 'jb_city', zh: '新山市中心', en: 'Johor Bahru City', lat: 1.4634, lng: 103.7578, cluster: 'city'},
  {key: 'larkin', zh: 'Larkin 拉庆', en: 'Larkin', lat: 1.495, lng: 103.744, cluster: 'city'},
  {key: 'tampoi', zh: 'Tampoi 淡杯', en: 'Tampoi', lat: 1.497, lng: 103.706, cluster: 'city'},
  {key: 'setia_tropika', zh: 'Setia Tropika', en: 'Setia Tropika', lat: 1.518, lng: 103.731, cluster: 'tropika'},
  {key: 'kempas', zh: 'Kempas 甘拔士', en: 'Kempas', lat: 1.535, lng: 103.73, cluster: 'tropika'},
  {key: 'kulai', zh: 'Kulai 古来', en: 'Kulai', lat: 1.66, lng: 103.6, cluster: 'kulai'},
  {key: 'senai', zh: 'Senai 士乃', en: 'Senai', lat: 1.605, lng: 103.652, cluster: 'kulai'}
];

export const LISTING_STATUSES = [
  {key: 'available', zh: '在售 / 在租', en: 'Available', tone: 'green'},
  {key: 'reserved', zh: '已订', en: 'Reserved', tone: 'amber'},
  {key: 'sold', zh: '已售', en: 'Sold', tone: 'grey'},
  {key: 'rented', zh: '已租', en: 'Rented', tone: 'grey'},
  {key: 'off_market', zh: '暂不出售', en: 'Off market', tone: 'grey'}
];

export const REQUIREMENT_STATUSES = [
  {key: 'active', zh: '跟进中', en: 'Active', tone: 'green'},
  {key: 'paused', zh: '暂停', en: 'Paused', tone: 'amber'},
  {key: 'won', zh: '已成交', en: 'Won', tone: 'blue'},
  {key: 'lost', zh: '已流失', en: 'Lost', tone: 'grey'}
];

export const ACTION_STATUSES = [
  {key: 'shortlisted', zh: '已收藏', en: 'Shortlisted', icon: '★', tone: 'amber'},
  {key: 'sent', zh: '已推荐', en: 'Sent', icon: '✈', tone: 'blue'},
  {key: 'viewed', zh: '已看房', en: 'Viewed', icon: '👁', tone: 'blue'},
  {key: 'offer', zh: '已出价', en: 'Offer', icon: '✍', tone: 'amber'},
  {key: 'won', zh: '已成交', en: 'Won', icon: '✓', tone: 'green'},
  {key: 'lost', zh: '未成交', en: 'Lost', icon: '✕', tone: 'grey'},
  {key: 'rejected', zh: '不适合', en: 'Rejected', icon: '⊘', tone: 'red'}
];

export const TIMELINES = [
  {key: 'urgent', zh: '1 个月内', en: 'Within 1 month', days: 30, boost: 3},
  {key: '1_3m', zh: '1–3 个月', en: '1–3 months', days: 90, boost: 1.5},
  {key: '3_6m', zh: '3–6 个月', en: '3–6 months', days: 180, boost: 0.5},
  {key: '6m_plus', zh: '6 个月以上', en: '6 months+', days: 365, boost: 0},
  {key: 'browsing', zh: '随便看看', en: 'Browsing', days: 0, boost: 0}
];

export const SOURCES = [
  {key: 'whatsapp', zh: 'WhatsApp', en: 'WhatsApp'},
  {key: 'referral', zh: '转介绍', en: 'Referral'},
  {key: 'walk_in', zh: '上门 / 电话', en: 'Walk-in'},
  {key: 'portal', zh: '房产平台', en: 'Portal'},
  {key: 'social', zh: '社交媒体', en: 'Social media'},
  {key: 'own_listing', zh: '自家盘源', en: 'Own listing'},
  {key: 'other', zh: '其他', en: 'Other'}
];

export const PRIORITIES = [
  {key: 'balanced', zh: '均衡', en: 'Balanced', desc: '预算、地点、空间平均考虑'},
  {key: 'value', zh: '预算优先', en: 'Budget first', desc: '价格与性价比权重最高'},
  {key: 'location', zh: '地段优先', en: 'Location first', desc: '区域与通勤最重要'},
  {key: 'space', zh: '空间优先', en: 'Space first', desc: '房型、房间数与面积优先'}
];

// 六个评分维度；每个档案合计 100。
export const WEIGHTS = {
  balanced: {budget: 25, location: 20, space: 20, fit: 15, amenities: 15, readiness: 5},
  value: {budget: 35, location: 15, space: 15, fit: 15, amenities: 15, readiness: 5},
  location: {budget: 20, location: 35, space: 15, fit: 10, amenities: 15, readiness: 5},
  space: {budget: 15, location: 15, space: 35, fit: 15, amenities: 15, readiness: 5}
};

export const DIMENSIONS = [
  {key: 'budget', zh: '预算', en: 'Budget'},
  {key: 'location', zh: '地段', en: 'Location'},
  {key: 'space', zh: '空间', en: 'Space'},
  {key: 'fit', zh: '条件', en: 'Fit'},
  {key: 'amenities', zh: '配套', en: 'Amenities'},
  {key: 'readiness', zh: '时机', en: 'Readiness'}
];

export const MANDATES = [
  {key: 'exclusive', zh: '独家', en: 'Exclusive'},
  {key: 'open', zh: '开放', en: 'Open'},
  {key: 'cobroke', zh: '可合作 / Co-broke', en: 'Co-broke'}
];

export const STRICT_FIELD_OPTIONS = [
  {key: 'tenure', zh: '产权（必须符合）', en: 'Tenure (strict)'},
  {key: 'furnishing', zh: '装修（必须符合）', en: 'Furnishing (strict)'},
  {key: 'beds', zh: '房间数（必须符合）', en: 'Bedrooms (strict)'},
  {key: 'baths', zh: '浴室数（必须符合）', en: 'Bathrooms (strict)'},
  {key: 'built_up', zh: '面积（必须符合）', en: 'Built-up (strict)'},
  {key: 'tags', zh: '必备配套（必须全有）', en: 'Must-have tags (strict)'}
];

export const DEFAULT_STRETCH = 0.1; // 预算可上浮 10%（可议价空间）

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function norm(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[\s,._\-\/]+/g, '');
}

let _areaIndex = null;
function areaIndex() {
  if (_areaIndex) return _areaIndex;
  _areaIndex = AREAS.map((a) => ({
    area: a,
    keys: [norm(a.key), norm(a.zh), norm(a.en)].filter(Boolean)
  }));
  return _areaIndex;
}

/** 自由文本区域 → 字典条目（可识别「Austin Heights, Johor Bahru」这类写法） */
export function findArea(value) {
  const n = norm(value);
  if (!n) return null;
  for (const row of areaIndex()) {
    if (row.keys.some((k) => k === n)) return row.area;
  }
  // 包含匹配：取最长命中，避免 "Kulai" 抢先匹配 "Taman Kulai"
  let best = null;
  let bestLen = 0;
  for (const row of areaIndex()) {
    for (const k of row.keys) {
      if (k.length > 2 && n.includes(k) && k.length > bestLen) {
        best = row.area;
        bestLen = k.length;
      }
    }
  }
  return best;
}

export function clusterOf(value) {
  const area = findArea(value);
  return area ? area.cluster : 'other';
}

export function areaLabel(value, lang = 'zh') {
  const area = findArea(value);
  if (area) return area[lang] || area.zh;
  return String(value || '');
}

export function distanceKm(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function labelOf(list, key, lang = 'zh') {
  const item = (list || []).find((x) => x.key === key);
  if (!item) return key || '';
  return item[lang] || item.zh || key;
}

export function typeOf(key) {
  return PROPERTY_TYPES.find((t) => t.key === key) || null;
}

export function tagOf(key) {
  return TAGS.find((t) => t.key === key) || null;
}

/** 给前端一次性下发的字典 */
export function meta() {
  return {
    property_types: PROPERTY_TYPES,
    intents: INTENTS,
    listing_intents: LISTING_INTENTS,
    tenures: TENURES,
    tenure_prefs: TENURE_PREFS,
    furnishings: FURNISHINGS,
    furnishing_prefs: FURNISHING_PREFS,
    conditions: CONDITIONS,
    condition_prefs: CONDITION_PREFS,
    tags: TAGS,
    areas: AREAS,
    listing_statuses: LISTING_STATUSES,
    requirement_statuses: REQUIREMENT_STATUSES,
    action_statuses: ACTION_STATUSES,
    timelines: TIMELINES,
    sources: SOURCES,
    priorities: PRIORITIES,
    weights: WEIGHTS,
    dimensions: DIMENSIONS,
    mandates: MANDATES,
    strict_fields: STRICT_FIELD_OPTIONS
  };
}
