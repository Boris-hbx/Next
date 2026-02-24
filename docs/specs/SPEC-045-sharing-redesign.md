# SPEC-045: 分享功能重新设计
> 起草日期: 2026-02-23
> 状态: 草稿
> 前置: SPEC-041 (协作联系人), SPEC-039 (好友与分享)

## 一、现状分析

### 1.1 现有架构概览

**涉及的表**:
- `friendships` — 好友关系 (requester_id, addressee_id, status)
- `shared_items` — 分享记录 (sender_id, recipient_id, item_type, item_id, item_snapshot, status)
- `contacts` — 联系人 (好友接受后自动创建)
- `todo_collaborators` / `routine_collaborators` — 实时协作 (SPEC-041 已实现)

**涉及的路由**:
- `POST /api/share` — 发送分享 (快照模式)
- `GET /api/share/inbox` — 获取收件箱
- `GET /api/share/inbox/count` — 未读计数
- `POST /api/share/:id/accept` — 接受分享 (复制到自己名下)
- `POST /api/share/:id/dismiss` — 忽略分享

**涉及的前端文件**:
- `friends.js` — Friends IIFE: 好友管理 + 分享弹窗 + 收件箱
- `english.js` — Learn 详情页 📤 按钮调用 `Friends.openShareModal('scenario', id)`
- `modal.js` — Todo 详情弹窗 (无分享入口)
- `index.html` — `#shared-section` 在 Todo 侧边栏、`#share-modal-overlay` 全局弹窗

### 1.2 现有分享流程

```
发送方:
Learn 详情页 → 点击 📤 → shareCurrentScenario()
  → Friends.openShareModal('scenario', scenarioId)
  → 渲染好友列表弹窗 (#share-modal-overlay)
  → 点击好友 → doShare(friendId)
  → API.shareItem(friendId, 'scenario', itemId)
  → 后端: 验证好友关系 → 构建 item_snapshot JSON → INSERT shared_items
  → 前端: showToast('分享成功')

接收方 (设计意图):
页面加载 → (某处调用) Friends.loadSharedInbox()
  → API.getSharedInbox() → 渲染到 #shared-inbox-section
  → 点击"收下" → acceptShared(id) → 后端复制数据到接收方名下
  → 点击"忽略" → dismissShared(id) → 标记 dismissed
```

### 1.3 支持的分享类型

后端 `share_item()` 支持三种 item_type:
| item_type | 快照字段 | accept 行为 |
|-----------|---------|------------|
| `todo` | text, content, tab, quadrant, progress, due_date, assignee, tags | INSERT INTO todos |
| `review` | text, frequency, frequency_config, notes, category | INSERT INTO reviews |
| `scenario` | title, title_en, description, icon, content, category, notes | INSERT INTO english_scenarios |

**注意**: `routine`（每日例行）和 `expense`（账单）不在现有分享支持范围内。

---

## 二、Bug 根因分析：英语场景分享对方收不到

### 2.1 Bug 症状

用户 A 分享英语场景给用户 B，A 看到"分享成功"，但 B 在任何页面都看不到分享内容。

### 2.2 根因链条

**根因 #1: `Friends.loadSharedInbox()` 从未被调用**

该函数在 `friends.js:266` 定义，在 `friends.js:378` 导出，但全项目搜索 `Friends.loadSharedInbox` **零个调用点**。没有任何页面加载、导航事件、定时器触发它。

```
// friends.js:266 - 函数定义了
async function loadSharedInbox() { ... }

// friends.js:378 - 导出了
return { ..., loadSharedInbox: loadSharedInbox, ... };

// 但是...整个项目中没有任何地方调用 Friends.loadSharedInbox()
```

**根因 #2: `inbox-badge` HTML 元素不存在**

`friends.js:351` 中 `updateInboxBadge()` 尝试操作 `#inbox-badge` 元素，但 `index.html` 中不存在该元素。虽然 `updateInboxBadge()` 在页面加载 2 秒后被调用（`friends.js:371-373`），但因为元素不存在，`if (badge)` 判断直接跳过，什么也不做。

