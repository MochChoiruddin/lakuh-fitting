# Desain teknis — Appointment Free Visit

## Arsitektur

Next.js App Router/TypeScript/Tailwind dan Supabase PostgreSQL/Auth. Browser → API localhost → RPC server-only. .env.local tetap ignored; service role/Meta/cron secret tidak masuk client. Panduan Next lokal dibaca sebelum perubahan. Konfigurasi sepuluh jam tetap lib/fitting-schedule.json melalui lib/schedule.mjs; fungsi dates kini hanya mengembalikan tanggal Jakarta hari ini.

## Data dan migration

Migration tambahan **20260927000300_free_visit.sql**, diterapkan pada lakuh-fitting. Migration 00100 dan 00200 tidak diubah. Kolom baru reservations:

- bust_circumference_cm numeric; event_plan text; event_date date; event_date_unknown boolean.
- consent_on_time, consent_whatsapp, consent_stock, consent_terms boolean.
- terms_version text, consented_at timestamptz, timezone text.

Kolom nullable untuk mempertahankan data lama tanpa memalsukan consent. CHECK constraint mewajibkan seluruh detail valid bila terms_version baru ada. Angka cm harus finite; tidak diberi rentang minimum/maksimum. event_date_unknown=true membutuhkan event_date=null; jika false, tanggal wajib dan tidak sebelum tanggal appointment di Jakarta. Admin menandai detail historis yang belum pernah dicatat.

RPC **book_free_visit(p_input jsonb)** hanya dapat dieksekusi service_role. Semua hak execute RPC book_fitting lama dicabut, termasuk service_role, sehingga endpoint lama tidak bisa melewati persyaratan baru. Availability hanya mengaktifkan hari ini dan slot yang memenuhi cutoff serta belum terisi; tanggal lain ditolak API dan tidak tersedia di RPC.

## Atomisitas dan idempotensi

RPC mengambil advisory transaction lock berdasarkan UUID key; payload baru mencakup data acara, lingkar dada, empat consent dan versi syarat. Replay payload sama mengembalikan receipt yang sama sebelum evaluasi ulang cutoff; payload berbeda ditolak. Unique partial index appointment tetap menjamin satu booking non-cancelled. Insert reservasi, audit dan satu reminder dilakukan dalam transaksi yang sama. Consent dan timestamp/timezone ditetapkan server, bukan jam browser.

API memvalidasi nama, nomor Indonesia, angka finite, tanggal kalender nyata, pilihan known/unknown, boolean consent dan versi terms. Field errors dikembalikan dekat input terkait. Database memvalidasi ulang secara independen dan memutuskan apakah appointment masih hari ini/lolos cutoff. Body booking dibatasi 16 KiB agar cukup untuk 2.000 karakter Unicode acara; endpoint lain tetap 4 KiB. Free text acara dibatasi 2.000 karakter. Rate limit tetap berlaku. Rate booking tetap 15/10 menit, availability 180/10 menit dan login 10/10 menit; limit global butik berdasarkan salted key.

## UI dan admin

lib/free-visit.ts menyimpan konten persis serta versi dan nama keempat consent. Form tiga tahap: waktu, data acara, syarat. Tidak ada pemilih tanggal kunjungan; perpindahan hari diperiksa secara berkala dengan Asia/Jakarta. Unknown event date langsung menghapus nilai date. Submit hanya aktif bila data lengkap dan empat consent true. Setelah hasil network tidak pasti, payload tidak dapat diedit dan key dipertahankan untuk retry aman.

Receipt berasal dari hasil RPC dan berisi data utama termasuk lingkar dada dan tanggal/status acara. API admin hanya mengembalikan data setelah auth dan membership; list/detail kartu admin menampilkan field baru dan empat consent. Tombol WhatsApp receipt tetap terpisah dari provider reminder.

## Laporan dan XLSX

Migration **20260928000100_admin_reports.sql** menambah RPC reservation_report(date,date,text) dan memperketat change_status. Migration lama tidak diubah. Report bersifat STABLE/SECURITY INVOKER, memverifikasi public.is_admin(), tetap tunduk pada RLS, dan execute hanya diberikan kepada authenticated. Service role tidak dipakai oleh endpoint laporan/export.

