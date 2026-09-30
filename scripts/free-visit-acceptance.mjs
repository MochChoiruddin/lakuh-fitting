import {
  startServer,
  authorization,
  adminStatus,
  isolatedWorker,
} from "./gate-checks.mjs";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SLOTS } from "../lib/schedule.mjs";
process.loadEnvFile(".env.local");
process.env.PLAYWRIGHT_BROWSERS_PATH = "node_modules/.cache/ms-playwright";
const { chromium } = await import("playwright");
const base = "http://localhost:3100",
  version = "free-visit-2026-09-v2";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, "https://bwxtvtuttunedomahnds.supabase.co");
assert.ok(
  !process.env.WHATSAPP_ACCESS_TOKEN,
  "Meta must be disabled for live tests",
);
const runRateSalt = randomBytes(32).toString("hex");
const runRateKeys = ["availability", "booking", "login"].map((scope) =>
  createHash("sha256").update(`${runRateSalt}:${scope}`).digest("hex"),
);
const secretValues = [
  runRateSalt,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.RATE_LIMIT_SALT,
  process.env.CRON_SECRET,
].filter(Boolean);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const anon = createClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
const checked = (result) => {
  assert.equal(result.error, null, "Supabase operation failed");
  return result.data;
};
const tag = `FreeVisit ${randomUUID()}`,
  keys = new Set(),
  fixtureIds = new Set(),
  users = [],
  results = [];
const out = "test-results/free-visit";
mkdirSync(out, { recursive: true });
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
}).format(new Date());
const eventDate = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000)
  .toISOString()
  .slice(0, 10);
const pass = (label) => {
  results.push({ check: label, status: "PASS" });
  console.log(`PASS: ${label}`);
};
let browser,
  server,
  stage = "setup",
  cleanup = false;
