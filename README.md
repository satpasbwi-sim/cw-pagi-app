# Laporan CW Pagi – Satlantas Polresta Banyuwangi

Aplikasi web (bisa dipasang di HP) untuk laporan **Pengaturan Pagi (CW Pagi)**:
anggota melapor sendiri dengan **NRP**, lokasi **GPS**, dan foto; admin melihat
**Rekap** per simpul dan mengirim teks laporan ke grup WhatsApp.

- Aplikasi: **https://satpasbwi-sim.github.io/cw-pagi-app/**
- Data: spreadsheet **"CW Pagi Okt'26"** di Google Drive (sekaligus database)
- Kode tampilan: repo GitHub **satpasbwi-sim/cw-pagi-app** (folder `web/`)
- Kode server: Apps Script di spreadsheet tersebut (file **Kode.gs**)

Aplikasi tidak bergantung pada Claude atau layanan berbayar: semuanya berjalan di
GitHub Pages, Google Apps Script, Google Sheets, dan Google Drive milik satuan.

---

## 1. Cara kerja singkat

```
 HP anggota / admin                 Google (akun satuan)                    GitHub
┌───────────────────┐  JSON   ┌──────────────────────────┐          ┌──────────────────┐
│ Aplikasi web      │ ──────▶ │ Apps Script (Kode.gs)    │          │ Repo cw-pagi-app │
│ (folder web/)     │ ◀────── │ = API, cek NRP/jam/GPS   │          │ folder web/      │
└───────────────────┘         └────────────┬─────────────┘          └────────┬─────────┘
        ▲                                  │ baca/tulis                      │ otomatis
        │                                  ▼                                 ▼
        │                     ┌──────────────────────────┐          ┌──────────────────┐
        └──── dibuka dari ─── │ Spreadsheet + Drive      │          │ GitHub Pages     │
              github.io       │ ABSENSI, ANGGOTA, JADWAL │          │ (situs aplikasi) │
                              │ KOORDINAT, LOG LAPOR, …  │          └──────────────────┘
                              └──────────────────────────┘
```

## 2. Siapa bisa apa

| Login dengan | Menu | Bisa melakukan |
| --- | --- | --- |
| NRP anggota (sheet **ANGGOTA**) | **Lapor Saya** | Lapor Datang, Lapor Selesai, atau lapor Tidak Hadir **untuk dirinya sendiri** |
| NRP admin (daftar `ADMIN_NRP` di Kode.gs) **+ kode admin** | **Lapor Saya** + **Rekap** | Semua di atas + lihat/ubah status semua personil, catatan, kirim teks WhatsApp |

Tidak ada lagi PIN bersama. NRP yang tidak terdaftar ditolak ("NRP tidak terdaftar").

**Kode admin (pengaman kedua):** NRP admin saja hanya membuka Lapor Saya. Untuk membuka
Rekap, admin mengetik **kode admin** di kotak "Admin – buka menu Rekap" di bawah Lapor Saya.
- Atur / ganti kode: buka spreadsheet → menu **🚀 CW PAGI APP → 🔐 Atur Kode Admin Aplikasi**
  (minimal 6 karakter). Yang disimpan hanya sidik (hash) kode di *Script Properties*, bukan kodenya.
- Salah 5 kali → kotak admin terkunci 15 menit.
- Lupa kode: atur ulang lewat menu yang sama (perlu akses edit spreadsheet).

## 3. Aturan lapor anggota

| Jam (bawaan) | Yang bisa dilakukan |
| --- | --- |
| sebelum 06.00 | Belum dibuka |
| 06.00 – 06.30 | **Lapor Datang** (langkah 1) – wajib di dalam radius titik |
| 06.30 – 07.00 | Tetap di lokasi, ada hitung mundur |
| 07.00 – 07.15 | **Lapor Selesai** (langkah 2) – wajib di dalam radius titik |
| setelah 07.15 | Ditutup |

- Status **H** baru masuk ke sheet ABSENSI setelah **Lapor Selesai** yang sah.
  Yang hanya Lapor Datang tidak dihitung (kolom tetap kosong, tercatat di LOG LAPOR).
