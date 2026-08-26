-- Stops the kitchen receiving tickets for orders it already fulfilled.
--
-- Moving ticket generation to the pending -> paid transition (20260827010000)
-- was correct, but ANY later transition raises a ticket — including the
-- reconciler repairing a months-old payment. Its first run flipped three
-- already-delivered orders from June and July and queued three tickets dated
-- today, which had not yet printed.
--
-- print_jobs.status only allowed 'pending' | 'printed', so there was no honest
-- way to retire a ticket: marking one 'printed' would claim the kitchen saw it.
-- The constraint is widened with an explicit 'cancelled' instead. Nothing is
-- deleted — the audit trail stays intact.

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;
ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'printed'::text, 'cancelled'::text]));

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.print_jobs pj
     SET status = 'cancelled'
    FROM public.orders o
   WHERE o.id = pj.order_id
     AND pj.status = 'pending'
     AND pj.created_at - o.created_at > interval '2 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'retired % stale ticket(s) — they can no longer reach the printer', n;
END $$;

-- The trigger now refuses to raise a ticket for an order that is no longer of
-- the moment. A payment confirmed long after the fact is a bookkeeping repair,
-- not something to cook. Deliberate staff reprints are unaffected.
CREATE OR REPLACE FUNCTION public.enqueue_print_job_guarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF now() - NEW.created_at > interval '2 hours' THEN
    RAISE NOTICE 'no kitchen ticket for order %: placed % ago, late payment repair',
      NEW.id, age(now(), NEW.created_at);
    RETURN NEW;
  END IF;
  RETURN public.enqueue_print_job();
END $$;

DROP TRIGGER IF EXISTS orders_enqueue_print_job ON public.orders;
CREATE TRIGGER orders_enqueue_print_job
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.enqueue_print_job_guarded();

DO $$
DECLARE n integer; oldest timestamptz;
BEGIN
  SELECT count(*), min(created_at) INTO n, oldest
    FROM public.print_jobs WHERE status = 'pending';
  RAISE NOTICE 'PROBE: % ticket(s) still queued, oldest raised %', n, oldest;
END $$;
