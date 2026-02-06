# SPEC: 名言栏与 Tabs 行对齐 + 按钮动效

## 问题

1. 添加"例行"按钮后，Tabs 行总宽度超过了四象限宽度 (1364px)
2. 名言栏与 Tabs 行左右边缘未对齐
3. "例行"按钮颜色改为蓝色（不要粉红）
4. 需要任务状态指示动效

## 当前布局

```
┌──────────────────────────────────────────┐
│        「名言内容...」        [换一个]    │  ← 1364px (page-header)
└──────────────────────────────────────────┘
┌────────────────────────────────────────────────┐
│ 📋例行 │ Today │ This Week │ Next 30 │ +添加  │  ← 超出 1364px
└────────────────────────────────────────────────┘
┌─────────────────┬─────────────────┐
│      Q1         │       Q2        │  ← 1364px (四象限)
├─────────────────┼─────────────────┤
│      Q3         │       Q4        │
└─────────────────┴─────────────────┘
```

## 期望布局

```
┌──────────────────────────────────────────┐
│    「名言内容...」              [换一个]  │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ 📋例行 │ Today │ Week │ Month │  +添加   │
└──────────────────────────────────────────┘
┌─────────────────┬─────────────────┐
│      Q1         │       Q2        │
├─────────────────┼─────────────────┤
│      Q3         │       Q4        │
└─────────────────┴─────────────────┘
│←────────────── 1364px ──────────→│
          三者宽度一致，左右对齐
```

## 实现方案

### 1. 统一宽度

名言栏和 Tabs 行都使用固定宽度 1364px：

```css
.page-header {
    width: 1364px;
    margin: 0 auto 1rem auto;
}

.matrix-tabs {
    width: 1364px;  /* 固定宽度 */
    margin: 0 auto 1rem auto;
    box-sizing: border-box;
}
```

### 2. Tabs 行内部弹性布局

让内部元素自适应，不超出容器：

```css
.matrix-tabs {
    display: flex;
    justify-content: space-between;  /* 两端对齐 */
    align-items: center;
}

.tab-actions {
    margin-left: auto;  /* 添加任务按钮右对齐 */
}
```

### 3. Tab 按钮缩写（如需要）

如果空间仍然紧张，可缩短标签文字：
- "This Week" → "Week"
- "Next 30 Days" → "Month"

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | matrix-tabs 添加 width: 1364px 和居中 | style.css |
| 2 | 调整 tabs 内部 flex 布局 | style.css |
| 3 | (可选) 缩短 tab 文字 | todo.html |

---

## 新增：按钮样式与动效

### 1. "例行"按钮改为蓝色

```css
.btn-routine {
    background: linear-gradient(135deg, #667eea, #764ba2);  /* 蓝紫渐变 */
}
```

### 2. 任务状态动效（线条环绕）

参考名言栏的环绕动效，给"例行"和"Today"按钮添加旋转边框：

```
【有未完成任务】              【全部完成】
┌╌╌╌╌╌╌╌╌╌╌╌┐               ┌───────────┐
┊  例行  ←───┼── 线条旋转    │   例行    │ ← 无动效
└╌╌╌╌╌╌╌╌╌╌╌┘               └───────────┘
```

注：例行按钮不带图标，纯文字。

### 3. 动效速度规则

| 完成度 | 动效速度 | 说明 |
|--------|----------|------|
| 0-50%  | 快速 (2s) | 提醒用户赶紧完成 |
| 51-99% | 慢速 (6s) | 快完成了，放松一点 |
| 100%   | 无动效 | 全部完成，安静 |

### 4. 实现方案

#### CSS 动画

```css
/* 基础按钮（无动效） */
.btn-routine,
.matrix-tab[data-tab="today"] {
    position: relative;
    overflow: hidden;
}

/* 有任务时添加动效 class */
.btn-routine.has-pending::before,
.matrix-tab[data-tab="today"].has-pending::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 2px;
    background: conic-gradient(from var(--angle), transparent 70%, #667eea 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: rotate-border var(--speed, 4s) linear infinite;
}

/* 快速（完成度低） */
.btn-routine.speed-fast::before,
.matrix-tab.speed-fast::before {
    --speed: 2s;
}

/* 慢速（完成度高） */
.btn-routine.speed-slow::before,
.matrix-tab.speed-slow::before {
    --speed: 6s;
}

@property --angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}

@keyframes rotate-border {
    to { --angle: 360deg; }
}
```

#### JS 逻辑

