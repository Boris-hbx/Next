# SPEC-040: 提醒与推送通知
> 起草日期: 2026-02-21
> 状态: 草稿

## 概述

跟阿宝说"3点提醒我开会"，阿宝创建定时提醒，到点通过 Web Push 推送到手机、应用内弹窗提醒。

三大能力：
1. **提醒系统** — 阿宝解析自然语言时间，创建定时提醒，后台轮询触发
2. **Web Push 推送** — 浏览器/PWA 推送通知，App 未打开也能收到；Android 系统自动根据未读通知显示桌面角标
3. **应用内通知** — 通知铃铛 + 顶部横幅弹窗 + Todo 卡片提醒标识

## 架构

```
用户: "3点提醒我开会"
    │
    ▼
阿宝 (Claude) 解析自然语言时间
    │
    ▼
create_reminder 工具 → INSERT reminders 表
    │
    ▼
阿宝回复确认卡片（内容 + 绝对时间 + 取消按钮）
    │
    ▼
后台轮询器 (tokio::spawn, 每30秒)
    │
    ▼
发现到期提醒 (remind_at <= now AND status = 'pending')
    │
    ▼
lock → SELECT + UPDATE triggered + INSERT notification → unlock → 异步推送
    │
    ├──→ [1] Web Push 通知 (VAPID, App 关闭也能收到, Android 自动角标)
    └──→ [2] 应用内通知 (顶部横幅弹窗 + 铃铛 + Todo 高亮)
    │
    ▼
提醒状态: pending → triggered → acknowledged
                              └→ snooze → 新 pending 提醒
```

### 前提条件

> **`min_machines_running = 1` 是必要改动，不是可选优化。** 没有它服务器会在无流量时休眠，提醒无法触发。约 $1.94/月。

## 数据库

### reminders 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID (8字符) |
| user_id | TEXT FK | 用户 |
| text | TEXT | 提醒内容，如"开会" |
| remind_at | TEXT | ISO 8601 **带时区偏移**，如 `2026-02-21T15:00:00+08:00` |
| status | TEXT | pending / triggered / acknowledged / cancelled |
| related_todo_id | TEXT | 可选，关联的任务 ID |
| repeat | TEXT | NULL / daily / weekly / monthly |
| created_at | TEXT | 创建时间（UTC） |
| triggered_at | TEXT | 实际触发时间（UTC） |
| acknowledged_at | TEXT | 用户确认时间（UTC） |

索引：`(user_id, status, remind_at)`, `(status, remind_at)`

> **时区规范**：`remind_at` 必须带时区偏移（+08:00），轮询器比较时统一转 UTC。其他时间戳存 UTC。系统提示词中明确要求 Claude 生成带时区的 ISO 8601。

### push_subscriptions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | 用户 |
| endpoint | TEXT | Push 服务端点 URL |
| p256dh | TEXT | 客户端公钥 (base64url) |
| auth | TEXT | 认证密钥 (base64url) |
| user_agent | TEXT | 浏览器/设备标识 |
| created_at | TEXT | 创建时间 |

UNIQUE 约束：`(user_id, endpoint)`

> 安全：不提供 GET 列出订阅的接口，防止密钥信息泄露。DELETE 通过 user_id 过滤防止越权。

### notifications 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | 用户 |
| type | TEXT | reminder / system |
| title | TEXT | 标题 |
| body | TEXT | 正文 |
| reminder_id | TEXT | 关联 reminder（可空） |
| todo_id | TEXT | 关联 todo（可空） |
| read | INTEGER | 0=未读 / 1=已读 |
| created_at | TEXT | 创建时间 |

索引：`(user_id, read, created_at DESC)`

> 拆分为 `reminder_id` 和 `todo_id` 两个字段，引用目标明确。

### user_settings 表

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT PK | 用户 |
| push_enabled | INTEGER | 是否开启推送，默认 1 |
| wxpusher_uid | TEXT | 预留：WxPusher UID |
| quiet_hours_start | TEXT | 预留：安静时段开始（如"23:00"） |
| quiet_hours_end | TEXT | 预留：安静时段结束（如"07:00"） |
| updated_at | TEXT | 更新时间 |

