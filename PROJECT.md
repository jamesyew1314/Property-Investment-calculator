# PROJECT.md — 房地产投资分析系统

> **这是项目的“单一上下文文件”。**  
> 后续正式开发、修改、交接，先读这一份；只有需要细节时，再打开 57 页方案或工作簿。  
> 最后更新：2026-10-27 · 版本：v3.6（三语覆盖率审计） · 状态：核心 478 条文案 BM 覆盖 100%；公司/法律/名片页待补。

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
| **智能房源配对** | ✅ v0.1 已上线 | 独立 `match-platform/`：需求×房源可解释配对、可负担性、反向匹配、跟进漏斗、中英双语；**51 项测试全过**；线上 <https://match.kwongthye.com/> |
| **房产资料库 PropBase** | ✅ v1.0 已上线 | `web/library/` + `/api/library/*`：楼盘/房源/业主/客户/带看/成交/改价/审计 9 张表、10 个页面、CSV 导入导出、中英双语；**62 项单测**；线上 <https://kwongthye.com/library/> |
| **PropNet 官网（M0）** | ✅ 2026-10-27 上线 | kwongthye.com 改为平台官网：首页/找房/找中介/给中介/价格/关于；公开 API `/api/public/*`；申请表单进后台；公司内容搬到 `/about/`；**官网房源待 M1 中介入驻** |
| **地区体系（当前柔佛）** | ✅ 2026-10-27 上线 | 字典保留 16 州 / 110 区；公开站 `PUBLIC_SCOPE=johor` 只返回柔佛 1 州 29 区；首页区域搜索、12 个区域卡片；`lib_properties.state` 回填与索引；资料库仍按州分组 |
| **平台全免费开放** | ✅ 2026-10-27 上线 | `PLATFORM_FREE=1`（缺省免费）：定价页/加入页/首页改「全部免费」，Pool 档免费期隐藏，未来价格保留；收费与支付后置 |
| **中介工作台 M1** | ✅ 2026-10-27 上线 | `/agent/`：自助注册/登录/邮箱验证、我的房源（新增/编辑/删除/公开官网开关）、中心池（全马筛选+申请带看）、我的客户、询盘收件箱、个人资料；`/api/agent/*` ~20 个端点；`agent_sessions`/`agent_tokens`/`pool_inquiries`；客户与房源按 `tenant_id` 隔离 |
| **M2 个人站/匹配/分享卡/摘要** | ✅ 2026-10-27 上线 | `/a/:slug` 服务端渲染（SEO+JSON-LD，中英）；WTB 自动匹配（预算/区域/房型/房间数打分）；分享卡 PNG（canvas 1080×1350 下载）；每日摘要（08:00 邮件：新询盘 + 每位客户 3 个新匹配，`digest_log` 去重） |
| **M3 订阅基础** | ✅ 2026-10-27 上线 | `agent_subscriptions` / `agent_codes`；`GET /api/agent/plan`、`POST /api/agent/redeem`；工作台「套餐」页（当前套餐/到期/兑换/未来定价）；续期顺延；`PLATFORM_FREE=1` 下不做功能门槛 |
| **M3 支付与降级** | ✅ 2026-10-27 上线 | `agent_payments`；`POST /api/agent/checkout`（配置 Billplz 时自动建账单，否则线下转账+兑换码）；`/api/billing/billplz/callback` 验签开通；`POST /api/cron/maintenance` 到期降级（随每日 cron）；`PLATFORM_FREE` 0/1 切换已演练 |
| **房源图片** | ✅ 2026-10-27 上线 | `lib_properties.photos`/`cover_url`；`POST/DELETE /api/agent/listings/:id/photos`（JPG/PNG/WebP ≤8MB，最多 12 张，服务端验文件头）；nginx `/uploads/` 静态服务；首页/找房/详情/个人站使用封面，第一张自动封面 |
| **图片压缩/缩略图** | ✅ 2026-10-27 上线 | sharp：主图 ≤1600px q82、缩略图 ≤480px q76（`_t.jpg`）；卡片/个人站用缩略图，详情用主图，缺失自动回退；删除图片/房源同时清文件；实测 193KB → 46KB + 6.3KB |
| **REN 审核队列** | ✅ 2026-10-27 上线 | `/admin`「中介审核」：通过/驳回（原因）/拉黑（踢下线+房源收回）/解除；`POST /api/admin/agents/:id/review`；驳回原因在工作台可见；拉黑后登录 401 |
| **M3 支付与降级** | ✅ 2026-10-27 上线 | `agent_payments`；`POST /api/agent/checkout`（配置 Billplz 时自动建账单，否则线下转账+兑换码）；`/api/billing/billplz/callback` 验签开通（E2E 已验证：签名通过→paid→订阅→套餐；错签 403）；`POST /api/cron/maintenance` 到期降级；后台发码（一次最多 50 个）；`PLATFORM_FREE` 0/1 切换演练通过 |

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
| `web/pricing/` `web/privacy/` `web/terms/` `web/receipt/` `web/admin/` `web/card/` | 价格页 / 隐私政策 / 使用条款 / 收据页 / 后台 / 电子名片 |
| `work/library-api.js` | 资料库 API（`/api/library/*`：CRUD、统计、批量、导入导出、审计） |
| `work/library-core.js` | 资料库纯函数（校验、金额/日期解析、CSV、佣金），单测覆盖 |
| `work/library-taxonomy.js` | 资料库字典（25 个新山区域、房型、产权、状态、来源、标签），前端从 `/api/library/meta` 取 |
| `web/index.html` | **PropNet 平台官网首页**（搜索/精选房源/区域/给中介/计算器/加入） |
| `web/about/index.html` | 公司介绍（原首页内容迁入，保留品牌词与 JSON-LD） |
| `web/properties/` · `web/agents/` · `web/join/` · `web/pricing/` | 找房（筛选+详情弹窗）/ 中介目录 / 申请加入表单 / 价格 |
| `web/site.css` · `web/site.js` | 平台官网共用样式与中英切换 |
| `work/public-api.js` | 公开 API：`/api/public/config|properties|properties/:code|agents|leads` |
| `work/migrations/018_public.sql` | 房源 `visibility`、中介资料字段、`agent_leads` |
| `work/migrations/019_national.sql` | 全马：`state` 字段 + 回填 + 索引 |
| `docs/平台方案_全国扩张_v3.md` | 全国扩张：市场、定价（早鸟 300）、三波开城、成本、缺口、风险 |
| `web/agent/` | **中介工作台**（`/agent/`，登录/概览/房源/中心池/客户/询盘/资料） |
| `work/agent-api.js` · `work/agent-core.js` | 工作台 API（~20 端点）与纯函数（scrypt/slug） |
| `work/migrations/020_agent_accounts.sql` · `021_clients_tenant.sql` | 中介账号/会话/验证/询盘；客户 `tenant_id` |
| `docs/平台说明_工作台.md` | 工作台：账号、发布规则、带看归因、API、验收 |
| `work/agent-page.js` | 中介个人站服务端渲染（SEO/JSON-LD/中英） |
| `docs/官网说明.md` | PropNet 官网说明（页面、公开规则、SEO、验收） |
| `web/library/` | **房产资料库 PropBase**（概览/房源/楼盘/业主/客户/带看/成交/导入导出/日志），部署在 `/library/` |
| `work/test-library.js` | 资料库 62 项回归（`node work/test-library.js`） |
| `work/migrations/017_library.sql` | 资料库 9 张表 + 索引 + `fangchan_app` 权限 |
| `docs/资料库说明.md` | 资料库产品 / 技术 / 运维说明 |
| `work/api-server.js` | Express API（部署时改名 **`server.js`**，否则 systemd 跑的是旧文件） |
| `work/admin.js` | 后台 CLI：开通码、优惠码、用户、日志、OTP 兜底 |
| `work/mail-layout.js` | 品牌邮件 HTML 模板（API、提醒、月度、运维通知共用） |
| `work/receipt-pdf.js` | pdfkit 收据 PDF |
| `work/send-reminders.js` / `work/send-monthly.js` | 到期提醒 / 月度邮件 |
| `work/migrations/*.sql` | 数据库迁移（012 两步验证、013 月度邮件） |
| `work/ops/` | 运维脚本：`backup.sh`、`restore-drill.sh`、`monitor.js`、`notify.js`、`offsite-backup.sh`、`setup-staging.sh`、`setup-calc-subdomain.sh`、`deploy-staging.sh` |
| `docs/服务器信息.md` | 服务器总览（含运维脚本、staging、异地备份、子域步骤） |
| `docs/推广资料.md` | Google 商家资料 / Facebook / WhatsApp / 目录登记文案 |
| `work/report-pdf.js` | 完整投资分析报告 PDF（A4 两页，中英双语，Noto CJK） |
| `work/ops/heartbeat.js` | 每日心跳邮件（08:00） |
| `work/ops/staging-refresh.sh` | 每天把正式库克隆到 staging |
| `match-platform/` | **智能房源配对**（独立 Node 应用，零依赖）：线上 <https://match.kwongthye.com/>；本地 `node server.js` → http://127.0.0.1:4100；`npm test` 51 项；详见 `match-platform/README.md` / `产品说明.md` / `deploy/` |
| `deploy/deploy.sh` · `.github/workflows/deploy.yml` | 一键发布 / GitHub Actions 自动发布 |
| `web/cookie-consent.js` | Cookie 偏好中心（全站共用） |
| `web/og-image.png` · `web/404.html` | 分享预览图（1200×630）· 双语错误页 |

