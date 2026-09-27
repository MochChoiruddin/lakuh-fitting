# Lakuh Fitting — PRD

## Tujuan dan scope

Reservasi sesi fitting personal dengan pengalaman mobile yang hangat dan elegan, serta admin minimal untuk mengelola kunjungan. Tidak ada katalog, produk, pembayaran, checkout, atau registrasi publik.

## Pengalaman publik

- `/` menuju `/reservasi`. Tiga tahap: jadwal → data diri → konfirmasi, lalu receipt bernomor referensi.
- Palet: background `#291D21`, card `#332429`, accent `#91304E`, cream `#F7EFE9`, muted `#CBB8B6`. Young Serif + Hanken Grotesk. Logo asli `public/brand/logo-lakuh.png`.
- Hari ini sampai hari ke-30 inklusif di Asia/Jakarta; 10 slot 11.00–20.00 setiap jam. Cutoff 60 menit hanya pada tanggal hari ini. Tanggal mendatang tersedia selama slot belum dipesan. Jam 20.00 adalah waktu mulai appointment. Pilihan jam menggunakan grid dua kolom pada mobile.
- Nama, Instagram opsional, WhatsApp Indonesia dinormalisasi ke `62`. Dua consent wajib: kebijakan reservasi dan reminder WhatsApp.
- Kegagalan layanan tidak boleh menampilkan slot atau receipt palsu. Retry setelah hasil tidak pasti memakai kunci dan payload yang sama.

## Admin

Supabase Auth dengan signup publik nonaktif. Keanggotaan tabel `admins` menentukan akses. Cari nama/WA/referensi, filter tanggal/status, lihat reminder dan timestamp audit.

Transisi: `pending → confirmed/cancelled`; `confirmed → cancelled/completed/no_show`. Completed/no_show hanya sejak appointment dimulai. Status akhir tidak dibuka kembali. Pembatalan membebaskan slot.

## Reminder

Satu job H-2 per reservasi. Status scheduled, processing, sent, failed, cancelled. Maksimum tiga percobaan; pembatalan dan status akhir menghentikan job yang belum terkirim. Pengiriman menggunakan template resmi WhatsApp Business Cloud API.

## Asumsi produk

- Kapasitas satu reservasi per slot; semua hari terbuka. Tidak ada kalender libur dalam scope.
- Booking awal pending; reminder boleh dikirim untuk pending dan confirmed.
- Booking antara H-2 dan H-1 mendapat reminder pada cron berikutnya. Setelah waktu appointment lewat, reminder dibatalkan.
- Konfirmasi kehadiran lewat balasan WhatsApp ditangani tim secara manual. Webhook inbox tidak termasuk scope.
- Referensi desain visual tidak dilampirkan; implementasi mengikuti palet, font, dan arahan dark plum yang diberikan.
- Kontak butik, kebijakan retensi data, dan identitas admin operasional perlu ditetapkan pemilik sebelum peluncuran.
