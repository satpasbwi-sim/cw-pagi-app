# Status & pekerjaan lanjutan – Aplikasi CW Pagi / Ceklok Satpas

Dibuat 24 Okt 2026. Simpan di folder proyek supaya sesi berikutnya (akun Claude / email lain) bisa melanjutkan.
Tidak berisi kata sandi atau kode rahasia.

## Cara melanjutkan di akun / sesi baru
1. Buka folder `C:\Users\LENOVO\Downloads\cw-pagi-app` di Claude Code (Desktop).
2. Tulis: "Baca catatan-lanjutan/STATUS-LANJUTAN.md lalu lanjutkan bagian BELUM DIKERJAKAN yang saya pilih."
3. Browser panel Claude harus login Google **satpasbwi@gmail.com** (akun pemilik Apps Script / spreadsheet). Akun Claude boleh berbeda;
   yang menentukan akses adalah login Google di browser panel, bukan email Claude.
4. Memori sesi lama ada di `C:\Users\LENOVO\.claude\projects\C--Users-LENOVO-Downloads-cw-pagi-app\memory\` (bisa tidak ikut bila
   akun berganti; isi pokoknya sudah diringkas di sini).

## Tautan penting
- Apps Script, spreadsheet CW Pagi'26, dan Absensi Satpas'26: lihat `catatan-lanjutan/TAUTAN-LOKAL.md` (hanya di laptop, tidak
  di-push ke GitHub karena repo publik dan spreadsheet berisi data anggota). Bila file itu tidak ada: buka Google Drive akun
  satpasbwi@gmail.com, atau Apps Script → Ekstensi dari spreadsheet CW Pagi'26.
- Aplikasi anggota: https://satpasbwi-sim.github.io/integritas-satuan-app/ (repo satpasbwi-sim/integritas-satuan-app, cabang main)
- Rincian teknis lengkap: `README.md` (bagian "Mode resmi bertahap per NRP", "CW Pagi hanya Senin–Jumat", "Bonus konsistensi & pengingat")

## Sudah selesai & aktif (per 24 Okt 2026)
| Hal | Keterangan | Posisi |
| --- | --- | --- |
| Mode resmi per NRP | Mulai **26/10/2026** hanya NRP/kode di `NRP_RESMI` (ModeResmi.gs) yang resmi; lainnya tetap uji coba (reset ±19.00). Data sebelum 26/10 dihapus semua. | Server |
| CW Pagi Senin–Jumat | Mulai 26/10 Sabtu/Minggu tidak ada Lapor CW dan tidak dinilai; Ceklok Satpas tetap Senin–Sabtu. | Server + aplikasi |
| Bonus konsistensi | Mingguan/bulanan, ≥5 hari dinilai & ≥90% hari sempurna → +2 skor (maks 100, tidak bila ⚠️ PALSU). | Server |
| Pengingat | Banner + notifikasi (bila diizinkan) untuk Lapor Datang/Selesai & Ceklok Masuk/Pulang; hanya saat aplikasi terbuka/di latar belakang. | Aplikasi |
| Sheet PANDUAN | Ditulis ulang lewat `Panduan.gs` (fungsi `perbaruiPanduan`). | Spreadsheet |
| Deploy server | **Versi 54** (24 Okt 2026, 20.36; Peringatan dini pembinaan: `Pembinaan.gs` + `action=pembinaan` dan tanda `pembinaan: true` untuk pengawas/admin di Kode.gs). Versi 53 (14.49): CEK FOTO TIDAK SESUAI −30. Versi 52 (14.10): perbaikan baris ABSENSI tanpa NRP ("Pos 12.04 …", "Patwal R4", "3 Pers Laka") tetap diperlakukan uji coba, dan INTEGRITAS HARIAN menulis "Uji coba – data sudah direset" untuk anggota uji coba. | Apps Script |
| Aplikasi (GitHub Pages) | Commit `76fba4d`, cache service worker `cw-pagi-v39`. | GitHub |

## BELUM DIKERJAKAN / BELUM DIUJI
### Dipilih untuk dikerjakan
- [x] Peringatan dini pembinaan (skor mingguan turun 2 minggu berturut-turut, tab Pembinaan untuk pengawas/admin):
  server terpasang di Apps Script **Versi 54** (24 Okt 2026); `ujiPembinaan` jalan (daftar masih kosong).
  - [ ] Gabungkan PR #1 (`web/`, cache `cw-pagi-v45`) ke `main` setelah disetujui pemilik, lalu cek: pengawas/admin
    melihat tombol **Pembinaan**, anggota biasa tidak.

### Wajib dicek hari pertama (26/10/2026)
- [ ] Satu NRP resmi: Lapor/Ceklok mengikuti aturan resmi (ditolak di luar jam/radius/tanpa foto).
- [ ] Setelah reset ±19.00, data NRP resmi hari itu masih ada di LOG LAPOR / LOG CEKLOK.
- [ ] Anggota di luar daftar tetap bisa lapor bebas dan datanya direset ±19.00.
- [ ] Pengingat tampil di HP (banner sebelum 06.30 bila belum Lapor Datang; hilang setelah lapor) dan tawaran izin notifikasi muncul.
- [ ] Sabtu 31/10: tab Lapor CW menampilkan "Hari ini libur CW Pagi"; penilaian tidak menghitung Sabtu.
- [ ] Bonus konsistensi baru terlihat setelah satu minggu penuh (minggu 26–30 Okt, final Senin 2 Nov).

### Keterbatasan yang diketahui
- Pengingat tidak bisa memberi notifikasi bila aplikasi ditutup sepenuhnya (butuh server push; tidak ada di Apps Script).
- LAPORAN HARIAN / REKAP BULANAN (rumus di sheet) tidak diubah: Sabtu/Minggu bisa tampak "belum lapor" (abaikan).
- Baris ABSENSI pos jaga / Patwal / Laka dipakai bersama: bila anggota resmi dan uji coba lapor di baris yang sama pada hari yang
  sama, kode H baris itu dipertahankan reset (milik anggota resmi).
- Reset ±19.00 hari ≥ 26/10 tidak lagi menghapus kode H / N di ABSENSI yang tidak berasal dari laporan aplikasi (isian manual admin).
- `UJI_COBA` masih `true` untuk semua. Bila seluruh anggota sudah resmi: ubah ke `false` di Code.gs, deploy.

### Keputusan PERSETUJUAN (24 Okt)
- Dipilih: **atasan memeriksa sheet PERSETUJUAN setiap hari sebelum pukul 15.00** (manual, tanpa keputusan otomatis).
- Belum dipilih / bisa ditambah nanti: pengajuan yang tidak diputuskan dalam 1×24 jam otomatis **SETUJU (otomatis)** dan ditandai di
  🩺 Cek & Perbaiki + rekap pimpinan (saran), atau otomatis SETUJU dengan nilai lebih rendah, atau otomatis TOLAK.

### Usulan yang belum dipilih (dari diskusi 24 Okt)
- A2 Bonus inisiatif lapangan (tugas mendadak disetujui / lembur beralasan).
- A3 Pembobotan ulang `BOBOT_INTEGRITAS` (Code.gs) – butuh keputusan pimpinan, umumkan dulu ke anggota.
- A4 Unsur ke-7 penilaian atasan per kualitas tugas (mis. 10%).
- B1 Peringkat & tren (naik/turun vs minggu lalu) di Nilai Saya.
- B3 Papan penghargaan mingguan (Teladan, Paling konsisten).
- B4 Alasan potongan per kejadian di Nilai Saya ("−6 karena terlambat 3 menit pada 28/10").
- C1 QR dinamis dari tablet kantor untuk Ceklok Masuk/Pulang, beserta usulan peningkatannya: lihat
  `catatan-lanjutan/SKEMA-QR-DINAMIS.md`.

### Audit celah kecurangan (21 Okt) yang belum diterapkan
- 2 cek kehadiran acak selfie · 5 piket BM/Patwal/Laka dinilai dari jadwal · 6 laporan tertunda tidak menguntungkan ·
  7 waktu perangkat bisa mundur ≤20 mnt · 8 deteksi fake GPS lemah · 10 foto hanya 3 hari (usul 14–30 hari) · 9 sidak atasan.
- Sudah diterapkan: 1 foto wajah Lapor Selesai, 3 satu NRP satu HP, 4 izin/tugas mendadak perlu persetujuan, titik tanpa koordinat ditolak.

## Cara deploy perubahan kode server (ringkas)
Folder `apps-script/` tidak masuk git (ada di .gitignore). Cadangan = folder itu sendiri.
1. Edit `.gs` di `apps-script/`, cek sintaks (`node --check` pada salinan .js).
2. Buka editor Apps Script (login satpasbwi@gmail.com). Terapkan perubahan ke model monaco lewat patch lama→baru,
   cocokkan hash isi (x = x*31 + charCode |0) sebelum & sesudah dengan file lokal. File baru: tombol + → Skrip → ganti nama.
3. Ctrl+S, pastikan "Disimpan ke Drive". Terapkan → Kelola deployment → pensil → Versi: **Versi baru** → deskripsi → Terapkan.
   URL /exec tidak berubah. Cek: `.../exec?pin=00000001` harus menjawab `{"error":"PIN salah"}`.
4. Aplikasi (folder `web/`): commit & push ke `main`; naikkan versi cache di `web/sw.js`. Push hanya setelah disetujui pemilik.

## Peta file baru dalam pekerjaan ini
- `apps-script/ModeResmi.gs` – NRP_RESMI, TGL_RESMI, `ujiCoba_`, `cwLibur_` (TGL_CW_SENIN_JUMAT).
- `apps-script/Panduan.gs` – isi sheet PANDUAN (jalankan `perbaruiPanduan` setelah mengubah teks).
- `apps-script/Urutan.gs` – `bonusKonsisten_` (BONUS_KONSISTEN, KONSISTEN_MIN_HARI, KONSISTEN_PERSEN).
- `web/app.js` – `cekPengingat`, pesan libur CW.
