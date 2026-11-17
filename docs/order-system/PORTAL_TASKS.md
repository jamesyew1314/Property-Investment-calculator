# 客户建站门户 Phase 1 — 任务与组织记录（T-005）

- 任务：在 staging `/Users/huangminming/Downloads/日常/order-system-mvp` 开发客户建站门户 Phase 1
- 付款方式：B — 银行转账 / 人工确认（不接 Billplz）
- 登录方式：邮箱 magic link
- 总管：`portal-chief`（本会话，不写业务代码）
- 开始墙钟：2026-11-17 20:09:25 +08:00
- 基线：`node work/test-orders.js` = **164 PASS**（2026-11-17 20:10 复跑确认）

## 1. 硬边界（全队遵守）

1. 只改 staging；不碰 `/Users/huangminming/Pik kwong Lau`。
2. 不 commit、不部署、不连生产 DB、不接 Billplz。
3. 一次最多 4 个 agent；总管不写业务代码。
4. `test-orders.js` 原有 164 条断言不删、不弱化；最终必须全绿并新增测试。
5. 所有新 UI 必须 zh / EN / BM 三语，390px 可用。
6. 不做文件直传 OSS；客户资料用结构化字段 + 素材链接（Drive/Dropbox）。
7. 不做 WebSocket；客户 dashboard 用 30 秒轮询。
8. 不做自动 token 计量；管理员在后台记 token，客户只看余额/流水。

## 2. 组织树（计划 = 实际执行记录）

```
lead
└── portal-chief（总管，depth 1）
    ├── portal-product-manager（depth 2，PM）
    │   └── portal-spec-worker（depth 3，独立 SPEC 审稿）
    ├── portal-backend-engineer（depth 2，后端）
    │   └── portal-backend-worker（depth 3，测试/审查）
    ├── portal-frontend-engineer（depth 2，前端）
    │   └── portal-frontend-worker（depth 3，390px/三语检查）
    └── portal-verifier（depth 2，独立验收，只读，只写 PORTAL_VERIFICATION.md）
```

并发上限 4：PM 阶段 1 个 root agent + spec-worker（同时 ≤2）；实施阶段 backend + frontend 并行（各带 1 worker，同时 ≤4）；验收阶段 1 个 verifier。

## 3. 阶段、门禁与并行区间

| 阶段 | 内容 | 门禁 | 并行 |
|---|---|---|---|
| P0 侦察 | 读 036/order-core/order-api/api-server/test-orders/页面；复跑基线 | 164 PASS | 总管 |
| P1 SPEC | `PORTAL_SPEC.md`；spec-worker 独立审稿；P1/P2 全修 | 契约覆盖全部路由/字段/页面/测试；无阻塞 TBD | PM ∥ spec-worker |
| P2 实施 | backend（迁移/API/测试）+ frontend（三页）并行 | 各自自测；不交叉改文件 | backend ∥ frontend（各带 worker） |
| P3 集成 | 总管跑 `test-orders` + `test-client`，静态检查，diff 审阅 | 双测试全绿、原有 164 不弱化 | 总管 |
| P4 验收 | verifier 只读复核、攻击性检查；缺陷原路退回；复验 | `PORTAL_VERIFICATION.md` 结论；无 P1/P2 未闭环 | verifier → 修复 → 复验 |

失败原路退回：后端缺陷回 `portal-backend-engineer`，前端缺陷回 `portal-frontend-engineer`，SPEC 缺陷回 `portal-product-manager`；verifier 不修代码。

## 4. 文件所有权（避免并发写冲突）

| 角色 | 写权限 |
|---|---|
| PM | `docs/order-system/PORTAL_SPEC.md` |
| backend | `work/migrations/037_client_portal.sql`、`work/client-api.js`、`work/order-api.js`、`work/order-core.js`、`work/api-server.js`、`work/test-client.js`、`work/test-orders.js` |
| frontend | `web/client/index.html`、`web/order/index.html`、`web/admin/orders/index.html` |
| verifier | `docs/order-system/PORTAL_VERIFICATION.md`（只读代码） |
| 总管 | `docs/order-system/PORTAL_TASKS.md`、`PORTAL_REPORT.md`；不做业务实现 |

## 5. 契约冻结点（P1 产出，实施必须逐字遵守）

- 客户 API 前缀 `/api/client`；cookie `fc_client`（HttpOnly + Secure + SameSite=Lax + 30 天）。
- magic link 20 分钟、一次性、只存 sha256；verify 成功建 30 天 session。
- 客户只能看自己的订单；他人订单一律 404（不泄露存在性）。
- `site_orders.phase` ∈ brief/design/build/review/launch/live；`progress` 0–100；`payment_status` ∈ unpaid/paid/refunded。
- 后台 payment：`paid` 写 `paid_at` 且 `status='paid'`；progress：写 `order_updates` + `site_order_events`。
- 客户可见进度只来自 `order_updates.visible=true`；不在客户响应中暴露 admin actor。
- brief 11 个白名单字段，长度/数量/JSON 总长受限；未知字段丢弃。
- 页面三语字典 `var I18N = { key: [zh,en,bm] }`；客户页 30 秒轮询；430px 断点覆盖 390px。

