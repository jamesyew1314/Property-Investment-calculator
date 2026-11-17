# CLIENT_PORTAL Phase 1 — 独立验收报告（PORTAL_VERIFICATION）

- 验收人：`portal-verifier`（depth 2，独立验收；只读代码，只写本文件）
- 验收窗口：2026-11-17 20:56 — 21:08（+08:00；Asia/Shanghai；约 12 分钟）
- 验收对象：`/Users/huangminming/Downloads/日常/order-system-mvp`（staging）
- 交付内容：`work/migrations/037_client_portal.sql`、`work/client-api.js`、`work/order-core.js`、`work/order-api.js`、`work/api-server.js`、`work/test-client.js`、`work/test-orders.js`、`web/client/index.html`、`web/order/index.html`、`web/admin/orders/index.html`、`docs/order-system/PORTAL_SPEC.md`
- 验收方法：先记录哈希与基线，再跑真实命令；随后逐文件对抗性审查（IDOR/认证/枚举/brief/后台/迁移/假库保真/前端），在 `/tmp` 副本上做独立变异测试，并用独立 CDP 探针在 390px 浏览器里验证交互；全程不改仓库业务文件。

---

## 0. 一页结论

**结论：CONDITIONAL PASS（有条件通过）。**

- 无 P1（无阻塞性功能/安全缺陷）。
- **1 个 P2**：后台「进度」表单在打开详情时不会采用 `/detail` 返回的最新 `phase/progress`；列表陈旧或双管理员并发时，点「保存进度」会把客户可见进度回退。`web/admin/orders/index.html:1092-1101`（`renderExtras`）。
- 另有 10 个 P3（测试保真/文档/代码气味/边缘行为），不阻塞但应记录。
- 按 `PORTAL_TASKS.md` §3 的 P4 门禁「无未闭环 P1/P2」，本报告只能给 **CONDITIONAL PASS**；P2-1 修复并复验后可转 PASS。

| 关键项 | 实测 | 判定 |
|---|---|---|
| `node --check`（6 个改动 JS） | 6/6 OK，Node v24.18.0 | ✅ |
| `node work/test-orders.js` | `ORDERS PASS / 304 checks`，`✗`=0，exit 0 | ✅ |
| `node work/test-client.js` | `CLIENT PASS / 218 checks`，`✗`=0，exit 0 | ✅ |
| 原 164 条保留 | 138（`.baseline` 标签）+ 26（时间线标签）= 164，缺失 0；`304−164=140` 为新断言 | ✅（.baseline 快照偏旧，见 P3-1） |
| 独立变异测试 | 7 个变异全部被判红；其中 1 个仅被 SQL 形状断言捕获（P3-2） | ✅ |
| 独立 390px CDP | 27（布局/XSS/回填）+ 7（token 剥离/三语/30s 轮询）+ 8（下单提交体/A1）+ 6（后台按钮/客户变更提交）全绿 | ✅ |
| 假库保真 | SQL 形状/参数编号/ORDER BY/LIMIT/visible 由 SQL 文本解析，不兜底；除 session 过期一处（P3-2） | ✅（有保留） |
| 表面完成 | 未发现；按钮/表单/路由都有真实行为（见 §6） | ✅ |

---

## 1. 证据与可复现命令

### 1.1 环境与哈希（`shasum -a 256`，2026-11-17 21:05 +08:00）

```text
24c8fbd7185afab7cfb3425f84e4173d710bcb6167b06dd55284c3a5776eb852  work/client-api.js
11d2966f15be19f677de5be8cdac012cba0f8e292a0d21b3ef72584748b1595c  work/order-core.js
bfb5105693824921b12a79899b886265a95fcf0f19ca0096bee50eab5212a5c7  work/order-api.js
c64b37e91548b4f6641d5469261574f8a94ada0fb8b2c41bca4d19f8c3eac341  work/api-server.js
0b576aaeb300b2f946c45d1b4b38a10847acebb8cb223d0b01c11859ed0a4d7f  work/test-client.js
9cbfa896dcb8e126d60a9ac99a73240970a0d952fad833008c0f9fc7c0e16f01  work/test-orders.js
2a5e54539a3ad356e90c610c016f84174b7ad4ddeb805fa17894d6945745737b  work/migrations/037_client_portal.sql
d56cd3f61a6ccb61b87f8ef857c01a8db42c7c6288494d4a0c1867cc52120dba  web/client/index.html
383e6dbd9b0be5714f72881f28506c6293067cd17366eaf5e16c27bec9be6875  web/order/index.html
6a1376cc4bb31083c3df43ec450f4a0da95efd33b429ef6727716bb57a96128c  web/admin/orders/index.html
7a3b3f31b92d7fde570761f7b7323841c86853c0080f9fd0ce358a2771b9f245  docs/order-system/PORTAL_SPEC.md
```

基线快照：

```text
43330cb9e5cdf1bb1cd47060c173a8fa51afb1f1e67eb89d40d6f9ec8693f859  .baseline/test-orders.js   （138 checks，见 §2）
30ddfef65ae13af90832a28de7f3eabe2fd9ab425e30414160020575a9010822  .baseline/index.html       （后台订单页旧版）
6144e0b1ccbca7471478109cdc2ee65072fc9f07927a50ebe932145bb19dc4f2  .baseline/order-api.js     （order-api 旧版）
```

文件 mtime（用于 §8 所有权核对）：

```text
2026-11-17 20:30:21  work/migrations/037_client_portal.sql
2026-11-17 20:31:43  work/order-api.js
2026-11-17 20:31:49  work/api-server.js
2026-11-17 20:38:00  work/order-core.js
2026-11-17 20:54:00  work/test-orders.js
2026-11-17 20:54:34  work/client-api.js
2026-11-17 20:54:37  work/test-client.js
2026-11-17 20:32:35  web/order/index.html
2026-11-17 20:46:15  web/client/index.html
2026-11-17 20:49:56  web/admin/orders/index.html
```

### 1.2 真实命令输出（原样）

```text
$ for f in work/client-api.js work/order-core.js work/order-api.js work/api-server.js work/test-client.js work/test-orders.js; do node --check "$f" && echo "OK $f"; done
OK work/client-api.js
OK work/order-core.js
OK work/order-api.js
OK work/api-server.js
OK work/test-client.js
OK work/test-orders.js
$ node -v
v24.18.0

$ node work/test-orders.js
...
✓ 假库最终 2 条订单（含冲突重试）
✓ 假库 5 条 token 流水（成功记账）
✓ 假库 3 条事件（2 created + 1 status）

ORDERS PASS / 304 checks
（exit 0；✓=304，✗=0）

$ node work/test-client.js
...
✓ 客户页：不含文件直传 input

CLIENT PASS / 218 checks
（exit 0；✓=218，✗=0）
```

复跑基线（`.baseline/test-orders.js` + `.baseline/order-api.js` + 当前 `order-core.js`，隔离目录 `/tmp/verify/base`，CWD 仍为仓库根以读取真实页面）：

