# SPEC-037: 手机端 Todo 扁平化 & 审视默认日 & 头像修复

> 起草日期: 2026-02-21
> 状态: 已完成
> 涉及文件: index.html, review.js, mobile.css, tasks.js, settings.js

---

## 一、需求背景

三个独立但规模较小的 UI 改进，合并到一个 spec 实施：

1. **审视面板默认显示"日"而非"全部"** — 用户每次进入审视页都要手动点"日"，体验差
2. **手机端 Todo 不按象限分组** — 手机屏幕小，四象限分组意义不大，直接显示 flat list；电脑端保持不变
3. **头像上传功能修复** — `preset:photo`（即 `avatar.jpg`）文件缺失；需校验功能链路完整

---

## 二、功能详情

### 2.1 审视（Review）默认过滤 = "日"

**现状**：`review.js` 第 7 行 `currentReviewFilter = 'all'`，初始渲染显示全部审视项。
**目标**：进入审视页默认展示频率为 `daily` 的条目。

**改动**：

**`frontend/assets/js/review.js`**：
```js
// 改前
var currentReviewFilter = 'all';

// 改后
var currentReviewFilter = 'daily';
```

**`frontend/index.html`**（审视页 filter 按钮区域，约 293 行）：
```html
<!-- 改前 -->
<button class="review-filter-btn active" data-filter="all" onclick="setReviewFilter('all')">全部</button>
<button class="review-filter-btn" data-filter="daily" onclick="setReviewFilter('daily')">日</button>

<!-- 改后 -->
<button class="review-filter-btn" data-filter="all" onclick="setReviewFilter('all')">全部</button>
<button class="review-filter-btn active" data-filter="daily" onclick="setReviewFilter('daily')">日</button>
```

---

### 2.2 手机端 Todo 扁平列表（无象限分组）

**现状**：手机端显示 Eisenhower Matrix 四象限，折叠/展开，体验笨重。
**目标**：手机端（≤768px）直接显示 flat list，按 `sort_order` 排序，优先处理未完成的，不分象限；已完成任务折叠在底部。电脑端不变。

#### 2.2.1 展示逻辑

手机端 flat list 规则：
- 只显示当前 tab（today/week/month）的未删除任务
- 排序：`completed = 0` 在前，按 `sort_order` 升序；`completed = 1` 在后
- 已完成任务默认折叠（可展开查看）
- 每个 task item 在 task text 右侧显示象限标签（小 badge），让用户知道这个任务属于哪个优先级

#### 2.2.2 实现方案

**方案 A（推荐）**：JS 检测屏幕宽度，动态选择渲染模式。

在 `tasks.js` 中新增 `renderFlatList()` 函数，`renderItems()` 根据 `window.innerWidth <= 768` 分叉：

```js
function renderItems() {
    if (window.innerWidth <= 768) {
        renderFlatList();
    } else {
        renderMatrix();  // 现有象限渲染
    }
}
```

`renderFlatList()` 逻辑：
```js
function renderFlatList() {
    var container = document.getElementById('flat-list-view');
    var items = allItems.filter(function(i) {
        return i.tab === currentTab && !i.deleted;
    });
    // 未完成在前，完成在后
    var pending = items.filter(function(i) { return !i.completed; });
    var done = items.filter(function(i) { return i.completed; });
    // 渲染到 #flat-list-view
    // ...
}
```

#### 2.2.3 HTML 新增容器

在 `#todo-view` 内新增（与 `.eisenhower-matrix` 同级）：

```html
<!-- 手机端扁平列表（JS 控制显示/隐藏） -->
<div class="flat-list-view" id="flat-list-view" style="display:none;"></div>
```

#### 2.2.4 象限 Badge 样式

每个任务卡片右侧显示小 badge：

| 象限 | Badge 文字 | 颜色 |
|------|-----------|------|
| important-urgent | 🔥 | red tint |
| important-not-urgent | ⭐ | blue tint |
| not-important-urgent | ⚡ | yellow tint |
| not-important-not-urgent | ○ | gray |