- Di luar radius (bawaan **100 m**) tombol lapor terkunci dan muncul pemberitahuan merah.
- Titik yang **belum punya koordinat** tetap bisa lapor, ditandai "jarak belum dicek".
- **Tidak hadir** (Sakit/Izin/…) bisa dilaporkan 06.00–07.15 tanpa cek lokasi.
- Foto **wajib** untuk Lapor Datang dan Lapor Selesai, diambil **langsung dari kamera aplikasi**
  (tidak bisa dari galeri). Foto diberi watermark **nama petugas** dan **tanggal & jam server**
  (berjalan detik demi detik, tidak ikut jam HP). Lokasi simpul dan koordinat tidak dicetak di foto,
  tetapi tetap tercatat di LOG LAPOR. Foto lebih dari 10 menit ditolak. Disimpan di Google Drive folder **"CW Pagi - Foto Lapor"**.
- **Deteksi fake GPS.** Laporan ditandai ⚠️ (kolom PERINGATAN di LOG LAPOR) bila: akurasi ≤ 1 m,
  koordinat sama persis dengan titik di KOORDINAT, atau sama persis dengan laporan lain (hari lain,
  Datang = Selesai, atau personil lain) dengan akurasi ≤ 20 m. Laporan bertanda ⚠️ **tidak dihitung
  hadir**: ABSENSI diisi **N (Nihil)**, sehingga LAPORAN HARIAN ikut Nihil, dan alasannya ditulis di
  sheet CATATAN. Anggota melihat "menunggu verifikasi admin". Bila ternyata asli, admin cukup
  mengganti N menjadi H di ABSENSI.
- Jam dan radius dicek di server, memakai jam server (tidak bisa diakali jam HP).

## 4. Pengoperasian harian (cukup di spreadsheet, tanpa push)

| Ingin mengubah | Caranya |
| --- | --- |
| Jam lapor / radius | Sheet **JADWAL**, kolom B (mis. `06:45`, radius `150`). Berlaku langsung. |
| Anggota & NRP | Sheet **ANGGOTA**: kolom A = nama **persis** seperti kolom B (PETUGAS) di ABSENSI, kolom B = NRP. |
| Koordinat titik | Sheet **KOORDINAT**: kolom A = nama lokasi (sama dengan ABSENSI), kolom B = `lat, lng` dari Google Maps (tekan lama titik → salin angka). |
| Plotting petugas | Sheet **ABSENSI** seperti biasa. Lokasi baru otomatis ditambahkan ke KOORDINAT. |
| Personel pos jaga (BM) | Baris ABSENSI "Pos 12.04 Karangente / Pos 12.02 Ketapang" tidak memuat nama. Saat login, server membaca spreadsheet **Jadwal Piket BM** (sheet *Piket BM*) dan mengarahkan ke baris sesuai shift hari itu: KETERANGAN TUGAS "…Piket Malam" = M, "…Lepas Dinas" = LD, "Piket Siang" = S. Nama di ANGGOTA kolom A harus **sama persis** dengan nama di jadwal (mis. `AIPTU SUGIHARTO`). LOG LAPOR dan CATATAN mencatat nama asli pelapor. |
| Personel Patwal R4 | Baris ABSENSI "Patwal R4" dengan KETERANGAN TUGAS "Cadangan 1 Wal R4" / "Cadangan 2 Wal R4" diisi unit CADANGAN 1 / CADANGAN 2 hari itu menurut spreadsheet **Piket Patwal** (sheet *Patwal*). Personel dicocokkan lewat **NRP** di tabel PERSONIL sheet Patwal (unit 503/504/506/507), jadi NRP di ANGGOTA harus sama dengan NRP di sheet Patwal. "Cadangan 3/4 Wal R4" sementara belum dipetakan. |
| Personel Piket Laka Lantas | Baris ABSENSI "2 Pers Laka" dengan KETERANGAN TUGAS "Akan Naik Piket Laka" diisi **regu Piket** hari itu, "Cadangan Laka" diisi **regu Cadangan**, menurut spreadsheet **Jadwal Piket Laka** (sheet *Jadwal Piket* & *Data Regu*). Regu Lepas Dinas tidak punya plotting. Dicocokkan lewat **NRP** di Data Regu; bila NRP di sana salah/ganda, dicocokkan lewat **nama** di ANGGOTA (nama Data Regu tanpa gelar harus terkandung di nama ANGGOTA). |
| Kode alasan (S, I, LD, …) | Sheet **PENGATURAN** E5:F11 (seperti sebelumnya). |

