import { SLOTS } from "../lib/schedule.mjs";
const uiSlot = SLOTS.at(-1);
const raceSlot = SLOTS.at(-2);
// Live integration gate. Credentials stay in memory; provider credentials are removed.
// No traces, HAR, storageState, request headers, or raw errors are written to disk.
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ref = "bwxtvtuttunedomahnds";
const base = "http://localhost:3100";
const tag = `Gate ${randomUUID().slice(0, 8)}`;
const bookingKeys = [],
  userIds = [],
  secretValues = [],
  results = [];
let stage = "verify linked project",
  server,
  browser,
  service,
  anonKey,
  salt;
let cleanupPassed = false;
function check(condition, label) {
  stage = label;
  if (!condition) throw new Error("GATE_FAILED");
}
function pass(label) {
  results.push({ check: label, status: "PASS" });
  console.log(`PASS: ${label}`);
}
function ok(result, label) {
  check(!result.error, label);
  return result.data;
}
function secret() {
  const value = randomBytes(32).toString("hex");
  secretValues.push(value);
  return value;
}
function cli(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      ["node_modules/supabase/dist/supabase.js", ...args],
      { timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (error, stdout) =>
        error ? reject(new Error("CLI_FAILED")) : resolve(stdout),
    );
    child.stdin.end();
  });
}
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};
function datePlus(days) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function labelDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}
async function api(url, method = "GET", data, headers = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { Origin: base, "Content-Type": "application/json", ...headers },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
function payload(date, slot, instagram = "") {
  const key = randomUUID();
  bookingKeys.push(key);
  return {
    key,
    name: tag,
    instagram,
    phone: "081234567890",
    date,
    slot,
    policy: true,
    reminder: true,
  };
}
async function ownReservations() {
  if (!bookingKeys.length) return [];
  return ok(
    await service
      .from("reservations")
      .select("*")
      .in("idempotency_key", bookingKeys),
    "read own synthetic reservations",
  );
}
async function ownJobs() {
  const reservations = await ownReservations();
  if (!reservations.length) return [];
  return ok(
    await service
      .from("reminder_jobs")
      .select("*")
      .in(
        "reservation_id",
        reservations.map((r) => r.id),
      ),
    "read own synthetic jobs",
  );
}
async function syntheticUser(isAdmin) {
  const email = `fitting-gate-${randomUUID()}@example.invalid`,
    password = secret();
  const data = ok(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
    "create controlled synthetic Auth user",
  );
  userIds.push(data.user.id);
  if (isAdmin)
    ok(
      await service.from("admins").insert({ user_id: data.user.id }),
      "register controlled admin membership",
    );
  const authClient = createClient(
    `https://${ref}.supabase.co`,
    anonKey,
    clientOptions,
  );
  const auth = ok(
    await authClient.auth.signInWithPassword({ email, password }),
    "sign in real Supabase Auth",
  );
  secretValues.push(auth.session.access_token, auth.session.refresh_token);
  return { id: data.user.id, email, password, authClient };
}
function walk(dir) {
  try {
    return readdirSync(dir).flatMap((name) => {
      const file = path.join(dir, name);
      return statSync(file).isDirectory() ? walk(file) : [file];
    });
  } catch {
    return [];
  }
}
async function scanExactSecrets() {
  const files = await new Promise((resolve, reject) =>
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      (error, stdout) =>
        error
          ? reject(new Error("SCAN_FAILED"))
          : resolve(stdout.split("\0").filter(Boolean)),
    ),
  );
  for (const file of new Set([
    ...files,
    ...walk(".next/static"),
    ...walk("test-results"),
  ])) {
    const bytes = readFileSync(file);
    check(
      !secretValues.some(
        (value) => value && bytes.includes(Buffer.from(value)),
      ),
      "no runtime secret in source, Git candidates, client bundle or test artifacts",
    );
  }
  pass(
    "exact runtime-secret scan across source, Git candidates, client bundle and test artifacts",
  );
}