**根因 #3: `#shared-section` 没有可见入口**

`index.html:329` 中的 `#shared-section` 放在 Todo 侧边栏内，但：
- 没有 `section-header`（其他 sidebar-section 都有 header + toggle）
- 没有展开/折叠机制
- 即使内容被渲染进去，在移动端侧边栏不一定可见

**根因 #4: 设计断层 — 分享结果放错了地方**

英语场景分享后，接收方的收件箱在 Todo 页面的侧边栏里（`#shared-section`）。但接收方可能根本不会去 Todo 侧边栏看。逻辑上，英语场景的分享通知应该出现在学习页面。

### 2.3 Bug 影响链

```
发送方操作    ──→ 后端写入 shared_items ✅
                          │
                 recipient_id 对应的用户 B
                          │
            ┌─────────────┴─────────────┐
            │                           │
    updateInboxBadge()           loadSharedInbox()
    (2秒后自动调用)               (从未被调用)
            │                           │
    #inbox-badge 不存在         收件箱永远为空
            │                           │
         静默失败 ❌                 不渲染 ❌
            │                           │
            └───────── 用户 B 什么也看不到 ─────┘
```

### 2.4 快速修复 vs 系统性重做

**快速修复**（能让现有功能跑通）：
1. 在 `index.html` 添加 `<span id="inbox-badge" class="inbox-badge" style="display:none"></span>`
2. 在 `app.js` 的页面初始化逻辑中调用 `Friends.loadSharedInbox()`
3. 给 `#shared-section` 添加 section-header

**系统性重做**（本 SPEC 的方案）：
统一所有模块的分享体验，覆盖 todo/routine/scenario/expense，重新设计收件箱和通知。

---

## 三、新分享体验设计

### 3.1 设计原则

1. **就近触达** — 分享通知出现在对应模块内（不是统一堆在侧边栏）
2. **操作最短路径** — 分享操作最多 2 步完成（选人 → 发送）
3. **状态可见** — 发送方能看到"已分享给谁"，接收方能看到"谁分享给我"
4. **渐进式** — 先修通现有 scenario 分享，再扩展到其他模块

### 3.2 覆盖模块

| 模块 | item_type | 分享语义 | 优先级 |
|------|-----------|---------|--------|
| 学习笔记 | `scenario` | 发送笔记副本 | P0 (已有后端) |
| 待办事项 | `todo` | 发送任务副本 | P0 (已有后端) |
| 例行审视 | `review` | 发送审视项副本 | P1 (已有后端) |
| 每日例行 | `routine` | 发送例行副本 | P2 (需加后端) |
| 账单 | `expense` | 发送账单副本 | P3 (需加后端) |

### 3.3 交互流程设计

#### 3.3.1 发送方 — 入口

**学习笔记 (现有入口优化)**:
```
详情页顶部 action bar:  [✏️ 编辑] [✨ AI] [📤 分享]
                                              │
                                    点击 → 打开好友选择器
```

**待办事项 (新增入口)**:
```
方式1: 任务详情弹窗 → 底部新增 [📤 分享] 按钮
方式2: 任务卡片长按 → 弹出操作菜单 → [分享]

┌─────────────────────────────┐
│  任务详情                ✏️  │
│─────────────────────────────│
│  标题: 买咖啡豆              │
│  ...                        │
│─────────────────────────────│
│  👥 协作者   📤 分享         │
│  [创建] / [保存]            │
└─────────────────────────────┘
```

**例行审视 (新增入口)**:
```
审视项卡片 → 点击展开详情 → [📤 分享] 按钮
```

**账单 (新增入口)**:
```
账单详情页 → 顶部 action bar → [📤 分享]
```

#### 3.3.2 好友选择器 (统一组件)

所有模块共用同一个好友选择器弹窗，改进现有 `#share-modal-overlay`：

