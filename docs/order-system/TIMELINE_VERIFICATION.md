# TIMELINE_VERIFICATION — 订单事件时间线 · 独立验收报告

- 验收人：`timeline-verifier`（depth 2，向 Chief of Staff 汇报；不参与制作、不修代码）
- 验收窗口：2026-11-17 16:34:47 — 16:43:49（Asia/Shanghai）
- staging：`/Users/huangminming/Downloads/日常/order-system-mvp`
- 判定依据：`docs/order-system/TIMELINE_VERIFY.md`（V0–V6）+ `TIMELINE_TASKS.md` §2/§3/§4/§7（CoS 最终裁决）
- 方法：自行读 diff、自行写探针（`/tmp/verify-timeline.js`）、自行写假库（SQL 忠实解释器，不抄 owner 断言）、真实 Chrome CDP 实测 390px、对 owner 测试做变异测试（mutation testing）判断覆盖真假。
- **结论：AC 19/19 PASS；0 FAIL；0 UNVERIFIED。** 发现 3 条 minor（均为 owner 测试覆盖/测试严格性缺陷，不是产品功能缺陷）+ 2 条集成限制。

---

## 0. 一页摘要

| 项 | 实测 | 制作方自述 | 判定 |
|---|---|---|---|
| `node work/test-orders.js` | `ORDERS PASS / 154 checks`，`✗` 计数 0，exit 0 | 154 | ✅ 真 |
| 新增 check 数 | 154 − 138 = **16** | 16 条 | ✅ 真 |
| `order-api.js` 行数 | 279 → 297（+18） | +18/−0 | ✅ 真 |
| `test-orders.js` 行数 | 502 → 689（+187） | +187/−0 | ✅ 真 |
| `index.html` 行数 | 659 → 794（+135） | +135/−0 | ✅ 真 |
| 删除行（三文件） | 0 / 0 / 0 | −0 | ✅ 真 |
| `work/order-core.js` | md5 `0661c8e0e8f6a07187459f68f9739390`，mtime `Nov 17 15:56` | 未改 | ✅ 真 |
| `work/migrations/` | 仅 `036_site_orders.sql` | 未新增迁移 | ✅ 真 |
| 独立 API 探针 | **PROBE PASS / 35 checks** | — | ✅ |
| 390px 实测（Chrome 157 CDP） | `innerWidth=390`，`#dtimeline` `scrollWidth=clientWidth=342`，文档无横向溢出 | 同 | ✅ 真（我独立复现） |
| 缺陷 | 0 blocker / 0 major / 3 minor | — | — |

> 说明：`diff -u` 的「非空新增行」计数为 +17/+167/+128，差额是三文件新增的空白行；**文件总行数差 +18/+187/+135 与自述完全一致**。

---

## 1. V0 回归（必跑，先跑）

```bash
cd /Users/huangminming/Downloads/日常/order-system-mvp
node work/test-orders.js 2>&1 | tail -6
```

真实尾部输出（原样）：

```text
✓ 事件时间线：严格实例仍返回完整 4 行（未被 requireWrite / 限流拦截）
✓ 假库最终 2 条订单（含冲突重试）
✓ 假库 5 条 token 流水（成功记账）
✓ 假库 3 条事件（2 created + 1 status）

ORDERS PASS / 154 checks
```

- `N = 154 ≥ 138` ✅
- 全量 `✗` 计数：`node work/test-orders.js 2>&1 | grep -c '✗'` → `0` ✅
- exit code：`0` ✅
- 断言调用点：`.baseline` 107 处 → `work` 123 处（+16），与 `154−138=16` 吻合。

**AC-R2 的独立佐证（关键）**：把**改动前的 502 行测试文件**原样拿来跑**当前实现**：

```bash
# /tmp/basecheck：.baseline/test-orders.js + 当前 order-core.js/order-api.js + 软链 web、node_modules
cd /tmp/basecheck && node test-orders.js 2>&1 | tail -3
# ✓ 假库 3 条事件（2 created + 1 status）
# ORDERS PASS / 138 checks
```

→ 原有 138 条断言在当前实现上仍全绿、0 `✗`；叠加 diff 无删除行，可判定原有断言未删、未弱化。

---

## 2. V1 diff 审查

```bash
diff -u .baseline/order-api.js work/order-api.js
diff -u .baseline/test-orders.js  work/test-orders.js
diff -u .baseline/index.html     web/admin/orders/index.html
```

| 文件 | 基线 → 现状 | 删除行 | 新增行 | 结论 |
|---|---|---|---|---|
| `work/order-api.js` | 279 → 297 | **0** | +18 | 仅新增 `GET /admin/orders/:id/events` 路由块 |
| `work/test-orders.js` | 502 → 689 | **0** | +187 | 仅新增假库 events 分支 + `eventsTests()` + 调用一行 |
| `web/admin/orders/index.html` | 659 → 794 | **0** | +135 | 仅新增 CSS / DOM / 9 个 i18n / JS 时间线块 + 2 处刷新 |

