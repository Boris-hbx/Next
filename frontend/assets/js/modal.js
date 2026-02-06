// ========== 统一任务弹窗 ==========

var modalMode = 'view';  // 'view', 'edit', 'create'
var modalTaskId = null;
var modalTaskItem = null;

function showAddModal() {
    openTaskModal('create', null, currentTab, 'important-urgent');
}

function showAddModalForQuadrant(quadrant) {
    openTaskModal('create', null, currentTab, quadrant);
}

function showTaskCard(taskId, element) {
    var item = allItems.find(function(i) { return i.id === taskId; });
    if (!item) return;
    openTaskModal('view', item);
}

function openTaskModal(mode, item, tab, quadrant) {
    modalMode = mode;
    modalTaskId = item ? item.id : null;
    modalTaskItem = item;

    var overlay = document.getElementById('task-modal-overlay');
    var titleInput = document.getElementById('modal-title');
    var contentInput = document.getElementById('modal-content');
    var progressInput = document.getElementById('modal-progress');
    var progressValue = document.getElementById('modal-progress-value');
    var dueDateInput = document.getElementById('modal-due-date');
    var assigneeInput = document.getElementById('modal-assignee');

    contentInput.style.height = '';

    if (item) {
        titleInput.value = item.text || '';
        contentInput.value = item.content || '';
        progressInput.value = item.progress || 0;
        progressValue.textContent = (item.progress || 0) + '%';
        progressInput.style.setProperty('--val', (item.progress || 0) + '%');
        dueDateInput.value = item.due_date || '';
        assigneeInput.value = item.assignee || '';
        setModalTab(item.tab || 'today');
        setModalQuadrant(item.quadrant || 'important-urgent');
    } else {
        titleInput.value = '';
        contentInput.value = '';
        progressInput.value = 0;
        progressValue.textContent = '0%';
        progressInput.style.setProperty('--val', '0%');
        dueDateInput.value = '';
        assigneeInput.value = '';
        setModalTab(tab || currentTab);
        setModalQuadrant(quadrant || 'important-urgent');
    }

    var createdAtEl = document.getElementById('modal-created-at');
    var completedAtEl = document.getElementById('modal-completed-at');
    if (item && item.created_at) {
        createdAtEl.querySelector('.meta-text').textContent = '创建于 ' + formatDateTime(item.created_at);
        createdAtEl.style.display = 'flex';
    } else {
        createdAtEl.style.display = mode === 'create' ? 'none' : 'flex';
        createdAtEl.querySelector('.meta-text').textContent = '创建于 --';
    }
    if (item && item.completed && item.completed_at) {
        completedAtEl.querySelector('.meta-text').textContent = '完成于 ' + formatDateTime(item.completed_at);
        completedAtEl.style.display = 'flex';
    } else {
        completedAtEl.style.display = 'none';
    }

    var changelogList = document.getElementById('modal-changelog');
    var changelog = (item && item.changelog) || [];
    if (changelog.length > 0) {
        var html = '';
        changelog.slice(-10).reverse().forEach(function(log) {
            html += '<div class="changelog-item">' +
                '<span class="changelog-time">' + formatShortTime(log.time) + '</span>' +
                '<span class="changelog-text">' + escapeHtml(log.label) + '</span>' +
            '</div>';
        });
        changelogList.innerHTML = html;
    } else {
        changelogList.innerHTML = '<div class="changelog-empty">暂无变更记录</div>';
    }
    changelogList.classList.remove('expanded');
    document.getElementById('changelog-toggle').classList.remove('expanded');

    document.getElementById('modal-meta-section').style.display = mode === 'create' ? 'none' : 'block';
    document.getElementById('modal-changelog-section').style.display = mode === 'create' ? 'none' : 'block';

    setModalMode(mode);

    overlay.style.display = 'flex';

    if (mode === 'create' || mode === 'edit') {
        setTimeout(function() { titleInput.focus(); }, 100);
    }
}

function toggleChangelog() {
    var btn = document.getElementById('changelog-toggle');
    var list = document.getElementById('modal-changelog');
    btn.classList.toggle('expanded');
    list.classList.toggle('expanded');
}

