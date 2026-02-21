// ========== 阿宝对话组件 ==========
var Abao = (function() {
    var panel = null;
    var overlay = null;
    var messagesContainer = null;
    var inputEl = null;
    var sendBtn = null;
    var thinkingEl = null;
    var scrollBottomBtn = null;

    var conversationId = null;
    var isOpen = false;
    var isSending = false;
    var autoScroll = true;
    var thinkingTimer = null;

    // ─── Init ───
    function init() {
        panel = document.getElementById('abao-panel');
        overlay = document.getElementById('abao-overlay');
        messagesContainer = document.getElementById('abao-messages');
        inputEl = document.getElementById('abao-input');
        sendBtn = document.getElementById('abao-send');
        scrollBottomBtn = document.getElementById('abao-scroll-bottom');

        if (!panel) return;

        // Send button
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }

        // Enter to send, Shift+Enter for newline
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            // Auto-resize textarea
            inputEl.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
        }

        // Close button
        var closeBtn = document.getElementById('abao-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }

        // Overlay click to close
        if (overlay) {
            overlay.addEventListener('click', close);
        }

        // Scroll detection for auto-scroll
        if (messagesContainer) {
            messagesContainer.addEventListener('scroll', function() {
                var el = messagesContainer;
                var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
                autoScroll = atBottom;
                if (scrollBottomBtn) {
                    scrollBottomBtn.style.display = atBottom ? 'none' : 'block';
                }
            });
        }

        // Scroll-to-bottom button
        if (scrollBottomBtn) {
            scrollBottomBtn.addEventListener('click', function() {
                scrollToBottom();
                autoScroll = true;
                scrollBottomBtn.style.display = 'none';
            });
        }

        // Shortcut buttons
        var shortcuts = document.querySelectorAll('.abao-shortcut-btn');
        shortcuts.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var text = btn.getAttribute('data-text');
                if (text && inputEl) {
                    inputEl.value = text;
                    sendMessage();
                }
            });
        });

        // New chat button
        var newChatBtn = document.getElementById('abao-new-chat');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', function() {
                conversationId = null;
                clearMessages();
                addSystemMessage('新对话已开始');
            });
        }

        // Keyboard shortcut: B to toggle
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'b' || e.key === 'B') {
                toggle();
            }
        });

        // Long-press on avatar → open About dialog
        var avatar = document.getElementById('header-avatar');
        if (avatar) {
            var longPressTimer = null;
            var longPressed = false;
            avatar.addEventListener('mousedown', function() {
                longPressed = false;
                longPressTimer = setTimeout(function() {
                    longPressed = true;
                    if (typeof openAbout === 'function') openAbout();
                }, 600);
            });
            avatar.addEventListener('mouseup', function() { clearTimeout(longPressTimer); });
            avatar.addEventListener('mouseleave', function() { clearTimeout(longPressTimer); });
            avatar.addEventListener('touchstart', function(e) {
                longPressed = false;
                longPressTimer = setTimeout(function() {
                    longPressed = true;
                    if (typeof openAbout === 'function') openAbout();
                }, 600);
            }, { passive: true });
            avatar.addEventListener('touchend', function() { clearTimeout(longPressTimer); });
            // Override click: only toggle if not long-pressed
            avatar.onclick = function(e) {
                if (longPressed) { longPressed = false; return; }
                toggle();
            };
        }

        // Mobile: drag-to-close gesture on drag bar and header
        if (window.matchMedia('(max-width: 768px)').matches) {
            var dragBar = panel.querySelector('.abao-drag-bar');
            var header = panel.querySelector('.abao-header');
            var touchStartY = 0;
            var touchDeltaY = 0;
            var dragging = false;

            function onTouchStart(e) {
                touchStartY = e.touches[0].clientY;
                touchDeltaY = 0;
                dragging = true;
                panel.style.transition = 'none';
            }

            function onTouchMove(e) {
                if (!dragging) return;
                touchDeltaY = e.touches[0].clientY - touchStartY;
                if (touchDeltaY > 0) {
                    panel.style.transform = 'translateY(' + touchDeltaY + 'px)';
                }
            }

            function onTouchEnd() {
                if (!dragging) return;
                dragging = false;
                panel.style.transition = '';
                if (touchDeltaY > 80) {
                    close();
                } else {
                    panel.style.transform = '';
                }
            }

            if (dragBar) {
                dragBar.addEventListener('touchstart', onTouchStart, { passive: true });
                dragBar.addEventListener('touchmove', onTouchMove, { passive: true });
                dragBar.addEventListener('touchend', onTouchEnd);
            }
            if (header) {
                header.addEventListener('touchstart', onTouchStart, { passive: true });
                header.addEventListener('touchmove', onTouchMove, { passive: true });
                header.addEventListener('touchend', onTouchEnd);
            }
        }

        // Virtual keyboard adaptation
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                if (isOpen && panel) {
                    var keyboardHeight = window.innerHeight - window.visualViewport.height;
                    if (keyboardHeight > 100) {
                        panel.style.height = window.visualViewport.height * 0.8 + 'px';
                    } else {
                        panel.style.height = '';
                    }
                }
            });
        }
    }

    // ─── Open/Close ───
    function open() {
        if (!panel) return;
        isOpen = true;
        panel.classList.add('open');
        if (overlay) overlay.classList.add('open');
        document.getElementById('header-avatar')?.classList.add('abao-active');
        if (inputEl) inputEl.focus();

        // Load conversation history if none loaded
        if (messagesContainer && messagesContainer.children.length === 0) {
            addSystemMessage('有什么事？说吧。');
        }
    }

    function close() {
        if (!panel) return;
        isOpen = false;
        panel.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.getElementById('header-avatar')?.classList.remove('abao-active');
        // Reset panel height (may have been changed by keyboard)
        panel.style.height = '';
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    // ─── Messages ───
    function addMessage(role, text) {
        if (!messagesContainer) return;
        var msg = document.createElement('div');
        msg.className = 'abao-msg ' + role;
        msg.textContent = text;
        messagesContainer.appendChild(msg);
        if (autoScroll) scrollToBottom();
    }

    function addSystemMessage(text) {
        if (!messagesContainer) return;
        var msg = document.createElement('div');
        msg.className = 'abao-msg assistant';
        msg.style.opacity = '0.7';
        msg.style.fontSize = '13px';
        msg.textContent = text;
        messagesContainer.appendChild(msg);
        if (autoScroll) scrollToBottom();
    }

    function addToolInfo(toolCalls) {
        if (!messagesContainer || !toolCalls || toolCalls.length === 0) return;
        for (var i = 0; i < toolCalls.length; i++) {
            var tc = toolCalls[i];
            if (!tc.result || !tc.result.success) continue;
            // Show task card for create_todo
            if (tc.tool === 'create_todo' && tc.result.text) {
                var card = document.createElement('div');
                card.className = 'abao-task-card';
                card.innerHTML = '<div class="abao-task-card-title">' + escapeHtml(tc.result.text) + '</div>' +
                    '<div class="abao-task-card-meta">' +
                    (tc.result.tab || 'today') + ' · ' + quadrantLabel(tc.result.quadrant || '') +
                    '</div>';
                messagesContainer.appendChild(card);
            }
        }
    }

    function clearMessages() {
        if (messagesContainer) messagesContainer.innerHTML = '';
    }

    function showThinking() {
        if (!messagesContainer) return;
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'abao-thinking';
        thinkingEl.innerHTML = '<div class="abao-thinking-dot"></div>' +
            '<div class="abao-thinking-dot"></div>' +
            '<div class="abao-thinking-dot"></div>' +
            '<span class="abao-thinking-text"></span>';
        messagesContainer.appendChild(thinkingEl);
        if (autoScroll) scrollToBottom();

        // Progressive thinking text
        var textEl = thinkingEl.querySelector('.abao-thinking-text');
        thinkingTimer = setTimeout(function() {
            if (textEl) {
                textEl.style.display = 'inline';
                textEl.textContent = '阿宝正在想...';
            }
        }, 3000);

        setTimeout(function() {
            if (textEl && textEl.style.display === 'inline') {
                textEl.textContent = '这个问题有点复杂，再等等...';
            }
        }, 8000);
    }

    function hideThinking() {
        if (thinkingEl && thinkingEl.parentNode) {
            thinkingEl.parentNode.removeChild(thinkingEl);
        }
        thinkingEl = null;
        if (thinkingTimer) {
            clearTimeout(thinkingTimer);
            thinkingTimer = null;
        }
    }

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // ─── Send message ───
    async function sendMessage() {
        if (!inputEl || isSending) return;
        var text = inputEl.value.trim();
        if (!text) return;

        // Clear input
        inputEl.value = '';
        inputEl.style.height = 'auto';

        // Add user message
        addMessage('user', text);

        // Disable input
        isSending = true;
        if (sendBtn) sendBtn.disabled = true;
        showThinking();

        try {
            var resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    message: text,
                    conversation_id: conversationId || undefined
                })
            });

            if (resp.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            var data = await resp.json();
            hideThinking();

            if (data.conversation_id) {
                conversationId = data.conversation_id;
            }

            if (data.success && data.reply) {
                addMessage('assistant', data.reply);
                // Show tool call results (task cards etc.)
                if (data.tool_calls) {
                    addToolInfo(data.tool_calls);
                    // Refresh task list if tools modified data
                    refreshTasksIfNeeded(data.tool_calls);
                }
            } else if (data.message) {
                addMessage('error', data.message);
            } else {
                addMessage('error', '阿宝想了太久，请重试一下');
            }
        } catch (err) {
            hideThinking();
            addMessage('error', '网络错误，请检查连接');
            console.error('[Abao] send error:', err);
        } finally {
            isSending = false;
            if (sendBtn) sendBtn.disabled = false;
            if (inputEl) inputEl.focus();
        }
    }

    // ─── Refresh tasks if tool calls modified data ───
    function refreshTasksIfNeeded(toolCalls) {
        if (!toolCalls) return;
        var modifyingTools = ['create_todo', 'update_todo', 'delete_todo', 'restore_todo', 'batch_update_todos'];
        for (var i = 0; i < toolCalls.length; i++) {
            if (modifyingTools.indexOf(toolCalls[i].tool) >= 0) {
                // Trigger task list refresh if the function exists
                if (typeof window.loadTodos === 'function') {
                    window.loadTodos();
                } else if (typeof window.refreshTasks === 'function') {
                    window.refreshTasks();
                }
                break;
            }
        }
    }

    // ─── Load conversation history ───
    async function loadConversation(convId) {
        try {
            var resp = await fetch('/api/conversations/' + encodeURIComponent(convId) + '/messages', {
                credentials: 'same-origin'
            });
            var data = await resp.json();
            if (data.success && data.items) {
                clearMessages();
                conversationId = convId;
                for (var i = 0; i < data.items.length; i++) {
                    var msg = data.items[i];
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        addMessage(msg.role, msg.content_text || '');
                    }
                }
            }
        } catch (err) {
            console.error('[Abao] load conversation error:', err);
        }
    }

    // ─── Helpers ───
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function quadrantLabel(q) {
        var labels = {
            'important-urgent': '优先处理',
            'important-not-urgent': '翻牌子',
            'not-important-urgent': '短平快',
            'not-important-not-urgent': '待分类'
        };
        return labels[q] || q;
    }

    // ─── Public API ───
    return {
        init: init,
        open: open,
        close: close,
        toggle: toggle,
        loadConversation: loadConversation,
        isOpen: function() { return isOpen; }
    };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    Abao.init();
});
