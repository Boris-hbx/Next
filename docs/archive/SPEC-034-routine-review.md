# SPEC-034: 例行审视

> 起草日期: 2026-02-13
> 状态: 草稿

## 1. 背景

现有"例行"功能仅支持每日任务（toggle today，次日自动重置）。实际工作和生活中，需要管理不同频率的周期性事务：

| 频率 | 示例 |
|------|------|
| 每日 | 晨会打卡、日报总结、每日锻炼 |
| 每周 | 周报、代码审查、周复盘 |
| 每月 | 信用卡账单、房租、月度汇报 |
| 每年 | 老婆生日、结婚纪念日、年度体检 |

新增"例行审视"模块，在左侧栏 Todo 下方，提供一个独立的周期任务管理视图。

---

## 2. 导航与入口

### 左侧栏结构

```
┌──────────────────────┐
│  📋 Todo         ← active │   ← 现有
│  🔄 例行审视            │   ← 新增
│                        │
│  ... (spacer)          │
│  ┌──────────────────┐  │
│  │ 时区面板          │  │
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │ 桌面宠物          │  │
│  └──────────────────┘  │
└──────────────────────┘
```

- 点击 `Todo` → 主区域显示四象限任务管理（现有）
- 点击 `例行审视` → 主区域切换为例行审视面板
- 两个入口互斥高亮（active 状态）

### 与现有"例行"按钮的关系

现有 `.btn-routine`（tab 栏左侧的"例行"按钮）保持不变，作为**每日例行**的快捷入口。
"例行审视"是完整管理面板，覆盖全部频率。

---

## 3. 数据模型

### 3.1 ReviewItem（Rust 后端）

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: String,                          // 8 位唯一 ID
    pub text: String,                        // 事项描述
    pub frequency: Frequency,                // 频率
    pub frequency_config: FrequencyConfig,   // 频率详细配置
    #[serde(default)]
    pub notes: String,                       // 备注
    #[serde(default)]
    pub category: String,                    // 分类标签
    #[serde(default)]
    pub last_completed: Option<String>,      // 最近一次完成时间 (ISO)
    #[serde(default)]
    pub next_due: Option<String>,            // 下次到期日 (YYYY-MM-DD)
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub paused: bool,                        // 暂停（不参与到期计算）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyConfig {
    /// 每周几 (1=周一 ... 7=周日)，Weekly 时使用
    #[serde(default)]
    pub day_of_week: Option<u8>,
    /// 每月几号 (1-31)，Monthly 时使用
    #[serde(default)]
    pub day_of_month: Option<u8>,
    /// 月份 (1-12)，Yearly 时使用
    #[serde(default)]
    pub month: Option<u8>,
    /// 日期 (1-31)，Yearly 时使用
    #[serde(default)]
    pub day: Option<u8>,
}
```

### 3.2 到期计算规则

| 频率 | 判定为"到期" | 判定为"已完成本周期" |
|------|-------------|---------------------|
| Daily | 每天 | `last_completed` 是今天 |
| Weekly | 本周的 `day_of_week` 当天及之后 | `last_completed` 在本周 `day_of_week` 当天或之后 |
| Monthly | 本月的 `day_of_month` 当天及之后 | `last_completed` 在本月 `day_of_month` 当天或之后 |
| Yearly | 今年的 `month/day` 前后 7 天窗口内 | `last_completed` 在今年该日期 ±7 天窗口内 |

### 3.3 到期状态 (DueStatus)

```rust
pub enum DueStatus {
    Overdue,    // 已过期未完成（红色）
    DueToday,   // 今天到期（橙色）
    DueSoon,    // 3天内到期（蓝色）
    Upcoming,   // 未来到期（灰色）
    Completed,  // 本周期已完成（绿色）
    Paused,     // 已暂停（灰色虚线）
}
```

### 3.4 存储

- 文件: `%LOCALAPPDATA%\Next\data\reviews.json`
- 格式: `ReviewItem[]`
- 与 `routines.json` 独立（向后兼容，现有每日例行不受影响）

---

## 4. Tauri Commands

| 命令 | 功能 | 参数 |
|------|------|------|
| `get_reviews` | 获取所有审视项（含计算后的 due_status） | — |
| `create_review` | 创建审视项 | `{ text, frequency, frequency_config, notes?, category? }` |
| `update_review` | 更新审视项 | `{ id, ...fields }` |
| `complete_review` | 标记完成（更新 last_completed + 计算 next_due） | `{ id }` |
| `uncomplete_review` | 取消本周期完成 | `{ id }` |
| `delete_review` | 删除审视项 | `{ id }` |
| `pause_review` | 暂停/恢复 | `{ id, paused: bool }` |
| `import_routines` | 将现有每日例行导入为审视项 | — |

---

## 5. 前端 UI

### 5.1 主视图布局

替换四象限区域（当 sidebar 选中"例行审视"时），整体风格与 Todo 一致。

```
┌──────────────────────────────────────────────────┐
│  [+ 新建]                                 [筛选▾] │  ← 顶栏
├──────────────────────────────────────────────────┤
│                                                  │
│  ⚠ 待处理 (3)                                    │  ← 到期/过期项（高亮卡片）
│  ┌────────────────────────────────────────────┐  │
│  │ ☐ 日报总结                     每日 · 待处理 │  │
│  │ ☐ 信用卡账单          每月15号 · ⚠ 明天到期 │  │
│  │ ☐ 周报               每周五 · 📅 3天后到期  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ────────── 每日例行 ──────────                   │
│  ☑ 晨会打卡                          ✓ 已完成    │
│  ☐ 日报总结                          ⚠ 待处理    │
│  ☐ 每日锻炼                          ⚠ 待处理    │
│                                                  │
│  ────────── 每周例行 ──────────                   │
│  ☐ 周报 (周五)                       📅 3天后    │
│  ☑ 代码审查 (周三)                   ✓ 本周已完成 │
│                                                  │
│  ────────── 每月例行 ──────────                   │
│  ☐ 信用卡账单 (15号)                 ⚠ 明天到期   │
│  ☐ 房租 (1号)                        📅 18天后   │
│                                                  │
│  ────────── 每年例行 ──────────                   │
│  ☐ 老婆生日 (3/14)                   📅 29天后   │
│  ☐ 结婚纪念日 (6/20)                 📅 127天后  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**视图特点：**
- 顶部：**待处理区**（聚合所有到期/即将到期项），红/橙色高亮
- 下方：按频率分组的完整列表
- 已完成项：复选框打勾 + 文字变灰 + 划线
- 暂停项：虚线边框 + 灰色

