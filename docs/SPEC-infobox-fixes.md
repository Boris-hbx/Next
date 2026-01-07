# SPEC: Infobox 修复

## 问题清单

### 1. Content 输入框拖拽超出界面

**现象：**
- 向右拖拽 content 输入框时，可以拉到界面外
- Infobox 随之消失或变形
- 再次打开 Infobox 时，框子仍然是被拉大的状态，没有重置

**修复方案：**
```css
.task-modal-right textarea {
    resize: vertical;        /* 只允许垂直方向调整 */
    max-width: 100%;         /* 不超出容器 */
}
```

**或者完全禁用 resize：**
```css
.task-modal-right textarea {
    resize: none;            /* 禁用拖拽调整 */
}
```

**重置逻辑：**
```javascript
// 在 openTaskModal 中重置 textarea 尺寸
contentInput.style.width = '';
contentInput.style.height = '';
```

---

### 2. 象限只有图标没有文字

**现状：**
```
[🔥] [🎯] [📞] [🎮]
```

**改为：**
```
[🔥重要紧急] [🎯重要不紧急]
[📞紧急    ] [🎮不紧急    ]
```

**HTML 修改：**
```html
<div class="quadrant-select-compact">
    <label class="q-option selected" data-q="important-urgent">
        <input type="radio" name="modal-quadrant" value="important-urgent" checked>
        <span>🔥</span><span class="q-text">重要紧急</span>
    </label>
    <label class="q-option" data-q="important-not-urgent">
        <input type="radio" name="modal-quadrant" value="important-not-urgent">
        <span>🎯</span><span class="q-text">重要不紧急</span>
    </label>
    <label class="q-option" data-q="not-important-urgent">
        <input type="radio" name="modal-quadrant" value="not-important-urgent">
        <span>📞</span><span class="q-text">紧急</span>
    </label>
    <label class="q-option" data-q="not-important-not-urgent">
        <input type="radio" name="modal-quadrant" value="not-important-not-urgent">
        <span>🎮</span><span class="q-text">不紧急</span>
    </label>
</div>
```

**CSS 调整：**
```css
.quadrant-select-compact .q-option {
    font-size: 10px;
}
.quadrant-select-compact .q-text {
    display: block;
    margin-top: 2px;
}
```

---

### 3. 时间段改为三个横排按钮

**现状：**
```
🕐 时间段
[Today ▼]  (下拉选择)
```

**改为：**
```
🕐 时间段
[Today] [Week] [Month]
```

**HTML 修改：**
```html
<div class="prop-group">
    <label>🕐 时间段</label>
    <div class="tab-buttons">
        <button type="button" class="tab-btn selected" data-tab="today">Today</button>
        <button type="button" class="tab-btn" data-tab="week">Week</button>
        <button type="button" class="tab-btn" data-tab="month">Month</button>
    </div>
</div>
```

**CSS 样式：**
```css
.tab-buttons {
    display: flex;
    gap: 4px;
}
.tab-btn {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    background: var(--bg-color, #fff);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
}
.tab-btn:hover {
    border-color: #4f46e5;
}
.tab-btn.selected {
    background: #4f46e5;
    color: white;
    border-color: #4f46e5;
}
.tab-btn:disabled {
    opacity: 0.5;
    cursor: default;
}
```

**JavaScript：**
```javascript
// 时间段按钮点击
document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        if (modalMode === 'view') return;
        document.querySelectorAll('.tab-btn').forEach(function(b) {
            b.classList.remove('selected');
        });
        btn.classList.add('selected');
    });
});

// 获取选中的时间段
function getSelectedTab() {
    var selectedBtn = document.querySelector('.tab-btn.selected');
    return selectedBtn ? selectedBtn.dataset.tab : 'today';
}

// 设置时间段
function setModalTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.tab === tab);
    });
}
```

---

## 最终布局

```
┌──────────────────────────────────────────────────────┐
│  标题输入框                                       [×] │
├──────────────────┬───────────────────────────────────┤
│ 📅 计划完成      │                                   │
│ [日期选择器]     │                                   │
│                  │                                   │
│ 👤 相关人        │  详细内容...                       │
│ [输入框]         │  (只能垂直调整大小)                │
│                  │                                   │
│ 🕐 时间段        │                                   │
│ [Today][Week][Mo]│                                   │
│                  │                                   │
│ 📊 象限          │                                   │
│ [🔥重要紧急][🎯] │                                   │
│ [📞紧急  ][🎮]   │                                   │
│                  │                                   │
│ 进度 [███░░] 65% │                                   │
│ ────────────     │                                   │
│ 📅 创建于 01-04  │                                   │
│ [📋 变更记录 ▼]  │                                   │
├──────────────────┴───────────────────────────────────┤
│                                    [取消]  [保存]     │
└──────────────────────────────────────────────────────┘
```

---

## 验收标准

1. [ ] Content 输入框只能垂直调整，不能拉出界面
2. [ ] 重新打开 Infobox 时，输入框尺寸自动重置
3. [ ] 象限按钮显示图标+文字
4. [ ] 时间段改为三个横排按钮样式
5. [ ] 查看模式下，时间段和象限按钮不可点击
