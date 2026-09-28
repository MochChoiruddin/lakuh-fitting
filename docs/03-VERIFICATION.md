# Verifikasi — Appointment Free Visit

## Laporan admin, completed dan Export Excel — 28 September 2026

**PASS untuk scope laporan/export/completed.** Migration **20260928000100_admin_reports.sql** diterapkan ke lakuh-fitting setelah pengguna secara eksplisit menyetujui “Izinkan migration database saja”. Aplikasi tidak dideploy. Migration lama, availability, index slot, worker dan UI publik/WhatsApp receipt tidak diubah.

Completed sudah ada pada baseline. Migration baru membatasi transisi menjadi pending → confirmed/cancelled dan confirmed → completed/cancelled, mempertahankan pengaman sebelum appointment dimulai. Completed/cancelled terminal; no_show historis dipertahankan tetapi tidak dapat menjadi tujuan transisi baru. Tombol “Selesai fitting” hanya untuk confirmed dan meminta konfirmasi. Audit mencatat booking ID, old/new status, admin actor dan waktu. Job scheduled/processing dibatalkan saat completed; tidak membuat job baru.

### Bukti dan hasil

| Check | Hasil |
| --- | --- |
| Lint / typecheck / production build | PASS |
| Seluruh unit test | PASS — 66 tes, termasuk batas Senin/minggu, pergantian bulan WIB, leap year, parameter invalid dan workbook |
| Database/RLS: fitting.sql + reports.sql | PASS — Supabase nyata, transaksi rollback; 1.205 baris, validasi, privilege, non-admin/revoked admin, audit/terminal/reminder |
| Seluruh browser regresi publik | PASS — 16 tes; tombol WhatsApp receipt dan snapshot lama tetap lulus |
| npm run test:reports:live | PASS — enam kelompok pemeriksaan melalui production localhost:3101 → Supabase nyata |
| Export authorization HTTP | PASS — tanpa cookie 401, session authenticated setelah membership dicabut 403, status/periode invalid 400 |
| Admin UI completed | PASS — dismiss dialog tidak mengubah DB; accept menghasilkan 200, persisted completed, audit actor/old/new/time dan reminder cancelled |
| Terminal dan pending langsung completed | PASS — HTTP 409; completed/cancelled tidak kembali pending/confirmed; SQL juga memeriksa seluruh transisi terlarang |
| Export seluruh data | PASS — workbook hasil klik UI memiliki 1.205 data row (1.206 termasuk header), 13 kolom dan dua sheet; setiap status berhasil diekspor |
| XLSX / formula injection | PASS — dibuka kembali sebagai workbook; customer =,+,-,@ tersimpan bertipe string, formula undefined; header bold/freeze/filter terverifikasi |
| PII dan secret | PASS — hanya 13 kolom yang diminta; tidak berisi consent, token, cookie, service key, safe_error atau actor audit; exact runtime-secret scan source/client/artefak lulus |
| Mobile laporan | PASS — 360/390/430px tanpa overflow, export ≥44px; screenshot diperiksa secara visual |
| Error export | PASS — pesan kegagalan ditampilkan; hanya skenario error ini yang diintersep, unduhan sukses non-mocked |
| Cleanup | PASS — seluruh 1.205 ID reservasi fixture, child job/audit, admin/Auth dan rate key sendiri dihapus/readback; tes SQL rollback |
| Secret pattern scan / git diff --check | PASS |
| npm audit --omit=dev | PASS — 0 vulnerability setelah override uuid transitif ExcelJS |
| Worker isolated | Tetap BLOCKED historis Docker/WSL; tidak diklaim PASS |
| Global worker claim shared | Tidak dijalankan |

Run live selesai **13.41 WIB**, checkedAt **2026-09-28T06:41:24Z**, cleanup=true. Fixture ditempatkan pada Januari 1902 setelah memastikan periode itu kosong; tidak mengubah booking aktual, termasuk reservasi yang sebelumnya memblokir slot 14.00. Nomor/nama fixture tidak dicetak ke log. Tidak mengirim WhatsApp.

### Perilaku laporan

