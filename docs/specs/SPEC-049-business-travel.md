# SPEC-049: 差旅管理 (Business Travel)

> 起草日期: 2026-02-24
> 状态: 草稿

## 1. 背景与目标

每次出差都有明确的目的和起止时间（如"2/29~3/5 回国述职"），期间涉及大量事项：机票、高铁、酒店、打车、餐费、话费、洗衣等。这些信息散落在邮件、微信、截图中，报销时容易遗漏或搞错。

**核心定位：索引与记录。** 差旅模块不是复杂的行程规划工具，而是一本出差流水账——快速记下每件事、每笔钱、每张票据，确保不遗漏。

**目标：**
- 一次差旅 = 一个条目（有标题、目的、起止日期），点进去看按天组织的明细
- 明细不只是费用，也包括重要事件（如"汇报会议"）
- 每条明细可附票据：发票、收据、行程单、信用卡账单、酒店流水、手机截图等
- 跟踪报销状态，一眼看清哪些已报、哪些待报、哪些不需要报
- 与助理共享，方便她了解动态并协助报销

**明确不做：**
- 与"记账"模块完全独立，不互相同步
- 本期不做 AI 票据识别

---

## 2. 核心概念

### 2.1 数据层级

```
差旅列表
└── 差旅 (Trip) ← 如"2/29~3/5 回国述职"
    ├── 基本信息: 标题、目的地、日期范围、事由、币种
    ├── 协作者: 助理等好友，viewer/editor 角色
    └── 条目 (TripItem)，按天挂载
        ├── 类型 + 日期 + 描述 + 金额(可选) + 报销状态
        ├── 票据附件 (TripPhoto): 发票/收据/行程单/截图等
        └── 备注
```

**两层结构：** 列表页看到的是一次次差旅，点进去才看到这次差旅里的具体事项。

### 2.2 条目类型

条目不只是费用，也可以是事件（如会议），金额为 0 表示无费用。

| 类型 | key | 图标 | 典型场景 |
|------|-----|------|----------|
| 机票 | `flight` | ✈️ | CA1234 温哥华→北京 |
| 火车 | `train` | 🚄 | G1234 北京→上海 |
| 酒店 | `hotel` | 🏨 | 北京希尔顿 2 晚 |
| 交通 | `taxi` | 🚕 | 打车 酒店→客户公司 |
| 餐饮 | `meal` | 🍽️ | 午餐 客户招待 / 早餐 |
| 会议 | `meeting` | 📋 | 述职汇报、客户会议（可能无金额） |
| 通讯 | `telecom` | 📱 | 国际漫游话费 |
| 杂费 | `misc` | 🧾 | 酒店洗衣、签证费、办公用品 |

> 类型主要用于图标展示和分类统计，不做严格限制。用户用"杂费"兜底即可。

### 2.3 票据附件

每个条目可附多张票据，形式包括：
- 纸质发票（拍照）
- 电子发票（截图）
- 行程单 / 登机牌
- 信用卡消费短信 / 账单截图
- 酒店流水清单
- 任何相关凭证

统一以图片形式存储，不区分票据类型。

### 2.3 报销状态

| 状态 | key | 颜色 | 含义 |
|------|-----|------|------|
| 待提交 | `pending` | 黄 | 尚未提交报销 |
| 已提交 | `submitted` | 蓝 | 已提交报销申请 |
| 已批准 | `approved` | 绿 | 报销已批准 |
| 已拒绝 | `rejected` | 红 | 报销被拒，需处理 |
| 无需报销 | `na` | 灰 | 公司直付 / 对方承担 |

---

## 3. 用户界面

### 3.1 入口

生活 Hub 新增卡片：

```
┌──────────┐  ┌──────────┐
│    💰    │  │    ✈️    │
│   记账   │  │   差旅   │
│ 记录消费 │  │ 行程报销 │
└──────────┘  └──────────┘
┌──────────┐
│    🏥    │
│   健康   │
│  待设计  │
└──────────┘
```

### 3.2 差旅列表

```
← 生活                            [+]

┌─────────────────────────────────────┐
│ ✈️ 北京出差                          │
│ 2/24 - 2/27 · 北京 · 客户拜访        │
│ ¥8,127                              │
│ ██████████░░░░░░░ 39% 已报            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ✈️ 上海培训                          │
│ 3/10 - 3/12 · 上海                   │
│ 规划中 · 暂无费用                     │
└─────────────────────────────────────┘
```

- 即将出发的行程排前面，已结束的在后面
- 卡片显示：标题、日期范围、目的地、总金额、报销进度条
- 点击卡片进入详情

### 3.3 差旅详情（按天组织）

点进一条差旅后，看到按天组织的所有事项：

