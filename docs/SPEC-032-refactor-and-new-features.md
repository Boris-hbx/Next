# SPEC-032: 工程重构与新特性设计

> 起草日期: 2026-02-10
> 状态: 草稿

## 概述

Next 已从 Flask 完整迁移到 Rust 后端，功能完善、UI 精美，但在可维护性上积累了大量技术债。本文档规划 9 个阶段的工程重构和 4 个新特性，每阶段可独立部署，不引入新框架，保持 Vanilla JS 路线。

## 背景

### 现存技术债

| 问题领域 | 现状 | 影响 |
|---------|------|------|
| **后端 N+1** | 每次 IPC 调用从磁盘重新读取整个 JSON 文件 | 性能低下 |
| **并发安全** | 无线程安全保护 | 并发调用可能导致数据丢失 |
| **HTML 膨胀** | 2,239 行，其中 ~1,793 行内联 CSS | 可维护性差 |
| **CSS 无组织** | style.css 8,558 行，200+ 处硬编码颜色 | 暗色主题维护困难 |
| **JS 重复** | mouse/touch 拖拽 95% 重复，移动函数 4 个近乎相同 | 修改成本高 |
| **死代码** | 引用不存在的 DOM 元素和函数 | 运行时无意义 |

### 新特性需求

1. 选中文字快速创建子任务
2. 按相关人筛选
3. 智能日期选择器
4. Outlook 日历导出

---

## Phase 1: 后端安全与性能

> 风险: 低 | 影响: 高

**目标**: 消除数据丢失风险，去掉 N+1 磁盘读取

### 1.1 引入 Tauri Managed State + Mutex

**`src-tauri/src/main.rs`**:

```rust
use std::sync::Mutex;
use db::{TodoDb, RoutineDb, get_todos_path, get_routines_path};

pub struct AppState {
    pub todo_db: TodoDb,
    pub routine_db: RoutineDb,
}

fn main() {
    let todo_db = TodoDb::load(get_todos_path()).expect("Failed to load todos");
    let routine_db = RoutineDb::load(get_routines_path()).expect("Failed to load routines");

    tauri::Builder::default()
        .manage(Mutex::new(AppState { todo_db, routine_db }))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(...)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 1.2 重构所有 Commands 使用 Managed State

**Before** (每次调用读磁盘):
```rust
pub fn get_todos(tab: Option<String>) -> Result<TodosResponse, String> {
    let db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;
```

**After** (内存读取，写操作时才落盘):
```rust
pub fn get_todos(
    state: tauri::State<'_, Mutex<AppState>>,
    tab: Option<String>
) -> Result<TodosResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let db = &state.todo_db;
```

写操作模式:
```rust
pub fn create_todo(
    state: tauri::State<'_, Mutex<AppState>>,
    request: CreateTodoRequest
) -> Result<TodoResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    // ... 修改 state.todo_db ...
    state.todo_db.save().map_err(|e| e.to_string())?;
}
```

9 个 Todo 命令 + 4 个 Routine 命令全部改造。

### 1.3 清理 debug 输出

删除 `src-tauri/src/commands/todos.rs` 中所有 `println!` (约 6 处)。

### 1.4 修复测试依赖

**`src-tauri/Cargo.toml`**:
```toml
[dev-dependencies]
tempfile = "3"
```

### 1.5 启用 CSP

**`src-tauri/tauri.conf.json`** — `"csp": null` 改为:
```json
"csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:"
```

### 涉及文件

`main.rs`, `commands/todos.rs`, `commands/routines.rs`, `db/mod.rs`, `Cargo.toml`, `tauri.conf.json`

---

## Phase 2: 提取内联 CSS

> 风险: 低 | 影响: 高

**目标**: 将 index.html 中 ~1,793 行内联样式移到独立 CSS 文件

### 2.1 创建 `frontend/assets/css/components.css`

迁移 index.html 的两个 `<style>` 块:
- **第一块** (行 30-255, ~225 行): 侧边栏防闪烁、导航组、版本面板
- **第二块** (行 327-1895, ~1,568 行): 进度弹窗、编辑弹窗、新建任务、任务卡片、任务弹窗、更新日志、例行面板、关于弹窗等

组织为清晰的 section:
```css
/* ========== Sidebar Anti-Flicker ========== */
/* ========== Navigation Groups ========== */
/* ========== Version Panel ========== */
/* ========== Progress Dialog ========== */
/* ========== Task Detail Card ========== */
/* ========== Task Modal ========== */
/* ========== Routine Panel ========== */
/* ========== About Dialog ========== */
```

### 2.2 更新 index.html

添加 CSS 引用:
```html
<link rel="stylesheet" href="assets/css/components.css?v=20260210">
```

删除两个 `<style>` 块。仅保留行 15-28 的早期主题脚本（必须在 CSS 加载前执行）。

### 2.3 去除全局 reset 重复

`* { margin:0; padding:0; box-sizing:border-box }` 同时存在于 `base.css` 和 `style.css`，移除 `style.css` 中的副本。

### 预期效果

index.html 从 2,239 行降至 ~450 行。

### 涉及文件

`index.html`, 新建 `components.css`

---

## Phase 3: 合并拖拽逻辑 & 统一移动函数

> 风险: 中 | 影响: 中

**目标**: 消除 JS 中最大的代码重复

### 3.1 合并 drag.js + touch.js

Mouse 和 Touch 处理共享 95% 逻辑（clone 创建、象限高亮、drop 检测、清理）。合并为统一的 `DragManager` 模块:

```javascript
var DragManager = (function() {
    var state = { isDragging, clone, itemId, startX, startY, longPressTimer... };

    // 共享核心逻辑
    function createClone(text, x, y) { ... }
    function updatePosition(x, y) { ... }
    function highlightTargets(x, y) { ... }
    function detectDropTarget(x, y) { ... }  // 返回 {tab, quadrant}
    function executeDrop(target) { ... }
    function cleanup() { ... }

    // Mouse 入口
    function onMouseDown(e) { ... }
    // Touch 入口 (含 300ms 长按)
    function onTouchStart(e) { ... }

    return { initMouseDrag, attachTouchHandlers };
})();

