import { test, expect } from "@playwright/test";
import {
  enterDetails,
  mockAvailability,
  noOverflow,
  termsStep,
} from "./helpers";

for (const width of [360, 390, 430]) {
  for (const unknown of [false, true]) {
    test(`receipt WhatsApp ${width}px ${unknown ? "unknown" : "known"}`, async ({
      page,
      context,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await mockAvailability(page);
      const name = "Ayu".repeat(20) + " & Keluarga + 🤍";
      const reference = "LK-1234567890ABCDEF";
      // Deliberately different from the editable inputs: only saved response is used.
      const receipt = {
        name,
        phone: "628123456789012",
        reference,
        status: "pending",
        appointment_at: "2099-11-30T08:00:00Z",
        weight_kg: 97.5,
        height_cm: 160,
        event_date: unknown ? null : "2099-12-01",
        event_date_unknown: unknown,
        event_plan: "Acara keluarga",
        internal_token: "DO-NOT-INCLUDE-IN-MESSAGE",
        id: "PRIVATE-ID",
      };
      let fail = true;
      await page.route("**/api/reservations", (route) =>
        route.fulfill({
          status: fail ? 503 : 201,
          json: fail ? { error: "Layanan sementara tidak tersedia." } : receipt,
        }),
      );
      await page.goto("/reservasi");
      const link = page.getByRole("link", {
        name: "Kirim ke WhatsApp Admin",
        exact: true,
      });
      await expect(link).toHaveCount(0);
      await enterDetails(page, unknown);
      await termsStep(page);
      for (const checkbox of await page.getByRole("checkbox").all())
        await checkbox.check();
      await expect(link).toHaveCount(0);
      await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
      await expect(
        page.locator(".receipt, .card").getByRole("alert"),
      ).toContainText("Layanan sementara");
      await expect(link).toHaveCount(0);
      fail = false;
      await page.getByRole("button", { name: "Konfirmasi reservasi" }).click();
      await expect(link).toBeVisible();
      const date = (value: string) =>
        new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(`${value}T12:00:00+07:00`));
      const expected = `Halo Kak Admin Lakuh Attire 🤍\n\nSaya sudah membuat reservasi Appointment Free Visit dengan detail berikut:\n\nNama: ${name}\nNomor WhatsApp: ${receipt.phone}\nTanggal kunjungan: ${date("2099-11-30")}\nJam kunjungan: 15.00 WIB\nBerat Badan: 97.5 kg\nTinggi Badan: 160 cm\nTanggal acara: ${unknown ? "Belum memiliki tanggal acara pasti" : date("2099-12-01")}\nKode reservasi: ${reference}\n\nStatus: Menunggu konfirmasi\n\nMohon konfirmasi reservasi saya, ya. Terima kasih 🤍`;
      const href = await link.getAttribute("href");
      expect(href).toBe(
        `https://wa.me/6282231379003?text=${encodeURIComponent(expected)}`,
      );
      const url = new URL(href!);
      expect(url.searchParams.get("text")).toBe(expected);
      expect([...url.searchParams.keys()]).toEqual(["text"]);
      expect(href).not.toMatch(
        /PRIVATE-ID|DO-NOT-INCLUDE|consent|token|cookie|service_role/,
      );
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      const print = page.getByRole("button", { name: "Simpan / cetak bukti" });
      const printBox = (await print.boundingBox())!,
        linkBox = (await link.boundingBox())!;
      expect(linkBox.y).toBeGreaterThanOrEqual(
        printBox.y + printBox.height + 10,
      );
      expect(linkBox.height).toBeGreaterThanOrEqual(48);
      expect(Math.abs(linkBox.width - printBox.width)).toBeLessThan(1);
      await noOverflow(page);
      await print.focus();
      await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      expect(
        await link.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).not.toBe("none");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(
          `receipt-${width}-${unknown ? "unknown" : "known"}.png`,
        ),
        fullPage: true,
      });
      // Intercept the popup before any external network request. No WhatsApp delivery.
      await context.route("https://wa.me/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "Navigation intercepted by test",
        }),
      );
      const popup = page.waitForEvent("popup");
      await link.click();
      const opened = await popup;
      await opened.waitForLoadState();
      expect(opened.url()).toBe(href);
      await opened.close();
    });
  }
}
