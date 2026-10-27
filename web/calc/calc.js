// calc.js — 房地产投资快速计算器 · 核心公式（马来西亚 · 个人 · v0.1）
// 金额一律在显示时四舍五入到分；内部用 float 计算、R() 归整。
// 口径与《投资系统_公式验证与案例对账_v1.1》一致：
//   - 定金只算一次；cashback = max(0, loan − actual_price)
//   - 贷款唯一真相：等额本息（月供固定，利息 = 剩余本金 × 年利率/12）
//   - SST = 8%（2024-03-01 起）；RPGT 按持有年 30/20/15/0
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var R = function (x) { return Math.round((x + Number.EPSILON) * 100) / 100; };

  // ---- 法定费用（马来西亚，个人） ----
  var LEGAL_BANDS = [[500000, 0.0125], [7500000, 0.01], [Infinity, 0.01]];
  var DUTY_BANDS  = [[100000, 0.01], [500000, 0.02], [1000000, 0.03], [Infinity, 0.04]];
  var SST = 0.08;

  function tiered(amount, bands) {
    var total = 0, lower = 0;
    for (var i = 0; i < bands.length; i++) {
      if (amount <= lower) break;
      var taxable = Math.min(amount, bands[i][0]) - lower;
      total += taxable * bands[i][1];
      lower = bands[i][0];
    }
    return total;
  }

  function spaLegal(price) { return R(tiered(price, LEGAL_BANDS)); }
  function spaDuty(price) { return R(tiered(price, DUTY_BANDS)); }
  // 律所杂费（老板 10/19 规则）：100k→4,000，每多 100k +400（= 3,600 + 0.4%×价格）
  function spaMisc(price) { return R(3600 + 0.004 * price); }
  function loanLegal(loan) { return R(tiered(loan, LEGAL_BANDS)); }
  function loanDuty(loan) { return R(0.005 * loan); }
  // 贷款律师费杂费（老板 10/19 规则）：100k→4,000，每多 100k +200（= 3,800 + 0.2%×贷款）
  function loanMisc(loan) { return R(3800 + 0.002 * loan); }
  // 估价费（老板 10/19 规则）：SPA × 0.2% + 500 杂费
  function valuationFee(price) { return R(0.002 * price + 500); }
  function sst(amount) { return R(amount * SST); }

  // SPA 律师费合计 = 律师费 + 印花税 + 杂费 + 8%×律师费
  function spaLegalTotal(price) {
    var l = spaLegal(price), d = spaDuty(price), m = spaMisc(price);
    return { legal: l, duty: d, misc: m, sst: sst(l), total: R(l + d + m + sst(l)) };
  }
  // Loan Agreement 律师费合计 = 律师费 + 贷款印花税 0.5% + 杂费 + 8%×律师费
  function loanLegalTotal(loan) {
    var l = loanLegal(loan), d = loanDuty(loan), m = loanMisc(loan);
    return { legal: l, duty: d, misc: m, sst: sst(l), total: R(l + d + m + sst(l)) };
  }
  // 卖出律师费（卖方承担；不含产权转移印花税，那是买方的 MOT）
  function sellLegalTotal(price) {
    var l = spaLegal(price);
    return { legal: l, sst: sst(l), total: R(l + sst(l)) };
  }

  // ---- 等额本息（和中国银行一样） ----
  function instalment(principal, annualRate, years) {
    var r = annualRate / 12, n = years * 12;
    if (r === 0) return R(principal / n);
    return R(principal * r / (1 - Math.pow(1 + r, -n)));
  }
  function balanceAt(principal, annualRate, years, months) {
    var r = annualRate / 12;
    if (r === 0) return R(principal - instalment(principal, annualRate, years) * months);
    var pmt = instalment(principal, annualRate, years);
    var f = Math.pow(1 + r, months);
    return R(principal * f - pmt * (f - 1) / r);
  }
  function yearAmort(principal, annualRate, years, y) {
    var r = annualRate / 12;
    var pmt = instalment(principal, annualRate, years);
    var m0 = 12 * (y - 1), m1 = 12 * y, interest = 0;
    for (var m = m0 + 1; m <= m1; m++) {
      interest += balanceAt(principal, annualRate, years, m - 1) * r;
    }
    return {
      pmt: pmt,
      interestYear: R(interest),
      principalYear: R(pmt * 12 - interest),
      balanceEnd: balanceAt(principal, annualRate, years, m1)
    };
  }

  // ---- RPGT（估算；以 LHDN 为准）----
  // citizen = 公民/永久居民：≤3y 30% / 4y 20% / 5y 15% / ≥6y 0%
  // foreigner = 外国人：≤5y 30% / ≥6y 10%
  // company = 公司：≤3y 30% / 4y 20% / 5y 15% / ≥6y 10%
  var OWNER_TYPES = ["citizen", "foreigner", "company"];
  function rpgtRate(years, ownerType) {
    var k = OWNER_TYPES.indexOf(ownerType) >= 0 ? ownerType : "citizen";
    if (k === "foreigner") return years <= 5 ? 0.30 : 0.10;
    if (k === "company") {
      if (years <= 3) return 0.30;
      if (years <= 4) return 0.20;
      if (years <= 5) return 0.15;
      return 0.10;
    }
    if (years <= 3) return 0.30;
    if (years <= 4) return 0.20;
    if (years <= 5) return 0.15;
    return 0.00;
  }
  // RPGT（老板口径）：(卖价 − 实价 − 总购置费用 − 卖出中介费 − 卖出律师费 − 售出杂费) × 年限税率
  // 3 年内 30% · 第 4 年 20% · 第 5 年 15% · 第 6 年起 0%
  function rpgt(sellPrice, actualPrice, acqTotal, sellAgent, sellLegal, sellMisc, holdYears, ownerType) {
    var gain = R(sellPrice - actualPrice - (acqTotal || 0) - (sellAgent || 0) - (sellLegal || 0) - (sellMisc || 0));
    var rate = rpgtRate(holdYears, ownerType);
    return {
      gain: gain,
      taxable: Math.max(0, gain),
      rate: rate,
      tax: R(Math.max(0, gain) * rate),
      ownerType: OWNER_TYPES.indexOf(ownerType) >= 0 ? ownerType : "citizen"
    };
  }

  // ---- Part 1：第一次要出的费用 ----
  function initialOutlay(actualPrice, loan, purchaseCosts) {
    var cashback = Math.max(0, loan - actualPrice);
    return R(purchaseCosts + Math.max(0, actualPrice - loan) - cashback);
  }

  // ---- XIRR（bisection，年化） ----
  function xnpv(rate, flows) {
    var v = 0;
    for (var i = 0; i < flows.length; i++) v += flows[i].cf / Math.pow(1 + rate, flows[i].t);
    return v;
  }
  function xirr(flows) {
    var lo = -0.9999, hi = 10.0;
    var fLo = xnpv(lo, flows), fHi = xnpv(hi, flows);
    if (fLo * fHi > 0) return null;
    for (var i = 0; i < 300; i++) {
      var mid = (lo + hi) / 2, fMid = xnpv(mid, flows);
      if (Math.abs(fMid) < 1e-7) return mid;
      if (fLo * fMid <= 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  // ---- 分享链接 / 方案存档 编解码 ----
  function encodeState(obj) {
    try {
      var json = JSON.stringify(obj);
      var b64 = (typeof btoa === "function")
        ? btoa(unescape(encodeURIComponent(json)))
        : Buffer.from(json, "utf8").toString("base64");
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) { return ""; }
  }
  function decodeState(str) {
    try {
      if (!str) return null;
      var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      var json = (typeof atob === "function")
        ? decodeURIComponent(escape(atob(s)))
        : Buffer.from(s, "base64").toString("utf8");
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  // ---- 主计算 ----
  function compute(inp) {
    var yearsLoan = Math.max(1, Math.min(50, Math.round(inp.yearsLoan || 30)));
    var rate = (inp.ratePct || 0) / 100;
    var holdY = Math.max(1, Math.min(50, Math.round(inp.holdYears || 1)));   // 0/负数按 1 年兜底，防算出怪数字
    var ownerType = OWNER_TYPES.indexOf(inp.ownerType) >= 0 ? inp.ownerType : "citizen";

    // Part 1
    var spa = spaLegalTotal(inp.spa);
    var la = loanLegalTotal(inp.loan);
    var valuation = valuationFee(inp.spa);
    // 手动覆盖（老板可改律师费/估价费；不覆盖用自动值）
    var spaCost = (inp.spaFeeOverride != null) ? R(inp.spaFeeOverride) : spa.total;
    var laCost = (inp.laFeeOverride != null) ? R(inp.laFeeOverride) : la.total;
    var valCost = (inp.valFeeOverride != null) ? R(inp.valFeeOverride) : valuation;
    var purchaseCosts = R(spaCost + laCost + valCost + (inp.agentFee || 0) + (inp.consentFee || 0) + (inp.other || 0));
    var initial = initialOutlay(inp.actual, inp.loan, purchaseCosts);
    var downpayment = Math.max(0, inp.actual - inp.loan);
    var cashback = Math.max(0, inp.loan - inp.actual);
    var pmt = instalment(inp.loan, rate, yearsLoan);

    // Part 2 / 3 逐年
    var mgmtY = (inp.mgmtM || 0) * 12;
    var fixedY = R((inp.quitY || 0) + (inp.assessY || 0) + (inp.repairY || 0) + (inp.insurY || 0) + (inp.rentAgentY || 0));
    var rentY = inp.rentY || 0;
    // 利息口径：等额本息摊还表的真实利息（第 1 年最高，逐年递减）
    // 这样「月供 = 利息 + 本金」「年末余额 = 年初余额 − 本金」永远对得上
    var flatYear = R(inp.loan * rate);   // 仅作参考（贷款 × 年利率）
    var years = [];
    var cumInst = 0, cumNetHold = 0, cumInterest = 0;
    for (var y = 1; y <= holdY; y++) {
      var am = yearAmort(inp.loan, rate, yearsLoan, y);
      cumInst += am.pmt * 12;
      cumInterest += am.interestYear;
      var costY = R(mgmtY + fixedY + am.interestYear);
      var netY = R(rentY - costY);
      cumNetHold += netY;
      years.push({
        y: y,
        balance: am.balanceEnd,
        principalYear: am.principalYear,
        principalCum: R(inp.loan - am.balanceEnd),
        interestYear: am.interestYear,
        interestCum: R(cumInterest),
        costY: costY,
        netY: netY,
        rentCum: R(rentY * y),
        instalmentCum: R(cumInst),
        netHoldCum: R(cumNetHold),
        rpgtPct: rpgtRate(y, ownerType)
      });
    }

    // 卖出
    // 卖出中介费：优先用直接输入的金额；否则按 % 算；默认 2%
    var sellAgent = (inp.sellAgentFee != null) ? R(inp.sellAgentFee)
      : R(inp.sellPrice * ((inp.sellAgentPct != null) ? inp.sellAgentPct : 2) / 100);
    var sellAgentSST = 0;
    var sellLegalFee = R(inp.sellLegalFee || 0);              // 卖出律师费（手填，含印花税/杂费/SST）
    var sellMiscFee = R(inp.sellMisc || 0);                   // 售出杂费（手填）
    var balance = yearAmort(inp.loan, rate, yearsLoan, holdY).balanceEnd;
    var r = rpgt(inp.sellPrice, inp.actual, purchaseCosts, sellAgent, sellLegalFee, sellMiscFee, holdY, ownerType);
    var sellCosts = R(sellAgent + sellLegalFee + sellMiscFee + r.tax);   // Total Selling Costs
    var netSale = R(inp.sellPrice - balance - sellCosts);

    var totalProfit = R(netSale + cumNetHold - initial);
    var totalInvested = R(inp.actual + purchaseCosts);
    var coc = initial > 0 ? totalProfit / initial : 0;          // 现金回报率（完整口径）
    var tcr = 0; // 见下方 Total Cost 定义后再算
    var simpleAnnual = holdY > 0 ? coc / holdY : 0;

    // 快速口径（老板口径）：净赚 = 卖价 − 买进总费用；年利润 = 净赚 ÷ 自己现金 ÷ 年数
    var gross = R(inp.sellPrice - inp.actual - purchaseCosts);
    var quickAnnual = initial > 0 ? gross / initial / holdY : 0;

    // 持续持有（不出售）：第 1 年净利润 = 租金 − 年度费用（含利息）；年利润 = ÷ 自己现金
    var holdingProfit = years[0].netY;
    var holdingAnnual = initial > 0 ? holdingProfit / initial : 0;

    // 投资净利润 = 总年租金净利润 + 出售利润；总成本 = 实价 + 购置费用 + 出售费用
    var netInvProfit = R(holdingProfit * holdY + (gross - sellCosts));
    var totalCostAll = R(inp.actual + purchaseCosts + sellCosts);
    tcr = totalCostAll > 0 ? totalProfit / totalCostAll : 0;   // 总成本回报率（完整口径 ÷ Total Cost）

    // XIRR：0 = 初始投入；每月 +租金/12 − 管理费/月 − 月供；每年末 −固定年费；最后一个月 + 净售价
    var flows = [{ t: 0, cf: -initial }];
    var rentM = rentY / 12;
    for (var m = 1; m <= holdY * 12; m++) {
      var cf = rentM - (inp.mgmtM || 0) - pmt;
      if (m % 12 === 0) cf -= fixedY;
      if (m === holdY * 12) cf += netSale;
      flows.push({ t: m / 12, cf: R(cf) });
    }
    var irr = xirr(flows);

    return {
      ownerType: ownerType,
      part1: {
        spa: spa, la: la, valuation: valuation,
        valDetail: { fee: R(0.002 * inp.spa), misc: 500, total: valuation },
        purchaseCosts: purchaseCosts,
        downpayment: downpayment,
        cashback: cashback,
        initial: initial,
        pmt: pmt
      },
      part2: {
        mgmtY: R(mgmtY), fixedY: fixedY,
        firstYearInterest: years[0].interestYear,
        firstYearMonthlyInterest: R(years[0].interestYear / 12),
        totalInterest: R(cumInterest),
        flatYear: flatYear
      },
      years: years,
      sale: {
        sellAgent: sellAgent, sellAgentSST: sellAgentSST,
        sellLegal: sellLegalFee, sellMisc: sellMiscFee, balance: balance,
        rpgt: r, sellCosts: sellCosts, netSale: netSale
      },
      out: {
        grossProfit: gross,
        quickAnnual: quickAnnual,
        sellingProfit: R(gross - sellCosts),
        sellingReturn: initial > 0 ? (gross - sellCosts) / initial / holdY : 0,
        netInvestmentProfit: netInvProfit,
        totalROI: initial > 0 ? netInvProfit / initial / holdY : 0,
        totalCost: totalCostAll,
        returnOnTotalCost: totalCostAll > 0 ? netInvProfit / totalCostAll / holdY : 0,
        holdingProfit: holdingProfit,
        holdingAnnual: holdingAnnual,
        totalRentalProfit: R(holdingProfit * holdY),
        totalProfit: totalProfit,
        totalInvested: totalInvested,
        coc: coc,
        tcr: tcr,
        simpleAnnual: simpleAnnual,
        xirr: irr
      }
    };
  }

  return {
    R: R, tiered: tiered,
    spaLegal: spaLegal, spaDuty: spaDuty, spaMisc: spaMisc,
    loanLegal: loanLegal, loanDuty: loanDuty, loanMisc: loanMisc,
    valuationFee: valuationFee,
    sst: sst, spaLegalTotal: spaLegalTotal, loanLegalTotal: loanLegalTotal, sellLegalTotal: sellLegalTotal,
    encodeState: encodeState, decodeState: decodeState,
    spaLegalTotal: spaLegalTotal, loanLegalTotal: loanLegalTotal, sellLegalTotal: sellLegalTotal,
    valuationFee: valuationFee, ownerTypes: OWNER_TYPES,
    instalment: instalment, balanceAt: balanceAt, yearAmort: yearAmort,
    rpgtRate: rpgtRate, rpgt: rpgt,
    initialOutlay: initialOutlay,
    xnpv: xnpv, xirr: xirr,
    compute: compute
  };
});
