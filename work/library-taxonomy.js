"use strict";
// library-taxonomy.js — 资料库字典（单一真相）
// 前端通过 GET /api/library/meta 取回，避免中英两套字典漂移。
// 区域键与 PropMatch（match-platform/lib/taxonomy.js）保持一致，方便以后互通。

const AREAS = [
  { key: "austin_heights", zh: "Austin Heights 奥斯汀高原", en: "Austin Heights", cluster: "austin" },
  { key: "mount_austin", zh: "Mount Austin 茂奥斯汀", en: "Mount Austin", cluster: "austin" },
  { key: "setia_indah", zh: "Setia Indah", en: "Setia Indah", cluster: "austin" },
  { key: "taman_molek", zh: "Taman Molek 百合花园", en: "Taman Molek", cluster: "molek" },
  { key: "johor_jaya", zh: "Johor Jaya 柔佛再也", en: "Johor Jaya", cluster: "molek" },
  { key: "tebrau", zh: "Tebrau 地不佬", en: "Tebrau", cluster: "molek" },
  { key: "skudai", zh: "Skudai 士古来", en: "Skudai", cluster: "skudai" },
  { key: "sutera_utama", zh: "Taman Sutera Utama 五福城", en: "Taman Sutera Utama", cluster: "skudai" },
  { key: "taman_universiti", zh: "Taman Universiti", en: "Taman Universiti", cluster: "skudai" },
  { key: "bukit_indah", zh: "Bukit Indah 武吉英达", en: "Bukit Indah", cluster: "bukit_indah" },
  { key: "nusa_bestari", zh: "Nusa Bestari 顺利花园", en: "Nusa Bestari", cluster: "bukit_indah" },
  { key: "gelang_patah", zh: "Gelang Patah 振林山", en: "Gelang Patah", cluster: "gelang" },
  { key: "nusajaya", zh: "Nusajaya / Iskandar Puteri", en: "Nusajaya", cluster: "gelang" },
  { key: "permas_jaya", zh: "Permas Jaya 百万镇", en: "Permas Jaya", cluster: "permas" },
  { key: "pasir_gudang", zh: "Pasir Gudang 巴西古当", en: "Pasir Gudang", cluster: "permas" },
  { key: "masai", zh: "Masai 马西", en: "Masai", cluster: "permas" },
  { key: "danga_bay", zh: "Danga Bay 金海湾", en: "Danga Bay", cluster: "city" },
  { key: "jb_city", zh: "新山市中心", en: "Johor Bahru City", cluster: "city" },
  { key: "larkin", zh: "Larkin 拉庆", en: "Larkin", cluster: "city" },
  { key: "tampoi", zh: "Tampoi 淡杯", en: "Tampoi", cluster: "city" },
  { key: "setia_tropika", zh: "Setia Tropika", en: "Setia Tropika", cluster: "tropika" },
  { key: "kempas", zh: "Kempas 甘拔士", en: "Kempas", cluster: "tropika" },
  { key: "kulai", zh: "Kulai 古来", en: "Kulai", cluster: "kulai" },
  { key: "senai", zh: "Senai 士乃", en: "Senai", cluster: "kulai" },
  { key: "other", zh: "其他区域", en: "Other area", cluster: "other" }
];

const PROPERTY_TYPES = [
  { key: "terrace", zh: "排屋", en: "Terrace" },
  { key: "semi_d", zh: "半独立式", en: "Semi-D" },
  { key: "bungalow", zh: "独立式洋房", en: "Bungalow" },
  { key: "townhouse", zh: "Townhouse", en: "Townhouse" },
  { key: "condo", zh: "公寓 / 共管公寓", en: "Condominium" },
  { key: "apartment", zh: "Apartment", en: "Apartment" },
  { key: "shoplot", zh: "店屋 / 商铺", en: "Shoplot" },
  { key: "office", zh: "办公室", en: "Office" },
  { key: "land", zh: "土地", en: "Land" }
];

const TENURES = [
  { key: "freehold", zh: "永久产权", en: "Freehold" },
  { key: "leasehold", zh: "租赁产权", en: "Leasehold" }
];

const FURNISHINGS = [
  { key: "unfurnished", zh: "空屋", en: "Unfurnished" },
  { key: "partial", zh: "部分装修", en: "Partially furnished" },
  { key: "full", zh: "全装修", en: "Fully furnished" }
];

const CONDITIONS = [
  { key: "new", zh: "全新", en: "New" },
  { key: "renovated", zh: "已翻新", en: "Renovated" },
  { key: "good", zh: "状况良好", en: "Good" },
  { key: "fair", zh: "一般", en: "Fair" },
  { key: "needs_work", zh: "需整修", en: "Needs work" }
];

const LISTING_INTENTS = [
  { key: "sale", zh: "出售", en: "For Sale" },
  { key: "rent", zh: "出租", en: "For Rent" }
];

const LISTING_STATUSES = [
  { key: "available", zh: "在售 / 在租", en: "Available", tone: "green" },
  { key: "reserved", zh: "已订", en: "Reserved", tone: "amber" },
  { key: "sold", zh: "已售", en: "Sold", tone: "grey" },
  { key: "rented", zh: "已租", en: "Rented", tone: "grey" },
  { key: "off_market", zh: "暂不 / 下架", en: "Off market", tone: "grey" }
];

