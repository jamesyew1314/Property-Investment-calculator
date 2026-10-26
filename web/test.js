// test.js — calc.js 回归测试（10 项，与《公式验证与案例对账 v1.1》一致）
// 运行：node test.js
"use strict";
const C = require("./calc/calc.js");
let pass = 0, fail = 0;
function eq(got, expect, name) {
  const ok = got === expect;
  console.log((ok ? "PASS" : "FAIL") + "  " + name + "  got=" + got + "  expect=" + expect);
  ok ? pass++ : fail++;
}
function a(got, expect, name) {
  const ok = Math.abs(got - expect) < 0.011;
  console.log((ok ? "PASS" : "FAIL") + "  " + name + "  got=" + got + "  expect=" + expect);
  ok ? pass++ : fail++;
}
a(C.spaLegalTotal(1600000).legal, 17250, "T01 S&P 律师费 1.6M");
a(C.spaLegalTotal(1600000).duty, 48000, "T02 S&P 印花税 1.6M");
a(C.spaLegalTotal(1600000).sst, 1380, "S&P SST 8% (17,250×8%)");
a(C.spaMisc(100000), 4000, "杂费 100k = 4,000");
a(C.spaMisc(200000), 4400, "杂费 200k = 4,400");
a(C.spaMisc(300000), 4800, "杂费 300k = 4,800");
a(C.spaMisc(1600000), 10000, "杂费 1.6M = 10,000");
a(C.spaLegalTotal(1600000).total, 76630, "SPA 律师费合计 1.6M = 17,250+48,000+10,000+1,380");
a(C.loanLegalTotal(765000).legal, 8900, "T03 贷款律师费 765k");
a(C.loanLegalTotal(765000).duty, 3825, "T04 贷款印花税 765k");
a(C.loanMisc(100000), 4000, "贷款杂费 100k = 4,000");
a(C.loanMisc(200000), 4200, "贷款杂费 200k = 4,200");
a(C.loanMisc(300000), 4400, "贷款杂费 300k = 4,400");
a(C.loanLegalTotal(765000).misc, 5330, "贷款杂费 765k = 5,330");
a(C.loanLegalTotal(765000).total, 18767, "LA 合计 765k = 8,900+3,825+5,330+712");
a(C.valuationFee(1000000), 2500, "估价费 SPA 1M = 2,000 + 500");
a(C.valuationFee(1600000), 3700, "估价费 SPA 1.6M = 3,200 + 500");
a(C.instalment(720000, 0.045, 30), 3648.13, "T11 月供 720k/4.5%/30y");
a(C.balanceAt(720000, 0.045, 30, 60), 656337.29, "T21 等额本息第 60 个月余额");
a(C.initialOutlay(735000, 765000, 49269.92), 19269.92, "T05 Case C 初始现金");
a(C.initialOutlay(800000, 720000, 72422.24), 152422.24, "T07 Case B/D 初始现金");
a(C.rpgt(850000, 735000, 0, 0, 0, 0, 3).tax, 34500, "RPGT 第3年 30%（(850k−735k)×30%）");

// 老板口径例子：SPA 1M / 实价 800k / 贷 800k / 租金 60k/年 / 一年后卖 900k
const boss = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:60000, sellPrice:900000, holdYears:1});
a(boss.part1.initial, 65640, "老板例：自己出的现金（SPA 43,750 + LA 19,390 + 估价 2,500）");
a(boss.out.grossProfit, 34360, "老板例：净赚 = 900k − 865,640");
a(boss.out.quickAnnual, 0.5235, "老板例：年利润 ≈ 52.35%");
a(boss.sale.sellCosts, 22908, "出售总费用 = 中介 18,000 + RPGT 4,908");
a(boss.out.sellingProfit, 11452, "出售利润 = 资本收益 34,360 − 出售总费用 22,908");
a(boss.out.sellingReturn, 0.1745, "出售回报率 ≈ 17.45%");
a(boss.out.netInvestmentProfit, 35452, "投资净利润 = 24,000（总租金净利润）+ 11,452（出售利润）");
a(boss.out.totalROI, 0.5401, "总投资回报率 ≈ 54.01%");
a(boss.out.totalCost, 888548, "总成本 = 实价 800,000 + 购置 65,640 + 出售 22,908");
a(boss.out.returnOnTotalCost, 0.0399, "总成本回报率 ≈ 3.99%");

// 持有年限 0 / 非法值兜底（UI 会显示 —，compute 不崩、不放大）
const h0 = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:60000, sellPrice:900000, holdYears:0});
a(h0.years.length, 1, "持有 0 年 → 计算按 1 年兜底（不再 ×5）");
a(h0.out.totalRentalProfit, 24000, "持有 0 年 → 总年租金净利润按 1 年 = 24,000");

// 卖出中介费直接输入金额
const sa = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentFee:12000, sellLegalFee:0, sellMisc:0, rentY:60000, sellPrice:900000, holdYears:1});
a(sa.sale.sellAgent, 12000, "中介费直接填 12,000 → 用 12,000");
a(sa.sale.sellCosts, 18708, "出售总费用 = 12,000 + RPGT 6,708");
a(sa.out.sellingProfit, 15652, "出售利润 = 34,360 − 18,708");
a(sa.out.totalCost, 884348, "Total Cost = 购置 65,640 + 实价 800,000 + 出售 18,708");
a(boss.out.tcr, 0.0544, "完整口径总成本回报率 = 净利润 ÷ Total Cost");