越界检查：

```bash
md5 -q work/order-core.js      # 0661c8e0e8f6a07187459f68f9739390  ← 与验收方给定值一致
ls -l work/order-core.js       # Nov 17 15:56（早于 .baseline 快照 16:06，早于本次验收 16:34）
ls work/migrations/            # 只有 036_site_orders.sql
```

- `work/order-core.js` 未被修改（md5 + mtime 双重佐证）✅
- 未新增迁移 ✅
- 仓库无 `.git`（`git status` → `not a git repository`），因此 `.baseline/` 是唯一可比基线；`.baseline/*` mtime 均为 `Nov 17 16:06`，验收期间未变 ✅

---

## 3. V2 API 行为（独立探针，不复用 owner 断言）

自写探针：`/tmp/verify-timeline.js`（**未落进仓库**）。特征：

1. 不 `import` owner 的 `eventsTests()`，只 `require("work/order-api.js")` + 自建 express 实例。
2. 自建假库是**SQL 忠实解释器**：SQL 没写 `ORDER BY` 就不排序、没写 `LIMIT` 就不截断、`SELECT *` 会真的把 `order_id` 漏出来；没有 owner 假库的 `: 100` 兜底。
3. 中间件用**间谍**：`requireWrite` 恒 500、`rateLimit()` 返回的中间件恒 429；若路由误挂，必然红。
4. 挂载方式对齐生产：`app.use("/api", createOrderApi(...))` + `/api` JSON 404 fallback（见 `work/api-server.patch`）。

### 3.1 结果

```text
PROBE PASS / 35 checks
```

| 编号 | 探针断言 | 关键实测 |
|---|---|---|
| A1 | 无 cookie → 401 `ok:false` | `[401,false,"admin_required"]`，`Content-Type: application/json` |
| A2 | 非法 id → 404 `not_found` | `0`/`-3`/`abc`/`1.5`/空格/`999999999999999999999`/`9007199254740992`/空段 全部 `[404,false,"not_found"]` |
| A3 | `999999` 不存在 → 404 | `[404,false,"not_found"]` |
| A4 | 行键集合**恰好** 5 个 | `Object.keys(row).sort()` = `["actor","created_at","id","note","type"]`，且无 `order_id` |
| A5 | `created_at DESC, id DESC` | 插入序 `[12,11,14,13]`（故意≠期望序）→ 返回 `[13,12,14,11]`；同秒 id 13 在 id 12 前 |
| A6 | 无事件 → `rows:[]` | `[200,true,[]]` |
| A7 | 120 条 → 100 条且最新 | 长度 100，首 `2120` 尾 `2021`，严格 id 降序 |
| A8 | GET 只读 | events 条数 / orders 内容 / 写语句数 全不变；`pool.connect()` 调用 0 次 |
| A9 | SQL 只含 SELECT | 对 `site_order_events` 的 SQL 全部 `SELECT` |
| 附加 | `note:null` / `actor:null` 原样 | `[null,null,"note"]`（不是 `""`） |
| 附加 | 只挂 `requireAdmin` | `requireWrite` spy 调用 0；`rateLimit` 中间件执行 0；严格实例仍 200/4 行 |
| 附加 | 并发两单 | 各自返回 `13` / `21`，不串 |
| 附加 | `1e3`/`0x10`/`+12`/`012` | 见下表（按裁决 #4：只记录行为，不作格式校验证据） |

### 3.2 `core.parseId` 既有行为的实测（裁决 #4）

| 输入 | 解析为 | HTTP 结果 | 说明 |
|---|---|---|---|
| `1e3` | `1000` | 404 `not_found` | 走到存在性查询（假库无 1000） |
| `0x10` | `16` | 404 `not_found` | 同上 |
| `+12` | `12` | 404 `not_found` | 同上 |
| `012` | `12` | 404 `not_found` | 同上 |

> 即：结果正确（404），但理由不是「格式非法」，而是「不存在」。与裁决 #4 一致，**不**纳入格式校验断言。

### 3.3 实际 SQL（实现原文，探针抓取）

```sql
SELECT id, type, note, actor, created_at FROM site_order_events WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100
```

- 排序 / 截断都在 SQL 层；JS 里没有 `sort()` / `slice()`（前端也没有，见 §4.6）。
- 存在性查询：`SELECT id FROM site_orders WHERE id = $1`，先查后 404，因此「订单不存在」不会退化成 `200 rows:[]`。

---

## 4. V3 前端静态检查

### 4.1 F1 容器与位置

