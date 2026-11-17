# 客户建站门户 Phase 1 — 交付报告（T-005）

- 任务：staging `/Users/huangminming/Downloads/日常/order-system-mvp` 开发客户建站门户 Phase 1
- 付款方式：B — 银行转账 / 人工确认（未接 Billplz）
- 登录方式：邮箱 magic link
- 总管：`portal-chief`
- 开始 / 完成墙钟：2026-11-17 20:09:25 → 21:20（约 71 分钟）
- 结论：**PASS（独立验收：原 CONDITIONAL PASS + 唯一 P2-1 修复并复验闭环）**；双测试全绿。详见 §8 与 `PORTAL_VERIFICATION.md`。
- 未 commit、未部署、未连生产 DB、未碰 `/Users/huangminming/Pik kwong Lau`。

## 1. 交付物（真实路径）

### 数据库
- [037_client_portal.sql](/Users/huangminming/Downloads/日常/order-system-mvp/work/migrations/037_client_portal.sql)（127 行）
  - `client_users` / `client_magic_links` / `client_sessions`
  - `site_orders` + `client_user_id`、`phase`、`progress`、`payment_status`、`paid_at`、`brief_json`、`launched_at`
  - `order_updates` / `change_requests`
  - 幂等 DDL、CHECK、FK、11 个索引（9 显式 + 2 unique）、GRANT、序列 GRANT

### 后端
- [client-api.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/client-api.js)（406 行，`/api/client`）
- [order-api.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/order-api.js)（524 行）
- [order-core.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/order-core.js)（302 行）
- [api-server.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/api-server.js)（1571 行，仅 3 处集成改动：require、挂载、mail.log 脱敏）
- [test-client.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/test-client.js)（1155 行）
- [test-orders.js](/Users/huangminming/Downloads/日常/order-system-mvp/work/test-orders.js)（1456 行；原 164 条保留）

### 页面
- [web/client/index.html](/Users/huangminming/Downloads/日常/order-system-mvp/web/client/index.html)（1074 行）
- [web/order/index.html](/Users/huangminming/Downloads/日常/order-system-mvp/web/order/index.html)（658 行）
- [web/admin/orders/index.html](/Users/huangminming/Downloads/日常/order-system-mvp/web/admin/orders/index.html)（1290 行）

### 文档
- [PORTAL_SPEC.md](/Users/huangminming/Downloads/日常/order-system-mvp/docs/order-system/PORTAL_SPEC.md)（505 行，v1.1）
- [PORTAL_TASKS.md](/Users/huangminming/Downloads/日常/order-system-mvp/docs/order-system/PORTAL_TASKS.md)
- [PORTAL_VERIFICATION.md](/Users/huangminming/Downloads/日常/order-system-mvp/docs/order-system/PORTAL_VERIFICATION.md)（独立验收，见 §8）
- 本文件 `PORTAL_REPORT.md`

SHA-256（交付时实测）：

```
2a5e5453…  037_client_portal.sql
24c8fbd7…  client-api.js
11d2966f…  order-core.js
bfb51056…  order-api.js
c64b37e9…  api-server.js
0b576aae…  test-client.js
9cbfa896…  test-orders.js
d56cd3f6…  web/client/index.html
383e6dbd…  web/order/index.html
d26d52b5…  web/admin/orders/index.html（P2-1 修复后）
792414d6…  PORTAL_SPEC.md
b9bb210f…  PORTAL_VERIFICATION.md
```

## 2. 组织树与并行区间

```
lead
└── portal-chief（总管，不写业务代码）
    ├── portal-product-manager（PM）
    │   └── portal-spec-worker（独立 SPEC 审稿，只读）
    ├── portal-backend-engineer
    │   └── portal-backend-worker（独立测试/审查，只读 repo）
    ├── portal-frontend-engineer
    │   └── portal-frontend-worker（独立 390px/三语审计，只读 repo）
    └── portal-verifier（独立验收，只读，只写 PORTAL_VERIFICATION.md）
```