```
← 差旅                    [编辑] [分享]

回国述职
2/29 - 3/5 · 北京 · 年度述职汇报

────── 2月29日 周六 ──────────────────

  ✈️ AC025 温哥华→北京          ¥6,800
     ✅ 已批准  📎

                           [+ 添加]

────── 3月1日 周日 ──────────────────

  🏨 北京希尔顿 入住 (4晚)       ¥3,560
     ⏳ 待提交  📎

  🚕 机场→酒店                   ¥85
     ⏳ 待提交

  📱 开通国际漫游               ¥200
     ⏳ 待提交  📎

                           [+ 添加]

────── 3月2日 周一 ──────────────────

  🚕 酒店→公司                   ¥45
     ⏳ 待提交

  📋 述职汇报 10:00-12:00
     -- 无需报销

  🍽️ 午餐 团队聚餐              ¥680
     🚫 无需报销（公司承担）

  🧾 酒店洗衣                    ¥120
     ⏳ 待提交  📎

                           [+ 添加]

────── 3月3日 周二 ──────────────────

  🚄 G1234 北京→上海           ¥553
     📤 已提交  📎

  🚕 上海站→客户公司             ¥62
     ⏳ 待提交

  🍽️ 晚餐 客户招待              ¥450
     🚫 无需报销

                           [+ 添加]

────── 3月5日 周四 ──────────────────

  🚄 G4321 上海→北京           ¥553
     📤 已提交  📎

  ✈️ AC026 北京→温哥华         ¥7,200
     📤 已提交  📎

                           [+ 添加]

──────────────────────────────────────
报销汇总（12 条，含费用 10 条）
  总计    ¥20,308
  已批准  ¥6,800   ████░░░░░░░  34%
  已提交  ¥8,306   ████░░░░░░░  41%
  待提交  ¥4,010               20%
  无需报销 ¥1,130               5% (不计入报销)
──────────────────────────────────────
协作者: 小李 (编辑)
```

**交互：**
- 点击条目 → 弹窗编辑（修改描述、金额、报销状态、查看/上传票据）
- 每天底部有 [+ 添加] 按钮，默认日期为该天
- 长按条目 → ActionSheet（编辑/删除）
- 📎 图标表示有票据附件
- 无金额的事件（如会议）不显示金额，报销状态默认"无需报销"

### 3.4 新建/编辑行程弹窗

```
┌─────────────────────────────────┐
│ 新建差旅                         │
│                                  │
│ 标题    [北京出差              ]  │
│ 目的地  [北京                  ]  │
│ 出发    [2026-02-24            ]  │
│ 返回    [2026-02-27            ]  │
│ 事由    [客户拜访              ]  │
│ 币种    [CAD ▼]                   │
│                                  │
│          [取消]  [保存]           │
└─────────────────────────────────┘
```

### 3.5 新建/编辑条目弹窗

```
┌─────────────────────────────────┐
│ 添加条目                         │
│                                  │
│ 类型                             │
│ [✈️机票] [🚄火车] [🏨酒店] [🚕交通]│
│ [🍽️餐饮] [📋会议] [📱通讯] [🧾杂费]│
│                                  │
│ 日期    [2026-03-02            ]  │
│ 描述    [酒店洗衣               ]  │
│ 金额    [120        ] (可不填)    │
│ 报销    [待提交 ▼]                │
│ 票据    [📷 拍照/选择]            │
│ 备注    [可选                  ]  │
│                                  │
│          [取消]  [保存]           │
└─────────────────────────────────┘
```

- 金额可不填（默认 0），适用于会议等无费用事项
- 金额为 0 时，报销状态自动设为"无需报销"
- 票据支持拍照和从相册/截图选择，可附多张

### 3.6 分享弹窗

```
┌─────────────────────────────────┐
│ 分享行程                         │
│                                  │
│ 当前协作者:                       │
│   小李  编辑  [移除]              │
│                                  │
│ 添加好友:                        │
│   [选择好友 ▼]  [查看/编辑 ▼]     │
│                         [添加]   │
│                                  │
│ · 查看: 只能查看行程和费用         │
│ · 编辑: 可更新报销状态、上传票据   │
└─────────────────────────────────┘
```

### 3.7 导出功能

在差旅详情页底部（报销汇总下方），提供两个导出按钮：

```
──────────────────────────────────────
报销汇总（12 条，含费用 10 条）
  ...
──────────────────────────────────────
协作者: 小李 (编辑)

  [📋 导出报销清单]  [📎 下载全部票据]
```

**导出报销清单：**
- 生成 CSV 文件，浏览器直接下载
- 文件名：`差旅报销_回国述职_20260229-0305.csv`
- 列：日期、类型、描述、金额、币种、报销状态、备注
- 只包含有金额的条目（会议等无费用项不导出）
- UTF-8 BOM 编码，Excel 打开不乱码

