import { describe, expect, it } from "vitest";
import {
  SLOTS,
  bookable,
  dates,
  jakartaDate,
  normalizePhone,
  validateBooking,
} from "../lib/booking";
import { CONSENTS, TERMS_VERSION } from "../lib/free-visit";
describe("same-day Jakarta availability", () => {
  it("uses Jakarta midnight, not UTC date", () => {
    expect(jakartaDate(new Date("2026-09-26T17:00:00Z"))).toBe("2026-09-27");
    expect(dates(new Date("2026-09-26T17:00:00Z"))).toEqual(["2026-09-27"]);
  });
  it("keeps ten starts and rejects tomorrow/yesterday", () => {
    expect(SLOTS).toHaveLength(10);
    expect(SLOTS[0]).toBe("11:00");
    expect(SLOTS.at(-1)).toBe("20:00");
    for (const slot of SLOTS) {
      expect(
        bookable("2026-09-28", slot, new Date("2026-09-27T00:00:00+07:00")),
      ).toBe(false);
      expect(
        bookable("2026-09-26", slot, new Date("2026-09-27T00:00:00+07:00")),
      ).toBe(false);
    }
  });
  it("applies exact 60-minute cutoff and 11:36 acceptance", () => {
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
    expect(
      SLOTS.filter((s) =>
        bookable("2026-09-27", s, new Date("2026-09-27T11:36:00+07:00")),
      ),
    ).toEqual(SLOTS.slice(2));
  });
});
const valid = {
  name: "Test Guest",
  phone: "081234567890",
  date: "2026-09-27",
  slot: "20:00",
  key: "a1234567-1234-4234-8234-123456789012",
  bust_circumference_cm: 92.5,
  event_plan: "",
  event_date: "2026-09-28",
  event_date_unknown: false,
  consent_on_time: true,
  consent_whatsapp: true,
  consent_stock: true,
  consent_terms: true,
  terms_version: TERMS_VERSION,
};
describe("Free Visit validation", () => {
  it.each([
    "081234567890",
    "+62 812-3456-7890",
    "6281234567890",
    "81234567890",
  ])("normalizes %s", (v) => expect(normalizePhone(v)).toBe("6281234567890"));
  it.each([
    "123",
    "+14155551212",
    "0211234567",
    "0812abc1234",
    "++6281234567890",
  ])("rejects phone %s", (v) => expect(() => normalizePhone(v)).toThrow());
  it.each(SLOTS)("accepts configured start %s", (slot) =>
    expect(validateBooking({ ...valid, slot }).slot).toBe(slot),
  );
  it("requires finite numeric bust without invented min/max", () => {
    for (const bust_circumference_cm of [
      null,
      undefined,
      "",
      NaN,
      Infinity,
      "92",
    ])
      expect(() =>
        validateBooking({ ...valid, bust_circumference_cm }),
      ).toThrow();
    for (const bust_circumference_cm of [0, -1, 0.01, 92.5, 10000])
      expect(
        validateBooking({ ...valid, bust_circumference_cm })
          .bust_circumference_cm,
      ).toBe(bust_circumference_cm);
  });
  it("requires known date or explicitly unknown with null", () => {
    for (const change of [
      { event_date: null },
      { event_date: "2026-09-26" },
      { event_date: "2026-02-30" },
      { event_date_unknown: true },
      { event_date_unknown: "true" },
    ])
      expect(() => validateBooking({ ...valid, ...change })).toThrow();
    expect(
      validateBooking({ ...valid, event_date_unknown: true, event_date: null })
        .event_date,
    ).toBe(null);
    expect(
      validateBooking({ ...valid, event_date: valid.date }).event_date,
    ).toBe(valid.date);
  });
  it.each(CONSENTS)("requires boolean consent %s", (key) => {
    for (const value of [false, undefined, "true", 1])
      expect(() => validateBooking({ ...valid, [key]: value })).toThrow();
  });
  it("rejects outdated terms, invalid name/key/date/slot", () => {
    for (const change of [
      { terms_version: "old" },
      { name: " " },
      { key: "bad" },
      { date: "bad" },
      { slot: "21:00" },
    ])
      expect(() => validateBooking({ ...valid, ...change })).toThrow();
    expect(validateBooking(valid).phone).toBe("6281234567890");
  });
});
