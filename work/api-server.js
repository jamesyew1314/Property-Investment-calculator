"use strict";
const express = require("express");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const nodemailer = require("nodemailer");
const { buildReceiptPdf } = require("./receipt-pdf");
const mailLayout = require("./mail-layout");
const { buildReportPdf } = require("./report-pdf");
const createLibraryApi = require("./library-api");
const pathMod = require("node:path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const FREE_QUOTA = 0;
const SESSION_DAYS = 30;
// 可用环境变量改 cookie 名/路径（staging 用，避免覆盖正式会话）
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "fc_sid";
const COOKIE_PATH = process.env.SESSION_COOKIE_PATH || "/";
// 生产可设 .kwongthye.com，让 kwongthye.com 与 calc.kwongthye.com 共用登录状态
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
// 免费开放期：默认 true（所有 Pro 功能免费）；正式收费时把 .env 改成 FREE_MODE=0 即可恢复
const FREE_MODE = process.env.FREE_MODE !== "0";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

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
           emailVerified: !!u.email_verified_at, twofaEnabled: !!u.twofa_enabled, monthlyOptOut: !!u.monthly_opt_out,
           freeMode: FREE_MODE };
}
function quotaFor(u) {
  if (FREE_MODE) return null;   // 免费开放期：方案数量不限
  const paid = u.plan === "pro" && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
  return paid ? null : FREE_QUOTA;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", SESSION_COOKIE + "=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=" + COOKIE_PATH +
    (COOKIE_DOMAIN ? "; Domain=" + COOKIE_DOMAIN : "") + "; Max-Age=" + (SESSION_DAYS * 86400));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", SESSION_COOKIE + "=; HttpOnly; Secure; SameSite=Lax; Path=" + COOKIE_PATH +
    (COOKIE_DOMAIN ? "; Domain=" + COOKIE_DOMAIN : "") + "; Max-Age=0");
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
  let html = null;
  try {
    html = mailLayout.rich({
      heading: "验证邮箱 / Verify your email",
      lead: ["感谢注册 KWONG THYE。请点击下面的按钮完成邮箱验证（24 小时内有效）。",
             "Thanks for signing up. Tap the button below to verify your email (valid for 24 hours)."],
      cta: { url: link, label: "验证邮箱 / Verify email" },
      note: "如果这不是您本人的操作，请忽略此邮件。\nIf you did not create an account, please ignore this email."
    }).html;
  } catch (e) {}
  return sendMail(email, "验证邮箱 / Verify your email — KWONG THYE", text, null, [], html);
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

async function sendMail(to, subject, text, replyToOverride, attachments, htmlOverride) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || (process.env.SMTP_USER ? "KWONG THYE <" + process.env.SMTP_USER + ">" : "KWONG THYE <noreply@kwongthye.com>");
  const replyTo = replyToOverride || process.env.MAIL_REPLY_TO || "jamesyew1314@gmail.com";
  let html = htmlOverride || null;
  if (!html) { try { html = mailLayout.brand(subject, text).html; } catch (e) { html = null; } }
  if (smtpTransport) {
    try {
      await smtpTransport.sendMail({ from: from, to: to, replyTo: replyTo, subject: subject, text: text, html: html || undefined, attachments: attachments || [] });
    } catch (e1) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      await smtpTransport.sendMail({ from: from, to: to, replyTo: replyTo, subject: subject, text: text, html: html || undefined, attachments: attachments || [] });
    }
    return "sent";
  }
  if (key) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from, to: [to], reply_to: replyTo, subject: subject, text: text, html: html || undefined, attachments: (attachments || []).map(function (a) { return { filename: a.filename, content: Buffer.from(a.content).toString("base64") }; }) })
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
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return res.status(401).json({ ok: false, error: "auth_required" });
    const r = await pool.query(
      "SELECT u.id,u.email,u.display_name,u.plan,u.plan_expires_at,u.email_verified_at,u.twofa_enabled,u.monthly_opt_out " +
      "FROM sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.token_hash = $1 AND s.expires_at > now()", [sha256(token)]);
    if (!r.rows[0]) return res.status(401).json({ ok: false, error: "auth_required" });
    req.user = r.rows[0];
    next();
  } catch (e) { next(e); }
};