// 向后兼容
function startCustomDrag(e) { DragManager.initMouseDrag(e); }
```

删除 `touch.js`，从 `index.html` 移除其 `<script>` 标签。

### 3.2 统一 tasks.js 中的移动函数

5 个近乎相同的函数合并为 1 个核心 + 轻量包装:

```javascript
function moveTask(itemId, updates, message) {
    API.updateTodo(itemId, updates).then(function(data) {
        if (data.success) {
            allItems = allItems.map(i => i.id === itemId
                ? (data.item || Object.assign(i, updates)) : i);
            updateCounts();
            renderItems();
            showToast(message, 'success');
        }
    });
}

function moveToQuadrant(id, q)  { moveTask(id, {quadrant: q}, ...); }
function moveToTab(id, t)       { moveTask(id, {tab: t}, ...); }
function moveToTabAndQuadrant(id, t, q) { moveTask(id, {tab: t, quadrant: q}, ...); }
```

### 3.3 清理 utils.js 重复

- `escapeHtml` 存在两个版本（独立函数 + `AppUtils` 内），`AppUtils.escapeHtml` 额外处理 `\n→<br>`，重命名为 `AppUtils.escapeHtmlMultiline`
- 移除 `AppUtils.formatDate` (与独立 `formatDateTime` 重复)

### 涉及文件

`drag.js` (重写), `touch.js` (删除), `tasks.js`, `utils.js`, `index.html`

---

## Phase 4: CSS 变量化 & 组织整理

> 风险: 中 | 影响: 高

**目标**: 将 200+ 处硬编码颜色替换为 CSS 变量，整理 style.css 结构

### 4.1 扩展 base.css 变量体系

在 `:root` 中添加缺失的语义变量:
```css
:root {
    /* 文本色阶 */
    --text-primary: #1f2937;
    --text-secondary: #6b7280;
    --text-tertiary: #9ca3af;

    /* 强调色 */
    --accent-color: #4f46e5;
    --accent-hover: #4338ca;

    /* 组件背景 */
    --card-bg: rgba(255, 255, 255, 0.95);
    --overlay-bg: rgba(0, 0, 0, 0.4);

    /* 状态色 */
    --complete-color: #10b981;
    --delete-color: #ef4444;
}
```

暗色主题对应覆盖。

### 4.2 系统性替换硬编码颜色

| 硬编码值 | 替换为 |
|---------|--------|
| `#667eea` | `var(--primary-color)` |
| `#1f2937` | `var(--text-primary)` |
| `#6b7280` | `var(--text-secondary)` |
| `#9ca3af` | `var(--text-tertiary)` |
| `#4f46e5` | `var(--accent-color)` |
| `#10b981` | `var(--complete-color)` |
| `#ef4444` | `var(--delete-color)` |
| `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` | `var(--primary-gradient)` |