try {
  check(
    readFileSync("supabase/.temp/project-ref", "utf8").trim() === ref,
    "project ref is lakuh-fitting",
  );
  check(
    JSON.parse(readFileSync("supabase/.temp/linked-project.json", "utf8"))
      .name === "lakuh-fitting",
    "linked project name is lakuh-fitting",
  );
  stage = "load authorized credentials into memory";
  const keys = JSON.parse(
    await cli([
      "projects",
      "api-keys",
      "--project-ref",
      ref,
      "--output",
      "json",
      "--reveal",
    ]),
  );
  anonKey =
    keys.find((k) => k.name === "anon")?.api_key ??
    keys.find((k) => k.type === "publishable")?.api_key;
  const serviceKey =
    keys.find((k) => k.name === "service_role")?.api_key ??
    keys.find((k) => k.type === "secret")?.api_key;
  check(!!anonKey && !!serviceKey, "required Supabase credentials available");
  secretValues.push(anonKey, serviceKey);
  service = createClient(
    `https://${ref}.supabase.co`,
    serviceKey,
    clientOptions,
  );
  const anon = createClient(
    `https://${ref}.supabase.co`,
    anonKey,
    clientOptions,
  );
  const authSettings = await fetch(
    `https://${ref}.supabase.co/auth/v1/settings`,
    { headers: { apikey: anonKey } },
  );
  check(
    authSettings.ok && (await authSettings.json()).disable_signup === true,
    "public signup disabled remotely",
  );
  pass("project identity and remote public signup disabled");

  // Use only an unoccupied future date, preserving any real reservations.
  let date;
  for (const offset of [1]) {
    const candidate = datePlus(offset);
    const available = ok(
      await service.rpc("availability", { p_date: candidate }),
      "read database availability",
    );
    if (
      available.length === SLOTS.length &&
      available.every((s) => s.available)
    ) {
      date = candidate;
      break;
    }
  }
  check(!!date, "find a fully free future date for synthetic test");
  const cron = secret();
  salt = secret();
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    RATE_LIMIT_SALT: salt,
    CRON_SECRET: cron,
    DATABASE_URL: "",
  };
  for (const name of Object.keys(env))
    if (name.startsWith("WHATSAPP_")) delete env[name];
  check(
    !Object.keys(env).some((k) => k.startsWith("WHATSAPP_")),
    "provider credentials absent from test server",
  );
  stage = "launch production server with memory-only environment";
  let occupied = false;
  try {
    await fetch(base, { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch {
    /* expected unused port */
  }
  check(!occupied, "integration port is free");
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3100"],
    { env, stdio: "ignore", windowsHide: true },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${base}/reservasi`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(ready, "production server ready");
  const databaseSlots = ok(
    await service.rpc("availability", { p_date: date }),
    "database slots",
  );
  const serverSlots = await api(`/api/availability?date=${date}`);
  check(
    serverSlots.status === 200 &&
      JSON.stringify(serverSlots.data.slots) === JSON.stringify(databaseSlots),
    "public availability equals database RPC",
  );
  check(
    (await api(`/api/availability?date=${datePlus(31)}`)).status === 400,
    "server rejects day 31",
  );
  check(
    JSON.stringify(serverSlots.data.slots.map((s) => s.slot)) ===
      JSON.stringify(SLOTS),
    "database schedule matches shared configuration",
  );
  const past = ok(
    await service.rpc("availability", { p_date: datePlus(-1) }),
    "past availability RPC",
  );
  check(
    past.every((s) => !s.available),
    "database rejects past dates",
  );
  pass("availability and date boundaries use real server/database");

  process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
    "node_modules/.cache/ms-playwright",
  );
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  // No API interception. Capture only our booking payload in memory for replay.
  let uiPayload;
  page.on("request", (request) => {
    if (
      request.url() === `${base}/api/reservations` &&
      request.method() === "POST"
    ) {
      uiPayload = request.postDataJSON();
      bookingKeys.push(uiPayload.key);
    }
  });
  stage = "real mobile UI booking";
  await page.goto(`${base}/reservasi`);
  await page
    .getByRole("button", { name: labelDate(date), exact: true })
    .click();
  for (const slot of SLOTS) {
    const button = page.getByRole("button", {
      name: slot.replace(":", "."),
      exact: true,
    });
    await button.click();
    check(
      (await button.getAttribute("aria-pressed")) === "true",
      "tomorrow slot actually selectable",
    );
    check(
      await page.getByRole("button", { name: "Lanjutkan" }).isEnabled(),
      "selection enables next step",
    );
  }
  check(
    (await page
      .locator(".slots")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      )) === 2,
    "mobile two-column slots",
  );
  await page.screenshot({
    path: "test-results/final-gate/live-mobile-tomorrow.png",
    fullPage: true,
  });
  pass(
    "tomorrow: ten slots 11:00–20:00 actually clicked and selected; two-column mobile grid",
  );
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByLabel("Nama lengkap").fill(tag);
  await page.getByLabel("Instagram (opsional)").fill("@fitting_gate");
  await page.getByLabel("Nomor WhatsApp").fill("081234567890");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Periksa reservasi" }).click();
  const responseWait = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/reservations` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
  const response = await responseWait;
  if (response.status() !== 201) {
    const safeReply = await response.json();
    const safeMessages = [
      "Akses ditolak.",
      "Data tidak valid.",
      "Layanan belum tersedia. Silakan coba kembali nanti.",
      "Username Instagram tidak valid.",
      "Nama harus 2–80 karakter.",
      "Kunci reservasi tidak valid.",
      "Jadwal sudah tidak tersedia. Silakan pilih jadwal lain.",
    ];
    console.error(
      `UI diagnostic: HTTP ${response.status()}, ${safeMessages.includes(safeReply.error) ? safeReply.error : "response message suppressed"}`,
    );
  }
  check(
    response.status() === 201,
    `UI booking HTTP 201 (received ${response.status()})`,
  );
  const receipt = await response.json();
  stage = "receipt visible after real UI booking";
  await page
    .locator(".reference")
    .filter({ hasText: receipt.reference })
    .waitFor();
  const [reservation] = await ownReservations();
  check(
    reservation.name === tag &&
      reservation.instagram === "fitting_gate" &&
      reservation.phone === "6281234567890",
    "UI name, Instagram and normalized WhatsApp persisted",
  );
  check(
    reservation.status === "pending" &&
      reservation.reference === receipt.reference,
    "status and reference persisted",
  );
  check(
    Date.parse(reservation.appointment_at) ===
      Date.parse(`${date}T${uiSlot}:00+07:00`),
    "appointment date/time persisted in Jakarta timezone",
  );
  check(
    !!reservation.consent_at &&
      !!reservation.reminder_consent_at &&
      !!reservation.policy_version &&
      reservation.request_payload.policy === true &&
      reservation.request_payload.reminder === true,
    "both consents and audit version persisted",
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "real mobile receipt has no horizontal overflow",
  );
  mkdirSync("test-results/final-gate", { recursive: true });
  await page.screenshot({
    path: "test-results/final-gate/live-mobile-receipt.png",
    fullPage: true,
    scale: "css",
  });
  const unavailable = await api(`/api/availability?date=${date}`);
  check(
    unavailable.data.slots.find((s) => s.slot === uiSlot).available === false,
    "booking changes real availability",
  );
  pass(
    "real mobile UI booking persisted all fields, consents, reference and normalized WhatsApp",
  );
  const initialJobs = await ownJobs();
  check(
    initialJobs.length === 1 &&
      initialJobs[0].status === "scheduled" &&
      initialJobs[0].attempt_count === 0,
    "exactly one initial scheduled reminder",
  );
  check(
    Date.parse(initialJobs[0].due_at) ===
      Date.parse(reservation.appointment_at) - 7200000,
    "reminder exactly H-2",
  );
  pass("booking creates exactly one reminder due exactly H-2");

  const replay = await Promise.all([
    api("/api/reservations", "POST", uiPayload),
    api("/api/reservations", "POST", uiPayload),
  ]);
  check(
    replay.every(
      (r) => r.status === 201 && r.data.reference === receipt.reference,
    ),
    "parallel identical idempotency keys return same receipt",
  );
  check(
    (await ownReservations()).length === 1 && (await ownJobs()).length === 1,
    "replay creates no duplicate reservation/reminder",
  );
  check(
    (
      await api("/api/reservations", "POST", {
        ...uiPayload,
        name: `${tag} Changed`,
      })
    ).status === 409,
    "changed payload with same key rejected",
  );
  pass(
    "parallel idempotency replay is stable; changed payload rejected; no duplicates",
  );

  // Occupy eight more slots, leaving only the last slot for two concurrent requests.
  for (const slot of SLOTS.slice(0, -2))
    check(
      (await api("/api/reservations", "POST", payload(date, slot))).status ===
        201,
      "prepare occupied synthetic slots",
    );
  const last = await api(`/api/availability?date=${date}`);
  check(
    last.data.slots.filter((s) => s.available).length === 1 &&
      last.data.slots.find((s) => s.available).slot === raceSlot,
    "one final available slot",
  );
  const competitors = [payload(date, raceSlot), payload(date, raceSlot)];
  const race = await Promise.all(
    competitors.map((p) => api("/api/reservations", "POST", p)),
  );
  check(
    race.filter((r) => r.status === 201).length === 1 &&
      race.filter((r) => r.status === 409).length === 1,
    "last slot race returns one 201 and one 409",
  );
  const rows = await ownReservations();
  check(
    rows.length === SLOTS.length &&
      rows.filter(
        (r) =>
          Date.parse(r.appointment_at) ===
          Date.parse(`${date}T${raceSlot}:00+07:00`),
      ).length === 1,
    "ten total bookings and one last-slot winner",
  );
  check(
    rows.filter((r) => r.instagram === "").length === SLOTS.length - 1,
    "optional Instagram accepted empty",
  );
  const jobs = await ownJobs();
  check(
    jobs.length === SLOTS.length &&
      new Set(jobs.map((j) => j.reservation_id)).size === SLOTS.length,
    "one reminder per successful booking only",
  );
  check(
    jobs.every(
      (j) =>
        Date.parse(j.due_at) ===
        Date.parse(rows.find((r) => r.id === j.reservation_id).appointment_at) -
          7200000,
    ),
    "all reminders are H-2",
  );
  pass(
    "two concurrent requests for final slot: one booking, one conflict, ten total reminders",
  );

  const adminUser = await syntheticUser(true),
    otherUser = await syntheticUser(false);
  const forbiddenTables = [
    "admins",
    "reservations",
    "reservation_audit",
    "reminder_jobs",
    "rate_limits",
  ];
  for (const table of forbiddenTables) {
    const publicRead = await anon.from(table).select("*").limit(1);
    check(
      !!publicRead.error || publicRead.data?.length === 0,
      `anon cannot read ${table}`,
    );
    const otherRead = await otherUser.authClient
      .from(table)
      .select("*")
      .limit(1);
    check(
      !!otherRead.error || otherRead.data?.length === 0,
      `non-admin cannot read ${table}`,
    );
  }
  const rpcArgs = {
    p_key: randomUUID(),
    p_name: tag,
    p_instagram: "",
    p_phone: "6281234567890",
    p_date: date,
    p_slot: raceSlot,
    p_policy: true,
    p_reminder: true,
  };
  for (const client of [anon, otherUser.authClient, adminUser.authClient]) {
    check(
      !!(await client.rpc("book_fitting", rpcArgs)).error,
      "public/admin cannot bypass server booking RPC gate",
    );
    check(
      !!(await client.rpc("availability", { p_date: date })).error,
      "availability RPC restricted to server",
    );
    check(
      !!(await client.rpc("claim_reminders", { p_limit: 1 })).error,
      "claim RPC restricted to server",
    );
    check(
      !!(
        await client.rpc("take_rate_limit", {
          p_key: "gate-denied",
          p_limit: 1,
        })
      ).error,
      "rate-limit RPC restricted to server",
    );
    check(
      !!(
        await client
          .from("reservations")
          .update({ name: "forbidden" })
          .eq("id", reservation.id)
      ).error,
      "direct reservation write denied",
    );
    check(
      !!(
        await client
          .from("reminder_jobs")
          .update({ status: "sent" })
          .eq("id", initialJobs[0].id)
      ).error,
      "direct reminder write denied",
    );
    check(
      !!(
        await client
          .from("reservation_audit")
          .delete()
          .eq("reservation_id", reservation.id)
      ).error,
      "direct audit deletion denied",
    );
    check(
      !!(await client.from("admins").insert({ user_id: otherUser.id })).error,
      "direct admin self-promotion denied",
    );
    check(
      !!(await client.from("rate_limits").delete().eq("key", "gate-denied"))
        .error,
      "direct rate-limit write denied",
    );
  }
  check(
    !!(
      await otherUser.authClient.rpc("change_status", {
        p_id: reservation.id,
        p_status: "cancelled",
      })
    ).error,
    "non-admin status RPC denied",
  );
  check(
    !!(
      await anon.rpc("change_status", {
        p_id: reservation.id,
        p_status: "cancelled",
      })
    ).error,
    "anon status RPC denied",
  );
  check(
    ok(
      await adminUser.authClient
        .from("reservations")
        .select("id")
        .eq("id", reservation.id),
      "admin authorized RLS read",
    ).length === 1,
    "admin sees authorized reservation",
  );
  pass(
    "live anon/non-admin RLS on all five tables; all privileged RPC/direct writes denied",
  );

  check(
    (await api("/api/admin/reservations")).status === 401,
    "unauthenticated admin API denied",
  );
  const nonAdminLogin = await api("/api/admin/session", "POST", {
    email: otherUser.email,
    password: otherUser.password,
  });
  check(
    nonAdminLogin.status === 403,
    "valid non-admin login rejected by app authorization",
  );
  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const adminPage = await adminContext.newPage();
  stage = "real admin UI login";
  await adminPage.goto(`${base}/admin`);
  await adminPage.getByLabel("Email", { exact: true }).fill(adminUser.email);
  await adminPage.getByLabel("Kata sandi").fill(adminUser.password);
  await adminPage.getByRole("button", { name: "Masuk", exact: true }).click();
  await adminPage.getByRole("button", { name: "Keluar dari akun" }).waitFor();
  const adminRead = await adminContext.request.get(
    `${base}/api/admin/reservations?q=${encodeURIComponent(tag)}`,
  );
  check(
    adminRead.status() === 200 &&
      (await adminRead.json()).reservations.length === SLOTS.length,
    "admin API reads ten synthetic records",
  );
  const eveningCard = adminPage
    .locator(".reservation-item")
    .filter({ hasText: receipt.reference });
  await eveningCard.waitFor();
  check(
    (await eveningCard.innerText()).includes(uiSlot.replace(":", ".")),
    "admin detail renders 20:00 WIB appointment",
  );
  const change = async (status) =>
    adminContext.request.patch(`${base}/api/admin/reservations`, {
      headers: { Origin: base },
      data: { id: reservation.id, status },
    });
  check(
    (await change("confirmed")).status() === 200,
    "authorized confirm transition",
  );
  check(
    (await change("completed")).status() === 409,
    "premature completion denied",
  );
  check(
    (await change("cancelled")).status() === 200,
    "authorized cancel transition",
  );
  const cancelled = (await ownReservations()).find(
    (r) => r.id === reservation.id,
  );
  const cancelledJob = (await ownJobs()).find(
    (j) => j.reservation_id === reservation.id,
  );
  check(
    cancelled.status === "cancelled" && cancelledJob.status === "cancelled",
    "cancel reservation cancels reminder",
  );
  const audit = ok(
    await service
      .from("reservation_audit")
      .select("*")
      .eq("reservation_id", reservation.id),
    "read synthetic status audit",
  );
  check(
    audit.length === 3 &&
      audit.filter((a) => a.actor_id === adminUser.id).length === 2 &&
      audit.every((a) => !!a.changed_at),
    "status transitions audited with actor and timestamp",
  );
  check(
    (await api(`/api/availability?date=${date}`)).data.slots.find(
      (s) => s.slot === uiSlot,
    ).available === true,
    "cancel restores availability",
  );
  pass(
    "real admin Auth/UI/API, controlled transitions, audit and cancellation of reminder",
  );
  // Revoking membership must revoke access even while an authenticated session remains.
  ok(
    await service.from("admins").delete().eq("user_id", adminUser.id),
    "revoke synthetic membership",
  );
  check(
    (
      await adminContext.request.get(`${base}/api/admin/reservations`)
    ).status() === 403,
    "revoked admin API access denied immediately",
  );
  check(
    ok(
      await adminUser.authClient
        .from("reservations")
        .select("id")
        .eq("id", reservation.id),
      "revoked admin RLS query",
    ).length === 0,
    "revoked admin sees no personal data",
  );
  pass("revoked admin session loses API and RLS access immediately");

  // Only make a synthetic job due; never touch preexisting jobs.
  const nearDue = ok(
    await service
      .from("reminder_jobs")
      .select("id")
      .eq("status", "scheduled")
      .lte("next_attempt_at", new Date(Date.now() + 300000).toISOString()),
    "check no unrelated due jobs",
  );
  const processing = ok(
    await service.from("reminder_jobs").select("id").eq("status", "processing"),
    "check no unrelated processing jobs",
  );
  check(
    nearDue.length === 0 && processing.length === 0,
    "safe isolated worker-claim test window",
  );
  const dueJob = (await ownJobs()).find((j) => j.status === "scheduled");
  ok(
    await service
      .from("reminder_jobs")
      .update({ next_attempt_at: new Date(Date.now() - 60000).toISOString() })
      .eq("id", dueJob.id),
    "make one synthetic reminder due",
  );
  const beforeWorker = await ownJobs();
  const workerCalls = await Promise.all([
    api("/api/cron/reminders", "GET", undefined, {
      Authorization: `Bearer ${cron}`,
    }),
    api("/api/cron/reminders", "GET", undefined, {
      Authorization: `Bearer ${cron}`,
    }),
  ]);
  check(
    workerCalls.every(
      (r) =>
        r.status === 503 &&
        r.data.configured === false &&
        r.data.processed === 0,
    ),
    "unconfigured workers return 503, not success",
  );
  check(
    JSON.stringify(await ownJobs()) === JSON.stringify(beforeWorker),
    "unconfigured workers leave jobs and attempts unchanged",
  );
  check(
    (await api("/api/cron/reminders")).status === 401,
    "cron without secret rejected",
  );
  pass(
    "parallel real cron calls without Meta credentials: 503, zero sends, zero job/attempt changes",
  );
  // Two independent PostgREST requests reach the same database claim function.
  const workerA = createClient(
    `https://${ref}.supabase.co`,
    serviceKey,
    clientOptions,
  );
  const workerB = createClient(
    `https://${ref}.supabase.co`,
    serviceKey,
    clientOptions,
  );
  const claims = await Promise.all([
    workerA.rpc("claim_reminders", { p_limit: 1 }),
    workerB.rpc("claim_reminders", { p_limit: 1 }),
  ]);
  const claimed = claims.flatMap((r) =>
    ok(r, "concurrent database worker claim"),
  );
  check(
    claimed.length === 1 &&
      claimed[0].id === dueJob.id &&
      claimed[0].attempt_count === 1,
    "parallel workers claim due job exactly once",
  );
  check(
    claims.filter((r) => r.data.length === 0).length === 1,
    "second worker receives no duplicate job",
  );
  check(
    (await ownJobs()).every(
      (j) => j.status !== "sent" && !j.sent_at && !j.provider_message_id,
    ),
    "no synthetic reminder marked sent",
  );
  pass(
    "parallel worker RPC claims are disjoint: one processing job, attempt_count 1, no sent status",
  );
} catch {
  results.push({ check: stage, status: "FAIL" });
  console.error(`FAIL: ${stage}; raw error and credential values suppressed.`);
  process.exitCode = 1;
} finally {
  try {
    if (service) {
      const own = await ownReservations(),
        ids = own.map((r) => r.id);
      if (ids.length) {
        ok(
          await service
            .from("reminder_jobs")
            .delete()
            .in("reservation_id", ids),
          "cleanup synthetic reminder jobs",
        );
        ok(
          await service
            .from("reservation_audit")
            .delete()
            .in("reservation_id", ids),
          "cleanup synthetic audit",
        );
        ok(
          await service.from("reservations").delete().in("id", ids),
          "cleanup synthetic reservations",
        );
      }
      if (userIds.length) {
        ok(
          await service.from("admins").delete().in("user_id", userIds),
          "cleanup synthetic admin memberships",
        );
        for (const id of userIds)
          ok(
            await service.auth.admin.deleteUser(id),
            "cleanup synthetic Auth users",
          );
      }
      if (salt) {
        const rateKeys = ["booking", "login", "availability"].map((scope) =>
          createHash("sha256").update(`${salt}:${scope}`).digest("hex"),
        );
        ok(
          await service.from("rate_limits").delete().in("key", rateKeys),
          "cleanup this run's rate limits",
        );
        check(
          ok(
            await service.from("rate_limits").select("key").in("key", rateKeys),
            "verify rate-limit cleanup",
          ).length === 0,
          "zero remaining synthetic rate limits",
        );
      }
      check(
        (await ownReservations()).length === 0,
        "zero remaining synthetic reservations",
      );
      if (ids.length) {
        check(
          ok(
            await service
              .from("reminder_jobs")
              .select("id")
              .in("reservation_id", ids),
            "verify job cleanup",
          ).length === 0,
          "zero remaining synthetic jobs",
        );
        check(
          ok(
            await service
              .from("reservation_audit")
              .select("id")
              .in("reservation_id", ids),
            "verify audit cleanup",
          ).length === 0,
          "zero remaining synthetic audits",
        );
      }
      for (const id of userIds)
        check(
          !!(await service.auth.admin.getUserById(id)).error,
          "synthetic Auth user no longer exists",
        );
      cleanupPassed = true;
      pass(
        "cleanup verified: synthetic reservations, jobs, audits, admin/Auth users and rate limits removed",
      );
    }
  } catch {
    console.error(
      "FAIL: synthetic cleanup requires attention; no raw errors printed.",
    );
    results.push({ check: "cleanup", status: "FAIL" });
    process.exitCode = 1;
  }
  await browser?.close();
  server?.kill();
  try {
    await scanExactSecrets();
  } catch {
    console.error("FAIL: exact secret scan; values suppressed.");
    results.push({ check: "secret scan", status: "FAIL" });
    process.exitCode = 1;
  }
  mkdirSync("test-results/final-gate", { recursive: true });
  writeFileSync(
    "test-results/final-gate/result.json",
    JSON.stringify(
      {
        project: "lakuh-fitting",
        checkedAt: new Date().toISOString(),
        cleanupPassed,
        whatsappRequests: 0,
        results,
      },
      null,
      2,
    ),
  );
}