```text
$ node /tmp/verify/base/test-orders.js
...
ORDERS PASS / 138 checks
（exit 0）
```

> 说明：`.baseline/test-orders.js` 是 **T-004 时间线任务之前**的快照（138 checks），不是本任务开始时的 164 版本；见 P3-1 与 §2 的替代证明。

### 1.3 独立检查（不依赖交付方测试）

- **I18N 独立解析**（`/tmp/verify/i18n-check.js`，直接解析三页 `var I18N = {` 字面量）：
  - client：84 key；order：101 key；admin：131 key。
  - 每个 key 都是非空 `[zh,en,bm]`；EN/BM 无 CJK；`data-i18n`/`data-i18n-ph` 引用 0 缺失；无重复 key。
  - 结果：`I18N CHECK PASS`。
- **动态 key 检查**（`t("...")`/`hasKey("...")` 与 `phase_/payment_/status_/priority_/ledger_/label_` 家族）：literal 引用全部存在；client 的 `ledger_topup/usage/adjust`、`change_admin_note`、`session_expired`、`err_not_found` 等均存在。
- **生产挂载顺序探针**（`/tmp`，独立 Express 实例，按 `api-server.js` 顺序先挂 `/api` order-api 再挂 `/api/client`）：
  - `MOUNT PROBE PASS / 3 checks`：`GET /api/client/me` 返回 401 `auth_required`（不是 404）；`POST /api/client/request-link` 返回 400 `invalid_email`；`GET /api/orders/...` 仍 404。
- **独立 CDP 浏览器探针**（Chrome 157 headless，`Emulation.setDeviceMetricsOverride 390x844`，stub API；脚本在 `/tmp/verify/`）：
  - `CDP PROBE PASS / 27 checks`：三页无横向溢出；client 订单卡→详情；brief 的 `<b>`/`<script>` 以纯文本渲染；详情区无注入 `script/img`；brief 不生成 `<a>`；changes 只生成 http(s) 链接；admin 5 个新区块、弹窗 0 溢出、时间线 localized、付款/进度表单回填、变更行有保存按钮。
  - `CDP BEHAVIOR PASS / 7 checks`：`?token=` 在 verify 后从 URL 剥离且保留 `lang`/`hash`；verify 成功后确实再拉 `/me`；EN/BM/zh 动态换语言；**32 秒内真实多出 1 次 `/api/client/me` 请求（30s 轮询真的在跑）**。
  - `ORDER SUBMIT PROBE PASS / 8 checks`：真实表单提交体含 11 个 brief 字段；`brief.domain`/`brief.notes` 取顶层 `domain`/`notes`（A1）；`asset_links` 为换行切分数组；`listing_count` 为 number；顶层字段与 `contract_accepted` 仍提交。
  - `ACTION PROBE PASS / 6 checks`：后台「保存付款」真实发出 `PATCH .../payment {payment_status}`；「保存进度」真实发出 `PATCH .../progress {phase,progress,note}` 且成功后清空 note；变更行「保存」真实发出 `PATCH /api/admin/changes/...`；客户变更表单真实发出四字段 POST。

### 1.4 迁移静态审查（037）

- 5 张新表：`client_users`、`client_magic_links`、`client_sessions`、`order_updates`、`change_requests`。
- `site_orders` 7 个新列：`client_user_id`、`phase`、`progress`、`payment_status`、`paid_at`、`brief_json`、`launched_at`（全部 `IF NOT EXISTS`，带默认值/可空）。
- 11 个索引：9 个显式索引（`client_users_email_lower_uidx`、`client_magic_links_user_created_idx`、`client_sessions_user_idx`、`order_updates_order_created_idx`、`change_requests_order_created_idx`、`change_requests_status_idx`、`site_orders_client_user_idx`、`site_orders_phase_idx`、`site_orders_payment_status_idx`）+ 2 个 `token_hash UNIQUE` 约束索引 = 11。
- 约束：`site_orders` 的 FK（`ON DELETE SET NULL`）+ 3 个 CHECK（phase/progress/payment_status）；`order_updates` 2 个 CHECK；`change_requests` 2 个 CHECK。
- 授权：5 表 `GRANT ALL` + 5 序列 `GRANT USAGE, SELECT`；`site_orders` 为 036 的表级 GRANT，覆盖新列。
- 事务：整文件 `BEGIN; … COMMIT;`；无 `DROP`/`TRUNCATE`/`DELETE`/类型收窄等破坏性变更。
- 幂等：`CREATE TABLE/INDEX IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`、约束用 `pg_constraint` + `conrelid='site_orders'::regclass` 探测；重复执行语义为 no-op。
- `ON CONFLICT (lower(email))`（client-api）与 `client_users_email_lower_uidx` 的表达式/唯一性匹配，写法有效。
- 未执行：真实 Postgres（本机无 `pg` 驱动/实例），见 §7。

---

## 2. 原始 164 条保留证明（方法、数字、限制）

**结论：164 条原断言全部保留且仍 PASS；无删除、无弱化。** 证明分三层：

1. **文本 diff（相对 `.baseline`）**：
   ```text
   $ diff -u .baseline/test-orders.js work/test-orders.js | grep -c '^-[^-]'
   1
   $ diff -u .baseline/test-orders.js work/test-orders.js | grep '^-[^-]'
   -    forceCollisionOnce: false, savepointRollbacks: 0 };
   ```
   唯一被替换的一行是 `makeFakePool()` 的 `db` 字面量（为新增 `clientUsers/updates/changes/clock` 就地扩展，属 SPEC §7.2 允许项）；其余 902 行为新增。**没有任何断言行被删除或改写。**

2. **标签多重集（行为）**：
   - 隔离运行 `.baseline/test-orders.js`（配 `.baseline/order-api.js` + 当前 `order-core.js`，CWD 指向仓库根以读真实页面）：`ORDERS PASS / 138 checks`。
   - 当前 `work/test-orders.js`：`ORDERS PASS / 304 checks`。
   - 取 138 个基线标签，在当前输出中逐个匹配：**缺失 0 个**。
   - 时间线（T-004）新增标签：`事件时间线：` 16 条 + `后台时间线 UI：` 10 条 = **26 条**，当前全部存在且 PASS。
   - 138 + 26 = **164**；304 − 164 = **140** 条为本门户新增断言（brief/绑定/后台 payment/progress/detail/change/新页面 key 等）。

3. **限制（必须声明）**：`.baseline/test-orders.js` 是 T-004 之前的 138-check 快照，仓库里不存在 164 版本的逐字快照；因此 26 条时间线断言无法用 `.baseline` 做字节级 diff。上面对 26 条的证明是「标签存在且 PASS + 逐段代码审阅（`work/test-orders.js:776-935` 与 `TIMELINE_VERIFICATION.md` 记录一致）」，不是字节级证明。若验收要求「164 逐字快照 diff」，需要先补齐 164 快照（P3-1）。

---

## 3. AC 对照（SPEC §8）

