/**
 * QR/바코드 라벨 출력 — 프린텍 2×6 / 3×8
 * LabelPrint.init({ getMasterItems, slotsKey, onToast })
 * OSJ 품목마스터: code / name / spec / unit / category
 * QR 데이터 = slot.b (품목코드만)
 */
console.log('[LP] label-print.js version = 20260522-final-autocomplete-pick-debug');

var LabelPrint = (function () {

  /* ── 내부 상태 ── */
  var SLOTS       = [];
  var _slotsKey   = '';
  var _onToast    = null;
  var _loaded     = false;
  var _mt         = null;

  var LABEL_PRESETS = {
    '2x6': { cols:2, rows:6,  qrSize:84, nameFont:12, codeFont:10, specFont:8,  padding:5 },
    '3x8': { cols:3, rows:8,  qrSize:52, nameFont:9,  codeFont:8,  specFont:7,  padding:3 }
  };
  var PRESET_LS_KEY = 'osj_label_preset';

  /* ════════════════════════════════════════
     프리셋
  ════════════════════════════════════════ */
  function getCurrentPresetKey() {
    var el = document.getElementById('labelPreset');
    if (el && el.value) return el.value;
    return localStorage.getItem(PRESET_LS_KEY) || '2x6';
  }
  function getCurrentPreset() {
    return LABEL_PRESETS[getCurrentPresetKey()] || LABEL_PRESETS['2x6'];
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
    console.log('[LP] ensureLabelSlots total=', total, 'SLOTS.length=', SLOTS.length);
  }
  function _applyVars() {
    var key    = getCurrentPresetKey();
    var preset = LABEL_PRESETS[key] || LABEL_PRESETS['2x6'];
    var root   = document.querySelector('.label-print') ||
                 document.getElementById('tab-label');
    if (!root) return;
    root.setAttribute('data-label-sheet', key);
    root.classList.toggle('compact', key === '3x8');
    root.style.setProperty('--label-cols',         preset.cols);
    root.style.setProperty('--label-rows',         preset.rows);
    root.style.setProperty('--label-qr-size',      preset.qrSize   + 'px');
    root.style.setProperty('--label-name-font',    preset.nameFont + 'pt');
    root.style.setProperty('--label-code-font',    preset.codeFont + 'pt');
    root.style.setProperty('--label-spec-font',    preset.specFont + 'pt');
    root.style.setProperty('--label-card-padding', preset.padding  + 'pt');
    console.log('[LP] _applyVars data-label-sheet=', key);
  }
  function _onPresetChange() {
    var key = getCurrentPresetKey();
    localStorage.setItem(PRESET_LS_KEY, key);
    console.log('[LP] preset changed =', key, 'total=', getTotalSlots());
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
    console.log('[LP] _initPresetSelect value=', el.value);
  }

  /* ════════════════════════════════════════
     품목 데이터
     — _getItems 클로저 우회, getMaster 전역 직접 호출
  ════════════════════════════════════════ */
  function getAllItems() {
    /* getMaster()는 index.html에 정의된 전역 함수 */
    var rows = (typeof getMaster === 'function') ? getMaster() : [];
    console.log('[LP] raw getMaster rows=', rows.length,
                rows.length ? rows[0] : '(empty)');
    var result = (Array.isArray(rows) ? rows : []).map(function(r) {
      return {
        b: String(r.code || r.itemCode || r.barcode || r['품목코드'] || '').trim(),
        n: String(r.name || r.itemName || r['품목명'] || '').trim(),
        s: String(r.spec  || r['규격']  || '').trim(),
        u: String(r.unit  || r['단위']  || 'EA').trim(),
        c: String(r.category || r['분류'] || '').trim()
      };
    }).filter(function(x) { return x.b || x.n; });
    console.log('[LP] getAllItems usable=', result.length);
    return result;
  }

  function _queryItems(v) {
    var q = String(v || '').trim().toLowerCase();
    if (!q) return [];
    var items = getAllItems();
    var res = items.filter(function(x) {
      return [x.b, x.n, x.s, x.c].join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 20);
    console.log('[LP] _queryItems("' + v + '"): matched', res.length, '/ total', items.length);
    return res;
  }

  /* ════════════════════════════════════════
     직접 입력 추가 (Enter 키)
  ════════════════════════════════════════ */
  function pickFirstOrDirect(value) {
    var v = String(value || '').trim();
    console.log('[LP] pickFirstOrDirect v=', v);
    if (!v) return;

    var items = getAllItems();
    console.log('[LP] pick items=', items.length);

    var lower = v.toLowerCase();
    var exact = null;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].b || '').toLowerCase() === lower) { exact = items[i]; break; }
    }
    if (!exact) {
      for (var j = 0; j < items.length; j++) {
        if (String(items[j].n || '').toLowerCase() === lower) { exact = items[j]; break; }
      }
    }
    if (!exact) {
      var matches = _queryItems(v);
      if (matches.length) { exact = matches[0]; }
    }

    if (exact) {
      console.log('[LP] pickFirstOrDirect exact=', exact);
      _pick(exact);
    } else {
      console.log('[LP] pickFirstOrDirect: no match for "' + v + '"');
      if (typeof _onToast === 'function') _onToast('일치하는 품목 없음: ' + v);
      else alert('일치하는 품목이 없습니다: ' + v);
    }
  }

  /* ════════════════════════════════════════
     슬롯에 품목 추가
  ════════════════════════════════════════ */
  function _pick(item) {
    console.log('[LP] _pick item=', item);
    if (!item || (!item.b && !item.n)) {
      console.warn('[LP] _pick: invalid item, abort');
      return;
    }
    ensureLabelSlots();
    var total = getTotalSlots();
    console.log('[LP] _pick total=', total, 'SLOTS before=', SLOTS.slice());

    var qty   = parseInt((document.getElementById('label-qty') || {}).value || '1', 10) || 1;
    var ssVal = parseInt((document.getElementById('label-ss')  || {}).value || '0', 10) || 0;
    var start;
    if (!ssVal) {
      var last = -1;
      for (var i = 0; i < total; i++) { if (SLOTS[i]) last = i; }
      start = last + 2;
      if (start > total) start = 1;
    } else { start = ssVal; }

    var added = 0, idx = start - 1;
    while (added < qty && idx < total) { SLOTS[idx] = item; added++; idx++; }
    console.log('[LP] _pick inserted at=', start - 1, 'added=', added, 'SLOTS after=', SLOTS.slice());

    _saveSlots();
    renderGrid();
    _updCnt();

    var q = document.getElementById('label-q');
    if (q) q.value = '';
    _hideSugg();
    _showMsg(added + '장 추가: ' + (item.n || item.b));
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
    el.textContent = txt; el.style.display = 'block';
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
    console.log('[LP] makeQR data=', code);
    var size = (getCurrentPreset().qrSize || 84);
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: code || ' ', width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) { container.textContent = 'QR'; console.error('[LP] makeQR error', e); }
  }

  /* ════════════════════════════════════════
     자동완성 UI
  ════════════════════════════════════════ */
  function _hideSugg() {
    var sugg = document.getElementById('label-sugg');
    if (sugg) sugg.style.display = 'none';
  }

  function _onSearch(v) {
    console.log('[LP] _onSearch fired v=', v);
    var q    = document.getElementById('label-q');
    var sugg = document.getElementById('label-sugg');
    console.log('[LP] sugg=', sugg);

    if (!sugg) { console.error('[LP] #label-sugg NOT FOUND'); return; }

    var term = String(v || '').trim();
    if (!term) { sugg.style.display = 'none'; return; }

    var items = getAllItems();
    console.log('[LP] all items count=', items.length);
    console.log('[LP] all items=', items);

    var matches = _queryItems(term);
    console.log('[LP] matches count=', matches.length, matches);

    if (!matches.length) { sugg.style.display = 'none'; return; }

    /* position:fixed — overflow:hidden 부모 우회 */
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
    matches.forEach(function(it) {
      var row = document.createElement('div');
      row.className = 'lp-si';
      row.innerHTML =
        '<span class="lp-sm">' + _esc(it.b) + '</span>' +
        '<span>'               + _esc(it.n) + '</span>' +
        (it.s ? '<span style="font-size:11px;color:#888">' + _esc(it.s) + '</span>' : '');
      row.onmousedown = (function(item) {
        return function(e) {
          e.preventDefault();
          console.log('[LP] suggest pick=', item);
          _pick(item);
        };
      })(it);
      sugg.appendChild(row);
    });
    sugg.style.display = 'block';
    console.log('[LP] sugg.style.display=block, items=', matches.length);
  }

  /* ════════════════════════════════════════
     이벤트 바인딩
     — oninput/onkeydown 직접 할당 (dataset 체크 없음)
  ════════════════════════════════════════ */
  function _bindEvents() {
    var q        = document.getElementById('label-q');
    var sugg     = document.getElementById('label-sugg');
    var presetEl = document.getElementById('labelPreset');
    var btnP     = document.getElementById('label-btn-print');
    var btnC     = document.getElementById('label-btn-clear');

    console.log('[LP] bindEvents direct q=', q, 'sugg=', sugg);

    if (q) {
      q.oninput = function(e) {
        console.log('[LP] oninput fired value=', e.target.value);
        _onSearch(e.target.value);
      };
      q.onkeydown = function(e) {
        console.log('[LP] keydown=', e.key, 'value=', q.value);
        if (e.key === 'Enter') {
          e.preventDefault();
          pickFirstOrDirect(q.value);
        }
        if (e.key === 'Escape') _hideSugg();
      };
      console.log('[LP] bindEvents: oninput/onkeydown assigned to #label-q');
    } else {
      console.error('[LP] bindEvents: #label-q NOT FOUND — autocomplete will NOT work');
    }

    if (presetEl) { presetEl.onchange = _onPresetChange; }
    if (btnP)     { btnP.onclick      = _print;     }
    if (btnC)     { btnC.onclick      = _clearAll;  }

    /* 바깥 클릭 시 추천 목록 닫기 */
    document.addEventListener('click', function(e) {
      var t = e.target;
      var inside = t.closest ? t.closest('.lp-sw') : false;
      if (!inside) _hideSugg();
    });
  }

  /* ════════════════════════════════════════
     그리드 렌더링
  ════════════════════════════════════════ */
  function renderGrid() {
    ensureLabelSlots();
    _applyVars();
    _buildSS();

    var grid = document.getElementById('label-grid');
    if (!grid) { console.error('[LP] renderGrid: #label-grid NOT FOUND'); return; }

    var key    = getCurrentPresetKey();
    var preset = LABEL_PRESETS[key] || LABEL_PRESETS['2x6'];
    var n      = getTotalSlots();

    /* CSS grid 열 직접 강제 */
    grid.style.gridTemplateColumns = 'repeat(' + preset.cols + ', 1fr)';
    grid.dataset.sheet = key;

    console.log('[LP] renderGrid key=', key, 'cols=', preset.cols, 'total=', n);

    grid.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var slot = SLOTS[i];
      console.log('[LP] render slot[' + i + ']=', slot);

      var card = document.createElement('div');
      card.className = 'lc' + (slot ? '' : ' empty') + (key === '3x8' ? ' compact' : '');

      var sno = document.createElement('div');
      sno.className = 'sno'; sno.textContent = '#' + (i + 1);
      card.appendChild(sno);

      if (slot) {
        var rm = document.createElement('button');
        rm.className = 'brm'; rm.innerHTML = '&#10005;';
        (function(idx) {
          rm.onclick = function(e) {
            e.stopPropagation(); SLOTS[idx] = null; renderGrid(); _saveSlots();
          };
        })(i);
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

        /* QR 생성 — slot.b (품목코드)만 사용 */
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
      /* opts.getMasterItems는 보관하되 getAllItems는 getMaster 전역을 직접 사용 */
      _slotsKey = (opts && opts.slotsKey) || '';
      _onToast  = (opts && opts.onToast)  || null;

      console.log('[LP] init() called. slotsKey=', _slotsKey,
                  'getMaster=', typeof getMaster,
                  'masterCount=', typeof getMaster === 'function' ? getMaster().length : 'N/A',
                  '_loaded=', _loaded);

      if (!_loaded) {
        _initPresetSelect();
        _loadSlots();
        _loaded = true;
      }

      _bindEvents();
      ensureLabelSlots();
      renderGrid();
    },

    renderGrid:          renderGrid,
    onPresetChange:      _onPresetChange,
    getCurrentPreset:    getCurrentPreset,
    getCurrentPresetKey: getCurrentPresetKey,
    getTotalSlots:       getTotalSlots,
    ensureLabelSlots:    ensureLabelSlots,
    pickFirstOrDirect:   pickFirstOrDirect,

    refresh: function() {
      var map = {};
      getAllItems().forEach(function(it) { if (it.b) map[it.b] = it; });
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
