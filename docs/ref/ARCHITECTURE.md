# Architecture

> Next 系统架构文档 — 组件关系、数据流、设计决策
> 最后更新: 2026-02-21

## 系统总览

```
Browser (Vanilla JS PWA)
    │
    ├── Static Files ──→ ServeDir (index.html, CSS, JS, icons)
    │
    └── /api/* ──→ Axum Router
                    │
                    ├── Auth Routes ──→ 无需 Session
                    │   (register/login/logout/me/change-password/avatar)
                    │
                    └── Protected Routes ──→ UserId Extractor (Cookie Session)
                        ├── /todos/*          ──→ 任务 CRUD + 批量 + 计数
                        ├── /routines/*       ──→ 例行任务 CRUD + 打卡
                        ├── /reviews/*        ──→ 例行审视 CRUD + 完成
                        ├── /chat             ──→ 阿宝 AI → Claude API (Tool Use)
                        ├── /conversations/*  ──→ 对话管理 + 使用量
                        ├── /english/*        ──→ 英语场景 CRUD + AI 生成
                        ├── /friends/*        ──→ 好友 + 好友请求 + 搜索
                        ├── /share/*          ──→ 任务分享 + 收件箱
                        ├── /reminders/*      ──→ 提醒 CRUD + 延后 + 确认
                        ├── /push/*           ──→ VAPID 公钥 + 订阅管理
                        ├── /notifications/*  ──→ 应用内通知 + 已读
                        ├── /contacts/*       ──→ 联系人 CRUD
                        ├── /collaborate/*    ──→ 任务/例行协作 + 确认流
                        ├── /moment           ──→ 此刻一句话 (AI 生成)
                        └── /quotes/random    ──→ 随机名言
                    │
                    └── SQLite (WAL mode, Arc<Mutex<Connection>>)

Background Tasks:
  ├── ReminderPoller (每 30s) ──→ 检查到期提醒 → Push + 通知
  └── DailyBackup (每 1h 检查) ──→ VACUUM INTO 每日备份
```

## 请求生命周期

1. **静态文件**: `GET /` → `ServeDir` 返回 `frontend/` 下的文件，`index.html` 作为默认
2. **sw.js 特殊处理**: 单独路由，设置 `Cache-Control: no-cache, no-store, must-revalidate`
3. **API 请求**: `POST /api/todos` → Axum Router 匹配 → Handler 函数
4. **认证提取**: Handler 参数中声明 `UserId` → `FromRequestParts` 自动从 Cookie 提取 Session → 验证 → 注入 `user_id`
5. **业务逻辑**: Handler 通过 `State(AppState)` 获取 DB 连接，执行 SQL
6. **响应**: 统一 JSON 格式 `{ "success": true/false, ... }`

## 认证流程

```
注册: username + password
  → 校验（3-20字符、字母数字下划线、密码≥8字符）
  → Argon2 哈希密码 (随机 Salt)
  → INSERT users + INSERT sessions
  → Set-Cookie: session=<hex_token>; HttpOnly; SameSite=Lax; Max-Age=30d; Secure

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

### 对话模式

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

**可用 Tools** (16个): create_todo, update_todo, delete_todo, restore_todo, query_todos, batch_update_todos, create_routine, create_review, get_statistics, get_current_datetime, create_english_scenario, query_english_scenarios, create_reminder, query_reminders, cancel_reminder, snooze_reminder

### 此刻模式 (Moment)

```
GET /api/moment
  → 检查内存缓存 (15分钟 TTL)
  → 未命中:
      build_moment_context(db, user_id) → 6个轻量 DB 查询
      simple_generate(system_prompt, user_message, max_tokens=60) → Claude
      truncate_moment() → 硬截断保护 (≤12字符)
  → 失败兜底: fallback_greeting() → 时段问候
  → 写入缓存 → 返回 { text, cached }
```

## 提醒 & 推送架构

```
创建提醒 (API / 阿宝对话)
  → INSERT reminders (status: pending, remind_at: ISO 8601+08:00)

ReminderPoller (tokio::spawn, 每 30s):
  → SELECT reminders WHERE status='pending' AND remind_at <= now
  → 对每个到期提醒:
      1. UPDATE status → 'triggered'
      2. INSERT notification (in-app)
      3. SELECT push_subscriptions → 对每个订阅:
          → VAPID 签名 (P-256 ECDSA)
          → 内容加密 (AES-128-GCM + ECDH)
          → POST to push service endpoint

