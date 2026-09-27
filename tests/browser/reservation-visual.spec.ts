import { SLOTS } from "../../lib/schedule.mjs";
import { expect, test, type Page } from "@playwright/test";

const slots = SLOTS;
const screenshotOptions = {
  fullPage: true,
  animations: "disabled" as const,
  scale: "css" as const,
  style: "nextjs-portal { display: none !important; }",
};
async function ready(page: Page) {
  // Hide Next's animated development badge, which is not part of the UI.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole("img", { name: "Lakuh Attire", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => {
    const logo = document.querySelector<HTMLImageElement>(".reservation-logo");
    return !!logo?.complete && logo.naturalWidth > 0;
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function checkTargets(page: Page) {
  const small = await page
    .locator(
      ".reservation-page button, .reservation-page input, .reservation-page a",
    )
    .evaluateAll((elements) =>
      elements
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        })
        .map((el) => el.textContent || el.getAttribute("type")),
    );
  expect(small).toEqual([]);
}
async function availability(page: Page, enabled: boolean) {
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({
      json: {
        slots: slots.map((slot, i) => ({
          slot,
          available: enabled && i !== 1,
        })),
      },
    }),
  );
}

for (const width of [360, 390, 430]) {
  test(`public visual flow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await availability(page, true);
    await page.route("**/api/reservations", (route) =>
      route.fulfill({
        status: 201,
        json: { reference: "LK-TEST-RECEIPT", status: "pending" },
      }),
    );
    await page.goto("/reservasi");
    await ready(page);
    await expect(
      page.getByRole("heading", { name: "Reservasi Fitting", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Tahapan reservasi" }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText("Jadwal");
    await expect(
      page.getByRole("button", { name: "12.00", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lanjutkan" }),
    ).toBeDisabled();
    const dates = page
      .getByRole("group", { name: "Tanggal reservasi" })
      .getByRole("button");
    await expect(dates).toHaveCount(31);
    await dates.last().scrollIntoViewIfNeeded();
    await dates.last().click();
    await expect(dates.last()).toHaveAttribute("aria-pressed", "true");
    await noOverflow(page);
    await dates.first().scrollIntoViewIfNeeded();
    await dates.first().click();
    await expect(
      page.getByRole("button", { name: "11.00", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".slots button")).toHaveCount(SLOTS.length);
    expect(
      await page
        .locator(".slots")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(2);
    await page.getByRole("button", { name: "20.00", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "20.00", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Lanjutkan" })).toBeEnabled();
    await checkTargets(page);
    await page.screenshot({
      ...screenshotOptions,
      path: testInfo.outputPath(`jadwal-${width}.png`),
    });
    await page.getByRole("button", { name: "11.00", exact: true }).click();
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(
      page.getByRole("heading", { name: "Lengkapi datamu" }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText(
      "Data diri",
    );
    await page.getByLabel("Nama lengkap").fill("Kak Ayu");
    await page.getByLabel("Instagram (opsional)").fill("@ayu");
    await page.getByLabel("Nomor WhatsApp").fill("081234567890");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await checkTargets(page);
    await noOverflow(page);
    // Data step has no date-dependent text: stable visual regression baseline.
    await expect(page).toHaveScreenshot(`data-${width}.png`, screenshotOptions);
    await page.getByRole("button", { name: "Periksa reservasi" }).click();
    await expect(
      page.getByRole("heading", { name: "Konfirmasi reservasi", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("+6281234567890", { exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      ...screenshotOptions,
      path: testInfo.outputPath(`konfirmasi-${width}.png`),
    });
    await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
    await expect(page.getByText("LK-TEST-RECEIPT")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      ...screenshotOptions,
      path: testInfo.outputPath(`receipt-${width}.png`),
    });
  });
}

test("loading, empty, error and field feedback share the public visual style", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/availability?*", async (route) => {
    await gate;
    await route.fulfill({
      json: { slots: slots.map((slot) => ({ slot, available: false })) },
    });
  });
  await page.goto("/reservasi");
  await ready(page);
  await expect(page.getByText("Memuat jadwal…")).toBeVisible();
  await page.screenshot({
    ...screenshotOptions,
    path: testInfo.outputPath("loading-360.png"),
  });
  release();
  await expect(
    page.getByText(
      "Jadwal tanggal ini sudah penuh atau melewati batas reservasi.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
  await page.screenshot({
    ...screenshotOptions,
    path: testInfo.outputPath("empty-360.png"),
  });
  await page.unroute("**/api/availability?*");
  await page.route("**/api/availability?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ketersediaan" }),
  ).toBeVisible();
  await page.screenshot({
    ...screenshotOptions,
    path: testInfo.outputPath("error-360.png"),
  });
  await page.unroute("**/api/availability?*");
  await availability(page, true);
  await page.getByRole("button", { name: "Muat ulang jadwal" }).click();
  await page.getByRole("button", { name: "11.00", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByLabel("Nama lengkap").fill("Kak Ayu");
  await page.getByLabel("Nomor WhatsApp").fill("123");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Periksa reservasi" }).click();
  await expect(page.locator("#phone-error")).toBeVisible();
  await expect(page.getByLabel("Nomor WhatsApp")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.screenshot({
    ...screenshotOptions,
    path: testInfo.outputPath("field-error-360.png"),
  });
  await noOverflow(page);
});

test("desktop form is centered and keyboard focus is visible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await availability(page, true);
  await page.goto("/reservasi");
  await ready(page);
  const card = await page
    .getByRole("region", { name: "Form reservasi fitting" })
    .boundingBox();
  expect(card!.width).toBeLessThanOrEqual(600);
  expect(Math.abs(card!.x + card!.width / 2 - 640)).toBeLessThan(1);
  const date = page
    .getByRole("group", { name: "Tanggal reservasi" })
    .getByRole("button")
    .first();
  await date.focus();
  await page.keyboard.press("Tab");
  expect(
    await page
      .locator(":focus")
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  await noOverflow(page);
  await page.screenshot({
    ...screenshotOptions,
    path: testInfo.outputPath("desktop-1280.png"),
  });
});
