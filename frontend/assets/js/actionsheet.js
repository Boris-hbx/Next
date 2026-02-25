// ========== 长按操作菜单 (IIFE) ==========
// SPEC-047: 长按弹出 Action Sheet / Context Menu
var ActionSheet = (function() {
    var _overlay, _sheet;
    var _visible = false;
    var LONG_PRESS_MS = 500;
    var MOVE_THRESHOLD = 10;

    // ─── Show / Hide ───

    function show(items, options) {
        // items: [{ icon, label, action, danger? }]
        // options: { x, y } for desktop context menu positioning
        if (!_overlay || !_sheet) _initDOM();
        if (!_overlay || !_sheet) return;

        var isMobile = window.innerWidth <= 768;
        var html = '';

        items.forEach(function(item) {
            var cls = 'action-sheet-item' + (item.danger ? ' danger' : '');
            html += '<div class="' + cls + '" data-action="1">' +
                '<span class="action-sheet-icon">' + (item.icon || '') + '</span>' +
                '<span class="action-sheet-label">' + item.label + '</span>' +
            '</div>';
        });

        if (isMobile) {
            html += '<div class="action-sheet-cancel" data-action="cancel">取消</div>';
        }

        _sheet.innerHTML = html;

        // Bind click handlers
        var actionEls = _sheet.querySelectorAll('[data-action]');
        for (var i = 0; i < actionEls.length; i++) {
            (function(idx) {
                actionEls[idx].onclick = function(e) {
                    e.stopPropagation();
                    hide();
                    if (items[idx] && items[idx].action) {
                        items[idx].action();
                    }
                };
            })(i);
        }

        // Position
        if (isMobile) {
            _sheet.style.left = '';
            _sheet.style.right = '';
            _sheet.style.top = '';
            _sheet.style.bottom = '0';
            _sheet.style.width = '';
            _sheet.classList.remove('desktop-mode');
        } else {
            _sheet.classList.add('desktop-mode');
            var x = (options && options.x) || 0;
            var y = (options && options.y) || 0;
            // Ensure menu stays within viewport
            _sheet.style.left = x + 'px';
            _sheet.style.top = y + 'px';
            _sheet.style.bottom = 'auto';
            _sheet.style.width = '180px';
            // Adjust after render
            requestAnimationFrame(function() {
                var rect = _sheet.getBoundingClientRect();
                if (rect.right > window.innerWidth - 8) {
                    _sheet.style.left = Math.max(8, x - rect.width) + 'px';
                }
                if (rect.bottom > window.innerHeight - 8) {
                    _sheet.style.top = Math.max(8, y - rect.height) + 'px';
                }
            });
        }

        _overlay.style.display = '';
        // Trigger animation on next frame
        requestAnimationFrame(function() {
            _sheet.classList.add('visible');
        });
        _visible = true;
    }

    function hide() {
        if (!_visible) return;
        _visible = false;
        if (_sheet) _sheet.classList.remove('visible');
        // Wait for animation to finish
        setTimeout(function() {
            if (!_visible && _overlay) {
                _overlay.style.display = 'none';
            }
        }, 250);
    }

    // ─── DOM Init ───

    function _initDOM() {
        _overlay = document.getElementById('action-sheet-overlay');
        _sheet = document.getElementById('action-sheet');
        if (_overlay) {
            _overlay.addEventListener('click', function(e) {
                if (e.target === _overlay) hide();
            });
        }
    }

    // ─── Long Press Binding ───

    function bindLongPress(element, getItems) {
        // getItems: function() => [{ icon, label, action, danger? }]
        // Returns cleanup function
        var timer = null;
        var startX, startY;
        var pressed = false;

        function onTouchStart(e) {
            if (e.touches.length > 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            pressed = true;

            // Visual feedback
            element.style.transition = 'transform 0.2s ease, background 0.2s ease';
            element.style.transform = 'scale(0.98)';

            timer = setTimeout(function() {
                if (!pressed) return;
                pressed = false;
                // Haptic feedback
                if (navigator.vibrate) navigator.vibrate(40);
                // Reset visual
                _resetStyle(element);
                // Show action sheet
                var items = getItems();
                if (items && items.length > 0) {
                    show(items);
                }
            }, LONG_PRESS_MS);
        }

        function onTouchMove(e) {
            if (!pressed) return;
            var dx = e.touches[0].clientX - startX;
            var dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
                _cancelPress(element);
            }
        }

        function onTouchEnd() {
            _cancelPress(element);
        }

        function onContextMenu(e) {
            // Desktop: right-click
            if (window.innerWidth <= 768) return; // mobile uses long-press
            e.preventDefault();
            e.stopPropagation();
            var items = getItems();
            if (items && items.length > 0) {
                show(items, { x: e.clientX, y: e.clientY });
            }
        }

        function _cancelPress(el) {
            if (timer) { clearTimeout(timer); timer = null; }
            pressed = false;
            _resetStyle(el);
        }

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: true });
        element.addEventListener('touchend', onTouchEnd);
        element.addEventListener('touchcancel', onTouchEnd);
        element.addEventListener('contextmenu', onContextMenu);

        // Return cleanup function
        return function() {
            element.removeEventListener('touchstart', onTouchStart);
            element.removeEventListener('touchmove', onTouchMove);
            element.removeEventListener('touchend', onTouchEnd);
            element.removeEventListener('touchcancel', onTouchEnd);
            element.removeEventListener('contextmenu', onContextMenu);
        };
    }

    function _resetStyle(el) {
        el.style.transform = '';
        el.style.transition = '';
    }

    // ─── Convenience: bind all matching elements ───

    function bindAll(containerOrSelector, itemSelector, getItemsForEl) {
        // getItemsForEl: function(element) => [{ icon, label, action, danger? }]
        var container = typeof containerOrSelector === 'string'
            ? document.querySelector(containerOrSelector)
            : containerOrSelector;
        if (!container) return;

        var items = container.querySelectorAll(itemSelector);
        for (var i = 0; i < items.length; i++) {
            (function(el) {
                // Skip if already bound
                if (el._actionSheetBound) return;
                el._actionSheetBound = true;
                bindLongPress(el, function() {
                    return getItemsForEl(el);
                });
            })(items[i]);
        }
    }

    return {
        show: show,
        hide: hide,
        bindLongPress: bindLongPress,
        bindAll: bindAll
    };
})();
