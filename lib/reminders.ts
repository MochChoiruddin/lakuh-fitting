import "server-only";
import postgres from "postgres";
import { service } from "./supabase";
import { sendReminder, whatsappConfigured } from "./whatsapp";
export async function runReminders() {
  // Missing provider configuration must leave jobs scheduled and attempts untouched.
  if (!whatsappConfigured() || !process.env.DATABASE_URL)
    return { configured: false, processed: 0 };
  const db = postgres(process.env.DATABASE_URL, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
  let processed = 0;
  try {
    const { data: jobs, error } = await service().rpc("claim_reminders", {
      p_limit: 5,
    });
    if (error) throw new Error("SERVICE_UNAVAILABLE");
    for (const job of jobs ?? []) {
      await db.begin(async (tx) => {
        // Same lock order as change_status: reservation then reminder.
        // A cancellation committed before this lock prevents delivery.
        const [r] =
          await tx`select * from public.reservations where id = ${job.reservation_id} for update`;
        const [j] =
          await tx`select * from public.reminder_jobs where id = ${job.id} for update`;
        if (
          !r ||
          !j ||
          j.status !== "processing" ||
          j.lock_token !== job.lock_token
        )
          return;
        if (
          !["pending", "confirmed"].includes(r.status) ||
          new Date(r.appointment_at) <= new Date()
        ) {
          await tx`update public.reminder_jobs set status = 'cancelled', lock_token = null, safe_error = 'RESERVATION_INACTIVE_OR_EXPIRED' where id = ${j.id}`;
          return;
        }
        const result = await sendReminder(
          r.phone,
          r.name,
          new Date(r.appointment_at),
        );
        if (result.kind === "sent") {
          await tx`update public.reminder_jobs set status = 'sent', provider_message_id = ${result.id}, sent_at = now(), safe_error = null, lock_token = null where id = ${j.id}`;
        } else if (result.kind === "retry" && j.attempt_count < 3) {
          const delay = j.attempt_count === 1 ? 60 : 300;
          await tx`update public.reminder_jobs set status = 'scheduled', next_attempt_at = now() + ${delay} * interval '1 second', safe_error = ${result.error}, lock_token = null where id = ${j.id}`;
        } else {
          await tx`update public.reminder_jobs set status = 'failed', failed_at = now(), safe_error = ${result.error}, lock_token = null where id = ${j.id}`;
        }
        processed++;
      });
    }
    return { configured: true, processed };
  } finally {
    await db.end({ timeout: 5 });
  }
}
