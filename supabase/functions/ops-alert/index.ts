// ops-alert — delivers operations alerts from the office PC watchdog.
//
// The watchdog (ARM repo ops/watchdog.ps1) decides WHEN to alert: on a state
// change after its failure threshold, on recovery, and as a reminder while a
// critical problem lasts. This function only delivers:
//
//   critical down / reminder  -> ntfy push (high priority) + email
//   critical up (recovered)   -> ntfy push + email
//   warning (any state)       -> email only
//
// Email goes to support@ (owner's rule: support@ = tech) from ops@ via Resend, so
// the Resend key never leaves Supabase. Push goes to the ntfy topic in NTFY_TOPIC
// (the owner's phone subscribes to it). Alerts carry no customer data.
//
// Abuse/spam guard: at most 30 delivered alerts per hour; beyond that they are
// logged in office_alerts as suppressed.
//
// Auth: x-ops-key must equal OPS_ALERT_SECRET (the watchdog holds it in an
// admin-only file). Deploy with --no-verify-jwt.
//
// Secrets: OPS_ALERT_SECRET, NTFY_TOPIC, RESEND_API_KEY; optional OPS_EMAIL_TO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/form-email.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MAX_PER_HOUR = 30;
const FROM = "Shaahi Ops <ops@shaahibiryanidfw.com>";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "";
}

async function push(topic: string, title: string, message: string, critical: boolean, recovered: boolean) {
  try {
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        Title: title.replace(/[^\x20-\x7E]/g, ""),
        Priority: recovered ? "3" : critical ? "5" : "3",
        Tags: recovered ? "white_check_mark" : critical ? "rotating_light" : "warning",
      },
      body: message,
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("OPS_ALERT_SECRET");
  if (!secret || req.headers.get("x-ops-key") !== secret) return new Response("Not found", { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const severity = ["critical", "warning", "info"].includes(String(body.severity)) ? String(body.severity) : "warning";
  const state = ["down", "up", "reminder"].includes(String(body.state)) ? String(body.state) : "down";
  const check = clean(body.check, 60) || "unknown";
  const source = clean(body.source, 60) || "office-pc";
  const message = clean(body.message, 500);
  const test = body.test === true;

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase.from("office_alerts").select("id", { count: "exact", head: true })
    .gte("created_at", since).is("suppressed", null);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    await supabase.from("office_alerts").insert({ source, check_name: check, severity, state, message, suppressed: "rate_cap" });
    return json({ ok: true, suppressed: "rate_cap" });
  }

  const recovered = state === "up";
  const critical = severity === "critical";
  const label = recovered ? "RECOVERED" : state === "reminder" ? "STILL DOWN" : critical ? "CRITICAL" : "WARNING";
  const title = `${test ? "[TEST] " : ""}${label}: ${check} (${source})`;
  const when = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT";

  // Push: critical problems and their recoveries only.
  let pushed = false;
  const topic = Deno.env.get("NTFY_TOPIC");
  if (topic && critical) pushed = await push(topic, title, `${message}\n${when}`, critical, recovered);

  const text = `${title}\n\n${message}\n\nTime: ${when}\nSeverity: ${severity}\nState: ${state}\n\n` +
    `Sent by the office PC watchdog (C:\\RestaurantManager\\ops\\watchdog.ps1). Log: C:\\RestaurantManager\\logs\\watchdog.log`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    `<h2 style="font-size:17px;color:${recovered ? "#1a7f37" : critical ? "#b8322a" : "#9a6700"}">${escapeHtml(title)}</h2>` +
    `<p>${escapeHtml(message)}</p><p style="color:#555">${escapeHtml(when)} · severity ${severity} · ${state}</p>` +
    `<p style="color:#888;font-size:12px">Office PC watchdog · log C:\\RestaurantManager\\logs\\watchdog.log</p></div>`;
  const err = await sendEmail({
    from: FROM,
    to: Deno.env.get("OPS_EMAIL_TO") || "support@shaahibiryanidfw.com",
    subject: title,
    text,
    html,
  });

  await supabase.from("office_alerts").insert({
    source, check_name: check, severity, state, message, pushed, emailed: !err,
  });
  return json({ ok: true, pushed, emailed: !err, emailError: err });
});