**下载全部票据：**
- 后端打包所有票据照片为 zip，浏览器下载
- 文件名：`差旅票据_回国述职_20260229-0305.zip`
- zip 内按日期分文件夹组织：`0301/酒店发票.jpg`、`0302/高铁行程单.png`
- 文件名用条目描述命名，重名则加序号

---

## 4. 数据模型

### 4.1 trips 表

```sql
CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    date_from TEXT NOT NULL,          -- YYYY-MM-DD
    date_to TEXT NOT NULL,            -- YYYY-MM-DD
    purpose TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    currency TEXT DEFAULT 'CAD',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, date_from DESC);
```

### 4.2 trip_items 表

```sql
CREATE TABLE IF NOT EXISTS trip_items (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'misc',       -- flight|train|hotel|taxi|meal|meeting|telecom|misc
    date TEXT NOT NULL,                       -- YYYY-MM-DD
    description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'CAD',
    reimburse_status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items(trip_id, date, sort_order);
```

### 4.3 trip_photos 表

```sql
CREATE TABLE IF NOT EXISTS trip_photos (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_photos_item ON trip_photos(item_id);
```

### 4.4 trip_collaborators 表

```sql
CREATE TABLE IF NOT EXISTS trip_collaborators (
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'viewer',  -- viewer|editor
    created_at TEXT NOT NULL,
    PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_collab_user ON trip_collaborators(user_id);
```

---

## 5. API 端点

### 5.1 差旅 CRUD

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/trips` | 登录 | 列表（自己的 + 被共享的） |
| POST | `/api/trips` | 登录 | 创建 |
| GET | `/api/trips/{id}` | owner/collaborator | 完整详情 |
| PUT | `/api/trips/{id}` | owner | 更新元信息 |
| DELETE | `/api/trips/{id}` | owner | 删除（级联） |

### 5.2 条目 CRUD

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/trips/{id}/items` | owner/editor | 添加条目 |
| PUT | `/api/trips/items/{item_id}` | owner 全字段, editor 仅 reimburse_status | 更新 |
| DELETE | `/api/trips/items/{item_id}` | owner | 删除 |

### 5.3 照片

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/trips/items/{item_id}/photos` | owner/editor | 上传票据（multipart） |
| DELETE | `/api/trips/photos/{photo_id}` | owner | 删除 |

照片文件存储在 `data/uploads/{user_id}/`，复用现有 serve_photo 端点。
需扩展 serve_photo 权限检查：当 user_id 不匹配时，fallback 查询 trip_collaborators 表。

### 5.4 导出

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/trips/{id}/export/csv` | owner/collaborator | 下载报销清单 CSV |
| GET | `/api/trips/{id}/export/photos` | owner/collaborator | 下载全部票据 zip |

**CSV 格式：**
```
日期,类型,描述,金额,币种,报销状态,备注
2026-03-01,酒店,北京希尔顿 入住 (4晚),3560,CAD,待提交,
2026-03-01,交通,机场→酒店,85,CAD,待提交,
```

**Zip 结构：**
```
差旅票据_回国述职_20260229-0305.zip
├── 0229/
│   └── AC025温哥华北京_机票行程单.jpg
├── 0301/
│   ├── 北京希尔顿_酒店发票.jpg
│   └── 国际漫游_账单截图.png
└── 0302/
    └── G1234北京上海_高铁行程单.jpg
```

### 5.5 协作

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/trips/{id}/collaborators` | owner | 添加（须是好友） |
| DELETE | `/api/trips/{id}/collaborators/{uid}` | owner | 移除 |

---

## 6. 权限模型

```
Owner:      创建/编辑/删除行程、添加/编辑/删除条目、上传/删除照片、管理协作者
Editor:     查看行程、添加条目、更新 reimburse_status、上传照片
Viewer:     仅查看行程、条目、照片
Non-member:  403
```

关键约束：
- Editor 更新条目时，只能修改 `reimburse_status` 字段（其他字段忽略）
- 添加协作者前校验 `friendships` 表，非好友不允许
- 删除行程时级联删除所有条目、照片（文件 + DB 记录）

---

## 7. 前端架构

### 7.1 模块结构

```javascript
// frontend/assets/js/trip.js
var Trip = (function() {
    // 状态: _trips, _currentTripId, _currentTrip, _view, _editingItemId, _pendingPhotos
    // 列表: init(), loadTrips(), renderList()
    // 详情: openTrip(id), renderDetail(), backToList()
    // CRUD: openTripModal(), submitTrip(), deleteTrip()
    //       openItemModal(), submitItem(), deleteItem()
    // 照片: handlePhotoSelect(), uploadPhotos()
    // 协作: openShareModal(), addCollaborator(), removeCollaborator()
    return { init, openTrip, backToList, ... };
})();
```

### 7.2 Life.js 扩展

```javascript
// openFeature 增加 'trip' 分支
// showHub 增加隐藏 trip-view 和 trip-fab
// init 增加 localStorage 'life_feature' === 'trip' 恢复
```

### 7.3 导航层级

```
生活 Hub ─→ 差旅列表 ─→ 差旅详情
  ←            ←           │
  Life.showHub  Trip.backToList  编辑/添加 modal
