// PANTAUAN PENGAWAS & ADMIN – tab "Pantauan" di aplikasi (GET action=pantauan), hanya membaca sheet yang sudah ada:
//   hariIni     : siapa sudah / belum Ceklok Masuk (Satpas) dan Lapor Datang (CW Pagi, admin saja) saat ini
//   pola        : kejadian mencurigakan 7 hari terakhir per orang (LOG LAPOR, LOG CEKLOK, LUAR RADIUS)
//   persetujuan : pengajuan izin / tugas mendadak yang belum diputuskan (sheet PERSETUJUAN) dan yang sering mengajukan
// Pengawas (NRP_PENGAWAS) hanya melihat anggota Satpas (Ceklok), sama seperti Rekap Integritas; admin melihat semua.
// Keputusan tetap diisi di spreadsheet (VERIFIKASI, CEK FOTO, KEPUTUSAN). Rancangan: catatan-lanjutan/PANTAUAN-PENGAWAS.md

const PANTAU_HARI = 7;            // jendela "Mencurigakan" (hari, termasuk hari ini)
const PANTAU_TUNDA_MIN = 2;       // laporan tertunda (sinyal putus) baru dicurigai bila sekian kali dalam jendela
const PANTAU_MIRIP_M = 2;         // posisi "nyaris sama" bila berjarak ≤ ini (GPS asli biasanya bergeser 3–15 m tiap hari)
const PANTAU_MIRIP_HARI = 3;      // ... di sekian hari berbeda
const PANTAU_MIRIP_AKURASI = 20;  // hanya titik dengan akurasi ≤ ini (m) yang dibandingkan
const PANTAU_SERING_MIN = 3;      // "sering mengajukan" bila sekian pengajuan dalam bulan berjalan
const PANTAU_BOBOT = { lokasi: 3, luar: 2, foto: 2, mirip: 2, tunda: 1 };
const PANTAU_CACHE_DETIK = 300;   // bagian pola (membaca seluruh LOG); hari ini & persetujuan selalu terkini

function pantauanData_(who) {
  const semua = who.role === 'admin';
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const out = {
    lingkup: semua ? 'semua' : 'satpas',
    diperbarui: Utilities.formatDate(now, tz, 'dd/MM HH.mm'),
    hariIni: { tgl: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), jam: Utilities.formatDate(now, tz, 'HH.mm') }
  };
  try { out.hariIni.ceklok = pantauCeklokHariIni_(tz, now); } catch (e) { out.hariIni.ceklok = { error: 'Ceklok: ' + e.message }; }
  out.hariIni.cw = null;
  if (semua) { try { out.hariIni.cw = pantauCwHariIni_(ss, tz, now); } catch (e) { out.hariIni.cw = { error: 'CW: ' + e.message }; } }
  const cache = CacheService.getScriptCache();
  const kunci = 'pantauan_pola|' + out.lingkup;
  const simpan = cache.get(kunci);
  if (simpan) out.pola = JSON.parse(simpan);
  else {
    try {
      out.pola = hitungPolaPantau_(bacaKejadianPantau_(ss, tz, now, semua), PANTAU_HARI);
      try { cache.put(kunci, JSON.stringify(out.pola), PANTAU_CACHE_DETIK); } catch (e) { /* terlalu besar: abaikan */ }
    } catch (e) { out.pola = { error: 'Pola: ' + e.message }; }
  }
  try { out.persetujuan = pantauPersetujuan_(ss, tz, now, semua); } catch (e) { out.persetujuan = { error: 'Persetujuan: ' + e.message }; }
  return out;
}

// ---------- Hari ini: Ceklok Satpas ----------
const PANTAU_URUT_CK = ['belum', 'izin_tolak', 'izin_menunggu', 'terlambat', 'nanti', 'hadir', 'keluar', 'pulang', 'izin'];

