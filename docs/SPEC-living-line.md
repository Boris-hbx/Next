# Living Line 规范文档

## 概述

**名称**: Living Line（活线） / Tension Line（张力线）

**核心隐喻**: 一根被固定在页面底部、具有弹性与质量的线。平时像海平面轻微呼吸，被感知时会被吸引、拉起、偏移，失去作用力后回落、阻尼、归位。

**设计原则**:
- 不闪
- 不抢
- 所有动画都服从「张力 + 阻尼 + 回弹」物理模型

---

## 1. 基础形态（默认态）

### 1.1 静止状态（Idle / 呼吸）

| 属性 | 值 |
|------|-----|
| 高度 | 2px |
| 颜色 | 低饱和冷色渐变（如 `#4a5568` → `#718096` → `#4a5568`） |
| 不透明度 | 0.4 ~ 0.6 |

### 1.2 呼吸动画

| 属性 | 值 |
|------|-----|
| 周期 | 10–14 秒 |
| 幅度 | opacity ±0.08 或 brightness ±5% |
| 位置 | **绝不移动**，仅透明度/亮度微变 |

**感觉**: "它是活的，但你不用理它"

---

## 2. 交互一：滚动联动（Scroll Gravity）

### 2.1 触发条件
- 页面存在滚动条

### 2.2 滚动中行为

| 状态 | 效果 |
|------|------|
| 滚动中 | 线条亮度略升（+10%），中央渐变方向跟随滚动方向 |
| 位置 | **不上下移动**，保持稳定 |

### 2.3 滚动到底部（重点）

当 `scrollY` 接近底部（最后 8%）时：

| 效果 | 值 |
|------|-----|
| 线条整体向上抬 | 3–6px |
| 中心厚度 | 2px → 3px |
| 语义 | "你已经到边界了"（物理反馈，非提示） |

---

## 3. 交互二：鼠标磁吸效果（Magnetic Pull）

**这是最有记忆点的交互。**

### 3.1 触发区域

| 距离底部 | 效果 |
|----------|------|
| > 120px | 无影响 |
| 60–120px | 开始生效，吸力渐增 |
| < 60px | 达到最大吸力 |

### 3.2 物理模型

将线条想象为：
- **两端固定**
- **中间可被拉起**
- **有重量、有阻尼**

### 3.3 行为细节

#### 鼠标靠近时
```
拉起点 X = 鼠标 X 位置
拉起高度 = f(鼠标距底部距离)  // 越近越高
曲线形状 = 平滑贝塞尔曲线（不是尖角）
```

#### 鼠标左右移动
```
拉起点跟随鼠标 X
跟随延迟 = lerp 0.08~0.12
效果 = 像橡皮筋被拖着走
```

#### 鼠标远离
```
1. 线条先回弹
2. 慢慢归于水平
3. 一次很轻的 overshoot（海浪感）
```

### 3.4 关键设计原则
- ✅ 永远只有**一个**拉起峰值
- ❌ 不要多波峰
- ❌ 不要抖动

---

## 4. 交互三：保存反馈（Confirmation Pulse）

**目标**: 不打断、不提示、不弹窗，但"你知道它成功了"

### 4.1 保存成功

| 阶段 | 效果 |
|------|------|
| 0ms | 线条颜色瞬间提亮（绿色调） |
| 0-200ms | 中央出现向上脉冲 |
| 200-600ms | 脉冲左右扩散（涟漪效果） |
| 600-800ms | 回归呼吸态 |

**感觉**: 往平静水面丢了一颗很小的石子

### 4.2 保存失败

| 属性 | 值 |
|------|-----|
| 脉冲幅度 | 更小 |
| 颜色 | 偏暖（橙/红） |
| 次数 | 只一次，不闪 |

---

## 5. 交互四：进度条联动（Progress Sync）

**这是系统升维的地方。**

### 5.1 同步规则

当用户拖拽完成度进度条（横向）时：

| 属性 | 值 |
|------|-----|
| 拉起点 X | = 进度条滑块当前位置 |
| 拉起高度 | ∝ 拖拽速度（越快张力越大） |

**效果**: 用户潜意识觉得"我在操纵整个界面的状态张力"

### 5.2 松手时
- 线条有一次明显但克制的回弹
- 回归呼吸态

---

## 6. 技术实现

### 6.1 推荐方案

| 方案 | 推荐度 | 理由 |
|------|--------|------|
| **Canvas** | ⭐⭐⭐⭐⭐ | 最佳性能，完整物理控制 |
| SVG path | ⭐⭐⭐⭐ | 可行，但复杂曲线性能略差 |
| 纯 CSS | ⭐⭐ | 不够物理，难以实现磁吸效果 |

### 6.2 核心状态变量

