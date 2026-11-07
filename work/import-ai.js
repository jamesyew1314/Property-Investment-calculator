"use strict";
// import-ai.js — 规则解析不确定时，用 DeepSeek 兜底抽取
const https = require("https");
const tax = require("./library-taxonomy");

const FIELDS = ["intent","headline","project_name","address_text","address","area_code","category","property_type","land_size","built_up","bedrooms","bathrooms","toilets","lot_position","facing","bumi","tenure","title_type","furnishing","condition","security","maintenance_fee","asking_price","rent_price","bank_value","negotiable","unit_no","selling_points","description"];

function allowed(list, key) { return list.map(function (x) { return x[key || "key"]; }).join(", "); }

function prompt(text) {
  return "You extract Malaysian property listing data from WhatsApp text. Return ONLY minified JSON with these keys: " + FIELDS.join(",") + ".\\n" +
    "Rules: intent is 'sale' or 'rent'. Prices are numbers in MYR (RM818K = 818000). bank_value is the bank valuation, not asking price. land_size like '22x70'. built_up in sqft. category one of residential/commercial/industrial/land. property_type one of " + allowed(tax.PROPERTY_TYPES || [{key:"terrace"},{key:"condo"},{key:"apartment"},{key:"semi_d"},{key:"bungalow"},{key:"townhouse"},{key:"shoplot"},{key:"office"},{key:"land"}]) + ". " +
    "area_code one of " + allowed(tax.AREAS) + ". tenure freehold/leasehold. title_type individual/strata/master. bumi bumi/non_bumi. furnishing unfurnished/partial/full. condition vacant/occupied/tenanted/renovated. lot_position intermediate/corner/end/side. security gated/guarded/none. negotiable true/false. Unknown values: null.\\nText:\\n" + text.slice(0, 6000);
}

function call(key, text, timeout) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: "You are a precise data extractor. Output JSON only." },
        { role: "user", content: prompt(text) }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    });
    const req = https.request({
      hostname: "api.deepseek.com",
      path: "/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key, "Content-Length": Buffer.byteLength(body) },
      timeout: timeout || 15000
    }, function (res) {
      let data = "";
      res.on("data", function (d) { data += d; });
      res.on("end", function () {
        try {
          if (res.statusCode !== 200) return reject(new Error("deepseek_" + res.statusCode));
          const j = JSON.parse(data);
          const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (!content) return reject(new Error("deepseek_empty"));
          resolve(JSON.parse(content));
        } catch (e) { reject(e); }
      });
    });
    req.on("timeout", function () { req.destroy(new Error("deepseek_timeout")); });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

async function enrich(text, fields, opts) {
  const key = (opts && opts.key) || process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const missing = !fields.asking_price && !fields.rent_price || !fields.area_code || !fields.property_type;
  const low = (fields.confidence || 0) < 8;
  if (!missing && !low) return null;
  const ai = await call(key, text, opts && opts.timeout);
  const out = {};
  FIELDS.forEach(function (k) {
    let v = ai[k];
    if (v === "" || v === undefined) v = null;
    if (k === "intent" && v && ["sale","rent","buy"].indexOf(v) < 0) v = null;
    if (k === "intent" && v === "buy") v = "sale";
    if (k === "area_code" && v && !tax.AREAS.some(function (a) { return a.key === v; })) v = null;
    if (k === "category" && v && ["residential","commercial","industrial","land"].indexOf(v) < 0) v = null;
    if (k === "property_type" && v && !(tax.PROPERTY_TYPES || []).some(function (x) { return x.key === v; })) {
      const t = (tax.PROPERTY_TYPES || []).filter(function (x) { return String(v).toLowerCase().indexOf(x.key) >= 0; })[0];
      v = t ? t.key : null;
    }
    if (["built_up","bedrooms","bathrooms","toilets","maintenance_fee","asking_price","rent_price","bank_value"].indexOf(k) >= 0 && v != null) {
      v = Number(String(v).replace(/[^0-9.]/g, "")) || null;
    }
    if (k === "negotiable" && v != null) v = !!v;
    out[k] = v;
  });
  return out;
}

module.exports = { enrich: enrich, FIELDS: FIELDS };
