from doc_lib import *

def build(doc):
    # ================= 5 =================
    h1(doc, "05", "输出指标：定义、公式与常见错误", "同一个“ROI”，可以有 4 种完全不同的含义；系统必须把定义写在数字旁边。")

    h2(doc, "5.1", "先拆解截图里的 92.9%")
    para(doc, "截图里的 Demo 输入是：买价 800,000、其他成本 45,000、Loan Margin 80%、利率 4.2%、30 年、月租 4,500、每月营运费用 500、预计卖价 1,000,000、持有 36 个月。它输出的 6 个数字，我反推如下：", size=9.8)

    rows = [
        ("Initial Cash Out", "205,000", "800,000 − 640,000 + 45,000", "首付 20% + 成本"),
        ("Monthly Instalment", "3,130", "PMT(640,000, 4.2%/12, 360) = 3,128", "四舍五入/银行实际"),
        ("Monthly Cash Flow", "870", "4,500 − 500 − 3,130", "租金 − 营运 − 供款"),
        ("Estimated Net Profit", "190,402", "366,000 − 205,000 + 870×36", "净售价 + 累计现金流 − 初始现金"),
        ("Total ROI", "92.9%", "190,402 / 205,000", "分母是现金，不是总成本"),
        ("Simple Annualized ROI", "31.0%", "92.9% / 36 × 12", "简单年化，不是复利/IRR"),
    ]
    table(doc, ["输出", "截图值", "反推公式", "口径"], rows, [4.0, 2.2, 7.4, 3.4], font_size=8.4, align=['l','r','l','l'])
    caption(doc, "净售价 366,000 = 1,000,000 − 604,000（剩余贷款）− 30,000（3% 出售费用）。")

    callout(doc, "92.9% 不是“总回报率”",
            "它把 205,000 的现金投入作为分母，忽略了 640,000 的贷款和 845,000 的总成本。按总成本算，回报率只有约 22.5%（190,402 / 845,000），年化约 7.5%。两个数字都“对”，但含义不同；系统必须同时显示，并写清楚分母。",
            kind="warn")

    h2(doc, "5.2", "24 个指标：定义、公式、分母与常见错误")
    rows = [
        ("1", "Total Acquisition Cost", "实价 + 购买费用（律师、印花、估值、agent、consent、survey、admin、misc）", "不含装修/持有", "把装修算进 acquisition，导致与 RPGT 成本混用"),
        ("2", "Total Project Cost", "acquisition + 装修 + 持有 + 利息 + 出售费用", "全口径", "漏利息/出售费用，ROI 虚高"),
        ("3", "Initial Cash Out", "定金 + 交割日自有资金 + 交割前自有资金费用 − cashback", "自有资金", "把贷款支付的费用算成现金投入"),
        ("4", "Completion Surplus/(Shortfall)", "贷款发放 + 回扣 −（价格 − 定金）− 交割费用", "交割日", "定金重复；cashback 当收入"),
        ("5", "Monthly Instalment", "银行实际，或 PMT(principal, r/12, n)", "每月", "用年利率直接除 12 但忽略 rest type"),
        ("6", "Monthly Net Cash Flow", "有效租金 + 其他收入 − 营运 − 供款 − 税 − 保险 − 维修 − 管理", "每月", "只算租金−供款，漏税/维修"),
        ("7", "Cumulative Net Cash Flow", "Σ 所有现金流（含首付、交割、月供、租金、出售）", "从 Day 1", "起点不一致；漏交割日"),
        ("8", "Peak Cash Requirement", "max(0, −min(cumulative)) + reserve", "最大垫资", "只看初始现金，忽略持有期补贴"),
        ("9", "Principal Repaid", "贷款本金 − 当前余额", "累计", "用月供×期数，未扣利息"),
        ("10", "Interest Paid", "Σ 摊销利息 = Σ 月供 − 本金", "累计", "把本金当费用，或把利息当现金流出两次"),
        ("11", "Outstanding Loan", "摊销余额 或 银行对账单", "时点", "用“贷款 − 月供×期数”近似"),
        ("12", "Net Sale Proceeds", "售价 − 赎回 − 出售费用 − retention − 押金退还 − 预收租金 + 分摊", "交割日", "把 retention 当永久费用"),
        ("13", "Net Profit (cash)", "净售价 + 累计净现金流 − 总现金投入", "现金", "把“现金回报”当利润（含本金返还）"),
        ("14", "Net Profit (economic)", "售价 − 买价 − 购买成本 − 装修 − 持有 − 利息 − 出售费用 − RPGT", "权责", "漏税/漏费用"),
        ("15", "Total ROI", "净利润 / Total Project Cost", "总成本", "分母用现金，杠杆被隐藏"),
        ("16", "Cash-on-Cash", "净利润 / 总现金投入（可含本金）", "现金", "分母是否含本金未说明"),
        ("17", "Simple Annualized", "Total ROI × 365 / 持有天数", "简单年化", "用月数手填，未按实际天数"),
        ("18", "CAGR", "(期末权益 / 期初权益)^(365/天数) − 1", "复利", "把 CAGR 与 XIRR 混用"),
        ("19", "XIRR (equity)", "使 Σ CF_t/(1+r)^(d_t/365)=0 的 r", "日期化", "漏一笔现金流；日期错"),
        ("20", "Project IRR (unlevered)", "不含贷款的现金流 IRR", "项目", "把贷款当现金流，得到权益 IRR"),
        ("21", "Gross / Net Yield", "年租金 / 买价；(年租金 − 营运) / 总成本", "年度", "分子用毛租金、分母用贷款"),
        ("22", "Break-even Price", "解净售价 + 累计租金 − 现金投入 = 0 的售价", "售价", "忽略出售费用/RPGT"),
        ("23", "DSCR", "NOI / 年债务服务", "偿债", "用毛租金，未扣营运"),
        ("24", "RPGT Payable / Retention / Refund", "tax = rate × chargeable gain；retention = 3%/7% × price；refund = retention − tax", "税务", "把 retention 当 tax"),
    ]
    table(doc, ["#", "指标", "公式 / 定义", "分母/口径", "常见错误"], rows,
          [0.8, 3.6, 6.9, 2.4, 3.3], font_size=7.6, align=['c','l','l','l','l'])
    caption(doc, "指标 19/20 需要日期化现金流；指标 15/16 必须同时显示，否则无法判断杠杆。")

    h2(doc, "5.3", "为什么同一个交易有 4 个 ROI")
    rows = [
        ("Total ROI", "净利润 / 总成本", "A：13.6%；C：6.1%", "看资产本身赚不赚钱"),
        ("Cash-on-Cash", "净利润 / 现金投入", "A：158.7%；C：176.2%", "看自有资金回报（含杠杆）"),
        ("Simple Annualized", "Total ROI / 年数", "A：112.0%；C：162.6%", "快速比较，不考虑复利"),
        ("XIRR", "日期化现金流的内部回报率", "B：2.0%；C：120.3%；D：11.4%", "看资金进出的真实年化"),
    ]
    table(doc, ["口径", "公式", "案例", "回答什么问题"], rows, [3.2, 5.2, 4.6, 4.0], font_size=8.4)
    para(doc, "建议默认卡片只放 4 个：Initial Cash Out、Monthly Net Cash Flow、Net Profit、XIRR；点开每个卡片，再显示 Total ROI、Cash-on-Cash、Annualized、Yield、Break-even。这样既不会吓到新手，也不会让老手觉得“只有一个数”。", size=9.8)

    h2(doc, "5.4", "可解释性：每个数字都能点开")
    rows = [
        ("Initial Cash Out", "交割结算单：定金、尾款、贷款、费用、cashback、自有资金", "每一行的日期、金额、付款人"),
        ("Monthly Cash Flow", "租金 schedule − 持有成本 − 月供", "按月列表；空置/免租/递增"),
        ("Net Profit", "P&L + 现金流 + 资产负债表", "三张表勾稽"),
        ("Total ROI", "分子/分母、包含/排除项、持有天数", "定义 + 公式 + 数据来源"),
        ("XIRR", "日期化现金流表", "每笔现金流的日期/金额/方向"),
        ("Break-even", "售价 = f(赎回, 费用, RPGT, 累计租金)", "求解过程 + 敏感性"),
    ]
    table(doc, ["卡片", "点开后看到什么", "必须包含"], rows, [3.4, 9.0, 4.6], font_size=8.4)

    # ================= 6 =================
    h1(doc, "06", "系统设计原则", "这 7 条原则决定系统会不会变成“另一个更容易出错的 Excel”。")

    principles = [
        ("1. 三张报表，而不是一张大表",
         "现金流表回答“钱什么时候进、什么时候出”；利润表回答“赚了多少”；资产负债表回答“还欠多少、资产多少”。Excel 把三者混在一列，所以才会出现“现金回报 188k、净利润 16k、ROI 9%”这种无法对平的组合。",
         "每笔交易同时影响 1–3 张表；UI 上分 Tab 展示，但数字必须能勾稽。"),
        ("2. 事件账本：日期化、不可变、可冲销",
         "每一笔钱是一条 ledger entry：日期、方向、金额、账户、付款人、收款人、类别、单据。已过账的 entry 不改，错了就冲销（reversal）再记一笔。",
         "报表从账本推导；任何修改留痕；审计能还原到原始单据。"),
        ("3. 实际、预计、情景三层分离",
         "Actual 是已经发生的；Estimate 是对同一笔的暂估；Scenario 是对未来的假设。三者不能混在一个字段里。",
         "Deal 上可以有多套 Scenario；对比时只覆盖未来，不改历史。"),
        ("4. 贷款只有一个真相：摊销表 + 银行对账单",
         "月供、利息、本金、余额、赎回全部从同一张 schedule 推导；银行 settlement 优先。禁止在利润表里手填“已还本金”，又在现金流表里手填“赎回余额”。",
         "任何手填的余额都要与 schedule 做差异检查；超过阈值提示。"),
        ("5. 金额用 Decimal，日期用 DATE",
         "RM 用整数分或 NUMERIC(18,2)，不用 float；日期存 DATE（Asia/Kuala_Lumpur），不存 timestamp。",
         "所有计算在服务端做一次；前端只格式化，不重复算。"),
        ("6. 每个数字可解释、可追溯",
         "KPI 卡片必须能下钻到公式、输入、日期、单据；不能只显示一个百分比。",
         "每个 KPI 存一个 `calculation_snapshot`（输入哈希 + 引擎版本），保证历史结果可复现。"),
        ("7. Agent commission 与投资回报分开",
         "你作为 agent 赚的佣金，不是物业投资的利润。Case A 的 24,300 个人佣金如果混进 ROI，会扭曲判断。",
         "佣金单独建 `Commission` 实体，挂在 Deal 上，但不进投资 P&L。"),
    ]
    for t, b, c in principles:
        h3(doc, t)
        para(doc, b, size=9.8)
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        r = p.add_run("设计后果：")
        run_font(r, size=9.4, bold=True, color=GREEN)
        r = p.add_run(c)
        run_font(r, size=9.4, color=GREY)

    callout(doc, "一条底线：不允许“无声的零”",
            "缺失的租金、未填的税费、未知的赎回额，不能当成 0 参与计算。系统要把它们标成 Unknown，并让 KPI 显示“暂定/不完整”。Excel 里最危险的错误，往往不是算错，而是把“没填”当成“没有”。",
            kind="risk")

    h2(doc, "6.8", "你列的 10 大功能，对应到本方案哪里")
    rows = [
        ("01 Property Database", "7.1 / 7.2 实体与 ERD；11.2 第一页"),
        ("02 Purchase Cost", "4.2 / 4.3 字段与规则；8.2 结算公式"),
        ("03 Bank Loan", "4.4 字段；8.3 摊销/利率变更/daily rest"),
        ("04 Rental Income", "4.6 多单位/租约；8.4 租金 schedule"),
        ("05 Resell Simulator", "4.8 出售字段；8.5 净售价/RPGT"),
        ("06 Investment Return", "第 5 章 24 个指标；8.6 ROI/XIRR/break-even"),
        ("07 Holding Projection", "第 9 章：等额本息 + 持有 1–5 年逐年预测（v1 不含投资人分账）"),
        ("08 Investment Scenario", "第 10 章 三套情景/反向/压力测试"),
        ("09 Portfolio Dashboard", "11.5 报告；12 架构；13 Phase 3"),
        ("10 Investment Report", "11.5 1 页 Deal Sheet + 5 页 Full Report"),
    ]
    table(doc, ["你的功能", "对应章节"], rows, [5.6, 11.4], font_size=8.4)

    # ================= 7 =================
    h1(doc, "07", "数据模型", "16 个实体，覆盖个人从买入到卖出 + 1–5 年持有预测；v1 不含投资人分账（将来按资本账户模型加回）。")

    h2(doc, "7.1", "ERD")
    doc.add_picture("work/diagrams/erd.png", width=Cm(16.2))
    caption(doc, "简化 ERD：Property → Deal → Loan/Cost/Unit/Sale；所有金额最终落到 Ledger 与 Payment。")

    h2(doc, "7.2", "实体清单")
    rows = [
        ("Property", "物业资产", "地址、类型、产权、面积、状态", "1:N Deal"),
        ("Deal", "一次交易", "买入/持有/出售、策略、状态", "N:1 Property；1:N Loan/Cost/Unit/Sale"),
        ("Purchase", "购买结算", "SPA、实价、定金、尾款、gap type", "1:1 Deal"),
        ("Sale", "出售结算", "售价、日期、费用、RPGT", "1:1 Deal"),
        ("Loan", "贷款", "银行、批准/发放、利率、年限", "N:1 Deal；1:N RatePeriod/Drawdown"),
        ("RatePeriod", "利率段", "生效日、基准、spread、利率", "N:1 Loan"),
        ("Drawdown", "放款", "日期、金额、收款人、用途", "N:1 Loan"),
        ("CostItem", "成本项", "类别、金额、Est/Actual、谁付", "N:1 Deal"),
        ("Payment", "付款", "日期、付款人、收款人、方式、收据", "N:1 Deal/CostItem"),
        ("Unit", "单位", "楼层、面积、租金、状态", "N:1 Deal"),
        ("Tenancy", "租约", "起止、租金、押金、免租、递增", "N:1 Unit"),
        ("HoldingCost", "持有费", "类别、金额、频率、可回收", "N:1 Deal"),
        ("Scenario", "情景", "假设集、版本、类型", "N:1 Deal"),
        ("Projection", "持有预测", "年限 1–5、租金/空置/增长、卖价、RPGT 档", "N:1 Deal"),
        ("Document", "附件", "类型、URL、SHA-256、上传人", "N:1 Deal/CostItem"),
        ("LedgerEntry", "账本", "日期、方向、金额、账户、类别", "N:1 Deal"),
    ]
    table(doc, ["实体", "中文", "关键字段", "关系"], rows, [2.6, 2.2, 8.4, 3.8], font_size=7.9)

    h2(doc, "7.3", "三个容易做错的设计决定")
    rows = [
        ("Property vs Deal", "物业是资产，Deal 是交易。同一间店屋可以先买、再 refinance、再卖；价格/贷款/租金都挂在 Deal 上。", "把 purchase_price 放在 Property 上，第二次交易就覆盖了历史。"),
        ("Scenario vs Actual", "Actual 是账本；Scenario 是覆盖层。Scenario 不改 Actual，只改未来假设。", "为了做“乐观情景”复制一份 Deal，导致两份数据不一致。"),
        ("Payment vs CostItem", "CostItem 是“应该付多少”；Payment 是“实际付了多少、谁付的”。一个 CostItem 可以有多笔 Payment。", "只存 CostItem，无法处理分期/垫付/退款。"),
    ]
    table(doc, ["决定", "正确做法", "反例"], rows, [3.6, 9.4, 4.0], font_size=8.4)

    h2(doc, "7.4", "字段级元数据：每个金额都要带这 8 个标签")
    rows = [
        ("amount", "Decimal", "金额；RM 分"),
        ("currency", "Enum", "默认 MYR；未来多币种"),
        ("estimate_actual", "Enum", "Estimated / Actual / Bank-confirmed"),
        ("event_date", "Date", "现金/费用发生日（不是录入日）"),
        ("paid_status", "Enum", "Paid / Unpaid / Partially paid"),
        ("payer / payee", "Text", "谁付、付给谁"),
        ("source", "Enum", "Cash / Loan / Contra / Lawyer / Bank"),
        ("document_id", "FK", "收据/发票/银行信"),
    ]
    table(doc, ["标签", "类型", "说明"], rows, [3.2, 2.2, 11.6], font_size=8.4)
    para(doc, "没有这 8 个标签，金额就只是一个数字；有了它们，才能回答“这笔钱是谁的、什么时候的、有没有单据、算不算我的现金投入”。", size=9.8)

    h2(doc, "7.5", "LedgerEntry：系统的“事实表”")
    rows = [
        ("id / deal_id", "UUID", "唯一；Deal 外键"),
        ("entry_date", "Date", "发生日；IRR 用"),
        ("direction", "Enum", "Inflow / Outflow"),
        ("amount", "Decimal", "正数；方向决定符号"),
        ("account", "Enum", "Cash / Loan / Lawyer / Bank / Tenant"),
        ("category", "Enum", "Purchase / Loan / Rent / Cost / Sale / Tax / Refund"),
        ("counterparty", "Text", "付款人/收款人"),
        ("source_entity / source_id", "Text / UUID", "从哪张表生成（CostItem/Payment/Loan…）"),
        ("reversal_of", "UUID", "冲销哪一笔"),
        ("document_id", "UUID", "单据"),
        ("created_by / created_at", "UUID / Timestamp", "审计"),
    ]
    table(doc, ["字段", "类型", "说明"], rows, [4.4, 3.0, 9.6], font_size=8.4)
