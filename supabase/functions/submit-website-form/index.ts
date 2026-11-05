// submit-website-form — records the homepage contact form, the hall booking
// enquiry (hall.html) and the table reservation request (reserve.html) in
// website_messages, then emails info@ and confirms to the guest (Resend; see
// _shared/form-email.ts).
//
// Until 2026-11-05 these forms went only to formsubmit.co, so when it went down
// every message was lost. The page now calls this first and shows its own
// thank-you; formsubmit.co is only the fallback when this function cannot be
// reached.
//
// Same contract as create-catering-lead: the browser generates one submissionId
// (UUID) per filled-in form and resends it on every retry; the UNIQUE constraint
// makes retries and double clicks harmless. {"dryRun": true} validates without
// writing or emailing. The _honey field answers ok and records nothing.
//
//   supabase functions deploy submit-website-form --no-verify-jwt
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatic), RESEND_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  background,
  confirmationEmail,
  deliver,
  detailsEmail,
  FROM_INFO,
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// What each form sends, and what the team and the guest see.
type Kind = "contact" | "hall" | "reservation";
const KINDS: Record<Kind, {
  fields: [key: string, label: string, max: number][];
  title: string;
  subject: (name: string, f: Record<string, string>) => string;
  confirmSubject: string;
  confirmBody: string;
}> = {
  contact: {
    fields: [],
    title: "New website message",
    subject: (name) => `New website message - ${name}`,
    confirmSubject: "We received your message - Shaahi Biryani",
    confirmBody: "Thank you for reaching out to Shaahi Biryani! We've received your message and will get back to you shortly.",
  },
  hall: {
    fields: [["eventDate", "Event date", 10], ["guestCount", "Guests", 6], ["eventType", "Event type", 60]],
    title: "New hall booking enquiry",
    subject: (name, f) =>
      `New hall booking enquiry - ${name}` + (f.guestCount ? ` - ${f.guestCount} guests` : "") +
      (f.eventDate ? ` - ${f.eventDate}` : ""),
    confirmSubject: "We received your hall booking enquiry - Shaahi Biryani",
    confirmBody: "Thank you for your hall booking enquiry at Shaahi Biryani! We've received your details, and our team will contact you within 24 hours.",
  },
  reservation: {
    fields: [["partySize", "Party size", 20], ["date", "Date", 10], ["time", "Time", 10]],
    title: "New table reservation request",
    subject: (name, f) =>
      `New reservation request - ${name}` + (f.partySize ? ` - ${f.partySize}` : "") +
      (f.date ? ` - ${f.date}` : "") + (f.time ? ` ${f.time}` : ""),
    confirmSubject: "We received your reservation request - Shaahi Biryani",
    confirmBody: "Thank you for your reservation request at Shaahi Biryani! We've received your details, and our team will call you shortly to confirm your table. Your table is not confirmed until we call you.",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);

    if (clean(body?.honey, 200)) return json({ ok: true });

    const kind = body?.kind as Kind;
    const spec = KINDS[kind];
    if (!spec) return json({ error: "Unknown form." }, 400);

    const name = clean(body?.name, 80);
    if (!name) return json({ error: "Name is required." }, 400);
    const submissionId = typeof body?.submissionId === "string" && UUID_RE.test(body.submissionId)
      ? body.submissionId.toLowerCase()
      : null;
    if (!submissionId) return json({ error: "submissionId is required." }, 400);

    // The contact form has one "Phone or Email" box: sort it into the right column.
    let phone = clean(body?.phone, 40);
    let email = clean(body?.email, 120);
    if (kind === "contact") {
      const either = clean(body?.phoneOrEmail, 120);
      if (!either) return json({ error: "Phone or email is required." }, 400);
      if (either.includes("@")) email = either;
      else phone = either;
    } else if (!phone || phone.replace(/\D/g, "").length < 7) {
      return json({ error: "Phone is required." }, 400);
    }
    const message = clean(body?.message, 4000);
    if (kind === "contact" && !message) return json({ error: "Message is required." }, 400);

    const fields: Record<string, string> = {};
    for (const [key, , max] of spec.fields) {
      const v = clean(body?.fields?.[key], max);
      if (v) fields[key] = v;
    }

    let attribution: unknown = null;
    try {
      const a = body?.attribution;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const s = JSON.stringify(a);
        if (s.length <= 2000) attribution = JSON.parse(s);
      }
    } catch { /* absent */ }

    const formPage = clean(body?.formPage, 120);
    const row = {
      submission_id: submissionId,
      kind,
      form_page: formPage && formPage.startsWith("/") ? formPage : null,
      name,
      phone,
      email,
      fields,
      message,
      attribution,
      request_context: cleanContext(body?.context),
      ip_hash: await ipHash(req),
    };

    if (body?.dryRun === true) return json({ ok: true, dryRun: true });

    const { data, error } = await supabase
      .from("website_messages")
      .upsert(row, { onConflict: "submission_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("website_messages insert failed:", error.message);
      return json({ error: "Could not record message." }, 500);
    }

    const duplicate = !data || data.length === 0;
    let id = data?.[0]?.id as number | undefined;
    if (duplicate) {
      const { data: prev } = await supabase.from("website_messages")
        .select("id, notified_at, notify_error").eq("submission_id", submissionId).maybeSingle();
      id = prev && !prev.notified_at && prev.notify_error && prev.notify_error !== "rate_limited"
        ? prev.id
        : undefined;
    }
    if (id) {
      const ctx = row.request_context ?? {};
      const source = [ctx.utm_source, ctx.utm_medium, ctx.utm_campaign].filter(Boolean).join(" / ") ||
        (ctx.referrer ? `referral: ${ctx.referrer}` : "");
      const team = detailsEmail(spec.title, [
        ["Name", name],
        ["Phone", phone],
        ["Email", email],
        ...spec.fields.map(([key, label]) => [label, fields[key]] as [string, string]),
        [kind === "contact" ? "Message" : "Details", message],
        ["Page", row.form_page],
        ["Came from", source],
        ["Message #", id],
      ]);
      const pending = background(
        deliver({
          supabase,
          table: "website_messages",
          id,
          ipHash: row.ip_hash,
          guestEmail: email,
          team: {
            from: FROM_INFO,
            to: teamAddress(),
            replyTo: validEmail(email) ? email : undefined,
            subject: `${spec.subject(name, fields)} (#${id})`,
            ...team,
          },
          confirm: validEmail(email)
            ? {
              from: FROM_INFO,
              to: email,
              replyTo: INFO_EMAIL,
              subject: spec.confirmSubject,
              ...confirmationEmail(name, spec.confirmBody),
            }
            : null,
        }).catch((e) => console.error("website form email failed:", e instanceof Error ? e.message : e)),
      );
      if (pending) await pending;
    }

    return json({ ok: true, duplicate });
  } catch (e) {
    console.error("submit-website-form error:", e instanceof Error ? e.message : e);
    return json({ error: "Bad request." }, 400);
  }
});