```javascript
function updateButtonAnimations() {
    // 例行按钮
    var routineBtn = document.querySelector('.btn-routine');
    var pendingRoutines = routines.filter(r => !r.completed_today).length;
    var totalRoutines = routines.length;

    if (totalRoutines > 0 && pendingRoutines > 0) {
        routineBtn.classList.add('has-pending');
        var completion = (totalRoutines - pendingRoutines) / totalRoutines;
        routineBtn.classList.toggle('speed-fast', completion < 0.5);
        routineBtn.classList.toggle('speed-slow', completion >= 0.5);
    } else {
        routineBtn.classList.remove('has-pending', 'speed-fast', 'speed-slow');
    }

    // Today 按钮
    var todayBtn = document.querySelector('.matrix-tab[data-tab="today"]');
    var todayItems = allItems.filter(i => i.tab === 'today' && !i.deleted);
    var pendingToday = todayItems.filter(i => !i.completed).length;
    var totalToday = todayItems.length;

    if (totalToday > 0 && pendingToday > 0) {
        todayBtn.classList.add('has-pending');
        var completion = (totalToday - pendingToday) / totalToday;
        todayBtn.classList.toggle('speed-fast', completion < 0.5);
        todayBtn.classList.toggle('speed-slow', completion >= 0.5);
    } else {
        todayBtn.classList.remove('has-pending', 'speed-fast', 'speed-slow');
    }
}
```

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | matrix-tabs 添加 width: 1364px 和居中 | style.css |
| 2 | 调整 tabs 内部 flex 布局 | style.css |
| 3 | 例行按钮改为蓝色渐变 | todo.html |
| 4 | 添加 has-pending 动效 CSS | todo.html |
| 5 | 添加 updateButtonAnimations() 函数 | todo.html |
| 6 | 在 renderItems / loadRoutines 后调用更新 | todo.html |
| 7 | (可选) 缩短 tab 文字 | todo.html |

---

## 新增：十字线动态定位

### 问题

四象限改为 `auto auto` 高度自适应后，十字线（四箭头）位置固定，无法跟随象限大小变化。

### 期望行为

```
【任务少】                    【任务多】
┌─────┬─────┐                ┌─────┬─────┐
│ Q1  │ Q2  │                │ Q1  │ Q2  │
│     │     │                │多任务│     │
├──┼──┼──┼──┤ ← 十字线居中   │     │     │
│ Q3  │ Q4  │                ├──┼──┼──┼──┤ ← 十字线跟随
└─────┴─────┘                │ Q3  │ Q4  │
                             └─────┴─────┘
```

### 实现方案

使用 JS 动态计算十字线位置：

```javascript
function updateCrossLines() {
    var grid = document.querySelector('.matrix-grid');
    var q1 = document.getElementById('quadrant-important-urgent');
    var q3 = document.getElementById('quadrant-not-important-urgent');

    if (!grid || !q1 || !q3) return;

    // 计算第一行高度（Q1/Q2）
    var row1Height = q1.offsetHeight;
    // 水平线 Y 位置 = padding + row1Height + gap/2
    var horizontalY = 32 + row1Height + 16; // padding=32px, gap=32px

    var horizontalLine = document.querySelector('.cross-line.horizontal');
    if (horizontalLine) {
        horizontalLine.style.top = horizontalY + 'px';
    }
}

// 在 renderItems 后调用
// 监听窗口 resize
```

### 触发时机

- 页面加载后
- `renderItems()` 执行后
- 窗口 resize 时

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | matrix-tabs 添加 width: 1364px 和居中 | style.css |
| 2 | 调整 tabs 内部 flex 布局 | style.css |
| 3 | 例行按钮改为蓝色渐变，去掉图标 | todo.html |
| 4 | 添加 has-pending 动效 CSS | todo.html |
| 5 | 添加 updateButtonAnimations() 函数 | todo.html |
| 6 | 添加 updateCrossLines() 函数 | todo.html |
| 7 | 在 renderItems 后调用更新函数 | todo.html |

## 验收标准

1. 名言栏、Tabs 行、四象限三者宽度一致 (1364px)
2. 三者左右边缘对齐
3. Tabs 行内容不溢出
4. "例行"按钮为蓝紫色渐变，纯文字无图标
5. 有未完成例行任务时，"例行"按钮有旋转边框
6. 有未完成 Today 任务时，"Today"按钮有旋转边框
7. 完成度 < 50% 时边框旋转快 (2s)，≥ 50% 时旋转慢 (6s)
8. 全部完成时动效消失
9. 十字线随象限高度变化动态调整位置
