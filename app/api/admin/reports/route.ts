import { loadReport } from "@/lib/report-server";
import { failure, json } from "@/lib/http";
export async function GET(req: Request) {
  try {
    const { filter, data } = await loadReport(req);
    return json({ filter, counts: data.counts });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_REPORT_FILTER")
      return json({ error: "Filter laporan tidak valid." }, 400);
    return failure(e);
  }
}
