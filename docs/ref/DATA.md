# Data

> SQLite Schema、存储位置、备份策略
> 最后更新: 2026-02-21

## 数据库配置

- **引擎**: SQLite (rusqlite 0.32, bundled)
- **模式**: WAL (Write-Ahead Logging) — 允许并发读
- **外键**: `PRAGMA foreign_keys=ON`
- **连接**: 单连接 `Arc<Mutex<Connection>>`

## 完整 Schema

### users
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- UUID
    username TEXT UNIQUE NOT NULL,     -- 3-20字符，字母/数字/下划线
    password_hash TEXT NOT NULL,       -- Argon2 哈希
    display_name TEXT,
    avatar TEXT DEFAULT '',            -- 预设头像名
    created_at TEXT NOT NULL,          -- ISO 8601
    updated_at TEXT NOT NULL
);
```

### todos
```sql
CREATE TABLE todos (
    id TEXT PRIMARY KEY,                          -- UUID (8字符短ID)
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,                            -- 任务标题
    content TEXT DEFAULT '',                       -- 详细描述 (Markdown)
    tab TEXT NOT NULL DEFAULT 'today',             -- today | week | month
    quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
    progress INTEGER DEFAULT 0,                    -- 0-100
    completed INTEGER DEFAULT 0,                   -- 0/1
    completed_at TEXT,
    deleted INTEGER DEFAULT 0,                     -- 软删除标记
    due_date TEXT,                                 -- YYYY-MM-DD
    assignee TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',                        -- JSON 数组字符串
    sort_order REAL DEFAULT 0.0,                   -- 拖拽排序
    is_collaborative INTEGER DEFAULT 0,            -- 是否协作任务
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX idx_todos_user_tab ON todos(user_id, tab, deleted);
```

### todo_changelog
```sql
CREATE TABLE todo_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    field TEXT NOT NULL,               -- 变更的字段名
    from_val TEXT,                     -- 原始值
    to_val TEXT,                       -- 新值
    label TEXT,                        -- 显示标签
    changed_by TEXT                    -- 操作者 (迁移新增)
);
CREATE INDEX idx_changelog_todo ON todo_changelog(todo_id);
```

### routines
```sql
CREATE TABLE routines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    completed_today INTEGER DEFAULT 0,    -- 今天是否已完成
    last_completed_date TEXT,
    is_collaborative INTEGER DEFAULT 0,   -- 是否协作
    created_at TEXT NOT NULL
);
CREATE INDEX idx_routines_user ON routines(user_id);
```

### reviews
```sql
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    frequency TEXT NOT NULL,              -- daily | weekly | monthly | yearly
    frequency_config TEXT DEFAULT '{}',   -- JSON，如 {"day_of_week": 1}
    notes TEXT DEFAULT '',
    category TEXT DEFAULT '',
    last_completed TEXT,
    paused INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_reviews_user ON reviews(user_id);
```

### sessions
```sql
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,               -- 32字节随机 Hex
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL              -- 30天后过期
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

### conversations
```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_archived INTEGER DEFAULT 0
);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);
```

### chat_messages
```sql
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                    -- user | assistant
    content_text TEXT,                     -- 纯文本内容
    content_json TEXT,                     -- JSON 格式内容（tool calls 等）
    tool_name TEXT,
    token_count INTEGER,
    created_at TEXT NOT NULL,
    sequence INTEGER NOT NULL             -- 消息序号
);
CREATE INDEX idx_messages_conv ON chat_messages(conversation_id, sequence);
```

### chat_usage_log
```sql
CREATE TABLE chat_usage_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    conversation_id TEXT NOT NULL,
    model TEXT NOT NULL,                   -- 如 claude-sonnet-4-5
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    tool_calls INTEGER DEFAULT 0,
    latency_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_usage_user ON chat_usage_log(user_id, created_at DESC);
```

### english_scenarios
```sql
CREATE TABLE english_scenarios (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,                   -- 中文标题
    title_en TEXT DEFAULT '',              -- 英文标题
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '📖',
    content TEXT DEFAULT '',               -- AI 生成的场景内容
    status TEXT NOT NULL DEFAULT 'draft',  -- draft | generated
    archived INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_scenarios_user ON english_scenarios(user_id, archived);
```

### friendships
```sql
CREATE TABLE friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id),
    addressee_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(requester_id, addressee_id)
);
CREATE INDEX idx_friendships_users ON friendships(requester_id, addressee_id, status);
```

### shared_items
```sql
CREATE TABLE shared_items (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id),
    recipient_id TEXT NOT NULL REFERENCES users(id),
    item_type TEXT NOT NULL,               -- todo | routine
    item_id TEXT NOT NULL,
    item_snapshot TEXT NOT NULL,            -- 分享时的 JSON 快照
    message TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unread',  -- unread | accepted | dismissed
    created_at TEXT NOT NULL
);
CREATE INDEX idx_shared_recipient ON shared_items(recipient_id, status);
```

### reminders
```sql
CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    remind_at TEXT NOT NULL,               -- ISO 8601 带时区
    status TEXT NOT NULL DEFAULT 'pending', -- pending | triggered | acknowledged | snoozed | cancelled
    related_todo_id TEXT,                  -- 关联的任务 ID
    repeat TEXT,                           -- null | daily | weekly
    created_at TEXT NOT NULL,
    triggered_at TEXT,
    acknowledged_at TEXT
);
CREATE INDEX idx_reminders_user ON reminders(user_id, status, remind_at);
CREATE INDEX idx_reminders_due ON reminders(status, remind_at);
```