## API 端点

### 提醒

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reminders` | 列出提醒（支持 ?status= 筛选） |
| POST | `/api/reminders` | 创建提醒 |
| PUT | `/api/reminders/:id` | 修改提醒 |
| DELETE | `/api/reminders/:id` | 取消提醒 |
| POST | `/api/reminders/:id/acknowledge` | 确认提醒（同时标记关联 notification 已读） |
| POST | `/api/reminders/:id/snooze` | 稍后提醒（默认5分钟，支持 ?minutes= 参数） |
| GET | `/api/reminders/pending-count` | 未确认提醒数 |

> **acknowledge 端点同时处理**：更新 reminder status → acknowledged，标记关联 notification read=1。一次调用搞定，前端不需要分别调两个 API。

### 推送订阅

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/push/vapid-public-key` | 获取 VAPID 公钥 |
| POST | `/api/push/subscribe` | 保存推送订阅 |
| DELETE | `/api/push/subscribe` | 删除推送订阅 |

### 应用内通知

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications/unread` | 未读通知列表 + 数量 |
| POST | `/api/notifications/:id/read` | 标记已读 |
| POST | `/api/notifications/read-all` | 全部已读（同时 acknowledge 所有 triggered 提醒） |

## 阿宝 Tool

### create_reminder
创建定时提醒。用户说"X点提醒我Y"时调用。

参数：
- `text` (必填) — 提醒内容
- `remind_at` (必填) — ISO 8601 **带时区偏移**，如 `2026-02-21T15:00:00+08:00`
- `related_todo_id` (可选) — 关联任务 ID
- `repeat` (可选) — daily / weekly / monthly

### query_reminders
查询提醒列表。

参数：
- `status` (可选) — pending / triggered / all，默认 pending

### cancel_reminder
取消提醒。

参数：
- `id` (必填) — 提醒 ID

### snooze_reminder
推迟提醒。

参数：
- `id` (必填) — 提醒 ID
- `minutes` (可选) — 推迟分钟数，默认 5

### 系统提示词新增规则

```
## 提醒相关
- 用户说"提醒我/X点提醒/到时候叫我" → 调用 create_reminder
- 用户问"有哪些提醒/我的提醒" → 调用 query_reminders
- 用户说"取消提醒/不用提醒了" → 调用 cancel_reminder
- 用户说"推迟/晚点再提醒/过会儿再说" → 调用 snooze_reminder

## 提醒时间解析
- "3点" → 今天15:00；如果已过30分钟以内，明确告知并询问"现在提醒还是设到明天？"；如果过了很久，默认明天同一时间并告知
- "明天上午10点" → 明天10:00
- "半小时后" → 当前时间 + 30分钟
- "下周一9点" → 下周一09:00
- 解析前先调 get_current_datetime 确认当前时间
- remind_at 必须生成带时区偏移的 ISO 8601 格式，如 "2026-02-21T15:00:00+08:00"
- 创建成功后，回复中必须说出绝对时间，如"好，今天下午3:00提醒你开会"

