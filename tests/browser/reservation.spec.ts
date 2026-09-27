import { SLOTS } from "../../lib/schedule.mjs";
import { test, expect } from "@playwright/test";
test("mobile three-step flow, consent, normalized phone and receipt", async ({
  page,
}) => {
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({
      json: {
        slots: SLOTS.map((slot) => ({
          slot,
          available: true,
        })),
      },
    }),
  );
  let payload: Record<string, unknown> = {};
  await page.route("**/api/reservations", (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { reference: "LK-TEST-RECEIPT", status: "pending" },
    });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/reservasi/);
  await expect(page.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
  await page.getByRole("button", { name: "11.00", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByLabel("Nama lengkap").fill("Test Guest");
  await page.getByLabel("Nomor WhatsApp").fill("081234567890");
  await page.getByRole("button", { name: "Periksa reservasi" }).click();
  await expect(
    page.getByRole("heading", { name: "Lengkapi datamu" }),
  ).toBeVisible();
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Periksa reservasi" }).click();
  await expect(page.getByText("+6281234567890", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
  await expect(page.getByText("LK-TEST-RECEIPT")).toBeVisible();
  expect(payload.phone).toBe("6281234567890");
  expect(payload.policy).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-receipt.png",
    fullPage: true,
  });
});
test("mobile availability error fails closed", async ({ page }) => {
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/reservasi");
  await expect(
    page.getByRole("alert").filter({ hasText: "Ketersediaan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "11.00", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/mobile-calendar.png",
    fullPage: true,
  });
});
test("admin and cron do not expose data without authorization", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Masuk ke Lakuh" }),
  ).toBeVisible();
  const admin = await request.get("/api/admin/reservations");
  expect([401, 503]).toContain(admin.status());
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
});
