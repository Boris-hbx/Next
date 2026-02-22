# Next 系统评估报告

> 评估日期: 2026-02-22
> 评估方法: 5 位独立专家并行审查全部源码
> 代码版本: f9c883b (安全加固后)

---

## 总分：7.3 / 10

| 专家 | 评估领域 | 得分 | 权重 | 加权分 |
|------|---------|------|------|--------|
| 架构师 | 项目结构 & 代码质量 | **6.8** | 20% | 1.36 |
| 安全专家 | 认证、防护、漏洞 | **8.2** | 20% | 1.64 |
| 前端工程师 | UI/UX & 前端架构 | **7.5** | 20% | 1.50 |
| 后端工程师 | Rust 性能 & API 设计 | **6.2** | 20% | 1.24 |
| DevOps 工程师 | 部署、文档、运维 | **7.8** | 20% | 1.56 |
| | | | **总计** | **7.30** |

---

## 细分评分矩阵

| 子项 | 架构师 | 安全 | 前端 | 后端 | DevOps | 综合 |
|------|--------|------|------|------|--------|------|
| 代码质量 | 5.9 | - | 7.0 | 7.0 | - | **6.6** |
| 安全性 | 7.8 | 8.2 | - | - | 7.0 | **7.7** |
| 性能 | - | - | 7.0 | 5.0 | - | **6.0** |
| 架构设计 | 7.2 | - | 8.0 | 6.0 | 8.0 | **7.3** |
| 可维护性 | 6.2 | - | - | - | 8.0 | **7.1** |
| 文档 | - | - | - | - | 9.0 | **9.0** |
| 测试覆盖 | - | - | - | 0.0 | 2.0 | **1.0** |
| 数据模型 | 7.5 | 8.5 | - | 4.0 | 8.0 | **7.0** |

---

## 一、架构师评估（6.8/10）

### 项目结构与组织：7/10

**优势：**
- 清晰的关注点分离：`server/src/{auth,db,models,routes,services,state}`
- 完善的参考文档体系（ARCHITECTURE.md、SYSTEM-DESIGN.md 等）
- 每个功能域独立路由文件（todos.rs、reviews.rs、friends.rs 等）
- 独立的模型层（todo.rs、reminder.rs、collaboration.rs）

**不足：**
- 路由文件大小差异大（quotes.rs 55 行 vs todos.rs 759 行），无清晰的委托模式
- Services 层利用不足：仅 7 个 service 模块，大部分业务逻辑在路由处理器中
- 无统一响应封装：每个路由自建 Response 结构体（TodosResponse、RemindersResponse 等），重复代码多
- 前端 18+ JS 文件职责边界不够清晰

### 架构设计：7.2/10

**优势：**
- UserId extractor（auth.rs:72-99）设计优雅，全局一致认证
- Axum Router 嵌套子路由结构清晰（main.rs:88-212）
- 异步优先：Tokio + async/await 贯穿始终
- 协作模型架构整洁（collaboration.rs services 层）

**不足：**
- `Arc<Mutex<Connection>>` 单连接是并发瓶颈
- 认证、业务逻辑、校验、响应格式化混在处理函数中
- 错误响应不一致：部分返回 `(StatusCode, Json<...>)`，部分返回 `impl IntoResponse`

### 代码质量：5.9/10

**关键问题：**
- **78 处 `.unwrap()` 调用** — 任何数据库错误会导致服务器崩溃
- **113 处 `.ok()` 静默吞错** — 操作失败但返回成功
- 无验证中间层，输入校验分散在各处理函数
- 50+ 内联 SQL 字符串散布各路由文件，维护困难

### 模块化与可维护性：6.2/10

- 添加新实体需改动 5+ 文件（schema、model、route、service、前端 API/JS/CSS）
- 路由与数据库紧耦合，无法独立重构 schema
- Services 层应承担更多业务逻辑（当前 todos CRUD 全在 routes/todos.rs 759 行中）

### 数据模型：7.5/10

**优势：** 合理的 schema 设计、外键约束、复合索引、ON DELETE CASCADE

**不足：**
- 软删除不一致（todos.deleted vs english_scenarios.archived，部分硬删除）
- 类型不匹配（DB 存 INTEGER 0/1，代码转 bool；tags 存 JSON 字符串）
- 缺少索引：`reminders.remind_at`（每 30s 轮询）、`notifications.user_id`
- 迁移策略脆弱（`.is_ok()` 检测列是否存在，可能因其他原因失败）

---

## 二、安全专家评估（8.2/10）

### 认证与授权：8.5/10

