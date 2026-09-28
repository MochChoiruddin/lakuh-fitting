import "server-only";
import { admin } from "./supabase";
import { reportFilter, type ReportData } from "./report";
export async function loadReport(req: Request) {
  const db = await admin(); // Authentication/membership always precede parsing and PII reads.
  const filter = reportFilter(new URL(req.url).searchParams);
  const { data, error } = await db.rpc("reservation_report", {
    p_start: filter.start,
    p_end: filter.end,
    p_status: filter.status,
  });
  if (error)
    throw new Error(
      error.code === "42501" ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
    );
  return { filter, data: data as ReportData };
}
