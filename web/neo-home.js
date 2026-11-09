(function(){
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.innerWidth < 760;
  var lang = new URLSearchParams(location.search).get("lang") || (function(){try{return localStorage.getItem("kt_lang")}catch(e){return null}})() || "zh";
  if (["zh","en","bm"].indexOf(lang) < 0) lang = "zh";

  /* loader */
  var loader = document.getElementById("neoLoader");
  function hideLoader(){ if(loader && !loader.classList.contains("done")){ loader.classList.add("done"); setTimeout(function(){ loader.style.display="none"; }, 600); } }
  if (reduce) hideLoader(); else setTimeout(hideLoader, 650);
  window.addEventListener("load", function(){ setTimeout(hideLoader, 250); });

  /* mobile nav drawer */
  (function(){
    var mb = document.querySelector(".menu-btn"), nav = document.querySelector(".site-nav");
    if (!mb || !nav) return;
    mb.addEventListener("click", function(e){
      e.preventDefault(); e.stopImmediatePropagation();
      nav.classList.toggle("neoOpen");
      document.body.classList.toggle("nav-open", nav.classList.contains("neoOpen"));
    }, true);
    nav.addEventListener("click", function(e){
      if (e.target.closest("a")) { nav.classList.remove("neoOpen"); document.body.classList.remove("nav-open"); }
    });
  })();

  /* online dot */
  var brand = document.querySelector(".site-head .brand");
  if (brand && !brand.querySelector(".neoOnline")) {
    var dot = document.createElement("span");
    dot.className = "neoOnline"; dot.setAttribute("aria-hidden","true");
    dot.innerHTML = "<i></i> ONLINE";
    brand.appendChild(dot);
  }

  /* nav scroll */
  var head = document.querySelector(".site-head");
  window.addEventListener("scroll", function(){ if(head) head.classList.toggle("scrolled", window.scrollY > 24); }, { passive:true });

  /* particles + mouse glow */
  var hero = document.querySelector(".hero");
  if (hero) {
    var glow = document.createElement("div"); glow.className = "neoGlow"; glow.setAttribute("aria-hidden","true");
    hero.insertBefore(glow, hero.firstChild);
    if (!reduce) {
      hero.addEventListener("mousemove", function(e){
        var r = hero.getBoundingClientRect();
        hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
        hero.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
      });
    }
  }
  var canvas = document.getElementById("neoParticles");
  if (canvas && !reduce && !mobile) {
    var ctx = canvas.getContext("2d"), pts = [], W = 0, H = 0, raf = 0, last = 0;
    function size(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    function init(){ pts = []; var n = Math.min(70, Math.floor(W / 22)); for (var i=0;i<n;i++) pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18,r:Math.random()*1.6+.5,c:Math.random()>.5?"0,229,255":"124,58,237"}); }
    function draw(ts){ if (ts - last < 33) { raf = requestAnimationFrame(draw); return; } last = ts; ctx.clearRect(0,0,W,H);
      for (var i=0;i<pts.length;i++){ var p=pts[i]; p.x+=p.vx; p.y+=p.vy; if(p.x<0||p.x>W)p.vx*=-1; if(p.y<0||p.y>H)p.vy*=-1;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fillStyle="rgba("+p.c+",.55)"; ctx.fill(); }
      raf = requestAnimationFrame(draw);
    }
    size(); init(); raf = requestAnimationFrame(draw);
    window.addEventListener("resize", function(){ size(); init(); });
  }

  /* reveal */
  var els = document.querySelectorAll(".sec, .heroCenter, .hero-stats, .searchbar, .neoMatch, .neoMarquee");
  els.forEach(function(el,i){ el.classList.add("neoReveal"); el.style.transitionDelay = (Math.min(i,4)*100) + "ms"; });
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function(entries){ entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } }); }, { threshold:.12 });
    els.forEach(function(el){ io.observe(el); });
  } else { els.forEach(function(el){ el.classList.add("in"); }); }

  /* stats rings + count-up */
  (function(){
    var defs = document.createElementNS("http://www.w3.org/2000/svg","svg");
    defs.setAttribute("width","0"); defs.setAttribute("height","0"); defs.setAttribute("aria-hidden","true");
    defs.innerHTML = '<defs><linearGradient id="neoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00E5FF"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>';
    document.body.appendChild(defs);
    document.querySelectorAll(".hero-stats > div").forEach(function(box, idx){
      var b = box.querySelector("b"); if (!b) return;
      var target = parseInt(String(b.textContent).replace(/[^0-9]/g,""), 10) || 0;
      var ring = document.createElement("div"); ring.className="neoRing"; ring.setAttribute("aria-hidden","true");
      ring.innerHTML = '<svg viewBox="0 0 46 46"><circle class="track" cx="23" cy="23" r="20"/><circle class="bar" cx="23" cy="23" r="20"/></svg>';
      box.insertBefore(ring, box.firstChild);
      var pct = [0.82,0.66,0.9,0.74][idx] || 0.78;
      var start = null;
      function tick(ts){ if(!start) start=ts; var p=Math.min(1,(ts-start)/1200); var eased = 1-Math.pow(1-p,3);
        b.textContent = Math.round(target*eased).toLocaleString("en-MY");
        ring.querySelector(".bar").style.strokeDashoffset = String(126*(1-pct*eased));
        if(p<1 && !reduce) requestAnimationFrame(tick); else { b.textContent = target.toLocaleString("en-MY"); ring.querySelector(".bar").style.strokeDashoffset = String(126*(1-pct)); }
      }
      if (reduce) { b.textContent = target.toLocaleString("en-MY"); ring.querySelector(".bar").style.strokeDashoffset = String(126*(1-pct)); }
      else {
        var seen=false, obs=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting && !seen){ seen=true; requestAnimationFrame(tick); obs.disconnect(); } }); },{threshold:.4});
        obs.observe(box);
      }
    });
  })();

  /* typewriter (reactive to instant language switch) */
  var typeEl = document.getElementById("neoType");
  if (typeEl) {
    var TYPE_ALL = {
      zh: ["智能匹配中…","实时同步房源池…","连接 Co-Broke 机会…"],
      en: ["Smart matching in progress…","Syncing live listings…","Connecting co-broke opportunities…"],
      bm: ["Padanan pintar sedang berjalan…","Menyegerakkan senarai langsung…","Menghubungkan peluang co-broke…"]
    };
    var typeTimer = null;
    function typeStart(l){
      var phrases = TYPE_ALL[l] || TYPE_ALL.zh;
      clearTimeout(typeTimer);
      typeEl.textContent = phrases[0];
      if (reduce) return;
      var pi = 0, ci = phrases[0].length, del = false;
      function step(){
        var word = phrases[pi];
        typeEl.textContent = word.slice(0, ci);
        var wait;
        if (!del && ci < word.length) { ci++; wait = 55; }
        else if (!del) { del = true; wait = 1300; }
        else if (ci > 0) { ci--; wait = 28; }
        else { del = false; pi = (pi + 1) % phrases.length; wait = 350; }
        typeTimer = setTimeout(step, wait);
      }
      typeTimer = setTimeout(step, 1200);
    }
    typeStart(lang);
    document.addEventListener("kt:lang", function(e){
      var l = (e && e.detail) || (window.KT && window.KT.lang) || "zh";
      var n = (e && e.detail && e.detail.lang) || l;
      if (n && n !== lang) { lang = n; typeStart(n); }
    });
  }

  /* marquee from pool */
  var track = document.getElementById("neoMarqueeTrack");
  function fallbackCards(){
    var A = lang==="zh" ? ["Ulu Tiram","Mount Austin","Bukit Indah","Kulai","Permas Jaya","Iskandar Puteri"] : ["Ulu Tiram","Mount Austin","Bukit Indah","Kulai","Permas Jaya","Iskandar Puteri"];
    return A.map(function(a,i){ return {area:a, code:["R-01","R-02","R-03","R-04","R-05","R-06"][i]}; });
  }
  function cardHTML(x){
    var area = x.area_name || x.area || x.area_code || "Johor";
    var code = x.code || "";
    return '<div class="neoMCard"><div class="ph" aria-hidden="true"></div><b>'+area+'</b><small>'+code+' · '+(lang==="bm"?"Co-Broke tersedia":(lang==="en"?"Co-broke available":"可 Co-Broke"))+'</small><span class="tag">'+(lang==="bm"?"Sedia untuk padanan":(lang==="en"?"Match ready":"智能匹配就绪"))+'</span></div>';
  }
  function renderMarquee(rows){
    if(!track) return;
    var list = rows && rows.length ? rows : fallbackCards();
    var html = list.slice(0,8).map(cardHTML).join("");
    track.innerHTML = html + html;
  }
  if (track) {
    Promise.all([
      fetch("/api/public/config", {cache:"no-store"}).then(function(r){return r.json()}).catch(function(){return {areas:[]}}),
      fetch("/api/public/pool?limit=8", {cache:"no-store"}).then(function(r){return r.json()}).catch(function(){return {rows:[]}})
    ]).then(function(res){
      var map = {};
      (res[0].areas || []).forEach(function(a){ map[a.key] = lang === "zh" ? (a.zh || a.en) : (a.en || a.zh); });
      renderMarquee((res[1].rows || []).map(function(x){ x.area_name = map[x.area_code] || x.area_code || "Johor"; return x; }));
    }).catch(function(){ renderMarquee([]); });
  }
})();
