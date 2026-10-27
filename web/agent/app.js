/* PropNet /app — 中介工作台（零依赖） */
(function () {
  "use strict";
  var S = {
    me: null, stats: null, meta: null, lang: localStorage.getItem("kt_lang") || "zh",
    authMode: "login", route: ""
  };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function t(zh, en) { return S.lang === "en" ? en : zh; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n, monthly) {
    var v = Number(n);
    if (!isFinite(v) || v === 0) return "—";
    return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + (monthly ? (S.lang === "en" ? " /mo" : " /月") : "");
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
      footer: '<button class="btn line" data-close>取消</button><button class="btn danger" id="okBtn">确认</button>' });
    $("#okBtn", m.root).addEventListener("click", function () { m.close(); cb(); });
  }
  function field(label, html) { return '<div class="field"><label>' + esc(label) + "</label>" + html + "</div>"; }
  function areaOptions(sel) {
    var states = (S.meta && S.meta.states) || [], areas = (S.meta && S.meta.areas) || [];
    var g = {};
    areas.forEach(function (a) { (g[a.state || ""] = g[a.state || ""] || []).push(a); });
    var h = '<option value="">— 选择区域</option>';
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
      '<div class="row"><select data-ap-state>' + optList(stateList(), "", "— 州属") + '</select>' +
      '<select data-ap-area><option value="">— 区域</option></select>' +
      '<button type="button" class="btn line sm" data-add-area>+ 添加</button></div></div>';
  }
  function bindAreaPicker(root) {
    var st = $("[data-ap-state]", root), ar = $("[data-ap-area]", root), add = $("[data-add-area]", root);
    if (!st || !ar) return;
    var fill = function () {
      var list = ((S.meta && S.meta.areas) || []).filter(function (a) { return !st.value || a.state === st.value; });
      ar.innerHTML = '<option value="">— 区域</option>' + list.map(function (a) {
        return '<option value="' + a.key + '">' + esc(S.lang === "en" ? a.en : a.zh) + "</option>";
      }).join("");
    };
    st.addEventListener("change", fill);
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
    $("#authLang").textContent = S.lang === "en" ? "中文" : "EN";
  }
  function setAuthMode(mode) {
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
    { key: "plan", zh: "套餐", en: "Plan", ico: "◆" },
    { key: "profile", zh: "个人资料", en: "Profile", ico: "⚙" }
  ];
  function renderNav() {
    var r = S.route || "";
    $("#nav").innerHTML = NAV.map(function (n) {
      var badge = n.badge && S.stats && S.stats.new_inquiries > 0 ? '<span class="n">' + S.stats.new_inquiries + "</span>" : "";
      return '<a href="#/' + n.key + '" class="' + (r === n.key ? "on" : "") + '"><span>' + n.ico + "</span><span>" +
        esc(t(n.zh, n.en)) + "</span>" + badge + "</a>";
    }).join("");
    $("#whoName").textContent = S.me ? S.me.name : "—";
    $("#whoMeta").textContent = S.me ? ((S.me.ren_no || "PropNet") + (S.me.verified ? " · ✓已验证" : "")) : "";
    $("#langBtn").textContent = S.lang === "en" ? "中文" : "EN";
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
    S.route = p.path;
    renderNav();
    $("#view").innerHTML = '<div class="card">' + t("加载中…", "Loading…") + "</div>";
    var fn = ({ "": dash, listings: listings, pool: pool, clients: clients, matches: matches, inquiries: inquiries, plan: plan, profile: profile })[p.path];
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
  function pill(status) {
    var map = { new: ["blue", "新"], accepted: ["green", "已接受"], declined: ["grey", "已拒绝"], done: ["green", "已完成"],
      available: ["green", "在售/在租"], reserved: ["amber", "已订"], sold: ["grey", "已售"], rented: ["grey", "已租"], off_market: ["grey", "下架"] };
    var m = map[status] || ["grey", status];
    return '<span class="pill ' + m[0] + '">' + esc(S.lang === "en" ? status : m[1]) + "</span>";
  }
  function visPill(v) { return '<span class="pill ' + (v === "public" ? "green" : "grey") + '">' + (v === "public" ? t("官网公开", "Public") : t("仅池内", "Pool only")) + "</span>"; }

  // ---------- 我的房源 ----------
  function listings(q) {
    setTitle(t("我的房源", "My listings"), t("发布、公开到官网、管理询盘", "Publish, expose to the site, track inquiries"));
    $("#topActs").innerHTML = '<button class="btn gold sm" data-act="new-listing">+ ' + t("新增房源", "New listing") + "</button>";
    var qs = new URLSearchParams(); ["q", "status"].forEach(function (k) { if (q[k]) qs.set(k, q[k]); });
    return api("/listings?" + qs.toString()).then(function (d) {
      var h = '<div class="toolbar"><input id="lq" type="search" placeholder="' + t("搜索编号 / 楼盘", "Search code / project") + '" value="' + esc(q.q || "") + '">' +
        '<select id="lst"><option value="">' + t("全部状态", "All status") + "</option>" +
        ["available", "reserved", "sold", "rented", "off_market"].map(function (s) {
          return '<option value="' + s + '"' + (q.status === s ? " selected" : "") + ">" + esc(s) + "</option>";
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
            '<button class="btn line sm" data-act="share" data-id="' + r.id + '">' + t("分享卡", "Share") + "</button> " +
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

  function listingForm(row) {
    row = row || {};
    var body = '<form id="lf">' +
      '<div class="grid2">' + field(t("楼盘 / 项目名 *", "Project *"), '<input name="project_name" value="' + esc(row.project_name || "") + '">') +
      field(t("区域", "Area"), '<select name="area_code">' + areaOptions(row.area_code) + "</select>") + "</div>" +
      '<div class="grid2">' + field(t("房型", "Type"), '<select name="property_type">' + optList(typeList(), row.property_type, "—") + "</select>") +
      field(t("出售 / 出租", "Sale / Rent"), '<select name="intent"><option value="sale"' + (row.intent !== "rent" ? " selected" : "") + ">出售</option><option value=\"rent\"" + (row.intent === "rent" ? " selected" : "") + ">出租</option></select>") + "</div>" +
      '<div class="grid2">' + field(t("售价 (RM)", "Asking price"), '<input name="asking_price" inputmode="numeric" value="' + esc(row.asking_price || "") + '">') +
      field(t("租金 (RM/月)", "Monthly rent"), '<input name="rent_price" inputmode="numeric" value="' + esc(row.rent_price || "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("单位号", "Unit"), '<input name="unit_no" value="' + esc(row.unit_no || "") + '">') +
      field(t("座 / Block", "Block"), '<input name="block" value="' + esc(row.block || "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("房间", "Beds"), '<input name="bedrooms" inputmode="numeric" value="' + esc(row.bedrooms != null ? row.bedrooms : "") + '">') +
      field(t("卫浴", "Baths"), '<input name="bathrooms" inputmode="numeric" value="' + esc(row.bathrooms != null ? row.bathrooms : "") + '">') + "</div>" +
      '<div class="grid2">' + field(t("建筑面积 (sqft)", "Built-up"), '<input name="built_up" inputmode="numeric" value="' + esc(row.built_up || "") + '">') +
      field(t("产权", "Tenure"), '<select name="tenure">' + optList(S.meta ? S.meta.tenures : [], row.tenure, "—") + "</select>") + "</div>" +
      field(t("备注（不公开）", "Notes (private)"), '<textarea name="remarks">' + esc(row.remarks || "") + "</textarea>") +
      field(t("房源图片（最多 12 张）", "Photos (max 12)"), photoBlock(row)) +
      "</form>";
    var m = modal({
      title: row.id ? t("编辑房源", "Edit listing") : t("新增房源", "New listing"),
      body: body,
      footer: '<button class="btn line" data-close>' + t("取消", "Cancel") + "</button>" +
        (row.id ? '<button class="btn danger" id="del">' + t("删除", "Delete") + "</button>" : "") +
        '<button class="btn gold" id="save">' + t("保存", "Save") + "</button>"
    });
    bindPhotos(m, row);
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
  function shareCard(row) {
    var m = modal({
      title: t("分享卡", "Share card"),
      body: '<p class="muted" style="margin:0 0 10px">' + t("下载后可直接发 WhatsApp / 朋友圈。", "Download and post to WhatsApp.") + "</p>" +
        '<canvas id="shareCanvas" width="1080" height="1350" style="width:100%;max-width:420px;border-radius:12px;border:1px solid var(--line)"></canvas>',
      footer: '<button class="btn line" data-close>' + t("关闭", "Close") + "</button><button class=\"btn gold\" id=\"dl\">" + t("下载 PNG", "Download PNG") + "</button>"
    });
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

    var title = (row.project_title_zh || row.project_title || row.project_name || "—");
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
          return '<div class="pcard"><div style="display:flex;gap:8px;align-items:center"><span class="mono">' + esc(r.code) + "</span>" +
            (mine ? '<span class="pill grey">' + t("我的", "Mine") + "</span>" : "") + "</div>" +
            '<div class="t">' + esc(r.project_title_zh || r.project_title || r.project_name || "—") + "</div>" +
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
        field(t("留言（选填）", "Message"), '<textarea name="message" placeholder="带看时间 / 客户情况"></textarea>') + "</form>",
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
              return "<tr><td><b>" + esc(m.project_title_zh || m.project_title || m.project_name || "—") + "</b> <span class='mono muted'>" + esc(m.code) + "</span></td><td>" +
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
      '<div class="grid2">' + field(t("团队 / 公司", "Team"), '<input id="pfTeam" value="' + esc(a.team || "") + '">') +
      field(t("REN 编号", "REN"), '<input id="pfRen" value="' + esc(a.ren_no || "") + '">') + "</div>" +
      field(t("简介", "Bio"), '<textarea id="pfBio">' + esc(a.bio || "") + "</textarea>") +
      field(t("个人页地址", "Your page"), '<div style="display:flex;align-items:center;gap:6px"><span class="muted">kwongthye.com/a/</span><input id="pfSlug" value="' + esc(a.slug || "") + '"></div>') +
      field(t("专长区域（可多选）", "Areas you cover"), areaSel) +
      '<div style="margin-top:6px"><button class="btn gold" id="pfSave">' + t("保存资料", "Save profile") + "</button></div></div>";
    if (a.review_status === "rejected" && a.review_note) {
      h += '<div class="card" style="border-left:3px solid #C6A15B"><h3>' + t("审核未通过", "Review not approved") + "</h3><p style='margin:0'>" + esc(a.review_note) + "</p></div>";
    }
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
        ren_no: $("#pfRen").value.trim(), bio: $("#pfBio").value.trim(), slug: $("#pfSlug").value.trim(),
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
    return Promise.resolve();
  }

  // ---------- 事件 ----------
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.dataset.act, id = Number(el.dataset.id);
    if (act === "new-listing") listingForm(null);
    if (act === "edit-listing") api("/listings/" + id).then(function (j) { listingForm(j.row); });
    if (act === "toggle-publish") {
      var pub = el.dataset.pub === "1";
      api("/listings/" + id + "/publish", { method: "POST", body: { public: pub } }).then(function () {
        toast(pub ? t("已公开到官网", "Published to site") : t("已收回，仅池内可见", "Unpublished")); route();
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
  $("#authLang").addEventListener("click", function () {
    S.lang = S.lang === "en" ? "zh" : "en"; localStorage.setItem("kt_lang", S.lang);
    setAuthMode(S.authMode);
  });
  $("#langBtn").addEventListener("click", function () {
    S.lang = S.lang === "en" ? "zh" : "en"; localStorage.setItem("kt_lang", S.lang);
    renderNav(); route();
  });
  $("#logoutBtn").addEventListener("click", function () {
    api("/logout", { method: "POST" }).then(function () { S.me = null; showAuth("login"); }).catch(function () { showAuth("login"); });
  });
  $("#burger").addEventListener("click", function () { $("#side").classList.toggle("on"); });

  // ---------- 启动 ----------
  function start() {
    var params = new URLSearchParams(location.search);
    var verify = params.get("verify");
    fetch("/api/public/config").then(function (r) { return r.json(); }).then(function (cfg) {
      S.meta = { states: cfg.states || [], areas: cfg.areas || [], property_types: cfg.taxonomy.property_types || [], tenures: cfg.taxonomy.tenures || [] };
    }).catch(function () {}).then(function () {
      if (verify) {
        fetch("/api/agent/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: verify }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            history.replaceState(null, "", location.pathname);
            toast(j.ok ? t("邮箱已验证", "Email verified") : t("验证链接无效或已过期", "Invalid or expired link"), !j.ok);
          });
      }
      api("/me").then(function (j) { S.me = j.agent; S.stats = j.stats; boot(); })
        .catch(function () { showAuth("login"); });
    });
  }
  start();
})();