> 重要：`PORTAL_SPEC.md` §8 实际只定义 **AC-P01–P11**（`PORTAL_SPEC.md:442-452`），并**没有** P12–P19 的定义；`PORTAL_TASKS.md:94` 声称「新增 AC-P17~P19」，但只有 review log 的 P2-8 提到 AC-P19。这不是验收人能补写的，按「未定义」处理（P3-8）。

| AC | 判定 | 依据 |
|---|---|---|
| AC-P01 | **PASS（静态）** | 5 表 / 7 列 / 11 索引 / 8 约束 / 2 组 GRANT / BEGIN-COMMIT / 幂等；未在真实 PG 执行（§7） |
| AC-P02 | **PASS** | test-client：存在/不存在邮箱同响应、sendMail throw 仍 200 且 user/link 落库、只存 sha256、20 分钟、一次性、重放/过期 401；独立审阅 SQL |
| AC-P03 | **PASS** | Set-Cookie 逐字 `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`；30 天 session；`no-store` 覆盖 200/400/401/404/429；429 统一体；P3-2 记录「过期 session 行为断言被假库自证」 |
| AC-P04 | **PASS** | `/me` 只回自己、10 key、`created_at DESC,id DESC`、tokens 公式；他人/不存在/非法 id 统一 404 同体；详情 12 key；updates 5 key 且无 actor；changes/ledger 不泄露 |
| AC-P05 | **PASS** | 四字段校验顺序、默认 normal、空 page_url→null、201、9 key、限流 `(20,3600000)`、归属先于 body 校验 |
| AC-P06 | **PASS** | payment 三值、paid→`paid_at`+`status='paid'`+事件、unpaid/refunded 清 `paid_at` 不改 status、404/403/401；progress 双必填/范围、`order_updates`+event、launched_at 首次写/不覆盖 |
| AC-P07 | **PASS** | detail 仅 `requireAdmin`（严格 requireWrite=403/限流=429 下仍 200）；三组 LIMIT 100/排序；change PATCH `empty_patch`/`invalid_status`/`invalid_note`/404/成功更新 |
| AC-P08 | **PASS** | 11 白名单/长度/数量/8000/未知丢弃/URL 协议/NUL/`brief:null`；响应仍 4 键；A1 映射（CDP 实测提交体）；原 164 见 §2 |
| AC-P09 | **PASS（部署映射未验证）** | 三语/30s 轮询（真实 +1 请求）/430px/390px 无溢出/token 剥离/401 回登录；admin 5 区块、时间线窗口、401 引导、`#dbrief`；`/client/` 部署映射不在仓库，见 §7 |
| AC-P10 | **PASS** | 客户 10/12/5/9 key 白名单、admin 7/9/5 key；mail 主题含「登录」「sign in」、正文含 `${siteUrl}/client/?token=` 与「20 分钟 / 20 minutes」 |
| AC-P11 | **PASS** | 两命令真实 exit 0：`ORDERS PASS / 304 checks`、`CLIENT PASS / 218 checks` |
| AC-P12–P18 | **不可判定（SPEC 未定义）** | 见上；不是产品失败，是文档缺陷 P3-8 |
| AC-P19 | **PASS** | 仅由 review log 定义（admin brief 展示）：`#brief-sect/#dbrief/#dbrief-empty` 存在、三语 key、CDP 实际渲染、空对象显示 `brief_empty` |

---

## 4. 缺陷清单

### P1（阻塞）：无

逐项对抗性检查未发现 P1：客户路由全部按 `client_user_id` 归属；他人/不存在订单统一 404；cookie 五 flags 逐字；magic/session 只存 sha256；brief URL 只允许 http(s) 且前端只作文本；后台写接口均 `requireAdmin+requireWrite`；detail 只挂 `requireAdmin`；迁移无破坏性变更。

### P2（应修，阻塞转 PASS）

#### P2-1 后台进度表单不采用 `/detail` 的最新 phase/progress，可能回退客户可见进度

- 文件：`web/admin/orders/index.html:1092-1101`（`renderExtras` 只同步 `dpayment/dpaidat`，不同步 `dphase/dprogress`）；`:946`（`resetExtras` 使用列表行）；`:821`（`openDetail` 先调 `loadDetailExtras(r.id)`，但异步返回后不回填进度表单）。
- 复现（独立 CDP + 双数据 stub，脚本 `/tmp/verify/cdp-stale-progress.js`）：列表返回 `phase=build/progress=45`，`/detail` 返回 `phase=review/progress=80`；打开详情后实测：
  ```json
  { "dphase": "build", "dprogress": "45", "dphaseLabel": "制作" }
  ```
  而同一弹窗的「客户可见更新」已显示 `review 80%`。此时点「保存进度」（即使只想改 note）会 PATCH `{phase:"build", progress:45}`，把客户可见进度写回旧值。
- 为什么重要：进度是客户 dashboard/详情直接展示的字段；双管理员或列表陈旧时会造成静默回退，且 `site_order_events` 会记录一次「合法」的 progress 事件，事后难追溯。
- 建议：`renderExtras(body)` 中用 `body.order.phase/progress` 同步 `#dphase/#dprogress`（或 `resetExtras(body.order)` 后保留 `#dpnote` 输入），并补一条浏览器级回归。

### P3（记录，不阻塞）

1. **`.baseline/test-orders.js` 是 138 快照，不是声称的 164**（`.baseline/test-orders.js`；`TIMELINE_REPORT.md:6` 记录「基线 138 → 164」）。验收第 1 步无法按「strip 新块数 164」原样执行；本报告用 138+26 标签重建（§2）。建议刷新 `.baseline` 或在 TASKS 注明快照代际。
2. **「过期 session → 401」行为断言被假库自证**：`work/test-client.js:224-228` 的 session 查询分支自己检查 `x.expires_at > nowMs()`，不解析 SQL 的 `s.expires_at > now()`；`work/test-client.js:768` 在删除该谓词的变异下仍 PASS，只有 `:736-737` 的 SQL 文本正则把它判红（独立变异 M7）。建议假库只在 SQL 含该谓词时才做过期过滤，或补一条「SQL 文本 + 行为」双断言。
3. **`pollTimer` 字面量是「先启动再立刻停」的凑字面量写法**：`web/client/index.html:1068-1069` 创建 `setInterval(refresh, 30000)` 后立即 `stopPolling()`；真正的启动在 `startPolling()`（`:663`）。行为正确（CDP 实测 30s 轮询），但代码意图误导；建议把字面量放进 `startPolling` 并删除这段。
4. **brief 数组第 11 项超 500 会整包 400，而 SPEC §3 步骤 7 的语序是「先截前 10、再判任一项 >500」**：`work/order-core.js:282` 在 `:284` 截断之前检查所有元素。API 直连客户端若发 11 个链接且第 11 个超长，会被拒而不是静默截断。前端已先切 10 项，影响低。
5. **后台关闭弹窗不复位 5 个新块**：`web/admin/orders/index.html:826-839` 只清时间线；`#dbrief/#dupdates/#dchanges` 保留上一单 DOM，直到下次 `extrasLoading()`。同页同管理员，无越权，属卫生问题。
6. **`mergeRow` 后不 `render()`**：`web/admin/orders/index.html:1097` 用 `/detail` 更新了 `rows/current`，但表格不重绘；关弹窗后列表仍显示旧 tokens/phase，直到下次 load。
7. **非法 JSON 请求体的响应没有 `no-store` 且被统一成 500**：`work/api-server.js:40` 的 `express.json()` 在 client 路由之前抛错，`:1564-1566` 的全局错误处理固定 500；`client-api` 的 no-store 中间件（`work/client-api.js:156-159`）覆盖不到。仅影响畸形请求，不泄露数据。
8. **SPEC §8 只有 P01–P11，P12–P18 未定义**（`docs/order-system/PORTAL_SPEC.md:442-452`；`PORTAL_TASKS.md:94` 却称新增 P17–P19）。AC 追溯不完整，建议补表。
9. **多余日志行**：`work/client-api.js:324` 的 `console.error("client logout failed", ...)` 超出 SPEC §4.1「只允许 client magic mail failed」的字面约束；不含 token，风险低。
10. **`/client/` 部署静态映射不在仓库**（SPEC §6.1/§9-11⑩ 已声明不部署）；`web/order/`、`web/admin/orders/` 同样不在 `api-server.js` 里，属部署层，AC-P09 的「部署映射」只能标未验证。

