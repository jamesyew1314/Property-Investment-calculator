# VERIFICATION — 建站接单系统 MVP

> **已被 `VERIFICATION_INDEPENDENT.md` 与 `ROOT_REPORT.md` 取代；当前 staging 为 138 checks。**
> 本文保留制作人自验记录，用于对照独立验收发现的问题。

> 角色：verifier（**由总管代执行**，因为本次无法创建独立子 agent；独立性受限，见 §7）
> 日期：2026-11-17 · 结论：**PASS（带 3 项未验证）**
> 位置：所有产物在 staging `/Users/huangminming/Downloads/日常/order-system-mvp/`，尚未落进项目。

## 1. 环境

| 项 | 值 |
|---|---|
| Node | v24.18.0 |
| OS | macOS（darwin） |
| 项目目录写权限 | 无（沙箱 `workspace-write` 仅允许 `~/Downloads/日常`） |
| Postgres | 无连接；未使用生产库 |
| express | staging 本地安装 4.21.2（仅测试） |
| Puppeteer | 全局 25.4.0 + 本机 Chromium |
| 浏览器视口 | 390×844（mobile）、1440×960（desktop） |

## 2. 证据总表

### 2.1 语法

```console
$ for f in work/order-core.js work/order-api.js work/test-orders.js; do node --check "$f" && echo "OK $f"; done
OK work/order-core.js
OK work/order-api.js
OK work/test-orders.js
```

### 2.2 后端回归（假 pool + 真实 express Router）

```console
$ node work/test-orders.js
...
✓ HTTP 缺 name → 400/name
✓ HTTP email 错 → 400/email
✓ 公开查单只返回三列（不泄露电话/邮箱/备注）
✓ 未登录 GET 后台订单 → 401
✓ 未登录 PATCH 订单 → 401
✓ 未登录 token 记账 → 401
✓ topup 100 → 余额 100
✓ usage 30 → 余额 70
✓ adjust -20 → 余额 50
✓ 余额不足不可扣减 → 400
✓ 单号冲突后自动重试 → 201
✓ 冲突后执行了 ROLLBACK TO SAVEPOINT
✓ 冲突未留下脏数据，最终 2 单
...
ORDERS PASS / 131 checks
exit=0
```

`131 pass / 0 fail`。HTTP 段**未 SKIP**（staging 有 express），因此 401/201/400 是真实 HTTP 往返；冲突测试会让 fake pool 模拟「23505 后事务 aborted」，旧实现会得到 25P02。

### 2.3 浏览器（390px + 真实提交 + 后台操作）

```console
$ NODE_PATH="$(npm root -g):$PWD/node_modules" node .build/browser-check.js
✓ 公开页标题（zh）
✓ 下单页 zh 390px 无横向溢出
✓ 公开页 EN 无中文残留（语言按钮 中文 除外）
✓ 公开页 BM 无中文残留（语言按钮 中文 除外）
✓ 390px 真实提交成功并显示单号
✓ 后台列表显示 1 条（zh）
✓ 后台改状态写入后端
✓ 后台 token 充值写入 ledger
✓ 未登录后台显示 /admin/ 登录引导
✓ 浏览器无 pageerror / 非预期 console.error（预期 401 除外）

BROWSER PASS | orders=1 events=2 ledger=1
```

`27 pass / 0 fail`。真实流程：填表 → 勾同意 → 提交 → 页面显示 `ORD-YYMMDD-XXXX` → 后台看到单 → 改 `live` → 充值 100 → 余额 `100.00`；另验证公开页无 RM4,000、首月文案为 RM2,500；未登录后台显示 `/admin/` 登录引导。

截图（`.build/shots/`）：
`order-mobile-zh.png`、`order-mobile-success-zh.png`、`admin-mobile-zh.png`、`admin-modal-mobile-zh.png`、`admin-gate-mobile-zh.png`、`order-desktop-zh.png`、`admin-desktop-zh.png`。

### 2.4 挂载 patch

