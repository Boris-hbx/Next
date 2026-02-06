// ========== 触屏拖拽处理 ==========

var touchDragItem = null;
var touchDragClone = null;
var touchStartX = 0;
var touchStartY = 0;
var touchIsDragging = false;
var touchDragThreshold = 10;

function startTouchDrag(e) {
    var taskItem = e.target.closest('.task-item');
    if (!taskItem || taskItem.classList.contains('completed')) return;

    var touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchDragItem = taskItem;
    touchIsDragging = false;

    touchDragItem.longPressTimer = setTimeout(function() {
        if (touchDragItem) {
            touchIsDragging = true;
            startTouchDragVisual(touch);
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 300);
}

function startTouchDragVisual(touch) {
    var originalQuadrant = touchDragItem.closest('.quadrant');
    draggedItemQuadrant = originalQuadrant ? originalQuadrant.dataset.quadrant : null;

    touchDragClone = document.createElement('div');
    touchDragClone.className = 'drag-clone';
    touchDragClone.textContent = touchDragItem.querySelector('.task-text').textContent;
    touchDragClone.style.left = touch.clientX + 'px';
    touchDragClone.style.top = touch.clientY + 'px';
    document.body.appendChild(touchDragClone);

    touchDragItem.classList.add('touch-dragging');

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

function onTouchMove(e) {
    if (!touchDragItem) return;

    var touch = e.touches[0];
    var dx = touch.clientX - touchStartX;
    var dy = touch.clientY - touchStartY;

    if (!touchIsDragging && (Math.abs(dx) > touchDragThreshold || Math.abs(dy) > touchDragThreshold)) {
        clearTimeout(touchDragItem.longPressTimer);
    }

    if (touchIsDragging && touchDragClone) {
        e.preventDefault();
        touchDragClone.style.left = touch.clientX + 'px';
        touchDragClone.style.top = touch.clientY + 'px';
        highlightQuadrantUnderCursor(touch.clientX, touch.clientY);
    }
}

function onTouchEnd(e) {
    if (touchDragItem) {
        clearTimeout(touchDragItem.longPressTimer);
    }

    if (touchIsDragging && touchDragItem) {
        var touch = e.changedTouches[0];
        var elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        var targetQuadrant = null;
        var targetTab = null;
        var itemId = touchDragItem.dataset.id;

        for (var i = 0; i < elements.length; i++) {
            var tab = elements[i].closest('.matrix-tab');
            if (tab && tab.dataset.tab !== currentTab) {
                targetTab = tab.dataset.tab;
                break;
            }
            var q = elements[i].closest('.quadrant');
            if (q) {
                targetQuadrant = q.dataset.quadrant;
                break;
            }
        }

        if (targetTab) {
            moveToTabWithDefaultQuadrant(itemId, targetTab);
        } else if (targetQuadrant) {
            moveToQuadrant(itemId, targetQuadrant);
        }
    }

    if (touchDragClone) {
        touchDragClone.remove();
        touchDragClone = null;
    }
    if (touchDragItem) {
        touchDragItem.classList.remove('touch-dragging');
        touchDragItem = null;
    }
    touchIsDragging = false;
    endDrag();
}

function attachTouchHandlers() {
    document.querySelectorAll('.task-item:not(.completed)').forEach(function(item) {
        item.addEventListener('touchstart', startTouchDrag, { passive: false });
    });
}

document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', onTouchEnd);
