# AgentSite MY — DeepSeek Harness 全自动开发提示词包

版本：v1.0  
日期：2026-11-11  
用途：把“马来西亚房产中介建站平台”交给 DeepSeek Harness 自动开发；你只做最后验收。

---

## 使用方式

1. 先读 `docs/AgentSite_战略与报价_2026-11-11.md`
2. 把 **Prompt 0** 贴给 Harness，确认架构与验收标准
3. 按 **Prompt 1 → Prompt 8** 顺序执行
4. 每个 Prompt 完成后必须跑测试、截图、提交
5. 最后用 **Prompt 9（验收）** 和 **Prompt 10（单客户交付）**

> 建议新建目录 `agent-cloud/`，不要直接改生产中的 RoofX 代码。  
> 所有生产部署、支付、域名操作先在 staging 完成。

---

## Prompt 0 — 总控 / 架构（先执行）

```text
你是 AgentSite MY 的全自动开发负责人。工作目录：/Users/huangminming/Pik kwong Lau。
先读：
- docs/AgentSite_战略与报价_2026-11-11.md
- docs/AgentSite_合同模板_Website_Service_Agreement_2026-11-11.md
- docs/AgentSite_报价单模板_2026-11-11.md
- RULES.md
- PROJECT.md
- AGENTS.md

目标：为马来西亚房产中介交付 1–3 天上线的三语独立站平台，并配套报价器、客户后台、续费、工单、自动接单。

硬性约束：
1. 新建 `agent-cloud/`，不修改 RoofX 生产代码；可复用设计 token/组件思路，但不共享数据库。
2. 技术栈：Node.js 22 + Express + PostgreSQL 16 + 原生 HTML/CSS/JS；Nginx；OSS；Billplz；DirectMail。
3. 所有页面三语：zh / en / bm；EN/BM 不得出现中文 UI。
4. 手机优先：390×844 无横向滚动，按钮≥44px，表单可单手操作。
5. 安全：tenant_id 隔离、会话 HttpOnly/Secure、支付验签、审计日志、PDPA 最小化。
6. 不把任何密钥写进仓库；使用 `.env.staging` / `.env.example`。
7. 不询问我设计选择；自行做合理决策并写入 `agent-cloud/DECISIONS.md`。
8. 只有缺少外部凭证（支付/域名/邮件）时才记录 blocker，继续开发其他部分。
9. 报价必须区分：一次性建站费、年订阅/维护费、域名、加购、SST；客户后台/运营后台可生成报价单 PDF。
10. 合同与报价分离：报价单是商业文件；服务合同使用 `Website Design, Hosting & Maintenance Services Agreement` 模板，含范围、付款、维护、SLA、续费、PDPA、责任限制。

本阶段只产出文档，不写业务代码：
- `agent-cloud/ARCHITECTURE.md`：模块、路由、数据流、租户解析、部署图
- `agent-cloud/DATA_MODEL.md`：表、字段、索引、tenant 隔离规则
- `agent-cloud/PRICING.md`：套餐、加购、报价公式、边界条件
- `agent-cloud/TEST_PLAN.md`：单元/API/E2E/手机/三语/安全/性能
- `agent-cloud/ROADMAP.md`：8 个阶段、每阶段验收
- `agent-cloud/DECISIONS.md`：假设与取舍

验收：文档齐全，能用一句话解释“客户从报价到上线”的完整流程。
```

---

## Prompt 1 — 多租户骨架 + 数据库 + 认证

```text
继续 AgentSite MY。实现 Phase 1：
1. `agent-cloud/` Node 22 + Express 项目，`package.json`、`npm test`。
2. PostgreSQL migrations：
   tenants, sites, users, sessions, plans, addons, orders, invoices,
   subscriptions, listings, leads, tickets, ticket_messages, audit_logs.
   所有业务表带 tenant_id + 索引；外键；软删除。
3. 租户解析：
   - `slug.agentsite.test` 子域名
   - `agentsite.test/s/:slug` 路径（本地/staging 回退）
   - 自定义域名映射表
4. 认证：客户 portal 登录（email+password，scrypt/bcrypt），角色 client/ops/admin；会话 cookie HttpOnly/Secure/SameSite=Lax。
5. 中间件：requireTenant、requireRole、CSRF、rate limit、tenant 行级校验。
6. 种子数据：3 个套餐、1 个演示租户、5 条房源。
7. 测试：
   - 租户 A 不能读租户 B 的 listings/leads/tickets
   - 未登录访问 portal 跳登录
   - 错误密码限流
   - migration 可重跑
8. 提交并写 `agent-cloud/PHASE1.md`。

验收：`npm test` 全过；`curl` 健康检查 200；两个租户数据隔离。
```

