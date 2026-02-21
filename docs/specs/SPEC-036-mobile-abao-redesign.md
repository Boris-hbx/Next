# SPEC-036: 手机端体验修复 & 阿宝交互重构

> 起草日期: 2026-02-21
> 状态: 已完成
> 参与角色: 问题排查、场景推演、用户体验、界面重构、测试

---

## 一、Context

Next 已完成 Web 化迁移（SPEC-035），手机和电脑通过浏览器访问同一 Web 服务。当前存在两个核心问题：

1. **手机端显示异常** — 桌面布局直接塞给手机，仅靠 CSS `display:none` 隐藏部分元素，不是真正的移动端体验
2. **阿宝交互不合理** — 电脑端入口藏在右侧边栏底部找不到；手机端点击后全屏切走，影响任务操作

**目标**：让手机端可用、好用；让阿宝在所有端上都是"无感辅助"而非"独立页面"。

---

## 二、问题清单

### 2.1 手机端显示问题

| # | 问题 | 原因 | 严重度 |
|---|------|------|--------|
| M1 | 右侧边栏被 `display:none` 隐藏 → 待处理/已完成/已删除不可用 | `mobile.css:504` 直接隐藏 `.right-sidebar` | P0 |
| M2 | 底部导航只有 Todo/审视/阿宝，缺少收件箱入口 | 阿宝占了一个 tab 位 | P0 |
| M3 | Tab 栏（例行/Today/Week/30d）+ 负责人筛选在小屏上挤在一行 | 没有为小屏做折行处理 | P1 |
| M4 | 任务弹窗内部表单没有响应式处理 | 弹窗设了 `width:95vw` 但内部字段布局未适配 | P1 |
| M5 | 顶栏 `top-header` 在手机上没有充分利用 | 缺少快捷操作（搜索、新建） | P2 |

### 2.2 阿宝交互问题

| # | 问题 | 原因 | 严重度 |
|---|------|------|--------|
| A1 | 电脑端阿宝入口在右侧边栏最底部，容易找不到 | `abao-trigger-btn` 在 `right-sidebar` 末尾，被折叠区推到视口外 | P0 |
| A2 | 手机端点"阿宝"标签 → 全屏覆盖整个界面 | `abao-panel` 在 `≤768px` 时 `width:100%; height:100%` | P0 |
| A3 | 阿宝创建任务后，用户看不到任务列表刷新 | 阿宝全屏覆盖了任务视图 | P1 |

---

## 三、方案设计

### 3.1 阿宝浮动按钮化（P0，解决 A1 + A2）

**核心思路：阿宝从"页面元素"变为"全局浮动辅助工具"。**

#### 3.1.1 所有端统一：浮动按钮 (FAB)

```
位置: position: fixed; bottom: 24px; right: 24px;
尺寸: 56×56px 圆形
样式: 主题色背景 + 🐾 图标 + 轻微阴影
层级: z-index: 900 (低于 modal，高于普通内容)
```

**手机端调整：**
```
bottom: calc(56px + env(safe-area-inset-bottom) + 16px)  // 底部导航上方
right: 20px
```

#### 3.1.2 桌面端：点击 FAB → 右侧弹出对话面板

保持现有 `abao-panel` 的 400px 右侧面板设计，仅改变触发方式：
- 删除 `right-sidebar` 中的 `abao-trigger-btn`
- 新增全局 FAB 按钮
- 点击 FAB 或按 `B` 键 → 打开/关闭面板

#### 3.1.3 手机端：点击 FAB → 底部弹出式对话框（半屏）

```
┌─────────────────────────┐
│  (任务列表仍可见)        │
│                          │  ← 上方 40% 保留，半透明遮罩
├──────────────────────────┤
│  ── (拖拽条) ──          │  ← 下拉可关闭
│  阿宝 · 在线        [×]  │
│  ┌──────────────────┐   │
│  │ 消息区域          │   │
│  │                   │   │
│  └──────────────────┘   │
│  [今日概览][整理][统计]   │
│  [________________] [→]  │
└──────────────────────────┘
```

**CSS 关键改动（`abao.css` @media ≤768px）：**

```css
@media (max-width: 768px) {
    .abao-panel {
        width: 100%;
        top: auto;           /* 不再从顶部开始 */
        bottom: 0;
        left: 0;
        right: 0;
        height: 60vh;        /* 只占 60% 屏幕高度 */
        border-radius: 16px 16px 0 0;
        border-left: none;
        border-top: 1px solid var(--border-color);
        transform: translateY(100%);  /* 从底部弹出 */
    }

    .abao-panel.open {
        transform: translateY(0);
    }
}
```

**JS 改动（`abao.js`）：**
- 新增拖拽条，支持下拉关闭手势
- 虚拟键盘弹出时自动调整高度（`visualViewport` API）

#### 3.1.4 HTML 改动

```html
<!-- 删除 right-sidebar 中的 abao-trigger-btn (index.html:268-270) -->

<!-- 新增全局浮动按钮，放在 mobile-bottom-nav 之前 -->
<button class="abao-fab" id="abao-fab" onclick="Abao.toggle()" title="问阿宝 (B)">
    🐾
</button>
```

**新增 CSS（`abao.css`）：**

```css
.abao-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-gradient);
    color: white;
    font-size: 24px;
    border: none;
    cursor: pointer;
    z-index: 900;
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s, box-shadow 0.2s;
}

.abao-fab:active {
    transform: scale(0.92);
}

/* 阿宝面板打开时隐藏 FAB */
.abao-fab.hidden {
    display: none;
}

/* 手机端：FAB 在底部导航上方 */
@media (max-width: 768px) {
    .abao-fab {
        bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
        right: 20px;
    }
}
```

