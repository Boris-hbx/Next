# SPEC-043: 「此刻」— 阿宝顶栏一句话
> 起草日期: 2026-02-21
> 状态: 草稿

## 概述

手机端顶栏左侧完全空白。让阿宝根据当前任务上下文，生成一句像老朋友随口说的话，显示在这里。

**不是模板拼接，是阿宝真的在看你的任务然后说一句话。**

```
┌──────────────────────────────────────────┐
│  ☀ 今天两件急的，先看看？        🔔  👤 │  ← 48px 顶栏
└──────────────────────────────────────────┘
  ↑                                 ↑   ↑
  阿宝生成的「此刻」文案          铃铛  头像
```

## 设计理念

来自"林诗意"浪漫主义方案「此刻」：

> 顶栏不是导航，是一扇窗——让你每次打开 App，先看见此刻的自己。

但我们不用前端模板假装聪明——阿宝真的读了你的任务、看了现在几点、知道你有几件急事，然后**像了解你日程的老朋友一样随口说一句**。

## 架构

```
用户打开 App / 15分钟定时刷新
  │
  ▼
前端 GET /api/moment
  │
  ▼
后端检查内存缓存（15分钟有效）
  ├── 命中 → 直接返回 { text, cached: true }
  │
  └── 未命中 ↓
      │
      ├── 1. 查 DB：用户名、任务数、紧急数、逾期数、最近截止日
      ├── 2. 组装轻量上下文（~6 条 SQL）
      ├── 3. Claude simple_generate（无 tools、无对话历史、max_tokens: 100）
      ├── 4. 写入缓存
      └── 5. 返回 { text, cached: false }
  │
  ▼
前端收到 → 淡入显示（0.3s）
Claude 失败 → 返回时段问候 fallback（"上午好"/"晚上好"）
```

## 阿宝「此刻」专用 Prompt

这是一个**独立于主对话的专用 prompt**，不使用 tools，不继承对话历史，严格约束输出。

```
你是阿宝，嵌在"Next"任务管理应用中。

现在你需要生成一句"此刻"文案——显示在手机顶栏的一句话，
像一个了解你日程的老朋友随口说的一句。

## 规则（严格遵守）
- 最多15个汉字，不超过20个字符（含标点）
- 不用感叹号，不用"加油"、"你真棒"、"辛苦了"
- 不用 emoji
- 口语化、自然、松弛
- 一句话，不换行

## 语气指南
- 有紧急的事 → 直说："有两件急的，先看看？"
- 有逾期的事 → 轻描淡写："有件事等你回来"
- 全做完了 → 表达轻松："都清了，歇会儿"
- 没什么事 → 随意："今天挺清闲的"
- 深夜（23:00-5:00）→ 温和："夜深了，明天再说"
- 早晨（6:00-9:00）→ 清爽："早，今天X件事"
- 名字只在有事提醒时偶尔用，不要每次都叫

## 反例（绝对不要）
- "今天也要元气满满哦！"
- "加油，你可以的！"
- "辛苦了，注意休息～"
- "新的一天，新的开始！"

只输出那一句话，不要任何解释或前缀。
```

**User message 格式**（注入上下文）：

```
当前时间: 2026-02-21 14:30 (Friday)
用户: Boris
今日任务: 5 个，已完成 2
紧急(Q1): 2 个未完成
逾期: 1 个
最近截止: 2026-02-22

请生成此刻文案。
```

## 可控性设计

| 维度 | 机制 | 说明 |
|------|------|------|
| **成本** | 15分钟缓存 | 每用户每小时最多 4 次 Claude 调用，~150+30 tokens/次，约 $0.001/天/用户 |
| **延迟** | fallback + 异步 | 缓存命中 <5ms；未命中时先显示本地 fallback，1-2s 后淡入 AI 文案 |
| **失败兜底** | 时段问候 | Claude 不可用时返回"上午好"/"晚上好"等，永不空白 |
| **内容安全** | 专用 prompt | 严格约束长度/风格，无 tools，无对话历史，不可能跑偏 |
| **刷新时机** | 三重触发 | 页面加载 + 15分钟定时器 + visibilitychange（切回前台时） |

## API 设计

### `GET /api/moment`

**请求**：无 body，认证通过 session cookie

**响应**：
```json
{
  "success": true,
  "text": "今天两件急的，先看看？",
  "cached": true
}
```

**Fallback（Claude 失败时）**：
```json
{
  "success": true,
  "text": "下午好",
  "cached": false
}
```

## 后端改动

### 1. `server/src/services/claude.rs` — 新增 `simple_generate()`

轻量一次性调用，无 tools、无对话循环：