---

## Prompt 2 — 公共中介站模板（三语 + 手机）

```text
实现 Phase 2：公共站点模板。
页面：
- `/` 首页：Hero、精选房源、服务区域、关于、WhatsApp CTA、询盘表单
- `/listings` 房源列表：筛选（买/租、区域、房型、价格）、分页
- `/listings/:code` 详情：图片、 specs、psf/总价、中介资料、WhatsApp、相似房源
- `/about`、`/contact`
- `/sitemap.xml`、`/robots.txt`

要求：
1. 三语 zh/en/bm，URL `?lang=`，切换不刷新丢状态；所有文案 key 三语。
2. 手机 390×844：单列、图片 lazy、无横向滚动、底部 WhatsApp 固定条不遮内容。
3. SEO：title/description/OG/JSON-LD（RealEstateListing）、canonical、hreflang。
4. 图片：OSS URL；无图用品牌占位；不引用外部图床。
5. 询盘表单：姓名/电话/买租/预算/区域/备注；提交到 leads；防 spam；成功页。
6. 设计：深色 NEO + 青紫，但每个 tenant 可配主色/Logo；不得复制 RoofX 品牌。
7. 测试：
   - Playwright 390/1440 截图 5 页
   - 三语切换后 EN/BM 无中文
   - 表单创建 lead
   - listing 404/空状态
   - Lighthouse mobile ≥85（性能/SEO/可访问性）
8. 提交 `agent-cloud/PHASE2.md` + 截图路径。

验收：演示租户可浏览、可提交询盘、手机无溢出。
```

---

## Prompt 3 — 报价器 + 订单 + 自动开通

```text
实现 Phase 3：报价与订单。
1. 报价器 `/quote`：
   - 套餐 Launch/Pro/Agency
   - 加购：额外页面、Logo、迁移、图片精修、加急
   - 年付/月付切换
   - 实时显示 setup、monthly、annual、首年合计、SST 提示
   - 服务端重算，防前端篡改
2. 下单 `/order`：
   - 代理资料、REN、电话、区域、域名选择
   - 创建 order（pending_payment）
   - 生成 Billplz bill（sandbox）；无凭证时用 mock provider
3. Webhook `/api/webhooks/billplz`：
   - 验签、幂等、金额校验
   - 成功 → order paid → 创建 tenant/site/subscription → provision_jobs
4. 自动开通任务：
   - 创建站点骨架、默认页面、管理员账号
   - 生成 onboarding checklist
   - 发欢迎邮件（mock/staging）
5. 运营后台 `/ops/orders`：列表、状态、重试 provision、退款标记。
6. 合同/报价 PDF：
   - 从 order 生成报价单（套餐、建站费、年订阅、域名、加购、首年合计、SST）
   - 生成合同草案（客户名、套餐、费用、SLA、维护范围）
   - 模板存 `agent-cloud/legal/`，不写死客户数据
7. 测试：
   - 报价边界（0 页、负加购、折扣码）
   - 金额篡改失败
   - webhook 重复不重复开通
   - 未付款不创建 tenant
7. 提交 `agent-cloud/PHASE3.md`。

验收：从 `/quote` 到 mock 付款能自动生成一个可访问的演示站点。
```

---

## Prompt 4 — 客户后台（期限 / 续费 / 发票 / 域名 / 线索）

```text
实现 Phase 4：客户 portal `/portal`。
页面：
- 登录 / 忘记密码（staging 打印 reset link）
- Dashboard：站点状态（Pending/Building/Live/Suspended）、套餐、到期日倒计时、续费按钮
- Billing：发票列表、待付发票、支付链接、历史
- Domain/SSL：域名、到期日、DNS 状态、证书状态（只读）
- Leads：询盘列表、状态（new/contacted/closed）、导出 CSV
- Tickets：新建/列表/详情/回复
- Settings：品牌色、Logo、WhatsApp、简介（受套餐限制）
- Contract / Billing docs：报价单、合同、发票 PDF 下载

要求：
1. 所有页面三语；手机 390 单列；表格转卡片。
2. 到期≤30 天显示续费提醒；≤7 天红色；过期显示宽限期。
3. 发票 PDF（简单 HTML 打印即可）。
4. 权限：客户只能看自己 tenant；ops 可 impersonate 但写审计。
5. 合同/报价：
   - portal 可下载当前套餐报价单、服务合同、SLA 附件
   - 续费后生成新年度发票
6. 测试：
   - 到期状态机（active/grace/suspended）
   - 客户不能读他人发票/线索/工单
   - 手机截图 5 页
6. 提交 `agent-cloud/PHASE4.md`。

验收：演示客户能看到“还剩 X 天”、下载发票、提交工单、查看线索。
```

