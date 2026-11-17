# 自动 Token 费用计量

> 目标：客户在 `/client/` 看到开发过程中实际消耗的 token 费用，而不是管理员手填的流水。
> 状态：已上线 API、DSH session 扫描器和客户门户；需要为每个订单配置 workspace 后启动 meter。

## 1. 组成

```text
DSH session JSON (~/.dsh/storages/session_projcache/sessions)
        │  只读 tokenUsage / model / workingDirectory
        ▼
work/token-meter.js  ──POST──▶  /api/internal/token-usage
        │                       （x-meter-key + TOKEN_METER_KEY）
        ▼
token_usage 表  ──▶  /api/client/token-usage
                           /api/client/orders/:id/token-usage
        ▼
客户 /client/ 每 30 秒刷新：累计费用、本月费用、token 数、明细
```

## 2. 计价

- 模型：`deepseek-flash`
- 官方价（USD / 1M tokens，2026-11）：
  - off-peak：input miss `$0.15`、cache hit `$0.003`、output `$0.60`
  - peak：input miss `$0.30`、cache hit `$0.006`、output `$1.20`
- peak：UTC 周一至周五 `01:00–04:00`、`06:00–10:00`
- USD→MYR：`USD_MYR`，生产默认 `4.4`
- 官方价格：https://api-docs.deepseek.com/quick_start/pricing/

> 未做中国节假日日历；节假日按工作日估算，可能略高。汇率和价格会变，改 `USD_MYR` / `token-usage.js` 前先确认。

## 3. 配置订单 → workspace

每个客户开发目录必须唯一，例如：

```text
/Users/huangminming/clients/ORD-261117-ABCD
```

启动 meter 时直接传：

```bash
cd "/Users/huangminming/Pik kwong Lau"
TOKEN_METER_KEY="$(cat .secrets/token_meter_key)" \
  node work/token-meter.js \
  --order ORD-261117-ABCD \
  --workspace /Users/huangminming/clients/ORD-261117-ABCD \
  --interval 30
```

后台运行：

```bash
nohup env TOKEN_METER_KEY="$(cat .secrets/token_meter_key)" \
  node work/token-meter.js --order ORD-... --workspace /path --interval 30 \
  > /tmp/token-meter.log 2>&1 &
```

也可以用配置文件（`work/token-meter.config.json`，已 gitignore）：

```json
{
  "api_base": "https://kwongthye.com",
  "orders": [
    { "order_no": "ORD-261117-ABCD", "workspace": "/Users/huangminming/clients/ORD-261117-ABCD" }
  ]
}
```

```bash
TOKEN_METER_KEY="$(cat .secrets/token_meter_key)" node work/token-meter.js
```

## 4. 只算这个订单

meter 只匹配 `workingDirectory` 等于或位于配置 workspace 下的 DSH session。  
不会把别的客户/别的项目算进来。

同一 session 重复推送是**覆盖更新**（`session_id` 唯一），不会重复累计。

## 5. 客户看到什么

- `开发 Token 费用`：累计 RM、本月 RM、token 总数
- 明细：模型、tokens、费用、时间
- 每 30 秒刷新；不是 WebSocket，延迟最多约 30–60 秒
- 人工 `token_ledger` 仍保留为“Token 人工调整”，不再作为客户主显示

## 6. 安全

- `TOKEN_METER_KEY` 只在生产 `.env` 和本机 `.secrets/token_meter_key`
- 内部接口：`POST /api/internal/token-usage`
- `x-meter-key` 常量时间比较
- 不记录 raw key / session 对话内容
- `.secrets/` 和 `token-meter.config.json` 已 gitignore

## 7. 限制

- 只支持 DSH session（当前开发方式）；Claude/其他工具需要另写 adapter
- DSH session 必须在本机 `~/.dsh` 下；远程开发机要另跑 meter
- 没有自动启动守护进程；需要手动 `nohup` 或 launchd
- 没有 token 预算/超额停机（下一阶段）
- 价格/汇率是估算，最终以 DeepSeek 账单为准


## 8. macOS 自动启动（已配置）

已创建 LaunchAgent：

```text
~/Library/LaunchAgents/com.roofx.token-meter.plist
```

它登录后自动运行：

```bash
/bin/bash "<project>/work/token-meter-launchd.sh"
```

wrapper 会：

- 读取 `.secrets/token_meter_key`
- 读取 `work/token-meter.config.json`
- 每 30 秒扫描 DSH session
- 把用量推到生产
- 退出/崩溃后 launchd 自动重启

查看状态：

```bash
launchctl print gui/$(id -u)/com.roofx.token-meter
tail -f ~/Library/Logs/roofx-token-meter.log
tail -f ~/Library/Logs/roofx-token-meter.err.log
```

停止/卸载：

```bash
launchctl bootout gui/$(id -u)/com.roofx.token-meter
```

### 多客户配置

`work/token-meter.config.json` 支持多个订单：

```json
{
  "api_base": "https://kwongthye.com",
  "orders": [
    { "order_no": "ORD-261117-AAAA", "workspace": "/Users/huangminming/clients/AAAA" },
    { "order_no": "ORD-261117-BBBB", "workspace": "/Users/huangminming/clients/BBBB" }
  ]
}
```

保存后不用重启；meter 每轮重新读配置。

**重要**：每个客户必须有独立开发目录；不要把两个客户放在同一个 workspace，否则会归到同一个订单。
