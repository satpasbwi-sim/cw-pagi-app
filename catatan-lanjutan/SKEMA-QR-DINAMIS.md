# Skema QR dinamis untuk Ceklok Satpas (rencana, belum dikerjakan)

Dibuat 24 Okt 2026. Rencana pengembangan: Ceklok Masuk/Pulang wajib memindai QR yang berganti terus dari sebuah
tablet di kantor Satpas. Belum ada kode yang dibuat. Tidak berisi kode rahasia.

## 1. Gambaran

```
 Tablet di kantor (layar QR)          HP anggota (aplikasi)             Apps Script (Kode.gs)
┌──────────────────────────┐  scan   ┌──────────────────────┐  kirim   ┌────────────────────────┐
│ QR berganti tiap ±30 dtk │ ──────▶ │ Ceklok Masuk/Pulang: │ ───────▶ │ cocokkan kode QR       │
│ kode = rahasia + waktu   │         │ scan QR + GPS + foto │          │ dengan rahasia + waktu │
└──────────────────────────┘         └──────────────────────┘          └────────────────────────┘
```

1. Tablet menampilkan QR yang berganti otomatis sekitar 30 detik sekali. Isinya dihitung dari **kode rahasia +
   jam saat itu** (cara kerja seperti kode OTP bank, HMAC-SHA256).
2. Anggota menekan Ceklok Masuk / Pulang, lalu memindai QR dengan kamera HP (izin kamera sudah dipakai untuk foto).
3. Server menghitung ulang dengan rahasia yang sama. Cocok dan masih berlaku (periode sekarang atau satu periode
   sebelumnya) → ceklok diterima.

Tablet tetap jalan walau internet kantor putus, karena kode dihitung sendiri dari rahasia + jam.

## 2. Mengapa lebih kuat
- Foto QR yang dikirim ke teman kedaluwarsa dalam sekitar 30 detik.
- Pengamanan lama tetap berlaku: radius 100 m, deteksi lokasi palsu, foto kamera langsung, satu NRP satu HP.
- GPS bisa dipalsukan, tetapi QR menuntut anggota benar-benar berdiri di depan tablet.

## 3. Kebutuhan
**Perangkat:** 1 tablet Android, charger yang selalu tersambung, dudukan dinding/meja dekat pintu, layar diatur
tidak pernah mati.

**Aplikasi (`web/`):**
- Mode **"Layar QR"** di aplikasi yang sama (dibuka dengan kode admin), tablet cukup membuka alamat github.io.
- Langkah **"Scan QR"** di Ceklok Masuk/Pulang. Pakai library pembaca QR kecil (jsQR), disimpan di `web/` dan
  masuk cache service worker supaya tidak bergantung CDN. `BarcodeDetector` belum ada di iPhone.

**Server (`Kode.gs`):**
- Fungsi pemeriksa kode QR + pengaturan baru, misalnya `CEKLOK.wajibQR`.
- Kode rahasia disimpan di **Script Properties** Apps Script, **jangan** di `web/config.js` atau repo, karena repo publik.
- Deploy ulang (lihat README bagian 8 / STATUS-LANJUTAN "Cara deploy").

## 4. Keputusan yang perlu diambil
- **Tablet mati/rusak:** admin bisa menonaktifkan kewajiban QR sementara, atau HP admin menampilkan QR cadangan.
- **Tinggalkan Kantor dan Tidak masuk:** tetap tanpa QR, karena anggota memang tidak di kantor.
- **Antrean saat sinyal putus:** kode QR disimpan bersama jam pindai; server memeriksa terhadap jam pindai, dengan
  batas yang sama seperti laporan tertunda.

## 5. Peningkatan yang disarankan (di atas skema dasar)
Urutan = saran prioritas.

| No | Peningkatan | Manfaat |
| --- | --- | --- |
| Q1 | **Penerapan bertahap** memakai pola `NRP_RESMI` (ModeResmi.gs): QR wajib dulu untuk beberapa NRP, lalu semua. | Uji di lapangan tanpa mengganggu semua anggota. |
| Q2 | **Kolom METODE** di LOG CEKLOK (`QR` / `TANPA QR` / `QR CADANGAN`) dan ID tablet. | Admin bisa menelusuri ceklok mana yang lewat QR. |
| Q3 | **QR terikat jenis dan tanggal**: kode Masuk tidak bisa dipakai untuk Pulang; satu NRP tidak bisa memakai kode yang sama dua kali. | Menutup pemakaian ulang kode. |
| Q4 | **Sinkron jam tablet**: saat dibuka, tablet mengambil jam server dan menyimpan selisihnya. | QR tidak ditolak karena jam tablet melenceng. |
| Q5 | **Layar tetap menyala dan layar penuh** (Wake Lock API + pasang sebagai aplikasi/PWA). | Tablet tidak tidur, anggota tidak bisa keluar dari layar QR. |
| Q6 | **Detak tablet**: tablet melapor ke server tiap ±5 menit; bila diam > 15 menit di jam ceklok, email ke operator (fitur Notifikasi gangguan yang sudah ada) dan QR cadangan bisa dibuka admin. | Gangguan tablet cepat diketahui. |
| Q7 | **Periode lebih pendek (15 detik)** + QR kecil dengan angka 4 digit di bawahnya sebagai cadangan bila kamera HP gagal membaca. | Mempersempit waktu kirim-foto ke teman; tetap bisa dipakai HP berkamera buruk. |
| Q8 | **Rotasi kode rahasia** (mis. tiap bulan saat Ganti bulan) dan rahasia per tablet bila nanti ada lebih dari satu tablet. | Bila rahasia bocor, dampaknya terbatas. |
| Q9 | **Anti-relai** (kirim QR langsung lewat video call): angka acak di layar tablet yang harus diketik ulang di HP, atau foto ceklok dibandingkan dengan latar kantor. | Lapisan tambahan bila kecurangan relai ditemukan; kerjakan hanya bila memang terjadi. |

Catatan: CW Pagi (pos di lapangan) tidak cocok memakai tablet tetap. Bila perlu, QR yang sama bisa dipakai untuk
apel pagi di kantor.
