"use strict";
// 三语门禁：data-i18n key 必须存在；核心页面字典不得缺 key
const fs = require("node:fs");

let fail = 0;
function read(p) { return fs.readFileSync(p, "utf8"); }

const html = read("web/index.html");
const dict = {};
const re = /"([a-zA-Z0-9_.-]+)"\s*:\s*\[([^\]]*)\]/g;
let m;
while ((m = re.exec(html))) dict[m[1]] = m[2];

const used = new Set();
const re2 = /data-i18n="([^"]+)"/g;
while ((m = re2.exec(html))) used.add(m[1]);
for (const k of used) {
  if (!dict[k]) { console.error("✗ missing i18n key: " + k); fail++; }
}
console.log("home keys used " + used.size + ", defined " + Object.keys(dict).length + ", missing " + fail);

const agents = read("web/agents/index.html");
for (const k of ["ag.title","ag.sub","ag.listings","ag.page","ag.view"]) {
  const r = new RegExp('"' + k + '"\\s*:\\s*\\[([^\\]]*)\\]');
  const mm = agents.match(r);
  if (!mm || mm[1].split(",").length < 3) { console.error("✗ agents key needs zh/en/bm: " + k); fail++; }
}
console.log(fail ? "\nI18N FAIL " + fail : "\nI18N PASS");
process.exit(fail ? 1 : 0);
