(function () {
  const API = window.CW_CONFIG.API_URL;
  const $ = (id) => document.getElementById(id);
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  // Ditekan "Tidak" tapi alasan (kode S/I/LD/…) belum dipilih — belum boleh disimpan
  const PENDING = '?';

  let pin = load('cw_pin');
  let data = null;          // respons terakhir dari API
  let edits = {};           // row -> kode yang belum disimpan
  let noteEdits = {};       // no plotting -> catatan yang belum disimpan
  const openNote = {};      // no plotting -> kolom catatan dibuka manual
  const closed = {};        // simpul yang dilipat
  let showNeed = false;     // tandai merah baris "Tidak" tanpa alasan setelah Simpan ditekan

  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  async function fetchData(day) {
    const url = API + '?pin=' + encodeURIComponent(pin) + (day ? '&day=' + day : '');
    const res = await fetch(url);
    return res.json();
  }

  function dirtyCount() { return Object.keys(edits).length + Object.keys(noteEdits).length; }
  function pendingRows() { return data.rows.filter((r) => edits[r.row] === PENDING); }

  async function saveData() {
    const pend = pendingRows();
    if (pend.length) {
      // buka simpul yang dilipat agar baris yang belum lengkap terlihat
      pend.forEach((r) => { delete closed[r.wilayah || '-']; });
      showNeed = true;
      render();
      toast('Ketuk alasan (Sakit / Izin / …) untuk ' + pend.map((r) => r.petugas).join(', '));
      const el = document.querySelector('.person[data-row="' + pend[0].row + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const updates = Object.keys(edits).map((row) => ({ row: Number(row), code: edits[row] }));
    const notes = Object.keys(noteEdits).map((no) => ({ no, note: noteEdits[no] }));
    if (!updates.length && !notes.length) return;
    $('btnSave').disabled = true;
    $('btnSave').textContent = 'Menyimpan…';
    try {
      // text/plain agar tidak memicu CORS preflight ke Apps Script
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin, day: data.day, updates, notes })
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      if (notes.length && out.notes === undefined) {
        toast('Status tersimpan, tetapi catatan belum — Code.gs perlu diperbarui');
      } else {
        toast('✓ Laporan tersimpan');
      }
      await reload(data.day);
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message);
    } finally {
      $('btnSave').disabled = false;
      $('btnSave').textContent = 'Simpan';
    }
  }

  async function reload(day) {
    $('btnReload').disabled = true;
    try {
      const d = await fetchData(day);
      if (d.error) {
        if (d.error === 'PIN salah') return showLogin('PIN salah');
        throw new Error(d.error);
      }
      data = d;
      edits = {};
      noteEdits = {};
      showNeed = false;
      render();
    } catch (err) {
      toast('Gagal memuat: ' + err.message);
    } finally {
      $('btnReload').disabled = false;
    }
  }

  function statusOf(r) { return edits[r.row] !== undefined ? edits[r.row] : r.status; }
  function savedNote(r) { return data.catatan[String(r.no)] || ''; }
  function noteOf(r) { return noteEdits[r.no] !== undefined ? noteEdits[r.no] : savedNote(r); }
  // H = hadir, T = tidak hadir (kode apa pun selain H), K = belum diisi
  function kind(st) { return !st ? 'K' : st === 'H' ? 'H' : 'T'; }
  function reasons() { return data.codes.filter((c) => c.code !== 'H'); }
  function labelOf(st) {
    if (st === PENDING) return 'Tidak hadir';
    const c = data.codes.find((x) => x.code === st);
    return c ? c.label : st;
  }

  function monthIndex() {
    const i = BULAN.findIndex((b) => b.toLowerCase() === String(data.bulan).toLowerCase());
    return i < 0 ? new Date().getMonth() : i;
  }

  function dateLabel() {
    const dt = new Date(Number(data.tahun), monthIndex(), data.day);
    return HARI[dt.getDay()] + ', ' + data.day + ' ' + BULAN[monthIndex()] + ' ' + data.tahun;
  }

  // dihitung per personil (kolom JML PERS), sama dengan rekap di spreadsheet
  function count(rows) {
    const c = { H: 0, T: 0, K: 0, total: 0, alasan: {} };
    rows.forEach((r) => {
      const st = statusOf(r), k = kind(st);
      c[k] += r.jml;
      c.total += r.jml;
      if (k === 'T') c.alasan[labelOf(st)] = (c.alasan[labelOf(st)] || 0) + r.jml;
    });
    return c;
  }

  function groups() {
    const g = {};
    data.rows.forEach((r) => { (g[r.wilayah || '-'] = g[r.wilayah || '-'] || []).push(r); });
    return g;
  }

  function render() {
    // tanggal
    const sel = $('day');
    sel.innerHTML = '';
    for (let d = 1; d <= data.lastDay; d++) {
      const o = document.createElement('option');
      o.value = d; o.textContent = d + ' ' + BULAN[monthIndex()];
      if (d === data.day) o.selected = true;
      sel.appendChild(o);
    }
    $('prevDay').disabled = data.day <= 1;
    $('nextDay').disabled = data.day >= data.lastDay;
    $('dateLabel').textContent = dateLabel() + ' ▾';

    const c = count(data.rows);
    $('sumH').textContent = c.H;
    $('sumT').textContent = c.T;
    $('sumK').textContent = c.K;
    $('progress').textContent = (c.total - c.K) + '/' + c.total + ' personil terisi';

    renderSimpul();
    renderSaveBar();
    renderWa();
  }

  function renderSimpul() {
    const g = groups();
    const keys = Object.keys(g);
    if (!keys.length) {
      $('simpulList').innerHTML = '<p class="empty">Belum ada data plotting.</p>';
      return;
    }
    $('simpulList').innerHTML = keys.map((w) => {
      const rows = g[w], s = count(rows);
      const pct = (n) => (s.total ? 100 * n / s.total : 0) + '%';
      return '<section class="card simpul' + (closed[w] ? ' closed' : '') + '" data-w="' + esc(w) + '">' +
        '<div class="simpul-head" data-act="toggle"><h2>' + esc(w) + '</h2>' +
          '<span class="count">' + s.H + ' hadir · ' + s.T + ' tidak' + (s.K ? ' · ' + s.K + ' kosong' : '') + '</span>' +
          '<span class="chev">▾</span></div>' +
        '<div class="bar"><i style="width:' + pct(s.H) + ';background:var(--hadir)"></i>' +
          '<i style="width:' + pct(s.T) + ';background:var(--th)"></i></div>' +
        '<div class="body">' +
          '<div class="simpul-tools"><span class="count">' + s.total + ' personil · ' + rows.length + ' titik</span>' +
            (s.K ? '<button class="link" data-act="allH">✓ Sisanya hadir</button>' : '') + '</div>' +
          rows.map(person).join('') +
        '</div></section>';
    }).join('');
  }

  function person(r) {
    const st = statusOf(r), k = kind(st), note = noteOf(r);
    const dirty = edits[r.row] !== undefined || noteEdits[r.no] !== undefined;
    const showNote = k === 'T' || note || openNote[r.no];
    const chips = k === 'T'
      ? (st === PENDING ? '<p class="need-msg">Wajib: ketuk salah satu alasan di bawah ini</p>' : '') +
        '<div class="chips' + (st === PENDING ? ' need' : '') + '">' + reasons().map((c) =>
          '<button data-act="code" data-v="' + esc(c.code) + '"' + (st === c.code ? ' class="on"' : '') + '>' +
          esc(c.label) + '</button>').join('') + '</div>'
      : '';
    return '<div class="person' + (dirty ? ' dirty' : '') + (showNeed && st === PENDING ? ' need' : '') +
      '" data-row="' + r.row + '">' +
      '<div class="line"><div class="info">' +
        '<div class="name">' + esc(r.no) + '. ' + esc(r.petugas) + (r.jml > 1 ? ' · ' + r.jml + ' pers' : '') + '</div>' +
        '<div class="loc">' + esc(r.lokasi) + (r.jam ? ' · ' + esc(r.jam) : '') + '</div></div>' +
        '<div class="seg"><button class="h' + (k === 'H' ? ' on' : '') + '" data-act="H">Hadir</button>' +
        '<button class="t' + (k === 'T' ? ' on' : '') + '" data-act="T">Tidak</button></div></div>' +
      (showNote
        ? '<div class="note">' + chips +
            '<input data-act="note" maxlength="300" value="' + esc(note) + '" placeholder="' +
              (k === 'T' ? 'Catatan / pengganti (opsional)…' : 'Catatan (opsional)…') + '">' +
          '</div>'
        : '<button class="add-note" data-act="addNote">+ catatan</button>') +
    '</div>';
  }

  function renderSaveBar() {
    const n = dirtyCount();
    $('saveBar').hidden = n === 0;
    const pend = pendingRows().length;
    $('saveInfo').textContent = pend
      ? pend + ' personil belum dipilih alasannya'
      : n + ' perubahan belum disimpan';
  }

  function renderWa() {
    const txt = waText();
    $('waText').value = txt;
    $('btnWa').href = 'https://wa.me/?text=' + encodeURIComponent(txt);
  }

  function waText() {
    const ringkas = $('onlyTH').checked;
    const c = count(data.rows);
    const alasan = Object.keys(c.alasan).map((a) => a + ' ' + c.alasan[a]).join(', ');
    const L = [
      '*LAPORAN PENGATURAN PAGI*',
      '*SATLANTAS POLRESTA BANYUWANGI*',
      dateLabel(),
      '',
      'Hadir : ' + c.H + ' dari ' + c.total + ' personil',
      'Tidak hadir : ' + c.T + (alasan ? ' (' + alasan + ')' : '')
    ];
    if (c.K) L.push('⚪ *Belum lapor : ' + c.K + '*');

    const g = groups();
    Object.keys(g).forEach((w) => {
      const rows = g[w], s = count(rows);
      L.push('', '*' + w.toUpperCase() + '* (' + s.H + '/' + s.total + ' hadir)');
      let tulis = 0;
      rows.forEach((r) => {
        const st = statusOf(r), k = kind(st), note = noteOf(r);
        if (ringkas && k === 'H' && !note) return;
        const mark = k === 'H' ? '✅' : k === 'T' ? '❌' : '⚪';
        const ket = k === 'T' ? ' : ' + labelOf(st) : k === 'K' ? ' : *belum lapor*' : '';
        L.push(mark + ' ' + r.no + '. ' + r.petugas + ' – ' + r.lokasi + ket + (note ? ' _(' + note + ')_' : ''));
        tulis++;
      });
      if (ringkas && !tulis) L.push('✅ Semua hadir');
    });
    return L.join('\n');
  }

  function rowByEl(el) {
    const pe = el.closest('.person');
    return pe && data.rows.find((r) => r.row === Number(pe.dataset.row));
  }

  function setStatus(r, code) {
    if (code === r.status) delete edits[r.row]; else edits[r.row] = code;
  }

  function setNote(r, text) {
    if (text === savedNote(r)) delete noteEdits[r.no]; else noteEdits[r.no] = text;
  }

  $('simpulList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.dataset.act === 'note') return;
    const act = el.dataset.act;
    const w = el.closest('.simpul').dataset.w;
    const r = rowByEl(el);
    if (act === 'toggle') closed[w] = !closed[w];
    if (act === 'allH') groups()[w].forEach((x) => { if (!statusOf(x)) setStatus(x, 'H'); });
    if (act === 'H') setStatus(r, statusOf(r) === 'H' ? '' : 'H');
    if (act === 'T') setStatus(r, kind(statusOf(r)) === 'T' ? '' : PENDING);
    if (act === 'code') setStatus(r, el.dataset.v);
    if (act === 'addNote') openNote[r.no] = true;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (act === 'addNote') {
      const i = document.querySelector('.person[data-row="' + r.row + '"] input');
      if (i) i.focus();
    }
  });
  $('simpulList').addEventListener('input', (e) => {
    if (e.target.dataset.act !== 'note') return;
    const r = rowByEl(e.target);
    setNote(r, e.target.value);
    e.target.closest('.person').classList.toggle('dirty',
      edits[r.row] !== undefined || noteEdits[r.no] !== undefined);
    renderSaveBar();
    renderWa();
  });

  function showLogin(msg) {
    $('app').hidden = true;
    $('saveBar').hidden = true;
    $('login').hidden = false;
    $('loginMsg').textContent = msg || '';
  }

  function goDay(d) {
    if (dirtyCount() && !confirm('Perubahan belum disimpan akan hilang. Lanjut?')) {
      $('day').value = data.day;
      return;
    }
    reload(d);
  }

  $('btnLogin').onclick = () => {
    pin = $('pin').value.trim();
    store('cw_pin', pin);
    $('login').hidden = true;
    $('app').hidden = false;
    reload();
  };
  $('pin').onkeydown = (e) => { if (e.key === 'Enter') $('btnLogin').click(); };
  $('day').onchange = (e) => goDay(Number(e.target.value));
  $('prevDay').onclick = () => goDay(data.day - 1);
  $('nextDay').onclick = () => goDay(data.day + 1);
  $('btnReload').onclick = () => goDay(data && data.day);
  $('btnSave').onclick = saveData;
  $('onlyTH').checked = load('cw_ringkas') === '1';
  $('onlyTH').onchange = () => { store('cw_ringkas', $('onlyTH').checked ? '1' : ''); if (data) renderWa(); };
  $('btnCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('waText').value);
    } catch (e) {
      $('waText').select();
      document.execCommand('copy');
    }
    toast('✓ Teks disalin');
  };
  window.addEventListener('beforeunload', (e) => { if (data && dirtyCount()) e.preventDefault(); });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------- Pasang aplikasi di HP ----------
  const GUIDE = {
    ios: {
      title: 'Pasang di iPhone',
      steps: ['Ketuk tombol <b>Bagikan</b> <span class="ios-share">⬆︎</span> di bawah layar Safari.',
        'Pilih <b>Tambahkan ke Layar Utama</b>.', 'Ketuk <b>Tambah</b> di pojok kanan atas.'],
      note: 'Harus dibuka di Safari. Di Chrome iPhone menu ini tidak tersedia.'
    },
    android: {
      title: 'Pasang di Android',
      steps: ['Ketuk menu <b>⋮</b> di pojok kanan atas browser.',
        'Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.', 'Ketuk <b>Instal</b> / <b>Tambahkan</b>.'],
      note: 'Paling lancar di Google Chrome.'
    }
  };
  let installPrompt = null;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const dismissedAt = Number(load('cw_install_tutup')) || 0;
  const canOffer = !standalone && Date.now() - dismissedAt > 3 * 24 * 3600 * 1000;

  function showInstallBar(hint) {
    if (!canOffer) return;
    if (hint) $('installHint').textContent = hint;
    $('installBar').hidden = false;
  }
  function showGuide(kind) {
    const g = GUIDE[kind];
    $('sheetTitle').textContent = g.title;
    $('sheetSteps').innerHTML = g.steps.map((s) => '<li>' + s + '</li>').join('');
    $('sheetNote').textContent = g.note;
    $('installSheet').hidden = false;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    showInstallBar('Buka langsung dari layar utama, tanpa browser.');
  });
  window.addEventListener('appinstalled', () => { $('installBar').hidden = true; toast('✓ Aplikasi terpasang'); });
  if (isIos) showInstallBar('Ketuk Pasang untuk melihat caranya.');
  // browser Android yang tidak memunculkan dialog instal: tampilkan panduan manual
  else if (isAndroid) setTimeout(() => { if (!installPrompt) showInstallBar('Ketuk Pasang untuk melihat caranya.'); }, 2500);

  $('btnInstall').onclick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome === 'accepted') $('installBar').hidden = true;
      return;
    }
    showGuide(isIos ? 'ios' : 'android');
  };
  $('btnInstallClose').onclick = () => { $('installBar').hidden = true; store('cw_install_tutup', String(Date.now())); };
  $('btnSheetOk').onclick = () => { $('installSheet').hidden = true; };
  $('installSheet').onclick = (e) => { if (e.target === $('installSheet')) $('installSheet').hidden = true; };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  if (pin) { $('app').hidden = false; reload(); } else showLogin();
})();