Semua periode memakai appointment_at Asia/Jakarta, bukan created_at. Minggu Senin–Minggu; bulan kalender; rentang inklusif memakai batas SQL sebelum hari berikutnya. Filter status diterapkan pada jumlah dan export. Data no_show historis tetap masuk “Semua status”; jumlahnya ditampilkan tambahan bila ada supaya total konsisten. Report RPC mengagregasi satu snapshot JSON, sehingga tidak dibatasi 100 baris dashboard atau 1.000 row PostgREST.

ExcelJS berjalan server-only. File bernama lakuh-fitting-{periode}-{tanggal-export}.xlsx; contoh bulanan: lakuh-fitting-bulanan-2026-09-2026-09-28.xlsx. Worksheet Ringkasan mencatat periode/filter, waktu export WIB dan jumlah per status. Worksheet Reservasi memuat 13 kolom sesuai permintaan, nomor WA sebagai teks, tanggal Indonesia dan jam WIB. Tidak ada formula yang dibuat dari input customer.

### Artefak dan file berubah

Artefak ignored: `test-results/admin-reports/result.json`, `synthetic-report.xlsx`, `report-360.png`, `report-390.png`, `report-430.png`. Workbook berisi data sintetis saja.

File khusus perubahan ini:

- app/admin/panel.tsx; app/admin/reports.tsx; app/admin/reports.css
- app/api/admin/reports/route.ts; app/api/admin/reports/export/route.ts
- lib/report.ts; lib/report-server.ts; lib/report-workbook.ts
- supabase/migrations/20260928000100_admin_reports.sql; supabase/tests/reports.sql
- tests/reports.test.ts; scripts/report-acceptance.mjs
- package.json; package-lock.json (ExcelJS, override uuid, perintah tes)
- docs/01-PRD.md; docs/02-TECHNICAL-DESIGN.md; docs/03-VERIFICATION.md

Tidak ada commit, push, PR, deployment aplikasi, atau pesan WhatsApp nyata. Penerapan migration database saja sudah diizinkan dan selesai.

## Receipt WhatsApp Admin — 28 September 2026

**PASS untuk scope tombol receipt. Final gate worker tetap BLOCKED — Docker/WSL unavailable; tidak dijalankan ulang atau diklaim PASS.**

Tombol “Kirim ke WhatsApp Admin” tampil tepat di bawah “Simpan / cetak bukti”, hanya pada cabang receipt sukses. URL tujuan adalah `https://wa.me/6282231379003?text={encodeURIComponent(pesan)}`. Anchor memakai target=_blank dan rel=noopener noreferrer. Tombol membuka percakapan saja; teks pendamping menjelaskan bahwa customer masih harus mengirim pesan sendiri.

Pesan disusun dengan allowlist field dari receipt respons booking: nama, nomor WhatsApp ternormalisasi, tanggal/jam kunjungan Asia/Jakarta, lingkar dada, tanggal acara dalam bahasa Indonesia atau “Belum memiliki tanggal acara pasti”, referensi publik, dan teks status “Menunggu konfirmasi”. Tidak memakai state input, UUID internal, consent, cookie, token, atau kredensial. Tidak memanggil Cloud API atau mengubah status reminder.

### Bukti browser dan responsive

Enam skenario baru mencakup 360/390/430px × tanggal acara diketahui/belum pasti. Tes memakai respons API sintetis yang sengaja berbeda dari input formulir untuk membuktikan tautan berasal dari receipt. Tombol tidak tampil sebelum submit atau setelah API 503; tampil setelah respons 201. Seluruh template, encoding karakter &, +, emoji dan newline, nomor tujuan, field, target/rel, dan absennya field internal diperiksa. Klik popup diintersep sebelum koneksi eksternal; tidak mengirim WhatsApp.

Kedua tombol selebar receipt, tinggi tombol WhatsApp minimal 48px, jarak 12px, focus keyboard jelas. Nama panjang tanpa spasi, nomor panjang, tanggal acara dan referensi tetap di dalam card; tidak ada horizontal overflow pada ketiga viewport. Enam screenshot terbaru diperiksa secara visual: teks wrap, tombol utuh, urutan dan jarak konsisten. Baseline screenshot lama tidak diubah. Pengujian menggunakan mobile Chromium/iPhone emulation, bukan aplikasi Instagram atau WebView perangkat fisik; kompatibilitas Instagram nyata belum diverifikasi.

