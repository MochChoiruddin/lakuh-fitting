import { SLOTS, SCHEDULE } from "./schedule.mjs";
import { CONSENTS, TERMS_VERSION, type ConsentKey } from "./free-visit";
export { SLOTS } from "./schedule.mjs";
export const STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type Status = (typeof STATUSES)[number];
export function jakartaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dates(now = new Date()) {
  return [jakartaDate(now)];
}
export function bookable(date: string, slot: string, now = new Date()) {
  return (
    date === jakartaDate(now) &&
    SLOTS.includes(slot) &&
    Date.parse(`${date}T${slot}:00+07:00`) - now.getTime() >=
      SCHEDULE.cutoffMinutes * 60000
  );
}
export function normalizePhone(value: string) {
  if (!/^[+\d\s()-]+$/.test(value))
    throw new Error("Nomor WhatsApp tidak valid.");
  let phone = value.replace(/[\s()-]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
  if (phone.startsWith("8")) phone = `62${phone}`;
  if (!/^628\d{8,11}$/.test(phone))
    throw new Error("Gunakan nomor seluler Indonesia yang valid.");
  return phone;
}
export type CustomerInput = {
  name: string;
  phone: string;
  bust_circumference_cm: number;
  event_plan: string;
  event_date: string | null;
  event_date_unknown: boolean;
};
export type BookingInput = CustomerInput &
  Record<ConsentKey, boolean> & {
    date: string;
    slot: string;
    key: string;
    terms_version: string;
  };
export type BookingReceipt = CustomerInput & {
  reference: string;
  appointment_at: string;
  status: Status;
};
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function customerErrors(
  raw: Partial<CustomerInput>,
  appointmentDate: string,
) {
  const errors: Record<string, string> = {};
  if (
    typeof raw.name !== "string" ||
    raw.name.trim().length < 2 ||
    raw.name.trim().length > 80 ||
    /[\x00-\x1f]/.test(raw.name)
  )
    errors.name = "Nama lengkap wajib diisi, 2–80 karakter.";
  try {
    normalizePhone(typeof raw.phone === "string" ? raw.phone : "");
  } catch (e) {
    errors.phone = (e as Error).message;
  }
  if (
    typeof raw.bust_circumference_cm !== "number" ||
    !Number.isFinite(raw.bust_circumference_cm)
  )
    errors.bust_circumference_cm = "Isi lingkar dada dalam angka (cm).";
  if (
    typeof raw.event_plan !== "string" ||
    raw.event_plan.length > 2000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw.event_plan)
  )
    errors.event_plan = "Informasi rencana acara maksimal 2.000 karakter.";
  if (
    typeof raw.event_date_unknown !== "boolean" ||
    (raw.event_date_unknown
      ? raw.event_date !== null
      : !validDate(raw.event_date) || raw.event_date < appointmentDate)
  )
    errors.event_date =
      "Isi tanggal acara mulai tanggal kunjungan, atau centang belum memiliki tanggal acara pasti.";
  return errors;
}
export class BookingValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0]);
  }
}
export function validateBooking(raw: unknown): BookingInput {
  if (!raw || typeof raw !== "object")
    throw new BookingValidationError({ form: "Data reservasi tidak valid." });
  const b = raw as BookingInput;
  const errors = customerErrors(b, b.date);
  // Database checks today's date and cutoff after idempotent replay lookup.
  if (!validDate(b.date) || !SLOTS.includes(b.slot))
    errors.date = "Pilih jadwal yang valid.";
  for (const [key] of CONSENTS)
    if (b[key] !== true) errors[key] = "Persetujuan ini wajib dicentang.";
  if (b.terms_version !== TERMS_VERSION)
    errors.consent_terms =
      "Syarat diperbarui. Muat ulang halaman sebelum melanjutkan.";
  if (
    typeof b.key !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      b.key,
    )
  )
    errors.form = "Kunci reservasi tidak valid.";
  if (Object.keys(errors).length) throw new BookingValidationError(errors);
  return {
    name: b.name.trim(),
    phone: normalizePhone(b.phone),
    bust_circumference_cm: b.bust_circumference_cm,
    event_plan: b.event_plan.trim(),
    event_date: b.event_date,
    event_date_unknown: b.event_date_unknown,
    date: b.date,
    slot: b.slot,
    key: b.key,
    terms_version: TERMS_VERSION,
    consent_on_time: true,
    consent_whatsapp: true,
    consent_stock: true,
    consent_terms: true,
  };
}
export function longDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}
