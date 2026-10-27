"use strict";
const assert = require("node:assert");
const b = require("./billplz");
let pass = 0, fail = 0;
function eq(a, x, n) { try { assert.deepStrictEqual(a, x); pass++; } catch (e) { fail++; console.log("✗ " + n); } }
eq(b.amountFor("pro", 1), 89, "Pro 1 个月 89");
eq(b.amountFor("pro", 12), 1068, "Pro 12 个月 1068");
eq(b.amountFor("team", 1), 299, "Team 1 个月 299");
eq(b.amountFor("team", 3), 897, "Team 3 个月 897");
eq(b.amountFor("unknown", 2), 178, "未知套餐按 Pro");
const s1 = b.signature({ b: "2", a: "1", x_signature: "zzz" }, "key");
const s2 = b.signature({ a: "1", b: "2" }, "key");
eq(s1, s2, "签名与参数顺序无关且排除 x_signature");
eq(s1.length, 64, "签名 64 位 hex");
eq(s1 !== b.signature({ a: "1", b: "2" }, "key2"), true, "不同密钥不同签名");
console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
