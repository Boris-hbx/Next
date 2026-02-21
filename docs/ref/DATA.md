# Data

> SQLite Schema、存储位置、备份策略

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
    content TEXT DEFAULT '',                       -- 详细描述
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
    label TEXT                         -- 显示标签
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

## 表关系

```
users ─┬── todos ──── todo_changelog (CASCADE DELETE)
       ├── routines
       ├── reviews
       ├── sessions
       ├── conversations ──── chat_messages (CASCADE DELETE)
       └── chat_usage_log
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

## 客户端存储 (localStorage)

| Key | 值类型 | 用途 |
|-----|--------|------|
| `userAvatar` | string | 头像预设名 |
| `theme` | `dark` / `light` / `system` | 主题偏好 |
| `quadrantStates` | JSON object | 各象限折叠状态 |
| `sidebarCollapsed` | boolean | 侧边栏状态 |
