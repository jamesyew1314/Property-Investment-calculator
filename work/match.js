"use strict";
// match.js — WTB 客户 ↔ 房源匹配打分（工作台与每日摘要共用）

function priceOf(p) { return p.intent === "rent" ? Number(p.rent_price || 0) : Number(p.asking_price || 0); }

function score(client, listing) {
  const price = priceOf(listing);
  if (!price) return -1;
  const want = client.intent === "rent" ? "rent" : (client.intent === "buy" ? "sale" : null);
  if (want && listing.intent !== want) return -1;
  if (client.budget_max && price > Number(client.budget_max) * 1.05) return -1;
  if (client.budget_min && price < Number(client.budget_min) * 0.9) return -1;
  const areas = client.area_codes || [];
  if (areas.length && areas.indexOf(listing.area_code) < 0) return -1;
  const types = client.property_types || [];
  if (types.length && types.indexOf(listing.property_type) < 0) return -1;
  if (client.bedrooms_min && Number(listing.bedrooms || 0) < Number(client.bedrooms_min)) return -1;
  let s = 0;
  if (client.budget_max) s += 30 - Math.min(30, Math.abs(Number(client.budget_max) - price) / Number(client.budget_max) * 30);
  if (areas.length) s += 40;
  if (types.length) s += 10;
  if (client.bedrooms_min && listing.bedrooms) s += 10;
  const t = listing.updated_at ? new Date(listing.updated_at).getTime() : 0;
  if (t) s += Math.max(0, 10 - (Date.now() - t) / 864000000);
  return s;
}

function matchClients(clients, listings, perClient) {
  const cap = perClient || 6;
  return (clients || []).map(function (c) {
    const rows = (listings || []).map(function (p) { return { p: p, s: score(c, p) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, cap)
      .map(function (x) { return Object.assign({ score: Math.round(x.s) }, x.p); });
    return { client: c, matches: rows };
  });
}

module.exports = { score: score, matchClients: matchClients, priceOf: priceOf };
