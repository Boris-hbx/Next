# SPEC-038: 场景英语
> 起草日期: 2026-02-21
> 状态: 已完成

## 概述
按日常场景（银行、加油站、餐厅等）学习英语，阿宝生成双语对话供阅读参考。

## 数据库
- `english_scenarios` 表：存储场景元信息和生成的 Markdown 内容

## API 端点
- CRUD: GET/POST/PUT/DELETE `/api/english/scenarios`
- 生成: POST `/api/english/scenarios/:id/generate`
- 归档: POST `/api/english/scenarios/:id/archive`

## 阿宝 Tool
- `create_english_scenario` — 创建场景并触发内容生成
- `query_english_scenarios` — 查询场景列表

## 前端
- `english.js` — 场景列表/详情/创建弹窗
- `english.css` — 样式
