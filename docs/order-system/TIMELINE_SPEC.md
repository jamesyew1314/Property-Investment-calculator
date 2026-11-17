# TIMELINE_SPEC — 订单事件时间线（产品规格）

Owner: timeline-product-manager
Staging: `/Users/huangminming/Downloads/日常/order-system-mvp`
上游权威输入：`docs/order-system/TIMELINE_TASKS.md`（合同）＋ `docs/order-system/TIMELINE_VERIFY.md`（口径）
本文件的可写范围：只有本文件。本文不含任何对 `work/`、`web/` 的改动；文中出现的代码均为**实现建议**，由 backend / frontend 落到各自文件。

口径优先级：`TIMELINE_TASKS.md`（合同）> 本文（解释与判定）> 现有代码（事实来源）。
凡本文与 `TIMELINE_TASKS.md` 的**合同**冲突，一律以 TASKS 为准；本文只做解释、补充判定方法，不改合同。
本文与 TASKS 之间确有冲突/张力之处，集中记在第 11 节「异议与裁决」，供 CoS 裁决。

---

## 1. 背景与范围

### 1.1 背景

`site_order_events` 表已经存在（`work/migrations/036_site_orders.sql`），且**已经在写事件**：

| 写入点 | 代码位置 | `type` | `note` | `actor` |
|---|---|---|---|---|
| 公开下单成功后 | `work/order-api.js:124-127` | `created` | `public order form`（常量） | `public`（常量） |
| 后台 `PATCH /admin/orders/:id` | `work/order-api.js:221-224` | 有 `status` → `status`；只改备注 → `note` | 备注，或 `status: new -> live`，或 `status unchanged`（截断 800） | `req.admin.email`，否则 `admin` |

也就是说：数据一直在攒，但后台**没有任何地方能看见它**。订单详情弹窗只显示当前状态、当前 token 余额，管理员看不到「谁在什么时候把状态从 A 改到 B」。这就是本功能要补的唯一缺口。

### 1.2 本期目标（只做这一件事）

在订单详情弹窗里加一个**只读**的「事件时间线」区块：打开弹窗即拉取该订单最近 100 条事件，按时间倒序展示「类型 / 时间 / 操作人 / 备注」。

### 1.3 非目标（明确不做，避免范围蔓延）

- 不编辑、不删除、不补录事件（时间线是审计流水，不可改）。
- 不分页、不做「加载更多」、不做无限滚动（API 已截断 100 条）。
- 不按类型/操作人/时间过滤，不搜索事件。
- 不做导出（CSV/JSON）。
- 不做实时推送（SSE / WebSocket / 轮询刷新）。
- 不为 token 记账补写事件（原因见 11.2，且会破坏现有断言）。
- 不改事件表结构、不新增迁移、不改 `work/order-core.js`、不改公开接口（`POST /api/orders`、`GET /api/orders/:orderNo`）。
- 不改列表页的任何既有行为（渲染、搜索、筛选、语言切换、状态保存、token 记账）。

---

## 2. 既有事实（实现前必须对齐的代码现实）

1. 路由挂在 `app.use("/api", createOrderApi(...))`（见 `work/api-server.patch`），所以文件内写 `/admin/orders/:id/events` 等于外部 `/api/admin/orders/:id/events`。
2. Express 版本 **4.21.2**；`/api` 前缀下还有一个兜底 404：`{ok:false,error:"not_found"}`。
   **推论（重要）**：路由没实现时，`GET /api/admin/orders/1/events` 也会返回 404 `not_found`。所以「404 通过」不能证明功能存在，**A1（401）与 A4/A6（200）才是功能存在的判别器**。
3. `requireAdmin` / `requireWrite` 由 `api-server.js` 注入（`work/order-api.js:38-43`）；未注入时的默认实现是 503 `admin_disabled`。本接口只用 `requireAdmin`。
4. `core.parseId`（`work/order-core.js:204-207`）：`Number(value)` 整数且 `1..2^53-1` 才算合法。行为细节见 11.4（`1e3`、`1.0`、`0x10`、`+12`、`" 12 "` 都会被接受）。
5. `pg` 的 `int8`（`bigserial`）默认以**字符串**返回。所以线上 `site_orders.id` / `site_order_events.id` 在 JSON 里是字符串（列表接口现在就是这样），假库是 number。见 11.5。
6. 后台页 `web/admin/orders/index.html` 是单文件（内联 CSS + 内联 `<script>` + `I18N` 三语字典）。
   - `fetchJson`（`412-422`）：`res.status === 401` → `showGate()` 并 `throw {code:"auth"}`；非 2xx → `throw {code: body.error || "http_"+status, status}`。
   - `apply()`（`350-375`）负责把 `data-i18n` / `data-i18n-ph` 刷成当前语言；语言切换走 `setLang()` → `apply()`。
   - `render()` 只重绘列表；`openDetail(r)`（`536-565`）负责填弹窗并 `hidden=false`；`closeDetail()`（`567-571`）把 `current = null`。
   - 现有 `#savebtn`（`598-620`）、`#tokenbtn`（`622-651`）都是 `fetchJson(...).then(...).catch(...).then(...)` 链，且都在 `.catch` 里 `if (e && e.code === "auth") return;`。
7. 现有测试 `node work/test-orders.js` = **ORDERS PASS / 138 checks**（本次实测确认）。其中三条库级断言是本功能的硬约束：
   `eq(db.orders.length, 2, ...)`、`eq(db.ledger.length, 5, ...)`、`eq(db.events.length, 3, "假库 3 条事件（2 created + 1 status）")`（`work/test-orders.js:489-491`）。
8. `makeFakePool().query()` 对未识别的 SQL 直接 `throw "fake pool: unhandled SQL"`（`225`）。所以 backend 不改假库，事件接口在测试里根本跑不起来。

---

## 3. API 合同（以 TASKS §2 为准，本节只做可执行化）

```
GET /api/admin/orders/:id/events
鉴权：requireAdmin（只读；不要 requireWrite）
额外限流：不加（不调用 limit()/readLimit()）
```

### 3.1 请求

| 项 | 规定 |
|---|---|
| 方法/路径 | `GET /api/admin/orders/:id/events` |
| 路径参数 | `:id`＝订单主键，允许任意文本，服务端用 `core.parseId` 校验 |
| Query | 全部忽略（不读 `limit`/`offset`/`type`/`since`） |
| Body | 忽略 |
| Cookie | `fc_admin=...`（既有管理员会话） |
| 缓存 | 沿用 router 级 `Cache-Control: no-store`（`work/order-api.js:80-83`），不要覆盖 |

### 3.2 响应

| 情形 | 状态码 | Body | 判定 |
|---|---|---|---|
| 未登录 / 无有效 `fc_admin` | 401 | `{"ok":false,"error":"admin_required"}` | 由既有 `requireAdmin` 决定，**不许改** |
| `:id` 非正整数（`0`、`-3`、`abc`、`1.5`、空/空白、超大） | **404** | `{"ok":false,"error":"not_found"}` | `core.parseId` 返回 null 时立刻返回，不查库 |
| 合法正整数但订单不存在 | 404 | `{"ok":false,"error":"not_found"}` | 存在性查询为空 |
| 正常 | 200 | `{"ok":true,"rows":[{...}]}` | |
| 订单存在但无事件 | 200 | `{"ok":true,"rows":[]}` | 不是 404 |
| DB 异常 | 500 | `{"ok":false,"error":"server_error"}` | `wrap()` → 既有 error middleware |

`rows` 中每一行**恰好 5 个键**：`id, type, note, actor, created_at`（见 11.1 关于「六字段」笔误的裁决）。
不多不少：不要额外带 `order_id`、不要带 `order_no`、不要把 `note` 拼进别的字段。

```json
{"ok":true,"rows":[
  {"id":12,"type":"status","note":"status: new -> paid","actor":"owner@example.com","created_at":"2026-11-17T08:12:33.000Z"}
]}
```

- 排序：`ORDER BY created_at DESC, id DESC`（**SQL 层**，JS 不许再排）。
- 上限：`LIMIT 100`（**SQL 层**），取最新的 100 条。
- 只读：SQL 只允许 `SELECT`；GET 里不得 INSERT/UPDATE/DELETE；不得写事件。
- `note` / `actor` 为 `null` 时原样透出，禁止 `?? ""`、禁止 `|| ""`（**API 层**；前端展示时才用 `t("none")` 兜底，见 5.1 / 10.4）。
- `created_at` 在 JSON 里是 ISO 8601 字符串（`pg` 的 `Date` 经 `res.json` 自动序列化成 ISO；假库直接给 ISO 字符串）。
- `id` 的类型不做保证（见 11.5）：线上是字符串，假库是 number。前端只当不透明标识符用。

### 3.3 错误码表（全集）

