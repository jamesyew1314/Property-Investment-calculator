"use strict";
// agent 纯函数回归：发布前跑 node work/test-agent.js
const assert = require("node:assert");
const T = require("./agent-core");

let pass = 0, fail = 0;
function eq(a, b, name) {
  try { assert.deepStrictEqual(a, b); pass++; }
  catch (e) { fail++; console.log("✗ " + name + "  → got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
}

eq(T.slugify("Andy Lau"), "andy-lau", "英文名转 slug");
eq(T.slugify("  Teh Ooi  "), "teh-ooi", "去空格转 slug");
eq(T.slugify("黄敏明"), "", "中文名 slug 为空（注册时兜底 agent-xxx）");
eq(T.slugify("A/B & C"), "a-b-c", "符号归一");

const h = T.hashPw("test12345");
eq(T.verifyPw("test12345", h), true, "正确密码校验通过");
eq(T.verifyPw("wrong", h), false, "错误密码被拒");
eq(T.verifyPw("test12345", "garbage"), false, "损坏哈希被拒");
eq(h.split(":").length, 2, "哈希格式 salt:hash");
eq(T.sha256("abc").length, 64, "sha256 64 位");

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
