# PROJECT.md — 房地产投资分析系统

> **这是项目的“单一上下文文件”。**  
> 后续正式开发、修改、交接，先读这一份；只有需要细节时，再打开 57 页方案或工作簿。  
> 最后更新：2026-10-19 · 版本：v1.1 · 状态：已按你 10/19 的意见定稿（不做分账、1–5 年持有、等额本息、SaaS），等你确认后开工。

---

## 0. 一句话

为 **Andy Lau / EAG 中介** 做一套马来西亚（柔佛新山）房地产**快速计算程序**：把一间房当作**个人买入 → 持有 1–5 年 → 卖出**，自动算**买入总成本、月供（等额本息，和中国银行一样）、逐年租金与贷款余额、卖出总费用、净利润、ROI/XIRR、RPGT**。给买家看“买入成本清单”，给卖家/中介看“卖出赚多少”。

v1 **不做投资人分账、不做电子签、不做 App**：先出 Web 快速计算器，自己用 → 团队内测 → 无 bug 再推广成 SaaS（RM50/年）。当前交付的是**需求分析 + 开发方案 v1.1 + 可验证的公式工作簿**；你确认方案后，第一步是 Phase 0（2 周的公式引擎）。

---

## 1. 当前状态

| 阶段 | 状态 | 产出 |
| :--- | :--- | :--- |
| 需求分析 | ✅ 完成 | 4 个 Excel 案例逐行拆解；两份 PDF 费率反算；10 部分需求评审 |
| 需求确认 | ✅ 已并入 v1.1 | 10/19 意见：不做分账、1–5 年持有、等额本息、SaaS RM50/年、单一买家律师费 |
| 方案 | ✅ 完成（v1.1） | DOCX/PDF/MD：数据模型、计算引擎、界面、架构、路线图、21 项验收 |
| 公式验证 | ✅ 完成 | XLSX：法定费用、4 案例对账、贷款摊销、XIRR、KPI 定义 |
| Phase 0 | ✅ 已完成 | **正式站：<https://kwongthye.com/>**（阿里云吉隆坡 47.254.235.22，`/srv/fangchan/web/`，Let's Encrypt HTTPS 自动续期）；旧站 <https://laoyeshu.cn/static/fangchan/> 保留作备份；`web/test.js` 48 项测试全过 |
| Phase 1–4 | ⏳ 未开始 | Web 快速计算器（自己用）→ 团队内测 → SaaS（RM50/年） |

**下一步：你打开 `web/index.html` 试用（双击即可）；确认体验后补 4 案例 fixture 与 21 项测试，再进 Phase 1 Web 化。**

---

## 2. 文件地图

### 2.1 正式交付物（可直接分享）

| 路径 | 内容 | 是否生成 |
| :--- | :--- | :--- |
| `deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.docx` | 完整方案（v1.1 定稿） | 生成物 |
| `deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.pdf` | 同上 PDF 分享版 | 生成物 |
| `deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.md` | 同上 Markdown 版（60 张表） | 生成物 |
| `deliverables/投资系统_公式验证与案例对账_v1.1.xlsx` | 可改输入的公式验证器（10 个 sheet） | 生成物 |
| `deliverables/投资系统_公式验证与案例对账_v1.1.md` | 工作簿的文字版（公式/对账/fixture） | 手工维护 |
| `deliverables/README.md` | 交付物说明与阅读顺序 | 手工维护 |
| `deliverables/assets/` | 架构图、ERD（Markdown 引用） | 生成物 |

### 2.2 源文件（真正要改的地方）

| 路径 | 作用 |
| :--- | :--- |
| `work/sec0.py` … `work/sec7.py` | 全部正文内容（按章节拆分）；**改文案/表格/公式说明改这里** |
| `work/doc_lib.py` | DOCX 样式：标题、表格、callout、代码块、页眉页脚 |
| `work/md_lib.py` | Markdown 渲染器：同一套内容输出 GFM |
| `work/build_docx.py` | 组装 DOCX → `work/full.docx` |
| `work/build_md.py` | 组装 Markdown → `deliverables/*.md` |
| `work/build_xlsx.py` | 生成公式工作簿 → `work/validation.xlsx` |
| `work/build_all.sh` | **一键重建全部**（图表 → DOCX → PDF → MD → XLSX → 复制） |
| `work/engine.py` | 计算引擎原型：法定费用、摊销、XIRR、4 案例现金流、1–5 年投影 |
| `web/index.html` | **企业官网**（v0.39，双语单页：关于/业务/科技/创办人/联系，SEO + JSON-LD） |
| `web/calc/index.html` | 自动计算系统（3 个 Part），部署在 `/calc/` |
| `web/calc/calc.js` | 核心公式库：等额本息/法定费用/RPGT/逐年投影/XIRR/分享编解码 |
| `web/test.js` | 53 项回归（`node web/test.js`，必须全过） |
| `work/make_arch2.py` / `work/make_erd.py` | 生成架构图 / ERD |
| `work/full.docx` / `work/full.pdf` | 构建中间物 |
| `work/validation.xlsx` / `work/validation_calc.xlsx` | 构建中间物；后者是 LibreOffice 重算后的版本 |

> **不要直接改 `deliverables/` 里的 DOCX/PDF/XLSX。** 它们是生成物；改 `work/sec*.py` 后运行 `work/build_all.sh`。

---

## 3. 一键重建

```bash
cd "/Users/huangminming/Pik kwong Lau"
bash work/build_all.sh
```

脚本会依次做 7 步：

1. 生成两张图（`work/diagrams/architecture.png`、`erd.png`）
2. 组装 DOCX
3. DOCX → PDF（LibreOffice Kit）
4. 组装 Markdown（并复制图片到 `deliverables/assets/`）
5. 生成 XLSX
6. LibreOffice 重算 XLSX（写入缓存值）
7. 复制 DOCX/PDF/XLSX 到 `deliverables/`

**如果环境路径变了**，只改 `work/build_all.sh` 顶部的 `PY` / `NODE` / `CLI` 三个变量。

---

## 4. 五个不能再重新推导的结论

