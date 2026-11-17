# TASKS — 建站接单系统 MVP

> 总管维护。状态：`todo` / `doing` / `done` / `blocked` / `skipped`。
> 由于子 agent 不可用，本次所有任务由总管串行执行；"Owner" 仍保留原计划角色，便于根 agent 重派。

## 1. 依赖图

```
T1 章程/边界 ──► T2 SPEC ──► T3 迁移 ──► T5 后端 API ──► T7 后端测试
                    │                          │
                    └────────► T4 页面合同 ────► T6 前端页面 ──► T8 静态/浏览器验证
                                                                      │
T1 ────────────────────────────────────────────────────────────────► T9 独立验证
T5+T6+T7+T8+T9 ─────────────────────────────────────────────────────► T10 集成/汇报
```

## 2. 任务表

| ID | 任务 | Owner（计划） | 文件所有权 | 依赖 | 验收 | 状态 |
|---|---|---|---|---|---|---|
| T1 | 写 CHARTER/TASKS/VERIFY/DECISIONS，锁定范围与门禁 | 总管 | `docs/order-system/*` | — | 文档齐全、边界明确 | done |
| T2 | 写 SPEC：模型/API/状态机/验收 | product-manager | `docs/order-system/SPEC.md` | T1 | 每条 API 有请求/响应/错误；AC 可执行 | done |
| T3 | 迁移 `036_site_orders.sql` | product-manager | `work/migrations/036_site_orders.sql` | T2 | 三表、CHECK、索引、GRANT、可重复执行 | done |
| T4 | 抽纯逻辑 `order-core.js`（校验/单号/状态/token） | backend-engineer | `work/order-core.js` | T2 | 无 express/DB 依赖，可被测试 require | done |
| T5 | 路由 `order-api.js` + `api-server.js` 挂载 | backend-engineer | `work/order-api.js`、`work/api-server.js`（2 行） | T3,T4 | 5 个端点；401/400/404；SQL 参数化 | done |
| T6 | 公开下单页 | frontend-engineer | `web/order/index.html` | T2 | 三语、390px、真实提交显示单号 | done |
| T7 | 后台订单页 | frontend-engineer | `web/admin/orders/index.html` | T2 | 401 引导 `/admin/`；列表/改状态/记账 | done |
| T8 | 后端回归 `test-orders.js` | backend-engineer | `work/test-orders.js` | T4,T5 | 131 项全绿 | done |
| T9 | 页面静态检查（三语 key、EN/BM 无中文） | frontend-engineer | 同 T6/T7（只读校验） | T6,T7 | 每个 key 三语非空；引用 key 存在 | done |
| T10 | 浏览器 390px + 真实提交 + 后台操作 | verifier | `.build/browser-check.js`（staging only） | T8,T9 | 27 项全绿、截图为证 | done |
| T11 | 独立验证报告 | verifier | `docs/order-system/VERIFICATION.md` | T8,T10 | 命令+输出+PASS/FAIL+未验证项 | done |
| T12 | 组织失败复盘 | 总管 | `docs/order-system/ORG_FAILURE.md` | — | 如实记录 depth=0/只读/影响 | done |
| T13 | 四角色重派 prompt | 总管 | `docs/order-system/MANAGER_PROMPTS.md` | T2 | 每个 prompt 自包含、含所有权/验收 | done |
| T14 | 落盘与集成说明 | 总管 | `docs/order-system/INTEGRATION.md` | T5 | 精确 cp/patch/迁移/测试命令 | done |
| T15 | 把文件落进项目并应用 patch | **lead / 有写权限者** | 项目目录 | T1–T14 | 文件路径与项目一致；patch 应用成功 | **blocked（沙箱只读）** |
| T16 | 真实 Postgres 跑迁移 + 真库 CRUD | 人类/CI | 测试库 | T15 | 迁移成功、5 端点真库通过 | **blocked（无 DB 凭据，禁止碰生产）** |
| T17 | 生产部署/nginx | 人类 | — | T15,T16 | 按 `deploy/deploy.sh` 评审后执行 | **skipped（明确不做）** |

## 3. 关键路径

`T2 → T3 → T5 → T8 → T11 → T15`

## 4. 并行机会（若子 agent 可用）

1. T3（迁移）与 T6/T7（页面）可在 T2 后**完全并行**：前端只依赖 API 合同，不依赖后端实现。
2. T8（后端测试）与 T9（页面静态检查）可并行。
3. T11（验证）必须等 T8/T9/T10 完成，且 verifier 不参与制作。

本次串行耗时估计：读仓库/定规格 ~35%，写代码 ~30%，测试/修缺陷 ~25%，文档 ~10%。若并行，页面与后端可省约 25–30% 墙钟时间。

## 5. 未完成 / 交接

- **T15**：staging 文件尚未进项目（沙箱只允许写 `~/Downloads/日常`）。命令见 `INTEGRATION.md`。
- **T16**：无真实 Postgres；迁移仅静态审查。`work/test-orders.js` 用假 pool 验证了 SQL 形状，不能替代真库。
- **BM 文案润色**：结构齐全、无中文残留，但马来语表达建议母语者过一遍（尤其 `fair_body`、`price_total`）。
- **事件时间线 UI**：已写 `site_order_events`，后台暂未展示；下一迭代可加。
- **真实管理员登录链路**：测试用 stub cookie，未在本地起完整 api-server（它需要 `DATABASE_URL` 且会监听端口）。
