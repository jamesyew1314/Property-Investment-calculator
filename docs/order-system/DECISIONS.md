# DECISIONS — 建站接单系统 MVP

> 只记录会影响后续维护/复盘的决策。格式：背景 → 决定 → 代价/替代方案。

## ADR-001 独立模块，零改动既有业务

**背景**：仓库已有 AgentSite、agent 工作台、资料库；本次只加建站接单。
**决定**：新表 `site_orders*` / `token_ledger`，新文件 `order-core.js` / `order-api.js`，`api-server.js` 只加 2 行挂载。
**代价**：不能复用 agent 的租户/套餐表；后续若要打通，需要一次显式迁移。
**拒绝**：改 `lib_agents` 加建站字段（会污染资料库模型与权限）。

## ADR-002 拆出 `order-core.js`

**背景**：任务原始文件清单只允许 `order-api.js` + `test-orders.js`。
**决定**：把校验/单号/状态/token 数学抽到 `work/order-core.js`（纯函数，无 express/DB）。这与仓库既有 `library-core.js` + `library-api.js` + `test-library.js` 的模式一致，并让 `test-orders.js` 在无 express 的机器上也能跑纯逻辑部分。
**代价**：多一个文件；挂载时多一个 require。
**替代**：全部塞进 `order-api.js`，测试要么依赖 express，要么用 `Module._load` 打桩——更脆。

## ADR-003 单号 `ORD-YYMMDD-XXXX`

**背景**：需要人可读、电话可报、不暴露自增 ID、冲突可重试。
**决定**：字母表 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（32 字符，去掉 I/O/0/1）；4 位 = 1,048,576 组合；日期按 **UTC+8** 生成，避免服务器 UTC 跨日；DB 唯一约束 + 最多 6 次重试。
**代价**：单日理论上限 100 万单（远超 MVP）；单号可被枚举，靠公开查单限流缓解。
**拒绝**：UUID（不可口述）、纯自增（泄露单量）。

## ADR-004 价格口径：首月 RM2,500 总价，第 2 个月起 RM1,500/月

**背景**：任务初稿写「RM1,500/月、首月 RM2,500」，容易被理解成首月 2,500 建站费 + 1,500 月费 = 4,000。2026-11-17 lead 转述用户原话：「第一个月 RM2,500，接下来每个月 RM1,500」。
**决定**：
- **首月总价 RM2,500**，包含建站 + 第一个月服务；
- **第 2 个月起 RM1,500/月**；
- 全站不得出现「首月合计 RM4,000」或任何 2,500+1,500 叠加口径；
- 数据库 `setup_price=2500` 保留（避免改列名），但语义固定为「首月总价」，迁移与代码注释写清。
**代价**：`setup_price` 列名有歧义，后续做发票/对账时可能想拆「建站费/首月服务费」两行；届时需加拆分明细，而不是改这个字段的含义。
**拒绝**：新增 `first_month_price` 列（同一数据两列，易漂移）；把月费改成首月免收（与用户原话不符）。

## ADR-005 Token 台账符号与不可透支

**背景**：topup/usage/adjust 三种流水，必须能审计。
**决定**：topup/usage 存正数，adjust 存带符号；余额 `topup + adjust − usage`；`usage` 超过余额返回 `400 insufficient_tokens` 且不写流水；`adjust` 允许负值（人工冲正）。事务内 `SELECT … FOR UPDATE` 防并发超扣。
**代价**：不允许「先透支后补」；如业务需要，改成允许负余额并加告警即可（只改一处判断）。

## ADR-006 复用 `requireAdmin` / `requireWrite`

**背景**：已有 `fc_admin` cookie 与管理员会话；任务要求复用。
**决定**：`createOrderApi({pool, requireAdmin, requireWrite, rateLimit})` 由 `api-server.js` 注入；后台路由同时挂两个中间件；不实现登录页。
**代价**：`order-api.js` 不能独立启动（测试需 stub）。
**拒绝**：新写一套 token 鉴权（会分裂会话体系）。

## ADR-007 后台也做 BM 三语

**背景**：任务说后台「至少中文/EN，BM 可不做」；`RULES.md` 要求所有页面三语。
**决定**：后台同样 zh/en/BM 完整；宁可多花翻译时间，不违反硬规则。
**代价**：BM 文案需母语润色（已在 `VERIFICATION.md` 标为未验证项）。

## ADR-008 不引 `lang3.js`，页面内置等价切换

**背景**：`lang3.js` 会注入固定语言条并在点击时整页跳转，与单页表单状态冲突；RULES 允许「等价的三语控件」。
**决定**：两个页面各自实现 `data-i18n` + `[zh,en,bm]` 字典、`kt_lang`/`kwongthye_lang` 兼容、`?lang=` 同步；点击即时切换不刷新，保住已填表单。
**代价**：两份字典（公开页/后台），但字段集合不同、复用价值低；未加第二个全局脚本。
**替代**：改 `lang3.js` 支持 `__pnSetLang`（会动全站公共文件，风险更高）。

## ADR-009 页面单文件、内联 CSS/JS

**背景**：RULES 要求静态资源带版本号，避免缓存导致语言不更新。
**决定**：CSS/JS 内联在 HTML 内（无独立资源可缓存），仅 favicon 引用 `/icon-256.png?v=ord1`；改版时整页 HTML 自然更新。
**代价**：HTML 较大（公开页 ~50KB），首屏仍可接受；不利于多页复用样式。
**替代**：拆 `order.css`/`order.js` 并 bump `?v=`，但增加漏 bump 的风险。

## ADR-010 Staging 交付 + patch，不直接改项目

**背景**：本会话沙箱仅允许写 `~/Downloads/日常`，项目目录 `mkdir` 被拒；审批已禁用，无法提权。
**决定**：在 `~/Downloads/日常/order-system-mvp/` 按项目相对路径产出；`api-server.js` 用 unified diff（`work/api-server.patch`）+ 干跑验证；由 `lead`/有写权限者落盘。
**代价**：多一步 `cp`；无法在项目内跑真实 `api-server`。
**拒绝**：绕过沙箱（符号链接/提权）——违反边界。

## ADR-011 公开查单只回三列 + 双限流

**背景**：单号可被枚举，公开接口不能泄露联系方式。
**决定**：`GET /api/orders/:orderNo` 只返回 `order_no/status/created_at`；格式非法与不存在都 404；公开写 5 次/10 分钟、公开读 60 次/10 分钟。
**代价**：客户看不到自己填的资料（如需修改要联系运营）。
**后续**：可加「单号 + 手机后四位」二次校验再放开更多字段。

## ADR-012 状态只做白名单，不强约束转移

**背景**：MVP 运营可能录错状态，强状态机反而卡流程。
**决定**：8 状态白名单 + 每次变更写事件；转移顺序写在 SPEC 作为推荐流程，不在 API 层强制。
**代价**：可能出现 `new → live` 的跳跃；事件流可追溯。
**后续**：如要强约束，加 `ALLOWED_TRANSITIONS` 表并返回 `invalid_transition`。

## ADR-013 测试用假 pool，不连真库

**背景**：无 `DATABASE_URL`，且明令禁止碰生产 DB。
**决定**：`test-orders.js` 用内存 fake pool 实现 API 依赖的 SQL 形状；HTTP 段用真实 express + stub auth；迁移只做静态检查。
**代价**：SQL 拼写/类型/约束不能在本地被真库验证（已在报告标注）。
**后续**：CI 加 `TEST_DATABASE_URL` 跑真迁移 + 真库 CRUD。

## ADR-014 后台列表上限 200、无分页

**背景**：MVP 订单量小，先要可用。
**决定**：`ORDER BY created_at DESC LIMIT 200`；`q` + `status` 过滤。
**代价**：超过 200 条需缩小过滤范围；后续加分页/游标。

## ADR-015 单号冲突用 SAVEPOINT 重试

**背景**：`POST /orders` 在 `BEGIN` 内插入；`order_no` 有唯一约束。最初捕获 `23505` 后直接 `continue`，但 PostgreSQL 事务此时已 aborted，下一次 INSERT 只会得到 `25P02`（lead 代码审查发现）。
**决定**：事务开始后 `SAVEPOINT order_try`；每次冲突 `ROLLBACK TO SAVEPOINT order_try` 再换号重试；成功后 `RELEASE SAVEPOINT`；最多 6 次。测试用 fake pool 模拟「23505 后 aborted」，旧实现会失败。
**代价**：多两条 SQL；`SAVEPOINT` 名称固定（单请求内无并发冲突）。
**替代**：把单号生成移到独立连接/独立事务（更重，且仍要处理唯一约束）；先查后插（有竞态，不可靠）。

## ADR-016 价格口径修正记录（2026-11-17）

**背景**：初版按「2,500 建站费 + 1,500 月费 = 首月 4,000」实现，lead 转述用户原话「第一个月 RM2,500，接下来每个月 RM1,500」后修正。
**决定**：见 ADR-004（已重写）。页面/SPEC/DECISIONS/迁移注释统一；测试增加「无 4,000、三语均写首月 2,500」守卫；移动端价格行改为上下堆叠，避免 BM 长文案溢出。
**代价**：`setup_price` 列名仍是历史命名；发票如需拆行，另加明细字段。