1. **定金只算一次。**  
   尾款 = 价格 − 定金 − 贷款；交割现金流 = 贷款 + 回扣 − 尾款 − 交割费用。  
   Case C/D 都把定金算了两次，ROI 因此偏差 15–60 个百分点。

2. **贷款只有一个真相。**  
   月供、利息、本金、余额、赎回必须来自同一张摊销表；银行 settlement 优先。  
   Case B 用 28,349 作本金，但赎回余额反推只有 23,438；Case D 差 180。

3. **ROI 至少两个分母。**  
   总成本 ROI 与现金 ROI 同时显示，再加 XIRR。  
   Case A：13.6% vs 158.7%；Case C：6.1% vs 176.2%。

4. **法定费用可以自动算，报价总额不能硬抄。**  
   S&P 1.6M：律师费 17,250 + 印花税 48,000 = 65,250；报价总额 77,487；差额 12,237 是 SST/贷款 stamping/律所杂费，报价单没有拆。

5. **第一页用你定的 3 个 Part：买入一次性 → 年度费用 → 年度利润。**  
   Part 1：价格/贷款/利率手填，两个律师费自动；Part 2：年度费用全部手填，只有每月银行利息自动；Part 3：只填租金一年 + 预算卖价（+持有年限）→ 利润与年利率自动。手填不到 15 个字段，律师费、印花税、月供、利息、卖出律师费、RPGT、赎回余额全部自动算；Holding/Other/RPGT 保留展开。

6. **v1 是个人买卖：不做投资人分账，持有 1–5 年逐年预测，贷款默认等额本息（和中国银行一样）。**  
   分账与出资脱钩（Case A 的 50/50）是真实发现，但 v1 范围已确认排除。预测利润 = 卖出净收入 −（买入总成本 + 持有净支出），持有年限可选 1/2/3/4/5 年，逐年看租金累计、贷款余额、RPGT、净利润。

---

## 5. 4 个案例的 canonical 数字

ROI 口径与 Excel 一致：**净利润 ÷ 现金投入（Cash-on-Cash）**。

| 案例 | 持有月 | Excel ROI | 复核 ROI | Excel 净利润 | 复核净利润 | 初始现金 |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: |
| A Austin Perdana | 17 | 156.32% | 158.71%* | 187,419.34 | 190,285.21* | 119,895.58 |
| B Profit Calculator (L.T) | 25–27 | 9.11% | 4.56% | 16,472.76 | 8,016.04 | 152,422.24 |
| C Loan Cashback | 13 | 114.46% | 176.17% | 48,040.26 | 48,040.26 | 33,969.92 → 19,269.92 |
| D Loan Downpay | 23 | 18.66% | 20.23% | 36,687.76 | 36,507.76 | 168,422.24 → 152,422.24 |

\* Case A 为部分复核：SPA 1.60M vs 实价 1.25M 的 350,000 差额、赎回 1,296,950 > 贷款 1,280,000、RPGT 30,000 的性质，都缺 completion statement/settlement 才能定案。

**关键差异：**

- **B**：Excel 的 gross profit 漏了 3,545.45 出售税；本金 28,349 与赎回余额反推的 23,437.73 差 4,911.27。
- **C**：D16 = 735,000 − 765,000 = −30,000，没有扣定金；D18 又加 14,700。真实初始现金 19,269.92。
- **D**：D17 = 800,000 − 720,000 = 80,000，D19 又加定金 16,000。真实初始现金 152,422.24。
- **A**：预收租金 2,865.87 是负债，不应扣利润；复核净利润 190,285.21。

完整逐行解释见方案第 2 章；数值见 `deliverables/投资系统_公式验证与案例对账_v1.0.xlsx`。

---

## 6. 法定费用公式（程序师可直接实现）

```text
S&P legal fee(P) =
    1.25% × min(P, 500,000)
  + 1.00% × min(max(P − 500,000, 0), 7,000,000)
  + 1.00% × max(P − 7,500,000, 0)

S&P stamp duty(P) =
    1% × min(P, 100,000)
  + 2% × min(max(P − 100,000, 0), 400,000)
  + 3% × min(max(P − 500,000, 0), 500,000)
  + 4% × max(P − 1,000,000, 0)

SPA 杂费(P) = 3,600 + 0.4% × P
   （老板 10/19 规则：100k→4,000；200k→4,400；300k→4,800；每多 100k +400）

Loan legal fee = 同一张 S&P 费率表，按 loan amount 计算
Loan stamp duty = 0.5% × loan amount
Loan 杂费(L) = 3,800 + 0.2% × L
   （老板 10/19 规则：100k→4,000；200k→4,200；300k→4,400；每多 100k +200）
估价费(P) = 0.2% × P + 500（SPA × 0.2% + 500 杂费）
SST = 8% × legal fee（2024-03-01 起从 6% 上调；agent commission 同样 8%；历史报价按 6% 保留）

SPA 律师费合计  = S&P legal + S&P stamp duty + SPA 杂费 + 8%×S&P legal
LA 律师费合计   = Loan legal + Loan stamp duty + Loan 杂费 + 8%×Loan legal
```

**示例（SPA 1.6M）：** 17,250 + 48,000 + 10,000 + 1,380 = **76,630**（此前未含杂费为 66,630）。
**示例（贷款 765k）：** 8,900 + 3,825 + 5,330 + 712 = **18,767**。

**报价单对账（重要）：**

| 价格 | 法定两项 | 报价 Total 1 | 差额 |
| ---: | ---: | ---: | ---: |
| 500,000 | 15,250 | 21,107 | 5,857 |
| 1,000,000 | 35,250 | 44,007 | 8,757 |
| 1,600,000 | 65,250 | 77,487 | 12,237 |
| 2,000,000 | 85,250 | 99,807 | 14,557 |

差额随价格上升，但不是纯百分比：它是 SST + 贷款 stamping + 律所 disbursement 的混合，报价单没有拆分。**系统不要把 Total 当成一个数直接存。**

---

## 7. 计算顺序（10 步，不能反）

