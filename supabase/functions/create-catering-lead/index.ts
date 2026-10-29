// create-catering-lead — structured, attribution-tagged record of a catering
// quote request, written ALONGSIDE the existing formsubmit.co email (not
// instead of it).
//
// The catering quote form on every catering-<city>.html page still posts
// straight to formsubmit.co exactly as before — that flow is untouched and
// is what staff actually see today. This function exists only so the SAME
// submission also lands a row here with its ad-click id attached, because an
// email has no queryable "list every lead the ad produced" — this table
// does. When a deal closes, staff mark the row 'won' with the real value
// (Supabase Table Editor for now), and scripts/export-offline-conversions.mjs
// turns 'won' rows into a Google Ads offline-conversion-import CSV.
//
// Called with fetch(..., {keepalive:true}) and never blocks or
// preventDefault()s the real form submit — if this fails, the guest still
// gets their quote request through, and the only loss is attribution.
//
// Deploy WITHOUT JWT verification (guests have no Supabase login), same
// security boundary as create-web-order — the DB write uses the service role:
//   supabase functions deploy create-catering-lead --no-verify-jwt
//
// Secrets used (all already set for the other functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

function cleanInt(n: unknown, min: number, max: number): number | null {
  const v = typeof n === "string" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.trunc(v);
  return i >= min && i <= max ? i : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    const city = clean(body?.city, 60);
    const name = clean(body?.name, 80);
    const phone = clean(body?.phone, 40);
    if (!city || !name || !phone) {
      return json({ error: "City, name and phone are required." }, 400);
    }

    const email = clean(body?.email, 120);
    const eventDate = clean(body?.eventDate, 20); // "YYYY-MM-DD" from an <input type=date>; Postgres validates the shape
    const guestCount = cleanInt(body?.guestCount, 0, 100_000);
    const eventType = clean(body?.eventType, 60);
    const details = clean(body?.details, 4000);

    // Same shape and same size cap as create-web-order's attribution capture.
    let attribution: unknown = null;
    try {
      const a = body?.attribution;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const s = JSON.stringify(a);
        if (s.length <= 2000) attribution = JSON.parse(s);
      }
    } catch { /* unparseable attribution is simply absent */ }

    const { error } = await supabase.from("catering_leads").insert({
      city,
      name,
      phone,
      email,
      event_date: eventDate,
      guest_count: guestCount,
      event_type: eventType,
      details,
      attribution,
    });
    if (error) {
      console.error("catering_leads insert failed:", error.message);
      return json({ error: "Could not record lead." }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("create-catering-lead error:", e);
    return json({ error: "Bad request." }, 400);
  }
});