### push_subscriptions
```sql
CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL,                -- Push Service endpoint URL
    p256dh TEXT NOT NULL,                  -- 客户端公钥
    auth TEXT NOT NULL,                    -- 认证密钥
    user_agent TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, endpoint)
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
```

### notifications
```sql
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL DEFAULT 'reminder', -- reminder | friend_request | share | collaboration
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    reminder_id TEXT,                      -- 关联提醒 ID
    todo_id TEXT,                          -- 关联任务 ID
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
```

### user_settings
```sql
CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    push_enabled INTEGER DEFAULT 1,
    wxpusher_uid TEXT,
    quiet_hours_start TEXT,               -- 免打扰开始时间
    quiet_hours_end TEXT,                 -- 免打扰结束时间
    updated_at TEXT NOT NULL
);
```

### contacts
```sql
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    linked_user_id TEXT REFERENCES users(id),      -- 关联的系统用户
    friendship_id TEXT REFERENCES friendships(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_contacts_user ON contacts(user_id);
```

### todo_collaborators
```sql
CREATE TABLE todo_collaborators (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'collaborator',
    tab TEXT NOT NULL DEFAULT 'today',               -- 协作者自己的 tab
    quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',  -- 协作者自己的象限
    sort_order REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE(todo_id, user_id)
);
CREATE INDEX idx_todo_collab_user ON todo_collaborators(user_id, status);
CREATE INDEX idx_todo_collab_todo ON todo_collaborators(todo_id);
```

### routine_collaborators
```sql
CREATE TABLE routine_collaborators (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id)
);
CREATE INDEX idx_routine_collab_user ON routine_collaborators(user_id, status);
```

### routine_completions
```sql
CREATE TABLE routine_completions (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    completed_date TEXT NOT NULL,           -- YYYY-MM-DD
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id, completed_date)
);
CREATE INDEX idx_routine_comp ON routine_completions(routine_id, user_id);
```

### pending_confirmations
```sql
CREATE TABLE pending_confirmations (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,               -- todo | routine
    item_id TEXT NOT NULL,
    action TEXT NOT NULL,                  -- complete | delete | ...
    initiated_by TEXT NOT NULL REFERENCES users(id),
    initiated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected
    resolved_at TEXT
);
CREATE INDEX idx_pending_item ON pending_confirmations(item_type, item_id, status);
```

### confirmation_responses
```sql
CREATE TABLE confirmation_responses (
    id TEXT PRIMARY KEY,
    confirmation_id TEXT NOT NULL REFERENCES pending_confirmations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    response TEXT NOT NULL,                -- confirm | reject
    responded_at TEXT NOT NULL,
    UNIQUE(confirmation_id, user_id)
);
```

## 表关系

```
users ─┬── todos ──── todo_changelog (CASCADE DELETE)
       │   └── todo_collaborators (CASCADE DELETE)
       ├── routines ── routine_collaborators (CASCADE DELETE)
       │              └── routine_completions (CASCADE DELETE)
       ├── reviews
       ├── sessions
       ├── conversations ──── chat_messages (CASCADE DELETE)
       ├── chat_usage_log
       ├── english_scenarios
       ├── friendships
       ├── shared_items
       ├── reminders
       ├── push_subscriptions
       ├── notifications
       ├── contacts
       ├── user_settings
       └── pending_confirmations ── confirmation_responses (CASCADE DELETE)
```

所有业务表都通过 `user_id` 外键关联 `users`，实现数据隔离。

## 存储位置

| 环境 | 路径 | 说明 |
|------|------|------|
| **线上** (Fly.io) | `/data/next.db` | 持久卷 `next_data`，部署不丢 |
| **线上备份** | `/data/backups/next-YYYY-MM-DD.db` | 每日 VACUUM INTO |
| **本地调试** | `server/data/next.db` | 与线上无关 |

## 备份策略

- **频率**: 每小时检查，每天首次执行
- **方式**: `VACUUM INTO` — 生成完整压缩副本
- **保留**: 最近 30 天，超期自动清理
- **手动备份**: `flyctl ssh console -C "cat /data/next.db" > backup.db`

## 迁移策略

通过 `db.rs` 中的 `run_migrations()` 在启动时执行：
- 检测列是否存在（`SELECT column FROM table LIMIT 1`）
- 不存在则 `ALTER TABLE ADD COLUMN`
- 所有迁移幂等，可重复执行

当前迁移:
1. `users.avatar` — 头像字段
2. `todo_changelog.changed_by` — 操作者追踪
3. `todos.is_collaborative` — 协作标记
4. `routines.is_collaborative` — 协作标记

## 客户端存储 (localStorage)

| Key | 值类型 | 用途 |
|-----|--------|------|
| `userAvatar` | string | 头像预设名 |
| `theme` | `dark` / `light` / `system` | 主题偏好 |
| `quadrantStates` | JSON object | 各象限折叠状态 |
| `sidebarCollapsed` | boolean | 侧边栏状态 |