### 3.2 底部导航重构（P0，解决 M1 + M2）

**将阿宝 tab 替换为收件箱 tab：**

```html
<nav class="mobile-bottom-nav" id="mobile-bottom-nav">
    <a class="mobile-nav-item active" data-page="todo">
        <span class="mobile-nav-icon">✓</span>
        <span class="mobile-nav-label">Todo</span>
    </a>
    <a class="mobile-nav-item" data-page="review">
        <span class="mobile-nav-icon">☰</span>
        <span class="mobile-nav-label">审视</span>
    </a>
    <a class="mobile-nav-item" data-page="inbox">
        <span class="mobile-nav-icon">📋</span>
        <span class="mobile-nav-label">收件箱</span>
    </a>
</nav>
```

**收件箱页面内容：** 复用右侧边栏的三个 section（待处理/已完成/已删除），在手机端以独立视图呈现。

**JS 改动（`app.js`）：**

```javascript
// switchPage 支持 'inbox' 页面
function switchPage(page) {
    currentPage = page;
    document.getElementById('todo-view').style.display = page === 'todo' ? '' : 'none';
    document.getElementById('review-view').style.display = page === 'review' ? '' : 'none';
    document.getElementById('inbox-view').style.display = page === 'inbox' ? '' : 'none';
    // ...
}
```

**HTML 新增 inbox-view：**

在手机端，将右侧边栏的内容渲染到 `#inbox-view` 中。可以通过以下方式实现：
- 方案 A：在 `≤768px` 时，把 `.right-sidebar` 的子元素动态移动到 `#inbox-view`
- 方案 B（推荐）：新建 `#inbox-view` 容器，手机端显示时共享同一份数据，复用渲染逻辑

### 3.3 手机端布局优化（P1，解决 M3 + M4 + M5）

#### 3.3.1 Tab 栏适配

```css
@media (max-width: 768px) {
    /* Tab 栏横向滚动 */
    .matrix-tabs {
        overflow-x: auto;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }

    /* 负责人筛选独立一行，可滚动 */
    .assignee-filter-bar {
        overflow-x: auto;
        white-space: nowrap;
        padding: 8px 12px;
    }
}
```

#### 3.3.2 弹窗表单适配

```css
@media (max-width: 768px) {
    .modal-content {
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100vh !important;
        max-height: 100vh !important;
        border-radius: 0;
        margin: 0;
    }

    .modal-body {
        padding: 16px;
    }

    /* 表单字段全宽堆叠 */
    .form-row {
        flex-direction: column;
        gap: 12px;
    }
}
```

#### 3.3.3 顶栏利用

在手机端顶栏右侧添加搜索和新建按钮：

```css
@media (max-width: 768px) {
    .top-header {
        height: 48px;
    }

    .header-right {
        display: flex;
        gap: 8px;
    }
}
```

---

## 四、改动文件清单

| 文件 | 改动 |
|------|------|
| `frontend/index.html` | 新增 `abao-fab` 按钮；删除 `abao-trigger-btn`；底部导航去掉阿宝加收件箱；新增 `#inbox-view` 容器 |
| `frontend/assets/css/abao.css` | 新增 `.abao-fab` 样式；手机端面板改为底部弹出半屏；拖拽条样式 |
| `frontend/assets/css/mobile.css` | Tab 栏横向滚动；弹窗全屏化；收件箱视图样式 |
| `frontend/assets/js/abao.js` | FAB 按钮控制；手机端下拉关闭手势；键盘适配 |
| `frontend/assets/js/app.js` | `switchPage` 支持 `inbox`；收件箱数据渲染 |

---

## 五、测试计划

### 5.1 设备矩阵

| 设备 | 屏幕宽度 | 重点验证 |
|------|---------|---------|
| iPhone SE | 375px | 最小屏幕，布局不溢出 |
| iPhone 14 | 390px | 标准手机，全功能 |
| iPad Mini | 768px | 断点边界 |
| 桌面 1920px | 1920px | FAB 可见，面板正常 |

### 5.2 测试用例

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| T1 | 手机打开首页 | 直接访问 | 单列四象限手风琴，底部3个tab，右下角阿宝 FAB |
| T2 | 手机点击 FAB | 点击 🐾 | 底部弹出半屏对话框，上方仍可看到任务 |
| T3 | 手机发消息 | 输入文字并发送 | 正常收发，键盘不遮挡输入框 |
| T4 | 手机关闭阿宝 | 下拉拖拽条或点×| 对话框滑下关闭，回到任务视图 |
| T5 | 手机阿宝创建任务 | 说"帮我创建一个任务" | 创建成功，关闭对话框后任务列表已刷新 |
| T6 | 手机切到收件箱 | 点底部"收件箱"tab | 显示待处理/已完成/已删除三个区域 |
| T7 | 电脑点击 FAB | 点击右下角 🐾 | 右侧弹出 400px 对话面板 |
| T8 | 电脑按 B 键 | 按 B | 切换阿宝面板 |
| T9 | 虚拟键盘弹出 | 点击输入框 | 对话框上推，输入框不被遮挡 |
| T10 | 安全区域 | 刘海屏设备 | FAB 和底部导航不被遮挡 |

---

## 六、实施顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 阿宝 FAB 按钮化（桌面+手机） | 无 |
| Phase 2 | 手机端阿宝底部弹出式对话框 | Phase 1 |
| Phase 3 | 底部导航重构 + 收件箱 tab | 无，可与 Phase 1 并行 |
| Phase 4 | Tab 栏、弹窗、顶栏的移动端适配 | 无，可独立 |
| Phase 5 | 测试 & 打磨 | Phase 1-4 |
