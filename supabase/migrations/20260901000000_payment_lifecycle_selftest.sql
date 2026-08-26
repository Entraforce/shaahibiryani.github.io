-- A runnable regression test for the money path.
--
-- This exists because a migration of mine put a broken trigger into production
-- (enqueue_print_job_guarded called a trigger function directly, which Postgres
-- forbids) and NOTHING caught it. The migration applied cleanly, the trigger
-- definition looked right, and yet no order could be marked paid by anything.
-- "Applied successfully" is not evidence that behaviour still works.
--
-- selftest_payment_lifecycle() exercises the transition end to end on synthetic
-- rows and cleans up after itself, so it is safe to run against production
-- before and after any deploy. Docker is unavailable on this machine, so there
-- is no local Postgres to test against — this runs the real schema, real
-- triggers and real constraints, which is what actually needs proving.
--
-- Run it:   select * from public.selftest_payment_lifecycle();
-- Any row with passed = false means the money path is broken. Do not deploy.

CREATE OR REPLACE FUNCTION public.selftest_payment_lifecycle()
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fresh   uuid;
  v_stale   uuid;
  v_attempt uuid;
  n         integer;
  amt       integer;
  ps        text;
  st        text;
BEGIN
  -- ── 1. A FRESH order settles: pending -> paid ───────────────────────────
  INSERT INTO public.orders (user_id, source, guest_name, guest_phone, status,
                             fulfillment, subtotal, tax, delivery_fee, tip, total,
                             payment_status, stripe_payment_intent)
  VALUES (NULL, 'web', 'SELFTEST fresh', '0000000001', 'pending',
          'pickup', 1.50, 0.12, 0, 0, 1.62, 'pending',
          'pi_selftest_fresh_' || gen_random_uuid()::text)
  RETURNING id INTO v_fresh;

  -- The client cannot declare an order paid; the BEFORE INSERT trigger must
  -- have overridden the values above.
  SELECT payment_status INTO ps FROM public.orders WHERE id = v_fresh;
  RETURN QUERY SELECT 'insert cannot claim paid'::text, ps = 'pending', ps;

  -- A checkout attempt tracking this order should close when it settles.
  INSERT INTO public.checkout_attempts (basket_fingerprint, guest_phone, status, order_id)
  VALUES ('selftest_' || v_fresh::text, '0000000001', 'awaiting_payment', v_fresh)
  RETURNING id INTO v_attempt;

  UPDATE public.orders
     SET payment_status = 'paid', paid_amount_cents = 162
   WHERE id = v_fresh;

  SELECT payment_status, paid_amount_cents INTO ps, amt
    FROM public.orders WHERE id = v_fresh;
  RETURN QUERY SELECT 'fresh: reaches paid'::text, ps = 'paid', ps;
  RETURN QUERY SELECT 'fresh: paid amount recorded'::text, amt = 162,
                      COALESCE(amt::text, 'null');

  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id = v_fresh;
  RETURN QUERY SELECT 'fresh: exactly one kitchen ticket'::text, n = 1, n::text;

  SELECT status INTO st FROM public.checkout_attempts WHERE id = v_attempt;
  RETURN QUERY SELECT 'fresh: checkout attempt closed'::text, st = 'paid', st;

  -- Settling twice must not produce a second ticket or a second award.
  UPDATE public.orders SET paid_amount_cents = 162 WHERE id = v_fresh;
  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id = v_fresh;
  RETURN QUERY SELECT 'fresh: re-settling adds no ticket'::text, n = 1, n::text;

  -- ── 2. A STALE order settles WITHOUT summoning the kitchen ──────────────
  -- This is the reconciler repairing an old payment. The money must be
  -- recorded; the kitchen must not be told to cook a month-old order.
  INSERT INTO public.orders (user_id, source, guest_name, guest_phone, status,
                             fulfillment, subtotal, tax, delivery_fee, tip, total,
                             payment_status, created_at)
  VALUES (NULL, 'web', 'SELFTEST stale', '0000000002', 'pending',
          'pickup', 1.00, 0, 0, 0, 1.00, 'pending', now() - interval '3 days')
  RETURNING id INTO v_stale;

  UPDATE public.orders
     SET payment_status = 'paid', paid_amount_cents = 100
   WHERE id = v_stale;

  SELECT payment_status INTO ps FROM public.orders WHERE id = v_stale;
  RETURN QUERY SELECT 'stale: still reaches paid'::text, ps = 'paid', ps;

  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id = v_stale;
  RETURN QUERY SELECT 'stale: NO kitchen ticket'::text, n = 0, n::text;

  -- ── 3. Guest orders earn no loyalty (no account to credit) ──────────────
  SELECT count(*) INTO n FROM public.loyalty_transactions
   WHERE order_id IN (v_fresh, v_stale);
  RETURN QUERY SELECT 'guest orders award no points'::text, n = 0, n::text;

  -- ── cleanup: leave production exactly as found ──────────────────────────
  DELETE FROM public.checkout_attempts WHERE order_id IN (v_fresh, v_stale);
  DELETE FROM public.print_jobs        WHERE order_id IN (v_fresh, v_stale);
  DELETE FROM public.order_items       WHERE order_id IN (v_fresh, v_stale);
  DELETE FROM public.orders            WHERE id       IN (v_fresh, v_stale);

  SELECT count(*) INTO n FROM public.orders WHERE id IN (v_fresh, v_stale);
  RETURN QUERY SELECT 'selftest cleaned up after itself'::text, n = 0, n::text;
END $$;

REVOKE ALL ON FUNCTION public.selftest_payment_lifecycle() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selftest_payment_lifecycle() TO service_role;

COMMENT ON FUNCTION public.selftest_payment_lifecycle() IS
  'Regression test for the pending -> paid path. Run before and after any '
  'migration touching orders, triggers, print jobs, loyalty or checkout '
  'attempts. Any failing row means do not deploy.';

-- Run it now, and REFUSE THIS MIGRATION if the money path is broken.
DO $$
DECLARE r record; failures int := 0;
BEGIN
  FOR r IN SELECT * FROM public.selftest_payment_lifecycle() LOOP
    RAISE NOTICE '  [%] %  (%)',
      CASE WHEN r.passed THEN 'PASS' ELSE 'FAIL' END, r.check_name, r.detail;
    IF NOT r.passed THEN failures := failures + 1; END IF;
  END LOOP;
  IF failures > 0 THEN
    RAISE EXCEPTION 'payment lifecycle selftest failed % check(s) — refusing to deploy', failures;
  END IF;
  RAISE NOTICE 'payment lifecycle selftest: all checks passed';
END $$;
