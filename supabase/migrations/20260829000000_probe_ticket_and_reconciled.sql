-- READ-ONLY forensic probe. Deletes nothing, changes nothing. Reports via
-- RAISE NOTICE because these tables are not readable with the anon key.
--
-- Two questions:
--   1. Why does order 96b0f519 have 7 print jobs, all printed?
--   2. What is the full timeline of the 3 orders the reconciler repaired?
--
-- Deliberately selects no customer names, phones, emails or addresses.

DO $$
DECLARE
  r record;
  n integer;
BEGIN
  RAISE NOTICE '=== ORDER 96b0f519: print job timeline ===';
  FOR r IN
    SELECT pj.id, pj.status, pj.created_at, pj.printed_at
      FROM public.print_jobs pj
     WHERE pj.order_id = '96b0f519-bbaf-49f8-9236-1f1460316bde'
     ORDER BY pj.created_at
  LOOP
    RAISE NOTICE '  job % status=% created=% printed=%',
      left(r.id::text, 8), r.status, r.created_at, r.printed_at;
  END LOOP;

  RAISE NOTICE '=== ORDER 96b0f519: order facts ===';
  FOR r IN
    SELECT o.created_at, o.status, o.payment_status, o.fulfillment,
           o.total, o.paid_amount_cents,
           (o.user_id IS NOT NULL) AS has_account,
           (o.stripe_payment_intent IS NOT NULL) AS has_intent,
           (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS n_items
      FROM public.orders o
     WHERE o.id = '96b0f519-bbaf-49f8-9236-1f1460316bde'
  LOOP
    RAISE NOTICE '  created=% status=% payment=% fulfil=% total=% paid_cents=% account=% intent=% items=%',
      r.created_at, r.status, r.payment_status, r.fulfillment,
      r.total, r.paid_amount_cents, r.has_account, r.has_intent, r.n_items;
  END LOOP;

  -- Does anything OTHER than the paid-transition trigger create print jobs?
  RAISE NOTICE '=== triggers currently on orders ===';
  FOR r IN
    SELECT tgname, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
     ORDER BY tgname
  LOOP
    RAISE NOTICE '  % => %', r.tgname, regexp_replace(r.def, '^.*ON ', 'ON ');
  END LOOP;

  RAISE NOTICE '=== how widespread is ticket duplication? ===';
  SELECT count(*) INTO n FROM (
    SELECT order_id FROM public.print_jobs
     WHERE order_id IS NOT NULL GROUP BY order_id HAVING count(*) > 1
  ) d;
  RAISE NOTICE '  orders with >1 print job: %', n;
  SELECT count(*) INTO n FROM public.print_jobs;
  RAISE NOTICE '  total print jobs on record: %', n;

  RAISE NOTICE '=== RECONCILED ORDERS: paid but with no ticket, or odd timing ===';
  FOR r IN
    SELECT o.id, o.created_at, o.payment_status, o.status,
           o.paid_amount_cents, o.total,
           (o.user_id IS NOT NULL) AS has_account,
           (SELECT min(pj.created_at) FROM public.print_jobs pj WHERE pj.order_id = o.id) AS first_ticket,
           (SELECT count(*) FROM public.print_jobs pj WHERE pj.order_id = o.id) AS n_tickets
      FROM public.orders o
     WHERE o.payment_status = 'paid'
       AND o.paid_amount_cents IS NOT NULL
       AND o.created_at > now() - interval '30 days'
     ORDER BY o.created_at DESC
     LIMIT 12
  LOOP
    RAISE NOTICE '  order=% created=% status=% paid_cents=% total=% tickets=% first_ticket=% account=%',
      left(r.id::text, 8), r.created_at, r.status, r.paid_amount_cents,
      r.total, r.n_tickets, r.first_ticket, r.has_account;
  END LOOP;
END $$;