```bash
grep -n 'id="dtimeline"\|id="timeline-sect"\|id="dtimeline-status"' web/admin/orders/index.html
# 268:    <div class="sect" id="timeline-sect">
# 270:      <div id="dtimeline-status" role="status"></div>
# 271:      <div id="dtimeline"></div>
```

DOM 嵌套实测：位于 `#modal > .sheet` 内，**在 token 区块（`#tokenbtn` 所在 `.sect`，239–266 行）之后、`#dalert`（274 行）之前**，与 §3 合同一致。

### 4.2 F2 API 路径

```bash
grep -n '/events' web/admin/orders/index.html
# 685:    return fetchJson("/api/admin/orders/" + encodeURIComponent(orderId) + "/events")
```

### 4.3 F3 9 个 i18n key × 三语（独立解析，不 grep key 名）

用自写 node 解析器从 `I18N = {...}` 提取并逐项断言：长度为 3、每项非空字符串、EN/BM 无 CJK、zh 含中文。

| key | len | EN CJK | BM CJK | zh 含中文 |
|---|---|---|---|---|
| `timeline_section` | 3 | 无 | 无 | 是 |
| `timeline_loading` | 3 | 无 | 无 | 是 |
| `timeline_empty` | 3 | 无 | 无 | 是 |
| `timeline_err` | 3 | 无 | 无 | 是 |
| `timeline_err_not_found` | 3 | 无 | 无 | 是 |
| `timeline_actor` | 3 | 无 | 无 | 是 |
| `timeline_type_created` | 3 | 无 | 无 | 是 |
| `timeline_type_status` | 3 | 无 | 无 | 是 |
| `timeline_type_note` | 3 | 无 | 无 | 是 |

`bad=0`；字典总 key 数 71。

### 4.4 F4 401 未被吞

```bash
grep -n 'showGate\|code === "auth"' web/admin/orders/index.html
# 451: if (res.status === 401) { showGate(); throw { code: "auth" }; }
# 693: if (e && e.code === "auth") return;        ← loadTimeline catch
```

`fetchJson` 在 401 时先 `showGate()` 再 `throw`；`loadTimeline` 的 catch 对 auth **直接 return**（不写文案）。真实浏览器行为见 §5.4。

### 4.5 F5 两处刷新

```bash
grep -n 'loadTimeline(openId)' web/admin/orders/index.html
# 745: 保存状态成功 .then 内：if (!current || current.id !== openId) return; loadTimeline(openId);
# 778: token 记账成功 .then 内：同上
```

两处都先校验弹窗仍停在同一张单（`openId`），再刷新。✅

### 4.6 F6 四态与「前端不截断」

- loading：`timelineLoading()`（621 行）
- rows：`renderTimeline()`（649 行）
- empty：`timelineEmpty()`（630 行）
- error：`timelineError()`（640 行）；404 → `timeline_err_not_found`（695 行），其他 → `timeline_err`
- 单元素切 role：常驻 `role="status"`，error 时 `setAttribute("role","alert")`，回 loading 复位（符合裁决 #6）
- 前端全文无 `.slice(` / `.sort(` → 不在客户端截断/排序 ✅

---

## 5. V4 390px 与关键行为：真实 Chrome 实测（不是转述）

环境：Google Chrome **157.0.8103.79**，`--headless=new --no-sandbox`，CDP `Emulation.setDeviceMetricsOverride {width:390,height:844,deviceScaleFactor:2,mobile:true}`，`Emulation.setTouchEmulationEnabled`。
被测页面是 `web/admin/orders/index.html` 的**逐字节副本**，仅注入 `window.fetch` stub 提供数据（CSS/DOM/业务 JS 未改），本地 HTTP origin。
探针：`/tmp/verify-390.js`，结果 **V4 PASS / 15 checks**。

### 5.1 390px 度量（zh，详情弹窗打开，3 条事件含超长无空格 note）

```json
{"innerWidth":390,"dpr":2,"docSW":390,"docCW":390,"bodySW":390,
 "dtimeline":{"sw":342,"cw":342,"ow":342},
 "sect":{"sw":342,"cw":342,"ow":342},
 "sheet":{"left":10,"right":380,"width":370},
 "items":3,"noteW":330,"noteH":220,"noteLineHeight":"20px","itemW":342,"docOverflow":false}
```

- `innerWidth === 390` ✅（与制作方口径一致，我独立复现）
- `#dtimeline` `scrollWidth === clientWidth === 342` ✅
- `#timeline-sect` `scrollWidth === clientWidth === 342` ✅
- 文档 `scrollWidth 390 <= clientWidth 390`，无横向溢出 ✅
- 超长无空格 note 高度 220px（20px 行高 → 11 行），确认 `word-break/overflow-wrap` 生效 ✅
- 弹窗 `left=10 / right=380`，在 390px 视口内 ✅

