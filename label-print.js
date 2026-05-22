/**
 * QR/바코드 라벨 출력 — 프린텍 2×6 / 3×8 프리셋
 * LabelPrint.init({ getMasterItems, slotsKey, onToast })
 *
 * OSJ 품목마스터 키: code / name / spec / unit / category
 * QR 데이터: slot.b = 품목코드만
 */
var LabelPrint = (function() {
  var SLOTS       = [];
  var _getItems   = null;
  var _slotsKey   = '';
  var _onToast    = null;
  var _loaded     = false;
  var _clickBound = false;
  var _mt         = null;

  /* ── 디버그 로그 (콘솔에서 확인) ── */
  function _dbg() {
    if (typeof console !== 'undefined' && console.log) {
      console.log.apply(console, ['[LP]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  /* ── 프리셋 정의 ── */
  var LABEL_PRESETS = {
    '2x6':  { cols: 2, rows: 6, qrSize: 84, nameFont: 12, codeFont: 10, specFont: 8, padding: 5 },
    '3x8':  { cols: 3, rows: 8, qrSize: 52, nameFont: 9,  codeFont: 8,  specFont: 7, padding: 3 },
    large:  { cols: 2, rows: 4, qrSize: 96, nameFont: 13, codeFont: 11, specFont: 9, padding: 6 },
    normal: { cols: 2, rows: 6, qrSize: 84, nameFont: 12, codeFont: 10, specFont: 8, padding: 5 },
    small:  { cols: 3, rows: 8, qrSize: 52, nameFont: 9,  codeFont: 8,  specFont: 7, padding: 3 },
    tiny:   { cols: 4, rows: 10, qrSize: 42, nameFont: 5, codeFont: 4.5, specFont: 4, padding: 1 }
  };

  function _cfgKey() {
    if (typeof CONFIG !== 'undefined' && CONFIG.CLIENT_ID) return CONFIG.CLIENT_ID + '_label_config';
    return 'osj_label_config';
  }

  function getCurrentPreset() {
    var el = document.getElementById('labelPreset');
    if (el) {
      if (el.value === '3x8') return '3x8';
      if (el.value === '2x6') return '2x6';
    }
    try {
      var o = JSON.parse(localStorage.getItem(_cfgKey()) || 'null');
      if (o && (o.preset === '3x8' || o.preset === 'small' ||
          (Number(o.cols) === 3 && Number(o.rows) === 8))) return '3x8';
    } catch(e) {}
    return '2x6';
  }

  function getTotalSlots() { return getCurrentPreset() === '3x8' ? 24 : 12; }

  function ensureLabelSlots() {
    var n = getTotalSlots();
    if (!Array.isArray(SLOTS) || SLOTS.length !== n) {
      var next = [];
      for (var i = 0; i < n; i++) next.push(SLOTS[i] || null);
      SLOTS = next;
      _saveSlots();
    }
  }

  function getLabelConfig() {
    var preset = getCurrentPreset();
    var base   = LABEL_PRESETS[preset] || LABEL_PRESETS['2x6'];
    try {
      var o = JSON.parse(localStorage.getItem(_cfgKey()) || 'null');
      if (o && Number(o.cols) > 0 && Number(o.rows) > 0) {
        var match = (o.preset === preset) ||
          (preset === '2x6' && (o.preset === 'normal' || (Number(o.cols) === 2 && Number(o.rows) === 6))) ||
          (preset === '3x8' && (o.preset === 'small'  || (Number(o.cols) === 3 && Number(o.rows) === 8)));
        if (match) base = o;
      }
    } catch(e) {}
    var cols   = Math.max(1, parseInt(base.cols,   10) || LABEL_PRESETS[preset].cols);
    var rows   = Math.max(1, parseInt(base.rows,   10) || LABEL_PRESETS[preset].rows);
    var qrSize = Math.max(32, parseInt(base.qrSize, 10) || LABEL_PRESETS[preset].qrSize);
    return {
      cols: cols, rows: rows, qrSize: qrSize,
      nameFont: parseFloat(base.nameFont) || LABEL_PRESETS[preset].nameFont,
      codeFont: parseFloat(base.codeFont) || LABEL_PRESETS[preset].codeFont,
      specFont: parseFloat(base.specFont) || LABEL_PRESETS[preset].specFont,
      padding:  parseFloat(base.padding)  || LABEL_PRESETS[preset].padding,
      slotCount: cols * rows, preset: preset
    };
  }

  /* ── OSJ 마스터 행 → 라벨 구조 변환 ── */
  function _toLabel(row) {
    if (!row) return null;
    var b = String(row.code || row.barcode || row.itemCode || row.item_code || row['품목코드'] || '').trim();
    var n = String(row.name || row.itemName || row.item_name || row['품목명'] || '').trim();
    if (!b || !n) return null;
    return {
      b: b,
      n: n,
      s: String(row.spec     || row.model   || row['규격']     || '').trim(),
      u: String(row.unit     || row['단위']  || 'EA').trim(),
      c: String(row.category || row.cat     || row['분류']     || row['카테고리'] || '').trim()
    };
  }

  /* ── 전체 품목 조회 ── */
  function getAllItems() {
    if (typeof _getItems !== 'function') {
      _dbg('getAllItems: _getItems is NOT a function', typeof _getItems);
      return [];
    }
    var rows = _getItems() || [];
    _dbg('getAllItems: getMaster() returned', rows.length, 'rows');
    if (rows.length > 0) _dbg('getAllItems: first row =', JSON.stringify(rows[0]));
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var item = _toLabel(rows[i]);
      if (item) result.push(item);
    }
    _dbg('getAllItems: after toLabel filter =', result.length, 'items');
    return result;
  }

  /* ── HTML 이스케이프 ── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _showMsg(txt) {
    var el = document.getElementById('label-msg');
    if (!el) { if (typeof _onToast === 'function') _onToast(txt); return; }
    el.textContent = txt;
    el.style.display = 'block';
    clearTimeout(_mt);
    _mt = setTimeout(function() { el.style.display = 'none'; }, 3500);
  }

  function _loadSlots() {
    if (!_slotsKey) return;
    try {
      var parsed = JSON.parse(localStorage.getItem(_slotsKey) || 'null');
      if (Array.isArray(parsed)) {
        var n = getTotalSlots();
        var next = [];
        for (var i = 0; i < n; i++) next.push(parsed[i] || null);
        SLOTS = next;
      }
    } catch(e) {}
  }

  function _saveSlots() {
    if (!_slotsKey) return;
    try { localStorage.setItem(_slotsKey, JSON.stringify(SLOTS)); } catch(e) {}
  }

  function _buildSS() {
    var ss = document.getElementById('label-ss');
    if (!ss) return;
    var n = getTotalSlots(), cur = ss.value;
    ss.innerHTML = '<option value="0">자동</option>';
    for (var i = 1; i <= n; i++) {
      var opt = document.createElement('option');
      opt.value = String(i); opt.textContent = '#' + i;
      ss.appendChild(opt);
    }
    ss.value = (cur && parseInt(cur,10) > 0 && parseInt(cur,10) <= n) ? cur : '0';
  }

  function _applyVars() {
    var lc     = getLabelConfig();
    var preset = getCurrentPreset();
    var root   = document.getElementById('labelPrintRoot') || document.querySelector('.label-print');
    if (!root) return;
    root.setAttribute('data-label-sheet', preset);
    root.style.setProperty('--label-cols',      lc.cols);
    root.style.setProperty('--label-rows',      lc.rows);
    root.style.setProperty('--label-qr-size',   lc.qrSize   + 'px');
    root.style.setProperty('--label-name-font', lc.nameFont + 'pt');
    root.style.setProperty('--label-code-font', lc.codeFont + 'pt');
    root.style.setProperty('--label-spec-font', lc.specFont + 'pt');
    root.style.setProperty('--label-card-padding', lc.padding + 'pt');
    root.classList.toggle('compact', preset === '3x8');
  }

  function _updCnt() {
    var n      = getTotalSlots();
    var filled = SLOTS.filter(function(s) { return !!s; }).length;
    var badge  = document.getElementById('label-slot-badge');
    var cnt    = document.getElementById('label-item-cnt');
    if (badge) badge.textContent = filled + '/' + n + ' 슬롯';
    if (cnt)   cnt.textContent   = getAllItems().length;
  }

  function _makeQR(container, code) {
    var size = getLabelConfig().qrSize;
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: code || ' ', width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) { container.textContent = 'QR'; }
  }

  /* ────────────────────────────────────────
     자동완성 검색
  ──────────────────────────────────────── */
  function _queryItems(v) {
    if (!v) return [];
    var all   = getAllItems();
    var lower = v.toLowerCase();
    var res   = all.filter(function(it) {
      return it.b.toLowerCase().indexOf(lower) >= 0 ||
             it.n.toLowerCase().indexOf(lower) >= 0 ||
             (it.s || '').toLowerCase().indexOf(lower) >= 0 ||
             (it.c || '').toLowerCase().indexOf(lower) >= 0;
    }).slice(0, 25);
    _dbg('_queryItems("' + v + '"): matched', res.length, '/ total', all.length);
    return res;
  }

  function _hideSugg() {
    var sugg = document.getElementById('label-sugg');
    if (sugg) sugg.style.display = 'none';
  }

  /* 검색 입력 핸들러 */
  function _onSearch() {
    var q    = document.getElementById('label-q');
    var sugg = document.getElementById('label-sugg');

    _dbg('_onSearch fired. q=', !!q, ' sugg=', !!sugg,
         ' value=', q ? q.value : 'N/A');

    if (!sugg) {
      _dbg('ERROR: #label-sugg element NOT FOUND in DOM');
      return;
    }

    var v = (q ? q.value : '').trim();
    if (!v) { sugg.style.display = 'none'; return; }

    var res = _queryItems(v);
    _dbg('_onSearch results:', res.length, ' first=', res[0] ? JSON.stringify(res[0]) : 'none');

    if (!res.length) { sugg.style.display = 'none'; return; }

    /* ── overflow:hidden 부모 우회: position:fixed + getBoundingClientRect ── */
    if (q) {
      var rect = q.getBoundingClientRect();
      sugg.style.position = 'fixed';
      sugg.style.top      = rect.bottom + 'px';
      sugg.style.left     = rect.left   + 'px';
      sugg.style.width    = rect.width  + 'px';
      sugg.style.right    = 'auto';
      sugg.style.zIndex   = '99999';
      _dbg('_onSearch: fixed position set. top=', rect.bottom, 'left=', rect.left, 'width=', rect.width);
    }

    sugg.innerHTML = '';
    res.forEach(function(it) {
      var row = document.createElement('div');
      row.className = 'lp-si';
      row.innerHTML =
        '<span class="lp-sm">' + _esc(it.b) + '</span>' +
        '<span>' + _esc(it.n) + '</span>' +
        (it.s ? '<span style="font-size:11px;color:#888">' + _esc(it.s) + '</span>' : '');
      (function(item) { row.onclick = function(e) { e.stopPropagation(); _pick(item); }; })(it);
      sugg.appendChild(row);
    });

    sugg.style.display = 'block';
    _dbg('_onSearch: sugg.style.display=block done. innerHTML.length=', sugg.innerHTML.length,
         ' computed=', window.getComputedStyle ? window.getComputedStyle(sugg).display : 'N/A');
  }

  function _onKeydown(e) {
    var q = document.getElementById('label-q');
    if (e.key === 'Enter') {
      var v = q ? q.value.trim() : '';
      var r = _queryItems(v);
      if (r.length) _pick(r[0]);
    }
    if (e.key === 'Escape') _hideSugg();
  }

  function _pick(item) {
    var n     = getTotalSlots();
    var qty   = parseInt((document.getElementById('label-qty') || {}).value || '1', 10) || 1;
    var ssVal = parseInt((document.getElementById('label-ss')  || {}).value || '0', 10) || 0;
    var start;
    if (!ssVal) {
      var last = -1;
      for (var i = 0; i < n; i++) { if (SLOTS[i]) last = i; }
      start = last + 2; if (start > n) start = 1;
    } else { start = ssVal; }
    var added = 0, idx = start - 1;
    while (added < qty && idx < n) { SLOTS[idx] = item; added++; idx++; }
    renderGrid(); _saveSlots();
    _showMsg(added + '장 추가: ' + item.n);
    var q = document.getElementById('label-q');
    if (q) q.value = '';
    _hideSugg();
  }

  function _clearAll() {
    var n = getTotalSlots(); SLOTS = [];
    for (var i = 0; i < n; i++) SLOTS.push(null);
    renderGrid(); _saveSlots(); _showMsg('전체 초기화');
  }

  function _print() {
    if (SLOTS.every(function(s) { return !s; })) { _showMsg('슬롯에 품목을 먼저 추가하세요'); return; }
    _applyVars();
    document.body.classList.add('label-printing');
    document.documentElement.classList.add('label-printing');
    document.querySelectorAll('#label-grid .qb canvas').forEach(function(cvs) {
      var p = cvs.parentNode;
      if (p && !p.querySelector('img')) {
        var img = document.createElement('img'); img.src = cvs.toDataURL('image/png'); img.alt = '';
        p.appendChild(img);
      }
    });
    setTimeout(function() {
      window.print();
      setTimeout(function() {
        document.body.classList.remove('label-printing');
        document.documentElement.classList.remove('label-printing');
      }, 500);
    }, 300);
  }

  /* ────────────────────────────────────────
     이벤트 바인딩 (init마다 호출, 요소별 dedup)
  ──────────────────────────────────────── */
  function _bindEvents() {
    /* ① 검색 입력 */
    var q = document.getElementById('label-q');
    _dbg('_bindEvents: #label-q =', !!q,
         q ? ('already bound=' + (q.dataset.lpBound || 'no')) : '');
    if (q && !q.dataset.lpBound) {
      q.dataset.lpBound = '1';
      q.addEventListener('input',   _onSearch);
      q.addEventListener('keydown', _onKeydown);
      _dbg('_bindEvents: input event bound to #label-q');
    }

    /* ② 문서 클릭으로 제안 닫기 */
    if (!_clickBound) {
      _clickBound = true;
      document.addEventListener('click', function(e) {
        var t = e.target;
        var inside = t.closest ? t.closest('.lp-sw') : null;
        if (!inside) _hideSugg();
      });
    }

    /* ③ 버튼 */
    var btnP = document.getElementById('label-btn-print');
    var btnC = document.getElementById('label-btn-clear');
    if (btnP && !btnP.dataset.lpBound) { btnP.dataset.lpBound = '1'; btnP.addEventListener('click', _print);    }
    if (btnC && !btnC.dataset.lpBound) { btnC.dataset.lpBound = '1'; btnC.addEventListener('click', _clearAll); }

    /* ④ 프리셋 select */
    var ps = document.getElementById('labelPreset');
    if (ps && !ps.dataset.lpBound) { ps.dataset.lpBound = '1'; ps.addEventListener('change', _onPresetChange); }
  }

  /* ────────────────────────────────────────
     그리드 렌더링
  ──────────────────────────────────────── */
  function renderGrid() {
    ensureLabelSlots();
    _applyVars();
    _buildSS();

    var grid = document.querySelector('#tab-label #label-grid') || document.getElementById('label-grid');
    if (!grid) { _dbg('renderGrid: #label-grid NOT FOUND'); return; }

    var preset = getCurrentPreset();
    var n      = getTotalSlots();
    grid.innerHTML = '';

    for (var i = 0; i < n; i++) {
      var slot = SLOTS[i];
      var card = document.createElement('div');
      card.className = 'lc' + (slot ? '' : ' empty') + (preset === '3x8' ? ' compact' : '');

      var sno = document.createElement('div');
      sno.className = 'sno'; sno.textContent = '#' + (i + 1);
      card.appendChild(sno);

      if (slot) {
        var rm = document.createElement('button');
        rm.className = 'brm'; rm.innerHTML = '&#10005;';
        (function(idx) { rm.onclick = function() { SLOTS[idx] = null; renderGrid(); _saveSlots(); }; })(i);
        card.appendChild(rm);

        var qb = document.createElement('div'); qb.className = 'qb'; card.appendChild(qb);

        var li = document.createElement('div'); li.className = 'li';
        if (preset === '3x8') {
          li.innerHTML = '<div class="ln compact-name">' + _esc(slot.n) + '</div>' +
                         '<div class="lb compact-code">' + _esc(slot.b) + '</div>';
        } else {
          li.innerHTML =
            '<div class="lbr">' + (slot.u ? '<span class="lu">' + _esc(slot.u) + '</span>' : '') + '</div>' +
            '<div class="ln">' + _esc(slot.n) + '</div>' +
            (slot.s ? '<div class="ls">' + _esc(slot.s) + '</div>' : '') +
            '<div class="lb">' + _esc(slot.b) + '</div>';
        }
        card.appendChild(li);
        (function(el, code, delay) {
          setTimeout(function() { _makeQR(el, code); }, delay);
        })(qb, slot.b, i * 40);
      } else {
        var et = document.createElement('div'); et.className = 'et'; et.textContent = '빈 슬롯';
        card.appendChild(et);
      }
      grid.appendChild(card);
    }
    _updCnt();
  }

  /* ── labelPreset 변경 처리 ── */
  function _onPresetChange() {
    var preset = getCurrentPreset();
    var setEl  = document.getElementById('setLabelPreset');
    if (setEl) setEl.value = (preset === '3x8') ? 'small' : 'normal';
    try {
      localStorage.setItem(_cfgKey(), JSON.stringify(
        Object.assign({ preset: preset }, LABEL_PRESETS[preset])
      ));
    } catch(e) {}
    ensureLabelSlots();
    renderGrid();
  }

  function _initPresetSelect() {
    var el = document.getElementById('labelPreset');
    if (!el) return;
    var preset = '2x6';
    try {
      var o = JSON.parse(localStorage.getItem(_cfgKey()) || 'null');
      if (o && (o.preset === '3x8' || o.preset === 'small' ||
          (Number(o.cols) === 3 && Number(o.rows) === 8))) preset = '3x8';
    } catch(e) {}
    el.value = preset;
  }

  /* ═══════════════════════════════════════
     공개 API
  ═══════════════════════════════════════ */
  return {
    init: function(opts) {
      _getItems = opts.getMasterItems || opts.getItems || null;
      _slotsKey = opts.slotsKey || '';
      _onToast  = opts.onToast  || null;

      _dbg('init() called. _getItems type=', typeof _getItems,
           ' _loaded=', _loaded);

      if (!_loaded) {
        _initPresetSelect();
        _loadSlots();
        _loaded = true;
      }

      /* 매 init마다 bindEvents — 내부에서 중복 방지 */
      _bindEvents();

      ensureLabelSlots();
      renderGrid();

      _dbg('init() done. preset=', getCurrentPreset(),
           ' slots=', getTotalSlots(),
           ' masterItems=', (typeof _getItems === 'function' ? (_getItems() || []).length : 'N/A'));
    },

    renderGrid:       renderGrid,
    onPresetChange:   _onPresetChange,
    getCurrentPreset: getCurrentPreset,
    getTotalSlots:    getTotalSlots,
    ensureLabelSlots: ensureLabelSlots,

    refresh: function() {
      var map = {};
      getAllItems().forEach(function(it) { map[it.b] = it; });
      var changed = false;
      SLOTS = SLOTS.map(function(s) {
        if (!s) return null;
        if (!map[s.b]) { changed = true; return null; }
        return map[s.b];
      });
      if (changed) _saveSlots();
      renderGrid();
    },

    clearSlots: _clearAll
  };
})();
