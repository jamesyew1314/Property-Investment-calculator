"use strict";
// library-taxonomy.js — 资料库字典（单一真相）
// 前端通过 GET /api/library/meta 取回，避免中英两套字典漂移。
// 区域键与 PropMatch（match-platform/lib/taxonomy.js）保持一致，方便以后互通。

// 全马 16 个州 / 联邦直辖区（按市场规模排序）
const STATES = [
  { key: "kl", zh: "吉隆坡", en: "Kuala Lumpur" },
  { key: "selangor", zh: "雪兰莪", en: "Selangor" },
  { key: "johor", zh: "柔佛", en: "Johor" },
  { key: "penang", zh: "槟城", en: "Penang" },
  { key: "melaka", zh: "马六甲", en: "Melaka" },
  { key: "nsembilan", zh: "森美兰", en: "Negeri Sembilan" },
  { key: "perak", zh: "霹雳", en: "Perak" },
  { key: "kedah", zh: "吉打", en: "Kedah" },
  { key: "kelantan", zh: "吉兰丹", en: "Kelantan" },
  { key: "terengganu", zh: "登嘉楼", en: "Terengganu" },
  { key: "pahang", zh: "彭亨", en: "Pahang" },
  { key: "perlis", zh: "玻璃市", en: "Perlis" },
  { key: "sabah", zh: "沙巴", en: "Sabah" },
  { key: "sarawak", zh: "砂拉越", en: "Sarawak" },
  { key: "putrajaya", zh: "布城", en: "Putrajaya" },
  { key: "labuan", zh: "纳闽", en: "Labuan" }
];

