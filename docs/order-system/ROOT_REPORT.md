# ROOT REPORT — 建站接单 MVP 与方法验证

> 日期：2026-11-17 · 根 agent `lead`
> 结论：**系统 MVP 已落盘并通过独立验收；第一轮三层组织失败，第二轮修复环境后完成三层实验，质量更好但速度更慢。**

## 1. 一句话结论

- 系统：可评审、可继续开发的 MVP，已落进项目，未部署。
- 第一轮：**三层组织失败**。总管无法创建子 agent（delegation depth=0），项目目录对总管只读；实际只有「根 → 总管」两层，加一个根直接派出的独立 verifier。
- 第二轮：把 profile 的 `subagent.maxDepth` 从 1 调到 3 后，**真实三层委派成功**：root → 总管 → 3 个经理 → 3 个 worker。详见第 9 节。
- 结论：**方法可运行，但不是无条件更好**。质量维度更好，速度维度更慢；小改动仍应单 agent。

## 2. 实际组织

| 层 | 计划 | 实际 |
|---|---|---|
| L0 | 根 agent | `lead` |
| L1 | 总管 | `chief-of-staff` |
| L2 | 产品/后端/前端/verifier | **0 个**；总管串行扮演前三个 |
| 独立验收 | verifier 不参与制作 | ✅ 根直接派出 `verifier`，只读、只写报告 |

## 3. 交付物

- 公开下单页：`web/order/index.html`（`/order/`）
- 后台订单页：`web/admin/orders/index.html`（`/admin/orders/`）
- API：`work/order-api.js`；纯逻辑：`work/order-core.js`
- 迁移：`work/migrations/036_site_orders.sql`
- 路由挂载：`work/api-server.js` +5 行
- 测试：`work/test-orders.js`
- 规格/验收/复盘：`docs/order-system/`（SPEC、CHARTER、TASKS、VERIFY、DECISIONS、VERIFICATION、VERIFICATION_INDEPENDENT、ORG_FAILURE、MANAGER_PROMPTS、INTEGRATION）

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| staging 完整 HTTP 测试 | **164 PASS**（含时间线，有 express） |
| 项目本机测试（无 express） | **105 PASS + HTTP SKIP**，exit 0 |
| 浏览器检查 | **27 PASS**（390px、三语、提交、后台、401） |
| 既有回归 | `web/test.js` 76、`test-library` 69、`test-static` PASS、`test-agent` 9 |
| 挂载 patch | 已应用，+5 行；无重复 |
| 真实 Postgres / nginx / 真机 | **未验证** |

独立验收：`VERIFICATION_INDEPENDENT.md` 最终 **PASS（带未验证项）**。

## 5. 这次真正抓到的缺陷

1. 首月价格口径错误：曾写成 RM2,500 + RM1,500 = RM4,000；已改为首月总价 RM2,500、第 2 个月起 RM1,500。
2. PostgreSQL 单号冲突重试未用 SAVEPOINT，事务会进入 aborted；已用 SAVEPOINT/ROLLBACK TO 修复并加回归。
3. 公开查单限流按 `req.path` 分桶，65 个不同单号不触发 429；已改为 IP 固定桶。
4. `adjust 0.001` 四舍五入为 0 后触发 DB CHECK，返回 500；已改为 400。
5. 大额合法 2 位小数（如 1234567.89）被浮点误差误拒（D9）；已改为按“分”比较。
6. 后台非 401 加载失败时主区域空白；已先显示 app 再显示错误。
7. 邮件/电话/域名校验过宽（字母电话、连续点邮箱、尾 `-` 域名）；已收紧。
8. 英文/BM meta description 仍是中文；已改为三语动态。

## 6. 方法验证：哪些成立，哪些没有

**成立**
- Spec-first：先写 API/状态机/验收，再实现，返工少。
- Gate：G1–G5 明确，未验证项没有被“全绿”掩盖。
- 独立验收：根派出的 verifier 发现了制作人自验漏掉的 D1/D9/D10。
- 文件交接：`MANAGER_PROMPTS.md` 让角色可重派。

**没有验证**
- 总管 → 经理的真实委派（0 次）。
- 后端/前端并行吞吐（0 次）。
- 上下文隔离（所有角色挤在一个上下文）。
- 多 agent 文件所有权冲突（只有一个写者）。

## 7. 下一步

1. **修环境**：给总管 `depth ≥ 1`，workspace 指向项目；否则三层实验无法成立。
2. **重跑 4 agent 小实验**：product/backend/frontend 并行，verifier 独立；记录墙钟、token、返工。
3. **真库**：测试库执行迁移两次、验证 CHECK/GRANT/并发。
4. **真实会话**：`fc_admin` → `admin_sessions`。
5. **nginx/部署**：`/order/`、`/admin/orders/` 路由与 `deploy.sh` 纳入新文件后再上线。
6. **真机/BM 母语**：iOS Safari 390px、BM 润色。

## 8. 状态

- 未 commit、未 push、未部署、未连生产 DB。
- 项目工作区有本次新增文件与 `work/api-server.js` 的 5 行改动，供评审。


## 9. 第二轮：三层组织实验（订单事件时间线）

环境修复：`~/.dsh/profiles/desktop/cordis.patch.yml` 增加 `subagent.maxDepth: 3`、`maxActiveSubagents: 12`。  
探针：root(0) → chief(1) → manager(2) → worker(3) 全部创建成功，无 depth 错误。

### 实际组织

```
lead
└── chief-of-staff-2
    ├── timeline-product-manager → timeline-spec-worker
    ├── timeline-backend-engineer → timeline-backend-worker
    ├── timeline-frontend-engineer → timeline-frontend-worker
    └── timeline-verifier
```

- 4 个经理全部创建成功
- 3/3 生产经理都成功创建 depth-3 worker
- backend/frontend **真并行**：同一分钟启动，重叠 5m35s
- verifier 独立，不参与制作；返工由同角色续作 agent 执行

### 结果

| 指标 | 结果 |
|---|---|
| 功能 | 后台订单事件时间线（API + UI + 三语 + 390px） |
| 测试 | staging **164 PASS**；项目 **105 PASS + HTTP SKIP** |
| 墙钟 | **约 47 分钟**；单 agent 基线约 30 分钟，慢 **1.57×** |
| Token | 无 per-agent token 遥测，未编造 |
| 独立验收 | 发现 D-01/D-02/D-03 三个“假绿”测试缺陷；返工后关闭 |
| 最终 | 时间线功能已落进项目；未 commit/部署 |

### 方法判断

**更好**
- verifier 用变异测试独立击杀 3 个假绿，单 agent 自验很难发现
- PM worker 在写码前发现 AC 不可测、合同自相矛盾
- 并行省下约 5m35s
- 390px 用真实 CDP 测，不是“看代码觉得没问题”

**更慢/更乱**
- 47 vs 30 分钟；PM 19 分钟串行闸门是主因
- 已结束的 subagent 无法 `send_message`，返工要多开续作 agent
- 合同笔误会被 3 个经理同时继承
- 返工 3 轮，根因是任务书没强制“每条断言配一个能打死它的变异”

### 建议

- **中型/高风险功能**：用三层 + 独立 verifier，值得
- **小改动/单文件**：单 agent 更快
- 下一轮改进：PM 与 backend/frontend 并行；每条 AC 强制配变异测试；返工用可继续的 agent，不要新建
