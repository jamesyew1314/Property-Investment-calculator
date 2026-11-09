/* RoofX · site.js — 共用：中英切换、手机菜单、格式化、房源卡 */
(function () {
  "use strict";
  var LANG_KEY = "kt_lang";
  var lang = localStorage.getItem(LANG_KEY) || "zh";
  try {
    var _q = new URLSearchParams(location.search).get("lang");
    if (["zh","en","bm"].indexOf(_q) >= 0) { lang = _q; localStorage.setItem(LANG_KEY, lang); localStorage.setItem("kwongthye_lang", lang); }
  } catch (e) {}
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
  function pick(v) {
    if (lang === "bm") return v[2] || (window.BM_MAP || {})[v[1]] || v[1];
    return lang === "en" ? v[1] : v[0];
  }
  function langLabel() { return lang === "zh" ? "EN" : (lang === "en" ? "BM" : "中文"); }
  function apply() {
    $$("[data-i18n]").forEach(function (el) {
      var v = dict[el.getAttribute("data-i18n")];
      if (!v) return;
      var attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, pick(v));
      else el.innerHTML = pick(v);
    });
    $$("[data-i18n-ph]").forEach(function (el) {
      var v = dict[el.getAttribute("data-i18n-ph")];
      if (v) el.placeholder = pick(v);
    });
    document.documentElement.lang = lang === "zh" ? "zh-CN" : (lang === "bm" ? "ms" : "en");
    $$(".lang-toggle, .lang-fab").forEach(function (b) { b.textContent = langLabel(); });
    document.dispatchEvent(new CustomEvent("kt:lang", { detail: lang }));
  }
  function setLang(next) {
    lang = ["zh", "en", "bm"].indexOf(next) >= 0 ? next : "zh";
    localStorage.setItem(LANG_KEY, lang);
    apply();
  }
  function toggle() { setLang(lang === "zh" ? "en" : (lang === "en" ? "bm" : "zh")); }
  window.__pnSetLang = function (l) {
    setLang(l);
    try { localStorage.setItem("kwongthye_lang", l); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u.toString()); } catch (e) {}
  };

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
      (p.cover_url ? '<picture><source type="image/webp" srcset="' + esc(thumbUrl(p.cover_url).replace(/\.jpg$/i, ".webp")) + '"><img class="pcard-img" src="' + esc(thumbUrl(p.cover_url)) + '" data-full="' + esc(p.cover_url) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt="" loading="lazy"></picture>' : '<div class="ph">' + house + "</div>") +
      '<span class="badge' + (isRent ? " rent" : "") + '">' + (isRent ? (lang === "en" ? "For rent" : "出租") : (lang === "en" ? "For sale" : "出售")) + "</span>" +
      "</div>" +
      '<div class="pcard-body">' +
      '<div class="pcard-title">' + esc(title) + "</div>" +
      (unit ? '<div class="pcard-sub">' + esc(unit) + "</div>" : "") +
      '<div class="pcard-sub">' + esc(areaName(p.area_code)) + "</div>" +
      '<div class="pcard-meta">' + esc(meta.join(" · ")) + "</div>" +
      '<div class="pcard-price">' + esc(money(price)) + (isRent ? ' <small>/ ' + (lang === "en" ? "mo" : "月") + "</small>" : "") + "</div>" +
      '<div class="pcard-agent"><span>' + (lang === "en" ? "Listed by " : "货源：") + "<b>" + esc(p.agent_name || p.agent_raw || "RoofX") + "</b></span>" +
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
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", function () {
        var on = nav.classList.toggle("open");
        document.body.classList.toggle("nav-open", on);
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      });
      $$("a", nav).forEach(function (a) {
        a.addEventListener("click", function () {
          nav.classList.remove("open");
          document.body.classList.remove("nav-open");
          btn.setAttribute("aria-expanded", "false");
        });
      });
    }
    $$(".lang-toggle").forEach(function (b) { b.addEventListener("click", toggle); });
    try {
      var TITLES = {
        "/": ["RoofX 柔佛中介货源网络 | The Roof Property Exchange", "RoofX Johor Property Network | The Roof Property Exchange", "Rangkaian Hartanah Johor RoofX | The Roof Property Exchange"],
        "/join": ["加入 RoofX | 中介注册", "Join RoofX | Agent registration", "Sertai RoofX | Pendaftaran ejen"],
        "/about": ["关于 RoofX | 我们为什么为中介做这个平台", "About RoofX | Why we built this", "Tentang RoofX | Mengapa kami bina platform ini"],
        "/agents": ["中介目录 | RoofX", "Agent directory | RoofX", "Direktori ejen | RoofX"],
        "/privacy": ["隐私政策 | RoofX", "Privacy policy | RoofX", "Dasar privasi | RoofX"],
        "/terms": ["使用条款 | RoofX", "Terms of use | RoofX", "Terma penggunaan | RoofX"],
        "/favorites": ["我的收藏 | RoofX", "My saved listings | RoofX", "Senarai simpanan saya | RoofX"]
      };
      var key = location.pathname.replace(/\/$/, "") || "/";
      if (TITLES[key]) document.title = TITLES[key][lang === "zh" ? 0 : (lang === "bm" ? 2 : 1)];
    } catch (e) {}
    if (!document.querySelector(".lang-fab")) {
      var fab = document.createElement("button");
      fab.type = "button"; fab.className = "lang-fab"; fab.textContent = langLabel();
      fab.setAttribute("aria-label", "language");
      fab.addEventListener("click", toggle);
      document.body.appendChild(fab);
    }
  }

  window.KT = {
    init: init, apply: apply, t: t, setLang: setLang, get lang() { return lang; },
    money: money, int: int, date: date, esc: esc, label: label,
    state: stateName, area: areaName, areaShort: areaShort,
    setTax: function (x) { tax = Object.assign({}, tax, x || {}); },
    thumb: thumbUrl, listingCard: listingCard, skeletonCards: skeletonCards, fetchJSON: fetchJSON, setFree: setFree
  };
})();
