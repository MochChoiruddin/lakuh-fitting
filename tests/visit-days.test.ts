import { beforeEach, expect, it, vi } from "vitest";
import { validVisitDate } from "../lib/visit-days";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ admin: mocks.admin }));
import { GET, PUT } from "../app/api/admin/visit-days/route";
const request = (input: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/admin/visit-days", {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  });
});
it.each([
  null,
  [],
  {},
  { date: "2026-02-30", closed: true },
  { date: "2026-10-01", closed: "false" },
])("rejects invalid input", async (input) => {
  expect((await PUT(request(input))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["UNAUTHORIZED", 401],
  ["FORBIDDEN", 403],
])("guards admin endpoints: %s", async (message, status) => {
  mocks.admin.mockRejectedValue(new Error(String(message)));
  expect(
    (await PUT(request({ date: "2026-10-01", closed: true }))).status,
  ).toBe(status);
  expect(
    (
      await GET(
        new Request("http://localhost/api/admin/visit-days?date=2026-10-01"),
      )
    ).status,
  ).toBe(status);
});
it("rejects cross-origin closure", async () => {
  expect(
    (
      await PUT(
        request({ date: "2026-10-01", closed: true }, "http://evil.invalid"),
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([true, false])(
  "saves manual closed=%s with authenticated RPC",
  async (closed) => {
    mocks.rpc.mockResolvedValue({
      data: { date: "2026-10-01", closed },
      error: null,
    });
    const r = await PUT(request({ date: "2026-10-01", closed }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ date: "2026-10-01", closed });
    expect(mocks.rpc).toHaveBeenCalledWith("set_visit_day", {
      p_date: "2026-10-01",
      p_closed: closed,
    });
  },
);
it("does not present unavailable storage as an open date", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "XX000" } });
  expect(
    (
      await GET(
        new Request("http://localhost/api/admin/visit-days?date=2026-10-01"),
      )
    ).status,
  ).toBe(503);
});
it("defaults an absent date to open", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(
    await (
      await GET(
        new Request("http://localhost/api/admin/visit-days?date=2026-10-01"),
      )
    ).json(),
  ).toEqual({ date: "2026-10-01", closed: false });
});
it("validates calendar dates without UTC rollover", () => {
  expect(validVisitDate("2028-02-29")).toBe(true);
  for (const d of [
    "2026-02-29",
    "2026-04-31",
    "0000-01-01",
    "10000-01-01",
    "2026-1-1",
  ])
    expect(validVisitDate(d)).toBe(false);
});
