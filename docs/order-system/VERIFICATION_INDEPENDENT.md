# VERIFICATION_INDEPENDENT — 独立验收报告

> 角色：**独立 verifier**（由 `lead` 派出的独立子 agent；只读代码、只复跑命令、只写本报告，不参与制作、不改业务代码）
> 对象：staging `/Users/huangminming/Downloads/日常/order-system-mvp`
> 日期：2026-11-17（Asia/Shanghai）
> 环境：macOS · Node v24.18.0 · npm 11.16.0 · express 4.21.2（staging）· Puppeteer 25.4.0 + 本机 Chromium · 无真实 Postgres
> 依据：`docs/order-system/SPEC.md`、`VERIFY.md`、`TASKS.md`；**不采用** `VERIFICATION.md` 的 PASS 结论，只把其中的哈希/命令当线索。
> **复验轮次：第三轮（2026-11-17 15:58，Asia/Shanghai）。** §0、§8、§10 为第三轮当前结论；§5/§9 是首轮/第二轮历史快照。

## 0. 结论先行（第三轮复验后）

**总评：PASS（带未验证项）。** D1/D2/D3/D4/D6/D9/D10 已修复并通过独立探针；公开查单限流、合法大额 2dp 金额、后台 500 错误显示、SKIP 路径、D1 回归测试均已闭合。**真实 Postgres、真实管理员会话、nginx/部署、真机、BM 母语审校仍未验证**，上线前必须补。

| 维度 | 结果 | 说明 |
|---|---|---|
| 价格口径（首月 2,500 总价、次月起 1,500） | **PASS** | 页面/API/迁移/文档一致；无 4,000 叠加口径 |
| 事务重试（SAVEPOINT/ROLLBACK TO） | **PASS**（真实 PG 未验证） | 代码有 SAVEPOINT；测试桩真的模拟了 aborted（25P02），不是只 fake 23505 |
| 公开查单隐私字段 | **PASS** | 仅 `order_no/status/created_at`；无 phone/email/company/domain/notes |
| 公开查单**限流** | **PASS（D1 已修）** | 独立 65 个**不同**单号第 61 次 429；D10 测试已改用不同单号 |
| 后台鉴权 | **PASS**（真实会话未验证） | GET/PATCH/tokens 未登录均 401；写操作同时挂 requireWrite |
| SQL 参数化/CHECK/余额/超扣 | **PASS**（真实 PG 未验证） | 参数化、迁移 CHECK、余额公式、超扣 400 均成立 |
| token 金额校验 | **PASS（D2/D9 已修）** | 0.001 → 400；`1,234,567.89` / `-1,234,567.89` → 201；随机 20,000 个合法 2dp 0 误拒 |
| 页面三语/EN/BM/390px/真实操作 | **PASS**（真机未验证） | 87/62 key；EN/BM 无 CJK；390px 无横向溢出；提交/后台操作通过 |
| 迁移 | **PARTIAL（静态 PASS，真库未验证）** | 三表、5 索引、7 CHECK、3 表 GRANT + 3 序列 GRANT、BEGIN/COMMIT、IF NOT EXISTS |
| 挂载 patch | **PASS** | 只加 require + mount，位于 fallback 前；对基线 dry-run 通过；项目 diff 恰 5 行 |
| 既有回归 | **PASS（能跑的）** | `web/test.js` 76、`work/test-library.js` 69、`work/test-static.js` STATIC PASS；smoke/真服务未跑 |

**已修复：** D1（IP 固定桶限流）、D2（adjust 0.001 500）、D3（后台 500 空白）、D4（无 express SKIP）、D6 四个指定案例、**D9（合法大额 2dp 被误拒）**、**D10（D1 回归测试用同一单号）**。
**非阻断：** D5 文档/证据计数漂移、D7 `<meta description>` 中文残留（不可见）、D8 浏览器脚本标签笔误。
**仍未验证：** 真实 Postgres 迁移/约束/GRANT/幂等/CRUD/并发 `FOR UPDATE`、真实 `fc_admin` 会话、真实 `api-server`、nginx `/order/` 与 `/admin/orders/`、iOS/Android 真机、BM 母语审校、生产 smoke。

---

## 1. 对象与快照

### 1.1 staging 文件指纹（第三轮复验时）

```console
$ shasum -a 256 work/migrations/036_site_orders.sql work/order-core.js work/order-api.js \
    work/test-orders.js web/order/index.html web/admin/orders/index.html work/api-server.patch
036045fd8e0dc8447c177d5cf8ff4ca75af22b32c1127bf3d35f891fa8ca301b  work/migrations/036_site_orders.sql
0c7b1159efdb76bdae7ebd035a7fdd52a32fb96af6aeeace94e0a99f76224632  work/order-core.js
6144e0b1ccbca7471478109cdc2ee65072fc9f07927a50ebe932145bb19dc4f2  work/order-api.js
43330cb9e5cdf1bb1cd47060c173a8fa51afb1f1e67eb89d40d6f9ec8693f859  work/test-orders.js
0dd78bbdc00e0aa89198229fc7f240f79cc0c650e4dfb3b4d0bf8ddf717a40c0  web/order/index.html
30ddfef65ae13af90832a28de7f3eabe2fd9ab425e30414160020575a9010822  web/admin/orders/index.html
73363935ef58bfdef66582d780d3ee9833d016ab5452f09e87992ae4d0a87dda  work/api-server.patch
```

Migration、公开页、order-api、admin 页面无新改动；order-core/test-orders 为 D9/D10 修复版本。

### 1.2 项目目录的并发落盘状态（**重要，非本 verifier 操作**）

验证期间观察到 `/Users/huangminming/Pik kwong Lau` 在 **15:34–15:35** 被另一个有写权限的 actor 落盘（我未修改项目）：

```console
$ cd "/Users/huangminming/Pik kwong Lau" && git status --porcelain
 M work/api-server.js
?? docs/order-system/
?? web/order/
?? web/admin/orders/
?? work/order-api.js
?? work/order-core.js
?? work/test-orders.js
?? work/migrations/036_site_orders.sql
?? work/api-server.patch
...
$ git diff -- work/api-server.js
# 只有 +1 require +4 行 mount，5 insertions；位置在 library 之后、fallback 之前
```

- **第三轮当前**：项目 `work/order-core.js`、`work/order-api.js`、`work/test-orders.js`、`web/admin/orders/index.html` 与 staging **全部哈希一致**；
  `work/test-orders.js` 两边都是 `43330cb9...`，D9/D10 修复已同步。
