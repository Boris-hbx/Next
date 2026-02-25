# SPEC-048: 阿宝全模块操作能力
> 起草日期: 2026-02-24
> 状态: 草稿

## 一、需求

让阿宝能根据自然语言指令操作所有模块：待办、例行、审视、学习笔记、记账。

用户会这样说：
- "把学习里面的 xxx 内容再优化一下，增加点关于 yyy 的内容"
- "待办里明天和张三沟通的事情，帮我改到下周五"
- "帮我看一下上周花了多少钱"
- "例行任务里加一个每天喝 2 升水"
- "把那个审视项改成每月一次"
- "删掉记账里昨天那笔星巴克"

## 二、现状分析

### 2.1 工具覆盖度

| 模块 | 创建 | 查询 | 更新 | 删除 | 缺口 |
|------|------|------|------|------|------|
| 待办 | create_todo | query_todos | update_todo | delete_todo | **无**（完整） |
| 例行 | create_routine | — | — | — | 查询/更新/删除 |
| 审视 | create_review | — | — | — | 查询/更新/删除 |
| 学习 | create_english_scenario | query_english_scenarios | — | — | 更新/删除 |
| 记账 | — | — | — | — | **全部** |
| 提醒 | create_reminder | query_reminders | snooze_reminder | cancel_reminder | **无**（完整） |

**缺少 15 个工具**。

### 2.2 上下文注入效率问题

当前 `context.rs` 的 `build_task_context()` 每次对话注入：

| 内容 | 最多条数 | 估算 tokens |
|------|---------|------------|
| 今日任务详情 | 15 条 | ~500 |
| 待分类任务 | 10 条 | ~300 |
| 即将到期 | 10 条 | ~300 |
| 协作任务 | 10 条 | ~300 |
| 待触发提醒 | 10 条 | ~300 |
| **合计** | | **~1,700** |

如果把例行、审视、学习、记账也全量注入，预估 **+2,000~3,000 tokens/轮**。按每次对话 5 轮、每天 20 次对话计算，一天多消耗 **200K~300K input tokens** — 不可接受。

### 2.3 MCP vs 原生 Tool Use

| 方案 | 优点 | 缺点 |
|------|------|------|
| MCP | 标准协议、可跨 AI provider | 需要独立 server、增加运维复杂度、本项目是单体应用没必要 |
| 原生 Tool Use | 零额外架构、已在用、延迟最低 | 仅限 Claude（但本项目只用 Claude） |

**结论**：继续用原生 Claude Tool Use，不引入 MCP。

## 三、设计方案

### 3.1 核心架构：轻上下文 + 重工具

```
┌────────────────────────────────┐
│       System Prompt            │
│  ┌──────────────────────────┐  │
│  │ 人格 + 行为规则（不变）    │  │  ~800 tokens（固定）
│  ├──────────────────────────┤  │
│  │ 轻量概况（仅数字摘要）    │  │  ~200 tokens（动态）
│  │  - 今天 5 个待办（3 已完成）│  │
│  │  - 8 个例行（6 已完成）    │  │
│  │  - 12 个审视项             │  │
│  │  - 本月已花 CA$1,203.50    │  │
│  │  - 23 条学习笔记           │  │
│  └──────────────────────────┘  │
│                                │
│  当用户说"帮我看看上周花了多少"│
│  → Claude 调 query_expenses   │
│  → 工具返回具体数据           │
│  → Claude 回答                │
│                                │
│  而不是每次都把所有记账数据    │
│  塞进 system prompt            │
└────────────────────────────────┘
```

**原则**：
1. **System prompt 只给摘要数字**（各模块的条数/金额），不给具体条目
2. **具体数据按需查询** — Claude 通过 query 工具拿到需要的数据
3. **今日待办保留详情注入** — 因为待办是核心模块，且用户大部分问题关于待办，注入详情可以减少一轮 tool call（省 output tokens + 延迟）
4. **其他模块只注入计数** — 需要时 Claude 自己用 query 工具查

### 3.2 新增工具清单

#### 例行 (Routine)

