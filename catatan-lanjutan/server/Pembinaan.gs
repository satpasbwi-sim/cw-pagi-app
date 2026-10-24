// Peringatan dini pembinaan: anggota yang skor mingguan FINAL-nya turun 2 minggu berturut-turut.
// Sumber: sheet RIWAYAT INTEGRITAS MINGGUAN (spreadsheet Data Satpas, SATPAS_SS_ID di Kode.gs), ditulis tiap Senin pagi
// oleh IntegritasMingguan.gs. Kolom dicari lewat JUDUL (boleh digeser). Hanya untuk pengawas / admin (GET action=pembinaan).
// Rancangan: catatan-lanjutan/PERINGATAN-DINI-PEMBINAAN.md

const PEMBINAAN_MIN_TURUN = 3;    // total turun minimal (minggu W-2 → W) agar masuk daftar
const PEMBINAAN_MIN_HARI = 3;     // minggu dengan hari dinilai < ini dilewati (libur / izin panjang)
const PEMBINAAN_SHEET = 'RIWAYAT INTEGRITAS MINGGUAN';
const PEMBINAAN_CACHE_DETIK = 600;
// judul kolom yang dicari (huruf besar/kecil diabaikan; cocok bila judul MEMUAT salah satu teks)
const PEMBINAAN_KOLOM = {
  nrp: ['NRP'],
  nama: ['NAMA', 'PETUGAS'],
  pokja: ['POKJA'],
  minggu: ['PERIODE', 'MINGGU', 'SENIN', 'TANGGAL'],
  skor: ['SKOR', 'NILAI AKHIR'],
  predikat: ['PREDIKAT'],
  hari: ['HARI DINILAI', 'JUMLAH HARI'],
  catatan: ['CATATAN']
};
// unsur penilaian (BOBOT_INTEGRITAS); dipakai untuk "unsur paling turun" bila kolomnya ada di RIWAYAT
const PEMBINAAN_UNSUR = ['Kehadiran CW', 'Ceklok Satpas', 'Kejujuran lokasi', 'Ketepatan waktu', 'Kelengkapan lapor', 'Durasi tugas'];

// Dipanggil dari doGet untuk action=pembinaan (setelah cek pengawas / admin, sama seperti action=rekap).
function pembinaanData_() {
  const cache = CacheService.getScriptCache();
  const simpan = cache.get('pembinaan_v1');
  if (simpan) return JSON.parse(simpan);
  const sh = SpreadsheetApp.openById(SATPAS_SS_ID).getSheetByName(PEMBINAAN_SHEET);
  if (!sh) return { error: 'Sheet ' + PEMBINAAN_SHEET + ' belum ada. Nilai mingguan final disimpan tiap Senin pagi.' };
  const nilai = sh.getDataRange().getValues();
  const baris = bacaRiwayatPembinaan_(nilai);
  if (baris.error) return baris;
  const hasil = hitungPembinaan_(baris);
  hasil.diperbarui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH.mm');
  try { cache.put('pembinaan_v1', JSON.stringify(hasil), PEMBINAAN_CACHE_DETIK); } catch (e) { /* terlalu besar: abaikan */ }
  return hasil;
}

// isi sheet (array 2D) → [{nrp, nama, pokja, senin:'yyyy-MM-dd', skor, predikat, hari, catatan:[], unsur:{nama: nilai}}]
function bacaRiwayatPembinaan_(nilai) {
  let h = -1;
  for (let i = 0; i < Math.min(10, nilai.length); i++) {
    if (nilai[i].some((c) => String(c).trim().toUpperCase() === 'NRP')) { h = i; break; }
  }
  if (h < 0) return { error: 'Judul kolom NRP tidak ditemukan di ' + PEMBINAAN_SHEET + '.' };
  const judul = nilai[h].map((c) => String(c).trim().toUpperCase());
  const cari = (daftar) => {
    for (const t of daftar) { const i = judul.findIndex((j) => j === t); if (i >= 0) return i; }
    for (const t of daftar) { const i = judul.findIndex((j) => j.indexOf(t) >= 0); if (i >= 0) return i; }
    return -1;
  };
  const k = {};
  Object.keys(PEMBINAAN_KOLOM).forEach((n) => { k[n] = cari(PEMBINAAN_KOLOM[n]); });
  const kurang = ['nrp', 'minggu', 'skor'].filter((n) => k[n] < 0);
  if (kurang.length) {
    return { error: 'Kolom ' + kurang.join(', ') + ' tidak ditemukan di ' + PEMBINAAN_SHEET + '. Judul yang ada: ' +
      judul.filter(String).join(' | ') + '. Sesuaikan PEMBINAAN_KOLOM di Pembinaan.gs.' };
  }
  const kUnsur = {};
  PEMBINAAN_UNSUR.forEach((u) => {
    const i = judul.findIndex((j, x) => x !== k.skor && j.indexOf(u.toUpperCase()) >= 0);
    if (i >= 0) kUnsur[u] = i;
  });
  const out = [];
  for (let r = h + 1; r < nilai.length; r++) {
    const v = nilai[r];
    const nrp = String(v[k.nrp] || '').trim();
    const senin = seninPembinaan_(v[k.minggu]);
    const skor = angkaPembinaan_(v[k.skor]);
    if (!nrp || !senin || skor == null) continue;
    const unsur = {};
    Object.keys(kUnsur).forEach((u) => { const x = angkaPembinaan_(v[kUnsur[u]]); if (x != null) unsur[u] = x; });
    out.push({
      nrp, senin, skor, unsur,
      nama: k.nama >= 0 ? String(v[k.nama] || '').trim() : nrp,
      pokja: k.pokja >= 0 ? String(v[k.pokja] || '').trim() : '',
      predikat: k.predikat >= 0 ? String(v[k.predikat] || '').trim() : '',
      hari: k.hari >= 0 ? angkaPembinaan_(v[k.hari]) : null,
      catatan: k.catatan >= 0 ? String(v[k.catatan] || '').split(/\n|;\s*/).map((c) => c.trim()).filter(Boolean) : []
    });
  }
  return out;
}

