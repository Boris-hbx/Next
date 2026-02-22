# REST API

> 所有端点、数据结构、请求/响应格式
> 最后更新: 2026-02-21

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
| PUT | `/api/auth/avatar` | 更新头像 |

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

**更新头像请求**:
```json
{ "avatar": "avatar1" }
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
  "is_collaborative": false,
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
  "is_collaborative": false,
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

## English Scenario（英语场景）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/english/scenarios?archived=0` | 获取场景列表 |
| POST | `/api/english/scenarios` | 创建场景 |
| GET | `/api/english/scenarios/:id` | 获取场景详情 |
| PUT | `/api/english/scenarios/:id` | 更新场景 |
| DELETE | `/api/english/scenarios/:id` | 删除场景 |
| POST | `/api/english/scenarios/:id/generate` | AI 生成场景内容 |
| POST | `/api/english/scenarios/:id/archive` | 归档场景 |

**英语场景数据结构**:
```json
{
  "id": "UUID",
  "title": "咖啡店点单",
  "title_en": "Ordering at a Coffee Shop",
  "description": "场景描述",
  "icon": "📖",
  "content": "AI 生成的场景对话内容",
  "status": "draft | generated",
  "archived": false,
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳"
}
```

## Friends（好友）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/friends` | 获取好友列表 |
| GET | `/api/friends/requests` | 获取好友请求 |
| POST | `/api/friends/request` | 发送好友请求 |
| GET | `/api/friends/search?q=keyword` | 搜索用户 |
| POST | `/api/friends/:id/accept` | 接受好友请求 |
| POST | `/api/friends/:id/decline` | 拒绝好友请求 |
| DELETE | `/api/friends/:id` | 删除好友 |

**好友请求**:
```json
{ "username": "friend_name" }
```

## Share（任务分享）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/share` | 分享任务给好友 |
| GET | `/api/share/inbox` | 获取分享收件箱 |
| GET | `/api/share/inbox/count` | 获取未读分享数量 |
| POST | `/api/share/:id/accept` | 接受分享 |
| POST | `/api/share/:id/dismiss` | 忽略分享 |

**分享请求**:
```json
{ "friend_id": "uuid", "item_type": "todo", "item_id": "todo_id", "message": "看看这个" }
```

## Reminder（提醒）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/reminders?status=pending` | 获取提醒列表 |
| POST | `/api/reminders` | 创建提醒 |
| PUT | `/api/reminders/:id` | 更新提醒 |
| DELETE | `/api/reminders/:id` | 取消提醒 |
| POST | `/api/reminders/:id/acknowledge` | 确认提醒 |
| POST | `/api/reminders/:id/snooze` | 延后提醒 |
| GET | `/api/reminders/pending-count` | 获取待触发数量 |

**提醒数据结构**:
```json
{
  "id": "UUID",
  "text": "开会",
  "remind_at": "2026-02-21T15:00:00+08:00",
  "status": "pending | triggered | acknowledged | snoozed | cancelled",
  "related_todo_id": "todo_id | null",
  "repeat": "null | daily | weekly",
  "created_at": "ISO时间戳",
  "triggered_at": "ISO时间戳 | null",
  "acknowledged_at": "ISO时间戳 | null"
}
```

**延后请求**:
```json
{ "minutes": 5 }
```

## Push（Web Push 推送）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/push/vapid-public-key` | 获取 VAPID 公钥 |
| POST | `/api/push/subscribe` | 注册推送订阅 |
| DELETE | `/api/push/subscribe` | 取消推送订阅 |

**订阅请求**:
```json
{
  "endpoint": "https://push-service.example.com/...",
  "keys": {
    "p256dh": "base64_key",
    "auth": "base64_auth"
  }
}
```

## Notification（应用内通知）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/notifications/unread` | 获取未读通知 |
| POST | `/api/notifications/:id/read` | 标记单条已读 |
| POST | `/api/notifications/read-all` | 全部标记已读 |

**通知数据结构**:
```json
{
  "id": "UUID",
  "type": "reminder | friend_request | share | collaboration",
  "title": "提醒",
  "body": "开会时间到了",
  "reminder_id": "uuid | null",
  "todo_id": "uuid | null",
  "read": false,
  "created_at": "ISO时间戳"
}
```

## Contacts（联系人）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/contacts` | 获取联系人列表 |
| POST | `/api/contacts` | 创建联系人 |
| PUT | `/api/contacts/:id` | 更新联系人 |
| DELETE | `/api/contacts/:id` | 删除联系人 |

**联系人数据结构**:
```json
{
  "id": "UUID",
  "name": "张三",
  "linked_user_id": "uuid | null",
  "friendship_id": "uuid | null",
  "note": "备注",
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳"
}
```

## Collaborate（协作）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/collaborate/todos/:id` | 设置任务协作者 |
| DELETE | `/api/collaborate/todos/:id` | 移除任务协作者 |
| GET | `/api/collaborate/todos/:id/collaborators` | 获取任务协作者列表 |
| POST | `/api/collaborate/routines/:id` | 设置例行任务协作者 |
| DELETE | `/api/collaborate/routines/:id` | 移除例行任务协作者 |
| GET | `/api/collaborate/confirmations/pending` | 获取待确认列表 |
| POST | `/api/collaborate/confirmations/:id/respond` | 回应确认请求 |
| POST | `/api/collaborate/confirmations/:id/withdraw` | 撤回确认请求 |

**设置协作者请求**:
```json
{ "friend_id": "好友的 user_id" }
```

**回应确认请求**:
```json
{ "response": "confirm | reject" }
```

## Moment（此刻）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/moment` | 获取顶栏一句话 |

**响应**:
```json
{ "success": true, "text": "有两件急的", "cached": true }
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
