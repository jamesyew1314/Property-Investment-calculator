"use strict";
// ai-copy.js — 房源公开描述生成（有 AI_API_KEY 用模型，否则用模板）
const AREA = require("./library-taxonomy");

function areaName(code, lang) {
  const a = AREA.AREAS.filter(function (x) { return x.key === code; })[0];
  if (!a) return code || "";
  return lang === "zh" ? a.zh : a.en;
}
function template(f, lang) {
  const area = areaName(f.area_code, lang);
  const title = f.project_name || area || (lang === "zh" ? "这套房源" : "This property");
  const bits = [];
  if (f.bedrooms) bits.push(f.bedrooms + (lang === "zh" ? " 房" : " bed"));
  if (f.bathrooms) bits.push(f.bathrooms + (lang === "zh" ? " 卫" : " bath"));
  if (f.built_up) bits.push(Number(f.built_up).toLocaleString("en-MY") + " sqft");
  const spec = bits.join(" · ");
  const price = f.price ? "RM " + Number(f.price).toLocaleString("en-MY") : "";
  if (lang === "en") {
    return title + " — " + area + (spec ? " · " + spec : "") + ". " +
      (f.intent === "rent" ? "Available for rent" : "Available for sale") + (price ? " at " + price : "") +
      ". Good access to amenities, shops and schools. Viewing by appointment — contact the listing agent.";
  }
  if (lang === "bm") {
    return title + " — " + area + (spec ? " · " + spec : "") + ". " +
      (f.intent === "rent" ? "Untuk disewa" : "Untuk dijual") + (price ? " pada " + price : "") +
      ". Akses mudah ke kemudahan, kedai dan sekolah. Tontonan dengan temu janji — hubungi ejen senarai.";
  }
  return title + "，位于" + area + (spec ? "，" + spec : "") + "。" +
    (f.intent === "rent" ? "现出租" : "现出售") + (price ? "，价格 " + price : "") +
    "。周边生活配套齐全，交通方便，适合自住或投资。欢迎预约看房，联系货源中介。";
}

async function generate(f, lang) {
  const key = process.env.AI_API_KEY;
  if (key) {
    try {
      const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
      const model = process.env.AI_MODEL || "gpt-4o-mini";
      const prompt = "Write a short property listing description in " + (lang === "zh" ? "Simplified Chinese" : (lang === "bm" ? "Bahasa Melayu" : "English")) +
        ". 2-3 sentences, no owner details, no unit number, no phone. Fields: " + JSON.stringify(f);
      const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: prompt }], temperature: 0.6, max_tokens: 220 })
      });
      if (r.ok) {
        const j = await r.json();
        const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (text && text.trim()) return { text: text.trim(), engine: "ai" };
      }
    } catch (e) { /* fall through */ }
  }
  return { text: template(f, lang), engine: "template" };
}

module.exports = { generate: generate, template: template };
