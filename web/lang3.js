/* 全站三语开关：中文 / EN / BM；写入 kt_lang + 兼容旧键，带 ?lang= 重载 */
(function () {
  var KEY = "kt_lang", LEGACY = "kwongthye_lang";
  var q = new URLSearchParams(location.search);
  var lang = q.get("lang") || localStorage.getItem(KEY) || "zh";
  if (q.get("lang")) { try { localStorage.setItem(KEY, lang); localStorage.setItem(LEGACY, lang); } catch (e) {} }
  function css() {
    var s = document.createElement("style");
    s.textContent = "#lang3{position:fixed;top:64px;right:12px;z-index:9999;display:flex;gap:4px;background:#fff;border:1px solid #D6DCE7;border-radius:999px;padding:3px;box-shadow:0 4px 16px rgba(14,36,56,.14)}" +
      "#lang3 button{border:0;background:transparent;font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0E2438;padding:6px 9px;border-radius:999px;cursor:pointer}" +
      "#lang3 button.on{background:#0E2438;color:#fff}" +
      "@media(max-width:760px){#lang3{top:56px;right:8px}}";
    document.head.appendChild(s);
  }
  function render() {
    css();
    var box = document.createElement("div");
    box.id = "lang3";
    [["zh", "中文"], ["en", "EN"], ["bm", "BM"]].forEach(function (x) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = x[1]; b.className = lang === x[0] ? "on" : "";
      b.addEventListener("click", function () {
        try { localStorage.setItem(KEY, x[0]); localStorage.setItem(LEGACY, x[0]); } catch (e) {}
        var u = new URL(location.href); u.searchParams.set("lang", x[0]); location.href = u.toString();
      });
      box.appendChild(b);
    });
    document.body.appendChild(box);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
