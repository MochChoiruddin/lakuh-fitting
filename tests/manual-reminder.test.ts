import { expect, it, vi } from "vitest";
import { manualReminderUrl } from "../lib/manual-reminder";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ admin: mocks.admin }));
import { POST } from "../app/api/admin/reminder/route";
it.each(["081234567890", "6281234567890", "+6281234567890"])(
  "normalizes manual reminder %s and encodes text",
  (phone) => {
    const url = new URL(
      manualReminderUrl(phone, "2026-09-29T08:00:00Z", "pending")!,
    );
    expect(url.origin + url.pathname).toBe("https://wa.me/6281234567890");
    const message =
      "Halo Kak, kami ingin mengingatkan bahwa Kakak memiliki jadwal appointment di butik kami pada pukul 15.00 WIB. Apakah Kakak berkenan hadir sesuai jadwal tersebut? Mohon konfirmasinya ya, Kak. Terima kasih 🤍";
    expect(url.href).toBe(
      `https://wa.me/6281234567890?text=${encodeURIComponent(message)}`,
    );
  },
);
it.each(["pending", "confirmed"])("allows %s", (status) =>
  expect(
    manualReminderUrl("081234567890", "2026-09-29T04:00:00Z", status),
  ).toContain("11.00"),
);
it.each(["cancelled", "completed", "no_show"])("disables %s", (status) =>
  expect(
    manualReminderUrl("081234567890", "2026-09-29T04:00:00Z", status),
  ).toBeNull(),
);
it.each(["invalid", "123", "+14155551212", "0812abc"])(
  "disables invalid %s",
  (phone) =>
    expect(
      manualReminderUrl(phone, "2026-09-29T04:00:00Z", "confirmed"),
    ).toBeNull(),
);
const request = () =>
  new Request("http://localhost/api/admin/reminder", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
  });
it.each([
  ["UNAUTHORIZED", 401],
  ["FORBIDDEN", 403],
])("protects HTTP %s", async (message, status) => {
  mocks.admin.mockRejectedValue(new Error(String(message)));
  expect((await POST(request())).status).toBe(status);
});
it("records only opened, never sent; URL comes from stored RPC data", async () => {
  mocks.admin.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    error: null,
    data: {
      phone: "081234567890",
      appointment_at: "2026-09-29T08:00:00Z",
      status: "confirmed",
    },
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).event).toBe("reminder_opened_by_admin");
  expect(mocks.rpc).toHaveBeenLastCalledWith("open_manual_reminder", {
    p_id: "11111111-1111-4111-8111-111111111111",
  });
});

it.each([null, [], {}, { id: "invalid" }])("rejects malformed reminder payload %j", async (input) => {
  mocks.admin.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockClear();
  const response = await POST(new Request("http://localhost/api/admin/reminder", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
