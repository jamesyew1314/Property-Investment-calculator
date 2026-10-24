"use strict";
const express = require("express");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const nodemailer = require("nodemailer");
const { buildReceiptPdf } = require("./receipt-pdf");
const pathMod = require("node:path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const FREE_QUOTA = 0;
const SESSION_DAYS = 30;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

// ---------- helpers ----------
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function scryptHash(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function scryptVerify(pw, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const calc = crypto.scryptSync(pw, parts[0], 64);
  const known = Buffer.from(parts[1], "hex");
  return calc.length === known.length && crypto.timingSafeEqual(calc, known);
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name || null, plan: u.plan, planExpiresAt: u.plan_expires_at,
           emailVerified: !!u.email_verified_at };
}
function quotaFor(u) {
  const paid = u.plan === "pro" && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
  return paid ? null : FREE_QUOTA;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", "fc_sid=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + (SESSION_DAYS * 86400));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "fc_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
}
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + ($3 || ' days')::interval)",
    [sha256(token), userId, SESSION_DAYS]
  );
  return token;
}

async function sendVerifyMail(userId, email) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO email_verifications(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '24 hours')", [userId, sha256(token)]);
  const link = "https://kwongthye.com/calc/?verify=" + token;
  const text = [
    "您好 / Hello,",
    "",
    "感谢注册 KWONG THYE。请点击以下链接验证您的邮箱（24 小时内有效）：",
    "Thank you for signing up. Please verify your email (valid for 24 hours):",
    "",
    link,
    "",
    "如果这不是您本人的操作，请忽略此邮件。",
    "If you did not create an account, please ignore this email.",
    "",
    "KWONG THYE 光泰",
    "https://kwongthye.com"
  ].join("\n");
  return sendMail(email, "验证邮箱 / Verify your email — KWONG THYE", text);
}

let smtpTransport = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: (process.env.SMTP_SECURE || "true") !== "false",
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail(to, subject, text, replyToOverride, attachments) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || (process.env.SMTP_USER ? "KWONG THYE <" + process.env.SMTP_USER + ">" : "KWONG THYE <noreply@kwongthye.com>");
  const replyTo = replyToOverride || process.env.MAIL_REPLY_TO || "jamesyew1314@gmail.com";
  if (smtpTransport) {
    try {
      await smtpTransport.sendMail({ from: from, to: to, replyTo: replyTo, subject: subject, text: text, attachments: attachments || [] });
    } catch (e1) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      await smtpTransport.sendMail({ from: from, to: to, replyTo: replyTo, subject: subject, text: text, attachments: attachments || [] });
    }
    return "sent";
  }
  if (key) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from, to: [to], reply_to: replyTo, subject: subject, text: text, attachments: (attachments || []).map(function (a) { return { filename: a.filename, content: Buffer.from(a.content).toString("base64") }; }) })
    });
    if (!r.ok) throw new Error("mail_failed");
    return "sent";
  }
  await fsp.appendFile(pathMod.join(__dirname, "mail.log"),
    [new Date().toISOString(), "TO:", to, "|", subject, "|", text.replace(/\n/g, " ")].join(" ") + "\n");
  return "logged";
}

// ---------- middleware ----------
const hits = new Map();
function rateLimit(max, windowMs) {
  return function (req, res, next) {
    const key = (req.ip || "") + ":" + req.path;
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || now > rec.reset) { rec = { n: 0, reset: now + windowMs }; hits.set(key, rec); }
    rec.n++;
    if (rec.n > max) return res.status(429).json({ ok: false, error: "rate_limited" });
    next();
  };
}
app.use("/api", function (req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].indexOf(req.method) >= 0) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return res.status(403).json({ ok: false, error: "bad_origin" });
      } catch (e) {
        return res.status(403).json({ ok: false, error: "bad_origin" });
      }
    }
  }
  next();
});
const requireAuth = async function (req, res, next) {
  try {
    const token = parseCookies(req).fc_sid;
    if (!token) return res.status(401).json({ ok: false, error: "auth_required" });
    const r = await pool.query(
      "SELECT u.id,u.email,u.display_name,u.plan,u.plan_expires_at,u.email_verified_at " +
      "FROM sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.token_hash = $1 AND s.expires_at > now()", [sha256(token)]);
    if (!r.rows[0]) return res.status(401).json({ ok: false, error: "auth_required" });
    req.user = r.rows[0];
    next();
  } catch (e) { next(e); }
};

