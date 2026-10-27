"use strict";
// agent-core.js — 中介账号的纯函数（无 express / 无数据库依赖，可直接单测）
const crypto = require("node:crypto");

function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(String(pw), salt, 64).toString("hex");
}
function verifyPw(pw, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const calc = crypto.scryptSync(String(pw), parts[0], 64);
  const known = Buffer.from(parts[1], "hex");
  return calc.length === known.length && crypto.timingSafeEqual(calc, known);
}
function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
}

module.exports = { sha256, hashPw, verifyPw, slugify };
