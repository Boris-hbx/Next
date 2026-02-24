# SPEC-044: 生活 Hub — 记账功能
> 起草日期: 2026-02-23
> 状态: 实施中

## 概述

将导航栏的"潘多拉"改为"生活"，作为生活类功能的入口 Hub。第一个子功能是**记账**，支持手动记一笔、拍照上传收据、AI 自动解析明细和打标签。

## 核心设计决策

1. **不用预定义分类**，改用 **AI 自动打标签**（阿宝打标签），用户通过标签多选筛选
2. 有照片时从照片解析打标签；没照片时根据备注等文字信息打标签
3. "生活" Hub 页放两个卡片：记账（可用）+ 健康🏥（待设计占位）
4. 潘多拉每日发现功能直接移除（`discoveries` 表保留不动）

## 数据模型

### expense_entries（记账条目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | 用户 |
| amount | REAL | 总金额 |
| date | TEXT | YYYY-MM-DD |
| notes | TEXT | 备注 |
| tags | TEXT | JSON 数组，AI 打的标签 |
| ai_processed | INTEGER | AI 是否已解析 |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### expense_items（AI 解析的明细行）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| entry_id | TEXT FK | 关联条目（CASCADE） |
| name | TEXT | 商品名 |
| quantity | REAL | 数量 |
| unit_price | REAL | 单价 |
| amount | REAL | 小计 |
| specs | TEXT | 规格 |
| sort_order | INTEGER | 排序 |

### expense_photos（照片，多张/条目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| entry_id | TEXT FK | 关联条目（CASCADE） |
| filename | TEXT | 原始文件名 |
| storage_path | TEXT | 磁盘路径 |
| file_size | INTEGER | 字节 |
| mime_type | TEXT | image/jpeg etc |
| created_at | TEXT | ISO 8601 |

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/expenses` | 按日期范围查（query: from, to, tags） |
| POST | `/api/expenses` | 创建条目（含 items/tags，一次性保存） |
| GET | `/api/expenses/{id}` | 获取条目 + 明细 + 照片 |
| PUT | `/api/expenses/{id}` | 更新条目 |
| DELETE | `/api/expenses/{id}` | 删除条目（级联删明细+照片+文件） |
| GET | `/api/expenses/summary` | 聚合摘要（period=day/week/month） |
| GET | `/api/expenses/tags` | 用户所有已用标签（去重） |
| POST | `/api/expenses/{id}/photos` | Multipart 上传照片（20MB limit） |
| DELETE | `/api/expenses/photos/{photo_id}` | 删除单张照片 |
| GET | `/api/uploads/{user_id}/{filename}` | 提供照片文件（带鉴权） |
| **POST** | **`/api/expenses/parse-preview`** | **上传照片 → AI 解析 → 返回预览（不保存）** |

## AI 集成

### 收据解析 Prompt

支持所有类型的单据：超市明细、餐厅（无明细有小费）、加油站、付款凭证等。

```json
{
  "merchant": "T&T Supermarket",
  "date": "2026-02-11",
  "currency": "CAD",
  "tags": ["超市", "肉类", "蔬菜"],
  "items": [
    { "name": "红萝卜", "quantity": 0.41, "unit_price": 1.94, "amount": 0.80, "specs": "CARROT, 0.410 kg @ $1.94/kg" }
  ],
  "subtotal": 235.18,
  "tax": 0.58,
  "tip": 0,
  "total_amount": 235.76
}
```

关键规则：
- name 用中文名（如有），英文名放 specs
- amount 直接抄收据数字，不自己算
- total_amount = 最终刷卡金额（含税含小费）
- 无明细的单据（餐厅/加油）：items 放一项概括
- max_tokens = 8192，timeout = 120s

### 文字标签（无照片有备注时）

通过 `simple_generate` 根据金额+备注生成标签 JSON 数组。

---

## "记一笔"交互流程（重点设计）

### 两种路径

```
用户点 "+"
    │
    ├─ 路径A：手动记账（不上传照片）
    │   填金额 → 填日期/备注 → [保存]
    │   后台自动根据备注打标签
    │
    └─ 路径B：拍照记账（上传照片）
        选照片 → [识别账单] → 等待分析 → 预览结果 → [保存]
