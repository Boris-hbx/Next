// ========== Health Renderer Module ==========
// Canvas2D rendering engine for meridian visualization.
// Ported from MeridianRenderer.ts + BodyOutline.ts + PoseInterpolator.ts
var HealthRenderer = (function() {
    'use strict';

    var D = HealthData;

    // =========================================================================
    // Constants
    // =========================================================================
    var STROKE_COLOR = '#d1d5db';
    var STROKE_WIDTH = 1.5;
    var SPINE_DASH = [4, 4];
    var SPINE_START_Y = 0.12;
    var SPINE_END_Y = 0.42;

    var MERIDIAN_LINE_WIDTH = 3;
    var MERIDIAN_PRIMARY_LINE_WIDTH = 4;
    var ACUPOINT_RADIUS = 4;
    var ACUPOINT_KEY_RADIUS = 6;
    var ACUPOINT_HOVER_RADIUS = 10;
    var ACUPOINT_HITBOX_RADIUS = 30; // larger for mobile touch

    var QI_PARTICLE_COUNT = 7;
    var QI_SPEED = 50;
    var QI_CORE_RADIUS = 3;
    var QI_GLOW_RADIUS = 8;
    var QI_GLOW_OPACITY = 0.3;

    var TOOLTIP_PADDING_X = 10;
    var TOOLTIP_PADDING_Y = 8;
    var TOOLTIP_RADIUS = 6;
    var TOOLTIP_FONT_SIZE = 13;
    var TOOLTIP_LINE_HEIGHT = 20;
    var TOOLTIP_OFFSET_Y = 16;

    var LABEL_FONT_SIZE = 11;

    // =========================================================================
    // Helpers
    // =========================================================================
    function toX(nx, w) { return nx * w; }
    function toY(ny, h) { return ny * h; }

    function dist(x1, y1, x2, y2) {
        var dx = x1 - x2, dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function pathLength(points, w, h) {
        var len = 0;
        for (var i = 1; i < points.length; i++) {
            len += dist(toX(points[i-1].x,w), toY(points[i-1].y,h), toX(points[i].x,w), toY(points[i].y,h));
        }
        return len;
    }

    function pointAlongPath(points, t, w, h) {
        if (points.length === 0) return {x:0,y:0};
        if (points.length === 1) return {x:toX(points[0].x,w), y:toY(points[0].y,h)};
        var totalLen = pathLength(points, w, h);
        var targetLen = t * totalLen;
        var accumulated = 0;
        for (var i = 1; i < points.length; i++) {
            var ax = toX(points[i-1].x,w), ay = toY(points[i-1].y,h);
            var bx = toX(points[i].x,w), by = toY(points[i].y,h);
            var segLen = dist(ax,ay,bx,by);
            if (accumulated + segLen >= targetLen) {
                var frac = segLen > 0 ? (targetLen - accumulated) / segLen : 0;
                return {x: ax + (bx - ax) * frac, y: ay + (by - ay) * frac};
            }
            accumulated += segLen;
        }
        var last = points[points.length - 1];
        return {x: toX(last.x,w), y: toY(last.y,h)};
    }

    function mirrorPath(points) {
        return points.map(function(p) { return {x: 1 - p.x, y: p.y}; });
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // =========================================================================
    // Body Outline Drawing
    // =========================================================================
    function drawSmoothPath(ctx, points, width, height, closePath) {
        if (points.length < 2) return;
        ctx.beginPath();
        if (closePath && points.length > 2) {
            var first = points[0], second = points[1];
            var midX = (first.x * width + second.x * width) / 2;
            var midY = (first.y * height + second.y * height) / 2;
            ctx.moveTo(midX, midY);
            for (var i = 1; i < points.length; i++) {
                var curr = points[i], next = points[(i+1) % points.length];
                var cpX = curr.x * width, cpY = curr.y * height;
                var endX = (cpX + next.x * width) / 2, endY = (cpY + next.y * height) / 2;
                ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            }
            var l = points[0], al = points[1];
            ctx.quadraticCurveTo(l.x*width, l.y*height, (l.x*width + al.x*width)/2, (l.y*height + al.y*height)/2);
            ctx.closePath();
        } else {
            ctx.moveTo(points[0].x * width, points[0].y * height);
            if (points.length === 2) {
                ctx.lineTo(points[1].x * width, points[1].y * height);
            } else {
                for (var j = 0; j < points.length - 2; j++) {
                    var c = points[j+1], n = points[j+2];
                    var cx = c.x * width, cy = c.y * height;
                    var ex = (cx + n.x * width) / 2, ey = (cy + n.y * height) / 2;
                    ctx.quadraticCurveTo(cx, cy, ex, ey);
                }
                var sl = points[points.length - 2], la = points[points.length - 1];
                ctx.quadraticCurveTo(sl.x*width, sl.y*height, la.x*width, la.y*height);
            }
        }
        ctx.stroke();
    }

    function drawSideOutline(ctx, w, h, side) {
        drawSmoothPath(ctx, side.head, w, h, true);
        drawSmoothPath(ctx, side.neckLeft, w, h, false);
        drawSmoothPath(ctx, side.neckRight, w, h, false);
        drawSmoothPath(ctx, side.torsoLeft, w, h, false);
        drawSmoothPath(ctx, side.torsoRight, w, h, false);
        drawSmoothPath(ctx, side.armLeftOuter, w, h, false);
        drawSmoothPath(ctx, side.armLeftInner, w, h, false);
        drawSmoothPath(ctx, side.armRightOuter, w, h, false);
        drawSmoothPath(ctx, side.armRightInner, w, h, false);
        drawSmoothPath(ctx, side.legLeftOuter, w, h, false);
        drawSmoothPath(ctx, side.legLeftInner, w, h, false);
        drawSmoothPath(ctx, side.legRightOuter, w, h, false);
        drawSmoothPath(ctx, side.legRightInner, w, h, false);
    }

    // =========================================================================
    // Skeletal Deformation
    // =========================================================================
    function deformPoints(points, refChain, curChain) {
        if (refChain.length === 1) {
            var dx = curChain[0].x - refChain[0].x, dy = curChain[0].y - refChain[0].y;
            return points.map(function(p) { return {x:p.x+dx, y:p.y+dy}; });
        }
        var yMin = refChain[0].y, yMax = refChain[refChain.length-1].y, yRange = yMax - yMin;
        var segments = refChain.length - 1;
        return points.map(function(p) {
            var t;
            if (yRange < 0.001) {
                var xMin = refChain[0].x, xRange = refChain[refChain.length-1].x - xMin;
                t = xRange < 0.001 ? 0.5 : Math.max(0, Math.min(1, (p.x - xMin) / xRange));
            } else {
                t = Math.max(0, Math.min(1, (p.y - yMin) / yRange));
            }
            var segT = t * segments;
            var segIdx = Math.min(Math.floor(segT), segments - 1);
            var localT = segT - segIdx;
            var dxA = curChain[segIdx].x - refChain[segIdx].x;
            var dyA = curChain[segIdx].y - refChain[segIdx].y;
            var dxB = curChain[segIdx+1].x - refChain[segIdx+1].x;
            var dyB = curChain[segIdx+1].y - refChain[segIdx+1].y;
            return {x: p.x + dxA + (dxB - dxA) * localT, y: p.y + dyA + (dyB - dyA) * localT};
        });
    }

    function deformOutlineSide(side, pose) {
        var ref = D.STANDING_POSE;
        return {
            head: deformPoints(side.head, [ref.head], [pose.head]),
            neckLeft: deformPoints(side.neckLeft, [ref.head, ref.shoulderL], [pose.head, pose.shoulderL]),
            neckRight: deformPoints(side.neckRight, [ref.head, ref.shoulderR], [pose.head, pose.shoulderR]),
            torsoLeft: deformPoints(side.torsoLeft, [ref.shoulderL, ref.hip], [pose.shoulderL, pose.hip]),
            torsoRight: deformPoints(side.torsoRight, [ref.shoulderR, ref.hip], [pose.shoulderR, pose.hip]),
            armLeftOuter: deformPoints(side.armLeftOuter, [ref.shoulderL, ref.elbowL, ref.wristL], [pose.shoulderL, pose.elbowL, pose.wristL]),
            armLeftInner: deformPoints(side.armLeftInner, [ref.shoulderL, ref.elbowL, ref.wristL], [pose.shoulderL, pose.elbowL, pose.wristL]),
            armRightOuter: deformPoints(side.armRightOuter, [ref.shoulderR, ref.elbowR, ref.wristR], [pose.shoulderR, pose.elbowR, pose.wristR]),
            armRightInner: deformPoints(side.armRightInner, [ref.shoulderR, ref.elbowR, ref.wristR], [pose.shoulderR, pose.elbowR, pose.wristR]),
            legLeftOuter: deformPoints(side.legLeftOuter, [ref.hip, ref.kneeL, ref.ankleL], [pose.hip, pose.kneeL, pose.ankleL]),
            legLeftInner: deformPoints(side.legLeftInner, [ref.hip, ref.kneeL, ref.ankleL], [pose.hip, pose.kneeL, pose.ankleL]),
            legRightOuter: deformPoints(side.legRightOuter, [ref.hip, ref.kneeR, ref.ankleR], [pose.hip, pose.kneeR, pose.ankleR]),
            legRightInner: deformPoints(side.legRightInner, [ref.hip, ref.kneeR, ref.ankleR], [pose.hip, pose.kneeR, pose.ankleR])
        };
    }

    function deformSinglePoint(p, refChain, curChain) {
        if (refChain.length === 1) {
            return {x: p.x + curChain[0].x - refChain[0].x, y: p.y + curChain[0].y - refChain[0].y};
        }
        var yMin = refChain[0].y, yMax = refChain[refChain.length-1].y, yRange = yMax - yMin;
        var segments = refChain.length - 1;
        var t;
        if (yRange < 0.001) {
            var xMin = refChain[0].x, xRange = refChain[refChain.length-1].x - xMin;
            t = xRange < 0.001 ? 0.5 : Math.max(0, Math.min(1, (p.x - xMin) / xRange));
        } else {
            t = Math.max(0, Math.min(1, (p.y - yMin) / yRange));
        }
        var segT = t * segments;
        var segIdx = Math.min(Math.floor(segT), segments - 1);
        var localT = segT - segIdx;
        var dxA = curChain[segIdx].x - refChain[segIdx].x;
        var dyA = curChain[segIdx].y - refChain[segIdx].y;
        var dxB = curChain[segIdx+1].x - refChain[segIdx+1].x;
        var dyB = curChain[segIdx+1].y - refChain[segIdx+1].y;
        return {x: p.x + dxA + (dxB - dxA) * localT, y: p.y + dyA + (dyB - dyA) * localT};
    }

    function deformBodyPoint(p, pose) {
        var ref = D.STANDING_POSE;
        if (p.y < ref.neck.y) {
            return {x: p.x + pose.head.x - ref.head.x, y: p.y + pose.head.y - ref.head.y};
        }
        var isLeft = p.x < 0.5;
        var sRef = isLeft ? ref.shoulderL : ref.shoulderR;
        var sCur = isLeft ? pose.shoulderL : pose.shoulderR;
        var eRef = isLeft ? ref.elbowL : ref.elbowR;
        var eCur = isLeft ? pose.elbowL : pose.elbowR;
        var wRef = isLeft ? ref.wristL : ref.wristR;
        var wCur = isLeft ? pose.wristL : pose.wristR;
        var isInArm = isLeft ? p.x < sRef.x : p.x > sRef.x;
        if (isInArm && p.y < ref.hip.y) {
            return deformSinglePoint(p, [sRef, eRef, wRef], [sCur, eCur, wCur]);
        }
        if (p.y >= ref.hip.y) {
            var kRef = isLeft ? ref.kneeL : ref.kneeR;
            var kCur = isLeft ? pose.kneeL : pose.kneeR;
            var aRef = isLeft ? ref.ankleL : ref.ankleR;
            var aCur = isLeft ? pose.ankleL : pose.ankleR;
            return deformSinglePoint(p, [ref.hip, kRef, aRef], [pose.hip, kCur, aCur]);
        }
        return deformSinglePoint(p, [sRef, ref.hip], [sCur, pose.hip]);
    }

    function deformPointForMeridian(p, pose, limbType, isRightSide) {
        var ref = D.STANDING_POSE;
        if (p.y < ref.neck.y) {
            return {x: p.x + pose.head.x - ref.head.x, y: p.y + pose.head.y - ref.head.y};
        }
        if (limbType === 'hand') {
            var sRef = isRightSide ? ref.shoulderR : ref.shoulderL;
            var sCur = isRightSide ? pose.shoulderR : pose.shoulderL;
            var eRef = isRightSide ? ref.elbowR : ref.elbowL;
            var eCur = isRightSide ? pose.elbowR : pose.elbowL;
            var wRef = isRightSide ? ref.wristR : ref.wristL;
            var wCur = isRightSide ? pose.wristR : pose.wristL;
            return deformSinglePoint(p, [sRef, eRef, wRef], [sCur, eCur, wCur]);
        }
        if (limbType === 'foot') {
            if (p.y < ref.hip.y) {
                var sR = isRightSide ? ref.shoulderR : ref.shoulderL;
                var sC = isRightSide ? pose.shoulderR : pose.shoulderL;
                return deformSinglePoint(p, [sR, ref.hip], [sC, pose.hip]);
            }
            var kR = isRightSide ? ref.kneeR : ref.kneeL;
            var kC = isRightSide ? pose.kneeR : pose.kneeL;
            var aR = isRightSide ? ref.ankleR : ref.ankleL;
            var aC = isRightSide ? pose.ankleR : pose.ankleL;
            return deformSinglePoint(p, [ref.hip, kR, aR], [pose.hip, kC, aC]);
        }
        return deformBodyPoint(p, pose);
    }

    // =========================================================================
    // PoseInterpolator
    // =========================================================================
    function PoseInterpolator(keyframes) {
        this.keyframes = keyframes.slice().sort(function(a,b) { return a.time - b.time; });
    }

    PoseInterpolator.prototype.interpolate = function(t) {
        var c = Math.max(0, Math.min(1, t));
        var f = this.keyframes;
        if (c <= f[0].time) return f[0].pose;
        if (c >= f[f.length-1].time) return f[f.length-1].pose;
        for (var i = 0; i < f.length - 1; i++) {
            if (c >= f[i].time && c <= f[i+1].time) {
                var span = f[i+1].time - f[i].time;
                if (span === 0) return f[i].pose;
                return D.lerpPose(f[i].pose, f[i+1].pose, (c - f[i].time) / span);
            }
        }
        return f[f.length-1].pose;
    };

    PoseInterpolator.prototype.getLabel = function(t) {
        var c = Math.max(0, Math.min(1, t));
        var f = this.keyframes;
        for (var i = f.length - 1; i >= 0; i--) {
            if (f[i].time <= c && f[i].label) return f[i].label;
        }
        return null;
    };

    // =========================================================================
    // MeridianRenderer
    // =========================================================================
    function MeridianRenderer() {
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 0;
        this.disposed = false;
        this.animFrame = null;
        this.viewSide = 'front';
        this.activeMeridians = [];
        this.highlightAcupoint = null;
        this.qiFlowOffset = 0;
        this.primaryMeridianIds = {};
        this.actionPose = null;
        this.clickCallbacks = [];
        this.lastFrameTime = 0;
        this._boundTouch = null;
        this._boundClick = null;
    }

    MeridianRenderer.prototype.init = function(container) {
        this.disposed = false;
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.resize(container.clientWidth, container.clientHeight);

        var self = this;
        // Touch + click events for mobile/desktop
        this._boundTouch = function(e) {
            if (!self.canvas) return;
            var touch = e.changedTouches[0];
            var rect = self.canvas.getBoundingClientRect();
            var mx = touch.clientX - rect.left;
            var my = touch.clientY - rect.top;
            var found = self.findAcupointAtPosition(mx, my);
            if (found) {
                e.preventDefault();
                self.highlightAcupoint = found;
                for (var i = 0; i < self.clickCallbacks.length; i++) self.clickCallbacks[i](found);
            }
        };
        this._boundClick = function(e) {
            if (!self.canvas) return;
            var rect = self.canvas.getBoundingClientRect();
            var found = self.findAcupointAtPosition(e.clientX - rect.left, e.clientY - rect.top);
            if (found) {
                self.highlightAcupoint = found;
                for (var i = 0; i < self.clickCallbacks.length; i++) self.clickCallbacks[i](found);
            } else {
                self.highlightAcupoint = null;
            }
        };
        this.canvas.addEventListener('touchend', this._boundTouch, {passive: false});
        this.canvas.addEventListener('click', this._boundClick);

        this.lastFrameTime = performance.now();
        this.startAnimation();
    };

    MeridianRenderer.prototype.dispose = function() {
        this.disposed = true;
        if (this.animFrame !== null) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
        if (this.canvas) {
            if (this._boundTouch) this.canvas.removeEventListener('touchend', this._boundTouch);
            if (this._boundClick) this.canvas.removeEventListener('click', this._boundClick);
            if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
            this.canvas = null;
        }
        this.ctx = null;
        this.clickCallbacks = [];
    };

    MeridianRenderer.prototype.resize = function(width, height) {
        if (!this.canvas) return;
        var dpr = window.devicePixelRatio || 1;
        this.width = width;
        this.height = height;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    MeridianRenderer.prototype.setViewSide = function(side) { this.viewSide = side; };
    MeridianRenderer.prototype.setActiveMeridians = function(m) { this.activeMeridians = m; };
    MeridianRenderer.prototype.setHighlightAcupoint = function(ap) { this.highlightAcupoint = ap; };
    MeridianRenderer.prototype.setActionPose = function(pose) { this.actionPose = pose; };
    MeridianRenderer.prototype.setPrimaryMeridianIds = function(ids) {
        this.primaryMeridianIds = {};
        for (var i = 0; i < ids.length; i++) this.primaryMeridianIds[ids[i]] = true;
    };
    MeridianRenderer.prototype.onAcupointClick = function(cb) { this.clickCallbacks.push(cb); };

    // Animation loop
    MeridianRenderer.prototype.startAnimation = function() {
        var self = this;
        function loop(time) {
            if (self.disposed) return;
            var dt = (time - self.lastFrameTime) / 1000;
            self.lastFrameTime = time;
            self.qiFlowOffset += QI_SPEED * dt;
            self.renderFrame();
            self.animFrame = requestAnimationFrame(loop);
        }
        this.animFrame = requestAnimationFrame(loop);
    };

    // Main render
    MeridianRenderer.prototype.renderFrame = function() {
        if (!this.ctx || !this.canvas) return;
        var ctx = this.ctx, w = this.width, h = this.height;
        ctx.clearRect(0, 0, w, h);
        this.drawBackground(ctx, w, h);
        this.drawBodyOutline(ctx, w, h);
        this.drawMeridianPaths(ctx, w, h);
        this.drawQiParticles(ctx, w, h);
        this.drawAcupoints(ctx, w, h);
        this.drawLabels(ctx, w, h);
        this.drawAcupointTooltip(ctx, w, h);
    };

    // Background — theme-aware
    MeridianRenderer.prototype.drawBackground = function(ctx, w, h) {
        var dark = isDark();
        ctx.fillStyle = dark ? '#1a1a2e' : '#fafafa';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = dark ? '#2a2a3e' : '#f0f0f0';
        ctx.lineWidth = 0.5;
        var sp = 40;
        for (var x = sp; x < w; x += sp) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
        for (var y = sp; y < h; y += sp) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    };

    // Body outline
    MeridianRenderer.prototype.drawBodyOutline = function(ctx, w, h) {
        var outlineData = D.BODY_OUTLINE;
        var side = this.viewSide === 'front' ? outlineData.front : outlineData.back;
        if (this.actionPose) side = deformOutlineSide(side, this.actionPose);

        ctx.save();
        ctx.strokeStyle = isDark() ? '#4a4a5e' : STROKE_COLOR;
        ctx.lineWidth = STROKE_WIDTH;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        drawSideOutline(ctx, w, h, side);

        // Back view spine
        if (this.viewSide === 'back') {
            ctx.save();
            ctx.setLineDash(SPINE_DASH);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0.5 * w, SPINE_START_Y * h);
            ctx.lineTo(0.5 * w, SPINE_END_Y * h);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    };

    // Meridian paths
    MeridianRenderer.prototype._deformPath = function(path, limbType, isRight) {
        if (!this.actionPose) return path;
        var pose = this.actionPose;
        return path.map(function(p) { return deformPointForMeridian(p, pose, limbType, isRight); });
    };

    MeridianRenderer.prototype._deformPoint = function(p, limbType, isRight) {
        if (!this.actionPose) return p;
        return deformPointForMeridian(p, this.actionPose, limbType, isRight);
    };

    MeridianRenderer.prototype.drawMeridianPaths = function(ctx, w, h) {
        for (var i = 0; i < this.activeMeridians.length; i++) {
            var m = this.activeMeridians[i];
            var rawPath = this.viewSide === 'front' ? m.pathFront : m.pathBack;
            if (!rawPath || rawPath.length < 2) continue;
            var path = this._deformPath(rawPath, m.limbType, false);
            var isPrimary = !!this.primaryMeridianIds[m.id];
            var lw = isPrimary ? MERIDIAN_PRIMARY_LINE_WIDTH : MERIDIAN_LINE_WIDTH;
            this._drawSmoothMeridian(ctx, path, w, h, m.color, lw, isPrimary);
            if (m.limbType === 'hand' || m.limbType === 'foot') {
                var mirrored = this._deformPath(mirrorPath(rawPath), m.limbType, true);
                this._drawSmoothMeridian(ctx, mirrored, w, h, m.color, lw, isPrimary);
            }
        }
    };

    MeridianRenderer.prototype._drawSmoothMeridian = function(ctx, points, w, h, color, lineWidth, withGlow) {
        if (points.length < 2) return;
        ctx.save();
        if (withGlow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(toX(points[0].x,w), toY(points[0].y,h));
        if (points.length === 2) {
            ctx.lineTo(toX(points[1].x,w), toY(points[1].y,h));
        } else {
            for (var i = 0; i < points.length - 2; i++) {
                var cpX = toX(points[i+1].x,w), cpY = toY(points[i+1].y,h);
                var endX = (cpX + toX(points[i+2].x,w)) / 2;
                var endY = (cpY + toY(points[i+2].y,h)) / 2;
                ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            }
            var sl = points[points.length - 2], la = points[points.length - 1];
            ctx.quadraticCurveTo(toX(sl.x,w), toY(sl.y,h), toX(la.x,w), toY(la.y,h));
        }
        ctx.stroke();
        ctx.restore();
    };

    // Qi particles
    MeridianRenderer.prototype.drawQiParticles = function(ctx, w, h) {
        for (var i = 0; i < this.activeMeridians.length; i++) {
            var m = this.activeMeridians[i];
            var rawPath = this.viewSide === 'front' ? m.pathFront : m.pathBack;
            if (!rawPath || rawPath.length < 2) continue;
            var path = this._deformPath(rawPath, m.limbType, false);
            this._drawQi(ctx, path, w, h, m.color, m.direction);
            if (m.limbType === 'hand' || m.limbType === 'foot') {
                var mirrored = this._deformPath(mirrorPath(rawPath), m.limbType, true);
                this._drawQi(ctx, mirrored, w, h, m.color, m.direction);
            }
        }
    };

    MeridianRenderer.prototype._drawQi = function(ctx, points, w, h, color, direction) {
        var totalLen = pathLength(points, w, h);
        if (totalLen <= 0) return;
        for (var i = 0; i < QI_PARTICLE_COUNT; i++) {
            var t = ((i / QI_PARTICLE_COUNT) + this.qiFlowOffset / totalLen) % 1;
            if (direction === 'centripetal') t = 1 - t;
            var pos = pointAlongPath(points, t, w, h);
            ctx.save(); ctx.globalAlpha = QI_GLOW_OPACITY; ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(pos.x, pos.y, QI_GLOW_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(pos.x, pos.y, QI_CORE_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    };

    // Acupoints
    MeridianRenderer.prototype.drawAcupoints = function(ctx, w, h) {
        for (var i = 0; i < this.activeMeridians.length; i++) {
            var m = this.activeMeridians[i];
            for (var j = 0; j < m.acupoints.length; j++) {
                var ap = m.acupoints[j];
                var rawPos = this.viewSide === 'front' ? ap.positionFront : ap.positionBack;
                if (!rawPos) continue;
                this._drawOneAcupoint(ctx, w, h, ap, rawPos, m, false);
                if (m.limbType === 'hand' || m.limbType === 'foot') {
                    this._drawOneAcupoint(ctx, w, h, ap, {x:1-rawPos.x, y:rawPos.y}, m, true);
                }
            }
        }
    };

    MeridianRenderer.prototype._drawOneAcupoint = function(ctx, w, h, ap, rawPos, m, isRight) {
        var pos = this._deformPoint(rawPos, m.limbType, isRight);
        var cx = toX(pos.x,w), cy = toY(pos.y,h);
        var isHovered = this.highlightAcupoint && this.highlightAcupoint.id === ap.id;
        if (isHovered) {
            ctx.save(); ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(cx, cy, ACUPOINT_HOVER_RADIUS + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            ctx.save(); ctx.fillStyle = m.color;
            ctx.beginPath(); ctx.arc(cx, cy, ACUPOINT_HOVER_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        } else {
            var r = ap.isKey ? ACUPOINT_KEY_RADIUS : ACUPOINT_RADIUS;
            ctx.save(); ctx.fillStyle = m.color;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    };

    // Labels
    MeridianRenderer.prototype.drawLabels = function(ctx, w, h) {
        ctx.save();
        ctx.font = LABEL_FONT_SIZE + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (var i = 0; i < this.activeMeridians.length; i++) {
            var m = this.activeMeridians[i];
            var rawPath = this.viewSide === 'front' ? m.pathFront : m.pathBack;
            if (!rawPath || rawPath.length === 0) continue;
            var startPt = this._deformPoint(rawPath[0], m.limbType, false);
            ctx.fillStyle = m.color;
            ctx.fillText(m.shortName, toX(startPt.x,w) + 8, toY(startPt.y,h));
            if (m.limbType === 'hand' || m.limbType === 'foot') {
                var mp = this._deformPoint({x:1-rawPath[0].x, y:rawPath[0].y}, m.limbType, true);
                var tw = ctx.measureText(m.shortName).width;
                ctx.fillText(m.shortName, toX(mp.x,w) - tw - 8, toY(mp.y,h));
            }
        }
        ctx.restore();
    };

    // Tooltip
    MeridianRenderer.prototype.drawAcupointTooltip = function(ctx, w, h) {
        var ap = this.highlightAcupoint;
        if (!ap) return;
        var rawPos = this.viewSide === 'front' ? ap.positionFront : ap.positionBack;
        if (!rawPos) return;
        var m = null;
        for (var i = 0; i < this.activeMeridians.length; i++) {
            for (var j = 0; j < this.activeMeridians[i].acupoints.length; j++) {
                if (this.activeMeridians[i].acupoints[j].id === ap.id) { m = this.activeMeridians[i]; break; }
            }
            if (m) break;
        }
        var limbType = m ? m.limbType : 'trunk';
        var pos = this._deformPoint(rawPos, limbType, false);
        var cx = toX(pos.x,w), cy = toY(pos.y,h);
        var dark = isDark();
        var titleLine = ap.name + ' (' + ap.id + ')';
        var funcLine = ap.functions.length > 0 ? ap.functions[0] : '';

        ctx.save();
        ctx.font = 'bold ' + TOOLTIP_FONT_SIZE + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
        var titleWidth = ctx.measureText(titleLine).width;
        ctx.font = TOOLTIP_FONT_SIZE + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
        var funcWidth = funcLine ? ctx.measureText(funcLine).width : 0;
        var textWidth = Math.max(titleWidth, funcWidth);
        var boxWidth = textWidth + TOOLTIP_PADDING_X * 2;
        var lines = funcLine ? 2 : 1;
        var boxHeight = TOOLTIP_PADDING_Y * 2 + lines * TOOLTIP_LINE_HEIGHT;
        var boxX = cx - boxWidth / 2;
        var boxY = cy - TOOLTIP_OFFSET_Y - boxHeight;
        if (boxX < 4) boxX = 4;
        if (boxX + boxWidth > w - 4) boxX = w - 4 - boxWidth;
        if (boxY < 4) boxY = cy + TOOLTIP_OFFSET_Y;

        ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
        ctx.fillStyle = dark ? '#2a2a3e' : '#ffffff';
        ctx.beginPath(); this._roundedRect(ctx, boxX, boxY, boxWidth, boxHeight, TOOLTIP_RADIUS); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

        ctx.fillStyle = dark ? '#e5e5e5' : '#1f2937';
        ctx.font = 'bold ' + TOOLTIP_FONT_SIZE + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(titleLine, boxX + TOOLTIP_PADDING_X, boxY + TOOLTIP_PADDING_Y);
        if (funcLine) {
            ctx.fillStyle = dark ? '#9ca3af' : '#6b7280';
            ctx.font = TOOLTIP_FONT_SIZE + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.fillText(funcLine, boxX + TOOLTIP_PADDING_X, boxY + TOOLTIP_PADDING_Y + TOOLTIP_LINE_HEIGHT);
        }
        ctx.restore();
    };

    MeridianRenderer.prototype._roundedRect = function(ctx, x, y, w, h, r) {
        var radius = Math.min(r, w/2, h/2);
        ctx.moveTo(x+radius, y);
        ctx.lineTo(x+w-radius, y);
        ctx.arcTo(x+w, y, x+w, y+radius, radius);
        ctx.lineTo(x+w, y+h-radius);
        ctx.arcTo(x+w, y+h, x+w-radius, y+h, radius);
        ctx.lineTo(x+radius, y+h);
        ctx.arcTo(x, y+h, x, y+h-radius, radius);
        ctx.lineTo(x, y+radius);
        ctx.arcTo(x, y, x+radius, y, radius);
        ctx.closePath();
    };

    // Hit testing
    MeridianRenderer.prototype.findAcupointAtPosition = function(x, y) {
        var closest = null, closestDist = Infinity;
        for (var i = 0; i < this.activeMeridians.length; i++) {
            var m = this.activeMeridians[i];
            for (var j = 0; j < m.acupoints.length; j++) {
                var ap = m.acupoints[j];
                var rawPos = this.viewSide === 'front' ? ap.positionFront : ap.positionBack;
                if (!rawPos) continue;
                var pos = this._deformPoint(rawPos, m.limbType, false);
                var d = dist(x, y, toX(pos.x, this.width), toY(pos.y, this.height));
                if (d < ACUPOINT_HITBOX_RADIUS && d < closestDist) { closestDist = d; closest = ap; }
                if (m.limbType === 'hand' || m.limbType === 'foot') {
                    var mp = this._deformPoint({x:1-rawPos.x, y:rawPos.y}, m.limbType, true);
                    var dm = dist(x, y, toX(mp.x, this.width), toY(mp.y, this.height));
                    if (dm < ACUPOINT_HITBOX_RADIUS && dm < closestDist) { closestDist = dm; closest = ap; }
                }
            }
        }
        return closest;
    };

    return {
        MeridianRenderer: MeridianRenderer,
        PoseInterpolator: PoseInterpolator
    };
})();
