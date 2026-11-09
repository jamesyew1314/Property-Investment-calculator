"use strict";
function langSwitch(lang){
  const opts=[["zh","中文"],["en","EN"],["bm","BM"]];
  return '<div id="l3" style="position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:4px;background:#fff;border:1px solid #D6DCE7;border-radius:999px;padding:3px">'+
    opts.map(function(o){return '<a href="?lang='+o[0]+'" style="font:600 11px/1 -apple-system,sans-serif;text-decoration:none;padding:6px 9px;border-radius:999px;'+(lang===o[0]?'background:#0E2438;color:#fff':'color:#0E2438')+'">'+o[1]+'</a>';}).join("")+'</div>';
}

// agent-page.js — 中介个人站（服务端渲染，SEO 友好）
const tax = require("./library-taxonomy");

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function money(n, monthly, lang) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "—";
  const suffix = monthly ? (lang === "bm" ? " /bln" : (lang === "en" ? " /mo" : " /月")) : "";
  return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + suffix;
}
function areaName(code, en) {
  const a = tax.AREAS.filter(function (x) { return x.key === code; })[0];
  return a ? (en ? a.en : a.zh) : (code || "");
}

function card(p, lang) {
  const en = lang === "en";
  const price = p.intent === "rent" ? p.rent_price : p.asking_price;
  const psfTotal = p.price_unit === "psf" && Number(p.land_area) > 0 ? Number(p.asking_price) * Number(p.land_area) : 0;
  const title = (lang === "zh" ? (p.project_title_zh || p.project_title || p.project_name) : (p.project_title || p.project_name)) || "—";
  return '<a class="pcard" href="/p/' + encodeURIComponent(p.code) + '?lang=' + lang + '">' +
    '<div class="pcard-media">' + (p.cover_url ? '<img class="pcard-img" src="' + esc(p.cover_url.replace(/\.jpg$/i, "_t.jpg")) + '" data-full="' + esc(p.cover_url) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : '<div class="ph"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="rgba(226,200,143,.5)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></div>') +
    '<span class="pcard-tag">' + (p.intent === "rent" ? (lang === "bm" ? "Untuk disewa" : (en ? "For rent" : "出租")) : (lang === "bm" ? "Untuk dijual" : (en ? "For sale" : "出售"))) + "</span></div>" +
    '<div class="pcard-body"><div class="pcard-title">' + esc(title) + "</div>" +
    '<div class="pcard-sub">' + esc(areaName(p.area_code, lang !== "zh")) + " · " + esc([p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join("/")) +
    (p.built_up ? " · " + Number(p.built_up).toLocaleString("en-MY") + " sqft" : "") + "</div>" +
    '<div class="pcard-price">' + (psfTotal ? money(psfTotal, false, lang) + ' <small style="color:#94A3B8;font-size:12px">' + money(price, false, lang) + '/psf</small>' : money(price, p.intent === "rent", lang)) + "</div></div></a>";
}

module.exports = function renderAgentPage(agent, listings, opts) {
  opts = opts || {};
  const reviews = opts.reviews || [];
  const lang = opts.lang || (opts.en ? "en" : "zh");
  const en = lang === "en";
  const L = lang === "bm"
    ? { home: "Utama", find: "Kolam Senarai", agents: "Ejen", join: "Untuk Ejen", calc: "Kalkulator", login: "Log Masuk Ejen",
        listings: "Senarai awam", verified: "Ejen disahkan", call: "Telefon", wa: "WhatsApp", share: "Kongsi",
        copy: "Salin pautan", copied: "Pautan disalin", consult: "Tanya ejen", mandate: "Serah hartanah",
        about: "Tentang", areas: "Kawasan diliputi", none: "Belum ada senarai awam.", back: "Kembali ke RoofX",
        statListings: "Senarai awam", statAreas: "Kawasan", statSince: "Di RoofX", license: "REN",
        years: "Tahun pengalaman", deals: "Urus niaga", volume: "Jumlah nilai", reviews: "Ulasan klien",
        reviewNone: "Belum ada ulasan.", mandateTitle: "Serah hartanah anda",
        mName: "Nama", mPhone: "Telefon / WhatsApp", mArea: "Kawasan", mType: "Jenis", mPrice: "Harga jangkaan", mNotes: "Nota", mSend: "Hantar", mOk: "Diterima, ejen akan hubungi anda.", mErr: "Gagal, cuba lagi." }
    : (en
    ? { home: "Home", find: "Listing pool", agents: "Agent profiles", join: "Agent registration", calc: "Calculator", login: "Agent login",
        listings: "Listings", verified: "Verified agent", call: "Call", wa: "WhatsApp", share: "Share",
        copy: "Copy link", copied: "Link copied", consult: "Ask the agent", mandate: "List my property",
        about: "About", areas: "Areas covered", none: "No public listings yet.", back: "Back to RoofX",
        statListings: "Listings", statAreas: "Areas", statSince: "On RoofX", license: "REN",
        years: "Years", deals: "Deals", volume: "Total value", reviews: "Client reviews",
        reviewNone: "No reviews yet.", mandateTitle: "List your property",
        mName: "Name", mPhone: "Phone / WhatsApp", mArea: "Area", mType: "Type", mPrice: "Expected price", mNotes: "Notes", mSend: "Send", mOk: "Received — the agent will contact you.", mErr: "Failed, try again." }
    : { home: "首页", find: "房源池", agents: "找中介", join: "给中介", calc: "计算器", login: "中介登录",
        listings: "在售房源", verified: "已验证中介", call: "打电话", wa: "WhatsApp", share: "分享",
        copy: "复制链接", copied: "链接已复制", consult: "咨询中介", mandate: "业主委托",
        about: "关于", areas: "专长区域", none: "暂时没有公开房源。", back: "返回 RoofX",
        statListings: "公开房源", statAreas: "覆盖区域", statSince: "入驻 RoofX", license: "REN",
        years: "从业年限", deals: "成交宗数", volume: "累计成交额", reviews: "客户评价",
        reviewNone: "还没有评价。", mandateTitle: "业主委托",
        mName: "姓名", mPhone: "电话 / WhatsApp", mArea: "区域", mType: "房型", mPrice: "期望价格", mNotes: "备注", mSend: "提交委托", mOk: "已收到，中介会联系你。", mErr: "提交失败，请重试。" });

  const name = agent.name || "Agent";
  const areas = (agent.areas || []).map(function (a) { return areaName(a, lang !== "zh"); }).filter(Boolean);
  const wa = String(agent.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "60");
  const slug = encodeURIComponent(agent.slug || "");
  const pageUrl = "https://kwongthye.com/a/" + slug;
  const title = esc(name + (agent.ren_no ? " · " + agent.ren_no : "") + " | RoofX");
  const desc = esc((agent.bio || (lang === "bm" ? "Ejen hartanah di RoofX" : (en ? "Property agent on RoofX" : "RoofX 认证房产中介"))) + " — " + (areas.slice(0, 4).join("、") || "Johor"));
  const count = (listings || []).length;

  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateAgent",
    name: name, url: pageUrl, telephone: agent.phone || undefined,
    areaServed: areas.length ? areas : "Johor, Malaysia",
    worksFor: agent.team ? { "@type": "Organization", name: agent.team } : undefined
  };
  const rows = (listings || []).map(function (p) { return card(p, lang); }).join("");
  const waConsult = wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent(lang === "en" ? "Hi " + name + ", I'd like to ask about a property." : (lang === "bm" ? "Hai " + name + ", saya ingin bertanya tentang hartanah." : "你好 " + name + "，我想咨询房产。")) : "";
  const waMandate = wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent(lang === "en" ? "Hi " + name + ", I have a property to list." : (lang === "bm" ? "Hai " + name + ", saya ada hartanah untuk disenaraikan." : "你好 " + name + "，我有产业要委托。")) : "";

  return '<!DOCTYPE html><html lang="' + (lang === "bm" ? "ms" : (en ? "en" : "zh-CN")) + '"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + title + "</title>" +
    '<meta name="description" content="' + desc + '">' +
    '<link rel="canonical" href="' + pageUrl + '">' +
    '<meta property="og:type" content="profile"><meta property="og:title" content="' + title + '">' +
    '<meta property="og:description" content="' + desc + '">' +
    '<meta property="og:url" content="' + pageUrl + '">' +
    (listings && listings[0] && listings[0].cover_url ? '<meta property="og:image" content="https://kwongthye.com' + esc(listings[0].cover_url) + '">' : "") +
    '<link rel="icon" type="image/png" href="/icon-256.png"><link rel="stylesheet" href="/site.css">' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + "</script>" +
    '<style>' +
    ".agentHero{background:linear-gradient(150deg,#0B1F31,#0E2438 60%,#0A1927);color:#fff;padding:50px 0 36px}" +
    ".agentHero .avatar{width:84px;height:84px;border-radius:50%;background:#1E3E5C;display:grid;place-items:center;font:700 28px Georgia,serif;color:#E2C88F;border:2px solid rgba(198,161,91,.5);flex-shrink:0}" +
    ".agentHero h1{font-family:Georgia,serif;font-size:clamp(26px,4vw,40px);margin:0 0 4px}" +
    ".agentHero .meta{color:rgba(255,255,255,.72);font-size:13.5px}" +
    ".agentHero .bio{max-width:760px;color:rgba(255,255,255,.82);margin:16px 0 0;line-height:1.75}" +
    ".agentStats{display:flex;gap:30px;margin-top:22px;flex-wrap:wrap}" +
    ".agentStats b{display:block;font-family:Georgia,serif;font-size:24px;color:#E2C88F}" +
    ".agentStats span{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55)}" +
    ".agentHero .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.agentHero .chip{background:rgba(255,255,255,.08);border:1px solid rgba(198,161,91,.35);border-radius:999px;padding:5px 12px;font-size:12px;color:#E9DFC8}" +
    ".contactRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}" +
    ".agentBody{padding:36px 0 80px}.agentBody h2{font-family:Georgia,serif;color:#0E2438;font-size:22px;margin:0 0 16px}" +
    ".agentGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}" +
    ".shareRow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}" +
    ".shareRow button,.shareRow a{font:600 12px/1 inherit;padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;cursor:pointer;text-decoration:none}" +
    ".waFloat{position:fixed;right:16px;bottom:16px;z-index:60;background:#25D366;color:#fff;border-radius:999px;padding:12px 16px;font-weight:700;text-decoration:none;box-shadow:0 10px 24px rgba(0,0,0,.25);font-size:14px}" +
    "@media(max-width:760px){.agentGrid{grid-template-columns:1fr}.agentHero{padding:34px 0 28px}.agentStats{gap:20px}.waFloat{right:12px;bottom:12px}}" +
    "</style><link rel='stylesheet' href='/fonts.css'><link rel='stylesheet' href='/neo.css'></head><body class='neo'>" +
    '<header class="site-head"><div class="wrap bar">' +
    '<a class="brand" href="/"><img src="/logo-white.png" alt="RoofX"><span>RoofX</span></a>' +
    '<nav class="site-nav"><a href="/properties/">' + L.find + '</a><a href="/agents/">' + L.agents + '</a><a href="/join/">' + L.join + '</a><a href="https://calc.kwongthye.com/">' + L.calc + '</a>' +
    '<a class="login" href="/agent/">' + L.login + "</a></nav>" +
    '<div style="display:flex;gap:6px;margin-left:8px">' +
    ["zh","en","bm"].map(function (k) { return '<a href="?lang=' + k + '" style="font-size:12px;padding:3px 8px;border:1px solid rgba(255,255,255,.25);border-radius:999px;color:' + (k === lang ? "#E2C88F" : "rgba(255,255,255,.7)") + '">' + (k === "zh" ? "中文" : (k === "en" ? "EN" : "BM")) + "</a>"; }).join("") +
    "</div></div></header>" +
    '<section class="agentHero"><div class="wrap">' +
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
    '<div class="avatar">' + (agent.photo_url ? '<img src="' + esc(agent.photo_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc(name.slice(0, 2).toUpperCase())) + "</div>" +
    "<div><h1>" + esc(name) + (agent.verified_at ? ' <span style="font-size:13px;color:#8FD3B4;vertical-align:middle">✓ ' + L.verified + "</span>" : "") + "</h1>" +
    '<div class="meta">' + esc(agent.team || "RoofX") + (agent.ren_no ? " · " + esc(agent.ren_no) : "") + "</div></div></div>" +
    (agent.bio ? '<p class="bio">' + esc(agent.bio) + "</p>" : "") +
    '<div class="agentStats"><div><b>' + count + "</b><span>" + L.statListings + "</span></div>" +
    "<div><b>" + areas.length + "</b><span>" + L.statAreas + "</span></div>" +
    (agent.years_exp ? "<div><b>" + Number(agent.years_exp) + "+</b><span>" + L.years + "</span></div>" : "") +
    (agent.deals_count ? "<div><b>" + Number(agent.deals_count) + "+</b><span>" + L.deals + "</span></div>" : "") +
    (Number(agent.deals_value) > 0 ? "<div><b>RM " + (Number(agent.deals_value) / 1e6).toFixed(1) + "M</b><span>" + L.volume + "</span></div>" : "") +
    '<div><b>' + (agent.verified_at ? "✓" : "—") + "</b><span>" + L.statSince + "</span></div></div>" +
    (areas.length ? '<div class="chips">' + areas.slice(0, 12).map(function (a) { return '<span class="chip">' + esc(a) + "</span>"; }).join("") + "</div>" : "") +
    '<div class="contactRow">' +
    (waConsult ? '<a class="btn gold" href="' + waConsult + '" target="_blank" rel="noopener">' + L.consult + "</a>" : "") +
    (waMandate ? '<a class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="' + waMandate + '" target="_blank" rel="noopener">' + L.mandate + "</a>" : "") +
    (agent.phone ? '<a class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="tel:' + esc(agent.phone) + '">' + L.call + "</a>" : "") +
    "</div>" +
    '<div class="shareRow"><button type="button" id="cp">🔗 ' + L.copy + '</button><a href="https://wa.me/?text=' + encodeURIComponent(name + " · RoofX " + pageUrl) + '" target="_blank" rel="noopener">WhatsApp</a>' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl) + '" target="_blank" rel="noopener">Facebook</a></div>' +
    "</div></section>" +
    '<main class="wrap agentBody">' +
    (agent.bio ? "<h2>" + L.about + "</h2><p style=\"max-width:820px;color:#41505F;line-height:1.8;margin:0 0 30px\">" + esc(agent.bio) + "</p>" : "") +
    "<h2>" + L.listings + " · " + count + "</h2>" +
    (rows ? '<div class="agentGrid">' + rows + "</div>" : '<div class="empty" style="padding:40px;text-align:center;border:1px dashed #DCD6C8;border-radius:14px;color:#5D6B7A">' + L.none + "</div>") +
    (reviews && reviews.length ? "<h2 style=\"margin-top:38px\">" + L.reviews + " · " + reviews.length + "</h2><div style=\"display:grid;grid-template-columns:repeat(2,1fr);gap:14px\">" +
      reviews.slice(0, 6).map(function (r) { return '<div style="border:1px solid #E3E8F0;border-radius:12px;padding:16px;background:#fff"><div style="color:#B8862F;font-size:13px">' + "★".repeat(Math.max(1, Math.min(5, r.rating || 5))) + '</div><p style="margin:8px 0;color:#41505F;line-height:1.7;font-size:13.5px">' + esc(r.body) + '</p><div style="font-size:12px;color:#8A97A6">— ' + esc(r.author) + "</div></div>"; }).join("") + "</div>" : "") +
    '<section id="mandate" style="margin-top:40px;border:1px solid #E3E8F0;border-radius:14px;padding:22px;background:#FAFBFD">' +
    "<h2 style=\"margin:0 0 6px\">" + L.mandateTitle + '</h2>' +
    '<form id="mandateForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">' +
    '<input name="name" required placeholder="' + L.mName + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<input name="phone" required placeholder="' + L.mPhone + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<input name="area_code" placeholder="' + L.mArea + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<input name="property_type" placeholder="' + L.mType + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<input name="asking_price" inputmode="numeric" placeholder="' + L.mPrice + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<input name="notes" placeholder="' + L.mNotes + '" style="padding:10px;border:1px solid #D6DCE7;border-radius:8px">' +
    '<button type="submit" class="btn gold" style="grid-column:1/-1">' + L.mSend + '</button>' +
    '<div id="mMsg" style="grid-column:1/-1;font-size:13px"></div></form></section>' +
    '<p style="margin-top:30px"><a href="/agents/" style="color:#2E5496">← ' + L.back + "</a></p></main>" +
    (waConsult ? '<a class="waFloat" href="' + waConsult + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
    '<script>document.getElementById("cp").addEventListener("click",function(){var t=location.href;if(navigator.clipboard)navigator.clipboard.writeText(t);this.textContent="' + L.copied + '";});' +
    'var f=document.getElementById("mandateForm");if(f){f.addEventListener("submit",function(e){e.preventDefault();var d={};new FormData(f).forEach(function(v,k){d[k]=v});d.agent_slug=' + JSON.stringify(agent.slug || "") + ';d.asking_price=d.asking_price||null;fetch("/api/public/mandate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json()}).then(function(j){var m=document.getElementById("mMsg");m.style.color=j.ok?"#2E7D5B":"#B23B3B";m.textContent=j.ok?' + JSON.stringify(L.mOk) + ':' + JSON.stringify(L.mErr) + ';if(j.ok)f.reset()}).catch(function(){document.getElementById("mMsg").textContent=' + JSON.stringify(L.mErr) + '})})}' +
    '</script>' +
    '<script src="/lang3.js"><\/script>' + langSwitch(lang) + "</body></html>";
};
