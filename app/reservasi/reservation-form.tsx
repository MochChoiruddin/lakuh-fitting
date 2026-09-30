"use client";
import { useEffect, useRef, useState } from "react";
import { receiptWhatsAppUrl } from "@/lib/receipt-whatsapp";
import {
  customerErrors,
  jakartaDate,
  longDate,
  normalizePhone,
  SLOTS,
  validAvailability,
  type BookingReceipt,
  type CustomerInput,
} from "@/lib/booking";
import {
  CONSENTS,
  STOCK_NOTE,
  TERMS,
  TERMS_CLOSING,
  TERMS_NOTICE,
  TERMS_VERSION,
  VISIT_NOTE,
  type ConsentKey,
} from "@/lib/free-visit";

type Availability = { slot: string; available: boolean };
const emptyConsents: Record<ConsentKey, boolean> = {
  consent_on_time: false,
  consent_whatsapp: false,
  consent_stock: false,
  consent_terms: false,
};
function Summary({
  customer,
  date,
  slot,
}: {
  customer: CustomerInput;
  date: string;
  slot: string;
}) {
  return (
    <div aria-label="Ringkasan reservasi">
      {[
        ["Kunjungan", `${longDate(date)} · ${slot.replace(":", ".")} WIB`],
        ["Nama", customer.name],
        ["WhatsApp", `+${customer.phone}`],
        ["Berat Badan", `${customer.weight_kg} kg`],
        ["Tinggi Badan", `${customer.height_cm} cm`],
        ["Rencana acara", customer.event_plan || "Tidak diisi"],
        [
          "Tanggal acara",
          customer.event_date_unknown
            ? "Belum memiliki tanggal acara pasti"
            : customer.event_date
              ? longDate(customer.event_date)
              : "—",
        ],
      ].map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <p>{value}</p>
        </div>
      ))}
    </div>
  );
}
export default function ReservationForm({ today }: { today: string }) {
  const [date, setDate] = useState(today),
    [slot, setSlot] = useState(""),
    [step, setStep] = useState(1);
  const [slots, setSlots] = useState<Availability[]>([]),
    [loading, setLoading] = useState(true),
    [availabilityError, setAvailabilityError] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [weight, setWeight] = useState(""),
    [height, setHeight] = useState("");
  const [eventPlan, setEventPlan] = useState(""),
    [eventDate, setEventDate] = useState(""),
    [eventUnknown, setEventUnknown] = useState(false);
  const [consents, setConsents] = useState(emptyConsents),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null),
    [attempted, setAttempted] = useState(false);
  const key = useRef(""),
    submitted = useRef(false),
    title = useRef<HTMLHeadingElement>(null);
  const customer: CustomerInput = {
    name,
    phone,
    weight_kg: weight.trim() === "" ? NaN : Number(weight),
    height_cm: height.trim() === "" ? NaN : Number(height),
    event_plan: eventPlan,
    event_date: eventUnknown ? null : eventDate || null,
    event_date_unknown: eventUnknown,
  };
  const dataValid = Object.keys(customerErrors(customer, date)).length === 0;
  const canSubmit =
    dataValid && CONSENTS.every(([key]) => consents[key]) && !!slot && !busy;
  useEffect(() => {
    title.current?.focus();
  }, [step, receipt]);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = jakartaDate();
      if (next !== date && !receipt && !attempted) {
        setDate(next);
        setSlot("");
        setStep(1);
        setSlots([]);
        setLoading(true);
        setError("Tanggal kunjungan diperbarui sesuai hari ini di WIB.");
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [date, receipt, attempted]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/availability?date=${date}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !validAvailability(data.slots))
          throw new Error("UNAVAILABLE");
        if (controller.signal.aborted) return;
        setSlots(data.slots);
        setAvailabilityError("");
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSlots([]);
        setSlot("");
        setAvailabilityError(
          "Ketersediaan belum dapat dimuat. Silakan coba lagi.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [date, retry]);
  function validateField(field: string) {
    setFieldErrors((current) => ({
      ...current,
      [field]: customerErrors(customer, date)[field] || "",
    }));
  }
  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }
  function fieldError(field: string) {
    return fieldErrors[field] ? (
      <span id={`${field}-error`} className="field-error" role="alert">
        {fieldErrors[field]}
      </span>
    ) : null;
  }
  function confirmData(e: React.FormEvent) {
    e.preventDefault();
    const errors = customerErrors(customer, date);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setName(name.trim());
    setPhone(normalizePhone(phone));
    setError("");
    setStep(3);
  }
  async function submit() {
    if (submitted.current || !canSubmit) return;
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
          ...customer,
          ...consents,
          date,
          slot,
          terms_version: TERMS_VERSION,
          key: key.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 409) {
          key.current = "";
          setAttempted(false);
          if (data.fields) {
            setFieldErrors(data.fields);
            setStep(
              Object.keys(data.fields).some((field) =>
                field.startsWith("consent_"),
              )
                ? 3
                : 2,
            );
          }
          if (response.status === 409) {
            setDate(jakartaDate());
            setStep(1);
            setSlot("");
            setSlots([]);
            setLoading(true);
            setRetry((v) => v + 1);
          }
        }
        throw new Error(
          data.error ||
            "Reservasi belum dapat dipastikan. Coba lagi dengan data yang sama.",
        );
      }
      setReceipt(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reservasi belum dapat dipastikan. Coba lagi dengan data yang sama.",
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
          {["Jadwal", "Data diri", "Persetujuan"].map((label, i) => (
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
              Sampai bertemu, {receipt.name.split(" ")[0]}.
            </h2>
            <p className="muted small">Reservasimu sudah tercatat.</p>
            <div className="reference">
              <span className="eyebrow">Nomor referensi</span>
              <br />
              {receipt.reference}
            </div>
            <Summary
              customer={receipt}
              date={jakartaDate(new Date(receipt.appointment_at))}
              slot={new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jakarta",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(receipt.appointment_at))}
            />
            <p className="small muted">
              Status: {receipt.status}. Simpan halaman ini sebagai bukti
              reservasi.
            </p>
            <button className="secondary" onClick={() => window.print()}>
              Simpan / cetak bukti
            </button>
            <a
              className="receipt-whatsapp"
              href={receiptWhatsAppUrl(receipt)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Kirim ke WhatsApp Admin
            </a>
            <p className="small muted">
              Membuka percakapan WhatsApp. Pesan belum dikirim sampai kamu
              mengirimnya di WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <>
                <h2 ref={title} tabIndex={-1} className="section-title">
                  Pilih jam kunjungan
                </h2>
                <p className="small muted">
                  Satu customer per slot. Semua waktu WIB.
                </p>
                <div className="visit-info" aria-label="Tanggal kunjungan">
                  <span className="eyebrow">Hari ini</span>
                  <p>{longDate(date)}</p>
                </div>
                <h3 className="field-title">
                  Pilih jam kedatangan <span className="muted">· WIB</span>
                </h3>
                {!availabilityError && (
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
                )}
                <p className="small muted" aria-live="polite">
                  {availabilityError
                    ? "Ketersediaan belum diketahui. Muat ulang jadwal untuk mencoba lagi."
                    : loading
                      ? "Memuat jadwal…"
                      : !slots.some((s) => s.available)
                        ? "Jadwal hari ini sudah penuh atau melewati batas reservasi."
                        : "Reservasi ditutup 60 menit sebelum jadwal."}
                </p>
                {availabilityError && (
                  <>
                    <p className="error" role="alert">
                      {availabilityError}
                    </p>
                    <button
                      className="back"
                      onClick={() => {
                        setLoading(true);
                        setAvailabilityError("");
                        setRetry((v) => v + 1);
                      }}
                    >
                      Muat ulang jadwal ↻
                    </button>
                  </>
                )}
                <div className="visit-info">
                  <p>{VISIT_NOTE}</p>
                </div>
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
              <form onSubmit={confirmData} noValidate>
                <h2 ref={title} tabIndex={-1} className="section-title">
                  Isi identitas dan informasi acara
                </h2>
                <label className="field">
                  Nama Lengkap
                  <input
                    required
                    autoComplete="name"
                    name="name"
                    aria-label="Nama Lengkap"
                    maxLength={80}
                    value={name}
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby="name-error"
                    onChange={(e) => {
                      setName(e.target.value);
                      clearField("name");
                    }}
                    onBlur={() => validateField("name")}
                  />
                  {fieldError("name")}
                </label>
                <label className="field">
                  Nomor HP/WhatsApp
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    name="phone"
                    aria-label="Nomor HP/WhatsApp"
                    maxLength={22}
                    value={phone}
                    aria-invalid={!!fieldErrors.phone}
                    aria-describedby="phone-error"
                    onChange={(e) => {
                      setPhone(e.target.value);
                      clearField("phone");
                    }}
                    onBlur={() => validateField("phone")}
                  />
                  {fieldError("phone")}
                </label>
                {(
                  [
                    [
                      "weight_kg",
                      "Berat Badan (kg)",
                      weight,
                      setWeight,
                      20,
                      300,
                    ],
                    [
                      "height_cm",
                      "Tinggi Badan (cm)",
                      height,
                      setHeight,
                      80,
                      250,
                    ],
                  ] as const
                ).map(([key, label, value, setter, min, max]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      step="any"
                      inputMode="decimal"
                      name={key}
                      aria-label={label}
                      min={min}
                      max={max}
                      value={value}
                      aria-invalid={!!fieldErrors[key]}
                      aria-describedby={`${key}-error`}
                      onChange={(e) => {
                        setter(e.target.value);
                        clearField(key);
                      }}
                      onBlur={() => validateField(key)}
                    />
                    {fieldError(key)}
                  </label>
                ))}
                <label className="field">
                  Informasi Rencana Acara{" "}
                  <span className="muted">(opsional)</span>
                  <textarea
                    name="event_plan"
                    aria-label="Informasi Rencana Acara (opsional)"
                    maxLength={2000}
                    rows={3}
                    value={eventPlan}
                    aria-invalid={!!fieldErrors.event_plan}
                    aria-describedby="event_plan-error"
                    onChange={(e) => {
                      setEventPlan(e.target.value);
                      clearField("event_plan");
                    }}
                    onBlur={() => validateField("event_plan")}
                  />
                  {fieldError("event_plan")}
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={eventUnknown}
                    onChange={(e) => {
                      setEventUnknown(e.target.checked);
                      if (e.target.checked) setEventDate("");
                      clearField("event_date");
                    }}
                  />
                  <span>Saya belum memiliki tanggal acara pasti</span>
                </label>
                <label className="field">
                  Tanggal Acara
                  <input
                    type="date"
                    required={!eventUnknown}
                    disabled={eventUnknown}
                    min={date}
                    name="event_date"
                    aria-label="Tanggal Acara"
                    value={eventDate}
                    aria-invalid={!!fieldErrors.event_date}
                    aria-describedby="event_date-error"
                    onChange={(e) => {
                      setEventDate(e.target.value);
                      clearField("event_date");
                    }}
                    onBlur={() => validateField("event_date")}
                  />
                  {fieldError("event_date")}
                </label>
                <button className="primary" type="submit">
                  Baca syarat &amp; persetujuan →
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
                  Syarat dan Ketentuan Free Visit
                </h2>
                <div className="terms-notice">
                  <p>{TERMS_NOTICE}</p>
                </div>
                <ol className="visit-terms">
                  {TERMS.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ol>
                <h3 className="field-title">Informasi terkait stok kebaya</h3>
                <p className="small terms-copy">{STOCK_NOTE}</p>
                <p className="small terms-copy">{TERMS_CLOSING}</p>
                <h3 className="field-title">Ringkasan reservasi</h3>
                <Summary customer={customer} date={date} slot={slot} />
                <p className="small muted">
                  Pengingat WhatsApp dijadwalkan 2 jam sebelum kunjungan. Jika
                  reservasi dibuat kurang dari 2 jam sebelumnya, pengingat
                  diproses pada jadwal pengiriman berikutnya.
                </p>
                {CONSENTS.map(([key, label]) => (
                  <div key={key}>
                    <label className="consent">
                      <input
                        type="checkbox"
                        required
                        disabled={busy || attempted}
                        checked={consents[key]}
                        aria-invalid={!!fieldErrors[key]}
                        onChange={(e) => {
                          setConsents((c) => ({
                            ...c,
                            [key]: e.target.checked,
                          }));
                          clearField(key);
                        }}
                      />
                      <span>{label}</span>
                    </label>
                    {fieldError(key)}
                  </div>
                ))}
                <button
                  className="primary"
                  disabled={!canSubmit}
                  onClick={submit}
                >
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
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
      <aside aria-label="Informasi kunjungan">
        <div className="note">
          <h3>Sebelum berkunjung</h3>
          <p>
            Data yang Kakak berikan digunakan untuk mengelola appointment dan
            pengingat WhatsApp. Jika rencana berubah, hubungi tim butik untuk
            pembatalan.
          </p>
        </div>
      </aside>
    </div>
  );
}
