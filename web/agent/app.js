/* PropNet /app — 中介工作台（零依赖） */
(function () {
  "use strict";
  var SHOW_PLAN = false; // 套餐/收费 UI：后期上线时改 true
  var S = {
    me: null, stats: null, meta: null, lang: localStorage.getItem("kt_lang") || "zh",
    authMode: "login", route: ""
  };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var STATIC = {
    "tab.login": ["登录", "Sign in"],
    "tab.register": ["免费注册", "Create account"],
    "f.name": ["姓名 *", "Name *"],
    "f.phone": ["电话 / WhatsApp", "Phone / WhatsApp"],
    "f.team": ["团队 / 公司", "Team / company"],
    "f.ren": ["REN 编号", "REN number"],
    "f.email": ["邮箱 *", "Email *"],
    "f.pass": ["密码 *", "Password *"],
    "ph.pass": ["至少 8 位", "At least 8 characters"],
    "auth.note": ["注册后即可发布房源；邮箱验证后显示「已验证」。", "Publish right after signing up; a verified badge appears after email verification."],
    "auth.back": ["返回官网", "Back to site"],
    "magic": ["邮箱一键登录", "Email me a sign-in link"],
    "logout": ["退出", "Log out"]
  };
  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = STATIC[el.getAttribute("data-i18n")];
      if (v) el.textContent = t(v[0], v[1]);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var v = STATIC[el.getAttribute("data-i18n-ph")];
      if (v) el.placeholder = t(v[0], v[1]);
    });
  }

  function t(zh, en) {
    if (S.lang === "bm") return (window.BM_MAP || {})[en] || en;
    return S.lang === "en" ? en : zh;
  }
  function langLabel() { return S.lang === "zh" ? "EN" : (S.lang === "en" ? "BM" : "中文"); }
  function langNow() { return S.lang === "zh" ? "中文" : (S.lang === "en" ? "EN" : "BM"); }
  function paintFloat() { var b = document.getElementById("langFloat"); if (b) b.textContent = langNow(); }
  function cycleLang() {
    S.lang = S.lang === "zh" ? "en" : (S.lang === "en" ? "bm" : "zh");
    localStorage.setItem("kt_lang", S.lang);
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : (S.lang === "bm" ? "ms" : "en");
    applyStatic(); paintFloat();
  }

  function projName(r) {
    if (!r) return "—";
    var zh = r.project_title_zh || r.project_title || r.project_name || "—";
    var en = r.project_title || r.project_name || r.project_title_zh || "—";
    return S.lang === "zh" ? zh : en;
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n, monthly) {
    var v = Number(n);
    if (!isFinite(v) || v === 0) return "—";
    return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + (monthly ? (S.lang === "en" ? " /mo" : (S.lang === "bm" ? " /bln" : " /月")) : "");
  }
  function int(n) { var v = Number(n); return isFinite(v) ? v.toLocaleString("en-MY") : "—"; }
  function dt(s) { return s ? String(s).slice(0, 10) : "—"; }
  function toast(msg, err) {
    var el = document.createElement("div");
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    $("#toast").appendChild(el);
    setTimeout(function () { el.remove(); }, err ? 5000 : 2600);
  }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch("/api/agent" + path, init).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401) { showAuth(); throw new Error("auth_required"); }
        if (!r.ok || j.ok === false) { var e = new Error(j.error || "failed"); e.data = j; throw e; }
        return j;
      });
    });
  }
  function modal(cfg) {
    var root = $("#modal");
    root.className = "on";
    root.innerHTML = '<div class="ovl" data-close></div><div class="dlg"><header><h2>' + esc(cfg.title) +
      '</h2><button class="x" data-close>×</button></header><div class="body">' + cfg.body +
      "</div><footer><div class=\"msg\"></div>" + (cfg.footer || "") + "</footer></div>";
    document.body.style.overflow = "hidden";
    var close = function () { root.className = ""; root.innerHTML = ""; document.body.style.overflow = ""; };
    $$("[data-close]", root).forEach(function (b) { b.addEventListener("click", close); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
    return { root: root, close: close, msg: function (m, ok) { var x = $(".dlg footer .msg", root); if (x) { x.textContent = m || ""; x.className = "msg" + (ok ? " ok" : ""); } } };
  }
  function confirmBox(text, cb) {
    var m = modal({ title: t("确认", "Confirm"), body: '<p style="margin:0">' + esc(text) + "</p>",
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + '</button><button class="btn danger" id="okBtn">' + t("确认", "Confirm") + "</button>" });
    $("#okBtn", m.root).addEventListener("click", function () { m.close(); cb(); });
  }
  function field(label, html) { return '<div class="field"><label>' + esc(label) + "</label>" + html + "</div>"; }
  function areaOptions(sel) {
    var states = (S.meta && S.meta.states) || [], areas = (S.meta && S.meta.areas) || [];
    var g = {};
    areas.forEach(function (a) { (g[a.state || ""] = g[a.state || ""] || []).push(a); });
    var h = '<option value="">' + t("— 选择区域", "— Select area") + "</option>";
    states.forEach(function (st) {
      var items = g[st.key] || [];
      if (!items.length) return;
      h += '<optgroup label="' + esc(S.lang === "en" ? st.en : st.zh) + '">' + items.map(function (a) {
        return '<option value="' + a.key + '"' + (a.key === sel ? " selected" : "") + ">" + esc(S.lang === "en" ? a.en : a.zh) + "</option>";
      }).join("") + "</optgroup>";
    });
    return h;
  }
  function optList(list, sel, blank) {
    var h = blank === false ? "" : '<option value="">' + esc(blank || "—") + "</option>";
    (list || []).forEach(function (x) {
      h += '<option value="' + x.key + '"' + (x.key === sel ? " selected" : "") + ">" + esc(S.lang === "en" ? x.en : x.zh) + "</option>";
    });
    return h;
  }
  function typeList() { return (S.meta && S.meta.property_types) || []; }
  function areaPicker(selected) {
    var chips = (selected || []).map(function (code) {
      return '<span class="chip" data-area-chip="' + code + '">' + esc(areaName(code)) + ' <button type="button" data-rm-area="' + code + '">×</button></span>';
    }).join("");
    return '<div class="areaPick"><div class="chips" data-chips>' + chips + '</div>' +
      '<div class="row"><select data-ap-state>' + optList(stateList(), stateList().length === 1 ? stateList()[0].key : "", t("— 州属", "— State")) + '</select>' +
      '<select data-ap-area><option value="">' + t("— 区域", "— Area") + '</option></select>' +
      '<button type="button" class="btn line sm" data-add-area>' + t("+ 添加", "+ Add") + "</button></div></div>";
  }
  function bindAreaPicker(root) {
    var st = $("[data-ap-state]", root), ar = $("[data-ap-area]", root), add = $("[data-add-area]", root);
    if (!st || !ar) return;
    var fill = function () {
      var list = ((S.meta && S.meta.areas) || []).filter(function (a) { return !st.value || a.state === st.value; });
      ar.innerHTML = '<option value="">' + t("— 区域", "— Area") + "</option>" + list.map(function (a) {
        return '<option value="' + a.key + '">' + esc(S.lang === "en" ? a.en : a.zh) + "</option>";
      }).join("");
    };
    st.addEventListener("change", fill);
    if (stateList().length === 1 && !st.value) st.value = stateList()[0].key;
    fill();
    if (!stateList().length || !((S.meta && S.meta.areas) || []).length) {
      fetch("/api/public/config?t=" + Date.now()).then(function (r) { return r.json(); }).then(function (cfg) {
        S.meta = { states: cfg.states || [], areas: cfg.areas || [], property_types: (cfg.taxonomy || {}).property_types || [], tenures: (cfg.taxonomy || {}).tenures || [] };
        st.innerHTML = optList(stateList(), stateList().length === 1 ? stateList()[0].key : "", t("— 州属", "— State"));
        fill();
      }).catch(function () {});
    }
    fill();
    add.addEventListener("click", function () {
      var code = ar.value; if (!code) return;
      var box = $("[data-chips]", root);
      if ($('[data-area-chip="' + code + '"]', box)) return;
      var span = document.createElement("span");
      span.className = "chip"; span.dataset.areaChip = code;
      span.innerHTML = esc(areaName(code)) + ' <button type="button" data-rm-area="' + code + '">×</button>';
      box.appendChild(span);
      ar.value = "";
    });
  }
  function collectAreas(root) {
    return $$("[data-area-chip]", root).map(function (x) { return x.dataset.areaChip; });
  }
  function stateList() { return (S.meta && S.meta.states) || []; }

  // ---------- 登录 / 注册 ----------
  function showAuth(tab) {
    $("#app").hidden = true; $("#auth").hidden = false;
    setAuthMode(tab || S.authMode);
    var _al = $("#authLang"); if (_al) _al.textContent = langLabel();
  }
  function setAuthMode(mode) {
    applyStatic();
    S.authMode = mode;
    $("#tabLogin").classList.toggle("on", mode === "login");
    $("#tabRegister").classList.toggle("on", mode === "register");
    $("#regFields").hidden = mode !== "register";
    $("#authTitle").textContent = mode === "login" ? t("登录工作台", "Sign in") : t("免费注册", "Create your account");
    $("#authSub").textContent = mode === "login"
      ? t("管理你的房源、客户与带看；发布一次，全团队帮你找买家。", "Manage your listings, clients and viewings. List once — the network helps you sell.")
      : t("免费使用全部功能；注册后即可发布房源。", "Free for now. Publish your listings right after signing up.");
    $("#authBtn").textContent = mode === "login" ? t("登录", "Sign in") : t("免费注册", "Create account");
    $("#authMsg").textContent = "";
    $("#aPass").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  }
  function authError(code) {
    var map = {
      bad_credentials: t("邮箱或密码不正确", "Wrong email or password"),
      email_exists: t("这个邮箱已经注册过，直接登录即可", "This email is already registered — sign in"),
      invalid_input: t("请检查填写的内容", "Please check the form"),
      weak_password: t("密码至少 8 位", "Password must be at least 8 characters"),
      invalid_email: t("邮箱格式不对", "Invalid email"),
      rate_limited: t("尝试次数过多，请稍后再试", "Too many attempts, try later")
    };
    return map[code] || code;
  }
  function submitAuth(e) {
    e.preventDefault();
    var msg = $("#authMsg"); msg.className = "msg";
    var email = $("#aEmail").value.trim();
    var pass = $("#aPass").value;
    var body = { email: email, password: pass };
    if (S.authMode === "register") {
      body.name = $("#rName").value.trim();
      body.phone = $("#rPhone").value.trim();
      body.team = $("#rTeam").value.trim();
      body.ren_no = $("#rRen").value.trim();
      if (!body.name) { msg.textContent = t("请填写姓名", "Name is required"); return; }
    }
    if (!email || !pass) { msg.textContent = t("请填写邮箱和密码", "Email and password are required"); return; }
    $("#authBtn").disabled = true;
    api(S.authMode === "login" ? "/login" : "/register", { method: "POST", body: body })
      .then(function (j) { S.me = j.agent; boot(); })
      .catch(function (err) {
        $("#authBtn").disabled = false;
        var f = err.data && err.data.fields;
        msg.textContent = authError(f ? Object.values(f)[0] : err.message);
      });
  }

  // ---------- 外壳 ----------
  var NAV = [
    { key: "", zh: "概览", en: "Overview", ico: "▦" },
    { key: "listings", zh: "我的房源", en: "My listings", ico: "🏠" },
    { key: "pool", zh: "中心池", en: "Pool", ico: "◈" },
    { key: "clients", zh: "我的客户", en: "Clients", ico: "👤" },
    { key: "matches", zh: "自动匹配", en: "Matches", ico: "⇄" },
    { key: "inquiries", zh: "带看询盘", en: "Inquiries", ico: "✉", badge: true },
    { key: "mandates", zh: "业主委托", en: "Mandates", ico: "🗂" },
    { key: "plan", zh: "套餐", en: "Plan", ico: "◆" },
    { key: "profile", zh: "个人资料", en: "Profile", ico: "⚙" }
  ];
  function renderNav() {
    applyStatic(); paintFloat();
    var r = S.route || "";
    $("#nav").innerHTML = NAV.filter(function (n) { return SHOW_PLAN || n.key !== "plan"; }).map(function (n) {
      var badge = n.badge && S.stats && S.stats.new_inquiries > 0 ? '<span class="n">' + S.stats.new_inquiries + "</span>" : "";
      return '<a href="#/' + n.key + '" class="' + (r === n.key ? "on" : "") + '"><span>' + n.ico + "</span><span>" +
        esc(t(n.zh, n.en)) + "</span>" + badge + "</a>";
    }).join("");
    $("#whoName").textContent = S.me ? S.me.name : "—";
    $("#whoMeta").textContent = S.me ? ((S.me.ren_no || "PropNet") + (S.me.verified ? t(" · ✓已验证", " · ✓ verified") : "")) : "";
    var _lb = $("#langBtn"); if (_lb) _lb.textContent = langLabel();
  }
  function boot() {
    $("#auth").hidden = true; $("#app").hidden = false;
    api("/me").then(function (j) {
      S.me = j.agent; S.stats = j.stats;
      renderNav();
      route();
    }).catch(function () {});
  }
  function setTitle(title, sub) {
    $("#pageTitle").textContent = title;
    $("#pageSub").textContent = sub || "";
    $("#topActs").innerHTML = "";
  }

  // ---------- 路由 ----------
  function parseHash() {
    var raw = (location.hash || "").replace(/^#\/?/, "");
    var q = {};
    var i = raw.indexOf("?");
    if (i >= 0) { new URLSearchParams(raw.slice(i + 1)).forEach(function (v, k) { q[k] = v; }); raw = raw.slice(0, i); }
    return { path: raw, q: q };
  }
  function route() {
    if (!S.me) { showAuth(); return; }
    var p = parseHash();
    if (!SHOW_PLAN && p.path === "plan") { location.hash = "#/"; return; }
    S.route = p.path;
    renderNav();
    closeDrawer();
    $("#view").innerHTML = '<div class="card">' + t("加载中…", "Loading…") + "</div>";
    var fn = ({ "": dash, listings: listings, pool: pool, clients: clients, matches: matches, inquiries: inquiries, mandates: mandates, plan: plan, profile: profile })[p.path];
    if (!fn) { location.hash = "#/"; return; }
    fn(p.q).catch(function (e) { if (e.message !== "auth_required") toast(e.message, true); });
  }

  // ---------- 概览 ----------
  function dash() {
    setTitle(t("概览", "Overview"), t("今天的房源、客户与询盘", "Your listings, clients and inquiries"));
    $("#topActs").innerHTML = '<button class="btn gold sm" data-act="new-listing">+ ' + t("新增房源", "New listing") + "</button>";
    return Promise.all([api("/me"), api("/inquiries?box=in")]).then(function (res) {
      var st = res[0].stats, inq = res[1].rows || [];
      S.stats = st; renderNav();
      var h = '<div class="stats">' +
        '<div class="stat"><b>' + st.listings + "</b><span>" + t("我的房源", "My listings") + "</span></div>" +
        '<div class="stat"><b>' + st.published + "</b><span>" + t("已公开官网", "Public on site") + "</span></div>" +
        '<div class="stat"><b>' + st.clients + "</b><span>" + t("我的客户", "Clients") + "</span></div>" +
        '<div class="stat"><b>' + st.new_inquiries + "</b><span>" + t("待处理询盘", "New inquiries") + "</span></div></div>";
      h += '<div class="card"><h3>' + t("最近询盘", "Latest inquiries") + "</h3>" +
        (inq.length ? '<div class="table" style="border:none"><table class="table"><thead><tr><th>' + t("时间", "When") +
          "</th><th>" + t("房源", "Listing") + "</th><th>" + t("同行", "Agent") + "</th><th>" + t("客户", "Client") +
          "</th><th>" + t("状态", "Status") + "</th></tr></thead><tbody>" +
          inq.slice(0, 8).map(function (i) {
            return "<tr><td class='muted'>" + dt(i.at) + "</td><td class='mono'>" + esc(i.code) + " · " + esc(i.project_title || i.project_name || "") +
              "</td><td>" + esc(i.from_name || "—") + "</td><td>" + esc(i.client_name || "") + "<br><span class='muted'>" + esc(i.client_phone || "") +
              "</span></td><td>" + pill(i.status) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
          : '<p class="muted">' + t("还没有询盘。把房源放进中心池，同行才找得到。", "No inquiries yet. Put listings in the pool so peers can find them.") + "</p>") + "</div>";
      h += '<div class="card"><h3>' + t("快速开始", "Quick start") + "</h3><div style='display:flex;gap:8px;flex-wrap:wrap'>" +
        '<a class="btn dark sm" href="#/listings">' + t("管理房源", "Manage listings") + "</a>" +
        '<a class="btn line sm" href="#/pool">' + t("逛中心池", "Browse pool") + "</a>" +
        '<a class="btn line sm" href="#/matches">' + t("自动匹配", "Matches") + "</a>" +
        '<a class="btn line sm" href="https://calc.kwongthye.com/" target="_blank" rel="noopener">' + t("投资计算器", "Calculator") + "</a></div></div>";
      $("#view").innerHTML = h;
    });
  }
  function statusLabel(k) {
    var m = { available: ["在售/在租", "Available"], reserved: ["已订", "Reserved"], sold: ["已售", "Sold"], rented: ["已租", "Rented"], off_market: ["下架", "Off market"] };
    var v = m[k] || [k, k];
    return t(v[0], v[1]);
  }
  function pill(status) {
    var map = { new: ["blue", "新", "New"], accepted: ["green", "已接受", "Accepted"], declined: ["grey", "已拒绝", "Declined"], done: ["green", "已完成", "Done"],
      available: ["green", "在售/在租", "Available"], reserved: ["amber", "已订", "Reserved"], sold: ["grey", "已售", "Sold"], rented: ["grey", "已租", "Rented"], off_market: ["grey", "下架", "Off market"] };
    var m = map[status] || ["grey", status, status];
    return '<span class="pill ' + m[0] + '">' + esc(t(m[1], m[2])) + "</span>";
  }
  function visPill(v) { return '<span class="pill ' + (v === "public" ? "green" : "grey") + '">' + (v === "public" ? t("官网公开", "Public") : t("仅池内", "Pool only")) + "</span>"; }

  // ---------- 我的房源 ----------
  function listings(q) {
    setTitle(t("我的房源", "My listings"), t("发布、公开到官网、管理询盘", "Publish, expose to the site, track inquiries"));
    $("#topActs").innerHTML = '<button class="btn line sm" data-act="import">' + t("一键导入", "Import") + '</button> <button class="btn gold sm" data-act="new-listing">+ ' + t("新增房源", "New listing") + "</button>";
    var qs = new URLSearchParams(); ["q", "status"].forEach(function (k) { if (q[k]) qs.set(k, q[k]); });
    return api("/listings?" + qs.toString()).then(function (d) {
      var h = '<div class="toolbar"><input id="lq" type="search" placeholder="' + t("搜索编号 / 楼盘", "Search code / project") + '" value="' + esc(q.q || "") + '">' +
        '<select id="lst"><option value="">' + t("全部状态", "All status") + "</option>" +
        ["available", "reserved", "sold", "rented", "off_market"].map(function (s) {
          return '<option value="' + s + '"' + (q.status === s ? " selected" : "") + ">" + esc(statusLabel(s)) + "</option>";
        }).join("") + "</select>" +
        '<span class="count">' + d.total + t(" 条", " listings") + "</span></div>";
      if (!d.rows.length) {
        h += '<div class="empty"><b>' + t("还没有房源", "No listings yet") + "</b>" + t("先发第一条，再勾选公开到官网。", "Publish your first listing, then choose to expose it on the site.") +
          '<div style="margin-top:12px"><button class="btn gold" data-act="new-listing">+ ' + t("新增房源", "New listing") + "</button></div></div>";
        $("#view").innerHTML = h; bindListingToolbar(); return;
      }
      h += '<div class="card" style="padding:0;overflow:auto"><table class="table"><thead><tr><th>' + t("编号", "Code") +
        "</th><th>" + t("房源", "Listing") + "</th><th>" + t("区域", "Area") + "</th><th class='num'>" + t("价格", "Price") +
        "</th><th>" + t("状态", "Status") + "</th><th>" + t("公开", "Visibility") + "</th><th class='num'>" + t("询盘", "Inq.") +
        "</th><th>" + t("操作", "Actions") + "</th></tr></thead><tbody>" +
        d.rows.map(function (r) {
          var price = r.intent === "rent" ? r.rent_price : r.asking_price;
          return '<tr><td class="mono">' + esc(r.code) + "</td><td><b>" + esc(r.project_title || r.project_name || "—") + "</b>" +
            (r.unit_no ? '<span class="muted"> · ' + esc([r.block, r.unit_no].filter(Boolean).join(" ")) + "</span>" : "") +
            "</td><td>" + esc(areaName(r.area_code)) + "</td><td class='num'>" + money(price, r.intent === "rent") + "</td><td>" + pill(r.status) +
            "</td><td>" + visPill(r.visibility) + "</td><td class='num'>" + (r.inquiries || 0) + "</td>" +
            '<td><button class="btn line sm" data-act="edit-listing" data-id="' + r.id + '">' + t("编辑", "Edit") + "</button> " +
            '<button class="btn line sm" data-act="share" data-id="' + r.id + '">' + t("分享到群", "Share") + "</button> " +
            '<button class="btn ' + (r.visibility === "public" ? "line" : "gold") + ' sm" data-act="toggle-publish" data-id="' + r.id + '" data-pub="' + (r.visibility === "public" ? "0" : "1") + '">' +
            (r.visibility === "public" ? t("取消公开", "Unpublish") : t("公开官网", "Publish")) + "</button></td></tr>";
        }).join("") + "</tbody></table></div>";
      $("#view").innerHTML = h;
      bindListingToolbar();
    });
  }
  function bindListingToolbar() {
    var q = $("#lq"), st = $("#lst"), timer;
    if (!q) return;
    var go = function () {
      var p = new URLSearchParams();
      if (q.value.trim()) p.set("q", q.value.trim());
      if (st.value) p.set("status", st.value);
      location.hash = "#/listings" + (p.toString() ? "?" + p.toString() : "");
    };
    q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(go, 350); });
    st.addEventListener("change", go);
  }
  function areaName(code) {
    var a = ((S.meta && S.meta.areas) || []).filter(function (x) { return x.key === code; })[0];
    return a ? (S.lang === "en" ? a.en : a.zh) : (code || "—");
  }
  function photoBlock(row) {
    var photos = row.photos || [];
    return '<div class="phWrap"><div class="phGrid" data-ph-grid>' + photos.map(function (u) {
      return '<span class="phItem"><img src="' + esc(u.replace(/\.jpg$/i, "_t.jpg")) + '" data-full="' + esc(u) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt=""><button type="button" data-rm-ph="' + esc(u) + '">×</button></span>';
    }).join("") + "</div>" +
      (row.id ? '<input type="file" id="phFile" accept="image/jpeg,image/png,image/webp" multiple>'
        : '<p class="muted" style="margin:6px 0 0">' + t("先保存房源，再上传图片。", "Save the listing first, then upload photos.") + "</p>") + "</div>";
  }
  function bindPhotos(m, row) {
    if (!row.id) return;
    var grid = $("[data-ph-grid]", m.root);
    function render(list) {
      grid.innerHTML = (list || []).map(function (u) {
        return '<span class="phItem"><img src="' + esc(u.replace(/\.jpg$/i, "_t.jpg")) + '" data-full="' + esc(u) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt=""><button type="button" data-rm-ph="' + esc(u) + '">×</button></span>';
      }).join("");
    }
    var input = $("#phFile", m.root);
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = "";
      if (!files.length) return;
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 8 * 1024 * 1024) {
            toast(t("只支持 JPG/PNG/WebP，单张 ≤ 8MB", "JPG/PNG/WebP, max 8MB"), true);
            return;
          }
          return fetch("/api/agent/listings/" + row.id + "/photos", {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": f.type }, body: f
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) toast(j.error === "too_many_photos" ? t("最多 12 张", "Max 12 photos") : (j.error || "upload failed"), true);
          });
        });
      });
      chain.then(function () {
        return api("/listings/" + row.id).then(function (j) { row.photos = j.row.photos || []; render(row.photos); setCover(j.row.cover_url); });
      });
    });
    grid.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm-ph]");
      if (!b) return;
      api("/listings/" + row.id + "/photos", { method: "DELETE", body: { url: b.getAttribute("data-rm-ph") } })
        .then(function (j) { row.photos = j.photos || []; render(row.photos); });
    });
    function setCover(u) { var r = row; if (u) r.cover_url = u; }
  }

  function importModal() {
    var m = modal({
      title: t("一键导入房源", "Import a listing"),
      body: '<p class="muted" style="margin:0 0 8px">' + t("把 WhatsApp 群文案或网页上复制的文字粘进来，系统自动识别楼盘、区域、价格、房型、面积、单位。", "Paste WhatsApp text or copied web text; we extract project, area, price, type, size and unit.") + "</p>" +
        '<textarea id="impText" placeholder="' + t("【出售】Sutera Utama 五福城&#10;3房2卫 1150sqft&#10;RM 728,000&#10;A-12-03", "【For sale】Sutera Utama&#10;3 bed 2 bath 1150sqft&#10;RM 728,000&#10;A-12-03") + '" style="width:100%;min-height:160px;padding:10px;border:1px solid #D6DCE7;border-radius:8px;font:13px/1.7 ui-monospace,Menlo,monospace"></textarea>',
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button>" +
        '<button class="btn gold" id="impGo">' + t("识别并填入", "Parse & fill") + "</button>"
    });
    $("#impGo", m.root).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      api("/import/parse", { method: "POST", body: { text: $("#impText", m.root).value } }).then(function (j) {
        m.close();
        listingForm(j.fields, true);
        toast(t("已识别 " + (j.fields.confidence || 0) + " 项，请核对", "Extracted " + (j.fields.confidence || 0) + " fields — please check"));
      }).catch(function (e) { btn.disabled = false; m.msg(e.message === "invalid_input" ? t("请先粘贴内容", "Paste something first") : e.message); });
    });
  }

  function listingForm(row, imported) {
    row = row || {};
    var body = '<form id="lf">' + '<input type="hidden" name="address" value="' + esc(row.address || "") + '">' +
      '<h4 style="margin:4px 0 8px;color:#0E2438">' + t("价格", "Price") + "</h4>" +
      '<div class="grid2 nums">' + field(t("出售 / 出租", "Sale / Rent"), '<select name="intent"><option value="sale"' + (row.intent !== "rent" ? " selected" : "") + ">" + t("出售", "Sale") + '</option><option value="rent"' + (row.intent === "rent" ? " selected" : "") + ">" + t("出租", "Rent") + "</option></select>") +
      field(t("可否议价", "Negotiable"), '<label style="display:flex;gap:8px;align-items:center;padding:9px 0"><input type="checkbox" name="negotiable" value="true"' + (row.negotiable ? " checked" : "") + "> " + t("可议价", "Negotiable") + "</label>") + "</div>" +
      '<div class="grid2 nums">' + field(t("售价 (RM)", "Asking price"), '<input name="asking_price" inputmode="numeric" value="' + esc(row.asking_price || "") + '">') +
      field(t("租金 (RM/月)", "Monthly rent"), '<input name="rent_price" inputmode="numeric" value="' + esc(row.rent_price || "") + '">') + "</div>" +
      '<div class="grid2 nums">' + field(t("价钱单位", "Price unit"), '<select name="price_unit">' + optList([{key:"total",zh:"总价 Total",en:"Total"},{key:"psf",zh:"每平方尺 psf",en:"Per sqft"}], row.price_unit || "total", false) + "</select>") +
      field(t("银行估价 (RM)", "Bank value"), '<input name="bank_value" inputmode="numeric" value="' + esc(row.bank_value || "") + '">') + "</div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin:0 0 10px">' +
      '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="show_psf" value="true"' + (row.show_psf ? " checked" : "") + "> " + t("显示每平方尺价", "Show psf") + "</label>" +
      '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="show_address" value="true"' + (row.show_address ? " checked" : "") + "> " + t("附完整地址", "Show full address") + "</label>" +
      '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="expected_bank_value" value="true"' + (row.expected_bank_value ? " checked" : "") + "> " + t("用银行估价代替售价", "Use bank valuation") + "</label>" +
      "</div>" +
      '<h4 style="margin:4px 0 8px;color:#0E2438">' + t("产业资料", "Property") + "</h4>" +
      '<div class="grid2 nums">' + field(t("卖点标题（选填）", "Headline (optional)"), '<input name="headline" value="' + esc(row.headline || "") + '" placeholder="' + t("例如：低于市价 / Ready move in", "e.g. Below market value") + '">') +
      field(t("区域（用于搜索）", "Area"), '<select name="area_code">' + areaOptions(row.area_code) + "</select>") + "</div>" +
      '<div class="grid2">' + field(t("地点 / 花园名（英文）", "Address / garden (EN)"), '<input name="address_text" value="' + esc(row.address_text || row.project_name || "") + '" placeholder="Jalan Tropika @ Taman Desa Cemerlang">') +
      field(t("中文名（选填）", "Chinese name (optional)"), '<input name="name_zh" value="' + esc(row.name_zh || "") + '" placeholder="' + t("例如：皇后花园", "e.g. 皇后花园") + '">') + "</div>" +
      '<div class="grid2 nums">' + field(t("产业类别", "Category"), '<select name="category">' + optList([{key:"residential",zh:"住宅",en:"Residential"},{key:"commercial",zh:"商业",en:"Commercial"},{key:"industrial",zh:"工业",en:"Industrial"},{key:"land",zh:"地皮",en:"Land"}], row.category, "—") + "</select>") +
      field(t("产业类型", "Type"), '<select name="property_type">' + optList(typeList(), row.property_type, "—") + "</select>") + "</div>" +
      '<h4 style="margin:14px 0 8px;color:#0E2438">' + t("规格", "Specifications") + "</h4>" +
      '<div class="grid2 nums">' + field(t("土地面积（如 22x70）", "Land size (e.g. 22x70)"), '<input name="land_size" value="' + esc(row.land_size || "") + '" placeholder="22x70">') +
      field(t("建筑面积 (sqft)", "Built-up (sqft)"), '<input name="built_up" inputmode="numeric" value="' + esc(row.built_up || "") + '">') + "</div>" +
      '<div class="grid2 nums">' + field(t("房间", "Bedrooms"), '<input name="bedrooms" inputmode="numeric" value="' + esc(row.bedrooms != null ? row.bedrooms : "") + '">') +
      field(t("额外房间", "Extra rooms"), '<input name="extra_rooms" inputmode="numeric" value="' + esc(row.extra_rooms != null ? row.extra_rooms : "") + '">') + "</div>" +
      '<div class="grid2 nums">' + field(t("浴室", "Bathrooms"), '<input name="bathrooms" inputmode="numeric" value="' + esc(row.bathrooms != null ? row.bathrooms : "") + '">') +
      field(t("厕所", "Toilets"), '<input name="toilets" inputmode="numeric" value="' + esc(row.toilets != null ? row.toilets : "") + '">') + "</div>" +
      '<div class="grid2 nums">' + field(t("Lot 位置", "Lot position"), '<select name="lot_position">' + optList([{key:"intermediate",zh:"中间",en:"Intermediate"},{key:"corner",zh:"角头",en:"Corner"},{key:"end",zh:"尾",en:"End"},{key:"side",zh:"旁边",en:"Side"}], row.lot_position, "—") + "</select>") +
      field(t("方向", "Facing"), '<input name="facing" value="' + esc(row.facing || "") + '" placeholder="South">') + "</div>" +
      '<div class="grid2 nums">' + field(t("产权", "Tenure"), '<select name="tenure">' + optList(S.meta ? S.meta.tenures : [], row.tenure, "—") + "</select>") +
      field(t("地契", "Title"), '<select name="title_type">' + optList((S.meta && S.meta.title_types) || [], row.title_type, "—") + "</select>") + "</div>" +
      '<div class="grid2 nums">' + field(t("家私", "Furnishing"), '<select name="furnishing">' + optList([{key:"unfurnished",zh:"空屋",en:"Unfurnished"},{key:"partial",zh:"部分装修",en:"Partially furnished"},{key:"full",zh:"全装修",en:"Fully furnished"}], row.furnishing, "—") + "</select>") +
      field(t("保安", "Security"), '<select name="security">' + optList([{key:"gated",zh:"围篱",en:"Gated"},{key:"guarded",zh:"保安",en:"Guarded"},{key:"none",zh:"无",en:"None"}], row.security, "—") + "</select>") + "</div>" +
      '<div class="grid2 nums">' + field(t("Bumi 状态", "Bumi status"), '<select name="bumi">' + optList([{key:"bumi",zh:"Bumi",en:"Bumi"},{key:"non_bumi",zh:"非 Bumi",en:"Non-Bumi"},{key:"any",zh:"不限",en:"Any"}], row.bumi, "—") + "</select>") +
      field(t("管理费 (RM/月)", "Maintenance fee"), '<input name="maintenance_fee" inputmode="numeric" value="' + esc(row.maintenance_fee || "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("现况", "Condition"), '<select name="condition">' + optList([{key:"vacant",zh:"空置",en:"Vacant"},{key:"occupied",zh:"自住",en:"Occupied"},{key:"tenanted",zh:"出租中",en:"Tenanted"},{key:"renovated",zh:"已装修",en:"Renovated"}], row.condition, "—") + "</select>") + "</div>" +
      '<h4 style="margin:14px 0 8px;color:#0E2438">' + t("装修和卖点", "Renovation & highlights") + "</h4>" +
      '<div class="muted" style="font-size:12px;margin-bottom:6px">' + t("点选有的装修（再点一次取消）", "Tap what the unit has (tap again to remove)") + "</div>" +
      '<div id="renChips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
      [["kitchen_ext","Kitchen Extended 厨房扩建"],["back_ext","Back Extended 后面扩建"],["full_ext","Fully Extended 全扩建"],["awning","Awning 遮阳棚"],["plaster","Plaster Ceiling 石膏天花板"],["autogate","Autogate 自动门"],["grille","Grille 铁花"],["cabinet","Kitchen Cabinet 厨房柜"],["wardrobe","Built-in Wardrobe 嵌入式衣柜"],["aircond","Aircond 冷气"],["heater","Water Heater 热水器"],["solar","Solar Panel 太阳能板"],["tiles","Tiles Upgraded 换新瓷砖"],["bath","Renovated Bathroom 浴室翻新"]].map(function (r) {
        var on = String(row.renovation || "").split(",").indexOf(r[0]) >= 0;
        return '<button type="button" class="chip' + (on ? " on" : "") + '" data-ren="' + r[0] + '" style="border:1px solid #D6DCE7;border-radius:999px;padding:6px 11px;background:' + (on ? "#0E2438" : "#fff") + ';color:' + (on ? "#fff" : "#41505F") + ';font-size:12px;cursor:pointer">' + r[1] + "</button>";
      }).join("") + "</div>" +
      '<input type="hidden" name="renovation" id="renVal" value="' + esc(row.renovation || "") + '">' +
      field(t("其他装修（一行一项）", "Other renovation (one per line)"), '<textarea name="other_renovation">' + esc(row.other_renovation || "") + "</textarea>") +
      field(t("卖点 / 附近设施（一行一项）", "Highlights / nearby (one per line)"), '<textarea name="selling_points">' + esc(row.selling_points || "") + "</textarea>") +
      '<details style="margin:10px 0 4px"><summary style="cursor:pointer;color:#2E5496;font-size:13px">' + t("更多资料（单位、楼层、车位、备注、照片）", "More (unit, floor, carparks, notes, photos)") + "</summary>" +
      '<div class="grid2" style="margin-top:8px">' + field(t("单位号", "Unit"), '<input name="unit_no" value="' + esc(row.unit_no || "") + '">') +
      field(t("座 / Block", "Block"), '<input name="block" value="' + esc(row.block || "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("楼层", "Floor"), '<input name="floor" inputmode="numeric" value="' + esc(row.floor || "") + '">') +
      field(t("车位", "Car parks"), '<input name="carparks" inputmode="numeric" value="' + esc(row.carparks || "") + '">') + "</div>" +
      field(t("公开描述（客户可见）", "Public description"), '<textarea name="description" id="lfDesc">' + esc(row.description || "") + '</textarea><button type="button" class="btn line sm" id="aiBtn" style="margin-top:6px">' + t("AI 生成描述", "Generate with AI") + "</button>") +
      field(t("备注（不公开）", "Notes (private)"), '<textarea name="remarks">' + esc(row.remarks || "") + "</textarea>") +
      field(t("房源图片（最多 12 张）", "Photos (max 12)"), photoBlock(row)) +
      "</details>" +
      '<h4 style="margin:14px 0 8px;color:#0E2438">' + t("预览（可直接修改）", "Preview (editable)") + "</h4>" +
      '<textarea id="sharePreview" style="width:100%;min-height:180px;padding:10px;border:1px solid #D6DCE7;border-radius:8px;font:12.5px/1.7 ui-monospace,Menlo,monospace;background:#FBFCFE"></textarea>' +
      '<button type="button" class="btn line sm" id="prevBtn" style="margin-top:6px">' + t("刷新预览", "Refresh preview") + "</button>" +
      "</form>";
    var m = modal({
      title: row.id ? t("编辑房源", "Edit listing") : (imported ? t("导入预览（可修改）", "Imported — review") : t("新增房源", "New listing")),
      body: body,
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button>" +
        (row.id ? '<button class="btn danger" id="del">' + t("删除", "Delete") + "</button>" : "") +
        '<button class="btn gold" id="save">' + t("保存", "Save") + "</button>"
    });
    bindPhotos(m, row);
    $$("[data-ren]", m.root).forEach(function (b) {
      b.addEventListener("click", function () {
        var v = ($("#renVal", m.root).value || "").split(",").filter(Boolean);
        var k = b.getAttribute("data-ren"), i = v.indexOf(k);
        if (i >= 0) v.splice(i, 1); else v.push(k);
        $("#renVal", m.root).value = v.join(",");
        var on = v.indexOf(k) >= 0;
        b.style.background = on ? "#0E2438" : "#fff";
        b.style.color = on ? "#fff" : "#41505F";
      });
    });
    function currentRow(form) {
      var o = {}; new FormData(form).forEach(function (v, k) { o[k] = v; });
      o.code = (row && row.code) || "PREVIEW"; return o;
    }
    function refreshPreview() {
      var ta = $("#sharePreview", m.root); if (ta) ta.value = shareText(currentRow($("#lf", m.root)));
    }
    var pb = $("#prevBtn", m.root);
    if (pb) pb.addEventListener("click", refreshPreview);
    if (row.id) refreshPreview();
    fetch("/api/public/config?t=" + Date.now()).then(function (r) { return r.json(); }).then(function (cfg) {
      S.meta = { states: cfg.states || [], areas: cfg.areas || [], property_types: (cfg.taxonomy || {}).property_types || [], tenures: (cfg.taxonomy || {}).tenures || [] };
      var sel = document.querySelector('[name="area_code"]');
      if (sel) { var v = sel.value; sel.innerHTML = areaOptions(v || row.area_code || ""); }
    }).catch(function () {});
    var aiBtn = $("#aiBtn", m.root);
    if (aiBtn) aiBtn.addEventListener("click", function () {
      var f = new FormData($("#lf", m.root));
      aiBtn.disabled = true;
      api("/ai/describe", { method: "POST", body: {
        project_name: f.get("project_name"), area_code: f.get("area_code"), property_type: f.get("property_type"),
        bedrooms: Number(f.get("bedrooms")) || null, bathrooms: Number(f.get("bathrooms")) || null,
        built_up: Number(f.get("built_up")) || null, intent: f.get("intent"),
        price: Number(f.get("asking_price") || f.get("rent_price")) || null, lang: S.lang } })
        .then(function (j) { $("#lfDesc", m.root).value = j.text; toast(j.engine === "ai" ? t("已生成", "Generated") : t("已用模板生成（未配置 AI Key）", "Template used (no AI key)")); })
        .catch(function (e) { toast(e.message, true); })
        .then(function () { aiBtn.disabled = false; });
    });
    if (row.id) {
      $("#del", m.root).addEventListener("click", function () {
        confirmBox(t("删除这条房源？", "Delete this listing?"), function () {
          api("/listings/" + row.id, { method: "DELETE" }).then(function () { m.close(); toast(t("已删除", "Deleted")); route(); });
        });
      });
    }
    $("#save", m.root).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      var form = $("#lf", m.root), body = {};
      $$("input,select,textarea", form).forEach(function (el) { if (el.name) body[el.name] = el.value; });
      var p = row.id ? api("/listings/" + row.id, { method: "PATCH", body: body }) : api("/listings", { method: "POST", body: body });
      p.then(function () { m.close(); toast(t("已保存", "Saved")); route(); })
        .catch(function (e) {
          btn.disabled = false;
          m.msg(e.data && e.data.fields ? Object.keys(e.data.fields).map(function (k) { return k + ": " + e.data.fields[k]; }).join(", ") : e.message);
        });
    });
  }

  // ---------- 分享卡（浏览器 canvas 生成 PNG） ----------
  function shareText(row) {
    var rent = row.intent === "rent";
    var price = rent ? row.rent_price : row.asking_price;
    var T = { condo: "Condominium / 公寓", apartment: "Apartment", terrace: "Terrace / 排屋", semi_d: "Semi-D / 半独立", bungalow: "Bungalow / 独立式", townhouse: "Townhouse", shoplot: "Shoplot / 店屋", office: "Office / 办公室", land: "Land / 地皮" };
    var C = { residential: "Residential / 住宅", commercial: "Commercial / 商业", industrial: "Industrial / 工业", land: "Land / 地皮" };
    var wa = String(S.me.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "60");
    var lines = [rent ? "*WTR / For Rent 出租*" : "*WTS / For Sale 出售*"];
    if (row.headline) lines.push("*" + row.headline + "*");
    lines.push("");
    lines.push("*" + (row.address_text || row.project_name || projName(row)) + "*");
    if (row.name_zh) lines.push(row.name_zh);
    lines.push(areaName(row.area_code));
    lines.push(C[row.category] || (row.category || ""));
    lines.push(T[row.property_type] || row.property_type || "");
    if (row.land_size) lines.push("Land " + row.land_size);
    if (row.built_up) lines.push("Built-up " + Number(row.built_up).toLocaleString("en-MY") + " sqft");
    if (row.bedrooms != null) lines.push(row.bedrooms + " bed" + (row.extra_rooms ? " + " + row.extra_rooms : ""));
    if (row.bathrooms != null) lines.push(row.bathrooms + " bath" + (row.toilets ? " / " + row.toilets + " toilet" : ""));
    if (row.lot_position) lines.push(String(row.lot_position).replace(/^\\w/, function (c) { return c.toUpperCase(); }) + " lot");
    if (row.facing) lines.push("Facing " + row.facing);
    if (row.tenure) lines.push(String(row.tenure).replace(/^\\w/, function (c) { return c.toUpperCase(); }));
    if (row.title_type) lines.push(String(row.title_type).replace(/^\\w/, function (c) { return c.toUpperCase(); }));    if (row.bumi && row.bumi !== "any") lines.push("Bumi: " + (row.bumi === "non_bumi" ? "Non-Bumi" : "Bumi"));
    if (row.security) lines.push("Security: " + String(row.security).replace(/^\\w/, function (c) { return c.toUpperCase(); }));
    if (row.maintenance_fee) lines.push("Maintenance RM " + Number(row.maintenance_fee).toLocaleString("en-MY") + "/mo");
    var REN = { kitchen_ext: "Kitchen Extended", back_ext: "Back Extended", full_ext: "Fully Extended", awning: "Awning", plaster: "Plaster Ceiling", autogate: "Autogate", grille: "Grille", cabinet: "Kitchen Cabinet", wardrobe: "Built-in Wardrobe", aircond: "Aircond", heater: "Water Heater", solar: "Solar Panel", tiles: "Tiles Upgraded", bath: "Renovated Bathroom" };
    var ren = String(row.renovation || "").split(",").filter(Boolean);
    if (ren.length) lines.push(ren.map(function (k) { return REN[k] || k; }).join(", "));
    if (row.other_renovation) String(row.other_renovation).split("\\n").filter(Boolean).forEach(function (x) { lines.push(x); });
    if (row.bank_value) lines.push("Bank value RM " + Number(row.bank_value).toLocaleString("en-MY"));
    if (row.show_psf && row.built_up && price) lines.push("RM " + (Number(price) / Number(row.built_up)).toFixed(0) + " psf");
    if (row.selling_points) { lines.push(""); String(row.selling_points).split("\\n").filter(Boolean).forEach(function (x) { lines.push("• " + x); }); }
    lines.push("");
    lines.push("*" + (rent ? "Rental " : "Selling ") + money(price, rent) + "*");
    if (row.negotiable) lines.push("Negotiable");
    lines.push("");
    lines.push("*" + (S.me.team || "PropNet") + "*");
    lines.push("*" + (S.me.name || "") + "*");
    lines.push([S.me.phone, S.me.ren_no].filter(Boolean).join(" · "));
    if (wa) lines.push("www.wasap.my/" + wa + "/" + String(row.code || "").toLowerCase());
    return lines.filter(function (x) { return x !== "" || true; }).join("\n");
  }

  function shareCard(row) {
    var text = shareText(row);
    var m = modal({
      title: t("分享到群", "Share to group"),
      body: '<p class="muted" style="margin:0 0 8px">' + t("复制文案，或直接打开 WhatsApp 选群；图片可先下载再一起发。", "Copy the text or open WhatsApp to pick a group; download the image to attach.") + "</p>" +
        '<textarea id="shareText" readonly style="width:100%;min-height:120px;padding:10px;border:1px solid #D6DCE7;border-radius:8px;font:13px/1.7 ui-monospace,Menlo,monospace;background:#FBFCFE">' + esc(text) + "</textarea>" +
        '<div id="waGroups" style="margin-top:12px"></div>' +
        '<div style="margin:12px 0 6px;font-size:12px;color:var(--muted)">' + t("分享卡（可下载发群）", "Share card (download)") + "</div>" +
        '<canvas id="shareCanvas" width="1080" height="1350" style="width:100%;max-width:360px;border-radius:12px;border:1px solid var(--line)"></canvas>',
      footer: '<button class="btn line" data-close>' + t("关闭", "Close") + "</button>" +
        '<button class="btn line" id="copyText">' + t("复制文案", "Copy text") + "</button>" +
        '<button class="btn gold" id="openWa">' + t("打开 WhatsApp", "Open WhatsApp") + "</button>" +
        '<button class="btn dark" id="dl">' + t("下载图片", "Download image") + "</button>"
    });
    api("/wa-groups").then(function (j) {
      var box = $("#waGroups", m.root); if (!box) return;
      var gs = (j.rows || []).filter(function (g) { return g.enabled; });
      if (!gs.length) {
        box.innerHTML = '<div class="muted" style="font-size:12px">' + t("还没有配置群组。到「个人资料 → WhatsApp 群组」添加群链接。", "No groups yet. Add group links in Profile → WhatsApp groups.") + "</div>";
        return;
      }
      box.innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">' + t("点一个群：自动复制文案并打开群，直接粘贴发送", "Tap a group: text is copied and the group opens — paste and send") + "</div>" +
        gs.map(function (g, i) {
          return '<button type="button" class="btn line sm" data-wa="' + i + '" style="margin:0 6px 6px 0">' + esc(g.label) + " ↗</button>";
        }).join("");
      $$("[data-wa]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var g = gs[Number(b.getAttribute("data-wa"))];
          try { navigator.clipboard.writeText(text); } catch (e) {}
          toast(t("文案已复制，正在打开群", "Text copied — opening group"));
          window.open(g.invite_link, "_blank");
        });
      });
    }).catch(function () {});

    var cv = $("#shareCanvas", m.root), ctx = cv.getContext("2d");
    var W = 1080, H = 1350;
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0B1F31"); g.addColorStop(.55, "#0E2438"); g.addColorStop(1, "#0A1927");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(198,161,91,.55)"; ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    ctx.fillStyle = "#E2C88F"; ctx.font = "600 26px Georgia, serif";
    ctx.fillText("KWONG THYE  ·  PROPNET", 86, 132);
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "20px -apple-system, system-ui";
    ctx.fillText(t("柔佛房源网络", "Johor listings network"), 86, 168);
    ctx.strokeStyle = "rgba(198,161,91,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(86, 200); ctx.lineTo(W - 86, 200); ctx.stroke();

    var title = projName(row);
    ctx.fillStyle = "#fff"; ctx.font = "700 66px Georgia, 'Songti SC', serif";
    var lines = wrapText(ctx, title, W - 172, 2);
    lines.forEach(function (ln, i) { ctx.fillText(ln, 86, 300 + i * 82); });

    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "28px -apple-system, system-ui";
    var sub = [areaName(row.area_code), [row.block, row.unit_no].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    ctx.fillText(sub, 86, 300 + lines.length * 82 + 30);

    var price = row.intent === "rent" ? row.rent_price : row.asking_price;
    ctx.fillStyle = "#E2C88F"; ctx.font = "700 92px Georgia, serif";
    ctx.fillText(money(price, row.intent === "rent"), 80, 300 + lines.length * 82 + 180);

    ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = "30px -apple-system, system-ui";
    var bits = [];
    if (row.bedrooms) bits.push(row.bedrooms + " " + t("房", "beds"));
    if (row.bathrooms) bits.push(row.bathrooms + " " + t("卫", "baths"));
    if (row.built_up) bits.push(int(row.built_up) + " sqft");
    ctx.fillText(bits.join("   ·   "), 86, 300 + lines.length * 82 + 250);

    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.moveTo(86, H - 300); ctx.lineTo(W - 86, H - 300); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "600 36px -apple-system, system-ui";
    ctx.fillText(S.me.name, 86, H - 220);
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "24px -apple-system, system-ui";
    ctx.fillText([S.me.ren_no, S.me.team].filter(Boolean).join(" · "), 86, H - 176);
    ctx.fillStyle = "#E2C88F"; ctx.font = "24px -apple-system, system-ui";
    ctx.fillText("kwongthye.com/properties/?p=" + row.code, 86, H - 124);
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "20px -apple-system, system-ui";
    ctx.fillText(t("资料由货源中介提供，以现场与正式文件为准。", "Information provided by the listing agent."), 86, H - 84);

    function markShared() {
      api("/listings/" + row.id + "/shared", { method: "POST" }).catch(function () {});
    }
    $("#copyText", m.root).addEventListener("click", function () {
      var ta = $("#shareText", m.root); ta.select();
      navigator.clipboard.writeText(ta.value).then(function () { toast(t("已复制文案", "Text copied")); markShared(); })
        .catch(function () { document.execCommand("copy"); toast(t("已复制", "Copied")); markShared(); });
    });
    $("#openWa", m.root).addEventListener("click", function () {
      markShared();
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    });
    $("#dl", m.root).addEventListener("click", function () {
      cv.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "propnet-" + row.code + ".png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        toast(t("已下载", "Downloaded"));
      }, "image/png");
    });
  }
  function wrapText(ctx, text, max, maxLines) {
    var out = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > max && line) { out.push(line); line = text[i]; if (out.length === maxLines - 1) break; }
      else line = test;
    }
    if (line) out.push(line);
    if (out.length === maxLines) {
      var last = out[maxLines - 1];
      if (text.length > out.join("").length) out[maxLines - 1] = last.slice(0, Math.max(0, last.length - 1)) + "…";
    }
    return out;
  }

  // ---------- 中心池 ----------
  function pool(q) {
    setTitle(t("中心池", "Pool"), t("柔佛同行发布的货源；联系对方带客看房", "Listings from agents across Johor"));
    var qs = new URLSearchParams();
    ["q", "state", "area", "type", "intent"].forEach(function (k) { if (q[k]) qs.set(k, q[k]); });
    return api("/pool?" + qs.toString()).then(function (d) {
      var states = stateList();
      var areas = ((S.meta && S.meta.areas) || []).filter(function (a) { return !q.state || a.state === q.state; });
      var h = '<div class="toolbar"><input id="pq" type="search" placeholder="' + t("搜索编号 / 楼盘", "Search code / project") + '" value="' + esc(q.q || "") + '">' +
        '<select id="pst"><option value="">' + t("全部州属", "All states") + "</option>" + states.map(function (s) {
          return '<option value="' + s.key + '"' + (q.state === s.key ? " selected" : "") + ">" + esc(S.lang === "en" ? s.en : s.zh) + "</option>";
        }).join("") + "</select>" +
        '<select id="parea"><option value="">' + t("全部区域", "All areas") + "</option>" + areas.map(function (a) {
          return '<option value="' + a.key + '"' + (q.area === a.key ? " selected" : "") + ">" + esc(S.lang === "en" ? a.en : a.zh) + "</option>";
        }).join("") + "</select>" +
        '<select id="ptype"><option value="">' + t("全部房型", "All types") + "</option>" + typeList().map(function (x) {
          return '<option value="' + x.key + '"' + (q.type === x.key ? " selected" : "") + ">" + esc(S.lang === "en" ? x.en : x.zh) + "</option>";
        }).join("") + "</select>" +
        '<span class="count">' + d.total + t(" 条", " listings") + "</span></div>";
      if (!d.rows.length) {
        h += '<div class="empty"><b>' + t("池里还没有房源", "The pool is empty") + "</b>" + t("等同行发布，或先把自己的房源放进来。", "Wait for peers, or publish your own first.") + "</div>";
      } else {
        h += '<div class="grid3">' + d.rows.map(function (r) {
          var price = r.intent === "rent" ? r.rent_price : r.asking_price;
          var mine = r.tenant_id === S.me.id;
          return '<div class="pcard">' + (r.cover_url ? '<img src="' + esc(r.cover_url) + '" alt="" loading="lazy" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:8px">' : "") + '<div style="display:flex;gap:8px;align-items:center"><span class="mono">' + esc(r.code) + "</span>" +
            (mine ? '<span class="pill grey">' + t("我的", "Mine") + "</span>" : "") + "</div>" +
            '<div class="t">' + esc(projName(r)) + "</div>" +
            '<div class="meta">' + esc(areaName(r.area_code)) + " · " + [r.bedrooms, r.bathrooms].filter(function (x) { return x != null; }).join("/") +
            (r.built_up ? " · " + int(r.built_up) + " sqft" : "") + "</div>" +
            '<div class="price">' + money(price, r.intent === "rent") + "</div>" +
            '<div class="meta">' + t("货源：", "Listed by ") + "<b>" + esc(r.owner_name || r.agent || "—") + "</b>" +
            (r.owner_ren ? " · " + esc(r.owner_ren) : "") + (r.owner_verified ? " ✓" : "") + "</div>" +
            '<div class="foot">' + (mine ? '<span class="muted">' + t("这是你的房源", "Your listing") + "</span>" :
              '<button class="btn gold sm" data-act="inquiry" data-code="' + esc(r.code) + '">' + t("申请带看", "Request viewing") + "</button>" +
              (r.owner_phone ? '<a class="btn line sm" href="tel:' + esc(r.owner_phone) + '">' + esc(r.owner_phone) + "</a>" : "")) + "</div></div>";
        }).join("") + "</div>";
      }
      $("#view").innerHTML = h;
      var timer;
      var go = function () {
        var p = new URLSearchParams();
        if ($("#pq").value.trim()) p.set("q", $("#pq").value.trim());
        if ($("#pst").value) p.set("state", $("#pst").value);
        if ($("#parea").value) p.set("area", $("#parea").value);
        if ($("#ptype").value) p.set("type", $("#ptype").value);
        location.hash = "#/pool" + (p.toString() ? "?" + p.toString() : "");
      };
      $("#pq").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(go, 350); });
      ["pst", "parea", "ptype"].forEach(function (id) { $("#" + id).addEventListener("change", go); });
    });
  }
  function inquiryForm(code) {
    var m = modal({
      title: t("申请带看", "Request viewing") + " · " + code,
      body: '<form id="if"><div class="grid2">' +
        field(t("客户姓名 *", "Client name *"), '<input name="client_name">') +
        field(t("客户电话 *", "Client phone *"), '<input name="client_phone" inputmode="tel">') + "</div>" +
        field(t("留言（选填）", "Message"), '<textarea name="message" placeholder="' + t("带看时间 / 客户情况", "Preferred time / client notes") + '"></textarea>') + "</form>",
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button><button class=\"btn gold\" id=\"send\">" + t("发送申请", "Send") + "</button>"
    });
    $("#send", m.root).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      var body = { property_code: code };
      $$("#if input,#if textarea", m.root).forEach(function (el) { body[el.name] = el.value.trim(); });
      api("/inquiries", { method: "POST", body: body }).then(function () {
        m.close(); toast(t("已发送，等待对方确认", "Sent — waiting for confirmation")); route();
      }).catch(function (e) { btn.disabled = false; m.msg(e.message === "own_listing" ? t("这是你自己的房源", "This is your own listing") : e.message); });
    });
  }

  // ---------- 我的客户 ----------
  function clients(q) {
    setTitle(t("我的客户", "Clients"), t("买家 / 租客需求（只有你看得到）", "Buyer and renter briefs — private to you"));
    $("#topActs").innerHTML = '<button class="btn gold sm" data-act="new-client">+ ' + t("新增客户", "New client") + "</button>";
    var qs = new URLSearchParams(); if (q.q) qs.set("q", q.q);
    return api("/clients?" + qs.toString()).then(function (d) {
      var h = '<div class="toolbar"><input id="cq" type="search" placeholder="' + t("搜索姓名 / 电话", "Search name / phone") + '" value="' + esc(q.q || "") + '">' +
        '<span class="count">' + d.total + t(" 位", " clients") + "</span></div>";
      if (!d.rows.length) {
        h += '<div class="empty"><b>' + t("还没有客户", "No clients yet") + "</b>" + t("把买家需求录进来，之后可以匹配房源。", "Record buyer briefs to match listings.") +
          '<div style="margin-top:12px"><button class="btn gold" data-act="new-client">+ ' + t("新增客户", "New client") + "</button></div></div>";
      } else {
        h += '<div class="card" style="padding:0;overflow:auto"><table class="table"><thead><tr><th>' + t("客户", "Client") + "</th><th>" + t("意向", "Intent") +
          "</th><th class='num'>" + t("预算", "Budget") + "</th><th>" + t("区域", "Area") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("操作", "Actions") + "</th></tr></thead><tbody>" +
          d.rows.map(function (c) {
            return '<tr><td><b>' + esc(c.name) + "</b><br><span class='muted'>" + esc(c.phone || "") + "</span></td><td>" + esc(c.intent || "—") +
              "</td><td class='num'>" + (c.budget_min || c.budget_max ? int(c.budget_min) + " – " + int(c.budget_max) : "—") +
              "</td><td>" + esc((c.area_codes || []).map(areaName).join(", ") || "—") + "</td><td>" + esc(c.status || "—") +
              '</td><td><button class="btn line sm" data-act="edit-client" data-id="' + c.id + '">' + t("编辑", "Edit") + "</button></td></tr>";
          }).join("") + "</tbody></table></div>";
      }
      $("#view").innerHTML = h;
      var timer;
      $("#cq").addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          location.hash = "#/clients" + ($("#cq").value.trim() ? "?q=" + encodeURIComponent($("#cq").value.trim()) : "");
        }, 350);
      });
    });
  }
  function clientForm(row) {
    row = row || {};
    var areaSel = areaPicker(row.area_codes || []);
    var body = '<form id="cf"><div class="grid2">' +
      field(t("姓名 *", "Name *"), '<input name="name" value="' + esc(row.name || "") + '">') +
      field(t("电话", "Phone"), '<input name="phone" value="' + esc(row.phone || "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("买 / 租", "Buy / Rent"), '<select name="intent"><option value="buy"' + (row.intent !== "rent" ? " selected" : "") + '>买房</option><option value="rent"' + (row.intent === "rent" ? " selected" : "") + ">租房</option></select>") +
      field(t("状态", "Status"), '<select name="status">' + optList([{ key: "new", zh: "新客户", en: "New" }, { key: "active", zh: "跟进中", en: "Active" }, { key: "viewing", zh: "看房中", en: "Viewing" }, { key: "offer", zh: "谈价", en: "Offer" }, { key: "won", zh: "已成交", en: "Won" }, { key: "lost", zh: "已流失", en: "Lost" }], row.status || "new", false) + "</select>") + "</div>" +
      '<div class="grid2">' + field(t("预算下限", "Budget min"), '<input name="budget_min" inputmode="numeric" value="' + esc(row.budget_min || "") + '">') +
      field(t("预算上限", "Budget max"), '<input name="budget_max" inputmode="numeric" value="' + esc(row.budget_max || "") + '">') + "</div>" +
      field(t("想看区域（可多选）", "Preferred areas"), areaSel) +
      field(t("备注", "Notes"), '<textarea name="remarks">' + esc(row.remarks || "") + "</textarea>") + "</form>";
    var m = modal({
      title: row.id ? t("编辑客户", "Edit client") : t("新增客户", "New client"),
      body: body,
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button>" +
        (row.id ? '<button class="btn danger" id="cdel">' + t("删除", "Delete") + "</button>" : "") +
        '<button class="btn gold" id="csave">' + t("保存", "Save") + "</button>"
    });
    bindAreaPicker(m.root);
    m.root.addEventListener("click", function (e) {
      var rm = e.target.closest("[data-rm-area]");
      if (rm) { var chip = rm.closest("[data-area-chip]"); if (chip) chip.remove(); }
    });
    if (row.id) $("#cdel", m.root).addEventListener("click", function () {
      confirmBox(t("删除这位客户？", "Delete this client?"), function () {
        api("/clients/" + row.id, { method: "DELETE" }).then(function () { m.close(); route(); });
      });
    });
    $("#csave", m.root).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      var body = {};
      $$("#cf input,#cf select,#cf textarea", m.root).forEach(function (el) {
        if (el.name && el.closest("[data-ap-state],[data-ap-area]") === null) body[el.name] = el.value;
      });
      body.area_codes = collectAreas(m.root);
      var p = row.id ? api("/clients/" + row.id, { method: "PATCH", body: body }) : api("/clients", { method: "POST", body: body });
      p.then(function () { m.close(); toast(t("已保存", "Saved")); route(); })
        .catch(function (e) { btn.disabled = false; m.msg(e.data && e.data.fields ? Object.values(e.data.fields)[0] : e.message); });
    });
  }

  // ---------- 自动匹配 ----------
  function matches() {
    setTitle(t("自动匹配", "Matches"), t("按客户的预算、区域与房型，从中心池自动找房", "Listings from the pool that fit each client's brief"));
    $("#topActs").innerHTML = '<button class="btn line sm" data-act="new-client">+ ' + t("新增客户", "New client") + "</button>";
    return api("/matches").then(function (d) {
      if (!d.clients.length) {
        $("#view").innerHTML = '<div class="empty"><b>' + t("还没有客户", "No clients yet") + "</b>" +
          t("先把买家需求录进来，系统会自动从中心池匹配。", "Add a buyer brief and we will match the pool automatically.") +
          '<div style="margin-top:12px"><button class="btn gold" data-act="new-client">+ ' + t("新增客户", "New client") + "</button></div></div>";
        return;
      }
      var h = "";
      d.clients.forEach(function (row) {
        var c = row.client;
        h += '<div class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<b style="font-size:15px;color:var(--navy)">' + esc(c.name) + "</b>" +
          '<span class="muted">' + esc(c.phone || "") + "</span>" +
          '<span class="pill blue">' + esc(c.intent === "rent" ? t("租房", "Rent") : t("买房", "Buy")) + "</span>" +
          (c.budget_min || c.budget_max ? '<span class="muted">' + int(c.budget_min) + " – " + int(c.budget_max) + "</span>" : "") +
          '<span class="muted">' + esc((c.area_codes || []).map(areaName).join("、") || t("不限区域", "Any area")) + "</span>" +
          '<span style="margin-left:auto" class="muted">' + row.matches.length + t(" 个匹配", " matches") + "</span></div>";
        if (!row.matches.length) {
          h += '<p class="muted" style="margin:10px 0 0">' + t("暂无匹配。可以放宽预算或区域。", "No matches yet. Try widening budget or area.") + "</p>";
        } else {
          h += '<div class="table" style="margin-top:10px"><table class="table"><thead><tr><th>' + t("房源", "Listing") + "</th><th>" + t("区域", "Area") +
            "</th><th class='num'>" + t("价格", "Price") + "</th><th>" + t("货源", "Owner") + "</th><th>" + t("操作", "Action") + "</th></tr></thead><tbody>" +
            row.matches.map(function (m) {
              var price = m.intent === "rent" ? m.rent_price : m.asking_price;
              return "<tr><td><b>" + esc(projName(m)) + "</b> <span class='mono muted'>" + esc(m.code) + "</span></td><td>" +
                esc(areaName(m.area_code)) + "</td><td class='num'>" + money(price, m.intent === "rent") + "</td><td>" + esc(m.owner_name || "—") +
                "</td><td><button class='btn gold sm' data-act='inquiry' data-code='" + esc(m.code) + "'>" + t("申请带看", "Request") + "</button></td></tr>";
            }).join("") + "</tbody></table></div>";
        }
        h += "</div>";
      });
      $("#view").innerHTML = h;
    });
  }

  // ---------- 询盘 ----------
  // ---------- 业主委托 ----------
  function mandates() {
    setTitle(t("业主委托", "Owner mandates"), t("从你的个人站提交的委托线索", "Leads submitted from your personal page"));
    return api("/mandates").then(function (j) {
      var rows = j.rows || [];
      setTimeout(function () {
        document.querySelectorAll("[data-mandate]").forEach(function (sel) {
          sel.addEventListener("change", function () {
            api("/mandates/" + sel.getAttribute("data-mandate"), { method: "PATCH", body: { status: sel.value } })
              .then(function () { toast(t("已更新", "Updated")); }).catch(function (e) { toast(e.message, true); });
          });
        });
      }, 30);
      if (!rows.length) { var h0 = '<div class="card"><div class="empty">' + t("还没有委托。把个人站发给业主，他们提交后会出现在这里。", "No mandates yet. Share your page with owners; submissions appear here.") + "</div></div>"; $("#view").innerHTML = h0; return h0; }
      var h = '<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>' + t("业主", "Owner") + "</th><th>" + t("电话", "Phone") + "</th><th>" + t("区域 / 房型", "Area / type") + "</th><th>" + t("期望价", "Price") + "</th><th>" + t("时间", "When") + "</th><th>" + t("状态", "Status") + "</th></tr></thead><tbody>" +
        rows.map(function (r) {
          return "<tr><td><b>" + esc(r.name) + "</b>" + (r.notes ? '<div class="muted">' + esc(r.notes) + "</div>" : "") + "</td>" +
            "<td>" + esc(r.phone) + "</td><td>" + esc([r.area_code, r.property_type].filter(Boolean).join(" / ")) + "</td>" +
            "<td>" + (r.asking_price ? money(r.asking_price) : "—") + "</td><td>" + dt(r.created_at) + "</td>" +
            '<td><select data-mandate="' + r.id + '">' + ["new", "contacted", "closed"].map(function (k) {
              return '<option value="' + k + '"' + (r.status === k ? " selected" : "") + ">" + t(k === "new" ? "新" : (k === "contacted" ? "已联系" : "已结束"), k === "new" ? "New" : (k === "contacted" ? "Contacted" : "Closed")) + "</option>";
            }).join("") + "</select></td></tr>";
        }).join("") + "</tbody></table></div></div>";
      $("#view").innerHTML = h;
      return h;
    });
  }

  function inquiries(q) {
    setTitle(t("带看询盘", "Inquiries"), t("同行想带客看你的房源", "Peers requesting viewings"));
    var box = q.box === "out" ? "out" : "in";
    return api("/inquiries?box=" + box).then(function (d) {
      var h = '<div class="toolbar"><div class="tabs" style="margin:0">' +
        '<button class="btn ' + (box === "in" ? "dark" : "line") + ' sm" data-box="in">' + t("收到的", "Received") + "</button>" +
        '<button class="btn ' + (box === "out" ? "dark" : "line") + ' sm" data-box="out">' + t("我发出的", "Sent") + "</button></div></div>";
      if (!d.rows.length) {
        h += '<div class="empty"><b>' + t("没有询盘", "No inquiries") + "</b>" + (box === "in"
          ? t("把房源公开到池里，同行才能申请带看。", "Expose listings to the pool so peers can request viewings.")
          : t("去中心池找房源，点「申请带看」。", "Browse the pool and request a viewing.")) + "</div>";
      } else {
        h += '<div class="card" style="padding:0;overflow:auto"><table class="table"><thead><tr><th>' + t("时间", "When") + "</th><th>" + t("房源", "Listing") +
          "</th><th>" + (box === "in" ? t("来自", "From") : t("发给", "To")) + "</th><th>" + t("客户", "Client") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("操作", "Actions") + "</th></tr></thead><tbody>" +
          d.rows.map(function (i) {
            var actions = box === "in" && i.status === "new"
              ? '<button class="btn gold sm" data-act="inq" data-id="' + i.id + '" data-st="accepted">' + t("接受", "Accept") + "</button> " +
                '<button class="btn line sm" data-act="inq" data-id="' + i.id + '" data-st="declined">' + t("拒绝", "Decline") + "</button>"
              : (box === "in" && i.status === "accepted" ? '<button class="btn line sm" data-act="inq" data-id="' + i.id + '" data-st="done">' + t("标记完成", "Mark done") + "</button>" : "—");
            return "<tr><td class='muted'>" + dt(i.at) + "</td><td class='mono'>" + esc(i.code) + " · " + esc(i.project_title || i.project_name || "") +
              "</td><td>" + esc(box === "in" ? (i.from_name || "—") : (i.to_name || "—")) + "</td><td>" + esc(i.client_name || "") +
              "<br><span class='muted'>" + esc(i.client_phone || "") + "</span></td><td>" + pill(i.status) + "</td><td>" + actions + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      }
      $("#view").innerHTML = h;
      $$("[data-box]", $("#view")).forEach(function (b) {
        b.addEventListener("click", function () { location.hash = "#/inquiries" + (b.dataset.box === "out" ? "?box=out" : ""); });
      });
    });
  }

  // ---------- 套餐 ----------
  function plan() {
    setTitle(t("套餐", "Plan"), t("现阶段全部功能免费；收费与支付稍后推出", "Everything is free for now; billing comes later"));
    return api("/plan").then(function (d) {
      var until = d.expires_at ? String(d.expires_at).slice(0, 10) : "—";
      var isFree = !d.plan || d.plan === "free";
      var h = '<div class="card"><h3>' + t("当前套餐", "Current plan") + "</h3>" +
        '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
        '<b style="font-family:Georgia,serif;font-size:30px;color:var(--navy)">' + esc(isFree ? t("免费", "Free") : d.plan.toUpperCase()) + "</b>" +
        '<span class="pill ' + (isFree ? "grey" : "green") + '">' + (isFree ? t("免费开放期", "Free period") : t("已开通", "Active")) + "</span>" +
        '<span class="muted">' + t("到期", "Expires") + "：" + esc(until) + "</span></div>" +
        '<p class="muted" style="margin:10px 0 0">' + t("免费期内所有功能不限制；开始收费前至少提前 30 天通知。", "No limits during the free period. We will give 30 days' notice before charging.") + "</p></div>";

      h += '<div class="card"><h3>' + t("兑换码开通", "Redeem a code") + "</h3>" +
        '<p class="muted" style="margin:0 0 10px">' + t("如果已经通过转账/线下付款，输入我们给你的兑换码即可开通。", "If you paid by transfer, enter the code we sent you.") + "</p>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="codeIn" placeholder="PN-XXXX-XXXX" style="flex:1;min-width:200px;padding:9px 10px;border:1px solid #D6DCE7;border-radius:8px;font:inherit">' +
        '<button class="btn dark" id="redeemBtn">' + t("兑换", "Redeem") + '</button></div><div class="msg" id="redeemMsg"></div></div>';

      h += '<div class="card"><h3>' + t("未来定价", "Future pricing") + "</h3>" +
        '<div class="grid3" style="grid-template-columns:1fr 1fr;gap:12px">' +
        '<div><b style="font-family:Georgia,serif;font-size:22px;color:var(--navy)">RM ' + d.prices.pro + "</b><span class='muted'> /月 · " + t("个人版", "Pro") + "</span></div>" +
        '<div><b style="font-family:Georgia,serif;font-size:22px;color:var(--navy)">RM ' + d.prices.team + "</b><span class='muted'> /月 · " + t("团队 5 席", "Team 5 seats") + "</span></div></div>" +
        '<p style="margin:12px 0 0"><a class="btn line sm" href="/pricing/">' + t("查看完整价格与功能", "See full pricing") + "</a></p></div>";

      $("#view").innerHTML = h;
      $("#redeemBtn").addEventListener("click", function () {
        var btn = this; btn.disabled = true;
        var msg = $("#redeemMsg"); msg.className = "msg";
        api("/redeem", { method: "POST", body: { code: $("#codeIn").value.trim() } })
          .then(function (j) {
            msg.className = "msg ok";
            msg.textContent = t("已开通：" + j.plan + "，有效期至 " + String(j.expires_at).slice(0, 10), "Activated: " + j.plan + " until " + String(j.expires_at).slice(0, 10));
            setTimeout(route, 1200);
          })
          .catch(function (e) {
            btn.disabled = false;
            msg.textContent = e.message === "bad_code" ? t("兑换码无效或已使用", "Invalid or used code") : e.message;
          });
      });
    });
  }

  // ---------- 个人资料 ----------
  function profile() {
    setTitle(t("个人资料", "Profile"), t("这些信息会显示在你的个人页与房源卡片", "Shown on your page and listing cards"));
    var a = S.me || {};
    var areaSel = areaPicker(a.areas || []);
    var h = '<div class="card"><h3>' + t("账号", "Account") + "</h3>" +
      '<div class="grid2">' + field(t("姓名", "Name"), '<input id="pfName" value="' + esc(a.name || "") + '">') +
      field(t("电话 / WhatsApp", "Phone"), '<input id="pfPhone" value="' + esc(a.phone || "") + '">') + "</div>" +
      '<div class="grid3">' +
      field(t("从业年限", "Years in business"), '<input id="pfYears" type="number" min="0" max="60" value="' + (a.years_exp == null ? "" : a.years_exp) + '">') +
      field(t("成交宗数", "Deals closed"), '<input id="pfDeals" type="number" min="0" value="' + (a.deals_count == null ? "" : a.deals_count) + '">') +
      field(t("累计成交额 (RM)", "Total value (RM)"), '<input id="pfValue" type="number" min="0" step="1000" value="' + (a.deals_value == null ? "" : a.deals_value) + '">') + "</div>" +
      field(t("邮件语言", "Email language"), (function () {
        var names = S.lang === "zh" ? { zh: "中文", en: "English", bm: "Bahasa Melayu" }
          : (S.lang === "bm" ? { zh: "Cina", en: "Inggeris", bm: "Bahasa Melayu" } : { zh: "Chinese", en: "English", bm: "Malay" });
        var cur = a.lang || "zh";
        return '<select id="pfLang">' + ["zh", "en", "bm"].map(function (k) {
          return '<option value="' + k + '"' + (cur === k ? " selected" : "") + ">" + names[k] + "</option>";
        }).join("") + "</select>";
      })()) +
      '<div class="grid2">' + field(t("团队 / 公司", "Team"), '<input id="pfTeam" value="' + esc(a.team || "") + '">') +
      field(t("REN 编号", "REN"), '<input id="pfRen" value="' + esc(a.ren_no || "") + '">') + "</div>" +
      field(t("简介", "Bio"), '<textarea id="pfBio">' + esc(a.bio || "") + "</textarea>") +
      field(t("个人页地址", "Your page"), '<div style="display:flex;align-items:center;gap:6px"><span class="muted">kwongthye.com/a/</span><input id="pfSlug" value="' + esc(a.slug || "") + '"></div>') +
      field(t("专长区域（可多选）", "Areas you cover"), areaSel) +
      '<div style="margin-top:6px"><button class="btn gold" id="pfSave">' + t("保存资料", "Save profile") + "</button></div></div>";
    if (a.review_status === "rejected" && a.review_note) {
      h += '<div class="card" style="border-left:3px solid #C6A15B"><h3>' + t("审核未通过", "Review not approved") + "</h3><p style='margin:0'>" + esc(a.review_note) + "</p></div>";
    }
    h += '<div class="card"><h3>' + t("账号安全", "Account security") + "</h3>" +
      '<p class="muted" style="margin:0 0 10px">' + t("当前邮箱：", "Email: ") + esc(a.email || "") + " " + (a.emailVerified ? "✓" : "· " + t("未验证", "unverified")) +
      " · " + t("注册", "Joined") + " " + dt(a.created_at) + (a.last_login_at ? " · " + t("最后登录", "Last login") + " " + dt(a.last_login_at) : "") + "</p>" +
      '<div class="grid2">' +
      field(t("更换邮箱", "New email"), '<input id="acEmail" placeholder="you@example.com">') +
      field(t("当前密码", "Current password"), '<input id="acEmailPw" type="password">') + "</div>" +
      '<button class="btn line" id="acEmailBtn">' + t("更换邮箱（需重新验证）", "Change email (re-verify)") + "</button>" +
      '<div class="hr"></div>' +
      '<div class="grid3">' +
      field(t("当前密码", "Current password"), '<input id="acPw0" type="password">') +
      field(t("新密码", "New password"), '<input id="acPw1" type="password">') +
      field(t("确认新密码", "Confirm"), '<input id="acPw2" type="password">') + "</div>" +
      '<button class="btn dark" id="acPwBtn">' + t("修改密码", "Change password") + "</button></div>";

    h += '<div class="card" style="border-left:3px solid #B23B3B"><h3>' + t("危险区域", "Danger zone") + "</h3>" +
      '<p class="muted" style="margin:0 0 10px">' + t("注销后：房源、客户、询盘、图片与账号全部删除，不可恢复。", "Deleting removes your listings, clients, inquiries, photos and account. This cannot be undone.") + "</p>" +
      '<button class="btn danger" id="acDel">' + t("注销账号", "Delete account") + "</button></div>";

    h += '<div class="card"><h3>' + t("WhatsApp 群组", "WhatsApp groups") + "</h3>" +
      '<p class="muted" style="margin:0 0 10px">' + t("把常发的群链接加进来；分享房源时点一下就能复制文案并打开群。", "Add the groups you post to; sharing a listing copies the text and opens the group.") + "</p>" +
      '<div id="waList" class="muted" style="margin-bottom:10px">' + t("加载中…", "Loading…") + "</div>" +
      '<div class="grid2">' + field(t("备注", "Label"), '<input id="waLabel" placeholder="JB 房源群">') +
      field(t("群链接", "Group link"), '<input id="waLink" placeholder="https://chat.whatsapp.com/...">') + "</div>" +
      '<button class="btn line" id="waAdd">' + t("添加群组", "Add group") + "</button></div>";

    h += '<div class="card"><h3>' + t("邮箱验证", "Email verification") + "</h3>" +
      (a.emailVerified ? '<p class="muted" style="margin:0">' + t("已验证 ✓", "Verified ✓") + "</p>"
        : '<p class="muted" style="margin:0 0 8px">' + t("未验证。验证后房源显示「已验证」标记。", "Not verified. Verified listings show a badge.") +
          '<br><button class="btn line sm" id="resend" style="margin-top:8px">' + t("重新发送验证邮件", "Resend email") + "</button></p>") + "</div>";
    $("#view").innerHTML = h;
    bindAreaPicker($("#view"));
    $("#view").addEventListener("click", function (e) {
      var rm = e.target.closest("[data-rm-area]");
      if (rm) { var chip = rm.closest("[data-area-chip]"); if (chip) chip.remove(); }
    });
    $("#pfSave").addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      var body = {
        name: $("#pfName").value.trim(), phone: $("#pfPhone").value.trim(), team: $("#pfTeam").value.trim(),
        ren_no: $("#pfRen").value.trim(), bio: $("#pfBio").value.trim(), slug: $("#pfSlug").value.trim(), lang: $("#pfLang").value,
        years_exp: $("#pfYears").value === "" ? null : Number($("#pfYears").value),
        deals_count: $("#pfDeals").value === "" ? null : Number($("#pfDeals").value),
        deals_value: $("#pfValue").value === "" ? null : Number($("#pfValue").value),
        areas: collectAreas($("#view"))
      };
      api("/me", { method: "PATCH", body: body }).then(function (j) {
        S.me = j.agent; renderNav(); toast(t("已保存", "Saved")); btn.disabled = false;
      }).catch(function (e) { btn.disabled = false; toast(e.message === "slug_taken" ? t("这个地址已被使用", "Slug taken") : e.message, true); });
    });
    var rs = $("#resend");
    if (rs) rs.addEventListener("click", function () {
      api("/resend-verify", { method: "POST" }).then(function () { toast(t("验证邮件已发送", "Verification email sent")); })
        .catch(function () { toast(t("发送失败，稍后再试", "Failed, try later"), true); });
    });
    $("#acEmailBtn", $("#view")).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      api("/email", { method: "POST", body: { email: $("#acEmail").value.trim(), password: $("#acEmailPw").value } })
        .then(function (j) { toast(t("邮箱已更换，请查收验证邮件", "Email changed — check your inbox")); route(); })
        .catch(function (e) {
          btn.disabled = false;
          toast(e.message === "bad_password" ? t("密码不正确", "Wrong password") : e.message === "email_exists" ? t("邮箱已被使用", "Email already used") : t("邮箱格式不对", "Invalid email"), true);
        });
    });
    $("#acDel", $("#view")).addEventListener("click", function () {
      var m = modal({
        title: t("注销账号", "Delete account"),
        body: '<p style="margin:0 0 10px;color:#B23B3B;font-weight:600">' + t("此操作不可恢复。", "This cannot be undone.") + "</p>" +
          '<p class="muted" style="margin:0 0 10px">' + t("将删除：所有房源（含图片）、客户、询盘、订阅与账号本身；审计日志保留。", "Will delete: all listings (with photos), clients, inquiries, subscriptions and the account; audit logs are kept.") + "</p>" +
          field(t("当前密码", "Current password"), '<input id="delPw" type="password">') +
          field(t("输入「注销」确认", "Type DELETE to confirm"), '<input id="delConfirm" placeholder="' + t("注销", "DELETE") + '">'),
        footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button>" +
          '<button class="btn danger" id="delGo">' + t("确认注销", "Delete forever") + "</button>"
      });
      $("#delGo", m.root).addEventListener("click", function () {
        var btn = this; btn.disabled = true;
        api("/delete", { method: "POST", body: { password: $("#delPw", m.root).value, confirm: $("#delConfirm", m.root).value } })
          .then(function () { m.close(); alert(t("账号已注销", "Account deleted")); location.href = "/"; })
          .catch(function (e) {
            btn.disabled = false;
            m.msg(e.message === "bad_password" ? t("密码不正确", "Wrong password") : e.message === "confirm_required" ? t("请输入「注销」确认", "Type DELETE to confirm") : e.message);
          });
      });
    });

    $("#acPwBtn", $("#view")).addEventListener("click", function () {
      var p0 = $("#acPw0").value, p1 = $("#acPw1").value, p2 = $("#acPw2").value;
      if (p1.length < 8) return toast(t("新密码至少 8 位", "At least 8 characters"), true);
      if (p1 !== p2) return toast(t("两次密码不一致", "Passwords do not match"), true);
      var btn = this; btn.disabled = true;
      api("/password", { method: "POST", body: { current: p0, next: p1 } })
        .then(function () { toast(t("密码已修改", "Password changed")); route(); })
        .catch(function (e) { btn.disabled = false; toast(e.message === "bad_password" ? t("当前密码不正确", "Wrong current password") : e.message, true); });
    });
    function loadWa() {
      api("/wa-groups").then(function (j) {
        var box = $("#waList"); if (!box) return;
        var rows = j.rows || [];
        box.innerHTML = rows.length ? rows.map(function (g) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #EEF1F6">' +
            '<span>' + esc(g.label) + ' <a href="' + esc(g.invite_link) + '" target="_blank" rel="noopener" style="color:#2E5496;font-size:11px">open ↗</a></span>' +
            '<button class="btn danger sm" data-delwa="' + g.id + '">' + t("删除", "Delete") + "</button></div>";
        }).join("") : '<span style="font-size:12px">' + t("还没有群组", "No groups yet") + "</span>";
        box.querySelectorAll("[data-delwa]").forEach(function (b) {
          b.addEventListener("click", function () {
            api("/wa-groups/" + b.getAttribute("data-delwa"), { method: "DELETE" }).then(loadWa);
          });
        });
      });
    }
    loadWa();
    $("#waAdd", $("#view")).addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      api("/wa-groups", { method: "POST", body: { label: $("#waLabel").value.trim(), link: $("#waLink").value.trim() } })
        .then(function () { $("#waLabel").value = ""; $("#waLink").value = ""; loadWa(); toast(t("已添加", "Added")); })
        .catch(function (e) { toast(e.message === "invalid_link" ? t("群链接不正确", "Invalid group link") : e.message, true); })
        .then(function () { btn.disabled = false; });
    });
    return Promise.resolve();
  }

  // ---------- 事件 ----------
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.dataset.act, id = Number(el.dataset.id);
    if (act === "new-listing") listingForm(null);
    if (act === "import") importModal();
    if (act === "edit-listing") api("/listings/" + id).then(function (j) { listingForm(j.row); });
    if (act === "toggle-publish") {
      var pub = el.dataset.pub === "1";
      api("/listings/" + id + "/publish", { method: "POST", body: { public: pub } }).then(function () {
        toast(pub ? t("已公开到官网", "Published to site") : t("已收回，仅池内可见", "Unpublished"));
        route();
        if (pub) api("/listings/" + id).then(function (j) { shareCard(j.row); }).catch(function () {});
      }).catch(function (e) { toast(e.message === "need_price" ? t("先填写价格再公开", "Add a price first") : e.message, true); });
    }
    if (act === "share") api("/listings/" + id).then(function (j) { shareCard(j.row); });
    if (act === "inquiry") inquiryForm(el.dataset.code);
    if (act === "new-client") clientForm(null);
    if (act === "edit-client") {
      api("/clients?pageSize=50").then(function (d) {
        var row = (d.rows || []).filter(function (x) { return x.id === id; })[0];
        if (row) clientForm(row);
      });
    }
    if (act === "inq") {
      api("/inquiries/" + id, { method: "PATCH", body: { status: el.dataset.st } }).then(function () { toast(t("已更新", "Updated")); route(); })
        .catch(function (e) { toast(e.message, true); });
    }
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-href]");
    if (a) location.hash = a.dataset.href;
  });
  window.addEventListener("hashchange", function () { if (S.me) route(); });

  $("#authForm").addEventListener("submit", submitAuth);
  $$("#authTabs button").forEach(function (b) {
    b.addEventListener("click", function () { setAuthMode(b.dataset.mode); });
  });
  if (document.getElementById("langFloat")) $("#langFloat").addEventListener("click", function () {
    cycleLang();
    if (S.me) { renderNav(); route(); } else { setAuthMode(S.authMode); }
  });
  var _authLang = $("#authLang");
  if (_authLang) _authLang.addEventListener("click", function () {
    cycleLang(); _authLang.textContent = langLabel(); setAuthMode(S.authMode);
  });
  var _langBtn2 = $("#langBtn");
  if (_langBtn2) _langBtn2.addEventListener("click", function () {
    cycleLang(); renderNav(); route();
  });
  var _magicBtn = $("#magicBtn");
  if (_magicBtn) _magicBtn.addEventListener("click", function () {
    var email = $("#aEmail").value.trim(), msg = $("#authMsg");
    if (!email) { msg.textContent = t("请先填邮箱", "Enter your email first"); return; }
    _magicBtn.disabled = true;
    api("/magic", { method: "POST", body: { email: email } })
      .then(function () { msg.textContent = t("登录链接已发送，请查收邮箱（20 分钟内有效）", "Sign-in link sent — check your email (valid 20 min)"); })
      .catch(function () { msg.textContent = t("发送失败，请稍后再试", "Failed, try again later"); })
      .then(function () { setTimeout(function () { _magicBtn.disabled = false; }, 8000); });
  });
  $("#logoutBtn").addEventListener("click", function () {
    api("/logout", { method: "POST" }).then(function () { S.me = null; showAuth("login"); }).catch(function () { showAuth("login"); });
  });
  function closeDrawer() {
    $("#side").classList.remove("on");
    var o = $("#drawerOvl");
    if (o) { o.classList.remove("on"); o.hidden = true; }
    document.body.style.overflow = "";
  }
  $("#burger").addEventListener("click", function () {
    var on = $("#side").classList.toggle("on");
    var o = $("#drawerOvl");
    if (o) { o.hidden = !on; o.classList.toggle("on", on); }
    document.body.style.overflow = on ? "hidden" : "";
  });
  var _dovl = $("#drawerOvl");
  if (_dovl) _dovl.addEventListener("click", closeDrawer);
  document.addEventListener("click", function (e) { if (e.target.closest("#side nav a")) closeDrawer(); });

  // ---------- 启动 ----------
  function start() {
    var params = new URLSearchParams(location.search);
    var verify = params.get("verify");
    fetch("/api/public/config?t=" + Date.now()).then(function (r) { return r.json(); }).then(function (cfg) {
      S.meta = { states: cfg.states || [], areas: cfg.areas || [], property_types: cfg.taxonomy.property_types || [], tenures: cfg.taxonomy.tenures || [] };
    }).catch(function () {}).then(function () {
      if (verify) {
        fetch("/api/agent/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: verify }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            history.replaceState(null, "", location.pathname);
            toast(j.ok ? t("邮箱已验证", "Email verified") : t("验证链接无效或已过期", "Invalid or expired link"), !j.ok);
          });
      }
      var _mt = new URLSearchParams(location.search).get("magic");
      if (_mt) {
        api("/magic/verify", { method: "POST", body: { token: _mt } })
          .then(function (j) { S.me = j.agent; try { history.replaceState(null, "", "/agent/"); } catch (e) {} boot(); })
          .catch(function () { $("#authMsg").textContent = t("链接已失效，请重新发送", "Link expired — request a new one"); showAuth("login"); });
        return;
      }
      api("/me").then(function (j) { S.me = j.agent; S.stats = j.stats; boot(); })
        .catch(function () { showAuth("login"); });
    });
  }
  start();
})();
