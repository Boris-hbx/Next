# SPEC-042: SPEC-041 并行开发方案
> 起草日期: 2026-02-21
> 状态: 草稿
> 前置: SPEC-041 (协作联系人与共享事项)

## 概述

SPEC-041 涉及 6 张新表、3 个 ALTER、5+ 个新后端文件、多个前端文件改动。
原 spec 分 5 个串行 Phase，由一人完成耗时较长。

本文档将 SPEC-041 重新拆分为可并行开发的工作流：**3 个 Worker 同时推进**，最大化开发效率。

## 核心约束

- `AppState.db` 是 `Arc<Mutex<Connection>>`，所有路由共享同一个 SQLite 连接
- 所有 CREATE TABLE 在 `db.rs` 的 `create_tables()` 中
- 路由注册在 `main.rs`，模块声明在各 `mod.rs`
- **这些共享文件不能并行修改** → 必须先统一搭好骨架

## 整体结构：三阶段

```
Phase 0: 骨架搭建 ──────────────────── (串行, 1人)
         DB schema + 空模块 + 路由注册
         │
         ├── Worker A: 联系人系统 ───── (并行)
         │   contacts CRUD + 设置页 UI
         │
         ├── Worker B: Todo 协作 ────── (并行)
         │   协作设置/查询 + 确认机制 + 前端
         │
         └── Worker C: Routine + 阿宝 ─ (并行)
             Routine 协作 + 工具改造 + 上下文
         │
Phase 2: 集成收尾 ──────────────────── (串行, 1人)
         联调 + 好友删除联动 + 部署
```

---

## Phase 0: 骨架搭建（串行）

一个人完成所有共享基础设施，为三个 Worker 创造互不冲突的工作空间。

### 改动清单

#### 1. `server/src/db.rs` — 新增全部表 + 迁移

在 `create_tables()` 中追加：

```sql
-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    linked_user_id TEXT REFERENCES users(id),
    friendship_id TEXT REFERENCES friendships(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

-- Todo collaborators
CREATE TABLE IF NOT EXISTS todo_collaborators (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'collaborator',
    tab TEXT NOT NULL DEFAULT 'today',
    quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
    sort_order REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE(todo_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_todo_collab_user ON todo_collaborators(user_id, status);
CREATE INDEX IF NOT EXISTS idx_todo_collab_todo ON todo_collaborators(todo_id);

-- Routine collaborators
CREATE TABLE IF NOT EXISTS routine_collaborators (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_routine_collab_user ON routine_collaborators(user_id, status);

-- Routine completions (per-person per-day)
CREATE TABLE IF NOT EXISTS routine_completions (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    completed_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id, completed_date)
);
CREATE INDEX IF NOT EXISTS idx_routine_comp ON routine_completions(routine_id, user_id);

-- Pending confirmations
CREATE TABLE IF NOT EXISTS pending_confirmations (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    action TEXT NOT NULL,
    initiated_by TEXT NOT NULL REFERENCES users(id),
    initiated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_item ON pending_confirmations(item_type, item_id, status);

-- Confirmation responses
CREATE TABLE IF NOT EXISTS confirmation_responses (
    id TEXT PRIMARY KEY,
    confirmation_id TEXT NOT NULL REFERENCES pending_confirmations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    response TEXT NOT NULL,
    responded_at TEXT NOT NULL,
    UNIQUE(confirmation_id, user_id)
);
```

在 `run_migrations()` 中追加：

```rust
// Add changed_by to todo_changelog
let has_changed_by: bool = conn.prepare("SELECT changed_by FROM todo_changelog LIMIT 1").is_ok();
if !has_changed_by {
    conn.execute_batch("ALTER TABLE todo_changelog ADD COLUMN changed_by TEXT;").ok();
}

// Add is_collaborative to todos
let has_todo_collab: bool = conn.prepare("SELECT is_collaborative FROM todos LIMIT 1").is_ok();
if !has_todo_collab {
    conn.execute_batch("ALTER TABLE todos ADD COLUMN is_collaborative INTEGER DEFAULT 0;").ok();
}

// Add is_collaborative to routines
let has_routine_collab: bool = conn.prepare("SELECT is_collaborative FROM routines LIMIT 1").is_ok();
if !has_routine_collab {
    conn.execute_batch("ALTER TABLE routines ADD COLUMN is_collaborative INTEGER DEFAULT 0;").ok();
}
```