Catatan:
- Kolom NRP di ANGGOTA berformat **teks** agar angka 0 di depan (mis. `00012345`) tidak hilang.
- Urutan jam di JADWAL harus: Buka < Batas Datang ≤ Mulai Selesai < Tutup. Jika salah,
  aplikasi otomatis memakai jam bawaan 06.00 / 06.30 / 07.00 / 07.15.
- Cara paling akurat mengisi koordinat: buka link **peta** dari laporan anggota yang
  benar-benar berdiri di titik (menu Rekap atau sheet LOG LAPOR), salin koordinatnya.

## 5. Sheet di spreadsheet

| Sheet | Isi | Dibuat oleh |
| --- | --- | --- |
| ABSENSI | Plotting & kode harian (H/S/I/…) per tanggal | sudah ada |
| PENGATURAN | Bulan, tahun, tanggal akhir (C7), kode & status | sudah ada |
| CATATAN | Catatan / pengganti per tanggal & no plotting | sudah ada (aplikasi ikut menulis) |
| ANGGOTA | Nama petugas ↔ NRP (untuk login) | aplikasi |
| KOORDINAT | Nama lokasi ↔ koordinat titik | aplikasi |
| JADWAL | Jam lapor & radius | aplikasi |
| LOG LAPOR | Riwayat setiap laporan: waktu, status (DATANG/H/kode), jarak, akurasi, peta, foto, catatan | aplikasi |

## 6. Struktur folder di laptop

```
cw-pagi-app/
├── web/                     ← aplikasi (ikut ke GitHub, tampil di github.io)
│   ├── index.html, app.js, style.css
│   ├── config.js            ← URL Apps Script (/exec)
│   ├── sw.js, manifest.json ← agar bisa dipasang di HP
│   └── logo.png, icon-*.png ← logo Lalu Lintas & ikon
├── .github/workflows/pages.yml ← publish otomatis folder web/ ke GitHub Pages
├── apps-script/Code.gs      ← salinan kode server (TIDAK ke GitHub, lihat §9)
├── README.md                ← panduan ini
└── _arsip-lokal/            ← salinan lama, tidak dipakai (TIDAK ke GitHub)
```

## 7. Mengubah tampilan aplikasi lalu "push"

Folder ini sudah tersambung ke repo GitHub (Git). Setelah mengubah file di `web/`:

**Cara A – GitHub Desktop (paling mudah)**
1. Pasang GitHub Desktop, login akun GitHub satuan, *File → Add local repository* →
   pilih folder `cw-pagi-app`.
2. Tulis ringkasan perubahan → **Commit to main** → **Push origin**.

**Cara B – perintah Git**
```bash
git add web
git commit -m "Ubah ..."
git push
```

**Cara C – lewat browser**: github.com → repo → masuk folder `web` → *Add file →
Upload files* → **pastikan jalurnya `cw-pagi-app / web /`** → Commit changes.

Setelah push, tab **Actions** di GitHub menjalankan "Deploy ke GitHub Pages" (±1 menit).
Jika hijau, situs sudah memakai versi baru. Di HP: tutup lalu buka ulang aplikasi.

## 8. Mengubah kode server (Kode.gs) lalu deploy

1. Ubah `apps-script/Code.gs` di laptop (simpan sebagai cadangan).
2. Buka spreadsheet → **Extensions → Apps Script** → file **Kode.gs** → tempel isinya → simpan (Ctrl+S).
3. **Terapkan → Kelola deployment** → ikon pensil → **Versi: Versi baru** → **Terapkan**.
   URL `/exec` **tidak berubah**, jadi `web/config.js` tidak perlu diubah.
