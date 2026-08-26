-- Removes the order created while proving that a customer can no longer
-- fabricate a paid order. It was inserted with payment_status='paid',
-- points_earned=10000 and paid_amount_cents=1000000; the database overrode all
-- three, so it has been sitting inert as an unpaid $10,000 pending row.
DELETE FROM public.order_items WHERE order_id = '19203fea-f077-4e34-8e1f-536df1e5eaed';
DELETE FROM public.orders      WHERE id       = '19203fea-f077-4e34-8e1f-536df1e5eaed';
