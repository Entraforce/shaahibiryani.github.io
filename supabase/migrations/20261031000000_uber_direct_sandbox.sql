-- Uber Direct website delivery — SANDBOX schema. NOT APPLIED to production.
-- Apply only to a test project (or production after the owner approves going
-- live). Additive only: no existing column, constraint or trigger changes, so
-- pickup ordering, Clover sync, printing and the kitchen display are unaffected.

-- 1. Quotes the website showed a customer. create-web-order only accepts a
--    delivery fee that came from one of these rows (never from the browser).
create table if not exists public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  uber_quote_id text not null,
  uber_mode text not null check (uber_mode in ('sandbox')),
  fee_cents integer not null check (fee_cents > 0),
  address jsonb not null,
  address_key text not null,
  dropoff_eta timestamptz,
  duration_min integer,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_by_order uuid
);
alter table public.delivery_quotes enable row level security;  -- service role only; no policies

-- 2. Courier state on the order.
alter table public.orders
  add column if not exists delivery_quote_id uuid references public.delivery_quotes(id),
  add column if not exists uber_mode text,
  add column if not exists uber_delivery_id text,
  add column if not exists uber_status text,
  add column if not exists uber_tracking_url text,
  add column if not exists uber_courier jsonb,
  add column if not exists uber_fee_cents integer,
  add column if not exists uber_dispatch_state text,          -- null | claimed | dispatched | needs_staff
  add column if not exists uber_dispatch_attempts integer not null default 0,
  add column if not exists uber_dispatch_claimed_at timestamptz,
  add column if not exists uber_dispatch_error text,
  add column if not exists uber_updated_at timestamptz;

-- One courier per order, ever: a second delivery id for the same order fails.
create unique index if not exists orders_uber_delivery_id_key
  on public.orders (uber_delivery_id) where uber_delivery_id is not null;

create index if not exists orders_uber_dispatch_queue
  on public.orders (created_at)
  where fulfillment = 'delivery' and uber_delivery_id is null and payment_status = 'paid';

-- 3. Webhook replay guard (Uber retries up to 3 times).
create table if not exists public.uber_webhook_events (
  event_id text primary key,
  kind text,
  delivery_id text,
  received_at timestamptz not null default now()
);
alter table public.uber_webhook_events enable row level security;

-- 4. Atomic dispatch claim: exactly one caller wins an order. Returns the row
--    only when this caller now owns the dispatch.
create or replace function public.claim_uber_dispatch(p_order uuid, p_ttl_seconds integer default 120)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  update public.orders
     set uber_dispatch_state = 'claimed',
         uber_dispatch_claimed_at = now(),
         uber_dispatch_attempts = uber_dispatch_attempts + 1
   where id = p_order
     and fulfillment = 'delivery'
     and payment_status = 'paid'
     and status in ('accepted', 'preparing', 'ready')
     and uber_delivery_id is null
     and coalesce(uber_dispatch_state, '') <> 'needs_staff'
     and (uber_dispatch_claimed_at is null or uber_dispatch_claimed_at < now() - make_interval(secs => p_ttl_seconds))
  returning *;
$$;
revoke all on function public.claim_uber_dispatch(uuid, integer) from public, anon, authenticated;

-- 5. One cached Uber OAuth token (30-day tokens; Uber limits token requests to
--    100/hour, so cold edge-function starts must not each ask for a new one).
--    RLS on with no policies: only the service role can read it.
create table if not exists public.uber_oauth_cache (
  id smallint primary key default 1 check (id = 1),
  token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.uber_oauth_cache enable row level security;

-- 6. (Run separately, after deploying uber-dispatch, on the SANDBOX project only.)
--    Every minute, like clover-sync. The secret is read from Vault, not written here.
-- select cron.schedule('uber-dispatch', '* * * * *', $$
--   select net.http_post(
--     url := 'https://<project>.supabase.co/functions/v1/uber-dispatch',
--     headers := jsonb_build_object('x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'uber_dispatch_trigger_secret'))
--   );
-- $$);
