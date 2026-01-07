# Spec: 任务项显示相关人

## 目标

在四象限任务列表中，每个任务项右侧显示该任务的相关人（assignee）。

## 效果示意

```
┌─────────────────────────────────────┐
│ 🔴 重要且紧急                       │
├─────────────────────────────────────┤
│ ○ 所长上岗大纲梳理          Boris   │
│ ○ 教授谈话问题总结        Belinda   │
│ ○ 报销                              │
│ ○ 驾照                              │
│ ○ 光的case                   Jack   │
└─────────────────────────────────────┘
```

## 设计规范

### 布局
| 元素 | 位置 | 说明 |
|------|------|------|
| 任务名 | 左侧 | 现有样式不变 |
| 相关人 | 右侧 | 右对齐，与任务名同行 |

### 样式
| 属性 | 值 | 说明 |
|------|-----|------|
| 字体大小 | 12px | 比任务名小 |
| 颜色 | var(--text-secondary) | 次要文字颜色，不抢焦点 |
| 最大宽度 | 80px | 防止名字过长挤压任务名 |
| 溢出处理 | ellipsis | 超长名字显示省略号 |
| 间距 | margin-left: 8px | 与任务名保持间距 |

### 显示逻辑
- **有相关人**: 显示名字
- **无相关人**: 不显示任何内容（不占空间）
- **名字过长**: 截断并显示省略号，悬停显示完整名字

## 修改清单

### 1. 前端 `todo.html`

#### 修改 renderTodos 函数中的任务项模板

找到生成任务项 HTML 的代码，修改为：

```javascript
// 在任务文字后添加相关人显示
var assigneeHtml = item.assignee
    ? '<span class="task-assignee" title="' + item.assignee + '">' + item.assignee + '</span>'
    : '';

// 任务项 HTML 结构
'<div class="task-item" ...>' +
    '<span class="task-text">' + item.text + '</span>' +
    assigneeHtml +
'</div>'
```

### 2. 样式 `style.css` 或 `todo.html` 内联样式

```css
/* 任务项布局 */
.task-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

/* 任务文字 */
.task-text {
    flex: 1;
    min-width: 0;  /* 允许文字截断 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 相关人标签 */
.task-assignee {
    font-size: 12px;
    color: var(--text-secondary, #888);
    margin-left: 8px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
}
```

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| assignee 为空字符串 | 不显示 |
| assignee 为 null/undefined | 不显示 |
| assignee 超过 80px 宽度 | 截断 + 省略号，title 显示完整 |
| 任务名很长 | 任务名截断，相关人保持显示 |

## 验收标准

1. [ ] 有相关人的任务，右侧显示相关人名字
2. [ ] 无相关人的任务，右侧无任何显示
3. [ ] 相关人名字使用次要颜色，不抢视觉焦点
4. [ ] 长名字正确截断并显示省略号
5. [ ] 悬停长名字时显示完整内容
6. [ ] 深色/浅色主题下显示正常
7. [ ] 移动端显示正常

## 实施步骤

1. [x] 创建 spec 文档
2. [ ] 修改 todo.html 任务项模板
3. [ ] 添加 CSS 样式
4. [ ] 测试各种情况
5. [ ] 重新打包
