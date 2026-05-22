/**
 * QR/바코드 라벨 출력 — 프린텍 2×6 / 3×8 프리셋 고정 레이아웃
 * LabelPrint.init({ getMasterItems, slotsKey, onToast })
 */
var LabelPrint = (function() {
  var SLOTS = [];
  var _getItems = null;
  var _slotsKey = '';
  var _onToast = null;
  var _inited = false;
  var _mt = null;

  /* ── 프리셋 정의: 프린텍 2×6 / 3×8 + 기존 호환 키 ── */
  var LABEL_PRESETS = {
    '2x6':  { cols: 2, rows: 6, qrSize: 84, nameFont: 12, codeFont: 10, specFont: 8,  padding: 5 },
    '3x8':  { cols: 3, rows: 8, qrSize: 52, nameFont: 9,  codeFont: 8,  specFont: 7,  padding: 3 },
    large:  { cols: 2, rows: 4, qrSize: 96, nameFont: 13, codeFont: 11, specFont: 9,  padding: 6 },
    normal: { cols: 2, rows: 6, qrSize: 84, nameFont: 12, codeFont: 10, specFont: 8,  padding: 5 },
    small:  { cols: 3, rows: 8, qrSize: 52, nameFont: 9,  codeFont: 8,  specFont: 7,  padding: 3 },
    tiny:   { cols: 4, rows: 10, qrSize: 42, nameFont: 5, codeFont: 4.5, specFont: 4, padding: 1 }
  };

  /* ── 현재 프리셋 키 반환: '2x6' 또는 '3x8' ── */
  function getCurrentPreset() {
    var el = document.getElementById('labelPreset');
    if (el && (el.value === '2x6' || el.value === '3x8')) return el.value;
    /* labelPreset select가 없으면 localStorage 저장값으로 판별 */
    try {
      var raw = localStorage.getItem(getLabelConfigKey());
      if (raw) {
        var o = JSON.parse(raw);
        if (o) {
          if (o.preset === '3x8' || o.preset === 'small' || (o.cols === 3 && o.rows === 8)) return '3x8';
          if (o.preset === '2x6' || o.preset === 'normal' || o.preset === 'large') return '2x6';
        }
      }
    } catch(e) {}
    return '2x6';
  }

  /* ── 총 슬롯 수 반환 (2×6=12 / 3×8=24) ── */
  function getTotalSlots() {
    return getCurrentPreset() === '3x8' ? 24 : 12;
  }

  /* ── 슬롯 배열을 현재 프리셋 크기에 맞게 조정 ── */
  function ensureLabelSlots() {
    var n = getTotalSlots();
    if (!SLOTS || SLOTS.length !== n) {
      SLOTS = resizeSlots(SLOTS);
      saveSlots();
    }
  }

  function getLabelConfigKey() {
    if (typeof CONFIG !== 'undefined' && CONFIG.CLIENT_ID) return CONFIG.CLIENT_ID + '_label_config';
    return 'osj_label_config';
  }

  function getLabelConfig() {
    var preset = getCurrentPreset();
    var base = LABEL_PRESETS[preset] || LABEL_PRESETS['2x6'];
    /* localStorage 저장값 우선 (qrSize 등 사용자 커스텀 반영) */
    try {
      var raw = localStorage.getItem(getLabelConfigKey());
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.cols && o.rows) {
          /* preset 키가 현재 선택과 일치하거나, cols/rows가 일치하는 경우만 사용 */
          var matchPreset = (o.preset === preset) ||
            (preset === '2x6' && (o.preset === 'normal' || (o.cols === 2 && o.rows === 6))) ||
            (preset === '3x8' && (o.preset === 'small'  || (o.cols === 3 && o.rows === 8)));
          if (matchPreset) base = o;
        }
      }
    } catch(e) {}
    var cols = Math.max(1, parseInt(base.cols, 10) || LABEL_PRESETS[preset].cols);
    var rows = Math.max(1, parseInt(base.rows, 10) || LABEL_PRESETS[preset].rows);
    var qrSize = Math.max(32, parseInt(base.qrSize, 10) || LABEL_PRESETS[preset].qrSize);
    return {
      cols: cols,
      rows: rows,
      qrSize: qrSize,
      nameFont: parseFloat(base.nameFont) || LABEL_PRESETS[preset].nameFont,
      codeFont: parseFloat(base.codeFont) || LABEL_PRESETS[preset].codeFont,
      specFont: parseFloat(base.specFont) || LABEL_PRESETS[preset].specFont,
      padding: parseFloat(base.padding)   || LABEL_PRESETS[preset].padding,
      slotCount: cols * rows,
      preset: preset
    };
  }

  function getSlotCount() {
    return getTotalSlots();
  }

  function createEmptySlots() {
    var n = getSlotCount();
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(null);
    return arr;
  }

  function resizeSlots(parsed) {
    var slotCount = getSlotCount();
    var next = createEmptySlots();
    if (Array.isArray(parsed)) {
      for (var i = 0; i < Math.min(parsed.length, slotCount); i++) next[i] = parsed[i];
    }
    return next;
  }

  /* ── OSJ 품목마스터: code/name/spec/unit/category 키 사용 ── */
  function masterToLabel(row) {
    if (!row) return null;
    var b = String(
      row.code || row.barcode || row.itemCode || row.item_code
      || row['품목코드'] || row['바코드'] || ''
    ).trim();
    var n = String(
      row.name || row.itemName || row.item_name || row['품목명'] || ''
    ).trim();
    return {
      b: b,
      n: n,
      s: row.spec  || row.model    || row['규격']     || '',
      c: row.category || row.cat   || row['분류']     || row['카테고리'] || '',
      u: row.unit  || row['단위']  || 'EA'
    };
  }

  function getAllItems() {
    if (!_getItems) return [];
    var rows = _getItems() || [];
    return rows.map(masterToLabel).filter(function(it) { return it && it.b && it.n; });
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showMsg(txt) {
    var el = document.getElementById('label-msg');
    if (!el) { if (_onToast) _onToast(txt); return; }
    el.textContent = txt;
    el.style.display = 'block';
    clearTimeout(_mt);
    _mt = setTimeout(function() { el.style.display = 'none'; }, 3500);
  }

  function loadSlots() {
    if (!_slotsKey) return;
    try {
      var raw = localStorage.getItem(_slotsKey);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) SLOTS = resizeSlots(parsed);
    } catch(e) {}
  }

  function saveSlots() {
    if (!_slotsKey) return;
    try { localStorage.setItem(_slotsKey, JSON.stringify(SLOTS)); } catch(e) {}
  }

  function buildStartSlotSelect() {
    var ss = document.getElementById('label-ss');
    if (!ss) return;
    var slotCount = getSlotCount();
    var cur = ss.value;
    ss.innerHTML = '<option value="0">자동</option>';
    for (var i = 1; i <= slotCount; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = '#' + i;
      ss.appendChild(opt);
    }
    if (!cur || cur === '0') ss.value = '0';
    else if (parseInt(cur, 10) <= slotCount) ss.value = cur;
    else ss.value = '0';
  }

  /* ── CSS 변수 + data-label-sheet 속성 + compact 클래스 토글 ── */
  function applyLabelVars() {
    var lc = getLabelConfig();
    var preset = getCurrentPreset();
    var root = document.getElementById('labelPrintRoot') || document.querySelector('.label-print');
    if (!root) return;
    root.setAttribute('data-label-sheet', preset);
    root.style.setProperty('--label-cols', lc.cols);
    root.style.setProperty('--label-rows', lc.rows);
    root.style.setProperty('--label-qr-size', lc.qrSize + 'px');
    root.style.setProperty('--label-name-font', lc.nameFont + 'pt');
    root.style.setProperty('--label-code-font', lc.codeFont + 'pt');
    root.style.setProperty('--label-spec-font', lc.specFont + 'pt');
    root.style.setProperty('--label-card-padding', lc.padding + 'pt');
    /* 3×8: compact 클래스 적용 */
    if (preset === '3x8') {
      root.classList.add('compact');
    } else {
      root.classList.remove('compact');
    }
  }

  /* ── labelPreset select 초기화 (저장값 기반) ── */
  function initPresetSelect() {
    var el = document.getElementById('labelPreset');
    if (!el) return;
    var preset = '2x6';
    try {
      var raw = localStorage.getItem(getLabelConfigKey());
      if (raw) {
        var o = JSON.parse(raw);
        if (o && (o.preset === '3x8' || o.preset === 'small' || (o.cols === 3 && o.rows === 8))) {
          preset = '3x8';
        }
      }
    } catch(e) {}
    el.value = preset;
  }

  /* ── labelPreset select 변경 핸들러 ── */
  function onPresetChange() {
    var preset = getCurrentPreset();
    /* 설정 탭의 setLabelPreset도 동기화 */
    var setEl = document.getElementById('setLabelPreset');
    if (setEl) {
      setEl.value = (preset === '3x8') ? 'small' : 'normal';
    }
    /* localStorage에 새 프리셋 저장 */
    var presetCfg = LABEL_PRESETS[preset];
    try {
      localStorage.setItem(getLabelConfigKey(), JSON.stringify(
        Object.assign({ preset: preset }, presetCfg)
      ));
    } catch(e) {}
    ensureLabelSlots();
    renderGrid();
  }

  function updCnt() {
    var slotCount = getSlotCount();
    var filled = SLOTS.filter(function(s) { return !!s; }).length;
    var badge = document.getElementById('label-slot-badge');
    var cnt = document.getElementById('label-item-cnt');
    if (badge) badge.textContent = filled + '/' + slotCount + ' 슬롯';
    if (cnt) cnt.textContent = getAllItems().length;
  }

  /* ── QR 생성: text = 품목코드만 ── */
  function makeQR(container, text) {
    var size = getLabelConfig().qrSize;
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: text || ' ',
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) {
      container.textContent = 'QR';
    }
  }

  function renderGrid() {
    var slotCount = getSlotCount();
    var prevLen = SLOTS ? SLOTS.length : 0;
    if (!SLOTS || SLOTS.length !== slotCount) {
      SLOTS = resizeSlots(SLOTS);
      if (prevLen !== slotCount) saveSlots();
    }
    applyLabelVars();
    buildStartSlotSelect();

    var grid = document.querySelector('#tab-label #label-grid') || document.getElementById('label-grid');
    if (!grid) return;

    var preset = getCurrentPreset();
    grid.innerHTML = '';
    for (var i = 0; i < slotCount; i++) {
      var slot = SLOTS[i];
      var card = document.createElement('div');
      var cls = 'lc';
      if (!slot) cls += ' empty';
      if (preset === '3x8') cls += ' compact';
      card.className = cls;

      /* 슬롯 번호: 화면에서 표시, 인쇄 시 CSS로 숨김 */
      var sno = document.createElement('div');
      sno.className = 'sno';
      sno.textContent = '#' + (i + 1);
      card.appendChild(sno);

      if (slot) {
        var rm = document.createElement('button');
        rm.className = 'brm';
        rm.innerHTML = '&#10005;';
        (function(idx) {
          rm.onclick = function() {
            SLOTS[idx] = null;
            renderGrid();
            saveSlots();
          };
        })(i);
        card.appendChild(rm);

        var qb = document.createElement('div');
        qb.className = 'qb';
        card.appendChild(qb);

        var li = document.createElement('div');
        li.className = 'li';
        if (preset === '3x8') {
          /* 3×8 compact: 품명 1줄, 코드 강조, 규격 생략 */
          li.innerHTML =
            '<div class="ln compact-name">' + esc(slot.n) + '</div>' +
            '<div class="lb compact-code">' + esc(slot.b) + '</div>';
        } else {
          li.innerHTML =
            '<div class="lbr">' +
              (slot.u ? '<span class="lu">' + esc(slot.u) + '</span>' : '') +
            '</div>' +
            '<div class="ln">' + esc(slot.n) + '</div>' +
            (slot.s ? '<div class="ls">' + esc(slot.s) + '</div>' : '') +
            '<div class="lb">' + esc(slot.b) + '</div>';
        }
        card.appendChild(li);

        /* QR = 품목코드(slot.b)만 */
        (function(el, code, delay) {
          setTimeout(function() { makeQR(el, code); }, delay);
        })(qb, slot.b, i * 40);
      } else {
        var et = document.createElement('div');
        et.className = 'et';
        et.textContent = '빈 슬롯';
        card.appendChild(et);
      }

      grid.appendChild(card);
    }
    updCnt();
  }

  function pick(item) {
    var slotCount = getSlotCount();
    var qty = parseInt(document.getElementById('label-qty') && document.getElementById('label-qty').value, 10) || 1;
    var ssVal = parseInt(document.getElementById('label-ss') && document.getElementById('label-ss').value, 10);
    var start;
    if (!ssVal) {
      var lastFilled = -1;
      for (var i = 0; i < slotCount; i++) { if (SLOTS[i]) lastFilled = i; }
      start = lastFilled + 2;
      if (start > slotCount) start = 1;
    } else {
      start = ssVal;
    }
    var added = 0, idx = start - 1;
    while (added < qty && idx < slotCount) {
      SLOTS[idx] = item;
      added++;
      idx++;
    }
    renderGrid();
    saveSlots();
    showMsg(added + '장 추가: ' + item.n);
    var q = document.getElementById('label-q');
    if (q) q.value = '';
    hideSugg();
  }

  function qRes() {
    var q = document.getElementById('label-q');
    var v = (q && q.value || '').trim().toLowerCase();
    if (!v) return [];
    return getAllItems().filter(function(it) {
      return it.b.toLowerCase().indexOf(v) >= 0 ||
        it.n.toLowerCase().indexOf(v) >= 0 ||
        (it.s || '').toLowerCase().indexOf(v) >= 0;
    }).slice(0, 25);
  }

  function onQ() {
    var res = qRes();
    var sugg = document.getElementById('label-sugg');
    if (!sugg) return;
    if (!res.length) { sugg.style.display = 'none'; return; }
    sugg.innerHTML = '';
    res.forEach(function(it) {
      var row = document.createElement('div');
      row.className = 'lp-si';
      row.innerHTML =
        '<span class="lp-sm">' + esc(it.b) + '</span>' +
        '<span>' + esc(it.n) + '</span>' +
        (it.s ? '<span style="font-size:11px;color:#888">' + esc(it.s) + '</span>' : '');
      (function(item) { row.onclick = function() { pick(item); }; })(it);
      sugg.appendChild(row);
    });
    sugg.style.display = 'block';
  }

  function hideSugg() {
    var sugg = document.getElementById('label-sugg');
    if (sugg) sugg.style.display = 'none';
  }

  function clearAll() {
    SLOTS = createEmptySlots();
    renderGrid();
    saveSlots();
    showMsg('전체 초기화');
  }

  function doPrint() {
    if (SLOTS.every(function(s) { return !s; })) {
      showMsg('슬롯에 품목을 먼저 추가하세요');
      return;
    }
    applyLabelVars();
    document.body.classList.add('label-printing');
    document.documentElement.classList.add('label-printing');

    document.querySelectorAll('#label-grid .qb canvas').forEach(function(cvs) {
      var parent = cvs.parentNode;
      if (parent && !parent.querySelector('img')) {
        var img = document.createElement('img');
        img.src = cvs.toDataURL('image/png');
        img.alt = '';
        parent.appendChild(img);
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

  function bindEvents() {
    /* 품목 검색 */
    var q = document.getElementById('label-q');
    if (q && !q._lpBound) {
      q._lpBound = true;
      q.addEventListener('input', onQ);
      q.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { var r = qRes(); if (r.length) pick(r[0]); }
        if (e.key === 'Escape') hideSugg();
      });
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.lp-sw')) hideSugg();
    });
    /* 인쇄 / 초기화 */
    var btnPrint = document.getElementById('label-btn-print');
    var btnClear = document.getElementById('label-btn-clear');
    if (btnPrint && !btnPrint._lpBound) {
      btnPrint._lpBound = true;
      btnPrint.addEventListener('click', doPrint);
    }
    if (btnClear && !btnClear._lpBound) {
      btnClear._lpBound = true;
      btnClear.addEventListener('click', clearAll);
    }
    /* labelPreset select (QR 탭 상단) */
    var presetSel = document.getElementById('labelPreset');
    if (presetSel && !presetSel._lpBound) {
      presetSel._lpBound = true;
      presetSel.addEventListener('change', onPresetChange);
    }
  }

  return {
    init: function(opts) {
      _getItems = opts.getMasterItems || opts.getItems;
      _slotsKey = opts.slotsKey || '';
      _onToast = opts.onToast || null;
      if (!_inited) {
        initPresetSelect();
        loadSlots();
        bindEvents();
        _inited = true;
      }
      ensureLabelSlots();
      renderGrid();
    },
    renderGrid: renderGrid,
    onPresetChange: onPresetChange,
    getCurrentPreset: getCurrentPreset,
    getTotalSlots: getTotalSlots,
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
      if (changed) saveSlots();
      renderGrid();
    },
    clearSlots: clearAll
  };
})();
