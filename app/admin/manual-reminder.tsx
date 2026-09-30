"use client";
import { useState } from "react";
import { manualReminderUrl } from "@/lib/manual-reminder";
export default function ManualReminder({
  reservation,
}: {
  reservation: {
    id: string;
    phone: string;
    appointment_at: string;
    status: string;
  };
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const url = manualReminderUrl(
    reservation.phone,
    reservation.appointment_at,
    reservation.status,
  );
  async function open() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Izinkan tab baru untuk membuka WhatsApp.");
      return;
    }
    popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reservation.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      popup.location.href = data.url;
    } catch (e) {
      popup.close();
      setError(e instanceof Error ? e.message : "Gagal membuka reminder.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        className="secondary min-h-11"
        disabled={busy || !url}
        onClick={open}
      >
        {busy ? "Membuka WhatsApp…" : "Kirim Reminder WhatsApp"}
      </button>
      <p className="small muted">
        Membuka percakapan saja. Admin tetap menekan kirim di WhatsApp.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
