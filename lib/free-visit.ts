export const TERMS_VERSION = "free-visit-2026-09-v2";
export const VISIT_NOTE =
  "Free Visit bersifat dadakan (go-show) dan appointment hanya dapat dilakukan pada hari H. Apabila kuota reservasi hari ini telah terpenuhi, dapat mencoba kembali esok hari melalui tautan ini.";
export const TERMS_NOTICE =
  "Halo Kak! Sebelum melakukan reservasi, mohon pahami syarat dan ketentuan Free Visit terlampir, ya. Untuk kenyamanan bersama, kami berhak membatalkan atau menolak kedatangan jika tidak sesuai dengan aturan yang disepakati.";
export const TERMS = [
  "Appointment ini berlaku untuk 1 orang dalam 1 kedatangan.",
  "Customer WAJIB memakai inner atau manset berlengan (yang menutupi area ketiak) demi menjaga kebersihan kebaya.",
  "Dimohon datang ON TIME. Durasi Free Visit max. 45 menit. Keterlambatan kedatangan akan memotong durasi fitting.",
  "Dipersilakan mengajak pendamping max. 2 orang.",
  "Tidak diperkenankan membawa makanan atau minuman ke dalam butik.",
  "Wajib melakukan konfirmasi kedatangan melalui WhatsApp reminder yang kami kirimkan.",
  "Appointment ini hanya untuk FREE VISIT. Jika ingin mencoba/fitting kebaya akan dikenakan charge fitting.",
  "Charge fitting Rp10.000/kebaya dengan maksimal mencoba 2 kebaya yang available pada tanggal acara customer atau kebaya random yang sedang available di butik.",
  "Fitting atau mencoba kebaya hanya available di Regular Series.",
  "Exclusive Series hanya bisa dicoba setelah customer FIX BOOKING, memiliki tanggal acara, dan sudah melakukan DP.",
];
export const STOCK_NOTE =
  "Harap diperhatikan bahwa ketersediaan kebaya bersifat tidak mengikat dan dapat berubah sewaktu-waktu, ya. Kebaya yang Kakak pilih/inginkan kemungkinan sedang berada di luar galeri karena disewa oleh customer kami pada hari yang sama. Fix booking hanya bisa diproses setelah melakukan DP, ya, Kak.";
export const TERMS_CLOSING =
  "Begitu appointment ini dibuat, Kakak dianggap sudah membaca, memahami, dan menyetujui semua peraturan di Lakuh Attire.";
export const CONSENTS = [
  [
    "consent_on_time",
    "Saya menyetujui untuk datang on time pada hari dan jam yang sudah saya pilih.",
  ],
  [
    "consent_whatsapp",
    "Saya akan melakukan konfirmasi kehadiran melalui WhatsApp.",
  ],
  [
    "consent_stock",
    "Saya memahami bahwa ketersediaan kebaya tidak mengikat dan tidak dapat dipastikan.",
  ],
  [
    "consent_terms",
    "Saya menyetujui semua Syarat dan Ketentuan Free Visit di Lakuh Attire.",
  ],
] as const;
export type ConsentKey = (typeof CONSENTS)[number][0];
