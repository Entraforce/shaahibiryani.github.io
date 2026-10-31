-- Uber Direct website delivery, step 2 (STAGING first; not applied to production).
-- Additive only: new nullable/defaulted columns, one new table, one trigger.

-- 1. Courier tip, separate from the restaurant-staff tip in orders.tip.
alter table public.orders add column if not exists courier_tip numeric(10,2) not null default 0;

-- 2. When the kitchen first accepted the order (drives the courier's pickup time).
alter table public.orders add column if not exists kitchen_accepted_at timestamptz;
create or replace function public.stamp_kitchen_accepted_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kitchen_accepted_at is null and new.status in ('accepted','preparing','ready')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.kitchen_accepted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_stamp_kitchen_accepted_at on public.orders;
create trigger orders_stamp_kitchen_accepted_at before insert or update of status on public.orders
  for each row execute function public.stamp_kitchen_accepted_at();

-- 3. Customer tracking link secret: 32 hex chars, only on delivery orders.
--    The tracking page needs order id + token; neither alone reveals anything.
alter table public.orders add column if not exists tracking_token text;
create unique index if not exists orders_tracking_token_key on public.orders (tracking_token) where tracking_token is not null;

-- 4. Transactional delivery notifications (order updates, NOT marketing).
--    One row per order per kind: a replayed webhook cannot text twice.
create table if not exists public.delivery_notifications (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('confirmed','courier_booked','picked_up','delivered','problem')),
  channel text not null default 'sms' check (channel in ('sms','email')),
  to_masked text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','suppressed','failed')),
  suppressed_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, kind)
);
alter table public.delivery_notifications enable row level security;
-- Staff may read them (kitchen screen); nobody else. Writes are server-only.
drop policy if exists "staff read delivery notifications" on public.delivery_notifications;
create policy "staff read delivery notifications" on public.delivery_notifications
  for select to authenticated using (public.current_user_is_staff());
