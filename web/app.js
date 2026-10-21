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
  let draft = newDraft();                  // isian form Lapor CW yang belum dikirim
  let sending = false;
  let memuat = false;                      // sedang mengambil data terbaru dari server
  const CARI_GPS = 'Mencari lokasi GPS…';

  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

  // data terakhir disimpan di HP agar Lapor CW langsung tampil saat dibuka, lalu diperbarui dari server
  function tglLokal() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function simpanCache(d) { store('cw_data', JSON.stringify({ pin, tgl: tglLokal(), d })); }
  function bacaCache() {
    try {
      const c = JSON.parse(load('cw_data') || 'null');
      return c && c.pin === pin && c.tgl === tglLokal() ? c.d : null;   // hanya data hari ini milik NRP ini
    } catch (e) { return null; }
  }

  // ---------- antrean kirim: laporan disimpan di HP SEBELUM dikirim, dihapus setelah server menjawab ----------
  // Sinyal putus / aplikasi tertutup saat mengirim: laporan terkirim otomatis saat aplikasi dibuka lagi.
  // Server memakai jam lapor asli (waktuMs) dan idKirim agar laporan yang sama tidak tercatat dua kali.
  const ANTRE = 'cw_antre';
  let mengirimAntre = false;
  let pesanAntre = '';   // laporan tertunda yang ditolak server (mis. terlambat), ditampilkan sampai ditutup
  function bacaAntre() { try { return JSON.parse(load(ANTRE) || '[]'); } catch (e) { return []; } }
  function tulisAntre(q) {
    try { if (q.length) localStorage.setItem(ANTRE, JSON.stringify(q)); else localStorage.removeItem(ANTRE); return true; }
    catch (e) { return false; }   // memori browser penuh: laporan tetap dikirim, hanya tidak tersimpan
  }
  // antrean milik NRP ini untuk hari ini (laporan hari lain tidak bisa dikirim lagi)
  function antreSaya() { return bacaAntre().filter((x) => x.pin === pin && x.tgl === tglLokal()); }
  function buangAntre(id) { tulisAntre(bacaAntre().filter((x) => x.body.idKirim !== id)); }

  // jawaban server yang berarti "coba lagi nanti", bukan laporan ditolak
  function errSementara(msg) { return /sibuk|Service invoked too many times|timed out/i.test(msg); }

  async function postLapor(body) {
    let res, out;
    try {
      res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      out = await res.json();
    } catch (e) {
      return { putus: true };   // tidak ada sinyal, atau server tidak menjawab dengan benar
    }
    if (out.error && errSementara(out.error)) return { putus: true, error: out.error };
    return out;
  }

  // kirim laporan yang tertunda satu per satu, berurutan (Datang sebelum Selesai)
  async function kirimAntre() {
    if (mengirimAntre || sending || !pin || !navigator.onLine || !antreSaya().length) return;
    mengirimAntre = true;
    segarkanLapor();
    let terkirim = 0, ditolak = 0;
    try {
      // dibaca ulang tiap putaran: laporan baru yang ditambahkan selama mengirim ikut terkirim
      for (let x = antreSaya()[0]; x; x = antreSaya()[0]) {
        const out = await postLapor(x.body);
        if (out.putus) break;
        buangAntre(x.body.idKirim);
        if (out.error) { ditolak++; pesanAntre = 'Laporan ' + x.jam + ' yang tertunda ditolak server: ' + out.error; }
        else terkirim++;
      }
    } finally {
      mengirimAntre = false;
    }
    if (terkirim) toast('✓ Laporan tertunda sudah terkirim');
    if (data && (terkirim || ditolak)) await reload(data.today);
    else segarkanLapor();
  }
  // gambar ulang Lapor CW, kecuali sedang mengetik catatan (agar keyboard tidak tertutup)
  function segarkanLapor() {
    const ketik = document.activeElement && ['laporNote', 'ckNote'].includes(document.activeElement.id);
    if (!data || sending || ketik) return;
    if (mode === 'lapor') renderLapor(); else if (mode === 'ceklok' && data.ceklok) renderCeklok();
  }
  window.addEventListener('online', () => kirimAntre());

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
    memuat = true;
    if (data && mode === 'lapor' && !sending) renderLapor(); else if (!data) renderMemuat();
    try {
      const d = await fetchData(day);
      memuat = false;
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
      if (!day || day === d.today) simpanCache(d);
      if (d.now != null) jamSync = { now: d.now, at: Date.now() };
      if (d.serverMs) jamServer = { ms: d.serverMs, perf: performance.now() };
      // tombol Rekap dihapus: Lapor CW (CW Pagi) dan, untuk anggota Satpas, Ceklok Satpas
      $('mode').hidden = false;
      mode = d.ceklok && (mode === 'ceklok' || !d.me || hanyaCeklok(d)) ? 'ceklok' : 'lapor';
      me = d.me ? String(d.me) : '';
      mintaAdmin = false;
      edits = {};
      noteEdits = {};
      showNeed = false;
      render();
      const r = mode === 'lapor' && myRow();
      if (r && ['datang', 'tunggu', 'selesai'].includes(fase(r)) && draft.lat == null && !draft.gpsMsg) ambilLokasi();
      if (mode === 'ceklok' && ['masuk', 'pulang'].includes(ckFase()) && draft.lat == null && !draft.gpsMsg) ambilLokasi();
    } catch (err) {
      memuat = false;
      toast('Gagal memuat: ' + err.message);
      if (data && mode === 'lapor' && !sending) renderLapor();
      else if (!data) $('laporView').innerHTML = '<section class="card"><div class="gps out"><b>Gagal memuat data</b>' +
        'Periksa sinyal internet lalu ketuk tab di atas untuk mencoba lagi.</div></section>';
    } finally {
      memuat = false;
      $('btnReload').disabled = false;
    }
  }

  // belum ada data tersimpan: tampilkan tanda memuat, bukan layar kosong
  function renderMemuat() {
    $('laporView').hidden = false;
    $('laporView').innerHTML = '<section class="card"><div class="gps"><b>⟳ Memuat data…</b>' +
      'Mengambil jadwal & titik plotting dari server (biasanya 2–5 detik).</div></section>';
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
    if (mode === 'ceklok' && !data.ceklok) mode = 'lapor';
    if (mode === 'lapor' && hanyaCeklok(data)) mode = 'ceklok';
    if ($('btnModeLapor')) $('btnModeLapor').hidden = hanyaCeklok(data);
    [...$('mode').children].forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('btnModeCeklok').hidden = !data.ceklok;
    $('laporView').hidden = mode !== 'lapor';
    $('rekapView').hidden = mode !== 'rekap';
    $('ceklokView').hidden = mode !== 'ceklok';
    if (mode === 'ceklok') {
      $('saveBar').hidden = true;
      return renderCeklok();
    }
    if (mode === 'lapor') {
      $('saveBar').hidden = true;
      // Lapor CW selalu untuk hari ini
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
  // baris saya: laporan yang masih di antrean HP dianggap sudah dilakukan (tanda antre), agar langkah berikutnya bisa lanjut
  function laporOf(r) {
    let l = (data.lapor || {})[String(r.no)];
    if (String(r.no) !== String(me)) return l;
    if (ulangCW && l && l.st) l = undefined;   // uji coba: mulai putaran lapor baru
    const q = antreSaya().filter((x) => x.jenis !== 'ceklok');
    if (!q.length) return l;
    const o = Object.assign({}, l);
    q.forEach((x) => {
      const item = { jam: x.jam, antre: true, dist: null };
      if (x.tahap === 'datang') { if (!o.datang) o.datang = item; }
      else if (x.tahap === 'selesai') { o.selesai = item; o.st = o.st || 'H'; }
      else if (x.tahap === 'tinggal') { item.ket = x.body.jenis + ': ' + x.body.note; o.tinggal = item; o.st = o.st || 'H'; }
      else if (!o.st) { o.tidak = item; o.st = x.body.st; }
    });
    o.antre = q.length;
    return o;
  }
  // masa uji coba: laporan / ceklok yang sudah selesai boleh diulang
  let ulangCW = false, ulangCk = false;
  function ulangBtn() {
    return data && data.bebasWaktu ? '<div class="switch" style="margin-top:14px"><button class="btn" data-a="ulangi">🔁 Ulangi (uji coba)</button></div>' : '';
  }
  function adaAntre() { return data && me && antreSaya().length > 0; }
  function antreHtml() {
    let h = '';
    if (adaAntre()) {
      h += '<div class="step"><div class="gps out"><b>⏳ Laporan tersimpan di HP, belum terkirim</b>' +
        (mengirimAntre ? 'Sedang mengirim…' : 'Akan terkirim otomatis saat ada sinyal. Jangan hapus data browser.') +
        '<div class="mini"><button data-a="kirimAntre"' + (mengirimAntre ? ' disabled' : '') + '>⟳ Kirim sekarang</button></div></div></div>';
    }
    if (pesanAntre) {
      h += '<div class="step"><div class="gps out"><b>✕ ' + esc(pesanAntre) + '</b>Hubungi admin bila perlu.' +
        '<div class="mini"><button data-a="tutupPesanAntre">Tutup</button></div></div></div>';
    }
    return h;
  }
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
    else if (l.tinggal) html += ' · 🚨 tinggalkan lokasi ' + esc(l.tinggal.jam) + ' <span class="badge far">tugas mendadak</span>' +
      (l.tinggal.ket ? ' ' + esc(l.tinggal.ket) : '');
    else if (d) html += ' <span class="badge far">⏳ belum Lapor Selesai</span>';
    if (l.diperiksa) html += ' <span class="badge far">⚠️ lokasi diragukan, dicatat Nihil</span>';
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

  // ---------- Lapor CW (anggota melapor sendiri) ----------
  function newDraft() {
    return { lat: null, lng: null, acc: null, gpsMsg: '', note: '', tidak: false, alasan: '',
      foto: '', fotoMs: 0, kameraGagal: '', posAt: 0, tinggal: false, jenis: '' };
  }
  // PHL Satpas (PANGKAT "PHL" di sheet Data spreadsheet Satpas) tidak ikut CW Pagi: hanya tab Ceklok Satpas.
  // Anggota Polri Satpas melihat Lapor CW + Ceklok Satpas, anggota lain hanya Lapor CW.
  function hanyaCeklok(d) { return !!(d && d.ceklok && /^PHL$/i.test(String(d.ceklok.pangkat || '').trim())); }
  function myRow() { return me && data.rows.find((r) => String(r.no) === String(me)); }
  // personel pos jaga melapor di baris "Pos 12.04 …": tampilkan nama aslinya (dari ANGGOTA)
  function namaSaya(r) { return data.nama || (r && r.petugas) || (data.ceklok && data.ceklok.nama) || ''; }

  function jarakM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- jam lapor: pakai jam server agar tidak bisa diakali dengan mengubah jam HP ----------
  let jamSync = { now: null, at: 0 };
  // jam server (ms) untuk watermark foto; performance.now() tidak ikut berubah bila jam HP diubah
  let jamServer = null;
  function serverNowMs() { return jamServer ? jamServer.ms + (performance.now() - jamServer.perf) : null; }
  let lastFase = '';
  function menitSekarang() {
    if (jamSync.now == null) { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
    return jamSync.now + (Date.now() - jamSync.at) / 60000;
  }
  function jamTeks(m) { m = Math.floor(m); return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0'); }
  function J() { return data.jadwal || { buka: 360, batasDatang: 390, mulaiSelesai: 420, tutup: 435 }; }

  // fase Lapor CW: belumBuka → datang → tunggu → selesai → beres; telat/tutup bila waktunya lewat
  // masa uji coba (data.bebasWaktu): tanpa batas jam, datang → selesai → beres
  function fase(r) {
    const l = laporOf(r) || {}, m = menitSekarang(), j = J();
    if (l.st) return 'beres';
    // tinggal: Tinggalkan Lokasi (tugas mendadak), kapan saja setelah Lapor Datang
    if (data.bebasWaktu) return draft.tidak ? 'tidak' : draft.tinggal && l.datang ? 'tinggal' : l.datang ? 'selesai' : 'datang';
    if (m < j.buka) return 'belumBuka';
    if (m > j.tutup) return 'tutup';
    if (draft.tidak) return 'tidak';
    if (draft.tinggal && l.datang) return 'tinggal';
    if (!l.datang) return m <= j.batasDatang ? 'datang' : 'telat';
    return m < j.mulaiSelesai ? 'tunggu' : 'selesai';
  }

  // masa uji coba (data.bebasWaktu): GPS & radius tidak wajib, lokasi tetap dicatat bila ada
  function okLokasi(r) { return data.bebasWaktu || (draft.lat != null && (r.lat == null || jarakM(draft, r) <= radius())); }

  function gpsHtml(r) {
    if (draft.lat == null) {
      return draft.gpsMsg && draft.gpsMsg !== CARI_GPS ? '<div class="gps"><b>' + esc(draft.gpsMsg) + '</b></div>'
        : '<div class="gps"><b>📡 Mencari lokasi GPS…</b>Biasanya 2–15 detik, lebih cepat di luar ruangan.</div>';
    }
    const peta = '<a href="https://maps.google.com/?q=' + draft.lat.toFixed(6) + ',' + draft.lng.toFixed(6) + '" target="_blank" rel="noopener">lihat peta</a>';
    const akurasi = 'akurasi ±' + Math.round(draft.acc) + ' m · ' + peta;
    if (r.lat == null) {
      return '<div class="gps ok"><b>✓ Lokasi didapat</b>' + akurasi +
        '<br><small>Koordinat titik ini belum diisi admin, jarak belum dicek.</small></div>';
    }
    const d = jarakM(draft, r);
    return d <= radius()
      ? '<div class="gps ok"><b>✓ Di dalam radius titik</b>' + fmtJarak(d) + ' dari titik (maks ' + radius() + ' m) · ' + akurasi + '</div>'
      : '<div class="gps out"><b>✕ Di luar radius' + (data.bebasWaktu ? ' (uji coba: tetap bisa lapor)' : ' — belum bisa lapor') + '</b>' +
        fmtJarak(d) + ' dari titik ' + esc(r.lokasi) +
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
        '<p class="sub">Lapor CW hanya untuk personil yang terjadwal di plotting CW Pagi.' +
        (data.ceklok ? ' Untuk absen dinas kantor, buka tab <b>Ceklok Satpas</b>.' : '') + ' ' + gantiBtn() + '</p></section>';
      return;
    }
    const l = laporOf(r) || {};
    const f = lastFase = fase(r);
    if (f === 'beres') return renderSelesai(r, l);
    const j = J(), m = menitSekarang();
    const jadwalTeks = 'Lapor Datang ' + jamTeks(j.buka) + '–' + jamTeks(j.batasDatang) +
      ', Lapor Selesai ' + jamTeks(j.mulaiSelesai) + '–' + jamTeks(j.tutup) + ', dalam radius ' + radius() + ' m dari titik.';
    const tidakLink = '<div class="switch"><button class="link muted-link" data-a="modeTidak">Tidak bisa hadir hari ini?</button></div>';
    const tinggalLink = '<div class="switch"><button class="btn tinggal" data-a="modeTinggal">🚨 Ada tugas mendadak? Tinggalkan lokasi</button></div>';
    const gpsStep = '<div class="step"><h3>Lokasi <small>otomatis</small></h3><div id="gpsBox">' + gpsHtml(r) + '</div>' +
      '<div class="mini"><button data-a="gps">⟳ Ambil ulang lokasi</button></div></div>';
    const noteStep = '<div class="step"><h3>Catatan <small>opsional</small></h3>' +
      '<input class="note-in" id="laporNote" maxlength="300" placeholder="' +
      (draft.tidak ? 'Mis. digantikan oleh …' : 'Mis. arus padat, ada kecelakaan kecil …') + '" value="' + esc(draft.note) + '"></div>';
    const fotoStep = '<div class="step"><h3>Foto <small>wajib, langsung dari kamera</small></h3><div id="fotoBox">' + fotoHtml() + '</div></div>';
    const tombol = (aksi, label) => '<button class="btn big h" id="btnKirim" data-a="' + aksi + '"' +
      (sending || !okLokasi(r) || !okFoto() ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : label) + '</button>';

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
      body = info(l.datang.antre ? '⏳ Lapor Datang pukul ' + esc(l.datang.jam) + ' (belum terkirim)' : '✓ Lapor Datang tercatat pukul ' + esc(l.datang.jam),
        'Tetap di lokasi. Lapor Selesai dibuka pukul ' + jamTeks(j.mulaiSelesai) + ' (' + Math.max(1, Math.ceil(j.mulaiSelesai - m)) +
        ' menit lagi). Tanpa Lapor Selesai di lokasi, kehadiran tidak dihitung.') + gpsStep + tinggalLink;
    } else if (f === 'datang') {
      body = info('Langkah 1 dari 2: Lapor Datang', data.bebasWaktu ? 'Lapor Selesai sesudahnya di titik yang sama.'
        : 'Batas pukul ' + jamTeks(j.batasDatang) + '. Lapor Selesai pukul ' +
        jamTeks(j.mulaiSelesai) + '–' + jamTeks(j.tutup) + ' di titik yang sama.') +
        gpsStep + fotoStep + noteStep + tombol('kirimDatang', '📍 Lapor Datang') + tidakLink;
    } else if (f === 'selesai') {
      body = info('Langkah 2 dari 2: Lapor Selesai', 'Datang ' + (l.datang.antre ? 'pukul ' + esc(l.datang.jam) + ' (belum terkirim)' : 'tercatat pukul ' + esc(l.datang.jam)) + '.' +
        (data.bebasWaktu ? '' : ' Batas Lapor Selesai pukul ' + jamTeks(j.tutup) + '.')) +
        gpsStep + fotoStep + noteStep + tombol('kirimSelesai', '✓ Lapor Selesai') + tinggalLink;
    } else if (f === 'tinggal') {
      const jenisList = data.tugasMendadak || ['Laka lantas', 'Pengawalan/Patwal', 'Perintah pimpinan', 'Kejadian darurat', 'Lainnya'];
      body = info('🚨 Tinggalkan Lokasi – Tugas Mendadak', 'Datang ' + (l.datang.antre ? 'pukul ' + esc(l.datang.jam) + ' (belum terkirim)' : 'tercatat pukul ' + esc(l.datang.jam)) +
          '. Kehadiran hari ini tetap tercatat (H). Setelah dikirim, Lapor Selesai tidak diperlukan.') +
        '<div class="step"><h3>Jenis tugas <small>wajib</small></h3><div class="chips">' + jenisList.map((j) =>
          '<button data-a="jenis" data-v="' + esc(j) + '"' + (draft.jenis === j ? ' class="on"' : '') + '>' + esc(j) + '</button>').join('') +
        '</div></div>' +
        '<div class="step"><h3>Keterangan singkat <small>wajib</small></h3>' +
        '<input class="note-in" id="laporNote" maxlength="300" placeholder="Mis. laka di Jl. A. Yani depan pasar, perintah Kanit" value="' +
          esc(draft.note) + '"></div>' +
        '<button class="btn big w" data-a="kirimTinggal"' + (sending ? ' disabled' : '') + '>' +
          (sending ? 'Mengirim…' : '🚨 Kirim: Tinggalkan Lokasi') + '</button>' +
        '<div class="switch"><button class="link muted-link" data-a="modeHadir">← Kembali</button></div>';
    } else if (f === 'tidak') {
      body = '<div class="step"><h3>Alasan tidak hadir</h3><div class="chips">' + reasons().map((c) =>
          '<button data-a="alasan" data-v="' + esc(c.code) + '"' + (draft.alasan === c.code ? ' class="on"' : '') + '>' + esc(c.label) + '</button>').join('') +
        '</div></div>' + noteStep +
        '<button class="btn big t" data-a="kirimTidak"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : 'Kirim: Tidak Hadir') + '</button>' +
        '<div class="switch"><button class="link muted-link" data-a="modeHadir">← Kembali</button></div>';
    }

    v.innerHTML =
      '<section class="card">' +
        '<div class="who"><div><b>' + esc(namaSaya(r)) + '</b><div class="loc">' + esc(r.lokasi) + ' · ' + esc(r.wilayah) + (data.piket ? '<br>' + esc(data.piket) : '') + '</div></div>' +
          gantiBtn() + '</div>' +
        '<p class="sub" style="margin:8px 0 0">' + dateLabel() + ' · pukul ' + jamTeks(m) +
          (memuat ? ' · <span class="muted">⟳ memperbarui…</span>' : '') + '</p>' +
        antreHtml() + body +
      '</section>';
  }

  function renderSelesai(r, l) {
    const hadir = l.st === 'H';
    const note = savedNote(r);
    const d = l.datang, s = l.selesai || l.tinggal, t = l.tidak;
    if (l.antre) {
      // laporan terakhir masih di HP (sinyal putus): belum tercatat di server
      $('laporView').innerHTML =
        '<section class="card done w">' +
          '<div class="ic">⏳</div>' +
          '<h2 class="t">Laporan belum terkirim</h2>' +
          '<p class="sub">' + esc(namaSaya(r)) + ' · ' + esc(r.lokasi) + '<br>' + dateLabel() + '</p>' +
          (t ? '<p class="sub">Tidak hadir (' + esc(labelOf(l.st)) + ') pukul ' + esc(t.jam) + '</p>'
            : '<p class="sub">Datang ' + (d ? esc(d.jam) : '–') + ' · ' + (l.tinggal ? 'Meninggalkan lokasi ' : 'Selesai ') + (s ? esc(s.jam) : '–') + '</p>') +
          antreHtml() +
          ulangBtn() + '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div>' +
        '</section>';
      return;
    }
    if (l.tinggal && !l.diperiksa) {
      // meninggalkan lokasi karena tugas mendadak: tetap hadir, poin hari ini netral
      $('laporView').innerHTML =
        '<section class="card done w">' +
          '<div class="ic">🚨</div>' +
          '<h2 class="t">Meninggalkan lokasi – tugas mendadak</h2>' +
          '<p class="sub">' + esc(namaSaya(r)) + ' · ' + esc(r.lokasi) + '<br>' + dateLabel() + '</p>' +
          '<p class="sub">Datang ' + (d ? esc(d.jam) : '–') + ' · Meninggalkan lokasi ' + esc(l.tinggal.jam) + '</p>' +
          (l.tinggal.ket ? '<p class="sub">' + esc(l.tinggal.ket) + '</p>' : '') +
          '<span class="badge ok">✓ kehadiran tercatat</span>' +
          ulangBtn() + '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div>' +
        '</section>';
      return;
    }
    if (l.diperiksa && s) {
      // lokasi dicurigai (fake GPS): server mencatat Nihil sampai admin memeriksa
      $('laporView').innerHTML =
        '<section class="card done w">' +
          '<div class="ic">!</div>' +
          '<h2 class="t">Laporan diterima, menunggu verifikasi admin</h2>' +
          '<p class="sub">' + esc(namaSaya(r)) + ' · ' + esc(r.lokasi) + '<br>' + dateLabel() + '</p>' +
          '<p class="sub">Datang ' + (d ? esc(d.jam) : '–') + ' · Selesai ' + esc(s.jam) + '</p>' +
          '<span class="badge far">⚠️ lokasi perlu dicek admin</span>' +
          '<p class="sub" style="margin-top:8px">Kehadiran belum dihitung. Bila Anda memang di titik, hubungi admin.</p>' +
          ulangBtn() + '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div>' +
        '</section>';
      return;
    }
    $('laporView').innerHTML =
      '<section class="card done' + (hadir ? '' : ' t') + '">' +
        '<div class="ic">' + (hadir ? '✓' : '✕') + '</div>' +
        '<h2 class="t">' + (hadir ? 'Kehadiran tercatat' : 'Laporan tidak hadir terkirim') + '</h2>' +
        '<p class="sub">' + esc(namaSaya(r)) + ' · ' + esc(r.lokasi) + '<br>' + dateLabel() + '</p>' +
        (hadir
          ? '<p class="sub">Datang ' + (d ? esc(d.jam) : '–') + ' · Selesai ' + (s ? esc(s.jam) : '–') + '</p>' +
            '<span class="badge ok">✓ lengkap</span>' + cekJarak(s)
          : '<p class="sub">pukul ' + esc(t ? t.jam : '') + '</p><span class="badge th">' + esc(labelOf(l.st)) + '</span>') +
        (note ? '<p class="sub" style="margin-top:8px">📝 ' + esc(note) + '</p>' : '') +
        ulangBtn() + '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div>' +
      '</section>';
  }

  // perbarui kotak lokasi & tombol kirim tanpa menggambar ulang form (isian catatan tidak hilang)
  function updateGps() {
    if (!data || mode !== 'lapor') return;   // GPS bisa selesai sebelum data dari server tiba
    const r = myRow();
    if (!r || !$('gpsBox')) return render();
    $('gpsBox').innerHTML = gpsHtml(r);
    if ($('btnKirim')) $('btnKirim').disabled = sending || !okLokasi(r) || !okFoto();
  }

  // ---------- Foto langsung dari kamera (bukan galeri), watermark nama petugas & jam server ----------
  const FOTO_MAKS_MENIT = 9;   // server menolak foto > 10 menit; beri sedikit kelonggaran
  // masa uji coba: bila kamera tidak bisa dibuka, tetap boleh lapor tanpa foto
  function okFoto() { return !!draft.foto || (data.bebasWaktu && !!draft.kameraGagal); }
  // petunjuk isi foto: Datang = petugas di titik, Selesai = kondisi arus terakhir
  function petunjukFoto() {
    if (mode === 'ceklok') {
      return ckFase() === 'pulang' ? 'Foto Ceklok Pulang: tampilkan Anda di kantor Satpas.' : 'Foto Ceklok Masuk: tampilkan Anda di kantor Satpas.';
    }
    return fase(myRow()) === 'datang'
      ? 'Foto Lapor Datang: tampilkan Anda sedang berada di titik pengaturan.'
      : 'Foto Lapor Selesai: tampilkan kondisi arus lalu lintas terakhir di titik.';
  }
  // pengingat di layar kamera: foto dinilai atasan (kolom CEK FOTO) dan ikut unsur Kejujuran Lokasi & Foto
  function cekFotoHtml() {
    const wajah = mode === 'ceklok' || fase(myRow()) === 'datang';   // Lapor Selesai = foto arus lalu lintas
    const baris = [];
    if (wajah) {
      baris.push('😀 Wajah terlihat jelas' + (arahKamera === 'user' ? '' : ' — ketuk 🔄 untuk kamera depan'));
      baris.push(data.seragam ? '👮 Seragam hari ini: <b>' + esc(data.seragam) + '</b>' : '👮 Seragam & atribut lengkap sesuai jadwal');
    }
    baris.push('📍 Ambil langsung di lokasi, jangan memotret layar HP / foto lain');
    return '<ul class="cek-foto">' + baris.map((b) => '<li>' + b + '</li>').join('') + '</ul>';
  }
  function fotoHtml() {
    if (draft.foto) {
      return '<div class="foto-ok"><img src="' + draft.foto + '" alt="Foto lapor"></div>' +
        '<div class="mini"><button data-a="kamera">📷 Ulangi foto</button></div>';
    }
    return '<p class="foto-tip">' + esc(petunjukFoto()) + '</p>' + (draft.kameraGagal
      ? '<div class="gps out"><b>Kamera tidak bisa dibuka</b>' + esc(draft.kameraGagal) +
        (data.bebasWaktu ? '<br><small>Uji coba: tetap bisa lapor tanpa foto.</small>' : '') + '</div>'
      : '') +
      '<button class="btn cam" data-a="kamera">📷 Buka kamera</button>';
  }
  function updateFoto() {
    if (data && mode === 'ceklok') {
      if ($('ckFotoBox')) $('ckFotoBox').innerHTML = fotoHtml();
      if ($('ckKirim')) $('ckKirim').disabled = sending || !okLokasiCk() || !okFoto();
      return;
    }
    if (!data || mode !== 'lapor') return;
    const r = myRow();
    if (!r || !$('fotoBox')) return;
    $('fotoBox').innerHTML = fotoHtml();
    if ($('btnKirim')) $('btnKirim').disabled = sending || !okLokasi(r) || !okFoto();
  }

  function zonaTeks(tz) { return { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' }[tz] || tz; }
  function watermark(ms) {
    const r = myRow(), tz = data.tz || 'Asia/Jakarta', d = new Date(ms);
    const nama = mode === 'ceklok' && data.ceklok ? data.ceklok.nama : namaSaya(r);
    const tgl = new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    const jam = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    // cukup nama petugas dan tanggal (jam server); lokasi & koordinat tetap tercatat di LOG LAPOR
    return [mode === 'ceklok' ? nama + ' · Ceklok Satpas' : nama, tgl + ' · ' + jam + ' ' + zonaTeks(tz)];
  }

  // kamera belakang ('environment') atau depan ('user'); pilihan terakhir diingat di HP
  let arahKamera = 'environment';
  try { if (localStorage.getItem('cw-kamera') === 'user') arahKamera = 'user'; } catch (e) { /* abaikan */ }
  function mintaKamera(arah) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: arah }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false
    });
  }

  async function bukaKamera() {
    if (serverNowMs() == null) return toast('Jam server belum didapat. Ketuk tab di atas untuk memuat ulang.');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      draft.kameraGagal = 'HP/browser tidak mendukung kamera';
      return updateFoto();
    }
    let stream;
    try {
      stream = await mintaKamera(arahKamera);
    } catch (err) {
      draft.kameraGagal = err.name === 'NotAllowedError'
        ? 'Izin kamera ditolak — izinkan akses kamera untuk situs ini, lalu coba lagi'
        : 'Kamera tidak bisa dibuka (' + err.name + ')';
      return updateFoto();
    }
    draft.kameraGagal = '';
    const el = document.createElement('div');
    el.className = 'kamera';
    el.innerHTML = '<div class="kamera-tip">' + esc(petunjukFoto()) + '<div class="cek-isi"></div></div>' +
      '<video playsinline autoplay muted></video><div class="siapkan">Menyiapkan kamera…</div><div class="wm"></div>' +
      '<div class="kamera-bar"><button class="btn" data-k="batal">Batal</button>' +
      '<button class="btn putar" data-k="putar" aria-label="Ganti kamera depan / belakang" hidden>🔄</button>' +
      '<button class="btn h" data-k="jepret">📷 Ambil Foto</button></div>';
    document.body.appendChild(el);
    const video = el.querySelector('video');
    // Kamera (terutama depan) di HP sering mulai dengan resolusi/arah sementara lalu menyesuaikan 1–3 kali
    // (ukuran berganti mendatar ↔ tegak). Pratinjau baru ditampilkan setelah ukurannya stabil ±0,5 detik,
    // agar tidak terlihat berputar-putar; tombol Ambil Foto menunggu sampai siap.
    let tungguStabil = null;
    const belumStabil = () => {
      el.classList.remove('siap');
      clearTimeout(tungguStabil);
      tungguStabil = setTimeout(() => { if (video.videoWidth) el.classList.add('siap'); }, 500);
    };
    video.addEventListener('loadedmetadata', belumStabil);
    video.addEventListener('resize', belumStabil);
    const pasang = () => {
      el.classList.remove('siap');
      video.srcObject = stream;
      el.classList.toggle('depan', arahKamera === 'user');
      el.querySelector('.cek-isi').innerHTML = cekFotoHtml();
    };
    // aplikasi terpasang (layar penuh): kunci tegak selama kamera terbuka agar layar tidak ikut berputar saat HP dimiringkan
    try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* tidak didukung */ }
    pasang();
    // tombol ganti kamera hanya bila HP punya lebih dari satu kamera
    navigator.mediaDevices.enumerateDevices().then((d) => {
      if (d.filter((x) => x.kind === 'videoinput').length > 1) el.querySelector('[data-k="putar"]').hidden = false;
    }).catch(() => {});
    let ganti = false;
    const putarKamera = async () => {
      if (ganti) return;
      ganti = true;
      const arah = arahKamera === 'user' ? 'environment' : 'user';
      // HP umumnya hanya boleh membuka satu kamera sekaligus: matikan yang lama dulu
      stream.getTracks().forEach((t) => t.stop());
      try {
        stream = await mintaKamera(arah);
        arahKamera = arah;
        try { localStorage.setItem('cw-kamera', arah); } catch (e) { /* abaikan */ }
      } catch (err) {
        toast('Kamera ' + (arah === 'user' ? 'depan' : 'belakang') + ' tidak bisa dibuka');
        try { stream = await mintaKamera(arahKamera); } catch (e) { ganti = false; return tutup(); }
      }
      ganti = false;
      // kamera ditutup (Batal) selagi berganti: matikan kamera yang baru terbuka
      if (!el.isConnected) return stream.getTracks().forEach((t) => t.stop());
      pasang();
    };
    const tulis = () => { el.querySelector('.wm').innerHTML = watermark(serverNowMs()).map(esc).join('<br>'); };
    tulis();
    const timer = setInterval(tulis, 500);
    const tutup = () => {
      clearInterval(timer); clearTimeout(tungguStabil);
      stream.getTracks().forEach((t) => t.stop()); el.remove();
      try { screen.orientation.unlock(); } catch (e) { /* tidak didukung */ }
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      if (b.dataset.k === 'batal') return tutup();
      if (b.dataset.k === 'putar') return putarKamera();
      if (!video.videoWidth || !el.classList.contains('siap')) return toast('Kamera belum siap, tunggu sebentar');
      const ms = serverNowMs();
      draft.foto = jepret(video, watermark(ms));
      draft.fotoMs = Math.round(ms);
      tutup();
      updateFoto();
    });
  }

  // gambar frame kamera + pita watermark di bawah, dikecilkan (maks 1280 px, JPEG ±100–250 KB)
  function jepret(video, lines) {
    const s = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * s), h = Math.round(video.videoHeight * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(video, 0, 0, w, h);
    const fs = Math.max(13, Math.round(w / 42)), pad = Math.round(fs * 0.6), lh = Math.round(fs * 1.35);
    const tinggi = pad * 2 + lh * lines.length;
    g.fillStyle = 'rgba(0, 0, 0, .62)';
    g.fillRect(0, h - tinggi, w, tinggi);
    g.fillStyle = '#fff';
    g.textBaseline = 'top';
    lines.forEach((t, i) => {
      g.font = (i === 0 ? 'bold ' : '') + fs + 'px sans-serif';
      g.fillText(t, pad, h - tinggi + pad + i * lh, w - pad * 2);
    });
    return c.toDataURL('image/jpeg', 0.72);
  }

  // ---------- GPS: dipantau terus (watchPosition), bukan diminta ulang dari nol ----------
  // Posisi pertama boleh dari cache HP (≤ 30 detik) agar kotak lokasi langsung terisi,
  // lalu makin akurat dengan sendirinya. Saat kirim dipakai posisi pantauan terbaru (≤ 15 detik).
  const GPS_SEGAR_MS = 15000;
  let pantauGps = null;
  let terakhirOk = null;   // status radius terakhir, agar peringatan "di luar radius" tidak berulang

  function terimaPosisi(pos) {
    draft.lat = pos.coords.latitude; draft.lng = pos.coords.longitude; draft.acc = pos.coords.accuracy;
    draft.posAt = pos.timestamp || Date.now();
    draft.gpsMsg = '';
    if (data && mode === 'ceklok') return updateCkGps();
    if (!data || mode !== 'lapor') return;
    updateGps();
    const r = myRow();
    if (!r) return;
    const ok = okLokasi(r);
    if (!ok && terakhirOk !== false && ['datang', 'tunggu', 'selesai'].includes(fase(r))) {
      toast(fase(r) === 'tunggu'
        ? 'Anda di luar radius ' + radius() + ' m! Kembali ke titik sebelum Lapor Selesai.'
        : 'Anda di luar radius ' + radius() + ' m dari titik. Laporan belum bisa dikirim.');
    }
    terakhirOk = ok;
  }

  function gagalPosisi(err) {
    if (err.code === 1) {   // izin ditolak: berhenti memantau
      draft.lat = null;
      draft.gpsMsg = 'Izin lokasi ditolak — izinkan akses lokasi untuk situs ini';
      hentikanGps();
    } else if (draft.lat == null) {
      draft.gpsMsg = 'Lokasi belum didapat, pastikan GPS aktif lalu ketuk Ambil ulang lokasi';
    }
    segarkanGps();
  }
  function segarkanGps() { if (mode === 'ceklok') updateCkGps(); else if (mode === 'lapor') updateGps(); }

  function hentikanGps() {
    if (pantauGps != null && navigator.geolocation) navigator.geolocation.clearWatch(pantauGps);
    pantauGps = null;
  }

  function ambilLokasi(manual) {
    if (!navigator.geolocation) { draft.gpsMsg = 'HP/browser tidak mendukung GPS'; segarkanGps(); return; }
    if (manual) {
      hentikanGps();
      draft.gpsMsg = CARI_GPS;
      const box = $(mode === 'ceklok' ? 'ckGpsBox' : 'gpsBox');
      if (box) box.innerHTML = '<div class="gps"><b>📡 Mencari lokasi GPS…</b></div>';
    } else if (pantauGps != null) {
      return;   // sudah dipantau
    } else if (draft.lat == null) {
      draft.gpsMsg = CARI_GPS;
    }
    pantauGps = navigator.geolocation.watchPosition(terimaPosisi, gagalPosisi,
      { enableHighAccuracy: true, maximumAge: manual ? 0 : 30000, timeout: 20000 });
  }

  // lokasi saat kirim: posisi pantauan bila masih segar; bila tidak, minta posisi baru (maks 10 detik)
  function lokasiBaru() {
    return new Promise((selesai) => {
      if (draft.posAt && Date.now() - draft.posAt <= GPS_SEGAR_MS) return selesai();
      if (!navigator.geolocation) return selesai();
      navigator.geolocation.getCurrentPosition((pos) => {
        draft.lat = pos.coords.latitude; draft.lng = pos.coords.longitude; draft.acc = pos.coords.accuracy;
        draft.posAt = pos.timestamp || Date.now();
        selesai();
      }, () => selesai(), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }

  // aplikasi disembunyikan (layar mati / pindah aplikasi): hentikan pantauan, lanjutkan saat dibuka lagi
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hentikanGps();
    else {
      if (data && (mode === 'lapor' && myRow() || mode === 'ceklok' && data.ceklok)) ambilLokasi();
      kirimAntre();
    }
  });

  async function kirimLapor(tahap, st) {
    const r = myRow();
    sending = true;
    renderLapor();
    try {
      // datang/selesai: wajib lokasi segar di radius + foto; tinggal: lokasi terakhir (bila ada) tanpa menunggu GPS
      const pakaiLokasi = tahap === 'datang' || tahap === 'selesai';
      const kirimGps = pakaiLokasi || tahap === 'tinggal';
      if (pakaiLokasi) {
        await lokasiBaru();
        if (!okLokasi(r)) throw new Error(draft.lat == null ? 'Lokasi GPS belum didapat' : 'Anda di luar radius ' + radius() + ' m dari titik');
      }
      const body = {
        pin, kode, action: 'lapor', tahap, no: r.no, st,
        lat: kirimGps ? draft.lat : null, lng: kirimGps ? draft.lng : null, acc: kirimGps ? draft.acc : null,
        foto: pakaiLokasi ? draft.foto : '', fotoMs: pakaiLokasi ? draft.fotoMs : 0,
        jenis: tahap === 'tinggal' ? draft.jenis : '',
        note: draft.note.trim(),
        idKirim: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
        waktuMs: Math.round(serverNowMs() || Date.now())   // jam lapor asli, dipakai server bila terkirim tertunda
      };
      // simpan di HP dulu: bila sinyal putus atau aplikasi tertutup, laporan tidak hilang
      const sebelumnya = antreSaya().length;
      const tersimpan = tulisAntre(bacaAntre().concat([{ pin, tgl: tglLokal(), tahap, jam: jamTeks(menitSekarang()), body }]));
      const kosongkanDraft = () => {
        const lat = draft.lat, lng = draft.lng, acc = draft.acc;
        draft = newDraft();
        if (tahap === 'datang') Object.assign(draft, { lat, lng, acc }); // lokasi tetap dipakai untuk pantauan
      };
      if (sebelumnya && tersimpan) {
        // masih ada laporan tertunda: kirim berurutan (Datang dulu, baru Selesai)
        kosongkanDraft();
        sending = false;
        toast('Laporan disimpan di HP, dikirim setelah laporan sebelumnya terkirim');
        renderLapor();
        return kirimAntre();
      }
      const out = await postLapor(body);
      if (out.putus) {
        if (!tersimpan) throw new Error('sinyal putus dan memori HP penuh, laporan belum tersimpan. Coba lagi.');
        kosongkanDraft();
        sending = false;
        renderLapor();
        window.scrollTo(0, 0);
        toast('Sinyal putus — laporan disimpan di HP dan terkirim otomatis saat ada sinyal');
        return;
      }
      buangAntre(body.idKirim);
      if (out.error) throw new Error(out.error);
      if (out.jam === undefined) throw new Error('Code.gs belum diperbarui untuk fitur Lapor');
      kosongkanDraft();
      if (tahap === 'datang' || tahap === 'tidak') ulangCW = false;
      toast(out.diperiksa ? 'Laporan tercatat pukul ' + out.jam + ', menunggu verifikasi admin'
        : tahap === 'datang' ? '✓ Lapor Datang tercatat pukul ' + out.jam
        : tahap === 'selesai' ? '✓ Lapor Selesai pukul ' + out.jam + ' — kehadiran dihitung'
        : tahap === 'tinggal' ? '✓ Tercatat meninggalkan lokasi pukul ' + out.jam + ' — kehadiran tetap dihitung'
        : '✓ Laporan terkirim pukul ' + out.jam);
      sending = false;
      await reload(data.today);
      window.scrollTo(0, 0);
    } catch (err) {
      sending = false;
      renderLapor();
      toast('Gagal mengirim: ' + err.message);
    }
  }

  // ---------- Ceklok Satpas: absen masuk & pulang dinas di kantor Satpas ----------
  const ck = { tidak: false, alasan: '', note: '', keluar: false, jenis: '' };   // isian Ceklok yang belum dikirim
  let lastCkFase = '';
  // ceklok hari ini dari server + yang masih di antrean HP
  function ckHari() {
    const dasar = data.ceklok.hariIni || {};
    const h = Object.assign({}, ulangCk && (dasar.pulang || dasar.keluar || dasar.tidak) ? {} : dasar);
    antreSaya().filter((x) => x.jenis === 'ceklok').forEach((x) => {
      const item = { jam: x.jam, antre: true };
      if (x.tahap === 'masuk' && !h.masuk) h.masuk = item;
      else if (x.tahap === 'pulang' && !h.pulang) h.pulang = item;
      else if (x.tahap === 'keluar' && !h.keluar) h.keluar = Object.assign(item, { ket: x.body.jenis + ': ' + x.body.note });
      else if (x.tahap === 'tidak' && !h.tidak) h.tidak = Object.assign(item, { kode: x.body.st });
    });
    return h;
  }
  // fase: libur / belumBuka → masuk → pulang → beres; izin; tutup bila waktunya lewat
  function ckFase() {
    const c = data.ceklok, h = ckHari(), m = menitSekarang(), bebas = data.bebasWaktu;
    if (h.tidak) return 'izin';
    if (h.pulang || h.keluar) return 'beres';
    if (!c.kerja && !bebas) return 'libur';
    if (h.masuk) return !bebas && m > c.tutup ? 'tutupPulang' : ck.keluar ? 'keluar' : 'pulang';
    if (ck.tidak) return 'tidak';
    if (!bebas && m < c.buka) return 'belumBuka';
    if (!bebas && m > c.tutup) return 'tutup';
    return 'masuk';
  }
  function okLokasiCk() { const c = data.ceklok; return data.bebasWaktu || (draft.lat != null && jarakM(draft, c) <= c.radius); }
  function labelIzin(k) { const c = (data.ceklok.izin || []).find((x) => x.code === k); return c ? c.label : k; }

  function gpsCkHtml() {
    const c = data.ceklok;
    if (draft.lat == null) {
      return draft.gpsMsg && draft.gpsMsg !== CARI_GPS ? '<div class="gps"><b>' + esc(draft.gpsMsg) + '</b></div>'
        : '<div class="gps"><b>📡 Mencari lokasi GPS…</b>Biasanya 2–15 detik.</div>';
    }
    const peta = '<a href="https://maps.google.com/?q=' + draft.lat.toFixed(6) + ',' + draft.lng.toFixed(6) + '" target="_blank" rel="noopener">lihat peta</a>';
    const akurasi = 'akurasi ±' + Math.round(draft.acc) + ' m · ' + peta;
    const d = jarakM(draft, c);
    return d <= c.radius
      ? '<div class="gps ok"><b>✓ Di kantor Satpas</b>' + fmtJarak(d) + ' dari titik ceklok (maks ' + c.radius + ' m) · ' + akurasi + '</div>'
      : '<div class="gps out"><b>✕ Di luar kantor Satpas' + (data.bebasWaktu ? ' (uji coba: tetap bisa ceklok)' : ' — belum bisa ceklok') + '</b>' +
        fmtJarak(d) + ' dari titik ceklok (maks ' + c.radius + ' m). Mendekatlah lalu ketuk Ambil ulang lokasi. · ' + akurasi + '</div>';
  }
  function updateCkGps() {
    if (!data || mode !== 'ceklok' || !data.ceklok || !$('ckGpsBox')) return;
    $('ckGpsBox').innerHTML = gpsCkHtml();
    if ($('ckKirim')) $('ckKirim').disabled = sending || !okLokasiCk() || !okFoto();
  }

  function renderCeklok() {
    const v = $('ceklokView'), c = data.ceklok, h = ckHari(), m = menitSekarang();
    const f = lastCkFase = ckFase();
    const jamDinas = c.masuk != null ? jamTeks(c.masuk) + '–' + jamTeks(c.pulang) : '';
    const kepala = '<div class="who"><div><b>' + esc(c.nama) + '</b><div class="loc">Kantor Satpas' + (c.pokja ? ' · Pokja ' + esc(c.pokja) : '') +
      '</div></div>' + gantiBtn() + '</div>' +
      '<p class="sub" style="margin:8px 0 0">' + dateLabel() + ' · pukul ' + jamTeks(m) + (c.kerja && jamDinas ? ' · jam dinas ' + jamDinas : '') +
      (memuat ? ' · <span class="muted">⟳ memperbarui…</span>' : '') + '</p>';
    const tunda = (x) => (x.antre ? ' <span class="badge far">⏳ belum terkirim</span>' : '');
    const kartuSelesai = (kelas, ic, judul, isi) => {
      v.innerHTML = '<section class="card done' + kelas + '"><div class="ic">' + ic + '</div><h2 class="t">' + judul + '</h2>' +
        '<p class="sub">' + esc(c.nama) + ' · Kantor Satpas<br>' + dateLabel() + '</p>' + isi + antreHtml() +
        ulangBtn() + '<div class="switch" style="margin-top:14px">' + gantiBtn() + '</div></section>';
    };
    if (f === 'beres' && h.keluar) {
      return kartuSelesai(' w', '🚨', 'Meninggalkan kantor – tugas mendadak',
        '<p class="sub">Masuk ' + esc(h.masuk.jam) + tunda(h.masuk) + ' · Keluar ' + esc(h.keluar.jam) + tunda(h.keluar) + '</p>' +
        (h.keluar.ket ? '<p class="sub">' + esc(h.keluar.ket) + '</p>' : '') + '<span class="badge ok">✓ ceklok hari ini selesai</span>');
    }
    if (f === 'beres') {
      const ragu = (h.masuk && h.masuk.peringatan) || (h.pulang && h.pulang.peringatan);
      const telat = h.masuk.selisih > 0 ? ' <span class="badge far">terlambat ' + h.masuk.selisih + ' mnt</span>' : '';
      const cepat = h.pulang.selisih > 0 ? ' <span class="badge far">pulang cepat ' + h.pulang.selisih + ' mnt</span>' : '';
      return kartuSelesai(ragu ? ' w' : '', ragu ? '!' : '✓', ragu ? 'Ceklok diterima, lokasi perlu diverifikasi admin' : 'Ceklok hari ini lengkap',
        '<p class="sub">Masuk ' + esc(h.masuk.jam) + tunda(h.masuk) + telat + ' · Pulang ' + esc(h.pulang.jam) + tunda(h.pulang) + cepat + '</p>' +
        (ragu ? '<span class="badge far">⚠️ lokasi diragukan</span>' : '<span class="badge ok">✓ lengkap</span>'));
    }
    if (f === 'izin') {
      return kartuSelesai(' t', '✕', 'Tidak masuk: ' + esc(labelIzin(h.tidak.kode)), '<p class="sub">dilaporkan pukul ' + esc(h.tidak.jam) + tunda(h.tidak) + '</p>');
    }

    const gpsStep = '<div class="step"><h3>Lokasi <small>otomatis</small></h3><div id="ckGpsBox">' + gpsCkHtml() + '</div>' +
      '<div class="mini"><button data-a="gps">⟳ Ambil ulang lokasi</button></div></div>';
    const fotoStep = '<div class="step"><h3>Foto <small>wajib, langsung dari kamera</small></h3><div id="ckFotoBox">' + fotoHtml() + '</div></div>';
    const noteStep = (wajib) => '<div class="step"><h3>' + (wajib ? 'Keterangan <small>wajib</small>' : 'Catatan <small>opsional</small>') + '</h3>' +
      '<input class="note-in" id="ckNote" maxlength="300" placeholder="' + (wajib ? 'Mis. sakit demam, surat dokter menyusul' : 'Mis. apel pagi, piket loket') +
      '" value="' + esc(ck.note) + '"></div>';
    const tombol = (aksi, label, kelas) => '<button class="btn big ' + kelas + '" id="ckKirim" data-a="' + aksi + '"' +
      (sending || !okLokasiCk() || !okFoto() ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : label) + '</button>';
    const tidakLink = '<div class="switch"><button class="link muted-link" data-a="ckModeTidak">Tidak masuk hari ini?</button></div>';

    let body = '';
    if (f === 'libur') body = info('🏖️ Hari ini libur', esc(c.libur || 'Hari libur') + '. Tidak perlu ceklok.');
    else if (f === 'belumBuka') body = info('⏰ Ceklok dibuka pukul ' + jamTeks(c.buka), 'Jam masuk ' + jamTeks(c.masuk) + '.') + tidakLink;
    else if (f === 'tutup') body = info('Waktu ceklok sudah berakhir (' + jamTeks(c.tutup) + ')', 'Hari ini Anda belum ceklok. Hubungi admin bila ada kendala.');
    else if (f === 'tutupPulang') {
      body = info('Waktu ceklok sudah berakhir (' + jamTeks(c.tutup) + ')', 'Masuk tercatat pukul ' + esc(h.masuk.jam) + ' tanpa Ceklok Pulang.');
    } else if (f === 'masuk') {
      const telat = c.masuk != null ? Math.floor(m - c.masuk) : 0;
      body = info(telat > 0 && !data.bebasWaktu ? '⚠️ Ceklok Masuk – sudah lewat ' + telat + ' menit' : 'Ceklok Masuk',
        (c.masuk != null ? 'Jam masuk ' + jamTeks(c.masuk) + (telat > 0 ? '. Ceklok sekarang tercatat terlambat.' : '.') : 'Hari ini tidak ada jam dinas (uji coba).') +
        ' Ceklok dalam radius ' + c.radius + ' m dari kantor Satpas.') +
        gpsStep + fotoStep + noteStep(false) + tombol('ckMasuk', '🏢 Ceklok Masuk', 'h') + tidakLink;
    } else if (f === 'pulang') {
      const cepat = c.pulang != null ? Math.ceil(c.pulang - m) : 0;
      body = info('✓ Masuk pukul ' + esc(h.masuk.jam) + (h.masuk.antre ? ' (belum terkirim)' : ''),
        c.pulang != null && cepat > 0 ? 'Jam pulang ' + jamTeks(c.pulang) + '. Ceklok Pulang sekarang tercatat <b>pulang cepat ' + cepat + ' menit</b>.'
          : 'Silakan Ceklok Pulang sebelum pukul ' + jamTeks(c.tutup) + '.') +
        gpsStep + fotoStep + noteStep(false) + tombol('ckPulang', '🏠 Ceklok Pulang', cepat > 0 ? 'w' : 'h') +
        '<div class="switch"><button class="btn tinggal" data-a="ckModeKeluar">🚨 Ada tugas mendadak? Tinggalkan kantor</button></div>';
    } else if (f === 'keluar') {
      const jenisList = c.tugasMendadak || ['Perintah pimpinan', 'Pengawalan/Patwal', 'Laka lantas', 'Kejadian darurat', 'Rapat/dinas luar', 'Lainnya'];
      body = info('🚨 Tinggalkan Kantor – Tugas Mendadak', 'Masuk tercatat pukul ' + esc(h.masuk.jam) +
          '. Ceklok hari ini selesai dan dihitung lengkap (tidak dihitung pulang cepat). Ceklok Pulang tidak diperlukan lagi.') +
        '<div class="step"><h3>Jenis tugas <small>wajib</small></h3><div class="chips">' + jenisList.map((x) =>
          '<button data-a="ckJenis" data-v="' + esc(x) + '"' + (ck.jenis === x ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('') +
        '</div></div>' +
        '<div class="step"><h3>Keterangan singkat <small>wajib</small></h3>' +
        '<input class="note-in" id="ckNote" maxlength="300" placeholder="Mis. perintah Kasat, pengawalan ke Pendopo" value="' + esc(ck.note) + '"></div>' +
        '<button class="btn big w" data-a="ckKirimKeluar"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : '🚨 Kirim: Tinggalkan Kantor') + '</button>' +
        '<div class="switch"><button class="link muted-link" data-a="ckModeKembali">← Kembali</button></div>';
    } else if (f === 'tidak') {
      body = '<div class="step"><h3>Alasan tidak masuk</h3><div class="chips">' + (c.izin || []).map((x) =>
          '<button data-a="ckAlasan" data-v="' + esc(x.code) + '"' + (ck.alasan === x.code ? ' class="on"' : '') + '>' + esc(x.label) + '</button>').join('') +
        '</div></div>' + noteStep(true) +
        '<button class="btn big t" data-a="ckKirimTidak"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Mengirim…' : 'Kirim: Tidak Masuk') + '</button>' +
        '<div class="switch"><button class="link muted-link" data-a="ckModeHadir">← Kembali</button></div>';
    }
    v.innerHTML = '<section class="card">' + kepala + antreHtml() + body + '</section>';
  }

  async function kirimCeklok(tahap, st) {
    const c = data.ceklok;
    sending = true;
    renderCeklok();
    try {
      const pakaiLokasi = tahap === 'masuk' || tahap === 'pulang';
      const kirimGps = pakaiLokasi || tahap === 'keluar';
      if (pakaiLokasi) {
        await lokasiBaru();
        if (!okLokasiCk()) throw new Error(draft.lat == null ? 'Lokasi GPS belum didapat' : 'Anda di luar radius ' + c.radius + ' m dari kantor Satpas');
      }
      const body = {
        pin, kode, action: 'ceklok', tahap, st: st || '', jenis: tahap === 'keluar' ? ck.jenis : '',
        lat: kirimGps ? draft.lat : null, lng: kirimGps ? draft.lng : null, acc: kirimGps ? draft.acc : null,
        foto: pakaiLokasi ? draft.foto : '', fotoMs: pakaiLokasi ? draft.fotoMs : 0,
        note: ck.note.trim(),
        idKirim: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
        waktuMs: Math.round(serverNowMs() || Date.now())
      };
      // sama dengan Lapor: disimpan di HP dulu, terkirim otomatis bila sinyal putus
      const sebelumnya = antreSaya().length;
      const tersimpan = tulisAntre(bacaAntre().concat([{ pin, tgl: tglLokal(), jenis: 'ceklok', tahap, jam: jamTeks(menitSekarang()), body }]));
      const kosongkan = () => {
        const lat = draft.lat, lng = draft.lng, acc = draft.acc;
        draft = newDraft();
        Object.assign(draft, { lat, lng, acc });
        Object.assign(ck, { tidak: false, alasan: '', note: '', keluar: false, jenis: '' });
      };
      if (sebelumnya && tersimpan) {
        kosongkan();
        sending = false;
        toast('Ceklok disimpan di HP, dikirim setelah laporan sebelumnya terkirim');
        renderCeklok();
        return kirimAntre();
      }
      const out = await postLapor(body);
      if (out.putus) {
        if (!tersimpan) throw new Error('sinyal putus dan memori HP penuh, ceklok belum tersimpan. Coba lagi.');
        kosongkan();
        sending = false;
        renderCeklok();
        window.scrollTo(0, 0);
        toast('Sinyal putus — ceklok disimpan di HP dan terkirim otomatis saat ada sinyal');
        return;
      }
      buangAntre(body.idKirim);
      if (out.error) throw new Error(out.error);
      if (out.jam === undefined) throw new Error('Code.gs belum diperbarui untuk Ceklok Satpas');
      kosongkan();
      if (tahap === 'masuk' || tahap === 'tidak') ulangCk = false;
      toast(out.diperiksa ? 'Ceklok tercatat pukul ' + out.jam + ', lokasi perlu diverifikasi admin'
        : tahap === 'masuk' ? '✓ Ceklok Masuk pukul ' + out.jam + (out.selisih ? ' — terlambat ' + out.selisih + ' menit' : '')
        : tahap === 'pulang' ? '✓ Ceklok Pulang pukul ' + out.jam + (out.selisih ? ' — pulang cepat ' + out.selisih + ' menit' : '')
        : tahap === 'keluar' ? '✓ Tercatat meninggalkan kantor pukul ' + out.jam + ' — ceklok hari ini selesai'
        : '✓ Laporan tidak masuk terkirim');
      sending = false;
      await reload(data.today);
      window.scrollTo(0, 0);
    } catch (err) {
      sending = false;
      renderCeklok();
      toast('Gagal mengirim: ' + err.message);
    }
  }

  $('ceklokView').addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || sending) return;
    const a = el.dataset.a;
    if (a === 'keluar') return logout();
    if (a === 'gps') return ambilLokasi(true);
    if (a === 'kamera') return bukaKamera();
    if (a === 'kirimAntre') { if (!navigator.onLine) return toast('Belum ada sinyal internet'); kirimAntre(); return renderCeklok(); }
    if (a === 'tutupPesanAntre') pesanAntre = '';
    if (a === 'ulangi') { ulangCk = true; draft.foto = ''; Object.assign(ck, { tidak: false, keluar: false }); ambilLokasi(); }
    if (a === 'ckModeTidak') ck.tidak = true;
    if (a === 'ckModeHadir') ck.tidak = false;
    if (a === 'ckModeKeluar') { ck.keluar = true; window.scrollTo(0, 0); }
    if (a === 'ckModeKembali') ck.keluar = false;
    if (a === 'ckJenis') ck.jenis = el.dataset.v;
    if (a === 'ckKirimKeluar') {
      if (!ck.jenis) return toast('Pilih jenis tugas dulu');
      if (ck.note.trim().length < 3) return toast('Isi keterangan singkat tugas mendadak');
      return kirimCeklok('keluar');
    }
    if (a === 'ckAlasan') ck.alasan = el.dataset.v;
    if (a === 'ckMasuk' || a === 'ckPulang') {
      if (!okLokasiCk()) return toast(draft.lat == null ? 'Lokasi GPS belum didapat' : 'Anda di luar radius ' + data.ceklok.radius + ' m dari kantor Satpas');
      if (draft.foto && serverNowMs() - draft.fotoMs > FOTO_MAKS_MENIT * 60000) {
        draft.foto = '';
        updateFoto();
        return toast('Foto sudah terlalu lama, ambil ulang foto');
      }
      if (!okFoto()) return toast('Ambil foto dari kamera dulu');
      return kirimCeklok(a === 'ckMasuk' ? 'masuk' : 'pulang');
    }
    if (a === 'ckKirimTidak') {
      if (!ck.alasan) return toast('Ketuk salah satu alasan dulu');
      if (ck.note.trim().length < 3) return toast('Isi keterangan singkat alasan tidak masuk');
      return kirimCeklok('tidak', ck.alasan);
    }
    renderCeklok();
  });
  $('ceklokView').addEventListener('input', (e) => { if (e.target.id === 'ckNote') ck.note = e.target.value; });

  $('laporView').addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || sending) return;
    const a = el.dataset.a;
    if (a === 'keluar') return logout();
    if (a === 'gps') return ambilLokasi(true);
    if (a === 'kirimAntre') { if (!navigator.onLine) return toast('Belum ada sinyal internet'); kirimAntre(); return renderLapor(); }
    if (a === 'tutupPesanAntre') pesanAntre = '';
    if (a === 'kamera') return bukaKamera();
    if (a === 'ulangi') { ulangCW = true; draft.foto = ''; draft.tidak = false; draft.tinggal = false; ambilLokasi(); }
    if (a === 'modeTidak') draft.tidak = true;
    if (a === 'modeTinggal') { draft.tinggal = true; window.scrollTo(0, 0); }
    if (a === 'modeHadir') { draft.tidak = false; draft.tinggal = false; }
    if (a === 'alasan') draft.alasan = el.dataset.v;
    if (a === 'jenis') draft.jenis = el.dataset.v;
    if (a === 'kirimTinggal') {
      if (!draft.jenis) return toast('Pilih jenis tugas dulu');
      if (draft.note.trim().length < 3) return toast('Isi keterangan singkat tugas mendadak');
      return kirimLapor('tinggal', 'H');
    }
    if (a === 'kirimDatang' || a === 'kirimSelesai') {
      const r = myRow();
      if (!okLokasi(r)) return toast(draft.lat == null ? 'Lokasi GPS belum didapat' : 'Anda di luar radius ' + radius() + ' m dari titik');
      if (draft.foto && serverNowMs() - draft.fotoMs > FOTO_MAKS_MENIT * 60000) {
        draft.foto = '';
        updateFoto();
        return toast('Foto sudah terlalu lama, ambil ulang foto');
      }
      if (!okFoto()) return toast('Ambil foto dari kamera dulu');
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
    if (!data || $('app').hidden || sending || document.hidden) return;
    if (adaAntre()) kirimAntre();
    if (mode === 'ceklok' && data.ceklok) {
      const f = ckFase();
      const ketik = document.activeElement && document.activeElement.id === 'ckNote';
      if (f !== lastCkFase || (['masuk', 'pulang'].includes(f) && !ketik)) renderCeklok();
      if (++detak % 3 === 0 && ['masuk', 'pulang'].includes(f)) ambilLokasi();
      return;
    }
    if (mode !== 'lapor') return;
    const r = myRow();
    if (!r) return;
    const f = fase(r);
    const mengetik = document.activeElement && document.activeElement.id === 'laporNote';
    if (f !== lastFase || (f === 'tunggu' && !mengetik)) renderLapor();
    if (++detak % 3 === 0 && ['datang', 'tunggu', 'selesai'].includes(f)) ambilLokasi();
  }, 20000);
  $('laporView').addEventListener('input', (e) => { if (e.target.id === 'laporNote') draft.note = e.target.value; });
  $('mode').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || memuat || sending) return;
    // ketuk Lapor CW saat sudah terbuka (atau gagal memuat): ambil data terbaru dari server
    if (!data || b.dataset.m === mode) return reload(data && data.today);
    if (b.dataset.m === 'lapor' && dirtyCount() && data.day !== data.today &&
      !confirm('Perubahan rekap yang belum disimpan akan hilang. Lanjut?')) return;
    mode = b.dataset.m;
    store('cw_mode', mode);
    draft.foto = ''; draft.fotoMs = 0;
    if ((mode === 'lapor' && myRow() || mode === 'ceklok') && draft.lat == null) ambilLokasi();
    render();
    window.scrollTo(0, 0);
  };

  // anggota: "Keluar" (ganti akun NRP); admin: "Bukan saya" (pilih nama lain)
  function gantiBtn() { return '<button class="link muted-link" data-a="keluar">Keluar</button>'; }

  function logout() {
    if (antreSaya().length && !confirm('Ada laporan yang belum terkirim. Bila keluar, laporan itu baru terkirim setelah Anda masuk lagi dengan NRP yang sama. Keluar?')) return;
    pin = '';
    store('cw_pin', '');
    kode = '';
    store('cw_kode', '');
    store('cw_data', '');
    data = null;
    draft = newDraft();
    Object.assign(ck, { tidak: false, alasan: '', note: '', keluar: false, jenis: '' });
    ulangCW = false; ulangCk = false;
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
    mulai();
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

  // buka aplikasi: tampilkan data tersimpan (bila ada) seketika, GPS & data server diambil bersamaan
  function mulai() {
    $('app').hidden = false;
    $('mode').hidden = false;
    const c = bacaCache();
    mode = load('cw_mode') === 'ceklok' && (!c || c.ceklok) ? 'ceklok' : 'lapor';
    if (c) {
      data = c;
      me = c.me ? String(c.me) : '';
      if (c.ceklok && !c.me) mode = 'ceklok';
      render();
    }
    ambilLokasi();
    reload().then(() => kirimAntre());
  }

  if (pin) mulai(); else showLogin();
})();