### 4.3 合并重复 @keyframes

将 `fadeIn`, `slideUp`, `slideDown` 等多处重复定义的动画统一到 `base.css`，从 `style.css` 和 `components.css` 中删除副本。

### 4.4 清理散落的暗色主题覆盖

将 `style.css` 中因硬编码颜色而需要的 `[data-theme="dark"]` 块，在完成变量替换后移除（`base.css` 中的变量已处理暗色切换）。

### 涉及文件

`base.css`, `style.css`, `components.css`

---

## Phase 5: 清理死代码和断引用

> 风险: 低 | 影响: 低

**目标**: 消除运行时无意义的代码路径

### 5.1 修复键盘快捷键 'S'

**`features.js`** 行 220-226: 'S' 快捷键引用不存在的 `#search-input`。删除该 case 分支，以及 `index.html` 快捷键弹窗中对应的 `<kbd>S</kbd>` 条目。

### 5.2 修复 openBallSettings 彩蛋

**`routines.js`** 行 26-31: 5 次点击调用不存在的 `openBallSettings()`。替换为:
```javascript
if (versionClickCount >= 5) {
    versionClickCount = 0;
    showToast('You found the secret!');
}
```

### 5.3 移除 console.log

- **`api.js`**: 移除 IPC 调试日志
- **`tasks.js`** 行 6: 移除 `console.log('[loadItems] data:', data)`

### 5.4 清理未使用的 CSS 文件

`desktop.css` 和 `mobile.css` 未被 `index.html` 引用。确认后删除或在 CLAUDE.md 中标注为「未启用 / 预留 PWA」。

### 涉及文件

`features.js`, `routines.js`, `api.js`, `tasks.js`, `index.html`

---

## Phase 6: 选中文字创建新任务

> 风险: 低 | 影响: 中

**目标**: 在任务详情弹窗查看模式下，选中内容文字后弹出浮动按钮快速创建子任务

### 6.1 交互设计

```
┌─────────────────────────────────────┐
│  任务弹窗 (查看模式)                  │
│                                     │
│  详细描述区域:                        │
│  "需要完成以下事项：                    │
│   1. ██████████████  ← 选中的文字     │
│   2. 调研竞品方案     ┌──────────┐    │
│   3. 编写测试用例"    │ + 创建任务 │    │
│                      └──────────┘    │
│                      ↑ 浮动按钮       │
└─────────────────────────────────────┘
```

**交互流程**:
1. 用户在**查看模式**下选中内容区域的一段文字
2. 鼠标松开时，在光标附近弹出浮动按钮 "**+ 创建任务**"
3. 点击按钮 → 关闭当前弹窗 → 打开新建任务弹窗，自动填充信息
4. 选区清除/点击其他位置 → 浮动按钮消失

**智能填充规则**:
- 选中文字 <= 50 字符 → 填入**任务标题**
- 选中文字 > 50 字符 → 第一行填入标题（截断至 50 字），全文填入**详细描述**
- **自动继承**父任务的 `tab` 和 `assignee`
- 象限默认: `not-important-urgent` (待分类)

