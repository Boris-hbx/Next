# Backend (Rust / Axum)

> 后端模块职责、添加新功能指南、关键依赖

## 目录结构

```
server/
├── Cargo.toml              # 依赖管理
├── src/
│   ├── main.rs             # 入口：路由注册、中间件、ServeDir、备份调度
│   ├── auth.rs             # 认证：注册/登录/登出/改密码、UserId Extractor
│   ├── db.rs               # SQLite 初始化、CREATE TABLE、每日备份
│   ├── state.rs            # AppState { db: Arc<Mutex<Connection>> }
│   ├── models/
│   │   ├── mod.rs          # 模块导出
│   │   ├── todo.rs         # Todo 序列化/反序列化结构体
│   │   ├── routine.rs      # Routine 结构体
│   │   ├── review.rs       # Review 结构体
│   │   └── conversation.rs # Conversation/ChatMessage 结构体
│   ├── routes/
│   │   ├── mod.rs          # 路由导出
│   │   ├── todos.rs        # Todo CRUD: list/create/get/update/delete/restore/batch
│   │   ├── routines.rs     # Routine: list/create/delete/toggle
│   │   ├── reviews.rs      # Review: list/create/update/delete/complete
│   │   ├── quotes.rs       # 随机名言（读 data/quotes.txt）
│   │   ├── chat.rs         # 阿宝聊天入口 → ClaudeClient
│   │   └── conversations.rs# 对话列表/消息/删除/重命名/使用量
│   └── services/
│       ├── mod.rs          # 服务导出
│       ├── claude.rs       # Claude API 客户端，Tool Use 循环（最多5轮）
│       ├── context.rs      # 系统 Prompt 构建，注入用户任务概况
│       └── tool_executor.rs# AI Tool 实现（10个 tools）
└── data/                   # 本地开发数据（.gitignore）
```

## 添加新路由步骤

1. **定义 Handler** — 在 `routes/` 下新建或追加函数：
```rust
pub async fn my_handler(
    State(state): State<AppState>,  // 数据库访问
    user_id: UserId,                // 自动认证（声明即启用）
    Json(req): Json<MyRequest>,     // 请求体
) -> impl IntoResponse {
    let db = state.db.lock().unwrap();
    // 业务逻辑...
    Json(json!({ "success": true }))
}
```

2. **注册路由** — `main.rs` 中添加到对应的 Router：
```rust
let my_routes = Router::new()
    .route("/", get(routes::my_module::list).post(routes::my_module::create))
    .route("/{id}", put(routes::my_module::update).delete(routes::my_module::delete));

// 嵌套到 api_routes
let api_routes = Router::new()
    .nest("/my-resource", my_routes)
    // ...existing nests
```

3. **导出模块** — `routes/mod.rs` 加 `pub mod my_module;`

4. **建表**（如需）— `db.rs` 的 `create_tables()` 追加 CREATE TABLE

## AppState

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}
```

所有 Handler 通过 `State(state): State<AppState>` 注入。数据库操作需先 `state.db.lock().unwrap()` 获取连接。

**注意**: `Mutex` 意味着同一时刻只有一个请求能写库。对于当前用户规模足够。

## UserId Extractor

在 Handler 参数中声明 `user_id: UserId` 即自动启用认证。未登录请求会被拦截返回 401。

Auth 相关路由（register/login）不需要 UserId，直接处理。

## 关键依赖

| Crate | 用途 |
|-------|------|
| `axum 0.8` | Web 框架 |
| `tokio 1` (full) | 异步运行时 |
| `rusqlite 0.32` (bundled) | SQLite，自带编译 |
| `argon2 0.5` | 密码哈希 |
| `reqwest 0.12` (json) | HTTP 客户端（调 Claude API） |
| `serde / serde_json` | 序列化 |
| `chrono 0.4` | 日期时间 |
| `uuid 1` (v4) | ID 生成 |
| `tower-http 0.6` | ServeDir 静态文件、CORS、Header |
| `axum-extra 0.10` | Cookie 处理 |
| `hex 0.4` | Session Token 编码 |
| `rand 0.9` | 随机数（Salt、Token） |

## Release 优化

```toml
[profile.release]
panic = "abort"       # 不生成 unwind 代码
codegen-units = 1     # 全程序优化
lto = true            # 链接时优化
opt-level = "s"       # 优化体积
strip = true          # 去除符号
```
