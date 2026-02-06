# SPEC: 四象限自动高度

## 问题

当前四象限有固定高度限制，任务多时出现滚动条，无法一眼看到所有任务。

## 目标

四象限高度自适应内容，默认不限制高度，任务多时纵向拉长。超过15个任务后才显示滚动条。

## 当前行为

```
┌─────────────────┐
│ Q1 (固定高度)    │
│ · 任务1         │
│ · 任务2         │
│ · 任务3         │
│ ────滚动条──── │  ← 任务多时出现滚动条
└─────────────────┘
```

## 期望行为

```
【少于15个任务】              【超过15个任务】
┌─────────────────┐          ┌─────────────────┐
│ Q1              │          │ Q1              │
│ · 任务1         │          │ · 任务1         │
│ · 任务2         │          │ · 任务2         │
│ · 任务3         │          │ · ...           │
│ · 任务4         │          │ · 任务15        │
│ · 任务5         │          │ ────滚动条──── │
│ (自动拉长)      │          │                 │
└─────────────────┘          └─────────────────┘
      ↑                              ↑
  高度自适应                    max-height 限制
  无滚动条                      出现滚动条
```

## 实现方案

### 计算逻辑

- 单个任务卡片高度约 48px（含 margin）
- 15 个任务 ≈ 720px
- 设置 `max-height: 720px`，超过后滚动

### CSS 修改

```css
.quadrant-items {
    /* 移除固定高度限制 */
    min-height: 100px;
    max-height: none;  /* 默认不限制 */
    overflow: visible;
}

/* 当任务超过15个时，JS 动态添加此 class */
.quadrant-items.has-scroll {
    max-height: 720px;  /* 约15个任务高度 */
    overflow-y: auto;
}
```

### JS 逻辑

```javascript
function updateQuadrantScroll(quadrantId) {
    var items = document.querySelector('#' + quadrantId + ' .quadrant-items');
    var taskCount = items.querySelectorAll('.task-card').length;
    if (taskCount > 15) {
        items.classList.add('has-scroll');
    } else {
        items.classList.remove('has-scroll');
    }
}
```

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | 移除 quadrant-items 固定高度，改为自适应 | style.css |
| 2 | 添加 .has-scroll class 样式 | style.css |
| 3 | renderItems 后检查任务数量，动态添加 class | todo.html |

## 验收标准

1. 任务少于15个时，象限高度自适应，无滚动条
2. 任务超过15个时，出现滚动条，max-height 约 720px
3. 四象限可以独立滚动，互不影响
4. 一眼能看到所有任务（15个以内）
