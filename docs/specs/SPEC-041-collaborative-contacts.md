# SPEC-041: 协作联系人与共享事项
> 起草日期: 2026-02-21
> 状态: 草稿
> 前置: SPEC-039 (好友与分享), SPEC-040 (提醒与推送通知)

## 概述

将现有"好友+快照分享"模式升级为"联系人+实时协作"模式。

三大能力：
1. **联系人管理** — 设置页统一管理联系人，支持注册用户（可协作）和自管理名字（纯标签）
2. **事项协作** — Todo/Routine 设置"相关人"后双方看到同一事项，实时同步编辑，修改记录带操作人
3. **双方确认** — 删除和完成协作事项需双方确认，不可单方面执行

## 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据存几份 | **单份**（创建者名下） | 避免同步问题，SQLite 单连接模型最适合 |
| 视图属性归属 | Owner 存 `todos` 表，Collaborator 存 `todo_collaborators` 表 | 不破坏现有查询，各自独立分类/排序 |
| 协作关联表 | 分开的 `todo_collaborators` + `routine_collaborators` | 避免多态查询，贴合现有代码模式 |
| 确认机制 | 独立 `pending_confirmations` 表 | 不污染 todos/routines 主表 |
| 旧分享系统 | 过渡 30 天后废弃 `shared_items` 表 | 平滑迁移 |
| Routine 完成语义 | 各自独立追踪 | "互相监督"而非"代为完成" |
| 同时编辑冲突 | V1: last-writer-wins + changelog 审计 | 用户量极小，靠记录追溯 |

## 架构

```
用户A: 创建 Todo，设置用户B为相关人
    │
    ▼
todos 表存一份（user_id = A）
    │
    ▼
todo_collaborators 插入一条（todo_id, user_id = B, tab/quadrant/sort_order）
    │
    ▼
用户B list_todos: UNION ALL（自己的 + 协作的）
    │
    ▼
任何一方编辑 → UPDATE todos 共享属性 + INSERT todo_changelog(changed_by)
    │
    ▼
用户A 点完成 → 检测到协作 → 创建 pending_confirmation → 通知用户B
    │
    ▼
用户B 确认 → 执行完成操作 → 通知用户A
```

## 数据库

### 新增表

#### contacts（联系人）

```sql
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    linked_user_id TEXT REFERENCES users(id),  -- NULL = 自管理名字
    friendship_id TEXT REFERENCES friendships(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_linked ON contacts(linked_user_id)
    WHERE linked_user_id IS NOT NULL;
```

- `linked_user_id IS NULL`：自管理名字（纯标签，只用于显示）
- `linked_user_id IS NOT NULL`：注册用户联系人（可协作）
- 接受好友请求时，自动在双方各创建一条 contact 记录

#### todo_collaborators（Todo 协作关联）

```sql
CREATE TABLE IF NOT EXISTS todo_collaborators (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'collaborator',  -- 'collaborator'
    -- 协作者的个人视图属性（各自独立分类）
    tab TEXT NOT NULL DEFAULT 'today',
    quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
    sort_order REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'left'
    created_at TEXT NOT NULL,
    UNIQUE(todo_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_todo_collab_user ON todo_collaborators(user_id, status);
CREATE INDEX IF NOT EXISTS idx_todo_collab_todo ON todo_collaborators(todo_id);
```

- Owner 的 tab/quadrant/sort_order 仍存 `todos` 表（零改动兼容）
- Collaborator 的视图属性存此表（各自独立分类和排序）

#### routine_collaborators（Routine 协作关联）

```sql
CREATE TABLE IF NOT EXISTS routine_collaborators (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_routine_collab_user ON routine_collaborators(user_id, status);
```

#### routine_completions（Routine 每人每天独立完成记录）

```sql
CREATE TABLE IF NOT EXISTS routine_completions (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    completed_date TEXT NOT NULL,  -- YYYY-MM-DD
    created_at TEXT NOT NULL,
    UNIQUE(routine_id, user_id, completed_date)
);
CREATE INDEX IF NOT EXISTS idx_routine_comp ON routine_completions(routine_id, user_id);
```

- 协作 Routine 的完成状态各自独立（A 完成不影响 B 的状态）
- 语义："互相监督"，不是"代为完成"

#### pending_confirmations（双方确认请求）