- 迁移、公开页、patch 也与 staging 一致；项目 `work/api-server.js` = `1a07ac07...`（已打 patch，与 staging `.build/api-server.mounted.js` 一致）。
- 项目 `node work/test-orders.js`（项目无 express）：
  ```console
  … SKIP HTTP 路由测试（本机未安装 express；服务器 /srv/fangchan/api 有）
  ORDERS PASS / 95 checks
  ```
  这**不能**替代 staging 带 express 的 **138 checks**（HTTP 段被跳过）。
- 项目仍为 `M work/api-server.js` + 新增未跟踪文件，**没有 commit**；`docs/order-system/VERIFICATION.md` 等文档仍写 131/hash 旧值（D5），但代码/页面/test 已同步。

> 结论：第三轮项目副本与 staging 的改动文件已一致；staging 138 是当前有效回归，项目 95 是 SKIP 形态，不等于 138。

---

## 2. 实际执行的命令与关键输出

### 2.1 语法

```console
$ node --check work/order-core.js && echo OK
OK
$ node --check work/order-api.js && echo OK
OK
$ node --check work/test-orders.js && echo OK
OK
$ node --check .build/browser-check.js && echo OK
OK
```

### 2.2 后端回归（真实 express + 假 pool）

```console
$ node work/test-orders.js
...
ORDERS PASS / 138 checks
$ echo $?
0
```

- **第三轮：138 pass / 0 fail**；**没有 SKIP**（staging 有 express 4.21.2）。
- 新增覆盖：D2 adjust 0.001、D6 phone/email/domain、D1 限流、**D9 大额 2dp 接受**、**D10 65 个不同单号**。
- 通过项仍包括：公开下单 400/field、201、公开查单三列、后台三条 401、状态白名单、token 100→70→50、超扣 400、23505 后 201 + `ROLLBACK TO SAVEPOINT`、最终 2 单。
- **第三轮 D10 已修**：65 次循环改用 `core.orderNoFromSeq(new Date(), i)`，生成 65 个不同合法单号；独立探针同样第 61 次 429（§10）。

### 2.3 浏览器 390px（真实 Chromium）

```console
$ NODE_PATH="$(npm root -g):$PWD/node_modules" node .build/browser-check.js
...
BROWSER PASS | orders=1 events=2 ledger=1
```

27/27 项通过：zh/en/BM 切换、三语无中文残留（语言按钮「中文」除外）、390px 无横向溢出、真实填表提交显示 `ORD-YYMMDD-XXXX`、后台列表出现该单、改 `live`、token 充值 100 → `100.00`、未登录显示 `/admin/` 引导、无 pageerror/非预期 console.error。
截图已由本次运行覆盖到 `.build/shots/`（780×1688 等，因 deviceScaleFactor=2）；我人工查看了 `order-mobile-zh.png`、`admin-mobile-zh.png`、`admin-modal-mobile-zh.png`，未见布局破损。

### 2.4 挂载 patch

```console
# 用基线副本（.build/api-server.orig.js 复制到 /tmp/verifier-patch/work/api-server.js）
$ patch -p1 --dry-run < work/api-server.patch
patching file 'work/api-server.js'
exit=0
$ patch -p1 < work/api-server.patch
$ shasum -a 256 work/api-server.js
1a07ac07984286078262378aa2e6ff240281ce424a71f2be5c26ea1b5e3a2c4a   # == .build/api-server.mounted.js
# 反向验证
$ patch -R -p1 --dry-run < .../work/api-server.patch
patching file 'work/api-server.js'
reverse-dry exit=0
# 反向应用后 hash == 4f03ca3d... == .build/api-server.orig.js
```

- patch 只涉及 `work/api-server.js`，2 个 hunk；内容 = `require("./order-api")` + 4 行 mount（注释 + 2 行 use）。
- 项目实际 diff 也是 **5 insertions / 0 deletions**，位置 `app.use("/api/library", ...)` 之后、`// ---------- fallbacks ----------` 之前。
- **直接在 staging 执行 `patch -p1 --dry-run < work/api-server.patch` 会失败**（staging 没有 `work/api-server.js`）：
  ```console
  File to patch:
  No file found--skip this patch? [y]
  2 out of 2 hunks ignored
  exit=1
  ```
  这不是 patch 缺陷；staging 只放 delta 文件。验证必须用项目基线副本。

### 2.5 既有回归（只读，项目目录）

```console
$ cd "/Users/huangminming/Pik kwong Lau"
$ node web/test.js
76 pass, 0 fail
$ node work/test-library.js
69 pass, 0 fail
$ node work/test-static.js
STATIC PASS
```

- 未跑 `work/test-smoke.js`（它请求 `https://kwongthye.com`，属于生产 HTTP；按边界不碰生产）。
- 未启动真实 `api-server.js`（项目无 express/pg，且需要 `DATABASE_URL`/环境；不连生产 DB）。
- 项目无 `node_modules`，`test-orders.js` 的 HTTP 段 SKIP（95 checks），见 §1.2。

### 2.6 页面独立静态审计（我自己写的解析，不用 producer 的断言）

```console
order:  keys=87  badLen=[]  data-i18n used=69  missing=[]  CJK(en/bm)=[]  "4,000"=[]
admin:  keys=62  badLen=[]  data-i18n used=36  missing=[]  CJK(en/bm)=[]  "4,000"=[]
order:  lang buttons zh/en/bm = 1/1/1; viewport=true; media queries=2; refs without ?v=: []
admin:  lang buttons zh/en/bm = 1/1/1; viewport=true; media queries=1; refs without ?v=: []
```

- 两页字典每个 key 都是非空 `[zh,en,bm]`；所有 `data-i18n` / `data-i18n-ph` 引用存在；动态 `t("st_…")` / `t("status_…")` 的 8 个状态 key 都存在。
- EN/BM 用比 producer 更宽的 CJK 范围检查（含 CJK 扩展/全角标点）：**无残留**；语言按钮「中文」是 HTML 固定文案，不在字典内。
- 公开页/后台页都只引用 `/icon-256.png?v=ord1`，无未带版本号的 CSS/JS 资源；新页面无内联 `onclick` 等事件属性。
- 页面 price：三语 `price_total` 都写首月 RM2,500、次月起 RM1,500；`chip_setup` 都有「首月/first month/bulan pertama」；`web/order/index.html` 无 `4,000`。
- `work/order-core.js` `PRICES={monthly:1500,setup:2500}`；`036_site_orders.sql` 默认 1500/2500 且注释写明「首月不是 2500+1500」；API 201 返回 1500/2500。
- 全仓 grep `4,000/4000` 只命中「禁止/修复记录/测试守卫」等**否定语境**，没有把 4,000 当价格展示；SPEC 第 107 行是「首月不是 2,500+1,500=4,000」的纠偏句。

