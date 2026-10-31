-- ROLLBACK for migrations 20261031000000, 20261031010000, 20261031020000
-- (Uber Direct website delivery). Run ONLY after delivery is switched off
-- (UBER_DIRECT_MODE unset) and the uber-dispatch cron job is unscheduled.
-- Removes only objects those migrations added; pickup, app orders, payments
-- and every pre-existing column are untouched. Delivery history in the
-- dropped columns/tables is lost, so export it first if any real delivery ran.
begin;

select cron.unschedule('uber-dispatch') where exists (select 1 from cron.job where jobname = 'uber-dispatch');

drop trigger if exists orders_stamp_kitchen_accepted_at on public.orders;
drop function if exists public.stamp_kitchen_accepted_at();
drop function if exists public.claim_auto_refund(uuid);
drop function if exists public.claim_uber_dispatch(uuid, integer);

drop table if exists public.delivery_notifications;
drop table if exists public.uber_webhook_events;
drop table if exists public.uber_oauth_cache;

drop index if exists public.orders_uber_dispatch_queue;
drop index if exists public.orders_tracking_token_key;
drop index if exists public.orders_uber_delivery_id_key;

alter table public.orders
  drop column if exists delivery_quote_id,
  drop column if exists uber_mode,
  drop column if exists uber_delivery_id,
  drop column if exists uber_status,
  drop column if exists uber_tracking_url,
  drop column if exists uber_fee_cents,
  drop column if exists uber_courier,
  drop column if exists uber_updated_at,
  drop column if exists uber_dispatch_state,
  drop column if exists uber_dispatch_error,
  drop column if exists uber_dispatch_attempts,
  drop column if exists uber_dispatch_claimed_at,
  drop column if exists courier_tip,
  drop column if exists kitchen_accepted_at,
  drop column if exists tracking_token,
  drop column if exists delivery_tax,
  drop column if exists auto_refund_state,
  drop column if exists auto_refund_at,
  drop column if exists auto_refund_error,
  drop column if exists auto_refund_id;

drop table if exists public.delivery_quotes;

commit;
