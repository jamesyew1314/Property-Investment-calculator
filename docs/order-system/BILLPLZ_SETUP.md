# Billplz 线上收款接入步骤（Phase A）

> 已实现：后台“生成付款链接”、客户门户“立即付款（FPX）”、Billplz 回调自动标记已付款。
> 当前状态：**代码已上线，但网关未配置**——未配置时接口返回 `503 gateway_not_configured`，页面按钮不显示付款链接。

## 1. 你需要做的事（一次性）

1. 注册 Billplz：https://www.billplz.com/ （先选 **Basic 免费计划**；量大了再升 Standard RM999/年，FPX 费率从 RM1.25 降到 RM0.75）。
2. 进入 Billplz Dashboard → Settings：
   - 创建/选择一个 **Collection**（收款合集），记下 Collection ID。
   - 找到 **API Keys / Secret Key**，记下 Secret Key。
   - 找到 **Webhook / Callback Signature Key**（验签密钥），记下。
3. 把三个值发给我（我只会写进生产服务器 `/srv/fangchan/api/.env`，不会进代码库或聊天记录扩散）。

## 2. 服务器环境变量（我来配置）

```bash
BILLPLZ_API_KEY=<Secret Key>
BILLPLZ_COLLECTION_ID=<Collection ID>
BILLPLZ_MODE=sandbox        # 先用沙箱测试；确认无误后改 production
BILLPLZ_WEBHOOK_KEY=<验签密钥>
```

沙箱 API 域名：`https://www.billplz-sandbox.com`（Billplz 沙箱用注册邮箱登录 sandbox 后创建 Collection 测试）。

## 3. 上线后使用流程

1. 后台 `/admin/orders/` 打开订单 → 点 **“生成付款链接”**。
2. 客户门户 `/client/` 详情页出现 **“立即在线付款（FPX）”** 按钮（未付款时）。
3. 客户付款后，Billplz 回调服务器 → 订单自动变 **已付款**，写事件、开工解锁。
4. 客户门户 30 秒轮询自动刷新为“已付款”。

## 4. 安全与对账

- 收款链接由后台管理员生成，客户不能自己改金额。
- 回调验签：HMAC-SHA256（raw body，`x-signature` 头）；未配置 `BILLPLZ_WEBHOOK_KEY` 时不验签（仅限沙箱）。
- 订单只存 `gateway / gateway_ref / bill_url / mandate_id`，不存卡号。
- 对账以 Billplz 后台报表为准；`site_order_events` 里每条付款都有 `billplz:<bill_id>` 记录。

## 5. 常见问题

- 首月只收 RM2,500（`setup_price`）；月费自动扣款是 Phase B（Curlec e-Mandate）。
- 付款后回调延迟一般在数秒内；客户页面轮询 30 秒，最多等约 1 分钟看到“已付款”。
- 想给客户发手动收款链接但不想开后台？暂时都用后台“生成付款链接”，之后可加自动生成。