> **语言约定**：全站 8 个页面都用同一个 localStorage 键 `kwongthye_lang`（`zh` / `en`），切换后跨页面保持。
> 新增文案时必须在 `zh` 与 `en` 两个字典里都加，否则英文模式下会回退成中文。
> 收据 PDF 依赖服务器字体 `fonts-noto-cjk`（`apt install fonts-noto-cjk`），缺字体时 PDF 自动只打英文。
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
2. **Part 2 · Annual Holding Costs（每年持有费用，全部自己填，只有一个自动）**：管理费、地税、门牌税、装修/维修、**出租中介费（手填 RM/年）**；每月银行利息（自动，**第 1 年摊还表口径**）；展开里：保险（手填可选）→ 每年总费用（自动，第 1 年）。卖出中介费 %、卖出律师费、RPGT 归 Part 3 ②。
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
| 2026-10-19 | 部署 | 上线阿里云深圳服务器（39.108.108.84，与点餐系统同机）：https://laoyeshu.cn/static/fangchan/ ；更新方式 = scp `web/index.html`+`calc.js` → `/opt/laoyeshu/static/fangchan/`，chmod 644（**2026-10-27 已关停，见 v0.81**） |
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
| 2026-10-27 | v0.82 | **关停旧副本**：深圳服务器（39.108.108.84）上 `laoyeshu.cn/static/fangchan/` 停止服务——先做 301 跳转，按老板要求改为**直接关停**：返回 **410 Gone** + 双语停用页（`stopped.html`），页面按钮会把 `?d=` 分享参数带到 https://calc.kwongthye.com/；并清 Cache/Service Worker。旧文件备份 `/opt/laoyeshu/backups/fangchan-old-20261027-1652.tar.gz`，nginx 备份 `laoyeshu.bak-*`。实测：4 种旧地址全部 410、停用页正常、带参数按钮指向新站正确 |
| 2026-10-27 | v0.79 | **利息口径修正（老板 10/27 指出）**：原来 Part 2/Part 3 用「平均利息 = 贷款 × 年利率」，但「卖出时贷款余额」来自等额本息摊还表 → 两者差 264.02（800k/4.5%/30y 第 1 年）。改为**全部用摊还表真实利息**：月供 4,053.48 × 12 = 利息 35,735.98 + 本金偿还 12,905.78，且 `余额减少 = 本金偿还`，逐项对平；Part 2 改显示「每月银行利息（第 1 年，自动）= 2,978.00」，年表新增「本金偿还」列，PDF 同步加列；测试扩到 **76 项**（含对账断言）。注意口径影响：持有年净利 24,000 → 24,264.02，Total ROI 54.41%（原 54.0% 左右） |
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
| 2026-10-25 | v0.54 | 免费版进一步收紧：`FREE_QUOTA = 0`，免费用户**不能云端存档**（`/api/plans` 返回 402 quota_exceeded），账号页显示「仅计算 · 存档需 Pro」；价格页免费版改为「云端存档：不支持」、对比表 0；条款同步；实测免费账号存档被拒 |
| 2026-10-25 | v0.54.1 | 修复英文版账号弹窗中「免费版 · 仅计算…」仍显示中文：登录信息在语言切换时未重绘，现 `applyLang()` 会刷新账号详情、方案模式（本机/云端）与提示；账号说明同步改为「免费版仅计算」。 |
| 2026-10-25 | v0.55 | **收据 PDF + 优惠码 + 到期当天提醒**：服务端 `receipt-pdf.js`（pdfkit）生成 A4 收据，兑换后自动邮件发送 PDF 附件，新增 `GET /api/payments/:id/receipt.pdf`；`create-promo` 支持自定义码/天数/次数/金额/有效期（多用户多次），兑换逻辑支持 `max_uses`、`expires_at`；提醒脚本增加「已到期」第二次邮件（`expiry_notice_at`），7 天提醒只发未到期者；收据页加「下载 PDF」按钮，价格页提示可用优惠码 |
| 2026-10-25 | v0.56 | **PWA / AI 填数 / CSV / 对比 / 多抬头 / Pro 标识**：`manifest.webmanifest` + `sw.js`（可添加到主屏幕、离线壳）；一句话填数（中英关键词+万/千/k/m，月租自动×12）；导出 Excel/CSV；方案 A/B 快照对比表；公司抬头多套保存/切换/删除；免费用户按钮显示「🔒 Pro」角标并拦截 PDF/分享/存档/CSV/对比 |
| 2026-10-25 | v0.57 | **网页管理后台** `/admin/`：独立管理员密码（`ADMIN_PASSWORD`/`ADMIN_SECRET`，与用户账号分离），HttpOnly+Secure+SameSite=Strict 会话 12h、登录限流 5/10min；功能：概览、生成开通码（选天数/数量/金额）、优惠码、码列表、用户查询、留言、7 日访问量；`robots.txt` 屏蔽 `/admin` 与 `/receipt`；noindex |
| 2026-10-25 | v0.58 | 后台增强：**两步验证**（密码 + 邮件 6 位码，10 分钟有效，`ADMIN_EMAIL` 默认 andylau.theroof@gmail.com；应急 `admin.js otp`）、**操作日志**（登录/发码/改密/延期/降级，记录 IP 哈希）、**用户管理**（改密码并踢出会话、手动延期 Pro、设为免费），后台新增「操作日志」标签与用户操作按钮 |
| 2026-10-25 | v0.58.1 | 后台登录状态可视化：页头新增「● 已登录」绿标、页面标题「后台概览」+ 登录时间、退出按钮；登录后自动回到顶部，避免误以为未登录 |
| 2026-10-25 | v0.58.2 | **修复计算器登录后页头不显示账号**：v0.54.1 重构时漏声明全局 `me`，登录后 `updateProLocks/renderAcctDetails` 抛 ReferenceError，页头保持「登录」。已声明并赋值，浏览器实测登录后显示「👤 邮箱前缀」 |
| 2026-10-25 | v0.59 | **后台管理员与权限**：`admins` + `admin_sessions`（服务端会话，12h）；三种角色 Owner / 管理员 / 只读；Owner（邮箱留空 + 原密码）可新增/停用/重置密码/删除管理员；只读角色调用写接口返回 403；验证码发到各管理员邮箱（`admin.js otp [email]` 兜底）；日志记录操作者 |
| 2026-10-25 | v0.59.1 | `jamesyew1225@gmail.com` 设为 **Owner**（`admins.role='owner'`，旧会话已撤销）；后台管理员列表新增权限下拉（管理员 / 只读 / Owner），Owner 可直接在网页调整；PATCH 接口允许设置 owner |
| 2026-10-25 | v0.59.2 | 后台「修改密码」：登录后页头新增按钮，输入当前+新密码即可修改（撤销该账号其它会话）；主 Owner（邮箱留空）提示到服务器 `.env` 修改；发信增加一次重试，避免阿里云 SMTP 瞬时 535 导致登录 500 |
| 2026-10-25 | v0.59.3 | 修复后台「点登录没反应」：修改密码弹窗 HTML 被放在 `<script>` 之后，脚本执行时找不到按钮抛错，导致登录按钮未绑定。已将弹窗移到脚本前，浏览器实测点击登录正常弹出验证码框 |
| 2026-10-25 | v0.60 | 后台会话由 12 小时缩短为 **2 小时**（Cookie Max-Age 7200 + `admin_sessions` 2h），登录页提示；已清除全部现有会话，之后每次过期需重新密码 + 验证码 |
| 2026-10-25 | v0.61 | **对比改为「选择已存方案」+ 打印模板**：方案对比不再用 A/B 快照，改为「已存方案」下拉（云端 + 本机合并，自动去重、带日期），选中两个直接出对比表并标注 ▲/▼ 差异；导出区新增**纸张**（A4 标准 / A4 省纸 / Letter）与**页眉**（完整含 Logo+二维码 / 简洁 / 无页眉）两个选项，打印前动态写入 `@page` 规则（`beforeprint` 也会刷新），选择记在本机 |
| 2026-10-25 | v0.62 | **账号安全与合规 + 品牌邮件**：用户端可自助开关**两步验证**（登录 -> 密码 -> 邮件 6 位码，10 分钟有效、5 次上限，`login_codes` 表）；**PDPA 一键下载我的资料** `GET /api/me/export`（账号 + 方案 + 收据 + 留言，JSON 附件）；**未验证邮箱不能写云端**（存方案/导入/兑换返回 403 `email_unverified`，前端中英提示）；全部系统邮件改为**品牌 HTML 模板**（`work/mail-layout.js`：深蓝页头 + Logo + 金色分隔 + 按钮 + 页脚，纯文本仍保留，链接自动转按钮）；企业站与计算器加 **Cookie 同意横幅**（必要 / 全部接受，记 `kwthye_cookie_consent`，为 GA4 预留 `kwthyeLoadAnalytics` 钩子） |
| 2026-10-25 | v0.63 | **运维三件套 + 备份加固**：① 备份脚本重写（dump 可读性 + 表数量与线上一致 + sha256，失败非 0 退出并告警）；② **恢复演练脚本** `ops/restore-drill.sh`（真的恢复到 scratch 库 + 逐表行数比对 + 邮件报告，每月 1 号 03:30 自动跑，首次演练 PASS）；③ **监控告警** `ops/monitor.js`（每 10 分钟：站点/API/数据库/磁盘/内存/证书/服务/备份新鲜度，只在状态变化发信、持续故障 6 小时再提醒）；④ **staging 预发环境** `https://kwongthye.com/staging/`（Basic Auth + 独立 API `:3001` + `fangchan_staging` 克隆库 + cookie 隔离 `fc_sid_stg`，不发真邮件）；⑤ 清理根目录旧文件（`web/calc.js`、`web/qrcode.js`、`web/logo.jpg`、`calc/logo.jpg`）；⑥ 备份脚本首次修复发现**唯一备份是 13:51 的旧快照（缺 10 张表）**，已重新生成并验证 |
| 2026-10-25 | v0.64 | **名片页 + 月度邮件 + 推广资料**：`/card/` 电子名片（vCard 一键存通讯录、二维码可切成「名片/网站」、WhatsApp/电话/电邮/分享、A4 打印 89×51mm 名片版式）；**月度邮件**（每月 1 号 10:00，已验证 + 未退订用户，一人一月最多一封，4 条轮换小贴士，签名链接退订 `/api/unsubscribe`，账号页可自助开关 `monthlyOptOut`）；首页 JSON-LD 补 `openingHoursSpecification/geo/hasMap/priceRange/contactPoint`；新增 `docs/推广资料.md`（Google 商家资料、Facebook 专页、WhatsApp Business、Mudah/PropertyGuru 目录清单与文案） |
| 2026-10-25 | v0.64.1 | Cookie 同意横幅补齐到 `/pricing/`、`/privacy/`、`/terms/`（原先只有企业站与计算器）；价格页与法律页同样记录 `kwthye_cookie_consent` 并为 GA4 预留 `kwthyeLoadAnalytics` 钩子；全站 6 个页面 + staging 巡检 0 个 JS 错误 |
| 2026-10-25 | v0.65 | **全站中英双语补齐**：`/receipt/`、`/card/`、`/admin/` 三个页面新增 中文/EN 切换（此前收据只用内嵌双语、名片部分中文、后台全中文）；**语言偏好全站统一**（`kwongthye_lang`，计算器原来的 `fangchan_lang` 兼容读取并双写），在一个页面切换后其它 8 个页面自动跟随；后台 8 个标签页登录态实测 0 处残留中文；**收据 PDF 改为中英双语**（服务器装 `fonts-noto-cjk`，pdfkit 注册 NotoSansCJK，没有字体时自动退回英文避免乱码）；名片姓名随语言显示（中文显示「刘泌光」） |
| 2026-10-25 | v0.65.1 | `docs/` 纳入 git（原先在 `.gitignore`，运维与推广文档只存在本机）：服务器信息、推广资料、SaaS 商业方案、合伙人方案 4 份入库；**提交前先脱敏**——风险表里原本写着真实后台密码，已改为「值见服务器 `.env`」；`.gitignore` 移除 `docs/`，`.secrets/` 仍排除 |
| 2026-10-25 | v0.66 | **完整投资分析报告 PDF + 运维补强 + 分享预览**：① `POST /api/report.pdf`（Pro 专属）把计算器算好的数字（前端算、服务端只排版，避免两套公式）排成 A4 两页品牌报告：Part 1 购入明细/首次现金、Part 2 年度费用、Part 3 投资回报 + 逐年表 + 卖出/RPGT/Total ROI，含客户项目抬头、逐页页眉页脚与免责声明，中英双语，导出口点「📄 完整报告 PDF」；② **日志轮转** `/etc/logrotate.d/fangchan`（每日、留 14 天、压缩、copytruncate 不重启服务）；③ **每日心跳邮件** `ops/heartbeat.js` 08:00（服务器/数据/备份/证书/监控状态，几天没收到即代表服务器异常）+ UptimeRobot 外部探测配置文档；④ **修复访问量统计长期为 0**：`sendBeacon` 用 `text/plain` 发送而 `express.json` 不解析，服务端加 `express.text` 兜底 + 前端改 JSON Blob，并给 pricing/privacy/terms/card 补埋点；⑤ **分享预览图** `og-image.png`（1200×630，真实 Logo）+ 全站 og/twitter 标签；⑥ **双语 404/50x 页** + nginx `error_page` |
| 2026-10-25 | v0.67 | **安全加固**：① nginx 加 **CSP**（默认只允许本站资源，内联脚本/样式放行；接 GA4 时需同步放行 Google 域名，已写进文档）+ `Permissions-Policy`，HSTS 加 `includeSubDomains`；② **异地备份加密**：`offsite-backup.sh` 检测到 `/root/.backup-key` 就用 AES-256-CBC（pbkdf2 20 万轮）加密再传 OSS，密钥已生成（600）、**绝不上传**；③ 加密/解密/恢复全链路已实测（解密逐字节一致 + pg_restore 15 张表）；④ 8 个页面 CSP 违规 0，CSV 与报告 PDF 的 blob 下载在 CSP 下正常 |
| 2026-10-25 | v0.68 | **条款同意留痕 + 后台 CSV 导出**：① 注册必须勾选同意「使用条款 + 隐私政策」，后端校验 `acceptTerms`，并把**同意时间、条款版本（2026-10）、IP 单向哈希**写进 `users`（老用户按注册时间回填），隐私政策新增「同意记录」条目（中英）；② 后台新增三个导出：`/api/admin/export/users.csv`、`codes.csv`、`payments.csv`（UTF-8 BOM，Excel 直开，写审计日志），后台页头加「导出 CSV」条（中英）；③ 实测：不勾选注册返回 400 `terms_required`，勾选后 201 并留痕；CSV 三个文件均 200 可下载 |
| 2026-10-25 | v0.69 | **C 组 + D 组收尾**：① 后台**收入/新用户/浏览量 14 天柱状图**（`/api/admin/charts`，纯 CSS 柱状，含付费转化率与累计收入）；② **退款流程**（用户 7 天内申请 → 邮件通知后台 → 后台「退款」标签批准/拒绝 → 批准即停用 Pro 并邮件通知，方案不删除；条款新增退款政策中英）；③ **邮件细分模板**：新增 `rich()` 骨架，验证/重置用按钮、后台与登录 2FA 用大号验证码框、收据用明细表+按钮、到期提醒用明细表+续费按钮、月度用贴士+按钮；④ **Cookie 偏好中心**抽成 `/cookie-consent.js`：必要（锁定）+ 分析 + 营销三类开关，`window.KWConsent.allows()` 供 GA4 使用，隐私政策页脚可重新打开；⑤ **staging 每日自动同步**（04:30 备份校验后克隆正式库）；⑥ **一键发布 + CI/CD**：`deploy/deploy.sh`（测试→同步→重启→健康检查，已实测）与 `.github/workflows/deploy.yml`（push main 自动发布，需配 3 个 Secret） |
| 2026-10-25 | v0.70 | **计算器迁到 calc.kwongthye.com**：阿里云加 `calc A 47.254.235.22` 后，脚本自动申请证书（2027-01-23 到期、自动续期）、写 nginx（含 CSP/Permissions-Policy/HSTS、`/api/` 反代、法务页跳回主域、主域共用图标与 Cookie 脚本、自定义 404）；计算器页加 `canonical` 指向子域并写入 sitemap；新增 `COOKIE_DOMAIN=.kwongthye.com` 让**两个域名共用登录状态**（实测：子域登录 → 主站 `/calc/` 直接显示已登录，主站登出 → 子域同步登出）；主站 `/calc/` 保留可用，旧分享链接不失效 |
| 2026-10-25 | v0.71 | **异地备份正式启用**：阿里云 OSS `kwongthye-backup`（吉隆坡·同城冗余·私有）+ RAM 子账号最小权限（仅该桶 Put/Get/Delete/List）；服务器装 ossutil 1.7.18，凭据 `/root/.ossutilconfig`（600），每天 02:40 把当日 dump **AES-256 加密后**传到 `oss://kwongthye-backup/db/日期/`；**完整链路实测**：上传 → 拉回 → 解密（逐字节一致）→ `pg_restore` 16 张表 2 用户；监控新增「异地备份新鲜度」检查（>26h 未上传告警），心跳邮件每天显示异地状态；远端保留 60 天 |
| 2026-10-25 | v0.72 | **凭据纠偏（安全）**：发现最初拿到的是**云账号 AccessKey**（能列全部桶、能读 RAM），立即用 `aliyun` CLI 在服务器上直接创建 RAM 用户 `kwongthye-backup` + 自定义策略 `kwongthye-backup-only` + 新 AK，替换 ossutil 凭据；**双向验证**：列自己桶 ✅、列全部桶 ⛔403、访问他人桶 ⛔403、读 RAM ⛔；旧云账号 AK 用 `aliyun ram DeleteAccessKey` 删除，`sts GetCallerIdentity` 确认旧密钥已 `InvalidAccessKeyId.NotFound`、新身份为 `RAMUser .../kwongthye-backup`；清理残留 profile |
| 2026-10-25 | v0.73 | **监控方案定稿**：按老叶树模式，不接第三方外部监控（少账号/少密钥/少维护），保留「服务器直传 OSS 加密备份 + 每日 08:00 心跳邮件 + 每 10 分钟服务器自检」三层；已知残留风险（整机宕机无自动告警）与三条备选方案（阿里云云监控 / UptimeRobot / Healthchecks）写入 `docs/服务器信息.md` §16.5 |
| 2026-10-25 | v0.74 | **双地域异地备份**：新增新加坡桶 `kwongthye-backup-sg`（`oss-ap-southeast-1`），`offsite-backup.sh` 升级为**多目标双写**（`OSS_TARGETS` 空格分隔）；两个目标互相独立（一个失败不影响另一个，全失败才告警）；RAM 策略扩到两个桶；**新加坡副本独立恢复演练通过**（下载→解密逐字节一致→`pg_restore` 16 表 2 用户，两份 `.sha256` 相同）；心跳邮件显示「吉隆坡 + 新加坡」两地状态 |
| 2026-10-25 | v0.75 | **进入免费开放期（FREE_MODE）**：计算器全部功能免费——PDF 报告登录即可导出、云端方案不限数量、对比/分享/导出/打印全解锁；新增公开接口 `/api/config` 供前端判断；前端移除 🔒 锁定并显示「🎁 现阶段全部功能免费开放」；定价页加免费通告与「以下为收费后价格」说明。**开关化设计**：`.env` 改 `FREE_MODE=0` 即恢复收费（已双向实测：免费期 PDF 200 / 存方案 201，收费期 402 / 402） |
| 2026-10-26 | v0.76 | **修复「AI 填数点了没反应」**：① 空输入原来直接 `return` 无任何反馈 → 现在弹出示例提示并聚焦输入框；② 新增「示例」按钮，一键填入可识别的句子；③ 解析器重写为**按分句解析**（原来先把逗号全删再匹配，导致英文句子变成一整句、租金/贷款互相串），支持「买了 80 万的房子」「三年后卖 75 万」「Condo 800k, 90% loan at 4.3%, sell for 1M after 5 years」「3000 rent」等写法；④ 中文数字（一~十/两）用于持有年限；⑤ 贷款成数只接受 10%–100%，不会把 4.3% 利率误当 LTV；⑥ 识别失败提示带完整示例。实测 6 类句子全部正确 |
| 2026-10-26 | v0.77 | **AI 填数补默认值**：原来只填薪资类字段、`贷款年限` 空着 → `recalc()` 早退清空结果（用户仍然觉得「没反应」）。现在缺关键字段时补常见值（贷款 90% / 利率 4.3% / 年限 30 年 / 持有 5 年），并在提示里列出「哪些是估算的」，填完直接出「首次现金」等结果。实测 4 类句子（只给房价租金 / 完整中文 / 完整英文 / 只给房价）全部出结果 RM 134,856 |
| 2026-10-26 | v0.78 | **P2 + P3 第一批**：① **RPGT 按卖家身份**（公民/PR 30-20-15-0、外国人 30-30-30-30-30-10、公司 30-20-15-10），Part 3 新增「卖家身份」下拉，逐年表税率跟随；② **费用分档明细**（SPA/LA/估价/卖出律师费可展开看 律师费+印花税+杂费+SST 逐项），公式层新增 `valDetail` 与 `sellLegalTotal` 导出；③ **口径说明弹窗**（19 条：法定费用分档、等额本息、回报口径、三种身份 RPGT、免责），中英双语；④ **断网提示条** + 断网时拦截云端保存；⑤ **免费期注册引导**（本机保存后出现「免费注册可云端同步」，可永久关闭）；⑥ **转化埋点**：新增 `events` 表 + `/api/track` 支持 event + 后台「近 7 天事件漏斗」；⑦ **方案对比扩到 4 个**（＋方案，A/B/C/D 四列，与 A 列对比 ▲▼）；⑧ **手机端分段折叠**（点标题收起，桌面不受影响）；⑨ **PDF 报告加图**：逐年净现金流（零轴居中条形）+「钱花在哪里」成本构成条形；⑩ 测试增至 **69 项**（含三种身份税率、明细自洽） |
| 2026-10-27 | **v0.79** | **房产资料库 PropBase v1.0**：① 新增 9 张表（`lib_projects/lib_properties/lib_owners/lib_clients/lib_viewings/lib_deals/lib_price_events/lib_audit/lib_agents`），金额 NUMERIC(18,2)、日期 DATE、单位号唯一索引防重复录入；② 新模块 `work/library-api.js`（`/api/library/*` 25 个接口：CRUD、概览统计、批量改状态/中介、CSV 导入导出、审计、示例数据）；③ 新前端 `web/library/`（概览 / 房源 / 楼盘 / 业主 / 客户 / 带看 / 成交 / 导入导出 / 操作日志，中英双语，手机卡片视图，登录沿用后台账号 + 记住 7 天）；④ 房源详情「算回报」一键带房价/贷款/利率/年限跳计算器（`?d=` 只读分享格式），「复制资料」生成 WhatsApp 文本；⑤ 改价自动留历史、成交自动推进房源状态、佣金按成交价×费率自动算；⑥ `work/test-library.js` 62 项、`node web/test.js` 69 项全过；⑦ `deploy/deploy.sh` 纳入资料库文件；⑧ 生产库已载入示例数据（5 楼盘/9 房源/3 业主/3 客户/2 带看/1 成交，可一键清除） |
| 2026-10-27 | **v0.81** | **PropNet 官网 M0 上线（kwongthye.com 改为平台官网）**：① 首页改为「新山房源，一个网络」——买/租搜索（区域·预算·房型）、精选房源、8 个区域入口、给中介四件事、计算器、认证中介、关于、首批招募；② 新增 `/properties`（筛选+详情弹窗+货源中介电话/WhatsApp）、`/agents`（REN 目录）、`/join`（申请表单→`agent_leads`→后台+邮件）、重写 `/pricing`（计算器免费 / Pool 免费 / Pro RM89 / 团队 RM299 / 早鸟 RM59×12）；③ 公司内容整体迁到 `/about/`，保留品牌词与 JSON-LD；④ 新公开 API `/api/public/*`（只暴露 public 房源，无业主/备注/地址；申请表单限流）；⑤ 后台新增「加入申请」标签（改状态）；⑥ 房源 `visibility`（默认 pool，可公开）、中介 slug/plan/areas 字段；⑦ 中英双语、手机 0 横向溢出、sitemap/robots/JSON-LD 更新 |
| 2026-10-27 | **v0.84** | **全马地区体系（给全马中介使用）**：① 地区字典从 25 个柔佛区扩到 **16 州 / 110 个城市区域**，每区带 `state`，柔佛原有 key 全部保留；② 首页改「全马房源，一个网络」，搜索加州属+城市级联，区域卡片改为 16 州；③ 找房页加州属筛选、URL 带 `state`；④ 资料库区域下拉按州分组，录入按区域自动带出州（以区域为准）；⑤ 数据库 `lib_properties.state` / `lib_projects.state` + 历史回填 + 索引；⑥ 全站文案/SEO/结构化数据改全马（about 保留「从新山出发」）；⑦ 新增全国扩张方案 v3（早鸟建议 300 席、三波开城、州合伙人、BM 语言、州 SEO 页） |
| 2026-10-27 | **v0.85** | **平台进入全免费开放期**：① 新增 `PLATFORM_FREE` 开关（默认免费，`.env` 改 0 恢复收费）与 `/api/public/config` 的 `platformFree`/`plans`；② 定价页改「现阶段，全部免费开放」，免费横幅、Pro/团队显示「免费」、免费期隐藏 Pool 档、保留未来价格与 FAQ；③ 加入页改「免费申请加入」+ 免费说明；④ 首页招募带免费/收费两套文案按开关切换；⑤ 收费与支付（Billplz/Stripe）后置，免费期不设功能限制 |
| 2026-10-27 | **v0.86** | **M1 中介工作台上线（/agent/）**：① 自助注册/登录（邮箱+scrypt+30 天 HttpOnly 会话）、邮箱验证、REN 自填；② 我的房源增删改 + **公开官网/收回池内**开关（公开前校验价格）；③ 中心池：全马州/区域/房型筛选、货源中介与电话、**申请带看**；④ 我的客户（WTB）按 `tenant_id` 隔离；⑤ 询盘收件箱（接受/拒绝/完成）+ 邮件通知；⑥ 个人资料与 slug；⑦ 迁移 020/021、`/api/agent/*` ~20 端点、限流与 origin 校验；⑧ 单元测试 `test-agent.js` 9 项；⑨ `/app` 与 PropReel 冲突，工作台改用 `/agent/` |
| 2026-10-27 | **v0.87** | **M2 第一版：个人站 + 自动匹配 + 分享卡**：① `/a/:slug` 服务端渲染个人站（头像/团队/REN/验证/简介/区域/公开房源，独立 SEO、canonical、JSON-LD RealEstateAgent、中英、5 分钟缓存），nginx `/a/` 反代 Express；② 工作台「自动匹配」：按买租/预算/区域/房型/房间数从中心池打分，每客户 6 条，可直接申请带看；③ 房源「分享卡」：canvas 1080×1350 PNG 下载（品牌/楼盘/价格/房型/中介/链接）；④ 中介目录与房源详情链到个人站 |
| 2026-10-27 | **v0.88** | **M2 完成：每日摘要**：① 抽出 `work/match.js` 共用匹配打分（工作台与摘要一致）；② `POST /api/cron/digest`（`x-cron-key` 保护）：新询盘 + 每位客户最多 3 个新匹配，无内容不发，`digest_log(agent_id, day)` 去重；③ systemd `propnet-digest.timer` 每天 08:00 Asia/Kuala_Lumpur，`digest.sh` 从 `.env` 取 `CRON_KEY`；④ 迁移 022 `digest_log`；⑤ 实测 `sent:1 / skipped:1 / failed:0`，`digest_log` 落库 |
| 2026-10-27 | **v0.89** | **M3 收费基础：订阅 + 兑换码 + 套餐页**：① 迁移 023 `agent_subscriptions` / `agent_codes`；② `GET /api/agent/plan`（套餐/到期/价格）、`POST /api/agent/redeem`（一次性码，12 个月续期顺延，写审计）；③ 工作台新增「套餐」页：当前套餐、到期日、兑换码、未来定价；④ 兑换实测：free → pro，到期 2027-10-27；⑤ 免费期不做功能门槛，支付网关（Billplz）与到期降级待接 |
| 2026-10-27 | **v0.90** | **M3 完成度：Billplz 支付 + 到期降级**：① 迁移 024 `agent_payments`；② `work/billplz.js`（HMAC 验签、金额、建账单）；③ `POST /api/agent/checkout`：有密钥走 Billplz，无密钥降级线下转账（实测 RM1068/12 个月）；④ `/api/billing/billplz/callback` 验签→幂等开通；⑤ `POST /api/cron/maintenance` 过期降级，已并入 `cron.sh` 每日执行（实测 pro→free、到期清空）；⑥ `PLATFORM_FREE` 0→1 演练通过；⑦ 单测 `test-billing.js` 8 项 |
| 2026-10-27 | **v0.91** | **M3 收口：回调 E2E + 后台发码**：① `/api/billing/billplz/callback` 用临时密钥端到端验证（签名→paid→订阅 source=billplz→套餐/到期），错误签名 403，密钥已轮换；② 后台「生成开通码」新增「PropNet 中介兑换码」（plan/months/count/note，一次最多 50，`GET/POST /api/admin/agent-codes`）；③ 清理测试数据，生产仅留 Andy Lau；④ M0–M3 全部完成 |
| 2026-10-27 | **v0.92** | **房源图片上传/展示**：① 迁移 025 `photos text[]`，沿用 `cover_url`；② `POST /api/agent/listings/:id/photos`（raw body，验 JPEG/PNG/WebP 文件头，≤8MB，最多 12 张）、`DELETE` 删图并回退封面；③ nginx `/uploads/` alias + 30 天缓存；④ 工作台编辑房源可上传/删除缩略图；⑤ 首页卡片、找房列表、详情弹窗、中介个人站全部使用封面，无图回退占位；⑥ systemd `ReadWritePaths` 加 uploads 解决 EROFS；⑦ 实测上传→官网显示→详情大图→删除回退 |
| 2026-10-27 | **v0.93** | **REN 中介审核**：① 后台新增「中介审核」标签（全部/待审核、REN/团队/邮箱验证/房源数、通过/取消）；② `GET /api/admin/agents`、`POST /api/admin/agents/:id/verify`；③ 通过后 `/a/:slug` 与房源显示「已验证中介」；④ 实测审核通过→个人站出现验证标记；后台表格 2 行无报错 |
| 2026-10-27 | **v0.94** | **图片压缩/缩略图 + 审核驳回/拉黑**：① 服务器安装 sharp，上传自动生成主图（1600/q82）与缩略图（480/q76），卡片用 `_t.jpg`，详情用主图，缺失回退；② 删除图片/房源同时清理主图+缩略图；③ `lib_agents.review_status/review_note`（迁移 026）；④ 后台四动作：通过/驳回（原因）/拉黑（suspended + 踢下线 + 房源收回池内）/解除；⑤ 工作台个人资料显示驳回原因；⑥ 实测 3000×2000 193KB → 46KB + 6.3KB；驳回→agent 可见原因；拉黑→登录 401；解除→200 |
| 2026-10-27 | **v0.95** | **公开范围收回柔佛**：① `PUBLIC_SCOPE=johor`（默认）让 `/api/public/config` 只返回柔佛 1 州 29 区，全国数据保留；② 首页改「柔佛房源，一个网络」，删州属下拉、只留区域（29 个），区域卡片 12 个，统计 29 区；③ 找房页删州属筛选、URL 去 state；④ 官网/中介/加入/价格/工作台/个人站文案由「全马」改「柔佛」；⑤ JSON-LD areaServed 改 Johor；⑥ 全国方案 v3 保留为后期路线图 |
| 2026-10-27 | **v0.96** | **只给地产中介使用**：① `/api/public/properties*`、`/api/public/agents` 加中介会话校验，未登录 401 `agents_only`；② `/properties/`、`/agents/` 未登录自动跳 `/agent/`；③ 首页改「柔佛中介的货源网络」，移除对 C 端的精选房源，改为「中心池只对认证中介开放」入口；④ 导航「找房」改「房源池」；⑤ 官网文案/SEO 明确「只给中介、买家不进平台」；⑥ 个人站 `/a/:slug` 仍公开（中介对客户的名片），待确认是否也需登录 |
| 2026-10-27 | **v0.97** | **工作台马来语（BM）**：① `web/agent/bm.js` 以英文为键的 BM 词典，未译条目自动回退英文；② 语言循环 中文 → EN → BM，登录页与侧栏同步；③ 覆盖登录/注册、导航、概览、房源/客户/匹配/询盘/套餐/资料与常见错误；④ 实测 BM 登录标题 `Log Masuk`、导航 `Gambaran / Senarai Saya / Kolam / Klien / Padanan / Pertanyaan / Pelan / Profil`；⑤ 官网营销页 BM 待补 |
| 2026-10-27 | **v0.98** | **官网 BM（首页/导航/页脚）**：① `site.js` 三语支持（中文→EN→BM），BM 以英文为键、缺失回退英文；② 新增 `web/bm-public.js`，覆盖导航、首页 hero/搜索/统计/精选/区域/给中介/加入带/页脚、中心池入口；③ `html lang=ms`；④ 实测首页 H1 `Rangkaian senarai ejen Johor`、导航 `Kolam Senarai / Ejen / Untuk Ejen / Tentang / Kalkulator`、中心池入口全 BM；⑤ 加入/价格正文、邮件与摘要仍为中/英，待补 |
| 2026-10-27 | **v0.99** | **官网 BM 扩展（加入/价格）**：`bm-public.js` 增加 62 条：加入页标题/说明/表单字段/价格卡、价格页标题/横幅/四档功能/FAQ 关键句；实测 `/join/` H1 `Masukkan senarai anda ke dalam rangkaian`、`/pricing/` H1 `Percuma untuk semua, buat masa ini`；无 JS 报错；邮件/摘要 BM 待做（需中介语言偏好） |
| 2026-10-27 | **v1.00** | **邮件三语 + 语言偏好**：① 迁移 027 `lib_agents.lang`（zh/en/bm）；② 个人资料新增「邮件语言」选择；③ 验证邮件、带看通知、每日摘要按中介语言发送（中文/English/BM 三套模板）；④ 实测 PATCH `lang=bm` 后 `/me` 返回 bm；⑤ 测试账号已清理 |
| 2026-10-27 | **v1.01** | **图片 WebP**：上传时除主图/缩略图 JPG 外生成 `.webp` 与 `_t.webp`；卡片与详情用 `<picture>` 优先 WebP、JPG 回退；删除时四份一起清理；实测主图 47KB→19.6KB（-58%）、缩略图 6.4KB→3.0KB（-53%），`image/webp` 正常 |
| 2026-10-27 | **v1.02** | **上线前内容终检**：① `/properties/`、`/agents/` 加 `noindex` 并从 sitemap 移除（实际需登录）；② 标题改「房源池 / 中介目录 · 仅限中介」；③ 加入/价格页删除「开始收费前 30 天通知」承诺，改为「现阶段免费」；④ 中介目录删除「首批 80 位」；⑤ 验证 sitemap 9 个 URL 全部 200；⑥ 三语 H1 正常（柔佛中介的货源网络 / The Johor agent listing network / Rangkaian senarai ejen Johor），手机 0 横向溢出，无 JS 报错 |
| 2026-10-27 | **v1.03** | **中介工作台「套餐」入口关闭**：`SHOW_PLAN=false`；侧栏不再显示套餐、直接访问 `#/plan` 自动回概览；后端 `GET /api/agent/plan`、`POST /api/agent/redeem`、订阅/兑换码表全部保留，后期改 `true` 即恢复；实测导航 7 项（无套餐）、`#/plan → #/`、无报错 |
| 2026-10-28 | **v1.04** | **房源「分享到群」**：① `lib_properties.share_count/last_shared_at`（迁移 028）+ `POST /api/agent/listings/:id/shared`；② 工作台房源列表「分享到群」弹窗：标准文案（楼盘/区域/价格/房型面积/中介+REN+电话/详情链接/同行可带看，不含屋主）+ 分享卡；③ 复制文案、打开 WhatsApp 选群、下载图片；④ 实测文案多行正确、`share_count` 递增；⑤ WhatsApp 官方不支持自动发群，采用一键转发零封号风险 |
| 2026-10-28 | **v1.06** | **/about 重写 + 公司业务迁 /company**：① `/about` 改为「为什么做 PropNet」：三个问题（重复上传/货源分散/合作没记录）→ 四件事（上传一次/同行找得到/分享到群/合作留痕）→ 三条原则（只给中介/屋主资料不出网/货源永远署名）→ 谁做的 → CTA；② 原公司介绍整页迁到 `/company/`，canonical/OG 更新；③ sitemap 增加 `/company/`；④ 实测两页 200、10 张卡片、中英切换正常、无报错 |
| 2026-10-28 | **v1.07** | **三语覆盖率审计 + 核心页 BM 补齐**：① 新增 `work/i18n-audit.js`，对官网 5 页 `PAGE_I18N` 与工作台 225 个 `t()` 逐条比对 BM 词典；② 补齐 161 条 BM（官网 91 + 工作台 70），核心 478 条缺 0（100%）；③ 工作台 225 个 `t()` 缺 0；④ 剩余：`/company/`、`/privacy/`、`/terms/`、`/card/` 仍用旧 zh/en 字典，无 BM |
| 2026-10-25 | — | 新增 `docs/服务器信息.md`：服务器规格、域名/DNS、架构、目录、数据库、环境变量、定时任务、备份恢复、SSL、安全、运维命令、发布流程、风险清单、费用 |
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