Screenshot (path relatif repository, ignored):

- `test-results/receipt-whatsapp-receipt-WhatsApp-360px-known/receipt-360-known.png`
- `test-results/receipt-whatsapp-receipt-WhatsApp-390px-known/receipt-390-known.png`
- `test-results/receipt-whatsapp-receipt-WhatsApp-430px-known/receipt-430-known.png`
- Varian tanpa tanggal berada di folder sepadan `*-unknown`, nama `receipt-{width}-unknown.png`.

| Verifikasi | Hasil |
| --- | --- |
| Lint | PASS |
| Typecheck | PASS |
| Production build | PASS |
| Seluruh unit test | PASS, 51 tes |
| Seluruh browser test | PASS, 16 tes (10 regresi + 6 receipt) |
| Secret scan | PASS |
| Worker isolated | BLOCKED historis; tidak dijalankan pada pekerjaan ini |
| Shared worker claim | Tidak dijalankan |

File berubah khusus scope ini: `app/reservasi/reservation-form.tsx`, `app/reservasi/reservation.css`, `lib/receipt-whatsapp.ts` (baru), `tests/browser/receipt-whatsapp.spec.ts` (baru), `docs/03-VERIFICATION.md`. Tidak mengubah booking/API/database/migration, reminder H-2, authorization/RLS atau implementasi final-gate. Tidak ada data Supabase yang dibuat untuk tes receipt ini, WhatsApp sungguhan, commit, push, PR, atau deployment.

## Resolusi review — 28 September 2026, 08.13 WIB

**Final gate: BLOCKED, bukan PASS keseluruhan.** Dua belas kelompok live PASS, satu SKIPPED (claim shared sengaja tidak dijalankan), satu BLOCKED (database worker isolated belum dapat dimulai). Exit code gate tetap 1 saat isolated test terblokir. Bagian ini menggantikan kesimpulan review dan implementasi historis di bawah.

### Resolusi temuan

- **P1, isolasi worker:** runner shared tidak lagi memanggil claim_reminders, baik sebagai service role maupun dalam negative test role. Preflight kosong tidak dianggap aman karena job pengguna bisa tiba sesudah pemeriksaan. Tes SQL shared juga tidak lagi menggeser semua job scheduled atau menjalankan housekeeping global. Tidak ada parameter test-only atau perubahan pada RPC produksi. Tes parallel claim, stale processing dan RPC global dipindah ke scripts/isolated-worker.mjs: container PostgreSQL 17 baru per run, tanpa port host, network none, migration produksi diterapkan verbatim. Bootstrap hanya menyediakan role/Auth contract PostgreSQL; ini bukan tes layanan Supabase Auth isolated. Eksekusi isolated masih **BLOCKED**.
- **P2, authorization/RLS:** Data API nyata menguji read terlarang dan INSERT/UPDATE/DELETE pada lima tabel, untuk anon/non-admin; larangan write juga diuji pada admin authenticated. Write wajib menghasilkan SQLSTATE 42501, sehingga pelanggaran constraint tidak bisa dianggap bukti authorization. Query read dibatasi ke ID fixture. SQL remote memeriksa privilege seluruh RPC privat dan write tabel tanpa memanggil RPC global yang berbahaya bila grant regresi. Invocation negatif claim/rate berada di isolated suite dan belum berjalan.
- **P2, status admin HTTP:** login UI menghasilkan cookie HttpOnly nyata. APIRequestContext browser memakai cookie tersebut untuk PATCH, tanpa RPC pengganti. Terverifikasi: tanpa cookie 401; invalid id/status 400; perubahan valid 200/ok; status DB; audit actor, old/new status dan timestamp; premature completed/no_show serta transisi terminal ditolak 409. Setelah membership dicabut, session tetap authenticated tetapi bukan admin: GET/PATCH 403 dan RLS kosong. Login akun non-admin terpisah juga 403.

### Keselamatan fixture dan server

