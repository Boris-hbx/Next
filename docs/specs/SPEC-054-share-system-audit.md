# SPEC-054: 分享系统全面审计 + Use Case 补全
> 起草日期: 2026-02-28
> 状态: 草稿
> 前置: SPEC-045 Phase1+2 已合并

---

## 一、系统全景图

### 1.1 数据流

```
发送方                        后端 (friends.rs)             接收方
─────────────────────         ─────────────────────         ─────────────────────
点击 📤 分享按钮
  → ShareModal.openShare()
  → API.getFriends()      →   GET /api/friends
                          ←   好友列表
  → API.getSharedSent()   →   GET /api/share/sent
                          ←   已分享记录 (去重用)
  → 选人点发送
  → API.shareItem()       →   POST /api/share
                              验证好友关系
                              构建 item_snapshot (JSON)
                              INSERT shared_items (status=unread)
                          ←   { success: true }
  ← showToast('分享成功')

                                                            (轮询/切页)
                                                            loadSharedInbox()
                                                              → API.getSharedInbox()
                                                          →   GET /api/share/inbox
                                                          ←   [ shared_items... ]
                                                            ← renderSharedInbox()
                                                            ← renderShareBanners()
                                                            ← updateInboxBadge()

                                                            点击 [收下]
                                                            → API.acceptShared(id)
                                                        →   POST /api/share/:id/accept
                                                            读取 item_snapshot
                                                            INSERT 到对应表
                                                            UPDATE status=accepted
                                                        ←   { new_id, item_type }
                                                            ← navigateToAcceptedItem()

                                                            点击 [忽略]
                                                            → API.dismissShared(id)
                                                        →   POST /api/share/:id/dismiss
                                                            UPDATE status=dismissed
                                                        ←   { success: true }
```

### 1.2 涉及的文件清单

| 文件 | 职责 |
|------|------|
| `server/src/routes/friends.rs` | share_item / shared_inbox / accept_shared / dismiss_shared / shared_sent |
| `frontend/assets/js/friends.js` | Friends IIFE：好友管理 + 收件箱渲染 + accept/dismiss |
| `frontend/assets/js/share-modal.js` | ShareModal IIFE：发送方好友选择器弹窗 |
| `frontend/assets/js/api.js` | shareItem / getSharedInbox / acceptShared / dismissShared |
| `frontend/assets/js/app.js` | switchPage() → loadSharedInbox() |
| `frontend/index.html` | #shared-section / #shared-inbox-section / #inbox-bell-wrapper / banners |
| `frontend/assets/css/mobile.css` | body.page-inbox 样式 |
| `frontend/assets/css/style.css` | shared-item-card / share-banner 样式 |

### 1.3 支持的 item_type

| item_type | 后端 share_item | 后端 accept_shared | 前端 bannerConfig | 前端 navigateToAcceptedItem |
|-----------|-----------------|-------------------|-------------------|------------------------------|
| `scenario` | ✅ | ✅ | ✅ | ✅ switchPage + openDetail (500ms) |
| `todo`     | ✅ | ✅ | ✅ | ✅ switchPage + openTaskDetail (500ms) |
| `review`   | ✅ | ✅ | ✅ | ⚠️ 只 switchPage，无 highlight |
| `routine`  | ✅ | ✅ | ❌ 缺 banner | ⚠️ 跳到 todo 页，无操作 |
| `expense`  | ✅ | ✅ | ❌ 缺 banner | ⚠️ 双重 500ms timeout，可能失效 |

---

## 二、Use Cases

### UC-01 发送方分享英语场景

**前提**: A 和 B 是好友；A 登录并在学习页面

**主路径**:
1. A 在英语场景列表点击某个笔记，进入详情
2. A 点击详情页顶部的 📤 按钮
3. 弹出好友选择器，显示好友列表和"已分享"状态
4. A 选择 B，可选输入附言，点击 [发送]
5. 按钮变为 ✓ 状态，toast 显示"分享成功"
6. 后端写入 `shared_items`