| 工具 | 说明 | 参数 |
|------|------|------|
| `query_routines` | 查询例行任务列表 | keyword? |
| `update_routine` | 更新例行任务文本 | id, text |
| `delete_routine` | 删除例行任务 | id |

#### 审视 (Review)

| 工具 | 说明 | 参数 |
|------|------|------|
| `query_reviews` | 查询审视项列表 | keyword?, frequency? |
| `update_review` | 更新审视项 | id, text?, frequency?, frequency_config?, notes?, category? |
| `delete_review` | 删除审视项 | id |

#### 学习 (English/Learning)

| 工具 | 说明 | 参数 |
|------|------|------|
| `update_english_scenario` | 更新学习笔记内容 | id, title?, content?, notes?, category? |
| `delete_english_scenario` | 删除学习笔记 | id |

#### 记账 (Expense)

| 工具 | 说明 | 参数 |
|------|------|------|
| `create_expense` | 创建记账记录 | amount, date?, notes?, tags?, currency? |
| `query_expenses` | 查询记账记录 | date_from?, date_to?, tag?, keyword?, limit? |
| `update_expense` | 更新记账记录 | id, amount?, date?, notes?, tags?, currency? |
| `delete_expense` | 删除记账记录 | id |
| `get_expense_summary` | 获取记账统计 | period (week/month/year), currency? |

**总计新增 13 个工具**。加上 `create_routine` 和 `create_review` 已有，全模块 CRUD 完整。

### 3.3 上下文注入改造

#### 改造前（context.rs `build_task_context`）

```
## 今日任务
- [x] <task>写周报</task> (ID:abc123, 泳道:重要紧急, 进度:100%)
- [ ] <task>准备面试</task> (ID:def456, 泳道:重要不紧急, 进度:30%)
... 最多 15 条完整详情

## 待分类
... 最多 10 条

## 即将到期
... 最多 10 条

## 协作任务
... 最多 10 条

## 待触发提醒
... 最多 10 条
```

~1,700 tokens

#### 改造后

```
## 数据概况
- 待办: 今天 5 个（3 已完成），本周 12 个，3 个即将到期
- 例行: 今天 8 个（6 已完成）
- 审视: 12 个事项（2 个逾期）
- 学习: 23 条笔记
- 记账: 本月已花 CA$1,203.50（28 笔）
- 提醒: 3 个待触发

## 今日待办（核心）
- [ ] 准备面试 (ID:def456, 进度:30%, 截止:明天)
- [ ] 和张三沟通 (ID:ghi789, 截止:2026-02-25)
- [x] 写周报 (ID:abc123)
... 最多 10 条
```

~600 tokens（减少 65%）

**关键变化**：
- 例行/审视/学习/记账只有一行计数摘要
- 今日待办保留详情（但减少到 10 条）
- 移除待分类、协作任务、提醒的详情列表（需要时 Claude 用 query 工具查）

### 3.4 System Prompt 新增工具指引

在现有 `## 关键：何时使用 tool` 部分追加：

```
## 例行
- 用户说"加一个例行/每天做" → create_routine
- 用户说"例行有哪些/今天例行完成情况" → query_routines
- 用户说"改一下那个例行/不叫这个了" → 先 query_routines 找到 ID，再 update_routine
- 用户说"删掉那个例行" → 先 query_routines 找到 ID，再 delete_routine

## 审视
- 用户说"加一个审视项" → create_review
- 用户说"审视有哪些/哪些逾期" → query_reviews
- 用户说"改成每月一次" → 先 query_reviews 找到 ID，再 update_review
- 用户说"删掉那个审视" → 先 query_reviews 找到 ID，再 delete_review

## 学习
- 用户说"创建学习场景" → create_english_scenario
- 用户说"学习有哪些/查一下" → query_english_scenarios
- 用户说"优化一下xxx的内容/加点yyy" → 先 query_english_scenarios 找到 ID 和内容，在原内容基础上修改，再 update_english_scenario
- 用户说"删掉那个学习笔记" → 先 query_english_scenarios 找到 ID，再 delete_english_scenario

## 记账
- 用户说"记一笔/花了/买了" → create_expense
- 用户说"上周花了多少/本月消费" → get_expense_summary
- 用户说"查一下最近的记账/星巴克花了多少" → query_expenses
- 用户说"改一下那笔/金额不对" → 先 query_expenses 找到 ID，再 update_expense
- 用户说"删掉那笔记账" → 先 query_expenses 找到 ID，再 delete_expense
```

