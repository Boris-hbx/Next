// ========== Expense Analytics Module ==========
var ExpenseAnalytics = (function() {
    var _period = 'week';
    var _currentDate = new Date();
    var _data = null;

    var COLORS = {
        '食品杂货': '#4ade80', '餐饮': '#fb923c', '交通': '#60a5fa',
        '购物': '#f472b6', '住房': '#a78bfa', '娱乐': '#facc15',
        '医疗': '#f87171', '教育': '#2dd4bf', '其他': '#94a3b8'
    };
    var COLOR_ORDER = ['食品杂货', '餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他'];

    function init() {
        _currentDate = new Date();
        _period = 'week';
        updatePeriodButtons();
        loadData();
    }

    function dispose() {
        _data = null;
    }

    function switchPeriod(p) {
        _period = p;
        _currentDate = new Date();
        updatePeriodButtons();
        loadData();
    }

    function navigateDate(dir) {
        if (_period === 'week') {
            _currentDate.setDate(_currentDate.getDate() + (dir * 7));
        } else {
            _currentDate.setMonth(_currentDate.getMonth() + dir);
        }
        loadData();
    }

    function updatePeriodButtons() {
        document.querySelectorAll('.expense-analytics-period-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.period === _period);
        });
    }

    function updateDateLabel() {
        var label = document.getElementById('expense-analytics-date-label');
        if (!label) return;
        var d = _currentDate;
        if (_period === 'week') {
            var day = d.getDay();
            var diff = d.getDate() - day + (day === 0 ? -6 : 1);
            var start = new Date(d);
            start.setDate(diff);
            var end = new Date(start);
            end.setDate(start.getDate() + 6);
            label.textContent = fmtShort(start) + ' ~ ' + fmtShort(end);
        } else {
            label.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
        }
    }

    function fmtShort(d) {
        return (d.getMonth() + 1) + '/' + d.getDate();
    }

    function formatDate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    async function loadData() {
        updateDateLabel();
        var dateStr = formatDate(_currentDate);
        try {
            var resp = await API.getExpenseAnalytics(_period, dateStr);
            if (resp.success && resp.analytics) {
                _data = resp.analytics;
                render();
            }
        } catch(e) {
            console.error('[ExpenseAnalytics] loadData error:', e);
        }
    }

    function render() {
        var emptyEl = document.getElementById('expense-analytics-empty');
        var totalEl = document.getElementById('expense-analytics-total');
        var pieCanvas = document.getElementById('expense-pie-canvas');
        var barCanvas = document.getElementById('expense-bar-canvas');
        var legendEl = document.getElementById('expense-analytics-legend');

        if (!_data || _data.entry_count === 0) {
            // Empty state
            if (emptyEl) emptyEl.style.display = '';
            document.querySelectorAll('.expense-analytics-chart-section').forEach(function(s) { s.style.display = 'none'; });
            if (totalEl) totalEl.textContent = '';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        document.querySelectorAll('.expense-analytics-chart-section').forEach(function(s) { s.style.display = ''; });

        if (totalEl) {
            totalEl.textContent = 'CA$' + _data.total_amount.toFixed(2);
        }

        renderPieChart(pieCanvas);
        renderLegend(legendEl);
        renderBarChart(barCanvas);
    }

    // ===== Canvas DPR helper =====
    function setupCanvas(canvas, w, h) {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    // ===== Pie Chart (donut) =====
    function renderPieChart(canvas) {
        if (!canvas || !_data) return;
        var wrapper = canvas.parentElement;
        var w = wrapper.clientWidth || 300;
        var h = 220;
        var ctx = setupCanvas(canvas, w, h);

        var cx = w / 2;
        var cy = h / 2;
        var outerR = Math.min(cx, cy) - 10;
        var innerR = outerR * 0.4;

        var cats = _data.categories;
        if (!cats || cats.length === 0) return;

        var total = _data.total_amount;
        var startAngle = -Math.PI / 2;

        ctx.clearRect(0, 0, w, h);

        cats.forEach(function(cat) {
            var sliceAngle = (cat.amount / total) * Math.PI * 2;
            var endAngle = startAngle + sliceAngle;
            var color = COLORS[cat.category] || COLORS['其他'];

            ctx.beginPath();
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Label percentage if slice > 8%
            if (cat.percentage >= 8) {
                var midAngle = startAngle + sliceAngle / 2;
                var labelR = (outerR + innerR) / 2;
                var lx = cx + Math.cos(midAngle) * labelR;
                var ly = cy + Math.sin(midAngle) * labelR;
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cat.percentage + '%', lx, ly);
            }

            startAngle = endAngle;
        });
    }

    // ===== Legend =====
    function renderLegend(el) {
        if (!el || !_data) return;
        var cats = _data.categories;
        if (!cats || cats.length === 0) { el.innerHTML = ''; return; }

        var html = '';
        cats.forEach(function(cat) {
            var color = COLORS[cat.category] || COLORS['其他'];
            html += '<div class="expense-analytics-legend-item">';
            html += '<span class="expense-analytics-legend-dot" style="background:' + color + '"></span>';
            html += '<span>' + cat.category + '</span>';
            html += '<span style="color:var(--text-secondary);margin-left:2px;">CA$' + cat.amount.toFixed(0) + '</span>';
            html += '</div>';
        });
        el.innerHTML = html;
    }

    // ===== Bar Chart =====
    function renderBarChart(canvas) {
        if (!canvas || !_data) return;
        var daily = _data.daily;
        if (!daily || daily.length === 0) return;

        var wrapper = canvas.parentElement;
        var w = wrapper.clientWidth || 300;
        var h = 200;
        var ctx = setupCanvas(canvas, w, h);
        ctx.clearRect(0, 0, w, h);

        var padLeft = 45;
        var padRight = 10;
        var padTop = 20;
        var padBottom = 30;
        var chartW = w - padLeft - padRight;
        var chartH = h - padTop - padBottom;

        var maxVal = Math.max.apply(null, daily.map(function(d) { return d.amount; }));
        if (maxVal === 0) maxVal = 100;

        // Nice Y-axis scale
        var gridLines = 4;
        var step = niceStep(maxVal, gridLines);
        var yMax = step * gridLines;
        if (yMax < maxVal) yMax = step * (gridLines + 1);

        // Grid lines + labels
        ctx.strokeStyle = 'rgba(128,128,128,0.15)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Read CSS variable for text color
        var textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#999';
        ctx.fillStyle = textColor;

        for (var g = 0; g <= gridLines; g++) {
            var yVal = step * g;
            var yPos = padTop + chartH - (yVal / yMax) * chartH;
            ctx.beginPath();
            ctx.moveTo(padLeft, yPos);
            ctx.lineTo(w - padRight, yPos);
            ctx.stroke();
            ctx.fillText(yVal >= 1000 ? (yVal / 1000).toFixed(1) + 'k' : yVal.toFixed(0), padLeft - 5, yPos);
        }

        // Bars
        var barCount = daily.length;
        var gap = Math.max(2, chartW * 0.02);
        var barW = (chartW - gap * (barCount + 1)) / barCount;
        if (barW < 3) { barW = 3; gap = 1; }
        if (barW > 30) barW = 30;
        var totalBarsW = barCount * barW + (barCount + 1) * gap;
        var offsetX = padLeft + (chartW - totalBarsW) / 2 + gap;

        var primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#667eea';

        for (var i = 0; i < barCount; i++) {
            var d = daily[i];
            var barH = (d.amount / yMax) * chartH;
            var x = offsetX + i * (barW + gap);
            var y = padTop + chartH - barH;

            if (d.amount > 0) {
                ctx.fillStyle = primaryColor;
                ctx.beginPath();
                var r = Math.min(3, barW / 2);
                roundedRect(ctx, x, y, barW, barH, r);
                ctx.fill();

                // Amount label on top if bar is tall enough
                if (barH > 20) {
                    ctx.fillStyle = textColor;
                    ctx.font = '9px -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    var label = d.amount >= 1000 ? (d.amount / 1000).toFixed(1) + 'k' : d.amount.toFixed(0);
                    ctx.fillText(label, x + barW / 2, y - 2);
                }
            }

            // X-axis label
            ctx.fillStyle = textColor;
            ctx.font = '9px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            var xLabel = getBarLabel(d.date, i, barCount);
            ctx.fillText(xLabel, x + barW / 2, padTop + chartH + 4);
        }
    }

    function getBarLabel(dateStr, idx, total) {
        var parts = dateStr.split('-');
        var day = parseInt(parts[2]);
        if (total <= 7) {
            // Week: show weekday
            var dt = new Date(dateStr + 'T12:00:00');
            var days = ['日', '一', '二', '三', '四', '五', '六'];
            return days[dt.getDay()];
        }
        // Month: show day number, but skip some if too many
        if (total > 20) {
            if (day === 1 || day % 5 === 0 || day === total) return day + '';
            return '';
        }
        return day + '';
    }

    function niceStep(max, lines) {
        var rough = max / lines;
        var mag = Math.pow(10, Math.floor(Math.log10(rough)));
        var residual = rough / mag;
        var nice;
        if (residual <= 1.5) nice = 1;
        else if (residual <= 3) nice = 2;
        else if (residual <= 7) nice = 5;
        else nice = 10;
        return nice * mag;
    }

    function roundedRect(ctx, x, y, w, h, r) {
        if (h < r * 2) r = h / 2;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
    }

    return {
        init: init,
        dispose: dispose,
        switchPeriod: switchPeriod,
        navigateDate: navigateDate
    };
})();