```

### 弹窗状态流转

```
┌─────────────────────────────────────┐
│  "记一笔" 弹窗                        │
│                                     │
│  状态1: 输入态（默认）                   │
│  ┌─────────────────────────────┐    │
│  │  [$] 金额输入框               │    │
│  │  [日期] [备注]               │    │
│  │  [照片区域]                   │    │
│  │    ┌──┐ ┌──┐ [+ 添加]       │    │
│  │    │📷│ │📷│               │    │
│  │    └──┘ └──┘               │    │
│  │                             │    │
│  │  ┌──────┐  ┌──────────────┐ │    │
│  │  │ 取消  │  │ 识别账单 ✨   │ │    │  ← 有照片时显示此按钮
│  │  └──────┘  └──────────────┘ │    │     无照片时显示 "保存"
│  └─────────────────────────────┘    │
│                                     │
│  状态2: 分析中                        │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │     ✨ 正在识别账单...         │    │
│  │     ████████░░░░  60%       │    │  ← 模拟进度条（非真实进度）
│  │     通常需要 10~40 秒         │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  状态3: 预览态                        │
│  ┌─────────────────────────────┐    │
│  │  商家: T&T Supermarket       │    │
│  │  日期: 2026-02-11            │    │
│  │  标签: [超市] [肉类] [蔬菜]    │    │
│  │                             │    │
│  │  ┌─ 商品明细 ─────────────┐  │    │
│  │  │ 红萝卜    CARROT  $0.80│  │    │
│  │  │ 南瓜     PUMPKIN  $3.68│  │    │
│  │  │ ...                    │  │    │
│  │  │ ───────────────────── │  │    │
│  │  │ 小计          $235.18 │  │    │
│  │  │ 税             $0.58  │  │    │
│  │  │ 总计          $235.76 │  │    │
│  │  └────────────────────────┘  │    │
│  │                             │    │
│  │  [$235.76] ← 金额（可手动改） │    │
│  │                             │    │
│  │  ┌──────┐  ┌──────────────┐ │    │
│  │  │ 重新拍 │  │    保存 ✓    │ │    │
│  │  └──────┘  └──────────────┘ │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 状态1: 输入态

- 默认显示金额、日期、备注、照片区域
- **底部按钮逻辑**：
  - 无照片时：`[取消]` `[保存]` — 走手动路径
  - 有照片时：`[取消]` `[识别账单 ✨]` — 走拍照路径
- 用户也可以在有照片时手动填金额直接保存（不强制分析）
  - 有照片 + 已填金额 → 显示 `[保存]` 和 `[识别账单 ✨]` 两个按钮

### 状态2: 分析中

- 弹窗内容替换为加载动画
- 模拟进度条（前端 fake，0→90% 缓动 30s，收到响应后跳 100%）
- 文字提示"正在识别账单..."+"通常需要 10~40 秒"
- 无取消按钮（API 调用已发出）

### 状态3: 预览态

核心预览内容：

```
┌─ 解析结果预览 ──────────────────────────────────┐
│                                                │
│  T&T Supermarket          2026-02-11           │  ← 商家 + 日期
│  [超市] [肉类] [海鲜] [蔬菜] [调味品]            │  ← 标签 pills
│                                                │
│  ┌─ 商品明细 (39项) ──────────────────────────┐ │
│  │                                          │ │
│  │  红萝卜                           $0.80   │ │  ← name + amount
│  │  CARROT, 0.410 kg @ $1.94/kg             │ │  ← specs (灰色小字)
│  │                                          │ │
│  │  南瓜                             $3.68   │ │
│  │  PUMPKIN, 0.670 kg @ $5.49/kg            │ │
│  │                                          │ │
│  │  ...（可滚动）                              │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌─ 汇总 ────────────────────────────────────┐ │
│  │  小计     $235.18                         │ │
│  │  税        $0.58                          │ │
│  │  总计     $235.76                         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  金额  [$235.76 ]  ← 可编辑，默认填入总计         │
│  备注  [          ]  ← 可编辑，默认填入商家名      │
│                                                │
│  ┌──────────┐         ┌────────────────────┐   │
│  │  重新拍照  │         │      保存 ✓        │   │
│  └──────────┘         └────────────────────┘   │
│                                                │
└────────────────────────────────────────────────┘
```