```

---

## 8. 阿宝工具集成

参照 SPEC-048 模式，在 `tool_executor.rs` 中注册差旅相关工具，使阿宝可以通过对话操作差旅。

### 8.1 工具列表

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `query_trips` | `keyword?`, `status?`(upcoming/past) | 查询差旅列表 |
| `get_trip_detail` | `trip_id` | 获取完整详情（含条目、照片数、报销汇总） |
| `create_trip` | `title`, `destination?`, `date_from`, `date_to`, `purpose?`, `currency?` | 创建差旅 |
| `update_trip` | `trip_id`, `title?`, `destination?`, `date_from?`, `date_to?`, `purpose?` | 修改差旅 |
| `delete_trip` | `trip_id` | 删除差旅 |
| `create_trip_item` | `trip_id`, `type`, `date`, `description`, `amount?`, `reimburse_status?`, `notes?` | 添加条目 |
| `update_trip_item` | `item_id`, `type?`, `date?`, `description?`, `amount?`, `reimburse_status?`, `notes?` | 修改条目 |
| `delete_trip_item` | `item_id` | 删除条目 |
| `get_trip_summary` | `trip_id` | 报销汇总（总计/各状态金额/占比） |

### 8.2 典型对话场景

```
用户: "帮我建一个出差，3月10号到12号去上海培训"
阿宝: create_trip({title:"上海培训", destination:"上海", date_from:"2026-03-10", date_to:"2026-03-12", purpose:"培训"})
→ "已创建差旅'上海培训' (3/10-3/12)"

用户: "加一张高铁票，G1234北京到上海，553块"
阿宝: create_trip_item({trip_id:"xxx", type:"train", date:"2026-03-10", description:"G1234 北京→上海", amount:553})
→ "已添加: 🚄 G1234 北京→上海 ¥553"

用户: "回国述职花了多少钱，报了多少了"
阿宝: query_trips({keyword:"回国述职"}) → get_trip_summary({trip_id:"xxx"})
→ "回国述职总计 ¥20,308，已批准 ¥6,800 (34%)，已提交 ¥8,306 (41%)，待提交 ¥4,010 (20%)"

用户: "把那两张机票都改成已批准"
阿宝: get_trip_detail({trip_id:"xxx"}) → 找到两个 flight 条目 →
      update_trip_item({item_id:"a", reimburse_status:"approved"})
      update_trip_item({item_id:"b", reimburse_status:"approved"})
→ "已把 2 张机票的报销状态改为已批准"
```

### 8.3 上下文感知

当用户在差旅详情页打开阿宝时，`page_context` 会传递 `{page: "life", detail_id: "trip_xxx"}`，阿宝自动知道当前查看的是哪个差旅，无需用户再指定。

### 8.4 前端刷新

`abao.js` 的 `refreshTasksIfNeeded()` 增加：
- 工具名含 `trip` → 调用 `Trip.init()` 或 `Trip.openTrip(id)` 刷新

---

## 9. 实现顺序

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `server/src/db.rs` | 4 张表 |
| 2 | `server/src/models/trip.rs` + `mod.rs` | 数据结构 |
| 3 | `server/src/routes/trips.rs` + `mod.rs` | 14 个 handler（含导出） |
| 4 | `server/src/main.rs` + `lib.rs` | 注册路由 |
| 5 | `server/src/services/tool_executor.rs` | 9 个阿宝工具 |
| 6 | `server/src/services/context.rs` | 差旅上下文注入 |
| 7 | `cargo clippy && cargo test` | 后端验证 |
| 8 | `frontend/assets/js/api.js` | API 方法 |
| 9 | `frontend/assets/js/trip.js` | 前端模块 |
| 10 | `frontend/assets/js/life.js` | Hub 集成 |
| 11 | `frontend/assets/js/abao.js` | 差旅刷新 + page_context |
| 12 | `frontend/index.html` | HTML + script 标签 |
| 13 | `frontend/assets/css/english.css` | 样式 |
| 14 | 缓存版本号 `20260224e` → `20260224f` | |
| 15 | Deploy staging + 测试 | |
