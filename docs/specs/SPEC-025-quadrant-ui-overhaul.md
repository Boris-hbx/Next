# SPEC-025: 四象限 UI 改版

> 起草日期: 2026-01-07
> 状态: 已完成

## 背景

四象限已从传统的"重要度×紧急度"矩阵改为自定义分类：
- Q1: 优先处理
- Q2: 就等你翻牌子了
- Q3: 待分类
- Q4: 短平快

原有的十字线、坐标轴标签（重要/不重要/紧急/不紧急）已不再适用。

---

## 变更项

### 1. Today 标签始终高亮

**问题**: 切换到 "This Week" 或 "Next 30 Days" 时，Today 标签文字变成灰色（实际是 #667eea 紫色）。

**期望**: Today 标签始终保持白色文字 + 渐变背景，作为"主页"标识。

**实现**:
```css
/* Today 标签始终高亮样式 */
.matrix-tab[data-tab="today"] {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

/* 当前选中的 tab 添加边框指示 */
.matrix-tab.active {
    box-shadow: 0 0 0 2px white, 0 0 0 4px #667eea;
}
```

---

### 2. Q2/Q3/Q4 默认折叠

**期望**:
- Q1（优先处理）默认展开
- Q2（就等你翻牌子了）、Q3（待分类）、Q4（短平快）默认折叠
- 点击象限标题可展开/折叠
- 折叠时只显示标题和任务数量

**实现**:

#### HTML 结构调整
```html
<div class="quadrant q2 collapsed" data-quadrant="important-not-urgent">
    <div class="quadrant-header" onclick="toggleQuadrant(this)">
        <span class="quadrant-icon">🎯</span>
        <span class="quadrant-title">就等你翻牌子了</span>
        <span class="quadrant-count">(3)</span>
        <span class="quadrant-toggle">▼</span>
    </div>
    <div class="quadrant-items">...</div>
</div>
```

#### CSS
```css
.quadrant.collapsed .quadrant-items {
    display: none;
}

.quadrant.collapsed .quadrant-toggle {
    transform: rotate(-90deg);
}

.quadrant-header {
    cursor: pointer;
}

.quadrant-count {
    color: #999;
    font-size: 0.85rem;
    margin-left: auto;
}
```

#### JavaScript
```javascript
function toggleQuadrant(header) {
    var quadrant = header.closest('.quadrant');
    quadrant.classList.toggle('collapsed');
    // 保存折叠状态到 localStorage
    saveQuadrantState();
}

function saveQuadrantState() {
    var states = {};
    document.querySelectorAll('.quadrant').forEach(function(q) {
        states[q.dataset.quadrant] = q.classList.contains('collapsed');
    });
    localStorage.setItem('quadrantStates', JSON.stringify(states));
}

function loadQuadrantState() {
    var states = JSON.parse(localStorage.getItem('quadrantStates') || '{}');
    // 默认状态：Q1 展开，其他折叠
    var defaults = {
        'important-urgent': false,
        'important-not-urgent': true,
        'not-important-urgent': true,
        'not-important-not-urgent': true
    };
    Object.keys(defaults).forEach(function(q) {
        var collapsed = states[q] !== undefined ? states[q] : defaults[q];
        var el = document.querySelector('.quadrant[data-quadrant="' + q + '"]');
        if (el) el.classList.toggle('collapsed', collapsed);
    });
}
```

---

### 3. 移除十字线和坐标轴

**删除的元素**:
- `.matrix-cross-center` 整个容器
- `.cross-line.vertical` 和 `.cross-line.horizontal`
- `.arrow-head` (top/bottom/left/right)
- `.axis-label` (重要/不重要/紧急/不紧急)

**同时删除**:
- 拖拽区域中的 `.drop-cross-center`、`.drop-line`、`.drop-arrow-head`、`.drop-axis-label`

**保留**:
- 拖拽区域的 `.drop-quadrant` 四个象限选择区

---

## 联动功能检查清单

### 1. 新建任务
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 默认象限 | important-urgent | 保持 |
| 象限选择器显示新名称 | 已更新 | ✓ |
| 创建后日志记录 | 无（创建不记录） | 保持 |

### 2. 编辑任务
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 象限选择器显示新名称 | 已更新 | ✓ |
| 修改象限后日志记录 | 使用 format_changelog_value | ✓ 已更新 |
| 日志显示新名称 | 🔥优先处理 等 | ✓ 已更新 |

### 3. 拖拽任务
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 同 Tab 内拖拽换象限 | getQuadrantName() | ✓ 已更新 |
| 跨 Tab 拖拽 | drop-quadrant emoji | ✓ 已更新 |
| Toast 提示 | "已移动到优先处理" | ✓ 已更新 |
| 日志记录 | 后端 format_changelog_value | ✓ 已更新 |

### 4. 删除任务
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 软删除 | deleted: true | 保持 |
| 已删除列表显示 | 无象限信息 | 保持 |

### 5. 完成任务
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 进度 100% 自动完成 | 正常 | 保持 |
| 已完成列表显示 | 无象限信息 | 保持 |

### 6. 变更日志
| 检查项 | 当前状态 | 需要修改 |
|--------|----------|----------|
| 象限变更记录 | format_changelog_value | ✓ 已更新 |
| 历史日志兼容 | 显示旧名称 | 保持（不追溯修改） |

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | Today 标签始终高亮 CSS | style.css |
| 2 | 添加 .collapsed 样式 | todo.html (style) |
| 3 | Q2/Q3/Q4 添加 collapsed class | todo.html (HTML) |
| 4 | 添加 toggleQuadrant() 函数 | todo.html (JS) |
| 5 | 添加 localStorage 状态保存 | todo.html (JS) |
| 6 | 删除 matrix-cross-center 元素 | todo.html (HTML) |
| 7 | 删除 drop-cross-center 元素 (3处) | todo.html (HTML) |
| 8 | (可选) 清理 CSS 中的十字线样式 | style.css |

---

## 验收标准

1. Today 标签始终显示白色文字 + 渐变背景
2. 当前选中的 Tab 有明显指示（如边框）
3. Q1（优先处理）默认展开
4. Q2/Q3/Q4 默认折叠，只显示标题和任务数
5. 点击象限标题可展开/折叠
6. 刷新页面后保持折叠状态
7. 十字线和坐标轴标签已移除
8. 拖拽功能正常，目标区域无十字线
9. 所有 Toast 提示显示新象限名称
10. 变更日志记录新象限名称