```sql
CREATE TABLE IF NOT EXISTS pending_confirmations (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,        -- 'todo' | 'routine'
    item_id TEXT NOT NULL,
    action TEXT NOT NULL,           -- 'complete' | 'delete'
    initiated_by TEXT NOT NULL REFERENCES users(id),
    initiated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'cancelled'
    resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_item ON pending_confirmations(item_type, item_id, status);
```

#### confirmation_responses（确认回应记录）

```sql
CREATE TABLE IF NOT EXISTS confirmation_responses (
    id TEXT PRIMARY KEY,
    confirmation_id TEXT NOT NULL REFERENCES pending_confirmations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    response TEXT NOT NULL,         -- 'confirm' | 'reject'
    responded_at TEXT NOT NULL,
    UNIQUE(confirmation_id, user_id)
);
```

### 修改现有表

```sql
-- todo_changelog 新增操作人字段
ALTER TABLE todo_changelog ADD COLUMN changed_by TEXT;

-- todos 新增协作标记（方便快速过滤）
ALTER TABLE todos ADD COLUMN is_collaborative INTEGER DEFAULT 0;

-- routines 同理
ALTER TABLE routines ADD COLUMN is_collaborative INTEGER DEFAULT 0;
```

### 迁移策略

1. `changed_by` 回填：历史 changelog 的 `changed_by` 设为 todo 的 `user_id`（单人场景必定是自己）
2. Contacts 自动生成：从已接受的 friendships 自动在双方创建 contact 记录
3. `shared_items` 表保留 30 天，停止写入新数据，旧数据仍可查看

### 废弃

- `shared_items` 表 — 快照分享模式被实时协作取代

## API 端点

### 联系人

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/contacts` | 获取所有联系人（好友 + 自管理） |
| POST | `/api/contacts` | 创建自管理联系人 |
| PUT | `/api/contacts/:id` | 更新联系人名字/备注 |
| DELETE | `/api/contacts/:id` | 删除联系人 |

### 协作管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/todos/:id/collaborate` | 设置 Todo 协作人 `{ friend_user_id }` |
| DELETE | `/api/todos/:id/collaborate` | 移除 Todo 协作关系 |
| GET | `/api/todos/:id/collaborators` | 查看协作者列表 |
| POST | `/api/routines/:id/collaborate` | 设置 Routine 协作人 |
| DELETE | `/api/routines/:id/collaborate` | 移除 Routine 协作关系 |

### 确认机制

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/confirmations/pending` | 获取待我确认的请求列表 |
| POST | `/api/confirmations/:id/respond` | 确认/拒绝 `{ response: "confirm"|"reject" }` |
| POST | `/api/confirmations/:id/withdraw` | 发起方撤回请求 |

### 现有 API 改造

- `GET /api/todos` — 返回结果 UNION 协作事项，新增字段 `is_collaborative`, `collaborator_name`, `my_role`, `pending_confirmation`
- `PUT /api/todos/:id` — 权限检查扩展为 owner + collaborator；视图属性按角色路由到不同表
- `DELETE /api/todos/:id` — 协作事项走确认流程，返回 `{ message: "已发起删除确认" }`
- `GET /api/todos/counts` — 合并统计自己的 + 协作的
- `GET /api/routines` — 同理 UNION 协作 Routine，返回双方各自的完成状态
- `POST /api/routines/:id/toggle` — 协作 Routine 操作 `routine_completions` 表

## 双方确认状态机

```
用户A发起完成/删除
    │
    ▼
┌──────────┐
│ pending  │  A: 自动 confirm
│          │  B: 待回应
└────┬─────┘
     │
     ├── B confirm ──▶ ┌───────────┐
     │                 │ confirmed │ → 执行实际操作（完成/删除）
     │                 └───────────┘
     │
     ├── B reject ───▶ ┌───────────┐
     │                 │ cancelled │ → 恢复原状，通知 A
     │                 └───────────┘
     │
     └── A withdraw ─▶ ┌───────────┐
                       │ cancelled │ → 恢复原状
                       └───────────┘

超时: 7 天无回应自动 cancelled
```

## 核心查询模式

### 查询"我的所有 todos"（UNION ALL 模式）

```sql
-- 自己拥有的（tab/quadrant 从 todos 表取）
SELECT t.*, NULL as collaborator_name, 'owner' as my_role
FROM todos t
WHERE t.user_id = ?1 AND t.deleted = 0 AND (?2 IS NULL OR t.tab = ?2)