4. Jika muncul *"Dibutuhkan otorisasi"*: klik **Tinjau izin** → pilih akun → **Pilih semua** → Lanjutkan.

Pengaturan penting di Kode.gs:
- `ADMIN_NRP` – daftar NRP yang boleh membuka Rekap (tetap wajib kode admin).
- Kode admin **tidak** ada di kode: diatur lewat menu spreadsheet (lihat bagian 2).
- `JADWAL`, `RADIUS_M` – nilai **bawaan** (dipakai jika sheet JADWAL kosong/salah).

Catatan proyek Apps Script:
- Menu **🔐 Atur Kode Admin Aplikasi** ditambahkan di fungsi `onOpen` file **AutoDeploy.gs**.
- File **AutoDeploy.gs** (menu "🚀 CW PAGI APP" di spreadsheet) fungsi `doGet/doPost`-nya
  sudah diganti nama menjadi `doGet_AutoDeploy/doPost_AutoDeploy` agar tidak bentrok dengan
  API di Kode.gs. **Jangan dikembalikan**, karena aplikasi akan berhenti bekerja.
- `appsscript.json` memuat `oauthScopes` (Spreadsheet, Drive, menu, akses internet).
  Jika menambah layanan Google baru di kode, tambahkan juga cakupannya di sini.
- Ada fungsi `izinkanAkses` untuk dijalankan sekali bila izin Drive perlu diberikan ulang.

## 9. Keamanan

- Repo GitHub **publik**. Karena itu yang **tidak** di-upload (lihat `.gitignore`):
  `apps-script/` (memuat NRP admin), dokumen jadwal `.docx/.pdf` (nama personel), `_arsip-lokal/`.
- Data personil & NRP hanya ada di spreadsheet; aplikasi mengambilnya lewat Apps Script
  setelah login. Anggota hanya menerima data dirinya sendiri.
- Rekap dilindungi NRP admin **+ kode admin** (bagian 2), jadi NRP admin saja tidak cukup.
- Untuk anggota, siapa pun yang tahu NRP seseorang bisa melapor sebagai orang itu, tetapi
  tetap terikat jam & radius titik. Jika perlu, bisa ditambah kode kedua untuk anggota juga.
- **Cadangkan** `apps-script/Code.gs` (mis. salin ke Google Drive), karena tidak ada di GitHub.

## Tinggalkan Lokasi (tugas mendadak)

Setelah **Lapor Datang** (kapan saja, meski baru 1 menit), anggota bisa mengetuk **🚨 Ada tugas mendadak?
Tinggalkan lokasi**, memilih **jenis tugas** (Laka lantas · Pengawalan/Patwal · Perintah pimpinan · Kejadian
darurat · Lainnya) dan mengisi **keterangan singkat**. Tanpa foto, tanpa cek radius, dan Lapor Selesai tidak
diperlukan lagi.
- ABSENSI tetap **H** (sudah hadir saat Lapor Datang), kecuali Lapor Datang bertanda ⚠️ (tetap N).
- LOG LAPOR status **TINGGAL**, kolom CATATAN berisi "jenis: keterangan"; sheet CATATAN / LAPORAN HARIAN
  berisi "Meninggalkan lokasi 06.42 – tugas mendadak (Laka lantas): …".
- Poin hari itu **netral** (golongan "Tugas mendadak", tidak masuk rata-rata); REKAP POIN punya kolom
  **TUGAS MENDADAK** untuk memantau frekuensinya.

## Sinyal putus saat lapor (antrean di HP)

Setiap laporan **disimpan di HP dulu**, baru dikirim. Bila sinyal putus, server tidak menjawab, atau aplikasi
tertutup saat mengirim, laporan tetap tersimpan dan muncul kotak **⏳ Laporan tersimpan di HP, belum
terkirim**. Anggota bisa lanjut ke langkah berikutnya (mis. Lapor Selesai), dan semuanya dikirim berurutan.
- Terkirim **otomatis** saat aplikasi dibuka lagi, saat sinyal kembali, dan tiap 20 detik. Ada juga tombol
  **⟳ Kirim sekarang**.
