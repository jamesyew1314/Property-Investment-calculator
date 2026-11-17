# CLIENT_PORTAL_SPEC — 客户建站门户 Phase 1（产品规格）
> Owner：`portal-product-manager` · 版本：v1.1（2026-11-17，含 spec-worker P1/P2 修订与总管 A1/A2 冻结）
> Staging：`/Users/huangminming/Downloads/日常/order-system-mvp`
> 上游合同：`PORTAL_TASKS.md` §5（冻结口径）＋ 本文件。两者冲突时以 `PORTAL_TASKS.md` 为准。
> 本文是实现合同：backend / frontend 逐字执行；本文出现的 SQL 是**规定形状**（fake pool 也要按它实现），不是建议。
> 写权限：PM 只写本文件；backend 写 `work/*`；frontend 写 `web/*`；互不越界。
## 1. 范围与硬约束
**本期做：** 邮箱 magic link 登录、客户 dashboard（订单阶段/进度/付款/token）、结构化 brief、变更请求（change request）、后台付款确认与进度发布。
**本期不做：** Billplz/任何支付网关、WebSocket、自动 token 计量、文件直传（只存 Drive/Dropbox 链接）、生产 DB、真实邮件投递验证、顺序强约束的状态机。
**基线：** `node work/test-orders.js` = 164 PASS，不删、不改写、不弱化任何既有断言行；最终必须继续 PASS。
**语言/尺寸：** 三个页面 zh / EN / BM；390px 可用；客户页断点明确写 `@media (max-width: 430px)`。
## 2. 数据库迁移 `work/migrations/037_client_portal.sql`
整文件 `BEGIN; … COMMIT;`，可重复执行。角色 `fangchan_app` 已存在（沿用 036 假设）。
### 2.1 新表（按此顺序建，FK 才有着落）
```sql
CREATE TABLE IF NOT EXISTS client_users (
  id bigserial PRIMARY KEY, email text NOT NULL, name text, phone text,
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS client_users_email_lower_uidx ON client_users (lower(email));

CREATE TABLE IF NOT EXISTS client_magic_links (
  id bigserial PRIMARY KEY,
  client_user_id bigint NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_magic_links_user_created_idx
  ON client_magic_links (client_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS client_sessions (
  id bigserial PRIMARY KEY,
  client_user_id bigint NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_sessions_user_idx ON client_sessions (client_user_id);
```
### 2.2 `site_orders` 扩展（全部 `IF NOT EXISTS`）
```sql
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS client_user_id bigint;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'brief',
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS brief_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS launched_at timestamptz;
```
约束用 `DO $$ … pg_constraint … $$` 幂等添加（每条都按此模板，`conrelid = 'site_orders'::regclass`）：
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'site_orders_client_user_fk'
                   AND conrelid = 'site_orders'::regclass) THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_client_user_fk
      FOREIGN KEY (client_user_id) REFERENCES client_users(id) ON DELETE SET NULL;
  END IF;
