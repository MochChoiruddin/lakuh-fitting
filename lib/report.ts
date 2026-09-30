import { jakartaDate, validDate } from "./booking";
export const REPORT_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
] as const;
export type ReportFilter = {
  start: string;
  end: string;
  status: string | null;
  label: string;
  slug: string;
};
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
export function reportFilter(
  params: URLSearchParams,
  now = new Date(),
): ReportFilter {
  const invalid = () => {
    throw new Error("INVALID_REPORT_FILTER");
  };
  for (const key of params.keys()) {
    if (
      !["period", "month", "start", "end", "status"].includes(key) ||
      params.getAll(key).length !== 1
    )
      invalid();
  }
  const period = params.get("period") ?? "week";
  const status = params.get("status") || null;
  if (status && !(REPORT_STATUSES as readonly string[]).includes(status))
    invalid();
  const today = jakartaDate(now);
  let start: string, end: string, slug: string;
  if (period === "week") {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    start = dateOnly(day);
    day.setUTCDate(day.getUTCDate() + 6);
    end = dateOnly(day);
    slug = "mingguan";
  } else if (period === "month" || period === "selected_month") {
    const month = period === "month" ? today.slice(0, 7) : params.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return invalid();
    start = `${month}-01`;
    const day = new Date(`${start}T00:00:00Z`);
    day.setUTCMonth(day.getUTCMonth() + 1, 0);
    end = dateOnly(day);
    slug = `bulanan-${month}`;
  } else if (period === "custom") {
    start = params.get("start") ?? "";
    end = params.get("end") ?? "";
    slug = `rentang-${start}-${end}`;
  } else return invalid();
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    start < "1900-01-01" ||
    end > "9998-12-31"
  )
    invalid();
  if (params.has("month") && period !== "selected_month") invalid();
  if ((params.has("start") || params.has("end")) && period !== "custom")
    invalid();
  return {
    start,
    end,
    status,
    slug,
    label: `${start} sampai ${end} (Asia/Jakarta)`,
  };
}
export type ReportRow = {
  reference: string;
  appointment_at: string;
  name: string;
  phone: string;
  weight_kg: number | null;
  height_cm: number | null;
  event_date: string | null;
  event_date_unknown: boolean | null;
  status: string;
  reminder_status: string | null;
  reminder_attempts: number;
  created_at: string;
  status_updated_at: string;
};
export type ReportCounts = Record<
  "total" | "pending" | "confirmed" | "completed" | "cancelled" | "no_show",
  number
>;
export type ReportData = { rows: ReportRow[]; counts: ReportCounts };
