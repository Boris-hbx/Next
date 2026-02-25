// ========== Life Hub Module ==========
var Life = (function() {
    var _currentFeature = null;

    function init() {
        // Restore last opened feature or show hub
        var last = localStorage.getItem('life_feature');
        if (last === 'expense') {
            openFeature('expense');
        } else if (last === 'trip') {
            openFeature('trip');
        } else if (last === 'health') {
            openFeature('health');
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
        var tripView = document.getElementById('trip-view');
        var tripFab = document.getElementById('trip-fab');
        var healthView = document.getElementById('health-view');
        if (hub) hub.style.display = '';
        if (expenseView) expenseView.style.display = 'none';
        if (expenseFab) expenseFab.style.display = 'none';
        if (tripView) tripView.style.display = 'none';
        if (tripFab) tripFab.style.display = 'none';
        if (healthView) healthView.style.display = 'none';
        if (typeof Health !== 'undefined') Health.dispose();
    }

    function openFeature(name) {
        // Hide everything first
        var hub = document.getElementById('life-hub');
        var expenseView = document.getElementById('expense-view');
        var expenseFab = document.getElementById('expense-fab');
        var tripView = document.getElementById('trip-view');
        var tripFab = document.getElementById('trip-fab');
        var healthView = document.getElementById('health-view');
        if (hub) hub.style.display = 'none';
        if (expenseView) expenseView.style.display = 'none';
        if (expenseFab) expenseFab.style.display = 'none';
        if (tripView) tripView.style.display = 'none';
        if (tripFab) tripFab.style.display = 'none';
        if (healthView) healthView.style.display = 'none';
        if (typeof Health !== 'undefined') Health.dispose();

        if (name === 'expense') {
            _currentFeature = 'expense';
            localStorage.setItem('life_feature', 'expense');
            if (expenseView) expenseView.style.display = '';
            if (expenseFab) expenseFab.style.display = '';
            if (typeof Expense !== 'undefined') Expense.init();
        } else if (name === 'trip') {
            _currentFeature = 'trip';
            localStorage.setItem('life_feature', 'trip');
            if (tripView) tripView.style.display = '';
            if (tripFab) tripFab.style.display = '';
            if (typeof Trip !== 'undefined') Trip.init();
        } else if (name === 'health') {
            _currentFeature = 'health';
            localStorage.setItem('life_feature', 'health');
            if (healthView) healthView.style.display = '';
            if (typeof Health !== 'undefined') Health.init();
        }
    }

    return {
        init: init,
        showHub: showHub,
        openFeature: openFeature,
    };
})();
