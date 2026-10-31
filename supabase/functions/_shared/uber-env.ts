// Wires the shared Uber Direct client to this project's secrets and token cache.
// Secrets (set with `supabase secrets set`, never in git):
//   UBER_DIRECT_MODE=sandbox, UBER_DIRECT_CUSTOMER_ID, UBER_DIRECT_CLIENT_ID,
//   UBER_DIRECT_CLIENT_SECRET, UBER_DIRECT_WEBHOOK_SECRET
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS module
import { makeUberClient, uberMode } from "./uber-direct.js";

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