### 6.2 内容区从 textarea 切换为 div (view 模式)

当前 `#modal-content` 是 `<textarea readonly>`，存在两个问题:
1. `window.getSelection()` 不适用于 textarea 内部文本
2. `onclick="onContentClick()"` 会立即切换编辑模式，阻碍选中

**方案**: 增加 `<div id="modal-content-view">` 覆盖层，view 模式显示 div，edit 模式显示 textarea。

**`frontend/index.html`**:
```html
<div class="task-modal-right">
    <div id="modal-content-view" class="modal-content-view"></div>
    <textarea id="modal-content" placeholder="详细描述、备注、相关信息..."
              style="display:none;"></textarea>
</div>
```

**`frontend/assets/js/modal.js`** — 修改 `setModalMode()`:
```javascript
function setModalMode(mode) {
    var contentView = document.getElementById('modal-content-view');
    var contentEdit = document.getElementById('modal-content');

    if (mode === 'view') {
        contentView.innerHTML = AppUtils.escapeHtmlMultiline(contentEdit.value)
            || '<span class="placeholder">无详细描述</span>';
        contentView.style.display = 'block';
        contentEdit.style.display = 'none';
    } else {
        contentView.style.display = 'none';
        contentEdit.style.display = 'block';
    }
}
```

### 6.3 浮动按钮实现

新增 `frontend/assets/js/selection-action.js` (或合入 modal.js):

```javascript
(function() {
    var popup = null;
    var selectedText = '';
    var parentTask = null;

    document.addEventListener('mouseup', function(e) {
        if (modalMode !== 'view') return;
        var contentView = document.getElementById('modal-content-view');
        if (!contentView || !contentView.contains(e.target)) {
            removePopup();
            return;
        }

        var selection = window.getSelection();
        var text = selection.toString().trim();
        if (!text) { removePopup(); return; }

        selectedText = text;
        parentTask = modalTaskItem;
        showPopup(e.clientX, e.clientY);
    });

    function showPopup(x, y) {
        removePopup();
        popup = document.createElement('div');
        popup.className = 'selection-action-popup';
        popup.innerHTML = '<button class="selection-action-btn">+ 创建任务</button>';
        popup.style.left = x + 'px';
        popup.style.top = (y - 40) + 'px';
        document.body.appendChild(popup);

        popup.querySelector('button').addEventListener('click', function() {
            createTaskFromSelection();
        });
    }

    function createTaskFromSelection() {
        removePopup();
        var title, content;
        if (selectedText.length <= 50) {
            title = selectedText;
            content = '';
        } else {
            title = selectedText.split('\n')[0].substring(0, 50);
            content = selectedText;
        }
        var tab = parentTask ? parentTask.tab : currentTab;
        var assignee = parentTask ? parentTask.assignee : '';

        closeTaskModal();
        openTaskModal('create', null, tab, 'not-important-urgent');

        setTimeout(function() {
            document.getElementById('modal-title').value = title;
            document.getElementById('modal-content').value = content;
            if (assignee) document.getElementById('modal-assignee').value = assignee;
        }, 50);
    }

    function removePopup() {
        if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
        popup = null;
    }

    document.addEventListener('mousedown', function(e) {
        if (popup && !popup.contains(e.target)) removePopup();
    });
})();
```

### 6.4 浮动按钮样式

```css
.selection-action-popup {
    position: fixed;
    z-index: 10001;
    animation: fadeIn 0.15s ease;
}
.selection-action-btn {
    padding: 6px 14px;
    background: var(--primary-gradient);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    backdrop-filter: blur(10px);
    white-space: nowrap;
    transition: transform 0.1s;
}
.selection-action-btn:hover {
    transform: scale(1.05);
}
```

### 6.5 修改内容区点击行为

替换单击进入编辑为双击进入编辑:

