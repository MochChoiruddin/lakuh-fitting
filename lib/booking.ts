import { SLOTS, SCHEDULE } from "./schedule.mjs";
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
  const today = jakartaDate(now);
  return Array.from({ length: 31 }, (_, i) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}
export function bookable(date: string, slot: string, now = new Date()) {
  return (
    dates(now).includes(date) &&
    SLOTS.includes(slot) &&
    (date !== jakartaDate(now) ||
      Date.parse(`${date}T${slot}:00+07:00`) - now.getTime() >=
        SCHEDULE.cutoffMinutes * 60000)
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
export type BookingInput = {
  name: string;
  instagram: string;
  phone: string;
  date: string;
  slot: string;
  policy: boolean;
  reminder: boolean;
  key: string;
};
export function validateBooking(raw: unknown): BookingInput {
  if (!raw || typeof raw !== "object")
    throw new Error("Data reservasi tidak valid.");
  const b = raw as BookingInput;
  if (
    typeof b.name !== "string" ||
    b.name.trim().length < 2 ||
    b.name.trim().length > 80 ||
    /[\x00-\x1f]/.test(b.name)
  )
    throw new Error("Nama harus 2–80 karakter.");
  if (typeof b.phone !== "string")
    throw new Error("Nomor WhatsApp wajib diisi.");
  if (
    typeof b.instagram !== "string" ||
    !/^@?[a-zA-Z0-9._]{0,30}$/.test(b.instagram)
  )
    throw new Error("Username Instagram tidak valid.");
  if (!b.policy || b.policy !== true || b.reminder !== true)
    throw new Error("Kedua persetujuan wajib dicentang.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !SLOTS.includes(b.slot))
    throw new Error("Pilih jadwal yang valid.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      b.key,
    )
  )
    throw new Error("Kunci reservasi tidak valid.");
  return {
    ...b,
    name: b.name.trim(),
    instagram: b.instagram.replace(/^@/, ""),
    phone: normalizePhone(b.phone),
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
