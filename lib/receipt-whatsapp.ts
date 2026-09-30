import { jakartaDate, longDate, type BookingReceipt } from "./booking";

export function receiptWhatsAppUrl(receipt: BookingReceipt) {
  const appointment = new Date(receipt.appointment_at);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(appointment);
  const event = receipt.event_date_unknown
    ? "Belum memiliki tanggal acara pasti"
    : receipt.event_date
      ? longDate(receipt.event_date)
      : "—";
  const message = `Halo Kak Admin Lakuh Attire 🤍

Saya sudah membuat reservasi Appointment Free Visit dengan detail berikut:

Nama: ${receipt.name}
Nomor WhatsApp: ${receipt.phone}
Tanggal kunjungan: ${longDate(jakartaDate(appointment))}
Jam kunjungan: ${time} WIB
Berat Badan: ${receipt.weight_kg} kg
Tinggi Badan: ${receipt.height_cm} cm
Tanggal acara: ${event}
Kode reservasi: ${receipt.reference}

Status: Menunggu konfirmasi

Mohon konfirmasi reservasi saya, ya. Terima kasih 🤍`;
  return `https://wa.me/6282231379003?text=${encodeURIComponent(message)}`;
}
