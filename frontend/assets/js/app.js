// ========== 认证检查 ==========

// 页面加载时检查登录状态
(async function checkAuth() {
    // login.html 不需要检查
    if (window.location.pathname === '/login.html') return;
    try {
        var resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!resp.ok) {
            window.location.href = '/login.html';
            return;
        }
        var data = await resp.json();
        if (data.success && data.user) {
            // Update avatar with first letter of display name or username
            var name = data.user.display_name || data.user.username || '';
            window._userInitial = name ? name.charAt(0).toUpperCase() : 'B';
            var avatarTextEl = document.getElementById('avatar-text');
            if (avatarTextEl && name) {
                avatarTextEl.textContent = window._userInitial;
            }
            // Sync server avatar to localStorage, then apply
            if (data.user.avatar) {
                localStorage.setItem('userAvatar', data.user.avatar);
            }
            if (typeof applyAvatar === 'function') applyAvatar();
        }
    } catch(e) {
        // Network error — stay on page, will work offline with cached data
    }
})();

// ========== 全局状态 & 初始化 ==========

var currentTab = 'today';
var allItems = [];
var showCompleted = true;  // 默认显示已完成任务
var draggedItem = null;
var draggedItemQuadrant = null;  // 拖拽任务原本所在的象限
var routines = [];  // 每日例行任务
var currentAssigneeFilter = null;  // null = 全部, 'name' = 指定人
var currentPage = 'todo';  // 'todo' | 'review' | 'english' | 'life' | 'settings'

// Tab 切换
function switchTab(tab) {
    currentTab = tab;
    // Reset assignee filter if the selected person doesn't exist in new tab
    if (currentAssigneeFilter) {
        var hasAssignee = allItems.some(function(item) {
            return !item.deleted && !item.completed && item.tab === tab && item.assignee === currentAssigneeFilter;
        });
        if (!hasAssignee) currentAssigneeFilter = null;
    }
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

// 页面切换 (Todo ↔ 例行审视 ↔ 收件箱 ↔ 设置)
function switchPage(page) {
    if (currentPage === page) return;
    currentPage = page;

    // 更新桌面端 nav-link
    document.querySelectorAll('.nav-link').forEach(function(el) {
        el.classList.toggle('active', el.dataset.page === page);
    });

    // 切换视图显示
    document.getElementById('todo-view').style.display = page === 'todo' ? '' : 'none';
    document.getElementById('review-view').style.display = page === 'review' ? '' : 'none';
    document.getElementById('english-view').style.display = page === 'english' ? '' : 'none';
    var lifeView = document.getElementById('life-view');
    if (lifeView) lifeView.style.display = page === 'life' ? '' : 'none';
    document.getElementById('settings-view').style.display = page === 'settings' ? '' : 'none';

    // Mobile FAB: show only on todo page
    var fab = document.getElementById('mobile-fab');
    if (fab) fab.classList.toggle('hidden', page !== 'todo');

    // Learn FAB: show only on english page
    var learnFab = document.getElementById('learn-fab');
    if (learnFab) learnFab.style.display = page === 'english' ? '' : 'none';

    // 通过 body class 控制设置页面
    document.body.classList.toggle('page-settings', page === 'settings');

    if (page === 'review' && typeof loadReviews === 'function') {
        loadReviews();
    }
    if (page === 'english' && typeof English !== 'undefined') {
        English.init();
    }
    if (page === 'life') {
        if (typeof Life !== 'undefined') Life.init();
    }
    if (page === 'settings') {
        if (typeof loadSettingsData === 'function') loadSettingsData();
        if (typeof Friends !== 'undefined' && Friends.loadFriendsData) Friends.loadFriendsData();
        activateMobileNav(null);
    }

    // Load shared inbox when switching to todo or english pages
    if ((page === 'todo' || page === 'english') && typeof Friends !== 'undefined') {
        Friends.loadSharedInbox();
    }
}

// Mobile bottom nav activation (pass null to deactivate all)
function activateMobileNav(el) {
    document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
        item.classList.remove('active');
    });
    if (el) el.classList.add('active');
}

// ========== 头像下拉菜单 ==========
function toggleAvatarMenu(e) {
    e.stopPropagation();
    var menu = document.getElementById('avatar-menu');
    menu.classList.toggle('open');
}

function closeAvatarMenu() {
    var menu = document.getElementById('avatar-menu');
    if (menu) menu.classList.remove('open');
}

// 点击页面其他区域关闭菜单
document.addEventListener('click', function(e) {
    var wrapper = document.querySelector('.header-avatar-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        closeAvatarMenu();
    }
});

function toggleSidebarSection(sectionId) {
    var section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('expanded');
    }
}

// ========== 此刻 (Moment) — 顶栏一句话 ==========
var Moment = (function() {
    var _lastLoadTime = 0;
    var _refreshTimer = null;

    function getTimeIcon() {
        var h = new Date().getHours();
        if (h >= 6 && h < 12) return '\u2600\uFE0F';   // ☀️
        if (h >= 12 && h < 18) return '\u26C5';          // ⛅
        if (h >= 18 && h < 22) return '\uD83C\uDF19';    // 🌙
        return '\uD83C\uDF1F';                            // 🌟
    }

    function setIcon() {
        var el = document.getElementById('moment-icon');
        if (el) el.textContent = getTimeIcon();
    }

    async function load() {
        setIcon();
        var textEl = document.getElementById('moment-text');
        if (!textEl) return;

        try {
            var data = await API.getMoment();
            if (data.success && data.text) {
                textEl.textContent = data.text;
                textEl.classList.add('visible');
                _lastLoadTime = Date.now();
            }
        } catch(e) {
            // Fallback: show time-based greeting
            var h = new Date().getHours();
            var greeting = h < 6 ? '夜深了，早点休息' :
                           h < 10 ? '早上好' :
                           h < 13 ? '上午好' :
                           h < 18 ? '下午好' :
                           h < 23 ? '晚上好' : '夜深了，早点休息';
            textEl.textContent = greeting;
            textEl.classList.add('visible');
        }
    }

    function startAutoRefresh() {
        if (_refreshTimer) clearInterval(_refreshTimer);
        _refreshTimer = setInterval(function() {
            load();
        }, 15 * 60 * 1000); // 15 minutes

        // Refresh when page becomes visible again (after being in background)
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && Date.now() - _lastLoadTime > 15 * 60 * 1000) {
                load();
            }
        });
    }

    function refreshIfStale() {
        if (Date.now() - _lastLoadTime > 5 * 60 * 1000) {
            load();
        }
    }

    return {
        load: load,
        startAutoRefresh: startAutoRefresh,
        refreshIfStale: refreshIfStale,
    };
})();
