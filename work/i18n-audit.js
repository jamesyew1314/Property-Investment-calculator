"use strict";
// 三语覆盖审计：页面 PAGE_I18N 与 t(zh,en) 是否都有 BM
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function loadMap(file) {
  if (!fs.existsSync(file)) return {};
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.window.BM_MAP || {};
}
function pairsFromPage(file) {
  const s = fs.readFileSync(file, "utf8");
  const out = [];
  const re = /"([\w.]+)"\s*:\s*\[\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(s))) out.push({ key: m[1], en: m[3].replace(/\\"/g, '"') });
  return out;
}
function pairsFromJs(file) {
  const s = fs.readFileSync(file, "utf8");
  const out = [];
  const re = /t\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
  let m;
  while ((m = re.exec(s))) out.push({ key: "", en: m[2].replace(/\\"/g, '"') });
  return out;
}
const map = loadMap("web/bm-public.js");
const appMap = loadMap("web/agent/bm.js");
const pages = ["index.html","join/index.html","pricing/index.html","about/index.html","company/index.html"].map(f => "web/" + f);
let grand = { total: 0, miss: 0 };
pages.forEach(function (f) {
  if (!fs.existsSync(f)) return;
  const ps = pairsFromPage(f);
  const miss = ps.filter(function (p) { return !map[p.en]; });
  grand.total += ps.length; grand.miss += miss.length;
  console.log(path.basename(path.dirname(f)) + "/" + path.basename(f) + ": " + ps.length + " 条, 缺 " + miss.length);
  miss.slice(0, 5).forEach(function (p) { console.log("   - " + p.en.slice(0, 70)); });
});
const appPairs = pairsFromJs("web/agent/app.js");
const appMiss = appPairs.filter(function (p) { return !appMap[p.en]; });
console.log("agent/app.js: " + appPairs.length + " 条 t(), 缺 " + appMiss.length + "（去重后 " + new Set(appMiss.map(p=>p.en)).size + "）");
grand.total += appPairs.length; grand.miss += appMiss.length;
console.log("TOTAL: " + grand.total + " 条, 缺 " + grand.miss + " (" + Math.round(grand.miss / grand.total * 100) + "%)");