### 2.7 迁移静态结构

```console
createTable=3  createIndex=5  check=7  grantTable=3  grantSeq=3  fk=2
paren balance=0  BEGIN=true  COMMIT=true
```

- 三表：`site_orders`、`site_order_events`、`token_ledger`。
- 5 索引：site_orders 3（status+created、created、phone）、events 1、ledger 1。
- 7 CHECK：status 8 值、package、价格≥0、name/phone 非空、ledger kind、amount≠0、sign。
- GRANT：三表 `GRANT ALL` + 三序列 `GRANT USAGE, SELECT`。
- `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` + `BEGIN/COMMIT`，静态看可重复执行。
- **未在真库执行**；`fangchan_app` 角色存在性、约束实际触发、GRANT 生效均未验证。

### 2.8 静态安全/SQL 审计

- `work/order-api.js` 所有用户输入均走 `$1..$n`；`status` 先白名单再参数化；`q` 只作为 `%...%` 参数；无字符串拼接。
- 公开查单 SQL：`SELECT order_no, status, created_at ...`；`publicOrder()` 也只挑这三列。
- 写路由：
  ```text
  r.patch("/admin/orders/:id", requireAdmin, requireWrite, ...)
  r.post("/admin/orders/:id/tokens", requireAdmin, requireWrite, ...)
  r.get("/admin/orders", requireAdmin, limit(120,...), ...)
  ```
- `SAVEPOINT order_try` / `ROLLBACK TO SAVEPOINT order_try` / `RELEASE SAVEPOINT` 均在 `order-api.js`。
- 新代码/页面无 `console.log`；全局错误 handler 只回 `{ok:false,error:"server_error"}`，无堆栈。

---

## 3. 逐项验收（按任务必查 10 项）

### 3.1 价格口径 — PASS

- 页面、API、迁移、SPEC、DECISIONS 均为首月 RM2,500 总价（含建站+首月服务），第 2 个月起 RM1,500。
- API 201 实测返回 `monthly_price=1500`、`setup_price=2500`；测试断言的 `1500/2500` 通过。
- 页面三语 `price_total` 均含 `2,500`；无 `4,000`；`chip_setup` 有首月标注。
- **没有**发现 2,500+1,500=4,000 的口径。

### 3.2 事务重试 — PASS（假 pool 真的模拟 aborted；真库未验证）

`work/test-orders.js` 的 fake pool：
- 注入 23505 时设置 `db.aborted=true`；
- 在 `ROLLBACK TO SAVEPOINT` 之前的任何查询会抛 `25P02`；
- 只有 `ROLLBACK TO SAVEPOINT order_try` 才清除 aborted 并计数；
- 测试断言 `savepointRollbacks>=1`、201、最终 2 单。

这不是只 fake 一个 23505；如果生产代码捕获后直接 `continue`，下一次 INSERT 会得到 25P02，测试会失败。**代码逻辑正确**。
但真实 PostgreSQL 的事务/约束行为未执行，仍属未验证（见 §5）。

### 3.3 公开接口隐私 — PASS（字段层面）；限流另见 D1

- `GET /api/orders/:orderNo` 的 SQL 只 SELECT 三列，`publicOrder()` 只序列化三列。
- 测试断言 `Object.keys(order).sort() === ["created_at","order_no","status"]`；我另用真实 express + fake pool 复测，同样只有三列。
- 未发现 phone/email/company/domain/notes 从公开 GET 泄露；公开 POST 201 也不回显这些字段。
- **第二轮：**公开查单限流已改为 IP 固定桶；独立 65 个不同单号实测第 61 次 429（§9）。首轮 D1 已关闭。

### 3.4 后台鉴权 — PASS（真实会话未验证）

- 未登录 `GET /api/admin/orders`、`PATCH /api/admin/orders/:id`、`POST /api/admin/orders/:id/tokens` 均 401（producer 测试 + 代码路径）。
- PATCH/tokens 同时挂 `requireAdmin` + `requireWrite`；viewer 角色会被 `requireWrite` 403（我用 stub 复测）。
- 后台页 401 时显示 `/admin/` 登录引导，不在页面内建登录（浏览器测试通过）。
- 真实 `fc_admin` → `admin_sessions` 查询与角色字段未用真实会话验证。

### 3.5 SQL — PASS（静态/假 pool；真库未验证）

- 所有 SQL 参数化；无字符串拼接注入。
- 迁移有 status/package/price/contact/kind/amount/sign 共 7 个 CHECK。
- 余额公式：`ADMIN_SELECT` 用 `SUM(CASE WHEN kind='usage' THEN -amount ELSE amount END)`；`balanceOf` 同为 topup+adjust−usage。
- usage 超扣：事务内 `SELECT id FROM site_orders ... FOR UPDATE` → 汇总余额 → 不足则 `400 insufficient_tokens`，不写流水。
- **第三轮：**`adjust 0.001` → 400；`1234567.89` / `-1234567.89` → 201；随机 20,000 个合法 2dp 0 误拒（§10）。

### 3.6 页面 — PASS（Chromium 390；真机未验证）

- 三语 key 完整：公开 87/后台 62，全部非空 `[zh,en,bm]`；引用 key 全部存在；EN/BM 无 CJK 残留。
- 390×844 Chromium：公开页/后台/弹窗/成功页/登录引导均无横向溢出（27 项 browser checks）。
- 真实提交：填表→勾同意→提交→页面显示 `ORD-YYMMDD-XXXX`；后台看到该单；改 `live` 成功；token 充值 100 后余额 `100.00`；无 pageerror。
- 三语切换即时生效、写回 localStorage、同步 `?lang=`；`?v=ord1` 仅 icon，符合 ADR-009（CSS/JS 全内联）。
- **第二轮：**D3 已修——500 时 `showApp()` 后错误可见；D7 仍是低优先 meta description 问题，不影响上述通过项（§9）。

### 3.7 迁移 — PARTIAL（静态 PASS；**未在真库执行**）

- 三表、5 索引、7 CHECK、3 表 GRANT + 3 序列 GRANT、BEGIN/COMMIT、IF NOT EXISTS 齐全。
- 幂等性只做静态审查：重复执行时 `CREATE TABLE/INDEX IF NOT EXISTS` 不报错；但若已有旧表缺少约束，IF NOT EXISTS 不会补约束。
- **明确：未在真实 Postgres 执行**；未验证 `fangchan_app` 存在、GRANT 生效、非法 status/amount 被 DB 拒绝、重复执行无错。

