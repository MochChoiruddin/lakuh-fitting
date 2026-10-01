import { test, expect } from "@playwright/test";
import { SLOTS } from "../../lib/booking";
import { enterDetails, mockAvailability, termsStep } from "./helpers";

test("saved link to closed Free Visit shows closure and prevents proceeding", async ({
  page,
}) => {
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({
      json: {
        closed: true,
        slots: SLOTS.map((slot) => ({ slot, available: false })),
      },
    }),
  );
  await page.goto("/reservasi");
  await expect(
    page.getByText(
      "Free Visit tutup hari ini. Silakan kembali pada hari lain.",
    ),
  ).toBeVisible();
  await expect(page.locator(".slots button:disabled")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
  await expect(
    page.getByText("Ketersediaan belum diketahui", { exact: false }),
  ).toHaveCount(0);
});

test("closure after form was opened rejects booking and refreshes closed state", async ({
  page,
}) => {
  await mockAvailability(page);
  await page.goto("/reservasi");
  await enterDetails(page);
  await termsStep(page);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({
      json: {
        closed: true,
        slots: SLOTS.map((slot) => ({ slot, available: false })),
      },
    }),
  );
  await page.route("**/api/reservations", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "Free Visit tutup pada tanggal ini. Silakan pilih hari lain.",
      },
    }),
  );
  await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
  await expect(
    page.getByText(
      "Free Visit tutup hari ini. Silakan kembali pada hari lain.",
    ),
  ).toBeVisible();
  await expect(page.locator(".slots button:disabled")).toHaveCount(5);
  await expect(page.locator(".receipt")).toHaveCount(0);
});