#### 2. 新建模型文件（带基础 struct）

- `server/src/models/contact.rs` — `Contact`, `CreateContactRequest` 等 struct
- `server/src/models/collaboration.rs` — `TodoCollaborator`, `PendingConfirmation`, `ConfirmationResponse` 等 struct

#### 3. 新建路由文件（空壳 + TODO 注释）

- `server/src/routes/contacts.rs` — 声明函数签名，body 返回 `todo!()`
- `server/src/routes/collaborate.rs` — Todo 协作 + 确认机制端点
- `server/src/routes/routine_collab.rs` — Routine 协作端点

#### 4. 新建服务文件

- `server/src/services/collaboration.rs` — `check_friendship()`, `get_user_role_for_todo()`, `is_collaborative_todo()` 辅助函数签名

#### 5. 注册所有模块和路由

- `server/src/models/mod.rs` — 加 `pub mod contact; pub mod collaboration;`
- `server/src/routes/mod.rs` — 加 `pub mod contacts; pub mod collaborate; pub mod routine_collab;`
- `server/src/services/mod.rs` — 加 `pub mod collaboration;`
- `server/src/main.rs` — 注册 contacts_routes, collaborate_routes, routine_collab_routes（指向空壳函数）

#### 6. 前端 HTML 结构

- `frontend/index.html` — 添加联系人区块占位 HTML + 确认横幅占位
- `frontend/assets/js/api.js` — 添加所有新 API 方法的空函数

完成后 `cargo check` 确认编译通过。

---

## Phase 1: 并行开发（3 个 Worker 同时进行）

### Worker A: 联系人系统

**独占文件**（不与其他 Worker 冲突）：

| 文件 | 改动 |
|------|------|
| `server/src/routes/contacts.rs` | 实现 CRUD：list/create/update/delete |
| `server/src/models/contact.rs` | 完善 struct 和请求体 |
| `server/src/routes/friends.rs` | `accept_friend` 时自动创建双方 contact 记录 |
| `frontend/assets/js/settings.js` | 联系人管理 UI（替换原好友区块） |
| `frontend/assets/js/friends.js` | 扩展为联系人管理逻辑 |

**功能**：
1. 联系人 CRUD（可协作 vs 自管理两种类型）
2. 好友接受时自动生成双方 contact
3. 设置页"联系人"管理 UI（分可协作/自管理两组）
4. `api.js` 中补充 contacts API 调用

**验证**：
- 设置页能看到联系人列表
- 可添加自管理联系人、编辑备注
- 接受好友请求后自动出现对应联系人

---

### Worker B: Todo 协作 + 确认机制

**独占文件**：

| 文件 | 改动 |
|------|------|
| `server/src/routes/collaborate.rs` | 实现：设置协作人、移除协作、确认/拒绝/撤回 |
| `server/src/services/collaboration.rs` | 实现辅助函数 |
| `server/src/models/collaboration.rs` | 完善 struct |
| `server/src/routes/todos.rs` | `list_todos` 改 UNION ALL；权限扩展 |
| `frontend/assets/js/tasks.js` | 协作卡片渲染（色条 + "来自 XXX"） |
| `frontend/assets/js/modal.js` | 任务弹窗"相关人"选择器 + 确认操作条 |
| `frontend/assets/css/style.css` | 协作色条、chip 标签、等待状态样式 |
| `frontend/assets/css/components.css` | 确认横幅样式 |

**功能**：
1. `POST /api/todos/:id/collaborate` — 设置协作人（验证好友关系）
2. `DELETE /api/todos/:id/collaborate` — 移除协作
3. `list_todos` UNION ALL 协作事项，返回 `is_collaborative`, `collaborator_name`, `my_role`
4. `update_todo` 权限扩展：owner 改 todos 表，collaborator 视图属性改 `todo_collaborators` 表
5. `delete_todo` + 完成 → 协作事项走确认流程
6. `GET /api/confirmations/pending` + `POST /api/confirmations/:id/respond` + `POST /api/confirmations/:id/withdraw`
7. 前端：卡片左侧 2px 协作色条 + meta 行 "来自 XXX" + 确认横幅 + 等待状态
8. Changelog 新增 `changed_by` 字段记录