### 3.8 挂载 patch — PASS

- 对基线副本 dry-run exit 0；应用后 hash == `.build/api-server.mounted.js`；反向应用恢复基线 hash。
- 项目实际 diff 恰恰 5 行新增，无删除；位置在 library 后、fallback 前；只 patch `work/api-server.js`。
- 项目已落盘该 patch；不要重复应用（会 reversed/already applied）。
- staging 直接 dry-run 因缺基线文件失败，属于 staging 快照形态，不是 patch 本身失败。

### 3.9 既有回归 — PASS（能跑的）/ 部分未验证

- `web/test.js` 76 pass、`work/test-library.js` 69 pass、`work/test-static.js` STATIC PASS（含 `api-server.js` 语法）。
- `work/test-smoke.js` 未跑（生产 HTTP，边界禁止）。
- 真实 `api-server.js` 启动、真实 DB、nginx 静态路由未跑（无依赖/无 DB/不部署）。
- 落盘项目无 express，HTTP 段 SKIP 95 checks；见 §1.2。

### 3.10 方法 — 见 §7（不评价组织方法，只说明独立性/脚本占比）

---

## 4. 验收标准（AC）逐条

| ID | 结果 | 独立证据 |
|---|---|---|
| AC-01 迁移三表/索引/GRANT/可重复 | **PARTIAL** | 静态：3 表、5 索引、7 CHECK、3+3 GRANT、BEGIN/COMMIT、IF NOT EXISTS；**未在真库执行** |
| AC-02 公开下单校验 | **PASS** | 第三轮 138 checks 中 400/field + 201；我复核了校验分支与错误体 |
| AC-03 单号格式/时区/2000 不重复 | **PASS** | 测试通过；`ORD-YYMMDD-XXXX`；UTC 16:30→次日 |
| AC-04 公开查单只三列 | **PASS** | SQL/序列化/测试/独立 harness 均三列 |
| AC-05 后台三路由未登录 401 | **PASS** | 测试三条 401；真实会话未验证 |
| AC-06 状态白名单 | **PASS** | 8 合法 + 大写归一 + archived 400 |
| AC-07 token 余额/超扣 | **PASS** | 100→70→50；超扣 400；usage 负数 400 |
| AC-08 页面三语/key/EN-BM | **PASS** | 独立解析 87/62 key、0 badLen、0 CJK、0 missing |
| AC-09 390px + 真实提交 | **PASS（Chromium）** | 27/27 browser；真机/iOS 未验证 |
| AC-10 不改既有路由/位置 | **PASS** | 项目 diff 5 行；patch 2 hunk；fallback 前 |
| AC-11 首月 2,500 总价/无 4,000 | **PASS** | 页面/API/迁移/文档一致；浏览器与 grep |
| AC-12 23505 后 savepoint 重试 | **PASS（假 pool）** | 测试模拟 aborted + 25P02；201；真库未验证 |

**注意：** AC 表全绿不等于可上线；第三轮 D9/D10 已修复，SPEC §4.2 限流与 §4.5 token 金额合同均通过独立探针（§10）。真实 PG/nginx/真机仍未验证。

---

## 5. 缺陷清单（文件/行、期望/实际、严重级别）

> 本节 D1–D8 是**首轮快照**；第二轮/第三轮状态与 D9/D10 见 §9/§10。第三轮：D1/D2/D3/D4/D6/D9/D10 全部 PASS。

### D1【首轮 High；第二轮 PASS】公开查单限流按“具体单号”分桶，枚举不受 60/10min 限制

- **文件/行**：
  - `work/order-api.js:123`：`r.get("/orders/:orderNo", limit(60, 10 * 60 * 1000), ...)`
  - 根因在既有中间件 `work/api-server.js:164-174`（项目行号）：
    ```js
    const key = (req.ip || "") + ":" + req.path;
    ```
- **期望**：公开查单 60 次/10 分钟按客户端（或至少不随单号变化）限流，使 SPEC §4.2 / ADR-011 所说的“单号可被枚举，靠公开查单限流缓解”成立。
- **实际**：router 挂在 `/api` 下，`req.path` 已被裁剪为 `/orders/<orderNo>`；每个不同单号都新建一个 bucket。实测：
  ```text
  65 个不同 orderNo 的 GET：429 次数 = 0（全部 404）
  同一个 orderNo GET 65 次：429 次数 = 5（第 61 次开始 429）
  7 次非法 POST /api/orders：400,400,400,400,400,429,429（写限流正常）
  rateLimit keys 示例：127.0.0.1:/orders/ORD-261117-0064
  ```
- **影响**：
  1. 单号枚举基本不受限（仅暴露 status/created_at，不泄露 PII，但泄露订单存在性与状态）；
  2. `hits` Map 每个唯一路径永久新增条目（没有清理），可被大量唯一单号请求拖高内存，形成 DoS 面。
- **严重级别**：**High（SPEC 安全合同违约）**。
- **建议方向（不代修）**：按“路由模板/IP”而不是完整 `req.path` 分桶（例如公开查单用独立 key `/api/orders/:orderNo`）；或在 GET 路由前按 IP 做全局限流；并清理过期 bucket。

### D2【首轮 Medium；第二轮 0.001 已修但新增 D9；第三轮 PASS】`adjust` 金额四舍五入到 0 时通过校验，随后 DB CHECK 失败 → 500

- **文件/行**：
  - `work/order-core.js:153-164`（`normalizeToken` 只检查 `amount !== 0`，然后 `money2`）
  - `work/migrations/036_site_orders.sql:58`（`CHECK (amount <> 0)`）
- **期望**：`amount` 非零、2 位小数、绝对 ≤ 10,000,000；不满足应 `400 {error:"invalid_token",field:"amount"}`，不应 500。
- **实际**：
  ```text
  normalizeToken({kind:"adjust",amount:0.001})  -> errors={}  values.amount=0
  normalizeToken({kind:"adjust",amount:-0.001}) -> errors={}  values.amount=-0
  POST topup 100 -> 201 {balance:100}
  POST adjust 0.001 -> 500 {ok:false,error:"server_error"}（DB 23514 token_ledger_amount_chk）
  ledger 未写入
  ```
  后台金额输入是 `type=number step=0.01`，但手工输入 0.001 仍可提交到该路径。
- **严重级别**：**Medium**（错误合同/后台可用性；DB CHECK 阻止了脏数据，不会造成余额错误）。
- **建议方向**：`rounded === 0` 直接 `errors.amount="invalid"`；如需严格，拒绝超过 2 位小数的输入。

