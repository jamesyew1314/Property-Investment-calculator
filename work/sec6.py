from doc_lib import *

def build(doc):
    # ================= 11 =================
    h1(doc, "11", "界面与第一页", "Simple Mode 让 agent 60 秒出结果；Advanced Mode 让整套账对得平。")

    h2(doc, "11.1", "两种模式，一套数据")
    rows = [
        ("Simple Mode", "3 个 Part（买入一次性/年度费用/年度利润）、4 个输出卡片、1 页 PDF", "Agent 现场报价、快速筛选", "所有字段仍写入同一套表；只是隐藏了明细"),
        ("Advanced Mode", "10 个部分、成本/租约/贷款/持有预测表格、情景、审计", "你自己、团队内测", "可以逐个字段覆盖；Simple 的结果自动同步"),
        ("切换", "顶部 Toggle；Advanced 修改后，Simple 只读显示“已细化”", "避免两套数据", "不复制 Deal；只是视图"),
    ]
    table(doc, ["模式", "包含什么", "给谁用", "关键约束"], rows, [2.8, 6.4, 4.2, 3.6], font_size=8.4)

    h2(doc, "11.2", "第一页的 3 个 Part（你定的结构）")
    rows = [
        ("Part 1 · 买入", "SPA Price；Actual Purchase Price；Loan Amount；Interest Rate（Tenure 默认 30 年可改）", "手填", "月供自动（等额本息）；输出 Total 第一次要出的费用（首付 + 全部费用 − cashback）"),
        ("Part 1 · 自动费用", "SPA Legal Fee（跟 SPA 价）；Loan Agreement Legal Fee（跟贷款额）", "自动", "含印花税 + 8% SST；可覆盖"),
        ("Part 1 · 其他", "Agent Fee；Consent Fee（如有）；Other Costs", "手填", "估值/杂费放这里"),
        ("Part 2 · Annual Holding Costs", "Management Fee；Quit Rent 地税；Assessment Tax 门牌税；装修/维修；Rental Agent Fee 出租中介费（RM/年）", "手填", "全部自己填；每年总费用 = 管理费×12 + 地税 + 门牌税 + 维修 + 保险 + 出租中介费 + 利息"),
        ("Part 2 · 自动", "每月银行利息", "自动", "平均口径（贷款 × 年利率 ÷ 12）；保险手填可选"),
        ("Part 3 · Investment Returns", "① Keep & Rent：Annual Rental Income 年租金收入；② Sell Property：Total Upfront Cash Required → Expected Selling Price → Holding Period → Less（Actual Purchase Price + Total Acquisition Costs）→ Gross Capital Gain → Selling related cost（Agent Fee 金额默认卖价×2%，可改 + Legal Fee + 售出杂费 + RPGT）；RPGT 行放售出杂费下方，公式 =（卖价 − 实价 − 总购置费用 − 卖出中介费 − 卖出律师费 − 售出杂费）× 年限税率 30/20/15/0 → Total Selling Costs → Selling Profit → Selling Return → Net Investment Profit（①+②）→ Total ROI → Total Cost → Return on Total Cost；① 输出另加 Total Rental Profit（年净利润 × 年数）", "手填", "自动：①持有年利润 =（租金 − 年度费用含利息）÷ 自己现金（置顶）；②年利润（快速口径）+ 扣掉所有费用后的净利润 + 年利率（XIRR）"),
    ]
    table(doc, ["组", "字段", "输入", "输出"], rows, [3.4, 8.4, 2.0, 4.2], font_size=8.0, align=['l','l','c','l'])
    para(doc, "手填字段不到 15 个；律师费、印花税、月供、每月利息、卖出律师费、RPGT、赎回余额全部自动算并允许覆盖。你的 3 个 Part 就是页面顺序：先问一次性、再问年度、最后给利润。门牌税/地税/管理费/维修/RPGT 的明细保留“展开”，不把页面堆满。", size=9.8)

    h2(doc, "11.3", "每个字段的 4 个功能")
    rows = [
        ("Estimated / Actual", "切换；Estimated 用黄色点，Actual 用绿色点", "先估后实；不覆盖历史"),
        ("Auto / Manual", "Auto 显示“fx”图标，Manual 显示“手”图标", "律师费/印花税/月供可自动，也可覆盖"),
        ("Date", "每个金额都有 event_date；默认今天，可改", "IRR/现金流靠它"),
        ("Remarks / Attachment", "备注 + 拖拽/拍照上传；显示回形针数量", "收据、报价单、银行信"),
    ]
    table(doc, ["功能", "交互", "目的"], rows, [4.2, 8.6, 4.2], font_size=8.6)
    para(doc, "再加两个“隐形”功能：Unknown 勾选（缺失不当 0）与“计算依据” tooltip（公式/来源/更新日期）。这两个功能决定了系统是否可信。", size=9.6)

    h2(doc, "11.4", "输出卡片与下钻")
    para(doc, "默认 4 张卡片：Initial Cash Out、Monthly Net Cash Flow、Net Profit、XIRR。每张卡片右上角有一个“为什么”按钮，点开是一个右侧 Drawer：", size=9.8)
    rows = [
        ("Initial Cash Out", "定金 + 交割短款 + 交割前费用 − cashback", "每一行可点，跳到对应 CostItem/Payment"),
        ("Monthly Cash Flow", "有效租金 − 持有 − 月供", "按月表格；空置/免租/递增高亮"),
        ("Net Profit", "净售价 + 累计现金流 − 现金投入", "P&L / 现金流 / 资产负债表三 Tab"),
        ("XIRR", "日期化现金流", "表格 + 折线图；每笔可点"),
    ]
    table(doc, ["卡片", "Drawer 内容", "交互"], rows, [3.4, 8.0, 5.6], font_size=8.6)

    h2(doc, "11.5", "移动端、语言、报告")
    for lead, body in [
        ("移动端", "375px 宽度下单列；输出卡片置顶；底部固定“保存/分享”；拍照上传收据。"),
        ("语言", "首发 EN + 中文；马来语可后加。字段名用英文，解释用中文；避免翻译造成歧义。"),
        ("报告", "1 页 Deal Sheet（8 个卡片 + 风险标签）+ 5 页 Full Report（假设、现金流、摊销、成本、敏感性）。"),
        ("分享", "只读链接 + 密码/有效期；水印 DRAFT。"),
        ("导出", "PDF + Excel；Excel 分 sheet：Inputs、Cash Flow、Loan、Costs、Sale、Projection（1–5 年）。"),
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(lead + "：")
        run_font(r, size=9.4, bold=True, color=NAVY)
        r = p.add_run(body)
        run_font(r, size=9.3)

    # ================= 12 =================
    h1(doc, "12", "技术架构与选型", "不要自己造 auth、存储、PDF；把时间花在计算引擎和 UX。")

    doc.add_picture("work/diagrams/architecture.png", width=Cm(16.8))
    caption(doc, "逻辑架构：入口 → 领域服务 → 引擎/账本 → 输出；横切能力统一做。")

    h2(doc, "12.1", "推荐技术栈")
    rows = [
        ("前端", "Next.js 15 + TypeScript + Tailwind + shadcn/ui；React Hook Form + Zod", "SSR/SEO 不需要，但组件生态与移动端好；类型安全"),
        ("后端", "NestJS（或 Fastify）+ tRPC/REST；BullMQ 处理报表/导入", "模块化、易测试；与前端共享类型"),
        ("数据库", "PostgreSQL 16 + Prisma；金额 NUMERIC(18,2)", "事务/约束/RLS；避免 float"),
        ("计算引擎", "独立 TypeScript package（纯函数）；Vitest + 属性测试", "可单测、可版本化、可复用到 CLI/Excel"),
        ("认证", "Auth.js 或 Clerk；组织/角色", "不要自建密码/2FA"),
        ("文件", "S3/R2；签名 URL；病毒扫描", "附件不进数据库"),
        ("报表", "Playwright/Chromium 生成 PDF；SheetJS 生成 Excel", "复用前端模板，减少两套排版"),
        ("部署", "Vercel + Neon/Supabase，或 Docker + VPS + 托管 Postgres", "先简单；有团队再上 K8s"),
        ("监控", "Sentry + 结构化日志 + 审计表", "计算错误要能复现"),
    ]
    table(doc, ["层", "选型", "理由"], rows, [2.6, 8.4, 6.0], font_size=8.2)

    h2(doc, "12.2", "多租户、权限、安全")
    rows = [
        ("组织", "org_id 出现在每张表；RLS 或应用层强制过滤", "EAG 团队/未来 SaaS"),
        ("角色", "Owner / Admin / Agent / Viewer", "Agent 只能看自己创建的 Deal 与被授权的项目"),
        ("团队内测", "每个 Agent 只看到自己的项目；分享链接带密码/有效期", "先自己用，再团队内测，无 bug 才对外"),
        ("审计", "谁改了什么、旧值/新值、时间、IP", "多人投资必备"),
        ("加密", "TLS；数据库静态加密；密钥管理", "PDPA"),
        ("备份", "每日全量 + PITR；每季度恢复演练", "不能只备份不恢复"),
        ("PDPA", "收集用途、同意、保留期、删除请求", "买家/租客身份证、税号是敏感数据"),
    ]
    table(doc, ["主题", "做法", "为什么"], rows, [3.0, 9.4, 4.6], font_size=8.4)

    h2(doc, "12.3", "集成与迁移")
    for lead, body in [
        ("Excel 导入", "先做 4 个模板的映射：列名 → 字段；导入后生成 Draft Deal，人工确认。不要做“万能导入”。"),
        ("银行 CSV", "Phase 2：Maybank/PBB/RHB 对账单；匹配月供/利息/余额；差异进“待确认”。"),
        ("PDF/OCR", "Phase 3：SPA/贷款 letter 的关键字段抽取；必须人工复核。"),
        ("WhatsApp", "Phase 3：分享只读链接/PDF；不做聊天机器人。"),
        ("会计", "Phase 2：导出 CSV 给会计；不做总账。"),
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(lead + "：")
        run_font(r, size=9.4, bold=True, color=NAVY)
        r = p.add_run(body)
        run_font(r, size=9.3)

    # ================= 13 =================
    h1(doc, "13", "路线图、工作量与验收", "先做能验证的引擎，再做能用的界面，最后做能收钱的 SaaS。")

    h2(doc, "13.1", "5 个阶段")
    rows = [
        ("Phase 0", "2 周", "数据模型、公式引擎、法定费用、4 案例回归、XIRR、测试", "engine + 测试 + Excel 验证 + API 草稿", "费用表 100% 吻合；4 案例误差 < RM1；XIRR 误差 < 0.1pp"),
        ("Phase 1", "8 周", "Auth/Org、Property/Deal、Simple Mode、贷款、租金、出售、8 KPI、1 页 PDF", "可用 MVP", "4 案例可复现；手机可用；报告可分享"),
        ("Phase 2", "8 周", "Ledger、成本/付款、多单位、1–5 年逐年预测、情景、Excel 导入、Full Report", "团队内测版", "现金流对平；预测表可出；导入 4 模板"),
        ("Phase 3", "6 周", "组合看板、角色权限、银行 CSV、审计导出", "组合版", "20+ 项目；权限隔离；审计可查"),
        ("Phase 4", "10 周", "SaaS 计费（RM50/年）、onboarding、模板市场、API、SLA", "商业化", "10 个租户；计费/试用/限额"),
    ]
    table(doc, ["阶段", "工期", "范围", "交付", "验收"], rows, [1.6, 1.4, 6.4, 3.4, 4.2], font_size=7.8, align=['l','c','l','l','l'])

    h2(doc, "13.2", "工作量与团队")
    rows = [
        ("产品/领域", "你 + 1 名 analyst", "定义字段、口径、验收；提供真实单据", "全程"),
        ("全栈", "2 名", "前端/后端/数据库/报表", "Phase 0–4"),
        ("设计/QA", "0.5 + 0.5", "交互、视觉、回归测试", "Phase 1–4"),
        ("法律/税务", "兼职", "费率、RPGT、SST、条款", "Phase 0/2"),
    ]
    table(doc, ["角色", "人数", "职责", "阶段"], rows, [3.0, 3.2, 8.4, 2.4], font_size=8.4)
    para(doc, "总量约 55–65 人周；按 2.5 FTE 并行，约 5–6 个月完成 Phase 1–3。Phase 0 可以独立先做，2 周内给你一个能跑的验证器。", size=9.8)

    h2(doc, "13.3", "验收测试：4 个案例 + 12 个边界（21 项）")
    rows = [
        ("T01", "S&P 律师费 1.6M", "17,250", "±0.01"),
        ("T02", "S&P 印花税 1.6M", "48,000", "±0.01"),
        ("T03", "贷款律师费 765k", "8,900", "±0.01"),
        ("T04", "贷款印花税 765k", "3,825", "±0.01"),
        ("T05", "Case C 初始现金", "19,269.92", "±0.01"),
        ("T06", "Case C 净利润", "48,040.26", "±0.01"),
        ("T07", "Case D 初始现金", "152,422.24", "±0.01"),
        ("T08", "Case D 净利润", "36,507.76", "±0.01"),
        ("T09", "Case B 净利润", "8,016.04", "±0.01"),
        ("T10", "定金只算一次（800k/720k/16k）", "尾款 64,000", "±0.01"),
        ("T11", "月供 720k/4.5%/30y", "3,648.13", "±0.01"),
        ("T12", "24 个月余额", "696,235.93", "±0.01"),
        ("T13", "利率 4.8% 后月供（336 期）", "3,771.08", "±0.01"),
        ("T14", "XIRR Case C（假设日期）", "约 120.3%", "±0.1pp"),
        ("T15", "RPGT 30%（850k − 735k − 49,269.92）", "19,719.02", "±0.01"),
        ("T16", "缺失租金 → KPI 状态", "partial，不是 0", "—"),
        ("T17", "0% 利率、10 年、120k", "月供 1,000", "±0.01"),
        ("T18", "第 12 个月额外还本 10k", "余额减少 10k；未来利息下降", "±0.01"),
        ("T19", "retention 3% vs RPGT payable 10k", "refund = 25,500 − 10,000", "±0.01"),
        ("T20", "三层店屋，2F 免租 1 个月", "有效租金 = 合同租金 − 1 个月", "±0.01"),
        ("T21", "等额本息 720k/4.5%/30y，第 60 个月余额", "656,337.29", "±0.01"),
    ]
    table(doc, ["#", "测试", "期望", "容差"], rows, [1.2, 9.6, 4.0, 2.2], font_size=8.0, align=['c','l','r','c'])
    caption(doc, "T15 只是示例；实际 RPGT 还要看持有期、豁免、可扣除成本。")

    h2(doc, "13.4", "Definition of Done")
    for body in [
        "金额全链路 Decimal，无 float；数据库 NUMERIC(18,2)。",
        "每个 KPI 有单元测试 + 案例回归；误差在容差内。",
        "现金流、P&L、资产负债表三表勾稽；差异为 0 才能发布。",
        "4 个案例 + 21 个测试全部通过；CI 阻断回归。",
        "手机 375px 可用；表单可保存草稿；上传收据。",
        "审计日志、软删除、备份恢复演练完成。",
        "安全评审：权限、签名 URL、PDPA、OWASP Top 10。",
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(body)
        run_font(r, size=9.4)