// ---------- health ----------
// 未验证邮箱 → 不能写云端数据（仍可自由计算）
const requireVerified = function (req, res, next) {
  if (!req.user || !req.user.email_verified_at) return res.status(403).json({ ok: false, error: "email_unverified" });
  next();
};

// 公开配置：前端据此决定是否显示「Pro 锁定」
app.get("/api/config", function (req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ok: true, freeMode: FREE_MODE, plans: { freeQuota: FREE_MODE ? null : FREE_QUOTA } });
});

app.get("/api/health", async function (req, res) {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, db: true, time: r.rows[0].now, version: process.env.APP_VERSION || "0.36.0" });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, error: "db_unavailable" });
  }
});

// ---------- auth ----------
const TERMS_VERSION = "2026-10";

app.post("/api/auth/register", rateLimit(5, 60000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    if (!(req.body || {}).acceptTerms) return res.status(400).json({ ok: false, error: "terms_required" });
    const ex = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
    if (ex.rowCount) return res.status(409).json({ ok: false, error: "email_exists" });
    const ipHash = crypto.createHash("sha256")
      .update((req.ip || "") + (process.env.IP_SALT || "fc")).digest("hex").slice(0, 24);
    const r = await pool.query(
      "INSERT INTO users(email,password_hash,terms_accepted_at,terms_version,terms_ip_hash) " +
      "VALUES($1,$2,now(),$3,$4) RETURNING id,email,display_name,plan,plan_expires_at",
      [email, scryptHash(password), TERMS_VERSION, ipHash]);
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
    if (u.twofa_enabled) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const challenge = crypto.randomBytes(24).toString("hex");
      await pool.query(
        "INSERT INTO login_codes(user_id,code_hash,challenge_hash,expires_at) VALUES($1,$2,$3, now() + interval '10 minutes')",
        [u.id, sha256(code), sha256(challenge)]);
      const text = [
        "您好 / Hello,",
        "",
        "您的 KWONG THYE 登录验证码（10 分钟内有效）：",
        "Your KWONG THYE sign-in code (valid for 10 minutes):",
        "",
        code,
        "",
        "如果这不是您本人的操作，请立即修改密码。",
        "If this was not you, please change your password immediately.",
        "",
        "KWONG THYE 光泰"
      ].join("\n");
      let html2 = null;
      try {
        html2 = mailLayout.rich({
          heading: "登录验证码 / Sign-in code",
          lead: ["您好，以下是您的 KWONG THYE 登录验证码，10 分钟内有效。",
                 "Your KWONG THYE sign-in code — valid for 10 minutes."],
          code: code,
          codeNote: "10 分钟内有效 / valid for 10 minutes",
          note: "如果这不是您本人的操作，请立即修改密码。\nIf this was not you, please change your password immediately."
        }).html;
      } catch (e) {}
      try { await sendMail(u.email, "登录验证码 / Sign-in code — KWONG THYE", text, null, [], html2); }
      catch (e) { console.error("login code mail failed", u.email, e.message); return res.status(503).json({ ok: false, error: "mail_failed" }); }
      return res.json({ ok: true, twofa_required: true, challenge: challenge });
    }
    const token = await createSession(u.id);
    setSessionCookie(res, token);
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { next(e); }
});

