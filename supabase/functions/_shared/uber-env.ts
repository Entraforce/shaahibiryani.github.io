// Wires the shared Uber Direct client to this project's secrets and token cache.
// Secrets (set with `supabase secrets set`, never in git):
//   UBER_DIRECT_MODE=sandbox|live, UBER_DIRECT_CUSTOMER_ID, UBER_DIRECT_CLIENT_ID,
//   UBER_DIRECT_CLIENT_SECRET, UBER_DIRECT_WEBHOOK_SECRET
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS module
import { makeUberClient, uberMode } from "./uber-direct.js";
// @ts-ignore — shared plain-JS module
import { policyFromEnv, pilotAccess } from "./delivery-policy.js";

export function uberClientFor(supabase: any) {
  return makeUberClient({
    mode: Deno.env.get("UBER_DIRECT_MODE"),
    customerId: Deno.env.get("UBER_DIRECT_CUSTOMER_ID"),
    clientId: Deno.env.get("UBER_DIRECT_CLIENT_ID"),
    clientSecret: Deno.env.get("UBER_DIRECT_CLIENT_SECRET"),
    tokenStore: {
      async get() {
        const { data } = await supabase.from("uber_oauth_cache").select("token, expires_at").eq("id", 1).maybeSingle();
        return data ? { token: data.token, expiresAt: Date.parse(data.expires_at) } : null;
      },
      async set(v: { token: string; expiresAt: number }) {
        await supabase.from("uber_oauth_cache").upsert({ id: 1, token: v.token, expires_at: new Date(v.expiresAt).toISOString(), updated_at: new Date().toISOString() });
      },
    },
  });
}

export const UBER_MODE: string = uberMode(Deno.env.get("UBER_DIRECT_MODE"));
// Owner delivery policy for this environment (see DEFAULT_POLICY).
export const POLICY = policyFromEnv((k: string) => Deno.env.get(k));
// Emergency switch for NEW delivery orders: DELIVERY_NEW_ORDERS=off stops
// quotes and delivery checkout at once, while paid orders already in the
// kitchen still get their courier and tracking. Pickup is never affected.
// (UBER_DIRECT_MODE=disabled is the full stop: no new couriers at all.)
export const NEW_DELIVERY_ORDERS = String(Deno.env.get("DELIVERY_NEW_ORDERS") ?? "on").toLowerCase() !== "off";

// Pilot gate, enforced here and not in the page: DELIVERY_PILOT=on limits
// delivery to callers who send DELIVERY_PILOT_CODE and whose phone is listed
// in DELIVERY_PILOT_PHONES (comma-separated). Live mode refuses to run without it.
const PILOT_ON = ["on", "true", "1"].includes(String(Deno.env.get("DELIVERY_PILOT") ?? "").toLowerCase());
const PILOT_CODE = String(Deno.env.get("DELIVERY_PILOT_CODE") ?? "");
const PILOT_PHONES = new Set(String(Deno.env.get("DELIVERY_PILOT_PHONES") ?? "").split(",")
  .map((p) => p.replace(/\D/g, "").slice(-10)).filter((p) => p.length === 10));
function sameText(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function pilotGate(code: unknown, phone: unknown): { ok: boolean; reason?: string } {
  return pilotAccess({
    mode: UBER_MODE, pilotOn: PILOT_ON,
    codeOk: sameText(String(code ?? ""), PILOT_CODE),
    phoneListed: PILOT_PHONES.has(String(phone ?? "").replace(/\D/g, "").slice(-10)),
  });
}