---

## 5. 独立变异测试（在 `/tmp` 副本上，未改仓库）

方法：把 `work/*.js` + 测试复制到 `/tmp/verify/mut/<M>/work/`，对副本注入单个变异，`cwd` 仍为仓库根（读取真实 `web/` 页面），再跑两个测试。结果如下。

| 变异 | 变异点 | test-client | test-orders | 捕获断言（示例） |
|---|---|---|---|---|
| M1 IDOR | 详情闸门删除 `AND o.client_user_id = $2` | **FAIL 3** | PASS | 「A 请求 B 的订单 → 404」拿到 200 + B 的 brief |
| M2 Cookie | `SET_COOKIE` 删除 `Secure;` | **FAIL 1** | PASS | 「verify Set-Cookie 五 flags 逐字正确」 |
| M3 brief URL | `isHttpUrl` 恒 true（接受 `javascript:`） | PASS | **FAIL 6** | 「logo_url javascript: → 失败」等 |
| M4 一次性 | verify 的 SELECT 删除 `used_at IS NULL` | **FAIL 2 + crash** | PASS | 未知/过期 token 变 500；有效 token 路径随后崩 |
| M5 后台鉴权 | payment 路由去掉 `requireWrite` | **FAIL 1** | PASS | 「viewer PATCH payment → 403」拿到 200 |
| M6 参数编号 | progress UPDATE 改成 `progress=$3 ... WHERE id=$2` | **FAIL 4** | **FAIL 2** | 「progress 更新订单 phase/progress」、SQL 参数编号断言 |
| M7 session 过期 | requireClient 删除 `AND s.expires_at > now()` | **FAIL 1** | PASS | 仅「requireClient SQL = … expires_at > now()」判红；**「过期 session → 401」仍 PASS**（P3-2） |

- M6 证明假库确实按 SQL 的 `$n` 解析参数，不是「按 JS 位置自证」；把参数写反会被写出错误字段并被断言抓住。
- M7 是唯一「行为断言没抓住、只靠 SQL 文本断言」的例子，故列为 P3-2；产品 SQL 本身正确（`work/client-api.js:168` 含 `s.expires_at > now()`）。
- 未发现「删掉关键谓词但两套测试全绿」的情况。

假库保真审阅要点（`work/test-client.js:31-394`）：
- 按 SQL 文本解析投影列、`ORDER BY created_at DESC, id DESC`、`LIMIT`、`visible=true`、`lower(email)` 绑定谓词、`COALESCE/CASE WHEN` 参数；未命中 SQL 会 `throw`（fail-closed），不静默返回空。
- 覆盖 `BEGIN/COMMIT/ROLLBACK/SAVEPOINT`（语义为 no-op，不模拟回滚；这是可接受的测试简化，但意味着「忘记 ROLLBACK」类缺陷不会被抓）。
- 不覆盖真实 PG 的 `now()`/时区/JSONB/唯一索引并发语义。

---

## 6. 是否存在「表面完成」风险

**结论：不存在「表面完成」；但有一处「为字面量而字面量」的代码气味（P3-3）与一个真实 P2。**

证据（不是只看文件存在）：

1. **路由真的挂上**：独立挂载探针按生产顺序先 `/api` 后 `/api/client`，client 路由仍可达；`/api/client` 在 404 fallback 之前；order-api 无 catch-all。
2. **按钮/表单真的提交**（CDP 抓包）：下单页 POST body 含 11 个 brief 字段与 A1 的 domain/notes；后台付款/进度/变更三个按钮各自发出正确 PATCH body；客户变更表单发出 `{title,description,page_url,priority}`。
3. **轮询真的在跑**：32 秒窗口内 `/api/client/me` 请求数 +1；不是只写 `30000` 常量。
4. **token 真的剥离**：`?token=<64hex>&lang=en#sec` 在 verify 后变为保留 `lang=en#sec` 的 URL；verify 后确实再 `GET /me`。
5. **401 真的回登录**：`/me` 401 时 `#login` 显示、`#dash` 隐藏。
6. **i18n 不是占位**：三页 84/101/131 key，三语非空、EN/BM 无中文、所有 `data-i18n` 引用存在、动态 key 家族齐全；CDP 切换 EN/BM/zh 动态标题真实变化。
7. **不是 substring 测试**：API 断言用状态码/JSON 精确值/键集合/顺序；页面检查用位置、窗口、逐 key、调用点数量；变异测试 7/7 被判红。
8. **XSS 真的防住**：brief/change 的 `<b>`、`<script>`、`<img onerror>` 在客户页与后台都以纯文本显示（截图 + CDP 断言 `#d-brief script=0`、`#d-changes img=0`）。

唯一「凑字面量」：`web/client/index.html:1068` 的 `var pollTimer = setInterval(refresh, 30000);` 后立刻 `stopPolling()`（P3-3）。它不造成功能缺失（真实轮询由 `startPolling` 启动），但说明该行是为 SPEC 的字面量断言而写，建议清理。

---

## 7. 未验证项与残余风险（显式）

