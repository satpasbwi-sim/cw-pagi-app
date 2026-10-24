# Peringatan dini pembinaan

Dibuat 24 Okt 2026. Tidak berisi kode rahasia.

**Status (24 Okt 2026):**
- [x] Aplikasi (`web/`): tab **Pembinaan** selesai. Tab hanya muncul bila server mengirim `pembinaan: true`, jadi aman
  di-push sebelum server dipasang.
- [x] Server: `catatan-lanjutan/server/Pembinaan.gs` selesai dan logikanya sudah diuji dengan data contoh.
- [ ] **Belum dipasang di Apps Script.** Ikuti bagian 8 (dikerjakan di laptop / editor Apps Script).

## 1. Tujuan
Pimpinan / pengawas melihat daftar anggota yang **skornya turun 2 minggu berturut-turut**, supaya bisa dibina
sebelum nilainya jatuh ke predikat Kurang. Anggota sendiri **tidak** melihat daftar ini.

## 2. Keputusan yang sudah diambil (24 Okt 2026)
| Hal | Keputusan |
| --- | --- |
| Kriteria | Skor mingguan **final** turun 2 minggu berturut-turut |
| Tujuan tampil | **Tab di aplikasi** untuk pengawas (`NRP_PENGAWAS`) dan admin (masuk dengan kode admin) |
| Tempat kerja | Laptop (server `apps-script/` + aplikasi `web/`) |

Belum dipilih (bisa ditambah nanti): terlambat > 3× seminggu, predikat Kurang / ada ⚠️ PALSU, tidak ceklok
berulang, sheet PEMBINAAN, email ke pimpinan.

## 3. Aturan hitung (server)
- Sumber: sheet **RIWAYAT INTEGRITAS MINGGUAN** (spreadsheet Data Satpas), 1 baris per anggota per minggu, nilai final
  (ditulis tiap Senin pagi oleh IntegritasMingguan.gs). Kolom dicari lewat **judul**, seperti `barisDataSatpas_`.
- Untuk tiap anggota (kunci NRP), ambil **3 minggu final terakhir yang berurutan**: W-2, W-1, W.
- Masuk daftar bila **W-2 > W-1 > W** dan **W-2 − W ≥ `PEMBINAAN_MIN_TURUN`** (usul 3 poin, supaya naik-turun kecil
  tidak ikut).
- Lewati minggu dengan hari dinilai < `PEMBINAAN_MIN_HARI` (usul 3), supaya minggu libur / izin panjang tidak
  dianggap turun. Bila ada minggu yang dilewati, 3 minggu tidak lagi berurutan → anggota tidak dinilai minggu ini.
- Tiap anggota di daftar membawa:
  - nama, NRP, pokja;
  - skor W-2, W-1, W, total turun, predikat W;
  - **unsur yang paling turun** (bila RIWAYAT menyimpan nilai per unsur; bila tidak, kosongkan);
  - catatan minggu W dari CATATAN penilaian (tanpa angka aturan, sama seperti Rekap Integritas).
- Urutan daftar: total turun terbesar dulu.
- Konstanta baru (mis. di file baru `Pembinaan.gs`): `PEMBINAAN_MIN_TURUN = 3`, `PEMBINAAN_MIN_HARI = 3`.
- Daftar dihitung saat diminta (data kecil), atau disimpan di sheet tersembunyi saat pemicu Senin pagi bila lambat.

## 4. API (server → aplikasi)
`GET ?hp=…&pin=…&kode=…&action=pembinaan`
- Hanya untuk pengawas / admin (aturan akses sama dengan `action=rekap`); selain itu `{"error": "..."}`.
- Jawaban:
  ```json
  {
    "minggu": ["2026-11-02", "2026-11-09", "2026-11-16"],
    "aturan": "Skor mingguan final turun 2 minggu berturut-turut",
    "daftar": [
      { "nrp": "…", "nama": "…", "pokja": "…", "skor": [88, 82, 75], "turun": 13,
        "predikat": "Cukup", "unsur": "Ketepatan waktu", "catatan": ["…"] }
    ]
  }
  ```
