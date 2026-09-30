import { admin } from "@/lib/supabase";
import { body, failure, json, sameOrigin } from "@/lib/http";
import { manualReminderUrl } from "@/lib/manual-reminder";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = await admin(),
      input = await body(req);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.id !== "string" ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input.id)
    )
      return json({ error: "Reservasi tidak valid." }, 400);
    const { data, error } = await db.rpc("open_manual_reminder", {
      p_id: input.id,
    });
    if (error)
      return json(
        { error: "Reminder tidak dapat dibuka untuk reservasi ini." },
        error.code === "42501" ? 403 : 409,
      );
    const url = manualReminderUrl(data.phone, data.appointment_at, data.status);
    if (!url)
      return json({ error: "Nomor atau jadwal reservasi tidak valid." }, 409);
    return json({ url, event: "reminder_opened_by_admin" });
  } catch (e) {
    return failure(e);
  }
}