截图（临时文件，不入库）：`/tmp/tl390-zh-timeline.png`（含 3 类徽标、长 note 折行、actor 换行）。

### 5.2 三语切换（en / bm / zh）

| 语言 | `#dtimeline` sw/cw | 文档 sw/cw | 溢出 |
|---|---|---|---|
| en | 342 / 342 | 390 / 390 | 无 |
| bm | 342 / 342 | 390 / 390 | 无 |
| zh | 342 / 342 | 390 / 390 | 无 |

事件请求计数：打开弹窗 1 次 + 切 3 次语言 = 4 次（delta=3），**每次切换恰好 1 次，无请求风暴/无循环** ✅

### 5.3 竞态 A/B 与关窗作废

- 竞态：A 请求延迟 400ms、B 延迟 20ms，先点 A 再点 B → 最终 DOM 只有 `ORDER-2-*`，慢的 A 不覆盖 B ✅
- 关窗：A 延迟 400ms，打开后 50ms 关窗 → 700ms 后 `#dtimeline` 0 条、状态文案为空 ✅
  （机制：`closeDetail()` 里 `timelineSeq++`；catch 首行 `if (seq !== timelineSeq) return;`）

### 5.4 401 路径（怀疑点 5 的真实行为）

stub 令 `/events` 返回 401 后点开详情：

```json
{"modalHidden":true,"gate":true,"appHidden":true,
 "statusText":"","role":"status","items":0}
```

→ 弹窗被 `showGate() → closeDetail()` 关闭，`#dtimeline-status` 被复位为 `role="status"`、**文案为空**，错误文案没有写进已关闭的弹窗 ✅。原因：`showGate` 内 `closeDetail()` 先 `timelineSeq++`，catch 第一道 guard 直接 return，第二道 `e.code === "auth"` 再兜一层，第三道 `$("modal").hidden` 再兜一层。

### 5.5 既有功能不回归（390px 下）

- 列表页 390px：渲染 3 行、`docSW 390 <= docCW 390`、无横向溢出 ✅
- 三语切换、列表渲染、详情打开/关闭均正常 ✅

---

## 6. AC 总表（19 条）

| AC | 判定 | 证据（命令 + 关键输出） |
|---|---|---|
| AC-A1 无 cookie 401 | **PASS** | `/tmp/verify-timeline.js` → `✓ A1 … [401,false,"admin_required"]` |
| AC-A2 非法 id 404 | **PASS** | 同上 → 8 个非法 id 全 `[404,false,"not_found"]`（实现严口径 404，非 400） |
| AC-A3 不存在 404 | **PASS** | `✓ A3 … [404,false,"not_found"]` |
| AC-A4 5 键 | **PASS** | `Object.keys(row).sort()` = `["actor","created_at","id","note","type"]`，无 `order_id` |
| AC-A5 排序 | **PASS** | 自造假库插入序 `[12,11,14,13]` → 返回 `[13,12,14,11]`；SQL 文本含 `ORDER BY created_at DESC, id DESC` |
| AC-A6 空列表 | **PASS** | `✓ A6 … [200,true,[]]` |
| AC-A7 LIMIT 100 | **PASS** | 120 条 → 100 条，首 `2120` 尾 `2021`；SQL 文本含 `LIMIT 100` |
| AC-A8 GET 只读 | **PASS** | events/orders/写语句数不变；`pool.connect()` 0 次 |
| AC-A9 只读 SQL | **PASS** | 对 `site_order_events` 的 SQL 全部 `SELECT`，无 INSERT/UPDATE/DELETE |
| AC-F1 容器 | **PASS** | 268–272 行；`#modal > .sheet` 内，token 之后 `#dalert` 之前 |
| AC-F2 `/events` 路径 | **PASS** | 685 行 |
| AC-F3 9 key × 三语 | **PASS** | 自写解析：9/9 长度 3、非空、EN/BM 无 CJK（§4.3 表） |
| AC-F4 401 未吞 | **PASS** | 451/693 行；真实浏览器 401 复现见 §5.4 |
| AC-F5 两处刷新 | **PASS** | 745/778 行，且带 `openId` 同单校验 |
| AC-F6 四态 | **PASS** | loading/rows/empty/error(404/其他) 四函数齐备；单元素切 role；前端无截断 |
| AC-F7 390px | **PASS（实测）** | Chrome 157 CDP：`innerWidth=390`、`#dtimeline 342/342`、文档无溢出；三语均无溢出 |
| AC-F8 不破坏既有 | **PASS** | 154 checks + 基线 502 行测试跑当前实现仍 138 PASS；390px 列表/三语实测正常 |
| AC-R1 全绿 ≥138 | **PASS** | `ORDERS PASS / 154 checks`，`✗`=0，exit 0 |
| AC-R2 原断言未删/未弱化 | **PASS** | 三文件删除行 0；基线测试文件跑当前实现 138 PASS / 0 `✗` |

