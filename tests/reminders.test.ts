import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sql: vi.fn(),
  begin: vi.fn(),
  end: vi.fn(),
  send: vi.fn(),
  configured: vi.fn(),
  postgres: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ service: () => ({ rpc: mocks.rpc }) }));
vi.mock("../lib/whatsapp", () => ({
  whatsappConfigured: mocks.configured,
  sendReminder: mocks.send,
}));
vi.mock("postgres", () => ({ default: mocks.postgres }));
import { runReminders } from "../lib/reminders";
const reservation = {
  status: "confirmed",
  appointment_at: "2099-01-01T00:00:00Z",
  phone: "6281234567890",
  name: "Test",
};
function setup(attempt = 1, status = "confirmed", jobStatus = "processing") {
  mocks.configured.mockReturnValue(true);
  mocks.rpc.mockResolvedValue({
    data: [{ id: "job", reservation_id: "reservation", lock_token: "claim" }],
  });
  mocks.sql
    .mockResolvedValueOnce([{ ...reservation, status }])
    .mockResolvedValueOnce([
      {
        id: "job",
        status: jobStatus,
        lock_token: "claim",
        attempt_count: attempt,
      },
    ])
    .mockResolvedValue([]);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "test-placeholder");
  mocks.postgres.mockReturnValue({ begin: mocks.begin, end: mocks.end });
  mocks.begin.mockImplementation((fn) => fn(mocks.sql));
});
describe("reminder worker", () => {
  it("does not claim jobs with missing provider credentials", async () => {
    mocks.configured.mockReturnValue(false);
    expect(await runReminders()).toEqual({ configured: false, processed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "completed", "no_show"])(
    "never sends for %s",
    async (status) => {
      setup(1, status);
      await runReminders();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.sql.mock.calls[2][0].join("")).toContain(
        "status = 'cancelled'",
      );
    },
  );
  it("does not send if another worker already completed the claim", async () => {
    setup(1, "confirmed", "sent");
    await runReminders();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    [1, 60],
    [2, 300],
  ])("backs off attempt %s for %s seconds", async (attempt, seconds) => {
    setup(attempt);
    mocks.send.mockResolvedValue({
      kind: "retry",
      error: "PROVIDER_RATE_LIMIT",
    });
    await runReminders();
    expect(mocks.sql.mock.calls[2][0].join("")).toContain(
      "status = 'scheduled'",
    );
    expect(mocks.sql.mock.calls[2]).toContain(seconds);
  });
  it("stops at three attempts", async () => {
    setup(3);
    mocks.send.mockResolvedValue({
      kind: "retry",
      error: "PROVIDER_RATE_LIMIT",
    });
    await runReminders();
    expect(mocks.sql.mock.calls[2][0].join("")).toContain("status = 'failed'");
  });
  it("records provider receipt only on explicit success", async () => {
    setup();
    mocks.send.mockResolvedValue({ kind: "sent", id: "provider-test-id" });
    await runReminders();
    expect(mocks.sql.mock.calls[2][0].join("")).toContain("sent_at = now()");
    expect(mocks.sql.mock.calls[2]).toContain("provider-test-id");
  });
  it("does not automatically repeat uncertain delivery", async () => {
    setup();
    mocks.send.mockResolvedValue({
      kind: "unknown",
      error: "DELIVERY_UNKNOWN",
    });
    await runReminders();
    expect(mocks.sql.mock.calls[2][0].join("")).toContain("status = 'failed'");
  });
});