- 最大并发：实施期 **4**（backend + frontend + 各自 worker）；PM/审稿已结束，未超“一次最多 4 个 agent”。
- 并行区间：
  - P1 SPEC：20:12–20:31（PM 与 spec-worker）
  - P2 实施：**20:28:39–20:55**（backend ∥ frontend；20:42–20:55 两 worker 并行复核）
  - P3 验收：20:56–见 §8（verifier 独立）
- 文件所有权未越界：
  - backend 写 `work/**`（20:30–20:54），frontend 写 `web/**`（20:32–20:49）；
  - 无 git，按 mtime/内容归属核对，未发现交叉写入。
  - 未生成 `work/mail.log`；无 `.env`/DB/网络副作用。
- 总管未写业务代码；只写 `PORTAL_TASKS.md` / `PORTAL_REPORT.md`，并做集成复跑与审阅。

## 3. 测试证据（真实输出）

### 3.1 基线（实施前）

```
$ node work/test-orders.js
ORDERS PASS / 164 checks
```

### 3.2 最终（总管 20:55:38 复跑，exit 0）

```
$ node work/test-orders.js
✓ status-only PATCH 保留原 admin_note（未提供字段保持原值）
✓ 假库最终 2 条订单（含冲突重试）
✓ 假库 5 条 token 流水（成功记账）
✓ 假库 3 条事件（2 created + 1 status）
ORDERS PASS / 304 checks

$ node work/test-client.js
✓ 客户页：断点 @media (max-width: 430px)
✓ 客户页：有回下单页链接 /order/
✓ 客户页：icon 带版本号 ?v=client1
✓ 客户页：不含文件直传 input
CLIENT PASS / 218 checks
```

- 无 `✗`：两个输出各 0 条失败；退出码均 0。
- `node --check` 6 个 JS 全部通过。

### 3.3 原 164 条不删不弱化

- 总管在实施前（20:28）保存了 164 版快照 `/tmp/portal-baseline/test-orders.js`；`diff -u` 当前文件 vs 该快照：**1 行删除（fake pool 初始化对象扩字段）/ 659 行新增，0 条原有断言行被删/改**；原 79 个唯一断言 label 全部仍在。verifier-2 实跑该快照仍为 **164 PASS**。
- backend 另做剥离验证：去掉新增三块后仍为 `ORDERS PASS / 164 checks`。
- 注意：仓库 `.baseline/test-orders.js` 是更早的 **138-check** 快照（T-004 时间线之前），不是本任务 164 基线；verifier 用「138 旧标签 + 26 时间线标签 = 164，缺失 0」作替代证明。

### 3.4 变异测试（证明测试不是假绿）

backend worker 在 `/tmp` 副本植入 13 个缺陷，全部至少被一条断言抓住（`$n` 参数错位、payment/progress/change SQL 列错位、丢 `status='paid'`、`CASE→$3`、`COALESCE→$1`、tokens 符号翻转、丢 `COALESCE(SUM)`、丢 `::float8`、丢绑定谓词、`LIMIT 50→100`、丢 `visible=true`、丢 `no-store` → 11 类触发失败）。
verifier 另做独立变异（见 `PORTAL_VERIFICATION.md`）。

### 3.5 页面与 390px（frontend worker 真实 Chrome CDP）

- 静态：`PORTAL-FRONTEND PASS / 426 checks`（复用 test-orders 的 pageChecks/timelineUiChecks + 新断言）
- 浏览器：`BROWSER PASS / 162 checks`（390×844，fake 同源 API，登录→dashboard→detail→变更表单；下单→成功；后台详情/付款/进度/变更）
- `documentElement.scrollWidth = body.scrollWidth = 390`，**0** 个元素 `right > 390`：
  - client login/dashboard/detail、order form/brief/success、admin list、admin modal top/extras/changes
- 截图（12 张，390×844）在 `/tmp/portal-shots/`：
  `client-login-390.png`、`client-dash-390.png`、`client-detail-390.png`、`order-390.png`、`order-brief-390.png`、`order-success-390.png`、`admin-list-390.png`、`admin-detail-top-390.png`、`admin-detail-extras-390.png`、`admin-detail-changes-390.png`、`admin-detail-en-390.png`、`admin-detail-bottom-390.png`
