# SPEC-030: 拖拽任务时的视觉反馈优化

> 起草日期: 2026-01-12
> 状态: 已完成

## 背景

拖拽任务到其他时间域（Tab）时，需要清晰的视觉反馈让用户知道哪些区域可以放置，哪些不可以。

## 最终实现方案

### 设计理念

不再弹出额外的放置区域，而是直接使用顶部已有的 Tab 按钮作为放置目标。拖拽时通过视觉效果区分"可放置"和"不可操作"的元素。

### 拖拽时的视觉效果

```
拖拽 Today 里的任务时：

┌─────────────────────────────────────────────────────────────────┐
│  [例行]  │  Today   │  This Week  │  Next 30 Days  │  + 添加   │
│   灰色    │   灰色    │   放大发光    │    放大发光      │          │
│  不可操作  │  不可操作  │   可放置     │    可放置       │          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│     ┌──────────────┬──────────────┐                            │
│     │   优先处理    │  翻牌子了    │  ← 四象限也可放置           │
│     │   (高亮)     │   (高亮)     │                            │
│     ├──────────────┼──────────────┤                            │
│     │    待分类    │    短平快    │                            │
│     │   (高亮)     │   (高亮)     │                            │
│     └──────────────┴──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 状态说明

#### 1. 可放置状态 (drop-target)
**适用于：其他两个时间域 Tab 按钮**

- 放大 1.15 倍
- 紫色虚线轮廓 (outline)
- 紫色光晕阴影
- 背景变为半透明紫色
- 脉冲动画效果

```css
.matrix-tab.drop-target {
    transform: scale(1.15);
    outline: 2px dashed #667eea;
    outline-offset: 2px;
    background: rgba(102, 126, 234, 0.2);
    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.6),
                0 0 30px rgba(118, 75, 162, 0.4);
    animation: pulse-tab 1s ease-in-out infinite;
}
```

#### 2. 悬停放置状态 (drop-target + drag-over)
**适用于：鼠标悬停在可放置 Tab 上时**

- 放大 1.25 倍
- 紫色渐变背景
- 白色文字
- 白色实线轮廓
- 停止动画，保持稳定

```css
.matrix-tab.drop-target.drag-over {
    transform: scale(1.25);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    outline: 2px solid rgba(255, 255, 255, 0.8);
    animation: none;
}
```

#### 3. 不可操作状态 (drag-disabled)
**适用于：当前时间域 Tab 按钮、"例行"按钮**

- 缩小到 0.95 倍
- 透明度降低到 40%
- 灰度滤镜 60%
- 禁用鼠标事件

```css
.matrix-tab.drag-disabled,
.btn-routine.drag-disabled {
    transform: scale(0.95);
    opacity: 0.4;
    filter: grayscale(0.6);
    pointer-events: none;
    box-shadow: none;
}
```

### 交互流程

1. **开始拖拽** (mousedown + 移动超过 5px)
   - 创建任务的拖拽克隆跟随鼠标
   - 原任务变为半透明
   - 其他两个 Tab 按钮添加 `drop-target` 类（放大发光）
   - 当前 Tab 和"例行"按钮添加 `drag-disabled` 类（变灰）

2. **拖拽过程中** (mousemove)
   - 克隆跟随鼠标移动
   - 鼠标悬停在可放置 Tab 上时，添加 `drag-over` 类（进一步放大变色）
   - 鼠标悬停在四象限上时，象限高亮

3. **释放鼠标** (mouseup)
   - 如果在其他 Tab 上释放：任务移动到该 Tab 的"待分类"象限
   - 如果在四象限上释放：任务移动到该象限
   - 如果在其他位置释放：取消拖拽，任务回到原位

4. **结束拖拽**
   - 移除克隆元素
   - 移除所有 `drop-target`、`drag-over`、`drag-disabled` 类
   - 阻止接下来 200ms 内的点击事件（防止误触发任务详情）

### 放置规则

| 放置目标 | 行为 |
|---------|------|
| 其他时间域 Tab | 任务移动到该 Tab，象限设为"待分类" |
| 同 Tab 其他象限 | 任务移动到该象限 |
| 同 Tab 同象限 | 无操作 |
| 当前 Tab 按钮 | 不可放置（按钮已禁用） |
| "例行"按钮 | 不可放置（按钮已禁用） |

### 技术实现要点

#### 1. 使用 outline 而非 border
避免边框与按钮原有样式冲突重叠。`outline` 不占用布局空间，配合 `outline-offset` 可以在按钮外围显示虚线框。

#### 2. 避免拖拽后误触发点击事件

**问题**：拖拽任务到原位置释放时，浏览器会在 `mouseup` 之后触发 `click` 事件，导致任务详情弹窗被打开。

**解决方案**：使用事件捕获机制拦截点击事件

```javascript
// 点击拦截器
function blockNextClick(e) {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener('click', blockNextClick, true);
}

function endDrag() {
    // 在捕获阶段拦截下一次点击事件
    document.addEventListener('click', blockNextClick, true);

    // 200ms 后移除拦截器（保险措施）
    setTimeout(function() {
        document.removeEventListener('click', blockNextClick, true);
    }, 200);

    // ... 其他清理逻辑
}
```

**原理**：
- 第三个参数 `true` 表示在捕获阶段监听（比冒泡阶段更早）
- 拦截器只执行一次就自动移除
- 200ms 超时作为保险，防止拦截器残留

#### 3. 触屏支持
同样的逻辑也应用于 touch 事件 (touchstart, touchmove, touchend)，长按 300ms 后进入拖拽模式。

### 文件修改

- `frontend/templates/todo.html`：内联 CSS 样式 + JavaScript 拖拽逻辑
- `assets/css/style.css`：备份样式（与内联保持同步）

### 测试要点

1. 拖拽任务时，其他两个 Tab 按钮放大发光
2. 当前 Tab 和"例行"按钮变灰不可点击
3. 悬停在可放置 Tab 上时进一步放大变紫色
4. 放置到其他 Tab 后，任务出现在"待分类"象限
5. 放置到同 Tab 其他象限后，任务正确移动
6. 放回原位不触发任务详情弹窗
7. 触屏设备上长按拖拽同样有效果
