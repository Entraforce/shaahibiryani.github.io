-- Launch offer: $4.99 delivery on $30+ food in Uber's $7.99 tier, Shaahi pays
-- the difference (delivery_subsidy_cents) up to a daily budget set by secret.
-- Additive only; pickup and app orders keep 0.
alter table public.orders add column if not exists delivery_subsidy_cents integer not null default 0
  check (delivery_subsidy_cents >= 0);
create index if not exists orders_delivery_subsidy_day on public.orders (created_at) where delivery_subsidy_cents > 0;

-- Server-owned like the other delivery fields: a customer insert gets 0.
create or replace function public.force_server_owned_delivery_fields()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.uber_mode                := null;
  new.delivery_quote_id        := null;
  new.uber_delivery_id         := null;
  new.uber_status              := null;
  new.uber_tracking_url        := null;
  new.uber_fee_cents           := null;
  new.uber_courier             := null;
  new.uber_updated_at          := null;
  new.uber_dispatch_state      := null;
  new.uber_dispatch_error      := null;
  new.uber_dispatch_claimed_at := null;
  new.uber_dispatch_attempts   := 0;
  new.courier_tip              := 0;
  new.tracking_token           := null;
  new.delivery_tax             := null;
  new.kitchen_accepted_at      := null;
  new.auto_refund_state        := null;
  new.auto_refund_at           := null;
  new.auto_refund_error        := null;
  new.auto_refund_id           := null;
  new.delivery_subsidy_cents   := 0;
  return new;
end $$;

-- Daily delivery economics for the owner (paid website delivery orders, Plano days).
-- security_invoker: callers see only what RLS lets them (staff).
create or replace view public.delivery_daily with (security_invoker = true) as
select (created_at at time zone 'America/Chicago')::date               as day,
       count(*)                                                         as orders,
       count(*) filter (where delivery_subsidy_cents > 0)               as promo_orders,
       sum(delivery_subsidy_cents)                                      as subsidy_cents,
       sum(round(delivery_fee * 100))::int                              as customer_delivery_fee_cents,
       sum(coalesce(uber_fee_cents, 0))                                 as uber_fee_cents,
       sum(round(subtotal * 100))::int                                  as food_cents
from public.orders
where fulfillment = 'delivery' and uber_mode = 'live' and payment_status = 'paid'
group by 1;
revoke all on public.delivery_daily from anon;

-- Atomic daily budget. One claim per delivery quote (a quote is used by one
-- order). claim_delivery_promo() serialises on an advisory lock, counts today's
-- live claims (paid orders, or checkouts started < 30 min ago) and only then
-- records the new one — two simultaneous checkouts can never both squeeze in.
create table if not exists public.delivery_promo_claims (
  claim_key     text primary key,                 -- delivery_quotes.id
  subsidy_cents integer not null check (subsidy_cents > 0),
  order_id      uuid references public.orders(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.delivery_promo_claims enable row level security;   -- no policies: server only

create or replace function public.delivery_promo_used(p_since timestamptz)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(c.subsidy_cents), 0)::int
  from public.delivery_promo_claims c left join public.orders o on o.id = c.order_id
  where c.created_at >= p_since
    and (o.payment_status = 'paid'
         or (coalesce(o.payment_status, 'pending') = 'pending' and c.created_at > now() - interval '30 minutes'));
$$;

create or replace function public.claim_delivery_promo(p_key text, p_subsidy integer, p_budget integer, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('delivery_promo_budget'));
  if exists (select 1 from public.delivery_promo_claims where claim_key = p_key) then return true; end if;  -- retry of the same checkout
  if public.delivery_promo_used(p_since) + p_subsidy > p_budget then return false; end if;
  insert into public.delivery_promo_claims (claim_key, subsidy_cents) values (p_key, p_subsidy);
  return true;
end $$;

revoke all on function public.delivery_promo_used(timestamptz) from public, anon, authenticated;
revoke all on function public.claim_delivery_promo(text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.delivery_promo_used(timestamptz) to service_role;
grant execute on function public.claim_delivery_promo(text, integer, integer, timestamptz) to service_role;