**验证**：
- 给任务设置协作人 → 对方任务列表出现该任务
- 编辑协作任务 → changelog 记录操作人
- 完成协作任务 → 弹出确认对话 → 对方收到确认请求

---

### Worker C: Routine 协作 + 阿宝工具

**独占文件**：

| 文件 | 改动 |
|------|------|
| `server/src/routes/routine_collab.rs` | 实现：设置/移除 Routine 协作人 |
| `server/src/routes/routines.rs` | `list_routines` UNION ALL；`toggle` 改用 completions |
| `server/src/services/tool_executor.rs` | 4 个工具协作扩展 |
| `server/src/services/context.rs` | 添加协作任务上下文 + 待确认请求 |
| `frontend/assets/js/routines.js` | 协作渲染 + 长按设置相关人 |

**功能**：
1. `POST /api/routines/:id/collaborate` — 设置 Routine 协作人
2. `list_routines` UNION ALL 协作 Routine，各自独立完成状态
3. `toggle_routine` 使用 `routine_completions` 表追踪各人完成
4. `query_todos` 工具 UNION 协作事项，返回 `collaborative: true`
5. `create_todo` 工具新增可选 `collaborator` 参数
6. `update_todo`/`delete_todo` 工具扩展权限检查
7. `context.rs` 添加 "协作任务 (N个)" + "待你确认 (N个)" 注入
8. Routine 列表显示协作标识 + 16px 头像

**验证**：
- 跟阿宝说"和小明一起做XXX" → 创建协作任务
- 阿宝查询任务时能看到协作任务
- Routine 协作者各自独立完成/未完成

---

## Phase 2: 集成收尾（串行）

一个人完成最后的缝合：

1. **好友删除联动**：`friends.rs` `delete_friend` 中级联断开 todo_collaborators + routine_collaborators（status='left'），清除 contacts
2. **旧分享系统过渡**：`shared_items` 相关路由改为只读（不再允许新建），添加 deprecation 提示
3. **前端集成**：
   - `index.html` 确认所有 HTML 占位已正确
   - `api.js` 确认所有 API 方法已连通
   - 版本号递增
4. **通知集成**：确认高优操作（发起完成/删除）触发 SPEC-040 的通知系统
5. `cargo check` → `fly deploy`

---

## 文件所有权矩阵

| 文件 | Phase 0 | Worker A | Worker B | Worker C |
|------|---------|----------|----------|----------|
| `db.rs` | **写** | - | - | - |
| `main.rs` | **写** | - | - | - |
| `models/mod.rs` | **写** | - | - | - |
| `routes/mod.rs` | **写** | - | - | - |
| `services/mod.rs` | **写** | - | - | - |
| `models/contact.rs` | 骨架 | **写** | - | - |
| `models/collaboration.rs` | 骨架 | - | **写** | 读 |
| `routes/contacts.rs` | 骨架 | **写** | - | - |
| `routes/collaborate.rs` | 骨架 | - | **写** | - |
| `routes/routine_collab.rs` | 骨架 | - | - | **写** |
| `services/collaboration.rs` | 骨架 | - | **写** | 读 |
| `routes/friends.rs` | - | **写** | - | - |
| `routes/todos.rs` | - | - | **写** | - |
| `routes/routines.rs` | - | - | - | **写** |
| `services/tool_executor.rs` | - | - | - | **写** |
| `services/context.rs` | - | - | - | **写** |
| `settings.js` / `friends.js` | - | **写** | - | - |
| `tasks.js` / `modal.js` | - | - | **写** | - |
| `routines.js` | - | - | - | **写** |
| `style.css` / `components.css` | - | - | **写** | - |
| `api.js` | 骨架 | 补充 | 补充 | - |
| `index.html` | 骨架 | - | - | - |

- **骨架** = Phase 0 创建空壳
- **写** = 该 Worker 独占修改
- **读** = 只读引用
- **补充** = 在不同位置追加函数，互不冲突

> **关键原则**：每个文件只有一个 writer，消除合并冲突。

---

## 执行方式

使用 3 个 Task agent（`isolation: "worktree"`），每个 Worker 在独立 git worktree 中工作。
Phase 0 完成后 commit，三个 Worker 基于该 commit 分别创建分支并行开发，Phase 2 合并三个分支。
