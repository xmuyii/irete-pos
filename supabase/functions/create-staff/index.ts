// Deploy: supabase functions deploy create-staff   (JWT verification stays ON)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const LIMIT = 15;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return out({ error: "Not signed in" }, 401);

  // caller must be a business owner (profile exists, not an attendant) with Premium
  const [{ data: prof }, { data: me }, { data: sub }] = await Promise.all([
    db.from("profiles").select("trial_ends").eq("user_id", user.id).maybeSingle(),
    db.from("staff").select("user_id").eq("user_id", user.id).maybeSingle(),
    db.from("subscriptions").select("status,expires_at,plan").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!prof || me) return out({ error: "Only the business owner can manage staff" }, 403);
  const premium = new Date(prof.trial_ends) > new Date() || (sub?.status === "active" && sub.plan === "business" && new Date(sub.expires_at) > new Date());
  if (!premium) return out({ error: "Staff accounts need the Business plan" }, 402);

  const b = await req.json().catch(() => ({}));
  if (b.action === "create") {
    const name = String(b.name ?? "").trim(), email = String(b.email ?? "").trim().toLowerCase(), password = String(b.password ?? "");
    if (!name || !email || password.length < 6) return out({ error: "Name, email and a 6+ character password are required" }, 400);
    const { count } = await db.from("staff").select("user_id", { count: "exact", head: true }).eq("owner_id", user.id).eq("active", true);
    if ((count ?? 0) >= LIMIT) return out({ error: `Limit of ${LIMIT} attendants reached` }, 400);
    const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { staff_of: user.id, name } });
    if (error || !u.user) return out({ error: error?.message ?? "Could not create account" }, 400);
    await db.from("staff").insert({ user_id: u.user.id, owner_id: user.id, name, email });
    return out({ ok: true });
  }
  if (b.action === "remove") {
    const { data: s } = await db.from("staff").select("user_id").eq("user_id", b.user_id).eq("owner_id", user.id).maybeSingle();
    if (!s) return out({ error: "Attendant not found" }, 404);
    await db.from("staff").update({ active: false }).eq("user_id", s.user_id);
    await db.auth.admin.updateUserById(s.user_id, { ban_duration: "876000h" });
    return out({ ok: true });
  }
  return out({ error: "Unknown action" }, 400);
});