**期望结果**: B 的收件箱出现一条新分享

**当前状态**: ✅ 基本正常（Phase 1+2 已修）

**已知细节问题**:
- `share-modal.js` 的 `_doShare()` 没有把附言 message 传给 `API.shareItem()`（硬编码无 message 参数）

---

### UC-02 发送方分享待办任务

**前提**: A 和 B 是好友；A 在 Todo 页面

**主路径**:
1. A 打开某个任务详情弹窗
2. **寻找分享入口** → ❌ 任务详情弹窗没有 📤 分享按钮
3. 无法完成分享

**期望结果**: 用户能在任务详情内找到分享入口

**当前状态**: ❌ 入口缺失
- `modal.js` 中任务详情弹窗无分享按钮
- 后端 share_item 支持 `todo` 类型，但前端无触发入口

**修复**: 在任务详情弹窗底部 action bar 添加 📤 分享按钮

---

### UC-03 发送方分享例行审视项

**前提**: A 和 B 是好友；A 在例行审视页面

**主路径**:
1. A 展开某个审视项
2. **寻找分享入口** → ❌ 审视页无分享按钮

**当前状态**: ❌ 入口缺失（后端支持，前端无入口）

---

### UC-04 接收方发现新分享（App 启动时）

**前提**: B 的账号有未读分享；B 刚启动 App

**主路径**:
1. B 打开 App，停留在 Todo 页（默认页）
2. B 期望看到通知或 badge

**当前状态**: ⚠️ 部分有效
- `updateInboxBadge()` 在 2s 后被调用，会更新顶部铃铛 badge count ✅
- 但 `loadSharedInbox()` **仅在 `switchPage()` 调用时触发**
- App 启动时 `switchPage` 不会被调用（只调用了 `loadItems()`）
- **结果**: badge 有数字，但收件箱内容为空。用户点铃铛，`openShareInbox()` 执行：
  - 移动端：`page-inbox` 模式下右侧边栏显示 ✅
  - 但 `shared-section` 因 `sharedItems=[]` 是 `display:none` → **空白**

**根因**: `loadSharedInbox()` 未在 App 初始化时调用，只依赖 `switchPage()` 触发

**修复**: 在 App 初始化完成后（auth 检查通过后）立即调用一次 `Friends.loadSharedInbox()`

---

### UC-05 接收方发现新分享（切换页面时）

**前提**: B 有未读分享；B 已经在 App 内，切换到英语页面

**主路径**:
1. B 点击导航切换到"学习"页
2. `switchPage('english')` 被调用
3. `Friends.loadSharedInbox()` 被调用
4. `renderShareBanners()` 在 `#english-share-banner` 渲染提示条

**当前状态**: ✅ 正常（只要 B 切换过页面）

---

### UC-06 接收方点击顶部铃铛图标（移动端）

**前提**: B 有未读分享，badge 显示数字；B 在移动端

**主路径**:
1. B 点击顶部铃铛（`#inbox-bell-wrapper`）
2. `Friends.openShareInbox()` 被调用
3. 添加 `body.page-inbox` class
4. CSS：`.right-sidebar` 全屏显示，`.main-content` 隐藏
5. `openShareInbox()` 展开 `#shared-section`

**当前状态**: ⚠️ 问题多

**问题 1**: 如果 `loadSharedInbox()` 还没被调用过（UC-04 场景），`sharedItems=[]`，
`renderSharedInbox()` 不渲染任何内容，`shared-section` 是 `display:none`，
右侧边栏中所有 sidebar-section 都隐藏 → **右侧边栏空白**

**问题 2**: `openShareInbox()` 内先 hide 掉所有主页面，再 `section.style.display = ''`，
但 `shared-section` 的展开状态（`.expanded` 类）控制的是 `section-content` 的可见性。
如果 `sidebar-section` 的 `section-content` 默认折叠，内容依然不可见。