---

## 16. 智能房源配对（match-platform，v0.1 · 2026-10-27）

> 与投资计算器并列的独立产品，不改变计算器 v1 的范围。

| 项 | 内容 |
| :--- | :--- |
| 入口 | [`match-platform/README.md`](match-platform/README.md)（技术/算法/API/部署）· [`match-platform/产品说明.md`](match-platform/产品说明.md)（产品/给老板） |
| 启动 | 线上 <https://match.kwongthye.com/?demo=1>；本地 `cd match-platform && node server.js` → <http://127.0.0.1:4100>（演示 `demo@propmatch.my` / `demo1234`） |
| 测试 | `cd match-platform && npm test` — **51 项全过**（金融 10 / 引擎 21 / API 12 / i18n 8） |
| 能力 | 需求与房源 CRUD、六维可解释配对（硬门槛 + 近似匹配）、反向配对、可负担性、今日优先、跟进漏斗、房源买入成本/月供/同区参考、中英双语、JSON 导出、账号隔离 |
| 财务口径 | 复用与第 6/7 节一致的公式：SPA 1.6M = **76,630**、贷款 765k = **18,767**、T21 余额 = **656,337.29**、收入 12k/负债 1.2k/65% DSR/90% 贷款/现金 180k = **1,076,000** |
| 部署 | **已上线**：<https://match.kwongthye.com/>；`/srv/propmatch` + systemd `propmatch` + nginx；每日备份 `/etc/cron.d/propmatch-backup`。步骤见 [`match-platform/deploy/README.md`](match-platform/deploy/README.md) |
| 名片信息 | Andy Lau 刘泌光 · REN 32839 · +60 16-528 0918 · andylau.theroof@gmail.com · THE ROOF REALTY SDN BHD · E(1)1605/1 · No 10A, Jalan Sutera Tanjung 8/4, Taman Sutera Utama, 81300 Skudai, Johor · kwongthye.com |
| 下一步 | WhatsApp Cloud API、团队角色、CSV/门户导入、密码重置；商业路径见 [`docs/SaaS商业方案_Malaysia_v1.md`](docs/SaaS商业方案_Malaysia_v1.md) |

