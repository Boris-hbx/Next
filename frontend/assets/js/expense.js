// ========== Expense Module ==========
var Expense = (function() {
    var _period = 'day'; // 'day' | 'week' | 'month'
    var _currentDate = new Date();
    var _entries = [];
    var _selectedTags = [];
    var _allTags = [];
    var _pendingPhotos = []; // files waiting to upload
    var _currentDetailId = null;
    var _currentDetail = null; // full detail object for current entry
    var _editingId = null; // when editing an existing entry

    // Preview state
    var _modalState = 'input'; // 'input' | 'analyzing' | 'preview'
    var _previewData = null;
    var _progressTimer = null;
    var _splitMode = false;
    var _dateGroups = {};
    var _analyticsMode = false;
    var _currency = 'CAD'; // 'CAD' | 'CNY'
    var _rates = null; // { CNY: number }
    var _ratesTimestamp = 0;

    function log(action, detail) {
        var ts = new Date().toTimeString().slice(0, 8);
        var msg = '[Expense ' + ts + '] ' + action;
        if (detail !== undefined) {
            if (typeof detail === 'object') {
                try { msg += ': ' + JSON.stringify(detail); } catch(e) { msg += ': [object]'; }
            } else {
                msg += ': ' + detail;
            }
        }
        console.log(msg);
    }

    function init() {
        _currentDate = new Date();
        _period = 'day';
        log('init');
        updatePeriodButtons();
        loadRates();
        loadEntries();
        loadTags();
    }

    // ===== Period & Date Navigation =====

    function switchPeriod(period) {
        _period = period;
        _currentDate = new Date();
        updatePeriodButtons();
        loadEntries();
    }

    function updatePeriodButtons() {
        document.querySelectorAll('.expense-period-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.period === _period);
        });
    }

    function navigateDate(dir) {
        if (_period === 'day') {
            _currentDate.setDate(_currentDate.getDate() + dir);
        } else if (_period === 'week') {
            _currentDate.setDate(_currentDate.getDate() + (dir * 7));
        } else {
            _currentDate.setMonth(_currentDate.getMonth() + dir);
        }
        loadEntries();
    }

    function getDateRange() {
        var d = new Date(_currentDate);
        var from, to;

        if (_period === 'day') {
            from = to = formatDate(d);
        } else if (_period === 'week') {
            var day = d.getDay();
            var diff = d.getDate() - day + (day === 0 ? -6 : 1);
            var start = new Date(d);
            start.setDate(diff);
            var end = new Date(start);
            end.setDate(start.getDate() + 6);
            from = formatDate(start);
            to = formatDate(end);
        } else {
            var start = new Date(d.getFullYear(), d.getMonth(), 1);
            var end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            from = formatDate(start);
            to = formatDate(end);
        }

        return { from: from, to: to };
    }

    function updateDateLabel() {
        var label = document.getElementById('expense-date-label');
        if (!label) return;

        var today = new Date();
        var d = _currentDate;

        if (_period === 'day') {
            if (formatDate(d) === formatDate(today)) {
                label.textContent = '今天';
            } else {
                label.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日';
            }
        } else if (_period === 'week') {
            var range = getDateRange();
            label.textContent = range.from.slice(5) + ' ~ ' + range.to.slice(5);
        } else {
            label.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
        }
    }

    // ===== Data Loading =====

    async function loadEntries() {
        updateDateLabel();
        var range = getDateRange();
        try {
            var data = await API.getExpenses(range.from, range.to);
            if (data.success) {
                _entries = data.entries || [];
                log('loadEntries', { range: range, count: _entries.length });
                renderList();
                loadSummary();
                // 收下分享后跳转：数据就绪时自动打开指定 detail
                if (Expense.pendingOpenId) {
                    var pid = Expense.pendingOpenId;
                    Expense.pendingOpenId = null;
                    openDetail(pid);
                }
            }
        } catch(e) {
            log('loadEntries ERROR', e.message || e);
        }
    }

    async function loadSummary() {
        var totalEl = document.getElementById('expense-total-amount');
        if (!totalEl) return;

        await loadRates();

        var cadTotal = 0;
        var hasCny = false;
        _entries.forEach(function(e) {
            if (e.currency === 'CNY' && _rates && _rates.CNY) {
                cadTotal += e.amount / _rates.CNY;
                hasCny = true;
            } else {
                cadTotal += e.amount;
            }
        });

        totalEl.textContent = 'CA$' + cadTotal.toFixed(2);

        var rateNote = document.getElementById('expense-rate-note');
        if (!rateNote) {
            rateNote = document.createElement('div');
            rateNote.id = 'expense-rate-note';
            rateNote.style.cssText = 'font-size:11px;color:var(--text-secondary, #999);margin-top:2px;';
            totalEl.parentElement.appendChild(rateNote);
        }
        if (hasCny && _rates && _rates.CNY) {
            rateNote.textContent = '汇率: 1 CAD ≈ ' + _rates.CNY.toFixed(2) + ' CNY';
            rateNote.style.display = '';
        } else {
            rateNote.style.display = 'none';
        }
    }

    async function loadTags() {
        try {
            var data = await API.getExpenseTags();
            if (data.success) {
                _allTags = data.tags || [];
                renderTagsFilter();
            }
        } catch(e) {
            console.error('[expense] loadTags:', e);
        }
    }

    // ===== Rendering =====

    function renderList() {
        var container = document.getElementById('expense-list');
        if (!container) return;

        var filtered = _entries;
        if (_selectedTags.length > 0) {
            filtered = _entries.filter(function(e) {
                return _selectedTags.some(function(st) {
                    return e.tags && e.tags.indexOf(st) !== -1;
                });
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="expense-empty"><div class="expense-empty-icon">💰</div><p>还没有记账记录</p><p class="expense-empty-hint">点击 + 记一笔</p></div>';
            return;
        }

        // Group by date
        var groups = {};
        filtered.forEach(function(e) {
            if (!groups[e.date]) groups[e.date] = [];
            groups[e.date].push(e);
        });

        var html = '';
        var dates = Object.keys(groups).sort().reverse();
        dates.forEach(function(date) {
            var entries = groups[date];
            var dayTotal = entries.reduce(function(sum, e) {
                if (e.currency === 'CNY' && _rates && _rates.CNY) return sum + e.amount / _rates.CNY;
                return sum + e.amount;
            }, 0);
            html += '<div class="expense-day-group">';
            html += '<div class="expense-day-header">' + formatDateLabel(date) + ' · CA$' + dayTotal.toFixed(2) + '</div>';
            entries.forEach(function(e) {
                var tagsHtml = '';
                if (e.tags && e.tags.length > 0) {
                    tagsHtml = '<div class="expense-entry-tags">';
                    e.tags.forEach(function(t) {
                        tagsHtml += '<span class="expense-entry-tag">' + escapeHtml(t) + '</span>';
                    });
                    tagsHtml += '</div>';
                }
                var photoIcon = e.photo_count > 0 ? '<span class="expense-entry-photo-indicator">📷</span>' : '';
                var notes = e.notes || '未备注';
                html += '<div class="expense-entry-card" data-id="' + e.id + '" onclick="Expense.openDetail(\'' + e.id + '\')">';
                html += '<div class="expense-entry-info">';
                html += '<div class="expense-entry-notes">' + escapeHtml(notes) + '</div>';
                html += tagsHtml;
                html += '</div>';
                html += photoIcon;
                html += '<div class="expense-entry-amount">' + currencySymbol(e.currency) + e.amount.toFixed(2) + '</div>';
                html += '</div>';
            });
            html += '</div>';
        });

        container.innerHTML = html;

        // 长按操作菜单 (SPEC-047)
        if (typeof ActionSheet !== 'undefined') {
            ActionSheet.bindAll(container, '.expense-entry-card', function(el) {
                var id = el.dataset.id;
                return [
                    { icon: '📤', label: '分享给好友', action: function() { Friends.openShareModal('expense', id); } },
                    { icon: '✏️', label: '编辑', action: function() { _currentDetailId = id; editEntry(); } },
                    { icon: '🗑️', label: '删除', action: function() { _currentDetailId = id; deleteEntry(); }, danger: true }
                ];
            });
        }
    }

    function renderTagsFilter() {
        var container = document.getElementById('expense-tags-filter');
        if (!container || _allTags.length === 0) {
            if (container) container.innerHTML = '';
            return;
        }

        var html = '';
        _allTags.forEach(function(tag) {
            var active = _selectedTags.indexOf(tag) !== -1 ? ' active' : '';
            html += '<button class="expense-tag-pill' + active + '" onclick="Expense.toggleTag(\'' + escapeHtml(tag) + '\')">' + escapeHtml(tag) + '</button>';
        });
        container.innerHTML = html;
    }

    function toggleTag(tag) {
        var idx = _selectedTags.indexOf(tag);
        if (idx === -1) {
            _selectedTags.push(tag);
        } else {
            _selectedTags.splice(idx, 1);
        }
        renderTagsFilter();
        renderList();
    }

    // ===== Modal State Management =====

    function setModalState(state) {
        log('setModalState', state);
        _modalState = state;
        var inputDiv = document.getElementById('expense-state-input');
        var analyzingDiv = document.getElementById('expense-state-analyzing');
        var previewDiv = document.getElementById('expense-state-preview');
        var title = document.getElementById('expense-modal-title');

        if (inputDiv) inputDiv.style.display = state === 'input' ? '' : 'none';
        if (analyzingDiv) analyzingDiv.style.display = state === 'analyzing' ? '' : 'none';
        if (previewDiv) previewDiv.style.display = state === 'preview' ? '' : 'none';

        if (title) {
            if (state === 'preview') title.textContent = '识别结果';
            else if (state === 'analyzing') title.textContent = '识别中...';
            else title.textContent = _editingId ? '编辑' : '记一笔';
        }

        updateFooterButtons();
    }

    function updateFooterButtons() {
        var footer = document.getElementById('expense-add-footer');
        if (!footer) return;

        if (_modalState === 'analyzing') {
            footer.innerHTML = '';
            return;
        }

        if (_modalState === 'preview') {
            footer.innerHTML =
                '<button class="btn btn-secondary" onclick="Expense.retakePhotos()">重新拍照</button>' +
                '<button class="btn btn-primary" onclick="Expense.savePreview()">确认保存</button>';
            return;
        }

        // input state
        if (_editingId) {
            // Editing mode — always show save
            footer.innerHTML =
                '<button class="btn btn-secondary" onclick="Expense.closeAddModal()">取消</button>' +
                '<button class="btn btn-primary" onclick="Expense.submitEntry()">保存</button>';
        } else if (_pendingPhotos.length > 0) {
            // Has photos — show parse button
            footer.innerHTML =
                '<button class="btn btn-secondary" onclick="Expense.closeAddModal()">取消</button>' +
                '<button class="btn btn-primary" onclick="Expense.startParse()" style="background:linear-gradient(135deg,#667eea,#764ba2)">识别账单 &#10024;</button>';
        } else {
            // No photos — normal save (only if amount entered)
            footer.innerHTML =
                '<button class="btn btn-secondary" onclick="Expense.closeAddModal()">取消</button>' +
                '<button class="btn btn-primary" onclick="Expense.submitEntry()">保存</button>';
        }
    }

    // ===== Add Entry =====

    function openAddModal() {
        if (isGuestRestricted('添加记账')) return;
        _pendingPhotos = [];
        _editingId = null;
        _previewData = null;
        _splitMode = false;
        _dateGroups = {};
        _modalState = 'input';
        _currency = 'CAD';
        log('openAddModal');

        var overlay = document.getElementById('expense-add-overlay');
        var amountInput = document.getElementById('expense-amount-input');
        var dateInput = document.getElementById('expense-date-input');
        var notesInput = document.getElementById('expense-notes-input');
        var photoGrid = document.getElementById('expense-photo-grid');
        var fileInput = document.getElementById('expense-photo-input');

        if (amountInput) amountInput.value = '';
        if (dateInput) dateInput.value = formatDate(new Date());
        if (notesInput) notesInput.value = '';
        if (photoGrid) photoGrid.innerHTML = '';
        if (fileInput) fileInput.value = '';

        setModalState('input');
        renderCurrencyToggle();
        if (overlay) overlay.style.display = '';

        setTimeout(function() {
            if (amountInput) amountInput.focus();
        }, 100);
    }

    function closeAddModal() {
        log('closeAddModal');
        var overlay = document.getElementById('expense-add-overlay');
        if (overlay) overlay.style.display = 'none';
        _pendingPhotos = [];
        _previewData = null;
        _splitMode = false;
        _dateGroups = {};
        stopFakeProgress();
    }

    function handlePhotoSelect(event) {
        var files = event.target.files;
        if (!files || files.length === 0) return;

        var added = 0;
        for (var i = 0; i < files.length; i++) {
            if (files[i].size > 10 * 1024 * 1024) {
                showToast('照片不能超过 10MB', 'error');
                continue;
            }
            _pendingPhotos.push(files[i]);
            added++;
        }
        log('handlePhotoSelect', { added: added, total: _pendingPhotos.length, sizes: _pendingPhotos.map(function(f) { return (f.size / 1024).toFixed(0) + 'KB'; }) });
        renderPhotoGrid();
        // Reset file input so same file can be selected again
        event.target.value = '';
    }

    function renderPhotoGrid() {
        var grid = document.getElementById('expense-photo-grid');
        if (!grid) return;
        grid.innerHTML = '';

        _pendingPhotos.forEach(function(file, idx) {
            var thumb = document.createElement('div');
            thumb.className = 'expense-photo-thumb';
            var img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            var removeBtn = document.createElement('button');
            removeBtn.className = 'expense-photo-remove';
            removeBtn.textContent = '\u00d7';
            removeBtn.onclick = function(e) {
                e.stopPropagation();
                _pendingPhotos.splice(idx, 1);
                log('removePhoto', { idx: idx, remaining: _pendingPhotos.length });
                renderPhotoGrid();
            };
            thumb.appendChild(img);
            thumb.appendChild(removeBtn);
            grid.appendChild(thumb);
        });

        updateFooterButtons();
    }

    // ===== Parse Preview Flow =====

    function fileToBase64(file) {
        var MAX_DIM = 2048;
        var QUALITY = 0.82;
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() {
                var w = img.width, h = img.height;
                // Downscale if larger than MAX_DIM
                if (w > MAX_DIM || h > MAX_DIM) {
                    var ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                var base64 = dataUrl.split(',')[1];
                log('fileToBase64', { orig: img.width + 'x' + img.height, scaled: w + 'x' + h, b64Len: base64.length });
                resolve({ data: base64, mime_type: 'image/jpeg' });
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    async function startParse() {
        if (_pendingPhotos.length === 0) {
            showToast('请先添加照片', 'error');
            return;
        }

        log('startParse', { photoCount: _pendingPhotos.length });
        setModalState('analyzing');
        startFakeProgress();

        try {
            // Convert all photos to base64
            var images = [];
            for (var i = 0; i < _pendingPhotos.length; i++) {
                var img = await fileToBase64(_pendingPhotos[i]);
                images.push(img);
            }
            log('startParse base64Ready', { count: images.length, totalBytes: images.reduce(function(s, i) { return s + i.data.length; }, 0) });

            var result = await API.parseExpensePreview(images);
            stopFakeProgress();

            log('startParse response', { success: result.success, hasPreview: !!result.preview, message: result.message || null });
            if (result.success && result.preview) {
                _previewData = result.preview;
                if (_previewData.currency) _currency = _previewData.currency;
                log('startParse preview', {
                    merchant: _previewData.merchant,
                    date: _previewData.date,
                    total: _previewData.total_amount,
                    items: (_previewData.items || []).length,
                    tags: _previewData.tags
                });
                renderPreview();
                setModalState('preview');
            } else {
                showToast(result.message || '识别失败，请手动输入', 'error');
                setModalState('input');
            }
        } catch(e) {
            stopFakeProgress();
            log('startParse ERROR', e.message || e);
            showToast('识别失败，请手动输入', 'error');
            setModalState('input');
        }
    }

    function startFakeProgress() {
        var fill = document.getElementById('expense-progress-fill');
        if (!fill) return;
        fill.style.width = '0%';
        var progress = 0;
        _progressTimer = setInterval(function() {
            // Ease towards 90% over ~30s
            var remaining = 90 - progress;
            progress += remaining * 0.03;
            if (progress > 90) progress = 90;
            fill.style.width = progress + '%';
        }, 500);
    }

    function stopFakeProgress() {
        if (_progressTimer) {
            clearInterval(_progressTimer);
            _progressTimer = null;
        }
        var fill = document.getElementById('expense-progress-fill');
        if (fill) fill.style.width = '100%';
    }

    function renderPreview() {
        var container = document.getElementById('expense-state-preview');
        if (!container || !_previewData) return;

        var p = _previewData;

        // Detect multi-date: collect unique dates from items
        var dates = {};
        (p.items || []).forEach(function(item) {
            var d = item.date || p.date || formatDate(new Date());
            if (!dates[d]) dates[d] = { items: [], total: 0 };
            dates[d].items.push(item);
            dates[d].total += item.amount || 0;
        });
        var dateKeys = Object.keys(dates).sort();
        var isMultiDate = dateKeys.length > 1;
        _dateGroups = dates;

        var html = '<div class="expense-preview-card">';

        // Header: merchant + editable date
        html += '<div class="expense-preview-header">';
        html += '<div class="expense-preview-merchant">' + escapeHtml(p.merchant || '未识别商家') + '</div>';
        if (!_splitMode || !isMultiDate) {
            html += '<input type="date" id="expense-preview-date" class="expense-preview-date-input" value="' + escapeHtml(p.date || formatDate(new Date())) + '">';
        }
        html += '</div>';

        // Multi-date selection bar
        if (isMultiDate) {
            html += '<div class="expense-multi-date-bar">';
            html += '<div class="expense-multi-date-hint">&#9888;&#65039; 识别到 ' + dateKeys.length + ' 个日期的账单</div>';
            html += '<div class="expense-multi-date-actions">';
            html += '<button class="expense-multi-date-btn' + (!_splitMode ? ' active' : '') + '" onclick="Expense.setSplitMode(false)">合并为一条</button>';
            html += '<button class="expense-multi-date-btn' + (_splitMode ? ' active' : '') + '" onclick="Expense.setSplitMode(true)">按日拆分 &#9986;&#65039;</button>';
            html += '</div>';
            html += '</div>';
        }

        // Tags
        if (p.tags && p.tags.length > 0) {
            html += '<div class="expense-preview-tags">';
            p.tags.forEach(function(t) {
                html += '<span class="expense-preview-tag">' + escapeHtml(t) + '</span>';
            });
            html += '</div>';
        }

        // Items — render split or merged
        if (_splitMode && isMultiDate) {
            // Split mode: group by date
            html += '<div class="expense-preview-items">';
            dateKeys.forEach(function(dateKey) {
                var group = dates[dateKey];
                html += '<div class="expense-date-group-header">';
                html += '<span>' + formatDateLabel(dateKey) + ' (' + dateKey + ')</span>';
                html += '<span>' + group.items.length + ' 件</span>';
                html += '<span class="expense-date-group-subtotal">' + currencySymbol(_currency) + group.total.toFixed(2) + '</span>';
                html += '</div>';
                group.items.forEach(function(item) {
                    html += renderPreviewItem(item);
                });
            });
            html += '</div>';
        } else if (p.items && p.items.length > 0) {
            // Merged mode: flat list
            html += '<div class="expense-preview-items">';
            p.items.forEach(function(item) {
                html += renderPreviewItem(item);
            });
            html += '</div>';
        }

        // Summary rows
        html += '<div class="expense-preview-summary">';
        if (p.subtotal != null) {
            html += '<div class="expense-preview-summary-row"><span>小计</span><span>' + currencySymbol(_currency) + p.subtotal.toFixed(2) + '</span></div>';
        }
        if (p.tax != null && p.tax > 0) {
            html += '<div class="expense-preview-summary-row"><span>税</span><span>' + currencySymbol(_currency) + p.tax.toFixed(2) + '</span></div>';
        }
        if (p.tip != null && p.tip > 0) {
            html += '<div class="expense-preview-summary-row"><span>小费</span><span>' + currencySymbol(_currency) + p.tip.toFixed(2) + '</span></div>';
        }
        var totalAmount = p.total_amount || p.subtotal || 0;
        html += '<div class="expense-preview-summary-row total"><span>总计</span><span>' + currencySymbol(_currency) + totalAmount.toFixed(2) + '</span></div>';
        html += '</div>';

        // Editable fields (only in merged mode)
        if (!_splitMode || !isMultiDate) {
            html += '<div class="expense-preview-editable">';
            html += '<label>金额（可修改）</label>';
            html += '<input type="number" id="expense-preview-amount" value="' + totalAmount.toFixed(2) + '" step="0.01" min="0" inputmode="decimal">';
            html += '</div>';
        }

        html += '<div class="expense-preview-editable">';
        html += '<label>备注（可修改）</label>';
        html += '<input type="text" id="expense-preview-notes" value="' + escapeHtml(p.merchant || '') + '" placeholder="备注...">';
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;
    }

    function renderPreviewItem(item) {
        var html = '<div class="expense-preview-item">';
        html += '<div class="expense-preview-item-main">';
        html += '<span class="expense-preview-item-name">' + escapeHtml(item.name) + '</span>';
        html += '<span class="expense-preview-item-amount">' + currencySymbol(_currency) + item.amount.toFixed(2) + '</span>';
        html += '</div>';
        var specParts = [];
        if (item.quantity && item.quantity !== 1) specParts.push('x' + item.quantity);
        if (item.unit_price) specParts.push('@' + currencySymbol(_currency) + item.unit_price.toFixed(2));
        if (item.specs) specParts.push(item.specs);
        if (specParts.length > 0) {
            html += '<div class="expense-preview-item-specs">' + escapeHtml(specParts.join(' · ')) + '</div>';
        }
        html += '</div>';
        return html;
    }

    function setSplitMode(split) {
        _splitMode = split;
        log('setSplitMode', split);
        renderPreview();
    }

    async function savePreview() {
        if (!_previewData) {
            log('savePreview ABORT', 'no previewData');
            return;
        }

        var p = _previewData;
        var notesInput = document.getElementById('expense-preview-notes');
        var notes = notesInput ? notesInput.value.trim() : (p.merchant || '');
        var dateKeys = Object.keys(_dateGroups).sort();
        var isMultiDate = dateKeys.length > 1;

        // Split mode: save one entry per date
        if (_splitMode && isMultiDate) {
            log('savePreview SPLIT', { dates: dateKeys });

            var subtotal = p.subtotal || 0;
            var extraTax = p.tax || 0;
            var extraTip = p.tip || 0;
            var firstEntryId = null;

            for (var di = 0; di < dateKeys.length; di++) {
                var dateKey = dateKeys[di];
                var group = _dateGroups[dateKey];
                var groupAmount = group.total;
                // Proportional share of tax & tip
                var ratio = subtotal > 0 ? groupAmount / subtotal : (1 / dateKeys.length);
                var shareTax = Math.round(extraTax * ratio * 100) / 100;
                var shareTip = Math.round(extraTip * ratio * 100) / 100;
                var totalForGroup = groupAmount + shareTax + shareTip;

                var data = {
                    amount: Math.round(totalForGroup * 100) / 100,
                    currency: _currency,
                    date: dateKey,
                    notes: notes,
                    tags: p.tags || [],
                    ai_processed: true,
                    items: group.items.map(function(item) {
                        var obj = {
                            name: item.name || '未知商品',
                            quantity: item.quantity || 1,
                            amount: item.amount || 0
                        };
                        if (item.unit_price != null) obj.unit_price = item.unit_price;
                        if (item.specs) obj.specs = item.specs;
                        return obj;
                    })
                };

                log('savePreview SPLIT create', { date: dateKey, amount: data.amount, items: data.items.length });

                try {
                    var result = await API.createExpense(data);
                    if (!result.success) {
                        showToast(result.message || '保存失败', 'error');
                        return;
                    }
                    if (!firstEntryId) firstEntryId = result.entry.id;
                } catch(e) {
                    log('savePreview SPLIT ERROR', e.message || e);
                    showToast('保存失败', 'error');
                    return;
                }
            }

            // Attach photos to first entry
            if (_pendingPhotos.length > 0 && firstEntryId) {
                log('savePreview uploadPhotos', { entryId: firstEntryId, count: _pendingPhotos.length });
                await uploadPhotos(firstEntryId, _pendingPhotos);
            }

            closeAddModal();
            showToast('已拆分保存 ' + dateKeys.length + ' 条记录', 'success');

            _currentDate = new Date(dateKeys[0] + 'T12:00:00');
            _period = 'day';
            updatePeriodButtons();
            loadEntries();
            loadTags();
            return;
        }

        // Merged mode (original logic)
        var amountInput = document.getElementById('expense-preview-amount');
        var amount = parseFloat(amountInput ? amountInput.value : '0');
        if (!amount || amount <= 0) {
            log('savePreview ABORT', 'invalid amount: ' + (amountInput ? amountInput.value : 'null'));
            showToast('请输入金额', 'error');
            return;
        }

        var dateInput = document.getElementById('expense-preview-date');
        var entryDate = (dateInput && dateInput.value) ? dateInput.value : (p.date || formatDate(new Date()));
        var data = {
            amount: amount,
            currency: _currency,
            date: entryDate,
            notes: notes,
            tags: p.tags || [],
            ai_processed: true,
            items: (p.items || []).map(function(item) {
                var obj = {
                    name: item.name || '未知商品',
                    quantity: item.quantity || 1,
                    amount: item.amount || 0
                };
                if (item.unit_price != null) obj.unit_price = item.unit_price;
                if (item.specs) obj.specs = item.specs;
                return obj;
            })
        };

        log('savePreview', { amount: amount, date: entryDate, notes: notes, tags: data.tags, itemCount: data.items.length });

        // Check for potential duplicates on the same date
        var isDuplicate = await checkDuplicate(amount, entryDate);
        if (isDuplicate) {
            log('savePreview ABORT', 'user cancelled duplicate');
            return;
        }

        try {
            var result = await API.createExpense(data);
            log('savePreview createExpense response', { success: result.success, entryId: result.entry ? result.entry.id : null, message: result.message || null });
            if (!result.success) {
                showToast(result.message || '保存失败', 'error');
                return;
            }

            var entryId = result.entry.id;

            // Upload photos so they're attached to this entry
            if (_pendingPhotos.length > 0) {
                log('savePreview uploadPhotos', { entryId: entryId, count: _pendingPhotos.length });
                var uploadResult = await uploadPhotos(entryId, _pendingPhotos);
                log('savePreview uploadPhotos result', uploadResult);
            }

            closeAddModal();
            showToast('已记录', 'success');

            // Navigate to the entry's date so user can see it
            _currentDate = new Date(entryDate + 'T12:00:00');
            _period = 'day';
            updatePeriodButtons();
            loadEntries();
            loadTags();
        } catch(e) {
            log('savePreview ERROR', e.message || e);
            showToast('保存失败', 'error');
        }
    }

    function retakePhotos() {
        log('retakePhotos');
        _previewData = null;
        setModalState('input');
    }

    // ===== Duplicate Detection =====

    async function checkDuplicate(amount, date) {
        try {
            var existing = await API.getExpenses(date, date);
            if (existing.success && existing.entries) {
                var dup = existing.entries.find(function(e) {
                    return Math.abs(e.amount - amount) < 0.02;
                });
                if (dup) {
                    log('checkDuplicate HIT', { existingId: dup.id, existingAmount: dup.amount, existingNotes: dup.notes });
                    var msg = '发现同日相似记录：' + currencySymbol(dup.currency) + dup.amount.toFixed(2);
                    if (dup.notes) msg += '（' + dup.notes + '）';
                    msg += '\n确定不是重复记账？';
                    return !confirm(msg); // return true = is duplicate (user cancelled)
                }
            }
        } catch(e) {
            console.error('[expense] checkDuplicate:', e);
            // proceed with save even if check fails
        }
        return false;
    }

    // ===== Submit (manual, no preview) =====

    async function submitEntry() {
        if (_editingId) {
            return submitEdit();
        }

        var amountInput = document.getElementById('expense-amount-input');
        var dateInput = document.getElementById('expense-date-input');
        var notesInput = document.getElementById('expense-notes-input');

        var amount = parseFloat(amountInput ? amountInput.value : '0');
        if (!amount || amount <= 0) {
            showToast('请输入金额', 'error');
            return;
        }

        var entryDate = dateInput ? dateInput.value : formatDate(new Date());
        var notes = notesInput ? notesInput.value.trim() : '';

        log('submitEntry', { amount: amount, date: entryDate, notes: notes, photoCount: _pendingPhotos.length });

        // Check for potential duplicates
        var isDuplicate = await checkDuplicate(amount, entryDate);
        if (isDuplicate) {
            log('submitEntry ABORT', 'user cancelled duplicate');
            return;
        }

        var data = {
            amount: amount,
            currency: _currency,
            date: entryDate,
            notes: notes
        };

        try {
            var result = await API.createExpense(data);
            log('submitEntry createExpense response', { success: result.success, entryId: result.entry ? result.entry.id : null, message: result.message || null });
            if (!result.success) {
                showToast(result.message || '保存失败', 'error');
                return;
            }

            var entryId = result.entry.id;

            // Upload photos if any
            if (_pendingPhotos.length > 0) {
                var uploadResult = await uploadPhotos(entryId, _pendingPhotos);
                log('submitEntry uploadPhotos result', uploadResult);
                // Trigger AI parse in background
                API.parseExpenseReceipts(entryId).catch(function(e) {
                    console.error('[expense] parseReceipts:', e);
                });
            }

            closeAddModal();
            showToast('已记录', 'success');
            loadEntries();
            loadTags();
        } catch(e) {
            log('submitEntry ERROR', e.message || e);
            showToast('保存失败', 'error');
        }
    }

    async function submitEdit() {
        var amountInput = document.getElementById('expense-amount-input');
        var dateInput = document.getElementById('expense-date-input');
        var notesInput = document.getElementById('expense-notes-input');

        var amount = parseFloat(amountInput ? amountInput.value : '0');
        if (!amount || amount <= 0) {
            showToast('请输入金额', 'error');
            return;
        }

        var data = {
            amount: amount,
            currency: _currency,
            date: dateInput ? dateInput.value : undefined,
            notes: notesInput ? notesInput.value.trim() : undefined
        };

        log('submitEdit', { id: _editingId, amount: amount });

        try {
            var result = await API.updateExpense(_editingId, data);
            log('submitEdit response', { success: result.success, message: result.message || null });
            if (result.success) {
                // Upload new photos if any
                if (_pendingPhotos.length > 0) {
                    await uploadPhotos(_editingId, _pendingPhotos);
                    API.parseExpenseReceipts(_editingId).catch(function(e) {
                        console.error('[expense] parseReceipts:', e);
                    });
                }
                closeAddModal();
                showToast('已更新', 'success');
                _editingId = null;
                loadEntries();
                loadTags();
            } else {
                showToast(result.message || '更新失败', 'error');
            }
        } catch(e) {
            log('submitEdit ERROR', e.message || e);
            showToast('更新失败', 'error');
        }
    }

    async function uploadPhotos(entryId, files) {
        var formData = new FormData();
        for (var i = 0; i < files.length; i++) {
            formData.append('photos', files[i]);
        }
        log('uploadPhotos', { entryId: entryId, fileCount: files.length });
        try {
            var resp = await fetch('/api/expenses/' + entryId + '/photos', {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });
            var result = await resp.json();
            log('uploadPhotos response', { status: resp.status, success: result.success, count: result.count });
            return result;
        } catch(e) {
            log('uploadPhotos ERROR', e.message || e);
            return { success: false };
        }
    }

    // ===== Detail =====

    async function openDetail(id) {
        _currentDetailId = id;
        log('openDetail', id);
        try {
            var data = await API.getExpense(id);
            if (!data.success || !data.entry) {
                log('openDetail FAIL', data.message || 'no entry');
                showToast('加载失败', 'error');
                return;
            }

            log('openDetail loaded', { amount: data.entry.amount, photos: (data.entry.photos || []).length, items: (data.entry.items || []).length });
            _currentDetail = data.entry;
            renderDetail(data.entry);
            updateDetailFooter(data.entry);

            var overlay = document.getElementById('expense-detail-overlay');
            if (overlay) overlay.style.display = '';
        } catch(e) {
            log('openDetail ERROR', e.message || e);
            showToast('加载失败', 'error');
        }
    }

    function renderDetail(detail) {
        var body = document.getElementById('expense-detail-body');
        if (!body) return;

        var html = '';
        html += '<div class="expense-detail-amount">' + currencySymbol(detail.currency) + detail.amount.toFixed(2) + '</div>';

        // Meta
        html += '<div class="expense-detail-meta">';
        html += '<span>📅 ' + formatDateLabel(detail.date) + '</span>';
        if (detail.notes) {
            html += '<span>📝 ' + escapeHtml(detail.notes) + '</span>';
        }
        if (detail.ai_processed) {
            html += '<span class="expense-ai-badge">✨ AI 已解析</span>';
        }
        html += '</div>';

        // Tags
        if (detail.tags && detail.tags.length > 0) {
            html += '<div class="expense-detail-tags">';
            detail.tags.forEach(function(t) {
                html += '<span class="expense-detail-tag">' + escapeHtml(t) + '</span>';
            });
            html += '</div>';
        }

        // Items table
        if (detail.items && detail.items.length > 0) {
            html += '<div class="expense-detail-items">';
            html += '<h4>消费明细</h4>';
            html += '<table class="expense-items-table">';
            html += '<thead><tr><th>商品</th><th>规格</th><th>单价</th><th>数量</th><th>小计</th></tr></thead>';
            html += '<tbody>';
            detail.items.forEach(function(item) {
                html += '<tr>';
                html += '<td>' + escapeHtml(item.name) + '</td>';
                html += '<td>' + escapeHtml(item.specs || '') + '</td>';
                var sym = currencySymbol(detail.currency);
                html += '<td>' + (item.unit_price != null ? sym + item.unit_price.toFixed(2) : '-') + '</td>';
                html += '<td>' + item.quantity + '</td>';
                html += '<td>' + sym + item.amount.toFixed(2) + '</td>';
                html += '</tr>';
            });
            var itemsTotal = detail.items.reduce(function(s, i) { return s + i.amount; }, 0);
            html += '<tr class="expense-items-total"><td colspan="4">合计</td><td>' + currencySymbol(detail.currency) + itemsTotal.toFixed(2) + '</td></tr>';
            html += '</tbody></table></div>';
        }

        // Photos
        if (detail.photos && detail.photos.length > 0) {
            html += '<div class="expense-detail-photos">';
            html += '<h4>照片</h4>';
            html += '<div class="expense-detail-photo-grid">';
            detail.photos.forEach(function(photo) {
                var photoUrl = photo.storage_path ? '/api/uploads/' + photo.storage_path.split('/uploads/').pop() : '';
                html += '<div class="expense-detail-photo" onclick="Expense.showLightbox(\'' + escapeHtml(photoUrl) + '\')">';
                html += '<img src="' + escapeHtml(photoUrl) + '" loading="lazy">';
                html += '</div>';
            });
            html += '</div></div>';
        }

        body.innerHTML = html;
    }

    function updateDetailFooter(detail) {
        var footer = document.getElementById('expense-detail-footer');
        if (!footer) return;
        var hasPhotos = detail.photos && detail.photos.length > 0;
        var canAnalyze = hasPhotos && !detail.ai_processed;
        if (canAnalyze) {
            var aiHint = '';
            var aiGuestAttr = '';
            if (window._userStatus === 'guest') {
                var _r = window._guestAiRemaining;
                var _hintText = (_r !== undefined && _r > 0) ? '(剩余' + _r + '次)' : (_r !== undefined ? '(已用完)' : '');
                var _warnCls = (_r !== undefined && _r <= 3) ? ' guest-ai-warning' : '';
                aiHint = ' <span class="guest-ai-hint' + _warnCls + '">' + _hintText + '</span>';
                aiGuestAttr = ' data-guest-ai-action="1"';
            }
            footer.innerHTML =
                '<button class="btn btn-danger-text" onclick="Expense.deleteEntry()">删除</button>' +
                '<button class="btn btn-primary" onclick="Expense.analyzeExisting()"' + aiGuestAttr + ' style="background:linear-gradient(135deg,#667eea,#764ba2)">阿宝分析 ✨' + aiHint + '</button>' +
                '<button class="btn btn-secondary" onclick="Expense.editEntry()">编辑</button>';
        } else {
            footer.innerHTML =
                '<button class="btn btn-danger-text" onclick="Expense.deleteEntry()">删除</button>' +
                '<button class="btn btn-primary" onclick="Expense.editEntry()">编辑</button>';
        }
    }

    async function analyzeExisting() {
        if (!_currentDetailId) return;
        log('analyzeExisting', _currentDetailId);
        var body = document.getElementById('expense-detail-body');
        if (body) {
            body.innerHTML = '<div class="expense-analyzing"><div class="expense-analyzing-icon">✨</div><p class="expense-analyzing-text">阿宝正在分析照片...</p></div>';
        }
        var footer = document.getElementById('expense-detail-footer');
        if (footer) footer.innerHTML = '';
        try {
            var result = await API.parseExpenseReceipts(_currentDetailId);
            log('analyzeExisting result', result);
            if (result.ai_remaining !== undefined) {
                window._guestAiRemaining = result.ai_remaining;
                if (typeof updateAllGuestAiHints === 'function') updateAllGuestAiHints();
            }
            // Reload the detail
            var data = await API.getExpense(_currentDetailId);
            if (data.success && data.entry) {
                _currentDetail = data.entry;
                renderDetail(data.entry);
                updateDetailFooter(data.entry);
            }
            showToast('分析完成', 'success');
            loadEntries();
        } catch(e) {
            log('analyzeExisting ERROR', e.message || e);
            showToast('分析失败: ' + (e.message || '请稍后重试'), 'error');
            // Reload detail to restore state
            if (_currentDetailId) openDetail(_currentDetailId);
        }
    }

    function closeDetail() {
        var overlay = document.getElementById('expense-detail-overlay');
        if (overlay) overlay.style.display = 'none';
        _currentDetailId = null;
        _currentDetail = null;
    }

    async function deleteEntry() {
        if (!_currentDetailId) return;
        if (!confirm('确定删除这条记录？')) return;

        log('deleteEntry', _currentDetailId);
        try {
            var result = await API.deleteExpense(_currentDetailId);
            if (result.success) {
                closeDetail();
                showToast('已删除', 'success');
                loadEntries();
                loadTags();
            } else {
                showToast(result.message || '删除失败', 'error');
            }
        } catch(e) {
            log('deleteEntry ERROR', e.message || e);
            showToast('删除失败', 'error');
        }
    }

    function editEntry() {
        if (!_currentDetailId) return;
        // Find entry
        var entry = _entries.find(function(e) { return e.id === _currentDetailId; });
        if (!entry) return;

        log('editEntry', _currentDetailId);
        var detail = _currentDetail; // save detail before closeDetail clears it
        closeDetail();
        _editingId = _currentDetailId;
        _currency = entry.currency || 'CAD';
        _pendingPhotos = [];
        _previewData = null;

        var overlay = document.getElementById('expense-add-overlay');
        var amountInput = document.getElementById('expense-amount-input');
        var dateInput = document.getElementById('expense-date-input');
        var notesInput = document.getElementById('expense-notes-input');
        var photoGrid = document.getElementById('expense-photo-grid');

        if (amountInput) amountInput.value = entry.amount;
        if (dateInput) dateInput.value = entry.date;
        if (notesInput) notesInput.value = entry.notes || '';

        // Show existing photos as read-only thumbnails
        if (photoGrid) {
            photoGrid.innerHTML = '';
            if (detail && detail.photos && detail.photos.length > 0) {
                detail.photos.forEach(function(photo) {
                    var photoUrl = photo.storage_path ? '/api/uploads/' + photo.storage_path.split('/uploads/').pop() : '';
                    if (photoUrl) {
                        var thumb = document.createElement('div');
                        thumb.className = 'expense-photo-thumb expense-photo-existing';
                        var img = document.createElement('img');
                        img.src = photoUrl;
                        thumb.appendChild(img);
                        photoGrid.appendChild(thumb);
                    }
                });
            }
        }

        setModalState('input');
        renderCurrencyToggle();
        if (overlay) overlay.style.display = '';
    }

    // ===== Lightbox =====

    function showLightbox(url) {
        var lb = document.createElement('div');
        lb.className = 'expense-lightbox';
        lb.onclick = function() { lb.remove(); };
        var img = document.createElement('img');
        img.src = url;
        lb.appendChild(img);
        document.body.appendChild(lb);
    }

    // ===== Helpers =====

    function formatDate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function formatDateLabel(dateStr) {
        var today = formatDate(new Date());
        if (dateStr === today) return '今天';
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (dateStr === formatDate(yesterday)) return '昨天';
        // MM/DD or full date
        var parts = dateStr.split('-');
        return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== Currency =====

    function currencySymbol(c) {
        if (c === 'CNY') return '¥';
        if (c === 'CAD') return 'CA$';
        return '$';
    }

    function renderCurrencyToggle() {
        var container = document.getElementById('expense-currency-toggle');
        if (!container) return;
        container.innerHTML = ['CAD', 'CNY'].map(function(c) {
            return '<button class="expense-currency-btn' + (c === _currency ? ' active' : '') +
                '" onclick="Expense.setCurrency(\'' + c + '\')">' + c + '</button>';
        }).join('');
        // Update amount prefix
        var prefix = document.getElementById('expense-amount-prefix');
        if (prefix) prefix.textContent = currencySymbol(_currency);
    }

    function setCurrency(c) {
        _currency = c;
        renderCurrencyToggle();
    }

    async function loadRates() {
        if (_rates && Date.now() - _ratesTimestamp < 3600000) return;
        try {
            var rateResp = await fetch('/api/expenses/rates', { credentials: 'same-origin' });
            var data = await rateResp.json();
            if (data.success && data.rates) {
                _rates = data.rates;
                _ratesTimestamp = Date.now();
            }
        } catch (e) {
            _rates = { CAD: 1, CNY: 5.05 };
        }
    }

    function toggleAnalytics() {
        _analyticsMode = !_analyticsMode;
        log('toggleAnalytics', _analyticsMode);

        var btn = document.getElementById('expense-analytics-btn');
        var summary = document.getElementById('expense-summary');
        var tagsFilter = document.getElementById('expense-tags-filter');
        var list = document.getElementById('expense-list');
        var fab = document.getElementById('expense-fab');
        var periodTabs = document.querySelector('.expense-period-tabs');
        var dateNav = document.querySelector('.expense-date-nav');
        var analyticsView = document.getElementById('expense-analytics-view');

        if (_analyticsMode) {
            if (btn) btn.classList.add('active');
            if (summary) summary.style.display = 'none';
            if (tagsFilter) tagsFilter.style.display = 'none';
            if (list) list.style.display = 'none';
            if (fab) fab.style.display = 'none';
            if (periodTabs) periodTabs.style.display = 'none';
            if (dateNav) dateNav.style.display = 'none';
            if (analyticsView) analyticsView.style.display = '';
            if (typeof ExpenseAnalytics !== 'undefined') ExpenseAnalytics.init();
        } else {
            if (btn) btn.classList.remove('active');
            if (summary) summary.style.display = '';
            if (tagsFilter) tagsFilter.style.display = '';
            if (list) list.style.display = '';
            if (fab) fab.style.display = '';
            if (periodTabs) periodTabs.style.display = '';
            if (dateNav) dateNav.style.display = '';
            if (analyticsView) analyticsView.style.display = 'none';
            if (typeof ExpenseAnalytics !== 'undefined') ExpenseAnalytics.dispose();
        }
    }

    return {
        init: init,
        switchPeriod: switchPeriod,
        navigateDate: navigateDate,
        openAddModal: openAddModal,
        closeAddModal: closeAddModal,
        handlePhotoSelect: handlePhotoSelect,
        submitEntry: submitEntry,
        openDetail: openDetail,
        closeDetail: closeDetail,
        deleteEntry: deleteEntry,
        editEntry: editEntry,
        toggleTag: toggleTag,
        showLightbox: showLightbox,
        analyzeExisting: analyzeExisting,
        startParse: startParse,
        savePreview: savePreview,
        retakePhotos: retakePhotos,
        setSplitMode: setSplitMode,
        setCurrency: setCurrency,
        toggleAnalytics: toggleAnalytics,
        getCurrentDetailId: function() { return _currentDetailId; },
    };
})();
