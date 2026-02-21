# REST API

> 所有端点、数据结构、请求/响应格式

## 通用约定

- 基础路径: `/api`
- 响应格式: `{ "success": true/false, ... }`
- 错误格式: `{ "success": false, "error": "ERROR_CODE", "message": "用户提示" }`
- 认证: Cookie `session`（除 Auth 端点外均需登录）
- 未认证请求返回 `401 { "error": "UNAUTHORIZED" }`

## Auth（无需登录）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/change-password` | 修改密码 |

**注册请求**:
```json
{ "username": "boris", "password": "12345678", "display_name": "Boris" }
```
- username: 3-20字符，字母/数字/下划线
- password: 最少8字符

**登录请求**:
```json
{ "username": "boris", "password": "12345678" }
```

**成功响应** (注册/登录):
```json
{ "success": true, "user": { "id": "uuid", "username": "boris", "display_name": "Boris" } }
```

**修改密码请求**:
```json
{ "old_password": "旧密码", "new_password": "新密码" }
```

## Todo

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/todos?tab=today` | 获取任务列表（可按 tab 过滤） |
| POST | `/api/todos` | 创建任务 |
| GET | `/api/todos/:id` | 获取单个任务 |
| PUT | `/api/todos/:id` | 更新任务 |
| DELETE | `/api/todos/:id` | 软删除任务 |
| POST | `/api/todos/:id/restore` | 恢复已删除任务 |
| DELETE | `/api/todos/:id/permanent` | 永久删除任务 |
| PUT | `/api/todos/batch` | 批量更新任务 |
| GET | `/api/todos/counts?tab=today` | 获取各 tab 任务数量 |

**任务数据结构**:
```json
{
  "id": "UUID (8字符短ID)",
  "text": "任务标题",
  "content": "详细描述 (Markdown)",
  "tab": "today | week | month",
  "quadrant": "important-urgent | important-not-urgent | not-important-urgent | not-important-not-urgent",
  "progress": 0-100,
  "completed": false,
  "completed_at": "ISO时间戳 | null",
  "due_date": "2026-01-10 | null",
  "assignee": "负责人",
  "tags": ["标签1", "标签2"],
  "sort_order": 0.0,
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳",
  "deleted": false,
  "deleted_at": "ISO时间戳 | null",
  "changelog": [
    { "time": "ISO时间戳", "field": "progress", "from": "0", "to": "50", "label": "进度" }
  ]
}
```

**象限含义**:
| 值 | 显示名 |
|---|---|
| `important-urgent` | 优先处理 |
| `important-not-urgent` | 就等你翻牌子了 |
| `not-important-urgent` | 短平快 |
| `not-important-not-urgent` | 待分类 |

**批量更新请求**:
```json
{
  "updates": [
    { "id": "abc123", "tab": "week", "quadrant": "important-urgent" },
    { "id": "def456", "progress": 100 }
  ]
}
```

## Routine

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/routines` | 获取例行任务 |
| POST | `/api/routines` | 创建例行任务 |
| DELETE | `/api/routines/:id` | 删除例行任务 |
| POST | `/api/routines/:id/toggle` | 切换例行任务完成状态 |

**例行任务数据结构**:
```json
{
  "id": "UUID",
  "text": "任务内容",
  "completed_today": false,
  "last_completed_date": "2026-01-10 | null",
  "created_at": "ISO时间戳"
}
```

## Review

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/reviews` | 获取例行审视列表 |
| POST | `/api/reviews` | 创建例行审视 |
| PUT | `/api/reviews/:id` | 更新例行审视 |
| DELETE | `/api/reviews/:id` | 删除例行审视 |
| POST | `/api/reviews/:id/complete` | 标记完成 |
| POST | `/api/reviews/:id/uncomplete` | 取消完成 |

**例行审视数据结构**:
```json
{
  "id": "UUID",
  "text": "审视内容",
  "frequency": "daily | weekly | monthly | yearly",
  "frequency_config": { "day_of_week": 1 },
  "notes": "备注",
  "category": "分类",
  "last_completed": "ISO时间戳 | null",
  "paused": false,
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳"
}
```

## Chat（阿宝 AI）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/chat` | 发送消息 |
| GET | `/api/chat/usage` | 获取使用量统计 |
| GET | `/api/conversations` | 获取对话列表 |
| GET | `/api/conversations/:id/messages` | 获取对话消息 |
| DELETE | `/api/conversations/:id` | 删除对话 |
| POST | `/api/conversations/:id/rename` | 重命名对话 |

**聊天请求**:
```json
{ "message": "帮我加个任务", "conversation_id": "uuid | null" }
```

**聊天响应**:
```json
{
  "success": true,
  "reply": "AI 回复文本",
  "conversation_id": "uuid",
  "tool_calls": [["create_todo", {...}, {...}]],
  "usage": { "input_tokens": 500, "output_tokens": 200 }
}
```

## Quote

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/quotes/random` | 随机名言 |

## Health Check

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |

**响应**: `{ "status": "ok", "uptime": 3600 }`
