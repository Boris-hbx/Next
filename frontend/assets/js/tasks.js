// ========== 任务渲染、CRUD、象限逻辑 ==========

function loadItems() {
    API.getTodos()
        .then(data => {
            console.log('[loadItems] data:', data);
            allItems = data.items || [];
            updateCounts();
            renderItems();
        })
        .catch(err => {
            console.error('[loadItems] error:', err);
            showToast('加载任务失败: ' + err.message, 'error');
        });
}

function updateCounts() {
    var counts = { today: 0, week: 0, month: 0 };
    var qcounts = {
        'important-urgent': 0,
        'important-not-urgent': 0,
        'not-important-urgent': 0,
        'not-important-not-urgent': 0
    };
    allItems.forEach(function(item) {
        if (!item.completed && !item.deleted) {
            counts[item.tab] = (counts[item.tab] || 0) + 1;
            if (item.tab === currentTab) {
                qcounts[item.quadrant] = (qcounts[item.quadrant] || 0) + 1;
            }
        }
    });
    document.getElementById('count-today').textContent = counts.today;
    document.getElementById('count-week').textContent = counts.week;
    document.getElementById('count-month').textContent = counts.month;
    Object.keys(qcounts).forEach(function(q) {
        var el = document.getElementById('qcount-' + q);
        if (el) el.textContent = '(' + qcounts[q] + ')';
    });
}

function renderItems() {
    var quadrants = ['important-urgent', 'important-not-urgent', 'not-important-urgent', 'not-important-not-urgent'];

    quadrants.forEach(function(q) {
        document.getElementById('items-' + q).innerHTML = '';
    });

    var completedHtml = '';
    var deletedHtml = '';

    allItems.forEach(function(item) {
        if (item.deleted) return;
        if (item.tab !== currentTab) return;
        if (item.completed) return;

        var container = document.getElementById('items-' + item.quadrant);
        if (container) {
            container.innerHTML += createItemHtml(item);
        }
    });

    allItems.forEach(function(item) {
        if (item.deleted) return;
        if (item.completed) {
            completedHtml += createCompletedItemHtml(item);
        }
    });

    allItems.forEach(function(item) {
        if (item.deleted) {
            deletedHtml += createDeletedItemHtml(item);
        }
    });

    document.getElementById('completed-list').innerHTML = completedHtml || '<div class="empty-hint">暂无已完成任务</div>';
    document.getElementById('deleted-list').innerHTML = deletedHtml || '<div class="empty-hint">暂无已删除任务</div>';

    attachTouchHandlers();
    attachTooltipHandlers();
    updateQuadrantScroll();
    updateButtonAnimations();
}

function updateQuadrantScroll() {
    var quadrants = ['important-urgent', 'important-not-urgent', 'not-important-urgent', 'not-important-not-urgent'];
    quadrants.forEach(function(q) {
        var container = document.getElementById('items-' + q);
        if (container) {
            var taskCount = container.querySelectorAll('.task-item').length;
            if (taskCount > 15) {
                container.classList.add('has-scroll');
            } else {
                container.classList.remove('has-scroll');
            }
        }
    });
}

function createItemHtml(item) {
    var progress = item.progress || 0;
    var progressRing = '<div class="progress-ring" style="--progress:' + progress + '" onclick="event.stopPropagation(); showProgressPopup(\'' + item.id + '\', this)" onmousedown="event.stopPropagation()" title="点击更新进度">' +
        '<span class="progress-ring-text">' + progress + '</span>' +
    '</div>';

    var assigneeHtml = item.assignee
        ? '<span class="task-assignee" title="' + escapeHtml(item.assignee) + '">' + escapeHtml(item.assignee) + '</span>'
        : '';

    return '<div class="task-item" data-id="' + item.id + '" onmousedown="startCustomDrag(event)">' +
        '<div class="drag-handle">⋮⋮</div>' +
        '<div class="task-checkbox" onclick="event.stopPropagation(); toggleComplete(\'' + item.id + '\')" onmousedown="event.stopPropagation()"></div>' +
        progressRing +
        '<div class="task-content" onclick="showTaskCard(\'' + item.id + '\', this.closest(\'.task-item\'))">' +
            '<div class="task-text">' + escapeHtml(item.text) + '</div>' +
        '</div>' +
        assigneeHtml +
        '<button class="task-delete" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); deleteTask(\'' + item.id + '\')" title="删除">&times;</button>' +
    '</div>';
}

