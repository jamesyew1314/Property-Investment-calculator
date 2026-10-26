// finance.js — 马来西亚购房费用与贷款公式（与 web/calc/calc.js、PROJECT.md 第 6/7 节同口径）
// 金额单位 RM；利率、DSR、贷款成数用百分数（4.3 = 4.3%）。
// 这些数字用于「可负担性预判 / 买入成本估算」，不是银行批贷或正式估值。

const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const round0 = (x) => Math.round(Number(x));

export const SST_RATE = 0.08; // 2024-03-01 起 8%

const LEGAL_BANDS = [
  [500000, 0.0125],
  [7500000, 0.01],
  [Infinity, 0.01]
];
const DUTY_BANDS = [
  [100000, 0.01],
  [500000, 0.02],
  [1000000, 0.03],
  [Infinity, 0.04]
];

function tiered(amount, bands) {
  const value = Math.max(0, Number(amount) || 0);
  let total = 0;
  let lower = 0;
  for (const [cap, rate] of bands) {
    if (value <= lower) break;
    total += (Math.min(value, cap) - lower) * rate;
    lower = cap;
  }
  return total;
}

export const spaLegal = (price) => round2(tiered(price, LEGAL_BANDS));
export const spaDuty = (price) => round2(tiered(price, DUTY_BANDS));
export const spaMisc = (price) => round2(3600 + 0.004 * Math.max(0, Number(price) || 0));
export const sst = (amount) => round2(amount * SST_RATE);
export const loanLegal = (loan) => round2(tiered(loan, LEGAL_BANDS));
export const loanDuty = (loan) => round2(0.005 * Math.max(0, Number(loan) || 0));
export const loanMisc = (loan) => round2(3800 + 0.002 * Math.max(0, Number(loan) || 0));
export const valuationFee = (price) => round2(0.002 * Math.max(0, Number(price) || 0) + 500);

export function spaLegalTotal(price) {
  const legal = spaLegal(price);
  const duty = spaDuty(price);
  const misc = spaMisc(price);
  const tax = sst(legal);
  return {legal, duty, misc, sst: tax, total: round2(legal + duty + misc + tax)};
}

export function loanLegalTotal(loan) {
  const legal = loanLegal(loan);
  const duty = loanDuty(loan);
  const misc = loanMisc(loan);
  const tax = sst(legal);
  return {legal, duty, misc, sst: tax, total: round2(legal + duty + misc + tax)};
}

/** 买家买入成本估算（不含中介佣金；佣金通常由卖方支付） */
export function entryCost(price, loanAmount) {
  const p = Math.max(0, Number(price) || 0);
  const l = Math.max(0, Number(loanAmount) || 0);
  const spa = spaLegalTotal(p);
  const loan = loanLegalTotal(l);
  const valuation = valuationFee(p);
  return {
    price: round2(p),
    loanAmount: round2(l),
    spa,
    loan,
    valuation,
    total: round2(spa.total + loan.total + valuation)
  };
}

/** 等额本息月供 */
export function instalment(principal, annualRatePct, years) {
  const P = Math.max(0, Number(principal) || 0);
  const n = Math.max(0, Math.round((Number(years) || 0) * 12));
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (!P || !n) return 0;
  if (r === 0) return round2(P / n);
  const factor = (1 + r) ** n;
  return round2((P * r * factor) / (factor - 1));
}

/** 还了 months 期后的剩余本金（等额本息） */
export function balanceAfter(principal, annualRatePct, years, months) {
  const P = Math.max(0, Number(principal) || 0);
  const n = Math.max(0, Math.round((Number(years) || 0) * 12));
  const m = Math.max(0, Math.min(n, Math.round(Number(months) || 0)));
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (!P) return 0;
  const pmt = instalment(P, annualRatePct, years);
  if (r === 0) return round2(Math.max(0, P - pmt * m));
  const grown = (1 + r) ** m;
  return round2(Math.max(0, P * grown - pmt * ((grown - 1) / r)));
}

/** 给定月供上限，反推可贷金额 */
export function maxLoanForInstalment(monthly, annualRatePct, years) {
  const pmt = Math.max(0, Number(monthly) || 0);
  const n = Math.max(0, Math.round((Number(years) || 0) * 12));
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (!pmt || !n) return 0;
  if (r === 0) return round2(pmt * n);
  return round2((pmt * (1 - (1 + r) ** -n)) / r);
}

