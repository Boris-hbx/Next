// ========== Health Module ==========
var Health = (function() {
    'use strict';

    var _view = 'hub'; // 'hub' | 'category'
    var _category = null; // 'baduanjin' | 'yijinjing' | 'zhanzhuang' | 'meridian'
    var _renderer = null;
    var _interpolator = null;
    var _poseAnimFrame = null;
    var _selectedExercise = null;
    var _viewSide = 'front';
    var _poseT = 0;
    var _poseDirection = 1;
    var _selectedMeridianId = null;

    var D = HealthData;

    var CATEGORY_CONFIG = {
        baduanjin:  { title: '八段锦',  data: function() { return D.BADUANJIN; } },
        yijinjing:  { title: '易筋经',  data: function() { return D.YIJINJING; } },
        zhanzhuang: { title: '站桩',    data: function() { return D.ZHANZHUANG; } },
        meridian:   { title: '经络图',  data: function() { return D.MERIDIANS; } }
    };

    function _getCategoryData() {
        var cfg = CATEGORY_CONFIG[_category];
        return cfg ? cfg.data() : [];
    }

    function init() {
        var lastCat = localStorage.getItem('health_category');
        if (lastCat && CATEGORY_CONFIG[lastCat]) {
            openCategory(lastCat);
        } else {
            showHub();
        }
    }

    function dispose() {
        stopPoseAnimation();
        if (_renderer) { _renderer.dispose(); _renderer = null; }
        _interpolator = null;
        _selectedExercise = null;
        _selectedMeridianId = null;
    }

    function showHub() {
        _view = 'hub';
        localStorage.removeItem('health_category');
        var hub = document.getElementById('health-hub');
        var cat = document.getElementById('health-category');
        if (hub) hub.style.display = '';
        if (cat) cat.style.display = 'none';
        dispose();
    }

    function openCategory(name) {
        if (!CATEGORY_CONFIG[name]) return;
        _view = 'category';
        _category = name;
        localStorage.setItem('health_category', name);

        var hub = document.getElementById('health-hub');
        var cat = document.getElementById('health-category');
        if (hub) hub.style.display = 'none';
        if (cat) cat.style.display = '';

        // Set dynamic title
        var titleEl = document.getElementById('health-category-title');
        if (titleEl) titleEl.textContent = CATEGORY_CONFIG[name].title;

        // Show/hide elements based on mode
        var actionCards = document.getElementById('health-action-cards');
        var canvasWrap = document.querySelector('.health-canvas-wrap');
        var sideToggle = document.querySelector('.health-side-toggle');
        var videoWrap = document.getElementById('health-video-wrap');
        var detail = document.getElementById('health-detail');
        var meridianList = document.getElementById('health-meridian-list');

        if (name === 'meridian') {
            // Meridian browsing mode
            if (actionCards) actionCards.style.display = 'none';
            if (videoWrap) videoWrap.style.display = 'none';
            if (meridianList) meridianList.style.display = '';
            if (canvasWrap) canvasWrap.style.display = '';
            if (sideToggle) sideToggle.style.display = '';
            if (detail) detail.style.display = '';

            initCanvas();
            renderMeridianList();
            // Show all meridians by default
            if (_renderer) {
                _renderer.setActiveMeridians(D.MERIDIANS);
                _renderer.setPrimaryMeridianIds(D.MERIDIANS.map(function(m) { return m.id; }));
                _renderer.setActionPose(null);
            }
            // Select first meridian
            selectMeridian(D.MERIDIANS[0].id);
        } else {
            // Exercise mode (baduanjin, yijinjing, zhanzhuang)
            if (actionCards) actionCards.style.display = '';
            if (meridianList) meridianList.style.display = 'none';
            if (canvasWrap) canvasWrap.style.display = '';
            if (sideToggle) sideToggle.style.display = '';
            if (detail) detail.style.display = '';

            renderActionCards();
            initCanvas();
            var data = _getCategoryData();
            if (data.length > 0) selectExercise(data[0].id);
        }
    }

    function backToHub() {
        showHub();
    }

    // =========================================================================
    // Action Cards
    // =========================================================================
    function renderActionCards() {
        var container = document.getElementById('health-action-cards');
        if (!container) return;
        var data = _getCategoryData();
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var ex = data[i];
            var label = _getCardLabel(i, data.length);
            var shortName = ex.name.length > 4 ? ex.name.substring(0, 4) : ex.name;
            html += '<div class="health-action-card" data-id="' + ex.id + '" onclick="Health.selectExercise(\'' + ex.id + '\')">';
            html += '<div class="health-action-card-num">' + label + '</div>';
            html += '<div class="health-action-card-name">' + shortName + '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
    }

    function _getCardLabel(index, total) {
        if (_category === 'baduanjin') {
            if (index === 0) return '预备';
            if (index === total - 1) return '收势';
            return '第' + index + '式';
        } else if (_category === 'yijinjing') {
            return '第' + (index + 1) + '式';
        } else if (_category === 'zhanzhuang') {
            if (index === 0) return '基准';
            return '第' + index + '式';
        }
        return '第' + (index + 1) + '式';
    }

    function updateActiveCard(id) {
        var cards = document.querySelectorAll('.health-action-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('active', cards[i].getAttribute('data-id') === id);
        }
        var active = document.querySelector('.health-action-card.active');
        if (active) active.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    }

    // =========================================================================
    // Meridian List (for meridian browsing mode)
    // =========================================================================
    function renderMeridianList() {
        var container = document.getElementById('health-meridian-list');
        if (!container) return;
        var html = '';
        for (var i = 0; i < D.MERIDIANS.length; i++) {
            var m = D.MERIDIANS[i];
            html += '<div class="health-meridian-item" data-id="' + m.id + '" onclick="Health.selectMeridian(\'' + m.id + '\')">';
            html += '<span class="health-meridian-item-dot" style="background:' + m.color + '"></span>';
            html += '<span class="health-meridian-item-name">' + m.shortName + '</span>';
            html += '<span class="health-meridian-item-organ">' + m.organ + '</span>';
            html += '</div>';
        }
        container.innerHTML = html;
    }

    function selectMeridian(id) {
        _selectedMeridianId = id;
        var m = D.getMeridianById(id);
        if (!m) return;

        // Update active state in list
        var items = document.querySelectorAll('.health-meridian-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('active', items[i].getAttribute('data-id') === id);
        }
        var activeItem = document.querySelector('.health-meridian-item.active');
        if (activeItem) activeItem.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});

        // Highlight selected meridian on canvas
        if (_renderer) {
            _renderer.setActiveMeridians([m]);
            _renderer.setPrimaryMeridianIds([m.id]);
            _renderer.setHighlightAcupoint(null);
        }

        // Render meridian detail
        renderMeridianDetail(m);
    }

    function renderMeridianDetail(m) {
        var container = document.getElementById('health-detail');
        if (!container) return;

        var html = '<h3 class="health-detail-title">' + m.name + '</h3>';
        html += '<p class="health-detail-desc">' + m.description + '</p>';

        // Properties
        html += '<div class="health-detail-section">';
        html += '<div class="health-detail-section-title">基本属性</div>';
        html += '<div class="health-meridian-tags">';
        html += '<span class="health-meridian-tag"><span class="health-meridian-tag-dot" style="background:' + m.color + '"></span>' + m.englishName + '</span>';
        var elementMap = {metal:'金',wood:'木',water:'水',fire:'火',earth:'土',ministerial_fire:'相火'};
        var elLabel = elementMap[m.element] || m.element;
        html += '<span class="health-meridian-tag">' + m.yinYang + ' · ' + elLabel + '</span>';
        html += '<span class="health-meridian-tag">脏腑: ' + m.organ + '</span>';
        html += '</div></div>';

        // Acupoints
        if (m.acupoints && m.acupoints.length > 0) {
            html += '<div class="health-detail-section">';
            html += '<div class="health-detail-section-title">主要穴位 (' + m.acupoints.length + ')</div>';
            html += '<div class="health-acupoint-tags">';
            for (var j = 0; j < m.acupoints.length; j++) {
                var ap = m.acupoints[j];
                html += '<span class="health-acupoint-tag" onclick="Health.highlightAcupoint(\'' + ap.id + '\')">';
                html += ap.name + ' (' + ap.id + ')';
                html += '</span>';
            }
            html += '</div></div>';
        }

        html += '<div class="health-disclaimer">仅供学习参考，不构成医疗建议。如有不适请咨询专业医师。</div>';
        container.innerHTML = html;
    }

    // =========================================================================
    // Canvas
    // =========================================================================
    function initCanvas() {
        if (_renderer) { _renderer.dispose(); _renderer = null; }
        var container = document.getElementById('health-canvas-container');
        if (!container) return;
        container.innerHTML = '';
        _renderer = new HealthRenderer.MeridianRenderer();
        _renderer.init(container);
        _renderer.setViewSide(_viewSide);

        // Acupoint click handler
        _renderer.onAcupointClick(function(ap) {
            // Tooltip is drawn by renderer, no extra action needed
        });

        // Handle resize
        var ro = new ResizeObserver(function(entries) {
            if (_renderer && entries[0]) {
                var cr = entries[0].contentRect;
                _renderer.resize(cr.width, cr.height);
            }
        });
        ro.observe(container);
    }

    // =========================================================================
    // Exercise Selection
    // =========================================================================
    function selectExercise(id) {
        var data = _getCategoryData();
        var exercise = null;
        for (var i = 0; i < data.length; i++) {
            if (data[i].id === id) { exercise = data[i]; break; }
        }
        if (!exercise) return;
        _selectedExercise = exercise;
        updateActiveCard(id);

        // Set active meridians on renderer
        var meridians = [];
        var primaryIds = [];
        if (exercise.stimulatedMeridians) {
            for (var j = 0; j < exercise.stimulatedMeridians.length; j++) {
                var ref = exercise.stimulatedMeridians[j];
                var m = D.getMeridianById(ref.meridianId);
                if (m) meridians.push(m);
                if (ref.intensity === 'primary') primaryIds.push(ref.meridianId);
            }
        }

        if (_renderer) {
            _renderer.setActiveMeridians(meridians);
            _renderer.setPrimaryMeridianIds(primaryIds);
            _renderer.setHighlightAcupoint(null);
        }

        // Set up pose interpolation
        if (exercise.keyframes && exercise.keyframes.length >= 2) {
            _interpolator = new HealthRenderer.PoseInterpolator(exercise.keyframes);
            startPoseAnimation();
        } else {
            _interpolator = null;
            stopPoseAnimation();
            if (_renderer) _renderer.setActionPose(null);
        }

        // Render detail panel
        renderDetail(exercise);

        // Load video
        loadVideo(exercise);
    }

    // =========================================================================
    // Pose Animation
    // =========================================================================
    function startPoseAnimation() {
        stopPoseAnimation();
        _poseT = 0;
        _poseDirection = 1;
        var lastTime = performance.now();

        function tick(now) {
            if (!_interpolator || !_renderer) return;
            var dt = (now - lastTime) / 1000;
            lastTime = now;
            var duration = _selectedExercise ? _selectedExercise.duration : 10;
            _poseT += (dt / duration) * _poseDirection;

            if (_poseT >= 1) { _poseT = 1; _poseDirection = -1; }
            if (_poseT <= 0) { _poseT = 0; _poseDirection = 1; }

            var pose = _interpolator.interpolate(_poseT);
            _renderer.setActionPose(pose);

            // Update pose label
            var label = _interpolator.getLabel(_poseT);
            var labelEl = document.getElementById('health-pose-label');
            if (labelEl) {
                labelEl.textContent = label || '';
                labelEl.style.display = label ? '' : 'none';
            }

            _poseAnimFrame = requestAnimationFrame(tick);
        }

        _poseAnimFrame = requestAnimationFrame(tick);
    }

    function stopPoseAnimation() {
        if (_poseAnimFrame !== null) {
            cancelAnimationFrame(_poseAnimFrame);
            _poseAnimFrame = null;
        }
    }

    // =========================================================================
    // View Side Toggle
    // =========================================================================
    function setViewSide(side) {
        _viewSide = side;
        if (_renderer) _renderer.setViewSide(side);
        // Update button state
        var btns = document.querySelectorAll('.health-side-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-side') === side);
        }
    }

    // =========================================================================
    // Video
    // =========================================================================
    function loadVideo(exercise) {
        var video = document.getElementById('health-video');
        var wrap = document.getElementById('health-video-wrap');
        if (!video || !wrap) return;
        if (exercise.videoUrl) {
            video.src = exercise.videoUrl;
            video.load();
            wrap.style.display = '';
        } else {
            wrap.style.display = 'none';
        }
    }

    // =========================================================================
    // Detail Panel
    // =========================================================================
    function renderDetail(exercise) {
        var container = document.getElementById('health-detail');
        if (!container) return;

        var html = '<h3 class="health-detail-title">' + exercise.name + '</h3>';
        html += '<p class="health-detail-desc">' + exercise.description + '</p>';

        // Benefits
        if (exercise.benefits && exercise.benefits.length > 0) {
            html += '<div class="health-detail-section">';
            html += '<div class="health-detail-section-title">养生功效</div>';
            html += '<ul class="health-detail-list">';
            for (var i = 0; i < exercise.benefits.length; i++) {
                html += '<li>' + exercise.benefits[i] + '</li>';
            }
            html += '</ul></div>';
        }

        // Insights (zhanzhuang-specific)
        if (exercise.insights && exercise.insights.length > 0) {
            html += '<div class="health-detail-section">';
            html += '<div class="health-detail-section-title">练功要领</div>';
            html += '<div class="health-insights">';
            for (var n = 0; n < exercise.insights.length; n++) {
                var ins = exercise.insights[n];
                html += '<div class="health-insight">';
                html += '<div class="health-insight-label">' + ins.label + '</div>';
                html += '<div class="health-insight-content">' + ins.content + '</div>';
                html += '</div>';
            }
            html += '</div></div>';
        }

        // Stimulated Meridians
        if (exercise.stimulatedMeridians && exercise.stimulatedMeridians.length > 0) {
            html += '<div class="health-detail-section">';
            html += '<div class="health-detail-section-title">涉及经络</div>';
            html += '<div class="health-meridian-tags">';
            for (var j = 0; j < exercise.stimulatedMeridians.length; j++) {
                var ref = exercise.stimulatedMeridians[j];
                var m = D.getMeridianById(ref.meridianId);
                if (!m) continue;
                var cls = ref.intensity === 'primary' ? 'health-meridian-tag-primary' : 'health-meridian-tag-secondary';
                html += '<span class="health-meridian-tag ' + cls + '">';
                html += '<span class="health-meridian-tag-dot" style="background:' + m.color + '"></span>';
                html += m.shortName;
                if (ref.intensity === 'primary') html += ' (主要)';
                html += '</span>';
            }
            html += '</div></div>';
        }

        // Key Acupoints
        if (exercise.keyAcupoints && exercise.keyAcupoints.length > 0) {
            html += '<div class="health-detail-section">';
            html += '<div class="health-detail-section-title">重点穴位</div>';
            html += '<div class="health-acupoint-tags">';
            for (var k = 0; k < exercise.keyAcupoints.length; k++) {
                var apId = exercise.keyAcupoints[k];
                var info = D.getAcupointById(apId);
                var label = info ? info.acupoint.name + ' (' + apId + ')' : apId;
                html += '<span class="health-acupoint-tag" onclick="Health.highlightAcupoint(\'' + apId + '\')">' + label + '</span>';
            }
            html += '</div></div>';
        }

        // Disclaimer
        html += '<div class="health-disclaimer">仅供学习参考，不构成医疗建议。如有不适请咨询专业医师。</div>';

        container.innerHTML = html;
    }

    // =========================================================================
    // Highlight acupoint from detail panel
    // =========================================================================
    function highlightAcupoint(apId) {
        var info = D.getAcupointById(apId);
        if (!info || !_renderer) return;

        // Determine which side has this acupoint
        var ap = info.acupoint;
        if (ap.positionFront && _viewSide !== 'front') setViewSide('front');
        else if (ap.positionBack && !ap.positionFront && _viewSide !== 'back') setViewSide('back');

        _renderer.setHighlightAcupoint(ap);
    }

    return {
        init: init,
        dispose: dispose,
        showHub: showHub,
        openCategory: openCategory,
        backToHub: backToHub,
        selectExercise: selectExercise,
        selectMeridian: selectMeridian,
        setViewSide: setViewSide,
        highlightAcupoint: highlightAcupoint
    };
})();
