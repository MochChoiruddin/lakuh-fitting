import { BookingValidationError, validateBooking } from "@/lib/booking";
import { body, failure, json, rateLimit, sameOrigin } from "@/lib/http";
import { service } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "booking", 15);
    // Accommodate 2,000 Unicode characters of event details while bounding bytes.
    const raw = await body(req, 16384);
    let b;
    try {
      b = validateBooking(raw);
    } catch (e) {
      return json(
        {
          error: (e as Error).message,
          fields: e instanceof BookingValidationError ? e.fields : undefined,
        },
        400,
      );
    }
    const { data, error } = await service().rpc("book_free_visit", {
      p_input: b,
    });
    if (error) {
      if (error.message.includes("VISIT_CLOSED"))
        return json(
          {
            error:
              "Free Visit tutup pada tanggal ini. Silakan pilih hari lain.",
          },
          409,
        );
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
      if (
        error.message.includes("INVALID_INPUT") ||
        error.code.startsWith("22")
      )
        return json({ error: "Periksa kembali data reservasi." }, 400);
      throw error;
    }
    return json(data, 201);
  } catch (e) {
    return failure(e);
  }
}
