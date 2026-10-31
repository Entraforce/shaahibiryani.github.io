// Act as the kitchen (staging test staff account) on one order:
//   node scripts/staging-kitchen.mjs <order-id> <accepted|preparing|ready|cancelled>
// Uses the same set_order_status RPC the kitchen display's buttons call.
import { readFileSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path';
const env = Object.fromEntries(readFileSync(join(homedir(), '.config/shaahi/staging.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!env.STAGING_PROJECT_REF || env.STAGING_PROJECT_REF === 'wtdthjhqgsbnyjucdqxl') throw new Error('refusing: not staging');
const [id, to] = process.argv.slice(2); const BASE = `https://${env.STAGING_PROJECT_REF}.supabase.co`;
const t = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.STAGING_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'kitchen-test@shaahi-staging.test', password: env.STAGING_KITCHEN_TEST_PASSWORD }) }).then((r) => r.json());
const r = await fetch(`${BASE}/rest/v1/rpc/set_order_status`, { method: 'POST', headers: { apikey: env.STAGING_ANON_KEY, Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_order_id: id, p_status: to }) });
const o = await r.json(); console.log(r.status, o.status ?? o.message, o.kitchen_accepted_at ? `accepted_at ${o.kitchen_accepted_at}` : '');