Setiap run memiliki marker UUID, idempotency key eksplisit, daftar reservation ID, Auth user ID dan rate key sendiri. Penemuan row lewat key memverifikasi marker sebelum mendaftarkan ID; ketidakcocokan menghentikan operasi. Cleanup dalam finally hanya menghapus berdasarkan ID tersebut (child job/audit berdasarkan reservation_id milik fixture), lalu membaca ulang untuk memastikan kosong. Tidak memakai wildcard nama/telepon. Auth user yang dihapus diverifikasi tidak ditemukan. Bucket rate limit server menggunakan salt acak per run; key diketahui dan dibersihkan. Test SQL memakai UUID dan rollback.

Gate memulai server production miliknya pada localhost:3100, memakai .env.local untuk Supabase lakuh-fitting dan mengosongkan empat variabel Meta pada child process. Port yang sudah dipakai menyebabkan fail-fast; gate tidak menghubungi cron milik server yang environment-nya tidak diketahui. Child stdout/stderr tidak ditulis ke log. Server dihentikan dalam finally. Tidak ada token/session dicetak. Dashboard admin nyata tetap menjalankan query UI normal yang dibatasi API; respons PII tidak dimasukkan ke laporan/artefak.

### Matriks origin/develop → pengganti

Baseline: origin/develop, 62937f26b61f9e1afae5abe5cc16b68b36838651, scripts/final-gate.mjs sebelum refactor. Lokasi memakai nama fungsi atau stage agar tetap dapat dicari setelah formatting.

| Old check | Lokasi pengganti baru | Hasil |
| --- | --- | --- |
| Identitas project dan signup disabled | free-visit-acceptance.mjs: URL allowlist dan auth settings | PASS |
| Server production dengan environment terkendali | gate-checks.mjs: startServer | PASS |
| Availability server/RPC, batas tanggal | free-visit-acceptance.mjs: today availability; fitting.sql | PASS; aturan Free Visit kini hari ini saja, besok sengaja ditolak |
| Sepuluh slot benar-benar diklik, grid mobile | free-visit-acceptance.mjs: availability loop; reservation-visual.spec.ts | PASS untuk seluruh slot available saat run, dua kolom |
| Booking UI, identitas, consent, referensi, normalisasi | free-visit-acceptance.mjs: real UI booking persistence | PASS; field Free Visit menggantikan input Instagram baru sesuai scope branch |
| Satu reminder tepat H-2 | free-visit-acceptance.mjs: jobs assertions; fitting.sql | PASS |
| Parallel replay dan altered-payload conflict | free-visit-acceptance.mjs: replay dan parallel slot race | PASS |
| Race dua request pada kapasitas terakhir | free-visit-acceptance.mjs: parallel slot race | PASS untuk kapasitas satu pada slot yang sama: 201/409; tidak mengisi sembilan slot lain di shared |
| Anon/non-admin read denial lima tabel | gate-checks.mjs: authorization, ID fixture | PASS |
| Deny book/availability RPC untuk anon, non-admin, admin | gate-checks.mjs: authorization; fitting.sql privilege matrix | PASS; termasuk legacy book_fitting dan RPC baru |
| Deny claim/rate RPC untuk anon/non-admin/admin | fitting.sql privilege matrix; isolated-worker.mjs role loop | PASS privilege remote; invocation isolated BLOCKED |
| Deny change_status anon/non-admin | gate-checks.mjs: authorization | PASS |
| Direct reservation/reminder write, audit/rate delete, admin promotion | gate-checks.mjs: authorization | PASS; diperluas menjadi INSERT/UPDATE/DELETE lima tabel |
| Service role tidak melewati legacy booking | fitting.sql has_function_privilege(service_role, book_fitting) | PASS |
| Admin Auth/UI, search/date/status filter | live admin login/card; gate-checks.mjs: adminStatus | PASS |
| PATCH status, audit actor/time, cancellation | gate-checks.mjs: adminStatus; live reminder assertion | PASS |
| Revoked session API dan RLS | free-visit-acceptance.mjs setelah admin membership delete | PASS |
| Cron paralel tanpa Meta, tanpa perubahan attempt/job | free-visit-acceptance.mjs: crons Promise.all + snapshot job | PASS: kedua response 503/configured=false/processed=0; tanpa auth 401 |
| Parallel worker claim disjoint | isolated-worker.mjs: dua koneksi psql/transaksi, Promise.all | SKIPPED shared; BLOCKED isolated |
| Stale processing gagal aman, rate limit first/block | isolated-worker.mjs | BLOCKED; tidak dijalankan pada data shared |
| Cleanup reservasi/job/audit/admin/Auth/rate dan readback | free-visit-acceptance.mjs finally; authorization finally | PASS |
| Exact secret scan source/Git/client/artefak | free-visit-acceptance.mjs finally | PASS |
| Cutoff database/invalid phone yang berkurang di suite SQL | fitting.sql: database Jakarta cutoff dan INVALID_INPUT | PASS |
| Logo loaded, aria progress, touch targets tiap tahap, focus keyboard | reservation-visual.spec.ts | PASS, 360/390/430px |

