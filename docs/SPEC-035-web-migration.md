# SPEC-035: Next Web 化系统重构设计

> 起草日期: 2026-02-20
> 状态: 草稿
> 参与角色: 兼容性设计、可靠性设计、移动端体验设计、数据安全设计、后台技术选型

---

## 一、Context

Next 当前是 Windows 桌面应用（Tauri 2.0 + Rust + Vanilla JS），数据存储在本地 JSON 文件。用户需要在手机和电脑上都能使用，且数据统一。

**决策**：放弃 Tauri 桌面端，重构为纯 Web 应用。电脑和手机都通过浏览器访问同一个 Web 服务，数据天然同步。部署到 Fly.io。

---

## 二、后台技术选型（技术选型专家）

### 2.1 框架选型

| 方案 | 代码复用 | 性能 | 内存占用 | 开发效率 | 生态 |
|------|---------|------|---------|---------|------|
| **Rust Axum** | ★★★★★ 直接复用 800 行模型+DB | ★★★★★ | ~5MB | ★★★ | ★★★ |
| Rust Actix | ★★★★★ 同上 | ★★★★★ | ~5MB | ★★★ | ★★★ |
| Node.js Express | ★☆☆☆☆ 需重写 | ★★★ | ~50MB | ★★★★★ | ★★★★★ |
| Python FastAPI | ★☆☆☆☆ 需重写 | ★★ | ~80MB | ★★★★★ | ★★★★ |
| Go Gin | ★☆☆☆☆ 需重写 | ★★★★ | ~10MB | ★★★★ | ★★★★ |

**推荐：Rust Axum 0.8**
- 核心优势：800+ 行 Rust 模型代码（todo.rs/routine.rs/review.rs）和 442 行 DB 层直接复用
- Tauri Command → Axum Handler 的翻译是机械性的，只是参数提取方式不同
- Fly.io 免费层 256MB 内存，Rust 仅占 ~5MB，绰绰有余
- Axum 比 Actix 更简洁，社区更活跃

### 2.2 数据库选型

| 方案 | 迁移成本 | 并发安全 | 查询能力 | 运维成本 |
|------|---------|---------|---------|---------|
| **JSON 文件 + 文件锁** | 零 | 足够（单用户） | 内存过滤 | 零 |
| SQLite | 中 | 好 | SQL 查询 | 低 |
| PostgreSQL | 高 | 优秀 | 完整 SQL | 中 |

**推荐：保留 JSON 文件**
- 单用户场景，数据量极小（todos.json ~34KB）
- 现有原子写入（.tmp → rename）在单进程 Web 服务器中完全安全
- Axum 使用 `Arc<Mutex<AppState>>`，同一时刻只有一个写入者
- 如果未来需要升级，DB 层的 trait 边界已经清晰，可以无缝换 SQLite

### 2.3 推荐依赖

```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["fs", "cors", "set-header"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rand = "0.9"
chrono = { version = "0.4", features = ["serde"] }
```

### 2.4 项目结构

```
Next/
├── server/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs              # Axum 入口、路由注册、静态文件
│       ├── auth.rs              # Bearer Token 中间件
│       ├── state.rs             # Arc<Mutex<AppState>>
│       ├── models/              # 从 src-tauri 复制，微调
│       │   ├── mod.rs
│       │   ├── todo.rs          # 417 行，直接复用
│       │   ├── routine.rs       # 82 行，直接复用
│       │   └── review.rs        # 305 行，直接复用
│       ├── db/
│       │   └── mod.rs           # 442 行，直接复用
│       └── routes/
│           ├── mod.rs
│           ├── todos.rs         # 翻译自 commands/todos.rs
│           ├── routines.rs      # 翻译自 commands/routines.rs
│           ├── reviews.rs       # 翻译自 commands/reviews.rs
│           └── quotes.rs        # 翻译自 commands/quotes.rs
├── frontend/                    # 现有，微调
├── data/                        # JSON 数据
├── Dockerfile
└── fly.toml
```

### 2.5 Fly.io 免费层限制与应对

