// ========== 潘多拉 - 每日发现 (IIFE) ==========
var Pandora = (function() {
    var todayDiscovery = null;
    var currentTab = 'history';
    var initialized = false;
    var pollTimer = null;

    function init() {
        if (!initialized) {
            initialized = true;
        }
        loadToday();
    }

    async function loadToday() {
        var card = document.getElementById('pandora-card');
        var loading = document.getElementById('pandora-loading');
        if (card) card.style.display = 'none';
        if (loading) loading.style.display = '';

        // Set date
        var dateEl = document.getElementById('pandora-date');
        if (dateEl) {
            var now = new Date();
            var months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
            dateEl.textContent = now.getFullYear() + '年' + months[now.getMonth()] + now.getDate() + '日';
        }

        try {
            var resp = await API.getPandoraToday();
            if (resp.success && resp.item) {
                todayDiscovery = resp.item;
                if (todayDiscovery.status === 'generating') {
                    pollUntilReady(todayDiscovery.id);
                } else {
                    renderToday(todayDiscovery);
                }
            } else {
                if (loading) loading.style.display = 'none';
                if (card) {
                    card.style.display = '';
                    document.getElementById('pandora-title').textContent = '加载失败';
                    document.getElementById('pandora-content').innerHTML = '<p>请稍后重试</p>';
                }
            }
        } catch (e) {
            console.error('[Pandora] load failed:', e);
            if (loading) loading.style.display = 'none';
        }
    }

    function renderToday(discovery) {
        var card = document.getElementById('pandora-card');
        var loading = document.getElementById('pandora-loading');
        if (loading) loading.style.display = 'none';
        if (!card) return;

        if (discovery.status === 'error') {
            card.style.display = '';
            document.getElementById('pandora-emoji').textContent = '😔';
            document.getElementById('pandora-title').textContent = '生成失败';
            document.getElementById('pandora-topic').textContent = '';
            document.getElementById('pandora-content').innerHTML = '<p>今日的发现生成失败了，明天再来看看吧</p>';
            document.getElementById('pandora-save-btn').style.display = 'none';
            return;
        }

        card.style.display = '';
        document.getElementById('pandora-emoji').textContent = discovery.emoji || '🎁';
        document.getElementById('pandora-title').textContent = discovery.title;
        document.getElementById('pandora-topic').textContent = discovery.topic_area || '';
        document.getElementById('pandora-content').innerHTML = renderMarkdown(discovery.content);

        var saveBtn = document.getElementById('pandora-save-btn');
        if (saveBtn) {
            saveBtn.style.display = '';
            updateSaveBtn(discovery.saved);
        }
    }

    function updateSaveBtn(saved) {
        var btn = document.getElementById('pandora-save-btn');
        if (!btn) return;
        if (saved) {
            btn.textContent = '★ 已收藏';
            btn.classList.add('saved');
        } else {
            btn.textContent = '☆ 收藏';
            btn.classList.remove('saved');
        }
    }

    function pollUntilReady(id) {
        if (pollTimer) clearInterval(pollTimer);
        var attempts = 0;
        pollTimer = setInterval(async function() {
            attempts++;
            if (attempts > 30) { // 60 seconds max
                clearInterval(pollTimer);
                var loading = document.getElementById('pandora-loading');
                if (loading) loading.style.display = 'none';
                var card = document.getElementById('pandora-card');
                if (card) {
                    card.style.display = '';
                    document.getElementById('pandora-title').textContent = '生成超时';
                    document.getElementById('pandora-content').innerHTML = '<p>请刷新页面重试</p>';
                }
                return;
            }
            try {
                var resp = await API.getPandoraToday();
                if (resp.success && resp.item && resp.item.status !== 'generating') {
                    clearInterval(pollTimer);
                    todayDiscovery = resp.item;
                    renderToday(todayDiscovery);
                }
            } catch (e) {
                // keep polling
            }
        }, 2000);
    }

    async function toggleSave() {
        if (!todayDiscovery) return;
        try {
            var resp = await API.togglePandoraSave(todayDiscovery.id);
            if (resp.success && resp.item) {
                todayDiscovery = resp.item;
                updateSaveBtn(todayDiscovery.saved);
                showToast(resp.message || (todayDiscovery.saved ? '已收藏' : '已取消收藏'), 'success');
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.pandora-tab').forEach(function(el) {
            el.classList.toggle('active', el.textContent.trim() === (tab === 'history' ? '历史' : '收藏'));
        });
        if (tab === 'history') {
            loadHistory();
        } else {
            loadSaved();
        }
    }

    async function loadHistory() {
        var list = document.getElementById('pandora-list');
        if (!list) return;
        list.innerHTML = '<div class="pandora-list-loading">加载中...</div>';

        try {
            var resp = await API.getPandoraHistory();
            if (resp.success) {
                renderList(resp.items || []);
            }
        } catch (e) {
            list.innerHTML = '<div class="pandora-list-empty">加载失败</div>';
        }
    }

    async function loadSaved() {
        var list = document.getElementById('pandora-list');
        if (!list) return;
        list.innerHTML = '<div class="pandora-list-loading">加载中...</div>';

        try {
            var resp = await API.getPandoraSaved();
            if (resp.success) {
                renderList(resp.items || [], true);
            }
        } catch (e) {
            list.innerHTML = '<div class="pandora-list-empty">加载失败</div>';
        }
    }

    function renderList(items, isSaved) {
        var list = document.getElementById('pandora-list');
        if (!list) return;

        if (items.length === 0) {
            list.innerHTML = '<div class="pandora-list-empty">' + (isSaved ? '还没有收藏' : '还没有历史发现') + '</div>';
            return;
        }

        list.innerHTML = items.map(function(item) {
            return '<div class="pandora-history-card">' +
                '<div class="pandora-history-emoji">' + (item.emoji || '🎁') + '</div>' +
                '<div class="pandora-history-info">' +
                    '<div class="pandora-history-title">' + escapeHtml(item.title) + '</div>' +
                    '<div class="pandora-history-meta">' +
                        '<span class="pandora-history-topic">' + escapeHtml(item.topic_area || '') + '</span>' +
                        '<span class="pandora-history-date">' + item.date + '</span>' +
                    '</div>' +
                '</div>' +
                (item.saved ? '<span class="pandora-history-saved">★</span>' : '') +
            '</div>';
        }).join('');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderMarkdown(md) {
        if (!md) return '';
        var lines = md.split('\n');
        var html = [];
        var inList = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^### (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h4>' + formatInline(line.replace(/^### /, '')) + '</h4>');
            } else if (/^## (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h3>' + formatInline(line.replace(/^## /, '')) + '</h3>');
            } else if (/^# (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h2>' + formatInline(line.replace(/^# /, '')) + '</h2>');
            } else if (/^[-*] (.+)/.test(line)) {
                if (!inList) { html.push('<ul>'); inList = true; }
                html.push('<li>' + formatInline(line.replace(/^[-*] /, '')) + '</li>');
            } else if (line.trim() === '') {
                if (inList) { html.push('</ul>'); inList = false; }
            } else {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<p>' + formatInline(line) + '</p>');
            }
        }
        if (inList) html.push('</ul>');
        return html.join('\n');
    }

    function formatInline(text) {
        text = escapeHtml(text);
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        text = text.replace(/`(.+?)`/g, '<code>$1</code>');
        return text;
    }

    return {
        init: init,
        toggleSave: toggleSave,
        switchTab: switchTab
    };
})();
