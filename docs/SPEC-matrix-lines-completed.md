# SPEC: 十字线动态定位 + 已完成任务统一显示

## 问题 1: 十字线位置

### 现状
- 十字线使用 CSS `left: 50%` 和 `top: 50%` 固定定位
- 四象限使用 `grid-template-rows: auto auto`，行高根据内容变化
- 当上下两行高度不同时，水平线不在视觉中心

### 方案

**选项 A: JavaScript 动态计算**
- 监听内容变化，计算四象限的实际边界
- 用 JS 设置十字线位置

**选项 B: 改用 CSS Grid 线 (推荐)**
- 移除绝对定位的十字线
- 在 grid 的 gap 区域绘制线条
- 使用伪元素或新的 div 结构

**选项 C: 固定行高**
- 设置 `grid-template-rows: 1fr 1fr` 让行高相等
- 十字线保持 50% 定位

### 推荐方案 C

最简单有效。将行高改为 `1fr 1fr`，配合 `min-height` 保证基本高度，象限内容超出时滚动。

```css
.matrix-grid {
    grid-template-rows: 1fr 1fr;  /* 改为等高 */
    min-height: 500px;            /* 最小高度 */
}

.quadrant-items {
    max-height: 300px;            /* 限制任务列表高度 */
    overflow-y: auto;             /* 超出滚动 */
}
```

---

## 问题 2: 已完成任务不分 Tab

### 现状
```javascript
allItems.forEach(function(item) {
    if (item.tab !== currentTab) return;  // ← 过滤了 tab
    if (item.completed) {
        completedHtml += createCompletedItemHtml(item);
    }
});
```

### 方案

移除已完成任务的 tab 过滤，显示所有已完成任务：

```javascript
// 1. 渲染未完成任务（按 tab 过滤）
allItems.forEach(function(item) {
    if (item.tab !== currentTab) return;
    if (!item.completed) {
        // 渲染到象限
    }
});

// 2. 渲染已完成任务（不过滤 tab）
allItems.forEach(function(item) {
    if (item.completed) {
        completedHtml += createCompletedItemHtml(item);
    }
});
```

### 显示格式

每条已完成任务显示三列信息：

```
☑ 任务A   张三   提前1天
☑ 任务B   李四   超期2天
☑ 任务C   --     按时完成
```

| 列 | 字段 | 逻辑 |
|---|------|------|
| 任务名 | `item.text` | 直接显示 |
| 负责人 | `item.assignee` | 空则显示 `--` |
| 完成状态 | 计算 | `completed_at` 与 `due_date` 对比 |

**完成状态计算**:
```javascript
function getCompletionStatus(item) {
    if (!item.due_date || !item.completed_at) return '';
    var due = new Date(item.due_date);
    var completed = new Date(item.completed_at);
    var diff = Math.floor((due - completed) / (1000 * 60 * 60 * 24));
    if (diff > 0) return '提前' + diff + '天';
    if (diff < 0) return '超期' + Math.abs(diff) + '天';
    return '按时';
}
```

---

---

## 问题 3: 移除任务卡片"编辑"按钮

四象限任务卡片右侧的"编辑"按钮移除，点击任务本身即可打开详情。

---

## 问题 4: 任务弹窗标题栏重构

### 当前布局
```
┌─────────────────────────────────────────────┐
│ [任务标题________________]            [×]   │
└─────────────────────────────────────────────┘
```

### 新布局
```
┌─────────────────────────────────────────────┐
│ [任务标题________________]    [编辑] [关闭] │
│ (最多2行，限50字)                           │
└─────────────────────────────────────────────┘
```

### 尺寸计算

| 项目 | 尺寸 |
|------|------|
| 弹窗宽度 | 720px |
| 左右 padding | 40px |
| 按钮区 ("编辑"+"关闭"+间距) | ~112px |
| 标题可用宽度 | ~556px |
| 标题字体 | 18px |
| 单行字数 | ~30字 |
| **双行限制** | **50字** |

### 行为规则

| 模式 | 标题栏按钮 | 底部按钮 |
|------|-----------|---------|
| 查看模式 | [编辑] [关闭] | 无 |
| 编辑模式 | [关闭] | [取消] [保存] |
| 新建模式 | [关闭] | [取消] [创建] |

### 标题输入提示

新建任务时，placeholder 显示字数限制：
```html
<input placeholder="任务标题（限50字）">
```

### CSS 样式要点

```css
.title-input {
    max-width: calc(100% - 130px);  /* 留出按钮空间 */
    max-height: 52px;               /* 约2行 */
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
```

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | 四象限 grid 改为等高 `1fr 1fr` | style.css |
| 2 | 象限内容区添加 `max-height` + 滚动 | style.css |
| 3 | 已完成任务移除 tab 过滤 | todo.html |
| 4 | 新增 `getCompletionStatus()` 函数 | todo.html |
| 5 | 重写 `createCompletedItemHtml()` 三列布局 | todo.html |
| 6 | 移除任务卡片的"编辑"按钮 | todo.html |
| 7 | 弹窗标题栏重构：[编辑] [关闭] 按钮 | todo.html |
| 8 | 标题 textarea 改为多行，限50字 | todo.html |
| 9 | 新建模式 placeholder 显示字数限制 | todo.html |

## 验收标准

1. 十字线始终在四象限正中央
2. 任务多时象限内滚动，不撑开整体布局
3. 已完成侧边栏显示所有 tab 的已完成任务
4. 每条已完成任务显示：任务名 + 负责人 + 完成状态
5. 完成状态正确计算（提前/超期/按时/无截止日期）
6. 任务卡片无"编辑"按钮，点击直接打开详情
7. 弹窗标题栏右侧显示 [编辑] [关闭] 按钮
8. 标题支持2行显示，最多50字
9. 新建任务时 placeholder 显示"任务标题（限50字）"
