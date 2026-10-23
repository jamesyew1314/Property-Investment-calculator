# AGENTS.md — 后续开发入口

1. **先读 `PROJECT.md`。** 它是本项目的单一上下文文件：状态、文件地图、5+1 个关键结论、canonical 数字、公式、数据模型、已拍板决定（§9）、待确认问题（§10）、重建命令都在里面。
2. **不要直接改 `deliverables/` 里的 DOCX/PDF/XLSX。** 它们是生成物。改 `work/sec*.py`，然后运行 `bash work/build_all.sh`。
3. **金额用 Decimal / NUMERIC(18,2)，日期用 DATE。** 不要 float，不要 timestamp。
4. **修改 canonical 数字时，同步更新：** `work/sec1.py`、`work/sec7.py`、`work/build_xlsx.py`、`PROJECT.md` 第 5 节。
5. **回归检查：** 4 个案例 + 21 项测试（方案第 13.3 节，T21 = 等额本息 720k/4.5%/30y 第 60 个月余额 656,337.29）；XLSX `Summary` 四行数字与 `PROJECT.md` 第 5 节一致。
6. **v1 范围（10/19 已确认，不要加回来）：** 个人买入 → 持有 1–5 年 → 卖出。不做投资人分账（Investor/CapitalTxn/Distribution 已移除）、不做电子签、不做 App（先 Web，App 最后上架）。**计算页 = 3 个 Part：Part 1 买入一次性（SPA 价/实价/贷款额/利率手填，月供自动；SPA/LA 律师费自动跟价格；agent/consent/其他手填 → Total 第一次要出的费用）→ Part 2 年度费用（全部手填：管理费/地税/门牌税/装修维修/卖出中介费；只有每月银行利息自动；展开里保险手填、卖出律师费与 RPGT 自动）→ Part 3 年度利润（租金一年 + 预算卖价手填 + 持有年限 1–5 → 利润与年利率自动）。** SST = 8%（2024-03-01 起）。
7. **贷款默认等额本息（和中国银行一样）：** `r = annual/12; pmt = P*r/(1-(1+r)^-n)`；利息 = 剩余本金 × r；daily rest 仅作后续可选。持有年限输入 1/2/3/4/5，逐年输出租金累计、贷款余额、RPGT（30%/20%/15%/0%）、净利润。
8. **Phase 0 优先：** 先做公式引擎（法定费用 + 10 步计算 + 等额本息 + 1–5 年投影）+ 4 案例回归 + 21 项测试，不碰 UI、不做登录。
9. **`web/` 是自动计算系统（v0.1）：** `index.html` = 3 个 Part 页面（手填黄底 / 自动蓝底，**中/英切换：所有文案在 index.html 的 I18N 字典 zh/en，新加字段必须两语都加 key**）；`calc.js` = 公式库（UMD，node 可 require）；改公式后必须跑 `node web/test.js`（13 项全过）。金额只在显示时四舍五入到分，内部计算不提前取整（余额公式除外，按文档口径）。**结果置顶 = 老板口径年利润**：`gross_profit = 卖价 − (实价 + 买入费用)`；`年利润 = gross_profit ÷ 自己现金 ÷ 持有年数`；其下并排“扣所有费用”完整口径（利息/卖出费/RPGT/租金）与 XIRR。线上地址 https://laoyeshu.cn/static/fangchan/ ，更新 = scp index.html/calc.js → `/opt/laoyeshu/static/fangchan/` 后 chmod 644（注意 /static/ 有 7 天缓存，改版后需强刷）。
