"use strict";
function langSwitch(lang){
  const opts=[["zh","中文"],["en","EN"],["bm","BM"]];
  return '<div id="l3" style="position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:4px;background:#fff;border:1px solid #D6DCE7;border-radius:999px;padding:3px">'+
    opts.map(function(o){return '<a href="?lang='+o[0]+'" style="font:600 11px/1 -apple-system,sans-serif;text-decoration:none;padding:6px 9px;border-radius:999px;'+(lang===o[0]?'background:#0E2438;color:#fff':'color:#0E2438')+'">'+o[1]+'</a>';}).join("")+'</div>';
}

// public-page.js — 公开房源详情（业主资料不出网，只展示与货源中介）
const tax = require("./library-taxonomy");
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function areaName(code, en) {
  const a = tax.AREAS.filter(function (x) { return x.key === code; })[0];
  return a ? (en ? a.en : a.zh) : (code || "");
}
function money(n, monthly, lang) {
  const v = Number(n); if (!isFinite(v) || !v) return "—";
  return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + (monthly ? (lang === "bm" ? " /bln" : (lang === "en" ? " /mo" : " /月")) : "");
}
const TYPE = { condo: ["公寓", "Condominium"], apartment: ["Apartment", "Apartment"], terrace: ["排屋", "Terrace"], semi_d: ["半独立", "Semi-D"], bungalow: ["独立式", "Bungalow"], townhouse: ["Townhouse", "Townhouse"], shoplot: ["店屋", "Shoplot"], office: ["办公室", "Office"], land: ["地皮", "Land"] };