UNION ALL

-- 协作给我的（tab/quadrant 从 todo_collaborators 取）
SELECT t.id, t.text, t.content, tc.tab, tc.quadrant, t.progress,
       t.completed, t.completed_at, t.due_date, t.deleted,
       t.assignee, t.tags, t.created_at, t.updated_at,
       t.deleted_at, tc.sort_order, t.is_collaborative,
       u.display_name as collaborator_name, 'collaborator' as my_role
FROM todos t
JOIN todo_collaborators tc ON tc.todo_id = t.id AND tc.user_id = ?1 AND tc.status = 'active'
JOIN users u ON u.id = t.user_id
WHERE t.deleted = 0 AND (?2 IS NULL OR tc.tab = ?2)

ORDER BY completed ASC, sort_order ASC;
```

### 权限检查辅助函数

```rust
fn get_user_role_for_todo(db, todo_id, user_id) -> Option<"owner"|"collaborator">
fn is_collaborative_todo(db, todo_id) -> bool
fn check_friendship(db, user_a, user_b) -> bool
```

## 前端改动

### 设置页联系人管理

现有"好友"区块升级为"联系人"：

```
联系人 (5)
├─ 可协作（注册用户好友）
│   └─ [头像] Boris @boris     [x]
│   └─ [头像] Alice @alice     [x]
├─ 自管理（纯标签）
│   └─ [灰圆] 小明 [编辑] [x]
│   └─ [灰圆] 经理 [编辑] [x]
└─ [+ 添加联系人]
```

添加联系人弹窗分两区：搜索注册用户（发好友请求） + 手动输入名字（自管理联系人）。

### Todo 弹窗：相关人选择器

任务弹窗左侧面板新增"相关人"区域：

```
相关人
[Boris 🔗 x]           ← chip 标签
[+ 添加相关人]          ← 点击弹出联系人下拉选择器
```

选择器样式复用现有 `.date-popover` 定位模式。只有可协作联系人才能设为相关人。

### Routine：相关人设置

Routine item 上长按（移动端）弹出操作菜单 → "设置相关人" → 同样的联系人选择器。
已设相关人在 item 右侧显示 16px 首字母小头像。

### 共享事项视觉区分

**卡片**：左侧 2px 协作色条（`#6366f1`）+ meta 行显示"来自 XXX"

```
▎[○] [30] 帮我检查报告      后天  Boris
▎          来自 Boris
```

**移动端扁平列表**：

```
▎[○] 帮我检查报告             [🔥]
▎     共享 · Boris · 后天
```

### 双方确认交互

**发起完成**：

```
┌──────────────────────────────────┐
│  此事项与 Boris 共享，            │
│  需要对方确认后才会正式完成。     │
│  [取消]         [发起完成请求]    │
└──────────────────────────────────┘
```

**等待状态**：checkbox 内旋转弧线动画 + 文字"等待 Boris 确认完成"

**对方收到**：顶部横幅（不自动消失）+ 铃铛角标 + Web Push（高优先级）

```
🔗 Boris 请求将「帮我检查报告」标为完成
   [同意]  [拒绝]  [查看详情]
```

### 修改记录（Changelog）

```
变更记录 ▼
┌────────────────────────────────────┐
│ 2分钟前   Boris: 进度 0% → 50%    │
│ 1小时前   我: 修改标题              │
│ 今天10:30 Boris: 创建事项          │
└────────────────────────────────────┘
```

本人操作显示"我"，对方操作显示名字。

### 通知分级（复用 SPEC-040 基础设施）

| 操作类型 | 通知级别 | 表现 |
|---------|---------|------|
| 修改进度/标题 | 低 | 铃铛角标 +1 |
| 修改截止日期 | 中 | 铃铛 + 面板 |
| 发起完成/删除请求 | 高 | 顶部横幅 + 铃铛 + Web Push |
| 确认/拒绝请求 | 高 | 顶部横幅 + Web Push |