### 5.1 总管对 SPEC v1.0 的冻结修订（优先级高于 SPEC 原文）

- **A1 brief 11 字段**：order 页提交时，除 9 个新控件外，用既有顶层 `domain` / `notes` 输入值填充 `brief.domain` / `brief.notes`；空值省略，不新增重复控件。这样 11 个 brief 字段全部可达。
- **A2 冲突目标**：`ON CONFLICT (lower(email)) DO NOTHING`（单一表达式括号）；迁移/实现按此写，fake pool 也按此 SQL 形状。
- **A3 既有 fake pool**：`test-orders.js` 的 `makeFakePool()` 必须新增 `POST /orders` 事务内按 email 绑定 `client_user_id` 的 UPDATE 分支；只新增，不改既有分支语义，否则原 164 会因 unhandled SQL 变红。
- **A4 payment 副作用风险**：`paid` 会把 `site_orders.status` 置为 `paid`，已 `live` 订单会回退；本期按合同字面执行，必须在报告/风险中记录。
- **A5 test-client**：该文件内挂 `createOrderApi` 做 admin 测试时，其 fake pool 必须实现 `ADMIN_SELECT`、payment、progress、detail、changes 的 SQL 形状，保证可独立跑绿。
- **A6 Review log**：必须逐条记录 spec-worker 的 P1/P2 与处置，不得只写“已审”。

## 6. 测试与证据要求

- 基线：`node work/test-orders.js` 164 PASS（不删不弱化）。
- 新增：`node work/test-client.js`（fake pool + 真 express）。
- 最终两条命令真实输出写入 `PORTAL_REPORT.md`。
- 无法验证项必须显式列出（如未在真实 Postgres 上跑迁移、无真实邮件投递、无真实浏览器 E2E）。

## 7. 墙钟与进度日志

| 时间 (+08:00) | 事件 |
|---|---|
| 20:09:25 | 任务开始；接管 staging |
| 20:10:42 | 复跑基线 164 PASS；完成代码侦察 |
| 20:12 | P1 启动：portal-product-manager + portal-spec-worker |
| 20:16 | `PORTAL_SPEC.md` v1.0 落盘（548 行）；spec-worker 开始独立审稿 |
| 20:23–20:27 | SPEC 按总管 A1/A2 与审稿 P1/P2 修订；AC 最终为 P01–P11（以 SPEC §8 为准）；审稿记录回填 |
| 20:28 | P2 启动：portal-backend-engineer ∥ portal-frontend-engineer（读冻结 SPEC） |
| 20:28:39 | backend / frontend 实施并行开始（2 个 root agent） |
| 20:31 | SPEC v1.1 定稿（review log：7 P1 / 21 P2 全闭环） |
| 20:38–20:39 | frontend 用真实 Chrome CDP 在 390×844 截图；后续 worker 复核 |
| 20:42 | backend + frontend 各 1 个 worker 启动（并发 4，恰好达上限） |
| 20:52:16 | frontend 完成：三页 1074/658/1290 行，426 静态 + 162 浏览器检查，390px scrollWidth=390 |
| 20:54 | backend worker 审查后修复（连接释放、cookie 解析、fake pool 保真等） |
| 20:55 | backend 完成：迁移 127 行、client-api 406 行、order-api 524 行、test-client 1155 行、test-orders 1456 行 |
| 20:55:38 | 总管集成复跑：`test-orders` 304 PASS；`test-client` 218 PASS；均 exit 0 |
| 20:56 | P3 启动：portal-verifier（只读，只写 PORTAL_VERIFICATION.md） |
| 21:08 | verifier 结论 **CONDITIONAL PASS**：无 P1，1 个 P2（后台进度表单未采用 /detail 最新 phase/progress，可回退客户进度）；文档 312 行 |
| 21:09 | P2-1 原路退回 frontend（原 agent 不可续，改由 `portal-frontend-repair` 做最小修复） |
| 21:11 | P2-1 修复：`renderExtras` 同步 `/detail` 最新 phase/progress；双数据场景 22/22 PASS |
| 21:13 | P3 复验：`portal-verifier-2` 独立新写 CDP harness，复核 P2-1 + 全量回归 |
| 21:20 | **最终 PASS**：P2-1 闭环，18/18 复验检查通过；双测试 304/218；仅 admin 页新增 6 行（哈希 `d26d52b5…`） |
| 21:20 | 报告落盘：`PORTAL_REPORT.md`；总墙钟约 71 分钟 |
|  |  |

## 8. 已知风险（初始）

1. 测试全部基于手写 fake pool，SQL 形状若与真实 Postgres 有偏差，测试会假绿 → verifier 必须做 SQL/迁移静态审查，报告须声明“未在真库执行”。
2. 页面只做静态/截图级检查，非真实端到端浏览器 + HTTPS cookie → 390px 与 cookie Secure 只能部分验证。
3. 并行实施期间 backend/frontend 依赖 SPEC 契约；SPEC 歧义会导致接口错配 → P1 门禁必须先冻结。
4. 客户页三语 + 轮询 + 多状态容易“表面完成”（有 HTML 无逻辑）→ 测试需断言行为/字符串，而非只看文件存在。
