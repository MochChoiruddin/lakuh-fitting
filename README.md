# Lakuh Fitting

Appointment Free Visit hari ini saja (Asia/Jakarta), 5 slot 11.00–15.00, dan admin minimal. Lihat [PRD](docs/01-PRD.md), [desain teknis](docs/02-TECHNICAL-DESIGN.md), dan [hasil verifikasi](docs/03-VERIFICATION.md).

```sh
npm ci
# Salin .env.example ke .env.local dan isi lewat saluran aman.
npm run dev
```

`/reservasi` untuk pelanggan, `/admin` untuk operator yang terdaftar. Tanpa environment Supabase, aplikasi menampilkan kegagalan aman dan tidak membuat receipt palsu.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:db
npm run test:concurrency
npm run test:secrets
```

Tes browser memakai Chromium Playwright, fixture API untuk alur booking, serta request nyata untuk proteksi route. Install browser dengan `PLAYWRIGHT_BROWSERS_PATH` diarahkan ke `node_modules/.cache/ms-playwright`, lalu `npx playwright install chromium`.

Tes database membutuhkan Supabase CLI login/link. Tes integrasi/concurrency memakai production localhost:3100 milik runner dengan .env.local dan project lakuh-fitting; jalankan node scripts/free-visit-acceptance.mjs saat masih ada slot hari ini sebelum cutoff. Jalankan pada project fitting yang dituju. Tes SQL melakukan rollback; tes concurrency membuat data sintetis sementara dan menghapusnya berdasarkan UUID khusus run. Jangan arahkan ke database aplikasi lain.

Migration: `npm run db:push`. Cron deployment nanti: `GET /api/cron/reminders` setiap menit dengan bearer `CRON_SECRET`. Provisioning admin, keamanan environment, template Meta, dan batas operasional dijelaskan dalam desain teknis.

## Revisi pelanggan September

Form baru meminta berat badan 20–300 kg dan tinggi badan 80–250 cm; lingkar dada hanya dipertahankan pada data historis. Receipt, WhatsApp admin, panel admin dan Excel menampilkan kedua ukuran baru. Syarat Free Visit berukuran 15px dan rata kanan-kiri.

Migration `20260929000100_client_revision.sql` harus diterapkan sebelum memakai kode revisi; status penerapan dan integrasi nyata ada di laporan verifikasi. Jangan menjalankan cleanup data lama tanpa memastikan seluruh target adalah data percobaan.

Admin memiliki tombol **Kirim Reminder WhatsApp** untuk pending/confirmed dengan nomor valid. Tombol membuka WhatsApp; admin tetap mengirim sendiri. Audit mencatat `reminder_opened_by_admin`, bukan pengiriman. Tidak memakai Cloud API atau mengubah status booking/reminder.

### Menambahkan admin dengan aman

Akun Auth terkonfirmasi `lakuhattire@gmail.com` sudah didaftarkan ke `public.admins` pada 29 September 2026 menggunakan UID akun yang ada, secara idempotent. Pemilik mengonfirmasi login localhost dan panel admin berhasil. Password/akun Auth tidak diubah. Prosedur berikut berlaku untuk penambahan admin berikutnya.

1. Di Supabase Dashboard project lakuh-fitting, pastikan Authentication → Sign In / Providers → Allow new users to sign up tetap nonaktif.
2. Pemilik membuat akun melalui Authentication → Users dengan email nyata dan password sementara yang ditetapkan secara aman. Jangan menaruh password pada SQL, source, chat, atau log. Jika akun sudah ada, gunakan akun yang sama.
3. Pastikan email terkonfirmasi dan akun tidak diblokir. Salin hanya UUID akun ke SQL Editor yang aksesnya terbatas.
4. Tambahkan membership menggunakan `insert into public.admins(user_id) values ('<UUID akun terkonfirmasi>') on conflict (user_id) do nothing;`. Jangan mengubah membership admin lama.
5. Pemilik menguji login `/admin` dan mengganti password sementara melalui prosedur akun yang aman. Uji session non-admin tetap 403; jangan menyimpan cookie/token sebagai artefak.

`npm run test:reports:live` menguji admin/manual reminder/Excel dengan fixture eksplisit dan cleanup di finally. URL WhatsApp diintersep agar tidak mengirim pesan. Uji worker global hanya pada database isolated; jangan dijalankan di Supabase shared.

Tes SQL revisi yang dapat dijalankan di luar jam booking: `npm run test:db:revision` (constraint/RLS/report, rollback). `npm run test:db` dan `npm run test:concurrency` tetap memerlukan slot hari ini sebelum cutoff. Setelah pukul 14.00 WIB, booking sukses/race harus dilaporkan BLOCKED dan diulang saat jadwal terbuka; jangan mengubah jam atau memalsukan availability.

## Buka / Tutup Free Visit per tanggal

Di /admin, pilih **Tanggal Free Visit (WIB)** lalu **Tutup Free Visit** atau **Buka kembali Free Visit**. Semua tanggal terbuka secara default; Minggu dan hari libur tidak ditutup otomatis. Penutupan menolak reservasi baru di database, termasuk submit dari formulir lama, tetapi reservasi serta reminder yang sudah ada tetap berlaku. Tangani pembatalannya secara terpisah bila diperlukan.

Migration: 20261001000100_manual_visit_closures.sql. Tes SQL: supabase/tests/visit-closures.sql (rollback, membutuhkan slot hari ini sebelum cutoff). Tes UI admin nyata dengan fixture tanggal tersendiri: node scripts/visit-closures-acceptance.mjs setelah production build.