### 5.2 单项交互

```
┌──────────────────────────────────────────────┐
│ ☐  老婆生日              每年3/14 · 📅 29天后 │
│     备注: 提前订花                    [⋯] ▾  │
└──────────────────────────────────────────────┘
     点击 ☐ → 标记完成
     点击文字 → 展开编辑
     点击 [⋯] → 更多操作（编辑/暂停/删除）
```

### 5.3 新建/编辑弹窗

```
┌────────────────────────────────────┐
│  新建例行事项                   [×] │
├────────────────────────────────────┤
│                                    │
│  事项名称                          │
│  ┌──────────────────────────────┐  │
│  │ 信用卡还款                    │  │
│  └──────────────────────────────┘  │
│                                    │
│  重复频率                          │
│  [每日] [每周] [每月●] [每年]      │
│                                    │
│  具体日期                          │
│  ┌───────────┐                    │
│  │ 每月 15 号 │  ← 根据频率动态    │
│  └───────────┘                    │
│                                    │
│  分类（可选）                       │
│  ┌──────────────────────────────┐  │
│  │ 财务                         │  │
│  └──────────────────────────────┘  │
│                                    │
│  备注（可选）                       │
│  ┌──────────────────────────────┐  │
│  │ 招行信用卡，自动扣款          │  │
│  └──────────────────────────────┘  │
│                                    │
│           [取消]  [保存]           │
└────────────────────────────────────┘
```

**频率选择联动：**
| 频率 | 日期配置 UI |
|------|------------|
| 每日 | 无额外配置 |
| 每周 | 7 个按钮选择周几（周一 ~ 周日） |
| 每月 | 数字输入框（1-31） |
| 每年 | 月份选择 + 日期输入（如 3月14日） |

### 5.4 筛选

顶栏筛选下拉：
- 全部
- 仅待处理
- 按频率（每日/每周/每月/每年）
- 按分类

---

## 6. 右侧栏联动

右侧栏"待处理"下方可选展示"今日例行"摘要：

```
┌──────────────────────────┐
│ 🔄 今日例行        2/5 ✓ │  ← 折叠式
├──────────────────────────┤
│ ☐ 日报总结                │
│ ☐ 每日锻炼                │
│ ☑ 晨会打卡                │
│ ☐ 信用卡还款 (今天15号)   │
│ ☑ 周报 (今天周五)         │
└──────────────────────────┘
```

