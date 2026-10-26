import test from 'node:test';
import assert from 'node:assert/strict';

import {
  affordability,
  balanceAfter,
  entryCost,
  instalment,
  loanLegalTotal,
  maxLoanForInstalment,
  maxPriceByCash,
  monthlyInstalmentForPrice,
  rentAffordability,
  rentUpfront,
  spaLegalTotal
} from '../lib/finance.js';

test('法定费用：SPA 1.6M 合计 76,630（与 PROJECT.md 第 6 节一致）', () => {
  const r = spaLegalTotal(1600000);
  assert.equal(r.legal, 17250);
  assert.equal(r.duty, 48000);
  assert.equal(r.misc, 10000);
  assert.equal(r.sst, 1380);
  assert.equal(r.total, 76630);
});

test('法定费用：贷款 765k 合计 18,767', () => {
  const r = loanLegalTotal(765000);
  assert.equal(r.legal, 8900);
  assert.equal(r.duty, 3825);
  assert.equal(r.misc, 5330);
  assert.equal(r.sst, 712);
  assert.equal(r.total, 18767);
});

test('等额本息：720k / 4.5% / 30 年第 60 个月余额 656,337.29（T21 回归）', () => {
  assert.equal(balanceAfter(720000, 4.5, 30, 60), 656337.29);
  assert.equal(instalment(720000, 4.5, 30), 3648.13);
});

test('等额本息：零利率与反推贷款额', () => {
  assert.equal(instalment(120000, 0, 10), 1000);
  assert.equal(balanceAfter(120000, 0, 10, 24), 96000);
  const loan = maxLoanForInstalment(3000, 4.3, 30);
  assert.ok(loan > 590000 && loan < 620000, `loan=${loan}`);
  assert.ok(Math.abs(instalment(loan, 4.3, 30) - 3000) < 2);
});

test('买入成本：1.6M 房价 + 765k 贷款 = 99,097（含估价费）', () => {
  const e = entryCost(1600000, 765000);
  assert.equal(e.total, 99097);
  assert.equal(e.valuation, 3700);
});

test('可负担性：收入 12k / 负债 1.2k / 65% DSR / 90% 贷款 ≈ 107.6 万', () => {
  const a = affordability({
    income: 12000,
    commitments: 1200,
    dsr: 65,
    rate: 4.3,
    years: 30,
    margin: 90,
    cash: 180000
  });
  assert.equal(a.maxInstalment, 6600);
  assert.equal(a.maxPrice, 1076000);
  assert.equal(a.maxPriceByCash, maxPriceByCash(180000, 90, 4.3, 30));
  assert.ok(a.maxPriceByLoan > a.maxPriceByCash);
});

test('可负担性：无收入返回 null；租房 30% 收入', () => {
  assert.equal(affordability({income: 0}), null);
  const rent = rentAffordability({income: 8000, ratio: 30});
  assert.equal(rent.maxRent, 2400);
});

test('租房一次性支出：2+1 押金 + 水电 + 印花税', () => {
  const up = rentUpfront(2000);
  assert.equal(up.deposit, 4000);
  assert.equal(up.advance, 2000);
  assert.equal(up.utility, 1000);
  assert.equal(up.total, 7106);
});

test('可负担性：现金未知与现金为 0 要区分', () => {
  const unknown = affordability({income: 10000, commitments: 0, cash: null});
  assert.equal(unknown.cash, null);
  assert.equal(unknown.maxPriceByCash, null);
  assert.ok(unknown.maxPrice > 1000000);
  const zero = affordability({income: 10000, commitments: 0, cash: 0});
  assert.equal(zero.cash, 0);
  assert.equal(zero.maxPrice, 0);
});

test('月供按房价 × 贷款成数计算', () => {
  const pmt = monthlyInstalmentForPrice(800000, 90, 4.3, 30);
  assert.ok(pmt > 3500 && pmt < 3700, `pmt=${pmt}`);
});
