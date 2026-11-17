# TIMELINE_TASKS — 订单事件时间线（三层组织运行）

Owner: Chief of Staff（本文件由 CoS 写，经理不得改）
Staging: `/Users/huangminming/Downloads/日常/order-system-mvp`
基线：`node work/test-orders.js` = **ORDERS PASS / 138 checks**（改动前已实测）
约束：不 commit、不部署、不连生产库、不碰 `/Users/huangminming/Pik kwong Lau`。

---

## 1. 文件所有权（硬边界，越界即返工）

| 角色 | 可写文件 | 只读 |
|---|---|---|
| chief-of-staff | `docs/order-system/TIMELINE_TASKS.md`、`TIMELINE_VERIFY.md`、`TIMELINE_REPORT.md`、`.baseline/*` | 全部 |
| timeline-product-manager | `docs/order-system/TIMELINE_SPEC.md` | 全部 |
| timeline-backend-engineer | `work/order-api.js`、`work/test-orders.js` | 其余全部 |
| timeline-frontend-engineer | `web/admin/orders/index.html` | 其余全部 |
| timeline-verifier | `docs/order-system/TIMELINE_VERIFICATION.md` | 全部（只读代码，跑测试，不修） |

现有 `work/order-core.js` **不得修改**（`parseId` 已够用）。
**不新增迁移**：`site_order_events` 已存在于 `work/migrations/036_site_orders.sql`：
`id bigserial PK, order_id bigint, type text NOT NULL, note text, actor text, created_at timestamptz NOT NULL DEFAULT now()`，
索引 `(order_id, created_at DESC)`。

---

## 2. API 合同（唯一真源，以本表为准）

```
GET /api/admin/orders/:id/events
鉴权：requireAdmin（只读，不要 requireWrite）
额外限流：不加（避免测试 429；由 requireAdmin 兜底）
```

| 情形 | 状态码 | Body |
|---|---|---|
| 未登录 / 无 `fc_admin` | 401 | `{ok:false,error:"admin_required"}`（由 requireAdmin 现有实现决定，勿改） |
| id 非正整数（`0`、`-1`、`abc`、`1.5`、空、超大） | **404** | `{ok:false,error:"not_found"}` |
| 合法正整数但订单不存在 | 404 | `{ok:false,error:"not_found"}` |
| 正常 | 200 | `{ok:true,rows:[...]}` |
| 无事件 | 200 | `{ok:true,rows:[]}` |
| DB 异常 | 500 | 交给现有 error middleware，`{ok:false,error:"server_error"}` |

行的形状（严格 **5** 个键，不多不少）：

```json
{ "id": 12, "type": "status", "note": "status: new -> paid", "actor": "owner@example.com",
  "created_at": "2026-11-17T08:12:33.000Z" }
```

- `note` / `actor` 可为 `null`，原样透出，不要 `?? ""`。
- 排序：`ORDER BY created_at DESC, id DESC`（SQL 层排序，不在 JS 里排）。
- 上限：`LIMIT 100`（SQL 层）。
- 只读：不得 INSERT/UPDATE/DELETE，不得在 GET 里写事件。
- 事件 id 校验用 `core.parseId`，与 `PATCH /admin/orders/:id` 保持同一口径（那里也是 404）。

---

## 3. UI 合同

位置：订单详情弹窗（`#modal > .sheet`）内，**Token 区块之后、`#dalert` 之前**，新增一个 `.sect`。

必需 DOM（供静态检查断言，id 必须完全一致）：

- `<div class="sect" id="timeline-sect">`
- `<h3 data-i18n="timeline_section">`
- 容器 `id="dtimeline"`（事件挂在这里）
- 状态元素 `id="dtimeline-status"`（loading / empty / error 文案，`role="status"`）

行为：