这让用户在 Todo 视图下也能快速瞥见今日例行状态，无需切换页面。

---

## 7. 技术架构

### 7.1 文件结构变更

```
src-tauri/src/
├── models/
│   ├── mod.rs            # 添加 review 模块导出
│   ├── review.rs         # 新增: ReviewItem, Frequency, FrequencyConfig, DueStatus
│   └── ...
├── commands/
│   ├── mod.rs            # 添加 reviews 模块导出
│   ├── reviews.rs        # 新增: CRUD + complete/pause 命令
│   └── ...
└── main.rs               # 注册新命令, 初始化 review_db

frontend/assets/
├── js/
│   ├── api.js            # 添加 Review API 方法
│   ├── app.js            # 添加页面切换逻辑 (todo ↔ review)
│   ├── review.js         # 新增: 例行审视渲染、交互逻辑
│   └── ...
├── css/
│   ├── style.css         # 添加 review 页面布局样式
│   └── components.css    # 添加 review 组件样式
└── ...

frontend/index.html        # 添加 sidebar 导航项 + review 主视图 HTML

data/
└── reviews.json           # 新增: 开发数据
```

### 7.2 页面切换机制

```javascript
// app.js 扩展
var currentPage = 'todo'; // 'todo' | 'review'

function switchPage(page) {
    currentPage = page;
    // 切换 sidebar active 状态
    document.querySelectorAll('.nav-link').forEach(function(el) {
        el.classList.toggle('active', el.dataset.page === page);
    });
    // 切换主内容区
    document.getElementById('todo-view').style.display = page === 'todo' ? '' : 'none';
    document.getElementById('review-view').style.display = page === 'review' ? '' : 'none';
}
```

### 7.3 JS 加载顺序

```
api.js → utils.js → app.js → tasks.js → modal.js →
review.js → drag.js → touch.js → routines.js → features.js → ...
```

---

## 8. 迁移策略

### 现有 routines.json → reviews.json

提供 `import_routines` 命令：
1. 读取 `routines.json` 所有项
2. 转换为 `ReviewItem`（frequency = Daily，无 frequency_config）
3. 写入 `reviews.json`
4. 原 `routines.json` 保留不动（现有"例行"按钮继续使用）

未来版本可考虑合并两者，但 v1 保持独立以降低风险。

---

## 9. 实施阶段

### Phase 1: 后端 (Rust)
1. 定义 `ReviewItem` 模型（`models/review.rs`）
2. 实现 `review_db` JSON 持久化
3. 实现 Tauri Commands（CRUD + complete + pause）
4. 到期状态计算逻辑
5. 在 `main.rs` 注册命令

### Phase 2: 前端框架
1. 左侧栏添加"例行审视"导航项
2. `app.js` 添加 page 切换逻辑
3. `index.html` 添加 `#review-view` 容器
4. `api.js` 添加 Review API

### Phase 3: 审视主视图
1. `review.js` — 渲染按频率分组的列表
2. 待处理区（到期/即将到期聚合）
3. 完成/取消完成交互
4. 到期状态着色

### Phase 4: 新建/编辑
1. 新建弹窗 UI
2. 频率选择联动（日期配置根据频率变化）
3. 编辑弹窗

### Phase 5: 右侧栏联动
1. 右侧栏"今日例行"摘要区块
2. Todo 视图下快速查看今日例行状态

### Phase 6: 增强
1. 分类筛选
2. 数据迁移（import_routines）
3. 暂停/恢复功能
4. 到期提醒（系统通知，可选）

---

## 10. 验证清单

- [ ] 左侧栏显示 "Todo" 和 "例行审视"，点击可切换
- [ ] 例行审视主视图按频率分组展示
- [ ] 待处理区正确聚合到期项
- [ ] 新建事项：选择频率后联动日期配置
- [ ] 完成操作：更新 last_completed + 刷新视图
- [ ] 每日项：次日自动变为待处理
- [ ] 每周项：跨周自动变为待处理
- [ ] 每月项：跨月自动变为待处理
- [ ] 每年项：年度日期窗口内高亮
- [ ] 右侧栏摘要正确显示今日例行状态
- [ ] 暂停项灰色显示，不参与到期计算
- [ ] 数据持久化到 reviews.json
