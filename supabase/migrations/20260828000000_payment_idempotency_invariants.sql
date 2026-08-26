-- Money-path idempotency, enforced by the database rather than by application
-- code, so it holds against every caller: the webhook, a replayed webhook, the
-- reconciler, confirm-web-order, a retried transaction, or anything added later.
--
-- Existing guarantees before this migration (verified):
--   * orders_stripe_payment_intent_key (20260601100000) — a PaymentIntent can
--     never be attached to two orders.
--   * The paid-transition trigger WHEN clause (20260827010000) — points and the
--     kitchen ticket fire only on a genuine pending -> paid change.
--
-- What was still missing: nothing deduplicated Stripe events themselves, and
-- nothing stopped loyalty being written twice for one order if a second code
-- path ever inserted it directly.

-- ── 1. Stripe event log: replay becomes a no-op ────────────────────────────
-- The webhook records every event id it has processed. A replay hits the
-- primary key and is skipped before any order is touched, so a re-delivered
-- event cannot re-award points, re-print a ticket, or re-run any write.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id     text PRIMARY KEY,
  event_type   text,
  account      text,                       -- which Stripe account (app vs web)
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events IS
  'One row per Stripe event already processed. Insert-with-conflict is how the '
  'webhooks achieve replay-safety: a duplicate delivery aborts before any write.';

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may touch this.
-- Customers have no business reading Stripe's event stream.

-- Keep it from growing without bound; Stripe only retries for ~3 days.
CREATE INDEX IF NOT EXISTS stripe_events_processed_at_idx
  ON public.stripe_events (processed_at);

-- ── 2. Loyalty can be written at most once per order, per reason ───────────
-- Points buy real discounts, so this is a money invariant. Any pre-existing
-- duplicates are collapsed to the earliest row before the index goes on, and
-- the count is reported so we learn whether double-awarding ever happened.
DO $$
DECLARE
  dupes integer;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY order_id, reason
             ORDER BY created_at, id
           ) AS rn
      FROM public.loyalty_transactions
     WHERE order_id IS NOT NULL
  )
  DELETE FROM public.loyalty_transactions lt
   USING ranked r
   WHERE lt.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS dupes = ROW_COUNT;
  IF dupes > 0 THEN
    RAISE NOTICE 'PROBE: removed % duplicate loyalty rows — points HAD been awarded more than once', dupes;
  ELSE
    RAISE NOTICE 'PROBE: no duplicate loyalty rows found';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_transactions_order_reason_key
  ON public.loyalty_transactions (order_id, reason)
  WHERE order_id IS NOT NULL;

COMMENT ON INDEX public.loyalty_transactions_order_reason_key IS
  'One award and one redemption per order, enforced by the database. Manual '
  'adjustments (order_id IS NULL) are deliberately exempt.';

-- ── 3. Report the kitchen-ticket situation rather than guessing ────────────
-- A hard unique on print_jobs(order_id) would also block a legitimate staff
-- reprint, so this only reports the current shape; duplicate-fire protection
-- comes from the paid-transition WHEN clause plus the event dedup above.
DO $$
DECLARE
  has_order_id boolean;
  dupes integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='print_jobs' AND column_name='order_id'
  ) INTO has_order_id;

  IF NOT has_order_id THEN
    RAISE NOTICE 'PROBE: print_jobs has no order_id column';
    RETURN;
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT order_id FROM public.print_jobs
     WHERE order_id IS NOT NULL
     GROUP BY order_id HAVING count(*) > 1
  ) d;
  RAISE NOTICE 'PROBE: orders with more than one print job: %', dupes;
END $$;
