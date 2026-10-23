"""Property investment calculation engine - validation prototype.
All money in RM, rounded to 2 decimals at presentation only.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

# ---------- statutory fee engine (Malaysia, individual, per quotation) ----------

def tiered(amount: float, bands: list[tuple[float, float]]) -> float:
    """bands: list of (upper_limit, rate). Last upper can be inf."""
    total = 0.0
    lower = 0.0
    for upper, rate in bands:
        if amount <= lower:
            break
        taxable = min(amount, upper) - lower
        total += taxable * rate
        lower = upper
    return total

def spa_legal_fee(price: float) -> float:
    # SRO scale per SPA Quotation: 1.25% first 500k; 1% next 7m; 1% above 7.5m
    return tiered(price, [(500_000, 0.0125), (7_500_000, 0.01), (float('inf'), 0.01)])

def spa_stamp_duty(price: float) -> float:
    # 1% first 100k; 2% next 400k; 3% next 500k; 4% above 1m
    return tiered(price, [(100_000, 0.01), (500_000, 0.02), (1_000_000, 0.03), (float('inf'), 0.04)])

def spa_misc(price: float) -> float:
    # 律所杂费（10/19 老板规则）：100k→4,000，每多 100k +400（= 3,600 + 0.4%）
    return 3_600 + 0.004 * price

def loan_legal_fee(loan: float) -> float:
    return tiered(loan, [(500_000, 0.0125), (7_500_000, 0.01), (float('inf'), 0.01)])

def loan_stamp_duty(loan: float) -> float:
    return 0.005 * loan

def loan_misc(loan: float) -> float:
    # 贷款律师费杂费（10/19 老板规则）：100k→4,000，每多 100k +200（= 3,800 + 0.2%）
    return 3_800 + 0.002 * loan

def valuation_fee(price: float) -> float:
    # 估价费（10/19 老板规则）：SPA × 0.2% + 500 杂费
    return 0.002 * price + 500

def sst(amount: float, rate: float = 0.08) -> float:
    # service tax: 8% since 2024-03-01 (was 6%); applies to legal fee & agent commission
    return amount * rate

# ---------- loan amortisation ----------

@dataclass
class Loan:
    principal: float
    annual_rate: float
    years: int
    start: date
    disbursed: float | None = None  # if different from principal

    def monthly_payment(self) -> float:
        r = self.annual_rate / 12
        n = self.years * 12
        if r == 0:
            return self.principal / n
        return self.principal * r / (1 - (1 + r) ** -n)

    def schedule(self) -> list[dict]:
        r = self.annual_rate / 12
        pay = self.monthly_payment()
        bal = self.principal
        rows = []
        for m in range(1, self.years * 12 + 1):
            interest = bal * r
            principal = pay - interest
            if principal > bal:
                principal = bal
                pay = principal + interest
            bal -= principal
            rows.append(dict(month=m, payment=pay, interest=interest,
                             principal=principal, balance=max(bal, 0)))
            if bal <= 0.005:
                break
        return rows

    def balance_after(self, months: int) -> float:
        return self.schedule()[months - 1]["balance"]

    def interest_paid(self, months: int) -> float:
        return sum(x["interest"] for x in self.schedule()[:months])

    def principal_paid(self, months: int) -> float:
        return sum(x["principal"] for x in self.schedule()[:months])

# ---------- holding projection (v1.1: 1–5 years, annuity / 等额本息) ----------

def rpgt_rate(years: float) -> float:
    """Individual RPGT tier by holding years (current regime; LHDN prevails)."""
    if years <= 3: return 0.30
    if years <= 4: return 0.20
    if years <= 5: return 0.15
    return 0.00

def project_holding(principal: float, annual_rate: float, years_loan: int,
                    monthly_rent: float, monthly_holding: float,
                    years: int = 5) -> list[dict]:
    """Year-end projection for years 1..years (annuity instalment, monthly rest).

    Matches doc 9.2: 720k / 4.5% / 30y / rent 4500 / holding 500
    -> y5 balance 656337.29 (T21); y1 balance 708384.82.
    """
    r = annual_rate / 12
    n = years_loan * 12
    if r == 0:
        pmt = principal / n
    else:
        pmt = round(principal * r / (1 - (1 + r) ** -n), 2)

    def balance_after(m: int) -> float:
        if r == 0:
            return principal - pmt * m
        f = (1 + r) ** m
        return principal * f - pmt * (f - 1) / r

    rows = []
    for y in range(1, years + 1):
        m = 12 * y
        principal_cum = principal - balance_after(m)
        rows.append(dict(
            year=y,
            balance=round(balance_after(m), 2),
            principal_cum=round(principal_cum, 2),
            interest_cum=round(m * pmt - principal_cum, 2),
            rent_cum=round(monthly_rent * 12 * y, 2),
            instalment_cum=round(pmt * 12 * y, 2),
            holding_cum=round(monthly_holding * 12 * y, 2),
            net_holding_cash=round((monthly_rent - monthly_holding) * 12 * y - pmt * 12 * y, 2),
            rpgt=rpgt_rate(y),
        ))
    return rows

# ---------- XIRR ----------

def xnpv(rate: float, flows: list[tuple[date, float]]) -> float:
    d0 = min(d for d, _ in flows)
    return sum(cf / (1 + rate) ** ((d - d0).days / 365.0) for d, cf in flows)

def xirr(flows: list[tuple[date, float]], lo: float = -0.9999, hi: float = 10.0) -> float | None:
    f_lo, f_hi = xnpv(lo, flows), xnpv(hi, flows)
    if f_lo * f_hi > 0:
        return None
    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = xnpv(mid, flows)
        if abs(f_mid) < 1e-7:
            return mid
        if f_lo * f_mid <= 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2

# ---------- case models ----------

def case_b():
    """Profit Calculator (L.T) - 25 months, 800k actual, 900k SPA, 720k loan."""
    price = 800_000
    spa = 900_000
    loan = 720_000
    deposit = 16_000
    costs = 10_735.68 + 27_446.56 + 0 + 19_240 + 15_000
    total_invest = price + costs
    cash_initial = deposit + costs + (price - loan - deposit)
    installments = 4_000 * 25
    rents = 4_8000 + 4_400 + 19_800 if False else 48_000 + 4_400 + 19_800
    redemption = 696_562.27
    sale = 910_000
    sell_costs = 1_998 + 3_545.45 + 19_656
    net_cash = rents + sale - installments - sell_costs - redemption - cash_initial
    return dict(name="Case B - L.T", price=price, spa=spa, loan=loan, costs=costs,
                total_invest=total_invest, cash_initial=cash_initial,
                installments=installments, rents=rents, redemption=redemption,
                sale=sale, sell_costs=sell_costs, net_cash=net_cash)

def case_c():
    """Final Formula w Loan Cashback - 13 months, 735k actual, 900k SPA, 765k loan."""
    price = 735_000
    spa = 900_000
    loan = 765_000
    deposit = 14_700
    costs = 29_722 + 9_556.92 + 2_200 + 7_791
    cashback = price - loan  # negative = cash to buyer
    cash_initial = deposit + costs - (loan - price)
    installments = 3_876.14 * 13
    rents = 1_900 * 13
    redemption = 757_000
    sale = 850_000
    sell_costs = 0
    net_cash = rents + sale - installments - sell_costs - redemption - cash_initial
    return dict(name="Case C - Cashback", price=price, spa=spa, loan=loan, costs=costs,
                total_invest=price + costs, cash_initial=cash_initial,
                cashback=loan - price, installments=installments, rents=rents,
                redemption=redemption, sale=sale, sell_costs=sell_costs, net_cash=net_cash)

def case_d():
    """Final Formula w Loan Downpay - 23 months, 800k actual, 900k SPA, 720k loan."""
    price = 800_000
    spa = 900_000
    loan = 720_000
    deposit = 16_000
    costs = 10_735.68 + 27_446.56 + 0 + 19_240 + 15_000
    cash_initial_excel = deposit + costs + (price - loan)          # bug: deposit counted twice
    cash_initial_fixed = deposit + costs + (price - loan - deposit) # correct
    installments = 4_000 * 23
    rents = 42_000 + 4_400 + 16_500
    redemption = 691_970
    sale = 910_000
    net_cash = rents + sale - installments - redemption - cash_initial_fixed
    return dict(name="Case D - Downpay", price=price, spa=spa, loan=loan, costs=costs,
                total_invest=price + costs, cash_initial_excel=cash_initial_excel,
                cash_initial=cash_initial_fixed, installments=installments, rents=rents,
                redemption=redemption, sale=sale, net_cash=net_cash)

def case_a():
    price = 1_250_000
    spa = 1_600_000
    loan = 1_280_000
    deposit = 100_000
    costs = 72_834 + 25_483.58 + 30_000 + 3_250 + 13_250 + 78 + 8_000
    total_invest = price + costs
    cash_out = 119_895.58
    rents = 14_850
    redemption = 1_296_950
    sale = 1_620_000
    sell_costs = 34_992 + 5_000 + 1_677.21
    retention = 48_600
    tenant_deposit = 12_300
    rental_advance = 2_865.87
    cash_return = sale - redemption - sell_costs - retention - tenant_deposit - rental_advance
    gross_profit = sale - total_invest - sell_costs - rental_advance
    net_return = gross_profit + rents
    return dict(name="Case A - Austin Perdana", price=price, spa=spa, loan=loan,
                costs=costs, total_invest=total_invest, cash_out=cash_out,
                rents=rents, redemption=redemption, sale=sale, sell_costs=sell_costs,
                retention=retention, tenant_deposit=tenant_deposit,
                rental_advance=rental_advance, cash_return=cash_return,
                gross_profit=gross_profit, net_return=net_return)

if __name__ == "__main__":
    import json
    out = {}
    for fn in (case_a, case_b, case_c, case_d):
        c = fn()
        c["roi_cash"] = c.get("net_return", c.get("net_cash", 0)) / (c.get("cash_out") or c.get("cash_initial"))
        out[c["name"]] = c
    print(json.dumps(out, indent=2, default=str))
    proj = project_holding(720_000, 0.045, 30, 4500, 500)
    print("projection y5:", json.dumps(proj[-1], default=str))
