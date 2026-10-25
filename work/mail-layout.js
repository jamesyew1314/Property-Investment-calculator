"use strict";
/*
 * KWONG THYE 品牌邮件模板
 * 用法： const { brand } = require("./mail-layout"); brand(subject, text).html
 * 纯文本仍然是唯一的「内容来源」，HTML 只是把它排版好看，所以旧邮件模板不用改。
 */

const SITE = "https://kwongthye.com";
const LOGO = SITE + "/logo-white.png";
const NAVY = "#0E2438";
const GOLD = "#C6A15B";
const CREAM = "#F7F4EE";
const INK = "#2B3441";
const MUTED = "#8A929E";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linkify(s) {
  return esc(s)
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" style="color:#2E5496;text-decoration:underline;word-break:break-all">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1" style="color:#2E5496;text-decoration:none">$1</a>');
}

const SIG = /^(kwong\s*thye|光泰|https:\/\/kwongthye\.com\/?$)/i;

function paragraphs(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  // 去掉结尾签名（页脚已经统一放了）
  while (lines.length && (!lines[lines.length - 1].trim() || SIG.test(lines[lines.length - 1].trim()))) lines.pop();
  const out = [];
  let buf = [];
  const flush = function () {
    if (buf.length) { out.push(buf.slice()); buf = []; }
  };
  lines.forEach(function (l) {
    if (!l.trim()) { flush(); return; }
    buf.push(l);
  });
  flush();
  return out;
}

function button(url, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px"><tr>' +
    '<td style="background:' + GOLD + ';border-radius:8px">' +
    '<a href="' + esc(url) + '" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;' +
    'color:#1B2430;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">' +
    esc(label) + "</a></td></tr></table>";
}

// 统一外壳：页头 Logo + 标题 + 内容 + 页脚
function shell(heading, bodyHtml, preheader) {
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + esc(heading) + "</title></head>" +
    '<body style="margin:0;padding:0;background:' + CREAM + ';">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc(preheader || heading).slice(0, 120) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + CREAM + '">' +
    '<tr><td align="center" style="padding:26px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:560px;background:#ffffff;border:1px solid #E7E2D7;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + NAVY + ';padding:18px 24px">' +
    '<img src="' + LOGO + '" alt="KWONG THYE 光泰" height="34" style="height:34px;width:auto;display:block;border:0;outline:none">' +
    "</td></tr>" +
    '<tr><td style="height:3px;background:' + GOLD + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:26px 24px 6px">' +
    '<div style="font-family:Georgia,\'Songti SC\',serif;font-size:19px;font-weight:700;color:' + NAVY + ';margin:0 0 14px">' +
    esc(heading) + "</div>" + bodyHtml + "</td></tr>" +
    '<tr><td style="padding:6px 24px 22px">' +
    '<div style="border-top:1px solid #EEEAE1;padding-top:14px;font-size:12px;line-height:1.7;color:' + MUTED + '">' +
    "KWONG THYE 光泰 · 马来西亚房地产投资顾问<br>" +
    'WhatsApp <a href="https://wa.me/60165280918" style="color:#2E5496;text-decoration:none">+60 16-528 0918</a>' +
    ' · <a href="mailto:andylau.theroof@gmail.com" style="color:#2E5496;text-decoration:none">andylau.theroof@gmail.com</a><br>' +
    '<a href="' + SITE + '" style="color:#2E5496;text-decoration:none">kwongthye.com</a>' +
    ' · <a href="' + SITE + '/privacy/" style="color:#2E5496;text-decoration:none">隐私政策 Privacy</a>' +
    ' · <a href="' + SITE + '/terms/" style="color:#2E5496;text-decoration:none">使用条款 Terms</a>' +
    "</div></td></tr></table>" +
    '<div style="max-width:560px;margin:12px auto 0;text-align:center;font-size:11px;line-height:1.6;color:#9AA1AB">' +
    "您收到此邮件，是因为您在 kwongthye.com 注册了账号或使用了我们的服务。<br>" +
    "You received this email because you registered at kwongthye.com or used our service." +
    "</div></td></tr></table></body></html>";
}

// 结构化模板：标题 + 正文 + 明细表 + 验证码框 + 按钮 + 备注
function rich(o) {
  o = o || {};
  var inner = "";
  (o.lead || []).forEach(function (p) {
    inner += '<p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:' + INK + '">' + linkify(p) + "</p>";
  });
  if (o.rows && o.rows.length) {
    inner += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-collapse:collapse">';
    o.rows.forEach(function (r) {
      inner += '<tr>' +
        '<td style="padding:9px 0;border-bottom:1px solid #F0EDE6;font-size:13px;color:' + MUTED + '">' + esc(r[0]) + "</td>" +
        '<td style="padding:9px 0;border-bottom:1px solid #F0EDE6;font-size:13px;color:' + INK + ';text-align:right;font-weight:600">' + esc(r[1]) + "</td>" +
        "</tr>";
    });
    inner += "</table>";
  }
  if (o.code) {
    inner += '<div style="margin:6px 0 18px;background:' + CREAM + ";border:1px solid #E7E2D7;border-radius:10px;" +
      'padding:16px;text-align:center"><div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;' +
      'letter-spacing:8px;font-weight:700;color:' + NAVY + '">' + esc(o.code) + "</div>" +
      (o.codeNote ? '<div style="margin-top:6px;font-size:12px;color:' + MUTED + '">' + esc(o.codeNote) + "</div>" : "") +
      "</div>";
  }
  if (o.cta && o.cta.url) inner += button(o.cta.url, o.cta.label || "点此继续 / Continue");
  if (o.note) {
    inner += '<p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #F0EDE6;font-size:12px;line-height:1.7;color:' + MUTED + '">' +
      linkify(o.note).replace(/\n/g, "<br>") + "</p>";
  }
  return { html: shell(o.heading || "", inner, o.preheader) };
}

function brand(subject, text, opts) {
  opts = opts || {};
  const paras = paragraphs(text);
  // 单独一行的链接 → 变成按钮
  let cta = null;
  const bodyHtml = paras.map(function (p) {
    // 段落最后一行若是链接（可带「登录 / Sign in:」前缀）→ 抽出来做按钮
    const last = p.length ? p[p.length - 1].trim() : "";
    if (!cta && last && p.length) {
      const m = last.match(/^(.*?)(https?:\/\/\S+)\s*$/);
      if (m && m[1].indexOf("http") < 0 && m[1].length <= 40) {
        cta = m[2];
        const keep = m[1].replace(/[：:\-–—\s]+$/, "").trim();
        p = keep ? p.slice(0, -1).concat([keep]) : p.slice(0, -1);
        if (!p.length) return "";
      }
    }
    return '<p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:' + INK + '">' +
      p.map(linkify).join("<br>") + "</p>";
  }).filter(Boolean).join("");

  const preheader = esc((paras[0] && paras[0].join(" ")) || subject).slice(0, 120);

  const withBtn = bodyHtml + (cta ? button(cta, opts.ctaLabel || "点此继续 / Continue") : "");
  var html = shell(opts.heading || subject.replace(/\s*[—–-]\s*KWONG THYE\s*$/, ""),
    withBtn, (paras[0] && paras[0].join(" ")) || subject);
  return { html: html };
}

module.exports = { brand, rich, shell, esc };
