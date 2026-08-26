-- Removes rows created while proving the checkout-attempt architecture:
-- concurrency, retry convergence and intentional re-purchase. All are unpaid
-- or fixture rows; their kitchen tickets (if any) go with them.
DELETE FROM public.print_jobs WHERE order_id IN (
  SELECT id FROM public.orders
   WHERE guest_name IN ('Reorder Test','Reorder2','Trigger Repair Probe')
      OR guest_name LIKE 'Atomic %' OR guest_name LIKE 'Why %'
);
DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders
   WHERE guest_name IN ('Reorder Test','Reorder2','Trigger Repair Probe')
      OR guest_name LIKE 'Atomic %' OR guest_name LIKE 'Why %'
);
DELETE FROM public.checkout_attempts WHERE order_id IN (
  SELECT id FROM public.orders
   WHERE guest_name IN ('Reorder Test','Reorder2','Trigger Repair Probe')
      OR guest_name LIKE 'Atomic %' OR guest_name LIKE 'Why %'
);
DELETE FROM public.orders
 WHERE guest_name IN ('Reorder Test','Reorder2','Trigger Repair Probe')
    OR guest_name LIKE 'Atomic %' OR guest_name LIKE 'Why %';
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.checkout_attempts;
  RAISE NOTICE 'checkout_attempts remaining: %', n;
END $$;
