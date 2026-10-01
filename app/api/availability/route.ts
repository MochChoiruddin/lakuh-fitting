import { service } from "@/lib/supabase";
import { failure, json, rateLimit } from "@/lib/http";
import { dates, validAvailability } from "@/lib/booking";
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!dates().includes(date))
      return json({ error: "Tanggal di luar periode reservasi." }, 400);
    await rateLimit(req, "availability", 180);
    const { data, error } = await service().rpc("visit_availability", {
      p_date: date,
    });
    if (error) throw error;
    if (
      !data ||
      typeof data.closed !== "boolean" ||
      !validAvailability(data.slots) ||
      (data.closed &&
        data.slots.some((s: { available: boolean }) => s.available))
    )
      throw new Error("UNAVAILABLE");
    return json({ slots: data.slots, closed: data.closed });
  } catch (e) {
    return failure(e);
  }
}