| 限制 | 详情 | 应对 |
|------|------|------|
| 共享 CPU | 1 vCPU 共享 | Rust 性能绰绰有余 |
| 内存 | 256MB | Rust 二进制 ~5MB，足够 |
| 持久卷 | 3GB 免费 | JSON 文件 <1MB |
| 休眠 | 30 分钟无请求后休眠 | 冷启动 ~2 秒（Rust 快），可配 `min_machines_running = 1` |
| 自动停机 | 免费层会自动停机 | 用 UptimeRobot 每 25 分钟 ping 保活 |

---

## 三、兼容性设计（兼容性设计师）

### 3.1 目标浏览器矩阵

| 浏览器 | 桌面最低版本 | 移动最低版本 | 全球份额 |
|--------|------------|------------|---------|
| Chrome | 90+ | 90+ (Android) | ~65% |
| Safari | 15+ | 15+ (iOS) | ~19% |
| Edge | 90+ | - | ~5% |
| Firefox | 100+ | 100+ | ~3% |
| Samsung Internet | - | 15+ | ~3% |

### 3.2 CSS 特性兼容性检查

| 特性 | 当前使用 | 兼容性 | 风险 | 处理 |
|------|---------|--------|------|------|
| CSS Variables | `var(--primary-color)` 全局使用 | ✅ 所有目标浏览器 | 无 | - |
| CSS Grid | `.matrix-grid` 四栏布局 | ✅ | 无 | - |
| `backdrop-filter` | `.about-overlay` 毛玻璃 | ⚠️ Firefox 103+ | 低 | 已有 `-webkit-` 前缀 |
| `env(safe-area-inset-*)` | mobile.css 刘海适配 | ✅ iOS Safari 11.2+ | 无 | - |
| `@supports` | mobile.css 条件样式 | ✅ | 无 | - |
| `linear-gradient` | 主题渐变 | ✅ | 无 | - |
| Flexbox | 全局布局 | ✅ | 无 | - |

**结论**：现有 CSS 特性在目标浏览器矩阵内全部兼容，无需 polyfill。

### 3.3 JS API 兼容性检查

| API | 使用位置 | 兼容性 | 处理 |
|-----|---------|--------|------|
| `fetch` | api.js（REST 调用） | ✅ 所有目标 | - |
| `localStorage` | 主题、侧栏状态等 | ✅ | PWA 模式 Safari 有 7 天限制，需注意 |
| `navigator.clipboard` | 复制版本号 | ⚠️ 需 HTTPS | 已有 try-catch 降级 |
| Canvas 2D | 粒子动画、呼吸线 | ✅ | 手机端禁用 |
| `matchMedia` | 主题检测 | ✅ | - |
| `ResizeObserver` | 未使用 | - | - |
| `IntersectionObserver` | 未使用 | - | - |
| Touch Events | drag.js | ✅ | 已实现 |
| Service Worker | 新增 PWA | ✅ Chrome/Edge/Firefox; ⚠️ iOS Safari 有限 | 降级为纯在线 |

### 3.4 响应式断点体系

```
手机竖屏     手机横屏      平板竖屏      平板横屏/小笔记本   桌面
0───────480──────667────────768──────────1024──────────1200───→∞

  单列堆叠      单列宽      单列+侧栏      2列矩阵+侧栏     完整3栏
  底部导航      底部导航    底部导航        左侧栏+底部      左侧栏
  无粒子        无粒子      简化粒子        完整粒子          完整粒子
```

| 断点 | 布局 | 导航 | 矩阵 | 动画 |
|------|------|------|------|------|
| ≤480px | 单列 | 底部 Tab | 单列堆叠 | 关闭 |
| 481-768px | 单列宽 | 底部 Tab | 单列堆叠 | 关闭 |
| 769-1024px | 双栏 | 左侧栏收起 | 2列 | 简化 |
| 1025-1200px | 三栏 | 左侧栏 | 2×2 | 完整 |
| ≥1201px | 三栏宽 | 左侧栏 | 2×2 | 完整 |

### 3.5 特殊设备处理