#### 2.2.5 CSS

```css
/* mobile.css */
@media (max-width: 768px) {
    /* 隐藏象限矩阵，显示 flat list */
    .eisenhower-matrix {
        display: none !important;
    }
    #flat-list-view {
        display: block !important;
        padding: 0 12px;
    }
    .flat-task-item {
        display: flex;
        align-items: center;
        padding: 12px;
        background: var(--card-bg);
        border-radius: 8px;
        margin-bottom: 8px;
        gap: 10px;
    }
    .flat-task-badge {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .flat-task-done-section {
        margin-top: 16px;
    }
    .flat-task-done-toggle {
        font-size: 13px;
        color: var(--text-muted);
        cursor: pointer;
        padding: 8px 0;
    }
}
```

---

### 2.3 头像功能修复

**现状问题**：

| # | 问题 | 影响 |
|---|------|------|
| P1 | `frontend/assets/images/avatar.jpg` 不存在 | 选"preset:photo"后头像显示破图 |
| P2 | 头像存 `localStorage`，多设备/无痕不同步 | 换设备后丢失 |
| P3 | 上传失败（localStorage 超限）无报错 | 用户不知道为什么没变化 |

**本 spec 修复范围（P1 + P3，P2 留后续）**：

#### 修复 P1：去除 `preset:photo` 选项

`avatar.jpg` 不存在且预计不会补充，直接从设置页面删除该预设选项：

**`frontend/index.html`**（删除 preset:photo div）：
```html
<!-- 删除这段 -->
<div class="avatar-preset" data-avatar="preset:photo" onclick="selectPresetAvatar(this)">
    <img src="assets/images/avatar.jpg" alt="Photo">
</div>
```

**`frontend/assets/js/settings.js`**（删除 preset:photo 配置）：
```js
var AVATAR_PRESETS = {
    // 删除 'preset:photo' 行
    'preset:cat': 'assets/images/preset-cat.png',
    'preset:panda': 'assets/images/preset-panda.png'
};
```

#### 修复 P3：上传失败时给 Toast 提示

**`frontend/assets/js/settings.js`** `handleAvatarUpload()` 中：
```js
try {
    localStorage.setItem('userAvatar', dataURL);
    highlightSelectedPreset();
    applyAvatar();
    showToast('头像已更新', 'success');
} catch(e) {
    showToast('图片太大，保存失败，请选择较小的图片', 'error');
}
```

#### 验证颜色渐变选择是否正常

部署后测试：选一个颜色渐变 → 确认右上角头像背景色立即变化。

---

## 三、改动文件清单

| 文件 | 改动 |
|------|------|
| `frontend/assets/js/review.js` | 默认 filter 改为 `'daily'` |
| `frontend/index.html` | 审视 filter active 改到 daily 按钮；删除 preset:photo；新增 `#flat-list-view` 容器 |
| `frontend/assets/js/tasks.js` | 新增 `renderFlatList()`，`renderItems()` 按屏幕宽度分叉 |
| `frontend/assets/css/mobile.css` | 手机端隐藏象限矩阵，flat list 样式 |
| `frontend/assets/js/settings.js` | 删除 preset:photo；上传失败给 toast |

---

## 四、测试用例

| # | 场景 | 预期 |
|---|------|------|
| T1 | 进入审视页 | 默认高亮"日"按钮，只显示 daily 条目 |
| T2 | 手机打开 Todo | 显示 flat list，无象限分组 |
| T3 | 手机 flat list | 未完成任务在前，已完成折叠在后 |
| T4 | 每个任务有象限 badge | 显示对应 emoji/颜色 |
| T5 | 电脑 Todo | 不变，仍显示四象限 |
| T6 | 设置页没有 photo 预设 | 只有 cat/panda + 4种颜色 |
| T7 | 选颜色渐变头像 | 右上角立即变色 |
| T8 | 上传自定义头像 | 成功 toast + 立即生效 |
| T9 | 手机切换 Today/Week/30d | flat list 正确切换过滤 |
