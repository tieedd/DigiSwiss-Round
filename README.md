# 🦖 DigiSwiss TCG - Sistem Manajemen Turnamen Digimon Card Game

**DigiSwiss TCG** adalah aplikasi manajemen turnamen format *Swiss Round* mobile-first yang dirancang khusus untuk komunitas **Digimon Card Game (TCG)**. Dibangun menggunakan **React**, **Tailwind CSS**, dan **Capacitor** (untuk APK Android) dengan arsitektur serverless gratis berbasis **Google Spreadsheet** dan **Google Apps Script (Web App)**.

---

## ⚡ Fitur Utama

1. **Sistem Login & Hak Akses Berbasis Peran (RBAC):**
   - **Player:** Turnamen, Pertandingan Saya, Riwayat, Statistik, Profil.
   - **Organizer:** Turnamen Saya, Ronde, Klasemen, Riwayat, Statistik, Log Audit.
   - **Admin:** Manajemen Pengguna, Turnamen, Statistik Global, Pengaturan Sistem.
   - Keamanan kata sandi dengan hash SHA-256 + salt unik per pengguna.
2. **Pairing Swiss Otomatis & Cerdas:**
   - Ronde 1 acak, ronde berikutnya dipasangkan berdasarkan kelompok poin yang sama.
   - Algoritma *backtracking* mencegah rematch antar pemain.
   - Penanganan otomatis peserta ganjil (BYE) diprioritaskan untuk peserta dengan poin terendah yang belum pernah BYE.
   - Fitur tukar meja manual oleh Organizer dengan validasi anti-rematch.
3. **Skema Skor Resmi Digimon TCG (Tanpa Seri):**
   - **BO1:** Menang 3 poin, Kalah 0 poin.
   - **BO3:** Menang 2-0 (3 poin), Menang 2-1 (2 poin), Kalah 1-2 (1 poin), Kalah 0-2 (0 poin).
   - Klasemen otomatis dengan 4 level tie-breaker:
     1. Opponent Match Win % (OMW%) - batas minimum 33% per lawan.
     2. Game Win % (GW%).
     3. Opponent Game Win % (OGW%).
     4. Head-to-Head.
4. **Input Skor Mandiri & Sistem Sengketa:**
   - Pemain menginput hasil pertandingannya di tab *Pertandingan Saya*.
   - Lawan melakukan konfirmasi. Jika lawan menolak, status menjadi *Sengketa* untuk diputuskan oleh Organizer.
5. **Timer Ronde Sinkron dengan Jam Server:**
   - Durasi ronde fleksibel (default 45 menit).
   - Tombol kontrol: Mulai, Jeda, Lanjutkan, Reset.
   - Hitung mundur tersinkronisasi presisi dengan server timestamp offset, disertai peringatan visual dan getar saat sisa 5 menit dan waktu habis.
6. **Manajemen Deck & 7 Warna Resmi Pasca-Turnamen:**
   - Pengisian nama deck/archetype dan chip toggle 7 warna Digimon TCG (*Merah, Biru, Kuning, Hijau, Hitam, Ungu, Putih*).
   - Tersimpan otomatis di lembar `DeckHistory` dengan dropdown riwayat deck pemain.
7. **Ekspor & Berbagi Hasil Akhir:**
   - Unduh gambar podium klasemen beresolusi tinggi (format PNG hasil render Canvas).
   - Salin teks ringkasan untuk dibagikan ke WhatsApp dan Discord.
8. **Fitur Revert Ronde & Pembuatan Ulang Pairing Otomatis:**
   - Revert aman ke Ronde X dengan pratinjau daftar dampak (ronde lanjutan diarsipkan).
   - Setelah perbaikan skor terkonfirmasi, sistem otomatis membuat ulang pairing ronde berikutnya.
