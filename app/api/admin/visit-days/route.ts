import { admin } from "@/lib/supabase";
import { body, failure, json, sameOrigin } from "@/lib/http";
import { validVisitDate } from "@/lib/visit-days";

export async function GET(req: Request) {
  try {
    const db = await admin();
    const date = new URL(req.url).searchParams.get("date");
    if (!validVisitDate(date))
      return json({ error: "Tanggal tidak valid." }, 400);
    const { data, error } = await db
      .from("visit_days")
      .select("closed")
      .eq("visit_date", date)
      .maybeSingle();
    if (error) throw error;
    return json({ date, closed: data?.closed ?? false });
  } catch (e) {
    return failure(e);
  }
}

export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const db = await admin();
    const input = await body(req);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      !validVisitDate(input.date) ||
      typeof input.closed !== "boolean"
    )
      return json({ error: "Tanggal atau status tidak valid." }, 400);
    const { data, error } = await db.rpc("set_visit_day", {
      p_date: input.date,
      p_closed: input.closed,
    });
    if (error) {
      if (error.code === "42501") return json({ error: "Akses ditolak." }, 403);
      throw error;
    }
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