- I18N：client **84** keys、order **101**、admin **131**；全部 `[zh,en,bm]` 非空；EN/BM **0** 中文；0 悬空 `data-i18n` 引用。

## 4. 功能逐条对照

| 要求 | 实现 | 证据 |
|---|---|---|
| 037 三张客户表 + site_orders 7 列 + order_updates + change_requests | 全部落地，幂等/CHECK/索引/GRANT | 迁移 127 行；verifier 静态审 |
| request-link 不泄露存在性、20 分钟、绑订单、邮件失败不失败 | `ON CONFLICT (lower(email))`、事务绑定、COMMIT 后发信、catch 只记录 | test-client request-link 组 |
| verify 一次性、30 天 session、httpOnly/Secure/SameSite=Lax | hash 存储、原子消费、`Set-Cookie` 逐字 flags | test-client verify 组 |
| /me 只回自己订单 + 10 字段 + token 余额 | `client_user_id` 作用域 + 既有余额公式 | test-client session/me + IDOR |
| /orders/:id 详情 + brief + updates(visible) + ledger + changes | 归属闸门 404、LIMIT、无 actor 泄露 | test-client IDOR/detail |
| 客户提交变更请求 | 四字段校验、201、限流 20/h | test-client changes |
| 公共下单 brief 11 字段、长度/数量/总长 | normalizeBrief + 白名单 + 400 `field:brief` | test-orders brief 组 |
| 后台 payment paid→paid_at/status/事件 | 三值校验、事务、事件 | test-orders + test-client |
| 后台 progress→order_updates + 事件 + launched_at | 双必填、0–100、首次 live 写 launched_at | 两套测试 |
| 后台 detail | 只挂 requireAdmin、三组 LIMIT 100、visible=false 可见 | 两套测试 + 恒 403 stub |
| 后台 changes PATCH | empty/invalid/404/成功、CASE 语义 | 两套测试 |
| 客户页 magic link + dashboard + detail + 30s 轮询 | 真实 fetch/轮询/401/token 剥离/三态 | 静态 + 浏览器 162 检查 |
| 下单页 brief 不动既有 164 | 只增字段，A1 domain/notes 复用 | pageChecks 原断言全绿 |
| 后台 5 区块 + 时间线不破坏 | 时间线 5 项静态检查仍绿 | frontend 426 检查 |

## 5. 发现并修复的缺陷

### SPEC 阶段（PM + spec-worker）
- **7 P1 / 21 P2** 全部闭环，详见 `PORTAL_SPEC.md` §10。代表性：
  - requireClient 哈希/`req.client` 合同缺失；
  - 既有 fake pool 必须“就地扩展” INSERT 分支，否则原 164 变红；
  - payment/progress `FOR UPDATE`、detail/list 精确 SQL、progress 三语句参数；
  - brief URL 存储型 XSS、NUL 导致 jsonb 500；
  - 客户端 verify 后必须再拉 `/me` 才有 orders；
  - admin `#detail-status`、切语言刷新动态区、`TYPE_KEY.payment/progress`。

### 实施阶段（backend）
- 连接在 SMTP 期间被占用（pool max 5）→ 先 release 再发信。
- 坏 `%` 编码 cookie 遮蔽后续合法同名 cookie → `continue`。
- fake pool 位置参数映射会掩盖 `$n` 错位 → 改为从 SQL 文本解析参数/列名，并加 SQL 形状断言；13 个变异全部能被抓住。
- `normalizeBrief(null)` 与 v1.1 冲突 → 改为 400；`brief_json` 对象化；限流 429 统一错误体 + no-store。
- NUL 会令 Postgres text 500 → change/note 入参统一去 NUL（偏离 SPEC 的放宽，已记录）。

