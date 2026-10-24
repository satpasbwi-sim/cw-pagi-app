# Pantauan pengawas & admin

Dibuat 24 Okt 2026. Tidak berisi kode rahasia.

**Status:**
- [x] Rancangan (dokumen ini).
- [x] Server: `catatan-lanjutan/server/Pantauan.gs` + cabang `action=pantauan` di `doGet` (lihat bagian 7).
- [x] Aplikasi (`web/`): tab **Pantauan** (cache `cw-pagi-v46`). Tab hanya muncul bila server mengirim `pantauan: true`.
- [x] Dipasang di Apps Script 24 Okt 2026, deploy **Versi 55** ("Pantauan pengawas & admin"). `ujiPantauan` (21.10):
  ceklok 24 anggota, CW 58 baris plotting, pola 0 orang, persetujuan 6 menunggu. `/exec?pin=00000001` → `PIN salah`.
- [x] Tampilan diuji di laptop dengan data contoh (admin, pengawas, anggota; lebar HP 375 px).
- [ ] Aplikasi belum tayang: branch `claude/pantauan-pengawas` (di atas PR #1) menunggu persetujuan pemilik untuk push / gabung.

Catatan: data uji coba direset ±19.00, jadi sesudah itu bagian "Hari ini" menampilkan semua anggota "Belum masuk".
Mulai 26/10 NRP resmi tidak direset.

## 1. Tujuan
Satu tab **Pantauan** untuk pengawas (`NRP_PENGAWAS`) dan admin (masuk dengan kode admin), berisi tiga bagian:

| Bagian | Pertanyaan yang dijawab |
| --- | --- |
| **Hari ini** | Siapa yang sudah / belum Ceklok Masuk dan Lapor Datang, siapa terlambat — saat itu juga, tanpa menunggu rekap. |
| **Mencurigakan** | Siapa yang laporannya menunjukkan pola curang dalam 7 hari terakhir dan belum diperiksa. |
| **Persetujuan** | Pengajuan izin / tugas mendadak yang belum diputuskan atasan, dan siapa yang paling sering mengajukan. |

Semua bagian **hanya membaca** sheet yang sudah ada. Tidak ada sheet baru, tidak ada perubahan penilaian.
Keputusan (VERIFIKASI ASLI/PALSU, CEK FOTO, KEPUTUSAN SETUJU/TOLAK) tetap diisi di spreadsheet.
Anggota biasa tidak melihat tab ini.

## 2. Keputusan (24 Okt 2026)
| Hal | Keputusan |
| --- | --- |
| Siapa melihat | Pengawas dan admin, aturan akses persis seperti `action=rekap` / `action=pembinaan`. |
| Cakupan pengawas | **Hanya anggota Satpas** (Ceklok Satpas), sama seperti Rekap Integritas yang hanya mengirim Anggota Satpas ke pengawas. |
| Cakupan admin | Anggota Satpas **dan** Personel CW Pagi. |
| Periode "Mencurigakan" | 7 hari terakhir (`PANTAU_HARI = 7`). |
| Ambil keputusan dari aplikasi | **Belum** (tahap berikut, bagian 8). Aplikasi menampilkan tautan ke spreadsheet untuk admin. |
| Uji coba | Orang yang masih uji coba tetap ditampilkan dengan label *uji coba*, karena data uji coba dihapus ±19.00. |

## 3. Bagian "Hari ini"
### 3a. Ceklok Satpas (pengawas & admin)
- Sumber: daftar anggota Satpas (`satpasDaftar_`, tanpa pengawas) + LOG CEKLOK hari ini (`ceklokHari_`)
  + jam dinas per orang (`jadwalSatpas_`, termasuk `CEKLOK_KHUSUS`) + LIBUR SATPAS.
- Hari Minggu / libur: bagian ini menampilkan "Hari ini libur Ceklok Satpas (…)".
- Status tiap orang (urutan tampil):
  1. **Belum masuk** – sudah lewat jam masuk, belum ada MASUK / izin. (merah)
  2. **Izin (menunggu)** – ada pengajuan tidak masuk yang belum diputuskan. (oranye)
  3. **Terlambat** – MASUK dengan selisih > 0 menit. (oranye)
  4. **Belum waktunya** – belum ada ceklok, jam masuk belum lewat. (abu-abu)
  5. **Hadir** / **Pulang** / **Keluar (tugas)** / **Izin (disetujui)**. (hijau / biru)
- Ringkasan atas: `hadir x · terlambat y · belum z · izin w` dari `n` anggota.
- Tiap baris: nama, pokja, jam masuk (+ terlambat n mnt), jam pulang, tanda ⚠️ bila ceklok hari ini lokasinya diragukan.

### 3b. CW Pagi (admin saja)
- Sumber: ABSENSI hari ini (`getData_`) + LOG LAPOR hari ini (`getLapor_` tanpa nama, per no plotting).
- Sabtu / Minggu sejak 26/10: "Hari ini libur CW Pagi".
- Status per baris plotting: **Belum datang** (lewat batas datang `06.30`, belum Lapor Datang, sel ABSENSI kosong),
  **Datang** (belum selesai), **Terlambat**, **Selesai (H)**, **Tinggalkan lokasi**, **Tidak hadir (kode)**,
  **Nihil ⚠️**, atau kode yang diisi admin (LD, D, …) = tidak wajib.
- Baris pos jaga dipakai bersama: ditampilkan sebagai satu baris dengan nama pelapor terakhir.

## 4. Bagian "Mencurigakan"
Per orang, 7 hari terakhir, dari LOG LAPOR, LOG CEKLOK dan LUAR RADIUS. Jenis kejadian:

| Kode | Kejadian | Sumber | Masuk daftar bila |
| --- | --- | --- | --- |
| `lokasi` | ⚠️ Lokasi diragukan (akurasi ≤1 m, koordinat kembar, sama dengan titik plotting) | kolom PERINGATAN | ≥1, **belum** diverifikasi (VERIFIKASI kosong) atau diverifikasi PALSU |
| `luar` | Di luar radius > 5 menit setelah Lapor Datang / Ceklok Masuk | sheet LUAR RADIUS | ≥1 |
| `foto` | CEK FOTO selain SESUAI (TIDAK SESUAI, FOTO LAYAR / FOTO LAMA, …) | kolom N CEK FOTO | ≥1 |
| `tunda` | Laporan tertunda (terkirim lewat antrean ≥2 mnt, "sinyal putus") | CATATAN `[… tertunda n mnt – sinyal putus]` | ≥ `PANTAU_TUNDA_MIN` (2) kali |
| `mirip` | Posisi nyaris sama (≤ `PANTAU_MIRIP_M` = 2 m) di ≥3 hari berbeda, akurasi ≤20 m | kolom PETA | ≥3 hari (GPS asli biasanya bergeser 3–15 m tiap hari) |

- Kejadian yang sudah diverifikasi **ASLI** tidak dihitung.
- Urutan: bobot terbesar dulu (`lokasi` 3, `luar` 2, `foto` 2, `mirip` 2, `tunda` 1 per kejadian).
- Tiap orang membawa daftar kejadian (tanggal, jam, jenis, rincian, tautan peta / foto bila masih ada).
- Pengawas: hanya kejadian Ceklok + LUAR RADIUS jenis CEKLOK. Admin: semua.

## 5. Bagian "Persetujuan"
- Sumber: sheet PERSETUJUAN (spreadsheet CW Pagi).
- **Menunggu**: semua baris dengan KEPUTUSAN kosong, terbaru dulu: tanggal, umur (hari), nama, CW/CEKLOK, pengajuan, keterangan.
  Umur ≥ 2 hari diberi tanda merah ("selama belum SETUJU dihitung tidak hadir / pulang cepat").
- **Sering mengajukan** (bulan berjalan): orang dengan ≥ `PANTAU_SERING_MIN` (3) pengajuan, beserta rincian
  setuju / tolak / menunggu.
- Pengawas: hanya baris CEKLOK. Admin: semua.

## 6. API
`GET ?hp=…&pin=…&kode=…&action=pantauan`
- Hanya pengawas / admin (cek akses sama dengan `action=rekap`), selain itu `{"error": "..."}`.
- Jawaban:
  ```json
  {
    "lingkup": "satpas" | "semua",
    "diperbarui": "24/10 20.40",
    "hariIni": {
      "tgl": "2026-10-26", "jam": "07.42",
      "ceklok": { "libur": "", "ringkas": {"hadir":0,"terlambat":0,"belum":0,"izin":0,"total":0},
                  "baris": [{ "nrp":"…","nama":"…","pokja":"…","status":"belum|izin_menunggu|terlambat|nanti|hadir|pulang|keluar|izin",
                              "masuk":"07.05","telat":5,"pulang":"","ket":"","peringatan":false,"ujiCoba":true }] },
      "cw": null | { "libur": "", "ringkas": {...}, "baris": [{ "no":"1","petugas":"…","lokasi":"…","status":"…",
                                                                "datang":"06.12","selesai":"","kode":"","ket":"" }] }
    },
    "pola": { "hari": 7, "daftar": [{ "nama":"…","nrp":"…","bobot":5,"ringkas":{"lokasi":1,"luar":1},
                                        "kejadian":[{"tgl":"2026-10-26","jam":"06.10","jenis":"lokasi","sumber":"CW","ket":"…","peta":"…","foto":"…"}] }] },
    "persetujuan": { "menunggu": [{ "tgl":"…","umur":1,"nama":"…","jenis":"CW","pengajuan":"…","ket":"…" }],
                     "sering": [{ "nama":"…","jumlah":4,"setuju":2,"tolak":1,"menunggu":1 }], "url": "…" }
  }
  ```
- Jawaban data utama (GET tanpa action) untuk pengawas & admin diberi `pantauan: true`.
- Cache: `pola` 5 menit (membaca seluruh LOG); `hariIni` dan `persetujuan` tidak di-cache (harus terkini).

## 7. Pemasangan di Apps Script (selesai 24 Okt 2026, Versi 55)
1. Salin `catatan-lanjutan/server/Pantauan.gs` ke `apps-script/Pantauan.gs`, lalu ke editor (tombol + → Skrip → `Pantauan`).
2. Di `doGet` (Kode.gs), tepat di bawah cabang `action=pembinaan`:
   ```js
   if (p.action === 'pantauan') {
     if (who.role !== 'pengawas' && who.role !== 'admin') return json_({ error: 'Pantauan hanya untuk pengawas' });
     return json_(typeof pantauanData_ === 'function' ? pantauanData_(who) : { error: 'Fitur pantauan belum dipasang' });
   }
   ```
   dan di samping `pembinaan = true` (pengawas & admin): `if (typeof pantauanData_ === 'function') dp.pantauan = true;`
3. Jalankan `ujiPantauan` dari editor: Log berisi `hariIni`, `pola`, `persetujuan`.
4. Deploy Versi baru. Push `web/` ke `main` setelah disetujui pemilik.

## 8. Pengembangan berikutnya (opsional)
- Tombol SETUJU / TOLAK dan ASLI / PALSU langsung dari tab Pantauan (menulis ke sheet; perlu kunci & log siapa memutuskan).
- Notifikasi ke pengawas pukul 08.15 bila masih ada anggota "Belum masuk".
- Ambang `mirip` disesuaikan setelah 2 minggu data resmi (lihat berapa banyak tanda keliru).