```javascript
function onContentClick() {
    // 不再自动切换编辑模式
}

document.getElementById('modal-content-view').addEventListener('dblclick', function() {
    if (modalMode === 'view') {
        switchToEditMode();
        document.getElementById('modal-content').focus();
    }
});
```

### 涉及文件

`index.html`, `modal.js`, `components.css`, 新建 `selection-action.js`

---

## Phase 7: 按相关人筛选任务

> 风险: 低 | 影响: 中

**目标**: 在 Tab 栏下方添加相关人筛选条，快速聚焦某人的任务

### 7.1 UI 设计

```
[例行] | [Today (5)] [This Week (3)] [Next 30 Days (2)] | [+ 添加任务]
[全部]  [Boris]  [Alice]  [张三]                         ← 新增筛选条
┌───────────────────────────────────────────────────────┐
│  四象限矩阵区域                                         │
```

**设计要点**:
- 位于 Tab 栏和矩阵之间，紧凑的一行
- 水平排列的 chip 按钮，溢出时水平滚动
- 默认选中 "全部"，点击某人名字则只显示该人的任务
- **自动隐藏**: 当前 Tab 下只有 0-1 个不同 assignee 时不显示
- 切换 Tab 时，不存在的 assignee 自动重置为 "全部"

### 7.2 前端实现

**`frontend/index.html`** — 在 `.matrix-tabs` 和 `.eisenhower-matrix` 之间:
```html
<div class="assignee-filter" id="assignee-filter" style="display:none;">
    <div class="assignee-chips" id="assignee-chips"></div>
</div>
```

**`frontend/assets/js/app.js`** — 全局状态:
```javascript
var currentAssigneeFilter = null;  // null = 全部
```

**`frontend/assets/js/tasks.js`** — 修改 `renderItems()`:
```javascript
function renderItems() {
    // ...existing code...
    allItems.forEach(function(item) {
        if (item.deleted) return;
        if (item.tab !== currentTab) return;
        if (item.completed) return;
        // 新增：相关人筛选
        if (currentAssigneeFilter && item.assignee !== currentAssigneeFilter) return;
        // ...render logic...
    });
    renderAssigneeFilter();
}
```

新增 `renderAssigneeFilter()` 和 `filterByAssignee()` 函数:
```javascript
function renderAssigneeFilter() {
    var assignees = {};
    allItems.forEach(function(item) {
        if (item.deleted || item.completed || item.tab !== currentTab) return;
        if (item.assignee) {
            assignees[item.assignee] = (assignees[item.assignee] || 0) + 1;
        }
    });

    var names = Object.keys(assignees);
    var filterEl = document.getElementById('assignee-filter');
    var chipsEl = document.getElementById('assignee-chips');

    if (names.length < 2) {
        filterEl.style.display = 'none';
        currentAssigneeFilter = null;
        return;
    }

    if (currentAssigneeFilter && !assignees[currentAssigneeFilter]) {
        currentAssigneeFilter = null;
    }

    filterEl.style.display = 'flex';
    var html = '<button class="assignee-chip' + (!currentAssigneeFilter ? ' active' : '') +
               '" onclick="filterByAssignee(null)">全部</button>';
    names.sort().forEach(function(name) {
        var isActive = currentAssigneeFilter === name;
        html += '<button class="assignee-chip' + (isActive ? ' active' : '') +
                '" onclick="filterByAssignee(\'' + escapeHtml(name) + '\')">' +
                escapeHtml(name) + ' <span class="chip-count">' +
                assignees[name] + '</span></button>';
    });
    chipsEl.innerHTML = html;
}

function filterByAssignee(name) {
    currentAssigneeFilter = name;
    updateCounts();
    renderItems();
}
```

### 7.3 样式