**开发约定**：**所有页面必须中英双语**（登录、工作台、需求、房源、配对、设置、表单、弹窗、空状态、错误、手机端、PWA、页面标题、WhatsApp/邮件文案）；新文案统一进 `public/i18n.js`，服务端错误同步 `lib/error-i18n.js`；规范/验收清单见 [`match-platform/docs/双语规范.md`](match-platform/docs/双语规范.md)。新增原因码必须同步 `lib/engine.js` 的 `NOTE_CODES` 与 `public/i18n.js` 的 `note.*` 中英文字典（测试会拦）；新增区域/标签改 `lib/taxonomy.js`；改权重同步 README 与产品说明；金额原型用 Number，迁移 PostgreSQL 时改 `NUMERIC(18,2)`。


---

## 17. 房产资料库 PropBase（v1.0 · 2026-10-27）

> 公司的房源/楼盘/业主/客户台账。与投资计算器、PropMatch 并列，共用 PostgreSQL 与后台账号。

| 项 | 内容 |
| :--- | :--- |
| 入口 | <https://kwongthye.com/library/>（后台页头也有「资料库 Library」链接） |
| 说明 | [`docs/资料库说明.md`](docs/资料库说明.md)（功能地图、数据模型、API、运维、验收） |
| 登录 | 管理后台账号（邮箱+密码+邮件验证码，可记住 7 天）；`owner/admin` 可写，`viewer` 只读 |
| 页面 | 概览 · 房源 · 楼盘 · 业主 · 客户 · 带看 · 成交 · 导入/导出 · 操作日志 |
| 表 | `lib_projects` `lib_properties` `lib_owners` `lib_clients` `lib_viewings` `lib_deals` `lib_price_events` `lib_audit` `lib_agents` |
| 关键规则 | 编号 `KT-0001` 自动生成；同一楼盘+座+单位号唯一；区域/房型/产权随楼盘带出；改价自动留历史；成交自动把房源改为已售/已租；所有写操作进审计 |
| 联动 | 房源「算回报」→ `calc.kwongthye.com/?d=…` 预填 SPA/贷款/利率/年限；「复制资料」→ WhatsApp 文本；导出 CSV 带 BOM，Excel 直开 |
| 测试 | `node work/test-library.js` — **62 项**；发布脚本会自动跑 |
| 部署 | 迁移 `017_library.sql` 手动执行一次；之后 `bash deploy/deploy.sh` |
| 示例数据 | 当前生产库为示例数据（全部 `is_demo=true`），「导入 / 导出」页可一键清除 |
| 下一步 | 房源图片/附件（OSS）、公开房源页与分享卡片、与 PropMatch 数据互通、团队分账号、月度报表 |

