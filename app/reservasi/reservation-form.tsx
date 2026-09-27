"use client";
import { useEffect, useRef, useState } from "react";
import { dates, longDate, normalizePhone, SLOTS } from "@/lib/booking";
type Availability = { slot: string; available: boolean };
type Receipt = { reference: string; appointment_at: string; status: string };
export default function ReservationForm({ today }: { today: string }) {
  const allowed = dates(new Date(`${today}T12:00:00+07:00`));
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState(""),
    [step, setStep] = useState(1);
  const [slots, setSlots] = useState<Availability[]>([]),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(""),
    [instagram, setInstagram] = useState(""),
    [phone, setPhone] = useState("");
  const [policy, setPolicy] = useState(false),
    [reminder, setReminder] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const key = useRef("");
  const [attempted, setAttempted] = useState(false);
  const submitted = useRef(false);
  const [retry, setRetry] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [step, receipt]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/availability?date=${date}`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setSlots(data.slots);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError("Ketersediaan belum dapat dimuat. Silakan coba lagi.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [date, retry]);
  function chooseDate(value: string) {
    if (value === date) return;
    setDate(value);
    setSlot("");
    setSlots([]);
    setLoading(true);
    setError("");
  }
  function confirmData(e: React.FormEvent) {
    e.preventDefault();
    try {
      setPhone(normalizePhone(phone));
      setError("");
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setAttempted(true);
    setBusy(true);
    setError("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          instagram,
          phone,
          date,
          slot,
          policy,
          reminder,
          key: key.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 409) {
          key.current = "";
          setAttempted(false);
          if (response.status === 409) {
            setStep(1);
            setSlot("");
            setSlots([]);
            setLoading(true);
            setRetry((v) => v + 1);
          }
        }
        throw new Error(data.error);
      }
      setReceipt(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reservasi belum dapat dipastikan. Coba kirim kembali dengan data yang sama.",
      );
    } finally {
      setBusy(false);
      submitted.current = false;
    }
  }
  return (
    <div className="booking-layout">
      <section className="card" aria-label="Form reservasi fitting">
        <ol className="steps" aria-label="Tahapan reservasi">
          {["Jadwal", "Data diri", "Konfirmasi"].map((label, i) => (
            <li
              key={label}
              className={`step ${step === i + 1 ? "active" : ""} ${step > i + 1 ? "complete" : ""}`}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <b aria-hidden="true">{i + 1}</b>
              <span>
                <span className="sr-only">Tahap {i + 1}: </span>
                {label}
              </span>
            </li>
          ))}
        </ol>
        {receipt ? (
          <div className="receipt">
            <div className="check" aria-hidden="true">
              ✓
            </div>
            <h2 ref={title} tabIndex={-1} className="section-title">
              Sampai bertemu, {name.split(" ")[0]}.
            </h2>
            <p className="muted small">
              Reservasimu sudah tercatat.
              <br />
              Tim Lakuh akan meninjau dan mengonfirmasi jadwalmu.
            </p>
            <div className="reference">
              <span className="eyebrow">Nomor referensi</span>
              <br />
              {receipt.reference}
            </div>
            <p>
              {longDate(date)}
              <br />
              {slot.replace(":", ".")} WIB
            </p>
            <p className="small muted">
              Status: {receipt.status}
              <br />
              Simpan halaman ini sebagai bukti reservasi.
            </p>
            <button className="secondary" onClick={() => window.print()}>
              Simpan / cetak bukti
            </button>
          </div>
        ) : (
          <>
            {step === 1 && (
              <>
                <h2 ref={title} tabIndex={-1} className="section-title">
                  Pilih hari &amp; jam
                </h2>
                <p className="small muted">
                  Satu jadwal, satu sesi khusus untukmu. Semua waktu WIB.
                </p>
                <div className="date-strip-heading">
                  <span>Pilih tanggal</span>
                  <span className="muted" id="date-hint">
                    Geser untuk lainnya <span aria-hidden="true">→</span>
                  </span>
                </div>
                <div
                  className="date-strip"
                  role="group"
                  aria-label="Tanggal reservasi"
                  aria-describedby="date-hint"
                >
                  {allowed.map((d) => {
                    const day = new Date(d + "T12:00:00+07:00");
                    return (
                      <button
                        key={d}
                        className={`date-card ${d === date ? "selected" : ""}`}
                        aria-label={longDate(d)}
                        aria-pressed={d === date}
                        onClick={() => chooseDate(d)}
                      >
                        <span>
                          {new Intl.DateTimeFormat("id-ID", {
                            weekday: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(day)}
                        </span>
                        <strong>{Number(d.slice(-2))}</strong>
                        <span>
                          {new Intl.DateTimeFormat("id-ID", {
                            month: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(day)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <h3 className="field-title">
                  Pilih jam kedatangan <span className="muted">· WIB</span>
                </h3>
                <div className="slots" aria-busy={loading}>
                  {SLOTS.map((s) => (
                    <button
                      key={s}
                      className={`slot ${s === slot ? "selected" : ""}`}
                      aria-pressed={s === slot}
                      disabled={
                        loading || !slots.find((x) => x.slot === s)?.available
                      }
                      onClick={() => setSlot(s)}
                    >
                      {s.replace(":", ".")}
                    </button>
                  ))}
                </div>
                <p className="small muted" aria-live="polite">
                  {loading
                    ? "Memuat jadwal…"
                    : slots.length > 0 && !slots.some((s) => s.available)
                      ? "Jadwal tanggal ini sudah penuh atau melewati batas reservasi."
                      : "Untuk hari ini, reservasi ditutup 60 menit sebelum jadwal."}
                </p>
                {error && (
                  <button
                    className="back"
                    onClick={() => {
                      setLoading(true);
                      setError("");
                      setRetry(retry + 1);
                    }}
                  >
                    Muat ulang jadwal ↻
                  </button>
                )}
                <button
                  className="primary"
                  disabled={!slot || loading}
                  onClick={() => {
                    setError("");
                    setStep(2);
                  }}
                >
                  Lanjutkan <span aria-hidden="true">→</span>
                </button>
              </>
            )}
            {step === 2 && (
              <form
                onSubmit={confirmData}
                onInvalid={(event) => {
                  const input = event.target as HTMLInputElement;
                  const messages: Record<string, string> = {
                    name: "Isi nama lengkap, 2–80 karakter.",
                    instagram:
                      "Gunakan username Instagram tanpa spasi atau tautan.",
                    phone: "Isi nomor WhatsApp aktif.",
                    policy: "Persetujuan kebijakan reservasi wajib dicentang.",
                    reminder: "Persetujuan pengingat WhatsApp wajib dicentang.",
                  };
                  setFieldErrors((current) => ({
                    ...current,
                    [input.name]: messages[input.name],
                  }));
                }}
                onInput={(event) => {
                  const input = event.target as HTMLInputElement;
                  setFieldErrors((current) => ({
                    ...current,
                    [input.name]: "",
                  }));
                }}
              >
                <h2 ref={title} tabIndex={-1} className="section-title">
                  Lengkapi datamu
                </h2>
                <p className="small muted">
                  Agar kami bisa menyiapkan kunjunganmu.
                </p>
                <label className="field">
                  Nama lengkap
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    name="name"
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={
                      fieldErrors.name ? "name-error" : undefined
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama panggilan yang kamu suka"
                  />
                  {fieldErrors.name && (
                    <span className="field-error" id="name-error" role="alert">
                      {fieldErrors.name}
                    </span>
                  )}
                </label>
                <label className="field">
                  Instagram <span className="muted">(opsional)</span>
                  <input
                    maxLength={31}
                    name="instagram"
                    aria-invalid={!!fieldErrors.instagram}
                    aria-describedby={
                      fieldErrors.instagram ? "instagram-error" : undefined
                    }
                    pattern="@?[a-zA-Z0-9._]{0,30}"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@username"
                    autoCapitalize="none"
                  />
                  {fieldErrors.instagram && (
                    <span
                      className="field-error"
                      id="instagram-error"
                      role="alert"
                    >
                      {fieldErrors.instagram}
                    </span>
                  )}
                </label>
                <label className="field">
                  Nomor WhatsApp
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={22}
                    name="phone"
                    aria-invalid={!!error || !!fieldErrors.phone}
                    aria-describedby={
                      error || fieldErrors.phone
                        ? "phone-help phone-error"
                        : "phone-help"
                    }
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                  <small id="phone-help">
                    Gunakan nomor aktif untuk pengingat appointment.
                  </small>
                  {(error || fieldErrors.phone) && (
                    <span id="phone-error" role="alert" className="field-error">
                      {error || fieldErrors.phone}
                    </span>
                  )}
                </label>
                <label className="consent">
                  <input
                    required
                    type="checkbox"
                    name="policy"
                    aria-invalid={!!fieldErrors.policy}
                    aria-describedby={
                      fieldErrors.policy ? "policy-error" : undefined
                    }
                    checked={policy}
                    onChange={(e) => setPolicy(e.target.checked)}
                  />
                  <span>
                    Saya menyetujui <a href="#kebijakan">kebijakan reservasi</a>{" "}
                    dan penggunaan data untuk mengelola appointment.
                  </span>
                </label>
                {fieldErrors.policy && (
                  <p className="field-error" id="policy-error" role="alert">
                    {fieldErrors.policy}
                  </p>
                )}
                <label className="consent">
                  <input
                    required
                    type="checkbox"
                    name="reminder"
                    aria-invalid={!!fieldErrors.reminder}
                    aria-describedby={
                      fieldErrors.reminder ? "reminder-error" : undefined
                    }
                    checked={reminder}
                    onChange={(e) => setReminder(e.target.checked)}
                  />
                  <span>
                    Saya bersedia menerima pengingat appointment melalui
                    WhatsApp.
                  </span>
                </label>
                {fieldErrors.reminder && (
                  <p className="field-error" id="reminder-error" role="alert">
                    {fieldErrors.reminder}
                  </p>
                )}
                <button className="primary" type="submit">
                  Periksa reservasi →
                </button>
                <button
                  className="back"
                  type="button"
                  onClick={() => setStep(1)}
                >
                  ← Kembali ke jadwal
                </button>
              </form>
            )}
            {step === 3 && (
              <>
                <h2 ref={title} tabIndex={-1} className="section-title">
                  Konfirmasi reservasi
                </h2>
                <p className="small muted">
                  Periksa kembali sebelum menyimpan reservasi.
                </p>
                <div className="summary-row">
                  <span>Nama</span>
                  <p>{name}</p>
                </div>
                <div className="summary-row">
                  <span>WhatsApp</span>
                  <p>+{phone}</p>
                </div>
                <div className="summary-row">
                  <span>Instagram</span>
                  <p>{instagram || "Tidak diisi"}</p>
                </div>
                <div className="summary-row">
                  <span>Appointment</span>
                  <p>
                    {longDate(date)} · {slot.replace(":", ".")} WIB
                  </p>
                </div>
                <p className="small muted">
                  Jadwal akan tersimpan setelah reservasi berhasil. Pengingat
                  WhatsApp dijadwalkan sekitar 2 jam sebelum kunjungan.
                </p>
                <button className="primary" disabled={busy} onClick={submit}>
                  {busy ? "Menyimpan reservasi…" : "Konfirmasi reservasi →"}
                </button>
                {!attempted && (
                  <button
                    className="back"
                    disabled={busy}
                    onClick={() => setStep(2)}
                  >
                    ← Ubah data
                  </button>
                )}
              </>
            )}
            {error && step !== 2 && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </>
        )}
      </section>
      <aside aria-label="Informasi kunjungan">
        <div className="note" id="kebijakan">
          <h3>Sebelum berkunjung</h3>
          <p>
            Datang sesuai jadwal yang dipilih. Jika rencana berubah, hubungi tim
            butik untuk pembatalan. Satu slot tersedia untuk satu reservasi.
          </p>
          <p>
            Nama dan WhatsApp hanya digunakan untuk mengelola reservasi serta
            pengingat kunjungan. Reservasi kurang dari 2 jam sebelum jadwal
            menerima pengingat pada proses pengiriman berikutnya.
          </p>
        </div>
      </aside>
    </div>
  );
}
