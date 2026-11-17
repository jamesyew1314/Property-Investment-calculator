# INTEGRATION — 把 staging 落进项目

> 背景：本会话沙箱只允许写 `~/Downloads/日常`，项目目录只读；以下命令由 `lead` 或任何有写权限的会话执行。
> 目标：文件落到正确路径、`api-server.js` 只加 2 行、测试全绿、**不部署、不 commit**。

## 0. 变量与预检

```bash
PROJ="/Users/huangminming/Pik kwong Lau"
STAGE="/Users/huangminming/Downloads/日常/order-system-mvp"

cd "$PROJ"
git status --porcelain
```

预期：工作区干净，或只有既有的未跟踪文件：

```
?? docs/AgentSite_建站收费SOP_2026-11-12.md
?? docs/RoofX_网站费用说明_2026-11-11.md
```

- [ ] 若出现其他未预期改动，先停下确认，避免覆盖别人的工作。
- [ ] 确认 `work/migrations/` 最新仍是 `035_client_prefs.sql`（本次新增 036）。
- [ ] 确认 `work/api-server.js` 与 staging patch 的基线一致：

```bash
shasum -a 256 "$PROJ/work/api-server.js" "$STAGE/.build/api-server.orig.js"
# 两个 hash 应相同；不同则 patch 可能冲突，改用 §3 手工插入
```

## 1. 建目录

```bash
mkdir -p "$PROJ/docs/order-system" "$PROJ/web/order" "$PROJ/web/admin/orders"
```

## 2. 复制文件（显式清单，避免把 node_modules/.build/截图带进去）

```bash
# 文档（9 份）
cp "$STAGE/docs/order-system/"*.md "$PROJ/docs/order-system/"

# 迁移
cp "$STAGE/work/migrations/036_site_orders.sql" "$PROJ/work/migrations/"

# 后端
cp "$STAGE/work/order-core.js" "$PROJ/work/"
cp "$STAGE/work/order-api.js"  "$PROJ/work/"
cp "$STAGE/work/test-orders.js" "$PROJ/work/"
cp "$STAGE/work/api-server.patch" "$PROJ/work/"

# 页面
cp "$STAGE/web/order/index.html" "$PROJ/web/order/"
cp "$STAGE/web/admin/orders/index.html" "$PROJ/web/admin/orders/"
```

**不要复制**：

- `$STAGE/node_modules/`（只用于 staging 测试）
- `$STAGE/.build/`（含假 pool、截图、原始 api-server 副本）
- `$STAGE/web/icon-256.png`（项目已有同名文件，复制只会制造无意义改动）

## 3. 给 `api-server.js` 打补丁

### 3.1 推荐：unified diff

```bash
cd "$PROJ"
patch -p1 --dry-run < work/api-server.patch   # 应输出 patching file 'work/api-server.js'
patch -p1 < work/api-server.patch
node --check work/api-server.js
```

### 3.2 手工插入（若 patch 冲突）

`work/api-server.js` 第 13 行后（`const createAgentApi = ...` 下一行）：

```js
const createOrderApi = require("./order-api");
```

在 `app.use("/api/library", createLibraryApi({ pool, requireAdmin, requireWrite }));` 之后、`// ---------- fallbacks ----------` 之前：

```js
// ---------- 建站接单（Website orders） ----------
app.use("/api", createOrderApi({ pool: pool, requireAdmin: requireAdmin,
  requireWrite: requireWrite, rateLimit: rateLimit }));
```

**顺序要求**：必须在 `requireAdmin`（约 803 行）定义之后、`app.use("/api", 404)` 之前。函数声明会提升，但挂载位置决定 404 是否先命中。

### 3.3 检查 diff

```bash
git diff --stat -- work/api-server.js
git diff -- work/api-server.js
```

- [ ] 只有 2 处新增（+1 require，+4 行挂载含注释/换行）
- [ ] 没有改动任何既有路由、中间件、fallback

## 4. 跑测试

```bash
cd "$PROJ"

# 本次新增
node --check work/order-core.js
node --check work/order-api.js
node work/test-orders.js          # 期望：ORDERS PASS / 138 checks

# 既有回归（确认没碰坏）
node web/test.js
node work/test-library.js
node work/test-static.js
```

说明：
- 本机项目若没有 `express`，`test-orders.js` 的 HTTP 段会打印 `SKIP`（纯逻辑 + 页面检查仍跑）。服务器 `/srv/fangchan/api` 有 express。
- 若想让本地也跑 HTTP 段：`npm i express@4 --no-save`（会改 `node_modules`，按团队习惯决定）。

## 5. 迁移（只对测试库；禁止生产）