- Server mencatat **jam lapor asli**, bukan jam terkirim, bila tertundanya paling lama **20 menit**
  (`ANTRE_MAKS_MENIT` di Kode.gs). Lebih dari itu, atau sudah ganti hari, laporan ditolak dan anggota melihat
  alasannya. Kolom CATATAN di LOG LAPOR diberi tanda `[terkirim 06.41, tertunda 12 mnt – sinyal putus]`.
- Setiap laporan punya **ID kirim**. Bila laporan yang sama terkirim dua kali (jawaban server tidak sampai ke
  HP), server mengembalikan hasil pertama dan **tidak mencatatnya dua kali**.
- Antrean hilang bila data browser dihapus. Bila anggota menekan **Keluar**, laporannya baru terkirim setelah
  ia masuk lagi dengan NRP yang sama (ada peringatan sebelum keluar).

## Durasi tugas & poin

Setiap hari ±07.30 (pemicu `hitungDurasiPoin`, atau menu **📊 Hitung Durasi & Poin**) server menulis ulang:
- **DURASI POIN**: per petugas per hari — jam datang, jam selesai, durasi, golongan, poin.
- **REKAP POIN**: per petugas sebulan, urut poin tertinggi — Baik/Sedang/Kurang, total, rata-rata, predikat.

Golongan bawaan: **Baik** ≥ 60 menit (3 poin) · **Sedang** 45–59 (2) · **Kurang** < 45 (1) · Tidak lengkap /
Diragukan ⚠️ = 0 · Tidak hadir (S/I/LD/D/P) tidak dihitung. Ambang & poin diubah di sheet **JADWAL**
(baris "Durasi Baik (menit)", "Durasi Sedang (menit)", "Poin Baik/Sedang/Kurang"). Pasangan Datang–Selesai
dicocokkan per **nama petugas**, jadi dua orang di baris pos yang sama dihitung terpisah.

## Penilaian integritas anggota Satpas

Sheet **PENILAIAN INTEGRITAS** di spreadsheet **Data Satpas** (`SATPAS_SS_ID` di Kode.gs) ditulis ulang
otomatis setiap kali `hitungDurasiPoin` berjalan (pemicu ±07.30). Bisa juga dijalankan langsung lewat fungsi
`hitungIntegritasSatpas` di editor.
- Anggota diambil dari sheet **Data** (PETUGAS, PANGKAT, NRP, POKJA) dan dicocokkan lewat **NRP** ke sheet
  ANGGOTA CW Pagi. NRP yang sama dipakai untuk login di aplikasi.
- **Skor 0–100** = Kehadiran **40%** + Kejujuran lokasi **25%** + Kelengkapan lapor **20%** + Durasi tugas
  **15%** (`BOBOT_INTEGRITAS`).
  - Kehadiran = hari H ÷ hari wajib, dari ABSENSI (termasuk koreksi admin). LD/D/S/I/P dan `-` (tidak
    terjadwal) tidak dinilai.
  - Kejujuran lokasi = hari lapor tanpa ⚠️ ÷ hari lapor.
  - Kelengkapan = hari Datang + Selesai (atau tugas mendadak) ÷ hari Lapor Datang.
  - Durasi = rata-rata poin harian ÷ poin Baik. Hari ⚠️ dan tugas mendadak tidak masuk hitungan durasi.
- Predikat: **≥ 90 Sangat Baik · ≥ 80 Baik · ≥ 70 Cukup · < 70 Kurang**, lengkap dengan peringkat dan catatan
  (mis. "2× lokasi diragukan ⚠️").
- Hari ini baru dinilai setelah lapor ditutup. Unsur yang belum ada datanya tidak dihitung, dan bobot unsur
  lain disesuaikan.
- Anggota yang tidak ada di plotting bulan itu: kehadiran tidak dinilai, ditulis di CATATAN.
- **Masa uji coba:** isi `TGL_MULAI_INTEGRITAS` (mis. `'2026-11-01'`) agar hari-hari uji coba tidak ikut dinilai.
- Akun pemilik Apps Script harus punya akses **edit** ke spreadsheet Data Satpas. Saat pertama dijalankan,
  Google meminta izin.

## 10. Ganti bulan