### D3【首轮 Low-Medium；第二轮 PASS】后台初次加载遇到 500/网络错误时，主区域空白且错误不可见

- **文件/行**：`web/admin/orders/index.html:151`（`#app hidden`）、`:170-172`（`#alert`/`#loading` 在 `#app` 内）、`:504-525`（`load()` 的 catch 只 `alertBox`，没有 `showApp()`）。
- **期望**：非 401 的加载失败应显示错误（或登录引导），用户能看到“加载失败”。
- **实际**：用 Puppeteer + 返回 500 的 `/api/admin/orders` 复现：
  ```json
  {"appHidden":true,"gateHidden":true,"alertVisible":false,
   "bodyText":"ROOFX / 建站订单 中文 EN BM"}
  ```
  即 `#app`/`#gate` 都隐藏，`#alert` 文本已设置但父容器隐藏；页面只剩 header。
- **严重级别**：**Low-Medium**（DB/网络故障时运营看不到错误；不影响成功路径）。
- **建议方向**：catch 内先 `showApp()` 再显示 alert，或把全局 alert 移到 `#app` 外。

### D4【首轮 Low；第二轮 PASS】staging `test-orders.js` 在无 express 时不是 SKIP，而是崩溃

- **文件/行**：`work/test-orders.js:236-240` 返回 `[]`；`:461-466` 中 `if (db)` 为真后访问 `db.orders` → TypeError。
- **期望**：按 `INTEGRATION.md` §4 打印 `… SKIP HTTP …` 并继续跑纯逻辑/页面检查，最终 PASS。
- **实际（首轮）**：无 express 的环境会进入 `main().catch` 打印 `test-orders crashed` 并 exit 1；staging 有 express，所以首轮 131 项未触发。**第二轮已改成 `return null`，项目 95 checks + SKIP 正常（见 §9）。**
- **第三轮状态**：`return null` 已同步到 staging 与项目（两边 `43330cb9...`）；项目无 express 跑出 `… SKIP … ORDERS PASS / 95 checks`，不再崩溃（见 §10）。
- **严重级别**：**Low**（测试脚本，不是生产代码）。

### D5【首轮/第二轮仍 Low，非阻塞】文档/证据计数漂移

- `docs/order-system/VERIFICATION.md:135` 写“公开页 86 个 key”，实际当前为 **87**（`node work/test-orders.js` 输出“实际 87”，我的独立解析也是 87）。
- `docs/order-system/{VERIFICATION,SPEC,VERIFY,INTEGRATION}.md` 仍写 **131 checks / 旧 test hash 627680…**；第三轮实际为 **138 checks / 43330cb9…**（未改这些文档）。
- `.build/test-orders.out:130` 是旧运行 `ORDERS PASS / 123 checks`；当前是 **138**（staging `.build/test-orders.out` 时间 15:27，早于本轮 138 测试）。
- `.build/browser-check.js:195` 标签 “后台弹窗 390px 390px”（重复）；`:219` 桌面检查标签仍写 “390px”（实际 1440）。
- **严重级别**：**Low（证据质量；不影响功能）**。

### D6【首轮 Low；第二轮指定四项 PASS】若干校验边界比 SPEC 宽

- **第二轮已修（指定四项）：**`phone="abc1234567"` → 400/phone；`email="a@b..com"` → 400/email；`domain="a-.com"` → 400/domain；`adjust 0.001` → 400/invalid_token。
- **残留低优先：**`phone="+++1234567"` 仍通过（数字 7，但符号组合任意）；`email="a@b.c"` 通过（TLD 1 位）；`domain="a.c"` 通过；这些不是阻断项。
- **注意：**D6 的 `>2 位小数`修复曾在第二轮引入 D9（合法大额被误拒）；第三轮已用 cents/100 修好（§10）。
- **严重级别**：**Low（数据质量/严格性）**；指定项已修，残留为低优先。

### D7（Low，观察）EN/BM 的 `<meta description>` 仍是中文

- `web/order/index.html:6` 的 `meta description` 是中文静态文案；`apply()` 只更新 `title`/`data-i18n`/`placeholder`，不更新 meta。
- 可见 `innerText` 在 EN/BM 无中文（浏览器测试通过），但分享/SEO 的 description 在 EN/BM 仍是中文。若“EN/BM 无中文残留”按严格口径包含 meta，此项应修。
- **严重级别**：**Low**。

### D8（Low，证据质量）浏览器检查的标签笔误

- `后台弹窗 390px 390px`、`下单页桌面 390px` 是 staging `.build/browser-check.js` 的标签错误，不是产品缺陷；但会让报告看起来像“桌面也按 390 检查”。
- **严重级别**：**Low（仅验证脚本可读性）**。

---

## 6. 是否建议把 staging 落进项目

**事实：项目已被另一个 actor 在 15:34–15:35 落盘，不是我操作的。** 我复核了落盘 diff（第三轮更新）：

- `work/api-server.js`：只有 5 insertions，位置正确；hash = `.build/api-server.mounted.js`，本轮未改。
- **第三轮**：`work/order-api.js`、`work/order-core.js`、`work/test-orders.js`、`web/admin/orders/index.html` 与 staging **哈希全部一致**；`test-orders.js` 两边都是 `43330cb9...`。迁移、公开页、patch 也一致。
- 项目 `git status`：`M work/api-server.js` + 新增未跟踪文件；**没有 commit**，符合“不提交 Git”。
- 项目无 express，`node work/test-orders.js` 跑出 **95 checks + SKIP**；这是 SKIP 形态，不能替代 staging 138；staging 138 已通过。

**建议：**

1. **可以保留落盘用于评审**（文件级已经落盘；patch 基线/位置正确）；**D9/D10 已修复，代码/测试层面可签收**，但真实 PG/nginx/真机未验证，**上线前仍需补验证**。
2. **D5/D7/D8 低优先**；真实 DB/会话/nginx/真机见第 5 条。
3. **test-orders 已对齐**：项目/staging 都是 `43330cb9...`；不要再按旧 hash `62768050...` 覆盖；带 express 的环境重跑 138。
4. **不要重复应用 `work/api-server.patch`**（项目已应用）；回滚用 `patch -R` 前先确认当前 hash。
5. **上线前补真实验证**：测试库迁移/约束/GRANT/幂等、真实 `fc_admin` 会话、真实 `api-server`、nginx `/order/` 与 `/admin/orders/`、iOS Safari 390、BM 母语审校、并发 usage 的 `FOR UPDATE`。
6. **部署脚本仍未包含新后端/迁移**：`INTEGRATION.md` §6 明确 `deploy/deploy.sh` 未改；正式发布前必须由负责人补 `order-api.js`/`order-core.js`/`036_site_orders.sql`，本次不执行。