## "提醒"与"任务"的区分
- "提醒我/X点提醒/到时候叫我" → 只创建 reminder
- "记一下/加个任务" → 只创建 todo
- 如果用户说"3点开会，提醒我"，先查是否已有"开会"任务。有则关联；没有则只创建 reminder，不主动创建任务
- 不要反问"需要创建提醒吗？"——执行优先
```

### 上下文注入

在 `build_task_context()` 中新增：

```
## 待触发提醒 (N个)
- 15:00 开会 (ID:abc123, 关联任务:开周会)
- 明天 09:00 交报告 (ID:def456)
```

查询：`SELECT id, text, remind_at, related_todo_id FROM reminders WHERE user_id=? AND status='pending' ORDER BY remind_at LIMIT 10`

## 前端

### 阿宝对话中的提醒确认卡片

创建提醒成功后，在对话中展示确认卡片（类似现有 task card）：
- 提醒内容（"开会"）
- 触发时间（"今天 15:00"，相对时间表述）
- 关联任务（如果有）
- 「取消提醒」按钮（一键取消，不需要再对话）

> 扩展现有 `abao.js` 的 `addToolInfo()` 函数，新增 `create_reminder` 类型的卡片渲染。

### 首次推送引导

**不靠设置页引导，靠阿宝对话中自然引导：**

首次创建提醒时，检查 `Notification.permission`：
- `'default'`（从未问过）→ 阿宝回复末尾加："要开启通知吗？App 关着也能收到提醒。" + 一键「开启通知」按钮
- `'denied'`（已拒绝）→ 阿宝说："通知权限被关了，只能在 App 打开时提醒你。要改的话去浏览器设置。"
- `'granted'`（已授权）→ 静默注册 push subscription，不打扰

### Service Worker (sw.js)
- `push` 事件监听 → 显示系统通知
- `notificationclick` 处理 → 打开应用 + 导航到关联任务详情（若有）
- 通知操作按钮：「知道了」（acknowledge）、「5分钟后」（snooze）

### 通知文案格式

```
标题: "开会"            ← 提醒内容本身，不加"Next提醒"前缀（Android 已显示 App 名）
正文: "15:00 · 你让我提醒你的"   ← 阿宝口吻
图标: /assets/icons/icon-192.png
操作: [知道了] [5分钟后]
```

### 通知铃铛 UI (index.html)
- 头部栏新增铃铛图标 + 未读数角标
- 点击展开通知面板，分两个区域：
  - **未读通知**（已触发未确认的提醒）
  - **即将到来**（pending 提醒，按时间排序）
- 每条通知右侧有「确认」勾号按钮，一键确认
- 「全部已读」按钮（同时 acknowledge 所有 triggered 提醒）

### 应用内提醒弹窗

> **不用 toast。** Toast 会自动消失，提醒必须由用户主动操作。

设计为**顶部横幅弹窗**：
- 从屏幕顶部滑入
- 不自动消失，必须用户操作
- 显示提醒内容 + 时间
- 三个按钮：「知道了」、「5分钟后」、「打开任务」（若关联了任务）
- 多条提醒同时触发时，不逐个弹窗 —— 如果 > 3 条，只显示铃铛角标 + 一条横幅 "你有 N 条提醒未处理"

### notifications.js (新文件)
- Push 订阅注册（`PushManager.subscribe` + VAPID 公钥）
- 通知轮询：
  - Push 已注册 → 轮询间隔 120 秒（作为 fallback）
  - Push 未注册 → 轮询间隔 30 秒（主通道）
  - 收到 Push 后重置轮询计时器，避免紧跟着又发一次无谓轮询
- 角标管理：`if ('setAppBadge' in navigator) { ... }`（桌面端生效，Android 由系统自动管理）
- 去重：SW push 到达后调 acknowledge API，前端轮询只显示 `read=0` 的通知

### Todo 卡片提醒标识
- 关联了 pending 提醒的任务卡片显示 "🔔15:00"（主题色文字，与截止日期区分）
- 提醒触发后未确认：左边框变橙色（静态色条，不用脉冲动画）
- 已确认：标识移除
- 渲染逻辑：`GET /api/todos` 返回数据中通过 SQL JOIN 附带 `next_reminder` 字段（最近一条 pending 提醒的 remind_at 和 id），不额外请求

### 从任务详情创建提醒
- 任务详情弹窗中增加「设置提醒」入口
- 点击后弹出时间选择，创建关联该任务的 reminder

### PWA 桌面角标

Android 行为：系统根据未读推送通知数自动显示角标，不需要代码控制。

桌面浏览器：`navigator.setAppBadge(count)` / `navigator.clearAppBadge()`，加 feature detection。

### 设置页
- 通知开关（开启/关闭推送）
- 推送状态显示（已开启/未开启/被浏览器拒绝）

## 后端新文件

| 文件 | 职责 |
|------|------|
| `server/src/models/reminder.rs` | Reminder 数据结构 |
| `server/src/routes/reminders.rs` | 提醒 CRUD + acknowledge + snooze |
| `server/src/routes/push.rs` | 推送订阅管理 |
| `server/src/routes/notifications.rs` | 应用内通知端点 |
| `server/src/services/reminder_poller.rs` | 后台轮询器 |
| `server/src/services/push.rs` | Web Push 发送 |

## 修改的现有文件

| 文件 | 改动 |
|------|------|
| `server/src/db.rs` | 新增 4 张表 CREATE TABLE |
| `server/src/main.rs` | 注册新路由 + spawn reminder_poller |
| `server/src/services/tool_executor.rs` | 新增 4 个工具（create/query/cancel/snooze_reminder） |
| `server/src/services/context.rs` | 系统提示词 + 上下文注入提醒列表 |
| `server/Cargo.toml` | 新增 `web-push`（见依赖说明） |
| `fly.toml` | `min_machines_running = 1` + `TZ = "Asia/Shanghai"` |
| `Dockerfile` | runtime stage 安装 `tzdata` |
| `frontend/sw.js` | push 事件、notificationclick（含 snooze）、角标 |
| `frontend/index.html` | 通知铃铛 UI + 顶部横幅弹窗 + 引入 notifications.js |
| `frontend/assets/js/abao.js` | 提醒确认卡片 + 首次推送引导 |
| `frontend/assets/js/api.js` | 提醒/通知/推送 API 方法 |
| `frontend/assets/js/settings.js` | 通知设置区 |
| `frontend/assets/js/app.js` | 初始化通知模块 |
| `frontend/assets/manifest.json` | 添加 `"id": "/"` |
| `frontend/assets/js/tasks.js` | Todo 卡片渲染提醒标识 |
| `server/src/routes/todos.rs` | GET /api/todos JOIN 附带 next_reminder 字段 |

## 部署配置

### fly.toml 改动
```toml
[env]
  TZ = "Asia/Shanghai"      # 新增：确保时区为北京时间

