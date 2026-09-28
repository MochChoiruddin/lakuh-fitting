import type { Metadata } from "next";
import { Young_Serif, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
const heading = Young_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Appointment Free Visit · Lakuh Attire",
  description: "Reservasi kunjungan hari ini di butik Lakuh Attire.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