function setModalMode(mode) {
    modalMode = mode;
    var isEditable = (mode === 'edit' || mode === 'create');

    document.getElementById('modal-title').readOnly = !isEditable;
    document.getElementById('modal-content').readOnly = !isEditable;
    document.getElementById('modal-progress').disabled = !isEditable;
    document.getElementById('modal-due-date').readOnly = !isEditable;
    document.getElementById('modal-assignee').readOnly = !isEditable;

    document.querySelectorAll('#modal-tab-buttons .tab-btn').forEach(function(btn) {
        btn.disabled = !isEditable;
    });

    document.querySelectorAll('.q-option').forEach(function(opt) {
        if (isEditable) {
            opt.classList.remove('disabled');
            opt.style.pointerEvents = 'auto';
        } else {
            opt.classList.add('disabled');
            opt.style.pointerEvents = 'none';
        }
    });

    document.getElementById('header-edit-btn').style.display = (mode === 'view') ? 'inline-block' : 'none';
    document.getElementById('modal-footer-edit').style.display = (mode !== 'view') ? 'flex' : 'none';

    var saveBtn = document.getElementById('modal-save-btn');
    saveBtn.textContent = (mode === 'create') ? '创建' : '保存';
}

function setModalQuadrant(quadrant) {
    document.querySelectorAll('.q-option').forEach(function(opt) {
        opt.classList.remove('selected');
        if (opt.dataset.q === quadrant) {
            opt.classList.add('selected');
            opt.querySelector('input').checked = true;
        }
    });
}

function setModalTab(tab) {
    document.querySelectorAll('#modal-tab-buttons .tab-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.tab === tab);
    });
}

function getModalTab() {
    var selectedBtn = document.querySelector('#modal-tab-buttons .tab-btn.selected');
    return selectedBtn ? selectedBtn.dataset.tab : 'today';
}

function switchToEditMode() {
    setModalMode('edit');
    document.getElementById('modal-title').focus();
}

function onContentClick() {
    if (modalMode === 'view') {
        setModalMode('edit');
        document.getElementById('modal-content').focus();
    }
}

function closeTaskModal() {
    document.getElementById('task-modal-overlay').style.display = 'none';
    modalMode = 'view';
    modalTaskId = null;
    modalTaskItem = null;
}

function saveTask() {
    var title = document.getElementById('modal-title').value.trim();
    var content = document.getElementById('modal-content').value.trim();
    var progress = parseInt(document.getElementById('modal-progress').value) || 0;
    var dueDate = document.getElementById('modal-due-date').value || null;
    var assignee = document.getElementById('modal-assignee').value.trim();
    var tab = getModalTab();
    var quadrant = document.querySelector('.q-option.selected input').value;

    if (!title) {
        showToast('请输入任务标题', 'error');
        return;
    }

    var data = {
        text: title,
        tab: tab,
        quadrant: quadrant
    };
    if (content) data.content = content;
    if (progress > 0) data.progress = progress;
    if (dueDate) data.due_date = dueDate;
    if (assignee) data.assignee = assignee;

    if (modalMode === 'create') {
        API.createTodo(data)
            .then(result => {
                if (result.success) {
                    allItems.push(result.item);
                    updateCounts();
                    renderItems();
                    closeTaskModal();
                    showToast('任务已创建', 'success');
                } else {
                    showToast('创建失败: ' + (result.message || ''), 'error');
                }
            })
            .catch(err => {
                console.error('创建任务失败:', err);
                showToast('创建失败: ' + err.message, 'error');
            });
    } else {
        API.updateTodo(modalTaskId, data)
            .then(result => {
                if (result.success) {
                    allItems = allItems.map(function(i) {
                        return i.id === modalTaskId ? result.item : i;
                    });
                    updateCounts();
                    renderItems();
                    closeTaskModal();
                    showToast('已保存', 'success');
                } else {
                    showToast('保存失败', 'error');
                }
            });
    }
}

// 兼容旧函数
function closeTaskCard() {
    closeTaskModal();
}

function hideAddModal(e) {
    closeTaskModal();
}

function editTaskFromCard() {
    if (modalTaskItem) {
        switchToEditMode();
    }
}

// DOM 事件绑定
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeTaskModal();
    }
});

document.getElementById('modal-progress').addEventListener('input', function(e) {
    var val = e.target.value;
    document.getElementById('modal-progress-value').textContent = val + '%';
    e.target.style.setProperty('--val', val + '%');
});

document.querySelectorAll('.q-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
        if (modalMode === 'view') return;
        document.querySelectorAll('.q-option').forEach(function(o) {
            o.classList.remove('selected');
        });
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
    });
});

document.querySelectorAll('#modal-tab-buttons .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        if (modalMode === 'view') return;
        document.querySelectorAll('#modal-tab-buttons .tab-btn').forEach(function(b) {
            b.classList.remove('selected');
        });
        btn.classList.add('selected');
    });
});

// Quadrant selector (grid style)
document.querySelectorAll('.quadrant-cell').forEach(function(opt) {
    opt.addEventListener('click', function() {
        document.querySelectorAll('.quadrant-cell').forEach(function(o) {
            o.classList.remove('selected');
        });
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
    });
});