// 第二步：验证码 → 会话
app.post("/api/auth/2fa", rateLimit(10, 600000), async function (req, res, next) {
  try {
    const challenge = String((req.body || {}).challenge || "");
    const code = String((req.body || {}).code || "").replace(/\D/g, "");
    if (!challenge || code.length !== 6) return res.status(400).json({ ok: false, error: "bad_code" });
    // 注意：两张表都有 id，必须显式取别名，否则 pg 会按重名列解析出错
    const r = await pool.query(
      "SELECT l.id AS code_id, l.user_id, l.code_hash, l.attempts, " +
      "u.id, u.email, u.display_name, u.plan, u.plan_expires_at, u.email_verified_at, u.twofa_enabled " +
      "FROM login_codes l JOIN users u ON u.id = l.user_id " +
      "WHERE l.challenge_hash=$1 AND l.used_at IS NULL AND l.expires_at > now() ORDER BY l.id DESC LIMIT 1",
      [sha256(challenge)]);
    const row = r.rows[0];
    if (!row) return res.status(401).json({ ok: false, error: "code_expired" });
    if (row.attempts >= 5) return res.status(429).json({ ok: false, error: "too_many_attempts" });
    if (row.code_hash !== sha256(code)) {
      await pool.query("UPDATE login_codes SET attempts=attempts+1 WHERE id=$1", [row.code_id]);
      return res.status(401).json({ ok: false, error: "bad_code" });
    }
    await pool.query("UPDATE login_codes SET used_at=now() WHERE id=$1", [row.code_id]);
    const token = await createSession(row.user_id);
    setSessionCookie(res, token);
    res.json({ ok: true, user: publicUser(row) });
  } catch (e) { next(e); }
});

// 开关两步验证（需要当前密码确认）/ Toggle 2FA (password required)
app.post("/api/auth/2fa/settings", requireAuth, rateLimit(10, 600000), async function (req, res, next) {
  try {
    const enabled = !!(req.body || {}).enabled;
    const password = String((req.body || {}).password || "");
    const r = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!r.rows[0] || !scryptVerify(password, r.rows[0].password_hash)) return res.status(401).json({ ok: false, error: "bad_credentials" });
    await pool.query("UPDATE users SET twofa_enabled=$2 WHERE id=$1", [req.user.id, enabled]);
    // 关闭时清掉还没用的验证码
    if (!enabled) await pool.query("UPDATE login_codes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [req.user.id]);
    res.json({ ok: true, twofaEnabled: enabled });
  } catch (e) { next(e); }
});