---

## 7. 独立性与方法说明（按要求只说明，不评价组织方法）

### 7.1 我是否真的独立

- 我是 `lead` 派出的独立 `verifier` 子 agent；**没有参与制作**，没有修改 `work/order-core.js`、`work/order-api.js`、两页、迁移、patch，也没有提交 Git/部署/连生产 DB。
- 我只写本文件；业务代码只读。项目目录的落盘是**另一个 actor** 在验证期间做的，我没有执行。
- 我没有照抄 `VERIFICATION.md` 的 PASS；我复算哈希、重跑命令、独立解析页面、写独立探针，并自己下结论。
- 但我**不是完全独立于工具链**：`test-orders.js`、`.build/browser-check.js`、fake pool、stub auth 都是制作方编写的；我审查了它们并复跑，但它们可能有与实现共享的盲区。我的独立补充是：I18N 解析、价格 grep、迁移结构、patch 基线/反向、限流探针、adjust 探针、后台 500 空白探针、项目 diff/hash 对比。

### 7.2 哪些是脚本、哪些是人

| 验证 | 形式 | 说明 |
|---|---|---|
| 语法/哈希/patch dry-run | 脚本 | `node --check`、`shasum`、`patch`；可复跑 |
| 138 项后端回归 | 脚本（制作方） | 真实 express + fake pool；非真库；D10 已改用不同单号 |
| 27 项浏览器 | 脚本（制作方） | Puppeteer + fake pool + stub auth；非真会话 |
| 三语/价格/资源静态检查 | 脚本（我独立写） | 解析字典、CJK、data-i18n、`?v=` |
| 限流（65 个不同单号） | 脚本（我独立写） | 真实 express + `readLimit`；第 61 次 429 |
| token 金额边界 | 脚本（我独立写） | 0.001 → 400；1,234,567.89 / -1,234,567.89 → 201；随机 20,000 个合法 2dp 0 误拒 |
| 后台 500 错误显示 | 脚本（我独立写） | 真实页面 + Puppeteer + 500 API；app 可见/alert 可见 |
| 迁移/API 代码审查 | 人（我） | 逐行读 `order-core`/`order-api`/迁移/patch |
| 页面视觉 | 人（我，截图） | 看 `order-mobile-zh`、`admin-mobile-zh`、`admin-modal`；非真机 |
| 既有回归 | 脚本 | 76 + 69 + STATIC PASS |
| BM 母语/真机/iOS | **未做** | 见 §5 |

### 7.3 局限

1. **无真实 Postgres**：迁移、CHECK、GRANT、幂等、真实 CRUD、并发 `FOR UPDATE` 均未执行。
2. **无真实管理员会话**：401 用 stub；真实 `fc_admin` → `admin_sessions` 未验证。
3. **无真实 nginx/部署**：`/order/`、`/admin/orders/` 的静态路由与缓存头未验证；`deploy.sh` 未含新文件。
4. **无真机**：只在 Chromium 390×844 跑；iOS Safari/键盘遮挡未验证。
5. **BM 未母语审校**：结构/无中文通过，表达地道度未验证。
6. **制作方测试工具**：`test-orders.js`/`browser-check.js` 是制作方写的；虽然我审查并复跑，仍不能替代真实环境/第三方工具。
7. **验证期间项目被并发落盘**：第三轮已确认项目/staging 的改动文件哈希一致（test-orders 均为 43330cb9…）；仍以 staging 快照为准。
8. **限流真实代理行为**：我只在本地 Express 上验证 `readLimit`；nginx `X-Forwarded-For`/`trust proxy` 的真实链路未验证（D1 的路径分桶实现已修，但真实限流计时仍未在部署环境验证）。

---

## 8. 最终判定（第三轮）

- **核心功能/页面/隐私字段/后台鉴权/事务重试/SQL 静态/patch/迁移静态：PASS。**
- **公开查单限流（SPEC §4.2/ADR-011）：PASS（D1/D10 已修）。**
- **token 金额边界（SPEC §4.5）：PASS（D2/D9 已修；0.001→400，大额 2dp→201）。**
- **后台加载失败显示（D3）：PASS；SKIP 路径（D4）：PASS；D6 指定四项：PASS。**
- **未验证：真实 Postgres、真实管理员会话、nginx/部署、iOS 真机、BM 母语、并发 `FOR UPDATE`、生产 smoke。**
- **结论：PASS（带未验证项）。可保留 staging/落盘供评审；D5/D7/D8 低优先；上线前必须在测试库跑迁移、用真实 `fc_admin` 会话与 nginx 复验、补真机/BM 审校；不 commit、不部署、不碰生产 DB。**

---

## 9. 第二轮复验明细（2026-11-17 15:56，历史；最终状态见 §10）

> 本节是第二轮历史快照（当时 D9/D10 尚未修）；最终 PASS 结论以 §0/§8/§10 为准。

### 9.1 本轮改动与哈希

| 文件 | 第二轮 SHA-256 | 首轮 SHA-256 | 状态 |
|---|---|---|---|
| `work/order-core.js` | `0b697bcd18cce9a6132f7571ee8c5935732f2fac537784bb37791bf70c600bc0` | `3d350684…` | 改（D2/D6） |
| `work/order-api.js` | `6144e0b1ccbca7471478109cdc2ee65072fc9f07927a50ebe932145bb19dc4f2` | `9604cd69…` | 改（D1） |
| `work/test-orders.js` | `7174722bc9522d0a391734db78b0d26c1e90913db989cd7fefb7b34de0ae9191` | `62768050…` | 改（+5 tests） |
| `web/admin/orders/index.html` | `30ddfef65ae13af90832a28de7f3eabe2fd9ab425e30414160020575a9010822` | `d2e76ddd…` | 改（D3） |
| 迁移 / 公开页 / `api-server.patch` | 未变（`036045…` / `0dd78b…` / `733639…`） | 同左 | 未变 |

**项目 vs staging**：以上改动文件在项目与 staging 的 hashes **全部一致**；项目 `work/api-server.js` 仍是 `1a07ac07…`（5 行 patch，未变）；项目仍无 commit。
**项目无 express**：`node work/test-orders.js` → `… SKIP …` + `ORDERS PASS / 95 checks`；staging 有 express → **136 checks**。

### 9.2 复验命令与输出

