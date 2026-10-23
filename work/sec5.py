from doc_lib import *

def build(doc):
    # ================= 8 =================
    h1(doc, "08", "计算引擎规格", "程序师不需要猜“先算哪一步”；这一章给出顺序、公式和伪代码。")

    h2(doc, "8.1", "计算顺序：10 步")
    rows = [
        ("1", "校验与归一", "日期、金额、单位、必填；把 null 标为 Unknown，不当 0", "输入"),
        ("2", "购买结算", "定金、尾款、贷款、费用、cashback → completion cash", "Purchase"),
        ("3", "贷款摊销", "drawdown、rate periods、installment、extra payment → schedule", "Loan"),
        ("4", "租金 schedule", "unit、tenancy、免租、递增、空置 → 月度有效租金", "Rental"),
        ("5", "持有成本", "月/季/年/一次性 → 月度等值与实际现金流", "Holding"),
        ("6", "出售结算", "售价、赎回、费用、RPGT、押金/预收 → net sale", "Sale"),
        ("7", "过账", "所有事件写入 Ledger（日期、方向、金额、账户）", "Ledger"),
        ("8", "三张报表", "现金流、P&L、资产负债表（按项目/月）", "Reports"),
        ("9", "指标", "ROI、CoC、Annualized、CAGR、XIRR、Yield、Break-even、DSCR", "KPIs"),
        ("10", "持有 1–5 年投影", "逐年：租金累计、等额本息余额、RPGT 分档、净利润", "Projection"),
    ]
    table(doc, ["#", "步骤", "做什么", "输出"], rows, [0.8, 3.2, 10.2, 2.8], font_size=8.2, align=['c','l','l','l'])

    callout(doc, "顺序不能反",
            "先算结算，再算贷款；先算贷款，再算现金流；先算现金流，再算 ROI/XIRR。很多 Excel 的错误，是因为先写了一个“净利润”公式，再倒过来凑现金流。",
            kind="info")

    h2(doc, "8.2", "购买结算：一张表解决定金/Cashback/费用")
    code_block(doc, """输入：
  price          = actual_purchase_price
  spa            = spa_price
  deposit        = booking_fee + deposit_paid        # 已付，且已包含在 price 内
  loan           = disbursed_amount
  rebate         = seller_rebate + other_adjustment  # 卖方回扣/折让
  costs_at_completion = 交割日应付的律师费/印花税/估值/其他
  costs_before   = 交割前已付的自有资金费用

交割现金流：
  completion_cash = loan + rebate
                  - (price - deposit)
                  - costs_at_completion

  if completion_cash < 0:   # 需要补现金
      initial_cash = deposit + costs_before + (-completion_cash)
      cashback     = 0
  else:                     # 贷款多出，拿到现金回流
      initial_cash = deposit + costs_before
      cashback     = completion_cash

校验：
  deposit 只在 initial_cash 出现一次，在 (price - deposit) 里扣一次
  cashback 不进 P&L，只进现金流/负债（未来赎回更高）""")

    para(doc, "用这个公式套 Case C：price 735,000、deposit 14,700、loan 765,000、costs 49,269.92、rebate 0。completion_cash = 765,000 − 720,300 − 49,269.92 = −4,569.92；initial_cash = 14,700 + 4,569.92 = 19,269.92。Excel 的 33,969.92 多算了 14,700。", size=9.6)

    h2(doc, "8.3", "贷款摊销：默认等额本息（和中国银行一样）")
    code_block(doc, """月供（默认等额本息 / monthly rest，与中国银行房贷一致）：
  r = annual_rate / 12
  n = tenure_years * 12
  pmt = P * r / (1 - (1 + r)^(-n))

每月：
  interest  = opening_balance * r
  principal = pmt - interest
  closing   = opening_balance - principal

利率变更（默认：年限不变，重算供款）：
  pmt_new = balance * r_new / (1 - (1 + r_new)^(-remaining_months))

利率变更（可选：供款不变，年限调整）：
  new_n = -ln(1 - balance * r_new / pmt) / ln(1 + r_new)
  remaining_months = ceil(new_n)

Daily rest：
  interest = balance * annual_rate / 365 * days_in_month
  principal = pmt - interest

Extra principal：
  closing = opening - principal - extra
  （extra 不减少当期利息，只减少未来利息）""")

    para(doc, "v1 默认 monthly rest 等额本息（月供不变、利息按剩余本金计，和中国银行一样）。马来西亚银行多为 daily rest，实际利息会有小额差异；系统保留 rest type 选项，并允许用银行实际供款/余额覆盖。", size=9.6)

    h2(doc, "8.4", "租金 schedule：从租约到月度有效租金")
    code_block(doc, """for each month m in holding period:
    for each unit u:
        if tenancy active in m:
            rent = contract_rent(u, m)           # 含递增
            rent -= free_rent(u, m)              # 免租期
        else:
            rent = 0                             # 空置
        effective_rent += rent * (1 - vacancy_rate)   # 预测时用；实际不用
    other_income = parking + signage + ...
    rental_income = effective_rent + other_income

押金：
    deposit_received = security_deposit + utility_deposit   # 负债
    deposit_refund   = -deposit_received at tenancy end

预收租金：
    advance_rent = 负债；交割时按未到期部分退还/转给买家""")

    h2(doc, "8.5", "出售结算与 RPGT")
    code_block(doc, """Net Sale Proceeds =
    sale_price
  - redemption_amount
  - selling_agent_commission * (1 + sst_rate)
  - selling_legal_fee
  - rpgt_retention
  - tenant_deposit_refund
  - advance_rent_refund
  + prorated_rent_receivable
  - outstanding_charges
  - penalty

RPGT：
  chargeable_gain = sale_price
                  - acquisition_price
                  - incidental_costs        # 律师、印花、agent
                  - enhancement_costs       # 装修改良
                  - allowable_expenses
  exemption = max(10,000, 10% * chargeable_gain)   # 个人；以税局为准
  tax = rpgt_rate(holding_years, entity) * max(0, chargeable_gain - exemption)
  retention = retention_rate * sale_price          # 3% / 7%
  refund = retention - tax""")

    callout(doc, "RPGT 是“估算”，不是“报税”",
            "税率、豁免、可扣除成本、持有期起算都有细则；系统只做估算与 retention 跟踪，最终以 LHDN/税务师为准。UI 上必须写“估算”，并提供“以实际税额覆盖”的入口。",
            kind="warn")

    h2(doc, "8.6", "回报：ROI、CAGR、XIRR、Break-even")
    code_block(doc, """Total ROI       = net_profit / total_project_cost
Cash-on-Cash    = net_profit / total_cash_invested
Simple Annual   = Total ROI * 365 / holding_days
CAGR            = (ending_equity / beginning_equity)^(365/holding_days) - 1

XIRR：解 r，使
  sum( CF_t / (1 + r)^(days_t / 365) ) = 0
  CF 为权益现金流：首付/费用/月供为负，租金/净售价为正

Break-even price：解 p，使
  net_sale_proceeds(p) + cumulative_rent - total_cash_invested = 0
  用二分法；p 的搜索区间 0 .. 3 * purchase_price

DSCR = NOI / annual_debt_service""")

    h2(doc, "8.7", "取整、日期、未知值")
    rows = [
        ("金额", "Decimal(18,2)；计算用 Decimal，不用 float；展示四舍五入到分", "RM 0.01"),
        ("印花税/律师费", "取整方式可配置（RM1/RM10/RM100）；报价单未说明", "以律师确认为准"),
        ("日期", "DATE，不带时区；统一 Asia/Kuala_Lumpur；月供按“同日”或“月末”规则", "28/29/30/31 日"),
        ("天数", "IRR 用实际天数/365；不按 30/360", "跨闰年"),
        ("未知值", "null 不是 0；KPI 状态 = complete / partial / unknown", "缺失即暂定"),
        ("汇率", "默认 MYR；多币种时存原币 + 汇率 + 日期", "SGD 项目"),
    ]
    table(doc, ["对象", "规则", "例子"], rows, [3.0, 9.6, 4.4], font_size=8.4)

    # ================= 9 =================
    h1(doc, "09", "持有 1–5 年预测", "年份选择器 1/2/3/4/5：逐年看租金累计、贷款余额、RPGT、净利润——中介两用的核心。")

    h2(doc, "9.1", "等额本息：和中国银行一样")
    code_block(doc, """默认等额本息（monthly rest）：
  r = annual_rate / 12
  pmt = P * r / (1 - (1 + r)^(-n))          # 月供固定

每月：
  interest  = opening_balance * r           # 利息 = 剩余本金 × 月利率
  principal = pmt - interest                # 本金 = 月供 - 利息
  closing   = opening_balance - principal   # 余额逐月递减

与中国银行房贷一致：月供不变、利息按剩余本金计。
马来西亚银行多为 daily rest，实际利息会有小额差异；
v1 默认 monthly rest（等额本息），daily rest 作后续可选。""")
    para(doc, "例：720,000、4.5%、30 年 → 月供 3,648.13。第 1 年还本 11,615.18、付息 32,162.38；第 5 年末余额 656,337.29。逐年明细见 9.2。", size=9.6)

    h2(doc, "9.2", "逐年投影表（例：720k / 4.5% / 30y / 租金 4,500 / 持有 500）")
    rows = [
        ("第 1 年", "708,384.82", "11,615.18", "32,162.38", "54,000", "43,777.56", "+4,222.44", "30%"),
        ("第 2 年", "696,236.04", "23,763.96", "63,791.16", "108,000", "87,555.12", "+8,444.88", "30%"),
        ("第 3 年", "683,529.15", "36,470.85", "94,861.83", "162,000", "131,332.68", "+12,667.32", "30%"),
        ("第 4 年", "670,238.50", "49,761.50", "125,348.74", "216,000", "175,110.24", "+16,889.76", "20%"),
        ("第 5 年", "656,337.29", "63,662.71", "155,225.09", "270,000", "218,887.80", "+21,112.20", "15%"),
    ]
    table(doc, ["年份", "年末余额", "累计还本", "累计付息", "累计租金", "累计供款", "累计净持有现金", "RPGT"],
          rows, [1.6, 3.0, 3.0, 3.0, 3.0, 3.2, 3.6, 1.6], font_size=7.8, align=['l','r','r','r','r','r','r','c'])
    caption(doc, "余额按等额本息公式四舍五入到分，与银行实际扣款可能差几分钱，以银行结算单为准。净持有现金 = 租金 − 持有费 − 供款。")

    h2(doc, "9.3", "RPGT 按持有年分档")
    code_block(doc, """个人（公民/PR，现行，以 LHDN 最新公布为准）：
  持有 ≤ 3 年   30%
  第 4 年       20%
  第 5 年       15%
  第 6 年及以上  0%

tax = rate(holding_years) * max(0, chargeable_gain - exemption)
exemption = max(10,000, 10% * chargeable_gain)   # 个人
retention = 3% * sale_price（买方律师代扣，交给 LHDN）
refund    = retention - tax""")

    h2(doc, "9.4", "两用：买入成本清单 vs 卖出利润")
    rows = [
        ("用途 1 · 给买家", "买入成本清单", "总买入成本 = 实价 + 全部购买费用（SPA/贷款律师费、印花税、SST、估值、agent、装修）；需要准备多少现金（首付 + 费用 − cashback）；月供多少", "签约前讲清楚“一共要花多少钱”"),
        ("用途 2 · 给卖家/中介", "卖出利润", "净收入 = 卖价 − 赎回 − 出售费用（agent 2–3% + 8% SST + 律师）− RPGT；净利润 = 净收入 + 累计净持有现金 − 总投入", "最短时间回答“这笔投资赚了多少”"),
    ]
    table(doc, ["用途", "页面", "内容", "回答"], rows, [3.4, 3.2, 8.8, 2.6], font_size=8.4)

    h2(doc, "9.5", "逐年净利润：一条公式")
    code_block(doc, """net_profit_y =
    sale_price_y                        # 卖价（可输入，或按年增长率预测）
  - balance_y                           # 第 y 年末贷款余额（等额本息摊销）
  - selling_cost_y                      # agent + SST + 律师 + 杂费
  - rpgt_y                              # 按持有年分档 30/20/15/0%
  + cumulative_rent_y                   # 累计租金（含空置/递增）
  - cumulative_holding_y                # 门牌税/地税/管理费/保险/维修
  - cumulative_instalment_y             # 月供 × 12y（本金部分已在 balance 里体现）
  - total_acquisition_cost              # 实价 + 购买费用（含已付定金/首付）

同一套引擎，年数 y 从 1 扫到 5，输出一张逐年表
+ 4 个 KPI（净利润 / ROI / XIRR / Break-even）。""")
    para(doc, "注意：net_profit_y 里“累计供款”与“balance_y 递减”不能重复扣本金——供款是现金流出，本金减少通过余额下降体现；利润只扣利息，现金流扣全额供款，两张表必须勾稽。", size=9.6)

    h2(doc, "9.6", "边界情况")
    for lead, body in [
        ("租金与空置", "预测用 occupancy/vacancy；实际用账单。免租期、递增按租约日期生效，不足整月按天分摊。"),
        ("利率变化", "9.2 的表假设利率不变；利率变了就按剩余年限重算月供（保持年限或保持供款二选一）。"),
        ("提前卖 vs 持有到期", "选“第 3 年卖”就用第 3 年余额 + 30% RPGT；选“第 5 年卖”用第 5 年余额 + 15%。年限选择器就是切换这两组数字。"),
        ("卖价不确定", "默认给 3 个假设：持平、+3%/年、−10%；或让用户直接填预期卖价。"),
        ("银行余额覆盖", "有真实结算单时，balance_y 用手填的赎回额覆盖；差异超阈值提示。"),
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(lead + "：")
        run_font(r, size=9.4, bold=True, color=NAVY)
        r = p.add_run(body)
        run_font(r, size=9.3)

    # ================= 10 =================
    h1(doc, "10", "情景、反向计算与持有能力", "从“算过去”到“算未来”：同一间房，不同假设，不同结论。")

    h2(doc, "10.1", "三套情景，一套引擎")
    rows = [
        ("Base", "当前租金、当前利率、3% 房价增长、5% 空置", "决策主场景"),
        ("Optimistic", "租金 +5%、房价 +5%、空置 2%、利率不变", "上行空间"),
        ("Conservative", "租金 −5%、房价 0%、空置 10%、利率 +1%", "压力测试"),
    ]
    table(doc, ["情景", "假设", "用途"], rows, [3.0, 9.4, 4.6], font_size=8.6)
    para(doc, "情景是覆盖层：同一套 Actual 账本，叠加不同的未来假设；不改历史，不复制 Deal。对比时只比较同一组指标（Net Profit、XIRR、Peak Cash、Break-even）。", size=9.6)

    h2(doc, "10.2", "月度投影：不要用简单乘数")
    code_block(doc, """for m in 1..holding_months:
    rent_m      = rent_0 * (1 + rental_growth)^(m/12) * (1 - vacancy)
    opex_m      = opex_0 * (1 + opex_growth)^(m/12)
    interest_m  = loan_balance(m) * rate(m)/12
    principal_m = pmt - interest_m
    cash_flow_m = rent_m - opex_m - pmt - tax_m - insurance_m - repair_m
    balance_m   = balance_{m-1} + interest_m - principal_m

sale_value = price_0 * (1 + capital_appreciation)^(holding_months/12)
net_sale   = sale_value - balance_N - selling_costs - rpgt""")

    h2(doc, "10.3", "反向计算：给定目标，最高买价是多少")
    para(doc, "不是“输入买价算回报”，而是“输入目标回报，解出最高买价”。用二分法：买价越高，回报越低；找到使 XIRR/ROI 等于目标值的价格。", size=9.8)
    code_block(doc, """target: XIRR >= 15% or Net Profit >= 200,000
solve p in [0, 3 * current_price]:
    build cash flows with purchase price = p
    compute XIRR / Net Profit
    if metric(p) >= target: low = p
    else: high = p
return low""")

    h2(doc, "10.4", "持有能力：最坏情况下要准备多少现金")
    rows = [
        ("空置 6 个月", "租金归零 6 个月", "reserve += 6 × (opex + instalment)"),
        ("利率 +2%", "月供上升", "reserve += Σ 12 个月的月供差"),
        ("维修 10,000", "一次性", "reserve += 10,000"),
        ("出售延迟 6 个月", "多付 6 个月供款", "reserve += 6 × instalment"),
    ]
    table(doc, ["压力", "假设", "现金影响"], rows, [4.0, 7.4, 5.6], font_size=8.6)
    para(doc, "Peak Cash Requirement = max(0, −min(cumulative cash flow)) + stress reserve + 用户设定的 buffer。这个数字应该和“Initial Cash Out”并列显示，因为很多人只准备了首付，没准备持有期补贴。", size=9.6)

    h2(doc, "10.5", "Deal Comparison：不只看 ROI")
    rows = [
        ("现金投入", "Initial Cash Out / Peak Cash", "越低越容易启动"),
        ("回报", "XIRR / Total ROI / CoC", "风险调整后比较"),
        ("现金流", "Monthly Net Cash Flow / DSCR", "能不能扛住持有期"),
        ("退出", "Break-even / 负资产概率", "最坏情况"),
        ("流动性", "出售周期 / 租约剩余", "能不能快速退出"),
        ("风险", "杠杆 / 集中度 / 单一租客", "组合层面"),
    ]
    table(doc, ["维度", "指标", "怎么用"], rows, [3.2, 7.4, 6.4], font_size=8.6)
