// create-catering-lead — writes catering_inquiries, the system of record for
// catering quote requests. (Function name kept: every page already calls it.)
//
// Every catering form (homepage #caterForm and every catering-<city>.html
// page) calls this, so each request lands as a row in catering_inquiries with
// how the guest arrived. Then, after the response, it emails the request to
// info@ from catering@ and sends the guest a confirmation (Resend; see
// _shared/form-email.ts). formsubmit.co is only the page's fallback when this
// function cannot be reached (it was down on 2026-11-05).
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
// and RESEND_API_KEY (see _shared/form-email.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  background,
  confirmationEmail,
  deliver,
  detailsEmail,
  FROM_CATERING,
  INFO_EMAIL,
  ipHash,
  teamAddress,
  validEmail,
} from "../_shared/form-email.ts";

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
      ip_hash: await ipHash(req),
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

    // An ignored duplicate returns no row: the lead is already recorded. Its
    // email is retried only if the first attempt failed (not if rate-limited).
    const duplicate = !data || data.length === 0;
    let id = data?.[0]?.id as number | undefined;
    if (duplicate) {
      const { data: prev } = await supabase.from("catering_inquiries")
        .select("id, notified_at, notify_error").eq("submission_id", submissionId).maybeSingle();
      id = prev && !prev.notified_at && prev.notify_error && prev.notify_error !== "rate_limited"
        ? prev.id
        : undefined;
    }
    if (id) {
      const pending = background(
        deliver({
          supabase,
          table: "catering_inquiries",
          id,
          ipHash: row.ip_hash,
          guestEmail: row.email,
          team: { from: FROM_CATERING, to: teamAddress(), ...cateringTeamEmail(row, id) },
          confirm: validEmail(row.email)
            ? {
              from: FROM_CATERING,
              to: row.email,
              replyTo: INFO_EMAIL,
              subject: "We received your catering request - Shaahi Biryani",
              ...confirmationEmail(
                name,
                "Thank you for your catering quote request! We've received your event details, and our team will follow up within 24 hours with a custom menu and pricing.",
              ),
            }
            : null,
        }).catch((e) => console.error("catering email failed:", e instanceof Error ? e.message : e)),
      );
      if (pending) await pending;
    }

    return json({ ok: true, duplicate });
  } catch (e) {
    console.error("create-catering-lead error:", e instanceof Error ? e.message : e);
    return json({ error: "Bad request." }, 400);
  }
});

// The request as the team sees it in info@. Reply goes straight to the guest.
function cateringTeamEmail(
  row: {
    city: string | null; name: string; phone: string; email: string | null; event_date: string | null;
    guest_count: number | null; event_type: string | null; details: string | null; form_page: string | null;
    request_context: Record<string, string> | null; attribution: unknown;
  },
  id: number,
) {
  const where = row.city ?? (row.form_page === "/wedding-catering" ? "Wedding" : "Homepage");
  const subject = `New catering request #${id} - ${row.name}` +
    (row.guest_count ? ` - ${row.guest_count} guests` : "") + (row.event_date ? ` - ${row.event_date}` : "");
  const ctx = row.request_context ?? {};
  // deno-lint-ignore no-explicit-any
  const first = (row.attribution as any)?.first;
  const source = [ctx.utm_source, ctx.utm_medium, ctx.utm_campaign].filter(Boolean).join(" / ") ||
    (ctx.referrer ? `referral: ${ctx.referrer}` : first?.source ? `${first.source} / ${first.medium ?? ""}` : "");
  return {
    replyTo: validEmail(row.email) ? row.email : undefined,
    subject,
    ...detailsEmail(`New catering quote request (${where})`, [
      ["Name", row.name],
      ["Phone", row.phone],
      ["Email", row.email],
      ["Event date", row.event_date],
      ["Guests", row.guest_count],
      ["Event type", row.event_type],
      ["Details", row.details],
      ["Page", row.form_page],
      ["Came from", source],
      ["Request #", id],
    ]),
  };
}