**问题 3**: `openShareInbox()` 桌面端调用 `switchPage('todo')`，但 `switchPage` 会触发
`Friends.loadSharedInbox()`，产生竞态：inbox 数据还没来，就已经试图展示 `shared-section`。

**修复**:
```
openShareInbox() 应该先 await loadSharedInbox()，确保数据加载后再显示
```

---

### UC-07 接收方点击模块内的分享提示横幅

**前提**: B 在英语页面，顶部有 "📬 你收到 1 条好友分享的学习笔记" 横幅

**主路径**:
1. B 点击横幅
2. `Friends.openShareInbox()` 被调用（同 UC-06 路径）

**当前状态**: ⚠️ 同 UC-06 的问题，且移动端体验差

---

### UC-08 接收方点击 [收下] 接受 scenario 分享

**前提**: B 在收件箱，看到一条英语场景分享

**主路径**:
1. B 点击 [收下]
2. `Friends.acceptShared(id)` → `API.acceptShared(id)`
3. 后端：从 `item_snapshot` 重建数据，INSERT 到 `english_scenarios`
4. 返回 `{ success: true, new_id: 'xxx', item_type: 'scenario' }`
5. `navigateToAcceptedItem('scenario', 'xxx')` 被调用
6. `switchPage('english')` + 500ms 后 `English.openDetail(newId)`

**当前状态**: ✅ 基本正常
- 500ms 是否足够取决于网络速度，低速网络下可能失败（openDetail 时数据未返回）

**改进**: 应传入 pendingId，让 English 模块在数据 ready 后自动打开

---

### UC-09 接收方点击 [收下] 接受 review 分享

**主路径**:
1. B 点击 [收下]
2. 后端：INSERT 到 `reviews` 表，返回 `{ new_id, item_type: 'review' }`
3. `navigateToAcceptedItem('review', newId)`:
   ```js
   case 'review':
       if (typeof switchPage === 'function') switchPage('review');
       break;  // 没有后续动作
   ```
4. B 跳到例行审视页面，新条目在列表里，但**没有任何高亮/定位/打开**

**当前状态**: ⚠️ 功能性正常，体验差
- 用户不知道新收到的 review 在哪里，需要自己滚动找

**改进**: 收下后给 review 列表传入 highlightId，让新条目闪烁高亮

---

### UC-10 接收方点击 [收下] 接受 routine 分享

**主路径**:
1. B 点击 [收下]
2. 后端：INSERT 到 `routines` 表，返回 `{ new_id, item_type: 'routine' }`
3. `navigateToAcceptedItem('routine', newId)`:
   ```js
   case 'routine':
       if (typeof switchPage === 'function') switchPage('todo');
       break;  // 跳到 todo 页，routine 不在 todo 里！
   ```
4. B 跳到 Todo 页面，但 routine 在页面底部的例行区域，完全看不到

**当前状态**: ❌ 体验严重有问题
- 逻辑错误：routine 跳到 todo 页是对的（routine 在 todo 页渲染），
  但没有任何滚动定位或高亮

**修复**:
```js
case 'routine':
    if (typeof switchPage === 'function') switchPage('todo');
    setTimeout(function() {
        // 滚动到 routines 区域并高亮新条目
        var routineEl = document.querySelector('[data-routine-id="' + newId + '"]');
        if (routineEl) {
            routineEl.scrollIntoView({ behavior: 'smooth' });
            routineEl.classList.add('highlight-new');
        } else {
            showToast('日常例行已收下，在今日页面底部可见', 'info');
        }
    }, 500);
    break;
```

---

### UC-11 接收方点击 [收下] 接受 expense 分享

