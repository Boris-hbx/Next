// ========== 全局状态 & 初始化 ==========

var currentTab = 'today';
var allItems = [];
var showCompleted = true;  // 默认显示已完成任务
var draggedItem = null;
var draggedItemQuadrant = null;  // 拖拽任务原本所在的象限
var routines = [];  // 每日例行任务

// Tab 切换
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.matrix-tab').forEach(function(t) {
        t.classList.remove('active');
        if (t.dataset.tab === tab) {
            t.classList.add('active');
        }
    });
    // 更新 modal 中的时间段按钮
    document.querySelectorAll('#modal-tab-buttons .tab-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.tab === tab);
    });
    updateCounts();
    renderItems();
}

// 象限折叠功能
function toggleQuadrant(header) {
    var quadrant = header.closest('.quadrant');
    quadrant.classList.toggle('collapsed');
    saveQuadrantState();
}

function saveQuadrantState() {
    var states = {};
    document.querySelectorAll('.quadrant').forEach(function(q) {
        states[q.dataset.quadrant] = q.classList.contains('collapsed');
    });
    localStorage.setItem('quadrantStates', JSON.stringify(states));
}

function loadQuadrantState() {
    var saved = localStorage.getItem('quadrantStates');
    if (!saved) return;
    var states = JSON.parse(saved);
    document.querySelectorAll('.quadrant').forEach(function(q) {
        var key = q.dataset.quadrant;
        if (states[key] !== undefined) {
            q.classList.toggle('collapsed', states[key]);
        }
    });
}

function toggleSidebarSection(sectionId) {
    var section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('expanded');
    }
}
