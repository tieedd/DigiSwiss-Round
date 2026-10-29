# Panduan Backend Google Spreadsheet & Apps Script v7.0 (DigiSwiss TCG)

Sistem backend **DigiSwiss TCG** mengelola autentikasi berbasis salt SHA-256, **manajemen turnamen Swiss Round bertahap**, **fitur Revert ke Ronde X & koreksi skor otomatis**, **Timer Ronde Real-Time Tersinkronisasi Server**, **Pencatatan Deck & 7 Warna Resmi Digimon TCG**, serta **Ekspor Hasil Akhir Gambar PNG & Teks Berbagi**.

---

## 1. Fitur Baru v7.0: Timer Ronde & Sinkronisasi Timestamp Server

### A. Kontrol Timer Ronde (Organizer)
- **Input Durasi Manual**: Organizer memasukkan durasi ronde dalam satuan menit (default 45 menit untuk format standar Digimon TCG).
- **Tombol Kontrol**:
  - `Mulai` (`START`): Menghitung waktu mundur berdasarkan timestamp server.
  - `Jeda` (`PAUSE`): Menghentikan sementara hitungan mundur dan menyimpan sisa detik.
  - `Lanjutkan` (`RESUME`): Melanjutkan hitungan mundur dari sisa detik.
  - `Reset` (`RESET`): Mengembalikan timer ke kondisi awal (belum dimulai).
- **Penyimpanan di Spreadsheet**: Data status, durasi, timestamp mulai, dan sisa detik tersimpan rapi di kolom sheet `Rounds`.

### B. Tampilan & Sinkronisasi Pemain (Drift Correction)
- **Jam Hitung Mundur Besar**: Tampil jelas di tab **Ronde** (Organizer) dan **Pertandingan Saya** (Player).
- **Koreksi Selisih Jam Perangkat (Clock Drift Correction)**:
  - Aplikasi menghitung selisih jam perangkat dengan server: `serverTimeOffset = Date.now() - new Date(server_time).getTime()`.
  - Waktu yang ditampilkan dihitung akurat dari timestamp server sehingga tidak ada manipulasi atau perbedaan waktu antar perangkat pemain.
  - Polling otomatis setiap 12 detik untuk menyinkronkan status jeda/lanjut dari Organizer.
- **Peringatan Visual & Getar**:
  - **Sisa 5 Menit**: Angka jam berkedip oranye cyber dan memicu getar perangkat (`navigator.vibrate([200, 100, 200])`).
  - **Waktu Habis (00:00)**: Angka jam berkedip merah dan memicu getar panjang (`navigator.vibrate([400, 200, 400, 200, 400])`).

---

## 2. Fitur Baru v7.0: Deck, Warna, & Riwayat (Deck History)

### A. Pengisian Deck Pasca Turnamen
Setelah turnamen berstatus **Selesai (`FINISHED`)**, Organizer dapat menginputkan deck tiap peserta:
- **Nama Deck**: Nama archetype/kartu andalan (misal: *Wargreymon OTK*, *Beelzemon Mill*, *MirageGaogamon Control*).
- **Warna Deck (Multi-select Chip Toggles)**:
  - Wajib memilih minimal 1 warna dari 7 warna resmi Digimon TCG:
    1. **Merah (Red)** - Aggro / DP Boost
    2. **Biru (Blue)** - Source Strip / Jamming
    3. **Kuning (Yellow)** - Security Control / Recovery
    4. **Hijau (Green)** - Digisorption / Suspension
    5. **Hitam (Black)** - Blocker / De-Digivolve
    6. **Ungu (Purple)** - Trash Manipulation / Retaliation
    7. **Putih (White)** - Hybrid / Royal Knights
- **Riwayat Deck (Deck History)**:
  - Organizer dapat memilih deck yang pernah dipakai player sebelumnya melalui dropdown dari sheet `DeckHistory`.
  - Jika membuat nama deck baru, otomatis tersimpan ke riwayat player tersebut di sheet `DeckHistory` dan tab `Decks`.

---

## 3. Fitur Baru v7.0: Ekspor Hasil Akhir (Gambar PNG & Teks)

Tombol **"Ekspor Hasil Akhir"** di tab Turnamen atau Klasemen membuka modal ekspor interaktif:
1. **Ekspor Teks WhatsApp / Discord**:
   - Salin teks format rapi lengkap dengan emoji podium (🥇 🥈 🥉), nama deck, warna deck, poin kemenangan, dan persentase OMW%.
   - Tombol langsung untuk salin ke clipboard atau buka WhatsApp.
2. **Ekspor Gambar Kartu Hasil (PNG via HTML5 Canvas)**:
   - Dibuat langsung di sisi klien menggunakan HTML5 Canvas beresolusi tinggi (900x1200 px).
   - Tampilan Cyber Digimon gelap dengan aksen biru/oranye, podium 3 besar, tabel klasemen lengkap dengan chip badge warna deck, dan metadata turnamen.
   - Tombol **"Download Gambar PNG"** menyimpan file gambar siap unggah ke media sosial atau grup komunitas TCG.

---

## 4. Fitur Inti yang Tetap Terintegrasi
- **Revert ke Ronde X & Auto-Regenerate Pairing Ronde X+1**: Pemulihan ronde yang keliru tanpa rematch.
- **Pencatatan AuditLog**: Semua aksi revert, perubahan skor, dan pengaturan timer tercatat lengkap.
- **Hierarki Tie-Breaker Resmi**: Poin Turnamen → Opponent Match Win % (OMW%, floor 33%) → Game Win % (GW%, floor 33%) → Opponent Game Win % (OGW%, floor 33%) → Head-to-Head (H2H).

---

## 5. Langkah Pemasangan di Google Apps Script
1. Buka spreadsheet database Anda di [Google Sheets](https://sheets.new).
2. Klik **Ekstensi (Extensions)** > **Apps Script**.
3. Hapus kode lama, salin dan tempel seluruh isi file `Code.gs` (Versi 7.0.0).
4. Simpan, pilih fungsi `setup` pada menu dropdown atas dan klik **Run (Jalankan)**.
   *(Fungsi `setup()` otomatis menambahkan kolom header baru: `timer_duration_minutes`, `timer_status`, `timer_start_timestamp`, `timer_remaining_seconds` pada sheet `Rounds`, serta kolom `deck_colors` pada sheet `Registrations` dan `DeckHistory`).*
5. Klik **Deploy (Terapkan)** > **Manage deployments (Kelola penerapan)** > Edit versi menjadi **New Version** > **Deploy**.
6. Gunakan URL Web App di aplikasi DigiSwiss. Selesai!
