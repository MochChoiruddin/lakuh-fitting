import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const checked = (r) => {
  assert.equal(r.error, null, "Database check failed");
  return r.data;
};

export async function startServer(base, rateSalt) {
  let occupied = false;
  try {
    await fetch(`${base}/reservasi`);
    occupied = true;
  } catch {
    /* free */
  }
  assert.equal(
    occupied,
    false,
    "Refusing an existing server with unknown Meta environment",
  );
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3100"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        RATE_LIMIT_SALT: rateSalt,
        WHATSAPP_ACCESS_TOKEN: "",
        WHATSAPP_PHONE_NUMBER_ID: "",
        WHATSAPP_TEMPLATE_NAME: "",
        WHATSAPP_TEMPLATE_LANGUAGE: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) break;
    try {
      if ((await fetch(`${base}/reservasi`)).ok) return server;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  server.kill();
  throw new Error("Owned production server not ready");
}

export async function authorization({
  anon,
  nonadmin,
  admin,
  service,
  first,
  jobs,
  captured,
  today,
}) {
  const audit = checked(
    await service
      .from("reservation_audit")
      .select("id")
      .eq("reservation_id", first.id),
  )[0];
  const rateKey = `gate-${randomUUID()}`;
  // Register the exact key before setup and clean even if an assertion fails.
  try {
    checked(
      await service
        .from("rate_limits")
        .insert({ key: rateKey, window_at: new Date().toISOString(), hits: 1 }),
    );
    const tables = [
      ["reservations", "id", first.id, { ...first }, { name: first.name }],
      ["reminder_jobs", "id", jobs[0].id, { ...jobs[0] }, { status: "failed" }],
      [
        "reservation_audit",
        "id",
        audit.id,
        { reservation_id: first.id, new_status: "pending" },
        { new_status: "confirmed" },
      ],
      [
        "admins",
        "user_id",
        admin.id,
        { user_id: nonadmin.id },
        { created_at: new Date().toISOString() },
      ],
      [
        "rate_limits",
        "key",
        rateKey,
        { key: rateKey, window_at: new Date().toISOString(), hits: 1 },
        { hits: 2 },
      ],
    ];
    for (const client of [anon, nonadmin.client, admin.client]) {
      for (const [table, column, id, insert, update] of tables) {
        if (client !== admin.client) {
          const read = await client.from(table).select("*").eq(column, id);
          assert.ok(
            read.error || read.data.length === 0,
            `Private ${table} read denied`,
          );
        }
        // A constraint error does not count as authorization: require SQLSTATE 42501.
        for (const operation of [
          () => client.from(table).insert(insert),
          () => client.from(table).update(update).eq(column, id),
          () => client.from(table).delete().eq(column, id),
        ])
          assert.equal(
            (await operation()).error?.code,
            "42501",
            `Private ${table} write denied`,
          );
      }
      assert.equal(
        (await client.rpc("availability", { p_date: today })).error?.code,
        "42501",
      );
      assert.equal(
        (await client.rpc("book_free_visit", { p_input: captured })).error
          ?.code,
        "42501",
      );
      assert.equal(
        (
          await client.rpc("book_fitting", {
            p_key: first.idempotency_key,
            p_name: first.name,
            p_instagram: "",
            p_phone: first.phone,
            p_date: today,
            p_slot: "15:00",
            p_policy: true,
            p_reminder: true,
          })
        ).error?.code,
        "42501",
      );
      if (client !== admin.client)
        assert.equal(
          (
            await client.rpc("change_status", {
              p_id: first.id,
              p_status: "confirmed",
            })
          ).error?.code,
          "42501",
        );
    }
    // Global claim/rate RPC negative tests run isolated: a grant regression must not
    // cause a test itself to mutate other users' jobs or delete expired rate buckets.
  } finally {
    checked(await service.from("rate_limits").delete().eq("key", rateKey));
    assert.equal(
      checked(
        await service.from("rate_limits").select("key").eq("key", rateKey),
      ).length,
      0,
    );
  }
}

export async function adminStatus({
  context,
  base,
  api,
  service,
  first,
  admin,
  today,
}) {
  // APIRequestContext shares the real cookies obtained through the application login UI.
  const patch = async (body, expected = 200) => {
    const response = await context.request.patch(
      `${base}/api/admin/reservations`,
      { headers: { Origin: base }, data: body },
    );
    assert.equal(response.status(), expected);
    if (expected === 200) assert.deepEqual(await response.json(), { ok: true });
  };
  assert.ok((await context.cookies(base)).some((c) => c.httpOnly));
  const body = { id: first.id, status: "confirmed" };
  assert.equal(
    (await api("/api/admin/reservations", "PATCH", body)).status,
    401,
  );
  assert.equal((await api("/api/admin/reservations")).status, 401);
  await patch({ id: first.id, status: "invalid" }, 400);
  await patch({ id: "invalid", status: "confirmed" }, 400);
  const before = Date.now();
  await patch(body);
  await patch({ ...body, status: "completed" }, 409);
  await patch({ ...body, status: "no_show" }, 409);
  await patch({ ...body, status: "pending" }, 409);
  await patch({ ...body, status: "cancelled" });
  await patch(body, 409);
  const persisted = checked(
    await service
      .from("reservations")
      .select("status,status_updated_at")
      .eq("id", first.id)
      .single(),
  );
  assert.equal(persisted.status, "cancelled");
  assert.ok(Date.parse(persisted.status_updated_at) >= before - 5000);
  const audit = checked(
    await service
      .from("reservation_audit")
      .select("actor_id,old_status,new_status,changed_at")
      .eq("reservation_id", first.id)
      .order("id"),
  );
  assert.equal(audit.length, 3);
  for (const [i, oldStatus, newStatus] of [
    [1, "pending", "confirmed"],
    [2, "confirmed", "cancelled"],
  ]) {
    assert.equal(audit[i].actor_id, admin.id);
    assert.equal(audit[i].old_status, oldStatus);
    assert.equal(audit[i].new_status, newStatus);
    assert.ok(
      Date.parse(audit[i].changed_at) >= before - 5000 &&
        Date.parse(audit[i].changed_at) <= Date.now() + 5000,
    );
  }
  const filtered = await context.request.get(
    `${base}/api/admin/reservations?q=${first.reference}&status=cancelled&date=${today}`,
  );
  assert.equal(filtered.status(), 200);
  assert.deepEqual(
    (await filtered.json()).reservations.map((r) => r.id),
    [first.id],
  );
  return patch;
}

export async function isolatedWorker(results) {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: "pipe",
      timeout: 15000,
    });
  } catch {
    results.push({
      check: "isolated worker/global RPC tests: Docker daemon unavailable",
      status: "BLOCKED",
    });
    console.log("BLOCKED: isolated worker requires running Docker daemon");
    process.exitCode = 1;
    return;
  }
  execFileSync(process.execPath, ["scripts/isolated-worker.mjs"], {
    stdio: "pipe",
    timeout: 180000,
  });
  results.push({
    check: "isolated parallel claim and global RPC authorization",
    status: "PASS",
  });
}