| 设备 | 问题 | 方案 |
|------|------|------|
| iPhone 刘海屏 | 安全区域遮挡内容 | `env(safe-area-inset-*)` padding（mobile.css 已实现） |
| iPhone 灵动岛 | 顶部状态栏区域 | `meta viewport-fit=cover` + safe area padding |
| 折叠屏 | 展开/折叠时布局变化 | `resize` 事件监听 + 断点自动切换（已有） |
| iPad Split View | 宽度动态变化 | CSS 媒体查询自适应 |
| 虚拟键盘 | 弹出时压缩可视区 | `visualViewport` API 监听，fixed 元素改为 absolute |

### 3.6 iOS Safari PWA 已知限制

| 限制 | 影响 | 应对 |
|------|------|------|
| 无推送通知 | 不影响核心功能 | - |
| localStorage 7 天过期（未使用时） | Token 可能丢失 | 用 IndexedDB 作为备份存储 |
| 无后台 Service Worker | 离线缓存功能受限 | 网络优先策略，降级提示 |
| 无 BadgeAPI | 无法显示未读数 | - |
| 下拉刷新冲突 | 可能触发系统下拉 | `overscroll-behavior: none` |

---

## 四、移动端体验设计（移动端 UX 设计师）

### 4.1 信息架构

桌面三栏 → 移动单列 + 底部导航的映射：

```
桌面端                          移动端
┌────┬────────────┬──────┐     ┌──────────────────┐
│左侧│ 中间内容区  │右侧栏│     │ 顶部固定栏        │
│导航│ 4泳道2×2格  │待处理│     ├──────────────────┤
│    │            │已完成│ ──► │ Tab: T / W / M   │
│    │            │已删除│     ├──────────────────┤
└────┴────────────┴──────┘     │ 单列泳道内容      │
                               │ (可折叠手风琴)     │
                               ├──────────────────┤
                               │ [Todo][收件][审视] │
                               └──────────────────┘
```

### 4.2 移动端布局设计

#### 顶部固定栏 (48px)
```
┌──────────────────────────────┐
│  N  │  Today  Week  Month  │ 🔍 │
└──────────────────────────────┘
```
- 左：App logo (小图标)
- 中：时间维度 Tab（紧凑 pill 样式，可左右滑动切换）
- 右：搜索按钮

#### 主内容区（泳道手风琴）
```
┌──────────────────────────────┐
│ ▼ 🔥 优先处理 (3)          + │  ← 默认展开
│  ┌──────────────────────┐    │
│  │ 任务1          ▓▓▓ 60% │  │
│  │ 任务2          ▓░░  20% │  │
│  └──────────────────────┘    │
│ ► 🎯 就等你翻牌子了 (5)      │  ← 默认折叠
│ ► 📥 待分类 (2)              │  ← 默认折叠
│ ► ⚡ 短平快 (1)              │  ← 默认折叠
└──────────────────────────────┘
```
- 4 个泳道按优先级上下排列，手风琴式折叠
- "优先处理"默认展开（这是"下一步最该做的事"）
- 点击标题栏展开/折叠
- 每个泳道右上角 "+" 按钮快速新建

#### 底部导航 (56px + safe area)
```
┌──────────────────────────────┐
│   ✓Todo    📋收件箱    📊审视  │
└──────────────────────────────┘
```
- 3 个 Tab，图标 + 文字
- "收件箱" = 桌面端右侧栏的"待处理"功能（快速记录）
- "审视" = 桌面端的"例行审视"

### 4.3 核心交互设计

#### 新建任务
```
步骤1：点 "+" 或底部 FAB
步骤2：底部弹出半屏面板（不是全屏，保持上下文感）
┌──────────────────────────────┐
│                              │
│  （半透明遮罩，当前内容可见）  │
│                              │
├──────────────────────────────┤
│  任务标题 _______________    │
│  泳道: [优先处理 ▼]          │
│  截止日期: [选择日期]         │
│  负责人: [输入]              │
│                              │
│     [ 取消 ]    [ 创建 ]     │
└──────────────────────────────┘
```
- 半屏面板（bottom sheet），不打断用户的位置感
- 默认泳道跟随当前展开的泳道
- 创建后自动收起面板，新任务出现在列表中

