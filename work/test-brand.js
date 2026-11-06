"use strict";
const assert = require("node:assert");
const ai = require("./ai-copy");
const page = require("./agent-page");
let pass = 0, fail = 0;
function ok(v, n) { try { assert.ok(v, n); pass++; } catch (e) { fail++; console.log("✗ " + n); } }

const tpl = ai.template({ project_name: "五福城", area_code: "sutera_utama", bedrooms: 3, bathrooms: 2, built_up: 1150, intent: "sale", price: 720000 }, "zh");
ok(tpl.includes("五福城") && tpl.includes("720,000") && tpl.includes("3 房"), "template zh");
ok(!/owner|业主|pemilik/i.test(tpl), "template no owner");

const agent = { name: "Andy Lau", slug: "andy-lau", ren_no: "REN 32839", phone: "012-345 6789", areas: ["sutera_utama"], verified_at: new Date(), years_exp: 12, deals_count: 210, deals_value: 320000000 };
const rows = [{ code: "KT-0001", project_title: "Taman Sutera", area_code: "sutera_utama", intent: "sale", asking_price: 720000, bedrooms: 3, bathrooms: 2, built_up: 1150 }];
const reviews = [{ author: "Mr Tan", rating: 5, body: "服务很好，流程清楚。" }];
["zh", "en", "bm"].forEach(function (lang) {
  const h = page(agent, rows, { lang: lang, reviews: reviews });
  ok(h.includes("mandateForm"), "mandate form " + lang);
  ok(h.includes("Mr Tan"), "reviews " + lang);
  ok(h.includes("12+"), "years stat " + lang);
});
console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
