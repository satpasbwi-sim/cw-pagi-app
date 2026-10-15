(function () {
  const API = window.CW_CONFIG.API_URL;
  const $ = (id) => document.getElementById(id);
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  let pin = load('cw_pin');
  let data = null;          // respons terakhir dari API
  let edits = {};           // row -> kode yang belum disimpan

  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  async function fetchData(day) {
    const url = API + '?pin=' + encodeURIComponent(pin) + (day ? '&day=' + day : '');
    const res = await fetch(url);
    return res.json();
  }

  async function saveData() {
    const updates = Object.keys(edits).map((row) => ({ row: Number(row), code: edits[row] }));
    if (!updates.length) return;
    $('btnSave').disabled = true;
    try {
      // text/plain agar tidak memicu CORS preflight ke Apps Script
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin, day: data.day, updates })
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      toast(out.saved + ' data tersimpan');
      await reload(data.day);
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message);
    } finally {
      $('btnSave').disabled = false;
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
      render();
    } catch (err) {
      toast('Gagal memuat: ' + err.message);
    } finally {
      $('btnReload').disabled = false;
    }
  }

  function statusOf(r) { return edits[r.row] !== undefined ? edits[r.row] : r.status; }

  function monthIndex() {
    const i = BULAN.findIndex((b) => b.toLowerCase() === String(data.bulan).toLowerCase());
    return i < 0 ? new Date().getMonth() : i;
  }

  function dateLabel() {
    const dt = new Date(Number(data.tahun), monthIndex(), data.day);
    return HARI[dt.getDay()] + ', ' + data.day + ' ' + BULAN[monthIndex()] + ' ' + data.tahun;
  }

  function summary() {
    const s = { total: 0, titik: data.rows.length, belum: 0 };
    data.codes.forEach((c) => { s[c.code] = 0; });
    data.rows.forEach((r) => {
      const st = statusOf(r);
      s.total += r.jml;
      if (st && s[st] !== undefined) s[st] += r.jml; else s.belum += r.jml;
    });
    s.persen = s.total ? (100 * (s.H || 0) / s.total) : 0;
    return s;
  }

  function render() {
    // pilihan tanggal
    const sel = $('day');
    sel.innerHTML = '';
    for (let d = 1; d <= data.lastDay; d++) {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      if (d === data.day) o.selected = true;
      sel.appendChild(o);
    }
    $('periode').textContent = dateLabel();

    // statistik
    const s = summary();
    const stat = (v, l) => '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>';
    $('stats').innerHTML =
      stat(s.titik, 'Titik plotting') + stat(s.total, 'Total personil') +
      stat(s.H || 0, 'Hadir') + stat(s.belum, 'Belum lapor') +
      stat(s.persen.toFixed(1).replace('.', ',') + '%', 'Tingkat kehadiran');

    // daftar per wilayah
    const list = $('list');
    list.innerHTML = '';
    const groups = {};
    data.rows.forEach((r) => { (groups[r.wilayah || '-'] = groups[r.wilayah || '-'] || []).push(r); });
    Object.keys(groups).forEach((w) => {
      const h = document.createElement('h3');
      h.textContent = w;
      list.appendChild(h);
      groups[w].forEach((r) => list.appendChild(renderItem(r)));
    });

    const n = Object.keys(edits).length;
    $('saveBar').hidden = n === 0;
    $('dirtyInfo').textContent = n + ' perubahan belum disimpan';

    $('waText').value = waText(s);
    $('btnWa').href = 'https://wa.me/?text=' + encodeURIComponent($('waText').value);
  }

  function renderItem(r) {
    const st = statusOf(r);
    const el = document.createElement('div');
    el.className = 'item' + (edits[r.row] !== undefined ? ' dirty' : '');
    if (st) el.style.borderLeftColor = 'var(--' + st + ', var(--N))';
    const note = data.catatan[String(r.no)];
    el.innerHTML =
      '<div class="top"><span class="no">' + esc(r.no) + '</span><div>' +
      '<div class="name">' + esc(r.petugas) + (r.jml > 1 ? ' (' + r.jml + ' pers)' : '') + '</div>' +
      '<div class="loc">' + esc(r.lokasi) + ' · ' + esc(r.jam) + '</div>' +
      (st ? '' : '<div style="color:var(--belum);font-weight:600;font-size:.8rem">BELUM LAPOR</div>') +
      (note ? '<div class="note">' + esc(note) + '</div>' : '') +
      '</div></div>';
    const codes = document.createElement('div');
    codes.className = 'codes';
    data.codes.forEach((c) => {
      const b = document.createElement('button');
      b.textContent = c.code;
      b.title = c.label;
      if (st === c.code) { b.className = 'on'; b.style.background = 'var(--' + c.code + ')'; }
      b.onclick = () => setStatus(r, st === c.code ? '' : c.code);
      codes.appendChild(b);
    });
    el.appendChild(codes);
    return el;
  }

  function setStatus(r, code) {
    if (code === r.status) delete edits[r.row]; else edits[r.row] = code;
    render();
  }

  function waText(s) {
    const lines = [
      '*ABSENSI PENGATURAN PAGI (CW PAGI)*',
      '*SATLANTAS POLRESTA BANYUWANGI*',
      dateLabel(),
      '',
      'Titik plotting : ' + s.titik,
      'Total personil : ' + s.total,
      'Hadir : ' + (s.H || 0) + ' (' + s.persen.toFixed(1).replace('.', ',') + '%)'
    ];
    data.codes.forEach((c) => { if (c.code !== 'H' && s[c.code]) lines.push(c.label + ' : ' + s[c.code]); });
    if (s.belum) lines.push(WA_MARK[''] + ' *Belum lapor : ' + s.belum + '*');

    const groups = {};
    data.rows.forEach((r) => { (groups[r.wilayah || '-'] = groups[r.wilayah || '-'] || []).push(r); });
    Object.keys(groups).forEach((w) => {
      lines.push('', '*' + w.toUpperCase() + '*');
      groups[w].forEach((r) => {
        const st = statusOf(r);
        const note = data.catatan[String(r.no)];
        const code = data.codes.find((c) => c.code === st);
        // WhatsApp tidak mendukung teks berwarna; belum lapor ditandai 🔴 + huruf tebal
        const label = code ? code.label : '*BELUM LAPOR*';
        const mark = WA_MARK[code ? st : ''] || '⚪';
        lines.push(mark + ' ' + r.no + '. ' + r.lokasi + ' – ' + r.petugas + ' : ' + label + (note ? ' (' + note + ')' : ''));
      });
    });
    return lines.join('\n');
  }

  // Tanda warna per status, mengikuti warna di spreadsheet
  const WA_MARK = { '': '🔴', H: '✅', LD: '🔵', D: '🔵', S: '🟡', I: '🟠', P: '🟣', N: '⚪' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function showLogin(msg) {
    $('app').hidden = true;
    $('saveBar').hidden = true;
    $('login').hidden = false;
    $('loginMsg').textContent = msg || '';
  }

  $('btnLogin').onclick = () => {
    pin = $('pin').value.trim();
    store('cw_pin', pin);
    $('login').hidden = true;
    $('app').hidden = false;
    reload();
  };
  $('day').onchange = (e) => {
    if (Object.keys(edits).length && !confirm('Perubahan belum disimpan akan hilang. Lanjut?')) {
      e.target.value = data.day;
      return;
    }
    reload(Number(e.target.value));
  };
  $('btnReload').onclick = () => reload(data && data.day);
  $('btnSave').onclick = saveData;
  $('btnAllH').onclick = () => {
    data.rows.forEach((r) => { if (!statusOf(r)) edits[r.row] = 'H'; });
    render();
  };
  $('btnCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('waText').value);
      toast('Teks disalin');
    } catch (e) {
      $('waText').select();
      document.execCommand('copy');
      toast('Teks disalin');
    }
  };

  if (pin) { $('app').hidden = false; reload(); } else showLogin();
})();
