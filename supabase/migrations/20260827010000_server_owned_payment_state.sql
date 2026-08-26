-- Payment state becomes server-owned.
--
-- Two holes closed here, both reachable by any signed-up customer with the
-- public anon key and a single HTTP request:
--
--   1. The orders INSERT policy checks only WHOSE row it is
--      (`with check (auth.uid() = user_id)`), not what is in it, and the
--      client decided payment_status itself (lib/orders.ts). So a crafted
--      insert with payment_status='paid' produced a kitchen ticket and
--      loyalty points without any money moving.
--
--   2. Points were floor(subtotal) on INSERT, and subtotal is client-supplied.
--      Even a genuine $5 payment could claim a $10,000 subtotal and mint
--      10,000 points — which create-payment-intent then trusts server-side to
--      grant real $5 discounts.
--
-- Approach deliberately does NOT revoke column privileges: builds already in
-- the field (and in App Store review) still send payment_status='paid', and
-- revoking would fail their inserts outright and break checkout for every
-- existing customer. A BEFORE INSERT trigger overrides the client instead, so
-- old and new clients are both safe with no app update required.
--
-- Points now derive from paid_amount_cents, which only ever comes from Stripe.

-- ── 1. Server-trusted charge amount ────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer;

COMMENT ON COLUMN public.orders.paid_amount_cents IS
  'Authoritative amount actually captured by Stripe, written only by the '
  'webhook/reconciler via the service role. Loyalty points are computed from '
  'this, never from the client-supplied subtotal.';

-- ── 2. The client no longer decides payment state ──────────────────────────
CREATE OR REPLACE FUNCTION public.force_server_owned_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Anything a customer claims about payment is discarded. Only the Stripe
  -- webhook (service role, which bypasses RLS and so skips this trigger's
  -- intent by setting these on UPDATE) may mark an order paid.
  NEW.payment_status    := 'pending';
  NEW.points_earned     := 0;
  NEW.paid_amount_cents := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_force_payment_fields ON public.orders;
CREATE TRIGGER orders_force_payment_fields
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_payment_fields();

-- ── 3. Loyalty now requires a confirmed charge ─────────────────────────────
-- Same award function, but it reads the Stripe amount and is driven by the
-- pending -> paid transition instead of the bare insert.
CREATE OR REPLACE FUNCTION public.award_loyalty_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  earned        integer;
  redeemed      integer;
  new_lifetime  integer;
  new_tier      text;
BEGIN
  -- Guest web orders have no account to credit.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never award twice for the same order.
  IF EXISTS (
    SELECT 1 FROM public.loyalty_transactions
     WHERE order_id = NEW.id AND reason = 'order placed'
  ) THEN
    RETURN NEW;
  END IF;

  -- Points come from what Stripe actually captured. Legacy rows (paid before
  -- this migration, so no paid_amount_cents) fall back to subtotal.
  earned := floor(COALESCE(NEW.paid_amount_cents / 100.0, NEW.subtotal))::integer;
  redeemed := COALESCE(NEW.points_redeemed, 0);

  IF earned > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, points_change, reason)
    VALUES (NEW.user_id, NEW.id, earned, 'order placed');
    UPDATE public.orders SET points_earned = earned WHERE id = NEW.id;
  END IF;

  IF redeemed > 0 AND NOT EXISTS (
    SELECT 1 FROM public.loyalty_transactions
     WHERE order_id = NEW.id AND reason = 'order redemption'
  ) THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, points_change, reason)
    VALUES (NEW.user_id, NEW.id, -redeemed, 'order redemption');
  END IF;

  SELECT COALESCE(SUM(points_change), 0) INTO new_lifetime
    FROM public.loyalty_transactions WHERE user_id = NEW.user_id;

  new_tier := CASE
    WHEN new_lifetime >= 1000 THEN 'gold'
    WHEN new_lifetime >= 400  THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE public.profiles
     SET loyalty_points = new_lifetime,
         loyalty_tier   = new_tier
   WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Fires on the transition into paid, never on a bare insert.
DROP TRIGGER IF EXISTS award_loyalty_on_order ON public.orders;
CREATE TRIGGER award_loyalty_on_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.award_loyalty_on_order();

-- ── 4. The kitchen only prints paid tickets ────────────────────────────────
-- Previously AFTER INSERT with no condition, so an unauthenticated web order
-- printed a physical ticket before the card was charged.
DROP TRIGGER IF EXISTS orders_enqueue_print_job ON public.orders;
CREATE TRIGGER orders_enqueue_print_job
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.enqueue_print_job();

-- ── 5. Close the webhook-beats-insert race ─────────────────────────────────
-- The app pays first and inserts the order immediately after, so Stripe's
-- webhook can arrive BEFORE the row exists — in which case the webhook files
-- a payment_orphans record and never revisits. Without this the order would
-- sit pending forever: no points, no ticket. On insert, adopt any orphan
-- charge already recorded for the same PaymentIntent.
CREATE OR REPLACE FUNCTION public.adopt_orphan_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  orphan public.payment_orphans%ROWTYPE;
BEGIN
  IF NEW.stripe_payment_intent IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO orphan
    FROM public.payment_orphans
   WHERE payment_intent_id = NEW.stripe_payment_intent
   LIMIT 1;

  IF FOUND THEN
    -- This UPDATE fires the paid-transition triggers above, so points and the
    -- kitchen ticket happen exactly as they would for a webhook-first order.
    UPDATE public.orders
       SET payment_status    = 'paid',
           paid_amount_cents = orphan.amount_cents
     WHERE id = NEW.id;

    UPDATE public.payment_orphans
       SET resolved = true
     WHERE payment_intent_id = NEW.stripe_payment_intent;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_adopt_orphan_charge ON public.orders;
CREATE TRIGGER orders_adopt_orphan_charge
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.adopt_orphan_charge();