function getCompletionStatus(item) {
    if (!item.due_date || !item.completed_at) return '';
    var due = new Date(item.due_date);
    due.setHours(23, 59, 59);
    var completed = new Date(item.completed_at);
    var diff = Math.floor((due - completed) / (1000 * 60 * 60 * 24));
    if (diff > 0) return '<span class="status-early">提前' + diff + '天</span>';
    if (diff < 0) return '<span class="status-late">超期' + Math.abs(diff) + '天</span>';
    return '<span class="status-ontime">按时</span>';
}

function createCompletedItemHtml(item) {
    var assignee = item.assignee ? escapeHtml(item.assignee) : '--';
    var status = getCompletionStatus(item);
    return '<div class="task-item completed" data-id="' + item.id + '" onclick="showTaskCard(\'' + item.id + '\')">' +
        '<div class="task-checkbox checked" onclick="event.stopPropagation(); toggleComplete(\'' + item.id + '\')">✓</div>' +
        '<div class="completed-task-name">' + escapeHtml(item.text) + '</div>' +
        '<div class="completed-task-assignee">' + assignee + '</div>' +
        '<div class="completed-task-status">' + status + '</div>' +
    '</div>';
}

function createDeletedItemHtml(item) {
    return '<div class="task-item deleted" data-id="' + item.id + '">' +
        '<div class="deleted-task-name">' + escapeHtml(item.text) + '</div>' +
        '<div class="deleted-task-actions">' +
            '<button class="btn-restore" onclick="restoreTask(\'' + item.id + '\')" title="恢复">↩</button>' +
            '<button class="btn-permanent-delete" onclick="permanentDeleteTask(\'' + item.id + '\')" title="永久删除">×</button>' +
        '</div>' +
    '</div>';
}

// 象限间移动
function moveToQuadrant(itemId, newQuadrant) {
    var item = allItems.find(function(i) { return i.id === itemId; });
    if (!item || item.quadrant === newQuadrant) return;

    API.updateTodo(itemId, { quadrant: newQuadrant })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(i) {
                    if (i.id === itemId) return data.item || Object.assign(i, {quadrant: newQuadrant});
                    return i;
                });
                updateCounts();
                renderItems();
                showToast('已移动到' + getQuadrantName(newQuadrant), 'success');
            }
        });
}

function moveToTab(itemId, newTab) {
    if (newTab === currentTab) return;

    API.updateTodo(itemId, { tab: newTab })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(i) {
                    if (i.id === itemId) return data.item || Object.assign(i, {tab: newTab});
                    return i;
                });
                updateCounts();
                renderItems();
                showToast('已移动到 ' + getTabName(newTab), 'success');
            }
        });
}

function moveToTabWithDefaultQuadrant(itemId, newTab) {
    if (newTab === currentTab) return;

    var defaultQuadrant = 'not-important-urgent';
    API.updateTodo(itemId, { tab: newTab, quadrant: defaultQuadrant })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(i) {
                    if (i.id === itemId) return data.item || Object.assign(i, {tab: newTab, quadrant: defaultQuadrant});
                    return i;
                });
                updateCounts();
                renderItems();
                showToast('已移动到 ' + getTabName(newTab) + ' - 待分类', 'success');
            }
        });
}

function moveToTabAndQuadrant(itemId, newTab, newQuadrant) {
    var item = allItems.find(function(i) { return i.id === itemId; });
    if (!item) return;

    if (item.tab === newTab && item.quadrant === newQuadrant) return;

    API.updateTodo(itemId, { tab: newTab, quadrant: newQuadrant })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(i) {
                    if (i.id === itemId) return data.item || Object.assign(i, {tab: newTab, quadrant: newQuadrant});
                    return i;
                });
                updateCounts();
                renderItems();
                showToast('已移动到 ' + getTabName(newTab) + ' - ' + getQuadrantName(newQuadrant), 'success');
            }
        });
}

