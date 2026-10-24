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

---

## 7. 后期迁移到阿里云吉隆坡服务器（预告）

**对现在这个纯静态计算器影响很小**：只要把 `web/` 三个文件拷到新机器的 nginx 目录，配好站点与 HTTPS 即可，代码零改动。

但有 4 个真实影响要先知道：

1. **URL 变了 → 旧分享链接失效**：现在分享用的是 `location.href`。迁移后旧链接应保留 6–12 个月的 301 跳转。
2. **localStorage 不跨域**：语言偏好、以及 Phase 1 的「本地存档方案」只存在原域名下，迁移后用户看不到旧存档 → Phase 1 设计时加「导出/导入 JSON」，迁移前提示用户导出。
3. **部署流程重建**：ssh 主机、目录路径、`no-cache` 配置、备份脚本、证书（Let's Encrypt）都要在新机器重做一次；建议写成 `work/deploy.sh` 一次跑完。
4. **域名与备案**：深圳服务器的 `laoyeshu.cn` 有点餐系统。若只想搬计算器，两个稳妥做法：
   - **A（推荐）**：计算器用独立子域名/新域名直接指向吉隆坡（如 `fangchan.xxx.my`），与点餐系统彻底解耦；
   - **B**：保留 `laoyeshu.cn/static/fangchan/`，在深圳 nginx 上 `proxy_pass` 到吉隆坡机器（保留现有链接与备案，但多一跳）。
   注意：域名指向境外后，原 ICP 备案对「境外部分」不再适用；点餐系统留在深圳则备案不受影响。

**对 Phase 3 的影响（更重要）**：账号、云存档、订阅支付要直接建在吉隆坡服务器上，**不要先在深圳建后端再搬**。理由：
- 马来西亚客户访问延迟低；PDPA（个人资料保护）下数据存在本地更简单；
- 支付网关（Billplz / Stripe Malaysia）与本地银行结算更顺；后续 LHDN 电子发票（e-Invoice）也好接。

**迁移清单（到时照做）**
1. 定域名方案（A 或 B）→ 2. 新机装 nginx + certbot → 3. 拷 `web/`、`chmod 644`、配 `no-cache` → 4. 用 hosts 绑域名先测通 → 5. 切 DNS（TTL 提前调小）→ 6. 旧地址 301 → 7. 更新 `PROJECT.md` 部署章节 + 打 tag `v1.0`。

---

## 8. 吉隆坡服务器设置方案（按 SaaS 规划）

### 8.1 目标架构（单机起步，可平滑升级）

```
Internet
   │ 443/80
   ▼
 nginx（TLS 终止、静态站、反代 /api）
   ├── /                → /srv/fangchan/web        （现在的计算器，静态）
   ├── /app             → 同一静态目录（以后登录后的应用页）
   └── /api/*           → 127.0.0.1:3000  Node 服务（systemd 管理）
                                 │
                                 └── PostgreSQL 16（仅 localhost）
```

- 单台 2C4G 足够 MVP（<100 用户）；用户量上来先**纵向变配**（停机几分钟），再考虑拆库/加节点。
- 不开宝塔等面板，减少攻击面；全部用 apt + systemd。
- 所有服务只监听 localhost，除 80/443 外不对外。

### 8.2 目录与账号

```
/srv/fangchan/
  web/          # 静态站（nginx 直出）
  api/          # Node 源码 + node_modules（systemd 运行）
  backups/      # pg_dump + 站点压缩包（保留 7/30 天）
  logs/         # nginx / api 日志（logrotate）
/etc/nginx/sites-available/fangchan.conf
```

- 建一个普通用户 `deploy`（免 root 日常操作），SSH 只允许密钥。
- API 进程用 `deploy` 运行，systemd unit `fangchan-api.service`，崩溃自动重启。

### 8.3 安装清单（我接手后一次装完）

| 组件 | 用途 | 备注 |
| :--- | :--- | :--- |
| nginx | 静态 + 反代 | 关 server tokens，gzip，缓存策略 |
| certbot | 免费 HTTPS | 自动续期 |
| Node 22 LTS + pnpm | API | NodeSource 源 |
| PostgreSQL 16 | 账号/方案/订阅 | 只监听 127.0.0.1 |
| ufw | 防火墙 | 只开 22(限 IP)/80/443 |
| fail2ban（可选） | 防暴力破解 | 配合密钥登录 |
| unattended-upgrades | 自动安全补丁 | 只装安全更新 |
| logrotate | 日志轮转 | 防磁盘写满 |

### 8.4 备份

- **每日 02:00**：`pg_dump` → gzip → `/srv/fangchan/backups/`（保留 30 天）。
- **每周**：整站 + 数据库打包，`ossutil` 上传到同地域 OSS（异地容灾，几块钱/月）。
- 阿里云**快照策略**：每周一次系统盘快照（保留 4 周）。
- 恢复演练：每季度做一次「从备份恢复到临时实例」。

### 8.5 域名与环境

**域名计划（10/24 定）**：现在计算器放主域名 `kwongthye.com`；开发完成后再迁到子域名 `calc.kwongthye.com`，主域名留给公司主页。

迁移时的注意点：
- 新增 DNS：`calc` → A → `47.254.235.22`（TTL 600）
- nginx 新增 `calc.kwongthye.com` server 块 + 证书（certbot 加 `-d calc.kwongthye.com`）
- 主域名改为公司主页；旧分享链接（`kwongthye.com/?d=...`）用 301 指到 `calc.kwongthye.com` 对应参数
- **localStorage 不跨子域**：语言偏好与 Phase 1 本地存档会“消失”→ Phase 1 必须带「导出/导入 JSON」，迁移前让用户导出


- 生产：`fangchan.<你的域名>`（A 记录 → 吉隆坡 IP）
- 预发（建议）：`staging.fangchan.<域名>`，独立数据库 `fangchan_staging`，同一台机器不同目录；上线前先在 staging 验证。
- 同域部署 `/api`，避免跨域与 Cookie 问题。

### 8.6 与 SaaS 功能的对应

| 功能 | 服务器上需要 |
| :--- | :--- |
| 账号登录 | Node API + Postgres（users 表）+ 短信/邮箱验证码通道 |
| 方案云存档 | plans 表（payload JSONB）+ 备份 |
| 订阅收费 | 支付网关 webhook（Billplz / Stripe）+ HTTPS + 订阅表 |
| 分享链接 | 短链表或 token 表；nginx 反代 /s/:token |
| 邮件通知 | 事务邮件服务（阿里云 DirectMail / Resend） |
| 文件/图片 | 先本地，量大后 OSS |

### 8.7 安全与合规

- SSH：仅密钥、禁用密码、22 端口限你的 IP；`PermitRootLogin prohibit-password`。
- API：限流（rate limit）、输入校验、SQL 参数化；JWT/Session 用 HttpOnly Cookie。
- 数据：只存必要字段；备份加密；PDPA 告知与隐私政策页面。
- 马来西亚开票：后续接 LHDN e-Invoice（SaaS 收入需开电子发票），先人工开票兜底。

### 8.8 上线顺序（建议）

1. **Day 1**：nginx + 静态计算器 + HTTPS → 先把现有站点跑在吉隆坡。
2. **Day 2**：Node + Postgres + systemd + `/api/health` 跑通。
3. **Week 1**：Phase 1（存档 + 分享链接）上线。
4. **Week 2–3**：Phase 2 正式 PDF。
5. 之后：Phase 3 账号/订阅（此时再加邮件与支付）。