**FAIL：无。UNVERIFIED：无。**（集成限制见 §9，不属于 AC 失败）

---

## 7. 缺陷清单（0 blocker / 0 major / 3 minor）

> 三条 minor 都落在 **owner 的测试代码**（`work/test-orders.js` / 测试严格性），不是产品功能缺陷；产品代码本身按合同实现。列出来是因为它们会让「未来回归」假绿。

### D-01（minor，owner: `timeline-backend-engineer`）前端静态覆盖不足，四处删改仍全绿

`pageChecks()` 只对「字典里已存在的 key」做长度/CJK 检查；8 个只在 JS 里 `t()` 用的 key 没有存在性断言，DOM 容器、两处刷新调用、`/events` 路径也没有断言。

复现（在 `/tmp/mut` 副本上做，不碰仓库）：

```bash
REPO='/Users/huangminming/Downloads/日常/order-system-mvp'
rm -rf /tmp/mut && mkdir -p /tmp/mut/web/order /tmp/mut/web/admin/orders
cp "$REPO"/work/{order-api.js,order-core.js,test-orders.js} /tmp/mut/
ln -s "$REPO/node_modules" /tmp/mut/node_modules
ln -s "$REPO/web/order/index.html" /tmp/mut/web/order/index.html
cp "$REPO/web/admin/orders/index.html" /tmp/mut/web/admin/orders/index.html
cd /tmp/mut

# 变异 1：删掉整段 #timeline-sect DOM
python3 - <<'PY'
p='web/admin/orders/index.html'; s=open(p).read()
s=s.replace('    <div class="sect" id="timeline-sect">\n      <h3 data-i18n="timeline_section"></h3>\n      <div id="dtimeline-status" role="status"></div>\n      <div id="dtimeline"></div>\n    </div>\n','')
open(p,'w').write(s)
PY
node test-orders.js | tail -1        # ORDERS PASS / 154 checks  ← 应红却绿

# 变异 2：删掉 9 个 key 中的 timeline_type_note
# 变异 3：删掉两处 loadTimeline(openId)
# 变异 4：/events → /evntz
# 四者单独跑，均为 ORDERS PASS / 154 checks
```

影响：AC-F1/F2/F5 目前只由本报告的静态检查兜底；若后续有人删掉 DOM/刷新/路径，`node work/test-orders.js` 不会红。
建议：`requiredKeys` 加 9 个 key；加 `id="dtimeline"` / `id="timeline-sect"` 存在断言；对 `loadTimeline(openId)` 计数 ≥2；断言 `/events` 字面量。

### D-02（minor，owner: `timeline-backend-engineer`）假库 `LIMIT` 兜底，使「120→100」行为断言可假绿

`work/test-orders.js:248`：

```js
return { rows: list.slice(0, m ? Number(m[1]) : 100).map(...) };
```

SQL 没写 `LIMIT` 时假库仍返回 100 条，所以「120 条只回 100 条」这条**行为**断言在实现漏写 `LIMIT` 时仍会绿；真正抓住它的是 SQL 文本断言（`/LIMIT\s+100\b/`）。

复现：

```bash
cd /tmp/mut   # 上面的副本，order-api.js 用原始 work 版本
python3 - <<'PY'
p='order-api.js'; s=open(p).read()
s=s.replace('ORDER BY created_at DESC, id DESC LIMIT 100','ORDER BY created_at DESC, id DESC')
open(p,'w').write(s)
PY
node test-orders.js 2>&1 | grep '✗'
# 只有 1 条红：事件 SQL = … + LIMIT 100（行为断言仍绿）
```

影响：覆盖结论依赖文本断言而非行为；若将来有人放宽文本断言，就会真漏。
建议：假库改为「无 LIMIT 就返回全部」，让行为断言自己红。

### D-03（minor，owner: `timeline-backend-engineer`）假库排序固定补 `id DESC` 次键，第二排序键只由文本断言兜底

`work/test-orders.js:240-244`：只要 SQL 含 `ORDER BY created_at DESC`，假库就一定会用 `b.id - a.id` 做同秒 tiebreak。因此 SQL 少写 `, id DESC` 时，**返回顺序仍然正确**，只有 SQL 文本断言会红。

复现：

```bash
cd /tmp/mut
python3 - <<'PY'
p='order-api.js'; s=open(p).read()
s=s.replace('ORDER BY created_at DESC, id DESC LIMIT 100','ORDER BY created_at DESC LIMIT 100')
open(p,'w').write(s)
PY
node test-orders.js 2>&1 | grep '✗'
# 只有 1 条红：SQL 文本断言；排序行为断言仍绿
```