1. 校验与归一：日期、金额、单位；`null` 标 Unknown，不当 0。
2. 购买结算：定金、尾款、贷款、费用、cashback → `completion_cash`。
3. 贷款摊销：drawdown、rate periods、installment、extra payment → schedule。
4. 租金 schedule：unit、tenancy、免租、递增、空置 → 月度有效租金。
5. 持有成本：月/季/年/一次性 → 月度等值与实际现金流。
6. 出售结算：售价、赎回、费用、RPGT、押金/预收 → `net_sale`。
7. 过账：所有事件写入 Ledger（日期、方向、金额、账户）。
8. 三张报表：现金流、P&L、资产负债表。
9. 指标：ROI、CoC、Annualized、CAGR、XIRR、Yield、Break-even、DSCR。
10. 持有 1–5 年投影：逐年租金累计、贷款余额递减、RPGT 按年分档 → 每年净利润。

**第一页的 3 个 Part（你定的结构，Simple Mode 就按这个顺序排）：**

1. **Part 1 · 买入（第一次要出的费用）**：SPA 价、实际买价、贷款额、利率（年限默认 30 年可改）→ 月供自动；SPA 律师费（自动跟 SPA 价）、Loan Agreement 律师费（自动跟贷款额）；agent fee、consent fee、其他费用（手填）→ **Total Acquisition Costs 总购置费用**（5 项费用相加）→ **Down Payment 首付款** → **Less: Cashback** → **Total Upfront Cash Required 购房所需现金总额**。
2. **Part 2 · Annual Holding Costs（每年持有费用，全部自己填，只有一个自动）**：管理费、地税、门牌税、装修/维修、**出租中介费（手填 RM/年）**；每月银行利息（自动，平均口径）；展开里：保险（手填可选）→ 每年总费用（自动）。卖出中介费 %、卖出律师费、RPGT 归 Part 3 ②。
3. **Part 3 · Investment Returns（投资回报分析）**：
   - ① Keep & Rent 持有出租回报：Annual Rental Income 年租金收入（手填）→ Annual Rental Profit 年租金净利润 = 租金 − 年度费用（含利息）→ **Annual Rental Return 年租金回报率 = 年租金净利润 ÷ 购房所需现金总额** → **Total Rental Profit 总年租金净利润 = 年租金净利润 × 年数**（自动）。
   - ② Sell Property 出售房产回报：Expected Selling Price、Holding Period、Agent Fee（金额格：默认 = 卖价 × 2%，可改金额）、Legal Fee（默认 5,000，可改）、Selling Miscellaneous Expenses（手填）；**RPGT 行放在售出杂费下面**，公式 = MAX(0, 卖价 − 实价 − 总购置费用 − 卖出中介费 − 卖出律师费 − 售出杂费) × 年限税率（≤3年 30% / 4年 20% / 5年 15% / 6年起 0%）；Less (扣除)：Actual Purchase Price、Total Acquisition Costs → **Gross Capital Gain = 卖价 − 实价 − 总购置费用** → **Total Selling Costs = Agent Fee + Legal Fee + 杂费 + RPGT** → **Selling Profit = Gross Capital Gain − Total Selling Costs** → **Selling Return = Selling Profit ÷ 购房现金 ÷ 年数**；再往下：**Net Investment Profit = Total Rental Profit + Selling Profit**、**Total ROI = 投资净利润 ÷ 购房现金 ÷ 年数**、**Total Cost = 实价 + 购置费用 + 出售总费用**、**Return on Total Cost = 投资净利润 ÷ Total Cost ÷ 年数**（原「完整口径」整块已删）。

**核心公式：**

```text
completion_cash = loan + rebate − (price − deposit) − costs_at_completion
initial_cash    = deposit + costs_before + max(0, −completion_cash)
cashback        = max(0, completion_cash)

net_sale = price − redemption − selling_costs − rpgt_retention
           − deposit_refund − advance_rent_refund + apportionment

net_profit = net_sale + cumulative_net_cash − total_cash_invested
total_roi  = net_profit / total_project_cost
coc        = net_profit / total_cash_invested
xirr       = solve Σ CF_t/(1+r)^(days/365) = 0

# 快速口径（老板口径，结果置顶显示）
gross_profit  = 卖价 − (实价 + 全部买入费用)
annual_profit = gross_profit / 自己现金 / 持有年数
# 例：SPA 1M / 实价 800k / 贷 800k / 费用 50,140 → 一年后卖 900k
# 净赚 49,860；年利润 = 49,860 / 50,140 / 1 ≈ 99.4%

# 等额本息（默认，和中国银行一样）
r = annual/12; pmt = P*r/(1-(1+r)^-n)
interest_m = balance_m * r; principal_m = pmt - interest_m

# 持有 y 年（y ∈ 1..5）
balance_y    = 摊销到第 12y 个月的余额
rent_y       = Σ 租金_y（含空置/递增）
net_profit_y = 卖价_y − balance_y − 卖出费用_y − RPGT_y
             + (rent_y − 供款_y − 持有费_y) − 买入总成本 − 首付/交割现金
RPGT_y = 30%（≤3 年）/ 20%（第 4 年）/ 15%（第 5 年）/ 0%（6 年+；个人，以 LHDN 为准）
```

---

## 8. 数据模型（16 个实体；v1 不含投资人）

| 实体 | 作用 | 关键关系 |
| :--- | :--- | :--- |
| Property | 物业资产 | 1:N Deal |
| Deal | 一次交易（买/持有/卖） | N:1 Property |
| Purchase | 购买结算（SPA/实价/定金/尾款） | 1:1 Deal |
| Sale | 出售结算（售价/费用/RPGT） | 1:1 Deal |
| Loan | 贷款（批准/发放/利率/年限） | N:1 Deal |
| RatePeriod | 利率段（生效日/基准/spread） | N:1 Loan |
| Drawdown | 放款（日期/金额/收款人） | N:1 Loan |
| CostItem | 成本项（类别/金额/Est-Actual/谁付） | N:1 Deal |
| Payment | 付款（日期/付款人/收款人/收据） | N:1 Deal/CostItem |
| Unit | 单位（楼层/面积/租金/状态） | N:1 Deal |
| Tenancy | 租约（起止/租金/押金/免租/递增） | N:1 Unit |
| HoldingCost | 持有费（类别/金额/频率/可回收） | N:1 Deal |
| Scenario | 情景（假设集/版本/类型） | N:1 Deal |
| Projection | 持有预测（年限 1–5/租金/空置/增长/卖价/RPGT 档） | N:1 Deal |
| Document | 附件（类型/URL/SHA-256） | N:1 Deal/CostItem |
| LedgerEntry | 账本（日期/方向/金额/账户/类别） | N:1 Deal |

