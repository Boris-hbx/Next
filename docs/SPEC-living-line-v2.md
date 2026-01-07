# Living Line V2 优化规范

## 概述

对 Living Line 的呼吸效果和涟漪效果进行优化，使其更加自然、舒缓、有生命感。

---

## 优化一：呼吸效果（上下起伏）

### 当前问题
- 仅透明度/粗细变化，视觉感知不明显
- 缺乏"呼吸"的空间感

### 设计目标
**像一个人躺着呼吸时胸口的上下起伏**

### 效果描述

```
静止状态（吸气前）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 基准线

吸气中（线条向上隆起）
        ╭───────╮
━━━━━━━╯         ╰━━━━━━━━━━━━  ← 中央隆起

吸气顶峰
      ╭───────────╮
━━━━━╯             ╰━━━━━━━━━━  ← 最高点

呼气中（缓慢回落）
        ╭───────╮
━━━━━━━╯         ╰━━━━━━━━━━━━  ← 下降

呼气完毕（回到基准）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 基准线
```

### 参数配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 周期 | 3-4秒 | 类似人的呼吸频率 |
| 最大隆起高度 | 4-6px | 足够感知但不夸张 |
| 隆起宽度 | 屏幕宽度的 40-60% | 中央区域缓慢起伏 |
| 曲线形状 | 高斯曲线 | 中央最高，两侧平滑过渡 |
| 缓动函数 | ease-in-out | 呼吸的自然节奏 |

### 波形公式

```javascript
// 呼吸相位（0 → 2π 循环）
breathPhase += (dt / breathCycle) * Math.PI * 2;

// 呼吸高度（正弦波，只取正半周）
// 使用 sin² 让曲线更平滑（在顶部和底部停留更久）
const breathProgress = (Math.sin(breathPhase) + 1) / 2;  // 0~1
const breathHeight = breathProgress * maxBreathHeight;    // 0~6px

// 空间分布（高斯曲线）
function getBreathOffset(x, centerX, breathHeight) {
    const sigma = screenWidth * 0.2;  // 标准差
    const dist = x - centerX;
    return breathHeight * Math.exp(-(dist * dist) / (2 * sigma * sigma));
}
```

### 视觉效果
- 整条线像有一个缓慢呼吸的"胸腔"在中央
- 吸气时中央隆起，呼气时缓慢回落
- 配合轻微的透明度变化（吸气时更亮）

### 光晕效果（重点）

**参考**：左侧栏收起时的呼吸光晕（scaleX + blur + opacity）

```
呼气状态（收缩）
━━━━━━━━━━━━━━━━━━━━  ← 线条本身
    ░░░░░░░░░░        ← 淡淡的光晕

吸气状态（扩张）
      ╭──────╮
━━━━━╯        ╰━━━━━  ← 线条隆起
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒    ← 光晕扩大、更亮、更模糊
```

#### 光晕参数

| 参数 | 呼气（收缩） | 吸气（扩张） |
|------|-------------|-------------|
| 光晕宽度 | 线条宽度 ×1 | 线条宽度 ×3 |
| 光晕高度 | 6px | 18px |
| 模糊程度 | 4px | 12px |
| 透明度 | 0.2 | 0.6 |
| 颜色 | 靛蓝 #6366f1 | 靛蓝偏亮 |

#### 实现方式

```javascript
// 绘制光晕层（在主线条下方）
function drawBreathGlow(ctx, width, baseY, breathProgress) {
    const centerX = width / 2;
    const glowWidth = width * 0.3 * (1 + breathProgress * 2);  // 扩张时变宽
    const glowHeight = 6 + breathProgress * 12;                 // 6~18px
    const glowBlur = 4 + breathProgress * 8;                    // 4~12px blur
    const glowOpacity = 0.2 + breathProgress * 0.4;             // 0.2~0.6

    // 创建径向渐变
    const gradient = ctx.createRadialGradient(
        centerX, baseY, 0,
        centerX, baseY, glowWidth / 2
    );
    gradient.addColorStop(0, `rgba(99, 102, 241, ${glowOpacity})`);
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    // 绘制椭圆形光晕
    ctx.save();
    ctx.filter = `blur(${glowBlur}px)`;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(centerX, baseY, glowWidth / 2, glowHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
```

#### 效果感受
- 像心脏跳动时胸口发出的柔和光芒
- 吸气时光晕"膨胀"，照亮周围
- 呼气时光晕"收缩"，回归平静
- 光晕有羽化边缘，不是硬边

---

## 优化二：涟漪效果（呼吸节奏）

