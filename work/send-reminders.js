"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
envFile.split("\n").forEach(function (l) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: (process.env.SMTP_SECURE || "true") !== "false",
  pool: true,
  maxConnections: 1,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
const from = process.env.MAIL_FROM || process.env.SMTP_USER;
const replyTo = process.env.MAIL_REPLY_TO || "jamesyew1314@gmail.com";

(async function () {
  const r = await pool.query(
    "SELECT id,email,plan_expires_at FROM users " +
    "WHERE plan='pro' AND plan_expires_at IS NOT NULL " +
    "AND plan_expires_at <= now() + interval '7 days' " +
    "AND (plan_reminder_at IS NULL OR plan_reminder_at < plan_expires_at - interval '7 days') " +
    "ORDER BY plan_expires_at"
  );
  console.log("reminders to send:", r.rowCount);
  for (const u of r.rows) {
    const days = Math.max(0, Math.ceil((new Date(u.plan_expires_at) - Date.now()) / 86400000));
    const subject = days > 0
      ? "KWONG THYE Pro 到期提醒 / Renewal reminder"
      : "KWONG THYE Pro 已到期 / Plan expired";
    const text = [
      "您好，",
      "",
      days > 0
        ? "您的 KWONG THYE 专业版还剩 " + days + " 天到期（" + new Date(u.plan_expires_at).toLocaleDateString("en-MY") + "）。"
        : "您的 KWONG THYE 专业版已于 " + new Date(u.plan_expires_at).toLocaleDateString("en-MY") + " 到期。",
      "续费后方案数量不限。回复此邮件或 WhatsApp +60 16-528 0918 获取开通码。",
      "",
      "登录：https://kwongthye.com/calc/",
      "",
      "KWONG THYE 光泰"
    ].join("\n");
    try {
      await transport.sendMail({ from: from, to: u.email, replyTo: replyTo, subject: subject, text: text });
      await pool.query("UPDATE users SET plan_reminder_at=now() WHERE id=$1", [u.id]);
      console.log("sent", u.email, "days", days);
    } catch (e) {
      console.error("failed", u.email, e.message);
    }
  }
  transport.close();
  await pool.end();
})().catch(function (e) { console.error(e); process.exit(1); });