```
┌───────────────────────────────┐
│    分享给好友                  │
│───────────────────────────────│
│                               │
│  ┌──┐  张三         [发送]    │
│  │张│  @zhangsan              │
│  └──┘                         │
│                               │
│  ┌──┐  李四         [发送]    │
│  │李│  @lisi                  │
│  └──┘                         │
│                               │
│  ┌──┐  王五     ✓ 已分享      │
│  │王│  @wangwu                │
│  └──┘                         │
│                               │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  💬 附言 (可选):              │
│  ┌─────────────────────────┐  │
│  │ 这个场景很适合你练习      │  │
│  └─────────────────────────┘  │
│                               │
│         [取消]                │
└───────────────────────────────┘
```

改进点:
- **重复分享检测**: 如果已经分享给某人，显示"✓ 已分享"而非"发送"按钮
- **附言输入**: 在好友列表下方添加可选的留言框
- **发送反馈**: 点击发送后，按钮变为 ✓ 并禁用，无需关闭弹窗

#### 3.3.3 发送后状态显示

**学习笔记列表**:
```
┌─────────────────────────────────┐
│ 点咖啡常用英语                    │
│ Good morning, can I get a...    │
│ 🇬🇧 英语 · 3小时前 · 📤 张三    │
└─────────────────────────────────┘
```

**任务卡片**:
```
┌─────────────────────────────────┐
│ ☐ 买咖啡豆                      │
│    📤 → 张三                    │
└─────────────────────────────────┘
```

实现方式: 查询 `shared_items` 表中 `sender_id = 当前用户 AND item_id = 该条目` 的记录，展示收件人列表。

#### 3.3.4 接收方 — 通知入口

**方案: 全局通知中心 + 模块内提示**

```
┌─ 顶部导航 ─────────────────────────────────┐
│  ☀️ 做对下一步          [🔔 2]  [头像]     │
└─────────────────────────────────────────────┘
                             │
                     点击展开通知面板
                             │
         ┌───────────────────────────────┐
         │  🔔 通知                       │
         │───────────────────────────────│
         │  📖 张三分享了笔记给你          │
         │  "点咖啡常用英语"    [查看]     │
         │  2分钟前                       │
         │                               │
         │  ✓ 李四分享了任务给你           │
         │  "买咖啡豆"         [查看]     │
         │  1小时前                       │
         │───────────────────────────────│
         │        [查看全部]              │
         └───────────────────────────────┘
```

**通知面板行为**:
- 点击 [查看] → 跳转到对应模块的"收到的分享"视图
- 通知 badge 显示未处理的分享数量
- 利用现有 `notifications` 表 + `updateInboxBadge()` 机制

**模块内收件箱**:

每个模块页面顶部增加"收到的分享"入口（仅当有未处理分享时显示）：

```
┌─ 学习页面 ──────────────────────────────────┐
│  ┌──────────────────────────────────────┐   │
│  │ 📥 你有 2 条新分享                    │   │  ← 仅当有未处理分享时显示
│  └──────────────────────────────────────┘   │
│  [全部] [🇬🇧 英语] [💻 编程] ...            │
│                                             │
│  ┌─ 点咖啡常用英语 ───────────────────┐     │
│  │ Good morning, can I get a...       │     │
│  │ 🇬🇧 英语 · 3小时前                 │     │
│  └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

点击后展开收到的分享列表：

```
┌─ 收到的分享 ────────────────────────────────┐
│  ← 返回                                    │
│─────────────────────────────────────────────│
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ 📖 点咖啡常用英语                     │   │
│  │ 来自 张三 · 10分钟前                  │   │
│  │ 💬 "这个场景很适合你练习"              │   │
│  │                                      │   │
│  │ Good morning, can I get a latte...   │   │  ← 预览快照内容
│  │                                      │   │
│  │  [收下到我的笔记]    [忽略]           │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ ✓ 面试自我介绍                        │   │
│  │ 来自 李四 · 2小时前                   │   │
│  │                                      │   │
│  │  [收下到我的笔记]    [忽略]           │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3.3.5 接收方操作