9. **Riwayat & Statistik dengan Visualisasi Grafik Mobile:**
   - **Riwayat Lengkap:** Pencarian dan filter nama turnamen serta rentang tanggal.
   - **Grafik Tren Peringkat (Player):** Visualisasi garis SVG interaktif (posisi Juara #1 di puncak grafik).
   - **Win Rate per Deck & per Warna:** Menampilkan rasio kemenangan dan penggunaan warna.
   - **Distribusi Meta & Analitik Organizer/Admin:** Pemetaan komposisi warna deck peserta dan deck terpopuler.

---

## 📋 Panduan Setup Spreadsheet & Google Apps Script

Aplikasi ini tidak memerlukan server berbayar atau database SQL mandiri. Semua data tersimpan aman di Google Spreadsheet pribadi Anda.

### Langkah 1: Buat Spreadsheet Baru
1. Buka [Google Sheets](https://sheets.new) di peramban Anda.
2. Beri nama spreadsheet, contohnya: **DigiSwiss TCG Database**.

### Langkah 2: Buka Editor Apps Script
1. Pada menu navigasi Google Sheets, klik **Ekstensi (Extensions)** > **Apps Script**.
2. Hapus seluruh isi default pada file `Code.gs`.
3. Buka file `Code.gs` dari repositori ini, salin seluruh kodenya, dan tempelkan ke editor Apps Script.
4. Klik tombol **Simpan (Save)** (ikon disket) atau tekan `Ctrl + S` / `Cmd + S`.

### Langkah 3: Inisialisasi Database (Fungsi setup)
1. Pada toolbar atas editor Apps Script, pilih fungsi **setup** pada dropdown fungsi yang akan dijalankan.
2. Klik tombol **Jalankan (Run)**.
3. Google akan meminta izin akses (*Authorization Required*):
   - Klik **Review Permissions**.
   - Pilih akun Google Anda.
   - Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced** > **Go to Untitled project (unsafe)**.
   - Klik **Allow**.
4. Setelah eksekusi selesai, kembali ke Google Spreadsheet Anda. Anda akan melihat 9 tab sheet telah dibuat otomatis beserta header kolomnya:
   - `Users`
   - `Sessions`
   - `Tournaments`
   - `Registrations`
   - `Rounds`
   - `Matches`
   - `Decks`
   - `DeckHistory`
   - `AuditLog`

### Langkah 4: Deploy sebagai Web App
1. Di pojok kanan atas editor Apps Script, klik tombol **Deploy** > **New deployment**.
2. Klik ikon gerigi (Select type) dan pilih **Web app**.
3. Isi konfigurasi berikut (**PENTING**):
   - **Description:** `DigiSwiss Backend v8.0`
   - **Execute as:** `Me (email Anda)`
   - **Who has access:** `Anyone` (Siapa saja, agar aplikasi frontend dapat mengirim permintaan API).
4. Klik tombol **Deploy**.
5. Salin **Web app URL** yang berakhiran `/exec`. Contoh:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## 🔄 Cara Memperbarui Deployment (Update Code.gs)

Jika di kemudian hari terdapat pembaruan kode pada `Code.gs`, ikuti langkah ini agar Google Apps Script menggunakan versi terbaru:

1. Buka kembali editor Apps Script pada Spreadsheet Anda.
2. Tempelkan kode `Code.gs` yang baru dan klik **Simpan**.
3. Klik tombol **Deploy** > **Manage deployments** (Kelola penerapan).
4. Pada daftar deployment, klik ikon **Pensil (Edit)** pada baris Web App aktif.
5. Pada dropdown **Version**, pilih **New version** (Wajib membuat versi baru, jangan biarkan versi lama).
6. Klik **Deploy**.
7. URL Web App akan tetap sama persis sehingga Anda tidak perlu mengubah konfigurasi di aplikasi.

---

## ⚙️ Menghubungkan Aplikasi ke Backend

1. Buka aplikasi DigiSwiss TCG di peramban atau perangkat Android.
2. Buka tab **Pengaturan** (ikon ⚙️ atau profil 👤).
3. Pada bagian **Koneksi Google Apps Script**, tempelkan URL Web App yang Anda peroleh dari Langkah 4 di atas.
4. Klik **Simpan & Tes Koneksi**.
5. Indikator di pojok kanan atas akan berubah menjadi hijau: `Online (xxx ms)`.

> **Tips:** Anda juga dapat mengubah URL default secara langsung pada file `src/config.ts` di konstanta `DEFAULT_API_URL`.

---

## 💻 Cara Menjalankan Secara Lokal (Local Development)

### Kebutuhan Sistem:
- Node.js versi 18 atau lebih tinggi.
- NPM atau PNPM.

### Langkah-langkah:
```bash
# 1. Masuk ke direktori proyek
cd digiswiss-tcg

# 2. Pasang dependensi
npm install

# 3. Jalankan server pengembangan
npm run dev
```

Buka peramban di `http://localhost:5173`.

### Build Produksi Web:
```bash
npm run build
```
File siap saji akan dibuat di folder `dist/`.

---

## 📱 Membungkus Menjadi APK Android (Capacitor)

Proyek ini telah dikonfigurasi dengan **Capacitor 6** sehingga siap dibungkus menjadi file APK Android mandiri.

```bash
# 1. Bangun aset web
npm run build

# 2. Sinkronkan dengan proyek Android
npx cap sync android

# 3. Buka di Android Studio untuk generate APK / AAB
npx cap open android
```

Pada Android Studio:
- Pilih menu **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
- APK yang dihasilkan dapat langsung diinstal di HP Android tanpa emulator eksternal.

---

## 🧪 Pengujian Otomatis (Self-Test Suite)

Aplikasi dilengkapi modul uji terintegrasi untuk memastikan kebenaran algoritma Swiss pairing, perhitungan skor, tie-breaker, timer, serta agregasi statistik:
- Buka tab **Pengaturan**, scroll ke bawah, lalu klik tombol **Jalankan Tes Algoritma**.
- Sistem akan menjalankan 7 kelompok pengujian internal dan menampilkan status `PASSED` secara mendetail.

---

## 📄 Lisensi

Dibuat untuk komunitas pemain dan Tournament Organizer (T.O.) Digimon Card Game. Bebas digunakan, dimodifikasi, dan dikembangkan untuk kemajuan komunitas TCG.