**已修复的高优先级问题：**
- H-3: Cookie Secure 标志 ✓（auth.rs:710）
- H-2: 改密码注销其他会话 ✓（auth.rs:604-611）
- 密码复杂度：8-128 字符 + 大小写 + 数字
- Argon2id 哈希 + 16 字节随机盐（**业界最佳实践**）
- HttpOnly + SameSite=Lax + Secure Cookie
- 30 天会话过期

**残留问题：**
- 限速数据仅存内存，重启后丢失（中风险）
- 时序攻击缓解已部分实现但不完全一致（低风险）

### 输入验证与 XSS 防护：8.2/10

- **零 SQL 注入风险** — 全部使用 `rusqlite::params![]` 参数化查询（10/10）
- H-4 XSS 修复 ✓ — `escapeHtml()` 在 markdown 转换前调用（english.js:305）
- 输入长度验证覆盖：todo text ≤500、content ≤10000、avatar ≤256KB、chat ≤4000 字符、batch ≤200 条
- 全局 1MB body size 限制

### API 安全：7.8/10

**完整安全头：**
- Content-Security-Policy（含 unsafe-inline，待优化）
- Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()

**限速体系：**
- 登录 IP 限制：10 次/分钟
- 用户锁定：5 次失败 → 锁定 15 分钟
- AI 场景生成：30 秒/用户
- Chat：5 条/分钟/用户

### 数据保护：8.5/10

- 全路由 user_id 数据隔离
- 256 位 CSPRNG 会话令牌
- 协作者访问控制验证完善

### 残留漏洞清单

| 等级 | 编号 | 描述 | 风险 |
|------|------|------|------|
| 中 | H-1 | 限速数据仅内存存储，重启后丢失 | 5/10 |
| 中 | M-2 | CSP 允许 unsafe-inline | 5/10 |
| 中 | H-6 | 协作任务标题可能被用于 prompt 注入 | 5/10 |
| 低 | L-2 | 时序攻击（用户枚举） | 3/10 |
| 低 | L-4 | 用户搜索可枚举 | 3/10 |
| 低 | L-3 | 注册时用户名枚举 | 2/10 |
| 低 | L-6 | 会话无滑动窗口续期 | 2/10 |

### 密码学：9/10

- Argon2id（v=19, m=19456, t=2, p=1）+ 随机盐
- 32 字节 CSPRNG 会话令牌（hex 编码）
- 零硬编码密钥，全部从环境变量加载

---

## 三、前端工程师评估（7.5/10）

### 前端架构：8/10

**优势：**
- 14 个专用模块清晰分离（api.js、tasks.js、modal.js、drag.js 等）
- IIFE 闭包封装模式（Abao、Notifications、DragManager）
- API 层统一封装 40+ 端点，Cookie 认证 + 401 自动跳转

**不足：**
- 全局状态污染严重（`allItems`、`currentTab`、`draggedItem` 全局变量）
- 无数据校验层，API 响应未做 schema 验证
- 错误处理不一致（部分 `catch(e) {}` 静默吞错）

### UI/UX 设计：8.5/10

**优势：**
- CSS 变量主题系统（35+ 变量）+ 暗色模式自动检测
- 768px 断点自适应（桌面矩阵 / 移动平铺列表）
- 拖放视觉反馈（克隆体、象限高亮、放置区域）
- Toast 通知跟随鼠标位置
- 手势提示（滑动导航）

**不足：**
- **零 ARIA 标签** — 无 `role`、`aria-label`、`tabindex` 管理
- Modal 不捕获焦点
- 纯图标按钮无屏幕阅读器文本
- 颜色状态指示无文字备选

### 性能：7/10

- 21 个 HTTP 请求加载（7 CSS + 14 JS），未打包
- 未压缩：总计约 750KB（打包后预计可降至 ~250KB）
- Service Worker 缓存列表不完整（缺 datepicker.js、particles.js、living-line.js）
- Canvas 动画持续运行可能影响移动端电量

### 移动体验：8/10

**亮点：**
- 统一鼠标/触摸拖放，长按阈值 300ms + 触觉振动反馈
- 水平滑动手势切换 Tab（阈值 80px 防误触）
- 底部导航 + safe-area-inset-bottom 刘海适配
- FAB 快速创建按钮

### PWA 实现：7.5/10

- Service Worker 生命周期正确（安装/激活/缓存版本控制）
- Web Push 通知 + 确认/贪睡操作按钮
- 网络优先 + 缓存回退策略
- Manifest 配置正确（maskable 图标、standalone 显示）
- 缓存版本号与前端 `?v=` 参数未联动