app.post("/api/auth/logout", async function (req, res, next) {
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
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

// PDPA：下载我自己的全部资料 / Download all of my own data
app.get("/api/me/export", requireAuth, async function (req, res, next) {
  try {
    const u = await pool.query(
      "SELECT id,email,display_name,plan,plan_expires_at,email_verified_at,twofa_enabled,created_at FROM users WHERE id=$1",
      [req.user.id]);
    const plans = await pool.query("SELECT id,name,payload,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY created_at", [req.user.id]);
    const pays = await pool.query(
      "SELECT id,receipt_no,amount,days,expires_after,created_at FROM payments WHERE user_id=$1 ORDER BY created_at", [req.user.id]);
    const msgs = await pool.query(
      "SELECT name,phone,message,created_at FROM contact_messages WHERE lower(email)=lower($1) ORDER BY created_at", [req.user.email]);
    const data = {
      exported_at: new Date().toISOString(),
      about: "此文件由 kwongthye.com 导出，包含您在该网站保存的个人资料（PDPA 2010 查阅权）。",
      note: "密码只以不可逆哈希保存，无法导出；会话令牌同样不可导出。",
      account: u.rows[0] || null,
      plans: plans.rows,
      payments: pays.rows,
      enquiries: msgs.rows
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="kwongthye-my-data-' + new Date().toISOString().slice(0, 10) + '.json"');
    res.send(JSON.stringify(data, null, 2));
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
    const token = parseCookies(req)[SESSION_COOKIE];
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
      "SELECT p.id, p.receipt_no, p.days, p.amount, p.currency, p.expires_after, p.created_at, " +
      "(SELECT r.status FROM refund_requests r WHERE r.payment_id = p.id ORDER BY r.created_at DESC LIMIT 1) AS refund_status " +
      "FROM payments p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50",
      [req.user.id]);
    res.json({ ok: true, payments: r.rows, user: { email: req.user.email } });
  } catch (e) { next(e); }
});

// 退款申请（7 天内、同一张收据只能申请一次）
app.post("/api/refunds", requireAuth, rateLimit(5, 600000), async function (req, res, next) {
  try {
    const paymentId = String((req.body || {}).paymentId || "");
    const reason = String((req.body || {}).reason || "").trim().slice(0, 500);
    if (!paymentId || reason.length < 4) return res.status(400).json({ ok: false, error: "bad_request" });
    const p = await pool.query("SELECT id,receipt_no,amount,created_at FROM payments WHERE id=$1 AND user_id=$2", [paymentId, req.user.id]);
    if (!p.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const pay = p.rows[0];
    if (Date.now() - new Date(pay.created_at).getTime() > 7 * 86400000) {
      return res.status(400).json({ ok: false, error: "refund_window_closed" });
    }
    const ex = await pool.query("SELECT 1 FROM refund_requests WHERE payment_id=$1 AND status IN ('pending','approved')", [paymentId]);
    if (ex.rowCount) return res.status(409).json({ ok: false, error: "already_requested" });
    const r = await pool.query(
      "INSERT INTO refund_requests(user_id,payment_id,reason) VALUES($1,$2,$3) RETURNING id,created_at",
      [req.user.id, paymentId, reason]);
    // 通知后台
    const to = process.env.ADMIN_EMAIL || process.env.MAIL_REPLY_TO || "andylau.theroof@gmail.com";
    try {
      const html = mailLayout.rich({
        heading: "新的退款申请 / New refund request",
        lead: ["用户提交了退款申请，请到后台「退款」标签处理。",
               req.user.email + " requested a refund."],
        rows: [["用户 / User", req.user.email], ["收据 / Receipt", pay.receipt_no],
               ["金额 / Amount", "RM " + Number(pay.amount).toFixed(2)], ["原因 / Reason", reason]],
        cta: { url: "https://kwongthye.com/admin/", label: "打开后台 / Open admin" }
      }).html;
      await sendMail(to, "退款申请 / Refund request — " + pay.receipt_no, [
        "用户：" + req.user.email,
        "收据：" + pay.receipt_no + " RM " + Number(pay.amount).toFixed(2),
        "原因：" + reason,
        "",
        "到后台「退款」标签处理。"
      ].join("\n"), req.user.email, [], html);
    } catch (e) { console.error("refund notify failed", e.message); }
    res.status(201).json({ ok: true, refund: r.rows[0] });
  } catch (e) { next(e); }
});

app.get("/api/refunds", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT r.id, r.payment_id, r.reason, r.status, r.admin_note, r.created_at, r.decided_at, p.receipt_no, p.amount " +
      "FROM refund_requests r LEFT JOIN payments p ON p.id = r.payment_id " +
      "WHERE r.user_id=$1 ORDER BY r.created_at DESC", [req.user.id]);
    res.json({ ok: true, refunds: r.rows });
  } catch (e) { next(e); }
});

