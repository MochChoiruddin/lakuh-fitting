import { SLOTS } from "../lib/schedule.mjs";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.error(
    "BLOCKED: DATABASE_URL is required for independent concurrent database sessions.",
  );
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 4,
  prepare: false,
  connect_timeout: 10,
});
const keys = [randomUUID(), randomUUID()];
let stage = "parallel slot race";
async function book(tx, key) {
  return tx`select public.book_fitting(${key},'Concurrency Test','','6281234567890',(now() at time zone 'Asia/Jakarta')::date+29,${SLOTS.at(-1)},true,true) as receipt`;
}
try {
  const race = await Promise.allSettled(
    keys.map((key) =>
      sql.begin(async (tx) => {
        const result = await book(tx, key);
        await tx`select pg_sleep(1)`;
        return result;
      }),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    race.filter((r) => r.status === "rejected" && r.reason.code === "23505")
      .length,
    1,
  );
  const [winner] =
    await sql`select idempotency_key from public.reservations where idempotency_key in ${sql(keys)}`;
  stage = "parallel idempotency replay";
  const replay = await Promise.all([
    book(sql, winner.idempotency_key),
    book(sql, winner.idempotency_key),
  ]);
  assert.equal(replay[0][0].receipt.reference, replay[1][0].receipt.reference);
  const [count] =
    await sql`select count(*)::int n from public.reminder_jobs where reservation_id in (select id from public.reservations where idempotency_key in ${sql(keys)})`;
  assert.equal(count.n, 1);
  console.log(
    "PASS: concurrent booking rejects conflict; parallel replay returns same receipt; one reminder",
  );
} catch {
  console.error(`FAIL: ${stage}; provider was not called.`);
  process.exitCode = 1;
} finally {
  try {
    await sql.begin(async (tx) => {
      await tx`delete from public.reminder_jobs where reservation_id in (select id from public.reservations where idempotency_key in ${tx(keys)})`;
      await tx`delete from public.reservation_audit where reservation_id in (select id from public.reservations where idempotency_key in ${tx(keys)})`;
      await tx`delete from public.reservations where idempotency_key in ${tx(keys)}`;
    });
  } catch {
    console.error("Cleanup requires operator attention for this test run.");
    process.exitCode = 1;
  }
  await sql.end({ timeout: 5 });
}
