# Architecture

> Next 系统架构文档 — 组件关系、数据流、设计决策

## 系统总览

```
Browser (Vanilla JS)
    │
    ├── Static Files ──→ ServeDir (index.html, CSS, JS, icons)
    │
    └── /api/* ──→ Axum Router
                    │
                    ├── Auth Routes ──→ 无需 Session
                    │   (register/login/logout/me/change-password)
                    │
                    └── Protected Routes ──→ UserId Extractor (Cookie Session)
                        ├── /todos/*          ──→ Todo handlers
                        ├── /routines/*       ──→ Routine handlers
                        ├── /reviews/*        ──→ Review handlers
                        ├── /quotes/random    ──→ 随机名言
                        ├── /chat             ──→ ClaudeClient → Anthropic API
                        └── /conversations/*  ──→ 对话管理
                    │
                    └── SQLite (WAL mode, Arc<Mutex<Connection>>)
```

## 请求生命周期

1. **静态文件**: `GET /` → `ServeDir` 返回 `frontend/` 下的文件，`index.html` 作为默认
2. **API 请求**: `POST /api/todos` → Axum Router 匹配 → Handler 函数
3. **认证提取**: Handler 参数中声明 `UserId` → `FromRequestParts` 自动从 Cookie 提取 Session → 验证 → 注入 `user_id`
4. **业务逻辑**: Handler 通过 `State(AppState)` 获取 `Arc<Mutex<Connection>>`，执行 SQL
5. **响应**: 统一 JSON 格式 `{ "success": true/false, ... }`

## 认证流程

```
注册: username + password
  → 校验（3-20字符、字母数字下划线、密码≥8字符）
  → Argon2 哈希密码
  → INSERT users + INSERT sessions
  → Set-Cookie: session=<hex_token>; HttpOnly; SameSite=Lax; Max-Age=30d

登录: username + password
  → 查 users 表 → Argon2 验证
  → INSERT sessions（限制每用户最多 5 个）
  → Set-Cookie

认证中间件: UserId extractor
  → 读 Cookie "session"
  → SELECT user_id FROM sessions WHERE token=? AND expires_at > now
  → 成功返回 UserId(user_id)，失败返回 401
```

## AI 助手架构（阿宝）

```
用户消息
  → POST /api/chat { message, conversation_id? }
  → chat_handler:
      1. 查找或创建 conversation
      2. 加载历史消息
      3. build_system_prompt(db, user_id) → 注入任务概况
      4. ClaudeClient::chat(system, messages, tools, execute_tool)
          → Anthropic Messages API (claude-sonnet-4-5)
          → 如果 stop_reason="tool_use" → execute_tool → 继续循环
          → 最多 5 轮 tool 循环
      5. 保存消息 + 使用量日志
      6. 返回 AI 回复
```

**可用 Tools**: create_todo, update_todo, delete_todo, restore_todo, query_todos, batch_update_todos, create_routine, create_review, get_statistics, get_current_datetime

## 数据模型关系

```
users (1)
  ├── todos (N)         — user_id FK
  │   └── todo_changelog (N) — todo_id FK, CASCADE DELETE
  ├── routines (N)      — user_id FK
  ├── reviews (N)       — user_id FK
  ├── sessions (N)      — user_id FK, 最多 5 个
  ├── conversations (N) — user_id FK
  │   └── chat_messages (N) — conversation_id FK, CASCADE DELETE
  └── chat_usage_log (N) — user_id FK
```

## 安全层

| 机制 | 实现 |
|------|------|
| 密码存储 | Argon2 哈希，随机 Salt |
| Session | 32 字节随机 Hex Token，HttpOnly Cookie |
| CSP | `default-src 'self'; script-src 'self' 'unsafe-inline'` |
| HSTS | `max-age=31536000` |
| X-Content-Type-Options | `nosniff` |
| HTTPS | Fly.io `force_https: true` |
| 数据隔离 | 所有查询都带 `user_id` 过滤 |

## 关键设计决策

| 决策 | 原因 |
|------|------|
| **SQLite** (非 Postgres) | 单用户/少用户场景，部署极简，Volume 直接持久化 |
| **Vanilla JS** (非 React) | 无构建步骤，快速迭代，文件直接部署 |
| **Cookie Session** (非 JWT) | 服务端可控、可撤销、HttpOnly 更安全 |
| **Arc<Mutex<Connection>>** | 单连接足够，避免连接池复杂性 |
| **ServeDir** | 前后端同一进程，部署为单二进制 + 静态文件 |
| **WAL mode** | 允许并发读，单写者足够 |

## 关键源文件

| 文件 | 职责 |
|------|------|
| `server/src/main.rs` | 路由注册、中间件、静态文件、健康检查 |
| `server/src/auth.rs` | 注册/登录/登出/改密码、UserId Extractor |
| `server/src/state.rs` | AppState 定义 |
| `server/src/db.rs` | Schema 创建、备份 |
| `server/src/services/claude.rs` | Claude API 客户端、Tool Use 循环 |
| `server/src/services/context.rs` | 系统 Prompt 构建、任务上下文 |
| `server/src/services/tool_executor.rs` | AI Tool 实现 |