> **v1 移除：** Investor / CapitalTxn / Distribution（投资人分账）。将来要恢复时，按 v1.0 第 9 章的资本账户模型加回来即可。

**字段级 8 个标签（每个金额都要有）：**  
`amount`、`currency`、`estimate_actual`、`event_date`、`paid_status`、`payer/payee`、`source`、`document_id`。

---

## 9. 已拍板的设计决定

1. **Property 与 Deal 分开**：同一物业可以有多笔交易（买入、refinance、出售）。
2. **Actual / Estimate / Scenario 三层分离**：Scenario 只覆盖未来，不改历史。
3. **事件账本不可变**：已过账不改，错了冲销（reversal）再记一笔。
4. **贷款只有一个真相**：摊销表 + 银行 settlement；任何手填余额都要做差异检查。
5. **金额 Decimal、日期 DATE**：不用 float；日期存 DATE（Asia/Kuala_Lumpur）。
6. **每个 KPI 可下钻**：公式、输入、日期、单据；不能只显示一个百分比。
7. **Agent commission 与投资回报分开**：佣金单独实体，不进投资 P&L。
8. **RPGT 只做估算 + retention 跟踪**：最终由税务师/LHDN 确认；retention 不是永久费用。
9. **第一页 3 个 Part + 展开**：买入一次性 / 年度费用 / 年度利润；Holding Expenses、Other Costs、RPGT 保留展开。
10. **Simple / Advanced 共用一套数据**：只是视图不同，不复制 Deal。
11. **v1 不做投资人分账**：个人买入 → 持有 → 卖出；两用（给买家看买入成本清单 + 给卖家/中介看卖出利润）。
12. **持有年限可选 1/2/3/4/5 年**：逐年显示租金累计、贷款余额、RPGT、净利润；期间租金收入与银行供期递减都自动算。
13. **贷款默认等额本息（和中国银行一样）**：月供固定，月利率 = 年利率/12，利息按剩余本金计；daily rest 作后续可选。
14. **律师费按单一买家预测**：SPA 与 Loan Agreement 分开算；律所的打印/transport/杂费算不到，只能预测；两人买家后续版本再加。
15. **电子签不做；App 先不做**：先 Web（手机可用），部署你自己的深圳服务器（速度已验证 OK），最后才打包上架。
16. **SaaS 目标 RM50/年**：先自己用 → 团队内测 → 无 bug 再推广；EAG 18k 中介是起步盘。
17. **AI 助理后期接入**：把行业思维/知识接进 ChatGPT/个人助理，作为增值功能。
18. **核心体验是“快”**：最短输入、最快出利润；深度账本与数据分析放后期。
19. **计算页 = 3 个 Part**（见第 7 节）：买入一次性 → 年度费用 → 年度利润；SST 统一 8%（2024-03-01 起）。

---

## 10. 待确认问题（10/19 已确认大部分）

| # | 问题 | 状态（10/19） |
| :---: | :--- | :--- |
| 1 | 给谁用 | ✅ 已确认：先自己 → 团队内测 → 无 bug 再推广 SaaS（RM50/年） |
| 2 | 平台 | ✅ 已确认：先 Web（手机可用），部署自己的深圳服务器；App 最后打包上架 |
| 3 | 账本深度 | ✅ 已确认：快速计算优先；轻账本（日期/方向/付款人/收款人/单据） |
| 4 | 贷款利息模式 | ✅ 已确认：默认等额本息（和中国银行一样）；daily rest 后续可选 |
| 5 | 律师费买家人数 | ✅ 已确认：v1 只算单一买家；两人买家后续加 |
| 6 | 投资人分账 | ✅ 已确认：v1 不做 |
| 7 | 电子签 | ✅ 已确认：暂不做 |
| 8 | 持有年限 | ✅ 已确认：1/2/3/4/5 年可选，逐年预测 |
| 9 | 明天要拍板的 | ① 认可 v1.1 方案 → 开工 Phase 0；② 4 个案例继续做回归基准；③ 语言 EN+中文；④ RPGT 只做估算；⑤ 银行数据以结算单为准、系统摊销做预测 |

其余（历史数据、预算、法律复核）见方案第 15 章。

---

## 11. 修改指南

| 想改什么 | 改哪里 | 之后 |
| :--- | :--- | :--- |
| 文案、章节、表格 | `work/sec0.py` … `work/sec7.py` | `bash work/build_all.sh` |
| DOCX 样式（标题/表格/callout） | `work/doc_lib.py` | 重建 DOCX/PDF |
| Markdown 样式 | `work/md_lib.py` | 重建 MD |
| 公式/算法 | `work/engine.py` + `work/build_xlsx.py` + `sec3`/`sec5` | 重建 XLSX + 文档 |
| 案例数字 | `work/sec1.py`、`work/sec7.py`、`work/build_xlsx.py` | 重建全部 |
| 架构图 / ERD | `work/make_arch2.py` / `work/make_erd.py` | 重建全部 |
| 新增章节 | 新建 `work/sec8.py`，加入 `build_docx.py` 和 `build_md.py` 的 import 列表 | 重建全部 |

**约定：**

- 金额用 `Decimal` / `NUMERIC(18,2)`，不要 float。
- 日期用 `DATE`，不要 timestamp；IRR 用实际天数/365。
- 中文正文 + 英文字段名；字段名不要翻译成中文，避免程序师对不上。
- 任何数字都要能回答：哪张表、哪一行、哪一天、谁付的。
- 修改 canonical 数字时，同步更新：`sec1`、`sec7` 附录 D、`build_xlsx.py`、本文件第 5 节。
- 生成物不要手改；改源后重建。

