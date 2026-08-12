-- Payment safety net (KNOWN_ISSUES #1: charge-without-order race).
-- A Stripe webhook (Edge Function `stripe-webhook`) listens for
-- payment_intent.succeeded and either confirms the matching order is paid,
-- or records an "orphan" charge here for staff to reconcile/refund.

-- Charges that succeeded in Stripe but have NO matching order row.
CREATE TABLE IF NOT EXISTS public.payment_orphans (
  payment_intent_id text PRIMARY KEY,
  user_id           uuid,
  amount_cents      integer,
  currency          text,
  metadata          jsonb,
  resolved          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_orphans ENABLE ROW LEVEL SECURITY;

-- Staff can view/manage orphan charges; the webhook writes via the service
-- role (which bypasses RLS), so no INSERT policy is needed here.
DROP POLICY IF EXISTS payment_orphans_staff_select ON public.payment_orphans;
CREATE POLICY payment_orphans_staff_select ON public.payment_orphans
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

DROP POLICY IF EXISTS payment_orphans_staff_update ON public.payment_orphans;
CREATE POLICY payment_orphans_staff_update ON public.payment_orphans
  FOR UPDATE TO authenticated
  USING (public.current_user_is_staff());

-- Idempotency: never allow two orders for the same Stripe charge.
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_key
  ON public.orders (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;