lib/report.ts memvalidasi parameter period/month/start/end/status, menolak tanggal tidak nyata, urutan terbalik, status asing dan parameter duplikat. Minggu/bulan ditentukan menurut tanggal Asia/Jakarta. SQL membatasi appointment_at dengan >= awal hari WIB dan < awal hari setelah tanggal akhir, sehingga seluruh tanggal akhir termasuk sampai presisi mikrodetik. Satu agregasi SQL menghasilkan counts dan array field yang diizinkan dalam snapshot yang sama. Satu hasil JSON menghindari pemotongan pagination PostgREST (teruji 1.205 baris). Tidak ada LIMIT 100 pada laporan.

GET /api/admin/reports mengembalikan periode dan counts; GET /api/admin/reports/export mengembalikan XLSX attachment, private/no-store dan nosniff. Keduanya memanggil admin() sebelum parsing/query: tanpa session 401, non-admin 403, parameter invalid 400. lib/report-workbook.ts bertanda server-only dan memakai ExcelJS untuk sheet Ringkasan/Reservasi, bold header, freeze baris pertama, filter, lebar kolom dan wrap text. Customer string hanya ditulis sebagai string cell, tidak pernah objek formula. Field internal tidak disalin. Nama file lakuh-fitting-{periode}-{tanggal-export-WIB}.xlsx; periode bulanan menyertakan YYYY-MM.

ExcelJS 4.4.0 hanya digunakan server. Override uuid 11.1.1 mempertahankan API CommonJS v4 yang dipakai ExcelJS dan menghindari advisory pada versi transitif lama; npm audit --omit=dev bersih setelah override. Uji workbook membuka hasil export menggunakan ExcelJS dan memeriksa nilai/tipe sel, bukan hanya ekstensi file.

## Authorization dan reminder

Lima tabel tetap RLS deny-by-default; tidak ada perubahan policy/promosi admin. Signup remote tetap nonaktif. Status baru: pending → confirmed/cancelled; confirmed → cancelled/completed. Completed hanya setelah appointment dimulai; completed/cancelled serta no_show historis tidak dapat berubah ke status lain. RPC mengunci reservasi, mengubah status/timestamp, menulis audit booking ID/actor/old/new/time, dan membatalkan job scheduled/processing dalam transaksi sama. Tidak membuat reminder baru. Unique index dan availability tetap menghitung semua status selain cancelled sebagai penghuni slot.

Worker reminder dan provider tidak diubah. due_at = appointment_at - 2 jam; next_attempt_at = greatest(now(),due_at). Claim FOR UPDATE SKIP LOCKED dan token claim mencegah job yang sama diambil paralel. Worker mengunci reservasi lalu job, memeriksa status lagi dan tidak mengirim untuk status terminal. Tanpa konfigurasi Meta/DB: HTTP 503, processed=0, job tidak diubah. Maksimal tiga percobaan; explicit 429 memakai backoff 60/300 detik; hasil ambigu gagal aman tanpa resend otomatis.

## Pengujian dan operasi

- Unit: hari ini saja, batas cutoff, nomor, field baru, tanggal dan consent; regresi HTTP/worker/provider.
- SQL remote transaksi rollback: validation/constraints, privilege RPC, RLS, idempotensi, kapasitas, transisi/audit, H-2/cancel dan laporan 1.205 baris. Claim/housekeeping global hanya boleh diuji isolated.
- Browser mobile: teks persis, warna kotak, semua field, consent gating, receipt, error/retry, screenshot 360/390/430 dan tanpa overflow.
- scripts/free-visit-acceptance.mjs: server production milik runner pada localhost:3100 dengan .env.local dan Supabase nyata; dua booking UI (known/unknown), admin, race, replay, no-Meta dan cleanup. Claim shared sengaja SKIPPED; worker isolated masih BLOCKED Docker/WSL. Entry point final-gate/local-acceptance/test-concurrency mengarah ke runner terkini.
- scripts/report-acceptance.mjs: server production localhost:3101, session admin nyata, periode fixture historis yang diverifikasi kosong, 1.205 ID fixture eksplisit, transisi melalui UI/HTTP, audit, workbook lengkap, formula-as-text, endpoint authorization, screenshot mobile dan cleanup/readback. Tidak mengambil reminder global.

Run live membutuhkan setidaknya satu slot hari ini yang masih terbuka sebelum cutoff. Jika tidak ada, tes harus gagal/blocked, tidak boleh memundurkan jam atau memalsukan availability. Hindari menjalankannya berulang dalam jendela rate limit. Seluruh fixture dihapus berdasarkan UUID sendiri, tanpa menghapus reservasi nyata. Tidak ada pesan dikirim, deployment atau scheduler diaktifkan.