function pantauCeklokHariIni_(tz, now) {
  const ssS = SpreadsheetApp.openById(SATPAS_SS_ID);
  const libur = liburSatpas_(ssS, tz);
  const umum = jadwalSatpas_(now, tz, libur, null);
  const ringkas = { hadir: 0, terlambat: 0, belum: 0, izin: 0, total: 0 };
  if (!umum.kerja) return { libur: umum.libur || 'Libur', ringkas: ringkas, baris: [] };
  const rows = barisCeklok_(ensureLogCeklok_(ssS), 600);
  const setuju = bacaPersetujuan_(umum.tgl.slice(0, 7)).ck;
  const mnt = nowMenit_(SpreadsheetApp.getActive(), now);
  const baris = satpasDaftar_().filter(function (a) { return !pengawas_(a.nrp); }).map(function (a) {
    const j = jadwalSatpas_(now, tz, libur, a.nrp);
    const h = ceklokHari_(rows, tz, j.tgl, a.nrp);
    const b = { nrp: a.nrp, nama: a.nama, pokja: a.pokja, masuk: h.masuk ? h.masuk.jam : '', telat: 0,
      pulang: h.pulang ? h.pulang.jam : '', ket: '', peringatan: false, ujiCoba: ujiCoba_(a.nrp) };
    [h.masuk, h.pulang, h.keluar].forEach(function (x) { if (x && x.peringatan && x.verif !== 'ASLI') b.peringatan = true; });
    if (h.tidak) {
      const st = (setuju[a.nrp + '|' + j.tgl] || {}).tidak;
      b.status = !st || st === 'SETUJU' ? 'izin' : st === 'TOLAK' ? 'izin_tolak' : 'izin_menunggu';
      b.ket = h.tidak.kode;
    } else if (h.masuk) {
      b.telat = h.masuk.selisih > 0 ? h.masuk.selisih : 0;
      b.status = h.pulang ? 'pulang' : h.keluar ? 'keluar' : b.telat ? 'terlambat' : 'hadir';
      if (h.keluar) b.ket = h.keluar.ket || '';
    } else b.status = j.masuk != null && mnt > j.masuk ? 'belum' : 'nanti';
    return b;
  });
  baris.forEach(function (b) {
    ringkas.total++;
    if (b.masuk) ringkas.hadir++;
    if (b.telat) ringkas.terlambat++;
    if (b.status === 'belum') ringkas.belum++;
    if (/^izin/.test(b.status)) ringkas.izin++;
  });
  baris.sort(function (x, y) {
    return PANTAU_URUT_CK.indexOf(x.status) - PANTAU_URUT_CK.indexOf(y.status) || x.nama.localeCompare(y.nama);
  });
  return { libur: '', ringkas: ringkas, baris: baris };
}

// ---------- Hari ini: CW Pagi (admin) ----------
const PANTAU_URUT_CW = ['belum', 'nihil', 'datang', 'nanti', 'tidak', 'tinggal', 'selesai', 'kode'];

function pantauCwHariIni_(ss, tz, now) {
  const tgl = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ringkas = { datang: 0, selesai: 0, terlambat: 0, belum: 0, tidak: 0, total: 0 };
  if (cwLibur_(tgl)) return { libur: 'Sabtu / Minggu: tidak ada CW Pagi', ringkas: ringkas, baris: [] };
  const day = todayInSheet_(ss, now);
  if (!day) return { libur: 'Sheet ABSENSI bukan bulan berjalan (Ganti Bulan belum dijalankan)', ringkas: ringkas, baris: [] };
  const d = getData_(day, null);
  const batas = d.jadwal.batasDatang;
  const mnt = nowMenit_(ss, now);
  const label = {};
  (d.codes || []).forEach(function (c) { label[c.code] = c.label; });
  const baris = d.rows.filter(function (r) { return r.petugas; }).map(function (r) {
    const L = d.lapor[String(r.no)] || {};
    const b = { no: String(r.no), petugas: r.petugas, lokasi: r.lokasi, datang: L.datang ? L.datang.jam : '',
      selesai: L.selesai ? L.selesai.jam : L.tinggal ? L.tinggal.jam : '', telat: 0, kode: '', ket: '' };
    if (L.datang) b.telat = Math.max(0, Math.floor(menitJamTitik_(L.datang.jam) - batas));
    if (L.diperiksa || L.st === KODE_NIHIL) b.status = 'nihil';
    else if (L.tinggal) { b.status = 'tinggal'; b.ket = L.tinggal.ket || ''; }
    else if (L.st === 'H') b.status = 'selesai';
    else if (L.tidak) { b.status = 'tidak'; b.kode = L.st; b.ket = label[L.st] || L.st; }
    else if (L.datang) b.status = 'datang';
    else if (r.status) { b.status = 'kode'; b.kode = r.status; b.ket = label[r.status] || r.status; }
    else b.status = mnt > batas ? 'belum' : 'nanti';
    return b;
  });
  baris.forEach(function (b) {
    ringkas.total++;
    if (b.datang) ringkas.datang++;
    if (b.status === 'selesai' || b.status === 'tinggal') ringkas.selesai++;
    if (b.telat) ringkas.terlambat++;
    if (b.status === 'belum') ringkas.belum++;
    if (b.status === 'tidak') ringkas.tidak++;
  });
  baris.sort(function (x, y) {
    return PANTAU_URUT_CW.indexOf(x.status) - PANTAU_URUT_CW.indexOf(y.status) || Number(x.no) - Number(y.no);
  });
  return { libur: '', batasDatang: ('0' + Math.floor(batas / 60)).slice(-2) + '.' + ('0' + batas % 60).slice(-2), ringkas: ringkas, baris: baris };
}

