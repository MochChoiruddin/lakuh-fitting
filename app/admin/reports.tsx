"use client";
import { useEffect, useMemo, useState } from "react";
import { jakartaDate } from "@/lib/booking";
import { REPORT_STATUSES, type ReportCounts } from "@/lib/report";
import "./reports.css";
export default function Reports({ revision }: { revision: number }) {
  const today = jakartaDate();
  const [period, setPeriod] = useState("week"),
    [month, setMonth] = useState(today.slice(0, 7));
  const [start, setStart] = useState(today),
    [end, setEnd] = useState(today),
    [status, setStatus] = useState("");
  const [counts, setCounts] = useState<ReportCounts | null>(null),
    [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams({ period, status });
    if (period === "selected_month") p.set("month", month);
    if (period === "custom") {
      p.set("start", start);
      p.set("end", end);
    }
    return p.toString();
  }, [period, status, month, start, end]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setCounts(null);
      try {
        const response = await fetch(`/api/admin/reports?${query}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) {
          setCounts(data.counts);
          setLabel(data.filter.label);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Laporan gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [query, revision]);
  async function download() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reports/export?${query}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "lakuh-fitting.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export gagal. Coba lagi.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="card admin-reports" aria-labelledby="report-title">
      <h2 id="report-title">Laporan Reservasi</h2>
      <p className="small muted">
        Berdasarkan tanggal kunjungan WIB. Export mencakup seluruh hasil periode
        yang dipilih.
      </p>
      <fieldset disabled={exporting} className="report-filters">
        <legend className="sr-only">Filter laporan</legend>
        <label>
          Periode laporan
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">Minggu ini</option>
            <option value="month">Bulan ini</option>
            <option value="selected_month">Bulan tertentu</option>
            <option value="custom">Rentang tanggal khusus</option>
          </select>
        </label>
        {period === "selected_month" && (
          <label>
            Bulan laporan
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}
        {period === "custom" && (
          <>
            <label>
              Dari tanggal
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Sampai tanggal
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Status laporan
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            {REPORT_STATUSES.map((s) => (
              <option value={s} key={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p>Memuat laporan…</p>
        ) : (
          counts && (
            <>
              <p className="small muted">{label}</p>
              <dl className="report-counts">
                {["total", ...REPORT_STATUSES].map((s) => (
                  <div key={s}>
                    <dt>
                      {s === "total"
                        ? "Total reservasi"
                        : s[0].toUpperCase() + s.slice(1)}
                    </dt>
                    <dd>{counts[s as keyof ReportCounts]}</dd>
                  </div>
                ))}
              </dl>
              {counts.no_show > 0 && (
                <p className="small muted">
                  Termasuk {counts.no_show} no_show historis pada total.
                </p>
              )}
            </>
          )
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={loading || exporting || !counts}
        onClick={download}
      >
        {exporting ? "Membuat file Excel…" : "Export Excel"}
      </button>
    </section>
  );
}
