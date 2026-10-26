"use strict";
/*
 * 完整投资分析报告 PDF（服务端生成，A4 多页）
 * 数据由前端算出后 POST 上来（不在服务端重复实现公式，避免两套口径不一致）。
 * 中文字体：服务器 fonts-noto-cjk；缺字体时自动退回英文，不会乱码。
 */
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const C = {
  navy: "#0E2438", gold: "#C6A15B", ink: "#1B2430", muted: "#5D6B7A",
  line: "#E4DED2", green: "#166E52", red: "#B23B3B", cream: "#F7F4EE", soft: "#F3F6FB"
};
const M = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CW = PAGE_W - M * 2;

const CJK_R = [
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
];
const CJK_B = [
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
];

function num(v, dflt) {
  const n = Number(v);
  return isFinite(n) ? n : (dflt || 0);
}
function money(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "-RM " : "RM ") + Math.abs(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(x, dp) {
  const v = Number(x);
  if (!isFinite(v)) return "—";
  return (v * 100).toFixed(dp == null ? 2 : dp) + "%";
}
function txt(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 120);
}
function dateStr(d) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// 标签字典：只覆盖报告用到的词
const L = {
  zh: {
    title: "投资分析报告", subtitle: "买入 · 持有 · 出租 · 卖出",
    client: "客户", project: "项目 / 楼盘", agent: "顾问", prepared: "报告日期",
    p1: "Part 1 · 买入（第一次要出的费用）",
    spaP: "SPA 价格", actual: "实际买价", loan: "贷款数额", rate: "年利率", tenure: "贷款年限",
    pmt: "月供（等额本息）", down: "首付（实价 − 贷款）", cashback: "减：超额贷款 / Cashback",
    acqTitle: "购入费用明细", spaFee: "SPA 律师费（含印花税、杂费、8% SST）",
    laFee: "贷款律师费（含印花税、杂费、8% SST）", val: "房产估价费",
    agentFee: "中介费", consent: "同意书 / 杂费", other: "其他费用",
    acqTotal: "总购置费用", upfront: "首次需要现金 Total Upfront Cash",
    p2: "Part 2 · 年度持有费用", mgmt: "管理费（月 × 12）", quit: "地税 Quit Rent",
    assess: "门牌税 Assessment", repair: "装修 / 维修（预留）", insur: "保险",
    rentAgent: "出租中介费", interest: "银行利息（平均口径：贷款 × 年利率）",
    annualCost: "年度总费用",
    p3: "Part 3 · 投资回报", rentY: "年租金收入", netY: "年净利润（租金 − 年度费用）",
    annualReturn: "年回报率（净利润 ÷ 首次现金）", holdYears: "持有年限",
    totalRentProfit: "总租金净利润（年净利润 × 年限）",
    p3a: "持有期间逐年明细", thYear: "年", thBal: "年末贷款余额", thInt: "当年利息",
    thCost: "当年费用", thNet: "当年净利润", thRpgt: "RPGT 税率",
    p3b: "卖出与总回报", sellPrice: "预算卖价", grossGain: "毛资本利得（卖价 − 实价 − 购置费）",
    rpgt: "RPGT（产业盈利税）", sellAgentFee: "卖出中介费", sellLegalFee: "卖出律师费",
    sellMisc: "售出杂费", sellCosts: "总出售费用（含 RPGT）", sellingProfit: "出售利润",
    sellingReturn: "出售回报率（年化）", netInvProfit: "投资净利润（持有 + 出售）",
    totalRoi: "Total ROI（年化）", totalCost: "Total Cost（实价 + 购置 + 出售）",
    rotc: "Return on Total Cost（年化）",
    note: "备注", disclaimer:
      "律师费、印花税按法定费率自动估算，RPGT 按 30/20/15/0 估算，银行利息为等额本息与平均口径并用——" +
      "实际金额以律师报价、银行结算单与 LHDN 为准。本报告为投资估算，不构成法律或税务意见。",
    generated: "由 kwongthye.com 计算器生成", page: "第", pageOf: "页 / 共", pages: "页",
    years: "年", noData: "（未填写）"
  },
  en: {
    title: "Investment Analysis Report", subtitle: "Buy · Hold · Rent · Sell",
    client: "Client", project: "Project", agent: "Adviser", prepared: "Prepared",
    p1: "Part 1 · Acquisition (cash needed at purchase)",
    spaP: "SPA price", actual: "Actual purchase price", loan: "Loan amount", rate: "Interest rate",
    tenure: "Loan tenure", pmt: "Monthly instalment (amortised)",
    down: "Down payment (price − loan)", cashback: "Less: excess loan / cashback",
    acqTitle: "Acquisition cost breakdown", spaFee: "SPA legal fee (incl. stamp duty, misc, 8% SST)",
    laFee: "Loan agreement legal fee (incl. stamp duty, misc, 8% SST)", val: "Property valuation fee",
    agentFee: "Agency fee", consent: "Consent / misc", other: "Others",
    acqTotal: "Total acquisition costs", upfront: "Total Upfront Cash",
    p2: "Part 2 · Annual holding costs", mgmt: "Maintenance (monthly × 12)", quit: "Quit rent",
    assess: "Assessment", repair: "Renovation / repairs (provision)", insur: "Insurance",
    rentAgent: "Rental agent fee", interest: "Bank interest (flat: loan × rate)",
    annualCost: "Total annual cost",
    p3: "Part 3 · Investment return", rentY: "Annual rental income",
    netY: "Annual net profit (rent − annual cost)",
    annualReturn: "Annual return (net profit ÷ upfront cash)", holdYears: "Holding period",
    totalRentProfit: "Total rental profit (annual net × years)",
    p3a: "Year-by-year while holding", thYear: "Year", thBal: "Loan balance (year end)",
    thInt: "Interest", thCost: "Costs", thNet: "Net profit", thRpgt: "RPGT rate",
    p3b: "Sale and total return", sellPrice: "Planned selling price",
    grossGain: "Gross capital gain (price − purchase − costs)",
    rpgt: "RPGT (real property gains tax)", sellAgentFee: "Selling agent fee",
    sellLegalFee: "Selling legal fee", sellMisc: "Selling misc",
    sellCosts: "Total selling costs (incl. RPGT)", sellingProfit: "Selling profit",
    sellingReturn: "Selling return (annualised)", netInvProfit: "Net investment profit (hold + sell)",
    totalRoi: "Total ROI (annualised)", totalCost: "Total Cost (price + acquisition + selling)",
    rotc: "Return on Total Cost (annualised)",
    note: "Notes", disclaimer:
      "Legal fees and stamp duty are statutory estimates; RPGT is estimated at 30/20/15/0; interest uses both " +
      "amortised and flat conventions. Actual figures are subject to the lawyer's quotation, the bank's statement and LHDT/LHDN. " +
      "This report is an investment estimate, not legal or tax advice.",
    generated: "Generated by the kwongthye.com calculator", page: "Page", pageOf: "of", pages: "",
    years: "yrs", noData: "(not provided)"
  }
};