### 3.5 前端 UI 刷新

`abao.js` 现有逻辑：检测 tool_calls 中包含 todo 相关工具时刷新任务列表。需扩展：

| 工具名包含 | 刷新动作 |
|-----------|---------|
| `todo` / `batch_update` | `loadItems()` |
| `routine` | `loadRoutines()` |
| `review` | `loadReviews()` |
| `english_scenario` | `English.init()` (重新加载学习列表) |
| `expense` | `Expense.init()` (重新加载记账列表) |
| `reminder` | （已有逻辑） |

### 3.6 学习笔记"优化内容"的特殊流程

用户说"把银行开户的内容优化一下，加点关于信用卡的" 时，Claude 需要：

1. `query_english_scenarios({keyword: "银行开户"})` → 拿到 ID + 现有 content
2. 在现有 content 基础上重写/扩展（Claude 自己的语言能力）
3. `update_english_scenario({id: "xxx", content: "新内容..."})` → 写回

**关键**：`query_english_scenarios` 的返回值需要包含 `content` 字段（当前只返回 title + id，不返回完整内容）。需要增加 `include_content: true` 参数或新增 `get_english_scenario(id)` 工具。

**方案**：为简化，给 `query_english_scenarios` 添加可选参数 `include_content`（默认 false）。当 Claude 需要修改内容时，先查询带 `include_content: true` 获取完整内容。

### 3.7 页面感知上下文（Page-aware Context）

用户在任意页面召唤阿宝，阿宝自动感知当前页面和打开的详情：

```
前端 sendMessage() 附带:
{
    message: "这个数字好像不对",
    page_context: { page: "expense", detail_id: "abc123" }
}

后端 build_system_prompt_with_page() 注入:
## 用户当前页面: 记账
正在查看账单: CA$5.50 2026-02-23 (ID:abc123, 备注:星巴克)
```

| 页面 | 注入内容 |
|------|---------|
| 待办 | 当前任务详情（文本、进度、截止日期） |
| 学习 | 笔记标题 + 内容预览（前 300 字） |
| 记账 | 金额、日期、备注、币种 |
| 其他页面 | 仅标注页面名（无详情） |

## 四、改动清单

> 状态: 已实施

### 后端

| 文件 | 改动 |
|------|------|
| `server/src/services/tool_executor.rs` | 新增 13 个工具实现 + 定义，query_english_scenarios 增加 include_content |
| `server/src/services/context.rs` | 重写 build_task_context() 为轻量摘要，新增 build_page_context() |
| `server/src/routes/chat.rs` | ChatRequest 新增 page_context 字段，传递给 build_system_prompt_with_page() |

### 前端

| 文件 | 改动 |
|------|------|
| `frontend/assets/js/abao.js` | 新增 getPageContext()，扩展 refreshTasksIfNeeded() 支持全模块刷新 |
| `frontend/assets/js/expense.js` | 导出 getCurrentDetailId() |
| `frontend/assets/js/english.js` | 导出 getCurrentId() |

### 新增工具实现细节

#### query_routines
```rust
fn tool_query_routines(db: &Connection, user_id: &str, input: &Value) -> Value {
    // SELECT id, text, completed_today FROM routines WHERE user_id = ?
    // keyword 过滤: WHERE text LIKE '%keyword%'
    // 返回: { success: true, items: [...], total: N }
}
```

#### update_routine
```rust
fn tool_update_routine(db: &Connection, user_id: &str, input: &Value) -> Value {
    // UPDATE routines SET text = ? WHERE id = ? AND user_id = ?
}
```

#### delete_routine
```rust
fn tool_delete_routine(db: &Connection, user_id: &str, input: &Value) -> Value {
    // DELETE FROM routines WHERE id = ? AND user_id = ?
}
```