| 操作 | 行为 | 技术实现 |
|------|------|---------|
| **收下** | 将快照内容复制到自己的对应列表 | 现有 `accept_shared` 逻辑已实现 |
| **忽略** | 标记为 dismissed，不再显示 | 现有 `dismiss_shared` 逻辑已实现 |
| **预览** | 在收件箱内展开查看快照内容 | 前端渲染 item_snapshot |

#### 3.3.6 移动端交互

移动端无侧边栏，采用以下方案：

```
底部导航:
[Todo] [例行] [🐾] [学习] [生活]

通知入口: 顶部 header 右侧的 🔔 按钮 (在头像旁)
模块内: 同桌面端的 "📥 你有 N 条新分享" 横幅
```

---

## 四、数据库方案

### 4.1 现有表评估

`shared_items` 表 **基本够用**，字段评估：

| 字段 | 现状 | 需要改动? |
|------|------|----------|
| id | TEXT PK | ✅ 不变 |
| sender_id | TEXT FK users | ✅ 不变 |
| recipient_id | TEXT FK users | ✅ 不变 |
| item_type | TEXT (todo/review/scenario) | ✅ 需扩展支持 routine/expense |
| item_id | TEXT | ✅ 不变 |
| item_snapshot | TEXT (JSON) | ✅ 不变 |
| message | TEXT | ✅ 不变 (附言) |
| status | TEXT (unread/read/accepted/dismissed) | ✅ 不变 |
| created_at | TEXT | ✅ 不变 |

### 4.2 需要的改动

**无需修改表结构**。现有 `shared_items` 表已经足够支持所有需求。

需要的改动都在后端逻辑层:

#### 4.2.1 扩展 share_item 支持 routine 和 expense

在 `friends.rs` 的 `share_item()` 函数中添加两个新的 match 分支:

```rust
// 新增: routine 快照
"routine" => {
    db.query_row(
        "SELECT id, text FROM routines WHERE id = ?1 AND user_id = ?2",
        params![req.item_id, user_id.0],
        |row| Ok(json!({
            "id": row.get::<_, String>(0)?,
            "text": row.get::<_, String>(1)?
        }))
    ).ok()
}

// 新增: expense 快照
"expense" => {
    db.query_row(
        "SELECT id, amount, date, notes, tags, currency FROM expense_entries WHERE id = ?1 AND user_id = ?2",
        params![req.item_id, user_id.0],
        |row| Ok(json!({
            "id": row.get::<_, String>(0)?,
            "amount": row.get::<_, f64>(1)?,
            "date": row.get::<_, String>(2)?,
            "notes": row.get::<_, String>(3).unwrap_or_default(),
            "tags": row.get::<_, String>(4).unwrap_or_else(|_| "[]".into()),
            "currency": row.get::<_, String>(5).unwrap_or_else(|_| "CAD".into())
        }))
    ).ok()
}
```

#### 4.2.2 扩展 accept_shared 支持 routine 和 expense

```rust
"routine" => {
    let text = snapshot["text"].as_str().unwrap_or("(分享的例行)");
    db.execute(
        "INSERT INTO routines (id, user_id, text, completed_today, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        params![new_id, user_id.0, text, now],
    ).ok();
}

"expense" => {
    let amount = snapshot["amount"].as_f64().unwrap_or(0.0);
    let date = snapshot["date"].as_str().unwrap_or(&now);
    let notes = snapshot["notes"].as_str().unwrap_or("");
    let tags = snapshot["tags"].as_str().unwrap_or("[]");
    let currency = snapshot["currency"].as_str().unwrap_or("CAD");
    db.execute(
        "INSERT INTO expense_entries (id, user_id, amount, date, notes, tags, currency, ai_processed, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)",
        params![new_id, user_id.0, amount, date, notes, tags, currency, now, now],
    ).ok();
}
```

