"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const mailLayout = require("./mail-layout");

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
    "AND plan_expires_at <= now() + interval '7 days' AND plan_expires_at > now() " +
    "AND (plan_reminder_at IS NULL OR plan_reminder_at < plan_expires_at - interval '7 days') " +
    "ORDER BY plan_expires_at"
  );
  console.log("reminders to send:", r.rowCount);
  for (const u of r.rows) {
    const days = Math.max(0, Math.ceil((new Date(u.plan_expires_at) - Date.now()) / 86400000));
    const subject = days > 0
      ? "Pro 到期提醒 / Renewal reminder — KWONG THYE"
      : "Pro 已到期 / Plan expired — KWONG THYE";
    const dateStr = new Date(u.plan_expires_at).toLocaleDateString("en-MY");
    const text = [
      "您好 / Hello,",
      "",
      days > 0
        ? "您的 KWONG THYE 专业版还剩 " + days + " 天到期（" + dateStr + "）。"
        : "您的 KWONG THYE 专业版已于 " + dateStr + " 到期。",
      days > 0
        ? "Your KWONG THYE Pro plan expires in " + days + " day(s) on " + dateStr + "."
        : "Your KWONG THYE Pro plan expired on " + dateStr + ".",
      "",
      "续费后方案数量不限。回复此邮件或 WhatsApp +60 16-528 0918 获取开通码。",
      "Renew to keep unlimited plans. Reply to this email or WhatsApp +60 16-528 0918 for an activation code.",
      "",
      "登录 / Sign in: https://kwongthye.com/calc/",
      "",
      "KWONG THYE 光泰"
    ].join("\n");
    let html = null;
    try {
      html = mailLayout.rich({
        heading: days > 0 ? "专业版即将到期 / Renewal reminder" : "专业版已到期 / Plan expired",
        lead: days > 0
          ? ["您的 KWONG THYE 专业版还剩 " + days + " 天到期。续费后方案数量不限、报告与云端存档继续可用。",
             "Your KWONG THYE Pro plan expires in " + days + " day(s). Renew to keep unlimited plans, PDF reports and cloud saving."]
          : ["您的 KWONG THYE 专业版已于 " + dateStr + " 到期。续费后方案数量不限。",
             "Your KWONG THYE Pro plan expired on " + dateStr + ". Renew to keep unlimited plans."],
        rows: [["到期日 / Expiry", dateStr], ["剩余 / Remaining", days > 0 ? days + " 天 / days" : "已到期 / expired"]],
        cta: { url: "https://kwongthye.com/pricing/", label: "查看价格 / See pricing" },
        note: "回复此邮件或 WhatsApp +60 16-528 0918 即可获取开通码。\nReply to this email or WhatsApp +60 16-528 0918 for an activation code."
      }).html;
    } catch (e) {}
    try {
      await transport.sendMail({ from: from, to: u.email, replyTo: replyTo, subject: subject, text: text, html: html || mailLayout.brand(subject, text).html });
      await pool.query("UPDATE users SET plan_reminder_at=now() WHERE id=$1", [u.id]);
      console.log("sent", u.email, "days", days);
    } catch (e) {
      console.error("failed", u.email, e.message);
    }
  }
  // 到期当天/之后的第二次提醒
  const ex = await pool.query(
    "SELECT id,email,plan_expires_at FROM users " +
    "WHERE plan='pro' AND plan_expires_at IS NOT NULL " +
    "AND plan_expires_at <= now() AND plan_expires_at > now() - interval '3 days' " +
    "AND expiry_notice_at IS NULL ORDER BY plan_expires_at"
  );
  console.log("expired notices:", ex.rowCount);
  for (const u of ex.rows) {
    const dateStr = new Date(u.plan_expires_at).toLocaleDateString("en-MY");
    const text = [
      "您好 / Hello,",
      "",
      "您的 KWONG THYE 专业版已于 " + dateStr + " 到期。",
      "Your KWONG THYE Pro plan expired on " + dateStr + ".",
      "",
      "续费后方案数量不限。回复此邮件或 WhatsApp +60 16-528 0918 获取开通码。",
      "Renew to keep unlimited plans. Reply to this email or WhatsApp +60 16-528 0918 for an activation code.",
      "",
      "登录 / Sign in: https://kwongthye.com/calc/",
      "",
      "KWONG THYE 光泰"
    ].join("\n");
    let html2 = null;
    try {
      html2 = mailLayout.rich({
        heading: "专业版已到期 / Plan expired",
        lead: ["您的 KWONG THYE 专业版已于 " + dateStr + " 到期，云端存档与报告导出已暂停（已保存的方案不会删除）。",
               "Your KWONG THYE Pro plan expired on " + dateStr + ". Cloud saving and report export are paused (your saved plans are kept)."],
        rows: [["到期日 / Expiry", dateStr]],
        cta: { url: "https://kwongthye.com/pricing/", label: "续费 / Renew" },
        note: "回复此邮件或 WhatsApp +60 16-528 0918 获取开通码。\nReply to this email or WhatsApp +60 16-528 0918 for an activation code."
      }).html;
    } catch (e) {}
    try {
      await transport.sendMail({ from: from, to: u.email, replyTo: replyTo, subject: "Pro 已到期 / Plan expired — KWONG THYE", text: text, html: html2 || mailLayout.brand("Pro 已到期 / Plan expired — KWONG THYE", text).html });
      await pool.query("UPDATE users SET expiry_notice_at=now() WHERE id=$1", [u.id]);
      console.log("expired notice sent", u.email);
    } catch (e) {
      console.error("expired notice failed", u.email, e.message);
    }
  }

  transport.close();
  await pool.end();
})().catch(function (e) { console.error(e); process.exit(1); });
