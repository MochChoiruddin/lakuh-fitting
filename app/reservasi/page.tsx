import Image from "next/image";
import ReservationForm from "./reservation-form";
import { jakartaDate } from "@/lib/booking";
import "./reservation.css";
export const dynamic = "force-dynamic";
export default function ReservationPage() {
  return (
    <div className="reservation-page">
      <div className="reservation-shell">
        <header className="reservation-header">
          <Image
            className="reservation-logo"
            src="/brand/logo-lakuh.png"
            alt="Lakuh Attire"
            width={1774}
            height={887}
            sizes="256px"
            preload
          />
          <h1>Reservasi Fitting</h1>
          <p className="reservation-description">
            Buat janji temu untuk mencoba koleksi kebaya kami langsung di butik.
          </p>
          <div className="boutique-info">
            <p>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span>
                Perumahan Puri Surya Jaya, Jl. Bono Timur, Cluster New Vancouver
              </span>
            </p>
            <a
              href="https://www.instagram.com/lakuh_attire/"
              aria-label="Instagram Lakuh Attire, @lakuh_attire"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle
                  cx="17.5"
                  cy="6.5"
                  r=".8"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              @lakuh_attire
            </a>
          </div>
        </header>
        <main>
          <ReservationForm today={jakartaDate()} />
        </main>
        <footer>
          LAKUH ATTIRE <span aria-hidden="true">·</span> Dibuat untuk momen
          istimewamu
        </footer>
      </div>
    </div>
  );
}