---

## Prompt 5 — 续费、账单、暂停/恢复

```text
实现 Phase 5：订阅生命周期。
1. subscriptions：plan、billing_cycle、amount、start_at、current_period_end、status。
2. 每日 cron：
   - 30/14/7/1 天前发续费提醒（邮件 + portal 通知）
   - 到期后 7 天 grace；grace 结束转 suspended
   - suspended 站点返回 402/维护页；数据保留 30 天
3. 续费支付：
   - 生成 invoice + Billplz bill；webhook 成功后延长 period、恢复站点
4. 运营后台 `/ops/renewals`：到期列表、批量提醒、手动延期、暂停/恢复。
5. 测试：
   - 时间旅行测试到期/宽限/暂停
   - 重复支付幂等
   - 暂停后站点不可访问但 portal 可登录
6. 提交 `agent-cloud/PHASE5.md`。

验收：演示租户可走完“到期提醒 → 付款 → 续期 → 恢复”。
```

---

## Prompt 6 — 工单 + SLA + 自动分派

```text
实现 Phase 6：ticketing。
1. 客户可建工单：分类（内容/技术/域名/账单/其他）、优先级、描述、附件（≤5MB）。
2. SLA：
   - Agency 2h、Pro 4h、Launch 24h（工作时间）
   - 首次响应/解决计时；超时标红并升级
3. 自动分派：按分类/负载分配给 ops 用户；无可用人进队列。
4. 通知：邮件；可选 WhatsApp 链接；portal 未读徽章。
5. 运营 `/ops/tickets`：队列、筛选、回复、内部备注、关闭、重开。
6. 测试：
   - SLA 计算（周末/工作时间）
   - 客户不能看他人工单
   - 超时升级
7. 提交 `agent-cloud/PHASE6.md`。

验收：客户提交工单 → ops 收到 → 回复 → 客户看到；手机可用。
```

---

## Prompt 7 — 运营后台 + 自动化 + 报价配置

```text
实现 Phase 7：ops 控制台。
1. `/ops` dashboard：MRR、到期数、待开通、超时工单、站点健康。
2. 租户管理：搜索、状态、套餐、延期、暂停、删除（软删）。
3. 报价配置：套餐/加购/价格存 DB，改价不影响历史订单。
4. 自动开通队列：重试、日志、失败原因。
5. 审计日志：谁在何时改了什么。
6. 备份状态：最近数据库/OSS 备份时间。
7. 测试：
   - 改价后旧订单金额不变
   - 权限（ops vs admin）
   - 软删后站点 410/404
8. 提交 `agent-cloud/PHASE7.md`。

验收：运营不碰数据库就能完成日常操作。
```

---

## Prompt 8 — 全量 QA / 安全 / 手机 / 三语 / 性能

```text
执行 Phase 8：发布前硬化。
1. 单元 + API + E2E 全跑；覆盖率报告。
2. Playwright：
   - 390×844、768×1024、1440×900
   - 公共站 5 页、portal 5 页、ops 5 页
   - 截图存 `agent-cloud/qa/screens/`
   - 断言：无横向滚动、无遮挡、按钮可点、表单可提交
3. 三语：
   - zh/en/bm 全页扫描；EN/BM 中文 UI = 0（用户内容除外）
   - 语言切换后表单状态不丢
4. 安全：
   - 租户隔离、SQL 注入、XSS、CSRF、开放重定向、上传类型/大小、速率限制
   - 支付 webhook 验签/重放
5. 性能：
   - Lighthouse mobile ≥85 performance/SEO/accessibility
   - 首屏 JS < 100KB，图片 lazy，OSS
6. 可访问性：焦点、aria、对比度、键盘。
7. 输出 `agent-cloud/QA_REPORT.md`：通过/失败/修复记录/截图。
8. 任何失败必须修复并重跑，不得只记录。

验收：QA_REPORT 全绿；手机截图人工可读。
```