1. `openDetail(r)` 里立即进入 loading 态并拉 `/api/admin/orders/${id}/events`。
2. 状态保存（`#savebtn`）成功、token 记账（`#tokenbtn`）成功后**必须刷新时间线**。
3. 空列表 → 显示 `timeline_empty`；失败 → `role="alert"`/错误文案；401 → 沿用 `fetchJson` 已有 `showGate()` 路径（不要捕获后吞掉）。
4. 404 → `timeline_err_not_found`；其他 → `timeline_err` / `err_generic` 之一，须有 i18n key。
5. 每条事件渲染：类型徽标（`created` / `status` / `note`，未知 type 原样显示）、时间（`fmtDate(created_at)`）、`actor`、`note`（`note` 为空则不渲染该行）。
6. 前 100 条已由 API 截断，前端不再截断。

i18n：`I18N` 是 `{key: [zh, en, bm]}`，**每个新 key 必须是长度 3 的数组**。至少包含：

`timeline_section, timeline_loading, timeline_empty, timeline_err, timeline_err_not_found, timeline_actor, timeline_type_created, timeline_type_status, timeline_type_note`

390px：`.modal` 在 `@media(max-width:760px)` 已 `padding:10px`、`.sheet` `padding:18px 14px`。
时间线必须：`min-width:0`、长 `note` `word-break:break-word`、行用 `flex-wrap`、时间与 actor 可换行；
容器不得出现横向滚动（`scrollWidth <= clientWidth`）。

---

## 4. 验收标准（AC，verifier 逐条打勾）

**API**
- [ ] AC-A1 无 cookie → 401，`ok:false`
- [ ] AC-A2 非法 id（`0` / `-3` / `abc` / `1.5` / 空 / 超大）→ **实现必须是 404 `not_found`**；测试断言可放宽为「400 或 404 且非 200」（需求原文写的是 400/404，测试按宽口径写，实现按严口径做）
- [ ] AC-A3 `id=999999`（不存在）→ 404 `not_found`
- [ ] AC-A4 存在且有事件 → 200，`rows` 每行恰好 5 个键 `id,type,note,actor,created_at`（不断言 `typeof id`：线上 `bigserial` 经 `pg` 出参是字符串，假库是 number，两者都接受）
- [ ] AC-A5 排序 `created_at DESC, id DESC`（同一 `created_at` 下 id 大在前）
- [ ] AC-A6 无事件订单 → 200 `rows: []`
- [ ] AC-A7 `LIMIT 100`：插 120 条只回 100 条，且是最新 100 条
- [ ] AC-A8 GET 不产生新事件（读前读后 `db.events.length` 不变）
- [ ] AC-A9 SQL 只含 `SELECT`（对 `site_order_events`）

**前端**
- [ ] AC-F1 静态：`dtimeline` 容器存在且位于详情弹窗内
- [ ] AC-F2 静态：字符串 `/events` API 路径存在
- [ ] AC-F3 静态：新 i18n key 在 `I18N` 中存在且三语数组长度 3
- [ ] AC-F4 静态：401 分支未被吞（引用 `showGate` 或 `code === "auth"` 直通）
- [ ] AC-F5 保存状态后调用刷新；token 记账后调用刷新
- [ ] AC-F6 空/加载/错误三态各有代码路径与文案 key
- [ ] AC-F7 390px 无横向溢出（说明依据；有浏览器则实测）
- [ ] AC-F8 不破坏既有：列表渲染、搜索、状态保存、token、三语切换

**回归**
- [ ] AC-R1 `node work/test-orders.js` 全绿，check 数 ≥ 138（新增后应 > 138）
- [ ] AC-R2 原有 138 条断言一条未删、未弱化（verifier 对照 `.baseline/test-orders.js`）

---

## 5. 组织与顺序

```
lead (root)
└── chief-of-staff-2 (me)
    ├── timeline-product-manager      → SPEC.md        → 必须建 timeline-spec-worker
    ├── timeline-backend-engineer     → order-api.js + test-orders.js → 必须建 timeline-backend-worker
    ├── timeline-frontend-engineer    → index.html     → 必须建 timeline-frontend-worker
    └── timeline-verifier             → VERIFICATION.md（只读，不修）
```