const CLIENT_INTENTS = [
  { key: "buy", zh: "买房", en: "Buying" },
  { key: "rent", zh: "租房", en: "Renting" }
];

const CLIENT_STATUSES = [
  { key: "new", zh: "新客户", en: "New", tone: "blue" },
  { key: "active", zh: "跟进中", en: "Active", tone: "green" },
  { key: "viewing", zh: "看房中", en: "Viewing", tone: "amber" },
  { key: "offer", zh: "谈价 / 出价", en: "Offer", tone: "amber" },
  { key: "won", zh: "已成交", en: "Won", tone: "green" },
  { key: "lost", zh: "已流失", en: "Lost", tone: "grey" }
];

const VIEWING_STATUSES = [
  { key: "scheduled", zh: "已约", en: "Scheduled", tone: "blue" },
  { key: "done", zh: "已看", en: "Done", tone: "green" },
  { key: "no_show", zh: "未到", en: "No show", tone: "red" },
  { key: "cancelled", zh: "已取消", en: "Cancelled", tone: "grey" }
];

const DEAL_STATUSES = [
  { key: "pending", zh: "待完成", en: "Pending", tone: "amber" },
  { key: "completed", zh: "已完成", en: "Completed", tone: "green" },
  { key: "cancelled", zh: "已取消", en: "Cancelled", tone: "grey" }
];

const DEAL_KINDS = [
  { key: "sale", zh: "买卖", en: "Sale" },
  { key: "rent", zh: "租赁", en: "Rent" }
];

const SOURCES = [
  { key: "referral", zh: "转介绍", en: "Referral" },
  { key: "walk_in", zh: "上门 / 陌生客", en: "Walk-in" },
  { key: "portal", zh: "PropertyGuru / iProperty", en: "Portal" },
  { key: "social", zh: "Facebook / 小红书 / TikTok", en: "Social" },
  { key: "signage", zh: "广告牌 / 传单", en: "Signage" },
  { key: "existing", zh: "老客户", en: "Existing client" },
  { key: "other", zh: "其他", en: "Other" }
];

const TIMELINES = [
  { key: "now", zh: "一个月内", en: "Within 1 month" },
  { key: "3m", zh: "三个月内", en: "Within 3 months" },
  { key: "6m", zh: "半年内", en: "Within 6 months" },
  { key: "1y", zh: "一年内", en: "Within 1 year" },
  { key: "exploring", zh: "先看看", en: "Just exploring" }
];

const TITLE_TYPES = [
  { key: "individual", zh: "个别地契", en: "Individual title" },
  { key: "strata", zh: "分层地契", en: "Strata title" },
  { key: "master", zh: "总地契", en: "Master title" }
];

const TAGS = [
  { key: "near_school", zh: "近学校", en: "Near school" },
  { key: "near_mall", zh: "近商场", en: "Near mall" },
  { key: "near_transit", zh: "近 RTS / 公交", en: "Near transport" },
  { key: "gated", zh: "围篱社区", en: "Gated" },
  { key: "security", zh: "24 小时保安", en: "24h security" },
  { key: "corner", zh: "转角单位", en: "Corner lot" },
  { key: "renovated", zh: "已装修", en: "Renovated" },
  { key: "high_floor", zh: "高层", en: "High floor" },
  { key: "tenanted", zh: "带租约", en: "Tenanted" },
  { key: "below_market", zh: "低于市价", en: "Below market" },
  { key: "sea_view", zh: "海景", en: "Sea view" },
  { key: "pet_friendly", zh: "可养宠物", en: "Pet friendly" }
];

const LISTS = {
  areas: AREAS,
  property_types: PROPERTY_TYPES,
  tenures: TENURES,
  furnishings: FURNISHINGS,
  conditions: CONDITIONS,
  listing_intents: LISTING_INTENTS,
  listing_statuses: LISTING_STATUSES,
  client_intents: CLIENT_INTENTS,
  client_statuses: CLIENT_STATUSES,
  viewing_statuses: VIEWING_STATUSES,
  deal_statuses: DEAL_STATUSES,
  deal_kinds: DEAL_KINDS,
  sources: SOURCES,
  timelines: TIMELINES,
  title_types: TITLE_TYPES,
  tags: TAGS
};

function keysOf(name) {
  return (LISTS[name] || []).map(function (x) { return x.key; });
}

function labelOf(name, key, lang) {
  const row = (LISTS[name] || []).find(function (x) { return x.key === key; });
  if (!row) return key || "";
  return lang === "en" ? row.en : row.zh;
}

function isValid(name, key) {
  return keysOf(name).indexOf(String(key || "")) >= 0;
}

function meta() {
  return { ok: true, taxonomy: LISTS };
}

module.exports = {
  AREAS, PROPERTY_TYPES, TENURES, FURNISHINGS, CONDITIONS,
  LISTING_INTENTS, LISTING_STATUSES, CLIENT_INTENTS, CLIENT_STATUSES,
  VIEWING_STATUSES, DEAL_STATUSES, DEAL_KINDS, SOURCES, TIMELINES, TITLE_TYPES, TAGS,
  LISTS, keysOf, labelOf, isValid, meta
};