1. **真实 Postgres**：本机没有 `pg` 驱动/实例，037 未执行；迁移的语法/幂等/约束仅静态审查（AC-P01 标「静态」）。`ON CONFLICT (lower(email))` 的推断依赖 037 的唯一表达式索引，按 PG 语义应成立，但未实测。
2. **真实邮件（SMTP/Resend）**：未发信；`api-server.js` 在本 staging 不可加载（缺 `pg`、`nodemailer` 及 12 个本地模块：`receipt-pdf/mail-layout/report-pdf/library-api/public-api/news/listing-code/agent-api/agent-page/public-page/digest/billplz`），因此挂载与 `mail.log` 脱敏只有静态检查 + 独立挂载探针，不是真实进程验证。
3. **HTTPS/Secure cookie 的浏览器 E2E**：staging 为 HTTP，`Secure` cookie 不会被浏览器回传；测试用手工 `Cookie` 头。生产必须 HTTPS。
4. **部署映射 `/client/`**：仓库内无静态站点配置；`/order/`、`/admin/orders/` 同样依赖部署层。AC-P09 的「部署映射」未验证。
5. **并发**：同一 magic link 并发 verify 依赖 `UPDATE … WHERE used_at IS NULL`（已审阅，未压测）；payment/progress 依赖 `FOR UPDATE`（已审阅，未并发测）；双管理员打开同一单会触发 P2-1。
6. **真实限流**：test-client 注入的是 stub limiter；`api-server.js` 的真实 `rateLimit` 未被加载/实测 429（仅静态确认复用同一实现）。
7. **时钟偏差**：magic/session 过期时间由应用 `Date.now()` 写入，查询用 DB `now()`；两端时钟偏差大时 TTL 会偏移（未测）。
8. **access log 中的 raw token**：首次 `/client/?token=` 的访问日志仍可能含 raw token（SPEC §9-11⑥ 已接受；`replaceState` 不能清服务端日志）。
9. **无过期行清理任务**：magic links/sessions 只增不删（SPEC §9-11⑪ 已接受）；`/me` 无订单上限（§9-11⑧ 已接受）。
10. **邮件枚举时序**：存在/不存在账号响应体一致，但耗时未做恒定时间（§9-11④ 已接受）。
11. **`client_users.name/phone` 当前永远为 null**：没有写入路径，客户资料展示为空；本期合同允许 null。
12. **审计边界**：`site_order_events` 的 payment/progress actor 来自 `req.admin.email`；若管理员邮箱缺失则落 `"admin"`。真实后台会话未在本环境加载。
13. **旧 `.baseline` 与 164 快照**：见 P3-1。

---

## 8. 文件所有权与只读合规

- 交付路径与 `PORTAL_TASKS.md` §4 的所有权表一致：后端 7 个文件在 `work/`，前端 3 个文件在 `web/`；`docs/order-system/PORTAL_SPEC.md` 由 PM 维护。
- **无法用 VCS 证明作者**（仓库无 `.git`）；mtime 只能说明修改时间窗口。可验证的间接证据：
  - `web/` 三个文件是纯浏览器单文件（无 `require(`、无 `express`/`pg`、无 SQL）；
  - `work/` 实现文件不含页面 ID/HTML 结构（只有 `test-orders.js`/`test-client.js` 为断言而引用页面字符串）；
  - 未发现跨层编辑痕迹（页面里没有 DB/服务端代码；后端实现里没有页面结构）。
- 只读合规：验收前后 10 个交付文件 SHA-256 完全一致；仓库内未新增 `work/mail.log`；所有探针/变异脚本都在 `/tmp`；本会话唯一写入是 `docs/order-system/PORTAL_VERIFICATION.md`。`docs/order-system/PORTAL_TASKS.md` 在 20:55 的 mtime 变化由其他 agent 产生，不是本 verifier。

---

## 9. 复验建议（按优先级）

1. **修 P2-1**：`renderExtras` 用 `/detail` 的 `order.phase/progress` 同步 `#dphase/#dprogress`；补一条 390px CDP 回归（列表与 detail 刻意不同，断言表单取 detail 值）。
2. 修 P3-2：让 test-client 的 fake pool 只在 SQL 含 `expires_at > now()` 时才模拟过期，或增加「删谓词必红」的行为断言。
3. 刷新 `.baseline/test-orders.js` 为 164 版本（或在本任务 TASKS 注明 138 代际），避免下一次验收重复解释。
4. 清理 P3-3 的 `pollTimer` 启动即停写法；顺手清 P3-5/P3-6 的 DOM 残留与表格重绘。
5. 补 SPEC §8 的 P12–P19 表（P3-8）。
6. 有真实 PG/SMTP/HTTPS 环境时，补跑 037、magic link 真实投递、Secure cookie 浏览器回传、并发 verify/payment/progress；并确认 `/client/` 部署映射。

---

## 10. 复验判定口径

- 本次 **CONDITIONAL PASS** 的唯一阻塞是 **P2-1**（后台进度表单陈旧值可回退）。
- P3 不阻塞；其中 P3-1/P3-2 是证据/测试保真问题，建议随 P2-1 一起修。
- 若只按「两条命令全绿 + 无 P1」判定，可以写 PASS；但按 `PORTAL_TASKS.md` §3「P4 验收：无 P1/P2 未闭环」的门禁，P2-1 未闭环前本报告保持 CONDITIONAL PASS。

---

## 复验附录（portal-verifier-2, 2026-11-17 21:13–21:20）

> 本附录**只追加**，不删除、不改写上文原裁决。复验对象仍是同一 staging；我只读代码/测试/页面/迁移，唯一写入是本文本附录。全部探针在 `/tmp/pv2/`，未改仓库、未连 DB、未 commit/deploy、未触碰 `/Users/huangminming/Pik kwong Lau`。

### A0. 复验结论

**PASS（原 CONDITIONAL PASS + P2-1 已闭环 → PASS）。**

- 无 P1、**无新 P2**。
- 原 P2-1 的复现路径（列表 `build/45` + `/detail` `review/80` → 打开详情 → 点「保存进度」）已由**本人新写的独立 harness**实测：表单回填 `review/80`，PATCH body 为 `{"phase":"review","progress":80,"note":""}`。
- 同一 harness 跑「只回退本次新增 6 行」的重建页（SHA-256 精确等于原报告记录的修复前哈希）：该场景与另外 3 条断言转红，证明测试对缺陷敏感、修复是闭环点。
- 保留原 P3 与残余风险（见 A6/A7）。新增 1 条 P3：`/detail` 回填会覆盖表单里**尚未保存**的 phase/progress 编辑；新增 1 条流程观察：本次验收窗口内 `PORTAL_SPEC.md`/`PORTAL_TASKS.md` 被其他 agent 修改（见 A1/A5）。

### A1. 文件状态与「唯一代码改动」证明

复验时刻（2026-11-17 21:17 +08:00）的 SHA-256 与 mtime：