// ---------- Mencurigakan ----------
// Semua baris LOG LAPOR / LOG CEKLOK / LUAR RADIUS dalam jendela → kejadian mentah (tanpa SpreadsheetApp di hitungPolaPantau_)
function bacaKejadianPantau_(ss, tz, now, semua) {
  const mulai = Utilities.formatDate(new Date(now.getTime() - (PANTAU_HARI - 1) * 86400000), tz, 'yyyy-MM-dd');
  const out = [];
  const baca = function (sh, sumber) {
    if (!sh || sh.getLastRow() < 2) return;
    const lebar = Math.min(KOL_CEK_FOTO, sh.getMaxColumns());
    sh.getRange(2, 1, sh.getLastRow() - 1, lebar).getValues().forEach(function (r) {
      if (!(r[0] instanceof Date)) return;
      const tgl = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
      if (tgl < mulai) return;
      out.push({ sumber: sumber, tgl: tgl, jam: Utilities.formatDate(r[0], tz, 'HH.mm'),
        nama: String(r[3] || '').trim(), nrp: sumber === 'CEKLOK' ? normIdSatpas_(r[2]) : '',
        status: String(r[sumber === 'CEKLOK' ? 4 : 5] || ''), acc: r[7] === '' ? null : Number(r[7]), peta: String(r[8] || ''),
        foto: driveId_(r[9]) ? String(r[9]) : '', catatan: String(r[10] || ''), peringatan: String(r[11] || ''),
        verif: String(r[12] || '').trim().toUpperCase(), cekFoto: lebar >= KOL_CEK_FOTO ? String(r[13] || '').trim().toUpperCase() : '' });
    });
  };
  if (semua) baca(ss.getSheetByName(SHEET_LOG), 'CW');
  baca(SpreadsheetApp.openById(SATPAS_SS_ID).getSheetByName(SATPAS_SHEET_LOG), 'CEKLOK');
  const shL = ss.getSheetByName(SHEET_LUAR);
  if (shL && shL.getLastRow() >= 2) {
    shL.getRange(2, 1, shL.getLastRow() - 1, LUAR_HEADER.length).getDisplayValues().forEach(function (r) {
      const tgl = String(r[1]);
      if (tgl < mulai || (!semua && r[4] !== 'CEKLOK')) return;
      out.push({ sumber: r[4] === 'CEKLOK' ? 'CEKLOK' : 'CW', luar: true, tgl: tgl, jam: String(r[5]), nama: String(r[3]).trim(),
        nrp: normIdSatpas_(r[2]), durasi: Number(r[6]) || 0, jarak: r[7], peta: String(r[9] || '') });
    });
  }
  return out;
}

