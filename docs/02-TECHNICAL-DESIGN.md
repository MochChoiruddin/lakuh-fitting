# Desain teknis

## Arsitektur

Next.js 16.3.6 App Router, TypeScript, Tailwind 4; Supabase PostgreSQL/Auth. Panduan Route Handlers dan font dari `node_modules/next/dist/docs/` dibaca sebelum implementasi. Baseline berupa starter Next.js; logo pengguna sudah untracked dan dipertahankan.

Browser → Route Handler → Supabase RPC. `service_role`, provider Meta, dan PostgreSQL client hanya berada pada modul `server-only`. Admin menggunakan cookie HttpOnly/SameSite dan `auth.getUser()`; setiap request memeriksa membership. Tidak ada PII di availability atau receipt API selain jadwal/status/referensi yang dikembalikan kepada pembuatnya.

## Database dan concurrency

Migration `20260927000100_fitting.sql` membuat `admins`, `reservations`, `reservation_audit`, `reminder_jobs`, `rate_limits`. Semua RLS aktif. Anon tidak memiliki akses tabel/RPC; authenticated hanya membaca melalui policy admin. Penulisan status melalui RPC yang memeriksa admin; tidak ada hak promosi diri.

`book_fitting` mengunci hash kunci idempotensi, membandingkan payload saat replay, memvalidasi jadwal dengan waktu database, dan menulis reservasi/audit/reminder dalam satu transaksi. Unique partial index appointment mencegah dua booking non-cancelled. Replay menghasilkan receipt sama; perubahan payload ditolak.

Rate limit database atomik per scope selama 10 menit: booking 15, login 10, availability 180. Limit dibagi seluruh butik agar tidak bisa dilewati lewat header IP palsu. Kapasitas dapat disesuaikan saat trafik nyata diketahui. CSRF diperiksa lewat exact Origin pada mutation. Error publik generik; tidak mencatat payload atau token.

## Protokol worker

1. Cron `GET /api/cron/reminders`, header `Authorization: Bearer <CRON_SECRET>`; perbandingan constant-time.
2. Tanpa konfigurasi provider atau `DATABASE_URL`: HTTP 503, job tidak diklaim, attempt tidak bertambah.
3. RPC claim memakai `FOR UPDATE SKIP LOCKED`, token claim unik, attempt increment yang sudah commit. Batch lima job.
4. Transaksi PostgreSQL worker mengunci reservasi lalu job; urutan sama dengan perubahan status. Periksa token, status dan waktu lagi sebelum panggilan provider. Cancellation yang telah commit mencegah pengiriman; cancellation yang datang setelah send dimulai menunggu transaksi selesai.
5. Provider timeout 15 detik. HTTP sukses dengan message ID → sent (diterima provider, bukan bukti delivered). HTTP 429 dengan error eksplisit → backoff 60/300 detik, maksimal tiga percobaan. Penolakan permanen → failed.
6. Timeout/5xx/respons tanpa ID → failed `DELIVERY_UNKNOWN`, tanpa retry otomatis. Worker crash meninggalkan processing; setelah lima menit menjadi failed. Ini mencegah pengiriman ulang saat penerimaan provider tidak dapat dipastikan. Tidak mengklaim exactly-once delivery lintas database dan Meta.

Gunakan cron tiap menit pada deployment nanti, dengan toleransi sekitar satu menit + latensi/antrean. Belum ada deployment atau scheduler yang diaktifkan. Batasi concurrency/timeout deployment sesuai `maxDuration=120`. `DATABASE_URL` harus koneksi SSL server yang mendukung transaksi; jangan kirim ke browser. Kredensial DB dibutuhkan untuk mempertahankan lock sepanjang pengiriman eksternal.

## Konfigurasi dan operasi

Salin `.env.example` ke `.env.local` lalu isi secara aman. Semua nilai contoh kosong. URL dan anon key Supabase boleh publik; service role, DATABASE_URL, salt, cron secret dan kredensial Meta hanya server. `WHATSAPP_GRAPH_VERSION` adalah versi Graph API yang masih didukung oleh akun, misalnya format `vNN.0`, dan harus ditentukan saat setup.

Remote yang digunakan: project **lakuh-fitting**, ref `bwxtvtuttunedomahnds`; tidak mengakses project lama. Migration diterapkan lewat Supabase CLI. Signup remote dinonaktifkan melalui config push terbatas `auth.enable_signup=false`, tanpa mereset konfigurasi lain.

Provisioning admin: operator membuat user melalui Supabase Dashboard Authentication atau Admin API server; lalu operator database menambahkan UUID user tersebut ke `public.admins(user_id)`. Tidak menyediakan endpoint publik pembuatan admin. Identitas/kredensial admin operasional belum diberikan; tidak dibuat akun dengan password bawaan. Session kedaluwarsa meminta login lagi.

## Template Meta

Template yang disetujui Meta harus mempunyai tiga parameter body berurutan: nama, tanggal Indonesia, jam WIB.

> Halo Kak {{1}}, kami ingin mengingatkan bahwa Kakak memiliki jadwal appointment di butik kami pada {{2}} pukul {{3}}. Apakah Kakak berkenan hadir sesuai jadwal tersebut? Mohon konfirmasinya ya, Kak. Terima kasih 🤍

Environment wajib provider: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`; tambahan versi API `WHATSAPP_GRAPH_VERSION`. Endpoint menggunakan `graph.facebook.com/.../messages`, tidak memakai WhatsApp Web/library tidak resmi. Tidak ada pesan sungguhan dikirim selama pengujian.

Referensi: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [pengaturan Auth](https://supabase.com/docs/guides/auth/general-configuration), [Meta Messages API](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages). Halaman Meta memberi HTTP 429 saat pemeriksaan; template dan versi aktif tetap perlu diverifikasi pada akun Meta.

## Jadwal 10 slot

`lib/fitting-schedule.json` menjadi konfigurasi bersama melalui `lib/schedule.mjs` untuk UI, validasi server, dan test. Migration tambahan `20260927000200_ten_fitting_slots.sql` memperluas range database menjadi 11.00–20.00. RPC booking memakai slot dari fungsi availability untuk validasi sehingga tidak menduplikasi daftar jam di SQL. Test live membandingkan seluruh slot database dengan konfigurasi aplikasi. Migration awal tidak diubah.

Cutoff 60 menit hanya dievaluasi untuk hari ini menurut Asia/Jakarta; tanggal mendatang tidak terpengaruh cutoff. Kapasitas tetap satu. Admin menampilkan timestamp appointment tanpa daftar jam tersendiri. Worker tetap menghitung H-2 dari timestamp: booking 20.00 menghasilkan reminder 18.00 WIB. Kalender penutupan slot oleh admin belum ada pada baseline; perubahan ini tidak menambahkan fitur tersebut.