module.exports = function renderPublicListing(p, agent, opts) {
  opts = opts || {};
  const lang = opts.lang || "zh";
  const en = lang === "en";
  const T = lang === "bm"
    ? { home: "Utama", back: "Kembali ke ejen", contact: "Hubungi ejen", wa: "WhatsApp", call: "Telefon",
        specs: "Butiran", area: "Kawasan", type: "Jenis", beds: "Bilik", baths: "Bilik air", built: "Luas binaan",
        tenure: "Pegangan", price: "Harga", agent: "Ejen senarai", more: "Lihat semua senarai ejen ini", forRent: "Untuk disewa", forSale: "Untuk dijual" }
    : (en
    ? { home: "Home", back: "Back to agent", contact: "Contact agent", wa: "WhatsApp", call: "Call",
        specs: "Details", area: "Area", type: "Type", beds: "Bedrooms", baths: "Bathrooms", built: "Built-up",
        tenure: "Tenure", price: "Price", agent: "Listing agent", more: "See all listings from this agent", forRent: "For rent", forSale: "For sale" }
    : { home: "首页", back: "返回中介主页", contact: "联系中介", wa: "WhatsApp", call: "打电话",
        specs: "房源资料", area: "区域", type: "房型", beds: "卧室", baths: "浴室", built: "建筑面积",
        tenure: "产权", price: "价格", agent: "货源中介", more: "查看该中介全部房源", forRent: "出租", forSale: "出售" });

  const title = (lang === "zh" ? (p.project_title_zh || p.project_title || p.project_name) : (p.project_title || p.project_name)) || p.code;
  const price = p.intent === "rent" ? p.rent_price : p.asking_price;
  const area = areaName(p.area_code, lang !== "zh");
  const photos = (p.photos || []).filter(function (x) { return /^\/uploads\/props\/[A-Za-z0-9._-]+$/.test(x); });
  const main = photos[0] || p.cover_url;
  const waNum = String(agent.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "60");
  const waText = encodeURIComponent((lang === "bm" ? "Hai " : (en ? "Hi " : "你好 ")) + (agent.name || "") + " — " + p.code);
  const wa = waNum ? "https://wa.me/" + waNum + "?text=" + waText : "";
  const tname = TYPE[p.property_type] ? (lang === "zh" ? TYPE[p.property_type][0] : TYPE[p.property_type][1]) : (p.property_type || "—");

  const ld = { "@context": "https://schema.org", "@type": "RealEstateListing", name: title, url: "https://kwongthye.com/p/" + p.code,
    image: main ? "https://kwongthye.com" + main : undefined,
    offers: { "@type": "Offer", price: Number(price) || 0, priceCurrency: "MYR" },
    address: { "@type": "PostalAddress", addressRegion: "Johor", addressLocality: area, addressCountry: "MY" } };

  const specs = [
    [T.area, area], [T.type, tname],
    p.bedrooms != null ? [T.beds, p.bedrooms] : null,
    p.bathrooms != null ? [T.baths, p.bathrooms] : null,
    p.built_up ? [T.built, Number(p.built_up).toLocaleString("en-MY") + " sqft"] : null,
    p.tenure ? [T.tenure, p.tenure] : null
  ].filter(Boolean).map(function (r) { return '<div class="spec"><span>' + r[0] + "</span><b>" + esc(r[1]) + "</b></div>"; }).join("");

  return '<!DOCTYPE html><html lang="' + (lang === "bm" ? "ms" : (en ? "en" : "zh-CN")) + '"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(title) + " · " + esc(area) + " | RoofX</title>" +
    '<meta name="description" content="' + esc(title + " · " + area + " · " + money(price, p.intent === "rent", lang) + " · " + tname) + '">' +
    '<link rel="canonical" href="https://kwongthye.com/p/' + encodeURIComponent(p.code) + '">' +
    '<meta property="og:type" content="product"><meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(money(price, p.intent === "rent", lang) + " · " + area) + '">' +
    (main ? '<meta property="og:image" content="https://kwongthye.com' + esc(main) + '">' : "") +
    '<link rel="icon" type="image/png" href="/icon-256.png"><link rel="stylesheet" href="/site.css">' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + "</script>" +
    '<style>.pd{padding:26px 0 70px}.pd-back{font-size:13px;color:#2E5496;text-decoration:none}.pd-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:28px;margin-top:16px}' +
    ".pd-photo{position:relative;border-radius:14px;overflow:hidden;background:#0E2438;aspect-ratio:16/10}.pd-photo img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".pd-thumbs{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.pd-thumbs img{width:82px;height:62px;object-fit:cover;border-radius:8px;border:1px solid #DCE3EC;cursor:pointer}" +
    ".pd h1{font-family:Georgia,serif;color:#0E2438;font-size:clamp(22px,3vw,30px);margin:0 0 6px}.pd .price{font-family:Georgia,serif;color:#B8862F;font-size:24px;margin:6px 0 4px}" +
    ".specs{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin:18px 0;padding:16px;border:1px solid #E3E8F0;border-radius:12px;background:#FAFBFD}" +
    ".spec{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#5D6B7A}.spec b{color:#0E2438}" +
    ".agentBox{border:1px solid #E3E8F0;border-radius:14px;padding:18px;background:#fff;height:fit-content}" +
    ".agentBox .av{width:52px;height:52px;border-radius:50%;background:#0E2438;color:#E2C88F;display:grid;place-items:center;font:700 18px Georgia,serif}" +
    "@media(max-width:820px){.pd-grid{grid-template-columns:1fr}}" +
    "</style><link rel='stylesheet' href='/fonts.css'><link rel='stylesheet' href='/neo.css'></head><body class='neo'>" +
    '<header class="site-head"><div class="wrap bar"><a class="brand" href="/"><img src="/logo-white.png" alt="RoofX"><span>RoofX</span></a>' +
    '<nav class="site-nav"><a href="/properties/">' + (lang === "zh" ? "房源池" : (en ? "Listing pool" : "Semua Senarai RoofX")) + '</a><a href="/agents/">' + (lang === "zh" ? "中介简介" : (en ? "Agent profiles" : "Profil ejen")) + '</a><a href="/join/">' + (lang === "zh" ? "中介注册" : (en ? "Agent registration" : "Pendaftaran ejen")) + '</a><a class="login" href="/agent/">' + (lang === "zh" ? "中介登录" : (en ? "Agent login" : "Log Masuk Ejen")) + "</a></nav></div></header>" +
    '<main class="wrap pd"><a class="pd-back" href="/a/' + encodeURIComponent(agent.slug || "") + '?lang=' + lang + '">← ' + T.back + "</a>" +
    '<div class="pd-grid"><div><div class="pd-photo">' + (main ? '<img src="' + esc(main) + '" alt="' + esc(title) + '">' : "") + "</div>" +
    (photos.length > 1 ? '<div class="pd-thumbs">' + photos.slice(0, 8).map(function (u) { return '<img src="' + esc(u.replace(/\.jpg$/i, "_t.jpg")) + '" data-full="' + esc(u) + '" onclick="var m=document.querySelector(\'.pd-photo img\');if(m)m.src=this.dataset.full" alt="">'; }).join("") + "</div>" : "") +
    "<h1>" + esc(title) + "</h1><div style=\"color:#5D6B7A;font-size:13.5px\">" + esc(p.code) + " · " + esc(area) + "</div>" +
    '<div class="price">' + money(price, p.intent === "rent", lang) + ' <span style="font:600 12px/1 sans-serif;padding:4px 9px;border-radius:999px;background:#F3EAD8;color:#8A6420;vertical-align:middle">' + (p.intent === "rent" ? T.forRent : T.forSale) + "</span></div>" +
    '<div class="specs">' + specs + "</div>" +
    (p.description ? '<div style="margin:0 0 18px;color:#41505F;line-height:1.8;white-space:pre-wrap">' + esc(p.description) + "</div>" : "") +
    "</div>" +
    '<aside class="agentBox"><div style="font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:#8A97A6">' + T.agent + "</div>" +
    '<div style="display:flex;gap:12px;align-items:center;margin:10px 0 14px"><div class="av">' + (agent.photo_url ? '<img src="' + esc(agent.photo_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc((agent.name || "A").slice(0, 2).toUpperCase())) + '</div><div><b style="color:#0E2438">' + esc(agent.name || "") + '</b><div style="font-size:12px;color:#5D6B7A">' + esc(agent.team || "RoofX") + (agent.ren_no ? " · " + esc(agent.ren_no) : "") + "</div></div></div>" +
    (wa ? '<a class="btn gold" style="width:100%;text-align:center" href="' + wa + '" target="_blank" rel="noopener">' + T.wa + "</a>" : "") +
    (agent.phone ? '<a class="btn line" style="width:100%;text-align:center;margin-top:8px" href="tel:' + esc(agent.phone) + '">' + T.call + "</a>" : "") +
    '<a class="btn line" style="width:100%;text-align:center;margin-top:8px" href="/a/' + encodeURIComponent(agent.slug || "") + '?lang=' + lang + '">' + T.more + "</a>" +
    '<button id="favBtn" type="button" style="width:100%;margin-top:8px;padding:9px;border:1px solid #D6DCE7;border-radius:9px;background:#fff;cursor:pointer">♡ ' + (lang === "zh" ? "收藏" : (lang === "bm" ? "Simpan" : "Save")) + "</button></aside></div></main>" +
    '<script>(function(){var c=' + JSON.stringify(p.code) + ',k="pn_favs",b=document.getElementById("favBtn");function g(){try{return JSON.parse(localStorage.getItem(k)||"[]")}catch(e){return []}}function p(){var a=g(),on=a.indexOf(c)>=0;b.textContent=(on?"♥ ":"♡ ")+(on?' + JSON.stringify(lang === "zh" ? "已收藏" : (lang === "bm" ? "Disimpan" : "Saved")) + ':' + JSON.stringify(lang === "zh" ? "收藏" : (lang === "bm" ? "Simpan" : "Save")) + ')}b.addEventListener("click",function(){var a=g(),i=a.indexOf(c);if(i>=0)a.splice(i,1);else a.unshift(c);localStorage.setItem(k,JSON.stringify(a.slice(0,50)));p()});p()})();' +
    '<script src="/lang3.js"><\/script>' + langSwitch(lang) + "</body></html>";
};
