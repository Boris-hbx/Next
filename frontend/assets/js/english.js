// ========== 场景英语模块 (IIFE) ==========
var English = (function() {
    var scenarios = [];
    var currentScenario = null;
    var initialized = false;

    function init() {
        if (!initialized) {
            bindEvents();
            initialized = true;
        }
        loadScenarios();
    }

    function bindEvents() {
        // Create modal
        var createBtn = document.getElementById('english-create-btn');
        if (createBtn) createBtn.onclick = openCreateModal;

        var emptyCreateBtn = document.getElementById('english-empty-create-btn');
        if (emptyCreateBtn) emptyCreateBtn.onclick = openCreateModal;

        var modalOverlay = document.getElementById('english-modal-overlay');
        if (modalOverlay) modalOverlay.onclick = closeCreateModal;

        var cancelBtn = document.getElementById('english-modal-cancel');
        if (cancelBtn) cancelBtn.onclick = closeCreateModal;

        var submitBtn = document.getElementById('english-modal-submit');
        if (submitBtn) submitBtn.onclick = createAndGenerate;

        // Detail view
        var backBtn = document.getElementById('english-back-btn');
        if (backBtn) backBtn.onclick = showList;

        var regenBtn = document.getElementById('english-regen-btn');
        if (regenBtn) regenBtn.onclick = regenerateContent;

        var deleteBtn = document.getElementById('english-delete-btn');
        if (deleteBtn) deleteBtn.onclick = deleteCurrentScenario;

        var shareBtn = document.getElementById('english-share-btn');
        if (shareBtn) shareBtn.onclick = shareCurrentScenario;
    }

    async function loadScenarios() {
        try {
            var resp = await API.getScenarios(0);
            if (resp.success) {
                scenarios = resp.items || [];
                renderList();
            }
        } catch (e) {
            console.error('[English] load failed:', e);
        }
    }

    function renderList() {
        var grid = document.getElementById('english-scenarios');
        var emptyState = document.getElementById('english-empty-state');
        var listView = document.querySelector('.english-list-view');
        var detailView = document.querySelector('.english-detail-view');

        if (listView) listView.style.display = '';
        if (detailView) detailView.style.display = 'none';

        if (!grid) return;

        if (scenarios.length === 0) {
            grid.style.display = 'none';
            if (emptyState) emptyState.style.display = '';
            return;
        }

        grid.style.display = '';
        if (emptyState) emptyState.style.display = 'none';

        grid.innerHTML = scenarios.map(function(s) {
            var statusBadge = '';
            var retryBtn = '';
            if (s.status === 'generating') {
                statusBadge = '<span class="english-status generating">生成中...</span>';
            } else if (s.status === 'error') {
                statusBadge = '<span class="english-status error">生成失败</span>';
                retryBtn = '<button class="english-retry-btn" onclick="event.stopPropagation();English.retryGenerate(\'' + s.id + '\')">重试</button>';
            } else if (s.status === 'draft') {
                statusBadge = '<span class="english-status draft">草稿</span>';
                retryBtn = '<button class="english-retry-btn" onclick="event.stopPropagation();English.retryGenerate(\'' + s.id + '\')">生成</button>';
            }

            return '<div class="english-card" data-id="' + s.id + '" onclick="English.openDetail(\'' + s.id + '\')">' +
                '<div class="english-card-icon">' + (s.icon || '📖') + '</div>' +
                '<div class="english-card-info">' +
                    '<div class="english-card-title">' + escapeHtml(s.title) + '</div>' +
                    (s.title_en ? '<div class="english-card-title-en">' + escapeHtml(s.title_en) + '</div>' : '') +
                    statusBadge +
                    retryBtn +
                '</div>' +
            '</div>';
        }).join('');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function openCreateModal() {
        var overlay = document.getElementById('english-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        var titleInput = document.getElementById('english-modal-title');
        if (titleInput) { titleInput.value = ''; titleInput.focus(); }
        var descInput = document.getElementById('english-modal-desc');
        if (descInput) descInput.value = '';
    }

    function closeCreateModal() {
        var overlay = document.getElementById('english-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function createAndGenerate() {
        var title = (document.getElementById('english-modal-title').value || '').trim();
        if (!title) {
            showToast('请输入场景标题', 'error');
            return;
        }
        var description = (document.getElementById('english-modal-desc').value || '').trim();

        closeCreateModal();
        showToast('正在创建场景...', 'info');

        try {
            var resp = await API.createScenario({ title: title, description: description || undefined });
            if (!resp.success) {
                showToast(resp.message || '创建失败', 'error');
                return;
            }

            var scenario = resp.item;
            scenarios.unshift(scenario);
            renderList();

            // Auto-generate content
            showToast('正在生成内容，请稍候...', 'info');
            scenario.status = 'generating';
            renderList();

            var genResp = await API.generateScenario(scenario.id);
            if (genResp.success && genResp.item) {
                var idx = scenarios.findIndex(function(s) { return s.id === scenario.id; });
                if (idx >= 0) scenarios[idx] = genResp.item;
                renderList();
                showToast('内容生成完成', 'success');
            } else {
                scenario.status = 'error';
                renderList();
                showToast(genResp.message || '生成失败', 'error');
            }
        } catch (e) {
            showToast('创建失败', 'error');
        }
    }

    async function openDetail(id) {
        var scenario = scenarios.find(function(s) { return s.id === id; });

        // If we don't have full content, fetch it
        if (!scenario || !scenario.content) {
            try {
                var resp = await API.getScenario(id);
                if (resp.success && resp.item) {
                    scenario = resp.item;
                    var idx = scenarios.findIndex(function(s) { return s.id === id; });
                    if (idx >= 0) scenarios[idx] = scenario;
                }
            } catch (e) {
                showToast('加载失败', 'error');
                return;
            }
        }

        if (!scenario) return;
        currentScenario = scenario;

        var listView = document.querySelector('.english-list-view');
        var detailView = document.querySelector('.english-detail-view');
        if (listView) listView.style.display = 'none';
        if (detailView) detailView.style.display = '';

        var titleEl = document.getElementById('english-detail-title');
        if (titleEl) titleEl.textContent = (scenario.icon || '📖') + ' ' + scenario.title;

        var contentEl = document.getElementById('english-content');
        if (contentEl) {
            if (scenario.status === 'generating') {
                contentEl.innerHTML = '<div class="english-loading"><div class="english-spinner"></div><p>正在生成内容...</p></div>';
            } else if (scenario.status === 'error') {
                contentEl.innerHTML = '<div class="english-error"><p>内容生成失败，请点击"重新生成"重试</p></div>';
            } else if (scenario.status === 'draft' || !scenario.content) {
                contentEl.innerHTML = '<div class="english-error"><p>尚未生成内容</p></div>';
            } else {
                contentEl.innerHTML = renderMarkdown(scenario.content);
            }
        }

        // Show/hide share button based on whether Friends module exists
        var shareBtn = document.getElementById('english-share-btn');
        if (shareBtn) shareBtn.style.display = '';
    }

    function showList() {
        currentScenario = null;
        var listView = document.querySelector('.english-list-view');
        var detailView = document.querySelector('.english-detail-view');
        if (listView) listView.style.display = '';
        if (detailView) detailView.style.display = 'none';
    }

    async function regenerateContent() {
        if (!currentScenario) return;
        showToast('正在重新生成...', 'info');

        try {
            var resp = await API.generateScenario(currentScenario.id);
            if (resp.success && resp.item) {
                currentScenario = resp.item;
                var idx = scenarios.findIndex(function(s) { return s.id === currentScenario.id; });
                if (idx >= 0) scenarios[idx] = currentScenario;
                openDetail(currentScenario.id);
                showToast('内容已更新', 'success');
            } else {
                showToast(resp.message || '生成失败', 'error');
            }
        } catch (e) {
            showToast('生成失败', 'error');
        }
    }

    async function deleteCurrentScenario() {
        if (!currentScenario) return;
        if (!confirm('确定删除这个场景吗？')) return;

        try {
            var resp = await API.deleteScenario(currentScenario.id);
            if (resp.success) {
                scenarios = scenarios.filter(function(s) { return s.id !== currentScenario.id; });
                showList();
                renderList();
                showToast('已删除', 'success');
            }
        } catch (e) {
            showToast('删除失败', 'error');
        }
    }

    function shareCurrentScenario() {
        if (!currentScenario) return;
        if (typeof Friends !== 'undefined' && Friends.openShareModal) {
            Friends.openShareModal('scenario', currentScenario.id);
        } else {
            showToast('好友功能加载中', 'info');
        }
    }

    // Simple Markdown renderer (handles headers, bold, lists, paragraphs)
    function renderMarkdown(md) {
        if (!md) return '';
        var lines = md.split('\n');
        var html = [];
        var inList = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            // Headers
            if (/^### (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h4>' + formatInline(line.replace(/^### /, '')) + '</h4>');
            } else if (/^## (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h3>' + formatInline(line.replace(/^## /, '')) + '</h3>');
            } else if (/^# (.+)/.test(line)) {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<h2>' + formatInline(line.replace(/^# /, '')) + '</h2>');
            }
            // List items
            else if (/^[-*] (.+)/.test(line)) {
                if (!inList) { html.push('<ul>'); inList = true; }
                html.push('<li>' + formatInline(line.replace(/^[-*] /, '')) + '</li>');
            }
            // Empty line
            else if (line.trim() === '') {
                if (inList) { html.push('</ul>'); inList = false; }
            }
            // Paragraph text
            else {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<p>' + formatInline(line) + '</p>');
            }
        }
        if (inList) html.push('</ul>');
        return html.join('\n');
    }

    function formatInline(text) {
        // Escape HTML before markdown conversion to prevent XSS
        text = escapeHtml(text);
        // Bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Inline code
        text = text.replace(/`(.+?)`/g, '<code>$1</code>');
        return text;
    }

    async function retryGenerate(id) {
        var scenario = scenarios.find(function(s) { return s.id === id; });
        if (!scenario) return;
        showToast('正在重新生成...', 'info');
        scenario.status = 'generating';
        renderList();
        try {
            var resp = await API.generateScenario(id);
            if (resp.success && resp.item) {
                var idx = scenarios.findIndex(function(s) { return s.id === id; });
                if (idx >= 0) scenarios[idx] = resp.item;
                renderList();
                showToast('内容生成完成', 'success');
            } else {
                scenario.status = 'error';
                renderList();
                showToast(resp.message || '生成失败，请稍后重试', 'error');
            }
        } catch (e) {
            scenario.status = 'error';
            renderList();
            showToast('生成失败，请检查网络', 'error');
        }
    }

    return {
        init: init,
        openDetail: openDetail,
        showList: showList,
        retryGenerate: retryGenerate
    };
})();
