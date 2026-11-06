"use strict";
// import-core.js — 从粘贴文本识别房源字段（纯函数，可单测）
const tax = require("./library-taxonomy");

const TYPES = [
  [/shop\s*lot|shoplot|店铺|店屋/i, "shoplot", "commercial"],
  [/condo|condominium|公寓|共管/i, "condo", "residential"],
  [/apartment|apartmen|服务式|service residence/i, "apartment", "residential"],
  [/semi[-\s]?d|半独立/i, "semi_d", "residential"],
  [/bungalow|独立式|洋房|villa/i, "bungalow", "residential"],
  [/townhouse/i, "townhouse", "residential"],
  [/terrace|排屋|linked house|taman/i, "terrace", "residential"],
  [/office|办公室|办公楼/i, "office", "commercial"],
  [/factory|工业|industrial|gudang|warehouse/i, "office", "industrial"],
  [/land|地皮|土地|空地|lot\s*tanah/i, "land", "land"],
  [/flat|组屋|low cost|廉价/i, "flat", "residential"]
];

function num(s) { return Number(String(s).replace(/[^\d.]/g, "")) || null; }
function strip(v) { return String(v || "").replace(/^[*_\s]+|[*_\s]+$/g, "").trim(); }

function parseListing(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map(strip).map(function (x) { return x.replace(/，/g, ","); }).filter(Boolean);
  const out = { remarks: raw.trim().slice(0, 3000) };
  const lower = lines.join("\n").toLowerCase();

  // 1. 租 / 售
  if (/wtr|for rent|出租|招租|sewa|rental/i.test(lower)) out.intent = "rent";
  else if (/wts|for sale|出售|dijual|selling/i.test(lower)) out.intent = "sale";

  // 2. 标题：类型行后的第一行
  let headIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/wtr|wts|for rent|for sale|出租|出售/i.test(lines[i])) { headIdx = i; break; }
  }
  if (headIdx >= 0 && lines[headIdx + 1] && !/\d/.test(lines[headIdx + 1]) && !/^\d{5}|,/.test(lines[headIdx + 1])) out.headline = lines[headIdx + 1].slice(0, 80);

  // 3. 逐行识别
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];



    // 完整地址（含 5 位邮编 + 逗号）
    if (/\b\d{5}\b/.test(line) && line.includes(",")) {
      if (!out.address) out.address = line.slice(0, 240);
      continue;
    }
    // 门牌 + 路名，下一行是邮编城市 → 合并
    if (/^\d+[A-Za-z]?\s*,?\s*(jalan|jln|lorong|taman|street|road|persiaran)/i.test(line)) {
      var nxt = lines[i + 1] || "";
      out.address = (line + (/^\d{5}/.test(nxt) ? ", " + nxt : "")).slice(0, 240);
      if (/^\d{5}/.test(nxt)) i++;
      continue;
    }
    // 电话
    const phone = line.match(/(?:\+?60|0)1\d[\s-]?\d{3,4}[\s-]?\d{4}/);
    if (phone && /^(agent|电话|tel|contact|hubungi|wa|whatsapp)?[\s:：-]*$/i.test(line.replace(phone[0], "").trim())) { out._phone = phone[0]; continue; }
    // 网站
    if (/wasap\.my|wa\.me/i.test(line)) continue;

    // 项目/花园名（含 @ 或除属性外最长一行）
    if (line.includes("@")) { out.project_name = out.project_name || line.slice(0, 120); out.address_text = out.address_text || line.slice(0, 160); continue; }

    // 土地尺寸 22x70
    const land = line.match(/(?:land|lang|lot)?\s*size\s*[:\-]?\s*(\d{1,4})\s*[x×]\s*(\d{1,4})/i) || line.match(/^(\d{1,4})\s*[x×]\s*(\d{1,4})$/i);
    if (land) { out.land_size = (land[1] + "x" + land[2]); continue; }

    // Lot 位置
    if (/intermediate|middle lot|中间/i.test(line)) { out.lot_position = "intermediate"; continue; }
    if (/corner|角头/i.test(line)) { out.lot_position = "corner"; continue; }
    if (/end\s*lot|尾/i.test(line)) { out.lot_position = "end"; continue; }

    // 方向
    const face = line.match(/facing\s*[:\-]?\s*(north|south|east|west|n\/e|n\/w|s\/e|s\/w)/i) || line.match(/(?:向|朝)(东|南|西|北)/);
    if (face) {
      var DIR = { "东": "East", "南": "South", "西": "West", "北": "North" };
      out.facing = DIR[face[1]] || face[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      continue;
    }

    // 保安
    if (/保安|围篱|守卫|guarded|gated|security/i.test(line)) { out.security = /围篱|gated/i.test(line) ? "gated" : "guarded"; continue; }
    // Bumi
    if (/non[-\s]?bumi/i.test(line)) { out.bumi = "non_bumi"; continue; }
    if (/\bbumi\b/i.test(line) && !/non/i.test(line)) { out.bumi = "bumi"; continue; }

    // 产权
    if (/freehold|永久/i.test(line)) { out.tenure = "freehold"; continue; }
    if (/leasehold|租赁/i.test(line)) { out.tenure = "leasehold"; continue; }

    // 地契
    if (/individual\s*title|个别地契/i.test(line)) { out.title_type = "individual"; continue; }
    if (/strata\s*title|分层地契/i.test(line)) { out.title_type = "strata"; continue; }
    if (/master\s*title|总地契/i.test(line)) { out.title_type = "master"; continue; }

    // 家私
    if (/unfurnished|空屋|无家私/i.test(line)) { out.furnishing = "unfurnished"; continue; }
    if (/partially|部分家私|partial/i.test(line)) { out.furnishing = "partial"; continue; }
    if (/fully furnished|全装修|full furnished/i.test(line)) { out.furnishing = "full"; continue; }

    // 现况
    if (/vacant|空置/i.test(line)) { out.condition = "vacant"; continue; }
    if (/occupied|自住/i.test(line)) { out.condition = "occupied"; continue; }
    if (/tenanted|出租中/i.test(line)) { out.condition = "tenanted"; continue; }
    if (/renovated|已装修|有装修/i.test(line) && !/original/i.test(line)) { out.condition = "renovated"; continue; }

    // 价格
    const labeled = line.match(/(卖价|售价|selling|asking|租金|rental|租|估价|银行估价|bank\s*value|valuation)[^\d]{0,8}RM\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/i);
    if (labeled) {
      let lv = Number(labeled[2].replace(/,/g, ""));
      const lu = (labeled[3] || "").toLowerCase();
      if (lu === "k") lv *= 1000;
      if (lu === "m") lv *= 1000000;
      if (/估|bank|valuation/i.test(labeled[1])) out.bank_value = lv;
      else if (/租|rent/i.test(labeled[1])) out.rent_price = lv;
      else out.asking_price = lv;
      if (/可议价|negotiable/i.test(line)) out.negotiable = true;
      continue;
    }
    const price = line.match(/RM\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/);
    if (price) {
      let v = Number(price[1].replace(/,/g, ""));
      const unit = (price[2] || "").toLowerCase();
      if (unit === "k") v *= 1000;
      if (unit === "m") v *= 1000000;
      if (/rent|租|month|bulan/i.test(line) || out.intent === "rent") out.rent_price = v;
      else out.asking_price = v;
      if (/negotiable|可议价|bincang/i.test(line)) out.negotiable = true;
    }
    if (/negotiable|可议价/i.test(line)) { out.negotiable = true; continue; }

    // 房间 / 卫浴
    const bm = line.match(/(\d+)\s*(?:房|bed\s*room|bedroom|bed|bilik)/i);
    const ba = line.match(/(\d+)\s*(?:卫|bath\s*room|bathroom|bath|bilik air)/i);
    if (bm) out.bedrooms = Number(bm[1]);
    if (ba) out.bathrooms = Number(ba[1]);
    const toi = line.match(/(\d+)\s*(?:toilet|厕所|厕|卫生间)/i);
    if (toi) out.toilets = Number(toi[1]);

    // 面积 sqft
    const sm = line.match(/([\d,]{3,5})\s*(?:sq\.?\s*ft|sqft|sf|方尺|平方尺)/i);
    if (sm) { out.built_up = num(sm[1]); }

    // 房型
    for (let k = 0; k < TYPES.length; k++) {
      if (TYPES[k][0].test(line)) {
        out.property_type = out.property_type || TYPES[k][1];
        out.category = out.category || TYPES[k][2];
        break;
      }
    }
  }

  // 4. 单位号
  const um = raw.match(/\b([A-Z]{0,2}\s?-?\s?\d{1,2}\s*[-–]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\b/);
  if (um) out.unit_no = um[1].replace(/\s+/g, "").replace(/–/g, "-");

  // 5. 区域（最长匹配中文/英文/去掉 Taman）
  function findArea(hay) {
    let best = null, bestLen = 0;
    tax.AREAS.forEach(function (a) {
      [a.zh, a.en, String(a.zh || "").replace(/^Taman\s+/i, ""), String(a.en || "").replace(/^Taman\s+/i, "")].forEach(function (name) {
        if (!name || name.length < 3) return;
        if (hay.indexOf(name.toLowerCase()) >= 0 && name.length > bestLen) { best = a.key; bestLen = name.length; }
      });
    });
    return best;
  }
  const areaFromAddress = out.address ? findArea(out.address.toLowerCase()) : null;
  const best = areaFromAddress || findArea(lower);
  if (best) out.area_code = best;

  // 6. 地址里取路名作为花园名
  if (!out.address_text && out.address) {
    const seg = out.address.match(/,\s*([^,]+),\s*\d{5}/);
    if (seg) { out.address_text = seg[1].trim().slice(0, 160); out.project_name = out.project_name || out.address_text; }
  }
  // 7. 项目名回退：第一条非属性长行
  if (!out.project_name) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.length < 4 || l.length > 80) continue;
      if (/wtr|wts|rm\s*[\d,]|出售|出租|for sale|for rent|dijual|disewa/i.test(l)) continue;
      if (out.address && l === out.address) continue;
      if (/^\d{5}|wasap|^0?1\d/i.test(l)) continue;
      const isAttr = TYPES.some(function (t) { return t[0].test(l); }) || /freehold|leasehold|bumi|title|furnish|vacant|facing|intermediate|^\d+x\d+/i.test(l);
      if (!isAttr) { out.project_name = l.slice(0, 120); out.address_text = out.address_text || l.slice(0, 160); break; }
    }
  }

  out.confidence = ["intent","headline","project_name","address_text","address","area_code","category","property_type","land_size","built_up","bedrooms","bathrooms","toilets","lot_position","facing","bumi","tenure","title_type","furnishing","condition","asking_price","rent_price","negotiable","unit_no"]
    .filter(function (k) { return out[k] != null && out[k] !== ""; }).length;
  if (!out.property_type && out.category === "commercial") out.property_type = "shoplot";
  if (!out.category && (out.bedrooms || out.bathrooms || out.toilets)) out.category = "residential";
  return out;
}

module.exports = { parseListing: parseListing };