function dropToTab(e, targetTab) {
    e.preventDefault();
    var itemId = e.dataTransfer.getData('text/plain');

    if (!itemId || targetTab === currentTab) return;

    API.updateTodo(itemId, { tab: targetTab })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(item) {
                    if (item.id === itemId) {
                        item.tab = targetTab;
                    }
                    return item;
                });
                updateCounts();
                renderItems();
                showToast('已移动到 ' + getTabName(targetTab), 'success');
            }
        });
}

// 任务完成/进度
function toggleComplete(itemId) {
    var item = allItems.find(function(i) { return i.id === itemId; });
    if (!item) return;

    if (item.completed) {
        API.updateTodo(itemId, { completed: false, progress: 0 })
            .then(data => {
                if (data.success) {
                    allItems = allItems.map(function(i) {
                        return i.id === itemId ? data.item : i;
                    });
                    updateCounts();
                    renderItems();
                    showToast('已恢复', 'success');
                }
            });
        return;
    }

    showProgressDialog(item);
}

function showProgressPopup(itemId, element) {
    var item = allItems.find(function(i) { return i.id === itemId; });
    if (item) {
        showProgressDialog(item);
    }
}

function showProgressDialog(item) {
    var currentProgress = item.progress || 0;

    var overlay = document.createElement('div');
    overlay.className = 'progress-dialog-overlay';
    overlay.innerHTML =
        '<div class="progress-dialog">' +
            '<div class="progress-dialog-title">设置完成度</div>' +
            '<div class="progress-dialog-task">' + escapeHtml(item.text) + '</div>' +
            '<div class="progress-slider-container">' +
                '<input type="range" class="progress-slider" id="progress-slider" min="0" max="100" value="' + currentProgress + '" style="--val:' + currentProgress + '%">' +
                '<div class="progress-value" id="progress-value">' + currentProgress + '%</div>' +
            '</div>' +
            '<div class="progress-dialog-buttons">' +
                '<button class="progress-btn cancel" id="progress-cancel">取消</button>' +
                '<button class="progress-btn confirm" id="progress-confirm">确定</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    var slider = document.getElementById('progress-slider');
    var valueDisplay = document.getElementById('progress-value');
    var confirmBtn = document.getElementById('progress-confirm');
    var cancelBtn = document.getElementById('progress-cancel');

    var lastSliderValue = currentProgress;
    var sliderVelocity = 0;

    slider.addEventListener('input', function() {
        var val = parseInt(slider.value);
        valueDisplay.textContent = val + '%';
        slider.style.setProperty('--val', val + '%');

        sliderVelocity = Math.abs(val - lastSliderValue);
        lastSliderValue = val;

        if (window.syncLineWithProgress) {
            var sliderRect = slider.getBoundingClientRect();
            var sliderX = sliderRect.left + (val / 100) * sliderRect.width;
            window.syncLineWithProgress(sliderX, sliderVelocity);
        }

        if (val >= 100) {
            valueDisplay.classList.add('complete');
            confirmBtn.textContent = '确定完成';
            confirmBtn.classList.add('complete');
        } else {
            valueDisplay.classList.remove('complete');
            confirmBtn.textContent = '确定';
            confirmBtn.classList.remove('complete');
        }
    });

    slider.addEventListener('mouseup', function() {
        if (window.releaseLineProgress) {
            window.releaseLineProgress();
        }
    });
    slider.addEventListener('touchend', function() {
        if (window.releaseLineProgress) {
            window.releaseLineProgress();
        }
    });

    cancelBtn.addEventListener('click', function() {
        document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });

    confirmBtn.addEventListener('click', function() {
        var newProgress = parseInt(slider.value);

        if (newProgress >= 100) {
            document.body.removeChild(overlay);
            window.AppUtils.showConfirm(
                '确定要将此任务标记为已完成吗？\n完成后任务将移至已完成列表。',
                function() {
                    saveProgress(item.id, 100, true);
                },
                { confirmText: '确定完成' }
            );
        } else {
            saveProgress(item.id, newProgress, false);
            document.body.removeChild(overlay);
        }
    });
}

