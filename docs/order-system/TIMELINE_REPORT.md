# TIMELINE_REPORT — 三层组织实跑报告

**功能**：后台订单详情「订单事件时间线」（`GET /api/admin/orders/:id/events` + 详情弹窗 Timeline 区块）
**Staging**：`/Users/huangminming/Downloads/日常/order-system-mvp`
**运行窗口**：2026-11-17 **16:06:00 → 16:53**（Asia/Shanghai）
**结论**：功能完成，`node work/test-orders.js` = **ORDERS PASS / 164 checks**（基线 138，+26，0 失败）。
未 commit、未部署、未连生产 DB；未触碰 `/Users/huangminming/Pik kwong Lau`。

---

## 1. 组织树（实际创建，非计划）

```
lead (depth 1)
└── chief-of-staff-2 (depth 2, 我)            ← 范围 / 拆分 / AC / 集成审查 / 文档
    ├── timeline-product-manager (2)           → docs/order-system/TIMELINE_SPEC.md（840 行）
    │   └── timeline-spec-worker (3)           → SPEC 独立审稿：6 必修 + 11 建议，全部采纳
    ├── timeline-backend-engineer (2)          → work/order-api.js + work/test-orders.js
    │   └── timeline-backend-worker (3)        → 写 14 条事件路由测试 + 假库改造
    ├── timeline-frontend-engineer (2)         → web/admin/orders/index.html
    │   └── timeline-frontend-worker (3)       → 只读复核（逐字符提取 SPEC 事实 + 独立复跑）
    ├── timeline-verifier (2)                  → TIMELINE_VERIFICATION.md round 1（9 分钟，独立探针）
    ├── timeline-backend-repair (2)            → 返工轮 2（原 owner 已结束、不可再唤起）
    ├── timeline-verifier-2 (2)                → 复验 round 2（追加 L496 起）
    └── timeline-backend-repair-2 (2)          → 返工轮 3（关掉 R2-01）
```

**方法验证硬指标**

| 问题 | 结论 |
|---|---|
| 是否成功创建 4 个经理？ | **是**（PM / backend / frontend / verifier，均 depth 2，均拿到完整上下文与文件所有权） |
| 每个经理是否成功创建 worker？ | **3/3 生产经理都有 depth-3 worker**（`list_agents` 可证：`timeline-spec-worker`、`timeline-backend-worker`、`timeline-frontend-worker`）。verifier 按设计不产码、不配 worker。 |
| 后端/前端是否真并行？ | **是**。两者均 `16:25:14` 启动：backend `16:25:14→16:30:49`（5m35s），frontend `16:25:14→16:34:07`（8m53s），**重叠 5m35s**。文件互不重叠，双方 `diff | grep -c '^<'` 均 0。 |
| verifier 是否独立发现制作人漏掉的问题？ | **是，且是本轮最大收益**（见 §4）。 |

---

## 2. 各 agent 产出

| Agent | 交付物 | 关键数字 |
|---|---|---|
| chief-of-staff-2 | `TIMELINE_TASKS.md`(164) / `TIMELINE_VERIFY.md`(5,072B) / `TIMELINE_REPORT.md` / `.baseline/` 快照 | 锁定 AC 27 条；裁决 8 条异议 |
| product-manager | `TIMELINE_SPEC.md` | 840 行；12 节；9 个 i18n key × 三语；AC 逐条给可执行命令 |
| spec-worker | SPEC 审稿意见（只读） | 17 条（6 必修 + 11 建议），**全部采纳** |
| backend-engineer | `work/order-api.js` +18/−0；`work/test-orders.js` +187/−0 | 新路由 1 条；新测试 16 条；138→154 checks |
| backend-worker | 14 条事件测试 + 假库 3 处改造 | 首跑 152，被经理补 2 条到 154 |
| frontend-engineer | `web/admin/orders/index.html` +135/−0 | 9 key × 三语；4 个刷新/复位点；390px 真浏览器实测 |
| frontend-worker | DOM/390px/三语只读复核 | 0 blocker / 0 major；指出 AC-F4 命令判别力弱 |
| verifier | `TIMELINE_VERIFICATION.md`(492 行) | AC **19 PASS / 0 FAIL / 0 UNVERIFIED**；发现 3 个 minor 假绿 |
| backend-repair | `work/test-orders.js` +68 | 加 `timelineUiChecks()` 8 条；假库去掉 LIMIT/id 兜底；154→162 |
| verifier-2 | 追加「复验轮 round 2」（492→556 行） | D-01/02/03 **全 CLOSED**；新发现 R2-01 |
| backend-repair-2 | `work/test-orders.js` +16 | 门槛 ≥4→≥5 + 2 条 fail-closed 窗口断言；162→**164** |

