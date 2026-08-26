-- Orders created while proving that 20 simultaneous create-web-order calls
-- cannot produce 20 PaymentIntents. All are unpaid pending rows with no
-- kitchen ticket (the paid-transition trigger never fired for them).
DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders
   WHERE guest_name LIKE 'Concurrency Test%' OR guest_name LIKE 'Conc %'
      OR guest_name LIKE 'Diag %' OR guest_name LIKE 'Diag2 %'
      OR guest_name LIKE 'Sanity %'
);
DELETE FROM public.orders
 WHERE guest_name LIKE 'Concurrency Test%' OR guest_name LIKE 'Conc %'
    OR guest_name LIKE 'Diag %' OR guest_name LIKE 'Diag2 %'
    OR guest_name LIKE 'Sanity %';
