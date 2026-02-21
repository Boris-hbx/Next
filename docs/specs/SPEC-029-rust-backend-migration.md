# SPEC-029: Rust 后端迁移

> 起草日期: 2026-01-11
> 状态: 已完成 (2026-01-11)

## 概述

将 Flask (Python) 后端逻辑迁移至 Rust，利用 Tauri Commands 直接与前端通信，消除 HTTP 层开销，提升性能并简化部署。

## 背景

当前架构存在以下问题：

1. **双进程开销**: Tauri 需要启动并管理 Flask 子进程
2. **HTTP 通信延迟**: 前端通过 HTTP 与 Flask 通信，增加延迟
3. **启动延迟**: Flask 启动需要 1.5 秒等待时间
4. **文件 I/O 低效**: 每次操作都完整读写整个 JSON 文件
5. **线性搜索**: 无索引结构，查找任务需要 O(n) 遍历
6. **打包复杂度**: 需要 PyInstaller 打包 Flask，增加构建步骤

## 可迁移模块分析

### 优先级 1: 高收益、高可行性

| 模块 | 当前实现 | Rust 实现方案 | 预期收益 |
|------|----------|--------------|----------|
| **Todo 数据管理** | `read_todos()`, `save_todos()` ~50 行 | HashMap + 原子写入 | 5-10x 性能提升 |
| **Todo CRUD** | 创建/更新/删除 ~130 行 | Tauri Commands | 类型安全，零拷贝 |
| **搜索过滤** | `for item in items` O(n) | HashMap 索引 | O(1) 查找 |

### 优先级 2: 中等收益

| 模块 | 当前实现 | Rust 实现方案 | 预期收益 |
|------|----------|--------------|----------|
| **变更日志** | `record_changelog()` ~50 行 | VecDeque 固定容量 | 类型约束，性能提升 |
| **Routine 管理** | CRUD + 每日重置 ~80 行 | 同 Todo 模式 | 统一架构 |
| **名言管理** | 每次读文件 ~20 行 | 启动时加载到内存 | 消除重复 I/O |

### 优先级 3: 低收益、高可行性

| 模块 | 说明 |
|------|------|
| **数据校验** | serde 类型安全序列化 |
| **时间戳管理** | chrono crate 处理 |

## 性能对比预估

| 操作 | 当前 (Python/HTTP) | 迁移后 (Rust/IPC) | 提升 |
|------|-------------------|-------------------|------|
| 加载全部任务 | 50-100ms | 5-10ms | 5-10x |
| 更新单个任务 | 100-200ms | 10-20ms | 5-10x |
| 批量移动 (5项) | 500-1000ms | 50-100ms | 5-10x |
| JSON 解析 | 20-50ms | 2-5ms | 5-10x |
| 启动时间 | 1.5s+ | ~0ms | 消除 |

## 数据结构设计

```rust
// src-tauri/src/models/todo.rs

use serde::{Deserialize, Serialize};
use chrono::{DateTime, NaiveDate, Utc};
use std::collections::{HashMap, VecDeque};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Tab {
    Today,
    Week,
    Month,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Quadrant {
    ImportantUrgent,
    ImportantNotUrgent,
    NotImportantUrgent,
    NotImportantNotUrgent,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChangeEntry {
    pub field: String,
    pub label: String,
    pub old_value: String,
    pub new_value: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub content: String,
    pub tab: Tab,
    pub quadrant: Quadrant,
    pub progress: u8,  // 0-100
    pub completed: bool,
    pub completed_at: Option<DateTime<Utc>>,
    pub due_date: Option<NaiveDate>,
    pub assignee: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub changelog: VecDeque<ChangeEntry>,  // 最多 50 条
    pub deleted: bool,
    pub deleted_at: Option<DateTime<Utc>>,
}

pub struct TodoDb {
    items: HashMap<String, Todo>,
    file_path: PathBuf,
}
```

## Tauri Commands 设计

