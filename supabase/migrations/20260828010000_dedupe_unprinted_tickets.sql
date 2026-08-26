-- One order was found holding more than one print job. Likely cause: today's
-- change moved ticket printing from "on insert" to "on the pending -> paid
-- transition" (20260827010000). An order inserted under the old rule already
-- had a job; when the reconciler later flipped it to paid, the new rule
-- enqueued a second one. The kitchen would print the same order twice.
--
-- This reports what is actually there and removes only duplicates that have
-- NOT yet printed — a job already sent to the printer is left alone, because
-- deleting it would not un-print the paper and would only lose the record.

DO $$
DECLARE
  r            record;
  total_dupes  integer := 0;
  removed      integer := 0;
  had_printed  integer := 0;
BEGIN
  FOR r IN
    SELECT order_id, count(*) AS n,
           count(*) FILTER (WHERE status = 'printed') AS printed_n
      FROM public.print_jobs
     WHERE order_id IS NOT NULL
     GROUP BY order_id
    HAVING count(*) > 1
  LOOP
    total_dupes := total_dupes + 1;
    RAISE NOTICE 'PROBE: order % has % print jobs (% already printed)',
      r.order_id, r.n, r.printed_n;
    IF r.printed_n > 1 THEN
      had_printed := had_printed + 1;
      RAISE NOTICE 'PROBE:   ^ MORE THAN ONE ALREADY PRINTED — the kitchen may have made this twice';
    END IF;
  END LOOP;

  -- Drop surplus jobs that have not printed, keeping the earliest per order.
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn
      FROM public.print_jobs
     WHERE order_id IS NOT NULL
       AND order_id IN (
         SELECT order_id FROM public.print_jobs
          WHERE order_id IS NOT NULL
          GROUP BY order_id HAVING count(*) > 1
       )
  )
  DELETE FROM public.print_jobs pj
   USING ranked k
   WHERE pj.id = k.id
     AND k.rn > 1
     AND pj.status IS DISTINCT FROM 'printed';

  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'PROBE: % orders had duplicate jobs; % unprinted duplicates removed; % orders printed more than once',
    total_dupes, removed, had_printed;
END $$;