| code | status | 出现条件 | 前端处理 |
|---|---|---|---|
| `admin_required` | 401 | 无/失效管理员会话 | `fetchJson` 内 `showGate()`，不再显示错误文案 |
| `not_found` | 404 | id 非法，或订单不存在 | 显示 `timeline_err_not_found` |
| `server_error` | 500 | DB/未捕获异常 | 显示 `timeline_err` |
| `admin_disabled` | 503 | 仅在 `requireAdmin` 未注入（测试/半配置环境） | 走「其他错误」→ `timeline_err` |
| `rate_limited` | 429 | **本期不应出现**（不加限流）。若出现，按「其他错误」处理，视为缺陷 | — |

---

## 4. 事件字段语义

| 字段 | 类型 | 语义 | 空值策略 |
|---|---|---|---|
| `id` | int / string | 事件主键。**前端不使用**：排序由 SQL 的 `created_at DESC, id DESC` 保证，前端不再排序、也不拿它做算术 | 不应为空 |
| `type` | text | 事件类型，现有取值 `created` / `status` / `note`（来源见 1.1） | 空/未知 → 原样显示（见下） |
| `note` | text \| null | 人类可读说明。`status` 事件形如 `status: new -> paid`；`note` 事件是管理员备注；`created` 事件固定 `public order form`。库侧最长 800 字符（PATCH 时 `.slice(0,800)`） | `null`/空串 → **不渲染备注行** |
| `actor` | text \| null | 操作者。`created` 事件是 `public`；后台事件是管理员 email；异常时可能是 `admin` | `null` → 仍渲染操作人位，值用 `none`（`—`） |
| `created_at` | ISO 字符串 | 事件发生时间（`timestamptz`） | 解析失败 → `fmtDate()` 已回退 `—` |

### 4.1 `type` 取值与前端呈现

| `type` | 徽标文案 key | 中文 | EN | BM |
|---|---|---|---|---|
| `created` | `timeline_type_created` | 创建 | Created | Dicipta |
| `status` | `timeline_type_status` | 状态 | Status | Status |
| `note` | `timeline_type_note` | 备注 | Note | Catatan |
| 其他任意值 | 无（**原样显示** `type` 字符串本身） | — | — | — |

- 未知 type（例如以后加 `token`、`email`）：**不要**翻译、**不要**丢行、**不要**报错。徽标用中性色，文本就是原始 `type`（`textContent`，不是 `innerHTML`）。
- `type` 为空/null/非字符串：徽标显示 `t("none")`（`—`），该行其余部分照常渲染。
- 判断时必须用 `String(ev.type || "")` 再比较，避免 `null` 被拼成不存在的 key（`t()` 会回落成 key 原文直接显示）。**不要用字符串拼接生成 key**，用 §10.4 的显式映射表。
- **不允许**为了「未知 type 好看」而在本期新增这三个类型徽标之外的翻译（例如不要预先给 `token` 加文案）。

### 4.2 安全与呈现纪律

- `note` / `actor` / 未知 `type` 一律用 `textContent` 写入，**禁止 `innerHTML`**（备注可能包含 `<`、`&`、emoji、换行）。
- `note` 保留原始换行：容器 `white-space:pre-wrap` + `word-break:break-word`。
- 长 note（800 字符）与超长 email 不得撑破弹窗（见 5.5）。

---

## 5. UI 规格与状态机

### 5.1 位置与 DOM（id 完全照抄，供静态断言）

插在**订单详情弹窗 `#modal > .sheet` 内、Token 区块之后、`#dalert` 之前**：

```html
<div class="sect" id="timeline-sect">
  <h3 data-i18n="timeline_section"></h3>
  <div id="dtimeline-status" role="status"></div>
  <div id="dtimeline"></div>
</div>
```

- `#timeline-sect` / `#dtimeline` / `#dtimeline-status` 三个 id 必须完全一致。
- `#dtimeline-status` 上**不要**挂 `data-i18n`：它的文案由 JS 按状态写入，挂上会被 `apply()` 覆盖成「加载中…」。
- `#dtimeline` 是事件容器；事件节点结构如下（class 名可自定，但必须能表达「类型/时间/操作人/备注」四段）：

```html
<div class="tl-item">
  <span class="badge b-created">创建</span>
  <span class="tl-meta">2026/11/17 16:12 · 操作人 · public</span>
  <div class="tl-note">public order form</div>
</div>
```

`tl-meta` 的拼接规则：`fmtDate(created_at)` + `" · "` + `t("timeline_actor")` + `" · "` + `(actor || t("none"))`。
用「·」分隔而不是冒号，是为了三语都不用改标点（中文冒号 vs 英文冒号 vs BM 冒号各不相同）。

### 5.2 状态机

```
        openDetail(r)
             │
             ▼
        ┌─────────┐  fetch 成功且 rows.length>0   ┌───────┐
        │ loading │ ────────────────────────────▶ │ rows  │
        └─────────┘                               └───────┘
          │   │  rows.length===0                     ▲
          │   └──────────────────────────▶ ┌───────┐ │ loadTimeline() 再次进入 loading
          │                                │ empty │ │（保存/token/切语言）
          │  catch                          └───────┘ │
          ├─ 401 ──────────▶ showGate()（弹窗被关，本区块消失，不再写任何文案）
          ├─ 404/not_found ─▶ ┌───────┐
          └─ 其他 ──────────▶ │ error │
                              └───────┘
```

| 状态 | `#dtimeline` | `#dtimeline-status` | 文案 |
|---|---|---|---|
| loading | 清空（`innerHTML=""`） | 显示，`role="status"`，无 `err` class | `t("timeline_loading")` |
| rows | 渲染 N 条 `.tl-item` | **隐藏**（`hidden=true`，`textContent=""`） | — |
| empty | 清空 | 显示，`role="status"` | `t("timeline_empty")` |
| error(404) | 清空 | 显示，`role="alert"`，加 `err` class | `t("timeline_err_not_found")` |
| error(其他) | 清空 | 显示，`role="alert"`，加 `err` class | `t("timeline_err")` |

`role` 的处理（TASKS §3 同时要求 `role="status"` 常驻与失败时 `role="alert"`，见 11.6）：
HTML 里写死 `role="status"`（满足静态要求）；进入 error 时 `setAttribute("role","alert")`，回到 loading 时 `setAttribute("role","status")`。两个要求都满足。

### 5.3 触发时机（四处，缺一不可）

| # | 时机 | 调用 | 说明 |
|---|---|---|---|
| 1 | `openDetail(r)` 末尾（`$("modal").hidden = false;` 之后） | `loadTimeline(r.id)` | 打开即 loading 并发请求 |
| 2 | `#savebtn` 的 `.then`（`render()` 之后） | `loadTimeline(openId)`（先 `if (!current \|\| current.id !== openId) return;`） | 状态/备注保存成功后刷新；`openId` 在点击时捕获（见 5.4-7） |
| 3 | `#tokenbtn` 的 `.then`（`render()` 之后） | 同上 | token 记账成功后刷新（注意：不会有新事件行，见 11.2） |
| 4 | `apply()` 末尾 | `if (current && !$("modal").hidden) loadTimeline(current.id);` | 弹窗打开时切语言，重新拉取让徽标/时间/文案换语言 |

第 4 条是最小代价的三语一致性方案：不引入本地缓存与二次渲染代码，代价是切语言时多一次只读请求（管理员页面，可接受）。
**替换方案（等价可接受）**：缓存 `rows` 并调用 `renderTimeline()` 重绘——但必须同时把 loading/empty/error 三态文案也按新语言重写，否则状态文案会残留旧语言。默认按前者实现。

### 5.4 竞态与生命周期（必须是硬规则）

1. **过期响应**：全局 `tlSeq` 单调递增；`loadTimeline()` 进入时 `var seq = ++tlSeq;`，`then`/`catch` 第一句 `if (seq !== tlSeq) return;`。连点「管理」、快速切换两张单、保存后立刻切语言，都只允许最后一次落地。
2. **弹窗已关**：`then`/`catch` 里 `if ($("modal").hidden) return;`，且**先**判 `auth`（见下）。关闭弹窗后返回的响应不得写 DOM、不得报错。
3. **401**：`catch` 第一句必须是 `if (e && e.code === "auth") return;`（与 `load`/`#savebtn`/`#tokenbtn` 现有写法完全一致）。`showGate()` 内部已经 `closeDetail()`，此时再写 `#dtimeline-status` 会向已隐藏的 DOM 写文案，属于「吞掉/掩盖登录失效」的反模式。
4. **不要用 `current` 取 id**：`loadTimeline(orderId)` 由调用方在**发起时**传值（`openDetail` 传 `r.id`，保存/token 传 `current.id`）。`loadTimeline` 内部不得再读 `current`——它在关闭后是 `null`，会抛 `TypeError`。
5. **并发刷新**：保存与 token 按钮各自 `disabled` 期间仍可能被别的路径打断（例如切语言）。以 `tlSeq` 为准，不做锁、不做队列。
6. `loadTimeline()` 失败**不得**影响按钮状态、不得复用 `#dalert`（那是保存/token 的反馈区，会被覆盖）。时间线的错误只出现在 `#dtimeline-status`。
7. **保存/token 还没返回就切了单**：既有 `updateRowFrom()` 会把 `current` 换回**旧订单**（`index.html:573-578`）。所以刷新前必须确认弹窗仍停在同一张单上：点击时先 `var openId = current.id;`，`.then` 里 `if (!current || current.id !== openId) return;` 再 `loadTimeline(openId)`。否则会出现「B 的单号 + A 的事件」。`tlSeq` 只解决时间线请求之间的竞态，解决不了这一条。

