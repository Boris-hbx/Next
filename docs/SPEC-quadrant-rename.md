# SPEC: 四象限重命名

## 背景

传统艾森豪威尔矩阵的四个象限名称过于学术化，实际使用中不够直观：
- "不重要但紧急" - 概念模糊，用户不清楚什么任务该放这里
- "不重要不紧急" - 听起来像"不用做"，但实际上很多小任务需要处理

## 目标

重命名两个象限，使其更符合实际使用场景：

| 原名称 | 新名称 | 原 Emoji | 新 Emoji | 说明 |
|--------|--------|----------|----------|------|
| 不重要但紧急 | **待分类** | 📞 | 📥 | 暂时不确定归属的任务，待后续分类 |
| 不重要不紧急 | **短平快** | 🎮 | ⚡ | 快速完成的小任务、琐事 |

## 影响范围扫描

### 1. 后端 (backend/app.py)
```
第 264 行: 'not-important-urgent': '📞不重要紧急'
第 265 行: 'not-important-not-urgent': '🎮不重要不紧急'
```

### 2. 前端主页面 (frontend/templates/todo.html)

#### HTML 显示文字
```
第 1610 行: <span class="quadrant-title">不重要但紧急</span>
第 1623 行: <span class="quadrant-title">不重要不紧急</span>
```

#### 象限选择器 Emoji
```
第 1499-1500 行: drop-quadrant 📞 🎮
第 1524-1525 行: drop-quadrant 📞 🎮
第 1549-1550 行: drop-quadrant 📞 🎮
第 1703 行: q-option emoji 📞
第 1707 行: q-option emoji 🎮
```

#### JavaScript 映射
```
第 2388-2389 行: getQuadrantName() 函数
    'not-important-urgent': '不重要但紧急'
    'not-important-not-urgent': '不重要不紧急'

第 3027-3028 行: 另一个 getQuadrantName() 函数
    'not-important-urgent': '📞 不重要紧急'
    'not-important-not-urgent': '🎮 不重要不紧急'
```

### 3. 移动端页面 (frontend/templates/mobile/todo.html)
```
第 32 行: quad-btn q3 📞
第 33 行: quad-btn q4 🎮
第 59 行: quad-option "📞 不重要紧急"
第 60 行: quad-option "🎮 不重要不紧急"
第 290-291 行: quadrantEmoji 映射
```

### 4. 文档 (CLAUDE.md)
```
第 69 行: 重要紧急/重要不紧急/紧急不重要/不重要不紧急
```

### 5. 其他 SPEC 文档 (仅参考，不影响功能)
- docs/SPEC-changelog-horizontal.md
- docs/SPEC-task-audit-log.md
- docs/SPEC-infobox-fixes.md

### 6. 数据文件 (data/todos.json)
- 历史 changelog 中包含旧名称，如 "象限: 📞不重要紧急 → 🔥重要紧急"
- **建议**: 保留历史记录不变，仅修改代码中的显示映射

---

## 实现清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | backend/app.py | QUADRANT_NAMES 映射: 📞不重要紧急→📥待分类, 🎮不重要不紧急→⚡短平快 |
| 2 | todo.html | quadrant-title 文字: 不重要但紧急→待分类, 不重要不紧急→短平快 |
| 3 | todo.html | drop-quadrant emoji: 📞→📥, 🎮→⚡ |
| 4 | todo.html | q-option emoji: 📞→📥, 🎮→⚡ |
| 5 | todo.html | getQuadrantName() 两处: 更新映射 |
| 6 | mobile/todo.html | quad-btn emoji: 📞→📥, 🎮→⚡ |
| 7 | mobile/todo.html | quad-option 文字和 emoji |
| 8 | mobile/todo.html | quadrantEmoji 映射 |
| 9 | CLAUDE.md | 更新四象限说明文字 |

---

## 不变的部分

以下内部标识符保持不变（只改显示名称）：
- `quadrant` 值: `not-important-urgent`, `not-important-not-urgent`
- HTML id: `items-not-important-urgent`, `items-not-important-not-urgent`
- data 属性: `data-quadrant="not-important-urgent"` 等
- CSS 类名: `.q3`, `.q4`

---

## 验收标准

1. 四象限界面显示新名称：
   - Q3: "待分类" (原"不重要但紧急")
   - Q4: "短平快" (原"不重要不紧急")

2. 所有 emoji 更新：
   - Q3: 📥 (原 📞)
   - Q4: ⚡ (原 🎮)

3. 拖拽时的目标提示显示新名称

4. 任务详情弹窗中象限选择器显示新名称

5. Toast 提示显示新名称（如"已移动到待分类"）

6. 移动端显示新名称和 emoji

7. 历史 changelog 保持原样（不追溯修改）