```console
$ node --check work/order-core.js && node --check work/order-api.js && node --check work/test-orders.js
SYNTAX_OK

$ node work/test-orders.js
...
ORDERS PASS / 136 checks
exit=0
# 136 pass / 0 fail，无 SKIP

$ NODE_PATH="$(npm root -g):$PWD/node_modules" node .build/browser-check.js
...
BROWSER PASS | orders=1 events=2 ledger=1
# 27/27

$ cd "/Users/huangminming/Pik kwong Lau"
$ node web/test.js          # 76 pass, 0 fail
$ node work/test-library.js # 69 pass, 0 fail
$ node work/test-static.js  # STATIC PASS
```

**独立 D1 探针（65 个不同单号，真实 express + `readLimit`）**：

```text
65 UNIQUE orderNo GETs: statuses= 404,429
first 429 at 1-based index: 61
unique numbers: 65
sample: ORD-261117-223V → 404, ORD-261117-223W → 429
```

结论：D1 实现已修；不同单号共享 IP 桶，不再按 orderNo 分桶。

**独立 D2 探针（真实 `order-api` + fake pool）**：

```text
{"kind":"topup","amount":100.5}      => 201 {"balance":100.5}
{"kind":"adjust","amount":0.001}     => 400 {"error":"invalid_token","field":"amount"}
{"kind":"topup","amount":1234567.89} => 400 {"error":"invalid_token","field":"amount"}   ← D9
{"kind":"adjust","amount":-1234567.89}=> 400 {"error":"invalid_token","field":"amount"} ← D9
{"kind":"topup","amount":1.005}      => 400 {"error":"invalid_token","field":"amount"}   （预期拒绝 >2dp）
{"kind":"usage","amount":0.001}      => 400 {"error":"invalid_token","field":"amount"}   （预期拒绝）
```

结论：D2 的 `0.001 → 500` 已修成 400；但 D9 新回归使**合法** 2dp 大额被拒。

**D9 影响面（`work/order-core.js` 的浮点 2dp 检查）**：

```text
0.01 .. 10,000.00 扫描：0 / 1,000,000 个 2dp 值被误拒
随机 0..10,000,000（2dp）：2,466 / 20,000 ≈ 12.3% 被误拒
示例：9173890.72, 4264238.31, 2533733.05, 1234567.89
按区间：100k 266/2000；1M 330/2000；5M 626/2000；9M 636/2000
```

**独立 D3 探针（更新后的 admin 页面 + 500 API + Puppeteer）**：

```json
{
  "appHidden": false,
  "gateHidden": true,
  "alertText": "加载失败，请重试。",
  "alertVisible": true,
  "bodyText": "ROOFX / 建站订单 中文 EN BM 建站订单 … 加载失败，请重试。"
}
```

结论：D3 已修；500 时主区域可见并显示错误，不再空白。

**独立 D4 探针（项目无 express）**：

```text
… SKIP HTTP 路由测试（本机未安装 express；服务器 /srv/fangchan/api 有）
ORDERS PASS / 95 checks
exit=0
```

结论：D4 已修（`return null`）；SKIP 不再崩溃；项目/staging `test-orders.js` 均为 `7174722b…`。

### 9.3 D1–D10 状态（第二轮）

| 项 | 状态 | 说明 |
|---|---|---|
| **D1** 公开查单限流 | **PASS** | 独立 65 个不同单号第 61 次 429；`readLimit` IP 固定桶；Map 有过期清理（`size > 5000` 时清理过期项，非硬上限） |
| **D2** adjust 0.001 → 500 | **FAIL（原症状已修，但新增 D9）** | 0.001 已 400；但合法大额 2dp 被误拒 |
| **D3** 后台 500 空白 | **PASS** | `showApp()` 后 alert 可见；Puppeteer 复现 |
| **D4** 无 express SKIP | **PASS** | 项目 95 checks + SKIP，exit 0；staging/project test hash 一致 |
| **D5** 文档/证据计数漂移 | **Low，非阻塞** | 文档仍 131/旧 hash；实际 136/`7174722b…`；公开 key 87 而文档 86；`.build/test-orders.out` 仍 123 |
| **D6** 校验偏宽 | **PASS（指定四项）** | phone 字母 / email 连续点 / domain 尾 `-` / adjust 0.001 均 400；残留 `phone="+++1234567"`、`email="a@b.c"`、`domain="a.c"` 低优先 |
| **D7** meta description 中文 | **Low，非阻塞** | 仍不可见文本；未修 |
| **D8** 浏览器标签笔误 | **Low，非阻塞** | 仍 “桌面 390px”“弹窗 390px 390px” |
| **D9** 合法大额 2dp 被拒 | **FAIL（Medium，新回归）** | 见 9.4 |
| **D10** D1 回归测试用同一单号 | **Low（新测试缺口）** | 见 9.4 |

### 9.4 新缺陷 D9 / D10

#### D9（Medium）合法的 2 位小数大额被“2dp 检查”误拒

- **文件/行**：`work/order-core.js:165`：
  ```js
  } else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) {
    errors.amount = "invalid";
  }
  ```
- **期望**：`amount=1234567.89`（2 位小数、≤10,000,000）应被接受；`topup` 返回 201，`adjust` 返回 201。
- **实际**：`1234567.89 * 100 = 123456789.00000001`，浮点误差 `1.49e-8 > 1e-9`，被误判 `invalid`；API 返回 400。`-1234567.89` 同样。
- **影响**：0.01–10,000 范围 0 误拒；但 100k–10M 抽样约 12%–32% 的合法 2dp 值被拒（随机 0–10M 为 12.3%）。这是 D2 修复引入的**新回归**，不是原始 0.001 问题。
- **严重级别**：**Medium**（合法大额 token 操作被阻断；不产生脏数据）。
- **建议方向（不代修）**：改为基于“分”整数/字符串校验，例如 `const cents = Math.round(amount * 100); if (Math.abs(amount - cents / 100) > 1e-9) invalid;`，或 `Number(amount.toFixed(2)) !== amount`；补一条 `1234567.89 / -1234567.89` 的 201 回归。

#### D10（Low）D1 回归测试实际重复同一单号，旧实现也会通过

- **文件/行**：`work/test-orders.js:369-375`：
  ```js
  for (let i = 0; i < 65; i++) {
    r = await call("GET", "/api/orders/ORD-000000-XXXX");
    if (r.status === 429) { saw429 = true; break; }
  }
  ok(saw429, "65 个不同单号查询必须触发 429（按 IP 固定桶）");
  ```