### 5.5 390px 与长内容（`scrollWidth <= clientWidth` 的代码级依据）

- `#dtimeline`：`min-width:0` + `display:flex;flex-direction:column;gap:10px`。
- `.tl-item`：`display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0`，左侧 `border-left:2px solid var(--line)` + `padding-left:10px`。
- `.tl-meta`：`min-width:0;word-break:break-word`（时间与操作人可换行）。
- `.tl-note`：`flex:1 1 100%;min-width:0;word-break:break-word;white-space:pre-wrap`。
- 徽标必须能被长 type 撑开折行：`.tl-item .badge{max-width:100%;white-space:normal;word-break:break-word}`。**不要**用 `flex:0 0 auto` 配全局 `.badge{white-space:nowrap}`（`index.html:58`）——未知 type 很长时会把容器撑出横向滚动（390px 实测：62 字符未知 type → `#dtimeline` `scrollWidth=401 > clientWidth=342`）。
- 长内容覆盖范围：长 `note`（800 字符）、长邮箱/`actor`、**长且未知的 `type`**、emoji、含 `<`/`&` 的文本，都不得横向溢出。
- 全程不设固定像素宽度、不用 `overflow-x:auto` 兜底。
- `.sheet` 在 `@media(max-width:760px)` 是 `padding:18px 14px`，`.modal` 是 `padding:10px`；390px 下内容区约 340px，以上规则保证不横向溢出。

---

## 6. i18n key 清单（三条真实文案，直接可粘）

`I18N` 结构是 `{key: [zh, en, bm]}`，每个新 key **必须是长度 3 的非空数组**（`work/test-orders.js` 的 `pageChecks` 会对**所有** key 断言这一点，且要求 EN/BM 不含中文）。

| key | 中文 | EN | BM | 用在哪 |
|---|---|---|---|---|
| `timeline_section` | 事件时间线 | Event timeline | Garis masa peristiwa | `<h3 data-i18n="timeline_section">` |
| `timeline_loading` | 正在加载事件… | Loading events… | Memuatkan peristiwa… | loading 态文案 |
| `timeline_empty` | 还没有事件记录。 | No events yet. | Tiada peristiwa lagi. | empty 态文案 |
| `timeline_err` | 时间线加载失败，请重试。 | Could not load the timeline. Please retry. | Gagal memuatkan garis masa. Sila cuba lagi. | 通用失败 |
| `timeline_err_not_found` | 该订单已不存在或已被删除。 | This order no longer exists or was deleted. | Pesanan ini tidak lagi wujud atau telah dipadam. | 404 |
| `timeline_actor` | 操作人 | By | Oleh | 行内操作人标签 |
| `timeline_type_created` | 创建 | Created | Dicipta | `created` 徽标 |
| `timeline_type_status` | 状态 | Status | Status | `status` 徽标 |
| `timeline_type_note` | 备注 | Note | Catatan | `note` 徽标 |

文案约束（review 重点）：

1. 与既有字典用词保持一致：`Dicipta`（对齐 `label_created`）、`Catatan`（对齐 `token_note`）、`Sila cuba lagi.`（对齐 `err_load`/`err_network`）。
2. 三语长度量级对齐：三个类型徽标（`created` / `status` / `note`）都是 2–7 字；三条错误文案都是单句、含「请重试」语义。不要出现中文长句配英文单词。
3. 标点：中文用全角（`，` `。` `…`），EN/BM 用半角并保留句末 `.`；省略号统一用单字符 `…`（与既有 `loading: ["加载中…"]` 一致）。
4. EN/BM **不得含任何 CJK 字符**（既有测试会红）。
5. 不要复用 `err_generic`/`err_load` 来省事：语义不同（`err_load` 说的是订单列表），会让 404 与网络失败都显示成「加载订单失败」。
6. （**可选**，需 CoS 点头，不影响任何 AC）既有 `status_section` 现在是「状态与事件 / Status and timeline / Status dan garis masa」。加了独立时间线区块后，这个标题会把人指向一个**没有时间线**的区块。建议改成「状态与备注 / Status and note / Status dan catatan」。这是本期唯一涉及既有文案的改动，`pageChecks` 不校验它的文案，改与不改都不影响测试。

---

## 7. 验收标准 AC（编号沿用 TASKS §4，逐条给可执行判定）

约定：
- `P` = 附录 A 探针脚本：把附录 A 的代码块整个存成 `/tmp/probe-events.js`，然后 `cd <repo> && node /tmp/probe-events.js`。它**不依赖 owner 的测试**、不写仓库、不连真库，自带固定 seed。
- 探针输出形如 `A4 PASS :: ...` / `A4 FAIL :: ...`，末行 `PROBE ALL PASS` 或 `PROBE FAIL / n`。
- 探针的 **A1 / A4 / A6 是「功能存在」的判别器**；A2 / A3 / A8 在路由缺失时也可能「假通过」（`/api` 兜底 404、重复 404 相等），所以不能只看这三条。
- 前端项以 `grep`/`awk`/`node work/test-orders.js` 为准；`F7` 无浏览器时必须写「未实机验证」。
- 附录 A 探针把 `requireWrite` 注入成**恒 403**、`rateLimit` 注入成**恒 429**：路由若误挂 `requireWrite` 或误加 `limit()`，A1…A9 会整片变红。这两条是 TASKS 的硬合同，不能只靠人眼审。

### API

| 编号 | 判定命令 / 断言 | 期望 |
|---|---|---|
| **AC-A1** | `node /tmp/probe-events.js \| grep '^A1 '` 或 `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:PORT/api/admin/orders/1/events` | `A1 PASS`；无 cookie → `401`，body `{"ok":false,"error":"admin_required"}` |
| **AC-A2** | `node /tmp/probe-events.js \| grep '^A2\['`（探针已覆盖 `0 -3 abc 1.5 %20 99999999999999999999999`） | 6 条全 `PASS`：每条都是 `404` 且 `body.error === "not_found"`（TASKS §2 硬性 404；本 SPEC 不认 400，见 11.3） |
| **AC-A3** | `node /tmp/probe-events.js \| grep '^A3 '`；探针 seed 中不存在 `999999` | `A3 PASS`：`404` + `not_found`（不是 `200 rows:[]`） |
| **AC-A4** | `node /tmp/probe-events.js \| grep '^A4 '`（探针断言 `Object.keys(row).sort().join(",") === "actor,created_at,id,note,type"`） | `A4 PASS`：`200`、`rows.length===2`、响应键集合恰为 `actor,created_at,id,note,type`，**且 SQL 投影也只含这 5 列**（探针会检查投影里没有 `order_id`、没有 `*`、没有 `COALESCE(`） |
| **AC-A5** | `node /tmp/probe-events.js \| grep '^A5 '`（seed：两条同 `created_at`、id 11/12，另一条更早 id 13） | `A5 PASS`：`ids = 12,11,13`（`created_at DESC`，同毫秒按 `id DESC`）。附加（SQL 层证据，允许跨行拼接，可加 `-U`/`rg -U`）：`grep -n 'ORDER BY created_at DESC, id DESC' work/order-api.js` 命中 1 次 |
| **AC-A6** | `node /tmp/probe-events.js \| grep '^A6 '`（seed `"8": []`，订单存在但无事件） | `A6 PASS`：`200` 且 `rows === []`（不是 404） |
| **AC-A7** | `node /tmp/probe-events.js \| grep '^A7 '`（seed 120 条，最新是 id 1119） | `A7 PASS`：`rows.length===100`，首条 `Number(id)===1119`（**不断言 `typeof`**，见 11.5）。附加：`grep -n 'LIMIT 100' work/order-api.js` 命中 1 次 |
| **AC-A8** | 探针 `node /tmp/probe-events.js \| grep '^A8 '` **只证明两次响应一致**（stub 无状态，证明不了没写库）；真判定落在 `eventsTests()`：`const n0 = db.events.length; await call("GET", "/api/admin/orders/1/events", undefined, cookie); await call("GET", "/api/admin/orders/1/events", undefined, cookie); eq(db.events.length, n0, "事件 GET 只读，两次读取不新增事件");` | `A8 PASS` **且** 仓库内断言通过：`db.events.length` 前后不变 |
| **AC-A9** | `node /tmp/probe-events.js \| grep '^A9 '`（探针记录所有命中 `site_order_events` 的 SQL） | `A9 PASS`：每条事件 SQL 均 `^SELECT`，且不含 `INSERT/UPDATE/DELETE` |