/** 假设贷款 = 房价 × margin%，月供是多少 */
export function monthlyInstalmentForPrice(price, marginPct, annualRatePct, years) {
  const loan = (Math.max(0, Number(price) || 0) * Math.max(0, Number(marginPct) || 0)) / 100;
  return instalment(loan, annualRatePct, years);
}

/** 现金约束下能买的最高房价：首付 + 买入费用 ≤ 可用现金 */
export function maxPriceByCash(cash, marginPct, annualRatePct, years) {
  const C = Math.max(0, Number(cash) || 0);
  const margin = Math.max(0, Math.min(100, Number(marginPct) || 0)) / 100;
  if (!C) return 0;
  if (margin >= 1) return 0; // 100% 贷款仍需付律师费，交给下面迭代
  let price = C / (1 - margin);
  for (let i = 0; i < 16; i++) {
    const loan = price * margin;
    const fees = entryCost(price, loan).total;
    const next = Math.max(0, (C - fees) / (1 - margin));
    if (Math.abs(next - price) < 1) {
      price = next;
      break;
    }
    price = next;
  }
  return Math.max(0, Math.floor(price / 1000) * 1000);
}

/**
 * 可负担房价（指示性）
 * income 月净收入；commitments 每月现有债务；dsr 债务偿还率 %；
 * rate 年利率 %；years 贷款年限；margin 贷款成数 %；cash 可用于首付+费用的现金
 */
export function affordability({income, commitments = 0, dsr = 65, rate = 4.3, years = 30, margin = 90, cash = null} = {}) {
  const inc = Math.max(0, Number(income) || 0);
  const com = Math.max(0, Number(commitments) || 0);
  const dsrPct = Math.max(1, Math.min(100, Number(dsr) || 65));
  const marginPct = Math.max(1, Math.min(100, Number(margin) || 90));
  const ratePct = Math.max(0, Number(rate) || 0);
  const term = Math.max(1, Math.min(50, Number(years) || 30));
  // cash = null / undefined 表示「未知」，此时不把现金当作 0；仅按贷款能力估算。
  const cashProvided = cash != null && cash !== '' && Number.isFinite(Number(cash));
  const cashNum = cashProvided ? Math.max(0, Number(cash)) : null;
  if (!inc) return null;

  const maxInstalment = round2(Math.max(0, inc * (dsrPct / 100) - com));
  const maxLoan = maxLoanForInstalment(maxInstalment, ratePct, term);
  const priceByLoan = round0((maxLoan * 100) / marginPct);
  const priceByCash = cashProvided ? maxPriceByCash(cashNum, marginPct, ratePct, term) : null;
  let maxPrice = priceByCash == null ? priceByLoan : Math.min(priceByLoan, priceByCash);
  maxPrice = Math.max(0, Math.floor(maxPrice / 1000) * 1000);
  maxPrice = Math.min(maxPrice, 50000000);

  return {
    income: round2(inc),
    commitments: round2(com),
    dsr: dsrPct,
    rate: ratePct,
    years: term,
    margin: marginPct,
    cash: cashNum == null ? null : round2(cashNum),
    maxInstalment,
    maxLoan,
    maxPriceByLoan: priceByLoan,
    maxPriceByCash: priceByCash,
    maxPrice
  };
}

/** 租房负担：月租占收入比例（默认 30%） */
export function rentAffordability({income, ratio = 30} = {}) {
  const inc = Math.max(0, Number(income) || 0);
  if (!inc) return null;
  const pct = Math.max(1, Math.min(100, Number(ratio) || 30));
  return {income: round2(inc), ratio: pct, maxRent: round2((inc * pct) / 100)};
}

/** 租房一次性支出（押金 2 + 1、水电押金 0.5、租约印花税约 0.4% 年租金 + RM10） */
export function rentUpfront(monthlyRent) {
  const rent = Math.max(0, Number(monthlyRent) || 0);
  const deposit = round2(rent * 2);
  const advance = round2(rent * 1);
  const utility = round2(rent * 0.5);
  const stamp = round2(rent * 12 * 0.004 + 10);
  return {deposit, advance, utility, stamp, total: round2(deposit + advance + utility + stamp)};
}

/** 每平方尺单价（RM psf） */
export function pricePerSqft(price, builtUp) {
  const p = Number(price) || 0;
  const s = Number(builtUp) || 0;
  if (!p || !s) return null;
  return round2(p / s);
}

export {round2, round0};
