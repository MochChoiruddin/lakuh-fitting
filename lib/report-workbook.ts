import "server-only";
import ExcelJS from "exceljs";
import { jakartaDate, longDate } from "./booking";
import { type ReportData, type ReportFilter } from "./report";
const time = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value)) + " WIB";
const timestamp = (value: string) =>
  `${longDate(jakartaDate(new Date(value)))} ${time(value)}`;
export function exportFilename(filter: ReportFilter, now = new Date()) {
  return `lakuh-fitting-${filter.slug}-${jakartaDate(now)}.xlsx`;
}
export async function reportWorkbook(
  data: ReportData,
  filter: ReportFilter,
  now = new Date(),
) {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Ringkasan");
  summary.columns = [
    { header: "Keterangan", width: 30 },
    { header: "Nilai", width: 65 },
  ];
  summary.addRows([
    ["Periode kunjungan (WIB)", filter.label],
    ["Filter status", filter.status ?? "Semua status"],
    ["Waktu export", timestamp(now.toISOString())],
    ["Total reservasi", data.counts.total],
    ["Pending", data.counts.pending],
    ["Confirmed", data.counts.confirmed],
    ["Completed", data.counts.completed],
    ["Cancelled", data.counts.cancelled],
  ]);
  if (data.counts.no_show)
    summary.addRow(["No show (historis)", data.counts.no_show]);
  const sheet = workbook.addWorksheet("Reservasi");
  sheet.columns = [
    ["No.", 8],
    ["Kode reservasi", 26],
    ["Tanggal kunjungan", 33],
    ["Jam kunjungan", 19],
    ["Nama customer", 35],
    ["Nomor WhatsApp", 24],
    ["Berat Badan (kg)", 20],
    ["Tinggi Badan (cm)", 20],
    ["Tanggal acara", 38],
    ["Status reservasi", 20],
    ["Status reminder", 20],
    ["Percobaan reminder", 23],
    ["Waktu dibuat", 47],
    ["Waktu perubahan status terakhir", 47],
  ].map(([header, width]) => ({
    header: String(header),
    width: Number(width),
  }));
  for (const [index, row] of data.rows.entries()) {
    // Strings are XLSX string cells, never formula objects (even =,+,-,@ prefixes).
    sheet.addRow([
      index + 1,
      String(row.reference),
      longDate(jakartaDate(new Date(row.appointment_at))),
      time(row.appointment_at),
      String(row.name),
      String(row.phone),
      row.weight_kg,
      row.height_cm,
      row.event_date_unknown
        ? "Belum memiliki tanggal acara pasti"
        : row.event_date
          ? longDate(row.event_date)
          : "Belum dicatat",
      String(row.status),
      row.reminder_status ? String(row.reminder_status) : "Tidak ada",
      row.reminder_attempts,
      timestamp(row.created_at),
      timestamp(row.status_updated_at),
    ]);
  }
  for (const item of [summary, sheet]) {
    item.views = [{ state: "frozen", ySplit: 1 }];
    item.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, item.rowCount), column: item.columnCount },
    };
    item.getRow(1).font = { bold: true, color: { argb: "FFFAF2ED" } };
    item.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF302226" },
    };
    item.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  }
  sheet.getColumn(6).numFmt = "@";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
