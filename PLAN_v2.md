# 开发方案 v2 · 从「计算器」到「可留档、可发客户、可收费」

> 基线：**v0.32**（git tag `v0.32`，48 项测试全过，线上 https://laoyeshu.cn/static/fangchan/ ）
> 本文只定「下一阶段做什么、怎么做、先做哪个」，确认后按 Phase 动工。

---

## 0. 现状（v0.32 能做什么）

| 能力 | 状态 |
| :--- | :--- |
| Part 1 买入费用（SPA/LA 律师费、估价费自动 + 可手改；购置总费用、首付、cashback、购房现金总额） | ✅ |
| Part 2 年度持有费用（管理费/地税/门牌税/维修/保险/出租中介费；平均利息自动） | ✅ |
| Part 3 投资回报（① Keep & Rent；② Sell Property：Gross Gain、RPGT 老板口径、出售总费用、出售利润/回报率、投资净利润、Total ROI、Total Cost、ROTC） | ✅ |
| 西式金额格式、中英切换、打印 2 页 PDF、WhatsApp/微信/Facebook 分享、手机适配 | ✅ |
| 回归测试 48 项（`node web/test.js`）、`PROJECT.md` 变更记录、文档构建流水线 | ✅ |
| 账号、云存档、正式报价单模板、订阅收费 | ❌ 未做 |

---

## 1. 目标

把「一次性的网页计算器」升级为中介每天能用的工具：**算完能存、能发客户、能打印成正式报价单，最后能按年收费**。

---

## 2. 分期路线（推荐顺序）

### Phase 1 · 存档 + 分享链接（纯前端，2–3 天）

**做什么**
1. **方案存档**：`保存方案`（命名，如「Bukit Jalil 公寓 A」）→ 方案列表（加载/复制/删除），存在浏览器 localStorage。
2. **分享链接**：把当前全部输入编码进 URL（`?d=<base64>`），客户打开就能看到同样结果（只读模式，顶部提示「来自 XX 的估算」）。
3. 分享文字里附上链接（现有 WhatsApp/微信/微信复制自动带上）。

**价值**：中介不用重复输入；客户点开就能看，不需要账号。
**技术**：纯前端，不动后端；URL 长度可控（输入约 20 个字段）。
**风险**：低。localStorage 满了会提示；链接参数做长度校验。

### Phase 2 · 正式 PDF 报价单（1–2 天）

**做什么**
1. **公司抬头设置**：名称、电话、微信、地址、Logo（存本地）→ 打印页头自动显示。
2. 打印页增加：客户名/项目名、日期、免责声明（已有）、**分享链接二维码**。
3. 保持「Part 1 一页 / Part 2+3 一页」的排版。

**价值**：直接打印/存 PDF 发给客户，像正式文件。
**技术**：纯前端 + 二维码库；公司信息存 localStorage。
**风险**：低。

### Phase 3 · 账号 + 云存档 + 订阅（1–2 周）

**做什么**
1. 后端服务（Node + Postgres/SQLite）部署在现有阿里云；登录用手机号验证码（或微信开放平台，需资质）。
2. 方案云端保存、跨设备同步、分享链接短链。
3. 订阅：RM 50/年（Billplz 或 Stripe；先支持手动开通兜底）。
4. 简单后台：谁订了、到期时间。

**价值**：真正可收费的产品。
**技术**：新增后端/数据库/支付回调；不能再用纯静态部署。
**风险**：中高——涉及支付、账号安全、PDPA（马来西亚个人资料保护法）；要单独压测与合规检查。

### Phase 4 · AI 助手（后续）

自然语言输入（「SPA 80 万，贷 90%，租 3 千，五年后卖 95 万」→ 自动填表）与结果解释。接第三方模型 API，按调用量计费。

---

## 3. 明确不做（已拍板）

- 投资人分账（Investor / CapitalTxn / Distribution）
- 电子签
- 原生 App（先 Web）
- 复杂 CRM（客户跟进、佣金结算）

---

## 4. 数据模型草案（Phase 3 才用）

```
user(id, phone, created_at)
plan(id, user_id, name, payload_json, created_at, updated_at)
subscription(id, user_id, status, started_at, expires_at, provider, provider_ref)
share(id, plan_id, token, read_only, created_at, expires_at)
```

`payload_json` = 现有全部输入字段（spa/actual/loan/rate/tenure/…），算法升级时用 `payload.version` 兼容旧方案。

---

## 5. 需要老板确认的 5 件事

1. **先做哪一期？**（推荐 Phase 1）
2. **分享链接给客户看什么**：全部数字（含购入价/利润）还是只显示租金回报与卖出回报？（默认全部，可加「隐藏购入价」开关）
3. **公司抬头信息**（Phase 2 需要）：公司名 / 电话 / 微信 / 地址 / Logo 文件。
4. **是否要账号与云端**（决定要不要动后端，Phase 3）。
5. **域名**：沿用 `laoyeshu.cn/static/fangchan/`，还是单独域名（如 `fangchan.laoyeshu.cn`）？

---

## 6. 工程与发布规则（已生效）

- 每个版本：改 → `node web/test.js`（必须全过）→ 浏览器 QA（0 报错）→ 部署（scp + chmod 644 + sha256 核对）→ `PROJECT.md` 记一笔 → **git commit + tag（v0.xx）**。
- 回滚：`git checkout <tag> -- web/` 后重新部署；服务器另有备份 `/opt/laoyeshu/backups/fangchan_*.tar.gz`。
- 公式改动必须同时改测试与文档；UI 改动不得破坏元素 id（浏览器 QA 会抓）。
