# Deployment

> Fly.io 部署、Docker、环境变量、备份

## 部署命令

> **⚠ 修改代码后必须执行 `fly deploy` 部署到线上，不要启动本地 `cargo run`！**

```bash
# flyctl 路径
"C:/Users/huai/.fly/bin/flyctl.exe" deploy

# 设置 secrets
"C:/Users/huai/.fly/bin/flyctl.exe" secrets set ANTHROPIC_API_KEY=xxx

# 查看日志
"C:/Users/huai/.fly/bin/flyctl.exe" logs

# SSH 到容器
"C:/Users/huai/.fly/bin/flyctl.exe" ssh console
```

## Fly.io 配置 (fly.toml)

```toml
app = "next-boris"              # 应用名
primary_region = "nrt"          # 东京机房

[env]
  PORT = "8080"                 # 监听端口
  DATABASE_PATH = "/data/next.db"   # SQLite 路径（持久卷内）
  FRONTEND_DIR = "/app/frontend"    # 前端静态文件路径

[http_service]
  internal_port = 8080
  force_https = true            # 强制 HTTPS
  auto_stop_machines = "stop"   # 无流量时停机
  auto_start_machines = true    # 有请求时自动启动
  min_machines_running = 0      # 可完全停机

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  size = "shared-cpu-1x"        # 最小规格
  memory = "256mb"

[mounts]
  source = "next_data"          # 持久卷名
  destination = "/data"         # 挂载到容器 /data

[[http_service.checks]]
  path = "/health"              # 健康检查端点
  interval = "30s"
  timeout = "5s"
  grace_period = "10s"
```

## Dockerfile 构建流程

```
Stage 1: rust:1.92-slim (Builder)
  → apt install pkg-config libssl-dev
  → cargo build --release
  → 产出 /app/server/target/release/next-server

Stage 2: debian:bookworm-slim (Runtime)
  → 安装 ca-certificates
  → COPY 二进制、frontend/、data/quotes.txt
  → ENV PORT=8080, DATABASE_PATH=/data/next.db
  → CMD ["/app/next-server"]
```

## 环境变量

| 变量 | 来源 | 说明 |
|------|------|------|
| `PORT` | fly.toml env | 监听端口 (8080) |
| `DATABASE_PATH` | fly.toml env | SQLite 文件路径 |
| `FRONTEND_DIR` | fly.toml env | 前端静态文件目录 |
| `ANTHROPIC_API_KEY` | fly secrets | Claude API 密钥 |

## 持久化

- **Volume**: `next_data` 挂载到 `/data`
- 数据库文件: `/data/next.db`
- 备份目录: `/data/backups/`
- **重新部署不丢数据** — Volume 独立于容器生命周期

## 备份

**自动备份**: 每小时检查一次，每天第一次执行 `VACUUM INTO` 备份，保留最近 30 天

**手动备份到本地**:
```bash
"C:/Users/huai/.fly/bin/flyctl.exe" ssh console -C "cat /data/next.db" > backup.db
```

## 本地开发（仅调试用）

```bash
cd server
PORT=3001 ANTHROPIC_API_KEY=你的key cargo run
```

访问 `http://localhost:3001`。本地数据库 `server/data/next.db` 与线上完全无关。