### 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/assets/js/friends.js` | 扩展为联系人管理 |
| `frontend/assets/js/modal.js` | 相关人选择器 + 确认操作条 |
| `frontend/assets/js/tasks.js` | 协作卡片渲染 + 等待状态 |
| `frontend/assets/js/routines.js` | Routine 协作渲染 + 长按菜单 |
| `frontend/assets/js/api.js` | 新增联系人/协作/确认 API |
| `frontend/assets/js/settings.js` | 联系人管理 UI |
| `frontend/assets/css/abao.css` 或 `style.css` | 协作色条、chip、横幅样式 |
| `frontend/index.html` | 联系人区块 HTML + 确认横幅 |

## 阿宝集成

### 工具改造

| 工具 | 改动 |
|------|------|
| `query_todos` | UNION 协作事项，返回 `collaborative: true` + `collaborator_with` |
| `create_todo` | 新增可选参数 `collaborator`（用户名），自动建立协作关系 |
| `update_todo` | 权限扩展为 owner + collaborator；完成协作事项走确认流程 |
| `delete_todo` | 协作事项走确认流程，返回确认信息 |

### 系统提示词新增

```
## 协作任务规则
- 用户说"和XX一起做/跟XX协作" → 创建任务时加 collaborator 参数
- 协作任务的完成和删除需要双方确认，会自动发起确认请求
- 查询任务时会同时返回自己的和协作的任务
- 协作任务会标记 collaborative: true
```

### 上下文注入新增

```
## 协作任务 (N个)
- [ ] 任务标题 (ID:xxx, 与:小明, 进度:60%)

## 待你确认 (N个)
- 小明请求完成「任务标题」
```

## 边界情况

| 场景 | 处理 |
|------|------|
| 删除好友 | 断开所有双方协作关系（status='left'），事项保留在各自名下 |
| 协作人离开 | 事项恢复为非协作，`is_collaborative=0` |
| 同时编辑 | V1: last-writer-wins，changelog 完整记录 |
| 超时未确认 | 7 天后自动 cancelled |
| 非好友设相关人 | API 拒绝，必须是 accepted 好友 |
| 旧分享收件箱 | 保留 30 天只读，不允许新建 |

## 实施阶段

### Phase 1: 基础设施
- 数据库 6 张新表 + 3 个 ALTER + 迁移
- `contacts` CRUD 路由
- 设置页联系人管理 UI

### Phase 2: Todo 协作核心
- `todo_collaborators` 设置/移除路由
- `list_todos` / `get_todo` / `update_todo` 协作扩展
- Todo 弹窗相关人选择器
- 卡片协作视觉标识
- Changelog `changed_by` 记录

### Phase 3: 双方确认
- `pending_confirmations` + `confirmation_responses` 路由
- 完成/删除拦截 → 确认流程
- 确认横幅 UI + 等待状态
- 与 SPEC-040 通知系统集成

### Phase 4: Routine 协作
- `routine_collaborators` + `routine_completions`
- Routine 列表/toggle 协作扩展
- 长按设置相关人 UI

### Phase 5: 阿宝工具 + 收尾
- 工具改造（query/create/update/delete）
- 系统提示词 + 上下文注入
- 废弃旧 `shared_items` 路由
- 好友删除联动

## 后端新文件

| 文件 | 作用 |
|------|------|
| `server/src/routes/contacts.rs` | 联系人 CRUD |
| `server/src/routes/collaborate.rs` | 协作设置/移除 + 确认机制 |
| `server/src/models/contact.rs` | Contact 模型 |
| `server/src/models/collaboration.rs` | 协作相关模型 |
| `server/src/services/collaboration.rs` | 辅助函数（角色检查、好友验证等） |

## 后端改动文件

| 文件 | 改动 |
|------|------|
| `server/src/db.rs` | 新增 6 张表 + ALTER 迁移 |
| `server/src/main.rs` | 注册新路由 |
| `server/src/routes/mod.rs` | 导出新模块 |
| `server/src/routes/todos.rs` | list/get/update/delete 协作扩展 |
| `server/src/routes/routines.rs` | list/toggle/delete 协作扩展 |
| `server/src/routes/friends.rs` | 删除好友时断开协作 |
| `server/src/services/tool_executor.rs` | 4 个工具改造 |
| `server/src/services/context.rs` | 提示词 + 上下文新增 |
| `server/src/models/todo.rs` | Todo/ChangeEntry 结构扩展 |