**回归检查（每次重建后）：**

1. PDF 页数 = 57（如果新增内容会变，属正常）。
2. MD 行数约 1,790；表格/代码块数量不应无故减少（第 9 章已改为“持有 1–5 年预测”，第 11.2 节为 3 个 Part 第一页）。
3. XLSX `Summary` 四行数字与本文件第 5 节一致。
4. 方案第 13.3 节的 21 项测试全部能对上（T21 = 等额本息第 60 个月余额 656,337.29；`work/engine.py` 的 `project_holding()` 已实现）。

---

## 12. 下一步（Phase 0）

**目标：2 周内交付一个能跑的公式引擎，不碰 UI。**

- [ ] 用 TypeScript/Python 实现第 6 节法定费用 + 第 7 节 10 步计算（含等额本息 + 1–5 年投影 + RPGT 按年分档）。
- [ ] 把 4 个案例做成 fixture；误差 < RM1；XIRR 误差 < 0.1pp；21 项测试（T21 = 等额本息第 60 个月余额 656,337.29）。
- [ ] 做一个 CLI/Excel 输入输出：价格、贷款、租金、持有年限（1–5）、卖价 → 8 个 KPI + 逐年表。
- [ ] 用真实单据校准 Case A：1 份 SPA、1 份贷款 settlement、1 份 completion statement。
- [ ] 输出一份 2 页的 Phase 0 验收报告。

**Phase 0 通过后：** 开工 Phase 1（Web 快速计算器，你先自己用），再团队内测，最后 Phase 4 上 SaaS 计费（RM50/年）。

---

## 13. 变更记录

