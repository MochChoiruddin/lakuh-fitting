import { expect, it, vi } from "vitest";
import { jakartaDate, SLOTS } from "../lib/booking";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ service: () => ({ rpc: mocks.rpc }) }));
vi.mock("../lib/http", async (original) => ({
  ...(await original<typeof import("../lib/http")>()),
  rateLimit: vi.fn(),
}));
import { GET } from "../app/api/availability/route";
const request = () =>
  new Request(`http://localhost/api/availability?date=${jakartaDate()}`);
it("returns five slots and the explicit manual closure flag", async () => {
  const data = {
    slots: SLOTS.map((slot, i) => ({ slot, available: i > 1 })),
    closed: false,
  };
  mocks.rpc.mockResolvedValue({ data, error: null });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(data);
  expect(mocks.rpc).toHaveBeenCalledWith("visit_availability", {
    p_date: jakartaDate(),
  });
});
it("distinguishes a manually closed date from a full day", async () => {
  const data = {
    slots: SLOTS.map((slot) => ({ slot, available: false })),
    closed: true,
  };
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await (await GET(request())).json()).toEqual(data);
});
it.each([
  {
    closed: false,
    slots: [...SLOTS, "16:00"].map((slot) => ({ slot, available: true })),
  },
  {
    closed: false,
    slots: SLOTS.map(() => ({ slot: "11:00", available: true })),
  },
  { slots: SLOTS.map((slot) => ({ slot, available: true })) },
  { closed: true, slots: SLOTS.map((slot) => ({ slot, available: true })) },
  null,
])(
  "fails safely for malformed or inconsistent database state",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("slots");
  },
);