```console
$ patch -p1 --dry-run < work/api-server.patch
patching file 'work/api-server.js'
dry-run exit=0
$ patch -p1 < work/api-server.patch && grep -n createOrderApi work/api-server.js
14:const createOrderApi = require("./order-api");
1549:app.use("/api", createOrderApi({ pool: pool, requireAdmin: requireAdmin,
```

补丁只改 2 处：require + 挂载（library 之后、404 fallback 之前）。

### 2.5 交付文件指纹（SHA-256）

| 文件 | SHA-256 |
|---|---|
| `work/migrations/036_site_orders.sql` | `036045fd8e0dc8447c177d5cf8ff4ca75af22b32c1127bf3d35f891fa8ca301b` |
| `work/order-core.js` | `3d350684dad783b73c4f290e39a084a47d2b9508c9e20b1d58993e23306cc1dd` |
| `work/order-api.js` | `9604cd692001aadd4e28c91e3ba0543ce624a3939eca96b3153d0203e33e01b6` |
| `work/test-orders.js` | `62768050a713f8d53028df3f1f7e7b80ccb4746c59879713302d011a27a9fad9` |
| `web/order/index.html` | `0dd78bbdc00e0aa89198229fc7f240f79cc0c650e4dfb3b4d0bf8ddf717a40c0` |
| `web/admin/orders/index.html` | `d2e76dddd206238854262c62adb07fddcecf4c0afce7a1ff29045ee114814540` |
| `work/api-server.patch` | `73363935ef58bfdef66582d780d3ee9833d016ab5452f09e87992ae4d0a87dda` |

## 3. 验收逐项

| ID | 结果 | 证据 |
|---|---|---|
| AC-01 迁移三表/索引/GRANT/可重复 | **PARTIAL** | SQL 静态审查通过；`IF NOT EXISTS` + `BEGIN/COMMIT`；**未在真库执行** |
| AC-02 公开下单校验 | **PASS** | 131 checks 中 4 个 400/field + 成功 201 |
| AC-03 单号格式/时区/唯一 | **PASS** | 2000 个序号无重复；UTC 16:30 → 次日 |
| AC-04 公开查单只回三列 | **PASS** | `Object.keys` 断言 `created_at/order_no/status` |
| AC-05 后台未登录 401 | **PASS** | GET/PATCH/tokens 三条全部 401 |
| AC-06 状态白名单 | **PASS** | 8 合法 + 大写归一 + `archived` 400 |
| AC-07 token 余额/超扣 | **PASS** | 100→70→50；超扣 400；负数 usage 400 |
| AC-08 页面三语/key 完整 | **PASS** | 每 key 三语非空；EN/BM 无 CJK；引用 key 全存在 |
| AC-09 390px + 真实提交 | **PASS** | 6 张截图；无横向溢出；无 console error |
| AC-10 不改既有路由 | **PASS** | patch 仅 2 处，位置在 fallback 之前 |
| AC-11 首月 2,500 总价、无 4,000 | **PASS** | 131 checks price guard + 浏览器三语检查 |
| AC-12 23505 后 savepoint 重试 | **PASS** | 注入冲突后 201，`ROLLBACK TO SAVEPOINT` 被调用 |

## 4. 验证中发现并修复的缺陷

