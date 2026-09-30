import { test, expect } from "@playwright/test";
import {
  enterDetails,
  mockAvailability,
  noOverflow,
  termsStep,
} from "./helpers";
import { CONSENTS, TERMS_VERSION } from "../../lib/free-visit";
for (const unknown of [false, true])
  test(`Free Visit flow with event date ${unknown ? "unknown" : "known"}`, async ({
    page,
  }) => {
    await mockAvailability(page);
    let payload: Record<string, unknown> = {};
    await page.route("**/api/reservations", (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: {
          ...payload,
          reference: "LK-TEST-RECEIPT",
          status: "pending",
          appointment_at: `${payload.date}T${payload.slot}:00+07:00`,
        },
      });
    });
    await page.goto("/");
    await expect(page).toHaveURL(/reservasi/);
    await expect(
      page.getByRole("heading", {
        name: "Appointment Free Visit",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".date-strip")).toHaveCount(0);
    await expect(page.locator(".slots button")).toHaveCount(5);
    await enterDetails(page, unknown);
    const event = page.getByLabel("Tanggal Acara", { exact: true });
    if (unknown) {
      await expect(event).toBeDisabled();
      await expect(event).toHaveValue("");
    }
    await expect(
      page.getByLabel("Berat Badan (kg)", { exact: true }),
    ).toHaveAttribute("min", "20");
    await expect(
      page.getByLabel("Berat Badan (kg)", { exact: true }),
    ).toHaveAttribute("max", "300");
    await termsStep(page);
    const submit = page.getByRole("button", { name: "Konfirmasi reservasi" });
    for (const [, label] of CONSENTS) {
      await expect(submit).toBeDisabled();
      await page.getByLabel(label, { exact: true }).check();
    }
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.locator(".reference")).toContainText("LK-TEST-RECEIPT");
    expect(payload.phone).toBe("6281234567890");
    expect(payload.weight_kg).toBe(50);
    expect(payload.height_cm).toBe(160);
    expect(payload).not.toHaveProperty("bust_circumference_cm");
    expect(payload.event_date_unknown).toBe(unknown);
    expect(payload.event_date).toBe(unknown ? null : "2099-12-01");
    expect(payload.terms_version).toBe(TERMS_VERSION);
    for (const [key] of CONSENTS) expect(payload[key]).toBe(true);
    await expect(page.locator(".receipt")).toContainText("50 kg");
    await expect(page.locator(".receipt")).toContainText("160 cm");
    await expect(page.locator(".receipt")).toContainText("Kak Ayu");
    await noOverflow(page);
  });
test("field errors and exclusive event date choice", async ({ page }) => {
  await mockAvailability(page);
  await page.goto("/reservasi");
  await page.getByRole("button", { name: "15.00", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByRole("button", { name: "Baca syarat" }).click();
  for (const id of ["name", "phone", "weight_kg", "height_cm", "event_date"])
    await expect(page.locator(`#${id}-error`)).toBeVisible();
  await page.getByLabel("Tanggal Acara", { exact: true }).fill("2000-01-01");
  await page.getByRole("button", { name: "Baca syarat" }).click();
  await expect(page.locator("#event_date-error")).toBeVisible();
  await page.getByLabel("Saya belum memiliki tanggal acara pasti").check();
  await expect(page.getByLabel("Tanggal Acara", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Tanggal Acara", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Saya belum memiliki tanggal acara pasti").uncheck();
  await page.getByRole("button", { name: "Baca syarat" }).click();
  await expect(page.locator("#event_date-error")).toBeVisible();
});
test("API failure/malformed payload are unknown availability, retry restores slots", async ({
  page,
}) => {
  await page.route("**/api/availability?*", (r) =>
    r.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/reservasi");
  await expect(
    page.getByRole("alert").filter({ hasText: "Ketersediaan" }),
  ).toBeVisible();
  await expect(page.locator(".slots button")).toHaveCount(0);
  await page.unroute("**/api/availability?*");
  await page.route("**/api/availability?*", (r) =>
    r.fulfill({ json: { slots: [] } }),
  );
  await page.getByRole("button", { name: "Muat ulang jadwal" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ketersediaan" }),
  ).toBeVisible();
  await page.unroute("**/api/availability?*");
  await mockAvailability(page);
  await page.getByRole("button", { name: "Muat ulang jadwal" }).click();
  await expect(
    page.getByRole("button", { name: "15.00", exact: true }),
  ).toBeEnabled();
});
test("admin and cron remain protected", async ({ page, request }) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Masuk ke Lakuh" }),
  ).toBeVisible();
  expect((await request.get("/api/admin/reservations")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/reminder", {
        headers: { Origin: "http://localhost:3000" },
        data: { id: "11111111-1111-4111-8111-111111111111" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
});