function buildReportPdf(payload) {
  return new Promise(function (resolve, reject) {
    try {
      const p = payload || {};
      const lang = p.lang === "en" ? "en" : "zh";
      const t = function (k) { return (L[lang] && L[lang][k]) || L.zh[k] || k; };
      const inp = p.input || {};
      const r = p.result || {};
      const p1 = r.part1 || {}, p2 = r.part2 || {}, sale = r.sale || {}, out = r.out || {};
      const years = Array.isArray(r.years) ? r.years.slice(0, 50) : [];
      const co = p.company || {};

      const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, autoFirstPage: true });
      const chunks = [];
      doc.on("data", function (c) { chunks.push(c); });
      doc.on("end", function () { resolve(Buffer.concat(chunks)); });
      doc.on("error", reject);

      // 字体
      let hasCjk = false;
      for (const f of CJK_R) {
        if (!fs.existsSync(f)) continue;
        try { doc.registerFont("r", f, "NotoSansCJKsc-Regular"); hasCjk = true; break; } catch (e) { try { doc.registerFont("r", f); hasCjk = true; break; } catch (e2) {} }
      }
      let hasBold = false;
      if (hasCjk) {
        for (const f of CJK_B) {
          if (!fs.existsSync(f)) continue;
          try { doc.registerFont("b", f, "NotoSansCJKsc-Bold"); hasBold = true; break; } catch (e) { try { doc.registerFont("b", f); hasBold = true; break; } catch (e2) {} }
        }
      }
      const FR = hasCjk ? "r" : "Helvetica";
      const FB = hasCjk && hasBold ? "b" : (hasCjk ? "r" : "Helvetica-Bold");
      // 没有中文字体就不再输出中文，避免乱码
      const T = function (k) { const s = t(k); return hasCjk ? s : s.replace(/[\u4e00-\u9fff·（）]/g, "").trim() || s; };
      const pick = function (zh, en) { return hasCjk ? (lang === "en" ? en : zh) : en; };

      let y = 0;

      function hr(yy, color, w) {
        doc.moveTo(M, yy).lineTo(M + (w || CW), yy).lineWidth(0.7).strokeColor(color || C.line).stroke();
      }
      function sectionTitle(label, yy, badge) {
        const top = yy;
        doc.rect(M, top, CW, 24).fill(C.soft);
        doc.rect(M, top, 3, 24).fill(C.navy);
        doc.font(FB).fontSize(10.5).fillColor(C.navy).text(label, M + 12, top + 7, { width: CW - 120 });
        if (badge) {
          doc.font(FR).fontSize(8.5).fillColor(C.muted).text(badge, M + CW - 120, top + 8, { width: 108, align: "right" });
        }
        return top + 32;
      }
      // 两列表格行：左标签 + 右金额
      function row(label, value, yy, opt) {
        opt = opt || {};
        doc.font(opt.bold ? FB : FR).fontSize(opt.size || 9.5)
          .fillColor(opt.color || C.ink)
          .text(label, M + 4, yy, { width: CW - 160, lineBreak: false, ellipsis: true });
        doc.font(opt.bold ? FB : FR).fontSize(opt.size || 9.5)
          .fillColor(opt.valueColor || (opt.bold ? C.navy : C.ink))
          .text(value, M + CW - 160, yy, { width: 156, align: "right", lineBreak: false });
        if (!opt.noLine) hr(yy + 14, "#F0EDE6");
        return yy + 18;
      }
      function boxed(label, value, yy, color) {
        doc.roundedRect(M, yy, CW, 26, 5).fill(color || C.cream);
        doc.font(FB).fontSize(10).fillColor(C.navy).text(label, M + 10, yy + 8, { width: CW - 190, lineBreak: false, ellipsis: true });
        doc.font(FB).fontSize(12.5).fillColor(C.green).text(value, M + CW - 180, yy + 6, { width: 170, align: "right" });
        return yy + 34;
      }

      // 横向条形图：items = [{k: 标签, v: 数值, color}]
      // signed=true 时以零轴居中（负数向左），否则从左侧起画（全部为正）
      function hbars(title, items, yy, signed) {
        if (!items || !items.length) return yy;
        if (yy > PAGE_H - 130) { doc.addPage(); yy = M; }
        doc.font(FB).fontSize(9).fillColor(C.navy).text(title, M, yy); yy += 15;
        const labelW = 110, valW = 78, barW = CW - labelW - valW - 10;
        const maxAbs = Math.max(1, items.reduce(function (a, it) { return Math.max(a, Math.abs(it.v || 0)); }, 0));
        const zero = M + labelW + (signed ? barW / 2 : 0);
        const half = signed ? barW / 2 : barW;
        if (signed) doc.moveTo(zero, yy - 2).lineTo(zero, yy + items.length * 14).lineWidth(0.6).strokeColor("#C9D3E0").stroke();
        items.forEach(function (it) {
          const v = num(it.v) || 0;
          const w = Math.max(1.5, Math.round(Math.abs(v) / maxAbs * half));
          doc.font(FR).fontSize(7.8).fillColor(C.muted).text(it.k, M, yy, { width: labelW, lineBreak: false, ellipsis: true });
          doc.rect(M + labelW, yy + 1, barW, 8).fill("#F7F9FC");
          if (v < 0) doc.rect(zero - w, yy + 1, w, 8).fill(C.red);
          else doc.rect(zero, yy + 1, w, 8).fill(it.color || "#2E5496");
          doc.font(FR).fontSize(7.8).fillColor(v < 0 ? C.red : C.ink)
            .text(money(v), M + labelW + barW + 10, yy, { width: valW, align: "right", lineBreak: false });
          yy += 14;
        });
        return yy + 10;
      }

      // ---------- 页头 ----------
      const logoPath = path.join(__dirname, "..", "web", "logo.png");
      if (fs.existsSync(logoPath)) { try { doc.image(logoPath, M, M - 4, { height: 40 }); } catch (e) {} }
      doc.font(FB).fontSize(17).fillColor(C.navy).text(pick("投资分析报告", "Investment Analysis Report"), M + 210, M - 2, { width: CW - 210, align: "right" });
      doc.font(FR).fontSize(8.5).fillColor(C.muted).text(pick("买入 · 持有 · 出租 · 卖出", "Buy · Hold · Rent · Sell"), M + 210, M + 22, { width: CW - 210, align: "right" });
      doc.font(FR).fontSize(8.5).fillColor(C.muted).text("kwongthye.com · Johor Bahru, Malaysia", M + 210, M + 34, { width: CW - 210, align: "right" });
      y = M + 58;
      hr(y, C.gold); y += 12;

      // 抬头信息（公司 + 客户）
      const coLine = [txt(co.name, 70), txt(co.person, 40) ? "· " + txt(co.person, 40) : "",
        txt(co.ren, 24) ? "· " + txt(co.ren, 24) : ""].filter(Boolean).join(" ");
      if (coLine) { doc.font(FB).fontSize(10).fillColor(C.navy).text(coLine, M, y); y += 14; }
      const coContact = [txt(co.phone, 32), txt(co.email, 48), txt(co.address, 90)].filter(Boolean).join(" · ");
      if (coContact) { doc.font(FR).fontSize(8).fillColor(C.muted).text(coContact, M, y, { width: CW }); y += 14; }

      const metaBits = [];
      if (txt(co.client, 40)) metaBits.push(T("client") + ": " + txt(co.client, 40));
      if (txt(co.project, 60)) metaBits.push(T("project") + ": " + txt(co.project, 60));
      metaBits.push(T("prepared") + ": " + dateStr(new Date()));
      doc.font(FR).fontSize(8).fillColor(C.muted).text(metaBits.join("    "), M, y, { width: CW });
      y += 20;

      // ---------- Part 1 ----------
      y = sectionTitle(T("p1"), y);
      y = row(T("spaP"), money(num(inp.spa)), y);
      y = row(T("actual"), money(num(inp.actual)), y);
      y = row(T("loan"), money(num(inp.loan)), y);
      y = row(T("rate") + " / " + T("tenure"), (num(inp.ratePct)).toFixed(2) + "%  ·  " + num(inp.yearsLoan, 30) + " " + T("years"), y);
      y = row(T("pmt"), money(num(p1.pmt)), y, { bold: true });

      y += 6;
      doc.font(FB).fontSize(9.5).fillColor(C.navy).text(T("acqTitle"), M, y); y += 16;
      y = row(T("spaFee"), money(num((p1.spa && p1.spa.total) || inp.spaFeeOverride)), y, { size: 9 });
      y = row(T("laFee"), money(num((p1.la && p1.la.total) || inp.laFeeOverride)), y, { size: 9 });
      y = row(T("val"), money(num(p1.valuation)), y, { size: 9 });
      y = row(T("agentFee"), money(num(inp.agentFee)), y, { size: 9 });
      y = row(T("consent"), money(num(inp.consentFee)), y, { size: 9 });
      y = row(T("other"), money(num(inp.other)), y, { size: 9 });
      y = row(T("acqTotal"), money(num(p1.purchaseCosts)), y, { bold: true });

      y = row(T("down"), money(num(p1.downpayment)), y);
      y = row(T("cashback"), money(-num(p1.cashback)), y, { valueColor: num(p1.cashback) > 0 ? C.red : C.ink });
      y += 2;
      y = boxed(T("upfront"), money(num(p1.initial)), y);

      // ---------- Part 2 ----------
      if (y > PAGE_H - 250) { doc.addPage(); y = M; }
      y = sectionTitle(T("p2"), y);
      const mgmtY = num(p2.mgmtY), fixedY = num(p2.fixedY), flatInt = num(p2.firstYearInterest);
      y = row(T("mgmt"), money(mgmtY), y);
      y = row(T("quit") + " + " + T("assess") + " + " + T("repair") + " + " + T("insur") + " + " + T("rentAgent"), money(fixedY), y);
      y = row(T("interest"), money(flatInt), y);
      y = boxed(T("annualCost"), money(mgmtY + fixedY + flatInt), y, "#EEF4F0");

      // ---------- Part 3 ----------
      if (y > PAGE_H - 210) { doc.addPage(); y = M; }
      y = sectionTitle(T("p3"), y);
      const holdYears = num(inp.holdYears, 1) || 1;
      const y0 = years[0] || {};
      y = row(T("rentY"), money(num(inp.rentY)), y);
      y = row(T("netY"), money(num(y0.netY)), y, { bold: true });
      y = row(T("annualReturn"), pct(num(out.holdingAnnual)), y);
      y = row(T("holdYears"), String(holdYears) + " " + T("years"), y);
      y = row(T("totalRentProfit"), money(num(out.totalRentalProfit)), y, { bold: true });

      // 逐年表
      if (years.length) {
        if (y > PAGE_H - 140 - years.length * 16) { doc.addPage(); y = M; }
        y = sectionTitle(T("p3a"), y);
        const cols = [0, 0.34, 0.56, 0.74, 0.89];
        const widths = [0.30, 0.18, 0.16, 0.13, 0.11];
        const heads = [T("thYear"), T("thBal"), T("thInt"), T("thNet"), T("thRpgt")];
        doc.rect(M, y, CW, 18).fill("#F8FAFD");
        heads.forEach(function (h, i) {
          doc.font(FB).fontSize(8).fillColor(C.navy).text(h,
            M + 6 + cols[i] * CW, y + 5,
            { width: widths[i] * CW - (i === 0 ? 0 : 4), align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true });
        });
        y += 18;
        years.forEach(function (yr) {
          doc.font(FR).fontSize(8).fillColor(C.ink).text(String(yr.y), M + 6, y + 3, { width: 30 });
          doc.text(money(num(yr.balance)), M + cols[1] * CW, y + 3, { width: 0.18 * CW, align: "right" });
          doc.text(money(num(yr.interestYear)), M + cols[2] * CW, y + 3, { width: 0.16 * CW, align: "right" });
          doc.text(money(num(yr.netY)), M + cols[3] * CW, y + 3, { width: 0.14 * CW, align: "right" });
          doc.text(Math.round(num(yr.rpgtPct) * 100) + "%", M + cols[4] * CW, y + 3, { width: 0.11 * CW, align: "right" });
          hr(y + 14, "#F4F1EA");
          y += 16;
        });
        y += 6;
      }

      // ---------- 卖出 ----------
      if (y > PAGE_H - 260) { doc.addPage(); y = M; }
      y = sectionTitle(T("p3b"), y);
      y = row(T("sellPrice"), money(num(inp.sellPrice)), y);
      y = row(T("grossGain"), money(num(out.grossProfit)), y);
      const rp = sale.rpgt || {};
      y = row(T("rpgt") + "  (" + Math.round(num(rp.rate) * 100) + "%)", money(num(rp.tax)), y, { valueColor: C.red });
      y = row(T("sellAgentFee"), money(num(sale.sellAgent)), y);
      y = row(T("sellLegalFee"), money(num(sale.sellLegal)), y);
      y = row(T("sellMisc"), money(num(sale.sellMisc)), y);
      y = row(T("sellCosts"), money(num(sale.sellCosts)), y, { bold: true });
      y += 2;
      y = row(T("sellingProfit"), money(num(out.sellingProfit)), y, { bold: true });
      y = row(T("sellingReturn"), pct(num(out.sellingReturn)), y);
      y = row(T("netInvProfit"), money(num(out.netInvestmentProfit)), y, { bold: true });
      y = row(T("totalRoi"), pct(num(out.totalROI)), y);
      y = row(T("totalCost"), money(num(out.totalCost)), y);
      y = row(T("rotc"), pct(num(out.returnOnTotalCost)), y);

      // ---------- 图表 ----------
      const ys = years;
      if (ys.length) {
        y = hbars(pick("持有期每年净现金流（租金 − 费用 − 利息）", "Annual net cash flow (rent − costs − interest)"),
          ys.map(function (r) { return { k: T("thYear") + " " + r.y, v: num(r.netY) }; }),
          y + 4, true);
      }
      const interestSum = ys.reduce(function (a, r) { return a + (num(r.interestYear) || 0); }, 0);
      y = hbars(pick("钱花在哪里", "Where the money goes"), [
        { k: pick("首付", "Down payment"), v: num(r.part1 && r.part1.downpayment), color: "#2E5496" },
        { k: pick("购置费用", "Acquisition costs"), v: num(r.part1 && r.part1.purchaseCosts), color: "#C6A15B" },
        { k: pick("持有期利息", "Interest over hold"), v: interestSum, color: "#7A8CA3" },
        { k: pick("出售费用（含 RPGT）", "Selling costs (incl. RPGT)"), v: num(r.sale && r.sale.sellCosts), color: "#B23B3B" }
      ], y);

      // 备注
      if (txt(p.note, 600)) {
        y += 6;
        if (y > PAGE_H - 110) { doc.addPage(); y = M; }
        doc.font(FB).fontSize(9).fillColor(C.navy).text(T("note"), M, y); y += 14;
        doc.font(FR).fontSize(8.5).fillColor(C.ink).text(txt(p.note, 600), M, y, { width: CW }); y += 26;
      }

      // ---------- 页脚（每页） ----------
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        // 页脚在底边距区域内绘制：临时把下边距设为 0，避免 pdfkit 自动翻页（否则会多出空白页）
        const keepBottom = doc.page.margins.bottom, keepTop = doc.page.margins.top;
        doc.page.margins.bottom = 0; doc.page.margins.top = 0;
        if (i > 0) {
          doc.font(FB).fontSize(8).fillColor(C.muted)
            .text(pick("投资分析报告", "Investment Analysis Report"), M, 26, { width: CW / 2, lineBreak: false });
          const meta = [txt(co.client, 40), txt(co.project, 60)].filter(Boolean).join(" · ");
          if (meta) doc.font(FR).fontSize(8).fillColor(C.muted)
            .text(meta, M + CW / 2, 26, { width: CW / 2, align: "right", lineBreak: false });
          hr(40, "#F0EDE6");
        }
        const fy = PAGE_H - 42;
        hr(fy - 8);
        doc.font(FR).fontSize(7.2).fillColor(C.muted)
          .text(txt(p.disclaimer || t("disclaimer"), 400), M, fy, { width: CW - 120, lineGap: 1, height: 34, ellipsis: true });
        doc.font(FR).fontSize(7.2).fillColor(C.muted)
          .text(T("page") + " " + (i + 1) + " " + (lang === "en" ? "/ " + range.count : T("pageOf") + " " + range.count + " " + T("pages")),
            M + CW - 110, fy, { width: 110, align: "right", lineBreak: false });
        doc.page.margins.top = keepTop; doc.page.margins.bottom = keepBottom;
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildReportPdf };
