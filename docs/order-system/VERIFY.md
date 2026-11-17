# VERIFY — 验收清单（可执行）

> 用法：逐项跑命令、贴输出；任何 `✗` 阻断出货。
> 环境：Node v24.18.0 · macOS · 无真实 Postgres · 项目目录只读（本次在 staging 执行）。

## 0. 文件清单

```bash
cd "/Users/huangminming/Pik kwong Lau"   # 落盘后
ls -l work/migrations/036_site_orders.sql work/order-api.js work/order-core.js \
      work/test-orders.js web/order/index.html web/admin/orders/index.html \
      docs/order-system/{SPEC,CHARTER,TASKS,VERIFY,DECISIONS,VERIFICATION,ORG_FAILURE,MANAGER_PROMPTS,INTEGRATION}.md
```

- [ ] 6 个代码/页面文件 + 9 个文档存在
- [ ] `work/api-server.js` diff 只有 2 处新增（require + mount）

## 1. 语法与静态

```bash
node --check work/order-core.js
node --check work/order-api.js
node --check work/test-orders.js
grep -n "createOrderApi" work/api-server.js
```

- [ ] 三个 `--check` 退出码 0
- [ ] `api-server.js` 含 `require("./order-api")` 且挂载在 404 fallback 之前
- [ ] 迁移含 3 张表、3 个序列 GRANT、8 状态 CHECK
- [ ] 代码无 `console.log` 泄露订单隐私（只允许启动日志）

## 2. 后端回归（假 pool，无需 DB）

```bash
node work/test-orders.js
```

- [ ] 退出码 0，输出 `ORDERS PASS / 131 checks`
- [ ] 覆盖 AC-02/03/04/05/06/07/11/12
- [ ] HTTP 段未 SKIP（服务器/本机有 express；无 express 时 SKIP 需在报告注明）

## 3. 页面三语静态检查

`test-orders.js` 已包含；也可单独抽查：

```bash
grep -c 'data-lang="zh"\|data-lang="en"\|data-lang="bm"' web/order/index.html
grep -c "data-i18n" web/order/index.html
grep -n "?v=ord1" web/order/index.html
```

- [ ] 每页 3 个语言按钮
- [ ] 公开页无 `4,000`，三语价格文案均为「首月 2,500」
- [ ] 每个 `data-i18n` key 在字典中存在且为 `[zh,en,bm]`
- [ ] EN/BM 值无 CJK（语言按钮「中文」除外）
- [ ] 页面引用的静态资源均带 `?v=`

## 4. 浏览器 390px（staging 专用脚本）

```bash
cd "/Users/huangminming/Downloads/日常/order-system-mvp"
NODE_PATH="/Users/huangminming/.npm-global/lib/node_modules:$PWD/node_modules" \
  node .build/browser-check.js
```

- [ ] 输出 `BROWSER PASS`
- [ ] zh/en/BM 三语切换、无横向溢出
- [ ] 真实填写并提交，显示 `ORD-YYMMDD-XXXX`
- [ ] 后台列表出现该单；改状态 `live` 成功；token 充值 100 后余额 `100.00`
- [ ] 无 `pageerror` / `console.error`
- [ ] 截图存 `.build/shots/`（`order-mobile-zh.png`、`order-mobile-success-zh.png`、`admin-mobile-zh.png`、`admin-modal-mobile-zh.png`、`order-desktop-zh.png`、`admin-desktop-zh.png`）

> 该脚本依赖 staging 安装的 express 与全局 puppeteer，不进项目、不进 CI。

## 5. 挂载 patch

```bash
cd /tmp && rm -rf patchtest && mkdir -p patchtest/work
cp "/Users/huangminming/Pik kwong Lau/work/api-server.js" patchtest/work/
cd patchtest && patch -p1 --dry-run < ".../work/api-server.patch"
```

- [ ] `dry-run` 退出码 0，只 patch `work/api-server.js`
- [ ] 注入一次 23505 后仍 201（savepoint 重试，非 25P02）
- [ ] 应用后 `node --check work/api-server.js` 通过
- [ ] 既有路由顺序未被改动（library 之后、404 之前）

## 6. 迁移（有测试库时）

```bash
# 只对测试库执行；禁止生产
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f work/migrations/036_site_orders.sql
psql "$TEST_DATABASE_URL" -c "\d site_orders"
psql "$TEST_DATABASE_URL" -c "\d token_ledger"
# 幂等
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f work/migrations/036_site_orders.sql
```

- [ ] 首次执行无错
- [ ] 第二次执行无错（`IF NOT EXISTS`）
- [ ] `fangchan_app` 能 INSERT/SELECT 三表（`GRANT` 生效）
- [ ] `usage` 金额为负被 CHECK 拒绝；非法 status 被 CHECK 拒绝

## 7. 真库 API（有测试库时）

启动 api-server 指向测试库，或复用 `deploy/deploy.sh` 的 staging 流程（不要生产）：

- [ ] `POST /api/orders` 201，DB 有订单 + created 事件
- [ ] 重复 order_no 触发 23505 后自动重试（构造冲突）
- [ ] `GET /api/orders/:no` 仅三列
- [ ] 未登录后台 401；登录后列表/改状态/token 正常
- [ ] 并发两个 `usage` 不会把余额扣成负数（`FOR UPDATE`）

## 8. 手机端人工抽查（落盘/部署后）

- [ ] iPhone 12/13（390×844）Safari：`/order/` 三语切换、表单、键盘不遮挡提交按钮
- [ ] 后台表格转卡片、弹窗可滚动、按钮可点
- [ ] 三语切换条不遮挡内容

## 9. 安全/隐私

- [ ] 公开 GET 不含 phone/email/notes/company/domain
- [ ] 错误响应无堆栈、无 SQL
- [ ] 所有 SQL 参数化（grep `+ req.` / 字符串拼接）
- [ ] 后台写路由同时挂 `requireAdmin` 与 `requireWrite`
- [ ] 限流对公开写生效（同 IP 第 6 次 429）

## 10. 出货签字

| Gate | 负责人 | 结果 |
|---|---|---|
| G1 规格/迁移 | 总管 | ✅ staging |
| G2 后端 | backend | ✅ 131 checks |
| G3 前端 | frontend | ✅ 27 browser checks |
| G4 独立验证 | verifier | ✅ `VERIFICATION.md` |
| G5 集成 | 总管 | ⛔ 待落盘（沙箱只读） |
