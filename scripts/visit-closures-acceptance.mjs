// Fixture-only live admin closure test. No bookings, cron or provider calls.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { startServer } from "./gate-checks.mjs";
process.loadEnvFile(".env.local");
process.env.PLAYWRIGHT_BROWSERS_PATH = "node_modules/.cache/ms-playwright";
const { chromium } = await import("playwright");
assert.equal(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "https://bwxtvtuttunedomahnds.supabase.co",
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = (r) => {
  assert.equal(r.error, null, "Database operation failed");
  return r.data;
};
const date = "2098-10-05",
  base = "http://localhost:3100",
  salt = randomBytes(32).toString("hex");
const key = createHash("sha256").update(`${salt}:login`).digest("hex");
const counts = async () => {
  const result = {};
  for (const table of ["reservations", "reminder_jobs", "reservation_audit"]) {
    const r = await db.from(table).select("id", { head: true, count: "exact" });
    checked(r);
    result[table] = r.count;
  }
  return result;
};
let browser,
  server,
  uid,
  ownedDate = false,
  baseline;
try {
  baseline = await counts();
  console.log("Baseline counts", baseline);
  assert.equal(
    checked(
      await db.from("visit_days").select("visit_date").eq("visit_date", date),
    ).length,
    0,
    "Refuse existing date override",
  );
  server = await startServer(base, salt);
  const password = randomBytes(32).toString("hex"),
    email = `closure-${randomUUID()}@example.invalid`;
  uid = checked(
    await db.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  checked(await db.from("admins").insert({ user_id: uid }));
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + "/admin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  const section = page.getByRole("region", { name: "Buka / Tutup Free Visit" });
  await section.waitFor();
  await section.getByLabel("Tanggal Free Visit (WIB)").fill(date);
  await section.getByText("Status: Buka", { exact: true }).waitFor();
  page.once("dialog", (d) => d.dismiss());
  await section
    .getByRole("button", { name: "Tutup Free Visit", exact: true })
    .click();
  assert.equal(
    checked(
      await db.from("visit_days").select("visit_date").eq("visit_date", date),
    ).length,
    0,
  );
  // Reserve ownership before mutation; cleanup still checks the actor UUID.
  ownedDate = true;
  page.once("dialog", (d) => d.accept());
  await section
    .getByRole("button", { name: "Tutup Free Visit", exact: true })
    .click();
  await section.getByText("Status: Tutup", { exact: true }).waitFor();
  const row = checked(
    await db
      .from("visit_days")
      .select("closed,updated_by")
      .eq("visit_date", date)
      .single(),
  );
  assert.equal(row.closed, true);
  assert.equal(row.updated_by, uid);
  const publicState = checked(
    await db.rpc("visit_availability", { p_date: date }),
  );
  assert.equal(publicState.closed, true);
  assert.equal(publicState.slots.length, 5);
  assert.ok(publicState.slots.every((s) => !s.available));
  mkdirSync("test-results/closures", { recursive: true });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await section.screenshot({
      path: `test-results/closures/admin-${width}.png`,
    });
  }
  await section
    .getByRole("button", { name: "Buka kembali Free Visit", exact: true })
    .click();
  await section.getByText("Status: Buka", { exact: true }).waitFor();
  assert.equal(
    checked(await db.rpc("visit_availability", { p_date: date })).closed,
    false,
  );
  assert.equal(
    (await fetch(base + `/api/admin/visit-days?date=${date}`)).status,
    401,
  );
  checked(await db.from("admins").delete().eq("user_id", uid));
  assert.equal(
    (
      await context.request.put(base + "/api/admin/visit-days", {
        headers: { Origin: base },
        data: { date, closed: true },
      })
    ).status(),
    403,
  );
  console.log(
    "PASS: real admin UI close/cancel/reopen, persisted actor, public closure flag, mobile 360/390/430, HTTP 401/403",
  );
} catch {
  console.error("FAIL: closure live test; sensitive details suppressed");
  process.exitCode = 1;
} finally {
  try {
    if (ownedDate) {
      checked(
        await db
          .from("visit_days")
          .delete()
          .eq("visit_date", date)
          .eq("updated_by", uid),
      );
      assert.equal(
        checked(
          await db
            .from("visit_days")
            .select("visit_date")
            .eq("visit_date", date),
        ).length,
        0,
      );
    }
    if (uid) {
      checked(await db.from("admins").delete().eq("user_id", uid));
      checked(await db.auth.admin.deleteUser(uid));
      assert.ok((await db.auth.admin.getUserById(uid)).error);
    }
    checked(await db.from("rate_limits").delete().eq("key", key));
    const after = await counts();
    if (baseline) assert.deepEqual(after, baseline);
    console.log("PASS: fixture cleanup; baseline restored", after);
  } catch {
    console.error("FAIL: fixture cleanup requires attention");
    process.exitCode = 1;
  }
  await browser?.close();
  server?.kill();
}
