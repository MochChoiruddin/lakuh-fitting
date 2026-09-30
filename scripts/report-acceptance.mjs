// Real browser/session/API/Supabase acceptance. Fixtures only; never claims reminders.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
process.loadEnvFile(".env.local");
process.env.PLAYWRIGHT_BROWSERS_PATH = "node_modules/.cache/ms-playwright";
const { chromium } = await import("playwright");
const base = "http://localhost:3101";
assert.equal(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "https://bwxtvtuttunedomahnds.supabase.co",
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const checked = (result) => {
  assert.equal(result.error, null, "Database operation failed");
  return result.data;
};
const tag = `Report ${randomUUID()}`,
  ids = Array.from({ length: 1205 }, () => randomUUID()),
  users = [];
const salt = randomBytes(32).toString("hex"),
  password = randomBytes(32).toString("hex");
const secrets = [
  salt,
  password,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.CRON_SECRET,
  process.env.RATE_LIMIT_SALT,
].filter(Boolean);
const results = [],
  out = "test-results/admin-reports";
mkdirSync(out, { recursive: true });
const pass = (check) => {
  results.push({ check, status: "PASS" });
  console.log(`PASS: ${check}`);
};
let server,
  browser,
  stage = "setup",
  cleanup = false;
try {
  const existing = await service
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("appointment_at", "1902-01-01T00:00:00+07:00")
    .lt("appointment_at", "1902-02-01T00:00:00+07:00");
  checked(existing);
  assert.equal(
    existing.count,
    0,
    "Test month occupied: refusing non-fixture reads",
  );
  let occupied = false;
  try {
    await fetch(base);
    occupied = true;
  } catch {
    /* free */
  }
  assert.equal(occupied, false, "Refuse unknown server environment");
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3101"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        RATE_LIMIT_SALT: salt,
        WHATSAPP_ACCESS_TOKEN: "",
        WHATSAPP_PHONE_NUMBER_ID: "",
        WHATSAPP_TEMPLATE_NAME: "",
        WHATSAPP_TEMPLATE_LANGUAGE: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* starting */
    }
    if (ready || server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  const email = `${randomUUID()}@example.invalid`;
  const user = checked(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
  ).user;
  users.push(user.id);
  checked(await service.from("admins").insert({ user_id: user.id }));
  const rows = ids.map((id, i) => ({
    id,
    idempotency_key: randomUUID(),
    request_payload: {},
    reference: `LK-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
    name: i < 4 ? ["=SUM(1,1)", "+SUM(1,1)", "-1+2", "@SUM(1,1)"][i] : tag,
    phone: "6281234567890",
    weight_kg: 90.5,
    height_cm: 160,
    event_plan: tag,
    event_date_unknown: true,
    appointment_at: new Date(
      Date.parse("1902-01-01T00:00:00+07:00") + i * 60000,
    ).toISOString(),
    status: ["pending", "confirmed", "completed", "cancelled"][i % 4],
  }));
  for (let i = 0; i < rows.length; i += 250)
    checked(await service.from("reservations").insert(rows.slice(i, i + 250)));
  checked(
    await service.from("reminder_jobs").insert({
      reservation_id: ids[1],
      due_at: "1901-12-31T15:01:00Z",
      next_attempt_at: "2100-01-01T00:00:00Z",
    }),
  );
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const path = "/api/admin/reports/export?period=selected_month&month=1902-01";
  stage = "session authorization";
  assert.equal((await fetch(base + path)).status, 401);
  await page.goto(`${base}/admin`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("heading", { name: "Laporan Reservasi" }).waitFor();
  for (const cookie of await context.cookies()) secrets.push(cookie.value);
  assert.equal(
    (
      await context.request.get(`${base}/api/admin/reports/export?period=bad`)
    ).status(),
    400,
  );
  assert.equal(
    (
      await context.request.get(`${base}/api/admin/reports/export?status=bad`)
    ).status(),
    400,
  );
  pass("real admin session; export 401 without cookie and 400 invalid filters");
  stage = "completed HTTP and UI";
  const patch = (id, status) =>
    context.request.patch(`${base}/api/admin/reservations`, {
      headers: { Origin: base },
      data: { id, status },
    });
  assert.equal((await patch(ids[0], "completed")).status(), 409);
  await page.getByLabel("Tanggal (WIB)", { exact: true }).fill("1902-01-01");
  await page.getByLabel("Cari nama, WA, referensi").fill(rows[1].reference);
  const card = page
    .locator(".reservation-item")
    .filter({ hasText: rows[1].reference });
  await card.waitFor();
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Selesai fitting" }).click();
  assert.equal(
    checked(
      await service
        .from("reservations")
        .select("status")
        .eq("id", ids[1])
        .single(),
    ).status,
    "confirmed",
  );
  const reminderBefore = checked(
    await service
      .from("reminder_jobs")
      .select("status,attempt_count,sent_at")
      .eq("reservation_id", ids[1])
      .single(),
  );
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "Intercepted in test" }),
  );
  const popupPromise = page.waitForEvent("popup");
  await card
    .getByRole("button", { name: "Kirim Reminder WhatsApp", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForURL("https://wa.me/**");
  const target = new URL(popup.url());
  assert.equal(target.pathname, "/6281234567890");
  const manualTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(rows[1].appointment_at));
  const manualMessage = `Halo Kak, kami ingin mengingatkan bahwa Kakak memiliki jadwal appointment di butik kami pada pukul ${manualTime} WIB. Apakah Kakak berkenan hadir sesuai jadwal tersebut? Mohon konfirmasinya ya, Kak. Terima kasih 🤍`;
  assert.equal(target.href, `https://wa.me/6281234567890?text=${encodeURIComponent(manualMessage)}`);
  await popup.close();
  const manualAudit = checked(
    await service
      .from("reservation_audit")
      .select("event_type,old_status,new_status,actor_id")
      .eq("reservation_id", ids[1])
      .eq("event_type", "reminder_opened_by_admin"),
  );
  assert.equal(manualAudit.length, 1);
  assert.equal(manualAudit[0].old_status, manualAudit[0].new_status);
  assert.equal(manualAudit[0].actor_id, user.id);
  assert.deepEqual(
    checked(
      await service
        .from("reminder_jobs")
        .select("status,attempt_count,sent_at")
        .eq("reservation_id", ids[1])
        .single(),
    ),
    reminderBefore,
  );
  pass(
    "manual reminder: real UI/API audit opened only; WhatsApp navigation intercepted; status/job unchanged",
  );
  const before = Date.now();
  page.once("dialog", (dialog) => dialog.accept());
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/reservations") &&
      r.request().method() === "PATCH",
  );
  await card.getByRole("button", { name: "Selesai fitting" }).click();
  assert.equal((await response).status(), 200);
  await card
    .getByRole("button", { name: "Selesai fitting" })
    .waitFor({ state: "detached" });
  const persisted = checked(
    await service
      .from("reservations")
      .select("status,status_updated_at")
      .eq("id", ids[1])
      .single(),
  );
  assert.equal(persisted.status, "completed");
  assert.ok(Date.parse(persisted.status_updated_at) >= before - 5000);
  const audit = checked(
    await service
      .from("reservation_audit")
      .select("actor_id,old_status,new_status,changed_at")
      .eq("reservation_id", ids[1])
      .eq("event_type", "status_changed"),
  );
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_id, user.id);
  assert.equal(audit[0].old_status, "confirmed");
  assert.equal(audit[0].new_status, "completed");
  assert.ok(Date.parse(audit[0].changed_at) >= before - 5000);
  assert.equal(
    checked(
      await service
        .from("reminder_jobs")
        .select("status")
        .eq("reservation_id", ids[1])
        .single(),
    ).status,
    "cancelled",
  );
  for (const id of [ids[1], ids[3]])
    for (const status of ["pending", "confirmed"])
      assert.equal((await patch(id, status)).status(), 409);
  pass(
    "Selesai fitting confirmation cancel/accept; HTTP terminal rules, DB audit and cancellation of remaining reminder",
  );
  stage = "report filters and real Excel download";
  await page.getByLabel("Periode laporan").selectOption("selected_month");
  await page.getByLabel("Bulan laporan").fill("1902-01");
  const button = page.getByRole("button", {
    name: "Export Excel",
    exact: true,
  });
  await page
    .locator(".report-counts")
    .getByText("1205", { exact: true })
    .waitFor();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok((await button.boundingBox()).height >= 44);
    await page
      .locator(".admin-reports")
      .screenshot({ path: `${out}/report-${width}.png` });
  }
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  assert.match(
    file.suggestedFilename(),
    /^lakuh-fitting-bulanan-1902-01-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  await file.saveAs(`${out}/synthetic-report.xlsx`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(`${out}/synthetic-report.xlsx`);
  assert.deepEqual(
    workbook.worksheets.map((s) => s.name),
    ["Ringkasan", "Reservasi"],
  );
  const sheet = workbook.getWorksheet("Reservasi");
  assert.equal(sheet.rowCount, 1206);
  assert.equal(sheet.columnCount, 14);
  assert.equal(sheet.getCell("G2").value, 90.5);
  assert.equal(sheet.getCell("H2").value, 160);
  assert.equal(sheet.getRow(1).font.bold, true);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.ok(sheet.autoFilter);
  for (let i = 0; i < 4; i++) {
    assert.equal(sheet.getCell(i + 2, 5).type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell(i + 2, 5).value, rows[i].name);
    assert.equal(sheet.getCell(i + 2, 5).formula, undefined);
  }
  const contents = JSON.stringify(workbook.model);
  assert.ok(secrets.every((secret) => !contents.includes(secret)));
  assert.ok(
    !/consent_terms|service_role|safe_error|actor_id|access_token/.test(
      contents,
    ),
  );
  for (const status of ["pending", "confirmed", "completed", "cancelled"]) {
    const r = await context.request.get(`${base}${path}&status=${status}`);
    assert.equal(r.status(), 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await r.body());
    book.getWorksheet("Reservasi").eachRow((row, number) => {
      if (number > 1) assert.equal(row.getCell(10).value, status);
    });
  }
  pass(
    "real UI XLSX download: 1205 rows, both sheets, every status, safe formula text, no internal fields; mobile 360/390/430",
  );
  stage = "export error UI";
  // Only this failure-state test uses a mock; successful export above is non-mocked.
  await page.route("**/api/admin/reports/export?*", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Export gagal untuk pengujian." },
    }),
  );
  await button.click();
  await page.locator(".admin-reports [role=alert]").waitFor();
  await page.unroute("**/api/admin/reports/export?*");
  checked(await service.from("admins").delete().eq("user_id", user.id));
  assert.equal((await context.request.get(base + path)).status(), 403);
  assert.equal(
    (
      await context.request.post(`${base}/api/admin/reminder`, {
        headers: { Origin: base },
        data: { id: ids[1] },
      })
    ).status(),
    403,
  );
  pass("export failure message and valid authenticated non-admin session 403");
  // Ordinary Data API sessions; membership was revoked only for this run's fixture user.
  const unprivileged = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = checked(await unprivileged.auth.signInWithPassword({ email, password }));
  secrets.push(login.session.access_token, login.session.refresh_token);
  for (const client of [anonymous, unprivileged]) {
    for (const [table, column, id, value] of [
      ["reservations", "id", ids[1], { status: "pending" }],
      ["reminder_jobs", "reservation_id", ids[1], { status: "failed" }],
      ["reservation_audit", "reservation_id", ids[1], { new_status: "pending" }],
      ["admins", "user_id", user.id, { user_id: user.id }],
      ["rate_limits", "key", salt, { hits: 2 }],
    ]) {
      const read = await client.from(table).select(column).eq(column, id);
      assert.ok(read.error || read.data.length === 0);
      for (const result of [
        await client.from(table).insert(value),
        await client.from(table).update(value).eq(column, id),
        await client.from(table).delete().eq(column, id),
      ]) assert.equal(result.error?.code, "42501");
    }
    for (const [fn, args] of [
      ["open_manual_reminder", { p_id: ids[1] }],
      ["change_status", { p_id: ids[1], p_status: "confirmed" }],
      ["reservation_report", { p_start: "1902-01-01", p_end: "1902-01-31", p_status: null }],
      ["book_free_visit", { p_input: {} }],
    ]) assert.equal((await client.rpc(fn, args)).error?.code, "42501");
  }
  pass("Data API anon/non-admin: five private tables deny reads and direct INSERT/UPDATE/DELETE; admin/private RPCs denied");
} catch {
  process.exitCode = 1;
  results.push({ check: stage, status: "FAIL" });
  console.error(`FAIL: ${stage}; details suppressed`);
} finally {
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      for (const table of ["reminder_jobs", "reservation_audit"])
        checked(await service.from(table).delete().in("reservation_id", chunk));
      checked(await service.from("reservations").delete().in("id", chunk));
      for (const [table, column] of [
        ["reservations", "id"],
        ["reminder_jobs", "reservation_id"],
        ["reservation_audit", "reservation_id"],
      ])
        assert.equal(
          checked(await service.from(table).select(column).in(column, chunk))
            .length,
          0,
        );
    }
    for (const id of users) {
      checked(await service.from("admins").delete().eq("user_id", id));
      checked(await service.auth.admin.deleteUser(id));
      assert.ok((await service.auth.admin.getUserById(id)).error);
    }
    const key = createHash("sha256").update(`${salt}:login`).digest("hex");
    checked(await service.from("rate_limits").delete().eq("key", key));
    cleanup = true;
    pass(
      "explicit fixture ID cleanup and readback: reservations/reminders/audits/Auth/admin/rate key",
    );
  } catch {
    process.exitCode = 1;
    results.push({ check: "cleanup", status: "FAIL" });
    console.error("FAIL: fixture cleanup requires attention");
  }
  await browser?.close();
  server?.kill();
  try {
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    const walk = (dir) =>
      readdirSync(dir).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    for (const file of [...files, ...walk(".next/static"), ...walk(out)])
      assert.ok(
        secrets.every((s) => !readFileSync(file).includes(Buffer.from(s))),
      );
    pass(
      "exact runtime secret scan: source, client bundle and report artifacts",
    );
  } catch {
    process.exitCode = 1;
    results.push({ check: "secret scan", status: "FAIL" });
  }
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), cleanup, results },
      null,
      2,
    ),
  );
}