```css
.assignee-filter {
    display: flex;
    align-items: center;
    padding: 4px 12px 8px;
    overflow-x: auto;
    scrollbar-width: none;
}
.assignee-filter::-webkit-scrollbar { display: none; }

.assignee-chips {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
}

.assignee-chip {
    padding: 4px 12px;
    border: 1px solid var(--border-color, rgba(0,0,0,0.1));
    border-radius: 16px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
}
.assignee-chip:hover {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
}
.assignee-chip.active {
    background: var(--primary-gradient);
    color: white;
    border-color: transparent;
}
.chip-count {
    font-size: 11px;
    opacity: 0.7;
    margin-left: 2px;
}

[data-theme="dark"] .assignee-chip {
    border-color: rgba(255,255,255,0.15);
    color: var(--text-secondary);
}
```

### 7.4 Tab 切换时重置筛选

**`frontend/assets/js/app.js`** — 修改 `switchTab()`:
```javascript
function switchTab(tab) {
    currentTab = tab;
    if (currentAssigneeFilter) {
        var hasAssignee = allItems.some(function(item) {
            return !item.deleted && !item.completed &&
                   item.tab === tab && item.assignee === currentAssigneeFilter;
        });
        if (!hasAssignee) currentAssigneeFilter = null;
    }
    // ...existing logic...
}
```

### 7.5 计数受筛选影响

象限计数需要考虑筛选:
```javascript
if (item.tab === currentTab) {
    if (!currentAssigneeFilter || item.assignee === currentAssigneeFilter) {
        qcounts[item.quadrant] = (qcounts[item.quadrant] || 0) + 1;
    }
}
```

Tab 级别总数（today/week/month）**不受**筛选影响，始终显示全量。

### 涉及文件

`index.html`, `app.js`, `tasks.js`, `components.css`

---

## Phase 8: 智能日期选择器

> 风险: 中 | 影响: 高

**目标**: 替换 `<input type="date">`，用三层递进式设计让设置日期极其高效

### 8.1 设计理念 — 三层递进

参考 Things 3、Todoist、Linear 等业界最佳实践:
- **第一层: 快捷芯片** — 一键设置最常用日期（覆盖 80% 场景）
- **第二层: 自然语言输入** — 键盘输入 "3d"、"下周一"、"friday"（覆盖 15%）
- **第三层: 迷你日历** — 精确选择特定日期（覆盖 5%）

### 8.2 UI 设计

