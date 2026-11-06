"use strict";
const assert = require("node:assert");
const { parseListing } = require("./import-core");
let pass = 0, fail = 0;
function eq(a, b, n) { try { assert.deepStrictEqual(a, b); pass++; } catch (e) { fail++; console.log("✗ " + n + " got " + JSON.stringify(a)); } }

const wa = `【出售】Sutera Utama 五福城
3房2卫 1150sqft
售价 RM 728,000
单位 A-12-03
Agent 012-345 6789`;
const r1 = parseListing(wa);
eq(r1.intent, "sale", "出售");
eq(r1.asking_price, 728000, "价格");
eq(r1.bedrooms, 3, "房");
eq(r1.bathrooms, 2, "卫");
eq(r1.built_up, 1150, "面积");
eq(r1.area_code, "sutera_utama", "区域");
eq(r1.unit_no, "A-12-03", "单位");
eq(r1._phone, "012-345 6789", "电话识别");

const r2 = parseListing("For rent condo Danga Bay RM 2800 per month 2 bed 1 bath 980 sqft");
eq(r2.intent, "rent", "rent");
eq(r2.rent_price, 2800, "租金");
eq(r2.area_code, "danga_bay", "区域 en");
eq(r2.property_type, "condo", "房型");


// 群组转发完整格式（Andy 样板）
const waFull = `*WTR / For Rent 出租*
*Ready move in*

*12 Jalan tropika 12, taman bukit tropika, 81800, Ulu tiram*

*Jalan Tropika @ Taman Desa cemerlang*
Shop Lot
22x70
Intermediate lot
Facing South
Non Bumi
Freehold
Individual title
Unfurnished
Vacant
Original condition

*Rental RM2,200/month*
Negotiable

*TRREAG*
*Andy Lau*
0165280918
www.wasap.my/60165280918/tdcr2200`;
const r3 = parseListing(waFull);
eq(r3.intent, "rent", "群格式 租");
eq(r3.headline, "Ready move in", "群格式 标题");
eq(r3.address, "12 Jalan tropika 12, taman bukit tropika, 81800, Ulu tiram", "群格式 完整地址");
eq(r3.project_name, "Jalan Tropika @ Taman Desa cemerlang", "群格式 项目");
eq(r3.area_code, "ulu_tiram", "群格式 区域取邮编地址");
eq(r3.category, "commercial", "群格式 类别");
eq(r3.property_type, "shoplot", "群格式 店屋");
eq(r3.land_size, "22x70", "群格式 土地");
eq(r3.lot_position, "intermediate", "群格式 Lot");
eq(r3.facing, "South", "群格式 方向");
eq(r3.bumi, "non_bumi", "群格式 Bumi");
eq(r3.tenure, "freehold", "群格式 产权");
eq(r3.title_type, "individual", "群格式 地契");
eq(r3.furnishing, "unfurnished", "群格式 家私");
eq(r3.condition, "vacant", "群格式 现况");
eq(r3.rent_price, 2200, "群格式 租金");
eq(r3.negotiable, true, "群格式 可议价");
eq(r3._phone, "0165280918", "群格式 电话");


// 中文手写格式（Bukit Indah）
const waZh = `出售 Bukit Indah
17， Jalan Indah 25/13
81200 Johor
Lang size 20x 70
3房2厕
有保安隔离
向东
卖价 Rm750,000
估价 Rm800,000`;
const r4 = parseListing(waZh);
eq(r4.intent, "sale", "中文 出售");
eq(r4.address, "17, Jalan Indah 25/13, 81200 Johor", "中文 多行地址");
eq(r4.address_text, "Jalan Indah 25/13", "中文 花园名");
eq(r4.area_code, "bukit_indah", "中文 区域");
eq(r4.land_size, "20x70", "中文 土地");
eq(r4.bedrooms, 3, "中文 房");
eq(r4.toilets, 2, "中文 厕");
eq(r4.security, "guarded", "中文 保安");
eq(r4.facing, "East", "中文 朝向");
eq(r4.asking_price, 750000, "中文 卖价");
eq(r4.bank_value, 800000, "中文 估价");
eq(r4.category, "residential", "中文 类别推断");

eq(parseListing("随便一段没有房源的文字").asking_price, undefined, "无价格不误判");
console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