function saveProgress(itemId, progress, completed) {
    API.updateTodo(itemId, { progress: progress, completed: completed })
        .then(data => {
            if (data.success) {
                allItems = allItems.map(function(i) {
                    return i.id === itemId ? data.item : i;
                });
                updateCounts();
                renderItems();
                showToast(completed ? '已完成' : '进度已更新', 'success');
                if (window.triggerLinePulse) {
                    window.triggerLinePulse('success');
                }
            } else {
                if (window.triggerLinePulse) {
                    window.triggerLinePulse('error');
                }
            }
        })
        .catch(function() {
            if (window.triggerLinePulse) {
                window.triggerLinePulse('error');
            }
        });
}

// 任务删除/恢复
function deleteTask(itemId) {
    window.AppUtils.showConfirm('确定要删除这个任务吗？', function() {
        API.deleteTodo(itemId)
            .then(data => {
                if (data.success) {
                    var item = allItems.find(function(i) { return i.id === itemId; });
                    if (item) {
                        item.deleted = true;
                        item.deleted_at = new Date().toISOString();
                    }
                    updateCounts();
                    renderItems();
                    showToast('已移入回收站', 'success');
                }
            });
    }, { confirmText: '删除', danger: true });
}

function restoreTask(itemId) {
    API.restoreTodo(itemId)
        .then(data => {
            if (data.success) {
                var item = allItems.find(function(i) { return i.id === itemId; });
                if (item) {
                    item.deleted = false;
                    delete item.deleted_at;
                }
                updateCounts();
                renderItems();
                showToast('已恢复', 'success');
            }
        });
}

function permanentDeleteTask(itemId) {
    window.AppUtils.showConfirm('永久删除后无法恢复，确定吗？', function() {
        API.permanentDeleteTodo(itemId)
            .then(data => {
                if (data.success) {
                    allItems = allItems.filter(function(i) { return i.id !== itemId; });
                    renderItems();
                    showToast('已永久删除', 'success');
                }
            });
    }, { confirmText: '永久删除', danger: true });
}

// 行内编辑任务标题
function editTask(itemId) {
    var item = allItems.find(function(i) { return i.id === itemId; });
    if (!item) return;

    var taskElement = document.querySelector('.task-item[data-id="' + itemId + '"]');
    if (!taskElement) return;

    var textElement = taskElement.querySelector('.task-text');
    if (!textElement || textElement.classList.contains('editing')) return;

    var originalText = item.text;

    var editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'task-edit-input';
    editInput.value = originalText;

    textElement.classList.add('editing');
    textElement.innerHTML = '';
    textElement.appendChild(editInput);
    editInput.focus();
    editInput.select();

    function saveEdit() {
        var newText = editInput.value.trim();
        if (!newText || newText === originalText) {
            cancelEdit();
            return;
        }

        API.updateTodo(itemId, { text: newText })
            .then(data => {
                if (data.success) {
                    allItems = allItems.map(function(i) {
                        if (i.id === itemId) {
                            i.text = newText;
                        }
                        return i;
                    });
                    renderItems();
                    showToast('已更新', 'success');
                } else {
                    cancelEdit();
                    showToast('更新失败', 'error');
                }
            })
            .catch(function() {
                cancelEdit();
                showToast('更新失败', 'error');
            });
    }

    function cancelEdit() {
        textElement.classList.remove('editing');
        textElement.innerHTML = escapeHtml(originalText);
    }

    editInput.addEventListener('blur', saveEdit);
    editInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            editInput.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            editInput.removeEventListener('blur', saveEdit);
            cancelEdit();
        }
    });
}
