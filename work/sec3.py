from doc_lib import *

W = [4.4, 2.2, 1.3, 9.3]

def part(doc, num, title, lead, fields, rules, accept):
    h2(doc, f"4.{num}", f"Part {num} — {title}")
    para(doc, lead, size=9.8)
    h3(doc, "建议字段")
    table(doc, ["字段", "类型 / 单位", "必填", "说明"], fields, W, font_size=7.9,
          align=['l','l','c','l'])
    h3(doc, "规则与边界")
    for lead2, body in rules:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(lead2 + "：")
        run_font(r, size=9.3, bold=True, color=NAVY)
        r = p.add_run(body)
        run_font(r, size=9.2)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("验收：")
    run_font(r, size=9.3, bold=True, color=GREEN)
    r = p.add_run(accept)
    run_font(r, size=9.2)

def build(doc):
    h1(doc, "04", "需求逐项评审（Part 1–10）", "你列的 10 个部分已经覆盖了业务；这一章逐项补字段、补规则、补边界。")

    para(doc, "下面每一节的结构都一样：先说你已经写对的部分，再给“建议字段”，然后给“规则与边界”，最后给一条可执行的验收标准。程序师可以按这张清单估工时；你也可以用“验收”那一行检查他有没有漏。", size=10)

    # ---------- Part 1 ----------
    part(doc, 1, "Property Information 房地产基本资料",
         "你已经列了项目名称、地址、类型、面积、产权、购买日期、持有期、策略。这些是“识别项目”的最小集合，但还不足以支持估值、贷款、出租和组合分析。",
         [("property_name", "Text(120)", "是", "项目名/楼盘名；与地址分开，便于搜索"),
          ("address_line_1/2, city, state, postcode", "Text", "是", "结构化地址；地图/估值/律师文件都用得上"),
          ("property_type", "Enum", "是", "Residential / Commercial / Industrial / Land / Mixed"),
          ("title_type / tenure", "Enum", "是", "Freehold / Leasehold / Strata / Master Title / Malay Reserve"),
          ("lease_expiry", "Date", "条件", "Leasehold 必填；系统算剩余年限并预警"),
          ("land_area / built_up", "Decimal + Unit", "是", "sqft / sqm / acre；两者都存，不要只存一个"),
          ("floors / units_count", "Int", "是", "店屋/公寓的楼层与可出租单位数"),
          ("year_built / developer", "Int / Text", "否", "楼龄、开发商；影响估值与维修"),
          ("parcel_no / mukim / district", "Text", "否", "土地局/分层地契所需"),
          ("status", "Enum", "是", "Prospect / Owned / Refinanced / Sold / Archived"),
          ("tags / notes", "Text", "否", "策略标签、风险标签、备注")],
         [("Property 与 Deal 要分开", "同一个物业可以有多笔 Deal（买入、再融资、出售）；价格、贷款、租金都挂在 Deal 上，不要挂在 Property 上。"),
          ("地址要结构化", "至少 city/state/postcode 分开；以后做地图、区域收益率、银行估值都要用。"),
          ("Leasehold 的剩余年限", "remaining = lease_expiry − today；低于 30 年时提示“贷款/转售风险”。"),
          ("面积双单位", "马来西亚常用 sqft，但土地可能用 acre；存原单位 + 换算值，避免四舍五入争议。"),
          ("状态机", "Prospect → Owned → Refinanced → Sold；状态变化要留时间戳，不能覆盖历史。")],
         "新建一个“3 层店屋、99 年租赁、2095 年到期、3 个单位”的项目，系统显示剩余 69 年、3 个单位、可分别出租。")

    # ---------- Part 2 ----------
    part(doc, 2, "Purchase Price 购买价格",
         "你把 SPA Price 与 Actual Purchase Price 分开，这是对的，也是整套系统最关键的设计。但“差额”不能只算一个数，必须有类型、有依据、有结算单。",
         [("spa_price", "Decimal RM", "是", "合约价；银行贷款、印花税、律师费通常按此"),
          ("actual_purchase_price", "Decimal RM", "是", "真实成交价；你的实际成本"),
          ("bank_valuation", "Decimal RM", "否", "银行估价；影响贷款额，不影响成交价"),
          ("booking_fee / deposit_paid", "Decimal RM", "是", "定金/订金；是否已包含在价格内要明确"),
          ("downpayment_paid", "Decimal RM", "是", "已付首期；与定金分开，避免重复"),
          ("seller_rebate", "Decimal RM", "否", "卖方回扣/折扣；必须有文件"),
          ("other_adjustment", "Decimal RM", "否", "价格调整、家具/装修折让等"),
          ("price_gap_type", "Enum", "条件", "Seller rebate / Price adjustment / Financing cashback / Documentation premium / Unreconciled"),
          ("completion_date", "Date", "是", "交割日；现金流与 IRR 的锚点"),
          ("purchaser_entity", "Text/Enum", "是", "个人 / Sdn Bhd / LLP；影响税务与贷款")],
         [("差额不是利润", "price_gap = spa_price − actual_price。它只是“文件价与实价的差”，不是赚到的钱；系统不得自动计入利润。"),
          ("差额必须有类型", "选“Unreconciled”时，Deal 打上“未复核”标记，所有 ROI 显示为“暂定”。"),
          ("定金只算一次", "尾款 = 价格 − 定金 − 贷款；定金在初始现金里出现一次，在尾款里扣一次，不能两边都加。"),
          ("Completion statement 是核心", "交割现金流 = 贷款发放 + 卖方回扣 −（价格 − 已付定金）− 交割日应付费用。系统应生成这张表，而不是让用户填一个“现金投入”。"),
          ("日期三件套", "SPA 日期、贷款发放日、交割日要分开；IRR 用实际现金流日期。")],
         "输入 SPA 900,000、实价 800,000、定金 16,000、贷款 720,000；系统算出交割尾款 64,000，而不是 80,000；若选“Unreconciled”，ROI 标记为暂定。")

    # ---------- Part 3 ----------
    part(doc, 3, "Acquisition Cost 购买成本",
         "你要求“每个项目都能自由增加费用”，这是对的。但自由增加的前提是“分类 + 拆分 + 谁付 + 何时付”，否则就会像 Excel 里的 72,834 一样，变成一个无法解释的混合数。",
         [("cost_category", "Enum", "是", "SPA legal / SPA stamp / Loan legal / Loan stamp / Valuation / Agent / Consent / Survey / Admin / Misc / Other"),
          ("description", "Text", "是", "具体费用名；自由文本，但 category 必须选"),
          ("amount", "Decimal RM", "是", "含税/不含税要标明"),
          ("basis", "Enum", "是", "Auto（按规则）/ Manual（实际报价）"),
          ("rule_code", "Text", "条件", "Auto 时必填；指向费率规则"),
          ("estimate_actual", "Enum", "是", "Estimated / Actual"),
          ("paid_status / payment_date", "Enum / Date", "是", "Paid / Unpaid / Partially paid；日期影响 IRR"),
          ("payer / payee", "Text", "是", "谁付、付给谁；多人投资的核心"),
          ("source", "Enum", "是", "Cash / Loan / Contra / Lawyer / Bank"),
          ("capitalizable", "Bool", "是", "计入成本（影响 RPGT/ROI）还是当期费用"),
          ("sst_amount", "Decimal RM", "否", "8% 律师费 SST（2024-03-01 起）；单独列，不混进律师费"),
          ("invoice_no / attachment", "Text / File", "否", "收据/发票；审计用")],
         [("六个 component", "律师费、SST、印花税、disbursement、registration、other 分开存；不要只存一个“律师费 72,834”。"),
          ("Auto + Override", "先按规则估算；律所报价来了就覆盖；差异超过 10% 或 RM500 时要求填理由。"),
          ("谁付很重要", "同一笔费用，如果由贷款发放（进 loan），不算买家的现金投入；买家自己垫付的才算。v1 是个人口径，付款人只有买家自己与第三方（银行/律师/租客）。"),
          ("不得重复", "定金 vs 首期、律师费 vs 印花税、valuation vs 银行费，必须有唯一分类；系统在保存时做重复检测。"),
          ("资本化 vs 费用化", "购买律师费/印花税通常资本化；持有维修通常费用化；装修改良按规则资本化。")],
         "把 Case A 的 72,834 拆成律师费、印花税、SST、disbursement 四项；若四项之和 ≠ 72,834，系统拒绝保存并提示差额。")

    # ---------- Part 4 ----------
    part(doc, 4, "Bank Loan 银行贷款",
         "你列了银行、贷款比例、批准额、发放额、利率、年限、供款、保险、锁定期、罚款、现金回流、额外还本。这些够用，但还缺“利率变更、drawdown、daily rest、settlement”四个关键机制。",
         [("bank / facility_type", "Text / Enum", "是", "Term loan / Flexi / Bridging / Overdraft"),
          ("approved_amount / disbursed_amount", "Decimal RM", "是", "批准 ≠ 发放；差额要能解释"),
          ("loan_margin", "Decimal %", "是", "贷款 / SPA 价；不是贷款 / 实价"),
          ("interest_type / base_rate / spread", "Enum / % / %", "是", "Fixed / Variable；SBR + spread"),
          ("effective_rate", "Decimal %", "是", "当前执行利率；可随 RatePeriod 变化"),
          ("tenure_years / start_date", "Int / Date", "是", "年限与起算日；决定摊销"),
          ("installment_amount", "Decimal RM", "是", "银行实际扣款；允许覆盖公式值"),
          ("rest_type", "Enum", "是", "Monthly rest / Daily rest；马来西亚常见 daily rest"),
          ("mrta_mlta", "Decimal RM + Bool", "否", "金额、是否融资进贷款"),
          ("lock_in_months / penalty_rate", "Int / %", "否", "锁定期与提前赎回罚金"),
          ("legal_fee / stamp_duty", "Decimal RM", "否", "贷款费用；可与 SPA 费用分开"),
          ("drawdown_schedule", "Table", "条件", "日期 / 金额 / 收款人 / 用途；期房必填"),
          ("rate_periods", "Table", "条件", "生效日 / 基准 / spread / 利率 / 原因"),
          ("settlement", "Table", "条件", "赎回日 / 金额 / 罚金 / 手续费 / 银行信")],
         [("批准 vs 发放", "批准额是上限；发放额是实际到账。差额可能是保留金、未提取、或银行扣费。"),
          ("Daily rest", "马来西亚房贷多为 daily rest；用月利率简化会产生几块钱到几十块钱的差异。系统应支持 daily balance，至少允许用银行供款/余额覆盖。"),
          ("利率变更", "RatePeriod 生效后，默认“供款不变、年限调整”；也允许“重算供款”。两种结果都要能显示。"),
          ("锁定期罚金", "常见 2–3% 原贷款额或剩余余额；公式可配置；提前赎回时自动带入 settlement。"),
          ("Settlement 优先", "银行 settlement letter 的金额优先于系统摊销；差异超过阈值时提示“可能有罚息/欠款/费用”。")],
         "输入 720,000、4.5%、30 年，系统算出月供 3,648.13；第 25 个月把利率改成 4.8%，默认重算月供为 3,771.08（或选择保持供款不变、显示新的 tenure）；再输入银行 settlement 696,562.27，差额小于 RM1。")

    # ---------- Part 5 ----------
    part(doc, 5, "Renovation & Setup Cost 装修及启动成本",
         "你列了装修、电线、水喉、冷气、家具、电器、招牌、执照、装修期利息、其他。分类够细；缺的是“发生时间”和“资本化/费用化”的判断。",
         [("item / category", "Text / Enum", "是", "Renovation / Electrical / Plumbing / AC / Furniture / Appliance / Signboard / Permit / Interest / Other"),
          ("contractor / contract_amount", "Text / Decimal", "否", "承包商与合同额；便于对账"),
          ("amount", "Decimal RM", "是", "实际/预计金额"),
          ("timing", "Enum", "是", "Before purchase / At completion / After completion / During renovation"),
          ("start_date / end_date", "Date", "否", "装修期；影响租金起算与利息"),
          ("payment_schedule", "Table", "否", "进度款 / 保留金 / 尾款"),
          ("estimate_actual", "Enum", "是", "Estimated / Actual"),
          ("capitalizable", "Bool", "是", "改良 vs 维修；影响 RPGT 与 P&L"),
          ("sst / permit", "Decimal / Text", "否", "SST、执照/申请费"),
          ("invoice / attachment", "Text / File", "否", "合同、发票、完工照")],
         [("时间影响 IRR", "同样 15,000，购买前付与出租后付，XIRR 不同；必须记录日期，不能只记“装修 15,000”。"),
          ("资本化 vs 费用化", "提升价值/延长寿命的改良可资本化；日常维修费用化；系统给默认判断，但允许会计师覆盖。"),
          ("装修期利息", "可资本化（开发/改造）或费用化（投资持有）；默认费用化，可配置。"),
          ("超支", "合同额 vs 实际额；超支超过 10% 提示；保留金单独跟踪。"),
          ("完工前出租", "装修期与租约开始日重叠时，系统要能处理“免租期/装修期”。")],
         "15,000 装修分两期：签约 30%、完工 70%；系统在正确日期产生现金流，并把 15,000 资本化；若改为费用化，ROI 与 RPGT 同步变化。")

    # ---------- Part 6 ----------
    part(doc, 6, "Rental Income 租金收入",
         "你要求支持 multi-unit（三层店屋分别出租），这是对的。还需要把“单位、租约、租金、押金、空置、递增”拆成五层，而不是一行文本。",
         [("unit / floor / area", "Text / Int / Decimal", "是", "唯一单位编码；楼层；面积"),
          ("monthly_rent", "Decimal RM", "是", "合同月租；含/不含 SST 要标明"),
          ("tenancy_start / end", "Date", "是", "租约起止；决定租金 schedule"),
          ("tenant_name / contact", "Text", "否", "租客；用于追租/续约"),
          ("security_deposit / utility_deposit", "Decimal RM", "是", "押金是负债，不是收入"),
          ("rent_free_months", "Int", "否", "免租期；装修/招商常见"),
          ("escalation_rate / frequency", "Decimal % / Int", "否", "每年/每两年递增"),
          ("vacancy_months / occupancy_rate", "Int / %", "否", "空置；预测与压力测试"),
          ("other_income", "Decimal RM", "否", "停车位、招牌、广告位"),
          ("leasing_commission", "Decimal RM / %", "否", "租赁佣金；通常 1 个月租金"),
          ("billing_day / late_fee", "Int / %", "否", "账单日、滞纳金")],
         [("Unit 与 Tenancy 分开", "一个单位可以有多份租约（续约、换租客）；一个租约可以覆盖多个单位。不要用一行文本表示。"),
          ("押金是负债", "收到押金时现金增加、负债增加；退还时冲负债；不进 P&L。"),
          ("有效租金", "effective_rent = 合同租金 − 免租 − 空置；预测用 occupancy，实际用账单。"),
          ("递增", "按租约日期生效；不足整月按天/prorate；不要用“平均租金”。"),
          ("出售时 apportion", "预收租金、押金、未到期租约要在出售结算中处理。")],
         "三层店屋：G 3,000、1F 1,500、2F 1,000；2F 免租 1 个月、第 3 年起递增 10%；系统生成 36 个月 schedule，并算出有效租金与押金负债。")

    # ---------- Part 7 ----------
    part(doc, 7, "Holding Cost 持有成本",
         "你特别提醒要加门牌税、地税和更细的成本，这是对的。持有成本最容易漏，也最容易把“供款”与“利息”混在一起。",
         [("category", "Enum", "是", "Instalment / Maintenance / Sinking fund / Assessment tax / Quit rent / Insurance / Repair / Utilities / Management fee / Leasing commission / Other"),
          ("amount", "Decimal RM", "是", "金额"),
          ("frequency", "Enum", "是", "Monthly / Quarterly / Half-yearly / Annual / One-off"),
          ("start_date / end_date", "Date", "否", "费用期间；用于按月摊"),
          ("payer / payee", "Text", "是", "谁付、付给谁"),
          ("tenant_recoverable", "Bool", "是", "是否可向租客收回"),
          ("estimate_actual", "Enum", "是", "Estimated / Actual"),
          ("payment_date / attachment", "Date / File", "否", "实际付款与账单"),
          ("arrears", "Decimal RM", "否", "欠款；出售时从 proceeds 扣")],
         [("供款全额进现金流，利息进 P&L", "月供是现金流出；其中本金不是费用。利润表只扣利息，现金流表扣全额。两张表必须能对上。"),
          ("频率归一", "月/季/半年/年/一次性都换成“月度等值”，但现金流仍按实际日期。"),
          ("税与保险", "门牌税、地税、火险通常年度/半年；到期日与滞纳金要记录。"),
          ("Sinking fund", "是储备，不是当期费用；现金流出，但资产负债表上是储备/负债（视管理公司）。"),
          ("可回收 vs 不可回收", "租客承担的部分不进业主 P&L；但要跟踪，避免重复。")],
         "月供 4,000、管理费 300/月、门牌税 1,200/年、地税 300/年、火险 1,500/年、维修 3,000 一次性；系统算出月度等值、12 个月现金流、以及“供款中利息/本金”拆分。")

    # ---------- Part 8 ----------
    part(doc, 8, "Resell Calculation 出售计算",
         "你列了售价、出售日、赎回、佣金、SST、律师费、RPGT、retention、罚款、未结清费用、押金退还、预收租金、其他。基本齐了；关键是分清“RPGT payable”和“retention”。",
         [("expected_price / actual_price", "Decimal RM", "是", "预计 vs 实际；支持多场景"),
          ("listing_date / sale_date / completion_date", "Date", "是", "挂牌、签约、交割分开"),
          ("buyer / agent", "Text", "否", "买家/中介"),
          ("commission_rate / sst", "Decimal %", "是", "通常 2–3% + 8% SST"),
          ("legal_fee", "Decimal RM", "是", "出售律师费"),
          ("redemption_amount", "Decimal RM", "是", "银行赎回额；优先于摊销表"),
          ("penalty / discharge_fee", "Decimal RM", "否", "锁定期罚金、解押费"),
          ("rpgt_payable", "Decimal RM", "是", "最终应税；进 P&L"),
          ("rpgt_retention", "Decimal RM", "是", "3% / 7% 暂扣；进现金流，不进 P&L"),
          ("tenant_deposit_refund / advance_rent", "Decimal RM", "否", "退还租客；负债"),
          ("outstanding_charges / apportionment", "Decimal RM", "否", "未结清门牌税/地税/管理费；按日分摊")],
         [("RPGT 两个数", "payable 是税，retention 是预扣；refund = retention − payable。不要把 retention 当永久费用。"),
          ("负资产", "售价 < 赎回 + 费用时，cash proceeds 为负，需要补现金；系统要显示“需要补多少”。"),
          ("出售费用", "agent 佣金、SST、律师费、RPGT、罚款、押金退还、预收租金调整，全部进 net proceeds。"),
          ("Break-even", "解方程：net sale proceeds + cumulative rent − cash invested = 0；售价是未知数。"),
          ("Apportionment", "门牌税/地税/租金/管理费按日分摊；交割日前后归属要清楚。")],
         "售价 850,000、赎回 757,000、agent 2%+8%、律师 3,000、retention 3%、RPGT payable 10,000；系统算出净现金、retention 退款、break-even 售价，并显示负资产情景。")

    # ---------- Part 9 ----------
    part(doc, 9, "Payment Record 付款记录（个人版）",
         "按 10/19 的确认，v1 只做个人买入 → 持有 → 卖出，不做投资人分账。付款记录保留为“轻账本”核心：每一笔钱都要能回答 6 个问题，这是两用（买家成本清单 + 卖出利润）可信的前提。",
         [("payment_date", "Date", "是", "实际付款日，不是录入日"),
          ("payer / payee", "Text", "是", "谁付、付给谁（自己 / 律师 / 银行 / 卖家 / 租客 / 政府）"),
          ("amount", "Decimal RM", "是", "含/不含 SST 要标明"),
          ("category", "Enum", "是", "定金 / 律师费 / 印花税 / 装修 / 月供 / 门牌税 / 出售费用…"),
          ("cost_item_id", "FK", "条件", "关联 CostItem；一笔费用可分期多笔付款"),
          ("method", "Enum", "否", "Bank / Cash / Cheque / Offset"),
          ("receipt / attachment", "Text / File", "否", "收据、银行单；审计用"),
          ("reconciled", "Bool", "否", "是否与银行对账一致")],
         [("付款 ≠ 费用", "CostItem 是“应该付多少”；Payment 是“实际付了多少、谁付的”。一个 CostItem 可以有多笔 Payment（分期/垫付/退款）。"),
          ("每笔钱 6 个问题", "谁付的、付给谁、什么时候、多少钱、为什么、凭什么；回答不了就不算入账。"),
          ("付款人只可能是买家自己", "v1 是个人口径：若费用由贷款发放（如律师费进 loan），source = Loan，不计入现金投入。"),
          ("定金只算一次", "定金在初始现金出现一次、在尾款里扣一次；付款记录不得把定金再记一笔现金流出。"),
          ("银行对账", "月供、赎回、罚金以银行单据为准；系统摊销只做预测与交叉验证，差异超过阈值提示。")],
         "记录定金 14,700（付款人：买家，收款人：卖方律师，日期 + 收据）；交割尾款 64,000；系统生成的现金投入不含重复定金，与结算单一致。")

    # ---------- Part 10 ----------
    part(doc, 10, "Investment Assumptions 投资假设",
         "你列了持有月、房价增长、租金增长、空置率、利率变化、现金储备、目标利润、目标 ROI、目标年化。这些是“向前看”的假设；还需要情景版本与反向计算。",
         [("holding_months", "Int", "是", "预计持有月"),
          ("capital_appreciation", "Decimal % / 年", "是", "房价增长"),
          ("rental_growth", "Decimal % / 年", "是", "租金增长"),
          ("vacancy_rate", "Decimal %", "是", "空置率；按月/按年"),
          ("opex_growth", "Decimal % / 年", "否", "持有成本增长"),
          ("interest_rate_change", "Decimal % / 年", "否", "利率变化；或 rate path"),
          ("sale_cost_pct", "Decimal %", "是", "出售费用率；默认 3%"),
          ("cash_reserve", "Decimal RM", "是", "预留现金"),
          ("target_profit / target_roi / target_annual", "Decimal", "否", "目标；用于反向计算"),
          ("discount_rate", "Decimal %", "否", "NPV/IRR 对照"),
          ("scenario_type", "Enum", "是", "Base / Optimistic / Conservative")],
         [("情景是覆盖层", "不改历史账本；只对未来假设做覆盖；同一 Deal 可以有多套情景。"),
          ("按月模拟", "房价/租金/费用按月复利或按年跳；不要用简单乘数。"),
          ("反向计算", "给定目标利润/ROI，解出最高买价；用数值解法（二分/牛顿），不要写死公式。"),
          ("持有能力", "peak cash requirement + 压力测试（空置 6 个月、利率 +2%、维修 10k）。"),
          ("目标 vs 实际", "目标 ROI 与实际 ROI 并列显示；差距用红/绿标识。")],
         "36 个月、房价 3%/年、租金 2%/年、空置 5%、利率 +1%；系统给出 Base/Optimistic/Conservative 三套现金流与 reserve，并解出目标 15% 年化下的最高买价。")
