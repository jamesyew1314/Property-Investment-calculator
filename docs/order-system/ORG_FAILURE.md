# ORG_FAILURE — 三层 agent 组织验证失败记录

> 日期：2026-11-17 · 记录人：chief-of-staff（总管）
> 结论先行：**本次没有形成三层组织**。失败原因不是方法本身，而是执行环境的两条硬限制；但方法中「独立验证」和「并行吞吐」两项因此完全没被验证。

## 1. 预期 vs 实际

| 项 | 预期（Lauren Tan 三层） | 实际 |
|---|---|---|
| L0 委托 | 根 agent `lead` 给目标 | ✅ 有 |
| L1 总管 | 本 agent 规划、拆分、协调、集成 | ✅ 有（但降级为执行者） |
| L2 经理 | product-manager / backend-engineer / frontend-engineer / verifier | ❌ **0 个** |
| L3 worker | 经理再分派 | ❌ 0 个 |
| 文件所有权 | 四个 agent 互斥写 | ⚠️ 只有总管一个写者 |
| 独立验收 | verifier 不参与制作 | ❌ 总管自验 |
| 并行 | 后端/前端同时开工 | ❌ 全串行 |

## 2. 失败原因（按发生顺序）

### 2.1 Delegation depth = 0

启动时 harness 明确限制：

```
Delegation depth for `subagent`: current 1, maximum 1, remaining levels 0.
Do not call `subagent` at this depth; carry out the work directly.
```

`subagent` 与 `subagent_fork` 均不可用。总管无法创建任务要求的 4 个子 agent，也无法形成 L2/L3。

### 2.2 项目目录只读

会话 workspace 是 `/Users/huangminming/Downloads/日常`，而项目 cwd 是 `/Users/huangminming/Pik kwong Lau`。实测：

```console
$ mkdir -p docs/order-system web/order web/admin/orders
mkdir: docs/order-system: Operation not permitted
...
[sandbox: file access denied under workspace-write mode]
```

且本会话「审批提示已禁用」，不能申请提权。总管**无法把任何文件写进项目**，也无法改 `work/api-server.js`。

### 2.3 降级决策

向 `lead` 报告后，`lead` 接受 staging 交付：

- 在 `~/Downloads/日常/order-system-mvp/` 按项目相对路径产出全部文件；
- `api-server.js` 用 unified diff，干跑验证；
- 由 `lead` 或有写权限者落盘（见 `INTEGRATION.md`）。

## 3. 这对「Lauren 方法验证」意味着什么

### 3.1 完全没验证到的（不能说方法有效）

1. **委派本身**：没有一次「总管 → 经理」的真实任务交接。
2. **并行吞吐**：后端与页面本可在 SPEC 后同时开工，实际串行；无法测量节省的墙钟时间。
3. **上下文隔离**：所有规格、实现、测试、文档都挤在一个上下文里；无法验证「经理只带自己领域的上下文」是否降低错误率。
4. **独立验收**：verifier 由制作人兼任，独立性不成立。
5. **文件所有权冲突**：只有一个写者，不会冲突，也就没验证所有权机制是否防得住越界。

### 3.2 间接验证到的（方法中有价值的部分）

1. **Spec-first 有效**：先把 API 合同/状态机/验收写成 `SPEC.md`，实现与测试都围绕它，返工少。
2. **Gate 制有效**：G1–G5 让「什么时候可以进下一步」明确；`VERIFICATION.md` 的未验证项没有被"全绿"掩盖。
3. **测试先于信任**：`test-orders.js` 发现字段错误；Puppeteer 发现 390px 标题断字与 BM 价格溢出；lead 审查发现事务 bug 与价格口径错误。**字段契约、事务重试、价格口径、390px 溢出等真实缺陷，都不是靠"我觉得对"发现的**。
4. **交接物是文件**：即使没有子 agent，`SPEC.md` + `MANAGER_PROMPTS.md` 仍让任务可被重新派发，不依赖口头上下文。
5. **角色化思维有用**：以 PM/后端/前端/verifier 的视角轮换检查，确实比"一把梭"多找出问题（如公开接口泄露、401 引导、BM 溢出）。

### 3.3 成本观察

- 单会话需要同时容纳：仓库规范、SPEC、SQL、API、两页 HTML、测试桩、验证脚本、9 份文档。
- 角色切换靠人肉，容易漏（例如价格口径在页面/文档/迁移三处不一致，正是 lead 审查才抓出）。
- 没有 verifier 的独立上下文，**自我确认偏差**明显：我在 `VERIFICATION.md` 里必须额外声明独立性不足。

## 4. 根因归类

| 限制 | 性质 | 是否方法缺陷 |
|---|---|---|
| depth=0 | harness 配置/权限 | 否，环境 |
| 项目只读 | workspace 绑定错误 | 否，环境 |
| 自验 | 前两者导致 | 是，方法执行被扭曲 |
| 串行 | 前两者导致 | 是，吞吐未验证 |

**结论**：这是一次「环境导致的组织降级」，不能据此否定 Lauren 方法，但也**绝不能据此宣称方法有效**。目前只能证明：**规划/规格/门禁/测试这些"单 agent 也能做"的部分有价值；委派与并行部分未被检验。**

## 5. 要让实验成立，需要什么

1. **给总管 depth ≥ 1**（或根 agent 直接按 `MANAGER_PROMPTS.md` 派 4 个经理）。
2. **workspace 指向项目**（`/Users/huangminming/Pik kwong Lau`），或给总管该目录写权限。
3. **verifier 必须是独立 agent**，只读代码、只写 `VERIFICATION.md`；禁止参与实现。
4. **至少一次真实并行**：SPEC 定稿后，backend 与 frontend 同时启动，记录墙钟时间与返工次数。
5. **度量**：每角色 token/耗时、缺陷发现阶段、返工轮次；与本次单 agent 基线对比。

## 6. 给根 agent 的建议

- 不要因为本次"交付完成"就扩大 agent 数量；**先修环境**（depth + workspace），再跑一次 4 agent 的小实验。
- 重派时直接用 `MANAGER_PROMPTS.md` 的四段 prompt；verifier 最后启动，且只给只读权限。
- 如果环境仍不允许，保持「总管 + 脚本验证」模式，但把**独立 verifier 外包给人类**，不要自验签字。
