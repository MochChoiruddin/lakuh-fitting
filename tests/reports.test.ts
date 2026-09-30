import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { reportFilter, type ReportData } from "../lib/report";
import { reportWorkbook, exportFilename } from "../lib/report-workbook";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ admin: mocks.admin }));
import { GET } from "../app/api/admin/reports/export/route";
import { GET as summary } from "../app/api/admin/reports/route";

const data: ReportData = {
  counts: {
    total: 1205,
    pending: 302,
    confirmed: 301,
    completed: 301,
    cancelled: 301,
    no_show: 0,
  },
  rows: Array.from({ length: 1205 }, (_, i) => ({
    reference: `LK-SYNTHETIC-${i}`,
    name: [
      '=HYPERLINK("https://example.invalid")',
      "+SUM(1,1)",
      "-1+2",
      "@SUM(1,1)",
    ][i % 4],
    phone: "6281234567890",
    weight_kg: 90.5,
    height_cm: 160,
    event_date: null,
    event_date_unknown: true,
    appointment_at: "2026-09-27T17:00:00Z",
    status: ["pending", "confirmed", "completed", "cancelled"][i % 4],
    reminder_status: "cancelled",
    reminder_attempts: 2,
    created_at: "2026-09-27T10:00:00Z",
    status_updated_at: "2026-09-28T00:00:00Z",
  })),
};
describe("Jakarta reporting boundaries", () => {
  it("uses Monday after Sunday UTC and handles Sunday end of week", () => {
    expect(
      reportFilter(new URLSearchParams(), new Date("2026-09-27T17:01:00Z")),
    ).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
    expect(
      reportFilter(new URLSearchParams(), new Date("2026-10-04T16:59:59Z")),
    ).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
  });
  it("uses local month, leap year, and inclusive custom dates", () => {
    expect(
      reportFilter(
        new URLSearchParams("period=month"),
        new Date("2026-09-30T17:00:00Z"),
      ),
    ).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
    expect(
      reportFilter(new URLSearchParams("period=selected_month&month=2024-02")),
    ).toMatchObject({ start: "2024-02-01", end: "2024-02-29" });
    expect(
      reportFilter(
        new URLSearchParams(
          "period=custom&start=2026-09-28&end=2026-09-28&status=completed",
        ),
      ),
    ).toMatchObject({
      start: "2026-09-28",
      end: "2026-09-28",
      status: "completed",
    });
  });
  it.each([
    "period=bad",
    "status=no_show",
    "status=bogus",
    "period=selected_month&month=2026-13",
    "period=custom&start=2026-02-30&end=2026-03-01",
    "period=custom&start=2026-10-01&end=2026-09-01",
    "period=week&period=month",
    "unknown=x",
    "period=week&start=2026-01-01",
  ])("rejects %s", (query) => {
    expect(() => reportFilter(new URLSearchParams(query))).toThrow(
      "INVALID_REPORT_FILTER",
    );
  });
});
describe("real XLSX and protected HTTP handlers", () => {
  it("opens a workbook with >1000 rows, safe text cells and explicit fields only", async () => {
    const filter = reportFilter(
      new URLSearchParams("period=selected_month&month=2026-09"),
    );
    const input = {
      ...data,
      rows: data.rows.map((row) => ({
        ...row,
        consent_terms: true,
        token: "internal-fixture-sentinel",
        safe_error: "internal-error-sentinel",
      })),
    };
    const bytes = await reportWorkbook(
      input,
      filter,
      new Date("2026-09-28T00:00:00Z"),
    );
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Ringkasan",
      "Reservasi",
    ]);
    const sheet = workbook.getWorksheet("Reservasi")!;
    expect(sheet.rowCount).toBe(1206);
    expect(sheet.columnCount).toBe(14);
    expect(sheet.getCell("G1").text).toBe("Berat Badan (kg)");
    expect(sheet.getCell("H1").text).toBe("Tinggi Badan (cm)");
    expect(sheet.getCell("G2").value).toBe(90.5);
    expect(sheet.getCell("H2").value).toBe(160);
    expect(sheet.getRow(1).font.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      expect(sheet.getCell(i + 2, 5).type).toBe(ExcelJS.ValueType.String);
      expect(sheet.getCell(i + 2, 5).value).toBe(data.rows[i].name);
      expect(sheet.getCell(i + 2, 5).formula).toBeUndefined();
      expect(sheet.getCell(i + 2, 10).value).toBe(data.rows[i].status);
    }
    expect(sheet.getCell("C2").text).toContain("28 September 2026");
    expect(sheet.getCell("D2").text).toBe("00.00 WIB");
    expect(sheet.getCell("F2").type).toBe(ExcelJS.ValueType.String);
    expect(JSON.stringify(workbook.model)).not.toMatch(
      /internal-fixture-sentinel|internal-error-sentinel|consent_terms|access_token|service_role/,
    );
    expect(exportFilename(filter, new Date("2026-09-28T00:00:00Z"))).toBe(
      "lakuh-fitting-bulanan-2026-09-2026-09-28.xlsx",
    );
  });
  it.each([
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
  ] as const)("rejects %s before querying", async (message, status) => {
    mocks.admin.mockRejectedValue(new Error(message));
    mocks.rpc.mockClear();
    for (const handler of [GET, summary]) {
      const response = await handler(
        new Request("http://localhost/api/admin/reports/export?period=bad"),
      );
      expect(response.status).toBe(status);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid params with 400 and downloads for an authenticated admin", async () => {
    mocks.admin.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(
      (
        await GET(
          new Request("http://localhost/api/admin/reports/export?status=bad"),
        )
      ).status,
    ).toBe(400);
    const response = await GET(
      new Request(
        "http://localhost/api/admin/reports/export?period=custom&start=2026-09-01&end=2026-09-30",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    expect(workbook.getWorksheet("Reservasi")!.rowCount).toBe(1206);
    expect(mocks.rpc).toHaveBeenLastCalledWith("reservation_report", {
      p_start: "2026-09-01",
      p_end: "2026-09-30",
      p_status: null,
    });
  });
});