// ---------- health ----------
app.get("/api/health", async function (req, res) {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, db: true, time: r.rows[0].now, version: process.env.APP_VERSION || "0.36.0" });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, error: "db_unavailable" });
  }
});

// ---------- auth ----------
app.post("/api/auth/register", rateLimit(5, 60000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const ex = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
    if (ex.rowCount) return res.status(409).json({ ok: false, error: "email_exists" });
    const r = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,display_name,plan,plan_expires_at",
      [email, scryptHash(password)]);
    const token = await createSession(r.rows[0].id);
    setSessionCookie(res, token);
    try {
      const mr = await sendVerifyMail(r.rows[0].id, r.rows[0].email);
      console.log("verify mail", mr, r.rows[0].email);
    } catch (e) {
      console.error("verify mail failed", r.rows[0].email, e.message);
    }
    res.status(201).json({ ok: true, user: publicUser(r.rows[0]) });
  } catch (e) { next(e); }
});

app.post("/api/auth/login", rateLimit(5, 60000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    const r = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    const u = r.rows[0];
    if (!u || !scryptVerify(password, u.password_hash)) return res.status(401).json({ ok: false, error: "bad_credentials" });
    const token = await createSession(u.id);
    setSessionCookie(res, token);
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { next(e); }
});

app.post("/api/auth/logout", async function (req, res, next) {
  try {
    const token = parseCookies(req).fc_sid;
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [sha256(token)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/me", requireAuth, async function (req, res, next) {
  try {
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    res.json({ ok: true, user: publicUser(req.user), plans: c.rows[0].n, quota: quotaFor(req.user) });
  } catch (e) { next(e); }
});

// ---------- password reset / account ----------
app.post("/api/auth/forgot", rateLimit(5, 900000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    const u = await pool.query("SELECT id,email FROM users WHERE email=$1", [email]);
    if (u.rows[0]) {
      const token = crypto.randomBytes(32).toString("hex");
      await pool.query("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '1 hour')", [u.rows[0].id, sha256(token)]);
      const link = "https://kwongthye.com/calc/?reset=" + token;
      const text = [
        "您好 / Hello,",
        "",
        "请点击以下链接重置您的 KWONG THYE 账户密码（1 小时内有效）：",
        "Click the link below to reset your KWONG THYE password (valid for 1 hour):",
        "",
        link,
        "",
        "如果这不是您本人的操作，请忽略此邮件。",
        "If you did not request this, please ignore this email.",
        "",
        "KWONG THYE 光泰",
        "https://kwongthye.com"
      ].join("\n");
      try {
        const r = await sendMail(email, "重置密码 / Reset your password — KWONG THYE", text);
        console.log("reset mail", r, email);
      } catch (e) {
        console.error("reset mail failed", email, e.message);
      }
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/auth/reset", rateLimit(10, 600000), async function (req, res, next) {
  try {
    const token = String((req.body || {}).token || "");
    const password = String((req.body || {}).password || "");
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const r = await pool.query("SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()", [sha256(token)]);
    const row = r.rows[0];
    if (!row) return res.status(400).json({ ok: false, error: "invalid_token" });
    await pool.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2", [scryptHash(password), row.user_id]);
    await pool.query("UPDATE password_resets SET used_at=now() WHERE id=$1", [row.id]);
    await pool.query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/auth/change-password", requireAuth, rateLimit(10, 600000), async function (req, res, next) {
  try {
    const current = String((req.body || {}).current || "");
    const password = String((req.body || {}).password || "");
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const r = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!scryptVerify(current, r.rows[0].password_hash)) return res.status(400).json({ ok: false, error: "bad_current" });
    await pool.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2", [scryptHash(password), req.user.id]);
    const token = parseCookies(req).fc_sid;
    if (token) await pool.query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", [req.user.id, sha256(token)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete("/api/me", requireAuth, async function (req, res, next) {
  try {
    await pool.query("DELETE FROM users WHERE id=$1", [req.user.id]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- email verification ----------
app.post("/api/auth/verify-email", rateLimit(20, 600000), async function (req, res, next) {
  try {
    const token = String((req.body || {}).token || "");
    const r = await pool.query("SELECT * FROM email_verifications WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()", [sha256(token)]);
    const row = r.rows[0];
    if (!row) return res.status(400).json({ ok: false, error: "invalid_token" });
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1 AND email_verified_at IS NULL", [row.user_id]);
    await pool.query("UPDATE email_verifications SET used_at=now() WHERE id=$1", [row.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/auth/resend-verification", requireAuth, rateLimit(3, 900000), async function (req, res, next) {
  try {
    const r = await pool.query("SELECT email, email_verified_at FROM users WHERE id=$1", [req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    if (r.rows[0].email_verified_at) return res.json({ ok: true, already: true });
    await sendVerifyMail(req.user.id, r.rows[0].email);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/payments", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT id, receipt_no, days, amount, currency, expires_after, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]);
    res.json({ ok: true, payments: r.rows, user: { email: req.user.email } });
  } catch (e) { next(e); }
});

app.get("/api/payments/:id/receipt.pdf", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query("SELECT * FROM payments WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ ok: false, error: "not_found" });
    const pdf = await buildReceiptPdf(Object.assign({}, p, { email: req.user.email }));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="' + p.receipt_no + '.pdf"');
    res.send(pdf);
  } catch (e) { next(e); }
});

// ---------- plans ----------
app.get("/api/plans", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT id,name,payload,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY updated_at DESC",
      [req.user.id]);
    res.json({ ok: true, plans: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/plans", requireAuth, async function (req, res, next) {
  try {
    const name = String((req.body || {}).name || "").trim().slice(0, 80) || "Untitled";
    const payload = (req.body || {}).payload;
    if (!payload || typeof payload !== "object" || !payload.d) return res.status(400).json({ ok: false, error: "bad_payload" });
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    const q = quotaFor(req.user);
    if (q !== null && c.rows[0].n >= q) return res.status(402).json({ ok: false, error: "quota_exceeded", quota: q });
    const r = await pool.query(
      "INSERT INTO plans(user_id,name,payload) VALUES($1,$2,$3) RETURNING id,name,payload,created_at,updated_at",
      [req.user.id, name, payload]);
    res.status(201).json({ ok: true, plan: r.rows[0] });
  } catch (e) { next(e); }
});

app.put("/api/plans/:id", requireAuth, async function (req, res, next) {
  try {
    const name = String((req.body || {}).name || "").trim().slice(0, 80);
    const payload = (req.body || {}).payload;
    if (payload && (typeof payload !== "object" || !payload.d)) return res.status(400).json({ ok: false, error: "bad_payload" });
    const r = await pool.query(
      "UPDATE plans SET name=COALESCE(NULLIF($1,''),name), payload=COALESCE($2,payload), updated_at=now() " +
      "WHERE id=$3 AND user_id=$4 RETURNING id,name,payload,created_at,updated_at",
      [name, payload || null, req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, plan: r.rows[0] });
  } catch (e) { next(e); }
});

app.delete("/api/plans/:id", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query("DELETE FROM plans WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/plans/import", requireAuth, async function (req, res, next) {
  try {
    const list = Array.isArray((req.body || {}).plans) ? (req.body || {}).plans : [];
    const q = quotaFor(req.user);
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    let count = c.rows[0].n, imported = 0, skipped = 0;
    for (const p of list) {
      const name = String((p && p.name) || "").trim().slice(0, 80) || "Untitled";
      const payload = p && p.payload;
      if (!payload || typeof payload !== "object" || !payload.d) { skipped++; continue; }
      if (q !== null && count >= q) { skipped++; continue; }
      await pool.query("INSERT INTO plans(user_id,name,payload) VALUES($1,$2,$3)", [req.user.id, name, payload]);
      count++; imported++;
    }
    res.json({ ok: true, imported: imported, skipped: skipped });
  } catch (e) { next(e); }
});

// ---------- admin ----------
const ADMIN_COOKIE = "fc_admin";
function adminToken() {
  return crypto.createHash("sha256")
    .update(String(process.env.ADMIN_PASSWORD || "") + "|" + String(process.env.ADMIN_SECRET || "kwthye"))
    .digest("hex");
}
async function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ ok: false, error: "admin_disabled" });
  try {
    const t = parseCookies(req)[ADMIN_COOKIE] || "";
    if (!t) return res.status(401).json({ ok: false, error: "admin_required" });
    const r = await pool.query(
      "SELECT admin_id,email,role FROM admin_sessions WHERE token_hash=$1 AND expires_at > now()", [sha256(t)]);
    if (!r.rows[0]) return res.status(401).json({ ok: false, error: "admin_required" });
    req.admin = r.rows[0];
    next();
  } catch (e) { next(e); }
}
function requireOwner(req, res, next) {
  if (!req.admin || req.admin.role !== "owner") return res.status(403).json({ ok: false, error: "owner_only" });
  next();
}
function requireWrite(req, res, next) {
  if (!req.admin || req.admin.role === "viewer") return res.status(403).json({ ok: false, error: "read_only" });
  next();
}
function adminCode() {
  return Array.from({ length: 3 }, function () { return Math.random().toString(36).slice(2, 6).toUpperCase(); }).join("-");
}

function adminIp(req) {
  return crypto.createHash("sha256").update((req.ip || "") + (process.env.IP_SALT || "fc")).digest("hex").slice(0, 24);
}
async function adminLog(action, detail, req) {
  try {
    await pool.query("INSERT INTO admin_logs(action,detail,ip_hash,actor) VALUES($1,$2,$3,$4)",
      [action, detail, req ? adminIp(req) : null, req && req.admin ? req.admin.email : "owner"]);
  } catch (e) {}
}
app.post("/api/admin/login", rateLimit(5, 600000), async function (req, res) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ ok: false, error: "admin_disabled" });
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const pw = String((req.body || {}).password || "");
  let role = "owner", to = process.env.ADMIN_EMAIL || "andylau.theroof@gmail.com", adminId = null;
  if (email) {
    const r = await pool.query("SELECT * FROM admins WHERE email=$1 AND active=true", [email]);
    const a = r.rows[0];
    if (!a || !scryptVerify(pw, a.password_hash)) {
      await adminLog("login.fail", "wrong password: " + email, req);
      return res.status(401).json({ ok: false, error: "bad_password" });
    }
    role = a.role; to = a.email; adminId = a.id;
  } else {
    const exp = Buffer.from(String(process.env.ADMIN_PASSWORD));
    const got = Buffer.from(pw);
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      await adminLog("login.fail", "wrong owner password", req);
      return res.status(401).json({ ok: false, error: "bad_password" });
    }
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await pool.query("INSERT INTO admin_otps(code_hash,expires_at,email) VALUES($1, now() + interval '10 minutes',$2)", [sha256(code), to]);
  try {
    await sendMail(to, "后台验证码 / Admin code — KWONG THYE",
      "您的后台登录验证码 / Your admin login code:\n\n" + code + "\n\n10 分钟内有效 / valid for 10 minutes.");
  } catch (e) { console.error("admin otp mail failed", e.message); return res.status(500).json({ ok: false, error: "mail_failed" }); }
  res.json({ ok: true, needOtp: true, email: to, role: role, adminId: adminId });
});

app.post("/api/admin/verify", rateLimit(10, 600000), async function (req, res) {
  const code = String((req.body || {}).code || "").trim();
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const r = await pool.query(
    "SELECT * FROM admin_otps WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now()" +
    (email ? " AND email=$2" : "") + " ORDER BY created_at DESC LIMIT 1",
    email ? [sha256(code), email] : [sha256(code)]);
  if (!r.rows[0]) return res.status(401).json({ ok: false, error: "bad_code" });
  await pool.query("UPDATE admin_otps SET used_at=now() WHERE id=$1", [r.rows[0].id]);
  await pool.query("DELETE FROM admin_otps WHERE expires_at < now() - interval '1 day'");
  const a = await pool.query("SELECT id,email,role FROM admins WHERE email=$1", [r.rows[0].email]);
  const admin = a.rows[0] || { id: null, email: r.rows[0].email, role: "owner" };
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO admin_sessions(token_hash,admin_id,email,role,expires_at) VALUES($1,$2,$3,$4, now() + interval '12 hours')",
    [sha256(token), admin.id, admin.email, admin.role]);
  if (admin.id) await pool.query("UPDATE admins SET last_login_at=now() WHERE id=$1", [admin.id]);
  res.setHeader("Set-Cookie", ADMIN_COOKIE + "=" + token + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200");
  await adminLog("login.ok", admin.email + " (" + admin.role + ")", req);
  res.json({ ok: true, email: admin.email, role: admin.role });
});
app.post("/api/admin/logout", async function (req, res) {
  const t = parseCookies(req)[ADMIN_COOKIE] || "";
  if (t) await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1", [sha256(t)]);
  res.setHeader("Set-Cookie", ADMIN_COOKIE + "=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/admin/me", requireAdmin, function (req, res) { res.json({ ok: true, email: req.admin.email, role: req.admin.role }); });

app.post("/api/admin/change-password", requireAdmin, rateLimit(5, 600000), async function (req, res, next) {
  try {
    const cur = String((req.body || {}).current || "");
    const nw = String((req.body || {}).password || "");
    if (nw.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    if (!req.admin.admin_id) return res.status(400).json({ ok: false, error: "owner_env" });
    const r = await pool.query("SELECT password_hash FROM admins WHERE id=$1", [req.admin.admin_id]);
    if (!r.rows[0] || !scryptVerify(cur, r.rows[0].password_hash)) {
      return res.status(400).json({ ok: false, error: "bad_current" });
    }
    await pool.query("UPDATE admins SET password_hash=$1 WHERE id=$2", [scryptHash(nw), req.admin.admin_id]);
    const t = parseCookies(req)[ADMIN_COOKIE] || "";
    await pool.query("DELETE FROM admin_sessions WHERE admin_id=$1 AND token_hash<>$2", [req.admin.admin_id, sha256(t)]);
    await adminLog("admin.password", req.admin.email, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/admins", requireAdmin, requireOwner, async function (req, res, next) {
  try {
    const r = await pool.query("SELECT id,email,role,active,created_at,last_login_at FROM admins ORDER BY created_at");
    res.json({ ok: true, admins: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/admin/admins", requireAdmin, requireOwner, async function (req, res, next) {
  try {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const role = b.role === "viewer" ? "viewer" : "admin";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const r = await pool.query(
      "INSERT INTO admins(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role,active",
      [email, scryptHash(password), role]);
    await adminLog("admin.create", email + " (" + role + ")", req);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ ok: false, error: "email_exists" });
    next(e);
  }
});

app.patch("/api/admin/admins/:id", requireAdmin, requireOwner, async function (req, res, next) {
  try {
    const b = req.body || {};
    const sets = [], vals = [];
    if (b.role === "admin" || b.role === "viewer" || b.role === "owner") { sets.push("role=$" + (vals.length + 1)); vals.push(b.role); }
    if (typeof b.active === "boolean") { sets.push("active=$" + (vals.length + 1)); vals.push(b.active); }
    if (b.password) {
      if (String(b.password).length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
      sets.push("password_hash=$" + (vals.length + 1)); vals.push(scryptHash(String(b.password)));
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: "nothing_to_update" });
    vals.push(req.params.id);
    const r = await pool.query("UPDATE admins SET " + sets.join(",") + " WHERE id=$" + vals.length + " RETURNING email,role,active", vals);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    if (b.active === false || b.password) {
      await pool.query("DELETE FROM admin_sessions WHERE admin_id=$1", [req.params.id]);
    }
    await adminLog("admin.update", r.rows[0].email + " role=" + r.rows[0].role + " active=" + r.rows[0].active, req);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) { next(e); }
});

app.delete("/api/admin/admins/:id", requireAdmin, requireOwner, async function (req, res, next) {
  try {
    const r = await pool.query("DELETE FROM admins WHERE id=$1 RETURNING email", [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    await adminLog("admin.delete", r.rows[0].email, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/logs", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query("SELECT action,detail,created_at FROM admin_logs ORDER BY created_at DESC LIMIT 100");
    res.json({ ok: true, logs: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/admin/users/:id/password", requireAdmin, requireWrite, async function (req, res, next) {
  try {
    const pw = String((req.body || {}).password || "");
    if (pw.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const r = await pool.query("SELECT email FROM users WHERE id=$1", [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    await pool.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2", [scryptHash(pw), req.params.id]);
    await pool.query("DELETE FROM sessions WHERE user_id=$1", [req.params.id]);
    await adminLog("user.password", r.rows[0].email, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/admin/users/:id/extend", requireAdmin, requireWrite, async function (req, res, next) {
  try {
    const days = Math.max(1, Math.min(3660, parseInt((req.body || {}).days || "30", 10)));
    const r = await pool.query(
      "UPDATE users SET plan='pro', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ($1 || ' days')::interval, " +
      "plan_reminder_at=NULL, expiry_notice_at=NULL, updated_at=now() WHERE id=$2 RETURNING email, plan_expires_at",
      [days, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    await adminLog("user.extend", r.rows[0].email + " +" + days + "d", req);
    res.json({ ok: true, planExpiresAt: r.rows[0].plan_expires_at });
  } catch (e) { next(e); }
});

app.post("/api/admin/users/:id/free", requireAdmin, requireWrite, async function (req, res, next) {
  try {
    const r = await pool.query("UPDATE users SET plan='free', plan_expires_at=NULL, updated_at=now() WHERE id=$1 RETURNING email", [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    await adminLog("user.free", r.rows[0].email, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/overview", requireAdmin, async function (req, res, next) {
  try {
    const q = async (sql) => (await pool.query(sql)).rows[0].n;
    res.json({
      ok: true,
      users: await q("SELECT count(*)::int n FROM users"),
      pro: await q("SELECT count(*)::int n FROM users WHERE plan='pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())"),
      plans: await q("SELECT count(*)::int n FROM plans"),
      messages: await q("SELECT count(*)::int n FROM contact_messages"),
      payments: await q("SELECT count(*)::int n FROM payments"),
      views7: await q("SELECT count(*)::int n FROM pageviews WHERE created_at > now() - interval '7 days'")
    });
  } catch (e) { next(e); }
});

app.post("/api/admin/codes", requireAdmin, requireWrite, async function (req, res, next) {
  try {
    const b = req.body || {};
    const days = Math.max(1, Math.min(3660, parseInt(b.days || "30", 10)));
    const count = Math.max(1, Math.min(50, parseInt(b.count || "1", 10)));
    const note = String(b.note || "").slice(0, 120) || null;
    const amount = b.amount !== undefined && b.amount !== "" ? parseFloat(b.amount) : (days >= 365 ? 99 : Math.round(9.9 * Math.ceil(days / 30) * 100) / 100);
    const out = [];
    for (let i = 0; i < count; i++) {
      let code = adminCode();
      await pool.query("INSERT INTO redeem_codes(code,days,note,amount) VALUES($1,$2,$3,$4)", [code, days, note, amount]);
      out.push(code);
    }
    await adminLog("code.create", out.join(",") + " (" + days + "d, RM" + amount + ")", req);
    res.json({ ok: true, codes: out, days: days, amount: amount });
  } catch (e) { next(e); }
});

app.post("/api/admin/promo", requireAdmin, requireWrite, async function (req, res, next) {
  try {
    const b = req.body || {};
    const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
    const days = Math.max(1, Math.min(3660, parseInt(b.days || "365", 10)));
    const maxUses = Math.max(1, Math.min(10000, parseInt(b.maxUses || "10", 10)));
    const amount = b.amount !== undefined && b.amount !== "" ? parseFloat(b.amount) : 99;
    const note = String(b.note || "").slice(0, 120) || null;
    const expDays = b.expiryDays ? Math.max(1, parseInt(b.expiryDays, 10)) : null;
    if (!code) return res.status(400).json({ ok: false, error: "bad_code" });
    await pool.query(
      "INSERT INTO redeem_codes(code,days,note,amount,max_uses,label,expires_at) VALUES($1,$2,$3,$4,$5,'promo',$6)",
      [code, days, note, amount, maxUses, expDays ? new Date(Date.now() + expDays * 86400000) : null]);
    await adminLog("promo.create", code + " (" + days + "d, max " + maxUses + ", RM" + amount + ")", req);
    res.json({ ok: true, code: code, days: days, maxUses: maxUses, amount: amount });
  } catch (e) { next(e); }
});

app.get("/api/admin/codes", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT code,days,amount,note,used_count,max_uses,label,used_at,expires_at,created_at FROM redeem_codes ORDER BY created_at DESC LIMIT 200");
    res.json({ ok: true, codes: r.rows });
  } catch (e) { next(e); }
});

app.get("/api/admin/users", requireAdmin, async function (req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const r = q
      ? await pool.query("SELECT id,email,plan,plan_expires_at,email_verified_at,created_at FROM users WHERE email ILIKE $1 ORDER BY created_at DESC LIMIT 100", ["%" + q + "%"])
      : await pool.query("SELECT id,email,plan,plan_expires_at,email_verified_at,created_at FROM users ORDER BY created_at DESC LIMIT 100");
    res.json({ ok: true, users: r.rows });
  } catch (e) { next(e); }
});

app.get("/api/admin/messages", requireAdmin, async function (req, res, next) {
  try {
    const days = Math.max(1, parseInt(req.query.days || "30", 10));
    const r = await pool.query(
      "SELECT id,name,phone,email,subject,message,emailed,created_at FROM contact_messages WHERE created_at > now() - ($1 || ' days')::interval ORDER BY created_at DESC LIMIT 100", [days]);
    res.json({ ok: true, messages: r.rows });
  } catch (e) { next(e); }
});

app.get("/api/admin/views", requireAdmin, async function (req, res, next) {
  try {
    const days = Math.max(1, parseInt(req.query.days || "7", 10));
    const d = await pool.query("SELECT created_at::date AS day, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1 DESC", [days]);
    const t = await pool.query("SELECT path, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 10", [days]);
    res.json({ ok: true, days: d.rows, top: t.rows });
  } catch (e) { next(e); }
});

// ---------- contact form ----------
app.post("/api/contact", rateLimit(3, 600000), async function (req, res, next) {
  try {
    const b = req.body || {};
    if (String(b.website || "").trim()) return res.json({ ok: true }); // honeypot
    const name = String(b.name || "").trim().slice(0, 80);
    const phone = String(b.phone || "").trim().slice(0, 40);
    const email = String(b.email || "").trim().slice(0, 120);
    const subject = String(b.subject || "").trim().slice(0, 120);
    const message = String(b.message || "").trim().slice(0, 2000);
    if (name.length < 1 || message.length < 5) return res.status(400).json({ ok: false, error: "invalid" });
    if (!phone && !email) return res.status(400).json({ ok: false, error: "contact_required" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    const ipHash = crypto.createHash("sha256").update((req.ip || "") + (process.env.IP_SALT || "fc")).digest("hex").slice(0, 24);
    const r = await pool.query(
      "INSERT INTO contact_messages(name,phone,email,subject,message,ip_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [name, phone, email, subject, message, ipHash]
    );
    const to = process.env.CONTACT_TO || "andylau.theroof@gmail.com";
    const text = [
      "网站留言 / Website enquiry",
      "",
      "姓名 / Name: " + name,
      "电话 / Phone: " + (phone || "-"),
      "电邮 / Email: " + (email || "-"),
      "项目 / Subject: " + (subject || "-"),
      "",
      "留言 / Message:",
      message,
      "",
      "ID: " + r.rows[0].id
    ].join("\n");
    try {
      await sendMail(to, "网站留言 / Website enquiry — " + name, text, email || undefined);
      await pool.query("UPDATE contact_messages SET emailed=true WHERE id=$1", [r.rows[0].id]);
    } catch (e) {
      console.error("contact mail failed", e.message);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- analytics ----------
app.post("/api/track", rateLimit(120, 60000), async function (req, res) {
  try {
    const path = String((req.body || {}).path || "").slice(0, 200);
    const ref = String((req.body || {}).ref || "").slice(0, 300);
    const ipHash = crypto.createHash("sha256").update((req.ip || "") + (process.env.IP_SALT || "fc")).digest("hex").slice(0, 24);
    if (path) await pool.query("INSERT INTO pageviews(path,referrer,ip_hash) VALUES($1,$2,$3)", [path, ref, ipHash]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ---------- subscription ----------
app.post("/api/subscription/redeem", requireAuth, rateLimit(10, 60000), async function (req, res, next) {
  const code = String((req.body || {}).code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "bad_code" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query("SELECT * FROM redeem_codes WHERE code=$1 FOR UPDATE", [code]);
    const c = r.rows[0];
    const exhausted = !c || (c.used_by && (c.max_uses || 1) <= 1) || (c.used_count || 0) >= (c.max_uses || 1);
    const expired = c && c.expires_at && new Date(c.expires_at) < new Date();
    if (exhausted || expired) { await client.query("ROLLBACK"); return res.status(400).json({ ok: false, error: "invalid_code" }); }
    await client.query(
      "UPDATE redeem_codes SET used_count=used_count+1, used_by=COALESCE(used_by,$1), used_at=COALESCE(used_at,now()) WHERE id=$2",
      [req.user.id, c.id]);
    const u = await client.query(
      "UPDATE users SET plan='pro', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ($1 || ' days')::interval, updated_at=now() WHERE id=$2 RETURNING plan, plan_expires_at",
      [c.days, req.user.id]);
    const pay = await client.query(
      "INSERT INTO payments(user_id,code_id,days,amount,currency,receipt_no,expires_after) " +
      "VALUES($1,$2,$3,$4,'MYR','KT-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('receipt_seq')::text,4,'0'),$5) " +
      "RETURNING receipt_no, amount, created_at",
      [req.user.id, c.id, c.days, c.amount || 50, u.rows[0].plan_expires_at]);
    await client.query("COMMIT");
    res.json({ ok: true, plan: u.rows[0].plan, planExpiresAt: u.rows[0].plan_expires_at, days: c.days, receipt: pay.rows[0] });
    try {
      const pdf = await buildReceiptPdf(Object.assign({}, pay.rows[0], {
        email: req.user.email, days: c.days, expires_after: u.rows[0].plan_expires_at
      }));
      const text = [
        "您好 / Hello,",
        "",
        "已收到您的付款，专业版已开通 / 续费。",
        "Payment received — your Pro plan is now active.",
        "",
        "收据 / Receipt: " + pay.rows[0].receipt_no,
        "金额 / Amount: RM " + Number(pay.rows[0].amount).toFixed(2),
        "到期 / Valid until: " + new Date(u.rows[0].plan_expires_at).toLocaleDateString("en-MY"),
        "",
        "收据 PDF 见附件；也可在账号 → 付款记录查看。",
        "The receipt PDF is attached; you can also view it under Account → Payments.",
        "",
        "KWONG THYE 光泰",
        "https://kwongthye.com/calc/"
      ].join("\n");
      await sendMail(req.user.email, "收据 / Receipt — " + pay.rows[0].receipt_no + " · KWONG THYE", text, null,
        [{ filename: pay.rows[0].receipt_no + ".pdf", content: pdf }]);
      console.log("receipt mail sent", pay.rows[0].receipt_no, req.user.email);
    } catch (e) { console.error("receipt mail failed", e.message); }
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});

// ---------- fallbacks ----------
app.use("/api", function (req, res) { res.status(404).json({ ok: false, error: "not_found" }); });
app.use(function (err, req, res, next) {
  console.error(err && err.message);
  res.status(500).json({ ok: false, error: "server_error" });
});

app.listen(PORT, "127.0.0.1", function () { console.log("api listening on " + PORT); });
