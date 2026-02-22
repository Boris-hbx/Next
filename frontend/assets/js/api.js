// ========== API 封装层 (REST fetch + Cookie 认证) ==========
var API = (function() {
    var BASE = '/api';

    async function request(method, path, body) {
        var opts = {
            method: method,
            headers: {},
            credentials: 'same-origin'
        };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        try {
            var resp = await fetch(BASE + path, opts);
            var data = await resp.json();
            if (resp.status === 401) {
                // Session expired, redirect to login
                window.location.href = '/login.html';
                throw new Error('UNAUTHORIZED');
            }
            return data;
        } catch (err) {
            if (err.message === 'UNAUTHORIZED') throw err;
            console.error('[API] error:', method, path, err);
            throw err;
        }
    }

    return {
        // ===== Auth APIs =====
        register: async function(username, password, displayName) {
            return await request('POST', '/auth/register', {
                username: username,
                password: password,
                display_name: displayName || undefined
            });
        },

        login: async function(username, password) {
            return await request('POST', '/auth/login', {
                username: username,
                password: password
            });
        },

        logout: async function() {
            return await request('POST', '/auth/logout');
        },

        getMe: async function() {
            return await request('GET', '/auth/me');
        },

        changePassword: async function(oldPassword, newPassword) {
            return await request('POST', '/auth/change-password', {
                old_password: oldPassword,
                new_password: newPassword
            });
        },

        updateAvatar: async function(avatar) {
            return await request('PUT', '/auth/avatar', { avatar: avatar });
        },

        // ===== Todo APIs =====
        getTodos: async function(tab) {
            var path = '/todos';
            if (tab) path += '?tab=' + encodeURIComponent(tab);
            return await request('GET', path);
        },

        getTodo: async function(id) {
            return await request('GET', '/todos/' + encodeURIComponent(id));
        },

        createTodo: async function(data) {
            return await request('POST', '/todos', data);
        },

        updateTodo: async function(id, data) {
            return await request('PUT', '/todos/' + encodeURIComponent(id), data);
        },

        deleteTodo: async function(id) {
            return await request('DELETE', '/todos/' + encodeURIComponent(id));
        },

        restoreTodo: async function(id) {
            return await request('POST', '/todos/' + encodeURIComponent(id) + '/restore');
        },

        permanentDeleteTodo: async function(id) {
            return await request('DELETE', '/todos/' + encodeURIComponent(id) + '/permanent');
        },

        batchUpdateTodos: async function(updates) {
            return await request('PUT', '/todos/batch', updates);
        },

        getTodoCounts: async function(tab) {
            return await request('GET', '/todos/counts?tab=' + encodeURIComponent(tab));
        },

        // ===== Routine APIs =====
        getRoutines: async function() {
            return await request('GET', '/routines');
        },

        createRoutine: async function(text) {
            return await request('POST', '/routines', { text: text });
        },

        toggleRoutine: async function(id) {
            return await request('POST', '/routines/' + encodeURIComponent(id) + '/toggle');
        },

        deleteRoutine: async function(id) {
            return await request('DELETE', '/routines/' + encodeURIComponent(id));
        },

        // ===== Review APIs =====
        getReviews: async function() {
            return await request('GET', '/reviews');
        },

        createReview: async function(data) {
            return await request('POST', '/reviews', data);
        },

        updateReview: async function(id, data) {
            return await request('PUT', '/reviews/' + encodeURIComponent(id), data);
        },

        completeReview: async function(id) {
            return await request('POST', '/reviews/' + encodeURIComponent(id) + '/complete');
        },

        uncompleteReview: async function(id) {
            return await request('POST', '/reviews/' + encodeURIComponent(id) + '/uncomplete');
        },

        deleteReview: async function(id) {
            return await request('DELETE', '/reviews/' + encodeURIComponent(id));
        },

        // ===== Quote API =====
        getRandomQuote: async function() {
            return await request('GET', '/quotes/random');
        },

        // ===== Chat APIs (阿宝) =====
        sendChat: async function(message, conversationId) {
            return await request('POST', '/chat', {
                message: message,
                conversation_id: conversationId || undefined
            });
        },

        getConversations: async function() {
            return await request('GET', '/conversations');
        },

        getConversationMessages: async function(convId) {
            return await request('GET', '/conversations/' + encodeURIComponent(convId) + '/messages');
        },

        deleteConversation: async function(convId) {
            return await request('DELETE', '/conversations/' + encodeURIComponent(convId));
        },

        renameConversation: async function(convId, title) {
            return await request('POST', '/conversations/' + encodeURIComponent(convId) + '/rename', { title: title });
        },

        getChatUsage: async function() {
            return await request('GET', '/chat/usage');
        },

        // ===== English Scenario APIs =====
        getScenarios: async function(archived) {
            var path = '/english/scenarios';
            if (archived !== undefined) path += '?archived=' + archived;
            return await request('GET', path);
        },

        createScenario: async function(data) {
            return await request('POST', '/english/scenarios', data);
        },

        getScenario: async function(id) {
            return await request('GET', '/english/scenarios/' + encodeURIComponent(id));
        },

        updateScenario: async function(id, data) {
            return await request('PUT', '/english/scenarios/' + encodeURIComponent(id), data);
        },

        deleteScenario: async function(id) {
            return await request('DELETE', '/english/scenarios/' + encodeURIComponent(id));
        },

        generateScenario: async function(id) {
            return await request('POST', '/english/scenarios/' + encodeURIComponent(id) + '/generate');
        },

        archiveScenario: async function(id) {
            return await request('POST', '/english/scenarios/' + encodeURIComponent(id) + '/archive');
        },

        // ===== Friends APIs =====
        getFriends: async function() {
            return await request('GET', '/friends');
        },

        getFriendRequests: async function() {
            return await request('GET', '/friends/requests');
        },

        sendFriendRequest: async function(username) {
            return await request('POST', '/friends/request', { username: username });
        },

        acceptFriend: async function(id) {
            return await request('POST', '/friends/' + encodeURIComponent(id) + '/accept');
        },

        declineFriend: async function(id) {
            return await request('POST', '/friends/' + encodeURIComponent(id) + '/decline');
        },

        deleteFriend: async function(id) {
            return await request('DELETE', '/friends/' + encodeURIComponent(id));
        },

        searchUsers: async function(q) {
            return await request('GET', '/friends/search?q=' + encodeURIComponent(q));
        },

        // ===== Share APIs =====
        shareItem: async function(friendId, itemType, itemId, message) {
            return await request('POST', '/share', {
                friend_id: friendId,
                item_type: itemType,
                item_id: itemId,
                message: message || undefined
            });
        },

        getSharedInbox: async function() {
            return await request('GET', '/share/inbox');
        },

        getSharedInboxCount: async function() {
            return await request('GET', '/share/inbox/count');
        },

        acceptShared: async function(id) {
            return await request('POST', '/share/' + encodeURIComponent(id) + '/accept');
        },

        dismissShared: async function(id) {
            return await request('POST', '/share/' + encodeURIComponent(id) + '/dismiss');
        },

        // ===== Reminder APIs =====
        getReminders: async function(status) {
            var path = '/reminders';
            if (status) path += '?status=' + encodeURIComponent(status);
            return await request('GET', path);
        },

        createReminder: async function(data) {
            return await request('POST', '/reminders', data);
        },

        updateReminder: async function(id, data) {
            return await request('PUT', '/reminders/' + encodeURIComponent(id), data);
        },

        cancelReminder: async function(id) {
            return await request('DELETE', '/reminders/' + encodeURIComponent(id));
        },

        acknowledgeReminder: async function(id) {
            return await request('POST', '/reminders/' + encodeURIComponent(id) + '/acknowledge');
        },

        snoozeReminder: async function(id, minutes) {
            return await request('POST', '/reminders/' + encodeURIComponent(id) + '/snooze', { minutes: minutes || 5 });
        },

        getReminderPendingCount: async function() {
            return await request('GET', '/reminders/pending-count');
        },

        // ===== Notification APIs =====
        getUnreadNotifications: async function() {
            return await request('GET', '/notifications/unread');
        },

        markNotificationRead: async function(id) {
            return await request('POST', '/notifications/' + encodeURIComponent(id) + '/read');
        },

        markAllNotificationsRead: async function() {
            return await request('POST', '/notifications/read-all');
        },

        // ===== Push Subscription APIs =====
        getVapidPublicKey: async function() {
            return await request('GET', '/push/vapid-public-key');
        },

        subscribePush: async function(subscription) {
            return await request('POST', '/push/subscribe', subscription);
        },

        unsubscribePush: async function(endpoint) {
            return await request('DELETE', '/push/subscribe', { endpoint: endpoint });
        },

        // ===== Contacts APIs =====
        getContacts: async function() {
            return await request('GET', '/contacts');
        },

        createContact: async function(data) {
            return await request('POST', '/contacts', data);
        },

        updateContact: async function(id, data) {
            return await request('PUT', '/contacts/' + encodeURIComponent(id), data);
        },

        deleteContact: async function(id) {
            return await request('DELETE', '/contacts/' + encodeURIComponent(id));
        },

        // ===== Collaboration APIs =====
        setTodoCollaborator: async function(todoId, friendId) {
            return await request('POST', '/collaborate/todos/' + encodeURIComponent(todoId), { friend_id: friendId });
        },

        removeTodoCollaborator: async function(todoId) {
            return await request('DELETE', '/collaborate/todos/' + encodeURIComponent(todoId));
        },

        setRoutineCollaborator: async function(routineId, friendId) {
            return await request('POST', '/collaborate/routines/' + encodeURIComponent(routineId), { friend_id: friendId });
        },

        removeRoutineCollaborator: async function(routineId) {
            return await request('DELETE', '/collaborate/routines/' + encodeURIComponent(routineId));
        },

        // ===== Confirmation APIs =====
        getPendingConfirmations: async function() {
            return await request('GET', '/collaborate/confirmations/pending');
        },

        respondConfirmation: async function(id, response) {
            return await request('POST', '/collaborate/confirmations/' + encodeURIComponent(id) + '/respond', { response: response });
        },

        withdrawConfirmation: async function(id) {
            return await request('POST', '/collaborate/confirmations/' + encodeURIComponent(id) + '/withdraw');
        },

        // 环境检测 (always web now)
        isTauri: function() { return false; }
    };
})();