### Hasil eksekusi

| Perintah | Hasil |
| --- | --- |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run build | PASS production |
| npm test | PASS, 51 tes; termasuk retry/backoff, terminal cancellation, provider tanpa kredensial |
| Supabase CLI db query --linked --file supabase/tests/fitting.sql | PASS remote, rollback, tanpa global worker mutation |
| npm run test:browser | PASS, 10 tes; baseline screenshot tidak diubah |
| node scripts/final-gate.mjs | BLOCKED keseluruhan; 12 PASS, 1 SKIPPED, 1 BLOCKED; cleanup=true |
| npm run test:secrets | PASS; exact runtime-secret scan juga PASS |

Artefak ignored: test-results/free-visit/result.json, availability.json dan screenshot mobile. Run terakhir tercatat 2026-09-28T01:13:22Z. Assertion focus awal memakai focus programatis setelah pointer dan gagal; diperbaiki dengan navigasi keyboard Tab/Shift+Tab agar benar-benar menguji :focus-visible. Tidak ada perubahan CSS/UI untuk meluluskan tes.

**Blocker isolated:** Docker daemon tidak tersedia. Percobaan mulai Docker Desktop belum menghasilkan engine siap; WSL gagal membuat network endpoint (Access is denied). Tidak mengubah konfigurasi sistem untuk memaksa tes. scripts/isolated-worker.mjs sudah disediakan tetapi belum tervalidasi runtime; jangan menyatakan parallel worker PASS sampai Docker siap dan script lulus. Jalankan kembali node scripts/final-gate.mjs setelah tersedia build production dan Docker. Tidak ada klaim kesetaraan coverage eksekusi penuh selama blocker ini tersisa.

**Blocker Meta:** kredensial/template approved dan pengiriman provider nyata tetap belum diuji; sengaja tidak ada WhatsApp sungguhan.

File yang berubah khusus perbaikan review ini: scripts/final-gate.mjs (komentar wrapper), scripts/free-visit-acceptance.mjs, scripts/gate-checks.mjs (baru), scripts/isolated-worker.mjs (baru), supabase/tests/fitting.sql, tests/browser/reservation-visual.spec.ts, docs/03-VERIFICATION.md. Tidak mengubah aplikasi, production worker, authorization, atau migration. Tidak ada commit, push, PR, atau deployment.

## Review sebelum commit — 28 September 2026

**REQUEST CHANGES. Hasil review ini mendahului keputusan PASS historis di bawah.** Perbandingan menggunakan origin/develop yang sudah di-fetch, commit 62937f26b61f9e1afae5abe5cc16b68b36838651. Seluruh 23 file tracked dan lima file untracked yang diminta masuk scope. Review tidak mengubah perilaku aplikasi.

### Penghapusan besar

final-gate.mjs berubah dari 1.028 menjadi dua baris yang mengimpor free-visit-acceptance.mjs (611 baris). Ini pemindahan runner dan penyesuaian aturan Free Visit, bukan file terpotong. Namun, pemindahan belum mempertahankan seluruh coverage lama. test-concurrency.mjs juga menjadi wrapper runner yang sama; pemeriksaan concurrency SQL mandiri sebelumnya tidak lagi berdiri sendiri.

Stat tracked sebelum pembaruan laporan: 1.066 penambahan dan 1.943 penghapusan. Lima file untracked menyumbang 785 baris yang tidak terlihat pada git diff biasa: lib/free-visit.ts (40), scripts/free-visit-acceptance.mjs (611), scripts/local-acceptance.mjs (2), migration 20260927000300_free_visit.sql (93), tests/browser/helpers.ts (39). Jika ikut dihitung, net berkurang sekitar 92 baris teks. Jumlah baris bukan bukti kesetaraan coverage.