| 文件 | SHA-256 | mtime | 相对原报告 |
|---|---|---|---|
| `work/client-api.js` | `24c8fbd7…eb852` | 20:54:34 | 同哈希 |
| `work/order-core.js` | `11d2966f…595c` | 20:38:00 | 同哈希 |
| `work/order-api.js` | `bfb51056…a5c7` | 20:31:43 | 同哈希 |
| `work/api-server.js` | `c64b37e9…c341` | 20:31:49 | 同哈希 |
| `work/test-client.js` | `0b576aae…4d7f` | 20:54:37 | 同哈希 |
| `work/test-orders.js` | `9cbfa896…6f01` | 20:54:00 | 同哈希 |
| `work/migrations/037_client_portal.sql` | `2a5e5453…737b` | 20:30:21 | 同哈希 |
| `web/client/index.html` | `d56cd3f6…0dba` | 20:46:15 | 同哈希 |
| `web/order/index.html` | `383e6dbd…6875` | 20:32:35 | 同哈希 |
| **`web/admin/orders/index.html`** | **`d26d52b5…5d80`** | **21:09:48** | **唯一代码改动**（原 `6a1376cc…128c`） |
| `docs/order-system/PORTAL_SPEC.md` | `792414d6…4385` | 21:11:44 | **文档被并发修改**，见下 |
| `docs/order-system/PORTAL_TASKS.md` | `23b07969…074e` | 21:11:39 | **文档被并发修改**，见下 |

（上表为阅读缩写；**完整 SHA-256 如下**，判断以完整值为准。）

```text
24c8fbd7185afab7cfb3425f84e4173d710bcb6167b06dd55284c3a5776eb852  work/client-api.js
11d2966f15be19f677de5be8cdac012cba0f8e292a0d21b3ef72584748b1595c  work/order-core.js
bfb5105693824921b12a79899b886265a95fcf0f19ca0096bee50eab5212a5c7  work/order-api.js
c64b37e91548b4f6641d5469261574f8a94ada0fb8b2c41bca4d19f8c3eac341  work/api-server.js
0b576aaeb300b2f946c45d1b4b38a10847acebb8cb223d0b01c11859ed0a4d7f  work/test-client.js
9cbfa896dcb8e126d60a9ac99a73240970a0d952fad833008c0f9fc7c0e16f01  work/test-orders.js
2a5e54539a3ad356e90c610c016f84174b7ad4ddeb805fa17894d6945745737b  work/migrations/037_client_portal.sql
d56cd3f61a6ccb61b87f8ef857c01a8db42c7c6288494d4a0c1867cc52120dba  web/client/index.html
383e6dbd9b0be5714f72881f28506c6293067cd17366eaf5e16c27bec9be6875  web/order/index.html
d26d52b5442c7d5509db5763dc1fec7e5d24999832e615adbf891ac5f2ae5d80  web/admin/orders/index.html   ← 唯一代码改动
792414d650abd566ae016f6b963139d41820c58adbfd9d7f4d0c5f9208fc4385  docs/order-system/PORTAL_SPEC.md
23b07969a6cf78e758aa165e48fa6d31fc446399e0b402397ea7281c7b37074e  docs/order-system/PORTAL_TASKS.md
3355c7072d665fe6d622e4008400f13fe3f8914f46852b28b273c652472a5106  docs/order-system/PORTAL_VERIFICATION.md（追加前 312 行）
```

**唯一代码改动的密码学证明**：把当前 `web/admin/orders/index.html` 的 **1101–1106 行（恰好 6 行：4 行注释 + 2 行赋值）** 原样删除，重建文件为 58,638 字节，SHA-256 = `6a1376cc4bb31083c3df43ec450f4a0da95efd33b429ef6727716bb57a96128c`，**与原报告记录的修复前哈希逐字节一致**。即：自 21:05 原验收以来，仓库内**唯一**的代码变更就是这 6 行；`work/**`、两个客户页、迁移、两套测试均未变。

**并发文档修改（不是我做的，必须披露）**：

- `PORTAL_SPEC.md`：21:11:44 mtime，SHA 从原记录的 `7a3b3f31…f245` 变为 `792414d6…4385`，**字节数仍为 55,255**（同长度替换）。当前 §8 仍是 P01–P11（见 A6），行为契约未见变化。
- `PORTAL_TASKS.md`：21:11:39 mtime，字节数从 21:08 的 **8,257 → 8,293（+36 B）**，SHA 现为 `23b07969…074e`；当前第 94 行已写「AC 最终重组为 P01–P09（以 SPEC §8 为准）」，日志仍止于 21:09。
- 这两次写入发生在我的复验窗口内（我在 21:11:30 首次 stat 时二者 mtime 还是 20:31:15 / 21:08:48），只能由并行的 `portal-chief`/其他进程产生。**不影响代码裁决**，但意味着「原报告记录哈希时的文档状态」已不可逐字复现；本附录以**当前**文档内容复核，并把差异记入 A6。

复核命令（原样）：

```text
$ shasum -a 256 web/admin/orders/index.html
d26d52b5442c7d5509db5763dc1fec7e5d24999832e615adbf891ac5f2ae5d80
$ python3 ... # 删除 1101–1106 行
reconstructed 58638 6a1376cc4bb31083c3df43ec450f4a0da95efd33b429ef6727716bb57a96128c
```

### A2. 改动代码审阅（当前行号）

- `renderExtras`：`web/admin/orders/index.html:1092-1111`。新增段 `:1101-1106`：
  - `curPhase` 先取**表单当前合法值**，否则 `"brief"`；`order.phase` 合法才覆盖，非法 phase **不臆造**。
  - `$("dprogress").value = String(clampPct(order.progress))`；`clampPct`（`:538-543`）= `Number` → 非有限数归 0 → `Math.round` → `[0,100]`。
  - **没有触碰 `#dpnote`**（`:1108` 起只渲染 brief/updates/changes），这点与修复声明一致。
- 时序：`openDetail`（`:792-824`）先调 `loadDetailExtras(r.id)`（`:821`）再同步 `resetExtras(r)`（`:822`）。`/detail` 是异步，返回时 `resetExtras` 已用列表行兜底，因此 `renderExtras` 的同步值是最终值；实测列表 `build/45` 被 `review/80` 覆盖。
- 竞态护栏未动：`loadDetailExtras`（`:1114-1138`）依次检查 `seq !== detailSeq`、`$("modal").hidden`、`current.id`；`loadTimeline`（`:913-930`）同样有 `timelineSeq` + modal 检查；`closeDetail`（`:826-839`）同时自增 `detailSeq/timelineSeq`。实测乱序与关闭后迟到响应均被忽略（A3 T4/T8）。
- 付款/进度/变更/时间线逻辑未改：`paybtn`（`:1229`）、`progressbtn`（`:1259`）、`chg-save`（`:1063`）、`loadTimeline`（`:913`）与 `extrasLoading`（`:935`）均在本 6 行之外。实测付款 PATCH、11 项 brief、1 条 update、1 条 change+保存按钮、时间线空态均正常（A3 T5/T5b）。
- 未保存编辑的副作用（**新 P3-11**）：任何 `/detail` 重载（打开详情、付款保存成功后）都会用服务端 phase/progress 覆盖表单里**尚未保存**的编辑；`#dpnote` 不受影响。此行为是为消除「陈旧表单回写」而付出的可接受代价，但运营若先改 phase 再点付款，改动会被回填覆盖。建议后续在 dirty 时禁止回填或提示。

### A3. 独立双数据复现（全新 harness，未复用修复方脚本）