影响：TASKS §7 特别强调「必须造同 `created_at` 不同 id」，但 owner 假库自己实现了第二排序键，导致该场景的行为证据弱化。
建议：假库解析 `ORDER BY` 列表，SQL 写几个键就排几个键（本报告的 `/tmp/verify-timeline.js` 就是这么做的；用它跑当前实现，`created_at` 同秒场景返回 `[13,12,14,11]`，真绿）。

### 集成限制（非缺陷，记录）

- **O-01**：staging 无 `work/api-server.js`（只有 `work/api-server.patch`），生产挂载（`app.use("/api", createOrderApi({...}))` 与 `/api` JSON 404 fallback）只能按 patch 推断，未在本机启动生产入口验证。
- **O-02**：`GET /api/admin/orders//events`（字面空段）不匹配 `:id` 路由，其 `404 {ok:false,error:"not_found"}` 依赖生产 `/api` fallback；`%20` 空段则命中路由并 404 `not_found`（已实测）。前端 `openDetail` 不会产生空 id，故不可达。

---

## 8. 六个「额外怀疑点」的独立结论

| # | 怀疑点 | 结论 | 证据 |
|---|---|---|---|
| 1 | 误挂 `requireWrite`，现有测试会不会红？ | **真红，不是假绿** | 变异（路由加 `requireWrite`）→ `ORDERS FAIL 2 / 154`（403≠200）；变异（加 `limit(30,60000)`）→ `FAIL 2`（429≠200）。我的探针 spy 也证实 `requireWrite=0`、`rateLimit` 中间件执行 0 次 |
| 2 | 假库会不会替实现兜底排序？ | **一半真一半假** | SQL 无 `ORDER BY` → 假库不排序，测试真红（M2 → 3 条红）。但假库在排序时**总是**补 `id DESC`，故「少写 `, id DESC`」只有 SQL 文本断言会红（M3 → 1 条红）。见 D-03 |
| 3 | 假库 `LIMIT` 是否替实现兜底？ | **是，行为断言假绿；文本断言真红** | 删掉 `LIMIT 100` 后行为断言仍绿（假库默认 `: 100`），仅 SQL 文本断言红（M4 → 1 条红）。我的探针假库无默认值，当前实现行为真绿 100/120。见 D-02 |
| 4 | `pageChecks()` 是否真检查 9 key 三语长度与 EN/BM 无 CJK？ | **长度/CJK 是真检查；key 存在性不是** | 变异「`timeline_empty` 改成长度 2」→ 红；「EN 塞中文」→ 红。但「删掉 `timeline_type_note`」→ 仍 `PASS 154`。DOM/刷新/路径同样未覆盖。见 D-01 |
| 5 | 401 时 catch 会不会把错误写进已关闭弹窗？ | **不会，三层防护** | 真实浏览器 401：`modalHidden=true`、`gate=true`、`statusText=""`、`role=status`、`items=0`。`showGate→closeDetail→timelineSeq++` 使 catch 首道 guard 命中；另有 `e.code==="auth"` 与 `modal.hidden` 兜底 |
| 6 | 切语言会不会请求风暴/无限循环？ | **不会** | 实测打开 1 次 + 切 3 次 = 4 次 `/events` 请求（delta=3，每次 1 次）；`renderTimeline`/`timelineLoading` 不调用 `apply()`，无回环 |

---

## 9. 未验证项与限制（如实声明）

1. **无真实 Postgres**：所有 DB 行为在假库上验证；`bigserial` 经 `pg` 出参为字符串这一形态未实测（AC 按裁决 #5 只断言键集合/顺序，不断言 `typeof id`，故不影响判定）。
2. **无真实 `api-server.js`**：生产挂载与真实 `requireAdmin` 的 401 body 未在本机跑到（staging 只有 patch）。路由确实只挂了 `requireAdmin`（静态 + 探针 spy 双证），但 body 字符串由既有中间件决定。
3. **390px 是 Chrome 157 headless + CDP device emulation（mobile=true, dpr=2）**，不是物理手机；测量值为 CSS px，与制作方口径一致。
4. **前端 save/token 未做浏览器端到端**（stub 未实现 PATCH/tokens）：其刷新调用为静态diff + 行号证据；后端对应逻辑由 154 checks 覆盖。
5. 若运行环境没有 `express`，`httpTests()` 与 `eventsTests()` 会打印 SKIP 并跳过（baseline 既有行为），此时 check 数会降回 138；本机 `express` 存在（`node_modules/express`），实测 154。

---

## 10. 独立性声明