### Temuan yang perlu ditangani

1. **P1 — Guard worker tidak melindungi job processing milik pengguna lain.** scripts/free-visit-acceptance.mjs:492–512 hanya memeriksa scheduled yang sudah due sebelum memanggil claim_reminders global. RPC tersebut juga mengubah semua processing yang terkunci lebih dari lima menit menjadi failed. Guard lama memeriksa processing serta scheduled dalam horizon lima menit. Akibatnya gate baru bisa mengubah job nyata di luar fixture dan cleanup tidak memulihkannya. Pulihkan guard dan validasi ID hasil claim, atau jalankan bagian mutasi global pada database terisolasi.
2. **P2 — Matriks izin berkurang.** Baris 320–355 tidak menggantikan pemeriksaan lama untuk larangan availability/take_rate_limit RPC, larangan booking/claim bagi admin authenticated, serta direct write reminder, audit, dan rate limit. Suite SQL tidak menutup seluruh celah ini. Pulihkan matriks role × RPC/tabel agar perubahan grant yang tidak aman menggagalkan gate.
3. **P2 — Transisi admin melewati API aplikasi.** Baris 393–411 memakai RPC langsung; pencabutan membership pada 524–527 hanya memeriksa RLS. Coverage lama menguji PATCH API dengan cookie admin, respons 200/409, non-admin/revoked session 403, serta actor/timestamp audit. Login dan baca dashboard tetap diuji, tetapi regresi pada endpoint mutasi dapat lolos. Pulihkan pengujian melalui session browser dan API localhost.

Catatan tambahan: runner baru memakai localhost yang sudah berjalan, bukan memulai build production dengan environment terkontrol. Pemeriksaan environment proses runner belum membuktikan environment server identik. Cleanup masih dijalankan, tetapi readback job/audit/Auth setelah penghapusan dan isolasi bucket rate limit tidak selengkap runner lama. Coverage mobile juga mengurangi assertion logo termuat, aria progress dan style focus. Ini bukan bukti adanya bug UI, tetapi klaim kesetaraan verifikasi belum didukung.

### Hasil pengujian ulang

| Check | Hasil review |
| --- | --- |
| Lint, typecheck, production build | PASS |
| Unit | PASS — 51 tes, empat file |
| Database remote | PASS — fitting.sql melalui Supabase CLI, transaksi rollback |
| Browser mobile/regresi | PASS — 10 tes, tanpa memperbarui snapshot |
| Live final-gate | FAIL / terblokir pada guard worker; delapan kelompok PASS, satu FAIL |
| Booking UI → API → Supabase | PASS — slot aktif benar-benar diklik; data acara/consent/receipt tersimpan |
| Concurrency dan idempotensi live | PASS — satu 201 dan satu 409; replay paralel tidak menduplikasi |
| Reminder H-2 dan cancellation | PASS — satu job dan due_at tepat; cancellation membatalkan job |
| Admin/RLS live | PASS untuk subset runner; celah coverage dijelaskan di atas |
| Worker parallel claim live | BELUM TERVERIFIKASI pada run ini; guard berhenti sebelum claim |
| Tanpa kredensial Meta | PASS — cron 503, configured=false, processed=0 |
| Cleanup fixture run | PASS; data di luar run tidak diubah |
| Secret scan | PASS — pola pada 66 file dan client JavaScript; exact runtime-secret scan juga PASS |
| git diff --check | PASS |

Run live 28 September 2026 sekitar 07.53 WIB menghasilkan test-results/free-visit/result.json (ignored). Ada satu scheduled job due di luar fixture; runner berhenti aman dengan guard Do not claim unrelated jobs. Job tersebut tidak dihapus, dibatalkan, atau di-claim. Pemeriksaan revoked-admin yang terletak setelah claim juga tidak tercapai pada run ini. Jangan menyebut seluruh integrasi live PASS berdasarkan hasil historis.