```bash
# 需自行提供测试库连接串；不要用生产 DATABASE_URL
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f work/migrations/036_site_orders.sql

# 结构检查
psql "$TEST_DATABASE_URL" -c "\d site_orders"
psql "$TEST_DATABASE_URL" -c "\d site_order_events"
psql "$TEST_DATABASE_URL" -c "\d token_ledger"

# 幂等：再跑一次必须无错
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f work/migrations/036_site_orders.sql
```

- [ ] 两次执行都成功
- [ ] `fangchan_app` 能 `INSERT/SELECT` 三表（GRANT 生效）
- [ ] `INSERT token_ledger(kind='usage', amount=-1)` 被 CHECK 拒绝
- [ ] `UPDATE site_orders SET status='archived'` 被 CHECK 拒绝

> **绝不**在 `fangchan` 生产库执行；本文件不提供任何生产命令。

## 6. 路由/静态资源（部署前确认，不在本次执行）

- 静态页由 nginx 从 `/srv/fangchan/web/` 提供；`deploy/deploy.sh` 的 `rsync web/` 会自动带上 `order/` 与 `admin/orders/`。
- 但 `deploy/deploy.sh` 的“上传后端”列表与迁移列表**尚未包含** `order-api.js` / `order-core.js` / `036_site_orders.sql`。本次**不修改** deploy 脚本；正式发布前需由负责人补：

  ```bash
  # 仅示意，本次不执行
  # scp work/order-api.js work/order-core.js → /srv/fangchan/api/
  # psql -f work/migrations/036_site_orders.sql
  ```

- nginx 若关闭了 `index` 或对 `/admin/` 有单独 location，需要确认 `/admin/orders/` 不被拦截；本次未改 nginx，未验证。

## 7. 验收命令（落盘后）

```bash
cd "$PROJ"
git status --porcelain
ls -l work/order-core.js work/order-api.js work/test-orders.js \
      work/migrations/036_site_orders.sql \
      web/order/index.html web/admin/orders/index.html
node work/test-orders.js | tail -3
```

预期：

```
ORDERS PASS / 138 checks
```

## 8. 回滚

### 8.1 只回滚挂载

```bash
cd "$PROJ"
patch -R -p1 < work/api-server.patch
node --check work/api-server.js
git diff -- work/api-server.js   # 应为空
```

### 8.2 删除新增文件（会丢文档，谨慎）

```bash
rm -f work/order-core.js work/order-api.js work/test-orders.js
rm -rf web/order web/admin/orders
# docs/order-system 建议保留作为交付记录
```

### 8.3 数据库（仅测试库，且确认无数据）

```sql
BEGIN;
DROP TABLE IF EXISTS token_ledger;
DROP TABLE IF EXISTS site_order_events;
DROP TABLE IF EXISTS site_orders;
COMMIT;
```

**有真实订单时禁止执行**；生产回滚需单独评审备份。

## 9. 完整性校验（可选）

落盘后比对 SHA-256：

| 文件 | 期望 |
|---|---|
| `work/migrations/036_site_orders.sql` | `036045fd8e0dc8447c177d5cf8ff4ca75af22b32c1127bf3d35f891fa8ca301b` |
| `work/order-core.js` | `0c7b1159efdb76bdae7ebd035a7fdd52a32fb96af6aeeace94e0a99f76224632` |
| `work/order-api.js` | `6144e0b1ccbca7471478109cdc2ee65072fc9f07927a50ebe932145bb19dc4f2` |
| `work/test-orders.js` | `43330cb9e5cdf1bb1cd47060c173a8fa51afb1f1e67eb89d40d6f9ec8693f859` |
| `web/order/index.html` | `a49acedadb887a998464aa2b085b2b1c8ea27030818b016f042da140bf5414ca` |
| `web/admin/orders/index.html` | `30ddfef65ae13af90832a28de7f3eabe2fd9ab425e30414160020575a9010822` |

```bash
cd "$PROJ" && shasum -a 256 work/migrations/036_site_orders.sql work/order-core.js \
  work/order-api.js work/test-orders.js web/order/index.html web/admin/orders/index.html
```

## 10. 落盘后仍必须做的

1. 真库迁移 + 真库 API（`VERIFY.md` §6–7）。
2. 完整 `api-server` + 真实 `fc_admin` 登录的 401/列表/改状态/记账。
3. nginx 下 `/order/`、`/admin/orders/` 的 200 与缓存头。
4. iOS/Android 真机 390px。
5. 独立 verifier 复跑（`MANAGER_PROMPTS.md` §4）。
6. 发布前把新文件加入 `deploy/deploy.sh`，并由负责人评审。
