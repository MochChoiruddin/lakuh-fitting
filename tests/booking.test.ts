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
  it("keeps five starts and rejects tomorrow/yesterday", () => {
    expect(SLOTS).toHaveLength(5);
    expect(SLOTS[0]).toBe("11:00");
    expect(SLOTS.at(-1)).toBe("15:00");
    for (const slot of SLOTS) {
      expect(
        bookable("2026-09-28", slot, new Date("2026-09-27T00:00:00+07:00")),
      ).toBe(false);
      expect(
        bookable("2026-09-26", slot, new Date("2026-09-27T00:00:00+07:00")),
      ).toBe(false);
    }
  });
  it("accepts slots in the newly opened 30–60 minute window", () => {
    expect(
      bookable("2026-09-27", "11:00", new Date("2026-09-27T10:15:00+07:00")),
    ).toBe(true);
  });
  it("applies exact 30-minute cutoff and 11:36 acceptance", () => {
    expect(
      bookable("2026-09-27", "15:00", new Date("2026-09-27T14:30:00+07:00")),
    ).toBe(true);
    expect(
      bookable(
        "2026-09-27",
        "15:00",
        new Date("2026-09-27T14:30:00.001+07:00"),
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
  slot: "15:00",
  key: "a1234567-1234-4234-8234-123456789012",
  weight_kg: 50,
  height_cm: 160,
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
  it("validates finite weight and height within inclusive ranges", () => {
    for (const [key, min, max] of [
      ["weight_kg", 20, 300],
      ["height_cm", 80, 250],
    ] as const) {
      for (const value of [
        null,
        undefined,
        "",
        "abc",
        "50",
        NaN,
        Infinity,
        -1,
        min - 0.01,
        max + 0.01,
      ])
        expect(() => validateBooking({ ...valid, [key]: value })).toThrow();
      for (const value of [min, max, (min + max) / 2])
        expect(validateBooking({ ...valid, [key]: value })[key]).toBe(value);
    }
  });
  it.each(["16:00", "17:00", "18:00", "19:00", "20:00"])(
    "rejects removed slot %s",
    (slot) => {
      expect(() => validateBooking({ ...valid, slot })).toThrow();
    },
  );
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
