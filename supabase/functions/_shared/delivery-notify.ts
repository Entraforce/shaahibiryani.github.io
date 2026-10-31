// Transactional delivery messages (order updates — NOT marketing).
//
// Rules this file enforces:
//  • One message per order per kind (unique row), so Uber's webhook retries and
//    replays can never text a customer twice.
//  • A number that replied STOP (marketing_consent source 'reply_stop',
//    granted=false) is never texted, transactional or not.
//  • Ordering delivery never adds anyone to a marketing list: this module only
//    READS marketing_consent, it never writes it.
//  • No approved SMS/email provider exists yet, so every message is recorded
//    with status 'suppressed' / reason 'transport_disabled' and NOT sent. The
//    owner picks the provider; then send() is the one place to wire it.
// deno-lint-ignore-file
export type NotifyKind = "confirmed" | "courier_booked" | "picked_up" | "delivered" | "problem";

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
  }
}

const mask = (p: string | null) => (p ? p.replace(/\d(?=\d{4})/g, "•") : null);

/** Record (and, once a provider is approved, send) one message. Never throws. */
export async function notifyDelivery(supabase: any, order: any, kind: NotifyKind): Promise<string> {
  try {
    if (order?.fulfillment !== "delivery") return "skip:not_delivery";
    const phone = order.guest_phone ?? null;
    let status = "suppressed", reason = "transport_disabled";
    if (phone) {
      // marketing_consent stores bare 10-digit numbers (record_marketing_consent).
      const digits = String(phone).replace(/\D/g, "").slice(-10);
      const { data: stop } = await supabase.from("marketing_consent")
        .select("granted, source, created_at").eq("phone", digits)
        .order("created_at", { ascending: false }).limit(1);
      if (stop?.[0] && stop[0].source === "reply_stop" && stop[0].granted === false) reason = "replied_stop";
    } else reason = "no_phone";
    const { error } = await supabase.from("delivery_notifications").insert({
      order_id: order.id, kind, channel: "sms", to_masked: mask(phone), body: body(kind, order), status, suppressed_reason: reason,
    });
    if (error?.code === "23505") return "duplicate";
    return error ? `error:${error.code}` : `${status}:${reason}`;
  } catch (e) {
    return `error:${(e as Error).message}`;
  }
}
