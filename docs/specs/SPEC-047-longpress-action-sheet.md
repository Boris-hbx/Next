# SPEC-047: 长按弹出操作菜单
> 起草日期: 2026-02-24
> 状态: 草稿

## 一、需求

用户长按条目（待办、例行、记账、学习笔记），弹出操作菜单（分享、删除等），提供快捷操作入口。

## 二、现状分析

### 2.1 各模块操作入口现状

| 模块 | 分享入口 | 删除入口 | 编辑入口 | 其他操作 |
|------|---------|---------|---------|---------|
| 待办 | 无 | hover × 按钮 | 打开详情 → 编辑 | 完成、拖拽、进度 |
| 例行(routine) | 无 | hover × 按钮 | 无 | 勾选完成 |
| 审视(review) | 无 | 行内 × 按钮 | 行内 ✎ 按钮 | 勾选完成 |
| 记账 | 无 | 详情 → 删除 | 详情 → 编辑 | 查看照片 |
| 学习笔记 | 详情页 📤 按钮 | 编辑模式底部 | 详情页 ✏️ 按钮 | AI 整理 |

**结论**: 除学习笔记外，没有分享入口。删除入口分散在不同位置。

### 2.2 触摸事件冲突分析

| 组件 | 事件 | 时机 | 冲突风险 |
|------|------|------|---------|
| `drag.js` DragManager | touchstart + 300ms timer | 待办条目长按 300ms 后开始拖拽 | **高** — 同一元素、同一手势 |
| `abao.js` 头像长按 | touchstart + 600ms timer | 头像元素 | 无冲突 |
| `abao.js` 阿宝面板下滑 | touchstart/move/end | 阿宝面板区域 | 无冲突 |

**关键冲突**: 待办条目的拖拽使用 300ms 长按触发。若操作菜单也用长按触发，需要和拖拽区分。

### 2.3 已有 CSS 基础

`style.css` 中有未使用的 `.context-menu` 样式（L8315-8361），可以复用/改造。

## 三、设计方案

### 3.1 交互设计

#### 触发方式

| 平台 | 触发手势 | 说明 |
|------|---------|------|
| 移动端 | 长按 500ms | 比拖拽的 300ms 更长，避免冲突 |
| 桌面端 | 右键点击 | 浏览器原生 contextmenu 事件 |

#### 冲突处理策略

**待办条目**（有拖拽）:
- 移动端扁平列表（≤768px）: 无拖拽功能，直接用 500ms 长按
- 桌面端四象限: 用右键触发（不影响拖拽）
- 触发操作菜单时立即取消拖拽（清除 DragManager 的 timer）

**其他模块**（无拖拽）: 直接用 500ms 长按 + 桌面端右键。

#### 视觉反馈

1. 长按开始（0ms）: 条目轻微缩放 `scale(0.98)` + 背景变深
2. 长按确认（500ms）: `navigator.vibrate(40)` + 弹出菜单
3. 松手后: 条目恢复原状

#### 菜单样式

**移动端**: 底部弹出 Action Sheet（从底部滑入）

```
┌─────────────────────────────────┐
│  （遮罩层，点击关闭）              │
│                                 │
│                                 │
│  ┌─────────────────────────┐    │
│  │ 📤 分享给好友            │    │
│  │─────────────────────────│    │
│  │ ✏️ 编辑                 │    │
│  │─────────────────────────│    │
│  │ 🗑️ 删除                │    │
│  │─────────────────────────│    │
│  │ 取消                    │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**桌面端**: 跟随鼠标位置的浮动菜单

```
      ┌──────────────┐
      │ 📤 分享      │
      │ ✏️ 编辑      │
      │──────────────│
      │ 🗑️ 删除     │
      └──────────────┘