[http_service]
  min_machines_running = 1   # 必要改动：服务器常驻，保证轮询器运行（~$1.94/月）
```

### Dockerfile 改动
```dockerfile
# runtime stage 安装 tzdata，否则 TZ 环境变量不生效
RUN apt-get update && apt-get install -y ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
```

### Fly.io Secrets（一次性设置）
```bash
# 生成 VAPID 密钥
openssl ecparam -genkey -name prime256v1 -noout -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -out vapid_public.pem

# 设置 secrets
flyctl secrets set VAPID_PRIVATE_KEY="$(cat vapid_private.pem)"
flyctl secrets set VAPID_PUBLIC_KEY="<base64url 公钥>"
flyctl secrets set VAPID_SUBJECT="mailto:boris@huai.dev"
```

## 依赖说明

### web-push crate 配置

> **不用默认配置。** 默认会拉入 `isahc`（libcurl），与已有的 `reqwest` 冲突，增加 Docker 依赖和内存开销。

推荐方案：只用 `web-push` 的加密和 VAPID 签名功能，用已有的 `reqwest` 发送 HTTP 请求：

```toml
web-push = { version = "0.11", default-features = false }
```

如果不可行，退而求其次用 hyper-client feature：
```toml
web-push = { version = "0.11", default-features = false, features = ["hyper-client"] }
```

## 轮询器实现规范

```
每30秒循环:
  1. lock DB
  2. SELECT * FROM reminders WHERE status='pending' AND remind_at <= now
  3. UPDATE status='triggered', triggered_at=now WHERE id IN (到期IDs) AND status='pending'
     ↑ WHERE status='pending' 条件防止并发重复触发
  4. INSERT INTO notifications (对应每个 triggered reminder)
  5. unlock DB
  6. 对每个 triggered reminder 异步发 Web Push（用 reqwest，不持锁）
     - 成功：done
     - 410 Gone：删除该 push subscription
     - 网络错误/5xx：重试 1 次，间隔 2 秒
     - 429：遵循 Retry-After
     - 其他 4xx：记录日志，不重试
  7. 推送失败不阻塞后续提醒的触发
