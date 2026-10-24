"use strict";
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

function money(n) {
  return "RM " + Number(n).toFixed(2);
}
function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// 中文字体（服务器装了 fonts-noto-cjk 才有；没有则退回英文标签，绝不报错）
const CJK_CANDIDATES = [
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
  path.join(__dirname, "..", "web", "NotoSansCJK-Regular.ttc")
];

function buildReceiptPdf(p) {
  return new Promise(function (resolve, reject) {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      let hasCjk = false;
      for (const f of CJK_CANDIDATES) {
        if (!fs.existsSync(f)) continue;
        try { doc.registerFont("cjk", f, "NotoSansCJKsc-Regular"); hasCjk = true; break; } catch (e) {
          try { doc.registerFont("cjk", f); hasCjk = true; break; } catch (e2) {}
        }
      }
      const F = hasCjk ? "cjk" : "Helvetica";
      // 有中文字体 → 中英并列；没有 → 只用英文（避免乱码）
      const L = function (zh, en) { return hasCjk ? zh + " · " + en : en; };
      const chunks = [];
      doc.on("data", function (c) { chunks.push(c); });
      doc.on("end", function () { resolve(Buffer.concat(chunks)); });
      doc.on("error", reject);

      const logoPath = path.join(__dirname, "..", "web", "logo.png");
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 56, 48, { height: 46 }); } catch (e) {}
      }

      doc.font(F).fontSize(20).fillColor("#0E2438").text(L("收据", "RECEIPT"), 260, 52, { width: 280, align: "right" });
      doc.font(F).fontSize(9).fillColor("#5D6B7A").text("KWONG THYE 光泰", 300, 78, { width: 240, align: "right" });
      doc.font(F).text("kwongthye.com · Johor Bahru, Malaysia", 300, 90, { width: 240, align: "right" });

      doc.moveTo(56, 120).lineTo(539, 120).strokeColor("#E4DED2").stroke();

      doc.font(F).fontSize(10).fillColor("#5D6B7A").text(L("收据编号", "Receipt No."), 56, 140);
      doc.font(F).fontSize(12).fillColor("#0E2438").text(p.receipt_no, 170, 139);
      doc.font(F).fontSize(10).fillColor("#5D6B7A").text(L("日期", "Date"), 56, 160);
      doc.font(F).fontSize(12).fillColor("#0E2438").text(fmtDate(p.created_at), 170, 159);
      doc.font(F).fontSize(10).fillColor("#5D6B7A").text(L("客户", "Billed to"), 56, 180);
      doc.font(F).fontSize(12).fillColor("#0E2438").text(p.email || "-", 170, 179);
      doc.font(F).fontSize(10).fillColor("#5D6B7A").text(L("状态", "Status"), 56, 200);
      doc.font(F).fontSize(12).fillColor("#166E52").text(L("已付款", "PAID"), 170, 199);

      const top = 240;
      doc.rect(56, top, 483, 24).fill("#F7F4EE");
      doc.font(F).fillColor("#0E2438").fontSize(10).text(L("项目", "Description"), 66, top + 7);
      doc.font(F).text(L("天数", "Days"), 380, top + 7, { width: 60, align: "right" });
      doc.font(F).text(L("金额", "Amount"), 450, top + 7, { width: 80, align: "right" });

      doc.font(F).fillColor("#1B2430").fontSize(11);
      doc.font(F).text(L("KWONG THYE 专业版订阅", "KWONG THYE Pro subscription"), 66, top + 40);
      doc.font(F).fontSize(9).fillColor("#5D6B7A").text(L("云端存档 + PDF / 打印 / 分享 + 到期提醒", "Cloud plans + PDF / print / share + reminders"), 66, top + 54);
      doc.font(F).fontSize(11).fillColor("#1B2430").text(String(p.days), 380, top + 40, { width: 60, align: "right" });
      doc.font(F).text(money(p.amount), 450, top + 40, { width: 80, align: "right" });

      doc.moveTo(56, top + 84).lineTo(539, top + 84).strokeColor("#E4DED2").stroke();
      doc.font(F).fontSize(11).fillColor("#5D6B7A").text(L("合计", "Total"), 360, top + 96);
      doc.font(F).fontSize(16).fillColor("#0E2438").text(money(p.amount), 430, top + 92, { width: 109, align: "right" });

      if (p.expires_after) {
        doc.font(F).fontSize(9).fillColor("#5D6B7A").text(L("有效期至", "Valid until") + "  " + fmtDate(p.expires_after), 56, top + 130);
      }

      doc.font(F).fontSize(8).fillColor("#8A96A3").text(
        L("此收据由系统自动生成，无需签名。付款方式：银行转账 / 开通码。谢谢。",
          "This receipt is generated automatically and requires no signature. Payment by bank transfer / activation code. Thank you."),
        56, 720, { width: 483 }
      );

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildReceiptPdf };
