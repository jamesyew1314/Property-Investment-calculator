/* 全站固定三语切换条：中文 / EN / BM（所有页面常驻） */
(function () {
  var KEY = "kt_lang", LEGACY = "kwongthye_lang";
  var q = new URLSearchParams(location.search);
  var lang = q.get("lang") || localStorage.getItem(KEY) || "zh";
  if (["zh", "en", "bm"].indexOf(lang) < 0) lang = "zh";
  if (q.get("lang")) { try { localStorage.setItem(KEY, lang); localStorage.setItem(LEGACY, lang); } catch (e) {} }
  function apply(l) {
    try { localStorage.setItem(KEY, l); localStorage.setItem(LEGACY, l); } catch (e) {}
    var u = new URL(location.href); u.searchParams.set("lang", l); location.href = u.toString();
  }
  function bar() {
    var b = document.createElement("div");
    b.id = "lang3";
    b.innerHTML = [["zh", "中文"], ["en", "EN"], ["bm", "BM"]].map(function (x) {
      return '<button type="button" data-l="' + x[0] + '" class="' + (lang === x[0] ? "on" : "") + '">' + x[1] + "</button>";
    }).join("");
    b.addEventListener("click", function (e) {
      var t = e.target.closest("button[data-l]");
      if (t) apply(t.dataset.l);
    });
    return b;
  }
  function init() {
    /* 已有三语控件（房源池 / 详情页）则不重复 */
    if (document.querySelector("#lang3, #l3")) return;
    if (document.querySelector(".langs") && !document.querySelector(".lang-toggle")) return;
    document.querySelectorAll(".lang-toggle, #langBtn, #langFloat, .lang-fab").forEach(function (el) { el.style.display = "none"; });
    var s = document.createElement("style");
    s.textContent = "#lang3{position:fixed;top:64px;right:12px;z-index:99999;display:flex;gap:2px;background:#0E2438;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:3px;box-shadow:0 6px 20px rgba(14,36,56,.28)}" +
      "#lang3 button{border:0;background:transparent;color:#D5E0EC;font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:7px 9px;border-radius:999px;cursor:pointer}" +
      "#lang3 button.on{background:#fff;color:#0E2438}" +
      "@media(max-width:760px){#lang3{top:58px;right:8px}}";
    document.head.appendChild(s);
    document.body.appendChild(bar());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