---

## 3. 墙钟时间

| 阶段 | 开始 | 结束 | 用时 |
|---|---|---|---|
| P0 CoS 锁范围 + 写 TASKS/VERIFY + 复现基线 | 16:06:00 | 16:07:04 | ~1 min |
| P1 PM 写 SPEC（含 spec-worker 审稿+返修） | 16:07:04 | ~16:26 | **~19 min** |
| P2 backend ∥ frontend | 16:25:14 | 16:30:49 / 16:34:07 | **8m53s**（重叠 5m35s） |
| P3 verifier round 1 | 16:34:47 | 16:43:49 | **9m02s** |
| P4 返工轮 2（假绿修复） | 16:45:14 | 16:47:20 | 2m06s |
| P5 复验 round 2 | 16:47:45 | ~16:50 | ~2m |
| P6 返工轮 3（R2-01） | 16:50:01 | 16:50:38 | 37s |
| P7 CoS 集成门（自跑 + 独立变异抽检） | 16:50:40 | 16:53 | ~2m |
| **合计** | **16:06:00** | **16:53** | **≈47 min** |

**对比上次单 agent 基线（约 30 min）：本轮慢 ≈17 min（1.57×）。**
差距主要来自 **P1 PM 19 分钟串行闸门** 与 **P3+P5 两轮验证（11 min）**。

**token / 成本**：本环境的 subagent 工具**不返回 per-agent token 用量**，会话内也无可读的计费遥测 →
**「无 per-agent token 遥测」**，不做任何数值推测。可量化的替代指标：本轮 12 个 agent 会话、
产出文档 5 份共 ~2,300 行、代码净增 340 行（3 文件全部 0 删除行）。

---

## 4. 测试结果与缺陷

### 4.1 最终测试

```
$ node work/test-orders.js 2>&1 | tail -3
✓ 假库 5 条 token 流水（成功记账）
✓ 假库 3 条事件（2 created + 1 status）

ORDERS PASS / 164 checks
```
`✗` = 0，exit 0。基线 138 → 164（**+26**）。三个改动文件 `diff .baseline | grep -c '^<'` 均为 **0**（纯新增，无删除/弱化既有断言）。
`work/order-core.js` md5 `0661c8e0e8f6a07187459f68f9739390`、mtime 15:56 —— **未被修改**；`work/migrations/` 仍只有 `036_site_orders.sql`（**未新增迁移**）。

### 4.2 缺陷清单（全部已关闭）

| 编号 | 严重度 | 发现者 | 内容 | 状态 |
|---|---|---|---|---|
| D-01 | minor（需求级） | **verifier**（CoS 亦独立怀疑） | 前端静态检查假绿：删 `#timeline-sect`、删 key `timeline_type_note`、删两处 `loadTimeline()`、`/events`→`/evntz`，测试仍 `PASS 154` | **CLOSED**（4 个变异全红） |
| D-02 | minor | **verifier** | 假库固定 `slice(0,100)`，实现漏 `LIMIT 100` 行为断言仍绿 | **CLOSED**（行为断言红：`got 120 want 100`） |
| D-03 | minor | **verifier** | 假库无条件补 `id DESC`，实现漏第二排序键仍绿 | **CLOSED**（`got [12,13,14,11] want [13,12,14,11]`） |
| R2-01 | minor | **verifier-2** | `calls >= 4` 把函数定义也计入 → 单独删 openDetail / apply 的刷新仍绿 | **CLOSED**（门槛 ≥5 + 2 条 fail-closed 窗口断言；返工方与 CoS 各自变异验证） |

**CoS 独立抽检**（不采信返工方自述）：把 `openDetail` 里的 `loadTimeline(r.id);` 删掉后重跑 →
`ORDERS FAIL 2 / 164`，命中的正是
`loadTimeline( 调用点 ≥ 5 … → 4` 与 `function openDetail( 之后 1500 字符窗口内调用 loadTimeline(（打开详情即加载）→ {"hit":-1}`；
恢复后 `ORDERS PASS / 164`。**验证闭环成立。**

### 4.3 产品侧验收（verifier round 1，19/19 PASS）

- API：401 / 非法 id（`0`,`-3`,`abc`,`1.5`）/ 不存在 404 / 5 键严格形状 / `created_at DESC, id DESC`（含同秒数据）/
  空列表 / 120→100 截断取最新 / GET 只读 / SQL 只 SELECT —— 全 PASS。
