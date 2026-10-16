(function () {
  const API = window.CW_CONFIG.API_URL;
  const $ = (id) => document.getElementById(id);
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  // Ditekan "Tidak" tapi alasan (kode S/I/LD/…) belum dipilih — belum boleh disimpan
  const PENDING = '?';

  let pin = load('cw_pin');
  let kode = load('cw_kode');   // kode admin (kedua setelah NRP) untuk membuka Rekap
  let mintaAdmin = false;
  let data = null;          // respons terakhir dari API
  let edits = {};           // row -> kode yang belum disimpan
  let noteEdits = {};       // no plotting -> catatan yang belum disimpan
  const openNote = {};      // no plotting -> kolom catatan dibuka manual
  const closed = {};        // simpul yang dilipat
  let showNeed = false;     // tandai merah baris "Tidak" tanpa alasan setelah Simpan ditekan
  let mode = load('cw_mode') || 'lapor';   // 'lapor' (anggota) atau 'rekap' (admin)
  let me = '';                             // no plotting milik NRP yang login (dari server)
  let draft = newDraft();                  // isian form Lapor Saya yang belum dikirim
  let sending = false;

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
    const url = API + '?pin=' + encodeURIComponent(pin) + (kode ? '&kode=' + encodeURIComponent(kode) : '') +
      (day ? '&day=' + day : '');
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
        body: JSON.stringify({ pin, kode, day: data.day, updates, notes })
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
        if (d.error === 'PIN salah') return showLogin('NRP tidak terdaftar');
        if (/Kode admin/.test(d.error)) {
          // kode salah/terkunci: tetap masuk sebagai anggota tanpa Rekap
          kode = ''; store('cw_kode', ''); mintaAdmin = false;
          toast(d.error);
          return reload(day);
        }
        if (/NRP|plotting/.test(d.error)) return showLogin(d.error);
        throw new Error(d.error);
      }
      data = d;
      if (d.now != null) jamSync = { now: d.now, at: Date.now() };
      // anggota (login NRP) hanya bisa Lapor Saya untuk dirinya sendiri
      $('mode').hidden = d.role === 'anggota';
      if (d.role === 'anggota') { mode = 'lapor'; me = String(d.me); }
      else if (d.me) me = String(d.me);   // admin (login NRP) melapor untuk dirinya sendiri
      if (mintaAdmin && d.role === 'admin') { mode = 'rekap'; store('cw_mode', mode); toast('✓ Masuk sebagai admin'); }
      mintaAdmin = false;
      edits = {};
      noteEdits = {};
      showNeed = false;
      render();
      const r = mode === 'lapor' && myRow();
      if (r && ['datang', 'tunggu', 'selesai'].includes(fase(r)) && draft.lat == null && !draft.gpsMsg) ambilLokasi();
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
    [...$('mode').children].forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('laporView').hidden = mode !== 'lapor';
    $('rekapView').hidden = mode !== 'rekap';
    if (mode === 'lapor') {
      $('saveBar').hidden = true;
      // Lapor Saya selalu untuk hari ini
      if (data.today && data.day !== data.today) return reload(data.today);
      return renderLapor();
    }
    renderRekap();
  }

  function renderRekap() {
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
        '<div class="loc">' + esc(r.lokasi) + (r.jam ? ' · ' + esc(r.jam) : '') + '</div>' +
        laporInfo(r) + '</div>' +
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

  // keterangan laporan mandiri anggota: { datang, selesai, tidak, st } — tiap tahap {jam, dist, peta, foto}
  function laporOf(r) { return (data.lapor || {})[String(r.no)]; }
  function radius() { return data.radius || 100; }
  function cekJarak(t) { return !t || t.dist == null ? ' <span class="badge k">jarak belum dicek</span>' : ''; }
  function tautan(t) {
    return (t.peta ? ' · <a href="' + esc(t.peta) + '" target="_blank" rel="noopener">peta</a>' : '') +
      (t.foto ? ' · <a href="' + esc(t.foto) + '" target="_blank" rel="noopener">📷</a>' : '');
  }
  function laporInfo(r) {
    const l = laporOf(r);
    if (!l) return '';
    if (l.st && l.st !== 'H') return '<div class="lapor-info">📍 lapor ' + esc(l.tidak.jam) + '</div>';
    const d = l.datang, s = l.selesai;
    let html = d ? '📍 datang ' + esc(d.jam) + tautan(d) : '';
    if (s) html += (html ? ' · ' : '📍 ') + 'selesai ' + esc(s.jam) + tautan(s) + ' <span class="badge ok">✓ lengkap</span>';
    else if (d) html += ' <span class="badge far">⏳ belum Lapor Selesai</span>';
    return '<div class="lapor-info">' + html + cekJarak(s || d) + '</div>';
  }
  function fmtJarak(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }

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
        const l = laporOf(r) || {};
        const separuh = k === 'K' && l.datang;   // Lapor Datang tanpa Lapor Selesai: tidak dihitung
        const mark = separuh ? '⏳' : k === 'H' ? '✅' : k === 'T' ? '❌' : '⚪';
        const ket = k === 'T' ? ' : ' + labelOf(st)
          : separuh ? ' : datang ' + l.datang.jam + ', *belum Lapor Selesai*'
          : k === 'K' ? ' : *belum lapor*' : '';
        const waktu = k === 'H' && l.datang && l.selesai ? ' (' + l.datang.jam + '–' + l.selesai.jam + ')' : '';
        L.push(mark + ' ' + r.no + '. ' + r.petugas + ' – ' + r.lokasi + waktu + ket + (note ? ' _(' + note + ')_' : ''));
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

  // ---------- Lapor Saya (anggota melapor sendiri) ----------
  function newDraft() {
    return { lat: null, lng: null, acc: null, gpsMsg: '', foto: null, fotoKb: 0, note: '', tidak: false, alasan: '' };
  }
  function myRow() { return me && data.rows.find((r) => String(r.no) === String(me)); }

  function jarakM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- jam lapor: pakai jam server agar tidak bisa diakali dengan mengubah jam HP ----------
  let jamSync = { now: null, at: 0 };
  let lastFase = '';
  function menitSekarang() {
    if (jamSync.now == null) { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
    return jamSync.now + (Date.now() - jamSync.at) / 60000;
  }
  function jamTeks(m) { m = Math.floor(m); return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0'); }
  function J() { return data.jadwal || { buka: 360, batasDatang: 390, mulaiSelesai: 420, tutup: 435 }; }

  // fase Lapor Saya: belumBuka → datang → tunggu → selesai → beres; telat/tutup bila waktunya lewat
  function fase(r) {
    const l = laporOf(r) || {}, m = menitSekarang(), j = J();
    if (l.st) return 'beres';
    if (m < j.buka) return 'belumBuka';
    if (m > j.tutup) return 'tutup';
    if (draft.tidak) return 'tidak';
    if (!l.datang) return m <= j.batasDatang ? 'datang' : 'telat';
    return m < j.mulaiSelesai ? 'tunggu' : 'selesai';
  }

  function okLokasi(r) { return draft.lat != null && (r.lat == null || jarakM(draft, r) <= radius()); }

  function gpsHtml(r) {
    if (draft.lat == null) return '<div class="gps"><b>' + esc(draft.gpsMsg || 'Mengambil lokasi…') + '</b></div>';
    const peta = '<a href="https://maps.google.com/?q=' + draft.lat.toFixed(6) + ',' + draft.lng.toFixed(6) + '" target="_blank" rel="noopener">lihat peta</a>';
    const akurasi = 'akurasi ±' + Math.round(draft.acc) + ' m · ' + peta;
    if (r.lat == null) {
      return '<div class="gps ok"><b>✓ Lokasi didapat</b>' + akurasi +
        '<br><small>Koordinat titik ini belum diisi admin, jarak belum dicek.</small></div>';
    }
    const d = jarakM(draft, r);
    return d <= radius()
      ? '<div class="gps ok"><b>✓ Di dalam radius titik</b>' + fmtJarak(d) + ' dari titik (maks ' + radius() + ' m) · ' + akurasi + '</div>'
      : '<div class="gps out"><b>✕ Di luar radius — belum bisa lapor</b>' + fmtJarak(d) + ' dari titik ' + esc(r.lokasi) +
        ' (maks ' + radius() + ' m). Mendekatlah ke titik lalu ketuk Ambil ulang lokasi. · ' + akurasi + '</div>';
  }

  function info(judul, teks) { return '<div class="step"><div class="gps"><b>' + judul + '</b>' + teks + '</div></div>'; }

  function renderLapor() {
    const v = $('laporView');
    if (!data.today) {
      v.innerHTML = '<section class="card"><h2 class="t">Lapor belum dibuka</h2>' +
        '<p class="sub">Spreadsheet yang terhubung bukan untuk bulan berjalan. Hubungi admin.</p></section>';
      return;
    }
    const r = myRow();
    if (!r) {
      v.innerHTML = '<section class="card"><h2 class="t">Nama Anda tidak ada di plotting bulan ini</h2>' +
        '<p class="sub">Lapor Saya hanya untuk personil yang terjadwal. ' + gantiBtn() + '</p></section>';
      return;
    }
    const l = laporOf(r) || {};
    const f = lastFase = fase(r);
    if (f === 'beres') return renderSelesai(r, l);
    const j = J(), m = menitSekarang();
    const jadwalTeks = 'Lapor Datang ' + jamTeks(j.buka) + '–' + jamTeks(j.batasDatang) +
      ', Lapor Selesai ' + jamTeks(j.mulaiSelesai) + '–' + jamTeks(j.tutup) + ', dalam radius ' + radius() + ' m dari titik.';
    const tidakLink = '<div class="switch"><button class="link muted-link" data-a="modeTidak">Tidak bisa hadir hari ini?</button></div>';
    const gpsStep = '<div class="step"><h3>Lokasi <small>otomatis</small></h3><div id="gpsBox">' + gpsHtml(r) + '</div>' +
      '<div class="mini"><button data-a="gps">⟳ Ambil ulang lokasi</button></div></div>';
    const fotoStep = '<div class="step"><h3>Foto dokumentasi <small>opsional</small></h3><div class="photo-box">' +
      (draft.foto ? '<img src="' + draft.foto + '" alt="Foto">' : '') +
      '<label class="btn file-btn">' + (draft.foto ? 'Ganti foto' : '📷 Ambil foto') +
        '<input type="file" id="foto" accept="image/*" capture="environment"></label>' +
      (draft.foto ? '<span class="muted">' + draft.fotoKb + ' KB</span> <button class="link muted-link" data-a="hapusFoto">hapus</button>' : '') +
      '</div></div>';
    const noteStep = '<div class="step"><h3>Catatan <small>opsional</small></h3>' +
      '<input class="note-in" id="laporNote" maxlength="300" placeholder="' +
      (draft.tidak ? 'Mis. digantikan oleh …' : 'Mis. arus padat, ada kecelakaan kecil …') + '" value="' + esc(draft.note) + '"></div>';
    const tombol = (aksi, label) => '<button class="btn big h" id="btnKirim" data-a="' + aksi + '"' +
      (sending || !okLokasi(r) ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : label) + '</button>';

    let body = '';
    if (f === 'belumBuka') body = info('⏰ Lapor dibuka pukul ' + jamTeks(j.buka), jadwalTeks);
    else if (f === 'tutup') {
      body = info('Waktu lapor sudah berakhir (' + jamTeks(j.tutup) + ')', l.datang
        ? 'Anda Lapor Datang pukul ' + esc(l.datang.jam) + ' tetapi tidak Lapor Selesai, sehingga kehadiran hari ini tidak dihitung.'
        : 'Hari ini Anda belum lapor. Hubungi admin bila ada kendala.');
    } else if (f === 'telat') {
      body = info('Batas Lapor Datang ' + jamTeks(j.batasDatang) + ' sudah lewat',
        'Kehadiran hari ini tidak bisa dilaporkan lewat aplikasi. Hubungi admin.') + tidakLink;
    } else if (f === 'tunggu') {
      body = info('✓ Lapor Datang tercatat pukul ' + esc(l.datang.jam),
        'Tetap di lokasi. Lapor Selesai dibuka pukul ' + jamTeks(j.mulaiSelesai) + ' (' + Math.max(1, Math.ceil(j.mulaiSelesai - m)) +
        ' menit lagi). Tanpa Lapor Selesai di lokasi, kehadiran tidak dihitung.') + gpsStep + tidakLink;
    } else if (f === 'datang') {
      body = info('Langkah 1 dari 2: Lapor Datang', 'Batas pukul ' + jamTeks(j.batasDatang) + '. Lapor Selesai pukul ' +
        jamTeks(j.mulaiSelesai) + '–' + jamTeks(j.tutup) + ' di titik yang sama.') +
        gpsStep + fotoStep + noteStep + tombol('kirimDatang', '📍 Lapor Datang') + tidakLink;
    } else if (f === 'selesai') {
      body = info('Langkah 2 dari 2: Lapor Selesai', 'Datang tercatat pukul ' + esc(l.datang.jam) + '. Batas Lapor Selesai pukul ' +
        jamTeks(j.tutup) + '.') + gpsStep + fotoStep + noteStep + tombol('kirimSelesai', '✓ Lapor Selesai');
    } else if (f === 'tidak') {
      body = '<div class="step"><h3>Alasan tidak hadir</h3><div class="chips">' + reasons().map((c) =>
          '<button data-a="alasan" data-v="' + esc(c.code) + '"' + (draft.alasan === c.code ? ' class="on"' : '') + '>' + esc(c.label) + '</button>').join('') +
        '</div></div>' + noteStep +
        '<button class="btn big t" data-a="kirimTidak"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : 'Kirim: Tidak Hadir') + '</button>' +
        '<div class="switch"><button class="link muted-link" data-a="modeHadir">← Kembali</button></div>';
    }

    v.innerHTML =
      '<section class="card">' +
        '<div class="who"><div><b>' + esc(r.petugas) + '</b><div class="loc">' + esc(r.lokasi) + ' · ' + esc(r.wilayah) + '</div></div>' +
          gantiBtn() + '</div>' +
        '<p class="sub" style="margin:8px 0 0">' + dateLabel() + ' · pukul ' + jamTeks(m) + '</p>' +
        body + adminBox() +
      '</section>';
  }

  function renderSelesai(r, l) {
    const hadir = l.st === 'H';
    const note = savedNote(r);
    const d = l.datang, s = l.selesai, t = l.tidak;
    $('laporView').innerHTML =
      '<section class="card done' + (hadir ? '' : ' t') + '">' +
        '<div class="ic">' + (hadir ? '✓' : '✕') + '</div>' +
        '<h2 class="t">' + (hadir ? 'Kehadiran tercatat' : 'Laporan tidak hadir terkirim') + '</h2>' +
        '<p class="sub">' + esc(r.petugas) + ' · ' + esc(r.lokasi) + '<br>' + dateLabel() + '</p>' +
        (hadir
          ? '<p class="sub">Datang ' + (d ? esc(d.jam) : '–') + ' · Selesai ' + (s ? esc(s.jam) : '–') + '</p>' +
            '<span class="badge ok">✓ lengkap</span>' + cekJarak(s)
          : '<p class="sub">pukul ' + esc(t ? t.jam : '') + '</p><span class="badge th">' + esc(labelOf(l.st)) + '</span>') +
        (note ? '<p class="sub" style="margin-top:8px">📝 ' + esc(note) + '</p>' : '') +
        adminBox() +
        '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div>' +
      '</section>';
  }

  // perbarui kotak lokasi & tombol kirim tanpa menggambar ulang form (isian catatan tidak hilang)
  function updateGps() {
    const r = myRow();
    if (!r || !$('gpsBox')) return render();
    $('gpsBox').innerHTML = gpsHtml(r);
    if ($('btnKirim')) $('btnKirim').disabled = sending || !okLokasi(r);
  }

  function ambilLokasi(manual) {
    if (draft.lat == null || manual) draft.gpsMsg = 'Mengambil lokasi…';
    if (manual && $('gpsBox')) $('gpsBox').innerHTML = '<div class="gps"><b>Mengambil lokasi…</b></div>';
    if (!navigator.geolocation) { draft.gpsMsg = 'HP/browser tidak mendukung GPS'; if (mode === 'lapor') updateGps(); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      draft.lat = pos.coords.latitude; draft.lng = pos.coords.longitude; draft.acc = pos.coords.accuracy;
      draft.gpsMsg = '';
      if (mode !== 'lapor') return;
      updateGps();
      const r = myRow();
      if (r && !okLokasi(r)) {
        toast(fase(r) === 'tunggu'
          ? 'Anda di luar radius ' + radius() + ' m! Kembali ke titik sebelum Lapor Selesai.'
          : 'Anda di luar radius ' + radius() + ' m dari titik. Laporan belum bisa dikirim.');
      }
    }, (err) => {
      draft.lat = null;
      draft.gpsMsg = err.code === 1 ? 'Izin lokasi ditolak — izinkan akses lokasi untuk situs ini' : 'Lokasi belum didapat, ketuk Ambil ulang lokasi';
      if (mode === 'lapor') updateGps();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  // perkecil foto agar hemat kuota & penyimpanan (sisi terpanjang 1024 px, JPEG 70%)
  function kecilkanFoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1024 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function kirimLapor(tahap, st) {
    const r = myRow();
    sending = true;
    renderLapor();
    try {
      const pakaiLokasi = tahap !== 'tidak';
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          pin, kode, action: 'lapor', tahap, no: r.no, st,
          lat: pakaiLokasi ? draft.lat : null, lng: pakaiLokasi ? draft.lng : null, acc: pakaiLokasi ? draft.acc : null,
          foto: pakaiLokasi ? draft.foto : null, note: draft.note.trim()
        })
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      if (out.jam === undefined) throw new Error('Code.gs belum diperbarui untuk fitur Lapor');
      const lat = draft.lat, lng = draft.lng, acc = draft.acc;
      draft = newDraft();
      if (tahap === 'datang') Object.assign(draft, { lat, lng, acc }); // lokasi tetap dipakai untuk pantauan
      toast(tahap === 'datang' ? '✓ Lapor Datang tercatat pukul ' + out.jam
        : tahap === 'selesai' ? '✓ Lapor Selesai pukul ' + out.jam + ' — kehadiran dihitung' : '✓ Laporan terkirim pukul ' + out.jam);
      sending = false;
      await reload(data.today);
      window.scrollTo(0, 0);
    } catch (err) {
      sending = false;
      renderLapor();
      toast('Gagal mengirim: ' + err.message);
    }
  }

  $('laporView').addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || sending) return;
    const a = el.dataset.a;
    if (a === 'keluar') return logout();
    if (a === 'masukAdmin') {
      const k = ($('kodeAdmin').value || '').trim();
      if (!k) return toast('Ketik kode admin dulu');
      kode = k; store('cw_kode', k); mintaAdmin = true;
      return reload(data.today);
    }
    if (a === 'gps') return ambilLokasi(true);
    if (a === 'hapusFoto') { draft.foto = null; draft.fotoKb = 0; }
    if (a === 'modeTidak') draft.tidak = true;
    if (a === 'modeHadir') draft.tidak = false;
    if (a === 'alasan') draft.alasan = el.dataset.v;
    if (a === 'kirimDatang' || a === 'kirimSelesai') {
      const r = myRow();
      if (!okLokasi(r)) return toast(draft.lat == null ? 'Lokasi GPS belum didapat' : 'Anda di luar radius ' + radius() + ' m dari titik');
      return kirimLapor(a === 'kirimDatang' ? 'datang' : 'selesai', 'H');
    }
    if (a === 'kirimTidak') {
      if (!draft.alasan) return toast('Ketuk salah satu alasan dulu');
      return kirimLapor('tidak', draft.alasan);
    }
    renderLapor();
  });

  // jam berjalan: ganti fase otomatis (mis. 07.00 → Lapor Selesai) dan segarkan lokasi tiap menit
  let detak = 0;
  setInterval(() => {
    if (!data || mode !== 'lapor' || $('app').hidden || sending || document.hidden) return;
    const r = myRow();
    if (!r) return;
    const f = fase(r);
    const mengetik = document.activeElement && document.activeElement.id === 'laporNote';
    if (f !== lastFase || (f === 'tunggu' && !mengetik)) renderLapor();
    if (++detak % 3 === 0 && ['datang', 'tunggu', 'selesai'].includes(f)) ambilLokasi();
  }, 20000);
  $('laporView').addEventListener('input', (e) => { if (e.target.id === 'laporNote') draft.note = e.target.value; });
  $('laporView').addEventListener('change', async (e) => {
    if (e.target.id !== 'foto' || !e.target.files[0]) return;
    try {
      draft.foto = await kecilkanFoto(e.target.files[0]);
      draft.fotoKb = Math.round(draft.foto.length * 0.75 / 1024);
    } catch (err) { toast('Foto tidak bisa dibaca'); }
    renderLapor();
  });
  $('mode').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !data || b.dataset.m === mode) return;
    if (b.dataset.m === 'lapor' && dirtyCount() && data.day !== data.today &&
      !confirm('Perubahan rekap yang belum disimpan akan hilang. Lanjut?')) return;
    mode = b.dataset.m;
    store('cw_mode', mode);
    if (mode === 'lapor' && myRow() && draft.lat == null) ambilLokasi();
    render();
    window.scrollTo(0, 0);
  };

  // anggota: "Keluar" (ganti akun NRP); admin: "Bukan saya" (pilih nama lain)
  // NRP admin yang belum memasukkan kode: form untuk membuka Rekap
  function adminBox() {
    if (data.role !== 'anggota' || !data.bisaAdmin) return '';
    return '<div class="step"><h3>Admin <small>buka menu Rekap</small></h3><div class="admin-row">' +
      '<input class="note-in" id="kodeAdmin" type="password" autocomplete="off" placeholder="Kode admin">' +
      '<button class="btn primary" data-a="masukAdmin">Buka Rekap</button></div></div>';
  }

  function gantiBtn() { return '<button class="link muted-link" data-a="keluar">Keluar</button>'; }

  function logout() {
    pin = '';
    store('cw_pin', '');
    kode = '';
    store('cw_kode', '');
    data = null;
    draft = newDraft();
    $('pin').value = '';
    showLogin('');
  }

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
  $('btnLogout').onclick = () => { if (!dirtyCount() || confirm('Perubahan belum disimpan akan hilang. Keluar?')) logout(); };
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
