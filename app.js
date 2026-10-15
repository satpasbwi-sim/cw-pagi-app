(function () {
  const API = window.CW_CONFIG.API_URL;
  const $ = (id) => document.getElementById(id);
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  // Tanda warna per status di teks WhatsApp, mengikuti warna di spreadsheet
  const WA_MARK = { '': '🔴', H: '✅', LD: '🔵', D: '🔵', S: '🟡', I: '🟠', P: '🟣', N: '⚪' };
  const RING = 2 * Math.PI * 50;

  let pin = load('cw_pin');
  let data = null;          // respons terakhir dari API
  let edits = {};           // row -> kode yang belum disimpan
  let filter = 'all';
  let query = '';

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
    $('btnSave').textContent = 'Menyimpan…';
    try {
      // text/plain agar tidak memicu CORS preflight ke Apps Script
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin, day: data.day, updates })
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      toast('✓ ' + out.saved + ' data tersimpan');
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
      render();
    } catch (err) {
      toast('Gagal memuat: ' + err.message);
    } finally {
      $('btnReload').disabled = false;
    }
  }

  function statusOf(r) { return edits[r.row] !== undefined ? edits[r.row] : r.status; }
  function codeOf(st) { return data.codes.find((c) => c.code === st); }
  function color(st) { return st && codeOf(st) ? 'var(--' + st + ', var(--N))' : 'var(--belum)'; }
  function pct(n) { return n.toFixed(1).replace('.', ',') + '%'; }

  function monthIndex() {
    const i = BULAN.findIndex((b) => b.toLowerCase() === String(data.bulan).toLowerCase());
    return i < 0 ? new Date().getMonth() : i;
  }

  function dateLabel() {
    const dt = new Date(Number(data.tahun), monthIndex(), data.day);
    return HARI[dt.getDay()] + ', ' + data.day + ' ' + BULAN[monthIndex()] + ' ' + data.tahun;
  }

  function summarize(rows) {
    const s = { total: 0, titik: rows.length, belum: 0 };
    data.codes.forEach((c) => { s[c.code] = 0; });
    rows.forEach((r) => {
      const st = statusOf(r);
      s.total += r.jml;
      if (st && s[st] !== undefined) s[st] += r.jml; else s.belum += r.jml;
    });
    s.persen = s.total ? (100 * (s.H || 0) / s.total) : 0;
    return s;
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
      o.value = d; o.textContent = d + ' ' + BULAN[monthIndex()].slice(0, 3);
      if (d === data.day) o.selected = true;
      sel.appendChild(o);
    }
    $('prevDay').disabled = data.day <= 1;
    $('nextDay').disabled = data.day >= data.lastDay;
    $('todayLabel').textContent = dateLabel();

    // ringkasan + cincin persentase
    const s = summarize(data.rows);
    $('pctText').textContent = pct(s.persen);
    const ring = $('ringFg');
    ring.style.strokeDashoffset = RING * (1 - s.persen / 100);
    ring.style.stroke = s.persen >= 90 ? 'var(--H)' : s.persen >= 60 ? 'var(--S)' : 'var(--belum)';
    const stat = (v, l, cls) => '<div class="stat ' + (cls || '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
    $('stats').innerHTML =
      stat(s.H || 0, 'Hadir', 'hadir') + stat(s.belum, 'Belum lapor', 'belum') +
      stat(s.total, 'Total personil') + stat(s.titik, 'Titik plotting');

    // progres per simpul (batang bertumpuk per status)
    const g = groups();
    $('simpul').innerHTML = Object.keys(g).map((w) => {
      const ws = summarize(g[w]);
      const seg = data.codes.map((c) => ws[c.code]
        ? '<i style="width:' + (100 * ws[c.code] / ws.total) + '%;background:var(--' + c.code + ')" title="' + esc(c.label) + '"></i>' : '').join('');
      return '<div class="simpul-row"><div class="top"><b>' + esc(w) + '</b><span>' +
        (ws.H || 0) + '/' + ws.total + ' hadir · ' + pct(ws.persen) + '</span></div>' +
        '<div class="bar">' + seg + '</div></div>';
    }).join('');

    renderList(g);

    const n = Object.keys(edits).length;
    $('saveBar').hidden = n === 0;
    $('dirtyInfo').textContent = n + ' perubahan belum disimpan';

    $('waText').value = waText(s, g);
    $('btnWa').href = 'https://wa.me/?text=' + encodeURIComponent($('waText').value);
  }

  function renderList(g) {
    const list = $('list');
    list.innerHTML = '';
    const q = query.toLowerCase();
    let shown = 0;
    Object.keys(g).forEach((w) => {
      const rows = g[w].filter((r) => {
        const st = statusOf(r);
        if (filter === 'belum' && st) return false;
        if (filter === 'sudah' && !st) return false;
        return !q || (r.petugas + ' ' + r.lokasi).toLowerCase().includes(q);
      });
      if (!rows.length) return;
      const ws = summarize(g[w]);
      const head = document.createElement('div');
      head.className = 'group-title';
      head.innerHTML = '<h3>' + esc(w) + '</h3><span>' + ws.belum + ' belum lapor</span>';
      list.appendChild(head);
      rows.forEach((r) => list.appendChild(renderItem(r)));
      shown += rows.length;
    });
    if (!shown) list.innerHTML = '<p class="empty">' +
      (filter === 'belum' ? '🎉 Semua petugas sudah lapor.' : 'Tidak ada data yang cocok.') + '</p>';
  }

  function initials(name) {
    const parts = String(name).replace(/^(Aiptu|Aipda|Bripka|Brigpol|Briptu|Bripda|Ipda|Iptu|AKP)\s+/i, '')
      .split(/\s+/).filter((p) => /[a-z]/i.test(p));
    return ((parts[0] || '?')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
  }

  function renderItem(r) {
    const st = statusOf(r);
    const code = codeOf(st);
    const el = document.createElement('div');
    el.className = 'item' + (code ? '' : ' is-belum') + (edits[r.row] !== undefined ? ' dirty' : '');
    el.style.setProperty('--accent', color(st));
    const note = data.catatan[String(r.no)];
    el.innerHTML =
      '<div class="row">' +
        '<div class="avatar">' + esc(initials(r.petugas)) + '</div>' +
        '<div class="info">' +
          '<div class="name">' + esc(r.petugas) + (r.jml > 1 ? ' · ' + r.jml + ' pers' : '') + '</div>' +
          '<div class="loc">#' + esc(r.no) + ' · ' + esc(r.lokasi) + ' · ' + esc(r.jam) + '</div>' +
          (note ? '<div class="note">📝 ' + esc(note) + '</div>' : '') +
        '</div>' +
        (code ? '<span class="pill">' + esc(code.label) + '</span>' : '<span class="pill belum">BELUM LAPOR</span>') +
      '</div>';
    const codes = document.createElement('div');
    codes.className = 'codes';
    data.codes.forEach((c) => {
      const b = document.createElement('button');
      b.textContent = c.code;
      b.title = c.label;
      b.style.setProperty('--c', 'var(--' + c.code + ', var(--N))');
      if (st === c.code) b.className = 'on';
      b.onclick = () => setStatus(r, st === c.code ? '' : c.code);
      codes.appendChild(b);
    });
    el.appendChild(codes);
    return el;
  }

  function setStatus(r, code) {
    if (code === r.status) delete edits[r.row]; else edits[r.row] = code;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function waText(s, g) {
    const lines = [
      '*ABSENSI PENGATURAN PAGI (CW PAGI)*',
      '*SATLANTAS POLRESTA BANYUWANGI*',
      dateLabel(),
      '',
      'Titik plotting : ' + s.titik,
      'Total personil : ' + s.total,
      'Hadir : ' + (s.H || 0) + ' (' + pct(s.persen) + ')'
    ];
    data.codes.forEach((c) => { if (c.code !== 'H' && s[c.code]) lines.push(c.label + ' : ' + s[c.code]); });
    if (s.belum) lines.push(WA_MARK[''] + ' *Belum lapor : ' + s.belum + '*');

    Object.keys(g).forEach((w) => {
      lines.push('', '*' + w.toUpperCase() + '*');
      g[w].forEach((r) => {
        const st = statusOf(r);
        const note = data.catatan[String(r.no)];
        const code = codeOf(st);
        // WhatsApp tidak mendukung teks berwarna; belum lapor ditandai 🔴 + huruf tebal
        const label = code ? code.label : '*BELUM LAPOR*';
        const mark = WA_MARK[code ? st : ''] || '⚪';
        lines.push(mark + ' ' + r.no + '. ' + r.lokasi + ' – ' + r.petugas + ' : ' + label + (note ? ' (' + note + ')' : ''));
      });
    });
    return lines.join('\n');
  }

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

  function goDay(d) {
    if (Object.keys(edits).length && !confirm('Perubahan belum disimpan akan hilang. Lanjut?')) {
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
  $('btnReload').onclick = () => reload(data && data.day);
  $('btnSave').onclick = saveData;
  $('btnAllH').onclick = () => {
    data.rows.forEach((r) => { if (!statusOf(r)) edits[r.row] = 'H'; });
    render();
  };
  $('search').oninput = (e) => { query = e.target.value; renderList(groups()); };
  $('tabs').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.f;
    [...$('tabs').children].forEach((x) => x.classList.toggle('on', x === b));
    renderList(groups());
  };
  $('btnCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('waText').value);
    } catch (e) {
      $('waText').select();
      document.execCommand('copy');
    }
    toast('✓ Teks disalin');
  };

  if (pin) { $('app').hidden = false; reload(); } else showLogin();
})();
