# SPEC-039: 好友与分享
> 起草日期: 2026-02-21
> 状态: 已完成

## 概述
轻量级社交，可将 Todo / 例行 / 英语场景分享给好友，好友可一键复制到自己列表。

## 数据库
- `friendships` 表：好友关系（pending/accepted/declined）
- `shared_items` 表：分享记录，使用 JSON 快照存储内容

## API 端点
### 好友
- GET/POST/DELETE `/api/friends/*` — 好友管理
- GET `/api/friends/search` — 搜索用户

### 分享
- POST `/api/share` — 分享内容
- GET `/api/share/inbox` — 收件箱
- POST `/api/share/:id/accept` — 收下
- POST `/api/share/:id/dismiss` — 忽略

## 前端
- `friends.js` — 好友管理 + 分享弹窗 + 收件箱
- 设置页新增好友区
- 潘多拉页新增分享区
