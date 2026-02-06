// ========== 通用工具函数 ==========

// HTML 转义（基础版，用于任务名等单行文本）
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
}

// 日期格式化: MM-DD HH:mm
function formatDate(isoString) {
    if (!isoString) return '-';
    var date = new Date(isoString);
    var m = (date.getMonth() + 1).toString().padStart(2, '0');
    var d = date.getDate().toString().padStart(2, '0');
    var h = date.getHours().toString().padStart(2, '0');
    var min = date.getMinutes().toString().padStart(2, '0');
    return m + '-' + d + ' ' + h + ':' + min;
}

// 完整日期时间格式化: [YYYY-]MM-DD HH:mm (同年省略年份)
function formatDateTime(isoString) {
    if (!isoString) return '--';
    var date = new Date(isoString);
    var now = new Date();
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    if (y === now.getFullYear()) {
        return m + '-' + d + ' ' + h + ':' + min;
    }
    return y + '-' + m + '-' + d + ' ' + h + ':' + min;
}

// 短时间格式化: MM-DD HH:mm
function formatShortTime(isoString) {
    if (!isoString) return '--';
    var date = new Date(isoString);
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    return m + '-' + d + ' ' + h + ':' + min;
}

// 象限名称映射
function getQuadrantName(q) {
    var names = {
        'important-urgent': '优先处理',
        'important-not-urgent': '就等你翻牌子了',
        'not-important-urgent': '待分类',
        'not-important-not-urgent': '短平快'
    };
    return names[q] || q;
}

// 象限名称映射（带emoji，用于弹窗）
function getQuadrantNameEmoji(q) {
    var names = {
        'important-urgent': '🔥 优先处理',
        'important-not-urgent': '🎯 就等你翻牌子了',
        'not-important-urgent': '📥 待分类',
        'not-important-not-urgent': '⚡ 短平快'
    };
    return names[q] || q;
}

// Tab 名称映射
function getTabName(tab) {
    var names = { today: 'Today', week: 'This Week', month: 'Next 30 Days' };
    return names[tab] || tab;
}

// 全局鼠标位置跟踪（用于 toast 在鼠标附近显示）
window._mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
document.addEventListener('mousemove', function(e) {
    window._mousePos = { x: e.clientX, y: e.clientY };
});
document.addEventListener('click', function(e) {
    window._mousePos = { x: e.clientX, y: e.clientY };
});

// AppUtils - 共享工具集
window.AppUtils = {
    formatDate: function(isoString) {
        var date = new Date(isoString);
        var y = date.getFullYear();
        var m = (date.getMonth() + 1).toString().padStart(2, '0');
        var d = date.getDate().toString().padStart(2, '0');
        var h = date.getHours().toString().padStart(2, '0');
        var min = date.getMinutes().toString().padStart(2, '0');
        return y + '-' + m + '-' + d + ' ' + h + ':' + min;
    },
    escapeHtml: function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/\n/g, '<br>');
    },
    showToast: function(message, type) {
        type = type || 'success';
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type + ' toast-at-mouse';
        toast.textContent = message;
        document.body.appendChild(toast);

        var mouseX = window._mousePos.x;
        var mouseY = window._mousePos.y;
        var offsetX = 15;
        var offsetY = -40;

        var rect = toast.getBoundingClientRect();
        var posX = mouseX + offsetX;
        var posY = mouseY + offsetY;

        if (posX + rect.width > window.innerWidth - 10) {
            posX = mouseX - rect.width - offsetX;
        }
        if (posY < 10) {
            posY = mouseY + 20;
        }
        if (posY + rect.height > window.innerHeight - 10) {
            posY = window.innerHeight - rect.height - 10;
        }

        toast.style.left = posX + 'px';
        toast.style.top = posY + 'px';

        setTimeout(function() {
            toast.classList.add('toast-hide');
            setTimeout(function() { toast.remove(); }, 300);
        }, 2000);
    },

    showConfirm: function(message, onConfirm, options) {
        options = options || {};
        var confirmText = options.confirmText || '确定';
        var cancelText = options.cancelText || '取消';
        var danger = options.danger || false;

        var overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = '<div class="confirm-dialog">' +
            '<div class="confirm-body">' + message + '</div>' +
            '<div class="confirm-actions">' +
                '<button class="confirm-btn cancel-btn">' + cancelText + '</button>' +
                '<button class="confirm-btn ok-btn' + (danger ? ' danger' : '') + '">' + confirmText + '</button>' +
            '</div>' +
        '</div>';

        document.body.appendChild(overlay);

        var closeDialog = function(confirmed) {
            overlay.classList.add('confirm-hide');
            setTimeout(function() {
                overlay.remove();
                if (confirmed && onConfirm) {
                    onConfirm();
                }
            }, 200);
        };

        overlay.querySelector('.cancel-btn').onclick = function() { closeDialog(false); };
        overlay.querySelector('.ok-btn').onclick = function() { closeDialog(true); };

        overlay.onclick = function(e) {
            if (e.target === overlay) { closeDialog(false); }
        };

        var escHandler = function(e) {
            if (e.key === 'Escape') {
                closeDialog(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        overlay.querySelector('.ok-btn').focus();
    }
};

// showToast 快捷函数
function showToast(message, type) {
    AppUtils.showToast(message, type);
}
