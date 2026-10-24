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

function buildReceiptPdf(p) {
  return new Promise(function (resolve, reject) {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      doc.on("data", function (c) { chunks.push(c); });
      doc.on("end", function () { resolve(Buffer.concat(chunks)); });
      doc.on("error", reject);

      const logoPath = path.join(__dirname, "..", "web", "logo.png");
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 56, 48, { height: 46 }); } catch (e) {}
      }

      doc.fontSize(20).fillColor("#0E2438").text("RECEIPT", 300, 52, { width: 240, align: "right" });
      doc.fontSize(9).fillColor("#5D6B7A").text("KWONG THYE 光泰", 300, 78, { width: 240, align: "right" });
      doc.text("kwongthye.com · Johor Bahru, Malaysia", 300, 90, { width: 240, align: "right" });

      doc.moveTo(56, 120).lineTo(539, 120).strokeColor("#E4DED2").stroke();

      doc.fontSize(10).fillColor("#5D6B7A").text("Receipt No.", 56, 140);
      doc.fontSize(12).fillColor("#0E2438").text(p.receipt_no, 150, 139);
      doc.fontSize(10).fillColor("#5D6B7A").text("Date", 56, 160);
      doc.fontSize(12).fillColor("#0E2438").text(fmtDate(p.created_at), 150, 159);
      doc.fontSize(10).fillColor("#5D6B7A").text("Billed to", 56, 180);
      doc.fontSize(12).fillColor("#0E2438").text(p.email || "-", 150, 179);
      doc.fontSize(10).fillColor("#5D6B7A").text("Status", 56, 200);
      doc.fontSize(12).fillColor("#166E52").text("PAID", 150, 199);

      const top = 240;
      doc.rect(56, top, 483, 24).fill("#F7F4EE");
      doc.fillColor("#0E2438").fontSize(10).text("Description", 66, top + 7);
      doc.text("Days", 400, top + 7, { width: 50, align: "right" });
      doc.text("Amount", 460, top + 7, { width: 70, align: "right" });

      doc.fillColor("#1B2430").fontSize(11);
      doc.text("KWONG THYE Pro subscription", 66, top + 40);
      doc.fontSize(9).fillColor("#5D6B7A").text("Cloud plans + PDF / print / share + reminders", 66, top + 54);
      doc.fontSize(11).fillColor("#1B2430").text(String(p.days), 400, top + 40, { width: 50, align: "right" });
      doc.text(money(p.amount), 460, top + 40, { width: 70, align: "right" });

      doc.moveTo(56, top + 84).lineTo(539, top + 84).strokeColor("#E4DED2").stroke();
      doc.fontSize(11).fillColor("#5D6B7A").text("Total", 380, top + 96);
      doc.fontSize(16).fillColor("#0E2438").text(money(p.amount), 440, top + 92, { width: 99, align: "right" });

      if (p.expires_after) {
        doc.fontSize(9).fillColor("#5D6B7A").text("Valid until: " + fmtDate(p.expires_after), 56, top + 130);
      }

      doc.fontSize(8).fillColor("#8A96A3").text(
        "This receipt is generated automatically and requires no signature. Payment by bank transfer / activation code. Thank you.",
        56, 720, { width: 483 }
      );

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildReceiptPdf };
