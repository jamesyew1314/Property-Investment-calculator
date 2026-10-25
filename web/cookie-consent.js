/*!
 * KWONG THYE — Cookie 偏好中心（全站共用）
 * 用法：<script src="/cookie-consent.js" defer></script>
 * 首次访问显示横幅；点「设置」可分类开关；选择存在 localStorage["kwthye_cookie_prefs"]。
 * 兼容旧值 kwthye_cookie_consent（"all" / "necessary"）。
 * 业务代码判断： window.KWConsent.allows("analytics")
 */
(function () {
  "use strict";
  var KEY = "kwthye_cookie_prefs";
  var OLD_KEY = "kwthye_cookie_consent";
  var VERSION = 1;

  var T = {
    zh: {
      title: "Cookie 偏好",
      body: "必要 Cookie 用于登录与安全，无法关闭。分析 Cookie 帮助我们了解页面使用情况，营销 Cookie 用于广告效果统计。你可以自由选择。",
      need: "仅必要", all: "全部接受", set: "设置", more: "隐私政策",
      mTitle: "Cookie 设置", mSave: "保存选择", mCancel: "取消",
      nec: "必要 Cookie（登录、安全）", necNote: "始终开启",
      ana: "分析 Cookie（页面统计，帮助改进）",
      mkt: "营销 Cookie（广告效果统计）",
      saved: "已保存你的选择", open: "Cookie 设置"
    },
    en: {
      title: "Cookie preferences",
      body: "Essential cookies keep you signed in and secure and cannot be turned off. Analytics cookies help us understand usage; marketing cookies measure ad performance. You choose.",
      need: "Essential only", all: "Accept all", set: "Settings", more: "Privacy Policy",
      mTitle: "Cookie settings", mSave: "Save choices", mCancel: "Cancel",
      nec: "Essential cookies (sign-in, security)", necNote: "Always on",
      ana: "Analytics cookies (page usage, helps us improve)",
      mkt: "Marketing cookies (ad performance)",
      saved: "Your choices were saved", open: "Cookie settings"
    }
  };

  function lang() {
    try {
      var l = localStorage.getItem("kwongthye_lang") || localStorage.getItem("fangchan_lang") || "zh";
      return l === "en" ? "en" : "zh";
    } catch (e) { return "zh"; }
  }
  function t(k) { return (T[lang()] && T[lang()][k]) || T.zh[k] || k; }

  function read() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (p && typeof p === "object" && p.v === VERSION) return p;
    try {
      var old = localStorage.getItem(OLD_KEY);
      if (old === "all") return { v: VERSION, necessary: true, analytics: true, marketing: true, ts: Date.now() };
      if (old === "necessary") return { v: VERSION, necessary: true, analytics: false, marketing: false, ts: Date.now() };
    } catch (e) {}
    return null;
  }
  function write(p) {
    p.v = VERSION; p.necessary = true; p.ts = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    try { localStorage.setItem(OLD_KEY, p.analytics && p.marketing ? "all" : "necessary"); } catch (e) {}
    window.kwthyeConsent = p;
    window.KWConsent.on = p;
    if (p.analytics && typeof window.kwthyeLoadAnalytics === "function") {
      try { window.kwthyeLoadAnalytics(); } catch (e) {}
    }
  }

  var prefs = read();
  window.KWConsent = {
    on: prefs,
    allows: function (kind) { var p = prefs || read(); return !!(p && (kind === "necessary" ? true : p[kind])); },
    open: function () { showBanner(); }
  };
  window.kwthyeConsent = prefs;
  if (prefs && prefs.analytics && typeof window.kwthyeLoadAnalytics === "function") {
    try { window.kwthyeLoadAnalytics(); } catch (e) {}
  }

  var css = document.createElement("style");
  css.textContent =
    "#kwCkBar{position:fixed;left:12px;right:12px;bottom:12px;z-index:70;max-width:900px;margin:0 auto;" +
    "background:#0E2438;color:#fff;border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;" +
    "flex-wrap:wrap;box-shadow:0 10px 30px rgba(14,36,56,.28);font:12.5px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}" +
    "#kwCkBar[hidden]{display:none!important}" +
    "#kwCkBar b{display:block;font-size:13px;color:#E7D3A8;margin-bottom:2px}" +
    "#kwCkBar .kwTx{flex:1 1 340px;min-width:220px}" +
    "#kwCkBar .kwBtns{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    "#kwCkBar button{border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;" +
    "border:1px solid rgba(255,255,255,.45);background:transparent;color:#fff;font-family:inherit}" +
    "#kwCkBar button.kwAll{background:#C6A15B;border-color:#C6A15B;color:#1B2430}" +
    "#kwCkBar a{color:#C9D6E6;font-size:12px;text-decoration:underline}" +
    "#kwCkMask{position:fixed;inset:0;background:rgba(10,20,30,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px}" +
    "#kwCkMask[hidden]{display:none!important}" +
    "#kwCkCard{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:22px;color:#1B2430;" +
    "font:14px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}" +
    "#kwCkCard h3{margin:0 0 12px;font-size:16px;color:#0E2438}" +
    "#kwCkCard label{display:flex;gap:9px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #EEEAE1;font-size:13px;cursor:pointer}" +
    "#kwCkCard label input{margin-top:3px}" +
    "#kwCkCard .kwNote{font-size:11.5px;color:#8A929E;margin-top:10px}" +
    "#kwCkCard .kwRow{display:flex;gap:8px;margin-top:16px}" +
    "#kwCkCard button{border:0;border-radius:999px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}" +
    "#kwCkCard button.kwSave{background:#0E2438;color:#fff}" +
    "#kwCkCard button.kwCancel{background:#fff;color:#0E2438;border:1px solid #DDE3EC}";
  document.head.appendChild(css);

  var bar = document.createElement("div");
  bar.id = "kwCkBar";
  bar.hidden = true;
  bar.innerHTML =
    '<div class="kwTx"><b id="kwCkTitle"></b><span id="kwCkBody"></span></div>' +
    '<div class="kwBtns">' +
    '<a href="/privacy/" id="kwCkMore"></a>' +
    '<button type="button" id="kwCkNeed"></button>' +
    '<button type="button" id="kwCkSet" style="border-color:rgba(255,255,255,.7)"></button>' +
    '<button type="button" class="kwAll" id="kwCkAll"></button>' +
    "</div>";

  var mask = document.createElement("div");
  mask.id = "kwCkMask";
  mask.hidden = true;
  mask.innerHTML =
    '<div id="kwCkCard" role="dialog" aria-modal="true">' +
    '<h3 id="kwCkMTitle"></h3>' +
    '<label style="cursor:default"><input type="checkbox" checked disabled id="kwCNec"><span><b id="kwCNecL"></b><br><span class="kwNote" id="kwCNecN"></span></span></label>' +
    '<label><input type="checkbox" id="kwCAna"><span id="kwCAnaL"></span></label>' +
    '<label><input type="checkbox" id="kwCMkt"><span id="kwCMktL"></span></label>' +
    '<div class="kwRow"><button type="button" class="kwSave" id="kwCSave"></button>' +
    '<button type="button" class="kwCancel" id="kwCCancel"></button></div>' +
    "</div>";

  function text() {
    document.getElementById("kwCkTitle").textContent = t("title");
    document.getElementById("kwCkBody").textContent = t("body");
    document.getElementById("kwCkMore").textContent = t("more");
    document.getElementById("kwCkNeed").textContent = t("need");
    document.getElementById("kwCkSet").textContent = t("set");
    document.getElementById("kwCkAll").textContent = t("all");
    document.getElementById("kwCkMTitle").textContent = t("mTitle");
    document.getElementById("kwCNecL").textContent = t("nec");
    document.getElementById("kwCNecN").textContent = t("necNote");
    document.getElementById("kwCAnaL").textContent = t("ana");
    document.getElementById("kwCMktL").textContent = t("mkt");
    document.getElementById("kwCSave").textContent = t("mSave");
    document.getElementById("kwCCancel").textContent = t("mCancel");
  }

  function showBanner() {
    text();
    var p = prefs || read();
    document.getElementById("kwCAna").checked = !!(p && p.analytics);
    document.getElementById("kwCMkt").checked = !!(p && p.marketing);
    bar.hidden = false;
  }

  function mount() {
    document.body.appendChild(bar);
    document.body.appendChild(mask);

    document.getElementById("kwCkNeed").onclick = function () {
      prefs = { necessary: true, analytics: false, marketing: false };
      write(prefs); bar.hidden = true;
    };
    document.getElementById("kwCkAll").onclick = function () {
      prefs = { necessary: true, analytics: true, marketing: true };
      write(prefs); bar.hidden = true;
    };
    document.getElementById("kwCkSet").onclick = function () { showBanner(); mask.hidden = false; };
    document.getElementById("kwCCancel").onclick = function () { mask.hidden = true; };
    document.getElementById("kwCSave").onclick = function () {
      prefs = {
        necessary: true,
        analytics: document.getElementById("kwCAna").checked,
        marketing: document.getElementById("kwCMkt").checked
      };
      write(prefs); mask.hidden = true; bar.hidden = true;
    };

    var opener = document.getElementById("ckOpen");
    if (opener) {
      opener.addEventListener("click", function (e) { e.preventDefault(); showBanner(); });
    }

    if (!read()) showBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