### 实施阶段（frontend）
- 修订版 SPEC 新增 `#detail-status` 未实现 → 补齐 loading/404/网络错误，失败时 brief 不再伪装为空。
- client `#dash-loading/#dash-status` 未用 → 接上加载/错误态。
- 按钮恢复用 `.then`（异常时不恢复）→ `.finally`。
- session 过期文案误用登录失效 → 新增 `session_expired`。
- 390px 下 28px 点击目标 → `min-height:36px`；空状态条、时间线徽标配色、media query 字面量修正。
- 早期 `history.replaceState` 顺序会残留 token → 成功/失败路径幂等剥离。

### 独立验收发现（verifier，P2-1，阻塞）
- **后台进度表单不采用 `/detail` 最新值**：列表 `build/45`、`/detail` `review/80` 时，打开详情后表单仍是 `build/45`；点「保存进度」会 PATCH `build/45`，把客户可见进度从 80 回退到 45。
- 修复（`web/admin/orders/index.html:1092-1107`）：`renderExtras` 在 `mergeRow` 后同步 `#dphase`（PHASES 白名单，非法值保留表单已有合法值）与 `#dprogress`（`clampPct`）；不清空 `#dpnote`，保留 `detailSeq` 竞态保护。
- 修复验证：双数据场景 22/22 PASS（修复前 12 PASS/7 FAIL）；`renderExtras` 6 行回退重建页哈希精确等于修复前 `6a1376cc…`，同一 harness 5 条转红。
- 复验（verifier-2 独立 harness，非复用修复方脚本）：18/18 PASS，0 FAIL；PATCH body 为 `{"phase":"review","progress":80}`；`bogus` phase 不发非法值；`progress=150→100`；输入中的 `#dpnote` 经 `/detail` 重载仍保留；迟到响应不覆盖当前单。**P2-1 闭环，结论转 PASS。**

### 集成阶段（总管）
- 双测试复跑 304/218 全绿；`node --check` 全过；无 `mail.log`、无禁用模式（WebSocket/文件直传/Billplz）。
- 原 164 保留以 diff + label 覆盖双重核验。

## 6. 未完成 / 未验证（诚实清单）

1. **未在真实 Postgres 执行 037**：无 `psql`/DB，迁移、约束、GRANT、`ON CONFLICT (lower(email))`、int8→string 均为静态审查；fake pool 可能掩盖 PG 方言差异。
2. **无真实 SMTP/Resend 投递**：仅 stub；`mail.log` 脱敏为静态检查，未真实发信。
3. **无 HTTPS 浏览器 cookie E2E**：`Secure` cookie 在本地 HTTP 不会回传；浏览器测试用 fake 同源 API/手工 cookie。
4. **`/client/` 部署映射未验证**：本任务只交 HTML，未部署；需部署层把 `/client/` 映射到该文件。
5. **无真实并发**：magic link 原子消费、订单绑定、session 过期仅逻辑/串行测试。
6. **状态双轨**：`status` 与 `phase` 不自动同步；payment=paid 会把已 live 订单 status 回退为 paid（合同字面，A4 风险）。
7. **`admin_note` 对客户可见**：按合同设计，运营不得写内部备注。
8. **`/me` 无订单上限**；magic link/session 过期行无清理任务/索引。
9. **首次 `/client/?token=` 可能进 Web 服务器访问日志**：`replaceState` 不能清除已到达服务器的 URL；部署层需关闭/轮转该路径日志。
10. **390px 只测 390**：391–430px 未扫；管理端 stale-response 竞态仅静态验证。

## 7. 墙钟

| 阶段 | 起 | 止 | 用时 |
|---|---|---|---|
| 侦察 + 基线 | 20:09:25 | 20:12 | ~3 min |
| SPEC（含审稿/修订） | 20:12 | 20:31 | ~19 min |
| backend ∥ frontend 实施 | 20:28:39 | 20:55 | ~26 min |
| 集成复跑 | 20:55:38 | 20:56 | ~1 min |
| 独立验收（verifier） | 20:56 | 21:08 | ~12 min |
| P2-1 修复 + 复验（verifier-2） | 21:09 | 21:20 | ~11 min |
| 总计 | 20:09:25 | 21:20 | ~71 min |

