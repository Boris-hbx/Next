# Frontend

> JS 模块、CSS 组织、快捷键、PWA

## 目录结构

```
frontend/
├── index.html              # 主页面（任务管理、侧边栏、弹窗、阿宝面板）
├── login.html              # 登录/注册页面
├── sw.js                   # Service Worker (PWA 离线缓存)
└── assets/
    ├── css/
    │   ├── base.css        # CSS 变量、主题（深色/浅色）、Reset、排版
    │   ├── style.css       # 主布局：侧边栏、内容区、泳道、任务卡片
    │   ├── components.css  # 弹窗、日期选择器、Toast、搜索框
    │   ├── mobile.css      # 移动端：底部 Tab、单列布局、触摸优化
    │   └── abao.css        # 阿宝对话面板样式
    ├── js/                 # 见下方模块详解
    ├── icons/              # favicon, PWA icons (各尺寸)
    ├── images/             # 头像预设图片
    └── manifest.json       # PWA manifest (name, icons, theme_color)
```

## JS 模块加载顺序

**必须按此顺序在 HTML 中引入**（后面的模块依赖前面的全局变量）：

```
api.js → utils.js → app.js → tasks.js → modal.js → datepicker.js → drag.js → review.js → routines.js → features.js → particles.js → living-line.js → abao.js → settings.js
```

## JS 模块职责

| 文件 | 职责 | 关键导出/全局 |
|------|------|-------------|
| `api.js` | REST API 封装，统一 fetch + 401 拦截跳转 | `window.API` 对象 |
| `utils.js` | 工具函数 | `escapeHtml()`, `showToast()`, `formatDate()` |
| `app.js` | 全局状态、Tab/Page 切换、侧边栏、初始化 | `window.currentTab`, `switchTab()`, `switchPage()` |
| `tasks.js` | 任务列表渲染、CRUD、象限折叠、排序 | `renderTodos()`, `loadTodos()` |
| `modal.js` | 任务详情/编辑/创建弹窗 | `openTaskModal()`, `openCreateModal()` |
| `datepicker.js` | 自然语言日期选择器 | 弹窗内使用 |
| `drag.js` | 鼠标拖拽（跨泳道 + 跨 Tab） | 自动初始化 |
| `review.js` | 例行审视 CRUD、频率配置 | `loadReviews()` |
| `routines.js` | 例行任务面板、About 弹窗 | `loadRoutines()` |
| `features.js` | 快捷键、每日回顾、工具提示、搜索 | 自动初始化 |
| `particles.js` | 顶栏彗星粒子 Canvas 动画 | 自动初始化 |
| `living-line.js` | 底部呼吸线 Canvas 动画 | 自动初始化 |
| `abao.js` | 阿宝 AI 对话面板、消息渲染、对话管理 | `toggleAbao()` |
| `settings.js` | 设置页面：账户信息、改密码、注销 | 自动初始化 |

## CSS 文件分工

| 文件 | 内容 |
|------|------|
| `base.css` | `:root` CSS 变量、`[data-theme="dark"]` 主题、全局 Reset |
| `style.css` | 桌面端主布局（侧边栏 + 内容区 + 泳道 + 任务卡片） |
| `components.css` | 弹窗、日期选择器、Toast 通知、搜索框、进度条 |
| `mobile.css` | `@media (max-width: 768px)` 移动端覆盖样式 |
| `abao.css` | 阿宝对话面板（独立，避免影响主样式） |

**CSS 变量用法**: `var(--primary-color)`, `var(--bg-color)`, `var(--text-color)` 等。主题切换通过 `document.documentElement.dataset.theme = 'dark'` 触发。

## 全局状态

```javascript
window.currentTab = 'today';     // 当前时间维度 tab
window.currentPage = 'tasks';    // 当前页面 (tasks/routines/reviews/settings)
window.allTodos = [];            // 当前 tab 的全部任务
```

## 快捷键

| 按键 | 功能 | 实现位置 |
|------|------|---------|
| `N` | 新建任务 | features.js |
| `S` | 搜索 | features.js |
| `B` | 打开/关闭阿宝 | features.js |
| `1` / `2` / `3` | 切换 Today / Week / Month | features.js |
| `D` | 切换深色/浅色主题 | features.js |
| `R` | 每日回顾 | features.js |
| `?` | 快捷键帮助 | features.js |

## API 调用模式

```javascript
// API 对象封装了 fetch + 错误处理
const todos = await API.getTodos('today');
await API.createTodo({ text: '新任务', tab: 'today' });
await API.updateTodo(id, { progress: 50 });
await API.deleteTodo(id);

// 401 自动跳转 login.html
```

## 用户反馈

```javascript
showToast('操作成功', 'success');  // 绿色
showToast('操作失败', 'error');    // 红色
showToast('提示信息', 'info');     // 蓝色
```

## PWA / Service Worker

**缓存策略**: Network First, Cache Fallback

- **Install**: 预缓存所有静态资源（HTML/CSS/JS），`skipWaiting()`
- **Activate**: 清理旧版本缓存，`clients.claim()`
- **Fetch**:
  - `/api/*` 请求：直接走网络，不缓存
  - 静态资源：先尝试网络，成功则更新缓存；失败则回退缓存
- **版本管理**: `CACHE_NAME = 'next-v6'`，更新时改版本号

**注意**: `sw.js` 和 `index.html` 由服务器设置 `Cache-Control: no-cache` 头，避免 SW 缓存死循环。

## localStorage 存储

| Key | 用途 |
|-----|------|
| `userAvatar` | 头像选择（预设头像名） |
| `theme` | 主题偏好 (`dark` / `light` / `system`) |
| `quadrantStates` | 各象限折叠/展开状态 |
| `sidebarCollapsed` | 侧边栏是否收起 |
