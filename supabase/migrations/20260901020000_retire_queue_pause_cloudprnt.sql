-- PHASE 1: retire the historical CloudPRNT backlog.
-- PHASE 2: stop generating jobs while the printer is deliberately inactive.
--
-- The printer has not collected a job since 2026-06-26; orders since then were
-- fulfilled from the kitchen dashboard. The queue is a two-month backlog of
-- tickets for food already served — 49 for delivered orders and 3 for cancelled
-- ones. Plugging the printer in would print all of them at once.
--
-- Records are retired, never deleted: ids, timestamps and order links stay, and
-- each row records why.

ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS retired_reason text;

DO $$
DECLARE before_p int; after_p int; retired int; lo timestamptz; hi timestamptz; skipped int;
BEGIN
  SELECT count(*) INTO before_p FROM public.print_jobs WHERE status='pending';
  SELECT min(pj.created_at), max(pj.created_at) INTO lo, hi
    FROM public.print_jobs pj JOIN public.orders o ON o.id=pj.order_id
   WHERE pj.status='pending' AND o.status IN ('delivered','cancelled');

  -- Scoped to terminal-state orders only. A ticket for an order still working
  -- its way through the kitchen is left alone.
  UPDATE public.print_jobs pj
     SET status='cancelled',
         retired_reason='Historical fulfilled order; stale CloudPRNT job retired to prevent accidental reprint.'
    FROM public.orders o
   WHERE o.id=pj.order_id AND pj.status='pending'
     AND o.status IN ('delivered','cancelled');
  GET DIAGNOSTICS retired = ROW_COUNT;

  SELECT count(*) INTO after_p FROM public.print_jobs WHERE status='pending';
  SELECT count(*) INTO skipped FROM public.print_jobs pj JOIN public.orders o ON o.id=pj.order_id
   WHERE pj.status='pending' AND o.status NOT IN ('delivered','cancelled');

  RAISE NOTICE 'QUEUE before=%  retired=%  after=%', before_p, retired, after_p;
  RAISE NOTICE 'QUEUE retired span % .. %', lo, hi;
  RAISE NOTICE 'QUEUE left alone (order not finished): %', skipped;
END $$;

-- ── A switch, not a deletion ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_settings_staff_read ON public.integration_settings;
CREATE POLICY integration_settings_staff_read ON public.integration_settings
  FOR SELECT TO authenticated USING (public.current_user_is_staff());

INSERT INTO public.integration_settings (key, enabled, note) VALUES
  ('cloudprnt', false,
   'Paused 2026-08-26: no job collected since 2026-06-26; kitchen works from the '
   'dashboard. To recommission: enabled=true, place ONE test order, confirm ONE '
   'physical ticket, then resume.'),
  ('kitchen_dashboard', true, 'Primary fulfilment surface.')
ON CONFLICT (key) DO UPDATE
  SET enabled=EXCLUDED.enabled, note=EXCLUDED.note, updated_at=now();

CREATE OR REPLACE FUNCTION public.enqueue_print_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE printer_on boolean;
BEGIN
  SELECT enabled INTO printer_on FROM public.integration_settings WHERE key='cloudprnt';
  -- A missing row means "on", so a fresh database still prints.
  IF printer_on IS NOT NULL AND printer_on = false THEN
    RETURN NEW;                      -- dashboard-only; queue stops growing
  END IF;
  IF now() - NEW.created_at > interval '2 hours' THEN
    RAISE NOTICE 'no kitchen ticket for order %: placed % ago (late payment repair)',
      NEW.id, age(now(), NEW.created_at);
    RETURN NEW;
  END IF;
  INSERT INTO public.print_jobs (order_id) VALUES (NEW.id);
  RETURN NEW;
END $$;


-- ── Make the regression test aware of the printer switch ──────────────────
-- Previously it hard-coded "one ticket". With CloudPRNT paused the correct
-- answer is zero, so the test must assert the right thing per mode rather than
-- the caller tolerating a known number of failures.
CREATE OR REPLACE FUNCTION public.selftest_payment_lifecycle()
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fresh uuid; v_stale uuid; v_attempt uuid;
  n int; amt int; ps text; st text;
  printer_on boolean; want_tickets int;
