// ========== API 封装层 (Tauri IPC) ==========
var API = (function() {
    // 检测是否在 Tauri 环境
    var isTauri = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

    // Tauri invoke 封装
    async function invoke(cmd, args) {
        if (isTauri) {
            try {
                var result = await window.__TAURI__.core.invoke(cmd, args || {});
                return result;
            } catch (err) {
                console.error('[Tauri] error:', cmd, err);
                throw err;
            }
        }
        throw new Error('Not in Tauri environment');
    }

    return {
        // ===== Todo APIs =====
        getTodos: async function(tab) {
            return await invoke('get_todos', tab ? { tab: tab } : {});
        },

        getTodo: async function(id) {
            return await invoke('get_todo', { id: id });
        },

        createTodo: async function(data) {
            return await invoke('create_todo', { request: data });
        },

        updateTodo: async function(id, data) {
            return await invoke('update_todo', { id: id, request: data });
        },

        deleteTodo: async function(id) {
            return await invoke('delete_todo', { id: id });
        },

        restoreTodo: async function(id) {
            return await invoke('restore_todo', { id: id });
        },

        permanentDeleteTodo: async function(id) {
            return await invoke('permanent_delete_todo', { id: id });
        },

        batchUpdateTodos: async function(updates) {
            return await invoke('batch_update_todos', { updates: updates });
        },

        // ===== Routine APIs =====
        getRoutines: async function() {
            return await invoke('get_routines', {});
        },

        createRoutine: async function(text) {
            return await invoke('create_routine', { request: { text: text } });
        },

        toggleRoutine: async function(id) {
            return await invoke('toggle_routine', { id: id });
        },

        deleteRoutine: async function(id) {
            return await invoke('delete_routine', { id: id });
        },

        // ===== Review APIs =====
        getReviews: async function() {
            return await invoke('get_reviews', {});
        },

        createReview: async function(data) {
            return await invoke('create_review', { request: data });
        },

        updateReview: async function(id, data) {
            return await invoke('update_review', { id: id, request: data });
        },

        completeReview: async function(id) {
            return await invoke('complete_review', { id: id });
        },

        uncompleteReview: async function(id) {
            return await invoke('uncomplete_review', { id: id });
        },

        deleteReview: async function(id) {
            return await invoke('delete_review', { id: id });
        },

        // ===== Quote API =====
        getRandomQuote: async function() {
            return await invoke('get_random_quote', {});
        },

        // ===== Calendar APIs =====
        exportTaskIcs: async function(id) {
            return await invoke('export_task_ics', { id: id });
        },

        exportTabIcs: async function(tab) {
            return await invoke('export_tab_ics', { tab: tab });
        },

        // 环境检测
        isTauri: function() { return isTauri; }
    };
})();
