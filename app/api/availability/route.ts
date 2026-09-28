import { service } from "@/lib/supabase";
import { failure, json, rateLimit } from "@/lib/http";
import { dates } from "@/lib/booking";
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!dates().includes(date))
      return json({ error: "Tanggal di luar periode reservasi." }, 400);
    await rateLimit(req, "availability", 180);
    const { data, error } = await service().rpc("availability", {
      p_date: date,
    });
    if (error) throw error;
    return json({ slots: data });
  } catch (e) {
    return failure(e);
  }
}
