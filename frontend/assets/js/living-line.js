/**
 * Living Line V3 - 会呼吸、会感知、会回应的底部边界线
 *
 * 核心特性：
 * 1. 呼吸动画 - 5步渐进（10%→30%→50%→70%→90%→循环）+ 光晕膨胀
 * 2. 鼠标磁吸 - 靠近时拉起，跟随，回弹
 * 3. 缓慢涟漪 - 像水波一样有节奏地向两侧扩散
 * 4. 滚动联动 - 接近底部时上抬
 * 5. 保存脉冲 - 成功/失败的涟漪反馈
 */

(function() {
    'use strict';

    // ========== 配置参数 ==========
    const CONFIG = {
        // 基础形态
        baseHeight: 2.5,
        baseOpacity: 0.65,

        // 颜色
        colors: {
            normal: { r: 99, g: 102, b: 241 },    // #6366f1 (indigo)
            success: { r: 16, g: 185, b: 129 },   // #10b981 (emerald)
            error: { r: 239, g: 68, b: 68 }       // #ef4444 (red)
        },

        // 呼吸参数（5步渐进）
        breathCycle: 3500,           // 3.5秒周期（单次呼吸）
        breathMaxHeight: 5,          // 最大隆起高度 5px
        breathWidthRatio: 0.35,      // 隆起影响宽度
        breathOpacityMin: 0.5,       // 呼气时透明度
        breathOpacityMax: 0.85,      // 吸气时透明度
        breathPositions: [0.10, 0.30, 0.50, 0.70, 0.90],  // 5个呼吸位置

        // 光晕参数
        glowMinWidth: 0.12,          // 呼气时光晕宽度（屏幕比例）
        glowMaxWidth: 0.25,          // 吸气时光晕宽度（2倍）
        glowMinHeight: 6,            // 呼气时光晕高度
        glowMaxHeight: 14,           // 吸气时光晕高度（2倍）
        glowMinOpacity: 0.15,        // 呼气时光晕透明度
        glowMaxOpacity: 0.45,        // 吸气时光晕透明度

        // 磁吸参数
        magnetStartDistance: 120,
        magnetFullDistance: 60,
        maxPullHeight: 25,

        // 物理参数
        springForce: 0.12,
        damping: 0.82,
        followSpeed: 0.08,

        // 涟漪参数（缓慢扩散）
        rippleInterval: 1800,         // 1.8秒产生一个涟漪
        rippleSpeed: 0.06,            // 缓慢扩散 px/ms
        rippleDecay: 0.9985,          // 缓慢衰减
        rippleWavelength: 90,         // 波长 90px
        rippleAmplitude: 2.5,         // 振幅 2.5px
        rippleMaxSpread: 450,         // 最大扩散距离

        // 滚动参数
        scrollBottomThreshold: 0.92,
        scrollLiftHeight: 5,

        // 脉冲参数
        pulseDuration: 700,
        pulseMaxHeight: 15,
        pulseSpreadSpeed: 0.4
    };

    // ========== 状态管理 ==========
    const state = {
        // Canvas
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,

        // 呼吸（5步渐进）
        breathPhase: 0,
        breathProgress: 0,           // 0~1，0=呼气，1=吸气
        breathStep: 0,               // 当前步骤：0~4（对应5个位置）
        breathCenterX: 0,            // 当前呼吸中心位置
        currentOpacity: CONFIG.baseOpacity,

        // 磁吸
        isMouseNear: false,
        mouseX: 0,
        mouseY: 0,
        anchorX: 0,
        targetAnchorX: 0,
        peakHeight: 0,
        targetPeakHeight: 0,
        velocity: 0,

        // 涟漪
        ripples: [],
        lastRippleTime: 0,

        // 滚动
        scrollProgress: 0,
        isNearBottom: false,
        scrollLift: 0,
        targetScrollLift: 0,

        // 脉冲
        pulseActive: false,
        pulseProgress: 0,
        pulseType: 'success',
        pulseOriginX: 0,

        // 进度条联动
        progressBarActive: false,

        // 时间
        lastTime: 0
    };

    // ========== 初始化 ==========
    function init() {
        state.canvas = document.getElementById('living-line');
        if (!state.canvas) {
            state.canvas = document.createElement('canvas');
            state.canvas.id = 'living-line';
            document.body.appendChild(state.canvas);
        }

        state.canvas.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 50px;
            pointer-events: none;
            z-index: 1000;
        `;

        state.ctx = state.canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        setupEventListeners();

        state.lastTime = performance.now();
        requestAnimationFrame(animate);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        state.width = window.innerWidth;
        state.height = 50;

        state.canvas.width = state.width * dpr;
        state.canvas.height = state.height * dpr;
        state.canvas.style.width = state.width + 'px';
        state.canvas.style.height = state.height + 'px';

        state.ctx.scale(dpr, dpr);
    }

    // ========== 事件监听 ==========
    function setupEventListeners() {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    }

    function handleMouseMove(e) {
        state.mouseX = e.clientX;
        state.mouseY = e.clientY;

        const distanceFromBottom = window.innerHeight - e.clientY;

        if (distanceFromBottom < CONFIG.magnetStartDistance) {
            state.isMouseNear = true;
            const pullStrength = Math.min(1,
                (CONFIG.magnetStartDistance - distanceFromBottom) /
                (CONFIG.magnetStartDistance - CONFIG.magnetFullDistance)
            );
            const easedStrength = easeOutCubic(Math.max(0, pullStrength));
            state.targetPeakHeight = easedStrength * CONFIG.maxPullHeight;
            state.targetAnchorX = e.clientX;
        } else {
            state.isMouseNear = false;
            state.targetPeakHeight = 0;
        }
    }

    function handleMouseLeave() {
        state.isMouseNear = false;
        state.targetPeakHeight = 0;
    }

    function handleScroll() {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollHeight > 0) {
            state.scrollProgress = window.scrollY / scrollHeight;
            state.isNearBottom = state.scrollProgress > CONFIG.scrollBottomThreshold;
            state.targetScrollLift = state.isNearBottom ? CONFIG.scrollLiftHeight : 0;
        }
    }

    // ========== 物理更新 ==========
    function updatePhysics(dt) {
        const displacement = state.targetPeakHeight - state.peakHeight;
        const springForce = displacement * CONFIG.springForce;

        state.velocity += springForce;
        state.velocity *= CONFIG.damping;
        state.peakHeight += state.velocity;

        if (state.isMouseNear) {
            state.anchorX += (state.targetAnchorX - state.anchorX) * CONFIG.followSpeed;
        }

        state.scrollLift += (state.targetScrollLift - state.scrollLift) * 0.1;
    }

    // ========== 呼吸更新（5步渐进：左→右循环） ==========
    function updateBreath(dt) {
        state.breathPhase += (dt / CONFIG.breathCycle) * Math.PI * 2;

        // 完成一个呼吸周期后，移动到下一个位置
        if (state.breathPhase > Math.PI * 2) {
            state.breathPhase -= Math.PI * 2;
            // 步进到下一个位置：0→1→2→3→4→0...
            state.breathStep = (state.breathStep + 1) % 5;
        }

        // 使用 sin 实现平滑的隆起和回落
        // 0→π：隆起（0→1→0）
        const sinValue = Math.sin(state.breathPhase);
        state.breathProgress = Math.max(0, sinValue);  // 只取正值，0~1~0

        // 根据当前步骤计算呼吸中心位置
        // breathPositions: [0.10, 0.30, 0.50, 0.70, 0.90]
        state.breathCenterX = state.width * CONFIG.breathPositions[state.breathStep];

        // 透明度随呼吸变化
        state.currentOpacity = CONFIG.breathOpacityMin +
            state.breathProgress * (CONFIG.breathOpacityMax - CONFIG.breathOpacityMin);
    }

    // ========== 涟漪更新（缓慢扩散） ==========
    function updateRipples(dt, currentTime) {
        // 鼠标靠近且有拉起时，产生涟漪
        if (state.isMouseNear && state.peakHeight > 3) {
            if (currentTime - state.lastRippleTime > CONFIG.rippleInterval) {
                state.ripples.push({
                    originX: state.anchorX,
                    spread: 0,
                    amplitude: CONFIG.rippleAmplitude,
                    phase: 0
                });
                state.lastRippleTime = currentTime;
            }
        }

        // 更新所有涟漪
        state.ripples.forEach(ripple => {
            ripple.spread += CONFIG.rippleSpeed * dt;
            ripple.amplitude *= CONFIG.rippleDecay;
            ripple.phase += dt * 0.002;  // 缓慢相位推进
        });

        // 移除已衰减的涟漪
        state.ripples = state.ripples.filter(r =>
            r.amplitude > 0.15 && r.spread < CONFIG.rippleMaxSpread
        );
    }

    // ========== 脉冲更新 ==========
    function updatePulse(dt) {
        if (!state.pulseActive) return;

        state.pulseProgress += dt / CONFIG.pulseDuration;

        if (state.pulseProgress >= 1) {
            state.pulseActive = false;
            state.pulseProgress = 0;
        }
    }

    // ========== 计算呼吸偏移（高斯曲线） ==========
    function getBreathOffset(x, centerX, breathHeight) {
        const sigma = state.width * CONFIG.breathWidthRatio * 0.4;
        const dist = x - centerX;
        return breathHeight * Math.exp(-(dist * dist) / (2 * sigma * sigma));
    }

    // ========== 计算涟漪偏移 ==========
    function getRippleOffset(x) {
        let offset = 0;

        state.ripples.forEach(ripple => {
            const dist = Math.abs(x - ripple.originX);

            if (dist < ripple.spread && dist > 0) {
                // 波峰在扩散前沿
                const wavePos = (ripple.spread - dist) / CONFIG.rippleWavelength;
                const wave = Math.sin(wavePos * Math.PI * 2 + ripple.phase);

                // 距离衰减
                const distFactor = 1 - (dist / ripple.spread);
                offset += wave * ripple.amplitude * distFactor * distFactor;
            }
        });

        return offset;
    }

    // ========== 绘制 ==========
    function draw() {
        const ctx = state.ctx;
        const w = state.width;
        const h = state.height;

        ctx.clearRect(0, 0, w, h);

        const baseY = h - 4 - state.scrollLift;
        // 使用动态的呼吸中心位置（5步渐进）
        const breathCenterX = state.breathCenterX || w * CONFIG.breathPositions[0];

        // 1. 绘制呼吸光晕
        drawBreathGlow(ctx, w, baseY, breathCenterX);

        // 2. 绘制主线条
        drawMainLine(ctx, w, baseY, breathCenterX);

        // 3. 绘制脉冲效果
        if (state.pulseActive) {
            drawPulse(ctx, w, baseY);
        }
    }

    // ========== 绘制呼吸光晕 ==========
    function drawBreathGlow(ctx, width, baseY, centerX) {
        const bp = state.breathProgress;

        // 如果鼠标靠近，减弱呼吸光晕
        const glowStrength = state.isMouseNear ? 0.3 : 1;

        const glowWidth = width * (CONFIG.glowMinWidth + bp * (CONFIG.glowMaxWidth - CONFIG.glowMinWidth)) * glowStrength;
        const glowHeight = CONFIG.glowMinHeight + bp * (CONFIG.glowMaxHeight - CONFIG.glowMinHeight);
        const glowOpacity = CONFIG.glowMinOpacity + bp * (CONFIG.glowMaxOpacity - CONFIG.glowMinOpacity);

        // 呼吸时的垂直偏移
        const breathOffset = bp * CONFIG.breathMaxHeight;
        const glowY = baseY - breathOffset;

        // 创建径向渐变
        const gradient = ctx.createRadialGradient(
            centerX, glowY, 0,
            centerX, glowY, glowWidth / 2
        );

        const color = CONFIG.colors.normal;
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${glowOpacity})`);
        gradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${glowOpacity * 0.4})`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);

        // 绘制椭圆形光晕
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(centerX, glowY, glowWidth / 2, glowHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ========== 绘制主线条 ==========
    function drawMainLine(ctx, width, baseY, breathCenterX) {
        const peakHeight = state.peakHeight;
        const anchorX = state.anchorX || width / 2;
        const hasRipples = state.ripples.length > 0;
        const breathHeight = state.breathProgress * CONFIG.breathMaxHeight;

        const color = CONFIG.colors.normal;
        const segments = 100;

        ctx.beginPath();

        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            let y = baseY;

            // 1. 呼吸起伏（在当前呼吸位置隆起）
            const breathOffset = getBreathOffset(x, breathCenterX, breathHeight);
            y -= breathOffset;

            // 2. 鼠标磁吸（如果有）
            if (peakHeight > 0.5) {
                const curveWidth = Math.min(300, width * 0.35);
                const distFromAnchor = Math.abs(x - anchorX);
                if (distFromAnchor < curveWidth) {
                    const normalizedDist = distFromAnchor / curveWidth;
                    const curveHeight = peakHeight * Math.exp(-normalizedDist * normalizedDist * 3);
                    y -= curveHeight;
                }
            }

            // 3. 涟漪效果
            if (hasRipples) {
                const rippleOffset = getRippleOffset(x);
                y -= rippleOffset;
            }

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        // 线条粗细随呼吸变化
        const lineWidth = CONFIG.baseHeight + state.breathProgress * 0.8;

        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${state.currentOpacity})`;
        ctx.lineWidth = lineWidth + (state.isNearBottom ? 1 : 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    // ========== 绘制脉冲 ==========
    function drawPulse(ctx, width, baseY) {
        const progress = state.pulseProgress;
        const color = state.pulseType === 'success' ? CONFIG.colors.success : CONFIG.colors.error;

        const heightProgress = progress < 0.3
            ? easeOutCubic(progress / 0.3)
            : 1 - easeOutCubic((progress - 0.3) / 0.7);
        const pulseHeight = heightProgress * CONFIG.pulseMaxHeight;

        const spreadWidth = progress * width * CONFIG.pulseSpreadSpeed;
        const pulseOpacity = (1 - easeInCubic(progress)) * 0.8;

        ctx.beginPath();

        const originX = state.pulseOriginX || width / 2;
        const leftX = Math.max(0, originX - spreadWidth);
        const rightX = Math.min(width, originX + spreadWidth);

        ctx.moveTo(leftX, baseY);
        ctx.quadraticCurveTo(originX, baseY - pulseHeight, rightX, baseY);

        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${pulseOpacity})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // ========== 动画循环 ==========
    function animate(currentTime) {
        const dt = currentTime - state.lastTime;
        state.lastTime = currentTime;

        updateBreath(dt);
        updatePhysics(dt);
        updateRipples(dt, currentTime);
        updatePulse(dt);

        draw();

        requestAnimationFrame(animate);
    }

    // ========== 缓动函数 ==========
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeInCubic(t) {
        return t * t * t;
    }

    // ========== 公共 API ==========
    window.triggerLinePulse = function(type, originX) {
        state.pulseActive = true;
        state.pulseProgress = 0;
        state.pulseType = type || 'success';
        state.pulseOriginX = originX !== undefined ? originX : state.width / 2;
    };

    window.syncLineWithProgress = function(x, velocity) {
        state.progressBarActive = true;
        state.targetAnchorX = x;
        state.targetPeakHeight = Math.min(CONFIG.maxPullHeight, Math.abs(velocity) * 2);
        state.anchorX += (x - state.anchorX) * 0.15;
    };

    window.releaseLineProgress = function() {
        state.progressBarActive = false;
        state.targetPeakHeight = 0;
    };

    // ========== 启动 ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
