// ========== Admin Dashboard (owner only) ==========
var AdminDashboard = (function() {

    function fmt(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    async function load() {
        var section = document.getElementById('admin-dashboard-section');
        if (!section) return;
        try {
            var data = await API.getAdminDashboard();
            if (!data.success) { section.style.display = 'none'; return; }
            section.style.display = '';
            render(data);
            loadPendingUsers();
        } catch(e) {
            section.style.display = 'none';
        }
    }

    async function loadPendingUsers() {
        var container = document.getElementById('admin-pending-section');
        if (!container) return;
        try {
            var data = await API.getPendingUsers();
            if (!data.success || !data.users || data.users.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = '';
            var html = '<div class="admin-card" style="border-left:3px solid #e6a817;">';
            html += '<div class="admin-card-title">待审批用户 (' + data.users.length + ')</div>';
            for (var i = 0; i < data.users.length; i++) {
                var u = data.users[i];
                html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));">';
                html += '<div><strong>' + esc(u.display_name || u.username) + '</strong> <span style="opacity:0.6;font-size:12px;">@' + esc(u.username) + '</span>';
                html += '<div style="font-size:12px;opacity:0.5;">注册: ' + shortDate(u.created_at) + '</div></div>';
                html += '<div style="display:flex;gap:8px;">';
                html += '<button class="btn btn-small" style="background:#2ea44f;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;" onclick="AdminDashboard.approve(\'' + u.id + '\')">通过</button>';
                html += '<button class="btn btn-small" style="background:#da3633;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;" onclick="AdminDashboard.reject(\'' + u.id + '\')">拒绝</button>';
                html += '</div></div>';
            }
            html += '</div>';
            container.innerHTML = html;
        } catch(e) {
            container.style.display = 'none';
        }
    }

    async function approveUser(id) {
        try {
            var data = await API.approveUser(id);
            if (data.success) {
                if (typeof showToast === 'function') showToast('已通过', 'success');
                loadPendingUsers();
            } else {
                if (typeof showToast === 'function') showToast(data.message || '操作失败', 'error');
            }
        } catch(e) {
            if (typeof showToast === 'function') showToast('操作失败', 'error');
        }
    }

    async function rejectUser(id) {
        if (!confirm('确定拒绝该用户？')) return;
        try {
            var data = await API.rejectUser(id);
            if (data.success) {
                if (typeof showToast === 'function') showToast('已拒绝', 'success');
                loadPendingUsers();
            } else {
                if (typeof showToast === 'function') showToast(data.message || '操作失败', 'error');
            }
        } catch(e) {
            if (typeof showToast === 'function') showToast('操作失败', 'error');
        }
    }

    function render(data) {
        var el = document.getElementById('admin-dashboard-content');
        if (!el) return;

        var html = '';

        // ── User Activity Card ──
        html += '<div class="admin-card">';
        html += '<div class="admin-card-title">User Activity</div>';
        html += '<div class="admin-stats-row">';
        html += statBox(data.users.total, 'Total');
        html += statBox(data.users.dau, 'DAU');
        html += statBox(data.users.wau, 'WAU');
        html += '</div>';
        if (data.users.list && data.users.list.length) {
            html += '<table class="admin-table">';
            html += '<thead><tr><th>User</th><th>Joined</th><th>Last Active</th><th>Sessions</th></tr></thead>';
            html += '<tbody>';
            for (var i = 0; i < data.users.list.length; i++) {
                var u = data.users.list[i];
                html += '<tr>';
                html += '<td>' + esc(u.display_name || u.username) + '</td>';
                html += '<td>' + shortDate(u.created_at) + '</td>';
                html += '<td>' + (u.last_active ? shortDate(u.last_active) : '-') + '</td>';
                html += '<td>' + fmt(u.total_sessions) + '</td>';
                html += '</tr>';
            }
            html += '</tbody></table>';
        }
        html += '</div>';

        // ── Feature Usage Card ──
        html += '<div class="admin-card">';
        html += '<div class="admin-card-title">Feature Usage</div>';
        html += '<div class="admin-stats-row admin-stats-wrap">';
        var f = data.features;
        html += statBox(f.todos, 'Todos');
        html += statBox(f.todos_completed, 'Completed');
        html += statBox(f.routines, 'Routines');
        html += statBox(f.reviews, 'Reviews');
        html += statBox(f.scenarios, 'English');
        html += statBox(f.expenses, 'Expenses');
        html += statBox(f.trips, 'Trips');
        html += statBox(f.conversations, 'Chats');
        html += statBox(f.friendships, 'Friends');
        html += statBox(f.shares, 'Shares');
        html += '</div>';
        html += '</div>';

        // ── AI Usage Card ──
        html += '<div class="admin-card">';
        html += '<div class="admin-card-title">AI Usage</div>';
        var ai = data.ai;
        html += '<div class="admin-stats-row">';
        html += statBox(fmt(ai.total.messages), 'Messages');
        html += statBox(fmt(ai.total.conversations), 'Convos');
        html += statBox(fmt(ai.total.tool_calls), 'Tool Calls');
        html += '</div>';
        html += '<div class="admin-stats-row" style="margin-top:8px;">';
        html += statBox(fmt(ai.total.input_tokens), 'In Tokens');
        html += statBox(fmt(ai.total.output_tokens), 'Out Tokens');
        html += statBox(fmt(ai.total.input_tokens + ai.total.output_tokens), 'Total Tokens');
        html += '</div>';
        // Trend boxes
        html += '<div class="admin-trend-row">';
        html += trendBox('Today', ai.today);
        html += trendBox('7 Days', ai.week);
        html += trendBox('30 Days', ai.month);
        html += '</div>';
        // Per-user AI table
        if (ai.per_user && ai.per_user.length) {
            html += '<table class="admin-table" style="margin-top:12px;">';
            html += '<thead><tr><th>User</th><th>Msgs</th><th>In Tokens</th><th>Out Tokens</th><th>Tools</th></tr></thead>';
            html += '<tbody>';
            for (var j = 0; j < ai.per_user.length; j++) {
                var p = ai.per_user[j];
                html += '<tr>';
                html += '<td>' + esc(p.display_name || p.username) + '</td>';
                html += '<td>' + fmt(p.messages) + '</td>';
                html += '<td>' + fmt(p.input_tokens) + '</td>';
                html += '<td>' + fmt(p.output_tokens) + '</td>';
                html += '<td>' + fmt(p.tool_calls) + '</td>';
                html += '</tr>';
            }
            html += '</tbody></table>';
        }
        html += '</div>';

        el.innerHTML = html;
    }

    function statBox(value, label) {
        return '<div class="admin-stat-box">' +
            '<div class="admin-stat-value">' + value + '</div>' +
            '<div class="admin-stat-label">' + label + '</div>' +
            '</div>';
    }

    function trendBox(period, d) {
        return '<div class="admin-trend-box">' +
            '<div class="admin-trend-period">' + period + '</div>' +
            '<div class="admin-stat-value">' + fmt(d.messages) + '</div>' +
            '<div class="admin-stat-label">msgs</div>' +
            '<div class="admin-trend-tokens">' + fmt(d.input_tokens + d.output_tokens) + ' tokens</div>' +
            '</div>';
    }

    function shortDate(s) {
        if (!s) return '-';
        return s.substring(0, 10);
    }

    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { load: load, approve: approveUser, reject: rejectUser };
})();

// Hook into settings loading
var _origLoadSettingsForAdmin = typeof loadSettingsData === 'function' ? loadSettingsData : null;
if (_origLoadSettingsForAdmin) {
    loadSettingsData = async function() {
        await _origLoadSettingsForAdmin();
        AdminDashboard.load();
    };
}