Service Worker (客户端):
  → push event → showNotification()
  → notificationclick → acknowledge / snooze
```

## 协作模型

```
用户A 将任务标为协作 → 添加好友为协作者
  │
  ├─ 协作者在自己的四象限中看到该任务
  ├─ 协作者有独立的 tab/quadrant/sort_order
  │
  └─ 完成确认流:
      A 标记完成 → pending_confirmation
      B 收到通知 → respond (confirm/reject)
      全部确认 → 任务正式完成
```

## 数据模型关系

```
users ─┬── todos ──── todo_changelog (CASCADE DELETE)
       │   └── todo_collaborators (CASCADE DELETE)
       ├── routines ── routine_collaborators (CASCADE DELETE)
       │              └── routine_completions (CASCADE DELETE)
       ├── reviews
       ├── sessions (最多 5 个)
       ├── conversations ──── chat_messages (CASCADE DELETE)
       ├── chat_usage_log
       ├── english_scenarios
       ├── friendships
       ├── shared_items
       ├── reminders
       ├── push_subscriptions
       ├── notifications
       ├── contacts
       ├── pending_confirmations ── confirmation_responses (CASCADE DELETE)
       └── user_settings
```

## 安全层

| 机制 | 实现 |
|------|------|
| 密码存储 | Argon2 哈希，随机 Salt |
| Session | 32 字节随机 Hex Token，HttpOnly Cookie |
| CSP | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'` |
| HSTS | `max-age=31536000` |
| X-Content-Type-Options | `nosniff` |
| HTTPS | Fly.io `force_https: true` |
| 数据隔离 | 所有查询都带 `user_id` 过滤 |
| AI 安全 | 系统 prompt 禁止泄露、Tool 绑定 user_id、忽略注入指令 |

## 设计哲学

### "够用就好"原则

| 选择 | 为什么不用"更好"的方案 |
|------|---------------------|
| **SQLite** (非 Postgres) | 1-10 用户场景，WAL 并发读足够，零运维 |
| **Vanilla JS** (非 React) | 无构建步骤，改完直接部署，浏览器 F12 直接调试 |
| **Cookie Session** (非 JWT) | 服务端可控、可撤销、HttpOnly 更安全 |
| **Arc<Mutex<Connection>>** | 单连接足够，避免连接池复杂性 |
| **ServeDir** | 前后端同一进程，部署为单二进制 + 静态文件 |
| **WAL mode** | 允许并发读，单写者足够 |
| **轮询** (非 WebSocket) | 复杂度低，提醒 30s 延迟可接受 |
| **内存缓存** (非 Redis) | Moment 缓存用 HashMap 足够，无需引入额外依赖 |

### "AI 是搭档，不是功能"

阿宝不是一个聊天窗口。他深度集成在应用中：
- **对话时看得到你的任务**：系统 prompt 注入实时任务概况
- **说完就干**：调用 tools 直接操作数据库
- **顶栏说一句话**：此刻文案基于你的真实任务状态生成
- **提醒到点叫你**：通过对话创建提醒，到时推送通知

### "前端不需要状态管理框架"

全局状态只有几个变量：`currentTab`、`currentPage`、`allItems`。DOM 操作直接用 `querySelector`。不需要 React 的 Virtual DOM，不需要 Redux 的 store。

**原因**：这是一个工具型应用，不是社交平台。UI 复杂度可控，数据流单向，不需要框架级别的状态管理。

## 关键源文件

| 文件 | 职责 |
|------|------|
| `server/src/main.rs` | 路由注册、中间件、静态文件、健康检查、备份调度 |
| `server/src/auth.rs` | 注册/登录/登出/改密码/头像、UserId Extractor |
| `server/src/state.rs` | AppState { db, moment_cache } |
| `server/src/db.rs` | Schema 创建、迁移、每日备份 |
| `server/src/services/claude.rs` | Claude API 客户端 (chat + simple_generate)、Tool Use 循环 |
| `server/src/services/context.rs` | 系统 Prompt 构建、任务上下文注入、Moment 上下文 |
| `server/src/services/tool_executor.rs` | AI Tool 实现 (16 个 tools) |
| `server/src/services/push.rs` | Web Push 加密、VAPID 签名、推送发送 |
| `server/src/services/reminder_poller.rs` | 后台提醒轮询 (30s) |
| `server/src/services/collaboration.rs` | 协作逻辑、确认流程 |
| `server/src/routes/moment.rs` | 此刻文案 API |
| `server/src/routes/chat.rs` | 阿宝聊天入口 → ClaudeClient |
