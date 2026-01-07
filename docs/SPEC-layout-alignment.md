# SPEC: 整体布局对齐

## 尺寸计算

### 基准单位
- **单个象限宽度**: 666px

### 布局结构

```
┌─────────────────────────────────────────────┬──────────────────┐
│ Tabs: Today | Week | Month    [+ 添加任务]  │                  │
├─────────────────────┬───────────────────────┤   已完成 (666)   │
│                     │                       │                  │
│   Q1 (666)          │   Q2 (666)            │   ☑ 任务A 张三   │
│                     │                       │   ☑ 任务B 李四   │
├─────────────────────┼───────────────────────┤                  │
│                     │                       ├──────────────────┤
│   Q3 (666)          │   Q4 (666)            │                  │
│                     │                       │   已删除         │
│                     │                       │   (折叠区域)     │
└─────────────────────┴───────────────────────┴──────────────────┘
│←─────── 四象限区域: 666×2 + gap ──────────→│←─── 侧边栏 ────→│
│←─────────────────── 总宽度对齐 ─────────────────────────────→│
```

### 尺寸明细

| 区域 | 折叠宽度 | 展开宽度 | 说明 |
|------|----------|----------|------|
| 单个象限 | - | 666px | 固定宽度 |
| 象限 gap | - | 32px | 象限间距 |
| 四象限总宽 | - | 1364px | 666×2 + 32 |
| 已完成 | 300px | 666px | 默认折叠 |
| 已删除 | 300px | 666px | 默认折叠 |
| 主布局 gap | - | 32px | 四象限与侧边栏间距 |

### 折叠/展开交互

```
【折叠状态】                    【展开状态】
┌──────────────┬────────┐      ┌──────────────┬────────────────┐
│              │        │      │              │                │
│  四象限      │▶ 已完成│  →   │  四象限      │ ☑ 任务A 张三   │
│  (1364px)    │(300px) │      │  (1364px)    │ ☑ 任务B 李四   │
│              │        │      │              │    (666px)     │
│              ├────────┤      │              ├────────────────┤
│              │▶ 已删除│      │              │▶ 已删除 (300)  │
└──────────────┴────────┘      └──────────────┴────────────────┘
```

### 展开动画

```css
.sidebar-section {
    width: 300px;
    transition: width 0.3s ease;
}

.sidebar-section.expanded {
    width: 666px;
}
```

### Tabs 行

Tabs 行宽度 = 四象限总宽 (1364px)，与四象限左右对齐。

---

## 新增：已删除区域

### 功能
- 显示已删除的任务（软删除，可恢复）
- 默认折叠
- 与已完成区域相同样式

### 数据结构
任务增加 `deleted` 和 `deleted_at` 字段：
```json
{
  "deleted": true,
  "deleted_at": "2026-01-05T10:30:00"
}
```

### 行为
- 删除任务 → 标记 `deleted: true`，移入已删除区
- 已删除区可恢复任务 → 清除 `deleted` 标记
- 已删除区可永久删除 → 从数据中移除

---

## CSS 结构

```css
.todo-main-layout {
    display: flex;
    gap: 32px;
    max-width: 2200px;
    margin: 0 auto;
    align-items: flex-start;
}

.todo-matrix-container {
    width: 1364px;  /* 四象限 + gap */
    flex-shrink: 0;
}

.matrix-grid {
    grid-template-columns: 666px 666px;
}

.right-sidebar {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex-shrink: 0;
}

/* 侧边栏区块（已完成/已删除） */
.sidebar-section {
    width: 300px;
    transition: width 0.3s ease;
    overflow: hidden;
}

.sidebar-section.expanded {
    width: 666px;
}

.sidebar-section .section-header {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sidebar-section .section-content {
    display: none;
}

.sidebar-section.expanded .section-content {
    display: block;
}
```

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | 象限宽度改为 666px | style.css |
| 2 | 创建 .right-sidebar 容器 | todo.html |
| 3 | 已完成区移入 right-sidebar | todo.html |
| 4 | 新增已删除区域 HTML | todo.html |
| 5 | 已删除区域样式 | style.css |
| 6 | 后端支持软删除 | app.py |
| 7 | 前端删除逻辑改为软删除 | todo.html |
| 8 | 已删除区恢复/永久删除功能 | todo.html |

## 验收标准

1. 单个象限宽度 666px
2. 已完成/已删除侧边栏宽度 666px
3. Tabs 行与四象限左右对齐
4. 整体布局居中对齐
5. 删除任务进入已删除区
6. 已删除区可恢复或永久删除
