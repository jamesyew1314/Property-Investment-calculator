# 建站接单系统 MVP — SPEC

> 版本：v1.0（2026-11-17）· 作者：product-manager 角色（由总管串行代执行，见 `ORG_FAILURE.md`）
> 状态：已实现并通过 `work/test-orders.js` 131 项检查；未连真实 Postgres。

## 1. 目标与边界

为房产中介团队提供一个**独立的建站接单入口**：客户在公开页提交需求 → 系统生成订单号 → 内部后台跟进状态、记录 token 充值/消耗。

**做：** 公开下单、单号查询、后台订单列表/改状态/写事件、token 台账、三语页面、手机端。
**不做：** 支付网关、电子签、发票、复杂 CRM、邮件自动化、客户登录、图表报表、AgentSite 既有功能改造。

## 2. 角色与主流程

| 角色 | 动作 |
|---|---|
| 客户（未登录） | 打开 `/order/`，填表提交，拿到 `ORD-YYMMDD-XXXX` |
| 运营（管理员） | 在 `/admin/orders/` 看单、改状态、记 token |
| 系统 | 生成单号、写 `created` 事件、维护 token 余额 |

主流程：`new` → `contacted` → `paid` → `building` → `review` → `live`；`live ↔ paused`；任意状态可 `cancelled`。

## 3. 数据模型

迁移文件：`work/migrations/036_site_orders.sql`（`BEGIN … COMMIT`，可重复执行）。

### 3.1 `site_orders`

| 列 | 类型 | 约束/默认 |
|---|---|---|
| id | bigserial | PK |
| order_no | text | NOT NULL UNIQUE |
| name | text | NOT NULL |
| phone | text | NOT NULL |
| email | text | 可空 |
| company | text | 可空 |
| ren_no | text | 可空（API 统一大写） |
| area | text | 可空 |
| domain | text | 可空（去协议/斜杠、小写） |
| notes | text | 可空 |
| package_code | text | NOT NULL DEFAULT `'dedicated'`，CHECK 仅 `dedicated` |
| monthly_price | numeric(18,2) | 第 2 个月起的月费，NOT NULL DEFAULT `1500`，CHECK ≥ 0 |
| setup_price | numeric(18,2) | **首月总价**（含建站 + 首月服务），NOT NULL DEFAULT `2500`，CHECK ≥ 0；列名是历史命名，不代表“建站费另加月费” |
| status | text | NOT NULL DEFAULT `'new'`，CHECK 8 值 |
| contract_accepted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now()（应用层更新） |

附加 CHECK：`length(btrim(name)) > 0 AND length(btrim(phone)) > 0`。

索引：`(status, created_at DESC)`、`(created_at DESC)`、`(phone)`。

### 3.2 `site_order_events`

`id bigserial PK`、`order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE`、`type text NOT NULL`、`note text`、`actor text`、`created_at timestamptz NOT NULL DEFAULT now()`；索引 `(order_id, created_at DESC)`。

事件类型（当前）：`created`、`status`、`note`。

### 3.3 `token_ledger`

`id bigserial PK`、`order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE`、`kind text NOT NULL`、`amount numeric(18,2) NOT NULL`、`note text`、`created_at timestamptz NOT NULL DEFAULT now()`。

约束：
- `kind IN ('topup','usage','adjust')`
- `amount <> 0`
- `kind = 'adjust' OR amount > 0`（topup/usage 存正数）

索引：`(order_id, created_at DESC)`。

**余额公式**：`balance = Σ(topup) + Σ(adjust) − Σ(usage)`，结果保留 2 位小数；无流水为 `0.00`。

### 3.4 权限

`GRANT ALL` 三张表给 `fangchan_app`；三个序列 `GRANT USAGE, SELECT`。与仓库既有迁移风格一致。

## 4. API 合同

统一前缀 `/api`；JSON；错误体 `{ok:false,error,field?,balance?}`；不返回堆栈。

