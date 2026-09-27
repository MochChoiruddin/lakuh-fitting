# Lakuh Fitting

Reservasi fitting dan admin minimal. Lihat [PRD](docs/01-PRD.md), [desain teknis](docs/02-TECHNICAL-DESIGN.md), dan [hasil verifikasi](docs/03-VERIFICATION.md).

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

Tes database dan concurrency membutuhkan Supabase CLI login/link. Jalankan pada project fitting yang dituju. Tes SQL melakukan rollback; tes concurrency membuat data sintetis sementara dan menghapusnya berdasarkan UUID khusus run. Jangan arahkan ke database aplikasi lain.

Migration: `npm run db:push`. Cron deployment nanti: `GET /api/cron/reminders` setiap menit dengan bearer `CRON_SECRET`. Provisioning admin, keamanan environment, template Meta, dan batas operasional dijelaskan dalam desain teknis.