// inti aturan (bisa diuji terpisah): kejadian mentah → {hari, daftar: [{nama, nrp, bobot, ringkas, kejadian}]}
function hitungPolaPantau_(mentah, hari) {
  const orang = {};
  const ambil = function (k) {
    const kunci = normNama_(k.nama) || k.nrp;
    return orang[kunci] = orang[kunci] || { nama: k.nama, nrp: k.nrp || '', kejadian: [], tunda: [], titik: [] };
  };
  mentah.forEach(function (k) {
    if (!k.nama && !k.nrp) return;
    const o = ambil(k);
    if (k.nrp && !o.nrp) o.nrp = k.nrp;
    const dasar = { tgl: k.tgl, jam: k.jam, sumber: k.sumber, peta: k.peta || '', foto: k.foto || '' };
    if (k.luar) {
      o.kejadian.push(Object.assign({ jenis: 'luar', ket: 'Di luar radius ' + k.durasi + ' menit' +
        (k.jarak !== '' && k.jarak != null ? ' (maks ' + k.jarak + ' m)' : '') + ' setelah ' + (k.sumber === 'CEKLOK' ? 'Ceklok Masuk' : 'Lapor Datang') }, dasar));
      return;
    }
    const tahap = k.sumber === 'CEKLOK' ? 'Ceklok ' + k.status.toLowerCase() : 'Lapor ' + (k.status === 'DATANG' ? 'datang' : k.status === 'H' ? 'selesai' : k.status.toLowerCase());
    if (k.peringatan && k.verif !== 'ASLI') {
      o.kejadian.push(Object.assign({ jenis: 'lokasi', ket: tahap + ': ' + k.peringatan.replace(/^⚠️\s*/, '') +
        (k.verif === 'PALSU' ? ' · diverifikasi PALSU' : ' · belum diverifikasi') }, dasar));
    }
    if (k.cekFoto && k.cekFoto !== 'SESUAI') o.kejadian.push(Object.assign({ jenis: 'foto', ket: tahap + ': cek foto ' + k.cekFoto }, dasar));
    const t = /tertunda (\d+) mnt/.exec(k.catatan || '');
    if (t) o.tunda.push(Object.assign({ jenis: 'tunda', ket: tahap + ' tertunda ' + t[1] + ' menit (sinyal putus)' }, dasar));
    const m = /[?&]q=(-?[\d.]+),(-?[\d.]+)/.exec(k.peta || '');
    if (m && k.acc != null && isFinite(k.acc) && k.acc <= PANTAU_MIRIP_AKURASI) {
      o.titik.push({ tgl: k.tgl, lat: Number(m[1]), lng: Number(m[2]), sumber: k.sumber, peta: k.peta });
    }
  });
  const daftar = [];
  Object.keys(orang).forEach(function (kunci) {
    const o = orang[kunci];
    if (o.tunda.length >= PANTAU_TUNDA_MIN) o.tunda.forEach(function (x) { o.kejadian.push(x); });
    const mirip = posisiMiripPantau_(o.titik);
    if (mirip) o.kejadian.push(mirip);
    if (!o.kejadian.length) return;
    const ringkas = {};
    let bobot = 0;
    o.kejadian.forEach(function (x) { ringkas[x.jenis] = (ringkas[x.jenis] || 0) + 1; bobot += PANTAU_BOBOT[x.jenis] || 1; });
    o.kejadian.sort(function (a, b) { return (b.tgl + b.jam).localeCompare(a.tgl + a.jam); });
    daftar.push({ nama: o.nama, nrp: o.nrp, bobot: bobot, ringkas: ringkas, kejadian: o.kejadian.slice(0, 20) });
  });
  daftar.sort(function (a, b) { return b.bobot - a.bobot || a.nama.localeCompare(b.nama); });
  return { hari: hari, daftar: daftar };
}

// titik dengan posisi nyaris sama (≤ PANTAU_MIRIP_M) di ≥ PANTAU_MIRIP_HARI hari berbeda → satu kejadian 'mirip'
function posisiMiripPantau_(titik) {
  let terbaik = null;
  titik.forEach(function (p) {
    const hari = {};
    titik.forEach(function (q) {
      if (jarakPantau_(p.lat, p.lng, q.lat, q.lng) <= PANTAU_MIRIP_M) hari[q.tgl] = 1;
    });
    const n = Object.keys(hari).length;
    if (n >= PANTAU_MIRIP_HARI && (!terbaik || n > terbaik.n)) terbaik = { n: n, hari: Object.keys(hari).sort(), p: p };
  });
  if (!terbaik) return null;
  const akhir = terbaik.hari[terbaik.hari.length - 1];
  return { jenis: 'mirip', tgl: akhir, jam: '', sumber: terbaik.p.sumber, peta: terbaik.p.peta, foto: '',
    ket: 'Posisi nyaris sama (≤' + PANTAU_MIRIP_M + ' m) di ' + terbaik.n + ' hari berbeda: ' +
      terbaik.hari.map(function (t) { return Number(t.slice(8)) + '/' + Number(t.slice(5, 7)); }).join(', ') +
      '. GPS asli biasanya bergeser beberapa meter tiap hari – cek foto & lokasinya.' };
}