**主路径**:
1. B 点击 [收下]
2. 后端：INSERT 到 `expense_entries`，返回 `{ new_id, item_type: 'expense' }`
3. `navigateToAcceptedItem('expense', newId)`:
   ```js
   case 'expense':
       switchPage('life');
       setTimeout(function() {          // T+500ms
           Life.openFeature('expense');
           setTimeout(function() {      // T+1000ms
               Expense.openDetail(newId);
           }, 500);
       }, 500);
   ```
4. `Life.openFeature('expense')` 触发 expense 数据异步加载
5. T+1000ms 时 `Expense.openDetail(newId)` 被调用，但 expense 列表可能还未加载完

**当前状态**: ❌ 高概率无反应

**根因**: expense 数据加载是异步的，500ms 不保证够用

**修复**:
```js
case 'expense':
    if (typeof switchPage === 'function') switchPage('life');
    setTimeout(function() {
        if (typeof Life !== 'undefined') Life.openFeature('expense');
        // 不再用嵌套 setTimeout，而是让 Expense 记录 pendingOpenId
        if (typeof Expense !== 'undefined') Expense.setPendingOpen(newId);
    }, 300);
    break;
```
`Expense` 模块在数据加载完成后检查 `pendingOpenId`，自动打开。

---

### UC-12 接收方点击 [忽略]

**主路径**:
1. B 点击 [忽略]
2. `Friends.dismissShared(id)` → `API.dismissShared(id)`
3. 后端：UPDATE status=dismissed
4. 前端：从 `sharedItems` 移除，重新渲染

**当前状态**: ✅ 完全正常

---

### UC-13 发送方查看"已分享给谁"

**前提**: A 分享了一个场景，想知道对方有没有收下

**主路径**:
1. A 打开该场景详情
2. 期望看到"已分享给：张三 (已收下)"

**当前状态**: ❌ 功能缺失
- 后端有 `GET /api/share/sent` 接口 ✅
- `share-modal.js` 调用 `API.getSharedSent()` 做了去重检测 ✅
- 但场景详情页/列表页没有展示分享状态

---

### UC-14 收件箱内容预览

**当前状态**: ✅ 基本实现（`renderSharedInbox` 渲染 item_snapshot 内容）

**已知问题**: expense 类型预览逻辑能用，但 `routine` 的 snapshot 只有 `text` 字段，
预览内容太简单，无法判断是否值得收下。

---

### UC-15 非好友情况下分享

**主路径**:
- 后端校验好友关系，返回 403 "对方不是你的好友" ✅
- 前端 `shareItem` 失败，`showToast` 错误提示 ✅

**当前状态**: ✅ 正常

---

## 三、Bug 汇总表

| # | 场景 | 严重性 | 根因 | 状态 |
|---|------|--------|------|------|
| B-01 | App 启动时点铃铛 → 空白 | 🔴 严重 | `loadSharedInbox` 未在初始化时调用 | ❌ 未修 |
| B-02 | UC-02 Todo 无分享入口 | 🟡 中 | modal.js 未添加分享按钮 | ❌ 未修 |
| B-03 | UC-03 例行审视无分享入口 | 🟡 中 | review 页无分享按钮 | ❌ 未修 |
| B-04 | UC-08 低速网络 scenario 收下后无跳转 | 🟡 中 | 500ms timeout 不保证数据加载完成 | ❌ 未修 |
| B-05 | UC-09 收下 review 无 highlight | 🟢 低 | navigateToAcceptedItem review case 无操作 | ❌ 未修 |
| B-06 | UC-10 收下 routine → 错误跳转 | 🔴 严重 | navigateToAcceptedItem routine 无定位 | ❌ 未修 |
| B-07 | UC-11 收下 expense → 无反应 | 🔴 严重 | 双重 500ms timeout，Expense 数据未就绪 | ❌ 未修 |
| B-08 | routine/expense 无 share banner | 🟡 中 | bannerConfig 缺少这两个类型 | ❌ 未修 |
| B-09 | 发送时附言未传给后端 | 🟡 中 | `_doShare()` 未传 message 参数 | ❌ 未修 |
| B-10 | UC-13 发送方看不到分享状态 | 🟢 低 | 前端无展示逻辑 | ❌ 未修 |
| B-11 | 好友分享入口只在英语页 | 🟡 中 | todo/review 无分享入口 | ❌ 未修 |