1. CoS 写 TASKS + VERIFY（本步）。
2. PM 产出 SPEC → CoS 验收。
3. backend + frontend **同时**启动（各自拿到 SPEC 路径）。并行区间要记开始/结束时间。
4. 两者完成 → verifier 启动，独立跑测试、独立读 diff。
5. 失败项原路退回 owner 修（verifier 不修）。
6. CoS 审 diff、跑 `node work/test-orders.js`、写 REPORT。

## 6. 返工规则

- 谁的文件谁修；跨文件问题由 CoS 裁决归属。
- 每轮返工必须重跑 `node work/test-orders.js` 并把尾部 5 行贴回。
- 经理不得以“worker 写的”为由推责：经理对最终文件质量负责。

---

## 7. CoS 裁决（对 `timeline-product-manager` 八条异议，2026-11-17）

PM 在 `TIMELINE_SPEC.md §11` 提出 8 条异议，逐条裁决如下，**后续以本节为最终口径**。

| # | 议题 | 裁决 |
|---|---|---|
| 1 | 「六字段」笔误 | **接受**。就是 5 个键 `id,type,note,actor,created_at`。TASKS 已改。 |
| 2 | token 记账不写事件，却要刷新时间线 | **保留刷新，不补 token 事件**。硬约束是 AC-R2：`test-orders.js` 末尾断言「假库 3 条事件（2 created + 1 status）」；给 token 写事件会立刻变红。刷新接口正确、成本极低，为下一期留路径。已知限制记入 REPORT。 |
| 3 | 非法 id：404 还是 400/404 | **实现严口径 404**（与 `PATCH /admin/orders/:id` 同族）；**测试宽口径 400/404**（需求原文就这么写，测试放宽不会掩盖实现错误，因为实现只有 404 一种）。二者不矛盾：一个约束实现，一个约束断言。 |
| 4 | `core.parseId` 接受 `1e3` / `0x10` / `+12` | **接受为既有行为，本期不改 core**。不要把这些写进「格式校验」断言；它们会走到存在性查询并得到 404，结果正确、理由不同。 |
| 5 | `bigserial id` 经 `pg` 出参是字符串 | **接受**。不加 cast；AC 只断言键集合与顺序，不断言 `typeof id`；前端把 id 当不透明值。 |
| 6 | 状态元素 `role="status"` vs 失败 `role="alert"` | **接受单元素切角色**：常驻 `role="status"`，error 时 `setAttribute("role","alert")`，回 loading 切回。禁止新增第二个状态节点。 |
| 7 | `LIMIT 100` 静默截断无「还有更早」提示 | **接受，本期不做**。要做得引进 `truncated` 字段，改变响应形状，收益不抵风险。运营查库。 |
| 8 | AC-F6「三态」漏 404 | **按四态判定**：loading / rows / empty / error{404, 其他}。404 是 error 子态。TASKS AC-F6 已按此改。 |

补充裁决：

- **键集合断言用 `Object.keys(row).sort()`** 与 `["actor","created_at","id","note","type"]` 比较（VERIFY V2-A4 已是这个写法）。
- **排序断言必须造「同 `created_at` 不同 id」的数据**，否则 `created_at DESC, id DESC` 的第二排序键根本没被验到。这是本次最容易假通过的点。
- **`makeFakePool()` 必须为已存在的事件补 `id` 与 `created_at`**（现状只有 `order_id/type/note/actor`）。补的时候保持末尾 `db.events.length === 3` 不变。
- **事件 SELECT 必须由 SQL 完成排序与 LIMIT**，不得在 JS 里 `sort()`/`slice()`。verifier 会在假库里断言 SQL 文本包含 `ORDER BY created_at DESC, id DESC` 与 `LIMIT 100`。