---

## 18. 平台化方案 PropNet（M0 已上线 · 全马 · 2026-10-27）

> 把中介手上的 WTS 货源 / WTB 客源变成「个人库 → 中心池 → 分发 → 归因」的网络；**kwongthye.com 主页改造成平台官网**，计算器永久免费，只对平台收费。

| 项 | 内容 |
| :--- | :--- |
| 文档 | v1：[`docs/平台方案_中介货源网络_v1.md`](docs/平台方案_中介货源网络_v1.md) · v2：[`docs/平台方案_中介货源网络_v2.md`](docs/平台方案_中介货源网络_v2.md) · **v3 全国扩张**：[`docs/平台方案_全国扩张_v3.md`](docs/平台方案_全国扩张_v3.md) |
| 定性 | **Vertical SaaS + B2B 同业网络**；产品名 PropNet，署名 by KWONG THYE |
| 官网 | **已上线（全马）**：`/` 平台首页（16 州 / 110 区）、`/properties`、`/agents`、`/join`、`/pricing`、`/about`；个人站 `/a/:slug` 与工作台 `/app` 待 M1/M2 |
| 定价 | **现阶段全部免费**（`PLATFORM_FREE=1`，不设功能限制）；未来：Pro RM89/月、团队 RM299/5 席、早鸟 RM59 锁 12 个月；计算器始终免费 |
| 成本 | 基础设施 RM170–320/月；人力 RM4,300–5,500/月；外包建设 RM45k–70k，自己做 6 周 |
| 里程碑 | **M0 ✅ → M1 ✅ → M2 ✅ → M3 ✅（2026-10-27 全部完成；Billplz 真实收款需商户密钥）** |
| 验收 | 见 v2 文档 §12：M0/M1/M2/M3 逐条可测（首页 5 秒认知、90 秒发布、3 秒搜索、1 分钟通知、订阅升降级等） |
| 待拍板 | ① 早鸟 80→300 ② 马来语（建议 M2） ③ 城市合伙人 ④ 三波开城 ⑤ 州 SEO 页（M1） |
