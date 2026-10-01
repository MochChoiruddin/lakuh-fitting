"use client";
import { useEffect, useState } from "react";
import { jakartaDate, longDate } from "@/lib/booking";

export default function VisitDays() {
  const [date, setDate] = useState(jakartaDate);
  const [state, setState] = useState<{ date: string; closed: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    fetch(`/api/admin/visit-days?date=${encodeURIComponent(date)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Gagal memuat status Free Visit.");
        if (data.date !== date || typeof data.closed !== "boolean")
          throw new Error("Status Free Visit tidak valid.");
        if (!controller.signal.aborted) setState(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Gagal memuat status Free Visit.",
          );
      });
    return () => controller.abort();
  }, [date, retry]);
  async function toggle() {
    if (!state || state.date !== date || saving) return;
    const closed = !state.closed;
    if (
      closed &&
      !window.confirm(
        `Tutup Free Visit pada ${longDate(date)}? Reservasi yang sudah masuk tetap berlaku dan tidak dibatalkan otomatis.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/visit-days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, closed }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Gagal menyimpan status Free Visit.");
      setState({ date, closed });
      setMessage(
        `Free Visit pada ${longDate(date)} berhasil ${closed ? "ditutup" : "dibuka kembali"}.`,
      );
    } catch (e) {
      setState(null);
      setError(
        e instanceof Error ? e.message : "Gagal menyimpan status Free Visit.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="card mt-6" aria-labelledby="visit-days-title">
      <h2 id="visit-days-title" className="section-title">
        Buka / Tutup Free Visit
      </h2>
      <p className="small muted">
        Pilih tanggal yang ingin ditutup atau dibuka kembali. Semua tanggal
        mengikuti aturan reservasi biasa sampai admin menutupnya, termasuk
        Minggu dan hari libur.
      </p>
      <label className="field">
        Tanggal Free Visit (WIB)
        <input
          type="date"
          value={date}
          min={jakartaDate()}
          max="9998-12-31"
          disabled={saving}
          onChange={(e) => {
            setDate(e.target.value);
            setState(null);
            setError("");
            setMessage("");
          }}
        />
      </label>
      <p aria-live="polite" className="small">
        {state?.date === date
          ? `Status: ${state.closed ? "Tutup" : "Buka"}`
          : error
            ? "Status belum diketahui."
            : date
              ? "Memuat status…"
              : "Pilih tanggal."}
      </p>
      <button
        type="button"
        className="secondary min-h-11"
        disabled={saving || !state || state.date !== date}
        onClick={toggle}
      >
        {saving
          ? "Menyimpan…"
          : state?.closed
            ? "Buka kembali Free Visit"
            : "Tutup Free Visit"}
      </button>
      <p className="small muted">
        Penutupan menghentikan reservasi baru. Reservasi yang sudah masuk dan
        reminder-nya tetap berlaku; tangani pembatalan secara terpisah bila
        diperlukan.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <>
          <p role="alert" className="error">
            {error}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError("");
              setState(null);
              setRetry((r) => r + 1);
            }}
          >
            Muat ulang status
          </button>
        </>
      )}
    </section>
  );
}
