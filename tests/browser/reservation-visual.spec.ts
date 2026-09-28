import { SLOTS } from "../../lib/booking";
import { test, expect } from "@playwright/test";
import {
  enterDetails,
  mockAvailability,
  noOverflow,
  termsStep,
} from "./helpers";
import {
  TERMS,
  TERMS_NOTICE,
  STOCK_NOTE,
  TERMS_CLOSING,
  VISIT_NOTE,
} from "../../lib/free-visit";
for (const width of [360, 390, 430])
  test(`Free Visit visual and full terms at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockAvailability(page);
    await page.goto("/reservasi");
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".reservation-logo")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".reservation-logo")
          .evaluate(
            (el) =>
              (el as HTMLImageElement).complete &&
              (el as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.getByRole("list", { name: "Tahapan reservasi" }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText("Jadwal");
    async function touchTargets() {
      expect(
        await page
          .locator(
            ".reservation-page button, .reservation-page input, .reservation-page textarea, .reservation-page a",
          )
          .evaluateAll(
            (nodes) =>
              nodes.filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.width < 44 || rect.height < 44;
              }).length,
          ),
      ).toBe(0);
      await noOverflow(page);
    }
    await touchTargets();
    await expect(page.getByText(VISIT_NOTE, { exact: true })).toBeVisible();
    expect(
      await page
        .locator(".slots")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(2);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`jadwal-${width}.png`),
      fullPage: true,
    });
    await enterDetails(page);
    await expect(page.locator('[aria-current="step"]')).toContainText(
      "Data diri",
    );
    await touchTargets();
    await expect(page).toHaveScreenshot(`data-${width}.png`, {
      fullPage: true,
      animations: "disabled",
      scale: "css",
    });
    await termsStep(page);
    await expect(page.locator('[aria-current="step"]')).toContainText(
      "Persetujuan",
    );
    await touchTargets();
    await expect(page.getByText(TERMS_NOTICE, { exact: true })).toBeVisible();
    expect(
      await page
        .locator(".terms-notice")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(244, 229, 181)");
    await expect(page.locator(".visit-terms li")).toHaveCount(10);
    for (const term of TERMS)
      await expect(page.getByText(term, { exact: true })).toBeVisible();
    await expect(page.getByText(STOCK_NOTE, { exact: true })).toBeVisible();
    await expect(page.getByText(TERMS_CLOSING, { exact: true })).toBeVisible();
    const small = await page
      .locator(
        ".reservation-page button, .reservation-page input, .reservation-page textarea",
      )
      .evaluateAll(
        (nodes) =>
          nodes.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 44 || r.height < 44;
          }).length,
      );
    expect(small).toBe(0);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`terms-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("checkbox").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("checkbox").first()).toBeFocused();
    expect(
      await page
        .getByRole("checkbox")
        .first()
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return (
            style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
          );
        }),
    ).toBe(true);
  });
test("loading and full day stay distinct", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/availability?*", async (r) => {
    await gate;
    await r.fulfill({
      json: {
        slots: SLOTS.map((slot) => ({
          slot,
          available: false,
        })),
      },
    });
  });
  await page.goto("/reservasi");
  await expect(page.getByText("Memuat jadwal…")).toBeVisible();
  release();
  await expect(
    page.getByText(
      "Jadwal hari ini sudah penuh atau melewati batas reservasi.",
    ),
  ).toBeVisible();
  await expect(page.locator(".slots button:disabled")).toHaveCount(10);
});
test("desktop stays centered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAvailability(page);
  await page.goto("/reservasi");
  const box = await page.locator(".reservation-shell").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(600);
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThan(2);
  await noOverflow(page);
});
