# Lakuh Fitting — PRD Free Visit

## Tujuan dan sumber konten

Website reservasi kunjungan butik dengan judul **Appointment Free Visit**, admin minimal dan reminder WhatsApp. Tidak ada katalog, pembayaran, checkout atau signup publik. Teks disalin persis dari lampiran permintaan pengguna, termasuk 10 ketentuan, catatan kuning, informasi stok, penutup dan empat checkbox. PDF “Summary isi website(1).pdf” tidak tersedia pada lampiran; kesesuaian dengan file PDF asli belum dapat diverifikasi.

## Alur publik

1. **Pilih jam kunjungan:** hanya tanggal hari ini di Asia/Jakarta, ditampilkan sebagai informasi tanpa kalender. Lima waktu mulai 11.00–15.00 WIB, grid dua kolom, satu customer per slot. Cutoff 60 menit; slot lewat/terisi disabled. Error API menampilkan error/retry, bukan jadwal penuh palsu.
2. **Isi identitas dan informasi acara:** nama lengkap dan WhatsApp wajib, WA dinormalisasi ke 62. Berat badan wajib angka finite 20–300 kg dan tinggi badan wajib angka finite 80–250 cm. Informasi rencana acara berupa teks opsional. Pilih tanggal acara mulai tanggal kunjungan atau centang belum memiliki tanggal pasti; checkbox mengosongkan dan menonaktifkan tanggal.
3. **Baca syarat serta berikan persetujuan:** semua teks lengkap, kotak kuning lembut, ringkasan kunjungan/nama/WA/berat/tinggi/acara dan empat checkbox terpisah. Submit hanya aktif bila semua data dan consent valid. Tidak ada kewajiban menggulir panel tersembunyi untuk membuka checkbox. Receipt menampilkan referensi dan data utama yang tersimpan.

Plum/cream, Young Serif, Hanken Grotesk, logo resmi, lebar maksimum 600px dan mobile-first dipertahankan. Root mengarah ke /reservasi. Judul “Free Visit” serta biaya fitting dalam ketentuan tetap sesuai teks pengguna, tanpa perubahan makna.

## Persetujuan dan data

Empat consent: datang on time, konfirmasi WhatsApp, memahami ketersediaan stok, dan menyetujui seluruh syarat. Masing-masing disimpan sebagai boolean bersama terms_version **free-visit-2026-09-v2**, consented_at dari database dan timezone **Asia/Jakarta**. Tidak mengarang data atau consent untuk reservasi lama.

## Admin dan reminder

Admin terdaftar melalui Supabase Auth dapat mencari/filter, melihat informasi reservasi, consent dan audit. Transisi baru: pending → confirmed/cancelled; confirmed → completed/cancelled. Completed dan cancelled terminal. Tombol **Selesai fitting** hanya pada confirmed, dengan dialog konfirmasi; pengaman lama tetap melarang completed sebelum appointment dimulai. Data no_show historis dipertahankan tanpa menyediakan transisi baru ke status tersebut. Signup publik tetap nonaktif dan data pribadi dilindungi RLS.

**Laporan Reservasi** memfilter appointment date Asia/Jakarta: minggu ini (Senin–Minggu), bulan ini, bulan pilihan, atau rentang tanggal inklusif. Tersedia semua status/pending/confirmed/completed/cancelled, dengan total dan jumlah masing-masing status untuk hasil filter. No_show historis tetap ikut semua status dan ditampilkan terpisah bila ada agar total dapat direkonsiliasi.

**Export Excel** menghasilkan XLSX asli berisi sheet Ringkasan dan Reservasi, seluruh baris periode terpilih tanpa batas 100 hasil dashboard. Kolom mencakup referensi, jadwal WIB, identitas/WA, berat badan dan tinggi badan, tanggal acara, status reservasi/reminder, percobaan reminder, waktu dibuat dan perubahan status. Input customer berupa sel teks, tidak dieksekusi sebagai formula. Export tidak berisi consent, token, error internal atau audit actor. Hanya admin dengan session dan membership aktif yang dapat mengunduh.

Satu reminder H-2 per booking, maksimal tiga percobaan dengan mekanisme retry aman yang sudah ada. Appointment 15.00 → due_at 13.00. Jika booking dibuat setelah H-2 namun sebelum cutoff H-1, next_attempt_at adalah waktu booking agar cron berikutnya memprosesnya. Cancelled/completed/no_show tidak dikirim. Meta tanpa kredensial tidak menghasilkan sukses palsu.

## Asumsi

- “Informasi Rencana Acara” ditambahkan sebagai teks opsional karena daftar validasi pengguna tidak mewajibkannya; pilihan tanggal/unknown tetap wajib.
- Instagram tidak diminta pada formulir Free Visit baru; data historis tetap dipertahankan dan dapat dilihat admin.
- Semua hari terbuka; penutupan kalender oleh admin belum tersedia pada baseline.
- Tidak mengirim WhatsApp nyata, commit, push, PR atau deployment pada pekerjaan ini.

## Revisi September

Syarat 1–10 memakai teks 15px (sebelumnya 14px), justify dengan baris terakhir rata awal; kotak kuning dan isi ketentuan dipertahankan selain penggantian istilah Free Fitting menjadi Free Visit. Berat/tinggi ditampilkan dengan unit pada ringkasan, receipt, pesan WhatsApp admin, dashboard dan dua kolom Excel terpisah. Data lama tanpa ukuran tidak diisi secara buatan.

**Kirim Reminder WhatsApp** hanya aktif untuk pending/confirmed dengan nomor Indonesia valid. Membuka tab `wa.me` dengan jam WIB dan pesan yang disetujui; admin harus menekan kirim sendiri. Audit `reminder_opened_by_admin` bukan bukti pesan terkirim. Completed/cancelled tidak aktif. Reminder otomatis H-2 tetap memakai aturan sebelumnya.

Admin `lakuhattire@gmail.com` memakai akun Auth yang sudah terkonfirmasi dan membership public.admins. Login localhost telah dikonfirmasi pemilik. Admin lama dipertahankan. Cleanup percobaan harus berhenti jika asal data tidak dapat dipastikan; tidak menghapus customer nyata, akun/admin atau konfigurasi.