#### 4.2.3 新增 API: 查询某条目的分享状态

用于"已分享给: 张三、李四"的发送方状态显示:

```
GET /api/share/sent?item_type=scenario&item_id=xxx
```

```sql
SELECT s.id, s.recipient_id, u.display_name, u.username, s.status, s.created_at
FROM shared_items s
JOIN users u ON s.recipient_id = u.id
WHERE s.sender_id = ?1 AND s.item_type = ?2 AND s.item_id = ?3
ORDER BY s.created_at DESC
```

#### 4.2.4 新增 API: 按类型查询收件箱

用于模块内的"收到的分享"视图:

```
GET /api/share/inbox?type=scenario
```

在现有 `shared_inbox` 查询中增加可选的 type 过滤:

```sql
-- 当 type 参数存在时
WHERE s.recipient_id = ?1 AND s.status IN ('unread', 'read') AND s.item_type = ?2
```

---

## 五、API 方案

### 5.1 现有 API (保持不变)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/share` | 发送分享 |
| POST | `/api/share/:id/accept` | 接受分享 |
| POST | `/api/share/:id/dismiss` | 忽略分享 |

### 5.2 需要修改的 API

| 方法 | 路径 | 修改内容 |
|------|------|---------|
| GET | `/api/share/inbox` | 增加 `?type=` 可选过滤参数 |
| POST | `/api/share` | `item_type` 扩展支持 `routine` 和 `expense` |
| POST | `/api/share/:id/accept` | 扩展支持 `routine` 和 `expense` 的 accept |

### 5.3 新增 API

| 方法 | 路径 | 说明 | 请求 | 响应 |
|------|------|------|------|------|
| GET | `/api/share/sent` | 查询当前用户发出的分享 | `?item_type=&item_id=` | `{ success, items: [{ id, recipient_id, recipient_name, status, created_at }] }` |

### 5.4 路由注册 (main.rs)

```rust
let share_routes = Router::new()
    .route("/", post(routes::friends::share_item))
    .route("/inbox", get(routes::friends::shared_inbox))
    .route("/inbox/count", get(routes::friends::shared_inbox_count))
    .route("/sent", get(routes::friends::shared_sent))        // 新增
    .route("/{id}/accept", post(routes::friends::accept_shared))
    .route("/{id}/dismiss", post(routes::friends::dismiss_shared));
```

---

## 六、前端组件方案

### 6.1 需要修改的文件

| 文件 | 改动 |
|------|------|
| `friends.js` | 改进好友选择器、修复收件箱加载、添加重复检测 |
| `english.js` | 添加分享状态显示、添加"收到的分享"横幅 |
| `modal.js` | 任务详情弹窗添加分享按钮 |
| `app.js` | 页面切换时触发对应模块的收件箱加载 |
| `api.js` | 新增 `getSharedSent()` API 调用 |
| `index.html` | 添加通知 badge、修复 inbox 容器、各模块添加分享收件横幅 |
| `style.css` | 新增分享相关样式 |

### 6.2 新增/改进组件

#### 6.2.1 改进好友选择器 (friends.js)

```javascript
// 改进: openShareModal 支持重复分享检测
async function openShareModal(itemType, itemId) {
    shareContext = { itemType, itemId };
    // 并行加载好友列表 + 已分享状态
    var [friendsResp, sentResp] = await Promise.all([
        friends.length ? { success: true, items: friends } : API.getFriends(),
        API.getSharedSent(itemType, itemId)
    ]);
    // sentResp.items 中的 recipient_id 集合 = 已分享对象
    renderShareFriendsList(friendsResp.items, sentResp.items);
    // 显示弹窗
}
```

#### 6.2.2 模块内分享横幅

每个模块页面顶部的"收到的分享"提示条:

```javascript
// 通用函数: 检查并渲染分享横幅
async function renderShareBanner(containerSelector, itemType) {
    var resp = await API.getSharedInbox(itemType);
    var container = document.querySelector(containerSelector);
    if (!container) return;
    var unread = (resp.items || []).filter(function(i) { return i.status === 'unread'; });
    if (unread.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = '<div class="share-banner" onclick="openShareInbox(\'' + itemType + '\')">' +
        '📥 你有 ' + unread.length + ' 条新分享</div>';
}
```

#### 6.2.3 分享收件箱视图

```javascript
// 模块内的分享收件箱: 替换当前列表显示收到的分享
function openShareInbox(itemType) {
    // 隐藏模块正常列表
    // 显示收到的分享列表 (含预览 + 收下/忽略按钮)
    // 返回按钮 → 回到正常列表
}
```

#### 6.2.4 通知 badge

在 `index.html` 的 header 区域添加:

```html
<div class="header-notifications" onclick="toggleNotificationPanel()">
    🔔 <span id="inbox-badge" class="inbox-badge" style="display:none">0</span>
</div>
```

### 6.3 app.js 页面切换集成

```javascript
function switchPage(page) {
    // ... 现有逻辑 ...

    // 加载对应模块的分享横幅
    if (page === 'todo') {
        renderShareBanner('#todo-share-banner', 'todo');
    }
    if (page === 'english') {
        renderShareBanner('#english-share-banner', 'scenario');
    }
    if (page === 'review') {
        renderShareBanner('#review-share-banner', 'review');
    }
    if (page === 'life') {
        renderShareBanner('#expense-share-banner', 'expense');
    }
}
```

### 6.4 api.js 新增

```javascript
// 查询发出的分享 (发送方状态显示)
getSharedSent: async function(itemType, itemId) {
    return await request('GET', '/share/sent?item_type=' + encodeURIComponent(itemType)
        + '&item_id=' + encodeURIComponent(itemId));
},

// 按类型查询收件箱
getSharedInbox: async function(type) {
    var path = '/share/inbox';
    if (type) path += '?type=' + encodeURIComponent(type);
    return await request('GET', path);
},
```

---

## 七、实施计划

### Phase 1: 修复现有 bug (P0, 1-2小时)

让现有 scenario 分享功能跑通。

1. **`index.html`**: 在 header 添加 `#inbox-badge` 元素
2. **`index.html`**: 给 `#shared-section` 添加 section-header
3. **`app.js`**: 在 `switchPage()` 中添加 `Friends.loadSharedInbox()` 调用
4. **`friends.js`**: 确保 `loadSharedInbox()` 在页面初始化时执行一次

### Phase 2: 统一好友选择器 + 重复检测 (P0, 2-3小时)

1. **后端**: 实现 `GET /api/share/sent` 端点
2. **`api.js`**: 添加 `getSharedSent()` 调用
3. **`friends.js`**: 改进 `openShareModal()` 支持重复分享检测 + 附言
4. **`friends.js`**: 发送后按钮变为 ✓ 状态

### Phase 3: 模块内分享横幅 + 收件箱 (P1, 3-4小时)

1. **后端**: `shared_inbox` 支持 `?type=` 过滤
2. **`api.js`**: `getSharedInbox()` 支持 type 参数
3. **`index.html`**: 各模块添加 `#xxx-share-banner` 容器
4. **`friends.js`**: 实现 `renderShareBanner()` + `openShareInbox()` 通用函数
5. **`app.js`**: `switchPage()` 中触发横幅加载
6. **`english.js`**: 列表中展示分享状态 ("📤 张三")

### Phase 4: 扩展分享类型 (P1, 2-3小时)

1. **后端 `friends.rs`**: `share_item()` 添加 routine/expense match 分支
2. **后端 `friends.rs`**: `accept_shared()` 添加 routine/expense 复制逻辑
3. **`modal.js`**: 任务详情弹窗添加 📤 分享按钮
4. **审视/账单页面**: 添加分享入口

### Phase 5: 通知集成 (P2, 2-3小时)