### 当前问题
- 涟漪扩散太快，看起来像"颤抖"
- 缺乏节奏感，显得杂乱

### 设计目标
**像水面上平静的涟漪，缓慢、有规律地从中心向两侧扩散**

### 效果描述

```
时间 T=0（鼠标靠近，产生第一个波）
        ╭╮
━━━━━━━╯╰━━━━━━━━━━━━━━━━━━━

时间 T=1s（第一个波扩散，产生第二个波）
      ╭╮  ╭╮
━━━━━╯  ╰╯  ╰━━━━━━━━━━━━━━

时间 T=2s（持续扩散）
    ╭╮    ╭╮    ╭╮
━━━╯  ╰━━╯  ╰━━╯  ╰━━━━━━━

时间 T=3s（涟漪到达边缘，逐渐消散）
  ╭╮      ╭╮      ╭╮
━╯  ╰━━━━╯  ╰━━━━╯  ╰━━━━
```

### 参数配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 涟漪产生间隔 | 1.5-2秒 | 与呼吸节奏一致 |
| 扩散速度 | 0.05 px/ms | 缓慢扩散（原来0.25太快） |
| 波长 | 80-100px | 更长的波长，更舒缓 |
| 振幅 | 2-3px | 轻柔的波动 |
| 衰减系数 | 0.998 | 缓慢衰减 |
| 最大扩散距离 | 400px | 扩散到足够远 |

### 波形公式

```javascript
// 涟漪产生逻辑
if (isMouseNear && peakHeight > 3) {
    if (currentTime - lastRippleTime > 1800) {  // 1.8秒产生一个
        ripples.push({
            originX: anchorX,
            spread: 0,
            amplitude: 2.5,
            phase: 0
        });
        lastRippleTime = currentTime;
    }
}

// 涟漪更新
ripples.forEach(ripple => {
    ripple.spread += 0.05 * dt;      // 缓慢扩散
    ripple.amplitude *= 0.998;        // 缓慢衰减
    ripple.phase += dt * 0.003;       // 缓慢相位推进
});

// 涟漪偏移计算（正弦波）
function getRippleOffset(x, ripple) {
    const dist = Math.abs(x - ripple.originX);
    if (dist > ripple.spread || dist === 0) return 0;

    // 波峰在扩散前沿
    const wavePos = (ripple.spread - dist) / wavelength;
    const wave = Math.sin(wavePos * Math.PI * 2);

    // 距离衰减（越远振幅越小）
    const distFactor = 1 - (dist / ripple.spread);

    return wave * ripple.amplitude * distFactor;
}
```

### 视觉效果
- 鼠标靠近时，以鼠标位置为中心，每 1.8 秒产生一个涟漪
- 涟漪缓慢向两侧扩散，像平静湖面上的水波
- 多个涟漪叠加，形成层次感
- 鼠标离开后，涟漪继续扩散直到消散

---

## 整体效果

### 无交互时（平静呼吸）
```
呼吸周期 3.5秒，中央区域上下起伏 0~5px
透明度随呼吸 0.5~0.8
像一条沉睡的海平线
```

### 鼠标靠近时（磁吸 + 涟漪）
```
线条被吸起（现有效果保持）
+ 每 1.8秒 从吸起点产生一个涟漪
+ 涟漪缓慢向两侧扩散
+ 呼吸效果继续但幅度减小
```

### 鼠标离开时（回归平静）
```
线条弹性回落
涟漪继续扩散直到消散
呼吸效果恢复正常幅度
```

---

## 配置参数汇总

```javascript
const CONFIG = {
    // 呼吸参数（上下起伏）
    breathCycle: 3500,           // 3.5秒周期
    breathMaxHeight: 5,          // 最大隆起 5px
    breathWidth: 0.5,            // 影响屏幕宽度的 50%
    breathOpacityRange: [0.5, 0.8],  // 透明度范围

    // 涟漪参数（缓慢扩散）
    rippleInterval: 1800,        // 1.8秒产生一个
    rippleSpeed: 0.05,           // 扩散速度 px/ms
    rippleWavelength: 90,        // 波长 90px
    rippleAmplitude: 2.5,        // 振幅 2.5px
    rippleDecay: 0.998,          // 衰减系数
    rippleMaxSpread: 400,        // 最大扩散 400px

    // 其他保持不变...
};
```

---

## 不在范围内

- 触摸屏支持
- 多点涟漪
- 颜色变化效果
- 声音反馈

---

## 审批

请确认以上规范是否符合预期。