---

## 四、一次性修复方案

### Phase A：核心体验修复（1-2小时）

**目标**: 让"收下分享后有响应"这个核心路径可靠工作

#### A-1：修复 App 启动时 loadSharedInbox 未调用

**文件**: `app.js` 或 `index.html` 底部脚本块

在初始化代码中（auth 检查通过后）添加：
```js
// 页面加载完成后主动拉一次 inbox
setTimeout(function() {
    if (typeof Friends !== 'undefined' && Friends.loadSharedInbox) {
        Friends.loadSharedInbox();
    }
}, 2000); // 与 updateInboxBadge 对齐，等 auth 完成
```

#### A-2：修复 openShareInbox 在数据未就绪时空白

**文件**: `friends.js` → `openShareInbox()`

```js
async function openShareInbox() {
    // 先加载数据，保证 sharedItems 有内容
    await loadSharedInbox();  // 加这一行

    var isMobile = window.innerWidth <= 768;
    // ...其余逻辑不变
}
```

#### A-3：修复 navigateToAcceptedItem

**文件**: `friends.js` → `navigateToAcceptedItem()`

```js
function navigateToAcceptedItem(itemType, newId) {
    document.body.classList.remove('page-inbox');
    if (typeof currentPage !== 'undefined') currentPage = '';

    switch (itemType) {
        case 'todo':
            if (typeof switchPage === 'function') switchPage('todo');
            setTimeout(function() {
                if (typeof openTaskDetail === 'function') openTaskDetail(newId);
            }, 500);
            break;
        case 'review':
            if (typeof switchPage === 'function') switchPage('review');
            setTimeout(function() {
                // 尝试高亮新条目
                var el = document.querySelector('[data-review-id="' + newId + '"]');
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('item-new-flash');
                } else {
                    showToast('例行事项已收下，在例行审视页面可见', 'info');
                }
            }, 600);
            break;
        case 'routine':
            if (typeof switchPage === 'function') switchPage('todo');
            setTimeout(function() {
                if (typeof loadRoutines === 'function') loadRoutines();
                setTimeout(function() {
                    var el = document.querySelector('[data-routine-id="' + newId + '"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('item-new-flash');
                    } else {
                        showToast('日常例行已收下，在今日页面下方可见', 'info');
                    }
                }, 300);
            }, 400);
            break;
        case 'scenario':
            if (typeof switchPage === 'function') switchPage('english');
            setTimeout(function() {
                if (typeof English !== 'undefined') English.openDetail(newId);
            }, 600);
            break;
        case 'expense':
            if (typeof switchPage === 'function') switchPage('life');
            setTimeout(function() {
                if (typeof Life !== 'undefined') Life.openFeature('expense');
                // 设置 pending open id，让 Expense 在数据加载后自动打开
                if (typeof Expense !== 'undefined') {
                    Expense.pendingOpenId = newId;
                }
            }, 400);
            break;
    }
}
```

> **注**: `item-new-flash` 需要在 CSS 中添加一个闪烁动画。
> Expense 模块需要在数据加载完成后检查 `Expense.pendingOpenId` 并打开详情。

#### A-4：修复 share-modal.js 附言未传递

**文件**: `share-modal.js` → `_doShare()`

```js
async function _doShare(friendId) {
    try {
        // 读取附言（如果有输入框的话）
        var msgInput = document.getElementById('share-message-input');
        var message = msgInput ? msgInput.value.trim() : '';
        var resp = await API.shareItem(friendId, _shareContext.itemType, _shareContext.itemId, message || undefined);
        // ...
    }
}
```