1. **后端**: 分享时自动创建 `notifications` 记录
2. **`index.html`**: 顶部 header 添加通知图标 + 面板
3. **前端**: 通知面板渲染 + 点击跳转

---

## 八、测试用例清单

### 8.1 发送方测试

| # | 测试用例 | 预期结果 |
|---|---------|---------|
| S1 | 分享 scenario 给好友 | toast "分享成功"，shared_items 表有记录 |
| S2 | 分享 todo 给好友 | 同上 |
| S3 | 分享 review 给好友 | 同上 |
| S4 | 分享 routine 给好友 (Phase 4) | 同上 |
| S5 | 分享 expense 给好友 (Phase 4) | 同上 |
| S6 | 分享给非好友 | 403 "对方不是你的好友" |
| S7 | 分享不存在的 item | 404 "要分享的内容不存在" |
| S8 | 分享给自己 | 应被好友关系校验拦截 |
| S9 | 重复分享同一条给同一人 | 好友选择器显示 "✓ 已分享" |
| S10 | 分享后查看列表 | 条目显示 "📤 张三" |

### 8.2 接收方测试

| # | 测试用例 | 预期结果 |
|---|---------|---------|
| R1 | 收到 scenario 分享，点收下 | english_scenarios 中新增一条，status 变 accepted |
| R2 | 收到 todo 分享，点收下 | todos 中新增一条 |
| R3 | 收到分享，点忽略 | status 变 dismissed，不再显示 |
| R4 | 页面加载后有未读分享 | 对应模块顶部显示 "📥 你有 N 条新分享" |
| R5 | 通知 badge 显示 | header 区域显示未读数 |
| R6 | 收到的 scenario 预览 | 可以在收件箱内看到标题和内容预览 |
| R7 | 接受后刷新列表 | 新条目出现在自己的列表中 |

### 8.3 权限和边界测试

| # | 测试用例 | 预期结果 |
|---|---------|---------|
| P1 | 删除好友后对方的未处理分享 | 分享记录保留，仍可操作 |
| P2 | 分享的原始条目被删除 | 不影响已发出的分享 (快照模式) |
| P3 | 用户未登录访问 share API | 401 重定向到登录 |
| P4 | 伪造 recipient_id accept 他人分享 | `recipient_id = ?` 校验阻止 |
| P5 | 大量分享不影响性能 | inbox 查询有 `idx_shared_recipient` 索引 |

### 8.4 Rust 单元测试

```rust
#[cfg(test)]
mod sharing_tests {
    // 测试分享 scenario -> 检查 shared_items 记录
    #[test] fn test_share_scenario() { ... }

    // 测试接受分享 -> 检查 english_scenarios 新记录
    #[test] fn test_accept_scenario() { ... }

    // 测试重复分享不报错但可以查到
    #[test] fn test_duplicate_share() { ... }

    // 测试分享 routine (新增)
    #[test] fn test_share_routine() { ... }

    // 测试分享 expense (新增)
    #[test] fn test_share_expense() { ... }

    // 测试非好友分享被拒绝
    #[test] fn test_share_non_friend_rejected() { ... }

    // 测试 GET /share/inbox?type= 过滤
    #[test] fn test_inbox_type_filter() { ... }

    // 测试 GET /share/sent 查询
    #[test] fn test_share_sent_query() { ... }
}
```

---

## 九、风险和注意事项

1. **快照 vs 实时**: 分享采用快照模式，发送后修改原条目不会影响已分享内容。这是有意设计 — 实时协作由 SPEC-041 的 collaborator 机制负责。
2. **数据膨胀**: `item_snapshot` 存储完整 JSON，长内容的 scenario 可能较大。后续可考虑 snapshot 压缩或只存必要字段。
3. **与协作的关系**: 分享 = 发副本，协作 = 共享一份。两个功能互补，不冲突。分享适合"给你参考"，协作适合"一起做"。
4. **向后兼容**: 所有修改都是增量式，不改变现有表结构，不删除任何现有 API。
