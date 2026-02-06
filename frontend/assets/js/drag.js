// ========== 鼠标拖拽处理 ==========

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

var isDragging = false;
var dragClone = null;
var dragItemId = null;
var dragStartX = 0;
var dragStartY = 0;
var dragThreshold = 5;

function startCustomDrag(e) {
    if (e.button !== 0) return;

    var taskItem = e.target.closest('.task-item');
    if (!taskItem || taskItem.classList.contains('completed')) return;

    dragItemId = taskItem.dataset.id;
    draggedItem = taskItem;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault();
}

function onMouseMove(e) {
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;

    if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
        isDragging = true;
        startDragVisual(e);
    }

    if (isDragging && dragClone) {
        dragClone.style.left = e.clientX + 'px';
        dragClone.style.top = e.clientY + 'px';
        highlightQuadrantUnderCursor(e.clientX, e.clientY);
    }
}

function startDragVisual(e) {
    if (!draggedItem) return;

    var originalQuadrant = draggedItem.closest('.quadrant');
    draggedItemQuadrant = originalQuadrant ? originalQuadrant.dataset.quadrant : null;

    dragClone = document.createElement('div');
    dragClone.className = 'drag-clone';
    dragClone.textContent = draggedItem.querySelector('.task-text').textContent;
    dragClone.style.left = e.clientX + 'px';
    dragClone.style.top = e.clientY + 'px';
    document.body.appendChild(dragClone);

    draggedItem.classList.add('dragging');

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

function highlightQuadrantUnderCursor(x, y) {
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
            break;
        }

        var quadrant = elements[i].closest('.quadrant');
        if (quadrant && quadrant.dataset.quadrant !== draggedItemQuadrant) {
            quadrant.classList.add('drag-over');
            break;
        }
    }
}

function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (isDragging) {
        var elements = document.elementsFromPoint(e.clientX, e.clientY);
        var targetQuadrant = null;
        var targetTab = null;

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
            moveToTabWithDefaultQuadrant(dragItemId, targetTab);
        } else if (targetQuadrant) {
            moveToQuadrant(dragItemId, targetQuadrant);
        }

        endDrag();
    }

    isDragging = false;
    dragItemId = null;
    draggedItem = null;
}

function blockNextClick(e) {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener('click', blockNextClick, true);
}

function endDrag() {
    document.addEventListener('click', blockNextClick, true);
    setTimeout(function() {
        document.removeEventListener('click', blockNextClick, true);
    }, 200);

    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }

    draggedItemQuadrant = null;

    document.querySelectorAll('.task-item.dragging').forEach(function(item) {
        item.classList.remove('dragging');
    });

    document.querySelectorAll('.quadrant.drag-over').forEach(function(q) {
        q.classList.remove('drag-over');
    });

    document.querySelectorAll('.matrix-tab.drop-target').forEach(function(tab) {
        tab.classList.remove('drop-target');
    });
    document.querySelectorAll('.matrix-tab.drag-over').forEach(function(tab) {
        tab.classList.remove('drag-over');
    });
    document.querySelectorAll('.matrix-tab.drag-disabled').forEach(function(tab) {
        tab.classList.remove('drag-disabled');
    });
    var routineBtn = document.querySelector('.btn-routine.drag-disabled');
    if (routineBtn) routineBtn.classList.remove('drag-disabled');
}
