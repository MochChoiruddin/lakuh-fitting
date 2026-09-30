import { expect, type Page } from "@playwright/test";
import { SLOTS } from "../../lib/booking";
export async function mockAvailability(page: Page, available = true) {
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({
      json: { slots: SLOTS.map((slot) => ({ slot, available })) },
    }),
  );
}
export async function enterDetails(page: Page, unknown = true) {
  await page.getByRole("button", { name: "15.00", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByLabel("Nama Lengkap", { exact: true }).fill("Kak Ayu");
  await page
    .getByLabel("Nomor HP/WhatsApp", { exact: true })
    .fill("081234567890");
  await page.getByLabel("Berat Badan (kg)", { exact: true }).fill("50");
  await page.getByLabel("Tinggi Badan (cm)", { exact: true }).fill("160");
  await page.getByLabel("Informasi Rencana Acara").fill("Acara keluarga");
  if (unknown)
    await page.getByLabel("Saya belum memiliki tanggal acara pasti").check();
  else
    await page.getByLabel("Tanggal Acara", { exact: true }).fill("2099-12-01");
}
export async function termsStep(page: Page) {
  await page.getByRole("button", { name: "Baca syarat" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Syarat dan Ketentuan Free Visit",
      exact: true,
    }),
  ).toBeVisible();
}
export async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
