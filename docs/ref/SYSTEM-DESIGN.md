# 系统设计文档

> Next — Focus on the Right Thing
> 最后更新: 2026-02-21

---

## 一、产品定位

Next 是一个以"看清下一步"为核心理念的任务管理应用。

市面上不缺任务管理工具。Todoist、Notion、Things 都很好。但我们发现，大多数工具解决的是"把事情记下来"，而不是"帮你决定先做哪件"。

Next 的答案是**两个维度的交叉**：

```
重要性（纵轴: 艾森豪威尔矩阵）  ×  时间紧迫度（横轴: 今天/本周/30天）
```

用户不需要学习 GTD，不需要研究优先级公式。打开 App，任务自然地落在四个象限里，一眼就知道该先做什么。

**AI 不是噱头，是搭档。** 内置的 AI 助手「阿宝」不做鸡汤式的激励，而是像一个靠谱的工作搭档：帮你建任务、整理优先级、到点提醒你、在你打开 App 时说一句"有两件急的，先看看？"。

---

## 二、核心概念模型

### 2.1 任务的两个维度

```
                  重要
                   │
    ┌──────────────┼──────────────┐
    │  优先处理     │  就等你翻牌子了 │
    │  (紧急+重要)  │  (重要不紧急)  │
    │              │              │
────┼──────────────┼──────────────┼── 紧急
    │              │              │
    │  短平快       │  待分类       │
    │  (紧急不重要)  │  (都不急)     │
    └──────────────┼──────────────┘
                   │
```

- **竖轴**：艾森豪威尔四象限 — 区分"重要紧急"
- **横轴**：时间 Tab — 今天 / 本周 / 30 天
- **交叉**：每个 Tab 下都有四象限，用户可以拖拽任务在象限间、Tab 间移动

### 2.2 五层功能结构

| 层 | 功能 | 说明 |
|----|------|------|
| **核心** | 任务管理 | 四象限 × 三时间段，CRUD + 拖拽排序 |
| **节奏** | 例行任务 + 例行审视 | 每日习惯打卡 + 定期反思检查 |
| **智能** | 阿宝 AI 助手 | 自然语言创建/管理任务，上下文感知 |
| **协作** | 好友 + 联系人 + 协作 | 任务共享、协作确认、联系人管理 |
| **提醒** | 提醒 + 推送通知 | 定时提醒、Web Push、应用内通知 |

### 2.3 阿宝 — AI 搭档

阿宝不是一个通用聊天机器人。他有明确的人设和行为约束：

**性格**：实在、沉稳、冷幽默、记性好、知道闭嘴。

**行为准则**：
- 执行优先：用户说"加个任务"，立刻调 tool，不反问确认
- 用数据说话，不做鸡汤式激励
- 一次只推一步，不列一堆建议
- 允许用户不高效 — 他今天不想干活，说"那就歇着"

**绝不做的事**：
- 不说"加油！你可以的！"
- 不做效率说教
- 不擅自改用户的优先级
- 不假装有感情

### 2.4 此刻（Moment）— 顶栏一句话

App 顶栏不是空白的 logo 区。阿宝会看你的任务状态，生成一句像老朋友随口说的话：

- "有两件急的" — 有紧急任务时
- "都清了，歇会儿" — 全做完时
- "夜深了，明天说" — 深夜时
- "早，今天3件事" — 早晨时

**不是模板拼接，是 AI 真的在看你的任务然后说一句话。** 通过 15 分钟缓存控制成本。

---

## 三、系统架构

### 3.1 总体拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                      用户设备 (手机/桌面)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  PWA Shell   │  │ Service Worker│  │ localStorage Cache │ │
│  │  (Vanilla JS)│  │ (离线缓存)    │  │ (主题/头像/折叠)   │ │
│  └──────┬──────┘  └──────────────┘  └─────────────────────┘ │
└─────────┼───────────────────────────────────────────────────┘
          │ HTTPS (Fly.io force_https)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Fly.io (东京 nrt)                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Axum 0.8 (单进程)                          │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────┐       │ │
