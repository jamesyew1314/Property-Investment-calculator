"use strict";
// 静态发布门禁：页面结构、关键入口、脚本语法、静态资源版本
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

let fail = 0;
function ok(cond, msg) { if (!cond) { console.error("✗ " + msg); fail++; } else console.log("✓ " + msg); }

const pages = ["index.html","pool/index.html","news/index.html","agents/index.html","join/index.html","about/index.html","privacy/index.html","terms/index.html","favorites/index.html","agent/index.html"];
for (const p of pages) {
  const f = path.join("web", p);
  ok(fs.existsSync(f), p + " exists");
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, "utf8");
  ok(/<body[^>]*class="[^"]*\bneo\b/.test(s), p + " has neo body");
  ok(s.includes("lang3.js?v="), p + " loads versioned lang3.js");
}

for (const p of ["index.html","agents/index.html","join/index.html","about/index.html"]) {
  const s = fs.readFileSync(path.join("web", p), "utf8");
  ok(s.includes('class="mobile-login"'), p + " has static mobile login");
}

const jsFiles = ["web/site.js","web/lang3.js","web/neo-home.js","web/ai-console.js","web/agent/app.js","work/public-page.js","work/agent-page.js","work/public-api.js","work/agent-api.js","work/api-server.js"];
for (const f of jsFiles) {
  try { cp.execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); ok(true, f + " syntax"); }
  catch (e) { ok(false, f + " syntax: " + String(e.stderr || e.message).split("\n")[0]); }
}

const cssFiles = ["web/site.css","web/neo.css","web/agent/app.css"];
for (const f of cssFiles) {
  const s = fs.readFileSync(f, "utf8");
  const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
  ok(open === close, f + " braces balanced (" + open + "/" + close + ")");
}

console.log(fail ? "\nSTATIC FAIL " + fail : "\nSTATIC PASS");
process.exit(fail ? 1 : 0);
