import "server-only";
import { createHash } from "node:crypto";
import { service } from "./supabase";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new Error("FORBIDDEN");
}
export async function body(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new Error("INVALID_BODY");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error("INVALID_BODY");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_BODY");
  }
}
export async function rateLimit(_req: Request, scope: string, limit: number) {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new Error("SERVICE_UNAVAILABLE");
  // Shared boutique-wide limit cannot be bypassed with forged proxy headers.
  const key = createHash("sha256").update(`${salt}:${scope}`).digest("hex");
  const { data, error } = await service().rpc("take_rate_limit", {
    p_key: key,
    p_limit: limit,
  });
  if (error) throw new Error("SERVICE_UNAVAILABLE");
  if (!data) throw new Error("RATE_LIMIT");
}
export function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const codes: Record<string, [number, string]> = {
    UNAUTHORIZED: [401, "Silakan masuk kembali."],
    FORBIDDEN: [403, "Akses ditolak."],
    RATE_LIMIT: [429, "Terlalu banyak permintaan. Coba beberapa menit lagi."],
    INVALID_BODY: [400, "Data tidak valid."],
  };
  const [status, message] = codes[code] ?? [
    503,
    "Layanan belum tersedia. Silakan coba kembali nanti.",
  ];
  return json({ error: message }, status);
}
