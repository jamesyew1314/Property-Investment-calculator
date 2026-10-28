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

eq(parseListing("随便一段没有房源的文字").asking_price, undefined, "无价格不误判");
console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
