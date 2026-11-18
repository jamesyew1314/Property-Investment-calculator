# 马来西亚线上支付方案调研（2026-11）

> 目的：为“建站客户门户”从人工银行转账升级到线上收款做好准备。
> 现状：首月 RM2,500 + 第 2 个月起 RM199 / RM299 / RM499 包月，Token 费用另计；目前全部人工确认。
> 说明：以下费率为 2026 年公开信息汇总，签约前必须按当时官方价格页与书面报价确认（费率经常调整）。

## 1. 结论速览

| 需求 | 推荐 | 理由 |
|---|---|---|
| 首月 RM2,500 一次性收款 | **Billplz（FPX）** | 平费 RM0.75–1.25/笔，大额单费率最低 |
| 第 2 个月起自动扣款 | **Curlec（e-Mandate）** | 马来西亚唯一深度做银行自动扣款、BNM 监管、可首付+月费一起建单 |
| 兜底 / 门槛低 | SenangPay 或 Stripe Billing | SSM 即可 / 卡片订阅 |
| 电子钱包补充 | TNG eWallet、GrabPay、Boost | 本地客户习惯 |
| DuitNow QR | 聚合商开通（iPay88 / Fiuu / SenangPay）或银行静态 QR | 注意 2026 年新 MDR 规则 |

一句话方案：**Billplz 收首月 + Curlec 收包月自动扣款**；如果只想要一个供应商，选 **Curlec** 全包（FPX + 卡 + 自动扣款），或 **SenangPay**（入门最快、SSM 即可）。

## 2. 各渠道费率对比（2026-10/11 公开数据）

| 供应商 | 月费/年费 | FPX | 本地卡 | 电子钱包/QR | 自动扣款 | 结算 |
|---|---|---|---|---|---|---|
| Billplz | Basic 免费；Standard RM999/年+8% SST | RM1.25 平费（Standard RM0.75） | 1.8%（Standard 1.5%） | 钱包 T+1；DuitNow 实时 | 无原生自动扣款（有 Atome/PayLater 分期 6%/6.5%） | 次日（B2C） |
| Curlec（Razer MS→Fiuu） | Basic 月费极低；setup 费口径不一（RM0 或 RM99，签约前确认） | 1.5% 或 RM1（取高） | 未公布（非最便宜） | 本地钱包 | **e-Mandate 自动扣款、重试、升降级按比例、首付+月费** | T+2 |
| Stripe MY | 无 | 3% + RM1 | 3% + RM1（国际 +1%） | GrabPay 3% | Stripe Billing 订阅、Smart Retries | T+2~7 |
| SenangPay | 无 setup；自服务 | ~2–3% | ~2–3% | FPX/卡/主流钱包 | **有 Recurring API**（需先建产品） | T+1 |
| iPay88 | 按申请报价（未公开） | 未公开 | 未公开 | 钱包 + DuitNow | 订阅能力较全 | 按合同 |
| HitPay | 无 | 按报价 | 1.2% + RM1 | 钱包 | 支持 | 次日 |
| TNG eWallet | 商户入驻免费、30 分钟、免文件、即时通过 | — | — | TNG 钱包 | 无 | 按 TNG 商家中心 |

金额例子：

- 首月 RM2,500：Billplz FPX **RM0.75–1.25**；Curlec FPX RM37.50；Stripe RM76；SenangPay 约 RM50–75。
- 月费 RM299：Billplz 卡 RM5.38；Stripe RM9.97；Curlec FPX RM4.49；SenangPay 约 RM6–9。
- 结论：大额首月用 Billplz 最省；小额月费用谁差距都不大，但自动扣款只有 Curlec / SenangPay / Stripe 能做。

## 3. 自动扣款（包月）深度对比

1. **Curlec e-Mandate（推荐）**
   - BNM 监管、直接接 PayNet；客户授权一次银行扣款（ENRP），之后每月自动扣。
   - 支持首付 + 月费一起建 Mandate（正好匹配我们 RM2,500 + RM199/299/499）。
   - 处理卡过期、扣款失败重试、方案升降级按比例、试用期、webhook 通知每个状态变化。
   - 审批快（约 1–2 个工作日），比传统银行商户号快得多。
   - 注意：setup 费口径不一致（RM0 / RM99），签约前书面确认；卡费率不是最便宜。

2. **SenangPay Recurring**
   - 入门最快：SSM 即可、无 setup、自服务，带 WooCommerce 等插件。
   - Recurring 需先在后台建产品（含 SST 字段），走 Recurring API；不含 Stripe 旧套餐。
   - 费率约 2–3%，比 Curlec 高，但月费金额小，差 RM2–4/单，可接受。

3. **Stripe Billing**
   - 订阅管理最强（Smart Retries、用量计费可对接 Token 费用）。
   - 贵：3% + RM1；FPX 也收同样费率；国际卡 +1%；争议费 RM90。
   - 适合“卡片为主 + 未来出国际”时启用。

## 4. DuitNow QR 与电子钱包（补充渠道）