**本文件作者没有修改任何制作文件。** 本次验收只写了本文件；所有探针/变异脚本都在 `/tmp`（`/tmp/verify-timeline.js`、`/tmp/verify-390.js`、`/tmp/mut/`、`/tmp/basecheck/`），未落进仓库。

`ls -l` 证据（全部 mtime 早于本次验收开始时间 **16:34:47**；仅本文件为验收期间新增）：

```text
-rw-------@ 1 huangminming  staff   7686 Nov 17 15:56 work/order-core.js      ← md5 0661c8e0e8f6a07187459f68f9739390
-rw-------@ 1 huangminming  staff  12790 Nov 17 16:25 work/order-api.js
-rw-------@ 1 huangminming  staff  35026 Nov 17 16:30 work/test-orders.js
-rw-------@ 1 huangminming  staff  35534 Nov 17 16:32 web/admin/orders/index.html
-rw-------@ 1 huangminming  staff  11618 Nov 17 16:06 .baseline/order-api.js
-rw-------@ 1 huangminming  staff  24802 Nov 17 16:06 .baseline/test-orders.js
-rw-------@ 1 huangminming  staff  29318 Nov 17 16:06 .baseline/index.html
```

未 commit（仓库无 `.git`）、未部署、未连任何数据库。

---

## 附录 A：复现命令清单

```bash
REPO='/Users/huangminming/Downloads/日常/order-system-mvp'
cd "$REPO"

# V0
node work/test-orders.js 2>&1 | tail -6
node work/test-orders.js 2>&1 | grep -c '✗'          # 0

# V1
for f in order-api.js test-orders.js; do diff -u ".baseline/$f" "work/$f"; done
diff -u .baseline/index.html web/admin/orders/index.html
md5 -q work/order-core.js                             # 0661c8e0e8f6a07187459f68f9739390
ls work/migrations/                                   # 036_site_orders.sql

# V2（独立探针，文件在 /tmp）
node /tmp/verify-timeline.js                          # PROBE PASS / 35 checks

# V4（真实 Chrome CDP，文件在 /tmp）
node /tmp/verify-390.js                               # V4 PASS / 15 checks

# 基线测试跑当前实现（AC-R2 佐证）
cd /tmp/basecheck && node test-orders.js 2>&1 | tail -1   # ORDERS PASS / 138 checks
```

## 附录 B：变异测试矩阵（用来判断「真红 / 假绿」）

后端（在 `/tmp/mut` 的 `order-api.js` 副本上）：

| 变异 | owner 套件结果 | 结论 |
|---|---|---|
| 路由加 `requireWrite` | **FAIL 2** | 覆盖真实 |
| 路由加 `limit(...)` | **FAIL 2** | 覆盖真实 |
| 删 `ORDER BY` | **FAIL 3** | 覆盖真实 |
| 删 `, id DESC` | FAIL 1（仅 SQL 文本） | 行为断言假绿 → D-03 |
| 删 `LIMIT 100` | FAIL 1（仅 SQL 文本） | 行为断言假绿 → D-02 |
| SQL 不排序 + JS `sort()` 兜底 | **FAIL 2** | 覆盖真实 |
| `note/actor` 兜底成 `""` | **FAIL**（null 断言） | 覆盖真实 |
| 删存在性查询 | **FAIL**（404 断言） | 覆盖真实 |
| `SELECT *` | **FAIL**（5 列断言） | 覆盖真实 |

前端（在 `/tmp/mut` 的 `index.html` 副本上）：

| 变异 | owner 套件结果 | 结论 |
|---|---|---|
| 删 `#timeline-sect` DOM | PASS 154 | **假绿** → D-01 |
| 删 `timeline_type_note` key | PASS 154 | **假绿** → D-01 |
| 删两处 `loadTimeline(openId)` | PASS 154 | **假绿** → D-01 |
| `/events` → `/evntz` | PASS 154 | **假绿** → D-01 |
| `timeline_empty` 改长度 2 | **FAIL** | 覆盖真实 |
| `timeline_err` 的 EN 塞中文 | **FAIL** | 覆盖真实 |

---

*报告结束。判定严格按 TIMELINE_VERIFY.md：发现真问题比报「通过」更有价值；同时不为挑刺把合规项判 FAIL。*

---

## 复验轮（round 2，2026-11-17 16:47–16:51，Asia/Shanghai）

- 验收人：`timeline-verifier-2`（depth 2，向 Chief of Staff 汇报；不修代码，只读复核）
- 对象：owner 针对 D-01/D-02/D-03 的返工，改动仅 `work/test-orders.js`（自称 154→162）
- 回归：`ORDERS PASS / 162 checks`，`✗`=0（真实 N=**162**，较 round 1 的 154 +8）
- `tail -4` 原样：

```
✓ 假库 5 条 token 流水（成功记账）
✓ 假库 3 条事件（2 created + 1 status）

ORDERS PASS / 162 checks
```

