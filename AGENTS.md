# AGENTS.md — 后续开发入口

1. **先读 `PROJECT.md`。** 它是本项目的单一上下文文件：状态、文件地图、5+1 个关键结论、canonical 数字、公式、数据模型、已拍板决定（§9）、待确认问题（§10）、重建命令都在里面。
2. **不要直接改 `deliverables/` 里的 DOCX/PDF/XLSX。** 它们是生成物。改 `work/sec*.py`，然后运行 `bash work/build_all.sh`。
3. **金额用 Decimal / NUMERIC(18,2)，日期用 DATE。** 不要 float，不要 timestamp。
4. **修改 canonical 数字时，同步更新：** `work/sec1.py`、`work/sec7.py`、`work/build_xlsx.py`、`PROJECT.md` 第 5 节。
5. **回归检查：** 4 个案例 + 21 项测试（方案第 13.3 节，T21 = 等额本息 720k/4.5%/30y 第 60 个月余额 656,337.29）；XLSX `Summary` 四行数字与 `PROJECT.md` 第 5 节一致。
6. **v1 范围（10/19 已确认，不要加回来）：** 个人买入 → 持有 1–5 年 → 卖出。不做投资人分账（Investor/CapitalTxn/Distribution 已移除）、不做电子签、不做 App（先 Web，App 最后上架）。**计算页 = 3 个 Part：Part 1 买入一次性（SPA 价/实价/贷款额/利率手填，月供自动；SPA/LA 律师费自动跟价格；agent/consent/其他手填 → Total 第一次要出的费用）→ Part 2 年度费用（全部手填：管理费/地税/门牌税/装修维修/卖出中介费；只有每月银行利息自动；展开里保险手填、卖出律师费与 RPGT 自动）→ Part 3 年度利润（租金一年 + 预算卖价手填 + 持有年限 1–5 → 利润与年利率自动）。** SST = 8%（2024-03-01 起）。
7. **贷款默认等额本息（和中国银行一样）：** `r = annual/12; pmt = P*r/(1-(1+r)^-n)`；利息 = 剩余本金 × r；daily rest 仅作后续可选。持有年限输入 1/2/3/4/5，逐年输出租金累计、贷款余额、RPGT（30%/20%/15%/0%）、净利润。
8. **Phase 0 优先：** 先做公式引擎（法定费用 + 10 步计算 + 等额本息 + 1–5 年投影）+ 4 案例回归 + 21 项测试，不碰 UI、不做登录。
9. **`web/` 是自动计算系统（v0.1）：** `index.html` = 3 个 Part 页面（手填黄底 / 自动蓝底，**中/英切换：所有文案在 index.html 的 I18N 字典 zh/en，新加字段必须两语都加 key**）；`calc.js` = 公式库（UMD，node 可 require）；改公式后必须跑 `node web/test.js`（13 项全过）。金额只在显示时四舍五入到分，内部计算不提前取整（余额公式除外，按文档口径）。**结果置顶 = 老板口径年利润**：`gross_profit = 卖价 − (实价 + 买入费用)`；`年利润 = gross_profit ÷ 自己现金 ÷ 持有年数`；其下并排“扣所有费用”完整口径（利息/卖出费/RPGT/租金）与 XIRR。线上地址 **https://calc.kwongthye.com/**（发布用 `bash deploy/deploy.sh`）。旧副本 `https://laoyeshu.cn/static/fangchan/` 已于 2026-10-27 **直接关停**（nginx 返回 410 + 停用页，不再提供计算；停用页按钮会把 `?d=` 分享参数带到新站）。

10. **PropMatch 所有页面必须中英双语（强制）。** 登录、工作台、客户需求、房源、配对、设置、表单、弹窗、空状态、错误、加载、手机端、PWA、页面标题，以及 WhatsApp/邮件文案，全部要有 `zh` + `en`；禁止只写中文或只写英文。新文案统一加在 `match-platform/public/i18n.js` 的 `S(zh, en)` 表，新增服务端错误同步 `match-platform/lib/error-i18n.js`。规范与验收清单见 `match-platform/docs/双语规范.md`；每次发布前跑 `cd match-platform && npm test`，并在中/英两种语言下逐页验收。

11. **房产资料库 PropBase（`web/library/` + `work/library-api.js`）**：所有页面、表单、弹窗、空状态、错误必须中英双语（前端统一用 `T(zh, en)`）；字典只维护 `work/library-taxonomy.js` 一份，前端从 `/api/library/meta` 取，**禁止再写第二份区域/状态表**。金额 `NUMERIC(18,2)`、日期 `DATE`。改校验/CSV/佣金后必须跑 `node work/test-library.js`（62 项）和 `node web/test.js`（69 项）。新增实体要同步五处：迁移 SQL、`library-api.js` 的 `ALLOWED` 白名单、`library-core.js` 的 `normalize*` + `CSV_COLUMNS`、前端页面/表单、`docs/资料库说明.md`。发布用 `bash deploy/deploy.sh`（已包含资料库文件与两套测试）。
