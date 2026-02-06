// ========== 彗星小球粒子效果 ==========
// Header Particles Animation (完整版：尾巴+排斥+恐惧+爆炸+汇合+侧边栏贯通)

(function() {
    var canvas = document.getElementById('header-particles');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var header = document.getElementById('top-header');
    var sidebar = document.getElementById('sidebar');

    // 区域配置 - L形区域：顶栏全宽 + 侧边栏
    var headerHeight = 48;
    var sidebarWidth = 220;

    // 粒子配置
    var particles = [];
    var fragments = [];
    var fishes = [];
    var fishFragments = [];
    var particleCount = parseInt(localStorage.getItem('particleCount')) || 6;
    var fishCount = 0;
    var maxTailLength = 12;
    var colors = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#f472b6'];
    var fishColors = ['#ff9966', '#66ccff', '#99ff99'];

    // ===== 小球可调参数 =====
    window.ballConfig = {
        repelRadius: 180,
        repelForce: 12,
        maxSpeed: 10,
        friction: 0.97,
        tailLength: 5
    };

    // 鼠标位置
    var mouse = { x: -1000, y: -1000 };

    // 恐惧与爆炸配置
    var fearThreshold = 15;
    var explodeThreshold = 45;
    var reuniteDelay = 60;

    // 从闪电生成的小球队列
    var spawningParticles = [];
    var spawnCheckInterval = 30;
    var spawnCheckCounter = 0;

    // 天气效果配置
    var weatherEffects = {
        sunny: { speedMult: 1.2, colorShift: 0, brightness: 1.1 },
        cloudy: { speedMult: 1.0, colorShift: 0, brightness: 0.9 },
        rainy: { speedMult: 0.7, colorShift: 30, brightness: 0.8 },
        snowy: { speedMult: 0.4, colorShift: 60, brightness: 1.0 },
        stormy: { speedMult: 1.5, colorShift: -20, brightness: 0.7 }
    };
    var raindrops = [];
    var snowflakes = [];

    var weatherEffectEnabled = localStorage.getItem('weatherEffectEnabled') !== 'false';

    function getWeatherEffect() {
        var type = (window.currentWeather && window.currentWeather.type) || 'cloudy';
        return weatherEffects[type] || weatherEffects.cloudy;
    }

    function adjustColor(hexColor, hueShift, brightness) {
        var r = parseInt(hexColor.slice(1, 3), 16);
        var g = parseInt(hexColor.slice(3, 5), 16);
        var b = parseInt(hexColor.slice(5, 7), 16);

        r = Math.min(255, Math.floor(r * brightness));
        g = Math.min(255, Math.floor(g * brightness));
        b = Math.min(255, Math.floor(b * brightness));

        if (hueShift > 0) {
            b = Math.min(255, b + hueShift);
            r = Math.max(0, r - hueShift / 2);
        } else if (hueShift < 0) {
            r = Math.min(255, r - hueShift);
            b = Math.max(0, b + hueShift / 2);
        }

        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function createRaindrop() {
        return {
            x: Math.random() * canvas.width,
            y: -10,
            speed: 8 + Math.random() * 6,
            length: 10 + Math.random() * 15
        };
    }

    function createSnowflake() {
        return {
            x: Math.random() * canvas.width,
            y: -5,
            speed: 1 + Math.random() * 2,
            size: 2 + Math.random() * 3,
            drift: (Math.random() - 0.5) * 0.5
        };
    }

    function updateWeatherParticles() {
        if (!weatherEffectEnabled) {
            raindrops = [];
            snowflakes = [];
            return;
        }

        var weatherType = (window.currentWeather && window.currentWeather.type) || 'cloudy';

        if (weatherType === 'rainy' || weatherType === 'stormy') {
            if (Math.random() < 0.3) raindrops.push(createRaindrop());
            for (var i = raindrops.length - 1; i >= 0; i--) {
                raindrops[i].y += raindrops[i].speed;
                if (raindrops[i].y > canvas.height) raindrops.splice(i, 1);
            }
        } else {
            raindrops = [];
        }

        if (weatherType === 'snowy') {
            if (Math.random() < 0.1) snowflakes.push(createSnowflake());
            for (var i = snowflakes.length - 1; i >= 0; i--) {
                snowflakes[i].y += snowflakes[i].speed;
                snowflakes[i].x += snowflakes[i].drift;
                if (snowflakes[i].y > canvas.height) snowflakes.splice(i, 1);
            }
        } else {
            snowflakes = [];
        }
    }

    function drawWeatherParticles() {
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
        ctx.lineWidth = 1;
        raindrops.forEach(function(drop) {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x, drop.y + drop.length);
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        snowflakes.forEach(function(flake) {
            ctx.beginPath();
            ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function isInLShape(x, y) {
        return y <= headerHeight || x <= sidebarWidth;
    }

    function getLShapeBounds(y) {
        if (y <= headerHeight) {
            return { minX: 0, maxX: canvas.width };
        } else {
            return { minX: 0, maxX: sidebarWidth };
        }
    }

    function createParticle(index, x, y, radius) {
        var baseAngle = Math.random() < 0.5 ? 0 : Math.PI;
        var angle = baseAngle + (Math.random() - 0.5) * Math.PI / 3;
        var speed = 1.5 + Math.random() * 1.0;
        var spawnInHeader = Math.random() < 0.8;
        var spawnX = x !== undefined ? x : (spawnInHeader ? Math.random() * canvas.width : Math.random() * sidebarWidth);
        var spawnY = y !== undefined ? y : (spawnInHeader ? Math.random() * headerHeight : headerHeight + Math.random() * (canvas.height - headerHeight));
        return {
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: radius || (4 + Math.random() * 3),
            color: colors[index % colors.length],
            alpha: 0.7 + Math.random() * 0.2,
            trail: [],
            stuckTime: 0,
            isShaking: false,
            shakeOffset: { x: 0, y: 0 },
            targetAngle: angle,
            turnSpeed: 0.015 + Math.random() * 0.015,
            nextTurnTime: 100 + Math.floor(Math.random() * 150)
        };
    }

    function initParticles() {
        particles = [];
        fragments = [];
        fishes = [];
        fishFragments = [];
        spawningParticles = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push(createParticle(i));
        }
        for (var i = 0; i < fishCount; i++) {
            fishes.push(createFish(i));
        }
    }

    function spawnFromLightning() {
        var logo = document.getElementById('app-logo');
        var logoRect = logo ? logo.getBoundingClientRect() : { left: 30, top: 24, width: 24, height: 24 };
        var centerX = logoRect.left + logoRect.width / 2;
        var centerY = logoRect.top + logoRect.height / 2;

        var index = particles.length + spawningParticles.length;
        var sp = {
            x: centerX,
            y: centerY,
            centerX: centerX,
            centerY: centerY,
            angle: Math.random() * Math.PI * 2,
            radius: 5,
            spiralSpeed: 0.15 + Math.random() * 0.05,
            expandSpeed: 0.8,
            rotations: 0,
            maxRotations: 2,
            color: colors[index % colors.length],
            size: 4 + Math.random() * 2,
            alpha: 0.9,
            trail: []
        };
        spawningParticles.push(sp);
    }

    function updateSpawningParticle(sp) {
        sp.trail.push({ x: sp.x, y: sp.y });
        if (sp.trail.length > 10) sp.trail.shift();

        sp.angle += sp.spiralSpeed;
        sp.radius += sp.expandSpeed;
        sp.rotations += sp.spiralSpeed / (Math.PI * 2);

        sp.x = sp.centerX + Math.cos(sp.angle) * sp.radius;
        sp.y = sp.centerY + Math.sin(sp.angle) * sp.radius;

        if (sp.rotations >= sp.maxRotations) {
            var newP = createParticle(particles.length, sp.x, sp.y);
            newP.vx = Math.cos(sp.angle) * 3;
            newP.vy = Math.sin(sp.angle) * 3;
            newP.color = sp.color;
            newP.trail = sp.trail.slice();
            particles.push(newP);
            return false;
        }
        return true;
    }

    function drawSpawningParticle(sp) {
        for (var i = 0; i < sp.trail.length; i++) {
            var t = sp.trail[i];
            var progress = (i + 1) / sp.trail.length;
            ctx.beginPath();
            ctx.arc(t.x, t.y, sp.size * progress * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = sp.color;
            ctx.globalAlpha = sp.alpha * progress * 0.5;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = sp.alpha;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    function checkParticleCount() {
        var totalActive = particles.length + spawningParticles.length;
        if (totalActive < particleCount) {
            spawnFromLightning();
        }
    }

    function createFish(index, x, y, size) {
        var direction = Math.random() < 0.5 ? 1 : -1;
        var facingAngle = direction > 0 ? 0 : Math.PI;
        var spawnInHeader = Math.random() < 0.8;
        var spawnX = x !== undefined ? x : (spawnInHeader ? Math.random() * canvas.width : Math.random() * sidebarWidth);
        var spawnY = y !== undefined ? y : (spawnInHeader ? 8 + Math.random() * (headerHeight - 16) : headerHeight + Math.random() * (canvas.height - headerHeight - 16));
        var fishSize = size || (6 + Math.random() * 3);
        return {
            x: spawnX, y: spawnY,
            vx: direction * (0.4 + Math.random() * 0.3),
            vy: (Math.random() - 0.5) * 0.1,
            size: fishSize,
            color: fishColors[index % fishColors.length],
            tailPhase: Math.random() * Math.PI * 2,
            direction: direction,
            facingAngle: facingAngle,
            angle: facingAngle,
            backwardTime: 0,
            turnSpeed: 0.15,
            isEscaping: false,
            escapePhase: 0,
            stuckTime: 0,
            isShaking: false,
            shakeOffset: { x: 0, y: 0 }
        };
    }

    function normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    function isFishStuckAtEdge(f) {
        var edgeMargin = f.size + 5;
        var bounds = getLShapeBounds(f.y);
        var nearEdge = f.x < edgeMargin || f.x > bounds.maxX - edgeMargin ||
                       f.y < edgeMargin || f.y > canvas.height - edgeMargin;
        var dx = f.x - mouse.x;
        var dy = f.y - mouse.y;
        var nearMouse = Math.sqrt(dx * dx + dy * dy) < window.ballConfig.repelRadius + 20;
        return nearEdge && nearMouse;
    }

    function explodeFish(f, index) {
        for (var i = 0; i < 3; i++) {
            var angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
            var speed = 2 + Math.random() * 1.5;
            fishFragments.push({
                x: f.x, y: f.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: f.size * 0.5,
                color: f.color,
                tailPhase: Math.random() * Math.PI * 2,
                angle: angle,
                life: reuniteDelay,
                parentIndex: index,
                ignoreMouseTime: 40
            });
        }
        fishes.splice(index, 1);
    }

    function reuniteFishFragments() {
        var groups = {};
        fishFragments.forEach(function(f, i) {
            if (!groups[f.parentIndex]) groups[f.parentIndex] = [];
            groups[f.parentIndex].push({ fragment: f, index: i });
        });
        var toRemove = [];
        for (var parentIndex in groups) {
            var group = groups[parentIndex];
            if (group.length > 0 && group[0].fragment.life <= 0) {
                var cx = 0, cy = 0;
                group.forEach(function(g) { cx += g.fragment.x; cy += g.fragment.y; });
                cx /= group.length; cy /= group.length;
                var newFish = createFish(parseInt(parentIndex), cx, cy);
                newFish.vx = (Math.random() - 0.5) * 1.5;
                newFish.vy = (Math.random() - 0.5) * 1.5;
                fishes.push(newFish);
                group.forEach(function(g) { toRemove.push(g.index); });
            }
        }
        toRemove.sort(function(a, b) { return b - a; });
        toRemove.forEach(function(i) { fishFragments.splice(i, 1); });
    }

    function updateFish(f, index) {
        var weatherEffect = getWeatherEffect();
        var speedMult = weatherEffect.speedMult;

        f.tailPhase += 0.15 * speedMult;
        var dx = f.x - mouse.x;
        var dy = f.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var escapeAngle = Math.atan2(dy, dx);
        var velocityAngle = Math.atan2(f.vy, f.vx);

        if (dist < window.ballConfig.repelRadius && dist > 0) {
            f.isEscaping = true;
            var angleDiff = normalizeAngle(escapeAngle - f.facingAngle);
            var isFacingAway = Math.abs(angleDiff) < Math.PI / 2;

            if (isFacingAway) {
                f.escapePhase = 0;
                var force = (window.ballConfig.repelRadius - dist) / window.ballConfig.repelRadius * 6;
                f.vx += (dx / dist) * force;
                f.vy += (dy / dist) * force;
            } else {
                if (f.escapePhase === 0) {
                    f.escapePhase = 1;
                    f.backwardTime = 0;
                }
                if (f.escapePhase === 1) {
                    f.backwardTime++;
                    var backwardForce = (window.ballConfig.repelRadius - dist) / window.ballConfig.repelRadius * 3;
                    f.vx += (dx / dist) * backwardForce;
                    f.vy += (dy / dist) * backwardForce;
                    if (f.backwardTime > 15 || dist < window.ballConfig.repelRadius * 0.5) {
                        f.escapePhase = 2;
                    }
                }
                if (f.escapePhase === 2) {
                    var turnAmount = normalizeAngle(escapeAngle - f.facingAngle) * 0.3;
                    f.facingAngle = normalizeAngle(f.facingAngle + turnAmount);
                    var force = (window.ballConfig.repelRadius - dist) / window.ballConfig.repelRadius * 5;
                    f.vx += (dx / dist) * force;
                    f.vy += (dy / dist) * force;
                    if (Math.abs(normalizeAngle(escapeAngle - f.facingAngle)) < Math.PI / 4) {
                        f.escapePhase = 0;
                    }
                }
            }
        } else {
            f.isEscaping = false;
            f.escapePhase = 0;
            f.backwardTime = 0;
        }

        if (isFishStuckAtEdge(f)) {
            f.stuckTime++;
            if (f.stuckTime > fearThreshold) {
                f.isShaking = true;
                f.shakeOffset = { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 };
            }
            if (f.stuckTime > explodeThreshold) {
                explodeFish(f, index);
                return false;
            }
        } else {
            f.stuckTime = Math.max(0, f.stuckTime - 2);
            f.isShaking = false;
            f.shakeOffset = { x: 0, y: 0 };
        }

        var inHeader = f.y <= headerHeight;
        if (inHeader) {
            f.vy += (Math.random() - 0.5) * 0.02;
            f.vy *= 0.95;
        } else {
            f.vx += (Math.random() - 0.5) * 0.03;
            f.vy += (Math.random() - 0.5) * 0.03;
        }
        f.x += f.vx;
        f.y += f.vy;

        var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
        var minSpeed = 0.3 * speedMult;
        if (speed < minSpeed) {
            var angle = inHeader ? (Math.random() < 0.5 ? 0 : Math.PI) : Math.random() * Math.PI * 2;
            f.vx = Math.cos(angle) * 0.5 * speedMult;
            f.vy = Math.sin(angle) * 0.5 * speedMult;
        }
        var maxSpeed = 4 * speedMult;
        if (speed > maxSpeed) {
            f.vx = (f.vx / speed) * maxSpeed;
            f.vy = (f.vy / speed) * maxSpeed;
        }
        f.vx *= 0.995;
        f.vy *= 0.995;

        if (f.y > headerHeight && f.x > sidebarWidth - f.size) {
            var overY = f.y - headerHeight;
            var overX = f.x - (sidebarWidth - f.size);
            if (overY < overX) {
                f.y = headerHeight - f.size;
                f.vy = -Math.abs(f.vy);
            } else {
                f.x = sidebarWidth - f.size;
                f.vx = -Math.abs(f.vx);
            }
        }
        var bounds = getLShapeBounds(f.y);
        if (f.x < f.size) { f.x = f.size; f.vx = Math.abs(f.vx); }
        else if (f.x > bounds.maxX - f.size) { f.x = bounds.maxX - f.size; f.vx = -Math.abs(f.vx); }
        if (f.y < f.size) { f.y = f.size; f.vy = Math.abs(f.vy); }
        else if (f.y > canvas.height - f.size) { f.y = canvas.height - f.size; f.vy = -Math.abs(f.vy); }

        velocityAngle = Math.atan2(f.vy, f.vx);
        if (!f.isEscaping || f.escapePhase === 0) {
            var targetAngle = velocityAngle;
            var angleDiff = normalizeAngle(targetAngle - f.facingAngle);
            var isBackward = Math.abs(angleDiff) > Math.PI / 2;
            if (isBackward) {
                f.backwardTime++;
                if (f.backwardTime > 30) {
                    f.facingAngle = normalizeAngle(f.facingAngle + angleDiff * 0.2);
                }
            } else {
                f.backwardTime = Math.max(0, f.backwardTime - 1);
                f.facingAngle = normalizeAngle(f.facingAngle + angleDiff * f.turnSpeed);
            }
        }

        f.angle = f.facingAngle;
        f.direction = Math.cos(f.angle) >= 0 ? 1 : -1;
        return true;
    }

    function updateFishFragment(ff) {
        ff.tailPhase += 0.2;
        if (ff.ignoreMouseTime > 0) ff.ignoreMouseTime--;
        else {
            var dx = ff.x - mouse.x;
            var dy = ff.y - mouse.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < window.ballConfig.repelRadius && dist > 0) {
                var force = (window.ballConfig.repelRadius - dist) / window.ballConfig.repelRadius * 0.5;
                ff.vx += (dx / dist) * force;
                ff.vy += (dy / dist) * force;
            }
        }
        ff.vx *= 0.98; ff.vy *= 0.98;
        ff.x += ff.vx; ff.y += ff.vy;
        ff.life--;
        ff.angle = Math.atan2(ff.vy, ff.vx);
        if (ff.y > headerHeight && ff.x > sidebarWidth - ff.size) {
            var overY = ff.y - headerHeight;
            var overX = ff.x - (sidebarWidth - ff.size);
            if (overY < overX) {
                ff.y = headerHeight - ff.size;
                ff.vy = -Math.abs(ff.vy);
            } else {
                ff.x = sidebarWidth - ff.size;
                ff.vx = -Math.abs(ff.vx);
            }
        }
        var bounds = getLShapeBounds(ff.y);
        if (ff.x < ff.size || ff.x > bounds.maxX - ff.size) {
            ff.vx = -ff.vx;
            ff.x = Math.max(ff.size, Math.min(bounds.maxX - ff.size, ff.x));
        }
        if (ff.y < ff.size || ff.y > canvas.height - ff.size) {
            ff.vy = -ff.vy;
            ff.y = Math.max(ff.size, Math.min(canvas.height - ff.size, ff.y));
        }
    }

    function drawFish(f) {
        var weatherEffect = getWeatherEffect();
        var transMult = getTransparencyMultiplier(f.y);
        var drawX = f.x + (f.shakeOffset ? f.shakeOffset.x : 0);
        var drawY = f.y + (f.shakeOffset ? f.shakeOffset.y : 0);
        ctx.save();
        ctx.translate(drawX, drawY);
        var angle = f.angle || 0;
        var flipY = Math.abs(angle) > Math.PI / 2;
        if (flipY) { ctx.rotate(angle + Math.PI); ctx.scale(1, -1); }
        else { ctx.rotate(angle); }
        var s = f.size;
        var tailSwing = Math.sin(f.tailPhase) * 0.3;

        var fishColor = adjustColor(f.color, weatherEffect.colorShift, weatherEffect.brightness);

        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = fishColor;
        ctx.globalAlpha = 0.85 * transMult;
        if (f.isShaking) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 15; }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 2, -s * 0.5 + tailSwing * s);
        ctx.lineTo(-s * 2, s * 0.5 + tailSwing * s);
        ctx.closePath();
        ctx.fillStyle = fishColor;
        ctx.globalAlpha = 0.7 * transMult;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.5, -s * 0.1, s * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1 * transMult;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.55, -s * 0.1, s * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = '#333333';
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawFishFragment(ff) {
        var transMult = getTransparencyMultiplier(ff.y) * (ff.life / reuniteDelay);
        ctx.save();
        ctx.translate(ff.x, ff.y);
        var angle = ff.angle || 0;
        var flipY = Math.abs(angle) > Math.PI / 2;
        if (flipY) { ctx.rotate(angle + Math.PI); ctx.scale(1, -1); }
        else { ctx.rotate(angle); }
        var s = ff.size;
        var tailSwing = Math.sin(ff.tailPhase) * 0.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = ff.color;
        ctx.globalAlpha = 0.8 * transMult;
        ctx.shadowColor = ff.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 2, -s * 0.5 + tailSwing * s);
        ctx.lineTo(-s * 2, s * 0.5 + tailSwing * s);
        ctx.closePath();
        ctx.globalAlpha = 0.6 * transMult;
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function isStuckAtEdge(p) {
        var edgeMargin = p.radius + 5;
        var bounds = getLShapeBounds(p.y);
        var nearEdge = p.x < edgeMargin || p.x > bounds.maxX - edgeMargin ||
                       p.y < edgeMargin || p.y > canvas.height - edgeMargin;
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var nearMouse = Math.sqrt(dx * dx + dy * dy) < window.ballConfig.repelRadius + 20;
        return nearEdge && nearMouse;
    }

    function explodeParticle(p, index) {
        var fragmentColors = [colors[(index) % colors.length], colors[(index + 2) % colors.length], colors[(index + 4) % colors.length]];
        for (var i = 0; i < 3; i++) {
            var angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
            var speed = 3 + Math.random() * 2;
            fragments.push({
                x: p.x,
                y: p.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: p.radius * 0.5,
                color: fragmentColors[i],
                alpha: 0.9,
                trail: [],
                life: reuniteDelay,
                parentIndex: index,
                ignoreMouseTime: 40
            });
        }
        particles.splice(index, 1);
    }

    function reuniteFragments() {
        var groups = {};
        fragments.forEach(function(f, i) {
            if (!groups[f.parentIndex]) groups[f.parentIndex] = [];
            groups[f.parentIndex].push({ fragment: f, index: i });
        });

        var toRemove = [];
        for (var parentIndex in groups) {
            var group = groups[parentIndex];
            if (group.length > 0 && group[0].fragment.life <= 0) {
                var cx = 0, cy = 0;
                group.forEach(function(g) { cx += g.fragment.x; cy += g.fragment.y; });
                cx /= group.length;
                cy /= group.length;

                var newP = createParticle(particles.length, cx, cy);
                var angle = Math.random() * Math.PI * 2;
                var speed = 1.5 + Math.random() * 1.0;
                newP.vx = Math.cos(angle) * speed;
                newP.vy = Math.sin(angle) * speed;
                particles.push(newP);

                group.forEach(function(g) { toRemove.push(g.index); });
            }
        }
        toRemove.sort(function(a, b) { return b - a; });
        toRemove.forEach(function(i) { fragments.splice(i, 1); });
    }

    function updateParticle(p, index) {
        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

        var dynamicTailLength = Math.floor(5 + speed * 2);
        dynamicTailLength = Math.max(5, Math.min(window.ballConfig.tailLength, dynamicTailLength));

        p.trail.push({ x: p.x, y: p.y });
        while (p.trail.length > dynamicTailLength) p.trail.shift();

        if (isStuckAtEdge(p)) {
            p.stuckTime++;
            if (p.stuckTime > fearThreshold) {
                p.isShaking = true;
                p.shakeOffset.x = (Math.random() - 0.5) * 3;
                p.shakeOffset.y = (Math.random() - 0.5) * 3;
            }
            if (p.stuckTime > explodeThreshold) {
                explodeParticle(p, index);
                return false;
            }
        } else {
            p.stuckTime = Math.max(0, p.stuckTime - 2);
            p.isShaking = false;
            p.shakeOffset.x = 0;
            p.shakeOffset.y = 0;
        }

        var cfg = window.ballConfig;
        var inHeader = p.y <= headerHeight;

        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var isEscaping = false;

        if (dist < cfg.repelRadius && dist > 0) {
            isEscaping = true;
            var ratio = 1 - dist / cfg.repelRadius;
            var force = ratio * ratio * cfg.repelForce * 1.5;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
        }

        if (!isEscaping) {
            p.nextTurnTime--;
            if (p.nextTurnTime <= 0) {
                var currentAngle = Math.atan2(p.vy, p.vx);
                if (inHeader) {
                    if (Math.random() < 0.6) {
                        var baseAngle = Math.cos(currentAngle) > 0 ? 0 : Math.PI;
                        if (Math.random() < 0.2) baseAngle += Math.PI;
                        p.targetAngle = baseAngle + (Math.random() - 0.5) * Math.PI / 2;
                    } else {
                        p.targetAngle = currentAngle + (Math.random() - 0.5) * Math.PI * 0.6;
                    }
                } else {
                    p.targetAngle = Math.random() * Math.PI * 2;
                }
                p.nextTurnTime = 40 + Math.floor(Math.random() * 80);
            }

            var currentAngle = Math.atan2(p.vy, p.vx);
            var angleDiff = p.targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            var newAngle = currentAngle + angleDiff * p.turnSpeed * 1.5;
            var targetSpeed = 1.0 + Math.random() * 1.0;
            var newSpeed = Math.max(speed, targetSpeed);
            p.vx = Math.cos(newAngle) * newSpeed;
            p.vy = Math.sin(newAngle) * newSpeed;
        }

        if (inHeader && !isEscaping) p.vy *= 0.92;

        speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        var maxSpeed = isEscaping ? cfg.maxSpeed * 1.5 : cfg.maxSpeed;
        var minSpeed = 1.0;
        if (speed > maxSpeed) {
            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
        } else if (speed < minSpeed) {
            var angle = inHeader ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.5 : Math.random() * Math.PI * 2;
            var boost = minSpeed + Math.random() * 0.5;
            p.vx = Math.cos(angle) * boost;
            p.vy = Math.sin(angle) * boost;
        }

        var friction = isEscaping ? 0.96 : 0.995;
        p.vx *= friction;
        p.vy *= friction;

        if (isNaN(p.vx) || isNaN(p.vy) || !isFinite(p.vx) || !isFinite(p.vy)) {
            var safeAngle = Math.random() * Math.PI * 2;
            p.vx = Math.cos(safeAngle) * 1.5;
            p.vy = Math.sin(safeAngle) * 1.5;
        }

        var margin = p.radius + 2;

        var nextX = p.x + p.vx;
        var nextY = p.y + p.vy;

        var wouldEnterForbidden = nextY > headerHeight - margin && nextX > sidebarWidth - margin;
        var currentlyInHeader = p.y <= headerHeight;
        var currentlyInSidebar = p.x <= sidebarWidth;

        if (wouldEnterForbidden) {
            if (currentlyInHeader && nextY > headerHeight - margin) {
                p.vy = -Math.abs(p.vy) * 0.5;
                nextY = headerHeight - margin;
            }
            if (currentlyInSidebar && nextX > sidebarWidth - margin) {
                p.vx = -Math.abs(p.vx) * 0.5;
                nextX = sidebarWidth - margin;
            }
        }

        if (nextX < margin) { nextX = margin; p.vx = Math.abs(p.vx) * 0.8; }
        if (nextY < margin) { nextY = margin; p.vy = Math.abs(p.vy) * 0.8; }

        if (nextY <= headerHeight) {
            if (nextX > canvas.width - margin) { nextX = canvas.width - margin; p.vx = -Math.abs(p.vx) * 0.8; }
        } else {
            if (nextX > sidebarWidth - margin) { nextX = sidebarWidth - margin; p.vx = -Math.abs(p.vx) * 0.8; }
            if (nextY > canvas.height - margin) { nextY = canvas.height - margin; p.vy = -Math.abs(p.vy) * 0.8; }
        }

        p.x = nextX;
        p.y = nextY;

        if (p.y > headerHeight && p.x > sidebarWidth) {
            if (p.y - headerHeight < p.x - sidebarWidth) {
                p.y = headerHeight - margin;
                p.vy = -Math.abs(p.vy);
            } else {
                p.x = sidebarWidth - margin;
                p.vx = -Math.abs(p.vx);
            }
        }

        p.targetAngle = Math.atan2(p.vy, p.vx);
        return true;
    }

    function updateFragment(f) {
        f.trail.push({ x: f.x, y: f.y });
        if (f.trail.length > 8) f.trail.shift();

        if (f.ignoreMouseTime > 0) {
            f.ignoreMouseTime--;
        } else {
            var dx = f.x - mouse.x;
            var dy = f.y - mouse.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < window.ballConfig.repelRadius && dist > 0) {
                var force = (window.ballConfig.repelRadius - dist) / window.ballConfig.repelRadius * 0.5;
                f.vx += (dx / dist) * force;
                f.vy += (dy / dist) * force;
            }
        }

        f.vx *= 0.98;
        f.vy *= 0.98;
        f.x += f.vx;
        f.y += f.vy;
        f.life--;

        if (f.y > headerHeight && f.x > sidebarWidth - f.radius) {
            var overY = f.y - headerHeight;
            var overX = f.x - (sidebarWidth - f.radius);
            if (overY < overX) {
                f.y = headerHeight - f.radius;
                f.vy = -Math.abs(f.vy);
            } else {
                f.x = sidebarWidth - f.radius;
                f.vx = -Math.abs(f.vx);
            }
        }

        var bounds = getLShapeBounds(f.y);
        if (f.x - f.radius < 0 || f.x + f.radius > bounds.maxX) {
            f.vx = -f.vx;
            f.x = Math.max(f.radius, Math.min(bounds.maxX - f.radius, f.x));
        }
        if (f.y - f.radius < 0 || f.y + f.radius > canvas.height) {
            f.vy = -f.vy;
            f.y = Math.max(f.radius, Math.min(canvas.height - f.radius, f.y));
        }
    }

    function getTransparencyMultiplier(y) {
        if (y <= headerHeight) return 1;
        var fadeStart = headerHeight;
        var fadeEnd = headerHeight + 50;
        if (y < fadeEnd) {
            return 1 - 0.5 * ((y - fadeStart) / (fadeEnd - fadeStart));
        }
        return 0.5;
    }

    function drawParticle(p) {
        var drawX = p.x + (p.shakeOffset ? p.shakeOffset.x : 0);
        var drawY = p.y + (p.shakeOffset ? p.shakeOffset.y : 0);
        var transMult = getTransparencyMultiplier(drawY);

        if (p.trail.length > 2) {
            for (var i = 1; i < p.trail.length; i++) {
                var t0 = p.trail[i - 1];
                var t1 = p.trail[i];
                var progress = i / p.trail.length;

                var width0 = p.radius * 2 * (progress - 1/p.trail.length) * 0.9;
                var width1 = p.radius * 2 * progress * 0.9;

                var alpha = p.alpha * progress * progress * progress * 0.6;
                var trailTrans = getTransparencyMultiplier((t0.y + t1.y) / 2);

                ctx.beginPath();
                ctx.moveTo(t0.x, t0.y);
                ctx.lineTo(t1.x, t1.y);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, (width0 + width1) / 2);
                ctx.lineCap = 'round';
                ctx.globalAlpha = alpha * trailTrans;
                ctx.stroke();
            }

            if (p.trail.length > 0) {
                var lastTrail = p.trail[p.trail.length - 1];
                ctx.beginPath();
                ctx.moveTo(lastTrail.x, lastTrail.y);
                ctx.lineTo(drawX, drawY);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.radius * 1.6;
                ctx.lineCap = 'round';
                ctx.globalAlpha = p.alpha * 0.5 * transMult;
                ctx.stroke();
            }
        }

        ctx.beginPath();
        ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * transMult;
        ctx.shadowColor = p.isShaking ? '#ff0000' : p.color;
        ctx.shadowBlur = p.isShaking ? 15 : 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    function drawFragment(f) {
        var transMult = getTransparencyMultiplier(f.y);
        for (var i = 0; i < f.trail.length; i++) {
            var t = f.trail[i];
            var progress = i / f.trail.length;
            var trailTrans = getTransparencyMultiplier(t.y);
            ctx.beginPath();
            ctx.arc(t.x, t.y, f.radius * progress * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = f.color;
            ctx.globalAlpha = f.alpha * progress * 0.4 * trailTrans;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.globalAlpha = f.alpha * (f.life / reuniteDelay) * transMult;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    function animate() {
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (var j = 0; j < particles.length; j++) {
                var p = particles[j];
                var spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (isNaN(spd) || !isFinite(spd) || spd < 0.5) {
                    var angle = Math.random() * Math.PI * 2;
                    var newSpeed = 1.5 + Math.random() * 1.0;
                    p.vx = Math.cos(angle) * newSpeed;
                    p.vy = Math.sin(angle) * newSpeed;
                }
            }

            spawnCheckCounter++;
            if (spawnCheckCounter >= spawnCheckInterval) {
                spawnCheckCounter = 0;
                checkParticleCount();
            }

            for (var i = spawningParticles.length - 1; i >= 0; i--) {
                if (updateSpawningParticle(spawningParticles[i])) {
                    drawSpawningParticle(spawningParticles[i]);
                } else {
                    spawningParticles.splice(i, 1);
                }
            }

            updateWeatherParticles();
            drawWeatherParticles();

            var particlesToProcess = particles.slice();

            for (var i = 0; i < particlesToProcess.length; i++) {
                var p = particlesToProcess[i];
                var actualIndex = particles.indexOf(p);
                if (actualIndex === -1) continue;

                if (updateParticle(p, actualIndex)) {
                    drawParticle(p);
                }
            }

            for (var i = 0; i < fragments.length; i++) {
                updateFragment(fragments[i]);
                drawFragment(fragments[i]);
            }

            reuniteFragments();

        } catch (e) {
            console.error('Animation error:', e);
        }

        requestAnimationFrame(animate);
    }

    resizeCanvas();
    initParticles();
    animate();

    window.addEventListener('resize', resizeCanvas);

    document.addEventListener('mousemove', function(e) {
        var extend = 120;
        var inLShape = (e.clientY <= headerHeight + extend) || (e.clientX <= sidebarWidth + extend);
        if (inLShape) {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        } else {
            mouse.x = -1000;
            mouse.y = -1000;
        }
    });

    document.addEventListener('mouseleave', function() {
        mouse.x = -1000;
        mouse.y = -1000;
    });

    // 小球设置函数 - 通过 About 页面版本号彩蛋触发
    window.openBallSettings = function() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center;';

        var cfg = window.ballConfig;
        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:16px;min-width:280px;color:#fff;font-size:14px;';
        dialog.innerHTML =
            '<div style="font-size:16px;font-weight:bold;margin-bottom:12px;color:#fbbf24;">⚡ 小球设置</div>' +
            '<table style="width:100%;border-collapse:collapse;">' +
            '<tr><td style="padding:6px 8px;color:#aaa;">数量</td><td><input id="cfg-count" type="number" min="1" max="20" value="' + particleCount + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 6</td></tr>' +
            '<tr><td style="padding:6px 8px;color:#aaa;">感应半径</td><td><input id="cfg-radius" type="number" min="50" max="200" value="' + cfg.repelRadius + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 180</td></tr>' +
            '<tr><td style="padding:6px 8px;color:#aaa;">排斥力度</td><td><input id="cfg-force" type="number" min="1" max="15" value="' + cfg.repelForce + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 12</td></tr>' +
            '<tr><td style="padding:6px 8px;color:#aaa;">最大速度</td><td><input id="cfg-speed" type="number" min="3" max="12" value="' + cfg.maxSpeed + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 10</td></tr>' +
            '<tr><td style="padding:6px 8px;color:#aaa;">摩擦力</td><td><input id="cfg-friction" type="number" min="0.9" max="0.999" step="0.01" value="' + cfg.friction + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 0.97</td></tr>' +
            '<tr><td style="padding:6px 8px;color:#aaa;">尾巴长度</td><td><input id="cfg-tail" type="number" min="3" max="25" value="' + cfg.tailLength + '" style="width:60px;padding:4px;background:#2a2a3e;border:1px solid #444;color:#fff;border-radius:4px;"></td><td style="padding:6px 8px;color:#666;font-size:12px;">建议: 5</td></tr>' +
            '</table>' +
            '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button id="cfg-cancel" style="padding:6px 12px;background:#444;border:none;color:#fff;border-radius:4px;cursor:pointer;">取消</button>' +
            '<button id="cfg-save" style="padding:6px 12px;background:#fbbf24;border:none;color:#000;border-radius:4px;cursor:pointer;font-weight:bold;">保存</button>' +
            '</div>';

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(ev) {
            if (ev.target === overlay) document.body.removeChild(overlay);
        });

        document.getElementById('cfg-cancel').addEventListener('click', function() {
            document.body.removeChild(overlay);
        });

        document.getElementById('cfg-save').addEventListener('click', function() {
            var newCount = Math.max(1, Math.min(20, parseInt(document.getElementById('cfg-count').value) || 5));
            cfg.repelRadius = Math.max(50, Math.min(200, parseInt(document.getElementById('cfg-radius').value) || 100));
            cfg.repelForce = Math.max(1, Math.min(15, parseInt(document.getElementById('cfg-force').value) || 5));
            cfg.maxSpeed = Math.max(3, Math.min(12, parseInt(document.getElementById('cfg-speed').value) || 5));
            cfg.friction = Math.max(0.9, Math.min(0.999, parseFloat(document.getElementById('cfg-friction').value) || 0.99));
            cfg.tailLength = Math.max(5, Math.min(25, parseInt(document.getElementById('cfg-tail').value) || 12));

            if (newCount !== particleCount) {
                particleCount = newCount;
                localStorage.setItem('particleCount', newCount);
                initParticles();
            }

            document.body.removeChild(overlay);
        });
    };
})();
