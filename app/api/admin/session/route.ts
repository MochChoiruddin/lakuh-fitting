import { body, failure, json, rateLimit, sameOrigin } from "@/lib/http";
import { session } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "login", 10);
    const b = await body(req);
    if (typeof b.email !== "string" || typeof b.password !== "string")
      return json({ error: "Email dan kata sandi wajib diisi." }, 400);
    const db = await session();
    const { data, error } = await db.auth.signInWithPassword({
      email: b.email,
      password: b.password,
    });
    if (error || !data.user)
      return json({ error: "Email atau kata sandi tidak sesuai." }, 401);
    const { data: membership } = await db
      .from("admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!membership) {
      await db.auth.signOut();
      return json({ error: "Akses admin tidak tersedia." }, 403);
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    await (await session()).auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
