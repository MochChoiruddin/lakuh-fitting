import { describe, expect, it } from "vitest";
import {
  SLOTS,
  bookable,
  dates,
  jakartaDate,
  normalizePhone,
  validateBooking,
} from "../lib/booking";
describe("Jakarta availability", () => {
  it("offers ten tomorrow slots and applies today's 20:00 cutoff", () => {
    expect(SLOTS).toHaveLength(10);
    expect(SLOTS[0]).toBe("11:00");
    expect(SLOTS.at(-1)).toBe("20:00");
    for (const slot of SLOTS)
      expect(
        bookable("2026-09-28", slot, new Date("2026-09-27T23:59:59+07:00")),
      ).toBe(true);
    expect(
      bookable("2026-09-27", "20:00", new Date("2026-09-27T19:00:00+07:00")),
    ).toBe(true);
    expect(
      bookable(
        "2026-09-27",
        "20:00",
        new Date("2026-09-27T19:00:00.001+07:00"),
      ),
    ).toBe(false);
  });
  it("uses Jakarta midnight and includes today through day 30", () => {
    const now = new Date("2026-09-26T17:00:00Z");
    expect(jakartaDate(now)).toBe("2026-09-27");
    expect(dates(now)).toHaveLength(31);
    expect(dates(now).at(-1)).toBe("2026-10-27");
  });
  it("allows exactly 60 minutes but rejects one millisecond later", () => {
    expect(
      bookable("2026-09-27", "11:00", new Date("2026-09-27T10:00:00+07:00")),
    ).toBe(true);
    expect(
      bookable(
        "2026-09-27",
        "11:00",
        new Date("2026-09-27T10:00:00.001+07:00"),
      ),
    ).toBe(false);
  });
  it("rejects past, invalid, unsupported slot and outside window", () => {
    const now = new Date("2026-09-27T00:00:00+07:00");
    for (const d of ["2026-09-26", "2026-10-28", "2026-02-30", "bad"])
      expect(bookable(d, "11:00", now)).toBe(false);
    expect(bookable("2026-09-27", "21:00", now)).toBe(false);
  });
});
describe("validation", () => {
  it.each([
    "081234567890",
    "+62 812-3456-7890",
    "6281234567890",
    "81234567890",
  ])("normalizes %s", (value) =>
    expect(normalizePhone(value)).toBe("6281234567890"),
  );
  it.each([
    "123",
    "+14155551212",
    "0211234567",
    "0812abc1234",
    "++6281234567890",
    "628123456789012345",
  ])("rejects %s", (value) => expect(() => normalizePhone(value)).toThrow());
  const valid = {
    name: "Test Guest",
    instagram: "",
    phone: "081234567890",
    date: "2026-09-27",
    slot: "11:00",
    key: "a1234567-1234-4234-8234-123456789012",
    policy: true,
    reminder: true,
  };
  it.each(SLOTS)("accepts configured start %s", (slot) => {
    expect(validateBooking({ ...valid, slot }).slot).toBe(slot);
  });
  it("requires both consents and valid name/key", () => {
    for (const change of [
      { policy: false },
      { reminder: false },
      { policy: "true" },
      { name: " " },
      { key: "bad" },
      { instagram: "https://example.com" },
    ])
      expect(() => validateBooking({ ...valid, ...change })).toThrow();
    expect(validateBooking(valid).phone).toBe("6281234567890");
  });
});