- `minggu` = tanggal Senin tiap minggu W-2, W-1, W. `daftar` kosong = tidak ada yang perlu dibina.

## 5. Tampilan (aplikasi `web/`)
- Tombol tab baru **Pembinaan** di `index.html` (sebelah Rekap Integritas, `data-m="pembinaan"`), tampil hanya bila
  `data.pengawas` atau admin, sama seperti `btnModeRekapInt`.
- Muat seperti Rekap Integritas: simpan hasil terakhir di HP (`cw_pembinaan_d`), tampil langsung, perbarui di latar
  belakang; tombol ⟳ Muat ulang.
- Kartu per anggota: nama + pokja, tren 3 minggu (mis. `88 → 82 → 75`, panah merah), unsur yang paling turun,
  catatan singkat. Judul atas: "N anggota perlu pembinaan · minggu 2–16 Nov".
- Daftar kosong: "Tidak ada anggota dengan skor turun 2 minggu berturut-turut."
- Versi cache `web/sw.js`: `cw-pagi-v45`.

## 6. Kapan mulai berguna
Selama `UJI_COBA = true`, RIWAYAT INTEGRITAS MINGGUAN kosong karena data direset tiap hari. Butuh **3 minggu final**
data resmi: bila resmi penuh mulai 26/10, paling cepat terlihat **Senin 16 Nov 2026** (minggu 26 Okt, 2 Nov, 9 Nov).
Untuk menguji lebih awal: isi beberapa baris contoh di RIWAYAT pada salinan spreadsheet, atau buat fungsi uji
yang memakai data buatan.

## 7. Pengembangan berikutnya (opsional)
- Tombol **"Sudah dibina"** + catatan singkat dari pengawas, disimpan di sheet PEMBINAAN, supaya anggota yang sudah
  ditangani diberi tanda.
- Tambah kriteria lain dari bagian 2 (terlambat berulang, predikat Kurang, tidak ceklok berulang).
- Email ringkasan Senin pagi ke pimpinan.

## 8. Pemasangan di Apps Script (belum dikerjakan)
1. Salin `catatan-lanjutan/server/Pembinaan.gs` ke `apps-script/Pembinaan.gs` di laptop, lalu ke editor Apps Script
   (tombol + → Skrip → beri nama `Pembinaan`).
2. Di `doGet` (Kode.gs), di tempat `action=rekap` ditangani, tambahkan cabang yang sama untuk pembinaan, dengan
   **cek akses yang sama** (hanya pengawas / admin):
   ```js
   if (action === 'pembinaan') {
     // ... cek pengawas / admin persis seperti action=rekap ...
     return /* fungsi keluaran JSON yang dipakai action=rekap */(pembinaanData_());
   }
   ```
3. Di jawaban data utama (GET tanpa action) untuk **pengawas dan admin**, tambahkan `pembinaan: true`. Anggota biasa
   jangan diberi tanda ini.
4. Jalankan `ujiPembinaan` dari editor: Log harus berisi `minggu`, `aturan`, `daftar` (boleh kosong). Bila muncul
   "Kolom … tidak ditemukan", sesuaikan `PEMBINAAN_KOLOM` dengan judul kolom yang tertulis di pesan itu.
   Bila RIWAYAT tidak punya kolom hari dinilai / per unsur, fitur tetap jalan (filter hari dan "unsur paling turun"
   dilewati).
5. Deploy versi baru (lihat STATUS-LANJUTAN "Cara deploy"). Push `web/` ke `main`.
6. Cek: masuk sebagai pengawas → tab Pembinaan muncul di sebelah Rekap Integritas.

Hasil disimpan di cache Apps Script 10 menit (`PEMBINAAN_CACHE_DETIK`); jalankan `ujiPembinaan` untuk menghapusnya.