### 前端

| 编号 | 判定命令 / 断言 | 期望 |
|---|---|---|
| **AC-F1** | `grep -c 'id="timeline-sect"' web/admin/orders/index.html`；`grep -c 'id="dtimeline"'`；`grep -c 'id="dtimeline-status"'`；位置：`awk '/id="modal"/{m=NR}/id="timeline-sect"/{t=NR}/id="dalert"/{d=NR}END{print(m<t&&t<d)?"OK":"BAD"}' web/admin/orders/index.html` | 三个计数各 `1`；位置 `OK`（在 `#modal` 内、`#dalert` 之前） |
| **AC-F2** | `grep -n '"/events"' web/admin/orders/index.html` 且该行属于 `fetchJson(` 的 URL 拼接 | 至少 1 处，形如 `fetchJson("/api/admin/orders/" + encodeURIComponent(orderId) + "/events")` |
| **AC-F3** | `node work/test-orders.js 2>&1 \| grep '每个 key 都是非空'`；`node work/test-orders.js 2>&1 \| grep 'EN/BM 无中文残留'`（`pageChecks` 会遍历**全部** key）；加 `for k in timeline_section timeline_loading timeline_empty timeline_err timeline_err_not_found timeline_actor timeline_type_created timeline_type_status timeline_type_note; do printf '%s ' "$k"; grep -c "$k:" web/admin/orders/index.html; done` | 两条都必须是 `✓` 且**全文不得出现 `✗`**（`grep '每个 key 都是非空'` 会把 `✗` 行一起匹配出来，退出码仍是 0，必须另跑 `! node work/test-orders.js 2>&1 \| grep -q '✗'`）；9 个 key 各命中 ≥1 次；EN/BM 无 CJK |
| **AC-F4** | `sed -n '/loadTimeline/,/^  }/p' web/admin/orders/index.html \| grep -c 'code === "auth"'` | ≥ 1（401 直通，未被吞）；且 `grep -c 'code === "auth"'` 全文 ≥ 4（原有 3 处未被改）。起始锚点故意用 `/loadTimeline/` 而不是 `/function loadTimeline/`：`var loadTimeline = function (...) {` 的等价写法也要能截到 |
| **AC-F5** | `sed -n '/\$("savebtn").addEventListener/,/}).catch(/p' web/admin/orders/index.html \| grep -c 'loadTimeline'`；`sed -n '/\$("tokenbtn").addEventListener/,/}).catch(/p' web/admin/orders/index.html \| grep -c 'loadTimeline'` | 各 ≥ 1（范围止于各自的 `}).catch(`，所以只可能命中也清 `.then` 里的调用；`apply()` 里那处不会被误计入） |
| **AC-F6** | `for k in timeline_loading timeline_empty timeline_err timeline_err_not_found; do printf '%s ' "$k"; grep -c "t(\"$k\")" web/admin/orders/index.html; done`；`grep -c 'role="status"' web/admin/orders/index.html`；`sed -n '/timelineError/,/^  }/p' web/admin/orders/index.html \| grep -ci 'role.*alert'` | 4 个 key 各 ≥1；`role="status"` ≥1；**时间线错误路径**里有 `setAttribute("role", "alert")` ≥1（不能用全文 `role="alert"` 计数：页面本来就有 `#alert`/`#dalert` 两处，会假通过） |
| **AC-F7** | **主判定（有浏览器才做）**：把页面放进 390px iframe，或用 CDP `Emulation.setDeviceMetricsOverride({width:390,height:844,deviceScaleFactor:1,mobile:true})`；先断言 `window.innerWidth === 390`，再测 `document.getElementById("dtimeline").scrollWidth <= clientWidth` 且 `.sheet` 同样不溢出。payload 三种各测一次：长 `note`（800 字符）、长 `actor`（76 字符邮箱）、**长未知 `type`（62 字符）**。静态辅助（**不构成通过依据**：`min-width:0`/`flex-wrap`/`word-break` 在未改动的基线页上就已经命中，没有判别力）：`grep -c 'tl-item .badge{max-width:100%'`、`grep -c 'white-space:pre-wrap'` | 三种 payload 均 `scrollWidth<=clientWidth` 且 `innerWidth===390`。**不要**用 `--headless --window-size=390,844` 当实测（本机实测视口仍是 500px），`--screenshot` 也拿不到 `scrollWidth`。无浏览器/没压到 390 → 结论必须写「**未实机验证**」+ 代码级论证，不得写成已通过 |
| **AC-F8** | `node work/test-orders.js 2>&1 \| tail -3`；人工/静态 5 项清单：列表渲染、搜索、状态保存、token 记账、三语切换 | 全绿 + 5 项均无回归 |

### 回归

| 编号 | 判定命令 / 断言 | 期望 |
|---|---|---|
| **AC-R1** | `node work/test-orders.js 2>&1 \| tail -1` | `ORDERS PASS / N checks`，`N > 138`；无 `✗` |
| **AC-R2** | 先 `test -f .baseline/test-orders.js && echo BASE_OK`（缺 `.baseline` 时 `diff` 只把错误写 stderr、管道退出码仍是 0，会假 PASS），然后三条都跑：<br>① `diff -u .baseline/test-orders.js work/test-orders.js 2>&1 \| grep '^-' \| grep -v '^---' \| grep -c 'ok('`（必须 `0`）<br>② 同上，把 `ok(` 换成 `eq(`（必须 `0`）<br>③ `diff -u .baseline/test-orders.js work/test-orders.js 2>&1 \| grep '^-' \| grep -v '^---' \| wc -l`（建议 `0`：§9.2 已按纯新增设计）<br>④ `grep -c 'ok(\|eq(' .baseline/test-orders.js work/test-orders.js`；`grep -n '假库 3 条事件' work/test-orders.js` | `BASE_OK`；删除的**断言行** `0`（①②）；建议总删除行也 `0`（③）；`ok(`/`eq(` 计数只增不减；三条库级断言原文仍在：`eq(db.orders.length, 2, ...)`、`eq(db.ledger.length, 5, ...)`、`eq(db.events.length, 3, "假库 3 条事件（2 created + 1 status）")`（**行号/文本用 `eq(..., 3, ...)`，不是 `===`**，直接 grep `===3` 会得到 0） |

---

## 8. 边界与不做的事

**硬边界（越界即返工）**

1. 不新增迁移；`site_order_events` 结构不动（不加索引、不加列、不改 `type` 约束）。
2. 不改 `work/order-core.js`（`parseId` 已够用）。
3. 不改公开接口的行为与出参（`POST /orders`、`GET /orders/:orderNo` 仍只回三列）。
4. 不改列表页行为：列、排序（`created_at DESC, id DESC`）、`LIMIT 200`、搜索/筛选、行内按钮、`data-label`。
5. 不改 401 全局行为；不新增 `showGate` 调用点（时间线只依赖 `fetchJson` 内已有的那一处）。
6. 不在 GET 里写事件；不给 `PATCH` / `POST tokens` 增删事件。

**已知限制（本期接受，写进 REPORT 即可，不算缺陷）**

| # | 限制 | 影响 | 备注 |
|---|---|---|---|
| L1 | 只显示最近 100 条，且没有「还有更多」提示 | 事件超过 100 条的老订单看不到更早记录 | TASKS 明确「前端不再截断」，不做分页 |
| L2 | token 记账不产生事件 | 点「记一笔」后时间线刷新但行数不变，管理员可能以为没刷新 | 见 11.2，改需动 `order-api.js` 事件写入 + 测试 |
| L3 | `parseId` 接受 `1e3`/`1.0`/`0x10`/`+12`/`" 12 "` | 这些值会被当成别的订单 id 去查（通常 404） | 见 11.4，修需改 `order-core.js`，本期禁止 |
| L4 | `id` 在线上是字符串 | 若有代码 `ev.id + 1` 会字符串拼接 | 前端不用 id 做算术 |
| L5 | 切语言会重新请求一次 `/events` | 多一次只读请求、loading 闪一下 | 可接受；替代方案见 5.3 |
| L6 | 事件没有时区标注，一律本地时间 | 跨时区看不出口径 | 沿用页面既有 `fmtDate` 与 `locale()` |

---

## 9. 给 backend 的实现提示（`work/order-api.js` + `work/test-orders.js`）

### 9.1 路由（建议放在 `PATCH /admin/orders/:id` 之前或之后均可，无路由冲突）