```
┌─────────────────────────────────────────┐
│  计划完成                                │
│  ┌───────────────────────────────────┐  │
│  │  5天后 (周六)              x      │  │  ← 相对日期显示
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ 弹出面板 ──────────────────────────┐ │
│  │ [今天] [明天] [周一] [周末] [月底]   │ │  ← 快捷芯片
│  │                                     │ │
│  │ ┌─────────────────────────────┐     │ │
│  │ │ 输入: 3d, 下周一, friday... │     │ │  ← 自然语言
│  │ └─────────────────────────────┘     │ │
│  │                                     │ │
│  │     2026年2月                        │ │
│  │  一  二  三  四  五  六  日          │ │  ← 迷你日历
│  │                          1          │ │
│  │  2   3   4   5   6  [7]  8          │ │
│  │  9  10  11  12  13  14  15          │ │
│  │  ...                                │ │
│  │                                     │ │
│  │ [清除日期]                           │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 8.3 快捷芯片 — 上下文感知

根据当前 Tab 智能调整芯片优先级:

| 当前 Tab | 芯片（按推荐顺序） |
|---------|-------------------|
| Today | **今天** / 明天 / 周末 / 下周一 / 月底 |
| This Week | 今天 / 明天 / **周末** / 下周一 / 月底 |
| Next 30 Days | 今天 / 下周一 / 两周后 / **月底** / 下月底 |

### 8.4 自然语言日期解析器

轻量自定义解析器（~120 行 JS，零依赖），支持中英双语:

**中文**:

| 输入 | 解析结果 |
|------|---------|
| `今天` | 今天 |
| `明天` / `后天` | +1 天 / +2 天 |
| `下周一` ~ `下周日` | 下周对应日 |
| `周末` | 本周六 |
| `月底` | 当月最后一天 |
| `3天后` / `1周后` | 相对偏移 |
| `下个月` | 下月 1 日 |

**英文 / 快捷**:

| 输入 | 解析结果 |
|------|---------|
| `tod` / `today` | 今天 |
| `tom` / `tomorrow` | 明天 |
| `mon` ~ `sun` / `next monday` | 最近的对应日 |
| `3d` / `1w` / `2w` | 3 天 / 1 周 / 2 周后 |
| `eow` (end of week) | 本周五 |
| `eom` (end of month) | 月底 |
| `jan 15` / `1/15` | 绝对日期 |

输入时实时显示解析结果预览，Enter 确认。

### 8.5 相对日期展示

设置日期后的显示规则:
- `今天` / `明天` / `后天` — 3 天内
- `3天后 (周六)` — 3~7 天
- `下周三 (2/18)` — 7~14 天
- `2月28日 (16天后)` — 更远的日期
- `已过期 2天` — 红色标记过期

hover 时显示完整日期作为 tooltip。

### 8.6 键盘交互

| 按键 | 行为 |
|------|------|
| 点击日期区域 | 打开面板 |
| `↑` / `↓` | 日期 +1 天 / -1 天 |
| `Shift+↑/↓` | +1 周 / -1 周 |
| 输入文字 | 自动聚焦到自然语言输入框 |
| `Enter` | 确认当前日期 |
| `Backspace` (空输入) | 清除日期 |
| `Escape` | 关闭面板 |

### 8.7 技术实现

**`frontend/index.html`** — 替换日期输入:
```html
<div class="prop-group">
    <label>计划完成</label>
    <div class="smart-date-picker" id="smart-date-picker">
        <button class="date-display" id="date-display" onclick="toggleDatePicker()">
            <span class="date-text" id="date-text">设置日期</span>
            <span class="date-clear" id="date-clear"
                  onclick="clearDueDate(event)" style="display:none;">&times;</span>
        </button>
        <input type="hidden" id="modal-due-date">
        <div class="date-popover" id="date-popover" style="display:none;">
            <div class="date-chips" id="date-chips"></div>
            <input type="text" class="date-nl-input" id="date-nl-input"
                   placeholder="输入: 3d, 下周一, friday...">
            <div class="date-nl-preview" id="date-nl-preview"></div>
            <div class="date-calendar" id="date-calendar"></div>
            <button class="date-clear-btn" onclick="clearDueDate()">清除日期</button>
        </div>
    </div>
</div>
```

**新建 `frontend/assets/js/datepicker.js`** (~250 行):
- `parseNaturalDate(input)` — 双语自然语言解析
- `renderDateChips(tab)` — 上下文感知的快捷芯片
- `renderMiniCalendar(year, month)` — 迷你日历渲染
- `formatRelativeDate(dateStr)` — 相对日期展示
- `toggleDatePicker()` / `selectDate(date)` / `clearDueDate()` — 交互控制

**`frontend/assets/js/tasks.js`** — 任务列表中使用相对日期:
```javascript
var dueDateHtml = item.due_date
    ? '<span class="task-due ' + getDueDateClass(item.due_date) + '">' +
      formatRelativeDate(item.due_date) + '</span>'
    : '';
