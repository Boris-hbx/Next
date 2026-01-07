# SPEC: 按钮流星边框动效

## 参考效果

右上角 "B" logo 的边框动效：一个亮点（流星）沿边框移动，带有渐变拖尾。

## 目标

将此效果应用到 "例行" 和 "Today" 按钮上（当有未完成任务时）。

## 效果示意

```
【静止状态】              【动效状态 - 有未完成任务】
┌───────────┐            ┌───────────┐
│   例行    │            │ ★→例行    │  ← 流星沿边框移动
└───────────┘            └───────────┘
                              ↑
                         亮点 + 拖尾
```

## 参考实现

"B" logo 使用的 CSS（名言栏 page-header 类似）：

```css
.element::before {
    background: conic-gradient(
        from var(--border-angle, 0deg),
        transparent 0%,
        transparent 92%,    /* 大部分透明 */
        #ffccbc 93%,        /* 拖尾开始 */
        #ffab91 94%,
        #ff8a80 95%,
        #ff5252 97%,        /* 亮点 */
        #ff6b6b 98%,
        transparent 100%    /* 拖尾结束 */
    );
    animation: border-rotate 5s linear infinite;
}

@property --border-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}

@keyframes border-rotate {
    0% { --border-angle: 0deg; }
    100% { --border-angle: 360deg; }
}
```

## 关键点

1. **流星效果**: `conic-gradient` 中只有约 8% 的弧度有颜色（92%-100%），其余透明
2. **拖尾渐变**: 从浅色到亮点再到透明，模拟流星拖尾
3. **颜色**: 使用蓝紫渐变 (#667eea → #764ba2) 匹配按钮颜色
4. **mask**: 镂空中间，只显示边框

## 实现方案

```css
.btn-routine.has-pending::before,
.matrix-tab[data-tab="today"].has-pending::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    padding: 2px;
    background: conic-gradient(
        from var(--btn-angle, 0deg),
        transparent 0%,
        transparent 92%,
        rgba(102, 126, 234, 0.3) 93%,
        rgba(102, 126, 234, 0.5) 94%,
        rgba(118, 75, 162, 0.7) 95%,
        #667eea 97%,
        #764ba2 98%,
        transparent 100%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: btn-border-rotate var(--rotate-speed, 4s) linear infinite;
    pointer-events: none;
}
```

## 速度规则

| 完成度 | 速度 | 说明 |
|--------|------|------|
| < 50%  | 2s   | 快速提醒 |
| ≥ 50%  | 5s   | 接近完成，放慢 |
| 100%   | 无   | 全部完成，停止动效 |

---

## 实现清单

| # | 改动 | 文件 |
|---|------|------|
| 1 | 修改 conic-gradient 为流星效果（92%-100%有色） | todo.html |
| 2 | 确保 @property 和 @keyframes 正确 | todo.html |
| 3 | 调整 z-index 和 overflow 确保可见 | todo.html |

## 验收标准

1. "例行"按钮有未完成例行任务时，显示流星边框
2. "Today"按钮有未完成今日任务时，显示流星边框
3. 流星效果与 "B" logo 类似（亮点 + 拖尾）
4. 完成度影响旋转速度
5. 全部完成时动效消失
