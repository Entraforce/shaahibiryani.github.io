// Transactional delivery messages (order updates — NOT marketing).
//
// Rules this file enforces:
//  • One message per order per kind (unique row), so Uber's webhook retries and
//    replays can never text a customer twice.
//  • A number that replied STOP (marketing_consent source 'reply_stop',
//    granted=false) is never texted, transactional or not.
//  • Ordering delivery never adds anyone to a marketing list: this module only
//    READS marketing_consent, it never writes it.
//  • NOTIFY_TRANSPORT picks what happens to a message:
//      off (default) → recorded as suppressed/transport_disabled, not sent
//      capture       → recorded as 'captured' (staging: full workflow, no SMS)
//      twilio        → sent through Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//                      and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)
//  • A failed send is retried by retryFailedNotifications() at most
//    MAX_NOTIFY_ATTEMPTS times; STOP is re-checked before every attempt.
// deno-lint-ignore-file
export type NotifyKind = "confirmed" | "courier_booked" | "picked_up" | "delivered" | "problem" | "refunded";
export const MAX_NOTIFY_ATTEMPTS = 3;
const TRANSPORT = String(Deno.env.get("NOTIFY_TRANSPORT") ?? "off").toLowerCase();

export function trackingLink(order: { id: string; tracking_token?: string | null }): string | null {
  const site = Deno.env.get("SITE_URL") ?? "https://shaahibiryanidfw.com";
  return order.tracking_token ? `${site}/track.html?o=${order.id}&t=${order.tracking_token}` : null;
}

function body(kind: NotifyKind, o: any): string {
  const n = String(o.id).slice(-6).toUpperCase();
  const link = trackingLink(o);
  const track = link ? ` Track: ${link}` : "";
  const stop = " Reply STOP to stop order texts.";
  switch (kind) {
    case "confirmed": return `Shaahi Biryani: order #${n} received. We'll text when your Uber courier is on the way.${track}${stop}`;
    case "courier_booked": return `Shaahi Biryani: a courier is booked for order #${n}.${track}${stop}`;
    case "picked_up": return `Shaahi Biryani: your order #${n} is on its way.${track}${stop}`;
    case "delivered": return `Shaahi Biryani: order #${n} was delivered. Enjoy!${stop}`;
    case "problem": return `Shaahi Biryani: there's a problem delivering order #${n}. We're on it and will call you at this number. (469) 960-3300${stop}`;
    case "refunded": return `Shaahi Biryani: sorry, we couldn't take delivery order #${n}. Your payment has been refunded in full; it can take 5-10 days to show. (469) 960-3300${stop}`;
  }
}

const mask = (p: string | null) => (p ? p.replace(/\d(?=\d{4})/g, "•") : null);

// marketing_consent stores bare 10-digit numbers (record_marketing_consent).
async function repliedStop(supabase: any, phone: string): Promise<boolean> {
  const digits = String(phone).replace(/\D/g, "").slice(-10);
  const { data: stop } = await supabase.from("marketing_consent")
    .select("granted, source, created_at").eq("phone", digits)
    .order("created_at", { ascending: false }).limit(1);
  return !!(stop?.[0] && stop[0].source === "reply_stop" && stop[0].granted === false);
}

/** One Twilio send. Returns the message SID; throws with a short reason. */
export async function twilioSend(to: string, text: string, env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch): Promise<string> {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN");
  const svc = env("TWILIO_MESSAGING_SERVICE_SID"), from = env("TWILIO_FROM");
  if (!sid || !token || (!svc && !from)) throw new Error("twilio_not_configured");
  const digits = String(to).replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) throw new Error("bad_phone");
  const form = new URLSearchParams({ To: `+1${digits}`, Body: text, ...(svc ? { MessagingServiceSid: svc } : { From: String(from) }) });
  const res = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`twilio_${res.status}_${out?.code ?? "error"}`);
  return String(out?.sid ?? "");
}

/** Decide and perform delivery of one recorded message. */
async function deliver(supabase: any, phone: string | null, text: string): Promise<{ status: string; reason: string | null; providerId?: string; error?: string }> {
  if (!phone) return { status: "suppressed", reason: "no_phone" };
  if (await repliedStop(supabase, phone)) return { status: "suppressed", reason: "replied_stop" };
  if (TRANSPORT === "capture") return { status: "captured", reason: null };
  if (TRANSPORT !== "twilio") return { status: "suppressed", reason: "transport_disabled" };
  try {
    return { status: "sent", reason: null, providerId: await twilioSend(phone, text, (k) => Deno.env.get(k)) };
  } catch (e) {
    return { status: "failed", reason: null, error: (e as Error).message.slice(0, 120) };
  }
}

/** Record and send one message, once per order per kind. Never throws. */
export async function notifyDelivery(supabase: any, order: any, kind: NotifyKind): Promise<string> {
  try {
    if (order?.fulfillment !== "delivery") return "skip:not_delivery";
    const phone = order.guest_phone ?? null;
    const text = body(kind, order);
    // Claim the (order, kind) slot first: a duplicate event never sends twice.
    const { data: row, error } = await supabase.from("delivery_notifications").insert({
      order_id: order.id, kind, channel: "sms", to_masked: mask(phone), body: text, status: "queued",
    }).select("id").single();
    if (error?.code === "23505") return "duplicate";
    if (error || !row) return `error:${error?.code ?? "insert"}`;
    const d = await deliver(supabase, phone, text);
    await supabase.from("delivery_notifications").update({
      status: d.status, suppressed_reason: d.reason, attempts: 1, last_error: d.error ?? null,
      provider_id: d.providerId ?? null, sent_at: d.status === "sent" || d.status === "captured" ? new Date().toISOString() : null,
    }).eq("id", row.id);
    return d.reason ? `${d.status}:${d.reason}` : d.status;
  } catch (e) {
    return `error:${(e as Error).message}`;
  }
}

/** Retry failed sends (bounded). Called by the every-minute dispatcher. */
export async function retryFailedNotifications(supabase: any): Promise<number> {
  const { data: rows } = await supabase.from("delivery_notifications")
    .select("id, order_id, body, attempts").eq("status", "failed").lt("attempts", MAX_NOTIFY_ATTEMPTS)
    .lt("created_at", new Date(Date.now() - 60_000).toISOString()).limit(20);
  let n = 0;
  for (const r of rows ?? []) {
    // Claim this attempt so two runs never send the same retry.
    const { data: claimed } = await supabase.from("delivery_notifications")
      .update({ status: "queued", attempts: r.attempts + 1 }).eq("id", r.id).eq("status", "failed").eq("attempts", r.attempts).select("id");
    if (!claimed?.length) continue;
    const { data: o } = await supabase.from("orders").select("guest_phone").eq("id", r.order_id).maybeSingle();
    const d = await deliver(supabase, o?.guest_phone ?? null, r.body);
    await supabase.from("delivery_notifications").update({
      status: d.status, suppressed_reason: d.reason, last_error: d.error ?? null, provider_id: d.providerId ?? null,
      sent_at: d.status === "sent" || d.status === "captured" ? new Date().toISOString() : null,
    }).eq("id", r.id);
    n++;
  }
  return n;
}
