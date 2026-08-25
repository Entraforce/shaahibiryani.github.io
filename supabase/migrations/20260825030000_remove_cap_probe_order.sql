-- Final cap-verification order (1 full + 3 half trays), created to confirm the
-- accept path still prices correctly after the tray ceilings went in. Unpaid,
-- no card attached.
DELETE FROM public.order_items WHERE order_id = 'c5944c74-5f27-4582-a6d3-8e546d6ba2b1';
DELETE FROM public.orders      WHERE id       = 'c5944c74-5f27-4582-a6d3-8e546d6ba2b1';