```

### 3.2 各模块菜单项

| 模块 | 菜单项 | 说明 |
|------|--------|------|
| 待办 | 分享、编辑、删除 | 编辑 = 打开详情弹窗的编辑模式 |
| 例行(routine) | 分享、删除 | 无编辑功能 |
| 审视(review) | 分享、编辑、删除 | |
| 记账 | 分享、编辑、删除 | |
| 学习笔记 | 分享、编辑、删除 | 已有详情页的操作，这里提供快捷入口 |

**已完成/已删除条目**: 不触发操作菜单。

### 3.3 技术方案

#### 3.3.1 统一组件: ActionSheet

创建全局 `ActionSheet` IIFE，所有模块共用：

```javascript
var ActionSheet = (function() {
    var _overlay, _sheet, _callback;
    var _longPressTimer = null;
    var _startX, _startY;
    var LONG_PRESS_MS = 500;
    var MOVE_THRESHOLD = 10;

    function show(items, options) {
        // items: [{icon, label, action, danger?}]
        // options: {x, y} for desktop positioning
    }

    function hide() { ... }

    // 长按检测: 绑定到目标元素
    function bindLongPress(element, callback) {
        // touchstart → 500ms timer → callback
        // touchmove > 10px → cancel
        // touchend → cancel
        // contextmenu → callback (desktop)
    }

    return { show, hide, bindLongPress };
})();
```

#### 3.3.2 各模块集成

每个模块在渲染列表项时调用 `ActionSheet.bindLongPress()`：

```javascript
// 渲染完 DOM 后
document.querySelectorAll('.task-item:not(.completed):not(.deleted)').forEach(function(el) {
    ActionSheet.bindLongPress(el, function() {
        var id = el.dataset.id;
        ActionSheet.show([
            { icon: '📤', label: '分享给好友', action: function() { Friends.openShareModal('todo', id); } },
            { icon: '✏️', label: '编辑', action: function() { showTaskCard(id); } },
            { icon: '🗑️', label: '删除', action: function() { deleteTask(id); }, danger: true },
        ]);
    });
});
```

#### 3.3.3 与 DragManager 的协调

`drag.js` 的 `attachTouchHandlers()` 在 300ms 时触发拖拽。需要修改：

**方案**: 在移动端扁平列表（flat list）中，不附加拖拽 handler，改用 ActionSheet 长按。四象限视图中保持拖拽，右键触发菜单。

具体改动：
- `drag.js`: `attachTouchHandlers()` 检查是否在扁平列表中，是则跳过
- `tasks.js`: `renderFlatList()` 渲染完后绑定 `ActionSheet.bindLongPress()`
- `tasks.js`: `createItemHtml()` 渲染完后绑定 `contextmenu` 事件

#### 3.3.4 HTML 结构

在 `index.html` 底部（所有 view 之外）添加：

```html
<!-- 操作菜单 -->
<div class="action-sheet-overlay" id="action-sheet-overlay" style="display:none">
    <div class="action-sheet" id="action-sheet"></div>
</div>
```

#### 3.3.5 新文件

- `frontend/assets/js/actionsheet.js` — ActionSheet IIFE
- CSS 样式加在 `style.css` 中（移动端 bottom sheet + 桌面端 context menu）

### 3.4 样式规格

#### 移动端 Action Sheet

```css
.action-sheet-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.4); }
.action-sheet {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--bg-card);
    border-radius: 16px 16px 0 0;
    padding: 8px 0 env(safe-area-inset-bottom, 16px);
    transform: translateY(100%);
    transition: transform 0.25s ease;
}
.action-sheet.visible { transform: translateY(0); }
.action-sheet-item {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 20px; font-size: 1rem;
    cursor: pointer;
}
.action-sheet-item.danger { color: var(--danger-color, #f85149); }
.action-sheet-cancel {
    text-align: center; padding: 14px;
    border-top: 1px solid var(--border-color);
    color: var(--text-secondary);
}
```

#### 桌面端 Context Menu

```css
@media (min-width: 769px) {
    .action-sheet {
        position: fixed; bottom: auto;
        width: 180px; border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        transform: none;
        animation: contextMenuIn 0.15s ease;
    }
}
```

## 四、改动清单

| 文件 | 改动 |
|------|------|
| `frontend/assets/js/actionsheet.js` | 新建 — ActionSheet 组件 |
| `frontend/assets/css/style.css` | 添加 action-sheet 样式 |
| `frontend/index.html` | 添加 overlay HTML + script 引用 |
| `frontend/assets/js/tasks.js` | flat list 渲染后绑定长按，四象限绑定右键 |
| `frontend/assets/js/routines.js` | 渲染后绑定长按/右键 |
| `frontend/assets/js/review.js` | 渲染后绑定长按/右键 |
| `frontend/assets/js/expense.js` | 列表渲染后绑定长按/右键 |
| `frontend/assets/js/english.js` | 列表渲染后绑定长按/右键 |
| `frontend/assets/js/drag.js` | flat list 中跳过拖拽 handler |

## 五、不做的事

1. **不改变现有点击行为** — 单击仍然打开详情/切换完成
2. **不添加滑动操作** — 避免与滚动冲突
3. **不在已完成/已删除条目上启用** — 这些条目有自己的操作
4. **不改变桌面端 hover 删除按钮** — 保留现有交互，右键菜单是补充