// inti aturan (tanpa SpreadsheetApp, bisa diuji terpisah)
function hitungPembinaan_(baris, minTurun, minHari) {
  minTurun = minTurun == null ? PEMBINAAN_MIN_TURUN : minTurun;
  minHari = minHari == null ? PEMBINAAN_MIN_HARI : minHari;
  const per = {};
  baris.forEach((b) => { (per[b.nrp] = per[b.nrp] || {})[b.senin] = b; });   // minggu sama dua kali: baris terakhir
  const semuaSenin = Object.keys(baris.reduce((o, b) => { o[b.senin] = 1; return o; }, {})).sort();
  const daftar = [];
  Object.keys(per).forEach((nrp) => {
    const mg = Object.keys(per[nrp]).sort().map((s) => per[nrp][s]);
    const w = mg.slice(-3);
    if (w.length < 3) return;
    // 3 minggu terakhir harus berurutan (selisih 7 hari) dan cukup hari dinilai
    if (selisihHariPembinaan_(w[0].senin, w[1].senin) !== 7 || selisihHariPembinaan_(w[1].senin, w[2].senin) !== 7) return;
    if (w.some((x) => x.hari != null && x.hari < minHari)) return;
    if (!(w[0].skor > w[1].skor && w[1].skor > w[2].skor)) return;
    const turun = Math.round((w[0].skor - w[2].skor) * 10) / 10;
    if (turun < minTurun) return;
    let unsur = '', maks = 0;
    Object.keys(w[0].unsur).forEach((u) => {
      if (w[2].unsur[u] == null) return;
      const t = w[0].unsur[u] - w[2].unsur[u];
      if (t > maks) { maks = t; unsur = u; }
    });
    const akhir = w[2];
    daftar.push({ nrp, nama: akhir.nama, pokja: akhir.pokja, skor: w.map((x) => x.skor), turun,
      predikat: akhir.predikat, unsur, catatan: akhir.catatan });
  });
  daftar.sort((a, b) => b.turun - a.turun || a.nama.localeCompare(b.nama));
  return {
    minggu: semuaSenin.slice(-3),
    aturan: 'Skor mingguan final turun 2 minggu berturut-turut (total ≥ ' + minTurun + ' poin)',
    daftar
  };
}

function angkaPembinaan_(x) {
  if (typeof x === 'number') return isFinite(x) ? x : null;
  const s = String(x == null ? '' : x).trim().replace(',', '.');
  if (!s || isNaN(Number(s))) return null;
  return Number(s);
}
// Date / "12 Oktober 2026 – 18 Oktober 2026" (isi RIWAYAT) / "dd/MM/yyyy …" / "yyyy-MM-dd" → tanggal Senin minggu itu, 'yyyy-MM-dd'
function seninPembinaan_(x) {
  let d = null;
  if (Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x)) d = new Date(x.getFullYear(), x.getMonth(), x.getDate());
  else {
    const s = String(x == null ? '' : x);
    let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else if ((m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    else if ((m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/))) {
      const b = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'].indexOf(m[2].slice(0, 3).toLowerCase());
      if (b >= 0) d = new Date(Number(m[3]), b, Number(m[1]));
    }
  }
  if (!d) return '';
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  const dua = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate());
}
function selisihHariPembinaan_(a, b) {
  const t = (s) => { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((t(b) - t(a)) / 86400000);
}

// Jalankan dari editor Apps Script untuk melihat hasil di Log (Lihat → Log eksekusi).
function ujiPembinaan() {
  CacheService.getScriptCache().remove('pembinaan_v1');
  Logger.log(JSON.stringify(pembinaanData_(), null, 2));
}