```

### 涉及文件

`index.html`, 新建 `datepicker.js`, `modal.js`, `tasks.js`, `components.css`

---

## Phase 9: Outlook 日历导出

> 风险: 低 | 影响: 中

**目标**: 一键将任务导出为 .ics 日历文件，用系统默认应用（Outlook）打开

### 9.1 交互设计

- 任务详情弹窗（view 模式）header 区新增导出按钮
- 点击 → 生成 .ics → 系统自动用 Outlook 打开 → 用户确认导入
- 支持:
  - **单任务导出**: 弹窗中的按钮
  - **批量导出**: Tab 栏区域 "导出当前列表" 选项

### 9.2 Rust 后端

**`src-tauri/Cargo.toml`**:
```toml
icalendar = "0.16"
```

**新建 `src-tauri/src/commands/calendar.rs`**:

两个命令:
- `export_task_ics(id)` — 单任务导出
- `export_tab_ics(tab)` — 批量导出当前 Tab 所有有 due_date 的未完成任务

生成 .ics 文件到临时目录，通过 Tauri Shell plugin 的 `open` 用系统默认应用打开。

### 9.3 字段映射

| Next 字段 | iCalendar 字段 | 说明 |
|----------|---------------|------|
| `text` | `SUMMARY` | 事件标题 |
| `content` | `DESCRIPTION` | 事件描述 |
| `due_date` | `DTSTART` / `DTEND` | 全天事件 |
| `quadrant` (important-*) | `PRIORITY` | 1=高, 5=中, 9=低 |
| `tags` | `CATEGORIES` | 逗号分隔 |
| `assignee` | 追加到 DESCRIPTION | "相关人: xxx" |
| `progress` | `PERCENT-COMPLETE` | 0-100 |

### 9.4 前端

**`modal.js`** — view 模式 header 添加导出按钮

**`api.js`** — 添加 `API.exportTaskIcs(id)` 和 `API.exportTabIcs(tab)`

### 涉及文件

`Cargo.toml`, 新建 `commands/calendar.rs`, `commands/mod.rs`, `main.rs`, `modal.js`, `api.js`, `index.html`

---

## 不在本次范围内

| 事项 | 原因 |
|------|------|
| 引入前端框架 (React/Vue) | Vanilla JS 对当前规模够用 |
| 引入打包工具 (Webpack/Vite) | 11 个 script 标签方案对个人项目足够 |
| 添加测试基础设施 | 单独的工作项，与重构正交 |
| CI/CD 流水线 | `scripts\release.bat` 足够 |
| 前端状态管理库 | 全局 `allItems` + `renderItems()` 模式虽不优雅但有效 |
| 数据库迁移 SQLite | JSON 文件对个人任务量级足够 |

---

## 验证方法

### 通用验证 (每个 Phase 完成后)

1. `cargo tauri dev` 启动开发模式
2. 创建/编辑/删除/恢复任务 — 验证 CRUD
3. 鼠标拖拽跨象限、跨 Tab — 验证拖拽
4. 切换深色/浅色/跟随系统主题 — 验证样式
5. 快捷键 N/1/2/3/?/Esc — 验证键盘操作
6. 例行任务面板 — 验证日常功能
7. `cargo test` — 后端测试通过

### Phase 6 专项验证

8. 打开有内容的任务详情 → 查看模式下选中文字 → 确认浮动按钮出现
9. 点击 "创建任务" → 确认新建弹窗打开且标题/内容已自动填充
10. 双击内容区域可进入编辑模式（替代原来的单击）
11. 选中超过 50 字文字 → 确认标题截断、全文填入描述

### Phase 7 专项验证

12. 多个任务设置不同 assignee → 确认筛选条自动出现
13. 点击某人名 → 确认只显示该人任务，象限计数同步更新
14. 切换 Tab → 筛选条正确更新（不存在的 assignee 时自动重置）
15. 所有任务同一人或无 assignee → 筛选条自动隐藏

### Phase 8 专项验证

16. 点击日期区域 → 弹出面板，显示快捷芯片
17. 点击 "明天" 芯片 → 日期立即设置，显示为 "明天 (周X)"
18. 输入 "3d" 按回车 → 日期设置为 3 天后
19. 输入 "下周一" 按回车 → 日期设置为下周一
20. 键盘 ↑/↓ 调整日期 → 每次 +1/-1 天
21. 迷你日历点选特定日期 → 正确设置
22. 任务列表中过期日期显示红色 "已过期" 标记

### Phase 9 专项验证

23. 对有 due_date 的任务点击导出 → .ics 文件生成并自动用 Outlook 打开
24. Outlook 中确认事件标题、描述、日期、优先级正确映射
25. 无 due_date 的任务点击导出 → 友好提示 "请先设置日期"
26. 批量导出当前 Tab → 生成包含多个事件的 .ics 文件