**Cek dulu:** spreadsheet → menu **🚀 CW PAGI APP → 🩺 Cek Kesiapan / Ganti Bulan** (hanya membaca).
Menu ini memeriksa: bulan di PENGATURAN (dan mengingatkan 3 hari sebelum akhir bulan), struktur
ABSENSI (baris 7–86 utuh), jadwal Piket BM tersedia ≥ 7 hari ke depan, jadwal Patwal hari ini,
personel ANGGOTA yang tidak cocok dengan plotting/jadwal, ukuran LOG LAPOR (arsipkan bila ≥ 3000
baris), pemicu hapus foto, dan mode uji coba. Jalankan juga sesudah mengubah plotting atau jadwal.

Daftar periksa ganti bulan:
1. PENGATURAN C4–C5 (bulan, tahun) → C7 ikut berubah.
2. Kosongkan kolom tanggal ABSENSI (E7:AI86) dan isi CATATAN. **Jangan hapus baris.**
3. Jadwal Piket BM: buat periode baru. Sheet Patwal: perbarui unit/personel bila ada mutasi.
4. Arsipkan LOG LAPOR bulan lalu (salin ke spreadsheet arsip, sisakan baris judul).
5. Jalankan 🩺 Cek Kesiapan sampai semua ✅ (kecuali mode uji coba bila memang masih uji coba).

**Pilihan A – satu spreadsheet dipakai terus (paling mudah)**
Kosongkan kolom tanggal di ABSENSI, ubah bulan/tahun/tanggal akhir di PENGATURAN (C4, C5, C7),
sesuaikan plotting. URL tidak berubah; tidak perlu deploy atau push.
Sheet LOG LAPOR boleh dibiarkan (data dipisah per bulan otomatis) atau dipindah ke arsip.

**Pilihan B – salinan spreadsheet per bulan**
1. *File → Buat salinan* spreadsheet (Apps Script ikut tersalin).
2. Di salinan: Extensions → Apps Script → **Terapkan → Deployment baru → Aplikasi web**
   (Jalankan sebagai: Saya; Akses: Siapa saja) → izinkan akses → salin **URL /exec** baru.
3. Ubah `API_URL` di `web/config.js` menjadi URL baru → commit & push (bagian 7).
4. Kosongkan sheet LOG LAPOR di salinan (sisakan baris judul).

Selama spreadsheet bukan untuk bulan berjalan (C7 di PENGATURAN), menu Lapor Saya
menampilkan "Lapor belum dibuka".

## 11. Masalah yang sering terjadi

| Gejala | Penyebab & solusi |
| --- | --- |
| HP masih tampilan lama | Tutup aplikasi sepenuhnya lalu buka lagi / tarik layar untuk refresh. |
| "NRP tidak terdaftar" | NRP belum ada / salah ketik di sheet ANGGOTA. |
| "Kode admin belum diatur" | Atur dulu lewat menu spreadsheet 🚀 CW PAGI APP → 🔐 Atur Kode Admin Aplikasi. |
| "Kode admin salah 5 kali" | Tunggu 15 menit, lalu coba lagi (atau atur kode baru lewat menu). |
| "NRP terdaftar, tetapi nama … tidak ada di plotting" | Kolom A ANGGOTA tidak sama persis dengan kolom B ABSENSI. |
| Selalu "Di luar radius" padahal di titik | Koordinat titik di KOORDINAT kurang akurat → perbaiki, atau perbesar radius di JADWAL. |
| "Izin lokasi ditolak" | Di HP: izinkan akses lokasi untuk situs/aplikasi, lalu Ambil ulang lokasi. |
| Simpan Rekap gagal / API error | Cek deployment Apps Script masih aktif (Terapkan → Kelola deployment). |
| Push tidak tampil di situs | Tab Actions di GitHub: pastikan workflow hijau; file harus di folder `web/`. |

## 12. Uji coba lokal (opsional)

```bash
cd web
python -m http.server 8000
```
Buka http://localhost:8000 (memakai API asli sesuai `config.js`; GPS di browser laptop
tidak akurat, jadi uji lapor sebaiknya di HP).
