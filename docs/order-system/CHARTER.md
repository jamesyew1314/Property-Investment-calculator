# CHARTER — 建站接单系统 MVP

> 项目：`/Users/huangminming/Pik kwong Lau` · 模块：独立建站接单（Website Orders）
> 总管：chief-of-staff（本 agent）· 日期：2026-11-17
> 目的：交付可评审的 MVP，并用这次交付检验「Lauren Tan 式三层 agent 组织」是否可行。

## 1. 使命

1. **业务**：让房产中介客户能在 `/order/` 自助提交建站需求，运营在 `/admin/orders/` 跟进状态与 token。
2. **组织实验**：用一个小而完整的交付，检验「总管规划 → 职能经理分派 → worker 执行 → verifier 独立验收」是否比单 agent 串行更快、更稳、更省。

## 2. 预期组织图（Lauren Tan 三层）

| 层 | 角色 | 职责 |
|---|---|---|
| L0 委托方 | 根 agent `lead` | 给目标、边界、验收；接收汇报 |
| L1 总管 | `chief-of-staff`（本 agent） | 范围、拆分、验收标准、协调、集成审查、文档 |
| L2 经理 | `product-manager` / `backend-engineer` / `frontend-engineer` / `verifier` | 各自领域交付与自测 |
| L3 worker | 由经理按需再分（本次未启用） | 单文件/单测试执行 |

**实际组织图见第 8 节**（与预期不同，必须如实记录）。

## 3. 范围

**做**
- 迁移 `036_site_orders.sql`：`site_orders` / `site_order_events` / `token_ledger`。
- `work/order-core.js`（纯逻辑）+ `work/order-api.js`（路由）+ `work/api-server.js` 最小挂载。
- 公开下单页 `/order/`、后台 `/admin/orders/`，三语 + 390px。
- `work/test-orders.js` + 独立验证。

**不做（硬边界）**
- 支付网关、电子签、发票、复杂 CRM、客户账号体系。
- 修改 AgentSite / agent 工作台 / 资料库既有功能。
- 部署、nginx/systemd、生产数据库、Git 提交/推送。
- 触碰未跟踪的 `docs/AgentSite_*.md`、`docs/RoofX_*.md`。

## 4. 交付标准（Definition of Done）

1. 5 个 API 按 SPEC 工作，参数化 SQL，错误 JSON 无堆栈。
2. 迁移含索引、CHECK、三表与序列 GRANT，可重复执行。
3. 两个页面三语完整、390px 无溢出、真实提交可见单号。
4. `node work/test-orders.js` 全绿；`node --check` 全绿；patch 可干跑应用。
5. `docs/order-system/` 下 SPEC / CHARTER / TASKS / VERIFY / DECISIONS / VERIFICATION / ORG_FAILURE / MANAGER_PROMPTS / INTEGRATION 齐全。
6. 汇报含文件路径、测试命令与真实输出、未完成项。

## 5. 验收门（Gates）

| Gate | 内容 | 不通过则 |
|---|---|---|
| G1 规格 | SPEC + 迁移评审通过 | 后端/前端不启动 |
| G2 后端 | 路由 + 纯逻辑 + 假 pool HTTP 测试 | 打回 backend |
| G3 前端 | 三语 key 完整 + 390px 截图 + 真实提交 | 打回 frontend |
| G4 独立验证 | verifier 跑命令、给 FAIL 项 | 对应角色修复后重验 |
| G5 集成 | patch 干跑、文件清单、风险清单 | 总管不出货 |

## 6. 协作规则

- **文件所有权互斥**：PM 只写 SPEC+迁移；backend 只写 `order-api.js`/`order-core.js`/`test-orders.js`/`api-server.js` 挂载；frontend 只写两个 HTML；verifier 只读 + 写 `VERIFICATION.md`。
- **交接物是文件，不是口头**：下游只依赖上游已落盘文件。
- **验证者不修代码**：verifier 只报 FAIL（文件、行、命令、期望/实际），修复回原 owner。
- **总管不写业务代码**：本次因环境限制被迫违反，见第 8 节与 `ORG_FAILURE.md`。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 子 agent 不可用 / 沙箱只读 | 降级为 staging 串行交付；产出 `MANAGER_PROMPTS.md` 供根 agent 重派 |
| 无真实 Postgres | fake pool + 纯函数；迁移只做静态审查，标注未验证 |
| 三语 BM 质量 | 结构检查 + 浏览器无中文；母语润色留待人工 |
| 价格口径歧义 | 已由 lead 澄清：首月 RM2,500 总价（含建站+首月服务），第 2 个月起 RM1,500；见 DECISIONS ADR-004 |
| 改 `api-server.js` 破坏既有路由 | 只在 library 挂载后、404 fallback 前加两行；patch 干跑 |

## 8. 实际组织图（诚实记录）

| 层 | 预期 | 实际 |
|---|---|---|
| L0 | 根 agent | `lead`（存在，负责最终落盘/派发） |
| L1 | 总管 | `chief-of-staff`（本 agent，**独自完成全部角色**） |
| L2 | 4 个经理 | **0 个**：`subagent` 被 harness 拒绝（delegation depth = 0） |
| L3 | worker | 0 个 |

因此本次**不是**三层组织交付，而是「总管规划 + 单 agent 串行扮演 + 独立脚本验证」的降级交付。组织有效性的结论必须按这个事实解读（详见 `ORG_FAILURE.md`）。

## 9. 终止条件

- 所有 Gate 通过 → 交付并汇报。
- 任一 Gate 连续 2 轮无法修复 → 记录阻塞项，交付已完成部分，不强行上线。
- 发现必须改生产/部署 → 立即停止，交回 `lead`。