function jarakPantau_(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- Persetujuan ----------
function pantauPersetujuan_(ss, tz, now, semua) {
  const sh = ss.getSheetByName(SHEET_PERSETUJUAN);
  const out = { menunggu: [], sering: [], url: semua && sh ? ss.getUrl() + '#gid=' + sh.getSheetId() : '' };
  if (!sh || sh.getLastRow() < 2) return out;
  const hariIni = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, SETUJU_HEADER.length).getDisplayValues()
    .map(function (r) { return { tgl: String(r[1]), nrp: String(r[2]), nama: String(r[3]).trim(), jenis: String(r[4]),
      pengajuan: String(r[5]), ket: String(r[6]), keputusan: String(r[7]).trim().toUpperCase() }; });
  return hitungPersetujuanPantau_(rows, hariIni, semua, out);
}

function hitungPersetujuanPantau_(rows, hariIni, semua, out) {
  const bulan = hariIni.slice(0, 7);
  const hitung = {};
  rows.forEach(function (r) {
    if (!semua && r.jenis !== 'CEKLOK') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.tgl)) return;
    const st = r.keputusan === 'SETUJU' || r.keputusan === 'TOLAK' ? r.keputusan : 'MENUNGGU';
    if (st === 'MENUNGGU') {
      out.menunggu.push({ tgl: r.tgl, umur: selisihHariPantau_(r.tgl, hariIni), nama: r.nama, jenis: r.jenis,
        pengajuan: r.pengajuan, ket: r.ket });
    }
    if (r.tgl.slice(0, 7) !== bulan) return;
    const k = normNama_(r.nama);
    const h = hitung[k] = hitung[k] || { nama: r.nama, jumlah: 0, setuju: 0, tolak: 0, menunggu: 0 };
    h.jumlah++;
    h[st.toLowerCase()]++;
  });
  out.menunggu.sort(function (a, b) { return b.tgl.localeCompare(a.tgl) || a.nama.localeCompare(b.nama); });
  out.menunggu = out.menunggu.slice(0, 100);
  out.sering = Object.keys(hitung).map(function (k) { return hitung[k]; })
    .filter(function (h) { return h.jumlah >= PANTAU_SERING_MIN; })
    .sort(function (a, b) { return b.jumlah - a.jumlah || a.nama.localeCompare(b.nama); });
  return out;
}

function selisihHariPantau_(a, b) {
  const t = function (s) { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((t(b) - t(a)) / 86400000);
}

// Jalankan dari editor Apps Script (sebagai admin) untuk melihat hasil di Log eksekusi.
function ujiPantauan() {
  CacheService.getScriptCache().removeAll(['pantauan_pola|semua', 'pantauan_pola|satpas']);
  const d = pantauanData_({ role: 'admin' });
  const ck = d.hariIni.ceklok || {}, cw = d.hariIni.cw || {};
  Logger.log('hariIni ' + d.hariIni.tgl + ' ' + d.hariIni.jam +
    ' · ceklok ' + (ck.error || ck.libur || JSON.stringify(ck.ringkas)) +
    ' · cw ' + (cw.error || cw.libur || JSON.stringify(cw.ringkas)));
  Logger.log('pola ' + (d.pola.error || d.pola.daftar.length + ' orang') + ' · persetujuan ' +
    (d.persetujuan.error || d.persetujuan.menunggu.length + ' menunggu, ' + d.persetujuan.sering.length + ' sering'));
  Logger.log(JSON.stringify(d).slice(0, 6000));
}
