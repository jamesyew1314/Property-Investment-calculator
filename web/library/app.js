/* PropBase — 房产资料库前端（零依赖，原生 JS） */
(function () {
  "use strict";

  // ================= 基础 =================
  var S = {
    lang: localStorage.getItem("pb_lang") || "zh",
    taxonomy: null,
    me: null,
    opts: null,
    lastList: null,
    seq: 0
  };
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  function T(zh, en) { return S.lang === "en" ? en : zh; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function fmtMoney(v, currency) {
    var n = num(v);
    if (n == null) return "—";
    var s = n.toLocaleString("en-MY", { maximumFractionDigits: n % 1 ? 2 : 0 });
    return (currency === false ? "" : "RM ") + s;
  }
  function fmtInt(v) { var n = num(v); return n == null ? "—" : n.toLocaleString("en-MY"); }
  function fmtDate(v) { return v ? String(v).slice(0, 10) : "—"; }
  function fmtTime(v) { return v ? String(v).slice(0, 5) : ""; }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16);
    var p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function relDays(dateStr) {
    if (!dateStr) return "";
    var d = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return T("今天", "Today");
    if (diff === 1) return T("明天", "Tomorrow");
    if (diff === -1) return T("昨天", "Yesterday");
    return diff > 0 ? T(diff + " 天后", "in " + diff + "d") : T(-diff + " 天前", -diff + "d ago");
  }
  function waLink(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.indexOf("0") === 0) d = "60" + d.slice(1);
    else if (d.indexOf("60") !== 0) d = "60" + d;
    return "https://wa.me/" + d;
  }

  function b64url(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  // 生成计算器链接：把房价 / 租金 / 贷款假设带过去（计算器用 ?d= 只读分享格式）
  function calcLink(p) {
    var price = num(p.asking_price) || num(p.rent_price) || 0;
    var d = {
      spa: String(price), actual: String(price), loan: String(Math.round(price * 0.9)),
      loanPct: "90", rate: "4.3", tenure: "30",
      hold: "5", ownerType: "citizen"
    };
    if (p.intent === "rent" && num(p.rent_price)) d.rent = String(Math.round(num(p.rent_price) * 12));
    return "https://calc.kwongthye.com/?d=" + b64url(JSON.stringify({ v: 1, d: d, o: {} }));
  }
  function propText(p) {
    var price = p.intent === "rent" ? p.rent_price : p.asking_price;
    var lines = [
      "【" + (p.project_title || p.project_name || "") + (p.unit_no ? " " + [p.block, p.unit_no].filter(Boolean).join("-") : "") + "】",
      T("区域：", "Area: ") + lab("areas", p.area_code) + " · " + lab("property_types", p.property_type) +
        (p.tenure ? " · " + lab("tenures", p.tenure) : ""),
      T("格局：", "Layout: ") + [p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join(T(" 房 ", " bed / ")) +
        (p.bathrooms != null ? T(" 卫", " bath") : "") + (p.built_up ? " · " + fmtInt(p.built_up) + " sqft" : ""),
      T("价格：", "Price: ") + fmtMoney(price) + (p.intent === "rent" ? T(" / 月", " / month") : "") +
        (p.intent !== "rent" && psf(price, p.built_up) ? "（RM " + psf(price, p.built_up).toFixed(2) + " psf）" : ""),
      T("状态：", "Status: ") + lab("listing_statuses", p.status),
      p.agent ? T("中介：", "Agent: ") + p.agent : "",
      "",
      "KWONG THYE · THE ROOF REALTY SDN BHD",
      "Andy Lau 刘泌光 · REN 32839 · +60 16-528 0918"
    ];
    return lines.filter(function (x) { return x !== ""; }).join("\n");
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
      return ok;
    }
  }

  // ================= 字典 =================
  function list(name) { return (S.taxonomy && S.taxonomy[name]) || []; }
  function row(name, key) {
    var arr = list(name);
    for (var i = 0; i < arr.length; i++) if (arr[i].key === key) return arr[i];
    return null;
  }
  function lab(name, key) {
    var r = row(name, key);
    if (!r) return key || "—";
    return S.lang === "en" ? r.en : r.zh;
  }
  function tone(name, key) { var r = row(name, key); return (r && r.tone) || "grey"; }
  function pill(name, key) {
    if (!key) return "";
    return '<span class="pill ' + tone(name, key) + '">' + esc(lab(name, key)) + "</span>";
  }
  function options(name, selected, blankLabel) {
    var h = blankLabel === false ? "" : '<option value="">' + esc(blankLabel || T("全部", "All")) + "</option>";
    list(name).forEach(function (r) {
      h += '<option value="' + esc(r.key) + '"' + (r.key === selected ? " selected" : "") + ">" + esc(S.lang === "en" ? r.en : r.zh) + "</option>";
    });
    return h;
  }

  // ================= API =================
  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch("/api/library" + path, init);
    var ct = res.headers.get("content-type") || "";
    if (ct.indexOf("text/csv") >= 0) {
      if (!res.ok) throw new Error("request_failed");
      return { blob: await res.blob(), filename: filenameFrom(res) };
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: "bad_response" }; }
    if (res.status === 401) { showGate(); throw new Error("auth_required"); }
    if (!res.ok || data.ok === false) {
      var err = new Error(data.error || "request_failed");
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function filenameFrom(res) {
    var cd = res.headers.get("content-disposition") || "";
    var m = cd.match(/filename="([^"]+)"/);
    return m ? m[1] : "propbase.csv";
  }
  async function adminApi(path, body) {
    var res = await fetch(path, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return { ok: false, error: "bad_response" }; });
    if (!res.ok || data.ok === false) {
      var err = new Error(data.error || "request_failed"); err.data = data; throw err;
    }
    return data;
  }

  // ================= Toast / Modal =================
  function toast(msg, isErr) {
    var box = $("#toast");
    var el = document.createElement("div");
    el.className = "toast" + (isErr ? " err" : "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, isErr ? 5200 : 2600);
  }
  function openModal(cfg) {
    var root = $("#modalRoot");
    root.className = "on";
    root.innerHTML = '<div class="ovl" data-close></div>' +
      '<div class="dlg" role="dialog" aria-modal="true">' +
      "<header><h2>" + esc(cfg.title) + '</h2><button class="x" data-close aria-label="close">×</button></header>' +
      '<div class="body">' + cfg.body + "</div>" +
      (cfg.footer === false ? "" : '<footer><div class="msg"></div>' + (cfg.footer || "") + "</footer>") +
      "</div>";
    var dlg = $(".dlg", root);
    function close() { root.className = ""; root.innerHTML = ""; document.body.style.overflow = ""; }
    document.body.style.overflow = "hidden";
    $$("[data-close]", root).forEach(function (b) { b.addEventListener("click", close); });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
    });
    return {
      el: dlg,
      close: close,
      msg: function (m, ok) { var x = $(".dlg footer .msg", root); if (x) { x.textContent = m || ""; x.style.color = ok ? "var(--green)" : "var(--red)"; } },
      root: root
    };
  }
  function confirmBox(text, onYes) {
    var m = openModal({
      title: T("确认操作", "Confirm"),
      body: '<p style="margin:0;font-size:14px">' + esc(text) + "</p>",
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        '<button class="btn danger" id="cfmYes" type="button">' + T("确认", "Confirm") + "</button>"
    });
    $("#cfmYes", m.root).addEventListener("click", function () { m.close(); onYes(); });
  }
  function showFieldErrors(form, fields) {
    $$(".field", form).forEach(function (f) { f.classList.remove("bad"); var e = $(".err", f); if (e) e.remove(); });
    Object.keys(fields || {}).forEach(function (name) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      var wrap = input.closest(".field");
      if (!wrap) return;
      wrap.classList.add("bad");
      var e = document.createElement("div");
      e.className = "err";
      e.textContent = errText(fields[name]);
      wrap.appendChild(e);
    });
  }
  function errText(code) {
    var map = {
      required: T("必填", "Required"),
      invalid_number: T("请填写数字", "Must be a number"),
      invalid_choice: T("选项无效", "Invalid option"),
      range_order: T("范围前后矛盾", "Range is inconsistent"),
      duplicate_unit: T("这个单位已经存在", "This unit already exists"),
      duplicate_project: T("同名楼盘已存在", "Duplicate project name"),
      duplicate_agent: T("同名中介已存在", "Duplicate agent name"),
      duplicate_row: T("重复记录", "Duplicate row"),
      not_found: T("未找到记录", "Not found"),
      project_in_use: T("楼盘下还有房源，不能删除", "Project still has listings"),
      owner_in_use: T("业主名下还有房源", "Owner still has listings"),
      read_only: T("只读账号不能修改", "Read-only account"),
      insert_failed: T("写入失败", "Insert failed"),
      empty: T("内容为空", "Empty content"),
      too_many_rows: T("一次最多 2000 行", "Max 2000 rows")
    };
    return map[code] || code;
  }

  // ================= 登录 =================
  function showGate() {
    $("#app").hidden = true;
    $("#gate").hidden = false;
    $("#gateForm").reset();
    $("#gCode").hidden = true; $("#gCodeLabel").hidden = true;
    $("#gCode").value = "";
    $("#gPass").hidden = false; $("#gPassLabel").hidden = false;
    $("#gBtn").textContent = T("登录", "Sign in");
    gateText();
  }
  function hideGate() { $("#gate").hidden = true; $("#app").hidden = false; }
  function gateText() {
    $("#gateTitle").textContent = T("登录资料库", "Sign in to PropBase");
    $("#gateSub").textContent = T("使用管理后台账号登录。房源、楼盘、业主、客户、带看与成交，一个地方管完。",
      "Use your admin account. Listings, projects, owners, clients, viewings and deals in one place.");
    $("#gEmailLabel").textContent = T("邮箱", "Email");
    $("#gPassLabel").textContent = T("密码", "Password");
    $("#gCodeLabel").textContent = T("验证码（6 位）", "6-digit code");
    $("#gRememberLabel").textContent = T("记住这台设备 7 天", "Trust this device for 7 days");
    $("#gBtn").textContent = $("#gCode").hidden ? T("登录", "Sign in") : T("验证并进入", "Verify & enter");
    $("#gLang").textContent = S.lang === "zh" ? "EN" : "中文";
    $("#gateMsg").textContent = "";
  }

  async function boot() {
    hideGate();
    try {
      if (!S.taxonomy) {
        var data = await api("/meta");
        S.taxonomy = data.taxonomy;
        S.me = { email: data.email, role: data.role };
      }
    } catch (e) { return; }
    $("#whoami").textContent = S.me.email;
    $("#whoRole").textContent = roleLabel(S.me.role);
    $("#langBtn").textContent = S.lang === "zh" ? "EN" : "中文";
    renderNav();
    window.addEventListener("hashchange", render);
    await render();
  }
  function roleLabel(role) {
    return { owner: T("拥有者", "Owner"), admin: T("管理员", "Admin"), viewer: T("只读", "Viewer") }[role] || role;
  }
  function canWrite() { return S.me && S.me.role !== "viewer"; }

  async function loginFlow(e) {
    e.preventDefault();
    var msg = $("#gateMsg");
    var email = $("#gEmail").value.trim();
    var pass = $("#gPass").value;
    var code = $("#gCode").value.trim();
    msg.className = "gateMsg";
    if (!email) { msg.textContent = T("请填写邮箱", "Email is required"); return; }
    try {
      if (!code) {
        $("#gBtn").disabled = true;
        var r = await adminApi("/api/admin/login", { email: email, password: pass });
        $("#gBtn").disabled = false;
        $("#gPass").value = "";
        $("#gPass").hidden = true; $("#gPassLabel").hidden = true;
        $("#gCode").hidden = false; $("#gCodeLabel").hidden = false;
        $("#gCode").focus();
        $("#gBtn").textContent = T("验证并进入", "Verify & enter");
        msg.className = "gateMsg ok";
        msg.textContent = T("验证码已发送到 ", "Code sent to ") + (r.email || email);
        return;
      }
      $("#gBtn").disabled = true;
      await adminApi("/api/admin/verify", { code: code, email: email, remember: $("#gRemember").checked });
      $("#gBtn").disabled = false;
      var meta = await api("/meta");
      S.taxonomy = meta.taxonomy;
      S.me = { email: meta.email, role: meta.role };
      location.hash = location.hash || "#/";
      await boot();
    } catch (err) {
      $("#gBtn").disabled = false;
      msg.className = "gateMsg";
      var m = {
        bad_password: T("密码不正确", "Wrong password"),
        bad_code: T("验证码不正确或已过期", "Wrong or expired code"),
        rate_limited: T("尝试次数过多，请 10 分钟后再试", "Too many attempts, try again in 10 minutes"),
        mail_failed: T("验证码邮件发送失败，请稍后重试", "Could not send the code, try again"),
        admin_disabled: T("后台未启用", "Admin is disabled"),
        owner_env: T("请输入邮箱登录", "Use an email account")
      };
      msg.textContent = m[err.message] || (T("登录失败：", "Sign-in failed: ") + err.message);
    }
  }

  // ================= 导航 / 路由 =================
  var ICONS = {
    dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M17 8a3 3 0 110 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9l3-3 4 4-7 7H7l-4-4 3-3"/><path d="M10 13l2 2"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>'
  };
  var NAV = [
    { key: "dashboard", path: "/", icon: "dash", zh: "概览", en: "Overview" },
    { key: "properties", path: "/properties", icon: "home", zh: "房源", en: "Listings" },
    { key: "projects", path: "/projects", icon: "layers", zh: "楼盘", en: "Projects" },
    { key: "owners", path: "/owners", icon: "user", zh: "业主", en: "Owners" },
    { key: "clients", path: "/clients", icon: "users", zh: "客户", en: "Clients" },
    { key: "viewings", path: "/viewings", icon: "cal", zh: "带看", en: "Viewings" },
    { key: "deals", path: "/deals", icon: "hand", zh: "成交", en: "Deals" },
    { key: "import", path: "/import", icon: "up", zh: "导入 / 导出", en: "Import / Export" },
    { key: "audit", path: "/audit", icon: "list", zh: "操作日志", en: "Activity log" }
  ];
  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "") || "/";
    var i = raw.indexOf("?");
    var path = i >= 0 ? raw.slice(0, i) : raw;
    var qs = i >= 0 ? raw.slice(i + 1) : "";
    var q = {};
    new URLSearchParams(qs).forEach(function (v, k) { q[k] = v; });
    var parts = path.split("/").filter(Boolean);
    return { path: path, parts: parts, q: q, name: parts[0] || "dashboard", id: parts[1] || null };
  }
  function go(path, q) {
    var qs = q ? new URLSearchParams(q).toString() : "";
    location.hash = "#" + path + (qs ? "?" + qs : "");
  }
  function renderNav() {
    var cur = parseHash().name;
    $("#nav").innerHTML = NAV.map(function (n) {
      var on = n.key === cur || (cur === "property" && n.key === "properties");
      return '<a href="#' + n.path + '" class="' + (on ? "on" : "") + '">' + ICONS[n.icon] +
        "<span>" + esc(T(n.zh, n.en)) + "</span></a>";
    }).join("");
  }

  var TITLES = {
    dashboard: ["概览", "Overview", "今天的房源、带看与成交", "Today's listings, viewings and deals"],
    properties: ["房源", "Listings", "所有在售 / 在租房源", "Every sale and rental listing"],
    property: ["房源详情", "Listing", "", ""],
    projects: ["楼盘", "Projects", "楼盘字典与单位统计", "Project master data and unit counts"],
    owners: ["业主", "Owners", "业主与房东名册", "Owner and landlord directory"],
    clients: ["客户", "Clients", "买家 / 租客与需求", "Buyers, renters and their brief"],
    viewings: ["带看", "Viewings", "看房安排与反馈", "Viewing schedule and feedback"],
    deals: ["成交", "Deals", "成交价与佣金", "Closed prices and commission"],
    import: ["导入 / 导出", "Import / Export", "CSV 批量导入与导出", "Bulk CSV import and export"],
    audit: ["操作日志", "Activity log", "谁在什么时候改了什么", "Who changed what, and when"]
  };
  function setTitle(name, extra) {
    var t = TITLES[name] || ["", "", "", ""];
    $("#pageTitle").textContent = T(t[0], t[1]);
    $("#pageSub").textContent = extra || T(t[2], t[3]);
  }

  function skeleton() {
    return '<div class="card"><div style="height:120px;display:grid;place-items:center;color:var(--muted)">' +
      T("加载中…", "Loading…") + "</div></div>";
  }

  async function render() {
    if (!S.taxonomy) return;
    var sig = location.hash;
    var r = parseHash();
    renderNav();
    setTitle(r.name);
    $("#topActs").innerHTML = "";
    $("#view").innerHTML = skeleton();
    try {
      var fn = ({
        dashboard: viewDashboard, properties: viewProperties,
        projects: viewProjects, owners: viewOwners, clients: viewClients,
        viewings: viewViewings, deals: viewDeals, import: viewImport, audit: viewAudit
      })[r.name];
      if (r.name === "properties" && r.id) fn = viewPropertyDetail;
      if (!fn) { $("#view").innerHTML = emptyState(T("页面不存在", "Page not found"), ""); return; }
      await fn(r);
      // 竞态保护：等待期间用户又切换了路由，则按当前路由重画
      if (location.hash !== sig) { render(); return; }
    } catch (e) {
      if (e.message === "auth_required") return;
      $("#view").innerHTML = '<div class="card"><p style="color:var(--red)">' +
        esc(T("加载失败：", "Failed to load: ") + (e.message || "")) + "</p></div>";
    }
  }

  // ================= 小工具 =================
  function emptyState(title, sub, action) {
    return '<div class="empty"><b>' + esc(title) + "</b><span>" + esc(sub || "") + "</span>" +
      (action ? '<div style="margin-top:12px">' + action + "</div>" : "") + "</div>";
  }
  function psf(price, builtUp) {
    var p = num(price), b = num(builtUp);
    if (!p || !b) return null;
    return Math.round((p / b) * 100) / 100;
  }
  function pagerHtml(d, baseQ) {
    var pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    if (pages <= 1) return "";
    var q = Object.assign({}, baseQ);
    function link(p, label, disabled) {
      var qq = Object.assign({}, q, { page: p });
      return '<button data-act="page" data-q="' + esc(new URLSearchParams(qq).toString()) + '"' +
        (disabled ? " disabled" : "") + ">" + label + "</button>";
    }
    return '<div class="pager"><span>' + T("共 ", "") + d.total + T(" 条", " records") +
      " · " + d.page + " / " + pages + "</span>" +
      link(d.page - 1, "‹", d.page <= 1) + link(d.page + 1, "›", d.page >= pages) + "</div>";
  }
  function toolbarSearch(q, placeholder) {
    return '<input type="search" data-filter="q" value="' + esc(q.q || "") + '" placeholder="' + esc(placeholder) + '">';
  }
  function selectFilter(name, listName, value, blank) {
    return '<select data-filter="' + name + '">' + options(listName, value, blank) + "</select>";
  }

  // ================= 概览 =================
  async function viewDashboard() {
    setTitle("dashboard");
    var d = await api("/overview");
    var s = d.stats;
    var cards = [
      [T("在售房源", "For sale"), fmtInt(s.sale_available), T("挂牌总值 ", "Asking value ") + fmtMoney(s.sale_value), "properties"],
      [T("在租房源", "For rent"), fmtInt(s.rent_available), T("可随时带看", "Ready to view"), "properties"],
      [T("已订", "Reserved"), fmtInt(s.reserved), T("等待完成交易", "Awaiting completion"), "properties"],
      [T("本月新增", "New this month"), fmtInt(s.new_month), T("新录入房源", "Newly added"), "properties"],
      [T("待带看", "Upcoming viewings"), fmtInt(s.upcoming_viewings), T("今天及以后", "Today and later"), "viewings"],
      [T("本月成交", "Deals this month"), fmtInt(s.deals_month), T("佣金 ", "Commission ") + fmtMoney(s.commission_month), "deals"]
    ];
    var h = '<div class="stats">' + cards.map(function (c) {
      return '<a class="stat" href="#/' + c[3] + '" style="color:inherit"><b>' + esc(c[1]) + "</b><span>" + esc(c[0]) +
        "</span><small>" + esc(c[2]) + "</small></a>";
    }).join("") + "</div>";

    var maxArea = Math.max.apply(null, d.areas.map(function (a) { return a.n; }).concat([1]));
    h += '<div class="grid2" style="align-items:start">' +
      '<div class="card"><h3>' + T("区域分布", "By area") + " <span class=\"muted\">" + T("在售/在租", "Available") + "</span></h3>" +
      (d.areas.length ? d.areas.map(function (a) {
        var pct = Math.round((a.n / maxArea) * 100);
        return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12.5px">' +
          "<span>" + esc(lab("areas", a.area_code)) + "</span><b>" + a.n + "</b></div>" +
          '<div style="height:6px;background:#EEF1F6;border-radius:4px;overflow:hidden"><div style="width:' + pct + "%;height:100%;background:var(--gold)\"></div></div></div>";
      }).join("") : '<p class="muted" style="margin:0">' + T("还没有房源", "No listings yet") + "</p>") + "</div>" +
      '<div class="card"><h3>' + T("即将带看", "Upcoming viewings") + "</h3>" +
      (d.viewings.length ? '<div style="display:flex;flex-direction:column;gap:10px">' + d.viewings.map(function (v) {
        return '<div style="display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #F0F3F7;padding-bottom:9px">' +
          '<div style="font-family:Georgia,serif;font-size:15px;color:var(--navy);min-width:52px">' + esc(fmtTime(v.scheduled_time) || "—") + "</div>" +
          '<div style="flex:1;min-width:0"><b style="font-size:13px">' + esc(v.property_title || v.code || "—") + "</b>" +
          '<div class="muted" style="font-size:11.5px">' + esc(v.client_name || "") + " · " + esc(v.agent || "") + " · " + esc(relDays(v.scheduled_on)) + "</div></div>" +
          (v.property_id ? '<a class="btn ghost sm" href="#/properties/' + v.property_id + '">' + T("查看", "Open") + "</a>" : "") + "</div>";
      }).join("") + "</div>" : '<p class="muted" style="margin:0">' + T("最近没有带看安排", "Nothing scheduled") + "</p>") + "</div>" +
      "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>' + T("最近更新", "Recently updated") + "</h3>" +
      (d.recent.length ? '<div class="tblWrap" style="border:none"><table class="tbl"><thead><tr>' +
        "<th>" + T("编号", "Code") + "</th><th>" + T("房源", "Listing") + "</th><th>" + T("区域", "Area") + "</th>" +
        "<th>" + T("价格", "Price") + "</th><th>" + T("状态", "Status") + "</th><th>" + T("更新", "Updated") + "</th></tr></thead><tbody>" +
        d.recent.map(function (p) {
          return '<tr data-href="#/properties/' + p.id + '"><td class="mono">' + esc(p.code) + "</td>" +
            "<td>" + esc(p.project_title || p.project_name || "—") + (p.unit_no ? ' <span class="muted">' + esc(p.unit_no) + "</span>" : "") + "</td>" +
            "<td>" + esc(lab("areas", p.area_code)) + "</td>" +
            '<td class="num">' + esc(fmtMoney(p.intent === "rent" ? p.rent_price : p.asking_price)) + "</td>" +
            "<td>" + pill("listing_statuses", p.status) + "</td>" +
            '<td class="muted nowrap">' + esc(fmtDateTime(p.updated_at)) + "</td></tr>";
        }).join("") + "</tbody></table></div>" :
        emptyState(T("还没有房源", "No listings yet"), T("从「房源 → 新增」开始，或到「导入」批量导入。", "Add one from Listings, or import a CSV.")) + "</div>");
    $("#view").innerHTML = h;
    bindRows();
  }

  // ================= 房源列表 =================
  function propertyCols() {
    return [
      { label: T("编号", "Code"), sort: "code" },
      { label: T("房源", "Listing") },
      { label: T("区域", "Area") },
      { label: T("房 / 卫 · 面积", "Beds / Baths · Size") },
      { label: T("价格", "Price"), sort: "asking_price", align: "num" },
      { label: T("状态", "Status"), sort: "status" },
      { label: T("中介", "Agent") },
      { label: T("更新", "Updated"), sort: "updated_at" }
    ];
  }

  async function viewProperties(r) {
    var q = r.q;
    if (canWrite()) await loadOptions();
    if (canWrite()) {
      $("#topActs").innerHTML = '<button class="btn gold" data-act="new-property" type="button">+ ' + T("新增房源", "New listing") + "</button>";
    }
    var qs = new URLSearchParams(q).toString();
    var d = await api("/properties?" + qs);

    var h = '<div class="toolbar">' + toolbarSearch(q, T("搜索编号 / 楼盘 / 单位 / 地址 / 中介", "Search code, project, unit, address, agent")) +
      '<select data-filter="status">' + options("listing_statuses", q.status || "", T("全部状态", "All status")) + "</select>" +
      '<select data-filter="intent">' + options("listing_intents", q.intent || "", T("出售 / 出租", "Sale / Rent")) + "</select>" +
      selectFilter("area", "areas", q.area || "", T("全部区域", "All areas")) +
      selectFilter("type", "property_types", q.type || "", T("全部房型", "All types")) +
      '<input type="text" data-filter="agent" value="' + esc(q.agent || "") + '" placeholder="' + T("中介", "Agent") + '" style="min-width:110px">' +
      '<button class="btn ghost sm" data-act="reset" type="button">' + T("重置", "Reset") + "</button>" +
      '<span class="count">' + d.total + T(" 条", " records") + "</span></div>";

    h += '<div class="bulkbar" id="bulkbar" hidden><b id="bulkN">0</b> ' + T("条已选", "selected") +
      '<select id="bulkStatus">' + options("listing_statuses", "", T("改状态为…", "Set status…")) + "</select>" +
      '<button class="btn sm" data-act="bulk-status" type="button">' + T("应用", "Apply") + "</button>" +
      '<select id="bulkAgent"><option value="">' + T("改中介为…", "Assign agent…") + "</option>" +
      (S.opts ? S.opts.agents.map(function (a) { return '<option value="' + esc(a.name) + '">' + esc(a.name) + "</option>"; }).join("") : "") + "</select>" +
      '<button class="btn sm" data-act="bulk-agent" type="button">' + T("应用", "Apply") + "</button>" +
      '<button class="btn sm danger" data-act="bulk-delete" type="button">' + T("删除", "Delete") + "</button>" +
      '<button class="btn sm ghost" data-act="bulk-clear" type="button">' + T("取消选择", "Clear") + "</button></div>";

    if (!d.rows.length) {
      h += emptyState(T("没有符合条件的房源", "No listings match"), T("换个筛选条件，或新增一条。", "Try another filter, or add one."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    if (window.matchMedia("(max-width:820px)").matches) {
      h += '<div class="mCards">' + d.rows.map(function (p) {
        var price = p.intent === "rent" ? p.rent_price : p.asking_price;
        return '<div class="mCard" data-href="#/properties/' + p.id + '">' +
          '<div class="mTop"><input type="checkbox" class="rowSel" data-id="' + p.id + '">' +
          '<span class="mono">' + esc(p.code) + "</span>" + pill("listing_statuses", p.status) +
          '<span class="mAgent">' + esc(p.agent || "") + "</span></div>" +
          '<div class="mName">' + esc(p.project_title || p.project_name || "—") +
          (p.block || p.unit_no ? ' <span class="muted" style="font-weight:400">' + esc([p.block, p.unit_no].filter(Boolean).join(" · ")) + "</span>" : "") + "</div>" +
          '<div class="mMeta">' + esc(lab("areas", p.area_code)) + " · " +
          [p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join("/") +
          (p.built_up ? " · " + fmtInt(p.built_up) + " sqft" : "") + "</div>" +
          '<div class="mPrice">' + esc(fmtMoney(price)) + (p.intent === "rent" ? ' <span class="muted" style="font-size:12px">/mo</span>' : "") + "</div></div>";
      }).join("") + "</div>" + pagerHtml(d, q);
      $("#view").innerHTML = h;
      bindFilters(); bindRows(); bindBulk(); return;
    }

    h += '<div class="tblWrap"><table class="tbl"><thead><tr>' +
      '<th class="noSort"><input type="checkbox" id="selAll"></th>' +
      propertyCols().map(function (c) {
        var ar = (c.sort && q.sort === c.sort) ? (q.dir === "asc" ? "▲" : "▼") : "";
        var cls = (c.align ? "num" : "") + (c.sort ? "" : " noSort");
        var attr = c.sort ? ' data-sort="' + c.sort + '"' : "";
        return "<th" + attr + ' class="' + cls.trim() + '">' +
          esc(c.label) + (ar ? '<span class="ar">' + ar + "</span>" : "") + "</th>";
      }).join("") + "</tr></thead><tbody>" +
      d.rows.map(function (p) {
        var price = p.intent === "rent" ? p.rent_price : p.asking_price;
        return '<tr data-href="#/properties/' + p.id + '">' +
          '<td><input type="checkbox" class="rowSel" data-id="' + p.id + '"></td>' +
          '<td class="mono">' + esc(p.code) + (p.is_demo ? ' <span class="tag">' + T("示例", "demo") + "</span>" : "") + "</td>" +
          "<td><b>" + esc(p.project_title || p.project_name || "—") + "</b>" +
          (p.block || p.unit_no ? '<span class="sub">' + esc([p.block, p.unit_no].filter(Boolean).join(" · ")) + "</span>" : "") + "</td>" +
          "<td>" + esc(lab("areas", p.area_code)) + "</td>" +
          "<td>" + [p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join(" / ") +
          (p.built_up ? ' <span class="sub">' + fmtInt(p.built_up) + " sqft</span>" : "") + "</td>" +
          '<td class="num">' + esc(fmtMoney(price)) + (p.intent === "rent" ? '<span class="sub">' + T("每月", "/mo") + "</span>" : "") + "</td>" +
          "<td>" + pill("listing_statuses", p.status) + "</td>" +
          "<td>" + esc(p.agent || "—") + "</td>" +
          '<td class="muted nowrap">' + esc(fmtDateTime(p.updated_at)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters(); bindRows(); bindBulk();
  }

  // ================= 房源详情 =================
  async function viewPropertyDetail(r) {
    var d = await api("/properties/" + r.id);
    var p = d.row;
    S.lastList = null;
    setTitle("property", p.code + " · " + (p.project_title || p.project_name || ""));
    var price = p.intent === "rent" ? p.rent_price : p.asking_price;
    var h = '<div class="detailHead">' +
      '<div><div style="font-family:Georgia,serif;font-size:30px;color:var(--navy);line-height:1.15">' + esc(fmtMoney(price)) +
      (p.intent === "rent" ? '<span class="muted" style="font-size:14px"> /mo</span>' : "") + "</div>" +
      '<div style="margin-top:6px">' + pill("listing_statuses", p.status) + " " + pill("listing_intents", p.intent) +
      ' <span class="muted" style="font-size:12px">' + esc(lab("areas", p.area_code)) +
      (p.address ? " · " + esc(p.address) : "") + "</span></div></div>" +
      '<div class="acts">' +
      '<a class="btn ghost sm" href="#/properties">&larr; ' + T("返回列表", "Back") + "</a>" +
      '<button class="btn sm ghost" data-act="calc" data-id="' + p.id + '" type="button">' + T("算回报", "Run numbers") + "</button>" +
      '<button class="btn sm ghost" data-act="copy-prop" data-id="' + p.id + '" type="button">' + T("复制资料", "Copy details") + "</button>" +
      (canWrite() ? '<button class="btn sm" data-act="edit-property" data-id="' + p.id + '" type="button">' + T("编辑", "Edit") + "</button>" +
        '<button class="btn sm ghost" data-act="new-viewing" data-id="' + p.id + '" type="button">+ ' + T("安排带看", "Schedule viewing") + "</button>" +
        '<button class="btn sm ghost" data-act="new-deal" data-id="' + p.id + '" type="button">+ ' + T("记录成交", "Log deal") + "</button>" +
        '<button class="btn sm danger" data-act="del-property" data-id="' + p.id + '" type="button">' + T("删除", "Delete") + "</button>" : "") +
      "</div></div>";

    var kv = function (label, value) {
      return "<div><dt>" + esc(label) + "</dt><dd>" + (value === "" || value == null ? "—" : value) + "</dd></div>";
    };
    h += '<div class="grid2" style="align-items:start"><div class="card"><h3>' + T("房源信息", "Listing") + "</h3><dl class=\"kv\" style=\"grid-template-columns:1fr 1fr 1fr\">" +
      kv(T("区域", "Area"), esc(lab("areas", p.area_code))) +
      kv(T("房型", "Type"), esc(lab("property_types", p.property_type))) +
      kv(T("产权", "Tenure"), esc(lab("tenures", p.tenure))) +
      kv(T("建筑面积", "Built-up"), p.built_up ? fmtInt(p.built_up) + " sqft" : "") +
      kv(T("土地面积", "Land"), p.land_area ? fmtInt(p.land_area) + " sqft" : "") +
      kv(T("每平方尺", "PSF"), psf(price, p.built_up) ? "RM " + psf(price, p.built_up).toFixed(2) : "") +
      kv(T("房间 / 卫浴", "Beds / Baths"), [p.bedrooms, p.bathrooms].filter(function (x) { return x != null; }).join(" / ")) +
      kv(T("车位", "Car parks"), p.carparks) +
      kv(T("楼层", "Floor"), p.floor) +
      kv(T("朝向", "Facing"), esc(p.facing)) +
      kv(T("装修", "Furnishing"), esc(lab("furnishings", p.furnishing))) +
      kv(T("状况", "Condition"), esc(lab("conditions", p.condition))) +
      kv(T("地契", "Title"), esc(lab("title_types", p.title_type))) +
      kv(T("管理费", "Maintenance"), p.maintenance_fee ? fmtMoney(p.maintenance_fee) + T(" / 月", " / mo") : "") +
      kv(T("挂牌日", "Listed"), fmtDate(p.listed_on)) +
      kv(T("独家", "Exclusive"), p.exclusive ? T("是", "Yes") : T("否", "No")) +
      "</dl>" +
      (p.tags && p.tags.length ? '<div style="margin-top:12px">' + p.tags.map(function (t) { return '<span class="tag">' + esc(lab("tags", t)) + "</span>"; }).join("") + "</div>" : "") +
      (p.remarks ? '<div class="hr"></div><div style="white-space:pre-wrap;font-size:13px">' + esc(p.remarks) + "</div>" : "") +
      "</div>";

    var owner = d.owner;
    h += '<div class="card"><h3>' + T("业主", "Owner") + "</h3>" +
      (owner ? '<div style="font-size:15px"><b>' + esc(owner.name) + "</b></div>" +
        '<div class="muted" style="margin-top:2px">' + esc(owner.phone || "—") + (owner.phone2 ? " · " + esc(owner.phone2) : "") + "</div>" +
        (owner.email ? '<div class="muted">' + esc(owner.email) + "</div>" : "") +
        '<div class="muted" style="margin-top:6px">' + T("来源：", "Source: ") + esc(lab("sources", owner.source)) + "</div>" +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        (owner.phone ? '<a class="btn sm ghost" href="tel:' + esc(owner.phone.replace(/\s/g, "")) + '">' + T("拨号", "Call") + "</a>" : "") +
        (waLink(owner.phone) ? '<a class="btn sm ghost" href="' + waLink(owner.phone) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
        (canWrite() ? '<button class="btn sm ghost" data-act="edit-owner" data-id="' + owner.id + '" type="button">' + T("编辑业主", "Edit owner") + "</button>" : "") +
        "</div>" +
        (owner.remarks ? '<div class="hr"></div><div class="muted" style="font-size:12.5px;white-space:pre-wrap">' + esc(owner.remarks) + "</div>" : "")
        : '<p class="muted" style="margin:0">' + T("未关联业主。编辑房源可以添加。", "No owner linked yet.") + "</p>") +
      '<div class="hr"></div><h3 style="margin-bottom:8px">' + T("记录", "Record") + '</h3><dl class="kv" style="grid-template-columns:1fr 1fr">' +
      kv(T("中介", "Agent"), esc(p.agent)) +
      kv(T("录入人", "Created by"), esc(p.created_by)) +
      kv(T("创建", "Created"), fmtDateTime(p.created_at)) +
      kv(T("更新", "Updated"), fmtDateTime(p.updated_at)) +
      "</dl></div></div>";

    h += '<div class="grid2" style="margin-top:16px;align-items:start">' +
      '<div class="card"><h3>' + T("改价记录", "Price history") + "</h3>" +
      (d.prices.length ? '<div class="tblWrap" style="border:none"><table class="tbl"><thead><tr><th>' + T("时间", "When") + "</th><th>" + T("项目", "Field") + "</th><th class=\"num\">" + T("原价", "Old") + '</th><th class="num">' + T("新价", "New") + "</th><th>" + T("操作人", "By") + "</th></tr></thead><tbody>" +
        d.prices.map(function (x) {
          return "<tr style=\"cursor:default\"><td class=\"muted nowrap\">" + esc(fmtDateTime(x.created_at)) + "</td><td>" +
            (x.field === "rent_price" ? T("租金", "Rent") : T("售价", "Price")) + "</td>" +
            '<td class="num">' + esc(fmtMoney(x.old_price)) + '</td><td class="num">' + esc(fmtMoney(x.new_price)) + "</td><td>" + esc(x.actor || "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">' + T("还没有改价记录", "No price changes yet") + "</p>") + "</div>" +
      '<div class="card"><h3>' + T("带看", "Viewings") + "</h3>" +
      (d.viewings.length ? '<div style="display:flex;flex-direction:column;gap:8px">' + d.viewings.map(function (v) {
        return '<div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid #F0F3F7;padding-bottom:7px">' +
          '<div class="mono" style="min-width:96px">' + esc(fmtDate(v.scheduled_on)) + " " + esc(fmtTime(v.scheduled_time)) + "</div>" +
          '<div style="flex:1;min-width:0"><b style="font-size:12.5px">' + esc(v.client_name || "—") + "</b>" +
          (v.feedback ? '<span class="sub muted" style="display:block;font-size:11px">' + esc(v.feedback) + "</span>" : "") + "</div>" +
          pill("viewing_statuses", v.status) + "</div>";
      }).join("") + "</div>" : '<p class="muted" style="margin:0">' + T("暂无带看", "No viewings yet") + "</p>") + "</div></div>";

    h += '<div class="card" style="margin-top:16px"><h3>' + T("成交", "Deals") + "</h3>" +
      (d.deals.length ? '<div class="tblWrap" style="border:none"><table class="tbl"><thead><tr><th>' + T("日期", "Date") + "</th><th>" + T("类型", "Kind") + '</th><th class="num">' + T("成交价", "Price") + '</th><th class="num">' + T("佣金", "Commission") + "</th><th>" + T("客户", "Client") + "</th><th>" + T("状态", "Status") + "</th></tr></thead><tbody>" +
        d.deals.map(function (x) {
          return '<tr style="cursor:default"><td>' + esc(fmtDate(x.deal_on)) + "</td><td>" + esc(lab("deal_kinds", x.kind)) + "</td>" +
            '<td class="num">' + esc(fmtMoney(x.price)) + '</td><td class="num">' + esc(fmtMoney(x.commission_amount)) + "</td>" +
            "<td>" + esc(x.client_name || "—") + "</td><td>" + pill("deal_statuses", x.status) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">' + T("还没有成交记录", "No deals yet") + "</p>") + "</div>";

    $("#view").innerHTML = h;
  }

  // ================= 楼盘 =================
  async function viewProjects(r) {
    var q = r.q;
    if (canWrite()) $("#topActs").innerHTML = '<button class="btn gold" data-act="new-project" type="button">+ ' + T("新增楼盘", "New project") + "</button>";
    var d = await api("/projects?" + new URLSearchParams(q).toString());
    var h = '<div class="toolbar">' + toolbarSearch(q, T("搜索楼盘 / 开发商 / 地址", "Search project, developer, address")) +
      selectFilter("area", "areas", q.area || "", T("全部区域", "All areas")) +
      selectFilter("type", "property_types", q.type || "", T("全部房型", "All types")) +
      '<span class="count">' + d.total + T(" 个楼盘", " projects") + "</span></div>";
    if (!d.rows.length) {
      h += emptyState(T("还没有楼盘", "No projects yet"), T("先建楼盘，再把房源挂上去，区域与统计会自动汇总。", "Create a project first; listings and stats roll up automatically."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("楼盘", "Project") + "</th><th>" + T("区域", "Area") + "</th><th>" + T("房型", "Type") +
      "</th><th>" + T("产权", "Tenure") + '</th><th class="num">' + T("单位数", "Units") + '</th><th class="num">' + T("在售 / 在租", "Available") +
      '</th><th class="num">' + T("均价", "Avg price") + "</th><th>" + T("开发商", "Developer") + "</th></tr></thead><tbody>" +
      d.rows.map(function (p) {
        return '<tr data-href="#/properties?project_id=' + p.id + '"><td><b>' + esc(p.name) + "</b>" +
          (p.name_zh ? '<span class="sub">' + esc(p.name_zh) + "</span>" : "") + "</td>" +
          "<td>" + esc(lab("areas", p.area_code)) + "</td><td>" + esc(lab("property_types", p.property_type)) + "</td>" +
          "<td>" + esc(lab("tenures", p.tenure)) + "</td>" +
          '<td class="num">' + (p.total_units || p.units || "—") + "</td>" +
          '<td class="num">' + (p.available || 0) + "</td>" +
          '<td class="num">' + (p.avg_price ? esc(fmtMoney(p.avg_price)) : "—") + "</td>" +
          "<td>" + esc(p.developer || "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters(); bindRows();
  }

  // ================= 业主 =================
  async function viewOwners(r) {
    var q = r.q;
    if (canWrite()) $("#topActs").innerHTML = '<button class="btn gold" data-act="new-owner" type="button">+ ' + T("新增业主", "New owner") + "</button>";
    var d = await api("/owners?" + new URLSearchParams(q).toString());
    var h = '<div class="toolbar">' + toolbarSearch(q, T("搜索姓名 / 电话 / 邮箱", "Search name, phone, email")) +
      selectFilter("source", "sources", q.source || "", T("全部来源", "All sources")) +
      '<span class="count">' + d.total + T(" 位业主", " owners") + "</span></div>";
    if (!d.rows.length) {
      h += emptyState(T("还没有业主", "No owners yet"), T("录入业主后，房源可以直接关联，打电话和 WhatsApp 一键搞定。", "Add owners, then link listings to them."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("业主", "Owner") + "</th><th>" + T("电话", "Phone") +
      "</th><th>" + T("来源", "Source") + '</th><th class="num">' + T("名下房源", "Listings") + "</th><th>" + T("更新", "Updated") + "</th></tr></thead><tbody>" +
      d.rows.map(function (o) {
        return '<tr data-act="edit-owner" data-id="' + o.id + '"><td><b>' + esc(o.name) + "</b>" +
          (o.email ? '<span class="sub">' + esc(o.email) + "</span>" : "") + "</td>" +
          "<td>" + esc(o.phone || "—") + (o.phone2 ? '<span class="sub">' + esc(o.phone2) + "</span>" : "") + "</td>" +
          "<td>" + esc(lab("sources", o.source)) + "</td>" +
          '<td class="num">' + (o.properties || 0) + "</td>" +
          '<td class="muted nowrap">' + esc(fmtDateTime(o.updated_at)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters(); bindRows();
  }

  // ================= 客户 =================
  async function viewClients(r) {
    var q = r.q;
    if (canWrite()) $("#topActs").innerHTML = '<button class="btn gold" data-act="new-client" type="button">+ ' + T("新增客户", "New client") + "</button>";
    var d = await api("/clients?" + new URLSearchParams(q).toString());
    var h = '<div class="toolbar">' + toolbarSearch(q, T("搜索姓名 / 电话 / 备注", "Search name, phone, notes")) +
      '<select data-filter="status">' + options("client_statuses", q.status || "", T("全部状态", "All status")) + "</select>" +
      '<select data-filter="intent">' + options("client_intents", q.intent || "", T("买房 / 租房", "Buy / Rent")) + "</select>" +
      '<span class="count">' + d.total + T(" 位客户", " clients") + "</span></div>";
    if (!d.rows.length) {
      h += emptyState(T("还没有客户", "No clients yet"), T("记下客户需求，配对与推荐就有依据。", "Capture their brief to match listings."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("客户", "Client") + "</th><th>" + T("电话", "Phone") + "</th><th>" + T("意向", "Intent") +
      '</th><th class="num">' + T("预算", "Budget") + "</th><th>" + T("区域", "Areas") + "</th><th>" + T("状态", "Status") +
      '</th><th class="num">' + T("带看", "Viewings") + "</th><th>" + T("中介", "Agent") + "</th></tr></thead><tbody>" +
      d.rows.map(function (c) {
        var areas = (c.area_codes || []).slice(0, 2).map(function (a) { return lab("areas", a); }).join(", ");
        return '<tr data-act="edit-client" data-id="' + c.id + '"><td><b>' + esc(c.name) + "</b>" +
          (c.timeline ? '<span class="sub">' + esc(lab("timelines", c.timeline)) + "</span>" : "") + "</td>" +
          "<td>" + esc(c.phone || "—") + "</td><td>" + esc(lab("client_intents", c.intent)) + "</td>" +
          '<td class="num">' + (c.budget_min || c.budget_max ? esc(fmtMoney(c.budget_min, false)) + " – " + esc(fmtMoney(c.budget_max, false)) : "—") + "</td>" +
          "<td>" + esc(areas || "—") + "</td><td>" + pill("client_statuses", c.status) + "</td>" +
          '<td class="num">' + (c.viewings || 0) + "</td><td>" + esc(c.agent || "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters(); bindRows();
  }

  // ================= 带看 =================
  async function viewViewings(r) {
    var q = r.q;
    if (canWrite()) $("#topActs").innerHTML = '<button class="btn gold" data-act="new-viewing" type="button">+ ' + T("安排带看", "New viewing") + "</button>";
    var qs = Object.assign({ scope: "all" }, q);
    var d = await api("/viewings?" + new URLSearchParams(qs).toString());
    var h = '<div class="toolbar">' +
      '<select data-filter="scope"><option value="all"' + (qs.scope === "all" ? " selected" : "") + ">" + T("全部", "All") + "</option>" +
      '<option value="upcoming"' + (qs.scope === "upcoming" ? " selected" : "") + ">" + T("即将", "Upcoming") + "</option>" +
      '<option value="today"' + (qs.scope === "today" ? " selected" : "") + ">" + T("今天", "Today") + "</option></select>" +
      '<select data-filter="status">' + options("viewing_statuses", q.status || "", T("全部状态", "All status")) + "</select>" +
      '<span class="count">' + d.total + T(" 条", " records") + "</span></div>";
    if (!d.rows.length) {
      h += emptyState(T("没有带看安排", "No viewings"), T("在房源详情页点「安排带看」。", "Open a listing and choose Schedule viewing."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("日期 / 时间", "Date / time") + "</th><th>" + T("房源", "Listing") +
      "</th><th>" + T("客户", "Client") + "</th><th>" + T("中介", "Agent") + "</th><th>" + T("状态", "Status") + "</th><th>" + T("反馈", "Feedback") + "</th></tr></thead><tbody>" +
      d.rows.map(function (v) {
        return '<tr data-act="edit-viewing" data-id="' + v.id + '"><td><b>' + esc(fmtDate(v.scheduled_on)) + "</b>" +
          '<span class="sub">' + esc(fmtTime(v.scheduled_time) || "—") + " · " + esc(relDays(v.scheduled_on)) + "</span></td>" +
          "<td>" + esc(v.property_title || "—") + (v.code ? '<span class="sub mono">' + esc(v.code) + (v.unit_no ? " · " + esc(v.unit_no) : "") + "</span>" : "") + "</td>" +
          "<td>" + esc(v.client_name || "—") + (v.client_phone ? '<span class="sub">' + esc(v.client_phone) + "</span>" : "") + "</td>" +
          "<td>" + esc(v.agent || "—") + "</td><td>" + pill("viewing_statuses", v.status) + "</td>" +
          '<td class="muted" style="max-width:260px">' + esc(v.feedback || "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, qs);
    $("#view").innerHTML = h;
    bindFilters(); bindRows();
  }

  // ================= 成交 =================
  async function viewDeals(r) {
    var q = r.q;
    if (canWrite()) $("#topActs").innerHTML = '<button class="btn gold" data-act="new-deal" type="button">+ ' + T("记录成交", "Log deal") + "</button>";
    var d = await api("/deals?" + new URLSearchParams(q).toString());
    var total = d.rows.reduce(function (a, x) { return a + (Number(x.commission_amount) || 0); }, 0);
    var h = '<div class="toolbar">' +
      '<select data-filter="status">' + options("deal_statuses", q.status || "", T("全部状态", "All status")) + "</select>" +
      '<select data-filter="kind">' + options("deal_kinds", q.kind || "", T("买卖 / 租赁", "Sale / Rent")) + "</select>" +
      '<span class="count">' + d.total + T(" 笔 · 本页佣金 ", " deals · commission on this page ") + fmtMoney(total) + "</span></div>";
    if (!d.rows.length) {
      h += emptyState(T("还没有成交", "No deals yet"), T("成交后会自动把房源标记为已售 / 已租。", "A completed deal marks the listing sold or rented."));
      $("#view").innerHTML = h; bindFilters(); return;
    }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("日期", "Date") + "</th><th>" + T("房源", "Listing") + "</th><th>" + T("客户", "Client") +
      "</th><th>" + T("类型", "Kind") + '</th><th class="num">' + T("成交价", "Price") + '</th><th class="num">' + T("佣金率", "Rate") +
      '</th><th class="num">' + T("佣金", "Commission") + "</th><th>" + T("状态", "Status") + "</th></tr></thead><tbody>" +
      d.rows.map(function (x) {
        return '<tr data-act="edit-deal" data-id="' + x.id + '"><td>' + esc(fmtDate(x.deal_on)) + "</td>" +
          "<td>" + esc(x.property_title || "—") + (x.code ? '<span class="sub mono">' + esc(x.code) + "</span>" : "") + "</td>" +
          "<td>" + esc(x.client_name || "—") + "</td><td>" + esc(lab("deal_kinds", x.kind)) + "</td>" +
          '<td class="num">' + esc(fmtMoney(x.price)) + '</td><td class="num">' + (x.commission_rate != null ? x.commission_rate + "%" : "—") + "</td>" +
          '<td class="num">' + esc(fmtMoney(x.commission_amount)) + "</td><td>" + pill("deal_statuses", x.status) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters(); bindRows();
  }

  // ================= 导入 / 导出 =================
  async function viewImport() {
    var h = '<div class="grid2" style="align-items:start"><div class="card"><h3>' + T("导出 CSV", "Export CSV") + "</h3>" +
      '<p class="muted" style="margin-top:0;font-size:12.5px">' + T("用 Excel 打开；中文列名不会乱码（带 BOM）。", "Opens in Excel; UTF-8 BOM keeps Chinese intact.") + "</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      ["properties", "projects", "owners", "clients", "deals", "viewings"].map(function (k) {
        return '<button class="btn ghost sm" data-act="export" data-entity="' + k + '" type="button">' + esc(entityName(k)) + "</button>";
      }).join("") + "</div>" +
      '<div class="hr"></div><h3>' + T("模板", "Templates") + '</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      ["properties", "projects", "owners", "clients", "deals", "viewings"].map(function (k) {
        return '<a class="btn ghost sm" href="/api/library/export/' + k + '/template">' + esc(entityName(k)) + " CSV</a>";
      }).join("") + "</div></div>" +
      '<div class="card"><h3>' + T("批量导入", "Bulk import") + "</h3>" +
      '<div class="field"><label>' + T("导入到", "Import into") + '</label><select id="impEntity">' +
      ["properties", "projects", "owners", "clients", "deals", "viewings"].map(function (k) {
        return '<option value="' + k + '">' + esc(entityName(k)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="drop" id="drop" style="margin-top:10px">' + T("把 CSV 拖到这里，或点击选择文件", "Drop a CSV here, or click to choose") +
      '<input type="file" id="file" accept=".csv,text/csv" hidden></div>' +
      '<div id="impInfo" class="muted" style="font-size:12px;margin-top:8px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn ghost sm" id="impPreview" type="button">' +
      T("预览校验", "Preview & validate") + '</button><button class="btn gold sm" id="impCommit" type="button" disabled>' +
      T("确认导入", "Import") + "</button></div></div></div>" +
      '<div id="impResult" style="margin-top:16px"></div>' +
      '<div class="card" style="margin-top:16px"><h3>' + T("示例数据", "Sample data") + '</h3><p class="muted" style="margin-top:0;font-size:12.5px">' +
      T("想先看看长什么样？可以一键载入 5 个楼盘 / 8 套房源 / 3 位客户，全部标记为「示例」，随时可清空。",
        "Load 5 projects, 8 listings and 3 clients marked as demo. Remove anytime.") + "</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (canWrite() ? '<button class="btn ghost sm" data-act="demo-load" type="button">' + T("载入示例", "Load sample") + "</button>" +
        '<button class="btn danger sm" data-act="demo-clear" type="button">' + T("清除示例", "Remove sample") + "</button>" : "") + "</div></div>";
    $("#view").innerHTML = h;
    bindImport();
  }
  function entityName(k) {
    return { properties: T("房源", "Listings"), projects: T("楼盘", "Projects"), owners: T("业主", "Owners"),
      clients: T("客户", "Clients"), deals: T("成交", "Deals"), viewings: T("带看", "Viewings") }[k] || k;
  }
  function bindImport() {
    var fileInput = $("#file"), drop = $("#drop"), csvText = "", entity = "properties";
    $("#impEntity").addEventListener("change", function () { entity = this.value; });
    drop.addEventListener("click", function () { fileInput.click(); });
    ["dragover", "dragenter"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("on"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("on"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer.files[0];
      if (f) readFile(f);
    });
    fileInput.addEventListener("change", function () { if (this.files[0]) readFile(this.files[0]); });
    function readFile(f) {
      var reader = new FileReader();
      reader.onload = function () {
        csvText = String(reader.result || "");
        $("#impInfo").textContent = f.name + " · " + (csvText.length / 1024).toFixed(1) + " KB";
      };
      reader.readAsText(f, "utf-8");
    }
    $("#impPreview").addEventListener("click", function () { runImport("preview"); });
    $("#impCommit").addEventListener("click", function () {
      confirmBox(T("确认写入这些记录？", "Write these records now?"), function () { runImport("commit"); });
    });
    async function runImport(mode) {
      if (!csvText) { toast(T("请先选择 CSV 文件", "Choose a CSV file first"), true); return; }
      try {
        var d = await api("/import", { method: "POST", body: { entity: entity, mode: mode, csv: csvText } });
        renderImportResult(d, mode);
        $("#impCommit").disabled = !(d.valid > 0);
      } catch (e) {
        toast(T("导入失败：", "Import failed: ") + (e.data && e.data.fields ? JSON.stringify(e.data.fields) : e.message), true);
      }
    }
  }
  function renderImportResult(d, mode) {
    var good = d.rows.filter(function (r) { return r.status === "ok"; }).length;
    var bad = d.rows.filter(function (r) { return r.status === "error"; });
    var h = '<div class="card"><h3>' + (mode === "commit" ? T("导入结果", "Import result") : T("预览结果", "Preview")) + "</h3>" +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px">' +
      "<div><b>" + d.total + "</b> " + T("行", "rows") + "</div>" +
      '<div style="color:var(--green)"><b>' + d.valid + "</b> " + T("行可导入", "valid") + "</div>" +
      '<div style="color:var(--red)"><b>' + d.invalid + "</b> " + T("行有问题", "invalid") + "</div></div>" +
      (d.unknownHeaders && d.unknownHeaders.length ? '<p class="muted" style="font-size:12px">' + T("忽略的列：", "Ignored columns: ") + esc(d.unknownHeaders.join(", ")) + "</p>" : "") +
      '<div class="preview"><table><thead><tr><th>#</th><th>' + T("状态", "Status") + "</th><th>" + T("内容", "Data") + "</th></tr></thead><tbody>" +
      d.rows.slice(0, 60).map(function (r) {
        var preview = Object.keys(r.data).slice(0, 6).map(function (k) { return k + ": " + r.data[k]; }).join(" · ");
        return "<tr><td>" + r.line + '</td><td class="' + (r.status === "ok" ? "" : "bad") + '">' +
          (r.status === "ok" ? "✓" : "✗ " + Object.keys(r.errors || {}).map(function (f) { return f + ": " + errText(r.errors[f]); }).join("; ")) +
          "</td><td>" + esc(preview) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
    $("#impResult").innerHTML = h;
    if (mode === "commit") toast(T("已导入 ", "Imported ") + d.valid + T(" 条", " rows"));
  }

  // ================= 日志 =================
  async function viewAudit(r) {
    var q = r.q;
    var d = await api("/audit?" + new URLSearchParams(q).toString());
    var h = '<div class="toolbar">' +
      '<select data-filter="entity"><option value="">' + T("全部类型", "All entities") + "</option>" +
      ["property", "project", "owner", "client", "viewing", "deal", "agent"].map(function (e) {
        return '<option value="' + e + '"' + (q.entity === e ? " selected" : "") + ">" + esc(e) + "</option>";
      }).join("") + "</select>" +
      '<select data-filter="action"><option value="">' + T("全部操作", "All actions") + "</option>" +
      ["create", "update", "delete", "import", "bulk", "export", "demo"].map(function (a) {
        return '<option value="' + a + '"' + (q.action === a ? " selected" : "") + ">" + esc(a) + "</option>";
      }).join("") + "</select>" +
      '<span class="count">' + d.total + T(" 条", " records") + "</span></div>";
    if (!d.rows.length) { $("#view").innerHTML = h + emptyState(T("暂无记录", "No activity yet"), ""); bindFilters(); return; }
    h += '<div class="tblWrap"><table class="tbl"><thead><tr><th>' + T("时间", "Time") + "</th><th>" + T("操作人", "Actor") + "</th><th>" + T("动作", "Action") +
      "</th><th>" + T("对象", "Entity") + "</th><th>" + T("编号", "ID") + "</th><th>" + T("详情", "Detail") + "</th></tr></thead><tbody>" +
      d.rows.map(function (a) {
        return '<tr style="cursor:default"><td class="muted nowrap">' + esc(fmtDateTime(a.created_at)) + "</td><td>" + esc(a.actor || "—") + "</td>" +
          "<td><span class=\"pill grey\">" + esc(a.action) + "</span></td><td>" + esc(a.entity) + "</td><td>" + (a.entity_id || "—") + "</td>" +
          '<td class="muted" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(a.detail ? JSON.stringify(a.detail) : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pagerHtml(d, q);
    $("#view").innerHTML = h;
    bindFilters();
  }

  // ================= 表单 =================
  async function loadOptions(force) {
    if (S.opts && !force) return S.opts;
    var res = await Promise.all([
      api("/projects?pageSize=200&sort=name&dir=asc"),
      api("/owners?pageSize=200"),
      api("/clients?pageSize=200"),
      api("/agents")
    ]);
    S.opts = {
      projects: res[0].rows, owners: res[1].rows, clients: res[2].rows, agents: res[3].rows
    };
    return S.opts;
  }
  function optProjects(selected) {
    return '<option value="">' + T("— 不挂楼盘（排屋 / 独立式）", "— No project") + "</option>" +
      S.opts.projects.map(function (p) {
        return '<option value="' + p.id + '"' + (Number(selected) === p.id ? " selected" : "") + ">" +
          esc(p.name + (p.name_zh ? "｜" + p.name_zh : "")) + "</option>";
      }).join("");
  }
  function optOwners(selected) {
    return '<option value="">' + T("— 未登记", "— None") + "</option>" +
      S.opts.owners.map(function (o) {
        return '<option value="' + o.id + '"' + (Number(selected) === o.id ? " selected" : "") + ">" +
          esc(o.name + (o.phone ? " · " + o.phone : "")) + "</option>";
      }).join("");
  }
  function optClients(selected) {
    return '<option value="">' + T("— 不关联客户", "— No client") + "</option>" +
      S.opts.clients.map(function (c) {
        return '<option value="' + c.id + '"' + (Number(selected) === c.id ? " selected" : "") + ">" +
          esc(c.name + (c.phone ? " · " + c.phone : "")) + "</option>";
      }).join("");
  }
  function optAgents(selected) {
    var names = S.opts.agents.map(function (a) { return a.name; });
    if (selected && names.indexOf(selected) < 0) names.unshift(selected);
    return '<option value="">' + T("— 未分配", "— Unassigned") + "</option>" +
      names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === selected ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
  }
  function fld(label, inner, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.cls ? " " + opts.cls : "") + '"><label>' + esc(label) +
      (opts.req ? ' <span class="req">*</span>' : "") + "</label>" + inner +
      (opts.hint ? '<div class="hint">' + esc(opts.hint) + "</div>" : "") + "</div>";
  }
  function inp(name, value, opts) {
    opts = opts || {};
    return '<input name="' + name + '" type="' + (opts.type || "text") + '" value="' + esc(value == null ? "" : value) + '"' +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + (opts.step ? ' step="' + opts.step + '"' : "") +
      (opts.min != null ? ' min="' + opts.min + '"' : "") + (opts.max != null ? ' max="' + opts.max + '"' : "") +
      (opts.disabled ? " disabled" : "") + ">";
  }
  function sel(name, html) { return '<select name="' + name + '">' + html + "</select>"; }
  function ta(name, value, ph) {
    return '<textarea name="' + name + '" placeholder="' + esc(ph || "") + '">' + esc(value || "") + "</textarea>";
  }

  // ---------- 房源表单 ----------
  async function openPropertyForm(row) {
    await loadOptions();
    var p = row || {};
    var isNew = !row;
    var body = '<form id="pForm" novalidate>' +
      '<div class="formSec">' + T("基本信息", "Basics") + "</div>" +
      '<div class="formGrid">' +
      fld(T("楼盘", "Project"), sel("project_id", optProjects(p.project_id))) +
      fld(T("或自由填写项目名", "Or project name"), inp("project_name", p.project_name, { ph: "Taman Sutera / 排屋" })) +
      fld(T("区域", "Area"), sel("area_code", options("areas", p.area_code, T("— 选择区域", "— Select area")))) +
      fld(T("房型", "Type"), sel("property_type", options("property_types", p.property_type, T("— 选择", "— Select")))) +
      fld(T("产权", "Tenure"), sel("tenure", options("tenures", p.tenure, T("— 选择", "— Select")))) +
      fld(T("地址", "Address"), inp("address", p.address)) +
      fld(T("座 / Block", "Block"), inp("block", p.block)) +
      fld(T("单位号", "Unit no."), inp("unit_no", p.unit_no, { ph: "12-03" })) +
      fld(T("楼层", "Floor"), inp("floor", p.floor, { type: "number" })) +
      "</div>" +
      '<div class="formSec">' + T("面积与格局", "Size & layout") + "</div>" +
      '<div class="formGrid">' +
      fld(T("建筑面积 (sqft)", "Built-up (sqft)"), inp("built_up", p.built_up, { type: "number", step: "1" })) +
      fld(T("土地面积 (sqft)", "Land (sqft)"), inp("land_area", p.land_area, { type: "number", step: "1" })) +
      fld(T("房间", "Bedrooms"), inp("bedrooms", p.bedrooms, { type: "number" })) +
      fld(T("卫浴", "Bathrooms"), inp("bathrooms", p.bathrooms, { type: "number" })) +
      fld(T("车位", "Car parks"), inp("carparks", p.carparks, { type: "number" })) +
      fld(T("朝向", "Facing"), inp("facing", p.facing)) +
      fld(T("装修", "Furnishing"), sel("furnishing", options("furnishings", p.furnishing, T("— 选择", "— Select")))) +
      fld(T("状况", "Condition"), sel("condition", options("conditions", p.condition, T("— 选择", "— Select")))) +
      fld(T("地契", "Title type"), sel("title_type", options("title_types", p.title_type, T("— 选择", "— Select")))) +
      "</div>" +
      '<div class="formSec">' + T("价格与状态", "Price & status") + "</div>" +
      '<div class="formGrid">' +
      fld(T("出售 / 出租", "Sale / Rent"), sel("intent", options("listing_intents", p.intent || "sale", false))) +
      fld(T("售价 (RM)", "Asking price"), inp("asking_price", p.asking_price, { type: "number", step: "1000" })) +
      fld(T("租金 (RM / 月)", "Monthly rent"), inp("rent_price", p.rent_price, { type: "number", step: "100" })) +
      fld(T("管理费 (RM / 月)", "Maintenance"), inp("maintenance_fee", p.maintenance_fee, { type: "number", step: "10" })) +
      fld(T("状态", "Status"), sel("status", options("listing_statuses", p.status || "available", false))) +
      fld(T("挂牌日", "Listed on"), inp("listed_on", p.listed_on, { type: "date" })) +
      "</div>" +
      '<div class="formSec">' + T("归属与备注", "Ownership & notes") + "</div>" +
      '<div class="formGrid">' +
      fld(T("业主", "Owner"), sel("owner_id", optOwners(p.owner_id))) +
      fld(T("中介", "Agent"), sel("agent", optAgents(p.agent))) +
      fld(T("独家", "Exclusive"), '<label class="chk" style="margin-top:8px"><input type="checkbox" name="exclusive"' + (p.exclusive ? " checked" : "") + "> " + T("签了独家", "Exclusive mandate") + "</label>") +
      '<div class="span3">' + fld(T("卖点标签", "Highlights"), '<div style="display:flex;flex-wrap:wrap;gap:6px 14px">' +
        list("tags").map(function (t) {
          var on = (p.tags || []).indexOf(t.key) >= 0;
          return '<label class="chk" style="margin:0"><input type="checkbox" name="tags" value="' + t.key + '"' + (on ? " checked" : "") + "> " + esc(T(t.zh, t.en)) + "</label>";
        }).join("") + "</div>") + "</div>" +
      '<div class="span3">' + fld(T("备注", "Notes"), ta("remarks", p.remarks, T("屋况、钥匙、屋主底线、租约…", "Condition, keys, owner's floor price, tenancy…"))) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: isNew ? T("新增房源", "New listing") : T("编辑房源 ", "Edit listing ") + (p.code || ""),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        '<button class="btn gold" id="pSave" type="button">' + T("保存", "Save") + "</button>"
    });
    var form = $("#pForm", m.root);
    // 选楼盘 → 自动带出区域/房型/产权
    $('[name="project_id"]', form).addEventListener("change", function () {
      var pid = Number(this.value);
      var pr = S.opts.projects.filter(function (x) { return x.id === pid; })[0];
      if (!pr) return;
      var f = function (n) { return form.querySelector('[name="' + n + '"]'); };
      if (!f("area_code").value) f("area_code").value = pr.area_code || "";
      if (!f("property_type").value) f("property_type").value = pr.property_type || "";
      if (!f("tenure").value) f("tenure").value = pr.tenure || "";
      if (!f("address").value) f("address").value = pr.address || "";
    });
    $("#pSave", m.root).addEventListener("click", async function () {
      var btn = this; btn.disabled = true;
      try {
        var payload = collect(form);
        var res = isNew
          ? await api("/properties", { method: "POST", body: payload })
          : await api("/properties/" + p.id, { method: "PATCH", body: payload });
        m.close(); toast(T("已保存", "Saved"));
        S.opts = null;
        if (isNew) go("/properties/" + res.row.id); else render();
      } catch (e) {
        btn.disabled = false;
        if (e.data && e.data.fields) { showFieldErrors(form, e.data.fields); m.msg(T("请检查标红的字段", "Check the highlighted fields")); }
        else m.msg(e.message === "duplicate_unit" ? errText("duplicate_unit") : (e.message || "failed"));
      }
    });
  }

  function collect(form) {
    var out = {};
    $$("input,select,textarea", form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") {
        if (el.name === "tags") {
          out.tags = out.tags || [];
          if (el.checked) out.tags.push(el.value);
        } else {
          out[el.name] = el.checked;
        }
        return;
      }
      out[el.name] = el.value;
    });
    return out;
  }

  // ---------- 楼盘表单 ----------
  async function openProjectForm(row) {
    var p = row || {};
    if (!row) S.opts = S.opts || null;
    var body = '<form id="prForm" novalidate><div class="formGrid">' +
      fld(T("楼盘名称", "Project name"), inp("name", p.name), { req: true }) +
      fld(T("中文名", "Chinese name"), inp("name_zh", p.name_zh)) +
      fld(T("开发商", "Developer"), inp("developer", p.developer)) +
      fld(T("区域", "Area"), sel("area_code", options("areas", p.area_code, T("— 选择", "— Select")))) +
      fld(T("房型", "Type"), sel("property_type", options("property_types", p.property_type, T("— 选择", "— Select")))) +
      fld(T("产权", "Tenure"), sel("tenure", options("tenures", p.tenure, T("— 选择", "— Select")))) +
      fld(T("总单位数", "Total units"), inp("total_units", p.total_units, { type: "number" })) +
      fld(T("座数", "Blocks"), inp("blocks", p.blocks, { type: "number" })) +
      fld(T("落成年份", "Completed"), inp("completion_year", p.completion_year, { type: "number" })) +
      '<div class="span3">' + fld(T("地址", "Address"), inp("address", p.address)) + "</div>" +
      '<div class="span3">' + fld(T("设施 / 卖点", "Facilities"), ta("facilities", p.facilities)) + "</div>" +
      '<div class="span3">' + fld(T("备注", "Notes"), ta("remarks", p.remarks)) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: row ? T("编辑楼盘", "Edit project") : T("新增楼盘", "New project"),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        '<button class="btn gold" id="prSave" type="button">' + T("保存", "Save") + "</button>"
    });
    $("#prSave", m.root).addEventListener("click", async function () {
      this.disabled = true;
      var form = $("#prForm", m.root);
      try {
        if (row) await api("/projects/" + p.id, { method: "PATCH", body: collect(form) });
        else await api("/projects", { method: "POST", body: collect(form) });
        m.close(); S.opts = null; toast(T("已保存", "Saved")); render();
      } catch (e) {
        this.disabled = false;
        if (e.data && e.data.fields) showFieldErrors(form, e.data.fields);
        m.msg(e.message === "duplicate_project" ? errText("duplicate_project") : e.message);
      }
    });
  }

  // ---------- 业主表单 ----------
  async function openOwnerForm(row) {
    var o = row || {};
    var body = '<form id="owForm" novalidate><div class="formGrid">' +
      fld(T("姓名", "Name"), inp("name", o.name), { req: true }) +
      fld(T("电话", "Phone"), inp("phone", o.phone, { ph: "012-345 6789" })) +
      fld(T("备用电话", "Alt phone"), inp("phone2", o.phone2)) +
      fld(T("邮箱", "Email"), inp("email", o.email, { type: "email" })) +
      fld(T("身份证后 4 位", "IC last 4"), inp("id_last4", o.id_last4)) +
      fld(T("来源", "Source"), sel("source", options("sources", o.source, T("— 选择", "— Select")))) +
      '<div class="span3">' + fld(T("地址", "Address"), inp("address", o.address)) + "</div>" +
      '<div class="span3">' + fld(T("备注", "Notes"), ta("remarks", o.remarks)) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: row ? T("编辑业主", "Edit owner") : T("新增业主", "New owner"),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        '<button class="btn gold" id="owSave" type="button">' + T("保存", "Save") + "</button>"
    });
    var form = $("#owForm", m.root);
    $("#owSave", m.root).addEventListener("click", async function () {
      this.disabled = true;
      try {
        if (row) await api("/owners/" + o.id, { method: "PATCH", body: collect(form) });
        else await api("/owners", { method: "POST", body: collect(form) });
        m.close(); S.opts = null; toast(T("已保存", "Saved")); render();
      } catch (e) {
        this.disabled = false;
        if (e.data && e.data.fields) showFieldErrors(form, e.data.fields);
        else m.msg(e.message);
      }
    });
  }

  // ---------- 客户表单 ----------
  async function openClientForm(row) {
    var c = row || {};
    var areaChips = '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;max-height:150px;overflow:auto">' +
      list("areas").map(function (a) {
        var on = (c.area_codes || []).indexOf(a.key) >= 0;
        return '<label class="chk" style="margin:0"><input type="checkbox" name="area_codes" value="' + a.key + '"' + (on ? " checked" : "") + "> " + esc(T(a.zh, a.en)) + "</label>";
      }).join("") + "</div>";
    var typeChips = '<div style="display:flex;flex-wrap:wrap;gap:6px 14px">' +
      list("property_types").map(function (a) {
        var on = (c.property_types || []).indexOf(a.key) >= 0;
        return '<label class="chk" style="margin:0"><input type="checkbox" name="property_types" value="' + a.key + '"' + (on ? " checked" : "") + "> " + esc(T(a.zh, a.en)) + "</label>";
      }).join("") + "</div>";
    var body = '<form id="clForm" novalidate><div class="formGrid">' +
      fld(T("姓名", "Name"), inp("name", c.name), { req: true }) +
      fld(T("电话", "Phone"), inp("phone", c.phone)) +
      fld(T("邮箱", "Email"), inp("email", c.email, { type: "email" })) +
      fld(T("意向", "Intent"), sel("intent", options("client_intents", c.intent, T("— 选择", "— Select")))) +
      fld(T("预算下限", "Budget min"), inp("budget_min", c.budget_min, { type: "number" })) +
      fld(T("预算上限", "Budget max"), inp("budget_max", c.budget_max, { type: "number" })) +
      fld(T("最少房间", "Min bedrooms"), inp("bedrooms_min", c.bedrooms_min, { type: "number" })) +
      fld(T("时间", "Timeline"), sel("timeline", options("timelines", c.timeline, T("— 选择", "— Select")))) +
      fld(T("来源", "Source"), sel("source", options("sources", c.source, T("— 选择", "— Select")))) +
      fld(T("状态", "Status"), sel("status", options("client_statuses", c.status || "new", false))) +
      fld(T("中介", "Agent"), sel("agent", optAgents(c.agent))) +
      '<div class="span3">' + fld(T("想看哪些区域", "Preferred areas"), areaChips) + "</div>" +
      '<div class="span3">' + fld(T("房型", "Property types"), typeChips) + "</div>" +
      '<div class="span3">' + fld(T("备注", "Notes"), ta("remarks", c.remarks)) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: row ? T("编辑客户", "Edit client") : T("新增客户", "New client"),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        '<button class="btn gold" id="clSave" type="button">' + T("保存", "Save") + "</button>"
    });
    var form = $("#clForm", m.root);
    $("#clSave", m.root).addEventListener("click", async function () {
      this.disabled = true;
      try {
        var payload = collect(form);
        payload.area_codes = $$('[name="area_codes"]:checked', form).map(function (x) { return x.value; });
        payload.property_types = $$('[name="property_types"]:checked', form).map(function (x) { return x.value; });
        delete payload.area_codes_dup;
        if (row) await api("/clients/" + c.id, { method: "PATCH", body: payload });
        else await api("/clients", { method: "POST", body: payload });
        m.close(); S.opts = null; toast(T("已保存", "Saved")); render();
      } catch (e) {
        this.disabled = false;
        if (e.data && e.data.fields) showFieldErrors(form, e.data.fields);
        else m.msg(e.message);
      }
    });
  }

  // ---------- 带看表单 ----------
  async function openViewingForm(row, presetProperty) {
    await loadOptions();
    await loadAllProperties();
    var v = row || {};
    var body = '<form id="vwForm" novalidate><div class="formGrid">' +
      fld(T("房源", "Listing"), sel("property_id", '<option value="">' + T("— 选择房源", "— Select") + "</option>" +
        S.opts.propsAll.map(function (p) {
          var sel2 = Number(v.property_id || presetProperty) === p.id ? " selected" : "";
          return '<option value="' + p.id + '"' + sel2 + ">" + esc(p.code + " · " + (p.project_title || p.project_name || "") + (p.unit_no ? " " + p.unit_no : "")) + "</option>";
        }).join("")), { req: true }) +
      fld(T("客户", "Client"), sel("client_id", optClients(v.client_id))) +
      fld(T("中介", "Agent"), sel("agent", optAgents(v.agent))) +
      fld(T("日期", "Date"), inp("scheduled_on", v.scheduled_on || new Date().toISOString().slice(0, 10), { type: "date" })) +
      fld(T("时间", "Time"), inp("scheduled_time", v.scheduled_time || "15:00", { type: "time" })) +
      fld(T("状态", "Status"), sel("status", options("viewing_statuses", v.status || "scheduled", false))) +
      '<div class="span3">' + fld(T("反馈", "Feedback"), ta("feedback", v.feedback)) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: row ? T("编辑带看", "Edit viewing") : T("安排带看", "Schedule viewing"),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        (row && canWrite() ? '<button class="btn danger" id="vwDel" type="button">' + T("删除", "Delete") + "</button>" : "") +
        '<button class="btn gold" id="vwSave" type="button">' + T("保存", "Save") + "</button>"
    });
    var form = $("#vwForm", m.root);
    if (row) $("#vwDel", m.root).addEventListener("click", function () {
      confirmBox(T("删除这条带看记录？", "Delete this viewing?"), async function () {
        try { await api("/viewings/" + v.id, { method: "DELETE" }); m.close(); toast(T("已删除", "Deleted")); render(); }
        catch (e) { toast(e.message, true); }
      });
    });
    $("#vwSave", m.root).addEventListener("click", async function () {
      this.disabled = true;
      try {
        if (row) await api("/viewings/" + v.id, { method: "PATCH", body: collect(form) });
        else await api("/viewings", { method: "POST", body: collect(form) });
        m.close(); toast(T("已保存", "Saved")); render();
      } catch (e) {
        this.disabled = false;
        if (e.data && e.data.fields) showFieldErrors(form, e.data.fields); else m.msg(e.message);
      }
    });
  }

  // ---------- 成交表单 ----------
  async function openDealForm(row, presetProperty) {
    await loadOptions();
    await loadAllProperties();
    var d = row || {};
    var body = '<form id="dlForm" novalidate><div class="formGrid">' +
      fld(T("房源", "Listing"), sel("property_id", '<option value="">' + T("— 选择房源", "— Select") + "</option>" +
        S.opts.propsAll.map(function (p) {
          var s2 = Number(d.property_id || presetProperty) === p.id ? " selected" : "";
          return '<option value="' + p.id + '"' + s2 + ">" + esc(p.code + " · " + (p.project_title || p.project_name || "") + (p.unit_no ? " " + p.unit_no : "")) + "</option>";
        }).join(""))) +
      fld(T("客户", "Client"), sel("client_id", optClients(d.client_id))) +
      fld(T("类型", "Kind"), sel("kind", options("deal_kinds", d.kind || "sale", false))) +
      fld(T("成交价", "Price"), inp("price", d.price, { type: "number", step: "1000" })) +
      fld(T("日期", "Date"), inp("deal_on", d.deal_on || new Date().toISOString().slice(0, 10), { type: "date" })) +
      fld(T("佣金率 %", "Commission %"), inp("commission_rate", d.commission_rate, { type: "number", step: "0.1" })) +
      fld(T("佣金金额", "Commission"), inp("commission_amount", d.commission_amount, { type: "number", step: "100" }), { hint: T("留空则按成交价 × 佣金率自动算", "Blank = price × rate") }) +
      fld(T("中介", "Agent"), sel("agent", optAgents(d.agent))) +
      fld(T("状态", "Status"), sel("status", options("deal_statuses", d.status || "completed", false))) +
      '<div class="span3">' + fld(T("备注", "Notes"), ta("remarks", d.remarks)) + "</div>" +
      "</div></form>";
    var m = openModal({
      title: row ? T("编辑成交", "Edit deal") : T("记录成交", "Log deal"),
      body: body,
      footer: '<button class="btn ghost" data-close type="button">' + T("取消", "Cancel") + "</button>" +
        (row && canWrite() ? '<button class="btn danger" id="dlDel" type="button">' + T("删除", "Delete") + "</button>" : "") +
        '<button class="btn gold" id="dlSave" type="button">' + T("保存", "Save") + "</button>"
    });
    var form = $("#dlForm", m.root);
    if (row) $("#dlDel", m.root).addEventListener("click", function () {
      confirmBox(T("删除这条成交记录？房源状态不会自动改回。", "Delete this deal? Listing status will not revert."), async function () {
        try { await api("/deals/" + d.id, { method: "DELETE" }); m.close(); toast(T("已删除", "Deleted")); render(); }
        catch (e) { toast(e.message, true); }
      });
    });
    $("#dlSave", m.root).addEventListener("click", async function () {
      this.disabled = true;
      try {
        if (row) await api("/deals/" + d.id, { method: "PATCH", body: collect(form) });
        else await api("/deals", { method: "POST", body: collect(form) });
        m.close(); toast(T("已保存", "Saved")); render();
      } catch (e) {
        this.disabled = false;
        if (e.data && e.data.fields) showFieldErrors(form, e.data.fields); else m.msg(e.message);
      }
    });
  }

  // ---------- 快捷操作 ----------
  async function loadAllProperties() {
    if (S.opts && S.opts.propsAll) return;
    var all = [], page = 1;
    for (;;) {
      var d = await api("/properties?pageSize=200&page=" + page + "&sort=code&dir=desc");
      all = all.concat(d.rows);
      if (all.length >= d.total || page > 25) break;
      page++;
    }
    S.opts = S.opts || {};
    S.opts.propsAll = all;
  }

  // ================= 事件绑定 =================
  function bindRows() {
    $$("[data-href]").forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("input") || e.target.closest("a") || e.target.closest("button")) return;
        location.hash = tr.getAttribute("data-href");
      });
    });
    $$("[data-act='edit-owner'], [data-act='edit-client'], [data-act='edit-viewing'], [data-act='edit-deal'], [data-act='edit-property']").forEach(function (tr) {
      if (tr.tagName !== "TR") return;
      tr.addEventListener("click", function (e) {
        if (e.target.closest("input") || e.target.closest("a") || e.target.closest("button")) return;
        handleAction(tr.getAttribute("data-act"), tr);
      });
    });
  }
  function bindFilters() {
    var form = $("#view");
    var timer = null;
    $$("[data-filter]", form).forEach(function (el) {
      var ev = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(ev, function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          var q = {};
          $$("[data-filter]", form).forEach(function (x) { if (x.value) q[x.dataset.filter] = x.value; });
          var r = parseHash();
          go(r.path, q);
        }, el.tagName === "SELECT" ? 0 : 320);
      });
    });
    $$("[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var r = parseHash(), q = Object.assign({}, r.q);
        var col = th.dataset.sort;
        if (q.sort === col) q.dir = q.dir === "asc" ? "desc" : "asc";
        else { q.sort = col; q.dir = "desc"; }
        delete q.page;
        go(r.path, q);
      });
    });
  }
  function bindBulk() {
    var selAll = $("#selAll");
    if (!selAll) return;
    var bar = $("#bulkbar");
    function refresh() {
      var ids = $$(".rowSel:checked").map(function (x) { return x.dataset.id; });
      bar.hidden = ids.length === 0;
      $("#bulkN").textContent = ids.length;
      $$("tbody tr").forEach(function (tr) {
        var cb = $(".rowSel", tr);
        if (cb) tr.classList.toggle("sel", cb.checked);
      });
    }
    selAll.addEventListener("change", function () {
      $$(".rowSel").forEach(function (cb) { cb.checked = selAll.checked; });
      refresh();
    });
    $$(".rowSel").forEach(function (cb) { cb.addEventListener("change", refresh); });
  }
  function selectedIds() { return $$(".rowSel:checked").map(function (x) { return Number(x.dataset.id); }); }

  async function bulk(action, value) {
    var ids = selectedIds();
    if (!ids.length) return;
    if (action === "delete") {
      confirmBox(T("删除 ", "Delete ") + ids.length + T(" 条房源？不可恢复。", " listings? This cannot be undone."), async function () {
        try { await api("/properties/bulk", { method: "POST", body: { ids: ids, action: "delete" } }); toast(T("已删除", "Deleted")); S.opts = null; render(); }
        catch (e) { toast(e.message, true); }
      });
      return;
    }
    try {
      await api("/properties/bulk", { method: "POST", body: { ids: ids, action: action, value: value } });
      toast(T("已更新 ", "Updated ") + ids.length + T(" 条", " rows"));
      S.opts = null;
      render();
    } catch (e) { toast(e.message, true); }
  }

  async function handleAction(act, el) {
    var id = Number(el && el.dataset.id);
    try {
      if (act === "new-property") return openPropertyForm(null);
      if (act === "edit-property") { var d = await api("/properties/" + id); return openPropertyForm(d.row); }
      if (act === "del-property") {
        return confirmBox(T("删除这条房源？改价、带看记录也会一起删除。", "Delete this listing and its history?"), async function () {
          await api("/properties/" + id, { method: "DELETE" });
          toast(T("已删除", "Deleted")); S.opts = null;
          if (location.hash.indexOf("#/properties/") === 0) go("/properties"); else render();
        });
      }
      if (act === "calc") {
        var cp = await api("/properties/" + id);
        window.open(calcLink(cp.row), "_blank", "noopener");
        return;
      }
      if (act === "copy-prop") {
        var cpp = await api("/properties/" + id);
        var okc = await copyText(propText(cpp.row));
        toast(okc ? T("资料已复制，可直接粘贴到 WhatsApp", "Details copied — paste into WhatsApp") : T("复制失败", "Copy failed"), !okc);
        return;
      }
      if (act === "new-project") return openProjectForm(null);
      if (act === "new-owner") return openOwnerForm(null);
      if (act === "new-client") return openClientForm(null);
      if (act === "new-viewing") return openViewingForm(null, id || null);
      if (act === "new-deal") return openDealForm(null, id || null);
      if (act === "edit-owner") { var o = await api("/owners/" + id); return openOwnerForm(o.row); }
      if (act === "edit-client") { var c = await api("/clients/" + id); return openClientForm(c.row); }
      if (act === "edit-viewing") { var v = await api("/viewings/" + id); return openViewingForm(v.row); }
      if (act === "edit-deal") { var dd = await api("/deals/" + id); return openDealForm(dd.row); }
      if (act === "bulk-status") return bulk("status", $("#bulkStatus").value);
      if (act === "bulk-agent") return bulk("agent", $("#bulkAgent").value);
      if (act === "bulk-delete") return bulk("delete");
      if (act === "bulk-clear") return render();
      if (act === "export") {
        var r = await api("/export/" + el.dataset.entity + "?lang=" + S.lang);
        download(r.blob, r.filename);
        return;
      }
      if (act === "demo-load") {
        return confirmBox(T("载入示例数据？（全部标记为示例，可一键清除）", "Load sample data? (marked as demo)"), async function () {
          try {
            var res = await api("/demo", { method: "POST" });
            toast(res.skipped ? T("示例数据已存在", "Sample data already exists") : T("已载入示例", "Sample loaded"));
            S.opts = null; render();
          } catch (e) { toast(e.message, true); }
        });
      }
      if (act === "demo-clear") {
        return confirmBox(T("清除所有示例数据？", "Remove all sample data?"), async function () {
          try { await api("/demo", { method: "DELETE" }); toast(T("已清除", "Removed")); S.opts = null; render(); }
          catch (e) { toast(e.message, true); }
        });
      }
    } catch (e) {
      toast(e.message || "error", true);
    }
  }
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // 全局点击：按钮 / 分页 / 重置
  document.addEventListener("click", function (e) {
    var pageBtn = e.target.closest('[data-act="page"]');
    if (pageBtn) {
      var qs = pageBtn.dataset.q;
      var r = parseHash();
      location.hash = "#" + r.path + (qs ? "?" + qs : "");
      return;
    }
    if (e.target.closest('[data-act="reset"]')) {
      var rr = parseHash();
      go(rr.path, {});
      return;
    }
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.dataset.act;
    if (act === "page" || act === "reset") return;
    if (el.tagName === "TR") return; // 行点击在 bindRows 里处理
    handleAction(act, el);
  });

  // ================= 启动 =================
  $("#gateForm").addEventListener("submit", loginFlow);
  $("#gLang").addEventListener("click", function () {
    S.lang = S.lang === "zh" ? "en" : "zh";
    localStorage.setItem("pb_lang", S.lang);
    gateText();
    if (!$("#app").hidden) { $("#langBtn").textContent = S.lang === "zh" ? "EN" : "中文"; render(); }
  });
  $("#langBtn").addEventListener("click", function () {
    S.lang = S.lang === "zh" ? "en" : "zh";
    localStorage.setItem("pb_lang", S.lang);
    $("#langBtn").textContent = S.lang === "zh" ? "EN" : "中文";
    render();
  });
  $("#logoutBtn").addEventListener("click", async function () {
    try { await adminApi("/api/admin/logout", {}); } catch (e) { /* ignore */ }
    S.taxonomy = null; S.me = null; S.opts = null;
    showGate();
  });
  $("#burger").addEventListener("click", function () {
    var side = $("#side");
    side.classList.toggle("on");
  });

  var lastMobile = window.matchMedia("(max-width:820px)").matches;
  window.addEventListener("resize", function () {
    var nowMobile = window.matchMedia("(max-width:820px)").matches;
    if (nowMobile !== lastMobile) { lastMobile = nowMobile; render(); }
  });

  (async function init() {
    if (location.hash === "" || location.hash === "#") location.hash = "#/";
    try {
      var meta = await api("/meta");
      S.taxonomy = meta.taxonomy;
      S.me = { email: meta.email, role: meta.role };
      await boot();
    } catch (e) {
      if (e.message === "auth_required") showGate();
    }
  })();
})();
