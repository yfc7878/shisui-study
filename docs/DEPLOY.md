# 部署与公网访问指南

本文覆盖四种典型部署方式：

1. 本机/局域网（最快）
2. 云服务器 + Docker
3. Cloudflare Tunnel（推荐给家庭宽带/无公网 IP）
4. VPS + Caddy 域名 + 自动 HTTPS

> 无论哪种方式，**公网开放前必须确认管理员密码**：在 `.env` 设置强 `ADMIN_PASSWORD`，或记录首次启动日志中随机生成的密码并登录后修改。

---

## 0. 先准备 `.env`

```bash
copy .env.example .env
```

至少检查：

```env
PORT=8787
ADMIN_PASSWORD=换成一个足够长的密码   # 留空则首次启动生成随机密码并打印在日志
JWT_SECRET=            # 留空会自动生成到 data/app.json
DATA_DIR=./server/data # Docker 中为 /app/data
TRUST_PROXY=0          # 在反向代理后面改为 1
```

`ADMIN_PASSWORD` 只在首次启动、`data/app.json` 尚不存在时生效。之后请用设置页或 `reset-password` 修改。

---

## 1. 本机 / 局域网

```bash
npm install
npm run build
npm start
```

### Windows 登录自启（可选）

运行一次安装脚本后，登录 Windows 会自动启动，端口固定 `8787`，服务进程退出会自动重启：

```powershell
# 安装/重新安装（移动项目目录后必须重跑）
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1

# 查看状态
Get-ScheduledTask -TaskName 'Shisui Study Server'

# 停止 / 立即启动（也可直接双击根目录的 .bat）
powershell -ExecutionPolicy Bypass -File stop-study.ps1
powershell -ExecutionPolicy Bypass -File start-study.ps1
```

日志在项目根目录 `logs/`。计划任务以当前用户身份在登录后运行，不需要管理员权限；若系统策略禁止创建计划任务，安装脚本会自动退回启动文件夹方式。

任务由 `wscript.exe` 调用隐藏的 VBS 启动器，因此不会出现 PowerShell 控制台窗口；没有每 10 分钟重复触发的任务。停止后本次登录期间不会被拉回，下次登录或双击启动文件即可恢复。

- 电脑访问 `http://localhost:8787`。
- 手机/平板访问 `http://<电脑局域网IP>:8787`（防火墙放行 8787）。
- 查看电脑 IP：Windows `ipconfig`，macOS/Linux `ip addr`。
- 这是 HTTP，仅建议在家里的可信 Wi-Fi 使用。

---

## 2. 云服务器 + Docker

最低配置：1 核 1G 内存、20G 硬盘即可（AI 在 DeepSeek 云端运行，服务器只存数据）。

```bash
# 安装 Docker 后
git clone <你的仓库> study-atelier  # 或直接上传项目目录
cd study-atelier
cp .env.example .env
nano .env                            # 修改 ADMIN_PASSWORD / JWT_SECRET

# 容器内以 uid 1000 的 node 用户运行，Linux 上请确保数据目录可写
mkdir -p data
chown -R 1000:1000 data

docker compose up -d --build
docker compose logs -f study
```

访问 `http://服务器公网IP:8787`。云厂商安全组需放行 8787。

建议尽早套上 HTTPS（见第 4 节），否则密码和 Cookie 在公网上是明文传输。

数据目录：

```text
./data/study.db
./data/uploads/
./data/app.json
```

升级：

```bash
git pull
docker compose up -d --build
```

---

## 3. Cloudflare Tunnel（推荐家庭部署）

优点：不需要公网 IP、不需要路由器端口映射、自动 HTTPS、可加 Cloudflare Access 二次验证。

### 3.1 临时试用

在运行应用的电脑上安装 `cloudflared`，然后：

```bash
cloudflared tunnel --url http://localhost:8787
```

终端会输出 `https://随机.trycloudflare.com` 地址，手机浏览器直接访问。关闭终端后地址失效。

### 3.2 长期使用（命名 Tunnel）

1. 注册 Cloudflare，添加一个域名；
2. 进入 **Zero Trust → Networks → Tunnels → Create a tunnel**；
3. 选择 `Cloudflared`，复制 **Tunnel Token**；
4. 在 Public Hostname 中添加：
   - Subdomain: `study`
   - Domain: 你的域名
   - **Service: `http://study:8787`**（如果 cloudflared 和 app 在同一个 compose 网络）
5. 项目 `.env` 增加：

```env
TRUST_PROXY=1
CLOUDFLARE_TUNNEL_TOKEN=eyJh...
```