```

### Snooze 实现
snooze 操作 = 原 reminder 标记 acknowledged + 创建新 reminder（`remind_at = now + N分钟`）。保留历史记录。

### 重复提醒（Phase 4）
acknowledge 一个 repeat reminder 后，创建新的 pending reminder 记录（remind_at 按频率推算），不复用原记录。保留完整触发历史。

### 服务器重启恢复
重启后轮询器首轮自动补触发所有漏掉的 pending 提醒。对延迟超过 1 小时的提醒，通知正文标注"（延迟了 X 分钟）"。

## 实施阶段

### Phase 1: 数据库 + 提醒 CRUD + 阿宝工具
- 4 张表建表
- reminders CRUD + acknowledge + snooze 路由
- tool_executor 新增 4 个工具
- context.rs 更新提示词 + 上下文注入
- abao.js 提醒确认卡片
- **验证**: 跟阿宝说"3点提醒我开会"→ 对话中出现确认卡片 → 能取消

### Phase 2: 后台轮询器 + 应用内通知
- Dockerfile 安装 tzdata
- fly.toml 改为常驻 + 时区
- reminder_poller 后台任务
- notifications 路由
- 通知铃铛 UI + 通知面板（未读 + 即将到来）
- 顶部横幅弹窗（非 toast）
- notifications.js 轮询逻辑（含分级策略）
- Todo 卡片提醒标识 + todos API JOIN
- **验证**: 创建 1 分钟后的提醒 → 到点后顶部横幅弹出 + 铃铛显示 + Todo 卡片左边框橙色

### Phase 3: Web Push 推送
- VAPID 密钥生成和配置
- web-push crate 集成（不用 isahc）
- push 订阅管理路由
- sw.js push + notificationclick（含 snooze）
- 首次创建提醒时的推送权限引导（在阿宝对话中）
- 设置页推送状态显示
- 推送失败重试策略
- **验证**: 手机添加 PWA 到桌面 → 创建提醒 → 关闭 App → 到点收到系统通知（含"知道了"和"5分钟后"按钮）→ 桌面图标自动显示角标

### Phase 4: 完善
- 重复提醒（daily/weekly/monthly）
- 从任务详情创建提醒
- 过期提醒清理（acknowledged 超 30 天自动删除）
- 边界情况（大量堆积聚合展示、延迟补发标注）

## 预留扩展

以下功能本期不做，但数据库和架构已预留接口：
- **微信推送 (WxPusher)** — `user_settings.wxpusher_uid` 已预留
- **日历对接 (Google Calendar)** — 可作为 Phase 5
- **iOS 支持** — 架构兼容，需用户"添加到主屏幕" + iOS 16.4+
- **安静时段** — `user_settings.quiet_hours_*` 已预留

## 技术要点

1. **时区统一**: `remind_at` 存带时区偏移的 ISO 8601；其他时间戳存 UTC；Dockerfile 安装 `tzdata`；`TZ=Asia/Shanghai` 确保 `chrono::Local::now()` 正确
2. **SQLite 锁规范**: 轮询器在一次 lock 内完成所有 DB 操作（查询+更新+插入），unlock 后再做 async 推送
3. **VAPID**: P-256 椭圆曲线密钥对，存为 Fly.io secrets
4. **Android 角标**: 系统自动管理，不需要 `setAppBadge`；桌面端用 `setAppBadge` + feature detection
5. **推送订阅失效**: 410 Gone → 删除订阅；5xx → 重试 1 次
6. **双通道去重**: Push 到达后 SW 调 acknowledge API，前端轮询只显示 read=0 的通知
7. **CSP 兼容**: Push Subscription 的 `subscribe()` 是浏览器 API 不受 CSP 限制；SW 内 fetch 同源 API 被 `connect-src 'self'` 覆盖。Phase 3 需实际测试确认
