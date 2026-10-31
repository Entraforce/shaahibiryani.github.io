-- Uber Direct: the delivery columns are SERVER-OWNED.
--
-- The existing "own orders insert" policy lets a signed-in app customer insert
-- their own order row with any column values (force_server_owned_payment_fields
-- resets only the payment fields). Without this guard, a customer could insert
-- a delivery order already marked uber_mode='live' (or with a tracking token,
-- a courier tip, an "already refunded" state…), pay for it in the app, and
-- have the dispatcher book a real Uber courier once the kitchen accepts it.
--
-- Only the server (service role: create-web-order, uber-dispatch, webhooks)
-- may set these. For anyone else they are cleared on insert. Customers have no
-- UPDATE policy on orders, so insert is the only path. Pickup and app orders
-- are unaffected: they never set these columns.
create or replace function public.force_server_owned_delivery_fields()
-- SECURITY INVOKER on purpose: inside a SECURITY DEFINER function current_user
-- is the owner (postgres), which would wave every customer insert through.
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
  return new;
end $$;

drop trigger if exists orders_force_delivery_fields on public.orders;
-- Named to sort BEFORE orders_stamp_kitchen_accepted_at (triggers fire in name order).
create trigger orders_force_delivery_fields before insert on public.orders
  for each row execute function public.force_server_owned_delivery_fields();
