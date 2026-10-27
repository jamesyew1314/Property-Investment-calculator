/* PropNet · site.js — 共用：中英切换、手机菜单、格式化、房源卡 */
(function () {
  "use strict";
  var LANG_KEY = "kt_lang";
  var lang = localStorage.getItem(LANG_KEY) || "zh";
  var dict = {};
  var tax = { areas: [], property_types: [], tenures: [], furnishings: [], conditions: [], listing_statuses: [] };

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(key) {
    var v = dict[key];
    if (!v) return key;
    return lang === "en" ? v[1] : v[0];
  }
  function apply() {
    $$("[data-i18n]").forEach(function (el) {
      var v = dict[el.getAttribute("data-i18n")];
      if (!v) return;
      var attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, lang === "en" ? v[1] : v[0]);
      else el.innerHTML = lang === "en" ? v[1] : v[0];
    });
    $$("[data-i18n-ph]").forEach(function (el) {
      var v = dict[el.getAttribute("data-i18n-ph")];
      if (v) el.placeholder = lang === "en" ? v[1] : v[0];
    });
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    $$(".lang-toggle").forEach(function (b) { b.textContent = lang === "en" ? "中文" : "EN"; });
    document.dispatchEvent(new CustomEvent("kt:lang", { detail: lang }));
  }
  function setLang(next) {
    lang = next === "en" ? "en" : "zh";
    localStorage.setItem(LANG_KEY, lang);
    apply();
  }
  function toggle() { setLang(lang === "en" ? "zh" : "en"); }

  function money(n, opts) {
    opts = opts || {};
    var v = Number(n);
    if (!isFinite(v) || v === 0) return "—";
    var s = v.toLocaleString("en-MY", { maximumFractionDigits: opts.decimals ? 2 : 0 });
    return (opts.bare ? "" : "RM ") + s;
  }
  function int(n) { var v = Number(n); return isFinite(v) ? v.toLocaleString("en-MY") : "—"; }
  function date(s) { return s ? String(s).slice(0, 10) : "—"; }

  function label(list, key) {
    var arr = tax[list] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].key === key) return lang === "en" ? arr[i].en : arr[i].zh;
    return key || "";
  }
  function stateName(code) {
    var arr = tax.states || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].key === code) return lang === "en" ? arr[i].en : arr[i].zh;
    return code || "";
  }
  function thumbUrl(u) { return /\.jpg$/i.test(u || "") ? u.replace(/\.jpg$/i, "_t.jpg") : u; }
  function areaName(code) {
    var arr = tax.areas || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].key === code) return lang === "en" ? arr[i].en : arr[i].zh;
    return code || "";
  }
  function areaShort(code) {
    var n = areaName(code);
    return lang === "en" ? n : (n.split(" ")[0] || n);
  }

  function listingCard(p) {
    var isRent = p.intent === "rent";
    var price = isRent ? p.rent_price : p.asking_price;
    var title = lang === "en"
      ? (p.project_title || p.project_name || "Listing")
      : (p.project_title_zh || p.project_title || p.project_name || "房源");
    var unit = [p.block, p.unit_no].filter(Boolean).join(" · ");
    var house = '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="rgba(226,200,143,.5)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';
    var meta = [];
    if (p.bedrooms != null || p.bathrooms != null) {
      meta.push([p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join(" / ") + (lang === "en" ? " bd" : " 房"));
    }
    if (p.built_up) meta.push(int(p.built_up) + " sqft");
    if (p.property_type) meta.push(label("property_types", p.property_type));
    return '<a class="pcard" href="/properties/?p=' + encodeURIComponent(p.code) + '">' +
      '<div class="pcard-media">' +
      (p.cover_url ? '<img class="pcard-img" src="' + esc(thumbUrl(p.cover_url)) + '" data-full="' + esc(p.cover_url) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt="" loading="lazy">' : '<div class="ph">' + house + "</div>") +
      '<span class="badge' + (isRent ? " rent" : "") + '">' + (isRent ? (lang === "en" ? "For rent" : "出租") : (lang === "en" ? "For sale" : "出售")) + "</span>" +
      "</div>" +
      '<div class="pcard-body">' +
      '<div class="pcard-title">' + esc(title) + "</div>" +
      (unit ? '<div class="pcard-sub">' + esc(unit) + "</div>" : "") +
      '<div class="pcard-sub">' + esc(areaName(p.area_code)) + "</div>" +
      '<div class="pcard-meta">' + esc(meta.join(" · ")) + "</div>" +
      '<div class="pcard-price">' + esc(money(price)) + (isRent ? ' <small>/ ' + (lang === "en" ? "mo" : "月") + "</small>" : "") + "</div>" +
      '<div class="pcard-agent"><span>' + (lang === "en" ? "Listed by " : "货源：") + "<b>" + esc(p.agent_name || p.agent_raw || "KWONG THYE") + "</b></span>" +
      (p.agent_ren ? "<span>" + esc(p.agent_ren) + "</span>" : "") + "</div>" +
      "</div></a>";
  }

  function skeletonCards(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += '<div class="pcard"><div class="pcard-media skel"></div><div class="pcard-body">' +
        '<div class="skel" style="height:16px;width:70%"></div>' +
        '<div class="skel" style="height:12px;width:50%"></div>' +
        '<div class="skel" style="height:20px;width:40%;margin-top:10px"></div></div></div>';
    }
    return out;
  }

  function fetchJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.ok === false) throw new Error((j && j.error) || "request_failed");
        return j;
      });
    });
  }

  function setFree(on) {
    document.body.classList.toggle("is-free", !!on);
  }

  function init(d) {
    dict = d || {};
    apply();
    var btn = $(".menu-btn");
    var nav = $(".site-nav");
    if (btn && nav) {
      btn.addEventListener("click", function () { nav.classList.toggle("open"); });
      $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("open"); }); });
    }
    $$(".lang-toggle").forEach(function (b) { b.addEventListener("click", toggle); });
  }

  window.KT = {
    init: init, apply: apply, t: t, setLang: setLang, get lang() { return lang; },
    money: money, int: int, date: date, esc: esc, label: label,
    state: stateName, area: areaName, areaShort: areaShort,
    setTax: function (x) { tax = Object.assign({}, tax, x || {}); },
    thumb: thumbUrl, listingCard: listingCard, skeletonCards: skeletonCards, fetchJSON: fetchJSON, setFree: setFree
  };
})();