#### query_reviews
```rust
fn tool_query_reviews(db: &Connection, user_id: &str, input: &Value) -> Value {
    // SELECT id, text, frequency, frequency_config, notes, category, last_completed, next_due
    // 过滤: keyword, frequency
    // 计算 due_status
}
```

#### update_review
```rust
fn tool_update_review(db: &Connection, user_id: &str, input: &Value) -> Value {
    // UPDATE review_items SET text=?, frequency=?, ... WHERE id=? AND user_id=?
}
```

#### delete_review
```rust
fn tool_delete_review(db: &Connection, user_id: &str, input: &Value) -> Value {
    // DELETE FROM review_items WHERE id=? AND user_id=?
}
```

#### update_english_scenario
```rust
fn tool_update_english_scenario(db: &Connection, user_id: &str, input: &Value) -> Value {
    // UPDATE english_scenarios SET title=?, content=?, notes=?, category=? WHERE id=? AND user_id=?
    // 只更新传入的字段
}
```

#### delete_english_scenario
```rust
fn tool_delete_english_scenario(db: &Connection, user_id: &str, input: &Value) -> Value {
    // DELETE FROM english_scenarios WHERE id=? AND user_id=?
}
```

#### create_expense
```rust
fn tool_create_expense(db: &Connection, user_id: &str, input: &Value) -> Value {
    // INSERT INTO expense_entries (id, user_id, amount, date, notes, tags, currency, ...)
}
```

#### query_expenses
```rust
fn tool_query_expenses(db: &Connection, user_id: &str, input: &Value) -> Value {
    // SELECT ... FROM expense_entries WHERE user_id=?
    // 过滤: date_from, date_to, tag, keyword
    // limit 默认 20
}
```

#### update_expense
```rust
fn tool_update_expense(db: &Connection, user_id: &str, input: &Value) -> Value {
    // UPDATE expense_entries SET amount=?, date=?, notes=?, tags=?, currency=? WHERE id=? AND user_id=?
}
```

#### delete_expense
```rust
fn tool_delete_expense(db: &Connection, user_id: &str, input: &Value) -> Value {
    // DELETE FROM expense_entries WHERE id=? AND user_id=?
}
```

#### get_expense_summary
```rust
fn tool_get_expense_summary(db: &Connection, user_id: &str, input: &Value) -> Value {
    // 根据 period 计算日期范围
    // SELECT SUM(amount), COUNT(*), currency FROM expense_entries WHERE user_id=? AND date BETWEEN ?
    // 按 tag 分组统计
    // 返回: { total_cad, total_cny, count, by_tag: {...} }
}
```

## 五、Token 预算对比

| 场景 | 改造前 | 改造后 | 节省 |
|------|--------|--------|------|
| System prompt context | ~1,700 | ~600 | 65% |
| "帮我加个待办" | 1 轮 tool call | 1 轮 tool call | 相同 |
| "帮我看看上周花了多少" | 不支持 | 1 轮 query | N/A（新功能） |
| "优化学习笔记内容" | 不支持 | 2 轮 (query + update) | N/A（新功能） |
| 日常对话（不涉及操作） | 省 1,100 input tokens | — | 每轮省 1,100 |

## 六、不做的事

1. **不引入 MCP** — 本项目是单体应用，原生 tool use 更简单高效
2. **不做意图分类预处理** — Claude 自己就能判断用哪个工具，不需要额外的分类器
3. **不注入学习笔记/记账的详细列表到 system prompt** — 数据量大，按需查询
4. **不改变现有待办工具的接口** — 向后兼容
5. **不做流式工具调用** — 当前的多轮 tool use 循环已经够用

## 七、实施分期

### Phase 1: 工具实现（后端）
- 新增 13 个工具函数 + 定义
- 改造 context.rs 上下文注入
- 更新 system prompt 工具指引

### Phase 2: 前端刷新（前端）
- abao.js 扩展刷新逻辑
- 可选：工具调用结果卡片（记账卡片、学习笔记卡片等）

### Phase 3: 测试验证
- 编写测试用例文档
- 全场景测试