#### 任务详情（查看/编辑）
```
点击任务卡片 → 全屏推入（slide from right）
┌──────────────────────────────┐
│  ← 返回    任务详情    ···   │
├──────────────────────────────┤
│                              │
│  任务标题                     │
│  ──────────                  │
│  详细描述                     │
│  （点击可编辑）               │
│                              │
│  进度 ▓▓▓▓▓░░░░░ 50%        │
│  泳道: 优先处理               │
│  截止: 2026-02-25            │
│  负责人: Boris               │
│  标签: #工作 #重要            │
│                              │
│  ── 变更历史 ──               │
│  2/20 进度 40%→50%           │
│  2/19 移到"优先处理"          │
│                              │
│  [ 🗑 删除 ]                 │
└──────────────────────────────┘
```
- 全屏展示，左滑返回
- 字段点击即编辑（复用现有 click-to-edit 逻辑）
- 进度条可触摸拖动

#### 任务移动（跨泳道/跨时间）
- **主要方式**：任务卡片左滑出现操作按钮
  ```
  ┌──────────────────────┬─────┬─────┐
  │  任务标题             │ 移动 │ 删除 │
  └──────────────────────┴─────┴─────┘
  ```
  点"移动"弹出选择器：选泳道 + 选时间维度
- **辅助方式**：长按拖拽（已实现，drag.js 支持 touch）

#### 搜索
- 点击搜索图标 → 顶部展开搜索输入框（覆盖 Tab 栏）
- 实时过滤，高亮匹配（复用现有搜索逻辑）
- 点取消或按返回收起

### 4.4 收件箱（待处理）

桌面端的右侧栏"待处理"在移动端变为底部 Tab 的第二个页面：
```
┌──────────────────────────────┐
│  📋 收件箱                    │
├──────────────────────────────┤
│  快速记录... ____________ [+] │
├──────────────────────────────┤
│  ☐ 给老板发邮件               │  ← 左滑：分配到泳道 / 删除
│  ☐ 买咖啡                    │
│  ☐ 看一下 PR                 │
├──────────────────────────────┤
│  ── 已完成 (12) ──           │
│  ☑ 修复登录 bug              │
│  ☑ 写周报                    │
├──────────────────────────────┤
│  ── 已删除 (3) ──            │
│  🗑 旧任务...                 │
└──────────────────────────────┘
```

### 4.5 视觉适配

| 元素 | 桌面 | 移动 |
|------|------|------|
| 粒子动画 | 完整 Canvas 彗星粒子 | **关闭**（省电省性能） |
| 呼吸线 | 底部 Canvas 动画 | **关闭** |
| 字体 | 14px 正文 | 16px 正文（防 iOS 缩放） |
| 触摸目标 | 无限制 | 最小 44×44px |
| 间距 | 紧凑 | 加大（12px → 16px） |
| 圆角 | 12px | 12px（保持一致） |
| 主题 | 自动/手动切换 | 同上 + 跟随系统 |

### 4.6 竞品参考设计模式

| 模式 | 来源 | 采纳 |
|------|------|------|
| 底部半屏新建面板 | Things 3 | ✅ 采纳 |
| 左滑操作按钮 | Todoist / iOS Mail | ✅ 采纳 |
| 手风琴泳道列表 | TickTick 优先级视图 | ✅ 采纳 |
| 全屏推入详情页 | Things 3 | ✅ 采纳 |
| 底部 Tab 收件箱 | Todoist | ✅ 采纳 |
| 拖拽排序 | TickTick | ✅ 已有 |
| 左右滑动切 Tab | iOS 通用模式 | ✅ 已有 (features.js) |

---

## 五、数据安全设计（数据安全设计师）

### 5.1 安全优先级分类

#### P0 — 必须做（上线前）

**1. HTTPS 强制**
- Fly.io 内建 TLS 1.2/1.3，免费自动证书
- 配置 `force_https = true`
- 添加 HSTS header：`Strict-Transport-Security: max-age=31536000`

**2. 认证方案**
- **推荐方案**：静态 Bearer Token + HttpOnly Cookie 双模式
  - API 调用用 `Authorization: Bearer <token>`（适合 API 客户端）
  - 浏览器登录后设置 `HttpOnly Secure SameSite=Strict` cookie（防 XSS 窃取）
