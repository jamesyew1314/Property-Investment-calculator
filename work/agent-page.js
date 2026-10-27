"use strict";
// agent-page.js — 中介个人站（服务端渲染，SEO 友好）
const tax = require("./library-taxonomy");

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function money(n, monthly, en) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "—";
  return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + (monthly ? (en ? " /mo" : " /月") : "");
}
function areaName(code, en) {
  const a = tax.AREAS.filter(function (x) { return x.key === code; })[0];
  return a ? (en ? a.en : a.zh) : (code || "");
}
function stateName(code, en) {
  const s = tax.STATES.filter(function (x) { return x.key === code; })[0];
  return s ? (en ? s.en : s.zh) : "";
}

function card(p, en) {
  const price = p.intent === "rent" ? p.rent_price : p.asking_price;
  const title = (en ? (p.project_title || p.project_name) : (p.project_title_zh || p.project_title || p.project_name)) || "—";
  return '<a class="pcard" href="/properties/?p=' + encodeURIComponent(p.code) + '">' +
    '<div class="pcard-media"><div class="ph"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="rgba(226,200,143,.5)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></div>' +
    '<span class="pcard-tag">' + (p.intent === "rent" ? (en ? "For rent" : "出租") : (en ? "For sale" : "出售")) + "</span></div>" +
    '<div class="pcard-body"><div class="pcard-title">' + esc(title) + "</div>" +
    '<div class="pcard-sub">' + esc([p.block, p.unit_no].filter(Boolean).join(" ")) + "</div>" +
    '<div class="pcard-sub">' + esc(areaName(p.area_code, en)) + " · " + esc([p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join("/")) +
    (p.built_up ? " · " + Number(p.built_up).toLocaleString("en-MY") + " sqft" : "") + "</div>" +
    '<div class="pcard-price">' + money(price, p.intent === "rent", en) + "</div></div></a>";
}

module.exports = function renderAgentPage(agent, listings, opts) {
  opts = opts || {};
  const en = !!opts.en;
  const L = en
    ? { home: "Home", find: "Find a home", agents: "Agents", join: "For agents", calc: "Calculator", login: "Agent login",
        listings: "Listings", verified: "Verified agent", contact: "Contact", call: "Call", wa: "WhatsApp",
        none: "No public listings yet.", areas: "Areas covered", about: "About", back: "Back to PropNet",
        view: "View listing", license: "REN" }
    : { home: "首页", find: "找房", agents: "找中介", join: "给中介", calc: "计算器", login: "中介登录",
        listings: "在售房源", verified: "已验证中介", contact: "联系", call: "打电话", wa: "WhatsApp",
        none: "暂时没有公开房源。", areas: "专长区域", about: "关于", back: "返回 PropNet",
        view: "查看房源", license: "REN" };

  const name = agent.name || "Agent";
  const areas = (agent.areas || []).map(function (a) { return areaName(a, en); }).filter(Boolean);
  const wa = String(agent.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "60");
  const title = esc(name + (agent.ren_no ? " · " + agent.ren_no : "") + " | PropNet");
  const desc = esc((agent.bio || (en ? "Property agent on PropNet" : "PropNet 认证房产中介")) + " — " + (areas.slice(0, 4).join("、") || (en ? "Malaysia" : "全马")));

  const ld = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: name,
    url: "https://kwongthye.com/a/" + encodeURIComponent(agent.slug || ""),
    telephone: agent.phone || undefined,
    areaServed: areas.length ? areas : "Malaysia",
    worksFor: agent.team ? { "@type": "Organization", name: agent.team } : undefined
  };

  const rows = (listings || []).map(function (p) { return card(p, en); }).join("");

  return '<!DOCTYPE html><html lang="' + (en ? "en" : "zh-CN") + '"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + title + "</title>" +
    '<meta name="description" content="' + desc + '">' +
    '<link rel="canonical" href="https://kwongthye.com/a/' + encodeURIComponent(agent.slug || "") + '">' +
    '<meta property="og:type" content="profile"><meta property="og:title" content="' + title + '">' +
    '<meta property="og:description" content="' + desc + '">' +
    '<meta property="og:url" content="https://kwongthye.com/a/' + encodeURIComponent(agent.slug || "") + '">' +
    '<link rel="icon" type="image/png" href="/icon-256.png">' +
    '<link rel="stylesheet" href="/site.css">' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + "</script>" +
    '<style>.agentHero{background:linear-gradient(150deg,#0B1F31,#0E2438 60%,#0A1927);color:#fff;padding:54px 0 40px}' +
    ".agentHero .avatar{margin:0;width:72px;height:72px;border-radius:50%;background:#1E3E5C;display:grid;place-items:center;font:700 26px Georgia,serif;color:#E2C88F;border:2px solid rgba(198,161,91,.5)}" +
    ".agentHero h1{font-family:Georgia,serif;font-size:clamp(26px,4vw,40px);margin:14px 0 6px}" +
    ".agentHero .meta{color:rgba(255,255,255,.72);font-size:13.5px}" +
    ".agentHero .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.agentHero .chip{background:rgba(255,255,255,.08);border:1px solid rgba(198,161,91,.35);border-radius:999px;padding:5px 12px;font-size:12px;color:#E9DFC8}" +
    ".agentBody{padding:34px 0 70px}.agentBody h2{font-family:Georgia,serif;color:#0E2438;font-size:22px;margin:0 0 16px}" +
    ".contactRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}" +
    ".agentGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}" +
    "@media(max-width:760px){.agentGrid{grid-template-columns:1fr}.agentHero{padding:36px 0 28px}}" +
    "</style></head><body>" +
    '<header class="site-head"><div class="wrap bar">' +
    '<a class="brand" href="/"><img src="/logo-white.png" alt="KWONG THYE"><span>PROPNET</span></a>' +
    '<nav class="site-nav"><a href="/properties/">' + L.find + '</a><a href="/agents/">' + L.agents + '</a><a href="/join/">' + L.join + '</a><a href="https://calc.kwongthye.com/">' + L.calc + '</a>' +
    '<a class="login" href="/agent/">' + L.login + "</a></nav>" +
    "</div></header>" +
    '<section class="agentHero"><div class="wrap">' +
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
    '<div class="avatar">' + esc(name.slice(0, 2).toUpperCase()) + "</div>" +
    "<div><h1>" + esc(name) + (agent.verified_at ? ' <span style="font-size:13px;color:#8FD3B4;vertical-align:middle">✓ ' + L.verified + "</span>" : "") + "</h1>" +
    '<div class="meta">' + esc(agent.team || "PropNet") + (agent.ren_no ? " · " + esc(agent.ren_no) : "") + "</div></div></div>" +
    (agent.bio ? '<p style="max-width:720px;color:rgba(255,255,255,.8);margin:14px 0 0">' + esc(agent.bio) + "</p>" : "") +
    (areas.length ? '<div class="chips">' + areas.slice(0, 10).map(function (a) { return '<span class="chip">' + esc(a) + "</span>"; }).join("") + "</div>" : "") +
    '<div class="contactRow">' +
    (agent.phone ? '<a class="btn gold" href="tel:' + esc(agent.phone) + '">' + L.call + " · " + esc(agent.phone) + "</a>" : "") +
    (wa ? '<a class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">' + L.wa + "</a>" : "") +
    '<a class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="/properties/?agent=' + encodeURIComponent(agent.slug || "") + '">' + L.view + "</a>" +
    "</div></div></section>" +
    '<main class="wrap agentBody">' +
    "<h2>" + L.listings + " · " + (listings || []).length + "</h2>" +
    (rows ? '<div class="agentGrid">' + rows + "</div>" : '<div class="empty" style="padding:40px;text-align:center;border:1px dashed #DCD6C8;border-radius:14px;color:#5D6B7A">' + L.none + "</div>") +
    '<p style="margin-top:30px"><a href="/agents/" style="color:#2E5496">← ' + L.back + "</a></p>" +
    "</main></body></html>";
};