- 前端：容器位置 / `"/events"` 精确匹配 / 9 key 三语长度 3 / 401 未吞 / 两处刷新 / 四态文案 —— 全 PASS。
- **390px：真浏览器实测**（Chrome CDP `Emulation.setDeviceMetricsOverride`，`innerWidth===390`）：
  `#dtimeline` `scrollWidth===clientWidth===342`，长 note(800 字符含 HTML 转义/emoji)、长 actor、长未知 type 均无横向溢出；zh/en/bm 三语均无溢出。
- 竞态/生命周期：A 慢 B 快切单只留 B；关窗后迟到响应不落地；401 后弹窗关闭且不写文案；切语言无请求风暴（4 次/3 切）。

---

## 5. 方法结论：比上次单 agent 更好吗？

### 更好的地方（有证据）

1. **缺陷密度可视化**：单 agent 写测试时，测试与实现出自同一思路，容易「测自己相信的东西」。本轮
   verifier 用**变异测试**在不看实现意图的前提下干掉了 3 个假绿——这是单 agent 结构上很难自证的（D-02/D-03 我本人复审时也没看出来）。
2. **规格先行挡住返工**：PM 的 spec-worker 在写码前就发现 **AC-A4「5 键」原本测不出**（探针 stub 返回固定对象）、
   **AC-R2 与假库改造自相矛盾**、**`--window-size=390` 实测视口仍是 500px（假绿）**。这 3 条若留到实现后才发现，至少多一轮返工。
3. **并行真的省时**：backend∥frontend 重叠 5m35s，构建阶段 8m53s 而非 ~14m。文件所有权切得干净，3 个文件 0 删除行、0 冲突。
4. **可审计**：每个 AC 都能指到具体断言/命令/浏览器证据；缺陷有 owner、有复现、有复验。

### 更慢 / 更乱的地方（如实记）

1. **总时长 47 min vs 基线 30 min（1.57×）**。PM 单点 19 min 是最大瓶颈：它先写 778 行、再审稿、再返修，
   我等到 19 min 才放行下游。**改进**：合同在 TASKS 里已锁死时，PM 应与 backend/frontend **并行**，SPEC 作为参考文档而非阻塞闸门。
2. **「发回原 owner 修」的规则在本环境无法照字面执行**：已结束的 subagent `send_message` 返回
   `unavailable`（PM、backend 各试过一次）。返工因此由**同角色续作 agent**（`-repair`、`-repair-2`）执行，
   等于多开了 2 个会话。这是真实的方法损耗，不是设计意图。
3. **合同笔误传染**：我写的「六字段」实为 5 键、AC-A2「400 或 404」与表格「404」并存，PM 花了篇幅写异议与裁决。
   CoS 的合同错误会被 3 个经理同时继承。
4. **返工 3 轮**：第 1 轮生产者的自测只做到「能绿」，没做到「变异会红」；第 2 轮修完仍有 R2-01（门槛把定义算进调用）。
   根因是**任务书里没有强制「变异自证」**——第 3 轮才补上。若一开始就要求「每个断言配一个会打死它的变异」，
   预计可省 1 轮（约 4 min）。
5. **验证串行**：verifier 必须在两个生产者都完成后才能跑，9 min 全串行，无法与构建重叠。

### 一句话结论

**质量维度更好（+26 断言、3 个假绿被独立击杀、390px 真机验证、19/19 AC 有证据）；速度维度更差（47 vs 30 min）。
按「功能正确性 + 测试可信度」计价，这套三层组织值得用在有回归风险的中型功能上；按「小改动交付速度」计价，单 agent 更快。**

---

## 6. 复现命令

```bash
cd /Users/huangminming/Downloads/日常/order-system-mvp
node work/test-orders.js 2>&1 | tail -3          # ORDERS PASS / 164 checks
diff .baseline/order-api.js   work/order-api.js   | grep -c '^<'   # 0
diff .baseline/test-orders.js work/test-orders.js | grep -c '^<'   # 0
diff .baseline/index.html web/admin/orders/index.html | grep -c '^<' # 0
grep -n 'id="timeline-sect"\|id="dtimeline"' web/admin/orders/index.html
grep -n 'admin/orders/.*"/events"' web/admin/orders/index.html
md5 -q work/order-core.js    # 0661c8e0e8f6a07187459f68f9739390（未改）
```

## 7. 相关文档

- `docs/order-system/TIMELINE_TASKS.md` —— 范围、文件所有权、API/UI 合同、AC、CoS 裁决
- `docs/order-system/TIMELINE_VERIFY.md` —— 验收脚本 V0–V6
- `docs/order-system/TIMELINE_SPEC.md` —— 产品规格（840 行）
- `docs/order-system/TIMELINE_VERIFICATION.md` —— 独立验收 round 1（492 行）+ 复验 round 2（至 556 行）
