from doc_lib import *

def build(doc):
    # ================= 14 =================
    h1(doc, "14", "风险与合规", "这套系统会碰到银行、LHDN、买卖双方和租客；有些红线不能碰。")

    h2(doc, "14.1", "风险清单")
    rows = [
        ("SPA 价与实价差额 / Cashback", "高 / 高", "可能被银行视为误导性估值，或被 LHDN 视为少报；若涉及“台底钱”，有刑责风险", "gap_type 必选；要求 SPA/律师函/结算单；Unreconciled 时 KPI 标“未复核”；不自动把差额当利润"),
        ("RPGT / SST / 印花税变化", "中 / 中", "费率/豁免/取整变化，历史结果失真", "规则表带 effective_from/to；历史 Deal 锁定版本；UI 写“估算”"),
        ("贷款数据不一致", "高 / 中", "本金/利息/余额三套数，ROI 偏差 2–3 倍", "单一摊销表 + 银行 settlement 覆盖 + 差异提示"),
        ("未知当 0", "高 / 高", "KPI 看起来完整，实际缺数据", "Unknown 状态；必填校验；KPI partial 标记"),
        ("持有预测偏差", "中 / 中", "租金/利率假设过于乐观，误导买家决策", "Base/Opt/Cons + 逐年表 + 免责声明；银行余额可覆盖"),
        ("PDPA / 数据泄露", "中 / 高", "身份证、税号、银行账户", "加密、权限、保留期、删除请求、访问日志"),
        ("范围蔓延 / SaaS 化", "高 / 中", "第一版做太多，交付延期", "Phase gate；先自用，再团队，再 SaaS"),
        ("模型风险", "中 / 中", "假设过于乐观，误导决策", "Base/Opt/Cons + 敏感性 + 免责声明"),
        ("供应商锁定", "低 / 中", "数据/附件迁不走", "导出 CSV/Excel + 原始附件；开放 API"),
        ("法规变化（外籍/公司）", "中 / 中", "税率/门槛/同意费不同", "实体类型/州/国籍作为规则维度"),
    ]
    table(doc, ["风险", "概率/影响", "后果", "缓解"], rows, [4.2, 2.2, 6.2, 4.4], font_size=7.8)

    h2(doc, "14.2", "四条红线")
    for lead, body in [
        ("不协助少报价格", "系统可以记录 SPA 与实价的差额，但不能生成“给银行看的低价合同”或“给 LHDN 看的高价合同”。差额必须有类型、有文件、有律师/税务确认。"),
        ("不把估算当税务意见", "RPGT/SST/印花税都是估算；最终以 LHDN/律师/税务师为准。报告必须显示“估算”与假设。"),
        ("不让 Agent 看到不该看的", "角色权限 + 行级隔离；每个 Agent 只能看自己的项目；附件用签名 URL。"),
        ("不悄悄改历史", "已过账的 Ledger 不可改；冲销留痕；报表可复现。"),
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(lead + "：")
        run_font(r, size=9.6, bold=True, color=RED)
        r = p.add_run(body)
        run_font(r, size=9.5)

    callout(doc, "建议找律师/税务师做一次 2 小时的规则复核",
            "重点确认：S&P/贷款律师费的分段与 SST；印花税取整；RPGT 的持有期起算、豁免、可扣除成本；retention 比例；商业租金 SST。把这 6 项写成一页纸，程序师按它实现规则表，比在代码里猜要便宜得多。",
            kind="warn")

    # ================= 15 =================
    h1(doc, "15", "待确认问题", "其中 8 个已按 10/19 的意见确认；剩下 4 个开工前拍板即可。")

    rows = [
        ("1", "给谁用？", "自己 / 团队 / SaaS", "✅ 已确认：先自己 → 团队内测 → 无 bug 推广 SaaS（RM50/年）"),
        ("2", "平台？", "Web / 手机 App", "✅ 已确认：先 Web（手机可用），部署自己的深圳服务器；App 最后上架"),
        ("3", "账本深度？", "轻账本 / 复式会计 / 只做 calculator", "✅ 已确认：快速计算优先 + 轻账本（日期/方向/付款人/收款人/单据）"),
        ("4", "贷款利息模式？", "等额本息 / daily rest", "✅ 已确认：默认等额本息（和中国银行一样）；以银行单据为准，系统摊销做预测"),
        ("5", "RPGT 做到什么程度？", "估算 / 详细税务 / 报税", "✅ 已确认：估算 + retention 跟踪；按持有年 30/20/15/0 分档"),
        ("6", "投资人分账？", "做 / 不做", "✅ 已确认：v1 不做；两人买家律师费也后续再加"),
        ("7", "第一页字段？", "3 个 Part / 23 个 / 更多", "✅ 已确认：3 个 Part（买入一次性/年度费用/年度利润），约 20 个输入，其余自动算；Holding/Other/RPGT 保留展开"),
        ("8", "语言？", "EN / 中文 / 马来语", "✅ 已确认：EN + 中文；马来语后加"),
        ("9", "历史数据？", "4 个案例 / 20+ 项目 / 全部", "✅ 已确认：先导 4 个案例做回归基准；再批量导入"),
        ("10", "权限？", "只有你 / 团队", "✅ 已确认：Owner/Admin/Agent/Viewer（无投资人角色）"),
        ("11", "预算与时间？", "—", "先批 Phase 0（2 周），再按阶段批"),
        ("12", "谁做法律/税务复核？", "律师 / 税务师 / 你自己", "律师 + 税务师各 2 小时；出一页规则确认"),
    ]
    table(doc, ["#", "问题", "选项", "推荐默认"], rows, [0.8, 4.2, 6.2, 5.6], font_size=8.2, align=['c','l','l','l'])

    h2(doc, "15.1", "下一步建议")
    for i, body in enumerate([
        "确认 v1.1 方案 → 开工 Phase 0（2 周）：只做公式引擎（等额本息 + 1–5 年投影）+ 4 案例回归 + 法定费用计算器；不碰 UI、不做登录。",
        "给我 3 份真实单据：1 份 SPA、1 份贷款 settlement、1 份 completion statement；我用它们校准 Case A。",
        "选 2 个真实项目做 pilot：一个正在持有、一个准备出售；用系统跑一遍，和 Excel 并排对比。",
    ]):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(f"{i+1}. ")
        run_font(r, size=10, bold=True, color=BLUE)
        r = p.add_run(body)
        run_font(r, size=9.8)

    # ================= Appendix A =================
    h1(doc, "A", "附录 A：补充字段与系统字段", "正文 Part 1–10 已列业务字段；这里补系统字段与容易漏的字段。")

    rows = [
        ("所有实体", "id", "UUID", "主键"),
        ("所有实体", "org_id", "UUID", "多租户"),
        ("所有实体", "created_at / created_by", "Timestamp / UUID", "审计"),
        ("所有实体", "updated_at / updated_by", "Timestamp / UUID", "审计"),
        ("所有实体", "deleted_at", "Timestamp", "软删除"),
        ("所有实体", "version", "Int", "乐观锁/版本"),
        ("所有实体", "notes", "Text", "备注"),
        ("Property", "title_status", "Enum", "Individual / Strata / Master / Malay Reserve"),
        ("Property", "encumbrance", "Text", "抵押/查封/地役权"),
        ("Property", "geo_lat / geo_lng", "Decimal", "地图"),
        ("Property", "market_value / last_valued_at", "Decimal / Date", "估值"),
        ("Deal", "deal_type", "Enum", "Purchase / Refinance / Sale"),
        ("Deal", "strategy", "Enum", "Buy & Hold / Flip / Rental / Refinance"),
        ("Deal", "stage", "Enum", "Prospect / Due Diligence / Completion / Holding / Exiting / Closed"),
        ("Deal", "ownership_entity", "Text", "个人（v1）；公司后续加"),
        ("Purchase", "spa_no / spa_date", "Text / Date", "合约编号/日期"),
        ("Purchase", "completion_statement_id", "UUID", "结算单"),
        ("Purchase", "gap_evidence", "File", "差额依据"),
        ("CostItem", "vendor", "Text", "供应商/律所"),
        ("CostItem", "invoice_no / invoice_date", "Text / Date", "发票"),
        ("CostItem", "tax_code", "Text", "SST/免稅"),
        ("Loan", "account_no / branch", "Text", "银行账户"),
        ("Loan", "guarantor / collateral", "Text", "担保人/抵押"),
        ("Loan", "max_tenure / age_limit", "Int", "银行限制"),
        ("Loan", "redraw_facility", "Bool", "flexi 可提取"),
        ("RatePeriod", "source_doc", "File", "银行通知"),
        ("Drawdown", "stage", "Text", "progress billing 阶段"),
        ("Unit", "unit_code", "Text", "唯一编码（G/1F/2F/40-01）"),
        ("Unit", "strata_share", "Decimal", "管理费分摊"),
        ("Tenancy", "agreement_no", "Text", "租约编号"),
        ("Tenancy", "billing_day / late_fee", "Int / %", "账单/滞纳"),
        ("Tenancy", "renewal_option", "Text", "续约选项"),
        ("Tenancy", "stamp_duty", "Decimal", "租约印花税"),
        ("HoldingCost", "bill_no / due_date", "Text / Date", "账单/到期"),
        ("HoldingCost", "tenant_share", "Decimal", "租客承担"),
        ("Sale", "listing_agent / buyer", "Text", "中介/买家"),
        ("Sale", "reservation / deposit", "Decimal", "订金"),
        ("Sale", "completion_statement_id", "UUID", "出售结算单"),
        ("Sale", "negative_equity", "Decimal", "负资产补现金"),
        ("Investor", "（v1 移除）", "—", "投资人分账移出 v1；恢复时用资本账户模型"),
        ("Payment", "method", "Enum", "Bank / Cash / Cheque / Offset"),
        ("Payment", "receipt_no", "Text", "收据"),
        ("Payment", "reconciled", "Bool", "银行对账"),
        ("Scenario", "name / version", "Text / Int", "Base v1"),
        ("Scenario", "assumptions_json", "JSONB", "增长率/空置/利率"),
        ("Scenario", "is_locked", "Bool", "已用于报告"),
        ("Projection", "holding_years", "Int 1..5", "持有年限选择器"),
        ("Projection", "vacancy / rental_growth", "%", "空置 / 租金增长假设"),
        ("Projection", "rpgt_rate", "%", "按年 30/20/15/0（个人，可配置）"),
        ("Projection", "sale_price_assumption", "Decimal / %", "预期卖价或年增长率"),
        ("Document", "doc_type", "Enum", "SPA / Loan / Settlement / Invoice / Receipt / Tenancy"),
        ("Document", "sha256 / size", "Text / Int", "完整性"),
        ("Document", "url / uploaded_by", "Text / UUID", "存储"),
        ("LedgerEntry", "entry_date / direction", "Date / Enum", "事实"),
        ("LedgerEntry", "account / category", "Enum", "账户/类别"),
        ("LedgerEntry", "reversal_of", "UUID", "冲销"),
        ("LedgerEntry", "source_entity / source_id", "Text / UUID", "来源"),
        ("KPI", "snapshot_json", "JSONB", "输入/引擎版本/结果"),
        ("AuditLog", "actor / action / before / after", "UUID / Text / JSONB", "审计"),
    ]
    table(doc, ["实体", "字段", "类型", "说明"], rows, [2.6, 5.0, 4.0, 5.4], font_size=7.4)

    # ================= Appendix B =================
    h1(doc, "B", "附录 B：公式速查", "一页纸，可直接贴给程序师。")

    code_block(doc, """# 1. 法定费用（马来西亚，个人）
S&P legal = 1.25%*min(P,500k) + 1.00%*min(max(P-500k,0),7m) + 1.00%*max(P-7.5m,0)
S&P duty  = 1%*min(P,100k) + 2%*min(max(P-100k,0),400k)
          + 3%*min(max(P-500k,0),500k) + 4%*max(P-1m,0)
Loan legal = same scale on loan
Loan duty  = 0.5% * loan
SST        = 8% * legal fee (agent commission 8%)   # 2024-03-01 起 8%，此前 6%
S&P misc   = 3600 + 0.4% * price   # 律所杂费：100k→4000，每多100k +400
Loan misc  = 3800 + 0.2% * loan    # 贷款杂费：100k→4000，每多100k +200
Valuation  = 0.2% * price + 500    # 估价费：SPA × 0.2% + 500 杂费
S&P total  = legal + duty + misc + sst
LA total   = loan_legal + loan_duty + loan_misc + sst

# 2. 交割
completion_cash = loan + rebate - (price - deposit) - costs_at_completion
initial_cash    = deposit + costs_before + max(0, -completion_cash)
cashback        = max(0, completion_cash)

# 3. 贷款（默认等额本息，和中国银行一样）
r = annual/12; pmt = P*r/(1-(1+r)^-n)
interest = balance*r; principal = pmt - interest; balance -= principal
rate change (keep tenure): pmt = balance*r_new/(1-(1+r_new)^-remaining)

# 4. 出售
net_sale = price - redemption - selling_costs - rpgt_retention
           - deposit_refund - advance_rent_refund + apportionment

# 5. 利润
cash_profit = net_sale + cumulative_net_cash - total_cash_invested
total_roi   = cash_profit / total_project_cost
coc         = cash_profit / total_cash_invested
annualized  = total_roi * 365 / days
xirr        = solve sum(cf_t/(1+r)^(days/365)) = 0

# 6. RPGT
gain = price - acquisition - incidental - enhancement - allowable
tax  = rate(years, entity) * max(0, gain - exemption)
retention = 0.03 * price (citizen) / 0.07 (non-citizen/company)
refund = retention - tax

# 7. Break-even
solve p: net_sale(p) + cumulative_rent - total_cash_invested = 0

# 8. 持有 1–5 年投影
balance_y = P(1+r)^(12y) - pmt*((1+r)^(12y)-1)/r
rpgt_y    = 30% (y<=3) / 20% (y=4) / 15% (y=5) / 0% (y>=6)
profit_y  = sale_y - balance_y - sell_cost_y - rpgt_y
          + rent_y - holding_y - instalment_y - acquisition
""", size=7.6)

    # ================= Appendix C =================
    h1(doc, "C", "附录 C：术语表", "程序师/设计师不需要成为房产专家，但必须知道这些词。")

    rows = [
        ("SPA", "Sale and Purchase Agreement", "买卖合约；价格、付款、交割"),
        ("LA", "Loan Agreement", "贷款合约"),
        ("MOT", "Memorandum of Transfer", "产权转移文件/印花税"),
        ("RPGT", "Real Property Gains Tax", "产业盈利税"),
        ("Retention", "RPGT retention", "买方律师扣下的 3%/7%，交给 LHDN"),
        ("Redemption", "Redemption amount", "赎回/结清贷款的金额"),
        ("Lock-in", "Lock-in period", "提前还贷罚金期"),
        ("MRTA", "Mortgage Reducing Term Assurance", "房贷递减保险"),
        ("MLTA", "Mortgage Level Term Assurance", "房贷定额保险"),
        ("SST", "Sales and Service Tax", "服务税"),
        ("Disbursement", "Disbursement", "律师代垫杂费"),
        ("Assessment Tax", "Cukai Harta / 门牌税", "地方政府税"),
        ("Quit Rent", "Cukai Tanah / 地税", "州政府地税"),
        ("Sinking Fund", "Sinking fund", "储备金"),
        ("Freehold", "Freehold", "永久产权"),
        ("Leasehold", "Leasehold", "租赁产权"),
        ("Strata Title", "Strata title", "分层地契"),
        ("Consent", "Consent", "同意书（租赁/外籍/马来保留地）"),
        ("Cashback", "Financing cash proceeds", "贷款高于实价的现金回流；不是利润"),
        ("DSCR", "Debt Service Coverage Ratio", "偿债覆盖率"),
        ("NOI", "Net Operating Income", "净营运收入"),
        ("XIRR", "Extended Internal Rate of Return", "日期化现金流的 IRR"),
        ("CAGR", "Compound Annual Growth Rate", "复合年增长率"),
        ("CoC", "Cash-on-Cash", "现金回报率"),
        ("Break-even", "Break-even price", "不赚不亏的售价"),
    ]
    table(doc, ["术语", "英文/解释", "说明"], rows, [2.8, 6.4, 7.8], font_size=8.2)

    # ================= Appendix D =================
    h1(doc, "D", "附录 D：4 个案例回归数据", "给程序师做 fixture；所有金额 RM。")

    rows = [
        ("买入价", "1,250,000", "800,000", "735,000", "800,000"),
        ("SPA 价", "1,600,000", "900,000", "900,000", "900,000"),
        ("贷款", "1,280,000", "720,000", "765,000", "720,000"),
        ("定金", "100,000", "16,000", "14,700", "16,000"),
        ("购买成本", "152,895.58", "72,422.24", "49,269.92", "72,422.24"),
        ("Total Invest", "1,402,895.58", "872,422.24", "784,269.92", "872,422.24"),
        ("现金投入（Excel）", "119,895.58", "152,422.24", "33,969.92", "168,422.24"),
        ("现金投入（复核）", "119,895.58", "152,422.24", "19,269.92", "152,422.24"),
        ("租金", "14,850", "72,200", "24,700", "62,900"),
        ("供款", "—", "100,000", "50,389.82", "92,000"),
        ("已还本金", "—", "28,349", "8,000", "28,210"),
        ("出售价", "1,620,000", "910,000", "850,000", "910,000"),
        ("赎回", "1,296,950", "696,562.27", "757,000", "691,970"),
        ("出售费用", "41,669.21", "25,199.45", "0", "0"),
        ("净利润（Excel）", "187,419.34", "16,472.76", "48,040.26", "36,687.76"),
        ("净利润（复核）", "190,285.21*", "8,016.04", "48,040.26", "36,507.76"),
        ("ROI（Excel）", "156.3%", "9.11%", "114.5%", "18.66%"),
        ("ROI（复核）", "158.7%*", "4.56%", "176.2%", "20.23%"),
    ]
    table(doc, ["项目", "A", "B", "C", "D"], rows, [4.2, 3.6, 3.2, 3.2, 3.2], font_size=7.8, align=['l','r','r','r','r'])
    caption(doc, "* Case A 为部分复核；未解决 SPA/实价差额与赎回异常。完整计算见《公式验证与案例对账》工作簿。")

    para(doc, "— 完 —", size=10, color=LIGHTGREY, align='center')
    para(doc, "版本记录：v1.1 定稿（待确认）  ·  2026-10-19  ·  基于 Excel 4 案例、SPA/Loan Quotation、2 张界面截图与 10/19 确认意见。", size=8.5, color=LIGHTGREY, align='center')