END $$;
```
同模板另加：`site_orders_phase_chk`（`phase IN ('brief','design','build','review','launch','live')`）、
`site_orders_progress_chk`（`progress BETWEEN 0 AND 100`）、
`site_orders_payment_status_chk`（`payment_status IN ('unpaid','paid','refunded')`）。
**注意：** 先加列（带默认值）再加 CHECK，存量行已满足默认值，约束可正常 validate。
### 2.3 新表 `order_updates` / `change_requests`
```sql
CREATE TABLE IF NOT EXISTS order_updates (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  phase text, progress integer, note text,
  visible boolean NOT NULL DEFAULT true, actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_updates_phase_chk
    CHECK (phase IS NULL OR phase IN ('brief','design','build','review','launch','live')),
  CONSTRAINT order_updates_progress_chk
    CHECK (progress IS NULL OR (progress BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS order_updates_order_created_idx
  ON order_updates (order_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS change_requests (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, page_url text,
  priority text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'open',
  admin_note text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_requests_priority_chk CHECK (priority IN ('low','normal','high')),
  CONSTRAINT change_requests_status_chk CHECK (status IN ('open','in_progress','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS change_requests_order_created_idx
  ON change_requests (order_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS change_requests_status_idx ON change_requests (status);
```
### 2.4 收尾：site_orders 索引 / GRANT
`CREATE INDEX IF NOT EXISTS`：`site_orders_client_user_idx (client_user_id)`、`site_orders_phase_idx (phase)`、`site_orders_payment_status_idx (payment_status)`。
```sql
GRANT ALL ON client_users, client_magic_links, client_sessions,
             order_updates, change_requests TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE client_users_id_seq, client_magic_links_id_seq,
             client_sessions_id_seq, order_updates_id_seq, change_requests_id_seq TO fangchan_app;
```
`site_orders` 已有表级 GRANT，覆盖新列，不重复 GRANT；036 的序列不重复 GRANT。
## 3. `work/order-core.js` 纯函数（不依赖 express/DB）
新增声明加入既有 `module.exports`（既有导出一个都不删）：
`PHASES, PAYMENT_STATUSES, CHANGE_STATUSES, CHANGE_PRIORITIES, BRIEF_KEYS, BRIEF_MAX_TOTAL, normalizeEmail, normalizeBrief`。
```js
const PHASES = ["brief","design","build","review","launch","live"];
const PAYMENT_STATUSES = ["unpaid","paid","refunded"];
const CHANGE_STATUSES = ["open","in_progress","done","cancelled"];
const CHANGE_PRIORITIES = ["low","normal","high"];
const BRIEF_KEYS = ["goal","pages","listing_count","listing_source","domain","logo_url",
  "brand_color","reference_url","asset_links","target_launch","notes"];
const BRIEF_MAX_TOTAL = 8000;
```
- `normalizeEmail(raw)`：`String(raw ?? "").trim().toLowerCase()`；空、长度 >120、不匹配既有 `EMAIL_RE` 时返回 `""`，否则返回归一化邮箱。`EMAIL_RE` 已存在，不改。
- `normalizeBrief(raw)` 返回 `{ok:boolean, value:object|null, error:"brief"|null}`，成功 `{ok:true,value:{…},error:null}`，失败 `{ok:false,value:null,error:"brief"}`。算法必须逐条一致：
  1. `raw === undefined` → 成功但 `value:{}`；`raw === null || typeof raw !== "object" || Array.isArray(raw)` → 失败（`brief:null` 也是 non-object，必须 400）。
  2. `Object.keys(raw).length > 12` → 失败（**未知 key 也计数**；12 个 key 以内、未知 key 忽略）。
  3. 按 `BRIEF_KEYS` 固定顺序遍历，只输出白名单 key，保证 `JSON.stringify` 稳定。
  4. `null`/`undefined` 值视为未提供（跳过）；其余值只允许 string / finite number / string 数组；其他类型（boolean、object、嵌套数组、数组含非 string）→ 失败。
  5. string：先删除 `\u0000`，再 `trim()`，空则丢弃；长度上限 `notes` 为 1000，其余 500，超限 → 失败。保留内部换行，不 squish。
  6. number：`Number.isFinite` 才保留（`0` 保留；不额外做整数/正负限制）。
  7. string 数组：每项删除 `\u0000` 后 `trim()`，去空；**超过 10 项取前 10 项**（不报错）；任一项 >500 → 失败；用 `", "` join 成单个字符串。
  8. **URL 字段安全**：`logo_url`、`reference_url` 的非空值，以及 `asset_links` 的每个元素（字符串值时校验该字符串），必须能被 `new URL()` 解析且 protocol 仅为 `http:`/`https:`；否则失败。只允许普通 URL，不额外限制主机。
  9. `JSON.stringify(value).length > 8000` → 失败（按 JS UTF-16 长度，不按字节）。
  10. 空对象/空数组/空串等同于未提供，不写 key。
## 4. `work/client-api.js`（挂 `/api/client`）
### 4.1 工厂、middleware、统一约定
```js
module.exports = function createClientApi({ pool, sendMail, rateLimit, siteUrl }) { /* 返回 express.Router */ };
```
- `pool` 必填，缺失 `throw new Error("client-api: pool is required")`；`sendMail` 必填，缺失 `throw new Error("client-api: sendMail is required")`；`rateLimit` 非函数时降级为 no-op；`siteUrl` 缺省 `"https://kwongthye.com"`。
- 所有响应 `Cache-Control: no-store`（router 级 middleware，401/404/429 也要有）。
- 所有路由用 `wrap()` 捕获 async 异常交给 `next(e)`；错误体一律 `{ok:false,error:"..."}`，不返回堆栈。
- Cookie 名固定 `fc_client`。自己解析 `req.headers.cookie`（`split(";")` → 第一个 `=` 切分 → `decodeURIComponent` 放 try/catch，坏值忽略）；不新增 npm 依赖。
- `sha256` 用 `node:crypto`；raw token 一律 `crypto.randomBytes(32).toString("hex")`（64 位小写 hex）。
- 设置/清除 cookie 只用 `res.setHeader("Set-Cookie", ...)`，禁止 `res.cookie`，保证 flags 逐字一致：
  - 设置：`fc_client=<raw>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
  - 清除：`fc_client=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
- **日志纪律：** 只允许 `console.error("client magic mail failed", email, e.message)`；任何日志都不得出现 raw token、含 token 的 URL、token hash。
- `requireClient`：无 cookie → `401 auth_required`；否则 `$1 = sha256(cookie 值)`，执行下查（无行 → `401 auth_required`），成功设置 `req.client={id,email,name,phone}`（`id` 即 `client_users.id`）：
```sql
SELECT u.id, u.email, u.name, u.phone
FROM client_sessions s JOIN client_users u ON u.id = s.client_user_id
WHERE s.token_hash = $1 AND s.expires_at > now()
```
  id 不 cast，node-pg 的 int8 会序列化为 JSON string；前端只当不透明 ID。
- 时间：magic link 过期 = `new Date(Date.now() + 20*60*1000)`；session 过期 = `new Date(Date.now() + 30*24*60*60*1000)`（与 `Max-Age=2592000` 对齐）。SQL 里其余时间戳用 `now()`。

路由总表：

| 路由 | 鉴权/限流 | 成功 | 失败 |
|---|---|---|---|
| `POST /request-link` | `rateLimit(5, 600000)` | `200 {ok:true}` | `400 invalid_email`、`429 rate_limited` |
| `POST /verify` | 无 | `200 {ok:true,client}` + cookie | `400 invalid_token`、`401 invalid_token` |
| `POST /logout` | 无 | `200 {ok:true}` | 无（清 cookie 在前；DELETE 失败也 200，仅记录） |
| `GET /me` | requireClient | `200 {ok:true,client,orders}` | `401 auth_required` |
| `GET /orders/:id` | requireClient | `200 {ok:true,order,updates,changes,ledger}` | `401 auth_required`、`404 not_found` |
| `POST /orders/:id/changes` | requireClient + `rateLimit(20, 3600000)` | `201 {ok:true,change}` | `401`、`404 not_found`、`400 invalid_input`、`429 {ok:false,error:"rate_limited"}` |

所有限流失败统一 `429 {ok:false,error:"rate_limited"}`（沿用 `api-server.js:171`）。
### 4.2 `POST /request-link`
1. `email = core.normalizeEmail((req.body||{}).email)`；空 → `400 {ok:false,error:"invalid_email"}`。限流在 handler 之前，所以非法邮箱也占配额。
2. 事务内 get-or-create（唯一索引是 `lower(email)`；按总管 A2 冻结形状，冲突目标写**单一表达式括号** `ON CONFLICT (lower(email))`，不要写双括号，也不要先 SELECT 再 INSERT）：
```sql
INSERT INTO client_users(email) VALUES ($1)
ON CONFLICT (lower(email)) DO NOTHING
RETURNING id, email, name, phone
```
   无返回行时再 `SELECT id,email,name,phone FROM client_users WHERE lower(email) = lower($1)`。
3. 绑定历史订单（**不更新 `updated_at`**，绑定不是订单内容变更）：
```sql
UPDATE site_orders SET client_user_id = $1
WHERE client_user_id IS NULL AND lower(email) = lower($2) AND email IS NOT NULL
```
4. 生成 raw token，算 `sha256`，插入 `client_magic_links(client_user_id, token_hash, expires_at)`（只存 hash）。
5. `COMMIT` 后才发邮件（SMTP 不占事务锁）。邮件：
   - 收件人 = 归一化 email；主题必须同时含中文「登录」与英文「sign in」；
   - 正文必须同时含中文与英文，含完整链接 `${siteUrl}/client/?token=<raw>` 与「20 分钟 / 20 minutes」；
   - `try { await sendMail(email, subject, text); } catch (e) { console.error(...); }`，**失败也返回 200**。
6. 无论账号原本是否存在，响应体、状态码完全一致：`200 {ok:true}`。
7. 不删除/不失效此前未使用的 link；多个 link 各自 20 分钟内一次性有效（见 §9-2）。
### 4.3 `POST /verify`
1. `body = req.body || {}`；`token = typeof body.token === "string" ? body.token.trim() : ""`；不匹配 `/^[a-f0-9]{64}$/` → `400 {ok:false,error:"invalid_token"}`。
2. 事务内查未用未过期 link（hash 查询）：
```sql
SELECT l.id, l.client_user_id, u.email, u.name, u.phone
FROM client_magic_links l JOIN client_users u ON u.id = l.client_user_id
WHERE l.token_hash = $1 AND l.used_at IS NULL AND l.expires_at > now()
```
   无行 → rollback，`401 invalid_token`。
3. 原子消费（并发下只有一个成功；0 行 → rollback，`401`）：
```sql
UPDATE client_magic_links SET used_at = now()
WHERE id = $1 AND used_at IS NULL AND expires_at > now() RETURNING id
```
4. 生成 raw session token，`INSERT INTO client_sessions(client_user_id, token_hash, expires_at) VALUES ($1,$2,$3)`；`UPDATE client_users SET last_login_at = now() WHERE id = $1`；`COMMIT`。
5. 设置 cookie（§4.1）；`200 {ok:true,client:{id,email,name,phone}}`。`name`/`phone` 可以是 `null`，不得兜底成空串。
### 4.4 `POST /logout`
**不挂 requireClient**。先 `res.setHeader("Set-Cookie", <清除串>)`，再在 try/catch 里读 cookie：有值就 `DELETE FROM client_sessions WHERE token_hash = sha256(cookie)`；DELETE 失败只 `console.error`；最后无条件 `200 {ok:true}`。无 cookie 也 200。
### 4.5 `GET /me`
`requireClient` 已把 `{id,email,name,phone}` 挂在 `req.client`；`/me` 直接复用，只查订单（`WHERE o.client_user_id = $1`，`$1 = req.client.id`；`tokens` 公式与 036 完全一致；金额与余额 `::float8`）：
```sql
SELECT o.id, o.order_no, o.phase, o.progress, o.payment_status,
       o.monthly_price::float8 AS monthly_price, o.setup_price::float8 AS setup_price,
       o.created_at, o.updated_at,
       COALESCE((SELECT SUM(CASE WHEN l.kind = 'usage' THEN -l.amount ELSE l.amount END)
                 FROM token_ledger l WHERE l.order_id = o.id), 0)::float8 AS tokens
FROM site_orders o
WHERE o.client_user_id = $1
ORDER BY o.created_at DESC, o.id DESC
```
响应：`200 {ok:true,client:{id,email,name,phone},orders:[…]}`；无订单 `orders:[]`。`orders` 每行**恰好**上述 10 个 key，不额外带 `name/phone/email/status/client_user_id`。
### 4.6 `GET /orders/:id`
1. `id = core.parseId(req.params.id)`；`null` → `404 not_found`（与既有 admin 一致：0、负数、非整数、>2^53 均 null；`"1e3"` 会被 parseId 接受为 1000，这是既有行为，不另造解析器）。
2. 先做归属闸门（**不区分「不存在」与「别人的」**；`$2 = req.client.id`，即 4.1 的 `client_users.id`）：
```sql
SELECT o.id, o.order_no, o.phase, o.progress, o.payment_status,
       o.monthly_price::float8 AS monthly_price, o.setup_price::float8 AS setup_price,
       o.created_at, o.updated_at, o.launched_at, o.brief_json,
       COALESCE((SELECT SUM(CASE WHEN l.kind = 'usage' THEN -l.amount ELSE l.amount END)
                 FROM token_ledger l WHERE l.order_id = o.id), 0)::float8 AS tokens
FROM site_orders o WHERE o.id = $1 AND o.client_user_id = $2
```
   无行 → `404 not_found`，不执行后续查询。
3. 归属确认后按 `order_id` 读三组，**SQL 形状固定如下**（三组都是 `ORDER BY created_at DESC, id DESC`）：
```sql
SELECT id, phase, progress, note, created_at
FROM order_updates
WHERE order_id = $1 AND visible = true
ORDER BY created_at DESC, id DESC LIMIT 50;

SELECT id, title, description, page_url, priority, status, admin_note, created_at, updated_at
FROM change_requests
WHERE order_id = $1
ORDER BY created_at DESC, id DESC LIMIT 100;

SELECT id, kind, amount::float8 AS amount, note, created_at
FROM token_ledger
WHERE order_id = $1
ORDER BY created_at DESC, id DESC LIMIT 100;
```
   updates **不得出现 actor/visible**；changes 9 字段、ledger 5 字段照投影。
4. 响应：`200 {ok:true,order:{…},updates:[…],changes:[…],ledger:[…]}`。`order` **恰好 12 个 key**：`id,order_no,phase,progress,payment_status,monthly_price,setup_price,tokens,created_at,updated_at,launched_at,brief_json`。`brief_json` 原样返回对象（默认 `{}`），不得改 key。
### 4.7 `POST /orders/:id/changes`
1. `requireClient` → 限流 → `parseId`（null → 404）→ 归属 `SELECT id FROM site_orders WHERE id=$1 AND client_user_id=$2`（`$2 = req.client.id`），无行 → 404。**归属检查早于 body 校验**，避免用 400/404 差异探测他人订单。
2. `body = req.body || {}`；校验顺序即报错优先级，未知字段忽略：

| 字段 | 规则 | 失败 |
|---|---|---|
| title | string，trim 后 1–120 | `400 {ok:false,error:"invalid_input",field:"title"}` |
| description | string，trim 后 1–2000（保留内部换行） | `…field:"description"` |
| page_url | 可选；trim 后为空 → null；否则 ≤500 且 `new URL()` 可解析、protocol 只能是 `http:`/`https:`、`username`/`password` 必须为空 | `…field:"page_url"` |
| priority | 可选；trim + lower 后 ∈ low/normal/high；空/缺省 → `normal` | `…field:"priority"` |

3. 插入（`status` 固定 `open`，`admin_note` 为 null，`updated_at` 用默认 `now()`）：
```sql
INSERT INTO change_requests(order_id,title,description,page_url,priority,status)
VALUES ($1,$2,$3,$4,$5,'open')
RETURNING id,title,description,page_url,priority,status,admin_note,created_at,updated_at
```
4. `201 {ok:true,change:{…RETURNING 9 键…}}`。**不写** `site_order_events`，**不写** `order_updates`。
## 5. `work/order-api.js` 扩展
### 5.1 `POST /orders` 接收 `brief`（其余行为/响应不变）
在 `core.normalizeOrder` 通过之后、开事务之前执行 `core.normalizeBrief((req.body||{}).brief)`；失败 → `400 {ok:false,error:"invalid_input",field:"brief"}`。若订单本体和 brief 同时非法，**先报订单本体的 field**（保持既有优先级）。

INSERT 从 13 个参数扩为 14 个，最后一列为 `brief_json`：
```sql
INSERT INTO site_orders
  (order_no,name,phone,email,company,ren_no,area,domain,notes,
   package_code,monthly_price,setup_price,contract_accepted,brief_json)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
```
`$14 = JSON.stringify(brief.value)`（未提供时为 `"{}"`）。插入订单并写 `created` 事件后，若 `v.email` 非空，执行绑定（仍在本事务内）：
```sql
UPDATE site_orders o SET client_user_id = u.id
FROM client_users u
WHERE o.id = $1 AND o.client_user_id IS NULL AND lower(u.email) = lower($2)
```
无匹配用户时 0 行，不算错误。响应**仍为** `201 {ok:true,order:{order_no,status,monthly_price,setup_price}}`（恰好 4 键）。
### 5.2 `ADMIN_SELECT` 增加四列
在既有列清单中加 `o.phase, o.progress, o.payment_status, o.paid_at`；既有列、`tokens` 子查询、`ORDER BY created_at DESC, id DESC LIMIT 200` 全部不动。`GET /admin/orders` 不新增过滤参数。
### 5.3 `PATCH /admin/orders/:id/payment`（`requireAdmin` + `requireWrite`）
Body `{payment_status}`。`parseId` null → 404；只接受 string：`typeof body.payment_status === "string"`，否则（缺失/number/boolean）→ `400 {ok:false,error:"invalid_payment_status"}`；`trim().toLowerCase()` 后不在 `unpaid/paid/refunded` 同样 400。
事务内 `SELECT id,status,payment_status FROM site_orders WHERE id=$1 FOR UPDATE`，无行 → rollback 404。按分支更新：
```sql
-- paid
UPDATE site_orders SET payment_status=$1, paid_at=now(), status='paid', updated_at=now() WHERE id=$2;
-- unpaid / refunded
UPDATE site_orders SET payment_status=$1, paid_at=NULL, updated_at=now() WHERE id=$2;
```
写事件：`INSERT INTO site_order_events(order_id,type,note,actor) VALUES($1,$2,$3,$4)`，参数 `[id,'payment',note,actor]`；note 固定 `payment: <old> -> <new>`（≤800），actor = `req.admin.email`。注意：**unpaid/refunded 不回退 `status`**（合同明确“leave status”）；重复 PATCH `paid` 会刷新 `paid_at`（合同字面）。
`COMMIT` 后用 `ADMIN_SELECT + " WHERE o.id=$1"` 重查，`200 {ok:true,order:<row>}`；重查 0 行 → `404 not_found`。
### 5.4 `PATCH /admin/orders/:id/progress`（`requireAdmin` + `requireWrite`）
Body `{phase, progress, note}`。校验顺序：

1. `phase`：string trim+lower 后必须 ∈ `core.PHASES`，否则 `400 {ok:false,error:"invalid_phase"}`（缺失、空、非 string 同）。
2. `progress`：必须是 JSON number、`Number.isInteger`、0–100；字符串/布尔/小数/越界 → `400 {ok:false,error:"invalid_progress"}`。
3. `note`：可选；用既有 `cleanText`（null/空 → null，其余 `String().trim()`），>500 → `400 {ok:false,error:"invalid_note"}`。
4. `parseId` null → 404；事务 `SELECT id,phase,progress,launched_at FROM site_orders WHERE id=$1 FOR UPDATE`，无行 → rollback 404。

事务内按顺序（每条语句的参数独立编号，**不要把前一条的参数数组直接复用**）：
```sql
-- $1=phase, $2=progress, $3=id
UPDATE site_orders SET phase=$1, progress=$2, updated_at=now() WHERE id=$3;

-- $1=order_id, $2=phase, $3=progress, $4=note, $5=actor
INSERT INTO order_updates(order_id,phase,progress,note,visible,actor)
VALUES ($1,$2,$3,$4,true,$5)
RETURNING id,order_id,phase,progress,note,visible,actor,created_at;

-- $1=order_id, $2='progress', $3=note, $4=actor
INSERT INTO site_order_events(order_id,type,note,actor) VALUES ($1,$2,$3,$4);
```
事件 note 模板：`progress: <oldPhase>/<oldProgress> -> <newPhase>/<newProgress>`，有 note 时追加 ` | <note>`，截断 800；actor = admin email；参数 `[id,'progress',note,actor]`。若 `phase === "live"`，再执行 `UPDATE site_orders SET launched_at = COALESCE(launched_at, now()) WHERE id=$1`（首次上线才写，之后不覆盖）。`COMMIT` 后重查 `ADMIN_SELECT`，返回 `{ok:true,order:<row>,update:<RETURNING 行>}`；重查 0 行 → `404 not_found`。
### 5.5 `GET /admin/orders/:id/detail`（**只挂 `requireAdmin`**）
不加 `requireWrite`、不加限流（与 `/events` 同纪律）。`parseId` null → 404；先 `SELECT id FROM site_orders WHERE id=$1`，无行 → 404。然后：

- `order`：`ADMIN_SELECT + " WHERE o.id=$1"`；
- `brief_json`：`SELECT brief_json FROM site_orders WHERE id=$1`（无行不可能，仍按 404 处理）；
- 三组 SQL 形状 = §4.6 的同名查询，仅两处差异：updates **去掉 `visible = true`**、投影改为 `id,phase,progress,note,visible,actor,created_at`；三组 `LIMIT` 全部为 100。均 `ORDER BY created_at DESC, id DESC`。

响应 `200 {ok:true,order,brief_json,updates,changes,ledger}`；空列表为 `[]`。
### 5.6 `PATCH /admin/changes/:id`（`requireAdmin` + `requireWrite`）
Body `{status?, admin_note?}`。`parseId` null → 404；`hasOwnProperty` 判断字段，两者都缺 → `400 {ok:false,error:"empty_patch"}`。
`status` 若存在：trim+lower 后 ∈ `core.CHANGE_STATUSES`，否则 `400 {ok:false,error:"invalid_status"}`。`admin_note` 若存在：`cleanText`（空 → null），>1000 → `400 {ok:false,error:"invalid_note"}`。
单条固定 UPDATE（便于 fake pool；未提供的字段保持原值），`0` 行 → 404：
```sql
UPDATE change_requests
SET status = COALESCE($1, status),
    admin_note = CASE WHEN $2 THEN $3 ELSE admin_note END,
    updated_at = now()
WHERE id = $4
RETURNING id,title,description,page_url,priority,status,admin_note,created_at,updated_at
```
参数：`$1=status|null`，`$2=hasAdminNote`，`$3=note|null`，`$4=id`。响应 `200 {ok:true,change:{…9 键…}}`。不写事件、不写 order_updates。
### 5.7 `work/api-server.js` 挂载与日志脱敏（3 处）
1. 顶部 `const createClientApi = require("./client-api");`
2. 在 `/api` 404 fallback **之前**（建议紧邻 order-api 挂载）：
```js
app.use("/api/client", createClientApi({
  pool: pool, sendMail: sendMail, rateLimit: rateLimit, siteUrl: "https://kwongthye.com"
}));
```
3. `sendMail` 的本地 fallback 写 `work/mail.log` 前，把文本里的 `token=[0-9a-f]{64}` 替换为 `token=[redacted]`（SMTP/Resend 正文不变）。这样应用日志不落 raw token；本地联调必须用真实 SMTP/Resend 或测试 stub，`mail.log` 里的链接故意不可用。

依赖不变：只用 `express` + `node:crypto`；不加 body-parser/cookie-parser。
## 6. 页面合同
### 6.1 `web/client/index.html`（路由 `/client/`）
- 单文件、内联 CSS/JS；`<meta name="viewport">`、`<meta name="referrer" content="no-referrer">`；`/icon-256.png?v=client1` 与 favicon 带版本号；页脚/头部有 `<a href="/order/">` 回下单页。与 `/order/`、`/admin/orders/` 一样由部署层静态映射到 `/client/`；本任务不部署，集成时必须确认该映射（见 §9-11）。
- 语言：`var I18N = { key: [zh,en,bm] }`（**这个字面 marker 必须原样存在**）；`data-lang="zh|en|bm"` 三按钮；语言选择沿用 `?lang=` → `localStorage.kt_lang` → 默认 `zh`；切换写回 `localStorage`。
- I18N ≥45 key，且**必须包含并作为静态断言**：`login_invalid`、`link_sent`、`login_email_err`、`login_rate`、`login_network`、`dash_title`、`logout`、`no_orders`、`updated`、`brief_title`、`brief_empty`、`updates_title`、`updates_empty`、`ledger_title`、`ledger_empty`、`changes_title`、`changes_empty`、`err_title`、`err_desc`、`err_url`、`err_rate`、`loading`、`phase_brief/design/build/review/launch/live`、`payment_unpaid/paid/refunded`、`status_open/in_progress/done/cancelled`、`priority_low/normal/high`，以及 brief 的 `label_goal`、`label_pages`、`label_listing_count`、`label_listing_source`、`label_domain`、`label_logo_url`、`label_brand_color`、`label_reference_url`、`label_asset_links`、`label_target_launch`、`label_notes`。每个都是非空三语；EN/BM 不得含 CJK；所有 `data-i18n`/`data-i18n-ph` 引用的 key 必须存在。
- 视图三块用 `hidden` 切换：`#login`、`#dash`、`#detail`；加载态 `#dash-loading`、`#detail-loading`，错误态复用 `#dash-status`/`#detail-status`。登录：`#login-form`、`#login-email`、`#login-btn`、`#login-msg`。
- 启动逻辑：URL 有 `?token=` → `POST /api/client/verify {token}`；成功后**必须再 `GET /api/client/me`**，用返回的 `orders` 渲染 dashboard（verify 响应不含 orders）；无论成功失败都用 `history.replaceState` 去掉 token（保留 `lang`/hash）；失败回登录并显示 `login_invalid`。无 token → `GET /api/client/me`；401 回登录，200 渲染 dashboard。
- 登录提交 → `POST /api/client/request-link {email}`。200 **一律**显示统一文案 `link_sent`（不区分账号是否存在）；400 `invalid_email` 显示邮箱错误；429 显示频率文案；网络错误显示网络文案。
- Dashboard：`#dash-title`、`#logout-btn`、`#orders`、`#dash-status`、`#dash-empty`。每张卡用 `button.order-card[data-order-id]`，展示 `order_no / phase 徽标 / progress 进度条（width = progress + "%"）/ payment_status / tokens（2 位小数）/ updated_at`。点击 → `GET /api/client/orders/{encodeURIComponent(id)}`，打开 detail。
- Detail：`#detail-back`、`#d-order-no`、`#d-phase`、`#d-progress-bar`、`#d-progress-num`、`#d-payment`、`#d-tokens`、`#d-brief`、`#d-updates`、`#d-updates-empty`、`#d-ledger`、`#d-ledger-empty`、`#d-changes`、`#d-changes-empty`。
  - brief：按固定顺序渲染 `goal,pages,listing_count,listing_source,domain,logo_url,brand_color,reference_url,asset_links,target_launch,notes` 中存在的 key；空 `{}` 显示 `brief_empty`；未知 key 忽略。brief 的 URL 字段**只以 `textContent` 文本展示**，不得生成 `href`/`src`/`<img>`。
  - updates 只显示 API 返回（visible=true）；changes 显示 title/description/page_url（http/https 才渲染 `<a>`，且 `textContent` 作为链接文字）/priority/status/admin_note；ledger 显示 kind/amount/note/created_at。
- Change form：`#change-form`、`#chg-title`、`#chg-desc`、`#chg-url`、`#chg-priority`（select 只有 low/normal/high 三值，默认选中 `normal`，无空值 option）、`#chg-submit`、`#chg-msg`。提交 `POST /api/client/orders/{id}/changes`，成功清空并重载 detail；400 按 `field` 显示 `err_title/err_desc/err_url`；429 显示频率文案。`page_url` 可空。
- 轮询：会话建立后 `var pollTimer = setInterval(refresh, 30000);`（**字面 30000**）；`refresh` 重新 `GET /me`，若 detail 打开再 `GET /orders/:id` 重渲染动态区（表单不重建、不丢输入）；`polling` 布尔防重入；任意请求 401 → `clearInterval`、回登录；logout 也 `clearInterval`。
- 空/加载/错误三态：dashboard 无单 → `#dash-empty`；detail 三组列表各自 empty 文案；网络/500 → 内联错误文案，不 alert。切换语言时重渲染当前 dashboard/detail 的 phase/payment/status 标签（保留 change-form 输入），不能只换静态 label。
- 安全：所有服务端字符串用 `textContent`/`createElement`，禁止把 API 数据拼进 `innerHTML`；不 `console.log(token)`；不出现 `<input type="file">`。
- 390px：必须有 `@media (max-width: 430px)`，单列、按钮不溢出、进度条/长单号 `word-break` 可用。
### 6.2 `web/order/index.html`（只增不改）
保持所有既有价格/条款/字段/`I18N` key/提交行为不动。表单新增可选 brief 区块（`name` 属性只为静态标识，JS 组对象）：

| 控件 ID | 字段 | 控件 |
|---|---|---|
| `b_goal` | goal | textarea，maxlength 500 |
| `b_pages` | pages | text，maxlength 500 |
| `b_listing_count` | listing_count | number，min 0，step 1 |
| `b_listing_source` | listing_source | text，maxlength 500 |
| `b_logo_url` | logo_url | url，maxlength 500 |
| `b_brand_color` | brand_color | text，maxlength 500 |
| `b_reference_url` | reference_url | url，maxlength 500 |
| `b_asset_links` | asset_links | textarea，`data-i18n-ph="ph_asset_links"`（三语 placeholder：每行一个 Drive/Dropbox 链接，最多 10 个） |
| `b_target_launch` | target_launch | text，maxlength 500，placeholder `2026-12-01` |

- 提交时构造 `brief`：只放非空值；**A1 冻结**：`brief.domain` 取既有顶层 `f_domain` 值、`brief.notes` 取既有顶层 `f_notes` 值（空值省略），不新增重复控件；`asset_links` 按换行/英文逗号切分、trim、去空、最多 10 个，**发送数组**；`listing_count` 非空才 `Number()`；其余发送 string。
- 新 I18N key（三语非空）：`brief_title`、`brief_sub`、`label_goal`、`label_pages`、`label_listing_count`、`label_listing_source`、`label_logo_url`、`label_brand_color`、`label_reference_url`、`label_asset_links`、`label_target_launch`、`ph_asset_links`、`err_brief`。所有新 label 用 `data-i18n`，placeholder 用 `data-i18n-ph`，不得破坏既有 key。
- `fieldError("brief")` 返回 `err_brief` 并聚焦第一个 brief 控件；成功/失败路径与 201 处理保持原样。
- 390px 沿用既有 `@media(max-width:640px)` 单列；新增控件不设 `required`。
### 6.3 `web/admin/orders/index.html`（只增不改）
保持既有列表、筛选、状态保存、token 记账、时间线区块与 401 行为。`#timeline-sect` 必须仍在 `#modal` 之后、`#dalert` 之前；`function openDetail(` 后 1500 字符内保留 `loadTimeline(`；`function apply()` 后 1500 字符内保留 `loadTimeline(`；`loadTimeline` 内 `code === "auth"` 仍早于 `timelineError(`。

在 `#timeline-sect` 之后、`#dalert` 之前追加五个区块（不得移动时间线）：

| 区块 | ID | 内容 |
|---|---|---|
| 客户需求 | `brief-sect`、`dbrief`、`dbrief-empty` | 用 `brief_json` 渲染 11 个白名单 key；空对象显示 `brief_empty`；未知 key 忽略 |
| 付款 | `pay-sect`、`dpayment`（select 3 值）、`paybtn`、`paystatus` | 显示 payment_status/paid_at；保存 PATCH `/api/admin/orders/{id}/payment` |
| 进度 | `progress-sect`、`dphase`（6 值 select）、`dprogress`（number 0–100）、`dpnote`（maxlength 500）、`progressbtn`、`progressstatus` | PATCH `/api/admin/orders/{id}/progress` |
| 客户可见更新 | `updates-sect`、`dupdates`、`dupdates-status` | GET `/api/admin/orders/{id}/detail` 的 updates（含 visible/actor） |
| 变更请求 | `changes-sect`、`dchanges`、`dchanges-status` | 每条：title/description/page_url/priority + `select.chg-status`（4 值）+ `input.chg-note`（maxlength 1000）+ `button.chg-save[data-change-id]`；PATCH `/api/admin/changes/{id}` |

`#detail-status` 位于五区块之前；`loadDetailExtras` 的加载/404/网络错误写这里，成功清空。

- `openDetail(r)` 在现有 `loadTimeline(r.id);` **之后**追加 `loadDetailExtras(r.id)`（`GET /detail`），不得把新代码插到该行之前（静态测试要求 `function openDetail(` 后 1500 字符内出现 `loadTimeline(`）；用 `detailSeq` 防竞态，关闭弹窗使在途响应失效。`apply()` 里现有 `if (current && !$("modal").hidden) loadTimeline(current.id);` 必须保持在前 1500 字符内；其后追加 `if (current && !$("modal").hidden) loadDetailExtras(current.id);`，让切语言时动态区块也换语言。
- 所有新请求走既有 `fetchJson`：`401 → showGate()`；`403 → err_forbidden`；`400` 按 code 映射 `invalid_phase/invalid_progress/invalid_note/invalid_status/invalid_payment_status` 到对应文案；`404 → detail_not_found`；网络/500 → `err_generic`。每个按钮在 `finally` 恢复 `disabled=false`；detail 拉取失败只写区块状态，不关弹窗、不清空 `<code>#dalert</code>`。
- 付款成功 → 更新 `rows`/`current`、`#paystatus`、`#dtokens`，刷新时间线（payment 事件）与 detail。
- 进度成功 → 更新 `rows`/`current`、`#dphase`/`#dprogress`、`#dpnote` 清空，刷新时间线（progress 事件）与 detail。
- 变更保存 → 更新该行状态/备注；失败 403 沿用 `err_forbidden`，401 走 `showGate()`。
- 时间线渲染把 `TYPE_KEY.payment = "timeline_type_payment"`、`TYPE_KEY.progress = "timeline_type_progress"` 加进既有 map（否则新事件只显示 raw type）。
- XSS：`#dbrief`/`#dupdates`/`#dchanges` 及新行一律 `createElement` + `textContent`；不得把 API 的 title/description/admin_note/brief 值拼进 `innerHTML`，brief URL 只作文本。
- I18N 新增（三语非空，EN/BM 无中文）：`brief_section`、`brief_empty`、`detail_not_found`、`label_goal`、`label_pages`、`label_listing_count`、`label_listing_source`、`label_logo_url`、`label_brand_color`、`label_reference_url`、`label_asset_links`、`label_target_launch`、`label_notes`、`pay_section`、`payment_status`、`payment_unpaid/paid/refunded`、`pay_save`、`pay_saved`、`progress_section`、`phase_label`、`progress_label`、`progress_note`、`progress_note_ph`、`progress_save`、`progress_saved`、`updates_section`、`updates_empty`、`updates_visible`、`updates_hidden`、`changes_section`、`changes_empty`、`change_status`、`change_status_open/in_progress/done/cancelled`、`change_note`、`change_save`、`change_saved`、`phase_brief/design/build/review/launch/live`、`priority_low/normal/high`、`timeline_type_payment`、`timeline_type_progress`。
- 390px：新表单/列表沿用现有 `@media(max-width:760px)` 单列规则；长 note 用 `overflow-wrap:anywhere`。
## 7. 测试合同
### 7.1 新增 `work/test-client.js`（fake pool + 真 express，不连 Postgres）
必须独立可跑：`node work/test-client.js`，输出 `CLIENT PASS / N checks` / `CLIENT FAIL`，失败 exit 1。矩阵：

1. **request-link**：不存在/存在邮箱响应体完全一致（200 `{ok:true}`，无枚举）；`invalid_email` 400；创建 1 个 user，二次请求复用同一 user；`client_users.email` 小写；订单 `email` 大小写不同也能绑定，已绑定别的 user 的订单不被抢；邮件失败（sendMail throw）仍 200 且 user/link 已落库；断言 sendMail 主题同时含「登录」「sign in」、正文含 `${siteUrl}/client/?token=` 与「20 分钟 / 20 minutes」；断言注入的 `rateLimit` 以 `(5,600000)` 调用。
2. **verify**：从 sendMail stub 的正文提取 raw token；成功后 cookie 头逐字含 `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`；响应 `client` 恰好 4 key；DB 只存 sha256（`token_hash !== raw` 且等于计算值）；link `used_at` 非空；user `last_login_at` 非空；同 token 重放 401；过期 link（把 fake DB 中该 link 的 `expires_at` 改为过去时间，不推进真实时钟）401；缺失/非 64 hex 400；未知 token 401。
3. **session / me**：用 cookie 头（手工从 Set-Cookie 取，Node fetch 不自动存）GET `/me` → 200；无/伪造/过期 session → 401；`client` 恰好 4 key；只返回自己的订单且 `created_at DESC, id DESC`；订单行**恰好 10 key**（无 phone/email/status）；`client.name/phone` 为 null 时原样 null；`tokens` 按 topup+adjust−usage、2 位小数、JSON number；空订单 `[]`。
4. **IDOR**：A 的 session 请求 B 的订单 → 404；不存在 id、`"abc"`、`"0"`、`"-3"`、`"1.5"` → 404；响应体与「真的不存在」一致；`order` **恰好 12 key**、updates **恰好 5 key**、changes 9 key、ledger 5 key；`brief_json`/updates/changes/ledger 不泄露 B 的数据；updates 只回 visible=true；client 响应无 `actor`。
5. **changes**：未登录 401；他人的单 404 且优先于 body 校验；缺/空/超长 title、description；`page_url` 非 http/https/超长；`priority` 非法；`priority:""` 按默认 `normal`；合法 201 且 `status:"open"`、`admin_note:null`；未知字段忽略；限流注入断言 `(20,3600000)`。
6. **logout**：带 session → 200、session 行删除、clearing cookie 含 `Max-Age=0` 同 flags；无 cookie → 200；重复 logout → 200。
7. **admin 扩展**（同文件内再挂 `createOrderApi`，fake `requireAdmin/requireWrite`）：未登录 401；viewer 写 403；payment 非法值 400、404、`paid` 写 `paid_at` + `status='paid'` + 事件（note `payment: old -> new`、actor=admin email）、`unpaid/refunded` 清 `paid_at` 且不改 status；progress 缺/非法 phase、字符串/小数/越界 progress、超长 note 400，404，成功同时写 `order_updates` + event（note/actor 正确）且返回 `{ok,order,update}`；首次 `live` 写 `launched_at`、二次 `live` 不覆盖；detail 只挂 requireAdmin（requireWrite 恒 403 下仍 200）、404、空列表 `[]`、`visible=false` 的 update 仍返回、updates **7 key**/changes 9 key/ledger 5 key、100 条截断与排序、`brief_json:{}` 默认；change PATCH `empty_patch`/`invalid_status`/`invalid_note`/404/成功且 `updated_at` 变化。
8. **客户页静态**：`data-lang` 3 个；`var I18N = {` 可解析；≥45 key 且 6.1 列出的必含 key 三语非空、EN/BM 无 CJK、引用 key 全存在；含 `/api/client/request-link`、`/api/client/verify`、`/api/client/me`、`/api/client/orders/`、`/api/client/logout`、`30000` 与 `setInterval(`、`@media (max-width: 430px)`、`href="/order/"`、`/icon-256.png?v=client1`；无 `type="file"`。
9. **横切**：所有 client 响应（200/400/401/404/429）都有 `Cache-Control: no-store`；用注入的「恒 429」limiter 实测 request-link/changes 返回 `429 {ok:false,error:"rate_limited"}`；logout 清 cookie 头与 `Max-Age=0` 在 200 前已设置。
### 7.2 扩展 `work/test-orders.js`（164 条原样保留）
- 纯函数区追加 `PHASES/PAYMENT_STATUSES/CHANGE_STATUSES/CHANGE_PRIORITIES`、`normalizeEmail`、`normalizeBrief` 的边界断言（类型、未知 key、12 key 上限、数组截断 10、单值 500/1000、总长 8000、空值/null 丢弃、NUL、URL 协议、顺序稳定）。
- **不得**在既有 `httpTests()` 的同一 fake pool 上追加会改变 `db.orders/ledger/events` 数量的写测试；新增 `portalTests()` 用**独立** `makeFakePool()`，覆盖：带 brief 下单 → 201 且响应仍 4 键、`brief_json` 持久化/归一化（断言为 object 而非 JSON 字符串）；非法 brief URL/NUL/超长 → 400 `field:"brief"`；预置 `client_users` 后同邮箱下单自动绑定；admin list 新四列；payment/progress/detail/change PATCH 全部分支；browser 静态检查（order 页新 brief 控件/`brief` 提交；admin 页新 5 区块、`/payment`、`/progress`、`/detail`、`/api/admin/changes/`、三语）。
- 既有 `main()` 末尾三条库级断言（2 单 / 5 流水 / 3 事件）必须保持；新测试用独立 pool，不得污染。最终总断言数 >164 属预期，但不能有原 164 中的任何一条被删/改弱。
- 页面静态必含 key（逐个断言非空三语，不能只数数量）：order 页 `brief_title`、`brief_sub`、`label_goal`、`label_pages`、`label_listing_count`、`label_listing_source`、`label_logo_url`、`label_brand_color`、`label_reference_url`、`label_asset_links`、`label_target_launch`、`ph_asset_links`、`err_brief`；admin 页 `brief_section`、`brief_empty`、`detail_not_found`、`pay_section`、`payment_status`、`pay_save`、`progress_section`、`phase_label`、`progress_save`、`updates_section`、`changes_section`、`timeline_type_payment`、`timeline_type_progress`，以及 6 个 `phase_*` 与 3 个 `priority_*`。
- `makeFakePool()` 的改动规则（P1 审稿修正）：
  1. **就地扩展现有 `INSERT INTO site_orders` 分支**（它匹配所有该前缀，追加新分支不会生效）：把 `p[13]` 用 `JSON.parse` 存成 `brief_json` 对象（与 node-pg 返回形态一致），给新订单默认 `phase:"brief"`、`progress:0`、`payment_status:"unpaid"`、`paid_at:null`、`launched_at:null`；savepoint/23505/事件语义一行不改，原断言全部保留。
  2. `adminRow()` 增加 `phase/progress/payment_status/paid_at`，旧订单缺字段时给默认值。
  3. 新增绑定分支：`UPDATE site_orders o SET client_user_id = u.id FROM client_users u …`；无匹配返回 `{rows:[]}`。
  4. 新增两条 `FOR UPDATE` 存在性查询：`SELECT id,status,payment_status FROM site_orders WHERE id = $1 FOR UPDATE`、`SELECT id,phase,progress,launched_at FROM site_orders WHERE id = $1 FOR UPDATE`（返回旧值，供事件 note 使用；无行 `[]`）。
  5. 新增：payment 两条 UPDATE、progress UPDATE、`launched_at` UPDATE、`INSERT INTO order_updates`、`FROM order_updates`、`FROM change_requests`、`UPDATE change_requests`、`SELECT brief_json FROM site_orders`；`FROM token_ledger` 的 detail 查询沿用既有分支。
  6. 事件 INSERT 统一走既有通用分支（`p[1]` 为 type）；payment/progress 也传 `$2='payment'|'progress'`，不得在 SQL 里写死 type 字面量。
  7. 除上述**就地扩展** `INSERT INTO site_orders` 分支外，其余既有分支语义一行不改；新增测试用独立 pool，原 `db.orders/ledger/events` 数量断言不受影响。
### 7.3 fake pool 与确定性
- test-client 的 fake pool 用固定时间戳/可控 `now` 判定过期；路由的 20 分钟/30 天用真实 `Date.now()`，所以过期测试直接改内存 `expires_at`/session 记录，**禁止 `setTimeout`/sleep/推进真实时钟**。
- fake pool 必须模拟真实语义：`used_at`/`expires_at` 过滤、session 过期、`lower(email)` 唯一冲突、`visible` 过滤、`ORDER BY created_at DESC, id DESC`、`LIMIT` 从 SQL 文本解析（漏写即红，不兜底）。
- 每个测试文件 `server.close()` 放 `finally`；不残留监听端口；不写 `mail.log`（stub sendMail）。
## 8. 验收标准（AC）
| ID | 标准 | 判定 |
|---|---|---|
| AC-P01 | 037 可重复执行；5 新表、site_orders 7 列、11 索引、约束、GRANT 齐全 | SQL review ×2 |
| AC-P02 | request-link 对存在/不存在账号响应完全一致；邮件失败仍 200；magic link 只存 sha256、20 分钟、一次性；重放/过期 401 | test-client |
| AC-P03 | verify 建 30 天 session，cookie 五 flags 逐字正确；所有 client 响应 `Cache-Control: no-store`，429/错误体一致 | test-client |
| AC-P04 | `/me` 只回自己的单，排序/字段/token 公式正确；他人/不存在订单一律 404，无 actor 泄露 | test-client |
| AC-P05 | changes 四字段校验、默认值、201、限流 | test-client |
| AC-P06 | payment 三值、paid 副作用、事件、404/403/401；progress 双必填、范围、order_updates+event、launched_at | test-client + test-orders |
| AC-P07 | admin detail 只挂 requireAdmin、三组 LIMIT 100/排序；change PATCH 三错误码 + 成功更新 | test-client + test-orders |
| AC-P08 | brief 11 白名单/长度/数量/8000/未知丢弃/URL 协议/NUL；响应不变；order 页既有 164 不弱化并提交 A1 映射 | test-orders |
| AC-P09 | client 页三语/30s 轮询/430px/token 剥离/401 回登录/部署映射；admin 页新 5 区块、时间线 5 项检查、401 引导、`#dbrief` | test-client + test-orders + 人工/部署 |
| AC-P10 | 客户/后台响应 key 白名单精确；mail 主题/正文/站点链接正确 | test-client |
| AC-P11 | 两命令全绿：`node work/test-orders.js`、`node work/test-client.js` | 真实输出 |

## 9. 决策、假设与风险
1. **launched_at 的写入点**：合同只要求加列和返回；本 SPEC 决定在 `PATCH /admin/orders/:id/progress` 首次进入 `phase="live"` 时写 `COALESCE(launched_at, now())`，之后不覆盖。`status` 与 `phase` 各自独立，不自动同步。
2. **旧 magic link 不主动失效**：同一邮箱可同时持有多个未用 link，各自 20 分钟内一次性有效；不删除旧 link（简单、可测；风险见 §9-11）。
3. **brief 超限即拒绝**：单值超 500/1000、总 JSON >8000、非法类型 → 整包 400 `field:"brief"`，不静默截断；只有数组 >10 项取前 10。数组的 500 字符限制按**每个元素**判断，join 后的字符串不再单独卡 500（由总长 8000 兜底）。
4. **brief.domain / brief.notes 的页面来源（A1）**：order 页用既有顶层 `domain`/`notes` 输入值填充 brief 的同名字段（空值省略），11 个 brief 字段全部可达；不新增重复控件。顶层 `domain/notes` 仍照旧提交并校验。
5. **id 类型**：`site_orders.id`/`client_users.id`/列表各 id 不做 `::int`，保持 node-pg 的 int8 → JSON string；前端必须 `String(id)` + `encodeURIComponent`，不得 `===` 数字。
6. **进度 note 与事件 note 分离**：`order_updates.note` 是客户可见备注（≤500）；`site_order_events.note` 是 `progress: old/new` 审计串（≤800）。客户响应只拿前者。
7. **payment 重复 paid**：按合同字面刷新 `paid_at`；refunded/unpaid 不回退 `status`，因此可能出现 `status='paid'` + `payment_status='refunded'`，以后台/客户各自字段为准。
8. **Cookie Secure 与 staging**：staging 若走 HTTP，浏览器不会回传 `fc_client`；测试用手工 `Cookie` 头，生产必须 HTTPS。`/client/` 页面加 `<meta name="referrer" content="no-referrer">`，verify 后立刻从地址栏剥离 token。
9. **brief URL 字段**：`logo_url`/`reference_url`/`asset_links` 非空时只接受 `http/https`，否则整包 400 `field:"brief"`；客户页/后台对 brief 值只做文本渲染，不生成链接/图片（防存储型 XSS）。
10. **CSRF 与限流**：沿用 `api-server.js:175-187` 的 `/api` Origin host 校验，加上 `SameSite=Lax` 作为 CSRF 控制；`/verify` 按合同不额外限流（64 hex 不可猜），只在风险中记录。
11. **剩余风险**：① `sendMail` 本地 fallback 仍会把脱敏后的邮件文本写 `work/mail.log`（链接不可点），本地联调必须配置 SMTP/Resend 或 stub，`mail.log` 不随部署发布；② 未在真实 Postgres 跑迁移/未做真实邮件与 HTTPS 浏览器 E2E；③ fake pool 的 SQL 形状若与 PG 偏差会假绿，由 verifier 静态审查；④ 旧 link 多活 20 分钟、`request-link` 的时序侧信道未做恒定时间；⑤ 后台 `status` 与 `phase` 双轨可能被运营写成不一致，且 `payment_status='paid'` 会把已 `live` 的 `status` 回退为 `paid`（总管 A4，按合同字面执行），本期不做强同步；⑥ raw token 出现在首次 `/client/?token=` 的访问日志（`replaceState` 无法清除），部署层需关闭/轮转该路径访问日志；⑦ `admin_note` 按合同对客户可见，运营不得写内部备注；⑧ `/me` 返回全部订单无上限；⑨ 迁移未加 `site_orders(lower(email))` 索引，绑定会扫描；⑩ `/client/` 静态映射依赖部署层，本任务不部署、只交 HTML；⑪ magic link/session 过期行无清理任务、无 `expires_at` 索引；⑫ `DO` 块按默认 `public` search_path 假设（与 036 一致）。
## 10. Review log
Reviewer：`portal-chief/portal-product-manager/portal-spec-worker`（depth 3，独立、只读、未改文件）。审稿对象 v1.0；输入含 036/order-core/order-api/api-server/test-orders/三页/PORTAL_TASKS。结论：**CHANGES REQUIRED**（7 P1 / 21 P2 / 14 P3）。处置如下；P1/P2 全部在 v1.1 闭环，P3 记入 §9-11。
### P1（必须修，全部 fixed）
| ID | 发现 | 处置 |
|---|---|---|
| P1-1 | requireClient 指向错误章节、未定义 req.client/hash 参数 | §4.1 写明 `$1=sha256(cookie)`、设置 `req.client`；§4.6/§4.7 写明 `$2=req.client.id` |
| P1-2 | test-orders 既有 INSERT 分支匹配所有插入，追加分支不生效 | §7.2 改为**就地扩展**既有分支，保留 savepoint/23505/事件语义；原断言不动 |
| P1-3 | fake pool 缺两条 payment/progress `FOR UPDATE` 查询 | §7.2 规则 4 逐条列出 |
| P1-4 | 六组 detail/list 读只有散文、无可匹配 SQL | §4.6、§5.5 给出完整投影/WHERE/ORDER BY/LIMIT |
| P1-5 | progress SQL 三语句 `$1..$3` 含义冲突 | §5.4 每条 SQL 标注参数，并警告不得复用参数数组 |
| P1-6 | brief 的 URL 字段可存 `javascript:`，存在存储型 XSS | `normalizeBrief` 步骤 8 强制 http/https；§6.1/§6.3 只允许 textContent、不生成 href/src |
| P1-7 | verify 成功后未拉 `/me`，dashboard 无订单 | §6.1 明确 verify 成功后必须 `GET /api/client/me` 再渲染 |
### P2（应修，全部 fixed / 明确约束）
| ID | 发现 | 处置 |
|---|---|---|
| P2-1 | 新常量只写 const 未写 module.exports | §3 明确加入既有 `module.exports` 并列出 8 个名字 |
| P2-2 | payment 非 string 会 500 | §5.3 只接受 string，其余 400 invalid_payment_status |
| P2-3 | brief NUL 会触发 jsonb 500 | `normalizeBrief` 步骤 5/7 删除 `\u0000` |
| P2-4 | fake pool brief_json 字符串/对象形态未定 | §7.2 规则 1 要求 `JSON.parse` 成对象；测试断言 object |
| P2-5 | 客户页 I18N key 未冻结 | §6.1 列出必含 key，§7.1 静态断言 |
| P2-6 | admin 新动作 401/403/400/404 语义缺失 | §6.3 增加统一错误映射与 `finally` 恢复按钮 |
| P2-7 | payment/progress 时间线标签未接入 TYPE_KEY | §6.3 要求加入 `TYPE_KEY.payment/progress` |
| P2-8 | admin 无 brief 展示，detail 字段闲置 | §6.3 增加 `brief-sect/dbrief/dbrief-empty`，AC-P09 |
| P2-9 | admin 新区块无 XSS 规则 | §6.3 明确 createElement/textContent，禁止 innerHTML |
| P2-10 | asset_links placeholder 硬编码中文 | §6.2 增加 `ph_asset_links` + data-i18n-ph |
| P2-11 | 空 priority 会 400 而非默认 normal | §4.7 空/缺省→normal；§6.1 select 默认 normal 无空 option |
| P2-12 | 本地 sendMail fallback 把 raw token 写 mail.log | §5.7 第 3 条要求写盘前把 `token=<64hex>` 脱敏；风险见 §9-11① |
| P2-13 | brief 值为 null 会整包失败 | `normalizeBrief` 步骤 4：null/undefined 视为未提供 |
| P2-14 | normalizeBrief 返回类型 value:object 与失败 null 矛盾 | §3 改为 `value:object|null` 并给出成功/失败字面量 |
| P2-15 | `/client/` 无服务端映射 | §6.1 声明与 /order/ 相同的部署层映射；§9-11⑩ 记录未部署 |
| P2-16 | `/me` 并发删 session 可能 500 | 改为直接复用 `req.client`；requireClient 无行即 401 |
| P2-17 | logout 清 cookie 与 DELETE 失败顺序含糊 | §4.4 先清 cookie，DELETE try/catch，始终 200 |
| P2-18 | test-client 未断言 no-store | §7.1 第 9 条覆盖 200/400/401/404/429 |
| P2-19 | 未断言精确 key 白名单与邮件主题/正文 | §7.1 第 1/3/4/7 条逐项断言 |
| P2-20 | test-orders 未要求新 I18N key | §7.2 列出 order/admin 必含 key 并逐个断言 |
| P2-21 | 切语言后 admin 动态区块不刷新 | §6.3 要求 apply() 内追加 `loadDetailExtras(current.id)` |
### P3（记录/已接受的剩余风险）
P3-1 CSRF：沿用 `/api` Origin host 校验 + SameSite=Lax（§9-10）；P3-2 `/verify` 未限流：接受（64 hex 不可猜）；P3-3 token 进首次 URL 访问日志：风险 §9-11⑥；P3-4 page_url 可带 credentials：已修（拒绝 username/password）；P3-5 admin_note 对客户可见：风险 §9-11⑦；P3-6 过期行无清理/无 expires_at 索引：接受（Phase 1 量小）；P3-7 429 错误体：已统一 `rate_limited`；P3-8 `/me` 无订单上限：风险 §9-11⑧；P3-9 payment/progress 重查 0 行：已补 404；P3-10 未实测 429：已加恒 429 stub 测试；P3-11 `?v=` 与单文件矛盾：已指定 `/icon-256.png?v=client1`；P3-12 sendMail 缺失行为：已补 throw；P3-13 `regclass` 依赖 search_path：接受（与 036 一致，风险 §9-11⑫）；P3-14 绑定缺 lower(email) 索引：风险 §9-11⑨。

**Coverage gaps 处置：** `/client/` 映射→P2-15/风险；admin brief→P2-8；no-store/logout/key 白名单→P2-18/17/19；邮件主题正文→P2-19；payment/progress event note/actor/launched→§7.1-7；visible=false、brief `{}` 默认→§7.1-7；brief URL/NUL/8000→§7.2；客户页具名 key→P2-5；order/admin 新 key→P2-20；真实 Postgres→§9-11②。
