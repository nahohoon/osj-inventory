/**
 * QR/바코드 라벨 출력 — 프린텍 2×6 / 3×8
 * LabelPrint.init({ getMasterItems, slotsKey, onToast })
 * OSJ 품목마스터: code / name / spec / unit / category
 * QR 데이터 = slot.b (품목코드만)
 */
console.log('[LP] label-print.js version = 20260522-fix-preset-sync-autocomplete');

var LabelPrint = (function () {

  /* ── 내부 상태 ── */
  var SLOTS     = [];
  var _getItems = null;
  var _slotsKey = '';
  var _onToast  = null;
  var _loaded   = false;
  var _mt       = null;

  function _log() {
    try { console.log.apply(console, ['[LP]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
  }

  /* ════════════════════════════════════════
     프리셋 (LABEL_PRESETS)
  ════════════════════════════════════════ */
  var LABEL_PRESETS = {
    '2x6':  { cols:2, rows:6,  qrSize:84, nameFont:12, codeFont:10, specFont:8,  padding:5 },
    '3x8':  { cols:3, rows:8,  qrSize:52, nameFont:9,  codeFont:8,  specFont:7,  padding:3 },
    large:  { cols:2, rows:4,  qrSize:96, nameFont:13, codeFont:11, specFont:9,  padding:6 },
    normal: { cols:2, rows:6,  qrSize:84, nameFont:12, codeFont:10, specFont:8,  padding:5 },
    small:  { cols:3, rows:8,  qrSize:52, nameFont:9,  codeFont:8,  specFont:7,  padding:3 },
    tiny:   { cols:4, rows:10, qrSize:42, nameFont:5,  codeFont:4.5,specFont:4,  padding:1 }
  };

  var PRESET_LS_KEY = 'osj_label_preset';

  /**
   * SELECT 요소가 있으면 반드시 SELECT 값을 우선한다.
   * (localStorage 값이 남아 있어도 SELECT가 더 최신)
   */
  function getCurrentPresetKey() {
    var el = document.getElementById('labelPreset');
    if (el && el.value) {
      return el.value;   /* '2x6' 또는 '3x8' */
    }
    return localStorage.getItem(PRESET_LS_KEY) || '2x6';
  }

  function getCurrentPreset() {
    var key = getCurrentPresetKey();
    return LABEL_PRESETS[key] || LABEL_PRESETS['2x6'];
  }

  function getTotalSlots() {
    var p = getCurrentPreset();
    return (p.cols || 2) * (p.rows || 6);
  }

  function ensureLabelSlots() {
    var total = getTotalSlots();
    if (!Array.isArray(SLOTS)) SLOTS = [];
    while (SLOTS.length < total) SLOTS.push(null);
    if (SLOTS.length > total)   SLOTS = SLOTS.slice(0, total);
    _log('ensureLabelSlots total=', total, 'length=', SLOTS.length);
  }

  /* ── CSS 변수 + data-label-sheet 강제 설정 ── */
  function _applyVars() {
    var key    = getCurrentPresetKey();
    var preset = LABEL_PRESETS[key] || LABEL_PRESETS['2x6'];
    /* .label-print 가 없으면 #tab-label 사용 */
    var root = document.querySelector('.label-print') ||
               document.getElementById('tab-label');
    if (!root) { _log('_applyVars: root element NOT FOUND'); return; }

    root.setAttribute('data-label-sheet', key);
    root.classList.toggle('compact', key === '3x8');
    root.style.setProperty('--label-cols',         preset.cols);
    root.style.setProperty('--label-rows',         preset.rows);
    root.style.setProperty('--label-qr-size',      preset.qrSize   + 'px');
    root.style.setProperty('--label-name-font',    preset.nameFont + 'pt');
    root.style.setProperty('--label-code-font',    preset.codeFont + 'pt');
    root.style.setProperty('--label-spec-font',    preset.specFont + 'pt');
    root.style.setProperty('--label-card-padding', preset.padding  + 'pt');
    _log('_applyVars data-label-sheet=', key, 'cols=', preset.cols, 'rows=', preset.rows);
  }

  function _onPresetChange() {
    var key = getCurrentPresetKey();
    localStorage.setItem(PRESET_LS_KEY, key);
    _log('preset changed =', key, 'total=', getTotalSlots());
    ensureLabelSlots();
    _applyVars();
    _buildSS();
    renderGrid();
    _updCnt();
  }

  function _initPresetSelect() {
    var el = document.getElementById('labelPreset');
    if (!el) return;
    var saved = localStorage.getItem(PRESET_LS_KEY) || '2x6';
    el.value = LABEL_PRESETS[saved] ? saved : '2x6';
    _log('_initPresetSelect: value=', el.value);
  }

  /* ════════════════════════════════════════
     품목 데이터
  ════════════════════════════════════════ */
  function _toLabel(row) {
    if (!row) return null;
    var b = String(row.code || row.barcode || row.itemCode || row.item_code || row['품목코드'] || '').trim();
    var n = String(row.name || row.itemName || row.item_name || row['품목명'] || '').trim();
    if (!b && !n) return null;
    return {
      b: b || n,
      n: n || b,
      s: String(row.spec  || row.model    || row['규격']    || '').trim(),
      u: String(row.unit  || row['단위']  || 'EA').trim(),
      c: String(row.category || row.cat  || row['분류']    || '').trim()
    };
  }

  function getAllItems() {
    if (typeof _getItems !== 'function') {
      _log('getAllItems: _getItems NOT a function');
      return [];
    }
    var rows = _getItems() || [];
    _log('getAllItems: raw rows =', rows.length,
         rows.length ? ('sample=' + JSON.stringify(rows[0])) : '(EMPTY)');
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var item = _toLabel(rows[i]);
      if (item) result.push(item);
      else _log('getAllItems: row[' + i + '] skipped =', JSON.stringify(rows[i]));
    }
    _log('getAllItems: usable =', result.length);
    return result;
  }

  function _queryItems(v) {
    if (!v || !v.trim()) return [];
    var lower = v.trim().toLowerCase();
    var all   = getAllItems();
    var res   = all.filter(function(it) {
      return (it.b || '').toLowerCase().indexOf(lower) >= 0 ||
             (it.n || '').toLowerCase().indexOf(lower) >= 0 ||
             (it.s || '').toLowerCase().indexOf(lower) >= 0 ||
             (it.c || '').toLowerCase().indexOf(lower) >= 0;
    }).slice(0, 25);
    _log('_queryItems("' + v + '"): matched', res.length, '/ total', all.length);
    return res;
  }

  /* ════════════════════════════════════════
     직접 입력 추가 (Enter 키)
  ════════════════════════════════════════ */
  function pickFirstOrDirect(value) {
    var v = String(value || '').trim();
    _log('pickFirstOrDirect: v="' + v + '"');
    if (!v) return;

    var items = getAllItems();
    _log('pickFirstOrDirect: total items=', items.length);

    var exact = null;
    for (var i = 0; i < items.length; i++) {
      if ((items[i].b || '').toLowerCase() === v.toLowerCase()) { exact = items[i]; break; }
    }
    if (!exact) {
      for (var j = 0; j < items.length; j++) {
        if ((items[j].n || '').toLowerCase() === v.toLowerCase()) { exact = items[j]; break; }
      }
    }
    if (!exact) {
      var matches = _queryItems(v);
      if (matches.length) exact = matches[0];
    }

    if (exact) {
      _pick(exact);
    } else {
      _log('pickFirstOrDirect: no match');
      if (typeof _onToast === 'function') _onToast('일치하는 품목 없음: ' + v);
      else alert('일치하는 품목이 없습니다: ' + v);
    }
  }

  /* ════════════════════════════════════════
     유틸리티
  ════════════════════════════════════════ */
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
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
        var n = getTotalSlots(); SLOTS = [];
        for (var i = 0; i < n; i++) SLOTS.push(parsed[i] || null);
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

  function _updCnt() {
    var n      = getTotalSlots();
    var filled = SLOTS.filter(function(s) { return !!s; }).length;
    var badge  = document.getElementById('label-slot-badge');
    var cnt    = document.getElementById('label-item-cnt');
    if (badge) badge.textContent = filled + '/' + n + ' 슬롯';
    if (cnt)   cnt.textContent   = getAllItems().length;
  }

  function _makeQR(container, code) {
    var size = getCurrentPreset().qrSize || 84;
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: code || ' ', width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) { container.textContent = 'QR'; }
  }

  /* ════════════════════════════════════════
     자동완성 UI
  ════════════════════════════════════════ */
  function _hideSugg() {
    var sugg = document.getElementById('label-sugg');
    if (sugg) sugg.style.display = 'none';
  }

  /* v: 검색어 문자열 */
  function _onSearch(v) {
    var q    = document.getElementById('label-q');
    var sugg = document.getElementById('label-sugg');
    _log('_onSearch fired: v="' + v + '" q=', !!q, 'sugg=', !!sugg);

    if (!sugg) { _log('ERROR: #label-sugg NOT FOUND'); return; }

    var term = String(v || '').trim();
    if (!term) { sugg.style.display = 'none'; return; }

    var res = _queryItems(term);
    if (!res.length) { sugg.style.display = 'none'; return; }

    /* position:fixed — overflow:hidden 부모 완전 우회 */
    if (q) {
      try {
        var rect = q.getBoundingClientRect();
        sugg.style.position = 'fixed';
        sugg.style.top      = rect.bottom + 'px';
        sugg.style.left     = rect.left   + 'px';
        sugg.style.width    = rect.width  + 'px';
        sugg.style.right    = 'auto';
        sugg.style.zIndex   = '99999';
      } catch(e) {}
    }

    sugg.innerHTML = '';
    res.forEach(function(it) {
      var row = document.createElement('div');
      row.className = 'lp-si';
      row.innerHTML =
        '<span class="lp-sm">' + _esc(it.b) + '</span>' +
        '<span>'               + _esc(it.n) + '</span>' +
        (it.s ? '<span style="font-size:11px;color:#888">' + _esc(it.s) + '</span>' : '');
      /* mousedown: input blur 전에 실행되므로 클릭이 씹히지 않음 */
      row.onmousedown = (function(item) {
        return function(e) { e.preventDefault(); _pick(item); };
      })(it);
      sugg.appendChild(row);
    });
    sugg.style.display = 'block';
    _log('_onSearch: sugg shown with', res.length, 'items');
  }

  /* ════════════════════════════════════════
     슬롯에 품목 추가
  ════════════════════════════════════════ */
  function _pick(item) {
    var n     = getTotalSlots();
    var qty   = parseInt((document.getElementById('label-qty') || {}).value || '1', 10) || 1;
    var ssVal = parseInt((document.getElementById('label-ss')  || {}).value || '0', 10) || 0;
    var start;
    if (!ssVal) {
      var last = -1;
      for (var i = 0; i < n; i++) { if (SLOTS[i]) last = i; }
      start = last + 2;
      if (start > n) start = 1;
    } else { start = ssVal; }
    var added = 0, idx = start - 1;
    while (added < qty && idx < n) { SLOTS[idx] = item; added++; idx++; }
    renderGrid(); _saveSlots();
    _showMsg(added + '장 추가: ' + (item.n || item.b));
    var q = document.getElementById('label-q');
    if (q) q.value = '';
    _hideSugg();
    _log('_pick done: added=', added, 'b=', item.b, 'n=', item.n);
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
        var img = document.createElement('img');
        img.src = cvs.toDataURL('image/png'); img.alt = ''; p.appendChild(img);
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

  /* ════════════════════════════════════════
     이벤트 바인딩
     dataset.lpBound 제거 → oninput/onclick 직접 할당
     (덮어쓰기 방식 — 중복 무관, 항상 최신 핸들러 보장)
  ════════════════════════════════════════ */
  function _bindEvents() {
    var q       = document.getElementById('label-q');
    var sugg    = document.getElementById('label-sugg');
    var presetEl= document.getElementById('labelPreset');
    var btnP    = document.getElementById('label-btn-print');
    var btnC    = document.getElementById('label-btn-clear');

    _log('bindEvents: q=', !!q, 'sugg=', !!sugg, 'preset=', !!presetEl,
         'btnP=', !!btnP, 'btnC=', !!btnC);

    if (q) {
      /* 직접 할당 — 언제 init이 호출돼도 항상 최신 핸들러로 교체 */
      q.oninput = function() { _onSearch(q.value); };
      q.onkeydown = function(e) {
        if (e.key === 'Enter')  { e.preventDefault(); pickFirstOrDirect(q.value); }
        if (e.key === 'Escape') { _hideSugg(); }
      };
      _log('bindEvents: oninput/onkeydown set on #' + q.id);
    } else {
      _log('bindEvents: ERROR — #label-q NOT FOUND in DOM');
    }

    if (presetEl) { presetEl.onchange = _onPresetChange; }
    if (btnP)     { btnP.onclick = _print; }
    if (btnC)     { btnC.onclick = _clearAll; }

    /* 추천 목록 바깥 클릭 시 닫기 */
    document.onclick = function(e) {
      var t = e.target;
      var inside = t.closest ? t.closest('.lp-sw') : false;
      if (!inside) _hideSugg();
    };
  }

  /* ════════════════════════════════════════
     그리드 렌더링
  ════════════════════════════════════════ */
  function renderGrid() {
    ensureLabelSlots();
    _applyVars();
    _buildSS();

    var grid = document.getElementById('label-grid');
    if (!grid) { _log('renderGrid: #label-grid NOT FOUND'); return; }

    var key    = getCurrentPresetKey();
    var preset = LABEL_PRESETS[key] || LABEL_PRESETS['2x6'];
    var n      = getTotalSlots();

    /* CSS grid 직접 강제 — CSS 파일에만 의존하지 않음 */
    grid.style.gridTemplateColumns = 'repeat(' + preset.cols + ', 1fr)';
    grid.dataset.sheet = key;

    _log('renderGrid: key=', key, 'cols=', preset.cols, 'rows=', preset.rows, 'total=', n);

    grid.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var slot = SLOTS[i];
      var card = document.createElement('div');
      card.className = 'lc' + (slot ? '' : ' empty') + (key === '3x8' ? ' compact' : '');

      var sno = document.createElement('div');
      sno.className = 'sno'; sno.textContent = '#' + (i + 1);
      card.appendChild(sno);

      if (slot) {
        var rm = document.createElement('button');
        rm.className = 'brm'; rm.innerHTML = '&#10005;';
        (function(idx) { rm.onclick = function(e) { e.stopPropagation(); SLOTS[idx]=null; renderGrid(); _saveSlots(); }; })(i);
        card.appendChild(rm);

        var qb = document.createElement('div'); qb.className = 'qb';
        card.appendChild(qb);

        var li = document.createElement('div'); li.className = 'li';
        if (key === '3x8') {
          li.innerHTML =
            '<div class="ln compact-name">' + _esc(slot.n) + '</div>' +
            '<div class="lb compact-code">' + _esc(slot.b) + '</div>';
        } else {
          li.innerHTML =
            '<div class="lbr">' + (slot.u ? '<span class="lu">' + _esc(slot.u) + '</span>' : '') + '</div>' +
            '<div class="ln">'  + _esc(slot.n) + '</div>' +
            (slot.s ? '<div class="ls">' + _esc(slot.s) + '</div>' : '') +
            '<div class="lb">'  + _esc(slot.b) + '</div>';
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

  /* ════════════════════════════════════════
     공개 API
  ════════════════════════════════════════ */
  return {
    init: function(opts) {
      _getItems = opts.getMasterItems || opts.getItems || null;
      _slotsKey = opts.slotsKey || '';
      _onToast  = opts.onToast  || null;

      _log('init() _getItems=', typeof _getItems,
           'masterCount=', typeof _getItems === 'function' ? (_getItems() || []).length : 'N/A',
           '_loaded=', _loaded);

      if (!_loaded) {
        _initPresetSelect();
        _loadSlots();
        _loaded = true;
      }

      _bindEvents();     /* 매번 호출 — 직접 할당이므로 중복 무관 */
      ensureLabelSlots();
      renderGrid();
    },

    renderGrid:        renderGrid,
    onPresetChange:    _onPresetChange,
    getCurrentPreset:  getCurrentPreset,
    getCurrentPresetKey: getCurrentPresetKey,
    getTotalSlots:     getTotalSlots,
    ensureLabelSlots:  ensureLabelSlots,
    pickFirstOrDirect: pickFirstOrDirect,

    refresh: function() {
      var map = {};
      getAllItems().forEach(function(it) { if(it.b) map[it.b] = it; });
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
