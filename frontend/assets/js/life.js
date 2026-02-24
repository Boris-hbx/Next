// ========== Life Hub Module ==========
var Life = (function() {
    var _currentFeature = null;

    function init() {
        // Restore last opened feature or show hub
        var last = localStorage.getItem('life_feature');
        if (last === 'expense') {
            openFeature('expense');
        } else {
            showHub();
        }
    }

    function showHub() {
        _currentFeature = null;
        localStorage.removeItem('life_feature');
        var hub = document.getElementById('life-hub');
        var expenseView = document.getElementById('expense-view');
        var expenseFab = document.getElementById('expense-fab');
        if (hub) hub.style.display = '';
        if (expenseView) expenseView.style.display = 'none';
        if (expenseFab) expenseFab.style.display = 'none';
    }

    function openFeature(name) {
        if (name === 'expense') {
            _currentFeature = 'expense';
            localStorage.setItem('life_feature', 'expense');
            var hub = document.getElementById('life-hub');
            var expenseView = document.getElementById('expense-view');
            var expenseFab = document.getElementById('expense-fab');
            if (hub) hub.style.display = 'none';
            if (expenseView) expenseView.style.display = '';
            if (expenseFab) expenseFab.style.display = '';
            if (typeof Expense !== 'undefined') Expense.init();
        }
    }

    return {
        init: init,
        showHub: showHub,
        openFeature: openFeature,
    };
})();