环境：macOS + 真实 **Chrome 157.0.8103.79 headless** + CDP；页面由我新写的 Node 静态服务器按同源提供（**原文件原样**），API 为我的 fake（列表/详情/事件/付款/进度），脚本 `/tmp/pv2/{server.js,verify.js}`。关键断言（**18/18 PASS，0 FAIL**）：

1. **双数据**：列表 `ORD-1 build/45`，`/detail` `ORD-1 review/80` → 打开详情后 `#dphase="review"`、`#dprogress="80"`；点保存 → 服务器收到 `{"phase":"review","progress":80,"note":""}`。原报告 P2-1 的失败路径不再出现。
2. **非法 phase**：`/detail` 返回 `phase="bogus"/progress=80` → 表单为合法的 `build/80`（沿用列表兜底），PATCH 为 `{"phase":"build","progress":80}`，**从不发送 `bogus`**；`#dphase` 选项仍恰好 6 个 PHASES。
3. **clamp**：`/detail` 返回 `progress=150` → 表单 `100`，PATCH `progress:100`，**从不发送 150**。
4. **`#dpnote` 保留**：用 CDP `Input.insertText` 真实输入 `keep-note-保留`，点付款保存触发 `/detail` 重载，`#dpnote` 仍为 `keep-note-保留`；付款 PATCH body `{"payment_status":"paid"}`。
5. **乱序**：打开慢响应 `ORD-1`（延迟 1.5 s）后 120 ms 再打开 `ORD-2`（快响应 `launch/95`）；1.9 s 后表单仍是 `ORD-2 launch/95`，迟到的 `ORD-1` 响应未覆盖。
6. **关闭后迟到**：打开慢详情后立即关闭，1.8 s 后弹窗仍 hidden、表单未被改写（`detailSeq` + modal 护栏）。
7. **其它区块**：`#dbrief` 11 项、`#dupdates` 1 项、`#dchanges` 1 项且有 1 个 `.chg-save`；时间线空态「还没有事件记录。」可见、无错误态。
8. **390×844**：`Emulation.setDeviceMetricsOverride(390,844,1,mobile)` 后：`innerWidth=390`，`documentElement.scrollWidth=390`、`body.scrollWidth=390`、`#modal.scrollWidth=390`，8 个 `.sect` 均 `342`，`#dtimeline=342`；**无横向溢出**。
9. **无 JS 异常**：`window.onerror`/`unhandledrejection` 注入 + CDP `Runtime.exceptionThrown`/`Log.entryAdded` 全程 0 条。

**harness 敏感性（反证）**：把页面换成 A1 的「修复前重建页」再跑同一脚本，结果为 **FAIL / 15 checks，5 FAIL**，其中：
`T1/T1c`（bogus 场景进度未同步、PATCH 45）、`T2`（表单仍 `build/45`）、`T2b`（PATCH `build/45`）、`T4`（慢详情未回填）——正是原 P2-1 的症状。修复页 18/18 PASS，修复前 5 条红，闭环成立。

### A4. 测试、语法与 164 基线

```text
$ node work/test-orders.js   → ORDERS PASS / 304 checks（✓304，✗0，exit 0）
$ node work/test-client.js   → CLIENT PASS / 218 checks（✓218，✗0，exit 0）
$ node --check               → 6 个 JS 全 OK；另把 admin 内联 <script> 抽出后 node --check 也 OK（共 7/7）
```

**164 基线澄清（原 P3-1）**：

- 仓库 `.baseline/test-orders.js` 确为**旧快照**：配 `.baseline/order-api.js` + 当前 `order-core.js` 运行 = `ORDERS PASS / 138 checks`（需 `NODE_PATH=<repo>/node_modules`，否则 express 路由测试被 SKIP 成 95）。
- 找到监督者的 **164 快照** `/tmp/portal-baseline/test-orders.js`（SHA `a5d2d423…7eb2`）：原样运行 = `ORDERS PASS / 164 checks`。
- 该 164 快照与当前 `work/test-orders.js` 的 diff：**删除行仅 1 行**（`makeFakePool()` 的 `forceCollisionOnce/savepointRollbacks` 字面量），新增 659 行；即 164 条断言在新文件中逐字保留。
- 结论不变：仓库内仍没有 164 快照，**P3-1（仓库基线代际）仍在**；但「164 条保留」现在有 164 快照实跑 + 138/26 标签 + 单行 diff 三重证据，原报告 §2 的方法与数字成立。

### A5. P2-1 是否闭环（结论：**闭环**）

按原 P2-1 的**定义性复现**逐项核对：

| 原缺陷要素 | 本次实测 | 结论 |
|---|---|---|
| 列表陈旧 `build/45`，`/detail` 新 `review/80` | 表单回填 `review/80` | 已修 |
| 点「保存进度」PATCH 旧值 | PATCH `{"phase":"review","progress":80}` | 已修 |
| 只想改 note 也会回退 | note 路径不再触发旧 phase/progress | 已修 |
| 非 PHASES phase 不得臆造 | `bogus` → 合法 `build`，PATCH 合法 | 已修/有防御 |
| 进度越界 | `150 → 100` | 已防御 |
| `#dpnote` 不被清 | 输入后经 `/detail` 重载仍在 | 未破坏 |
| 乱序/关闭护栏 | 迟到响应被忽略 | 未破坏 |

**明确边界（不软化）**：P2-1 修的是「打开详情时表单不采用 `/detail` 最新值」。它**不**等于并发安全：`PATCH /progress` 仍是 `SELECT … FOR UPDATE` 后**无条件 UPDATE**（`work/order-api.js:368-378`），没有版本号/旧值 CAS。若 A 打开详情（80）后 B 改成 90、A 再保存 80，仍会回退。这是**既有的 last-write-wins 语义**，属于原报告 §7-5 的「并发未压测」风险，不是本次 6 行修复引入的新 P2；但运营上不能宣称「双管理员已安全」。若要彻底消除，需要服务端加 `expected_progress/expected_updated_at` 或行版本冲突 409。

### A6. 对原报告的事实更正（均可复核）

