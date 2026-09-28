import { loadReport } from "@/lib/report-server";
import { exportFilename, reportWorkbook } from "@/lib/report-workbook";
import { failure, json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const { filter, data } = await loadReport(req);
    const now = new Date();
    return new Response(await reportWorkbook(data, filter, now), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(filter, now)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_REPORT_FILTER")
      return json({ error: "Filter laporan tidak valid." }, 400);
    return failure(e);
  }
}