- **DuitNow QR MDR 新规（2026-10/11，RHB FAQ）**：月营业额 > RM4,000 且使用增值设备（Sound Box、Sound Box Plus、内嵌 QR 卡机、Reflex 桌牌/立牌）才收 MDR；普通静态 QR 不收。整合方式推荐走聚合商（iPay88 / Fiuu / SenangPay），不要直接接银行接口。
- **TNG eWallet**：商户入驻免费、约 30 分钟、免文件、即时通过；MDR 以 TNG 商家中心当前规则为准（未公开，登录查询）。
- **GrabPay**：经 Stripe 收 3%；经 iPay88/Fiuu/SenangPay 按聚合商费率。
- 钱包适合年轻客户快速小额付月费；但会多一个对账渠道，建议二期再上。

## 5. 入驻资质（对我们）

| 供应商 | 资质要求 |
|---|---|
| Billplz | 公司；Basic 免费无 setup；在线注册 |
| SenangPay | SSM 注册即可，自服务快 |
| Curlec | BNM 监管；在线申请，约 1–2 个工作日审批；setup 费待确认 |
| Stripe MY | 公司/业务，标准 KYC；网站需符合要求 |
| TNG | 个人/SME 均可，免文件，即时 |

## 6. 合规与运营要点

- **PCI**：一律用网关托管支付页 / Payment Link，不自己收卡号。
- **PDPA**：支付数据只存网关返回的 `reference/status/amount`，不存卡号；webhook 日志脱敏。
- **SST**：服务费本身按现行规则处理；网关年费（如 Billplz Standard）另加 8% SST。
- **对账**：以网关 webhook + 次日出账报表为准，订单表只记 `gateway`, `gateway_ref`, `bill_url`, `paid_at`, `mandate_id`。
- **退单/争议**：卡争议（Stripe RM90/笔）会损失；FPX/DuitNow 争议少。
- **结算周期**：Billplz B2C 次日；卡 T+2；Curlec T+2；SenangPay T+1——价格页“T+1/T+2”以签约为准。

## 7. 门户集成方案（下一步实现）

### Phase A（现在就能做，风险最低）
- 保留银行转账人工确认。
- 加 **Billplz Payment Link**：后台对首月 RM2,500 一键生成收款链接 → 客户门户“立即付款”按钮 → 支付后 Billplz webhook 回调 `/api/internal/payments/billplz` → 校验签名 → 更新 `payment_status=paid`、`paid_at`、写事件、解锁开工。
- 客户门户仍 30 秒轮询，无需 WebSocket。

### Phase B（包月自动扣款）
- **Curlec e-Mandate**：下单时客户选方案 → 创建 Mandate（首付 RM2,500 + 月费 RM199/299/499）→ 授权后自动扣。
- 失败重试 2 次 → 短信/WhatsApp 提醒 → 30 天未付暂停（与条款一致）。
- Token 费用可做“用量计费账单”，Curlec/Stripe 都支持 usage-based billing，月末按客户后台已显示的用量开单。

### Phase C（多渠道）
- 在 Phase A/B 基础上加：TNG/Boost/GrabPay 钱包 + DuitNow QR（经聚合商），供客户按习惯选择。

### 数据表新增（规划）
```sql
site_orders: gateway text, gateway_ref text, bill_url text, mandate_id text;
token/订阅: billing_period, next_bill_at, dunning_count;
支付事件: payments(id, order_id, gateway, gateway_ref, amount, status, method, payload_digest, created_at);
```

## 8. 建议执行顺序

1. 注册 **Billplz Basic**（免费），先在 sandbox 跑通 Payment Link + webhook（1–2 天）。
2. 上线首月收款 → 客户不再需要手动传银行单据。
3. 申请 **Curlec**，确认 setup 费与费率后，接 e-Mandate 月费自动扣款（1–2 周）。
4. 二期加 TNG/QR；三期按量评估 Stripe（若做国际/卡片为主）。

## 9. 风险

- 费率与 MDR 政策变动频繁（DuitNow 2026 年 10–11 月刚出新规），每次签约前重查官方价目表。
- Curlec setup 费口径不一致，必须书面确认。
- 自动扣款失败率需监控（卡过期、余额不足），要有催缴与暂停流程。
- 退款：首月已开工不退（条款已写明）；网关退款手续费按各网关规则。

## 10. 主要来源

- [Billplz 官方价格](https://main.billplz.com/pricing) / [Billplz Guide Pricing](https://support.billplz.com/guide/pricing)
- [Stripe Malaysia 价格](https://stripe.com/en-my/pricing)
- [Curlec Review (Airwallex, 2026)](https://www.airwallex.com/en-my/blog/curlec-review) / [Curlec vs Fiuu (Airwallex, 2026)](https://www.airwallex.com/my/blog/curlec-vs-fiuu)
- [11 Best Payment Gateways in Malaysia (2026)](https://paymentproviders.io/blog/best-payment-gateways-malaysia)
- [SenangPay Recurring API](https://developer.senangpay.my/integration-api/api-for-recurring-payment.md) / [Create Product Recurring API](https://guide.senangpay.com/createproductrecurringapi)
- [RHB: DuitNow QR MDR FAQ (2026-11-05)](https://www.rhbgroup.com/-/media/Files/others/highlights/announcements/H20261105-2.pdf)
- [TNG eWallet 商户](https://www.tngdigital.com.my/) / [TNG MDR](https://merchantsupport.tngdigital.com.my/hc/en-us/sections/360011829613-Merchant-Discount-Rate-MDR)
- [Unlimit: 8 Best Payment Gateways in Malaysia (2026)](https://www.unlimit.com/blog/payments/payment-gateway-malaysia/)