- **期望**：65 个**不同**单号；旧按 `req.path` 分桶的实现会因为每个单号独立桶而不 429，从而失败。
- **实际**：循环始终请求同一个 `ORD-000000-XXXX`；旧实现第 61 次也会 429，所以测试**不能**保护 D1。独立 65 个不同单号探针已证明新实现 PASS，但 producer 回归有缺口。
- **严重级别**：**Low（测试质量；不影响生产）**。
- **建议方向**：用 `core.orderNoFromSeq(day, i)` 生成 65 个唯一单号再循环；或至少 65 个不同合法字符串。

### 9.5 未验证项（第二轮仍未变）

- **真实 Postgres**：迁移执行/约束/GRANT/幂等/真实 CRUD/并发 `FOR UPDATE`。
- **真实管理员会话**：`fc_admin` → `admin_sessions`；真实 `api-server` 启动。
- **nginx/部署**：`/order/`、`/admin/orders/` 静态路由与缓存；`deploy/deploy.sh` 仍未含新后端/迁移。
- **真机**：iOS Safari 390/键盘；Android。
- **BM 母语审校**；生产 smoke（未跑，避免生产 HTTP）。

### 9.6 第二轮结论

**仍为 FAIL（仅差 D9 一个阻断项）：**
- D1、D3、D4、D6 指定项已修复并通过独立探针。
- D2 原始症状已修，但新增 D9（Medium）——合法大额 2dp 被误拒；token 金额合同仍 FAIL。
- D10 是低优先测试缺口；D5/D7/D8 仍为非阻塞。
- 核心功能/页面/隐私字段/鉴权/事务/SQL 静态/迁移静态/patch 仍 PASS；真实 PG/nginx/真机仍未验证。
- 修复 D9 + D10 后，在带 express 的环境重跑 **136**；真库/会话/nginx 复验后才可签收。

---

## 10. 第三轮短复验（D9/D10 修复，2026-11-17 15:58）

### 10.1 改动与哈希（D9/D10 修复）

| 文件 | 第三轮 SHA-256 | 第二轮 SHA-256 | 变化 |
|---|---|---|---|
| `work/order-core.js` | `0c7b1159efdb76bdae7ebd035a7fdd52a32fb96af6aeeace94e0a99f76224632` | `0b697bcd…` | D9：cents/100 校验 |
| `work/test-orders.js` | `43330cb9e5cdf1bb1cd47060c173a8fa51afb1f1e67eb89d40d6f9ec8693f859` | `7174722b…` | D9 两条断言 + D10 不同单号 |
| `work/order-api.js` | `6144e0b1ccbca7471478109cdc2ee65072fc9f07927a50ebe932145bb19dc4f2` | 同左 | 未变 |
| `web/admin/orders/index.html` | `30ddfef65ae13af90832a28de7f3eabe2fd9ab425e30414160020575a9010822` | 同左 | 未变 |

**项目 vs staging**：`order-core.js`、`test-orders.js` 两边哈希**完全一致**（`0c7b1159…` / `43330cb9…`）；`order-api.js`、admin 页也与 staging 一致；项目 `api-server.js` 仍 `1a07ac07…`，无 commit。

### 10.2 命令与输出

```console
$ node work/test-orders.js
...
ORDERS PASS / 138 checks
exit=0
# 138 pass / 0 fail，无 SKIP

$ NODE_PATH="$(npm root -g):$PWD/node_modules" node .build/browser-check.js
...
BROWSER PASS | orders=1 events=2 ledger=1
# 27/27，未变

$ cd "/Users/huangminming/Pik kwong Lau"
$ node work/test-orders.js        # … SKIP … + ORDERS PASS / 95 checks
$ node web/test.js                # 76 pass, 0 fail
$ node work/test-library.js       # 69 pass, 0 fail
$ node work/test-static.js        # STATIC PASS
```

### 10.3 独立探针

**D9 金额（`normalizeToken` + 真实 API）**：

```text
normalizeToken:
  1234567.89   -> {} value=1234567.89
  -1234567.89  -> {} value=-1234567.89
  0.001        -> invalid
  -0.001       -> invalid
  1.005        -> invalid
  9999999.99   -> {} value=9999999.99
  10000000.01  -> too_large
  随机 0..10M 合法 2dp：0 / 20,000 被误拒

API:
  topup 1234567.89    => 201 {balance:1234567.89}
  adjust -1234567.89  => 201 {balance:0}
  adjust 0.001        => 400 invalid_token field=amount
```

**D10 限流（65 个不同合法单号，真实 express + `readLimit`）**：

```text
unique orderNos=65 statuses= 404,429 first429= 61
```

即 65 个不同单号共享 IP 固定桶，第 61 次 429；与 producer 的 D10 测试一致。

### 10.4 最终状态

| 项 | 状态 | 说明 |
|---|---|---|
| D1 公开查单限流 | **PASS** | 65 个不同单号第 61 次 429 |
| D2 adjust 0.001 500 | **PASS** | 0.001 → 400 |
| D3 后台 500 空白 | **PASS** | app/alert 可见 |
| D4 无 express SKIP | **PASS** | 项目 95 + SKIP，exit 0 |
| D5 文档/证据漂移 | **Low，非阻塞** | 文档仍 131/旧 hash；实际 138/`43330cb9…`；公开 key 87 vs 文档 86 |
| D6 校验偏宽 | **PASS（指定四项）** | phone 字母/email 连续点/domain 尾 `-`/adjust 0.001 均 400；残留低优先 |
| D7 meta description 中文 | **Low，非阻塞** | 不可见文本 |
| D8 浏览器标签笔误 | **Low，非阻塞** | 仅验证脚本标签 |
| D9 合法大额 2dp 被拒 | **PASS** | 1234567.89/- 201；随机 0/20,000 误拒 |
| D10 D1 测试同一单号 | **PASS** | 已改用 `core.orderNoFromSeq` 65 个不同单号 |

### 10.5 结论

**PASS（带未验证项）。** 代码/测试层面已无已知阻断：D1/D2/D3/D4/D6/D9/D10 全部通过；D5/D7/D8 为低优先非阻断。

**仍未验证（上线前必须补）：**
1. 真实 Postgres：迁移执行/约束/GRANT/幂等/真实 CRUD/并发 `FOR UPDATE`。
2. 真实管理员会话：`fc_admin` → `admin_sessions`；真实 `api-server` 启动。
3. nginx `/order/`、`/admin/orders/` 静态路由；`deploy/deploy.sh` 仍未含新后端/迁移。
4. iOS/Android 真机 390/键盘；BM 母语审校。
5. 生产 smoke（未跑，避免生产 HTTP）。

**建议：** 保留 staging/落盘供评审；修复后仍不 commit、不部署、不碰生产 DB；上线前在测试库跑迁移、用真实 `fc_admin` 会话和 nginx 复验。