- Token 至少 32 字节随机（64 字符 hex）
- 服务端用 `constant_time_eq` 比较 Token（防时序攻击）
- 环境变量存储：`fly secrets set NEXT_API_TOKEN=<random>`

**3. XSS 防护**
- 现有 `escapeHtml()` 函数（utils.js）已正确实现：转义 `& < > " '`
- **审计结果**：`tasks.js` 中 `renderTaskItem()` 使用 innerHTML 构建任务卡片，但内容均通过 `escapeHtml()` 处理 ✅
- 添加 CSP header：
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  ```
- 注意：当前使用 `'unsafe-inline'` 因为有内联 script 和 style，未来可优化

**4. CSRF 防护**
- REST API 使用 Bearer Token 认证，天然免疫 CSRF（浏览器不会自动发送 Authorization header）
- 如果改用 Cookie 认证，需要添加 `SameSite=Strict` + CSRF Token

**5. 路径遍历防护**
- Axum `tower-http::ServeDir` 内建防护，不允许 `../` 遍历
- 限制静态文件服务到 `frontend/` 目录

#### P1 — 应该做（上线后优化）

**6. 速率限制**
```rust
// tower-governor 或手动计数
// 建议：每 IP 每分钟 60 次请求
```
- 防暴力猜测 Token
- 防恶意大量请求

**7. 请求大小限制**
```rust
// Axum body size limit
.layer(DefaultBodyLimit::max(1024 * 1024)) // 1MB
```

**8. 日志脱敏**
- 不记录 Authorization header 值
- 不记录请求/响应 body（可能包含任务内容）
- 只记录：时间、方法、路径、状态码、耗时

**9. Token 轮换**
- 提供 `POST /api/auth/rotate` 端点生成新 Token
- 旧 Token 在新 Token 生成后 5 分钟内仍有效（平滑切换）

#### P2 — 可以做（长期优化）

**10. 数据静态加密**
- JSON 文件在服务器磁盘以明文存储
- Fly.io 持久卷已有块级加密
- 如需应用级加密，可用 `aes-gcm` crate 加密 JSON 后存储

**11. 审计日志**
- 记录所有写操作（创建、更新、删除）到独立 `audit.log`
- 格式：`{time, action, item_id, ip}`

**12. 多用户/OAuth**
- 目前不需要，单用户 Token 足够
- 预留扩展点：auth.rs middleware 可以替换为 JWT 验证

### 5.2 前端 Token 存储方案

| 方案 | XSS 安全 | CSRF 安全 | 实现难度 |
|------|---------|---------|---------|
| localStorage | ❌ JS 可读 | ✅ | 简单 |
| **HttpOnly Cookie** | ✅ JS 不可读 | ⚠️ 需 SameSite | 中等 |
| 内存变量 | ✅ 刷新丢失 | ✅ | 复杂（需刷新重登录） |

**推荐**：登录后服务端 Set-Cookie（HttpOnly + Secure + SameSite=Strict），前端 fetch 自动携带。同时 localStorage 存一个标记 `loggedIn=true` 用于前端判断是否需要跳登录页。

### 5.3 备份与恢复

- **自动备份**：每天凌晨 cron 复制 `data/*.json` → `data/backups/YYYY-MM-DD/`
- **保留策略**：最近 30 天的每日备份
- **恢复方式**：直接复制 backup 文件覆盖当前文件，重启服务
- **实现**：Axum 启动时 spawn 一个 tokio 定时任务

---

## 六、可靠性设计（可靠性设计师）

### 6.1 数据可靠性

**并发写入安全性分析**：
- Axum 使用 `Arc<Mutex<AppState>>`，同一时刻只有一个 handler 持有锁
- JSON 原子写入（.tmp → rename）在单进程下安全
- **风险**：如果同时有大量请求，Mutex 可能成为瓶颈
- **评估**：单用户场景 QPS < 1，完全不是问题

**数据一致性保障**：
```
写入流程：
1. Lock Mutex
2. 修改内存 HashMap
3. 序列化为 JSON
4. 写入 .tmp 文件（BufWriter flush）
5. rename .tmp → .json（原子操作）
6. Unlock Mutex

任意步骤失败：
- 步骤 2-3 失败：内存和磁盘都不变
- 步骤 4 失败：.tmp 文件不完整，.json 不受影响
- 步骤 5 失败：.tmp 存在但 .json 是旧版本（下次启动用旧数据）
```

**数据迁移方案**：
1. 从桌面导出：复制 `%LOCALAPPDATA%\Next\data\` 下的 3 个 JSON 文件
2. 上传到服务器 `data/` 目录
3. 重启服务，自动加载

### 6.2 服务可靠性

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Fly.io 冷启动 | 高（免费层休眠） | 首次请求 2-3 秒延迟 | 前端 loading 动画；可选 UptimeRobot 保活 |
| 进程崩溃 | 低 | 服务中断 | Fly.io 自动重启；Rust panic 默认 abort |
| 内存泄漏 | 极低 | OOM 杀死 | HashMap 大小有限（任务数有限）；定期监控 |
| 数据文件损坏 | 极低 | 数据丢失 | 原子写入 + 每日备份 |
| Fly.io 平台故障 | 极低 | 完全不可用 | 接受风险；重要数据有备份 |

**健康检查端点**：
```
GET /health → 200 { "status": "ok", "uptime": 12345 }
```
Fly.io 自动探活，失败自动重启。

### 6.3 API 可靠性

**幂等性设计**：
- GET：天然幂等
- POST 创建：服务端生成 ID（UUID），客户端重复提交会创建重复记录 → 前端加防重
- PUT 更新：基于 `updated_at` 乐观锁，如果数据已被修改返回 409 Conflict
- DELETE：幂等，已删除再删除返回成功

**错误返回格式统一**：
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Todo not found: abc12345"
}
```

**前端可靠性**：
- API 失败自动 toast 提示（复用现有 `showToast(msg, 'error')`）
- 创建/更新操作按钮加 `disabled` 防重复提交
- 页面状态恢复：当前 tab、折叠状态、滚动位置存 localStorage

### 6.4 零停机部署

```bash
fly deploy --strategy rolling     # 新实例启动后才停旧实例
```

**回滚**：
```bash
fly releases                      # 查看历史版本
fly deploy --image <previous>     # 回滚到指定版本
```

---

## 七、实施计划

### 阶段划分

```
P1 后端 (6-8h)          P2 前端桌面 (2-3h)     P3 移动端 (4-6h)      P4 部署 (2-3h)
┌───────────────┐       ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
│ Axum 服务器    │       │ api.js 改 REST│       │ 响应式 CSS    │      │ Dockerfile   │
│ 复制模型+DB    │──────►│ login.html   │──────►│ 底部导航     │─────►│ fly.toml     │
│ 20个REST端点  │       │ 去 Tauri 依赖 │       │ 手风琴泳道   │      │ 上线部署     │
│ Token 认证    │       │ 安全 headers  │       │ 全屏详情页   │      │ 数据迁移     │
│ 健康检查      │       │              │       │ 左滑操作     │      │ PWA / SW     │
│ 每日备份      │       │              │       │ 触摸优化     │      │              │
└───────────────┘       └──────────────┘       └──────────────┘      └──────────────┘
```

### 关键文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/` 整个目录 | Axum 服务器 |
| 新建 | `frontend/login.html` | Token 登录页 |
| 新建 | `frontend/sw.js` | Service Worker |
| 新建 | `Dockerfile` | 容器构建 |
| 新建 | `fly.toml` | Fly.io 部署配置 |
| 修改 | `frontend/assets/js/api.js` | Tauri IPC → REST fetch |
| 修改 | `frontend/assets/css/style.css` | 追加移动端媒体查询 |
| 修改 | `frontend/index.html` | 加底部导航、mobile.css、SW 注册、去 Tauri 脚本 |
| 启用 | `frontend/assets/css/mobile.css` | 已有 421 行，补充完善 |
| 修改 | `frontend/assets/js/app.js` | 平台检测、移动端布局切换 |
| 修改 | `frontend/assets/manifest.json` | 更新 theme_color 等 |
| 保留 | `src-tauri/` | 暂时保留不删除，以防需要回退 |

### 总工作量估算

| 阶段 | 小时 | 复杂度 |
|------|------|--------|
| P1 后端 | 6-8h | 中（机械翻译 Tauri Commands → Axum） |
| P2 前端桌面 | 2-3h | 低（只改 api.js + login） |
| P3 移动端 | 4-6h | 中高（响应式 + 新交互） |
| P4 部署 | 2-3h | 低 |
| **总计** | **14-20h** | |

---

## 八、验证方案

| 阶段 | 验证方式 |
|------|---------|
| P1 | `cargo run` → `curl -H "Authorization: Bearer xxx" localhost:3000/api/todos` |
| P2 | Chrome 桌面打开 `localhost:3000` → 完整 CRUD 操作 |
| P3 | Chrome DevTools 手机模拟（iPhone 14, Pixel 7）+ 真机 Safari/Chrome |
| P4 | 外网手机访问 `https://next-boris.fly.dev`，PWA 安装，断网测试 |

### 移动端验收清单
- [ ] 4 泳道手风琴正常展开/折叠
- [ ] 新建任务半屏面板流畅
- [ ] 任务详情全屏推入/返回
- [ ] 左滑操作按钮（移动/删除）
- [ ] Tab 左右滑动切换
- [ ] 底部导航 3 Tab 切换
- [ ] 搜索展开/关闭
- [ ] 深色/浅色主题
- [ ] iPhone 刘海屏安全区域
- [ ] 虚拟键盘弹出不遮挡输入
- [ ] PWA 安装到主屏幕

---

## 九、API 端点清单

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（验证 token，设置 cookie） |
| POST | `/api/auth/logout` | 登出（清除 cookie） |
| GET | `/api/auth/check` | 检查登录状态 |

### Todo
| 方法 | 路径 | 说明 | 对应 Tauri Command |
|------|------|------|--------------------|
| GET | `/api/todos?tab=today` | 获取任务列表 | `get_todos` |
| GET | `/api/todos/:id` | 获取单个任务 | `get_todo` |
| POST | `/api/todos` | 创建任务 | `create_todo` |
| PUT | `/api/todos/:id` | 更新任务 | `update_todo` |
| DELETE | `/api/todos/:id` | 软删除任务 | `delete_todo` |
| POST | `/api/todos/:id/restore` | 恢复已删除任务 | `restore_todo` |
| DELETE | `/api/todos/:id/permanent` | 永久删除任务 | `permanent_delete_todo` |
| PUT | `/api/todos/batch` | 批量更新任务 | `batch_update_todos` |
| GET | `/api/todos/counts?tab=today` | 获取各象限任务数量 | `get_todo_counts` |

### Routine
| 方法 | 路径 | 说明 | 对应 Tauri Command |
|------|------|------|--------------------|
| GET | `/api/routines` | 获取例行任务 | `get_routines` |
| POST | `/api/routines` | 创建例行任务 | `create_routine` |
| POST | `/api/routines/:id/toggle` | 切换例行任务状态 | `toggle_routine` |
| DELETE | `/api/routines/:id` | 删除例行任务 | `delete_routine` |

### Review
| 方法 | 路径 | 说明 | 对应 Tauri Command |
|------|------|------|--------------------|
| GET | `/api/reviews` | 获取例行审视列表 | `get_reviews` |
| POST | `/api/reviews` | 创建例行审视 | `create_review` |
| PUT | `/api/reviews/:id` | 更新例行审视 | `update_review` |
| POST | `/api/reviews/:id/complete` | 标记完成 | `complete_review` |
| POST | `/api/reviews/:id/uncomplete` | 取消完成 | `uncomplete_review` |
| DELETE | `/api/reviews/:id` | 删除例行审视 | `delete_review` |

### 其他
| 方法 | 路径 | 说明 | 对应 Tauri Command |
|------|------|------|--------------------|
| GET | `/api/quote` | 随机名言 | `get_random_quote` |
| GET | `/api/calendar/task/:id` | 导出单任务 ICS | `export_task_ics` |
| GET | `/api/calendar/tab/:tab` | 导出 Tab 任务 ICS | `export_tab_ics` |
| GET | `/health` | 健康检查 | - |
