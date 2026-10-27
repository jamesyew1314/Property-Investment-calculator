"use strict";
// billplz.js — Billplz 支付适配（马来西亚）
const crypto = require("node:crypto");

function signature(params, key) {
  const keys = Object.keys(params).filter(function (k) { return k !== "x_signature"; }).sort();
  const base = keys.map(function (k) { return k + params[k]; }).join("");
  return crypto.createHmac("sha256", key).update(base).digest("hex");
}

function amountFor(plan, months) {
  const price = plan === "team" ? 299 : 89;
  return Math.round(price * months * 100) / 100;
}

async function createBill({ secretKey, collectionId, sandbox, bill }) {
  const host = sandbox ? "https://www.billplz-sandbox.com" : "https://www.billplz.com";
  const body = new URLSearchParams();
  Object.keys(bill).forEach(function (k) { if (bill[k] != null) body.append(k, String(bill[k])); });
  const r = await fetch(host + "/api/v3/bills", {
    method: "POST",
    headers: { "Authorization": "Basic " + Buffer.from(secretKey + ":").toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || !j.url) throw new Error("billplz_failed");
  return { id: j.id, url: j.url };
}

module.exports = { signature, amountFor, createBill };
