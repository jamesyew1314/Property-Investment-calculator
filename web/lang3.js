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
    /* 统一：隐藏各页原有切换，只保留一个固定条，位置永远一致 */
    if (document.querySelector("#lang3")) return;
    document.querySelectorAll(".langs, #l3, .lang-toggle, #langBtn, #langFloat, .lang-fab").forEach(function (el) { el.style.display = "none"; });
    document.querySelectorAll('.site-nav .login, .headActs a[href="/agent/"]').forEach(function (el) { el.style.display = "none"; });
    var s = document.createElement("style");
    s.textContent = "#lang3wrap{position:fixed;top:64px;right:14px;z-index:99999;display:flex;align-items:center;gap:8px}" +
      "#lang3login{padding:8px 12px;border:1px solid #C9B98E;border-radius:999px;background:#0E2438;color:#F3E7C9;font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none;white-space:nowrap;box-shadow:0 6px 20px rgba(14,36,56,.28)}" +
      "#lang3{display:flex;gap:2px;background:#0E2438;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:3px;box-shadow:0 6px 20px rgba(14,36,56,.28)}" +
      "#lang3 button{border:0;background:transparent;color:#D5E0EC;font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:7px 9px;border-radius:999px;cursor:pointer}" +
      "#lang3 button.on{background:#fff;color:#0E2438}" +
      "@media(max-width:760px){#lang3wrap{top:58px;right:8px;gap:6px}#lang3login{padding:7px 9px;font-size:11px}}";
    document.head.appendChild(s);
    var wrap = document.createElement("div");
    wrap.id = "lang3wrap";
    var inWorkspace = location.pathname.indexOf("/agent") === 0;
    if (!inWorkspace) {
      var login = document.createElement("a");
      login.id = "lang3login"; login.href = "/agent/";
      login.textContent = (lang === "en" ? "Agent login" : lang === "bm" ? "Log masuk ejen" : "中介登录");
      wrap.appendChild(login);
    }
    wrap.appendChild(bar());
    if (inWorkspace) { wrap.style.top = "auto"; wrap.style.bottom = "14px"; }
    document.body.appendChild(wrap);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
