// Email for the website forms (catering quotes, contact, hall booking,
// reservations), sent through Resend from @shaahibiryanidfw.com.
//
// Two emails per submission:
//   1. the team notification to info@ (owner's rule, 2026-11-05: info@ = customer
//      queries and catering), with reply-to set to the guest so the team can just
//      hit Reply;
//   2. a fixed confirmation to the guest, reply-to info@.
//
// The endpoints are public, so a stranger could use them to make us email any
// address. Guards: the guest confirmation is fixed text plus a sanitised first
// name (nothing else the sender typed); at most 10 submissions per IP per hour get
// any email at all (the rest are still recorded); and an address that already got
// a confirmation in the last 24 hours does not get another.
//
// Secrets: RESEND_API_KEY (Resend, sending-only key for shaahibiryanidfw.com).
// Optional FORM_EMAIL_TO overrides the team address (e.g. on staging).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const INFO_EMAIL = "info@shaahibiryanidfw.com";
export const FROM_CATERING = "Shaahi Biryani Catering <catering@shaahibiryanidfw.com>";
export const FROM_INFO = "Shaahi Biryani <info@shaahibiryanidfw.com>";
export const PHONE_DISPLAY = "(469) 960-3300";

const MAX_PER_IP_PER_HOUR = 10;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

export function validEmail(s: string | null): s is string {
  return !!s && s.length <= 120 && EMAIL_RE.test(s);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

// "Ayesha Khan" -> "Ayesha"; anything that is not a plain name -> "there".
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{0,29}$/u.test(first) ? first : "there";
}

// HMAC of the client IP with a server-side key: enough to count submissions from
// one address, without storing the address.
export async function ipHash(req: Request): Promise<string | null> {
  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return null;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Submissions from this IP in the last hour, across both form tables.
export async function recentFromIp(supabase: SupabaseClient, hash: string | null): Promise<number> {
  if (!hash) return 0;
  const since = new Date(Date.now() - 3600_000).toISOString();
  let n = 0;
  for (const table of ["catering_inquiries", "website_messages"]) {
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true })
      .eq("ip_hash", hash).gte("created_at", since);
    n += count ?? 0;
  }
  return n;
}

export function overIpLimit(count: number): boolean {
  return count > MAX_PER_IP_PER_HOUR;
}

// Did this address already get a confirmation in the last 24 hours (any form)?
export async function confirmedRecently(
  supabase: SupabaseClient, email: string, excludeTable: string, excludeId: number,
): Promise<boolean> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  for (const table of ["catering_inquiries", "website_messages"]) {
    let q = supabase.from(table).select("id", { count: "exact", head: true })
      .ilike("email", email.replace(/[%_\\]/g, "\\$&")).not("notified_at", "is", null).gte("created_at", since);
    if (table === excludeTable) q = q.neq("id", excludeId);
    const { count } = await q;
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

export type Email = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

// Returns null when sent, else a short error code for notify_error.
export async function sendEmail(e: Email): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "no_api_key";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: e.from,
        to: [e.to],
        reply_to: e.replyTo ? [e.replyTo] : undefined,
        subject: e.subject,
        text: e.text,
        html: e.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return null;
    console.error("resend failed:", r.status, (await r.text()).slice(0, 300));
    return `resend_${r.status}`;
  } catch (err) {
    console.error("resend error:", err instanceof Error ? err.message : err);
    return "resend_network";
  }
}

export function teamAddress(): string {
  return Deno.env.get("FORM_EMAIL_TO") || INFO_EMAIL;
}

// The team notification body: a label/value table, skipping empty answers.
export function detailsEmail(title: string, rows: [string, string | number | null | undefined][]) {
  const kept = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v)] as const);
  const text = `${title}\n\n` + kept.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">` +
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    kept.map(([k, v]) =>
      `<tr><td style="border:1px solid #ddd;background:#f6f6f6;font-weight:bold;vertical-align:top">${escapeHtml(k)}</td>` +
      `<td style="border:1px solid #ddd;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
    ).join("") +
    `</table></div>`;
  return { text, html };
}

// The guest confirmation: fixed copy, the only variable part is the first name.
export function confirmationEmail(name: string, body: string) {
  const hi = `Hi ${firstName(name)},`;
  const sign = "Shaahi Biryani\n3421 E Renner Rd, STE 110, Plano, TX 75074\n" + PHONE_DISPLAY;
  const text = `${hi}\n\n${body}\n\nIf you need anything sooner, call us at ${PHONE_DISPLAY} or just reply to this email.\n\n${sign}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.5">` +
    `<p>${escapeHtml(hi)}</p><p>${escapeHtml(body)}</p>` +
    `<p>If you need anything sooner, call us at <a href="tel:+14699603300">${PHONE_DISPLAY}</a> or just reply to this email.</p>` +
    `<p style="color:#555">${escapeHtml(sign).replace(/\n/g, "<br>")}</p></div>`;
  return { text, html };
}

// Run work after the response is sent when the runtime allows it, so the guest's
// browser is not kept waiting on Resend.
export function background(p: Promise<unknown>): Promise<unknown> | null {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") {
    rt.waitUntil(p);
    return null;
  }
  return p;
}

// Sends the team notification (and the guest confirmation, when allowed) for one
// recorded submission, and records the outcome on its row.
export async function deliver(opts: {
  supabase: SupabaseClient;
  table: "catering_inquiries" | "website_messages";
  id: number;
  ipHash: string | null;
  guestEmail: string | null;
  team: Email;
  confirm: Email | null;
}): Promise<void> {
  const { supabase, table, id } = opts;
  const mark = (fields: Record<string, unknown>) => supabase.from(table).update(fields).eq("id", id);
  if (overIpLimit(await recentFromIp(supabase, opts.ipHash))) {
    await mark({ notify_error: "rate_limited" });
    return;
  }
  const err = await sendEmail(opts.team);
  await mark(err ? { notify_error: err } : { notified_at: new Date().toISOString(), notify_error: null });
  if (err || !opts.confirm || !validEmail(opts.guestEmail)) return;
  if (await confirmedRecently(supabase, opts.guestEmail, table, id)) return;
  const cerr = await sendEmail(opts.confirm);
  if (cerr) console.error(`${table} ${id}: guest confirmation failed (${cerr})`);
}
