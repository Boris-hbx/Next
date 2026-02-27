# SPEC-051: Guest 体验模式
> 起草日期: 2026-02-27
> 状态: 已完成

## 概述

用户不想注册或来不及注册时，通过 Guest 模式快速体验 Next 的全部功能。每个 guest 获得独立沙盒（临时用户 + 预置示例数据 + 真实照片），24 小时后自动清理。

## 核心功能

### 1. Guest 登录
- 入口：登录页"体验一下"按钮 + 确认弹窗
- `POST /api/auth/guest` 创建临时用户
- IP 限制：5 次/IP/小时，全局上限 50 活跃 guest
- 24 小时 session，到期后自动清理

### 2. 预置示例数据
- **Todos**: 8 条，分布在 today/next 的四个象限
- **Routines**: 6 条，含不同频率，1 条已完成
- **Reviews**: 2 条
- **Expenses**: 3 条，含真实收据照片（9 张），ai_processed=false 等用户触发
- **Trip**: 1 个"出差-上海"，含文字行程描述
- **English**: 1 个"咖啡店点餐"场景，含 AI 预生成对话

### 3. AI 次数限制
- 共享池 21 次（阿宝对话 + 智能解析共用）
- 所有 AI 端点调用前检查 `check_guest_ai_quota()`
- 响应中附带 `ai_remaining` 字段（仅 guest）
- 前端顶部 banner + 各模块展示剩余次数

### 4. 社交功能禁用
- 好友（send/accept/decline/delete）
- 分享（send/accept/dismiss）
- 协作（set/remove collaborator）
- 读端点返回空列表

### 5. Guest 清理
- 每小时检查 session 过期的 guest
- 按依赖顺序删除所有关联数据
- 删除 uploads 目录

## 文件变更

### 新建
| 文件 | 用途 |
|------|------|
| `server/src/services/guest_seed.rs` | 数据种子 + 照片复制 + 清理 |
| `data/demo-photos/*.jpg` | 9 张预置照片 |

### 修改
| 文件 | 改动 |
|------|------|
| `server/src/db.rs` | +migration: ai_calls_remaining |
| `server/src/state.rs` | +guest_ip_rate_limits |
| `server/src/auth.rs` | +guest_login, +reject_if_guest, +check_guest_ai_quota, ActiveUserId 允许 guest, UserInfo 加 ai_calls_remaining |
| `server/src/main.rs` | +guest 路由, +清理任务 |
| `server/src/lib.rs` | +guest 路由 |
| `server/src/routes/chat.rs` | +quota 检查 + ai_remaining |
| `server/src/routes/expenses.rs` | +quota 检查 (parse_receipts, parse_preview) |
| `server/src/routes/trips.rs` | +quota 检查 (analyze_item) |
| `server/src/routes/english.rs` | +quota 检查 (generate_scenario) |
| `server/src/routes/friends.rs` | +reject_if_guest (6 handlers) |
| `server/src/routes/collaborate.rs` | +reject_if_guest (2 handlers) |
| `server/src/routes/routine_collab.rs` | +reject_if_guest (2 handlers) |
| `Dockerfile` | +COPY demo-photos |
| `frontend/login.html` | +体验按钮 + 确认弹窗 |
| `frontend/index.html` | +guest banner + section IDs |
| `frontend/assets/css/style.css` | +guest banner styles |
| `frontend/assets/js/app.js` | +guest 状态处理 |
| `frontend/assets/js/api.js` | +GUEST_RESTRICTED/EXHAUSTED + ai_remaining sync |
| `frontend/assets/js/abao.js` | +次数展示 + 用完禁用 |
| `frontend/assets/js/settings.js` | +隐藏密码/好友区块 |
| `frontend/assets/js/friends.js` | +guest guard |
