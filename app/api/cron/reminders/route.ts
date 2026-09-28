import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/reminders";
import { failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return json({ error: "Unauthorized" }, 401);
  try {
    const result = await runReminders();
    return json(result, result.configured ? 200 : 503);
  } catch (e) {
    return failure(e);
  }
}
