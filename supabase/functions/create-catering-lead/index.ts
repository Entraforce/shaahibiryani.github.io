// create-catering-lead — writes catering_inquiries, the system of record for
// catering quote requests. (Function name kept: every page already calls it.)
//
// Every catering form (homepage #caterForm and every catering-<city>.html
// page) calls this BEFORE handing the same submission to formsubmit.co, so
// each request lands as a row in catering_inquiries with how the guest arrived.
// The formsubmit.co email to the team and the guest's auto-reply are
// unchanged; the email is now the notification, not the record.
//
// Idempotent: the browser generates one submissionId (UUID) per filled-in form
// and sends it on every retry, including a retry from the thank-you page if
// the network dropped mid-submit. catering_inquiries.submission_id is UNIQUE and
// the insert ignores duplicates, so a retry or double click never makes a
// second lead.
//
// The page never waits on this for more than a few seconds and submits to
// formsubmit.co whatever happens, so a failure here can never cost the guest
// their quote request.
//
// Deploy WITHOUT JWT verification (guests have no Supabase login), same
// security boundary as create-web-order. The DB write uses the service role;
// the browser only ever holds the public anon key:
//   supabase functions deploy create-catering-lead --no-verify-jwt
//
// Test without writing anything: send {"dryRun": true, ...} and the function
// validates the payload and answers {ok:true, dryRun:true} without an insert.
//
// Secrets used (set automatically for every function):
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

const MAX_BODY_BYTES = 20_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

function cleanInt(n: unknown, min: number, max: number): number | null {
  const v = typeof n === "string" && n.trim() !== "" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.trunc(v);
  return i >= min && i <= max ? i : null;
}

function cleanDate(s: unknown): string | null {
  const t = clean(s, 10);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return Number.isNaN(Date.parse(t)) ? null : t;
}

// How the visitor arrived on this visit, from the page URL and referrer at
// submit time. Only these keys, only short strings: no click ids (those are
// advertising identifiers and stay behind cookie consent, in attribution).
const CONTEXT_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer", "landing"];
function cleanContext(c: unknown): Record<string, string> | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const out: Record<string, string> = {};
  for (const k of CONTEXT_KEYS) {
    const v = clean((c as Record<string, unknown>)[k], 200);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);

    // Spam trap: the forms' hidden _honey field. Answer like a success so a
    // bot learns nothing, and record nothing.
    if (clean(body?.honey, 200)) return json({ ok: true });

    const name = clean(body?.name, 80);
    const phone = clean(body?.phone, 40);
    if (!name || !phone || phone.replace(/\D/g, "").length < 7) {
      return json({ error: "Name and phone are required." }, 400);
    }
    const submissionId = typeof body?.submissionId === "string" && UUID_RE.test(body.submissionId)
      ? body.submissionId.toLowerCase()
      : null;
    if (!submissionId) return json({ error: "submissionId is required." }, 400);

    // Same shape and same size cap as create-web-order's attribution capture.
    let attribution: unknown = null;
    try {
      const a = body?.attribution;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const s = JSON.stringify(a);
        if (s.length <= 2000) attribution = JSON.parse(s);
      }
    } catch { /* unparseable attribution is simply absent */ }

    const formPage = clean(body?.formPage, 120);
    const row = {
      submission_id: submissionId,
      city: clean(body?.city, 60),
      name,
      phone,
      email: clean(body?.email, 120),
      event_date: cleanDate(body?.eventDate),
      guest_count: cleanInt(body?.guestCount, 0, 100_000),
      event_type: clean(body?.eventType, 60),
      details: clean(body?.details, 4000),
      attribution,
      form_page: formPage && formPage.startsWith("/") ? formPage : null,
      request_context: cleanContext(body?.context),
    };

    if (body?.dryRun === true) return json({ ok: true, dryRun: true });

    const { data, error } = await supabase
      .from("catering_inquiries")
      .upsert(row, { onConflict: "submission_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("catering_inquiries insert failed:", error.message);
      return json({ error: "Could not record lead." }, 500);
    }

    // An ignored duplicate returns no row: the lead is already recorded.
    return json({ ok: true, duplicate: !data || data.length === 0 });
  } catch (e) {
    console.error("create-catering-lead error:", e instanceof Error ? e.message : e);
    return json({ error: "Bad request." }, 400);
  }
});