6. 启动：

```bash
docker compose --profile tunnel up -d
```

然后访问 `https://study.你的域名`。

> 如果 cloudflared 直接运行在宿主机而不是 Docker 里，Service 用 `http://localhost:8787`。
> 如果 Tunnel 在 Cloudflare 后台配置指向 `localhost`，它指的是 cloudflared 容器自身，不是应用容器，会 502。

### 3.3 额外保护（强烈建议）

在 Cloudflare Zero Trust 中给该域名加 **Access Application**，只允许你的邮箱通过一次性验证码登录。这样即使别人知道网址，也无法到达应用的密码页。

---

## 4. VPS + Caddy 自动 HTTPS

1. 域名 A 记录指向 VPS；
2. 安装 Caddy；
3. 修改 `deploy/Caddyfile` 中的 `study.example.com`；
4. 运行：

```bash
caddy run --config deploy/Caddyfile
```

如果应用也在 Docker 中，Caddy 可直连 `127.0.0.1:8787`（端口映射到宿主机），并设置：

```env
TRUST_PROXY=1
APP_ORIGIN=https://study.example.com
```

Caddy 会自动申请并续期 Let's Encrypt 证书。

> 使用 Nginx 时同样需要转发 `Host`、`X-Forwarded-Proto`、`X-Forwarded-For`，并设置 `TRUST_PROXY=1`。

---

## 5. 其他方案：Tailscale（只给设备用，不公开）

如果只是想在自己的几台设备之间同步，不想暴露公网：

1. 服务器和手机/电脑安装 Tailscale；
2. 服务器运行应用；
3. 手机通过 Tailscale 分配的 `100.x.x.x:8787` 访问。

没有公网入口，安全性最高；只需确保服务器上的 Tailscale 常开。

---

## 6. 安全清单

- [ ] 确认管理员密码，使用 12 位以上强密码，或记录首次启动生成的随机密码；
- [ ] 启用 HTTPS（Cloudflare Tunnel 或 Caddy）；
- [ ] `.env` 不提交到 Git；
- [ ] 服务器系统与依赖保持更新；
- [ ] 定期备份 `data` 目录；
- [ ] 不在公用设备上保持登录；
- [ ] API Key 只在个人浏览器保存，不发给别人；
- [ ] 如果公网开放，考虑 Cloudflare Access / 仅允许自己的 IP；
- [ ] 定期检查 `data` 目录权限（默认 700/600 由程序设置，Windows 上忽略）。

---

## 7. 备份与恢复

### 备份

```bash
# 停止写入更稳妥
docker compose stop study
tar -czf shisui-backup-$(date +%F).tar.gz data/
docker compose start study
```

或直接在「设置 → 数据 → 下载 JSON 备份」导出文字数据（不含图片文件）。

### 恢复

```bash
docker compose down
mv data data.old
tar -xzf shisui-backup-YYYY-MM-DD.tar.gz
docker compose up -d
```

### 重置密码

```bash
# 本地
npm run reset-password -- "新密码"

# Docker
docker exec -it shisui-study node server/src/reset-password.js "新密码"
```

---

## 8. 故障排查

### 登录成功但一刷新就退出

- 反向代理后未设置 `TRUST_PROXY=1`，导致 Secure Cookie 没被浏览器保存；
- 访问地址与 Cookie 域名不一致；
- 浏览器禁用了第三方/全部 Cookie。

### POST 请求返回 403「请求来源不被允许」

同源保护检测到 Origin 与 Host 不一致。检查反向代理是否保留原始 `Host` / `X-Forwarded-Host`；也可以设置：

```env
APP_ORIGIN=https://你的域名
```

### 上传失败 / 图片无法显示

- 单张图片超过 20MB 或一次超过 12 张；
- `data/uploads` 权限不正确（Docker 使用 node 用户，请保持目录可写）；
- 图片 URL 需要登录 Cookie，不能直接拿到别的浏览器打开。

### AI 调用失败

- 到设置页「测试连接」；
- 检查 Key 余额、Base URL（不要多写 `/chat/completions`）、模型名；
- 视觉任务必须使用支持图像的模型（默认 `deepseek-flash`）；
- 图片过大或过多时先裁剪/减少。

### 容器启动报 `node:sqlite` 不存在

请使用 Node 24+ 与项目自带的 Dockerfile；不要在旧 Node 上运行。

### 时区不对

Docker 镜像已安装 `tzdata`。如需固定时区，在 compose 里加：

```yaml
environment:
  TZ: Asia/Shanghai
```

应用内部统计按东八区（+8）聚合，适合国内使用。
