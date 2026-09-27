# Verifikasi 10 slot — 27 September 2026

## Hasil

**PASS** untuk perubahan jadwal 11.00–20.00, kapasitas satu reservasi per slot. Project remote: **lakuh-fitting** (`bwxtvtuttunedomahnds`). Migration tambahan `20260927000200_ten_fitting_slots.sql` sudah diterapkan; versi `00100` dan `00200` cocok local/remote. Migration awal tidak diubah.

## Bukti integrasi Supabase nyata

Runner `scripts/final-gate.mjs` memakai production server lokal port 3100, Chromium mobile 390×844, API asli dan Supabase remote. Tidak ada intercept/mock availability atau booking. Kredensial hanya berada dalam memori proses dan environment server sementara.

| Pemeriksaan | Hasil dan bukti |
| --- | --- |
| Jadwal besok | PASS — **28 September 2026**, sepuluh slot 11.00, 12.00, 13.00, 14.00, 15.00, 16.00, 17.00, 18.00, 19.00, 20.00. Respons API identik RPC dan konfigurasi bersama. |
| Slot dapat dipilih | PASS — **seluruh sepuluh tombol diklik**, masing-masing `aria-pressed=true` dan CTA Lanjutkan enabled. Grid terukur dua kolom; tidak ada overflow mobile. Bukti bukan sekadar tombol terlihat. |
| Booking UI 20.00 | PASS — alur tiga tahap menghasilkan HTTP 201, receipt/reference dan record Supabase pada 20.00 WIB. Nama, Instagram, WA format 62, kedua consent, timestamp/version, status pending dan referensi sesuai. |
| Idempotensi | PASS — dua replay paralel mendapat referensi sama; tetap satu booking/job. Key sama dengan payload berbeda ditolak 409. |
| Concurrency slot terakhir | PASS — UI mengisi 20.00; delapan booking mengisi 11.00–18.00. Dua request bersamaan ke 19.00 menghasilkan satu 201 dan satu 409. Total sepuluh booking dan sepuluh reminder. Sembilan booking menerima Instagram kosong. |
| H-2 | PASS — semua job tepat appointment dikurangi dua jam, unik per booking; SQL membuktikan appointment 20.00 → reminder 18.00 WIB. Provider unit test memformat 20.00 dengan benar tanpa network. |
| Admin | PASS — login Auth/UI nyata, API membaca sepuluh booking; detail booking UI menampilkan 20.00 WIB. Pending → confirmed → cancelled berhasil, audit tercatat, reminder dibatalkan dan slot tersedia lagi. Completed sebelum appointment ditolak. |
| Authorization/RLS | PASS — signup publik nonaktif; anon/non-admin tidak membaca PII pada lima tabel. Direct writes dan RPC internal ditolak. Pencabutan membership admin langsung mencabut akses API dan RLS. |
| Worker paralel | PASS — dua request claim RPC independen hanya memperoleh satu job sekali; attempt_count=1. |
| Worker tanpa Meta | PASS — dua cron terautentikasi mendapat 503, configured=false, processed=0; tidak ada sent/provider ID atau perubahan attempt. Cron tanpa secret mendapat 401. |
| Cleanup | PASS — seluruh booking, reminder, audit, membership, Auth user dan rate limit sintetis run dibersihkan; diverifikasi kembali berdasarkan ID/key run. Tes SQL memakai rollback. |
| Secret | PASS — scan nilai runtime persis pada source, kandidat Git, client bundle dan artefak; scan pola secret juga lulus. Tidak menyimpan token, cookie, password, trace, HAR atau `.env.local`. |

Runner sengaja mensyaratkan besok kosong untuk race seluruh kapasitas. Jika ada reservasi nyata, runner berhenti tanpa menimpa atau menghapusnya. Claim test juga berhenti bila ada job lain due/processing. Semua data sintetis dibersihkan melalui `finally`.

## Pengujian otomatis

| Perintah | Hasil |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — seluruh route production |
| `npm test` | PASS — 46 unit/HTTP/worker/provider tests; sepuluh jam diterima, jam 21 ditolak, cutoff tepat 60 menit dan lewat 1 ms, besok bebas cutoff |
| `npm run test:db` | PASS — SQL remote: sepuluh slot, cutoff hari ini, batas tanggal, booking 20/reminder 18, jam 21 ditolak, idempotensi, unique constraint, RLS, transisi, cancellation, claim/stale recovery, rate limit |
| `npm run test:browser` | PASS — 8 tes; mobile 360/390/430px, dua kolom, 20.00 dapat dipilih, target sentuh, tanpa overflow, state/error, receipt, desktop/fokus; golden data-step tidak diubah |
| `node scripts/final-gate.mjs` | PASS — 14 kelompok pemeriksaan nyata termasuk cleanup dan scan |
| `npm run test:secrets` | PASS |
| `git diff --check` | PASS |
| `supabase migration list --linked` | PASS — kedua versi cocok |

Artefak lokal yang diabaikan Git:

- `test-results/final-gate/result.json`: waktu run, 14 hasil, cleanup dan zero WhatsApp requests.
- `test-results/final-gate/live-mobile-tomorrow.png`: sepuluh slot besok, 20.00 terpilih.
- `test-results/final-gate/live-mobile-receipt.png`: receipt booking UI asli; record telah dibersihkan.
- `test-results/`: screenshot mobile/desktop suite regresi.

## File perubahan jadwal

- `lib/fitting-schedule.json`, `lib/schedule.mjs`, `lib/booking.ts`: konfigurasi bersama dan cutoff khusus hari ini.
- `app/reservasi/reservation.css`, `app/reservasi/reservation-form.tsx`: dua kolom dan keterangan cutoff hari ini.
- `supabase/migrations/20260927000200_ten_fitting_slots.sql`: perluasan range RPC; booking memvalidasi jam melalui availability.
- `tests/booking.test.ts`, `tests/whatsapp.test.ts`, kedua `tests/browser/reservation*.spec.ts`, `supabase/tests/fitting.sql`, `scripts/final-gate.mjs`, `scripts/test-concurrency.mjs`: cakupan jadwal baru.
- Ketiga dokumen `docs/01-PRD.md`, `docs/02-TECHNICAL-DESIGN.md`, `docs/03-VERIFICATION.md`.

API availability/booking, admin dan worker sudah memakai konfigurasi/RPC/timestamp sehingga tidak membutuhkan daftar jam tambahan. Logika auth, kapasitas, idempotensi, retry dan provider dipertahankan.

## Asumsi dan batas verifikasi

- 20.00 adalah **waktu mulai appointment**. Semua hari terbuka; baseline belum memiliki kalender penutupan slot oleh admin. Fitur tersebut tidak ditambahkan dalam perubahan jam ini.
- **Meta nyata belum diuji**, sesuai larangan mengirim WhatsApp. Masih diperlukan kredensial server, nomor pengirim terverifikasi, template approved, bahasa dan versi Graph API. Hasil `sent` tidak diklaim.
- Environment operasional termasuk koneksi PostgreSQL SSL, cron tiap menit dan akun admin operasional perlu dikonfigurasi saat peluncuran diotorisasi.
- Tidak ada commit, deployment atau pengiriman WhatsApp sungguhan.
