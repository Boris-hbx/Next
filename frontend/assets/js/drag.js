// ========== 拖拽处理 (鼠标 + 触屏统一) ==========

// HTML5 Drag-and-Drop handlers (used by ondragover/ondrop on quadrants)
function allowDrop(e) {
    e.preventDefault();
}

function dragLeave(e) {
    var quadrant = e.target.closest('.quadrant');
    if (quadrant) {
        quadrant.classList.remove('drag-over');
    }
}

function dropItem(e) {
    e.preventDefault();
    var quadrant = e.target.closest('.quadrant');
    if (quadrant) {
        quadrant.classList.remove('drag-over');
    }
    var itemId = e.dataTransfer.getData('text/plain');
    if (!itemId) return;
    var targetQuadrant = quadrant ? quadrant.dataset.quadrant : null;
    if (targetQuadrant) {
        moveToQuadrant(itemId, targetQuadrant);
    }
}

// Unified Drag Manager — handles both mouse and touch drag
var DragManager = (function() {
    var MOUSE_THRESHOLD = 5;
    var TOUCH_THRESHOLD = 10;
    var LONG_PRESS_MS = 300;

    var state = {
        isDragging: false,
        clone: null,
        itemId: null,
        itemEl: null,
        startX: 0,
        startY: 0,
        originalQuadrant: null,
        longPressTimer: null,
        inputType: null  // 'mouse' or 'touch'
    };

    // --- Shared core ---

    function beginDragVisual(x, y) {
        if (!state.itemEl) return;

        var quadrant = state.itemEl.closest('.quadrant');
        state.originalQuadrant = quadrant ? quadrant.dataset.quadrant : null;
        draggedItemQuadrant = state.originalQuadrant;

        state.clone = document.createElement('div');
        state.clone.className = 'drag-clone';
        state.clone.textContent = state.itemEl.querySelector('.task-text').textContent;
        state.clone.style.left = x + 'px';
        state.clone.style.top = y + 'px';
        document.body.appendChild(state.clone);

        state.itemEl.classList.add(state.inputType === 'touch' ? 'touch-dragging' : 'dragging');

        document.querySelectorAll('.matrix-tab').forEach(function(tab) {
            if (tab.dataset.tab !== currentTab) {
                tab.classList.add('drop-target');
            } else {
                tab.classList.add('drag-disabled');
            }
        });
        var routineBtn = document.querySelector('.btn-routine');
        if (routineBtn) routineBtn.classList.add('drag-disabled');
    }

    function updatePosition(x, y) {
        if (state.clone) {
            state.clone.style.left = x + 'px';
            state.clone.style.top = y + 'px';
        }
        highlightUnderCursor(x, y);
    }

    function highlightUnderCursor(x, y) {
        document.querySelectorAll('.quadrant.drag-over').forEach(function(q) {
            q.classList.remove('drag-over');
        });
        document.querySelectorAll('.matrix-tab.drag-over').forEach(function(tab) {
            tab.classList.remove('drag-over');
        });

        var elements = document.elementsFromPoint(x, y);
        for (var i = 0; i < elements.length; i++) {
            var tab = elements[i].closest('.matrix-tab');
            if (tab && tab.dataset.tab !== currentTab) {
                tab.classList.add('drag-over');
                return;
            }

            var quadrant = elements[i].closest('.quadrant');
            if (quadrant && quadrant.dataset.quadrant !== state.originalQuadrant) {
                quadrant.classList.add('drag-over');
                return;
            }
        }
    }

    function detectDropTarget(x, y) {
        var elements = document.elementsFromPoint(x, y);
        for (var i = 0; i < elements.length; i++) {
            var tab = elements[i].closest('.matrix-tab');
            if (tab && tab.dataset.tab !== currentTab) {
                return { tab: tab.dataset.tab, quadrant: null };
            }
            var q = elements[i].closest('.quadrant');
            if (q) {
                return { tab: null, quadrant: q.dataset.quadrant };
            }
        }
        return null;
    }

    function executeDrop(target) {
        if (!target || !state.itemId) return;
        if (target.tab) {
            moveToTabWithDefaultQuadrant(state.itemId, target.tab);
        } else if (target.quadrant) {
            moveToQuadrant(state.itemId, target.quadrant);
        }
    }

    function blockNextClick(e) {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener('click', blockNextClick, true);
    }

    function cleanup() {
        if (state.inputType === 'mouse') {
            document.addEventListener('click', blockNextClick, true);
            setTimeout(function() {
                document.removeEventListener('click', blockNextClick, true);
            }, 200);
        }

        if (state.clone) {
            state.clone.remove();
            state.clone = null;
        }

        draggedItemQuadrant = null;

        document.querySelectorAll('.task-item.dragging, .task-item.touch-dragging').forEach(function(item) {
            item.classList.remove('dragging');
            item.classList.remove('touch-dragging');
        });

        document.querySelectorAll('.quadrant.drag-over').forEach(function(q) {
            q.classList.remove('drag-over');
        });

        document.querySelectorAll('.matrix-tab.drop-target, .matrix-tab.drag-over, .matrix-tab.drag-disabled').forEach(function(tab) {
            tab.classList.remove('drop-target');
            tab.classList.remove('drag-over');
            tab.classList.remove('drag-disabled');
        });
        var routineBtn = document.querySelector('.btn-routine.drag-disabled');
        if (routineBtn) routineBtn.classList.remove('drag-disabled');

        if (state.longPressTimer) {
            clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
        }

        state.isDragging = false;
        state.itemId = null;
        state.itemEl = null;
        state.originalQuadrant = null;
        state.inputType = null;
    }

    // --- Mouse handlers ---

    function onMouseDown(e) {
        if (e.button !== 0) return;

        // Only initiate drag from drag handle, not from clicks on content
        if (!e.target.closest('.drag-handle')) return;

        var taskItem = e.target.closest('.task-item');
        if (!taskItem || taskItem.classList.contains('completed')) return;

        state.itemId = taskItem.dataset.id;
        state.itemEl = taskItem;
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.inputType = 'mouse';

        draggedItem = taskItem;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        e.preventDefault();
    }

    function onMouseMove(e) {
        var dx = e.clientX - state.startX;
        var dy = e.clientY - state.startY;

        if (!state.isDragging && (Math.abs(dx) > MOUSE_THRESHOLD || Math.abs(dy) > MOUSE_THRESHOLD)) {
            state.isDragging = true;
            beginDragVisual(e.clientX, e.clientY);
        }

        if (state.isDragging) {
            updatePosition(e.clientX, e.clientY);
        }
    }

    function onMouseUp(e) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (state.isDragging) {
            var target = detectDropTarget(e.clientX, e.clientY);
            executeDrop(target);
            cleanup();
        } else {
            state.isDragging = false;
            state.itemId = null;
            state.itemEl = null;
            state.inputType = null;
        }

        draggedItem = null;
    }

    // --- Touch handlers ---

    function onTouchStart(e) {
        var taskItem = e.target.closest('.task-item');
        if (!taskItem || taskItem.classList.contains('completed')) return;

        var touch = e.touches[0];
        state.itemId = taskItem.dataset.id;
        state.itemEl = taskItem;
        state.startX = touch.clientX;
        state.startY = touch.clientY;
        state.inputType = 'touch';
        state.isDragging = false;

        state.longPressTimer = setTimeout(function() {
            if (state.itemEl) {
                state.isDragging = true;
                beginDragVisual(touch.clientX, touch.clientY);
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, LONG_PRESS_MS);
    }

    function onTouchMove(e) {
        if (!state.itemEl || state.inputType !== 'touch') return;

        var touch = e.touches[0];
        var dx = touch.clientX - state.startX;
        var dy = touch.clientY - state.startY;

        if (!state.isDragging && (Math.abs(dx) > TOUCH_THRESHOLD || Math.abs(dy) > TOUCH_THRESHOLD)) {
            if (state.longPressTimer) {
                clearTimeout(state.longPressTimer);
                state.longPressTimer = null;
            }
        }

        if (state.isDragging) {
            e.preventDefault();
            updatePosition(touch.clientX, touch.clientY);
        }
    }

    function onTouchEnd(e) {
        if (state.longPressTimer) {
            clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
        }

        if (state.inputType !== 'touch') return;

        if (state.isDragging && state.itemEl) {
            var touch = e.changedTouches[0];
            var target = detectDropTarget(touch.clientX, touch.clientY);
            executeDrop(target);
        }

        cleanup();
    }

    // Document-level touch listeners (always active)
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return {
        initMouseDrag: onMouseDown,
        attachTouchHandlers: function() {
            document.querySelectorAll('.task-item:not(.completed)').forEach(function(item) {
                item.addEventListener('touchstart', onTouchStart, { passive: false });
            });
        }
    };
})();

// Backward-compatible global functions
function startCustomDrag(e) { DragManager.initMouseDrag(e); }
function attachTouchHandlers() { DragManager.attachTouchHandlers(); }
