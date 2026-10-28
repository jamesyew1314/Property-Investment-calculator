"use strict";
// import-core.js — 从粘贴文本识别房源字段（纯函数，可单测）
const tax = require("./library-taxonomy");

const TYPES = [
  [/condo|公寓|共管|apartment|service residence/i, "condo"],
  [/terrace|排屋|taman|landed|有地/i, "terrace"],
  [/semi[- ]?d|半独立/i, "semi_d"],
  [/bungalow|独立式|villa|洋房/i, "bungalow"],
  [/shop|商业|店面|retail/i, "shop"],
  [/land|地皮|土地|lot/i, "land"],
  [/flat|组屋|low cost|廉价/i, "flat"]
];

function num(s) { return Number(String(s).replace(/[^\d.]/g, "")) || null; }

function parseListing(text) {
  const raw = String(text || "");
  const t = raw.replace(/\r/g, "\n");
  const out = { remarks: raw.trim().slice(0, 2000), _matched: [] };
  function hit(k, v) { if (v != null && v !== "" && out[k] == null) { out[k] = v; out._matched.push(k); } }

  // 租 / 售
  if (/(出租|招租|for rent|rental|sewa)/i.test(t)) out.intent = "rent";
  else if (/(出售|卖|for sale|dijual|jual)/i.test(t)) out.intent = "sale";

  // 价格：RM 728,000 / 728k / 1.2m
  const pm = t.match(/RM\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/i) || t.match(/([\d,]{3,})\s*(?:ringgit|马币|千)/i);
  if (pm) {
    let v = Number(pm[1].replace(/,/g, ""));
    const unit = (pm[2] || "").toLowerCase();
    if (unit === "k") v *= 1000;
    if (unit === "m") v *= 1000000;
    if (v >= 1000) { if (out.intent === "rent") out.rent_price = v; else out.asking_price = v; }
  }

  // 房 / 卫
  const bm = t.match(/(\d+)\s*(?:房|bed\s*room|bedroom|bed|bilik)/i);
  const ba = t.match(/(\d+)\s*(?:卫|bath\s*room|bathroom|bath|bilik air)/i);
  if (bm) out.bedrooms = Number(bm[1]);
  if (ba) out.bathrooms = Number(ba[1]);

  // 面积
  const sm = t.match(/([\d,]{3,5})\s*(?:sq\.?\s*ft|sqft|sf|方尺|平方尺)/i);
  if (sm) out.built_up = num(sm[1]);

  // 单位 / 座
  const um = t.match(/\b([A-Z]{0,2}\s?-?\s?\d{1,2}\s*[-–]\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\b/);
  if (um) out.unit_no = um[1].replace(/\s+/g, "").replace(/–/g, "-");
  const blk = t.match(/(?:block|blok|座)\s*([A-Z0-9]{1,3})\b/i);
  if (blk) out.block = blk[1].toUpperCase();

  // 区域：匹配字典里的中英文名（取最长）
  let best = null, bestLen = 0;
  tax.AREAS.forEach(function (a) {
    const names = [a.zh, a.en, String(a.zh || "").replace(/^Taman\s+/i, ""), String(a.en || "").replace(/^Taman\s+/i, "")];
    names.forEach(function (name) {
      if (!name || name.length < 3) return;
      if (t.toLowerCase().indexOf(name.toLowerCase()) >= 0 && name.length > bestLen) { best = a.key; bestLen = name.length; }
    });
  });
  if (best) out.area_code = best;

  // 房型
  for (let i = 0; i < TYPES.length; i++) {
    if (TYPES[i][0].test(t)) { out.property_type = TYPES[i][1]; break; }
  }

  // 电话（仅识别，不写入房源，避免误存客户电话）
  const phone = t.match(/(?:\+?60|0)1\d[\s-]?\d{3,4}[\s-]?\d{4}/);
  if (phone) out._phone = phone[0];

  // 楼盘名：第一行去掉 emoji/【】/价格行
  const lines = t.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/RM\s*[\d,]/i.test(line)) continue;
    if (/^(出租|出售|for (rent|sale)|harga|rent|sale)/i.test(line) && line.length < 12) continue;
    const clean = line.replace(/[【】\[\]（）()]/g, " ").replace(/^\s*(出售|出租|售|租|for sale|for rent|dijual|disewa)\s*[:：-]?\s*/i, "").replace(/[\u{1F300}-\u{1FAFF}]/gu, "").replace(/\s+/g, " ").trim();
    if (clean.length >= 3 && clean.length <= 60 && !/^\d+$/.test(clean)) {
      const parts = clean.split(/\s*[·|｜]\s*/);
      out.project_name = parts[0].slice(0, 60);
      break;
    }
  }

  out.confidence = ["intent","asking_price","rent_price","bedrooms","bathrooms","built_up","area_code","property_type","unit_no","block","project_name"]
    .filter(function (k) { return out[k] != null; }).length;
  delete out._matched;
  return out;
}

module.exports = { parseListing: parseListing };