```rust
// src-tauri/src/commands/todos.rs

#[tauri::command]
pub fn get_todos(tab: Option<String>) -> Result<Vec<Todo>, String> {
    let db = TodoDb::load()?;
    match tab {
        Some(t) => Ok(db.filter_by_tab(&t)),
        None => Ok(db.all()),
    }
}

#[tauri::command]
pub fn create_todo(text: String, tab: String, quadrant: String) -> Result<Todo, String> {
    let mut db = TodoDb::load()?;
    let todo = Todo::new(text, tab.parse()?, quadrant.parse()?);
    db.insert(todo.clone());
    db.save()?;
    Ok(todo)
}

#[tauri::command]
pub fn update_todo(id: String, updates: serde_json::Value) -> Result<Todo, String> {
    let mut db = TodoDb::load()?;
    let todo = db.get_mut(&id).ok_or("Todo not found")?;
    todo.apply_updates(updates)?;
    todo.updated_at = Utc::now();
    db.save()?;
    Ok(todo.clone())
}

#[tauri::command]
pub fn delete_todo(id: String, permanent: bool) -> Result<(), String> {
    let mut db = TodoDb::load()?;
    if permanent {
        db.remove(&id);
    } else {
        let todo = db.get_mut(&id).ok_or("Todo not found")?;
        todo.deleted = true;
        todo.deleted_at = Some(Utc::now());
    }
    db.save()?;
    Ok(())
}

#[tauri::command]
pub fn batch_update_todos(updates: Vec<TodoUpdate>) -> Result<(), String> {
    let mut db = TodoDb::load()?;
    for update in updates {
        if let Some(todo) = db.get_mut(&update.id) {
            todo.apply_updates(update.changes)?;
        }
    }
    db.save()?;  // 单次写入处理所有更新
    Ok(())
}
```

## 前端改动

```javascript
// 从 HTTP fetch 迁移到 Tauri invoke

// 旧代码
async function loadItems() {
    const response = await fetch('/api/todos');
    const data = await response.json();
    allItems = data.items;
}

// 新代码
async function loadItems() {
    const { invoke } = window.__TAURI__.core;
    allItems = await invoke('get_todos', {});
}

// 旧代码
async function updateTask(id, updates) {
    await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
}

// 新代码
async function updateTask(id, updates) {
    const { invoke } = window.__TAURI__.core;
    await invoke('update_todo', { id, updates });
}
```

## 文件 I/O 优化

```rust
// src-tauri/src/db/mod.rs

impl TodoDb {
    /// 原子写入，防止数据损坏
    pub fn save(&self) -> Result<(), std::io::Error> {
        let temp_path = self.file_path.with_extension("tmp");
        let file = std::fs::File::create(&temp_path)?;
        let writer = std::io::BufWriter::new(file);
        serde_json::to_writer_pretty(writer, &self.to_json())?;
        std::fs::rename(&temp_path, &self.file_path)?;
        Ok(())
    }

    /// 带缓冲的读取
    pub fn load(file_path: &Path) -> Result<Self, std::io::Error> {
        let file = std::fs::File::open(file_path)?;
        let reader = std::io::BufReader::new(file);
        let data: TodosFile = serde_json::from_reader(reader)?;

        // 构建索引
        let mut items = HashMap::new();
        for item in data.items {
            items.insert(item.id.clone(), item);
        }

        Ok(Self { items, file_path: file_path.to_path_buf() })
    }
}
```

## 实施计划

### 阶段 1: 基础设施 (2-3 天)

1. 添加依赖到 `Cargo.toml`:
   - `chrono` (时间处理)
   - `uuid` (ID 生成)
   - 已有: `serde`, `serde_json`, `tauri`

2. 创建 Rust 模块结构:
   ```
   src-tauri/src/
   ├── main.rs
   ├── models/
   │   ├── mod.rs
   │   ├── todo.rs
   │   └── routine.rs
   ├── db/
   │   └── mod.rs
   └── commands/
       ├── mod.rs
       ├── todos.rs
       └── routines.rs
   ```

3. 实现数据结构和序列化

### 阶段 2: 核心 Commands (3-4 天)

1. 实现 Todo CRUD commands
2. 实现 changelog 记录逻辑
3. 实现 batch_update_todos
4. 单元测试

### 阶段 3: 前端迁移 (2-3 天)

1. 替换所有 `fetch('/api/todos...')` 为 `invoke(...)`
2. 保持 API 返回结构兼容
3. 测试所有交互场景

### 阶段 4: Routine 与清理 (2 天)

1. 实现 Routine commands
2. 实现 Quote commands
3. 移除 Flask 相关代码:
   - 删除 `backend/app.py`
   - 删除 Flask 进程管理代码 (`main.rs` 中)
   - 删除 `flask-backend.spec`
   - 更新 `build.bat`

### 阶段 5: 测试与优化 (2 天)

1. 性能测试对比
2. 边界情况测试
3. 错误处理完善

## 兼容性考虑

