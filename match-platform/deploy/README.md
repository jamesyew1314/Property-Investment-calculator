# PropMatch 上线手册

> 目标：把 `match-platform/` 部署到 `match.kwongthye.com`，HTTPS、单实例、每日备份。  
> 适用：Ubuntu 24.04 + nginx + certbot + Node.js 20+（2C4G 足够）。

---

## 0. 先决条件

- 一台已装好 nginx / certbot 的 Ubuntu 服务器；
- 域名 A 记录：`match.kwongthye.com → 服务器公网 IP`；
- Node.js **20+**（`node -v` 确认；项目零 npm 依赖，无需 `npm install`）；
- 服务器只跑**一个** PropMatch 进程（JSON 单进程存储，不支持多 worker）。

---

## 1. 创建服务账号与目录

```bash
sudo useradd --system --home /srv/propmatch --shell /usr/sbin/nologin propmatch
sudo mkdir -p /srv/propmatch/data /srv/propmatch/backups
sudo chown -R propmatch:propmatch /srv/propmatch
sudo chmod 750 /srv/propmatch /srv/propmatch/data
```

## 2. 上传代码

在本地项目根目录：

```bash
rsync -az --delete \
  --exclude 'data/' --exclude 'node_modules/' --exclude '.env' \
  ./match-platform/ root@SERVER_IP:/tmp/propmatch/
sudo rsync -a /tmp/propmatch/ /srv/propmatch/
sudo chown -R propmatch:propmatch /srv/propmatch
```

> 也可以 `git clone` 后只拷贝 `match-platform/`；不要把 `data/db.json` 覆盖到生产。

## 3. 配置环境变量

```bash
cd /srv/propmatch
sudo cp deploy/.env.example .env
sudo nano .env
```

至少修改：

```env
PORT=4100
HOST=127.0.0.1
DATA_DIR=/srv/propmatch/data
SESSION_SECRET=<openssl rand -hex 32 的输出>
COOKIE_SECURE=1
SEED_DEMO=0
SHOW_DEMO=0
ALLOW_DEMO_RESET=0
```

```bash
sudo chown propmatch:propmatch .env
sudo chmod 600 .env
```

**首次演示**：如果想先给同事看，可临时 `SEED_DEMO=1`、`SHOW_DEMO=1`，演示完改回 `0` 并重启（演示账号仍在库里，但不再显示/自动登录；可手动删除演示用户的数据）。

## 4. 先手动跑一次

```bash
sudo -u propmatch bash -lc 'cd /srv/propmatch && node server.js'
# 另开一个终端：
curl -s http://127.0.0.1:4100/api/health
```

看到 `{"ok":true,...}` 后 Ctrl-C。

## 5. systemd

```bash
sudo cp deploy/propmatch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now propmatch
sudo systemctl status propmatch --no-pager
sudo journalctl -u propmatch -n 50 --no-pager
```

> 若 `node` 不在 `/usr/bin/node`，改 `propmatch.service` 的 `ExecStart`（用 `which node` 查）。

## 6. nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/propmatch
sudo ln -s /etc/nginx/sites-available/propmatch /etc/nginx/sites-enabled/propmatch
sudo nginx -t
sudo systemctl reload nginx

# 申请证书（按提示选择 redirect）
sudo certbot --nginx -d match.kwongthye.com
sudo nginx -t && sudo systemctl reload nginx
```

验证：

```bash
curl -s https://match.kwongthye.com/api/health
curl -sI https://match.kwongthye.com/ | head
```

浏览器打开 `https://match.kwongthye.com/`，注册第一个账号（或按需启用演示账号）。

## 7. 备份（必须）

```bash
sudo crontab -u propmatch -e
```

加入：

```cron
30 3 * * * /srv/propmatch/deploy/backup.sh >> /var/log/propmatch-backup.log 2>&1
```

手动跑一次：

```bash
sudo -u propmatch /srv/propmatch/deploy/backup.sh
ls -lh /srv/propmatch/backups/
```

**恢复演练**（每月一次）：

```bash
sudo systemctl stop propmatch
sudo cp /srv/propmatch/data/db.json /srv/propmatch/data/db.before-restore.json
sudo -u propmatch sh -c 'gzip -dc /srv/propmatch/backups/db-YYYYMMDD-HHMMSS.json.gz > /srv/propmatch/data/db.json'
sudo systemctl start propmatch
curl -s http://127.0.0.1:4100/api/health
# 登录检查最近数据；确认后删除 db.before-restore.json
```

**异地备份**：在 `backup.sh` 末尾启用 OSS/S3 上传（凭据放 `/root/.ossutilconfig` 或实例角色，不要进仓库）。参考 `docs/服务器信息.md` 的现有做法。

## 8. 更新与回滚

```bash
# 更新代码（不覆盖 data/.env）
rsync -az --exclude 'data/' --exclude '.env' ./match-platform/ root@SERVER_IP:/tmp/propmatch/
sudo rsync -a /tmp/propmatch/ /srv/propmatch/
sudo chown -R propmatch:propmatch /srv/propmatch
sudo systemctl restart propmatch
curl -s https://match.kwongthye.com/api/health
```

回滚：

```bash
sudo systemctl stop propmatch
sudo rsync -a /path/to/previous/match-platform/ /srv/propmatch/ --exclude data/ --exclude .env
sudo systemctl start propmatch
```

> 大版本升级前先备份 `data/db.json`；schema 变更需在 `lib/store.js` 增加迁移逻辑并测试旧数据读取。

## 9. 上线检查清单

- [ ] `COOKIE_SECURE=1`，HTTPS 正常，HTTP 301 到 HTTPS；
- [ ] `SHOW_DEMO=0`（`/?demo=1` 不再自动登录）；
- [ ] `SESSION_SECRET` 随机、`.env` 600；
- [ ] `data/` 750，`db.json` 600，只有 `propmatch` 可读写；
- [ ] 只监听 `127.0.0.1:4100`，公网只开 80/443/SSH；
- [ ] `systemctl status propmatch` 正常，`journalctl` 无报错；
- [ ] 注册新账号 → 新增需求/房源 → 配对 → 跟进 → 导出；
- [ ] 手机浏览器打开，底部导航与表单可用；
- [ ] 备份任务已跑通 + 恢复演练通过；
- [ ] 隐私政策/使用条款链接、公司 REN/E 编号、免责声明已确认；
- [ ] 客户资料使用规范（PDPA）已告知代理。

---

## 10. 已知限制

- JSON 单文件存储，**不支持多进程/多实例**；用户量上来后迁移 PostgreSQL（见 README 路线图）。
- 图片只支持 URL；上传功能在 v0.3。
- 没有自动 WhatsApp 发送；只生成文案并打开 `wa.me`。
- 没有邮箱验证/忘记密码/2FA；团队版之前需补。
- 会话无状态：登出只清 Cookie；改密会通过 `session_version` 撤销全部旧 Token。

---

*最后更新：2026-10-27 · v0.1.0*