---

## 四、后端工程师评估（6.2/10）

### Rust 习惯用法：7/10

**优势：**
- Result/Option 在 auth 模块使用得当
- `FromRequestParts` 提取器设计地道
- parking_lot::Mutex 选择正确（不会 poison）
- serde 序列化属性使用规范

**不足：**
- 78 处 `.unwrap()`，关键位置包括：
  - auth.rs:317（注册 INSERT）、auth.rs:451（登录 INSERT session）
  - todos.rs:68,78（changelog 查询）、todos.rs:267,288（创建任务）
- 3 处 `expect()` 在启动时（db.rs:7,10,343），数据库初始化失败直接 panic
- 无自定义错误类型，依赖 tuple 响应

### API 设计：6/10

**优势：** RESTful 规范、一致的 `{ success, item?, message? }` 响应、合理的状态码

**不足：**
- **无分页** — `list_todos()` 返回全部任务 + 每个任务的 changelog + reminder（N+1 查询）
- 过滤不一致：部分端点支持 query params，部分不支持
- 无 API 版本控制策略

### 数据库层：4/10（架构瓶颈）

**核心问题 — 单 Mutex 连接：**
```
所有请求 → db.lock() → 排队等待 → 串行执行
```
- 10 个并发请求中有 9 个在等锁
- Chat handler 持锁期间调用 Claude API（可能阻塞 30 秒）
- 每小时 VACUUM INTO 备份阻塞全部请求 1-30 秒
- 使用同步 `rusqlite` 而非异步驱动，阻塞 async runtime

**N+1 查询问题：**
- `list_todos` → 每个 todo 调 `load_changelog`（1+N 次查询）
- `list_todos` → 每个 todo 调 `load_next_reminder`（又 N 次查询）
- `batch_update` → 每条检查 ownership（N 次查询）
- `get_todo_counts` → 4 个象限 4 条 SQL（可合并为 1 条）

**缺失事务：**
- `create_reminder` 同时创建 reminder 和 todo，无事务包裹
- 部分 INSERT 失败时数据不一致

**迁移策略脆弱：**
- 运行时每次启动执行迁移，无版本追踪
- `.ok()` 静默忽略 ALTER TABLE 失败

### 并发模型：3/10

- `Arc<Mutex<Connection>>` 将所有异步请求串行化
- 同步 rusqlite + 异步 Tokio = async/sync 不匹配
- Reminder poller 持锁期间触发通知 + 创建记录
- 适合 1-5 并发用户，10+ 用户会严重卡顿

### 测试覆盖：0/10

- 零 `#[test]` 模块、零 `#[cfg(test)]`、零集成测试
- 密码哈希、会话管理、限速逻辑、工具执行均无自动化验证
- 所有变更靠人工冒烟测试

---

## 五、DevOps 工程师评估（7.8/10）

### 部署流程：8/10

**优势：**
- 多阶段 Dockerfile：builder（rust:1.92-slim）→ runtime（debian:bookworm-slim）
- 最终镜像约 80MB，二进制 10MB（LTO + strip）
- 非 root 用户 `nextapp` 运行
- 构建依赖不进入运行时镜像

**不足：** 无预部署验证、无镜像安全扫描

### 基础设施：8/10

**fly.toml 配置合理：**
- 区域 `nrt`（东京），中日用户低延迟
- 实例 `shared-cpu-1x` / 256MB RAM
- 并发限制：20 soft / 25 hard
- 自动启停节省成本 + 健康检查自恢复（每 30s GET /health）
- 持久卷 `next_data` → `/data`

**不足：**
- 健康检查不验证数据库连通性
- 无 liveness vs readiness 区分
- 单实例是单点故障

### 监控与可观测性：5/10

- 仅有 `/health` 端点 + uptime
- 无结构化日志（仅 `println!` / `eprintln!`）
- 无请求日志中间件
- 无 Prometheus 指标、无 Sentry 错误追踪、无告警
- 无法回答：活跃用户数？请求失败率？最慢端点？锁竞争频率？

### 备份与恢复：8/10

- 每日自动 VACUUM INTO 备份
- 30 天保留 + 自动清理
- WAL 模式启用

**不足：** 无备份加密、无完整性校验、无恢复操作文档

### 文档质量：9/10（本次评估最高分）