### 数据文件兼容
- JSON 结构保持不变
- 现有 `todos.json` 和 `routines.json` 无需迁移
- Rust 读取时处理缺失字段的默认值

### 前端兼容
- 抽象 API 层，便于切换
- 可保留 Flask 作为备选
- 浏览器访问仍可通过嵌入式 HTTP 服务器 (可选)

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Rust 学习曲线 | 模块化设计，逐步迁移 |
| 数据损坏 | 原子写入 + 备份机制 |
| 前端改动量大 | 封装 API 层，统一替换 |
| 调试困难 | 完善日志和错误处理 |

## 对可视化交互的影响

**结论: 无负面影响，可能有正面影响**

| 组件 | 技术 | 影响 |
|------|------|------|
| 呼吸线动画 | living-line.js (Canvas) | 无影响 - 纯前端 |
| 彗星小球效果 | CSS @keyframes | 无影响 - 纯前端 |
| 拖拽交互 | JS mousedown/mousemove | **正面** - API 响应更快，拖拽更流畅 |
| 主题切换 | CSS 变量 + JS | 无影响 - 纯前端 |
| 进度条/完成动画 | CSS transition | **正面** - 状态更新延迟降低 |
| Modal 弹窗动画 | CSS transform | 无影响 - 纯前端 |

前端代码改动仅限于 API 调用方式 (`fetch` → `invoke`)，所有动画和视觉效果逻辑保持不变。

## 收益总结

### 性能收益

1. **响应速度**: 5-10x 提升
2. **启动更快**: 消除 1.5 秒 Flask 启动等待
3. **包体积减小**: 不再需要 Python 运行时
4. **部署简化**: 单一可执行文件

### 安全收益

| 维度 | 当前 (Python/HTTP) | 迁移后 (Rust/IPC) |
|------|-------------------|-------------------|
| **本地端口暴露** | 开放 localhost:2026，任何本地程序可访问 | 无端口暴露，仅 Tauri IPC |
| **内存安全** | Python GC 管理，可能有内存泄漏 | Rust 所有权系统，编译时保证无内存泄漏 |
| **缓冲区溢出** | Python 层相对安全，但 C 扩展有风险 | Rust 编译时检查边界 |
| **类型混淆** | 动态类型，运行时才发现类型错误 | 静态类型，编译时拒绝非法类型 |
| **注入攻击** | JSON 解析后需手动校验 | serde 强制类型校验，非法数据无法反序列化 |
| **依赖供应链** | Python 生态依赖多，潜在漏洞多 | 依赖少 (serde, chrono)，Rust 生态审计严格 |
| **数据竞态** | 文件操作无原子保证 | 原子写入，防止并发损坏 |
| **运行时攻击面** | Python 解释器 + Flask + Werkzeug | 仅 Rust 二进制，攻击面大幅减小 |

**具体安全改进:**

1. **消除本地 HTTP 端口**
   - 当前: `localhost:2026` 对所有本地进程开放
   - 风险: 恶意软件可以调用 API 读取/篡改任务数据
   - 迁移后: Tauri IPC 仅限 WebView 进程间通信

2. **防止路径遍历**
   ```rust
   // Rust: 类型系统强制数据目录边界
   fn get_data_path() -> PathBuf {
       let base = dirs::data_local_dir().unwrap().join("Next");
       // 所有操作限制在此目录内
   }
   ```

3. **输入校验**
   ```rust
   // serde 自动拒绝非法输入
   #[derive(Deserialize)]
   pub struct TodoUpdate {
       pub progress: Option<u8>,  // 自动拒绝 > 255 或负数
       pub tab: Option<Tab>,      // 枚举限制合法值
   }
   ```

4. **错误处理**
   - Rust 的 `Result<T, E>` 强制处理所有错误路径
   - 不会意外泄露堆栈信息给前端

### 工程收益

1. **类型安全**: 编译时捕获数据结构错误
2. **维护简化**: 统一技术栈 (Rust + JS)
3. **调试体验**: Rust 编译错误信息比运行时错误更明确

## 决策点

1. **是否保留 HTTP 服务器**: 用于浏览器直接访问？
2. **是否使用 SQLite**: 替代 JSON 文件存储？
3. **分阶段发布还是一次性切换**？

## 参考

- [Tauri Commands 文档](https://tauri.app/develop/calling-rust/)
- [serde_json 文档](https://docs.rs/serde_json/)
- [chrono 文档](https://docs.rs/chrono/)
