"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
envFile.split("\n").forEach(function (l) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function newCode() {
  return Array.from({ length: 3 }, function () {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }).join("-");
}

(async function () {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);
  if (cmd === "create-code") {
    const days = parseInt(args[0] || "365", 10);
    const count = parseInt(args[1] || "1", 10);
    const note = args[2] || null;
    const amount = args[3] !== undefined ? parseFloat(args[3]) : (days >= 365 ? 99 : Math.round(9.9 * Math.ceil(days / 30) * 100) / 100);
    for (let i = 0; i < count; i++) {
      const c = newCode();
      await pool.query("INSERT INTO redeem_codes(code,days,note,amount) VALUES($1,$2,$3,$4)", [c, days, note, amount]);
      console.log(c);
    }
  } else if (cmd === "otp") {
    const crypto = require("node:crypto");
    const email = (args[0] || process.env.ADMIN_EMAIL || "andylau.theroof@gmail.com").toLowerCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    await pool.query("INSERT INTO admin_otps(code_hash,expires_at,email) VALUES($1, now() + interval '10 minutes',$2)", [hash, email]);
    console.log(code);
  } else if (cmd === "logs") {
    const r = await pool.query("SELECT created_at,action,detail FROM admin_logs ORDER BY created_at DESC LIMIT 50");
    console.table(r.rows);
  } else if (cmd === "create-promo") {
    const code = String(args[0] || "").toUpperCase().trim();
    const days = parseInt(args[1] || "30", 10);
    const maxUses = parseInt(args[2] || "10", 10);
    const amount = args[3] !== undefined ? parseFloat(args[3]) : (days >= 365 ? 99 : 9.9);
    const note = args[4] || null;
    const expDays = args[5] ? parseInt(args[5], 10) : null;
    if (!code) { console.log("usage: create-promo <CODE> <days> <maxUses> <amount> [note] [expiryDays]"); }
    else {
      await pool.query(
        "INSERT INTO redeem_codes(code,days,note,amount,max_uses,label,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [code, days, note, amount, maxUses, "promo", expDays ? new Date(Date.now() + expDays * 86400000) : null]);
      console.log("promo created:", code, days + " days", "max " + maxUses + " uses", "RM" + amount);
    }
  } else if (cmd === "list-codes") {
    const r = await pool.query("SELECT code, days, note, (used_by IS NOT NULL) AS used, created_at FROM redeem_codes ORDER BY created_at DESC LIMIT 50");
    console.table(r.rows);
  } else if (cmd === "set-plan") {
    const email = args[0];
    const days = parseInt(args[1] || "365", 10);
    const r = await pool.query(
      "UPDATE users SET plan='pro', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ($1 || ' days')::interval, updated_at=now() WHERE email=$2 RETURNING email, plan, plan_expires_at",
      [days, email]);
    console.log(r.rows[0] || "user not found");
  } else if (cmd === "mail-test") {
    const nodemailer = require("nodemailer");
    const to = args[0];
    if (!to) { console.log("usage: node admin.js mail-test <email>"); }
    else {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "465", 10),
        secure: (process.env.SMTP_SECURE || "true") !== "false",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      const info = await t.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: to,
        replyTo: process.env.MAIL_REPLY_TO || "jamesyew1314@gmail.com",
        subject: "KWONG THYE 邮件测试 / Mail test",
        text: "这是一封来自 kwongthye.com 的测试邮件。\n\nThis is a test email from kwongthye.com.\n\n如果收到，说明 SMTP 配置成功。"
      });
      console.log("sent", info.messageId, info.response);
    }
  } else if (cmd === "verify-link") {
    const crypto = require("node:crypto");
    const email = args[0];
    const u = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (!u.rows[0]) { console.log("user not found"); }
    else {
      const token = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      await pool.query("INSERT INTO email_verifications(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '24 hours')", [u.rows[0].id, hash]);
      console.log("https://kwongthye.com/calc/?verify=" + token);
    }
  } else if (cmd === "reset-link") {
    const crypto = require("node:crypto");
    const email = args[0];
    const u = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (!u.rows[0]) {
      console.log("user not found");
    } else {
      const token = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      await pool.query("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '24 hours')", [u.rows[0].id, hash]);
      console.log("https://kwongthye.com/calc/?reset=" + token);
    }
  } else if (cmd === "messages") {
    const days = parseInt(args[0] || "30", 10);
    const r = await pool.query("SELECT created_at, name, phone, email, subject, left(message,80) AS message, emailed FROM contact_messages WHERE created_at > now() - ($1 || ' days')::interval ORDER BY created_at DESC LIMIT 50", [days]);
    console.table(r.rows);
  } else if (cmd === "pageviews") {
    const days = parseInt(args[0] || "7", 10);
    const d = await pool.query("SELECT created_at::date AS day, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1 DESC", [days]);
    const t = await pool.query("SELECT path, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 10", [days]);
    console.table(d.rows);
    console.table(t.rows);
  } else if (cmd === "stats") {
    const u = await pool.query("SELECT count(*)::int AS users, count(*) FILTER (WHERE plan='pro')::int AS pro FROM users");
    const p = await pool.query("SELECT count(*)::int AS plans FROM plans");
    console.log({ users: u.rows[0].users, pro: u.rows[0].pro, plans: p.rows[0].plans });
  } else {
    console.log("usage: node admin.js create-code <days> [count] [note] | list-codes | set-plan <email> <days> | stats");
  }
  await pool.end();
})().catch(function (e) { console.error(e.message); process.exit(1); });