#### 预览设计要点

1. **商品列表**：每项两行 — 第一行 name + amount（大字），第二行 specs（灰色小字）
2. **列表可滚动**：max-height 限制，超出部分滚动
3. **汇总区**：小计 / 税 / 小费(如有) / 总计
4. **金额输入框**：预填 AI 识别的 total_amount，用户可手动修改
5. **备注输入框**：预填商家名称（如 "T&T Supermarket"）
6. **"重新拍照"按钮**：回到状态1，清空分析结果，保留已选照片
7. **"保存"按钮**：用预览数据创建条目

#### 不同单据类型的预览差异

| 类型 | 商品明细 | 汇总区 |
|------|---------|--------|
| 超市收据（有明细） | 逐项列出 | 小计+税+总计 |
| 餐厅（无明细有小费） | 一项"餐饮消费 $68.88" | 小计+小费+总计 |
| 加油站 | 一项"Premium汽油 $84.63" | 总计 |
| 付款凭证（无明细） | 一项"家具消费 $607.94" | 总计 |

### API: parse-preview（新）

**`POST /api/expenses/parse-preview`**

前端直接把照片 base64 发给后端，后端调 AI 解析后返回预览数据，**不写入数据库**。

Request:
```json
{
  "images": [
    { "data": "base64...", "mime_type": "image/jpeg" }
  ]
}
```

Response:
```json
{
  "success": true,
  "preview": {
    "merchant": "T&T Supermarket",
    "date": "2026-02-11",
    "currency": "CAD",
    "tags": ["超市", "肉类"],
    "items": [
      { "name": "红萝卜", "quantity": 0.41, "unit_price": 1.94, "amount": 0.80, "specs": "CARROT, 0.410 kg @ $1.94/kg" }
    ],
    "subtotal": 235.18,
    "tax": 0.58,
    "tip": 0,
    "total_amount": 235.76
  }
}
```

保存时，前端将 preview 数据 + 用户修改后的金额/备注一起提交到 `POST /api/expenses`（扩展 request body 支持 items 数组）。

---

## 前端结构

```
life-view
├── life-hub（Hub 页，两个功能卡片）
├── expense-view（记账子视图）
│   ├── expense-header（← 生活 | 记账 | 日/周/月 tabs）
│   ├── expense-date-nav（日期导航）
│   ├── expense-summary（总金额）
│   ├── expense-tags-filter（标签筛选）
│   └── expense-list（按日期分组的列表）
├── expense-add-overlay（"记一笔"弹窗，含3个状态）
├── expense-detail-overlay（详情弹窗）
└── expense-fab（"+"浮动按钮）
```

### JS 模块

- `life.js` — Hub 控制器，管理子功能切换
- `expense.js` — 记账全功能 IIFE 模块

## 文件存储

- 路径: `/data/uploads/{user_id}/{photo_id}.{ext}`
- Dockerfile: `mkdir -p /data/uploads`
- CSP: `img-src 'self' data: blob:`
- Permissions-Policy: `camera=(self)` 支持移动端拍照

## 涉及文件

| 操作 | 文件 |
|------|------|
| 删除 | `frontend/assets/js/pandora.js` |
| 新建 | `frontend/assets/js/life.js` |
| 新建 | `frontend/assets/js/expense.js` |
| 新建 | `server/src/routes/expenses.rs` |
| 新建 | `server/src/models/expense.rs` |
| 修改 | `frontend/index.html` — 导航 + life-view HTML |
| 修改 | `frontend/assets/js/app.js` — switchPage |
| 修改 | `frontend/assets/js/api.js` — 删 Pandora + 加 Expense |
| 修改 | `frontend/assets/css/english.css` — 删潘多拉 + 加生活/记账 CSS |
| 修改 | `server/src/db.rs` — 新表 |
| 修改 | `server/src/main.rs` — 路由 + CSP + camera |
| 修改 | `server/src/routes/mod.rs` — 模块声明 |
| 修改 | `server/src/models/mod.rs` — 模块声明 |
| 修改 | `server/src/services/claude.rs` — vision_generate |
| 修改 | `server/Cargo.toml` — axum multipart |
| 修改 | `Dockerfile` — uploads 目录 |
| 修改 | `frontend/sw.js` — precache |
