"use client";
import { useCallback, useEffect, useState } from "react";
import { STATUSES, type Status } from "@/lib/booking";
type Reservation = {
  id: string;
  reference: string;
  name: string;
  instagram: string;
  phone: string;
  appointment_at: string;
  status: Status;
  status_updated_at: string;
  reminder_jobs: {
    status: string;
    attempt_count: number;
    safe_error: string | null;
    sent_at: string | null;
  } | null;
};
export default function AdminPanel({ authorized }: { authorized: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState("");
  const [rows, setRows] = useState<Reservation[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/admin/reservations?${new URLSearchParams({ q, status, date })}`,
      );
      const data = await r.json();
      if (!r.ok) {
        setRows([]);
        throw new Error(data.error);
      }
      setRows(data.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat reservasi.");
    } finally {
      setBusy(false);
    }
  }, [q, status, date]);
  useEffect(() => {
    if (authorized) {
      const timer = setTimeout(load, 300);
      return () => clearTimeout(timer);
    }
  }, [authorized, load]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }
  async function change(id: string, next: Status) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!authorized ? (
        <form className="card max-w-md mt-8" onSubmit={login}>
          <h2 className="section-title">Masuk ke Lakuh</h2>
          <p className="small muted">Khusus admin yang telah diberi akses.</p>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Kata sandi
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      ) : (
        <>
          <button
            className="back"
            onClick={async () => {
              const r = await fetch("/api/admin/session", { method: "DELETE" });
              if (r.ok) window.location.reload();
              else setError("Gagal keluar. Coba lagi.");
            }}
          >
            Keluar dari akun
          </button>
          <div className="filters">
            <label>
              Cari nama, WA, referensi
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari reservasi…"
              />
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Semua status</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Tanggal (WIB)
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <p className="small muted" aria-live="polite">
            {busy
              ? "Memuat…"
              : `${rows.length} reservasi · maksimal 100 hasil terbaru. Gunakan filter untuk mempersempit.`}
          </p>
          {rows.map((r) => (
            <article className="card reservation-item" key={r.id}>
              <span className="eyebrow">
                {r.reference} · {r.status}
              </span>
              <h2>{r.name}</h2>
              <p>
                {new Intl.DateTimeFormat("id-ID", {
                  timeZone: "Asia/Jakarta",
                  dateStyle: "full",
                  timeStyle: "short",
                }).format(new Date(r.appointment_at))}{" "}
                WIB
              </p>
              <p className="small muted">
                +{r.phone}
                {r.instagram && ` · @${r.instagram}`}
              </p>
              <p className="small muted">
                Audit status:{" "}
                {new Date(r.status_updated_at).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                })}{" "}
                WIB
              </p>
              {(r.reminder_jobs ? [r.reminder_jobs] : []).map((j, i) => (
                <p className="small" key={i}>
                  Reminder: {j.status} · Percobaan {j.attempt_count}/3{" "}
                  {j.safe_error && `· ${j.safe_error}`}
                  {j.sent_at &&
                    ` · ${new Date(j.sent_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`}
                </p>
              ))}
              <div className="status-actions">
                {(r.status === "pending"
                  ? ["confirmed", "cancelled"]
                  : r.status === "confirmed"
                    ? ["cancelled", "completed", "no_show"]
                    : []
                ).map((s) => (
                  <button
                    className="secondary"
                    key={s}
                    disabled={
                      busy ||
                      (["completed", "no_show"].includes(s) &&
                        new Date(r.appointment_at) > new Date())
                    }
                    onClick={() => change(r.id, s as Status)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
    </>
  );
}
