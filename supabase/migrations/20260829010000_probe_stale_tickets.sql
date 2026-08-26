-- READ-ONLY. The reconciler flipped three long-pending orders to paid, which
-- fired the paid-transition trigger and enqueued kitchen tickets for orders
-- that may be weeks old. This reports exactly which tickets that produced and
-- whether they reached the printer. Deletes nothing.

DO $$
DECLARE r record; n integer;
BEGIN
  RAISE NOTICE '=== print jobs created in the last 3 days, with order age ===';
  FOR r IN
    SELECT pj.id, pj.status, pj.created_at AS job_created, pj.printed_at,
           o.id AS order_id, o.created_at AS order_created, o.status AS order_status,
           o.payment_status, o.total,
           round(extract(epoch FROM (pj.created_at - o.created_at)) / 86400.0, 1) AS age_days
      FROM public.print_jobs pj
      JOIN public.orders o ON o.id = pj.order_id
     WHERE pj.created_at > now() - interval '3 days'
     ORDER BY pj.created_at
  LOOP
    RAISE NOTICE '  job=% status=% job_created=% | order=% placed=% (% days earlier) order_status=% total=% printed=%',
      left(r.id::text, 8), r.status, r.job_created,
      left(r.order_id::text, 8), r.order_created, r.age_days,
      r.order_status, r.total, r.printed_at;
  END LOOP;

  SELECT count(*) INTO n
    FROM public.print_jobs pj JOIN public.orders o ON o.id = pj.order_id
   WHERE pj.created_at > now() - interval '3 days'
     AND pj.created_at - o.created_at > interval '2 hours';
  RAISE NOTICE '  >> tickets raised for orders older than 2h: %', n;

  SELECT count(*) INTO n
    FROM public.print_jobs pj JOIN public.orders o ON o.id = pj.order_id
   WHERE pj.created_at > now() - interval '3 days'
     AND pj.created_at - o.created_at > interval '2 hours'
     AND pj.status IS DISTINCT FROM 'printed';
  RAISE NOTICE '  >> of those, still UNPRINTED (would still hit the printer): %', n;
END $$;
