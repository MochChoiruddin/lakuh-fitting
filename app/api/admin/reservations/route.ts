import { admin } from "@/lib/supabase";
import { body, failure, json, sameOrigin } from "@/lib/http";
import { STATUSES } from "@/lib/booking";
export async function GET(req: Request) {
  try {
    const db = await admin();
    const params = new URL(req.url).searchParams;
    let query = db
      .from("reservations")
      .select(
        "id,reference,name,instagram,phone,appointment_at,status,status_updated_at,reminder_jobs(status,attempt_count,safe_error,sent_at)",
      )
      .order("appointment_at", { ascending: false })
      .limit(100);
    const status = params.get("status"),
      date = params.get("date");
    if (status && STATUSES.includes(status as (typeof STATUSES)[number]))
      query = query.eq("status", status);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
      query = query
        .gte("appointment_at", `${date}T00:00:00+07:00`)
        .lte("appointment_at", `${date}T23:59:59+07:00`);
    const q = (params.get("q") ?? "")
      .replace(/[^\p{L}\p{N} @.-]/gu, "")
      .slice(0, 80);
    if (q)
      query = query.or(
        `name.ilike.%${q}%,phone.ilike.%${q}%,reference.ilike.%${q}%`,
      );
    const { data, error } = await query;
    if (error) throw error;
    return json({ reservations: data });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const db = await admin(),
      b = await body(req);
    if (
      typeof b.id !== "string" ||
      !/^[\da-f-]{36}$/i.test(b.id) ||
      !STATUSES.includes(b.status)
    )
      return json({ error: "Status tidak valid." }, 400);
    const { error } = await db.rpc("change_status", {
      p_id: b.id,
      p_status: b.status,
    });
    if (error)
      return json(
        {
          error:
            "Perubahan status tidak diizinkan. Periksa status dan waktu appointment.",
        },
        409,
      );
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