- 纯新增：`diff .baseline/test-orders.js work/test-orders.js | grep -c '^<'` = **0**
- 产品代码未被污染：`work/order-api.js` mtime **16:25**、`web/admin/orders/index.html` mtime **16:32**（均与 round 1 一致）；`work/order-core.js` md5 `0661c8e0e8f6a07187459f68f9739390`；只读路由仍 `requireAdmin` 后直接 `core.parseId`、`ORDER BY created_at DESC, id DESC LIMIT 100`、无 `requireWrite`、无限流 `limit(`。

### 6 变异表（`/tmp/r2mut` 的 `cp -R` 副本，单跑、每次 restore）

| 变异 | 退出码 | 命中 label | 是否行为断言 |
|---|---|---|---|
| M1 删 `#timeline-sect` 整块 | 1 | 位置断言 + `dtimeline`/`dtimeline-status` 节点断言（2 条） | 结构断言（前端静态，下同） |
| M2 删 `timeline_type_note:` 行 | 1 | 9 个时间线 key 非空三语（1 条） | 结构断言 |
| M3 删 savebtn/tokenbtn 两处 `loadTimeline(openId);` | 1 | 调用点 ≥4 + 两个 1200 字符窗口（3 条） | 结构断言 |
| M4 `/events` → `/evntz` | 1 | `"/events"` 精确匹配 + `encodeURIComponent`（1 条） | 结构断言 |
| M5 删 `LIMIT 100` | 1 | 120 条只回 100（got 120/want 100）+ 截断首尾（got [1120,1001]/want [1120,1021]）+ SQL 文本（3 条） | **是**（前 2 条行为断言红） |
| M6 删 `, id DESC` | 1 | 同秒排序（got [12,13,14,11]/want [13,12,14,11]）+ SQL 文本（2 条） | **是**（第 1 条行为断言红） |

M5/M6 均为「行为断言先红、SQL 文本断言同时红」，不再是 round 1 的仅文本假绿。

### D-01 / D-02 / D-03 逐条

- **D-01：CLOSED**。4 个前端变异全部 FAIL（M1 2 条、M2 1 条、M3 3 条、M4 1 条）。
- **D-02：CLOSED**。删 `LIMIT 100` → 行为断言 `got:120 want:100`、`got:[1120,1001] want:[1120,1021]` 红。
- **D-03：CLOSED**。删 `, id DESC` → 行为断言 `got:[12,13,14,11] want:[13,12,14,11]` 红。

### 新增断言质量

- `timelineUiChecks()` 已在 `main()`（L730）调用，非死代码；正常实现下新增断言全绿（`✓ 后台时间线 UI` = 8），不是靠报错红。
- a/b/c/d/e/f 复核：位置断言（M1 红）、逐 key 断言（M2 红）、1200 字符窗口确实覆盖 savebtn/tokenbtn 两处（M3 三红）、`"/events"` 精确匹配（M4 红）、`f` 的 `iAuth>=0` 与 `iErr>iAuth` 同时要求存在性与次序（把函数体内 `code === "auth"` 改成 `authX`、或把 `timelineError(` 改名，均 FAIL 1）。
- **R2-01（minor，测试覆盖残留，非产品缺陷）**：`calls >= 4` 把 `function loadTimeline(` 定义也计入（实际 5 处 = 1 定义 + 4 调用），故单独删掉语言切换处 `loadTimeline(current.id);`（L408）或打开详情处 `loadTimeline(r.id);`（L598）后仍 `PASS 162`（两处均已实测）。该检查注释声称覆盖「打开详情」，但窗口只钉住 savebtn/tokenbtn。不影响 D-01 的 4 项关闭结论，属残余假绿。
- 未发现新增断言依赖过脆文本导致「真缺陷仍绿」；`f` 的函数体截取正确（bodyLen 680）。

### 新发现缺陷

| 编号 | 严重度 | owner | 说明 |
|---|---|---|---|
| R2-01 | minor | 返工 owner（仅 `work/test-orders.js`） | 删单个导航性 `loadTimeline`（L408 或 L598）仍绿；建议 `calls >= 5` 或为 L598 加窗口/位置断言。产品代码无缺陷。 |

### 声明

本轮未修改任何制作文件；仅向本报告追加本节。`ls -l` 佐证：

```
-rw-------@ 1 huangminming  staff  35534 Nov 17 16:32 web/admin/orders/index.html
-rw-------@ 1 huangminming  staff  12790 Nov 17 16:25 work/order-api.js
-rw-------@ 1 huangminming  staff   7686 Nov 17 15:56 work/order-core.js
-rw-------@ 1 huangminming  staff  39037 Nov 17 16:46 work/test-orders.js
```

*复验结束。*
