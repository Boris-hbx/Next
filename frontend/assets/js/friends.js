// ========== 好友与分享模块 (IIFE) ==========
var Friends = (function() {
    var friends = [];
    var friendRequests = [];
    var sharedItems = [];
    var initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;
        bindEvents();
    }

    function bindEvents() {
        // Add friend button in settings
        var addFriendBtn = document.getElementById('add-friend-btn');
        if (addFriendBtn) addFriendBtn.onclick = openSearchModal;

        // Search modal
        var searchOverlay = document.getElementById('friend-search-overlay');
        if (searchOverlay) searchOverlay.onclick = closeSearchModal;

        var searchInput = document.getElementById('friend-search-input');
        if (searchInput) {
            var debounceTimer;
            searchInput.oninput = function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function() {
                    searchUsers(searchInput.value.trim());
                }, 300);
            };
        }

        // Share modal
        var shareOverlay = document.getElementById('share-modal-overlay');
        if (shareOverlay) shareOverlay.onclick = closeShareModal;
    }

    // ─── Friends Management (Settings page) ───

    async function loadFriendsData() {
        init();
        try {
            var [friendsResp, requestsResp] = await Promise.all([
                API.getFriends(),
                API.getFriendRequests()
            ]);
            if (friendsResp.success) friends = friendsResp.items || [];
            if (requestsResp.success) friendRequests = requestsResp.items || [];
            renderFriendsList();
            renderFriendRequests();
        } catch (e) {
            console.error('[Friends] load failed:', e);
        }
    }

    function renderFriendsList() {
        var container = document.getElementById('friends-list');
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = '<div class="friends-empty">还没有好友</div>';
            return;
        }

        container.innerHTML = friends.map(function(f) {
            var name = f.display_name || f.username;
            var initial = name.charAt(0).toUpperCase();
            return '<div class="friend-item">' +
                '<div class="friend-avatar">' + initial + '</div>' +
                '<div class="friend-info">' +
                    '<span class="friend-name">' + escapeHtml(name) + '</span>' +
                    '<span class="friend-username">@' + escapeHtml(f.username) + '</span>' +
                '</div>' +
                '<button class="friend-remove-btn" onclick="Friends.removeFriend(\'' + f.friendship_id + '\')" title="删除好友">&times;</button>' +
            '</div>';
        }).join('');
    }

    function renderFriendRequests() {
        var container = document.getElementById('friend-requests');
        if (!container) return;

        if (friendRequests.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '<h5>待处理的好友请求</h5>' + friendRequests.map(function(r) {
            var name = r.from_user.display_name || r.from_user.username;
            return '<div class="friend-request-item">' +
                '<span class="friend-request-name">' + escapeHtml(name) + ' (@' + escapeHtml(r.from_user.username) + ')</span>' +
                '<div class="friend-request-actions">' +
                    '<button class="btn-accept" onclick="Friends.acceptRequest(\'' + r.id + '\')">接受</button>' +
                    '<button class="btn-decline" onclick="Friends.declineRequest(\'' + r.id + '\')">拒绝</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    async function acceptRequest(id) {
        try {
            var resp = await API.acceptFriend(id);
            if (resp.success) {
                showToast('已接受', 'success');
                loadFriendsData();
            } else {
                showToast(resp.message || '操作失败', 'error');
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    async function declineRequest(id) {
        try {
            var resp = await API.declineFriend(id);
            if (resp.success) {
                showToast('已拒绝', 'success');
                friendRequests = friendRequests.filter(function(r) { return r.id !== id; });
                renderFriendRequests();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    async function removeFriend(friendshipId) {
        if (!confirm('确定删除这位好友吗？')) return;
        try {
            var resp = await API.deleteFriend(friendshipId);
            if (resp.success) {
                showToast('已删除好友', 'success');
                friends = friends.filter(function(f) { return f.friendship_id !== friendshipId; });
                renderFriendsList();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    // ─── Search Modal ───

    function openSearchModal() {
        var overlay = document.getElementById('friend-search-overlay');
        if (overlay) overlay.style.display = 'flex';
        var input = document.getElementById('friend-search-input');
        if (input) { input.value = ''; input.focus(); }
        var results = document.getElementById('friend-search-results');
        if (results) results.innerHTML = '';
    }

    function closeSearchModal() {
        var overlay = document.getElementById('friend-search-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function searchUsers(query) {
        var results = document.getElementById('friend-search-results');
        if (!results) return;
        if (!query || query.length < 1) {
            results.innerHTML = '';
            return;
        }

        try {
            var resp = await API.searchUsers(query);
            if (resp.success && resp.items) {
                if (resp.items.length === 0) {
                    results.innerHTML = '<div class="search-empty">没有找到用户</div>';
                    return;
                }
                results.innerHTML = resp.items.map(function(u) {
                    var name = u.display_name || u.username;
                    var isFriend = friends.some(function(f) { return f.id === u.id; });
                    var btn = isFriend
                        ? '<span class="already-friend">已是好友</span>'
                        : '<button class="btn-add-friend" onclick="Friends.sendRequest(\'' + escapeHtml(u.username) + '\')">添加</button>';
                    return '<div class="search-user-item">' +
                        '<span class="search-user-name">' + escapeHtml(name) + ' (@' + escapeHtml(u.username) + ')</span>' +
                        btn +
                    '</div>';
                }).join('');
            }
        } catch (e) {
            results.innerHTML = '<div class="search-empty">搜索失败</div>';
        }
    }

    async function sendRequest(username) {
        try {
            var resp = await API.sendFriendRequest(username);
            if (resp.success) {
                showToast('好友请求已发送', 'success');
                closeSearchModal();
            } else {
                showToast(resp.message || '发送失败', 'error');
            }
        } catch (e) {
            showToast('发送失败', 'error');
        }
    }

    // ─── Share Modal ───

    var shareContext = { itemType: '', itemId: '' };

    function openShareModal(itemType, itemId) {
        shareContext.itemType = itemType;
        shareContext.itemId = itemId;

        var overlay = document.getElementById('share-modal-overlay');
        if (overlay) overlay.style.display = 'flex';

        renderShareFriendsList();
    }

    function closeShareModal() {
        var overlay = document.getElementById('share-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function renderShareFriendsList() {
        // Ensure friends are loaded
        if (friends.length === 0) {
            try {
                var resp = await API.getFriends();
                if (resp.success) friends = resp.items || [];
            } catch (e) {}
        }

        var container = document.getElementById('share-friends-list');
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = '<div class="friends-empty">还没有好友，去设置页面添加吧</div>';
            return;
        }

        container.innerHTML = friends.map(function(f) {
            var name = f.display_name || f.username;
            var initial = name.charAt(0).toUpperCase();
            return '<div class="share-friend-item" onclick="Friends.doShare(\'' + f.id + '\')">' +
                '<div class="friend-avatar">' + initial + '</div>' +
                '<span class="friend-name">' + escapeHtml(name) + '</span>' +
            '</div>';
        }).join('');
    }

    async function doShare(friendId) {
        try {
            var resp = await API.shareItem(friendId, shareContext.itemType, shareContext.itemId);
            if (resp.success) {
                showToast('分享成功', 'success');
                closeShareModal();
            } else {
                showToast(resp.message || '分享失败', 'error');
            }
        } catch (e) {
            showToast('分享失败', 'error');
        }
    }

    // ─── Shared Inbox ───

    async function loadSharedInbox() {
        init();
        try {
            var resp = await API.getSharedInbox();
            if (resp.success) {
                sharedItems = resp.items || [];
                renderSharedInbox();
            }
        } catch (e) {
            console.error('[Friends] inbox load failed:', e);
        }
    }

    function renderSharedInbox() {
        var container = document.getElementById('shared-inbox-section');
        if (!container) return;

        if (sharedItems.length === 0) {
            container.innerHTML = '';
            return;
        }

        var typeIcons = { todo: '✓', review: '🔄', scenario: '📖' };
        var typeLabels = { todo: '任务', review: '例行事项', scenario: '英语场景' };

        var html = '<h4 class="shared-inbox-title">好友分享</h4>';
        html += sharedItems.map(function(item) {
            var icon = typeIcons[item.item_type] || '📦';
            var label = typeLabels[item.item_type] || item.item_type;
            var title = '';
            if (item.item_snapshot) {
                title = item.item_snapshot.text || item.item_snapshot.title || '(未命名)';
            }

            return '<div class="shared-item-card">' +
                '<div class="shared-item-header">' +
                    '<span class="shared-item-icon">' + icon + '</span>' +
                    '<span class="shared-item-type">' + label + '</span>' +
                    '<span class="shared-item-from">来自 ' + escapeHtml(item.sender_name || '好友') + '</span>' +
                '</div>' +
                '<div class="shared-item-title">' + escapeHtml(title) + '</div>' +
                (item.message ? '<div class="shared-item-msg">' + escapeHtml(item.message) + '</div>' : '') +
                '<div class="shared-item-actions">' +
                    '<button class="btn-accept" onclick="Friends.acceptShared(\'' + item.id + '\')">收下</button>' +
                    '<button class="btn-decline" onclick="Friends.dismissShared(\'' + item.id + '\')">忽略</button>' +
                '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    async function acceptShared(id) {
        try {
            var resp = await API.acceptShared(id);
            if (resp.success) {
                showToast('已收下', 'success');
                sharedItems = sharedItems.filter(function(s) { return s.id !== id; });
                renderSharedInbox();
                updateInboxBadge();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    async function dismissShared(id) {
        try {
            var resp = await API.dismissShared(id);
            if (resp.success) {
                sharedItems = sharedItems.filter(function(s) { return s.id !== id; });
                renderSharedInbox();
                updateInboxBadge();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }

    // ─── Badge ───

    async function updateInboxBadge() {
        try {
            var resp = await API.getSharedInboxCount();
            if (resp.success) {
                var badge = document.getElementById('inbox-badge');
                if (badge) {
                    if (resp.count > 0) {
                        badge.textContent = resp.count;
                        badge.style.display = '';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }
        } catch (e) {}
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // Auto-check inbox badge on load
    setTimeout(function() {
        updateInboxBadge();
    }, 2000);

    return {
        init: init,
        loadFriendsData: loadFriendsData,
        loadSharedInbox: loadSharedInbox,
        acceptRequest: acceptRequest,
        declineRequest: declineRequest,
        removeFriend: removeFriend,
        sendRequest: sendRequest,
        openShareModal: openShareModal,
        closeShareModal: closeShareModal,
        doShare: doShare,
        acceptShared: acceptShared,
        dismissShared: dismissShared,
        updateInboxBadge: updateInboxBadge
    };
})();
