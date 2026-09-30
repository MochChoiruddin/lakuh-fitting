import { normalizePhone } from "./booking";
export function manualReminderUrl(
  phone: string,
  appointment: string,
  status: string,
) {
  if (!["pending", "confirmed"].includes(status)) return null;
  try {
    const number = normalizePhone(phone);
    const time = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(appointment));
    const message = `Halo Kak, kami ingin mengingatkan bahwa Kakak memiliki jadwal appointment di butik kami pada pukul ${time} WIB. Apakah Kakak berkenan hadir sesuai jadwal tersebut? Mohon konfirmasinya ya, Kak. Terima kasih 🤍`;
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  } catch {
    return null;
  }
}