```js
// ---------- 后台：订单事件时间线（只读） ----------
r.get("/admin/orders/:id/events", requireAdmin, wrap(async function (req, res, next) {
  const id = core.parseId(req.params.id);
  if (!id) return res.status(404).json({ ok: false, error: "not_found" });
  const exists = await pool.query("SELECT id FROM site_orders WHERE id = $1", [id]);
  if (!exists.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
  const out = await pool.query(
    "SELECT id, type, note, actor, created_at FROM site_order_events" +
    " WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
    [id]
  );
  res.json({ ok: true, rows: out.rows });
}));
```

要点：
- 只挂 `requireAdmin`，**不要** `requireWrite`，**不要** `limit(...)`。
- `parseId` 失败先返回，避免拿非法 id 打库。
- 存在性检查必须有（否则「订单不存在」会变成 `200 rows:[]`，AC-A3 红）。
- 两个查询都用 `pool.query`（不要 `pool.connect()`，不需要事务）。
- 不要加 `id::float8`／`::text` 之类的 cast：与列表接口的 `o.id` 出参形态保持一致（见 11.5）。
- 不要给事件行加 `order_id`（会破坏 5 键合同）。

### 9.2 `makeFakePool()` 的精确改动（三处，全部是新增，不改既有分支语义）

1. **INSERT 事件时补 `id` / `created_at`**（`work/test-orders.js:172-176`）。**必须写成纯新增**（原有两行 `push` 一个字都不改，只在后面补字段），否则 `diff -u` 会出现删除行，AC-R2 的「删除行数 0」自相矛盾：

```js
if (s.indexOf("INSERT INTO site_order_events") === 0) {
  if (s.indexOf("'created'") >= 0) db.events.push({ order_id: p[0], type: "created", note: p[1], actor: "public" });
  else db.events.push({ order_id: p[0], type: p[1], note: p[2], actor: p[3] });
  // 纯新增：给刚 push 的那条补 id / created_at（同一毫秒撞车是故意的，排序由 id DESC 兜底）
  const ev = db.events[db.events.length - 1];
  ev.id = (db.eventSeq = (db.eventSeq || 0) + 1);
  ev.created_at = new Date().toISOString();
  return { rows: [] };
}
```
不要改 `const db = { ... }` 那一行去加 `eventSeq: 0`——用 `db.eventSeq || 0` 懒初始化即可，这样整段是纯新增。`eventSeq` 也**不要**复用已有的 `seq`（那会改掉订单的自增序列）。

2. **新增事件 SELECT 分支**（放在最终 `throw` 之前；`site_order_events` 不含子串 `FROM site_orders o`，不会误撞既有分支）：

```js
if (s.indexOf("FROM site_order_events") >= 0) {
  let list = db.events.filter(function (e) { return e.order_id === Number(p[0]); });
  if (/ORDER BY\s+created_at\s+DESC/i.test(s)) {
    list = list.slice().sort(function (a, b) {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return b.id - a.id;
    });
  }
  const m = /LIMIT\s+(\d+)/i.exec(s);
  // 显式投影 5 列：db.events 的行里带 order_id，原样返回会让「5 键」断言假红
  return { rows: list.slice(0, m ? Number(m[1]) : 100).map(function (e) {
    return { id: e.id, type: e.type, note: e.note, actor: e.actor, created_at: e.created_at };
  }) };
}
```

> 假库只做有限模拟（读 `LIMIT`、只在 SQL 明写 `ORDER BY created_at DESC` 时才降序）。**SQL 形状的真判定在探针 A5/A7/A9**，不要指望假库替你抓漏。

3. **新增存在性分支**（`SELECT id FROM site_orders WHERE id = $1`）。用**全等**（`===`）匹配，别照抄既有分支的 `indexOf(...) === 0` 前缀风格——前缀写法会把 `SELECT id FROM site_orders WHERE id = $1 FOR UPDATE`（token 记账路径在用）也吃掉：

```js
if (s === "SELECT id FROM site_orders WHERE id = $1") {
  const row = db.orders.find(function (o) { return o.id === Number(p[0]); });
  return { rows: row ? [{ id: row.id }] : [] };
}
```

（可选）若想让 AC-A9 在仓库内也能断言：给 `db` 加 `sqls: []`，在 `query()` 顶部 `db.sqls.push(s)`。纯新增，不影响既有断言。

### 9.3 必须用**独立** fake pool 写事件测试（这条最容易踩）

现有 `httpTests()` 结束时把 `fake._db` 返回给 `main()`，随后断言 `eq(db.orders.length, 2, ...)`、`eq(db.ledger.length, 5, ...)`、`eq(db.events.length, 3, "假库 3 条事件（2 created + 1 status）")`。
**任何**在 `httpTests()` 内部额外造的事件/订单都会让这三条断言变红 → 直接违反 AC-R2。

因此：

- 新增**独立函数** `eventsTests()`：内部 `const fake = makeFakePool()` 自建实例 + 自建 `express()` + 自建 `listen(0)` + `finally server.close()`，跑完返回自己的 `db` 或什么都不返回。
- `eventsTests()` 必须**自己** require：`const express = require("express"); const createOrderApi = require("./order-api");`。baseline 里这两个 require 都在 `httpTests()` 内部（`work/test-orders.js:265`、`:413`），顶层没有——直接引用会 `ReferenceError: createOrderApi is not defined`，且是在 `main()` 里才炸。
- `httpTests()` **一行都不改**（包括它内部对 `fake` 的使用）。
- `main()` 里在 `httpTests()` 之后 `await eventsTests();`，并让它自己打印分组标题（例如 `== 订单事件时间线 ==`）。
- A5/A7 造数据直接 `fake._db.orders.push({...})` / `fake._db.events.push({...})`（含精确 `created_at`），因为这是独立库，不会污染那三条断言。
- 独立库里可以自由造「无事件订单」（`db.orders.push` 而**不** push 事件）来测 AC-A6 —— 这是 `httpTests()` 里做不到的（下单必写 `created`）。

### 9.4 保护清单（改完自检）

- `node work/test-orders.js` 尾行 `ORDERS PASS / N checks`，`N > 138`，无 `✗`。
- `diff -u .baseline/test-orders.js work/test-orders.js | grep '^-' | grep -v '^---'` 输出为空。
- 三条库级断言原文仍在；`work/test-orders.js:301`（created 事件）、`:326`（`status` + `已上线`）仍通过。
- 事件 SQL 只出现一次 SELECT、无写操作（AC-A9）。

---

## 10. 给 frontend 的实现提示（`web/admin/orders/index.html`，在 `.baseline/index.html` 上最小改动）

共 5 类改动（CSS / DOM / I18N / JS / 4 个调用点），别的地方不要动。

### 10.1 CSS（加在 `@media(max-width:760px)` 之前）

```css
#dtimeline-status{font-size:12.5px;color:var(--muted)}
#dtimeline-status.err{color:#8E2F24}
#dtimeline{display:flex;flex-direction:column;gap:10px;min-width:0}
.tl-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0;
  border-left:2px solid var(--line);padding:2px 0 2px 10px}
.tl-item .badge{max-width:100%;white-space:normal;word-break:break-word}
.b-created{background:#E8F0FA;color:#245A96}
.b-status{background:#E7F5EC;color:#1D6B43}
.b-note{background:#FFF3DC;color:#8A5A10}
.b-other{background:#EEF0F3;color:#55616E}
.tl-meta{min-width:0;font-size:11.5px;color:var(--muted);word-break:break-word}
.tl-note{flex:1 1 100%;min-width:0;font-size:12.5px;color:var(--ink);
  white-space:pre-wrap;word-break:break-word}
```

### 10.2 DOM（Token 区块的 `<div class="sect">…</div>` 之后、`<div class="alert" id="dalert"` 之前）

按 5.1 的四个元素插入。三个 id 不要改。

### 10.3 I18N（在 `I18N` 里 `status_section` 附近追加 9 个 key）

按第 6 节表格逐字粘，保持 `key: ["zh", "en", "bm"],` 的书写风格与缩进。

### 10.4 JS（加在 `closeDetail()` 之后）