const api = async (path, method = "GET", body, extra = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Origin: base, "Content-Type": "application/json", ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
};
const ownRows = async () => {
  const rows = keys.size
    ? checked(
        await service
          .from("reservations")
          .select("*")
          .in("idempotency_key", [...keys]),
      )
    : [];
  for (const row of rows) {
    assert.equal(row.name, tag, "Fixture ownership mismatch");
    fixtureIds.add(row.id);
  }
  return rows;
};
try {
  server = await startServer(base, runRateSalt);
  const settings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  });
  assert.equal((await settings.json()).disable_signup, true);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let captured;
  page.on("request", (r) => {
    if (r.url() === `${base}/api/reservations` && r.method() === "POST") {
      captured = r.postDataJSON();
      keys.add(captured.key);
    }
  });
  stage = "today availability in real localhost browser";
  const waiting = page.waitForResponse((r) =>
    r.url().includes("/api/availability?"),
  );
  await page.goto(`${base}/reservasi`);
  const response = await waiting,
    availability = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(new URL(response.url()).searchParams.get("date"), today);
  assert.deepEqual(
    availability.slots,
    checked(await service.rpc("availability", { p_date: today })),
  );
  assert.deepEqual(
    availability.slots.map((s) => s.slot),
    SLOTS,
  );
  assert.equal(
    await page.locator('input[type="date"], .date-strip').count(),
    0,
  );
  const free = availability.slots.filter((s) => s.available);
  if (!free.length) {
    await page.locator('.slots[aria-busy="false"]').waitFor();
    assert.equal(await page.locator(".slots button").count(), SLOTS.length);
    assert.equal(await page.locator(".slots button:disabled").count(), SLOTS.length);
    writeFileSync(`${out}/availability.json`, JSON.stringify({ date: today, status: response.status(), json: availability }, null, 2));
    await page.screenshot({ path: `${out}/same-day-cutoff-390.png`, fullPage: true });
    pass("real browser/API/RPC show exactly five slots; all disabled consistently with actual cutoff/occupancy");
    const noMeta = await api("/api/cron/reminders", "GET", null, { Authorization: `Bearer ${process.env.CRON_SECRET}` });
    assert.equal(noMeta.status, 503);
    assert.equal(noMeta.data.processed, 0);
    pass("authenticated no-Meta cron returns 503 processed=0 without worker claim");
    throw Object.assign(new Error("No real slot remains before today's cutoff"), { blocked: true });
  }
  await page.locator('.slots[aria-busy="false"]').waitFor();
  for (const { slot, available } of availability.slots) {
    const button = page.getByRole("button", {
      name: slot.replace(":", "."),
      exact: true,
    });
    assert.equal(await button.isEnabled(), available);
    if (available) {
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
  }
  const slot = free.at(-1).slot;
  assert.equal((await api(`/api/availability?date=${eventDate}`)).status, 400);
  assert.equal(
    checked(await service.rpc("availability", { p_date: eventDate })).some(
      (s) => s.available,
    ),
    false,
  );
  writeFileSync(
    `${out}/availability.json`,
    JSON.stringify(
      { date: today, status: response.status(), json: availability },
      null,
      2,
    ),
  );
  pass(
    "today only; real API/RPC dates match; available slots actually clicked; tomorrow rejected",
  );
  async function fill(unknown) {
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await page.getByLabel("Nama Lengkap", { exact: true }).fill(tag);
    await page
      .getByLabel("Nomor HP/WhatsApp", { exact: true })
      .fill("081234567890");
    await page.getByLabel("Berat Badan (kg)", { exact: true }).fill("50");
    await page.getByLabel("Tinggi Badan (cm)", { exact: true }).fill("160");
    await page
      .getByLabel("Informasi Rencana Acara")
      .fill("Acara keluarga sintetis");
    if (unknown) {
      await page.getByLabel("Tanggal Acara", { exact: true }).fill(eventDate);
      await page.getByLabel("Saya belum memiliki tanggal acara pasti").check();
      assert.equal(
        await page.getByLabel("Tanggal Acara", { exact: true }).isDisabled(),
        true,
      );
      assert.equal(
        await page.getByLabel("Tanggal Acara", { exact: true }).inputValue(),
        "",
      );
    } else
      await page.getByLabel("Tanggal Acara", { exact: true }).fill(eventDate);
    await page.getByRole("button", { name: "Baca syarat" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Konfirmasi reservasi" })
        .isDisabled(),
      true,
    );
  }
  await fill(false);
  stage = "terms at all mobile widths";
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.locator(".visit-terms li").count(), 10);
    assert.equal(await page.locator(".terms-notice").isVisible(), true);
    assert.equal(await page.getByRole("checkbox").count(), 4);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `${out}/terms-${width}.png`,
      fullPage: true,
    });
  }
  pass(
    "complete terms, yellow notice and four separate consents at 360/390/430px without overflow",
  );
  async function confirm() {
    for (let i = 0; i < 4; i++) {
      if (i < 3)
        assert.equal(
          await page
            .getByRole("button", { name: "Konfirmasi reservasi" })
            .isDisabled(),
          true,
        );
      await page.getByRole("checkbox").nth(i).check();
    }
    assert.equal(
      await page
        .getByRole("button", { name: "Konfirmasi reservasi" })
        .isEnabled(),
      true,
    );
    const [r] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url() === `${base}/api/reservations` &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Konfirmasi reservasi" }).click(),
    ]);
    assert.equal(r.status(), 201);
    const receipt = await r.json();
    await page
      .locator(".reference")
      .filter({ hasText: receipt.reference })
      .waitFor();
    assert.ok((await page.locator(".receipt").innerText()).includes("50 kg"));
    return receipt;
  }
  stage = "real UI booking persistence";
  await confirm();
  const first = (await ownRows())[0];
  assert.equal(first.weight_kg, 50);
  assert.equal(first.height_cm, 160);
  assert.equal(first.bust_circumference_cm, null);
  assert.equal(first.event_date, eventDate);
  assert.equal(first.event_date_unknown, false);
  assert.equal(first.phone, "6281234567890");
  assert.equal(first.event_plan, "Acara keluarga sintetis");
  for (const name of [
    "consent_on_time",
    "consent_whatsapp",
    "consent_stock",
    "consent_terms",
  ])
    assert.equal(first[name], true);
  assert.equal(first.terms_version, version);
  assert.ok(first.consented_at);
  assert.equal(first.timezone, "Asia/Jakarta");
  const jobs = checked(
    await service
      .from("reminder_jobs")
      .select("*")
      .eq("reservation_id", first.id),
  );
  assert.equal(jobs.length, 1);
  assert.equal(
    Date.parse(jobs[0].due_at),
    Date.parse(first.appointment_at) - 7200000,
  );
  const replay = await api("/api/reservations", "POST", captured);
  assert.equal(replay.status, 201);
  assert.equal(replay.data.reference, first.reference);
  assert.equal(
    (
      await api("/api/reservations", "POST", {
        ...captured,
        weight_kg: 93,
        height_cm: 160,
      })
    ).status,
    409,
  );
  const future = { ...captured, key: randomUUID(), date: eventDate };
  keys.add(future.key);
  assert.equal((await api("/api/reservations", "POST", future)).status, 409);
  pass(
    "known event date, measurement, four consents/version/timezone persisted atomically; H-2 job; replay stable and altered/future booking rejected",
  );
  stage = "controlled Auth admin and nonadmin";
  async function user(admin) {
    const password = randomBytes(32).toString("hex"),
      email = `freevisit-${randomUUID()}@example.invalid`;
    const result = checked(
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    secretValues.push(password);
    users.push(result.user.id);
    if (admin)
      checked(await service.from("admins").insert({ user_id: result.user.id }));
    const client = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      options,
    );
    const signed = checked(
      await client.auth.signInWithPassword({ email, password }),
    );
    secretValues.push(
      signed.session.access_token,
      signed.session.refresh_token,
    );
    return { id: result.user.id, email, password, client };
  }
  const admin = await user(true),
    nonadmin = await user(false);
  await authorization({
    anon,
    nonadmin,
    admin,
    service,
    first,
    jobs,
    captured,
    today,
  });
  pass(
    "Data API private reads and insert/update/delete denied; private RPC authorization",
  );
  const adminPage = await context.newPage();
  await adminPage.goto(`${base}/admin`);
  await adminPage.getByLabel("Email", { exact: true }).fill(admin.email);
  await adminPage.getByLabel("Kata sandi").fill(admin.password);
  await adminPage.getByRole("button", { name: "Masuk", exact: true }).click();
  const card = adminPage
    .locator(".reservation-item")
    .filter({ hasText: first.reference });
  await card.waitFor();
  const details = await card.innerText();
  for (const value of [
    "50 kg",
    eventDate,
    version,
    "Asia/Jakarta",
    "Acara keluarga sintetis",
    "On time: Ya",
    "Konfirmasi WhatsApp: Ya",
    "Stok: Ya",
    "Syarat: Ya",
  ])
    assert.ok(details.includes(value));
  const adminHttp = await adminStatus({
    context,
    base,
    api,
    service,
    first,
    admin,
    today,
  });
  pass(
    "admin HTTP session, 401/400/409, persisted status, audit actor/time and filters",
  );
  assert.equal(
    checked(
      await service
        .from("reminder_jobs")
        .select("status")
        .eq("reservation_id", first.id)
        .single(),
    ).status,
    "cancelled",
  );
  pass(
    "new details visible in actual admin UI; nonadmin RLS/write/RPC denial; old booking RPC disabled; cancellation cancels reminder",
  );
  stage = "unknown event date through UI";
  await page.goto(`${base}/reservasi`);
  await page.locator('.slots[aria-busy="false"]').waitFor();
  await page
    .getByRole("button", { name: slot.replace(":", "."), exact: true })
    .click();
  await fill(true);
  await confirm();
  const second = (await ownRows()).find((r) => r.status === "pending");
  assert.ok(second);
  assert.equal(second.event_date, null);
  assert.equal(second.event_date_unknown, true);
  await adminHttp({ id: second.id, status: "cancelled" });
  pass(
    "second real UI booking stores unknown event date=true and null date; receipt includes customer details",
  );
  stage = "parallel slot race and idempotency";
  const competitors = [
    { ...captured, key: randomUUID() },
    { ...captured, key: randomUUID() },
  ];
  competitors.forEach((p) => keys.add(p.key));
  const race = await Promise.all(
    competitors.map((p) => api("/api/reservations", "POST", p)),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const winner = competitors[race.findIndex((r) => r.status === 201)];
  const replays = await Promise.all([
    api("/api/reservations", "POST", winner),
    api("/api/reservations", "POST", winner),
  ]);
  assert.ok(replays.every((r) => r.status === 201));
  assert.equal(replays[0].data.reference, replays[1].data.reference);
  const rows = await ownRows(),
    active = rows.filter((r) => r.status !== "cancelled");
  assert.equal(active.length, 1);
  const activeJobs = checked(
    await service
      .from("reminder_jobs")
      .select("*")
      .eq("reservation_id", active[0].id),
  );
  assert.equal(activeJobs.length, 1);
  pass(
    "real simultaneous requests: one winner, one conflict; parallel replay identical; one active booking/reminder",
  );
  stage = "cron no credentials and worker locking";
  const crons = await Promise.all(
    [0, 1].map(() =>
      api("/api/cron/reminders", "GET", undefined, {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      }),
    ),
  );
  for (const cron of crons) {
    assert.equal(cron.status, 503);
    assert.equal(cron.data.processed, 0);
    assert.equal(cron.data.configured, false);
  }
  assert.equal((await api("/api/cron/reminders")).status, 401);
  assert.deepEqual(
    checked(
      await service
        .from("reminder_jobs")
        .select("*")
        .eq("reservation_id", active[0].id),
    ),
    activeJobs,
  );
  await ownRows();
  assert.ok(active.every((row) => fixtureIds.has(row.id)));
  // No shared global claim, even after empty preflight: concurrent real jobs can arrive.
  results.push({
    check: "shared global worker claim disabled for fixture safety",
    status: "SKIPPED",
  });
  pass(
    "owned server without Meta: 503/configured=false/processed=0; no job mutation",
  );
  await isolatedWorker(results);
  checked(await service.from("admins").delete().eq("user_id", admin.id));
  assert.equal(
    checked(await admin.client.from("reservations").select("id")).length,
    0,
  );
  await adminHttp({ id: first.id, status: "confirmed" }, 403);
  assert.equal(
    (await context.request.get(`${base}/api/admin/reservations`)).status(),
    403,
  );
  assert.equal(
    (
      await api("/api/admin/session", "POST", {
        email: nonadmin.email,
        password: nonadmin.password,
      })
    ).status,
    403,
  );
  pass(
    "non-admin login 403; revoked authenticated session GET/PATCH 403 and RLS denial",
  );
} catch (error) {
  const status = error?.blocked ? "BLOCKED" : "FAIL";
  results.push({ check: stage, status });
  console.error(`${status}: ${stage}; ${error?.blocked ? "no same-day slot remains before cutoff; booking/race/replay not run" : "sensitive errors suppressed"}`);
  process.exitCode = 1;
} finally {
  try {
    await ownRows();
    for (const id of fixtureIds) {
      const r = { id };
      checked(
        await service.from("reminder_jobs").delete().eq("reservation_id", r.id),
      );
      checked(
        await service
          .from("reservation_audit")
          .delete()
          .eq("reservation_id", r.id),
      );
      checked(await service.from("reservations").delete().eq("id", r.id));
    }
    for (const id of fixtureIds) {
      for (const table of ["reminder_jobs", "reservation_audit"])
        assert.equal(
          checked(
            await service.from(table).select("id").eq("reservation_id", id),
          ).length,
          0,
        );
      assert.equal(
        checked(await service.from("reservations").select("id").eq("id", id))
          .length,
        0,
      );
    }
    for (const key of runRateKeys) {
      checked(await service.from("rate_limits").delete().eq("key", key));
      assert.equal(
        checked(await service.from("rate_limits").select("key").eq("key", key))
          .length,
        0,
      );
    }
    for (const id of users) {
      checked(await service.from("admins").delete().eq("user_id", id));
      checked(await service.auth.admin.deleteUser(id));
      assert.ok((await service.auth.admin.getUserById(id)).error);
      assert.equal(
        checked(
          await service.from("admins").select("user_id").eq("user_id", id),
        ).length,
        0,
      );
    }
    assert.equal((await ownRows()).length, 0);
    cleanup = true;
    pass("synthetic reservations/jobs/audits/admin/Auth users cleaned");
  } catch {
    process.exitCode = 1;
    console.error("FAIL: cleanup requires attention");
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
    function walk(dir) {
      if (!existsSync(dir)) return [];
      return readdirSync(dir).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    }
    for (const file of new Set([
      ...files,
      ...walk(".next/static"),
      ...walk("test-results"),
    ])) {
      const content = readFileSync(file);
      assert.ok(
        secretValues.every((secret) => !content.includes(Buffer.from(secret))),
        "runtime secret found; value suppressed",
      );
    }
    pass(
      "exact runtime-secret scan: source, Git candidates, client bundle and test artifacts clean",
    );
  } catch {
    process.exitCode = 1;
    results.push({ check: "exact secret scan", status: "FAIL" });
    console.error("FAIL: secret scan; values suppressed");
  }
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        today,
        cleanup,
        whatsappRequests: 0,
        results,
      },
      null,
      2,
    ),
  );
}