```javascript
const lineState = {
    // 基础状态
    baseHeight: 2,           // 基础高度 px
    baseOpacity: 0.5,        // 基础透明度

    // 呼吸状态
    breathPhase: 0,          // 呼吸相位 0-2π
    breathSpeed: 0.0005,     // 呼吸速度

    // 张力状态
    tension: 0,              // 当前张力 0-1
    anchorX: 0,              // 拉起点 X 坐标
    peakHeight: 0,           // 当前峰值高度
    targetPeakHeight: 0,     // 目标峰值高度

    // 物理参数
    velocity: 0,             // 回弹速度
    damping: 0.85,           // 阻尼系数
    springForce: 0.15,       // 弹簧力度

    // 滚动状态
    scrollProgress: 0,       // 滚动进度 0-1
    isNearBottom: false,     // 是否接近底部

    // 脉冲状态
    pulseActive: false,      // 是否正在脉冲
    pulseProgress: 0,        // 脉冲进度 0-1
    pulseType: 'success',    // 'success' | 'error'
};
```

### 6.3 物理更新函数

```javascript
function updatePhysics(dt) {
    // 弹簧力
    const force = (state.targetPeakHeight - state.peakHeight) * state.springForce;

    // 更新速度（加力 + 阻尼）
    state.velocity += force;
    state.velocity *= state.damping;

    // 更新位置
    state.peakHeight += state.velocity;

    // 更新锚点位置（平滑跟随）
    state.anchorX += (state.targetAnchorX - state.anchorX) * 0.1;
}
```

### 6.4 曲线绘制函数

```javascript
function drawLine(ctx, width, height) {
    ctx.beginPath();
    ctx.moveTo(0, height);

    // 使用二次贝塞尔曲线绘制平滑拉起
    const peakX = state.anchorX;
    const peakY = height - state.peakHeight;

    // 左半边
    ctx.quadraticCurveTo(
        peakX * 0.5, height,      // 控制点
        peakX, peakY              // 峰值点
    );

    // 右半边
    ctx.quadraticCurveTo(
        peakX + (width - peakX) * 0.5, height,  // 控制点
        width, height                            // 终点
    );

    ctx.stroke();
}
```

### 6.5 事件监听

```javascript
// 鼠标位置监听
document.addEventListener('mousemove', (e) => {
    const distanceFromBottom = window.innerHeight - e.clientY;

    if (distanceFromBottom < 120) {
        // 计算吸力
        const pullStrength = Math.max(0, (120 - distanceFromBottom) / 60);
        state.targetPeakHeight = pullStrength * 20;  // 最大拉起 20px
        state.targetAnchorX = e.clientX;
    } else {
        state.targetPeakHeight = 0;
    }
});

// 滚动监听
window.addEventListener('scroll', () => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    state.scrollProgress = window.scrollY / scrollHeight;
    state.isNearBottom = state.scrollProgress > 0.92;
});

// 保存成功时触发脉冲
window.triggerLinePulse = function(type = 'success') {
    state.pulseActive = true;
    state.pulseProgress = 0;
    state.pulseType = type;
};
```

---

## 7. 文件结构

```
frontend/templates/
├── base.html              # 添加 <canvas id="living-line">
└── ...

assets/js/
└── living-line.js         # Living Line 核心逻辑（新建）

assets/css/
└── style.css              # 移除旧的 .bottom-breath-line 样式
```

---

## 8. 实施阶段

### Phase 1: 基础形态
- [ ] 创建 Canvas 元素
- [ ] 实现静止态绘制（2px 线条）
- [ ] 实现呼吸动画（透明度微变）

### Phase 2: 鼠标磁吸
- [ ] 实现鼠标位置检测
- [ ] 实现物理引擎（弹簧 + 阻尼）
- [ ] 实现贝塞尔曲线拉起效果
- [ ] 实现平滑跟随和回弹

### Phase 3: 滚动联动
- [ ] 实现滚动进度检测
- [ ] 实现接近底部的抬升效果

### Phase 4: 保存脉冲
- [ ] 实现脉冲动画
- [ ] 与保存 API 联动
- [ ] 区分成功/失败样式

### Phase 5: 进度条联动
- [ ] 与完成度进度条联动
- [ ] 实现拖拽速度响应

---

## 9. 不在范围内

- 移动端适配（触摸事件）
- 多线条效果
- 3D 变换
- 音效反馈

---

## 10. 设计哲学

> 你不是在"加一个动效"，
> 而是在给界面加一条"会呼吸、会感知、会回应的边界"。

**所有交互共用同一根线，所有动效遵循同一物理模型，没有"为了炫而炫"的动画。**

---

## 审批

请确认以上规范是否符合预期，确认后开始实施。
