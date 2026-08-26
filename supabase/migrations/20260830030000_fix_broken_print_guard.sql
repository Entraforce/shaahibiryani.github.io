-- URGENT: repairs a production-breaking bug introduced in 20260829030000.
--
-- enqueue_print_job_guarded() did `RETURN public.enqueue_print_job();`, but a
-- trigger function cannot be invoked directly from plpgsql — Postgres raises
-- "trigger functions can only be called as triggers". That function sits on the
-- pending -> paid trigger, so EVERY attempt to settle a payment raised and
-- rolled back: the webhook, confirm-web-order and the reconciler were all
-- unable to mark an order paid.
--
-- The age guard is folded into enqueue_print_job itself. One trigger function,
-- no cross-calling, same behaviour intended by the original change: a payment
-- confirmed long after the order was placed is bookkeeping, not a new ticket.

CREATE OR REPLACE FUNCTION public.enqueue_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF now() - NEW.created_at > interval '2 hours' THEN
    RAISE NOTICE 'no kitchen ticket for order %: placed % ago (late payment repair)',
      NEW.id, age(now(), NEW.created_at);
    RETURN NEW;
  END IF;
  INSERT INTO public.print_jobs (order_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enqueue_print_job ON public.orders;
CREATE TRIGGER orders_enqueue_print_job
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.enqueue_print_job();

DROP FUNCTION IF EXISTS public.enqueue_print_job_guarded();

-- Prove a payment can actually settle again, on a throwaway row.
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.orders (user_id, source, guest_name, guest_phone, status,
                             fulfillment, subtotal, tax, delivery_fee, tip, total,
                             payment_status)
  VALUES (NULL, 'web', 'Trigger Repair Probe', '0000000000', 'pending',
          'pickup', 1, 0, 0, 0, 1, 'pending')
  RETURNING id INTO v_id;

  UPDATE public.orders SET payment_status = 'paid', paid_amount_cents = 100
   WHERE id = v_id;

  RAISE NOTICE 'PROBE: pending -> paid now succeeds; ticket rows for probe = %',
    (SELECT count(*) FROM public.print_jobs WHERE order_id = v_id);

  DELETE FROM public.print_jobs WHERE order_id = v_id;
  DELETE FROM public.orders WHERE id = v_id;
  RAISE NOTICE 'PROBE: probe row removed';
END $$;