```js
  var tlSeq = 0;
  var TYPE_KEY = { created: "timeline_type_created", status: "timeline_type_status", note: "timeline_type_note" };

  function timelineError(msg) {
    var st = $("dtimeline-status");
    st.hidden = false;
    st.className = "err";
    st.setAttribute("role", "alert");
    st.textContent = msg;
  }

  function renderTimeline(list) {
    var box = $("dtimeline");
    var st = $("dtimeline-status");
    box.innerHTML = "";
    if (!list.length) {
      st.hidden = false; st.className = ""; st.setAttribute("role", "status");
      st.textContent = t("timeline_empty");
      return;
    }
    st.hidden = true; st.className = ""; st.textContent = "";
    list.forEach(function (ev) {
      var type = String(ev.type || "");
      var item = el("div", "tl-item");
      var badge = el("span", "badge");
      var key = Object.prototype.hasOwnProperty.call(TYPE_KEY, type) ? TYPE_KEY[type] : null;
      if (key) {
        badge.className += " b-" + type;
        badge.textContent = t(key);
      } else {
        badge.className += " b-other";
        badge.textContent = type || t("none");
      }
      var meta = el("span", "tl-meta",
        fmtDate(ev.created_at) + " · " + t("timeline_actor") + " · " + (ev.actor || t("none")));
      item.appendChild(badge);
      item.appendChild(meta);
      if (ev.note) item.appendChild(el("div", "tl-note", ev.note));
      box.appendChild(item);
    });
  }

  function loadTimeline(orderId) {
    var seq = ++tlSeq;
    var st = $("dtimeline-status");
    $("dtimeline").innerHTML = "";
    st.hidden = false; st.className = ""; st.setAttribute("role", "status");
    st.textContent = t("timeline_loading");
    return fetchJson("/api/admin/orders/" + encodeURIComponent(orderId) + "/events")
      .then(function (body) {
        if (seq !== tlSeq) return;
        if ($("modal").hidden) return;
        renderTimeline(Array.isArray(body.rows) ? body.rows : []);
      })
      .catch(function (e) {
        if (seq !== tlSeq) return;
        if (e && e.code === "auth") return;      // showGate() 已关弹窗
        if ($("modal").hidden) return;
        if (e && (e.status === 404 || e.code === "not_found")) timelineError(t("timeline_err_not_found"));
        else timelineError(t("timeline_err"));
      });
  }
```

### 10.5 四个调用点（别漏掉 `apply()` 那处）

1. `openDetail(r)` 里 `$("modal").hidden = false;` 之后、`$("closebtn").focus();` 之前：`loadTimeline(r.id);`
2. `#savebtn` 的 `.then` 里 `render();` 之后：`if (!current || current.id !== openId) return; loadTimeline(openId);`（`openId` 在 click 回调开头捕获）
3. `#tokenbtn` 的 `.then` 里 `render();` 之后：同上
4. `apply()` 末尾：`if (current && !document.getElementById("modal").hidden) loadTimeline(current.id);`
   注意 `apply()` 在启动时就会跑一次（此时 `current === null`，必须安全跳过）。

调用纪律：这四处都用**平铺语句**，不要 `return loadTimeline(...)` 接进保存/token 的 `.then` 链——那会让「时间线失败」被保存流程的 `.catch` 吃成 `#dalert` 的 `err_generic`（错误提示错位），也会让按钮 `disabled` 一直挂到时间线请求结束。时间线的失败只由 `loadTimeline` 自己的 `.catch` 处理（写 `#dtimeline-status`）。

### 10.6 自检（frontend 交付前必跑）

```bash
node work/test-orders.js 2>&1 | tail -3
grep -c 'id="timeline-sect"' web/admin/orders/index.html
grep -c 'code === "auth"' web/admin/orders/index.html          # 期望 4
grep -c 'loadTimeline' web/admin/orders/index.html             # 期望 ≥ 5（定义 1 + 调用 4）
```

---

## 11. 异议与裁决

> 原则：合同不改；下列问题都在本文里给定「执行口径」并说明理由，最终由 CoS 决定是否回头修 TASKS / VERIFY。

### 11.1 【异议 1｜TASKS §2、AC-A4】「严格六字段」与「六字段/5 个键」矛盾

- 现象：TASKS §2 写「行的形状（严格六字段，不多不少）」，但列出的只有 5 个字段（`id,type,note,actor,created_at`），示例 JSON 也只有 5 个；AC-A4 又写「`rows` 每行恰好 6 个键 `id,type,note,actor,created_at`」——同样是 5 个名字配了数字「六」。VERIFY V2-A4 的键集合断言是 5 元集合。
- 裁决：**以字段名单（5 个键）为唯一执行口径**，「六」是笔误。理由：名字可执行、可断言；数字不可执行，且 VERIFY 已经按 5 个写死了断言。
- 建议 CoS 顺手把 TASKS §2 与 AC-A4 的「六」改成「五」（本文不动 TASKS）。

### 11.2 【异议 2｜TASKS §3 行为 2】token 记账刷新时间线，但 token 记账**不写事件**

- 现象：`POST /admin/orders/:id/tokens`（`work/order-api.js:239-276`）只写 `token_ledger`，**不写** `site_order_events`。全库写事件只有两处（公开下单、PATCH）。而 TASKS §3 要求「token 记账成功后**必须刷新**时间线」。
- 后果：刷新是正确的动作，但**刷不出新行**。管理员点「记一笔」→ 弹窗显示「已记账，余额已更新」→ 时间线无变化，容易被误解为「时间线坏了」。
- 裁决：**保留刷新**（满足 AC-F5、成本极低、为将来补 token 事件留好路径），同时在 8-L2 记为已知限制；本期**不**给 token 记账补事件。理由是硬约束：AC-R2 要求 `eq(db.events.length, 3, ...)` 原样保留，若后端给 token 写入加事件，`main()` 末尾这条断言立刻变红（5 次成功记账 → 事件数 +5）。要补 token 事件必须同时改 TASKS 的 AC-R2 与 UI 合同，属于下一期的合同变更。
- 若 CoS 决定本期就补：需同时（a）TASKS 增加「token 事件类型」条款与对应徽标文案（第 10 个 i18n key）；（b）AC-R2 的 `eq(db.events.length, 3, ...)` 改为新数值；（c）UI 合同写明该徽标的三语文案。三处一起改，否则必然自相矛盾。

### 11.3 【异议 3｜AC-A2 vs §2 表格】非法 id 是 404 还是「400 或 404」

- 现象：TASKS §2 表格硬性写 **404**；AC-A2 写「404 `not_found`（**或 400**，但 `ok:false` 且非 200）」；VERIFY V2-A2 也写「400 或 404」。
- 裁决：**采严，只认 404**。理由：与 `PATCH /admin/orders/:id` 的既有口径一致（`work/order-api.js:185-186` 也是 `parseId` 失败 → 404），一个接口族不要出现两种非法 id 口径；且前端只按 `e.status === 404` 出 404 文案，400 会掉进通用错误，体验不一致。
- 建议 CoS 把 AC-A2 的「或 400」删掉（或标注「以 §2 的 404 为准」）。

### 11.4 【异议 4｜TASKS §2 / L3】`parseId` 比想象的宽松，`1e3` 之类不是「非法」

- 实测（`node -e` 直接调 `core.parseId`）：

  | 输入 | `parseId` 结果 | 说明 |
  |---|---|---|
  | `"1e3"` | `1000` | 科学计数法被 `Number()` 接受 |
  | `"1.0"` | `1` | 整数值的小数被接受 |
  | `"0x10"` | `16` | 十六进制被接受 |
  | `"+12"` / `" 12 "` | `12` | 正号/空白被接受 |
  | `"1.5"` / `"abc"` / `"0"` / `"-3"` / `"  "` | `null` | 合法拒绝 |
  | `"9007199254740991"` | 该值 | 上界内 |
  | `"9007199254740992"` / `"1e22"` | `null` | 超 `2^53-1` |

- 裁决：这是 `order-core.js` 的**既有行为**（`PATCH` 也一样），本期不改（TASKS 明令不得改 core，且 `parseId` 够用）。因此 `1e3` 会走到存在性查询，通常得到 404 —— **结果正确、理由不同**。
- 执行口径：AC-A2 的必测集合仍按 TASKS 的 `0 / -3 / abc / 1.5`（+ 本文补的空白与超大值）；**不要**把 `1e3` 写进「非法 id 应 404」的断言里当作格式校验证据（否则一旦将来有人补了 `1e3` 这单，测试会莫名变红，也会误导 verifier）。
- 附录 A 探针也**没有**把 `1e3` 放进 A2 必测集合，原因同上。

### 11.5 【异议 5｜TASKS §2 示例 JSON】`id` 的 JSON 类型没写清，线上是字符串

- 现象：示例写 `"id": 12`（number）；但 `site_order_events.id` 是 `bigserial`（int8），`pg` 默认把 int8 解析成**字符串**，`res.json` 后是 `"12"`。现有列表接口的 `o.id` 也没有 cast，同样是字符串。
- 裁决：
  - **不**加 `id::float8` / `id::text` 之类的 cast：加 cast 会让本接口的 `id` 类型与列表接口不一致（前端 `updateRowFrom` 用 `===` 比 id，虽然两者不同源，但保持同族形态更安全），也为省一个无关紧要的类型问题去改 SQL 形状，不值。
  - AC 只断言**键集合与顺序**，不断言 `typeof id`（VERIFY V2-A4 正是这么写的）。假库给 number，线上给字符串；探针 A7 用 `Number(first.id) === 1119` 比较，两种都能过。
  - 前端把事件 `id` 当不透明值，且**根本不读它**（排序在 SQL 层完成）；`encodeURIComponent` 用的是**订单** id，与事件 id 无关。不做算术、不与订单 id 交叉比较。

### 11.6 【异议 6｜TASKS §3 line 68 vs line 74】`role="status"` 与失败时 `role="alert"` 并存