1. **`PORTAL_SPEC.md` §8 的 AC 范围**：当前 `docs/order-system/PORTAL_SPEC.md:442-452` 只有 11 行，逐字为：
   ```text
   442 | AC-P01 | 037 可重复执行；5 新表、site_orders 7 列、11 索引、约束、GRANT 齐全 | SQL review ×2
   443 | AC-P02 | request-link 对存在/不存在账号响应完全一致；邮件失败仍 200；magic link 只存 sha256、20 分钟、一次性；重放/过期 401 | test-client
   444 | AC-P03 | verify 建 30 天 session，cookie 五 flags 逐字正确；所有 client 响应 `Cache-Control: no-store`，429/错误体一致 | test-client
   445 | AC-P04 | `/me` 只回自己的单，排序/字段/token 公式正确；他人/不存在订单一律 404，无 actor 泄露 | test-client
   446 | AC-P05 | changes 四字段校验、默认值、201、限流 | test-client
   447 | AC-P06 | payment 三值、paid 副作用、事件、404/403/401；progress 双必填、范围、order_updates+event、launched_at | test-client + test-orders
   448 | AC-P07 | admin detail 只挂 requireAdmin、三组 LIMIT 100/排序；change PATCH 三错误码 + 成功更新 | test-client + test-orders
   449 | AC-P08 | brief 11 白名单/长度/数量/8000/未知丢弃/URL 协议/NUL；响应不变；order 页既有 164 不弱化并提交 A1 映射 | test-orders
   450 | AC-P09 | client 页三语/30s 轮询/430px/token 剥离/401 回登录/部署映射；admin 页新 5 区块、时间线 5 项检查、401 引导、`#dbrief` | test-client + test-orders + 人工/部署
   451 | AC-P10 | 客户/后台响应 key 白名单精确；mail 主题/正文/站点链接正确 | test-client
   452 | AC-P11 | 两命令全绿：`node work/test-orders.js`、`node work/test-client.js` | 真实输出 |
   ```
   **没有 AC-P12–P19**；以 `AC-P12`…`AC-P19` 及独立 `P12`…`P19` token 搜索均为 0 命中（review log 的 `P2-12` 等编号不是 AC）。原报告「§8 只定义 P01–P11」的核心判断**正确**，但两处引用需更正：
   - 当前 `PORTAL_TASKS.md:94` 写的是「AC 最终重组为 **P01–P09**（以 SPEC §8 为准）」，**没有**「新增 AC-P17~P19」字样；`P17/P18/P19` 在当前 SPEC/TASKS 中 `grep` 0 命中。原报告 §3 注与 P3-8 对 `TASKS:94` 的引述**与当前文件不符**（若 21:08 时确实如此，则 21:11:39 的并发编辑已改掉，见 A1）。
   - 当前 `PORTAL_SPEC.md:488`（review log P2-8）写的是「…`brief-sect/dbrief/dbrief-empty`，**AC-P09**」，不是 AC-P19；原报告 AC 表里的 **AC-P19 PASS 行没有对应的 SPEC 条款**，应视为「review log 的 UI 观察」，其事实（`#brief-sect/#dbrief/#dbrief-empty` 存在、三语、空态）已由 AC-P09 覆盖。P3-8 仍成立（§8 无 P12–P19）；`PORTAL_TASKS.md:94` 是 20:23–20:27 的**历史日志**并注明「以 SPEC §8 为准」，不构成「要求的 AC 被删」，但与 SPEC 现有 11 条并列时容易被误读为 P01–P09，建议在日志里补一句「§8 最终 11 条」。
2. **行号引用**：原 P2-1 写 `openDetail` 在 `:821`，实际在 **`:792`**（修复前后都在 792，因为 6 行加在 1101）；`renderExtras` 修复前实际跨 **`:1092–1105`**（不是 1092–1101），修复后 **`:1092–1111`**。这些只是引用偏移，不影响原缺陷判断。
3. **`.baseline` 代际**：原报告 P3-1/§2 说 `.baseline` 是 138 快照、仓库无 164 快照——**正确**；补充：`/tmp/portal-baseline/test-orders.js` 的 164 快照实跑 164 PASS，且与当前文件仅 1 行删除差异（A4）。建议仍把 164 快照刷新进仓库 `.baseline`，否则下一轮验收还要重复解释。
4. **只读合规句**：原报告 §8 写「验收前后 10 个交付文件 SHA 完全一致」只适用于**原验收窗口**；本次复验时 `web/admin/orders/index.html` 已在 21:09:48 被修复（哈希变化是预期的），其余 9 个仍一致。我的唯一写入是本附录；`PORTAL_SPEC.md`/`PORTAL_TASKS.md` 的 21:11 变化不是我。
5. **原 P3-5/P3-6 仍成立**：`closeDetail` 仍只清时间线（brief/updates/changes 保留到下次 `extrasLoading`）；`renderExtras` 里 `mergeRow` 后仍不 `render()`（表格要等下次 load；进度/付款保存路径自己调了 `render()`）。二者都在本次 6 行之外，未被修复影响。

### A7. 未验证项与残余风险（不放宽）

1. **真实 Postgres**：未连库、未跑 037；所有 SQL 形状/约束/幂等仍是静态审查 + fake pool。`ON CONFLICT (lower(email))`、`FOR UPDATE`、CHECK、GRANT 的真实 PG 行为未实测。
2. **真实 SMTP/Resend**：未发信；`api-server.js` 在本 staging 仍不可完整加载（缺 `pg`、`nodemailer` 及本地模块），挂载/脱敏只有静态 + 独立挂载探针。
3. **HTTPS/Secure cookie 浏览器 E2E**：staging 为 HTTP，`Secure` cookie 不会回传；测试用手工 `Cookie` 头。生产必须 HTTPS。
4. **`/client/` 部署映射**：仓库无静态站点配置；`/order/`、`/admin/orders/` 同样依赖部署层。AC-P09 的「部署映射」仍未验证。
5. **并发**：magic link 并发 verify、payment/progress 并发写均未压测；progress 为 last-write-wins（A5 边界），双管理员在「详情已打开、对方又改」的窗口仍可回退；无 409/CAS。
6. **真实限流**：test-client 用 stub limiter；`api-server.js` 的真实 `rateLimit` 未加载实测 429。
7. **本复验的浏览器边界**：我用真实 Chrome + CDP，但 API 是 fake 同源 stub，不是真实 Express/DB/管理员会话；390px 只测 `scrollWidth` 与 JS 异常，未做像素级视觉 diff；只跑了默认 zh，未重跑 EN/BM 动态切换（原报告已独立测过，页面本次只动 6 行、I18N 未改）。
8. **时钟偏差/access log raw token/过期行清理/邮件枚举时序**：与原报告 §7 相同，未新增证据。
9. **文档并发写**：验收窗口内 SPEC/TASKS 被其他 agent 改动（A1），说明当前多 agent 流程没有「验收期间冻结文档」；建议冻结后再复验哈希。

### A8. 只读合规与耗时

- 只读：未改任何代码/测试/页面/迁移；未 commit、未 deploy、未连 DB；未触碰 `/Users/huangminming/Pik kwong Lau`。
- 临时物：全部在 `/tmp/pv2/`（`server.js`、`verify.js`、`admin-prefix-reconstructed.html`、输出/截图目录）；仓库内唯一写入 = 本附录。
- 复验窗口：2026-11-17 21:13 — 21:20（+08:00，约 7 分钟）；21:17 完成主要证据，21:18 首版落盘，21:19–21:20 校订（补全哈希/AC 原文/时间）。

### A9. 最终裁决

**PASS**：原 CONDITIONAL PASS 的唯一阻塞 P2-1 已按定义复现路径闭环（独立 Chrome/CDP + 修复前反证 + 304/218 全绿 + 390px 无溢出无异常）；无 P1、无新 P2。原 P3 与 A7 未验证项保留，不因本次 PASS 而消失。