// 后台：退款列表 + 审批
app.get("/api/admin/refunds", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT r.id, r.reason, r.status, r.admin_note, r.created_at, r.decided_at, " +
      "u.email, p.receipt_no, p.amount, p.id AS payment_id " +
      "FROM refund_requests r JOIN users u ON u.id = r.user_id " +
      "LEFT JOIN payments p ON p.id = r.payment_id ORDER BY r.created_at DESC LIMIT 200");
    res.json({ ok: true, refunds: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/admin/refunds/:id/decide", requireAdmin, requireWrite, async function (req, res, next) {
  const client = await pool.connect();
  try {
    const approve = !!(req.body || {}).approve;
    const note = String((req.body || {}).note || "").slice(0, 500);
    await client.query("BEGIN");
    const r = await client.query(
      "SELECT r.*, u.email FROM refund_requests r JOIN users u ON u.id = r.user_id WHERE r.id=$1 FOR UPDATE", [req.params.id]);
    const row = r.rows[0];
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, error: "not_found" }); }
    if (row.status !== "pending") { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, error: "already_decided" }); }
    await client.query(
      "UPDATE refund_requests SET status=$2, admin_note=$3, decided_at=now(), decided_by=$4 WHERE id=$1",
      [row.id, approve ? "approved" : "rejected", note || null, req.admin.id || null]);
    if (approve) {
      // 退款成功：撤销专业版（方案保留，不删除）
      await client.query("UPDATE users SET plan='free', plan_expires_at=NULL WHERE id=$1", [row.user_id]);
    }
    await client.query("COMMIT");
    await adminLog(approve ? "refund.approve" : "refund.reject", row.email + " " + (note || ""), req);
    try {
      const html = mailLayout.rich({
        heading: approve ? "退款已处理 / Refund approved" : "退款申请未通过 / Refund declined",
        lead: approve
          ? ["您的退款申请已批准，款项将按原付款方式退回（银行转账一般 3–7 个工作日内到账）。专业版已停用，已保存的方案不会被删除。",
             "Your refund has been approved. The amount will be returned via your original payment method (3–7 business days). Pro has been switched off; your saved plans are kept."]
          : ["很抱歉，本次退款申请未通过。", "Unfortunately this refund request was not approved."],
        rows: note ? [["说明 / Note", note]] : [],
        cta: { url: "https://kwongthye.com/calc/", label: "回到计算器 / Back to calculator" }
      }).html;
      await sendMail(row.email, (approve ? "退款已批准 / Refund approved — " : "退款未通过 / Refund declined — ") + "KWONG THYE",
        (approve ? "您的退款申请已批准，专业版已停用。已保存方案保留。" : "本次退款申请未通过。") + (note ? "\n说明：" + note : ""), null, [], html);
    } catch (e) { console.error("refund mail failed", e.message); }
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally { client.release(); }
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
// 完整投资分析报告 PDF（Pro）：前端把已算好的数字 POST 上来，服务端只负责排版
app.post("/api/report.pdf", requireAuth, rateLimit(10, 600000), async function (req, res, next) {
  try {
    const u = req.user;
    const paid = u.plan === "pro" && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
    if (!FREE_MODE && !paid) return res.status(402).json({ ok: false, error: "pro_required" });
    const b = req.body || {};
    if (!b.input || !b.result || typeof b.result !== "object") return res.status(400).json({ ok: false, error: "bad_payload" });
    const buf = await buildReportPdf({
      lang: b.lang === "en" ? "en" : "zh",
      company: b.company || {},
      input: b.input,
      result: b.result,
      note: b.note || "",
      disclaimer: b.disclaimer || ""
    });
    const d = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="kwongthye-report-' + d + '.pdf"');
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

app.get("/api/plans", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT id,name,payload,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY updated_at DESC",
      [req.user.id]);
    res.json({ ok: true, plans: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/plans", requireAuth, requireVerified, async function (req, res, next) {
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

app.put("/api/plans/:id", requireAuth, requireVerified, async function (req, res, next) {
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

app.delete("/api/plans/:id", requireAuth, requireVerified, async function (req, res, next) {
  try {
    const r = await pool.query("DELETE FROM plans WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/plans/import", requireAuth, requireVerified, async function (req, res, next) {
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
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || "fc_admin";
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
    const otpText = "您的后台登录验证码 / Your admin login code:\n\n" + code + "\n\n10 分钟内有效 / valid for 10 minutes.";
    let otpHtml = null;
    try {
      otpHtml = mailLayout.rich({
        heading: "后台验证码 / Admin code",
        lead: ["这是 KWONG THYE 管理后台的登录验证码，10 分钟内有效。",
               "Your KWONG THYE admin sign-in code — valid for 10 minutes."],
        code: code,
        codeNote: "仅本人使用，请勿转发 / never share this code",
        note: "如非本人操作，请立即在后台修改密码。\nIf this was not you, change the admin password immediately."
      }).html;
    } catch (e) {}
    await sendMail(to, "后台验证码 / Admin code — KWONG THYE", otpText, null, [], otpHtml);
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
  const remember = !!(req.body || {}).remember;
  const ttl = remember ? "7 days" : "2 hours";
  const maxAge = remember ? 7 * 86400 : 7200;
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO admin_sessions(token_hash,admin_id,email,role,expires_at) VALUES($1,$2,$3,$4, now() + ($5)::interval)",
    [sha256(token), admin.id, admin.email, admin.role, ttl]);
  if (admin.id) await pool.query("UPDATE admins SET last_login_at=now() WHERE id=$1", [admin.id]);
  res.setHeader("Set-Cookie", ADMIN_COOKIE + "=" + token + "; HttpOnly; Secure; SameSite=Strict; Path=" + COOKIE_PATH + "; Max-Age=" + maxAge);
  await adminLog("login.ok", admin.email + " (" + admin.role + ")", req);
  res.json({ ok: true, email: admin.email, role: admin.role });
});
app.post("/api/admin/logout", async function (req, res) {
  const t = parseCookies(req)[ADMIN_COOKIE] || "";
  if (t) await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1", [sha256(t)]);
  res.setHeader("Set-Cookie", ADMIN_COOKIE + "=; HttpOnly; Secure; SameSite=Strict; Path=" + COOKIE_PATH + "; Max-Age=0");
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

// ---------- 后台 CSV 导出 ----------
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function sendCsv(res, filename, header, rows) {
  const lines = [header.map(csvCell).join(",")].concat(rows.map(function (r) { return r.map(csvCell).join(","); }));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
  res.send("\ufeff" + lines.join("\r\n"));
}

app.get("/api/admin/export/users.csv", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT email,plan,plan_expires_at,email_verified_at,terms_accepted_at,terms_version,twofa_enabled,monthly_opt_out,created_at " +
      "FROM users ORDER BY created_at");
    const rows = r.rows.map(function (u) {
      return [u.email, u.plan, u.plan_expires_at ? new Date(u.plan_expires_at).toISOString().slice(0, 10) : "",
        u.email_verified_at ? "yes" : "no", u.terms_accepted_at ? new Date(u.terms_accepted_at).toISOString().slice(0, 10) : "",
        u.terms_version || "", u.twofa_enabled ? "on" : "off", u.monthly_opt_out ? "unsubscribed" : "subscribed",
        new Date(u.created_at).toISOString().slice(0, 10)];
    });
    await adminLog("export_users", "rows=" + rows.length, req);
    sendCsv(res, "kwongthye-users-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["email", "plan", "plan_expires_at", "email_verified", "terms_accepted_at", "terms_version", "2fa", "monthly_email", "created_at"], rows);
  } catch (e) { next(e); }
});

app.get("/api/admin/export/codes.csv", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT code,days,amount,used_count,max_uses,label,note,expires_at,created_at FROM redeem_codes ORDER BY created_at DESC");
    const rows = r.rows.map(function (c) {
      return [c.code, c.days, Number(c.amount).toFixed(2), c.used_count, c.max_uses, c.label || "",
        c.note || "", c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "",
        new Date(c.created_at).toISOString().slice(0, 10)];
    });
    await adminLog("export_codes", "rows=" + rows.length, req);
    sendCsv(res, "kwongthye-codes-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["code", "days", "amount", "used", "max_uses", "type", "note", "expires_at", "created_at"], rows);
  } catch (e) { next(e); }
});

app.get("/api/admin/export/payments.csv", requireAdmin, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT p.receipt_no,p.amount,p.days,p.currency,p.expires_after,p.created_at,u.email " +
      "FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC");
    const rows = r.rows.map(function (x) {
      return [x.receipt_no, Number(x.amount).toFixed(2), x.currency, x.days, x.email || "",
        x.expires_after ? new Date(x.expires_after).toISOString().slice(0, 10) : "",
        new Date(x.created_at).toISOString().slice(0, 10)];
    });
    await adminLog("export_payments", "rows=" + rows.length, req);
    sendCsv(res, "kwongthye-receipts-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["receipt_no", "amount", "currency", "days", "user_email", "valid_until", "created_at"], rows);
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

// 近 N 天趋势（收入 / 新用户 / 浏览量 / 收据数），用于后台图表
// 事件统计（近 N 天）
app.get("/api/admin/events", requireAdmin, async function (req, res, next) {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days || "7", 10) || 7));
    const r = await pool.query(
      "SELECT name, count(*)::int AS n, count(DISTINCT ip_hash)::int AS people " +
      "FROM events WHERE created_at > now() - ($1 || ' days')::interval GROUP BY name ORDER BY n DESC", [String(days)]);
    const total = await pool.query("SELECT count(*)::int AS n FROM events WHERE created_at > now() - ($1 || ' days')::interval", [String(days)]);
    res.json({ ok: true, days: days, total: total.rows[0].n, events: r.rows });
  } catch (e) { next(e); }
});

app.get("/api/admin/charts", requireAdmin, async function (req, res, next) {
  try {
    const days = Math.max(7, Math.min(90, parseInt(req.query.days || "14", 10) || 14));
    const series = async function (sql) {
      const r = await pool.query(sql, [days]);
      return r.rows.map(function (x) { return { day: String(x.day).slice(0, 10), n: Number(x.n) }; });
    };
    const revenue = await series(
      "SELECT to_char(d.day,'YYYY-MM-DD') AS day, coalesce(sum(p.amount),0) AS n " +
      "FROM generate_series((now()::date - ($1::int - 1)), now()::date, interval '1 day') d(day) " +
      "LEFT JOIN payments p ON p.created_at::date = d.day GROUP BY d.day ORDER BY d.day");
    const signups = await series(
      "SELECT to_char(d.day,'YYYY-MM-DD') AS day, count(u.id) AS n " +
      "FROM generate_series((now()::date - ($1::int - 1)), now()::date, interval '1 day') d(day) " +
      "LEFT JOIN users u ON u.created_at::date = d.day GROUP BY d.day ORDER BY d.day");
    const views = await series(
      "SELECT to_char(d.day,'YYYY-MM-DD') AS day, count(v.id) AS n " +
      "FROM generate_series((now()::date - ($1::int - 1)), now()::date, interval '1 day') d(day) " +
      "LEFT JOIN pageviews v ON v.created_at::date = d.day GROUP BY d.day ORDER BY d.day");
    const f = await pool.query(
      "SELECT (SELECT count(*)::int FROM users) AS users, " +
      "(SELECT count(*)::int FROM users WHERE plan='pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())) AS pro, " +
      "(SELECT count(*)::int FROM users WHERE email_verified_at IS NOT NULL) AS verified, " +
      "(SELECT count(*)::int FROM plans) AS plans, " +
      "(SELECT coalesce(sum(amount),0) FROM payments WHERE created_at::date = now()::date) AS today_revenue, " +
      "(SELECT coalesce(sum(amount),0) FROM payments) AS total_revenue");
    const k = f.rows[0] || {};
    res.json({
      ok: true, days: days, revenue: revenue, signups: signups, views: views,
      totals: {
        users: k.users, pro: k.pro, verified: k.verified, plans: k.plans,
        todayRevenue: Number(k.today_revenue || 0), totalRevenue: Number(k.total_revenue || 0),
        conversion: k.users ? Math.round((k.pro / k.users) * 1000) / 10 : 0
      }
    });
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
// 月度邮件退订（签名链接，无需登录）
function unsubSig(id) {
  return crypto.createHmac("sha256", process.env.ADMIN_SECRET || "kwongthye")
    .update("unsub:" + id).digest("hex").slice(0, 32);
}
app.get("/api/unsubscribe", async function (req, res, next) {
  try {
    const id = String(req.query.u || "");
    const t = String(req.query.t || "");
    const expect = unsubSig(id);
    const good = id.length > 10 && t.length === expect.length &&
      crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expect));
    let msg = "链接无效或已过期。";
    if (good) {
      const r = await pool.query("UPDATE users SET monthly_opt_out=true WHERE id=$1 RETURNING email", [id]);
      msg = r.rowCount ? "已退订月度邮件，您仍会收到账号与付款相关的必要通知。" : "找不到该账号。";
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<!doctype html><html lang=zh><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">" +
      "<title>退订 / Unsubscribe — KWONG THYE</title><style>body{margin:0;background:#F7F4EE;font-family:-apple-system,'PingFang SC',sans-serif;" +
      "color:#1B2430;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}" +
      ".c{background:#fff;border:1px solid #E6E1D6;border-radius:14px;max-width:420px;padding:26px;text-align:center}" +
      "h1{font-family:Georgia,serif;color:#0E2438;font-size:19px;margin:0 0 10px}p{font-size:14px;line-height:1.7;color:#3A4351}" +
      "a{display:inline-block;margin-top:16px;background:#0E2438;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:700;font-size:14px}" +
      "</style></head><body><div class=c><h1>月度邮件 / Monthly email</h1><p>" + msg +
      "</p><p style=\"font-size:12.5px;color:#8A929E\">You can re-subscribe anytime in your account settings.</p>" +
      "<a href=\"/calc/\">返回计算器 / Back to calculator</a></div></body></html>");
  } catch (e) { next(e); }
});

// 邮件偏好（登录后开关）
app.post("/api/me/prefs", requireAuth, rateLimit(20, 600000), async function (req, res, next) {
  try {
    const monthly = (req.body || {}).monthly;
    if (typeof monthly !== "boolean") return res.status(400).json({ ok: false, error: "bad_request" });
    await pool.query("UPDATE users SET monthly_opt_out=$2 WHERE id=$1", [req.user.id, !monthly]);
    res.json({ ok: true, monthlyOptOut: !monthly });
  } catch (e) { next(e); }
});

// sendBeacon 默认用 text/plain 发送，express.json 不会解析 → 这里用 text 解析兜底
app.use("/api/track", express.text({ type: function () { return true; }, limit: "4kb" }));

app.post("/api/track", rateLimit(120, 60000), async function (req, res) {
  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const path = String(body.path || "").slice(0, 200);
    const ref = String(body.ref || "").slice(0, 300);
    const ev = String(body.event || "").slice(0, 60);
    const meta = String(body.meta || "").slice(0, 200);
    const ipHash = crypto.createHash("sha256").update((req.ip || "") + (process.env.IP_SALT || "fc")).digest("hex").slice(0, 24);
    if (ev) await pool.query("INSERT INTO events(name,path,meta,ip_hash) VALUES($1,$2,$3,$4)", [ev, path, meta, ipHash]);
    else if (path) await pool.query("INSERT INTO pageviews(path,referrer,ip_hash) VALUES($1,$2,$3)", [path, ref, ipHash]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ---------- subscription ----------
app.post("/api/subscription/redeem", requireAuth, requireVerified, rateLimit(10, 60000), async function (req, res, next) {
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
      let html4 = null;
      try {
        html4 = mailLayout.rich({
          heading: "收据 / Receipt — " + pay.rows[0].receipt_no,
          lead: ["已收到您的付款，专业版已开通 / 续费。",
                 "Payment received — your Pro plan is now active."],
          rows: [
            ["收据编号 / Receipt No.", pay.rows[0].receipt_no],
            ["金额 / Amount", "RM " + Number(pay.rows[0].amount).toFixed(2)],
            ["有效期至 / Valid until", new Date(u.rows[0].plan_expires_at).toLocaleDateString("en-MY")]
          ],
          cta: { url: "https://kwongthye.com/receipt/?id=" + pay.rows[0].id, label: "查看收据 / View receipt" },
          note: "收据 PDF 也作为附件发送；可在「我的账号 → 付款记录」随时下载。\nThe receipt PDF is attached and can be downloaded anytime under Account → Payments."
        }).html;
      } catch (e) {}
      await sendMail(req.user.email, "收据 / Receipt — " + pay.rows[0].receipt_no + " · KWONG THYE", text, null,
        [{ filename: pay.rows[0].receipt_no + ".pdf", content: pdf }], html4);
      console.log("receipt mail sent", pay.rows[0].receipt_no, req.user.email);
    } catch (e) { console.error("receipt mail failed", e.message); }
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});

// ---------- 房产资料库（PropBase） ----------
app.use("/api/library", createLibraryApi({ pool, requireAdmin, requireWrite }));

// ---------- fallbacks ----------
app.use("/api", function (req, res) { res.status(404).json({ ok: false, error: "not_found" }); });
app.use(function (err, req, res, next) {
  console.error(err && err.message);
  res.status(500).json({ ok: false, error: "server_error" });
});

app.listen(PORT, "127.0.0.1", function () { console.log("api listening on " + PORT); });
