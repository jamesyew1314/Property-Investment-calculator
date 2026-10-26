# PropMatch · 智能房源配对

> **把对的房子，推给对的人。**  
> 一个给马来西亚房产中介用的轻量配对工作台：录入客户需求与房源，系统按 **预算、地段、空间、条件、配套、时机** 六个维度打分，并解释每个分数从哪里来；同时用收入 / DSR / 现金反推客户真正买得起多少，帮代理更快连接买家、卖家与合适物业。

- 版本：**v0.1.0**（2026-10-27）
- 技术栈：**Node.js 20+ / 零第三方依赖 / JSON 原子存储 / 原生 ES Modules + 单页前端**
- 测试：**51 项自动化测试全过**（`npm test`）
- 状态：本地可运行；生产部署脚本见 [`deploy/`](deploy/)
- 关联项目：财务公式与 `web/calc/calc.js`、`PROJECT.md` 第 6/7 节同口径
- 运营 / 联络：**THE ROOF REALTY SDN BHD** · E(1)1605/1 · **Andy Lau 刘泌光** REN 32839 · +60 16-528 0918 · andylau.theroof@gmail.com · No 10A, Jalan Sutera Tanjung 8/4, Taman Sutera Utama, 81300 Skudai, Johor · [kwongthye.com](https://kwongthye.com)

---

## 0. 一分钟看懂

中介每天的真实工作流是：**客户在 WhatsApp 说需求 → 代理在多个盘源里凭记忆找房 → 发图 → 带看 → 跟进**。  
痛点不是“没有房源”，而是：

1. 需求散落在聊天记录里，条件记不全；
2. 房源多、时间少，靠记忆配对容易漏；
3. 客户说“我预算 80 万”，但没算过收入能贷多少、现金够不够；
4. 卖家问“我的房有人要吗”，代理只能凭感觉回答；
5. 推荐了却说不清“为什么是这间”，客户不信任。

PropMatch 把这几件事收进一个工作台：

| 角色 | 系统怎么帮 |
| :--- | :--- |
| **买家 / 租客** | 录一次需求 → 自动排出最合适的房源，附「为什么适合」和「需要注意」；一键生成 WhatsApp 推荐文案 |
| **卖家 / 业主** | 每间房源详情页反向排出「最合适的客户」，带分数、预算与可负担性，方便主动出击 |
| **代理** | 今日优先配对、跟进漏斗、待跟进提醒；所有推荐可解释、可回溯；双语（中 / EN） |

**差异化**：不是另一个房产门户，而是「**带分析、可解释、能直接跟进**」的中介配对层。  
它复用本项目已有的马来西亚购房费用与贷款公式（SPA/LA 律师费、印花税、估价费、等额本息、DSR 可负担性），把“配对”直接接到“客户到底买不买得起”。

---

## 1. 快速开始（本地 2 分钟）

### 1.1 启动

```bash
cd match-platform
node server.js
# 打开 http://127.0.0.1:4100
```

无需 `npm install`（没有任何第三方依赖），只需 Node.js **20 或以上**。

### 1.2 演示账号

首次启动会自动写入演示数据（19 条房源、10 组买家/租客需求、8 条跟进记录）：

```text
邮箱：demo@propmatch.my
密码：demo1234
```

也可以直接打开：

```text
http://127.0.0.1:4100/?demo=1
```

`?demo=1` 会自动登录演示账号并打开工作台（依赖 `SHOW_DEMO=1`，默认开启；生产环境请关闭，见 §8）。

### 1.3 跑测试

```bash
cd match-platform
npm test
```

等价于 `node --test test/*.test.js`。当前 **51 项**：金融公式 10、配对引擎 21、API/权限 12、文案与 i18n 8。

### 1.4 重置演示数据

- 网页：`设置与说明 → 重置演示数据`（仅演示账号）；
- 命令行（先停服务）：

```bash
cd match-platform
DATA_DIR=./data npm run seed
```

### 1.5 环境变量

| 变量 | 默认 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `4100` | HTTP 端口 |
| `HOST` | `0.0.0.0` | 监听地址；本机可设 `127.0.0.1` |
| `DATA_DIR` | `./data` | `db.json` 与会话密钥目录 |
| `SESSION_SECRET` | 自动生成到 `data/.session-secret` | 正式环境建议显式设置 32+ 字节随机值 |
| `COOKIE_SECURE` | 关闭 | 生产 HTTPS 必须设 `1` |
| `SEED_DEMO` | 开启 | 空库时是否写入演示数据；生产可设 `0` |
| `SHOW_DEMO` | 开启 | 是否展示演示账号与 `?demo=1` 自动登录；**生产设 `0`** |
| `ALLOW_DEMO_RESET` | 关闭 | 是否允许非演示账号调用重置接口（不建议） |

---

## 2. 功能地图

| 模块 | 已实现 |
| :--- | :--- |
| **工作台** | 4 个 KPI、今日优先配对（分数 + 紧迫度 + 跟进到期排序）、即将跟进、漏斗、近 7 天跟进量、需求热度、最近动态 |
| **客户需求** | 买/租、自住/投资、预算上下限、可上浮幅度、区域多选、房型、房间/浴室/面积/车位/楼龄、产权/装修/屋况偏好、必备/加分/避雷标签、严格字段、时间表、来源、下次跟进、财务能力（收入/负债/现金/DSR/利率/年限/贷款成数） |
| **房源库** | 出售/出租、价格/可议价、房型、区域/地址/坐标、规格、产权/装修/屋况/建成年份、卖点标签、照片（URL/组图）、业主与委托类型/佣金/到期日、可入住日期 |
| **配对** | 需求→房源、房源→需求（反向）、六维可解释评分、硬门槛、近似匹配、资料完整度、优先级档案、今日优先 |
| **可负担性** | 收入 × DSR − 负债 → 月供 → 可贷金额；再以首付 + 买入费用所需现金反推“现金可支撑房价”，两者取低 |
| **房源分析** | 买入成本明细（SPA 律师费/印花税/杂费/SST、估价费、LA 律师费/印花税/杂费/SST）、预估月供、首付、所需现金、每平方尺价、同区参考 |
| **跟进** | 收藏、已推荐、已看房、已出价、成交、未成交、不合适；备注；撤销；漏斗计数 |
| **客户沟通** | 一键生成双语 WhatsApp 文案（房源摘要 + 匹配点 + 注意事项 + REN/公司签名 + 免责声明），复制或打开 `wa.me` |
| **数据** | 一键导出 JSON（房源/需求/跟进/动态），演示数据重置 |
| **体验** | 中/英切换（全站 587 个词条，双字典同步）、手机底部导航、响应式、评分明细弹窗、图片查看器 |
| **账号** | 邮箱 + 密码注册/登录/退出；scrypt 哈希；HMAC 会话；改密即时撤销旧会话；账号数据隔离 |

---

## 3. 五分钟上手流程

1. **录需求**：点「新增需求」，填客户称呼、预算、区域、房型；可选填收入/负债/现金，右侧会实时显示“可负担约 RM X”。
2. **看今日优先**：工作台按 `匹配分 + 客户紧迫度 + 跟进到期` 排出组合；每张卡直接显示两三条「为什么」。
3. **看评分明细**：点分数环，查看六个维度的得分、权重、加分/扣分项、资料缺口。
4. **发 WhatsApp**：点「发 WhatsApp」→ 预览文案 → 复制或打开 `wa.me`；系统不会自动群发。
5. **记录跟进**：点「跟进」选择状态并写备注；工作台漏斗与待跟进列表即时更新。
6. **反向找客户**：打开房源详情 → 「适合的客户」按客户需求反向打分；卖家问“有人要吗”时可直接给出名单与理由。
7. **导出备份**：设置页「导出全部资料（JSON）」。

---

## 4. 配对算法（可解释）

### 4.1 第一层：硬门槛（不合格不进入推荐）

| 门槛 | 规则 |
| :--- | :--- |
| 意向 | 出售 ↔ 买；出租 ↔ 租；不交叉 |
| 房源状态 | 只有在售/在租房源进入推荐；已售、已租、已订、暂不出售进入「近似匹配」并说明原因 |
| 房型 | 客户指定房型时，房型必须在列表内 |
| 区域 | 客户指定区域时：完全匹配得满分；同一「区群」（如 Mount Austin ↔ Austin Heights ↔ Setia Indah）可进入，但降为 0.65；否则淘汰 |
| 预算 | 售价/月租 > 预算上限 ×(1+可上浮%) 时淘汰；在上浮范围内扣分保留 |
| 避雷标签 | 命中任一避雷（如水患风险、底层、繁忙嘈杂）直接淘汰 |
| 严格字段 | 客户勾选「必须」的产权/装修/房间/浴室/面积/配套，不符合即淘汰；不勾选则只扣分 |

> 近似匹配（near miss）默认只展示 `nearness ≥ 60` 的房源：`nearness = 加权分 − 12 × 未满足门槛数`，避免把“差很远”的房源硬塞给代理。

### 4.2 第二层：六维加权评分（0–100）

| 维度 | 均衡 | 预算优先 | 地段优先 | 空间优先 | 说明 |
| :--- | ---: | ---: | ---: | ---: | :--- |
| 预算 Budget | 25 | 35 | 20 | 15 | 是否在预算内；超预算按上浮比例加速扣分；低于预算下限提示“可能规格不符”；可议价 +0.03 |
| 地段 Location | 20 | 15 | 35 | 15 | 完全匹配 1.0；同区群 0.65；其他淘汰 |
| 空间 Space | 20 | 15 | 15 | 35 | 房间 45%、浴室 30%、面积 25%；不足按比例扣分；数据缺失记「待确认」 |
| 条件 Fit | 15 | 15 | 10 | 15 | 产权、装修、屋况、车位、楼龄；产权不符有额外 −10 分惩罚 |
| 配套 Amenities | 15 | 15 | 15 | 15 | 必备标签覆盖率 75% + 加分配套 25%；避雷直接淘汰 |
| 时机 Readiness | 5 | 5 | 5 | 5 | 可入住时间、房源新鲜度、客户时间表；委托过期提示 |

**总分**：

```text
score = Σ(weight_i × score_i) + penalties
      = 预算得分 × 25 + 地段得分 × 20 + 空间得分 × 20
      + 条件得分 × 15 + 配套得分 × 15 + 时机得分 × 5  （均衡档案）
```

- 每维 `score_i ∈ [0,1]`；`weight` 合计 100。
- 产权不符（客户明确要永久/租赁，但房源相反）即使客户放宽为“不强制”，仍额外扣 **10 分**，因为产权无法通过装修改变。
- 等级：A+ ≥90、A ≥80、B+ ≥70、B ≥60、C ≥50、D <50。

**为什么不直接给“100 分 = 保证成交”？**  
分数只代表「已知资料与客户条件的匹配度」，不代表产权清晰、贷款批核、现场状况或价格谈判结果。界面同时显示资料完整度，并保留免责声明。

### 4.3 资料完整度（confidence）

```text
confidence ≈ 45% × 需求关键字段覆盖率 + 55% × 房源关键字段覆盖率
```

- 需求：预算、区域、房型、房间数、面积、配套偏好、收入、联系方式；
- 房源：价格、区域、房型、房间、浴室、面积、产权、装修、标签、建成年份、坐标；
- 不足不会被隐藏，而是在「待确认」里列出，例如「房源产权待补」「客户收入未填」。

### 4.4 今日优先排序

```text
priority = 匹配分
         + 时间表加分（1 个月内 +3；1–3 个月 +1.5；3–6 个月 +0.5）
         + 跟进到期加分（到期/逾期 +1.5）
```

每个需求最多展示 2 条，避免刷屏；已标记「成交 / 未成交 / 不合适」的组合不再出现。

### 4.5 可负担性（与计算器同口径）

```text
月供上限     = 月净收入 × DSR − 每月负债
可贷金额     = 月供上限 × (1 − (1 + r)^−n) / r
按贷款可买   = 可贷金额 ÷ 贷款成数
按现金可买   = 解方程：现金 = 房价 ×(1−成数) + 买入费用(房价)
可负担房价   = min(按贷款可买, 按现金可买)
```

- 买入费用用 `lib/finance.js`：SPA 律师费 + 印花税 + 杂费 + 8% SST + 估价费 + LA 律师费 + 贷款印花税 0.5% + 杂费 + SST；
- 默认 65% DSR、4.3%、30 年、90% 贷款；客户可在表单里改；
- **现金未填**时只按贷款能力估算，并明确提示“首付与买入费用仍需现金”；**现金填 0**则不会假装买得起；
- 租房用「月租 ÷ 收入」与建议上限（默认 30%）比较。

**回归数字**（与 `PROJECT.md` / `web/test.js` 一致）：

| 项目 | 结果 |
| :--- | ---: |
| SPA 1.6M 法定费用合计 | **RM 76,630** |
| 贷款 765k 法定费用合计 | **RM 18,767** |
| 720k / 4.5% / 30 年第 60 个月余额 | **RM 656,337.29** |
| 收入 12k / 负债 1.2k / 65% DSR / 90% 贷款 / 现金 180k 可负担 | **RM 1,076,000** |

> 金额在当前原型中以 Number（RM）参与计算、显示时四舍五入到分；迁移 PostgreSQL 时应改为 `NUMERIC(18,2)` 并用 Decimal 运算，历史数据保持字符串精度。

---

## 5. 数据模型（JSON）

运行数据默认存放在 `data/db.json`，原子写入（临时文件 + rename）。结构：

```json
{
  "schema": 1,
  "seq": {"users": 1, "listings": 19, "requirements": 10, "actions": 8, "activities": 8},
  "users": [],
  "listings": [],
  "requirements": [],
  "actions": [],
  "activities": []
}
```

### 5.1 users

`id, name, email, phone, company, ren, role, session_version, password_hash, created_at, updated_at`

- `password_hash`：scrypt（salt:hash），永不返回前端；
- `session_version`：改密时 +1，旧 Cookie 立即失效；
- `role`：首个账号为 `owner`，其余 `agent`（v0.1 暂无团队权限差异）。

### 5.2 listings（房源）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `intent` | `sale` / `rent` | 出售 / 出租 |
| `title`, `title_en` | string | 中/英文名称 |
| `type` | enum | terrace / semi_d / bungalow / townhouse / condo / apartment / shoplot / office / land |
| `area`, `address`, `city` | string | 区域、地址、城市 |
| `lat`, `lng` | number | 坐标（用于区群距离） |
| `price` | number | 售价（RM）或月租（RM/月） |
| `negotiable` | boolean | 可议价 |
| `beds`, `baths`, `built_up`, `land_area`, `storeys`, `carparks`, `floor_level` | number/string | 规格 |
| `tenure` | `freehold` / `leasehold` | 产权 |
| `year_built`, `furnishing`, `condition` | number/enum | 楼龄与状况 |
| `tags` | string[] | 卖点/风险标签（见 `lib/taxonomy.js`） |
| `photo`, `photos` | string / string[] | 图片 URL（站内 `/demo/...` 或 https） |
| `seller_name`, `seller_phone` | string | 业主 |
| `mandate` | `exclusive` / `open` / `cobroke` | 委托类型 |
| `commission_pct`, `mandate_expiry`, `available_from` | number/date | 佣金与日期 |
| `status` | `available` / `reserved` / `sold` / `rented` / `off_market` | 状态 |
| `ref` | string | 自动编号 `L-0001` |

### 5.3 requirements（客户需求）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `client_name`, `phone`, `whatsapp`, `email` | string | 客户资料 |
| `intent` | `buy` / `rent` | 买 / 租 |
| `purpose` | `own` / `invest` | 自住 / 投资（用于文案与优先级） |
| `budget_min`, `budget_max`, `stretch_pct` | number | 预算与可上浮 % |
| `areas`, `types` | string[] | 可接受区域/房型 |
| `beds_min`, `baths_min`, `built_up_min`, `carparks_min`, `max_age_years` | number | 最低规格 |
| `tenure_pref`, `furnishing_min`, `condition_pref` | enum | 偏好 |
| `must_tags`, `pref_tags`, `avoid_tags` | string[] | 必备/加分/避雷 |
| `strict_fields` | string[] | 哪些字段视为“必须” |
| `timeline` | `urgent` / `1_3m` / `3_6m` / `6m_plus` / `browsing` | 时间表 |
| `priority` | `balanced` / `value` / `location` / `space` | 权重档案 |
| `source`, `status`, `notes`, `follow_up` | enum/string/date | 来源、状态、备注、下次跟进 |
| `finance` | object | income, commitments, cash, dsr, rate, years, margin, rent_ratio |
| `ref` | string | 自动编号 `R-0001` |

### 5.4 actions（跟进）

`requirement_id, listing_id, status, note, updated_at`

状态：`shortlisted` / `sent` / `viewed` / `offer` / `won` / `lost` / `rejected`。  
同一「需求 × 房源」只保留一条最新记录；删除需求/房源会级联删除跟进。

### 5.5 activities（动态）

仅记录操作类型与摘要，用于工作台“最近动态”；不记录密码、完整聊天内容等敏感信息。

---

## 6. API 一览

所有接口返回 JSON；错误格式 `{"error":{"code","message","fields?"}}`。

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/api/health` | 健康检查（公开） |
| GET | `/api/meta` | 字典（公开） |
| GET | `/api/public-config` | 演示配置（公开） |
| POST | `/api/auth/register` | 注册并登录 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/me` | 当前用户 |
| PATCH | `/api/me` | 改资料 |
| POST | `/api/me/password` | 改密（撤销旧会话） |
| GET | `/api/bootstrap` | 一次性取用户 + 字典 + 房源 + 需求 + 跟进 + 摘要 |
| GET/POST | `/api/listings` | 房源列表（支持 q/intent/status/type）/ 新建 |
| GET/PATCH/DELETE | `/api/listings/:id` | 房源详情（含反向匹配、买入成本、同区参考）/ 修改 / 删除 |
| GET/POST | `/api/requirements` | 需求列表 / 新建 |
| GET/PATCH/DELETE | `/api/requirements/:id` | 需求详情（含匹配/近似/可负担性）/ 修改 / 删除 |
| GET | `/api/board` | 今日优先配对（`intent`、`minScore` 可选） |
| GET | `/api/dashboard` | 工作台统计、漏斗、动态 |
| GET | `/api/market` | 同区参考（area/type/intent） |
| POST | `/api/actions` | 新建/更新跟进 |
| DELETE | `/api/actions/:id` | 撤销跟进 |
| GET | `/api/activities` | 最近动态 |
| GET | `/api/export` | 导出全部资料 JSON |
| POST | `/api/demo/reset` | 重置演示数据（演示账号） |

鉴权：`pm_session` HttpOnly Cookie；密码 scrypt；Cookie 由 HMAC-SHA256 签名，改密后 `session_version` 失效旧 Token。  
同源写操作会校验 `Origin`（有 Origin 时）；登录限流 10 次 / 10 分钟 / IP+邮箱。

---

## 7. 测试与验收

### 7.1 自动化

```bash
npm test
```

| 文件 | 覆盖 |
| :--- | :--- |
| `test/finance.test.js` | 法定费用、印花税、SST、等额本息、余额、反推贷款、可负担性、租房押金 |
| `test/engine.test.js` | 完全匹配、邻近区域、预算上浮/超限、房型、避雷、已售、严格字段、优先级档案、资料完整度、需求→房源、房源→需求、今日优先、行情、房源洞察 |
| `test/api.test.js` | 健康检查、登录、未登录 401、bootstrap、需求/房源详情、看板、校验错误、CRUD + 跟进、账号隔离、改密撤销、演示重置、导出 |
| `test/i18n.test.js` | 中英键一致、引擎原因码全覆盖、金额/百分比/标签本地化、头像、电话、WhatsApp 文案 |

### 7.2 手工验收清单（已完成）

- 桌面 1440×1100：登录、工作台、需求列表/详情、房源列表/详情、配对中心、设置；
- 手机 390×844：工作台、需求详情、表单全屏、底部导航、登录；
- 中/英切换：所有页面文案、表单、详情、评分弹窗、WhatsApp 文案；
- 交互：搜索（保留焦点）、买/租筛选、强匹配筛选、评分弹窗、跟进保存、收藏切换、图片查看、表单校验、删除确认、退出；
- 0 个浏览器 console error。

---

## 8. 部署（生产建议）

详细步骤、systemd/nginx/备份脚本见 [`deploy/README.md`](deploy/README.md)。核心：

```bash
# 服务器（Ubuntu 24.04，Node 20+）
sudo useradd --system --home /srv/propmatch --shell /usr/sbin/nologin propmatch
sudo mkdir -p /srv/propmatch /srv/propmatch/data
sudo rsync -a --exclude data ./ /srv/propmatch/
sudo cp deploy/.env.example /srv/propmatch/.env
# 编辑 .env：SESSION_SECRET、COOKIE_SECURE=1、SHOW_DEMO=0、SEED_DEMO=0（可选）
sudo chown -R propmatch:propmatch /srv/propmatch
sudo cp deploy/propmatch.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now propmatch
# nginx（match.kwongthye.com）→ certbot --nginx
curl -s https://match.kwongthye.com/api/health
```

**上线检查**

- [ ] `COOKIE_SECURE=1`、HTTPS 正常；
- [ ] `SHOW_DEMO=0`（关闭演示账号与 `?demo=1` 自动登录）；
- [ ] `SESSION_SECRET` 为随机 32+ 字节；
- [ ] 数据目录只有服务账号可读写（750 / 600）；
- [ ] 每日备份 + 每月恢复演练；
- [ ] 服务器只跑一个进程（JSON 存储不支持多进程并发写）；
- [ ] 防火墙仅开 80/443/SSH；服务只监听 127.0.0.1:4100，由 nginx 反代；
- [ ] 隐私政策/使用条款/免责声明与公司信息（REN、E 编号）已确认。

---

## 9. 安全、隐私与合规

| 项 | 做法 |
| :--- | :--- |
| 密码 | scrypt（随机 salt，64 字节）+ timingSafeEqual |
| 会话 | HMAC-SHA256 签名，HttpOnly / SameSite=Lax / Secure（生产）；14 天 |
| 改密撤销 | `session_version` 递增，旧 Cookie 立即 401 |
| 登录限流 | 10 次 / 10 分钟 / IP+邮箱 |
| 数据隔离 | 所有查询按 `owner_id` 过滤；跨账号访问返回 404 |
| XSS | 前端统一 `esc/attr`；CSP `script-src 'self'`；无内联脚本 |
| CSRF | SameSite=Lax + 写操作 Origin 校验 |
| 路径穿越 | 静态文件 resolve 后必须位于 `public/`；只额外暴露 `lib/finance.js` |
| 数据导出 | 本人 JSON；不含密码哈希 |
| PDPA | 客户资料仅存于账号下；备注提醒不要存身份证/银行账号；导出与删除由代理控制 |
| BOVAEA | REN 编号用于对外文案；系统不替代持牌估值/法律意见 |
| 免责 | 所有价格、月供、可负担性与回报为内部估算，不构成银行批贷、正式估值或投资建议 |

**已知安全/运营缺口（v0.1）**

- 没有邮箱验证、忘记密码、2FA、审计日志（后续版本）；
- 会话是无状态 Cookie；登出只清客户端 Cookie，Token 在 14 天内理论上仍有效（改密会撤销）；
- JSON 单进程存储，不适合多实例/大规模并发；
- 没有自动 WhatsApp 发送（只生成文案并打开 `wa.me`）；
- 没有字段级加密；请勿在备注存敏感个资。

---

## 10. v0.1 范围与限制

**做**：中介单人/小团队工作台；买家/租客需求；卖家房源；可解释配对；可负担性；跟进漏斗；双语；导出。

**不做**（明确排除，避免范围膨胀）：

- 房产门户/公众流量站；
- 电子签、SPA/租约文件包；
- 佣金分账/团队抽成账本；
- 自动估值报告（AVM）与对外叫价建议；
- 自动 WhatsApp 群发/爬取门户；
- 原生 App（先 Web，手机浏览器可用）；
- 马来语 UI（数据字段可存中文/英文；BM 在路线图）；
- 图片上传到服务器（当前用图片 URL / 站内 `/demo/`）。

---

## 11. 路线图

| 阶段 | 内容 | 价值 |
| :--- | :--- | :--- |
| **v0.2（1–2 周）** | WhatsApp Cloud API 模板消息、跟进提醒（每日摘要）、CSV 导入/导出、团队角色（owner/agent/read-only）、密码重置/邮箱验证 | 日常真正可用 |
| **v0.3（3–4 周）** | 客户分享页（只读提案链接）、照片上传与压缩、价格历史/降价提醒、盘源批量导入（PropertyGuru/Mudah CSV/OCR 房源表） | 减少录入、提升专业度 |
| **v0.4（1–2 月）** | Co-broke 交换（已验证房源 + 分佣约定 + 成交记录）、卖家端只读页、佣金账本、文件包 | 从工具走向网络 |
| **v1.0** | PostgreSQL + 多租户 + 计费（RM49–99/月，团队版 RM199–499/月）、审计日志、备份即服务 | SaaS |
| **AI** | 自然语言建需求（“80 万，Austin 区，四房，年底前”）、聊天摘要、语义备注搜索、comps/参考价区间 | 零录入、更快 |

> 依据 `docs/SaaS商业方案_Malaysia_v1.md`：不做“另一个门户”；用「带分析的房源 + 配对 + 跟进」切入，先用真实成交/租金数据形成飞轮，再考虑 co-broke 与 AVM。

---

## 12. 目录结构

```text
match-platform/
├── server.js                 # HTTP 服务、路由、鉴权、静态资源
├── lib/
│   ├── taxonomy.js           # 区域/房型/标签/权重档案/状态字典
│   ├── finance.js            # 法定费用、等额本息、DSR 可负担性（与 web/calc 同口径）
│   ├── engine.js             # 硬门槛 + 六维评分 + 近似匹配 + 行情 + 洞察
│   ├── validate.js           # 输入清洗与字段级校验
│   ├── store.js              # JSON 原子存储、序号、动态
│   ├── auth.js               # scrypt、HMAC 会话、session_version、限流
│   ├── seed.js               # 演示数据（19 房源 / 10 需求 / 8 跟进）
│   └── http-error.js         # 统一错误
├── public/
│   ├── index.html            # SPA 壳
│   ├── app.js                # 状态、路由、登录、CRUD、事件
│   ├── views.js              # 页面渲染
│   ├── forms.js              # 表单、评分明细、跟进、WhatsApp、账号
│   ├── ui.js                 # 图标、评分环、弹窗、toast
│   ├── format.js             # 金额/日期/标签/原因文案本地化
│   ├── i18n.js               # 中英双字典（587 键）
│   ├── style.css             # 设计系统（navy/gold/cream）
│   └── demo/                 # 演示房源照片
├── test/                     # 51 项测试
├── scripts/reset-demo.js     # 命令行重置演示数据
├── deploy/                   # systemd / nginx / 备份 / 上线说明
├── data/                     # 运行时（git 忽略）
├── package.json
└── README.md
```

**维护约定**

- 新增区域/标签：改 `lib/taxonomy.js`，前端自动从 `/api/meta` 读取；种子数据无需改；
- 调整权重：改 `WEIGHTS`，并在 README/产品说明同步；测试会锁定排序行为；
- 新增引擎原因码：必须同时加 `NOTE_CODES`、`i18n.js` 的 `note.*` 中英文案（`test/i18n.test.js` 会拦截缺键）；
- 金额/日期：沿用 `YYYY-MM-DD` 与 RM；迁移数据库时按 `NUMERIC(18,2)` / `DATE`；
- 发布：`npm test` 全过 → 浏览器 QA（桌面 + 手机 + 双语）→ 部署 → 健康检查 → 备份验证。

---

## 13. 与现有项目的关系

- **财务公式**：`lib/finance.js` 与 `web/calc/calc.js`、`PROJECT.md` 第 6/7 节一致；T21（720k / 4.5% / 30 年第 60 个月余额 656,337.29）作为回归测试，防止两套系统漂移。
- **品牌**：延续 KWONG THYE 光泰 / THE ROOF REALTY 的 navy/gold/cream 与名片信息（Andy Lau 刘泌光 · REN 32839 · +60 16-528 0918 · kwongthye.com）。
- **数据**：独立 `match-platform` 应用，不与计算器/视频平台的数据库耦合；未来可与 `video-platform` 的 `listings` 表做盘源同步（同一物业：视频素材 ↔ 配对房源）。
- **上下文**：项目根 `PROJECT.md` 第 2 节已加入本目录入口；产品说明见 [`产品说明.md`](产品说明.md)。

---

## 14. 变更记录

| 日期 | 版本 | 变更 |
| :--- | :--- | :--- |
| 2026-10-27 | v0.1.0 | 首个可用版本：需求/房源 CRUD、可解释六维配对、反向配对、可负担性、今日优先、跟进漏斗、双语、图库、导出、账号与隔离、51 项测试、部署脚本 |
