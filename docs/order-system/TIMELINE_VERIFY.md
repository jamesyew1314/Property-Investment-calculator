# TIMELINE_VERIFY — 验收脚本与判定口径

Owner: Chief of Staff。Verifier 按此执行；**只读，不修任何制作文件**。
基线快照（改动前原件）：`.baseline/order-api.js`、`.baseline/test-orders.js`、`.baseline/index.html`。
基线结论：改动前 `node work/test-orders.js` → `ORDERS PASS / 138 checks`。

---

## V0 环境与回归（必跑，先跑）

```bash
cd /Users/huangminming/Downloads/日常/order-system-mvp
node work/test-orders.js 2>&1 | tail -6
```

判定：
- 末行必须是 `ORDERS PASS / N checks`，`N >= 138`。
- 不能出现 `✗`。
- 记录 N。若 `N == 138` → 说明没加测试，**判定 AC-R1 失败**。

对照基线，确认原有断言没被删/弱化：

```bash
diff <(grep -c "ok(\|eq(" .baseline/test-orders.js) <(grep -c "ok(\|eq(" work/test-orders.js)
```

新增只应使计数上升。抽查：`grep -n "138\|SKIP" work/test-orders.js`。

## V1 diff 审查（逐文件）

```bash
diff -u .baseline/order-api.js work/order-api.js
diff -u .baseline/test-orders.js work/test-orders.js
diff -u .baseline/index.html web/admin/orders/index.html
```

越界检查（必须为空输出）：

```bash
diff -q .baseline/order-api.js work/order-core.js 2>&1 || true   # core 不应被改
ls work/migrations/                                              # 只应有 036_site_orders.sql
md5 -q work/order-core.js                                        # 与改动前一致即可（无 baseline 时用 mtime）
```

> 注：`work/order-core.js` 未做 baseline 快照；用 `ls -l` 的 mtime 早于本次运行时间来判断未被改。

## V2 API 行为（独立复现，不依赖 owner 的测试）

Verifier 必须**自己写一次性脚本**（放 `/tmp`，不要落进仓库）或在 node REPL 里跑，覆盖：

| 编号 | 请求 | 期望 |
|---|---|---|
| A1 | `GET /api/admin/orders/1/events` 无 cookie | 401，`ok:false` |
| A2 | `.../orders/0/events`、`.../-3/...`、`.../abc/...`、`.../1.5/...` | 400 或 404，`ok:false` |
| A3 | `.../orders/999999/events`（不存在） | 404 `not_found` |
| A4 | 存在的订单 | 200，`Array.isArray(rows)`，每行键集合 **恰好** `["actor","created_at","id","note","type"]` |
| A5 | 造 3 条：同 `created_at` 不同 id；不同 `created_at` | 顺序 = `created_at DESC, id DESC` |
| A6 | 无事件订单 | 200，`rows.length === 0` |
| A7 | 造 120 条 | `rows.length === 100`，且首条是最新 |
| A8 | 读两次，比对事件总数 | 不变（GET 只读） |

提示：可复用 `work/test-orders.js` 里 `makeFakePool()` 的构造方式，但**不要修改仓库文件**。
若 owner 的假库新增了 events SELECT 分支，直接用 `require("./order-api")` + 自建 mini express 即可。

## V3 前端静态检查

```bash
# F1 容器
grep -n 'id="dtimeline"' web/admin/orders/index.html
grep -n 'id="timeline-sect"' web/admin/orders/index.html
# F2 API 路径
grep -n '/events' web/admin/orders/index.html
# F3 三语 key 长度：抽出 I18N 块，node 解析后断言每个新 key 长度为 3
# F4 401 未被吞
grep -n 'code === "auth"' web/admin/orders/index.html
# F5 两处刷新
grep -n 'loadTimeline\|renderTimeline\|timeline' web/admin/orders/index.html
```

F3 推荐用 `node -e` 提取 `<script>` 内的 `I18N = {...}` 文本做 `eval`（文件是本地可信的），断言：
`["timeline_section","timeline_loading","timeline_empty","timeline_err","timeline_err_not_found","timeline_actor","timeline_type_created","timeline_type_status","timeline_type_note"].every(k => Array.isArray(I18N[k]) && I18N[k].length === 3)`。

F5 判定：`#savebtn` 的 `.then` 链里必须有一次时间线刷新；`#tokenbtn` 的 `.then` 链同理。

## V4 390px / 三语（有浏览器则实测，无则静态论证）

- 有 Chrome：`--headless --window-size=390,844 --screenshot`，或人工看截图。
- 无浏览器：必须给出**代码级论证**（flex-wrap / min-width:0 / word-break / 无固定宽度），
  并明确写「未实机验证」，不得写成已通过。

## V5 判定输出格式

Verifier 必须产出 `docs/order-system/TIMELINE_VERIFICATION.md`，包含：

1. 表格：AC 编号 → PASS / FAIL / UNVERIFIED → 证据（命令 + 关键输出行）
2. `node work/test-orders.js` 的真实尾部输出（原样贴，至少 5 行）
3. 发现的缺陷清单：编号、严重度（blocker/major/minor）、归属 owner、复现命令
4. 明确声明：**本文件作者没有修改任何制作文件**（可用 `ls -l` mtime 佐证）

FAIL 不等于流程失败：verifier 如实报 FAIL → CoS 退回 owner 修 → verifier 复验，这是**有效产出**。
隐藏问题比漏报更糟。

## V6 独立性要求

Verifier 不得：
- 读 owner 的 SPEC 就当真（SPEC 是意图，代码是事实）
- 复制 owner 测试的断言来当自己的证据
- 修改 `work/*` 或 `web/*`

Verifier 应当：
- 独立跑、独立读 diff、独立构造请求
- 主动尝试 owner 测试没覆盖的边界（超大 id、`note` 为 null、`actor` 为 null、重复 `created_at`、100 条截断）