Meta tetap terblokir oleh kredensial/template approved dan konfigurasi provider yang belum tersedia. Tidak ada WhatsApp sungguhan, commit, push, PR, atau deployment. Perubahan review hanya laporan ini; temuan belum diperbaiki.

## Hasil implementasi historis

Tanggal: **27 September 2026**. Project: **lakuh-fitting**. Hasil ini menggantikan laporan lama yang masih mengizinkan booking besok/30 hari.

## Keputusan

**PASS implementasi dan acceptance berdasarkan lampiran teks pengguna**, termasuk integrasi nyata UI → localhost:3000 → Supabase. Run terakhir selesai **18.44 WIB**; tanggal server/UI/RPC 2026-09-27. Slot 20.00 benar-benar diklik dan menghasilkan booking tersimpan. Tanggal besok kini sengaja ditolak, sesuai aturan Free Visit terbaru.

PDF “Summary isi website(1).pdf” tidak ditemukan pada lampiran yang tersedia. Semua **18 blok** teks (10 ketentuan, catatan jadwal/kuning, stok, penutup, empat consent) cocok persis dengan Pasted text.txt. Perbandingan terhadap PDF asli **BELUM DAPAT DIVERIFIKASI**; tidak ada klaim telah membaca PDF tersebut.

## Bukti acceptance

| Kriteria | Hasil dan bukti |
| --- | --- |
| Hari ini saja | PASS — UI tidak memiliki kalender/pemilih tanggal kunjungan; GET availability hari ini 200 dan identik RPC. Besok ditolak API 400, RPC seluruh available=false, POST booking besok 409. |
| Sepuluh slot/cutoff | PASS — 11.00–20.00 tetap ditampilkan dua kolom. Pada run 18.44 WIB hanya 20.00 lolos cutoff; tombol benar-benar diklik, aria-pressed=true. Boundary 60 menit/1 ms dan skenario 11.36 diuji unit; tidak mengklaim skenario 11.36 diuji live pada sore hari. |
| Data acara | PASS — dua booking UI nyata: satu tanggal acara pasti, satu unknown. Bust 92.5 tersimpan numeric, informasi acara tersimpan, unknown=true menghasilkan event_date=null; field tanggal dikosongkan/disabled di browser. |
| Empat consent | PASS — submit disabled sampai empat checkbox terpisah dicentang. Empat boolean=true, terms_version=free-visit-2026-09-v1, consented_at dari DB dan timezone=Asia/Jakarta tersimpan. |
| Ringkasan/receipt | PASS — nama, WhatsApp format 62, lingkar dada, tanggal/jam kunjungan dan tanggal/status acara tampil. Receipt berasal dari hasil RPC yang telah tersimpan. |
| Admin | PASS — akun admin sintetis dibuat terkontrol, login melalui UI asli; kartu detail menampilkan lingkar dada, rencana/tanggal acara, empat consent, versi, timestamp dan zona waktu. Data lama tidak diisi secara fiktif. |
| Mobile/syarat | PASS — semua ketentuan, kotak kuning dan empat checkbox tampil di 360/390/430px; tidak ada overflow; touch target 44px; teks persis dicocokkan dengan lampiran. Desain plum/cream dipertahankan. |
| Atomisitas/idempotensi | PASS — satu transaksi menulis booking/audit/job; replay sama mengembalikan referensi sama; perubahan bust dengan key sama ditolak. Dua POST API bersamaan ke slot sama menghasilkan satu 201 dan satu 409. Dua replay paralel tidak membuat duplikat. |
| RLS/authorization | PASS — anon/non-admin tidak membaca lima tabel, tidak mengeksekusi RPC booking/status/claim; direct update dan promosi admin ditolak. Membership dicabut menyebabkan hasil RLS kosong. RPC booking lama dicabut untuk service_role sehingga tidak bisa melewati field/consent baru. Signup publik tetap nonaktif. |
| Reminder | PASS — tepat satu job per booking, due_at tepat appointment minus dua jam. Pembatalan membatalkan job; claim paralel hanya mengambil satu job sekali. Worker/provider tidak diubah. Tanpa Meta: cron 503, processed=0, tidak ada sent/message ID atau perubahan job. |
| Cleanup | PASS — seluruh reservasi, job, audit, admin dan user Auth sintetis dibersihkan dengan ID/key run; SQL test rollback. Tidak menghapus data pengguna lain. |
| Secret | PASS — pola secret serta nilai runtime password/token/secret persis dipindai pada source, kandidat Git, client bundle dan artefak. .env.local tetap ignored; tidak ada nilai secret pada output. |

