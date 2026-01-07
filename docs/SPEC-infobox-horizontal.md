# SPEC: Infobox 横向布局 + UI 优化

## 问题描述

1. **Infobox 布局问题**：垂直布局导致内容过长，小屏幕需要滚动
2. **进度图标不直观**：任务左侧小方块不够明确表示"更新进度"
3. **进度条颜色错误**：圆球左右都是彩色，应该左边彩色（已完成）右边灰色（未完成）
4. **"显示已完成"按钮多余**：已完成任务默认显示在底部，无需额外开关

## 设计方案

### 一、Infobox 横向布局

```
┌─────────────────────────────────────────────────────────────┐
│  [标题输入框 - 横跨整个宽度]                             [×] │
├───────────────────────┬─────────────────────────────────────┤
│                       │ ┌─────────────────────────────────┐ │
│ 📅 计划完成           │ │                                 │ │
│ [2026-01-10]          │ │                                 │ │
│                       │ │  详细内容...                    │ │
│ 👤 相关人             │ │                                 │ │
│ [Boris]               │ │  (可拖拽调整大小)               │ │
│                       │ │                                 │ │
│ 🕐 时间段             │ │                                 │ │
│ [Today ▼]             │ └─────────────────────────────────┘ │
│                       │                                     │
│ 📊 象限               │                                     │
│ [🔥重要紧急 ▼]        │                                     │
│                       │                                     │
│ 进度                  │                                     │
│ [████████░░░░] 65%    │                                     │
│ ───────────────────── │                                     │
│ 📅 创建 01-04 10:30   │                                     │
│ ✅ 完成 01-05 16:45   │                                     │
│ [📋 变更记录 ▼]       │                                     │
├───────────────────────┴─────────────────────────────────────┤
│                                          [取消]  [保存]      │
└─────────────────────────────────────────────────────────────┘
```

**布局规则：**
| 元素 | 尺寸 |
|------|------|
| Modal 总宽度 | 720px (max-width: 95vw) |
| 左栏（属性） | 180px 固定 |
| 右栏（内容） | 剩余空间，可拖拽扩展 |
| Modal 高度 | auto，max-height: 80vh |

**内容框特性：**
```css
#modal-content {
    resize: both;           /* 可向右下拖拽 */
    min-width: 280px;
    min-height: 200px;
    max-width: 600px;
    max-height: 400px;
    overflow: auto;
}
```

---

### 二、进度图标优化

**现状：** 小方块 `□` 不够直观

**方案：** 使用圆形进度图标，显示当前进度

```
任务列表项：
┌─────────────────────────────────────────┐
│ ◔ 65%  任务标题文字...            [编辑] │
└─────────────────────────────────────────┘

图标说明：
◔ = 圆形进度指示器（饼图样式）
   - 显示当前进度百分比的扇形填充
   - 点击弹出进度滑块
```

**备选图标方案：**
| 方案 | 图标 | 说明 |
|------|------|------|
| A | `◔` + 数字 | 饼图 + 百分比，如 `◔ 65%` |
| B | `⟳` | 圆形箭头，表示"更新" |
| C | `▣` → `📊` | 换成图表图标 |
| D | 进度环 | CSS 绘制的小圆环 |

**推荐方案 A**：用 CSS 绘制小圆环显示进度

```css
.progress-indicator {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: conic-gradient(
        #4f46e5 0% var(--progress),
        #e5e7eb var(--progress) 100%
    );
    cursor: pointer;
}
```

```
进度 0%:   ○ (空心灰色圆)
进度 25%:  ◔ (1/4 填充)
进度 50%:  ◑ (半填充)
进度 75%:  ◕ (3/4 填充)
进度 100%: ● (实心圆) 或 ✓
```

---

### 三、进度条颜色修复

**现状问题：**
```
[████████████████] 65%
 ↑ 全部彩色，看不出已完成/未完成分界
```

**修复后：**
```
[████████░░░░░░░░] 65%
 ↑彩色    ↑灰色
 已完成   未完成
```

