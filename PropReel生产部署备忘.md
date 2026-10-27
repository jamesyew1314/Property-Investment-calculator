# PropReel AI · 生产部署备忘

> 部署时间：2026-10-26 ｜ 服务器：47.254.235.22（吉隆坡，Ubuntu 24.04，Node 22.23.4）

## 一、访问地址

| 项目 | 地址 |
|---|---|
| 平台入口 | **https://kwongthye.com/app**（自动跳登录页） |
| 登录 | https://kwongthye.com/app/login |
| 注册 | https://kwongthye.com/app/register |
| 工作台 | https://kwongthye.com/app/dashboard |
| 管理后台 | https://kwongthye.com/app/admin |

**管理员账号**：`andy@propreel.my` / `Propreel2026!`（role=admin，不扣额度）

> ⚠️ 首次上线请尽快改密码（暂未做改密功能，可用 SQL 直接改 `password_hash`）。

## 二、服务器架构

```
nginx (80/443) ──/app/*──▶ video-platform (Next.js, :3100, systemd)
                                │
                                ├── SQLite: /opt/video-platform/data/platform.sqlite
                                ├── 素材:   /opt/video-platform/data/uploads/
                                ├── 成片:   /opt/video-platform/data/outputs/
                                │
video-worker (systemd) ─────────┘
    └── 调用 /opt/video-automation（Remotion 模板 + ffmpeg 合成音频）
```

两个 systemd 服务：
- `video-platform.service` — Next.js Web/API（ExecStart: npm run start）
- `video-worker.service` — 渲染 Worker（轮询 jobs 队列）

## 三、关键配置

| 文件 | 说明 |
|---|---|
| `/opt/video-platform/.env.local` | `SESSION_SECRET`（随机）、`ADMIN_EMAIL=andy@propreel.my` |
| `/etc/systemd/system/video-platform.service` | 环境：`NODE_ENV=production` `PORT=3100` `NEXT_PUBLIC_BASE_PATH=/app` |
| `/etc/systemd/system/video-worker.service` | 渲染 Worker |
| `/etc/nginx/sites-enabled/fangchan` | `location /app/` 反代到 127.0.0.1:3100 |
| `/opt/video-automation/.env` | 上游 API keys（DashScope / DeepSeek / 火山方舟） |

> ⚠️ `NEXT_PUBLIC_BASE_PATH=/app` **构建时和运行时都必须设置**，否则路由 404。

## 四、常用运维命令

```bash
# 查看状态
systemctl status video-platform video-worker

# 重启
systemctl restart video-platform
systemctl restart video-worker

# 日志
tail -f /var/log/video-platform.log
tail -f /var/log/video-worker.log

# 数据库
sqlite3 /opt/video-platform/data/platform.sqlite "SELECT id,title_zh,status FROM listings;"
sqlite3 /opt/video-platform/data/platform.sqlite "SELECT id,state,progress,message FROM jobs ORDER BY id DESC LIMIT 5;"

# 手动给客户充值额度（后台按钮也可）
sqlite3 /opt/video-platform/data/platform.sqlite \
  "UPDATE clients SET plan_credits = plan_credits + 5 WHERE email='client@example.com';"
```

## 五、更新代码流程

```bash
# 本地：打包
cd "/Users/huangminming/Pik kwong Lau"
tar czf /tmp/vp-update.tar.gz --exclude=node_modules --exclude=.next --exclude=data \
  -C video-platform app lib worker package.json next.config.mjs tsconfig.json

# 上传
scp -i .secrets/fangchan_key.pem -o StrictHostKeyChecking=no /tmp/vp-update.tar.gz root@47.254.235.22:/tmp/

# 服务器：解压 + 构建 + 重启
ssh root@47.254.235.22 '
  cd /opt/video-platform && tar xzf /tmp/vp-update.tar.gz &&
  NEXT_PUBLIC_BASE_PATH=/app npm run build &&
  systemctl restart video-platform'
```

模板改动（video-automation）同理：打包 src/ + public/audio，上传到 `/opt/video-automation` 后重启 `video-worker`。

## 六、已安装的系统依赖

| 依赖 | 用途 |
|---|---|
| Node 22.23.4 | Next.js + Worker（node:sqlite 需要 22.5+） |
| fonts-noto-cjk + fontconfig | 中文渲染（**缺失会变豆腐块**） |
| Remotion（npm） | 视频渲染（首次渲染自动下载 Chrome headless） |

## 七、验证记录（2026-10-26）

```
✅ 注册/登录（JWT cookie）
✅ 建房源（REN 必填校验）
✅ 上传 6 张照片
✅ 提交中英双语任务
✅ Worker 服务器渲染（约 4 分钟 / 2 语言）
✅ 中文字体正常（"空旷毛坯空间，水泥地+白墙+大窗采光好"）
✅ REN 角标常驻（Andy Lau · REN 32829）
✅ 公网下载成片（7.5MB）+ 封面（1.9MB）
✅ 自动生成 3 平台发布文案
✅ 额度扣减（管理员不扣）
```

## 八、待办

| 项 | 说明 |
|---|---|
| 改密码功能 | 目前只能 SQL 改 |
| Billplz 在线支付 | 需商户号（现在手动充值） |
| WhatsApp 通知 | 需 Business API（现在站内通知） |
| 渲染加速 | 服务器 2 核约 4 分钟/2 语言；可加渲染机或夜间批量 |
| 备份 | 建议每日备份 `data/platform.sqlite` + `data/outputs/` |
