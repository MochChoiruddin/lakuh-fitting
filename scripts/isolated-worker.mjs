// Disposable PostgreSQL 17 container, no host ports, no shared Supabase credentials.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const name = `lakuh-gate-${randomUUID()}`;
const rid = randomUUID(),
  jid = randomUUID();
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120000,
  });
const sql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      name,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
      "-Atq",
    ],
    { input, encoding: "utf8", stdio: "pipe" },
  ).trim();
const claim = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        name,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=verbose",
        "-Atq",
      ],
      { windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error("Isolated claim failed")),
    );
    // Keep the first transaction open while the second attempts SKIP LOCKED.
    child.stdin.end(
      "begin; set local role service_role; select id from public.claim_reminders(1); select pg_sleep(1); commit;",
    );
  });
let created = false,
  status = "FAIL",
  cleanup = false;
try {
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker([
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      docker(["exec", name, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  // Minimal Supabase Auth contract; application migrations are applied verbatim.
  sql(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
  sql(
    `insert into public.reservations(id,idempotency_key,request_payload,name,phone,appointment_at) values('${rid}','${randomUUID()}','{}','${name}','6281234567890',now()+interval '3 hours'); insert into public.reminder_jobs(id,reservation_id,due_at,next_attempt_at) values('${jid}','${rid}',now(),now());`,
  );
  for (const role of ["anon", "authenticated"]) {
    for (const call of [
      "public.claim_reminders(1)",
      `public.take_rate_limit('${name}',1)`,
    ]) {
      assert.throws(
        () => sql(`set role ${role}; select * from ${call};`),
        (error) => String(error.stderr).includes("42501"),
      );
    }
  }
  const outputs = await Promise.all([claim(), claim()]);
  assert.deepEqual(outputs.filter(Boolean), [jid]);
  assert.equal(
    sql(
      `select status||':'||attempt_count||':'||(sent_at is null)::text||':'||(provider_message_id is null)::text from public.reminder_jobs where id='${jid}';`,
    ),
    "processing:1:true:true",
  );
  assert.equal(sql("select count(*) from public.claim_reminders(1);"), "0");
  sql(
    `update public.reminder_jobs set locked_at=now()-interval '6 minutes' where id='${jid}'; select count(*) from public.claim_reminders(1);`,
  );
  assert.equal(
    sql(
      `select status||':'||safe_error from public.reminder_jobs where id='${jid}';`,
    ),
    "failed:DELIVERY_UNKNOWN",
  );
  assert.equal(
    sql(
      `select public.take_rate_limit('${name}',1); select public.take_rate_limit('${name}',1);`,
    ),
    "t\nf",
  );
  status = "PASS";
} catch {
  console.error("FAIL: isolated worker; details suppressed");
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      docker(["rm", "--force", "--volumes", name]);
      cleanup = true;
    } catch {
      process.exitCode = 1;
    }
  }
  mkdirSync("test-results/free-visit", { recursive: true });
  writeFileSync(
    "test-results/free-visit/isolated-worker.json",
    JSON.stringify(
      { status, cleanup, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  if (status === "PASS" && cleanup)
    console.log(
      "PASS: isolated PostgreSQL production migrations, RPC denial, parallel claim, stale lock, rate limit and cleanup",
    );
}
