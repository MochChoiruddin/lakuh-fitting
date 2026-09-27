import { admin, configured } from "@/lib/supabase";
import AdminPanel from "./panel";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  let authorized = false;
  if (configured()) {
    try {
      await admin();
      authorized = true;
    } catch {
      /* Login shell contains no personal data. */
    }
  }
  return (
    <main className="admin">
      <a href="/reservasi" className="eyebrow">
        LAKUH / FITTING
      </a>
      <h1 className="text-4xl mt-8 mb-3">Ruang admin</h1>
      <p className="muted">Kelola kunjungan dan pengingat appointment.</p>
      <AdminPanel authorized={authorized} />
    </main>
  );
}