**CSS 修复：**
```css
/* 进度条轨道 - 灰色背景 */
input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    background: #e5e7eb;  /* 灰色轨道 */
    border-radius: 3px;
}

/* 已完成部分 - 彩色填充 */
input[type="range"]::-webkit-slider-runnable-track {
    background: linear-gradient(
        to right,
        #4f46e5 0%,
        #4f46e5 var(--progress, 0%),
        #e5e7eb var(--progress, 0%),
        #e5e7eb 100%
    );
}

/* 滑块圆球 */
input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: white;
    border: 2px solid #4f46e5;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

**JavaScript 动态更新：**
```javascript
function updateProgressBar(input) {
    var value = input.value;
    input.style.setProperty('--progress', value + '%');
}
```

---

## HTML 结构

```html
<div class="task-modal-overlay">
    <div class="task-modal horizontal">
        <!-- 标题栏 -->
        <div class="task-modal-header">
            <input type="text" id="modal-title" placeholder="任务标题...">
            <button class="task-modal-close">&times;</button>
        </div>

        <!-- 主体：左属性 + 右内容 -->
        <div class="task-modal-main">
            <!-- 左栏：属性 -->
            <div class="task-modal-left">
                <div class="prop-group">
                    <label>📅 计划完成</label>
                    <input type="date" id="modal-due-date">
                </div>
                <div class="prop-group">
                    <label>👤 相关人</label>
                    <input type="text" id="modal-assignee">
                </div>
                <div class="prop-group">
                    <label>🕐 时间段</label>
                    <select id="modal-tab">
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">Next 30 Days</option>
                    </select>
                </div>
                <div class="prop-group">
                    <label>📊 象限</label>
                    <select id="modal-quadrant">...</select>
                </div>
                <div class="prop-group">
                    <label>进度</label>
                    <div class="progress-slider">
                        <input type="range" id="modal-progress" min="0" max="100">
                        <span id="progress-value">0%</span>
                    </div>
                </div>
                <div class="meta-section">
                    <div class="meta-item">📅 创建于 <span id="modal-created-at"></span></div>
                    <div class="meta-item" id="modal-completed-row">✅ 完成于 <span id="modal-completed-at"></span></div>
                </div>
                <div class="changelog-section">
                    <button class="changelog-toggle" onclick="toggleChangelog()">
                        📋 变更记录 <span class="changelog-arrow">▼</span>
                    </button>
                    <div class="changelog-list" id="modal-changelog" style="display:none;"></div>
                </div>
            </div>

            <!-- 右栏：内容 -->
            <div class="task-modal-right">
                <textarea id="modal-content" placeholder="详细描述、备注..."></textarea>
            </div>
        </div>

        <!-- 底部按钮 -->
        <div class="task-modal-footer">
            <button class="task-modal-btn secondary" onclick="closeTaskModal()">取消</button>
            <button class="task-modal-btn primary" onclick="saveTask()">保存</button>
        </div>
    </div>
</div>
```

---

## 任务列表项进度指示器

```html
<!-- 任务项 -->
<div class="task-item">
    <div class="progress-ring" style="--progress: 65%;" onclick="showProgressPopup(id)">
        <span class="progress-ring-text">65</span>
    </div>
    <div class="task-text">任务标题...</div>
    <button class="task-edit">✎</button>
</div>
```

```css
.progress-ring {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: conic-gradient(
        #4f46e5 calc(var(--progress) * 3.6deg),
        #e5e7eb calc(var(--progress) * 3.6deg)
    );
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
}

.progress-ring::before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
}

.progress-ring-text {
    position: relative;
    font-size: 10px;
    font-weight: 600;
    color: #4f46e5;
}
```

---

---

### 四、移除"显示已完成"按钮

**现状：**
```
┌─────────────────────────────────────────────┐
│ [添加任务...]          [显示已完成 ✓]       │
└─────────────────────────────────────────────┘
```

**改为：**
```
┌─────────────────────────────────────────────┐
│ [添加任务...]                               │
└─────────────────────────────────────────────┘
```

**说明：**
- 删除"显示已完成"开关按钮
- 已完成任务默认显示在页面底部
- 用户可直接滚动到底部查看已完成任务

---

## 验收标准

1. [ ] Infobox 采用横向布局：标题在顶部，左属性右内容
2. [ ] 内容框可拖拽调整大小（向右、向下）
3. [ ] 左栏属性紧凑排列，无需滚动
4. [ ] 任务列表进度图标改为圆环样式，显示进度百分比
5. [ ] 进度条颜色正确：左边彩色（已完成），右边灰色（未完成）
6. [ ] Modal 高度适中，笔记本屏幕无需滚动
7. [ ] "显示已完成"按钮已移除，已完成任务默认显示在底部

## 工作量

| 任务 | 复杂度 |
|------|--------|
| 重构 Modal HTML/CSS | 中 |
| 进度圆环组件 | 中 |
| 修复进度条颜色 | 低 |
| 测试验证 | 低 |
