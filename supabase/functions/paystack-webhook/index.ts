// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx PRICE_KOBO_PREMIUM=300000 PRICE_KOBO_BUSINESS=2000000
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const enc = new TextEncoder();
async function sign(secret: string, body: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(body));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req) => {
  const body = await req.text();
  if ((await sign(Deno.env.get("PAYSTACK_SECRET_KEY")!, body)) !== req.headers.get("x-paystack-signature"))
    return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(body);
  if (ev.event === "charge.success") {
    const d = ev.data, uid = d?.metadata?.user_id;
    const plan = d?.metadata?.plan === "business" ? "business" : "premium";
    const months = Math.max(1, Number(d?.metadata?.months ?? 1));
    const min = Number(Deno.env.get(plan === "business" ? "PRICE_KOBO_BUSINESS" : "PRICE_KOBO_PREMIUM") ?? 0) * months * 0.8; // allows the multi-month discount
    if (uid && d.currency === "NGN" && d.amount >= min) {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: cur } = await db.from("subscriptions").select("expires_at,paystack_ref").eq("user_id", uid).maybeSingle();
      if (cur?.paystack_ref !== d.reference) { // idempotent on retries
        const base = Math.max(Date.now(), cur?.expires_at ? new Date(cur.expires_at).getTime() : 0);
        await db.from("subscriptions").upsert({
          user_id: uid, status: "active", plan, paystack_ref: d.reference,
          expires_at: new Date(base + 30 * months * 864e5).toISOString(), updated_at: new Date().toISOString(),
        });
      }
    }
  }
  return new Response("ok");
});