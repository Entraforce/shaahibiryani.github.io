// Structured operational logging for the Edge Functions.
//
// Security is not enough on its own: a silent failure in the money path is
// indistinguishable from everything working. Every log line here is a single
// JSON object on one line so Supabase's log explorer can filter on the fields,
// and every line carries a severity so real alerts can be separated from noise.
//
// SEVERITY MEANING (agreed policy, not decoration):
//   INFO    something normal happened that we want to be able to count later
//   WARNING something unexpected but self-correcting, or a single bad actor
//   ALERT   money, fulfillment or trust is at risk and a human should look
//
// WHAT MUST NEVER BE LOGGED
// Card numbers, CVV, any payment credential, Stripe secret keys, the Supabase
// service-role key, the Anthropic key, raw auth tokens, environment values, or
// full system prompts. Customer PII is kept to the minimum that makes an
// incident debuggable — identifiers are masked, never printed whole.

export type Severity = "INFO" | "WARNING" | "ALERT";

/**
 * Shortens an identifier so logs stay correlatable without publishing it.
 * `pi_3RtQ...9f2A` keeps the Stripe prefix (useful) and enough tail to match a
 * dashboard entry, while dropping the middle.
 */
export function mask(id: string | null | undefined): string | null {
  if (!id) return null;
  const s = String(id);
  if (s.length <= 12) return s.slice(0, 4) + "…";
  return s.slice(0, 8) + "…" + s.slice(-4);
}

/** Phone/email are PII: keep only enough to recognise a repeat offender. */
export function maskContact(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length <= 4 ? "…" : "…" + s.slice(-4);
}

// Field names that must never appear in a log line, whatever the caller does.
const FORBIDDEN = /(secret|api[_-]?key|service[_-]?role|authorization|token|password|cvv|card[_-]?number|system[_-]?prompt)/i;

export function log(
  level: Severity,
  evt: string,
  fields: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN.test(k)) { safe[k] = "[redacted]"; continue; }
    // Defence in depth: a long opaque string is far more likely to be a
    // credential that slipped through than something worth reading.
    if (typeof v === "string" && v.length > 300) { safe[k] = v.slice(0, 300) + "…[truncated]"; continue; }
    safe[k] = v;
  }
  const line = JSON.stringify({ level, evt, ...safe });
  if (level === "ALERT") console.error(line);
  else if (level === "WARNING") console.warn(line);
  else console.log(line);
}