### 4.1 `POST /api/orders`（公开）

限流：同 IP + 路径 **5 次 / 10 分钟**。

请求：
```json
{"name":"Andy Lau","phone":"012-345 6789","email":"andy@example.com",
 "company":"ABC Realty","ren_no":"REN 12345","area":"Skudai",
 "domain":"andylau.com","notes":"12 listings","contract_accepted":true}
```

校验：

| 字段 | 规则 | 失败 `field` |
|---|---|---|
| name | 必填，trim 后 1–80 | `name` |
| phone | 必填，7–15 位数字，原文 ≤32 | `phone` |
| email | 选填；≤120 且邮箱格式 | `email` |
| domain | 选填；≤120，`a-z0-9-` 点分域名 | `domain` |
| notes | 选填；≤1000 | `notes` |
| company / ren_no / area | 选填；≤120 / 40 / 80 | 对应字段 |
| contract_accepted | 必须严格为 `true` | `contract_accepted` |

成功 `201`：
```json
{"ok":true,"order":{"order_no":"ORD-261117-WT4F","status":"new","monthly_price":1500,"setup_price":2500}}
```
价格口径：`setup_price=2500` 是**首月总价**（含建站 + 首月服务）；`monthly_price=1500` 从第 2 个月起收取。**首月不是 2,500 + 1,500 = 4,000。**
副作用：插入订单 + `site_order_events(type='created', actor='public')`。单号唯一键冲突时先在事务内 `SAVEPOINT`，冲突后 `ROLLBACK TO SAVEPOINT` 再重试（最多 6 次），避免事务 aborted 后的 25P02。

失败：`400 {ok:false,error:"invalid_input",field:"phone"}`、`429 {ok:false,error:"rate_limited"}`。

### 4.2 `GET /api/orders/:orderNo`（公开）

限流：60 次 / 10 分钟。单号格式不合法或不存在均 `404 not_found`（不区分，防枚举）。

成功：
```json
{"ok":true,"order":{"order_no":"ORD-261117-WT4F","status":"new","created_at":"2026-11-17T07:26:00.000Z"}}
```
**只允许这三列**，不得出现 phone/email/notes/company/domain。

### 4.3 `GET /api/admin/orders`（后台）

鉴权：`requireAdmin`（`fc_admin` cookie）。限流 120 次/分钟。

Query：`status`（8 值之一，非法 → `400 invalid_status`）、`q`（≤80，匹配单号/姓名/电话/公司/邮箱，ILIKE）。返回最近 200 条，按 `created_at DESC, id DESC`。

行字段：`id, order_no, name, phone, email, company, ren_no, area, domain, notes, package_code, monthly_price, setup_price, status, contract_accepted, created_at, updated_at, tokens`。金额/余额为 number。

### 4.4 `PATCH /api/admin/orders/:id`（后台）

鉴权：`requireAdmin` + `requireWrite`。Body `{status?, note?}`，至少一项。`status` 白名单；`note` ≤500。写事件：
- 有 status → `type='status'`，note 默认 `status: old -> new`；
- 仅 note → `type='note'`；
- actor = `req.admin.email`。
成功返回 `{ok:true, order:{…同列表行…}}`。不存在 → `404`。

### 4.5 `POST /api/admin/orders/:id/tokens`（后台）

鉴权同上。Body `{kind, amount, note?}`：
- `kind ∈ topup/usage/adjust`
- `amount` 非零、2 位小数、绝对值 ≤ 10,000,000；topup/usage 必须 > 0；adjust 可负
- `note` ≤300

事务内 `SELECT … FOR UPDATE`，`usage` 超余额 → `400 {error:"insufficient_tokens",balance}`，不写流水。成功 `201 {ok:true,balance}`。

## 5. 状态机