// 分享链接 / 方案存档 编解码
const st = { v: 1, d: { spa: "1,000,000.00", actual: "800,000.00", 备注: "测试中文" }, o: { spaFee: true } };
const enc = C.encodeState(st);
const dec = C.decodeState(enc);
eq(dec.d.spa, "1,000,000.00", "分享链接 encode/decode 往返（金额）");
eq(dec.d["备注"], "测试中文", "分享链接 encode/decode 往返（中文）");
eq(dec.o.spaFee, true, "分享链接 encode/decode 往返（覆盖标记）");
eq(C.decodeState("%%%broken"), null, "非法分享参数返回 null");
eq(C.decodeState(""), null, "空分享参数返回 null");
a(boss.part2.firstYearMonthlyInterest, 3000, "平均月利息 = 800k×4.5%/12 = 3,000");
a(boss.out.holdingProfit, 24000, "老板例：持有年净利润 = 60,000 − 36,000（平均利息）");
a(boss.out.holdingAnnual, 0.3656, "老板例：持有年利润 ≈ 36.56%");

// 律师费/估价费手动覆盖
const ov = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:3, rentY:60000, sellPrice:900000, holdYears:1,
  spaFeeOverride: 50000, laFeeOverride: 20000, valFeeOverride: 3000});
a(ov.part1.initial, 73000, "手动覆盖：50,000+20,000+3,000 = 73,000");

// Total Acquisition Costs + 首付结构
const dn = C.compute({spa:1000000, actual:800000, loan:720000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:60000, sellPrice:900000, holdYears:1});
a(dn.part1.purchaseCosts, 64216, "总购置费用 = SPA 43,750 + LA(720k) 17,966 + 估价 2,500");
a(dn.part1.initial, 144216, "购房现金总额 = 64,216 + 首付 80,000");

// 出租中介费计入年度持有费用
const ra = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0, rentAgentY:3000,
  sellAgentPct:2, rentY:60000, sellPrice:900000, holdYears:1});
a(ra.part2.fixedY, 3000, "出租中介费 3,000 进年度费用");
a(ra.out.holdingProfit, 21000, "持有年净利润 = 60,000 − 36,000 利息 − 3,000 出租中介费");

// 总年租金净利润 = 年租金净利润 × 年数
const tp3 = C.compute({spa:1000000, actual:800000, loan:800000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:3, rentY:60000, sellPrice:900000, holdYears:3});
a(tp3.out.totalRentalProfit, 72000, "总年租金净利润 = 24,000 × 3 年");
// ---- v0.78：RPGT 按卖家身份 ----
a(C.rpgtRate(3, "citizen"), 0.30, "公民 3 年 = 30%");
a(C.rpgtRate(6, "citizen"), 0.00, "公民 6 年 = 0%");
a(C.rpgtRate(5, "foreigner"), 0.30, "外国人 5 年 = 30%");
a(C.rpgtRate(6, "foreigner"), 0.10, "外国人 6 年 = 10%");
a(C.rpgtRate(5, "company"), 0.15, "公司 5 年 = 15%");
a(C.rpgtRate(6, "company"), 0.10, "公司 6 年 = 10%");
a(C.rpgtRate(6, "unknown"), 0.00, "未知身份按公民处理");

const fr = C.compute({spa:1000000, actual:900000, loan:800000, ratePct:4.3, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:36000, sellPrice:1000000, holdYears:3, ownerType:"foreigner"});
a(fr.ownerType === "foreigner", true, "compute 回传 ownerType = foreigner");
a(fr.sale.rpgt.rate, 0.30, "外国人 3 年 RPGT 税率 30%");
a(fr.years[2].rpgtPct, 0.30, "逐年表第 3 年税率跟随身份");
const sameAsCitizen = C.compute({spa:1000000, actual:900000, loan:800000, ratePct:4.3, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:36000, sellPrice:1000000, holdYears:6, ownerType:"citizen"});
a(sameAsCitizen.sale.rpgt.rate, 0, "公民持有 6 年 RPGT = 0");

// ---- 费用分档明细自洽 ----
const det = C.compute({spa:1000000, actual:800000, loan:720000, ratePct:4.5, yearsLoan:30,
  agentFee:0, consentFee:0, other:0, mgmtM:0, quitY:0, assessY:0, repairY:0, insurY:0,
  sellAgentPct:2, rentY:60000, sellPrice:900000, holdYears:1});
a(det.part1.spa.legal + det.part1.spa.duty + det.part1.spa.misc + det.part1.spa.sst, det.part1.spa.total,
  "SPA 明细四项相加 = 合计");
a(det.part1.la.legal + det.part1.la.duty + det.part1.la.misc + det.part1.la.sst, det.part1.la.total,
  "LA 明细四项相加 = 合计");
a(det.part1.valDetail.fee + det.part1.valDetail.misc, det.part1.valDetail.total,
  "估价明细相加 = 合计");
a(det.part1.spa.legal, 11250, "SPA 律师费 1,000,000 → 11,250（500k×1.25% + 500k×1%）");
a(det.part1.spa.duty, 24000, "MOT 印花税 1,000,000 → 24,000（1k+8k+15k）");

console.log("\n" + pass + " pass, " + fail + " fail");
process.exit(fail === 0 ? 0 : 1);
