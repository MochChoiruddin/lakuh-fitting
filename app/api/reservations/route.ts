import { validateBooking } from "@/lib/booking";
import { body, failure, json, rateLimit, sameOrigin } from "@/lib/http";
import { service } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "booking", 15);
    const raw = await body(req);
    let b;
    try {
      b = validateBooking(raw);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    const { data, error } = await service().rpc("book_fitting", {
      p_key: b.key,
      p_name: b.name,
      p_instagram: b.instagram,
      p_phone: b.phone,
      p_date: b.date,
      p_slot: b.slot,
      p_policy: b.policy,
      p_reminder: b.reminder,
    });
    if (error) {
      if (error.code === "23505" || /CUTOFF|INVALID_SLOT/.test(error.message))
        return json(
          { error: "Jadwal sudah tidak tersedia. Silakan pilih jadwal lain." },
          409,
        );
      if (error.message.includes("IDEMPOTENCY_CONFLICT"))
        return json(
          { error: "Data berubah. Mulai reservasi baru untuk melanjutkan." },
          409,
        );
      if (error.message.includes("INVALID_INPUT"))
        return json({ error: "Periksa kembali data reservasi." }, 400);
      throw error;
    }
    return json(data, 201);
  } catch (e) {
    return failure(e);
  }
}
