-- Uber Direct step 3: automatic refund on kitchen rejection, delivery-fee tax,
-- and retryable transactional notifications. Additive only; pickup untouched.

-- Delivery-fee sales tax, kept apart from food tax for reporting.
alter table public.orders add column if not exists delivery_tax numeric(10,2);

-- Automatic refund when the kitchen rejects a paid delivery before a courier
-- is booked. auto_refund_state: pending (claimed) → refunded | failed.
-- 'failed' is the manual-exception queue: the kitchen card turns red and staff
-- refund through the existing Refunds tool.
alter table public.orders add column if not exists auto_refund_state text
  check (auto_refund_state in ('pending', 'refunded', 'failed'));
alter table public.orders add column if not exists auto_refund_at timestamptz;
alter table public.orders add column if not exists auto_refund_error text;
alter table public.orders add column if not exists auto_refund_id text;

-- Exactly one caller owns an order's refund. Returns the row only to the
-- caller that moved it from NULL to 'pending'.
create or replace function public.claim_auto_refund(p_order uuid)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  update public.orders
     set auto_refund_state = 'pending', auto_refund_at = now()
   where id = p_order
     and auto_refund_state is null
     and fulfillment = 'delivery'
     and status = 'cancelled'
     and payment_status = 'paid'
     and coalesce(refund_status, 'none') = 'none'
     and uber_delivery_id is null
     -- never while a courier booking is in flight (a stale claim expires)
     and (uber_dispatch_claimed_at is null or uber_dispatch_claimed_at < now() - interval '5 minutes')
  returning *;
$$;
revoke all on function public.claim_auto_refund(uuid) from public, anon, authenticated;

-- Notifications: a message can now be sent (Twilio) or captured (staging),
-- and failed sends are retried a bounded number of times.
alter table public.delivery_notifications drop constraint if exists delivery_notifications_status_check;
alter table public.delivery_notifications add constraint delivery_notifications_status_check
  check (status in ('queued', 'sent', 'captured', 'suppressed', 'failed'));
alter table public.delivery_notifications add column if not exists attempts int not null default 0;
alter table public.delivery_notifications add column if not exists last_error text;
alter table public.delivery_notifications add column if not exists provider_id text;
alter table public.delivery_notifications drop constraint if exists delivery_notifications_kind_check;
alter table public.delivery_notifications add constraint delivery_notifications_kind_check
  check (kind in ('confirmed', 'courier_booked', 'picked_up', 'delivered', 'problem', 'refunded'));