## Pengujian

| Perintah/check | Hasil |
| --- | --- |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run build | PASS, production dengan .env.local |
| npm test | PASS, **51 tes** |
| npm run test:db | PASS, Supabase remote dalam transaksi rollback |
| npm run test:browser | PASS, **10 tes**; setelah pembaruan screenshot form yang memang berubah, run final tanpa update baseline lulus |
| node scripts/free-visit-acceptance.mjs | PASS, **9 kelompok bukti live**, cleanup dan exact secret scan |
| npm run test:secrets | PASS |
| git diff --check | PASS |
| supabase migration list --linked | PASS, 00100/00200/00300 cocok local dan remote |

Artefak ignored: test-results/free-visit/result.json, availability.json dan terms-360.png/terms-390.png/terms-430.png. Screenshot regresi berada di test-results dan tiga baseline form tersimpan pada tests/browser/reservation-visual.spec.ts-snapshots. Runner compatibility final-gate/local-acceptance/test-concurrency mengarah ke gate Free Visit terbaru.

Run live membutuhkan satu slot hari ini yang masih lolos cutoff. Jika semua slot sudah lewat/terisi, runner gagal aman; jangan memalsukan jam atau membuka hari lain untuk meluluskan tes. Hindari run berulang dalam jendela rate limit 10 menit. Kegagalan awal tes menangkap tampilan admin yang belum lengkap dan locator error input; sudah diperbaiki dan seluruh suite dijalankan ulang.

## Migration diterapkan

**supabase/migrations/20260927000300_free_visit.sql** menambah field acara/consent, constraint, RPC baru server-only serta aturan hari ini. Migration lama 20260927000100 dan 20260927000200 tidak diubah. Existing records dipertahankan; field baru historis nullable agar tidak mengarang consent.

## Seluruh file berubah (28)

Aplikasi dan domain:

- app/layout.tsx
- app/reservasi/page.tsx
- app/reservasi/reservation-form.tsx
- app/reservasi/reservation.css
- app/api/reservations/route.ts
- app/api/admin/reservations/route.ts
- app/admin/panel.tsx
- lib/booking.ts
- lib/free-visit.ts (baru)
- lib/http.ts — batas body booking 16 KiB untuk teks Unicode; endpoint lain tetap 4 KiB

Database dan tes:

- supabase/migrations/20260927000300_free_visit.sql (baru)
- supabase/tests/fitting.sql
- tests/booking.test.ts
- tests/http.test.ts
- tests/browser/helpers.ts (baru)
- tests/browser/reservation.spec.ts
- tests/browser/reservation-visual.spec.ts
- tests/browser/reservation-visual.spec.ts-snapshots/data-360-win32.png
- tests/browser/reservation-visual.spec.ts-snapshots/data-390-win32.png
- tests/browser/reservation-visual.spec.ts-snapshots/data-430-win32.png
- scripts/free-visit-acceptance.mjs (baru)
- scripts/final-gate.mjs
- scripts/local-acceptance.mjs (sebelumnya lokal/untracked, diperbarui)
- scripts/test-concurrency.mjs

Dokumentasi:

- README.md
- docs/01-PRD.md
- docs/02-TECHNICAL-DESIGN.md
- docs/03-VERIFICATION.md

## Asumsi dan batas integrasi

Informasi Rencana Acara ditambahkan sebagai free text opsional karena tidak diwajibkan dalam daftar validasi; tanggal/unknown tetap wajib. Tidak menambah batas minimum/maksimum lingkar dada. Tidak ada fitur export pada baseline untuk diperbarui. Instagram historis dipertahankan; formulir baru memakai identitas yang diminta.

Meta nyata tetap belum diuji: perlu token, nomor pengirim, template approved/bahasa/versi Graph dan konfigurasi operasional aman. Tidak ada klaim pesan terkirim. Cron operasional dan deployment tidak diaktifkan. **Tidak ada WhatsApp sungguhan, commit, push, PR atau deployment.**