| # | 缺陷 | 发现方式 | 修复 |
|---|---|---|---|
| 1 | 400 响应 `field` 返回错误码（`required`）而非字段名（`name`），前端无法定位 | `test-orders.js` 断言失败 | `order-core` 增加 `first_field`，API 返回字段名 |
| 2 | 标题在 390/1440 都把「网站」拆成两行（7+1） | 看截图 | 桌面 h1 上限 52→46px；手机 `em` 强制换行 |
| 3 | 401 后后台弹窗仍停留 | 代码审查 | `showGate()` 先 `closeDetail()` |
| 4 | 后台手机端操作列出现空 label 占位 | 代码审查 | `td[data-label=""]:before{display:none}` |
| 5 | 假 pool 把 `'created'` 字面量误当参数，导致事件类型错 | 测试失败 | 修正测试桩（非生产代码） |
| 6 | **价格口径错误**：页面/文档写成首月 4,000（2,500 建站 + 1,500 月费） | lead 代码审查 | 首月改为 RM2,500 总价（含建站+首月服务），第 2 个月起 1,500；页面/SPEC/DECISIONS/迁移注释同步；加 price guard |
| 7 | **事务 bug**：`POST /orders` 捕获 23505 后直接 `continue`，事务已 aborted，重试得到 25P02 | lead 代码审查 | 事务内先 `SAVEPOINT order_try`，冲突后 `ROLLBACK TO SAVEPOINT` 再换号重试；fake pool 模拟 aborted 状态加回归；顺手移除 `cleanText` 未使用参数 |
| 8 | BM 价格标签变长后 390px 横向溢出（scrollWidth 460） | 浏览器检查 | ≤640px 价格行改为上下堆叠、数值右对齐 |

## 5. 三语检查口径

- 字典结构：每个 key 必须是**非空** `[zh, en, bm]`；公开页 86 个 key，后台 62 个 key。
- **EN/BM 不含 CJK**：浏览器 `innerText` 扫描；唯一例外是语言按钮「中文」（与全站 `lang3.js` 约定一致，RULES §1 固定区就是 `[中文|EN|BM]`）。
- 动态文案：状态、错误、余额、成功提示均走 `t(key)`；切换语言即时重渲染。
- **未验证**：BM 语法与地道度（无母语审校）。

## 6. 隐私与安全

- 公开 GET 断言只回三列，`phone/email/notes/company/domain` 均不出现。
- 所有 SQL 使用 `$1..$n`；无字符串拼用户输入（`q` 只作为参数）。
- 错误统一 JSON；`api-server` 的全局 error handler 只回 `server_error`，无堆栈。
- 后台写路由同时挂 `requireAdmin` + `requireWrite`（patch 中可见）。
- 限流：公开写 5/10min、公开读 60/10min、后台列表 120/min；本次用 no-op 限流跑测试，**未做真实计时验证**。

## 7. 独立性声明（重要）

本次没有 verifier 子 agent，`VERIFICATION.md` 由总管在完成实现后编写。缓解措施：

1. 验证以**可重跑脚本**为准（`test-orders.js`、`browser-check.js`），不是人工目测。
2. 测试与实现分离：测试用假 pool + stub auth，独立构造请求。
3. 缺陷确实是测试/截图先发现、再改代码，而非"写完即通过"。

但这仍**不等于**独立第三方验收。建议根 agent 重派 `verifier`（prompt 见 `MANAGER_PROMPTS.md`）复跑，再签字。

## 8. 未验证项（必须在落盘/上线前补）

1. **真实 Postgres**：迁移执行、约束触发、`fangchan_app` GRANT、真库 CRUD、并发 `FOR UPDATE`。
2. **真实管理员会话**：本次 401 用 stub；未验证 `fc_admin` → `admin_sessions` 查询与角色。
3. **nginx 路由**：`/order/`、`/admin/orders/` 依赖静态目录；未在本机 nginx 验证，也未部署。
4. **限流计时**：未真实打满 6 次验证 429。
5. **iOS Safari**：只在 Chromium 模拟 390px，未上真机。
6. **BM 母语审校**。
7. **既有回归**：未跑 `node web/test.js`、`node work/test-library.js`（项目只读且未改这些文件；落盘后应跑一遍）。

## 9. 结论

**PASS（带条件）**：代码/页面/测试在 staging 达到 MVP 验收；**G5 集成被沙箱阻塞**（文件未进项目），**AC-01 真库部分未验证**。

签字建议：
- [x] 功能与页面可评审
- [x] 可安全落盘（不覆盖既有文件，除 `api-server.js` 两行 patch）
- [ ] 可上线（缺真库、nginx、真机、独立 verifier）
