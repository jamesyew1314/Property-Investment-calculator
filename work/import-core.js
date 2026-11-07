"use strict";
// import-core.js — 解析 WhatsApp/群组房源文案（纯函数，可单测）
const tax = require("./library-taxonomy");

const TYPES = [
  [/cluster\s*house/i, "townhouse", "residential"],
  [/town\s*house|townhouse/i, "townhouse", "residential"],
  [/semi[-\s]?d|半独立/i, "semi_d", "residential"],
  [/bungalow|独立式|洋房|villa/i, "bungalow", "residential"],
  [/shop\s*lot|shoplot|店铺|店屋/i, "shoplot", "commercial"],
  [/office|办公室|办公楼/i, "office", "commercial"],
  [/factory|工业|industrial|warehouse|gudang/i, "office", "industrial"],
  [/condo|condominium|公寓|共管|service residence/i, "condo", "residential"],
  [/apartment|apartmen|flat|组屋/i, "apartment", "residential"],
  [/terrace|terraced|排屋|linked house|double\s*storey|2\s*storey|2\s*层|双层/i, "terrace", "residential"],
  [/(^land$|land\s*(plot|title)|地皮|土地|空地)/i, "land", "land"]
];

function clean(v) {
  return String(v || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2705}\u{274C}\u{26D4}\u{1F6AB}]/gu, " ")
    .replace(/^[\s•·\-–—*✅✔☎📞🏡💥❌⛔📛▶️]+/u, "")
    .replace(/^[\s\d]+[.)、]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[*_]+$/g, "")
    .trim();
}
function num(s) { return Number(String(s).replace(/[^\d.]/g, "")) || null; }
function money(s) {
  const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*([kKmM])?/);
  if (!m) return null;
  let v = Number(m[1]);
  if (!isFinite(v)) return null;
  const u = (m[2] || "").toLowerCase();
  if (u === "k") v *= 1000;
  if (u === "m") v *= 1000000;
  return v;
}
function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function parseListing(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map(clean).map(function (x) { return x.replace(/，/g, ","); }).filter(Boolean);
  const low = lines.join("\n").toLowerCase();
  const out = { remarks: raw.trim().slice(0, 3000) };
  const junk = [];

  // 1) 租 / 售
  if (/for rent|wtr|出租|招租|sewa|rental/i.test(low)) out.intent = "rent";
  else if (/for sale|wts|出售|dijual|selling|sales/i.test(low)) out.intent = "sale";

  // 2) 逐行识别
  let headDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const l = line.toLowerCase();

    if (/^repost$/i.test(line)) continue;

    // 地址：门牌 + 路名，下一行邮编城市 → 合并
    if (/^\d+[A-Za-z]?\s*,?\s*(jalan|jln|lorong|taman|street|road|persiaran)/i.test(line)) {
      const nxt = lines[i + 1] || "";
      out.address = (line + (/^\d{5}/.test(nxt) ? ", " + nxt : "")).slice(0, 240);
      if (/^\d{5}/.test(nxt)) i++;
      continue;
    }
    if (/\b\d{5}\b/.test(line) && line.includes(",")) { out.address = out.address || line.slice(0, 240); continue; }

    // 项目 / 地址（含 @、破折号、全大写花园名）
    if (!out.project_name && (line.includes("@") || /–|—/.test(line) || (/^[A-Z0-9 &().'\/-]{10,}$/.test(line) && /taman|eco|jalan|park|residence|heights/i.test(line)))) {
      out.project_name = line.slice(0, 160);
      out.address_text = line.slice(0, 180);
      continue;
    }

    // 电话 / 网址 / REN-only
    const phone = line.match(/(?:\+?60|0)1\d[\s-]?\d{3,4}[\s-]?\d{4}/);
    if (phone && line.replace(phone[0], "").replace(/\(?[A-Za-z ]+\)?/g, "").trim().length <= 6) { out._phone = out._phone || phone[0]; continue; }
    if (/wasap\.my|wa\.me|ren\s*\d{3,}/i.test(line)) continue;

    // 土地尺寸（30'x70' / 35X80 / 18 x 65 sq ft）
    const land = line.match(/lan[gd]\s*(?:size|area)?\s*[:\-]?\s*(\d{1,3})\s*['’]?\s*[x×]\s*(\d{1,3})/i) || line.match(/^(\d{1,3})\s*['’]?\s*[x×]\s*(\d{1,3})/);
    if (land) { out.land_size = land[1] + "x" + land[2]; continue; }

    // 建筑面积
    if (/built[-\s]?up/i.test(line)) {
      const b = line.match(/([\d,]{3,6})/);
      if (b) out.built_up = num(b[1]);
      continue;
    }

    // 房 / 浴 / 厕
    const bm = line.match(/(\d+)\s*(?:bedrooms?|beds?|房|bilik)/i);
    const ba = line.match(/(\d+)\s*(?:bathrooms?|baths?|浴室|卫|bilik air)/i);
    const to = line.match(/(\d+)\s*(?:toilets?|厕所|厕)/i);
    if (bm || ba || to) {
      if (bm) out.bedrooms = Number(bm[1]);
      if (ba) out.bathrooms = Number(ba[1]);
      if (to) out.toilets = Number(to[1]);
      if (!out.built_up) { const s = line.match(/([\d,]{3,6})\s*sq\.?\s*ft/i); if (s) out.built_up = num(s[1]); }
    }

    // 朝向
    const face = line.match(/facing(?:\s*direction)?\s*[:\-]?\s*(north\s*east|north\s*west|south\s*east|south\s*west|north|south|east|west)/i) || line.match(/(?:向|朝)(东|南|西|北)/);
    if (face) { out.facing = /东|南|西|北/.test(face[1]) ? ({ "东": "East", "南": "South", "西": "West", "北": "North" })[face[1]] : titleCase(face[1]); continue; }

    // 产权 / 地契
    if (/freehold/i.test(line)) { out.tenure = "freehold"; }
    if (/leasehold/i.test(line)) { out.tenure = "leasehold"; }
    if (/individual\s*title|个别地契/i.test(line)) { out.title_type = "individual"; }
    if (/strata\s*title|分层地契/i.test(line)) { out.title_type = "strata"; }
    if (/master\s*title|总地契/i.test(line)) { out.title_type = "master"; }
    if (/freehold|leasehold|title/i.test(line)) continue;

    // 现况
    if (/vacant|空置/i.test(line)) { out.condition = "vacant"; continue; }
    if (/occupied|自住/i.test(line)) { out.condition = "occupied"; continue; }
    if (/tenanted|出租中/i.test(line)) { out.condition = "tenanted"; continue; }
    if (/renovated|已装修|有装修/i.test(line)) { out.condition = "renovated"; continue; }

    // 保安
    if (/gated\s*(&|and)?\s*guarded|guarded|保安|围篱/i.test(line)) { out.security = /gated|围篱/i.test(line) ? "gated" : "guarded"; continue; }

    // 家私
    if (/fully\s*furnish|full\s*furnish|全装修/i.test(line)) { out.furnishing = "full"; continue; }
    else if (/partial|部分家私/i.test(line)) { out.furnishing = "partial"; continue; }
    else if (/unfurnished|空屋/i.test(line)) { out.furnishing = "unfurnished"; continue; }

    // Bumi
    if (/non[-\s]?bumi/i.test(line)) { out.bumi = "non_bumi"; continue; }
    else if (/\bbumi\b/i.test(line)) { out.bumi = "bumi"; continue; }

    // 房屋类型行（同时可作标题）
    if (/storey|cluster|terrace|terraced|bungalow|semi[-\s]?d|town\s*house|townhouse/i.test(line)) {
      for (let k = 0; k < TYPES.length; k++) {
        if (TYPES[k][0].test(line)) { if (!out.property_type) { out.property_type = TYPES[k][1]; out.category = TYPES[k][2]; } break; }
      }
      if (!out.headline) { out.headline = line.slice(0, 100); headDone = true; }
      if (/intermediate|中间单位/i.test(line)) out.lot_position = "intermediate";
      else if (/corner|角头/i.test(line)) out.lot_position = "corner";
      else if (/end\s*lot|endlot|尾/i.test(line)) out.lot_position = "end";
      continue;
    }

    // Lot
    if (/intermediate|中间单位|中间 lot/i.test(line)) { out.lot_position = "intermediate"; continue; }
    else if (/corner|角头/i.test(line)) { out.lot_position = "corner"; continue; }
    else if (/end\s*lot|endlot|尾/i.test(line)) { out.lot_position = "end"; continue; }

    // 管理费
    const mf = line.match(/maintenance\s*fees?\s*[:\-]?\s*RM\s*([\d,]+)/i);
    if (mf) { out.maintenance_fee = num(mf[1]); continue; }

    // 银行估价（TBC 忽略）
    if (/bank\s*value|valuation|估价/i.test(line)) {
      const bv = line.match(/([\d,]+)\s*([kKmM])?/);
      if (bv && !/tbc/i.test(line)) out.bank_value = money(bv[0]);
      continue;
    }

    // 价格
    const priceLine = /price|rm\s*[\d,]|售价|卖价|出租|rental|for sale|for rent|nego/i.test(line);
    if (priceLine) {
      const rm = line.match(/RM\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/i);
      if (rm) {
        const v = money(rm[1] + (rm[2] || ""));
        if (/rent|租|month|bulan/i.test(line) || out.intent === "rent") out.rent_price = v;
        else out.asking_price = v;
        if (/nego|可议价|negotiable/i.test(line)) out.negotiable = true;
      }
      if (/nego|可议价/i.test(line)) { out.negotiable = true; continue; }
    }

    // 单位号
    const um = line.match(/(?:unit|单位)\s*[:\-]?\s*([A-Za-z0-9-]{2,20})/i) || line.match(/\b([A-Z]{0,2}\d{1,2}-\d{1,3}(?:-\d{1,3})?)\b/);
    if (um) { out.unit_no = um[1]; continue; }

    // 房型
    let matchedType = false;
    for (let k = 0; k < TYPES.length; k++) {
      if (TYPES[k][0].test(line)) {
        if (!out.property_type) { out.property_type = TYPES[k][1]; out.category = TYPES[k][2]; }
        matchedType = true;
        break;
      }
    }
    if (matchedType) continue;

    // 标题：第一段营销文案
    if (!headDone && !out.headline && !/^(for sale|for rent|wts|wtr)|出售|出租|dijual|disewa/i.test(l) && line.length >= 6) {
      out.headline = line.slice(0, 100); headDone = true; continue;
    }

    // 其余有价值的信息进卖点
    if (line.length >= 4 && !/^(kindly contact|contact|welcome cobroke|agent|www\.)/i.test(line)) junk.push(line);
  }

  // 3) 区域：优先地址，其次全文
  function findArea(hay) {
    let best = null, bestLen = 0;
    tax.AREAS.forEach(function (a) {
      [a.zh, a.en, String(a.zh || "").replace(/^Taman\s+/i, ""), String(a.en || "").replace(/^Taman\s+/i, "")].forEach(function (n) {
        if (!n || n.length < 3) return;
        if (hay.indexOf(n.toLowerCase()) >= 0 && n.length > bestLen) { best = a.key; bestLen = n.length; }
      });
    });
    return best;
  }
  out.area_code = (out.address && findArea(out.address.toLowerCase())) || findArea(low) || undefined;

  // 4) 卖点（去重、限 8 条）
  if (junk.length) {
    out.selling_points = junk.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 8).join("\n").slice(0, 800);
  }

  // 5) 兜底
  if (!out.address_text && out.address) {
    const seg = out.address.match(/,\s*([^,]+),\s*\d{5}/);
    if (seg) { out.address_text = seg[1].trim().slice(0, 160); out.project_name = out.project_name || out.address_text; }
  }
  if (!out.project_name && out.area_code) {
    const a = tax.AREAS.filter(function (x) { return x.key === out.area_code; })[0];
    if (a) { out.project_name = a.en || a.zh; out.address_text = out.address_text || out.project_name; }
  }
  if (!out.category && (out.bedrooms || out.bathrooms)) out.category = "residential";
  if (!out.property_type && out.category === "commercial") out.property_type = "shoplot";
  if (out.intent === "rent" && !out.rent_price && out.asking_price) { out.rent_price = out.asking_price; delete out.asking_price; }

  out.confidence = ["intent","headline","project_name","address_text","area_code","category","property_type","land_size","built_up","bedrooms","bathrooms","toilets","lot_position","facing","bumi","tenure","title_type","furnishing","condition","asking_price","rent_price","bank_value","maintenance_fee","negotiable","unit_no"]
    .filter(function (k) { return out[k] != null && out[k] !== ""; }).length;
  return out;
}

module.exports = { parseListing: parseListing };