| 日期 | 版本 | 变更 |
| :--- | :--- | :--- |
| 2026-10-18 | v1.0 | 初始分析：4 个 Excel 案例、两份 PDF 费率、57 页方案、XLSX 验证、MD 版本、一键构建脚本 |
| 2026-10-19 | v1.1 | 按确认意见定稿：不做投资人分账；持有 1–5 年预测；默认等额本息；两用（买家成本 + 卖出利润）；SaaS RM50/年（自己→团队→推广）；单一买家律师费；电子签/App 后置；AI 助理后期 |
| 2026-10-19 | v1.1 补 | SST 全部改为 8%（2024-03-01 起）；计算页改为 3 个 Part：买入一次性 → 年度费用 → 年度利润 |
| 2026-10-19 | v0.1 | 自动计算系统雏形：`web/index.html`（3 个 Part、手填黄/自动蓝）+ `web/calc.js` 公式 + `web/test.js` 10 项测试全过；浏览器实测 demo 输出正确 |
| 2026-10-19 | v0.1.1 | 加入老板口径年利润（净赚 ÷ 自己现金 ÷ 年数，置顶显示），与“扣所有费用”完整口径并排；test.js 扩到 13 项 |
| 2026-10-19 | 部署 | 上线阿里云深圳服务器（39.108.108.84，与点餐系统同机）：https://laoyeshu.cn/static/fangchan/ ；更新方式 = scp `web/index.html`+`calc.js` → `/opt/laoyeshu/static/fangchan/`，chmod 644 |
| 2026-10-19 | v0.2 | 中/英一键切换：右上角按钮，全部文案在 `web/index.html` 的 I18N 字典（zh/en），偏好存 localStorage；数字计算不变 |
| 2026-10-19 | v0.3 | SPA 律师费加「杂费」：3,600 + 0.4%×价格（100k→4,000，每多 100k +400）；SPA 合计 = 律师费 + 印花税 + 杂费 + 8% SST；test.js 扩到 18 项 |
| 2026-10-19 | v0.4 | LA 律师费同样加「杂费」：3,800 + 0.2%×贷款（100k→4,000，每多 100k +200）；test.js 扩到 23 项 |
| 2026-10-19 | v0.5 | Part 1 加估价费（放 LA 下面）：SPA × 0.2% + 500 杂费，计入 Total 第一次要出的费用；test.js 扩到 25 项 |
| 2026-10-19 | v0.6 | Part 3 拆成两个视角：①持续持有（出租利润 = 租金−年度费用含利息 ÷ 自己现金，置顶）②卖出去；test.js 扩到 27 项 |
| 2026-10-19 | 运维 | 服务器 nginx 为 `/static/fangchan/` 单独加 no-cache 规则（原 /static/ 有 7 天缓存导致手机不更新）；改的是 `/etc/nginx/sites-available/laoyeshu`（已备份 .bak-fangchan-20261019），nginx -t 通过并 reload；以后更新无需强刷 |
| 2026-10-19 | v0.7 | 贷款数额旁加「贷款 %」小格：% × SPA 自动算出贷款额（如 80% → 800,000）；也可直接在贷款格手填（手填自动清掉 %）；SPA 变动时按 % 联动 |
| 2026-10-19 | v0.8 | 所有输入格不再预填数字：年利率/卖出中介费清空，贷款年限与持有年限默认「—」；年利率必填（为空时清空结果）；持有年限未选时②卖出输出显示「—」并提示；清空按钮清掉所有结果 |
| 2026-10-19 | v0.9 | 贷款年限改为自由填写（数字格，1–50 年，不限制 20/25/30/35）；为空时结果清空（必填） |
| 2026-10-19 | v0.10 | 持有年限同样改为自由填写（数字格，1–30 年）；超 5 年 RPGT 自动按 0% 档；27 项测试保持全过 |
| 2026-10-19 | v0.11 | Part 2 利息改为**平均口径**（老板算法）：年利息 = 贷款 × 年利率，月均 = ÷12（100 万 × 4% = 40,000/年 → 3,333.33/月）；①持有与逐年表同步用平均口径；贷款余额仍按等额本息摊销；test.js 扩到 28 项 |
| 2026-10-19 | v0.12 | SPA 律师费 / LA 律师费 / 估价费支持**手动覆盖**：默认自动，改格子里的数字即覆盖（变橙色、计入总费用），清空恢复自动；test.js 扩到 29 项 |
| 2026-10-19 | v0.13 | 金额输入全部改西式格式 **500,000.00**：输入实时加千分位、失焦补两位小数；输出与自动格同步格式化；% / 年限保持纯数字 |
| 2026-10-19 | v0.14 | 页头放上 logo（桌面 备案证件/logo11.jpg → `web/logo.jpg`，923×410 显示 30px 高），与页面同目录部署 |
| 2026-10-19 | v0.15 | 导出/分享：打印 PDF（Part 1 一页、Part 2+3 一页，@media print 排版 + 打印页头带 logo/日期）；一键分享 WhatsApp / 微信（复制文字+提示）/ Facebook |
| 2026-10-19 | v0.16 | Part 1 输出按 Excel 格式重排：Total Acquisition Costs 总购置费用（SPA/LA 律师费 + 估价费 + 中介费 + 其他）→ Down Payment 首付款 → Less: Cashback → Total Upfront Cash Required 购房所需现金总额；test.js 扩到 31 项 |
| 2026-10-19 | v0.17 | Cashback 行显示为负数（如 −RM 30,000.00），购房现金总额 = 总购置费用 + 首付款 +（负数 cashback） |
| 2026-10-19 | v0.18 | Part 2 改名 Annual Holding Costs（每年持有费用）；「卖出中介费 %」改为「出租中介费（每年 RM，手填）」并计入年度费用；卖出中介费 % 移到 Part 3 ②；test.js 扩到 33 项 |
| 2026-10-19 | v0.19 | Part 3 改名 Investment Returns（投资回报分析）：① Keep & Rent（Annual Rental Income / Annual Rental Profit / Annual Rental Return）② Sell Property（Expected Selling Price / Holding Period / Selling Agent Fee） |
| 2026-10-19 | v0.20 | Part 3 ① 增加 Total Rental Profit 总年租金净利润 = 年租金净利润 × 年数；test.js 扩到 34 项 |
| 2026-10-19 | v0.21 | Part 3 ② 重排：Total Upfront Cash Required → Expected Selling Price → Holding Period → Less（Actual Purchase Price、Total Acquisition Costs）→ Gross Capital Gain = 卖价 − 实际成交价 − 总购置费用 |
| 2026-10-19 | v0.22 | ② 卖出费用重排：Agent Fee（默认 2%）+ Legal Fee（手填）+ 售出杂费（手填）+ RPGT = Total Selling Costs；Selling Profit = 资本收益 − 出售总费用；Selling Return = 出售利润 ÷ 现金 ÷ 年数；test.js 扩到 37 项 |
| 2026-10-19 | v0.23 | Part 3 底部加投资总账：Net Investment Profit（①+②）、Total ROI、Total Cost（实价+购置+出售费用）、Return on Total Cost；test.js 扩到 41 项 |
| 2026-10-19 | v0.24 | Part 1 标签改名：估价费 → Property Valuation Fee 房产估价费；其他费用 → Other Expenses 其他杂费 |
| 2026-10-19 | v0.25 | 修 bug：持有年限填 0 时 `parseInt||5` 兜底导致 Total Rental Profit 被乘 5（如 1,576→7,880）；现在 <1 视为未选（显示「—」），compute 内部按 1 年防崩；顺带修 recalc 里 t 变量遮蔽翻译函数的报错；test.js 扩到 43 项 |
| 2026-10-19 | v0.26 | 卖出中介费改为**金额格**：默认自动 = 卖价 × 2%（蓝底），手改变橙色按你的金额算，清空恢复自动；test.js 扩到 46 项 |
| 2026-10-19 | v0.27 | Legal Fee 律师费改为**默认 RM 5,000** 的金额格（蓝底自动），手改变橙色按你的金额算，清空恢复 5,000 |
| 2026-10-19 | v0.28 | ② 结果区首行改为 Expected Selling Price（去掉 Total Upfront Cash Required）；金额列同一行对齐（baseline + nowrap）；加 3 条分割线；完整口径「总成本回报率」分母改为 Total Cost（含出售费用）；test.js 扩到 48 项 |
| 2026-10-19 | v0.29 | 去掉 Total Cost 后多余的那条分割线（保留 2 条：Selling Return 后、完整口径块前） |
| 2026-10-19 | v0.30 | 完整口径改名：扣掉所有费用后的净利润 → **Net Cash Profit 现金净利润（完整口径）**；总成本回报率 → **Net Cash Return on Capital 现金总成本回报率** |
| 2026-10-19 | v0.31 | 自动格（SPA/LA 律师费、估价费、卖出中介费、卖出律师费）编辑体验重做：输入过程中不回填（可自由删改、边改边算），离开时仍为空才恢复自动值；手动改过则保持橙色覆盖 |
| 2026-10-19 | v0.32 | RPGT 改老板口径：(卖价 − 实价 − 总购置费用 − 卖出中介费 − 卖出律师费 − 售出杂费) × 年限税率（30/20/15/0），不再用法定豁免；RPGT 行移到售出杂费下方；删「Selling related cost」标题与整个完整口径块（Net Cash Profit → XIRR）；test.js 保持 48 项 |
| 2026-10-19 | 版本管理 | 初始化 git 仓库并推送到 GitHub 私有仓库 `jamesyew1314/Property-nvestment-calculator`；标签 v0.32 |
| 2026-10-24 | 部署 | 正式迁移到阿里云**吉隆坡**服务器 47.254.235.22：域名 **kwongthye.com**（+ www），Let's Encrypt HTTPS 自动续期，HTTP 301 跳 HTTPS，HSTS 已开；配置：Ubuntu 24.04 / 2C4G / ufw / fail2ban / 自动安全更新 / 2G swap；旧深圳站保留 |
| 2026-10-24 | 域名计划 | 计算器暂放主域名 kwongthye.com；开发完成后迁到 **calc.kwongthye.com**，主域名留作公司主页（迁移步骤见 PLAN_v2 §8.5；注意 localStorage 不跨子域，Phase 1 需带导出/导入） |
| 2026-10-24 | v0.34 | **Phase 1 上线**：方案存档（命名保存/加载/删除/覆盖同名）、导出/导入 JSON、分享链接（`?d=` base64 全参数，只读模式可转编辑，localStorage 持久化）；**Phase 2 上线**：公司抬头（公司名/电话/微信/地址/客户项目 → 打印页头）、分享链接二维码（qrcode.js 本地化）、打印排版压到 2 页（Part 1 一页 / Part 2+3 一页）；test.js 扩到 53 项 |
| 2026-10-24 | v0.35 | **后端地基上线**：Node 22 + PostgreSQL 16 + `fangchan-api.service`（systemd，127.0.0.1:3000）+ nginx `/api/` 反代；数据库 `fangchan` 建好 users/plans/sessions/subscriptions 四表；线上 `https://kwongthye.com/api/health` → ok/db true |
| 2026-10-24 | v0.36 | **账号系统上线**：邮箱+密码注册/登录/注销、scrypt 密码哈希、会话 Cookie（HttpOnly+Secure+SameSite，30 天）、登录限流 5 次/分、Origin 校验；`/api/me` 返回用户+方案数+额度（免费 3 个）；前端「我的账号」卡片；curl 与真实浏览器均验证通过 |
| 2026-10-24 | v0.36.1 | 账号入口收纳：删除页面顶部「我的账号」大卡片，改为右上角「👤 登录 / 邮箱前缀」小按钮 + 弹窗（关掉后不占空间；只读分享页隐藏） |
| 2026-10-24 | v0.36.2 | 方案存档区收纳：整块卡片 → 一行工具条（方案名 + 💾 保存 + 🔗 分享 + ⋯）；方案列表/加载/删除/导出导入/公司抬头移入「⋯」弹窗 |
| 2026-10-24 | v0.36.3 | 公司抬头按马来西亚习惯重做：公司/中介公司、中介姓名、REN 编号、电话/WhatsApp（+60）、电邮、公司地址、客户姓名、项目/楼盘；打印抬头格式 `公司 · 姓名 · REN · WhatsApp 号码 · 电邮`，右侧 `客户 · 项目` + 日期 + 二维码 |
| 2026-10-24 | v0.37 | **云端存档上线**：登录后保存/加载/删除方案走 `/api/plans`（免费 3 个，超额 402）；首次登录自动提示把本机方案上传云端（`/api/plans/import`）；未登录仍是本机存档；掉网自动回退本地；弹窗显示「☁️ 云端存档 / 💾 本机存档」 |
| 2026-10-24 | v0.37.1 | 英文版遗漏修正：右上角登录按钮「Log in」、方案名 placeholder、微信按钮「WeChat」、方案模式/说明文案随语言切换刷新 |
| 2026-10-24 | v0.38 | **订阅上线（手动开通码）**：`redeem_codes` 表；`POST /api/subscription/redeem` 事务核销 + 顺延到期；前端账号弹窗显示「到期日期 · 剩余天数」+ 开通码输入（RM50/年，续费叠加）；`admin.js` 支持 create-code / list-codes / set-plan / stats；**每日 02:15 数据库备份**（pg_dump，保留 30 天，已实测） |
| 2026-10-24 | v0.39 | **企业官网正式上线**：主域名 `/` = 双语企业站（关于/核心业务/科技/创办人/联系 + JSON-LD + robots/sitemap）；计算器迁移到 **`/calc/`**；旧分享链接 `/?d=` 自动 301 到 `/calc/?d=`；手机菜单、WhatsApp 浮动按钮、SEO meta 完成 |
| 2026-10-24 | v0.40 | 创办人版块换成真实形象照（`web/andy-lau.jpg`，7200×10800 原图裁成 3:4 上半身 900×1200），卡片式显示；手机单列自适应 |
| 2026-10-24 | v0.41 | Logo 去白底：`logo.jpg` → 透明 `logo.png`（原色，浅底用）+ `logo-white.png`（深底用，黑字转白）+ `icon-256.png` favicon；企业站页头与计算器页头/打印抬头全部改用 PNG，页头品牌只留 logo（去掉重复文字） |
| 2026-10-25 | v0.43 | Logo 白底彻底清理（重做）：用红色方块边界保护「光泰 / KWONG THYE」白字，删除屋顶内部白三角、灰边条与文字白边；深底版把低饱和深色文字转白，无白框、无灰边 |
| 2026-10-25 | v0.44 | 创办人形象照裁紧：改为 4:5（头到胸口）800×1000，脸部占比更大，白边更少 |
| 2026-10-25 | v0.45 | 企业站补联系方式：办公室（Skudai）、电邮 andylau.theroof@gmail.com、注册代理 THE ROOF REALTY SDN BHD E(1)1605/1、REN 32839，页脚加注册信息行与 JSON-LD address/employee；新增**第一方访问统计**（`/api/track` + `pageviews` 表 + `admin.js pageviews`，IP 仅存 sha256 前缀） |
| 2026-10-25 | v0.45.1 | Google Search Console 验证文件上线：`/googlec72eeacfc6bd6819.html`（HTTP 200，内容校验一致）；sitemap 待提交 |
| 2026-10-25 | v0.46 | **账号可用性**：忘记密码（`/api/auth/forgot`，重置链接 1 小时）、重置页（`?reset=`，重置后踢出所有会话）、修改密码（踢出其它设备）、删除账号（PDPA）；邮件走可插拔发送（未配 Resend 时写 `api/mail.log`，管理员可用 `admin.js reset-link <email>` 生成 24 小时链接）；curl + 浏览器全流程验证 |
| 2026-10-25 | v0.47 | **邮件真发**：阿里云 DirectMail 发信域名验证通过（MX/SPF/DKIM/DMARC），发信地址 `noreply@kwongthye.com`，服务器 SMTP `smtpdm.aliyun.com:465`（nodemailer）；`admin.js mail-test <email>` 测试命令；忘记密码已可真实发送重置邮件（凭据只在服务器 `.env`，不入库） |
| 2026-10-25 | v0.47.1 | 邮件健壮性：SMTP 改连接池（pool/maxConnections 1，避免连续登录被 535 限流）、加 `replyTo=jamesyew1314@gmail.com`、忘记密码发信记日志；测试信两封均送达 Gmail（DirectMail 会拒收 example.com 假地址，属正常反垃圾） |
| 2026-10-25 | v0.48 | **邮箱验证 + 到期提醒**：注册自动发验证邮件（24h，`/calc/?verify=`），账号页显示状态并可重发；企业站 `?reset/?verify` 自动跳 `/calc/`；每日 09:00 检查 Pro 到期（7 天内）发提醒并记 `plan_reminder_at`；`admin.js verify-link` 供人工补发 |
| 2026-10-25 | v0.48.1 | 邮件全部中英双语（验证邮箱 / 重置密码 / Pro 到期与已到期提醒，主题同步双语），实测送达 |
| 2026-10-25 | v0.49 | **隐私政策 + 使用条款**（`/privacy/`、`/terms/`，中英双语、可切换）：覆盖 PDPA 权利、资料类型、阿里云委托处理、保留期限、安全措施；条款含免费 3 个/Pro RM50/年、估算免责、责任限制、马来西亚法律；企业站与计算器页脚加链接，sitemap 收录 |
| 2026-10-25 | v0.49.1 | 隐私政策/使用条款联系邮箱改回 `andylau.theroof@gmail.com`（共 12 处）；系统邮件 Reply-To 仍为 jamesyew1314@gmail.com |
| 2026-10-25 | v0.50 | **联系表单**（企业站 `#enquiry`）：姓名/电话/电邮/项目/留言 + 蜜罐防垃圾，存 `contact_messages` 并邮件发到 `andylau.theroof@gmail.com`（Reply-To 为客户邮箱），`admin.js messages [days]` 查看；接口实测入库+发信成功 |
| 2026-10-25 | v0.50.1 | 修复联系表单无法输入：label 上的 `data-i18n` 在语言切换时会把内部 `<input>/<textarea>` 整个替换掉；改为 `label > span[data-i18n] + input`，浏览器实测可填写并提交成功 |
| 2026-10-25 | v0.50.2 | 联系表单紧凑化：改为「左介绍 + 右表单」两列（0.8/1.2），区块 padding 84→58px、表单 padding 28→20px、输入框更小、留言 4→3 行，手机自动单列 |
| 2026-10-25 | v0.50.3 | 联系表单再压缩：取消独立 `#enquiry` 区块，表单并入「联系我们」右列（替代两张公司卡）；表单 padding 16px、留言 2 行、字段间距 8px，整页高度明显下降 |
| 2026-10-25 | v0.51 | **收据 / 付款记录 / 价格页**：`payments` 表（receipt_no `KT-YYYYMM-0001`，金额、天数、有效期），兑换时事务内生成收据；`GET /api/payments`；账号弹窗「付款记录 / 收据」列表；`/receipt/?id=` 收据页（浏览器打印/另存 PDF，未登录提示）；`/pricing/` 价格页（免费 vs Pro、对比表、FAQ、WhatsApp 购买）；企业站导航与 sitemap 加入价格页 |
| 2026-10-25 | v0.52 | **价格调整**：Pro 改为月付 RM9.90 / 年付 RM99（原 RM50/年）；价格页三卡（免费/月付/年付）+ 4 列对比表 + 年付省 RM19.80 说明，两个购买按钮各带 WhatsApp 预设文案；使用条款、计算器开通说明同步；`admin.js create-code` 默认金额改为 30 天 9.90、365 天 99 |
| 2026-10-25 | v0.53 | **免费版功能收紧**：PDF/打印、WhatsApp/微信/Facebook 分享、复制分享链接、本机存档全部改为 Pro 专属（点击弹「专业版功能」提示并可跳价格页）；免费版仅保留无限计算 + 最多 3 个云端方案；价格页与使用条款同步（免费：不支持 PDF/分享/本机存档） |
| 2026-10-25 | v0.42 | 计算器正式上线：移除页头「v0.1 内测」标签与标题版本号，`<title>` 改为中英双名 + meta description；英文标题追加 | Kwong Thye |

