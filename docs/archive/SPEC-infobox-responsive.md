# SPEC: Infobox 响应式适配

## 问题描述

当前任务详情 Infobox（Modal）尺寸固定，存在以下问题：
1. 笔记本小屏幕上显示太大，内容看不全
2. 无法缩放或滚动查看完整内容
3. 外接大显示器上显示正常，但小屏幕体验差

## 目标

1. Infobox 能够适配不同屏幕尺寸
2. 内容过多时可滚动查看
3. 保持良好的视觉体验和可用性

## 设计方案

### 方案 A：响应式尺寸 + 内部滚动（推荐）

```
┌─────────────────────────────────────┐
│ Infobox                             │
│ ┌─────────────────────────────────┐ │
│ │ 标题栏（固定）                   │ │
│ ├─────────────────────────────────┤ │
│ │                                 │ │
│ │ 内容区域（可滚动）               │ │
│ │                                 │ │
│ │ ↕ 滚动                          │ │
│ │                                 │ │
│ ├─────────────────────────────────┤ │
│ │ 底部按钮（固定）                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**尺寸规则：**
| 屏幕高度 | Modal 最大高度 | Modal 宽度 |
|---------|---------------|-----------|
| < 700px | 90vh | 95vw, max 500px |
| 700-900px | 85vh | 90vw, max 550px |
| > 900px | 80vh | 600px |

**关键 CSS：**
```css
.task-modal-content {
    max-height: 80vh;
    max-width: 600px;
    width: 90vw;
    display: flex;
    flex-direction: column;
}

.task-modal-body {
    flex: 1;
    overflow-y: auto;
    max-height: calc(80vh - 120px); /* 减去标题和底部 */
}

@media (max-height: 700px) {
    .task-modal-content {
        max-height: 90vh;
        max-width: 500px;
    }
    .task-modal-body {
        max-height: calc(90vh - 100px);
    }
}
```

### 方案 B：全屏模式（备选）

小屏幕时切换为全屏抽屉模式：

```
┌─────────────────────────────────────┐
│ ← 返回          任务详情            │
├─────────────────────────────────────┤
│                                     │
│ 全屏内容区域                         │
│ （可滚动）                           │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [保存]                    [删除]    │
└─────────────────────────────────────┘
```

### 方案 C：可拖拽调整大小（复杂度高）

添加拖拽边框，用户可自由调整 Modal 大小。

## 推荐方案

**方案 A：响应式尺寸 + 内部滚动**

理由：
1. 实现简单，纯 CSS 即可
2. 保持现有 UI 风格
3. 自动适配各种屏幕
4. 内容可滚动，不会丢失信息

## 实现细节

### 1. Modal 容器结构

```html
<div class="task-modal">
    <div class="task-modal-content">
        <div class="task-modal-header">
            <input type="text" id="modal-title" />
            <button class="modal-close">&times;</button>
        </div>
        <div class="task-modal-body">
            <!-- 所有内容在这里，可滚动 -->
            <textarea id="modal-content"></textarea>
            <div class="task-properties">...</div>
            <div class="task-modal-meta">...</div>
            <div class="changelog-section">...</div>
        </div>
        <div class="task-modal-footer">
            <button>保存</button>
            <button>删除</button>
        </div>
    </div>
</div>
```

### 2. CSS 样式

```css
/* Modal 背景遮罩 */
.task-modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

/* Modal 内容容器 */
.task-modal-content {
    background: var(--card-bg, #fff);
    border-radius: 12px;
    width: 90vw;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}

/* 标题栏 - 固定 */
.task-modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    flex-shrink: 0;
}

/* 内容区 - 可滚动 */
.task-modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    min-height: 0; /* 重要：允许 flex 子元素收缩 */
}

/* 底部按钮 - 固定 */
.task-modal-footer {
    padding: 12px 20px;
    border-top: 1px solid rgba(0,0,0,0.1);
    flex-shrink: 0;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

/* 小屏幕适配 */
@media (max-height: 700px) {
    .task-modal-content {
        max-height: 90vh;
        max-width: 95vw;
    }

    .task-modal-header,
    .task-modal-footer {
        padding: 12px 16px;
    }

    .task-modal-body {
        padding: 16px;
    }
}

/* 超小屏幕（手机横屏等） */
@media (max-height: 500px) {
    .task-modal-content {
        max-height: 95vh;
        border-radius: 8px;
    }
}

/* 滚动条美化 */
.task-modal-body::-webkit-scrollbar {
    width: 6px;
}

.task-modal-body::-webkit-scrollbar-track {
    background: transparent;
}

.task-modal-body::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.2);
    border-radius: 3px;
}
```

### 3. 内容区域高度分配

为避免内容区域过高，各子元素应有合理的 max-height：

```css
/* 详细内容文本框 */
#modal-content {
    min-height: 80px;
    max-height: 200px;
    resize: vertical;
}

/* 变更记录列表 */
.changelog-list {
    max-height: 150px;
    overflow-y: auto;
}
```

## 测试场景

| 场景 | 屏幕尺寸 | 预期行为 |
|------|---------|---------|
| 笔记本 | 1366x768 | Modal 占约 85% 高度，内容可滚动 |
| 外接显示器 | 1920x1080 | Modal 居中显示，宽 600px，适中高度 |
| 4K 显示器 | 3840x2160 | Modal 不会过大，保持 600px 宽度 |
| 小窗口 | 800x600 | Modal 几乎全屏，内容可滚动 |

## 验收标准

1. [ ] Modal 在不同屏幕高度下自动调整大小
2. [ ] 内容过多时出现滚动条，标题和底部按钮始终可见
3. [ ] 滚动条样式美观，不突兀
4. [ ] 小屏幕上 Modal 不会超出视口
5. [ ] 大屏幕上 Modal 不会过大，保持合理宽度
6. [ ] 关闭按钮始终可点击

## 工作量

| 任务 | 复杂度 |
|------|--------|
| 调整 HTML 结构 | 低 |
| 编写响应式 CSS | 中 |
| 测试各种屏幕 | 低 |

预计：纯 CSS 改动，无需修改 JavaScript 逻辑。