BEGIN
  SELECT enabled INTO printer_on FROM public.integration_settings WHERE key='cloudprnt';
  want_tickets := CASE WHEN printer_on IS NULL OR printer_on THEN 1 ELSE 0 END;

  INSERT INTO public.orders (user_id, source, guest_name, guest_phone, status,
                             fulfillment, subtotal, tax, delivery_fee, tip, total,
                             payment_status, stripe_payment_intent)
  VALUES (NULL,'web','SELFTEST fresh','0000000001','pending','pickup',
          1.50,0.12,0,0,1.62,'pending','pi_selftest_'||gen_random_uuid()::text)
  RETURNING id INTO v_fresh;

  SELECT payment_status INTO ps FROM public.orders WHERE id=v_fresh;
  RETURN QUERY SELECT 'insert cannot claim paid'::text, ps='pending', ps;

  INSERT INTO public.checkout_attempts (basket_fingerprint, guest_phone, status, order_id)
  VALUES ('selftest_'||v_fresh::text,'0000000001','awaiting_payment',v_fresh)
  RETURNING id INTO v_attempt;

  UPDATE public.orders SET payment_status='paid', paid_amount_cents=162 WHERE id=v_fresh;

  SELECT payment_status, paid_amount_cents INTO ps, amt FROM public.orders WHERE id=v_fresh;
  RETURN QUERY SELECT 'fresh: reaches paid'::text, ps='paid', ps;
  RETURN QUERY SELECT 'fresh: paid amount recorded'::text, amt=162, COALESCE(amt::text,'null');

  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id=v_fresh;
  RETURN QUERY SELECT ('fresh: ticket count matches printer mode (want '||want_tickets||')')::text,
                      n=want_tickets, n::text;

  SELECT status INTO st FROM public.checkout_attempts WHERE id=v_attempt;
  RETURN QUERY SELECT 'fresh: checkout attempt closed'::text, st='paid', st;

  UPDATE public.orders SET paid_amount_cents=162 WHERE id=v_fresh;
  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id=v_fresh;
  RETURN QUERY SELECT 're-settling adds no extra ticket'::text, n=want_tickets, n::text;

  INSERT INTO public.orders (user_id, source, guest_name, guest_phone, status,
                             fulfillment, subtotal, tax, delivery_fee, tip, total,
                             payment_status, created_at)
  VALUES (NULL,'web','SELFTEST stale','0000000002','pending','pickup',
          1.00,0,0,0,1.00,'pending', now() - interval '3 days')
  RETURNING id INTO v_stale;

  UPDATE public.orders SET payment_status='paid', paid_amount_cents=100 WHERE id=v_stale;
  SELECT payment_status INTO ps FROM public.orders WHERE id=v_stale;
  RETURN QUERY SELECT 'stale: still reaches paid'::text, ps='paid', ps;

  SELECT count(*) INTO n FROM public.print_jobs WHERE order_id=v_stale;
  RETURN QUERY SELECT 'stale: NO kitchen ticket ever'::text, n=0, n::text;

  SELECT count(*) INTO n FROM public.loyalty_transactions WHERE order_id IN (v_fresh,v_stale);
  RETURN QUERY SELECT 'guest orders award no points'::text, n=0, n::text;

  DELETE FROM public.checkout_attempts WHERE order_id IN (v_fresh,v_stale);
  DELETE FROM public.print_jobs        WHERE order_id IN (v_fresh,v_stale);
  DELETE FROM public.order_items       WHERE order_id IN (v_fresh,v_stale);
  DELETE FROM public.orders            WHERE id       IN (v_fresh,v_stale);
  SELECT count(*) INTO n FROM public.orders WHERE id IN (v_fresh,v_stale);
  RETURN QUERY SELECT 'selftest cleaned up after itself'::text, n=0, n::text;
END $fn$;

-- ── Gate: every check must now pass in EITHER printer mode ───────────────
DO $$
DECLARE r record; fails int := 0;
BEGIN
  FOR r IN SELECT * FROM public.selftest_payment_lifecycle() LOOP
    RAISE NOTICE '  [%] % (%)', CASE WHEN r.passed THEN 'PASS' ELSE 'FAIL' END, r.check_name, r.detail;
    IF NOT r.passed THEN fails := fails + 1; END IF;
  END LOOP;
  IF fails > 0 THEN
    RAISE EXCEPTION 'payment lifecycle selftest failed % check(s) — refusing to deploy', fails;
  END IF;
  RAISE NOTICE 'SELFTEST: all checks pass with CloudPRNT paused';
END $$;