// 全马主要城市与区域（109 个；柔佛原有 key 全部保留，历史数据不受影响）
const AREAS = [
  { key: "austin_heights", zh: "Austin Heights 奥斯汀高原", en: "Austin Heights", state: "johor" },
  { key: "mount_austin", zh: "Mount Austin 茂奥斯汀", en: "Mount Austin", state: "johor" },
  { key: "setia_indah", zh: "Setia Indah", en: "Setia Indah", state: "johor" },
  { key: "taman_molek", zh: "Taman Molek 百合花园", en: "Taman Molek", state: "johor" },
  { key: "johor_jaya", zh: "Johor Jaya 柔佛再也", en: "Johor Jaya", state: "johor" },
  { key: "tebrau", zh: "Tebrau 地不佬", en: "Tebrau", state: "johor" },
  { key: "skudai", zh: "Skudai 士古来", en: "Skudai", state: "johor" },
  { key: "sutera_utama", zh: "Taman Sutera Utama 五福城", en: "Taman Sutera Utama", state: "johor" },
  { key: "taman_universiti", zh: "Taman Universiti", en: "Taman Universiti", state: "johor" },
  { key: "bukit_indah", zh: "Bukit Indah 武吉英达", en: "Bukit Indah", state: "johor" },
  { key: "nusa_bestari", zh: "Nusa Bestari 顺利花园", en: "Nusa Bestari", state: "johor" },
  { key: "gelang_patah", zh: "Gelang Patah 振林山", en: "Gelang Patah", state: "johor" },
  { key: "nusajaya", zh: "Nusajaya / Iskandar Puteri", en: "Nusajaya", state: "johor" },
  { key: "permas_jaya", zh: "Permas Jaya 百万镇", en: "Permas Jaya", state: "johor" },
  { key: "pasir_gudang", zh: "Pasir Gudang 巴西古当", en: "Pasir Gudang", state: "johor" },
  { key: "masai", zh: "Masai 马西", en: "Masai", state: "johor" },
  { key: "danga_bay", zh: "Danga Bay 金海湾", en: "Danga Bay", state: "johor" },
  { key: "jb_city", zh: "新山市中心", en: "Johor Bahru City", state: "johor" },
  { key: "larkin", zh: "Larkin 拉庆", en: "Larkin", state: "johor" },
  { key: "tampoi", zh: "Tampoi 淡杯", en: "Tampoi", state: "johor" },
  { key: "setia_tropika", zh: "Setia Tropika", en: "Setia Tropika", state: "johor" },
  { key: "kempas", zh: "Kempas 甘拔士", en: "Kempas", state: "johor" },
  { key: "kulai", zh: "Kulai 古来", en: "Kulai", state: "johor" },
  { key: "senai", zh: "Senai 士乃", en: "Senai", state: "johor" },
  { key: "muar", zh: "麻坡", en: "Muar", state: "johor" },
  { key: "batu_pahat", zh: "峇株巴辖", en: "Batu Pahat", state: "johor" },
  { key: "kluang", zh: "居銮", en: "Kluang", state: "johor" },
  { key: "segamat", zh: "昔加末", en: "Segamat", state: "johor" },
  { key: "pontian", zh: "笨珍", en: "Pontian", state: "johor" },
  { key: "klcc", zh: "吉隆坡市中心 KLCC", en: "KLCC", state: "kl" },
  { key: "bukit_bintang", zh: "武吉免登", en: "Bukit Bintang", state: "kl" },
  { key: "mont_kiara", zh: "满家乐", en: "Mont Kiara", state: "kl" },
  { key: "bangsar", zh: "孟沙", en: "Bangsar", state: "kl" },
  { key: "cheras_kl", zh: "蕉赖（吉隆坡）", en: "Cheras (KL)", state: "kl" },
  { key: "setapak", zh: "文良港", en: "Setapak", state: "kl" },
  { key: "kepong", zh: "甲洞", en: "Kepong", state: "kl" },
  { key: "sri_hartamas", zh: "金地花园", en: "Sri Hartamas", state: "kl" },
  { key: "desa_parkcity", zh: "蒂沙花园", en: "Desa ParkCity", state: "kl" },
  { key: "damansara_heights", zh: "白沙罗高原", en: "Damansara Heights", state: "kl" },
  { key: "sentul", zh: "冼都", en: "Sentul", state: "kl" },
  { key: "pandan_indah", zh: "班登英达", en: "Pandan Indah", state: "kl" },
  { key: "petaling_jaya", zh: "八打灵再也", en: "Petaling Jaya", state: "selangor" },
  { key: "subang_jaya", zh: "梳邦再也", en: "Subang Jaya", state: "selangor" },
  { key: "shah_alam", zh: "莎阿南", en: "Shah Alam", state: "selangor" },
  { key: "klang", zh: "巴生", en: "Klang", state: "selangor" },
  { key: "puchong", zh: "蒲种", en: "Puchong", state: "selangor" },
  { key: "sunway", zh: "双威", en: "Sunway", state: "selangor" },
  { key: "bandar_utama", zh: "万达镇", en: "Bandar Utama", state: "selangor" },
  { key: "kota_damansara", zh: "哥打白沙罗", en: "Kota Damansara", state: "selangor" },
  { key: "kajang", zh: "加影", en: "Kajang", state: "selangor" },
  { key: "bangi", zh: "万宜", en: "Bangi", state: "selangor" },
  { key: "cyberjaya", zh: "赛城", en: "Cyberjaya", state: "selangor" },
  { key: "sepang", zh: "雪邦", en: "Sepang", state: "selangor" },
  { key: "rawang", zh: "万挠", en: "Rawang", state: "selangor" },
  { key: "gombak", zh: "鹅唛", en: "Gombak", state: "selangor" },
  { key: "seri_kembangan", zh: "沙登", en: "Seri Kembangan", state: "selangor" },
  { key: "port_klang", zh: "巴生港", en: "Port Klang", state: "selangor" },
  { key: "george_town", zh: "乔治市", en: "George Town", state: "penang" },
  { key: "gurney", zh: "合您", en: "Gurney", state: "penang" },
  { key: "tanjung_tokong", zh: "丹绒道光", en: "Tanjung Tokong", state: "penang" },
  { key: "tanjung_bungah", zh: "丹绒武雅", en: "Tanjung Bungah", state: "penang" },
  { key: "batu_ferringhi", zh: "峇都丁宜", en: "Batu Ferringhi", state: "penang" },
  { key: "bayan_lepas", zh: "峇六拜", en: "Bayan Lepas", state: "penang" },
  { key: "bayan_baru", zh: "峇央峇鲁", en: "Bayan Baru", state: "penang" },
  { key: "butterworth", zh: "北海", en: "Butterworth", state: "penang" },
  { key: "bukit_mertajam", zh: "大山脚", en: "Bukit Mertajam", state: "penang" },
  { key: "seberang_jaya", zh: "威省", en: "Seberang Jaya", state: "penang" },
  { key: "air_itam", zh: "亚依淡", en: "Air Itam", state: "penang" },
  { key: "jelutong", zh: "日落洞", en: "Jelutong", state: "penang" },
  { key: "melaka_city", zh: "马六甲市区", en: "Melaka City", state: "melaka" },
  { key: "ayer_keroh", zh: "爱极乐", en: "Ayer Keroh", state: "melaka" },
  { key: "klebang", zh: "吉里望", en: "Klebang", state: "melaka" },
  { key: "batu_berendam", zh: "峇株安南", en: "Batu Berendam", state: "melaka" },
  { key: "alor_gajah", zh: "亚罗牙也", en: "Alor Gajah", state: "melaka" },
  { key: "seremban", zh: "芙蓉", en: "Seremban", state: "nsembilan" },
  { key: "nilai", zh: "汝来", en: "Nilai", state: "nsembilan" },
  { key: "port_dickson", zh: "波德申", en: "Port Dickson", state: "nsembilan" },
  { key: "kuala_pilah", zh: "瓜拉庇劳", en: "Kuala Pilah", state: "nsembilan" },
  { key: "bahau", zh: "马口", en: "Bahau", state: "nsembilan" },
  { key: "ipoh", zh: "怡保", en: "Ipoh", state: "perak" },
  { key: "taiping", zh: "太平", en: "Taiping", state: "perak" },
  { key: "sitiawan", zh: "实兆远", en: "Sitiawan", state: "perak" },
  { key: "teluk_intan", zh: "安顺", en: "Teluk Intan", state: "perak" },
  { key: "kampar", zh: "金宝", en: "Kampar", state: "perak" },
  { key: "alor_setar", zh: "亚罗士打", en: "Alor Setar", state: "kedah" },
  { key: "sungai_petani", zh: "双溪大年", en: "Sungai Petani", state: "kedah" },
  { key: "kulim", zh: "居林", en: "Kulim", state: "kedah" },
  { key: "langkawi", zh: "浮罗交怡", en: "Langkawi", state: "kedah" },
  { key: "kota_bharu", zh: "哥打巴鲁", en: "Kota Bharu", state: "kelantan" },
  { key: "kubang_kerian", zh: "古邦阁亮", en: "Kubang Kerian", state: "kelantan" },
  { key: "kuala_terengganu", zh: "瓜拉登嘉楼", en: "Kuala Terengganu", state: "terengganu" },
  { key: "kemaman", zh: "甘马挽", en: "Kemaman", state: "terengganu" },
  { key: "dungun", zh: "龙运", en: "Dungun", state: "terengganu" },
  { key: "kuantan", zh: "关丹", en: "Kuantan", state: "pahang" },
  { key: "temerloh", zh: "淡马鲁", en: "Temerloh", state: "pahang" },
  { key: "bentong", zh: "文冬", en: "Bentong", state: "pahang" },
  { key: "cameron_highlands", zh: "金马仑高原", en: "Cameron Highlands", state: "pahang" },
  { key: "kangar", zh: "加央", en: "Kangar", state: "perlis" },
  { key: "arau", zh: "亚娄", en: "Arau", state: "perlis" },
  { key: "kota_kinabalu", zh: "亚庇", en: "Kota Kinabalu", state: "sabah" },
  { key: "sandakan", zh: "山打根", en: "Sandakan", state: "sabah" },
  { key: "tawau", zh: "斗湖", en: "Tawau", state: "sabah" },
  { key: "lahad_datu", zh: "拿笃", en: "Lahad Datu", state: "sabah" },
  { key: "kuching", zh: "古晋", en: "Kuching", state: "sarawak" },
  { key: "miri", zh: "美里", en: "Miri", state: "sarawak" },
  { key: "sibu", zh: "诗巫", en: "Sibu", state: "sarawak" },
  { key: "bintulu", zh: "民都鲁", en: "Bintulu", state: "sarawak" },
  { key: "putrajaya", zh: "布城", en: "Putrajaya", state: "putrajaya" },
  { key: "labuan", zh: "纳闽", en: "Labuan", state: "labuan" },
  { key: "other", zh: "其他区域", en: "Other area", state: "" }
];

function stateOfArea(areaKey) {
  const a = AREAS.find(function (x) { return x.key === areaKey; });
  return a && a.state ? a.state : null;
}

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
  states: STATES,
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
  STATES, AREAS, PROPERTY_TYPES, TENURES, FURNISHINGS, CONDITIONS,
  LISTING_INTENTS, LISTING_STATUSES, CLIENT_INTENTS, CLIENT_STATUSES,
  VIEWING_STATUSES, DEAL_STATUSES, DEAL_KINDS, SOURCES, TIMELINES, TITLE_TYPES, TAGS,
  LISTS, keysOf, labelOf, isValid, meta, stateOfArea
};