---

## 14. 版本管理（git）

- **私有仓库**：https://github.com/jamesyew1314/Property-Investment-calculator （git 地址 `ssh://git@ssh.github.com:443/jamesyew1314/Property-Investment-calculator.git`；账号 `jamesyew1314`，分支 `main`）
- **密钥**：`~/.ssh/laoyeshu_gh`（已注册到该账号，走 443 端口）；仓库内已设 `core.sshCommand`
- **发布流程**：改 → `node web/test.js` 全过 → 浏览器 QA → 部署（`scp -i .secrets/fangchan_key.pem index.html calc.js logo.jpg root@47.254.235.22:/srv/fangchan/web/`）→ `chmod 644` → sha256 核对 → `git commit` → `git tag -a vX.XX` → `git push --tags`
- **回滚**：`git checkout <tag> -- web/` 后重新部署；备份：深圳 `/opt/laoyeshu/backups/`、本地 `backups/`
- **服务器**：吉隆坡 47.254.235.22（Ubuntu 24.04，2C4G，nginx + certbot + ufw + fail2ban，目录 `/srv/fangchan/{web,api,backups,logs}`，访问日志 `/srv/fangchan/logs/`）
- **不纳入 git**：生成物（PDF/DOCX/XLSX）、预览产物、`backups/`、`.secrets/`

---

## 15. 快速链接

- 完整方案（Markdown）：[`deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.md`](deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.md)
- 公式与对账（Markdown）：[`deliverables/投资系统_公式验证与案例对账_v1.1.md`](deliverables/投资系统_公式验证与案例对账_v1.1.md)
- 公式工作簿（XLSX）：[`deliverables/投资系统_公式验证与案例对账_v1.1.xlsx`](deliverables/投资系统_公式验证与案例对账_v1.1.xlsx)
- 交付物说明：[`deliverables/README.md`](deliverables/README.md)
- 计算器功能说明（发客户/朋友）：[`deliverables/房地产投资计算器_功能说明_v0.34.md`](deliverables/房地产投资计算器_功能说明_v0.34.md)