#### A-5：补全 bannerConfig

**文件**: `friends.js`

```js
var bannerConfig = {
    scenario: { elementId: 'english-share-banner', label: '学习笔记' },
    todo:     { elementId: 'todo-share-banner',    label: '待办事项' },
    review:   { elementId: 'review-share-banner',  label: '例行审视' },
    routine:  { elementId: 'todo-share-banner',    label: '日常例行' },  // 与 todo 共用容器
    expense:  { elementId: 'life-share-banner',    label: '账单记录' },  // 需在 life 页添加容器
};
```

---

### Phase B：新增分享入口（1-2小时）

**目标**: Todo / Review 也能发起分享

#### B-1：任务详情弹窗添加分享按钮

**文件**: `modal.js` 或 `index.html` 中任务详情弹窗 HTML

在弹窗底部 action bar 添加：
```html
<button class="modal-share-btn" onclick="Friends.openShareModal('todo', currentDetailId)" title="分享给好友">
    📤 分享
</button>
```

需要在 `modal.js` 中确保 `currentDetailId` 可访问。

#### B-2：例行审视添加分享按钮

**文件**: `review.js` 审视项渲染函数

在每个审视项展开内容中添加：
```html
<button onclick="Friends.openShareModal('review', '${item.id}')">📤 分享</button>
```

---

### Phase C：Expense 模块 pendingOpenId 支持（30分钟）

**文件**: `expense.js` (或 `life.js`)

在 `loadExpenses()` 或数据加载回调结束后：
```js
// 在数据渲染完成后
if (Expense.pendingOpenId) {
    var id = Expense.pendingOpenId;
    Expense.pendingOpenId = null;
    Expense.openDetail(id);
}
```

---

### Phase D：CSS 新增 item-new-flash

**文件**: `style.css`

```css
@keyframes newItemFlash {
    0%   { background: rgba(99, 179, 237, 0.35); }
    50%  { background: rgba(99, 179, 237, 0.15); }
    100% { background: transparent; }
}
.item-new-flash {
    animation: newItemFlash 1.5s ease-out 2;
}
```

---

## 五、测试 Checklist

### 发送方

- [ ] 英语页面：场景详情有 📤 按钮
- [ ] 任务详情弹窗有 📤 按钮（Phase B）
- [ ] 例行审视有 📤 按钮（Phase B）
- [ ] 好友选择器弹出，已分享的好友显示 ✓
- [ ] 分享成功，toast 显示
- [ ] 附言被正确传递到后端

### 接收方（移动端）

- [ ] App 启动 3s 内，有分享时 badge 显示数字
- [ ] 点击 badge → 收件箱有内容（不空白）
- [ ] 收件箱显示发送方名字 + 内容预览
- [ ] 点击 [收下] → todo：跳到 todo，detail 弹窗打开
- [ ] 点击 [收下] → scenario：跳到英语，detail 打开
- [ ] 点击 [收下] → review：跳到审视页，新条目高亮
- [ ] 点击 [收下] → routine：跳到 todo，例行区域有新条目
- [ ] 点击 [收下] → expense：跳到 life/expense，detail 打开
- [ ] 点击 [忽略] → 消失，badge 数字减少

### 接收方（桌面端）

- [ ] 切换到英语页 → 顶部出现 share banner（如有 scenario 分享）
- [ ] 切换到 todo 页 → 顶部出现 share banner（如有 todo 分享）
- [ ] 点击 banner → 侧边栏展开，显示收件箱内容
- [ ] 同移动端收下/忽略操作

### 边界情况

- [ ] 非好友分享 → 403 提示"对方不是你的好友"
- [ ] 分享不存在的 item → 404 提示
- [ ] 收下已 accepted 的分享 → 后端校验拦截
- [ ] 低速网络下收下 scenario → detail 仍能打开（不需 500ms 完成）