## 8. 独立验收（portal-verifier / portal-verifier-2）

**最终结论：PASS**（原 CONDITIONAL PASS + 唯一 P2-1 修复并复验闭环）。

- 原 verifier（20:56–21:08，312 行 + 复验附录 171 行）：
  - 无 P1；1 个 P2（后台进度表单陈旧值，见 §5）；10 个 P3（不阻塞）。
  - 独立 7 个变异全部判红；独立 CDP 390px 48 项全绿；双测试 304/218。
  - 证明原 164 条保留（138 旧基线标签 + 26 时间线标签，缺失 0）。
- 修复后 verifier-2（21:13–21:20，独立编写 `/tmp/pv2` Chrome CDP harness）：
  - 双数据场景：表单回填 `review/80`，PATCH `{"phase":"review","progress":80,"note":""}`；18/18 PASS。
  - 反向验证：缺失修复时 5 条断言转红，页面哈希精确回到修复前。
  - 双测试再跑：**ORDERS PASS / 304**、**CLIENT PASS / 218**；6 个 JS + 内联脚本 7/7 `node --check` OK。
  - 唯一代码改动为 `web/admin/orders/index.html`（`d26d52b5…`）；其余 9 个交付文件哈希不变。
  - **最终判定 PASS，无 P1/P2 未闭环。**
- 残余 P3（不阻塞）：仓库 `.baseline` 仍是 138 旧快照；过期 session 行为有 1 条仅靠 SQL 形状断言；client 页 `pollTimer` 有“启动即停”的凑字面量写法；`/detail` 重载会覆盖尚未保存的 phase/progress 编辑（`#dpnote` 不受影响）；文档 AC 编号历史记录已校正。
- 完整证据、哈希、AC 对照、变异表、未验证项见 [PORTAL_VERIFICATION.md](/Users/huangminming/Downloads/日常/order-system-mvp/docs/order-system/PORTAL_VERIFICATION.md)。

## 9. 是否存在“表面完成”风险

**结论：中低风险，不是表面完成。** 独立 verifier 同结论：“未发现‘表面完成’；按钮/表单/路由都有真实行为”。同时 verifier 确实找到一个真实 P2（后台进度表单陈旧值），修复并由 verifier-2 独立复验——这反证不是“测试全绿即放行”。

理由：

- 不是“只有页面没有后端”：双测试真实起 express、走 HTTP、带 fake pool；304 + 218 条断言覆盖 magic link、cookie、IDOR、brief、payment、progress、changes、限流、no-store。
- 不是“只有断言不验行为”：backend 做 13 个变异，全部被测试抓住；fake pool 已改为从 SQL 文本解析 `$n`/列名，降低自我实现式假绿。
- 页面不是静态壳：真实 Chrome CDP 跑了登录→dashboard→detail→变更、下单→成功、后台详情→付款/进度/变更；390px 实测 scrollWidth=390。
- 仍有表面风险的部分：
  1. 真库/真邮件/HTTPS cookie 未验证（最大风险）；
  2. 前端浏览器测试使用 fake 同源 API，不是真实后端进程；
  3. 测试仍以手写 fake pool 为主，PG 方言差异可能漏网；
  4. 首次 token URL 的访问日志、`status`/`phase` 双轨、`admin_note` 可见性属运营/部署风险。
- 因此验收口径应为“**staging 功能完成 + 自动化证据充分；上线前必须补真库迁移、真实邮件、HTTPS cookie E2E 与 `/client/` 映射**”，不能宣称生产已可用。

## 10. 复现命令

```bash
cd /Users/huangminming/Downloads/日常/order-system-mvp
node work/test-orders.js     # ORDERS PASS / 304 checks
node work/test-client.js     # CLIENT PASS / 218 checks
node --check work/client-api.js
```

页面：Chrome 打开
`web/client/index.html`（登录态需 API）、`web/order/index.html`、`web/admin/orders/index.html`。
