-- READ-ONLY. The three orders the reconciler flipped from pending to paid on
-- 2026-08-25 23:00. Reports enough to reconcile them against Stripe and the
-- kitchen, without dumping phone numbers or addresses.
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN
    SELECT o.id, o.created_at, o.status, o.payment_status, o.source,
           o.total, o.paid_amount_cents, o.fulfillment,
           right(o.stripe_payment_intent, 12) AS pi_tail,
           (o.user_id IS NOT NULL) AS has_account,
           left(coalesce(o.guest_name,'(account holder)'), 18) AS who
      FROM public.orders o
      JOIN public.print_jobs pj ON pj.order_id = o.id
     WHERE pj.created_at::date = DATE '2026-08-25'
       AND pj.created_at - o.created_at > interval '2 hours'
     ORDER BY o.created_at
  LOOP
    RAISE NOTICE '--- order % ---', left(r.id::text,8);
    RAISE NOTICE '  placed        : %  (% )', r.created_at, r.source;
    RAISE NOTICE '  amount        : $%   paid_cents=%', r.total, coalesce(r.paid_amount_cents::text,'not recorded');
    RAISE NOTICE '  payment/status: % / %', r.payment_status, r.status;
    RAISE NOTICE '  stripe intent : ...%', r.pi_tail;
    RAISE NOTICE '  customer      : %  (account=%)', r.who, r.has_account;
    SELECT count(*) INTO n FROM public.order_items oi WHERE oi.order_id = r.id;
    RAISE NOTICE '  items         : %', n;
  END LOOP;
END $$;
