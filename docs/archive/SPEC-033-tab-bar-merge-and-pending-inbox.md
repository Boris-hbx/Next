# SPEC-033: Tab 栏合并 & 弹窗交互优化

> 起草日期: 2026-02-11
> 状态: 实施中

---

## 1. Tab 栏合并为一行 [已完成]

删除 `+ 添加任务` 按钮，将 Assignee 筛选 chips 内嵌到 tab 栏右侧。

```
[例行] │ [Today (5)] [This Week (3)] [Next 30 Days (2)]  ·  [全部] [Boris] [Alice]
```

溢出处理：2-5人正常 → 6-8人缩小换行 → 9+人折叠下拉。

---

## 2. 待处理收集箱 [已完成]

右侧边栏"已完成"上方，localStorage 存储，选中文字可弹出「收入待处理」。

---

## 3. 日期选择器修复 [已完成]

`date-popover` 改为 `position: fixed` + JS 动态定位，不再被父容器 overflow 裁切。

---

## 4. 移除导出到日历功能

.ics 导出兼容性差（不同 Outlook 版本解析不一致、时区问题），实用价值低。

### 改动

| 文件 | 改动 |
|------|------|
| `frontend/index.html` | 删除 `#header-export-btn` 按钮 |
| `frontend/assets/js/modal.js` | 删除 `exportCurrentTask()` 函数；删除 `setModalMode` 中 export-btn 显示逻辑 |
| `frontend/assets/css/components.css` | 删除 `.header-btn.export-btn` 样式 |
| `frontend/assets/js/api.js` | 保留 API 函数（不影响，后端不改） |

---

## 5. 查看模式点击即编辑

### 当前问题

查看模式下，标题、日期、相关人、时间段、象限等字段全部禁用 (`readOnly`、`disabled`、`pointerEvents: none`)。用户必须先点"编辑"按钮才能操作，多了一步。

### 目标

**查看模式下点击任何可编辑字段，自动切换到编辑模式，并聚焦到该字段。**

### 字段与行为

| 字段 | 当前 view 模式行为 | 改后行为 |
|------|-------------------|---------|
| 标题 | `readOnly` | 点击 → `switchToEditMode()` → 聚焦标题 |
| 日期 | `pointerEvents: none` | 点击 → `switchToEditMode()` → 打开日期选择器 |
| 相关人 | `readOnly` | 点击 → `switchToEditMode()` → 聚焦相关人 |
| 时间段 | `disabled` | 点击 → `switchToEditMode()` → 选中被点击的 tab |
| 象限 | `pointerEvents: none` | 点击 → `switchToEditMode()` → 选中被点击的象限 |
| 进度条 | `disabled` | 点击 → `switchToEditMode()` → 聚焦进度条 |
| 内容区 | 已实现 | 无选区时切编辑，有选区时弹「收入待处理」 |

### 实现方式

**不改 `setModalMode` 中的禁用逻辑**（编辑模式控制保持不变），而是：

1. 在 view 模式下给左栏 `.task-modal-left` 添加一个覆盖层点击监听
2. 点击时判断点中的目标元素，`switchToEditMode()` 后执行对应的聚焦/触发操作
3. 或者更简单：**view 模式下不禁用这些字段，让它们可交互，交互时自动进编辑模式**

推荐方案 2（更简单）：

- 标题：view 模式下保持 `readOnly`，添加 `onclick` → 如果是 view 则 `switchToEditMode()`
- 日期：view 模式下保留 `pointerEvents`，但 `toggleDatePicker()` 入口处如果是 view 则先 `switchToEditMode()`
- 相关人：同标题
- 时间段 tab：按钮 click handler 里如果是 view 则先 `switchToEditMode()`
- 象限：同上
- 进度条：同上

核心改动只在各字段的 click handler 里加一行判断。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/assets/js/modal.js` | `setModalMode()`：view 模式下不再设 `pointerEvents: none`；各 click handler 开头加 `if (modalMode === 'view') switchToEditMode()` |
| `frontend/assets/js/datepicker.js` | `toggleDatePicker()`：移除 `if (modalMode === 'view') return`，改为自动 `switchToEditMode()` |

---

## 6. 验证清单

### 导出功能移除
- [ ] 弹窗标题栏无 📤 导出按钮
- [ ] 无报错

### 点击即编辑
- [ ] 查看模式 → 点击标题 → 进编辑 + 标题获焦
- [ ] 查看模式 → 点击日期 → 进编辑 + 日期选择器弹出
- [ ] 查看模式 → 点击相关人 → 进编辑 + 相关人获焦
- [ ] 查看模式 → 点击时间段按钮 → 进编辑 + 该 tab 选中
- [ ] 查看模式 → 点击象限 → 进编辑 + 该象限选中
- [ ] 查看模式 → 点击进度条 → 进编辑 + 进度条可拖
- [ ] 查看模式 → 点击内容（无选区）→ 进编辑
- [ ] 查看模式 → 选中内容文字 → 弹「收入待处理」
- [ ] 编辑模式下各字段正常可操作
- [ ] 新建模式不受影响