```rust
pub async fn simple_generate(
    &self,
    system: &str,
    user_message: &str,
    max_tokens: u32,
) -> Result<String, String>
```

- timeout: 10s（比 chat 的 30s 短）
- 不记 token 用量（保持简单）
- 返回纯文本 String

### 2. `server/src/services/context.rs` — 新增轻量上下文

```rust
pub struct MomentContext {
    pub display_name: String,
    pub hour: u32,                // 0-23，用于 fallback
    pub now_formatted: String,    // "2026-02-21 14:30 (Friday)"
    pub today_total: i64,
    pub today_done: i64,
    pub urgent_count: i64,        // Q1 未完成
    pub overdue_count: i64,       // due_date < today 且未完成
    pub next_due: Option<String>, // 最近的截止日期
}
```

新增函数：
- `build_moment_context(db, user_id) -> MomentContext` — 6 条轻量 SQL
- `build_moment_system_prompt() -> &'static str` — 上面的 prompt
- `build_moment_user_message(ctx) -> String` — 格式化为 user message

### 3. `server/src/state.rs` — 加缓存字段

```rust
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub moment_cache: Arc<Mutex<HashMap<String, (String, chrono::DateTime<chrono::Utc>)>>>,
}
```

### 4. `server/src/routes/moment.rs` — **新建**

Handler 逻辑：
1. 检查 `moment_cache`，命中且 <15min → 直接返回
2. 锁 DB，调 `build_moment_context`，**释放 DB 锁**
3. 异步调 `ClaudeClient::simple_generate`
4. 成功 → 写缓存 → 返回；失败 → 返回 fallback

**关键**：DB 锁必须在 await 之前释放，否则跨 await 持锁会 panic。

### 5. `server/src/routes/mod.rs` — 加 `pub mod moment;`

### 6. `server/src/main.rs` — 注册路由 + 初始化缓存

```rust
.route("/moment", get(routes::moment::get_moment))
```

## 前端改动

### 7. `frontend/index.html` — header-left 内容

```html
<div class="header-left">
    <span class="moment-icon" id="moment-icon"></span>
    <span class="moment-text" id="moment-text"></span>
</div>
```

底部初始化处加：
```javascript
Moment.load();
Moment.startAutoRefresh();
```

### 8. `frontend/assets/js/api.js` — 加 `getMoment()`

```javascript
getMoment: async function() {
    return await request('GET', '/moment');
},
```

### 9. `frontend/assets/js/app.js` — 加 `Moment` 模块

```javascript
var Moment = (function() {
    var _lastLoadTime = 0;
    var REFRESH_INTERVAL = 15 * 60 * 1000;

    function getTimeIcon() {
        var h = new Date().getHours();
        return (h >= 6 && h < 18) ? '☀' : '🌙';
    }

    function getFallbackText() { /* 按时段返回问候 */ }

    async function load() {
        setIcon();
        if (!getText()) setText(getFallbackText()); // 首次显示 fallback
        try {
            var data = await API.getMoment();
            if (data.success && data.text) fadeInText(data.text);
        } catch(e) {}
        _lastLoadTime = Date.now();
    }

    function startAutoRefresh() { setInterval(load, REFRESH_INTERVAL); }

    // 切回前台时刷新
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && Date.now() - _lastLoadTime > REFRESH_INTERVAL) load();
    });

    return { load, startAutoRefresh, refreshIfStale };
})();
```

### 10. `frontend/assets/js/tasks.js` — loadItems 后触发

```javascript
if (typeof Moment !== 'undefined') Moment.refreshIfStale();
```

### 11. `frontend/assets/css/style.css` — moment 样式

```css
.moment-icon { font-size: 14px; line-height: 1; }
.moment-text {
    font-size: 13px;
    color: rgba(255,255,255,0.85);
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
    transition: opacity 0.3s ease;
}
```

### 12. `frontend/assets/css/mobile.css` — 移动端适配

```css
.moment-text { max-width: 160px; font-size: 13px; }
```

## 实施顺序

1. 后端：claude.rs → context.rs → state.rs → moment.rs → mod.rs → main.rs
2. 前端：api.js → style.css → mobile.css → index.html → app.js → tasks.js
3. `cargo check` 编译确认
4. 版本号递增 + SW 缓存版本
5. `fly deploy`

## 验证

1. 部署后 curl 确认 API 返回 JSON
2. 手机打开 — 顶栏左侧应先显示 fallback → 1-2s 后淡入 AI 文案
3. 再次刷新 — 确认返回 `cached: true`（15分钟内）
4. 锁屏 > 15分钟后切回 — 确认 visibilitychange 触发刷新
5. 不同时段测试 — 深夜/早晨语气差异
6. 断开 Claude API key — 确认 fallback 正常显示，不报错