│  │  │ ServeDir  │  │   API Router  │  │ 安全中间件   │       │ │
│  │  │ (静态文件) │  │  (/api/*)    │  │ CSP/HSTS    │       │ │
│  │  └──────────┘  └──────┬───────┘  └─────────────┘       │ │
│  │                       │                                 │ │
│  │  ┌────────────────────┼────────────────────────┐        │ │
│  │  │                Route Handlers                │        │ │
│  │  │  Auth│Todos│Routines│Reviews│Chat│English    │        │ │
│  │  │  Friends│Reminders│Push│Notifications│...    │        │ │
│  │  └────────────────────┼────────────────────────┘        │ │
│  │                       │                                 │ │
│  │  ┌────────────────────┼────────────────────────┐        │ │
│  │  │              Services Layer                  │        │ │
│  │  │  ClaudeClient│Context│ToolExecutor│Push      │        │ │
│  │  │  Collaboration│ReminderPoller               │        │ │
│  │  └────────────────────┼────────────────────────┘        │ │
│  │                       │                                 │ │
│  │            ┌──────────▼──────────┐                      │ │
│  │            │  SQLite (WAL mode)  │                      │ │
│  │            │  Arc<Mutex<Conn>>   │                      │ │
│  │            └─────────────────────┘                      │ │
│  │                                                         │ │
│  │  ┌──────────────┐  ┌──────────────────┐                 │ │
│  │  │ 定时备份 (1h)  │  │ 提醒轮询器 (30s)  │                 │ │
│  │  └──────────────┘  └──────────────────┘                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────┐                                           │
│  │ Volume: /data│ ← SQLite 持久化 + 每日备份                 │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
          │
          │ HTTPS
          ▼
┌─────────────────┐
│  Anthropic API   │ ← 阿宝聊天 + 此刻文案 + 英语场景生成
│  (Claude Sonnet) │
└─────────────────┘
```

### 3.2 单进程哲学

Next 刻意选择了**单进程、单连接、单数据库**的架构：

- **一个 Rust 二进制** 同时提供 API 和静态文件服务
- **一个 SQLite 文件** 存储全部数据
- **一个 Mutex** 保护数据库连接
- **一个 Docker 容器** 部署在 Fly.io

这不是技术债，是有意为之：

| 选择 | 常规方案 | 我们的方案 | 为什么 |
|------|---------|----------|-------|
| 数据库 | PostgreSQL + 连接池 | SQLite + 单连接 | 用户量小，WAL 读写分离够用，运维零成本 |
| 前端框架 | React/Vue + 构建工具 | Vanilla JS + 直接引入 | 无构建步骤，改完直接部署，调试直接看源码 |
| API 框架 | Express.js / FastAPI | Axum 0.8 (Rust) | 编译后 10MB 二进制，内存占用 <50MB，冷启动 <1s |
| 部署 | K8s / Docker Compose | 单容器 + Volume | `fly deploy` 一行命令，完事 |
| 认证 | JWT + Refresh Token | Cookie Session | 服务端可控、可撤销、HttpOnly 防 XSS |
| 实时通信 | WebSocket | 轮询 (30s) | 复杂度低，提醒场景够用 |

**关键洞察**：对于 1-10 个用户的个人/小团队工具，过度工程化的代价远大于收益。SQLite 单写者在 WAL 模式下足以支撑每秒数百个请求。

---

## 四、数据流设计

### 4.1 任务生命周期

```
创建 ─→ 待分类象限 ─→ 用户拖拽分类 ─→ 执行中 ─→ 完成
 │                                        │
 │  (阿宝可以直接创建到指定象限/Tab)         │
 │                                        │
 └──── 软删除 ←── 恢复 ←───────────────────┘
        │
        └──── 永久删除
```

**智能 Tab 计算**：阿宝通过对话创建任务时，如果指定了截止日期，系统自动计算 Tab：
- 截止日期 = 今天 → `today`
- 截止日期 = 本周（周一至周日）→ `week`
- 其他 → `month`

### 4.2 AI 对话流

```
用户消息
  │
  ▼
POST /api/chat
  │
  ├─ 1. 查找/创建 conversation
  ├─ 2. 加载历史消息
  ├─ 3. build_system_prompt() ← 注入任务概况 + 人设 + 规则
  ├─ 4. Claude API 调用 (claude-sonnet-4-5)
  │     │
  │     ├─ stop_reason = "end_turn" → 返回文本
  │     └─ stop_reason = "tool_use" → execute_tool() → 继续循环
  │           │                          (最多 5 轮)
  │           ├─ create_todo → INSERT INTO todos
  │           ├─ update_todo → UPDATE todos SET ...
  │           ├─ query_todos → SELECT ... → 返回结果给 Claude
  │           ├─ create_reminder → INSERT INTO reminders
  │           ├─ create_english_scenario → INSERT INTO english_scenarios
  │           └─ ... (16 个 tools)
  │
  ├─ 5. 保存消息 + 使用量日志
  └─ 6. 返回 { reply, tool_calls, usage }
```

### 4.3 此刻（Moment）数据流

```
页面加载 / 15分钟定时 / 切回前台
  │
  ▼
GET /api/moment
  │
  ├─ 检查内存缓存 (HashMap<user_id, (text, timestamp)>)
  │   │
  │   ├─ 命中 (15分钟内) → 直接返回 { text, cached: true }
  │   │
  │   └─ 未命中 ↓
  │
  ├─ build_moment_context()
  │   ├─ 查 display_name
  │   ├─ 查今日任务总数/已完成
  │   ├─ 查紧急任务数
  │   ├─ 查逾期任务数
  │   └─ 查最近截止任务
  │
  ├─ simple_generate() → Claude (max 60 tokens, 10s timeout)
  │   └─ Prompt: "最多10个汉字，像老朋友说的一句话"
  │
  ├─ truncate_moment() → 硬截断保护 (>12字符截到10)
  │
  ├─ 失败兜底 → fallback_greeting() → "上午好"/"晚上好"
  │
  └─ 写入缓存 → 返回 { text, cached: false }
```

### 4.4 提醒 & 通知管道

```
创建提醒 (阿宝对话 / API)
  │
  ▼
reminders 表 (status: pending, remind_at: ISO 8601+08:00)
  │
  │ ← ReminderPoller (每30秒轮询)
  │    SELECT * FROM reminders WHERE status='pending' AND remind_at <= NOW
  │
  ▼
触发:
  ├─ 1. 更新状态 → status: triggered
  ├─ 2. 创建 in-app 通知 → notifications 表
  └─ 3. Web Push 推送 → push_subscriptions 表
       │
       ├─ VAPID 签名 (P-256 ECDSA)
       ├─ 内容加密 (AES-128-GCM + ECDH)
       └─ POST to push endpoint
            │
            ▼
       Service Worker: push event
            │
            ├─ showNotification("提醒", { actions: ["知道了", "5分钟后"] })
            └─ setAppBadge()
                 │
                 ▼
            用户点击:
            ├─ "知道了" → acknowledge → clearBadge
            └─ "5分钟后" → snooze → remind_at += 5min
```

### 4.5 协作确认流

```
用户A 完成任务 (is_collaborative = true)
  │
  ▼
不立即标记完成 → 创建 pending_confirmation
  │
  ▼
用户B 看到确认请求 (收件箱)
  │
  ├─ "确认完成" → confirmation_response → 标记任务完成
  └─ "未完成" → confirmation_response → 任务保持未完成
```

---

## 五、AI 集成架构

### 5.1 Claude API 客户端

两种调用模式：

| 模式 | 方法 | 场景 | Token 限制 | Timeout |
|------|------|------|-----------|---------|
| **对话式** | `chat()` | 阿宝聊天 | 2048 output | 30s |
| **单次式** | `simple_generate()` | 此刻文案 | 60 output | 10s |

**Tool Use 循环**（对话式）：
1. 发送消息 + tools 定义给 Claude
2. 如果返回 `tool_use` → 执行 tool → 结果作为 `tool_result` 追加到消息
3. 再次调用 Claude → 重复直到 `end_turn` 或达到 5 轮上限
4. 返回最终文本 + 所有 tool 调用记录

### 5.2 Tool 清单

| Tool | 功能 | 参数 |
|------|------|------|
| `create_todo` | 创建任务 | text, tab, quadrant, due_date, collaborator |
| `update_todo` | 更新任务 | id, text, progress, quadrant, completed |
| `delete_todo` | 软删除 | id |
| `restore_todo` | 恢复删除 | id |
| `query_todos` | 查询任务 | tab, quadrant, keyword, status |
| `batch_update_todos` | 批量更新 | updates[] |
| `create_routine` | 创建例行 | text |
| `create_review` | 创建审视 | text, frequency, category |
| `get_statistics` | 统计数据 | — |
| `get_current_datetime` | 当前时间 | — |
| `create_english_scenario` | 创建英语场景 | title, description |
| `query_english_scenarios` | 查询场景 | — |
| `create_reminder` | 创建提醒 | text, remind_at, related_todo_id |
| `query_reminders` | 查询提醒 | status |
| `cancel_reminder` | 取消提醒 | id |
| `snooze_reminder` | 延后提醒 | id, minutes |

### 5.3 上下文注入

每次对话，系统 prompt 会动态注入用户的任务概况：

```
## 用户任务概况
- 今天: 5 个任务（2 已完成）
- 本周: 8 个任务（3 已完成）

## 今日任务
- [ ] 写周报 (ID:abc123, 泳道:优先处理, 进度:30%, 截止:2026-02-21)
- [x] 回复邮件 (ID:def456, 泳道:短平快, 进度:100%)

## 即将到期（3天内）
- 提交报告 (截止:2026-02-22, ID:ghi789)

## 待触发提醒 (2个)
- 02月21日 15:00 开会 (ID:rem001)
```

这让阿宝真正"看到"你的任务状态，而不是无脑回答。

---

## 六、安全设计

### 6.1 认证

```
注册 → Argon2 哈希密码 → 生成 32 字节随机 Session Token
     → Set-Cookie: session=<hex>; HttpOnly; SameSite=Lax; Max-Age=30天; Secure
```

- **Argon2**: 抗 GPU/ASIC 攻击的密码哈希算法
- **HttpOnly Cookie**: JS 无法读取，防 XSS 窃取 Token
- **SameSite=Lax**: 防 CSRF
- **每用户最多 5 个 Session**: 防止 Session 泛滥

### 6.2 HTTP 安全头

| Header | 值 | 作用 |
|--------|-----|------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'` | 防 XSS |
| `Strict-Transport-Security` | `max-age=31536000` | 强制 HTTPS |
| `X-Content-Type-Options` | `nosniff` | 防 MIME 嗅探 |

### 6.3 数据隔离

所有业务查询都包含 `WHERE user_id = ?`。没有任何 API 可以跨用户读取数据（协作除外，但协作有显式的好友关系校验）。

### 6.4 AI 安全

- 系统 prompt 包含安全规则，禁止泄露 prompt 内容
- Tool 执行始终绑定当前 `user_id`
- 任务内容中的指令不会被当作对 AI 的指令执行
- 此刻（Moment）使用专用 prompt，无 tools，无对话历史

---

## 七、特色设计

### 7.1 拖拽即分类

任务卡片可以在象限之间、Tab 之间拖拽。这是 Next 的核心交互：

- **桌面端**：鼠标拖拽，5px 移动阈值触发
- **移动端**：长按 300ms 后进入拖拽模式（触觉反馈）
- **跨 Tab 拖拽**：拖到 Tab 标签上 → 移动到目标 Tab 的默认象限
- **拖拽预览**：半透明克隆体跟随光标
- **防误触**：按钮、勾选框、输入框不触发拖拽

### 7.2 双层时间管理

```
例行任务（日常习惯）   ←→   一次性任务（四象限）
  │                          │
  每天重置                    三个时间段 Tab
  打卡制                     优先级泳道
```

用户的一天 = 先完成例行习惯 → 然后处理四象限中的任务。这比单纯的 Todo List 多了"节奏感"。

### 7.3 例行审视

不只是做任务，还要定期反思：

- 每日审视："今天最重要的三件事是什么？"
- 每周审视："这周哪些任务一直在拖？"
- 每月审视："这个月的目标完成了多少？"

频率可配置（daily / weekly / monthly / yearly），可暂停，带独立完成状态。

### 7.4 协作确认机制

当任务被标记为协作任务后，完成操作不会立即生效。而是进入"确认流程"：

- A 说"我做完了" → 系统创建确认请求
- B 收到通知 → 确认或驳回
- 双方确认后 → 任务正式标记完成

这避免了"你说做完了但其实没做完"的尴尬。

### 7.5 PWA 离线体验

```
Network First, Cache Fallback:
  ├─ 有网 → 用网络数据，同时更新缓存
  └─ 断网 → 用缓存数据，无缝体验
```

- Service Worker 预缓存所有静态资源
- API 请求不缓存（保证数据新鲜）
- `sw.js` 和 `index.html` 设置 `no-cache`，避免 SW 缓存死循环
- 版本号机制 (`?v=20260221i`) 确保更新后缓存失效

### 7.6 视觉设计

- **深色主题优先**：暗色背景 + 半透明毛玻璃效果
- **彗星粒子**：顶栏 Canvas 动画，增加科技感
- **呼吸线**：底部 Canvas 动画，微妙的生命感
- **时段图标**：此刻文案前的图标随时间变化（☀️ / ⛅ / 🌙 / 🌟）

---

## 八、部署架构

### 8.1 构建流程

```
Docker Multi-stage Build:

Stage 1: rust:1.92-slim
  → cargo build --release
  → 产出: ~10MB 二进制

Stage 2: debian:bookworm-slim
  → COPY 二进制 + frontend/ + data/quotes.txt
  → 最终镜像: ~80MB
```

### 8.2 Fly.io 配置

| 配置 | 值 | 说明 |
|------|-----|------|
| 机房 | `nrt` (东京) | 中国/日本用户延迟最低 |
| 实例 | `shared-cpu-1x` / `256MB` | 最小规格，足够使用 |
| 并发 | 20 soft / 25 hard | 单机承载上限 |
| 自动停机 | `auto_stop_machines = "stop"` | 无流量时停机省钱 |
| 最小实例 | `min_machines_running = 1` | 保证至少 1 台运行 |
| 持久卷 | `next_data` → `/data` | SQLite + 备份 |
| 健康检查 | `GET /health` 每 30s | 自动重启不健康实例 |

### 8.3 缓存版本策略

前端资源通过查询参数 `?v=YYYYMMDD+字母` 做缓存控制：

```html
<link href="/assets/css/style.css?v=20260221i">
<script src="/assets/js/app.js?v=20260221i"></script>
```

- 同一天内递增字母后缀 (a → b → c)
- 跨天更新日期并重置为 a
- Service Worker 同步更新 `CACHE_NAME = 'next-v13'`

---

## 九、性能预算

| 指标 | 目标 | 实际 |
|------|------|------|
| 首屏加载 | <2s (3G) | ~1.5s (缓存命中 <0.5s) |
| API 响应 | <100ms | SQLite 本地查询 <10ms |
| 阿宝回复 | <5s | Claude API 1-3s + network |
| 此刻文案 | <2s 首次 / <5ms 缓存 | Claude 1-2s / 缓存 <5ms |
| 内存占用 | <100MB | ~30-50MB |
| 二进制大小 | <20MB | ~10MB |

---

## 十、技术选型理由

### 为什么是 Rust？

不是因为"Rust 很酷"。是因为：
1. **编译后单二进制**：部署极简，不需要 Node.js/Python 运行时
2. **内存安全**：SQLite 连接管理不会出现 UAF / 悬空指针
3. **性能**：冷启动 <1s，内存 <50MB，256MB 的最小实例绰绰有余
4. **Axum 生态**：类型安全的路由、自动的请求提取、优雅的错误处理

### 为什么是 Vanilla JS？

不是因为"反框架"。是因为：
1. **零构建步骤**：改完 JS，`fly deploy`，完事
2. **直接调试**：浏览器 F12 看到的就是源码
3. **体积小**：全部 JS 加起来 <100KB，不需要 bundle splitting
4. **迭代快**：不需要等 webpack/vite 编译

### 为什么是 SQLite？

不是因为"简单"。是因为：
1. **WAL 模式**：并发读 + 单写者，对于我们的场景完全够用
2. **零运维**：不需要数据库服务器，不需要连接池
3. **VACUUM INTO 备份**：一行命令生成完整备份
4. **Volume 持久化**：Fly.io Volume 挂载后，重新部署不丢数据

---

## 附录 A: 技术栈一览

| 层 | 技术 | 版本 |
|----|------|------|
| 后端框架 | Axum | 0.8 |
| 异步运行时 | Tokio | 1 (full) |
| 数据库 | SQLite (rusqlite) | 0.32 (bundled) |
| 密码哈希 | Argon2 | 0.5 |
| HTTP 客户端 | reqwest | 0.12 |
| 加密 (Push) | p256 + aes-gcm | 0.13 / 0.10 |
| 前端 | Vanilla JS + CSS | ES5 兼容 |
| PWA | Service Worker | — |
| AI | Claude Sonnet 4.5 | claude-sonnet-4-5 |
| 部署 | Docker + Fly.io | — |
| 构建 | Multi-stage Dockerfile | rust:1.92 |

## 附录 B: 环境变量

| 变量 | 来源 | 说明 |
|------|------|------|
| `PORT` | fly.toml | 监听端口 (8080) |
| `DATABASE_PATH` | fly.toml | SQLite 文件路径 |
| `FRONTEND_DIR` | fly.toml | 前端静态文件目录 |
| `TZ` | fly.toml | 时区 (Asia/Shanghai) |
| `ANTHROPIC_API_KEY` | fly secrets | Claude API 密钥 |