- 现象：UI 合同要求状态元素带 `role="status"`（静态），行为第 3 条又要求失败时 `role="alert"`。
- 裁决：**同一元素两种角色按状态切换**——HTML 常驻 `role="status"`（满足静态检查与无障碍的「礼貌播报」），进入 error 时 `setAttribute("role","alert")`，回 loading 时切回 `status`。这样一个元素同时满足两条文字要求，且不引入第二个状态节点（第二个节点会让 AC-F1/F6 的静态断言出现歧义）。
- 不采纳「新增第二个 `role="alert"` 元素」的做法：状态互斥，两个节点会带来「谁该隐藏」的双重真相。

### 11.7 【异议 7｜TASKS §3 行为 6 / L1】100 条截断没有任何「还有更早」的提示

- 现象：`LIMIT 100` 静默截断，前端不做任何提示；事件多的订单看起来「时间线到某天就没了」。
- 裁决：接受，记为 L1。理由：TASKS 明确「前端不再截断、不做分页」，加提示需要额外文案（第 10 个 key）且无法在无 `total` 的情况下说准（正好 100 条时无法区分「刚好 100」与「还有更多」）。若 CoS 想要提示，最小改法是 API 增加 `truncated: rows.length === 100`（会改响应形状 → 违反 5 键/合同精神），因此本期不做。
- 给运营的口径：需要更早历史时，直接查 `site_order_events`（DB 层），后台不提供。

### 11.8 【异议 8｜TASKS §4 AC-F6 措辞】「空/加载/错误三态各有代码路径与文案 key」缺少 404 态

- 现象：AC-F6 只说三态，但 UI 合同第 4 条要求 404 专用文案（`timeline_err_not_found`）。
- 裁决：按**四态**判定（loading / rows / empty / error{404,其他}），AC-F6 的「三态」理解为「非 rows 的三态」，404 视为 error 的子态。AC-F6 判定命令因此额外要求 `t("timeline_err_not_found")` 出现 ≥1 次。
- 这不算改合同，只是把两个条款对齐；无需 CoS 动作。

### 11.9 【流程记录】独立审稿意见的处置（timeline-spec-worker）

独立审稿人（depth-3，只读，未改任何文件）给出 **6 条必须修 + 11 条建议修**，全部**采纳**；另有 2 条是我在复核它时自查追加的。无驳回项。

关键采纳（每条都有它的实测证据支撑）：

| # | 问题 | 处置 |
|---|---|---|
| 1 | AC-A4 的「5 键」在探针里**测不出**（stub 直接返回固定对象，忽略 SELECT 列表）；同时 §9.2 的假库把带 `order_id` 的行原样返回，**正确实现也会假红** | 探针 A4 增查 SQL 投影（禁 `order_id`/`*`/`COALESCE(`）；§9.2.2 假库显式投影 5 列 |
| 2 | AC-R2「删除行数 0」与 §9.2.1 改两行 `push` 自相矛盾；且 `.baseline` 缺失时 `diff` 只报 stderr、管道仍返回 0 → **假 PASS** | §9.2.1 改为纯新增（懒初始化 `db.eventSeq`）；AC-R2 加 `test -f`、`2>&1`、拆成 4 条命令 |
| 3 | 探针**测不出**误挂 `requireWrite` / 误加 `limit()`（两条都是 TASKS 硬合同） | 附录 A 把 `requireWrite` 注成恒 403、`rateLimit` 注成恒 429；实测两类误用各 `PROBE FAIL / 12` |
| 4 | AC-F7 的静态 grep 在**未改动的基线页**上就已全绿，且 `--headless --window-size=390,844` 实测视口仍是 500px | F7 改为「浏览器实测为准（先断言 `innerWidth===390`）+ 静态仅辅助」 |
| 5 | 未知 type 很长时 390px 横向溢出（全局 `.badge{white-space:nowrap}` + 我原来写的 `flex:0 0 auto`），实测 `scrollWidth=401 > 342` | 徽标改 `max-width:100%;white-space:normal;word-break:break-word`，并把「长未知 type」写进 4.2/5.5 的长内容清单 |
| 6 | A7 用 `id === 1119` 比较，pg int8 给字符串时会红（而 detail 看起来像通过） | 改 `Number(first.id) === 1119`；11.5 措辞同步修正 |
| 7 | 保存未返回就切单时，`updateRowFrom()` 会把 `current` 换回旧单 → 「B 的单号 + A 的事件」 | §5.4-7 加 `openId` 捕获与 `current.id !== openId` 守卫；§5.3/§10.5 同步 |
| 8 | `timeline_loading` 用「读取」而失败文案用「加载」，与既有字典不一致；BM 空态句式与 `empty` 不齐 | 改为「正在加载事件…」「Tiada peristiwa lagi.」 |
| 9 | 既有 `status_section` 标题是「Status and timeline」，但那个区块里没有时间线 | 作为**可选**文案改成「状态与备注 / Status and note / Status dan catatan」，写进第 6 节第 6 条，不影响任何 AC |

我自查追加的 2 条（审稿人未提）：`eventsTests()` 必须自己 `require("express")` 与 `require("./order-api")`（baseline 里这两个 require 在 `httpTests()` 内部，直接引用会 `ReferenceError`）；AC-R2 里写 `db.events.length===3` 会 grep 不到，实际代码是 `eq(db.events.length, 3, ...)`。

---

## 12. 附录

### 附录 A：独立探针脚本（复制到 `/tmp/probe-events.js`，在仓库根目录运行）