---

## Prompt 9 — 部署 / 验收

```text
执行 Phase 9：staging 部署。
1. staging 子域：`staging.agentsite.my` 或本机端口；独立数据库。
2. Nginx 配置：通配子域、自定义域名、SSL（staging 可自签）。
3. 环境变量：`.env.staging`，不提交；提供 `.env.example`。
4. 备份：每日 pg_dump + OSS 快照；恢复演练一次。
5. 健康检查：`/api/health`、`/portal`、`/ops`、演示租户站点。
6. 烟雾测试：报价→下单→mock 支付→开通→portal→工单→续费。
7. 输出 `agent-cloud/ACCEPTANCE.md`：
   - 功能清单
   - 测试结果
   - 手机截图
   - 已知限制
   - 上线步骤
8. 不要直接部署生产；等我最后验收。

验收：staging 全流程可演示；无 P0/P1 缺陷。
```

---

## Prompt 10 — 单客户 1–3 天交付（运营用）

```text
你是 AgentSite MY 交付运营。客户已付款，资料齐全。
目标：72 小时内上线标准站，不写定制代码。

步骤：
1. 创建 tenant + site（套餐、品牌色、Logo、域名）。
2. 导入房源（CSV/手工/AI 解析），图片压缩到 OSS。
3. 生成三语文案（首页/关于/区域/SEO），人工快速校对。
4. 配置 WhatsApp、询盘表单、通知邮箱。
5. 自动 QA：
   - 手机 390 / 桌面 1440 截图
   - 三语无中文残留（EN/BM）
   - 链接 200、表单成功、图片 200
   - Lighthouse 阈值
6. 绑定域名/SSL；先子域上线，再切自定义域。
7. portal 状态改 Live；发交付邮件 + 使用指南。
8. 记录实际工时、问题、截图到交付记录。

SLA：资料齐全后 72 小时；超时首月免单。
禁止：改模板结构、加定制页面、跳过 QA。
```

---

## 通用验收清单（复制到每个阶段）

```text
[ ] npm test 全过
[ ] 租户隔离测试通过
[ ] 390×844 无横向滚动
[ ] 1440×900 布局正常
[ ] 三语切换正确，EN/BM 无中文 UI
[ ] 表单/WhatsApp/支付链接可点
[ ] 空状态/错误状态有文案
[ ] 图片 OSS，404 有占位
[ ] 支付 webhook 验签 + 幂等
[ ] 续费 cron 时间旅行测试
[ ] 工单 SLA 测试
[ ] 无密钥入库
[ ] 截图/QA_REPORT 已提交
[ ] git commit + 变更说明
```

---

## 给 Harness 的“不要停”规则

```text
不要为了设计选择问我。
不要因为某个非关键依赖缺失就停止；用 mock/stub 继续，并记录 blocker。
不要跳过测试或只写“应该可以”。
不要把密钥、客户数据、生产数据库写进仓库或日志。
不要在未通过 QA 的情况下部署生产。
每完成一个阶段：跑测试 → 截图 → 写报告 → commit。
只有以下情况可以停：支付/域名/邮件账号必须由我提供；法律/合规需要我确认；生产部署需要我最终验收。
```

---

## 建议执行顺序

| 顺序 | Prompt | 产出 |
| :--- | :--- | :--- |
| 1 | Prompt 0 | 架构/数据/测试计划 |
| 2 | Prompt 1 | 多租户/认证 |
| 3 | Prompt 2 | 公共站模板 |
| 4 | Prompt 3 | 报价/订单/开通 |
| 5 | Prompt 4 | 客户后台 |
| 6 | Prompt 5 | 续费/暂停 |
| 7 | Prompt 6 | 工单/SLA |
| 8 | Prompt 7 | 运营后台 |
| 9 | Prompt 8 | QA/安全/手机 |
| 10 | Prompt 9 | staging 验收 |
| 11 | Prompt 10 | 每个客户交付 |

---

## 最后验收（你只需要做这一步）

打开 staging，按下面点一遍：

1. `/quote` 选 Pro + 年付，价格正确
2. 下单 → mock 付款 → 自动开通
3. 打开演示站：手机三语、房源、WhatsApp、询盘
4. `/portal`：到期日、发票、工单、线索
5. `/ops`：订单、续费、工单、租户
6. 手机 390 截图无遮挡
7. 确认无 P0/P1

全部通过 = 验收。
