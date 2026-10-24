#!/usr/bin/env node
"use strict";
/*
 * 通用运维通知：node notify.js "主题" "正文"
 * 读取 /srv/fangchan/api/.env 里的 SMTP 配置，发给 ADMIN_EMAIL（默认 andylau.theroof@gmail.com）
 */
const fs = require("fs");
const path = require("path");

const ENV = process.env.ENV_FILE || "/srv/fangchan/api/.env";
try {
  fs.readFileSync(ENV, "utf8").split("\n").forEach(function (l) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (e) { /* 允许纯环境变量运行 */ }

let nodemailer;
try { nodemailer = require("nodemailer"); }
catch (e) { nodemailer = require("/srv/fangchan/api/node_modules/nodemailer"); }

const mailLayout = require(path.join(__dirname, "mail-layout.js"));

const subject = process.argv[2] || "kwongthye.com 运维通知";
const body = process.argv[3] || "(无内容)";
const to = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || "andylau.theroof@gmail.com";
const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@kwongthye.com";

(async function () {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("SMTP not configured");
    process.exit(2);
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: (process.env.SMTP_SECURE || "true") !== "false",
    pool: true, maxConnections: 1,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transport.sendMail({
    from: from, to: to,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    subject: subject,
    text: body,
    html: mailLayout.brand(subject, body).html
  });
  transport.close();
  console.log("notified", to);
})().catch(function (e) { console.error("notify failed:", e.message); process.exit(1); });
