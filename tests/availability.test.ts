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
it("returns the five database slots including actual disabled state", async () => {
  const data = SLOTS.map((slot, i) => ({ slot, available: i > 1 }));
  mocks.rpc.mockResolvedValue({ data, error: null });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ slots: data });
});
it("fails safely if the database still returns the old ten-slot schedule", async () => {
  mocks.rpc.mockResolvedValue({
    data: [...SLOTS, "16:00", "17:00", "18:00", "19:00", "20:00"].map(
      (slot) => ({ slot, available: true }),
    ),
    error: null,
  });
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("slots");
});
it("rejects duplicate or malformed availability instead of marking everything unavailable", async () => {
  mocks.rpc.mockResolvedValue({
    data: SLOTS.map(() => ({ slot: "11:00", available: true })),
    error: null,
  });
  expect((await GET(request())).status).toBe(503);
});