| 文档 | 行数 | 评价 |
|------|------|------|
| SYSTEM-DESIGN.md | 570 | 产品定位、五层架构、数据流、技术选型理由，极其完善 |
| ARCHITECTURE.md | 220 | 请求生命周期、认证流程、AI 架构、协作模型 |
| API.md | 387 | 18 个端点组，请求/响应示例完整 |
| DEPLOYMENT.md | 124 | 部署步骤、fly.toml 逐行解读、缓存版本策略 |
| DATA.md | 411 | 19 张表完整字段说明、索引、关系图 |
| BACKEND.md | 143 | 新路由开发指南，代码片段可直接复制 |
| FRONTEND.md | 170 | 模块加载顺序、键盘快捷键、拖放系统 |
| SECURITY-AUDIT.md | 426 | 5 专家独立审查，27 个发现，每个含修复代码 |
| CLAUDE.md | 92 | 路由表让新人 30 秒找到任何文档 |

### CI/CD：2/10（最大运维短板）

- **完全手动部署**：开发者 → `fly deploy` → Fly.io
- 无 GitHub Actions
- 无 lint 检查（cargo fmt / clippy）
- 无预部署编译验证
- 无自动回滚

---

## 改进路线图

### Phase 1：止血（1-2 天）

| 项目 | 影响 | 工作量 |
|------|------|--------|
| 替换关键路径 `.unwrap()` 为错误处理 | 防止生产崩溃 | 1 天 |
| Chat handler 释放 DB 锁后再调 Claude API | 解除最严重阻塞 | 2 小时 |
| 添加基础 GitHub Actions（cargo check + clippy） | 预防编译错误上线 | 2 小时 |

### Phase 2：加固（1-2 周）

| 项目 | 影响 | 工作量 |
|------|------|--------|
| 引入 `r2d2` 连接池（5-10 连接） | 并发能力提升 10x | 3-5 天 |
| 添加 `tracing` 结构化日志 | 生产可观测性 | 1-2 天 |
| 核心路径单元测试（auth、rate limit） | 回归防护 | 3-4 天 |
| 修复 N+1 查询（changelog 批量加载） | 列表性能提升 | 2-3 天 |
| 列表 API 分页支持 | 大数据量可用 | 1-2 天 |

### Phase 3：成熟（1 个月）

| 项目 | 影响 | 工作量 |
|------|------|--------|
| CSP 移除 unsafe-inline | XSS 防护升级 | 1-2 天 |
| 前端资源打包压缩（21 个文件 → 3 个） | 加载速度提升 65% | 3-5 天 |
| ARIA 无障碍标签 | 可访问性合规 | 2-3 天 |
| 完整集成测试套件 | 全面回归防护 | 5-7 天 |
| Prometheus 指标 + 告警 | 运维成熟度 | 2-3 天 |

---

## 结论

**Next 是一个产品力优秀、安全基础扎实、文档堪称典范的项目。** 技术选型务实（Rust + SQLite + Vanilla JS），避免了过度工程化。当前状态完全适合 1-5 人团队日常使用。

主要瓶颈集中在**工程成熟度**（测试、CI/CD、可观测性）和**并发架构**（单连接锁）。这些不影响当前小规模使用，但在用户增长前需要解决。

按 Phase 1 → 2 → 3 顺序推进，预计总分可从 **7.3 → 8.5+**。

---

## 附录：关键文件引用

| 文件 | 涉及评估 |
|------|---------|
| `server/src/auth.rs` | 安全、后端（认证、限速、密码） |
| `server/src/main.rs` | 架构、安全、DevOps（路由、安全头、定时任务） |
| `server/src/state.rs` | 后端、安全（AppState、Mutex、限速缓存） |
| `server/src/db.rs` | 后端、DevOps（schema、迁移、备份） |
| `server/src/routes/todos.rs` | 架构、后端（759 行，N+1 查询，批量更新） |
| `server/src/routes/friends.rs` | 架构（730 行，好友+分享+联系人混合） |
| `server/src/services/claude.rs` | 安全、后端（AI 集成、工具循环限制） |
| `server/src/services/context.rs` | 安全（prompt 注入防护） |
| `server/src/services/tool_executor.rs` | 安全、后端（工具执行、时区 unwrap） |
| `frontend/assets/js/api.js` | 前端（379 行，40+ API 封装） |
| `frontend/assets/js/tasks.js` | 前端（991 行，渲染、CRUD、拖放） |
| `frontend/assets/js/drag.js` | 前端（315 行，鼠标+触摸统一拖放） |
| `frontend/assets/js/english.js` | 安全、前端（XSS 修复） |
| `frontend/sw.js` | 前端（Service Worker、Push、缓存） |
| `Dockerfile` | DevOps（多阶段构建、非 root 用户） |
| `fly.toml` | DevOps（区域、并发、健康检查、持久卷） |
