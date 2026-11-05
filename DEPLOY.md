# 部署指南（Docker Compose + Nginx）

面向：阿里云 / CentOS 系 Linux 服务器，MySQL 与后端部署在同一台机器上。

> 架构：`浏览器 → Nginx :80/443 → 127.0.0.1:3000 (Node 容器) → 127.0.0.1:3306 (MySQL)`

## 0. 先决条件

- 服务器能访问外网（拉 Docker 镜像、npm 包）
- 服务器已装好 MySQL，库 `DragonNest` 已导入数据，本机能 `mysql -uroot -p` 登录
- 代码已推送到 GitHub：`https://github.com/SovnGardeV/DNsearch-backend`

> ⚠️ 推代码前确认：`.env`、`.env.production` **不要**提交（`.gitignore` 已覆盖），密码只留在服务器上。

## 1. 安装 Docker（CentOS / Alibaba Cloud Linux）

```bash
# CentOS 7 / 8、Alibaba Cloud Linux 用阿里云镜像源装 Docker CE
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# 验证（版本要能看到 Compose v2）
docker --version
docker compose version
```

Alibaba Cloud Linux 3 也可以直接用系统包：`sudo dnf install -y docker && sudo systemctl enable --now docker`。

国内拉镜像慢或被墙时，配置加速器后再重试：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": ["https://docker.m.daocloud.io"]
}
EOF
sudo systemctl restart docker
```

## 2. 拉取代码

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/SovnGardeV/DNsearch-backend.git
cd /opt/DNsearch-backend
```

私有仓库需要先在 GitHub 生成 token，用 `https://<用户名>:<token>@github.com/...` 克隆。

## 3. 配置生产环境变量

```bash
cp deploy/env.production.example .env.production
vim .env.production
```

至少改这三项：

```ini
DB_PASSWORD=正式库密码
DB_USER=root
DB_DATABASE=DragonNest
```

关键点：

- `NODE_ENV=production` → 代码会连 `DB_HOST_PROD`（127.0.0.1），**不会**连远程测试库
- `HOST=127.0.0.1` → 只监听本机，由 Nginx 转发（不想装 Nginx 就改 `0.0.0.0` 并在安全组放行 3000）
- `.env.production` 不要提交，也不要 `docker commit` 到镜像里

## 4. 构建并启动

```bash
cd /opt/DNsearch-backend
docker compose up -d --build
```

首次构建会拉 Node 镜像 + 装依赖，2-5 分钟。国内构建 npm 慢可以：

```bash
docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
docker compose up -d
```

## 5. 验证

```bash
docker compose ps                       # STATUS 应为 Up (healthy)
docker compose logs -f --tail=50        # 启动日志，应看到「已连接 mysql://127.0.0.1:3306/DragonNest」

curl -s http://127.0.0.1:3000/api/health
curl -s "http://127.0.0.1:3000/dragonnest/items?page=1&pageSize=2"
```

`/api/health` 返回 `"database":{"status":"up"}` 且业务接口有数据，就说明后端通了。

## 6. Nginx 反向代理（对外提供 80 端口）

```bash
sudo yum install -y nginx
sudo systemctl enable --now nginx

sudo cp deploy/nginx-dnsearch.conf /etc/nginx/conf.d/dnsearch.conf
sudo vim /etc/nginx/conf.d/dnsearch.conf     # 把 server_name 改成你的域名，或用 IP 访问改成 _

sudo nginx -t && sudo systemctl reload nginx
```

然后用浏览器访问 `http://服务器IP/dragonnest/items?page=1&pageSize=5`。

**阿里云安全组**：只放行 80/443 即可，3000 端口不用对外开放（`HOST=127.0.0.1` 时外网本来也访问不到）。

### 配 HTTPS（可选，推荐）

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

证书会自动续期（certbot 已装 systemd timer）。

## 7. 日常运维

```bash
docker compose ps                     # 状态
docker compose logs -f --tail=100     # 实时日志
docker compose restart                # 重启
docker compose down                   # 停止并删除容器（数据在 MySQL 里，不受影响）
docker stats dnsearch-backend         # CPU / 内存
```

### 更新版本

```bash
cd /opt/DNsearch-backend
sudo git pull
docker compose up -d --build
docker image prune -f                 # 清理旧镜像（可选）
```

### 回滚

```bash
git log --oneline -5
sudo git checkout <上一个提交的哈希>
docker compose up -d --build
```

## 8. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `/api/health` 返回 503 `ECONNREFUSED 127.0.0.1:3306` | 容器连不到 MySQL。检查 MySQL 是否在跑：`systemctl status mysqld`；确认 `.env.production` 里 `DB_PASSWORD` 正确 |
| 健康检查报 `ER_ACCESS_DENIED_ERROR` | 密码错；或 MySQL 只允许 `root@localhost` 而容器来源 IP 不同（host 网络下就是本机，一般不会） |
| 接口返回 `database.status: down` 但日志里连上了远程库 | `NODE_ENV` 没生效，连成测试库了。`docker compose exec api env | grep NODE_ENV` 应为 `production` |
| 浏览器打不开，`curl 127.0.0.1:3000` 正常 | Nginx 或安全组问题。先看 `sudo nginx -t`、`docker compose ps`、安全组 80 端口是否放行 |
| `docker compose` 提示 `unknown command` | 装的是老版 docker-compose v1。按第 1 节装 `docker-compose-plugin` |
| 构建卡在 `npm ci` | 换源：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com` |
| 端口 3000 被占用 | `ss -lntp | grep 3000` 找到占用进程；本项目用 host 网络，端口不能被其他程序占用 |
| 中文变乱码 | MySQL 连接字符集问题，确认库和表是 `utf8mb4`；`SELECT @@character_set_server` |

## 9. 说明：为什么用 `network_mode: host`

容器默认桥接网络里，`127.0.0.1` 指的是**容器自己**，连不到宿主机上的 MySQL。三种做法：

1. **host 网络（本项目采用）**：容器直接用宿主机网络，`DB_HOST_PROD=127.0.0.1` 原样生效，不用改 MySQL 配置，代价是端口不做隔离（所以用 `HOST=127.0.0.1` + Nginx 收口）。
2. 桥接 + `extra_hosts: host.docker.internal:host-gateway`，同时要把 MySQL `bind-address` 改成 `0.0.0.0`。
3. 把 MySQL 也放进 Compose，通过服务名互访——适合全新项目，已有数据要迁移。

如果以后把 MySQL 容器化，改成第 3 种最干净；届时 `DB_HOST_PROD` 改为 MySQL 的服务名即可。
