/* RoofX AI Match Console — home demo, no backend AI */
(function(){
  "use strict";
  var box = document.getElementById("aiConsole");
  if (!box) return;
  var input = document.getElementById("aiInput");
  var runBtn = document.getElementById("aiRun");
  var stream = document.getElementById("aiStream");
  var results = document.getElementById("aiResults");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lang = new URLSearchParams(location.search).get("lang") || (function(){try{return localStorage.getItem("kt_lang")}catch(e){return null}})() || "zh";
  if (["zh","en","bm"].indexOf(lang) < 0) lang = "zh";
  var lastKind = "first";

  var COPY = {
    zh: {
      first: "Mount Austin · RM500k · 3 房",
      invest: "Johor Bahru · RM500k 以下 · 租金回报",
      family: "Mount Austin · 3 房 · 家庭自住",
      steps: ["理解买家需求", "扫描实时房源池", "计算匹配度与 Co-Broke 机会", "找到 3 个可跟进机会"],
      area: "区域", match: "匹配", view: "查看房源"
    },
    en: {
      first: "Mount Austin · RM500k · 3 bed",
      invest: "Johor Bahru · under RM500k · rental yield",
      family: "Mount Austin · 3 bed · family home",
      steps: ["Understanding buyer needs", "Scanning live listing pool", "Scoring matches and co-broke fit", "3 opportunities found"],
      area: "Area", match: "match", view: "View listing"
    },
    bm: {
      first: "Mount Austin · RM500k · 3 bilik",
      invest: "Johor Bahru · bawah RM500k · hasil sewa",
      family: "Mount Austin · 3 bilik · rumah keluarga",
      steps: ["Memahami keperluan pembeli", "Mengimbas kolam senarai langsung", "Menilai padanan dan peluang co-broke", "3 peluang ditemui"],
      area: "Kawasan", match: "padanan", view: "Lihat senarai"
    }
  };
  function C(){ return COPY[lang] || COPY.zh; }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ var v=Number(n)||0; return "RM "+v.toLocaleString("en-MY",{maximumFractionDigits:0}); }

  function renderSteps(i){
    stream.innerHTML = "";
    for (var k = 0; k <= i && k < C().steps.length; k++) {
      var d = document.createElement("div");
      d.className = "s";
      d.style.animationDelay = (k === i ? "0ms" : "0ms");
      d.innerHTML = '<b>0' + (k + 1) + '</b> ' + esc(C().steps[k]);
      stream.appendChild(d);
    }
  }

  function fallback(){
    return [
      { code: "AndyLauProperty-0003", asking_price: 480000, area_code: "permas_jaya", bedrooms: 3 },
      { code: "AndyLauProperty-0002", asking_price: 520000, area_code: "mount_austin", bedrooms: 3 },
      { code: "AndyLauProperty-0031", asking_price: 300000, area_code: "medini", bedrooms: 1 }
    ];
  }

  function pick(rows, kind){
    var list = (rows || []).slice();
    function has(x){ return x && x.code; }
    list = list.filter(has);
    if (kind === "first") {
      var a = list.filter(function(x){ return Number(x.asking_price) > 0 && Number(x.asking_price) <= 600000 && Number(x.bedrooms) >= 3; });
      if (a.length) list = a;
    } else if (kind === "invest") {
      var b = list.filter(function(x){ return Number(x.rent_price) > 0 || Number(x.asking_price) <= 600000; });
      if (b.length) list = b;
    } else {
      var c = list.filter(function(x){ return Number(x.bedrooms) >= 3; });
      if (c.length) list = c;
    }
    return list.slice(0, 3);
  }

  function renderResults(rows, kind){
    var chosen = pick(rows, kind);
    if (!chosen.length) chosen = fallback();
    var scores = [92, 88, 84];
    results.innerHTML = chosen.map(function(x, i){
      var title = x.area_label || x.area_code || "Johor";
      var sub = money(x.asking_price || x.rent_price) + (x.bedrooms ? " · " + x.bedrooms + " bd" : "");
      return '<a class="aiResult" href="/p/' + encodeURIComponent(x.code) + '"><span><b>' + esc(x.code) + '</b><small>' + esc(title) + " · " + esc(sub) + '</small></span><span class="aiScore">' + scores[i] + '%</span></a>';
    }).join("");
  }

  function load(cb){
    Promise.all([
      fetch("/api/public/config", {cache:"no-store"}).then(function(r){return r.json()}).catch(function(){return {areas:[]}}),
      fetch("/api/public/pool?limit=24", {cache:"no-store"}).then(function(r){return r.json()}).catch(function(){return {rows:[]}})
    ]).then(function(res){
      var areas = res[0].areas || [], map = {};
      areas.forEach(function(a){ map[a.key] = lang === "zh" ? (a.zh || a.en) : (a.en || a.zh); });
      var rows = (res[1].rows || []).map(function(x){ x.area_label = map[x.area_code] || x.area_code; return x; });
      cb(rows);
    }).catch(function(){ cb(fallback()); });
  }

  function run(kind){
    lastKind = kind || lastKind;
    input.value = C()[lastKind] || C().first;
    results.innerHTML = "";
    if (reduce) { renderSteps(C().steps.length - 1); load(function(rows){ renderResults(rows, lastKind); }); return; }
    stream.innerHTML = "";
    var i = 0;
    (function tick(){
      renderSteps(i);
      if (i < C().steps.length - 1) { i++; setTimeout(tick, 520); return; }
      load(function(rows){ renderResults(rows, lastKind); });
    })();
  }

  runBtn && runBtn.addEventListener("click", function(){ run(); });
  input && input.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); run(); } });
  box.querySelectorAll("[data-ai]").forEach(function(b){ b.addEventListener("click", function(){ run(b.getAttribute("data-ai")); }); });
  document.addEventListener("kt:lang", function(e){
    var n = (e && e.detail) || (window.KT && window.KT.lang) || lang;
    if (n && n !== lang) { lang = n; run(lastKind); }
  });
})();
