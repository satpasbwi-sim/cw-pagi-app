# Laporan CW Pagi – Satlantas Polresta Banyuwangi

Aplikasi web **Laporan Integritas** (bisa dipasang di HP): tab **Lapor CW** untuk Pengaturan Pagi (CW Pagi) dan tab **Ceklok Satpas** untuk absen dinas kantor Satpas. Untuk CW Pagi:
anggota melapor sendiri dengan **NRP**, lokasi **GPS**, dan foto; admin melihat
**Rekap** per simpul dan mengirim teks laporan ke grup WhatsApp.

- Aplikasi: **https://satpasbwi-sim.github.io/integritas-satuan-app/**
- Data: spreadsheet **"CW Pagi Okt'26"** di Google Drive (sekaligus database)
- Kode tampilan: repo GitHub **satpasbwi-sim/integritas-satuan-app** (dulu `cw-pagi-app`) (folder `web/`)
- Kode server: Apps Script di spreadsheet tersebut (file **Kode.gs**)

Aplikasi tidak bergantung pada Claude atau layanan berbayar: semuanya berjalan di
GitHub Pages, Google Apps Script, Google Sheets, dan Google Drive milik satuan.

---

## 1. Cara kerja singkat

```
 HP anggota / admin                 Google (akun satuan)                    GitHub
┌───────────────────┐  JSON   ┌──────────────────────────┐          ┌──────────────────┐
│ Aplikasi web      │ ──────▶ │ Apps Script (Kode.gs)    │          │ Repo integritas- │
│ (folder web/)     │ ◀────── │ = API, cek NRP/jam/GPS   │          │ satuan-app, web/ │
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
| NRP anggota (sheet **ANGGOTA**) | **Lapor CW** | Lapor Datang, Lapor Selesai, atau lapor Tidak Hadir **untuk dirinya sendiri** |
| NRP admin (daftar `ADMIN_NRP` di Kode.gs) **+ kode admin** | **Lapor CW** + **Rekap** | Semua di atas + lihat/ubah status semua personil, catatan, kirim teks WhatsApp |

Tidak ada lagi PIN bersama. NRP yang tidak terdaftar ditolak ("NRP tidak terdaftar").

**Tab yang tampil setelah login** (otomatis dari sheet **Data** spreadsheet Satpas, tidak perlu daftar NRP di kode):

| NRP | Tab |
| --- | --- |
| Anggota Polri Satpas (PANGKAT bukan PHL di sheet Data) | **Lapor CW** + **Ceklok Satpas** |
| PHL Satpas (PANGKAT `PHL`, nomor pendek mis. 23) | **Ceklok Satpas** saja |
| Selain itu (hanya di sheet ANGGOTA) | **Lapor CW** saja |

Menambah/mengurangi anggota Satpas atau PHL cukup di sheet Data (berlaku ±10 menit kemudian).

**Kode admin (pengaman kedua):** NRP admin saja hanya membuka Lapor CW. Untuk membuka
Rekap, admin mengetik **kode admin** di kotak "Admin – buka menu Rekap" di bawah Lapor CW.
- Atur / ganti kode: buka spreadsheet → menu **🚀 CW PAGI APP → 🔐 Atur Kode Admin Aplikasi**
  (minimal 6 karakter). Yang disimpan hanya sidik (hash) kode di *Script Properties*, bukan kodenya.
- Salah 5 kali → kotak admin terkunci 15 menit.
- Lupa kode: atur ulang lewat menu yang sama (perlu akses edit spreadsheet).

## 3. Aturan lapor anggota

| Jam (bawaan) | Yang bisa dilakukan |
| --- | --- |
| sebelum 06.00 | Belum dibuka |
| 06.00 – 06.30 | **Lapor Datang** (langkah 1) – wajib di dalam radius titik |
| 06.30 – 07.15 | Lapor Datang masih bisa, tercatat **TERLAMBAT** (LOG LAPOR: `[TERLAMBAT x mnt …]`) |
| 06.30 – 07.00 | Yang sudah datang: tetap di lokasi, ada hitung mundur |
| 07.00 – 07.15 | **Lapor Selesai** (langkah 2) – wajib di dalam radius titik |
| setelah 07.15 | Ditutup |

- Terlambat tidak ditolak, tetapi mengurangi nilai: **Ketepatan Waktu −2 per menit** sesudah 06.15 (0 sekitar 07.05)
  dan durasi tugas yang pendek menurunkan poin durasi. Kehadiran tetap **H** bila Lapor Selesai sah.
- Status **H** baru masuk ke sheet ABSENSI setelah **Lapor Selesai** yang sah.
  Yang hanya Lapor Datang tidak dihitung (kolom tetap kosong, tercatat di LOG LAPOR).
- Di luar radius (bawaan **100 m**) tombol lapor terkunci dan muncul pemberitahuan merah.
- Titik yang **belum punya koordinat** di sheet KOORDINAT **tidak bisa** Lapor Datang / Selesai (radius tidak bisa dicek):
  aplikasi menampilkan "Koordinat titik belum diisi admin" dan server menolak. Tinggalkan Lokasi dan Tidak Hadir tetap bisa.
  Lokasi plotting baru otomatis masuk KOORDINAT dengan kolom B kosong, jadi isi koordinatnya sebelum dipakai;
  🩺 Cek & Perbaiki menampilkan titik yang belum berkoordinat. Selama `UJI_COBA = true` belum ditolak.
- **Tidak hadir** (Sakit/Izin/…) bisa dilaporkan 06.00–07.15 tanpa cek lokasi.
- Foto **wajib** untuk Lapor Datang dan Lapor Selesai, diambil **langsung dari kamera aplikasi**
  (tidak bisa dari galeri). Foto diberi watermark **nama petugas** dan **tanggal & jam server**
  (berjalan detik demi detik, tidak ikut jam HP). Lokasi simpul dan koordinat tidak dicetak di foto,
  tetapi tetap tercatat di LOG LAPOR. Foto lebih dari 10 menit ditolak. Disimpan di Google Drive folder **"CW Pagi - Foto Lapor"**.
- **Deteksi fake GPS.** Laporan ditandai ⚠️ (kolom PERINGATAN di LOG LAPOR) bila: akurasi ≤ 1 m,
  koordinat sama persis dengan titik di KOORDINAT, atau sama persis dengan laporan lain (hari lain,
  Datang = Selesai, atau personil lain) dengan akurasi ≤ 20 m. Laporan bertanda ⚠️ **tidak dihitung
  hadir**: ABSENSI diisi **N (Nihil)**, sehingga LAPORAN HARIAN ikut Nihil, dan alasannya ditulis di
  sheet CATATAN. Anggota melihat "menunggu verifikasi admin". Keputusannya di kolom **VERIFIKASI** LOG LAPOR
  (lihat *Verifikasi ⚠️ semi-otomatis*); bila ASLI, ABSENSI otomatis berubah N → H.
- Jam dan radius dicek di server, memakai jam server (tidak bisa diakali jam HP).

## 4. Pengoperasian harian (cukup di spreadsheet, tanpa push)

| Ingin mengubah | Caranya |
| --- | --- |
| Jam lapor / radius | Sheet **JADWAL**, kolom B (mis. `06:45`, radius `150`). Berlaku langsung. |
| Anggota & NRP | Sheet **ANGGOTA**: kolom A = nama **persis** seperti kolom B (PETUGAS) di ABSENSI, kolom B = NRP. |
| Koordinat titik | Sheet **KOORDINAT**: kolom A = nama lokasi (sama dengan ABSENSI), kolom B = `lat, lng` dari Google Maps (tekan lama titik → salin angka). **Wajib diisi**: titik tanpa koordinat tidak bisa lapor. |
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
Upload files* → **pastikan jalurnya `integritas-satuan-app / web /`** → Commit changes.

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
- Menu **🚀 CW PAGI APP** ada di file **MenuAplikasi.gs** (`onOpen`): 📱 Buka Aplikasi & QR Code, 🩺 Cek & Perbaiki,
  📅 Ganti Bulan, 📆 Jadwal Piket BM, 🔐 Atur Kode Admin, 📊 Hitung Durasi & Poin. File lama **AutoDeploy.gs**
  (Auto-Deploy 1-Klik ke repo terpisah, QR ke URL API) sudah dibuang (21 Okt 2026); aplikasi di-publish dari repo ini.
  Hanya boleh ada satu `doGet`/`doPost`, yaitu API di Kode.gs.
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
Tinggalkan lokasi**, memilih **jenis tugas / kepentingan** (Perintah pimpinan · Pelayanan · Rapat/Dinas ·
Keluarga · Lainnya) dan mengisi **keterangan singkat**. Tanpa foto, tanpa cek radius, dan Lapor Selesai tidak
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

## Nilai Tinggalkan Lokasi / Kantor per jenis (`NILAI_TUGAS_MENDADAK`, Code.gs)

Berlaku setelah atasan memilih SETUJU di sheet PERSETUJUAN (sebelum itu aturan "belum disetujui" tetap berlaku).

| Jenis | Nilai | CW Pagi | Ceklok Satpas |
| --- | --- | --- | --- |
| Perintah pimpinan | 100 | Kelengkapan hari itu 100 | Ceklok hari itu 100 |
| Pelayanan | 100 | 100 | 100 |
| Rapat/Dinas | 100 | 100 | 100 |
| Keluarga | 40 | 40 | 40 |
| Lainnya | 30 | 30 | 30 |

- Hanya nilai 100 yang bisa menjadi **hari sempurna**. Keluarga / Lainnya ditulis di CATATAN penilaian.
- Jenis lama (Laka lantas, Pengawalan/Patwal, Kejadian darurat, Rapat/dinas luar) dari data / aplikasi lama tetap dinilai 100.
- Mengubah angka cukup di `NILAI_TUGAS_MENDADAK`, lalu deploy versi baru.

## Ceklok Satpas (absen dinas kantor)

Anggota Satpas (NRP ada di sheet **Data** spreadsheet Satpas) melihat tab **Ceklok Satpas** di aplikasi. Anggota
Satpas yang tidak ada di plotting CW Pagi tetap bisa masuk dengan NRP dan langsung diarahkan ke tab ini.
- **Ceklok Masuk** dibuka pukul **07.00**. Lewat jam masuk (**08.00**) tercatat **terlambat** (menit).
- **Ceklok Pulang** bisa setelah Masuk. Sebelum jam pulang tercatat **pulang cepat**.
  Jam pulang **13.00** (Senin–Kamis) dan **12.00** (Jumat–Sabtu). Hari Minggu libur.
- **Lembur:** Ceklok Pulang masih bisa sampai **21.00** (`CEKLOK.tutupLembur`; ceklok lain tetap ditutup 15.00).
  Pulang ≥ **30 menit** setelah jam pulang (`LEMBUR_MIN`) = lembur: aplikasi meminta **alasan lembur (wajib)**,
  tercatat di LOG CEKLOK kolom CATATAN (`LEMBUR 3 j 40 m: alasan`). Lembur **dicatat saja**: nilai Ceklok hari itu
  tetap 100 (lengkap), tidak menambah skor. Jumlah & total jam lembur tampil di CATATAN PENILAIAN INTEGRITAS dan di
  INTEGRITAS HARIAN (kolom Ceklok Pulang). Anggota yang masih di kantor saat hitungan sore ±15.15 belum dinilai
  ("belum pulang – lembur?"), lalu dinilai final oleh hitungan pagi berikutnya. Lewat 21.00 tanpa Ceklok Pulang =
  tanpa pulang (nilai 50).
- Wajib dalam radius **100 m** dari titik kantor (-8.239257, 114.345514) dan foto langsung dari kamera.
  Deteksi lokasi palsu sama dengan Lapor CW Pagi.
- **Tidak masuk hari ini?** Pilih Sakit / Izin / Cuti / Dinas / Pelayanan dan isi keterangan. Setelah disetujui atasan: Sakit, Dinas,
  Pelayanan bernilai 90, Izin / Cuti 80 (sedikit di bawah hadir, `NILAI_IZIN` di Kode.gs).
- **Tugas mendadak setelah Ceklok Masuk?** Ketuk **🚨 Ada Tugas/Kepentingan? Tinggalkan Kantor**, pilih jenis
  (Perintah pimpinan, Pelayanan, Rapat/Dinas, Keluarga, Lainnya) dan isi keterangan. Tanpa foto dan
  radius, lokasi terakhir tetap dicatat. Ceklok hari itu **selesai** (status KELUAR di LOG CEKLOK), Ceklok Pulang
  tidak diperlukan, dan hari itu dihitung **lengkap**. Bila atasan mengisi **PALSU** di kolom VERIFIKASI baris
  KELUAR, hari itu dihitung **pulang cepat**. Lebih dari 3× sebulan ditulis di CATATAN penilaian.
- Sinyal putus: ceklok tersimpan di HP dan terkirim otomatis, sama seperti Lapor.
- **Masa uji coba (`UJI_COBA = true`): bisa diulang.** Setelah Lapor CW atau Ceklok Satpas selesai, muncul tombol
  **🔁 Ulangi (uji coba)** untuk mencoba lagi dari awal di hari yang sama. Semua putaran tetap tercatat di LOG
  LAPOR / LOG CEKLOK; aplikasi dan penilaian memakai **putaran terakhir**. Tombol hilang otomatis saat `UJI_COBA = false`.
- Data di spreadsheet Satpas:
  - **LOG CEKLOK**: riwayat ceklok. Kolom **VERIFIKASI** diisi admin (`ASLI` / `PALSU`) untuk baris bertanda ⚠️.
  - **LIBUR SATPAS**: isi tanggal libur nasional / cuti bersama. Hari itu ceklok tidak wajib.
- Jam, radius, dan titik kantor diubah di `CEKLOK` dan `JAM_SATPAS` (Kode.gs). Selama `UJI_COBA = true`, jam,
  hari libur, radius, dan foto belum diwajibkan.

## Penilaian integritas anggota Satpas

Sheet **PENILAIAN INTEGRITAS** di spreadsheet **Data Satpas** (`SATPAS_SS_ID` di Kode.gs) ditulis ulang
otomatis setiap kali `hitungDurasiPoin` berjalan (pemicu ±07.30) dan **sore ±15.15** setelah ceklok ditutup
(pemicu `hitungIntegritasSore`, pasang sekali dengan fungsi `pasangPemicuIntegritasSore`). Bisa juga dijalankan
kapan saja lewat menu **🖨️ REKAP CETAK → Integritas – Hitung sekarang**.
- Anggota diambil dari sheet **Data** (PETUGAS, JABATAN, PANGKAT, NRP, POKJA). Kolom dicari lewat **judul** (`barisDataSatpas_`),
  jadi boleh disisipkan / digeser; PHL = JABATAN atau PANGKAT `PHL`. Pencocokan dengan CW Pagi lewat **NRP**
  (sheet ANGGOTA), dan dengan LOG CEKLOK juga lewat NRP.
- **Skor 0–100** (`BOBOT_INTEGRITAS`):

  | Unsur | Bobot | Cara hitung |
  | --- | --- | --- |
  | Kehadiran CW | 25% | hari H ÷ hari wajib di ABSENSI; S (sakit), D (dinas), P (pelayanan) disetujui = 0,9 hari, I (izin) = 0,8 hari (`NILAI_IZIN`); LD (lepas dinas piket) dan `-` tidak dinilai |
  | Ceklok Satpas | 25% | rata-rata per hari kerja: lengkap 100 · tugas / kepentingan disetujui menurut jenisnya (tabel di bawah) · pulang cepat ≤ 15 mnt 90 · 16–60 mnt 70 · > 60 mnt 50 (`NILAI_PULANG_CEPAT`) · tanpa Ceklok Pulang 50 · tidak ceklok 0 · sakit / dinas / pelayanan disetujui 90 · izin / cuti disetujui 80 |
  | Kejujuran lokasi & foto | 20% | 100 − 25 per ⚠️ terbukti (`POTONG_PALSU`), lalu dipotong lagi per CEK FOTO atasan (lihat **Bukti foto** di bawah) |
  | Ketepatan waktu | 10% | Lapor Datang ≤ 06.15 dan Ceklok Masuk ≤ 08.00 = 100, lalu −2 per menit (`BATAS_AMAN_CW`, `POTONG_PER_MENIT`) |
  | Kelengkapan lapor CW | 10% | hari Datang + Selesai (atau tugas / kepentingan, bernilai menurut jenisnya) ÷ hari Lapor Datang |
  | Durasi tugas (CW + Satpas) | 10% | rata-rata dua nilai: CW = poin harian ÷ poin Baik; Satpas = jam efektif Masuk–Pulang yang berada di dalam jam dinas ÷ jam dinas (mis. 08.00–11.30 dari 08.00–13.00 = 70). Tinggalkan Kantor dan hari tanpa Ceklok Pulang tidak dihitung di sini. Hanya punya satu data = nilai itu saja |

- **Verifikasi ⚠️ semi-otomatis** (file **Verifikasi.gs**, jalan otomatis di pemicu harian ±07.30, juga bisa
  dijalankan manual: fungsi `verifikasiOtomatis`). Kolom **VERIFIKASI (ASLI / PALSU)** ada di LOG LAPOR dan LOG CEKLOK.
  - **Bukti kuat → langsung PALSU otomatis:** akurasi ±0–1 m, koordinat sama persis dengan titik plotting / kantor,
    atau sama persis dengan laporan/ceklok **orang lain**.
  - **Bukti lemah** (sama persis dengan laporan/ceklok **dirinya sendiri**, mis. lokasi Wi-Fi yang berulang): menunggu
    atasan **1 hari** (`VERIFIKASI_HARI`), yaitu sampai hitungan pagi berikutnya. Bila belum diisi →
    **ASLI** (`LEMAH_TANPA_VERIFIKASI` di Verifikasi.gs; ganti ke `'PALSU'` bila ingin lebih ketat).
  - Keputusan otomatis diberi catatan (segitiga kecil di sel). **Isian atasan tidak pernah ditimpa**; atasan boleh
    mengubah keputusan otomatis kapan saja, skor ikut diperbaiki di hitungan berikutnya.
  - CW Pagi: ASLI → ABSENSI **N → H** (bila Lapor Selesai / Tinggalkan Lokasi ada) dan dicatat di CATATAN; PALSU
    setelah sempat H → kembali **N**. Cara lama (admin mengganti N → H di ABSENSI) tetap dianggap ASLI.
  - Yang **ASLI** tidak dipotong dan poin durasinya dihitung normal. Yang **PALSU** dipotong 25 dan hari itu bernilai 0.
- **Tinggalkan Lokasi** lebih dari 3× sebulan ditulis di CATATAN untuk dicek atasan (tidak mengurangi skor).
- **Bukti foto (wajah, seragam, foto asli)**:
  - Sheet **JADWAL SERAGAM** (spreadsheet CW Pagi): isi seragam per hari (Senin … Minggu, mis. PDH / PDL / Gampol).
    Tanggal khusus (dd/MM/yyyy) di baris bawah mengalahkan hari. Seragam tidak lagi ditampilkan di layar kamera
    (dihapus 22 Okt 2026); jadwal ini tetap jadi acuan atasan saat mengisi CEK FOTO.
  - Kamera **hanya kamera depan** (kamera belakang tidak bisa dipilih; HP tanpa kamera depan tidak bisa memotret).
  - Saat mengambil foto, aplikasi menampilkan daftar cek: wajah terlihat jelas dan ambil langsung di lokasi (bukan memotret layar HP / foto lain). Foto Lapor Selesai
    (arus lalu lintas) hanya diingatkan soal lokasi.
  - Kolom **N "CEK FOTO (atasan)"** di LOG LAPOR dan LOG CEKLOK diisi atasan dengan buka tautan FOTO:
    `SESUAI` (tidak dipotong) · `WAJAH TIDAK JELAS` −10 · `SERAGAM TIDAK SESUAI` −10 · `FOTO LAYAR / FOTO LAMA` −25
    (`CEK_FOTO` di Kode.gs). Kosong = tidak dipotong. Tidak perlu memeriksa semua foto; cukup acak / yang mencurigakan.
  - Potongan masuk unsur Kejujuran lokasi & foto, jenis dan jumlahnya ditulis di CATATAN.
  - Foto Lapor CW **dan foto Ceklok Satpas** dipindah ke Sampah otomatis setelah 3 hari (`FOTO_SIMPAN_HARI`,
    `hapusFotoLama` ±08.00), jadi periksa dalam 3 hari. Foto laporan / ceklok bertanda ⚠️ dan yang dinilai selain
    `SESUAI` tetap disimpan sebagai bukti; kolom FOTO di LOG ditandai "foto dihapus <tanggal>".
  - Pasang sekali: jalankan `siapkanBuktiFoto` (membuat sheet JADWAL SERAGAM dan kolom CEK FOTO).
- **Periode:** PENILAIAN INTEGRITAS = akumulasi **bulan berjalan** (dari tanggal 1 / `TGL_MULAI_INTEGRITAS` s.d. hari terakhir
  yang sudah ditutup), dihitung ulang tiap pagi.
- **Penilaian mingguan** (file **IntegritasMingguan.gs**, rumus sama, periode Senin–Minggu):
  - Sheet **INTEGRITAS MINGGUAN**: minggu yang memuat hari kemarin, ditulis ulang tiap pemicu ±07.30
    (Selasa–Minggu = minggu berjalan; Senin pagi = nilai final minggu lalu).
  - Sheet **RIWAYAT INTEGRITAS MINGGUAN**: nilai final tiap minggu disimpan otomatis setiap Senin pagi
    (1 baris per anggota per minggu; minggu yang sama dihitung ulang = barisnya diganti).
  - Menu **🖨️ REKAP CETAK → Integritas – Mingguan (pilih minggu)**: hitung minggu tertentu; minggu yang sudah lewat
    ikut disimpan ke RIWAYAT.
  - Minggu yang melewati pergantian bulan hanya menilai hari di bulan ABSENSI (tertulis di baris keterangan).
  - Selama uji coba sheet ini kosong ("belum ada hari yang dinilai") kecuali antara hitungan sore ±15.15 dan reset
    ±19.00, karena data tiap hari dihapus. Terisi penuh setelah `UJI_COBA = false`.
- **Integritas harian** (file **IntegritasHarian.gs**, sheet **INTEGRITAS HARIAN**): satu hari, ringkas & berwarna.
  Baris ringkasan (hadir CW, ceklok masuk, terlambat, tidak ceklok, lokasi/foto, rata-rata skor, predikat), lalu
  per anggota: jam CW Datang–Selesai, Ceklok Masuk/Pulang (telat / pulang cepat), lokasi & foto, skor hari itu, predikat.
  Hijau = sesuai · kuning = perlu perhatian · merah = pelanggaran · abu-abu = tidak wajib / libur / izin.
  - Ditulis ulang ±07.30 (kemarin) dan ±15.15 (hari ini). Masa uji coba: hari yang sudah di-reset tidak ditimpa,
    jadi hasil hitungan sore tetap terlihat sampai sore berikutnya.
  - Menu **🖨️ REKAP CETAK → Integritas – Harian (pilih tanggal)** untuk tanggal tertentu.
- Predikat: **≥ 90 Sangat Baik · ≥ 80 Baik · ≥ 70 Cukup · < 70 Kurang**, lengkap dengan peringkat dan catatan.
- **Pengunci predikat (gatekeeper):** anggota dengan **TERBUKTI ⚠️ PALSU ≥ 1** dalam periode itu paling tinggi mendapat
  predikat **Cukup** (`PREDIKAT_MAKS_PALSU`), walaupun skornya ≥ 80. Skor angka tetap apa adanya, CATATAN menulis
  "predikat dikunci …", dan peringkatnya diletakkan di bawah semua anggota yang bersih. Berlaku juga di penilaian mingguan.
- Hari ini baru dinilai setelah lapor ditutup (CW 07.15, ceklok 15.00): hitungan sore ±15.15 sudah memuat hari ini
  (kecuali yang belum Ceklok Pulang karena mungkin lembur s.d. 21.00: dinilai hitungan pagi berikutnya). Unsur yang belum ada datanya tidak
  dihitung, dan bobot unsur lain disesuaikan.
- **Masa uji coba:** `TGL_MULAI_INTEGRITAS = '2026-10-19'` (penilaian uji coba mulai 19 Oktober 2026). Ganti ke
  `'2026-11-01'` sebelum penilaian resmi agar data uji coba tidak ikut dinilai. Selama uji coba, data dihapus tiap
  ±19.00 WIB (lihat **Reset data uji coba**), jadi penilaian hanya memuat input sesudah reset terakhir.
- Akun pemilik Apps Script harus punya akses **edit** ke spreadsheet Data Satpas. Saat pertama dijalankan,
  Google meminta izin.

## Penilaian personel CW Pagi (sheet PENILAIAN CW)

File **PenilaianCw.gs** (salinan di `apps-script/`) menulis sheet **PENILAIAN CW** di spreadsheet CW Pagi: indikator
penilaian **semua personel CW Pagi** (baris ABSENSI + yang lapor lewat jadwal Piket BM / Patwal / Laka), bukan hanya
anggota Satpas. Ditulis ulang otomatis di hitungan pagi (±07.30) dan sore (±15.15), atau lewat menu
**🖨️ REKAP CETAK → Integritas – Hitung sekarang**. Bisa juga dijalankan langsung: fungsi `hitungPenilaianCw`.

| Unsur | Bobot (`BOBOT_CW`) | Cara hitung |
| --- | --- | --- |
| Kehadiran | 35% | hari H ÷ hari wajib di ABSENSI; S, D, P disetujui = 0,9 hari, I = 0,8 hari; LD dan `-` tidak dinilai |
| Kejujuran lokasi & foto | 25% | 100 − 25 per ⚠️ PALSU, dikurangi CEK FOTO atasan |
| Ketepatan waktu | 15% | Lapor Datang ≤ 15 menit setelah buka = 100, lalu −2 per menit |
| Kelengkapan lapor | 15% | hari Datang + Selesai (atau Tinggalkan Lokasi, bernilai menurut jenisnya) ÷ hari lapor |
| Durasi tugas | 10% | rata-rata poin harian ÷ poin Baik |

- Predikat dan pengunci ⚠️ PALSU sama dengan PENILAIAN INTEGRITAS; peringkat yang terkunci di bawah yang bersih.
- Periode sama dengan PENILAIAN INTEGRITAS (bulan ABSENSI, mulai `TGL_MULAI_INTEGRITAS`).

## Nilai Saya (tab di aplikasi)

Setiap anggota bisa melihat **nilainya sendiri** di tab **Nilai Saya**: pilihan **Harian · Mingguan · Bulanan**, skor 0–100
dalam lingkaran berwarna, predikat, **peringkat** (mis. "Peringkat 3 dari 24"), rincian tiap unsur (batang), daftar
"Perlu diperhatikan" dari CATATAN penilaian, dan kalimat penyemangat sesuai predikat. Tujuannya memotivasi anggota.
- Anggota Satpas memakai PENILAIAN INTEGRITAS (6 unsur); personel CW Pagi lain memakai PENILAIAN CW (5 unsur).
- File **NilaiAplikasi.gs**: setiap kali penilaian dihitung (pagi ±07.30, sore ±15.15, menu Hitung sekarang), hasil
  ringkas disimpan di sheet tersembunyi **NILAI APLIKASI** (spreadsheet CW Pagi), satu baris per orang per periode.
  Nilai harian & mingguan personel CW dihitung lewat `hitungPenilaianCw({dari, sampai, tanpaTulis})`.
- Aplikasi meminta `GET ?action=nilai`; server hanya mengirim nilai milik NRP yang login.
- Agar cepat: nilai terakhir disimpan di HP (`cw_nilai_d`) dan langsung tampil; diambil ulang dari server di latar
  belakang setelah aplikasi dibuka, lalu paling sering tiap 10 menit (`NILAI_SEGAR_MS`) atau saat tab diketuk lagi /
  ⟳ Muat ulang. Pindah tab Lapor CW · Ceklok Satpas · Nilai Saya tidak lagi menunggu data server selesai dimuat.
- Nilai hari ini muncul setelah hitungan sore dengan tanda **sementara**, final setelah hitungan pagi berikutnya.
- Pilihan **Mingguan** dan **Bulanan** baru muncul setelah rekapnya **final**: mingguan = minggu yang sudah selesai
  (Senin pagi sesudahnya), bulanan = bulan yang sudah selesai. Di sheet tersimpan sebagai jenis `mingguan_final` /
  `bulanan_final`; yang masih berjalan (`mingguan`, `bulanan`) tidak ditampilkan.
- Nilai harian juga memuat jam hari itu (CW Datang–Selesai, Ceklok Masuk/Pulang) berwarna seperti INTEGRITAS HARIAN.
- Menu untuk tanggal / minggu lama tidak mengubah nilai yang dilihat anggota (hanya periode yang sama atau lebih baru
  yang menimpa); perhitungan tanpa hari dinilai (mis. sesudah reset uji coba) juga tidak menimpa.
- Catatan teknis ("skor dari unsur yang ada datanya saja", dll.) tidak ditampilkan ke anggota.

## Aturan khusus per NRP (AturanKhusus.gs)

| Daftar | NRP | Aturan |
| --- | --- | --- |
| `NRP_PENGAWAS` | 86071494 (Baur SIM) | Tidak wajib CW Pagi & Ceklok, **tidak dinilai** dan tidak masuk peringkat, tidak tercetak di rekap ceklok, tidak dianggap "tanpa plotting" di 🩺. Di aplikasi hanya tab **Rekap Integritas**. |
| `CEKLOK_KHUSUS` | 83050535 (operator SIM keliling) | Ceklok dibuka **06.00**, jam masuk **06.00**, jam pulang **17.00** (Senin–Sabtu), lembur sesudah 17.30 s.d. 21.00, **boleh ceklok di mana saja** (GPS, peta, foto tetap wajib & dicatat). |

**Tab Rekap Integritas (pengawas):** pilihan Harian (selalu) · Mingguan · Bulanan (setelah final), hanya kelompok
**Anggota Satpas** (Personel CW Pagi tidak ditampilkan). Isinya: rata-rata skor, sebaran predikat, kotak cari nama, daftar urut peringkat
(skor, predikat, pokja/lokasi, dan untuk harian jam CW / Ceklok Masuk / Pulang berwarna). Ketuk nama = rincian unsur dan
catatan. Anggota Satpas dipisah **Polri · PHL · Semua** (sub-tab), masing-masing dengan rata-rata, sebaran, dan peringkat
sendiri; di Semua, PHL diberi lencana. Angka aturan nilai seperti "(nilai 90)" atau "(−10 per kali)" tidak ditampilkan di
rekap ini (Harian, Mingguan, Bulanan); di sheet tetap tertulis. Anggota dengan ⚠️ PALSU diberi tanda merah **"⚠️ PALSU –
diurutkan di bawah"** (dan catatan yang sama di sheet), agar jelas kenapa peringkatnya di bawah anggota bernilai lebih rendah. Server: `GET ?action=rekap` hanya untuk pengawas dan admin (tiap baris membawa tanda `phl`). Menambah pengawas / jadwal khusus cukup mengubah
daftar di AturanKhusus.gs, simpan, lalu deploy versi baru.

**Rekap harian berkala** (`rekapHarianBerkala`, IntegritasHarian.gs): hari ini dihitung ulang otomatis ±09.00, ±11.00,
±13.00 (label *update pukul …*, tanda sementara) dan ±15.30 (label *final pukul …*, sesudah ceklok ditutup). Pada update,
ceklok hari ini ikut dinilai: belum Ceklok Masuk = **Belum ceklok masuk**, sudah masuk tetapi belum pulang = **Belum ceklok
pulang** (belum dinilai). Pemicu dipasang dengan `pasangPemicuRekapBerkala` (diperiksa juga oleh 🩺 Cek & Perbaiki).

**Sheet Data Satpas:** 🩺 Cek & Perbaiki memeriksa anggota tanpa NRP / nomor; PHL tanpa nomor diberi tombol
**Beri nomor PHL** (nomor PHL terbesar + 1, fungsi `beriNomorPhl`). Perubahan nama/pokja di sheet Data terbaca
otomatis paling lambat 10 menit (cache).

## Penentu urutan & TELADAN (Urutan.gs)

Skor tetap maksimal 100. Bila skor sama (mis. banyak yang 100), peringkat diurutkan berturut-turut oleh:

| Urutan | Penentu | Keterangan |
| --- | --- | --- |
| 1 | Hari sempurna | Jumlah hari yang semua kewajibannya penuh: CW (H, Datang ≤ 06.15, lengkap, durasi ≥ Baik, tanpa ⚠️/foto bermasalah) dan Ceklok (masuk ≤ jam masuk, pulang ≥ jam pulang atau tugas mendadak sah) |
| 2 | Beruntun | Hari sempurna berturut-turut terpanjang; hari izin / libur / tidak terjadwal dilewati, tidak memutus |
| 3 | Lebih awal | Rata-rata menit sebelum batas (Lapor Datang 06.15, Ceklok Masuk jam masuk), maks 30 mnt per kejadian |
| 4 | Lembur | Total menit lembur Satpas (beralasan) |

Semua sama = peringkat sama. **★ TELADAN** = skor 100, tanpa ⚠️ PALSU, minimal 5 hari dinilai dan semuanya sempurna
(praktisnya mingguan / bulanan). Di sheet PENILAIAN INTEGRITAS / PENILAIAN CW tercatat di kolom CATATAN
(`★ TELADAN…`, `urutan: …`); di aplikasi tampil sebagai lencana ★ Teladan dan bagian **Konsistensi** (Nilai Saya, Rekap
Integritas). Nilai Saya juga menampilkan berapa orang yang sama-sama bernilai 100.

## Di luar radius setelah lapor / ceklok (LuarRadius.gs)

Setelah **Lapor Datang** (sampai Lapor Selesai / Tinggalkan Lokasi) dan setelah **Ceklok Masuk** (sampai Ceklok Pulang /
Tinggalkan Kantor), aplikasi memantau GPS selama terbuka. Tanda merah "di luar radius" yang tampil **terus-menerus
lebih dari 5 menit** = 1 kejadian: dikirim ke server (disimpan di HP dulu bila sinyal putus) dan dicatat di sheet
**LUAR RADIUS** (spreadsheet CW Pagi: waktu, NRP, nama, CW/CEKLOK, mulai, durasi, jarak maks, akurasi, peta).

- Penilaian: **−10 per kejadian** dari unsur Kejujuran lokasi & foto, catatan "N× di luar radius > 5 menit…", dan hari
  itu bukan hari sempurna. Berlaku di masa uji coba maupun resmi.
- Hitungan mulai dari nol bila kembali ke dalam radius, GPS tidak segar (> 2 menit), atau aplikasi ditutup /
  disembunyikan. Ceklok khusus tanpa radius (SIM keliling) tidak dipantau.
- Kejadian keliru (GPS melenceng): hapus barisnya di sheet LUAR RADIUS, nilai pulih di hitungan berikutnya.
- Konstanta: `LUAR_RADIUS_MENIT = 5`, `POTONG_LUAR_RADIUS = 10` (LuarRadius.gs); POST `action=luarRadius`.

## Pencegahan kecurangan (Perangkat.gs, Persetujuan.gs)

**Satu NRP = satu HP.** Aplikasi membuat ID acak per HP (`cw_hp` di penyimpanan browser) dan mengirimnya di setiap
permintaan. Login pertama mendaftarkan HP itu di sheet **PERANGKAT** (spreadsheet CW Pagi); HP lain dengan NRP yang sama
ditolak dan tercatat di kolom HP BARU MENUNGGU (juga muncul di 🩺 Cek & Perbaiki). Ganti HP / data browser terhapus:
operator mengetik **YA** di kolom IZINKAN HP BARU (atau mengosongkan ID HP) → login berikutnya dari HP baru terdaftar.
Pengawas dan admin yang masuk dengan kode admin tidak diikat. Aplikasi versi lama (tanpa ID HP) diminta diperbarui.

**Izin dan tugas mendadak perlu persetujuan atasan.** Setiap "Tidak bisa hadir / Tidak masuk" dan "Tinggalkan Lokasi /
Kantor" dari aplikasi tercatat di sheet **PERSETUJUAN**; atasan memilih KEPUTUSAN = SETUJU / TOLAK (dropdown). Selama
belum SETUJU: tidak hadir CW dihitung tidak hadir, tidak masuk Satpas dihitung tidak ceklok (0), tugas mendadak CW
dihitung tanpa Lapor Selesai, tugas mendadak Satpas dihitung pulang cepat (bertingkat menurut menit sebelum jam pulang), dan hari itu bukan hari sempurna. Status
yang diisi admin langsung di ABSENSI tidak perlu persetujuan. Jumlah yang menunggu tampil di 🩺 Cek & Perbaiki; di
aplikasi kartu hasilnya bertanda "⏳ menunggu persetujuan atasan".

**Foto wajah di Lapor Selesai.** Lapor Selesai kini juga meminta wajah pelapor dengan arus lalu lintas sebagai latar
(sebelumnya hanya foto arus), agar HP tidak bisa ditinggal / dititipkan di titik.

## Rekapitulasi nilai

File **Rekapitulasi.gs** (salinan di `apps-script/`):
- Di bawah tabel **PENILAIAN INTEGRITAS**, **INTEGRITAS MINGGUAN**, dan **PENILAIAN CW** ada blok **REKAPITULASI**
  (ditulis ulang bersama tabelnya): sebaran predikat (jumlah & %), rata-rata skor dan tiap unsur, pelanggaran
  (⚠️ PALSU, predikat dikunci), 3 skor tertinggi, dan 3 skor terendah (perlu pembinaan).
- Sheet **RIWAYAT REKAP MINGGUAN** (spreadsheet Satpas): 1 baris per minggu yang selesai (rata-rata skor, jumlah per
  predikat, rata-rata unsur, PALSU, dikunci), disimpan bersamaan dengan RIWAYAT INTEGRITAS MINGGUAN setiap Senin pagi
  atau lewat menu Integritas – Mingguan (pilih minggu yang sudah lewat). Untuk melihat tren antar minggu.
- Cetak: menu **🖨️ REKAP CETAK → Integritas – Cetak Mingguan / Bulanan (PDF)** (lihat tabel di bawah).

## Rekap cetak untuk pimpinan (kertas Legal)

File **RekapCetak.gs** (salinan di `apps-script/`) menambah menu **🖨️ REKAP CETAK** di spreadsheet CW Pagi.
Pasang sekali: tempel sebagai file baru di Apps Script → jalankan fungsi `pasangMenuRekap` → buka ulang spreadsheet.

| Menu | Hasil |
| --- | --- |
| CW Pagi – Mingguan / Bulanan | sheet **CETAK REKAP CW**: per personil per tanggal (H/S/I/D/P/LD/N/BL), jumlah, % hadir, keterangan (alasan, catatan, nama pelapor pos jaga) |
| Ceklok Satpas – Mingguan / Bulanan | sheet **CETAK REKAP CEKLOK** (spreadsheet Satpas): Polri & PHL, H/T/PC/TP/TG/TK/S/I/C/D/P, jumlah, % hadir, keterangan |
| Rapikan tabel spreadsheet Satpas | format ulang Data, LIBUR SATPAS, LOG CEKLOK, PENILAIAN INTEGRITAS |
| Integritas – Cetak Mingguan / Bulanan (PDF) | sheet **CETAK INTEGRITAS** (spreadsheet Satpas): nilai per anggota (6 unsur, skor, predikat, peringkat, keterangan) urut peringkat, baris rata-rata satuan, sebaran predikat, keterangan bobot; PDF Legal mendatar |

- Mingguan = Senin s.d. Minggu; aplikasi menanyakan satu tanggal di minggu itu (kosong = minggu ini).
- Setiap rekap juga disimpan sebagai **PDF Legal mendatar** di Drive folder **Rekap Cetak CW & Satpas**; tautannya muncul.
- Yang tercetak: judul, ringkasan, tabel, dan legenda kode (tanpa kop surat, garis kop, dan tanda tangan). Kepala tabel diulang di tiap halaman.
- Rekap CW memakai sheet ABSENSI, jadi hanya bulan di PENGATURAN; minggu yang melewati pergantian bulan tampil abu-abu di tanggal bulan lain.
- Rekap Ceklok tidak menghitung hari sebelum `TGL_MULAI_INTEGRITAS`.

## Reset data uji coba (setiap hari ±19.00 WIB)

Pemicu `resetUjiCoba` memasang ulang dirinya sendiri bila jamnya belum sesuai `RESET_UJI_COBA_JAM` (Script Property
`RESET_UJI_COBA_PEMICU_JAM`), jadi mengubah jam reset cukup mengganti konstanta itu.

File **ResetUjiCoba.gs** (salinan di `apps-script/`). Selama `UJI_COBA = true`, setiap hari antara **19.00 dan 19.30 WIB**
semua input dari aplikasi (login NRP) mulai `TGL_MULAI_INTEGRITAS` (19 Oktober 2026) s.d. hari ini dihapus, jadi
spreadsheet kosong lagi untuk uji coba berikutnya:

| Spreadsheet | Yang dihapus |
| --- | --- |
| CW Pagi | baris **LOG LAPOR**; kode di **ABSENSI** dari laporan itu, serta H / N lain di tanggal tersebut; isian **CATATAN** nomor plotting yang lapor hari itu |
| Data Satpas | baris **LOG CEKLOK** |

- Sesudahnya DURASI POIN, REKAP POIN, PENILAIAN INTEGRITAS, PENILAIAN CW, dan INTEGRITAS MINGGUAN dihitung ulang (jadi kosong).
  Hari Senin hanya penilaian yang dihitung ulang, agar RIWAYAT mingguan yang disimpan pagi tidak ditimpa kosong.
- **Hari yang sudah di-reset tidak dinilai.** Tanggal reset disimpan di *Script Properties* (`RESET_UJI_COBA_TERAKHIR`), dan
  penilaian baru menghitung mulai hari sesudahnya (`tglMulaiNilai_` di Code.gs). Jadi sesudah reset sheet penilaian bertuliskan
  "belum ada hari yang dinilai", bukan "tidak lapor / tidak ceklok". Hitungan sore ±15.15 masih memuat hasil uji coba hari itu.
  Reset manual sebelum 19.00 hanya menandai kemarin, sehingga input sesudah reset hari itu tetap dinilai.
  Aturan ini mati sendiri saat `UJI_COBA = false`.
- **Tidak** disentuh: kode ABSENSI lain yang diisi admin (LD, S, I, D, P, `-`) dan bukan dari laporan aplikasi, plotting,
  ANGGOTA, KOORDINAT, JADWAL, sheet Data / LIBUR SATPAS. Foto di Drive ikut terhapus oleh `hapusFotoLama` setelah 3 hari.
- Input sesudah 19.00 tetap tersimpan sampai reset hari berikutnya.
- Reset manual kapan saja: menu **🖨️ REKAP CETAK → Uji coba – Reset data sekarang** (ada konfirmasi).
- Pasang sekali: tempel sebagai file baru di Apps Script → jalankan `pasangPemicuResetUjiCoba`. Untuk menu, tempel juga
  **RekapCetak.gs** versi terbaru.
- Berhenti sendiri saat `UJI_COBA = false`. Pemicunya boleh dihapus sesudah itu (Apps Script → Pemicu).
- Data yang terhapus tidak bisa dikembalikan dari aplikasi; bila perlu, pakai *File → Histori versi* spreadsheet.

## Notifikasi gangguan (email ke operator)

File **Notifikasi.gs** (salinan di `apps-script/`) mengirim email ke operator bila ada yang bermasalah.
Email dikirim ke pemilik spreadsheet CW Pagi (sekarang **satpasbwi@gmail.com**). Alamat lain bisa diisi di
`EMAIL_OPERATOR` (beberapa alamat dipisah koma).
- **Error di pemicu harian**: verifikasi otomatis, PENILAIAN INTEGRITAS, dan INTEGRITAS MINGGUAN yang gagal
  langsung dikirim lewat email beserta isi errornya (`laporGagal_`).
- **Cek kesehatan tiap jam** (pemicu `cekKesehatan`):
  - aplikasi GitHub Pages bisa dibuka;
  - Web App `/exec` menjawab (aplikasi bisa login / lapor);
  - deploy GitHub Actions terakhir tidak gagal;
  - pemicu `hitungDurasiPoin` (±07.30) dan `hitungIntegritasSore` (±15.15) masih terpasang dan berhasil dalam 26 jam terakhir.
- Pesan yang sama dikirim paling sering sekali per **3 jam** (`NOTIF_JEDA_MENIT`), jadi kotak masuk tidak kebanjiran.
- **Email ⚠️ kejadian** (`kabarPeringatan_`): setiap ada ⚠️ baru langsung satu email untuk dikroscek, yaitu Lapor CW / Ceklok
  dengan lokasi diragukan (nama, jam, titik, alasan, jarak, akurasi, tautan peta & foto, tautan sheet untuk mengisi VERIFIKASI)
  dan di luar radius > 5 menit (tautan sheet LUAR RADIUS). Maks `PERINGATAN_MAKS_HARI` = 40 email per hari (kuota Gmail);
  matikan dengan `EMAIL_PERINGATAN = false`. Uji: jalankan `ujiEmailPeringatan`.
- Pasang sekali: jalankan `pasangPemicuKesehatan` dari editor. Uji: jalankan `ujiNotifikasi`.
- Saat pertama dijalankan Google meminta izin. Centang **Pilih semua**, termasuk **"Mengirim email atas nama Anda"**.
  Bila izin ini tidak dicentang, email tidak terkirim (log: *Anda tidak memiliki izin untuk memanggil MailApp.sendEmail*).
- Deploy GitHub yang gagal juga dikirim GitHub sendiri ke email akun yang melakukan push, bila notifikasi
  Actions di github.com → Settings → Notifications aktif.

## 10. Ganti bulan

**🩺 Cek & Perbaiki** (menu 🚀 CW PAGI APP; file **CekPerbaiki.gs**) memeriksa: bulan di PENGATURAN (mengingatkan
3 hari sebelum akhir bulan), struktur ABSENSI (baris 7–86 utuh), titik plotting tanpa koordinat, jadwal Piket BM, jadwal Patwal & Piket Laka hari ini,
personel ANGGOTA yang tidak cocok dengan plotting/jadwal, **sisa ruang Google Drive** (waspada ≥ 80%, hampir penuh
≥ 95% juga dikirim lewat email cek kesehatan), ukuran LOG LAPOR, pemicu otomatis, dan mode uji coba.
Masalah yang aman diperbaiki otomatis punya tombol (selalu dengan konfirmasi):

| Masalah | Tombol |
|---|---|
| Pemicu otomatis hilang | **Pasang pemicu** (pasang ulang yang hilang saja) |
| Bulan PENGATURAN sudah lewat | **Ganti bulan** (lihat di bawah) |
| LOG LAPOR ≥ 3000 baris | **Arsipkan** (baris bulan-bulan sebelumnya → spreadsheet "Arsip LOG LAPOR CW Pagi") |
| Jadwal Piket BM hari ini tidak ada | **Buat periode** (lihat Jadwal Piket BM otomatis) |

Yang tidak bisa diperbaiki otomatis hanya diberi saran: jadwal Patwal/Laka belum dibuat, struktur ABSENSI berubah,
nama ANGGOTA, mode uji coba (perlu ubah kode + deploy), dan error di kode (dikirim lewat email, Notifikasi.gs).

**📅 Ganti Bulan (1 klik)** – file **GantiBulan.gs**. Jalankan tanggal 1, sebelum lapor dibuka 06.15 (pemicu ±00.30
mengirim email pengingat bila belum). Hanya bisa bila bulan PENGATURAN sudah lewat. Urutannya:
1. Hitung final bulan lama (DURASI POIN, PENILAIAN INTEGRITAS, PENILAIAN CW, INTEGRITAS HARIAN/MINGGUAN). Minggu
   yang terpotong akhir bulan disimpan ke RIWAYAT INTEGRITAS MINGGUAN sebagai "… – <akhir bulan>"; Senin berikutnya
   bagian bulan baru minggu itu tersimpan sebagai baris sendiri.
2. Spreadsheet baru **"Arsip CW Pagi <Bulan Tahun>"** di folder yang sama (nilai saja): ABSENSI, CATATAN,
   LAPORAN HARIAN, REKAP BULANAN, DURASI POIN, REKAP POIN, PENILAIAN CW, PENILAIAN INTEGRITAS; baris LOG LAPOR &
   LOG CEKLOK bulan lama dipindah ke arsip (foto di Drive tetap).
3. PENGATURAN C4–C5 = bulan berjalan; isian tanggal ABSENSI (E7:AI86) dan CATATAN dikosongkan. Rumus, plotting,
   KETERANGAN TUGAS, dan JAM tidak diubah. Sesudahnya periksa plotting bila ada mutasi, lalu 🩺 Cek & Perbaiki.

**📆 Jadwal Piket BM otomatis** – file **JadwalPiket.gs**, spreadsheet "Piket BM". Satu periode = 4 minggu; tanggal
semua blok mengikuti D3 (Tanggal Mulai). Pemicu ±00.30 sesudah periode selesai (hari > D4): D3 = hari berikutnya dan
nama personel diisi menurut pola rotasi jadwal ini: **minggu ke-n = minggu ke-(n−3) dengan kolom Karangente ↔ Ketapang
ditukar** (tiap orang bergantian pos tiap minggu, regu berputar 1 → 2 → 3, siklus penuh 6 minggu). Kode S/M/LD per regu
tetap. Bila pola di jadwal lama tidak cocok (diubah manual dengan pola lain), jadwal tidak ditulis dan operator
dikabari lewat email. Menu 📆 menampilkan periode berjalan dan susunan minggu pertama periode berikutnya. Sheet Patwal
tetap diperbarui manual bila ada mutasi.

**Pilihan A – satu spreadsheet dipakai terus (paling mudah, dipakai 📅 Ganti Bulan)**
Kosongkan kolom tanggal di ABSENSI, ubah bulan/tahun/tanggal akhir di PENGATURAN (C4, C5, C7),
sesuaikan plotting. URL tidak berubah; tidak perlu deploy atau push.
Sheet LOG LAPOR boleh dibiarkan (data dipisah per bulan otomatis) atau dipindah ke arsip.

**Pilihan B – salinan spreadsheet per bulan**
1. *File → Buat salinan* spreadsheet (Apps Script ikut tersalin).
2. Di salinan: Extensions → Apps Script → **Terapkan → Deployment baru → Aplikasi web**
   (Jalankan sebagai: Saya; Akses: Siapa saja) → izinkan akses → salin **URL /exec** baru.
3. Ubah `API_URL` di `web/config.js` menjadi URL baru → commit & push (bagian 7).
4. Kosongkan sheet LOG LAPOR di salinan (sisakan baris judul).

Selama spreadsheet bukan untuk bulan berjalan (C7 di PENGATURAN), menu Lapor CW
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
