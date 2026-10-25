"use strict";
/*
 * KWONG THYE 月度邮件（每月 1 号 10:00）
 * - 只发给邮箱已验证、未退订的用户
 * - 一人一个月最多一封（monthly_sent_at）
 * - 每封带退订链接（PDPA / 反垃圾要求）
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const mailLayout = require("./mail-layout");

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
envFile.split("\n").forEach(function (l) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: (process.env.SMTP_SECURE || "true") !== "false",
  pool: true, maxConnections: 1,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
const from = process.env.MAIL_FROM || process.env.SMTP_USER;
const replyTo = process.env.MAIL_REPLY_TO || "jamesyew1314@gmail.com";
const SECRET = process.env.ADMIN_SECRET || "kwongthye";
const SITE = "https://kwongthye.com";
const TEST_TO = process.env.MONTHLY_TEST_TO || ""; // 设置了就只发到这个地址，且不写数据库

function unsubToken(id) {
  return crypto.createHmac("sha256", SECRET).update("unsub:" + id).digest("hex").slice(0, 32);
}

const TIPS = [
  {
    zh: "RPGT 的第 6 年：持有满 6 年出售，RPGT 从 15% 直接变 0%。差一年，可能差几万令吉。",
    en: "RPGT year six: hold past the 6th year and the rate drops from 15% to 0%. One extra year can save tens of thousands."
  },
  {
    zh: "月供不等于成本：真正吃掉现金流的是「月供 − 租金 − 管理费 − 地税门牌税」，计算器第 2 部分就是在算这个。",
    en: "Instalment is not the cost: what eats your cash flow is instalment − rent − maintenance − quit rent & assessment. Part 2 of the calculator does exactly this."
  },
  {
    zh: "买新盘要算上 SPA 律师费、贷款律师费、估价费与 8% SST，通常占总价 3%–5%，这部分是现金，贷不到。",
    en: "For a new launch, add SPA legal fee, loan legal fee, valuation and 8% SST — usually 3%–5% of the price, and it is cash you cannot borrow."
  },
  {
    zh: "出租回报要看「净租金」而不是「毛租金」：扣掉管理费、门牌税、保险与空置期，才是真正进口袋的钱。",
    en: "Look at net rent, not gross: after maintenance, assessment, insurance and vacancy, only then is it money in your pocket."
  }
];

function buildBody(u, tip) {
  const unsub = SITE + "/api/unsubscribe?u=" + u.id + "&t=" + unsubToken(u.id);
  const planLine = (u.plan === "pro" && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date()))
    ? "您的专业版有效期至 " + new Date(u.plan_expires_at).toLocaleDateString("en-MY") + "。\nYour Pro plan is active until " + new Date(u.plan_expires_at).toLocaleDateString("en-MY") + "."
    : "您现在使用的是免费版（仅计算）。升级专业版 RM9.90/月 或 RM99/年，即可云端存档、PDF、分享与方案对比。\nYou are on the free plan (calculation only). Pro is RM9.90/month or RM99/year for cloud saving, PDF, sharing and scenario comparison.";
  return [
    "您好 / Hello,",
    "",
    "本月一条实用提示 / This month's tip:",
    tip.zh,
    tip.en,
    "",
    "把这个月要看的单位存成方案，用「方案对比」一眼看出哪间更值得买。",
    "Save this month's shortlisted units as plans, then use Scenario comparison to see which one wins.",
    "",
    "打开计算器 / Open the calculator:",
    SITE + "/calc/",
    "",
    planLine,
    "",
    "价格与功能 / Pricing: " + SITE + "/pricing/",
    "",
    "不想再收到这类邮件？点这里退订 / Unsubscribe:",
    unsub,
    "",
    "KWONG THYE 光泰"
  ].join("\n");
}

(async function () {
  const r = await pool.query(
    "SELECT id,email,plan,plan_expires_at FROM users " +
    "WHERE email_verified_at IS NOT NULL AND monthly_opt_out = false " +
    "AND (monthly_sent_at IS NULL OR monthly_sent_at < date_trunc('month', now())) " +
    "ORDER BY id");
  console.log("monthly recipients:", r.rowCount);

  const month = new Date().getMonth();
  const tip = TIPS[month % TIPS.length];
  let sent = 0, failed = 0;

  for (const u of r.rows) {
    const unsub = SITE + "/api/unsubscribe?u=" + u.id + "&t=" + unsubToken(u.id);
    const subject = (TEST_TO ? "[TEST] " : "") + "本月房地产小抄 / Your monthly property note — KWONG THYE";
    const text = buildBody(u, tip);
    try {
      let html = null;
      try {
        html = mailLayout.rich({
          heading: "本月小抄 / Monthly note",
          lead: [
            tip.zh,
            tip.en,
            "把这个月要看的单位存成方案，用「方案对比」一眼看出哪间更值得买。 / Save this month's shortlisted units as plans, then use Scenario comparison."
          ],
          cta: { url: SITE + "/calc/", label: "打开计算器 / Open the calculator" },
          note: (u.plan === "pro" ? "您的专业版有效期至 " + new Date(u.plan_expires_at).toLocaleDateString("en-MY") + "。\n"
                                  : "免费版仅计算；专业版 RM9.90/月 或 RM99/年 可解锁云端存档、报告与分享。\n") +
                "退订 / Unsubscribe: " + unsub
        }).html;
      } catch (e) {}
      await transport.sendMail({ from: from, to: TEST_TO || u.email, replyTo: replyTo, subject: subject, text: text, html: html || mailLayout.brand(subject, text).html });
      if (!TEST_TO) await pool.query("UPDATE users SET monthly_sent_at = now() WHERE id=$1", [u.id]);
      sent++;
      console.log("sent", u.email);
    } catch (e) {
      failed++;
      console.error("failed", u.email, e.message);
    }
  }
  console.log("done sent=" + sent + " failed=" + failed);
  transport.close();
  await pool.end();
})().catch(function (e) { console.error(e); process.exit(1); });