```
new ──► contacted ──► paid ──► building ──► review ──► live
                                                        │  ▲
                                                   pause│  │resume
                                                        ▼  │
                                                      paused
任意状态 ──► cancelled
```

MVP 只强制**白名单**，不强制转移顺序（运营可纠正录错的状态）；每次变更必须留事件。后续如要强约束，在 `PATCH` 增加 allowed-transition 表即可。

## 6. 页面要求

### 6.1 `/order/`（`web/order/index.html`）
- 三语完整切换 zh/en/BM；默认读 `kt_lang` / `?lang=`；切换后即时生效并写回 localStorage。
- 展示「首月 RM2,500（含建站 + 首月服务），之后 RM1,500/月」、包含内容、fair use；**不得出现 RM4,000**。
- 表单：姓名、WhatsApp、邮箱、公司、REN、区域、域名、备注、同意条款。
- 提交成功显示 order_no + 状态 + 价格；失败按 `field` 定位。
- 390px 单列、无横向溢出；静态资源带 `?v=ord1`。
- 不复制既有 AgentSite 页面，独立视觉。

### 6.2 `/admin/orders/`（`web/admin/orders/index.html`）
- 复用 `/admin/` 登录；401 显示登录引导，不内建登录。
- 列表列：单号、客户、电话、区域、状态、token 余额、创建时间；移动端转卡片。
- 管理弹窗：改状态 + 事件备注；token 充值/扣减 + 当前余额。
- 三语（RULES 要求，虽然任务最低只要求中/EN）；390px 可用。

## 7. 验收标准

| ID | 标准 | 验证 |
|---|---|---|
| AC-01 | 迁移可重复执行，三表/索引/GRANT 齐全 | SQL review |
| AC-02 | 缺 name/phone、email 错、未同意条款均 400 且带正确 field | `test-orders.js` |
| AC-03 | 单号 `ORD-YYMMDD-XXXX`，马来西亚时区，2000 个不重复 | `test-orders.js` |
| AC-04 | 公开查单只回三列 | `test-orders.js` |
| AC-05 | 后台三个写/读路由未登录均 401 | `test-orders.js` |
| AC-06 | 状态白名单拒绝非法值 | `test-orders.js` |
| AC-07 | token 余额 = topup+adjust−usage，超扣 400 | `test-orders.js` |
| AC-08 | 页面三语 key 完整、EN/BM 无中文、引用 key 存在 | `test-orders.js` |
| AC-09 | 390px 无横向溢出、真实提交成功 | `.build/browser-check.js` |
| AC-10 | 不改既有路由，挂载在 404 fallback 之前 | patch + review |
| AC-11 | 首月 RM2,500 总价（含建站+首月服务）、第 2 个月起 RM1,500，页面无 RM4,000 | `test-orders.js` price guard + browser |
| AC-12 | 单号唯一键冲突后 ROLLBACK TO SAVEPOINT 重试成功 | `test-orders.js` 冲突注入 |

## 8. 测试策略

- 纯函数：校验、单号、状态、token 数学（不依赖 DB/express）。
- HTTP：fake pool + 真实 express Router，覆盖 201/400/401/404/429 之外的路径。
- 页面：解析 I18N 字典 + Puppeteer 390px 渲染/提交。
- 不连生产 DB；真实 Postgres 验证留给集成环境（见 `VERIFICATION.md` 未验证项）。

## 9. 已知取舍

1. 价格硬编码在 `order-core.js`（`PRICES`），迁移默认值仅兜底；改价需同时改两处（或用环境变量，后续）。`setup_price` 语义是「首月总价」，列名沿用不改，避免迁移风险。
2. 公开查单用 GET + 单号，单号含 4 位随机（32^4 ≈ 100 万），可被暴力枚举的风险由限流 60/10min 缓解；MVP 可接受。
3. 事件表没有后台展示 UI（只写），下一步可加时间线。
4. 管理员列表上限 200，无分页；MVP 订单量预期 < 200。