```js
"use strict";
// /tmp/probe-events.js — 只读探针。在仓库根目录运行：node /tmp/probe-events.js
// 不写仓库文件、不连真实数据库；用 stub pool 固定返回，验证路由/状态码/SQL 形状。
const express = require(process.cwd() + "/node_modules/express");
const createOrderApi = require(process.cwd() + "/work/order-api.js");

function ev(id, iso, type, note, actor) {
  return { id: id, type: type, note: note, actor: actor, created_at: iso };
}
const SEED = {
  "1": [ev(1, "2026-11-17T08:00:00.000Z", "created", "public order form", "public"),
        ev(2, "2026-11-17T09:00:00.000Z", "status", "status: new -> live", "owner@example.com")],
  "7": [ev(11, "2026-11-17T10:00:00.000Z", "note", "same-ms A", null),
        ev(12, "2026-11-17T10:00:00.000Z", "note", "same-ms B", null),
        ev(13, "2026-11-17T09:00:00.000Z", "weird_x", "unknown type", "x")],
  "8": [],
  "9": Array.from({ length: 120 }, function (_, i) {
    return ev(1000 + i, new Date(Date.UTC(2026, 10, 1, 0, 0, 0) + i * 3600000).toISOString(), "note", "n" + i, "a");
  })
};

function stubPool(seed) {
  const log = [];
  async function query(sql, params) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    log.push({ sql: s, params: params || [] });
    const id = String((params || [])[0]);
    if (s.indexOf("site_order_events") >= 0) {
      let rows = (seed[id] || []).slice();
      if (/ORDER BY\s+created_at\s+DESC/i.test(s)) {
        rows.sort(function (a, b) {
          if (a.created_at === b.created_at) return Number(b.id) - Number(a.id);
          return a.created_at < b.created_at ? 1 : -1;
        });
      }
      const m = /LIMIT\s+(\d+)/i.exec(s);
      if (m) rows = rows.slice(0, Number(m[1]));
      return { rows: rows };
    }
    if (s.indexOf("site_orders") >= 0) {
      return { rows: Object.prototype.hasOwnProperty.call(seed, id) ? [{ id: params[0] }] : [] };
    }
    return { rows: [] };
  }
  return { _log: log, query: query, connect: async function () { return { query: query, release: function () {} }; } };
}
function requireAdmin(req, res, next) {
  if (String(req.headers.cookie || "").indexOf("fc_admin=") < 0) {
    return res.status(401).json({ ok: false, error: "admin_required" });
  }
  req.admin = { email: "owner@example.com", role: "owner" };
  next();
}
// 故意恒 403：路由若误挂 requireWrite，A1…A9 会整片变红（TASKS 硬合同：本接口只读）
function requireWrite(req, res, next) { res.status(403).json({ ok: false, error: "read_only" }); }

let fails = 0;
function chk(id, cond, detail) {
  if (!cond) fails++;
  console.log(id + " " + (cond ? "PASS" : "FAIL") + (detail === undefined ? "" : " :: " + detail));
}

(async function main() {
  const pool = stubPool(SEED);
  const app = express();
  app.use(express.json());
  app.use("/api", createOrderApi({ pool: pool, requireAdmin: requireAdmin, requireWrite: requireWrite,
    rateLimit: function () { return function (req, res, next) { res.status(429).json({ ok: false, error: "rate_limited" }); }; } }));
  app.use(function (err, req, res, next) { res.status(500).json({ ok: false, error: "server_error" }); });
  app.use("/api", function (req, res) { res.status(404).json({ ok: false, error: "not_found" }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(function (r) { server.once("listening", r); });
  const base = "http://127.0.0.1:" + server.address().port;
  const AUTH = { Cookie: "fc_admin=test" };
  async function get(path, headers) {
    const res = await fetch(base + path, { headers: headers || {} });
    return { status: res.status, body: await res.json().catch(function () { return {}; }) };
  }
  try {
    let r = await get("/api/admin/orders/1/events");
    chk("A1", r.status === 401 && r.body.ok === false, r.status + " " + JSON.stringify(r.body));

    const bad = ["0", "-3", "abc", "1.5", "%20", "99999999999999999999999"];
    for (const id of bad) {
      const x = await get("/api/admin/orders/" + id + "/events", AUTH);
      chk("A2[" + id + "]", x.status === 404 && x.body.error === "not_found", x.status + " " + JSON.stringify(x.body));
    }

    r = await get("/api/admin/orders/999999/events", AUTH);
    chk("A3", r.status === 404 && r.body.error === "not_found", r.status + " " + JSON.stringify(r.body));

    r = await get("/api/admin/orders/1/events", AUTH);
    const keys = r.status === 200 && Array.isArray(r.body.rows) && r.body.rows[0]
      ? Object.keys(r.body.rows[0]).sort() : [];
    // A4 同时校验「响应 5 键」与「SQL 投影只取 5 列」：stub 会原样返回 SEED，光看响应抓不到 SELECT 多带 order_id
    const evSqls = pool._log.filter(function (x) { return x.sql.indexOf("site_order_events") >= 0; });
    const proj = ((evSqls[evSqls.length - 1] || {}).sql || "").match(/^SELECT\s+([\s\S]*?)\s+FROM/i);
    const projText = proj ? proj[1] : "";
    const projOk = projText.length > 0 && !/\border_id\b/i.test(projText) && !/\*/.test(projText) &&
      !/COALESCE\s*\(/i.test(projText) &&
      ["id", "type", "note", "actor", "created_at"].every(function (c) {
        return new RegExp("\\b" + c + "\\b").test(projText);
      });
    chk("A4", r.status === 200 && keys.join(",") === "actor,created_at,id,note,type" && r.body.rows.length === 2 && projOk,
      r.status + " keys=" + keys.join(",") + " proj=" + projText);

    r = await get("/api/admin/orders/7/events", AUTH);
    const ids = (r.body.rows || []).map(function (x) { return x.id; });
    chk("A5", ids.join(",") === "12,11,13", "ids=" + ids.join(","));

    r = await get("/api/admin/orders/8/events", AUTH);
    chk("A6", r.status === 200 && Array.isArray(r.body.rows) && r.body.rows.length === 0,
      r.status + " " + JSON.stringify(r.body));

    r = await get("/api/admin/orders/9/events", AUTH);
    const n = (r.body.rows || []).length;
    const first = (r.body.rows || [])[0] || {};
    // 用 Number() 比较：线上 id 是 pg int8 的字符串，假库是 number（见 §11.5）
    chk("A7", n === 100 && first.type === "note" && Number(first.id) === 1119, "rows=" + n + " first=" + first.id);

    const before = await get("/api/admin/orders/1/events", AUTH);
    const after = await get("/api/admin/orders/1/events", AUTH);
    chk("A8", JSON.stringify(before.body) === JSON.stringify(after.body), "repeat GET 一致");

    const evSql = pool._log.filter(function (x) { return x.sql.indexOf("site_order_events") >= 0; });
    chk("A9", evSql.length >= 1 && evSql.every(function (x) {
      return /^SELECT\b/i.test(x.sql) && !/\b(INSERT|UPDATE|DELETE)\b/i.test(x.sql);
    }), "n=" + evSql.length + " sql=" + (evSql[0] ? evSql[0].sql.slice(0, 80) : ""));
  } catch (e) {
    fails++;
    console.log("PROBE_CRASH :: " + (e && e.stack || e));
  } finally {
    server.close();
  }
  console.log(fails ? "PROBE FAIL / " + fails : "PROBE ALL PASS");
  process.exit(fails ? 1 : 0);
})();
```

用法与解读：
- 改动前跑：`A1 FAIL`（404 兜底）＋ `A4/A5/A6/A7/A9 FAIL` 是**预期**（本 SPEC 定稿时实跑结果就是 `PROBE FAIL / 6`）；`A2/A3/A8` 会「假通过」（兜底 404 / 重复相同 404），别被它们骗了。
- 探针里 `requireWrite` **恒 403**、`rateLimit` **恒 429**：正确实现不会碰这两个中间件；如果路由误挂 `requireWrite` 或误加 `limit()`，A1…A9 会整片变红——这是故意的。
- A4 除了看响应键，还会检查事件 SQL 的**投影列**（不许出现 `order_id` / `*` / `COALESCE(`），因为 stub 直接返回固定对象、看不出 SELECT 写了什么。
- 改动后跑：末行必须是 `PROBE ALL PASS`。
- 探针只验证路由契约与 SQL 形状，**不**替代 `node work/test-orders.js`（AC-R1/R2），也不替代人工看 390px。

### 附录 B：交付前自检（谁改谁跑）

```bash
# 0) 仓库状态：只应有 1 个授权文件被改（PM 自查：只有 docs/order-system/TIMELINE_SPEC.md）
git status --porcelain 2>/dev/null || ls -l docs/order-system/TIMELINE_SPEC.md
#    注意：本 staging 目录不是 git 仓库，`git status` 会报 fatal；以 `ls -l`/mtime 为准

# 1) 回归
node work/test-orders.js 2>&1 | tail -3          # ORDERS PASS / N checks, N > 138

# 2) 合同探针
node /tmp/probe-events.js | tail -3              # PROBE ALL PASS

# 3) 前端静态四件套
grep -c 'id="timeline-sect"' web/admin/orders/index.html
grep -c 'loadTimeline' web/admin/orders/index.html
grep -c 'code === "auth"' web/admin/orders/index.html
grep -c 'timeline_err_not_found' web/admin/orders/index.html

# 4) 基线未被删改（先确认 baseline 在，且 diff 的 stderr 不能吞掉）
test -f .baseline/test-orders.js && echo BASE_OK
diff -u .baseline/test-orders.js work/test-orders.js 2>&1 | grep '^-' | grep -v '^---' | wc -l   # 期望 0
diff -u .baseline/test-orders.js work/test-orders.js 2>&1 | grep '^-' | grep -v '^---' | grep -c 'ok('  # 必须 0
```

### 附录 C：本文自检结果

- i18n key：第 6 节表格 9 个 key × 3 条文案，与 5.1/5.2/10.3/10.4 中的引用一致。
- AC 编号：AC-A1…A9、AC-F1…F8、AC-R1…R2 全在，无增删编号（第 7 节）。
- 与 TASKS 的关系：合同原文未改；8 条异议集中在第 11 节，逐条给了执行口径。

**验证记录（本 SPEC 定稿时实测，非自我声明）**

1. 附录 A 探针：在**未改动**的仓库上跑 = `PROBE FAIL / 6`（A1/A4/A5/A6/A7/A9 红，A2/A3/A8 假通过，符合 7 节预期）。
2. 在 `/tmp/sim`（复制 `order-api.js` + 按 §9.1 加路由）上跑 = `PROBE ALL PASS`。
3. 同一个探针对 7 个故意写坏的实现全部报警（每个都是 `PROBE FAIL`）：`SELECT` 多带 `order_id`→A4；`COALESCE(note,'')`→A4；误挂 `requireWrite`→12 项；误加 `limit()`→12 项；删存在性检查→A3；删 `ORDER BY`→A5+A7；删 `LIMIT 100`→A7。
4. 把 SEED 的 `id` 改成字符串（模拟 pg int8）后仍 `PROBE ALL PASS`——A7 用 `Number()` 比较，见 11.5。
5. 在 `/tmp/sim2` 按 §9.2 改假库、按 §9.3 加 `eventsTests()`（含 5 键、排序、120 截断、只读四项断言）后：`ORDERS PASS / 147 checks`，`diff` **删除行 0**，`ok(`/`eq(` 计数 107 → 116，三条库级断言仍绿。
6. 前端 grep/awk/sed 判定命令在 `/tmp` 合成页上逐条跑过：F1 的 awk 在「块被挪到 `#dalert` 之后」时输出 `BAD`；F5 的两个 `sed` 范围能区分「只刷新 save」「只刷新 token」；F6 的 `timelineError` 范围避开了基线页本来就有的两处 `role="alert"`；F4 的锚点同时支持 `function loadTimeline` 与 `var loadTimeline = function`。
7. 未实机验证项：AC-F7 的 390px 像素级结论（本 SPEC 只给代码级依据与三种 payload 的测法），按 TASKS/VERIFY 口径由 verifier 用浏览器补。
